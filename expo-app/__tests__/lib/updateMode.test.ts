/**
 * Unit tests — `computeUpdateMode` pure function.
 *
 * Locks the policy contract shared by backend (api/version-check.ts) and
 * mobile UI (Phase 2B). Any divergence between the two surfaces must come
 * from changing this function explicitly + bumping all consumers.
 *
 * Branches covered (6):
 *   1. current > latest                     → silent  (dev / pre-release)
 *   2. current === latest                   → silent  (already up to date)
 *   3. current < min_supported              → force   (hard floor breach)
 *   4. is_force_update true + current<latest→ force   (operator hotfix)
 *   5. current < latest, no force flag      → soft    (regular nudge)
 *   6. current === min_supported            → soft / silent (boundary)
 */

import { computeUpdateMode } from '../../lib/updateMode';

describe('computeUpdateMode', () => {
  it('returns silent when current build is ahead of latest (dev build)', () => {
    expect(
      computeUpdateMode({
        currentBuildNumber: 200,
        latestBuildNumber: 178,
        minSupportedBuildNumber: 170,
        isForceUpdate: false,
      }),
    ).toBe('silent');
  });

  it('returns silent when current build equals latest (up to date)', () => {
    expect(
      computeUpdateMode({
        currentBuildNumber: 178,
        latestBuildNumber: 178,
        minSupportedBuildNumber: 170,
        isForceUpdate: false,
      }),
    ).toBe('silent');
  });

  it('returns silent on equal-to-latest even when is_force_update flag is true', () => {
    // We never force an update to a version the user is already on.
    expect(
      computeUpdateMode({
        currentBuildNumber: 178,
        latestBuildNumber: 178,
        minSupportedBuildNumber: 170,
        isForceUpdate: true,
      }),
    ).toBe('silent');
  });

  it('returns force when current build is below min_supported', () => {
    expect(
      computeUpdateMode({
        currentBuildNumber: 165,
        latestBuildNumber: 178,
        minSupportedBuildNumber: 170,
        isForceUpdate: false,
      }),
    ).toBe('force');
  });

  it('returns force when is_force_update is true and current < latest', () => {
    expect(
      computeUpdateMode({
        currentBuildNumber: 175,
        latestBuildNumber: 178,
        minSupportedBuildNumber: 170,
        isForceUpdate: true,
      }),
    ).toBe('force');
  });

  it('returns soft when current < latest, above min, no force flag', () => {
    expect(
      computeUpdateMode({
        currentBuildNumber: 175,
        latestBuildNumber: 178,
        minSupportedBuildNumber: 170,
        isForceUpdate: false,
      }),
    ).toBe('soft');
  });

  it('returns soft at the min_supported boundary when below latest (current === min)', () => {
    // Boundary policy: current === min is OK (>= min is the contract).
    // Falls through to soft because current is still < latest.
    expect(
      computeUpdateMode({
        currentBuildNumber: 170,
        latestBuildNumber: 178,
        minSupportedBuildNumber: 170,
        isForceUpdate: false,
      }),
    ).toBe('soft');
  });

  it('returns force at min_supported boundary just one build below', () => {
    expect(
      computeUpdateMode({
        currentBuildNumber: 169,
        latestBuildNumber: 178,
        minSupportedBuildNumber: 170,
        isForceUpdate: false,
      }),
    ).toBe('force');
  });

  it('handles min_supported === 0 (no hard floor configured)', () => {
    expect(
      computeUpdateMode({
        currentBuildNumber: 5,
        latestBuildNumber: 10,
        minSupportedBuildNumber: 0,
        isForceUpdate: false,
      }),
    ).toBe('soft');
  });
});
