import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ptBR from './locales/pt-BR';
import en from './locales/en';
import es from './locales/es';

const LANGUAGE_KEY = '@rumo_pragas_language';

const deviceLanguage = getLocales()[0]?.languageTag || 'pt-BR';

const getDefaultLanguage = (): string => {
  if (deviceLanguage.startsWith('pt')) return 'pt-BR';
  if (deviceLanguage.startsWith('es')) return 'es';
  return 'en';
};

i18n.use(initReactI18next).init({
  resources: {
    'pt-BR': { translation: ptBR },
    en: { translation: en },
    es: { translation: es },
  },
  lng: getDefaultLanguage(),
  fallbackLng: 'pt-BR',
  interpolation: { escapeValue: false },
});

// Load persisted language preference (async, overrides device default if set)
AsyncStorage.getItem(LANGUAGE_KEY).then((savedLang) => {
  if (savedLang && savedLang !== i18n.language) {
    i18n.changeLanguage(savedLang);
  }
});

export default i18n;
export { LANGUAGE_KEY };
