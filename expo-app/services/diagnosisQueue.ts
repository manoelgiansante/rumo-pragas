import AsyncStorage from '@react-native-async-storage/async-storage';
// expo-file-system SDK 55: the barrel ('expo-file-system') exports the legacy file API
// (getInfoAsync/makeDirectoryAsync/writeAsStringAsync/readAsStringAsync/deleteAsync) ONLY as
// stubs that throw at runtime, and does NOT export documentDirectory. The '/legacy' subpath keeps
// the same working API (incl. a typed documentDirectory). See react-native-knowledge memory.
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
// iOS 26 TurboModule crash defense — see services/sentry-shim.ts
import { captureException } from './sentry-shim';
import i18n from '../i18n';
import { minimizeCoordinates } from './locationPrivacy';

const documentDirectory = FileSystem.documentDirectory;
const ENCODING_BASE64 = 'base64' as const;

const QUEUE_KEY = '@rumo_pragas_diagnosis_queue';
export const FAILED_QUEUE_KEY = '@rumo_pragas_diagnosis_dlq';
export const DIAGNOSIS_QUEUE_CLEANUP_JOURNAL_KEY = '@rumo_pragas_diagnosis_cleanup_journal:v1';
export const MAX_DIAGNOSIS_QUEUE_ITEMS = 25;
const QUEUE_DIR = `${documentDirectory}diagnosis-queue/`;
const SAFE_QUEUE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

type QueueListener = () => void;
const queueListeners = new Set<QueueListener>();
let mutationTail: Promise<void> = Promise.resolve();

/** Serialize read-modify-write operations so concurrent sync/UI actions cannot overwrite each other. */
function serializeMutation<T>(
  operation: () => Promise<T>,
  options: { resumePendingCleanup?: boolean } = {},
): Promise<T> {
  const execute = async () => {
    // A stranded two-phase cleanup owns the queue until it commits. Draining
    // it before every mutation/read prevents a later operation from racing the
    // journal or reviving metadata scheduled for deletion.
    if (options.resumePendingCleanup !== false) {
      await resumePendingDiagnosisQueueCleanupUnsafe();
    }
    return operation();
  };
  const run = mutationTail.then(execute, execute);
  mutationTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function notifyQueueChanged(): void {
  queueListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // A UI listener must never make a durable queue mutation fail.
    }
  });
}

/** Subscribe to active/failed queue changes. Returns an unsubscribe function. */
export function subscribeDiagnosisQueue(listener: QueueListener): () => void {
  queueListeners.add(listener);
  return () => queueListeners.delete(listener);
}

export interface PendingDiagnosis {
  id: string;
  /** Supabase owner. Required for every new record to prevent account crossover. */
  userId: string;
  /** Stable across every retry; normally equal to the queue item's UUID. */
  idempotencyKey: string;
  /** URI to the image file stored on disk (replaces base64 in AsyncStorage) */
  imageUri: string;
  cropType: string;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  retryCount: number;
}

export interface FailedDiagnosis extends PendingDiagnosis {
  movedToFailedAt: string;
  lastError?: string | undefined;
}

export class DiagnosisQueueCapacityError extends Error {
  readonly code = 'DIAGNOSIS_QUEUE_FULL';

  constructor() {
    super(i18n.t('diagnosis.offlineQueueFull', { limit: MAX_DIAGNOSIS_QUEUE_ITEMS }));
    this.name = 'DiagnosisQueueCapacityError';
  }
}

export function isDiagnosisQueueCapacityError(
  error: unknown,
): error is DiagnosisQueueCapacityError {
  return (
    error instanceof DiagnosisQueueCapacityError ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'DIAGNOSIS_QUEUE_FULL')
  );
}

/**
 * Legacy interface kept for migration purposes only.
 * @deprecated Use PendingDiagnosis with imageUri instead.
 */
interface LegacyPendingDiagnosis {
  id: string;
  userId?: string;
  idempotencyKey?: string;
  imageBase64: string;
  cropType: string;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  retryCount: number;
}

interface LegacyFailedDiagnosis extends Partial<PendingDiagnosis> {
  movedToFailedAt?: string;
  movedToDLQAt?: string;
  lastError?: string;
}

interface QueueCleanupReference {
  id: string;
  imageUri: string;
}

interface QueueCleanupJournal {
  version: 1;
  mode: 'references' | 'all';
  cleanup: QueueCleanupReference[];
}

function isSafeQueueId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_QUEUE_ID_RE.test(value);
}

