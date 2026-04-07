import '../i18n';
import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SplashScreen from 'expo-splash-screen';
import * as Sentry from '@sentry/react-native';
import { AuthProvider, useAuthContext } from '../contexts/AuthContext';
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
  // Disable in development to avoid noise
  enabled: !__DEV__,
  // Capture 20% of transactions for performance monitoring
  tracesSampleRate: 0.2,
  // Only send events in production
  environment: __DEV__ ? 'development' : 'production',
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

function RootLayoutNav() {
  const { isAuthenticated, isLoading, user } = useAuthContext();
  const segments = useSegments();
  const router = useRouter();
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState<boolean | null>(null);

  // Register for push notifications only after the user is authenticated
  useNotifications(isAuthenticated);

  // Auto-sync queued offline diagnoses when connectivity returns
  useDiagnosisSync();

  // Check for OTA updates on app launch (only in production builds)
  useOTAUpdate();

  // Initialise RevenueCat for in-app purchases (never blocks startup)
  useEffect(() => {
    initializePurchases(user?.id).catch((e) =>
      console.warn('[RevenueCat] Init failed (non-blocking):', e),
    );
  }, [user?.id]);

  // Initialize analytics and subscription sync when user is authenticated
  useEffect(() => {
    if (user?.id) {
      initAnalytics(user.id);
      syncSubscriptionToSupabase(user.id).catch(() => {});
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
    AsyncStorage.getItem(ONBOARDING_KEY).then((value) => {
      setHasSeenOnboarding(value === 'true');
    });
  }, []);

  // Hide splash screen once auth state and onboarding check are resolved
  useEffect(() => {
    if (!isLoading && hasSeenOnboarding !== null) {
      SplashScreen.hideAsync();
    }
  }, [isLoading, hasSeenOnboarding]);

  useEffect(() => {
    if (isLoading || hasSeenOnboarding === null) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = segments[0] === 'onboarding';

    if (!hasSeenOnboarding && !inOnboarding) {
      router.replace('/onboarding');
    } else if (!isAuthenticated && !inAuthGroup && hasSeenOnboarding) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && (inAuthGroup || inOnboarding)) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isLoading, segments, hasSeenOnboarding, router]);

  if (isLoading || hasSeenOnboarding === null) {
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
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="edit-profile" options={{ presentation: 'modal' }} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
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
        <RootLayoutNav />
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
