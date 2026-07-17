import { renderHook, waitFor } from '@testing-library/react-native';

const mockAddNotificationReceivedListener = jest.fn();
const mockAddNotificationResponseReceivedListener = jest.fn();
const mockRemoveListener = { remove: jest.fn() };

jest.mock('expo-notifications', () => ({
  addNotificationReceivedListener: (...args: unknown[]) => {
    mockAddNotificationReceivedListener(...args);
    return mockRemoveListener;
  },
  addNotificationResponseReceivedListener: (...args: unknown[]) => {
    mockAddNotificationResponseReceivedListener(...args);
    return mockRemoveListener;
  },
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));

const mockRegisterForPushNotificationsAsync = jest.fn();
const mockPersistPushTokenToServer = jest.fn();
const mockIsPushNotificationsEnabled = jest.fn();
const mockSubscribePushPreference = jest.fn();
jest.mock('../../services/notifications', () => ({
  configureNotificationHandler: jest.fn(),
  registerForPushNotificationsAsync: (...args: unknown[]) =>
    mockRegisterForPushNotificationsAsync(...args),
  persistPushTokenToServer: (...args: unknown[]) => mockPersistPushTokenToServer(...args),
  isPushNotificationsEnabled: (...args: unknown[]) => mockIsPushNotificationsEnabled(...args),
  subscribePushPreference: (...args: unknown[]) => mockSubscribePushPreference(...args),
}));

const mockSentryCaptureMessage = jest.fn();
const mockSentryCaptureException = jest.fn();
jest.mock('@sentry/react-native', () => ({
  captureMessage: (...args: unknown[]) => mockSentryCaptureMessage(...args),
  captureException: (...args: unknown[]) => mockSentryCaptureException(...args),
}));

const mockSupabaseFrom = jest.fn();
jest.mock('../../services/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockSupabaseFrom(...args),
  },
}));

import { useNotifications, resolveNotificationRoute } from '../../hooks/useNotifications';

beforeEach(() => {
  jest.clearAllMocks();
  mockRegisterForPushNotificationsAsync.mockResolvedValue(null);
  mockPersistPushTokenToServer.mockResolvedValue(true);
  mockIsPushNotificationsEnabled.mockResolvedValue(true);
  mockSubscribePushPreference.mockReturnValue(jest.fn());
});

describe('useNotifications', () => {
  it('returns initial state with null token and notification', async () => {
    const { result } = renderHook(() => useNotifications());
    expect(result.current.expoPushToken).toBeNull();
    expect(result.current.notification).toBeNull();
    expect(typeof result.current.registerForNotifications).toBe('function');
    await waitFor(() => expect(mockAddNotificationReceivedListener).toHaveBeenCalled());
  });

  it('registers notification listeners on mount when push is enabled', async () => {
    renderHook(() => useNotifications());
    await waitFor(() => {
      expect(mockAddNotificationReceivedListener).toHaveBeenCalled();
      expect(mockAddNotificationResponseReceivedListener).toHaveBeenCalled();
    });
  });

  it('removes listeners on unmount', async () => {
    const { unmount } = renderHook(() => useNotifications());
    await waitFor(() => expect(mockAddNotificationReceivedListener).toHaveBeenCalled());
    unmount();
    expect(mockRemoveListener.remove).toHaveBeenCalled();
  });

  it('auto-registers when shouldRegister is true', async () => {
    mockRegisterForPushNotificationsAsync.mockResolvedValue('ExponentPushToken[xxx]');

    renderHook(() => useNotifications(true));

    await waitFor(() => {
      expect(mockRegisterForPushNotificationsAsync).toHaveBeenCalled();
    });
  });

  it('does not auto-register when shouldRegister is false', async () => {
    renderHook(() => useNotifications(false));
    await waitFor(() => expect(mockIsPushNotificationsEnabled).toHaveBeenCalled());
    expect(mockRegisterForPushNotificationsAsync).not.toHaveBeenCalled();
  });

  it('does not register or install listeners when the preference is disabled', async () => {
    mockIsPushNotificationsEnabled.mockResolvedValue(false);
    renderHook(() => useNotifications(true));
    await waitFor(() => expect(mockIsPushNotificationsEnabled).toHaveBeenCalled());
    expect(mockRegisterForPushNotificationsAsync).not.toHaveBeenCalled();
    expect(mockAddNotificationReceivedListener).not.toHaveBeenCalled();
  });

  it('never writes the token into the legacy shared profile', async () => {
    mockRegisterForPushNotificationsAsync.mockResolvedValue('ExponentPushToken[xxx]');

    renderHook(() => useNotifications(true));

    await waitFor(() => {
      expect(mockPersistPushTokenToServer).toHaveBeenCalled();
    });
    expect(mockSupabaseFrom).not.toHaveBeenCalled();
  });

  it('persists token to pragas_push_tokens with force=true on login', async () => {
    mockRegisterForPushNotificationsAsync.mockResolvedValue('ExponentPushToken[xxx]');

    renderHook(() => useNotifications(true));

    await waitFor(() => {
      expect(mockPersistPushTokenToServer).toHaveBeenCalledWith('ExponentPushToken[xxx]', {
        force: true,
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Deep-link validation (pure function, no React)
// ---------------------------------------------------------------------------

describe('resolveNotificationRoute', () => {
  it('rejects null / non-object payloads', () => {
    expect(resolveNotificationRoute(null)).toBeNull();
    expect(resolveNotificationRoute(undefined)).toBeNull();
    expect(resolveNotificationRoute('foo')).toBeNull();
    expect(resolveNotificationRoute(42)).toBeNull();
    expect(resolveNotificationRoute([])).toBeNull();
  });

  it('rejects screens that are not whitelisted', () => {
    expect(resolveNotificationRoute({ screen: 'admin' })).toBeNull();
    expect(resolveNotificationRoute({ screen: '../../etc' })).toBeNull();
    expect(resolveNotificationRoute({})).toBeNull();
  });

  it('rejects diagnosis payloads with missing or malformed UUID', () => {
    expect(resolveNotificationRoute({ screen: 'diagnosis' })).toBeNull();
    expect(resolveNotificationRoute({ screen: 'diagnosis', diagnosisId: '' })).toBeNull();
    expect(resolveNotificationRoute({ screen: 'diagnosis', diagnosisId: 'not-a-uuid' })).toBeNull();
    expect(
      resolveNotificationRoute({
        screen: 'diagnosis',
        diagnosisId: '../../escape',
      }),
    ).toBeNull();
    // version digit 0 -> invalid RFC-4122
    expect(
      resolveNotificationRoute({
        screen: 'diagnosis',
        diagnosisId: '12345678-1234-0234-8234-123456789abc',
      }),
    ).toBeNull();
  });

  it('accepts a valid UUID v4 for diagnosis', () => {
    const id = 'a1b2c3d4-e5f6-4789-8abc-1234567890ab';
    expect(resolveNotificationRoute({ screen: 'diagnosis', diagnosisId: id })).toBe(
      '/(tabs)/history',
    );
  });

  it('maps each whitelisted screen to its static route', () => {
    expect(resolveNotificationRoute({ screen: 'settings' })).toBe('/(tabs)/settings');
    expect(resolveNotificationRoute({ screen: 'history' })).toBe('/(tabs)/history');
    expect(resolveNotificationRoute({ screen: 'home' })).toBe('/(tabs)');
  });

  it('rejects the removed paywall screen (app is 100% free)', () => {
    expect(resolveNotificationRoute({ screen: 'paywall' })).toBeNull();
  });
});
