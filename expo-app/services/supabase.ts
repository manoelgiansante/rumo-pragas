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
