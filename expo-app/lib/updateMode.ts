/**
 * Pure function — compute in-app update mode from build numbers.
 *
 * Single source of truth for the policy used both server-side
 * (api/version-check.ts) and client-side (Phase 2B mobile UI).
 *
 * Modes:
 *   - silent: no banner shown.
 *       * current build > latest published (dev / pre-release builds).
 *       * current build === latest (already up to date).
 *   - soft:   non-blocking banner (dismissible).
 *       * current build < latest published, ABOVE min_supported_build_number.
 *   - force:  blocking modal (cannot be dismissed).
 *       * current build < min_supported_build_number, OR
 *       * is_force_update flag is true AND current < latest.
 *
 * Boundary semantics (explicit):
 *   - current === min_supported: NOT force (>= min is fine). Falls through to
 *     soft if current < latest, else silent.
 *   - current === latest: silent. No banner needed.
 *   - is_force_update + current === latest: silent (already on latest).
 */

export type UpdateMode = 'silent' | 'soft' | 'force';

export interface ComputeUpdateModeInput {
  currentBuildNumber: number;
  latestBuildNumber: number;
  minSupportedBuildNumber: number;
  isForceUpdate: boolean;
}

export function computeUpdateMode(input: ComputeUpdateModeInput): UpdateMode {
  const { currentBuildNumber, latestBuildNumber, minSupportedBuildNumber, isForceUpdate } = input;

  // Dev / pre-release builds run AHEAD of store. Never nag the dev.
  if (currentBuildNumber > latestBuildNumber) return 'silent';

  // Already on (or past) latest — nothing to do.
  if (currentBuildNumber >= latestBuildNumber) return 'silent';

  // Below the hard floor — block until update.
  if (currentBuildNumber < minSupportedBuildNumber) return 'force';

  // Operator-flagged hot fix — force even if above floor.
  if (isForceUpdate) return 'force';

  // Below latest, above min, no force flag — soft nudge.
  return 'soft';
}
