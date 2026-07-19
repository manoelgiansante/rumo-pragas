// IMPL-3 T1 (doc 08 §3(b)) — AI versioning stamp per diagnosis.
// Locks: (1) the AGRIO_LABEL_MAP twins (dedicated `diagnose-pragas` × legacy
// `diagnose`) never diverge in content or version stamp; (2) every persisted
// diagnosis carries a complete `notes.ai_meta` block; (3) the HTTP response to
// the client stays ai_meta-free (client contract intact).
import { assert, assertEquals, assertMatch, assertStringIncludes } from "@std/assert";
import {
  AGRIO_LABEL_MAP as dedicatedMap,
  AGRIO_LABEL_MAP_VERSION as dedicatedMapVersion,
} from "../diagnose-pragas/agrio.ts";
import {
  AGRIO_LABEL_MAP as legacyMap,
  AGRIO_LABEL_MAP_VERSION as legacyMapVersion,
} from "../diagnose/agrio.ts";

const dedicatedIndex = await Deno.readTextFile(
  new URL("../diagnose-pragas/index.ts", import.meta.url),
);
const legacyIndex = await Deno.readTextFile(new URL("../diagnose/index.ts", import.meta.url));

const AI_META_KEYS = [
  "provider",
  "model",
  "prompt_version",
  "label_map_version",
  "fn_version",
  "fn_slug",
  "timestamp",
];

Deno.test("AGRIO_LABEL_MAP twins share the same content and version stamp", () => {
  assertEquals(dedicatedMap, legacyMap);
  assertEquals(dedicatedMapVersion, legacyMapVersion);
  assertMatch(dedicatedMapVersion, /^\d{4}-\d{2}-\d{2}\.\d+$/);
});

const slugs = [
  ["diagnose-pragas", dedicatedIndex],
  ["diagnose", legacyIndex],
] as const;

for (const [slug, source] of slugs) {
  Deno.test(`${slug}: DIAGNOSE_PROMPT_VERSION constant is stamped and versioned`, () => {
    const match = source.match(/export const DIAGNOSE_PROMPT_VERSION = "([^"]+)";/);
    assert(match, "DIAGNOSE_PROMPT_VERSION constant missing");
    assertMatch(match[1], /^\d{4}-\d{2}-\d{2}\.\d+/);
  });

  Deno.test(`${slug}: persisted insert carries the full ai_meta block`, () => {
    const aiMetaBlock = source.match(/const ai_meta = \{([\s\S]*?)\};/);
    assert(aiMetaBlock, "ai_meta object literal missing");
    for (const key of AI_META_KEYS) {
      assertStringIncludes(aiMetaBlock[1], `${key}:`, `ai_meta.${key} missing in ${slug}`);
    }
    // provider is constrained to the 'agrio' | 'claude' contract.
    assertStringIncludes(aiMetaBlock[1], 'DIAGNOSE_PROVIDER === "agrio" ? "agrio" : "claude"');
    // The DB insert persists ai_meta INSIDE the existing notes JSON (no migration).
    assertStringIncludes(source, "notes: JSON.stringify({ ...notes, ai_meta })");
  });

  Deno.test(`${slug}: 200 response re-serializes ai_meta-free notes (client contract)`, () => {
    assertStringIncludes(source, "notes: JSON.stringify(notes)");
  });
}

Deno.test("twin prompt versions track prompt equality (re-unified 2026-07-19.2)", () => {
  // 2026-07-19.2 re-unified the legacy slug with the dedicated triage-only,
  // NON-prescriptive prompt (CEO order 19/jul). The lock is bidirectional:
  // while the twins run the SAME prompt (system + user) they MUST stamp the
  // SAME version — diverging a prompt again without bumping its constant
  // breaks this test — and different prompts MUST stamp different versions.
  const dedicated = dedicatedIndex.match(/export const DIAGNOSE_PROMPT_VERSION = "([^"]+)";/)?.[1];
  const legacy = legacyIndex.match(/export const DIAGNOSE_PROMPT_VERSION = "([^"]+)";/)?.[1];
  assert(dedicated && legacy);
  const promptOf = (source: string): string => {
    const system = source.match(/const SYSTEM_PROMPT =\s*`([\s\S]*?)`;/)?.[1];
    const user = source.match(/const userPrompt =\s*`([\s\S]*?)`;/)?.[1];
    assert(system && user, "SYSTEM_PROMPT/userPrompt template literal missing");
    return `${system}\n---\n${user}`;
  };
  if (promptOf(dedicatedIndex) === promptOf(legacyIndex)) {
    assertEquals(
      dedicated,
      legacy,
      "twins run the SAME prompt but stamp different versions — unify the constants",
    );
  } else {
    assert(dedicated !== legacy, "twins run different prompts but stamp the same version");
  }
});
