/**
 * Password-recovery deep-link handler.
 *
 * The Supabase recovery e-mail redirects to `rumopragas://update-password`
 * (see PASSWORD_RECOVERY_REDIRECT in services/auth.ts). Because the Supabase
 * client is created with `detectSessionInUrl: false` (mobile — SecureStore is
 * the source of truth, not the URL bar), supabase-js does NOT automatically
 * exchange the recovery token that arrives on that deep link. This module does
 * it explicitly, supporting BOTH auth flow types:
 *
 *   • PKCE     → `?code=<code>`                         → exchangeCodeForSession
 *   • implicit → `#access_token=…&refresh_token=…&type=recovery` → setSession
 *
 * On a successful recovery exchange the user is routed to the in-app
 * `/update-password` screen so they can set a new password without depending on
 * the hosted Supabase web page. Any parse/exchange failure degrades silently
 * (reported to Sentry) — the hosted fallback page still completes the reset.
 */
import { router } from 'expo-router';
import { captureMessage } from './sentry-shim';
import { supabase } from './supabase';

function parseAuthParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const collect = (segment: string) => {
    for (const pair of segment.split('&')) {
      if (!pair) continue;
      const eq = pair.indexOf('=');
      const key = eq >= 0 ? pair.slice(0, eq) : pair;
      const value = eq >= 0 ? pair.slice(eq + 1) : '';
      try {
        params[decodeURIComponent(key)] = decodeURIComponent(value);
      } catch {
        params[key] = value;
      }
    }
  };

  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');
  if (queryIndex >= 0) {
    collect(url.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined));
  }
  if (hashIndex >= 0) {
    collect(url.slice(hashIndex + 1));
  }
  return params;
}

/**
 * Handles an incoming deep link that MAY carry a password-recovery token.
 * Returns true when a recovery session was established (and navigation issued),
 * false otherwise (non-recovery links are ignored so normal routing proceeds).
 */
export async function handleRecoveryDeepLink(url: string | null): Promise<boolean> {
  if (!url) return false;

  // Cheap guard: only touch URLs that look like an auth callback.
  const looksLikeAuth =
    url.includes('type=recovery') ||
    url.includes('access_token=') ||
    url.includes('code=') ||
    url.includes('update-password');
  if (!looksLikeAuth) return false;

  try {
    const params = parseAuthParams(url);
    const isRecovery = params.type === 'recovery' || url.includes('update-password');

    if (params.code) {
      const { error } = await supabase.auth.exchangeCodeForSession(params.code);
      if (error) throw error;
      if (isRecovery) router.replace('/update-password');
      return isRecovery;
    }

    if (params.access_token && params.refresh_token) {
      const { error } = await supabase.auth.setSession({
        access_token: params.access_token,
        refresh_token: params.refresh_token,
      });
      if (error) throw error;
      if (isRecovery) router.replace('/update-password');
      return isRecovery;
    }

    return false;
  } catch {
    try {
      // Never capture provider errors or the callback URL: either may contain
      // access_token, refresh_token, PKCE code or user-identifying details.
      captureMessage('password recovery deep-link exchange failed', {
        level: 'error',
        tags: { feature: 'auth', step: 'recovery_deeplink' },
      });
    } catch {
      /* Sentry must never crash the caller */
    }
    return false;
  }
}
