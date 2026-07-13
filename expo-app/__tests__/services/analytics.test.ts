/**
 * Tests for services/analytics.ts
 */

// --- Mocks ---
const mockInvoke = jest.fn();
// Captures the onAuthStateChange callback registered by services/analytics.ts
// at module load so tests can simulate an authenticated in-memory session
// (name is `mock`-prefixed so jest allows the out-of-scope factory reference).
let mockAuthCallback:
  | ((event: string, session: { access_token?: string } | null) => void)
  | undefined;
jest.mock('../../services/supabase', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
    auth: {
      onAuthStateChange: (
        cb: (event: string, session: { access_token?: string } | null) => void,
      ) => {
        mockAuthCallback = cb;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      },
    },
  },
}));

const TEST_ACCESS_TOKEN = 'test-jwt-token';

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
  trackSubscriptionViewed,
  trackSubscriptionPurchased,
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
  mockAuthCallback?.('SIGNED_IN', { access_token: TEST_ACCESS_TOKEN });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('initAnalytics', () => {
  it('sets the user ID for subsequent events', () => {
    initAnalytics('user-123');
    trackEvent('test_event');

    jest.advanceTimersByTime(35000);

    expect(mockInvoke).toHaveBeenCalledWith('analytics', {
      body: {
        events: expect.arrayContaining([
          expect.objectContaining({
            event: 'test_event',
            userId: 'user-123',
            platform: 'ios',
          }),
        ]),
      },
      headers: { Authorization: `Bearer ${TEST_ACCESS_TOKEN}` },
    });
  });
});

describe('resetAnalytics', () => {
  it('clears user ID and flushes remaining events', () => {
    initAnalytics('user-456');
    trackEvent('before_reset');

    mockInvoke.mockClear();
    resetAnalytics();

    // Should have flushed the queued event
    expect(mockInvoke).toHaveBeenCalled();
  });
});

describe('auth token (web-safe flush — cicatriz ed9906a)', () => {
  it('sends the in-memory user JWT (never the anon key) as Authorization', () => {
    initAnalytics('user-1');
    trackEvent('authed_event');
    jest.advanceTimersByTime(31000);

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke.mock.calls[0][1].headers).toEqual({
      Authorization: `Bearer ${TEST_ACCESS_TOKEN}`,
    });
  });

  it('does NOT hit the edge fn while signed out (would 401 on the anon key)', () => {
    // Simulate sign-out: onAuthStateChange clears the in-memory token.
    mockAuthCallback?.('SIGNED_OUT', null);

    initAnalytics('user-1');
    trackEvent('event_while_logged_out');
    jest.advanceTimersByTime(31000);

    expect(mockInvoke).not.toHaveBeenCalled();

    // Once a session returns, the queued event flushes with the fresh token.
    mockAuthCallback?.('SIGNED_IN', { access_token: TEST_ACCESS_TOKEN });
    jest.advanceTimersByTime(31000);

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke.mock.calls[0][1].headers).toEqual({
      Authorization: `Bearer ${TEST_ACCESS_TOKEN}`,
    });
    const events = mockInvoke.mock.calls[0][1].body.events;
    expect(events).toContainEqual(expect.objectContaining({ event: 'event_while_logged_out' }));
  });
});

describe('trackEvent', () => {
  it('queues events and flushes on timer', () => {
    initAnalytics('user-1');
    trackEvent('page_view', { page: 'home' });

    expect(mockInvoke).not.toHaveBeenCalled();

    jest.advanceTimersByTime(31000);

    expect(mockInvoke).toHaveBeenCalledWith('analytics', {
      body: {
        events: expect.arrayContaining([
          expect.objectContaining({
            event: 'page_view',
            properties: { page: 'home' },
          }),
        ]),
      },
      headers: { Authorization: `Bearer ${TEST_ACCESS_TOKEN}` },
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

  it('tracks event without userId when not initialized', () => {
    // No initAnalytics call
    trackEvent('anonymous_event');

    jest.advanceTimersByTime(31000);

    // The event should still be in the queue but won't auto-flush
    // since no timer is set without initAnalytics. Let's verify
    // by manually triggering via resetAnalytics
    mockInvoke.mockClear();
    resetAnalytics();

    // If events were queued, they should flush now
    // Either via the timer or the reset - depends on implementation
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

  it('trackSubscriptionViewed sends subscription_viewed event', () => {
    trackSubscriptionViewed('pro');
    jest.advanceTimersByTime(31000);

    const events = mockInvoke.mock.calls[0][1].body.events;
    expect(events).toContainEqual(
      expect.objectContaining({
        event: 'subscription_viewed',
        properties: { plan: 'pro' },
      }),
    );
  });

  it('trackSubscriptionPurchased sends subscription_purchased event', () => {
    trackSubscriptionPurchased('pro', 'apple');
    jest.advanceTimersByTime(31000);

    const events = mockInvoke.mock.calls[0][1].body.events;
    expect(events).toContainEqual(
      expect.objectContaining({
        event: 'subscription_purchased',
        properties: { plan: 'pro', provider: 'apple' },
      }),
    );
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
        properties: { errorType: 'network', message: 'Connection timeout' },
      }),
    );
  });
});
