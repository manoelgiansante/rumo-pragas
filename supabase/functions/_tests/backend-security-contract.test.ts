import { assertEquals, assertStringIncludes } from "@std/assert";
import { normalizeRateLimitResult, resolveIdempotencyKey } from "../_shared/durable-rate-limit.ts";

Deno.test("rate-limit result parser is fail-closed", () => {
  assertEquals(normalizeRateLimitResult(null), null);
  assertEquals(
    normalizeRateLimitResult({ allowed: true, remaining: 4, reset_at: "invalid" }),
    null,
  );
  const parsed = normalizeRateLimitResult({
    allowed: false,
    replayed: true,
    remaining: 0,
    reset_at: "2026-07-14T12:00:00.000Z",
    retry_after_seconds: 45,
  });
  assertEquals(parsed?.allowed, false);
  assertEquals(parsed?.replayed, true);
  assertEquals(parsed?.retryAfterSeconds, 45);
});

Deno.test("idempotency key accepts UUID header and otherwise uses request id", () => {
  const header = crypto.randomUUID();
  const requestId = crypto.randomUUID();
  assertEquals(resolveIdempotencyKey(header, requestId), header);
  assertEquals(resolveIdempotencyKey("not-a-uuid", requestId), requestId);
});

Deno.test("security migration remains app-scoped and service-role-only", async () => {
  const sql = await Deno.readTextFile(
    new URL("../../migrations/20260715171000_pragas_prod_compat_runtime.sql", import.meta.url),
  );
  assertStringIncludes(sql, "pragas_ai_content_reports");
  assertStringIncludes(sql, "pragas_diagnosis_feedback");
  assertStringIncludes(sql, "pragas_api_rate_limit_counters");
  assertStringIncludes(sql, "cleanup_pragas_user_rows");
  assertStringIncludes(sql, "pragas_diagnosis_usage");
  assertStringIncludes(sql, "pragas_community_posts");
  assertStringIncludes(sql, "pragas_outbreak_confirmations");
  assertStringIncludes(sql, "app = 'rumo-pragas'");
  assertStringIncludes(sql, "ENABLE ROW LEVEL SECURITY");
  assertStringIncludes(sql, "FORCE ROW LEVEL SECURITY");
  assertStringIncludes(sql, "REVOKE EXECUTE");
  assertStringIncludes(sql, "TO service_role");
  assertEquals(sql.includes("DROP TRIGGER %I ON auth.users"), false);
  assertEquals(sql.includes("pragas_webhook_events"), false);
  assertEquals(sql.includes("byfgflxlmcdciupjpoaz"), false);
});

Deno.test("legacy feedback drift is upgraded without dropping historical columns or policies", async () => {
  const sql = await Deno.readTextFile(
    new URL("../../migrations/20260715171000_pragas_prod_compat_runtime.sql", import.meta.url),
  );
  const endpoint = await Deno.readTextFile(
    new URL("../report-diagnosis-feedback/index.ts", import.meta.url),
  );
  assertStringIncludes(sql, "ADD COLUMN IF NOT EXISTS verdict");
  assertStringIncludes(sql, "feedback text NOT NULL DEFAULT 'unsure'");
  assertStringIncludes(sql, "comment text");
  assertStringIncludes(sql, "NEW.verdict := CASE NEW.feedback");
  assertStringIncludes(sql, "NEW.feedback := v_expected_feedback");
  assertStringIncludes(sql, "pragas_feedback_contract_mismatch");
  assertStringIncludes(sql, "FROM pg_policies");
  assertStringIncludes(sql, "pragas_prod_compat_feedback_select_own");
  assertStringIncludes(sql, "pragas_prod_compat_feedback_insert_own");
  assertEquals(sql.includes("DROP POLICY %I ON public.pragas_diagnosis_feedback"), false);
  assertEquals(sql.includes("DROP COLUMN feedback"), false);
  assertEquals(sql.includes("DROP COLUMN comment"), false);
  assertStringIncludes(endpoint, 'parsed.data.verdict === "correct"');
  assertStringIncludes(endpoint, '? "positive"');
  assertStringIncludes(endpoint, '? "negative"');
  assertStringIncludes(endpoint, "feedback: legacyFeedback");
  assertStringIncludes(
    endpoint,
    '"id, diagnosis_id, verdict, feedback, selected_alternative, notes, created_at, updated_at"',
  );
});

Deno.test("account deletion never deletes shared auth identity and exposes precise states", async () => {
  const endpoint = await Deno.readTextFile(
    new URL("../pragas-delete-user-account/index.ts", import.meta.url),
  );
  const worker = await Deno.readTextFile(
    new URL("../pragas-process-deletions/index.ts", import.meta.url),
  );
  const cleanup = await Deno.readTextFile(
    new URL("../_shared/account-cleanup.ts", import.meta.url),
  );
  assertEquals(endpoint.includes("auth.admin.deleteUser"), false);
  assertEquals(worker.includes("auth.admin.deleteUser"), false);
  assertEquals(worker.includes("atob("), false);
  assertStringIncludes(endpoint, "APP_SCOPED_DATA_DELETED_SHARED_HISTORY_RETAINED");
  assertStringIncludes(endpoint, "appScopedDataDeletionComplete: true");
  assertStringIncludes(endpoint, "appDataDeletionComplete: false");
  assertStringIncludes(endpoint, "APP_DATA_DELETION_INCOMPLETE");
  assertStringIncludes(cleanup, 'admin.rpc("cleanup_pragas_user_rows"');
});

Deno.test("AI provider routes enforce durable consent, strict idempotency and coarse location", async () => {
  const diagnosis = await Deno.readTextFile(
    new URL("../diagnose-pragas/index.ts", import.meta.url),
  );
  const chat = await Deno.readTextFile(new URL("../ai-chat-pragas/index.ts", import.meta.url));
  for (const source of [diagnosis, chat]) {
    assertStringIncludes(source, "validatePragasAIConsentHeaders");
    assertStringIncludes(source, "recordPragasAIConsent");
    assertStringIncludes(source, "requireUUIDIdempotencyKey");
    assertStringIncludes(source, "reservePragasAIRequest");
    assertStringIncludes(source, "markPragasAIProviderStarted");
    assertStringIncludes(source, "completePragasAIRequest");
    assertStringIncludes(source, "idempotency_unknown_outcome_new_key_required");
    assertEquals(source.includes("resolveIdempotencyKey"), false);
  }
  assertStringIncludes(diagnosis, "normalizePragasCoordinates");
  assertStringIncludes(diagnosis, "location_lat: safeCoords.lat");
  assertEquals(chat.includes("rumo-vet"), false);
});

Deno.test("Sentry identifier scrubbing fails privacy-safe when the secret salt is absent", async () => {
  const sentry = await Deno.readTextFile(new URL("../_shared/pragas-sentry.ts", import.meta.url));
  assertStringIncludes(sentry, 'if (!PII_HASH_SALT) return "anon_redacted"');
  assertEquals(sentry.includes('SENTRY_PII_HASH_SALT") ??'), false);
});
