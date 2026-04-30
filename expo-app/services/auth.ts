import { supabase } from './supabase';
// iOS 26 TurboModule crash defense — see services/sentry-shim.ts
import { addBreadcrumb } from './sentry-shim';

export async function signIn(email: string, password: string) {
  addBreadcrumb({ category: 'auth', message: 'Sign in attempt', level: 'info' });
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

export async function signUp(email: string, password: string, fullName: string) {
  addBreadcrumb({ category: 'auth', message: 'Sign up attempt', level: 'info' });
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
    },
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
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error;
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
