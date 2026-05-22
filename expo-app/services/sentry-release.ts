/**
 * Sentry release/dist resolver — canonical helper for cross-app native release ID.
 *
 * Why this exists (W17-4, 2026-05-22):
 *   - Sentry web/Vercel apps use `SENTRY_RELEASE` env (auto-injected by build)
 *     and arrive instrumented with commit SHA per deploy.
 *   - Expo native apps (`@sentry/react-native`) DO NOT read `SENTRY_RELEASE`
 *     env at runtime. Without an explicit `release` field in `Sentry.init`,
 *     the SDK falls back to the native bundle release ID, which on simulator
 *     / dev / first install can serialize as `1.0.0+0` — collapsing all
 *     installs across versions into a single Sentry release.
 *   - Source maps uploaded via `sentry-cli releases new <slug>@<version>+<build>`
 *     can't be matched to events if events arrive tagged `1.0.0+0`.
 *
 * Output: `release` = `<slug>@<version>+<buildId>`, `dist` = `<buildId>`.
 *   - `slug` from `Constants.expoConfig.slug` (e.g. `rumo-pragas`).
 *   - `version` from `Constants.expoConfig.version` (e.g. `1.0.6`).
 *   - `buildId` precedence:
 *       1. `process.env.EXPO_PUBLIC_BUILD_ID` (CI/EAS injects when present)
 *       2. `Constants.expoConfig.ios.buildNumber` on iOS
 *       3. `Constants.expoConfig.android.versionCode` on Android (stringified)
 *       4. `'0'` fallback (still better than RN-default `1.0.0+0` collapse)
 *
 * This is a pure function. No Sentry import — caller passes the result to
 * `Sentry.init({ release, dist })`. Tests can stub `Constants.expoConfig`
 * via the standard Jest expo-constants mock.
 *
 * Adoption checklist (per app):
 *   1. Drop this file in `services/sentry-release.ts` (or `lib/`).
 *   2. In the file calling `Sentry.init`, import `getSentryRelease`.
 *   3. Spread `...getSentryRelease()` into the init options (release + dist).
 *   4. Verify with `eas env:list` that `EXPO_PUBLIC_BUILD_ID` is plaintext
 *      (ZERO-L). If it's SENSITIVE/SECRET, it becomes `***` in the JS
 *      bundle and the release tag will break silently.
 *
 * Cross-ref:
 *   - W17-4 audit: `Obsidian Vault/Audits/W17-4 Sentry Release v2 Expo - 2026-05-22.md`
 *   - ZERO-L (EAS env plaintext): `CLAUDE Rules - Zero Rules.md`
 *   - ZERO-O (observability obligations): `CLAUDE Rules - Zero Rules.md`
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

export interface SentryReleaseInfo {
  /** `<slug>@<version>+<buildId>` — pass to `Sentry.init({ release })`. */
  release: string;
  /** `<buildId>` as string — pass to `Sentry.init({ dist })`. */
  dist: string;
  /** Bare slug, exposed for tagging / breadcrumbs. */
  slug: string;
  /** Bare semver version, exposed for tagging / breadcrumbs. */
  version: string;
  /** Bare build id, exposed for tagging / breadcrumbs. */
  buildId: string;
}

/**
 * Resolve release/dist for the current native binary.
 *
 * Pure function. Safe to call at module scope (no native side effects).
 */
export function getSentryRelease(): SentryReleaseInfo {
  const expoConfig = Constants.expoConfig;
  const slug = expoConfig?.slug ?? 'app';
  const version = expoConfig?.version ?? '0.0.0';

  // Build id precedence: env override → platform-specific buildNumber → '0'.
  const envBuildId = process.env.EXPO_PUBLIC_BUILD_ID;
  const iosBuildNumber = expoConfig?.ios?.buildNumber;
  const androidVersionCode = expoConfig?.android?.versionCode;
  const platformBuildId =
    Platform.OS === 'ios'
      ? iosBuildNumber
      : Platform.OS === 'android' && androidVersionCode != null
        ? String(androidVersionCode)
        : undefined;

  const buildId =
    (typeof envBuildId === 'string' && envBuildId.length > 0 ? envBuildId : undefined) ??
    platformBuildId ??
    '0';

  const release = `${slug}@${version}+${buildId}`;

  return { release, dist: buildId, slug, version, buildId };
}
