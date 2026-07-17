/**
 * Catálogo MIP — Index agregado
 *
 * Re-exporta o catálogo completo agregando todas as culturas:
 *  - Soja (14 entradas) — ferrugem asiática + percevejos + lagartas
 *  - Milho (10 entradas) — lagarta-do-cartucho + cigarrinha + doenças
 *  - Cana (11 entradas) — broca + cigarrinha + carvão
 *  - Café (8 entradas) — broca + bicho-mineiro + ferrugem
 *  - Algodão (8 entradas) — bicudo + ramulária
 *  - Outras (7 entradas) — trigo (giberela/brusone), sorgo, pastagem, citros HLB
 *
 * Total: ~58+ entradas.
 *
 * Inclui helpers de busca (`searchByKeywords`) e recomendação
 * (`getRecommendation`) usados pela camada de IA / UI.
 */

import { ALGODAO_MIP_ENTRIES } from './algodao';
import { CAFE_MIP_ENTRIES } from './cafe';
import { CANA_MIP_ENTRIES } from './cana';
import { MILHO_MIP_ENTRIES } from './milho';
import { OUTRAS_MIP_ENTRIES } from './outras';
import { SOJA_MIP_ENTRIES } from './soja';
import type { InfestationLevel, MipEntry, MipRecommendation } from './types';

export * from './types';
export {
  ALGODAO_MIP_ENTRIES,
  CAFE_MIP_ENTRIES,
  CANA_MIP_ENTRIES,
  MILHO_MIP_ENTRIES,
  OUTRAS_MIP_ENTRIES,
  SOJA_MIP_ENTRIES,
};

/**
 * Catálogo MIP completo, agregado.
 * Cada arquivo por cultura exporta um array; aqui consolidamos.
 */
export const MIP_CATALOG: MipEntry[] = [
  ...SOJA_MIP_ENTRIES,
  ...MILHO_MIP_ENTRIES,
  ...CANA_MIP_ENTRIES,
  ...CAFE_MIP_ENTRIES,
  ...ALGODAO_MIP_ENTRIES,
  ...OUTRAS_MIP_ENTRIES,
];

/**
 * Disclaimer agronômico obrigatório (exigido pelo app por
 * compliance CREA — Conselho Regional de Engenharia e Agronomia).
 */
export const MIP_CREA_DISCLAIMER =
  'Conteúdo educativo: não substitui avaliação de campo nem receituário agronômico. ' +
  'A indicação e o uso de produtos devem cumprir a Lei 14.785/2023 e a Resolução ' +
  'Confea 1.149/2025, com responsabilidade técnica de profissional habilitado. ' +
  'Consulte o registro oficial no AGROFIT antes de qualquer aplicação.';

// ============================================================
// HELPERS — Lookup e busca
// ============================================================

/** Normaliza string para matching: lowercase + sem acentos. */
function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); // remove combining diacritical marks
}

/** Retorna entrada pelo `id` (slug), ou undefined. */
export function getEntryById(id: string): MipEntry | undefined {
  return MIP_CATALOG.find((e) => e.id === id);
}

/** Retorna todas as entradas de uma cultura. */
export function getEntriesByCulture(cultureId: string): MipEntry[] {
  return MIP_CATALOG.filter((e) => e.culturas.includes(cultureId));
}

/** Retorna todas as entradas de um tipo (praga | doença). */
export function getEntriesByType(type: MipEntry['type']): MipEntry[] {
  return MIP_CATALOG.filter((e) => e.type === type);
}

/**
 * Busca por palavras-chave de sintomas — heurística simples sem NLP.
 *
 * Usado pela camada de IA para sugerir candidatos com base em
 * descrições do produtor ("vi pústulas marrons na folha", "milho amarelando",
 * "lagarta com listras"). Não tenta ser perfeita — só ranqueia candidatos
 * para o usuário escolher.
 *
 * Algoritmo:
 *  - Normaliza queries (lowercase, sem acentos)
 *  - Para cada entry, conta quantas keywords da query batem em:
 *      - `nomeComum`, `nomesAlternativos`, `nomeCientifico`
 *      - `sintomas.descricao`, `sintomas.palavrasChave`
 *  - Retorna ordenado por score (maior primeiro), só com score > 0.
 *  - Empate desempata por severidade (alta > media > baixa).
 *
 * @param keywords lista de termos extraídos da descrição do usuário
 * @param options.cultureFilter limita por cultura (ex: 'soja')
 * @param options.limit máx de resultados (default 10)
 */
