/**
 * Forecast — time-series / numeric prediction endpoint.
 *
 * Server contract: POST /v1/forecast
 *   Body: { kind, horizonDays, features }
 *   Response: ForecastResponse
 *
 * Examples:
 *   - kind: "gmd"   — Confinamento: ganho médio diário próximos 30d
 *   - kind: "yield" — Lavouras: produtividade soja próximos 60d
 *   - kind: "milk"  — Leiteiro: produção próximos 7d
 */

import { RumoIAError } from "./errors";
import type { RumoIAHubClient } from "./client";
import type {
  ForecastInput,
  ForecastResponse,
  RequestOptions,
} from "./types";

export async function forecast(
  client: RumoIAHubClient,
  input: ForecastInput,
  opts?: RequestOptions,
): Promise<ForecastResponse> {
  if (!input || typeof input.kind !== "string" || !input.kind) {
    throw new RumoIAError({ message: "forecast: `kind` is required." });
  }
  if (!Number.isFinite(input.horizonDays) || input.horizonDays <= 0) {
    throw new RumoIAError({
      message: "forecast: `horizonDays` must be a positive number.",
    });
  }
  if (!input.features || typeof input.features !== "object") {
    throw new RumoIAError({
      message: "forecast: `features` must be an object.",
    });
  }
  return client.request<ForecastResponse>({
    method: "POST",
    path: "/v1/forecast",
    json: {
      kind: input.kind,
      horizonDays: input.horizonDays,
      features: input.features,
    },
    options: opts,
    endpoint: "forecast",
  });
}
