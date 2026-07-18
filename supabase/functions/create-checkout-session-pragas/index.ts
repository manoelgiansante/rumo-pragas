import { retiredFreeProductEndpoint } from "../_shared/retired-pragas-endpoint.ts";
import { withSentry } from "../_shared/pragas-sentry.ts";

Deno.serve(withSentry("create-checkout-session-pragas", (req, { requestId }) => {
  return Promise.resolve(retiredFreeProductEndpoint(req, requestId));
}));
