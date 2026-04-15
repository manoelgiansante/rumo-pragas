import '../i18n';
import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, StyleSheet, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SplashScreen from 'expo-splash-screen';
import * as Sentry from '@sentry/react-native';
import { AuthProvider, useAuthContext } from '../contexts/AuthContext';
import { DiagnosisProvider } from '../contexts/DiagnosisContext';
import { useNotifications } from '../hooks/useNotifications';
import { useDiagnosisSync } from '../hooks/useDiagnosisSync';
import { useOTAUpdate } from '../hooks/useOTAUpdate';
import { initializePurchases } from '../services/purchases';
import { initAnalytics, resetAnalytics } from '../services/analytics';
import {
  syncSubscriptionToSupabase,
  startSubscriptionListener,
  stopSubscriptionListener,
} from '../services/subscriptionSync';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { OfflineBanner } from '../components/OfflineBanner';
import { Colors } from '../constants/theme';

// Initialize Sentry for crash reporting & performance monitoring
// SETUP: Replace the DSN below with your real Sentry DSN from sentry.io
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN || '',
  // Only enable when DSN is set AND not in dev
  enabled: !__DEV__ && !!process.env.EXPO_PUBLIC_SENTRY_DSN,
  // Capture 20% of transactions for performance monitoring
  tracesSampleRate: 0.2,
  // Only send events in production
  environment: __DEV__ ? 'development' : 'production',
  // Native crash reporting on iOS/Android
  enableNative: true,
  enableAutoSessionTracking: true,
  // Attach JS stack traces to all events
  attachStacktrace: true,
  // Attach user context when available
  beforeSend(event) {
    // Scrub sensitive data
    if (event.request?.headers) {
      delete event.request.headers['Authorization'];
    }
    return event;
  },
});

// Prevent the splash screen from auto-hiding before data is loaded
SplashScreen.preventAutoHideAsync();

const ONBOARDING_KEY = '@rumo_pragas_onboarding_seen';
const LOCATION_CONSENT_SHOWN_KEY = '@rumo_pragas_location_consent_shown';

function RootLayoutNav() {
  const { isAuthenticated, isLoading, user } = useAuthContext();
  const segments = useSegments();
  const router = useRouter();
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState<boolean | null>(null);
  const [hasSeenLocationConsent, setHasSeenLocationConsent] = useState<boolean | null>(null);

  // Register for push notifications only after the user is authenticated
  useNotifications(isAuthenticated);

  // Auto-sync queued offline diagnoses when connectivity returns
  useDiagnosisSync();

  // Check for OTA updates on app launch (only in production builds)
  useOTAUpdate();

  // ATT (App Tracking Transparency) intentionally removed — Apple guideline 5.1.2:
  // the app does not integrate any ad SDK and does not perform cross-app tracking,
  // so prompting for ATT without a legitimate tracking purpose is grounds for rejection.
  // If ads/cross-app tracking are added in the future: reintroduce with a pre-prompt
  // screen explaining the purpose + gate call behind a post-login guard + AsyncStorage flag.

  // Initialise RevenueCat for in-app purchases (never blocks startup)
  useEffect(() => {
    initializePurchases(user?.id).catch((e) => {
      if (__DEV__) console.warn('[RevenueCat] Init failed (non-blocking):', e);
    });
  }, [user?.id]);

  // Initialize analytics and subscription sync when user is authenticated
  useEffect(() => {
    if (user?.id) {
      initAnalytics(user.id);
      syncSubscriptionToSupabase(user.id).catch((err: unknown) => {
        if (__DEV__) console.error('[Layout] Subscription sync failed:', err);
      });
      startSubscriptionListener(user.id);
      // Set Sentry user context for crash reports
      Sentry.setUser({ id: user.id, email: user.email });
    } else {
      resetAnalytics();
      stopSubscriptionListener();
      Sentry.setUser(null);
    }
  }, [user?.id, user?.email]);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(ONBOARDING_KEY)
      .then((value) => {
        if (mounted) setHasSeenOnboarding(value === 'true');
      })
      .catch((err: unknown) => {
        if (__DEV__) console.error('[Layout] Failed to read onboarding key:', err);
        if (mounted) setHasSeenOnboarding(false);
      });
    // P0-3 (LGPD): Read whether the user has already seen the location consent screen
    AsyncStorage.getItem(LOCATION_CONSENT_SHOWN_KEY)
      .then((value) => {
        if (mounted) setHasSeenLocationConsent(value === 'true');
      })
      .catch((err: unknown) => {
        if (__DEV__) console.error('[Layout] Failed to read consent key:', err);
        if (mounted) setHasSeenLocationConsent(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Hide splash screen once auth state, onboarding and consent checks are resolved
  useEffect(() => {
    if (!isLoading && hasSeenOnboarding !== null && hasSeenLocationConsent !== null) {
      SplashScreen.hideAsync();
    }
  }, [isLoading, hasSeenOnboarding, hasSeenLocationConsent]);

  useEffect(() => {
    if (isLoading || hasSeenOnboarding === null || hasSeenLocationConsent === null) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = segments[0] === 'onboarding';
    const inConsentLocation = segments[0] === 'consent-location';

    if (!hasSeenOnboarding && !inOnboarding) {
      router.replace('/onboarding');
    } else if (!isAuthenticated && !inAuthGroup && hasSeenOnboarding) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && !hasSeenLocationConsent && !inConsentLocation) {
      // P0-3 (LGPD): show explicit consent once per user after first login
      router.replace('/consent-location');
    } else if (
      isAuthenticated &&
      hasSeenLocationConsent &&
      (inAuthGroup || inOnboarding || inConsentLocation)
    ) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isLoading, segments, hasSeenOnboarding, hasSeenLocationConsent, router]);

  if (isLoading || hasSeenOnboarding === null || hasSeenLocationConsent === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <OfflineBanner />
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: Platform.OS === 'ios' ? 'slide_from_right' : 'fade',
        }}
      >
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="consent-location" options={{ gestureEnabled: false }} />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="diagnosis"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="edit-profile"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="paywall"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="terms" />
        <Stack.Screen name="privacy" />
      </Stack>
    </View>
  );
}

function RootLayout() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <DiagnosisProvider>
          <RootLayoutNav />
        </DiagnosisProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

// Wrap with Sentry for automatic error boundary and performance tracking
export default Sentry.wrap(RootLayout);

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
});
