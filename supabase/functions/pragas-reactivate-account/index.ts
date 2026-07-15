import { z } from "zod";
import { requireUUIDIdempotencyKey } from "../_shared/ai-idempotency.ts";
import { BoundedBodyError, readBoundedJson } from "../_shared/bounded-body.ts";
import {
  consumeDurableRateLimit,
  fingerprintRateLimitRequest,
  rateLimitHeaders,
} from "../_shared/durable-rate-limit.ts";
import {
  authenticatePragasRequest,
  createPragasAdminClient,
  getPragasAppAccessState,
  getPragasCorsHeaders,
  jsonResponse,
} from "../_shared/pragas-edge.ts";
import { captureException, withSentry } from "../_shared/pragas-sentry.ts";

const RATE_LIMIT = 3;
const bodySchema = z.object({
  confirm: z.literal("REACTIVATE_RUMO_PRAGAS"),
}).strict();

Deno.serve(withSentry("pragas-reactivate-account", async (req, { requestId }) => {
  const cors = getPragasCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405, headers: cors, requestId });
  }

  const admin = createPragasAdminClient();
  const user = await authenticatePragasRequest(req, admin);
  if (!user) {
    return jsonResponse({ error: "unauthorized" }, { status: 401, headers: cors, requestId });
  }

  const idempotencyKey = requireUUIDIdempotencyKey(req.headers.get("Idempotency-Key"));
  if (!idempotencyKey) {
    return jsonResponse(
      { error: "invalid_idempotency_key" },
      { status: 400, headers: cors, requestId },
    );
  }
  const requestHash = await fingerprintRateLimitRequest(req, 8 * 1024);
  if (!requestHash) {
    return jsonResponse({ error: "payload_too_large" }, { status: 413, headers: cors, requestId });
  }

  let input: unknown;
  try {
    input = await readBoundedJson(req, 8 * 1024);
  } catch (error) {
    const tooLarge = error instanceof BoundedBodyError && error.code === "payload_too_large";
    return jsonResponse(
      { error: tooLarge ? "payload_too_large" : "invalid_json" },
      { status: tooLarge ? 413 : 400, headers: cors, requestId },
    );
  }
  if (!bodySchema.safeParse(input).success) {
    return jsonResponse(
      { error: "reactivation_confirmation_required" },
      { status: 400, headers: cors, requestId },
    );
  }

  const access = await getPragasAppAccessState(admin, user.id);
  if (access.state === "unavailable") {
    return jsonResponse(
      { error: "app_access_unavailable" },
      { status: 503, headers: { ...cors, "Retry-After": "30" }, requestId },
    );
  }
  if (access.state === "deletion_pending") {
    return jsonResponse(
      { error: "deletion_pending" },
      { status: 409, headers: { ...cors, "Retry-After": "30" }, requestId },
    );
  }
  if (access.state === "unlinked") {
    return jsonResponse(
      { error: "reactivation_not_required" },
      { status: 409, headers: cors, requestId },
    );
  }

  const rateLimit = await consumeDurableRateLimit(admin, {
    userId: user.id,
    scope: "reactivate_user_account",
    limit: RATE_LIMIT,
    windowSeconds: 3600,
    idempotencyKey,
    requestHash,
  });
  if (!rateLimit) {
    return jsonResponse(
      { error: "temporarily_unavailable" },
      { status: 503, headers: { ...cors, "Retry-After": "30" }, requestId },
    );
  }
  const headers = { ...cors, ...rateLimitHeaders(RATE_LIMIT, rateLimit) };
  if (rateLimit.conflict) {
    return jsonResponse({ error: "idempotency_key_conflict" }, { status: 409, headers, requestId });
  }
  if (!rateLimit.allowed) {
    return jsonResponse(
      { error: "rate_limit_exceeded" },
      {
        status: 429,
        headers: { ...headers, "Retry-After": String(Math.max(1, rateLimit.retryAfterSeconds)) },
        requestId,
      },
    );
  }

  const { data, error } = await admin.rpc("reactivate_pragas_account", {
    p_user_id: user.id,
    p_request_id: requestId,
    p_idempotency_key: idempotencyKey,
  });
  if (error) {
    await captureException(new Error("pragas_reactivation_rpc_failed"), {
      tags: { fn: "pragas-reactivate-account", step: "reactivate_rpc" },
    });
    return jsonResponse(
      { error: "reactivation_failed" },
      { status: 503, headers: { ...headers, "Retry-After": "30" }, requestId },
    );
  }

  const result = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!result || result.reactivated !== true || result.data_restored !== false) {
    await captureException(new Error("invalid_reactivation_rpc_response"), {
      tags: { fn: "pragas-reactivate-account", step: "reactivate_contract" },
    });
    return jsonResponse(
      { error: "reactivation_failed" },
      { status: 500, headers, requestId },
    );
  }

  return jsonResponse(
    {
      ok: true,
      code: "PRAGAS_ACCOUNT_REACTIVATED",
      reactivated: true,
      dataRestored: false,
    },
    { headers, requestId },
  );
}));
