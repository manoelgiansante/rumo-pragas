import { retiredFreeProductEndpoint } from "../_shared/retired-pragas-endpoint.ts";
import { withSentry } from "../_shared/pragas-sentry.ts";

Deno.serve(withSentry("disease-risk", (req, { requestId }) => {
  return Promise.resolve(retiredFreeProductEndpoint(req, requestId));
}));
