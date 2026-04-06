/**
 * Subscription Sync Service
 *
 * Keeps Supabase subscription record in sync with RevenueCat.
 * Listens for purchase events from RevenueCat and updates
 * the subscriptions table accordingly.
 */

import Purchases, { CustomerInfo } from 'react-native-purchases';
import { supabase } from './supabase';
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
 * Sync current RevenueCat state to Supabase for a specific user.
 * Call this after login, after purchases, or periodically.
 */
export async function syncSubscriptionToSupabase(userId: string): Promise<void> {
  if (!isRevenueCatConfigured()) return;

  try {
    const customerInfo = await Purchases.getCustomerInfo();
    const info = deriveSubscriptionInfo(customerInfo);

    const updatePayload: Record<string, unknown> = {
      plan: info.plan,
      status: info.status,
      provider: info.provider,
    };

    if (info.periodEnd) {
      updatePayload.current_period_end = info.periodEnd;
    }

    const { error } = await supabase
      .from('subscriptions')
      .update(updatePayload)
      .eq('user_id', userId);

    if (error) {
      console.error('[SubscriptionSync] Failed to sync:', error);
    } else {
      console.log('[SubscriptionSync] Synced:', info.plan, info.status);
    }
  } catch (err) {
    console.error('[SubscriptionSync] Error:', err);
  }
}

/**
 * Register a RevenueCat listener that auto-syncs subscription changes.
 * Call once after Purchases.configure() and after getting the user ID.
 */
export function startSubscriptionListener(userId: string): void {
  if (!isRevenueCatConfigured()) return;
  if (listenerRegistered) return;

  Purchases.addCustomerInfoUpdateListener(async (customerInfo: CustomerInfo) => {
    console.log('[SubscriptionSync] CustomerInfo updated');
    const info = deriveSubscriptionInfo(customerInfo);

    const updatePayload: Record<string, unknown> = {
      plan: info.plan,
      status: info.status,
      provider: info.provider,
    };

    if (info.periodEnd) {
      updatePayload.current_period_end = info.periodEnd;
    }

    try {
      const { error } = await supabase
        .from('subscriptions')
        .update(updatePayload)
        .eq('user_id', userId);

      if (error) {
        console.error('[SubscriptionSync] Listener sync failed:', error);
      }
    } catch (err) {
      console.error('[SubscriptionSync] Listener error:', err);
    }
  });

  listenerRegistered = true;
  console.log('[SubscriptionSync] Listener registered');
}

/**
 * Stop subscription listener. Call on logout.
 */
export function stopSubscriptionListener(): void {
  // RevenueCat SDK doesn't expose removeListener, so we just flag it
  listenerRegistered = false;
}
