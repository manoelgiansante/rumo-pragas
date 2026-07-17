import { useEffect, useRef, useState, useCallback } from 'react';
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
  moveToFailedQueue,
  subscribeDiagnosisQueue,
} from '../services/diagnosisQueue';
import { isAIConsentRequiredError } from '../services/aiConsent';

const MAX_RETRIES = 3;

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
 * Global hook that watches for network reconnection and automatically
 * syncs any pending (offline-queued) diagnoses to the server.
 *
 * Offline resilience (v1.15.0+):
 *  - Exponential backoff with jitter between per-item retries
 *  - Recoverable failed queue when MAX_RETRIES is exceeded (never silent drop)
 *  - Sentry capture on DLQ move for post-mortem analysis
 */
export function useDiagnosisSync() {
  const { isConnected } = useNetworkStatus();
  const { session, user } = useAuthContext();
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [queueRevision, setQueueRevision] = useState(0);
  const isSyncingRef = useRef(false);

  const refreshCount = useCallback(async () => {
    const count = user?.id ? await getQueueCount(user.id) : 0;
    setPendingCount(count);
  }, [user?.id]);

  // Refresh count on mount and when connectivity changes
  useEffect(() => {
    refreshCount();
  }, [isConnected, refreshCount]);

  // A retry from the recovery card must trigger sync immediately; waiting for
  // the next connectivity transition could leave the item stuck indefinitely.
  useEffect(
    () =>
      subscribeDiagnosisQueue(() => {
        setQueueRevision((revision) => revision + 1);
        refreshCount();
      }),
    [refreshCount],
  );

  // Sync when device comes online
  useEffect(() => {
    if (!isConnected || !session?.access_token || !user?.id) return;
    if (isSyncingRef.current) return;

    const syncQueue = async () => {
      const queue = await getQueue(user.id);
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
            user.id,
            item.idempotencyKey || item.id,
          );
          await removeFromQueue(item.id, {}, user.id);
          if (__DEV__) console.warn('[DiagnosisSync] Synced pending diagnosis');
        } catch (error) {
          if (__DEV__) console.warn('[DiagnosisSync] Pending diagnosis sync failed');
          // Consent revocation is not a transport failure. Keep the original
          // queued item untouched until the user explicitly grants consent.
          if (isAIConsentRequiredError(error)) {
            continue;
          }
          if (item.retryCount + 1 >= MAX_RETRIES) {
            if (__DEV__) console.warn('[DiagnosisSync] Moving diagnosis to recoverable queue');
            const errMessage = 'SYNC_UNAVAILABLE';
            try {
              // Durable ordering: persist failed metadata first, then remove
              // only the active metadata while retaining the image file.
              await moveToFailedQueue(item, errMessage);
              await removeFromQueue(item.id, { deleteImage: false }, user.id);
              captureException(new Error('Diagnosis sync failed queue'), {
                extra: {
                  context: 'diagnosis_sync_failed_queue',
                  retryCount: item.retryCount + 1,
                },
              });
            } catch {
              // Persistence failed: leave the active item and photo intact.
              captureException(new Error('Diagnosis failed queue write'), {
                extra: { context: 'failed_queue_write' },
              });
            }
          } else {
            await incrementRetry(item.id, user.id);
          }
        }
      }

      isSyncingRef.current = false;
      setIsSyncing(false);
      await refreshCount();
    };

    syncQueue().catch(() => {
      // Never let an AsyncStorage read/write rejection deadlock the sync loop
      // (isSyncingRef stuck true) or surface as an unhandled rejection (ZERO-O).
      isSyncingRef.current = false;
      setIsSyncing(false);
      try {
        captureException(new Error('Diagnosis sync unavailable'), {
          extra: { context: 'diagnosisSync_unhandled' },
        });
      } catch {
        // swallow — the sync path must never throw
      }
    });
  }, [isConnected, session?.access_token, user?.id, queueRevision, refreshCount]);

  return { pendingCount, isSyncing, refreshCount };
}
