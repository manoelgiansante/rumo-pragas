/**
 * Aspect-ratio-safe resize + JPEG re-encode for diagnosis photos.
 *
 * BUG FIXED HERE (P1): the capture flow used to force
 * `resize: { width: 1024, height: 1024 }`, which DISTORTS every non-square
 * photo (gallery picks and most Android camera output) before it reaches the
 * AI provider and the result-screen hero image. A squashed leaf changes lesion
 * geometry — the model sees a deformed plant.
 *
 * Contract: we only ever pass ONE dimension to `resize`. The installed
 * expo-image-manipulator (55.0.19, vendored types in
 * `ImageManipulator.types.ts`) documents: "If you specify only one value, the
 * other will be calculated automatically to preserve image ratio."
 */
import { manipulateAsync, SaveFormat, type Action, type ImageResult } from 'expo-image-manipulator';

export const MAX_DIMENSION = 1024;
export const JPEG_QUALITY = 0.75;

function toFiniteDimension(value: number | undefined | null): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Builds the manipulateAsync actions so the LONGEST side ends at
 * MAX_DIMENSION while the aspect ratio is preserved.
 *
 * - Landscape / square (or unknown dimensions): bound the width only.
 * - Portrait: bound the height only (bounding the width would let the long
 *   side exceed MAX_DIMENSION).
 * - Already small enough: no resize at all (never upscale — the previous code
 *   inflated small photos up to 1024×1024, inventing pixels the AI then read
 *   as blur). The image is still re-encoded to JPEG for a stable payload.
 */
export function buildResizeActions(
  assetWidth?: number | null,
  assetHeight?: number | null,
): Action[] {
  const width = toFiniteDimension(assetWidth);
  const height = toFiniteDimension(assetHeight);
  if (width > 0 && height > 0) {
    if (Math.max(width, height) <= MAX_DIMENSION) return [];
    return height > width
      ? [{ resize: { height: MAX_DIMENSION } }]
      : [{ resize: { width: MAX_DIMENSION } }];
  }
  // Some Android gallery providers omit asset dimensions. Bounding the width
  // alone is still aspect-safe; a portrait outlier just ends slightly taller
  // than MAX_DIMENSION, which the 5MB upload guard already tolerates.
  return [{ resize: { width: MAX_DIMENSION } }];
}

/** Resize (aspect-preserving) + compress to JPEG with base64 for upload. */
export async function compressImageForDiagnosis(
  uri: string,
  assetWidth?: number | null,
  assetHeight?: number | null,
): Promise<ImageResult> {
  return manipulateAsync(uri, buildResizeActions(assetWidth, assetHeight), {
    compress: JPEG_QUALITY,
    format: SaveFormat.JPEG,
    base64: true,
  });
}
