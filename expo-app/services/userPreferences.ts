import AsyncStorage from '@react-native-async-storage/async-storage';
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

/**
 * AsyncStorage key holding a location-consent decision that could NOT be
 * persisted to the server (offline / degraded network) at the moment the user
 * made it. It is replayed on the next boot with a session so the LGPD proof is
 * never silently lost while the local "consent seen" flag already advanced the
 * user into the app. Only the LATEST pending decision is kept.
 */
const PENDING_LOCATION_CONSENT_KEY = '@rumopragas/pending_location_consent';

interface PendingLocationConsent {
  userId: string;
  shareLocation: boolean;
  purpose: string;
  /** ISO timestamp captured when the user actually made the choice. */
  consentedAt: string;
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
  // The moment the user made the choice. Defaults to now, but callers replaying
  // a queued (offline) decision pass the ORIGINAL timestamp so the audit trail
  // reflects when consent was actually given, not when it finally synced.
  consentedAt: string = new Date().toISOString(),
): Promise<void> {
  const { error } = await supabase.from('user_preferences').upsert(
    {
      user_id: userId,
      share_location: shareLocation,
      share_location_purpose: purpose,
      consented_at: consentedAt,
    },
    { onConflict: 'user_id' },
  );
  if (error) {
    if (__DEV__) console.error('[userPreferences] upsert failed:', error.message);
    throw new Error(error.message);
  }
}

/**
 * Queue a consent decision that failed to reach the server (offline / degraded
 * network), so it can be replayed on the next boot. Never throws — a queue
 * write failure must not surface to the LGPD gate, which already degrades
 * gracefully and lets the user into the app.
 */
export async function enqueuePendingLocationConsent(
  userId: string,
  shareLocation: boolean,
  purpose: string,
  consentedAt: string,
): Promise<void> {
  try {
    const payload: PendingLocationConsent = { userId, shareLocation, purpose, consentedAt };
    await AsyncStorage.setItem(PENDING_LOCATION_CONSENT_KEY, JSON.stringify(payload));
  } catch (e) {
    if (__DEV__) console.warn('[userPreferences] failed to queue pending consent:', e);
  }
}

/**
 * Replay a queued (offline) consent decision. Call once a session is available
 * on boot. Idempotent and best-effort: on success the queue is cleared; on a
 * still-failing network the record is KEPT for the next boot so the LGPD proof
 * is never dropped. A record belonging to a different user (account switch) is
 * left untouched — it replays when that user next boots, or is overwritten by a
 * newer decision. Never throws / never blocks.
 */
export async function flushPendingLocationConsent(currentUserId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_LOCATION_CONSENT_KEY);
    if (!raw) return;

    let pending: PendingLocationConsent;
    try {
      pending = JSON.parse(raw) as PendingLocationConsent;
    } catch {
      // Corrupt payload — drop it so it cannot wedge every boot.
      await AsyncStorage.removeItem(PENDING_LOCATION_CONSENT_KEY);
      return;
    }

    if (!pending?.userId || typeof pending.shareLocation !== 'boolean') {
      await AsyncStorage.removeItem(PENDING_LOCATION_CONSENT_KEY);
      return;
    }
    // Only replay the current user's own decision. Leave a foreign record in
    // place (do not write it under this session).
    if (pending.userId !== currentUserId) return;

    await setLocationConsent(
      pending.userId,
      pending.shareLocation,
      pending.purpose,
      pending.consentedAt,
    );
    // Persisted — clear the queue.
    await AsyncStorage.removeItem(PENDING_LOCATION_CONSENT_KEY);
  } catch (e) {
    // Still offline / server down — keep the record for the next boot.
    if (__DEV__) console.warn('[userPreferences] pending consent replay failed:', e);
  }
}
