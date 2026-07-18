import type { SupabaseClient } from "@supabase/supabase-js";

export type PragasAIIdempotencyScope = "diagnosis" | "chat";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requireUUIDIdempotencyKey(value: string | null): string | null {
  const candidate = value?.trim() ?? "";
  return UUID_PATTERN.test(candidate) ? candidate.toLowerCase() : null;
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type PragasAIReservation =
  | { state: "reserved"; leaseToken: string; reclaimed: boolean }
  | { state: "in_progress"; retryAfterSeconds: number }
  | { state: "conflict" }
  | { state: "expired" }
  | { state: "unknown_outcome" }
  | { state: "completed"; responseStatus: number; responseBody: Record<string, unknown> }
  | { state: "unavailable" };

export function normalizeAIReservation(value: unknown): PragasAIReservation {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "object" || raw === null) return { state: "unavailable" };
  const record = raw as Record<string, unknown>;
  if (
    record.state === "reserved" && typeof record.lease_token === "string" &&
    UUID_PATTERN.test(record.lease_token)
  ) {
    return {
      state: "reserved",
      leaseToken: record.lease_token.toLowerCase(),
      reclaimed: record.reclaimed === true,
    };
  }
  if (record.state === "conflict") return { state: "conflict" };
  if (record.state === "expired") return { state: "expired" };
  if (record.state === "unknown_outcome") return { state: "unknown_outcome" };
  if (record.state === "in_progress") {
    return {
      state: "in_progress",
      retryAfterSeconds: typeof record.retry_after_seconds === "number"
        ? Math.max(1, Math.ceil(record.retry_after_seconds))
        : 5,
    };
  }
  if (
    record.state === "completed" &&
    typeof record.response_status === "number" &&
    Number.isInteger(record.response_status) &&
    record.response_status >= 200 &&
    record.response_status <= 599 &&
    typeof record.response_body === "object" &&
    record.response_body !== null &&
    !Array.isArray(record.response_body)
  ) {
    return {
      state: "completed",
      responseStatus: record.response_status,
      responseBody: record.response_body as Record<string, unknown>,
    };
  }
  return { state: "unavailable" };
}

export async function reservePragasAIRequest(
  admin: SupabaseClient,
  options: {
    userId: string;
    scope: PragasAIIdempotencyScope;
    idempotencyKey: string;
    requestHash: string;
  },
): Promise<PragasAIReservation> {
  const { data, error } = await admin.rpc("reserve_pragas_ai_idempotency", {
    p_user_id: options.userId,
    p_scope: options.scope,
    p_idempotency_key: options.idempotencyKey,
    p_request_hash: options.requestHash,
  });
  return error ? { state: "unavailable" } : normalizeAIReservation(data);
}

export async function completePragasAIRequest(
  admin: SupabaseClient,
  options: {
    userId: string;
    scope: PragasAIIdempotencyScope;
    idempotencyKey: string;
    requestHash: string;
    leaseToken: string;
    responseStatus: number;
    responseBody: Record<string, unknown>;
    responseTTLSeconds?: number;
  },
): Promise<boolean> {
  const { data, error } = await admin.rpc("complete_pragas_ai_idempotency", {
    p_user_id: options.userId,
    p_scope: options.scope,
    p_idempotency_key: options.idempotencyKey,
    p_request_hash: options.requestHash,
    p_lease_token: options.leaseToken,
    p_response_status: options.responseStatus,
    p_response_body: options.responseBody,
    p_response_ttl_seconds: options.responseTTLSeconds ?? 86_400,
  });
  if (error) return false;
  const raw = Array.isArray(data) ? data[0] : data;
  return typeof raw === "object" && raw !== null &&
    (raw as Record<string, unknown>).completed === true;
}

export async function markPragasAIProviderStarted(
  admin: SupabaseClient,
  options: {
    userId: string;
    scope: PragasAIIdempotencyScope;
    idempotencyKey: string;
    requestHash: string;
    leaseToken: string;
  },
): Promise<boolean> {
  const { data, error } = await admin.rpc("mark_pragas_ai_provider_started", {
    p_user_id: options.userId,
    p_scope: options.scope,
    p_idempotency_key: options.idempotencyKey,
    p_request_hash: options.requestHash,
    p_lease_token: options.leaseToken,
  });
  return !error && data === true;
}

export async function markPragasAIUnknownOutcome(
  admin: SupabaseClient,
  options: {
    userId: string;
    scope: PragasAIIdempotencyScope;
    idempotencyKey: string;
    requestHash: string;
    leaseToken: string;
  },
): Promise<boolean> {
  const { data, error } = await admin.rpc("mark_pragas_ai_unknown_outcome", {
    p_user_id: options.userId,
    p_scope: options.scope,
    p_idempotency_key: options.idempotencyKey,
    p_request_hash: options.requestHash,
    p_lease_token: options.leaseToken,
  });
  return !error && data === true;
}

export async function releasePragasAIRequest(
  admin: SupabaseClient,
  options: {
    userId: string;
    scope: PragasAIIdempotencyScope;
    idempotencyKey: string;
    requestHash: string;
    leaseToken: string;
  },
): Promise<boolean> {
  const { data, error } = await admin.rpc("release_pragas_ai_idempotency", {
    p_user_id: options.userId,
    p_scope: options.scope,
    p_idempotency_key: options.idempotencyKey,
    p_request_hash: options.requestHash,
    p_lease_token: options.leaseToken,
  });
  return !error && data === true;
}

export async function settleUnexpectedPragasAIRequest(
  admin: SupabaseClient,
  options: {
    userId: string;
    scope: PragasAIIdempotencyScope;
    idempotencyKey: string;
    requestHash: string;
    leaseToken: string;
  },
  providerAttempted: boolean,
  _deterministicFailureBody: Record<string, unknown>,
): Promise<"unknown_outcome" | "released" | "unavailable"> {
  if (providerAttempted) {
    return await markPragasAIUnknownOutcome(admin, options) ? "unknown_outcome" : "unavailable";
  }
  return await releasePragasAIRequest(admin, options) ? "released" : "unavailable";
}

export function normalizePragasCoordinates(
  latitude: unknown,
  longitude: unknown,
): { lat: number | null; lng: number | null } {
  if (
    typeof latitude !== "number" || !Number.isFinite(latitude) ||
    typeof longitude !== "number" || !Number.isFinite(longitude) ||
    latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180
  ) {
    return { lat: null, lng: null };
  }
  return {
    lat: Number(latitude.toFixed(2)),
    lng: Number(longitude.toFixed(2)),
  };
}
