import { useEffect, useRef, useState, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { captureMessage } from '../services/sentry-shim';
import {
  configureNotificationHandler,
  persistPushTokenToServer,
  registerForPushNotificationsAsync,
  isPushNotificationsEnabled,
  subscribePushPreference,
} from '../services/notifications';

// iOS 26 TurboModule crash fix: do NOT call configureNotificationHandler() at
// module-load time. It is now lazy+idempotent (see services/notifications.ts)
// and is invoked the first time the hook mounts or registerForPushNotificationsAsync
// is called.

interface UseNotificationsReturn {
  expoPushToken: string | null;
  notification: Notifications.Notification | null;
  registerForNotifications: () => Promise<string | null>;
}

// -----------------------------------------------------------------------------
// Deep-link validation
// -----------------------------------------------------------------------------
//
// Why this matters: notification payloads originate server-side but are
// processed *client-side* and fed directly to expo-router.push(). A
// compromised or buggy backend could craft a `screen` value that breaks out
// of our app's route tree (`/../../../admin`) or a `diagnosisId` that is a
// path-traversal string. We mitigate by:
//   1. Whitelisting the screens we are willing to route to.
//   2. Validating UUID v1-v5 strict pattern for any id that becomes a route.
//   3. Silently dropping invalid payloads and surfacing them in Sentry
//      (warning level — not user-facing).
//
// We deliberately use a STRICT RFC-4122 UUID regex (8-4-4-4-12 with hex,
// version digit 1–5). This rejects the common "${something}" template-string
// leaks that occasionally ship in dev pushes.
const UUID_STRICT_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AllowedScreen = 'diagnosis' | 'diagnosis-reinspection' | 'settings' | 'history' | 'home';
const ALLOWED_SCREENS: ReadonlySet<AllowedScreen> = new Set([
  'diagnosis',
  'diagnosis-reinspection',
  'settings',
  'history',
  'home',
]);

function isAllowedScreen(value: unknown): value is AllowedScreen {
  return typeof value === 'string' && ALLOWED_SCREENS.has(value as AllowedScreen);
}

function isStrictUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_STRICT_RE.test(value);
}

/**
 * Resolves a notification payload to a safe route, or null if the payload
 * is malformed / unauthorised. Exposed for unit testing.
 */
export function resolveNotificationRoute(data: unknown): string | null {
  if (data === null || typeof data !== 'object') return null;
  const payload = data as Record<string, unknown>;
  const screen = payload.screen;
  if (!isAllowedScreen(screen)) return null;

  switch (screen) {
    case 'diagnosis': {
      const id = payload.diagnosisId;
      if (!isStrictUuid(id)) return null;
      // The result route requires a complete serialized result payload; a
      // diagnosis UUID alone cannot hydrate it. History is the existing safe
      // destination from which the authenticated row can be opened.
      return '/(tabs)/history';
    }
    case 'diagnosis-reinspection': {
      // Local re-inspection reminder scheduled by app/diagnosis/result.tsx.
      // Its payload carries only `{ screen, days }` — no diagnosis id — and the
      // result screen cannot be hydrated from an id alone anyway (see the
      // 'diagnosis' case above). History holds the saved diagnosis the user is
      // being reminded to re-check, so it is the useful, safe destination.
      return '/(tabs)/history';
    }
    case 'settings':
      return '/(tabs)/settings';
    case 'history':
      return '/(tabs)/history';
    case 'home':
      return '/(tabs)';
    default:
      // exhaustiveness guard — keeps TS strict if a new screen is added
      return null;
  }
}

function captureRouteRejection(reason: string, data: unknown): void {
  try {
    captureMessage('push deep-link rejected', {
      level: 'warning',
      tags: { feature: 'push', step: 'deep_link', reason },
      // Don't log full payload (may contain PII); log only the shape.
      extra:
        data && typeof data === 'object'
          ? { keys: Object.keys(data as Record<string, unknown>) }
          : { type: typeof data },
    });
  } catch {
    /* Sentry must never crash caller */
  }
}

/**
 * Hook that manages push notification registration and incoming notification handling.
 * - Registers for push notifications on mount (if shouldRegister is true)
 * - Listens for incoming notifications while app is foregrounded
 * - Handles notification tap responses (deep linking) with whitelist + UUID validation
 */
export function useNotifications(shouldRegister: boolean = false): UseNotificationsReturn {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [preferenceReady, setPreferenceReady] = useState(false);
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    let mounted = true;
    isPushNotificationsEnabled().then((enabled) => {
      if (!mounted) return;
      setPushEnabled(enabled);
      setPreferenceReady(true);
    });
    const unsubscribe = subscribePushPreference((enabled) => {
      setPushEnabled(enabled);
      setPreferenceReady(true);
      if (!enabled) setExpoPushToken(null);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const syncTokenToSupabase = useCallback(async (token: string) => {
    try {
      // Canonical multi-device path. No legacy profile side write is allowed:
      // app-specific linkage/RLS is established before this hook can run.
      await persistPushTokenToServer(token, { force: true });
    } catch {
      if (__DEV__) console.warn('[notifications] token sync failed');
      try {
        captureMessage('push token sync failed', {
          level: 'warning',
          tags: { feature: 'push', step: 'sync' },
        });
      } catch {
        /* swallow */
      }
    }
  }, []);

  const registerForNotifications = useCallback(async () => {
    const token = await registerForPushNotificationsAsync();
    if (token) {
      setExpoPushToken(token);
      await syncTokenToSupabase(token);
    }
    return token;
  }, [syncTokenToSupabase]);

  useEffect(() => {
    // Web has no native push — skip listener installation to avoid TurboModule
    // calls on a platform that does not implement them.
    if (Platform.OS === 'web') {
      return;
    }
    if (!preferenceReady || !pushEnabled) return;

    // Lazy, idempotent handler init. Wrapped in try/catch by the service.
    configureNotificationHandler();

    if (shouldRegister) {
      registerForNotifications();
    }

    // Listen for notifications received while app is in foreground.
    // Wrapped in try/catch because on iOS 26 the TurboModule init may throw;
    // in that case we degrade to no-op listeners instead of crashing the app.
    try {
      notificationListener.current = Notifications.addNotificationReceivedListener(
        (receivedNotification) => {
          setNotification(receivedNotification);
        },
      );
    } catch {
      if (__DEV__) console.warn('[notifications] received listener unavailable');
    }

    try {
      responseListener.current = Notifications.addNotificationResponseReceivedListener(
        (response) => {
          const data = response.notification.request.content.data;
          const route = resolveNotificationRoute(data);
          if (route === null) {
            captureRouteRejection('invalid_payload', data);
            return;
          }
          // /(tabs) is a layout target so use replace; everything else stacks.
          if (route === '/(tabs)') {
            router.replace(route);
          } else {
            router.push(route);
          }
        },
      );
    } catch {
      if (__DEV__) console.warn('[notifications] response listener unavailable');
    }

    return () => {
      try {
        if (notificationListener.current) {
          notificationListener.current.remove();
        }
        if (responseListener.current) {
          responseListener.current.remove();
        }
      } catch {
        // ignore removal errors — app is unmounting anyway
      }
    };
  }, [shouldRegister, registerForNotifications, preferenceReady, pushEnabled]);

  return {
    expoPushToken,
    notification,
    registerForNotifications,
  };
}
