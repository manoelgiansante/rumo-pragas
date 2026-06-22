/**
 * RumoIAHubClient — universal HTTP transport for the IA Hub API.
 *
 * Design notes:
 *  - Uses global `fetch` only. No axios, no node-fetch. Works in:
 *      • Node ≥18 (built-in fetch)
 *      • Browsers (window.fetch)
 *      • React Native (Hermes / JSC have fetch + AbortController)
 *      • Next.js Server Components / Route Handlers
 *      • Vercel Edge runtime
 *  - File uploads accept three shapes (Blob, File, RN-style `{uri,type,name}`)
 *    and build a FormData when needed. We do NOT import `form-data` — the
 *    runtime FormData is everywhere we care about as of 2026.
 *  - SSE streaming is implemented with the `Response.body` ReadableStream.
 *    React Native's fetch *can* return a readable stream when
 *    `reactNativeBlobUtil` polyfill is loaded; the SDK falls back to
 *    `response.text()` when stream is absent so the call still completes.
 *  - Errors are normalised to the `RumoIAError` hierarchy (errors.ts).
 *  - Retries: 5xx + 429 with exponential backoff (max 3). Honours Retry-After.
 */

import {
  RumoIAAbortError,
  RumoIAAuthError,
  RumoIAClientError,
  RumoIAError,
  RumoIANetworkError,
  RumoIARateLimitError,
  RumoIAServerError,
} from "./errors";
import type { AppSlug, FileUpload, RequestOptions } from "./types";

export interface RumoIAHubClientOptions {
  /** Required. IA Hub API key (scoped per-app). */
  apiKey: string;
  /** Required. Slug of the calling Rumo product (sent as X-App-Slug). */
  appSlug: AppSlug;
  /** Defaults to https://hub.agrorumo.com. */
  baseUrl?: string;
  /** Default per-request timeout (ms). Defaults to 60_000. */
  timeoutMs?: number;
  /** Default max retry attempts for 5xx/429. Defaults to 3. */
  maxRetries?: number;
  /** User agent suffix appended to the default `@agrorumo/ia-hub-client/<v>`. */
  userAgentSuffix?: string;
  /** Inject a fetch impl (tests). Defaults to globalThis.fetch. */
  fetch?: typeof fetch;
  /** Optional Supabase user id; sent as X-Rumo-User-Id (matches IA Hub auth). */
  userId?: string;
  /** Optional default headers added to every request. */
  defaultHeaders?: Record<string, string>;
  /** When true, log every request to console (dev only). */
  debug?: boolean;
}

const DEFAULT_BASE_URL = "https://hub.agrorumo.com";
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 3;
const SDK_VERSION = "0.1.0";

export interface InternalRequest {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  /** JSON body (preferred). Mutually exclusive with `formData`. */
  json?: unknown;
  /** Multipart form (for vision uploads). */
  formData?: FormData;
  /** Request opts forwarded from the public method. */
  options?: RequestOptions | undefined;
  /** Tag for telemetry/error context. */
  endpoint: string;
  /** When true, return the raw Response (no JSON parse) — used by stream(). */
  raw?: boolean;
}

export class RumoIAHubClient {
  public readonly baseUrl: string;
  public readonly appSlug: AppSlug;
  public readonly timeoutMs: number;
  public readonly maxRetries: number;
  public readonly userId?: string | undefined;
  public readonly debug: boolean;

  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;
  private readonly defaultHeaders: Record<string, string>;

