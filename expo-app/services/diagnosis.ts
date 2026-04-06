import { Config } from '../constants/config';
import type { DiagnosisResult } from '../types/diagnosis';
import { parseNotes } from '../types/diagnosis';

export type { DiagnosisResult };

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

function validateBase64ImageSize(base64: string): void {
  // Base64 encodes 3 bytes into 4 chars, so decoded size ~ base64.length * 3/4
  const estimatedBytes = Math.ceil((base64.length * 3) / 4);
  if (estimatedBytes > MAX_IMAGE_SIZE_BYTES) {
    const sizeMB = (estimatedBytes / (1024 * 1024)).toFixed(1);
    throw new Error(
      `A imagem e muito grande (${sizeMB}MB). O tamanho maximo permitido e 5MB. Tente reduzir a resolucao da foto.`,
    );
  }
}

function validateHttpsUrl(url: string): void {
  if (!url || !url.startsWith('https://')) {
    throw new Error('Configuracao de servidor invalida. Verifique as variaveis de ambiente.');
  }
}

function sanitizeErrorMessage(status: number): string {
  switch (true) {
    case status === 401:
      return 'Sessao expirada. Faca login novamente.';
    case status === 403:
      return 'Voce nao tem permissao para esta acao. Verifique sua assinatura.';
    case status === 413:
      return 'A imagem enviada e muito grande. Tente reduzir a resolucao.';
    case status === 429:
      return 'Muitas solicitacoes. Aguarde um momento e tente novamente.';
    case status >= 500:
      return 'O servidor esta temporariamente indisponivel. Tente novamente em alguns minutos.';
    default:
      return 'Ocorreu um erro ao processar o diagnostico. Tente novamente.';
  }
}

export async function sendDiagnosis(
  imageBase64: string,
  cropType: string,
  latitude: number | null,
  longitude: number | null,
  token: string,
): Promise<DiagnosisResult> {
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
      latitude,
      longitude,
    }),
  });

  if (!response.ok) {
    // Handle 403 with subscription limit details
    if (response.status === 403) {
      try {
        const errorData = await response.json();
        if (errorData.limit !== undefined) {
          const planLabel = errorData.plan === 'free' ? 'gratuito' : errorData.plan;
          throw new Error(
            `Voce atingiu o limite de ${errorData.limit} diagnosticos do plano ${planLabel}. Faca upgrade para continuar.`,
          );
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes('limite')) throw e;
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
    throw new Error(`Falha ao buscar diagnosticos: ${response.status}`);
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
    throw new Error(`Falha ao excluir diagnostico: ${response.status}`);
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
    throw new Error(`Falha ao buscar contagem: ${response.status}`);
  }

  const count = response.headers.get('content-range');
  if (count) {
    const match = count.match(/\/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }
  return 0;
}
