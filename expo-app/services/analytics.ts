/**
 * Analytics Service
 *
 * Lightweight analytics foundation for tracking user events.
 * Currently logs to console + Supabase. Can be extended to
 * integrate with PostHog, Amplitude, or Mixpanel.
 */

import { supabase } from './supabase';
import { Platform } from 'react-native';

// In-memory queue for batching events
const eventQueue: AnalyticsEvent[] = [];
const FLUSH_INTERVAL_MS = 30_000; // flush every 30s
const MAX_QUEUE_SIZE = 50;

let flushTimer: ReturnType<typeof setInterval> | null = null;
let currentUserId: string | null = null;

// ── WEB-SAFE ACCESS TOKEN (cicatriz ed9906a / ZERO-X class) ──
// The flush runs from a background timer with no React context, so it cannot
// read useAuthContext(). We hold the freshest access token IN MEMORY, sourced
// from onAuthStateChange (which fires SIGNED_IN / TOKEN_REFRESHED with the live
// session), and pass it explicitly on invoke.
//
// Why this is required: the DEFAULT `supabase.functions.invoke(...)` auth path
// resolves the token via `supabase.auth.getSession()`, which reads EXCLUSIVELY
// from storage. On WEB the SecureStore adapter is a no-op (services/supabase.ts)
// → session is null → invoke silently falls back to the ANON key. The
// `analytics` edge fn then runs getUser() on the anon identity, finds no user
// and returns 401, so every batch is re-queued forever and product telemetry
// dies. Passing this in-memory token explicitly fixes web and stays correct on
// native. Identity is STILL verified server-side by the edge fn via
// `supabase.auth.getUser(token)` (ZERO-X) — the client is never trusted.
let currentAccessToken: string | null = null;
supabase.auth.onAuthStateChange((_event, session) => {
  currentAccessToken = session?.access_token ?? null;
});

export interface AnalyticsEvent {
  event: string;
  properties?: Record<string, unknown> | undefined;
  timestamp: string;
  userId?: string | undefined;
  platform: string;
}

/**
 * Internal: guard against uncaught interval callbacks that could kill the loop.
 * A single failed flush must never prevent future flushes.
 */
function safeFlushTick(): void {
  try {
    void flushEvents().catch((err) => {
      if (__DEV__) console.warn('[Analytics] Flush tick error (swallowed):', err);
    });
  } catch (err) {
    if (__DEV__) console.warn('[Analytics] Flush tick sync error (swallowed):', err);
  }
}

/**
 * Initialize analytics with the authenticated user ID.
 * Safe to call multiple times (e.g. re-login) — prior timer is cleared first.
 */
export function initAnalytics(userId: string): void {
  currentUserId = userId;

  // Clear any existing timer before creating a new one (handles re-login / user switch)
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  flushTimer = setInterval(safeFlushTick, FLUSH_INTERVAL_MS);
}

/**
 * Reset analytics on logout.
 * Guaranteed to clear the interval even if flush fails.
 */
export function resetAnalytics(): void {
  currentUserId = null;
  try {
    flushEvents().catch((err) => {
      if (__DEV__) console.warn('[Analytics] Reset flush error (swallowed):', err);
    });
  } catch (err) {
    if (__DEV__) console.warn('[Analytics] Reset flush sync error (swallowed):', err);
  }
  // Always clear interval — even if flush threw, the timer must die
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

/**
 * Track an analytics event.
 */
export function trackEvent(event: string, properties?: Record<string, unknown>): void {
  const analyticsEvent: AnalyticsEvent = {
    event,
    properties,
    timestamp: new Date().toISOString(),
    userId: currentUserId ?? undefined,
    platform: Platform.OS,
  };

  if (__DEV__) {
    console.warn('[Analytics]', event, properties ?? '');
  }

  eventQueue.push(analyticsEvent);

  if (eventQueue.length >= MAX_QUEUE_SIZE) {
    flushEvents();
  }
}

/**
 * Flush queued events to backend.
 */
async function flushEvents(): Promise<void> {
  if (eventQueue.length === 0) return;

  // The `analytics` edge fn requires an authenticated user. Without a live
  // access token (logged out, or the session has not resolved yet) the request
  // would fall back to the anon key and 401; keep the events queued (bounded)
  // until a token arrives instead of dropping them or spamming failed calls.
  if (!currentAccessToken) {
    if (eventQueue.length > MAX_QUEUE_SIZE) {
      eventQueue.splice(0, eventQueue.length - MAX_QUEUE_SIZE);
    }
    return;
  }

  const batch = eventQueue.splice(0, eventQueue.length);

  try {
    // For now, log to Supabase edge function or table
    // This can be replaced with PostHog/Amplitude SDK call
    const { error } = await supabase.functions.invoke('analytics', {
      body: { events: batch },
      // Override the default anon-key Authorization with the user's JWT so the
      // edge fn's getUser() resolves the real user (see currentAccessToken note).
      headers: { Authorization: `Bearer ${currentAccessToken}` },
    });

    if (error) {
      // Re-queue failed events (up to max)
      if (__DEV__) console.warn('[Analytics] Flush failed:', error);
      eventQueue.unshift(...batch.slice(0, MAX_QUEUE_SIZE));
    }
  } catch (err) {
    if (__DEV__) console.warn('[Analytics] Flush error:', err);
    // Re-queue on network failure
    eventQueue.unshift(...batch.slice(0, MAX_QUEUE_SIZE));
  }
}

// =====================================================
// Pre-defined event helpers
// =====================================================

export function trackScreenView(screen: string): void {
  trackEvent('screen_view', { screen });
}

export function trackDiagnosisStarted(crop: string): void {
  trackEvent('diagnosis_started', { crop });
}

export function trackDiagnosisCompleted(
  crop: string,
  pestName?: string,
  confidence?: number,
): void {
  trackEvent('diagnosis_completed', { crop, pestName, confidence });
}

export function trackChatMessage(): void {
  trackEvent('chat_message_sent');
}

export function trackSubscriptionViewed(plan?: string): void {
  trackEvent('subscription_viewed', { plan });
}

export function trackSubscriptionPurchased(plan: string, provider: string): void {
  trackEvent('subscription_purchased', { plan, provider });
}

export function trackPestDetailViewed(
  pestId: string,
  source: 'result' | 'history' | 'deeplink' | 'library',
): void {
  trackEvent('pest_detail_viewed', { pestId, source });
}

export function trackProGateShown(feature: 'alternatives' | 'pdf' | 'history' | 'details'): void {
  trackEvent('pro_gate_shown', { feature });
}

export function trackProGateTapped(feature: 'alternatives' | 'pdf' | 'history' | 'details'): void {
  trackEvent('pro_gate_tapped', { feature });
}

export function trackShareDiagnosis(method: 'whatsapp' | 'pdf' | 'share_sheet'): void {
  trackEvent('share_diagnosis', { method });
}

export function trackLanguageChanged(language: string): void {
  trackEvent('language_changed', { language });
}

export function trackError(errorType: string, message: string): void {
  trackEvent('app_error', { errorType, message });
}
