import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// ZERO-O: shared Sentry helper for edge fns (added W9-4 withSentry HOC sweep 2026-05-22).
// captureException → outer catch; captureMessage → security/db-write degradation
// events that previously only emitted logJson(level=ERROR) — Sentry blind.
import { captureException, captureMessage } from "../_shared/sentry.ts";

/**
 * Edge Function: revenuecat-webhook
 *
 * Handles RevenueCat server-side webhook events for subscription lifecycle.
 *
 * SECURITY (#14): RevenueCat webhooks use Bearer token authentication
 * (NOT HMAC — as of 2026, RC does not natively support HMAC signatures for webhooks,
 * only a shared Authorization header). We apply the following compensating controls:
 *
 *   1. HTTPS-only (TLS protects payload integrity in transit)
 *   2. Constant-time token comparison (timingSafeEqual) prevents timing attacks
 *   3. Rate limiting per-caller (100 req/min max) caps brute-force damage
 *   4. Idempotency via in-memory event dedup prevents replay attacks on retries
 *   5. UUID format validation on app_user_id prevents injection downstream
 *   6. Strict event-type allowlist (SUBSCRIPTION_EVENTS) ignores unknown types
 *   7. REVENUECAT_WEBHOOK_SECRET rotation policy: ROTATE MONTHLY (see RATE_LIMITS.md)
 *
 * If/when RevenueCat adds native HMAC signing, migrate by verifying
 * X-RevenueCat-Signature header against body HMAC-SHA256.
 * Docs: https://www.revenuecat.com/docs/integrations/webhooks
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const REVENUECAT_WEBHOOK_SECRET =
  Deno.env.get("REVENUECAT_WEBHOOK_SECRET") ?? "";

// ── Security: Environment check for sandbox enforcement ──
// Mirrors stripe-webhook livemode check. Prevents attackers with a leaked
// webhook secret from emitting SANDBOX events that would upsert active
// subscriptions, granting free lifetime Pro to arbitrary user_ids.
const IS_PRODUCTION = (Deno.env.get("ENVIRONMENT") ?? Deno.env.get("DENO_ENV") ?? "production").toLowerCase() === "production";

// ── Security: CORS — whitelist fallback instead of wildcard ──
// Webhooks from RevenueCat are server-to-server so CORS origin is less relevant,
// but we keep a fallback whitelist to handle any dashboard/testing scenarios.
const DEFAULT_ALLOWED = [
  "https://pragas.agrorumo.com",
  "https://rumopragas.com.br",
  "https://app.revenuecat.com",
];
const ALLOWED_ORIGINS = (() => {
  const env = Deno.env.get("ALLOWED_ORIGINS");
  if (!env || env.trim() === "") return DEFAULT_ALLOWED;
  return env.split(",").map((o) => o.trim()).filter(Boolean);
})();

function getCorsHeaders(req?: Request) {
  const origin = req?.headers.get("origin") ?? "";
  const allowedOrigin =
    ALLOWED_ORIGINS.length === 0
      ? ""
      : ALLOWED_ORIGINS.includes(origin)
        ? origin
        : "";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

// ── Security: Request ID ──
function generateRequestId(): string {
  return crypto.randomUUID();
}

// ── Structured logging (#12) ──
function logJson(fn: string, requestId: string, level: string, message: string, context?: Record<string, unknown>) {
  const entry = JSON.stringify({ function: fn, requestId, level, message, ts: new Date().toISOString(), ...context });
  if (level === "ERROR" || level === "FATAL" || level === "WARN") {
    console.error(entry);
  } else {
    console.log(entry);
  }
}

// ── Security: Constant-time string comparison ──
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

// ── Rate limiting: in-memory for webhooks (#2) ──
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 100; // 100 req/min for webhooks

function checkWebhookRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

// Map RevenueCat event types to subscription status
type RevenueCatEventType =
  | "INITIAL_PURCHASE"
  | "RENEWAL"
  | "PRODUCT_CHANGE"
  | "CANCELLATION"
  | "UNCANCELLATION"
  | "BILLING_ISSUE"
  | "SUBSCRIBER_ALIAS"
  | "SUBSCRIPTION_PAUSED"
  | "TRANSFER"
  | "EXPIRATION"
  | "NON_RENEWING_PURCHASE";

interface RevenueCatEvent {
  type: RevenueCatEventType;
  app_user_id: string;
  aliases?: string[];
  product_id: string;
  entitlement_ids?: string[];
  period_type: "TRIAL" | "INTRO" | "NORMAL";
  purchased_at_ms: number;
  expiration_at_ms: number | null;
  environment: "SANDBOX" | "PRODUCTION";
  store: "APP_STORE" | "PLAY_STORE" | "STRIPE" | "PROMOTIONAL";
  is_family_share?: boolean;
  presented_offering_id?: string;
  price_in_purchased_currency?: number;
  currency?: string;
  country_code?: string;
  original_app_user_id?: string;
}

interface RevenueCatWebhookPayload {
  api_version: string;
  event: RevenueCatEvent;
}

function derivePlan(event: RevenueCatEvent): string {
  const entitlements = event.entitlement_ids ?? [];
  if (entitlements.includes("enterprise")) return "enterprise";
  if (entitlements.includes("pro")) return "pro";

  const productId = (event.product_id ?? "").toLowerCase();
  if (productId.includes("enterprise")) return "enterprise";
  if (productId.includes("pro")) return "pro";

  return "free";
}

function deriveStatus(eventType: RevenueCatEventType): string {
  switch (eventType) {
    case "INITIAL_PURCHASE":
    case "RENEWAL":
    case "UNCANCELLATION":
    case "PRODUCT_CHANGE":
    case "NON_RENEWING_PURCHASE":
      return "active";
    case "CANCELLATION":
      return "canceled";
    case "BILLING_ISSUE":
      return "past_due";
    case "SUBSCRIPTION_PAUSED":
      return "paused";
    case "EXPIRATION":
      return "expired";
    default:
      return "active";
  }
}

function deriveProvider(store: string): string {
  switch (store) {
    case "APP_STORE":
      return "apple";
    case "PLAY_STORE":
      return "google";
    case "STRIPE":
      return "stripe";
    case "PROMOTIONAL":
      return "promotional";
    default:
      return store.toLowerCase();
  }
}

// Simple in-memory idempotency
const processedEvents = new Map<string, number>();
const MAX_EVENTS = 500;
const EVENT_TTL_MS = 15 * 60 * 1000;

function deduplicateEvent(eventKey: string): boolean {
  if (processedEvents.size > MAX_EVENTS) {
    const now = Date.now();
    for (const [id, ts] of processedEvents) {
      if (now - ts > EVENT_TTL_MS) processedEvents.delete(id);
    }
  }
  if (processedEvents.has(eventKey)) return true;
  processedEvents.set(eventKey, Date.now());
  return false;
}

// ── Security: Valid subscription event types we process ──
const SUBSCRIPTION_EVENTS = new Set<RevenueCatEventType>([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "PRODUCT_CHANGE",
  "CANCELLATION",
  "UNCANCELLATION",
  "BILLING_ISSUE",
  "SUBSCRIPTION_PAUSED",
  "EXPIRATION",
  "NON_RENEWING_PURCHASE",
]);

Deno.serve(async (req: Request) => {
  const requestId = generateRequestId();
  const corsHeaders = getCorsHeaders(req);

  // ── Structured request metadata logging (#10) ──
  logJson("revenuecat-webhook", requestId, "INFO", "Request received", {
    method: req.method,
    origin: req.headers.get("origin") ?? "none",
  });

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        ...corsHeaders,
        "Access-Control-Max-Age": "86400", // (#4) Cache preflight for 24h
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed", requestId }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // ── Rate limiting for webhooks (#2) ──
  // Use IP-based or auth-header-based key for rate limiting
  const authHeaderForRl = req.headers.get("Authorization") ?? "unknown";
  const rlKey = authHeaderForRl.slice(0, 32);
  if (!checkWebhookRateLimit(rlKey)) {
    logJson("revenuecat-webhook", requestId, "WARN", "Rate limit exceeded for webhook caller");
    return new Response(
      JSON.stringify({ error: "Too many requests", requestId }),
      {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
      },
    );
  }

  // ── Security: Verify webhook authorization (mandatory) ──
  if (!REVENUECAT_WEBHOOK_SECRET) {
    logJson("revenuecat-webhook", requestId, "ERROR", "Secret not configured");
    return new Response(
      JSON.stringify({ error: "Webhook secret not configured", requestId }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const expected = `Bearer ${REVENUECAT_WEBHOOK_SECRET}`;

  // ── Security: Constant-time comparison to prevent timing attacks ──
  // See file header for HMAC discussion (#14) and compensating controls.
  if (authHeader.length !== expected.length || !timingSafeEqual(authHeader, expected)) {
    // ZERO-O: capture invalid-auth events. RevenueCat in normal operation
    // sends the configured Bearer token; mismatches indicate rotated secret
    // (misconfig) or attack attempts. Either way: alert.
    captureMessage("revenuecat-webhook invalid authorization", {
      level: "warning",
      tags: { fn: "revenuecat-webhook", phase: "auth-check" },
      extra: { requestId, has_header: authHeader.length > 0 },
    });
    logJson("revenuecat-webhook", requestId, "ERROR", "Invalid authorization");
    return new Response(
      JSON.stringify({ error: "Unauthorized", requestId }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  let payload: RevenueCatWebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON", requestId }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const event = payload.event;
  if (!event || !event.type || !event.app_user_id) {
    return new Response(
      JSON.stringify({ error: "Missing event data", requestId }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // ── Security: Validate app_user_id is a UUID ──
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(event.app_user_id)) {
    return new Response(
      JSON.stringify({ error: "Invalid user ID format", requestId }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // ── Security: Reject SANDBOX events in production (mirrors stripe-webhook livemode check) ──
  // Without this, an attacker with the webhook secret could craft sandbox payloads that
  // upsert subscriptions.active rows, granting free lifetime Pro to arbitrary user_ids.
  // In staging/dev (ENVIRONMENT != "production") sandbox events are still processed for testing.
  if (IS_PRODUCTION && event.environment === "SANDBOX") {
    const eventIdForLog = event.id ?? `rc_${event.app_user_id}_${event.type}_${event.purchased_at_ms}`;
    logJson("revenuecat-webhook", requestId, "WARN", "Rejected sandbox event in production", {
      eventId: eventIdForLog,
      eventType: event.type,
      app_user_id: event.app_user_id,
    });
    return new Response(
      JSON.stringify({ error: "Sandbox events not accepted in production", requestId }),
      {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Init supabase client early — needed for persistent idempotency
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ── Persistent idempotency via webhook_events table ──
  // RC sends event.id; fall back to composite key for legacy payloads.
  const eventId =
    event.id ??
    `rc_${event.app_user_id}_${event.type}_${event.purchased_at_ms}`;

  {
    const { error: insertErr } = await supabase
      .from("webhook_events")
      .insert({
        event_id: eventId,
        source: "revenuecat",
        event_type: event.type,
        payload_summary: {
          environment: event.environment,
          store: event.store,
          app_user_id: event.app_user_id,
          product_id: event.product_id,
        },
      });

    if (insertErr) {
      const code = (insertErr as { code?: string }).code;
      if (code === "23505") {
        // duplicate → already processed
        logJson("revenuecat-webhook", requestId, "INFO", "Duplicate event — already received", { eventId });
        return new Response(
          JSON.stringify({ received: true, deduplicated: true, requestId }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      // ZERO-O fix W9-4: this call previously referenced an undefined
      // `captureError` symbol — would have crashed the Deno runtime on the
      // first non-23505 insert error. Replaced with the canonical
      // captureException from _shared/sentry.ts.
      await captureException(insertErr, {
        tags: { fn: "revenuecat-webhook", op: "webhook_events_insert" },
        extra: { eventId, eventType: event.type },
      });
      logJson("revenuecat-webhook", requestId, "ERROR", "webhook_events insert failed", { error: insertErr.message });
      // Continue processing — prefer double-process over drop.
    }
  }

  // Fallback in-memory dedup retained as second-layer guard against rapid retries
  // hitting the same warm instance before the row commit lands.
  const memKey = `${event.app_user_id}_${event.type}_${event.purchased_at_ms}`;
  if (deduplicateEvent(memKey)) {
    return new Response(
      JSON.stringify({ received: true, deduplicated: true, requestId }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Skip non-subscription events
  if (!SUBSCRIPTION_EVENTS.has(event.type)) {
    logJson("revenuecat-webhook", requestId, "INFO", "Skipping non-subscription event", { eventType: event.type });
    return new Response(
      JSON.stringify({ received: true, skipped: true, requestId }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    const userId = event.app_user_id;
    const plan = derivePlan(event);
    const status = deriveStatus(event.type);
    const provider = deriveProvider(event.store);

    const periodStart = event.purchased_at_ms
      ? new Date(event.purchased_at_ms).toISOString()
      : null;
    const periodEnd = event.expiration_at_ms
      ? new Date(event.expiration_at_ms).toISOString()
      : null;

    // ── Security: Sanitize product_id before storing ──
    const safeProductId = (event.product_id ?? "")
      .replace(/[^a-zA-Z0-9_.\-:]/g, "")
      .slice(0, 255);

    const { error: upsertError } = await supabase
      .from("subscriptions")
      .upsert(
        {
          user_id: userId,
          plan,
          status,
          provider,
          current_period_start: periodStart,
          current_period_end: periodEnd,
          updated_at: new Date().toISOString(),
          revenuecat_product_id: safeProductId,
          revenuecat_environment: event.environment,
        },
        { onConflict: "user_id" },
      );

    if (upsertError) {
      // ZERO-O: subscription upsert failure is a billing-flow degradation.
      // Without Sentry capture, customers stay on stale plan tier silently.
      await captureException(upsertError, {
        level: "error",
        tags: { fn: "revenuecat-webhook", phase: "subscription-upsert" },
        extra: { requestId, userId, eventType: event.type, plan, status },
      });
      logJson("revenuecat-webhook", requestId, "ERROR", "Upsert error", { userId, error: upsertError.message });
      return new Response(
        JSON.stringify({ error: "Failed to update subscription", requestId }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    logJson("revenuecat-webhook", requestId, "INFO", "Event processed", {
      eventType: event.type,
      plan,
      status,
    });

    return new Response(
      JSON.stringify({
        received: true,
        processed: true,
        requestId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    // ZERO-O: outer-catch Sentry capture. logJson stream is structured
    // stdout only — Sentry is what wakes on-call.
    await captureException(err, {
      level: "error",
      tags: { fn: "revenuecat-webhook", phase: "outer-catch" },
      extra: { requestId },
    });
    logJson("revenuecat-webhook", requestId, "ERROR", "Unexpected error", { error: String(err) });
    return new Response(
      JSON.stringify({ error: "Internal server error", requestId }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
