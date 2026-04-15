import * as Sentry from '@sentry/react-native';
import { router } from 'expo-router';
import { Config } from '../constants/config';
import type { DiagnosisResult } from '../types/diagnosis';
import { parseNotes } from '../types/diagnosis';
import i18n from '../i18n';
import { hasLocationConsent } from './userPreferences';

export type { DiagnosisResult };

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

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

  Sentry.addBreadcrumb({
    category: 'diagnosis',
    message: `Sending diagnosis for crop: ${cropType}`,
    level: 'info',
    data: { cropType, hasLocation: !!(safeLatitude && safeLongitude) },
  });

  // Validate image size before sending
  validateBase64ImageSize(imageBase64);

  const url = `${Config.SUPABASE_URL}/functions/v1/diagnose`;

  // Validate URL is HTTPS
  validateHttpsUrl(url);

  const response = await fetch(url, {
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
  });

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
    return match ? parseInt(match[1], 10) : 0;
  }
  return 0;
}
