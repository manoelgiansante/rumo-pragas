import '../i18n';
import { useEffect, useRef, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, StyleSheet, Platform, Dimensions } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_400Regular_Italic,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { AuthProvider, useAuthContext } from '../contexts/AuthContext';
import { DiagnosisProvider } from '../contexts/DiagnosisContext';
import { NavigationGateProvider, useNavigationGate } from '../contexts/NavigationGateContext';
import {
  GATE_HREF,
  isGateOwnedSegment,
  needsRedirect,
  resolveGateTarget,
} from '../services/navigationGate';
import { useNotifications } from '../hooks/useNotifications';
import { useDiagnosisSync } from '../hooks/useDiagnosisSync';
import { useOTAUpdate } from '../hooks/useOTAUpdate';
import { useAppUpdateCheck } from '../hooks/useAppUpdateCheck';
import { initAnalytics, resetAnalytics } from '../services/analytics';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { PragasAccountGate } from '../components/PragasAccountGate';
import { OfflineBanner } from '../components/OfflineBanner';
import { ForceUpdateModal, UpdateBanner } from '../components/AppUpdate';
import { Colors } from '../constants/theme';
import { scrubSensitiveTelemetryText, stripUrlQueryAndFragment } from '../lib/telemetrySanitizer';

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
    Sentry.init({
      dsn: process.env.EXPO_PUBLIC_SENTRY_DSN || '',
      enabled: !__DEV__ && !!process.env.EXPO_PUBLIC_SENTRY_DSN,
      tracesSampleRate: 0.1,
      profilesSampleRate: 0.1,
      environment: __DEV__ ? 'development' : 'production',
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
        if (event.request?.url) {
          event.request.url = stripUrlQueryAndFragment(event.request.url);
        }
        if (event.message) {
          event.message = scrubSensitiveTelemetryText(event.message);
        }
        for (const exception of event.exception?.values ?? []) {
          if (exception.value) {
            exception.value = scrubSensitiveTelemetryText(exception.value);
          }
          if (exception.type) {
            exception.type = scrubSensitiveTelemetryText(exception.type);
          }
        }
        return event;
      },
      beforeBreadcrumb(breadcrumb) {
        // Drop breadcrumbs that may capture URLs with tokens/secrets
        if (breadcrumb.category === 'xhr' || breadcrumb.category === 'fetch') {
          if (breadcrumb.data?.url && typeof breadcrumb.data.url === 'string') {
            // Strip both query and fragment; implicit auth tokens live after #.
            breadcrumb.data.url = stripUrlQueryAndFragment(breadcrumb.data.url);
          }
        }
        if (breadcrumb.message) {
          breadcrumb.message = scrubSensitiveTelemetryText(breadcrumb.message);
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
//   - getSession()/network hangs on the reviewer's slow/proxied wifi.
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
  const {
    isAuthenticated,
    isLoading,
    user,
    session,
    appAccountStatus,
    appAccountError,
    reactivatePragas,
    retryPragasAccountLink,
    signOut,
  } = useAuthContext();
  const segments = useSegments();
  const router = useRouter();

  // Poppins (tipografia de marca AgroRumo) — bundlada localmente, carga ~ms.
  // `fontsReady` entra no gate de splash abaixo, mas NUNCA pode travar o boot:
  // o watchdog absoluto de 10s (defesa Apple 2.1(a)) força o hide de qualquer
  // jeito e, se a fonte falhar, o texto cai no system font silenciosamente.
  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_400Regular_Italic,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });
  // Teto próprio de 3s pra fonte: se o loadAsync pendurar num device problemático
  // (fontsLoaded=false e fontError=null pra sempre), o splash não espera os 10s
  // do watchdog — degrada pro system font e segue. Fonte é polish, não gate duro.
  const [fontTimeoutPassed, setFontTimeoutPassed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setFontTimeoutPassed(true), 3000);
    return () => clearTimeout(timer);
  }, []);
  const fontsReady = fontsLoaded || !!fontError || fontTimeoutPassed;
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

  // In-app STORE update check (jxcn shared `version-check` Edge Function,
  // app=pragas): silent / soft (dismissible banner) / force (blocking modal).
  // Complements useOTAUpdate — OTA covers JS-only updates, this covers new
  // store binaries. Fail-open by design: any error → silent, never crashes.
  const { mode: updateMode, updateInfo, dismiss: dismissUpdate } = useAppUpdateCheck();

  // ATT (App Tracking Transparency) intentionally removed — Apple guideline 5.1.2:
  // the app does not integrate any ad SDK and does not perform cross-app tracking,
  // so prompting for ATT without a legitimate tracking purpose is grounds for rejection.
  // If ads/cross-app tracking are added in the future: reintroduce with a pre-prompt
  // screen explaining the purpose + gate call behind a post-login guard + AsyncStorage flag.

  // The app ships 100% FREE (Apple Guideline 3.1.1) — there is no In-App
  // Purchase and no subscription sync. Entitlement plumbing
  // was removed in fix/pragas-3-1-1-free-sweep-2026-07-03.

  // Initialize analytics + Sentry user context when the user is authenticated.
  useEffect(() => {
    if (user?.id) {
      const uid = user.id;
      initAnalytics(uid);
      // Keep crash telemetry anonymous. The raw auth UUID is linkable personal
      // data and is not needed to diagnose application faults.
      Sentry.setUser(null);
      Sentry.setTag('app.platform', Platform.OS);
      Sentry.setTag('app.version', Constants.expoConfig?.version ?? 'unknown');
    } else {
      resetAnalytics();
      Sentry.setUser(null);
    }
  }, [user?.id]);

  // Hide splash screen once auth state, onboarding and consent checks are
  // resolved. safeHideSplash() is idempotent and also disarms the absolute
  // watchdog so the two never race / double-call hideAsync.
  useEffect(() => {
    if (!isLoading && hasSeenOnboarding !== null && hasSeenLocationConsent !== null && fontsReady) {
      safeHideSplash('ready');
    }
  }, [isLoading, hasSeenOnboarding, hasSeenLocationConsent, fontsReady]);

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
  // Guard against re-firing a replace toward a target we are already in flight
  // toward OR have already arrived at. `arrivedTargetRef` holds the last target
  // the user has actually landed on; once set, we will NEVER replace toward it
  // again until a CONCRETE, DIFFERENT, gate-owned segment is observed (a genuine
  // user-initiated departure, e.g. logout). This is the structural fix for the
  // RUMO-PRAGAS-M Android render loop (see comment block below).
  const lastIssuedTargetRef = useRef<string | null>(null);
  const arrivedTargetRef = useRef<string | null>(null);
  const currentSegment = segments[0];
  const hasBlockedPragasAccount =
    !!session && appAccountStatus !== 'linked' && appAccountStatus !== 'idle';

  // ---------------------------------------------------------------------------
  // RUMO-PRAGAS-M (Android, OTA): "Maximum update depth exceeded" (FATAL)
  // ---------------------------------------------------------------------------
  // Stack: linkTo -> replace -> forceStoreRerender -> (re-render) -> replace ...
  //
  // Root cause (a gap left by the RUMO-PRAGAS-7/8 fix): the OLD guard cleared
  // `lastIssuedTargetRef` to `null` the moment `currentSegment === target`
  // (arrival). On Android (Fabric / New Architecture) `useSegments()` — a
  // useSyncExternalStore — transiently emits `undefined` for `segments[0]`
  // DURING the navigation store churn that `router.replace` itself triggers
  // (`forceStoreRerender`). Because `isGateOwnedSegment(undefined)` is `true`
  // and `undefined !== target`, `needsRedirect(undefined, target)` returned
  // `true`. With the guard freshly cleared on the arrival frame, the effect
  // re-issued `router.replace(target)` on that transient `undefined` frame ->
  // more store churn -> another transient `undefined` -> replace -> infinite
  // nested update -> React's update-depth limit -> fatal.
  //
  // Fix: once we ARRIVE at a target, we record it in `arrivedTargetRef` and
  // refuse to ever replace toward that same target again until a concrete,
  // different, gate-owned segment shows up. A transient `undefined` segment is
  // therefore inert (it is store churn, not a real route) and can never re-arm
  // a redirect. At most ONE replace per genuine target transition is issued.
  useEffect(() => {
    // A valid shared AgroRumo session is never enough to mount Pragas routes.
    // Keep the navigation tree frozen until the app-specific link contract is
    // explicitly resolved (including deletion/reactivation states).
    if (hasBlockedPragasAccount) return;
    const target = resolveGateTarget({
      isLoading,
      isAuthenticated,
      hasSeenOnboarding,
      hasSeenLocationConsent,
    });

    // Not ready yet (still loading / flags unresolved) — render spinner, no nav.
    if (target === null) return;

    // Arrived at the target: record arrival and disarm the in-flight guard. We
    // intentionally do NOT reset `arrivedTargetRef` to null here — it stays
    // pinned to this target so a transient `undefined` segment cannot bounce us.
    if (currentSegment === target) {
      arrivedTargetRef.current = target;
      lastIssuedTargetRef.current = null;
      return;
    }

    // Non-gate-owned route (e.g. `diagnosis`, `edit-profile`, `terms`): the
    // user deliberately pushed a modal/detail route ON TOP of the gate target.
    // The gate must NOT touch them and — crucially — must NOT clear the arrival
    // pin, otherwise returning to the gate target later could re-fire a replace.
    // This is the Apple 2.1(a) fix: tapping "Diagnose Now" pushes `diagnosis`,
    // and the gate now leaves it completely alone instead of bouncing it back to
    // `(tabs)` ("returns to the same screen"). needsRedirect() also short-circuits
    // here; the early-return keeps `arrivedTargetRef` intact as belt-and-braces.
    if (currentSegment !== undefined && !isGateOwnedSegment(currentSegment)) return;

    // Transient `undefined` segment (Android Fabric store churn during a
    // navigation): this is NOT a real route the user is on — never treat it as
    // a reason to redirect once we have already routed at least once.
    if (currentSegment === undefined && arrivedTargetRef.current !== null) return;

    // Any concrete, gate-owned segment that differs from `target` means the user
    // genuinely left the arrived target (e.g. logout): re-arm so the legitimate
    // transition can fire exactly once.
    if (currentSegment !== undefined && currentSegment !== arrivedTargetRef.current) {
      arrivedTargetRef.current = null;
    }

    // We have already arrived at this exact target — do not bounce back to it
    // (covers the case where flags resolve back to a target we are already on).
    if (arrivedTargetRef.current === target) return;

    // Already issued a replace toward this exact target and still waiting for the
    // segment store to catch up — do NOT issue it again (structurally prevents
    // the infinite-update loop while the replace is in flight).
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
    hasBlockedPragasAccount,
  ]);

  if (isLoading || hasSeenOnboarding === null || hasSeenLocationConsent === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  if (hasBlockedPragasAccount) {
    return (
      <PragasAccountGate
        status={appAccountStatus as Exclude<typeof appAccountStatus, 'idle' | 'linked'>}
        error={appAccountError}
        onReactivate={() => {
          void reactivatePragas();
        }}
        onRetry={() => {
          void retryPragasAccountLink();
        }}
        onSignOut={() => {
          void signOut();
        }}
      />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <OfflineBanner />
      <StatusBar style="dark" backgroundColor={Colors.background} />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: Platform.OS === 'ios' ? 'slide_from_right' : 'fade',
        }}
      >
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="update-password" />
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
        <Stack.Screen name="terms" />
        <Stack.Screen name="privacy" />
        <Stack.Screen name="admin/ai-reports" />
      </Stack>
      {/* In-app update (2026-07): force always wins (blocking Modal); the
          soft banner is absolute-positioned at the top and dismissible.
          Rendered AFTER the Stack so the banner stacks above screen content. */}
      {updateMode === 'force' && updateInfo && <ForceUpdateModal updateInfo={updateInfo} />}
      {updateMode === 'soft' && updateInfo && (
        <UpdateBanner
          updateInfo={updateInfo}
          onDismiss={() => {
            void dismissUpdate();
          }}
        />
      )}
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
          <AuthenticatedProviders />
        </AuthProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

function AuthenticatedProviders() {
  const { user } = useAuthContext();
  return (
    <NavigationGateProvider userId={user?.id ?? null}>
      <DiagnosisProvider ownerUserId={user?.id ?? null}>
        <RootLayoutNav />
      </DiagnosisProvider>
    </NavigationGateProvider>
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
