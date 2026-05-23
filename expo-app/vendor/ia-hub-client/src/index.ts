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

import {
  RumoIAHubClient,
  type RumoIAHubClientOptions,
} from "./client";
import { chat, chatStream } from "./chat";
import { diagnose } from "./diagnose";
import { forecast } from "./forecast";
import { recommend } from "./recommend";
import { validate } from "./validate";
import type {
  ChatChunk,
  ChatInput,
  ChatResponse,
  DiagnoseInput,
  DiagnoseResponse,
  ForecastInput,
  ForecastResponse,
  RecommendInput,
  RecommendResponse,
  RequestOptions,
  ValidateInput,
  ValidateResponse,
} from "./types";

/**
 * High-level client. Composes the low-level RumoIAHubClient transport with
 * one method per endpoint. Mirrors the ergonomic shape of Stripe / OpenAI /
 * Anthropic SDKs.
 */
export class RumoIAHub {
  private readonly _client: RumoIAHubClient;

  constructor(opts: RumoIAHubClientOptions) {
    this._client = new RumoIAHubClient(opts);
  }

  /** Underlying transport — useful when consumers need custom requests. */
  get client(): RumoIAHubClient {
    return this._client;
  }

  /** Non-streaming chat. Returns the full assistant response. */
  chat(input: ChatInput, opts?: RequestOptions): Promise<ChatResponse> {
    return chat(this._client, input, opts);
  }

  /** Streaming chat. Returns an AsyncGenerator of incremental events. */
  chatStream(
    input: ChatInput,
    opts?: RequestOptions,
  ): AsyncGenerator<ChatChunk> {
    return chatStream(this._client, input, opts);
  }

  /** Vision-or-text diagnosis (pragas, vet, confinamento). */
  diagnose(
    input: DiagnoseInput,
    opts?: RequestOptions,
  ): Promise<DiagnoseResponse> {
    return diagnose(this._client, input, opts);
  }

  /** Time-series forecast (gmd, yield, milk, rain). */
  forecast(
    input: ForecastInput,
    opts?: RequestOptions,
  ): Promise<ForecastResponse> {
    return forecast(this._client, input, opts);
  }

  /** Ranked recommendations (input-protocol, next-action, creative). */
  recommend(
    input: RecommendInput,
    opts?: RequestOptions,
  ): Promise<RecommendResponse> {
    return recommend(this._client, input, opts);
  }

  /** Schema + semantic validation (records, levels, prescriptions). */
  validate(
    input: ValidateInput,
    opts?: RequestOptions,
  ): Promise<ValidateResponse> {
    return validate(this._client, input, opts);
  }
}

/* ------------------------------------------------------------------ */
/* Public exports                                                     */
/* ------------------------------------------------------------------ */

export { RumoIAHubClient } from "./client";
export type { RumoIAHubClientOptions, InternalRequest } from "./client";
export { buildMultipart } from "./client";

export {
  RumoIAError,
  RumoIANetworkError,
  RumoIAClientError,
  RumoIAAuthError,
  RumoIARateLimitError,
  RumoIAServerError,
  RumoIAStreamError,
  RumoIAAbortError,
} from "./errors";

export type {
  // Shared
  AppSlug,
  RequestOptions,
  FileUpload,
  // Chat
  ChatRole,
  ChatMessage,
  ChatMessagePart,
  ChatInput,
  ChatResponse,
  ChatToolCall,
  ChatUsage,
  ChatChunk,
  // Diagnose
  DiagnoseInput,
  DiagnoseResponse,
  // Forecast
  ForecastInput,
  ForecastResponse,
  // Recommend
  RecommendInput,
  RecommendResponse,
  // Validate
  ValidateInput,
  ValidateResponse,
} from "./types";
