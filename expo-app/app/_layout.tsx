import '../i18n';
import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, StyleSheet, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SplashScreen from 'expo-splash-screen';
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
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

// Absolute splash watchdog — final safety net (Apple 2.1(a) iPad defense).
// 12s absolute timeout: hide splash regardless of app state. Wrapped in
// try/catch for ZERO module-eval crash risk on iOS 26 New Architecture.
try {
  setTimeout(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const SS = require('expo-splash-screen');
      SS?.hideAsync?.()?.catch?.(() => {});
    } catch {}
  }, 12000);
} catch {}

// Sentry lazy init — NEVER call Sentry.init() at module scope.
// On iOS 26 New Architecture (TurboModules), native module calls during JS
// bundle evaluation can raise ObjC exceptions before the RN bridge is ready,
// causing SIGABRT / crash on launch. Init is deferred to the first useEffect
// inside RootLayout, and wrapped in try/catch so a Sentry failure never
// brings down the app. Pattern adopted from Campo Vivo (2026-04-25).
let sentryInitialized = false;
function initSentryOnce() {
  if (sentryInitialized) return;
  try {
    const expoConfig = Constants.expoConfig;
    const appVersion = expoConfig?.version ?? '0.0.0';
    const iosBuildNumber = expoConfig?.ios?.buildNumber;
    const androidVersionCode = expoConfig?.android?.versionCode;
    const sentryDist =
      iosBuildNumber ?? (androidVersionCode != null ? String(androidVersionCode) : undefined);
    const sentryRelease =
      (expoConfig?.extra as { sentryRelease?: string } | undefined)?.sentryRelease ??
      `rumo-pragas@${appVersion}`;

    Sentry.init({
      dsn: process.env.EXPO_PUBLIC_SENTRY_DSN || '',
      enabled: !__DEV__ && !!process.env.EXPO_PUBLIC_SENTRY_DSN,
      tracesSampleRate: 0.1,
      profilesSampleRate: 0.1,
      environment: __DEV__ ? 'development' : 'production',
      release: sentryRelease,
      dist: sentryDist,
      enableNative: true,
      enableAutoSessionTracking: true,
      attachStacktrace: true,
      sendDefaultPii: false,
      beforeSend(event) {
        // Strip Authorization headers (token leak guard)
        if (event.request?.headers) {
          delete event.request.headers['Authorization'];
          delete event.request.headers['authorization'];
          delete event.request.headers['Cookie'];
          delete event.request.headers['cookie'];
        }
        // Never send PII fields on user object
        if (event.user) {
          delete event.user.email;
          delete event.user.username;
          delete event.user.ip_address;
        }
        return event;
      },
      beforeBreadcrumb(breadcrumb) {
        // Drop breadcrumbs that may capture URLs with tokens/secrets
        if (breadcrumb.category === 'xhr' || breadcrumb.category === 'fetch') {
          if (breadcrumb.data?.url && typeof breadcrumb.data.url === 'string') {
            // Strip query strings (may contain tokens)
            breadcrumb.data.url = breadcrumb.data.url.split('?')[0];
          }
        }
        return breadcrumb;
      },
    });
    sentryInitialized = true;
  } catch (err) {
    // Never crash the app on Sentry init failure.
    if (__DEV__) console.warn('[Sentry] init failed (non-fatal):', err);
    sentryInitialized = true;
  }
}

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
      // Set Sentry user context for crash reports — ID ONLY, no PII (no email).
      // beforeSend strips email defensively, but we also avoid passing it here.
      Sentry.setUser({ id: user.id });
      Sentry.setTag('app.platform', Platform.OS);
      Sentry.setTag('app.version', Constants.expoConfig?.version ?? 'unknown');
    } else {
      resetAnalytics();
      stopSubscriptionListener();
      Sentry.setUser(null);
    }
  }, [user?.id, user?.email]);

  useEffect(() => {
    let mounted = true;
    // 8s watchdog: if AsyncStorage hangs (rare but observed on cold start
    // under memory pressure / iOS 26 native bridge stalls) we MUST resolve
    // these flags so the splash hides and the user can proceed. Treat
    // timeout as null/false to keep the safe default flow.
    Promise.race([
      AsyncStorage.getItem(ONBOARDING_KEY),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
    ])
      .then((value) => {
        if (mounted) setHasSeenOnboarding(value === 'true');
      })
      .catch((err: unknown) => {
        if (__DEV__) console.error('[Layout] Failed to read onboarding key:', err);
        if (mounted) setHasSeenOnboarding(false);
      });
    // P0-3 (LGPD): Read whether the user has already seen the location consent screen
    Promise.race([
      AsyncStorage.getItem(LOCATION_CONSENT_SHOWN_KEY),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
    ])
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

    if (!hasSeenOnboarding && !inOnboarding && !inAuthGroup) {
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
  // Lazy Sentry init — deferred to first render to avoid module-scope native
  // calls that crash on iOS 26 TurboModule bridge (SIGABRT on cold start).
  useEffect(() => {
    initSentryOnce();
  }, []);

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
