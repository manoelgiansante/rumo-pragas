// iOS 26 TurboModule crash defense — see services/sentry-shim.ts
import { addBreadcrumb, captureException } from './sentry-shim';
import { router } from 'expo-router';
import { Config } from '../constants/config';
import type { DiagnosisResult, AgrioPrediction } from '../types/diagnosis';
import { parseNotes } from '../types/diagnosis';
import i18n from '../i18n';
import { hasLocationConsent } from './userPreferences';
import { getIAHubClient, isIAHubEnabled } from '../lib/ia-hub';
import type { DiagnoseResponse } from '@agrorumo/ia-hub-client';

export type { DiagnosisResult };

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
// P0: hard timeout for diagnose edge function — reviewer on slow network must
// see a clear error within 60s, never an infinite spinner (App Store 2.1.0 rejection risk).
const DIAGNOSE_TIMEOUT_MS = 60_000;

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
): Promise<DiagnosisResult> {
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
        safeLatitude = latitude;
        safeLongitude = longitude;
      }
    } catch (e) {
      // Fail closed — any error → no location sent
      if (__DEV__) console.warn('[diagnosis] consent check failed, dropping location:', e);
    }
  }

  addBreadcrumb({
    category: 'diagnosis',
    message: `Sending diagnosis for crop: ${cropType}`,
    level: 'info',
    data: {
      cropType,
      hasLocation: !!(safeLatitude && safeLongitude),
      provider: isIAHubEnabled() ? 'ia-hub' : 'supabase-edge',
    },
  });

  // Validate image size before sending (applies to both transport paths)
  validateBase64ImageSize(imageBase64);

  // ── Feature-flagged IA Hub path (IH-6) ───────────────────────────────
  // When EXPO_PUBLIC_IA_HUB_ENABLED is on and a client can be constructed,
  // route the vision request through the IA Hub. On any failure we throw
  // the same shape of error the legacy path throws so the caller (loading
  // screen) doesn't need to know which provider answered.
  if (isIAHubEnabled()) {
    const ia = getIAHubClient();
    if (ia) {
      return sendDiagnosisViaIAHub(ia, {
        imageBase64,
        cropType,
        latitude: safeLatitude,
        longitude: safeLongitude,
        userId,
      });
    }
    // Flag on but client failed to construct → fall through to legacy with
    // a Sentry breadcrumb so we notice the silent downgrade.
    addBreadcrumb({
      category: 'diagnosis',
      message: 'ia_hub_flag_on_but_client_unavailable_fallback_legacy',
      level: 'warning',
    });
  }

  return sendDiagnosisLegacy({
    imageBase64,
    cropType,
    safeLatitude,
    safeLongitude,
    token,
  });
}

async function sendDiagnosisLegacy(args: {
  imageBase64: string;
  cropType: string;
  safeLatitude: number | null;
  safeLongitude: number | null;
  token: string;
}): Promise<DiagnosisResult> {
  const { imageBase64, cropType, safeLatitude, safeLongitude, token } = args;
  const url = `${Config.SUPABASE_URL}/functions/v1/diagnose`;

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
    // Handle 403 with subscription limit details — navigate to paywall
    if (response.status === 403) {
      try {
        const errorData = await response.json();
        if (errorData?.limit !== undefined && errorData?.plan) {
          // Fire-and-forget navigation to paywall so user can upgrade immediately.
          try {
            router.push('/paywall');
          } catch (navErr) {
            if (__DEV__) console.warn('[diagnosis] paywall navigation failed:', navErr);
          }
          const planLabel = errorData.plan === 'free' ? i18n.t('errors.planFree') : errorData.plan;
          throw new Error(i18n.t('errors.planLimit', { limit: errorData.limit, plan: planLabel }));
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes(String(i18n.t('errors.planFree')))) throw e;
      }
    }
    throw new Error(sanitizeErrorMessage(response.status));
  }

  const data = await response.json();

  // Parse notes if they come as string
  if (data.notes && !data.parsedNotes) {
    data.parsedNotes = parseNotes(data.notes);
  }

  return data as DiagnosisResult;
}

/**
 * IA Hub transport for the Pragas vision diagnose flow.
 *
 * Maps the IA Hub `POST /v1/diagnose` JSON response (`{diagnosis, confidence,
 * candidates, recommendations}`) onto the legacy `DiagnosisResult` shape that
 * the UI already understands. The Supabase edge function used to do this
 * mapping server-side; here we do it client-side so the rest of the app
 * (result screen, history) sees identical data regardless of provider.
 *
 * The IA Hub call uses multipart upload (base64 → Blob) so we don't pay the
 * +33% transport overhead of sending a base64-as-JSON string.
 */
