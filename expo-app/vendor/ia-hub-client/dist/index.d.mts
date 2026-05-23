/**
 * Public TypeScript types for the Rumo IA Hub SDK.
 *
 * Naming follows the v1 IA Hub OpenAPI contract. Endpoints not yet implemented
 * server-side (diagnose / forecast / recommend / validate) have type stubs
 * here so callers can program against them; the network layer will return
 * 404 until the corresponding Next.js route exists.
 */
/** App slug — one per Rumo product (e.g. "rumo-maquinas", "rumo-pragas"). */
type AppSlug = "rumo-maquinas" | "rumo-pragas" | "rumo-confinamento" | "rumo-vet" | "rumo-financeiro" | "rumo-lavouras" | (string & {
    readonly __brand?: "AppSlug";
});
interface RequestOptions {
    /** Abort the request. Compatible with React Native (RN polyfills AbortController). */
    signal?: AbortSignal;
    /** Timeout in ms. Defaults to client.timeoutMs. */
    timeoutMs?: number;
    /** Extra HTTP headers (case-insensitive). */
    headers?: Record<string, string>;
    /** Override appSlug for this call only. */
    appSlug?: AppSlug;
    /** Stable id for idempotent retries. The IA Hub dedupes by this header. */
    idempotencyKey?: string;
}
/** Lightweight payload shape for file uploads — RN / Web / Node compatible. */
type FileUpload = Blob | File | {
    /** file:// URI (React Native) or remote https:// URL. */
    uri: string;
    /** MIME type, e.g. "image/jpeg". */
    type: string;
    /** File name as it should appear on the server. */
    name: string;
};
type ChatRole = "system" | "user" | "assistant" | "tool";
interface ChatMessage {
    /** Stable id per message; SDK generates one if missing. */
    id?: string;
    role: ChatRole;
    /** Plain string OR rich UIMessage parts (AI SDK v6 compatible). */
    content: string | ChatMessagePart[];
}
type ChatMessagePart = {
    type: "text";
    text: string;
} | {
    type: "image";
    url: string;
    mimeType?: string;
} | {
    type: "tool-call";
    toolName: string;
    args: Record<string, unknown>;
} | {
    type: "tool-result";
    toolName: string;
    result: unknown;
};
interface ChatInput {
    messages: ChatMessage[];
    /** Conversation id — server uses for memory + audit. New conversation if omitted. */
    conversationId?: string;
    /**
     * App slug override. When the client was constructed with `appSlug`,
     * this overrides it for the single call (useful when one IA Hub-aware
     * shell app brokers requests for multiple Rumo products).
     */
    appSlug?: AppSlug;
}
interface ChatResponse {
    /** Final assistant message text (concatenated from all stream parts). */
    text: string;
    /** Conversation id assigned/echoed by the server. */
    conversationId: string;
    /** Tool calls performed during the turn (for UI breadcrumbs). */
    toolCalls?: ChatToolCall[];
    /** Server-assigned request id (echoes X-Request-Id header). */
    requestId?: string;
    /** Token usage if reported. */
    usage?: ChatUsage;
}
interface ChatToolCall {
    serverSlug: string;
    toolName: string;
    args: Record<string, unknown>;
    ok: boolean;
    latencyMs: number;
}
interface ChatUsage {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
}
/** Streaming event. Shape mirrors AI SDK v6 UIMessageStream. */
type ChatChunk = {
    type: "text-delta";
    text: string;
} | {
    type: "tool-call";
    toolName: string;
    args: Record<string, unknown>;
} | {
    type: "tool-result";
    toolName: string;
    result: unknown;
} | {
    type: "finish";
    usage?: ChatUsage;
} | {
    type: "error";
    message: string;
};
interface DiagnoseInput {
    /** Free-text symptoms or query (e.g. "manchas amarelas na soja R3"). */
    prompt?: string;
    /** Image(s) for vision diagnose (e.g. pragas-ia, vet). */
    images?: FileUpload[];
    /** Structured context the model should use (crop, animal, location, etc). */
    context?: Record<string, unknown>;
    /** Optional conversation id for memory continuity. */
    conversationId?: string;
}
interface DiagnoseResponse {
    diagnosis: string;
    confidence: number;
    candidates: Array<{
        label: string;
        confidence: number;
        rationale?: string;
    }>;
    recommendations?: string[];
    requestId?: string;
}
interface ForecastInput {
    /** Forecast kind, e.g. "gmd", "yield", "milk", "rain". */
    kind: string;
    /** Time horizon in days. */
    horizonDays: number;
    /** Series data + structured features. */
    features: Record<string, unknown>;
}
interface ForecastResponse {
    kind: string;
    horizonDays: number;
    points: Array<{
        t: string;
        value: number;
        lo?: number;
        hi?: number;
    }>;
    modelVersion: string;
    requestId?: string;
}
interface RecommendInput {
    /** Domain: "input-protocol", "next-action", "sku", "creative", ... */
    domain: string;
    context: Record<string, unknown>;
    /** Max recommendations to return. */
    topK?: number;
}
interface RecommendResponse {
    items: Array<{
        id: string;
        title: string;
        score: number;
        rationale?: string;
        payload?: Record<string, unknown>;
    }>;
    requestId?: string;
}
interface ValidateInput {
    /** What to validate, e.g. "machine-record", "tank-level", "rx-prescription". */
    kind: string;
    payload: Record<string, unknown>;
}
interface ValidateResponse {
    ok: boolean;
    errors?: Array<{
        path: string;
        message: string;
    }>;
    warnings?: Array<{
        path: string;
        message: string;
    }>;
    /** Suggested corrected payload, when the model can repair the input. */
    suggested?: Record<string, unknown>;
    requestId?: string;
}

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

