import '../i18n';
import { useEffect, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, StyleSheet, Platform, Dimensions } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { getSentryRelease } from '../services/sentry-release';
import { AuthProvider, useAuthContext } from '../contexts/AuthContext';
import { DiagnosisProvider } from '../contexts/DiagnosisContext';
import { NavigationGateProvider, useNavigationGate } from '../contexts/NavigationGateContext';
import { GATE_HREF, needsRedirect, resolveGateTarget } from '../services/navigationGate';
import { useNotifications } from '../hooks/useNotifications';
import { useDiagnosisSync } from '../hooks/useDiagnosisSync';
import { useOTAUpdate } from '../hooks/useOTAUpdate';
import { initAnalytics, resetAnalytics } from '../services/analytics';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { OfflineBanner } from '../components/OfflineBanner';
import { Colors } from '../constants/theme';

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
    // W17-4 (2026-05-22): canonical `<slug>@<version>+<buildId>` release ID
    // resolved by getSentryRelease(). Reads EXPO_PUBLIC_BUILD_ID env override
    // first (set by EAS), then falls back to platform-specific buildNumber.
    // Backward-compat: `extra.sentryRelease` in app.json still wins if set
    // (legacy escape hatch — prefer not to set it).
    const expoConfig = Constants.expoConfig;
    const { release: defaultRelease, dist: defaultDist } = getSentryRelease();
    const sentryRelease =
      (expoConfig?.extra as { sentryRelease?: string } | undefined)?.sentryRelease ??
      defaultRelease;
    const sentryDist = defaultDist;

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

// -----------------------------------------------------------------------------
// ABSOLUTE SPLASH WATCHDOG (Apple Guideline 2.1(a) — iPad freeze defense)
// -----------------------------------------------------------------------------
// Apple repeatedly rejected the app for "freezes on the loading screen" on
// iPad (iPadOS 26.5) during cold start / Sign in with Apple. Root cause class:
// the splash is only hidden from inside React effects (auth + onboarding +
// consent checks). If ANY of the following stalls, the splash NEVER hides and
// the app appears permanently frozen:
//   - react-native-safe-area-context's native NativeSafeAreaProvider never
//     reports insets (it gates ALL children behind `insets != null`), so the
//     entire React tree — including the effects that hide the splash — never
//     mounts. The useAuth() 8s timeout cannot help because its effect never runs.
//   - getSession()/RevenueCat/network hangs on the reviewer's slow/proxied wifi.
//   - A TurboModule init throws during bundle eval on iOS 26 New Architecture.
//
// This watchdog is armed at MODULE scope (independent of React render) and
// force-hides the splash after a hard ceiling. It guarantees the user always
// reaches an interactive screen, even if the React tree never mounts.
const SPLASH_WATCHDOG_MS = 10000;
let splashHidden = false;

function safeHideSplash(reason: 'ready' | 'watchdog'): void {
  if (splashHidden) return;
  splashHidden = true;
  if (splashWatchdogTimer) {
    clearTimeout(splashWatchdogTimer);
    splashWatchdogTimer = null;
  }
  // hideAsync can reject if called before the native module is ready or twice;
  // never let that bubble. Use .catch on the returned promise AND a try/catch
  // around the synchronous call surface.
  try {
    void SplashScreen.hideAsync().catch(() => {
      /* splash already hidden / not yet shown — non-fatal */
    });
  } catch {
    /* non-fatal */
  }
  if (__DEV__ && reason === 'watchdog') {
    console.warn('[splash] watchdog fired — forcing hideAsync (bootstrap stalled)');
  }
}

let splashWatchdogTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
  safeHideSplash('watchdog');
}, SPLASH_WATCHDOG_MS);

