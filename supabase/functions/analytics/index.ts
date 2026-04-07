import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Edge Function: analytics
 *
 * Receives batched analytics events from the client-side analytics service
 * and stores them in the analytics_events table for analysis.
 *
 * SETUP:
 * 1. Create analytics_events table in Supabase (see migration below)
 * 2. Deploy this function: supabase functions deploy analytics
 *
 * Table migration:
 *   CREATE TABLE IF NOT EXISTS analytics_events (
 *     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *     user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
 *     event TEXT NOT NULL,
 *     properties JSONB DEFAULT '{}',
 *     platform TEXT,
 *     timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 *   );
 *
 *   CREATE INDEX idx_analytics_events_user ON analytics_events(user_id);
 *   CREATE INDEX idx_analytics_events_event ON analytics_events(event);
 *   CREATE INDEX idx_analytics_events_timestamp ON analytics_events(timestamp);
 *
 *   ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
 *   CREATE POLICY "Service role can manage analytics"
 *     ON analytics_events FOR ALL
 *     USING (auth.role() = 'service_role');
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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

// Rate limit: max 100 events per request to prevent abuse
const MAX_EVENTS_PER_BATCH = 100;

interface AnalyticsEvent {
  event: string;
  properties?: Record<string, unknown>;
  timestamp: string;
  userId?: string;
  platform: string;
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

  // Optional: authenticate the request to get user context
  let authenticatedUserId: string | null = null;
  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    try {
      const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const {
        data: { user },
      } = await supabaseUser.auth.getUser();
      if (user) authenticatedUserId = user.id;
    } catch {
      // Continue without auth — analytics should not block on auth failures
    }
  }

  let body: { events: AnalyticsEvent[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!Array.isArray(body.events) || body.events.length === 0) {
    return new Response(
      JSON.stringify({ error: "events must be a non-empty array" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Enforce batch size limit
  const events = body.events.slice(0, MAX_EVENTS_PER_BATCH);

  // Use service role to insert into analytics_events (RLS protected)
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Transform events for insertion
  const rows = events.map((e) => ({
    user_id: authenticatedUserId ?? e.userId ?? null,
    event: (e.event ?? "unknown").slice(0, 255),
    properties: e.properties ?? {},
    platform: (e.platform ?? "unknown").slice(0, 50),
    timestamp: e.timestamp || new Date().toISOString(),
  }));

  const { error: insertError } = await supabase
    .from("analytics_events")
    .insert(rows);

  if (insertError) {
    console.error("[analytics] Insert error:", insertError);
    return new Response(
      JSON.stringify({ error: "Failed to store events" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  return new Response(
    JSON.stringify({
      received: true,
      count: rows.length,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
