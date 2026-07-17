export type UpdateMode = 'silent' | 'soft' | 'force';

export interface UpdateInfo {
  latestVersionName: string;
  latestBuildNumber: number;
  storeUrlNative: string;
  storeUrlFallback: string;
  releaseNotes: string | null;
  releasedAt: string;
}

export interface VersionCheckResponse {
  has_update: boolean;
  mode: UpdateMode;
  latest_version_name: string;
  latest_build_number: number;
  store_url_native: string;
  store_url_fallback: string;
  release_notes: string | null;
  released_at: string;
}

const APPLE_APP_ID = '6762232682';
const ANDROID_PACKAGE = 'com.agrorumo.rumopragas';
const MAX_STORE_URL_CHARS = 512;

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
  }
  return false;
}

function hasExpectedApplePath(url: URL): boolean {
  return new RegExp(`/(?:id)?${APPLE_APP_ID}/?$`).test(url.pathname);
}

/**
 * Accept only this product's official App Store / Play Store destinations.
 * Prefix matching is deliberately insufficient: `apps.apple.com.evil.test`
 * and an attacker-controlled Play listing would otherwise pass.
 */
export function isSafeStoreUrl(value: string | undefined | null): boolean {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_STORE_URL_CHARS ||
    value !== value.trim() ||
    hasControlCharacters(value)
  ) {
    return false;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.username || url.password || url.port) return false;

  if (url.protocol === 'https:') {
    if (url.hostname === 'apps.apple.com') return hasExpectedApplePath(url);
    return (
      url.hostname === 'play.google.com' &&
      url.pathname === '/store/apps/details' &&
      url.searchParams.get('id') === ANDROID_PACKAGE
    );
  }

  if (url.protocol === 'itms-apps:') {
    return (
      (url.hostname === 'apps.apple.com' || url.hostname === 'itunes.apple.com') &&
      hasExpectedApplePath(url)
    );
  }

  return (
    url.protocol === 'market:' &&
    url.hostname === 'details' &&
    (url.pathname === '' || url.pathname === '/') &&
    url.searchParams.get('id') === ANDROID_PACKAGE
  );
}

export function parseVersionCheckResponse(value: unknown): VersionCheckResponse | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const modes: readonly UpdateMode[] = ['silent', 'soft', 'force'];
  if (
    typeof input.has_update !== 'boolean' ||
    typeof input.mode !== 'string' ||
    !modes.includes(input.mode as UpdateMode) ||
    typeof input.latest_version_name !== 'string' ||
    !/^[0-9A-Za-z][0-9A-Za-z.+-]{0,31}$/.test(input.latest_version_name) ||
    typeof input.latest_build_number !== 'number' ||
    !Number.isSafeInteger(input.latest_build_number) ||
    input.latest_build_number < 0 ||
    typeof input.store_url_native !== 'string' ||
    input.store_url_native.length > MAX_STORE_URL_CHARS ||
    typeof input.store_url_fallback !== 'string' ||
    input.store_url_fallback.length > MAX_STORE_URL_CHARS ||
    !(
      input.release_notes === null ||
      (typeof input.release_notes === 'string' && input.release_notes.length <= 4_000)
    ) ||
    typeof input.released_at !== 'string' ||
    input.released_at.length > 40 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(input.released_at) ||
    !Number.isFinite(Date.parse(input.released_at))
  ) {
    return null;
  }

  if (
    input.mode !== 'silent' &&
    !isSafeStoreUrl(input.store_url_native) &&
    !isSafeStoreUrl(input.store_url_fallback)
  ) {
    return null;
  }

  return {
    has_update: input.has_update,
    mode: input.mode as UpdateMode,
    latest_version_name: input.latest_version_name,
    latest_build_number: input.latest_build_number,
    store_url_native: input.store_url_native,
    store_url_fallback: input.store_url_fallback,
    release_notes: input.release_notes as string | null,
    released_at: input.released_at,
  };
}
