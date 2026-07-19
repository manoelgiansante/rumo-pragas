/**
 * Agrio (Saillog) vision-identification provider for the `diagnose` edge fn.
 *
 * WHY THIS EXISTS (Option B — CEO decision 2026-07-06):
 *  - Anthropic Vision (Claude Haiku) ran the identification AND wrote the full
 *    PT-BR laudo. On 2026-07-06 the Anthropic credit balance hit zero → every
 *    diagnosis returned "Claude API 400 — credit balance too low" (RUMO-PRAGAS-10,
 *    25+ escalating). The app is 100% free and public — diagnosis was DOWN.
 *  - Agrio is a PAID, already-funded account (~985 credits, 1 credit / diagnose)
 *    that IDENTIFIES crop + ranked pathologies from a photo but does NOT write a
 *    PT-BR treatment laudo.
 *  - The laudo is supplied ENTIRELY client-side by the bundled MIP catalog
 *    (`data/mip/*` via `hooks/useMipKnowledge`), which resolves from
 *    `pest_name` + `enrichment.scientific_name` + `crop`. So this provider emits
 *    ZERO Anthropic spend: it only needs to hand the client a good
 *    `pest_name` + `scientific_name` + `crop` so `useMipKnowledge` matches.
 *
 * CONTRACT (verified live 2026-07-06 against the gateway):
 *   Base: https://agrio-api-gateway-6it0wqn1.uc.gateway.dev/v1
 *   Auth: `?key=<API_KEY>` (Google Cloud API Gateway)
 *   POST /diagnose  multipart: file=<image> [+ payload=JSON({crop:"Coffee"})]
 *     → { "message":"success!", "crop":"Coffee", "cropConfidence":"0.99…"  (STRING),
 *         "idArray":[ {"id":"Rust","confidence":0.93,"commonName":"Rust",
 *                      "scientificName":null}, … ] }
 *   GET  /get-credit → { "message":"success!", "numCredits":985 }
 *   On failure the body is `{ "error": {…} }` (or non-2xx).
 *
 * NOTE: the predictions array is `idArray` (NOT `predictions`), `cropConfidence`
 * is a STRING, `scientificName` can be null, and labels are English/generic
 * ("Rust"). That last point is the crux: a null-scientificName generic label
 * won't resolve the PT/Latin catalog on its own, so AGRIO_LABEL_MAP bridges the
 * high-value generic labels per crop. Everything else relies on Agrio's own
 * scientificName (present for many pathologies); genuinely unmapped top labels
 * are logged (agrio_label_unmapped) so the map is completed from real traffic.
 */

import { fetchWithTimeout } from "../_shared/fetch-timeout.ts";
import { readBoundedJson } from "../_shared/bounded-body.ts";
import { captureException, captureMessage } from "../_shared/pragas-sentry.ts";

export const AGRIO_BASE = "https://agrio-api-gateway-6it0wqn1.uc.gateway.dev/v1";

/** Raw prediction item from Agrio `/diagnose`. */
interface AgrioPredictionRaw {
  id?: string;
  confidence?: number;
  commonName?: string;
  scientificName?: string | null;
}

/** Raw `/diagnose` response. */
interface AgrioDiagnoseRaw {
  message?: string;
  crop?: string;
  cropConfidence?: string | number;
  idArray?: AgrioPredictionRaw[];
  error?: unknown;
}

/** Decode a clean base64 string (no `data:` prefix) to bytes. */
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * POST an image to Agrio and return the parsed (success-only) response.
 * Throws on network error, timeout, non-2xx, or a body carrying `error`.
 */
export async function callAgrioDiagnose(opts: {
  apiKey: string;
  base64: string;
  mediaType: string;
  cropApiName?: string | undefined;
  requestId: string;
  timeoutMs?: number;
}): Promise<AgrioDiagnoseRaw> {
  const { apiKey, base64, mediaType, cropApiName, timeoutMs = 45_000 } = opts;
  if (!apiKey) throw new Error("AGRIO_API_KEY not configured");

  const bytes = base64ToBytes(base64);
  const ext = mediaType.includes("png")
    ? "png"
    : mediaType.includes("webp")
    ? "webp"
    : mediaType.includes("gif")
    ? "gif"
    : "jpg";

  const form = new FormData();
  // `bytes` is a fresh Uint8Array; the cast sidesteps a lib DOM/Deno typing
  // nuance (Uint8Array vs SharedArrayBuffer-backed BlobPart) — valid at runtime.
  const filePart = new Blob([bytes as unknown as BlobPart], { type: mediaType });
  form.append("file", filePart, `diagnosis.${ext}`);
  // Optional crop hint — improves Agrio accuracy; omit to let it auto-detect.
  if (cropApiName) form.append("payload", JSON.stringify({ crop: cropApiName }));

  const res = await fetchWithTimeout(
    `${AGRIO_BASE}/diagnose?key=${encodeURIComponent(apiKey)}`,
    { method: "POST", body: form },
    timeoutMs,
  );

  let json: AgrioDiagnoseRaw;
  try {
    json = await readBoundedJson(res, 256 * 1024) as AgrioDiagnoseRaw;
  } catch {
    throw new Error(`agrio_non_json_${res.status}`);
  }
  if (!res.ok || json.error || json.message !== "success!") {
    throw new Error(`agrio_api_${res.status}`);
  }
  return json;
}

