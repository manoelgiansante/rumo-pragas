import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';
import { trackEvent } from './analytics';

/**
 * P0-3 (LGPD) — user_preferences service.
 *
 * Stores the explicit, informed opt-in consent for sharing the user's
 * location with the diagnosis edge function. By default no row exists,
 * which is equivalent to `share_location = false`.
 *
 * Reads/writes use the dedicated `pragas_user_preferences` table; the generic
 * multi-app `user_preferences` table is intentionally never touched.
 */

export interface UserPreferences {
  share_location: boolean;
  share_location_purpose: string | null;
  consented_at: string | null;
  location_consent_revision: number;
}

/** Stable audit purpose; bump only when the disclosure/data use changes. */
export const LOCATION_CONSENT_PURPOSE =
  'rumo-pragas:approximate-location:open-meteo+diagnosis-context:2026-07-14.1';

/**
 * AsyncStorage key holding the latest location-consent decision until its
 * server write is confirmed. It is written before network I/O and replayed on
 * the next boot, so an opt-out immediately overrides stale server consent and
 * the LGPD audit decision is never silently lost. Each decision has an
 * immutable key so browser tabs/processes can confirm and remove only their
 * own RPC payload without deleting a concurrent withdrawal.
 */
const LEGACY_PENDING_LOCATION_CONSENT_KEY = '@rumopragas/pending_location_consent';
const PENDING_LOCATION_CONSENT_PREFIX = '@rumopragas/pending_location_consent:v2:';
const AUTH_USER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface PendingLocationConsent {
  version: 2;
  userId: string;
  /** Durable idempotency key. It is never regenerated while replaying. */
  decisionId: string;
  shareLocation: boolean;
  purpose: string;
  /** ISO timestamp captured when the user actually made the choice. */
  consentedAt: string;
  /** Server revision observed before a grant; withdrawals intentionally omit it. */
  observedRevision: number | null;
}

type LocationConsentServerOutcome = 'applied' | 'stale_grant';
interface LocationConsentServerResult {
  outcome: LocationConsentServerOutcome;
  currentShareLocation: boolean;
}
interface LocationConsentFlushResult {
  status: 'synced' | 'stale_grant' | 'failed';
  currentShareLocation: boolean | null;
}
interface LocationConsentEnqueueResult {
  queued: boolean;
  decisionId: string | null;
}

const MAX_PENDING_LOCATION_GRANTS_PER_USER = 32;

let pendingConsentOperationTail: Promise<void> = Promise.resolve();
const pendingConsentServerTails = new Map<string, Promise<void>>();

function withPendingConsentLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = pendingConsentOperationTail.catch(() => undefined).then(operation);
  pendingConsentOperationTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function withPendingConsentServerLock<T>(userId: string, operation: () => Promise<T>): Promise<T> {
  const owner = userId.toLowerCase();
  const previous = pendingConsentServerTails.get(owner) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(operation);
  const settled = result.then(
    () => undefined,
    () => undefined,
  );
  pendingConsentServerTails.set(owner, settled);
  void settled.then(() => {
    if (pendingConsentServerTails.get(owner) === settled) {
      pendingConsentServerTails.delete(owner);
    }
  });
  return result;
}

function isValidAuthUserId(userId: string): boolean {
  return AUTH_USER_ID_PATTERN.test(userId);
}

function isValidRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function pendingLocationConsentStorageKey(userId: string): string {
  if (!isValidAuthUserId(userId)) throw new Error('LOCATION_CONSENT_INVALID_USER');
  return `${PENDING_LOCATION_CONSENT_PREFIX}${userId.toLowerCase()}`;
}

export function pendingLocationConsentDecisionStorageKey(
  userId: string,
  decisionId: string,
): string {
  if (!isValidAuthUserId(userId) || !isValidAuthUserId(decisionId)) {
    throw new Error('LOCATION_CONSENT_INVALID_STORAGE_OWNER');
  }
  return `${pendingLocationConsentStorageKey(userId)}:${decisionId.toLowerCase()}`;
}

