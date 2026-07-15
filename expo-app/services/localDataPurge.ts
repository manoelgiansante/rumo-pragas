import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { revokeAIConsent } from './aiConsent';
import { clearChatHistory, prepareChatHistoryForOwnerClaim } from './chatHistory';
import {
  prepareDiagnosisQueueForOwnerClaim,
  purgeAllDiagnosisQueueData,
  purgeDiagnosisQueuesForUser,
  resumePendingDiagnosisQueueCleanup,
} from './diagnosisQueue';
import {
  clearPendingLocationConsent,
  preparePendingLocationConsentOwnerClaim,
} from './userPreferences';

const PEST_CACHE_PREFIX = '@rumopragas/pest-cache/';
const OWNER_SCOPED_STORAGE_PREFIXES = [
  '@rumo_pragas_ai_consent:',
  '@rumo_pragas_ai_revoked:',
  '@rumo_pragas_chat_history:',
  '@rumo_pragas_location_consent_shown:',
  '@rumopragas/pending_location_consent:v2:',
] as const;
const LOCAL_DATA_OWNER_SECURE_KEY = 'rumopragas.local-data-owner.v1';
const LOCAL_DATA_OWNER_WEB_KEY = '@rumopragas/local-data-owner:v1';
const AUTH_USER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface LocalDataOwnerRecord {
  version: 1;
  userId: string;
}

let ownerOperationTail: Promise<void> = Promise.resolve();

const APP_PERSONAL_KEYS = [
  '@rumo_pragas_notification_prefs',
  '@rumo_pragas_weather_cache',
  '@rumo_pragas_push_token',
  '@rumo_pragas_push_token_last_sync',
  '@rumo_pragas_push_enabled',
  '@rumo_pragas_successful_diagnoses',
  '@rumo_pragas_review_prompted',
] as const;

function withOwnerOperationLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = ownerOperationTail.catch(() => undefined).then(operation);
  ownerOperationTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function assertAuthUserId(userId: string): void {
  if (!AUTH_USER_ID_PATTERN.test(userId)) throw new Error('LOCAL_DATA_OWNER_INVALID');
}

async function readOwnerRecord(): Promise<string | null> {
  const raw =
    Platform.OS === 'web'
      ? await AsyncStorage.getItem(LOCAL_DATA_OWNER_WEB_KEY)
      : await SecureStore.getItemAsync(LOCAL_DATA_OWNER_SECURE_KEY);
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as Partial<LocalDataOwnerRecord>;
    if (value.version !== 1 || typeof value.userId !== 'string') {
      throw new Error('invalid owner record');
    }
    assertAuthUserId(value.userId);
    return value.userId;
  } catch {
    // Unknown ownership must block account admission. Treating corruption as
    // "no owner" could expose A's cache to B after a device restart.
    throw new Error('LOCAL_DATA_OWNER_CORRUPT');
  }
}

async function writeOwnerRecord(userId: string): Promise<void> {
  const payload = JSON.stringify({ version: 1, userId } satisfies LocalDataOwnerRecord);
  if (Platform.OS === 'web') await AsyncStorage.setItem(LOCAL_DATA_OWNER_WEB_KEY, payload);
  else await SecureStore.setItemAsync(LOCAL_DATA_OWNER_SECURE_KEY, payload);
}

async function deleteOwnerRecord(): Promise<void> {
  if (Platform.OS === 'web') await AsyncStorage.removeItem(LOCAL_DATA_OWNER_WEB_KEY);
  else await SecureStore.deleteItemAsync(LOCAL_DATA_OWNER_SECURE_KEY);
}

function belongsToDifferentOrInvalidOwner(key: string, currentUserId: string): boolean {
  const prefix = OWNER_SCOPED_STORAGE_PREFIXES.find((candidate) => key.startsWith(candidate));
  if (!prefix) return false;
  const canonicalOwner = currentUserId.toLowerCase();
  if (prefix === '@rumo_pragas_ai_revoked:') {
    return (
      key !== `${prefix}${canonicalOwner}:diagnosis` && key !== `${prefix}${canonicalOwner}:chat`
    );
  }
  if (prefix === '@rumopragas/pending_location_consent:v2:') {
    const currentPrefix = `${prefix}${canonicalOwner}`;
    // The location service now stores one queue entry per decisionId. Preserve
    // this owner's legacy slot and decision slots just long enough for the
    // dedicated helper below to validate their exact IDs/payloads and purge any
    // malformed entry under its own serialization lock.
    return key !== currentPrefix && !key.startsWith(`${currentPrefix}:`);
  }
  // All other owner-scoped services read one exact lowercase UUID key. Suffix
  // variants and uppercase duplicates are unreachable stale personal data and
  // must not survive merely because their first segment resembles this owner.
  return key !== `${prefix}${canonicalOwner}`;
}

async function purgeUnscopedPersonalData(): Promise<void> {
  const allKeys = await AsyncStorage.getAllKeys();
  const dynamicKeys = allKeys.filter((key) => key.startsWith(PEST_CACHE_PREFIX));
  await AsyncStorage.multiRemove([...APP_PERSONAL_KEYS, ...dynamicKeys]);
}

