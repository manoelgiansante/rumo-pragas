/**
 * MCP Server Auth — rumo-pragas
 *
 * SECURITY: Replaces the previous shared-token model.
 *
 * Caller MUST send `Authorization: Bearer <supabase-user-jwt>`.
 * We validate the JWT via Supabase `auth.getUser(jwt)` using the anon-key
 * client. The authenticated user id is derived from the verified JWT — it is
 * NEVER taken from a request parameter. Tools query through a JWT-bound client
 * so Row-Level Security policies enforce per-user isolation server-side.
 *
 * Rate limit: 30 req/min keyed by userId (post-auth).
 */
import { VercelRequest } from '@vercel/node';
import { getAuthClient } from './_supabase';

export interface AuthSuccess {
  ok: true;
  userId: string;
  jwt: string;
}
export interface AuthFailure {
  ok: false;
  error: string;
}
export type AuthResult = AuthSuccess | AuthFailure;

function extractBearer(req: VercelRequest): string | null {
  const raw = req.headers['authorization'] || req.headers['Authorization' as 'authorization'];
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m) return null;
  const token = m[1].trim();
  return token.length > 0 ? token : null;
}

/**
 * Authenticate the request via Supabase JWT.
 * Returns the verified userId on success.
 */
export async function authenticate(req: VercelRequest): Promise<AuthResult> {
  const jwt = extractBearer(req);
  if (!jwt) return { ok: false, error: 'Missing Authorization: Bearer <jwt>' };

  let client;
  try {
    client = getAuthClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Auth client init failed' };
  }

  try {
    const { data, error } = await client.auth.getUser(jwt);
    if (error || !data?.user?.id) {
      return { ok: false, error: 'Invalid or expired token' };
    }
    return { ok: true, userId: data.user.id, jwt };
  } catch {
    return { ok: false, error: 'Token validation failed' };
  }
}

// ---- Rate limit (per authenticated user) ----
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 30;

interface Bucket {
  count: number;
  resetAt: number;
}
const buckets = new Map<string, Bucket>();

export function checkRateLimit(key: string) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + RATE_WINDOW_MS };
    buckets.set(key, b);
  }
  b.count += 1;
  if (b.count > RATE_LIMIT) return { blocked: true, retryAfterMs: b.resetAt - now };
  if (buckets.size > 500) {
    for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
  }
  return { blocked: false, retryAfterMs: 0 };
}