function queueImageUri(id: string): string | null {
  return isSafeQueueId(id) ? `${QUEUE_DIR}${id}.jpg` : null;
}

function canonicalQueueImageFromFileName(fileName: unknown): QueueCleanupReference | null {
  if (typeof fileName !== 'string' || !fileName.endsWith('.jpg')) return null;
  const id = fileName.slice(0, -'.jpg'.length);
  const imageUri = queueImageUri(id);
  return imageUri === `${QUEUE_DIR}${fileName}` ? { id, imageUri } : null;
}

/** Exact path equality prevents traversal, encoded traversal and prefix collisions. */
function isCanonicalQueueImageUri(imageUri: unknown, id: unknown): imageUri is string {
  if (typeof imageUri !== 'string' || !isSafeQueueId(id)) return false;
  return imageUri === queueImageUri(id);
}

function normalizePendingDiagnosis(candidate: unknown): PendingDiagnosis | null {
  if (typeof candidate !== 'object' || candidate === null) return null;
  const item = candidate as Partial<PendingDiagnosis>;
  if (
    !isSafeQueueId(item.id) ||
    typeof item.userId !== 'string' ||
    !item.userId.trim() ||
    !isCanonicalQueueImageUri(item.imageUri, item.id) ||
    typeof item.cropType !== 'string' ||
    !item.cropType.trim() ||
    typeof item.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(item.createdAt)) ||
    typeof item.retryCount !== 'number' ||
    !Number.isInteger(item.retryCount) ||
    item.retryCount < 0
  ) {
    return null;
  }
  const idempotencyKey = isSafeQueueId(item.idempotencyKey) ? item.idempotencyKey : item.id;
  return {
    id: item.id,
    userId: item.userId,
    idempotencyKey,
    imageUri: item.imageUri,
    cropType: item.cropType,
    latitude:
      typeof item.latitude === 'number' && Number.isFinite(item.latitude) ? item.latitude : null,
    longitude:
      typeof item.longitude === 'number' && Number.isFinite(item.longitude) ? item.longitude : null,
    createdAt: item.createdAt,
    retryCount: item.retryCount,
  };
}

function ownerAssignedForClaim(
  candidate: Record<string, unknown>,
  ownerDecision: { userId: string; claimOwnerlessLegacy: boolean },
): string | null {
  const existingOwner = typeof candidate.userId === 'string' ? candidate.userId.trim() : '';
  if (existingOwner) {
    return existingOwner === ownerDecision.userId ? existingOwner : null;
  }
  return ownerDecision.claimOwnerlessLegacy ? ownerDecision.userId : null;
}

function parseStoredQueue(raw: string | null, label: string): unknown[] {
  if (!raw) return [];
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error(`${label} is not an array`);
  return parsed;
}

function parseCleanupJournal(raw: string): QueueCleanupJournal {
  const parsed = JSON.parse(raw) as Partial<QueueCleanupJournal>;
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    parsed.version !== 1 ||
    (parsed.mode !== 'references' && parsed.mode !== 'all') ||
    !Array.isArray(parsed.cleanup)
  ) {
    throw new Error('Diagnosis queue cleanup journal is invalid');
  }

  const cleanup = parsed.cleanup.map((candidate) => {
    if (
      typeof candidate !== 'object' ||
      candidate === null ||
      !isSafeQueueId(candidate.id) ||
      !isCanonicalQueueImageUri(candidate.imageUri, candidate.id)
    ) {
      throw new Error('Diagnosis queue cleanup journal contains an invalid path');
    }
    return { id: candidate.id, imageUri: candidate.imageUri };
  });

  return {
    version: 1,
    mode: parsed.mode,
    cleanup: [...new Map(cleanup.map((entry) => [entry.imageUri, entry])).values()],
  };
}

