/**
 * Error classes for the Rumo IA Hub SDK.
 *
 * Pattern mirrors Stripe / Anthropic / OpenAI SDKs: every error thrown by the
 * client extends `RumoIAError` so callers can use a single `instanceof` check
 * to handle anything SDK-originated. Specific subclasses carry structured
 * context (status, code, request_id) for telemetry.
 */

export interface RumoIAErrorInit {
  message: string;
  status?: number;
  code?: string;
  requestId?: string;
  cause?: unknown;
  /** Endpoint slug (e.g. "chat", "diagnose") for breadcrumb tagging. */
  endpoint?: string;
}

export class RumoIAError extends Error {
  public readonly status?: number;
  public readonly code?: string;
  public readonly requestId?: string;
  public readonly endpoint?: string;

  constructor(init: RumoIAErrorInit) {
    super(init.message);
    this.name = "RumoIAError";
    this.status = init.status;
    this.code = init.code;
    this.requestId = init.requestId;
    this.endpoint = init.endpoint;
    if (init.cause !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this as any).cause = init.cause;
    }
    // Preserve prototype across transpile targets (RN Hermes safety).
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Request never left the device (network down, fetch threw, RN offline). */
export class RumoIANetworkError extends RumoIAError {
  constructor(init: RumoIAErrorInit) {
    super(init);
    this.name = "RumoIANetworkError";
  }
}

/** HTTP 4xx — caller's fault (validation, bad input). */
export class RumoIAClientError extends RumoIAError {
  constructor(init: RumoIAErrorInit) {
    super(init);
    this.name = "RumoIAClientError";
  }
}

/** HTTP 401 / 403 — invalid API key, missing X-App-Slug, scope mismatch. */
export class RumoIAAuthError extends RumoIAClientError {
  constructor(init: RumoIAErrorInit) {
    super(init);
    this.name = "RumoIAAuthError";
  }
}

/** HTTP 429 — caller exceeded rate limit. */
export class RumoIARateLimitError extends RumoIAClientError {
  public readonly retryAfterSec?: number;
  constructor(init: RumoIAErrorInit & { retryAfterSec?: number }) {
    super(init);
    this.name = "RumoIARateLimitError";
    this.retryAfterSec = init.retryAfterSec;
  }
}

/** HTTP 5xx — IA Hub is sick. SDK retries automatically with backoff. */
export class RumoIAServerError extends RumoIAError {
  constructor(init: RumoIAErrorInit) {
    super(init);
    this.name = "RumoIAServerError";
  }
}

/** Streaming connection dropped mid-flight, or SSE parse failed. */
export class RumoIAStreamError extends RumoIAError {
  constructor(init: RumoIAErrorInit) {
    super(init);
    this.name = "RumoIAStreamError";
  }
}

/** Aborted by AbortSignal — not really an error, but easier to handle as one. */
export class RumoIAAbortError extends RumoIAError {
  constructor(init: RumoIAErrorInit) {
    super(init);
    this.name = "RumoIAAbortError";
  }
}
