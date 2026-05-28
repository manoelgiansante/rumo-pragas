import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { Config } from '../constants/config';
import { addBreadcrumb } from './sentry-shim';

// SecureStore adapter for encrypted auth token storage (iOS/Android)
// Falls back to in-memory on web where SecureStore is unavailable.
//
// Corrupted-keychain recovery (2026-05-28, sibling fix to RUMO-PRAGAS-C):
// `expo-secure-store` can throw `getValueWithKeyAsync` errors when the
// underlying iOS Keychain entry / Android Keystore alias is corrupted (OS
// upgrade race, biometric re-enrollment, restore-from-backup edge cases).
// The Supabase client treats `null` as "no cached session" and re-bootstraps
// cleanly, so the safe recovery is:
//   1. breadcrumb the failure for diagnosability,
//   2. best-effort `deleteItemAsync` to evict the broken entry,
//   3. return `null` from `getItem` (Supabase treats as "no session"),
//   4. swallow `setItem` / `removeItem` failures so a single bad write
//      cannot crash the auth pipeline.
// Pattern adopted from Rumo Operacional PR #22 (memory ref
// [[feedback_apple_siwa_filter_benign_code_1000]] §SecureStore).
const SecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') return null;
    try {
      return await SecureStore.getItemAsync(key);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      addBreadcrumb({
        category: 'auth',
        message: 'securestore.getItem.corrupt',
        level: 'warning',
        data: { key, error: message },
      });
      // Best-effort: evict the broken entry so the next sign-in starts clean.
      try {
        await SecureStore.deleteItemAsync(key);
      } catch {
        /* nothing actionable — the recovery path tolerates this */
      }
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') return;
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      addBreadcrumb({
        category: 'auth',
        message: 'securestore.setItem.failed',
        level: 'warning',
        data: { key, error: message },
      });
      // Swallow — Supabase will retry on the next auth event. A throw here
      // would tear down the auth state machine.
    }
  },
  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') return;
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      addBreadcrumb({
        category: 'auth',
        message: 'securestore.removeItem.failed',
        level: 'warning',
        data: { key, error: message },
      });
      // Swallow — sign-out should never throw because of a stale keychain.
    }
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
  },
);
