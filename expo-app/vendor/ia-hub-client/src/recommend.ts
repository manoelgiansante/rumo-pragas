/**
 * Recommend — ranked suggestion endpoint.
 *
 * Server contract: POST /v1/recommend
 *   Body: { domain, context, topK? }
 *   Response: RecommendResponse
 *
 * Examples:
 *   - domain: "input-protocol" — Pragas: defensivo + dose
 *   - domain: "next-action"    — Máquinas: próxima manutenção
 *   - domain: "creative"       — Marketing: variação de anúncio
 */

import { RumoIAError } from "./errors";
import type { RumoIAHubClient } from "./client";
import type {
  RecommendInput,
  RecommendResponse,
  RequestOptions,
} from "./types";

export async function recommend(
  client: RumoIAHubClient,
  input: RecommendInput,
  opts?: RequestOptions,
): Promise<RecommendResponse> {
  if (!input || typeof input.domain !== "string" || !input.domain) {
    throw new RumoIAError({ message: "recommend: `domain` is required." });
  }
  if (!input.context || typeof input.context !== "object") {
    throw new RumoIAError({
      message: "recommend: `context` must be an object.",
    });
  }
  if (input.topK !== undefined && (!Number.isFinite(input.topK) || input.topK <= 0)) {
    throw new RumoIAError({
      message: "recommend: `topK` must be a positive number when provided.",
    });
  }
  return client.request<RecommendResponse>({
    method: "POST",
    path: "/v1/recommend",
    json: {
      domain: input.domain,
      context: input.context,
      topK: input.topK,
    },
    options: opts,
    endpoint: "recommend",
  });
}
