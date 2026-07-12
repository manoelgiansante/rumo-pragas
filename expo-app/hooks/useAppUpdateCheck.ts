/**
 * useAppUpdateCheck — Rumo Pragas (ported from Rumo Máquinas / Rumo Finance).
 *
 * 3-mode in-app update notification driven by the server-side build-number
 * policy in the SHARED jxcn Edge Function `version-check` (multiplexed by app;
 * this client always sends `app: 'pragas'`). Same response shape / policy as
 * RM's `api/version-check.ts` (computed via `lib/updateMode.ts`).
 *
 * Modes:
 *   - silent: nothing rendered (current ≥ latest, dev/staging build, or
 *             user dismissed the same build_number already).
 *   - soft:   non-blocking sticky banner at the top, dismissible.
 *   - force:  full-screen blocking modal — back button intercepted.
 *
 * When it re-checks (defense-in-depth, 2026-07-04 — the old cold-start-only /
 * 6h model let a continuously-foregrounded app miss a new release for hours or
 * forever; the server was fresh, the client just never re-asked):
 *   1. cold start (mount) AND foreground-resume (AppState → 'active'),
 *      throttled to at most 1×/UPDATE_CHECK_TTL_MS (15 min).
 *   2. foreground POLL: a setInterval fires every 15 min and re-checks while
 *      AppState is 'active' — covers the app kept open continuously, where the
 *      'active' transition never re-fires so layer 1 alone never re-runs.
 *   3. Supabase Realtime: subscribe to `app_versions` changes for THIS app
 *      (filter app=eq.pragas — the jxcn table is multiplexed by app); an
 *      INSERT/UPDATE triggers a forced re-check — but only while the app is
 *      foregrounded ('active'), debounced (a burst of rows collapses to one
 *      check) and jittered 0–5s so a synchronized release doesn't stampede the
 *      Edge Function. This is FAIL-SAFE — if realtime can't connect / isn't
 *      enabled on the table, it silently no-ops and layers 1+2 still cover us.
 *      It is only ever a trigger; we never render anything from the realtime
 *      payload (the policy stays centralized in the Edge Function).
 *   - Web is always a no-op.
 *   - 15 min TTL cache in AsyncStorage so cold start / foreground-resume don't
 *     spam the endpoint; poll + realtime carry a forceRefresh flag that
 *     bypasses that cache short-circuit so they can actually detect a change
 *     mid-session.
 *   - "Dismiss" persists `latestBuildNumber.toString()`. Subsequent SOFT
 *     decisions for the same build are coerced back to silent. Force NEVER
 *     respects dismiss — that's the whole point of force.
 *   - A live fetch that FAILS (network / non-2xx / parse) never downgrades a
 *     non-silent state to silent, for ANY trigger (P1-A). A FORCE modal on
 *     screen — or any persisted non-silent decision in the cache — survives a
 *     transient failure; we only collapse to silent when there is genuinely
 *     nothing non-silent to preserve (first cold start, empty cache).
 *     Decision extracted to `resolveOnFetchFailure` in updateCheckPolicy.
 *   - Malformed JSON shape and unsafe store URLs still collapse to silent and
 *     emit a Sentry breadcrumb (warning level). We never break the app because
 *     the version check failed.
 *
 * Build number source: expo-application `nativeBuildVersion` — the REAL native
 * build. This app is remote-versioned on EAS (real store build >> app.json's
 * `ios.buildNumber`), so reading app.json/expo-constants here would produce a
 * permanently-wrong comparison. Never change this to Constants.
 */

import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Application from 'expo-application';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';

import { Config } from '../constants/config';
import { trackEvent } from '../services/analytics';
import { addBreadcrumb, captureMessage, withScope } from '../services/sentry-shim';
import { supabase } from '../services/supabase';
import {
  UPDATE_CHECK_TTL_MS,
  type AppStateValue,
  type UpdateCheckTrigger,
  effectiveModeForDismiss,
  forceRefreshForTrigger,
  isCacheUsable,
  resolveOnFetchFailure,
  shouldPollNow,
  shouldReactToRealtime,
  shouldRunOnForeground,
} from '../lib/updateCheckPolicy';

