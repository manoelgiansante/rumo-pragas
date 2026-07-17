const mockSecureValues = new Map<string, string>();
const mockSecureWriteOrder: string[] = [];
const mockSecureGet = jest.fn();
const mockSecureSet = jest.fn();
const mockSecureDelete = jest.fn();
const mockStartAutoRefresh = jest.fn();
const mockStopAutoRefresh = jest.fn();
const mockAppStateListeners = new Set<(state: 'active' | 'background' | 'inactive') => void>();
const mockAddAppStateListener = jest.fn(
  (_event: string, listener: (state: 'active' | 'background' | 'inactive') => void) => {
    mockAppStateListeners.add(listener);
    return { remove: jest.fn(() => mockAppStateListeners.delete(listener)) };
  },
);

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      startAutoRefresh: (...args: unknown[]) => mockStartAutoRefresh(...args),
      stopAutoRefresh: (...args: unknown[]) => mockStopAutoRefresh(...args),
    },
  })),
  processLock: jest.fn(),
}));
jest.mock('react-native-url-polyfill/auto', () => ({}));
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: {
    currentState: 'active',
    addEventListener: (...args: Parameters<typeof mockAddAppStateListener>) =>
      mockAddAppStateListener(...args),
  },
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: (...args: unknown[]) => mockSecureGet(...args),
  setItemAsync: (...args: unknown[]) => mockSecureSet(...args),
  deleteItemAsync: (...args: unknown[]) => mockSecureDelete(...args),
}));
jest.mock('../../constants/config', () => ({
  Config: { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: 'anon' },
}));

import {
  createAuthStorageAdapter,
  NATIVE_AUTH_STORAGE_CHUNK_BYTES,
  retainSupabaseAuthAutoRefresh,
} from '../../services/supabase';
import { createClient, processLock } from '@supabase/supabase-js';

const initialAuthOptions = (
  (createClient as jest.Mock).mock.calls[0]![2] as { auth: Record<string, unknown> }
).auth;

function installSecureStoreMemory(): void {
  mockSecureGet.mockImplementation(async (key: string) => mockSecureValues.get(key) ?? null);
  mockSecureSet.mockImplementation(async (key: string, value: string) => {
    mockSecureWriteOrder.push(key);
    mockSecureValues.set(key, value);
  });
  mockSecureDelete.mockImplementation(async (key: string) => {
    mockSecureValues.delete(key);
  });
}

function makeWebStorage() {
  const values = new Map<string, string>();
  return {
    getItem: jest.fn((key: string) => values.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => values.set(key, value)),
    removeItem: jest.fn((key: string) => values.delete(key)),
  };
}

