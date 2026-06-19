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

// 3. Mock @sentry/react-native globally with a no-op stub.
//    The real module arms a module-scope setInterval (AsyncExpiringMap cleanup
//    ticker in timeToDisplayFallback) the instant it is require()'d. That timer
//    is never .unref()'d, so it keeps the Jest worker alive after the suite
//    ends and triggers the "worker process has failed to exit gracefully …
//    ensure that .unref() was called" warning. Suites that need to assert on
//    Sentry calls declare their own jest.mock('@sentry/react-native', …),
//    which takes precedence over this global stub; everything else just gets
//    the no-op and never loads the leaking real module.
jest.mock('@sentry/react-native', () => {
  const noop = () => undefined;
  const scope = {
    setTag: noop,
    setContext: noop,
    setExtra: noop,
    setLevel: noop,
    setUser: noop,
  };
  return {
    init: noop,
    wrap: <T>(component: T): T => component,
    addBreadcrumb: noop,
    captureException: noop,
    captureMessage: noop,
    setUser: noop,
    setTag: noop,
    setContext: noop,
    withScope: (cb: (s: typeof scope) => void) => cb(scope),
  };
});
