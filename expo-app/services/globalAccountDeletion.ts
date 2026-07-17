import { FunctionsHttpError, type Session } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabase';

export const GLOBAL_ACCOUNT_DELETION_CONFIRMATION = 'DELETE_MY_ENTIRE_AGRORUMO_ACCOUNT';
export const GLOBAL_ACCOUNT_DELETION_CONFIRMATION_VERSION =
  'agrorumo-global-account-deletion/2026-07-16.1';

const RECEIPT_PATTERN =
  /^AGR-DEL-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface GlobalDeletionChallenge {
  kind: 'challenge';
  challengeId: string;
  challengeSecret: string;
  reauthenticateAfter: string;
  expiresAt: string;
}

export interface ExistingGlobalDeletionRequest {
  kind: 'already_requested';
  receipt: string;
  status: string;
  requestedAt: string;
  dueAt: string;
  appCleanupState: string;
  appleAuthorizationStatus: AppleAuthorizationStatus;
}

export type BeginGlobalDeletionResult = GlobalDeletionChallenge | ExistingGlobalDeletionRequest;

export interface GlobalDeletionReceipt {
  receipt: string;
  status: string;
  requestedAt: string;
  dueAt: string;
  appCleanupState: string;
  appleAuthorizationStatus: AppleAuthorizationStatus;
}

export type AppleAuthorizationStatus = 'revoked' | 'retry_pending' | 'not_required';

export interface PersistedGlobalDeletionState {
  version: 1;
  receipt: GlobalDeletionReceipt;
  idempotencyKey: string;
}

const PERSISTED_RECEIPT_KEY_PREFIX = 'rumopragas.global-deletion-receipt.v1.';
const GLOBAL_DELETION_BEGIN_TIMEOUT_MS = 20_000;
const GLOBAL_DELETION_CONFIRM_TIMEOUT_MS = 45_000;

export type GlobalAccountDeletionErrorCode =
  | 'UNAUTHENTICATED'
  | 'CHALLENGE_UNAVAILABLE'
  | 'FRESH_REAUTHENTICATION_REQUIRED'
  | 'APPLE_REAUTHENTICATION_REQUIRED'
  | 'IDEMPOTENCY_KEY_CONFLICT'
  | 'RATE_LIMITED'
  | 'REQUEST_NOT_SAVED';

