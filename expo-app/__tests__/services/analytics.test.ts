/**
 * Tests for services/analytics.ts
 */

// --- Mocks ---
const mockInvoke = jest.fn();
let mockUuidCounter = 0;
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => {
    mockUuidCounter += 1;
    return `00000000-0000-4000-8000-${String(mockUuidCounter).padStart(12, '0')}`;
  }),
}));
// Captures the onAuthStateChange callback registered by services/analytics.ts
// at module load so tests can simulate an authenticated in-memory session
// (name is `mock`-prefixed so jest allows the out-of-scope factory reference).
let mockAuthCallback:
  | ((event: string, session: { access_token?: string; user?: { id: string } } | null) => void)
  | undefined;
jest.mock('../../services/supabase', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
    auth: {
      onAuthStateChange: (
        cb: (
          event: string,
          session: { access_token?: string; user?: { id: string } } | null,
        ) => void,
      ) => {
        mockAuthCallback = cb;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      },
    },
  },
}));

const TEST_ACCESS_TOKEN = 'test-jwt-token';

function authenticate(userId: string, accessToken = TEST_ACCESS_TOKEN): void {
  mockAuthCallback?.('SIGNED_IN', { access_token: accessToken, user: { id: userId } });
}

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

import {
  initAnalytics,
  resetAnalytics,
  trackEvent,
  trackScreenView,
  trackDiagnosisStarted,
  trackDiagnosisCompleted,
  trackChatMessage,
  trackShareDiagnosis,
  trackLanguageChanged,
  trackError,
} from '../../services/analytics';

beforeEach(() => {
  jest.useFakeTimers();
  mockInvoke.mockResolvedValue({ error: null });
  // Reset state: flush remaining events and clear timers
  resetAnalytics();
  jest.clearAllMocks();
  mockInvoke.mockResolvedValue({ error: null });
  // Simulate an authenticated in-memory session so the flush has a live token
  // (the edge fn requires auth; without a token the flush intentionally no-ops).
  authenticate('user-1');
});

afterEach(() => {
  jest.useRealTimers();
});

describe('initAnalytics', () => {
  it('sets the user ID for subsequent events', () => {
    initAnalytics('user-1');
    trackEvent('test_event');

    jest.advanceTimersByTime(35000);

    expect(mockInvoke).toHaveBeenCalledWith('pragas-analytics', {
      body: {
        events: expect.arrayContaining([
          expect.objectContaining({
            event: 'test_event',
            eventId: expect.stringMatching(/^[0-9a-f-]{36}$/),
            platform: 'ios',
          }),
        ]),
      },
      headers: {
        Authorization: `Bearer ${TEST_ACCESS_TOKEN}`,
        'Idempotency-Key': expect.stringMatching(/^[0-9a-f-]{36}$/),
      },
    });
  });
});

