const mockInvoke = jest.fn();
jest.mock('../../services/supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } },
}));

import {
  isDiagnosisFeedbackEligible,
  reportDiagnosisFeedback,
} from '../../services/diagnosisFeedback';

const DIAGNOSIS_ID = 'a1b2c3d4-e5f6-4789-8abc-1234567890ab';

beforeEach(() => {
  jest.clearAllMocks();
  mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });
});

describe('reportDiagnosisFeedback', () => {
  it('submits only the documented feedback fields with auth', async () => {
    await reportDiagnosisFeedback(
      {
        diagnosisId: DIAGNOSIS_ID,
        verdict: 'incorrect',
        selectedAlternative: 'Lagarta',
        notes: 'As lesões não coincidem',
      },
      'token-1',
      'feedback-idempotency-key',
    );
    expect(mockInvoke).toHaveBeenCalledWith('report-diagnosis-feedback', {
      body: {
        diagnosisId: DIAGNOSIS_ID,
        verdict: 'incorrect',
        selectedAlternative: 'Lagarta',
        notes: 'As lesões não coincidem',
      },
      headers: {
        Authorization: 'Bearer token-1',
        'Idempotency-Key': 'feedback-idempotency-key',
      },
    });
  });

  it('never includes a photo field', async () => {
    await reportDiagnosisFeedback(
      { diagnosisId: DIAGNOSIS_ID, verdict: 'correct' },
      'token-1',
      'feedback-idempotency-key',
    );
    expect(mockInvoke.mock.calls[0][1].body).toEqual({
      diagnosisId: DIAGNOSIS_ID,
      verdict: 'correct',
    });
  });

  it('fails before transport for transient or malformed diagnosis ids', async () => {
    await expect(
      reportDiagnosisFeedback(
        { diagnosisId: 'legacy_invalid', verdict: 'correct' },
        'token-1',
        'feedback-idempotency-key',
      ),
    ).rejects.toThrow('INVALID_FEEDBACK');
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(isDiagnosisFeedbackEligible(DIAGNOSIS_ID)).toBe(true);
    expect(isDiagnosisFeedbackEligible('diag-1')).toBe(false);
  });

  it('rejects an alternative unless the verdict is incorrect', async () => {
    await expect(
      reportDiagnosisFeedback(
        { diagnosisId: DIAGNOSIS_ID, verdict: 'correct', selectedAlternative: 'Ferrugem' },
        'token-1',
        'feedback-idempotency-key',
      ),
    ).rejects.toThrow('INVALID_FEEDBACK');
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('keeps the caller key and body stable on retry', async () => {
    const input = { diagnosisId: DIAGNOSIS_ID, verdict: 'unsure' as const };
    mockInvoke.mockResolvedValueOnce({ data: null, error: { message: 'timeout' } });
    await expect(reportDiagnosisFeedback(input, 'token-1', 'stable-key')).rejects.toThrow();
    mockInvoke.mockResolvedValueOnce({ data: { ok: true }, error: null });
    await reportDiagnosisFeedback(input, 'token-1', 'stable-key');
    expect(mockInvoke.mock.calls[0][1]).toEqual(mockInvoke.mock.calls[1][1]);
  });
});
