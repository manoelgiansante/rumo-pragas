import { buildAiContentReportRow, reportAiContentSchema } from "../_shared/report-contracts.ts";
import { BoundedBodyError, readBoundedJson } from "../_shared/bounded-body.ts";
import {
  consumeDurableRateLimit,
  fingerprintRateLimitRequest,
  rateLimitHeaders,
  resolveIdempotencyKey,
} from "../_shared/durable-rate-limit.ts";
import {
  authenticatePragasRequest,
  createPragasAdminClient,
  getPragasAppAccessState,
  getPragasCorsHeaders,
  jsonResponse,
} from "../_shared/pragas-edge.ts";
import { captureException, withSentry } from "../_shared/pragas-sentry.ts";

const RATE_LIMIT = 5;

Deno.serve(withSentry("report-ai-content", async (req, { requestId }) => {
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
  const access = await getPragasAppAccessState(admin, user.id);
  if (access.state !== "active") {
    const status = access.state === "deleted_reactivation_required"
      ? 410
      : access.state === "deletion_pending" || access.state === "unlinked"
      ? 409
      : 503;
    return jsonResponse(
      { error: access.state },
      { status, headers: cors, requestId },
    );
  }

  const submissionKey = resolveIdempotencyKey(req.headers.get("Idempotency-Key"), requestId);
  const requestHash = await fingerprintRateLimitRequest(req, 16 * 1024);
  if (!requestHash) {
    return jsonResponse({ error: "payload_too_large" }, { status: 413, headers: cors, requestId });
  }
  const rateLimit = await consumeDurableRateLimit(admin, {
    userId: user.id,
    scope: "report_ai_content",
    limit: RATE_LIMIT,
    windowSeconds: 3600,
    idempotencyKey: submissionKey,
    requestHash,
  });
  if (!rateLimit) {
    await captureException(new Error("durable_rate_limit_unavailable"), {
      tags: { fn: "report-ai-content", step: "rate_limit" },
    });
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

  let input: unknown;
  try {
    input = await readBoundedJson(req, 16 * 1024);
  } catch (error) {
    const tooLarge = error instanceof BoundedBodyError && error.code === "payload_too_large";
    return jsonResponse(
      { error: tooLarge ? "payload_too_large" : "invalid_json" },
      { status: tooLarge ? 413 : 400, headers, requestId },
    );
  }
  const parsed = reportAiContentSchema.safeParse(input);
  if (!parsed.success) {
    return jsonResponse({ error: "invalid_request" }, { status: 400, headers, requestId });
  }

  const { data, error } = await admin
    .from("pragas_ai_content_reports")
    .upsert(
      buildAiContentReportRow(user.id, submissionKey, parsed.data),
      { onConflict: "user_id,submission_key", ignoreDuplicates: true },
    )
    .select("id, status, created_at")
    .maybeSingle();

  if (error) {
    await captureException(new Error("pragas_ai_report_insert_failed"), {
      tags: { fn: "report-ai-content", step: "insert" },
      extra: { requestId },
    });
    return jsonResponse({ error: "report_not_saved" }, { status: 500, headers, requestId });
  }

  const report = data ?? (await admin
    .from("pragas_ai_content_reports")
    .select("id, status, created_at")
    .eq("user_id", user.id)
    .eq("submission_key", submissionKey)
    .maybeSingle()).data;

  return jsonResponse(
    { report: report ?? { status: "received" } },
    { status: 201, headers, requestId },
  );
}));
