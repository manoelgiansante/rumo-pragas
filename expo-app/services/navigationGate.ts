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
/** Legacy device-global key. Never trusted for an authenticated account. */
export const LOCATION_CONSENT_SHOWN_KEY = '@rumo_pragas_location_consent_shown';

export function locationConsentStorageKey(userId: string): string {
  return `${LOCATION_CONSENT_SHOWN_KEY}:${userId}`;
}

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
 * The ONLY top-level segments the gate is allowed to route between. Every other
 * concrete top-level route in the app (`diagnosis`, `edit-profile`,
 * `terms`, `privacy`, `+not-found`) is a DELIBERATE user-initiated destination
 * the gate must NOT interfere with.
 */
export const GATE_SEGMENTS: readonly GateSegment[] = [
  'onboarding',
  '(auth)',
  'consent-location',
  '(tabs)',
];

/**
 * True when `segment` is one of the four gate-owned top-level routes.
 *
 * `undefined` (the transient first-frame / index segment, or the Fabric
 * `useSegments` store-churn value on New Architecture) is treated as
 * gate-owned: at cold start we DO want the gate to route the user from the
 * blank index to the correct destination.
 *
 * Any OTHER concrete segment (e.g. `diagnosis`, `edit-profile`) is NOT gate-owned —
 * the user navigated there on purpose (e.g. tapped "Diagnose Now"), and the
 * gate must leave them alone. This is the structural fix for the Apple 2.1(a)
 * "App returns to the same screen after tapping Diagnose Now" rejection: the
 * old `needsRedirect` bounced `diagnosis` → `(tabs)` because `diagnosis` simply
 * wasn't the resolved target, yanking the reviewer back to Home.
 */
export function isGateOwnedSegment(segment: string | undefined): boolean {
  if (segment === undefined) return true;
  return (GATE_SEGMENTS as readonly string[]).includes(segment);
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
 * CRITICAL (Apple 2.1(a) — "returns to the same screen after tapping Diagnose
 * Now"): the gate must ONLY redirect when the user is on a gate-owned segment
 * that differs from the target. If the user is on a deliberate non-gate route
 * (`diagnosis`, `edit-profile`, `terms`, `privacy`), we return false
 * so the gate leaves them there. Otherwise pushing `/diagnosis/camera` would be
 * instantly bounced back to `(tabs)` because `diagnosis !== target`.
 */
export function needsRedirect(
  currentSegment: string | undefined,
  target: GateSegment | null,
): boolean {
  if (target === null) return false;
  // Never pull the user off a route the gate does not own (intentional push).
  if (!isGateOwnedSegment(currentSegment)) return false;
  return currentSegment !== target;
}

/** Read both gate flags from AsyncStorage. Never throws; defaults to false. */
export async function readGateFlags(userId: string | null): Promise<{
  hasSeenOnboarding: boolean;
  hasSeenLocationConsent: boolean;
}> {
  const [onboarding, consent] = await Promise.all([
    AsyncStorage.getItem(ONBOARDING_KEY).catch(() => null),
    userId
      ? AsyncStorage.getItem(locationConsentStorageKey(userId)).catch(() => null)
      : Promise.resolve(null),
    // Drop the former device-global flag. It could otherwise let account B
    // inherit account A's disclosure state after a sign-out/account switch.
    AsyncStorage.removeItem(LOCATION_CONSENT_SHOWN_KEY).catch(() => undefined),
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
export async function persistLocationConsentSeen(userId: string): Promise<void> {
  if (!userId) return;
  try {
    await AsyncStorage.setItem(locationConsentStorageKey(userId), 'true');
  } catch {
    /* never block navigation on storage failure */
  }
}

/**
 * Clear the location-consent-shown flag (inverse of `persistLocationConsentSeen`).
 *
 * Used only in the LGPD double-failure path: when the consent decision could NOT
 * be persisted on the server (retries exhausted) AND the offline replay queue
 * write ALSO failed, the proof of consent is lost. Dropping this flag makes the
 * consent gate reappear on the NEXT cold start so the choice is recaptured,
 * instead of the user being silently advanced past a consent we never recorded.
 *
 * Only affects the next boot: the current session keeps routing off the reactive
 * NavigationGate state (which stays "seen"), so there is no mid-session bounce.
 * Never throws / never blocks.
 */
export async function clearLocationConsentSeen(userId: string): Promise<void> {
  if (!userId) return;
  try {
    await AsyncStorage.removeItem(locationConsentStorageKey(userId));
  } catch {
    /* never block navigation on storage failure */
  }
}
