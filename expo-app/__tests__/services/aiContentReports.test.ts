const mockInvoke = jest.fn();
jest.mock('../../services/supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } },
}));

import { reportAIContent } from '../../services/aiContentReports';

beforeEach(() => {
  jest.clearAllMocks();
  mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });
});

describe('reportAIContent', () => {
  it('calls the report-ai-content function with the exact authenticated body', async () => {
    await reportAIContent(
      {
        messageId: 'msg-1',
        content: 'Resposta',
        reason: 'incorrect_information',
        details: 'Detalhe',
      },
      'token-1',
      'ai-report-idempotency-key',
    );
    expect(mockInvoke).toHaveBeenCalledWith('report-ai-content', {
      body: {
        messageId: 'msg-1',
        content: 'Resposta',
        reason: 'incorrect_information',
        details: 'Detalhe',
      },
      headers: {
        Authorization: 'Bearer token-1',
        'Idempotency-Key': 'ai-report-idempotency-key',
      },
    });
  });

  it('omits blank optional details', async () => {
    await reportAIContent(
      { messageId: 'msg-1', content: 'Resposta', reason: 'other', details: '  ' },
      'token-1',
      'ai-report-idempotency-key',
    );
    expect(mockInvoke.mock.calls[0][1].body).toEqual({
      messageId: 'msg-1',
      content: 'Resposta',
      reason: 'other',
    });
  });

  it('surfaces backend failure', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'failed' } });
    await expect(
      reportAIContent(
        { messageId: 'msg-1', content: 'Resposta', reason: 'harmful_content' },
        'token-1',
        'ai-report-idempotency-key',
      ),
    ).rejects.toThrow('REPORT_FAILED');
  });

  it('reuses the caller operation key across a response-lost retry', async () => {
    const input = { messageId: 'msg-1', content: 'Resposta', reason: 'other' as const };
    mockInvoke.mockResolvedValueOnce({ data: null, error: { message: 'network' } });
    await expect(reportAIContent(input, 'token-1', 'stable-key')).rejects.toThrow();
    mockInvoke.mockResolvedValueOnce({ data: { ok: true }, error: null });
    await reportAIContent(input, 'token-1', 'stable-key');
    expect(mockInvoke.mock.calls.map((call) => call[1].headers['Idempotency-Key'])).toEqual([
      'stable-key',
      'stable-key',
    ]);
    expect(mockInvoke.mock.calls[1][1].body).toEqual(mockInvoke.mock.calls[0][1].body);
  });
});
