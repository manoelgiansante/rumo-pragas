/**
 * Smoke tests do catálogo MIP — Rumo Pragas
 *
 * Garantias:
 *  1. Catálogo carrega sem erros e tem entries
 *  2. IDs (slugs) são únicos globalmente
 *  3. Cada entry respeita o schema obrigatório
 *  4. Culturas prioritárias têm ≥ 8 entries
 *  5. Cada entry tem ao menos uma referência
 *  6. O bundle não contém estruturas prescritivas de controle químico
 *  7. Slugs seguem padrão snake_case
 */

import {
  ALGODAO_MIP_ENTRIES,
  CAFE_MIP_ENTRIES,
  CANA_MIP_ENTRIES,
  getCatalogStats,
  MILHO_MIP_ENTRIES,
  MIP_CATALOG,
  SOJA_MIP_ENTRIES,
} from '../../../data/mip';

describe('MIP catalog — load + schema integrity', () => {
  it('carrega o catálogo agregado com ≥ 50 entradas', () => {
    expect(MIP_CATALOG).toBeDefined();
    expect(Array.isArray(MIP_CATALOG)).toBe(true);
    expect(MIP_CATALOG.length).toBeGreaterThanOrEqual(50);
  });

  it('todos os IDs são únicos globalmente', () => {
    const ids = MIP_CATALOG.map((e) => e.id);
    const set = new Set(ids);
    if (set.size !== ids.length) {
      const dups = ids.filter((id, i) => ids.indexOf(id) !== i);
      throw new Error(`IDs duplicados encontrados: ${Array.from(new Set(dups)).join(', ')}`);
    }
    expect(set.size).toBe(ids.length);
  });

  it('todos os IDs seguem padrão snake_case (a-z0-9_)', () => {
    const re = /^[a-z][a-z0-9_]*$/;
    for (const entry of MIP_CATALOG) {
      expect(entry.id).toMatch(re);
    }
  });

  it('cada entry tem os campos obrigatórios do schema', () => {
    for (const entry of MIP_CATALOG) {
      expect(entry.id).toBeTruthy();
      expect(entry.type).toMatch(/^(praga|doenca)$/);
      expect(entry.category).toBeTruthy();
      expect(entry.nomeComum).toBeTruthy();
      expect(Array.isArray(entry.nomesAlternativos)).toBe(true);
      expect(entry.nomeCientifico).toBeTruthy();
      expect(Array.isArray(entry.culturas)).toBe(true);
      expect(Array.isArray(entry.imageUrls)).toBe(true);

      // sintomas
      expect(entry.sintomas).toBeDefined();
      expect(entry.sintomas.descricao).toBeTruthy();
      expect(Array.isArray(entry.sintomas.palavrasChave)).toBe(true);
      expect(entry.sintomas.palavrasChave.length).toBeGreaterThan(0);
      expect(['baixa', 'media', 'alta']).toContain(entry.sintomas.severidadeVisual);

      // niveisDano
      expect(entry.niveisDano).toBeDefined();
      expect(entry.niveisDano.baixo).toBeDefined();
      expect(entry.niveisDano.medio).toBeDefined();
      expect(entry.niveisDano.alto).toBeDefined();
      expect(entry.niveisDano.baixo.criterio).toBeTruthy();
      expect(entry.niveisDano.medio.criterio).toBeTruthy();
      expect(entry.niveisDano.alto.criterio).toBeTruthy();

      // mip
      expect(entry.mip).toBeDefined();
      expect(Array.isArray(entry.mip.cultural)).toBe(true);
      expect(Array.isArray(entry.mip.biologico)).toBe(true);
      expect(entry.mip).not.toHaveProperty('quimico');
      expect(entry.mip).not.toHaveProperty('mecanico');
      expect(entry).not.toHaveProperty('rotacaoResistencia');

      // monitoramento
      expect(entry.monitoramento).toBeDefined();
      expect(entry.monitoramento.metodo).toBeTruthy();
      expect(entry.monitoramento.frequencia).toBeTruthy();
      expect(entry.monitoramento.nivelControle).toBeTruthy();

      // referencias
      expect(Array.isArray(entry.referencias)).toBe(true);
      expect(entry.referencias.length).toBeGreaterThan(0);
    }
  });

  it('não embute produto, ingrediente ativo, dose ou intervalo prescritivo', () => {
    for (const entry of MIP_CATALOG) {
      const serialized = JSON.stringify(entry);
      expect(serialized).not.toMatch(
        /ingredientesAtivos|produtosComerciais|dosagem|intervaloAplicacoes|carencia/i,
      );
    }
  });

  it('todas referências têm fonte oficial conhecida', () => {
    const validSources = [
      'EMBRAPA',
      'MAPA',
      'IRAC',
      'FRAC',
      'CESB',
      'HRAC',
      'WSSA',
      'ANDAV',
      'AENDA',
    ];
    for (const entry of MIP_CATALOG) {
      for (const ref of entry.referencias) {
        expect(validSources).toContain(ref.source);
        expect(ref.ano).toBeGreaterThanOrEqual(2018);
        expect(ref.ano).toBeLessThanOrEqual(2030);
      }
    }
  });
});

describe('MIP catalog — coverage por cultura prioritária', () => {
  it('soja tem ≥ 8 entradas', () => {
    expect(SOJA_MIP_ENTRIES.length).toBeGreaterThanOrEqual(8);
  });

  it('milho tem ≥ 8 entradas', () => {
    expect(MILHO_MIP_ENTRIES.length).toBeGreaterThanOrEqual(8);
  });

  it('cana tem ≥ 8 entradas', () => {
    expect(CANA_MIP_ENTRIES.length).toBeGreaterThanOrEqual(8);
  });

  it('café tem ≥ 8 entradas', () => {
    expect(CAFE_MIP_ENTRIES.length).toBeGreaterThanOrEqual(8);
  });

  it('algodão tem ≥ 8 entradas', () => {
    expect(ALGODAO_MIP_ENTRIES.length).toBeGreaterThanOrEqual(8);
  });

  it('estatísticas do catálogo coerentes', () => {
    const stats = getCatalogStats();
    expect(stats.total).toBe(MIP_CATALOG.length);

    // Soma de byType deve bater com total
    const sumType = stats.byType.praga + stats.byType.doenca;
    expect(sumType).toBe(stats.total);
  });
});

describe('MIP catalog — culturas referenciadas existem em constants/crops.ts', () => {
  // Lista canônica de IDs de culturas atualmente em constants/crops.ts
  // (sincronizar se constants/crops.ts mudar)
  const KNOWN_CROP_IDS = new Set([
    'soja',
    'milho',
    'cafe',
    'algodao',
    'cana',
    'trigo',
    'arroz',
    'feijao',
    'batata',
    'tomate',
    'mandioca',
    'citros',
    'uva',
    'banana',
    'sorgo',
    'amendoim',
    'girassol',
    'cebola',
  ]);

  it('todas culturas referenciadas existem em constants/crops.ts', () => {
    const usadas = new Set<string>();
    for (const e of MIP_CATALOG) {
      for (const c of e.culturas) usadas.add(c);
    }
    for (const c of usadas) {
      if (!KNOWN_CROP_IDS.has(c)) {
        throw new Error(`Cultura "${c}" usada em catálogo MIP não existe em constants/crops.ts`);
      }
    }
  });
});