describe('resetAnalytics', () => {
  it('clears queued events without sending them across the logout boundary', () => {
    initAnalytics('user-456');
    trackEvent('before_reset');

    mockInvoke.mockClear();
    resetAnalytics();

    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

describe('auth token (web-safe flush — cicatriz ed9906a)', () => {
  it('sends the in-memory user JWT (never the anon key) as Authorization', () => {
    initAnalytics('user-1');
    trackEvent('authed_event');
    jest.advanceTimersByTime(31000);

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke.mock.calls[0][1].headers).toEqual(
      expect.objectContaining({ Authorization: `Bearer ${TEST_ACCESS_TOKEN}` }),
    );
  });

  it('does NOT hit the edge fn while signed out (would 401 on the anon key)', () => {
    // Simulate sign-out: onAuthStateChange clears the in-memory token.
    mockAuthCallback?.('SIGNED_OUT', null);

    initAnalytics('user-1');
    trackEvent('event_while_logged_out');
    jest.advanceTimersByTime(31000);

    expect(mockInvoke).not.toHaveBeenCalled();

    // Once a session returns, the queued event flushes with the fresh token.
    authenticate('user-1');
    trackEvent('event_after_sign_in');
    jest.advanceTimersByTime(31000);

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke.mock.calls[0][1].headers).toEqual(
      expect.objectContaining({ Authorization: `Bearer ${TEST_ACCESS_TOKEN}` }),
    );
    const events = mockInvoke.mock.calls[0][1].body.events;
    expect(events).toContainEqual(expect.objectContaining({ event: 'event_after_sign_in' }));
    expect(events).not.toContainEqual(expect.objectContaining({ event: 'event_while_logged_out' }));
  });

  it('retries the exact event IDs with the same batch idempotency key', async () => {
    mockInvoke
      .mockResolvedValueOnce({ error: { message: 'private detail' } })
      .mockResolvedValueOnce({ error: null });
    initAnalytics('user-1');
    trackEvent('retry_event', { safe: true });

    jest.advanceTimersByTime(31_000);
    await Promise.resolve();
    const first = mockInvoke.mock.calls[0][1];
    jest.advanceTimersByTime(31_000);
    await Promise.resolve();
    const second = mockInvoke.mock.calls[1][1];

    expect(second.body).toEqual(first.body);
    expect(second.headers['Idempotency-Key']).toBe(first.headers['Idempotency-Key']);
  });
});

describe('trackEvent', () => {
  it('queues events and flushes on timer', () => {
    initAnalytics('user-1');
    trackEvent('page_view', { page: 'home' });

    expect(mockInvoke).not.toHaveBeenCalled();

    jest.advanceTimersByTime(31000);

    expect(mockInvoke).toHaveBeenCalledWith('pragas-analytics', {
      body: {
        events: expect.arrayContaining([
          expect.objectContaining({
            event: 'page_view',
            properties: { page: 'home' },
          }),
        ]),
      },
      headers: {
        Authorization: `Bearer ${TEST_ACCESS_TOKEN}`,
        'Idempotency-Key': expect.any(String),
      },
    });
  });

  it('flushes when queue reaches max size (50)', () => {
    initAnalytics('user-1');

    for (let i = 0; i < 50; i++) {
      trackEvent(`event_${i}`);
    }

    expect(mockInvoke).toHaveBeenCalled();
    const callArgs = mockInvoke.mock.calls[0];
    expect(callArgs[1].body.events.length).toBe(50);
  });

  it('includes timestamp and platform in each event', () => {
    initAnalytics('user-1');
    trackEvent('test');

    jest.advanceTimersByTime(31000);

    const events = mockInvoke.mock.calls[0][1].body.events;
    expect(events[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(events[0].platform).toBe('ios');
  });

  it('drops pre-login events and starts collecting only after authenticated initialization', () => {
    trackEvent('anonymous_event');
    authenticate('first-user');
    initAnalytics('first-user');
    trackEvent('authenticated_event');
    jest.advanceTimersByTime(31000);
    const events = mockInvoke.mock.calls[0][1].body.events;
    expect(events).not.toContainEqual(expect.objectContaining({ event: 'anonymous_event' }));
    expect(events).toContainEqual(expect.objectContaining({ event: 'authenticated_event' }));
    expect(events[0]).not.toHaveProperty('userId');
  });

  it('clears account A events before account B can send', () => {
    authenticate('account-a', 'token-a');
    initAnalytics('account-a');
    trackEvent('account_a_event');

    authenticate('account-b', 'token-b');
    initAnalytics('account-b');
    trackEvent('account_b_event');
    jest.advanceTimersByTime(31_000);

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke.mock.calls[0][1].headers.Authorization).toBe('Bearer token-b');
    expect(mockInvoke.mock.calls[0][1].body.events).toEqual([
      expect.objectContaining({ event: 'account_b_event' }),
    ]);
  });

  it('honors EXPO_PUBLIC_ENABLE_ANALYTICS=false as a fail-closed build flag', () => {
    const previous = process.env.EXPO_PUBLIC_ENABLE_ANALYTICS;
    process.env.EXPO_PUBLIC_ENABLE_ANALYTICS = 'false';
    try {
      initAnalytics('user-1');
      trackEvent('disabled_event');
      jest.advanceTimersByTime(31_000);
      expect(mockInvoke).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.EXPO_PUBLIC_ENABLE_ANALYTICS;
      else process.env.EXPO_PUBLIC_ENABLE_ANALYTICS = previous;
    }
  });
});

describe('pre-defined event helpers', () => {
  beforeEach(() => {
    initAnalytics('user-1');
    mockInvoke.mockClear();
  });

  it('trackScreenView sends screen_view event', () => {
    trackScreenView('home');
    jest.advanceTimersByTime(31000);

    expect(mockInvoke).toHaveBeenCalled();
    const events = mockInvoke.mock.calls[0][1].body.events;
    expect(events).toContainEqual(
      expect.objectContaining({
        event: 'screen_view',
        properties: { screen: 'home' },
      }),
    );
  });

  it('trackDiagnosisStarted sends diagnosis_started event', () => {
    trackDiagnosisStarted('soja');
    jest.advanceTimersByTime(31000);

    const events = mockInvoke.mock.calls[0][1].body.events;
    expect(events).toContainEqual(
      expect.objectContaining({
        event: 'diagnosis_started',
        properties: { crop: 'soja' },
      }),
    );
  });

  it('trackDiagnosisCompleted sends diagnosis_completed event', () => {
    trackDiagnosisCompleted('milho', 'Ferrugem', 0.92);
    jest.advanceTimersByTime(31000);

    const events = mockInvoke.mock.calls[0][1].body.events;
    expect(events).toContainEqual(
      expect.objectContaining({
        event: 'diagnosis_completed',
        properties: { crop: 'milho', pestName: 'Ferrugem', confidence: 0.92 },
      }),
    );
  });

  it('trackChatMessage sends chat_message_sent event', () => {
    trackChatMessage();
    jest.advanceTimersByTime(31000);

    const events = mockInvoke.mock.calls[0][1].body.events;
    expect(events).toContainEqual(expect.objectContaining({ event: 'chat_message_sent' }));
  });

  it('trackShareDiagnosis sends share_diagnosis event', () => {
    trackShareDiagnosis('pdf');
    jest.advanceTimersByTime(31000);

    const events = mockInvoke.mock.calls[0][1].body.events;
    expect(events).toContainEqual(
      expect.objectContaining({
        event: 'share_diagnosis',
        properties: { method: 'pdf' },
      }),
    );
  });

  it('trackLanguageChanged sends language_changed event', () => {
    trackLanguageChanged('en');
    jest.advanceTimersByTime(31000);

    const events = mockInvoke.mock.calls[0][1].body.events;
    expect(events).toContainEqual(
      expect.objectContaining({
        event: 'language_changed',
        properties: { language: 'en' },
      }),
    );
  });

  it('trackError sends app_error event', () => {
    trackError('network', 'Connection timeout');
    jest.advanceTimersByTime(31000);

    const events = mockInvoke.mock.calls[0][1].body.events;
    expect(events).toContainEqual(
      expect.objectContaining({
        event: 'app_error',
        properties: { errorType: 'network' },
      }),
    );
  });
});
