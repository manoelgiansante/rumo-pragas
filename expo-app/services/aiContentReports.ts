import { supabase } from './supabase';

export type AIContentReportReason =
  | 'unsafe_recommendation'
  | 'incorrect_information'
  | 'harmful_content'
  | 'privacy'
  | 'other';

export interface AIContentReportInput {
  messageId: string;
  content: string;
  reason: AIContentReportReason;
  details?: string;
}

export async function reportAIContent(
  input: AIContentReportInput,
  accessToken: string,
  idempotencyKey: string,
): Promise<void> {
  const messageId = input.messageId.trim();
  const content = input.content.trim();
  const details = input.details?.trim();
  if (!accessToken.trim()) throw new Error('AUTH_REQUIRED');
  if (!idempotencyKey.trim()) throw new Error('IDEMPOTENCY_REQUIRED');
  if (!messageId || !content) throw new Error('INVALID_REPORT');
  if (content.length > 8_000 || (details?.length ?? 0) > 2_000) {
    throw new Error('REPORT_TOO_LARGE');
  }

  const body: AIContentReportInput = {
    messageId,
    content,
    reason: input.reason,
  };
  if (details) body.details = details;

  const { error } = await supabase.functions.invoke('report-ai-content', {
    body,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Idempotency-Key': idempotencyKey,
    },
  });
  if (error) throw new Error('REPORT_FAILED');
}
