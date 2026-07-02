/**
 * Tests for useMipKnowledge — entry resolution + tier gating.
 *
 * We exercise the hook against the REAL catalog (not a mock) because
 * the resolution heuristic is the contract we want to verify and the
 * catalog is bundled at compile-time anyway.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useMipKnowledge, TIER_LEVELS } from '../../hooks/useMipKnowledge';

describe('useMipKnowledge', () => {
  it('returns empty when disabled', () => {
    const { result } = renderHook(() =>
      useMipKnowledge({
        pestName: 'Ferrugem asiática',
        crop: 'soja',
        tier: 'free',
        enabled: false,
      }),
    );
    expect(result.current.entry).toBeNull();
    expect(result.current.levels).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('resolves "Ferrugem asiática da soja" to soja_ferrugem_asiatica entry', async () => {
    const { result } = renderHook(() =>
      useMipKnowledge({
        pestName: 'Ferrugem asiática',
        enrichment: {
          name_pt: 'Ferrugem asiática da soja',
          scientific_name: 'Phakopsora pachyrhizi',
          symptoms: ['pústulas marrons na face inferior das folhas'],
        },
        crop: 'soja',
        tier: 'pro',
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entry?.id).toBe('soja_ferrugem_asiatica');
    expect(result.current.matchScore).toBeGreaterThanOrEqual(2);
    expect(result.current.empty).toBe(false);
  });

  it('produces three levels when entry matches', async () => {
    const { result } = renderHook(() =>
      useMipKnowledge({
        pestName: 'Ferrugem asiática',
        enrichment: { name_pt: 'Ferrugem asiática da soja' },
        crop: 'soja',
        tier: 'pro',
      }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.levels.map((l) => l.level)).toEqual(['baixo', 'medio', 'alto']);
  });

  // FREE BUILD (2026-06-30) — fix/pragas-free-2026-06-30: the whole MIP
  // recommendation library (baixo/medio/alto) is unlocked for EVERY tier,
  // including free. There are no locked levels anymore.
  it('unlocks all three levels for free tier', async () => {
    const { result } = renderHook(() =>
      useMipKnowledge({
        pestName: 'Ferrugem asiática',
        enrichment: { name_pt: 'Ferrugem asiática da soja' },
        crop: 'soja',
        tier: 'free',
      }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const unlockedLevels = result.current.levels.filter((l) => l.unlocked).map((l) => l.level);
    expect(unlockedLevels).toEqual(['baixo', 'medio', 'alto']);
    expect(TIER_LEVELS.free).toEqual(['baixo', 'medio', 'alto']);
  });

  it('unlocks all three levels for pro tier', async () => {
    const { result } = renderHook(() =>
      useMipKnowledge({
        pestName: 'Ferrugem asiática',
        enrichment: { name_pt: 'Ferrugem asiática da soja' },
        crop: 'soja',
        tier: 'pro',
      }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const unlockedLevels = result.current.levels.filter((l) => l.unlocked).map((l) => l.level);
    expect(unlockedLevels).toEqual(['baixo', 'medio', 'alto']);
  });

  it('returns empty when nothing matches', async () => {
    const { result } = renderHook(() =>
      useMipKnowledge({
        pestName: 'xyzpragafictícia',
        enrichment: { symptoms: ['nada-faz-sentido'] },
        crop: 'soja',
        tier: 'pro',
      }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entry).toBeNull();
    expect(result.current.empty).toBe(true);
  });

  it('handles missing crop by searching the whole catalog', async () => {
    const { result } = renderHook(() =>
      useMipKnowledge({
        pestName: 'Broca do café',
        enrichment: {
          name_pt: 'Broca-do-café',
          scientific_name: 'Hypothenemus hampei',
        },
        crop: undefined,
        tier: 'pro',
      }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entry?.id).toContain('cafe');
  });

  it('omits chemical actions from the baixo level by design', async () => {
    const { result } = renderHook(() =>
      useMipKnowledge({
        pestName: 'Ferrugem asiática',
        enrichment: { name_pt: 'Ferrugem asiática da soja' },
        crop: 'soja',
        tier: 'free',
      }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const baixo = result.current.levels.find((l) => l.level === 'baixo');
    // The "baixo" recommendation never carries chemical actions by design,
    // independent of tier (all tiers are unlocked in the free build).
    expect(baixo).toBeDefined();
    expect(baixo?.recommendation.acoesQuimicas).toBeUndefined();
  });

  it('flips loading off on next tick', async () => {
    const { result } = renderHook(() =>
      useMipKnowledge({
        pestName: 'Ferrugem',
        enrichment: { name_pt: 'Ferrugem asiática da soja' },
        crop: 'soja',
        tier: 'pro',
      }),
    );
    // Loading should resolve quickly (synchronous lookup + 0ms timer)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(result.current.loading).toBe(false);
  });
});