interface ParsedPendingStorageKey {
  owner: string;
  decisionId: string | null;
}

function parsePendingStorageKey(key: string): ParsedPendingStorageKey | null {
  if (!key.startsWith(PENDING_LOCATION_CONSENT_PREFIX)) return null;
  const parts = key.slice(PENDING_LOCATION_CONSENT_PREFIX.length).split(':');
  if (parts.length !== 1 && parts.length !== 2) return null;
  const [owner, decisionId] = parts;
  if (!owner || !isValidAuthUserId(owner)) return null;
  if (decisionId !== undefined && !isValidAuthUserId(decisionId)) return null;
  const canonical =
    decisionId === undefined
      ? pendingLocationConsentStorageKey(owner)
      : pendingLocationConsentDecisionStorageKey(owner, decisionId);
  if (key !== canonical) return null;
  return {
    owner: owner.toLowerCase(),
    decisionId: decisionId?.toLowerCase() ?? null,
  };
}

function parsePendingConsent(
  raw: string,
  options: { allowLegacy: boolean; expectedUserId?: string },
): PendingLocationConsent | null {
  try {
    const value = JSON.parse(raw) as Partial<PendingLocationConsent>;
    const isLegacyPayload = value.version !== 2;
    if (
      (!options.allowLegacy && isLegacyPayload) ||
      typeof value.userId !== 'string' ||
      !isValidAuthUserId(value.userId) ||
      typeof value.shareLocation !== 'boolean' ||
      value.purpose !== LOCATION_CONSENT_PURPOSE ||
      typeof value.consentedAt !== 'string' ||
      !Number.isFinite(Date.parse(value.consentedAt)) ||
      (options.expectedUserId !== undefined &&
        value.userId.toLowerCase() !== options.expectedUserId.toLowerCase())
    ) {
      return null;
    }

    const hasDecisionId = value.decisionId !== undefined;
    if (
      (hasDecisionId &&
        (typeof value.decisionId !== 'string' || !isValidAuthUserId(value.decisionId))) ||
      (value.shareLocation && !hasDecisionId)
    ) {
      // A legacy grant without the exact revision it observed can never be
      // safely replayed: rebasing it after a withdrawal would resurrect old
      // consent. The user must make a fresh explicit choice instead.
      return null;
    }
    if (
      value.observedRevision !== undefined &&
      value.observedRevision !== null &&
      !isValidRevision(value.observedRevision)
    ) {
      return null;
    }
    if (value.shareLocation && !isValidRevision(value.observedRevision)) return null;

    const decisionId = value.decisionId ?? Crypto.randomUUID();
    if (!isValidAuthUserId(decisionId)) return null;
    return {
      version: 2,
      userId: value.userId.toLowerCase(),
      decisionId: decisionId.toLowerCase(),
      shareLocation: value.shareLocation,
      purpose: value.purpose,
      consentedAt: value.consentedAt,
      observedRevision: value.observedRevision ?? null,
    };
  } catch {
    return null;
  }
}

function isSamePendingDecision(
  left: PendingLocationConsent,
  right: PendingLocationConsent,
): boolean {
  return (
    left.userId === right.userId &&
    left.decisionId === right.decisionId &&
    left.shareLocation === right.shareLocation &&
    left.purpose === right.purpose &&
    left.consentedAt === right.consentedAt &&
    left.observedRevision === right.observedRevision
  );
}

