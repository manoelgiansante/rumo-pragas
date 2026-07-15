// iOS 26 TurboModule crash defense — see services/sentry-shim.ts
import { addBreadcrumb } from './sentry-shim';
import { Config } from '../constants/config';
import type { DiagnosisResult } from '../types/diagnosis';
import { parseNotes } from '../types/diagnosis';
import i18n from '../i18n';
import { hasLocationConsent } from './userPreferences';
import { AI_CONSENT_VERSION, assertAIConsent, revokeAIConsent } from './aiConsent';
import * as Crypto from 'expo-crypto';
import { minimizeCoordinates } from './locationPrivacy';

export type { DiagnosisResult };

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
// P0: hard timeout for diagnose edge function — reviewer on slow network must
// see a clear error within 60s, never an infinite spinner (App Store 2.1.0 rejection risk).
const DIAGNOSE_TIMEOUT_MS = 60_000;
const REST_TIMEOUT_MS = 15_000;
const MAX_DIAGNOSIS_RESPONSE_BYTES = 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_DIAGNOSIS_RESPONSE_BYTES) {
    throw new Error(i18n.t('errors.invalidServer'));
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(i18n.t('errors.invalidServer'));
  }
}

function parseDiagnosisRow(value: unknown): DiagnosisResult | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== 'string' ||
    value.id.length < 1 ||
    value.id.length > 128 ||
    typeof value.crop !== 'string' ||
    value.crop.length < 1 ||
    value.crop.length > 80 ||
    typeof value.created_at !== 'string' ||
    !Number.isFinite(Date.parse(value.created_at))
  ) {
    return null;
  }
  const optionalStrings = ['pest_id', 'pest_name', 'image_url', 'notes'] as const;
  for (const key of optionalStrings) {
    if (value[key] !== undefined && value[key] !== null && typeof value[key] !== 'string') {
      return null;
    }
  }
  if (
    value.confidence !== undefined &&
    value.confidence !== null &&
    (typeof value.confidence !== 'number' ||
      !Number.isFinite(value.confidence) ||
      value.confidence < 0 ||
      value.confidence > 1)
  ) {
    return null;
  }
  const row = value as unknown as DiagnosisResult;
  return { ...row, parsedNotes: parseNotes(row.notes) };
}

async function fetchWithTimeout(input: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(i18n.t('errors.requestTimeout'), { cause: error });
    }
    throw new Error(i18n.t('errors.networkError'), { cause: error });
  } finally {
    clearTimeout(timeout);
  }
}

function validateBase64ImageSize(base64: string): void {
  // Base64 encodes 3 bytes into 4 chars, so decoded size ~ base64.length * 3/4
  const estimatedBytes = Math.ceil((base64.length * 3) / 4);
  if (estimatedBytes > MAX_IMAGE_SIZE_BYTES) {
    const sizeMB = (estimatedBytes / (1024 * 1024)).toFixed(1);
    throw new Error(i18n.t('errors.imageTooLarge', { size: sizeMB }));
  }
}

function validateHttpsUrl(url: string): void {
  if (!url || !url.startsWith('https://')) {
    throw new Error(i18n.t('errors.invalidServer'));
  }
}

function sanitizeErrorMessage(status: number): string {
  switch (true) {
    case status === 401:
      return i18n.t('errors.sessionExpired');
    case status === 403:
      return i18n.t('errors.noPermission');
    case status === 413:
      return i18n.t('errors.imageTooLargeServer');
    case status === 428:
      return i18n.t('aiConsent.requiredError');
    case status === 429:
      return i18n.t('errors.tooManyRequests');
    case status >= 500:
      return i18n.t('errors.serverUnavailable');
    default:
      return i18n.t('errors.diagnosisError');
  }
}

export async function sendDiagnosis(
  imageBase64: string,
  cropType: string,
  latitude: number | null,
  longitude: number | null,
  token: string,
  userId?: string,
  idempotencyKey: string = Crypto.randomUUID(),
): Promise<DiagnosisResult> {
  // Defense in depth: screens show the disclosure, but no transport path may
  // send a photo unless the current disclosure version was accepted locally.
  await assertAIConsent(userId, 'diagnosis');

  // ── P0-3 (LGPD): gate lat/lng by explicit opt-in consent ──
  // Default is "no consent → no location sent". Even if the caller provides
  // coordinates, we drop them before leaving the device unless the user has
  // explicitly consented via the onboarding / settings screen.
  let safeLatitude: number | null = null;
  let safeLongitude: number | null = null;
  if (latitude !== null && longitude !== null && userId) {
    try {
      const consented = await hasLocationConsent(userId);
      if (consented) {
        const approximate = minimizeCoordinates(latitude, longitude);
        safeLatitude = approximate?.latitude ?? null;
        safeLongitude = approximate?.longitude ?? null;
      }
    } catch (e) {
      // Fail closed — any error → no location sent
      if (__DEV__) console.warn('[diagnosis] consent check failed, dropping location:', e);
    }
  }

  addBreadcrumb({
    category: 'diagnosis',
    message: 'Sending diagnosis',
    level: 'info',
  });

  // Validate image size before sending (applies to both transport paths)
  validateBase64ImageSize(imageBase64);

  return sendDiagnosisLegacy({
    imageBase64,
    cropType,
    safeLatitude,
    safeLongitude,
    token,
    ...(userId !== undefined ? { userId } : {}),
    idempotencyKey,
  });
}

