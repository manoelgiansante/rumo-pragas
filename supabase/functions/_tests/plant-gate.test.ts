// 2026-07-22 — plant-gate contract (pre-provider Gemini check for the
// diagnose twins). Locks the four outcome paths (blocked/pass/unsure/error),
// the flag-off short-circuit, and — most importantly — that the gate is
// FAIL-OPEN and NEVER throws: any gate failure must let the (paid) diagnosis
// proceed instead of blocking a legitimate user.
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { runPlantGate } from "../_shared/plant-gate.ts";

function geminiResponse(text: string, status = 200): Response {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

const BASE = {
  base64: "aGVsbG8=",
  mediaType: "image/jpeg",
  enabled: true,
  apiKey: "test-gemini-key-123",
};

Deno.test("plant gate: verdict 'no' → blocked (provider must be skipped)", async () => {
  const outcome = await runPlantGate({
    ...BASE,
    fetchImpl: () => Promise.resolve(geminiResponse('{"is_plant":"no"}')),
  });
  assertEquals(outcome, "blocked");
});

Deno.test("plant gate: verdict 'yes' → pass", async () => {
  const outcome = await runPlantGate({
    ...BASE,
    fetchImpl: () => Promise.resolve(geminiResponse('{"is_plant":"yes"}')),
  });
  assertEquals(outcome, "pass");
});

Deno.test("plant gate: verdict 'unsure' → unsure (fail-open: proceeds to provider)", async () => {
  const outcome = await runPlantGate({
    ...BASE,
    fetchImpl: () => Promise.resolve(geminiResponse('{"is_plant":"unsure"}')),
  });
  assertEquals(outcome, "unsure");
});

Deno.test("plant gate: markdown-fenced JSON still parses", async () => {
  const outcome = await runPlantGate({
    ...BASE,
    fetchImpl: () => Promise.resolve(geminiResponse('```json\n{"is_plant":"no"}\n```')),
  });
  assertEquals(outcome, "blocked");
});

Deno.test("plant gate: flag off → 'off' without any network call", async () => {
  let calls = 0;
  const outcome = await runPlantGate({
    ...BASE,
    enabled: false,
    fetchImpl: () => {
      calls++;
      return Promise.resolve(geminiResponse('{"is_plant":"no"}'));
    },
  });
  assertEquals(outcome, "off");
  assertEquals(calls, 0);
});

Deno.test("plant gate: HTTP 500 → 'error' (fail-open), onError sees sanitized message", async () => {
  const captured: Error[] = [];
  const outcome = await runPlantGate({
    ...BASE,
    fetchImpl: () => Promise.resolve(geminiResponse("", 500)),
    onError: (e) => {
      captured.push(e);
    },
  });
  assertEquals(outcome, "error");
  assertEquals(captured.length, 1);
  assertStringIncludes(captured[0].message, "plant_gate_http_500");
});

Deno.test("plant gate: network rejection → 'error', never throws", async () => {
  const outcome = await runPlantGate({
    ...BASE,
    fetchImpl: () => Promise.reject(new TypeError("connection reset")),
  });
  assertEquals(outcome, "error");
});

Deno.test("plant gate: timeout aborts and resolves 'error' (never hangs, never throws)", async () => {
  const outcome = await runPlantGate({
    ...BASE,
    timeoutMs: 5,
    fetchImpl: (_u, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      }),
  });
  assertEquals(outcome, "error");
});

Deno.test("plant gate: unparseable verdict → 'error' fail-open", async () => {
  const outcome = await runPlantGate({
    ...BASE,
    fetchImpl: () => Promise.resolve(geminiResponse("sure looks like a plant to me")),
  });
  assertEquals(outcome, "error");
});

Deno.test("plant gate: missing api key → 'error' fail-open (no fetch attempted)", async () => {
  let calls = 0;
  const outcome = await runPlantGate({
    ...BASE,
    apiKey: "",
    fetchImpl: () => {
      calls++;
      return Promise.resolve(geminiResponse('{"is_plant":"no"}'));
    },
  });
  assertEquals(outcome, "error");
  assertEquals(calls, 0);
});

Deno.test("plant gate: a throwing onError hook never breaks the fail-open contract", async () => {
  const outcome = await runPlantGate({
    ...BASE,
    fetchImpl: () => Promise.reject(new Error("boom")),
    onError: () => {
      throw new Error("sentry itself exploded");
    },
  });
  assertEquals(outcome, "error");
});

Deno.test("plant gate: the api key never leaks into the onError message", async () => {
  const captured: Error[] = [];
  const outcome = await runPlantGate({
    ...BASE,
    fetchImpl: () => Promise.reject(new Error(`401 unauthorized for key ${BASE.apiKey}`)),
    onError: (e) => {
      captured.push(e);
    },
  });
  assertEquals(outcome, "error");
  assertEquals(captured.length, 1);
  assert(!captured[0].message.includes(BASE.apiKey), "api key leaked into error message");
  assertStringIncludes(captured[0].message, "[REDACTED]");
});

Deno.test("plant gate: FAIL-OPEN sweep — no combination of failures ever throws", async () => {
  const failures: Array<() => Promise<Response>> = [
    () => Promise.reject(new Error("net down")),
    () => Promise.resolve(geminiResponse("", 429)),
    () => Promise.resolve(geminiResponse("", 503)),
    () => Promise.resolve(new Response("not json at all", { status: 200 })),
    () => Promise.resolve(geminiResponse('{"is_plant":"banana"}')),
    () => {
      throw new Error("sync throw");
    },
  ];
  for (const fetchImpl of failures) {
    const outcome = await runPlantGate({ ...BASE, fetchImpl });
    assertEquals(outcome, "error");
  }
});
