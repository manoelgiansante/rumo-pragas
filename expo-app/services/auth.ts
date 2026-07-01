import * as Linking from 'expo-linking';
import { supabase } from './supabase';
// iOS 26 TurboModule crash defense — see services/sentry-shim.ts
import { addBreadcrumb } from './sentry-shim';

/**
 * Deep link the password-recovery e-mail should send the user back to. In a
 * standalone build `Linking.createURL('/update-password')` resolves to
 * `rumopragas://update-password` (the scheme is declared in app.json). Supabase
 * only honours this when the URL is in the project's "Redirect URLs" allow
 * list; otherwise it safely falls back to the hosted Site URL page (the prior
 * behaviour), so passing it can only improve the flow, never break it.
 */
export const PASSWORD_RECOVERY_REDIRECT = Linking.createURL('/update-password');

export async function signIn(email: string, password: string) {
  addBreadcrumb({ category: 'auth', message: 'Sign in attempt', level: 'info' });
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

/**
 * Sign up a new user.
 *
 * QW-3 (W16-1, 2026-05-22): `fullName` is now optional. When omitted, no
 * `full_name` key is written to user_metadata so the profile row keeps NULL
 * (rather than an empty string the UI would have to special-case). Users can
 * fill it later from the edit-profile screen.
 */
export async function signUp(email: string, password: string, fullName?: string) {
  addBreadcrumb({ category: 'auth', message: 'Sign up attempt', level: 'info' });
  const trimmedName = fullName?.trim();
  const userMetadata = trimmedName ? { full_name: trimmedName } : undefined;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // Only include `options` when we have metadata — omitting the key is the
    // same as passing `undefined` at runtime, but satisfies
    // exactOptionalPropertyTypes (options is optional, not `T | undefined`).
    ...(userMetadata ? { options: { data: userMetadata } } : {}),
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  addBreadcrumb({ category: 'auth', message: 'Sign out', level: 'info' });
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function resetPassword(email: string) {
  addBreadcrumb({ category: 'auth', message: 'Reset password request', level: 'info' });
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: PASSWORD_RECOVERY_REDIRECT,
  });
  if (error) throw error;
}

/**
 * Sets a new password for the CURRENTLY authenticated user. Used by the in-app
 * update-password screen after the recovery deep link establishes a session.
 * The user must already be signed in (recovery session), otherwise Supabase
 * returns an AuthSessionMissingError which the caller surfaces.
 */
export async function updatePassword(newPassword: string) {
  addBreadcrumb({ category: 'auth', message: 'Update password', level: 'info' });
  const { data, error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
  return data;
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function refreshSession() {
  const { data, error } = await supabase.auth.refreshSession();
  if (error) throw error;
  return data.session;
}
