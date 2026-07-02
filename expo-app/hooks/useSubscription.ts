export type SubscriptionPlan = 'free' | 'pro' | 'enterprise';

export interface SubscriptionState {
  /** Resolved entitlement plan. */
  plan: SubscriptionPlan;
  /** True when entitlement is `pro` or `enterprise`. */
  isPro: boolean;
  /** True while the first status fetch is in flight. */
  isLoading: boolean;
  /** Last error message, if any. */
  error: string | null;
  /** Force a fresh fetch. */
  refresh: () => Promise<void>;
}

// -----------------------------------------------------------------------------
// FREE BUILD OVERRIDE (2026-06-30) — fix/pragas-free-2026-06-30
// -----------------------------------------------------------------------------
// The app ships 100% FREE to clear Apple Guideline 2.3.2 (rejection tied to the
// In-App Purchase). Every Pro/premium feature is unlocked for ALL users and no
// paywall/buy button is ever shown. Entitlement is forced to `enterprise` so all
// `isPro` gates across the app (result screen, pest fact sheet, treatment
// library, PDF export, alternatives) pass unconditionally.
//
// RevenueCat is intentionally NOT consulted here — this hook is now pure and has
// no native dependency, so it can never downgrade a user or surface a gate.
//
// To re-introduce subscriptions later: revert this commit to restore the
// RevenueCat-backed implementation (git history) — the IAP products
// (`pragas_pro_monthly` / `pragas_pro_annual`) remain as drafts in App Store
// Connect.
// -----------------------------------------------------------------------------

const noop = async (): Promise<void> => {};

/**
 * Reactive subscription/entitlement hook.
 *
 * FREE BUILD: always reports the highest entitlement so nothing is ever locked.
 */
export function useSubscription(): SubscriptionState {
  return {
    plan: 'enterprise',
    isPro: true,
    isLoading: false,
    error: null,
    refresh: noop,
  };
}