async function persistMigratedPendingConsent(pending: PendingLocationConsent): Promise<void> {
  let candidate = pending;
  let targetKey = pendingLocationConsentDecisionStorageKey(candidate.userId, candidate.decisionId);
  const existingRaw = await AsyncStorage.getItem(targetKey);
  if (existingRaw !== null) {
    const existing = parsePendingConsent(existingRaw, {
      allowLegacy: false,
      expectedUserId: candidate.userId,
    });
    if (existing && isSamePendingDecision(existing, candidate)) return;
    // A legacy withdrawal must not be lost to a malformed/colliding slot. Give
    // it a new durable id; unsafe legacy grants remain fail-closed instead.
    if (candidate.shareLocation) return;
    const replacementId = Crypto.randomUUID().toLowerCase();
    if (!isValidAuthUserId(replacementId)) return;
    candidate = { ...candidate, decisionId: replacementId };
    targetKey = pendingLocationConsentDecisionStorageKey(candidate.userId, replacementId);
  }
  await AsyncStorage.setItem(targetKey, JSON.stringify(candidate));
}

async function migrateLegacyPendingConsent(): Promise<void> {
  const raw = await AsyncStorage.getItem(LEGACY_PENDING_LOCATION_CONSENT_KEY);
  if (raw !== null) {
    const legacy = parsePendingConsent(raw, { allowLegacy: true });
    if (legacy) await persistMigratedPendingConsent(legacy);
    await AsyncStorage.removeItem(LEGACY_PENDING_LOCATION_CONSENT_KEY);
  }

  // Migrate the previous single-slot v2 format to immutable per-decision keys.
  // A worker can now remove only the decision its RPC confirmed, so another
  // browser tab/process cannot have its newer withdrawal deleted underneath it.
  const keys = await AsyncStorage.getAllKeys();
  for (const key of keys) {
    const parsedKey = parsePendingStorageKey(key);
    if (!parsedKey || parsedKey.decisionId !== null) continue;
    const legacyRaw = await AsyncStorage.getItem(key);
    if (legacyRaw !== null) {
      const legacy = parsePendingConsent(legacyRaw, {
        allowLegacy: false,
        expectedUserId: parsedKey.owner,
      });
      if (legacy) await persistMigratedPendingConsent(legacy);
    }
    await AsyncStorage.removeItem(key);
  }
}

async function readPendingConsentsForUserUnlocked(
  userId: string,
): Promise<PendingLocationConsent[]> {
  const owner = userId.toLowerCase();
  const ownerDecisionPrefix = `${pendingLocationConsentStorageKey(owner)}:`;
  const keys = await AsyncStorage.getAllKeys();
  const pending: PendingLocationConsent[] = [];
  const invalidKeys: string[] = [];

  for (const key of keys) {
    if (!key.startsWith(ownerDecisionPrefix)) continue;
    const parsedKey = parsePendingStorageKey(key);
    if (!parsedKey || parsedKey.owner !== owner || parsedKey.decisionId === null) {
      invalidKeys.push(key);
      continue;
    }
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) continue;
    const decision = parsePendingConsent(raw, {
      allowLegacy: false,
      expectedUserId: owner,
    });
    if (!decision || decision.decisionId !== parsedKey.decisionId) {
      invalidKeys.push(key);
      continue;
    }
    const canonical = JSON.stringify(decision);
    if (canonical !== raw) await AsyncStorage.setItem(key, canonical);
    pending.push(decision);
  }

  if (invalidKeys.length > 0) {
    await AsyncStorage.multiRemove(invalidKeys);
    throw new Error('LOCATION_CONSENT_PENDING_INVALID');
  }

  // Client clocks never order consent. Grants are drained first and every
  // withdrawal last, guaranteeing the fail-closed final state across tabs.
  return pending.sort((left, right) => {
    if (left.shareLocation !== right.shareLocation) return left.shareLocation ? -1 : 1;
    return left.decisionId.localeCompare(right.decisionId);
  });
}

async function getPendingConsentsForUser(userId: string): Promise<PendingLocationConsent[]> {
  return withPendingConsentLock(async () => {
    await migrateLegacyPendingConsent();
    return readPendingConsentsForUserUnlocked(userId);
  });
}

