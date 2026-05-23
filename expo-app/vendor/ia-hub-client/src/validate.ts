/**
 * Validate — schema / semantic validation endpoint.
 *
 * Server contract: POST /v1/validate
 *   Body: { kind, payload }
 *   Response: ValidateResponse
 *
 * Examples:
 *   - kind: "machine-record"  — Máquinas: validar lançamento
 *   - kind: "tank-level"      — Máquinas: clamp + sign-flip check
 *   - kind: "rx-prescription" — Vet: validar receita equina
 */

import { RumoIAError } from "./errors";
import type { RumoIAHubClient } from "./client";
import type {
  RequestOptions,
  ValidateInput,
  ValidateResponse,
} from "./types";

export async function validate(
  client: RumoIAHubClient,
  input: ValidateInput,
  opts?: RequestOptions,
): Promise<ValidateResponse> {
  if (!input || typeof input.kind !== "string" || !input.kind) {
    throw new RumoIAError({ message: "validate: `kind` is required." });
  }
  if (!input.payload || typeof input.payload !== "object") {
    throw new RumoIAError({
      message: "validate: `payload` must be an object.",
    });
  }
  return client.request<ValidateResponse>({
    method: "POST",
    path: "/v1/validate",
    json: {
      kind: input.kind,
      payload: input.payload,
    },
    options: opts,
    endpoint: "validate",
  });
}
