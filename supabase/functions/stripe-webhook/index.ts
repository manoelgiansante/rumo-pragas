import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";
import { captureError } from "../_shared/sentry.ts";

const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// ── Security: Environment check for livemode enforcement (#13) ──
const IS_PRODUCTION = (Deno.env.get("ENVIRONMENT") ?? Deno.env.get("DENO_ENV") ?? "production").toLowerCase() === "production";

// ── Stripe SDK (lazy — only initialized if key present) ──
const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2024-09-30.acacia",
      httpClient: Stripe.createFetchHttpClient(),
    })
  : null;

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
  id?: string;
  customer?: string;
  subscription?: string;
  metadata?: Record<string, string>;
  status?: string;
  current_period_start?: number;
  current_period_end?: number;
  // Stripe Subscription items[].current_period_* (API 2024-09-30+)
  items?: { data?: Array<{ current_period_start?: number; current_period_end?: number }> };
  // checkout.session.completed
  mode?: string;
  // invoice fields
  lines?: { data?: Array<{ period?: { end?: number; start?: number }; subscription?: string }> };
  trial_end?: number;
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
// Expanded vs prior version to handle ZERO-O Stripe webhook verification rule:
// every branch that updates subscription state must reflect REAL Stripe data.
const HANDLED_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.trial_will_end",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
]);

// ── Helpers ──
function pickPeriodEnd(sub: Stripe.Subscription | StripeEventObject): number | null {
  // Stripe API 2024-09-30+ moved current_period_* to items[].current_period_*
  // Fall back to top-level for older webhooks.
  const items = (sub as Stripe.Subscription).items;
  const itemEnd = items?.data?.[0]?.current_period_end;
  if (typeof itemEnd === "number") return itemEnd;
  const topEnd = (sub as StripeEventObject).current_period_end;
  if (typeof topEnd === "number") return topEnd;
  return null;
}

function pickPeriodStart(sub: Stripe.Subscription | StripeEventObject): number | null {
  const items = (sub as Stripe.Subscription).items;
  const itemStart = items?.data?.[0]?.current_period_start;
  if (typeof itemStart === "number") return itemStart;
  const topStart = (sub as StripeEventObject).current_period_start;
  if (typeof topStart === "number") return topStart;
  return null;
}

