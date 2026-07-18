/**
 * Tests for services/notifications.ts
 */

// Mock expo-notifications — factory must not reference external variables
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'ExponentPushToken[xxx]' }),
  scheduleNotificationAsync: jest.fn().mockResolvedValue(undefined),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  unregisterForNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  AndroidImportance: { HIGH: 4, DEFAULT: 3 },
  // Mirrors the real enum in expo-notifications so callers that pass e.g.
  // `SchedulableTriggerInputTypes.DATE` receive `'date'` — needed by
  // scheduleReinspectionReminder (which uses a DATE trigger).
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval', DATE: 'date' },
}));

// Mock expo-device
jest.mock('expo-device', () => ({
  isDevice: true,
  osVersion: '17.0',
  deviceName: 'iPhone',
  modelName: 'iPhone 15 Pro',
  brand: 'Apple',
}));

// Mock @sentry/react-native — services/notifications now reports register
// failures explicitly (no more silent swallow).
jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

// Mock the supabase client used by persistPushTokenToServer
const mockRpc = jest.fn().mockResolvedValue({ error: null });
jest.mock('../../services/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

// Mock expo-constants
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      version: '1.0.0',
      ios: { buildNumber: '36' },
      android: { versionCode: 36 },
      extra: {
        eas: { projectId: 'test-project-id' },
        remotePush: { androidConfigured: false },
      },
    },
  },
}));

// Mock AsyncStorage — must return promises so i18n/index.ts module-level call works
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
    multiGet: jest.fn().mockResolvedValue([]),
    multiSet: jest.fn().mockResolvedValue(undefined),
    multiRemove: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock react-native Platform
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  configureNotificationHandler,
  registerForPushNotificationsAsync,
  getSavedPushToken,
  scheduleClimateRiskNotifications,
  scheduleLocalClimateRiskAlert,
  scheduleReinspectionReminder,
  isPushNotificationsEnabled,
  setPushNotificationsEnabled,
  __resetForTests,
} from '../../services/notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

beforeEach(() => {
  jest.clearAllMocks();
  // Reset the module's idempotency flags so each test can observe a fresh
  // call to setNotificationHandler / setNotificationChannelAsync. Required
  // after the iOS 26 TurboModule crash fix (handlerConfigured boolean).
  __resetForTests();
  // Re-apply default mocks after clearAllMocks
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
  (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
  (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
    data: 'ExponentPushToken[xxx]',
  });
  (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue(undefined);
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) =>
    key === '@rumo_pragas_push_enabled' ? 'true' : null,
  );
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  (AsyncStorage.multiRemove as jest.Mock).mockResolvedValue(undefined);
});

describe('configureNotificationHandler', () => {
  it('sets the notification handler with correct config', () => {
    configureNotificationHandler();
    expect(Notifications.setNotificationHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        handleNotification: expect.any(Function),
      }),
    );
  });

  it('handler returns correct configuration', async () => {
    configureNotificationHandler();
    const handler = (Notifications.setNotificationHandler as jest.Mock).mock.calls[0][0];
    const result = await handler.handleNotification();
    expect(result).toEqual({
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    });
  });
});