async function applyCleanupJournal(journal: QueueCleanupJournal): Promise<void> {
  let nextActive: unknown[] = [];
  let nextFailed: unknown[] = [];
  if (journal.mode === 'references') {
    const [activeRaw, failedRaw] = await Promise.all([
      AsyncStorage.getItem(QUEUE_KEY),
      AsyncStorage.getItem(FAILED_QUEUE_KEY),
    ]);
    const active = parseStoredQueue(activeRaw, 'Diagnosis queue');
    const failed = parseStoredQueue(failedRaw, 'Failed diagnosis queue');
    const cleanupUris = new Set(journal.cleanup.map(({ imageUri }) => imageUri));
    const withoutCleanupReferences = (items: unknown[]) =>
      items.filter((candidate) => {
        if (typeof candidate !== 'object' || candidate === null) return true;
        const item = candidate as Record<string, unknown>;
        return !(
          isCanonicalQueueImageUri(item.imageUri, item.id) && cleanupUris.has(item.imageUri)
        );
      });
    nextActive = withoutCleanupReferences(active);
    nextFailed = withoutCleanupReferences(failed);
  }

  // The path-only journal is already durable. A partial/failed multiSet is
  // replayed against the latest queue values before any image deletion, so it
  // neither duplicates legacy base64 payloads nor overwrites later metadata.
  await AsyncStorage.multiSet([
    [QUEUE_KEY, JSON.stringify(nextActive)],
    [FAILED_QUEUE_KEY, JSON.stringify(nextFailed)],
  ]);

  if (journal.mode === 'all') {
    // QUEUE_DIR is an app-owned compile-time constant. Corrupt-owner recovery
    // must erase unknown legacy names/subdirectories too, because they can hold
    // personal photos whose owner can no longer be proven.
    await FileSystem.deleteAsync(QUEUE_DIR, { idempotent: true });
  } else {
    for (const { imageUri } of journal.cleanup) {
      const info = await FileSystem.getInfoAsync(imageUri);
      if (info.exists && info.isDirectory) {
        throw new Error('Diagnosis queue cleanup path is not a file');
      }
      if (info.exists) await FileSystem.deleteAsync(imageUri, { idempotent: true });
    }
  }

  // Removal is the commit marker. If it fails, the next attempt safely replays
  // both metadata writes and idempotent deletes before admitting an owner.
  await AsyncStorage.removeItem(DIAGNOSIS_QUEUE_CLEANUP_JOURNAL_KEY);
}

async function resumePendingDiagnosisQueueCleanupUnsafe(): Promise<void> {
  const raw = await AsyncStorage.getItem(DIAGNOSIS_QUEUE_CLEANUP_JOURNAL_KEY);
  if (!raw) return;
  await applyCleanupJournal(parseCleanupJournal(raw));
}

/** Resume a previously staged ownerless-photo cleanup after process/storage failure. */
export async function resumePendingDiagnosisQueueCleanup(): Promise<void> {
  return serializeMutation(async () => {
    await resumePendingDiagnosisQueueCleanupUnsafe();
    notifyQueueChanged();
  });
}

/**
 * Corrupt-owner recovery: erase every queue metadata record and the dedicated
 * app-owned queue directory. This bypasses a stranded reference journal only
 * to replace it with a stricter path-free `all` journal; no untrusted path is
 * ever replayed.
 */
export async function purgeAllDiagnosisQueueData(): Promise<void> {
  return serializeMutation(
    async () => {
      const journal: QueueCleanupJournal = {
        version: 1,
        mode: 'all',
        cleanup: [],
      };
      await AsyncStorage.setItem(DIAGNOSIS_QUEUE_CLEANUP_JOURNAL_KEY, JSON.stringify(journal));
      await applyCleanupJournal(journal);
      notifyQueueChanged();
    },
    { resumePendingCleanup: false },
  );
}

/**
 * Stage and execute cleanup only for canonical photos whose metadata will be
 * discarded by an owner claim. The durable journal is written before either
 * queue changes. Metadata is then replayably removed from active + DLQ before
 * files are deleted, so no store-write failure can strand metadata pointing to
 * a missing image. A retained cross-queue reference protects the shared path.
 */
