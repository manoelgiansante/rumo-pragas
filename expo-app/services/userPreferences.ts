import { supabase } from './supabase';

/**
 * P0-3 (LGPD) — user_preferences service.
 *
 * Stores the explicit, informed opt-in consent for sharing the user's
 * location with the diagnosis edge function. By default no row exists,
 * which is equivalent to `share_location = false`.
 *
 * Reads/writes go through Supabase RLS so a user can only access its own row.
 */

export interface UserPreferences {
  share_location: boolean;
  share_location_purpose: string | null;
  consented_at: string | null;
}

const DEFAULT_PREFS: UserPreferences = {
  share_location: false,
  share_location_purpose: null,
  consented_at: null,
};

/**
 * Get the current user's preferences. Returns defaults (no consent) if no
 * row exists yet or the read fails.
 */
export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  try {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('share_location, share_location_purpose, consented_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      if (__DEV__) console.warn('[userPreferences] read failed:', error.message);
      return DEFAULT_PREFS;
    }
    return data ?? DEFAULT_PREFS;
  } catch (e) {
    if (__DEV__) console.warn('[userPreferences] exception reading prefs:', e);
    return DEFAULT_PREFS;
  }
}

/**
 * Convenience — returns true only if the user has explicitly opted in.
 * Any error / missing row falls back to FALSE (LGPD-safe default).
 */
export async function hasLocationConsent(userId: string): Promise<boolean> {
  const prefs = await getUserPreferences(userId);
  return prefs.share_location === true;
}

/**
 * Persist the user's consent choice. Upsert-style so onboarding can record
 * both "accepted" and "declined" without a separate first-insert step.
 *
 * @param userId     Supabase auth user id
 * @param shareLocation  true = opt-in, false = opt-out / revoke
 * @param purpose    Free-text purpose shown to the user (kept for audit)
 */
export async function setLocationConsent(
  userId: string,
  shareLocation: boolean,
  purpose: string,
): Promise<void> {
  const { error } = await supabase.from('user_preferences').upsert(
    {
      user_id: userId,
      share_location: shareLocation,
      share_location_purpose: purpose,
      consented_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) {
    if (__DEV__) console.error('[userPreferences] upsert failed:', error.message);
    throw new Error(error.message);
  }
}
