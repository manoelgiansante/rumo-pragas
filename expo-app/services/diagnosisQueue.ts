import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { captureException } from './sentry-shim';

// expo-file-system SDK 55: documentDirectory exists at runtime but is not in TS type definitions.
const documentDirectory = (FileSystem as unknown as { documentDirectory: string | null })
  .documentDirectory;
const ENCODING_BASE64 = 'base64' as const;

const QUEUE_KEY = '@rumo_pragas_diagnosis_queue';
const QUEUE_DIR = `${documentDirectory}diagnosis-queue/`;

export interface PendingDiagnosis {
  id: string;
  /** URI to the image file stored on disk (replaces base64 in AsyncStorage) */
  imageUri: string;
  cropType: string;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  retryCount: number;
}

/**
 * Legacy interface kept for migration purposes only.
 * @deprecated Use PendingDiagnosis with imageUri instead.
 */
interface LegacyPendingDiagnosis {
  id: string;
  imageBase64: string;
  cropType: string;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  retryCount: number;
}

/** Ensure the queue directory exists */
async function ensureQueueDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(QUEUE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(QUEUE_DIR, { intermediates: true });
  }
}

/**
 * Migrate any legacy base64 entries to file-based storage.
 * Runs once on first getQueue() call.
 */
let migrationDone = false;
async function migrateLegacyEntries(): Promise<void> {
  if (migrationDone) return;
  migrationDone = true;

  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return;

    const items = JSON.parse(raw) as (PendingDiagnosis | LegacyPendingDiagnosis)[];
    let needsSave = false;

    await ensureQueueDir();

    for (let i = 0; i < items.length; i++) {
      const item = items[i] as PendingDiagnosis & { imageBase64?: string };
      // Legacy entries have imageBase64 instead of imageUri
      if (item.imageBase64 && !item.imageUri) {
        const fileUri = `${QUEUE_DIR}${item.id}.jpg`;
        await FileSystem.writeAsStringAsync(fileUri, item.imageBase64, {
          encoding: ENCODING_BASE64,
        });
        items[i] = {
          id: item.id,
          imageUri: fileUri,
          cropType: item.cropType,
          latitude: item.latitude,
          longitude: item.longitude,
          createdAt: item.createdAt,
          retryCount: item.retryCount,
        };
        needsSave = true;
      }
    }

    if (needsSave) {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
    }
  } catch (err) {
    if (__DEV__) console.error('[DiagnosisQueue] Migration error:', err);
    captureException(err, { tags: { feature: 'diagnosis_queue', step: 'migrate_legacy' } });
  }
}

/**
 * Add a diagnosis to the offline queue.
 * Stores the base64 image as a file on disk and only keeps the URI in AsyncStorage.
 */
export async function addToQueue(
  diagnosis: Omit<PendingDiagnosis, 'id' | 'createdAt' | 'retryCount' | 'imageUri'> & {
    imageBase64: string;
  },
): Promise<void> {
  await ensureQueueDir();

  const id = Crypto.randomUUID();
  const fileUri = `${QUEUE_DIR}${id}.jpg`;

  // Write image to file system instead of keeping base64 in AsyncStorage
  await FileSystem.writeAsStringAsync(fileUri, diagnosis.imageBase64, {
    encoding: ENCODING_BASE64,
  });

  const queue = await getQueue();
  const item: PendingDiagnosis = {
    id,
    imageUri: fileUri,
    cropType: diagnosis.cropType,
    latitude: diagnosis.latitude,
    longitude: diagnosis.longitude,
    createdAt: new Date().toISOString(),
    retryCount: 0,
  };
  queue.push(item);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function getQueue(): Promise<PendingDiagnosis[]> {
  try {
    await migrateLegacyEntries();
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PendingDiagnosis[];
  } catch (err) {
    // ZERO-O: surface the silent "return [] on read failure" — corrupt JSON
    // means previously queued offline diagnoses are lost. We need to know.
    captureException(err, { tags: { feature: 'diagnosis_queue', step: 'get_queue' } });
    return [];
  }
}

/**
 * Read the base64 content of a queued diagnosis image from disk.
 */
export async function readQueuedImageBase64(imageUri: string): Promise<string> {
  return FileSystem.readAsStringAsync(imageUri, {
    encoding: ENCODING_BASE64,
  });
}

export async function removeFromQueue(id: string): Promise<void> {
  const queue = await getQueue();
  const item = queue.find((i) => i.id === id);

  // Clean up the image file from disk
  if (item?.imageUri) {
    try {
      const info = await FileSystem.getInfoAsync(item.imageUri);
      if (info.exists) {
        await FileSystem.deleteAsync(item.imageUri, { idempotent: true });
      }
    } catch (err) {
      // Non-critical: file cleanup failed, continue — but surface as warning
      // so we can spot disk-full / sandbox issues without a P0 page.
      captureException(err, {
        tags: { feature: 'diagnosis_queue', step: 'remove_cleanup_file' },
      });
    }
  }

  const filtered = queue.filter((i) => i.id !== id);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
}

export async function getQueueCount(): Promise<number> {
  const queue = await getQueue();
  return queue.length;
}

export async function clearQueue(): Promise<void> {
  // Clean up all image files
  try {
    const queue = await getQueue();
    for (const item of queue) {
      if (item.imageUri) {
        await FileSystem.deleteAsync(item.imageUri, { idempotent: true }).catch((err) => {
          if (__DEV__) console.warn('[DiagnosisQueue] File cleanup failed:', err);
          captureException(err, {
            tags: { feature: 'diagnosis_queue', step: 'clear_cleanup_file' },
          });
        });
      }
    }
  } catch (err) {
    // Best effort cleanup
    captureException(err, { tags: { feature: 'diagnosis_queue', step: 'clear_loop' } });
  }
  await AsyncStorage.removeItem(QUEUE_KEY);
}

export async function incrementRetry(id: string): Promise<void> {
  const queue = await getQueue();
  const updated = queue.map((item) =>
    item.id === id ? { ...item, retryCount: item.retryCount + 1 } : item,
  );
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(updated));
}