describe('registerForPushNotificationsAsync', () => {
  it('returns push token when permissions are granted', async () => {
    const token = await registerForPushNotificationsAsync();
    expect(token).toBe('ExponentPushToken[xxx]');
  });

  it('saves push token to AsyncStorage', async () => {
    await registerForPushNotificationsAsync();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@rumo_pragas_push_token',
      'ExponentPushToken[xxx]',
    );
  });

  it('does not call remote token APIs in an Android build without the FCM file capability', async () => {
    const originalOs = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    (Constants.expoConfig!.extra as Record<string, unknown>).remotePush = {
      androidConfigured: false,
    };
    try {
      await expect(registerForPushNotificationsAsync()).resolves.toBeNull();
      expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
      // Channel setup remains available for local climate alerts.
      expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
        'climate-risk',
        expect.any(Object),
      );
    } finally {
      Object.defineProperty(Platform, 'OS', { value: originalOs, configurable: true });
    }
  });

  it('registers Android remote push when app.config marked the FCM file capability', async () => {
    const originalOs = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    (Constants.expoConfig!.extra as Record<string, unknown>).remotePush = {
      androidConfigured: true,
    };
    try {
      await expect(registerForPushNotificationsAsync()).resolves.toBe('ExponentPushToken[xxx]');
      expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({
        projectId: 'test-project-id',
      });
    } finally {
      Object.defineProperty(Platform, 'OS', { value: originalOs, configurable: true });
      (Constants.expoConfig!.extra as Record<string, unknown>).remotePush = {
        androidConfigured: false,
      };
    }
  });

  it('returns null when not a physical device', async () => {
    // expo-device mock needs to be modified at the module level
    jest.doMock('expo-device', () => ({ isDevice: false }));
    // Re-import to pick up new mock
    jest.resetModules();
    // Re-apply required mocks after resetModules
    jest.doMock('expo-notifications', () => ({
      setNotificationHandler: jest.fn(),
      setNotificationChannelAsync: jest.fn(),
      getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
      requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
      getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'ExponentPushToken[xxx]' }),
      scheduleNotificationAsync: jest.fn().mockResolvedValue(undefined),
      AndroidImportance: { HIGH: 4, DEFAULT: 3 },
      SchedulableTriggerInputTypes: { TIME_INTERVAL: 1 },
    }));
    jest.doMock('@react-native-async-storage/async-storage', () => ({
      __esModule: true,
      default: {
        getItem: jest.fn(async (key: string) =>
          key === '@rumo_pragas_push_enabled' ? 'true' : null,
        ),
        setItem: jest.fn().mockResolvedValue(undefined),
        removeItem: jest.fn().mockResolvedValue(undefined),
        multiGet: jest.fn().mockResolvedValue([]),
        multiSet: jest.fn().mockResolvedValue(undefined),
      },
    }));
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: { expoConfig: { extra: { eas: { projectId: 'test-project-id' } } } },
    }));
    jest.doMock('react-native', () => ({ Platform: { OS: 'ios' } }));

    const { registerForPushNotificationsAsync: register } = require('../../services/notifications');
    const token = await register();
    expect(token).toBeNull();
  });

  it('never requests permissions during automatic registration', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'undetermined' });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });

    const token = await registerForPushNotificationsAsync();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(token).toBeNull();
  });

  it('requests permission only from the explicit settings opt-in', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'undetermined' });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    await expect(setPushNotificationsEnabled(true)).resolves.toBe(true);
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('@rumo_pragas_push_enabled', 'true');
  });

  it('returns null when permissions are denied', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'undetermined' });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });

    const token = await registerForPushNotificationsAsync();
    expect(token).toBeNull();
  });

  it('returns null when push token retrieval fails', async () => {
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockRejectedValue(new Error('Token error'));

    const token = await registerForPushNotificationsAsync();
    expect(token).toBeNull();
  });

  it('returns null when projectId is not found', async () => {
    jest.resetModules();
    jest.doMock('expo-device', () => ({ isDevice: true }));
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: { expoConfig: { extra: {} }, easConfig: undefined },
    }));
    jest.doMock('expo-notifications', () => ({
      setNotificationHandler: jest.fn(),
      setNotificationChannelAsync: jest.fn(),
      getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
      requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
      getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'ExponentPushToken[xxx]' }),
      scheduleNotificationAsync: jest.fn().mockResolvedValue(undefined),
      AndroidImportance: { HIGH: 4, DEFAULT: 3 },
      SchedulableTriggerInputTypes: { TIME_INTERVAL: 1 },
    }));
    jest.doMock('@react-native-async-storage/async-storage', () => ({
      __esModule: true,
      default: {
        getItem: jest.fn(async (key: string) =>
          key === '@rumo_pragas_push_enabled' ? 'true' : null,
        ),
        setItem: jest.fn().mockResolvedValue(undefined),
        removeItem: jest.fn().mockResolvedValue(undefined),
        multiGet: jest.fn().mockResolvedValue([]),
        multiSet: jest.fn().mockResolvedValue(undefined),
      },
    }));
    jest.doMock('react-native', () => ({ Platform: { OS: 'ios' } }));

    const { registerForPushNotificationsAsync: register } = require('../../services/notifications');
    const token = await register();
    expect(token).toBeNull();
  });
});

describe('getSavedPushToken', () => {
  it('returns token from AsyncStorage', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('ExponentPushToken[saved]');
    const token = await getSavedPushToken();
    expect(token).toBe('ExponentPushToken[saved]');
  });

  it('returns null when no token stored', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    const token = await getSavedPushToken();
    expect(token).toBeNull();
  });

  it('returns null on storage error', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('fail'));
    const token = await getSavedPushToken();
    expect(token).toBeNull();
  });
});

