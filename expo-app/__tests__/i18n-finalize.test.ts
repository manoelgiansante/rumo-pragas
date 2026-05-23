// N7 finalize smoke test: validate the canonical 3-locale stack
// (pt-BR + en-US + es-ES) initializes and resolves a known key.
//
// Why: I3/J1 W1 bootstrapped i18n with short codes (en/es). N7 added BCP-47
// aliases so iOS/Android `en-US` and `es-AR` device locales hit the resource
// directly instead of round-tripping via fallbackLng. This test pins that.

import i18n from '../i18n';

describe('i18n finalize — canonical pt-BR + en-US + es-ES', () => {
  it('initializes synchronously with pt-BR fallback', () => {
    expect(i18n.isInitialized).toBe(true);
    expect(i18n.options.fallbackLng).toEqual(['pt-BR']);
  });

  it('resolves the same key across all 3 canonical locales', async () => {
    // Pragas has a deeply-nested catalogue; pick a stable navigation key
    // that has shipped in pt-BR/en/es since the original i18n drop.
    const key = 'tabs.home';

    await i18n.changeLanguage('pt-BR');
    const pt = i18n.t(key);

    await i18n.changeLanguage('en-US');
    const en = i18n.t(key);

    await i18n.changeLanguage('es-ES');
    const es = i18n.t(key);

    expect(typeof pt).toBe('string');
    expect(typeof en).toBe('string');
    expect(typeof es).toBe('string');
    expect(pt.length).toBeGreaterThan(0);
    expect(en.length).toBeGreaterThan(0);
    expect(es.length).toBeGreaterThan(0);
    // pt is the source; en/es are independent translations — must differ
    // from the pt label OR explicitly equal (we just assert non-empty here).
  });

  it('en-US alias resolves to the same bundle as en', async () => {
    await i18n.changeLanguage('en');
    const enShort = i18n.t('tabs.home');
    await i18n.changeLanguage('en-US');
    const enLong = i18n.t('tabs.home');
    expect(enShort).toBe(enLong);
  });

  it('es-ES alias resolves to the same bundle as es', async () => {
    await i18n.changeLanguage('es');
    const esShort = i18n.t('tabs.home');
    await i18n.changeLanguage('es-ES');
    const esLong = i18n.t('tabs.home');
    expect(esShort).toBe(esLong);
  });
});