function mapStatus(stripeStatus: string | undefined): string {
  // Preserve full granularity: 'trialing' is NOT 'active'.
  switch (stripeStatus) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      return stripeStatus ?? "active";
  }
}

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

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ── Persistent idempotency via webhook_events table ──
  // Survives cold starts (in-memory Map did not).
  // INSERT … ON CONFLICT DO NOTHING + check rowcount via select.
  {
    const { error: insertErr } = await supabase
      .from("webhook_events")
      .insert({
        event_id: event.id,
        source: "stripe",
        event_type: event.type,
        payload_summary: {
          livemode: event.livemode,
          object: {
            id: event.data.object?.id,
            customer: event.data.object?.customer,
            subscription: event.data.object?.subscription,
            status: event.data.object?.status,
          },
        },
      });

    if (insertErr) {
      const code = (insertErr as { code?: string }).code;
      if (code === "23505") {
        // duplicate key → already processed
        logJson("stripe-webhook", requestId, "INFO", "Duplicate event — already received", { eventId: event.id });
        return new Response(
          JSON.stringify({ received: true, deduplicated: true, requestId }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      // Non-dedup error — log to Sentry but don't fail the webhook (Stripe will retry)
      await captureError(insertErr, {
        tags: { fn: "stripe-webhook", op: "webhook_events_insert" },
        extra: { eventId: event.id, eventType: event.type },
      });
      logJson("stripe-webhook", requestId, "ERROR", "webhook_events insert failed", { error: insertErr.message });
      // Continue processing — we'd rather process twice than drop.
    }
  }

  // Skip unhandled event types (still recorded in webhook_events for forensics)
  if (!HANDLED_EVENT_TYPES.has(event.type)) {
    await supabase
      .from("webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("event_id", event.id);
    return new Response(
      JSON.stringify({ received: true, skipped: true, requestId }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        // ── P0 FIX (clone of Rumo Máquinas PR #355 bug) ──
        // OLD code hardcoded status='active' + periodEnd = now+30d.
        // Trial users were flipped to active immediately, breaking 7d/14d trials.
        // NEW: retrieve the actual Subscription and use real status + period_end.
        const session = event.data.object;
        const userId = session.metadata?.user_id;
        const plan = session.metadata?.plan || "pro";

        // ── Security: Validate user_id is UUID format (#7) ──
        if (userId && !UUID_REGEX.test(userId)) {
          logJson("stripe-webhook", requestId, "WARN", "Invalid user_id format in checkout metadata", { userId });
          break;
        }
        if (!userId) {
          logJson("stripe-webhook", requestId, "WARN", "checkout.session.completed missing user_id metadata", { sessionId: session.id });
          break;
        }

        // Subscription-mode checkout only — one-time payments skipped.
        const subscriptionId = session.subscription;
        if (!subscriptionId) {
          logJson("stripe-webhook", requestId, "INFO", "checkout.session.completed not subscription mode — skipping", { sessionId: session.id, mode: session.mode });
          break;
        }

        if (!stripe) {
          await captureError(new Error("STRIPE_SECRET_KEY missing — cannot retrieve subscription"), {
            tags: { fn: "stripe-webhook", op: "checkout_completed" },
            extra: { sessionId: session.id, subscriptionId },
            user_id: userId,
          });
          logJson("stripe-webhook", requestId, "ERROR", "Stripe SDK not initialized (STRIPE_SECRET_KEY missing)");
          // 200 so Stripe doesn't retry indefinitely on a config bug. Subscription
          // will be reconciled by customer.subscription.updated later.
          break;
        }

        let subscription: Stripe.Subscription;
        try {
          subscription = await stripe.subscriptions.retrieve(subscriptionId);
        } catch (retrieveErr) {
          await captureError(retrieveErr, {
            tags: { fn: "stripe-webhook", op: "subscriptions.retrieve" },
            extra: { subscriptionId, sessionId: session.id },
            user_id: userId,
          });
          logJson("stripe-webhook", requestId, "ERROR", "Failed to retrieve subscription from Stripe", { subscriptionId, error: String(retrieveErr) });
          // Re-throw so Stripe retries the webhook.
          throw retrieveErr;
        }

        const realStatus = mapStatus(subscription.status);
        const realPeriodStart = pickPeriodStart(subscription);
        const realPeriodEnd = pickPeriodEnd(subscription);

        const upsertPayload: Record<string, unknown> = {
          user_id: userId,
          plan,
          status: realStatus,
          provider: "stripe",
          stripe_customer_id: typeof session.customer === "string" ? session.customer : (subscription.customer as string),
          stripe_subscription_id: subscriptionId,
          updated_at: new Date().toISOString(),
        };
        if (realPeriodStart) {
          upsertPayload.current_period_start = new Date(realPeriodStart * 1000).toISOString();
        }
        if (realPeriodEnd) {
          upsertPayload.current_period_end = new Date(realPeriodEnd * 1000).toISOString();
        }

        const { error: upsertErr } = await supabase
          .from("subscriptions")
          .upsert(upsertPayload, { onConflict: "user_id" });
        if (upsertErr) {
          await captureError(upsertErr, {
            tags: { fn: "stripe-webhook", op: "subscriptions_upsert", branch: "checkout_completed" },
            extra: { userId, subscriptionId, status: realStatus },
            user_id: userId,
          });
          throw upsertErr;
        }

        logJson("stripe-webhook", requestId, "INFO", "checkout.session.completed processed with real Stripe state", {
          userId,
          subscriptionId,
          status: realStatus,
          periodEnd: realPeriodEnd,
        });
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        const status = mapStatus(subscription.status);

        const updateData: Record<string, unknown> = {
          status,
          updated_at: new Date().toISOString(),
        };
        const periodStart = pickPeriodStart(subscription);
        const periodEnd = pickPeriodEnd(subscription);
        if (periodStart) {
          updateData.current_period_start = new Date(periodStart * 1000).toISOString();
        }
        if (periodEnd) {
          updateData.current_period_end = new Date(periodEnd * 1000).toISOString();
        }

        const { error: updateErr } = await supabase
          .from("subscriptions")
          .update(updateData)
          .eq("stripe_customer_id", customerId);
        if (updateErr) {
          await captureError(updateErr, {
            tags: { fn: "stripe-webhook", op: "subscriptions_update", branch: event.type },
            extra: { customerId, status },
          });
          throw updateErr;
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const { error: delErr } = await supabase
          .from("subscriptions")
          .update({ plan: "free", status: "canceled", updated_at: new Date().toISOString() })
          .eq("stripe_customer_id", subscription.customer);
        if (delErr) {
          await captureError(delErr, {
            tags: { fn: "stripe-webhook", op: "subscriptions_update", branch: "subscription_deleted" },
            extra: { customerId: subscription.customer },
          });
          throw delErr;
        }
        break;
      }

      case "customer.subscription.trial_will_end": {
        // Stripe sends this ~3 days before trial_end. For now we just log + flag.
        // T-3d notification (push/email/WhatsApp) can be wired later.
        const subscription = event.data.object;
        const customerId = subscription.customer;
        logJson("stripe-webhook", requestId, "INFO", "Trial will end soon", {
          customerId,
          trialEnd: subscription.trial_end,
          periodEnd: pickPeriodEnd(subscription),
        });
        // Optional: persist a flag for in-app banner. Non-fatal if column missing.
        const { error: flagErr } = await supabase
          .from("subscriptions")
          .update({
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_customer_id", customerId);
        if (flagErr) {
          // Don't throw — informational event.
          await captureError(flagErr, {
            tags: { fn: "stripe-webhook", op: "trial_will_end_flag" },
            extra: { customerId },
            level: "warning",
          });
        }
        break;
      }

      case "invoice.payment_succeeded": {
        // Renewal event — Stripe sends with the new period already on the
        // invoice line item. We update current_period_end so the app knows
        // the user has paid for the next cycle without waiting for
        // customer.subscription.updated (which may arrive later).
        const invoice = event.data.object;
        const customerId = invoice.customer;
        const lineItem = invoice.lines?.data?.[0];
        const newPeriodEnd = lineItem?.period?.end;
        const newPeriodStart = lineItem?.period?.start;
        const subscriptionId = lineItem?.subscription ?? invoice.subscription;

        const updateData: Record<string, unknown> = {
          status: "active",
          updated_at: new Date().toISOString(),
        };
        if (newPeriodStart) {
          updateData.current_period_start = new Date(newPeriodStart * 1000).toISOString();
        }
        if (newPeriodEnd) {
          updateData.current_period_end = new Date(newPeriodEnd * 1000).toISOString();
        }
        if (subscriptionId && typeof subscriptionId === "string") {
          updateData.stripe_subscription_id = subscriptionId;
        }

        const { error: payErr } = await supabase
          .from("subscriptions")
          .update(updateData)
          .eq("stripe_customer_id", customerId);
        if (payErr) {
          await captureError(payErr, {
            tags: { fn: "stripe-webhook", op: "subscriptions_update", branch: "invoice_payment_succeeded" },
            extra: { customerId, subscriptionId, newPeriodEnd },
          });
          throw payErr;
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const { error: pfErr } = await supabase
          .from("subscriptions")
          .update({ status: "past_due", updated_at: new Date().toISOString() })
          .eq("stripe_customer_id", invoice.customer);
        if (pfErr) {
          await captureError(pfErr, {
            tags: { fn: "stripe-webhook", op: "subscriptions_update", branch: "invoice_payment_failed" },
            extra: { customerId: invoice.customer },
          });
          throw pfErr;
        }
        break;
      }
    }

    // Mark event as fully processed
    await supabase
      .from("webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("event_id", event.id);

    logJson("stripe-webhook", requestId, "INFO", "Event processed", { eventType: event.type, eventId: event.id });

    return new Response(
      JSON.stringify({ received: true, requestId }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    // Sentry capture for any uncaught error inside the switch
    await captureError(error, {
      tags: { fn: "stripe-webhook", op: "handler" },
      extra: { eventId: event.id, eventType: event.type },
    });
    // Never leak internal error details to client
    logJson("stripe-webhook", requestId, "ERROR", "Processing error", { error: String(error) });
    return new Response(
      JSON.stringify({ error: "Internal processing error", requestId }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
