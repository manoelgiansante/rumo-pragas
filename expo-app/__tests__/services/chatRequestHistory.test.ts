import { buildChatRequestHistory } from '../../services/chatRequestHistory';

describe('buildChatRequestHistory', () => {
  const prior = [{ id: 'assistant-1', role: 'assistant' as const, content: 'Olá' }];
  const pending = { id: 'request-1', role: 'user' as const, content: 'Manchas na folha' };

  it('produces an identical body after a lost response retry', () => {
    const firstAttempt = buildChatRequestHistory(prior, pending);
    const retryAttempt = buildChatRequestHistory([...prior, pending], pending);
    expect(retryAttempt).toEqual(firstAttempt);
    expect(retryAttempt.filter((message) => message.content === pending.content)).toHaveLength(1);
  });
});
