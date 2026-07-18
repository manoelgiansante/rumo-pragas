import { AccountCleanupError, cleanupPragasUserData } from "../_shared/account-cleanup.ts";
import {
  consumeDurableRateLimit,
  fingerprintRateLimitRequest,
  rateLimitHeaders,
  resolveIdempotencyKey,
} from "../_shared/durable-rate-limit.ts";
import {
  authenticatePragasRequest,
  createPragasAdminClient,
  getPragasCorsHeaders,
  jsonResponse,
} from "../_shared/pragas-edge.ts";
import { captureException, withSentry } from "../_shared/pragas-sentry.ts";

const RATE_LIMIT = 3;
const GLOBAL_DECISION_MESSAGE =
  "Os dados comprovadamente vinculados ao Rumo Pragas foram removidos. A identidade de acesso AgroRumo " +
  "e registros históricos sem discriminador de aplicativo foram mantidos para não alterar dados de outros aplicativos.";

async function captureStableFailure(step: string, errorCode?: string): Promise<void> {
  await captureException(new Error(`pragas_delete_${step}_failed`), {
    tags: { fn: "pragas-delete-user-account", step, ...(errorCode ? { errorCode } : {}) },
  });
}

Deno.serve(withSentry("pragas-delete-user-account", async (req, { requestId }) => {
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

  const { data: existing, error: lookupError } = await admin
    .from("pragas_deletion_jobs")
    .select("id,status,requested_at,app_cleanup_completed_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (lookupError) {
    await captureStableFailure("queue_lookup");
    return jsonResponse({ error: "request_not_saved" }, { status: 500, headers: cors, requestId });
  }

  if (existing?.status === "blocked_global_decision" && existing.app_cleanup_completed_at) {
    return jsonResponse(
      {
        ok: true,
        code: "APP_SCOPED_DATA_DELETED_SHARED_HISTORY_RETAINED",
        appDataDeletionComplete: false,
        appScopedDataDeletionComplete: true,
        pushTokensRevoked: true,
        globalIdentityDeleted: false,
        sharedUnscopedRecordsRetained: ["analytics_events", "audit_log", "user_preferences"],
        message: GLOBAL_DECISION_MESSAGE,
      },
      { headers: cors, requestId },
    );
  }

  const idempotencyKey = resolveIdempotencyKey(req.headers.get("Idempotency-Key"), requestId);
  const requestHash = await fingerprintRateLimitRequest(req, 1024);
  if (!requestHash) {
    return jsonResponse({ error: "payload_too_large" }, { status: 413, headers: cors, requestId });
  }
  const rateLimit = await consumeDurableRateLimit(admin, {
    userId: user.id,
    scope: "delete_user_account",
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

  const { data: requestData, error: requestError } = await admin.rpc(
    "request_pragas_account_deletion",
    { p_user_id: user.id },
  );
  if (requestError) {
    await captureStableFailure("queue_request");
    return jsonResponse({ error: "request_not_saved" }, { status: 500, headers, requestId });
  }
  const requested = (Array.isArray(requestData) ? requestData[0] : requestData) as
    | Record<string, unknown>
    | null;
  if (!requested || typeof requested.status !== "string") {
    return jsonResponse({ error: "request_not_saved" }, { status: 500, headers, requestId });
  }
  if (requested.status === "blocked_global_decision") {
    return jsonResponse(
      {
        ok: true,
        code: "APP_SCOPED_DATA_DELETED_SHARED_HISTORY_RETAINED",
        appDataDeletionComplete: false,
        appScopedDataDeletionComplete: true,
        pushTokensRevoked: true,
        globalIdentityDeleted: false,
        sharedUnscopedRecordsRetained: ["analytics_events", "audit_log", "user_preferences"],
        message: GLOBAL_DECISION_MESSAGE,
      },
      { headers, requestId },
    );
  }

  const { data: claimed, error: claimError } = await admin.rpc("claim_pragas_deletion_job", {
    p_user_id: user.id,
  });
  if (claimError) {
    await captureStableFailure("queue_claim");
    return jsonResponse({ error: "request_not_processed" }, { status: 500, headers, requestId });
  }
  const job = Array.isArray(claimed) ? claimed[0] : claimed;
  if (!job) {
    return jsonResponse(
      {
        ok: false,
        code: "APP_DATA_DELETION_IN_PROGRESS",
        appDataDeletionComplete: false,
        globalIdentityDeleted: false,
        retryPending: true,
      },
      { status: 202, headers, requestId },
    );
  }

  try {
    await cleanupPragasUserData(admin, user.id);
    const { data: completed, error: completionError } = await admin.rpc(
      "complete_pragas_deletion_job",
      { p_job_id: job.id, p_lease_token: job.lease_token },
    );
    if (completionError || completed !== true) {
      throw new AccountCleanupError("queue_completion_lease_lost");
    }

    return jsonResponse(
      {
        ok: true,
        code: "APP_SCOPED_DATA_DELETED_SHARED_HISTORY_RETAINED",
        appDataDeletionComplete: false,
        appScopedDataDeletionComplete: true,
        pushTokensRevoked: true,
        globalIdentityDeleted: false,
        sharedUnscopedRecordsRetained: ["analytics_events", "audit_log", "user_preferences"],
        message: GLOBAL_DECISION_MESSAGE,
      },
      { headers, requestId },
    );
  } catch (error) {
    const errorCode = error instanceof AccountCleanupError
      ? error.code
      : "unexpected_cleanup_error";
    const { data: retried, error: retryError } = await admin.rpc(
      "retry_pragas_deletion_job",
      {
        p_job_id: job.id,
        p_lease_token: job.lease_token,
        p_error_code: errorCode.slice(0, 100),
        p_next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
      },
    );
    await captureStableFailure("app_cleanup", errorCode);
    if (retryError || retried !== true) await captureStableFailure("schedule_retry");
    return jsonResponse(
      {
        ok: false,
        code: "APP_DATA_DELETION_INCOMPLETE",
        appDataDeletionComplete: false,
        globalIdentityDeleted: false,
        retryScheduled: !retryError && retried === true,
        partialCleanupPossible: true,
      },
      { status: 500, headers, requestId },
    );
  }
}));