describe('push preference enforcement', () => {
  it('defaults to disabled and honors an explicit false value', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    await expect(isPushNotificationsEnabled()).resolves.toBe(false);
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('false');
    await expect(isPushNotificationsEnabled()).resolves.toBe(false);
  });

  it('blocks native registration when disabled', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('false');
    await expect(registerForPushNotificationsAsync()).resolves.toBeNull();
    expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('blocks local scheduling when disabled', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('false');
    await scheduleLocalClimateRiskAlert('Title', 'Body');
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('cancels, unregisters, soft-revokes and removes local tokens when disabled', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('ExponentPushToken[saved]');

    await setPushNotificationsEnabled(false);

    expect(AsyncStorage.setItem).toHaveBeenCalledWith('@rumo_pragas_push_enabled', 'false');
    expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
    expect(Notifications.unregisterForNotificationsAsync).toHaveBeenCalled();
    expect(mockRpc).toHaveBeenCalledWith('touch_pragas_push_token', {
      p_token: 'ExponentPushToken[saved]',
      p_platform: 'ios',
      p_notifications_enabled: false,
    });
    expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([
      '@rumo_pragas_push_token',
      '@rumo_pragas_push_token_last_sync',
    ]);
  });
});

describe('scheduleClimateRiskNotifications', () => {
  it('schedules notifications only for high severity alerts', async () => {
    const alerts = [
      { id: '1', title: 'Ferrugem', description: 'Risco alto', severity: 'high' },
      { id: '2', title: 'Ácaros', description: 'Risco médio', severity: 'medium' },
      { id: '3', title: 'Mofo', description: 'Risco alto', severity: 'high' },
    ];

    await scheduleClimateRiskNotifications(alerts);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
  });

  it('limits to maximum 2 notifications per batch', async () => {
    const alerts = [
      { id: '1', title: 'A', description: 'D', severity: 'high' },
      { id: '2', title: 'B', description: 'D', severity: 'high' },
      { id: '3', title: 'C', description: 'D', severity: 'high' },
      { id: '4', title: 'D', description: 'D', severity: 'high' },
    ];

    await scheduleClimateRiskNotifications(alerts);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
  });

  it('does not schedule anything when no high severity alerts exist', async () => {
    const alerts = [
      { id: '1', title: 'A', description: 'D', severity: 'low' },
      { id: '2', title: 'B', description: 'D', severity: 'medium' },
    ];

    await scheduleClimateRiskNotifications(alerts);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

describe('scheduleLocalClimateRiskAlert', () => {
  it('schedules a notification with correct content and trigger', async () => {
    await scheduleLocalClimateRiskAlert('Test Title', 'Test Body', { screen: 'home' }, 10);

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          title: 'Test Title',
          body: 'Test Body',
          data: { screen: 'home' },
          sound: 'default',
        }),
        trigger: expect.objectContaining({
          seconds: 10,
        }),
      }),
    );
  });

  it('uses default delay of 1 second when not specified', async () => {
    await scheduleLocalClimateRiskAlert('Title', 'Body');

    const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.trigger.seconds).toBe(1);
  });

  it('uses empty data when not provided', async () => {
    await scheduleLocalClimateRiskAlert('Title', 'Body');

    const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.content.data).toEqual({});
  });
});

