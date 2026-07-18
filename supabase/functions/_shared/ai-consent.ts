import type { SupabaseClient } from "@supabase/supabase-js";

export const PRAGAS_AI_CONSENT_VERSION = "2026-07-14.1";
export type PragasAIConsentPurpose = "diagnosis" | "chat";

export type PragasAIConsentHeaderResult =
  | { ok: true; version: typeof PRAGAS_AI_CONSENT_VERSION; purpose: PragasAIConsentPurpose }
  | { ok: false; code: "ai_consent_required" | "ai_consent_mismatch" };

export function validatePragasAIConsentHeaders(
  headers: Headers,
  expectedPurpose: PragasAIConsentPurpose,
): PragasAIConsentHeaderResult {
  const version = headers.get("X-Pragas-AI-Consent-Version")?.trim() ?? "";
  const purpose = headers.get("X-Pragas-AI-Consent-Purpose")?.trim().toLowerCase() ?? "";
  if (!version || !purpose) return { ok: false, code: "ai_consent_required" };
  if (version !== PRAGAS_AI_CONSENT_VERSION || purpose !== expectedPurpose) {
    return { ok: false, code: "ai_consent_mismatch" };
  }
  return { ok: true, version: PRAGAS_AI_CONSENT_VERSION, purpose: expectedPurpose };
}

export type PragasAIConsentLedgerState = "active" | "inactive" | "unavailable";

export async function recordPragasAIConsent(
  admin: SupabaseClient,
  userId: string,
  consent: Extract<PragasAIConsentHeaderResult, { ok: true }>,
): Promise<PragasAIConsentLedgerState> {
  const { data, error } = await admin.rpc("record_pragas_ai_consent", {
    p_user_id: userId,
    p_purpose: consent.purpose,
    p_version: consent.version,
  });
  if (error) return "unavailable";
  const result = Array.isArray(data) ? data[0] : data;
  if (typeof result !== "object" || result === null) return "unavailable";
  return (result as Record<string, unknown>).accepted === true ? "active" : "inactive";
}
