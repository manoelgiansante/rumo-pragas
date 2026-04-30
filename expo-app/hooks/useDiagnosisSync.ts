import { useEffect, useRef, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
// iOS 26 TurboModule crash defense — see services/sentry-shim.ts
import { captureException } from '../services/sentry-shim';
import { useNetworkStatus } from './useNetworkStatus';
import { useAuthContext } from '../contexts/AuthContext';
import { sendDiagnosis } from '../services/diagnosis';
import {
  getQueue,
  removeFromQueue,
  incrementRetry,
  getQueueCount,
  readQueuedImageBase64,
  PendingDiagnosis,
} from '../services/diagnosisQueue';

const MAX_RETRIES = 3;
const DLQ_KEY = '@rumo_pragas_diagnosis_dlq';
const DLQ_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface DLQEntry extends PendingDiagnosis {
  movedToDLQAt: string;
  lastError?: string;
}

/**
 * Exponential backoff with jitter.
 * Formula: min(1000 * 2^(retryCount-1), 16000) + random(0, 1000)
 */
export function calculateBackoff(retryCount: number): number {
  const base = Math.min(1000 * Math.pow(2, Math.max(0, retryCount - 1)), 16000);
  const jitter = Math.floor(Math.random() * 1000);
  return base + jitter;
}

/**
 * Move an item to the Dead Letter Queue (DLQ) after MAX_RETRIES exhaustion.
 * Never silently drops work — always captured for later inspection + Sentry.
 */
async function moveToDLQ(item: PendingDiagnosis, lastError?: string): Promise<void> {
  try {
    const now = Date.now();
    const raw = await AsyncStorage.getItem(DLQ_KEY);
    const existing: DLQEntry[] = raw ? (JSON.parse(raw) as DLQEntry[]) : [];

    // Prune entries older than TTL
    const pruned = existing.filter((e) => {
      const ts = Date.parse(e.movedToDLQAt);
      return Number.isFinite(ts) && now - ts < DLQ_TTL_MS;
    });

    const entry: DLQEntry = {
      ...item,
      movedToDLQAt: new Date().toISOString(),
      lastError,
    };
    pruned.push(entry);

    await AsyncStorage.setItem(DLQ_KEY, JSON.stringify(pruned));
  } catch (err) {
    if (__DEV__) console.warn('[DiagnosisSync] DLQ write failed:', err);
    // Still report to Sentry even if DLQ persistence failed
    try {
      captureException(err, {
        extra: { context: 'DLQ_write_failed', itemId: item.id },
      });
    } catch {
      // swallow — never throw from DLQ path
    }
  }
}

/**
 * Global hook that watches for network reconnection and automatically
 * syncs any pending (offline-queued) diagnoses to the server.
 *
 * Offline resilience (v1.15.0+):
 *  - Exponential backoff with jitter between per-item retries
 *  - Dead Letter Queue (DLQ) when MAX_RETRIES exceeded (never silent drop)
 *  - Sentry capture on DLQ move for post-mortem analysis
 */
export function useDiagnosisSync() {
  const { isConnected } = useNetworkStatus();
  const { session } = useAuthContext();
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = useRef(false);

  const refreshCount = useCallback(async () => {
    const count = await getQueueCount();
    setPendingCount(count);
  }, []);

  // Refresh count on mount and when connectivity changes
  useEffect(() => {
    refreshCount();
  }, [isConnected, refreshCount]);

  // Sync when device comes online
  useEffect(() => {
    if (!isConnected || !session?.access_token) return;
    if (isSyncingRef.current) return;

    const syncQueue = async () => {
      const queue = await getQueue();
      if (queue.length === 0) return;

      isSyncingRef.current = true;
      setIsSyncing(true);

      for (const item of queue) {
        try {
          // Backoff before retrying (retryCount 0 => ~1s + jitter, still yields to queue)
          if (item.retryCount > 0) {
            const backoff = calculateBackoff(item.retryCount);
            await new Promise<void>((resolve) => setTimeout(resolve, backoff));
          }

          // Read base64 from file (images stored on disk, not in AsyncStorage)
          const imageBase64 = await readQueuedImageBase64(item.imageUri);
          await sendDiagnosis(
            imageBase64,
            item.cropType,
            item.latitude,
            item.longitude,
            session.access_token,
          );
          await removeFromQueue(item.id);
          if (__DEV__) console.warn(`[DiagnosisSync] Synced pending diagnosis ${item.id}`);
        } catch (error) {
          if (__DEV__)
            console.warn(
              `[DiagnosisSync] Failed to sync ${item.id} (retry ${item.retryCount + 1}/${MAX_RETRIES}):`,
              error,
            );
          if (item.retryCount + 1 >= MAX_RETRIES) {
            if (__DEV__)
              console.warn(
                `[DiagnosisSync] Moving ${item.id} to DLQ after ${MAX_RETRIES} failed attempts`,
              );
            const errMessage = error instanceof Error ? error.message : String(error);
            await moveToDLQ(item, errMessage);
            try {
              captureException(new Error('Diagnosis sync DLQ'), {
                extra: {
                  itemId: item.id,
                  cropType: item.cropType,
                  retryCount: item.retryCount + 1,
                  lastError: errMessage,
                  createdAt: item.createdAt,
                },
              });
            } catch {
              // swallow — Sentry must never break sync loop
            }
            await removeFromQueue(item.id);
          } else {
            await incrementRetry(item.id);
          }
        }
      }

      isSyncingRef.current = false;
      setIsSyncing(false);
      await refreshCount();
    };

    syncQueue();
  }, [isConnected, session?.access_token, refreshCount]);

  return { pendingCount, isSyncing, refreshCount };
}