const DEFAULT_PREFS: UserPreferences = {
  share_location: false,
  share_location_purpose: null,
  consented_at: null,
  location_consent_revision: 0,
};

/**
 * Get the current user's preferences. Returns defaults (no consent) if no
 * row exists yet or the read fails.
 */
export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  try {
    const { data, error } = await supabase
      .from('pragas_user_preferences')
      .select('share_location, share_location_purpose, consented_at, location_consent_revision')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      if (__DEV__) console.warn('[userPreferences] read failed');
      return DEFAULT_PREFS;
    }
    return data ?? DEFAULT_PREFS;
  } catch {
    if (__DEV__) console.warn('[userPreferences] read failed');
    return DEFAULT_PREFS;
  }
}

/**
 * Read the server-authoritative revision used to bind a new grant. Unlike the
 * convenience preference read, this is strict: an offline/error response must
 * never be replaced with revision zero because that would rebase old consent.
 */
export async function getLocationConsentRevision(userId: string): Promise<number> {
  if (!isValidAuthUserId(userId)) throw new Error('LOCATION_CONSENT_INVALID_USER');
  try {
    const { data, error } = await supabase
      .from('pragas_user_preferences')
      .select('location_consent_revision')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    const revision = data?.location_consent_revision ?? 0;
    if (!isValidRevision(revision)) throw new Error('LOCATION_CONSENT_REVISION_INVALID');
    return revision;
  } catch {
    if (__DEV__) console.warn('[userPreferences] consent revision read failed');
    throw new Error('LOCATION_CONSENT_REVISION_READ_FAILED');
  }
}

async function getLocationConsentServerState(
  userId: string,
): Promise<{ shareLocation: boolean; revision: number }> {
  if (!isValidAuthUserId(userId)) throw new Error('LOCATION_CONSENT_INVALID_USER');
  try {
    const { data, error } = await supabase
      .from('pragas_user_preferences')
      .select('share_location, location_consent_revision')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    const revision = data?.location_consent_revision ?? 0;
    const shareLocation = data?.share_location ?? false;
    if (!isValidRevision(revision) || typeof shareLocation !== 'boolean') throw new Error();
    return { shareLocation, revision };
  } catch {
    throw new Error('LOCATION_CONSENT_STATE_READ_FAILED');
  }
}

/**
 * Convenience — returns true only if the user has explicitly opted in.
 * Any error / missing row falls back to FALSE (LGPD-safe default).
 */
export async function hasLocationConsent(userId: string): Promise<boolean> {
  if (!isValidAuthUserId(userId)) return false;
  try {
    // Check before the network read so a boot-time replay cannot expose stale
    // server consent while its local withdrawal is waiting to sync.
    if ((await getPendingConsentsForUser(userId)).length > 0) return false;
  } catch {
    return false;
  }

  const prefs = await getUserPreferences(userId);
  try {
    // Check again after the network read. A withdrawal may have been queued
    // while a stale `share_location=true` response was in flight.
    if ((await getPendingConsentsForUser(userId)).length > 0) return false;
  } catch {
    return false;
  }
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
  if (
    !isValidAuthUserId(userId) ||
    purpose !== LOCATION_CONSENT_PURPOSE ||
    !Number.isFinite(Date.parse(consentedAt))
  ) {
    throw new Error('LOCATION_CONSENT_INVALID_INPUT');
  }
  let observedRevision: number | null = null;
  if (shareLocation) {
    // A queued withdrawal is authoritative. Sync it before observing a revision
    // for an explicit regrant; if offline, preserve it and remain opted out.
    const previousDecisionSynced = await flushPendingLocationConsent(userId);
    if (!previousDecisionSynced) throw new Error('LOCATION_CONSENT_PENDING_WITHDRAWAL');
    observedRevision = await getLocationConsentRevision(userId);
  }
  // Stage every choice locally before touching the network. In particular, an
  // opt-out becomes an immediate per-user fail-closed override even if the
  // server still contains an older opt-in or is unavailable.
  const queued = await enqueuePendingLocationConsentWithId(
    userId,
    shareLocation,
    purpose,
    consentedAt,
    observedRevision,
  );
  if (!queued.queued || !queued.decisionId) {
    throw new Error('LOCATION_CONSENT_LOCAL_SAVE_FAILED');
  }
  const result = await flushPendingLocationConsentWithOutcome(userId, queued.decisionId);
  if (result.status === 'failed') throw new Error('LOCATION_CONSENT_SAVE_FAILED');
  const currentShareLocation =
    result.currentShareLocation ?? (await getLocationConsentServerState(userId)).shareLocation;
  if (shareLocation && (result.status === 'stale_grant' || currentShareLocation !== true)) {
    throw new Error('LOCATION_CONSENT_STALE_GRANT');
  }
  if (!shareLocation && currentShareLocation !== false) {
    throw new Error('LOCATION_CONSENT_SAVE_FAILED');
  }
}

