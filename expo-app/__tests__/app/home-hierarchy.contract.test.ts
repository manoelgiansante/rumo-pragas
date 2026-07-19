/**
 * IMPL-3 T3 (doc-05) — hierarquia da home.
 * Diagnosticar é a tarefa nº1 da categoria: o CTA primário "Diagnosticar
 * agora" deve abrir o scroll, ACIMA dos cards de clima. Trava de ordem no
 * fonte (mudança autorizada foi SÓ de ordem — nenhum card removido).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

describe('home hierarchy (doc-05 IMPL-3 T3)', () => {
  const source = readFileSync(join(__dirname, '..', '..', 'app', '(tabs)', 'index.tsx'), 'utf8');

  it('renders the primary diagnose CTA before the weather/field cards', () => {
    const cta = source.indexOf('testID="home-cta-diagnose"');
    const weather = source.indexOf('<WeatherCard weather=');
    const fieldConditions = source.indexOf('<FieldConditionsCard summary=');
    expect(cta).toBeGreaterThan(-1);
    expect(weather).toBeGreaterThan(-1);
    expect(fieldConditions).toBeGreaterThan(-1);
    expect(cta).toBeLessThan(weather);
    expect(cta).toBeLessThan(fieldConditions);
  });

  it('keeps every home card present (order-only change)', () => {
    const markers = [
      '<WeatherCard weather=',
      '<FieldConditionsCard summary=',
      'testID="home-cta-describe"',
      'testID="home-retry-load-data"',
      'testID="home-retry-load-weather"',
    ];
    for (const marker of markers) {
      expect(source).toContain(marker);
    }
  });
});
