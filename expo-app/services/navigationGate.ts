/**
 * Navigation gate — single source of truth for the cold-start routing decision.
 *
 * BACKGROUND (Apple Guideline 2.1.0 — App Completeness; Sentry RUMO-PRAGAS-7/8):
 * The root layout used to route imperatively from inside a navigation effect
 * that called `router.replace(...)` based on auth/onboarding/consent flags. Two
 * independent writers raced:
 *
 *   (A) `app/_layout.tsx`'s navigation effect (reads `hasSeenLocationConsent`
 *        from AsyncStorage ONCE on mount, never refreshes), and
 *   (B) `app/consent-location.tsx`'s `finish()` (writes the consent flag to
 *        AsyncStorage AND self-navigated `router.replace('/(tabs)')`).
 *
 * When the reviewer tapped "Allow location", (B) wrote the flag and pushed to
 * `(tabs)`. But (A)'s in-memory `hasSeenLocationConsent` was still stale `false`,
 * so the moment `segments` changed to `(tabs)`, (A) re-fired and bounced the user
 * back to `/consent-location`. `useSegments()` is a `useSyncExternalStore`, so on
 * iPad/iOS 26 New Architecture (Fabric) the store churn re-entered the effect
 * fast enough to exceed React's nested-update limit → "Maximum update depth
 * exceeded" (fatal, caught by the root ErrorBoundary → "Something went wrong"
 * screen Apple screenshotted).
 *
 * This module makes the decision PURE and DETERMINISTIC: given the gate state,
 * it returns exactly ONE top-level target route. The layout then replaces ONLY
 * when the current segment differs from that target, guarded by a useRef so the
 * same replace is never issued twice while in flight. The stale-read race is
 * eliminated by reading the flags from a reactive provider (NavigationGateProvider)
 * that `consent-location` / `onboarding` update on completion — and by having
 * those screens NO LONGER self-navigate (single writer = the layout effect).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const ONBOARDING_KEY = '@rumo_pragas_onboarding_seen';
export const LOCATION_CONSENT_SHOWN_KEY = '@rumo_pragas_location_consent_shown';

/**
 * Top-level route groups the gate can route to. These are the values of
 * `useSegments()[0]` for each destination (NOT full hrefs).
 */
export type GateSegment = 'onboarding' | '(auth)' | 'consent-location' | '(tabs)';

/** Full hrefs passed to `router.replace`, keyed by the target segment. */
export const GATE_HREF: Record<GateSegment, string> = {
  onboarding: '/onboarding',
  '(auth)': '/(auth)/login',
  'consent-location': '/consent-location',
  '(tabs)': '/(tabs)',
};

/**
 * The set of top-level segments the gate is RESPONSIBLE for. These are the only
 * places the gate may yank the user away from. Any other top-level route
 * (`paywall`, `diagnosis`, `edit-profile`, `privacy`, `terms`, `+not-found`,
 * etc.) is an intentional in-app destination reached by an explicit
 * `router.push` from inside `(tabs)` — the gate must NEVER override it.
 *
 * BUG (Apple Guideline 2.1(b), iPad Air M3 / iPadOS 26.5): the gate effect used
 * `currentSegment !== target` as its only redirect predicate. When an onboarded,
 * authenticated, consented user tapped "Upgrade Plan", `router.push('/paywall')`
 * set `currentSegment = 'paywall'`. The gate target is `'(tabs)'`, so
 * `'paywall' !== '(tabs)'` was TRUE → the effect immediately fired
 * `router.replace('/(tabs)')`, dismissing the paywall modal the instant it
 * mounted. The StoreKit purchase sheet therefore never appeared → "tapping
 * Upgrade Plan does nothing". The same bounce hit `diagnosis` / `edit-profile`.
 * Restricting the gate to its OWN segments leaves every leaf route untouched.
 */
const GATE_SEGMENTS: ReadonlySet<string> = new Set<GateSegment>([
  'onboarding',
  '(auth)',
  'consent-location',
  '(tabs)',
]);

