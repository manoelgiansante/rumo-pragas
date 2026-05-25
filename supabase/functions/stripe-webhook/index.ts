import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { captureException, logError } from "../_shared/sentry.ts";

const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// ── Security: Environment check for livemode enforcement (#13) ──
const IS_PRODUCTION = (Deno.env.get("ENVIRONMENT") ?? Deno.env.get("DENO_ENV") ?? "production").toLowerCase() === "production";

// ── Security: CORS — whitelist fallback (server-to-server webhook) ──
const DEFAULT_ALLOWED = [
  "https://pragas.agrorumo.com",
  "https://rumopragas.com.br",
  "https://dashboard.stripe.com",
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
      "authorization, x-client-info, apikey, content-type, stripe-signature",
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

// ── Rate limiting: in-memory for webhooks (#1) ──
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

// ── UUID validation regex (#7) ──
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Warm-path in-memory dedup retained as second-layer guard against rapid
// retries hitting the same warm instance before the persistent row commit
// lands. Persistent dedup via `webhook_events` PK (event_id) is authoritative.
const processedEvents = new Map<string, number>();
const MAX_PROCESSED_EVENTS = 1000;
const EVENT_TTL_MS = 30 * 60 * 1000; // 30 minutes

function isEventProcessed(eventId: string): boolean {
  if (processedEvents.size > MAX_PROCESSED_EVENTS) {
    const now = Date.now();
    for (const [id, timestamp] of processedEvents) {
      if (now - timestamp > EVENT_TTL_MS) processedEvents.delete(id);
    }
  }
  return processedEvents.has(eventId);
}

function markEventProcessed(eventId: string): void {
  processedEvents.set(eventId, Date.now());
}

/**
 * Verify Stripe webhook signature using Web Crypto API (Deno-compatible).
 * Implements Stripe's v1 HMAC-SHA256 signature scheme.
 */
async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string,
): Promise<boolean> {
  const parts = sigHeader
    .split(",")
    .reduce((acc: Record<string, string>, part) => {
      const [key, value] = part.split("=");
      if (key && value) acc[key.trim()] = value.trim();
      return acc;
    }, {});

  const timestamp = parts["t"];
  const signature = parts["v1"];

  if (!timestamp || !signature) {
    return false;
  }

  // Reject events older than 5 minutes to prevent replay attacks
  const currentTime = Math.floor(Date.now() / 1000);
  if (currentTime - parseInt(timestamp, 10) > 300) {
    return false;
  }

  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(signedPayload),
  );
  const expectedSignature = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison to prevent timing attacks
  if (expectedSignature.length !== signature.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < expectedSignature.length; i++) {
    mismatch |= expectedSignature.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

// ── Security: Typed Stripe event (no `any`) ──
interface StripeEventObject {
  customer?: string;
  subscription?: string;
  metadata?: Record<string, string>;
  status?: string;
  current_period_start?: number;
  current_period_end?: number;
}

interface StripeEvent {
  id: string;
  type: string;
  livemode: boolean;
  data: {
    object: StripeEventObject;
  };
}

// ── Security: Valid Stripe event types we handle ──
const HANDLED_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
]);

