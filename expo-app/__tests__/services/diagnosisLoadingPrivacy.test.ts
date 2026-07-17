import fs from 'node:fs';
import path from 'node:path';

describe('diagnosis loading location boundary', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../app/diagnosis/loading.tsx'),
    'utf8',
  );

  it('uses the app-consent-aware location method and has no unconditional raw location call', () => {
    expect(source).toContain('getCurrentLocationWithConsent(user.id)');
    expect(source).not.toMatch(/\bgetCurrentLocation\(\s*\)/);
    expect(source).not.toContain('useEffect(() => {\n    getCurrentLocation');
  });
});
