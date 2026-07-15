import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadPestFromCache, savePestToCache } from '../../services/pestRegistry';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

jest.mock('../../services/sentry-shim', () => ({
  addBreadcrumb: jest.fn(),
}));

const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe('pestRegistry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storage.getItem.mockResolvedValue(null);
    storage.setItem.mockResolvedValue(undefined);
  });

  it('persists only bounded educational fields in a user-scoped key', async () => {
    await savePestToCache('user-a', {
      id: 'pest-1',
      pest_name: 'Ferrugem',
      scientific_name: 'Phakopsora pachyrhizi',
      crop: 'soja',
      enrichment: {
        symptoms: ['Pústulas marrons'],
        cultural_treatment: ['Rotação de culturas'],
        severity: 'medium',
        chemical_treatment: ['Produto privado'],
        recommended_products: [{ name: 'Produto X' }],
      } as never,
    });

    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem.mock.calls[0]![0]).toBe('@rumopragas/pest-cache/v2/user-a/pest-1');
    const saved = JSON.parse(storage.setItem.mock.calls[0]![1] as string);
    expect(saved.enrichment).toEqual({
      symptoms: ['Pústulas marrons'],
      cultural_treatment: ['Rotação de culturas'],
      severity: 'medium',
    });
    expect(saved).not.toHaveProperty('image_uri');
    expect(saved).not.toHaveProperty('alternatives');
    expect(saved.enrichment).not.toHaveProperty('chemical_treatment');
    expect(saved.enrichment).not.toHaveProperty('recommended_products');
  });

  it('does not expose one account cache key to another account', async () => {
    await loadPestFromCache('user-b', 'pest-1');
    expect(storage.getItem).toHaveBeenCalledWith('@rumopragas/pest-cache/v2/user-b/pest-1');
    expect(storage.getItem).not.toHaveBeenCalledWith('@rumopragas/pest-cache/v2/user-a/pest-1');
  });

  it('rejects unsafe user and pest identifiers without touching storage', async () => {
    await savePestToCache('../user', {
      id: 'pest-1',
      enrichment: {},
    });
    await expect(loadPestFromCache('user-a', '../pest')).resolves.toBeNull();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.getItem).not.toHaveBeenCalled();
  });

  it('rejects a mismatched or stale cache payload', async () => {
    storage.getItem.mockResolvedValue(
      JSON.stringify({
        v: 1,
        id: 'different-pest',
        enrichment: {},
        updated_at: Date.now(),
      }),
    );
    await expect(loadPestFromCache('user-a', 'pest-1')).resolves.toBeNull();
  });

  it('returns null on malformed storage instead of leaking the parse error', async () => {
    storage.getItem.mockResolvedValue('{private-corrupt-data');
    await expect(loadPestFromCache('user-a', 'pest-1')).resolves.toBeNull();
  });
});
