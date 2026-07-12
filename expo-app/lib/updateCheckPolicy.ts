/**
 * Pure scheduling / cache policy for `useAppUpdateCheck`.
 *
 * Extracted (like `lib/updateMode.ts`) so the decision logic can be unit
 * tested under the project's node-only Jest config WITHOUT importing the hook
 * — which pulls in react-native / expo-application / react-i18next and cannot
 * be transformed in that environment. The hook imports these helpers and wires
 * them to AppState / setInterval / Supabase Realtime; the tests exercise the
 * REAL functions here (no drift-prone re-derivation).
 *
 * Cadence (defense-in-depth, 2026-07-04 — replaces the old cold-start-only /
 * 6h model that let a continuously-foregrounded app miss a new release for
 * hours or forever):
 *   1. cold start + foreground-resume (throttled by UPDATE_CHECK_TTL_MS)
 *   2. foreground POLL every UPDATE_CHECK_TTL_MS while AppState is 'active'
 *   3. Supabase Realtime trigger on `app_versions` changes (fail-safe; the
 *      other layers cover if realtime is unavailable)
 */

import type { UpdateMode } from './updateMode';

/**
 * Re-check cadence. Was 6h (cold-start-only era). Now 15 min: the foreground
 * resume re-check, the foreground poll interval, AND the cache freshness
 * window all key off this single constant so there is exactly one knob.
 */
export const UPDATE_CHECK_TTL_MS = 15 * 60 * 1000; // 15 min

/**
 * What triggered a given `runCheck`. Drives analytics + whether we force a
 * network re-fetch (bypassing the AsyncStorage cache short-circuit).
 */
export type UpdateCheckTrigger = 'cold_start' | 'foreground' | 'poll' | 'realtime';

export type AppStateValue = 'active' | 'background' | 'inactive';

/**
 * Whether a trigger must bypass the cache and always hit the network.
 *
 *   - 'realtime': the DB row just changed → the cache is stale by definition.
 *   - 'poll':     the whole point is to detect a change mid-session; a cache
 *                 hit would defeat it.
 *   - 'cold_start' / 'foreground': normal cache behavior (cheap, throttled).
 */
export function forceRefreshForTrigger(trigger: UpdateCheckTrigger): boolean {
  return trigger === 'realtime' || trigger === 'poll';
}

/**
 * Whether a cached response may be used instead of re-fetching.
 *
 * forceRefresh always wins (realtime/poll must re-fetch). Otherwise the entry
 * is usable while it is younger than the TTL. A future/clock-skewed timestamp
 * (now - ts < 0) counts as fresh — a forward-skewed clock should not force a
 * pointless refetch.
 */
export function isCacheUsable(cacheTimestamp: number, now: number, forceRefresh: boolean): boolean {
  if (forceRefresh) return false;
  return now - cacheTimestamp < UPDATE_CHECK_TTL_MS;
}

/**
 * Foreground-resume re-check gate (AppState 'change' → 'active').
 * Re-check only when: transitioning to active, no run in flight, and the last
 * check is at least one TTL old (so a resume storm doesn't spam the endpoint).
 */
export function shouldRunOnForeground(
  next: AppStateValue,
  lastCheckAt: number,
  now: number,
  checkInFlight: boolean,
): boolean {
  if (next !== 'active') return false;
  if (checkInFlight) return false;
  if (now - lastCheckAt < UPDATE_CHECK_TTL_MS) return false;
  return true;
}

/**
 * Foreground POLL gate (setInterval tick). Covers the app that stays
 * continuously in the foreground for hours — AppState 'active' never re-fires
 * in that case, so the resume re-check alone never runs.
 *
 *   - web: never (stores don't apply; the effect no-ops on web anyway).
 *   - only while the app is actually in the foreground ('active') — timers may
 *     still tick briefly on some platforms while backgrounded.
 *   - respects the in-flight guard + the TTL throttle (same as foreground).
 */
export function shouldPollNow(
  platformOS: string,
  appStateCurrent: AppStateValue,
  lastCheckAt: number,
  now: number,
  checkInFlight: boolean,
): boolean {
  if (platformOS === 'web') return false;
  if (appStateCurrent !== 'active') return false;
  if (checkInFlight) return false;
  if (now - lastCheckAt < UPDATE_CHECK_TTL_MS) return false;
  return true;
}

