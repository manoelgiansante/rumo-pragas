import {
  adminReportListSchema,
  adminReportPatchSchema,
  isPragasAdmin,
} from "../_shared/report-contracts.ts";
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
import { captureException, pseudonymizeIdentifier, withSentry } from "../_shared/pragas-sentry.ts";

const RATE_LIMIT = 120;

Deno.serve(withSentry("admin-ai-content-reports", async (req, { requestId }) => {
  const cors = getPragasCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET" && req.method !== "PATCH") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405, headers: cors, requestId });
  }

  const admin = createPragasAdminClient();
  const user = await authenticatePragasRequest(req, admin);
  if (!user) {
    return jsonResponse({ error: "unauthorized" }, { status: 401, headers: cors, requestId });
  }
  if (!isPragasAdmin(user.app_metadata as Record<string, unknown>)) {
    return jsonResponse({ error: "forbidden" }, { status: 403, headers: cors, requestId });
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
    scope: "admin_ai_reports",
    limit: RATE_LIMIT,
    windowSeconds: 60,
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

  if (req.method === "GET") {
    const url = new URL(req.url);
    const parsed = adminReportListSchema.safeParse({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      reason: url.searchParams.get("reason") ?? undefined,
    });
    if (!parsed.success) {
      return jsonResponse({ error: "invalid_query" }, { status: 400, headers, requestId });
    }
    const { page, limit, status, reason } = parsed.data;
    const offset = (page - 1) * limit;
    let query = admin
      .from("pragas_ai_content_reports")
      .select(
        "id,user_id,message_id,content,reason,details,status,review_note,reviewed_by,reviewed_at,resolved_at,created_at,updated_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (status) query = query.eq("status", status);
    if (reason) query = query.eq("reason", reason);
    const { data, count, error } = await query;
    if (error) {
      await captureException(new Error("pragas_admin_report_list_failed"), {
        tags: { fn: "admin-ai-content-reports", step: "list" },
      });
      return jsonResponse({ error: "reports_unavailable" }, { status: 500, headers, requestId });
    }

    const reports = await Promise.all((data ?? []).map(async (report) => ({
      id: report.id,
      reporter: await pseudonymizeIdentifier(String(report.user_id)),
      messageId: report.message_id,
      content: report.content,
      reason: report.reason,
      details: report.details,
      status: report.status,
      reviewNote: report.review_note,
      reviewedAt: report.reviewed_at,
      resolvedAt: report.resolved_at,
      createdAt: report.created_at,
      updatedAt: report.updated_at,
    })));

    return jsonResponse(
      { reports, pagination: { page, limit, total: count ?? 0 } },
      { headers, requestId },
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
  const parsed = adminReportPatchSchema.safeParse(input);
  if (!parsed.success) {
    return jsonResponse({ error: "invalid_request" }, { status: 400, headers, requestId });
  }

  const { data, error } = await admin.rpc("transition_pragas_ai_content_report", {
    p_report_id: parsed.data.id,
    p_new_status: parsed.data.status,
    p_actor_id: user.id,
    p_review_note: parsed.data.note || null,
  });
  if (error) {
    await captureException(new Error("report_transition_rejected"), {
      level: "warning",
      tags: { fn: "admin-ai-content-reports", step: "transition" },
    });
    return jsonResponse({ error: "invalid_transition" }, { status: 409, headers, requestId });
  }
  const report = Array.isArray(data) ? data[0] : data;
  return jsonResponse(
    {
      report: report
        ? {
          id: report.id,
          status: report.status,
          reviewedAt: report.reviewed_at,
          resolvedAt: report.resolved_at,
          updatedAt: report.updated_at,
        }
        : null,
    },
    { headers, requestId },
  );
}));
