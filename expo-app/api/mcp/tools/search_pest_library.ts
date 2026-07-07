import { z } from 'zod';
import { ToolHandler, ok, err } from '../_types';
import { searchByKeywords, MIP_CREA_DISCLAIMER } from '../../../data/mip';

// Schema drift fix (2026-07-06): there is NO `pest_library` table in jxcn
// (PostgREST hint: "Perhaps you meant public.ingredients_library" — that is the
// agrochemical active-ingredient table, not a pest species catalog). The app's
// real "pest library" is the MIP catalog bundled with the app under `data/mip/`
// (EMBRAPA/MAPA/IRAC/FRAC), searched locally via `searchByKeywords`. This tool
// now reads that same catalog — no network, no per-user data.

const InputSchema = z.object({
  query: z.string().min(1).max(100),
  // Optional crop filter — matches a crop id from the MIP catalog (e.g.
  // 'soja', 'milho', 'cana', 'cafe', 'algodao'). Non-matching → 0 results.
  culture: z.string().max(80).optional(),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

export const searchPestLibrary: ToolHandler = {
  name: 'search_pest_library',
  description:
    'Busca no catálogo público de pragas/doenças (MIP — EMBRAPA/MAPA/IRAC/FRAC) por nome, nome científico ou sintoma. Pode filtrar por cultura.',
  inputSchema: {
    type: 'object',
    required: ['query'],
    properties: {
      query: { type: 'string' },
      culture: { type: 'string' },
      limit: { type: 'number', default: 10 },
    },
  },
  // ctx is intentionally unused: the MIP catalog is bundled reference data with
  // no per-user rows, so there is nothing to scope by RLS. The endpoint itself
  // still requires a valid JWT (enforced in server.ts before the handler runs).
  async handler(input) {
    const parsed = InputSchema.safeParse(input);
    if (!parsed.success) return err(`Invalid input: ${parsed.error.message}`);
    const { query, culture, limit } = parsed.data;

    const results = searchByKeywords([query], { cultureFilter: culture, limit });

    const pests = results.map(({ entry, score }) => ({
      id: entry.id,
      name: entry.nomeComum,
      scientific_name: entry.nomeCientifico,
      alt_names: entry.nomesAlternativos,
      type: entry.type,
      category: entry.category,
      cultures: entry.culturas,
      description: entry.sintomas.descricao,
      symptom_keywords: entry.sintomas.palavrasChave,
      severity: entry.sintomas.severidadeVisual,
      control_methods: {
        cultural: entry.mip.cultural,
        biological: entry.mip.biologico,
        mechanical: entry.mip.mecanico,
        chemical_classes: entry.mip.quimico.classes,
      },
      sources: entry.referencias.map((r) => r.source),
      match_score: score,
    }));

    return ok({
      query,
      culture: culture ?? null,
      count: pests.length,
      pests,
      disclaimer: MIP_CREA_DISCLAIMER,
    });
  },
};
