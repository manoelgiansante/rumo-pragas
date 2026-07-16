import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const mockMarkLocationConsentSeen = jest.fn();
const mockEnqueuePendingLocationConsent = jest.fn();
const mockFlushPendingLocationConsent = jest.fn();
const mockGetLocationConsentRevision = jest.fn();
const mockSetLocationConsent = jest.fn();
const mockTrackEvent = jest.fn();
const mockRequestPermission = jest.fn();
const mockGetCurrentLocationWithConsent = jest.fn();

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('../../contexts/AuthContext', () => ({
  useAuthContext: () => ({ user: { id: USER_ID } }),
}));
jest.mock('../../contexts/NavigationGateContext', () => ({
  useNavigationGate: () => ({ markLocationConsentSeen: mockMarkLocationConsentSeen }),
}));
jest.mock('../../hooks/useLocation', () => ({
  useLocation: () => ({
    requestPermission: (...args: unknown[]) => mockRequestPermission(...args),
    getCurrentLocationWithConsent: (...args: unknown[]) =>
      mockGetCurrentLocationWithConsent(...args),
  }),
}));
jest.mock('../../services/userPreferences', () => ({
  LOCATION_CONSENT_PURPOSE: 'test-location-purpose',
  enqueuePendingLocationConsent: (...args: unknown[]) => mockEnqueuePendingLocationConsent(...args),
  flushPendingLocationConsent: (...args: unknown[]) => mockFlushPendingLocationConsent(...args),
  getLocationConsentRevision: (...args: unknown[]) => mockGetLocationConsentRevision(...args),
  setLocationConsent: (...args: unknown[]) => mockSetLocationConsent(...args),
}));
jest.mock('../../services/analytics', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

import ConsentLocationScreen from '../../app/consent-location';

describe('location-consent withdrawal ordering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFlushPendingLocationConsent.mockResolvedValue(true);
    mockGetLocationConsentRevision.mockResolvedValue(0);
    mockGetCurrentLocationWithConsent.mockResolvedValue(null);
  });

  it('durably queues opt-out before advancing the navigation gate or retrying the server', async () => {
    let releaseQueue!: (value: boolean) => void;
    const queueWrite = new Promise<boolean>((resolve) => {
      releaseQueue = resolve;
    });
    mockEnqueuePendingLocationConsent.mockReturnValueOnce(queueWrite);
    // The pre-fix path tried this server write first and advanced immediately.
    mockSetLocationConsent.mockImplementation(() => new Promise(() => undefined));
    const { getByTestId } = render(<ConsentLocationScreen />);

    fireEvent.press(getByTestId('consent-location-decline'));

    expect(mockEnqueuePendingLocationConsent).toHaveBeenCalledWith(
      USER_ID,
      false,
      'test-location-purpose',
      expect.any(String),
      null,
    );
    expect(mockMarkLocationConsentSeen).not.toHaveBeenCalled();
    expect(mockFlushPendingLocationConsent).not.toHaveBeenCalled();
    expect(mockSetLocationConsent).not.toHaveBeenCalled();
    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(mockGetCurrentLocationWithConsent).not.toHaveBeenCalled();

    releaseQueue(true);
    await queueWrite;
    expect(mockMarkLocationConsentSeen).toHaveBeenCalledTimes(1);
    expect(mockFlushPendingLocationConsent).toHaveBeenCalledWith(USER_ID);
    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(mockGetCurrentLocationWithConsent).not.toHaveBeenCalled();
  });

  it('stays fail-closed when the local withdrawal record cannot be stored', async () => {
    mockEnqueuePendingLocationConsent.mockResolvedValueOnce(false);
    const { getByTestId } = render(<ConsentLocationScreen />);

    fireEvent.press(getByTestId('consent-location-decline'));

    await waitFor(() => expect(mockEnqueuePendingLocationConsent).toHaveBeenCalledTimes(1));
    expect(mockMarkLocationConsentSeen).not.toHaveBeenCalled();
    expect(mockFlushPendingLocationConsent).not.toHaveBeenCalled();
    expect(mockSetLocationConsent).not.toHaveBeenCalled();
    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(mockGetCurrentLocationWithConsent).not.toHaveBeenCalled();
  });

  it('binds Allow to a strict observed revision before queueing and fetching location', async () => {
    mockRequestPermission.mockResolvedValueOnce(true);
    mockGetLocationConsentRevision.mockResolvedValueOnce(7);
    mockEnqueuePendingLocationConsent.mockResolvedValueOnce(true);
    mockGetCurrentLocationWithConsent.mockResolvedValueOnce({ latitude: -23, longitude: -46 });
    const { getByTestId } = render(<ConsentLocationScreen />);

    fireEvent.press(getByTestId('consent-location-accept'));

    await waitFor(() => expect(mockMarkLocationConsentSeen).toHaveBeenCalledTimes(1));
    expect(mockFlushPendingLocationConsent).toHaveBeenCalledWith(USER_ID);
    expect(mockGetLocationConsentRevision).toHaveBeenCalledWith(USER_ID);
    expect(mockEnqueuePendingLocationConsent).toHaveBeenCalledWith(
      USER_ID,
      true,
      'test-location-purpose',
      expect.any(String),
      7,
    );
    expect(mockGetCurrentLocationWithConsent).toHaveBeenCalledWith(USER_ID);
    expect(mockGetLocationConsentRevision.mock.invocationCallOrder[0]).toBeLessThan(
      mockEnqueuePendingLocationConsent.mock.invocationCallOrder[0]!,
    );
    expect(mockEnqueuePendingLocationConsent.mock.invocationCallOrder[0]).toBeLessThan(
      mockMarkLocationConsentSeen.mock.invocationCallOrder[0]!,
    );
  });

  it('keeps Allow fail-closed on revision-read failure and leaves the button retryable', async () => {
    mockRequestPermission.mockResolvedValue(true);
    mockGetLocationConsentRevision
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(8);
    mockEnqueuePendingLocationConsent.mockResolvedValueOnce(true);
    const { getByTestId } = render(<ConsentLocationScreen />);

    fireEvent.press(getByTestId('consent-location-accept'));
    await waitFor(() => expect(mockGetLocationConsentRevision).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(getByTestId('consent-location-accept').props.accessibilityState.disabled).toBe(false),
    );
    expect(mockEnqueuePendingLocationConsent).not.toHaveBeenCalled();
    expect(mockMarkLocationConsentSeen).not.toHaveBeenCalled();
    expect(mockGetCurrentLocationWithConsent).not.toHaveBeenCalled();

    fireEvent.press(getByTestId('consent-location-accept'));
    await waitFor(() => expect(mockMarkLocationConsentSeen).toHaveBeenCalledTimes(1));
    expect(mockRequestPermission).toHaveBeenCalledTimes(2);
    expect(mockEnqueuePendingLocationConsent).toHaveBeenCalledWith(
      USER_ID,
      true,
      'test-location-purpose',
      expect.any(String),
      8,
    );
  });
});
