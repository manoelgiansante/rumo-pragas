/**
 * Supabase clients — rumo-pragas MCP server
 * Projeto: jxcnfyeemdltdfqtgbcl (shared)
 *
 * Dois modos de cliente:
 * - `getAuthClient()` — anon key, usado APENAS para validar JWT do usuário
 *   (auth.getUser).
 * - `getUserClient(jwt)` — anon key + Authorization header do caller, para
 *   queries do modo USER. RLS é enforced.
 * - `getServiceClient()` — service_role key, usado APENAS no modo HUB
 *   (server-to-server via shared token). Bypassa RLS — só pode ser invocado
 *   após `authenticate()` retornar `mode: 'hub'` com sucesso. Singleton.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _authClient: SupabaseClient | null = null;
let _serviceClient: SupabaseClient | null = null;

function getUrl(): string {
  return process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
}

function getAnonKey(): string {
  return process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
}

function getServiceRoleKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || '';
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

/**
 * Service-role client — RLS bypassed. ONLY used in hub mode (shared token,
 * server-to-server). Tools are responsible for explicit ownership filters
 * when needed (e.g. `.eq('user_id', x)`). In hub mode, `userId` is null and
 * the hub orchestrates which rows it wants — caller is trusted.
 *
 * Singleton. Throws if SUPABASE_SERVICE_ROLE_KEY missing so misconfigured
 * deploys fail loud rather than silently leaking via anon RLS.
 */
export function getServiceClient(): SupabaseClient {
  if (_serviceClient) return _serviceClient;
  const url = getUrl();
  const key = getServiceRoleKey();
  if (!url || !key) {
    throw new Error('Service-role credentials missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  }
  _serviceClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  return _serviceClient;
}
