import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://pragas.agrorumo.com",
  "https://rumopragas.com.br",
  "https://rumo-pragas.vercel.app",
  "exp://localhost:19000",
  "exp://localhost:8081",
  "http://localhost:19006",
  "http://localhost:8081",
];

const allowedOrigins = (() => {
  const configured = Deno.env.get("PRAGAS_ALLOWED_ORIGINS")?.trim();
  return configured
    ? configured.split(",").map((origin) => origin.trim()).filter(Boolean)
    : DEFAULT_ALLOWED_ORIGINS;
})();

export function getPragasCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin) ? origin : "",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, idempotency-key, " +
      "x-pragas-ai-consent-version, x-pragas-ai-consent-purpose, x-rumo-app",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export function jsonResponse(
  body: Record<string, unknown>,
  options: { status?: number; headers?: Record<string, string>; requestId: string },
): Response {
  return new Response(JSON.stringify({ ...body, requestId: options.requestId }), {
    status: options.status ?? 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Request-Id": options.requestId,
      ...options.headers,
    },
  });
}

export function createPragasAdminClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("supabase_admin_not_configured");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function authenticatePragasRequest(
  req: Request,
  admin: SupabaseClient,
): Promise<User | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;
  const { data: { user }, error } = await admin.auth.getUser(token);
  return error || !user ? null : user;
}

export type PragasAppAccessState =
  | { state: "active" }
  | { state: "unlinked" }
  | { state: "deletion_pending" }
  | { state: "deleted_reactivation_required"; completedAt: string }
  | { state: "unavailable" };

export function classifyPragasAppAccess(
  deletion: { status: string; app_cleanup_completed_at?: unknown } | null,
  hasActiveAppLink: boolean,
  hasProfile: boolean,
  hasActiveAppSubscription: boolean,
): Exclude<PragasAppAccessState, { state: "unavailable" }> {
  if (
    deletion?.status === "blocked_global_decision" && deletion.app_cleanup_completed_at
  ) {
    return {
      state: "deleted_reactivation_required",
      completedAt: String(deletion.app_cleanup_completed_at),
    };
  }
  if (deletion && deletion.status !== "reactivated") return { state: "deletion_pending" };
  return hasActiveAppLink && hasProfile && hasActiveAppSubscription
    ? { state: "active" }
    : { state: "unlinked" };
}

export async function getPragasAppAccessState(
  admin: SupabaseClient,
  userId: string,
): Promise<PragasAppAccessState> {
  const { data, error } = await admin
    .from("pragas_deletion_jobs")
    .select("status,app_cleanup_completed_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { state: "unavailable" };
  const terminalState = classifyPragasAppAccess(data, false, false, false);
  if (
    terminalState.state === "deleted_reactivation_required" ||
    terminalState.state === "deletion_pending"
  ) return terminalState;

  const [linkResult, profileResult, subscriptionResult] = await Promise.all([
    admin
      .from("pragas_app_links")
      .select("user_id")
      .eq("user_id", userId)
      .eq("active", true)
      .maybeSingle(),
    admin
      .from("pragas_profiles")
      .select("id,user_id")
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("subscriptions")
      .select("user_id")
      .eq("user_id", userId)
      .eq("app", "rumo-pragas")
      .eq("status", "active")
      .maybeSingle(),
  ]);
  if (linkResult.error || profileResult.error || subscriptionResult.error) {
    return { state: "unavailable" };
  }
  return classifyPragasAppAccess(
    data,
    Boolean(linkResult.data),
    Boolean(profileResult.data),
    Boolean(subscriptionResult.data),
  );
}
