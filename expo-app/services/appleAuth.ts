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
 */

import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from './supabase';
import { Platform } from 'react-native';

/**
 * Check if Apple Sign In is available on this device.
 * Only works on iOS 13+.
 */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;

  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Sign in with Apple and authenticate with Supabase.
 * Returns the Supabase session on success.
 */
export async function signInWithApple() {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
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
  } catch (error: any) {
    // User cancelled - not an error
    if (error.code === 'ERR_REQUEST_CANCELED') {
      return null;
    }
    throw error;
  }
}
