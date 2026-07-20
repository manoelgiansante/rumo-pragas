/**
 * Soft, on-device photo-quality heuristics for the diagnosis capture flow.
 *
 * Problem: the only client-side check used to be the 5MB upload cap
 * (services/diagnosis.ts) — a tiny, dark or blurry photo was rejected only
 * AFTER upload + server round-trip, wasting the user's time and an AI call.
 *
 * These heuristics are pure JS over data we already have (picker asset
 * dimensions + the compressed JPEG base64), no new native dependency. They
 * feed a SOFT warning ("Tirar outra" / "Usar assim mesmo") — NEVER a hard
 * block: a false positive must not stop the user (honestidade > bloqueio).
 */

export type PhotoQualityIssue = 'low_resolution' | 'low_detail';

/**
 * Short side below this (in the ORIGINAL picker asset, pre-resize) reads as
 * "too small / too far away". 480px is far below any modern phone camera or
 * screenshot — it only trips on thumbnails, heavy crops and old downloads.
 */
export const MIN_SHORT_SIDE_PX = 480;

/**
 * Bytes-per-pixel floor for the COMPRESSED JPEG (quality 0.75).
 *
 * Rationale: JPEG spends bytes on high-frequency detail (AC coefficients).
 * A normally exposed, in-focus leaf/field photo at q≈0.75 lands around
 * 0.10–0.35 bytes/pixel. Dark, flat or heavily blurred frames have little
 * high-frequency content and compress dramatically further — a near-black or
 * fully defocused frame sits around 0.01–0.03 bytes/pixel.
 *
 * 0.04 is deliberately CONSERVATIVE (≈42KB for a 1024×1024 output): only
 * near-flat images trip it, so real-but-imperfect field photos pass without
 * nagging. Decoded size is estimated from base64 length × 3/4.
 */
export const MIN_BYTES_PER_PIXEL = 0.04;

export interface PhotoQualitySignals {
  /** Dimensions the picker reported for the ORIGINAL asset (may be absent). */
  assetWidth?: number | null | undefined;
  assetHeight?: number | null | undefined;
  /** Length of the base64 string produced by the compression step. */
  base64Length: number;
  /** Dimensions of the compressed output (ImageResult.width/height). */
  outputWidth?: number | null | undefined;
  outputHeight?: number | null | undefined;
}

function toFinitePositive(value: number | undefined | null): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Returns the list of detected issues (possibly empty). Each check only runs
 * when its inputs are trustworthy — missing/zero dimensions mean "no verdict",
 * never a warning (conservative by design, this is a soft gate).
 */
export function assessPhotoQuality(signals: PhotoQualitySignals): PhotoQualityIssue[] {
  const issues: PhotoQualityIssue[] = [];

  const assetWidth = toFinitePositive(signals.assetWidth);
  const assetHeight = toFinitePositive(signals.assetHeight);
  if (assetWidth > 0 && assetHeight > 0 && Math.min(assetWidth, assetHeight) < MIN_SHORT_SIDE_PX) {
    issues.push('low_resolution');
  }

  const outputWidth = toFinitePositive(signals.outputWidth);
  const outputHeight = toFinitePositive(signals.outputHeight);
  const base64Length = toFinitePositive(signals.base64Length);
  if (outputWidth > 0 && outputHeight > 0 && base64Length > 0) {
    const estimatedBytes = (base64Length * 3) / 4;
    const bytesPerPixel = estimatedBytes / (outputWidth * outputHeight);
    if (bytesPerPixel < MIN_BYTES_PER_PIXEL) {
      issues.push('low_detail');
    }
  }

  return issues;
}