async function sendDiagnosisLegacy(args: {
  imageBase64: string;
  cropType: string;
  safeLatitude: number | null;
  safeLongitude: number | null;
  token: string;
  userId?: string;
  idempotencyKey: string;
}): Promise<DiagnosisResult> {
  const { imageBase64, cropType, safeLatitude, safeLongitude, token, userId, idempotencyKey } =
    args;
  const url = `${Config.SUPABASE_URL}/functions/v1/diagnose-pragas`;

  // Validate URL is HTTPS
  validateHttpsUrl(url);

  // P0: AbortController + timeout — never let reviewer hang on slow network
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DIAGNOSE_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': idempotencyKey,
        'X-Pragas-AI-Consent-Version': AI_CONSENT_VERSION,
        'X-Pragas-AI-Consent-Purpose': 'diagnosis',
      },
      body: JSON.stringify({
        image_base64: imageBase64,
        crop_type: cropType,
        latitude: safeLatitude,
        longitude: safeLongitude,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    // AbortError → user-facing timeout message; otherwise generic network error
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(i18n.t('errors.requestTimeout'), { cause: err });
    }
    throw new Error(i18n.t('errors.networkError'), { cause: err });
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    if (response.status === 428 && userId) {
      // The server ledger is authoritative. Persist a local fail-closed
      // tombstone so a withdrawal made on another device takes effect here.
      try {
        await revokeAIConsent(userId, 'diagnosis');
      } catch {
        // Keep the sanitized 428 response. A later request will remain blocked
        // by the server even if this device's storage is temporarily unusable.
      }
    }
    // The product is free and unlimited. Never interpret a legacy 403 payload
    // as a quota/paywall response or expose backend details to the user.
    throw new Error(sanitizeErrorMessage(response.status));
  }

  const data = parseDiagnosisRow(await readBoundedJson(response));
  if (!data) throw new Error(i18n.t('errors.invalidServer'));
  return data;
}

export async function fetchDiagnoses(
  token: string,
  userId: string,
  limit: number = 50,
): Promise<DiagnosisResult[]> {
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 50);
  const params = new URLSearchParams({
    select: 'id,crop,pest_id,pest_name,confidence,notes,created_at',
    user_id: `eq.${userId}`,
    order: 'created_at.desc',
    limit: String(safeLimit),
  });
  const url = `${Config.SUPABASE_URL}/rest/v1/pragas_diagnoses?${params.toString()}`;

  const response = await fetchWithTimeout(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: Config.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(i18n.t('errors.fetchDiagnoses'));
  }

  const raw = await readBoundedJson(response);
  if (!Array.isArray(raw) || raw.length > safeLimit) {
    throw new Error(i18n.t('errors.invalidServer'));
  }
  const rows = raw.map(parseDiagnosisRow);
  if (rows.some((row) => row === null)) throw new Error(i18n.t('errors.invalidServer'));
  return rows as DiagnosisResult[];
}

export async function deleteDiagnosis(token: string, id: string): Promise<void> {
  const params = new URLSearchParams({ id: `eq.${id}` });
  const url = `${Config.SUPABASE_URL}/rest/v1/pragas_diagnoses?${params.toString()}`;

  const response = await fetchWithTimeout(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: Config.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(i18n.t('errors.deleteDiagnosis'));
  }
}

export async function fetchDiagnosisCount(token: string, userId: string): Promise<number> {
  const params = new URLSearchParams({ user_id: `eq.${userId}`, select: 'id' });
  const url = `${Config.SUPABASE_URL}/rest/v1/pragas_diagnoses?${params.toString()}`;

  const response = await fetchWithTimeout(url, {
    method: 'HEAD',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: Config.SUPABASE_ANON_KEY,
      Prefer: 'count=exact',
    },
  });

  if (!response.ok) {
    throw new Error(i18n.t('errors.fetchCount'));
  }

  const count = response.headers.get('content-range');
  if (count) {
    const match = count.match(/\/(\d+)/);
    // Capture group 1 is guaranteed present when `match` is truthy; assert for
    // noUncheckedIndexedAccess without changing runtime behavior.
    if (!match) return 0;
    const parsed = Number(match[1]);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
  }
  return 0;
}
