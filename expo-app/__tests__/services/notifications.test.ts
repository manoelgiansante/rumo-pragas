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
  AndroidImportance: { HIGH: 4, DEFAULT: 3 },
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 1 },
}));

// Mock expo-device
jest.mock('expo-device', () => ({
  isDevice: true,
}));

// Mock expo-constants
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        eas: { projectId: 'test-project-id' },
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
  },
}));

// Mock react-native Platform
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

import * as Notifications from 'expo-notifications';
import {
  configureNotificationHandler,
  registerForPushNotificationsAsync,
  getSavedPushToken,
  schedulePestAlertNotifications,
  scheduleLocalPestAlert,
} from '../../services/notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

beforeEach(() => {
  jest.clearAllMocks();
  // Re-apply default mocks after clearAllMocks
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
  (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
  (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
    data: 'ExponentPushToken[xxx]',
  });
  (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue(undefined);
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
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
        getItem: jest.fn().mockResolvedValue(null),
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

    const { registerForPushNotificationsAsync: register } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../../services/notifications');
    const token = await register();
    expect(token).toBeNull();
  });

  it('requests permissions when not already granted', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'undetermined' });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });

    const token = await registerForPushNotificationsAsync();
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
    expect(token).toBe('ExponentPushToken[xxx]');
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
        getItem: jest.fn().mockResolvedValue(null),
        setItem: jest.fn().mockResolvedValue(undefined),
        removeItem: jest.fn().mockResolvedValue(undefined),
        multiGet: jest.fn().mockResolvedValue([]),
        multiSet: jest.fn().mockResolvedValue(undefined),
      },
    }));
    jest.doMock('react-native', () => ({ Platform: { OS: 'ios' } }));

    const { registerForPushNotificationsAsync: register } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../../services/notifications');
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

describe('schedulePestAlertNotifications', () => {
  it('schedules notifications only for high severity alerts', async () => {
    const alerts = [
      { id: '1', title: 'Ferrugem', description: 'Risco alto', severity: 'high' },
      { id: '2', title: 'Ácaros', description: 'Risco médio', severity: 'medium' },
      { id: '3', title: 'Mofo', description: 'Risco alto', severity: 'high' },
    ];

    await schedulePestAlertNotifications(alerts);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
  });

  it('limits to maximum 2 notifications per batch', async () => {
    const alerts = [
      { id: '1', title: 'A', description: 'D', severity: 'high' },
      { id: '2', title: 'B', description: 'D', severity: 'high' },
      { id: '3', title: 'C', description: 'D', severity: 'high' },
      { id: '4', title: 'D', description: 'D', severity: 'high' },
    ];

    await schedulePestAlertNotifications(alerts);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
  });

  it('does not schedule anything when no high severity alerts exist', async () => {
    const alerts = [
      { id: '1', title: 'A', description: 'D', severity: 'low' },
      { id: '2', title: 'B', description: 'D', severity: 'medium' },
    ];

    await schedulePestAlertNotifications(alerts);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

describe('scheduleLocalPestAlert', () => {
  it('schedules a notification with correct content and trigger', async () => {
    await scheduleLocalPestAlert('Test Title', 'Test Body', { screen: 'home' }, 10);

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
    await scheduleLocalPestAlert('Title', 'Body');

    const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.trigger.seconds).toBe(1);
  });

  it('uses empty data when not provided', async () => {
    await scheduleLocalPestAlert('Title', 'Body');

    const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.content.data).toEqual({});
  });
});
