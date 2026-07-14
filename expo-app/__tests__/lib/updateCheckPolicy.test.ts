/**
 * Tests for the scheduling / cache / dismiss policy that drives
 * `useAppUpdateCheck`.
 *
 * The hook itself imports react-native / expo-application / react-i18next /
 * @supabase, none of which the project's node-only Jest config can transform,
 * so we can't render the hook here. Instead the decision logic LIVES in the
 * pure, dependency-free module `lib/updateCheckPolicy.ts` (same pattern as
 * `lib/updateMode.ts`), and these tests exercise those REAL functions — no
 * drift-prone re-derivation. The effect wiring that can't be a pure function
 * (clearInterval + removeChannel on unmount, web no-op) is covered by a
 * lightweight source-level guard at the bottom.
 *
 * Cadence under test (2026-07-04): 15-min TTL (was 6h) + foreground poll +
 * realtime forced re-check.
 */

import fs from 'fs';
import path from 'path';

import {
  UPDATE_CHECK_TTL_MS,
  effectiveModeForDismiss,
  forceRefreshForTrigger,
  isCacheUsable,
  resolveOnFetchFailure,
  shouldPollNow,
  shouldReactToRealtime,
  shouldRunOnForeground,
} from '../../lib/updateCheckPolicy';

const NOW = 1_700_000_000_000;
const MIN = 60 * 1000;

