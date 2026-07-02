// -----------------------------------------------------------------------------
// useMonthlyUsage — diagnostic-usage hook
// -----------------------------------------------------------------------------
// FREE BUILD OVERRIDE (2026-06-30) — fix/pragas-free-2026-06-30
//
// The app ships 100% FREE (Apple Guideline 2.3.2). AI pest diagnoses are now
// UNLIMITED for everyone, so there is no monthly cap to enforce or display.
// This hook unconditionally reports the `enterprise` (unlimited) plan with a
// `null` limit, which:
//   • makes <UsageCounter/> render nothing (no "X/3 left" pill, no upgrade tap),
//   • makes the Home trial-counter / paywall CTA unreachable (isFreePlan=false),
//   • removes the dependency on the shared `subscriptions` table entirely.
//
// The return shape is unchanged so every caller keeps type-checking. To restore
// metered usage later, revert this commit (git history has the Supabase-backed
// implementation).
// -----------------------------------------------------------------------------

export type SubscriptionPlan = 'free' | 'pro' | 'enterprise';

export const PLAN_LIMITS: Record<SubscriptionPlan, number | null> = {
  free: null, // FREE BUILD: unlimited for everyone
  pro: null,
  enterprise: null, // unlimited
};

interface UseMonthlyUsageResult {
  plan: SubscriptionPlan;
  used: number;
  /** null = unlimited. */
  limit: number | null;
  /** Remaining diagnoses this month; null = unlimited. */
  remaining: number | null;
  /** True only when initial load is in-flight. */
  loading: boolean;
  /** Set when queries failed; stale data is preserved. */
  error: boolean;
  /** Manually refetch. */
  refresh: () => Promise<void>;
}

const noop = async (): Promise<void> => {};

export function useMonthlyUsage(): UseMonthlyUsageResult {
  // FREE BUILD: unlimited, never loading, never errored.
  return {
    plan: 'enterprise',
    used: 0,
    limit: null,
    remaining: null,
    loading: false,
    error: false,
    refresh: noop,
  };
}
