import { isSafeStoreUrl, parseVersionCheckResponse } from '../../lib/updateCheckResponse';

const validResponse = {
  has_update: true,
  mode: 'force',
  latest_version_name: '1.0.11',
  latest_build_number: 42,
  store_url_native: 'market://details?id=com.agrorumo.rumopragas',
  store_url_fallback: 'https://play.google.com/store/apps/details?id=com.agrorumo.rumopragas',
  release_notes: 'Correções importantes.',
  released_at: '2026-07-14T18:30:00.000Z',
} as const;

describe('update-check response contract', () => {
  it('accepts and reconstructs a bounded valid payload', () => {
    expect(parseVersionCheckResponse({ ...validResponse, ignored: 'not propagated' })).toEqual(
      validResponse,
    );
  });

  it.each([
    null,
    [],
    { ...validResponse, mode: 'urgent' },
    { ...validResponse, latest_build_number: 1.5 },
    { ...validResponse, latest_build_number: Number.MAX_SAFE_INTEGER + 1 },
    { ...validResponse, latest_version_name: '../secret' },
    { ...validResponse, release_notes: 'x'.repeat(4_001) },
    { ...validResponse, released_at: 'tomorrow' },
    { ...validResponse, released_at: '2026-99-99T00:00:00Z' },
  ])('rejects malformed payload %#', (payload) => {
    expect(parseVersionCheckResponse(payload)).toBeNull();
  });

  it('rejects a non-silent decision when both store destinations are unsafe', () => {
    expect(
      parseVersionCheckResponse({
        ...validResponse,
        store_url_native: 'javascript:alert(1)',
        store_url_fallback: 'https://apps.apple.com.evil.test/app/id6762232682',
      }),
    ).toBeNull();
  });
});

describe('store URL allowlist', () => {
  it.each([
    'https://apps.apple.com/br/app/id6762232682',
    'itms-apps://apps.apple.com/br/app/id6762232682',
    'itms-apps://itunes.apple.com/app/id6762232682',
    'https://play.google.com/store/apps/details?id=com.agrorumo.rumopragas',
    'market://details?id=com.agrorumo.rumopragas',
  ])('accepts this app official destination: %s', (url) => {
    expect(isSafeStoreUrl(url)).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'intent://details?id=com.agrorumo.rumopragas',
    'https://apps.apple.com.evil.test/br/app/id6762232682',
    'https://apps.apple.com/br/app/id9999999999',
    'https://play.google.com/store/apps/details?id=com.attacker.app',
    'https://user:password@play.google.com/store/apps/details?id=com.agrorumo.rumopragas',
    'market://details?id=com.attacker.app',
    ' https://apps.apple.com/br/app/id6762232682',
  ])('rejects spoofed or unrelated destination: %s', (url) => {
    expect(isSafeStoreUrl(url)).toBe(false);
  });
});
