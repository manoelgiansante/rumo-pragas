import { renderHook, act } from '@testing-library/react-native';

const mockRequestForegroundPermissionsAsync = jest.fn();
const mockGetCurrentPositionAsync = jest.fn();
const mockReverseGeocodeAsync = jest.fn();
const mockHasLocationConsent = jest.fn();

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: (...args: unknown[]) =>
    mockRequestForegroundPermissionsAsync(...args),
  getCurrentPositionAsync: (...args: unknown[]) => mockGetCurrentPositionAsync(...args),
  reverseGeocodeAsync: (...args: unknown[]) => mockReverseGeocodeAsync(...args),
  Accuracy: { Balanced: 3 },
}));

jest.mock('../../services/userPreferences', () => ({
  hasLocationConsent: (...args: unknown[]) => mockHasLocationConsent(...args),
}));

import { useLocation } from '../../hooks/useLocation';

beforeEach(() => {
  jest.clearAllMocks();
  mockHasLocationConsent.mockResolvedValue(true);
});

describe('useLocation', () => {
  it('starts with null location and not loading', () => {
    const { result } = renderHook(() => useLocation());
    expect(result.current.location).toBeNull();
    expect(result.current.cityName).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('getCurrentLocation returns coords on success', async () => {
    mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockGetCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: -23.55, longitude: -46.63 },
    });
    mockReverseGeocodeAsync.mockResolvedValue([
      { city: 'Sao Paulo', subregion: 'SP', region: 'SP' },
    ]);

    const { result } = renderHook(() => useLocation());

    let coords: unknown;
    await act(async () => {
      coords = await result.current.getCurrentLocation();
    });

    expect(coords).toEqual({ latitude: -23.55, longitude: -46.63 });
    expect(result.current.location).toEqual({ latitude: -23.55, longitude: -46.63 });
    expect(result.current.cityName).toBe('Sao Paulo');
    expect(result.current.isLoading).toBe(false);
  });

  it('returns null when permission is denied', async () => {
    mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });

    const { result } = renderHook(() => useLocation());

    let coords: unknown;
    await act(async () => {
      coords = await result.current.getCurrentLocation();
    });

    expect(coords).toBeNull();
    expect(result.current.error).toBeTruthy();
  });

  it('handles location error gracefully', async () => {
    mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockGetCurrentPositionAsync.mockRejectedValue(new Error('Location unavailable'));

    const { result } = renderHook(() => useLocation());

    await act(async () => {
      await result.current.getCurrentLocation();
    });

    expect(result.current.location).toBeNull();
    expect(result.current.error).toBe('Location unavailable');
    expect(result.current.isLoading).toBe(false);
  });

  it('handles reverse geocode failure gracefully', async () => {
    mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockGetCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: -20.0, longitude: -44.0 },
    });
    mockReverseGeocodeAsync.mockRejectedValue(new Error('Geocode fail'));

    const { result } = renderHook(() => useLocation());

    await act(async () => {
      await result.current.getCurrentLocation();
    });

    // Location should still be set even if geocode fails
    expect(result.current.location).toEqual({ latitude: -20.0, longitude: -44.0 });
    expect(result.current.cityName).toBeNull();
  });

  it('requestPermission returns true when granted', async () => {
    mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });

    const { result } = renderHook(() => useLocation());

    let granted: boolean = false;
    await act(async () => {
      granted = await result.current.requestPermission();
    });

    expect(granted).toBe(true);
  });

  it('requestPermission returns false when denied', async () => {
    mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });

    const { result } = renderHook(() => useLocation());

    let granted: boolean = true;
    await act(async () => {
      granted = await result.current.requestPermission();
    });

    expect(granted).toBe(false);
    expect(result.current.error).toBeTruthy();
  });

  it('never touches native location APIs when app-level consent was declined', async () => {
    mockHasLocationConsent.mockResolvedValueOnce(false);
    const { result } = renderHook(() => useLocation());

    let coords: unknown;
    await act(async () => {
      coords = await result.current.getCurrentLocationWithConsent('user-a');
    });

    expect(coords).toBeNull();
    expect(mockHasLocationConsent).toHaveBeenCalledWith('user-a');
    expect(mockRequestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(mockGetCurrentPositionAsync).not.toHaveBeenCalled();
    expect(mockReverseGeocodeAsync).not.toHaveBeenCalled();
  });

  it('uses only rounded coordinates after app and OS consent are granted', async () => {
    mockHasLocationConsent.mockResolvedValueOnce(true);
    mockRequestForegroundPermissionsAsync.mockResolvedValueOnce({ status: 'granted' });
    mockGetCurrentPositionAsync.mockResolvedValueOnce({
      coords: { latitude: -23.55052, longitude: -46.633308 },
    });
    mockReverseGeocodeAsync.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useLocation());

    let coords: unknown;
    await act(async () => {
      coords = await result.current.getCurrentLocationWithConsent('user-a');
    });

    expect(coords).toEqual({ latitude: -23.55, longitude: -46.63 });
    expect(mockRequestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mockGetCurrentPositionAsync).toHaveBeenCalledTimes(1);
    expect(mockReverseGeocodeAsync).toHaveBeenCalledWith({
      latitude: -23.55,
      longitude: -46.63,
    });
  });
});
