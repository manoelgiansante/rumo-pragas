import '../i18n';
import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, StyleSheet, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SplashScreen from 'expo-splash-screen';
// Apple 2.1(a) iPad iOS 26.5 bn40 fix: NO top-level `import * as Sentry`.
// Top-level package-namespace import evaluates `@sentry/react-native`'s
// index at JS bundle eval time, which on iPad iOS 26 + New Architecture
// (TurboModules) can synchronously register native modules BEFORE the
// React Native bridge is fully warm → SIGABRT / "indefinite loading screen"
// observed by Apple reviewer on iPad Air 11" M3 iPadOS 26.5 (rejected bn38).
// Same vector that rejected Rumo Finance build 22 (2026-04-27).
// All Sentry calls now go through `safeSentry` below (lazy require + try/catch).
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
      const SS = require('expo-splash-screen');
      SS?.hideAsync?.()?.catch?.(() => {
        /* swallow: splash hide failure is non-fatal */
      });
    } catch {
      /* swallow: missing native module on web/test — non-fatal */
    }
  }, 12000);
} catch {
  /* swallow: setTimeout itself shouldn't throw, but guard for paranoia */
}

// Sentry lazy module loader — iPad iOS 26.5 TurboModule warmup defense.
//
// Why we use require() instead of `import * as Sentry from ...`:
// On iPad iOS 26.5 + New Architecture, the package-namespace import is
// evaluated at JS bundle eval time and synchronously touches TurboModule
// registration → SIGABRT / unresponsive splash before the RN bridge is
// fully warm (Apple Guideline 2.1(a) reject vector, reproduced on iPad
// Air 11" M3 / iPadOS 26.5, bn38). Lazy require() defers the touch to
// AFTER first useEffect, when the bridge is guaranteed ready.
//
// Memoization keeps every call cheap; null on failure degrades silently.
type SentryModule = typeof import('@sentry/react-native');
let cachedSentry: SentryModule | null = null;
let triedSentry = false;
function getSentry(): SentryModule | null {
  if (cachedSentry) return cachedSentry;
  if (triedSentry) return null;
  triedSentry = true;
  try {
    cachedSentry = require('@sentry/react-native') as SentryModule;
    return cachedSentry;
  } catch {
    return null;
  }
}

// Safe wrappers — every Sentry call swallows errors. Never crash the app on
// Sentry failure. Module load is lazy (first call only).
const safeSentry = {
  setUser(user: { id: string } | null): void {
    try {
      getSentry()?.setUser(user);
    } catch {
      /* swallow */
    }
  },
  setTag(key: string, value: string): void {
    try {
      getSentry()?.setTag(key, value);
    } catch {
      /* swallow */
    }
  },
};

let sentryInitialized = false;
function initSentryOnce() {
  if (sentryInitialized) return;
  try {
    const Sentry = getSentry();
    if (!Sentry) {
      sentryInitialized = true;
      return;
    }
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

  // Check for OTA updates ONLY after auth + onboarding gates clear.
  // Apple 2.1(a) iPad reviewer fix (2026-05-16, bn37): cold-launch OTA Alert
  // was being misread as a login error by the reviewer. Now deferred so the
  // login screen is never interrupted by a system dialog.
  useOTAUpdate(isAuthenticated && hasSeenOnboarding === true);

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
      // Uses safeSentry wrapper (lazy require + try/catch) — never blocks auth flow.
      safeSentry.setUser({ id: user.id });
      safeSentry.setTag('app.platform', Platform.OS);
      safeSentry.setTag('app.version', Constants.expoConfig?.version ?? 'unknown');
    } else {
      resetAnalytics();
      stopSubscriptionListener();
      safeSentry.setUser(null);
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

// P0 (mega audit 2026-05-13): Sentry.wrap removed.
// Wrapping at module scope evaluates Sentry HOC during JS bundle eval — exactly
// the iOS 26 New Architecture crash pattern that motivated the lazy
// `initSentryOnce()` deferred to RootLayout's first useEffect (lines 39-44).
// ErrorBoundary (components/ErrorBoundary.tsx) already wraps the tree; Sentry
// captures unhandled errors via `enableNative + attachStacktrace` once init has
// fired in the first render. No automatic error boundary is lost — we trade it
// for guaranteed cold-start safety on iPad iOS 26 reviewer devices.
export default RootLayout;

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
});
