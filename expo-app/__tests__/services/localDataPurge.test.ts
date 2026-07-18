const mockPurgeQueues = jest.fn();
const mockPurgeAllQueues = jest.fn();
const mockResumeQueueCleanup = jest.fn();
const mockPrepareQueueOwner = jest.fn();
const mockRevokeConsent = jest.fn();
const mockClearChat = jest.fn();
const mockPrepareChatOwner = jest.fn();
const mockClearPending = jest.fn();
const mockPreparePendingOwner = jest.fn();
const mockSecureValues = new Map<string, string>();
const mockSecureGet = jest.fn();
const mockSecureSet = jest.fn();
const mockSecureDelete = jest.fn();

jest.mock('../../services/diagnosisQueue', () => ({
  purgeDiagnosisQueuesForUser: (...args: unknown[]) => mockPurgeQueues(...args),
  purgeAllDiagnosisQueueData: (...args: unknown[]) => mockPurgeAllQueues(...args),
  resumePendingDiagnosisQueueCleanup: (...args: unknown[]) => mockResumeQueueCleanup(...args),
  prepareDiagnosisQueueForOwnerClaim: (...args: unknown[]) => mockPrepareQueueOwner(...args),
}));
jest.mock('../../services/aiConsent', () => ({
  revokeAIConsent: (...args: unknown[]) => mockRevokeConsent(...args),
}));
jest.mock('../../services/chatHistory', () => ({
  clearChatHistory: (...args: unknown[]) => mockClearChat(...args),
  prepareChatHistoryForOwnerClaim: (...args: unknown[]) => mockPrepareChatOwner(...args),
}));
jest.mock('../../services/userPreferences', () => ({
  clearPendingLocationConsent: (...args: unknown[]) => mockClearPending(...args),
  preparePendingLocationConsentOwnerClaim: (...args: unknown[]) => mockPreparePendingOwner(...args),
}));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: (...args: unknown[]) => mockSecureGet(...args),
  setItemAsync: (...args: unknown[]) => mockSecureSet(...args),
  deleteItemAsync: (...args: unknown[]) => mockSecureDelete(...args),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  claimPragasLocalDataOwner,
  clearPragasLocalDataOwner,
  PRAGAS_LOCAL_DATA_OWNER_SECURE_KEY,
  purgePragasLocalUserData,
} from '../../services/localDataPurge';

const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const asyncValues = new Map<string, string>();

function ownerPayload(userId: string): string {
  return JSON.stringify({ version: 1, userId });
}