Deno.serve(async (req: Request) => {
  const requestId = generateRequestId();
  const corsHeaders = getCorsHeaders(req);

  // ── Structured request metadata logging (#10) ──
  logJson("stripe-webhook", requestId, "INFO", "Request received", {
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
    return new Response("Method not allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  // ── Rate limiting for webhooks (#1) ──
  // Use a hash of the first 16 chars of the signature as rate limit key
  const sigHeader = req.headers.get("stripe-signature") ?? "";
  const rlKey = sigHeader ? sigHeader.slice(0, 32) : "unknown";
  if (!checkWebhookRateLimit(rlKey)) {
    logJson("stripe-webhook", requestId, "WARN", "Rate limit exceeded for webhook caller");
    return new Response(
      JSON.stringify({ error: "Too many requests", requestId }),
      {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
      },
    );
  }

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  // Verify webhook signature
  if (!signature || !STRIPE_WEBHOOK_SECRET) {
    return new Response(
      JSON.stringify({ error: "Missing signature or webhook secret", requestId }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const isValid = await verifyStripeSignature(
    body,
    signature,
    STRIPE_WEBHOOK_SECRET,
  );
  if (!isValid) {
    return new Response(
      JSON.stringify({ error: "Invalid signature", requestId }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(body);
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON", requestId }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ── Validate event structure ──
  if (!event.id || typeof event.id !== "string" || !event.type || !event.data?.object) {
    return new Response(
      JSON.stringify({ error: "Invalid event structure", requestId }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ── Security: Reject test/sandbox events in production (#13) ──
  if (IS_PRODUCTION && event.livemode === false) {
    logJson("stripe-webhook", requestId, "WARN", "Rejected sandbox event in production", { eventId: event.id, eventType: event.type });
    return new Response(
      JSON.stringify({ error: "Test events not accepted in production", requestId }),
      {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Warm-path in-memory dedup (fast pre-check)
  if (isEventProcessed(event.id)) {
    return new Response(
      JSON.stringify({ received: true, deduplicated: true, requestId }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Skip unhandled event types
  if (!HANDLED_EVENT_TYPES.has(event.type)) {
    return new Response(
      JSON.stringify({ received: true, skipped: true, requestId }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ── Persistent idempotency via webhook_events PK (survives cold start) ──
  // Pattern: claim-INSERT-first. If row already exists, PK violation (23505)
  // tells us this is a duplicate Stripe retry. We short-circuit with 200.
  // Mirrors Rumo-Arroba/Rumo-CampoVivo/Rumo-Pragas RC webhook patterns.
  {
    const { error: dedupErr } = await supabase
      .from("webhook_events")
      .insert({
        event_id: event.id,
        event_type: event.type,
        source: "stripe",
        payload_summary: {
          livemode: event.livemode,
        },
      });
    if (dedupErr) {
      const code = (dedupErr as { code?: string }).code;
      if (code === "23505") {
        logJson("stripe-webhook", requestId, "INFO", "Duplicate event (persistent dedup)", { eventId: event.id });
        markEventProcessed(event.id);
        return new Response(
          JSON.stringify({ received: true, deduplicated: true, requestId }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      // Non-fatal: log + Sentry, continue. Prefer double-process over drop.
      await logError(dedupErr, {
        tags: { fn: "stripe-webhook", op: "webhook_events_insert" },
        extra: { eventId: event.id, eventType: event.type, requestId },
      });
      logJson("stripe-webhook", requestId, "ERROR", "webhook_events insert failed (non-fatal)", { error: (dedupErr as Error).message });
    }
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata?.user_id;
        const plan = session.metadata?.plan || "pro";

        // ── Security: Validate user_id is UUID format (#7) ──
        if (userId && !UUID_REGEX.test(userId)) {
          logJson("stripe-webhook", requestId, "WARN", "Invalid user_id format in checkout metadata", { userId });
          break;
        }

        if (userId) {
          await supabase.from("subscriptions").upsert(
            {
              user_id: userId,
              plan: plan,
              status: "active",
              stripe_customer_id: session.customer,
              stripe_subscription_id: session.subscription,
              current_period_start: new Date().toISOString(),
              current_period_end: new Date(
                Date.now() + 30 * 24 * 60 * 60 * 1000,
              ).toISOString(),
            },
            { onConflict: "user_id" },
          );
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        const status =
          subscription.status === "active"
            ? "active"
            : subscription.status === "trialing"
              ? "trialing"
              : subscription.status === "past_due"
                ? "past_due"
                : "canceled";

        const updateData: Record<string, unknown> = { status };
        if (subscription.current_period_start) {
          updateData.current_period_start = new Date(
            subscription.current_period_start * 1000,
          ).toISOString();
        }
        if (subscription.current_period_end) {
          updateData.current_period_end = new Date(
            subscription.current_period_end * 1000,
          ).toISOString();
        }

        await supabase
          .from("subscriptions")
          .update(updateData)
          .eq("stripe_customer_id", customerId);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        await supabase
          .from("subscriptions")
          .update({ plan: "free", status: "canceled" })
          .eq("stripe_customer_id", subscription.customer);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        await supabase
          .from("subscriptions")
          .update({ status: "past_due" })
          .eq("stripe_customer_id", invoice.customer);
        break;
      }
    }

    markEventProcessed(event.id);

    logJson("stripe-webhook", requestId, "INFO", "Event processed", { eventType: event.type, eventId: event.id });

    return new Response(
      JSON.stringify({ received: true, requestId }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    // Never leak internal error details to client
    logJson("stripe-webhook", requestId, "ERROR", "Processing error", { error: String(error) });
    await captureException(error, {
      tags: { fn: "stripe-webhook", op: "handler_error", requestId },
      extra: { eventId: event.id, eventType: event.type },
    });
    return new Response(
      JSON.stringify({ error: "Internal processing error", requestId }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
