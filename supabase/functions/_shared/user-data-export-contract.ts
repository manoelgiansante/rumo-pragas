export const PRAGAS_USER_DATA_EXPORT_SCHEMA_VERSION = 2 as const;

export const PRAGAS_USER_DATA_EXPORT_MAX_ROWS_PER_DATASET = 10_000 as const;
export const PRAGAS_USER_DATA_EXPORT_MAX_TOTAL_ROWS = 25_000 as const;
export const PRAGAS_USER_DATA_EXPORT_MAX_RESPONSE_BYTES = 20 * 1024 * 1024;

export const PRAGAS_LOCATION_PREFERENCES_EXPORT_COLUMNS = [
  "user_id",
  "share_location",
  "share_location_purpose",
  "consented_at",
  "location_consent_revision",
  "updated_at",
] as const;

export const PRAGAS_LOCATION_CONSENT_DECISIONS_EXPORT_COLUMNS = [
  "user_id",
  "decision_id",
  "observed_revision",
  "applied_revision",
  "share_location",
  "purpose",
  "consented_at",
  "outcome",
  "resulting_share_location",
  "created_at",
] as const;

/**
 * The server retains the latest bounded audit window while the preferences row
 * remains the authoritative current state. Revocations are never rate-limited.
 */
export const PRAGAS_LOCATION_CONSENT_DECISION_RETENTION_ROWS = 256 as const;

export const PRAGAS_USER_DATA_EXPORT_PAGINATION =
  "immutable-keyset+notification-locked-snapshot" as const;
export const PRAGAS_USER_DATA_EXPORT_MEMBERSHIP_CUTOFF =
  "created/accepted/started timestamp <= snapshotAt; chatUsage year_month <= UTC snapshot month" as const;

export interface PragasUserDataExportManifest {
  complete: true;
  truncated: false;
  totalRows: number;
  totalBytes: number;
  consistency: {
    snapshotAt: string;
    pagination: typeof PRAGAS_USER_DATA_EXPORT_PAGINATION;
    membershipCutoff: typeof PRAGAS_USER_DATA_EXPORT_MEMBERSHIP_CUTOFF;
    accountStateRevalidated: true;
  };
}

export function isCompletePragasExportManifest(
  value: unknown,
): value is PragasUserDataExportManifest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const manifest = value as Record<string, unknown>;
  const consistency = manifest.consistency as Record<string, unknown> | null;
  return manifest.complete === true &&
    manifest.truncated === false &&
    typeof manifest.totalRows === "number" &&
    Number.isSafeInteger(manifest.totalRows) &&
    manifest.totalRows >= 0 &&
    manifest.totalRows <= PRAGAS_USER_DATA_EXPORT_MAX_TOTAL_ROWS &&
    typeof manifest.totalBytes === "number" &&
    Number.isSafeInteger(manifest.totalBytes) &&
    manifest.totalBytes >= 0 &&
    manifest.totalBytes <= PRAGAS_USER_DATA_EXPORT_MAX_RESPONSE_BYTES &&
    typeof consistency === "object" &&
    consistency !== null &&
    !Array.isArray(consistency) &&
    typeof consistency.snapshotAt === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(consistency.snapshotAt) &&
    Number.isFinite(Date.parse(consistency.snapshotAt)) &&
    consistency.pagination === PRAGAS_USER_DATA_EXPORT_PAGINATION &&
    consistency.membershipCutoff === PRAGAS_USER_DATA_EXPORT_MEMBERSHIP_CUTOFF &&
    consistency.accountStateRevalidated === true;
}
