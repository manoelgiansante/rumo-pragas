import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureMessage } from './sentry-shim';
import i18n from '../i18n';
import { supabase } from './supabase';

const PUSH_TOKEN_KEY = '@rumo_pragas_push_token';
const PUSH_TOKEN_LAST_SYNC_KEY = '@rumo_pragas_push_token_last_sync';
export const PUSH_ENABLED_KEY = '@rumo_pragas_push_enabled';
type PushPreferenceListener = (enabled: boolean) => void;
const pushPreferenceListeners = new Set<PushPreferenceListener>();
// Refresh the server-side audit row at most once every 30 days.
// We still call on every login (handled in useNotifications) for liveness.
const TOKEN_REFRESH_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Remote push is a build capability, not a runtime guess. iOS uses APNs/EAS
 * credentials; Android requires the GOOGLE_SERVICES_JSON file secret to have
 * been injected by app.config.js. Local climate notifications remain usable
 * when this returns false.
 */
export function isRemotePushBuildConfigured(): boolean {
  if (Platform.OS === 'web') return false;
  if (Platform.OS === 'ios') return true;
  return Constants.expoConfig?.extra?.remotePush?.androidConfigured === true;
}

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

export async function isPushNotificationsEnabled(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(PUSH_ENABLED_KEY);
    if (raw === 'true') return true;
    if (raw === 'false' || Platform.OS === 'web') return false;

    // No stored preference: never trigger an OS prompt during boot. Preserve a
    // previously active installation only when a token exists or the user had
    // already granted the native permission outside this call.
    const savedToken = await getSavedPushToken();
    const { status } = await Notifications.getPermissionsAsync();
    return !!savedToken && status === 'granted';
  } catch {
    return false;
  }
}

export function subscribePushPreference(listener: PushPreferenceListener): () => void {
  pushPreferenceListeners.add(listener);
  return () => pushPreferenceListeners.delete(listener);
}

async function revokePushDelivery(): Promise<void> {
  if (Platform.OS === 'web') return;
  const token = await getSavedPushToken();
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    if (__DEV__) console.warn('[notifications] cancel scheduled failed');
  }
  try {
    await Notifications.unregisterForNotificationsAsync();
  } catch {
    if (__DEV__) console.warn('[notifications] unregister failed');
  }
  if (token) {
    // Best-effort app-scoped soft revocation. The RPC derives auth.uid() and
    // never accepts a user id from the client.
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    const { error } = await supabase.rpc('touch_pragas_push_token', {
      p_token: token,
      p_platform: platform,
      p_notifications_enabled: false,
    });
    if (error && __DEV__) console.warn('[notifications] token revoke failed');
  }
  await AsyncStorage.multiRemove([PUSH_TOKEN_KEY, PUSH_TOKEN_LAST_SYNC_KEY]);
}

export async function setPushNotificationsEnabled(enabled: boolean): Promise<boolean> {
  let actual = enabled;
  if (enabled) {
    if (Platform.OS === 'web') {
      actual = false;
    } else {
      configureNotificationHandler();
      await ensureAndroidChannelsConfigured();
      const current = await Notifications.getPermissionsAsync();
      const permission =
        current.status === 'granted'
          ? current
          : await Notifications.requestPermissionsAsync({
              ios: { allowAlert: true, allowBadge: true, allowSound: true },
            });
      actual = permission.status === 'granted';
    }
  }

  await AsyncStorage.setItem(PUSH_ENABLED_KEY, String(actual));
  if (!actual) await revokePushDelivery();
  pushPreferenceListeners.forEach((listener) => listener(actual));
  return actual;
}

