import { useEffect, useRef, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import {
  configureNotificationHandler,
  registerForPushNotificationsAsync,
} from '../services/notifications';
import { supabase } from '../services/supabase';

// Configure handler at module level so it runs once
configureNotificationHandler();

interface UseNotificationsReturn {
  expoPushToken: string | null;
  notification: Notifications.Notification | null;
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
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  const syncTokenToSupabase = useCallback(async (token: string) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('pragas_profiles').update({ push_token: token }).eq('id', user.id);
      }
    } catch (error) {
      console.warn('Failed to sync push token to Supabase:', error);
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
    if (shouldRegister) {
      registerForNotifications();
    }

    // Listen for notifications received while app is in foreground
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (receivedNotification) => {
        setNotification(receivedNotification);
      },
    );

    // Listen for user tapping on a notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;

      // Handle deep linking based on notification data
      if (data?.screen === 'diagnosis' && data?.diagnosisId) {
        router.push(`/diagnosis/${data.diagnosisId}`);
      } else if (data?.screen === 'home') {
        router.replace('/(tabs)');
      }
      // Default: just open the app (already handled by OS)
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [shouldRegister, registerForNotifications]);

  return {
    expoPushToken,
    notification,
    registerForNotifications,
  };
}
