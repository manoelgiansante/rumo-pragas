import { assertEquals, assertNotEquals } from "@std/assert";
import {
  normalizeAIReservation,
  normalizePragasCoordinates,
  requireUUIDIdempotencyKey,
  sha256Hex,
} from "../_shared/ai-idempotency.ts";
import {
  PRAGAS_AI_CONSENT_VERSION,
  validatePragasAIConsentHeaders,
} from "../_shared/ai-consent.ts";
import { classifyPragasAppAccess } from "../_shared/pragas-edge.ts";

Deno.test("AI consent headers require the exact version and route purpose", () => {
  const accepted = new Headers({
    "X-Pragas-AI-Consent-Version": PRAGAS_AI_CONSENT_VERSION,
    "X-Pragas-AI-Consent-Purpose": "diagnosis",
  });
  assertEquals(validatePragasAIConsentHeaders(accepted, "diagnosis"), {
    ok: true,
    version: PRAGAS_AI_CONSENT_VERSION,
    purpose: "diagnosis",
  });
  assertEquals(validatePragasAIConsentHeaders(new Headers(), "diagnosis"), {
    ok: false,
    code: "ai_consent_required",
  });
  assertEquals(validatePragasAIConsentHeaders(accepted, "chat"), {
    ok: false,
    code: "ai_consent_mismatch",
  });
  accepted.set("X-Pragas-AI-Consent-Version", "2026-07-14.0");
  assertEquals(validatePragasAIConsentHeaders(accepted, "diagnosis"), {
    ok: false,
    code: "ai_consent_mismatch",
  });
});

Deno.test("AI routes require a UUID idempotency key without a generated fallback", () => {
  const idempotencyHeader = "0190c64e-7a3b-7c96-8d85-92d148c92e55";
  assertEquals(requireUUIDIdempotencyKey(idempotencyHeader.toUpperCase()), idempotencyHeader);
  assertEquals(requireUUIDIdempotencyKey(null), null);
  assertEquals(requireUUIDIdempotencyKey("not-a-uuid"), null);
  assertEquals(requireUUIDIdempotencyKey("00000000-0000-0000-0000-000000000000"), null);
});

Deno.test("AI reservation parser distinguishes replay, concurrency, conflicts and expiry", () => {
  assertEquals(
    normalizeAIReservation({
      state: "reserved",
      lease_token: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      reclaimed: true,
    }),
    {
      state: "reserved",
      leaseToken: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      reclaimed: true,
    },
  );
  assertEquals(normalizeAIReservation({ state: "reserved" }), { state: "unavailable" });
  assertEquals(normalizeAIReservation({ state: "in_progress", retry_after_seconds: 4.1 }), {
    state: "in_progress",
    retryAfterSeconds: 5,
  });
  assertEquals(normalizeAIReservation({ state: "conflict" }), { state: "conflict" });
  assertEquals(normalizeAIReservation({ state: "expired" }), { state: "expired" });
  assertEquals(normalizeAIReservation({ state: "unknown_outcome" }), {
    state: "unknown_outcome",
  });
  assertEquals(
    normalizeAIReservation({
      state: "completed",
      response_status: 200,
      response_body: { response: "cached" },
    }),
    {
      state: "completed",
      responseStatus: 200,
      responseBody: { response: "cached" },
    },
  );
  assertEquals(normalizeAIReservation({ state: "completed", response_status: 200 }), {
    state: "unavailable",
  });
});

Deno.test("location is range checked as a pair and coarsened before any downstream use", () => {
  assertEquals(normalizePragasCoordinates(-23.5505199, -46.633308), {
    lat: -23.55,
    lng: -46.63,
  });
  assertEquals(normalizePragasCoordinates(90, 180), { lat: 90, lng: 180 });
  assertEquals(normalizePragasCoordinates(90.001, 0), { lat: null, lng: null });
  assertEquals(normalizePragasCoordinates(0, 180.001), { lat: null, lng: null });
  assertEquals(normalizePragasCoordinates(12.34, null), { lat: null, lng: null });
  assertEquals(normalizePragasCoordinates(Number.NaN, 1), { lat: null, lng: null });
});

Deno.test("request fingerprints are deterministic and content-sensitive without storing input", async () => {
  const first = await sha256Hex('{"message":"a"}');
  const replay = await sha256Hex('{"message":"a"}');
  const changed = await sha256Hex('{"message":"b"}');
  assertEquals(first, replay);
  assertEquals(first.length, 64);
  assertNotEquals(first, changed);
});

Deno.test("Pragas access requires an explicit link, profile and active app subscription", () => {
  assertEquals(classifyPragasAppAccess(null, false, true, true), { state: "unlinked" });
  assertEquals(classifyPragasAppAccess(null, true, false, true), { state: "unlinked" });
  assertEquals(classifyPragasAppAccess(null, true, true, false), { state: "unlinked" });
  assertEquals(classifyPragasAppAccess(null, true, true, true), { state: "active" });
  assertEquals(
    classifyPragasAppAccess({ status: "requested" }, true, true, true),
    { state: "deletion_pending" },
  );
  assertEquals(
    classifyPragasAppAccess(
      {
        status: "blocked_global_decision",
        app_cleanup_completed_at: "2026-07-14T12:00:00Z",
      },
      false,
      false,
      false,
    ),
    {
      state: "deleted_reactivation_required",
      completedAt: "2026-07-14T12:00:00Z",
    },
  );
  assertEquals(
    classifyPragasAppAccess({ status: "reactivated" }, true, true, true),
    { state: "active" },
  );
  assertEquals(
    classifyPragasAppAccess({ status: "reactivated" }, true, true, false),
    { state: "unlinked" },
  );
});
