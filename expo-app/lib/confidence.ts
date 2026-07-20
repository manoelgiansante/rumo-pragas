// -----------------------------------------------------------------------------
// Shared qualitative confidence mapping.
// -----------------------------------------------------------------------------
// The diagnosis is an AI-assisted hypothesis — a raw "87%" reads as lab-grade
// precision the model does not have. Every surface that communicates
// confidence (hero of the result screen, TopAlternatives tones) must map the
// score through THESE thresholds so the app never disagrees with itself about
// what "high" means. The values match the historical TopAlternatives cutoffs
// and the low-confidence warning banner in result.tsx (< 0.7).
//
// Do not duplicate these thresholds elsewhere — import from here.
// -----------------------------------------------------------------------------

export type ConfidenceLevel = 'high' | 'medium' | 'low';

/** Score (0–1) at or above which confidence is presented as "high". */
export const CONFIDENCE_HIGH_THRESHOLD = 0.7;
/** Score (0–1) at or above which confidence is presented as "medium". */
export const CONFIDENCE_MEDIUM_THRESHOLD = 0.4;

/**
 * Maps a raw model confidence score (0–1) to the qualitative level shown to
 * the user. Non-finite input degrades to 'low' — never throws in render paths.
 */
export function getConfidenceLevel(value: number): ConfidenceLevel {
  if (!Number.isFinite(value)) return 'low';
  if (value >= CONFIDENCE_HIGH_THRESHOLD) return 'high';
  if (value >= CONFIDENCE_MEDIUM_THRESHOLD) return 'medium';
  return 'low';
}
