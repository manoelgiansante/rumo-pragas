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
 * - `userId`: verified Supabase user id (from JWT). NEVER trust a userId from
 *   the tool input — always use this.
 * - `supabase`: client bound to the caller's JWT. RLS is active.
 */
export interface ToolContext {
  userId: string;
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