export class GlobalAccountDeletionError extends Error {
  constructor(public readonly code: GlobalAccountDeletionErrorCode) {
    super(code);
    this.name = 'GlobalAccountDeletionError';
  }
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isAppleAuthorizationStatus(value: unknown): value is AppleAuthorizationStatus {
  return value === 'revoked' || value === 'retry_pending' || value === 'not_required';
}

function authorizationHeaders(session: Session): Record<string, string> {
  return { Authorization: `Bearer ${session.access_token}` };
}

function structuredErrorCode(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const code = (value as Record<string, unknown>).error;
  return typeof code === 'string' && /^[a-z0-9_]{1,100}$/.test(code) ? code : null;
}

async function functionsHttpErrorCode(error: unknown): Promise<string | null> {
  if (
    !(error instanceof FunctionsHttpError) &&
    (!error ||
      typeof error !== 'object' ||
      (error as { name?: unknown }).name !== 'FunctionsHttpError')
  ) {
    return null;
  }
  const context = (error as { context?: unknown }).context;
  if (!context || typeof context !== 'object') return null;
  const response = context as { clone?: () => unknown; json?: () => Promise<unknown> };
  try {
    const readable = typeof response.clone === 'function' ? response.clone() : response;
    if (!readable || typeof readable !== 'object') return null;
    const json = (readable as { json?: () => Promise<unknown> }).json;
    if (typeof json !== 'function') return null;
    return structuredErrorCode(await json.call(readable));
  } catch {
    return null;
  }
}

async function mappedFunctionError(
  error: unknown,
  data: unknown,
  fallback: GlobalAccountDeletionErrorCode,
): Promise<GlobalAccountDeletionError> {
  const code = structuredErrorCode(data) ?? (await functionsHttpErrorCode(error));
  switch (code) {
    case 'unauthorized':
      return new GlobalAccountDeletionError('UNAUTHENTICATED');
    case 'fresh_reauthentication_required':
      return new GlobalAccountDeletionError('FRESH_REAUTHENTICATION_REQUIRED');
    case 'apple_reauthentication_required':
      return new GlobalAccountDeletionError('APPLE_REAUTHENTICATION_REQUIRED');
    case 'idempotency_key_conflict':
      return new GlobalAccountDeletionError('IDEMPOTENCY_KEY_CONFLICT');
    case 'rate_limit_exceeded':
      return new GlobalAccountDeletionError('RATE_LIMITED');
    default:
      return new GlobalAccountDeletionError(fallback);
  }
}

export async function beginGlobalAccountDeletion(
  session: Session,
): Promise<BeginGlobalDeletionResult> {
  const { data, error } = await supabase.functions.invoke('pragas-global-account-deletion', {
    body: { action: 'begin' },
    headers: authorizationHeaders(session),
    timeout: GLOBAL_DELETION_BEGIN_TIMEOUT_MS,
  });
  if (error || !data || typeof data !== 'object') {
    throw await mappedFunctionError(error, data, 'CHALLENGE_UNAVAILABLE');
  }
  const result = data as Record<string, unknown>;
  if (
    result.ok === true &&
    result.code === 'GLOBAL_ACCOUNT_DELETION_ALREADY_REQUESTED' &&
    typeof result.receipt === 'string' &&
    RECEIPT_PATTERN.test(result.receipt) &&
    typeof result.status === 'string' &&
    isIsoDate(result.requestedAt) &&
    isIsoDate(result.dueAt) &&
    typeof result.appCleanupState === 'string' &&
    isAppleAuthorizationStatus(result.appleAuthorizationStatus) &&
    result.pragasAccessSuspended === true &&
    result.manualGlobalProcessing === true &&
    result.globalIdentityDeleted === false
  ) {
    return {
      kind: 'already_requested',
      receipt: result.receipt,
      status: result.status,
      requestedAt: result.requestedAt,
      dueAt: result.dueAt,
      appCleanupState: result.appCleanupState,
      appleAuthorizationStatus: result.appleAuthorizationStatus,
    };
  }
  if (
    result.ok !== true ||
    result.code !== 'REAUTHENTICATION_REQUIRED' ||
    !isUuid(result.challengeId) ||
    typeof result.challengeSecret !== 'string' ||
    !/^[0-9a-f]{64}$/.test(result.challengeSecret) ||
    !isIsoDate(result.reauthenticateAfter) ||
    !isIsoDate(result.expiresAt) ||
    result.confirmationVersion !== GLOBAL_ACCOUNT_DELETION_CONFIRMATION_VERSION
  ) {
    throw new GlobalAccountDeletionError('CHALLENGE_UNAVAILABLE');
  }
  return {
    kind: 'challenge',
    challengeId: result.challengeId,
    challengeSecret: result.challengeSecret,
    reauthenticateAfter: result.reauthenticateAfter,
    expiresAt: result.expiresAt,
  };
}

export async function confirmGlobalAccountDeletion(
  freshSession: Session,
  challenge: GlobalDeletionChallenge,
  idempotencyKey: string,
  appleAuthorizationCode?: string,
): Promise<GlobalDeletionReceipt> {
  if (!isUuid(idempotencyKey)) {
    throw new GlobalAccountDeletionError('REQUEST_NOT_SAVED');
  }
  if (
    appleAuthorizationCode !== undefined &&
    (appleAuthorizationCode.length < 16 ||
      appleAuthorizationCode.length > 4_096 ||
      !/^[\x21-\x7e]+$/.test(appleAuthorizationCode))
  ) {
    throw new GlobalAccountDeletionError('REQUEST_NOT_SAVED');
  }
  const { data, error } = await supabase.functions.invoke('pragas-global-account-deletion', {
    body: {
      action: 'confirm',
      challengeId: challenge.challengeId,
      challengeSecret: challenge.challengeSecret,
      confirmation: GLOBAL_ACCOUNT_DELETION_CONFIRMATION,
      confirmationVersion: GLOBAL_ACCOUNT_DELETION_CONFIRMATION_VERSION,
      ...(appleAuthorizationCode ? { appleAuthorizationCode } : {}),
    },
    headers: {
      ...authorizationHeaders(freshSession),
      'Idempotency-Key': idempotencyKey,
    },
    timeout: GLOBAL_DELETION_CONFIRM_TIMEOUT_MS,
  });
  if (error || !data || typeof data !== 'object') {
    throw await mappedFunctionError(error, data, 'REQUEST_NOT_SAVED');
  }
  return parseDeletionReceiptResponse(data);
}

function parseDeletionReceiptResponse(data: unknown): GlobalDeletionReceipt {
  const result = data as Record<string, unknown>;
  if (
    !result ||
    typeof result !== 'object' ||
    result.ok !== true ||
    !['GLOBAL_ACCOUNT_DELETION_REQUESTED', 'GLOBAL_ACCOUNT_DELETION_ALREADY_REQUESTED'].includes(
      String(result.code),
    ) ||
    typeof result.receipt !== 'string' ||
    !RECEIPT_PATTERN.test(result.receipt) ||
    typeof result.status !== 'string' ||
    !isIsoDate(result.requestedAt) ||
    !isIsoDate(result.dueAt) ||
    typeof result.appCleanupState !== 'string' ||
    result.pragasAccessSuspended !== true ||
    result.pragasPushRevoked !== true ||
    !isAppleAuthorizationStatus(result.appleAuthorizationStatus) ||
    result.manualGlobalProcessing !== true ||
    result.globalIdentityDeleted !== false
  ) {
    throw new GlobalAccountDeletionError('REQUEST_NOT_SAVED');
  }
  return {
    receipt: result.receipt,
    status: result.status,
    requestedAt: result.requestedAt,
    dueAt: result.dueAt,
    appCleanupState: result.appCleanupState,
    appleAuthorizationStatus: result.appleAuthorizationStatus,
  };
}

export async function resumeGlobalAccountDeletionAppleRevocation(
  session: Session,
  receipt: GlobalDeletionReceipt,
  idempotencyKey: string,
  appleAuthorizationCode?: string,
): Promise<GlobalDeletionReceipt> {
  if (!isUuid(idempotencyKey) || !RECEIPT_PATTERN.test(receipt.receipt)) {
    throw new GlobalAccountDeletionError('REQUEST_NOT_SAVED');
  }
  if (
    appleAuthorizationCode !== undefined &&
    (appleAuthorizationCode.length < 16 ||
      appleAuthorizationCode.length > 4_096 ||
      !/^[\x21-\x7e]+$/.test(appleAuthorizationCode))
  ) {
    throw new GlobalAccountDeletionError('REQUEST_NOT_SAVED');
  }
  const { data, error } = await supabase.functions.invoke('pragas-global-account-deletion', {
    body: {
      action: 'resume_apple_revocation',
      receipt: receipt.receipt,
      ...(appleAuthorizationCode ? { appleAuthorizationCode } : {}),
    },
    headers: {
      ...authorizationHeaders(session),
      'Idempotency-Key': idempotencyKey,
    },
    timeout: GLOBAL_DELETION_CONFIRM_TIMEOUT_MS,
  });
  if (error || !data || typeof data !== 'object') {
    throw await mappedFunctionError(error, data, 'REQUEST_NOT_SAVED');
  }
  return parseDeletionReceiptResponse(data);
}

async function persistedReceiptKey(userId: string): Promise<string> {
  if (!isUuid(userId)) throw new GlobalAccountDeletionError('REQUEST_NOT_SAVED');
  const ownerDigest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    userId.toLowerCase(),
  );
  return `${PERSISTED_RECEIPT_KEY_PREFIX}${ownerDigest}`;
}