  constructor(opts: RumoIAHubClientOptions) {
    if (!opts || typeof opts !== "object") {
      throw new RumoIAError({
        message: "RumoIAHubClient: missing options object.",
      });
    }
    if (!opts.apiKey || typeof opts.apiKey !== "string") {
      throw new RumoIAError({ message: "RumoIAHubClient: apiKey is required." });
    }
    if (!opts.appSlug || typeof opts.appSlug !== "string") {
      throw new RumoIAError({
        message: "RumoIAHubClient: appSlug is required.",
      });
    }
    const fetchImpl = opts.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
      throw new RumoIAError({
        message:
          "RumoIAHubClient: no fetch impl found. On Node <18 pass `fetch` explicitly.",
      });
    }
    this.apiKey = opts.apiKey;
    this.appSlug = opts.appSlug;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.fetchImpl = fetchImpl.bind(globalThis);
    this.userAgent = buildUserAgent(opts.userAgentSuffix);
    this.userId = opts.userId;
    this.defaultHeaders = opts.defaultHeaders ?? {};
    this.debug = opts.debug ?? false;
  }

  /** Internal: perform a JSON request with retries + timeout + error normalisation. */
  async request<T>(req: InternalRequest): Promise<T> {
    const res = await this.requestRaw(req);
    if (req.raw) return res as unknown as T;
    // 204 No Content → return null cast
    if (res.status === 204) return null as unknown as T;
    const text = await res.text();
    if (!text) return null as unknown as T;
    try {
      return JSON.parse(text) as T;
    } catch (err) {
      throw new RumoIAError({
        message: `Invalid JSON response from ${req.endpoint}`,
        status: res.status,
        endpoint: req.endpoint,
        cause: err,
      });
    }
  }

  /** Internal: returns the raw Response after retry loop + error mapping. */
  async requestRaw(req: InternalRequest): Promise<Response> {
    const url = `${this.baseUrl}${req.path}`;
    const headers = this.buildHeaders(req);

    let body: BodyInit | undefined;
    if (req.formData) {
      body = req.formData;
      // Let fetch set the multipart boundary automatically.
      delete (headers as Record<string, string>)["content-type"];
    } else if (req.json !== undefined) {
      body = JSON.stringify(req.json);
      headers["content-type"] = "application/json";
    }

    const timeoutMs = req.options?.timeoutMs ?? this.timeoutMs;
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.maxRetries) {
      const ctl = new AbortController();
      const onAbort = () => ctl.abort();
      if (req.options?.signal) {
        if (req.options.signal.aborted) {
          throw new RumoIAAbortError({
            message: "Request aborted before send.",
            endpoint: req.endpoint,
          });
        }
        req.options.signal.addEventListener("abort", onAbort, { once: true });
      }
      const timer = setTimeout(() => ctl.abort(), timeoutMs);

      try {
        if (this.debug) {
          // eslint-disable-next-line no-console
          console.log(`[ia-hub-client] ${req.method} ${url} attempt=${attempt}`);
        }
        const res = await this.fetchImpl(url, {
          method: req.method,
          headers,
          // Only set `body` when defined — omitting the key is the same as
          // passing `undefined` to fetch at runtime, but satisfies
          // exactOptionalPropertyTypes (RequestInit.body is BodyInit | null).
          ...(body !== undefined ? { body } : {}),
          signal: ctl.signal,
        });

        // Success path
        if (res.ok) return res;

        // Retryable?
        const retryable = res.status === 429 || res.status >= 500;
        if (retryable && attempt < this.maxRetries) {
          const wait = backoffMs(attempt, res.headers.get("retry-after"));
          attempt += 1;
          await sleep(wait);
          continue;
        }

        // Non-retryable or out of retries → throw structured error.
        throw await mapHttpError(res, req.endpoint);
      } catch (err) {
        // Distinguish abort vs network errors.
        if (isAbortError(err)) {
          if (req.options?.signal?.aborted) {
            throw new RumoIAAbortError({
              message: "Request aborted by caller.",
              endpoint: req.endpoint,
            });
          }
          if (attempt < this.maxRetries) {
            const wait = backoffMs(attempt, null);
            attempt += 1;
            await sleep(wait);
            lastError = err;
            continue;
          }
          throw new RumoIANetworkError({
            message: `Request timed out after ${timeoutMs}ms.`,
            endpoint: req.endpoint,
            cause: err,
          });
        }
        if (err instanceof RumoIAError) throw err;
        // Network-level failure (DNS, TLS, fetch threw)
        if (attempt < this.maxRetries) {
          const wait = backoffMs(attempt, null);
          attempt += 1;
          await sleep(wait);
          lastError = err;
          continue;
        }
        throw new RumoIANetworkError({
          message: `Network error contacting ${req.endpoint}: ${(err as Error)?.message ?? "unknown"}`,
          endpoint: req.endpoint,
          cause: err,
        });
      } finally {
        clearTimeout(timer);
        if (req.options?.signal) {
          req.options.signal.removeEventListener("abort", onAbort);
        }
      }
    }
    // Should be unreachable.
    throw new RumoIANetworkError({
      message: "Retry loop exhausted.",
      endpoint: req.endpoint,
      cause: lastError,
    });
  }

  /** Builds the canonical request headers for the IA Hub. */
  private buildHeaders(req: InternalRequest): Record<string, string> {
    const appSlug = req.options?.appSlug ?? this.appSlug;
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.apiKey}`,
      "x-app-slug": String(appSlug),
      "user-agent": this.userAgent,
      accept: "application/json",
      ...lowercaseKeys(this.defaultHeaders),
      ...lowercaseKeys(req.options?.headers),
    };
    if (this.userId) headers["x-rumo-user-id"] = this.userId;
    if (req.options?.idempotencyKey) {
      headers["idempotency-key"] = req.options.idempotencyKey;
    }
    return headers;
  }
}

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

function buildUserAgent(suffix?: string): string {
  const base = `@agrorumo/ia-hub-client/${SDK_VERSION}`;
  return suffix ? `${base} ${suffix}` : base;
}

function lowercaseKeys(
  obj: Record<string, string> | undefined,
): Record<string, string> {
  if (!obj) return {};
  const out: Record<string, string> = {};
  for (const k of Object.keys(obj)) out[k.toLowerCase()] = obj[k] as string;
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const n = Number(retryAfter);
    if (Number.isFinite(n) && n > 0) return Math.min(n * 1000, 30_000);
  }
  // 250ms, 500ms, 1s, 2s, capped at 8s, jittered ±20%
  const base = Math.min(250 * 2 ** attempt, 8_000);
  const jitter = 1 + (Math.random() * 0.4 - 0.2);
  return Math.round(base * jitter);
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const name = (err as any).name;
  return name === "AbortError" || name === "TimeoutError";
}

async function mapHttpError(res: Response, endpoint: string): Promise<RumoIAError> {
  const requestId = res.headers.get("x-request-id") ?? undefined;
  let message = `${res.status} ${res.statusText}`;
  let code: string | undefined;
  try {
    const text = await res.text();
    if (text) {
      try {
        const parsed = JSON.parse(text) as { error?: string; code?: string };
        if (parsed.error) message = parsed.error;
        if (parsed.code) code = parsed.code;
      } catch {
        message = text.slice(0, 500);
      }
    }
  } catch {
    // ignore
  }

  if (res.status === 401 || res.status === 403) {
    return new RumoIAAuthError({
      message,
      status: res.status,
      code,
      requestId,
      endpoint,
    });
  }
  if (res.status === 429) {
    const retryAfter = res.headers.get("retry-after");
    const retryAfterSec = retryAfter ? Number(retryAfter) : undefined;
    return new RumoIARateLimitError({
      message,
      status: res.status,
      code,
      requestId,
      endpoint,
      retryAfterSec:
        Number.isFinite(retryAfterSec) && (retryAfterSec ?? 0) > 0
          ? retryAfterSec
          : undefined,
    });
  }
  if (res.status >= 400 && res.status < 500) {
    return new RumoIAClientError({
      message,
      status: res.status,
      code,
      requestId,
      endpoint,
    });
  }
  return new RumoIAServerError({
    message,
    status: res.status,
    code,
    requestId,
    endpoint,
  });
}

/**
 * Builds a multipart FormData from a JSON payload + named file uploads.
 * Handles the three FileUpload shapes (Blob, File, RN {uri,type,name}).
 */
export function buildMultipart(
  json: Record<string, unknown>,
  files: Record<string, FileUpload | FileUpload[] | undefined>,
): FormData {
  const fd = new FormData();
  fd.append("payload", JSON.stringify(json));
  for (const [field, value] of Object.entries(files)) {
    if (!value) continue;
    const arr = Array.isArray(value) ? value : [value];
    for (const f of arr) appendFile(fd, field, f);
  }
  return fd;
}

function appendFile(fd: FormData, field: string, f: FileUpload): void {
  // Web File / Blob
  if (typeof Blob !== "undefined" && f instanceof Blob) {
    const name = (f as File).name ?? `${field}.bin`;
    fd.append(field, f, name);
    return;
  }
  // React Native shape: { uri, type, name }
  // RN's FormData accepts this object directly — it knows how to stream the file.
  // We cast to `any` because the DOM type definitions don't include this shape.
  if (
    typeof f === "object" &&
    f !== null &&
    "uri" in f &&
    "type" in f &&
    "name" in f
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fd.append(field, f as any);
    return;
  }
  throw new RumoIAError({
    message: `Unsupported FileUpload shape for field "${field}".`,
  });
}