async function purgeForeignOwnerScopedData(currentUserId: string): Promise<void> {
  const allKeys = await AsyncStorage.getAllKeys();
  const foreignKeys = allKeys.filter((key) => belongsToDifferentOrInvalidOwner(key, currentUserId));
  if (foreignKeys.length > 0) await AsyncStorage.multiRemove(foreignKeys);
}

async function purgeAllPragasLocalDataUnlocked(): Promise<void> {
  await purgeAllDiagnosisQueueData();
  const allKeys = await AsyncStorage.getAllKeys();
  const pragasKeys = allKeys.filter(
    (key) =>
      key !== LOCAL_DATA_OWNER_WEB_KEY &&
      (key.startsWith('@rumopragas/') || key.startsWith('@rumo_pragas_')),
  );
  await AsyncStorage.multiRemove(pragasKeys);
}

/** Internal strict purge. Callers must already hold ownerOperationTail. */
async function purgePragasLocalUserDataUnlocked(userId: string): Promise<void> {
  await resumePendingDiagnosisQueueCleanup();
  await purgeDiagnosisQueuesForUser(userId);
  await revokeAIConsent(userId);
  await clearPendingLocationConsent(userId);
  await clearChatHistory(userId);

  const allKeys = await AsyncStorage.getAllKeys();
  const ownerKeys = allKeys.filter(
    (key) =>
      key.startsWith(PEST_CACHE_PREFIX) || key === `@rumo_pragas_location_consent_shown:${userId}`,
  );
  await AsyncStorage.multiRemove([...APP_PERSONAL_KEYS, ...ownerKeys]);
}

/** Strict local half of sign-out/account deletion. Any failed operation rejects. */
export async function purgePragasLocalUserData(userId: string): Promise<void> {
  if (!userId.trim()) throw new Error('Local data purge requires a user');
  await withOwnerOperationLock(() => purgePragasLocalUserDataUnlocked(userId));
}

/**
 * Establishes the authenticated owner before any Pragas route/link can open.
 * The persisted marker survives process death. Same-owner resumes preserve the
 * offline diagnosis queue; a different owner is admitted only after A's strict
 * purge succeeds and the single owner record is replaced. Marker-free legacy
 * adoption is opt-in only for a persisted cold-boot session; the safe default
 * for interactive authentication is discard-without-transfer.
 */
export async function claimPragasLocalDataOwner(
  userId: string,
  options: { claimOwnerlessLegacy?: boolean } = {},
): Promise<void> {
  assertAuthUserId(userId);
  await withOwnerOperationLock(async () => {
    let previousOwner: string | null;
    let recoveredCorruptOwner = false;
    try {
      previousOwner = await readOwnerRecord();
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'LOCAL_DATA_OWNER_CORRUPT') throw error;
      // Corruption is never treated as marker-free legacy ownership. Strictly
      // erase every app-scoped record/photo first; only then remove the corrupt
      // marker and continue with legacy adoption disabled.
      await purgeAllPragasLocalDataUnlocked();
      await deleteOwnerRecord();
      previousOwner = null;
      recoveredCorruptOwner = true;
    }
    if (previousOwner === userId) {
      await purgeForeignOwnerScopedData(userId);
      await preparePendingLocationConsentOwnerClaim(userId);
      await prepareDiagnosisQueueForOwnerClaim(userId, { claimOwnerlessLegacy: false });
      await prepareChatHistoryForOwnerClaim(userId, { claimOwnerlessLegacy: false });
      return;
    }
    if (previousOwner) {
      await purgePragasLocalUserDataUnlocked(previousOwner);
    } else {
      await purgeUnscopedPersonalData();
    }
    // Hygiene runs for same-owner resumes, account switches and marker-free
    // claims alike. Only the authenticated UUID's scoped records survive.
    await purgeForeignOwnerScopedData(userId);
    await preparePendingLocationConsentOwnerClaim(userId);
    await prepareDiagnosisQueueForOwnerClaim(userId, {
      claimOwnerlessLegacy:
        previousOwner === null && !recoveredCorruptOwner && options.claimOwnerlessLegacy === true,
    });
    await prepareChatHistoryForOwnerClaim(userId, {
      claimOwnerlessLegacy:
        previousOwner === null && !recoveredCorruptOwner && options.claimOwnerlessLegacy === true,
    });
    // SecureStore/AsyncStorage replace one key atomically. This write happens
    // only after cleanup, so failure leaves the old/empty marker fail-closed.
    await writeOwnerRecord(userId);
  });
}

/** Clear the marker only after explicit sign-out completed for its owner. */
export async function clearPragasLocalDataOwner(expectedUserId: string): Promise<void> {
  assertAuthUserId(expectedUserId);
  await withOwnerOperationLock(async () => {
    const currentOwner = await readOwnerRecord();
    if (currentOwner === null) return;
    if (currentOwner !== expectedUserId) throw new Error('LOCAL_DATA_OWNER_MISMATCH');
    await deleteOwnerRecord();
  });
}

export const PRAGAS_LOCAL_DATA_OWNER_SECURE_KEY = LOCAL_DATA_OWNER_SECURE_KEY;
export const PRAGAS_LOCAL_DATA_OWNER_WEB_KEY = LOCAL_DATA_OWNER_WEB_KEY;