async function writeLocationConsentToServer(
  pending: PendingLocationConsent,
): Promise<LocationConsentServerResult> {
  const { data, error } = await supabase.rpc('set_pragas_location_consent', {
    p_decision_id: pending.decisionId,
    p_share_location: pending.shareLocation,
    p_purpose: pending.purpose,
    p_consented_at: pending.consentedAt,
    p_observed_revision: pending.observedRevision,
  });
  if (error) {
    if (__DEV__) console.warn('[userPreferences] save failed');
    throw new Error('LOCATION_CONSENT_SAVE_FAILED');
  }
  if (
    data === null ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    typeof data.applied !== 'boolean' ||
    typeof data.code !== 'string' ||
    typeof data.decision_id !== 'string' ||
    data.decision_id.toLowerCase() !== pending.decisionId ||
    !isValidRevision(data.current_revision) ||
    typeof data.current_share_location !== 'boolean'
  ) {
    throw new Error('LOCATION_CONSENT_SERVER_RESPONSE_INVALID');
  }
  if (data.applied && data.code === 'applied') {
    return { outcome: 'applied', currentShareLocation: data.current_share_location };
  }
  if (!data.applied && data.code === 'stale_grant' && pending.shareLocation) {
    // Terminal fail-closed outcome. The exact old grant is neutralized below;
    // it is never rebound to the newer revision or retried as fresh consent.
    return { outcome: 'stale_grant', currentShareLocation: data.current_share_location };
  }
  throw new Error('LOCATION_CONSENT_SERVER_RESPONSE_INVALID');
}

/**
 * Durably stage a consent decision before a server write, so it can be replayed
 * after an offline/degraded attempt or on the next boot. Never throws.
 *
 * Returns `true` when the decision is durable and `false` when local storage
 * failed. On `false`, callers must not advance the consent gate because no
 * server retry is allowed to begin before the local fail-closed record exists.
 */
export async function enqueuePendingLocationConsent(
  userId: string,
  shareLocation: boolean,
  purpose: string,
  consentedAt: string,
  observedRevision: number | null = null,
): Promise<boolean> {
  const result = await enqueuePendingLocationConsentWithId(
    userId,
    shareLocation,
    purpose,
    consentedAt,
    observedRevision,
  );
  return result.queued;
}