// This app's key in the multiplexed jxcn `app_versions` table / Edge Function.
const APP_SLUG = 'pragas' as const;

const CACHE_KEY = '@pragas/update_check_v2';
const DISMISSED_KEY = '@pragas/update_dismissed_v2';

// Shared jxcn Edge Function (pre-auth, but the gateway still requires the anon
// apikey + bearer). Direct fetch — the app has no generic API wrapper. Config
// values are already `.trim()`ed (kills the trailing-\n class of env bug).
const VERSION_CHECK_URL = `${Config.SUPABASE_URL}/functions/v1/version-check`;

// Locale whitelist mirrors the Edge Function Zod enum. Sending a
// non-whitelisted locale (e.g. mid-rollout new lang) would make the backend
// return 400 silently — collapsing to silent + spamming Sentry. We client-side
// coerce to a valid value so the request always succeeds. Pragas registers
// SHORT resource keys too ('en' / 'es'), so map those to their BCP-47 form
// before falling back to pt-BR.
const ALLOWED_LOCALES = ['pt-BR', 'en-US', 'es-ES'] as const;
type AllowedLocale = (typeof ALLOWED_LOCALES)[number];

function pickAllowedLocale(input: string | undefined | null): AllowedLocale {
  if (!input) return 'pt-BR';
  if ((ALLOWED_LOCALES as readonly string[]).includes(input)) {
    return input as AllowedLocale;
  }
  if (input.startsWith('en')) return 'en-US';
  if (input.startsWith('es')) return 'es-ES';
  return 'pt-BR';
}

// Defense-in-depth: Supabase admin compromise could inject `javascript:` /
// `tel:` / `data:` URLs into `store_url_native` / `store_url_fallback` and
// achieve RCE-via-deeplink on user devices. We require store URLs to start
// with one of these known-safe prefixes BEFORE handing them to Linking.openURL.
// Mirrored in UpdateBanner + ForceUpdateModal so banner + modal + cache-read
// all share the same allowlist.
export const ALLOWED_STORE_URL_PREFIXES = [
  'itms-apps:',
  'market://',
  'https://apps.apple.com',
  'https://play.google.com',
] as const;

export function isSafeStoreUrl(url: string | undefined | null): boolean {
  if (!url || typeof url !== 'string') return false;
  return ALLOWED_STORE_URL_PREFIXES.some((p) => url.startsWith(p));
}

export type UpdateMode = 'silent' | 'soft' | 'force';

export interface UpdateInfo {
  latestVersionName: string;
  latestBuildNumber: number;
  storeUrlNative: string;
  storeUrlFallback: string;
  releaseNotes: string | null;
  releasedAt: string;
}

export interface UseAppUpdateCheckReturn {
  mode: UpdateMode;
  updateInfo: UpdateInfo | null;
  dismiss: () => Promise<void>;
  isChecking: boolean;
}

interface VersionCheckResponse {
  has_update: boolean;
  mode: UpdateMode;
  latest_version_name: string;
  latest_build_number: number;
  store_url_native: string;
  store_url_fallback: string;
  release_notes: string | null;
  released_at: string;
}

interface CachedResponse {
  timestamp: number;
  response: VersionCheckResponse;
}

const SILENT: UseAppUpdateCheckReturn = {
  mode: 'silent',
  updateInfo: null,
  dismiss: async () => {
    /* no-op when silent */
  },
  isChecking: false,
};

function safeBreadcrumb(message: string, data?: Record<string, unknown>): void {
  try {
    // Conditional spread: under exactOptionalPropertyTypes an explicit
    // `data: undefined` is not assignable to the optional Breadcrumb field.
    addBreadcrumb({
      category: 'app.update.check',
      level: 'warning',
      message,
      ...(data !== undefined ? { data } : {}),
    });
  } catch {
    // Never crash the app from a breadcrumb call.
  }
}

/**
 * Promote a defect to a Sentry ISSUE (not just a breadcrumb) via the shim.
 * The shim's captureMessage has no context param, so tags/extra ride on a
 * scope. Everything is wrapped — Sentry must never crash the app.
 */
