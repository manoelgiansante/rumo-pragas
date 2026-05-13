import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { captureError } from "../_shared/sentry.ts";

/**
 * Edge Function: process-deletions
 *
 * Processes account deletion requests that are older than 15 days
 * (LGPD compliance). Can be triggered via:
 * - Supabase cron (pg_cron extension)
 * - Manual invocation with service_role key
 *
 * Actions performed per user:
 * 1. Delete all diagnoses from pragas_diagnoses
 * 2. Delete subscription record from subscriptions
 * 3. Delete profile from pragas_profiles
 * 4. Delete auth user via admin API
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// LGPD: process deletions after 15 days
const DELETION_GRACE_PERIOD_DAYS = 15;

// ── Security: CORS — whitelist fallback (internal cron/service-role only) ──
const DEFAULT_ALLOWED = [
  "https://pragas.agrorumo.com",
  "https://rumopragas.com.br",
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

Deno.serve(async (req: Request) => {
  const requestId = generateRequestId();
  const corsHeaders = getCorsHeaders(req);

  // ── Structured request metadata logging (#10) ──
  logJson("process-deletions", requestId, "INFO", "Request received", {
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

  // Only allow POST with service_role authorization
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed", requestId }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const authHeader = req.headers.get("Authorization");

  // ── Security: Constant-time comparison for service role key ──
  const expected = `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
  if (
    !authHeader ||
    authHeader.length !== expected.length ||
    !timingSafeEqual(authHeader, expected)
  ) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", requestId }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Find profiles with deletion_requested_at older than grace period
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - DELETION_GRACE_PERIOD_DAYS);

    const { data: profilesForDeletion, error: fetchError } = await supabase
      .from("pragas_profiles")
      .select("id, full_name, deletion_requested_at")
      .not("deletion_requested_at", "is", null)
      .lte("deletion_requested_at", cutoffDate.toISOString());

    if (fetchError) {
      logJson("process-deletions", requestId, "ERROR", "Fetch error", { error: fetchError.message });
      return new Response(
        JSON.stringify({ error: "Failed to fetch deletion requests", requestId }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!profilesForDeletion || profilesForDeletion.length === 0) {
      return new Response(
        JSON.stringify({ message: "No pending deletions", processed: 0, requestId }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const results: { success: boolean; error?: string }[] = [];

    for (const profile of profilesForDeletion) {
      try {
        const userId = profile.id;

        // 1. Delete all diagnoses
        const { error: diagError } = await supabase
          .from("pragas_diagnoses")
          .delete()
          .eq("user_id", userId);

        if (diagError)
          logJson("process-deletions", requestId, "ERROR", "Diag delete error", { error: diagError.message });

        // 2. Delete subscription
        const { error: subError } = await supabase
          .from("subscriptions")
          .delete()
          .eq("user_id", userId);

        if (subError)
          logJson("process-deletions", requestId, "ERROR", "Sub delete error", { error: subError.message });

        // 3. Delete profile
        const { error: profileError } = await supabase
          .from("pragas_profiles")
          .delete()
          .eq("id", userId);

        if (profileError)
          logJson("process-deletions", requestId, "ERROR", "Profile delete error", { error: profileError.message });

        // 4. Delete auth user
        const { error: authError } =
          await supabase.auth.admin.deleteUser(userId);

        if (authError) {
          logJson("process-deletions", requestId, "ERROR", "Auth delete error", { error: authError.message });
          // (#11) LGPD: Do not log userId in success path — only log that deletion completed
          results.push({ success: false, error: authError.message });
        } else {
          // (#11) LGPD compliance: Do not log userId — just log that the deletion completed
          logJson("process-deletions", requestId, "INFO", "User deletion completed");
          results.push({ success: true });
        }
      } catch (err) {
        await captureError(err, { tags: { fn: "process-deletions", op: "per_user" } });
        logJson("process-deletions", requestId, "ERROR", "Processing error for user", { error: String(err) });
        results.push({
          success: false,
          error: "Processing error",
        });
      }
    }

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return new Response(
      JSON.stringify({
        message: `Processed ${results.length} deletion requests`,
        processed: results.length,
        successful,
        failed,
        // (#11) LGPD: results array no longer contains userId
        results,
        requestId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    await captureError(err, { tags: { fn: "process-deletions", op: "handler" } });
    logJson("process-deletions", requestId, "ERROR", "Unexpected error", { error: String(err) });
    return new Response(
      JSON.stringify({ error: "Internal server error", requestId }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

// ── Security: Constant-time string comparison ──
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
