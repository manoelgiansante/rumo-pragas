/**
 * MCP Server -- rumo-pragas (HTTP endpoint, Vercel serverless)
 * POST /api/mcp/server
 *
 * AUTH (dual-mode):
 *   - HUB: `x-ia-hub-token: <MCP_API_TOKEN>` (server-to-server, bypasses RLS)
 *   - USER: `Authorization: Bearer <supabase-user-jwt>` (per-user, RLS active)
 *
 * In user mode, tools query through a JWT-bound Supabase client so RLS
 * enforces per-user isolation. The authenticated `userId` is derived from the
 * verified JWT and passed to handlers via ToolContext -- it is NEVER read
 * from request input.
 *
 * In hub mode, tools use a service_role client (RLS bypassed). Tools that
 * touch per-user data MUST require an explicit `userId` arg in this mode and
 * filter `.eq('user_id', x)` themselves.
 */
import { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticate, checkRateLimit } from './auth';
import { logEvent, err as mcpErr, ToolHandler, ToolContext } from './_types';
import { getUserClient, getServiceClient } from './_supabase';
import { listDiagnoses } from './tools/list_diagnoses';
import { getDiagnosis } from './tools/get_diagnosis';
import { searchPestLibrary } from './tools/search_pest_library';
import { getPestHistory } from './tools/get_pest_history';

const TOOLS: Record<string, ToolHandler> = {
  [listDiagnoses.name]: listDiagnoses,
  [getDiagnosis.name]: getDiagnosis,
  [searchPestLibrary.name]: searchPestLibrary,
  [getPestHistory.name]: getPestHistory,
};

function setSecurityHeaders(res: VercelResponse) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cache-Control', 'no-store');
  res.removeHeader('X-Powered-By');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setSecurityHeaders(res);
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json(mcpErr('Method Not Allowed'));
  }

  const auth = await authenticate(req);
  if (!auth.ok) {
    logEvent('auth_failed', { reason: auth.error });
    return res.status(401).json(mcpErr(auth.error));
  }

  // Rate-limit key: per-user in user mode, single 'hub' bucket in hub mode.
  const rlKey = auth.mode === 'hub' ? 'hub' : auth.userId;
  const rl = checkRateLimit(rlKey, auth.mode);
  if (rl.blocked) {
    const retry = Math.ceil(rl.retryAfterMs / 1000);
    res.setHeader('Retry-After', String(retry));
    logEvent('rate_limited', { mode: auth.mode, key: rlKey, retryAfterSec: retry });
    return res.status(429).json(mcpErr(`Rate limit exceeded. Retry in ${retry}s.`));
  }

  const body = (req.body || {}) as {
    method?: string;
    params?: { name?: string; arguments?: unknown };
  };
  try {
    if (body.method === 'tools/list') {
      const tools = Object.values(TOOLS).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }));
      logEvent('tools_list', { mode: auth.mode, userId: auth.userId, count: tools.length });
      return res.status(200).json({ tools });
    }
    if (body.method === 'tools/call') {
      const name = body.params?.name;
      const args = body.params?.arguments ?? {};
      if (!name || !TOOLS[name]) return res.status(400).json(mcpErr(`Unknown tool: ${name}`));

      const supabase = auth.mode === 'hub' ? getServiceClient() : getUserClient(auth.jwt);
      const ctx: ToolContext = {
        mode: auth.mode,
        userId: auth.userId,
        supabase,
      };
      const started = Date.now();
      const result = await TOOLS[name].handler(args, ctx);
      logEvent('tool_call', {
        mode: auth.mode,
        userId: auth.userId,
        name,
        ms: Date.now() - started,
        isError: !!result.isError,
      });
      return res.status(200).json(result);
    }
    return res.status(400).json(mcpErr(`Unknown method: ${body.method}`));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logEvent('tool_exception', { mode: auth.mode, userId: auth.userId, error: msg });
    return res.status(500).json(mcpErr(`Internal error: ${msg}`));
  }
}