function RootLayoutNav() {
  const { isAuthenticated, isLoading, user } = useAuthContext();
  const segments = useSegments();
  const router = useRouter();
  // Gate flags live in a reactive provider (NavigationGateContext) — NOT in
  // local state read once on mount. This is the fix for the stale-read half of
  // the RUMO-PRAGAS-7/8 infinite loop: when consent-location / onboarding finish,
  // they call the provider setters, so this layout re-runs its routing effect
  // with FRESH flags instead of a stale `false` that bounced the user back.
  const { hasSeenOnboarding, hasSeenLocationConsent } = useNavigationGate();

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

  // Initialise RevenueCat for in-app purchases (never blocks startup).
  // The purchases service is loaded LAZILY via require() inside the effect —
  // NOT imported at module scope — so `react-native-purchases` (a StoreKit
  // TurboModule) is never pulled into the root layout's bundle-eval path. On
  // iPad/iOS 26 New Architecture, evaluating that native module during cold
  // start was a freeze/SIGABRT risk. Deferring to a post-mount effect means it
  // only runs once React is alive and the splash watchdog is armed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { initializePurchases } = await import('../services/purchases');
        if (cancelled) return;
        await initializePurchases(user?.id);
      } catch (e) {
        if (__DEV__) console.warn('[RevenueCat] Init failed (non-blocking):', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Initialize analytics and subscription sync when user is authenticated.
  // subscriptionSync (also a react-native-purchases consumer) is lazy-loaded
  // for the same iPad cold-start reason as above.
  useEffect(() => {
    if (user?.id) {
      const uid = user.id;
      initAnalytics(uid);
      (async () => {
        try {
          const { syncSubscriptionToSupabase, startSubscriptionListener } =
            await import('../services/subscriptionSync');
          await syncSubscriptionToSupabase(uid);
          startSubscriptionListener(uid);
        } catch (err: unknown) {
          if (__DEV__) console.error('[Layout] Subscription sync failed:', err);
        }
      })();
      // Set Sentry user context for crash reports — ID ONLY, no PII (no email).
      // beforeSend strips email defensively, but we also avoid passing it here.
      Sentry.setUser({ id: uid });
      Sentry.setTag('app.platform', Platform.OS);
      Sentry.setTag('app.version', Constants.expoConfig?.version ?? 'unknown');
    } else {
      resetAnalytics();
      (async () => {
        try {
          const { stopSubscriptionListener } = await import('../services/subscriptionSync');
          stopSubscriptionListener();
        } catch {
          /* non-fatal */
        }
      })();
      Sentry.setUser(null);
    }
  }, [user?.id, user?.email]);

  // Hide splash screen once auth state, onboarding and consent checks are
  // resolved. safeHideSplash() is idempotent and also disarms the absolute
  // watchdog so the two never race / double-call hideAsync.
  useEffect(() => {
    if (!isLoading && hasSeenOnboarding !== null && hasSeenLocationConsent !== null) {
      safeHideSplash('ready');
    }
  }, [isLoading, hasSeenOnboarding, hasSeenLocationConsent]);

  // ---------------------------------------------------------------------------
  // SINGLE SOURCE-OF-TRUTH ROUTING (fix for RUMO-PRAGAS-7/8 — Apple 2.1.0)
  // ---------------------------------------------------------------------------
  // resolveGateTarget() is a PURE function of the gate state: it returns exactly
  // one top-level target route (or null while not ready). We then replace ONLY
  // when the current segment differs from that target — and we guard with a ref
  // holding the last target we already issued a replace toward, so the same
  // replace is never fired twice while it is in flight.
  //
  // Why this makes the loop impossible:
  //   * `useSegments()` is a useSyncExternalStore. The OLD code mutated that
  //     store (router.replace) on every effect re-run whose condition was still
  //     true, and because `hasSeenLocationConsent` was a STALE `false`, the
  //     condition stayed true forever → re-render → re-run → replace → loop →
  //     "Maximum update depth exceeded".
  //   * Now: (a) the flags are fresh (provider), so once consent is marked the
  //     target becomes '(tabs)' and STAYS '(tabs)'. (b) Even during the brief
  //     window where `segments[0]` has not yet caught up to the target, the ref
  //     guard suppresses any repeat replace toward the same target, so at most
  //     ONE replace per distinct target is ever issued. When `segments[0]`
  //     finally equals the target we clear the ref (arrival), ready for the next
  //     legitimate transition. No oscillation is reachable.
  const lastIssuedTargetRef = useRef<string | null>(null);
  const currentSegment = segments[0];

  useEffect(() => {
    const target = resolveGateTarget({
      isLoading,
      isAuthenticated,
      hasSeenOnboarding,
      hasSeenLocationConsent,
    });

    // Not ready yet (still loading / flags unresolved) — render spinner, no nav.
    if (target === null) return;

    // Arrived at the target: clear the in-flight guard so a future legitimate
    // transition (e.g. logout) can navigate again.
    if (currentSegment === target) {
      lastIssuedTargetRef.current = null;
      return;
    }

    // Already issued a replace toward this exact target and still waiting for the
    // segment store to catch up — do NOT issue it again (this is the line that
    // structurally prevents the infinite-update loop).
    if (lastIssuedTargetRef.current === target) return;

    if (needsRedirect(currentSegment, target)) {
      lastIssuedTargetRef.current = target;
      router.replace(GATE_HREF[target]);
    }
  }, [
    isAuthenticated,
    isLoading,
    currentSegment,
    hasSeenOnboarding,
    hasSeenLocationConsent,
    router,
  ]);

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

// iPad freeze defense (Apple Guideline 2.1(a)): guarantee non-null safe-area
// insets on the FIRST render so the React tree always mounts immediately.
//
// react-native-safe-area-context's native provider renders its children only
// once the native side reports insets (`insets != null`). expo-router mounts
// an outer SafeAreaProvider WITHOUT initialMetrics on native, so if that native
// inset event is delayed/never fires on iPad/iOS 26, the entire app tree —
// including the effects that hide the splash — never mounts and the app looks
// frozen on the loading screen. Providing initialMetrics here (the same pattern
// react-navigation's SafeAreaProviderCompat uses) makes insets non-null
// synchronously, so the tree mounts on frame 1 regardless of the native event.
const { width: WINDOW_WIDTH, height: WINDOW_HEIGHT } = Dimensions.get('window');
const SAFE_AREA_INITIAL_METRICS = initialWindowMetrics ?? {
  frame: { x: 0, y: 0, width: WINDOW_WIDTH, height: WINDOW_HEIGHT },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function RootLayout() {
  // Lazy Sentry init — deferred to first render to avoid module-scope native
  // calls that crash on iOS 26 TurboModule bridge (SIGABRT on cold start).
  useEffect(() => {
    initSentryOnce();
  }, []);

  return (
    <SafeAreaProvider initialMetrics={SAFE_AREA_INITIAL_METRICS}>
      <ErrorBoundary>
        <AuthProvider>
          <NavigationGateProvider>
            <DiagnosisProvider>
              <RootLayoutNav />
            </DiagnosisProvider>
          </NavigationGateProvider>
        </AuthProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
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
