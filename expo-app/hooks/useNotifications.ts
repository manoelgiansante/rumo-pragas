/* eslint-disable @typescript-eslint/no-var-requires */
import { useEffect, useRef, useState, useCallback } from 'react';
import type * as NotificationsType from 'expo-notifications';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import {
  configureNotificationHandler,
  registerForPushNotificationsAsync,
} from '../services/notifications';
import { supabase } from '../services/supabase';

// iOS 26 + iPad Reviewer (Apple 2.1(a)) defense:
// 1) configureNotificationHandler() is lazy + idempotent (services/notifications.ts).
// 2) `expo-notifications` itself is loaded via a LAZY require() inside
//    useEffect (post-mount, after the first paint). Top-level imports of native
//    modules can stall bundle eval on the iPad reviewer device and trap the
//    splash screen — by deferring the require until after mount, a hung native
//    init at most stalls the listener registration (silently degrades) instead
//    of preventing the app from rendering. require() also avoids the
//    `--experimental-vm-modules` requirement that dynamic import() imposes on
//    jest, keeping the test suite simple.

interface UseNotificationsReturn {
  expoPushToken: string | null;
  notification: NotificationsType.Notification | null;
  registerForNotifications: () => Promise<string | null>;
}

/**
 * Hook that manages push notification registration and incoming notification handling.
 * - Registers for push notifications on mount (if shouldRegister is true)
 * - Listens for incoming notifications while app is foregrounded
 * - Handles notification tap responses (deep linking)
 */
export function useNotifications(shouldRegister: boolean = false): UseNotificationsReturn {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<NotificationsType.Notification | null>(null);
  const notificationListener = useRef<NotificationsType.EventSubscription | null>(null);
  const responseListener = useRef<NotificationsType.EventSubscription | null>(null);

  const syncTokenToSupabase = useCallback(async (token: string) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('pragas_profiles').update({ push_token: token }).eq('id', user.id);
      }
    } catch (error) {
      if (__DEV__) console.warn('Failed to sync push token to Supabase:', error);
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

    // Lazy, idempotent handler init. Wrapped in try/catch by the service.
    try {
      configureNotificationHandler();
    } catch (e) {
      if (__DEV__) console.warn('[notifications] configureNotificationHandler threw:', e);
    }

    if (shouldRegister) {
      registerForNotifications();
    }

    let Notifications: typeof NotificationsType | null = null;
    try {
      const mod = require('expo-notifications');
      Notifications = (mod && mod.default ? mod.default : mod) as typeof NotificationsType;
    } catch (e) {
      if (__DEV__) console.warn('[notifications] require failed (non-fatal):', e);
      return;
    }

    if (!Notifications) return;

    // Listen for notifications received while app is in foreground.
    try {
      notificationListener.current = Notifications.addNotificationReceivedListener(
        (receivedNotification) => {
          setNotification(receivedNotification);
        },
      );
    } catch (error) {
      if (__DEV__) console.warn('[notifications] addNotificationReceivedListener failed:', error);
    }

    try {
      responseListener.current = Notifications.addNotificationResponseReceivedListener(
        (response) => {
          const data = response.notification.request.content.data;
          if (data?.screen === 'diagnosis' && data?.diagnosisId) {
            router.push(`/diagnosis/${data.diagnosisId}`);
          } else if (data?.screen === 'home') {
            router.replace('/(tabs)');
          }
        },
      );
    } catch (error) {
      if (__DEV__)
        console.warn('[notifications] addNotificationResponseReceivedListener failed:', error);
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
  }, [shouldRegister, registerForNotifications]);

  return {
    expoPushToken,
    notification,
    registerForNotifications,
  };
}
