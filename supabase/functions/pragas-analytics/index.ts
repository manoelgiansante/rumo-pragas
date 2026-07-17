import {
  consumeDurableRateLimit,
  fingerprintRateLimitRequest,
  rateLimitHeaders,
} from "../_shared/durable-rate-limit.ts";
import {
  authenticatePragasRequest,
  createPragasAdminClient,
  getPragasAppAccessState,
  getPragasCorsHeaders,
  jsonResponse,
} from "../_shared/pragas-edge.ts";
import { captureException, withSentry } from "../_shared/pragas-sentry.ts";

const APP_KEY = "rumo-pragas";
const RATE_LIMIT = 30;
const MAX_BODY_BYTES = 512 * 1024;
const MAX_EVENTS = 100;
const MAX_PROPERTIES_BYTES = 10_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_PATTERN = /^[A-Za-z0-9_.:-]{1,120}$/;
const PLATFORM_PATTERN = /^[A-Za-z0-9_.-]{1,32}$/;
const ALLOWED_EVENT_KEYS = new Set([
  "eventId",
  "event",
  "properties",
  "timestamp",
  "platform",
]);

interface AnalyticsEventInput {
  eventId: string;
  event: string;
  properties: Record<string, unknown>;
  timestamp: string;
  platform: string;
}

class AnalyticsInputError extends Error {
  constructor(readonly code: string, readonly status = 400) {
    super(code);
    this.name = "AnalyticsInputError";
  }
}

function requireUUID(value: string | null): string | null {
  const candidate = value?.trim() ?? "";
  return UUID_PATTERN.test(candidate) ? candidate.toLowerCase() : null;
}

async function readBoundedJSON(req: Request): Promise<unknown> {
  const declared = Number(req.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new AnalyticsInputError("payload_too_large", 413);
  }
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength > MAX_BODY_BYTES) {
    throw new AnalyticsInputError("payload_too_large", 413);
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new AnalyticsInputError("invalid_json");
  }
}

function parseEvent(value: unknown): AnalyticsEventInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AnalyticsInputError("invalid_event");
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !ALLOWED_EVENT_KEYS.has(key))) {
    throw new AnalyticsInputError("invalid_event_schema");
  }
  if (typeof input.eventId !== "string" || !UUID_PATTERN.test(input.eventId)) {
    throw new AnalyticsInputError("invalid_event_id");
  }
  if (typeof input.event !== "string" || !EVENT_PATTERN.test(input.event)) {
    throw new AnalyticsInputError("invalid_event_name");
  }
  if (typeof input.platform !== "string" || !PLATFORM_PATTERN.test(input.platform)) {
    throw new AnalyticsInputError("invalid_platform");
  }
  if (typeof input.timestamp !== "string") {
    throw new AnalyticsInputError("invalid_timestamp");
  }
  const timestamp = new Date(input.timestamp);
  const now = Date.now();
  if (
    Number.isNaN(timestamp.getTime()) ||
    timestamp.getTime() < now - 30 * 24 * 60 * 60 * 1_000 ||
    timestamp.getTime() > now + 5 * 60 * 1_000
  ) {
    throw new AnalyticsInputError("invalid_timestamp");
  }
  const properties = input.properties ?? {};
  if (typeof properties !== "object" || properties === null || Array.isArray(properties)) {
    throw new AnalyticsInputError("invalid_properties");
  }
  if (new TextEncoder().encode(JSON.stringify(properties)).byteLength > MAX_PROPERTIES_BYTES) {
    throw new AnalyticsInputError("properties_too_large", 413);
  }
  return {
    eventId: input.eventId.toLowerCase(),
    event: input.event,
    properties: properties as Record<string, unknown>,
    timestamp: timestamp.toISOString(),
    platform: input.platform,
  };
}

function parseBatch(value: unknown): AnalyticsEventInput[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AnalyticsInputError("invalid_body");
  }
  const body = value as Record<string, unknown>;
  if (Object.keys(body).length !== 1 || !Array.isArray(body.events)) {
    throw new AnalyticsInputError("invalid_body_schema");
  }
  if (body.events.length < 1 || body.events.length > MAX_EVENTS) {
    throw new AnalyticsInputError("invalid_batch_size");
  }
  return body.events.map(parseEvent);
}

Deno.serve(withSentry("pragas-analytics", async (req, { requestId }) => {
  const cors = getPragasCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, {
      status: 405,
      headers: cors,
      requestId,
    });
  }

  const idempotencyKey = requireUUID(req.headers.get("Idempotency-Key"));
  if (!idempotencyKey) {
    return jsonResponse({ error: "invalid_idempotency_key" }, {
      status: 400,
      headers: cors,
      requestId,
    });
  }

  const admin = createPragasAdminClient();
  const user = await authenticatePragasRequest(req, admin);
  if (!user) {
    return jsonResponse({ error: "unauthorized" }, { status: 401, headers: cors, requestId });
  }
  const access = await getPragasAppAccessState(admin, user.id);
  if (access.state !== "active") {
    const status = access.state === "deleted_reactivation_required"
      ? 410
      : access.state === "deletion_pending" || access.state === "unlinked"
      ? 409
      : 503;
    return jsonResponse({ error: access.state }, { status, headers: cors, requestId });
  }

  const requestHash = await fingerprintRateLimitRequest(req, MAX_BODY_BYTES);
  if (!requestHash) {
    return jsonResponse({ error: "payload_too_large" }, { status: 413, headers: cors, requestId });
  }

  const rate = await consumeDurableRateLimit(admin, {
    userId: user.id,
    scope: "analytics",
    limit: RATE_LIMIT,
    windowSeconds: 60,
    idempotencyKey,
    requestHash,
  });
  if (!rate) {
    return jsonResponse({ error: "temporarily_unavailable" }, {
      status: 503,
      headers: { ...cors, "Retry-After": "30" },
      requestId,
    });
  }
  const headers = { ...cors, ...rateLimitHeaders(RATE_LIMIT, rate) };
  if (rate.conflict) {
    return jsonResponse({ error: "idempotency_key_conflict" }, { status: 409, headers, requestId });
  }
  if (!rate.allowed) {
    return jsonResponse({ error: "rate_limit_exceeded" }, {
      status: 429,
      headers: { ...headers, "Retry-After": String(Math.max(1, rate.retryAfterSeconds)) },
      requestId,
    });
  }

  let events: AnalyticsEventInput[];
  try {
    events = parseBatch(await readBoundedJSON(req));
  } catch (error) {
    if (error instanceof AnalyticsInputError) {
      return jsonResponse({ error: error.code }, {
        status: error.status,
        headers,
        requestId,
      });
    }
    return jsonResponse({ error: "invalid_body" }, { status: 400, headers, requestId });
  }

  const { data, error } = await admin.rpc("record_pragas_analytics_events", {
    p_user_id: user.id,
    p_events: events.map((event) => ({
      event_id: event.eventId,
      event: event.event,
      properties: event.properties,
      timestamp: event.timestamp,
      platform: event.platform,
    })),
  });
  if (error || typeof data !== "object" || data === null) {
    await captureException(new Error("analytics_ingest_unavailable"), {
      tags: { fn: APP_KEY + "-analytics", step: "record_batch" },
    });
    return jsonResponse({ error: "analytics_unavailable" }, {
      status: 503,
      headers: { ...headers, "Retry-After": "30" },
      requestId,
    });
  }
  const result = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>;
  return jsonResponse({
    received: true,
    accepted: Number(result.accepted ?? events.length),
    inserted: Number(result.inserted ?? 0),
    duplicates: Number(result.duplicates ?? 0),
  }, { headers, requestId });
}));