describe('updateCheckPolicy', () => {
  describe('UPDATE_CHECK_TTL_MS', () => {
    it('is 15 minutes (not the old 6h)', () => {
      expect(UPDATE_CHECK_TTL_MS).toBe(15 * 60 * 1000);
      expect(UPDATE_CHECK_TTL_MS).not.toBe(6 * 60 * 60 * 1000);
    });
  });

  describe('forceRefreshForTrigger', () => {
    it('forces a live re-fetch for realtime and poll', () => {
      expect(forceRefreshForTrigger('realtime')).toBe(true);
      expect(forceRefreshForTrigger('poll')).toBe(true);
    });

    it('uses the normal cache for cold_start and foreground', () => {
      expect(forceRefreshForTrigger('cold_start')).toBe(false);
      expect(forceRefreshForTrigger('foreground')).toBe(false);
    });
  });

  describe('isCacheUsable', () => {
    it('treats a 5-min-old cache as usable (cold_start / foreground)', () => {
      expect(isCacheUsable(NOW - 5 * MIN, NOW, false)).toBe(true);
    });

    it('treats the 15-min boundary as stale (TTL exclusive)', () => {
      expect(isCacheUsable(NOW - UPDATE_CHECK_TTL_MS, NOW, false)).toBe(false);
    });

    it('treats a 16-min-old cache as stale', () => {
      expect(isCacheUsable(NOW - 16 * MIN, NOW, false)).toBe(false);
    });

    it('treats a future timestamp (clock skew) as usable', () => {
      expect(isCacheUsable(NOW + MIN, NOW, false)).toBe(true);
    });

    it('forceRefresh (realtime/poll) NEVER uses cache, even a 1-min-old one', () => {
      // The exact regression this fix targets: a change published during a
      // long session must be detected — a warm cache must NOT short-circuit it.
      expect(isCacheUsable(NOW - MIN, NOW, true)).toBe(false);
      // realtime/poll derive forceRefresh=true, so a hot cache is ignored:
      expect(isCacheUsable(NOW - MIN, NOW, forceRefreshForTrigger('realtime'))).toBe(false);
      expect(isCacheUsable(NOW - MIN, NOW, forceRefreshForTrigger('poll'))).toBe(false);
    });
  });

  describe('shouldRunOnForeground (layer 1 — foreground resume)', () => {
    it('re-checks on foreground when the last check is older than 15 min', () => {
      expect(shouldRunOnForeground('active', NOW - 16 * MIN, NOW, false)).toBe(true);
    });

    it('re-checks at exactly the 15-min boundary (TTL exclusive)', () => {
      expect(shouldRunOnForeground('active', NOW - UPDATE_CHECK_TTL_MS, NOW, false)).toBe(true);
    });

    it('does NOT re-check inside the 15-min window (was 6h)', () => {
      expect(shouldRunOnForeground('active', NOW - 5 * MIN, NOW, false)).toBe(false);
      // A 1h-old check WOULD have been skipped under the old 6h TTL; now it runs.
      expect(shouldRunOnForeground('active', NOW - 60 * MIN, NOW, false)).toBe(true);
    });

    it('does NOT re-check on background / inactive transitions', () => {
      expect(shouldRunOnForeground('background', NOW - 16 * MIN, NOW, false)).toBe(false);
      expect(shouldRunOnForeground('inactive', NOW - 16 * MIN, NOW, false)).toBe(false);
    });

    it('does NOT start an overlapping run while one is in flight', () => {
      expect(shouldRunOnForeground('active', NOW - 16 * MIN, NOW, true)).toBe(false);
    });

    it('cold start (lastCheckAt=0) always passes', () => {
      expect(shouldRunOnForeground('active', 0, NOW, false)).toBe(true);
    });
  });

  describe('shouldPollNow (layer 2 — foreground poll)', () => {
    it('polls while active and past the TTL', () => {
      expect(shouldPollNow('ios', 'active', NOW - 16 * MIN, NOW, false)).toBe(true);
      expect(shouldPollNow('android', 'active', NOW - 16 * MIN, NOW, false)).toBe(true);
    });

    it('does NOT poll on web (stores do not apply)', () => {
      expect(shouldPollNow('web', 'active', NOW - 16 * MIN, NOW, false)).toBe(false);
    });

    it('does NOT poll while backgrounded / inactive', () => {
      expect(shouldPollNow('ios', 'background', NOW - 16 * MIN, NOW, false)).toBe(false);
      expect(shouldPollNow('ios', 'inactive', NOW - 16 * MIN, NOW, false)).toBe(false);
    });

    it('does NOT poll inside the 15-min throttle window', () => {
      expect(shouldPollNow('ios', 'active', NOW - 5 * MIN, NOW, false)).toBe(false);
    });

    it('does NOT poll while a check is in flight', () => {
      expect(shouldPollNow('ios', 'active', NOW - 16 * MIN, NOW, true)).toBe(false);
    });
  });

  describe('resolveOnFetchFailure (P1-A — never downgrade non-silent on a transient fetch failure)', () => {
    it('PRESERVES a FORCE modal on screen when a foreground fetch fails (the exact bug)', () => {
      // FORCE open → app backgrounded >15min → resume → foreground fetch fails
      // (bad field connection). Old code went straight to silent and unblocked
      // the app. Now: preserve-current.
      expect(
        resolveOnFetchFailure({ currentMode: 'force', cachedMode: 'force', trigger: 'foreground' }),
      ).toBe('preserve-current');
      // FORCE must be preserved even if the cache somehow says silent, and even
      // with no cache at all — a network blip can NEVER clear a force.
      expect(
        resolveOnFetchFailure({
          currentMode: 'force',
          cachedMode: 'silent',
          trigger: 'foreground',
        }),
      ).toBe('preserve-current');
      expect(
        resolveOnFetchFailure({ currentMode: 'force', cachedMode: null, trigger: 'foreground' }),
      ).toBe('preserve-current');
    });

    it('PRESERVES a SOFT banner on screen when a fetch fails', () => {
      expect(
        resolveOnFetchFailure({ currentMode: 'soft', cachedMode: 'soft', trigger: 'foreground' }),
      ).toBe('preserve-current');
      expect(
        resolveOnFetchFailure({ currentMode: 'soft', cachedMode: null, trigger: 'poll' }),
      ).toBe('preserve-current');
    });

    it('preserves a non-silent state for EVERY trigger (not just the forced ones)', () => {
      for (const trigger of ['cold_start', 'foreground', 'poll', 'realtime'] as const) {
        expect(resolveOnFetchFailure({ currentMode: 'force', cachedMode: null, trigger })).toBe(
          'preserve-current',
        );
      }
    });

    it('cold start with an EMPTY cache fails open → silent (unchanged behavior)', () => {
      expect(
        resolveOnFetchFailure({ currentMode: 'silent', cachedMode: null, trigger: 'cold_start' }),
      ).toBe('silent');
    });

    it('nothing non-silent to preserve (silent current + silent/absent cache) → silent', () => {
      expect(
        resolveOnFetchFailure({
          currentMode: 'silent',
          cachedMode: 'silent',
          trigger: 'foreground',
        }),
      ).toBe('silent');
      expect(
        resolveOnFetchFailure({ currentMode: 'silent', cachedMode: null, trigger: 'foreground' }),
      ).toBe('silent');
    });

    it('poll / realtime failure with a non-silent cache restores it via use-cache (not silent)', () => {
      // e.g. cold start after the app was force-blocked in a previous session:
      // current is silent (fresh mount), cache holds the last force decision.
      expect(
        resolveOnFetchFailure({ currentMode: 'silent', cachedMode: 'force', trigger: 'poll' }),
      ).toBe('use-cache');
      expect(
        resolveOnFetchFailure({ currentMode: 'silent', cachedMode: 'force', trigger: 'realtime' }),
      ).toBe('use-cache');
      expect(
        resolveOnFetchFailure({ currentMode: 'silent', cachedMode: 'soft', trigger: 'cold_start' }),
      ).toBe('use-cache');
    });
  });

  describe('shouldReactToRealtime (P2-A/P2-B — realtime gate)', () => {
    it('reacts while foregrounded, not torn down, and not already debouncing', () => {
      expect(shouldReactToRealtime('active', false, false)).toBe(true);
    });

    it('does NOT react while backgrounded / inactive (P2-A — no off-screen fetch+setState)', () => {
      expect(shouldReactToRealtime('background', false, false)).toBe(false);
      expect(shouldReactToRealtime('inactive', false, false)).toBe(false);
    });

    it('does NOT react after teardown (cancelled)', () => {
      expect(shouldReactToRealtime('active', true, false)).toBe(false);
    });

    it('does NOT schedule a second check while one is already pending (P2-B — debounce)', () => {
      expect(shouldReactToRealtime('active', false, true)).toBe(false);
    });
  });

  describe('effectiveModeForDismiss (dismiss policy)', () => {
    it('coerces SOFT to silent when the dismissed build matches', () => {
      expect(effectiveModeForDismiss('soft', 178, '178')).toBe('silent');
    });

    it('keeps SOFT when the dismissed build is a previous build', () => {
      expect(effectiveModeForDismiss('soft', 180, '178')).toBe('soft');
    });

    it('keeps SOFT when nothing / empty string was dismissed', () => {
      expect(effectiveModeForDismiss('soft', 178, null)).toBe('soft');
      expect(effectiveModeForDismiss('soft', 178, '')).toBe('soft');
    });

    it('FORCE is NEVER silenced by dismiss', () => {
      expect(effectiveModeForDismiss('force', 178, '178')).toBe('force');
      expect(effectiveModeForDismiss('force', 178, null)).toBe('force');
    });

    it('SILENT passes through regardless of dismiss state', () => {
      expect(effectiveModeForDismiss('silent', 178, null)).toBe('silent');
      expect(effectiveModeForDismiss('silent', 178, '178')).toBe('silent');
      expect(effectiveModeForDismiss('silent', 178, '177')).toBe('silent');
    });
  });
});

