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

// 3. react-native-reanimated mock lives in `__mocks__/react-native-reanimated.js`
// (auto-resolved by Jest when we declare `jest.mock(name)` without a factory).
// The official `react-native-reanimated/mock` shim transitively requires
// `react-native-worklets` which crashes at module-eval in Node. Our hand-
// rolled mock covers only the surface our components touch.
jest.mock('react-native-reanimated');

// 4. expo-linear-gradient renders a native view; in tests we just need a
// passthrough View so Shimmer/empty-state snapshots don't crash.
jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: View };
});

// 5. expo-haptics — silent no-op in tests. Components fire-and-forget the
// promise (`.catch(() => {})`) so we can safely return undefined.
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
