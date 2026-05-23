/**
 * Chat — non-streaming + streaming (SSE / UIMessageStream) wrappers.
 *
 * Server contract: POST /v1/chat
 *   Body: { messages: ChatMessage[], conversationId?: string }
 *   Headers: Authorization, X-App-Slug, X-Rumo-User-Id
 *   Response (non-stream): { text, conversationId, toolCalls?, usage? }
 *   Response (stream): SSE / chunked text — events match ChatChunk.
 */

import { RumoIAStreamError, RumoIAError } from "./errors";
import type { RumoIAHubClient } from "./client";
import type {
  ChatChunk,
  ChatInput,
  ChatResponse,
  RequestOptions,
} from "./types";

export async function chat(
  client: RumoIAHubClient,
  input: ChatInput,
  opts?: RequestOptions,
): Promise<ChatResponse> {
  validateChatInput(input);
  return client.request<ChatResponse>({
    method: "POST",
    path: "/v1/chat",
    json: {
      messages: input.messages,
      conversationId: input.conversationId,
    },
    options: { ...opts, appSlug: input.appSlug ?? opts?.appSlug },
    endpoint: "chat",
  });
}

/**
 * Streaming chat. Returns an AsyncGenerator of `ChatChunk` events.
 *
 * Usage:
 *   for await (const chunk of client.chatStream({ messages })) {
 *     if (chunk.type === "text-delta") process.stdout.write(chunk.text);
 *   }
 *
 * Implementation: reads the Response body as a ReadableStream of bytes,
 * decodes as UTF-8, splits on double-newline SSE frames, parses each
 * `data:` line as JSON. Falls back to plain newline-delimited JSON
 * (NDJSON) if the server doesn't use `data: ` prefix.
 */
export async function* chatStream(
  client: RumoIAHubClient,
  input: ChatInput,
  opts?: RequestOptions,
): AsyncGenerator<ChatChunk> {
  validateChatInput(input);
  const res = await client.requestRaw({
    method: "POST",
    path: "/v1/chat",
    json: {
      messages: input.messages,
      conversationId: input.conversationId,
      stream: true,
    },
    options: {
      ...opts,
      appSlug: input.appSlug ?? opts?.appSlug,
      headers: {
        ...(opts?.headers ?? {}),
        accept: "text/event-stream",
      },
    },
    endpoint: "chat",
    raw: true,
  });

  if (!res.body) {
    // Some RN runtimes don't expose response.body. Fall back to .text() and
    // surface a single chunk with the entire payload. Better than throwing.
    const text = await res.text();
    if (text) yield { type: "text-delta", text };
    yield { type: "finish" };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE frames are separated by \n\n. NDJSON by \n. Handle both.
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const chunk = parseFrame(frame);
        if (chunk) yield chunk;
      }
    }
    // Flush remaining buffer.
    if (buffer.trim().length > 0) {
      const chunk = parseFrame(buffer);
      if (chunk) yield chunk;
    }
  } catch (err) {
    throw new RumoIAStreamError({
      message: `Chat stream interrupted: ${(err as Error)?.message ?? "unknown"}`,
      endpoint: "chat",
      cause: err,
    });
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* noop */
    }
  }
}

/**
 * Parse a single SSE/NDJSON frame into a ChatChunk.
 * Returns `null` for empty frames or unparseable lines (caller continues).
 */
function parseFrame(frame: string): ChatChunk | null {
  const trimmed = frame.trim();
  if (!trimmed) return null;
  // Strip optional "data: " prefix(es). SSE may carry multiple data lines —
  // concatenate them per the spec.
  const lines = trimmed.split("\n");
  const datas: string[] = [];
  for (const line of lines) {
    if (line.startsWith("data:")) datas.push(line.slice(5).trimStart());
    else if (line.startsWith(":")) continue; // SSE comment
    else datas.push(line);
  }
  const payload = datas.join("\n").trim();
  if (!payload || payload === "[DONE]") return { type: "finish" };
  try {
    const obj = JSON.parse(payload) as unknown;
    return normalizeChunk(obj);
  } catch {
    // Not JSON — treat as raw text delta. Common for naive streaming APIs.
    return { type: "text-delta", text: payload };
  }
}

/** Coerce arbitrary server objects into the public ChatChunk discriminated union. */
function normalizeChunk(obj: unknown): ChatChunk | null {
  if (!obj || typeof obj !== "object") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const o = obj as any;
  // AI SDK v6 UIMessageStream shapes:
  //   { type: "text-delta", text: "..." }
  //   { type: "tool-call", toolName, args }
  //   { type: "tool-result", toolName, result }
  //   { type: "finish", usage? }
  //   { type: "error", message }
  if (typeof o.type !== "string") {
    // Some servers emit { delta: "..." } — handle gracefully.
    if (typeof o.delta === "string") {
      return { type: "text-delta", text: o.delta };
    }
    return null;
  }
  switch (o.type) {
    case "text-delta":
      return { type: "text-delta", text: String(o.text ?? "") };
    case "tool-call":
      return {
        type: "tool-call",
        toolName: String(o.toolName ?? ""),
        args: (o.args as Record<string, unknown>) ?? {},
      };
    case "tool-result":
      return {
        type: "tool-result",
        toolName: String(o.toolName ?? ""),
        result: o.result,
      };
    case "finish":
      return {
        type: "finish",
        usage: o.usage,
      };
    case "error":
      return { type: "error", message: String(o.message ?? "unknown") };
    default:
      return null;
  }
}

function validateChatInput(input: ChatInput): void {
  if (!input || typeof input !== "object") {
    throw new RumoIAError({ message: "chat: input is required." });
  }
  if (!Array.isArray(input.messages) || input.messages.length === 0) {
    throw new RumoIAError({
      message: "chat: messages must be a non-empty array.",
    });
  }
  for (const m of input.messages) {
    if (!m || typeof m !== "object" || typeof m.role !== "string") {
      throw new RumoIAError({
        message: "chat: every message needs a role (system|user|assistant|tool).",
      });
    }
    if (m.content === undefined || m.content === null) {
      throw new RumoIAError({ message: "chat: message.content is required." });
    }
  }
}
