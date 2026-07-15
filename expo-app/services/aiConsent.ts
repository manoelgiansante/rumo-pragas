import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '../i18n';
import { supabase } from './supabase';

/** Increment whenever the provider/data-use disclosure materially changes. */
export const AI_CONSENT_VERSION = '2026-07-14.1';
const AI_CONSENT_KEY_PREFIX = '@rumo_pragas_ai_consent:';
const AI_REVOKED_KEY_PREFIX = '@rumo_pragas_ai_revoked:';

export type AIConsentPurpose = 'diagnosis' | 'chat';

interface AIConsentRecord {
  version: string;
  acceptedAt: Partial<Record<AIConsentPurpose, string>>;
}

export class AIConsentRequiredError extends Error {
  readonly code = 'AI_CONSENT_REQUIRED';

  constructor() {
    super(i18n.t('aiConsent.requiredError'));
    this.name = 'AIConsentRequiredError';
  }
}

function storageKey(userId: string): string {
  return `${AI_CONSENT_KEY_PREFIX}${userId}`;
}

function revokedStorageKey(userId: string, purpose: AIConsentPurpose): string {
  return `${AI_REVOKED_KEY_PREFIX}${userId}:${purpose}`;
}

async function readRecord(userId: string): Promise<AIConsentRecord | null> {
  if (!userId.trim()) return null;
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AIConsentRecord>;
    if (parsed.version !== AI_CONSENT_VERSION || !parsed.acceptedAt) return null;
    return parsed as AIConsentRecord;
  } catch {
    // Fail closed: unreadable/corrupt consent is not consent.
    return null;
  }
}

export async function hasAIConsent(userId: string, purpose: AIConsentPurpose): Promise<boolean> {
  try {
    if ((await AsyncStorage.getItem(revokedStorageKey(userId, purpose))) === 'true') return false;
  } catch {
    return false;
  }
  const record = await readRecord(userId);
  return typeof record?.acceptedAt[purpose] === 'string';
}

export async function grantAIConsent(userId: string, purpose: AIConsentPurpose): Promise<void> {
  if (!userId.trim()) throw new AIConsentRequiredError();
  const { data, error } = await supabase.rpc('grant_pragas_ai_consent', {
    p_purpose: purpose,
    p_version: AI_CONSENT_VERSION,
  });
  if (
    error ||
    data?.granted !== true ||
    data?.purpose !== purpose ||
    data?.version !== AI_CONSENT_VERSION ||
    typeof data?.accepted_at !== 'string'
  ) {
    throw new Error('AI_CONSENT_GRANT_FAILED');
  }
  const existing = await readRecord(userId);
  const acceptedAt = existing?.acceptedAt ?? {};
  const next: AIConsentRecord = {
    version: AI_CONSENT_VERSION,
    acceptedAt: { ...acceptedAt, [purpose]: new Date().toISOString() },
  };
  // The feature remains blocked if local persistence fails; never transmit
  // when this device cannot prove the current disclosure was accepted.
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(next));
  // A prior withdrawal tombstone is cleared only after the renewed disclosure
  // has been persisted successfully.
  await AsyncStorage.removeItem(revokedStorageKey(userId, purpose));
}

export async function revokeAIConsent(userId: string, purpose?: AIConsentPurpose): Promise<void> {
  if (!purpose) {
    await Promise.all([
      AsyncStorage.removeItem(storageKey(userId)),
      AsyncStorage.removeItem(revokedStorageKey(userId, 'diagnosis')),
      AsyncStorage.removeItem(revokedStorageKey(userId, 'chat')),
    ]);
    return;
  }
  // Write a fail-closed tombstone before editing the consent record. If the
  // subsequent removal fails, transport remains blocked rather than silently
  // reactivating consent with stale local state.
  await AsyncStorage.setItem(revokedStorageKey(userId, purpose), 'true');
  const existing = await readRecord(userId);
  if (!existing) return;
  const acceptedAt = { ...existing.acceptedAt };
  delete acceptedAt[purpose];
  if (Object.keys(acceptedAt).length === 0) {
    await AsyncStorage.removeItem(storageKey(userId));
    return;
  }
  await AsyncStorage.setItem(
    storageKey(userId),
    JSON.stringify({ version: AI_CONSENT_VERSION, acceptedAt } satisfies AIConsentRecord),
  );
}

export async function revokeAIConsentEverywhere(
  userId: string,
  purpose: AIConsentPurpose,
): Promise<void> {
  if (!userId.trim()) throw new Error('AUTH_REQUIRED');
  const { data, error } = await supabase.rpc('revoke_pragas_ai_consent', {
    p_purpose: purpose,
  });
  if (error || data?.revoked !== true || data?.purpose !== purpose) {
    throw new Error('AI_CONSENT_REVOCATION_FAILED');
  }
  // Server first, then local, per the app-scoped withdrawal contract. The UI
  // announces success only after both sides complete.
  await revokeAIConsent(userId, purpose);
}

export async function assertAIConsent(
  userId: string | undefined,
  purpose: AIConsentPurpose,
): Promise<void> {
  if (!userId || !(await hasAIConsent(userId, purpose))) {
    throw new AIConsentRequiredError();
  }
}

export function isAIConsentRequiredError(error: unknown): boolean {
  return (
    error instanceof AIConsentRequiredError ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'AI_CONSENT_REQUIRED')
  );
}
