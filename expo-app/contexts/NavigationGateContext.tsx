/**
 * NavigationGateContext — reactive holder for the cold-start routing flags.
 *
 * WHY THIS EXISTS (Sentry RUMO-PRAGAS-7/8, Apple 2.1.0):
 * The two gate flags (`hasSeenOnboarding`, `hasSeenLocationConsent`) used to live
 * as local `useState` inside `RootLayoutNav`, read from AsyncStorage exactly once
 * on mount and NEVER refreshed. When `consent-location` wrote the consent flag to
 * storage and self-navigated, the layout's copy stayed stale `false`, so the
 * layout's navigation effect bounced the user back to `/consent-location` — an
 * infinite ping-pong that exceeded React's update-depth limit on iPad/iOS 26
 * (because `useSegments()` is a `useSyncExternalStore` whose churn re-enters the
 * effect).
 *
 * Lifting the flags here makes them a SINGLE reactive source of truth:
 *   - The layout reads `hasSeenOnboarding` / `hasSeenLocationConsent` and routes.
 *   - `onboarding` calls `markOnboardingSeen()` when finished.
 *   - `consent-location` calls `markLocationConsentSeen()` when finished.
 * The setters update the provider state synchronously (and persist to storage),
 * so the layout's routing effect re-runs with FRESH flags and routes the user
 * forward exactly once — no stale read, no dual writer, no oscillation.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  persistLocationConsentSeen,
  persistOnboardingSeen,
  readGateFlags,
} from '../services/navigationGate';

interface NavigationGateValue {
  /** null until the initial AsyncStorage read resolves */
  hasSeenOnboarding: boolean | null;
  /** null until the initial AsyncStorage read resolves */
  hasSeenLocationConsent: boolean | null;
  /** Mark onboarding complete: updates state reactively + persists to storage. */
  markOnboardingSeen: () => void;
  /** Mark location consent shown: updates state reactively + persists to storage. */
  markLocationConsentSeen: () => void;
}

const NavigationGateContext = createContext<NavigationGateValue | null>(null);

export function NavigationGateProvider({
  children,
  userId = null,
}: {
  children: React.ReactNode;
  userId?: string | null;
}) {
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState<boolean | null>(null);
  const [hasSeenLocationConsent, setHasSeenLocationConsent] = useState<boolean | null>(null);

  // Onboarding is device-scoped; location disclosure is account-scoped.
  useEffect(() => {
    let mounted = true;
    setHasSeenLocationConsent(null);
    readGateFlags(userId)
      .then(({ hasSeenOnboarding: onboarding, hasSeenLocationConsent: consent }) => {
        if (!mounted) return;
        setHasSeenOnboarding(onboarding);
        setHasSeenLocationConsent(consent);
      })
      .catch(() => {
        // readGateFlags never throws, but guard anyway: default to "not seen"
        // so the gate routes to onboarding/login rather than stalling on null.
        if (!mounted) return;
        setHasSeenOnboarding(false);
        setHasSeenLocationConsent(false);
      });
    return () => {
      mounted = false;
    };
  }, [userId]);

  const markOnboardingSeen = useCallback(() => {
    // Reactive update FIRST so the layout effect re-runs with the fresh flag
    // before navigation, then fire-and-forget persistence.
    setHasSeenOnboarding(true);
    void persistOnboardingSeen();
  }, []);

  const markLocationConsentSeen = useCallback(() => {
    if (!userId) return;
    setHasSeenLocationConsent(true);
    void persistLocationConsentSeen(userId);
  }, [userId]);

  const value = useMemo<NavigationGateValue>(
    () => ({
      hasSeenOnboarding,
      hasSeenLocationConsent,
      markOnboardingSeen,
      markLocationConsentSeen,
    }),
    [hasSeenOnboarding, hasSeenLocationConsent, markOnboardingSeen, markLocationConsentSeen],
  );

  return <NavigationGateContext.Provider value={value}>{children}</NavigationGateContext.Provider>;
}

export function useNavigationGate(): NavigationGateValue {
  const ctx = useContext(NavigationGateContext);
  if (!ctx) {
    throw new Error('useNavigationGate must be used within a NavigationGateProvider');
  }
  return ctx;
}
