import type { PurchasesPackage, CustomerInfo } from 'react-native-purchases';
import { Platform } from 'react-native';
import i18n from '../i18n';
import { captureException } from './sentry-shim';

// iOS 26 cold-start freeze defense (Apple Guideline 2.1(a)):
// `react-native-purchases` is a StoreKit-backed native (Turbo)Module. A
// top-level `import Purchases from 'react-native-purchases'` evaluates and
// registers that native module at JS bundle-eval time. On iPad / iOS 26 New
// Architecture this can stall or throw during cold start before the bridge is
// ready (the recurring "freezes on loading screen" rejection class). We instead
// require() the module lazily, the first time a purchases API is actually
// invoked (paywall mount, post-login sync) — never during module evaluation.
//
// We only import the TYPES statically above (erased at compile time — zero
// runtime cost) so the rest of the file stays fully typed.
type PurchasesModule = typeof import('react-native-purchases').default;

let cachedPurchases: PurchasesModule | null = null;

function getPurchases(): PurchasesModule {
  if (cachedPurchases) return cachedPurchases;

  cachedPurchases = require('react-native-purchases').default as PurchasesModule;
  return cachedPurchases;
}

const REVENUECAT_API_KEY_IOS = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || '';
const REVENUECAT_API_KEY_ANDROID = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY || '';

/**
 * Check if RevenueCat is configured (API keys present).
 * When keys are missing the app gracefully falls back to "coming soon" behaviour.
 */
export function isRevenueCatConfigured(): boolean {
  const apiKey = Platform.OS === 'ios' ? REVENUECAT_API_KEY_IOS : REVENUECAT_API_KEY_ANDROID;
  return apiKey.length > 0;
}

/**
 * Initialise RevenueCat -- call once at app startup.
 * If an authenticated userId is passed, the user is identified so purchases
 * follow them across devices.
 */
export async function initializePurchases(userId?: string): Promise<void> {
  const apiKey = Platform.OS === 'ios' ? REVENUECAT_API_KEY_IOS : REVENUECAT_API_KEY_ANDROID;

  if (!apiKey) {
    if (__DEV__) console.warn('[RevenueCat] API key not configured -- skipping initialisation');
    return;
  }

  getPurchases().configure({ apiKey, appUserID: userId ?? null });
}

/**
 * Identify an already-initialised anonymous Purchases user with a Supabase
 * user id.  Safe to call multiple times (RevenueCat deduplicates).
 */
export async function identifyUser(userId: string): Promise<void> {
  if (!isRevenueCatConfigured()) return;
  try {
    await getPurchases().logIn(userId);
  } catch (e) {
    if (__DEV__) console.error('[RevenueCat] Failed to identify user:', e);
  }
}

/**
 * Get available packages / offerings configured in the RevenueCat dashboard.
 */
export async function getOfferings(): Promise<PurchasesPackage[]> {
  try {
    const offerings = await getPurchases().getOfferings();
    if (offerings.current) {
      return offerings.current.availablePackages;
    }
    return [];
  } catch (e) {
    if (__DEV__) console.error('[RevenueCat] Failed to get offerings:', e);
    // ZERO-O: money-path failures must be observable in prod, not just __DEV__.
    // Keep the graceful empty-array fallback for the UI.
    if (isRevenueCatConfigured()) {
      captureException(e, { tags: { area: 'revenuecat', fn: 'getOfferings' } });
    }
    return [];
  }
}

/**
 * Purchase a specific package.
 * Returns CustomerInfo on success, null if the user cancelled, or throws on
 * other errors.
 */
export async function purchasePackage(pkg: PurchasesPackage): Promise<CustomerInfo | null> {
  try {
    const { customerInfo } = await getPurchases().purchasePackage(pkg);
    return customerInfo;
  } catch (e: unknown) {
    // User cancellation is not a real error. We avoid statically importing the
    // PURCHASES_ERROR_CODE enum as a runtime VALUE (which would re-introduce
    // module-eval of react-native-purchases). Instead we read the enum lazily
    // inside this catch block — it only runs on a purchase failure, long after
    // cold start. We also accept the `userCancelled` boolean that RC v9 sets,
    // and fall back to the known enum value ("1") if the lazy require fails.
    if (e instanceof Object) {
      if ('userCancelled' in e && (e as { userCancelled?: boolean }).userCancelled === true) {
        return null;
      }
      if ('code' in e) {
        const code = (e as { code: unknown }).code;
        let cancelledCode: unknown = '1';
        try {
          cancelledCode =
            require('react-native-purchases').PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR;
        } catch {
          /* keep fallback '1' */
        }
        if (code === cancelledCode) {
          return null; // user cancelled -- not an error
        }
      }
    }
    throw e;
  }
}

/**
 * Check current subscription status by inspecting active entitlements.
 * Entitlement identifiers should match what is configured in the RevenueCat
 * dashboard ("pro" and "enterprise").
 */
export async function checkSubscriptionStatus(): Promise<{
  plan: 'free' | 'pro' | 'enterprise';
  isActive: boolean;
  error?: string;
}> {
  try {
    const customerInfo = await getPurchases().getCustomerInfo();
    if (customerInfo.entitlements.active['enterprise']) {
      return { plan: 'enterprise', isActive: true };
    }
    if (customerInfo.entitlements.active['pro']) {
      return { plan: 'pro', isActive: true };
    }
    return { plan: 'free', isActive: false };
  } catch (e) {
    if (__DEV__) console.error('[RevenueCat] Failed to check subscription status:', e);
    // ZERO-O: a silent entitlement-check failure can silently downgrade a paying
    // user to "free". Capture in prod; keep the graceful free fallback.
    if (isRevenueCatConfigured()) {
      captureException(e, { tags: { area: 'revenuecat', fn: 'checkSubscriptionStatus' } });
    }
    return {
      plan: 'free',
      isActive: false,
      error: i18n.t('errors.subscriptionCheckFailed'),
    };
  }
}

/**
 * Restore purchases (e.g. after reinstall or new device).
 */
export async function restorePurchases(): Promise<CustomerInfo | null> {
  try {
    const customerInfo = await getPurchases().restorePurchases();
    return customerInfo;
  } catch (e) {
    if (__DEV__) console.error('[RevenueCat] Failed to restore purchases:', e);
    throw new Error(i18n.t('errors.restorePurchasesFailed'), { cause: e });
  }
}
