import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ptBR from './locales/pt-BR';
import en from './locales/en';
import es from './locales/es';

const LANGUAGE_KEY = '@rumo_pragas_language';

// Defensive: getLocales() is a synchronous native call. Wrap in try/catch so
// a TurboModule failure on cold boot never aborts module evaluation
// (Apple reviewer first-launch hardening 2026-04-27).
let deviceLanguage = 'pt-BR';
try {
  deviceLanguage = getLocales()[0]?.languageTag || 'pt-BR';
} catch (e) {
  if (__DEV__) console.warn('[i18n] getLocales failed, defaulting to pt-BR:', e);
}

const getDefaultLanguage = (): string => {
  if (deviceLanguage.startsWith('pt')) return 'pt-BR';
  if (deviceLanguage.startsWith('es')) return 'es-ES';
  return 'en-US';
};

// Resources registered under BOTH short (en/es) and BCP-47 (en-US/es-ES) keys
// so device locales like "en-US" or "es-AR" resolve without a fallbackLng hop.
// Canonical (per N7 directive 2026-05-23): pt-BR + en-US + es-ES.
i18n.use(initReactI18next).init({
  resources: {
    'pt-BR': { translation: ptBR },
    en: { translation: en },
    'en-US': { translation: en },
    es: { translation: es },
    'es-ES': { translation: es },
  },
  lng: getDefaultLanguage(),
  fallbackLng: 'pt-BR',
  supportedLngs: ['pt-BR', 'en', 'en-US', 'es', 'es-ES'],
  // NOTE: `nonExplicitSupportedLngs` was removed (2026-06-04). On i18next v25
  // the combination of `supportedLngs` + `nonExplicitSupportedLngs: true`
  // breaks key resolution: the translator resolves a language code that no
  // longer matches the resource-store key, so `t()` silently returns the raw
  // key (e.g. "errors.deleteDiagnosis") instead of the translation. The
  // dual-key registration above (short `en`/`es` + BCP-47 `en-US`/`es-ES`)
  // already covers region variants like `es-AR` via natural fallback, so the
  // flag was both redundant and harmful.
  interpolation: { escapeValue: false },
  initImmediate: false, // synchronous init; resources are inline
  react: { useSuspense: false },
});

// Load persisted language preference (async, overrides device default if set).
// Wrapped in .catch() — never crash boot if AsyncStorage rejects on a fresh
// install or corrupt sandbox. Silent fallback to device-detected language.
AsyncStorage.getItem(LANGUAGE_KEY)
  .then((savedLang) => {
    if (savedLang && savedLang !== i18n.language) {
      i18n.changeLanguage(savedLang).catch(() => {
        /* ignore — keep device default */
      });
    }
  })
  .catch(() => {
    /* ignore — keep device default */
  });

export default i18n;
export { LANGUAGE_KEY };
