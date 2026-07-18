import { useState, useCallback } from 'react';
import * as Location from 'expo-location';
import i18n from '../i18n';
import { minimizeCoordinates } from '../services/locationPrivacy';
import { hasLocationConsent } from '../services/userPreferences';

interface LocationState {
  location: { latitude: number; longitude: number } | null;
  cityName: string | null;
  isLoading: boolean;
  error: string | null;
}

const APP_CONSENT_LOOKUP_TIMEOUT_MS = 2_000;

export function useLocation() {
  const [state, setState] = useState<LocationState>({
    location: null,
    cityName: null,
    isLoading: false,
    error: null,
  });

  const requestPermission = useCallback(async (): Promise<boolean> => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setState((prev) => ({
        ...prev,
        error: i18n.t('errors.locationPermissionDenied'),
      }));
      return false;
    }
    return true;
  }, []);

  const getCurrentLocation = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const granted = await requestPermission();
      if (!granted) {
        setState((prev) => ({ ...prev, isLoading: false }));
        return null;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const coords = minimizeCoordinates(position.coords.latitude, position.coords.longitude);
      if (!coords) throw new Error(i18n.t('errors.locationError'));

      // Reverse geocode to get city name
      let cityName: string | null = null;
      try {
        const [place] = await Location.reverseGeocodeAsync(coords);
        if (place) {
          cityName = place.city ?? place.subregion ?? place.region ?? null;
        }
      } catch {
        // Reverse geocode can fail silently - location coords are still valid
      }

      setState({
        location: coords,
        cityName,
        isLoading: false,
        error: null,
      });

      return coords;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : i18n.t('errors.locationError');
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: message,
      }));
      return null;
    }
  }, [requestPermission]);

  const getCurrentLocationWithConsent = useCallback(
    async (userId: string) => {
      if (!userId.trim()) return null;
      let consentTimer: ReturnType<typeof setTimeout> | null = null;
      try {
        // This check occurs before requestPermission(), so a declined or
        // unavailable app-level consent can never trigger an OS prompt or a
        // native coordinate/geocode call.
        const consented = await Promise.race([
          hasLocationConsent(userId),
          new Promise<false>((resolve) => {
            consentTimer = setTimeout(() => resolve(false), APP_CONSENT_LOOKUP_TIMEOUT_MS);
          }),
        ]);
        if (!consented) return null;
      } catch {
        return null;
      } finally {
        if (consentTimer) clearTimeout(consentTimer);
      }
      return getCurrentLocation();
    },
    [getCurrentLocation],
  );

  return {
    ...state,
    requestPermission,
    getCurrentLocation,
    getCurrentLocationWithConsent,
  };
}
