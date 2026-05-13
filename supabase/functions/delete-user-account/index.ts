import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { captureError } from "../_shared/sentry.ts";

/**
 * Edge Function: delete-user-account
 *
 * LGPD Art. 18, V — Imediate right to deletion.
 * Apple App Store Guideline 5.1.1(v) — Account deletion must be in-app.
 *
 * Called by the authenticated user from inside the app.
 * Verifies the caller's JWT, then immediately and permanently deletes
 * ALL user data across all tables, storage, and auth.
 *
 * Auth: Authorization: Bearer <user_access_token>
 * Method: POST
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const REVENUECAT_SECRET_KEY = Deno.env.get("REVENUECAT_SECRET_KEY") ?? "";

// Tables that have a user_id column belonging to the calling user.
// Order matters — children before parents to respect FK constraints.
const USER_SCOPED_TABLES = [
  "pragas_diagnoses",
  "analytics_events",
  "audit_log",
  "user_preferences",
  "subscriptions",
];

// Storage buckets that may contain user files under a `${userId}/` prefix.
const STORAGE_BUCKETS = ["diagnoses", "avatars"];

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

function generateRequestId(): string {
  return crypto.randomUUID();
}

function logJson(
  fn: string,
  requestId: string,
  level: string,
  message: string,
  context?: Record<string, unknown>,
) {
  const entry = JSON.stringify({
    function: fn,
    requestId,
    level,
    message,
    ts: new Date().toISOString(),
    ...context,
  });
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
      "delete-user-account",
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
      logJson(
        "delete-user-account",
        requestId,
        "WARN",
        "RevenueCat DELETE non-ok",
        { status: res.status, body: text.slice(0, 200) },
      );
    } else {
      logJson(
        "delete-user-account",
        requestId,
        "INFO",
        "RevenueCat subscriber deleted",
      );
    }
  } catch (err) {
    logJson(
      "delete-user-account",
      requestId,
      "WARN",
      "RevenueCat DELETE failed",
      { error: String(err) },
    );
  }
}

async function deleteUserStorage(
  admin: ReturnType<typeof createClient>,
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
        logJson(
          "delete-user-account",
          requestId,
          "WARN",
          "Storage list error",
          { bucket, error: listError.message },
        );
        continue;
      }

      if (!files || files.length === 0) continue;

      const paths = files.map((f) => `${userId}/${f.name}`);
      const { error: removeError } = await admin.storage
        .from(bucket)
        .remove(paths);

      if (removeError) {
        logJson(
          "delete-user-account",
          requestId,
          "WARN",
          "Storage remove error",
          { bucket, error: removeError.message },
        );
      }
    } catch (err) {
      logJson(
        "delete-user-account",
        requestId,
        "WARN",
        "Storage cleanup exception",
        { bucket, error: String(err) },
      );
    }
  }
}

Deno.serve(async (req: Request) => {
  const requestId = generateRequestId();
  const corsHeaders = getCorsHeaders(req);

  logJson("delete-user-account", requestId, "INFO", "Request received", {
    method: req.method,
    origin: req.headers.get("origin") ?? "none",
  });

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        ...corsHeaders,
        "Access-Control-Max-Age": "86400",
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

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Missing authorization", requestId }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // ── Step 1: Verify the caller's JWT and identify the user ──
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    logJson("delete-user-account", requestId, "WARN", "Invalid JWT", {
      error: userError?.message,
    });
    return new Response(
      JSON.stringify({ error: "Invalid or expired session", requestId }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const userId = user.id;

  // ── Step 2: Service-role client for admin operations ──
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const errors: string[] = [];

  try {
    // ── Step 3: Cancel RevenueCat subscription (best-effort) ──
    await cancelRevenueCatSubscription(userId, requestId);

    // ── Step 4: Delete storage files (best-effort) ──
    await deleteUserStorage(admin, userId, requestId);

    // ── Step 5: Delete from user-scoped tables ──
    for (const table of USER_SCOPED_TABLES) {
      const { error } = await admin.from(table).delete().eq("user_id", userId);
      if (error) {
        logJson("delete-user-account", requestId, "WARN", "Table delete error", {
          table,
          error: error.message,
        });
        errors.push(`${table}: ${error.message}`);
      }
    }

    // ── Step 6: Delete profile (id = auth.users.id) ──
    const { error: profileError } = await admin
      .from("pragas_profiles")
      .delete()
      .eq("id", userId);

    if (profileError) {
      logJson(
        "delete-user-account",
        requestId,
        "WARN",
        "Profile delete error",
        { error: profileError.message },
      );
      errors.push(`pragas_profiles: ${profileError.message}`);
    }

    // ── Step 7: Delete auth user (this is the point of no return) ──
    const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);

    if (authDeleteError) {
      logJson(
        "delete-user-account",
        requestId,
        "ERROR",
        "Auth delete error",
        { error: authDeleteError.message },
      );
      return new Response(
        JSON.stringify({
          error: "Failed to delete auth user",
          details: authDeleteError.message,
          requestId,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    logJson(
      "delete-user-account",
      requestId,
      "INFO",
      "Account deletion completed",
      { partialErrors: errors.length },
    );

    return new Response(
      JSON.stringify({
        ok: true,
        message: "Account deleted",
        partialErrors: errors.length > 0 ? errors : undefined,
        requestId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    await captureError(err, { tags: { fn: "delete-user-account", op: "handler" } });
    logJson("delete-user-account", requestId, "ERROR", "Unexpected error", {
      error: String(err),
    });
    return new Response(
      JSON.stringify({ error: "Internal server error", requestId }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
