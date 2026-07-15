import { assert, assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import {
  containsProhibitedPrescription,
  sanitizeAgronomicChatText,
  sanitizeDiagnosisOutput,
} from "../_shared/agronomic-safety.ts";

Deno.test("diagnosis sanitizer keeps identification fields and strips prescriptions recursively", () => {
  const result = sanitizeDiagnosisOutput({
    pest_id: "ferrugem",
    pest_name: "Ferrugem asiática",
    confidence: 0.91,
    message: "Sinais compatíveis com ferrugem. Aplique 2 L/ha de Produto X.",
    predictions: [{
      id: "rust",
      confidence: 0.91,
      common_name: "Ferrugem",
      scientific_name: "Phakopsora pachyrhizi",
      dosage: "2 L/ha",
    }],
    enrichment: {
      description: "Doença foliar.",
      symptoms: ["Pústulas na face inferior da folha."],
      chemical_treatment: ["glifosato 2 L/ha"],
      recommended_products: [{ name: "Produto X", active_ingredient: "Ingrediente Y" }],
      safety_period: "14 dias",
      prevention: ["Monitore a lavoura.", "Pulverize fungicida a cada 7 dias."],
    },
  });

  assertEquals(result.pest_id, "ferrugem");
  assertEquals(result.predictions?.[0]?.scientific_name, "Phakopsora pachyrhizi");
  assertFalse("chemical_treatment" in (result.enrichment ?? {}));
  assertFalse("recommended_products" in (result.enrichment ?? {}));
  assertFalse(containsProhibitedPrescription(JSON.stringify(result)));
});

Deno.test("chat sanitizer replaces any prescriptive completion with current legal guidance", () => {
  const result = sanitizeAgronomicChatText(
    "Use o produto comercial X com princípio ativo Y na dose de 2 L/ha e carência de 14 dias.",
  );

  assertFalse(containsProhibitedPrescription(result));
  assertStringIncludes(result, "Lei 14.785/2023");
  assertStringIncludes(result, "Resolução Confea nº 1.149/2025");
  assertStringIncludes(result, "AGROFIT");
});

Deno.test("chat sanitizer preserves non-prescriptive monitoring guidance", () => {
  const result = sanitizeAgronomicChatText(
    "Observe a face inferior das folhas e registre a evolução dos sintomas.",
  );
  assert(result.startsWith("Observe a face inferior"));
  assertFalse(containsProhibitedPrescription(result));
});

Deno.test("adversarial PT-BR prescriptive phrasing is blocked deterministically", () => {
  const unsafe = [
    "Use glifosato para resolver o problema.",
    "Utilize um defensivo agrícola.",
    "Empregue controle químico com Produto X.",
    "Recomendo pesticida no tratamento.",
    "Indico inseticida em aplicação foliar.",
    "Trate com agrotóxico e repita em sete dias.",
  ];
  const expected = sanitizeAgronomicChatText(unsafe[0]);
  for (const text of unsafe) {
    assert(containsProhibitedPrescription(text));
    assertEquals(sanitizeAgronomicChatText(text), expected);
  }
  assertStringIncludes(expected, "não constitui receituário agronômico");
});

Deno.test("adversarial English and Spanish prescriptions are blocked deterministically", () => {
  const unsafe = [
    "Apply an insecticide weekly.",
    "Use pesticide.",
    "Choose the active ingredient for chemical control.",
    "Respect the withholding period after treatment.",
    "Spray every 7 days.",
    "Use un insecticida cada semana.",
    "Seleccione el ingrediente activo para control quimico.",
    "Respete el periodo de carencia.",
    "Pulverice cada 7 dias.",
  ];
  for (const text of unsafe) {
    assert(containsProhibitedPrescription(text), text);
    const sanitized = sanitizeAgronomicChatText(text);
    assertFalse(sanitized.includes(text));
    assertFalse(containsProhibitedPrescription(sanitized));
  }
});

Deno.test("fragmented, leetspeak, zero-width and confusable prescriptions fail closed", () => {
  const unsafe = [
    "p.e.s.t.i.c.i.d.e",
    "p. e. s. t. i. c. i. d. e",
    "p3st1c1d3",
    "pesti\u200Bcide",
    "рesticide",
    "ingrediente-activo",
    "withholding.period",
  ];
  for (const text of unsafe) {
    assert(containsProhibitedPrescription(text), text);
    assertFalse(sanitizeAgronomicChatText(text).includes(text));
  }

  const diagnosis = sanitizeDiagnosisOutput({
    message: "p. e. s. t. i. c. i. d. e",
    enrichment: { monitoring: "Observe folhas sem prescrever produtos." },
  });
  assertEquals(diagnosis.message, undefined);
});

Deno.test("owned legal notice is not self-blocked but appended prescriptions are", () => {
  const safe = sanitizeAgronomicChatText("Observe e registre os sintomas.");
  assertFalse(containsProhibitedPrescription(safe));
  assert(containsProhibitedPrescription(`${safe} Apply an insecticide weekly.`));
});

Deno.test("diagnosis sanitizer never allowlists generated economic or action thresholds", () => {
  const result = sanitizeDiagnosisOutput({
    pest_id: "percevejo",
    message: "Sinais compatíveis; use defensivo.",
    enrichment: {
      economic_impact: "Perda de 20% ou 8 sacas/ha.",
      action_threshold: "Aja com 2 percevejos por pano.",
      recommended_products: ["Produto X"],
      active_ingredient: "glifosato",
      dosage: "2 L/ha",
      application_interval: "7 dias",
      monitoring: ["Observe semanalmente a população."],
    },
  });
  const enrichment = result.enrichment ?? {};
  for (
    const key of [
      "economic_impact",
      "action_threshold",
      "recommended_products",
      "active_ingredient",
      "dosage",
      "application_interval",
    ]
  ) {
    assertFalse(key in enrichment);
  }
  assertEquals(result.message, "Sinais compatíveis;");
  assertEquals(enrichment.monitoring, ["Observe semanalmente a população."]);
});