/**
 * Realtime trigger gate (Supabase `postgres_changes` callback on `app_versions`).
 * The realtime event is only ever a TRIGGER for a forced re-check — never a
 * data source. React only when:
 *
 *   - not torn down (`cancelled`) — the host may have unmounted mid-burst.
 *   - the app is actually foregrounded ('active'). A realtime event that
 *     arrives while backgrounded must NOT fetch + setState off-screen; the
 *     next foreground-resume / poll covers it (parity with `shouldPollNow`).
 *   - no realtime re-check is already scheduled (`debouncePending`). On a real
 *     release EVERY active client receives the event ~simultaneously, and a
 *     single publish can emit a burst of INSERT/UPDATE rows — both must
 *     collapse to ONE re-check, not N, to avoid a thundering herd against the
 *     Edge Function. (The caller adds a small random jitter on top of this so
 *     the surviving single check is spread across clients, not synchronized.)
 */
export function shouldReactToRealtime(
  appStateCurrent: AppStateValue,
  cancelled: boolean,
  debouncePending: boolean,
): boolean {
  if (cancelled) return false;
  if (appStateCurrent !== 'active') return false;
  if (debouncePending) return false;
  return true;
}

/**
 * Layer the client-side dismiss policy on top of the server-decided mode.
 * A SOFT decision for a build_number the user already dismissed collapses to
 * silent. FORCE is NEVER silenced by dismiss — that's the point of force.
 * SILENT passes through untouched.
 */
export function effectiveModeForDismiss(
  serverMode: UpdateMode,
  latestBuildNumber: number,
  dismissedBuild: string | null,
): UpdateMode {
  if (serverMode !== 'soft') return serverMode;
  if (dismissedBuild && dismissedBuild === String(latestBuildNumber)) {
    return 'silent';
  }
  return 'soft';
}

/**
 * What to do with the UI state when a live fetch FAILS (network error, non-2xx,
 * parse error — a transient condition, ~24× more likely now that the TTL is
 * 15 min instead of 6 h).
 *
 *   - 'preserve-current': keep the on-screen state exactly as-is. Used whenever
 *     a non-silent state (a FORCE blocking modal, or a SOFT banner) is already
 *     visible — a network blip in the field must NEVER erase it.
 *   - 'use-cache': no non-silent state is on screen, but a persisted non-silent
 *     decision exists in the cache (even an expired one) — restore it rather
 *     than show nothing. Canonical case: cold start after the app was
 *     force-blocked, cache expired, first fetch of the session fails.
 *   - 'silent': there is genuinely nothing non-silent to preserve anywhere →
 *     legitimate fail-open. Canonical case: the very first cold start with an
 *     empty cache.
 *
 * INTEGRITY DOCTRINE: FORCE can never be cleared by a network failure. Even if
 * the server *could* have removed the force between now and the last success,
 * the safe/conservative choice is to stay blocked until a SUCCESSFUL fetch
 * confirms otherwise. The same "don't downgrade on a transient error" rule is
 * applied to SOFT for consistency (the dismiss policy layered on top still
 * silences an already-dismissed soft build).
 *
 * `trigger` is part of the contract for call-site uniformity and so a future
 * per-trigger policy can be added without a signature change. The current
 * policy is DELIBERATELY trigger-independent — the whole point of this fix is
 * that a non-silent state survives a transient failure for EVERY trigger
 * (`cold_start` / `foreground` / `poll` / `realtime`), not just the forced ones.
 */
export type FetchFailureResolution = 'preserve-current' | 'use-cache' | 'silent';

export function resolveOnFetchFailure(input: {
  currentMode: UpdateMode;
  cachedMode: UpdateMode | null;
  trigger: UpdateCheckTrigger;
}): FetchFailureResolution {
  const { currentMode, cachedMode } = input;
  // 1. A non-silent state is currently on screen (esp. a FORCE modal) → keep it
  //    untouched, for every trigger. Highest priority: never wipe what the user
  //    is actively looking at because of a transient network error.
  if (currentMode !== 'silent') return 'preserve-current';
  // 2. Nothing non-silent on screen, but a persisted non-silent decision exists
  //    (cache, even expired) → restore it instead of showing nothing.
  if (cachedMode && cachedMode !== 'silent') return 'use-cache';
  // 3. Nothing non-silent anywhere → legitimate fail-open (first cold start,
  //    empty cache). Collapse to silent, exactly as before.
  return 'silent';
}
