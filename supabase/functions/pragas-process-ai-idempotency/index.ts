import {
  createPragasAdminClient,
  getPragasCorsHeaders,
  jsonResponse,
} from "../_shared/pragas-edge.ts";
import { authenticateServiceBearer } from "../_shared/service-auth.ts";
import { captureException, withSentry } from "../_shared/pragas-sentry.ts";

const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.serve(withSentry("pragas-process-ai-idempotency", async (req, { requestId }) => {
  const cors = getPragasCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405, headers: cors, requestId });
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(
      { error: "service_not_configured" },
      { status: 500, headers: cors, requestId },
    );
  }
  if (!(await authenticateServiceBearer(req, SUPABASE_SERVICE_ROLE_KEY))) {
    return jsonResponse({ error: "unauthorized" }, { status: 401, headers: cors, requestId });
  }

  const admin = createPragasAdminClient();
  const { data, error } = await admin.rpc("scrub_expired_pragas_ai_idempotency", {
    p_limit: 1000,
  });
  if (error || typeof data !== "number") {
    await captureException(new Error("pragas_idempotency_scrub_failed"), {
      tags: { fn: "pragas-process-ai-idempotency", step: "scrub" },
    });
    return jsonResponse(
      { error: "scrub_unavailable" },
      { status: 500, headers: cors, requestId },
    );
  }
  return jsonResponse({ scrubbed: data }, { headers: cors, requestId });
}));
