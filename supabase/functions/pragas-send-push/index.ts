/**
 * Dedicated, server-to-server Rumo Pragas push fan-out.
 *
 * Only explicit user lists and two truthful categories are accepted. There is
 * no state/broadcast/marketing/news path until a real audited pipeline exists.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sha256Hex } from "../_shared/ai-idempotency.ts";
import { type ExpoTicket, parseExpoTickets } from "../_shared/expo-push-ticket.ts";
import { fetchWithTimeout } from "../_shared/fetch-timeout.ts";
import { authenticateServiceBearer } from "../_shared/service-auth.ts";
import { captureException, withSentry } from "../_shared/pragas-sentry.ts";
import { resolveEligibleTargetUserIds } from "./eligibility.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const EXPO_ACCESS_TOKEN = Deno.env.get("EXPO_ACCESS_TOKEN") ?? "";
const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH_SIZE = 100;
const MAX_TARGET_USERS = 500;
const MAX_BODY_BYTES = 64 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_CATEGORIES = new Set(["transactional", "climate_risk_educational"]);
const VALID_SCREENS = new Set(["diagnosis", "settings", "history", "home"]);
const VALID_RISK_TYPES = new Set(["rainfall", "temperature", "humidity", "drought", "frost"]);
const ALLOWED_BODY_KEYS = new Set([
  "notification_id",
  "category",
  "title",
  "body",
  "data",
  "target_user_ids",
]);
const ALLOWED_DATA_KEYS = new Set(["screen", "diagnosisId", "riskType"]);

interface ValidRequest {
  notificationId: string;
  category: "transactional" | "climate_risk_educational";
  title: string;
  body: string;
  data: Record<string, string>;
  targetUserIds: string[];
}

interface PushToken {
  user_id: string;
  expo_token: string;
  platform: "ios" | "android";
}

type ExpoBatchResult =
  | { state: "tickets"; tickets: ExpoTicket[] }
  | { state: "unknown_outcome" };

class PushInputError extends Error {
  constructor(readonly code: string, readonly status = 400) {
    super(code);
    this.name = "PushInputError";
  }
}

function jsonResponse(body: Record<string, unknown>, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(init.headers ?? {}),
    },
  });
}

async function readBoundedJSON(req: Request): Promise<unknown> {
  const declared = Number(req.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new PushInputError("payload_too_large", 413);
  }
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength > MAX_BODY_BYTES) throw new PushInputError("payload_too_large", 413);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new PushInputError("invalid_json");
  }
}

function validateText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  for (const character of trimmed) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 31 || codePoint === 127) return null;
  }
  return trimmed;
}

function parseRequest(value: unknown): ValidRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new PushInputError("invalid_body");
  }
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !ALLOWED_BODY_KEYS.has(key))) {
    throw new PushInputError("invalid_body_schema");
  }
  if (typeof body.notification_id !== "string" || !UUID_PATTERN.test(body.notification_id)) {
    throw new PushInputError("invalid_notification_id");
  }
  if (typeof body.category !== "string" || !VALID_CATEGORIES.has(body.category)) {
    throw new PushInputError("invalid_category");
  }
  const title = validateText(body.title, 100);
  const message = validateText(body.body, 240);
  if (!title) throw new PushInputError("invalid_title");
  if (!message) throw new PushInputError("invalid_body_text");
  if (
    !Array.isArray(body.target_user_ids) || body.target_user_ids.length < 1 ||
    body.target_user_ids.length > MAX_TARGET_USERS ||
    body.target_user_ids.some((id) => typeof id !== "string" || !UUID_PATTERN.test(id))
  ) {
    throw new PushInputError("invalid_target_user_ids");
  }
  const targetUserIds = [...new Set(body.target_user_ids.map((id) => String(id).toLowerCase()))];

  const data: Record<string, string> = {};
  if (body.data !== undefined) {
    if (typeof body.data !== "object" || body.data === null || Array.isArray(body.data)) {
      throw new PushInputError("invalid_data");
    }
    const raw = body.data as Record<string, unknown>;
    if (Object.keys(raw).some((key) => !ALLOWED_DATA_KEYS.has(key))) {
      throw new PushInputError("invalid_data_schema");
    }
    if (raw.screen !== undefined) {
      if (typeof raw.screen !== "string" || !VALID_SCREENS.has(raw.screen)) {
        throw new PushInputError("invalid_screen");
      }
      data.screen = raw.screen;
    }
    if (raw.diagnosisId !== undefined) {
      if (typeof raw.diagnosisId !== "string" || !UUID_PATTERN.test(raw.diagnosisId)) {
        throw new PushInputError("invalid_diagnosis_id");
      }
      data.diagnosisId = raw.diagnosisId.toLowerCase();
    }
    if (raw.riskType !== undefined) {
      if (typeof raw.riskType !== "string" || !VALID_RISK_TYPES.has(raw.riskType)) {
        throw new PushInputError("invalid_risk_type");
      }
      data.riskType = raw.riskType;
    }
  }
  if (body.category === "climate_risk_educational" && !data.riskType) {
    throw new PushInputError("risk_type_required");
  }

  return {
    notificationId: body.notification_id.toLowerCase(),
    category: body.category as ValidRequest["category"],
    title,
    body: message,
    data,
    targetUserIds,
  };
}

async function captureStableFailure(step: string): Promise<void> {
  await captureException(new Error(`pragas_push_${step}_failed`), {
    tags: { fn: "pragas-send-push", step },
  });
}

async function resolveEligibleUsers(
  admin: SupabaseClient,
  targetUserIds: string[],
): Promise<Set<string> | null> {
  const [links, profiles, subscriptions, deletions] = await Promise.all([
    admin
      .from("pragas_app_links")
      .select("user_id")
      .in("user_id", targetUserIds)
      .eq("active", true),
    admin.from("pragas_profiles").select("user_id").in("user_id", targetUserIds),
    admin
      .from("subscriptions")
      .select("user_id")
      .in("user_id", targetUserIds)
      .eq("app", "rumo-pragas")
      .eq("status", "active"),
    admin
      .from("pragas_deletion_jobs")
      .select("user_id,status")
      .in("user_id", targetUserIds),
  ]);
  if (links.error || profiles.error || subscriptions.error || deletions.error) return null;
  return resolveEligibleTargetUserIds(targetUserIds, {
    links: links.data ?? [],
    profiles: profiles.data ?? [],
    subscriptions: subscriptions.data ?? [],
    deletions: deletions.data ?? [],
  });
}

async function sendExpoBatch(
  messages: Array<Record<string, unknown>>,
): Promise<ExpoBatchResult> {
  try {
    const response = await fetchWithTimeout(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${EXPO_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(messages),
    }, 15_000);
    if (response.ok) {
      const text = await response.text();
      if (new TextEncoder().encode(text).byteLength <= 256 * 1024) {
        try {
          const tickets = parseExpoTickets(JSON.parse(text), messages.length);
          if (tickets) return { state: "tickets", tickets };
        } catch {
          // A malformed 2xx may still mean Expo accepted the request.
        }
      }
      await captureStableFailure("expo_unknown_response");
      return { state: "unknown_outcome" };
    }
    const status = response.status;
    await response.body?.cancel().catch(() => undefined);
    if (status >= 500) {
      await captureStableFailure("expo_unknown_server_failure");
      return { state: "unknown_outcome" };
    }
    return {
      state: "tickets",
      tickets: messages.map(() => ({ status: "error" })),
    };
  } catch {
    // A timeout/network failure can happen after Expo accepted the bytes. Never
    // retry this batch automatically because Expo provides no request key here.
    await captureStableFailure("expo_unknown_network_failure");
    return { state: "unknown_outcome" };
  }
}

async function handler(req: Request, { requestId }: { requestId: string }): Promise<Response> {
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed", requestId }, { status: 405 });
  }
  if (!(await authenticateServiceBearer(req, SUPABASE_SERVICE_ROLE_KEY))) {
    return jsonResponse({ ok: false, error: "unauthorized", requestId }, { status: 401 });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !EXPO_ACCESS_TOKEN) {
    await captureStableFailure("configuration");
    return jsonResponse({ ok: false, error: "misconfigured", requestId }, { status: 503 });
  }

  let input: ValidRequest;
  try {
    input = parseRequest(await readBoundedJSON(req));
  } catch (error) {
    if (error instanceof PushInputError) {
      return jsonResponse({ ok: false, error: error.code, requestId }, { status: error.status });
    }
    return jsonResponse({ ok: false, error: "invalid_request", requestId }, { status: 400 });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const requestHash = await sha256Hex(JSON.stringify(input));
  const claimResult = await admin.rpc("claim_pragas_push_notification", {
    p_notification_id: input.notificationId,
    p_request_hash: requestHash,
    p_category: input.category,
  });
  if (claimResult.error) {
    await captureStableFailure("audit_claim");
    return jsonResponse({ ok: false, error: "push_unavailable", requestId }, { status: 503 });
  }
  const claimRaw = Array.isArray(claimResult.data) ? claimResult.data[0] : claimResult.data;
  if (typeof claimRaw !== "object" || claimRaw === null) {
    await captureStableFailure("audit_claim_contract");
    return jsonResponse({ ok: false, error: "push_unavailable", requestId }, { status: 503 });
  }
  const claim = claimRaw as Record<string, unknown>;
  if (claim.state === "completed") {
    const { state: _state, ...completed } = claim;
    return jsonResponse({ ok: true, ...completed, deduped: true, requestId });
  }
  if (claim.state === "conflict") {
    return jsonResponse({ ok: false, error: "notification_id_payload_conflict", requestId }, {
      status: 409,
    });
  }
  if (claim.state === "unknown_outcome") {
    return jsonResponse({
      ok: false,
      error: "push_delivery_outcome_unknown_new_notification_id_required",
      requestId,
    }, { status: 409 });
  }
  if (claim.state === "in_progress") {
    const retryAfter = typeof claim.retry_after_seconds === "number"
      ? Math.max(1, Math.ceil(claim.retry_after_seconds))
      : 5;
    return jsonResponse({ ok: false, error: "push_delivery_in_progress", requestId }, {
      status: 409,
      headers: { "Retry-After": String(retryAfter) },
    });
  }
  if (
    claim.state !== "reserved" || typeof claim.lease_token !== "string" ||
    !UUID_PATTERN.test(claim.lease_token)
  ) {
    await captureStableFailure("audit_claim_contract");
    return jsonResponse({ ok: false, error: "push_unavailable", requestId }, { status: 503 });
  }
  const leaseToken = claim.lease_token.toLowerCase();
  const releaseClaim = async (): Promise<void> => {
    await admin.rpc("release_pragas_push_notification", {
      p_notification_id: input.notificationId,
      p_request_hash: requestHash,
      p_lease_token: leaseToken,
    });
  };

  const eligibleUsers = await resolveEligibleUsers(admin, input.targetUserIds);
  if (!eligibleUsers) {
    await releaseClaim();
    await captureStableFailure("recipient_link");
    return jsonResponse({ ok: false, error: "push_unavailable", requestId }, { status: 503 });
  }
  const eligibleIds = [...eligibleUsers];
  let tokens: PushToken[] = [];
  if (eligibleIds.length > 0) {
    const result = await admin
      .from("pragas_push_tokens")
      .select("user_id,expo_token,platform")
      .in("user_id", eligibleIds)
      .eq("is_active", true)
      .eq("notifications_enabled", true)
      .not("consented_at", "is", null)
      .is("revoked_at", null);
    if (result.error) {
      await releaseClaim();
      await captureStableFailure("token_lookup");
      return jsonResponse({ ok: false, error: "push_unavailable", requestId }, { status: 503 });
    }
    tokens = (result.data ?? []).filter((row): row is PushToken =>
      typeof row.expo_token === "string" &&
      (row.platform === "ios" || row.platform === "android")
    );
  }

  let accepted = 0;
  let failures = 0;
  const deadTokens: string[] = [];
  if (tokens.length > 0) {
    const providerStart = await admin.rpc("mark_pragas_push_provider_started", {
      p_notification_id: input.notificationId,
      p_request_hash: requestHash,
      p_lease_token: leaseToken,
    });
    if (providerStart.error || providerStart.data !== true) {
      await releaseClaim();
      await captureStableFailure("provider_lease");
      return jsonResponse({ ok: false, error: "push_provider_lease_unavailable", requestId }, {
        status: 503,
        headers: { "Retry-After": "30" },
      });
    }
  }
  for (let offset = 0; offset < tokens.length; offset += EXPO_BATCH_SIZE) {
    const batch = tokens.slice(offset, offset + EXPO_BATCH_SIZE);
    const delivery = await sendExpoBatch(batch.map((token) => ({
      to: token.expo_token,
      title: input.title,
      body: input.body,
      data: input.data,
      sound: "default",
      ...(token.platform === "android" ? { channelId: "climate-risk" } : {}),
    })));
    if (delivery.state === "unknown_outcome") {
      const unknown = await admin.rpc("mark_pragas_push_unknown_outcome", {
        p_notification_id: input.notificationId,
        p_request_hash: requestHash,
        p_lease_token: leaseToken,
        p_recipient_count: tokens.length,
        p_accepted_count: accepted,
        p_error_count: failures,
      });
      if (unknown.error || unknown.data !== true) {
        await captureStableFailure("audit_unknown_outcome");
      }
      return jsonResponse({
        ok: false,
        error: "push_delivery_outcome_unknown_new_notification_id_required",
        requestId,
      }, { status: 502 });
    }
    delivery.tickets.forEach((ticket, index) => {
      if (ticket.status === "ok") accepted += 1;
      else {
        failures += 1;
        if (ticket.details?.error === "DeviceNotRegistered") {
          const token = batch[index]?.expo_token;
          if (token) deadTokens.push(token);
        }
      }
    });
  }

  if (deadTokens.length > 0) {
    const revoked = await admin
      .from("pragas_push_tokens")
      .update({
        is_active: false,
        notifications_enabled: false,
        revoked_at: new Date().toISOString(),
      })
      .in("expo_token", deadTokens);
    if (revoked.error) await captureStableFailure("token_revoke");
  }

  const status = tokens.length === 0 || accepted === tokens.length
    ? "sent"
    : accepted > 0
    ? "partial"
    : "failed";
  const audit = await admin.rpc("complete_pragas_push_notification", {
    p_notification_id: input.notificationId,
    p_request_hash: requestHash,
    p_lease_token: leaseToken,
    p_status: status,
    p_recipient_count: tokens.length,
    p_accepted_count: accepted,
    p_error_count: failures,
  });
  if (audit.error || audit.data !== true) {
    await captureStableFailure("audit_complete");
    return jsonResponse({ ok: false, error: "push_audit_unavailable", requestId }, {
      status: 503,
    });
  }
  return jsonResponse({
    ok: true,
    notification_id: input.notificationId,
    recipient_count: tokens.length,
    accepted_count: accepted,
    error_count: failures,
    status,
    requestId,
  });
}

Deno.serve(withSentry("pragas-send-push", handler));
