import 'react-native-url-polyfill/auto';
import { createClient, processLock } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { Config } from '../constants/config';

interface WebStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const NATIVE_AUTH_STORAGE_VERSION = 1;
export const NATIVE_AUTH_STORAGE_CHUNK_BYTES = 1_800;
const MAX_NATIVE_AUTH_CHUNKS = 256;
const MAX_STALE_GENERATIONS = 16;
const NATIVE_MANIFEST_SUFFIX = '.rumopragas.secure.v1.manifest';
const NATIVE_PENDING_SUFFIX = '.rumopragas.secure.v1.pending';

interface ChunkDescriptor {
  generation: string;
  chunks: number;
}

interface NativeAuthManifest extends ChunkDescriptor {
  version: typeof NATIVE_AUTH_STORAGE_VERSION;
  byteLength: number;
  checksum: string;
  stale?: ChunkDescriptor[];
}

const nativeStorageLocks = new Map<string, Promise<void>>();
let nativeGenerationSequence = 0;

function nativeManifestKey(key: string): string {
  return `${key}${NATIVE_MANIFEST_SUFFIX}`;
}

function nativePendingKey(key: string): string {
  return `${key}${NATIVE_PENDING_SUFFIX}`;
}

function nativeChunkKey(key: string, descriptor: ChunkDescriptor, index: number): string {
  return `${key}.rumopragas.secure.v1.${descriptor.generation}.${index}`;
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else bytes += 3;
  }
  return bytes;
}

function splitNativeAuthValue(value: string): string[] {
  const chunks: string[] = [];
  let chunk = '';
  let chunkBytes = 0;

  for (const symbol of value) {
    const symbolBytes = utf8ByteLength(symbol);
    if (chunk && chunkBytes + symbolBytes > NATIVE_AUTH_STORAGE_CHUNK_BYTES) {
      chunks.push(chunk);
      chunk = '';
      chunkBytes = 0;
    }
    chunk += symbol;
    chunkBytes += symbolBytes;
  }
  chunks.push(chunk);
  return chunks;
}

// SecureStore already supplies confidentiality/integrity. This small checksum
// detects incomplete or internally inconsistent chunk sets before auth-js sees
// malformed JSON; it is not used as a cryptographic primitive.
function storageChecksum(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function parseChunkDescriptor(value: unknown): ChunkDescriptor | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Partial<ChunkDescriptor>;
  if (
    typeof candidate.generation !== 'string' ||
    !/^[a-z0-9-]{1,80}$/i.test(candidate.generation) ||
    !Number.isInteger(candidate.chunks) ||
    (candidate.chunks ?? 0) < 1 ||
    (candidate.chunks ?? 0) > MAX_NATIVE_AUTH_CHUNKS
  ) {
    return null;
  }
  return { generation: candidate.generation, chunks: candidate.chunks! };
}

function parseNativeManifest(raw: string | null): NativeAuthManifest | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<NativeAuthManifest>;
    const active = parseChunkDescriptor(value);
    if (
      !active ||
      value.version !== NATIVE_AUTH_STORAGE_VERSION ||
      !Number.isInteger(value.byteLength) ||
      (value.byteLength ?? -1) < 0 ||
      typeof value.checksum !== 'string' ||
      !/^[0-9a-f]{8}$/.test(value.checksum)
    ) {
      return null;
    }
    const staleValues = value.stale ?? [];
    if (!Array.isArray(staleValues) || staleValues.length > MAX_STALE_GENERATIONS) return null;
    const stale = staleValues.map(parseChunkDescriptor);
    if (stale.some((descriptor) => descriptor === null)) return null;
    return {
      ...active,
      version: NATIVE_AUTH_STORAGE_VERSION,
      byteLength: value.byteLength!,
      checksum: value.checksum,
      ...(stale.length > 0 ? { stale: stale as ChunkDescriptor[] } : {}),
    };
  } catch {
    return null;
  }
}