async function enqueuePendingLocationConsentWithId(
  userId: string,
  shareLocation: boolean,
  purpose: string,
  consentedAt: string,
  observedRevision: number | null,
): Promise<LocationConsentEnqueueResult> {
  if (
    !isValidAuthUserId(userId) ||
    purpose !== LOCATION_CONSENT_PURPOSE ||
    !Number.isFinite(Date.parse(consentedAt)) ||
    (observedRevision !== null && !isValidRevision(observedRevision)) ||
    (shareLocation && !isValidRevision(observedRevision))
  ) {
    return { queued: false, decisionId: null };
  }
  try {
    return await withPendingConsentLock(async () => {
      await migrateLegacyPendingConsent();
      const existing = await readPendingConsentsForUserUnlocked(userId);
      if (shareLocation && existing.some((decision) => !decision.shareLocation)) {
        // An unsynchronized withdrawal is stronger than a later grant. The
        // caller must first sync it and perform a fresh server revision read.
        throw new Error('LOCATION_CONSENT_PENDING_WITHDRAWAL');
      }
      const duplicate = existing.find(
        (decision) =>
          decision.shareLocation === shareLocation &&
          decision.purpose === purpose &&
          decision.consentedAt === consentedAt &&
          decision.observedRevision === observedRevision,
      );
      if (duplicate) return { queued: true, decisionId: duplicate.decisionId };
      if (
        shareLocation &&
        existing.filter((decision) => decision.shareLocation).length >=
          MAX_PENDING_LOCATION_GRANTS_PER_USER
      ) {
        // Grants may be refused fail-closed under local abuse; withdrawals are
        // never refused or rate-limited.
        throw new Error('LOCATION_CONSENT_PENDING_GRANT_LIMIT');
      }
      const decisionId = Crypto.randomUUID().toLowerCase();
      if (!isValidAuthUserId(decisionId)) throw new Error('LOCATION_CONSENT_DECISION_ID_INVALID');
      const payload: PendingLocationConsent = {
        version: 2,
        userId: userId.toLowerCase(),
        decisionId,
        shareLocation,
        purpose,
        consentedAt,
        observedRevision,
      };
      // The serialization order is authoritative for live user choices. Device
      // wall clocks can move backward, so timestamps are audit data only and
      // must never let an older queued grant defeat a later withdrawal.
      await AsyncStorage.setItem(
        pendingLocationConsentDecisionStorageKey(userId, decisionId),
        JSON.stringify(payload),
      );

      if (!shareLocation) {
        // Once a withdrawal is durable, pending grants are no longer needed.
        // Removing only grant keys is fail-closed even if another tab is in the
        // middle of its RPC; the immutable withdrawal key remains replayable.
        const afterWithdrawal = await readPendingConsentsForUserUnlocked(userId);
        const grantKeys = afterWithdrawal
          .filter((decision) => decision.shareLocation)
          .map((decision) =>
            pendingLocationConsentDecisionStorageKey(decision.userId, decision.decisionId),
          );
        if (grantKeys.length > 0) await AsyncStorage.multiRemove(grantKeys);
      }
      return { queued: true, decisionId };
    });
  } catch {
    if (__DEV__) console.warn('[userPreferences] failed to queue pending consent');
    // Emit telemetry so the local durability failure is observable. No PII in
    // the event — never attach coordinates, purpose, or userId here.
    trackEvent('consent_queue_write_failed');
    return { queued: false, decisionId: null };
  }
}

/**
 * Replay a queued (offline) consent decision. Call once a session is available
 * on boot. Idempotent and best-effort: on success the queue is cleared; on a
 * still-failing network the record is KEPT for the next boot so the LGPD proof
 * is never dropped. A record belonging to a different user (account switch) is
 * left untouched — it replays only when that user next boots. Never throws /
 * never blocks.
 */