describe('Pragas local data purge and persisted owner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asyncValues.clear();
    mockSecureValues.clear();
    mockPurgeQueues.mockResolvedValue(undefined);
    mockPurgeAllQueues.mockResolvedValue(undefined);
    mockResumeQueueCleanup.mockResolvedValue(undefined);
    mockPrepareQueueOwner.mockResolvedValue(undefined);
    mockRevokeConsent.mockResolvedValue(undefined);
    mockClearChat.mockResolvedValue(undefined);
    mockPrepareChatOwner.mockResolvedValue(undefined);
    mockClearPending.mockResolvedValue(undefined);
    mockPreparePendingOwner.mockResolvedValue(undefined);
    mockSecureGet.mockImplementation(async (key: string) => mockSecureValues.get(key) ?? null);
    mockSecureSet.mockImplementation(async (key: string, value: string) => {
      mockSecureValues.set(key, value);
    });
    mockSecureDelete.mockImplementation(async (key: string) => {
      mockSecureValues.delete(key);
    });
    storage.getItem.mockImplementation(async (key) => asyncValues.get(key) ?? null);
    storage.setItem.mockImplementation(async (key, value) => {
      asyncValues.set(key, value);
    });
    storage.removeItem.mockImplementation(async (key) => {
      asyncValues.delete(key);
    });
    storage.getAllKeys.mockImplementation(async () => [...asyncValues.keys()]);
    storage.multiRemove.mockImplementation(async (keys) => {
      keys.forEach((key) => asyncValues.delete(key));
    });
  });

  it('purges only Pragas local data for the authenticated owner', async () => {
    asyncValues.set('@rumopragas/pest-cache/rust', 'cache');
    asyncValues.set('@rumo_pragas_location_consent_shown:user-1', 'true');
    asyncValues.set('@unrelated_other_app', 'keep');

    await purgePragasLocalUserData('user-1');

    expect(mockPurgeQueues).toHaveBeenCalledWith('user-1');
    expect(mockRevokeConsent).toHaveBeenCalledWith('user-1');
    expect(mockClearChat).toHaveBeenCalledWith('user-1');
    const removed = storage.multiRemove.mock.calls[0]![0];
    expect(removed).toContain('@rumopragas/pest-cache/rust');
    expect(removed).not.toContain('@unrelated_other_app');
  });

  it('fails closed before claiming success when a purge operation fails', async () => {
    mockPurgeQueues.mockRejectedValueOnce(new Error('file busy'));
    await expect(purgePragasLocalUserData('user-1')).rejects.toThrow('file busy');
    expect(storage.multiRemove).not.toHaveBeenCalled();
  });

  it('reads the encrypted owner after restart and preserves the same-account offline queue', async () => {
    mockSecureValues.set(PRAGAS_LOCAL_DATA_OWNER_SECURE_KEY, ownerPayload(USER_A));
    asyncValues.set('@rumopragas/diagnosis-queue:v2', 'offline-a');

    await claimPragasLocalDataOwner(USER_A);

    expect(mockPurgeQueues).not.toHaveBeenCalled();
    expect(storage.multiRemove).not.toHaveBeenCalled();
    expect(mockPrepareQueueOwner).toHaveBeenCalledWith(USER_A, {
      claimOwnerlessLegacy: false,
    });
    expect(mockPrepareChatOwner).toHaveBeenCalledWith(USER_A, {
      claimOwnerlessLegacy: false,
    });
    expect(asyncValues.get('@rumopragas/diagnosis-queue:v2')).toBe('offline-a');
  });

  it('persisted cold-boot owner atomically claims valid ownerless queue and chat', async () => {
    await claimPragasLocalDataOwner(USER_A, { claimOwnerlessLegacy: true });

    expect(mockPrepareQueueOwner).toHaveBeenCalledWith(USER_A, {
      claimOwnerlessLegacy: true,
    });
    expect(mockPrepareChatOwner).toHaveBeenCalledWith(USER_A, {
      claimOwnerlessLegacy: true,
    });
    expect(mockPreparePendingOwner).toHaveBeenCalledWith(USER_A);
    expect(mockSecureValues.get(PRAGAS_LOCAL_DATA_OWNER_SECURE_KEY)).toBe(ownerPayload(USER_A));
    expect(mockSecureSet.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockPrepareQueueOwner.mock.invocationCallOrder[0]!,
    );
    expect(mockSecureSet.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockPrepareChatOwner.mock.invocationCallOrder[0]!,
    );
  });

  it('interactive first login without a marker discards instead of adopting legacy data', async () => {
    await claimPragasLocalDataOwner(USER_B);

    expect(mockPrepareQueueOwner).toHaveBeenCalledWith(USER_B, {
      claimOwnerlessLegacy: false,
    });
    expect(mockPrepareChatOwner).toHaveBeenCalledWith(USER_B, {
      claimOwnerlessLegacy: false,
    });
    expect(mockSecureValues.get(PRAGAS_LOCAL_DATA_OWNER_SECURE_KEY)).toBe(ownerPayload(USER_B));
  });

  it('purges A before atomically replacing the marker with account B', async () => {
    mockSecureValues.set(PRAGAS_LOCAL_DATA_OWNER_SECURE_KEY, ownerPayload(USER_A));

    await claimPragasLocalDataOwner(USER_B);

    expect(mockPurgeQueues).toHaveBeenCalledWith(USER_A);
    expect(mockClearPending).toHaveBeenCalledWith(USER_A);
    expect(mockPrepareQueueOwner).toHaveBeenCalledWith(USER_B, {
      claimOwnerlessLegacy: false,
    });
    expect(mockPrepareChatOwner).toHaveBeenCalledWith(USER_B, {
      claimOwnerlessLegacy: false,
    });
    expect(mockSecureValues.get(PRAGAS_LOCAL_DATA_OWNER_SECURE_KEY)).toBe(ownerPayload(USER_B));
    expect(mockSecureSet.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockPurgeQueues.mock.invocationCallOrder[0]!,
    );
  });

  it('blocks session admission when a legacy migration cannot persist', async () => {
    mockPrepareChatOwner.mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(claimPragasLocalDataOwner(USER_A)).rejects.toThrow('storage unavailable');
    expect(mockSecureSet).not.toHaveBeenCalled();
    expect(mockSecureValues.has(PRAGAS_LOCAL_DATA_OWNER_SECURE_KEY)).toBe(false);
  });

  it('blocks owner admission when pending-location owner hygiene cannot persist', async () => {
    mockPreparePendingOwner.mockRejectedValueOnce(new Error('pending consent storage unavailable'));

    await expect(claimPragasLocalDataOwner(USER_A)).rejects.toThrow(
      'pending consent storage unavailable',
    );
    expect(mockPrepareQueueOwner).not.toHaveBeenCalled();
    expect(mockSecureSet).not.toHaveBeenCalled();
  });

  it('retains A across purge failure/restart so B remains blocked and can retry safely', async () => {
    mockSecureValues.set(PRAGAS_LOCAL_DATA_OWNER_SECURE_KEY, ownerPayload(USER_A));
    mockPurgeQueues.mockRejectedValueOnce(new Error('locked photo'));

    await expect(claimPragasLocalDataOwner(USER_B)).rejects.toThrow('locked photo');
    expect(mockSecureValues.get(PRAGAS_LOCAL_DATA_OWNER_SECURE_KEY)).toBe(ownerPayload(USER_A));
    expect(mockSecureSet).not.toHaveBeenCalled();

    await expect(claimPragasLocalDataOwner(USER_B)).resolves.toBeUndefined();
    expect(mockSecureValues.get(PRAGAS_LOCAL_DATA_OWNER_SECURE_KEY)).toBe(ownerPayload(USER_B));
  });

  it('strictly purges all Pragas data before recovering a corrupt owner marker', async () => {
    mockSecureValues.set(PRAGAS_LOCAL_DATA_OWNER_SECURE_KEY, '{corrupt');
    asyncValues.set('@rumo_pragas_chat_history:foreign', 'personal');
    asyncValues.set('@rumopragas/pest-cache/rust', 'cache');
    asyncValues.set('@unrelated_other_app', 'keep');

    await expect(
      claimPragasLocalDataOwner(USER_B, { claimOwnerlessLegacy: true }),
    ).resolves.toBeUndefined();

    expect(mockPurgeAllQueues).toHaveBeenCalledTimes(1);
    expect(asyncValues.has('@rumo_pragas_chat_history:foreign')).toBe(false);
    expect(asyncValues.has('@rumopragas/pest-cache/rust')).toBe(false);
    expect(asyncValues.get('@unrelated_other_app')).toBe('keep');
    expect(mockPrepareQueueOwner).toHaveBeenCalledWith(USER_B, {
      claimOwnerlessLegacy: false,
    });
    expect(mockPrepareChatOwner).toHaveBeenCalledWith(USER_B, {
      claimOwnerlessLegacy: false,
    });
    expect(mockSecureValues.get(PRAGAS_LOCAL_DATA_OWNER_SECURE_KEY)).toBe(ownerPayload(USER_B));
  });

  it('keeps a corrupt marker fail-closed when strict recovery cannot finish', async () => {
    mockSecureValues.set(PRAGAS_LOCAL_DATA_OWNER_SECURE_KEY, '{corrupt');
    mockPurgeAllQueues.mockRejectedValueOnce(new Error('directory busy'));

    await expect(claimPragasLocalDataOwner(USER_B)).rejects.toThrow('directory busy');
    expect(mockSecureValues.get(PRAGAS_LOCAL_DATA_OWNER_SECURE_KEY)).toBe('{corrupt');
    expect(mockSecureDelete).not.toHaveBeenCalled();
    expect(mockPrepareQueueOwner).not.toHaveBeenCalled();
    expect(mockSecureSet).not.toHaveBeenCalled();
  });

  it('treats a Keychain read failure as unknown ownership and never admits B', async () => {
    mockSecureValues.set(PRAGAS_LOCAL_DATA_OWNER_SECURE_KEY, ownerPayload(USER_A));
    mockSecureGet.mockRejectedValueOnce(new Error('keychain unavailable'));

    await expect(claimPragasLocalDataOwner(USER_B)).rejects.toThrow('keychain unavailable');
    expect(mockPurgeQueues).not.toHaveBeenCalled();
    expect(mockSecureSet).not.toHaveBeenCalled();
    expect(mockSecureValues.get(PRAGAS_LOCAL_DATA_OWNER_SECURE_KEY)).toBe(ownerPayload(USER_A));
  });

  it('clears only the expected owner after explicit sign-out', async () => {
    mockSecureValues.set(PRAGAS_LOCAL_DATA_OWNER_SECURE_KEY, ownerPayload(USER_A));
    await expect(clearPragasLocalDataOwner(USER_B)).rejects.toThrow('LOCAL_DATA_OWNER_MISMATCH');
    expect(mockSecureValues.has(PRAGAS_LOCAL_DATA_OWNER_SECURE_KEY)).toBe(true);

    await clearPragasLocalDataOwner(USER_A);
    expect(mockSecureValues.has(PRAGAS_LOCAL_DATA_OWNER_SECURE_KEY)).toBe(false);
  });

  it('serializes marker-free claim, sign-out purge and marker clear without leaving adopted data', async () => {
    let releaseClaim!: () => void;
    mockPrepareQueueOwner.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseClaim = resolve;
        }),
    );

    const claim = claimPragasLocalDataOwner(USER_A, { claimOwnerlessLegacy: true });
    for (let attempt = 0; attempt < 10 && !mockPrepareQueueOwner.mock.calls.length; attempt += 1) {
      await Promise.resolve();
    }
    expect(mockPrepareQueueOwner).toHaveBeenCalled();

    const purge = purgePragasLocalUserData(USER_A);
    await Promise.resolve();
    expect(mockPurgeQueues).not.toHaveBeenCalled();

    releaseClaim();
    await claim;
    await purge;
    await clearPragasLocalDataOwner(USER_A);

    expect(mockSecureSet.mock.invocationCallOrder[0]).toBeLessThan(
      mockPurgeQueues.mock.invocationCallOrder[0]!,
    );
    expect(mockSecureValues.has(PRAGAS_LOCAL_DATA_OWNER_SECURE_KEY)).toBe(false);
  });

  it('holds an account switch behind an incomplete cleanup journal purge', async () => {
    mockSecureValues.set(PRAGAS_LOCAL_DATA_OWNER_SECURE_KEY, ownerPayload(USER_A));
    let releaseJournal!: () => void;
    mockResumeQueueCleanup.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseJournal = resolve;
        }),
    );

    const purge = purgePragasLocalUserData(USER_A);
    for (let attempt = 0; attempt < 10 && !mockResumeQueueCleanup.mock.calls.length; attempt += 1) {
      await Promise.resolve();
    }
    expect(mockResumeQueueCleanup).toHaveBeenCalled();
    const switchOwner = claimPragasLocalDataOwner(USER_B);
    await Promise.resolve();
    expect(mockPrepareQueueOwner).not.toHaveBeenCalled();

    releaseJournal();
    await purge;
    await switchOwner;

    expect(mockPurgeQueues.mock.invocationCallOrder[0]).toBeLessThan(
      mockPrepareQueueOwner.mock.invocationCallOrder[0]!,
    );
    expect(mockSecureValues.get(PRAGAS_LOCAL_DATA_OWNER_SECURE_KEY)).toBe(ownerPayload(USER_B));
  });

  it('removes stray foreign scoped data on same-owner resume while preserving current data', async () => {
    const current = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    mockSecureValues.set(PRAGAS_LOCAL_DATA_OWNER_SECURE_KEY, ownerPayload(current));
    asyncValues.set(`@rumo_pragas_ai_consent:${current}`, 'keep-a');
    asyncValues.set(`@rumo_pragas_ai_consent:${USER_B}`, 'remove-b');
    asyncValues.set('@rumo_pragas_chat_history:not-a-uuid', 'remove-invalid');
    asyncValues.set(`@rumo_pragas_ai_consent:${current}:stale`, 'remove-suffix');
    asyncValues.set(`@rumo_pragas_ai_consent:${current.toUpperCase()}`, 'remove-uppercase');
    asyncValues.set(`@rumo_pragas_ai_revoked:${current}:evil`, 'remove-purpose');
    asyncValues.set(`@rumo_pragas_ai_revoked:${current}:chat`, 'keep-chat-revocation');
    asyncValues.set(
      `@rumopragas/pending_location_consent:v2:${current}:44444444-4444-4444-8444-444444444444`,
      'keep-for-helper-validation',
    );
    asyncValues.set(
      `@rumopragas/pending_location_consent:v2:${USER_B}:55555555-5555-4555-8555-555555555555`,
      'remove-foreign-decision',
    );

    await claimPragasLocalDataOwner(current);

    expect(asyncValues.get(`@rumo_pragas_ai_consent:${current}`)).toBe('keep-a');
    expect(asyncValues.has(`@rumo_pragas_ai_consent:${USER_B}`)).toBe(false);
    expect(asyncValues.has('@rumo_pragas_chat_history:not-a-uuid')).toBe(false);
    expect(asyncValues.has(`@rumo_pragas_ai_consent:${current}:stale`)).toBe(false);
    expect(asyncValues.has(`@rumo_pragas_ai_consent:${current.toUpperCase()}`)).toBe(false);
    expect(asyncValues.has(`@rumo_pragas_ai_revoked:${current}:evil`)).toBe(false);
    expect(asyncValues.get(`@rumo_pragas_ai_revoked:${current}:chat`)).toBe('keep-chat-revocation');
    expect(
      asyncValues.get(
        `@rumopragas/pending_location_consent:v2:${current}:44444444-4444-4444-8444-444444444444`,
      ),
    ).toBe('keep-for-helper-validation');
    expect(
      asyncValues.has(
        `@rumopragas/pending_location_consent:v2:${USER_B}:55555555-5555-4555-8555-555555555555`,
      ),
    ).toBe(false);
  });

  it('removes previous and third-party scoped data on switch while preserving B', async () => {
    const USER_C = '33333333-3333-4333-8333-333333333333';
    mockSecureValues.set(PRAGAS_LOCAL_DATA_OWNER_SECURE_KEY, ownerPayload(USER_A));
    asyncValues.set(`@rumo_pragas_chat_history:${USER_A}`, 'remove-a');
    asyncValues.set(`@rumo_pragas_chat_history:${USER_B}`, 'keep-b');
    asyncValues.set(`@rumo_pragas_chat_history:${USER_C}`, 'remove-c');

    await claimPragasLocalDataOwner(USER_B);

    expect(asyncValues.has(`@rumo_pragas_chat_history:${USER_A}`)).toBe(false);
    expect(asyncValues.get(`@rumo_pragas_chat_history:${USER_B}`)).toBe('keep-b');
    expect(asyncValues.has(`@rumo_pragas_chat_history:${USER_C}`)).toBe(false);
  });
});
