/**
 * Tests for contexts/NavigationGateContext.tsx
 *
 * This provider is the reactive half of the RUMO-PRAGAS-7/8 fix: it replaces the
 * "read AsyncStorage once on mount, never refresh" state that went stale and made
 * app/_layout bounce the reviewer back to /consent-location forever. The key
 * guarantee tested here: calling markLocationConsentSeen() / markOnboardingSeen()
 * flips the flag SYNCHRONOUSLY in the provider, so a consumer (the layout) re-runs
 * with the fresh value instead of the stale false.
 */
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { NavigationGateProvider, useNavigationGate } from '../../contexts/NavigationGateContext';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const AsyncStorage = require('@react-native-async-storage/async-storage');

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <NavigationGateProvider>{children}</NavigationGateProvider>
);

describe('NavigationGateContext', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('throws when used outside the provider', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useNavigationGate())).toThrow(
      'useNavigationGate must be used within a NavigationGateProvider',
    );
    spy.mockRestore();
  });

  it('resolves both flags to false on a fresh install', async () => {
    const { result } = renderHook(() => useNavigationGate(), { wrapper });
    await waitFor(() => {
      expect(result.current.hasSeenOnboarding).toBe(false);
      expect(result.current.hasSeenLocationConsent).toBe(false);
    });
  });

  it('hydrates flags to true when storage already has them', async () => {
    await AsyncStorage.setItem('@rumo_pragas_onboarding_seen', 'true');
    await AsyncStorage.setItem('@rumo_pragas_location_consent_shown', 'true');
    const { result } = renderHook(() => useNavigationGate(), { wrapper });
    await waitFor(() => {
      expect(result.current.hasSeenOnboarding).toBe(true);
      expect(result.current.hasSeenLocationConsent).toBe(true);
    });
  });

  it('markLocationConsentSeen flips the flag reactively (kills the stale-read race)', async () => {
    const { result } = renderHook(() => useNavigationGate(), { wrapper });
    await waitFor(() => expect(result.current.hasSeenLocationConsent).toBe(false));

    act(() => {
      result.current.markLocationConsentSeen();
    });

    // Reactive flip is synchronous — the consumer (layout) sees `true` immediately,
    // so it routes to (tabs) instead of bouncing back to /consent-location.
    expect(result.current.hasSeenLocationConsent).toBe(true);

    // ...and it is also persisted so the next cold start reads it back.
    await waitFor(async () => {
      expect(await AsyncStorage.getItem('@rumo_pragas_location_consent_shown')).toBe('true');
    });
  });

  it('markOnboardingSeen flips the flag reactively and persists', async () => {
    const { result } = renderHook(() => useNavigationGate(), { wrapper });
    await waitFor(() => expect(result.current.hasSeenOnboarding).toBe(false));

    act(() => {
      result.current.markOnboardingSeen();
    });

    expect(result.current.hasSeenOnboarding).toBe(true);
    await waitFor(async () => {
      expect(await AsyncStorage.getItem('@rumo_pragas_onboarding_seen')).toBe('true');
    });
  });

  it('setters are referentially stable across renders (no effect churn in consumers)', async () => {
    const { result, rerender } = renderHook(() => useNavigationGate(), { wrapper });
    await waitFor(() => expect(result.current.hasSeenOnboarding).toBe(false));
    const first = result.current.markLocationConsentSeen;
    rerender({});
    expect(result.current.markLocationConsentSeen).toBe(first);
  });
});
