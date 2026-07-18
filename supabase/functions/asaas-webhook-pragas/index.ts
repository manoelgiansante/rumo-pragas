import { retiredBillingWebhook } from "../_shared/retired-pragas-endpoint.ts";
import { withSentry } from "../_shared/pragas-sentry.ts";

Deno.serve(withSentry("asaas-webhook-pragas", (req, { requestId }) => {
  return Promise.resolve(retiredBillingWebhook(req, requestId));
}));
