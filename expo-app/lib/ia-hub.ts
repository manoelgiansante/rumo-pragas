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
 *   - EXPO_PUBLIC_IA_HUB_API_KEY       per-app token issued by the IA Hub
 *   - EXPO_PUBLIC_IA_HUB_URL           base URL (default https://iahub.agrorumo.com)
 *   - EXPO_PUBLIC_IA_HUB_ENABLED       "true" -> SDK transport is *available*
 *   - EXPO_PUBLIC_IA_HUB_DIAGNOSE_READY  "true" -> server contract is satisfied
 *
 * ZERO-L note: these envs are SAFE as plaintext on EAS because the IA Hub
 * key is an *app-scoped* token (rate-limited, revocable, no cross-tenant
 * blast radius) — the canonical secret stays server-side at the IA Hub.
 *
 * ZERO-X / data-integrity gate (IH-7 — why two flags exist):
 * The `diagnose` path through the IA Hub has three latent risks that the
 * legacy `/functions/v1/diagnose` edge function does NOT have:
 *   1. AUTH SCOPE — the only credential the SDK sends by default is the
 *      app-scoped API key + an (untrusted) `userId` in the request body.
 *      Per ZERO-X the IA Hub MUST derive the user from a real Supabase JWT
 *      (`auth.getUser(jwt)`) and NEVER trust a body/header `userId` for
 *      scope or billing. The caller forwards the user's access token as
 *      `Authorization: Bearer <jwt>` (see services/diagnosis.ts).
 *   2. PERSISTENCE — the legacy edge fn INSERTs into `pragas_diagnoses`.
 *      Until the IA Hub worker writes that row (or the client mirrors it),
 *      history disappears and the monthly free cap (3) silently resets.
 *   3. QUOTA — the legacy edge fn enforces the free-tier cap server-side.
 *      The IA Hub must enforce the same per (user, app) quota or free users
 *      bypass the 3/month limit.
 * Because (2) and (3) are SERVER-side guarantees the client cannot verify,
 * the diagnose path is gated behind a SECOND, explicit attestation flag
 * (`EXPO_PUBLIC_IA_HUB_DIAGNOSE_READY`). Flipping only `..._ENABLED` is NOT
 * enough — `isIAHubDiagnoseEnabled()` stays false so the build keeps using
 * the safe legacy path. Set `..._DIAGNOSE_READY=true` ONLY once the IA Hub
 * (a) validates the Supabase JWT, (b) persists to `pragas_diagnoses`, and
 * (c) enforces the per-user+app monthly quota.
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

/** Coerce an `EXPO_PUBLIC_*` truthy string ("true" / "1") to a boolean. */
function envTrue(key: string): boolean {
  const flag = readEnv(key);
  if (!flag) return false;
  const v = String(flag).trim().toLowerCase();
  return v === 'true' || v === '1';
}

/**
 * Whether the IA Hub SDK transport is *available* on this build (flag on +
 * a usable API key). Defaults to **false** so installs missing the EAS env
 * continue to work unchanged.
 *
 * NOTE: availability ≠ "safe to route the diagnose flow". For the diagnose
 * path use `isIAHubDiagnoseEnabled()`, which also requires the server-side
 * persistence/quota/JWT contract attestation. See the file header (IH-7).
 */
export function isIAHubEnabled(): boolean {
  if (!envTrue('EXPO_PUBLIC_IA_HUB_ENABLED')) return false;
  // Defensive: even if the flag is on, refuse to use the SDK without a key.
  return !!readEnv('EXPO_PUBLIC_IA_HUB_API_KEY');
}

/**
 * Whether the **diagnose** flow may route through the IA Hub.
 *
 * Stricter than `isIAHubEnabled()`: also requires
 * `EXPO_PUBLIC_IA_HUB_DIAGNOSE_READY=true`, the explicit attestation that the
 * IA Hub server now (1) validates the Supabase JWT (ZERO-X), (2) persists to
 * `pragas_diagnoses`, and (3) enforces the per-user+app monthly free cap.
 * Without it the flow falls back to the legacy edge function, which already
 * does all three. This makes the latent risks impossible to trigger by a
 * single env-flag flip.
 */
export function isIAHubDiagnoseEnabled(): boolean {
  if (!isIAHubEnabled()) return false;
  return envTrue('EXPO_PUBLIC_IA_HUB_DIAGNOSE_READY');
}

/** Test-only: reset the singleton between tests. */
export function __resetIAHubClientForTests(): void {
  _client = null;
}
