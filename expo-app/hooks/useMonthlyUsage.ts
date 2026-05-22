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

  const refresh = useCallback(async () => {
    if (!user || inFlightRef.current) return;
    inFlightRef.current = true;
    setError(false);
    try {
      const firstOfMonth = new Date();
      firstOfMonth.setDate(1);
      firstOfMonth.setHours(0, 0, 0, 0);

      const [subResult, countResult] = await Promise.all([
        supabase.from('subscriptions').select('plan, status').eq('user_id', user.id).maybeSingle(),
        supabase
          .from('pragas_diagnoses')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gte('created_at', firstOfMonth.toISOString()),
      ]);

      if (!mountedRef.current) return;

      const sub = subResult.data;
      const resolvedPlan: SubscriptionPlan =
        sub?.status === 'active' && (sub.plan === 'pro' || sub.plan === 'enterprise')
          ? (sub.plan as SubscriptionPlan)
          : 'free';

      setPlan(resolvedPlan);
      setUsed(countResult.count ?? 0);

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
