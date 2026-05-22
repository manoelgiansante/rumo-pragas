import { useEffect, useState, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { checkSubscriptionStatus, isRevenueCatConfigured } from '../services/purchases';

export type SubscriptionPlan = 'free' | 'pro' | 'enterprise';

export interface SubscriptionState {
  /** Resolved entitlement plan from RevenueCat. */
  plan: SubscriptionPlan;
  /** True when entitlement is `pro` or `enterprise`. */
  isPro: boolean;
  /** True while the first status fetch is in flight. */
  isLoading: boolean;
  /** Last error message, if any. Never throws — degrades to `free`. */
  error: string | null;
  /** Force a fresh fetch (e.g. after returning from paywall). */
  refresh: () => Promise<void>;
}

/**
 * Reactive subscription/entitlement hook.
 *
 * - Treats RevenueCat-not-configured as `free` (graceful degradation, never crashes).
 * - Re-checks when the app comes back to foreground so the gate reflects
 *   purchases made on another device or in the paywall mid-session.
 * - Never throws: all errors are swallowed and reflected via `error`.
 */
export function useSubscription(): SubscriptionState {
  const [plan, setPlan] = useState<SubscriptionPlan>('free');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async (): Promise<void> => {
    if (!isRevenueCatConfigured()) {
      setPlan('free');
      setIsLoading(false);
      return;
    }
    try {
      const status = await checkSubscriptionStatus();
      setPlan(status.plan);
      setError(status.error ?? null);
    } catch (e) {
      // Never crash the gate — fall back to free.
      setPlan('free');
      setError(e instanceof Error ? e.message : 'subscription check failed');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      await fetchStatus();
      if (!mounted) return;
    })();
    const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status === 'active') {
        void fetchStatus();
      }
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, [fetchStatus]);

  return {
    plan,
    isPro: plan === 'pro' || plan === 'enterprise',
    isLoading,
    error,
    refresh: fetchStatus,
  };
}
