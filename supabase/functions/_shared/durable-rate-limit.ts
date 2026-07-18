import type { SupabaseClient } from "@supabase/supabase-js";

export type PragasRateLimitScope =
  | "diagnose"
  | "ai_chat"
  | "report_ai_content"
  | "diagnosis_feedback"
  | "admin_ai_reports"
  | "export_user_data"
  | "delete_user_account"
  | "reactivate_user_account"
  | "analytics"
  | "mcp";

export interface DurableRateLimitResult {
  allowed: boolean;
  replayed: boolean;
  conflict: boolean;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function fingerprintRateLimitRequest(
  request: Request,
  maxBodyBytes: number,
): Promise<string | null> {
  const declaredLength = Number(request.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) return null;

  const prefix = new TextEncoder().encode(
    `${request.method.toUpperCase()}\n${new URL(request.url).pathname}${
      new URL(request.url).search
    }\n`,
  );
  const chunks: Uint8Array[] = [];
  let bodyBytes = 0;
  const reader = request.clone().body?.getReader();
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bodyBytes += value.byteLength;
        if (bodyBytes > maxBodyBytes) {
          await reader.cancel();
          return null;
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }

  const fingerprintInput = new Uint8Array(prefix.byteLength + bodyBytes);
  fingerprintInput.set(prefix, 0);
  let offset = prefix.byteLength;
  for (const chunk of chunks) {
    fingerprintInput.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return toHex(await crypto.subtle.digest("SHA-256", fingerprintInput));
}

export function resolveIdempotencyKey(headerValue: string | null, requestId: string): string {
  const candidate = headerValue?.trim() ?? "";
  return UUID_PATTERN.test(candidate) ? candidate : requestId;
}

export function normalizeRateLimitResult(value: unknown): DurableRateLimitResult | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const resetAt = new Date(String(record.reset_at ?? ""));
  if (
    typeof record.allowed !== "boolean" ||
    typeof record.remaining !== "number" ||
    !Number.isInteger(record.remaining) ||
    Number.isNaN(resetAt.getTime())
  ) {
    return null;
  }
  const retryAfter = typeof record.retry_after_seconds === "number"
    ? Math.max(0, Math.ceil(record.retry_after_seconds))
    : Math.max(0, Math.ceil((resetAt.getTime() - Date.now()) / 1_000));
  return {
    allowed: record.allowed,
    replayed: record.replayed === true,
    conflict: record.conflict === true,
    remaining: Math.max(0, record.remaining),
    resetAt,
    retryAfterSeconds: retryAfter,
  };
}

export async function consumeDurableRateLimit(
  admin: SupabaseClient,
  options: {
    userId: string;
    scope: PragasRateLimitScope;
    limit: number;
    windowSeconds: number;
    idempotencyKey: string;
    requestHash: string;
  },
): Promise<DurableRateLimitResult | null> {
  const { data, error } = await admin.rpc("consume_pragas_api_rate_limit", {
    p_user_id: options.userId,
    p_scope: options.scope,
    p_limit: options.limit,
    p_window_seconds: options.windowSeconds,
    p_idempotency_key: options.idempotencyKey,
    p_request_hash: options.requestHash,
  });
  if (error) return null;
  return normalizeRateLimitResult(data);
}

export function rateLimitHeaders(
  limit: number,
  result: DurableRateLimitResult,
): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt.getTime() / 1_000)),
  };
}
