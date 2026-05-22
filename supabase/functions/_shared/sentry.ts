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
 *   import { withSentry, logError } from '../_shared/sentry.ts';
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

function parseDsn(dsn: string): SentryDsn | null {
  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    const projectId = url.pathname.replace(/^\//, '');
    if (!publicKey || !projectId) return null;
    return {
      publicKey,
      host: url.host,
      projectId,
      protocol: url.protocol.replace(':', ''),
    };
  } catch {
    return null;
  }
}

const DSN = Deno.env.get('SENTRY_DSN') ?? '';
const ENVIRONMENT = Deno.env.get('SENTRY_ENVIRONMENT') ?? 'production';
const RELEASE = Deno.env.get('SENTRY_RELEASE') ?? 'rumo-pragas-edge';
const parsed = DSN ? parseDsn(DSN) : null;

async function sendToSentry(
  payload: Record<string, unknown>,
): Promise<void> {
  if (!parsed) return; // No DSN configured — silent no-op (dev / tests)
  try {
    const envelopeHeader = JSON.stringify({
      event_id: payload.event_id,
      sent_at: new Date().toISOString(),
      dsn: DSN,
    });
    const itemHeader = JSON.stringify({ type: 'event' });
    const body = `${envelopeHeader}\n${itemHeader}\n${JSON.stringify(payload)}`;
    const url = `${parsed.protocol}://${parsed.host}/api/${parsed.projectId}/envelope/?sentry_key=${parsed.publicKey}&sentry_version=7`;
    // We deliberately do NOT await this in the hot path — but the caller
    // already awaits us with a short timeout. AbortController guarantees we
    // don't keep the worker alive longer than necessary.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-sentry-envelope' },
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
  return crypto.randomUUID().replace(/-/g, '');
}

export interface CaptureContext {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
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
    platform: 'javascript',
    environment: ENVIRONMENT,
    release: RELEASE,
    level: context.level ?? 'error',
    tags: context.tags,
    extra: context.extra,
    user: context.user,
    exception: {
      values: [
        {
          type: err.name,
          value: err.message,
          stacktrace: err.stack ? { frames: [{ filename: 'edge', function: err.stack }] } : undefined,
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
    platform: 'javascript',
    environment: ENVIRONMENT,
    release: RELEASE,
    level: context.level ?? 'info',
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
      headers.set('X-Request-Id', requestId);
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers,
      });
    } catch (err) {
      await captureException(err, {
        tags: { fn: fnName, requestId },
        level: 'error',
      });
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'internal_error',
          requestId,
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-Id': requestId,
          },
        },
      );
    }
  };
}