/** Best-effort remote/native revocation used before an authenticated logout. */
export async function revokePushDeliveryForSignOut(): Promise<void> {
  try {
    await revokePushDelivery();
  } catch {
    if (__DEV__) console.warn('[notifications] logout revocation failed');
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
  } catch {
    // Non-fatal: iOS 26 TurboModule may throw during init; log and continue.
    if (__DEV__) console.warn('[notifications] setNotificationHandler failed');
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
    await Notifications.setNotificationChannelAsync('climate-risk', {
      name: i18n.t('notifications.climateRiskChannel'),
      description: i18n.t('notifications.climateRiskDesc'),
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
  } catch {
    if (__DEV__) console.warn('[notifications] Android channels failed');
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
  if (!(await isPushNotificationsEnabled())) return null;

  try {
    // Push notifications only work on physical devices
    if (!Device.isDevice) {
      if (__DEV__) console.warn('Push notifications require a physical device');
      return null;
    }

    // Lazy init on first use only.
    configureNotificationHandler();
    await ensureAndroidChannelsConfigured();

    // Registration is automatic after login, so it must never present a native
    // permission prompt. Only the explicit Settings opt-in requests permission.
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    if (existingStatus !== 'granted') {
      if (__DEV__) console.warn('Notification permissions not granted');
      return null;
    }

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;

    if (!projectId) {
      if (__DEV__) console.warn('EAS projectId not found, cannot register for push notifications');
      return null;
    }

    // An Android build without the FCM file cannot obtain a remote Expo token.
    // Fail closed without calling the native token API; local climate alerts
    // are a separate capability and continue to use the climate-risk channel.
    if (!isRemotePushBuildConfigured()) {
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;

    // Save token locally; the canonical server sync uses pragas_push_tokens.
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);

    return token;
  } catch {
    if (__DEV__) console.warn('[notifications] registration failed');
    // Non-silent: surface in Sentry so we can detect register regressions.
    // We swallow only the throw, never the visibility (ZERO-O).
    try {
      captureMessage('push registration failed', {
        level: 'warning',
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

/**
 * Persists the Expo push token to the `pragas_push_tokens` audit table via
 * the app-scoped SECURITY DEFINER RPC `touch_pragas_push_token`.
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

    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    // App-scoped RPC derives auth.uid() server-side and upserts atomically.
    const { error } = await supabase.rpc('touch_pragas_push_token', {
      p_token: token,
      p_platform: platform,
      p_notifications_enabled: true,
    });

    if (error) {
      // Don't go silent — emit to Sentry so we can spot RLS / RPC regressions.
      try {
        captureMessage('persistPushTokenToServer rpc error', {
          level: 'warning',
          tags: {
            feature: 'push',
            step: 'persist',
            code: error.code ?? 'unknown',
          },
        });
      } catch {
        /* Sentry must never crash caller */
      }
      if (__DEV__) console.warn('[notifications] token persistence failed');
      return false;
    }

    await AsyncStorage.setItem(PUSH_TOKEN_LAST_SYNC_KEY, String(Date.now()));
    return true;
  } catch {
    try {
      captureMessage('push token persistence failed', {
        level: 'warning',
        tags: { feature: 'push', step: 'persist' },
      });
    } catch {
      /* Sentry must never crash caller */
    }
    if (__DEV__) console.warn('[notifications] token persistence failed');
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
 * Schedules local notifications for high-severity climate risk rules.
 * Limits to a maximum of 2 notifications per batch to avoid spamming the user.
 */
export async function scheduleClimateRiskNotifications(
  alerts: { id: string; title: string; description: string; severity: string }[],
): Promise<void> {
  if (!(await isPushNotificationsEnabled())) return;
  const highAlerts = alerts.filter((a) => a.severity === 'high');

  for (const alert of highAlerts.slice(0, 2)) {
    await scheduleLocalClimateRiskAlert(
      alert.title,
      alert.description,
      { screen: 'home', alertId: alert.id },
      5,
    );
  }
}

/**
 * Schedules a local notification for a climate-derived educational risk.
 * Safe on web (no-op) and wraps native errors so a failure degrades instead
 * of crashing the caller.
 */
export async function scheduleLocalClimateRiskAlert(
  title: string,
  body: string,
  data?: Record<string, unknown>,
  delaySeconds: number = 1,
) {
  if (Platform.OS === 'web') return;
  if (!(await isPushNotificationsEnabled())) return;
  try {
    configureNotificationHandler();
    await ensureAndroidChannelsConfigured();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: title.trim().slice(0, 80),
        body: body.trim().slice(0, 240),
        data: data ?? {},
        sound: 'default',
        ...(Platform.OS === 'android' && { channelId: 'climate-risk' }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds:
          Number.isFinite(delaySeconds) && delaySeconds >= 1
            ? Math.min(Math.floor(delaySeconds), 86_400)
            : 1,
      },
    });
  } catch {
    if (__DEV__) console.warn('[notifications] local climate alert scheduling failed');
  }
}
