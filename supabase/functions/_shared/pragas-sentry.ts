/**
 * Shared Sentry helper for Supabase Edge Functions.
 *
 * Why this exists:
 *  - ZERO-O mandates every new edge function instrument exceptions.
 *  - The diagnose/analytics/etc functions each rolled their own console.error
 *    pattern which was effectively silent in prod. This wraps them in a
 *    Sentry-friendly capture and re-exposes a `withSentry` HOC.
 *  - Deno + Edge runtime cannot use @sentry/node. We POST directly to the
 *    Sentry envelope endpoint (compact, no extra deps).
 *
 * Usage:
 *   import { withSentry, logError } from '../_shared/pragas-sentry.ts';
 *   serve(withSentry('send-push', async (req) => { ... }));
 *
 * Failure mode: every Sentry call is best-effort and never re-throws.
 * If Sentry is unreachable, we still serve the request normally.
 */

interface SentryDsn {
  publicKey: string;
  host: string;
  projectId: string;
  protocol: string;
}

const PII_HASH_SALT = Deno.env.get("SENTRY_PII_HASH_SALT")?.trim() || null;
const CONTENT_KEYS =
  /^(?:content|prompt|messages|photo|image(?:_base64)?|response|completion|raw_?text)$/i;
const EMAIL_KEYS = /email/i;
const USER_ID_KEYS = /^(?:id|user_?id|userid|actor_?id|reviewed_by)$/i;
const REQUEST_ID_KEYS = /^(?:request_?id|reference_?id)$/i;
const SENSITIVE_CONTEXT_KEYS =
  /^(?:crop|pest|label|lat(?:itude)?|lng|lon(?:gitude)?|coordinates?|location|query|sql|detail|hint)$/i;
const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