/**
 * Source-level guards for the parts of the hook that cannot be a pure function
 * in a node-only test env (the effect wiring). These fail the build if someone
 * removes the leak-prevention cleanup or the web no-op — the exact regressions
 * the SVP checklist calls out ("cleanup: clearInterval + removeChannel; NÃO na
 * web").
 */
describe('useAppUpdateCheck wiring (source-level)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../hooks/useAppUpdateCheck.ts'), 'utf8');

  it('web is a no-op (effect returns early before wiring timers/realtime)', () => {
    expect(src).toMatch(/if\s*\(\s*Platform\.OS\s*===\s*'web'\s*\)\s*return\s*;/);
  });

  it('registers a foreground poll interval and clears it on cleanup (no leak)', () => {
    expect(src).toContain('setInterval(');
    expect(src).toContain('clearInterval(pollTimer)');
  });

  it('subscribes to a realtime channel and removes it on cleanup (no leak)', () => {
    expect(src).toContain(".channel('app-version-updates')");
    expect(src).toContain('supabase.removeChannel(realtimeChannel)');
  });

  it('realtime setup is wrapped so a failure can never crash boot (fail-safe)', () => {
    // The realtime block must be inside a try/catch that swallows errors.
    expect(src).toMatch(/try\s*\{[\s\S]*\.channel\('app-version-updates'\)/);
  });

  it('poll and realtime triggers exist and are wired to runCheck', () => {
    expect(src).toContain("runCheck('poll')");
    expect(src).toContain("runCheck('realtime')");
  });

  it('P1-A: fetch-failure decision routes through the pure helper (no inline drift)', () => {
    expect(src).toContain('resolveOnFetchFailure(');
    // The decision is fed the on-screen mode via the ref, not a stale `state`.
    expect(src).toContain('currentMode: currentModeRef.current');
  });

  it('P2-A: the realtime callback is gated on foreground via shouldReactToRealtime', () => {
    expect(src).toContain('shouldReactToRealtime(');
    expect(src).toContain('AppState.currentState as AppStateValue');
  });

  it('P2-B: the realtime re-check is jittered and its debounce timer is cleared on cleanup', () => {
    expect(src).toContain('Math.random()');
    expect(src).toContain('realtimeDebounceTimer');
    expect(src).toContain('clearTimeout(realtimeDebounceTimer)');
  });

  // ── Pragas-specific wiring (jxcn shared table/edge fn, multiplexed by app) ──

  it("targets the 'pragas' slug in both the request body and the realtime filter", () => {
    expect(src).toContain("const APP_SLUG = 'pragas' as const;");
    expect(src).toContain('app: APP_SLUG');
    expect(src).toContain('filter: `app=eq.${APP_SLUG}`');
  });

  it('calls the SHARED jxcn Edge Function via Config (trimmed env), with anon apikey + bearer', () => {
    expect(src).toContain('/functions/v1/version-check');
    expect(src).toContain('Config.SUPABASE_URL');
    expect(src).toContain('apikey: Config.SUPABASE_ANON_KEY');
    expect(src).toContain('Authorization: `Bearer ${Config.SUPABASE_ANON_KEY}`');
  });

  it('reads the REAL native build number via expo-application (remote-versioned app — never app.json)', () => {
    expect(src).toContain('Application.nativeBuildVersion');
    expect(src).not.toContain('Constants.expoConfig');
  });

  it('uses per-app AsyncStorage keys (no cross-app collision)', () => {
    expect(src).toContain("'@pragas/update_check_v2'");
    expect(src).toContain("'@pragas/update_dismissed_v2'");
  });
});
