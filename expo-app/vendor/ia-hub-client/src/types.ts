/**
 * Public TypeScript types for the Rumo IA Hub SDK.
 *
 * Naming follows the v1 IA Hub OpenAPI contract. Endpoints not yet implemented
 * server-side (diagnose / forecast / recommend / validate) have type stubs
 * here so callers can program against them; the network layer will return
 * 404 until the corresponding Next.js route exists.
 */

/* ------------------------------------------------------------------ */
/* Shared                                                             */
/* ------------------------------------------------------------------ */

/** App slug — one per Rumo product (e.g. "rumo-maquinas", "rumo-pragas"). */
export type AppSlug =
  | "rumo-maquinas"
  | "rumo-pragas"
  | "rumo-confinamento"
  | "rumo-vet"
  | "rumo-financeiro"
  | "rumo-lavouras"
  | (string & { readonly __brand?: "AppSlug" });

export interface RequestOptions {
  /** Abort the request. Compatible with React Native (RN polyfills AbortController). */
  signal?: AbortSignal | undefined;
  /** Timeout in ms. Defaults to client.timeoutMs. */
  timeoutMs?: number | undefined;
  /** Extra HTTP headers (case-insensitive). */
  headers?: Record<string, string> | undefined;
  /** Override appSlug for this call only. */
  appSlug?: AppSlug | undefined;
  /** Stable id for idempotent retries. The IA Hub dedupes by this header. */
  idempotencyKey?: string | undefined;
}

/** Lightweight payload shape for file uploads — RN / Web / Node compatible. */
export type FileUpload =
  | Blob
  | File
  | {
      /** file:// URI (React Native) or remote https:// URL. */
      uri: string;
      /** MIME type, e.g. "image/jpeg". */
      type: string;
      /** File name as it should appear on the server. */
      name: string;
    };

/* ------------------------------------------------------------------ */
/* /chat                                                              */
/* ------------------------------------------------------------------ */

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  /** Stable id per message; SDK generates one if missing. */
  id?: string;
  role: ChatRole;
  /** Plain string OR rich UIMessage parts (AI SDK v6 compatible). */
  content: string | ChatMessagePart[];
}

export type ChatMessagePart =
  | { type: "text"; text: string }
  | { type: "image"; url: string; mimeType?: string }
  | { type: "tool-call"; toolName: string; args: Record<string, unknown> }
  | { type: "tool-result"; toolName: string; result: unknown };

export interface ChatInput {
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

export interface ChatResponse {
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

export interface ChatToolCall {
  serverSlug: string;
  toolName: string;
  args: Record<string, unknown>;
  ok: boolean;
  latencyMs: number;
}

export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/** Streaming event. Shape mirrors AI SDK v6 UIMessageStream. */
export type ChatChunk =
  | { type: "text-delta"; text: string }
  | { type: "tool-call"; toolName: string; args: Record<string, unknown> }
  | { type: "tool-result"; toolName: string; result: unknown }
  | { type: "finish"; usage?: ChatUsage }
  | { type: "error"; message: string };

/* ------------------------------------------------------------------ */
/* /diagnose                                                          */
/* ------------------------------------------------------------------ */

export interface DiagnoseInput {
  /** Free-text symptoms or query (e.g. "manchas amarelas na soja R3"). */
  prompt?: string;
  /** Image(s) for vision diagnose (e.g. pragas-ia, vet). */
  images?: FileUpload[];
  /** Structured context the model should use (crop, animal, location, etc). */
  context?: Record<string, unknown>;
  /** Optional conversation id for memory continuity. */
  conversationId?: string;
}

export interface DiagnoseResponse {
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

/* ------------------------------------------------------------------ */
/* /forecast                                                          */
/* ------------------------------------------------------------------ */

export interface ForecastInput {
  /** Forecast kind, e.g. "gmd", "yield", "milk", "rain". */
  kind: string;
  /** Time horizon in days. */
  horizonDays: number;
  /** Series data + structured features. */
  features: Record<string, unknown>;
}

export interface ForecastResponse {
  kind: string;
  horizonDays: number;
  points: Array<{ t: string; value: number; lo?: number; hi?: number }>;
  modelVersion: string;
  requestId?: string;
}

/* ------------------------------------------------------------------ */
/* /recommend                                                         */
/* ------------------------------------------------------------------ */

export interface RecommendInput {
  /** Domain: "input-protocol", "next-action", "sku", "creative", ... */
  domain: string;
  context: Record<string, unknown>;
  /** Max recommendations to return. */
  topK?: number;
}

export interface RecommendResponse {
  items: Array<{
    id: string;
    title: string;
    score: number;
    rationale?: string;
    payload?: Record<string, unknown>;
  }>;
  requestId?: string;
}

/* ------------------------------------------------------------------ */
/* /validate                                                          */
/* ------------------------------------------------------------------ */

export interface ValidateInput {
  /** What to validate, e.g. "machine-record", "tank-level", "rx-prescription". */
  kind: string;
  payload: Record<string, unknown>;
}

export interface ValidateResponse {
  ok: boolean;
  errors?: Array<{ path: string; message: string }>;
  warnings?: Array<{ path: string; message: string }>;
  /** Suggested corrected payload, when the model can repair the input. */
  suggested?: Record<string, unknown>;
  requestId?: string;
}
