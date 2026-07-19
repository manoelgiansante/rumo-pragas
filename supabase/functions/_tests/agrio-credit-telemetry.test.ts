// IMPL-3 T2 — Agrio credit telemetry is default-ON and fail-safe.
// The 2026-07-06 credit blackout went dark because AGRIO_CREDIT_TELEMETRY_ENABLED
// shipped default-false. These tests lock, for BOTH twins (dedicated
// `diagnose-pragas` + legacy `diagnose`, which the public 1.0.9 binary calls):
// (1) telemetry runs with NO env configured; (2) only an explicit "false"
// disables it; (3) any telemetry failure resolves without throwing (ZERO-O —
// it must never break the diagnosis flow).
import { assert, assertEquals } from "@std/assert";
import { maybeCaptureAgrioBalance as dedicatedBalance } from "../diagnose-pragas/agrio.ts";
import { maybeCaptureAgrioBalance as legacyBalance } from "../diagnose/agrio.ts";

const ENV_KEY = "AGRIO_CREDIT_TELEMETRY_ENABLED";

function stubFetch(handler: () => Response) {
  const original = globalThis.fetch;
  const state = { calls: 0 };
  globalThis.fetch = ((..._args: unknown[]) => {
    state.calls++;
    return Promise.resolve(handler());
  }) as typeof fetch;
  return { state, restore: () => (globalThis.fetch = original) };
}

async function withEnv(value: string | null, run: () => Promise<void>) {
  const previous = Deno.env.get(ENV_KEY);
  if (value === null) Deno.env.delete(ENV_KEY);
  else Deno.env.set(ENV_KEY, value);
  try {
    await run();
  } finally {
    if (previous === undefined) Deno.env.delete(ENV_KEY);
    else Deno.env.set(ENV_KEY, previous);
  }
}

const okBody = () =>
  new Response(JSON.stringify({ message: "success!", numCredits: 900 }), { status: 200 });

const twins = [
  ["diagnose-pragas", dedicatedBalance],
  ["diagnose (legacy)", legacyBalance],
] as const;

for (const [slug, maybeCaptureAgrioBalance] of twins) {
  Deno.test(`${slug}: credit telemetry runs by DEFAULT (no env configured)`, async () => {
    await withEnv(null, async () => {
      const fetchStub = stubFetch(okBody);
      try {
        await maybeCaptureAgrioBalance({ apiKey: "test-key", requestId: "req-default" });
        assertEquals(fetchStub.state.calls, 1, "default-ON must hit /get-credit");
      } finally {
        fetchStub.restore();
      }
    });
  });

  Deno.test(`${slug}: explicit env "false" is the only kill-switch`, async () => {
    await withEnv("false", async () => {
      const fetchStub = stubFetch(okBody);
      try {
        await maybeCaptureAgrioBalance({ apiKey: "test-key", requestId: "req-off" });
        assertEquals(fetchStub.state.calls, 0, 'env "false" must disable telemetry');
      } finally {
        fetchStub.restore();
      }
    });
    await withEnv("true", async () => {
      const fetchStub = stubFetch(okBody);
      try {
        await maybeCaptureAgrioBalance({ apiKey: "test-key", requestId: "req-on" });
        assertEquals(fetchStub.state.calls, 1, 'env "true" keeps telemetry on');
      } finally {
        fetchStub.restore();
      }
    });
  });

  Deno.test(`${slug}: telemetry failures NEVER throw (fail-safe, ZERO-O)`, async () => {
    await withEnv(null, async () => {
      // Network layer throws.
      const original = globalThis.fetch;
      globalThis.fetch = (() => Promise.reject(new Error("boom"))) as typeof fetch;
      try {
        await maybeCaptureAgrioBalance({ apiKey: "test-key", requestId: "req-neterr" });
      } finally {
        globalThis.fetch = original;
      }
      // Upstream non-2xx.
      const bad = stubFetch(() => new Response("nope", { status: 500 }));
      try {
        await maybeCaptureAgrioBalance({ apiKey: "test-key", requestId: "req-500" });
      } finally {
        bad.restore();
      }
      // Malformed payload (no numCredits).
      const malformed = stubFetch(() =>
        new Response(JSON.stringify({ message: "success!" }), { status: 200 })
      );
      try {
        await maybeCaptureAgrioBalance({ apiKey: "test-key", requestId: "req-malformed" });
      } finally {
        malformed.restore();
      }
      // Reaching here without a throw is the assertion.
      assert(true);
    });
  });
}

Deno.test("both diagnose slugs invoke credit telemetry on the Agrio path", async () => {
  for (const path of ["../diagnose-pragas/index.ts", "../diagnose/index.ts"]) {
    const source = await Deno.readTextFile(new URL(path, import.meta.url));
    assert(
      source.includes("await maybeCaptureAgrioBalance({ apiKey: AGRIO_API_KEY, requestId })"),
      `${path} must call maybeCaptureAgrioBalance on the Agrio branch`,
    );
    assert(
      source.match(
        /maybeCaptureAgrioBalance\(\{ apiKey: AGRIO_API_KEY, requestId \}\)\s*\n?\s*\.catch\(\(\) => undefined\)/,
      ),
      `${path} call site must swallow telemetry failures`,
    );
  }
});
