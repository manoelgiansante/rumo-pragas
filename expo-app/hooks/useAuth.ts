import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';
import * as authService from '../services/auth';
import { friendlyAuthError, isInvalidCredentialsError } from '../services/authErrors';
import i18n from '../i18n';
import type { Session, User } from '@supabase/supabase-js';

// Local AsyncStorage keys cleared on logout to prevent cross-account bleed
// (P0 mega audit 2026-05-13). Keep this list in sync with consumers.
const LOGOUT_ASYNC_STORAGE_KEYS = [
  '@rumo_pragas_push_enabled',
  '@rumo_pragas_onboarding_seen',
  '@rumo_pragas_location_consent_shown',
  '@rumo_pragas_push_token',
  '@rumo_pragas_chat_history',
];

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
      // Apple Guideline 2.1(a) reviewer fix (2026-05-07, v1.0.6):
      // For invalid credentials specifically, SILENT-FAIL — no toast, no banner,
      // no inline error string. Apple flagged the friendly PT-BR error as a
      // "bug" even though the reviewer's subsequent correct-password attempt
      // logged them in successfully. Screen reacts with a subtle shake instead.
      // For all OTHER errors (network, 5xx, email_not_confirmed, rate limit,
      // unknown), keep the friendly translated message — those are real failures
      // the user must understand.
      if (isInvalidCredentialsError(err)) {
        setState((prev) => ({ ...prev, isLoading: false, error: null }));
      } else {
        const message = friendlyAuthError(err, 'auth.loginError');
        setState((prev) => ({ ...prev, isLoading: false, error: message }));
      }
      throw err;
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      await authService.signUp(email, password, fullName);
    } catch (err: unknown) {
      const message = friendlyAuthError(err, 'auth.signUpError');
      setState((prev) => ({ ...prev, isLoading: false, error: message }));
      throw err;
    }
  }, []);

  const signOut = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      // P0 (mega audit 2026-05-13): cross-account bleed prevention.
      // RevenueCat anonymizes the customer id on logOut so the next signed-in
      // user gets a fresh state instead of inheriting the previous user's
      // entitlements/customer info. Wrapped in try/catch so a missing /
      // unconfigured RC module never blocks Supabase sign out.
      try {
        const Purchases = require('react-native-purchases').default;
        if (Purchases?.logOut) {
          await Purchases.logOut();
        }
      } catch (rcErr) {
        if (__DEV__) console.warn('[useAuth] Purchases.logOut failed (non-fatal):', rcErr);
      }

      // Best-effort wipe of app-level AsyncStorage keys that persist user
      // preferences/state. Auth tokens live in SecureStore (Supabase client),
      // those are handled by `authService.signOut()` below.
      try {
        await AsyncStorage.multiRemove(LOGOUT_ASYNC_STORAGE_KEYS);
      } catch (asErr) {
        if (__DEV__) console.warn('[useAuth] AsyncStorage cleanup failed (non-fatal):', asErr);
      }

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
      const message = friendlyAuthError(err, 'auth.resetPasswordError');
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