async function stageDiscardedCanonicalQueueImages(ownerDecision: {
  userId: string;
  claimOwnerlessLegacy: boolean;
}): Promise<void> {
  await resumePendingDiagnosisQueueCleanupUnsafe();

  const [activeRaw, failedRaw] = await Promise.all([
    AsyncStorage.getItem(QUEUE_KEY),
    AsyncStorage.getItem(FAILED_QUEUE_KEY),
  ]);

  // Parse both stores before journaling anything. Corrupt metadata means
  // unknown ownership/reference state and blocks the claim fail-closed.
  const active = parseStoredQueue(activeRaw, 'Diagnosis queue');
  const failed = parseStoredQueue(failedRaw, 'Failed diagnosis queue');
  const retainedUris = new Set<string>();
  const discarded = new Map<string, QueueCleanupReference>();

  for (const candidate of active) {
    if (typeof candidate !== 'object' || candidate === null) continue;
    const item = candidate as Record<string, unknown>;
    const rawCanonicalUri = isCanonicalQueueImageUri(item.imageUri, item.id) ? item.imageUri : null;
    const assignedOwner = ownerAssignedForClaim(item, ownerDecision);
    let retainedUri: string | null = null;

    if (assignedOwner) {
      if (typeof item.imageBase64 === 'string' && !item.imageUri) {
        const targetUri = typeof item.id === 'string' ? queueImageUri(item.id) : null;
        const normalized = targetUri
          ? normalizePendingDiagnosis({
              ...item,
              userId: assignedOwner,
              idempotencyKey: isSafeQueueId(item.idempotencyKey) ? item.idempotencyKey : item.id,
              imageUri: targetUri,
            })
          : null;
        retainedUri = normalized?.imageUri ?? null;
      } else {
        retainedUri =
          normalizePendingDiagnosis({ ...item, userId: assignedOwner })?.imageUri ?? null;
      }
    }

    if (retainedUri) retainedUris.add(retainedUri);
    else if (rawCanonicalUri && isSafeQueueId(item.id)) {
      discarded.set(rawCanonicalUri, { id: item.id, imageUri: rawCanonicalUri });
    }
  }

  for (const candidate of failed) {
    if (typeof candidate !== 'object' || candidate === null) continue;
    const item = candidate as Record<string, unknown>;
    const rawCanonicalUri = isCanonicalQueueImageUri(item.imageUri, item.id) ? item.imageUri : null;
    const assignedOwner = ownerAssignedForClaim(item, ownerDecision);
    const movedAt =
      typeof item.movedToFailedAt === 'string' && Number.isFinite(Date.parse(item.movedToFailedAt))
        ? item.movedToFailedAt
        : typeof item.movedToDLQAt === 'string' && Number.isFinite(Date.parse(item.movedToDLQAt))
          ? item.movedToDLQAt
          : null;
    const pending = assignedOwner
      ? normalizePendingDiagnosis({
          ...item,
          userId: assignedOwner,
          idempotencyKey: isSafeQueueId(item.idempotencyKey) ? item.idempotencyKey : item.id,
        })
      : null;
    const retainedUri = pending && movedAt ? pending.imageUri : null;

    if (retainedUri) retainedUris.add(retainedUri);
    else if (rawCanonicalUri && isSafeQueueId(item.id)) {
      discarded.set(rawCanonicalUri, { id: item.id, imageUri: rawCanonicalUri });
    }
  }

  // Sweep only exact `<safe-id>.jpg` files in the queue directory. Unknown
  // names, nested paths, encoded traversal and prefix collisions are preserved.
  const queueDirInfo = await FileSystem.getInfoAsync(QUEUE_DIR);
  if (queueDirInfo.exists) {
    for (const fileName of await FileSystem.readDirectoryAsync(QUEUE_DIR)) {
      const canonical = canonicalQueueImageFromFileName(fileName);
      if (!canonical || retainedUris.has(canonical.imageUri)) continue;
      const fileInfo = await FileSystem.getInfoAsync(canonical.imageUri);
      if (fileInfo.exists && !fileInfo.isDirectory) {
        discarded.set(canonical.imageUri, canonical);
      }
    }
  }

  const cleanup = [...discarded.values()].filter(({ imageUri }) => !retainedUris.has(imageUri));
  if (cleanup.length === 0) return;

  const journal: QueueCleanupJournal = {
    version: 1,
    mode: 'references',
    cleanup,
  };

  await AsyncStorage.setItem(DIAGNOSIS_QUEUE_CLEANUP_JOURNAL_KEY, JSON.stringify(journal));
  await applyCleanupJournal(journal);
}

/** Ensure the queue directory exists */
async function ensureQueueDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(QUEUE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(QUEUE_DIR, { intermediates: true });
  }
}

/**
 * Migrate legacy base64 entries to file-based storage. Ownerless entries are
 * deliberately deferred until claimPragasLocalDataOwner has read the durable
 * device-owner marker and makes an explicit one-shot claim/discard decision.
 * This prevents a render-time queue read from racing the authenticated claim
 * and silently erasing an upgrade user's pending photos.
 */
