import { assertEquals, assertFalse, assertThrows } from "@std/assert";
import {
  adminAuthorizationStatus,
  adminReportPatchSchema,
  buildAiContentReportRow,
  diagnosisFeedbackSchema,
  isPragasAdmin,
  reportAiContentSchema,
} from "../_shared/report-contracts.ts";

Deno.test("report content contract accepts bounded owner input and rejects injected userId", () => {
  const parsed = reportAiContentSchema.parse({
    messageId: "msg_123",
    content: "Resposta recebida",
    reason: "unsafe_recommendation",
    details: "Incluiu orientação de aplicação.",
  });
  assertEquals(parsed.messageId, "msg_123");
  const row = buildAiContentReportRow(
    "0190c64e-7a3b-7c96-8d85-92d148c92e55",
    "0190c64e-7a3b-7c96-8d85-92d148c92e56",
    parsed,
  );
  assertEquals(row.user_id, "0190c64e-7a3b-7c96-8d85-92d148c92e55");

  assertThrows(() =>
    reportAiContentSchema.parse({
      messageId: "msg_123",
      content: "Resposta",
      reason: "other",
      userId: "00000000-0000-0000-0000-000000000000",
    })
  );
});

Deno.test("diagnosis feedback is not a ground-truth claim and has strict verdicts", () => {
  const parsed = diagnosisFeedbackSchema.parse({
    diagnosisId: "0190c64e-7a3b-7c96-8d85-92d148c92e55",
    verdict: "incorrect",
    selectedAlternative: "Ferrugem",
    notes: "A imagem estava desfocada.",
  });
  assertEquals(parsed.verdict, "incorrect");
  assertThrows(() =>
    diagnosisFeedbackSchema.parse({
      diagnosisId: "0190c64e-7a3b-7c96-8d85-92d148c92e55",
      verdict: "confirmed_ground_truth",
    })
  );
});

Deno.test("admin authorization is app-scoped and fail-closed", () => {
  assertEquals(adminAuthorizationStatus(null), 401);
  assertEquals(adminAuthorizationStatus({ app_metadata: {} }), 403);
  assertEquals(adminAuthorizationStatus({ app_metadata: { pragas_admin: true } }), 200);
  assertFalse(isPragasAdmin(undefined));
  assertFalse(isPragasAdmin({ pragas_admin: false }));
  assertFalse(isPragasAdmin({ role: "admin" }));
  assertEquals(isPragasAdmin({ pragas_admin: true }), true);
});

Deno.test("admin transitions and review notes are bounded", () => {
  assertEquals(
    adminReportPatchSchema.parse({ id: crypto.randomUUID(), status: "reviewing", note: "Triagem" })
      .status,
    "reviewing",
  );
  assertThrows(() =>
    adminReportPatchSchema.parse({
      id: crypto.randomUUID(),
      status: "received",
      note: "x".repeat(2001),
    })
  );
});
