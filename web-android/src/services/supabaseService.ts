import { Config } from '../utils/config';
import {
  AuthResponse,
  SupabaseUser,
  DiagnosisResult,
  UserProfile,
} from '../types';

// ─── Error class ─────────────────────────────────────────────────────────────

export class APIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'APIError';
  }

  static invalidURL = new APIError('URL inválida');
  static networkError = new APIError('Erro de conexão. Verifique sua internet.');
  static authFailed = new APIError('Falha na autenticação');
  static decodingError = new APIError('Erro ao processar resposta');
  static subscriptionRequired = new APIError('Assinatura necessária para usar o diagnóstico por IA.');
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function parseAuthError(data: any): APIError {
  if (data && typeof data === 'object') {
    const msg =
      data.error_description ?? data.msg ?? data.error ?? data.message;
    if (typeof msg === 'string') {
      return new APIError(msg);
    }
  }
  return new APIError('Falha na autenticação');
}

async function makeRequest(
  path: string,
  options: {
    method?: string;
    body?: any;
    token?: string;
    additionalHeaders?: Record<string, string>;
    timeoutMs?: number;
  } = {},
): Promise<Response> {
  const {
    method = 'GET',
    body,
    token,
    additionalHeaders = {},
    timeoutMs,
  } = options;

  const url = `${Config.supabaseURL}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: Config.supabaseAnonKey,
    Authorization: token
      ? `Bearer ${token}`
      : `Bearer ${Config.supabaseAnonKey}`,
    ...additionalHeaders,
  };

  const fetchOptions: RequestInit = { method, headers };
  if (body !== undefined) {
    fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  if (timeoutMs) {
    const controller = new AbortController();
    fetchOptions.signal = controller.signal;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, fetchOptions);
      clearTimeout(timer);
      return res;
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new APIError(
          'Tempo esgotado. A análise demorou demais. Tente com uma imagem menor.',
        );
      }
      throw new APIError('Erro de conexão. Verifique sua internet.');
    }
  }

  return fetch(url, fetchOptions);
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const SupabaseService = {
  // ── Auth ──────────────────────────────────────────────────────────────────

  async signUp(
    email: string,
    password: string,
    fullName: string,
  ): Promise<AuthResponse> {
    const res = await makeRequest('/auth/v1/signup', {
      method: 'POST',
      body: { email, password, data: { full_name: fullName } },
    });
    const data = await res.json();
    if (!res.ok) throw parseAuthError(data);
    return data as AuthResponse;
  },

  async signIn(email: string, password: string): Promise<AuthResponse> {
    const res = await makeRequest('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: { email, password },
    });
    const data = await res.json();
    if (!res.ok) throw parseAuthError(data);
    return data as AuthResponse;
  },

  async resetPassword(email: string): Promise<void> {
    const res = await makeRequest('/auth/v1/recover', {
      method: 'POST',
      body: { email },
    });
    if (!res.ok) {
      const data = await res.json();
      throw parseAuthError(data);
    }
  },

  async signOut(token: string): Promise<void> {
    await makeRequest('/auth/v1/logout', {
      method: 'POST',
      token,
    });
  },

  async refreshToken(refreshToken: string): Promise<AuthResponse> {
    const res = await makeRequest('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: refreshToken },
    });
    const data = await res.json();
    if (!res.ok) throw parseAuthError(data);
    return data as AuthResponse;
  },

  async getUser(token: string): Promise<SupabaseUser> {
    const res = await makeRequest('/auth/v1/user', { token });
    const data = await res.json();
    if (!res.ok) throw parseAuthError(data);
    return data as SupabaseUser;
  },

  // ── Data ──────────────────────────────────────────────────────────────────

  async fetchDiagnoses(
    token: string,
    userId: string,
    limit: number = 200,
  ): Promise<DiagnosisResult[]> {
    const res = await makeRequest(
      `/rest/v1/pragas_diagnoses?user_id=eq.${userId}&order=created_at.desc&limit=${limit}`,
      {
        token,
        additionalHeaders: { Prefer: 'return=representation' },
      },
    );
    if (!res.ok) throw new APIError('Erro de conexão. Verifique sua internet.');
    return (await res.json()) as DiagnosisResult[];
  },

  async countDiagnoses(token: string, userId: string): Promise<number> {
    const res = await makeRequest(
      `/rest/v1/pragas_diagnoses?user_id=eq.${userId}&select=id`,
      {
        token,
        additionalHeaders: {
          Prefer: 'count=exact',
          'Range-Unit': 'items',
          Range: '0-0',
        },
      },
    );
    if (!res.ok) throw new APIError('Erro de conexão. Verifique sua internet.');
    const rangeHeader = res.headers.get('content-range');
    if (rangeHeader) {
      const parts = rangeHeader.split('/');
      const total = parts[parts.length - 1];
      const count = parseInt(total, 10);
      if (!isNaN(count)) return count;
    }
    return 0;
  },

  async saveDiagnosis(
    token: string,
    diagnosis: Record<string, any>,
  ): Promise<DiagnosisResult> {
    const res = await makeRequest('/rest/v1/pragas_diagnoses', {
      method: 'POST',
      body: diagnosis,
      token,
      additionalHeaders: { Prefer: 'return=representation' },
    });
    if (!res.ok) throw new APIError('Erro ao salvar diagnóstico.');
    const rows = await res.json();
    return (Array.isArray(rows) ? rows[0] : rows) as DiagnosisResult;
  },

  async deleteDiagnosis(token: string, id: string): Promise<void> {
    const res = await makeRequest(`/rest/v1/pragas_diagnoses?id=eq.${id}`, {
      method: 'DELETE',
      token,
    });
    if (!res.ok) throw new APIError('Erro de conexão. Verifique sua internet.');
  },

  async updateProfile(
    token: string,
    userId: string,
    profile: Record<string, any>,
  ): Promise<void> {
    // Use upsert so new users get a profile row created automatically
    const res = await makeRequest('/rest/v1/pragas_profiles', {
      method: 'POST',
      body: { id: userId, ...profile },
      token,
      additionalHeaders: {
        Prefer: 'return=representation,resolution=merge-duplicates',
      },
    });
    if (!res.ok) throw new APIError('Erro de conexão. Verifique sua internet.');
  },

  async fetchProfile(
    token: string,
    userId: string,
  ): Promise<UserProfile | null> {
    const res = await makeRequest(
      `/rest/v1/pragas_profiles?id=eq.${userId}&limit=1`,
      { token },
    );
    if (!res.ok) throw new APIError('Erro de conexão. Verifique sua internet.');
    const profiles = (await res.json()) as UserProfile[];
    return profiles.length > 0 ? profiles[0] : null;
  },

  // ── Edge Functions ────────────────────────────────────────────────────────

  async callEdgeFunction(
    name: string,
    body: any | null,
    token: string,
  ): Promise<any> {
    const url = `${Config.supabaseURL}/functions/v1/${name}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 180_000);

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: Config.supabaseAnonKey,
          Authorization: `Bearer ${token}`,
        },
        body: body != null ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timer);
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new APIError(
          'Tempo esgotado. A análise demorou demais. Tente com uma imagem menor.',
        );
      }
      throw new APIError('Erro de conexão. Verifique sua internet.');
    }

    const data = await res.json().catch(() => null);

    console.log(
      `[EdgeFunction] ${name} -> HTTP ${res.status}, ${JSON.stringify(data)?.length ?? 0} bytes`,
    );

    if (res.ok) return data;

    const rawBody = JSON.stringify(data) ?? '(empty)';
    console.log(`[EdgeFunction] Error body: ${rawBody.substring(0, 1000)}`);

    if (data && typeof data === 'object') {
      if (typeof data.error === 'string') throw new APIError(data.error);
      if (typeof data.message === 'string') throw new APIError(data.message);
      if (typeof data.msg === 'string') throw new APIError(data.msg);
    }

    if (res.status === 404) {
      throw new APIError(
        `Função '${name}' não encontrada no servidor. Verifique se a Edge Function está publicada.`,
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new APIError('Sessão expirada. Faça login novamente.');
    }
    if (res.status === 500) {
      throw new APIError(
        'Erro interno do servidor. Tente novamente em alguns instantes.',
      );
    }
    throw new APIError(`Erro do servidor (HTTP ${res.status})`);
  },
};
