/**
 * Testes dos helpers de catálogo MIP — searchByKeywords + getRecommendation.
 */

import {
  getCoveredCultures,
  getEntriesByCulture,
  getEntriesByType,
  getEntryById,
  getRecommendation,
  MIP_CREA_DISCLAIMER,
  searchByKeywords,
} from '../../../data/mip';

describe('getEntryById', () => {
  it('retorna entry conhecido', () => {
    const e = getEntryById('soja_ferrugem_asiatica');
    expect(e).toBeDefined();
    expect(e?.nomeComum).toMatch(/ferrugem/i);
  });

  it('retorna undefined para id desconhecido', () => {
    expect(getEntryById('id_inexistente_xyz')).toBeUndefined();
  });
});

describe('getEntriesByCulture', () => {
  it('filtra por cultura soja', () => {
    const sojas = getEntriesByCulture('soja');
    expect(sojas.length).toBeGreaterThanOrEqual(8);
    for (const e of sojas) {
      expect(e.culturas).toContain('soja');
    }
  });

  it('retorna array vazio para cultura sem entries', () => {
    expect(getEntriesByCulture('cultura_inexistente')).toEqual([]);
  });
});

describe('getEntriesByType', () => {
  it('separa pragas vs doenças', () => {
    const pragas = getEntriesByType('praga');
    const doencas = getEntriesByType('doenca');
    expect(pragas.length).toBeGreaterThan(0);
    expect(doencas.length).toBeGreaterThan(0);
    for (const p of pragas) expect(p.type).toBe('praga');
    for (const d of doencas) expect(d.type).toBe('doenca');
  });
});

describe('searchByKeywords', () => {
  it('retorna [] sem keywords', () => {
    expect(searchByKeywords([])).toEqual([]);
    expect(searchByKeywords([''])).toEqual([]);
  });

  it('encontra ferrugem asiática por sintoma típico', () => {
    const results = searchByKeywords(['pústulas marrons na face inferior']);
    expect(results.length).toBeGreaterThan(0);
    const ids = results.map((r) => r.entry.id);
    expect(ids).toContain('soja_ferrugem_asiatica');
  });

  it('encontra lagarta-do-cartucho por descrição informal', () => {
    const results = searchByKeywords(['cartucho perfurado milho']);
    const ids = results.map((r) => r.entry.id);
    expect(ids).toContain('milho_lagarta_cartucho');
  });

  it('encontra greening por mosqueamento assimétrico', () => {
    const results = searchByKeywords(['mosqueamento assimétrico', 'planta morrendo']);
    const ids = results.map((r) => r.entry.id);
    expect(ids).toContain('citros_huanglongbing');
  });

  it('é insensível a acentos e maiúsculas', () => {
    const a = searchByKeywords(['Pústulas Marrons']);
    const b = searchByKeywords(['pustulas marrons']);
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    // Pelo menos alguma sobreposição
    const idsA = new Set(a.map((r) => r.entry.id));
    const idsB = b.map((r) => r.entry.id);
    expect(idsB.some((id) => idsA.has(id))).toBe(true);
  });

  it('filtra por cultura quando passado cultureFilter', () => {
    const results = searchByKeywords(['ferrugem'], { cultureFilter: 'soja' });
    for (const r of results) {
      expect(r.entry.culturas).toContain('soja');
    }
  });

  it('respeita limit', () => {
    const results = searchByKeywords(['lagarta'], { limit: 3 });
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('score é sempre > 0 em resultados retornados', () => {
    const results = searchByKeywords(['lagarta']);
    for (const r of results) expect(r.score).toBeGreaterThan(0);
  });

  it('resultados ordenados por score descendente', () => {
    const results = searchByKeywords(['percevejo', 'vagens']);
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
    }
  });
});

describe('getRecommendation', () => {
  it('retorna undefined para id inexistente', () => {
    expect(getRecommendation('xyz_inexistente', 'medio')).toBeUndefined();
  });

  it('em nível BAIXO não traz ações químicas', () => {
    const rec = getRecommendation('soja_lagarta_da_soja', 'baixo');
    expect(rec).toBeDefined();
    expect(rec?.acoesQuimicas).toBeUndefined();
    expect(rec?.acaoPrincipal).toBeTruthy();
    expect(rec?.disclaimerCREA).toBe(MIP_CREA_DISCLAIMER);
  });

  it('em nível MÉDIO traz sugestão química com IAs', () => {
    const rec = getRecommendation('soja_ferrugem_asiatica', 'medio');
    expect(rec).toBeDefined();
    expect(rec?.acoesQuimicas).toBeDefined();
    expect(rec?.acoesQuimicas?.ingredientesAtivosSugeridos.length).toBeGreaterThan(0);
  });

  it('em nível ALTO traz sugestão química', () => {
    const rec = getRecommendation('milho_lagarta_cartucho', 'alto');
    expect(rec).toBeDefined();
    expect(rec?.acoesQuimicas).toBeDefined();
  });

  it('sempre carrega referências e disclaimer CREA', () => {
    const rec = getRecommendation('cafe_ferrugem_cafeeiro', 'medio');
    expect(rec).toBeDefined();
    expect(rec?.referencias.length).toBeGreaterThan(0);
    expect(rec?.disclaimerCREA).toBe(MIP_CREA_DISCLAIMER);
  });
});

describe('getCoveredCultures', () => {
  it('retorna culturas cobertas pelo catálogo', () => {
    const cultures = getCoveredCultures();
    expect(cultures.length).toBeGreaterThanOrEqual(5);
    expect(cultures).toEqual(expect.arrayContaining(['soja', 'milho', 'cana', 'cafe', 'algodao']));
  });
});