async function migrateLegacyEntries(ownerDecision?: {
  userId: string;
  claimOwnerlessLegacy: boolean;
}): Promise<void> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return;

  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error('Diagnosis queue is not an array');
  const items = parsed as (PendingDiagnosis | LegacyPendingDiagnosis)[];

  // Without a durable-owner decision, leave the complete original payload
  // untouched. Owned records can still be returned in-memory by the strict
  // reader, while a later first-device claim retains the ownerless records.
  if (
    !ownerDecision &&
    items.some(
      (candidate) =>
        typeof candidate !== 'object' ||
        candidate === null ||
        typeof candidate.userId !== 'string' ||
        !candidate.userId.trim(),
    )
  ) {
    return;
  }

  const trustedItems: PendingDiagnosis[] = [];
  let needsSave = false;
  let queueDirReady = false;

  for (const candidate of items) {
    if (typeof candidate !== 'object' || candidate === null) {
      needsSave = true;
      continue;
    }
    const item = candidate as PendingDiagnosis & { imageBase64?: string };
    const existingOwner = typeof item.userId === 'string' ? item.userId.trim() : '';
    let assignedOwner = existingOwner;

    if (ownerDecision) {
      if (existingOwner && existingOwner !== ownerDecision.userId) {
        // A marker-free first claim may adopt only genuinely ownerless legacy
        // entries. Foreign owned metadata is discarded fail-closed.
        needsSave = true;
        continue;
      }
      if (!existingOwner) {
        if (!ownerDecision.claimOwnerlessLegacy) {
          needsSave = true;
          continue;
        }
        assignedOwner = ownerDecision.userId;
        needsSave = true;
      }
    }

    if (!assignedOwner) {
      needsSave = true;
      continue;
    }

    // Legacy entries have imageBase64 instead of imageUri. The original
    // AsyncStorage value remains untouched until every file write succeeds.
    if (item.imageBase64 && !item.imageUri) {
      const fileUri = queueImageUri(item.id);
      if (!fileUri) {
        needsSave = true;
        continue;
      }

      const trusted = normalizePendingDiagnosis({
        ...item,
        userId: assignedOwner,
        idempotencyKey: isSafeQueueId(item.idempotencyKey) ? item.idempotencyKey : item.id,
        imageUri: fileUri,
      });
      if (!trusted) {
        needsSave = true;
        continue;
      }

      if (!queueDirReady) {
        await ensureQueueDir();
        queueDirReady = true;
      }
      await FileSystem.writeAsStringAsync(fileUri, item.imageBase64, {
        encoding: ENCODING_BASE64,
      });
      trustedItems.push(trusted);
      needsSave = true;
      continue;
    }

    const trusted = normalizePendingDiagnosis({ ...item, userId: assignedOwner });
    if (!trusted) {
      needsSave = true;
      continue;
    }
    trustedItems.push(trusted);
    if (trusted.idempotencyKey !== item.idempotencyKey) needsSave = true;
  }

  if (needsSave) await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(trustedItems));
}

async function migrateLegacyFailedEntries(ownerDecision?: {
  userId: string;
  claimOwnerlessLegacy: boolean;
}): Promise<void> {
  const raw = await AsyncStorage.getItem(FAILED_QUEUE_KEY);
  if (!raw) return;

  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error('Failed diagnosis queue is not an array');
  const items = parsed as LegacyFailedDiagnosis[];

  if (
    !ownerDecision &&
    items.some(
      (candidate) =>
        typeof candidate !== 'object' ||
        candidate === null ||
        typeof candidate.userId !== 'string' ||
        !candidate.userId.trim(),
    )
  ) {
    return;
  }

  const trustedItems: FailedDiagnosis[] = [];
  let needsSave = false;

  for (const item of items) {
    if (typeof item !== 'object' || item === null) {
      needsSave = true;
      continue;
    }

    const existingOwner = typeof item.userId === 'string' ? item.userId.trim() : '';
    let assignedOwner = existingOwner;
    if (ownerDecision) {
      if (existingOwner && existingOwner !== ownerDecision.userId) {
        needsSave = true;
        continue;
      }
      if (!existingOwner) {
        if (!ownerDecision.claimOwnerlessLegacy) {
          needsSave = true;
          continue;
        }
        assignedOwner = ownerDecision.userId;
        needsSave = true;
      }
    }

    const pending = normalizePendingDiagnosis({
      ...item,
      userId: assignedOwner,
      idempotencyKey: isSafeQueueId(item.idempotencyKey) ? item.idempotencyKey : item.id,
    });
    const movedAt =
      typeof item.movedToFailedAt === 'string' && Number.isFinite(Date.parse(item.movedToFailedAt))
        ? item.movedToFailedAt
        : typeof item.movedToDLQAt === 'string' && Number.isFinite(Date.parse(item.movedToDLQAt))
          ? item.movedToDLQAt
          : null;

    if (!pending || !movedAt) {
      needsSave = true;
      continue;
    }

    trustedItems.push({
      ...pending,
      movedToFailedAt: movedAt,
      ...(typeof item.lastError === 'string' ? { lastError: item.lastError.slice(0, 64) } : {}),
    });
    if (
      pending.idempotencyKey !== item.idempotencyKey ||
      movedAt !== item.movedToFailedAt ||
      typeof item.movedToDLQAt === 'string'
    ) {
      needsSave = true;
    }
  }

  if (needsSave) await AsyncStorage.setItem(FAILED_QUEUE_KEY, JSON.stringify(trustedItems));
}

