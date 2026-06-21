/**
 * Tests for getSentryRelease() — canonical Sentry release/dist resolver.
 *
 * Strategy: mutate the `Constants.expoConfig` mock object between tests
 * (avoids `jest.resetModules()` which would break the rest of the suite).
 */

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      slug: 'rumo-pragas',
      version: '1.0.6',
      ios: { buildNumber: '41' },
      android: { versionCode: 32 },
    },
  },
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

import { getSentryRelease } from '../../services/sentry-release';

// Type-safe handle to the mock so tests can mutate per-case.
 
const ConstantsMock = require('expo-constants').default as {
  expoConfig: {
    slug?: string;
    version?: string;
    ios?: { buildNumber?: string };
    android?: { versionCode?: number };
  } | null;
};

 
const RNMock = require('react-native') as { Platform: { OS: string } };

describe('getSentryRelease', () => {
  const originalConfig = JSON.parse(JSON.stringify(ConstantsMock.expoConfig));
  const originalPlatform = RNMock.Platform.OS;
  const originalEnv = process.env.EXPO_PUBLIC_BUILD_ID;

  afterEach(() => {
    ConstantsMock.expoConfig = JSON.parse(JSON.stringify(originalConfig));
    RNMock.Platform.OS = originalPlatform;
    if (originalEnv === undefined) {
      delete process.env.EXPO_PUBLIC_BUILD_ID;
    } else {
      process.env.EXPO_PUBLIC_BUILD_ID = originalEnv;
    }
  });

  it('iOS: uses ios.buildNumber when EXPO_PUBLIC_BUILD_ID not set', () => {
    delete process.env.EXPO_PUBLIC_BUILD_ID;
    RNMock.Platform.OS = 'ios';
    const r = getSentryRelease();
    expect(r.release).toBe('rumo-pragas@1.0.6+41');
    expect(r.dist).toBe('41');
    expect(r.buildId).toBe('41');
    expect(r.slug).toBe('rumo-pragas');
    expect(r.version).toBe('1.0.6');
  });

  it('Android: uses android.versionCode stringified when EXPO_PUBLIC_BUILD_ID not set', () => {
    delete process.env.EXPO_PUBLIC_BUILD_ID;
    RNMock.Platform.OS = 'android';
    const r = getSentryRelease();
    expect(r.release).toBe('rumo-pragas@1.0.6+32');
    expect(r.dist).toBe('32');
  });

  it('EXPO_PUBLIC_BUILD_ID overrides platform buildNumber on iOS', () => {
    process.env.EXPO_PUBLIC_BUILD_ID = '99';
    RNMock.Platform.OS = 'ios';
    const r = getSentryRelease();
    expect(r.release).toBe('rumo-pragas@1.0.6+99');
    expect(r.dist).toBe('99');
  });

  it('EXPO_PUBLIC_BUILD_ID overrides platform buildNumber on Android', () => {
    process.env.EXPO_PUBLIC_BUILD_ID = '99';
    RNMock.Platform.OS = 'android';
    const r = getSentryRelease();
    expect(r.release).toBe('rumo-pragas@1.0.6+99');
    expect(r.dist).toBe('99');
  });

  it('Empty EXPO_PUBLIC_BUILD_ID falls through to platform buildNumber', () => {
    process.env.EXPO_PUBLIC_BUILD_ID = '';
    RNMock.Platform.OS = 'ios';
    const r = getSentryRelease();
    expect(r.release).toBe('rumo-pragas@1.0.6+41');
  });

  it("falls back to '0' when no buildNumber and no env override", () => {
    delete process.env.EXPO_PUBLIC_BUILD_ID;
    RNMock.Platform.OS = 'ios';
    ConstantsMock.expoConfig = { slug: 'rumo-pragas', version: '1.0.6' };
    const r = getSentryRelease();
    expect(r.release).toBe('rumo-pragas@1.0.6+0');
    expect(r.dist).toBe('0');
  });

  it("uses 'app' slug and '0.0.0' version when expoConfig missing fields", () => {
    delete process.env.EXPO_PUBLIC_BUILD_ID;
    ConstantsMock.expoConfig = {};
    const r = getSentryRelease();
    expect(r.release).toBe('app@0.0.0+0');
    expect(r.slug).toBe('app');
    expect(r.version).toBe('0.0.0');
  });

  it('handles null expoConfig gracefully', () => {
    delete process.env.EXPO_PUBLIC_BUILD_ID;
    ConstantsMock.expoConfig = null as never;
    const r = getSentryRelease();
    expect(r.release).toBe('app@0.0.0+0');
  });
});
