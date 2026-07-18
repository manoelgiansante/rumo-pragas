const MAX_TEXT_LENGTH = 8_000;

export const AGRONOMIC_LEGAL_NOTICE =
  "Este conteúdo é apenas informativo e não constitui receituário agronômico. " +
  "Para decisões sobre escolha ou uso de agrotóxicos — incluindo produto, dose, mistura e " +
  "aplicação — a Lei 14.785/2023 e a Resolução Confea nº 1.149/2025 exigem avaliação por " +
  "profissional legalmente habilitado e receituário agronômico. Consulte o AGROFIT e siga " +
  "o receituário emitido pelo profissional responsável.";

const AGRONOMIC_REFUSAL_PREFIX =
  "Não posso fornecer uma orientação prescritiva de uso de defensivos agrícolas.";

const PROHIBITED_PATTERNS: RegExp[] = [
  /\b(?:produto(?:s)?|nome\s+comercial)\b/iu,
  /\b(?:principio|ingrediente)\s+ativ[oa]s?\b/iu,
  /\b(?:commercial\s+(?:product|name)s?|active\s+ingredients?)\b/iu,
  /\b(?:productos?\s+comerciales?|nombres?\s+comerciales?|ingredientes?\s+activ[oa]s?)\b/iu,
  /\b(?:dose|dosagem|calda|adjuvantes?)\b/iu,
  /\b(?:dosage|dose|spray\s+volume|tank\s+mix|adjuvants?)\b/iu,
  /\b(?:dosis|volumen\s+de\s+caldo|mezcla\s+de\s+tanque|coadyuvantes?)\b/iu,
  /\b(?:intervalo\s+(?:entre\s+)?aplicacoes?|frequencia\s+de\s+aplicacao)\b/iu,
  /\b(?:application|spray)\s+(?:interval|frequency)\b/iu,
  /\b(?:apply|spray)\s+(?:again\s+)?every\s+\d+\s*(?:days?|weeks?)\b/iu,
  /\b(?:intervalo\s+entre\s+aplicaciones|frecuencia\s+de\s+aplicacion)\b/iu,
  /\b(?:aplique|pulverice|rocie)\s+(?:de\s+nuevo\s+)?cada\s+\d+\s*(?:dias?|semanas?)\b/iu,
  /\b(?:periodo\s+de\s+carencia|carencia|classe\s+toxicologica)\b/iu,
  /\b(?:withholding\s+period|pre[- ]harvest\s+interval|restricted[- ]entry\s+interval|toxicological\s+class)\b/iu,
  /\b(?:periodo\s+de\s+carencia|plazo\s+de\s+seguridad|intervalo\s+de\s+reingreso|clase\s+toxicologica)\b/iu,
  /\b\d+(?:[.,]\d+)?\s*(?:ml|l|g|kg)\s*\/?\s*(?:ha|hectare)\b/iu,
  /\b\d+(?:[.,]\d+)?\s*(?:ppm|mg\/l|g\/l|ml\/l)\b/iu,
  /\b(?:apli(?:que|car|cado|cada)|pulveriz(?:e|ar|acao|ado|ada)|mistur(?:e|ar)|use|usar|utiliz(?:e|ar)|empreg(?:ue|ar)|trat(?:e|ar|amento))\b/iu,
  /\b(?:apply|spray|mix|treat|treatment|use|using)\b/iu,
  /\b(?:apli(?:que|car)|pulveri(?:ce|zar)|roci(?:e|ar)|mezcl(?:e|ar)|use|usar|utili(?:ce|zar)|trat(?:e|ar|amiento))\b/iu,
  /\b(?:recomend(?:o|a|e|amos|am|ado|ada|ados|adas)|indic(?:o|a|e|amos|am|ado|ada|ados|adas))\b/iu,
  /\b(?:recommend(?:ed|ation)?|we\s+recommend|should\s+(?:apply|spray|use)|must\s+(?:apply|spray|use))\b/iu,
  /\b(?:recomiendo|recomendad[oa]s?|se\s+recomienda|debe\s+(?:aplicar|pulverizar|rociar|usar))\b/iu,
  /\b(?:recomenda-se|e\s+indicad[oa]|deve(?:-se)?\s+(?:aplicar|pulverizar|usar|utilizar)|faca\s+(?:a\s+)?aplicacao|realize\s+(?:a\s+)?pulverizacao)\b/iu,
  /\b(?:tratamento\s+com|controle\s+quimic[oa]|manejo\s+quimic[oa])\b/iu,
  /\b(?:chemical\s+(?:treatment|control|management)|treatment\s+with)\b/iu,
  /\b(?:tratamiento\s+con|control\s+quimic[oa]|manejo\s+quimic[oa])\b/iu,
  /\b(?:defensiv[oa]s?|agrotoxic[oa]s?|pesticidas?)\b/iu,
  /\b(?:pesticides?|crop\s+protection\s+(?:product|chemical)s?)\b/iu,
  /\b(?:plaguicidas?|fitosanitarios?|agroquimicos?)\b/iu,
  /\b(?:inseticida|fungicida|herbicida|acaricida|nematicida|seletiv[oa]|sistemic[oa])\b/iu,
  /\b(?:insecticides?|fungicides?|herbicides?|acaricides?|nematicides?|selective|systemic)\b/iu,
  /\b(?:insecticidas?|fungicidas?|herbicidas?|acaricidas?|nematicidas?|selectiv[oa]s?|sistemic[oa]s?)\b/iu,
  /\b(?:glifosato|glyphosate|atrazina|fipronil|acefato|imidacloprido|carbendazim|mancozebe)\b/iu,
];