export async function maybeCaptureAgrioBalance(options: {
  apiKey: string;
  requestId: string;
}): Promise<void> {
  if ((Deno.env.get("AGRIO_CREDIT_TELEMETRY_ENABLED") ?? "false") !== "true") return;
  const threshold = Math.max(
    1,
    Number.parseInt(Deno.env.get("AGRIO_LOW_CREDIT_THRESHOLD") ?? "100", 10) || 100,
  );
  try {
    const response = await fetchWithTimeout(
      `${AGRIO_BASE}/get-credit?key=${encodeURIComponent(options.apiKey)}`,
      { method: "GET" },
      5_000,
    );
    if (!response.ok) throw new Error(`agrio_credit_api_${response.status}`);
    const payload = await readBoundedJson(response, 32 * 1024) as Record<string, unknown>;
    const credits = Number(payload?.numCredits);
    if (!Number.isFinite(credits)) throw new Error("agrio_credit_invalid_payload");
    if (credits <= threshold) {
      await captureMessage("Agrio credit balance is below the configured threshold", {
        level: "warning",
        tags: {
          fn: "diagnose",
          step: "agrio_credit_balance",
          balance_band: credits <= 0 ? "empty" : "low",
        },
        extra: { requestId: options.requestId },
      });
    }
  } catch {
    await captureException(new Error("agrio_credit_telemetry_failed"), {
      level: "warning",
      tags: { fn: "diagnose", step: "agrio_credit_telemetry" },
      extra: { requestId: options.requestId },
    });
  }
}

/**
 * English-label → PT/scientific bridge for high-value generic Agrio labels
 * whose `scientificName` comes back null. Keyed by Agrio crop (English) then by
 * lower-cased Agrio `id`/`commonName`. Scientific name is what the client MIP
 * matcher joins on (`useMipKnowledge` pushes scientific_name as a strong hit),
 * so mapping the label → the correct scientific name lights up the full
 * catalog laudo. Seeded ONLY with entries confirmed against the KB — never
 * invent a label/mapping; unmapped labels are logged and completed from traffic.
 */
type KbHint = {
  name_pt: string;
  scientific_name: string;
  category?: string;
  severity?: "critical" | "high" | "medium" | "low";
};

/**
 * Version stamp of AGRIO_LABEL_MAP, persisted into every diagnosis row
 * (`notes.ai_meta.label_map_version`) so mapping drift is traceable per row
 * (doc 08 §3(b) — IMPL-3). BUMP this constant on ANY change to
 * AGRIO_LABEL_MAP, and keep it in sync with the legacy `diagnose/agrio.ts`
 * twin (a deno test locks the two maps + versions together).
 */
export const AGRIO_LABEL_MAP_VERSION = "2026-07-19.1";

export const AGRIO_LABEL_MAP: Record<string, Record<string, KbHint>> = {
  Coffee: {
    rust: {
      name_pt: "Ferrugem do cafeeiro",
      scientific_name: "Hemileia vastatrix",
      category: "fungo",
      severity: "high",
    },
  },
  Soybean: {
    rust: {
      name_pt: "Ferrugem asiática da soja",
      scientific_name: "Phakopsora pachyrhizi",
      category: "fungo",
      severity: "high",
    },
  },
  Wheat: {
    rust: {
      name_pt: "Ferrugem da folha do trigo",
      scientific_name: "Puccinia triticina",
      category: "fungo",
      severity: "high",
    },
  },
  Corn: {
    rust: {
      name_pt: "Ferrugem polissora do milho",
      scientific_name: "Puccinia polysora",
      category: "fungo",
      severity: "medium",
    },
    // Verified live 2026-07-06 (Agrio id "FallArmyWorm", sci "Spodoptera
    // frugiperda"). Corn armyworm is the dominant real query for this app, so
    // pin the PT headline (Agrio returns the English "Fall armyworm") — the
    // scientific name already resolves the catalog on its own.
    fallarmyworm: {
      name_pt: "Lagarta-do-cartucho",
      scientific_name: "Spodoptera frugiperda",
      category: "inseto",
      severity: "high",
    },
  },
};

