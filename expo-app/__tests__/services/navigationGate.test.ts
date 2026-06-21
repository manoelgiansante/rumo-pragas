/**
 * Tests for the navigation gate — the loop-proof cold-start routing decision.
 *
 * These tests are the regression guard for Sentry RUMO-PRAGAS-7/8
 * ("Maximum update depth exceeded" in app/_layout's navigation effect, which
 * rendered the root ErrorBoundary "Something went wrong" screen that Apple
 * rejected under Guideline 2.1.0).
 *
 * resolveGateTarget() is a TOTAL, PURE function of the gate state, so:
 *   - identical inputs always produce the identical target (no oscillation), and
 *   - we can exhaustively prove the reviewer flow lands on '(tabs)' and STAYS.
 */
import {
  GATE_HREF,
  needsRedirect,
  resolveGateTarget,
  type GateState,
} from '../../services/navigationGate';

// AsyncStorage is referenced by the read/write helpers in the same module.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const base: GateState = {
  isLoading: false,
  isAuthenticated: false,
  hasSeenOnboarding: true,
  hasSeenLocationConsent: true,
};

describe('resolveGateTarget — readiness', () => {
  it('returns null while auth is still loading', () => {
    expect(resolveGateTarget({ ...base, isLoading: true })).toBeNull();
  });

  it('returns null while the onboarding flag is unresolved', () => {
    expect(resolveGateTarget({ ...base, hasSeenOnboarding: null })).toBeNull();
  });

  it('returns null while the consent flag is unresolved', () => {
    expect(resolveGateTarget({ ...base, hasSeenLocationConsent: null })).toBeNull();
  });
});

describe('resolveGateTarget — gate precedence', () => {
  it('routes to onboarding when not yet seen (highest precedence)', () => {
    expect(
      resolveGateTarget({
        isLoading: false,
        isAuthenticated: true,
        hasSeenOnboarding: false,
        hasSeenLocationConsent: false,
      }),
    ).toBe('onboarding');
  });

  it('routes to (auth) when onboarding seen but not authenticated', () => {
    expect(
      resolveGateTarget({
        isLoading: false,
        isAuthenticated: false,
        hasSeenOnboarding: true,
        hasSeenLocationConsent: false,
      }),
    ).toBe('(auth)');
  });

  it('routes to consent-location when authenticated but consent not recorded', () => {
    expect(
      resolveGateTarget({
        isLoading: false,
        isAuthenticated: true,
        hasSeenOnboarding: true,
        hasSeenLocationConsent: false,
      }),
    ).toBe('consent-location');
  });

  it('routes to (tabs) when everything is satisfied', () => {
    expect(
      resolveGateTarget({
        isLoading: false,
        isAuthenticated: true,
        hasSeenOnboarding: true,
        hasSeenLocationConsent: true,
      }),
    ).toBe('(tabs)');
  });
});

describe('resolveGateTarget — determinism (no oscillation possible)', () => {
  it('is a pure function: same input → same output every call', () => {
    const state: GateState = {
      isLoading: false,
      isAuthenticated: true,
      hasSeenOnboarding: true,
      hasSeenLocationConsent: false,
    };
    const first = resolveGateTarget(state);
    for (let i = 0; i < 50; i++) {
      expect(resolveGateTarget(state)).toBe(first);
    }
  });
});

describe('needsRedirect', () => {
  it('never redirects when target is null (not ready)', () => {
    expect(needsRedirect('(tabs)', null)).toBe(false);
    expect(needsRedirect(undefined, null)).toBe(false);
  });

  it('redirects when current segment differs from target', () => {
    expect(needsRedirect('consent-location', '(tabs)')).toBe(true);
    expect(needsRedirect(undefined, 'onboarding')).toBe(true);
  });

  it('does NOT redirect once the current segment equals the target', () => {
    expect(needsRedirect('(tabs)', '(tabs)')).toBe(false);
    expect(needsRedirect('consent-location', 'consent-location')).toBe(false);
  });
});

describe('GATE_HREF mapping', () => {
  it('maps every gate segment to a concrete href', () => {
    expect(GATE_HREF.onboarding).toBe('/onboarding');
    expect(GATE_HREF['(auth)']).toBe('/(auth)/login');
    expect(GATE_HREF['consent-location']).toBe('/consent-location');
    expect(GATE_HREF['(tabs)']).toBe('/(tabs)');
  });
});

/**
 * Reviewer-flow simulation. Models the layout effect's ref-guarded replace loop:
 * each "render" computes the target, and at most ONE replace per distinct target
 * is issued; the segment store then catches up to the issued target on the next
 * render. We assert the system reaches a FIXED POINT (target === currentSegment)
 * with a bounded number of replaces — i.e. it provably cannot ping-pong.
 */
