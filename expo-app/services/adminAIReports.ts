import { Config } from '../constants/config';

export type AdminReportStatus = 'received' | 'reviewing' | 'resolved' | 'dismissed';
export type AdminReportReason =
  | 'unsafe_recommendation'
  | 'incorrect_information'
  | 'harmful_content'
  | 'privacy'
  | 'other';

export interface AdminAIReport {
  id: string;
  reporter: string;
  messageId: string;
  content: string;
  reason: AdminReportReason;
  details: string | null;
  status: AdminReportStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AdminReportsPage {
  reports: AdminAIReport[];
  pagination: { page: number; limit: number; total: number };
  requestId: string;
}

const TIMEOUT_MS = 20_000;

async function request<T>(
  token: string,
  path: string,
  init: Omit<RequestInit, 'signal'>,
): Promise<T> {
  if (!token.trim()) throw new Error('unauthorized');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(
      `${Config.SUPABASE_URL}/functions/v1/admin-ai-content-reports${path}`,
      {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: Config.SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
          ...init.headers,
        },
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      if (response.status === 401) throw new Error('unauthorized');
      if (response.status === 403) throw new Error('forbidden');
      if (response.status === 429) throw new Error('rate_limited');
      throw new Error('reports_unavailable');
    }
    const data = (await response.json().catch(() => ({}))) as T;
    return data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('reports_timeout', { cause: error });
    }
    if (
      error instanceof Error &&
      ['unauthorized', 'forbidden', 'rate_limited', 'reports_unavailable'].includes(error.message)
    ) {
      throw error;
    }
    throw new Error('reports_unavailable', { cause: error });
  } finally {
    clearTimeout(timer);
  }
}

export async function listAdminAIReports(
  token: string,
  filters: { page?: number; limit?: number; status?: AdminReportStatus } = {},
): Promise<AdminReportsPage> {
  const params: string[] = [];
  if (filters.page) params.push(`page=${filters.page}`);
  if (filters.limit) params.push(`limit=${filters.limit}`);
  if (filters.status) params.push(`status=${encodeURIComponent(filters.status)}`);
  return request<AdminReportsPage>(token, params.length ? `?${params.join('&')}` : '', {
    method: 'GET',
  });
}

export async function updateAdminAIReport(
  token: string,
  input: { id: string; status: Exclude<AdminReportStatus, 'received'>; note?: string },
  idempotencyKey: string,
): Promise<void> {
  if (!idempotencyKey.trim()) throw new Error('idempotency_required');
  const body: { id: string; status: Exclude<AdminReportStatus, 'received'>; note?: string } = {
    id: input.id,
    status: input.status,
  };
  const note = input.note?.trim();
  if (note) body.note = note;
  await request(token, '', {
    method: 'PATCH',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(body),
  });
}

export function isPragasAdmin(user: { app_metadata?: Record<string, unknown> } | null): boolean {
  return user?.app_metadata?.pragas_admin === true;
}
