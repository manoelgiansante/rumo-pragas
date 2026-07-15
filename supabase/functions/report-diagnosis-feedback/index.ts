import { diagnosisFeedbackSchema } from "../_shared/report-contracts.ts";
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

const RATE_LIMIT = 20;

Deno.serve(withSentry("report-diagnosis-feedback", async (req, { requestId }) => {
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

  const idempotencyKey = resolveIdempotencyKey(req.headers.get("Idempotency-Key"), requestId);
  const requestHash = await fingerprintRateLimitRequest(req, 8 * 1024);
  if (!requestHash) {
    return jsonResponse({ error: "payload_too_large" }, { status: 413, headers: cors, requestId });
  }
  const rateLimit = await consumeDurableRateLimit(admin, {
    userId: user.id,
    scope: "diagnosis_feedback",
    limit: RATE_LIMIT,
    windowSeconds: 86400,
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
  if (rateLimit.replayed) {
    return jsonResponse(
      { error: "idempotency_key_reused" },
      { status: 409, headers, requestId },
    );
  }

  let input: unknown;
  try {
    input = await readBoundedJson(req, 8 * 1024);
  } catch (error) {
    const tooLarge = error instanceof BoundedBodyError && error.code === "payload_too_large";
    return jsonResponse(
      { error: tooLarge ? "payload_too_large" : "invalid_json" },
      { status: tooLarge ? 413 : 400, headers, requestId },
    );
  }
  const parsed = diagnosisFeedbackSchema.safeParse(input);
  if (!parsed.success) {
    return jsonResponse({ error: "invalid_request" }, { status: 400, headers, requestId });
  }

  const { data: diagnosis, error: diagnosisError } = await admin
    .from("pragas_diagnoses")
    .select("id")
    .eq("id", parsed.data.diagnosisId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (diagnosisError) {
    await captureException(new Error("pragas_feedback_ownership_check_failed"), {
      tags: { fn: "report-diagnosis-feedback", step: "ownership" },
    });
    return jsonResponse({ error: "temporarily_unavailable" }, { status: 503, headers, requestId });
  }
  if (!diagnosis) {
    return jsonResponse({ error: "diagnosis_not_found" }, { status: 404, headers, requestId });
  }

  const { data, error } = await admin
    .from("pragas_diagnosis_feedback")
    .upsert({
      user_id: user.id,
      diagnosis_id: parsed.data.diagnosisId,
      verdict: parsed.data.verdict,
      selected_alternative: parsed.data.selectedAlternative || null,
      notes: parsed.data.notes || null,
    }, { onConflict: "user_id,diagnosis_id" })
    .select("id, diagnosis_id, verdict, selected_alternative, notes, created_at, updated_at")
    .single();
  if (error) {
    await captureException(new Error("pragas_feedback_upsert_failed"), {
      tags: { fn: "report-diagnosis-feedback", step: "upsert" },
    });
    return jsonResponse({ error: "feedback_not_saved" }, { status: 500, headers, requestId });
  }

  return jsonResponse({ feedback: data }, { status: 201, headers, requestId });
}));