describe('Supabase auth native SecureStore storage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSecureValues.clear();
    mockSecureWriteOrder.splice(0);
    mockAppStateListeners.clear();
    installSecureStoreMemory();
  });

  it('configures the Supabase client with the cross-request process lock', () => {
    expect(initialAuthOptions.lock).toBe(processLock);
  });

  it('round-trips a >8KB session using <=1800-byte chunks and commits manifest last', async () => {
    const adapter = createAuthStorageAdapter('ios');
    const key = 'sb-project-auth-token';
    const value = JSON.stringify({
      access_token: 'a'.repeat(8_700),
      user: { name: 'João 🌱'.repeat(120) },
    });

    await adapter.setItem(key, value);

    expect(await adapter.getItem(key)).toBe(value);
    expect(mockSecureValues.has(key)).toBe(false);
    const chunkEntries = [...mockSecureValues.entries()].filter(
      ([storageKey]) => storageKey.includes('.secure.v1.') && !storageKey.endsWith('.manifest'),
    );
    expect(chunkEntries.length).toBeGreaterThan(4);
    for (const [, chunk] of chunkEntries) {
      expect(new TextEncoder().encode(chunk).byteLength).toBeLessThanOrEqual(
        NATIVE_AUTH_STORAGE_CHUNK_BYTES,
      );
    }
    const firstManifestWrite = mockSecureWriteOrder.findIndex((storageKey) =>
      storageKey.endsWith('.manifest'),
    );
    const lastChunkWrite = mockSecureWriteOrder.reduce(
      (latest, storageKey, index) =>
        storageKey.includes('.secure.v1.') && !storageKey.endsWith('.manifest') ? index : latest,
      -1,
    );
    expect(firstManifestWrite).toBeGreaterThan(lastChunkWrite);
  });

  it('migrates a readable legacy direct key only after the chunk manifest commits', async () => {
    const adapter = createAuthStorageAdapter('android');
    const key = 'sb-legacy-auth-token';
    mockSecureValues.set(key, 'legacy-session');

    await expect(adapter.getItem(key)).resolves.toBe('legacy-session');

    expect(mockSecureValues.has(key)).toBe(false);
    expect(
      [...mockSecureValues.keys()].some((storageKey) => storageKey.endsWith('.manifest')),
    ).toBe(true);
    await expect(adapter.getItem(key)).resolves.toBe('legacy-session');
  });

  it('keeps the prior generation readable when a new chunk write fails', async () => {
    const adapter = createAuthStorageAdapter('ios');
    const key = 'sb-atomic-auth-token';
    const oldValue = `old-${'a'.repeat(4_000)}`;
    await adapter.setItem(key, oldValue);

    let newChunkWrites = 0;
    mockSecureSet.mockImplementation(async (storageKey: string, value: string) => {
      if (
        storageKey.includes('.secure.v1.') &&
        !storageKey.endsWith('.manifest') &&
        !storageKey.endsWith('.pending')
      ) {
        newChunkWrites += 1;
        if (newChunkWrites === 2) throw new Error('keychain interrupted');
      }
      mockSecureValues.set(storageKey, value);
    });

    await expect(adapter.setItem(key, `new-${'b'.repeat(5_000)}`)).rejects.toThrow(
      'keychain interrupted',
    );
    installSecureStoreMemory();
    await expect(adapter.getItem(key)).resolves.toBe(oldValue);
  });

  it('cleans staged chunks left by process death before manifest commit', async () => {
    const adapter = createAuthStorageAdapter('ios');
    const key = 'sb-interrupted-auth-token';
    const descriptor = { generation: 'interrupted-generation', chunks: 2 };
    mockSecureValues.set(`${key}.rumopragas.secure.v1.pending`, JSON.stringify(descriptor));
    mockSecureValues.set(`${key}.rumopragas.secure.v1.${descriptor.generation}.0`, 'token-a');
    mockSecureValues.set(`${key}.rumopragas.secure.v1.${descriptor.generation}.1`, 'token-b');

    await expect(adapter.getItem(key)).resolves.toBeNull();

    expect(
      [...mockSecureValues.keys()].some((storageKey) => storageKey.startsWith(`${key}.`)),
    ).toBe(false);
  });

  it('rejects partial/corrupt chunk sets instead of returning malformed auth JSON', async () => {
    const adapter = createAuthStorageAdapter('ios');
    const key = 'sb-corrupt-auth-token';
    await adapter.setItem(key, `session-${'x'.repeat(4_000)}`);
    const chunkKey = [...mockSecureValues.keys()].find(
      (storageKey) => storageKey.includes('.secure.v1.') && !storageKey.endsWith('.manifest'),
    );
    expect(chunkKey).toBeDefined();
    mockSecureValues.set(chunkKey!, 'tampered');

    await expect(adapter.getItem(key)).resolves.toBeNull();
    expect(
      [...mockSecureValues.keys()].some((storageKey) => storageKey.endsWith('.manifest')),
    ).toBe(false);
  });

  it('serializes concurrent writes and remove so a removed session cannot reappear', async () => {
    const adapter = createAuthStorageAdapter('android');
    const key = 'sb-concurrent-auth-token';
    const first = `first-${'1'.repeat(3_000)}`;
    const second = `second-${'2'.repeat(3_500)}`;

    await Promise.all([adapter.setItem(key, first), adapter.setItem(key, second)]);
    await expect(adapter.getItem(key)).resolves.toBe(second);

    await Promise.all([adapter.setItem(key, 'last-session'), adapter.removeItem(key)]);
    await expect(adapter.getItem(key)).resolves.toBeNull();
  });

  it('preserves the manifest when chunk erasure fails and a retry removes everything', async () => {
    const adapter = createAuthStorageAdapter('ios');
    const key = 'sb-delete-retry-auth-token';
    await adapter.setItem(key, `session-${'z'.repeat(4_000)}`);
    const manifestKey = [...mockSecureValues.keys()].find((storageKey) =>
      storageKey.endsWith('.manifest'),
    )!;
    const failedChunkKey = [...mockSecureValues.keys()].find(
      (storageKey) => storageKey.includes('.secure.v1.') && !storageKey.endsWith('.manifest'),
    )!;
    let failedOnce = false;
    mockSecureDelete.mockImplementation(async (storageKey: string) => {
      if (storageKey === failedChunkKey && !failedOnce) {
        failedOnce = true;
        throw new Error('keychain busy');
      }
      mockSecureValues.delete(storageKey);
    });

    await expect(adapter.removeItem(key)).rejects.toThrow('AUTH_STORAGE_CHUNK_DELETE_FAILED');
    expect(mockSecureValues.has(manifestKey)).toBe(true);
    expect(mockSecureValues.has(failedChunkKey)).toBe(true);

    installSecureStoreMemory();
    await expect(adapter.removeItem(key)).resolves.toBeUndefined();
    expect(
      [...mockSecureValues.keys()].some((storageKey) => storageKey.startsWith(`${key}.`)),
    ).toBe(false);
  });

  it('keeps the manifest when corrupt-session cleanup fails instead of falling back', async () => {
    const adapter = createAuthStorageAdapter('ios');
    const key = 'sb-corrupt-delete-retry-token';
    await adapter.setItem(key, `session-${'q'.repeat(4_000)}`);
    const manifestKey = [...mockSecureValues.keys()].find((storageKey) =>
      storageKey.endsWith('.manifest'),
    )!;
    const failedChunkKey = [...mockSecureValues.keys()].find(
      (storageKey) => storageKey.includes('.secure.v1.') && !storageKey.endsWith('.manifest'),
    )!;
    mockSecureValues.set(failedChunkKey, 'tampered');
    mockSecureValues.set(key, 'legacy-must-not-reappear');
    let failedOnce = false;
    mockSecureDelete.mockImplementation(async (storageKey: string) => {
      if (storageKey === failedChunkKey && !failedOnce) {
        failedOnce = true;
        throw new Error('keychain busy');
      }
      mockSecureValues.delete(storageKey);
    });

    await expect(adapter.getItem(key)).resolves.toBeNull();
    expect(mockSecureValues.has(manifestKey)).toBe(true);
    expect(mockSecureValues.has(key)).toBe(false);

    installSecureStoreMemory();
    await expect(adapter.removeItem(key)).resolves.toBeUndefined();
    expect(mockSecureValues.size).toBe(0);
  });

  it('does not destroy the active generation when legacy-key erasure fails', async () => {
    const adapter = createAuthStorageAdapter('ios');
    const key = 'sb-legacy-delete-failure-token';
    const activeValue = `active-${'a'.repeat(3_000)}`;
    await adapter.setItem(key, activeValue);
    mockSecureValues.set(key, 'stale-legacy-session');
    const manifestKey = [...mockSecureValues.keys()].find((storageKey) =>
      storageKey.endsWith('.manifest'),
    )!;
    const chunkKeys = [...mockSecureValues.keys()].filter(
      (storageKey) => storageKey.includes('.secure.v1.') && !storageKey.endsWith('.manifest'),
    );
    mockSecureDelete.mockImplementation(async (storageKey: string) => {
      if (storageKey === key) throw new Error('legacy keychain busy');
      mockSecureValues.delete(storageKey);
    });

    await expect(adapter.removeItem(key)).rejects.toThrow('legacy keychain busy');
    expect(mockSecureValues.has(manifestKey)).toBe(true);
    chunkKeys.forEach((chunkKey) => expect(mockSecureValues.has(chunkKey)).toBe(true));

    installSecureStoreMemory();
    await expect(adapter.getItem(key)).resolves.toBe(activeValue);
    expect(mockSecureValues.has(key)).toBe(false);
    await adapter.removeItem(key);
    expect(mockSecureValues.size).toBe(0);
  });

  it('uses one ref-counted AppState listener and stops refresh after final release', () => {
    const releaseA = retainSupabaseAuthAutoRefresh();
    const releaseB = retainSupabaseAuthAutoRefresh();

    expect(mockAddAppStateListener).toHaveBeenCalledTimes(1);
    expect(mockStartAutoRefresh).toHaveBeenCalledTimes(1);
    const listener = [...mockAppStateListeners][0]!;
    listener('background');
    expect(mockStopAutoRefresh).toHaveBeenCalledTimes(1);
    listener('active');
    expect(mockStartAutoRefresh).toHaveBeenCalledTimes(2);

    releaseA();
    expect(mockAppStateListeners.size).toBe(1);
    releaseB();
    releaseB();
    expect(mockAppStateListeners.size).toBe(0);
    expect(mockStopAutoRefresh).toHaveBeenCalledTimes(2);
  });
});

