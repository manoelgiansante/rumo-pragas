import Purchases, {
  PurchasesPackage,
  CustomerInfo,
  PURCHASES_ERROR_CODE,
} from 'react-native-purchases';
import { Platform } from 'react-native';
import i18n from '../i18n';
import { captureException } from './sentry-shim';

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

  Purchases.configure({ apiKey, appUserID: userId ?? null });
}

/**
 * Identify an already-initialised anonymous Purchases user with a Supabase
 * user id.  Safe to call multiple times (RevenueCat deduplicates).
 */
export async function identifyUser(userId: string): Promise<void> {
  if (!isRevenueCatConfigured()) return;
  try {
    await Purchases.logIn(userId);
  } catch (e) {
    if (__DEV__) console.error('[RevenueCat] Failed to identify user:', e);
    captureException(e, { tags: { feature: 'purchases', step: 'identify_user' } });
  }
}

/**
 * Get available packages / offerings configured in the RevenueCat dashboard.
 */
export async function getOfferings(): Promise<PurchasesPackage[]> {
  try {
    const offerings = await Purchases.getOfferings();
    if (offerings.current) {
      return offerings.current.availablePackages;
    }
    return [];
  } catch (e) {
    if (__DEV__) console.error('[RevenueCat] Failed to get offerings:', e);
    // ZERO-O: empty offerings = blank paywall = silent funnel break.
    captureException(e, { tags: { feature: 'purchases', step: 'get_offerings' } });
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
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return customerInfo;
  } catch (e: unknown) {
    if (
      e instanceof Object &&
      'code' in e &&
      (e as { code: string }).code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
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
    captureException(e, { tags: { feature: 'purchases', step: 'check_subscription_status' } });
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
    const customerInfo = await Purchases.restorePurchases();
    return customerInfo;
  } catch (e) {
    if (__DEV__) console.error('[RevenueCat] Failed to restore purchases:', e);
    captureException(e, { tags: { feature: 'purchases', step: 'restore_purchases' } });
    throw new Error(i18n.t('errors.restorePurchasesFailed'), { cause: e });
  }
}
