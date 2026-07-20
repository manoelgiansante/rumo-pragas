// Pins the shared qualitative confidence thresholds (lib/confidence.ts).
// These drive BOTH the hero label on the result screen and the tone colors in
// TopAlternatives — a drift here silently changes what "high confidence" means
// to the user, so every boundary is asserted explicitly.

import {
  getConfidenceLevel,
  CONFIDENCE_HIGH_THRESHOLD,
  CONFIDENCE_MEDIUM_THRESHOLD,
} from '../../lib/confidence';

describe('getConfidenceLevel', () => {
  it('pins the canonical thresholds (same as historical TopAlternatives cutoffs)', () => {
    expect(CONFIDENCE_HIGH_THRESHOLD).toBe(0.7);
    expect(CONFIDENCE_MEDIUM_THRESHOLD).toBe(0.4);
  });

  it('maps scores at or above 0.7 to high (inclusive boundary)', () => {
    expect(getConfidenceLevel(0.7)).toBe('high');
    expect(getConfidenceLevel(0.71)).toBe('high');
    expect(getConfidenceLevel(0.99)).toBe('high');
    expect(getConfidenceLevel(1)).toBe('high');
  });

  it('maps scores in [0.4, 0.7) to medium', () => {
    expect(getConfidenceLevel(0.4)).toBe('medium');
    expect(getConfidenceLevel(0.5)).toBe('medium');
    expect(getConfidenceLevel(0.699)).toBe('medium');
  });

  it('maps scores below 0.4 to low', () => {
    expect(getConfidenceLevel(0.399)).toBe('low');
    expect(getConfidenceLevel(0.1)).toBe('low');
    expect(getConfidenceLevel(0)).toBe('low');
  });

  it('agrees with the low-confidence banner threshold (< 0.7 is never "high")', () => {
    // result.tsx shows the warning banner when confidence < 0.7 — the hero
    // must never simultaneously claim "high" confidence.
    expect(getConfidenceLevel(0.6999)).not.toBe('high');
  });

  it('degrades non-finite / out-of-range garbage to low instead of throwing', () => {
    expect(getConfidenceLevel(NaN)).toBe('low');
    expect(getConfidenceLevel(Infinity)).toBe('low');
    expect(getConfidenceLevel(-Infinity)).toBe('low');
    expect(getConfidenceLevel(-0.2)).toBe('low');
  });
});
