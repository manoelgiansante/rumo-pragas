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
 * Sentry noise filter (2026-05-28, Sentry issue RUMO-PRAGAS-C):
 * Apple emits several catch-all / transient native codes on the SIWA path
 * (ASAuthorizationError.unknown = 1000, .failed, .invalidResponse, plus
 * the user-cancel codes). These are NOT actionable and must NOT pollute
 * Sentry. Pattern shipped previously for Rumo Operacional (PR #22) and
 * Rumo Vet — see memory [[feedback_apple_siwa_filter_benign_code_1000]].
 *
 * - `ERR_REQUEST_CANCELED` / `ERR_CANCELED`     -> silent (return null, no UI alert, no Sentry)
 * - `ERR_REQUEST_UNKNOWN` (code 1000),
 *   `ERR_REQUEST_FAILED`  (code 1004),
 *   `ERR_INVALID_RESPONSE` (code 1002)          -> friendly retry message,
 *                                                   breadcrumb only (no captureException).
 * - any other code                              -> friendly retry message AND
 *                                                   captureException tagged with code+stage.
 *
 * The `BenignAppleSiwaError` marker class lets `login.tsx` recognise the
 * friendly-rethrow and skip its own Sentry capture without re-implementing
 * the matrix.
 */

import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { addBreadcrumb, captureException } from './sentry-shim';

// ---------------------------------------------------------------------------
// Apple SIWA benign-code matrix
// ---------------------------------------------------------------------------
// Keep these two SETS in lockstep with the docs at the top of this file
// AND with __tests__/services/appleAuth.test.ts. Adding/removing a code
// without updating the test will trip the "documented codes" assertion.

/** User dismissed the sheet. Never report to Sentry, never show UI. */
export const APPLE_SIWA_CANCEL_CODES: ReadonlySet<string> = new Set([
  'ERR_CANCELED',
  'ERR_REQUEST_CANCELED',
]);

/**
 * Apple emitted a transient / catch-all native error that is not
 * actionable by us or the user. We show a friendly retry message but
 * leave only a breadcrumb in Sentry — captureException would create
 * unbounded noise (RUMO-PRAGAS-C, RUMO-OPERACIONAL-6 — same class of
 * issue across apps).
 */
export const APPLE_SIWA_SILENT_NATIVE_CODES: ReadonlySet<string> = new Set([
  'ERR_REQUEST_UNKNOWN',
  'ERR_REQUEST_FAILED',
  'ERR_INVALID_RESPONSE',
]);

/**
 * Marker class — login.tsx (or any future caller) checks
 * `isBenignAppleSiwaError(err)` to decide whether to surface to Sentry.
 * Re-throwing a fresh `Error` would lose the marker, so we wrap.
 */
export class BenignAppleSiwaError extends Error {
  /** Discriminator for duck-typing across module boundaries. */
  readonly benign = true as const;
  /** Original Apple native code (or sentinel for missing token). */
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'BenignAppleSiwaError';
    this.code = code;
  }
}

/** Type guard: was this error a benign SIWA condition we already breadcrumbed? */
export function isBenignAppleSiwaError(err: unknown): err is BenignAppleSiwaError {
  return (
    err instanceof BenignAppleSiwaError ||
    (typeof err === 'object' &&
      err !== null &&
      (err as { benign?: unknown }).benign === true)
  );
}

function readCode(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: unknown }).code;
    if (typeof code === 'string' && code.length > 0) return code;
  }
  return 'unknown';
}

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
 *
 * Returns `null` if the user cancelled the sheet (NOT an error).
 * Throws `BenignAppleSiwaError` for transient Apple-side failures
 * (caller should show the friendly message but NOT capture to Sentry —
 * `isBenignAppleSiwaError(err)` reports true).
 * Throws a plain Error (already Sentry-captured here) for genuinely
 * unexpected codes / Supabase auth errors.
 */
export async function signInWithApple() {
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (signInErr: unknown) {
    const code = readCode(signInErr);

    // User cancelled — silent. Return null so login.tsx renders nothing.
    if (APPLE_SIWA_CANCEL_CODES.has(code)) {
      addBreadcrumb({
        category: 'auth',
        message: 'apple.signin.cancelled',
        level: 'info',
        data: { stage: 'siwa-native', code },
      });
      return null;
    }

    // Benign Apple-side transient — breadcrumb only, friendly retry.
    if (APPLE_SIWA_SILENT_NATIVE_CODES.has(code)) {
      addBreadcrumb({
        category: 'auth',
        message: 'apple.signin.silent_fail',
        level: 'warning',
        data: { stage: 'siwa-native', code, reason: 'apple_signin_silent' },
      });
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn(`[apple-signin] silent-fail native code=${code}`);
      }
      throw new BenignAppleSiwaError(
        'A Apple não conseguiu concluir o login. Verifique sua conexão e tente novamente.',
        code,
      );
    }

    // Novel / genuinely unexpected — capture WITH the raw Apple code so the
    // next Sentry issue is diagnosable. Re-throw the original so callers can
    // still inspect `.code` if needed.
    addBreadcrumb({
      category: 'auth',
      message: 'apple.signin.native_error',
      level: 'error',
      data: { stage: 'siwa-native', code },
    });
    captureException(signInErr, {
      tags: { stage: 'siwa-native', code },
    });
    throw signInErr;
  }

  if (!credential.identityToken) {
    // Transient SIWA condition (token race / sheet dismissed mid-flight) —
    // benign and self-recovering on retry. Breadcrumb only.
    addBreadcrumb({
      category: 'auth',
      message: 'apple.signin.missing_token',
      level: 'warning',
      data: { stage: 'siwa-no-token' },
    });
    throw new BenignAppleSiwaError(
      'A Apple não retornou o token de identidade. Tente novamente.',
      'ERR_NO_IDENTITY_TOKEN',
    );
  }

  // Use the identity token to sign in with Supabase
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });

  if (error) {
    captureException(error, {
      tags: { stage: 'siwa-supabase' },
    });
    throw error;
  }

  // Update profile with Apple-provided name (only available on first sign-in).
  // Best-effort — auth has already succeeded; a profile update error MUST NOT
  // propagate as if it were the SIWA failure (same anti-pattern that caused
  // Vet b10 rejection 2026-04-29).
  if (credential.fullName?.givenName && data.user) {
    const fullName = [credential.fullName.givenName, credential.fullName.familyName]
      .filter(Boolean)
      .join(' ');

    if (fullName) {
      try {
        const { error: upsertErr } = await supabase
          .from('pragas_profiles')
          .update({ full_name: fullName })
          .eq('id', data.user.id);
        if (upsertErr) {
          captureException(upsertErr, {
            tags: { stage: 'siwa-profile-update' },
          });
          // Swallow — auth already succeeded.
        }
      } catch (upsertErr) {
        captureException(upsertErr, {
          tags: { stage: 'siwa-profile-update-throw' },
        });
        // Swallow.
      }
    }
  }

  return { session: data.session, user: data.user };
}
