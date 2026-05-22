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

export interface AnalyticsEvent {
  event: string;
  properties?: Record<string, unknown>;
  timestamp: string;
  userId?: string;
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

  const batch = eventQueue.splice(0, eventQueue.length);

  try {
    // For now, log to Supabase edge function or table
    // This can be replaced with PostHog/Amplitude SDK call
    const { error } = await supabase.functions.invoke('analytics', {
      body: { events: batch },
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
  source: 'result' | 'history' | 'deeplink',
): void {
  trackEvent('pest_detail_viewed', { pestId, source });
}

export function trackProGateShown(feature: 'alternatives' | 'pdf' | 'history' | 'details'): void {
  trackEvent('pro_gate_shown', { feature });
}

export function trackProGateTapped(feature: 'alternatives' | 'pdf' | 'history' | 'details'): void {
  trackEvent('pro_gate_tapped', { feature });
}

export function trackShareDiagnosis(method: 'whatsapp' | 'pdf'): void {
  trackEvent('share_diagnosis', { method });
}

export function trackLanguageChanged(language: string): void {
  trackEvent('language_changed', { language });
}

export function trackError(errorType: string, message: string): void {
  trackEvent('app_error', { errorType, message });
}

// =====================================================
// Funnel coverage helpers (INV-3 / 2026-05-22)
// -----------------------------------------------------
// Wave wired by feat/pragas-telemetry-wire-up-2026-05-22 to close the funnel
// drop-off blind-spots discovered in INV-3 ("4 trials 100% drop-off, telemetry
// cega"). Signatures are additive only — existing helpers above untouched.
// =====================================================

/**
 * App was opened (cold start or warm foreground). Wired at root layout mount.
 */
export function trackAppOpened(properties?: {
  isAuthenticated?: boolean;
  hasSeenOnboarding?: boolean;
}): void {
  trackEvent('app_opened', properties);
}

/**
 * User tapped "Criar conta" tab or entered signup mode. The user may abandon
 * before submit — this captures the *intent*.
 */
export function trackSignupStarted(properties?: { method?: 'email' | 'apple' }): void {
  trackEvent('signup_started', properties);
}

/**
 * Supabase auth.signUp() resolved successfully (email confirmation pending or
 * not depending on Supabase config). DOES NOT mean the user has confirmed.
 */
export function trackSignupCompleted(properties?: { method?: 'email' | 'apple' }): void {
  trackEvent('signup_completed', properties);
}

/**
 * About to call ImagePicker.requestCameraPermissionsAsync / MediaLibrary.
 * Pair with trackPermissionGranted / trackPermissionDenied for funnel.
 */
export function trackPermissionPrompted(permission: 'camera' | 'gallery' | 'location'): void {
  trackEvent('permission_prompted', { permission });
}

export function trackPermissionGranted(permission: 'camera' | 'gallery' | 'location'): void {
  trackEvent('permission_granted', { permission });
}

export function trackPermissionDenied(
  permission: 'camera' | 'gallery' | 'location',
  properties?: { canAskAgain?: boolean },
): void {
  trackEvent('permission_denied', { permission, ...properties });
}

/**
 * User tapped "Diagnosticar" CTA. Funnel entry — not yet a successful diagnosis.
 */
export function trackFirstDiagnosisAttempted(properties?: { crop?: string }): void {
  trackEvent('first_diagnosis_attempted', properties);
}

/**
 * Diagnosis result successfully rendered with a pest_id.
 */
export function trackFirstDiagnosisSuccess(properties?: {
  pestId?: string;
  crop?: string;
  confidence?: number;
}): void {
  trackEvent('first_diagnosis_success', properties);
}

/**
 * Paywall screen mounted / visible.
 */
export function trackPaywallViewed(properties?: { source?: string; selectedPlan?: string }): void {
  trackEvent('paywall_viewed', properties);
}

/**
 * Paywall closed without purchase (back, swipe down, close X).
 */
export function trackPaywallDismissed(properties?: { selectedPlan?: string }): void {
  trackEvent('paywall_dismissed', properties);
}

/**
 * Paywall purchase succeeded (RevenueCat returned CustomerInfo).
 */
export function trackPaywallPurchased(properties: { plan: string; provider: string }): void {
  trackEvent('paywall_purchased', properties);
}

/**
 * AppState went background / inactive — used to flush analytics queue before
 * the OS kills the JS context. Fire-and-forget.
 */
export function trackSessionEnd(properties?: { reason?: 'background' | 'inactive' }): void {
  trackEvent('session_end', properties);
}

/**
 * Force-flush the in-memory analytics queue. Safe to call any time.
 * Useful in AppState background transitions to make sure events don't get
 * lost when the OS suspends the JS context.
 *
 * Errors are swallowed (Sentry breadcrumb only) — analytics must never crash
 * the caller.
 */
export async function flush(): Promise<void> {
  try {
    await flushEvents();
  } catch (err) {
    if (__DEV__) console.warn('[Analytics] flush() error (swallowed):', err);
  }
}
