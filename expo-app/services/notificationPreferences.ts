/**
 * Notification preferences — read / write to pragas_profiles.notification_preferences
 * (JSONB column added in 20260521_push_tokens_and_notif_prefs.sql).
 *
 * Defaults match the SQL column DEFAULT — change in BOTH places if you touch
 * the contract. The server is the source of truth; AsyncStorage holds a
 * read-through cache so the Settings UI renders immediately offline.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const CACHE_KEY = '@rumo_pragas_notification_prefs';

export interface NotificationPreferences {
  /** Regional outbreak alerts (pest pressure rising near user's farm) */
  outbreaks_regional: boolean;
  /** Daily reminder to log scouting / consult forecast */
  daily_reminder: boolean;
  /** Product news (new pest IDs, AI model updates, feature drops) */
  news: boolean;
  /** Marketing / promo (defaults to OFF — LGPD + Apple) */
  marketing: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  outbreaks_regional: true,
  daily_reminder: true,
  news: true,
  marketing: false,
};

function coerce(raw: unknown): NotificationPreferences {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  const obj = raw as Record<string, unknown>;
  return {
    outbreaks_regional:
      typeof obj.outbreaks_regional === 'boolean'
        ? obj.outbreaks_regional
        : DEFAULT_NOTIFICATION_PREFERENCES.outbreaks_regional,
    daily_reminder:
      typeof obj.daily_reminder === 'boolean'
        ? obj.daily_reminder
        : DEFAULT_NOTIFICATION_PREFERENCES.daily_reminder,
    news: typeof obj.news === 'boolean' ? obj.news : DEFAULT_NOTIFICATION_PREFERENCES.news,
    marketing:
      typeof obj.marketing === 'boolean'
        ? obj.marketing
        : DEFAULT_NOTIFICATION_PREFERENCES.marketing,
  };
}

async function readCache(): Promise<NotificationPreferences | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return coerce(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function writeCache(prefs: NotificationPreferences): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(prefs));
  } catch {
    // best-effort cache, don't crash on disk-full
  }
}

/**
 * Loads notification preferences for the current authenticated user.
 * Returns the cache immediately when offline; otherwise fetches from Supabase
 * and updates the cache. Always returns a complete object (never partial).
 */
export async function loadNotificationPreferences(
  userId: string,
): Promise<NotificationPreferences> {
  // Defensive: web never gets push, so just hand back defaults.
  if (Platform.OS === 'web') {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
  try {
    const { data, error } = await supabase
      .from('pragas_profiles')
      .select('notification_preferences')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      try {
        Sentry.captureMessage('loadNotificationPreferences error', {
          level: 'warning',
          tags: { feature: 'push_prefs', step: 'load', code: error.code ?? 'unknown' },
          extra: { message: error.message },
        });
      } catch {
        /* swallow */
      }
      const cached = await readCache();
      return cached ?? { ...DEFAULT_NOTIFICATION_PREFERENCES };
    }

    const prefs = coerce(data?.notification_preferences);
    await writeCache(prefs);
    return prefs;
  } catch (err) {
    try {
      Sentry.captureException(err, { tags: { feature: 'push_prefs', step: 'load' } });
    } catch {
      /* swallow */
    }
    const cached = await readCache();
    return cached ?? { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
}

/**
 * Persists notification preferences for the current authenticated user.
 * Optimistically updates the cache; on server error rolls back the cache
 * to the previous value and surfaces the error.
 */
export async function saveNotificationPreferences(
  userId: string,
  patch: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  const previous = (await readCache()) ?? { ...DEFAULT_NOTIFICATION_PREFERENCES };
  const next: NotificationPreferences = { ...previous, ...patch };

  await writeCache(next);

  if (Platform.OS === 'web') {
    return next;
  }

  try {
    const { error } = await supabase
      .from('pragas_profiles')
      .update({
        notification_preferences: { ...next, updated_at: new Date().toISOString() },
      })
      .eq('user_id', userId);

    if (error) {
      // rollback cache so UI shows real server state on next reload
      await writeCache(previous);
      try {
        Sentry.captureMessage('saveNotificationPreferences error', {
          level: 'warning',
          tags: { feature: 'push_prefs', step: 'save', code: error.code ?? 'unknown' },
          extra: { message: error.message },
        });
      } catch {
        /* swallow */
      }
      throw new Error(error.message);
    }

    return next;
  } catch (err) {
    // Ensure cache is in sync with prior known good value
    await writeCache(previous);
    try {
      Sentry.captureException(err, { tags: { feature: 'push_prefs', step: 'save' } });
    } catch {
      /* swallow */
    }
    throw err instanceof Error ? err : new Error('save_failed');
  }
}

/**
 * TEST-ONLY: wipes the AsyncStorage cache so unit tests start clean.
 */
export async function __resetNotificationPreferencesCache(): Promise<void> {
  await AsyncStorage.removeItem(CACHE_KEY);
}
