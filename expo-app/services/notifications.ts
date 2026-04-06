import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PUSH_TOKEN_KEY = '@rumo_pragas_push_token';

/**
 * Configures the default notification handler.
 * Must be called at module level (outside components).
 */
export function configureNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/**
 * Registers for push notifications and returns the Expo push token.
 * On Android, also creates the default notification channel.
 * Returns null if permissions are denied or running on simulator.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  // Push notifications only work on physical devices
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  // Create Android notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('pest-alerts', {
      name: 'Alertas de Pragas',
      description: 'Notificacoes sobre riscos de pragas na sua regiao',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1A966B',
      sound: 'default',
    });

    await Notifications.setNotificationChannelAsync('general', {
      name: 'Geral',
      description: 'Notificacoes gerais do aplicativo',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

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
    console.log('Notification permissions not granted');
    return null;
  }

  // Get Expo push token
  try {
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;

    if (!projectId) {
      console.warn('EAS projectId not found, cannot register for push notifications');
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;

    // Save token locally (will be synced to Supabase pragas_profiles later)
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);

    return token;
  } catch (error) {
    console.error('Error getting push token:', error);
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
 */
export async function scheduleLocalPestAlert(
  title: string,
  body: string,
  data?: Record<string, unknown>,
  delaySeconds: number = 1,
) {
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
}
