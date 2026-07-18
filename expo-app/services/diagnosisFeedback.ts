import { supabase } from './supabase';

export type DiagnosisFeedbackVerdict = 'correct' | 'incorrect' | 'unsure';

export interface DiagnosisFeedbackInput {
  diagnosisId: string;
  verdict: DiagnosisFeedbackVerdict;
  selectedAlternative?: string;
  notes?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isDiagnosisFeedbackEligible(diagnosisId: unknown): diagnosisId is string {
  return typeof diagnosisId === 'string' && UUID_RE.test(diagnosisId);
}

export async function reportDiagnosisFeedback(
  input: DiagnosisFeedbackInput,
  accessToken: string,
  idempotencyKey: string,
): Promise<void> {
  const diagnosisId = input.diagnosisId.trim();
  const selectedAlternative = input.selectedAlternative?.trim();
  const notes = input.notes?.trim();
  if (!accessToken.trim()) throw new Error('AUTH_REQUIRED');
  if (!idempotencyKey.trim()) throw new Error('IDEMPOTENCY_REQUIRED');
  if (!isDiagnosisFeedbackEligible(diagnosisId)) throw new Error('INVALID_FEEDBACK');
  if (input.verdict !== 'incorrect' && selectedAlternative) throw new Error('INVALID_FEEDBACK');
  if ((selectedAlternative?.length ?? 0) > 200 || (notes?.length ?? 0) > 1_000) {
    throw new Error('FEEDBACK_TOO_LARGE');
  }

  const body: DiagnosisFeedbackInput = { diagnosisId, verdict: input.verdict };
  if (selectedAlternative) body.selectedAlternative = selectedAlternative;
  if (notes) body.notes = notes;

  const { error } = await supabase.functions.invoke('report-diagnosis-feedback', {
    body,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Idempotency-Key': idempotencyKey,
    },
  });
  if (error) throw new Error('FEEDBACK_FAILED');
}
