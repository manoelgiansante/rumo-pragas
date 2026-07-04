import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';
import i18n from '../i18n';
import { supabase } from './supabase';

const PUSH_TOKEN_KEY = '@rumo_pragas_push_token';
const PUSH_TOKEN_LAST_SYNC_KEY = '@rumo_pragas_push_token_last_sync';
// Refresh the server-side audit row at most once every 30 days.
// We still call on every login (handled in useNotifications) for liveness.
const TOKEN_REFRESH_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

// -----------------------------------------------------------------------------
// iOS 26 TurboModule crash fix (preventive — follows Finance rejection 2026-04-20)
// -----------------------------------------------------------------------------
// Previously `configureNotificationHandler()` was called at module load from
// hooks/useNotifications.ts. On the New Architecture (TurboModules) under iOS
// 26.x, the synchronous `Notifications.setNotificationHandler(...)` call during
// JS bundle evaluation can raise an unhandled ObjC exception inside
// `ObjCTurboModule::performVoidMethodInvocation`, which propagates to
// `std::terminate()` -> `abort()` -> SIGABRT (crash on launch before the RN
// ErrorBoundary is mounted).
//
// Fix: lazy, idempotent, defensive. The exported function is now safe to call
// any number of times — internally it runs the native side-effect at most once
// and wraps every native call in try/catch + Platform guard. If the native
// init throws, push notifications simply degrade (no token, no listener)
// instead of killing the app.
// -----------------------------------------------------------------------------
let handlerConfigured = false;
let androidChannelsConfigured = false;

/**
 * TEST-ONLY: reset idempotency flags so unit tests can assert
 * setNotificationHandler / setNotificationChannelAsync were called.
 * Do NOT call from production code — the flags exist precisely to prevent
 * redundant native-side effects that can crash on iOS 26.
 */
export function __resetForTests() {
  handlerConfigured = false;
  androidChannelsConfigured = false;
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
    // Non-silent: surface in Sentry so we can detect register regressions.
    // We swallow only the throw, never the visibility (ZERO-O).
    try {
      Sentry.captureException(error, {
        tags: { feature: 'push', step: 'register' },
      });
    } catch {
      // ignore — Sentry must never crash the caller
    }
    return null;
  }
}

// -----------------------------------------------------------------------------
// Server-side persistence (pragas_push_tokens audit table)
// -----------------------------------------------------------------------------

interface DeviceFingerprint {
  os: 'ios' | 'android' | 'web' | 'unknown';
  osVersion: string | null;
  deviceName: string | null;
  modelName: string | null;
  brand: string | null;
  appVersion: string;
  buildNumber: string | null;
}

function buildDeviceFingerprint(): DeviceFingerprint {
  const platform: DeviceFingerprint['os'] =
    Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web'
      ? Platform.OS
      : 'unknown';
  const expoConfig = Constants.expoConfig;
  const buildNumber =
    Platform.OS === 'ios'
      ? (expoConfig?.ios?.buildNumber ?? null)
      : Platform.OS === 'android' && expoConfig?.android?.versionCode != null
        ? String(expoConfig.android.versionCode)
        : null;
  return {
    os: platform,
    osVersion: typeof Device.osVersion === 'string' ? Device.osVersion : null,
    deviceName: typeof Device.deviceName === 'string' ? Device.deviceName : null,
    modelName: typeof Device.modelName === 'string' ? Device.modelName : null,
    brand: typeof Device.brand === 'string' ? Device.brand : null,
    appVersion: expoConfig?.version ?? '0.0.0',
    buildNumber,
  };
}

/**
 * Persists the Expo push token to the `pragas_push_tokens` audit table via
 * the SECURITY DEFINER RPC `touch_push_token`. Idempotent server-side.
 *
 * `force=true` bypasses the 30-day cool-down and always hits the server.
 * Use it on explicit login or on app version update. On every cold start
 * the hook layer also calls this with force=false, which only hits the
 * network if the last sync is stale.
 *
 * Returns true on success, false on any failure. Failures are reported to
 * Sentry with tags so we can dashboard them, but they never throw — push
 * registration must NEVER block app boot.
 */
export async function persistPushTokenToServer(
  token: string,
  options: { force?: boolean } = {},
): Promise<boolean> {
  if (Platform.OS === 'web') {
    // pragas_push_tokens is mobile-only; web sessions never need a row.
    return false;
  }
  if (!token || token.length < 10) {
    return false;
  }

  try {
    if (!options.force) {
      const last = await AsyncStorage.getItem(PUSH_TOKEN_LAST_SYNC_KEY);
      const lastTs = last ? Number(last) : 0;
      if (Number.isFinite(lastTs) && Date.now() - lastTs < TOKEN_REFRESH_INTERVAL_MS) {
        // Recent enough — skip network call.
        return true;
      }
    }

    const fingerprint = buildDeviceFingerprint();
    // Use the RPC — it enforces auth.uid() server-side and upserts atomically.
    const { error } = await supabase.rpc('touch_push_token', {
      p_expo_token: token,
      p_platform: fingerprint.os,
      p_device_info: fingerprint,
    });

    if (error) {
      // Don't go silent — emit to Sentry so we can spot RLS / RPC regressions.
      try {
        Sentry.captureMessage('persistPushTokenToServer rpc error', {
          level: 'warning',
          tags: {
            feature: 'push',
            step: 'persist',
            code: error.code ?? 'unknown',
          },
          extra: { message: error.message },
        });
      } catch {
        /* Sentry must never crash caller */
      }
      if (__DEV__) console.warn('[notifications] persistPushTokenToServer error:', error.message);
      return false;
    }

    await AsyncStorage.setItem(PUSH_TOKEN_LAST_SYNC_KEY, String(Date.now()));
    return true;
  } catch (err) {
    try {
      Sentry.captureException(err, {
        tags: { feature: 'push', step: 'persist' },
      });
    } catch {
      /* Sentry must never crash caller */
    }
    if (__DEV__) console.warn('[notifications] persistPushTokenToServer threw:', err);
    return false;
  }
}

/**
 * Force a server-side refresh on the next call. Used by tests.
 */
export async function __resetPushTokenSyncCache(): Promise<void> {
  await AsyncStorage.removeItem(PUSH_TOKEN_LAST_SYNC_KEY);
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
