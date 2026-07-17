import {
  scrubSensitiveTelemetryText,
  stripUrlQueryAndFragment,
} from '../../lib/telemetrySanitizer';

describe('telemetry sanitizer', () => {
  it.each([
    ['https://example.test/path?code=secret#access_token=other', 'https://example.test/path'],
    ['rumopragas://update-password#access_token=secret', 'rumopragas://update-password'],
    ['https://example.test/path#fragment?still-secret', 'https://example.test/path'],
  ])('strips query and fragment from %s', (input, expected) => {
    expect(stripUrlQueryAndFragment(input)).toBe(expected);
  });

  it('removes OAuth values, bearer credentials and JWTs from exception text', () => {
    const jwt = [
      'eyJhbGciOiJIUzI1NiJ9',
      'eyJzdWIiOiJ1c2VyLTEyMzQ1Njc4OTAifQ',
      'signature123456789',
    ].join('.');
    const input =
      `failed url=https://api.test/callback?code=pkce-secret#access_token=access-secret ` +
      `refresh_token:refresh-secret Authorization=BearerSecret Bearer abc.def.ghi token=plain ${jwt}`;
    const result = scrubSensitiveTelemetryText(input);

    expect(result).not.toContain('pkce-secret');
    expect(result).not.toContain('access-secret');
    expect(result).not.toContain('refresh-secret');
    expect(result).not.toContain('BearerSecret');
    expect(result).not.toContain('abc.def.ghi');
    expect(result).not.toContain(jwt);
    expect(result).toContain('https://api.test/callback');
  });
});
