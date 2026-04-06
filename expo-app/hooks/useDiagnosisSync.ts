import { useEffect, useRef, useState, useCallback } from 'react';
import { useNetworkStatus } from './useNetworkStatus';
import { useAuthContext } from '../contexts/AuthContext';
import { sendDiagnosis } from '../services/diagnosis';
import {
  getQueue,
  removeFromQueue,
  incrementRetry,
  getQueueCount,
} from '../services/diagnosisQueue';

const MAX_RETRIES = 3;

/**
 * Global hook that watches for network reconnection and automatically
 * syncs any pending (offline-queued) diagnoses to the server.
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
          await sendDiagnosis(
            item.imageBase64,
            item.cropType,
            item.latitude,
            item.longitude,
            session.access_token,
          );
          await removeFromQueue(item.id);
          console.log(`[DiagnosisSync] Synced pending diagnosis ${item.id}`);
        } catch (error) {
          console.warn(
            `[DiagnosisSync] Failed to sync ${item.id} (retry ${item.retryCount + 1}/${MAX_RETRIES}):`,
            error,
          );
          if (item.retryCount + 1 >= MAX_RETRIES) {
            console.warn(
              `[DiagnosisSync] Removing ${item.id} after ${MAX_RETRIES} failed attempts`,
            );
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