describe('reviewer flow reaches a fixed point (loop-proof)', () => {
  type Sim = {
    state: GateState;
    startSegment: string | undefined;
  };

  function runToFixedPoint({ state, startSegment }: Sim) {
    let currentSegment = startSegment;
    let lastIssued: string | null = null;
    const replaces: string[] = [];
    // Hard cap: if this ever loops it would blow past the cap (mirrors React's
    // "Maximum update depth exceeded"). A correct gate settles in <= 2 steps.
    const MAX_STEPS = 25;
    let steps = 0;

    for (; steps < MAX_STEPS; steps++) {
      const target = resolveGateTarget(state);
      if (target === null) break; // not ready → render spinner, no nav
      if (currentSegment === target) {
        // arrival: fixed point reached (guard no longer relevant after break)
        break;
      }
      if (lastIssued === target) break; // guard: replace already in flight
      // issue replace
      lastIssued = target;
      replaces.push(target);
      // the segment store catches up to the issued target on next render
      currentSegment = target;
    }

    return { finalSegment: currentSegment, replaces, steps };
  }

  it('cold start, onboarding already seen, just logged in → consent → (tabs), settles, ONE replace each', () => {
    // Step A: authenticated, consent not yet recorded → must land on consent.
    const a = runToFixedPoint({
      state: {
        isLoading: false,
        isAuthenticated: true,
        hasSeenOnboarding: true,
        hasSeenLocationConsent: false,
      },
      startSegment: '(auth)',
    });
    expect(a.finalSegment).toBe('consent-location');
    expect(a.replaces).toEqual(['consent-location']);
    expect(a.steps).toBeLessThan(5);

    // Step B: reviewer taps "Allow location" → flag flips to true. Now from the
    // consent segment, the only target is (tabs), and it STAYS there.
    const b = runToFixedPoint({
      state: {
        isLoading: false,
        isAuthenticated: true,
        hasSeenOnboarding: true,
        hasSeenLocationConsent: true,
      },
      startSegment: 'consent-location',
    });
    expect(b.finalSegment).toBe('(tabs)');
    expect(b.replaces).toEqual(['(tabs)']);
    expect(b.steps).toBeLessThan(5);
  });

  it('once on (tabs) with consent granted, NO further replace is issued (no bounce-back)', () => {
    const r = runToFixedPoint({
      state: {
        isLoading: false,
        isAuthenticated: true,
        hasSeenOnboarding: true,
        hasSeenLocationConsent: true,
      },
      startSegment: '(tabs)',
    });
    expect(r.finalSegment).toBe('(tabs)');
    expect(r.replaces).toEqual([]); // already at target → zero navigations
  });

  it('decline path also lands on (tabs) and stays (decline still marks consent shown)', () => {
    // After decline, hasSeenLocationConsent is true (the "shown" flag), so target
    // is (tabs) — identical settle behaviour as accept.
    const r = runToFixedPoint({
      state: {
        isLoading: false,
        isAuthenticated: true,
        hasSeenOnboarding: true,
        hasSeenLocationConsent: true,
      },
      startSegment: 'consent-location',
    });
    expect(r.finalSegment).toBe('(tabs)');
    expect(r.replaces).toEqual(['(tabs)']);
  });

  it('not-authenticated path: onboarding seen → (auth) and stays', () => {
    const r = runToFixedPoint({
      state: {
        isLoading: false,
        isAuthenticated: false,
        hasSeenOnboarding: true,
        hasSeenLocationConsent: false,
      },
      startSegment: undefined,
    });
    expect(r.finalSegment).toBe('(auth)');
    expect(r.replaces).toEqual(['(auth)']);
  });

  it('onboarding-not-seen path: → onboarding and stays', () => {
    const r = runToFixedPoint({
      state: {
        isLoading: false,
        isAuthenticated: false,
        hasSeenOnboarding: false,
        hasSeenLocationConsent: false,
      },
      startSegment: undefined,
    });
    expect(r.finalSegment).toBe('onboarding');
    expect(r.replaces).toEqual(['onboarding']);
  });

  it('full cold-start chain onboarding→login→consent→tabs never exceeds one replace per stage', () => {
    // Stage 1: nothing seen, not authed.
    const s1 = runToFixedPoint({
      state: {
        isLoading: false,
        isAuthenticated: false,
        hasSeenOnboarding: false,
        hasSeenLocationConsent: false,
      },
      startSegment: undefined,
    });
    expect(s1.finalSegment).toBe('onboarding');

    // Stage 2: onboarding finished (flag flips), still not authed.
    const s2 = runToFixedPoint({
      state: {
        isLoading: false,
        isAuthenticated: false,
        hasSeenOnboarding: true,
        hasSeenLocationConsent: false,
      },
      startSegment: 'onboarding',
    });
    expect(s2.finalSegment).toBe('(auth)');

    // Stage 3: logged in, consent not recorded.
    const s3 = runToFixedPoint({
      state: {
        isLoading: false,
        isAuthenticated: true,
        hasSeenOnboarding: true,
        hasSeenLocationConsent: false,
      },
      startSegment: '(auth)',
    });
    expect(s3.finalSegment).toBe('consent-location');

    // Stage 4: consent granted → tabs.
    const s4 = runToFixedPoint({
      state: {
        isLoading: false,
        isAuthenticated: true,
        hasSeenOnboarding: true,
        hasSeenLocationConsent: true,
      },
      startSegment: 'consent-location',
    });
    expect(s4.finalSegment).toBe('(tabs)');

    // Every stage issued at most one replace.
    for (const s of [s1, s2, s3, s4]) {
      expect(s.replaces.length).toBeLessThanOrEqual(1);
    }
  });
});

describe('readGateFlags / persist helpers (storage layer)', () => {
  const AsyncStorage = require('@react-native-async-storage/async-storage');

  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('readGateFlags returns false/false on a fresh install', async () => {
    const { readGateFlags } = require('../../services/navigationGate');
    await expect(readGateFlags()).resolves.toEqual({
      hasSeenOnboarding: false,
      hasSeenLocationConsent: false,
    });
  });

  it('persist + read round-trips both flags as true', async () => {
    const {
      persistOnboardingSeen,
      persistLocationConsentSeen,
      readGateFlags,
    } = require('../../services/navigationGate');
    await persistOnboardingSeen();
    await persistLocationConsentSeen();
    await expect(readGateFlags()).resolves.toEqual({
      hasSeenOnboarding: true,
      hasSeenLocationConsent: true,
    });
  });
});