// -----------------------------------------------------------------------------
// scheduleReinspectionReminder
// -----------------------------------------------------------------------------
// The reinspection helper is a DEDICATED path (does not reuse the climate
// helper's 24 h cap) and returns the Expo identifier on success. It must:
//   - fail closed when push is disabled
//   - reject invalid days (0, negative, non-finite)
//   - clamp days to 30 max
//   - use a DATE trigger with the correct absolute Date
//   - use the "general" Android channel, not "climate-risk"
//   - degrade to null (not throw) when the native call fails
describe('scheduleReinspectionReminder', () => {
  beforeEach(() => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) =>
      key === '@rumo_pragas_push_enabled' ? 'true' : null,
    );
    (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('reinspection-id-123');
  });

  it('returns null and never touches the native API when push is disabled', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('false');
    const id = await scheduleReinspectionReminder({
      days: 3,
      title: 'T',
      body: 'B',
    });
    expect(id).toBeNull();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('returns null on invalid days without calling the native API', async () => {
    for (const days of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      (Notifications.scheduleNotificationAsync as jest.Mock).mockClear();
      const id = await scheduleReinspectionReminder({
        days,
        title: 'T',
        body: 'B',
      });
      expect(id).toBeNull();
      expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    }
  });

  it('returns null when title or body is empty', async () => {
    expect(await scheduleReinspectionReminder({ days: 3, title: '   ', body: 'B' })).toBeNull();
    expect(await scheduleReinspectionReminder({ days: 3, title: 'T', body: '' })).toBeNull();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('schedules 3 days ahead with a DATE trigger (no 24h cap)', async () => {
    const now = new Date('2026-07-18T12:00:00Z').getTime();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const id = await scheduleReinspectionReminder({
      days: 3,
      title: 'Hora de reinspecionar',
      body: 'Volte à área observada',
    });
    expect(id).toBe('reinspection-id-123');
    const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    // 3 days = 259_200 s — well above the climate-risk 24h cap; must NOT be capped.
    const fireAtMs = (call.trigger.date as Date).getTime();
    expect(fireAtMs - now).toBe(3 * 86_400_000);
    expect(call.trigger.type).toBe('date');
    expect(call.content.title).toBe('Hora de reinspecionar');
    expect(call.content.body).toBe('Volte à área observada');
  });

  it('schedules 7 days ahead with a DATE trigger (no 24h cap)', async () => {
    const now = new Date('2026-07-18T12:00:00Z').getTime();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const id = await scheduleReinspectionReminder({
      days: 7,
      title: 'Titulo',
      body: 'Corpo',
    });
    expect(id).toBe('reinspection-id-123');
    const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    const fireAtMs = (call.trigger.date as Date).getTime();
    // 7 days = 604_800 s — proves the helper is not capped at 86_400 like climate-risk.
    expect(fireAtMs - now).toBe(7 * 86_400_000);
  });

  it('clamps days above 30 down to 30', async () => {
    const now = new Date('2026-07-18T12:00:00Z').getTime();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    await scheduleReinspectionReminder({ days: 999, title: 'T', body: 'B' });
    const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    const fireAtMs = (call.trigger.date as Date).getTime();
    expect(fireAtMs - now).toBe(30 * 86_400_000);
  });

  it('uses the general Android channel, not climate-risk', async () => {
    const originalOs = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    try {
      await scheduleReinspectionReminder({ days: 3, title: 'T', body: 'B' });
      const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
      expect(call.content.channelId).toBe('general');
    } finally {
      Object.defineProperty(Platform, 'OS', { value: originalOs, configurable: true });
    }
  });

  it('returns null (never throws) when the native scheduler rejects', async () => {
    (Notifications.scheduleNotificationAsync as jest.Mock).mockRejectedValue(
      new Error('native down'),
    );
    const id = await scheduleReinspectionReminder({ days: 3, title: 'T', body: 'B' });
    expect(id).toBeNull();
  });

  it('truncates the title to 80 chars and the body to 240 chars', async () => {
    const longTitle = 'a'.repeat(200);
    const longBody = 'b'.repeat(500);
    await scheduleReinspectionReminder({ days: 3, title: longTitle, body: longBody });
    const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.content.title).toBe('a'.repeat(80));
    expect(call.content.body).toBe('b'.repeat(240));
  });

  it('forwards non-sensitive data payload', async () => {
    await scheduleReinspectionReminder({
      days: 3,
      title: 'T',
      body: 'B',
      data: { screen: 'diagnosis-reinspection', days: 3 },
    });
    const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.content.data).toEqual({ screen: 'diagnosis-reinspection', days: 3 });
  });
});

