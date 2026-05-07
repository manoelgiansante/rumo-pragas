/**
 * Map Supabase / network / Apple auth errors to friendly, translated messages.
 *
 * iPad iOS 26 reviewer hardening (2026-05-06): Apple flagged "login error message"
 * because raw Supabase errors ("Invalid login credentials", "Network request failed")
 * surfaced verbatim in the inline error box. This module branches by message text
 * and returns a translated PT-BR/EN/ES message via i18n.
 *
 * Apple Guideline 2.1 (App Completeness): user-facing errors must be localized
 * and actionable, not technical English from a third-party SDK.
 */
import i18n from '../i18n';

interface MaybeAuthError {
  message?: string;
  status?: number;
  code?: string;
  name?: string;
}

/**
 * Apple Guideline 2.1(a) defense (2026-05-07, v1.0.6 bn32 reject):
 * Apple's reviewer attempted login with the wrong password BEFORE entering the
 * correct one. Our friendly PT-BR toast for "Email ou senha incorretos"
 * was flagged as a "bug / error message displayed upon logging in" even though
 * the subsequent correct-password attempt succeeded
 * (Supabase last_sign_in_at confirmed for reviewer@agrorumo.com).
 *
 * Decision: for invalid_credentials specifically, the UI must SILENT-FAIL.
 * No toast, no banner, no inline error, no Alert.alert. The form sits silent;
 * the user simply tries again. Visual cue is delegated to the screen
 * (1× subtle shake on the password field).
 *
 * All OTHER auth errors (network, 5xx, email_not_confirmed, locked, rate
 * limit, unknown) continue to surface a friendly translated message — those
 * are not the "wrong password" case Apple flagged.
 */
export function isInvalidCredentialsError(err: unknown): boolean {
  const e: MaybeAuthError = err && typeof err === 'object' ? (err as MaybeAuthError) : {};
  const raw = (e.message || '').toLowerCase();
  const code = (e.code || '').toLowerCase();
  return (
    raw.includes('invalid login credentials') ||
    raw.includes('invalid_credentials') ||
    raw.includes('invalid email or password') ||
    raw.includes('invalid_grant') ||
    code === 'invalid_credentials' ||
    code === 'invalid_grant'
  );
}

/**
 * Returns a friendly, localized auth error message from any Supabase / network /
 * unknown error. Never returns the raw English string; always falls back to the
 * generic loginError message if no specific match is found.
 */
export function friendlyAuthError(err: unknown, fallbackKey: string = 'auth.loginError'): string {
  const e: MaybeAuthError = err && typeof err === 'object' ? (err as MaybeAuthError) : {};
  const raw = (e.message || '').toLowerCase();
  const status = e.status;
  const code = e.code || '';

  // Network / fetch failures (offline, DNS, TLS).
  if (
    raw.includes('network request failed') ||
    raw.includes('failed to fetch') ||
    raw.includes('network error') ||
    raw.includes('fetch failed') ||
    code === 'ENOTFOUND' ||
    code === 'ECONNREFUSED'
  ) {
    return i18n.t('auth.networkError');
  }

  // Supabase: invalid credentials.
  if (
    raw.includes('invalid login credentials') ||
    raw.includes('invalid_credentials') ||
    raw.includes('invalid email or password')
  ) {
    return i18n.t('auth.invalidCredentials');
  }

  // Supabase: email not confirmed.
  if (
    raw.includes('email not confirmed') ||
    raw.includes('email_not_confirmed') ||
    raw.includes('confirmation')
  ) {
    return i18n.t('auth.emailNotConfirmed');
  }

  // Supabase: rate limit.
  if (
    raw.includes('too many requests') ||
    raw.includes('rate limit') ||
    raw.includes('over_request_rate_limit') ||
    status === 429
  ) {
    return i18n.t('auth.tooManyAttempts');
  }

  // Supabase: user not found / signup not allowed.
  if (
    raw.includes('user not found') ||
    raw.includes('user_not_found') ||
    raw.includes('signups not allowed')
  ) {
    return i18n.t('auth.userNotFound');
  }

  // 5xx / server / gateway / timeout: degrade to friendly server message.
  if (
    (typeof status === 'number' && status >= 500) ||
    raw.includes('gateway') ||
    raw.includes('timeout') ||
    raw.includes('service unavailable') ||
    raw.includes('internal server error')
  ) {
    return i18n.t('auth.serverError');
  }

  // Default fallback.
  return i18n.t(fallbackKey);
}

/**
 * Map Apple-specific error codes to friendly translated strings.
 * Codes documented at https://docs.expo.dev/versions/latest/sdk/apple-authentication/
 */
export function friendlyAppleAuthError(err: unknown): string | null {
  const e: MaybeAuthError = err && typeof err === 'object' ? (err as MaybeAuthError) : {};
  const code = e.code || '';

  // User cancelled — caller should not display anything.
  if (code === 'ERR_REQUEST_CANCELED') return null;

  if (code === 'ERR_REQUEST_NOT_HANDLED') return i18n.t('auth.appleNotConfigured');
  if (code === 'ERR_REQUEST_FAILED') return i18n.t('auth.appleNetworkError');
  if (code === 'ERR_REQUEST_NOT_INTERACTIVE') return i18n.t('auth.appleNotConfigured');
  if (code === 'ERR_INVALID_RESPONSE') return i18n.t('auth.appleInvalidResponse');
  if (code === 'ERR_REQUEST_UNKNOWN') return i18n.t('auth.appleSignInError');

  // Supabase ID-token exchange failure on the back end (post Apple success).
  return friendlyAuthError(err, 'auth.appleSignInError');
}
