/**
 * Apple Authentication Service
 *
 * Foundation for "Sign in with Apple" using expo-apple-authentication.
 * Integrates with Supabase Auth for Apple ID provider.
 *
 * SETUP REQUIRED:
 * 1. Install: npx expo install expo-apple-authentication
 * 2. Add "expo-apple-authentication" to plugins in app.json
 * 3. Enable "Sign in with Apple" capability in Apple Developer portal
 * 4. Configure Apple provider in Supabase Auth dashboard
 *
 * iOS 26 IPad Reviewer Trap (Apple 2.1(a)) defense:
 * `expo-apple-authentication` is loaded LAZILY at first call (require). Top-level
 * imports of this native package can fail bundle eval on iPad iOS 26 reviewer
 * devices, causing splash hangs and immediate rejection. Lazy require + null
 * guard degrades gracefully (button disabled / friendly Alert) instead of crashing.
 */
/* eslint-disable @typescript-eslint/no-var-requires */

import type * as AppleAuthenticationTypes from 'expo-apple-authentication';
import { supabase } from './supabase';
import { Platform } from 'react-native';

type AppleAuthModule = typeof AppleAuthenticationTypes;

let cachedAppleAuth: AppleAuthModule | null = null;
let triedAppleAuth = false;

/**
 * Lazy + memoized require for expo-apple-authentication. Returns null if the
 * native module fails to load (web preview, missing pod, iPad reviewer eval).
 * Memoization keeps behaviour stable across calls and matches the historical
 * single-import semantics tests rely on.
 */
function getAppleAuth(): AppleAuthModule | null {
  if (cachedAppleAuth) return cachedAppleAuth;
  if (triedAppleAuth) return null;
  triedAppleAuth = true;
  try {
    cachedAppleAuth = require('expo-apple-authentication') as AppleAuthModule;
    return cachedAppleAuth;
  } catch {
    return null;
  }
}

/**
 * Check if Apple Sign In is available on this device.
 * Only works on iOS 13+. Returns false if the module is missing or the
 * native bridge throws.
 */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;

  const Apple = getAppleAuth();
  if (!Apple) return false;

  try {
    return await Apple.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Sign in with Apple and authenticate with Supabase.
 * Returns the Supabase session on success.
 * Returns null when the user cancels.
 * Throws when the module is missing (caller should runtime-gate first).
 */
export async function signInWithApple() {
  const Apple = getAppleAuth();
  if (!Apple) {
    throw new Error('Sign in with Apple is not available on this device.');
  }

  try {
    const credential = await Apple.signInAsync({
      requestedScopes: [
        Apple.AppleAuthenticationScope.FULL_NAME,
        Apple.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      throw new Error('No identity token received from Apple');
    }

    // Use the identity token to sign in with Supabase
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });

    if (error) throw error;

    // Update profile with Apple-provided name (only available on first sign-in)
    if (credential.fullName?.givenName && data.user) {
      const fullName = [credential.fullName.givenName, credential.fullName.familyName]
        .filter(Boolean)
        .join(' ');

      if (fullName) {
        await supabase
          .from('pragas_profiles')
          .update({ full_name: fullName })
          .eq('id', data.user.id);
      }
    }

    return { session: data.session, user: data.user };
  } catch (error: unknown) {
    // User cancelled - not an error
    if (
      error instanceof Object &&
      'code' in error &&
      (error as { code: string }).code === 'ERR_REQUEST_CANCELED'
    ) {
      return null;
    }
    throw error;
  }
}
