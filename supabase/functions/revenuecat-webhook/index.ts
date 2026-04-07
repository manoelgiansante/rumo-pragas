import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Edge Function: revenuecat-webhook
 *
 * Handles RevenueCat server-side webhook events for subscription lifecycle.
 * This ensures subscription state is synced even when the app is closed
 * (e.g. renewal, cancellation, billing issues, expiration).
 *
 * SETUP:
 * 1. In RevenueCat Dashboard → Project → Integrations → Webhooks
 * 2. Set URL: https://<project>.supabase.co/functions/v1/revenuecat-webhook
 * 3. Set Authorization header: Bearer <REVENUECAT_WEBHOOK_SECRET>
 * 4. Add REVENUECAT_WEBHOOK_SECRET as a Supabase secret
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const REVENUECAT_WEBHOOK_SECRET =
  Deno.env.get("REVENUECAT_WEBHOOK_SECRET") ?? "";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "*").split(",");

function getCorsHeaders(req?: Request) {
  const origin = req?.headers.get("origin") ?? "";
  const allowedOrigin = ALLOWED_ORIGINS.includes("*")
    ? "*"
    : ALLOWED_ORIGINS.includes(origin)
      ? origin
      : (ALLOWED_ORIGINS[0] ?? "");

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
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

/**
 * Derive plan from entitlement_ids or product_id.
 * Adjust these mappings to match your RevenueCat configuration.
 */
function derivePlan(event: RevenueCatEvent): string {
  const entitlements = event.entitlement_ids ?? [];

  if (entitlements.includes("enterprise")) return "enterprise";
  if (entitlements.includes("pro")) return "pro";

  // Fallback: check product_id patterns
  const productId = (event.product_id ?? "").toLowerCase();
  if (productId.includes("enterprise")) return "enterprise";
  if (productId.includes("pro")) return "pro";

  return "free";
}

/**
 * Derive subscription status from event type.
 */
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

/**
 * Map RevenueCat store to provider string.
 */
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

// Simple in-memory idempotency (prevents duplicate processing on retries)
const processedEvents = new Map<string, number>();
const MAX_EVENTS = 500;
const EVENT_TTL_MS = 15 * 60 * 1000; // 15 minutes

function deduplicateEvent(eventKey: string): boolean {
  // Cleanup old entries
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

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verify webhook authorization
  if (REVENUECAT_WEBHOOK_SECRET) {
    const authHeader = req.headers.get("Authorization") ?? "";
    const expected = `Bearer ${REVENUECAT_WEBHOOK_SECRET}`;
    if (authHeader !== expected) {
      console.error("[revenuecat-webhook] Invalid authorization");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  let payload: RevenueCatWebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const event = payload.event;
  if (!event || !event.type || !event.app_user_id) {
    return new Response(
      JSON.stringify({ error: "Missing event data" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Idempotency check
  const eventKey = `${event.app_user_id}_${event.type}_${event.purchased_at_ms}`;
  if (deduplicateEvent(eventKey)) {
    return new Response(
      JSON.stringify({ received: true, deduplicated: true }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Skip non-subscription events (e.g. SUBSCRIBER_ALIAS, TRANSFER)
  const subscriptionEvents: RevenueCatEventType[] = [
    "INITIAL_PURCHASE",
    "RENEWAL",
    "PRODUCT_CHANGE",
    "CANCELLATION",
    "UNCANCELLATION",
    "BILLING_ISSUE",
    "SUBSCRIPTION_PAUSED",
    "EXPIRATION",
    "NON_RENEWING_PURCHASE",
  ];

  if (!subscriptionEvents.includes(event.type)) {
    console.log(
      `[revenuecat-webhook] Skipping event type: ${event.type}`,
    );
    return new Response(
      JSON.stringify({ received: true, skipped: true }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

    // Upsert subscription record
    const { error: upsertError } = await supabase
      .from("subscriptions")
      .upsert(
        {
          user_id: userId,
          plan,
          status,
          provider,
          period_start: periodStart,
          period_end: periodEnd,
          updated_at: new Date().toISOString(),
          revenuecat_product_id: event.product_id,
          revenuecat_environment: event.environment,
        },
        { onConflict: "user_id" },
      );

    if (upsertError) {
      console.error(
        `[revenuecat-webhook] Failed to upsert subscription for ${userId}:`,
        upsertError,
      );
      return new Response(
        JSON.stringify({ error: "Failed to update subscription" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(
      `[revenuecat-webhook] ${event.type} for ${userId}: plan=${plan}, status=${status}, provider=${provider}`,
    );

    return new Response(
      JSON.stringify({
        received: true,
        processed: true,
        userId,
        plan,
        status,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("[revenuecat-webhook] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
