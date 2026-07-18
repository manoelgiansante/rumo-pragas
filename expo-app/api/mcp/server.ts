/**
 * Rumo Pragas MCP 2025-11-25 Streamable HTTP endpoint.
 *
 * The server uses the JSON response mode (no server-initiated SSE). POST
 * accepts exactly one JSON-RPC message and GET deliberately returns the
 * protocol-defined 405 response for servers that do not expose an SSE stream.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash, randomUUID } from 'node:crypto';
import { authenticate } from './auth';
import { logEvent, type ToolContext, type ToolHandler } from './_types';
import { getUserClient } from './_supabase';
import { getDiagnosis } from './tools/get_diagnosis';
import { getPestHistory } from './tools/get_pest_history';
import { listDiagnoses } from './tools/list_diagnoses';
import { searchPestLibrary } from './tools/search_pest_library';

export const MCP_PROTOCOL_VERSION = '2025-11-25';
const MAX_BODY_BYTES = 64 * 1024;
const MAX_ARGUMENT_BYTES = 16 * 1024;
const REQUEST_TIMEOUT_MS = 8_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_ALLOWED_ORIGINS = [
  'https://pragas.agrorumo.com',
  'https://rumopragas.com.br',
  'https://rumo-pragas.vercel.app',
  'http://localhost:19006',
  'http://localhost:8081',
];

type RequestId = string | number;
type JsonRpcRequest = {
  jsonrpc: '2.0';
  id: RequestId;
  method: string;
  params?: Record<string, unknown>;
};
type JsonRpcNotification = {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
};
type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification;

const TOOLS: Record<string, ToolHandler> = {
  [listDiagnoses.name]: listDiagnoses,
  [getDiagnosis.name]: getDiagnosis,
  [searchPestLibrary.name]: searchPestLibrary,
  [getPestHistory.name]: getPestHistory,
};

// Every current tool is read-only. Future mutating tools must be added here so
// they require a caller-supplied Idempotency-Key instead of a server nonce.
const MUTATING_TOOLS = new Set<string>();

class RequestTimeoutError extends Error {
  constructor() {
    super('request_timeout');
    this.name = 'RequestTimeoutError';
  }
}

function allowedOrigins(): Set<string> {
  const configured = process.env.MCP_ALLOWED_ORIGINS?.trim();
  return new Set(
    configured
      ? configured
          .split(',')
          .map((origin: string) => origin.trim())
          .filter(Boolean)
      : DEFAULT_ALLOWED_ORIGINS,
  );
}

function getSingleHeader(req: VercelRequest, name: string): string | null {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function setSecurityHeaders(req: VercelRequest, res: VercelResponse): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Origin');
  res.removeHeader('X-Powered-By');
  const origin = getSingleHeader(req, 'origin');
  if (origin && allowedOrigins().has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Authorization, Content-Type, Accept, MCP-Protocol-Version, Idempotency-Key',
    );
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  }
}

function isOriginAllowed(req: VercelRequest): boolean {
  const origin = getSingleHeader(req, 'origin');
  return !origin || allowedOrigins().has(origin);
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function jsonRpcResult(id: RequestId, result: unknown) {
  return { jsonrpc: '2.0' as const, id, result };
}

function jsonRpcError(id: RequestId | null, code: number, message: string, data?: unknown) {
  return {
    jsonrpc: '2.0' as const,
    id,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  };
}

function isRequestId(value: unknown): value is RequestId {
  return typeof value === 'string' || (typeof value === 'number' && Number.isSafeInteger(value));
}

function parseBody(
  req: VercelRequest,
): { ok: true; value: Record<string, unknown> } | { ok: false; tooLarge: boolean } {
  const declared = Number(getSingleHeader(req, 'content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return { ok: false, tooLarge: true };
  }
  let body: unknown = req.body;
  if (typeof body === 'string' || body instanceof Buffer) {
    const raw = body instanceof Buffer ? body.toString('utf8') : body;
    if (byteLength(raw) > MAX_BODY_BYTES) return { ok: false, tooLarge: true };
    try {
      body = JSON.parse(raw);
    } catch {
      return { ok: false, tooLarge: false };
    }
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, tooLarge: false };
  }
  try {
    if (byteLength(JSON.stringify(body)) > MAX_BODY_BYTES) {
      return { ok: false, tooLarge: true };
    }
  } catch {
    return { ok: false, tooLarge: false };
  }
  return { ok: true, value: body as Record<string, unknown> };
}

function parseMessage(body: Record<string, unknown>): JsonRpcRequest | JsonRpcNotification | null {
  if (body.jsonrpc !== '2.0' || typeof body.method !== 'string' || !body.method) return null;
  if (
    body.params !== undefined &&
    (typeof body.params !== 'object' || body.params === null || Array.isArray(body.params))
  )
    return null;
  if (Object.hasOwn(body, 'id')) {
    if (!isRequestId(body.id)) return null;
    return body as JsonRpcRequest;
  }
  return body as JsonRpcNotification;
}

function validInitializeParams(params: Record<string, unknown> | undefined): boolean {
  if (!params) return false;
  const clientInfo = params.clientInfo;
  return (
    typeof params.protocolVersion === 'string' &&
    typeof params.capabilities === 'object' &&
    params.capabilities !== null &&
    !Array.isArray(params.capabilities) &&
    typeof clientInfo === 'object' &&
    clientInfo !== null &&
    !Array.isArray(clientInfo) &&
    typeof (clientInfo as Record<string, unknown>).name === 'string' &&
    typeof (clientInfo as Record<string, unknown>).version === 'string'
  );
}

function requireIdempotencyKey(req: VercelRequest): string | null {
  const value = getSingleHeader(req, 'idempotency-key')?.trim() ?? '';
  return UUID_PATTERN.test(value) ? value.toLowerCase() : null;
}

async function withTimeout<T>(promise: PromiseLike<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new RequestTimeoutError()), REQUEST_TIMEOUT_MS);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function canonicalJson(value: unknown): string {
  type Task = { kind: 'raw'; value: string } | { kind: 'value'; value: unknown };
  const output: string[] = [];
  const stack: Task[] = [{ kind: 'value', value }];

  while (stack.length > 0) {
    const task = stack.pop()!;
    if (task.kind === 'raw') {
      output.push(task.value);
      continue;
    }

    const current = task.value;
    if (current === null) {
      output.push('null');
      continue;
    }
    if (Array.isArray(current)) {
      output.push('[');
      stack.push({ kind: 'raw', value: ']' });
      for (let index = current.length - 1; index >= 0; index -= 1) {
        if (index < current.length - 1) stack.push({ kind: 'raw', value: ',' });
        stack.push({ kind: 'value', value: current[index] ?? null });
      }
      continue;
    }
    if (typeof current === 'object') {
      const record = current as Record<string, unknown>;
      const keys = Object.keys(record)
        .filter((key) => !['undefined', 'function', 'symbol'].includes(typeof record[key]))
        .sort();
      output.push('{');
      stack.push({ kind: 'raw', value: '}' });
      for (let index = keys.length - 1; index >= 0; index -= 1) {
        const key = keys[index]!;
        if (index < keys.length - 1) stack.push({ kind: 'raw', value: ',' });
        stack.push({ kind: 'value', value: record[key] });
        stack.push({ kind: 'raw', value: ':' });
        stack.push({ kind: 'raw', value: JSON.stringify(key) });
      }
      continue;
    }
    const serialized = JSON.stringify(current);
    if (serialized === undefined) throw new TypeError('Unsupported JSON value');
    output.push(serialized);
  }

  return output.join('');
}

function requestHash(message: JsonRpcMessage): string {
  return createHash('sha256')
    .update(canonicalJson({ method: message.method, params: message.params ?? {} }))
    .digest('hex');
}

function stableRequestIdentity(hash: string): string {
  const digest = createHash('sha256').update(`rumo-pragas:mcp:v1:${hash}`).digest('hex');
  const hex = digest.slice(0, 32).split('');
  hex[12] = '8';
  hex[16] = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex
    .slice(12, 16)
    .join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
}

function retryAfterSeconds(result: Record<string, unknown>): number {
  if (typeof result.retry_after_seconds === 'number') {
    return Math.max(1, Math.ceil(result.retry_after_seconds));
  }
  if (typeof result.reset_at !== 'string') return 60;
  const resetAt = new Date(result.reset_at).getTime();
  return Number.isNaN(resetAt) ? 60 : Math.max(1, Math.ceil((resetAt - Date.now()) / 1_000));
}

async function rateLimit(
  req: VercelRequest,
  message: JsonRpcMessage,
  supabase: ReturnType<typeof getUserClient>,
): Promise<
  | { ok: true }
  | { ok: false; status: number; body: ReturnType<typeof jsonRpcError>; retryAfter?: number }
> {
  const id = 'id' in message ? message.id : null;
  const toolName =
    message.method === 'tools/call' && typeof message.params?.name === 'string'
      ? message.params.name
      : null;
  const hash = requestHash(message);
  const idempotencyKey =
    toolName && MUTATING_TOOLS.has(toolName)
      ? requireIdempotencyKey(req)
      : stableRequestIdentity(hash);
  if (!idempotencyKey) {
    return {
      ok: false,
      status: 400,
      body: jsonRpcError(id, -32602, 'A valid Idempotency-Key UUID is required.'),
    };
  }
  let response: { data: unknown; error: unknown };
  try {
    response = await withTimeout<{ data: unknown; error: unknown }>(
      supabase.rpc('consume_pragas_mcp_rate_limit', {
        p_idempotency_key: idempotencyKey,
        p_request_hash: hash,
      }) as unknown as PromiseLike<{ data: unknown; error: unknown }>,
    );
  } catch {
    return {
      ok: false,
      status: 503,
      body: jsonRpcError(id, -32603, 'Rate limiter unavailable.'),
    };
  }
  const { data, error } = response;
  const raw = Array.isArray(data) ? data[0] : data;
  const result = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : null;
  if (error || !result || typeof result.allowed !== 'boolean') {
    return {
      ok: false,
      status: 503,
      body: jsonRpcError(id, -32603, 'Rate limiter unavailable.'),
    };
  }
  if (result.conflict === true) {
    return {
      ok: false,
      status: 409,
      body: jsonRpcError(id, -32602, 'Idempotency key conflicts with another request.'),
    };
  }
  if (!result.allowed) {
    const retryAfter = retryAfterSeconds(result);
    return {
      ok: false,
      status: 429,
      retryAfter,
      body: jsonRpcError(id, -32000, 'Rate limit exceeded.', {
        retryAfterSeconds: retryAfter,
      }),
    };
  }
  return { ok: true };
}

export interface McpDependencies {
  authenticate: typeof authenticate;
  getUserClient: typeof getUserClient;
}

const DEFAULT_DEPENDENCIES: McpDependencies = { authenticate, getUserClient };

export async function handleMcpRequest(
  req: VercelRequest,
  res: VercelResponse,
  dependencies: McpDependencies = DEFAULT_DEPENDENCIES,
) {
  setSecurityHeaders(req, res);
  const referenceId = randomUUID();
  res.setHeader('X-Request-Id', referenceId);

  if (!isOriginAllowed(req)) {
    return res.status(403).json(jsonRpcError(null, -32000, 'Origin not allowed.'));
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, GET');
    return res.status(405).json(jsonRpcError(null, -32600, 'Method Not Allowed.'));
  }

  const accept = (getSingleHeader(req, 'accept') ?? '').toLowerCase();
  if (!accept.includes('application/json') || !accept.includes('text/event-stream')) {
    return res
      .status(406)
      .json(
        jsonRpcError(null, -32600, 'Accept must include application/json and text/event-stream.'),
      );
  }
  const contentType = getSingleHeader(req, 'content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return res
      .status(415)
      .json(jsonRpcError(null, -32600, 'Content-Type must be application/json.'));
  }

  const parsed = parseBody(req);
  if (!parsed.ok) {
    return res
      .status(parsed.tooLarge ? 413 : 400)
      .json(
        jsonRpcError(
          null,
          parsed.tooLarge ? -32600 : -32700,
          parsed.tooLarge ? 'Request body is too large.' : 'Parse error.',
        ),
      );
  }
  const message = parseMessage(parsed.value);
  if (!message) return res.status(400).json(jsonRpcError(null, -32600, 'Invalid Request.'));

  if (message.method !== 'initialize') {
    const protocolHeader = getSingleHeader(req, 'mcp-protocol-version');
    if (protocolHeader !== MCP_PROTOCOL_VERSION) {
      return res
        .status(400)
        .json(
          jsonRpcError(
            'id' in message ? message.id : null,
            -32600,
            'Unsupported or missing MCP-Protocol-Version.',
            { supported: [MCP_PROTOCOL_VERSION] },
          ),
        );
    }
  }

  let auth;
  try {
    auth = await withTimeout(dependencies.authenticate(req));
  } catch {
    logEvent('auth_unavailable', { referenceId });
    return res
      .status(503)
      .json(
        jsonRpcError(
          'id' in message ? message.id : null,
          -32603,
          `Authentication unavailable. Reference: ${referenceId}`,
        ),
      );
  }
  if (!auth.ok) {
    logEvent('auth_failed', { referenceId });
    return res
      .status(401)
      .json(jsonRpcError('id' in message ? message.id : null, -32000, 'Unauthorized.'));
  }

  res.setHeader('MCP-Protocol-Version', MCP_PROTOCOL_VERSION);
  let supabase: ReturnType<typeof getUserClient>;
  try {
    supabase = dependencies.getUserClient(auth.jwt);
  } catch {
    logEvent('rate_limiter_unavailable', { referenceId });
    return res
      .status(503)
      .json(jsonRpcError('id' in message ? message.id : null, -32603, 'Rate limiter unavailable.'));
  }
  const limited = await rateLimit(req, message, supabase);
  if (!limited.ok) {
    if (limited.retryAfter) res.setHeader('Retry-After', String(limited.retryAfter));
    logEvent(limited.status === 429 ? 'rate_limited' : 'rate_limiter_rejected', {
      referenceId,
      status: limited.status,
    });
    return res.status(limited.status).json(limited.body);
  }

  if (message.method === 'notifications/initialized' && !('id' in message)) {
    logEvent('initialized', { referenceId });
    return res.status(202).end();
  }
  if (!('id' in message)) {
    logEvent('notification_accepted', { referenceId, method: message.method });
    return res.status(202).end();
  }

  if (message.method === 'initialize') {
    if (!validInitializeParams(message.params)) {
      return res.status(400).json(jsonRpcError(message.id, -32602, 'Invalid initialize params.'));
    }
    return res.status(200).json(
      jsonRpcResult(message.id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: 'rumo-pragas',
          version: '1.0.0',
          description: 'Diagnósticos e catálogo educativo do Rumo Pragas.',
        },
        instructions: 'Ferramentas somente leitura; resultados agronômicos são educativos.',
      }),
    );
  }

  try {
    if (message.method === 'ping') {
      return res.status(200).json(jsonRpcResult(message.id, {}));
    }
    if (message.method !== 'tools/list' && message.method !== 'tools/call') {
      return res.status(404).json(jsonRpcError(message.id, -32601, 'Method not found.'));
    }

    if (message.method === 'tools/list') {
      const tools = Object.values(TOOLS).map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      }));
      logEvent('tools_list', { referenceId, count: tools.length });
      return res.status(200).json(jsonRpcResult(message.id, { tools }));
    }

    const params = message.params;
    if (!params || typeof params.name !== 'string' || !Object.hasOwn(TOOLS, params.name)) {
      return res.status(400).json(jsonRpcError(message.id, -32602, 'Unknown tool.'));
    }
    const args = params.arguments ?? {};
    if (typeof args !== 'object' || args === null || Array.isArray(args)) {
      return res.status(400).json(jsonRpcError(message.id, -32602, 'Invalid tool arguments.'));
    }
    if (byteLength(JSON.stringify(args)) > MAX_ARGUMENT_BYTES) {
      return res
        .status(413)
        .json(jsonRpcError(message.id, -32602, 'Tool arguments are too large.'));
    }

    const context: ToolContext = { userId: auth.userId, supabase };
    const started = Date.now();
    const result = await withTimeout(TOOLS[params.name]!.handler(args, context));
    logEvent('tool_call', {
      referenceId,
      name: params.name,
      ms: Date.now() - started,
      isError: Boolean(result.isError),
    });
    return res.status(200).json(jsonRpcResult(message.id, result));
  } catch (error) {
    const timedOut = error instanceof RequestTimeoutError;
    logEvent(timedOut ? 'request_timeout' : 'tool_exception', { referenceId });
    return res
      .status(timedOut ? 504 : 500)
      .json(jsonRpcError(message.id, -32603, `Request failed. Reference: ${referenceId}`));
  }
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  return handleMcpRequest(req, res);
}
