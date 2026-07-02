import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { captureException, captureMessage, withSentry } from "../_shared/sentry.ts";

/**
 * Edge Function: process-deletions
 *
 * Processes account deletion requests that are older than 15 days
 * (LGPD compliance). Can be triggered via:
 * - Supabase cron (pg_cron extension)
 * - Manual invocation with service_role key
 *
 * Actions performed per user (mirrors delete-user-account, ff46713):
 * 1. Cancel RevenueCat subscriber (best-effort)
 * 2. Delete storage files under `${userId}/` (diagnoses, avatars)
 * 3. Delete from user-scoped tables (children before parents), with app-scope
 *    on SHARED jxcn tables (subscriptions, chat_usage)
 * 4. Delete profile from pragas_profiles
 * 5. Delete auth user via admin API
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const REVENUECAT_SECRET_KEY = Deno.env.get("REVENUECAT_SECRET_KEY") ?? "";

// App discriminator for tables SHARED across AgroRumo apps in the jxcn project.
// Pairs with migration 20260628120000_subscriptions_per_app_isolation.sql.
const APP_KEY = Deno.env.get("APP_KEY") ?? "rumo-pragas";

// LGPD: process deletions after 15 days
const DELETION_GRACE_PERIOD_DAYS = 15;

// Tables that have a user_id column belonging to the deleted user.
// Order matters — children before parents to respect FK constraints.
//
// `appScoped: true` → the table is SHARED across AgroRumo apps in the jxcn
// project and carries an `app` discriminator column. We MUST additionally
// filter by APP_KEY so a Pragas deletion does not wipe the SAME user's rows in
// sibling apps (Vet/Finance/…). Without the filter, `subscriptions`/`chat_usage`
// would be deleted for every app the user had — cross-app data loss.
//
// NOTE — intentionally NOT listed:
//  • pragas_push_notifications → system-wide broadcast audit log (no user_id
//    column, not personal data); deleting it by user_id would error.
const USER_SCOPED_TABLES: { name: string; appScoped?: boolean }[] = [
  { name: "pragas_diagnoses" },
  // Per-device Expo push token audit table (user_id + expo_token + device
  // fingerprint). expo_token is a personal identifier tied to the device, so
  // LGPD erasure MUST purge it. Idempotent / fail-safe — a stale token row must
  // never survive an account deletion.
  { name: "pragas_push_tokens" },
  // per-(user, app, month) ai-chat counter — explicit LGPD erasure.
  { name: "chat_usage", appScoped: true },
  { name: "analytics_events" },
  { name: "audit_log" },
  { name: "user_preferences" },
  { name: "subscriptions", appScoped: true },
];

// Storage buckets that may contain user files under a `${userId}/` prefix.
const STORAGE_BUCKETS = ["diagnoses", "avatars"];

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

async function cancelRevenueCatSubscription(
  userId: string,
  requestId: string,
): Promise<void> {
  if (!REVENUECAT_SECRET_KEY) {
    logJson(
      "process-deletions",
      requestId,
      "WARN",
      "REVENUECAT_SECRET_KEY not set, skipping RC cancellation",
    );
    return;
  }

  try {
    // RevenueCat v1 API — delete subscriber (cancels entitlements)
    // https://www.revenuecat.com/reference/subscribers
    const res = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${REVENUECAT_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!res.ok && res.status !== 404) {
      const text = await res.text();
      logJson("process-deletions", requestId, "WARN", "RevenueCat DELETE non-ok", {
        status: res.status,
        body: text.slice(0, 200),
      });
    } else {
      logJson("process-deletions", requestId, "INFO", "RevenueCat subscriber deleted");
    }
  } catch (err) {
    logJson("process-deletions", requestId, "WARN", "RevenueCat DELETE failed", {
      error: String(err),
    });
  }
}

async function deleteUserStorage(
  admin: SupabaseClient,
  userId: string,
  requestId: string,
): Promise<void> {
  for (const bucket of STORAGE_BUCKETS) {
    try {
      // List everything under `${userId}/`
      const { data: files, error: listError } = await admin.storage
        .from(bucket)
        .list(userId, { limit: 1000 });

      if (listError) {
        logJson("process-deletions", requestId, "WARN", "Storage list error", {
          bucket,
          error: listError.message,
        });
        continue;
      }

      if (!files || files.length === 0) continue;

      const paths = files.map((f) => `${userId}/${f.name}`);
      const { error: removeError } = await admin.storage
        .from(bucket)
        .remove(paths);

      if (removeError) {
        logJson("process-deletions", requestId, "WARN", "Storage remove error", {
          bucket,
          error: removeError.message,
        });
      }
    } catch (err) {
      logJson("process-deletions", requestId, "WARN", "Storage cleanup exception", {
        bucket,
        error: String(err),
      });
    }
  }
}

Deno.serve(withSentry("process-deletions", async (req: Request) => {
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

  // ── Security: authorize the cron caller ──
  // Fast-path: exact constant-time match against the injected service role key.
  const expected = `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
  const fastPathOk = !!authHeader &&
    authHeader.length === expected.length &&
    timingSafeEqual(authHeader, expected);

  // Fallback: validate the JWT CLAIM instead of the exact string. Key-format
  // drift (new sb_secret_* vs the legacy JWT the cron sends) makes the string
  // compare fail. The Supabase gateway (verify_jwt) already verified the
  // signature before we run, so the claim-check survives credential rotation by
  // trusting the token's role/issuer rather than the exact key bytes.
  let claimOk = false;
  if (!fastPathOk && authHeader && authHeader.startsWith("Bearer ")) {
    try {
      const token = authHeader.slice("Bearer ".length);
      let payloadSeg = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      while (payloadSeg.length % 4 !== 0) payloadSeg += "=";
      const payload = JSON.parse(atob(payloadSeg));
      claimOk = payload.role === "service_role" &&
        String(payload.iss).includes("supabase");
    } catch {
      claimOk = false;
    }
  }

  if (!fastPathOk && !claimOk) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", requestId }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

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

    const results: { success: boolean; error?: string; partialErrors?: number }[] = [];

    for (const profile of profilesForDeletion) {
      try {
        const userId = profile.id;
        const partialErrors: string[] = [];

        // 1. Cancel RevenueCat subscriber (best-effort — mirrors delete-user-account)
        await cancelRevenueCatSubscription(userId, requestId);

        // 2. Delete storage files under `${userId}/` (best-effort)
        await deleteUserStorage(supabase, userId, requestId);

        // 3. Delete from user-scoped tables (children → parents; app-scope shared)
        for (const { name: table, appScoped } of USER_SCOPED_TABLES) {
          const query = supabase.from(table).delete().eq("user_id", userId);
          // App-scoped shared tables: only remove THIS app's rows (see APP_KEY note).
          // CRITICAL: without .eq("app", APP_KEY) a Pragas deletion would wipe the
          // SAME user's subscriptions/chat_usage in sibling apps on the jxcn project.
          const { error } = appScoped
            ? await query.eq("app", APP_KEY)
            : await query;
          if (error) {
            logJson("process-deletions", requestId, "WARN", "Table delete error", {
              table,
              error: error.message,
            });
            partialErrors.push(`${table}: ${error.message}`);
          }
        }

        // 4. Delete profile (id = auth.users.id)
        const { error: profileError } = await supabase
          .from("pragas_profiles")
          .delete()
          .eq("id", userId);

        if (profileError) {
          logJson("process-deletions", requestId, "WARN", "Profile delete error", { error: profileError.message });
          partialErrors.push(`pragas_profiles: ${profileError.message}`);
        }

        // 5. Delete auth user (point of no return)
        const { error: authError } =
          await supabase.auth.admin.deleteUser(userId);

        if (authError) {
          logJson("process-deletions", requestId, "ERROR", "Auth delete error", { error: authError.message });
          // A failed purge is a compliance risk — make it Sentry-visible.
          // (#11) LGPD: no userId in tags/extra.
          await captureException(new Error(authError.message), {
            tags: { fn: "process-deletions", step: "auth_delete" },
          });
          // (#11) LGPD: Do not log userId — only that the deletion completed
          results.push({ success: false, error: authError.message, partialErrors: partialErrors.length });
        } else {
          // (#11) LGPD compliance: Do not log userId — just that the deletion completed
          logJson("process-deletions", requestId, "INFO", "User deletion completed", {
            partialErrors: partialErrors.length,
          });
          // ── ZERO-O: auth-deleted but one or more tables/storage failed to purge —
          // an LGPD partial erasure the HTTP 200 would otherwise hide. Surface it.
          // partialErrors carries only table names + DB messages, no personal data.
          if (partialErrors.length > 0) {
            await captureMessage(
              `process-deletions: ${partialErrors.length} partial deletion error(s) for a purged account`,
              {
                level: "warning",
                tags: { fn: "process-deletions" },
                extra: { errorCount: partialErrors.length, errors: partialErrors },
              },
            );
          }
          results.push({ success: true, partialErrors: partialErrors.length });
        }
      } catch (err) {
        logJson("process-deletions", requestId, "ERROR", "Processing error for user", { error: String(err) });
        await captureException(err, {
          tags: { fn: "process-deletions", step: "process_user" },
        });
        results.push({
          success: false,
          error: "Processing error",
        });
      }
    }

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    // ── Run summary (ZERO-O): a silently partial-purging compliance cron is a
    // legal risk. Surface any failure count to Sentry as a warning so a stuck
    // deletion queue is observable without reading logs.
    if (failed > 0) {
      await captureMessage(
        `process-deletions: ${failed}/${results.length} account deletions FAILED`,
        {
          level: "warning",
          tags: { fn: "process-deletions" },
          extra: { processed: results.length, successful, failed },
        },
      );
    }

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
    logJson("process-deletions", requestId, "ERROR", "Unexpected error", { error: String(err) });
    await captureException(err, {
      tags: { fn: "process-deletions", step: "unhandled" },
      extra: { requestId },
    });
    return new Response(
      JSON.stringify({ error: "Internal server error", requestId }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
}));

// ── Security: Constant-time string comparison ──
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
