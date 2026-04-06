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
 * Initialize analytics with the authenticated user ID.
 * Call once after login.
 */
export function initAnalytics(userId: string): void {
  currentUserId = userId;

  if (!flushTimer) {
    flushTimer = setInterval(flushEvents, FLUSH_INTERVAL_MS);
  }
}

/**
 * Reset analytics on logout.
 */
export function resetAnalytics(): void {
  currentUserId = null;
  flushEvents(); // flush remaining events
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
    console.log('[Analytics]', event, properties ?? '');
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

export function trackShareDiagnosis(method: 'whatsapp' | 'pdf'): void {
  trackEvent('share_diagnosis', { method });
}

export function trackLanguageChanged(language: string): void {
  trackEvent('language_changed', { language });
}

export function trackError(errorType: string, message: string): void {
  trackEvent('app_error', { errorType, message });
}
