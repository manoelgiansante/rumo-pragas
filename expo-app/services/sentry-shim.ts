// -----------------------------------------------------------------------------
// Sentry shim — iOS 26 TurboModule crash defense
// -----------------------------------------------------------------------------
// Top-level `import * as Sentry from '@sentry/react-native'` evaluates the
// package index at JS bundle eval time, which on iOS 26 + New Architecture
// (TurboModules) can synchronously register native modules before the RN
// bridge is fully ready. Pattern responsible for cold-start SIGABRT crashes
// observed in Rumo Finance (build 22 reject 2026-04-27).
//
// This shim defers the require() to the first call, wraps every native call
// in try/catch, and degrades to no-op silently on failure. Services and hooks
// outside the root layout import THIS, never `@sentry/react-native` directly.
//
// The root layout (_layout.tsx) is the only file allowed to import Sentry
// directly because it owns the lazy `Sentry.init()` call inside useEffect
// (which is the canonical/safe init path) and the `Sentry.wrap(RootLayout)`
// HOC. Both are intentional and have been stable in production.
// -----------------------------------------------------------------------------

type Breadcrumb = {
  category?: string;
  message?: string;
  level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
  data?: Record<string, unknown>;
};

type CaptureContext = {
  extra?: Record<string, unknown>;
  tags?: Record<string, string>;
};

type CaptureMessageContext = CaptureContext & {
  level?: Breadcrumb['level'];
};

type CaptureMessageArgument = Breadcrumb['level'] | CaptureMessageContext;

type Scope = {
  setTag: (key: string, value: string) => void;
  setLevel: (level: Breadcrumb['level']) => void;
  setContext: (key: string, ctx: Record<string, unknown>) => void;
};

type SentryModule = {
  addBreadcrumb: (b: Breadcrumb) => void;
  captureException: (err: unknown, ctx?: CaptureContext) => void;
  captureMessage: (msg: string, context?: CaptureMessageArgument) => void;
  withScope: (cb: (scope: Scope) => void) => void;
};

let cached: SentryModule | null = null;
let triedLoad = false;

function loadSentry(): SentryModule | null {
  if (cached) return cached;
  if (triedLoad) return null;
  triedLoad = true;
  try {
    const mod = require('@sentry/react-native');
    cached = {
      addBreadcrumb: (b) => {
        try {
          mod.addBreadcrumb(b);
        } catch {
          /* swallow */
        }
      },
      captureException: (err, ctx) => {
        try {
          mod.captureException(err, ctx);
        } catch {
          /* swallow */
        }
      },
      captureMessage: (msg, context) => {
        try {
          mod.captureMessage(msg, context);
        } catch {
          /* swallow */
        }
      },
      withScope: (cb) => {
        try {
          mod.withScope(cb);
        } catch {
          /* swallow */
        }
      },
    };
    return cached;
  } catch {
    // Sentry not available (web preview, missing native module, etc.)
    return null;
  }
}

export function addBreadcrumb(b: Breadcrumb): void {
  loadSentry()?.addBreadcrumb(b);
}

export function captureException(err: unknown, ctx?: CaptureContext): void {
  loadSentry()?.captureException(err, ctx);
}

export function captureMessage(msg: string, context?: CaptureMessageArgument): void {
  loadSentry()?.captureMessage(msg, context);
}

export function withScope(cb: (scope: Scope) => void): void {
  loadSentry()?.withScope(cb);
}
