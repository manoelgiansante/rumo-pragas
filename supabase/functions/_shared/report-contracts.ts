import { z } from "zod";

const boundedText = (max: number) => z.string().trim().min(1).max(max);

export const reportReasonSchema = z.enum([
  "unsafe_recommendation",
  "incorrect_information",
  "harmful_content",
  "privacy",
  "other",
]);

export const reportAiContentSchema = z.object({
  messageId: boundedText(128).regex(/^[\p{L}\p{N}_.:\-]+$/u),
  content: boundedText(8_000),
  reason: reportReasonSchema,
  details: z.string().trim().max(2_000).optional(),
}).strict();

export const diagnosisFeedbackSchema = z.object({
  diagnosisId: z.string().uuid(),
  verdict: z.enum(["correct", "incorrect", "unsure"]),
  selectedAlternative: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(1_000).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.verdict !== "incorrect" && value.selectedAlternative) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["selectedAlternative"],
      message: "selectedAlternative is only accepted for an incorrect verdict",
    });
  }
});

export const adminReportPatchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["reviewing", "resolved", "dismissed"]),
  note: z.string().trim().max(2_000).optional(),
}).strict();

export const adminReportListSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(["received", "reviewing", "resolved", "dismissed"]).optional(),
  reason: reportReasonSchema.optional(),
});

export function isPragasAdmin(appMetadata: Record<string, unknown> | undefined): boolean {
  return appMetadata?.pragas_admin === true;
}

export function adminAuthorizationStatus(
  user: { app_metadata?: Record<string, unknown> } | null,
): 200 | 401 | 403 {
  if (!user) return 401;
  return isPragasAdmin(user.app_metadata) ? 200 : 403;
}

export function buildAiContentReportRow(
  authenticatedUserId: string,
  submissionKey: string,
  input: z.infer<typeof reportAiContentSchema>,
): Record<string, unknown> {
  return {
    user_id: authenticatedUserId,
    submission_key: submissionKey,
    message_id: input.messageId,
    content: input.content,
    reason: input.reason,
    details: input.details || null,
    status: "received",
  };
}
