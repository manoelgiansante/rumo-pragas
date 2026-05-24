'use strict';

// src/errors.ts
var RumoIAError = class extends Error {
  constructor(init) {
    super(init.message);
    this.name = "RumoIAError";
    this.status = init.status;
    this.code = init.code;
    this.requestId = init.requestId;
    this.endpoint = init.endpoint;
    if (init.cause !== void 0) {
      this.cause = init.cause;
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
};
var RumoIANetworkError = class extends RumoIAError {
  constructor(init) {
    super(init);
    this.name = "RumoIANetworkError";
  }
};
var RumoIAClientError = class extends RumoIAError {
  constructor(init) {
    super(init);
    this.name = "RumoIAClientError";
  }
};
var RumoIAAuthError = class extends RumoIAClientError {
  constructor(init) {
    super(init);
    this.name = "RumoIAAuthError";
  }
};
var RumoIARateLimitError = class extends RumoIAClientError {
  constructor(init) {
    super(init);
    this.name = "RumoIARateLimitError";
    this.retryAfterSec = init.retryAfterSec;
  }
};
var RumoIAServerError = class extends RumoIAError {
  constructor(init) {
    super(init);
    this.name = "RumoIAServerError";
  }
};
var RumoIAStreamError = class extends RumoIAError {
  constructor(init) {
    super(init);
    this.name = "RumoIAStreamError";
  }
};
var RumoIAAbortError = class extends RumoIAError {
  constructor(init) {
    super(init);
    this.name = "RumoIAAbortError";
  }
};

// src/client.ts
var DEFAULT_BASE_URL = "https://hub.agrorumo.com";
var DEFAULT_TIMEOUT_MS = 6e4;
var DEFAULT_MAX_RETRIES = 3;
var SDK_VERSION = "0.1.0";
var RumoIAHubClient = class {
  constructor(opts) {
    if (!opts || typeof opts !== "object") {
      throw new RumoIAError({
        message: "RumoIAHubClient: missing options object."
      });
    }
    if (!opts.apiKey || typeof opts.apiKey !== "string") {
      throw new RumoIAError({ message: "RumoIAHubClient: apiKey is required." });
    }
    if (!opts.appSlug || typeof opts.appSlug !== "string") {
      throw new RumoIAError({
        message: "RumoIAHubClient: appSlug is required."
      });
    }
    const fetchImpl = opts.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
      throw new RumoIAError({
        message: "RumoIAHubClient: no fetch impl found. On Node <18 pass `fetch` explicitly."
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
  async request(req) {
    const res = await this.requestRaw(req);
    if (req.raw) return res;
    if (res.status === 204) return null;
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new RumoIAError({
        message: `Invalid JSON response from ${req.endpoint}`,
        status: res.status,
        endpoint: req.endpoint,
        cause: err
      });
    }
  }
  /** Internal: returns the raw Response after retry loop + error mapping. */
  async requestRaw(req) {
    const url = `${this.baseUrl}${req.path}`;
    const headers = this.buildHeaders(req);
    let body;
    if (req.formData) {
      body = req.formData;
      delete headers["content-type"];
    } else if (req.json !== void 0) {
      body = JSON.stringify(req.json);
      headers["content-type"] = "application/json";
    }
    const timeoutMs = req.options?.timeoutMs ?? this.timeoutMs;
    let attempt = 0;
    let lastError;
    while (attempt <= this.maxRetries) {
      const ctl = new AbortController();
      const onAbort = () => ctl.abort();
      if (req.options?.signal) {
        if (req.options.signal.aborted) {
          throw new RumoIAAbortError({
            message: "Request aborted before send.",
            endpoint: req.endpoint
          });
        }
        req.options.signal.addEventListener("abort", onAbort, { once: true });
      }
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        if (this.debug) {
          console.log(`[ia-hub-client] ${req.method} ${url} attempt=${attempt}`);
        }
        const res = await this.fetchImpl(url, {
          method: req.method,
          headers,
          body,
          signal: ctl.signal
        });
        if (res.ok) return res;
        const retryable = res.status === 429 || res.status >= 500;
        if (retryable && attempt < this.maxRetries) {
          const wait = backoffMs(attempt, res.headers.get("retry-after"));
          attempt += 1;
          await sleep(wait);
          continue;
        }
        throw await mapHttpError(res, req.endpoint);
      } catch (err) {
        if (isAbortError(err)) {
          if (req.options?.signal?.aborted) {
            throw new RumoIAAbortError({
              message: "Request aborted by caller.",
              endpoint: req.endpoint
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
            cause: err
          });
        }
        if (err instanceof RumoIAError) throw err;
        if (attempt < this.maxRetries) {
          const wait = backoffMs(attempt, null);
          attempt += 1;
          await sleep(wait);
          lastError = err;
          continue;
        }
        throw new RumoIANetworkError({
          message: `Network error contacting ${req.endpoint}: ${err?.message ?? "unknown"}`,
          endpoint: req.endpoint,
          cause: err
        });
      } finally {
        clearTimeout(timer);
        if (req.options?.signal) {
          req.options.signal.removeEventListener("abort", onAbort);
        }
      }
    }
    throw new RumoIANetworkError({
      message: "Retry loop exhausted.",
      endpoint: req.endpoint,
      cause: lastError
    });
  }
  /** Builds the canonical request headers for the IA Hub. */
  buildHeaders(req) {
    const appSlug = req.options?.appSlug ?? this.appSlug;
    const headers = {
      authorization: `Bearer ${this.apiKey}`,
      "x-app-slug": String(appSlug),
      "user-agent": this.userAgent,
      accept: "application/json",
      ...lowercaseKeys(this.defaultHeaders),
      ...lowercaseKeys(req.options?.headers)
    };
    if (this.userId) headers["x-rumo-user-id"] = this.userId;
    if (req.options?.idempotencyKey) {
      headers["idempotency-key"] = req.options.idempotencyKey;
    }
    return headers;
  }
};
function buildUserAgent(suffix) {
  const base = `@agrorumo/ia-hub-client/${SDK_VERSION}`;
  return suffix ? `${base} ${suffix}` : base;
}
function lowercaseKeys(obj) {
  if (!obj) return {};
  const out = {};
  for (const k of Object.keys(obj)) out[k.toLowerCase()] = obj[k];
  return out;
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function backoffMs(attempt, retryAfter) {
  if (retryAfter) {
    const n = Number(retryAfter);
    if (Number.isFinite(n) && n > 0) return Math.min(n * 1e3, 3e4);
  }
  const base = Math.min(250 * 2 ** attempt, 8e3);
  const jitter = 1 + (Math.random() * 0.4 - 0.2);
  return Math.round(base * jitter);
}
function isAbortError(err) {
  if (!err || typeof err !== "object") return false;
  const name = err.name;
  return name === "AbortError" || name === "TimeoutError";
}
async function mapHttpError(res, endpoint) {
  const requestId = res.headers.get("x-request-id") ?? void 0;
  let message = `${res.status} ${res.statusText}`;
  let code;
  try {
    const text = await res.text();
    if (text) {
      try {
        const parsed = JSON.parse(text);
        if (parsed.error) message = parsed.error;
        if (parsed.code) code = parsed.code;
      } catch {
        message = text.slice(0, 500);
      }
    }
  } catch {
  }
  if (res.status === 401 || res.status === 403) {
    return new RumoIAAuthError({
      message,
      status: res.status,
      code,
      requestId,
      endpoint
    });
  }
  if (res.status === 429) {
    const retryAfter = res.headers.get("retry-after");
    const retryAfterSec = retryAfter ? Number(retryAfter) : void 0;
    return new RumoIARateLimitError({
      message,
      status: res.status,
      code,
      requestId,
      endpoint,
      retryAfterSec: Number.isFinite(retryAfterSec) && (retryAfterSec ?? 0) > 0 ? retryAfterSec : void 0
    });
  }
  if (res.status >= 400 && res.status < 500) {
    return new RumoIAClientError({
      message,
      status: res.status,
      code,
      requestId,
      endpoint
    });
  }
  return new RumoIAServerError({
    message,
    status: res.status,
    code,
    requestId,
    endpoint
  });
}
function buildMultipart(json, files) {
  const fd = new FormData();
  fd.append("payload", JSON.stringify(json));
  for (const [field, value] of Object.entries(files)) {
    if (!value) continue;
    const arr = Array.isArray(value) ? value : [value];
    for (const f of arr) appendFile(fd, field, f);
  }
  return fd;
}
function appendFile(fd, field, f) {
  if (typeof Blob !== "undefined" && f instanceof Blob) {
    const name = f.name ?? `${field}.bin`;
    fd.append(field, f, name);
    return;
  }
  if (typeof f === "object" && f !== null && "uri" in f && "type" in f && "name" in f) {
    fd.append(field, f);
    return;
  }
  throw new RumoIAError({
    message: `Unsupported FileUpload shape for field "${field}".`
  });
}

// src/chat.ts
async function chat(client, input, opts) {
  validateChatInput(input);
  return client.request({
    method: "POST",
    path: "/v1/chat",
    json: {
      messages: input.messages,
      conversationId: input.conversationId
    },
    options: { ...opts, appSlug: input.appSlug ?? opts?.appSlug },
    endpoint: "chat"
  });
}
async function* chatStream(client, input, opts) {
  validateChatInput(input);
  const res = await client.requestRaw({
    method: "POST",
    path: "/v1/chat",
    json: {
      messages: input.messages,
      conversationId: input.conversationId,
      stream: true
    },
    options: {
      ...opts,
      appSlug: input.appSlug ?? opts?.appSlug,
      headers: {
        ...opts?.headers ?? {},
        accept: "text/event-stream"
      }
    },
    endpoint: "chat",
    raw: true
  });
  if (!res.body) {
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
      let idx;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const chunk = parseFrame(frame);
        if (chunk) yield chunk;
      }
    }
    if (buffer.trim().length > 0) {
      const chunk = parseFrame(buffer);
      if (chunk) yield chunk;
    }
  } catch (err) {
    throw new RumoIAStreamError({
      message: `Chat stream interrupted: ${err?.message ?? "unknown"}`,
      endpoint: "chat",
      cause: err
    });
  } finally {
    try {
      reader.releaseLock();
    } catch {
    }
  }
}
function parseFrame(frame) {
  const trimmed = frame.trim();
  if (!trimmed) return null;
  const lines = trimmed.split("\n");
  const datas = [];
  for (const line of lines) {
    if (line.startsWith("data:")) datas.push(line.slice(5).trimStart());
    else if (line.startsWith(":")) continue;
    else datas.push(line);
  }
  const payload = datas.join("\n").trim();
  if (!payload || payload === "[DONE]") return { type: "finish" };
  try {
    const obj = JSON.parse(payload);
    return normalizeChunk(obj);
  } catch {
    return { type: "text-delta", text: payload };
  }
}
function normalizeChunk(obj) {
  if (!obj || typeof obj !== "object") return null;
  const o = obj;
  if (typeof o.type !== "string") {
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
        args: o.args ?? {}
      };
    case "tool-result":
      return {
        type: "tool-result",
        toolName: String(o.toolName ?? ""),
        result: o.result
      };
    case "finish":
      return {
        type: "finish",
        usage: o.usage
      };
    case "error":
      return { type: "error", message: String(o.message ?? "unknown") };
    default:
      return null;
  }
}
function validateChatInput(input) {
  if (!input || typeof input !== "object") {
    throw new RumoIAError({ message: "chat: input is required." });
  }
  if (!Array.isArray(input.messages) || input.messages.length === 0) {
    throw new RumoIAError({
      message: "chat: messages must be a non-empty array."
    });
  }
  for (const m of input.messages) {
    if (!m || typeof m !== "object" || typeof m.role !== "string") {
      throw new RumoIAError({
        message: "chat: every message needs a role (system|user|assistant|tool)."
      });
    }
    if (m.content === void 0 || m.content === null) {
      throw new RumoIAError({ message: "chat: message.content is required." });
    }
  }
}

// src/diagnose.ts
async function diagnose(client, input, opts) {
  if (!input || !input.prompt && (!input.images || input.images.length === 0)) {
    throw new RumoIAError({
      message: "diagnose: provide at least `prompt` or one `image`."
    });
  }
  if (input.images && input.images.length > 0) {
    const fd = buildMultipart(
      {
        prompt: input.prompt ?? "",
        context: input.context ?? {},
        conversationId: input.conversationId
      },
      { "image[]": input.images }
    );
    return client.request({
      method: "POST",
      path: "/v1/diagnose",
      formData: fd,
      options: opts,
      endpoint: "diagnose"
    });
  }
  return client.request({
    method: "POST",
    path: "/v1/diagnose",
    json: {
      prompt: input.prompt,
      context: input.context ?? {},
      conversationId: input.conversationId
    },
    options: opts,
    endpoint: "diagnose"
  });
}

// src/forecast.ts
async function forecast(client, input, opts) {
  if (!input || typeof input.kind !== "string" || !input.kind) {
    throw new RumoIAError({ message: "forecast: `kind` is required." });
  }
  if (!Number.isFinite(input.horizonDays) || input.horizonDays <= 0) {
    throw new RumoIAError({
      message: "forecast: `horizonDays` must be a positive number."
    });
  }
  if (!input.features || typeof input.features !== "object") {
    throw new RumoIAError({
      message: "forecast: `features` must be an object."
    });
  }
  return client.request({
    method: "POST",
    path: "/v1/forecast",
    json: {
      kind: input.kind,
      horizonDays: input.horizonDays,
      features: input.features
    },
    options: opts,
    endpoint: "forecast"
  });
}

// src/recommend.ts
async function recommend(client, input, opts) {
  if (!input || typeof input.domain !== "string" || !input.domain) {
    throw new RumoIAError({ message: "recommend: `domain` is required." });
  }
  if (!input.context || typeof input.context !== "object") {
    throw new RumoIAError({
      message: "recommend: `context` must be an object."
    });
  }
  if (input.topK !== void 0 && (!Number.isFinite(input.topK) || input.topK <= 0)) {
    throw new RumoIAError({
      message: "recommend: `topK` must be a positive number when provided."
    });
  }
  return client.request({
    method: "POST",
    path: "/v1/recommend",
    json: {
      domain: input.domain,
      context: input.context,
      topK: input.topK
    },
    options: opts,
    endpoint: "recommend"
  });
}

// src/validate.ts
async function validate(client, input, opts) {
  if (!input || typeof input.kind !== "string" || !input.kind) {
    throw new RumoIAError({ message: "validate: `kind` is required." });
  }
  if (!input.payload || typeof input.payload !== "object") {
    throw new RumoIAError({
      message: "validate: `payload` must be an object."
    });
  }
  return client.request({
    method: "POST",
    path: "/v1/validate",
    json: {
      kind: input.kind,
      payload: input.payload
    },
    options: opts,
    endpoint: "validate"
  });
}

// src/index.ts
var RumoIAHub = class {
  constructor(opts) {
    this._client = new RumoIAHubClient(opts);
  }
  /** Underlying transport — useful when consumers need custom requests. */
  get client() {
    return this._client;
  }
  /** Non-streaming chat. Returns the full assistant response. */
  chat(input, opts) {
    return chat(this._client, input, opts);
  }
  /** Streaming chat. Returns an AsyncGenerator of incremental events. */
  chatStream(input, opts) {
    return chatStream(this._client, input, opts);
  }
  /** Vision-or-text diagnosis (pragas, vet, confinamento). */
  diagnose(input, opts) {
    return diagnose(this._client, input, opts);
  }
  /** Time-series forecast (gmd, yield, milk, rain). */
  forecast(input, opts) {
    return forecast(this._client, input, opts);
  }
  /** Ranked recommendations (input-protocol, next-action, creative). */
  recommend(input, opts) {
    return recommend(this._client, input, opts);
  }
  /** Schema + semantic validation (records, levels, prescriptions). */
  validate(input, opts) {
    return validate(this._client, input, opts);
  }
};

exports.RumoIAAbortError = RumoIAAbortError;
exports.RumoIAAuthError = RumoIAAuthError;
exports.RumoIAClientError = RumoIAClientError;
exports.RumoIAError = RumoIAError;
exports.RumoIAHub = RumoIAHub;
exports.RumoIAHubClient = RumoIAHubClient;
exports.RumoIANetworkError = RumoIANetworkError;
exports.RumoIARateLimitError = RumoIARateLimitError;
exports.RumoIAServerError = RumoIAServerError;
exports.RumoIAStreamError = RumoIAStreamError;
exports.buildMultipart = buildMultipart;
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map