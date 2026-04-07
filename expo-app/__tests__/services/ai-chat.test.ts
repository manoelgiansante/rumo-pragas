/**
 * Tests for services/ai-chat.ts
 */
import i18n from '../../i18n';

// Mock supabase
jest.mock('../../services/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
    },
  },
}));

// Mock config
jest.mock('../../constants/config', () => ({
  Config: {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-key',
  },
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

import { sendChatMessage } from '../../services/ai-chat';
import { supabase } from '../../services/supabase';

const mockGetSession = supabase.auth.getSession as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: 'test-token' } },
    error: null,
  });
});

describe('sendChatMessage', () => {
  it('throws when user is not authenticated (no session)', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await expect(sendChatMessage([{ role: 'user', content: 'Hello' }])).rejects.toThrow(
      i18n.t('aiChat.loginRequired'),
    );
  });

  it('throws when getSession returns an error', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: new Error('Session expired'),
    });

    await expect(sendChatMessage([{ role: 'user', content: 'Hello' }])).rejects.toThrow(
      i18n.t('aiChat.loginRequired'),
    );
  });

  it('sends messages to the correct endpoint with auth header', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ response: 'AI reply' }),
    });

    await sendChatMessage([{ role: 'user', content: 'What pest is this?' }]);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://test.supabase.co/functions/v1/ai-chat',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('returns the response text on success', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ response: 'This looks like soybean rust' }),
    });

    const result = await sendChatMessage([{ role: 'user', content: 'Help' }]);
    expect(result).toBe('This looks like soybean rust');
  });

  it('throws on empty response from AI', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await expect(sendChatMessage([{ role: 'user', content: 'Help' }])).rejects.toThrow(
      i18n.t('aiChat.emptyResponse'),
    );
  });

  it('handles 401 with session expired message', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({}),
    });

    await expect(sendChatMessage([{ role: 'user', content: 'Hi' }])).rejects.toThrow(
      i18n.t('aiChat.sessionExpired'),
    );
  });

  it('handles 403 with CHAT_LIMIT_REACHED code', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: () =>
        Promise.resolve({
          code: 'CHAT_LIMIT_REACHED',
          error: 'Você atingiu o limite',
        }),
    });

    const err = await sendChatMessage([{ role: 'user', content: 'Hi' }]).catch((e) => e);
    expect(err.message).toBe('Você atingiu o limite');
    expect(err.code).toBe('CHAT_LIMIT_REACHED');
  });

  it('handles 403 without special code as no permission', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({}),
    });

    await expect(sendChatMessage([{ role: 'user', content: 'Hi' }])).rejects.toThrow(
      i18n.t('aiChat.noPermission'),
    );
  });

  it('handles 429 rate limit', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      json: () => Promise.resolve({}),
    });

    await expect(sendChatMessage([{ role: 'user', content: 'Hi' }])).rejects.toThrow(
      i18n.t('aiChat.tooManyMessages'),
    );
  });

  it('handles 500+ server error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.resolve({}),
    });

    await expect(sendChatMessage([{ role: 'user', content: 'Hi' }])).rejects.toThrow(
      i18n.t('aiChat.serviceUnavailable'),
    );
  });

  it('handles unknown error status with generic message', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 418,
      json: () => Promise.resolve({}),
    });

    await expect(sendChatMessage([{ role: 'user', content: 'Hi' }])).rejects.toThrow(
      i18n.t('aiChat.genericError'),
    );
  });

  it('handles JSON parse failure on error response body', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('invalid json')),
    });

    // Should still throw a sanitized error even if body is unparseable
    await expect(sendChatMessage([{ role: 'user', content: 'Hi' }])).rejects.toThrow(
      i18n.t('aiChat.serviceUnavailable'),
    );
  });

  it('maps assistant role correctly in request body', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ response: 'ok' }),
    });

    await sendChatMessage([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
      { role: 'system', content: 'System msg' },
    ]);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages).toEqual([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
      { role: 'assistant', content: 'System msg' },
    ]);
  });
});
