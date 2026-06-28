// -----------------------------------------------------------------------------
// useMonthlyUsage — premium gate read-only hook
// -----------------------------------------------------------------------------
// Returns the user's current diagnostic usage this calendar month and the
// limit derived from their active subscription plan:
//   free       → 3 diagnoses / month
//   pro        → 30 diagnoses / month
//   enterprise → unlimited (limit === null)
//
// Source of truth:
//   - `subscriptions.plan` row in Supabase (populated by the RevenueCat
//     webhook). RLS allows the user to SELECT their own row.
//   - `pragas_diagnoses` count for the current calendar month
//     (gte first-of-month).
//
// This hook NEVER writes. It mirrors the same SELECTs already used in
// `app/(tabs)/index.tsx` and `app/(tabs)/settings.tsx` — extracted to avoid
// triplicating the query and keep the camera/result UI cheap.
// -----------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabase';
import { useAuthContext } from '../contexts/AuthContext';
import { captureException } from '../services/sentry-shim';

export type SubscriptionPlan = 'free' | 'pro' | 'enterprise';

const PLAN_LIMITS: Record<SubscriptionPlan, number | null> = {
  free: 3,
  pro: 30,
  enterprise: null, // unlimited
};

interface UseMonthlyUsageResult {
  plan: SubscriptionPlan;
  used: number;
  /** null = unlimited (enterprise). */
  limit: number | null;
  /** Remaining diagnoses this month; null = unlimited. */
  remaining: number | null;
  /** True only when initial load is in-flight (subsequent refetches don't flip it). */
  loading: boolean;
  /** Set when both subscription and count queries failed; stale data is preserved. */
  error: boolean;
  /** Manually refetch — e.g. after navigating back from result screen. */
  refresh: () => Promise<void>;
}

export function useMonthlyUsage(): UseMonthlyUsageResult {
  const { user } = useAuthContext();
  const [plan, setPlan] = useState<SubscriptionPlan>('free');
  const [used, setUsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  // Last successfully-resolved plan. Used to avoid silently downgrading a
  // paying user to "free" when ONLY the subscription query fails transiently.
  const lastKnownPlanRef = useRef<SubscriptionPlan>('free');

  const refresh = useCallback(async () => {
    if (!user || inFlightRef.current) return;
    inFlightRef.current = true;
    setError(false);
    try {
      const firstOfMonth = new Date();
      firstOfMonth.setDate(1);
      firstOfMonth.setHours(0, 0, 0, 0);

      const [subResult, countResult] = await Promise.all([
        // `app` filter isolates Pragas entitlements on the shared jxcn
        // subscriptions table (migration 20260628120000). Requires the
        // `app` column to be live before this build ships.
        supabase
          .from('subscriptions')
          .select('plan, status')
          .eq('user_id', user.id)
          .eq('app', 'rumo-pragas')
          .maybeSingle(),
        supabase
          .from('pragas_diagnoses')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gte('created_at', firstOfMonth.toISOString()),
      ]);

      if (!mountedRef.current) return;

      // Subscription = single source of truth for the plan. If this query
      // FAILS, never silently fall back to "free" — that would gate a paying
      // user behind the paywall on a transient network/RLS blip. Capture the
      // error and preserve the last known plan instead.
      let resolvedPlan: SubscriptionPlan;
      if (subResult.error) {
        captureException(subResult.error, {
          tags: { area: 'subscription', fn: 'useMonthlyUsage' },
        });
        resolvedPlan = lastKnownPlanRef.current;
      } else {
        const sub = subResult.data;
        resolvedPlan =
          sub?.status === 'active' && (sub.plan === 'pro' || sub.plan === 'enterprise')
            ? (sub.plan as SubscriptionPlan)
            : 'free';
        lastKnownPlanRef.current = resolvedPlan;
      }

      setPlan(resolvedPlan);
      // Only overwrite the usage count on a successful count query; a failed
      // count keeps the previous value rather than blanking to 0.
      if (!countResult.error) {
        setUsed(countResult.count ?? 0);
      }

      // If BOTH queries errored, surface the error. A single failure keeps
      // the previous known value visible so the counter never blanks out
      // mid-session.
      if (subResult.error && countResult.error) {
        setError(true);
      }
    } catch (e) {
      if (__DEV__) console.warn('[useMonthlyUsage] refresh failed:', e);
      if (mountedRef.current) setError(true);
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    mountedRef.current = true;
    if (user) {
      refresh();
    } else {
      // Signed out → reset to a neutral free state so the UI never leaks
      // stale data from a previous session.
      lastKnownPlanRef.current = 'free';
      setPlan('free');
      setUsed(0);
      setLoading(false);
    }
    return () => {
      mountedRef.current = false;
    };
  }, [user, refresh]);

  const limit = PLAN_LIMITS[plan];
  const remaining = limit === null ? null : Math.max(0, limit - used);

  return { plan, used, limit, remaining, loading, error, refresh };
}