const COMPACT_PROHIBITED_PATTERNS = [
  /(?:glifosato|glyphosate|atrazina|fipronil|acefato|imidacloprido|carbendazim|mancozebe)/u,
  /(?:controlequimico|manejoquimico|tratamentocom|chemicalcontrol|chemicaltreatment|treatmentwith|controlquimico|tratamientocon)/u,
  /(?:activeingredient|commercialproduct|withholdingperiod|preharvestinterval|ingredienteactivo|periododecarencia|plazodeseguridad)/u,
  /(?:apply|spray|recommend|shouldapply|shouldspray|aplique|pulverice|rocie|recomiendo|debeaplicar)/u,
  /(?:inseticida|insecticide|fungicida|fungicide|herbicida|herbicide|acaricida|acaricide|nematicida|nematicide|agrotoxico|pesticida|pesticide|plaguicida)/u,
];

const SAFE_ENRICHMENT_KEYS = new Set([
  "name_pt",
  "scientific_name",
  "description",
  "causes",
  "symptoms",
  "cultural_treatment",
  "prevention",
  "severity",
  "lifecycle",
  "monitoring",
  "favorable_conditions",
  "related_pests",
  "mip_strategy",
]);

const SAFE_PREDICTION_KEYS = new Set([
  "id",
  "confidence",
  "common_name",
  "scientific_name",
  "category",
  "type",
]);

export interface SafeDiagnosisOutput {
  pest_id?: string;
  pest_name?: string;
  confidence?: number;
  message?: string;
  crop?: string;
  crop_confidence?: number;
  damage_stage?: "initial" | "intermediate" | "advanced";
  predictions?: Array<Record<string, string | number>>;
  enrichment?: Record<string, unknown>;
}

function normalizeForPrescriptionInspection(value: string): { readable: string; compact: string } {
  const readable = value
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/gu, "")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .trim();
  const deobfuscated = readable
    .replace(/0/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/3/g, "e")
    .replace(/4|@/g, "a")
    .replace(/5|\$/g, "s")
    .replace(/7/g, "t")
    // Common cross-script lookalikes used to bypass keyword filters.
    .replace(/[аɑα]/gu, "a")
    .replace(/[сϲ]/gu, "c")
    .replace(/[ԁ]/gu, "d")
    .replace(/[еε]/gu, "e")
    .replace(/[іɩι]/gu, "i")
    .replace(/[ո]/gu, "n")
    .replace(/[оο]/gu, "o")
    .replace(/[рρ]/gu, "p")
    .replace(/[ѕ]/gu, "s")
    .replace(/[тτ]/gu, "t")
    .replace(/[υ]/gu, "u")
    .replace(/[у]/gu, "y");
  return { readable, compact: deobfuscated.replace(/[^\p{L}\p{N}]+/gu, "") };
}

export function containsProhibitedPrescription(value: string): boolean {
  // The deterministic guardrail text names regulated concepts only to refuse
  // them. Remove those two exact, application-owned strings before inspecting
  // any provider/user content that remains; appended prescriptions are still
  // detected normally.
  const content = value
    .replaceAll(AGRONOMIC_LEGAL_NOTICE, "")
    .replaceAll(AGRONOMIC_REFUSAL_PREFIX, "");
  const normalized = normalizeForPrescriptionInspection(content);
  return PROHIBITED_PATTERNS.some((pattern) => pattern.test(normalized.readable)) ||
    COMPACT_PROHIBITED_PATTERNS.some((pattern) => pattern.test(normalized.compact));
}