/**
 * Called only while the persisted local-owner lock is held. With no previous
 * marker, only an explicitly verified persisted cold-boot session may claim
 * valid ownerless upgrade entries exactly once. Interactive login, an existing
 * marker, or an account change discards ownerless/foreign entries fail-closed.
 */
export async function prepareDiagnosisQueueForOwnerClaim(
  userId: string,
  options: { claimOwnerlessLegacy: boolean },
): Promise<void> {
  if (!userId.trim()) throw new Error('Diagnosis queue owner claim requires a user');
  return serializeMutation(async () => {
    const ownerDecision = {
      userId,
      claimOwnerlessLegacy: options.claimOwnerlessLegacy,
    };
    await stageDiscardedCanonicalQueueImages(ownerDecision);
    await migrateLegacyEntries(ownerDecision);
    await migrateLegacyFailedEntries(ownerDecision);
    notifyQueueChanged();
  });
}

async function readActiveQueueStrict(): Promise<PendingDiagnosis[]> {
  await migrateLegacyEntries();
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error('Diagnosis queue is not an array');
  return parsed.map(normalizePendingDiagnosis).filter((item): item is PendingDiagnosis => !!item);
}

/**
 * Add a diagnosis to the offline queue.
 * Stores the base64 image as a file on disk and only keeps the URI in AsyncStorage.
 */
export async function addToQueue(
  diagnosis: Omit<
    PendingDiagnosis,
    'id' | 'idempotencyKey' | 'createdAt' | 'retryCount' | 'imageUri' | 'latitude' | 'longitude'
  > & {
    imageBase64: string;
    latitude: number | null;
    longitude: number | null;
    idempotencyKey?: string;
  },
): Promise<void> {
  return serializeMutation(async () => {
    if (!diagnosis.userId.trim()) throw new Error('Diagnosis queue requires an owner');
    // Capacity is checked across active + recoverable failed metadata before
    // creating a new photo file. Nothing is evicted automatically: the user
    // must retry or explicitly discard existing items.
    const queue = await readActiveQueueStrict();
    const failed = await readFailedQueueStrict();
    if (queue.length + failed.length >= MAX_DIAGNOSIS_QUEUE_ITEMS) {
      throw new DiagnosisQueueCapacityError();
    }

    await ensureQueueDir();

    const requestedId = diagnosis.idempotencyKey?.trim();
    const id = requestedId && isSafeQueueId(requestedId) ? requestedId : Crypto.randomUUID();
    const fileUri = queueImageUri(id);
    if (!fileUri) throw new Error('Unable to create a safe diagnosis queue identifier');
    let metadataPersisted = false;
    await FileSystem.writeAsStringAsync(fileUri, diagnosis.imageBase64, {
      encoding: ENCODING_BASE64,
    });

    try {
      // Strict read: corrupt/unavailable existing metadata must never be
      // mistaken for an empty queue and overwritten.
      const item: PendingDiagnosis = {
        id,
        userId: diagnosis.userId,
        idempotencyKey: id,
        imageUri: fileUri,
        cropType: diagnosis.cropType,
        latitude:
          diagnosis.latitude !== null && diagnosis.longitude !== null
            ? (minimizeCoordinates(diagnosis.latitude, diagnosis.longitude)?.latitude ?? null)
            : null,
        longitude:
          diagnosis.latitude !== null && diagnosis.longitude !== null
            ? (minimizeCoordinates(diagnosis.latitude, diagnosis.longitude)?.longitude ?? null)
            : null,
        createdAt: new Date().toISOString(),
        retryCount: 0,
      };
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify([...queue, item]));
      metadataPersisted = true;
      notifyQueueChanged();
    } finally {
      if (!metadataPersisted) {
        await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => undefined);
      }
    }
  });
}