async function sendDiagnosisViaIAHub(
  ia: ReturnType<typeof getIAHubClient> & object,
  args: {
    imageBase64: string;
    cropType: string;
    latitude: number | null;
    longitude: number | null;
    userId?: string | undefined;
  },
): Promise<DiagnosisResult> {
  const { imageBase64, cropType, latitude, longitude, userId } = args;

  // Build a multipart-compatible file shape that works on both RN (FormData
  // accepts {uri,type,name} or Blob) and Hermes. We prefer Blob when the
  // runtime supports it, falling back to a data URI for older RN.
  let imageFile: { uri: string; type: string; name: string } | Blob;
  try {
    if (typeof Blob !== 'undefined' && typeof atob === 'function') {
      const binary = atob(imageBase64);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
      imageFile = new Blob([bytes], { type: 'image/jpeg' });
    } else {
      imageFile = {
        uri: `data:image/jpeg;base64,${imageBase64}`,
        type: 'image/jpeg',
        name: 'diagnosis.jpg',
      };
    }
  } catch {
    imageFile = {
      uri: `data:image/jpeg;base64,${imageBase64}`,
      type: 'image/jpeg',
      name: 'diagnosis.jpg',
    };
  }

  let response: DiagnoseResponse;
  try {
    response = await ia.diagnose({
      // The IA Hub uses `prompt` for free-text symptoms and `context` for
      // structured signals (crop, geo). Pragas only has the photo; the
      // prompt is a tiny hint the routing layer uses to pick the vision
      // backend variant.
      prompt: `Diagnose plant disease/pest in crop "${cropType}".`,
      images: [imageFile],
      context: {
        crop: cropType,
        latitude,
        longitude,
        userId,
        app: 'rumo-pragas',
      },
    });
  } catch (err) {
    captureException(err, {
      tags: { stage: 'ia_hub_diagnose', provider: 'ia-hub' },
    });
    // Re-throw with a user-friendly message; loading.tsx will route the
    // user to the error result screen the same way as the legacy path.
    if (err instanceof Error) {
      // IA Hub rate-limit (RumoIARateLimitError) maps to "too many requests";
      // auth errors → "session expired"; everything else → generic.
      const name = err.name ?? '';
      if (name.includes('RateLimit')) {
        throw new Error(i18n.t('errors.tooManyRequests'), { cause: err });
      }
      if (name.includes('Auth')) {
        throw new Error(i18n.t('errors.sessionExpired'), { cause: err });
      }
      if (name.includes('Abort') || name.includes('Network')) {
        throw new Error(i18n.t('errors.networkError'), { cause: err });
      }
      throw new Error(i18n.t('errors.diagnosisError'), { cause: err });
    }
    throw new Error(i18n.t('errors.diagnosisError'), { cause: err });
  }

  return adaptIAHubDiagnoseResponse(response, { cropType, userId, latitude, longitude });
}

/**
 * Pure adapter: IA Hub `DiagnoseResponse` → legacy `DiagnosisResult`.
 *
 * Kept exported (via `__internal`) so the unit tests can pin the shape
 * without spinning up a fake fetch.
 */
function adaptIAHubDiagnoseResponse(
  response: DiagnoseResponse,
  ctx: {
    cropType: string;
    userId?: string | undefined;
    latitude: number | null;
    longitude: number | null;
  },
): DiagnosisResult {
  const candidates = Array.isArray(response.candidates) ? response.candidates : [];
  const predictions: AgrioPrediction[] = candidates.map((c, idx) => ({
    id: c.label || `candidate_${idx}`,
    confidence: typeof c.confidence === 'number' ? c.confidence : 0,
    common_name: c.label,
  }));

  const top = predictions[0];
  const notesPayload = {
    message: response.diagnosis,
    crop: ctx.cropType,
    predictions,
    id_array: predictions,
    enrichment: {
      // Recommendations from the IA Hub map onto the chemical-treatment
      // bucket as a sensible default. When the IA Hub starts returning
      // structured enrichment we'll widen this mapping.
      chemical_treatment: response.recommendations ?? [],
    },
  };
  const notesString = JSON.stringify(notesPayload);

  const result: DiagnosisResult = {
    // The IA Hub does not yet persist the diagnosis itself — we synthesise
    // a transient id so the result screen can navigate / share. The
    // canonical persisted id will be added in IH-7 once the server-side
    // pragas_diagnoses INSERT moves to the IA Hub worker.
    id: response.requestId ?? `iahub_${Date.now()}`,
    user_id: ctx.userId ?? '',
    crop: ctx.cropType,
    pest_id: top?.id,
    pest_name: top?.common_name ?? response.diagnosis,
    confidence: typeof response.confidence === 'number' ? response.confidence : top?.confidence,
    notes: notesString,
    parsedNotes: parseNotes(notesString),
    location_lat: ctx.latitude ?? undefined,
    location_lng: ctx.longitude ?? undefined,
    created_at: new Date().toISOString(),
  };
  return result;
}

/** Test-only exports — DO NOT import from app code. */
export const __internal = { adaptIAHubDiagnoseResponse };

export async function fetchDiagnoses(
  token: string,
  userId: string,
  limit: number = 50,
): Promise<DiagnosisResult[]> {
  const url =
    `${Config.SUPABASE_URL}/rest/v1/pragas_diagnoses` +
    `?user_id=eq.${userId}&order=created_at.desc&limit=${limit}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: Config.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`${i18n.t('errors.fetchDiagnoses')}: ${response.status}`);
  }

  const rows = await response.json();
  return rows.map((row: DiagnosisResult) => ({
    ...row,
    parsedNotes: parseNotes(row.notes),
  }));
}

export async function deleteDiagnosis(token: string, id: string): Promise<void> {
  const url = `${Config.SUPABASE_URL}/rest/v1/pragas_diagnoses?id=eq.${id}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: Config.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`${i18n.t('errors.deleteDiagnosis')}: ${response.status}`);
  }
}

export async function fetchDiagnosisCount(token: string, userId: string): Promise<number> {
  const url = `${Config.SUPABASE_URL}/rest/v1/pragas_diagnoses` + `?user_id=eq.${userId}&select=id`;

  const response = await fetch(url, {
    method: 'HEAD',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: Config.SUPABASE_ANON_KEY,
      Prefer: 'count=exact',
    },
  });

  if (!response.ok) {
    throw new Error(`${i18n.t('errors.fetchCount')}: ${response.status}`);
  }

  const count = response.headers.get('content-range');
  if (count) {
    const match = count.match(/\/(\d+)/);
    // Capture group 1 is guaranteed present when `match` is truthy; assert for
    // noUncheckedIndexedAccess without changing runtime behavior.
    return match ? parseInt(match[1]!, 10) : 0;
  }
  return 0;
}
