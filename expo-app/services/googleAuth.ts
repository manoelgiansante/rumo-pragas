/**
 * Google Authentication Service
 *
 * "Continue with Google" via expo-auth-session/providers/google.
 * Wires Google ID token into Supabase Auth (signInWithIdToken with provider='google').
 *
 * Why expo-auth-session and not @react-native-google-signin/google-signin:
 *  - No native module → works in Expo Go AND production builds without extra
 *    config plugin / native rebuild.
 *  - Uses ASWebAuthenticationSession on iOS and Custom Tabs on Android (same UX
 *    as the native SDK from the user's POV).
 *  - Returns the Google id_token directly, which is exactly what Supabase wants
 *    for `signInWithIdToken({ provider: 'google', token, nonce })`.
 *
 * NONCE FLOW (security — required by Supabase to match the id_token's nonce
 *   claim): we generate a random raw nonce, send its SHA-256 to Google
 *   (extraParams.nonce = sha256(raw)), and pass the RAW value to Supabase.
 *   Google hashes-and-signs in the id_token; Supabase re-hashes the raw nonce
 *   we send to verify the claim matches. Without this, sign-in fails with
 *   "Invalid nonce" on iOS standalone builds.
 *
 * SETUP REQUIRED (CEO actions — NOT done by code):
 *  1. Google Cloud Console → OAuth 2.0 credentials:
 *       - iOS client: bundle id = `com.agrorumo.rumopragas`
 *       - Android client: package = `com.agrorumo.rumopragas`,
 *           SHA-1 from Play App Signing (upload key + production)
 *       - Web client: this is the one Supabase uses to verify the id_token
 *           (and the one we pass to signInWithIdToken). Set its client_id in
 *           EXPO_PUBLIC_GOOGLE_CLIENT_ID.
 *  2. Supabase Dashboard → Authentication → Providers → Google → enable +
 *     paste the Web client_id + secret. Project: `jxcnfyeemdltdfqtgbcl`.
 *  3. EAS Secrets: `eas secret:create EXPO_PUBLIC_GOOGLE_CLIENT_ID --value <web_client_id>`
 *
 * Apple Guideline 4.8: when a third-party social sign-in (Google/Facebook) is
 * offered, the app MUST also offer "Sign in with Apple". Pragas already ships
 * Apple Sign In (`services/appleAuth.ts` + login.tsx), so adding Google is
 * compliant.
 */

import * as Google from 'expo-auth-session/providers/google';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase';
import { Config } from '../constants/config';

// Required for the browser to redirect back into the app on iOS/Android.
WebBrowser.maybeCompleteAuthSession();

export type GoogleSignInOutcome =
  | { kind: 'success'; userId: string; email: string | null }
  | { kind: 'cancelled' }
  | { kind: 'error'; error: Error };

/**
 * Tiny shape contract: anything the login screen needs without leaking
 * expo-auth-session types upstream.
 */
export interface UseGoogleSignIn {
  /** True once expo-auth-session has the request ready (handler armed). */
  ready: boolean;
  /** True only while the browser flow + Supabase exchange is in flight. */
  loading: boolean;
  /** Trigger the sign-in flow. Awaits the browser + Supabase exchange. */
  signIn: () => Promise<GoogleSignInOutcome>;
  /** True if EXPO_PUBLIC_GOOGLE_CLIENT_ID is wired. */
  configured: boolean;
}

/**
 * Hook-based API because expo-auth-session is hook-driven (PKCE state +
 * browser response listener live inside `useAuthRequest`). We wrap it so the
 * login screen stays free of expo-auth-session details.
 */
