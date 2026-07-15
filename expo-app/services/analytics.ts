/** Privacy-minimized, authenticated product analytics for Rumo Pragas. */
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const FLUSH_INTERVAL_MS = 30_000;
const AUTO_FLUSH_SIZE = 50;
const MAX_QUEUE_SIZE = 100;
const MAX_BATCH_BYTES = 512 * 1024;
const MAX_PROPERTIES = 20;
const EVENT_NAME_RE = /^[a-z][a-z0-9_]{0,63}$/;
const PROPERTY_KEY_RE = /^[a-z][a-zA-Z0-9_]{0,63}$/;
const FORBIDDEN_PROPERTY_RE =
  /(?:user|email|phone|token|secret|password|image|base64|latitude|longitude|location|address|message)/i;

export interface AnalyticsEvent {
  eventId: string;
  event: string;
  properties?: Record<string, string | number | boolean> | undefined;
  timestamp: string;
  platform: string;
}

interface PendingBatch {
  idempotencyKey: string;
  eventIds: string[];
}

const eventQueue: AnalyticsEvent[] = [];
let pendingBatch: PendingBatch | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let currentUserId: string | null = null;
let currentAuthUserId: string | null = null;
let currentAccessToken: string | null = null;
let isFlushing = false;

supabase.auth.onAuthStateChange((_event, session) => {
  const nextAuthUserId = session?.user?.id ?? null;
  if (!nextAuthUserId || (currentUserId !== null && currentUserId !== nextAuthUserId)) {
    clearQueuedEvents();
  }
  currentAuthUserId = nextAuthUserId;
  currentAccessToken = session?.access_token ?? null;
});

function isAnalyticsEnabled(): boolean {
  return process.env.EXPO_PUBLIC_ENABLE_ANALYTICS !== 'false';
}

function sanitizeProperties(
  properties?: Record<string, unknown>,
): Record<string, string | number | boolean> | undefined {
  if (!properties) return undefined;
  const clean: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(properties).slice(0, MAX_PROPERTIES)) {
    if (!PROPERTY_KEY_RE.test(key) || FORBIDDEN_PROPERTY_RE.test(key)) continue;
    if (typeof value === 'boolean') clean[key] = value;
    else if (typeof value === 'number' && Number.isFinite(value)) clean[key] = value;
    else if (typeof value === 'string') clean[key] = value.slice(0, 120);
  }
  return Object.keys(clean).length > 0 ? clean : undefined;
}

function clearQueuedEvents(): void {
  eventQueue.length = 0;
  pendingBatch = null;
}

function safeFlushTick(): void {
  void flushEvents().catch(() => {
    if (__DEV__) console.warn('[Analytics] Flush unavailable');
  });
}

/** Start authenticated analytics. Every account transition starts with an empty queue. */
export function initAnalytics(userId: string): void {
  if (!isAnalyticsEnabled() || !userId.trim()) {
    resetAnalytics();
    return;
  }
  if (currentUserId !== userId) clearQueuedEvents();
  currentUserId = userId;
  if (flushTimer) clearInterval(flushTimer);
  flushTimer = setInterval(safeFlushTick, FLUSH_INTERVAL_MS);
}

/** Logout is a strict privacy boundary; nothing from account A may reach B. */
export function resetAnalytics(): void {
  currentUserId = null;
  currentAuthUserId = null;
  currentAccessToken = null;
  clearQueuedEvents();
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

export function trackEvent(event: string, properties?: Record<string, unknown>): void {
  if (
    !isAnalyticsEnabled() ||
    !currentUserId ||
    !currentAccessToken ||
    currentAuthUserId !== currentUserId
  )
    return;
  if (!EVENT_NAME_RE.test(event)) return;
  const safeProperties = sanitizeProperties(properties);
  const analyticsEvent: AnalyticsEvent = {
    eventId: Crypto.randomUUID(),
    event,
    ...(safeProperties ? { properties: safeProperties } : {}),
    timestamp: new Date().toISOString(),
    platform: Platform.OS,
  };

  eventQueue.push(analyticsEvent);
  if (eventQueue.length > MAX_QUEUE_SIZE) {
    const removed = eventQueue.splice(0, eventQueue.length - MAX_QUEUE_SIZE);
    if (pendingBatch && removed.some((item) => pendingBatch?.eventIds.includes(item.eventId))) {
      pendingBatch = null;
    }
  }
  if (eventQueue.length >= AUTO_FLUSH_SIZE) void flushEvents();
}

function selectBatchEvents(): AnalyticsEvent[] {
  if (pendingBatch) {
    const ids = new Set(pendingBatch.eventIds);
    const retryEvents = eventQueue.filter((item) => ids.has(item.eventId));
    if (retryEvents.length === pendingBatch.eventIds.length) return retryEvents;
    pendingBatch = null;
  }

  const selected: AnalyticsEvent[] = [];
  for (const item of eventQueue.slice(0, MAX_QUEUE_SIZE)) {
    const candidate = [...selected, item];
    const bytes = new TextEncoder().encode(JSON.stringify({ events: candidate })).byteLength;
    if (bytes > MAX_BATCH_BYTES) break;
    selected.push(item);
  }
  if (selected.length > 0) {
    pendingBatch = {
      idempotencyKey: Crypto.randomUUID(),
      eventIds: selected.map((item) => item.eventId),
    };
  }
  return selected;
}

async function flushEvents(): Promise<void> {
  if (
    !isAnalyticsEnabled() ||
    isFlushing ||
    eventQueue.length === 0 ||
    !currentAccessToken ||
    !currentUserId ||
    currentAuthUserId !== currentUserId
  )
    return;
  const batch = selectBatchEvents();
  if (batch.length === 0 || !pendingBatch) return;
  const batchContract = pendingBatch;
  isFlushing = true;
  try {
    const { error } = await supabase.functions.invoke('pragas-analytics', {
      body: { events: batch },
      headers: {
        Authorization: `Bearer ${currentAccessToken}`,
        'Idempotency-Key': batchContract.idempotencyKey,
      },
    });
    if (error) return;
    const sent = new Set(batchContract.eventIds);
    for (let index = eventQueue.length - 1; index >= 0; index -= 1) {
      if (sent.has(eventQueue[index]!.eventId)) eventQueue.splice(index, 1);
    }
    if (pendingBatch?.idempotencyKey === batchContract.idempotencyKey) pendingBatch = null;
  } catch {
    // Keep the exact events and batch key for an idempotent retry.
  } finally {
    isFlushing = false;
  }
}

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

export function trackPestDetailViewed(
  pestId: string,
  source: 'result' | 'history' | 'deeplink' | 'library',
): void {
  trackEvent('pest_detail_viewed', { pestId, source });
}

export function trackShareDiagnosis(method: 'whatsapp' | 'pdf' | 'share_sheet'): void {
  trackEvent('share_diagnosis', { method });
}

export function trackLanguageChanged(language: string): void {
  trackEvent('language_changed', { language });
}

/** Error messages may contain secrets or user content; only the bounded category is sent. */
export function trackError(errorType: string, _message?: string): void {
  trackEvent('app_error', { errorType });
}
