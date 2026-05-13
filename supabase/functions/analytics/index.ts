import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { captureError, withSentry } from "../_shared/sentry.ts";

/**
 * Edge Function: analytics
 *
 * Receives batched analytics events from the client-side analytics service
 * and stores them in the analytics_events table for analysis.
 *
 * SECURITY: Requires authentication. No unauthenticated writes.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// ── Security: CORS — whitelist fallback instead of wildcard ──
const DEFAULT_ALLOWED = [
  "https://pragas.agrorumo.com",
  "https://rumopragas.com.br",
  "https://rumo-pragas.vercel.app",
  "exp://localhost:19000",
  "exp://localhost:8081",
  "http://localhost:19006",
  "http://localhost:8081",
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
  if (level === "ERROR" || level === "FATAL") {
    console.error(entry);
  } else {
    console.log(entry);
  }
}

// Rate limit: max 100 events per request to prevent abuse
const MAX_EVENTS_PER_BATCH = 100;

// ── Security: Input validation ──
const VALID_EVENT_NAME = /^[a-zA-Z0-9_.\-:]{1,255}$/;
const VALID_PLATFORM = /^[a-zA-Z0-9_.\-]{1,50}$/;
const MAX_PROPERTIES_SIZE = 10_000; // 10KB max for properties JSON

// ── ISO 8601 date regex for timestamp validation (#6) ──
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

interface AnalyticsEvent {
  event: string;
  properties?: Record<string, unknown>;
  timestamp: string;
  userId?: string;
  platform: string;
}

function validateEvent(e: unknown): e is AnalyticsEvent {
  if (typeof e !== "object" || e === null) return false;
  const ev = e as Record<string, unknown>;
  if (typeof ev.event !== "string" || !ev.event) return false;
  // (#6) platform must be a non-empty string
  if (typeof ev.platform !== "string" || ev.platform.length === 0) return false;
  if (ev.properties !== undefined && typeof ev.properties !== "object") return false;
  // (#6) If timestamp is present, it must be a valid ISO string
  if (ev.timestamp !== undefined && ev.timestamp !== null) {
    if (typeof ev.timestamp !== "string") return false;
    if (!ISO_DATE_REGEX.test(ev.timestamp) || isNaN(Date.parse(ev.timestamp))) return false;
  }
  return true;
}

function sanitizeEvent(e: AnalyticsEvent): {
  event: string;
  properties: Record<string, unknown>;
  platform: string;
  timestamp: string;
} {
  const event = VALID_EVENT_NAME.test(e.event)
    ? e.event
    : e.event.replace(/[^a-zA-Z0-9_.\-:]/g, "").slice(0, 255) || "unknown";
  const platform = VALID_PLATFORM.test(e.platform)
    ? e.platform
    : e.platform.replace(/[^a-zA-Z0-9_.\-]/g, "").slice(0, 50) || "unknown";

  // Limit properties size to prevent abuse
  let properties = e.properties ?? {};
  const propsStr = JSON.stringify(properties);
  if (propsStr.length > MAX_PROPERTIES_SIZE) {
    properties = { _truncated: true };
  }

  // Validate timestamp is a valid ISO date
  let timestamp = e.timestamp;
  if (!timestamp || isNaN(Date.parse(timestamp))) {
    timestamp = new Date().toISOString();
  }

  return { event, properties, platform, timestamp };
}

// ── Rate limiting: per-user in-memory ──
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30; // 30 batch requests per minute per user

function checkRateLimit(userId: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    const resetAt = now + RATE_LIMIT_WINDOW_MS;
    rateLimitMap.set(userId, { count: 1, resetAt });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetAt };
  }
  entry.count++;
  return {
    allowed: entry.count <= RATE_LIMIT_MAX,
    remaining: Math.max(0, RATE_LIMIT_MAX - entry.count),
    resetAt: entry.resetAt,
  };
}

// ── Rate limit headers helper (#3) ──
function rateLimitHeaders(remaining: number, resetAt: number): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(RATE_LIMIT_MAX),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
  };
}

Deno.serve(withSentry(async (req: Request) => {
  const requestId = generateRequestId();
  const corsHeaders = getCorsHeaders(req);

  // ── Structured request metadata logging (#10) ──
  logJson("analytics", requestId, "INFO", "Request received", {
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

  // ── P1 #5: Require authentication — MANDATORY ──
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: "Authorization required", requestId }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  let authenticatedUserId: string | null = null;
  try {
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await supabaseUser.auth.getUser();
    if (user) {
      authenticatedUserId = user.id;
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid token", requestId }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  } catch {
    return new Response(
      JSON.stringify({ error: "Authentication failed", requestId }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // ── Rate limiting with headers (#3) ──
  const rl = checkRateLimit(authenticatedUserId);
  const rlHeaders = rateLimitHeaders(rl.remaining, rl.resetAt);

  if (!rl.allowed) {
    return new Response(
      JSON.stringify({ error: "Too many requests", requestId }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          ...rlHeaders,
          "Content-Type": "application/json",
          "Retry-After": "60",
        },
      },
    );
  }

  // ── Validate request body ──
  let body: { events: unknown[] };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON", requestId }),
      {
        status: 400,
        headers: { ...corsHeaders, ...rlHeaders, "Content-Type": "application/json" },
      },
    );
  }

  if (!Array.isArray(body.events) || body.events.length === 0) {
    return new Response(
      JSON.stringify({ error: "events must be a non-empty array", requestId }),
      {
        status: 400,
        headers: { ...corsHeaders, ...rlHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Enforce batch size limit and validate each event
  const validEvents = body.events
    .slice(0, MAX_EVENTS_PER_BATCH)
    .filter(validateEvent);

  if (validEvents.length === 0) {
    return new Response(
      JSON.stringify({ error: "No valid events in batch", requestId }),
      {
        status: 400,
        headers: { ...corsHeaders, ...rlHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Use service role to insert (RLS protected table)
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Transform and sanitize events for insertion
  const rows = validEvents.map((e) => {
    const sanitized = sanitizeEvent(e);
    return {
      user_id: authenticatedUserId,
      event: sanitized.event,
      properties: sanitized.properties,
      platform: sanitized.platform,
      timestamp: sanitized.timestamp,
    };
  });

  const { error: insertError } = await supabase
    .from("analytics_events")
    .insert(rows);

  if (insertError) {
    await captureError(insertError, {
      tags: { fn: "analytics", op: "events_insert" },
      extra: { count: rows.length },
      user_id: authenticatedUserId,
    });
    logJson("analytics", requestId, "ERROR", "Insert error", { error: insertError.message });
    return new Response(
      JSON.stringify({ error: "Failed to store events", requestId }),
      {
        status: 500,
        headers: { ...corsHeaders, ...rlHeaders, "Content-Type": "application/json" },
      },
    );
  }

  return new Response(
    JSON.stringify({ received: true, count: rows.length, requestId }),
    {
      status: 200,
      headers: { ...corsHeaders, ...rlHeaders, "Content-Type": "application/json" },
    },
  );
}, "analytics"));