async function flushPendingLocationConsentWithOutcome(
  currentUserId: string,
  targetDecisionId?: string,
): Promise<LocationConsentFlushResult> {
  if (!isValidAuthUserId(currentUserId)) {
    return { status: 'failed', currentShareLocation: null };
  }
  try {
    return await withPendingConsentServerLock(currentUserId, async () => {
      let targetOutcome: LocationConsentServerOutcome | null = null;
      let currentShareLocation: boolean | null = null;
      // One worker owns all remote writes for this user. Local enqueue remains
      // separately serialized and never waits on network, so a withdrawal is
      // immediate while old writes finish strictly before newer writes.
      while (true) {
        const pending = await withPendingConsentLock(async () => {
          await migrateLegacyPendingConsent();
          const decisions = await readPendingConsentsForUserUnlocked(currentUserId);
          return decisions[0] ?? null;
        });
        if (!pending) {
          return {
            status: targetOutcome === 'stale_grant' ? 'stale_grant' : 'synced',
            currentShareLocation,
          };
        }

        const serverResult = await writeLocationConsentToServer(pending);
        if (pending.decisionId === targetDecisionId) targetOutcome = serverResult.outcome;
        currentShareLocation = serverResult.currentShareLocation;

        await withPendingConsentLock(async () => {
          // Immutable per-decision keys make this removal cross-tab safe. A
          // newly queued withdrawal has a different key and cannot be deleted
          // between a compare/read and this confirmed removal.
          await AsyncStorage.removeItem(
            pendingLocationConsentDecisionStorageKey(pending.userId, pending.decisionId),
          );
        });
      }
    });
  } catch {
    // Still offline / server down — keep the record for the next boot.
    if (__DEV__) console.warn('[userPreferences] pending consent replay failed');
    return { status: 'failed', currentShareLocation: null };
  }
}

export async function flushPendingLocationConsent(currentUserId: string): Promise<boolean> {
  const result = await flushPendingLocationConsentWithOutcome(currentUserId);
  // A stale grant is terminal and has been safely neutralized. Boot/background
  // replay is complete even though a synchronous grant caller must surface it.
  return result.status !== 'failed';
}

/**
 * Reconcile marker-free local ownership without transferring consent between
 * accounts. Only the exact current UUID slot may survive; all foreign,
 * non-canonical, malformed or unsafe legacy grant entries are removed.
 */
export async function preparePendingLocationConsentOwnerClaim(
  currentUserId: string,
): Promise<void> {
  if (!isValidAuthUserId(currentUserId)) throw new Error('LOCATION_CONSENT_INVALID_USER');
  const currentOwner = currentUserId.toLowerCase();
  await withPendingConsentLock(async () => {
    await migrateLegacyPendingConsent();
    const keys = await AsyncStorage.getAllKeys();
    const keysToRemove: string[] = [];

    for (const key of keys) {
      if (!key.startsWith(PENDING_LOCATION_CONSENT_PREFIX)) continue;
      const parsedKey = parsePendingStorageKey(key);
      if (!parsedKey || parsedKey.owner !== currentOwner || parsedKey.decisionId === null) {
        keysToRemove.push(key);
        continue;
      }

      const raw = await AsyncStorage.getItem(key);
      if (raw === null) continue;
      const pending = parsePendingConsent(raw, {
        allowLegacy: false,
        expectedUserId: currentOwner,
      });
      if (!pending || pending.decisionId !== parsedKey.decisionId) {
        keysToRemove.push(key);
        continue;
      }
      const canonical = JSON.stringify(pending);
      if (canonical !== raw) await AsyncStorage.setItem(key, canonical);
    }

    if (keysToRemove.length > 0) await AsyncStorage.multiRemove(keysToRemove);
  });
}

/** Remove only the current user's queued consent proof during local erasure. */
export async function clearPendingLocationConsent(currentUserId: string): Promise<void> {
  if (!isValidAuthUserId(currentUserId)) return;
  await withPendingConsentLock(async () => {
    await migrateLegacyPendingConsent();
    const owner = currentUserId.toLowerCase();
    const keys = await AsyncStorage.getAllKeys();
    const currentKeys = keys.filter((key) => parsePendingStorageKey(key)?.owner === owner);
    if (currentKeys.length > 0) await AsyncStorage.multiRemove(currentKeys);
  });
}

export const PENDING_LOCATION_CONSENT_STORAGE_KEY = LEGACY_PENDING_LOCATION_CONSENT_KEY;
export const PENDING_LOCATION_CONSENT_STORAGE_PREFIX = PENDING_LOCATION_CONSENT_PREFIX;