export function useGoogleSignIn(): UseGoogleSignIn {
  const clientId = Config.GOOGLE_CLIENT_ID;
  const configured = clientId.length > 0;

  // Raw nonce kept in a ref so we can pass it to Supabase after the flow
  // completes (the response handler fires asynchronously).
  const rawNonceRef = useRef<string | null>(null);

  // We seed an initial nonce so the first render's request already carries
  // the hashed value — the same raw nonce is reused for the matching Supabase
  // exchange. Regenerated after each finished attempt.
  const initialNonce = useMemo(() => generateRawNonce(), []);
  const [hashedNonce, setHashedNonce] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    rawNonceRef.current = initialNonce;
    Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, initialNonce)
      .then((digest) => {
        if (!cancelled) setHashedNonce(digest);
      })
      .catch(() => {
        // If hashing fails (extremely unlikely), surface as not-ready; the
        // CTA stays disabled and we don't leak the raw nonce.
        if (!cancelled) setHashedNonce(null);
      });
    return () => {
      cancelled = true;
    };
  }, [initialNonce]);

  const [request, , promptAsync] = Google.useIdTokenAuthRequest({
    clientId: configured ? clientId : 'unconfigured.apps.googleusercontent.com',
    // The same Web client_id works for the id_token flow on iOS/Android in
    // managed builds via expo-auth-session (proxy / ASWebAuthenticationSession).
    iosClientId: configured ? clientId : undefined,
    androidClientId: configured ? clientId : undefined,
    extraParams: hashedNonce ? { nonce: hashedNonce } : undefined,
    scopes: ['openid', 'profile', 'email'],
    redirectUri: AuthSession.makeRedirectUri({
      // Native scheme registered in app.json -> expo.scheme = "rumopragas".
      // expo-auth-session handles the platform variations.
      scheme: 'rumopragas',
    }),
  });

  const [loading, setLoading] = useState(false);

  const signIn = async (): Promise<GoogleSignInOutcome> => {
    if (!configured) {
      return {
        kind: 'error',
        error: new Error(
          'Google Sign-In is not configured: EXPO_PUBLIC_GOOGLE_CLIENT_ID is missing.',
        ),
      };
    }
    if (!request || !hashedNonce) {
      return {
        kind: 'error',
        error: new Error('Google Sign-In is not ready yet. Please try again in a moment.'),
      };
    }
    setLoading(true);
    try {
      const result = await promptAsync();

      if (result.type === 'cancel' || result.type === 'dismiss') {
        return { kind: 'cancelled' };
      }
      if (result.type !== 'success') {
        // 'error' | 'locked' | unknown variants
        const message =
          result.type === 'error'
            ? result.error?.message || 'Google sign-in failed.'
            : `Unexpected Google sign-in response: ${result.type}`;
        return { kind: 'error', error: new Error(message) };
      }

      const idToken = result.params?.id_token;
      if (!idToken) {
        return {
          kind: 'error',
          error: new Error('No identity token received from Google.'),
        };
      }

      const rawNonce = rawNonceRef.current;
      if (!rawNonce) {
        return {
          kind: 'error',
          error: new Error('Nonce mismatch — please retry.'),
        };
      }

      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
        nonce: rawNonce,
      });

      if (error) {
        return { kind: 'error', error: new Error(error.message) };
      }
      if (!data.user) {
        return {
          kind: 'error',
          error: new Error('Google sign-in succeeded but no user was returned.'),
        };
      }

      // Best-effort profile name backfill (Google "name" is a single string, not
      // structured like Apple's fullName). Don't fail the sign-in if it errors —
      // the user is already authenticated.
      const fullName =
        typeof data.user.user_metadata?.full_name === 'string'
          ? data.user.user_metadata.full_name.trim()
          : typeof data.user.user_metadata?.name === 'string'
            ? data.user.user_metadata.name.trim()
            : '';
      if (fullName) {
        try {
          await supabase
            .from('pragas_profiles')
            .update({ full_name: fullName })
            .eq('id', data.user.id);
        } catch {
          // swallowed on purpose — auth must not be blocked by profile drift
        }
      }

      return {
        kind: 'success',
        userId: data.user.id,
        email: data.user.email ?? null,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Google sign-in failed.');
      return { kind: 'error', error };
    } finally {
      setLoading(false);
      // Rotate the nonce so the next attempt gets a fresh one. We re-seed
      // synchronously and let the useEffect rehash on the next render.
      const next = generateRawNonce();
      rawNonceRef.current = next;
      // Trigger a rehash by clearing hashedNonce; the effect above re-runs
      // through `initialNonce`'s memoized value, so we set state directly:
      setHashedNonce(null);
      Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, next)
        .then((digest) => setHashedNonce(digest))
        .catch(() => setHashedNonce(null));
    }
  };

  return {
    ready: Boolean(request) && Boolean(hashedNonce),
    loading,
    signIn,
    configured,
  };
}

/**
 * Generate a 32-byte cryptographically random raw nonce, hex-encoded.
 * SHA-256(hex) is what we send to Google as extraParams.nonce.
 */
function generateRawNonce(): string {
  // 32 random bytes → 64 hex chars. Sufficient entropy per OIDC spec.
  const bytes = Crypto.getRandomBytes(32);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}
