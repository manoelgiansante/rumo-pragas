/**
 * Supabase clients — rumo-pragas MCP server
 * Projeto: jxcnfyeemdltdfqtgbcl (shared)
 *
 * SECURITY: This server NO LONGER uses the service_role key.
 * - `getAuthClient()` — anon key, used to validate the caller's JWT (auth.getUser).
 * - `getUserClient(jwt)` — anon key + caller's Authorization header so PostgREST
 *   forwards the JWT and Row-Level Security policies enforce per-user isolation.
 *
 * Every tool MUST query through `getUserClient(jwt)` so RLS is active. The
 * authenticated `userId` (derived from the JWT) is also passed explicitly to
 * each handler as defense-in-depth — queries `.eq('user_id', userId)` even
 * though RLS would already filter the rows.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _authClient: SupabaseClient | null = null;

function getUrl(): string {
  return process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
}

function getAnonKey(): string {
  return process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
}

/**
 * Anon-key client used ONLY to validate JWTs via `auth.getUser(jwt)`.
 * Singleton — safe to reuse across requests.
 */
export function getAuthClient(): SupabaseClient {
  if (_authClient) return _authClient;
  const url = getUrl();
  const key = getAnonKey();
  if (!url || !key) {
    throw new Error(
      'Supabase credentials missing (EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY)',
    );
  }
  _authClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  return _authClient;
}

/**
 * Per-request client that forwards the caller's JWT to PostgREST.
 * RLS is enforced — queries return only rows the user can see.
 *
 * NOT a singleton: each request gets its own client because the Authorization
 * header is bound to that JWT.
 */
export function getUserClient(jwt: string): SupabaseClient {
  if (!jwt) throw new Error('JWT required for user-scoped client');
  const url = getUrl();
  const key = getAnonKey();
  if (!url || !key) {
    throw new Error(
      'Supabase credentials missing (EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY)',
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}
