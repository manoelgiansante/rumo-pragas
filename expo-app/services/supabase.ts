import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { Config } from '../constants/config';

// SecureStore adapter for encrypted auth token storage (iOS/Android)
// Falls back to in-memory on web where SecureStore is unavailable
const SecureStoreAdapter = {
  getItem: (key: string) => {
    if (Platform.OS === 'web') return null;
    return SecureStore.getItemAsync(key);
  },
  setItem: (key: string, value: string) => {
    if (Platform.OS === 'web') return;
    return SecureStore.setItemAsync(key, value);
  },
  removeItem: (key: string) => {
    if (Platform.OS === 'web') return;
    return SecureStore.deleteItemAsync(key);
  },
};

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
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    global: { fetch: fetchWithTimeout },
  },
);
