/**
 * Realistic crop icons (AI-generated photographic references).
 *
 * Source: FLUX.1 [schnell] via Pollinations.ai, 2026-05-20.
 * Format: WebP @ q85 (Metro/RN native support).
 * License: model output, commercially-usable under FLUX.1 [schnell] Apache 2.0.
 *
 * 10 cultures covered. Crops without a realistic image fall back to the
 * emoji declared in `constants/crops.ts` (handled by `getCropIconSource`).
 */
import type { ImageSourcePropType } from 'react-native';

// Static require map — Metro requires literal require() at bundle time.
export const cropIcons: Record<string, ImageSourcePropType> = {
  cana: require('./realistic/cana.webp'),
  soja: require('./realistic/soja.webp'),
  milho: require('./realistic/milho.webp'),
  cafe: require('./realistic/cafe.webp'),
  algodao: require('./realistic/algodao.webp'),
  trigo: require('./realistic/trigo.webp'),
  sorgo: require('./realistic/sorgo.webp'),
  eucalipto: require('./realistic/eucalipto.webp'),
  pastagem: require('./realistic/pastagem.webp'),
  arroz: require('./realistic/arroz.webp'),
};

export type RealisticCropId = keyof typeof cropIcons;

/**
 * Returns the realistic icon source for a crop id, or `undefined` when no
 * image is available. Callers should fall back to the emoji from
 * `constants/crops.ts` in that case.
 */
export function getCropIconSource(cropId: string): ImageSourcePropType | undefined {
  return cropIcons[cropId];
}

/** True when the given crop id has a realistic image. */
export function hasRealisticIcon(cropId: string): boolean {
  return cropId in cropIcons;
}
