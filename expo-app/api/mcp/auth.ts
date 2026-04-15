/**
 * MCP Server Auth — rumo-pragas
 * x-ia-hub-token header, timing-safe compare, 30 req/min per token.
 */
import { VercelRequest } from '@vercel/node';
import { timingSafeEqual } from 'crypto';

const TOKEN_ENV = process.env.MCP_API_TOKEN || '';

function safeCompare(a: string, b: string): boolean {
  if (!a || !b) return false;
  try {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) {
      timingSafeEqual(bufA, bufA);
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export interface AuthResult { ok: boolean; token?: string; error?: string; }

export function authenticate(req: VercelRequest): AuthResult {
  if (!TOKEN_ENV) return { ok: false, error: 'MCP_API_TOKEN not configured' };
  const raw = req.headers['x-ia-hub-token'];
  const provided = Array.isArray(raw) ? raw[0] : raw || '';
  if (!provided) return { ok: false, error: 'Missing x-ia-hub-token header' };
  if (!safeCompare(provided, TOKEN_ENV)) return { ok: false, error: 'Invalid token' };
  return { ok: true, token: provided };
}

const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 30;
interface Bucket { count: number; resetAt: number; }
const buckets = new Map<string, Bucket>();

export function checkRateLimit(token: string) {
  const now = Date.now();
  let b = buckets.get(token);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + RATE_WINDOW_MS };
    buckets.set(token, b);
  }
  b.count += 1;
  if (b.count > RATE_LIMIT) return { blocked: true, retryAfterMs: b.resetAt - now };
  if (buckets.size > 500) for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
  return { blocked: false, retryAfterMs: 0 };
}