describe('Supabase auth web storage', () => {
  it('persists set/get/remove through browser storage', () => {
    const storage = makeWebStorage();
    const adapter = createAuthStorageAdapter('web', storage);
    adapter.setItem('session', 'jwt-payload');
    expect(adapter.getItem('session')).toBe('jwt-payload');
    adapter.removeItem('session');
    expect(adapter.getItem('session')).toBeNull();
  });

  it('survives an adapter recreation like a web reload', () => {
    const storage = makeWebStorage();
    createAuthStorageAdapter('web', storage).setItem('session-reload', 'persisted');
    expect(createAuthStorageAdapter('web', storage).getItem('session-reload')).toBe('persisted');
  });

  it('does not resurrect a session removed externally by another browser tab', () => {
    const storage = makeWebStorage();
    const adapter = createAuthStorageAdapter('web', storage);
    adapter.setItem('session-external', 'persisted');
    storage.removeItem('session-external');

    expect(adapter.getItem('session-external')).toBeNull();
  });

  it('falls back safely when browser storage throws', () => {
    const unavailable = {
      getItem: jest.fn(() => {
        throw new Error('blocked');
      }),
      setItem: jest.fn(() => {
        throw new Error('blocked');
      }),
      removeItem: jest.fn(() => {
        throw new Error('blocked');
      }),
    };
    const adapter = createAuthStorageAdapter('web', unavailable);
    adapter.setItem('session-private', 'runtime-only');
    expect(adapter.getItem('session-private')).toBe('runtime-only');
    expect(() => adapter.removeItem('session-private')).toThrow('blocked');
    expect(adapter.getItem('session-private')).toBe('runtime-only');
  });

  it('removes runtime-only storage when persistent browser storage is unavailable', () => {
    const adapter = createAuthStorageAdapter('web', null);
    adapter.setItem('session-memory-only', 'runtime-only');
    adapter.removeItem('session-memory-only');
    expect(adapter.getItem('session-memory-only')).toBeNull();
  });
});