export async function getQueue(userId?: string): Promise<PendingDiagnosis[]> {
  try {
    return await serializeMutation(async () => {
      const queue = await readActiveQueueStrict();
      return userId ? queue.filter((item) => item.userId === userId) : queue;
    });
  } catch {
    // Returning [] on corrupt JSON silently DROPS the offline queue (the user's
    // pending diagnoses) — instrument it so we learn when persistence corrupts
    // instead of losing data invisibly.
    if (__DEV__) console.error('[DiagnosisQueue] Queue metadata unavailable');
    captureException(new Error('Diagnosis queue metadata unavailable'), {
      tags: { feature: 'diagnosisQueue.getQueue' },
    });
    return [];
  }
}

/**
 * Read the base64 content of a queued diagnosis image from disk.
 */
export async function readQueuedImageBase64(imageUri: string): Promise<string> {
  const basename = imageUri.slice(QUEUE_DIR.length, -'.jpg'.length);
  if (!isCanonicalQueueImageUri(imageUri, basename)) {
    throw new Error('Queued diagnosis photo path is invalid');
  }
  return FileSystem.readAsStringAsync(imageUri, {
    encoding: ENCODING_BASE64,
  });
}

export async function removeFromQueue(
  id: string,
  options: { deleteImage?: boolean } = {},
  userId?: string,
): Promise<void> {
  return serializeMutation(async () => {
    const queue = await readActiveQueueStrict();
    const item = queue.find((i) => i.id === id && (!userId || i.userId === userId));
    const filtered = item ? queue.filter((i) => i !== item) : queue;

    // Persist removal first. If storage fails, the metadata and photo both
    // remain recoverable; a later file-cleanup failure only leaves an orphan.
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
    notifyQueueChanged();

    if (options.deleteImage !== false && item?.imageUri) {
      try {
        const info = await FileSystem.getInfoAsync(item.imageUri);
        if (info.exists) await FileSystem.deleteAsync(item.imageUri, { idempotent: true });
      } catch {
        // Non-critical orphan cleanup failure.
      }
    }
  });
}

/**
 * Persist an exhausted item in the failed queue before removing it from the
 * active queue. This function intentionally throws on storage failure: callers
 * must keep the original active record in that case, preserving the photo.
 */
export async function moveToFailedQueue(item: PendingDiagnosis, lastError?: string): Promise<void> {
  return serializeMutation(async () => {
    const existing = await readFailedQueueStrict();
    const entry: FailedDiagnosis = {
      ...item,
      movedToFailedAt: new Date().toISOString(),
      lastError,
    };
    const next = [...existing.filter((candidate) => candidate.id !== item.id), entry];
    await AsyncStorage.setItem(FAILED_QUEUE_KEY, JSON.stringify(next));
    notifyQueueChanged();
  });
}

async function readFailedQueueStrict(): Promise<FailedDiagnosis[]> {
  await migrateLegacyFailedEntries();
  const raw = await AsyncStorage.getItem(FAILED_QUEUE_KEY);
  if (!raw) return [];
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error('Failed diagnosis queue is not an array');
  return (parsed as FailedDiagnosis[]).flatMap((item) => {
    const pending = normalizePendingDiagnosis(item);
    if (
      !pending ||
      typeof item.movedToFailedAt !== 'string' ||
      !Number.isFinite(Date.parse(item.movedToFailedAt))
    ) {
      return [];
    }
    return [
      {
        ...pending,
        movedToFailedAt: item.movedToFailedAt,
        ...(typeof item.lastError === 'string' ? { lastError: item.lastError.slice(0, 64) } : {}),
      },
    ];
  });
}

export async function getFailedQueue(userId?: string): Promise<FailedDiagnosis[]> {
  try {
    return await serializeMutation(async () => {
      const queue = await readFailedQueueStrict();
      return userId ? queue.filter((item) => item.userId === userId) : queue;
    });
  } catch {
    if (__DEV__) console.error('[DiagnosisQueue] Failed queue metadata unavailable');
    captureException(new Error('Failed diagnosis queue metadata unavailable'), {
      tags: { feature: 'diagnosisQueue.getFailedQueue' },
    });
    return [];
  }
}

export async function getFailedQueueCount(userId?: string): Promise<number> {
  return (await getFailedQueue(userId)).length;
}

/**
 * Move an item back to the active queue without touching its photo. The active
 * write happens first, so a crash can create a harmless duplicate metadata
 * record but can never orphan/delete the user's image.
 */