function cleanScalar(value: unknown, maxLength = MAX_TEXT_LENGTH): string {
  if (typeof value !== "string") return "";
  const withoutControlCharacters = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    const isUnsafeControl = (codePoint >= 0 && codePoint <= 8) ||
      codePoint === 11 || codePoint === 12 ||
      (codePoint >= 14 && codePoint <= 31) || codePoint === 127;
    return isUnsafeControl ? " " : character;
  }).join("");
  return withoutControlCharacters
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function stripUnsafeSentences(value: unknown, maxLength = MAX_TEXT_LENGTH): string {
  const cleaned = cleanScalar(value, maxLength);
  if (!cleaned) return "";

  const sentences = cleaned.split(/(?<=[.!?;])\s+|\n+/u);
  const safeSentences = sentences
    .filter((sentence) => !containsProhibitedPrescription(sentence));
  // A prescription fragmented across punctuation/whitespace can evade
  // sentence-local inspection even though the compact whole-value check sees
  // it. In that case fail closed instead of reassembling the fragments.
  if (safeSentences.length === sentences.length && containsProhibitedPrescription(cleaned)) {
    return "";
  }
  return safeSentences
    .join(" ")
    .trim()
    .slice(0, maxLength);
}

function cleanIdentifier(value: unknown, maxLength = 120): string {
  return cleanScalar(value, maxLength).replace(/[^\p{L}\p{N}_.\- ]/gu, "").trim();
}

function clampConfidence(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(1, Math.max(0, value));
}

function sanitizeSafeValue(value: unknown): unknown {
  if (typeof value === "string") return stripUnsafeSentences(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value
      .slice(0, 30)
      .map(sanitizeSafeValue)
      .filter((item) => item !== "" && item !== null && item !== undefined);
  }
  return undefined;
}

export function sanitizeDiagnosisOutput(input: unknown): SafeDiagnosisOutput {
  const source = typeof input === "object" && input !== null && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const result: SafeDiagnosisOutput = {};

  const pestId = cleanIdentifier(source.pest_id, 100);
  const pestName = stripUnsafeSentences(source.pest_name, 200);
  const message = stripUnsafeSentences(source.message, 1_000);
  const crop = cleanIdentifier(source.crop, 100);
  if (pestId) result.pest_id = pestId;
  if (pestName) result.pest_name = pestName;
  if (message) result.message = message;
  if (crop) result.crop = crop;

  const confidence = clampConfidence(source.confidence);
  const cropConfidence = clampConfidence(source.crop_confidence);
  if (confidence !== undefined) result.confidence = confidence;
  if (cropConfidence !== undefined) result.crop_confidence = cropConfidence;

  if (["initial", "intermediate", "advanced"].includes(String(source.damage_stage))) {
    result.damage_stage = source.damage_stage as SafeDiagnosisOutput["damage_stage"];
  }

  if (Array.isArray(source.predictions)) {
    result.predictions = source.predictions.slice(0, 10).flatMap((prediction) => {
      if (typeof prediction !== "object" || prediction === null || Array.isArray(prediction)) {
        return [];
      }
      const safe: Record<string, string | number> = {};
      for (const [key, value] of Object.entries(prediction)) {
        if (!SAFE_PREDICTION_KEYS.has(key)) continue;
        if (key === "confidence") {
          const parsed = clampConfidence(value);
          if (parsed !== undefined) safe[key] = parsed;
          continue;
        }
        const text = key === "id" ? cleanIdentifier(value) : stripUnsafeSentences(value, 250);
        if (text) safe[key] = text;
      }
      return Object.keys(safe).length > 0 ? [safe] : [];
    });
  }

  if (typeof source.enrichment === "object" && source.enrichment !== null) {
    const enrichment: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source.enrichment as Record<string, unknown>)) {
      if (!SAFE_ENRICHMENT_KEYS.has(key)) continue;
      const safe = sanitizeSafeValue(value);
      if (safe !== "" && safe !== undefined && (!Array.isArray(safe) || safe.length > 0)) {
        enrichment[key] = safe;
      }
    }
    result.enrichment = enrichment;
  }

  return result;
}

export function sanitizeAgronomicChatText(value: unknown): string {
  const cleaned = cleanScalar(value);
  if (!cleaned || containsProhibitedPrescription(cleaned)) {
    return `${AGRONOMIC_REFUSAL_PREFIX} ${AGRONOMIC_LEGAL_NOTICE}`;
  }
  return `${cleaned}\n\n${AGRONOMIC_LEGAL_NOTICE}`;
}