function hintFor(cropEn: string, p: AgrioPredictionRaw): KbHint | undefined {
  const forCrop = AGRIO_LABEL_MAP[cropEn];
  if (!forCrop) return undefined;
  return (
    forCrop[String(p.id ?? "").toLowerCase()] ??
      forCrop[String(p.commonName ?? "").toLowerCase()]
  );
}

/**
 * Adapt an Agrio `/diagnose` response into the SAME `diagnosisData` shape the
 * Claude path produced (`pest_id`, `pest_name`, `confidence`, `crop`,
 * `crop_confidence`, `predictions[]`, `enrichment`). The downstream persistence,
 * sanitization, invalid-image threshold, disclaimer and Sentry code in index.ts
 * is thereby reused verbatim — no behavior change past this seam.
 *
 * Laudo policy (Option B): `enrichment` carries only name_pt + scientific_name
 * (+ severity when known). The rich free-text sections (symptoms/treatments) are
 * intentionally empty — the client renders the structured MIP protocol from the
 * bundled catalog. `result.tsx` already degrades those sections to "no info".
 */
export function adaptAgrio(
  raw: AgrioDiagnoseRaw,
  ctx: { cropApiName?: string | undefined; requestId: string },
): Record<string, unknown> {
  const cropEn = String(raw.crop || ctx.cropApiName || "");
  const cropConfidence = typeof raw.cropConfidence === "string"
    ? parseFloat(raw.cropConfidence) || 0
    : typeof raw.cropConfidence === "number"
    ? raw.cropConfidence
    : 0;

  const arr = (Array.isArray(raw.idArray) ? raw.idArray : [])
    .filter((p) => p && (p.commonName || p.id))
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));

  const top = arr[0];

  // ── Healthy / empty → mirror the Claude path's "Healthy" contract ──
  const topId = String(top?.id ?? "").toLowerCase();
  const topCommon = String(top?.commonName ?? "").toLowerCase();
  const isHealthy = topId === "healthy" ||
    topId === "healthyplant" ||
    topCommon === "healthy" ||
    topCommon === "healthy plant";

  if (!top || isHealthy) {
    return {
      pest_id: "Healthy",
      pest_name: "Healthy",
      confidence: top?.confidence ?? cropConfidence,
      crop: cropEn,
      crop_confidence: cropConfidence,
      predictions: [],
      enrichment: { severity: "none" },
    };
  }

  const predictions = arr.map((p) => {
    const hint = hintFor(cropEn, p);
    return {
      id: String(p.id ?? p.commonName ?? "unknown"),
      confidence: p.confidence ?? 0,
      // Prefer the PT name from the bridge; else Agrio's (English) commonName.
      common_name: hint?.name_pt || p.commonName || p.id,
      scientific_name: p.scientificName || hint?.scientific_name || undefined,
      category: hint?.category,
    };
  });

  const topHint = hintFor(cropEn, top);
  const topScientific = top.scientificName || topHint?.scientific_name || undefined;
  const pestNamePt = topHint?.name_pt || top.commonName || top.id || "Praga identificada";

  // Coverage telemetry intentionally excludes exact crop/pest labels. Those
  // values can reveal a producer's operation and are not needed for alerting.
  if (!top.scientificName && !topHint) {
    captureMessage("Agrio returned an unmapped label", {
      level: "info",
      tags: { fn: "diagnose", step: "agrio_label_unmapped" },
    }).catch(() => {});
  }

  return {
    pest_id: String(top.id ?? "unknown"),
    pest_name: pestNamePt,
    confidence: top.confidence ?? 0,
    crop: cropEn,
    crop_confidence: cropConfidence,
    // A short PT summary; the UI mainly uses enrichment.name_pt / pest_name.
    message: `Identificação: ${pestNamePt}.`,
    predictions,
    enrichment: {
      name_pt: topHint?.name_pt,
      scientific_name: topScientific,
      severity: topHint?.severity,
      // Free-text laudo intentionally omitted — resolved client-side from the
      // bundled MIP catalog (useMipKnowledge). See file header.
    },
  };
}