export async function retryFailedDiagnosis(id: string, userId?: string): Promise<void> {
  return serializeMutation(async () => {
    const failed = await readFailedQueueStrict();
    const item = failed.find(
      (candidate) => candidate.id === id && (!userId || candidate.userId === userId),
    );
    if (!item) throw new Error('Failed diagnosis not found');

    const imageInfo = await FileSystem.getInfoAsync(item.imageUri);
    if (!imageInfo.exists) throw new Error('Queued diagnosis photo is unavailable');

    const active = await readActiveQueueStrict();
    const retryItem: PendingDiagnosis = {
      id: item.id,
      userId: item.userId,
      idempotencyKey: item.idempotencyKey || item.id,
      imageUri: item.imageUri,
      cropType: item.cropType,
      latitude: item.latitude,
      longitude: item.longitude,
      createdAt: item.createdAt,
      retryCount: 0,
    };
    if (!active.some((candidate) => candidate.id === id)) {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify([...active, retryItem]));
    }
    await AsyncStorage.setItem(
      FAILED_QUEUE_KEY,
      JSON.stringify(failed.filter((candidate) => candidate.id !== id)),
    );
    notifyQueueChanged();
  });
}

/** Permanently discard a failed item only after an explicit user action. */
export async function discardFailedDiagnosis(id: string, userId?: string): Promise<void> {
  return serializeMutation(async () => {
    const failed = await readFailedQueueStrict();
    const item = failed.find(
      (candidate) => candidate.id === id && (!userId || candidate.userId === userId),
    );
    if (!item) return;

    await AsyncStorage.setItem(
      FAILED_QUEUE_KEY,
      JSON.stringify(failed.filter((candidate) => candidate.id !== id)),
    );
    notifyQueueChanged();
    if (item.imageUri) {
      await FileSystem.deleteAsync(item.imageUri, { idempotent: true }).catch(() => {
        captureException(new Error('Queued diagnosis cleanup unavailable'), {
          tags: { feature: 'diagnosisQueue.discardCleanup' },
        });
      });
    }
  });
}

export async function getQueueCount(userId?: string): Promise<number> {
  const queue = await getQueue(userId);
  return queue.length;
}

export async function clearQueue(userId?: string): Promise<void> {
  return serializeMutation(async () => {
    const queue = await readActiveQueueStrict();
    const selected = userId ? queue.filter((item) => item.userId === userId) : queue;
    const remaining = userId ? queue.filter((item) => item.userId !== userId) : [];
    // Remove durable metadata first so a storage error cannot leave entries
    // that point to photos already deleted from disk.
    if (remaining.length > 0) await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
    else await AsyncStorage.removeItem(QUEUE_KEY);
    notifyQueueChanged();

    for (const item of selected) {
      if (item.imageUri) {
        await FileSystem.deleteAsync(item.imageUri, { idempotent: true }).catch(() => {
          if (__DEV__) console.warn('[DiagnosisQueue] File cleanup unavailable');
        });
      }
    }
  });
}

/**
 * Account-deletion purge for one user across active + recoverable failed
 * queues. Photo deletion is strict and metadata remains until every file is
 * gone, so Settings can never claim local erasure after a partial failure.
 */
export async function purgeDiagnosisQueuesForUser(userId: string): Promise<void> {
  if (!userId.trim()) throw new Error('Diagnosis queue purge requires an owner');
  return serializeMutation(async () => {
    await resumePendingDiagnosisQueueCleanupUnsafe();
    const [active, failed] = await Promise.all([readActiveQueueStrict(), readFailedQueueStrict()]);
    const owned = [
      ...active.filter((item) => item.userId === userId),
      ...failed.filter((item) => item.userId === userId),
    ];

    for (const imageUri of new Set(owned.map((item) => item.imageUri).filter(Boolean))) {
      await FileSystem.deleteAsync(imageUri, { idempotent: true });
    }

    await AsyncStorage.multiSet([
      [QUEUE_KEY, JSON.stringify(active.filter((item) => item.userId !== userId))],
      [FAILED_QUEUE_KEY, JSON.stringify(failed.filter((item) => item.userId !== userId))],
    ]);
    notifyQueueChanged();
  });
}

export async function incrementRetry(id: string, userId?: string): Promise<void> {
  return serializeMutation(async () => {
    const queue = await readActiveQueueStrict();
    const updated = queue.map((item) =>
      item.id === id && (!userId || item.userId === userId)
        ? { ...item, retryCount: item.retryCount + 1 }
        : item,
    );
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(updated));
    notifyQueueChanged();
  });
}
