/**
 * Global Jest setup for the Expo app.
 *
 * Mocks native modules (AsyncStorage, expo-localization) BEFORE any
 * module is imported so that `i18n/index.ts` can initialise i18next
 * with the pt-BR locale – the same language used in assertions.
 */

// 1. Mock AsyncStorage globally (needed by i18n/index.ts and many services)
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
  multiRemove: jest.fn().mockResolvedValue(undefined),
  clear: jest.fn().mockResolvedValue(undefined),
}));

// 2. Mock expo-localization so i18n defaults to pt-BR
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'pt-BR', languageCode: 'pt' }],
}));
