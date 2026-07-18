import { getPragasCorsHeaders, jsonResponse } from "./pragas-edge.ts";

export function retiredFreeProductEndpoint(
  req: Request,
  requestId: string,
): Response {
  const cors = getPragasCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  return jsonResponse(
    {
      error: "endpoint_retired",
      code: "RUMO_PRAGAS_FREE_PRODUCT",
      billingEnabled: false,
    },
    { status: 410, headers: cors, requestId },
  );
}

export function retiredBillingWebhook(
  req: Request,
  requestId: string,
): Response {
  if (req.method !== "POST") {
    return jsonResponse(
      { error: "method_not_allowed" },
      { status: 405, requestId },
    );
  }
  // Acknowledge legacy provider retries without parsing, logging or persisting
  // the potentially sensitive body. The response itself is the observable,
  // deterministic proof that billing is intentionally disabled.
  return jsonResponse(
    {
      received: true,
      processed: false,
      code: "RUMO_PRAGAS_BILLING_DISABLED",
    },
    { status: 200, requestId },
  );
}
