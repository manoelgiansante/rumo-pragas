/**
 * RevenueCat purchase service.
 *
 * iOS 26 iPad Reviewer Trap (Apple 2.1(a)) defense:
 * `react-native-purchases` is loaded LAZILY at first call (require()). Top-level
 * native imports can synchronously trigger TurboModule registration on bundle
 * eval, which on iPad iOS 26 reviewer devices manifests as splash hang and
 * Guideline 2.1(a) rejection. Each exported function does:
 *
 *   const Purchases = getPurchases();
 *   if (!Purchases) return null;  // graceful degrade
 *
 * Type imports remain top-level (compile-time only, no runtime cost).
 */
/* eslint-disable @typescript-eslint/no-var-requires */

import type { PurchasesPackage, CustomerInfo } from 'react-native-purchases';
import { Platform } from 'react-native';
import i18n from '../i18n';

const REVENUECAT_API_KEY_IOS = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || '';
const REVENUECAT_API_KEY_ANDROID = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY || '';

// Cancellation error code (avoids importing the PURCHASES_ERROR_CODE enum
// at module scope, which would touch the native module via JSI).
const PURCHASE_CANCELLED_ERROR_CODE = 'PURCHASE_CANCELLED_ERROR';

// Loose type for the lazy-required Purchases module. We deliberately avoid
// `typeof import('react-native-purchases').default` here because TypeScript
// hits a recursive instantiation on the package's own type graph. The methods
// we touch are narrowed with `any` cast at call sites instead — the runtime
// behavior is fully covered by the unit tests in __tests__/services/purchases.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PurchasesModule = any;

let cachedPurchases: PurchasesModule | null = null;
let triedPurchases = false;

/**
 * Lazy, defensive require for react-native-purchases. Returns null if the
 * native module fails to load (web preview, missing pod, iPad reviewer eval).
 */
function getPurchases(): PurchasesModule | null {
  if (cachedPurchases) return cachedPurchases;
  if (triedPurchases) return null;
  triedPurchases = true;
  try {
    const mod = require('react-native-purchases');
    // ESM: default export. CJS: module itself.
    cachedPurchases = (mod && mod.default ? mod.default : mod) as PurchasesModule;
    return cachedPurchases;
  } catch (e) {
    if (__DEV__) console.warn('[RevenueCat] require failed (non-fatal):', e);
    return null;
  }
}

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

  const Purchases = getPurchases();
  if (!Purchases) return;

  Purchases.configure({ apiKey, appUserID: userId ?? null });
}

/**
 * Identify an already-initialised anonymous Purchases user with a Supabase
 * user id.  Safe to call multiple times (RevenueCat deduplicates).
 */
export async function identifyUser(userId: string): Promise<void> {
  if (!isRevenueCatConfigured()) return;
  const Purchases = getPurchases();
  if (!Purchases) return;
  try {
    await Purchases.logIn(userId);
  } catch (e) {
    if (__DEV__) console.error('[RevenueCat] Failed to identify user:', e);
  }
}

/**
 * Get available packages / offerings configured in the RevenueCat dashboard.
 */
export async function getOfferings(): Promise<PurchasesPackage[]> {
  const Purchases = getPurchases();
  if (!Purchases) return [];
  try {
    const offerings = await Purchases.getOfferings();
    if (offerings.current) {
      return offerings.current.availablePackages;
    }
    return [];
  } catch (e) {
    if (__DEV__) console.error('[RevenueCat] Failed to get offerings:', e);
    return [];
  }
}

/**
 * Purchase a specific package.
 * Returns CustomerInfo on success, null if the user cancelled, or throws on
 * other errors.
 */
export async function purchasePackage(pkg: PurchasesPackage): Promise<CustomerInfo | null> {
  const Purchases = getPurchases();
  if (!Purchases) {
    throw new Error(i18n.t('errors.purchaseUnavailable', { defaultValue: 'Purchases not available on this device.' }));
  }
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return customerInfo;
  } catch (e: unknown) {
    if (
      e instanceof Object &&
      'code' in e &&
      (e as { code: string }).code === PURCHASE_CANCELLED_ERROR_CODE
    ) {
      return null; // user cancelled -- not an error
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
  const Purchases = getPurchases();
  if (!Purchases) {
    return { plan: 'free', isActive: false };
  }
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    if (customerInfo.entitlements.active['enterprise']) {
      return { plan: 'enterprise', isActive: true };
    }
    if (customerInfo.entitlements.active['pro']) {
      return { plan: 'pro', isActive: true };
    }
    return { plan: 'free', isActive: false };
  } catch (e) {
    if (__DEV__) console.error('[RevenueCat] Failed to check subscription status:', e);
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
  const Purchases = getPurchases();
  if (!Purchases) return null;
  try {
    const customerInfo = await Purchases.restorePurchases();
    return customerInfo;
  } catch (e) {
    if (__DEV__) console.error('[RevenueCat] Failed to restore purchases:', e);
    throw new Error(i18n.t('errors.restorePurchasesFailed'), { cause: e });
  }
}
