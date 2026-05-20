/**
 * MCP Server Auth — rumo-pragas
 *
 * Dual-mode auth:
 *
 * MODE A — HUB (shared token, server-to-server)
 *   Header: `x-ia-hub-token: <MCP_API_TOKEN>`
 *   Used by the ia-hub MCP proxy when relaying agent calls. RLS is bypassed
 *   server-side via service_role; tools must enforce ownership explicitly
 *   when needed. `userId` is null in this mode.
 *
 * MODE B — USER (Supabase JWT, per-user)
 *   Header: `Authorization: Bearer <supabase-user-jwt>`
 *   Validated via Supabase `auth.getUser(jwt)`. Tools query through a
 *   JWT-bound client so RLS enforces per-user isolation server-side.
 *
 * If BOTH headers are present, the HUB token is checked first; if it matches
 * we accept hub mode and ignore the Bearer. If hub token does not match, we
 * fall through to Bearer JWT validation.
 *
 * Rate limit: 30 req/min keyed by userId (user mode) or 'hub' (hub mode).
 */
import { VercelRequest } from '@vercel/node';
import { timingSafeEqual } from 'node:crypto';
import { getAuthClient } from './_supabase';

export interface AuthSuccessUser {
  ok: true;
  mode: 'user';
  userId: string;
  jwt: string;
}
export interface AuthSuccessHub {
  ok: true;
  mode: 'hub';
  userId: null;
  jwt: null;
}
export type AuthSuccess = AuthSuccessUser | AuthSuccessHub;
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

function extractHubToken(req: VercelRequest): string | null {
  const raw = req.headers['x-ia-hub-token'];
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (!header) return null;
  const t = header.trim();
  return t.length > 0 ? t : null;
}

function safeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  // Pad to equal length to avoid timingSafeEqual length-based throw, then
  // require lengths matched as a final guard.
  const len = Math.max(a.length, b.length);
  const ab = Buffer.alloc(len, 0);
  const bb = Buffer.alloc(len, 0);
  ab.write(a);
  bb.write(b);
  const eq = timingSafeEqual(ab, bb);
  return eq && a.length === b.length;
}

/**
 * Authenticate the request — hub first, then user JWT.
 */
export async function authenticate(req: VercelRequest): Promise<AuthResult> {
  // ---------- Mode A: Hub shared token ----------
  const hubProvided = extractHubToken(req);
  const hubExpected = process.env.MCP_API_TOKEN || '';
  if (hubProvided && hubExpected) {
    if (safeCompare(hubProvided, hubExpected)) {
      return { ok: true, mode: 'hub', userId: null, jwt: null };
    }
    // Hub header present but invalid -- fall through to Bearer below so a
    // misconfigured hub still has a chance via user JWT, but log nothing
    // here (caller logs auth_failed on final no-match).
  }

  // ---------- Mode B: User JWT ----------
  const jwt = extractBearer(req);
  if (!jwt) {
    return {
      ok: false,
      error:
        'Missing credentials. Provide x-ia-hub-token (hub) or Authorization: Bearer <jwt> (user).',
    };
  }

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
    return { ok: true, mode: 'user', userId: data.user.id, jwt };
  } catch {
    return { ok: false, error: 'Token validation failed' };
  }
}

// ---- Rate limit (per authenticated user, or 'hub' bucket for shared token) ----
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT_USER = 30;
const RATE_LIMIT_HUB = 120; // hub fans out for many agents -- higher ceiling

interface Bucket {
  count: number;
  resetAt: number;
}
const buckets = new Map<string, Bucket>();

export function checkRateLimit(key: string, mode: 'user' | 'hub' = 'user') {
  const now = Date.now();
  const limit = mode === 'hub' ? RATE_LIMIT_HUB : RATE_LIMIT_USER;
  let b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + RATE_WINDOW_MS };
    buckets.set(key, b);
  }
  b.count += 1;
  if (b.count > limit) return { blocked: true, retryAfterMs: b.resetAt - now };
  if (buckets.size > 500) {
    for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
  }
  return { blocked: false, retryAfterMs: 0 };
}
