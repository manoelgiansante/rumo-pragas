import type { SupabaseClient } from '@supabase/supabase-js';

export interface MCPContent {
  type: 'text';
  text: string;
}
export interface MCPResponse {
  content: MCPContent[];
  isError?: boolean;
}
export function ok(data: unknown): MCPResponse {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
export function err(msg: string): MCPResponse {
  return { content: [{ type: 'text', text: msg }], isError: true };
}

/**
 * Per-request, post-auth context handed to every tool handler.
 *
 * - `mode`: 'user' (JWT) or 'hub' (shared token, server-to-server).
 * - `userId`: verified Supabase user id (from JWT) in user mode; null in hub
 *   mode. NEVER trust a userId from the tool input -- always use this.
 * - `supabase`: in user mode, JWT-bound client (RLS active). In hub mode,
 *   service_role client (RLS bypassed) -- tools that read per-user data MUST
 *   either require `userId` in input AND explicitly filter `.eq('user_id', x)`,
 *   or refuse to run in hub mode.
 */
export interface ToolContext {
  mode: 'user' | 'hub';
  userId: string | null;
  supabase: SupabaseClient;
}

export interface ToolHandler {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: unknown, ctx: ToolContext) => Promise<MCPResponse>;
}
export function logEvent(event: string, meta: Record<string, unknown> = {}) {
  // eslint-disable-next-line no-console -- Structured server log (Vercel function stdout)
  console.log(JSON.stringify({ mcp: 'rumo-pragas', event, ts: new Date().toISOString(), ...meta }));
}