function parsePersistedState(raw: string | null): PersistedGlobalDeletionState | null {
  if (!raw || raw.length > 8_192) return null;
  try {
    const value = JSON.parse(raw) as Partial<PersistedGlobalDeletionState>;
    const receipt = value.receipt as Partial<GlobalDeletionReceipt> | undefined;
    if (
      value.version !== 1 ||
      !isUuid(value.idempotencyKey) ||
      !receipt ||
      typeof receipt.receipt !== 'string' ||
      !RECEIPT_PATTERN.test(receipt.receipt) ||
      typeof receipt.status !== 'string' ||
      !isIsoDate(receipt.requestedAt) ||
      !isIsoDate(receipt.dueAt) ||
      typeof receipt.appCleanupState !== 'string' ||
      !isAppleAuthorizationStatus(receipt.appleAuthorizationStatus)
    ) {
      return null;
    }
    return value as PersistedGlobalDeletionState;
  } catch {
    return null;
  }
}

export async function persistGlobalDeletionState(
  userId: string,
  receipt: GlobalDeletionReceipt,
  idempotencyKey: string,
): Promise<void> {
  if (!isUuid(idempotencyKey)) throw new GlobalAccountDeletionError('REQUEST_NOT_SAVED');
  const key = await persistedReceiptKey(userId);
  const value: PersistedGlobalDeletionState = { version: 1, receipt, idempotencyKey };
  await SecureStore.setItemAsync(key, JSON.stringify(value));
}

export async function loadPersistedGlobalDeletionState(
  userId: string,
): Promise<PersistedGlobalDeletionState | null> {
  const key = await persistedReceiptKey(userId);
  const raw = await SecureStore.getItemAsync(key);
  const parsed = parsePersistedState(raw);
  if (!parsed && raw !== null) await SecureStore.deleteItemAsync(key);
  return parsed;
}

export async function clearPersistedGlobalDeletionState(userId: string): Promise<void> {
  await SecureStore.deleteItemAsync(await persistedReceiptKey(userId));
}

export function isGlobalDeletionReceipt(value: unknown): value is string {
  return typeof value === 'string' && RECEIPT_PATTERN.test(value);
}
