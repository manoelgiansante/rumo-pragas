/** Contract tests for synchronous, free MIP catalog resolution. */
import { renderHook } from '@testing-library/react-native';
import { useMipKnowledge } from '../../hooks/useMipKnowledge';

describe('useMipKnowledge', () => {
  it('returns empty when disabled', () => {
    const { result } = renderHook(() =>
      useMipKnowledge({
        pestName: 'Ferrugem asiática',
        crop: 'soja',
        enabled: false,
      }),
    );
    expect(result.current.entry).toBeNull();
    expect(result.current.levels).toEqual([]);
    expect(result.current.empty).toBe(false);
  });

  it('resolves Ferrugem asiática to the soybean catalog entry', () => {
    const { result } = renderHook(() =>
      useMipKnowledge({
        pestName: 'Ferrugem asiática',
        enrichment: {
          name_pt: 'Ferrugem asiática da soja',
          scientific_name: 'Phakopsora pachyrhizi',
          symptoms: ['pústulas marrons na face inferior das folhas'],
        },
        crop: 'soja',
      }),
    );

    expect(result.current.entry?.id).toBe('soja_ferrugem_asiatica');
    expect(result.current.matchScore).toBeGreaterThanOrEqual(2);
    expect(result.current.empty).toBe(false);
  });

  it('makes all three educational levels available without a plan gate', () => {
    const { result } = renderHook(() =>
      useMipKnowledge({
        pestName: 'Ferrugem asiática',
        enrichment: { name_pt: 'Ferrugem asiática da soja' },
        crop: 'soja',
      }),
    );
    expect(result.current.levels.map((level) => level.level)).toEqual(['baixo', 'medio', 'alto']);
    expect(result.current.levels.some((level) => 'unlocked' in level)).toBe(false);
  });

  it('returns empty when nothing matches', () => {
    const { result } = renderHook(() =>
      useMipKnowledge({
        pestName: 'xyzpragafictícia',
        enrichment: { symptoms: ['nada-faz-sentido'] },
        crop: 'soja',
      }),
    );
    expect(result.current.entry).toBeNull();
    expect(result.current.empty).toBe(true);
  });

  it('searches the whole catalog when crop is absent', () => {
    const { result } = renderHook(() =>
      useMipKnowledge({
        pestName: 'Broca do café',
        enrichment: {
          name_pt: 'Broca-do-café',
          scientific_name: 'Hypothenemus hampei',
        },
      }),
    );
    expect(result.current.entry?.id).toContain('cafe');
  });

  it('keeps recommendations non-prescriptive', () => {
    const { result } = renderHook(() =>
      useMipKnowledge({
        pestName: 'Ferrugem asiática',
        enrichment: { name_pt: 'Ferrugem asiática da soja' },
        crop: 'soja',
      }),
    );
    for (const level of result.current.levels) {
      expect(level.recommendation).not.toHaveProperty('acoesQuimicas');
      expect(level.recommendation).not.toHaveProperty('produtosComerciais');
      expect(level.recommendation).not.toHaveProperty('ingredientesAtivos');
      expect(level.recommendation).not.toHaveProperty('dosagem');
    }
  });
});