/**
 * Whether `currentSegment` is a route the gate owns (and may redirect away from).
 *
 * `undefined` (the cold-start index route before any segment resolves) counts as
 * gate-owned, so the very first cold-start routing decision still works. Every
 * non-gate leaf route (paywall, diagnosis, edit-profile, privacy, terms,
 * not-found) is NOT gate-owned, so the gate leaves the user there.
 */
export function isGateOwnedSegment(currentSegment: string | undefined): boolean {
  if (currentSegment === undefined) return true;
  return GATE_SEGMENTS.has(currentSegment);
}

export interface GateState {
  isLoading: boolean;
  isAuthenticated: boolean;
  /** null = not yet read from storage */
  hasSeenOnboarding: boolean | null;
  /** null = not yet read from storage */
  hasSeenLocationConsent: boolean | null;
}

/**
 * Resolve the single top-level route the user should be on.
 *
 * Returns `null` when the gate is not ready yet (still loading auth/flags) — the
 * caller must NOT navigate in that case (it renders a spinner instead). Returning
 * a concrete `GateSegment` is a total function of the inputs, so it can never
 * oscillate: identical inputs always yield the identical target.
 *
 * Ordering of the gates (highest precedence first):
 *   1. Onboarding not seen      → 'onboarding'
 *   2. Not authenticated        → '(auth)'    (login)
 *   3. Consent not recorded     → 'consent-location'
 *   4. Everything satisfied     → '(tabs)'    (home)
 */
export function resolveGateTarget(state: GateState): GateSegment | null {
  const { isLoading, isAuthenticated, hasSeenOnboarding, hasSeenLocationConsent } = state;

  // Not ready: do not route until auth + both flags have resolved.
  if (isLoading || hasSeenOnboarding === null || hasSeenLocationConsent === null) {
    return null;
  }

  if (!hasSeenOnboarding) return 'onboarding';
  if (!isAuthenticated) return '(auth)';
  if (!hasSeenLocationConsent) return 'consent-location';
  return '(tabs)';
}

/**
 * Whether a navigation is required to move from `currentSegment` to `target`.
 * `currentSegment` is `useSegments()[0]` (may be undefined on first frame, e.g.
 * at the index route). A null target means "not ready" → never navigate.
 *
 * The gate only redirects when the user is on a route the gate OWNS
 * (`isGateOwnedSegment`). If the user has intentionally navigated to a leaf
 * route outside the gate's responsibility (e.g. `/paywall`, `/diagnosis`,
 * `/edit-profile`), the gate must stay out of the way — otherwise it bounces
 * those modals straight back to `(tabs)` the instant they mount (the iPad
 * "Upgrade Plan does nothing" rejection, Guideline 2.1(b)).
 */
export function needsRedirect(
  currentSegment: string | undefined,
  target: GateSegment | null,
): boolean {
  if (target === null) return false;
  if (!isGateOwnedSegment(currentSegment)) return false;
  return currentSegment !== target;
}

/** Read both gate flags from AsyncStorage. Never throws; defaults to false. */
export async function readGateFlags(): Promise<{
  hasSeenOnboarding: boolean;
  hasSeenLocationConsent: boolean;
}> {
  const [onboarding, consent] = await Promise.all([
    AsyncStorage.getItem(ONBOARDING_KEY).catch(() => null),
    AsyncStorage.getItem(LOCATION_CONSENT_SHOWN_KEY).catch(() => null),
  ]);
  return {
    hasSeenOnboarding: onboarding === 'true',
    hasSeenLocationConsent: consent === 'true',
  };
}

/** Persist the onboarding-seen flag. Never throws. */
export async function persistOnboardingSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
  } catch {
    /* never block navigation on storage failure */
  }
}

/** Persist the location-consent-shown flag. Never throws. */
export async function persistLocationConsentSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(LOCATION_CONSENT_SHOWN_KEY, 'true');
  } catch {
    /* never block navigation on storage failure */
  }
}