export function searchByKeywords(
  keywords: string[],
  options: { cultureFilter?: string | undefined; limit?: number | undefined } = {},
): Array<{ entry: MipEntry; score: number }> {
  const { cultureFilter, limit = 10 } = options;
  if (!keywords || keywords.length === 0) return [];

  // Cada keyword pode ser uma frase ("cartucho perfurado milho"). Buscamos
  // tanto a frase inteira quanto cada palavra dela isoladamente (>= 3 chars)
  // para tolerar variações na forma como o usuário descreve.
  const phrases = keywords.map((k) => normalize(k.trim())).filter((k) => k.length >= 2);

  if (phrases.length === 0) return [];

  const tokens: string[] = [];
  for (const phrase of phrases) {
    tokens.push(phrase);
    const words = phrase.split(/\s+/).filter((w) => w.length >= 3);
    for (const w of words) {
      if (!tokens.includes(w)) tokens.push(w);
    }
  }

  const pool = cultureFilter ? getEntriesByCulture(cultureFilter) : MIP_CATALOG;

  const scored = pool
    .map((entry) => {
      const searchableText = normalize(
        [
          entry.nomeComum,
          ...entry.nomesAlternativos,
          entry.nomeCientifico,
          entry.sintomas.descricao,
          ...entry.sintomas.palavrasChave,
          ...entry.sintomas.estagioAcometido,
        ].join(' | '),
      );

      let score = 0;
      for (const token of tokens) {
        if (searchableText.includes(token)) {
          // Bonus se bater no nome comum / científico / palavras-chave (matching forte)
          const strongHit = entry.sintomas.palavrasChave.some((k) => normalize(k).includes(token));
          // Frase completa (multi-palavra) vale mais que token isolado
          const isPhrase = token.includes(' ');
          score += strongHit ? (isPhrase ? 4 : 2) : isPhrase ? 2 : 1;
        }
      }

      return { entry, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Empate: severidade alta primeiro
      const sevWeight = { alta: 3, media: 2, baixa: 1 } as const;
      return (
        sevWeight[b.entry.sintomas.severidadeVisual] - sevWeight[a.entry.sintomas.severidadeVisual]
      );
    })
    .slice(0, limit);

  return scored;
}

/**
 * Gera recomendação consolidada para um entry + nível de infestação.
 *
 * Retorna somente manejo cultural/biológico e monitoramento. Orientação de
 * produtos permanece exclusivamente no AGROFIT e com profissional habilitado.
 */
export function getRecommendation(
  entryId: string,
  infestationLevel: InfestationLevel,
): MipRecommendation | undefined {
  const entry = getEntryById(entryId);
  if (!entry) return undefined;

  return {
    entryId: entry.id,
    nomeComum: entry.nomeComum,
    infestationLevel,
    acoesCulturais: entry.mip.cultural,
    acoesBiologicas: entry.mip.biologico,
    monitoramento: entry.monitoramento,
  };
}

/**
 * Lista todas as culturas cobertas pelo catálogo (IDs únicos
 * encontrados em todas as entries).
 */
export function getCoveredCultures(): string[] {
  const set = new Set<string>();
  for (const e of MIP_CATALOG) {
    for (const c of e.culturas) set.add(c);
  }
  return Array.from(set).sort();
}

/** Estatísticas rápidas do catálogo (útil em debug / dashboard). */
export function getCatalogStats(): {
  total: number;
  byType: Record<MipEntry['type'], number>;
  byCategory: Record<MipEntry['category'], number>;
  byCulture: Record<string, number>;
} {
  const byType: Record<MipEntry['type'], number> = {
    praga: 0,
    doenca: 0,
  };
  const byCategory: Record<MipEntry['category'], number> = {
    inseto: 0,
    acaro: 0,
    nematoide: 0,
    fungo: 0,
    bacteria: 0,
    virus: 0,
  };
  const byCulture: Record<string, number> = {};

  for (const e of MIP_CATALOG) {
    byType[e.type] += 1;
    byCategory[e.category] += 1;
    for (const c of e.culturas) {
      byCulture[c] = (byCulture[c] ?? 0) + 1;
    }
  }

  return { total: MIP_CATALOG.length, byType, byCategory, byCulture };
}
