/**
 * Apple Authentication Service
 *
 * "Sign in with Apple" using expo-apple-authentication, wired into Supabase
 * Auth (`signInWithIdToken` with provider='apple').
 *
 * NONCE FLOW (security — required for Supabase to validate the id_token's
 *   `nonce` claim on native iOS):
 *   - We generate a random RAW nonce.
 *   - We pass SHA-256(raw) to `AppleAuthentication.signInAsync({ nonce })`.
 *     Apple embeds that hash as the `nonce` claim inside the signed
 *     identityToken.
 *   - We pass the RAW nonce to `supabase.auth.signInWithIdToken({ nonce })`.
 *     Supabase re-hashes the raw value and checks it matches the token's claim.
 *   Without this, native Apple sign-in can fail nonce validation on standalone
 *   builds (the exact class of silent failure seen for the App Store reviewer
 *   on build 1.0.7+45 — RUMO-PRAGAS-C). This mirrors the working Google flow in
 *   `services/googleAuth.ts`.
 *
 * SETUP REQUIRED (CEO / config — NOT done by code):
 *   1. Xcode capability "Sign in with Apple" → handled by app.json
 *      `ios.usesAppleSignIn: true` + the `expo-apple-authentication` plugin.
 *   2. Apple Developer → the App ID `com.agrorumo.rumopragas` must have
 *      "Sign in with Apple" enabled.
 *   3. Supabase Dashboard → Authentication → Providers → Apple → enable, and
 *      under "Client IDs" register the iOS bundle id `com.agrorumo.rumopragas`
 *      (native-only flow does NOT need Services ID / key / Team ID — but the
 *      bundle id MUST be in the Client IDs list or Supabase rejects the token
 *      with "Unacceptable audience in id_token"). Project: `jxcnfyeemdltdfqtgbcl`.
 */

import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';
import { Platform } from 'react-native';
import type { Session, User } from '@supabase/supabase-js';
import i18n from '../i18n';
import { addBreadcrumb } from './sentry-shim';
import { beginAuthMetadataUpdate } from './authMetadataGate';

/** Result of a sign-in attempt. `null` == user cancelled (not an error). */
export type AppleSignInResult = { session: Session | null; user: User | null } | null;

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
 * True for Apple errors that are benign / user-driven and must NOT be reported
 * to Sentry as exceptions:
 *   - ERR_REQUEST_CANCELED       → user tapped Cancel.
 *   - ERR_REQUEST_UNKNOWN / 1000 → ASAuthorizationError.unknown, Apple's
 *     catch-all for cancel-by-dismiss / timeout / Face ID abort. Benign.
 * Filtering 1000 stops the noise that flagged RUMO-PRAGAS-C (24 events).
 */
function isBenignAppleError(error: unknown): boolean {
  if (!(error instanceof Object)) return false;
  const code = 'code' in error ? String((error as { code: unknown }).code) : '';
  return code === 'ERR_REQUEST_CANCELED' || code === 'ERR_REQUEST_UNKNOWN' || code === '1000';
}

/**
 * Generate a 32-byte cryptographically random raw nonce, hex-encoded.
 * SHA-256(this) is what we hand to Apple as the `nonce`.
 */
function generateRawNonce(): string {
  const bytes = Crypto.getRandomBytes(32);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    // i < bytes.length guarantees the element exists; assert for
    // noUncheckedIndexedAccess without changing runtime behavior.
    hex += bytes[i]!.toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Sign in with Apple and authenticate with Supabase.
 * Returns the Supabase session on success, or `null` if the user cancelled.
 * Throws (for the caller to surface) only on genuine, non-benign failures.
 */
export async function signInWithApple(): Promise<AppleSignInResult> {
  // 1. Generate raw nonce + its SHA-256 BEFORE the Apple prompt so the hash is
  //    baked into the signed identityToken.
  const rawNonce = generateRawNonce();
  let hashedNonce: string;
  try {
    hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  } catch (error) {
    // Re-throw a clear, retryable message. The single Sentry capture happens at
    // the call site (login.tsx) so we don't double-report the same failure.
    throw new Error(i18n.t('auth.appleSignInError'), { cause: error });
  }

  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      // Apple hashes-and-signs this into the token's `nonce` claim.
      nonce: hashedNonce,
    });

    // 2. Apple must return an identityToken. If it's null the flow can't
    //    continue — surface a clear, retryable error (and breadcrumb it).
    if (!credential.identityToken) {
      addBreadcrumb({
        category: 'auth',
        message: 'apple.signin.no_identity_token',
        level: 'warning',
      });
      throw new Error(i18n.t('auth.appleSignInError'));
    }

    // Apple returns this name only on first authorization. Arm the link gate
    // before SIGNED_IN is emitted so pragas_link_account cannot create a
    // null-name profile while the one-time metadata is still being persisted.
    const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
      .map((part) => part.trim())
      .join(' ')
      .slice(0, 200);
    const releaseMetadataGate = fullName ? beginAuthMetadataUpdate() : null;

    try {
      // 3. Hand the token + RAW nonce to Supabase. Supabase re-hashes rawNonce
      // and compares it to the token's `nonce` claim.
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: rawNonce,
      });

      if (error) {
        // Record only the failed step; provider details may contain identifiers.
        addBreadcrumb({
          category: 'auth',
          message: 'apple.signin.supabase_exchange_failed',
          level: 'error',
        });
        throw new Error(i18n.t('auth.appleSignInError'));
      }

      // 4. Persist before releasing the link gate. The RPC derives the initial
      // profile name from auth.users.raw_user_meta_data; a direct profile UPDATE
      // is racy and affects zero rows when linking has not created it yet.
      if (fullName && data.user) {
        const { error: metadataError } = await supabase.auth.updateUser({
          data: { full_name: fullName },
        });
        if (metadataError) {
          addBreadcrumb({
            category: 'auth',
            message: 'apple.signin.metadata_update_failed',
            level: 'error',
          });
          throw new Error(i18n.t('auth.appleSignInError'));
        }
      }

      return { session: data.session, user: data.user };
    } finally {
      releaseMetadataGate?.();
    }
  } catch (error: unknown) {
    // User cancellation / benign catch-all → breadcrumb, NOT captureException.
    if (isBenignAppleError(error)) {
      addBreadcrumb({
        category: 'auth',
        message: 'apple.signin.cancelled_or_unknown',
        level: 'info',
        data: {
          code:
            error instanceof Object && 'code' in error
              ? String((error as { code: unknown }).code)
              : 'unknown',
        },
      });
      return null;
    }
    // Genuine provider failures are normalized before reaching UI/telemetry.
    throw new Error(i18n.t('auth.appleSignInError'), { cause: error });
  }
}