// -----------------------------------------------------------------------------
// persistPushTokenToServer
// -----------------------------------------------------------------------------
//
// We re-use the top-of-file mocks (mockRpc, AsyncStorage default, etc.) and
// just reset their behaviour per-test. Earlier tests that called
// jest.resetModules() / jest.doMock() did so in nested scopes — by the time
// the top describe finishes, the cached module is the original one again
// because we import { __resetPushTokenSyncCache, persistPushTokenToServer }
// fresh below.
// -----------------------------------------------------------------------------
describe('persistPushTokenToServer', () => {
  const TOKEN = 'ExponentPushToken[zzz-very-real-token]';

  // The earlier `registerForPushNotificationsAsync` tests call jest.resetModules()
  // which orphans the original `@sentry/react-native` mock from the freshly
  // re-required `services/notifications`. Re-establish a fresh module graph
  // with ALL deps mocked at this describe's beforeEach.
  let svc: typeof import('../../services/notifications');
  let mockSentry: { captureException: jest.Mock; captureMessage: jest.Mock };
  let mockSupabaseRpc: jest.Mock;
  let mockGetItem: jest.Mock;
  let mockSetItem: jest.Mock;

  beforeEach(async () => {
    jest.resetModules();
    mockSentry = { captureException: jest.fn(), captureMessage: jest.fn() };
    mockSupabaseRpc = jest.fn().mockResolvedValue({ error: null });
    mockGetItem = jest.fn().mockResolvedValue(null);
    mockSetItem = jest.fn().mockResolvedValue(undefined);

    jest.doMock('react-native', () => ({ Platform: { OS: 'ios' } }));
    jest.doMock('expo-device', () => ({
      isDevice: true,
      osVersion: '17.0',
      deviceName: 'iPhone',
      modelName: 'iPhone 15 Pro',
      brand: 'Apple',
    }));
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: {
        expoConfig: {
          version: '1.0.0',
          ios: { buildNumber: '36' },
          android: { versionCode: 36 },
          extra: { eas: { projectId: 'test-project-id' } },
        },
      },
    }));
    jest.doMock('@react-native-async-storage/async-storage', () => ({
      __esModule: true,
      default: {
        getItem: mockGetItem,
        setItem: mockSetItem,
        removeItem: jest.fn().mockResolvedValue(undefined),
      },
    }));
    jest.doMock('@sentry/react-native', () => mockSentry);
    jest.doMock('../../services/supabase', () => ({
      supabase: { rpc: mockSupabaseRpc },
    }));
    jest.doMock('expo-notifications', () => ({
      setNotificationHandler: jest.fn(),
      setNotificationChannelAsync: jest.fn(),
      getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
      requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
      getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'ExponentPushToken[xxx]' }),
      scheduleNotificationAsync: jest.fn().mockResolvedValue(undefined),
      AndroidImportance: { HIGH: 4, DEFAULT: 3 },
      SchedulableTriggerInputTypes: { TIME_INTERVAL: 1 },
    }));

    svc = require('../../services/notifications');
    await svc.__resetPushTokenSyncCache();
  });

  it('returns false for empty / short tokens without calling RPC', async () => {
    expect(await svc.persistPushTokenToServer('')).toBe(false);
    expect(await svc.persistPushTokenToServer('x')).toBe(false);
    expect(mockSupabaseRpc).not.toHaveBeenCalled();
  });

  it('calls the minimal app-scoped push RPC without a device fingerprint', async () => {
    const ok = await svc.persistPushTokenToServer(TOKEN, { force: true });
    expect(ok).toBe(true);
    expect(mockSupabaseRpc).toHaveBeenCalledWith('touch_pragas_push_token', {
      p_token: TOKEN,
      p_platform: 'ios',
      p_notifications_enabled: true,
    });
  });

  it('returns false and captures Sentry warning when RPC returns error', async () => {
    mockSupabaseRpc.mockResolvedValue({
      error: { code: '42501', message: 'permission denied' },
    });
    const ok = await svc.persistPushTokenToServer(TOKEN, { force: true });
    expect(ok).toBe(false);
    expect(mockSentry.captureMessage).toHaveBeenCalledWith(
      'persistPushTokenToServer rpc error',
      expect.objectContaining({
        level: 'warning',
        tags: expect.objectContaining({ feature: 'push', step: 'persist', code: '42501' }),
      }),
    );
  });

  it('returns false and captures a scrubbed warning when RPC throws', async () => {
    mockSupabaseRpc.mockRejectedValue(new Error('network down'));
    const ok = await svc.persistPushTokenToServer(TOKEN, { force: true });
    expect(ok).toBe(false);
    expect(mockSentry.captureMessage).toHaveBeenCalledWith(
      'push token persistence failed',
      expect.objectContaining({
        level: 'warning',
        tags: expect.objectContaining({ feature: 'push' }),
      }),
    );
  });

  it('skips the network call within the 30-day refresh window when force=false', async () => {
    mockGetItem.mockResolvedValue(String(Date.now() - 1000));
    const ok = await svc.persistPushTokenToServer(TOKEN, { force: false });
    expect(ok).toBe(true);
    expect(mockSupabaseRpc).not.toHaveBeenCalled();
  });

  it('hits the network when last sync is stale, even with force=false', async () => {
    const stale = Date.now() - 60 * 24 * 60 * 60 * 1000; // 60 days ago
    mockGetItem.mockResolvedValue(String(stale));
    const ok = await svc.persistPushTokenToServer(TOKEN, { force: false });
    expect(ok).toBe(true);
    expect(mockSupabaseRpc).toHaveBeenCalledTimes(1);
  });
});
