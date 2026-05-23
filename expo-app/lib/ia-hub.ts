/**
 * Rumo IA Hub client — singleton wrapper used by the diagnosis flow.
 *
 * The IA Hub is the AgroRumo cross-app AI gateway. When the feature flag
 * `EXPO_PUBLIC_IA_HUB_ENABLED=true` is set on a given build, the Pragas
 * diagnosis flow (`services/diagnosis.ts`) routes vision requests through
 * the IA Hub (`POST <baseUrl>/v1/diagnose`) instead of the legacy direct
 * call to the Supabase `diagnose` edge function.
 *
 * Env vars (all `EXPO_PUBLIC_*` — see `eas.json` / `.env`):
 *   - EXPO_PUBLIC_IA_HUB_API_KEY  per-app token issued by the IA Hub
 *   - EXPO_PUBLIC_IA_HUB_URL      base URL (default https://iahub.agrorumo.com)
 *   - EXPO_PUBLIC_IA_HUB_ENABLED  "true" -> use SDK; anything else -> legacy
 *
 * ZERO-L note: these envs are SAFE as plaintext on EAS because the IA Hub
 * key is an *app-scoped* token (rate-limited, revocable, no cross-tenant
 * blast radius) — the canonical secret stays server-side at the IA Hub.
 */
import { RumoIAHub } from '@agrorumo/ia-hub-client';

const DEFAULT_BASE_URL = 'https://iahub.agrorumo.com';

let _client: RumoIAHub | null = null;

/**
 * Read an `EXPO_PUBLIC_*` env value at runtime.
 *
 * Why bracket notation: `babel-preset-expo` ships `inline-env-vars` which
 * replaces dotted `process.env.EXPO_PUBLIC_FOO` reads with the literal value
 * captured at *transform time*. That's normally fine for app code, but it
 * makes test-time env mutation (`process.env.X = 'val'` between cases)
 * silently no-op. Reading via `process.env[k]` opts out of the inline pass
 * because the plugin only matches the dotted member-expression form.
 */
function readEnv(key: string): string | undefined {
  return (process.env as Record<string, string | undefined>)[key];
}

/** Returns the singleton IA Hub client, or `null` if not configured. */
export function getIAHubClient(): RumoIAHub | null {
  if (_client) return _client;
  const apiKey = readEnv('EXPO_PUBLIC_IA_HUB_API_KEY');
  if (!apiKey) {
    // No key on this build → caller must fall back to legacy path.
    return null;
  }
  const baseUrl = readEnv('EXPO_PUBLIC_IA_HUB_URL') || DEFAULT_BASE_URL;
  _client = new RumoIAHub({
    apiKey,
    baseUrl,
    appSlug: 'rumo-pragas',
    // Pragas diagnosis is interactive — keep the 60 s hard ceiling that
    // `services/diagnosis.ts` already enforces, so the SDK timer matches.
    timeoutMs: 60_000,
    userAgentSuffix: 'rumo-pragas-expo',
  });
  return _client;
}

/**
 * Whether the diagnosis flow should call the IA Hub instead of the legacy
 * Supabase edge function. Defaults to **false** so installs missing the
 * EAS env continue to work unchanged.
 */
export function isIAHubEnabled(): boolean {
  const flag = readEnv('EXPO_PUBLIC_IA_HUB_ENABLED');
  if (!flag) return false;
  const v = String(flag).trim().toLowerCase();
  if (v !== 'true' && v !== '1') return false;
  // Defensive: even if the flag is on, refuse to use the SDK without a key.
  return !!readEnv('EXPO_PUBLIC_IA_HUB_API_KEY');
}

/** Test-only: reset the singleton between tests. */
export function __resetIAHubClientForTests(): void {
  _client = null;
}