export function captureUpdateCheckIssue(message: string, data?: Record<string, unknown>): void {
  try {
    withScope((scope) => {
      scope.setTag('feature', 'app-update');
      if (data !== undefined) scope.setContext('appUpdate', data);
      captureMessage(message, 'error');
    });
  } catch {
    // Never crash the app from a Sentry call.
  }
}

function toUpdateInfo(r: VersionCheckResponse): UpdateInfo {
  return {
    latestVersionName: r.latest_version_name,
    latestBuildNumber: r.latest_build_number,
    storeUrlNative: r.store_url_native,
    storeUrlFallback: r.store_url_fallback,
    releaseNotes: r.release_notes,
    releasedAt: r.released_at,
  };
}

async function readCache(): Promise<CachedResponse | null> {
  let raw: string | null = null;
  try {
    raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedResponse;
    if (typeof parsed?.timestamp !== 'number' || typeof parsed?.response?.mode !== 'string') {
      return null;
    }
    // Sanitize cached store URLs the same way we sanitize the live response.
    // A previously-cached entry written before the whitelist existed (or one
    // poisoned through some other vector) must not slip past Linking.openURL.
    const r = parsed.response;
    if (!isSafeStoreUrl(r.store_url_native) && !isSafeStoreUrl(r.store_url_fallback)) {
      // Both invalid → drop the cache entirely; we'll re-fetch on next call.
      safeBreadcrumb('cache contained unsafe store URLs — dropping', {
        nativePrefix:
          typeof r.store_url_native === 'string' ? r.store_url_native.slice(0, 24) : null,
        fallbackPrefix:
          typeof r.store_url_fallback === 'string' ? r.store_url_fallback.slice(0, 24) : null,
      });
      return null;
    }
    return parsed;
  } catch (err) {
    // JSON.parse failure → emit Sentry breadcrumb so we can spot corruption.
    // An empty catch would hide genuine corruption (partial AsyncStorage
    // write, key collision from an old version, etc.) — now we know.
    safeBreadcrumb('readCache JSON.parse failed', {
      cacheKey: CACHE_KEY,
      valuePreview: raw ? raw.slice(0, 80) : null,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function writeCache(response: VersionCheckResponse): Promise<void> {
  try {
    const payload: CachedResponse = { timestamp: Date.now(), response };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Cache write is best-effort.
  }
}

async function readDismissedBuild(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

async function writeDismissedBuild(buildNumber: number): Promise<void> {
  try {
    await AsyncStorage.setItem(DISMISSED_KEY, buildNumber.toString());
  } catch {
    // Best-effort — if AsyncStorage fails, the banner will reappear next
    // session, which is not ideal but also not catastrophic.
  }
}

async function fetchVersionCheck(
  platform: 'ios' | 'android',
  currentBuildNumber: number,
  currentVersionName: string,
  locale: string,
): Promise<VersionCheckResponse | null> {
  if (!Config.SUPABASE_URL || !Config.SUPABASE_ANON_KEY) {
    // No Supabase env → nothing to call. Fail-open (silent) upstream.
    safeBreadcrumb('version-check missing Supabase env', {
      hasUrl: !!Config.SUPABASE_URL,
      hasKey: !!Config.SUPABASE_ANON_KEY,
    });
    return null;
  }
  try {
    const res = await fetch(VERSION_CHECK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // Pre-auth Edge Function, but the Supabase gateway still requires the
        // anon apikey + bearer to route the request through.
        apikey: Config.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${Config.SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        app: APP_SLUG,
        platform,
        current_build_number: currentBuildNumber,
        current_version_name: currentVersionName,
        locale,
      }),
    });

    if (!res.ok) {
      safeBreadcrumb('version-check non-2xx', {
        status: res.status,
        platform,
        currentBuildNumber,
      });
      return null;
    }

    const data = (await res.json()) as VersionCheckResponse;
    if (typeof data?.mode !== 'string') {
      safeBreadcrumb('version-check malformed payload', { platform });
      return null;
    }
    return data;
  } catch (err) {
    safeBreadcrumb('version-check threw', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export function useAppUpdateCheck(): UseAppUpdateCheckReturn {
  const { i18n } = useTranslation();
  const [state, setState] = useState<UseAppUpdateCheckReturn>(SILENT);
  // Timestamp of the last completed/started check. The foreground-resume
  // listener AND the poll interval re-run the check after UPDATE_CHECK_TTL_MS
  // (15 min). Realtime triggers bypass this throttle (the watched row just
  // changed).
  const lastCheckAtRef = useRef(0);
  // Prevents overlapping runs (rapid background↔foreground flaps).
  const checkInFlightRef = useRef(false);
  // Mirrors the mode currently shown to the user (the effect closure captures a
  // stale `state`, so we can't read state.mode inside runCheck). Kept in sync
  // at every mode-changing setState. Read by the fetch-failure policy (P1-A) so
  // a transient failure can preserve an on-screen FORCE modal / SOFT banner.
  const currentModeRef = useRef<UpdateMode>('silent');
  // Tracks whether the host (RootLayout) is still mounted. Used to guard
  // setState in the dismiss closure — the user may unmount the layout (sign
  // out / hot reload) between mount and tap.
  const mountedRef = useRef(true);

  // Hold the latest snapshot so dismiss() can flip mode → silent without
  // re-running the network call.
  const snapshotRef = useRef<VersionCheckResponse | null>(null);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Web → no-op. Stores apply only to iOS/Android.
    if (Platform.OS === 'web') return;

    // `cancelled` is per-mount (not per-run): when the host unmounts we stop
    // touching state from any in-flight run AND stop listening to AppState.
    let cancelled = false;

    const runCheck = async (
      trigger: UpdateCheckTrigger,
      forceRefresh: boolean = forceRefreshForTrigger(trigger),
    ) => {
      if (checkInFlightRef.current) return;
      checkInFlightRef.current = true;
      lastCheckAtRef.current = Date.now();
      try {
        setState((prev) => ({ ...prev, isChecking: true }));

        const platform = Platform.OS === 'ios' ? 'ios' : 'android';
        const currentVersionName = Application.nativeApplicationVersion ?? '0.0.0';
        const rawBuild = Application.nativeBuildVersion;
        const currentBuildNumber = parseInt(rawBuild ?? '', 10);

        if (Number.isNaN(currentBuildNumber)) {
          // A native build number that is unparseable is a build config DEFECT
          // — surface it as a Sentry issue, not a quiet breadcrumb, so a
          // release with broken `nativeBuildVersion` (e.g. EAS profile
          // misconfig) gets detected before user reports trickle in.
          captureUpdateCheckIssue('nativeBuildVersion is NaN', {
            rawBuild,
            platform,
            version: currentVersionName,
          });
          if (!cancelled) {
            currentModeRef.current = 'silent';
            setState(SILENT);
          }
          return;
        }

        // Try cache first — unless forceRefresh (poll / realtime) demands a live
        // fetch so we can detect a change mid-session.
        let response: VersionCheckResponse | null = null;
        let cacheHit = false;

        const cached = await readCache();
        if (cached && isCacheUsable(cached.timestamp, Date.now(), forceRefresh)) {
          response = cached.response;
          cacheHit = true;
        } else {
          // Client-side locale whitelist. i18n.language can be a short key
          // ('en'/'es' — this app registers both) or drift to any IETF tag —
          // the backend Zod enum would 400 silently and the hook would fall
          // through to silent + Sentry breadcrumb storm. Coerce to a valid
          // value so we always send one the backend accepts.
          const locale = pickAllowedLocale(i18n.language);
          const fetched = await fetchVersionCheck(
            platform,
            currentBuildNumber,
            currentVersionName,
            locale,
          );
          if (fetched) {
            response = fetched;
            await writeCache(fetched);
          } else {
            // P1-A (integrity): the live fetch FAILED (network / non-2xx /
            // parse). NEVER downgrade a non-silent state to silent on a
            // transient error, for ANY trigger. Decision centralized in
            // resolveOnFetchFailure.
            const cachedMode: UpdateMode | null =
              cached && typeof cached.response?.mode === 'string'
                ? (cached.response.mode as UpdateMode)
                : null;
            const resolution = resolveOnFetchFailure({
              currentMode: currentModeRef.current,
              cachedMode,
              trigger,
            });
            if (resolution === 'preserve-current') {
              // A non-silent state (FORCE / SOFT) is already on screen — leave
              // it exactly as-is; just clear the isChecking flag we set above.
              if (!cancelled) setState((prev) => ({ ...prev, isChecking: false }));
              return;
            }
            if (resolution === 'use-cache' && cached) {
              // A persisted non-silent decision exists (cache, even expired) —
              // restore it rather than showing nothing (dismiss policy below
              // still silences an already-dismissed soft build).
              response = cached.response;
              cacheHit = true;
            }
            // resolution === 'silent' → response stays null → the block below
            // sets SILENT (legitimate fail-open: nothing non-silent to preserve).
          }
        }

        if (!response) {
          if (!cancelled) {
            currentModeRef.current = 'silent';
            setState(SILENT);
          }
          return;
        }

        snapshotRef.current = response;

        // Honor server-decided mode, then layer client-side dismiss policy on
        // top: SOFT for an already-dismissed build_number → silent. Force is
        // never silenced. (Only read the dismiss flag for SOFT — silent/force
        // don't need it.)
        let effectiveMode: UpdateMode = response.mode;
        if (effectiveMode === 'soft') {
          const dismissed = await readDismissedBuild();
          effectiveMode = effectiveModeForDismiss('soft', response.latest_build_number, dismissed);
        }

        try {
          trackEvent('update_check_completed', {
            mode: effectiveMode,
            current_build: currentBuildNumber,
            latest_build: response.latest_build_number,
            platform,
            cache_hit: cacheHit,
            trigger,
          });
        } catch {
          // Analytics must never break the app.
        }

        if (cancelled) return;

        if (effectiveMode === 'silent') {
          currentModeRef.current = 'silent';
          setState(SILENT);
          return;
        }

        // Defense-in-depth: refuse to render banner/modal if the URLs we got
        // from the server (or cache) aren't on the allowlist. A compromised
        // Supabase admin or upstream poison could otherwise inject
        // javascript:/tel:/intent: deeplinks → RCE-via-Linking.openURL.
        if (
          !isSafeStoreUrl(response.store_url_native) &&
          !isSafeStoreUrl(response.store_url_fallback)
        ) {
          captureUpdateCheckIssue('unsafe_store_url_blocked', {
            source: 'hook',
            nativePrefix:
              typeof response.store_url_native === 'string'
                ? response.store_url_native.slice(0, 24)
                : null,
            fallbackPrefix:
              typeof response.store_url_fallback === 'string'
                ? response.store_url_fallback.slice(0, 24)
                : null,
            platform,
            cacheHit,
          });
          if (!cancelled) {
            currentModeRef.current = 'silent';
            setState(SILENT);
          }
          return;
        }

        const info = toUpdateInfo(response);
        currentModeRef.current = effectiveMode;
        setState({
          mode: effectiveMode,
          updateInfo: info,
          dismiss: async () => {
            // Check mounted FIRST, then write, then setState. The user may have
            // unmounted the host (sign-out / hot-reload) between mount and tap;
            // bail early (no work, no setState-on-unmounted warnings).
            if (!mountedRef.current) return;
            const snap = snapshotRef.current;
            if (snap) {
              await writeDismissedBuild(snap.latest_build_number);
            }
            // Re-check mounted: the await above can race with unmount.
            if (!mountedRef.current) return;
            currentModeRef.current = 'silent';
            setState((prev) => ({
              ...prev,
              mode: 'silent',
              updateInfo: null,
            }));
          },
          isChecking: false,
        });
      } finally {
        checkInFlightRef.current = false;
      }
    };

    void runCheck('cold_start');

    // ── Layer 1: foreground-resume re-check ──────────────────────────────
    // iOS keeps the app resident for days — without this listener the check
    // ran exactly once per JS session and long-lived sessions never saw a new
    // release. Throttled to 1×/UPDATE_CHECK_TTL_MS (15 min) via lastCheckAtRef
    // + the in-flight guard (both encapsulated in shouldRunOnForeground).
    const appStateSub = AppState.addEventListener('change', (next) => {
      if (cancelled) return;
      if (
        shouldRunOnForeground(
          next as AppStateValue,
          lastCheckAtRef.current,
          Date.now(),
          checkInFlightRef.current,
        )
      ) {
        void runCheck('foreground');
      }
    });

    // ── Layer 2: foreground poll ─────────────────────────────────────────
    // The 'active' transition never re-fires while the app stays open, so
    // layer 1 alone never re-runs for a continuously-foregrounded app. Poll
    // every TTL and re-check while 'active' (shouldPollNow also guards web +
    // background + in-flight + the TTL throttle). The 'poll' trigger carries
    // forceRefresh so it bypasses the cache and detects a change made during a
    // long session.
    const pollTimer = setInterval(() => {
      if (cancelled) return;
      if (
        shouldPollNow(
          Platform.OS,
          AppState.currentState as AppStateValue,
          lastCheckAtRef.current,
          Date.now(),
          checkInFlightRef.current,
        )
      ) {
        void runCheck('poll');
      }
    }, UPDATE_CHECK_TTL_MS);

    // ── Layer 3: Supabase Realtime trigger (FAIL-SAFE) ───────────────────
    // Subscribe to app_versions changes for THIS app (filter app=eq.pragas —
    // the jxcn table is multiplexed by app); an INSERT/UPDATE (a new release
    // published) triggers an immediate forced re-check. We NEVER render from
    // the realtime payload — it is only a trigger; runCheck hits the Edge
    // Function for the real (server-decided, localized) response, keeping the
    // policy centralized on the server. Everything is wrapped so a realtime
    // failure can NEVER break the app or block boot; layers 1+2 cover us if
    // realtime is unavailable / not enabled on the table.
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
    // Debounce handle. A publish can emit a burst of INSERT/UPDATE rows, and on
    // a real release every active client fires at ~the same instant. Collapse
    // the burst to ONE check and add jitter so the survivors don't hit the Edge
    // Function in a synchronized spike (thundering herd).
    let realtimeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    try {
      realtimeChannel = supabase
        .channel('app-version-updates')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'app_versions',
            filter: `app=eq.${APP_SLUG}`,
          },
          () => {
            // Only react while foregrounded ('active'), not torn down, and not
            // already debouncing. Math.random is fine here — it's app runtime
            // jitter, not a security context.
            if (
              !shouldReactToRealtime(
                AppState.currentState as AppStateValue,
                cancelled,
                realtimeDebounceTimer !== null,
              )
            ) {
              return;
            }
            const jitterMs = Math.floor(Math.random() * 5000);
            realtimeDebounceTimer = setTimeout(() => {
              realtimeDebounceTimer = null;
              // Re-validate after the jitter delay: the app may have been
              // backgrounded or the host unmounted during the 0–5s wait.
              if (cancelled) return;
              if (AppState.currentState !== 'active') return;
              void runCheck('realtime');
            }, jitterMs);
          },
        )
        .subscribe((status) => {
          // Fail-safe: nothing to do on error — poll + foreground still work.
          // Leave a breadcrumb so a realtime outage is visible if we go
          // digging, but never surface it to the user.
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            safeBreadcrumb('realtime channel not connected', { status });
          }
        });
    } catch (err) {
      // Never throw from the boot path because realtime setup failed.
      safeBreadcrumb('realtime subscribe threw', {
        error: err instanceof Error ? err.message : String(err),
      });
      realtimeChannel = null;
    }

    return () => {
      cancelled = true;
      appStateSub.remove();
      clearInterval(pollTimer);
      // Clear any pending jittered realtime re-check so it can't fire (and call
      // runCheck) after the host unmounted.
      if (realtimeDebounceTimer) {
        clearTimeout(realtimeDebounceTimer);
        realtimeDebounceTimer = null;
      }
      if (realtimeChannel) {
        try {
          supabase.removeChannel(realtimeChannel);
        } catch {
          // Fail-safe cleanup — never crash on unmount.
        }
      }
    };
    // i18n.language is stable enough for our purpose; the TTL throttle
    // prevents re-run storms even if it changes mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}
