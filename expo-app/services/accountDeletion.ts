const REQUIRED_RETAINED_SHARED_RECORDS = [
  'analytics_events',
  'audit_log',
  'user_preferences',
] as const;

export function isPragasDeletionComplete(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const result = data as Record<string, unknown>;
  const retained = Array.isArray(result.sharedUnscopedRecordsRetained)
    ? result.sharedUnscopedRecordsRetained
    : [];
  return (
    result.ok === true &&
    result.code === 'APP_SCOPED_DATA_DELETED_SHARED_HISTORY_RETAINED' &&
    result.appDataDeletionComplete === false &&
    result.appScopedDataDeletionComplete === true &&
    result.pushTokensRevoked === true &&
    result.globalIdentityDeleted === false &&
    REQUIRED_RETAINED_SHARED_RECORDS.every((name) => retained.includes(name))
  );
}