function redactSensitiveString(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL_REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [TOKEN_REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[JWT_REDACTED]")
    .replace(/([?&](?:key|token|secret|api_key)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(UUID_PATTERN, "[UUID_REDACTED]")
    .replace(
      /\b((?:lat(?:itude)?|location_lat|lng|lon(?:gitude)?|location_lng)\s*[:=]\s*)-?\d{1,3}(?:[.,]\d+)?/gi,
      "$1[COORDINATE_REDACTED]",
    )
    .replace(
      /(^|[^\d.])-?(?:[0-8]?\d(?:\.\d+)?|90(?:\.0+)?)\s*[,;]\s*-?(?:1[0-7]\d(?:\.\d+)?|180(?:\.0+)?|(?:[0-9]?\d)(?:\.\d+)?)(?=$|[^\d.])/g,
      "$1[COORDINATES_REDACTED]",
    )
    .replace(/[A-Za-z0-9+/_-]{512,}={0,2}/g, "[BINARY_REDACTED]")
    .slice(0, 2_000);
}

export async function pseudonymizeIdentifier(value: string): Promise<string> {
  if (!PII_HASH_SALT) return "anon_redacted";
  const input = new TextEncoder().encode(`${PII_HASH_SALT}:${value}`);
  const digest = await crypto.subtle.digest("SHA-256", input);
  const shortHash = Array.from(new Uint8Array(digest).slice(0, 12))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `anon_${shortHash}`;
}

async function scrubValue(value: unknown, key = "", depth = 0): Promise<unknown> {
  if (depth > 8) return "[TRUNCATED]";
  if (REQUEST_ID_KEYS.test(key) && typeof value === "string") return value.slice(0, 100);
  if (CONTENT_KEYS.test(key) || EMAIL_KEYS.test(key)) return "[REDACTED]";
  if (SENSITIVE_CONTEXT_KEYS.test(key)) return "[REDACTED]";
  if (USER_ID_KEYS.test(key) && typeof value === "string") {
    return await pseudonymizeIdentifier(value);
  }
  if (typeof value === "string") return redactSensitiveString(value);
  if (typeof value === "number" || typeof value === "boolean" || value == null) return value;
  if (Array.isArray(value)) {
    return await Promise.all(value.slice(0, 50).map((entry) => scrubValue(entry, key, depth + 1)));
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (
      const [childKey, childValue] of Object.entries(value as Record<string, unknown>).slice(0, 100)
    ) {
      result[childKey] = await scrubValue(childValue, childKey, depth + 1);
    }
    return result;
  }
  return redactSensitiveString(String(value));
}

/** Exported only so privacy regression tests exercise the exact Sentry path. */
export async function scrubSentryValueForTest(value: unknown): Promise<unknown> {
  return await scrubValue(value);
}

function parseDsn(dsn: string): SentryDsn | null {
  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    const projectId = url.pathname.replace(/^\//, "");
    if (!publicKey || !projectId) return null;
    return {
      publicKey,
      host: url.host,
      projectId,
      protocol: url.protocol.replace(":", ""),
    };
  } catch {
    return null;
  }
}

const DSN = Deno.env.get("SENTRY_DSN") ?? "";
const ENVIRONMENT = Deno.env.get("SENTRY_ENVIRONMENT") ?? "production";
const RELEASE = Deno.env.get("SENTRY_RELEASE") ?? "rumo-pragas-edge";
// App discriminator tag stamped on EVERY event/transaction. The jxcn project
// ships a single project-level SENTRY_DSN secret shared across all AgroRumo
// apps' edge functions, so this project can receive events from sibling apps
// and vice-versa. Tagging every event with `app` lets Sentry triage filter by
// app even before a dedicated per-app DSN/project is provisioned (the durable
// fix — a CEO-gated jxcn secret change). Override per function via SENTRY_APP.
const APP = Deno.env.get("SENTRY_APP") ?? Deno.env.get("APP_KEY") ?? "rumo-pragas";
const parsed = DSN ? parseDsn(DSN) : null;

async function sendToSentry(
  payload: Record<string, unknown>,
): Promise<void> {
  if (!parsed) return; // No DSN configured — silent no-op (dev / tests)
  try {
    // Stamp the app discriminator onto every event's tags (see APP note).
    const taggedPayload = await scrubValue({
      ...payload,
      tags: {
        app: APP,
        ...(payload.tags as Record<string, string> | undefined),
      },
    }) as Record<string, unknown>;
    const envelopeHeader = JSON.stringify({
      event_id: taggedPayload.event_id,
      sent_at: new Date().toISOString(),
      dsn: DSN,
    });
    // Envelope item type must match the event kind: 'transaction' for spans
    // (AI monitoring), 'event' for errors/messages.
    const itemType = (taggedPayload.type as string | undefined) ?? "event";
    const itemHeader = JSON.stringify({ type: itemType });
    const body = `${envelopeHeader}\n${itemHeader}\n${JSON.stringify(taggedPayload)}`;
    const url =
      `${parsed.protocol}://${parsed.host}/api/${parsed.projectId}/envelope/?sentry_key=${parsed.publicKey}&sentry_version=7`;
    // We deliberately do NOT await this in the hot path — but the caller
    // already awaits us with a short timeout. AbortController guarantees we
    // don't keep the worker alive longer than necessary.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    try {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-sentry-envelope" },
        body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    // never propagate
  }
}

function uuid(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export interface CaptureContext {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  level?: "fatal" | "error" | "warning" | "info" | "debug";
  user?: { id?: string };
}

export async function captureException(
  error: unknown,
  context: CaptureContext = {},
): Promise<void> {
  const err = error instanceof Error ? error : new Error(String(error));
  await sendToSentry({
    event_id: uuid(),
    timestamp: Date.now() / 1000,
    platform: "javascript",
    environment: ENVIRONMENT,
    release: RELEASE,
    level: context.level ?? "error",
    tags: context.tags,
    extra: context.extra,
    user: context.user,
    exception: {
      values: [
        {
          type: err.name,
          value: err.message,
          stacktrace: err.stack
            ? { frames: [{ filename: "edge", function: err.stack }] }
            : undefined,
        },
      ],
    },
  });
}

export async function captureMessage(
  message: string,
  context: CaptureContext = {},
): Promise<void> {
  await sendToSentry({
    event_id: uuid(),
    timestamp: Date.now() / 1000,
    platform: "javascript",
    environment: ENVIRONMENT,
    release: RELEASE,
    level: context.level ?? "info",
    tags: context.tags,
    extra: context.extra,
    user: context.user,
    message: { formatted: message },
  });
}

/**
 * Shorthand for ZERO-O catch-blocks: `logError(err, { tags: { feature: 'x' } })`.
 */
export async function logError(error: unknown, context: CaptureContext = {}): Promise<void> {
  await captureException(error, context);
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface GenAiRequest {
  /** Model identifier, e.g. 'claude-haiku-4-5-20251001'. */
  model: string;
  /** Anthropic usage.input_tokens (undefined → 0). */
  inputTokens?: number;
  /** Anthropic usage.output_tokens (undefined → 0). */
  outputTokens?: number;
  /** Wall-clock latency of the LLM call, in ms. */
  durationMs?: number;
  /** gen_ai.operation.name — 'chat' (text) or 'vision' (image), etc. */
  operation?: string;
  /** Extra tags (e.g. { fn: 'diagnose' }). */
  tags?: Record<string, string>;
  /** Provider identifier for Sentry semantic conventions. */
  provider?: "anthropic" | "google" | "agrio";
  /** false → span status internal_error (upstream failure). */
  ok?: boolean;
}

/**
 * Manual gen_ai.request instrumentation for Sentry AI Agent Monitoring.
 *
 * These edge functions call the Anthropic Messages API via raw `fetch` (not
 * @anthropic-ai/sdk), so Sentry's auto-integration is unavailable — we emit a
 * `transaction` envelope whose root span carries the gen_ai.* attributes Sentry
 * aggregates into token/cost/latency dashboards.
 *
 * PII: we deliberately capture ONLY the model + token counts + latency. Prompt
 * text, user images and completions are NEVER recorded (they are PII).
 * Best-effort; never throws.
 */
export async function captureGenAiRequest(usage: GenAiRequest): Promise<void> {
  const now = Date.now() / 1000;
  const start = now - (usage.durationMs ?? 0) / 1000;
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const operation = usage.operation ?? "chat";
  await sendToSentry({
    event_id: uuid(),
    type: "transaction",
    transaction: `gen_ai ${operation} ${usage.model}`,
    platform: "javascript",
    environment: ENVIRONMENT,
    release: RELEASE,
    start_timestamp: start,
    timestamp: now,
    tags: usage.tags,
    contexts: {
      trace: {
        trace_id: randomHex(16),
        span_id: randomHex(8),
        op: "gen_ai.request",
        origin: "manual",
        status: usage.ok === false ? "internal_error" : "ok",
        data: {
          "gen_ai.system": usage.provider ?? "anthropic",
          "gen_ai.operation.name": operation,
          "gen_ai.request.model": usage.model,
          "gen_ai.response.model": usage.model,
          "gen_ai.usage.input_tokens": inputTokens,
          "gen_ai.usage.output_tokens": outputTokens,
          "gen_ai.usage.total_tokens": inputTokens + outputTokens,
        },
      },
    },
    spans: [],
  });
}

/**
 * HOC that wraps a Deno serve handler with Sentry capture for any uncaught
 * exception, plus a `requestId` header injection for log correlation.
 *
 *   serve(withSentry('send-push', async (req) => { ... }))
 *
 * On success returns the handler's response.
 * On throw returns 500 with a JSON error body and captures the exception.
 * Never re-throws.
 */
export function withSentry<Req extends Request>(
  fnName: string,
  handler: (req: Req, ctx: { requestId: string }) => Promise<Response>,
): (req: Req) => Promise<Response> {
  return async (req: Req) => {
    const requestId = crypto.randomUUID();
    try {
      const res = await handler(req, { requestId });
      // Tack the request id onto the response for log correlation
      const headers = new Headers(res.headers);
      headers.set("X-Request-Id", requestId);
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers,
      });
    } catch (err) {
      await captureException(err, {
        tags: { fn: fnName, requestId },
        level: "error",
      });
      return new Response(
        JSON.stringify({
          ok: false,
          error: "internal_error",
          requestId,
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "X-Request-Id": requestId,
          },
        },
      );
    }
  };
}
