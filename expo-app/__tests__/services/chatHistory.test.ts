const mockMemory = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockMemory.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => mockMemory.set(key, value)),
    removeItem: jest.fn(async (key: string) => mockMemory.delete(key)),
  },
}));

import {
  chatHistoryKey,
  clearChatHistory,
  loadChatHistory,
  prepareChatHistoryForOwnerClaim,
  saveChatHistory,
} from '../../services/chatHistory';

const message = (id: string, content: string) => ({
  id,
  role: 'user' as const,
  content,
  timestamp: '2026-07-14T12:00:00.000Z',
});

describe('user-scoped chat history', () => {
  beforeEach(() => mockMemory.clear());

  it('never exposes one user history to another', async () => {
    await saveChatHistory('user-a', [message('a', 'private A')]);
    await saveChatHistory('user-b', [message('b', 'private B')]);
    expect((await loadChatHistory('user-a')).map((item) => item.content)).toEqual(['private A']);
    expect((await loadChatHistory('user-b')).map((item) => item.content)).toEqual(['private B']);
  });

  it('does not race the durable owner claim from a scoped render-time read', async () => {
    mockMemory.set(
      '@rumo_pragas_chat_history',
      JSON.stringify([message('legacy', 'previous user')]),
    );
    await expect(loadChatHistory('new-user')).resolves.toEqual([]);
    expect(mockMemory.has('@rumo_pragas_chat_history')).toBe(true);
  });

  it('first owner claims only valid legacy messages and keeps the newest 50', async () => {
    const valid = Array.from({ length: 55 }, (_, index) =>
      message(`legacy-${index}`, `message ${index}`),
    );
    mockMemory.set(
      '@rumo_pragas_chat_history',
      JSON.stringify([
        { id: 'bad', role: 'system', content: 'must not surface', timestamp: 'invalid' },
        ...valid,
      ]),
    );

    await prepareChatHistoryForOwnerClaim('user-a', { claimOwnerlessLegacy: true });

    const claimed = await loadChatHistory('user-a');
    expect(claimed).toHaveLength(50);
    expect(claimed[0]?.id).toBe('legacy-5');
    expect(claimed.at(-1)?.id).toBe('legacy-54');
    expect(claimed.some((item) => item.content === 'must not surface')).toBe(false);
    expect(mockMemory.has('@rumo_pragas_chat_history')).toBe(false);
  });

  it('account switch removes ownerless legacy history without transferring it', async () => {
    mockMemory.set('@rumo_pragas_chat_history', JSON.stringify([message('legacy', 'private A')]));

    await prepareChatHistoryForOwnerClaim('user-b', { claimOwnerlessLegacy: false });

    await expect(loadChatHistory('user-b')).resolves.toEqual([]);
    expect(mockMemory.has('@rumo_pragas_chat_history')).toBe(false);
  });

  it('persists an explicit empty scoped history for malformed legacy JSON', async () => {
    mockMemory.set('@rumo_pragas_chat_history', '{malformed');

    await prepareChatHistoryForOwnerClaim('user-a', { claimOwnerlessLegacy: true });

    await expect(loadChatHistory('user-a')).resolves.toEqual([]);
    expect(mockMemory.get(chatHistoryKey('user-a'))).toBe('[]');
    expect(mockMemory.has('@rumo_pragas_chat_history')).toBe(false);
  });

  it('clears only the requested user', async () => {
    await saveChatHistory('user-a', [message('a', 'A')]);
    await saveChatHistory('user-b', [message('b', 'B')]);
    await clearChatHistory('user-a');
    expect(mockMemory.has(chatHistoryKey('user-a'))).toBe(false);
    expect(mockMemory.has(chatHistoryKey('user-b'))).toBe(true);
  });
});