function cleanupDescriptorFromCorruptManifest(raw: string | null): ChunkDescriptor | null {
  if (!raw) return null;
  try {
    return parseChunkDescriptor(JSON.parse(raw));
  } catch {
    return null;
  }
}

function nextNativeGeneration(): string {
  nativeGenerationSequence += 1;
  return `${Date.now().toString(36)}-${nativeGenerationSequence.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function withNativeStorageLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = nativeStorageLocks.get(key) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(operation);
  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  nativeStorageLocks.set(key, tail);
  return result.finally(() => {
    if (nativeStorageLocks.get(key) === tail) nativeStorageLocks.delete(key);
  });
}

async function deleteChunkDescriptors(
  key: string,
  descriptors: ChunkDescriptor[],
): Promise<boolean> {
  let allDeleted = true;
  for (const descriptor of descriptors) {
    for (let index = 0; index < descriptor.chunks; index += 1) {
      try {
        await SecureStore.deleteItemAsync(nativeChunkKey(key, descriptor, index));
      } catch {
        allDeleted = false;
      }
    }
  }
  return allDeleted;
}

/**
 * Remove chunks left by process death before the active manifest commit. A
 * pending descriptor matching the active generation means commit succeeded and
 * only the staging marker itself was left behind.
 */
async function cleanupInterruptedWrite(
  key: string,
  activeManifest: NativeAuthManifest | null,
): Promise<boolean> {
  const pendingKey = nativePendingKey(key);
  const rawPending = await SecureStore.getItemAsync(pendingKey);
  if (rawPending === null) return true;
  const pending = cleanupDescriptorFromCorruptManifest(rawPending);
  if (pending && (!activeManifest || pending.generation !== activeManifest.generation)) {
    const chunksDeleted = await deleteChunkDescriptors(key, [pending]);
    if (!chunksDeleted) return false;
  }
  try {
    await SecureStore.deleteItemAsync(pendingKey);
  } catch {
    // Safe to overwrite later: either the chunks were removed, the marker was
    // corrupt, or this generation is already tracked by the active manifest.
  }
  return true;
}

async function cleanupCommittedStorage(key: string, manifest: NativeAuthManifest): Promise<void> {
  const stale = manifest.stale ?? [];
  const chunksDeleted = await deleteChunkDescriptors(key, stale);
  let legacyDeleted = true;
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    legacyDeleted = false;
  }
  if (stale.length > 0 && chunksDeleted && legacyDeleted) {
    const compactManifest: NativeAuthManifest = { ...manifest };
    delete compactManifest.stale;
    await SecureStore.setItemAsync(nativeManifestKey(key), JSON.stringify(compactManifest));
  }
}

async function readNativeAuthValue(key: string, manifest: NativeAuthManifest): Promise<string> {
  const chunks: string[] = [];
  for (let index = 0; index < manifest.chunks; index += 1) {
    const chunk = await SecureStore.getItemAsync(nativeChunkKey(key, manifest, index));
    if (chunk === null) throw new Error('AUTH_STORAGE_CHUNK_MISSING');
    chunks.push(chunk);
  }
  const value = chunks.join('');
  if (
    utf8ByteLength(value) !== manifest.byteLength ||
    storageChecksum(value) !== manifest.checksum
  ) {
    throw new Error('AUTH_STORAGE_CHUNK_CORRUPT');
  }
  return value;
}

async function writeNativeAuthValue(
  key: string,
  value: string,
  previousManifest: NativeAuthManifest | null,
): Promise<void> {
  const chunks = splitNativeAuthValue(value);
  if (chunks.length > MAX_NATIVE_AUTH_CHUNKS) throw new Error('AUTH_STORAGE_VALUE_TOO_LARGE');

  const descriptor: ChunkDescriptor = {
    generation: nextNativeGeneration(),
    chunks: chunks.length,
  };
  const inheritedStale = previousManifest?.stale ?? [];
  const stale = previousManifest ? [previousManifest, ...inheritedStale] : [];
  if (stale.length > MAX_STALE_GENERATIONS) {
    throw new Error('AUTH_STORAGE_STALE_CLEANUP_REQUIRED');
  }
  const manifest: NativeAuthManifest = {
    ...descriptor,
    version: NATIVE_AUTH_STORAGE_VERSION,
    byteLength: utf8ByteLength(value),
    checksum: storageChecksum(value),
    ...(stale.length > 0
      ? {
          stale: stale.map(({ generation, chunks: chunkCount }) => ({
            generation,
            chunks: chunkCount,
          })),
        }
      : {}),
  };
  const manifestJson = JSON.stringify(manifest);
  if (utf8ByteLength(manifestJson) > NATIVE_AUTH_STORAGE_CHUNK_BYTES) {
    throw new Error('AUTH_STORAGE_MANIFEST_TOO_LARGE');
  }

  let writtenChunks = 0;
  try {
    // This marker contains no credential data. It lets a later process clean a
    // generation if the app dies before the active manifest commit below.
    await SecureStore.setItemAsync(nativePendingKey(key), JSON.stringify(descriptor));
    for (let index = 0; index < chunks.length; index += 1) {
      await SecureStore.setItemAsync(nativeChunkKey(key, descriptor, index), chunks[index]!);
      writtenChunks += 1;
    }
    // Commit point: readers continue using the prior generation until every
    // new chunk exists, then this single manifest write switches atomically.
    await SecureStore.setItemAsync(nativeManifestKey(key), manifestJson);
  } catch (error) {
    const chunksDeleted = await deleteChunkDescriptors(key, [
      { ...descriptor, chunks: writtenChunks },
    ]);
    if (chunksDeleted) {
      try {
        await SecureStore.deleteItemAsync(nativePendingKey(key));
      } catch {
        // The harmless descriptor can be overwritten/retried on next access.
      }
    }
    throw error;
  }

  try {
    await SecureStore.deleteItemAsync(nativePendingKey(key));
  } catch {
    // Next access recognizes that it matches the committed active generation.
  }

  // Cleanup happens after commit. If it is interrupted, the manifest retains
  // stale generation descriptors so a later read/remove can finish securely.
  try {
    await cleanupCommittedStorage(key, manifest);
  } catch {
    // The committed value is valid. Cleanup will be retried on the next access.
  }
}

async function recoverLegacyNativeValue(key: string): Promise<string | null> {
  const legacy = await SecureStore.getItemAsync(key);
  if (legacy === null) return null;
  try {
    await writeNativeAuthValue(key, legacy, null);
  } catch {
    // Keep and return the readable legacy value. Migration retries next access.
  }
  return legacy;
}

function createNativeAuthStorageAdapter() {
  return {
    getItem: (key: string): Promise<string | null> =>
      withNativeStorageLock(key, async () => {
        const manifestKey = nativeManifestKey(key);
        const rawManifest = await SecureStore.getItemAsync(manifestKey);
        const manifest = parseNativeManifest(rawManifest);
        await cleanupInterruptedWrite(key, manifest);
        if (!manifest) {
          if (rawManifest !== null) {
            // Once any manifest exists, a direct value is stale migration data,
            // never a safe fallback. Delete it first; on failure preserve the
            // manifest as a tombstone that prevents session resurrection.
            try {
              await SecureStore.deleteItemAsync(key);
            } catch {
              return null;
            }
            const descriptor = cleanupDescriptorFromCorruptManifest(rawManifest);
            if (descriptor && !(await deleteChunkDescriptors(key, [descriptor]))) {
              // Preserve the only chunk map so a later access/removal can retry.
              return null;
            }
            try {
              await SecureStore.deleteItemAsync(manifestKey);
            } catch {
              return null;
            }
            return null;
          }
          return recoverLegacyNativeValue(key);
        }

        try {
          const value = await readNativeAuthValue(key, manifest);
          try {
            await cleanupCommittedStorage(key, manifest);
          } catch {
            // Cleanup remains described by the manifest and will retry later.
          }
          return value;
        } catch {
          try {
            await SecureStore.deleteItemAsync(key);
          } catch {
            // Preserve the manifest/tombstone and never revive this legacy token.
            return null;
          }
          const chunksDeleted = await deleteChunkDescriptors(key, [
            manifest,
            ...(manifest.stale ?? []),
          ]);
          if (!chunksDeleted) {
            // Keep the manifest as the retry/erasure map. Never fall back to a
            // legacy session while corrupt credential chunks still exist.
            return null;
          }
          try {
            await SecureStore.deleteItemAsync(manifestKey);
          } catch {
            return null;
          }
          return null;
        }
      }),
    setItem: (key: string, value: string): Promise<void> =>
      withNativeStorageLock(key, async () => {
        const manifestKey = nativeManifestKey(key);
        const rawManifest = await SecureStore.getItemAsync(manifestKey);
        const previousManifest = parseNativeManifest(rawManifest);
        if (!(await cleanupInterruptedWrite(key, previousManifest))) {
          throw new Error('AUTH_STORAGE_PENDING_CLEANUP_REQUIRED');
        }
        if (rawManifest !== null && !previousManifest) {
          const descriptor = cleanupDescriptorFromCorruptManifest(rawManifest);
          if (descriptor && !(await deleteChunkDescriptors(key, [descriptor]))) {
            throw new Error('AUTH_STORAGE_CORRUPT_CLEANUP_REQUIRED');
          }
          await SecureStore.deleteItemAsync(manifestKey);
        }
        await writeNativeAuthValue(key, value, previousManifest);
      }),
    removeItem: (key: string): Promise<void> =>
      withNativeStorageLock(key, async () => {
        const manifestKey = nativeManifestKey(key);
        const rawManifest = await SecureStore.getItemAsync(manifestKey);
        const manifest = parseNativeManifest(rawManifest);
        const rawPending = await SecureStore.getItemAsync(nativePendingKey(key));
        const pending = cleanupDescriptorFromCorruptManifest(rawPending);
        const descriptors = manifest
          ? [manifest, ...(manifest.stale ?? [])]
          : [cleanupDescriptorFromCorruptManifest(rawManifest)].filter(
              (descriptor): descriptor is ChunkDescriptor => descriptor !== null,
            );
        if (pending) descriptors.push(pending);
        const errors: unknown[] = [];
        // A failed legacy-key delete must abort before destroying the active
        // generation. Otherwise the next boot would revive the legacy session.
        await SecureStore.deleteItemAsync(key);
        const chunksDeleted = await deleteChunkDescriptors(key, descriptors);
        if (!chunksDeleted) {
          errors.push(new Error('AUTH_STORAGE_CHUNK_DELETE_FAILED'));
        }
        if (chunksDeleted) {
          try {
            await SecureStore.deleteItemAsync(manifestKey);
          } catch (error) {
            errors.push(error);
          }
          try {
            await SecureStore.deleteItemAsync(nativePendingKey(key));
          } catch (error) {
            errors.push(error);
          }
        }
        if (errors.length > 0) throw errors[0];
      }),
  };
}

// SSR/private-mode fallback. Browser localStorage remains canonical so an
// authenticated web session survives a real reload; this map only keeps the
// current runtime usable when storage access throws or `window` is absent.
const webAuthMemory = new Map<string, string>();

function resolveWebStorage(): WebStorageLike | null {
  try {
    const candidate = globalThis.localStorage;
    return candidate ?? null;
  } catch {
    return null;
  }
}

/** Exported factory keeps the web/native storage contract directly testable. */
export function createAuthStorageAdapter(
  platform: string = Platform.OS,
  webStorage: WebStorageLike | null = platform === 'web' ? resolveWebStorage() : null,
) {
  if (platform !== 'web') {
    return createNativeAuthStorageAdapter();
  }

  return {
    getItem: (key: string): string | null => {
      if (!webStorage) return webAuthMemory.get(key) ?? null;
      try {
        const persisted = webStorage.getItem(key);
        if (persisted != null) {
          webAuthMemory.set(key, persisted);
          return persisted;
        }
        // Accessible browser storage is canonical. A null means another tab or
        // logout removed the session, so the runtime copy must not resurrect it.
        webAuthMemory.delete(key);
        return null;
      } catch {
        // Fall through to the in-memory runtime copy.
      }
      return webAuthMemory.get(key) ?? null;
    },
    setItem: (key: string, value: string): void => {
      webAuthMemory.set(key, value);
      try {
        webStorage?.setItem(key, value);
      } catch {
        // Private mode/quota failure: session remains available this runtime.
      }
    },
    removeItem: (key: string): void => {
      if (webStorage) webStorage.removeItem(key);
      webAuthMemory.delete(key);
    },
  };
}

// Native credentials remain encrypted in Keychain/Keystore. Web uses
// localStorage so Supabase's `persistSession:true` contract actually survives
// reloads, with a defensive SSR/private-mode memory fallback.
export const SecureStoreAdapter = createAuthStorageAdapter();

// Defensive boot: never throw at module load (would crash before ErrorBoundary).
// If env is missing in a release build, log + fall back to an obviously-broken
// client URL. Network calls will fail with a normal rejected promise that
// useAuth's catch+timeout already handles, instead of SIGABRT on boot.
// Pattern adopted post-Finance crash (2026-04-20).
export const isSupabaseConfigured: boolean =
  Config.SUPABASE_URL.length > 0 && Config.SUPABASE_ANON_KEY.length > 0;

if (!isSupabaseConfigured) {
  // Use console.warn instead of throw — Apple reviewer must reach login screen
  // even if a misconfigured build slips through.
  console.warn(
    '[supabase] Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY ' +
      'in this build. Auth and data calls will fail. Check eas.json env or EAS secrets.',
  );
}

// P0 (Vet-rejection class — "spinner eterno"): never let an auth/data request
// hang forever. A dead spinner on a slow network reads as "app incomplete" to
// Apple review. Every Supabase-client fetch (auth sign-in, session refresh,
// RPC, REST) gets a hard timeout. The diagnose/ai-chat edge calls use their own
// fetch + AbortController (see services/diagnosis.ts and services/ai-chat.ts).
const SUPABASE_FETCH_TIMEOUT_MS = 20_000;
const IS_TEST_ENVIRONMENT = process.env.NODE_ENV === 'test';

/**
 * Sentinel request header a caller can attach to opt a SINGLE request into a
 * longer client timeout than the 20s default — e.g. an avatar upload on a slow
 * rural network, which the blanket 20s would otherwise abort mid-transfer.
 * storage-js forwards `fileOptions.headers` onto the request, so the upload
 * call site sets this via `timeoutHeader(ms)`. The header is CONSUMED here and
 * stripped before the real fetch, so it never reaches the server (no CORS /
 * preflight surprises on web). The global 20s default is unchanged (FIX-13).
 */
export const SUPABASE_FETCH_TIMEOUT_HEADER = 'x-rumo-timeout-ms';

/** Build `fileOptions.headers` that opt one storage request into `ms` timeout. */
export function timeoutHeader(ms: number): Record<string, string> {
  return { [SUPABASE_FETCH_TIMEOUT_HEADER]: String(ms) };
}

/** Parse a positive-integer millisecond value, or null when invalid. */
function parsePositiveMs(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Read the timeout-override header (if any) and return the requested timeout
 * plus a copy of `headers` with the sentinel removed. Handles the three
 * HeadersInit shapes without mutating the caller's object.
 */
function extractTimeoutOverride(headers: HeadersInit | undefined): {
  ms: number | null;
  headers: HeadersInit | undefined;
} {
  if (!headers) return { ms: null, headers };
  const name = SUPABASE_FETCH_TIMEOUT_HEADER;

  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    const raw = headers.get(name);
    if (raw == null) return { ms: null, headers };
    const clone = new Headers(headers);
    clone.delete(name);
    return { ms: parsePositiveMs(raw), headers: clone };
  }

  if (Array.isArray(headers)) {
    let raw: string | null = null;
    const rest = headers.filter(([k, v]) => {
      if (k.toLowerCase() === name) {
        raw = v ?? null;
        return false;
      }
      return true;
    });
    if (raw == null) return { ms: null, headers };
    return { ms: parsePositiveMs(raw), headers: rest };
  }

  const obj = headers as Record<string, string>;
  const key = Object.keys(obj).find((k) => k.toLowerCase() === name);
  if (!key) return { ms: null, headers };
  const { [key]: raw, ...rest } = obj;
  return { ms: parsePositiveMs(raw), headers: rest };
}

const fetchWithTimeout: typeof fetch = (input, init) => {
  const { ms: overrideMs, headers: cleanedHeaders } = extractTimeoutOverride(init?.headers);
  const timeoutMs = overrideMs ?? SUPABASE_FETCH_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Respect a caller-provided signal — abort ours if theirs fires so we never
  // leak the timeout or override the SDK's own cancellation.
  const callerSignal = init?.signal;
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  const finalInit: RequestInit = { ...init, signal: controller.signal };
  // Guard on `cleanedHeaders` (not `init.headers`) so TS narrows it to
  // HeadersInit: under exactOptionalPropertyTypes, `headers` can't be assigned
  // `HeadersInit | undefined`. extractTimeoutOverride only returns undefined
  // headers when the input was undefined, so this is behaviorally equivalent
  // while replacing the original headers with the sentinel-stripped copy.
  if (cleanedHeaders !== undefined) finalInit.headers = cleanedHeaders;
  return fetch(input, finalInit).finally(() => clearTimeout(timer));
};

export const supabase = createClient(
  // Empty string is invalid for URL parsing inside @supabase/supabase-js, so
  // substitute a syntactically-valid placeholder when env is missing.
  Config.SUPABASE_URL || 'https://invalid.supabase.co',
  Config.SUPABASE_ANON_KEY || 'invalid-anon-key',
  {
    auth: {
      storage: SecureStoreAdapter,
      autoRefreshToken: !IS_TEST_ENVIRONMENT,
      persistSession: !IS_TEST_ENVIRONMENT,
      detectSessionInUrl: false,
      lock: processLock,
    },
    global: { fetch: fetchWithTimeout },
  },
);

/**
 * Isolated in-memory auth client for destructive-action reauthentication.
 * It never writes the app's persisted session and its SIGNED_IN events have no
 * subscribers in AuthContext, so a password/OAuth proof cannot relink the
 * account or unmount the deletion screen before its receipt is saved.
 */
export function createEphemeralSupabaseClient() {
  return createClient(
    Config.SUPABASE_URL || 'https://invalid.supabase.co',
    Config.SUPABASE_ANON_KEY || 'invalid-anon-key',
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      global: { fetch: fetchWithTimeout },
    },
  );
}

let autoRefreshConsumers = 0;
let appStateSubscription: { remove(): void } | null = null;

function applyAutoRefreshState(state: AppStateStatus): void {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
}

/**
 * Retain one native AppState observer for every mounted auth consumer. The
 * ref-count prevents duplicate listeners when providers remount during Fast
 * Refresh and guarantees the refresh timer is stopped after the final release.
 */
export function retainSupabaseAuthAutoRefresh(): () => void {
  if (Platform.OS === 'web') return () => undefined;
  autoRefreshConsumers += 1;
  if (!appStateSubscription) {
    applyAutoRefreshState(AppState.currentState);
    appStateSubscription = AppState.addEventListener('change', applyAutoRefreshState);
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    autoRefreshConsumers = Math.max(0, autoRefreshConsumers - 1);
    if (autoRefreshConsumers === 0 && appStateSubscription) {
      appStateSubscription.remove();
      appStateSubscription = null;
      supabase.auth.stopAutoRefresh();
    }
  };
}
