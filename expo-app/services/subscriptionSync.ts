/**
 * Subscription Sync Service
 *
 * Source of truth for subscription state is the RevenueCat -> Supabase
 * webhook (service_role). RLS blocks client-side writes to `subscriptions`,
 * so this module intentionally does NOT attempt UPDATEs from the app.
 *
 * What this module does:
 *  - Keeps a RevenueCat CustomerInfo listener alive.
 *  - On updates, logs (in dev) the derived plan/status so we can debug
 *    drift between RevenueCat and Supabase.
 *  - Consumers should refetch the `subscriptions` row from Supabase
 *    (populated by the webhook) whenever they need authoritative state.
 */

import Purchases, { CustomerInfo } from 'react-native-purchases';
import { isRevenueCatConfigured } from './purchases';

type SubscriptionPlan = 'free' | 'pro' | 'enterprise';
type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing';

let listenerRegistered = false;

/**
 * Derive plan + status from RevenueCat CustomerInfo.
 */
function deriveSubscriptionInfo(customerInfo: CustomerInfo): {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  provider: 'apple' | 'google' | 'free';
  periodEnd?: string;
} {
  // Check entitlements in priority order
  if (customerInfo.entitlements.active['enterprise']) {
    const entitlement = customerInfo.entitlements.active['enterprise'];
    return {
      plan: 'enterprise',
      status: entitlement.willRenew ? 'active' : 'canceled',
      provider: entitlement.store === 'PLAY_STORE' ? 'google' : 'apple',
      periodEnd: entitlement.expirationDate ?? undefined,
    };
  }

  if (customerInfo.entitlements.active['pro']) {
    const entitlement = customerInfo.entitlements.active['pro'];
    return {
      plan: 'pro',
      status: entitlement.willRenew ? 'active' : 'canceled',
      provider: entitlement.store === 'PLAY_STORE' ? 'google' : 'apple',
      periodEnd: entitlement.expirationDate ?? undefined,
    };
  }

  return {
    plan: 'free',
    status: 'active',
    provider: 'free',
  };
}

/**
 * Pull current RevenueCat state for a user (no writes).
 *
 * REMOVED: Client UPDATE blocked by RLS (only service_role can write).
 * Subscription state is authoritative via RevenueCat webhook.
 * Callers should refresh their local cache by re-selecting from Supabase
 * after this resolves — the webhook will have reconciled server-side.
 */
export async function syncSubscriptionToSupabase(_userId: string): Promise<void> {
  if (!isRevenueCatConfigured()) return;

  try {
    const customerInfo = await Purchases.getCustomerInfo();
    const info = deriveSubscriptionInfo(customerInfo);
    if (__DEV__) {
      console.warn(
        '[SubscriptionSync] RC state (webhook is source of truth):',
        info.plan,
        info.status,
      );
    }
  } catch (err) {
    if (__DEV__) console.error('[SubscriptionSync] Error:', err);
  }
}

/**
 * Register a RevenueCat listener for diagnostics only.
 *
 * REMOVED: Client UPDATE blocked by RLS (only service_role can write).
 * Subscription state is authoritative via RevenueCat webhook.
 * This listener only logs drift in dev so we can investigate; it does not
 * attempt to write to Supabase. UI screens should re-select the
 * `subscriptions` row after purchase flows to pick up webhook-applied state.
 */
export function startSubscriptionListener(_userId: string): void {
  if (!isRevenueCatConfigured()) return;
  if (listenerRegistered) return;

  Purchases.addCustomerInfoUpdateListener((customerInfo: CustomerInfo) => {
    if (__DEV__) {
      const info = deriveSubscriptionInfo(customerInfo);
      console.warn(
        '[SubscriptionSync] CustomerInfo updated (webhook authoritative):',
        info.plan,
        info.status,
      );
    }
  });

  listenerRegistered = true;
  if (__DEV__) console.warn('[SubscriptionSync] Listener registered (read-only)');
}

/**
 * Stop subscription listener. Call on logout.
 */
export function stopSubscriptionListener(): void {
  listenerRegistered = false;
}
