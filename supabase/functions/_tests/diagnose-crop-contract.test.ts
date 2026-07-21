// 2026-07-21 — crop contract + label map coverage for BOTH diagnose twins.
//
// (1) CROP CONTRACT: the deployed clients' parseDiagnosisRow (1.0.11 iOS
//     public + 1.0.12 in Apple review — identical validator, verified via
//     `git show 662477b`/`819b105`) rejects any row whose top-level `crop` is
//     not a 1..80-char string, and fetchDiagnoses drops the WHOLE Histórico
//     list when a single row fails. The server therefore must NEVER emit or
//     persist crop === "" — including (especially) the invalid_image path.
//     The invalid-image UI in every shipped binary keys off
//     pest_id === "invalid_image", never off crop, so persisting the
//     requested/fallback cropId is safe.
// (2) LABEL MAP: Agrio's generic "FungalDisease" label on Grape reached 26
//     real users in English (Sentry RUMO-PRAGAS-10; RUMO-PRAGAS-18 is the
//     label-less twin signal). The map now translates it to PT without
//     inventing a scientific name.
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  adaptAgrio as adaptAgrioDedicated,
  AGRIO_LABEL_MAP as dedicatedMap,
} from "../diagnose-pragas/agrio.ts";
import { adaptAgrio as adaptAgrioLegacy, AGRIO_LABEL_MAP as legacyMap } from "../diagnose/agrio.ts";

const dedicatedIndex = await Deno.readTextFile(
  new URL("../diagnose-pragas/index.ts", import.meta.url),
);
const legacyIndex = await Deno.readTextFile(new URL("../diagnose/index.ts", import.meta.url));

// ── Replica of the deployed clients' validator gate (expo-app/services/
// diagnosis.ts parseDiagnosisRow, identical at tags 662477b + 819b105 + main).
// Kept minimal on purpose: it locks exactly the fields the server controls.
function clientAcceptsRow(row: Record<string, unknown>): boolean {
  if (
    typeof row.id !== "string" ||
    row.id.length < 1 ||
    row.id.length > 128 ||
    typeof row.crop !== "string" ||
    row.crop.length < 1 ||
    row.crop.length > 80 ||
    typeof row.created_at !== "string" ||
    !Number.isFinite(Date.parse(row.created_at))
  ) {
    return false;
  }
  for (const key of ["pest_id", "pest_name", "image_url", "notes"]) {
    const v = row[key];
    if (v !== undefined && v !== null && typeof v !== "string") return false;
  }
  const c = row.confidence;
  if (
    c !== undefined && c !== null &&
    (typeof c !== "number" || !Number.isFinite(c) || c < 0 || c > 1)
  ) {
    return false;
  }
  return true;
}

Deno.test("client validator replica: crop '' is rejected, 'outro' accepted (why this contract exists)", () => {
  const base = {
    id: "71e3875f-3240-487d-a4fa-884d92e1e688",
    pest_id: "invalid_image",
    pest_name: "Imagem nao clara o suficiente",
    confidence: 0,
    notes: JSON.stringify({ message: "x", crop: "", predictions: [] }),
    created_at: "2026-07-01T07:18:17.515206+00:00",
  };
  assertEquals(clientAcceptsRow({ ...base, crop: "" }), false);
  assertEquals(clientAcceptsRow({ ...base, crop: "outro" }), true);
  assertEquals(clientAcceptsRow({ ...base, crop: "soja" }), true);
  assertEquals(clientAcceptsRow({ ...base, crop: "x".repeat(81) }), false);
  assertEquals(clientAcceptsRow({ ...base, crop: "x".repeat(80) }), true);
});

for (
  const [slug, source] of [
    ["diagnose-pragas", dedicatedIndex],
    ["diagnose", legacyIndex],
  ] as const
) {
  Deno.test(`${slug}: INSERT never persists an empty crop (invalid_image included)`, () => {
    // The fixed insert uses the always-non-empty cropId for every row.
    assertStringIncludes(source, "crop: cropId,");
    // The bug shape (empty crop on invalid_image) must never come back.
    assert(
      !source.includes('crop: isInvalidImage ? "" : cropId'),
      `${slug}: invalid_image rows must not persist crop=""`,
    );
    // cropId is clamped to the client's 80-char upper bound.
    assertStringIncludes(source, ".slice(0, 80)");
    // "outro" fallback keeps cropId non-empty in every branch.
    assertStringIncludes(source, '"outro"');
  });

  Deno.test(`${slug}: 200 response and INSERT stay coherent (response spreads the saved row)`, () => {
    assertStringIncludes(source, "...saved");
  });
}

// ── Label map: Grape / FungalDisease (Sentry RUMO-PRAGAS-10, 26 users) ──
const AGRIO_FUNGAL_RAW = {
  message: "success!",
  crop: "Grape",
  cropConfidence: "0.91",
  idArray: [
    {
      id: "FungalDisease",
      confidence: 0.86,
      commonName: "Fungal disease",
      scientificName: null,
    },
  ],
};

for (
  const [name, adapt, map] of [
    ["diagnose-pragas", adaptAgrioDedicated, dedicatedMap],
    ["diagnose", adaptAgrioLegacy, legacyMap],
  ] as const
) {
  Deno.test(`${name}: Grape/FungalDisease resolves to PT label without invented science`, () => {
    const grape = map.Grape;
    assert(grape, "Grape crop entry missing from AGRIO_LABEL_MAP");
    assertEquals(grape.fungaldisease?.name_pt, "Doença fúngica");
    // Label translation only — a generic fungal call has no single scientific
    // name; inventing one would fabricate a diagnosis.
    assertEquals(grape.fungaldisease?.scientific_name, undefined);

    const adapted = adapt(AGRIO_FUNGAL_RAW, { requestId: "test" });
    assertEquals(adapted.pest_name, "Doença fúngica");
    const enrichment = adapted.enrichment as Record<string, unknown>;
    assertEquals(enrichment.name_pt, "Doença fúngica");
    assertEquals(enrichment.scientific_name, undefined);
    const predictions = adapted.predictions as Array<Record<string, unknown>>;
    assertEquals(predictions[0]?.common_name, "Doença fúngica");
  });
}
