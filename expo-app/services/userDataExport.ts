import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Config } from '../constants/config';

const EXPORT_TIMEOUT_MS = 20_000;
const MAX_EXPORT_BYTES = 20 * 1024 * 1024;
const MAX_EXPORT_ROWS = 25_000;
const EXPORT_PAGINATION = 'immutable-keyset+notification-locked-snapshot';
const EXPORT_MEMBERSHIP_CUTOFF =
  'created/accepted/started timestamp <= snapshotAt; chatUsage year_month <= UTC snapshot month';

export interface PragasUserDataExportManifest {
  complete: true;
  truncated: false;
  totalRows: number;
  totalBytes: number;
  consistency: {
    snapshotAt: string;
    pagination: typeof EXPORT_PAGINATION;
    membershipCutoff: typeof EXPORT_MEMBERSHIP_CUTOFF;
    accountStateRevalidated: true;
  };
  replayed?: boolean;
  includedColumns?: Record<string, string[]>;
  excludedBinaryFields?: string[];
}

export interface PragasUserDataExport {
  schemaVersion: 2;
  app: 'rumo-pragas';
  exportedAt: string;
  manifest: PragasUserDataExportManifest;
  data: Record<string, unknown>;
  scope?: Record<string, unknown>;
  deletion?: Record<string, unknown>;
  requestId?: string;
}

export class UserDataExportError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'UserDataExportError';
  }
}

function parseExport(raw: string): PragasUserDataExport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new UserDataExportError('invalid_export');
  }
  if (!parsed || typeof parsed !== 'object') throw new UserDataExportError('invalid_export');
  const value = parsed as Record<string, unknown>;
  const manifest = value.manifest as Record<string, unknown> | null;
  const consistency = manifest?.consistency as Record<string, unknown> | null;
  if (
    value.schemaVersion !== 2 ||
    value.app !== 'rumo-pragas' ||
    typeof value.exportedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value.exportedAt) ||
    !Number.isFinite(Date.parse(value.exportedAt)) ||
    !manifest ||
    typeof manifest !== 'object' ||
    Array.isArray(manifest) ||
    manifest.complete !== true ||
    manifest.truncated !== false ||
    typeof manifest.totalRows !== 'number' ||
    !Number.isSafeInteger(manifest.totalRows) ||
    manifest.totalRows < 0 ||
    manifest.totalRows > MAX_EXPORT_ROWS ||
    typeof manifest.totalBytes !== 'number' ||
    !Number.isSafeInteger(manifest.totalBytes) ||
    manifest.totalBytes < 0 ||
    manifest.totalBytes > MAX_EXPORT_BYTES ||
    !consistency ||
    typeof consistency !== 'object' ||
    Array.isArray(consistency) ||
    consistency.snapshotAt !== value.exportedAt ||
    consistency.pagination !== EXPORT_PAGINATION ||
    consistency.membershipCutoff !== EXPORT_MEMBERSHIP_CUTOFF ||
    consistency.accountStateRevalidated !== true ||
    !value.data ||
    typeof value.data !== 'object' ||
    Array.isArray(value.data)
  ) {
    throw new UserDataExportError('invalid_export');
  }

  const data = value.data as Record<string, unknown>;
  const rows = Object.values(data).flatMap((dataset) => {
    if (!Array.isArray(dataset)) throw new UserDataExportError('invalid_export');
    return dataset;
  });
  if (
    rows.length !== manifest.totalRows ||
    rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))
  ) {
    throw new UserDataExportError('invalid_export');
  }
  const calculatedBytes = rows.reduce(
    (total, row) => total + new TextEncoder().encode(JSON.stringify(row)).byteLength,
    0,
  );
  if (calculatedBytes !== manifest.totalBytes) {
    throw new UserDataExportError('invalid_export');
  }

  if (manifest.replayed !== undefined && typeof manifest.replayed !== 'boolean') {
    throw new UserDataExportError('invalid_export');
  }
  if (manifest.includedColumns !== undefined) {
    if (
      !manifest.includedColumns ||
      typeof manifest.includedColumns !== 'object' ||
      Array.isArray(manifest.includedColumns) ||
      Object.entries(manifest.includedColumns).some(
        ([dataset, columns]) =>
          !(dataset in data) ||
          !Array.isArray(columns) ||
          columns.length === 0 ||
          columns.some(
            (column) => typeof column !== 'string' || !/^[a-z][a-z0-9_]{0,62}$/.test(column),
          ),
      )
    ) {
      throw new UserDataExportError('invalid_export');
    }
  }
  if (
    manifest.excludedBinaryFields !== undefined &&
    (!Array.isArray(manifest.excludedBinaryFields) ||
      manifest.excludedBinaryFields.some(
        (field) => typeof field !== 'string' || !/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(field),
      ))
  ) {
    throw new UserDataExportError('invalid_export');
  }
  return parsed as PragasUserDataExport;
}

export async function requestPragasUserDataExport(
  accessToken: string,
  idempotencyKey: string = Crypto.randomUUID(),
): Promise<{ document: PragasUserDataExport; json: string; filename: string }> {
  if (!accessToken.trim()) throw new UserDataExportError('unauthorized');
  const url = `${Config.SUPABASE_URL}/functions/v1/pragas-export-user-data`;
  if (!url.startsWith('https://')) throw new UserDataExportError('invalid_server');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXPORT_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: '{}',
      signal: controller.signal,
    });
  } catch (error) {
    throw new UserDataExportError(
      error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'network',
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    if (response.status === 401) throw new UserDataExportError('unauthorized');
    if (response.status === 409) throw new UserDataExportError('unavailable');
    if (response.status === 429) throw new UserDataExportError('rate_limited');
    throw new UserDataExportError('unavailable');
  }
  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_EXPORT_BYTES) throw new UserDataExportError('too_large');
  const raw = await response.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_EXPORT_BYTES) {
    throw new UserDataExportError('too_large');
  }
  const document = parseExport(raw);
  const json = JSON.stringify(document, null, 2);
  const date = document.exportedAt.slice(0, 10).replace(/[^0-9-]/g, '') || 'dados';
  return { document, json, filename: `rumo-pragas-export-${date}.json` };
}

export async function deliverPragasUserDataExport(
  json: string,
  filename: string,
  dialogTitle: string,
): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof document === 'undefined' || typeof URL === 'undefined') {
      throw new UserDataExportError('delivery_unavailable');
    }
    const blobUrl = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    try {
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      link.rel = 'noopener';
      link.click();
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
    return;
  }

  if (!FileSystem.cacheDirectory || !(await Sharing.isAvailableAsync())) {
    throw new UserDataExportError('delivery_unavailable');
  }
  const uri = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(uri, json, { encoding: 'utf8' });
  let cleanupError: unknown;
  try {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/json',
      UTI: 'public.json',
      dialogTitle,
    });
  } finally {
    try {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch (error) {
      cleanupError = error;
    }
  }
  if (cleanupError) throw new UserDataExportError('cleanup_failed');
}

export const __internal = { parseExport };
