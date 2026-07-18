import * as Crypto from 'expo-crypto';
import { Config } from '../constants/config';

const LINK_TIMEOUT_MS = 8_000;
const REACTIVATE_TIMEOUT_MS = 15_000;

export type PragasAccountLinkResult =
  | { linked: true; app: 'rumo-pragas'; code: 'linked' | 'already_linked' }
  | {
      linked: false;
      app: 'rumo-pragas';
      code: 'deleted_reactivation_required' | 'deletion_pending' | 'global_deletion_pending';
    };

export class PragasAccountError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'PragasAccountError';
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    throw new PragasAccountError(
      error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'network',
    );
  } finally {
    clearTimeout(timer);
  }
}

function validateLinkResult(value: unknown): PragasAccountLinkResult {
  if (!value || typeof value !== 'object') throw new PragasAccountError('invalid_response');
  const result = value as Record<string, unknown>;
  if (result.app !== 'rumo-pragas' || typeof result.linked !== 'boolean') {
    throw new PragasAccountError('invalid_response');
  }
  if (result.linked === true && (result.code === 'linked' || result.code === 'already_linked')) {
    return result as PragasAccountLinkResult;
  }
  if (
    result.linked === false &&
    (result.code === 'deleted_reactivation_required' ||
      result.code === 'deletion_pending' ||
      result.code === 'global_deletion_pending')
  ) {
    return result as PragasAccountLinkResult;
  }
  throw new PragasAccountError('invalid_response');
}

export async function linkPragasAccount(
  accessToken: string,
  idempotencyKey: string = Crypto.randomUUID(),
): Promise<PragasAccountLinkResult> {
  if (!accessToken.trim()) throw new PragasAccountError('unauthorized');
  const url = `${Config.SUPABASE_URL}/rest/v1/rpc/pragas_link_account`;
  if (!url.startsWith('https://')) throw new PragasAccountError('invalid_server');
  const response = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        apikey: Config.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: '{}',
    },
    LINK_TIMEOUT_MS,
  );
  if (response.status === 401) throw new PragasAccountError('unauthorized');
  if (!response.ok) {
    const failure = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    const stableMessage = typeof failure?.message === 'string' ? failure.message : '';
    if (stableMessage.includes('global_account_deletion_requested')) {
      return { linked: false, app: 'rumo-pragas', code: 'global_deletion_pending' };
    }
    throw new PragasAccountError('link_unavailable');
  }
  return validateLinkResult(await response.json());
}

export async function reactivatePragasAccount(
  accessToken: string,
  idempotencyKey: string = Crypto.randomUUID(),
): Promise<void> {
  if (!accessToken.trim()) throw new PragasAccountError('unauthorized');
  const url = `${Config.SUPABASE_URL}/functions/v1/pragas-reactivate-account`;
  if (!url.startsWith('https://')) throw new PragasAccountError('invalid_server');
  const response = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ confirm: 'REACTIVATE_RUMO_PRAGAS' }),
    },
    REACTIVATE_TIMEOUT_MS,
  );
  if (!response.ok) throw new PragasAccountError('reactivation_unavailable');
  const data = (await response.json()) as Record<string, unknown>;
  if (
    data.ok !== true ||
    data.code !== 'PRAGAS_ACCOUNT_REACTIVATED' ||
    data.reactivated !== true ||
    data.dataRestored !== false
  ) {
    throw new PragasAccountError('invalid_response');
  }
}

export const __internal = { validateLinkResult };
