const pendingUpdates = new Set<Promise<void>>();

/**
 * Holds app-account linking until provider-only metadata (Apple's one-time
 * full name) has been persisted in auth.users. The auth callback is deferred
 * outside auth-js's lock, so awaiting a snapshot here cannot deadlock it.
 */
export function beginAuthMetadataUpdate(): () => void {
  let release!: () => void;
  let released = false;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  pendingUpdates.add(pending);
  return () => {
    if (released) return;
    released = true;
    pendingUpdates.delete(pending);
    release();
  };
}

export async function waitForPendingAuthMetadata(): Promise<void> {
  await Promise.all([...pendingUpdates]);
}

export const __internal = {
  pendingCount: () => pendingUpdates.size,
};
