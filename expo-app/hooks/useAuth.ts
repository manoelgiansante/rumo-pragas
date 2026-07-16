import { useState, useEffect, useCallback, useRef } from 'react';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { retainSupabaseAuthAutoRefresh, supabase } from '../services/supabase';
import * as authService from '../services/auth';
import { handleRecoveryDeepLink } from '../services/passwordRecovery';
import { flushPendingLocationConsent } from '../services/userPreferences';
import i18n from '../i18n';
import type { Session, User } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';
import { linkPragasAccount, reactivatePragasAccount } from '../services/pragasAccount';
import {
  claimPragasLocalDataOwner,
  clearPragasLocalDataOwner,
  purgePragasLocalUserData,
} from '../services/localDataPurge';
import { revokePushDeliveryForSignOut } from '../services/notifications';
import { waitForPendingAuthMetadata } from '../services/authMetadataGate';

export type PragasAccountStatus =
  | 'idle'
  | 'linking'
  | 'linked'
  | 'deleted_reactivation_required'
  | 'deletion_pending'
  | 'global_deletion_pending'
  | 'error';

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  appAccountStatus: PragasAccountStatus;
  appAccountError: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    isLoading: true,
    isAuthenticated: false,
    error: null,
    appAccountStatus: 'idle',
    appAccountError: null,
  });
  const mountedRef = useRef(true);
  const linkSequenceRef = useRef(0);
  const localOwnerRef = useRef<string | null>(null);
  const reactivationIdempotencyKeyRef = useRef(Crypto.randomUUID());

  const completeSessionLink = useCallback(
    async (session: Session, options: { claimOwnerlessLegacy: boolean }) => {
      const sequence = ++linkSequenceRef.current;
      setState((prev) => ({
        ...prev,
        user: session.user,
        session,
        isLoading: true,
        isAuthenticated: false,
        error: null,
        appAccountStatus: 'linking',
        appAccountError: null,
      }));

      try {
        // Apple supplies the name only once. Wait until the provider metadata
        // write has left auth-js's lock before linking or switching local owner.
        await waitForPendingAuthMetadata();
        if (!mountedRef.current || sequence !== linkSequenceRef.current) return;
        await claimPragasLocalDataOwner(session.user.id, options);
      } catch {
        if (!mountedRef.current || sequence !== linkSequenceRef.current) return;
        setState({
          user: session.user,
          session,
          isLoading: false,
          isAuthenticated: false,
          error: null,
          appAccountStatus: 'error',
          appAccountError: 'local_data_purge_failed',
        });
        return;
      }
      if (!mountedRef.current || sequence !== linkSequenceRef.current) return;
      localOwnerRef.current = session.user.id;

      const idempotencyKey = Crypto.randomUUID();
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const result = await linkPragasAccount(session.access_token, idempotencyKey);
          if (!mountedRef.current || sequence !== linkSequenceRef.current) return;
          if (result.linked) {
            setState({
              user: session.user,
              session,
              isLoading: false,
              isAuthenticated: true,
              error: null,
              appAccountStatus: 'linked',
              appAccountError: null,
            });
            void flushPendingLocationConsent(session.user.id);
          } else {
            setState({
              user: session.user,
              session,
              isLoading: false,
              isAuthenticated: false,
              error: null,
              appAccountStatus: result.code,
              appAccountError: null,
            });
          }
          return;
        } catch {
          if (attempt === 0) {
            await new Promise((resolve) => setTimeout(resolve, 300));
          }
        }
      }
      if (!mountedRef.current || sequence !== linkSequenceRef.current) return;
      setState({
        user: session.user,
        session,
        isLoading: false,
        isAuthenticated: false,
        error: null,
        appAccountStatus: 'error',
        appAccountError: 'link_unavailable',
      });
    },
    [],
  );

  useEffect(() => {
    let mounted = true;
    mountedRef.current = true;
    const releaseAutoRefresh = retainSupabaseAuthAutoRefresh();

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
          if (__DEV__) console.warn('[useAuth] getSession failed');
          return null;
        }
        return data.session;
      })
      .catch(() => {
        if (__DEV__) console.warn('[useAuth] getSession failed');
        return null;
      });

    // Hold the timer handle so cleanup can clear it. Without this, the 8s
    // timeout keeps ticking after getSession() wins the race (the normal path)
    // and after the component unmounts — a dangling timer that fires for no
    // reason in production and leaks the Jest worker (open-handle warning).
    let sessionTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<null>((resolve) => {
      sessionTimeoutTimer = setTimeout(() => resolve(null), SESSION_TIMEOUT_MS);
    });

    let initialLookupResolved = false;
    let initialBootstrapComplete = false;
    let initialBootstrapHadSession = false;
    let interactiveAuthObservedBeforeLookup = false;

    const initialBootstrapPromise = Promise.race([sessionPromise, timeoutPromise]).then(
      async (session) => {
        initialLookupResolved = true;
        // The race is settled — the timeout is no longer needed regardless of
        // which side won. Clear it so it cannot fire later.
        if (sessionTimeoutTimer) {
          clearTimeout(sessionTimeoutTimer);
          sessionTimeoutTimer = null;
        }
        if (!mounted) return;
        if (session) {
          initialBootstrapHadSession = true;
          // Marker-free legacy data may be adopted only by the account whose
          // session was already persisted at cold boot. If an interactive auth
          // event won the race, this is no longer proof of legacy ownership.
          await completeSessionLink(session, {
            claimOwnerlessLegacy: !interactiveAuthObservedBeforeLookup,
          });
        } else {
          ++linkSequenceRef.current;
          setState({
            user: null,
            session: null,
            isLoading: false,
            isAuthenticated: false,
            error: null,
            appAccountStatus: 'idle',
            appAccountError: null,
          });
        }
      },
    );
    void initialBootstrapPromise.finally(() => {
      initialBootstrapComplete = true;
    });

    // Listen for auth changes (also resolves isLoading -> belt and suspenders)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      // INITIAL_SESSION mirrors getSession() and is intentionally handled only
      // by the cold-boot path above. Every interactive callback is fail-closed.
      if (event === 'INITIAL_SESSION') {
        void initialBootstrapPromise.finally(() => {
          if (mounted && session && !initialBootstrapHadSession) {
            void completeSessionLink(session, { claimOwnerlessLegacy: false });
          }
        });
        return;
      }
      if (!initialLookupResolved) interactiveAuthObservedBeforeLookup = true;

      const applyAuthChange = () => {
        if (!mounted) return;
        if (session) {
          // Defer account RPC work out of Supabase's auth callback to avoid an
          // auth-js lock re-entry. Every valid session remains blocked until the
          // dedicated Pragas link contract resolves.
          setTimeout(() => {
            if (mounted) {
              void completeSessionLink(session, { claimOwnerlessLegacy: false });
            }
          }, 0);
        } else {
          ++linkSequenceRef.current;
          // Session loss can be a transient refresh/network failure. Retain the
          // encrypted owner marker and same-account offline queue. A later B login
          // must pass claimPragasLocalDataOwner, which purges A before admission.
          setState({
            user: null,
            session: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
            appAccountStatus: 'idle',
            appAccountError: null,
          });
        }
        // Belt-and-braces: if supabase-js ever surfaces PASSWORD_RECOVERY on its
        // own (e.g. a future flow with detectSessionInUrl enabled), route the
        // user to the in-app screen to set a new password instead of dropping
        // them on Home with a live recovery session.
        if (event === 'PASSWORD_RECOVERY') {
          router.replace('/update-password');
        }
      };

      if (!initialBootstrapComplete) {
        void initialBootstrapPromise.finally(applyAuthChange);
      } else {
        applyAuthChange();
      }
    });

    // ── Password-recovery deep link handling ──
    // The recovery e-mail opens `rumopragas://update-password#…tokens…`. With
    // detectSessionInUrl:false we must exchange the token ourselves, then route
    // to the update-password screen. Handles both cold start (getInitialURL)
    // and warm resume (url event).
    Linking.getInitialURL()
      .then((url) => {
        if (mounted) return handleRecoveryDeepLink(url);
      })
      .catch(() => {
        /* never block boot on a deep-link parse failure */
      });
    const linkSub = Linking.addEventListener('url', ({ url }) => {
      if (mounted) void handleRecoveryDeepLink(url);
    });

    return () => {
      mounted = false;
      mountedRef.current = false;
      if (sessionTimeoutTimer) {
        clearTimeout(sessionTimeoutTimer);
        sessionTimeoutTimer = null;
      }
      subscription.unsubscribe();
      linkSub.remove();
      releaseAutoRefresh();
    };
  }, [completeSessionLink]);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const result = await authService.signIn(email, password);
        if (result?.session) {
          await completeSessionLink(result.session, { claimOwnerlessLegacy: false });
        }
      } catch (err: unknown) {
        const message = i18n.t('auth.loginError');
        setState((prev) => ({ ...prev, isLoading: false, error: message }));
        throw new Error(message, { cause: err });
      }
    },
    [completeSessionLink],
  );

  const signUp = useCallback(
    async (email: string, password: string, fullName?: string) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        // Return the result so the caller can distinguish auto-confirm (session
        // present → the gate logs the user straight in) from "confirm email"
        // (session null → we must tell the user to check their inbox). Showing
        // the "check your email" alert unconditionally stranded already-signed-in
        // users on the login modal when e-mail confirmation is OFF.
        const result = await authService.signUp(email, password, fullName);
        if (result?.session) {
          await completeSessionLink(result.session, { claimOwnerlessLegacy: false });
        }
        return result;
      } catch (err: unknown) {
        const message = i18n.t('auth.signUpError');
        setState((prev) => ({ ...prev, isLoading: false, error: message }));
        throw new Error(message, { cause: err });
      }
    },
    [completeSessionLink],
  );

  const signOut = useCallback(async (): Promise<boolean> => {
    // Invalidate metadata/owner/link work already in flight before cleanup.
    ++linkSequenceRef.current;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    // Remote/native push revocation is best effort and must not block exit.
    try {
      await revokePushDeliveryForSignOut();
    } catch {
      // The server also rejects stale delivery after the session is gone.
    }
    const owner = localOwnerRef.current ?? state.user?.id ?? null;
    let purgeSucceeded = owner === null;
    if (owner) {
      try {
        await purgePragasLocalUserData(owner);
        purgeSucceeded = true;
      } catch {
        // Keep the encrypted owner marker. B remains blocked until retry cleans A.
      }
    }

    let signOutSucceeded = false;
    try {
      await authService.signOut();
      signOutSucceeded = true;
    } catch {
      // Report below, after every safe local/remote attempt has completed.
    }

    let ownerCleared = owner === null;
    if (signOutSucceeded && purgeSucceeded && owner) {
      try {
        await clearPragasLocalDataOwner(owner);
        ownerCleared = true;
      } catch {
        // Retaining the marker is fail-closed and forces cleanup before B.
      }
    }

    if (signOutSucceeded && purgeSucceeded && ownerCleared) {
      localOwnerRef.current = null;
      setState({
        user: null,
        session: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
        appAccountStatus: 'idle',
        appAccountError: null,
      });
      return true;
    }

    const message = i18n.t('auth.signOutError');
    setState((prev) => ({
      ...prev,
      ...(signOutSucceeded
        ? {
            user: null,
            session: null,
            isAuthenticated: false,
            appAccountStatus: 'idle' as const,
          }
        : {}),
      isLoading: false,
      error: message,
      appAccountError: purgeSucceeded ? message : 'local_data_purge_failed',
    }));
    return false;
  }, [state.user?.id]);

  const resetPassword = useCallback(async (email: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      await authService.resetPassword(email);
      setState((prev) => ({ ...prev, isLoading: false }));
    } catch (err: unknown) {
      const message = i18n.t('auth.resetPasswordError');
      setState((prev) => ({ ...prev, isLoading: false, error: message }));
      throw new Error(message, { cause: err });
    }
  }, []);

  const retryPragasAccountLink = useCallback(async () => {
    if (!state.session) return;
    await completeSessionLink(state.session, { claimOwnerlessLegacy: false });
  }, [completeSessionLink, state.session]);

  const reactivatePragas = useCallback(async () => {
    if (!state.session || state.appAccountStatus !== 'deleted_reactivation_required') return;
    setState((prev) => ({
      ...prev,
      isLoading: true,
      appAccountStatus: 'linking',
      appAccountError: null,
    }));
    try {
      await reactivatePragasAccount(
        state.session.access_token,
        reactivationIdempotencyKeyRef.current,
      );
      reactivationIdempotencyKeyRef.current = Crypto.randomUUID();
      await completeSessionLink(state.session, { claimOwnerlessLegacy: false });
    } catch {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        isAuthenticated: false,
        appAccountStatus: 'deleted_reactivation_required',
        appAccountError: 'reactivation_unavailable',
      }));
    }
  }, [completeSessionLink, state.appAccountStatus, state.session]);

  return {
    ...state,
    signIn,
    signUp,
    signOut,
    resetPassword,
    clearError,
    retryPragasAccountLink,
    reactivatePragas,
  };
}
