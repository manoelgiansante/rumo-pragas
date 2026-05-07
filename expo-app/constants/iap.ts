/**
 * IAP Lite Mode — pilot rollout strategy.
 *
 * On the FIRST submission to Apple, we expose ONE IAP product per app to
 * minimise rejection risk (multiple IAPs in same group is the most common
 * 2.1(a)/3.1.2 trip wire on first review). Once the pilot product is
 * approved, additional IAPs can be added by extending `APPROVED_IAP_IDS`
 * (or by flipping `PAYWALL_LITE_MODE` to false to surface everything).
 *
 * Metadata for the hidden products stays intact in App Store Connect /
 * Play Console — we only hide them from the in-app paywall UI.
 */

/**
 * Set of RevenueCat package PRODUCT IDs (StoreKit / Play product identifiers)
 * that are approved for surfacing on the paywall in lite mode.
 *
 * For Rumo Pragas the pilot product is `pragas_pro_monthly`.
 */
export const APPROVED_IAP_IDS: ReadonlySet<string> = new Set<string>(['pragas_pro_monthly']);

/**
 * Master switch. When true, the paywall filters offerings down to
 * `APPROVED_IAP_IDS`. When false, ALL packages from RevenueCat surface
 * (post-Apple-approval expansion path).
 *
 * Hardcoded for now — flip manually after pilot approval. Could later be
 * env-driven via `process.env.EXPO_PUBLIC_PAYWALL_LITE === 'true'`.
 */
export const PAYWALL_LITE_MODE = true;

/**
 * Helper — checks whether a given product identifier is approved for paywall
 * exposure under the current lite-mode policy.
 */
export function isApprovedIapId(productId: string | null | undefined): boolean {
  if (!PAYWALL_LITE_MODE) return true;
  if (!productId) return false;
  return APPROVED_IAP_IDS.has(productId);
}
