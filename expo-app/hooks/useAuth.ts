import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import * as authService from '../services/auth';
import i18n from '../i18n';
import type { Session, User } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    isLoading: true,
    isAuthenticated: false,
    error: null,
  });

  useEffect(() => {
    let mounted = true;

    // Apple-reviewer hardening (2026-04-27, App Completeness 2.1.0):
    // getSession() must NEVER leave isLoading=true forever. If the network is
    // bad (reviewer is often on slow wifi), if GoTrue is degraded, or if
    // SecureStore returns a corrupt token, the promise can hang/reject and
    // the splash screen would never hide -> Apple flags as "incomplete".
    // We race the promise against an 8s timeout and always resolve isLoading.
    const SESSION_TIMEOUT_MS = 8000;

    const sessionPromise = supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) {
          if (__DEV__) console.warn('[useAuth] getSession returned error:', error.message);
          return null;
        }
        return data.session;
      })
      .catch((err) => {
        if (__DEV__) console.warn('[useAuth] getSession threw:', err);
        return null;
      });

    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), SESSION_TIMEOUT_MS);
    });

    Promise.race([sessionPromise, timeoutPromise]).then((session) => {
      if (!mounted) return;
      setState({
        user: session?.user ?? null,
        session,
        isLoading: false,
        isAuthenticated: !!session,
        error: null,
      });
    });

    // Listen for auth changes (also resolves isLoading -> belt and suspenders)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setState((prev) => ({
        ...prev,
        user: session?.user ?? null,
        session,
        isAuthenticated: !!session,
        isLoading: false,
      }));
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      await authService.signIn(email, password);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : i18n.t('auth.loginError');
      setState((prev) => ({ ...prev, isLoading: false, error: message }));
      throw err;
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      await authService.signUp(email, password, fullName);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : i18n.t('auth.signUpError');
      setState((prev) => ({ ...prev, isLoading: false, error: message }));
      throw err;
    }
  }, []);

  const signOut = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      await authService.signOut();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : i18n.t('auth.signOutError');
      setState((prev) => ({ ...prev, isLoading: false, error: message }));
    }
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      await authService.resetPassword(email);
      setState((prev) => ({ ...prev, isLoading: false }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : i18n.t('auth.resetPasswordError');
      setState((prev) => ({ ...prev, isLoading: false, error: message }));
      throw err;
    }
  }, []);

  return {
    ...state,
    signIn,
    signUp,
    signOut,
    resetPassword,
    clearError,
  };
}
