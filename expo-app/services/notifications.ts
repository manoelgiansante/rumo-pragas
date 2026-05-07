/* eslint-disable @typescript-eslint/no-var-requires */
import { Platform } from 'react-native';
import type * as NotificationsType from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '../i18n';

const PUSH_TOKEN_KEY = '@rumo_pragas_push_token';

// -----------------------------------------------------------------------------
// iOS 26 TurboModule + iPad Reviewer Trap (Apple 2.1(a)) crash fix
// -----------------------------------------------------------------------------
// Previously `configureNotificationHandler()` was called at module load from
// hooks/useNotifications.ts. On the New Architecture (TurboModules) under iOS
// 26.x, the synchronous `Notifications.setNotificationHandler(...)` call during
// JS bundle evaluation can raise an unhandled ObjC exception inside
// `ObjCTurboModule::performVoidMethodInvocation`, which propagates to
// `std::terminate()` -> `abort()` -> SIGABRT (crash on launch before the RN
// ErrorBoundary is mounted).
//
// Fix: lazy, idempotent, defensive. Even the `expo-notifications` import is
// now a lazy require() inside `getNotifications()` so a single bad eval on
// the iPad reviewer device cannot block bundle init. Each call is wrapped in
// try/catch + null-guard. If the native init fails, push notifications simply
// degrade (no token, no listener) instead of killing the app.
// -----------------------------------------------------------------------------

type NotificationsModule = typeof NotificationsType;

let handlerConfigured = false;
let androidChannelsConfigured = false;
let cachedNotifications: NotificationsModule | null = null;
let triedNotifications = false;

/**
 * Lazy require for expo-notifications. Returns null when the package fails
 * to load (web preview, iPad reviewer eval issue, missing native module).
 */
function getNotifications(): NotificationsModule | null {
  if (cachedNotifications) return cachedNotifications;
  if (triedNotifications) return null;
  triedNotifications = true;
  try {
    cachedNotifications = require('expo-notifications') as NotificationsModule;
    return cachedNotifications;
  } catch (e) {
    if (__DEV__) console.warn('[notifications] require failed (non-fatal):', e);
    return null;
  }
}

/**
 * TEST-ONLY: reset idempotency flags so unit tests can assert
 * setNotificationHandler / setNotificationChannelAsync were called.
 * Do NOT call from production code — the flags exist precisely to prevent
 * redundant native-side effects that can crash on iOS 26.
 */
export function __resetForTests() {
  handlerConfigured = false;
  androidChannelsConfigured = false;
  // NOTE: deliberately do NOT clear cachedNotifications / triedNotifications.
  // Cache stability matches the historical `import * as Notifications` semantics
  // that test assertions rely on. Clearing the cache here would cause a fresh
  // require() per test, which after a sibling test's jest.resetModules() can
  // resolve to a different module instance than the test file's static
  // `import * as Notifications`, breaking call-count assertions.
}

/**
 * Configures the default notification handler.
 * SAFE TO CALL MULTIPLE TIMES — internally idempotent.
 * Previously required to be called at module level; now deferred until the
 * first foreground listener/register call (see useNotifications hook).
 */
export function configureNotificationHandler() {
  if (handlerConfigured) return;
  if (Platform.OS === 'web') {
    handlerConfigured = true;
    return;
  }
  const Notifications = getNotifications();
  if (!Notifications) {
    handlerConfigured = true;
    return;
  }
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    handlerConfigured = true;
  } catch (error) {
    // Non-fatal: iOS 26 TurboModule may throw during init; log and continue.
    if (__DEV__) console.warn('[notifications] setNotificationHandler failed (non-fatal):', error);
    handlerConfigured = true; // avoid retry storm on every call
  }
}

async function ensureAndroidChannelsConfigured(): Promise<void> {
  if (androidChannelsConfigured) return;
  if (Platform.OS !== 'android') {
    androidChannelsConfigured = true;
    return;
  }
  const Notifications = getNotifications();
  if (!Notifications) {
    androidChannelsConfigured = true;
    return;
  }
  try {
    await Notifications.setNotificationChannelAsync('pest-alerts', {
      name: i18n.t('notifications.pestAlertsChannel'),
      description: i18n.t('notifications.pestAlertsDesc'),
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1A966B',
      sound: 'default',
    });
    await Notifications.setNotificationChannelAsync('general', {
      name: i18n.t('notifications.generalChannel'),
      description: i18n.t('notifications.generalDesc'),
      importance: Notifications.AndroidImportance.DEFAULT,
    });
    androidChannelsConfigured = true;
  } catch (error) {
    if (__DEV__) console.warn('[notifications] Android channels failed (non-fatal):', error);
    androidChannelsConfigured = true;
  }
}

/**
 * Registers for push notifications and returns the Expo push token.
 * On Android, also creates the default notification channel.
 * Returns null if permissions are denied or running on simulator.
 * All native calls are wrapped in try/catch — failures degrade the feature
 * silently instead of crashing the app.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  // Web has no native push — bail before touching any TurboModule.
  if (Platform.OS === 'web') {
    return null;
  }

  const Notifications = getNotifications();
  if (!Notifications) {
    return null;
  }

  try {
    // Push notifications only work on physical devices
    if (!Device.isDevice) {
      if (__DEV__) console.warn('Push notifications require a physical device');
      return null;
    }

    // Lazy init on first use only.
    configureNotificationHandler();
    await ensureAndroidChannelsConfigured();

    // Check and request permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      if (__DEV__) console.warn('Notification permissions not granted');
      return null;
    }

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;

    if (!projectId) {
      if (__DEV__) console.warn('EAS projectId not found, cannot register for push notifications');
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;

    // Save token locally (will be synced to Supabase pragas_profiles later)
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);

    return token;
  } catch (error) {
    if (__DEV__) console.error('Failed to register push notifications:', error);
    return null;
  }
}

/**
 * Retrieves the locally saved push token.
 */
export async function getSavedPushToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Schedules local notifications for high-severity pest alerts.
 * Limits to a maximum of 2 notifications per batch to avoid spamming the user.
 */
export async function schedulePestAlertNotifications(
  alerts: { id: string; title: string; description: string; severity: string }[],
): Promise<void> {
  const highAlerts = alerts.filter((a) => a.severity === 'high');

  for (const alert of highAlerts.slice(0, 2)) {
    await scheduleLocalPestAlert(
      alert.title,
      alert.description,
      { screen: 'home', alertId: alert.id },
      5,
    );
  }
}

/**
 * Schedules a local notification for a pest alert.
 * Useful for sending alerts based on weather conditions without a server.
 * Safe on web (no-op) and wraps native errors so a failure degrades instead
 * of crashing the caller.
 */
export async function scheduleLocalPestAlert(
  title: string,
  body: string,
  data?: Record<string, unknown>,
  delaySeconds: number = 1,
) {
  if (Platform.OS === 'web') return;
  const Notifications = getNotifications();
  if (!Notifications) return;
  try {
    configureNotificationHandler();
    await ensureAndroidChannelsConfigured();
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: data ?? {},
        sound: 'default',
        ...(Platform.OS === 'android' && { channelId: 'pest-alerts' }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: delaySeconds,
      },
    });
  } catch (error) {
    if (__DEV__) console.warn('[notifications] scheduleLocalPestAlert failed (non-fatal):', error);
  }
}
