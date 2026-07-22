// ── Plant-gate (2026-07-22) — cheap Gemini pre-check before the PAID provider ──
//
// Why: every Agrio /diagnose call costs real money (~US$0.10) even when the
// photo is a selfie, a screenshot or a wall. When PLANT_GATE_ENABLED === "true"
// the diagnose twins ask gemini-3.1-flash-lite (free tier — the SAME
// GEMINI_API_KEY the ai-chat slugs already use) whether the photo shows a
// plant at all, BEFORE calling the paid provider.
//
// Contract (FAIL-OPEN by design — the gate can only save money, never block a
// legitimate diagnosis):
//   "blocked" → model answered a hard "no"  → caller skips the provider and
//               short-circuits into its EXISTING invalid_image path.
//   "pass"    → model answered "yes"        → proceed to the provider.
//   "unsure"  → model answered "unsure"     → proceed to the provider.
//   "error"   → HTTP/network/timeout/parse failure or missing key → proceed.
//   "off"     → flag disabled               → proceed (no network call made).
//
// The outcome is stamped into the persisted `notes.ai_meta.plant_gate` by the
// callers so drift/quality of the gate is queryable per row.
//
// ZERO-O: failures are reported through the caller-supplied `onError` hook
// (Sentry, level warning, own fingerprint). The hook receives a SANITIZED
// error — the API key never reaches logs/Sentry. `runPlantGate` itself NEVER
// throws (locked by _tests/plant-gate.test.ts).

export const PLANT_GATE_MODEL = "gemini-3.1-flash-lite";
export const PLANT_GATE_TIMEOUT_MS = 4_000;

export type PlantGateOutcome = "pass" | "blocked" | "unsure" | "error" | "off";

export interface PlantGateInput {
  /** Clean base64 image payload (no data: prefix). Never logged. */
  base64: string;
  /** Detected mime type, e.g. "image/jpeg". */
  mediaType: string;
  /** PLANT_GATE_ENABLED === "true" (read per-request — edge secrets are runtime). */
  enabled: boolean;
  /** GEMINI_API_KEY. Never logged; scrubbed from any error message. */
  apiKey: string;
  /** Default PLANT_GATE_TIMEOUT_MS (4s). */
  timeoutMs?: number;
  /** Test seam — defaults to global fetch. */
  fetchImpl?: (input: string, init: RequestInit) => Promise<Response>;
  /** ZERO-O reporting hook. Receives a sanitized Error; its own failures are swallowed. */
  onError?: (error: Error) => void | Promise<void>;
}

const PLANT_GATE_PROMPT =
  `Voce e um filtro de triagem de imagens de um aplicativo agricola. Responda APENAS com JSON valido, sem markdown, exatamente no formato {"is_plant":"yes"} ou {"is_plant":"no"} ou {"is_plant":"unsure"}.
- "yes": foto de planta, lavoura, plantacao, folha, fruto, caule, raiz, semente, ou praga/inseto/doenca EM planta.
- "no": pessoa, rosto, objeto, tela/print/captura de tela, parede, ambiente urbano ou interno sem planta, ou animal isolado sem planta.
- Na duvida, responda "unsure".`;

interface GeminiGatePayload {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: unknown; thought?: unknown }> };
  }>;
}

function extractVerdict(raw: string): "yes" | "no" | "unsure" | null {
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  try {
    const parsed: unknown = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const v = (parsed as Record<string, unknown>).is_plant;
      if (v === "yes" || v === "no" || v === "unsure") return v;
    }
  } catch {
    // fall through to the regex net below (model may wrap the JSON in prose)
  }
  const m = cleaned.match(/"is_plant"\s*:\s*"(yes|no|unsure)"/);
  if (m) return m[1] as "yes" | "no" | "unsure";
  return null;
}

export async function runPlantGate(input: PlantGateInput): Promise<PlantGateOutcome> {
  if (!input.enabled) return "off";
  const timeoutMs = input.timeoutMs ?? PLANT_GATE_TIMEOUT_MS;
  const doFetch = input.fetchImpl ??
    ((u: string, i: RequestInit) => fetch(u, i));
  try {
    if (!input.apiKey) throw new Error("plant_gate_missing_api_key");
    // Key goes in the header (never the URL) so it cannot leak via error
    // messages that embed the request URL.
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${PLANT_GATE_MODEL}:generateContent`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await doFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": input.apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { inlineData: { mimeType: input.mediaType, data: input.base64 } },
                { text: PLANT_GATE_PROMPT },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 64,
            responseMimeType: "application/json",
          },
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      throw new Error(`plant_gate_http_${res.status}`);
    }
    const data = await res.json() as GeminiGatePayload;
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const text = parts
      .filter((p) => p && typeof p.text === "string" && p.thought !== true)
      .map((p) => p.text as string)
      .join("");
    const verdict = extractVerdict(text);
    if (verdict === null) throw new Error("plant_gate_unparseable_verdict");
    if (verdict === "no") return "blocked";
    if (verdict === "yes") return "pass";
    return "unsure";
  } catch (error) {
    // FAIL-OPEN: any failure lets the diagnosis proceed. Report it (ZERO-O)
    // with a sanitized message — the API key must never reach logs/Sentry.
    const message = String(error instanceof Error ? error.message : error);
    const sanitized = input.apiKey ? message.split(input.apiKey).join("[REDACTED]") : message;
    try {
      await input.onError?.(new Error(`plant_gate_failed: ${sanitized}`.slice(0, 300)));
    } catch {
      // the reporting hook must never break the fail-open contract
    }
    return "error";
  }
}