interface RumoIAHubClientOptions {
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
interface InternalRequest {
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    path: string;
    /** JSON body (preferred). Mutually exclusive with `formData`. */
    json?: unknown;
    /** Multipart form (for vision uploads). */
    formData?: FormData;
    /** Request opts forwarded from the public method. */
    options?: RequestOptions;
    /** Tag for telemetry/error context. */
    endpoint: string;
    /** When true, return the raw Response (no JSON parse) — used by stream(). */
    raw?: boolean;
}
declare class RumoIAHubClient {
    readonly baseUrl: string;
    readonly appSlug: AppSlug;
    readonly timeoutMs: number;
    readonly maxRetries: number;
    readonly userId?: string;
    readonly debug: boolean;
    private readonly apiKey;
    private readonly fetchImpl;
    private readonly userAgent;
    private readonly defaultHeaders;
    constructor(opts: RumoIAHubClientOptions);
    /** Internal: perform a JSON request with retries + timeout + error normalisation. */
    request<T>(req: InternalRequest): Promise<T>;
    /** Internal: returns the raw Response after retry loop + error mapping. */
    requestRaw(req: InternalRequest): Promise<Response>;
    /** Builds the canonical request headers for the IA Hub. */
    private buildHeaders;
}
/**
 * Builds a multipart FormData from a JSON payload + named file uploads.
 * Handles the three FileUpload shapes (Blob, File, RN {uri,type,name}).
 */
declare function buildMultipart(json: Record<string, unknown>, files: Record<string, FileUpload | FileUpload[] | undefined>): FormData;

/**
 * Error classes for the Rumo IA Hub SDK.
 *
 * Pattern mirrors Stripe / Anthropic / OpenAI SDKs: every error thrown by the
 * client extends `RumoIAError` so callers can use a single `instanceof` check
 * to handle anything SDK-originated. Specific subclasses carry structured
 * context (status, code, request_id) for telemetry.
 */
interface RumoIAErrorInit {
    message: string;
    status?: number;
    code?: string;
    requestId?: string;
    cause?: unknown;
    /** Endpoint slug (e.g. "chat", "diagnose") for breadcrumb tagging. */
    endpoint?: string;
}
declare class RumoIAError extends Error {
    readonly status?: number;
    readonly code?: string;
    readonly requestId?: string;
    readonly endpoint?: string;
    constructor(init: RumoIAErrorInit);
}
/** Request never left the device (network down, fetch threw, RN offline). */
declare class RumoIANetworkError extends RumoIAError {
    constructor(init: RumoIAErrorInit);
}
/** HTTP 4xx — caller's fault (validation, bad input). */
declare class RumoIAClientError extends RumoIAError {
    constructor(init: RumoIAErrorInit);
}
/** HTTP 401 / 403 — invalid API key, missing X-App-Slug, scope mismatch. */
declare class RumoIAAuthError extends RumoIAClientError {
    constructor(init: RumoIAErrorInit);
}
/** HTTP 429 — caller exceeded rate limit. */
declare class RumoIARateLimitError extends RumoIAClientError {
    readonly retryAfterSec?: number;
    constructor(init: RumoIAErrorInit & {
        retryAfterSec?: number;
    });
}
/** HTTP 5xx — IA Hub is sick. SDK retries automatically with backoff. */
declare class RumoIAServerError extends RumoIAError {
    constructor(init: RumoIAErrorInit);
}
/** Streaming connection dropped mid-flight, or SSE parse failed. */
declare class RumoIAStreamError extends RumoIAError {
    constructor(init: RumoIAErrorInit);
}
/** Aborted by AbortSignal — not really an error, but easier to handle as one. */
declare class RumoIAAbortError extends RumoIAError {
    constructor(init: RumoIAErrorInit);
}

/**
 * @agrorumo/ia-hub-client — public entry.
 *
 * Universal SDK for the Rumo IA Hub. Works in:
 *   - React Native (Hermes)
 *   - Next.js (App Router, Server Components, Route Handlers, Edge)
 *   - Browsers
 *   - Node ≥18
 *
 * Quick start:
 *
 *   import { RumoIAHub } from "@agrorumo/ia-hub-client";
 *
 *   const ia = new RumoIAHub({
 *     apiKey: process.env.RUMO_IA_HUB_API_KEY!,
 *     appSlug: "rumo-pragas",
 *   });
 *
 *   const r = await ia.chat({
 *     messages: [{ role: "user", content: "Quais máquinas estão paradas?" }],
 *   });
 *   console.log(r.text);
 *
 * Streaming:
 *
 *   for await (const c of ia.chatStream({ messages })) {
 *     if (c.type === "text-delta") process.stdout.write(c.text);
 *   }
 */

/**
 * High-level client. Composes the low-level RumoIAHubClient transport with
 * one method per endpoint. Mirrors the ergonomic shape of Stripe / OpenAI /
 * Anthropic SDKs.
 */
declare class RumoIAHub {
    private readonly _client;
    constructor(opts: RumoIAHubClientOptions);
    /** Underlying transport — useful when consumers need custom requests. */
    get client(): RumoIAHubClient;
    /** Non-streaming chat. Returns the full assistant response. */
    chat(input: ChatInput, opts?: RequestOptions): Promise<ChatResponse>;
    /** Streaming chat. Returns an AsyncGenerator of incremental events. */
    chatStream(input: ChatInput, opts?: RequestOptions): AsyncGenerator<ChatChunk>;
    /** Vision-or-text diagnosis (pragas, vet, confinamento). */
    diagnose(input: DiagnoseInput, opts?: RequestOptions): Promise<DiagnoseResponse>;
    /** Time-series forecast (gmd, yield, milk, rain). */
    forecast(input: ForecastInput, opts?: RequestOptions): Promise<ForecastResponse>;
    /** Ranked recommendations (input-protocol, next-action, creative). */
    recommend(input: RecommendInput, opts?: RequestOptions): Promise<RecommendResponse>;
    /** Schema + semantic validation (records, levels, prescriptions). */
    validate(input: ValidateInput, opts?: RequestOptions): Promise<ValidateResponse>;
}

export { type AppSlug, type ChatChunk, type ChatInput, type ChatMessage, type ChatMessagePart, type ChatResponse, type ChatRole, type ChatToolCall, type ChatUsage, type DiagnoseInput, type DiagnoseResponse, type FileUpload, type ForecastInput, type ForecastResponse, type InternalRequest, type RecommendInput, type RecommendResponse, type RequestOptions, RumoIAAbortError, RumoIAAuthError, RumoIAClientError, RumoIAError, RumoIAHub, RumoIAHubClient, type RumoIAHubClientOptions, RumoIANetworkError, RumoIARateLimitError, RumoIAServerError, RumoIAStreamError, type ValidateInput, type ValidateResponse, buildMultipart };
