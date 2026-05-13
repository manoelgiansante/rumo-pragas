/**
 * Sentry shim for Supabase Edge Functions (Deno runtime).
 *
 * Lightweight HTTP-based Sentry transport. No npm/Deno SDK needed.
 * If SENTRY_DSN is not set, falls back to console.error (no-op for prod silence).
 *
 * Usage:
 *   import { captureError, withSentry } from "../_shared/sentry.ts";
 *
 *   // Wrap entire handler:
 *   Deno.serve(withSentry(async (req) => { ... }, "fn-name"));
 *
 *   // Or capture inline:
 *   try { ... } catch (err) {
 *     await captureError(err, { tags: { op: "db_insert" }, user_id: userId });
 *     throw err;
 *   }
 *
 * Aligns with ZERO-O observability rule: every edge fn MUST capture critical
 * catches via this helper so silent failures show up in Sentry dashboard.
 */

const DSN = Deno.env.get("SENTRY_DSN") || "";

interface CaptureCtx {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  user_id?: string;
  level?: "error" | "warning" | "info" | "fatal";
}

export async function captureError(err: unknown, ctx: CaptureCtx = {}): Promise<void> {
  if (!DSN) {
    console.error(
      JSON.stringify({
        sentry: "noDSN",
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        ctx,
      }),
    );
    return;
  }

  try {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    const payload = {
      event_id: crypto.randomUUID().replace(/-/g, ""),
      timestamp: Math.floor(Date.now() / 1000),
      platform: "javascript",
      level: ctx.level || "error",
      logger: "edge-fn",
      tags: ctx.tags || {},
      extra: ctx.extra || {},
      user: ctx.user_id ? { id: ctx.user_id } : undefined,
      exception: {
        values: [
          {
            type: err instanceof Error ? err.name : "Error",
            value: message,
            stacktrace: stack
              ? { frames: parseStackFrames(stack) }
              : undefined,
          },
        ],
      },
    };

    const url = new URL(DSN);
    const projectId = url.pathname.replace(/\//g, "");
    const auth = url.username;
    const host = url.host;

    await fetch(`https://${host}/api/${projectId}/store/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${auth}, sentry_client=rumo-pragas-edge/1.0`,
      },
      body: JSON.stringify(payload),
    });
  } catch (sentryErr) {
    // Never let Sentry failures break the caller. Just log to stderr.
    console.error(
      JSON.stringify({
        sentry: "transportFail",
        error: String(sentryErr),
      }),
    );
  }
}

function parseStackFrames(stack: string): Array<Record<string, unknown>> {
  return stack
    .split("\n")
    .slice(0, 20)
    .map((line) => ({ filename: line.trim() }));
}

/**
 * HOC to wrap a Deno.serve handler with Sentry capture.
 * Uncaught errors are captured, then re-thrown so existing error
 * handling logic in the caller still runs.
 */
export function withSentry(
  handler: (req: Request) => Promise<Response>,
  fnName: string,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    try {
      return await handler(req);
    } catch (err) {
      await captureError(err, {
        tags: { fn: fnName, method: req.method },
        extra: { url: req.url },
      });
      throw err;
    }
  };
}
