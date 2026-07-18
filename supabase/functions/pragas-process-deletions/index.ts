import { AccountCleanupError, cleanupPragasUserData } from "../_shared/account-cleanup.ts";
import {
  createPragasAdminClient,
  getPragasCorsHeaders,
  jsonResponse,
} from "../_shared/pragas-edge.ts";
import { authenticateServiceBearer } from "../_shared/service-auth.ts";
import { captureException, captureMessage, withSentry } from "../_shared/pragas-sentry.ts";

const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function retryDelaySeconds(attempts: number): number {
  return Math.min(86_400, 60 * 2 ** Math.min(Math.max(attempts - 1, 0), 10));
}

async function captureStableFailure(step: string, errorCode?: string): Promise<void> {
  await captureException(new Error(`pragas_deletion_${step}_failed`), {
    tags: { fn: "pragas-process-deletions", step, ...(errorCode ? { errorCode } : {}) },
  });
}

Deno.serve(withSentry("pragas-process-deletions", async (req, { requestId }) => {
  const cors = getPragasCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405, headers: cors, requestId });
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "service_not_configured" }, {
      status: 500,
      headers: cors,
      requestId,
    });
  }

  if (!(await authenticateServiceBearer(req, SUPABASE_SERVICE_ROLE_KEY))) {
    return jsonResponse({ error: "unauthorized" }, { status: 401, headers: cors, requestId });
  }

  const admin = createPragasAdminClient();
  const { data, error: claimError } = await admin.rpc("claim_pragas_deletion_jobs", {
    p_limit: 25,
  });
  if (claimError) {
    await captureStableFailure("claim_queue");
    return jsonResponse({ error: "queue_unavailable" }, { status: 500, headers: cors, requestId });
  }

  const jobs = Array.isArray(data)
    ? data as Array<{
      id: string;
      user_id: string;
      attempts: number;
      lease_token: string;
    }>
    : [];
  if (jobs.length === 0) {
    return jsonResponse(
      {
        appScopedProcessed: 0,
        globalIdentityRetained: 0,
        retryScheduled: 0,
        leaseLost: 0,
        failed: 0,
      },
      { headers: cors, requestId },
    );
  }

  let appScopedProcessed = 0;
  let failed = 0;
  let globalIdentityRetained = 0;
  let retryScheduled = 0;
  let leaseLost = 0;

  for (const job of jobs) {
    try {
      await cleanupPragasUserData(admin, job.user_id);
      const { data: completed, error } = await admin.rpc("complete_pragas_deletion_job", {
        p_job_id: job.id,
        p_lease_token: job.lease_token,
      });
      if (error || completed !== true) {
        throw new AccountCleanupError("queue_completion_lease_lost");
      }
      appScopedProcessed++;
      // Success is app-scoped erasure. The portfolio-wide auth identity is
      // deliberately retained and represented by the durable job state.
      globalIdentityRetained++;
    } catch (error) {
      failed++;
      const errorCode = error instanceof AccountCleanupError
        ? error.code
        : "unexpected_cleanup_error";
      if (errorCode === "queue_completion_lease_lost") leaseLost++;
      const nextAttempt = new Date(
        Date.now() + retryDelaySeconds(job.attempts) * 1_000,
      ).toISOString();
      const { data: retried, error: retryError } = await admin.rpc(
        "retry_pragas_deletion_job",
        {
          p_job_id: job.id,
          p_lease_token: job.lease_token,
          p_error_code: errorCode.slice(0, 100),
          p_next_attempt_at: nextAttempt,
        },
      );
      await captureStableFailure("cleanup", errorCode);
      if (!retryError && retried === true) {
        retryScheduled++;
      } else {
        await captureStableFailure("schedule_retry");
      }
    }
  }

  if (failed > 0) {
    await captureMessage("Pragas deletion queue has retryable failures", {
      level: "warning",
      tags: { fn: "pragas-process-deletions" },
      extra: {
        appScopedProcessed,
        globalIdentityRetained,
        retryScheduled,
        leaseLost,
        failed,
      },
    });
    return jsonResponse(
      {
        error: "deletion_cleanup_failed",
        appScopedProcessed,
        globalIdentityRetained,
        retryScheduled,
        leaseLost,
        failed,
      },
      { status: 500, headers: cors, requestId },
    );
  }

  return jsonResponse(
    {
      appScopedProcessed,
      globalIdentityRetained,
      retryScheduled,
      leaseLost,
      failed: 0,
      globalAuthUsersDeleted: 0,
    },
    { status: 200, headers: cors, requestId },
  );
}));
