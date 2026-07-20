import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
// Native per-view safe area for the cancel button: correct inside the iOS
// sheet (0 extra) AND on Android edge-to-edge (clears the status bar).
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Colors, FontSize, Gradients, FontFamily, Spacing } from '../../constants/theme';
import { sendDiagnosis } from '../../services/diagnosis';
import { useAuthContext } from '../../contexts/AuthContext';
import { useLocation } from '../../hooks/useLocation';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import {
  addToQueue,
  isDiagnosisQueueCapacityError,
  MAX_DIAGNOSIS_QUEUE_ITEMS,
} from '../../services/diagnosisQueue';
import { useTranslation } from 'react-i18next';
import { useDiagnosis } from '../../contexts/DiagnosisContext';
import { DiagnosisSkeleton } from '../../components/DiagnosisSkeleton';
import { addBreadcrumb, captureException } from '../../services/sentry-shim';
import * as Crypto from 'expo-crypto';

const LOCATION_TIMEOUT_MS = 3000;

export default function LoadingScreen() {
  const { t } = useTranslation();
  const STEPS = [
    t('diagnosis.steps.preparing'),
    t('diagnosis.steps.sending'),
    t('diagnosis.steps.identifying'),
    t('diagnosis.steps.processing'),
  ];
  const { cropApiName } = useLocalSearchParams<{ cropApiName: string }>();
  const { imageBase64 } = useDiagnosis();
  const { session, user } = useAuthContext();
  const { location, getCurrentLocationWithConsent } = useLocation();
  const { isConnected } = useNetworkStatus();
  const [step, setStep] = useState(0);
  const progress = useSharedValue(0);
  const stepOpacity = useSharedValue(1);
  const stepTranslateY = useSharedValue(0);
  const hasStartedAnalysis = useRef(false);
  // Stable for the entire logical diagnosis, including an offline replay.
  const idempotencyKeyRef = useRef(Crypto.randomUUID());
  const isMountedRef = useRef(true);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationRef = useRef(location);
  const isConnectedRef = useRef(isConnected);

  // Keep refs in sync with latest props/state values so async closures don't
  // read stale data (race condition fix: deps [] used to capture initial null).
  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  // Safe setTimeout helper — tracks IDs so cleanup can cancel all pending
  // callbacks when the component unmounts mid-animation/mid-analysis.
  const safeSetTimeout = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      // Drop ID from tracking list and no-op if unmounted
      timeoutsRef.current = timeoutsRef.current.filter((t) => t !== id);
      if (!isMountedRef.current) return;
      fn();
    }, ms);
    timeoutsRef.current.push(id);
    return id;
  };

  useEffect(() => {
    // Guard against StrictMode double-invoke — prevents duplicate Claude API calls
    if (hasStartedAnalysis.current) return;
    hasStartedAnalysis.current = true;

    const interval = setInterval(() => {
      if (!isMountedRef.current) return;
      // Fade out, swap text, fade in — runs on UI thread via Reanimated worklets
      stepOpacity.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.quad) });
      stepTranslateY.value = withTiming(-6, { duration: 180, easing: Easing.out(Easing.quad) });
      safeSetTimeout(() => {
        setStep((s) => Math.min(s + 1, STEPS.length - 1));
        stepTranslateY.value = 6;
        stepOpacity.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
        stepTranslateY.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
      }, 180);
    }, 1500);
    intervalRef.current = interval;

    // Resolve app consent BEFORE any native permission/location call. A user
    // who declined returns immediately with null coordinates; a granted native
    // lookup is bounded so diagnosis never stalls on device services.
    const getDiagnosisLocation = async (): Promise<{
      latitude: number | null;
      longitude: number | null;
    }> => {
      if (!user?.id) return { latitude: null, longitude: null };
      const resolved = await Promise.race([
        getCurrentLocationWithConsent(user.id),
        new Promise<null>((resolve) => {
          safeSetTimeout(() => resolve(null), LOCATION_TIMEOUT_MS);
        }),
      ]);
      if (!resolved) return { latitude: null, longitude: null };
      locationRef.current = resolved;
      return resolved;
    };

    const analyze = async () => {
      const analysisStart = Date.now();
      addBreadcrumb({
        category: 'diagnosis.loading',
        message: 'analyze_started',
        level: 'info',
        data: {
          crop: cropApiName || 'Soybean',
          hasImage: !!imageBase64,
          isConnected: isConnectedRef.current,
        },
      });

      try {
        progress.value = withTiming(0.3, { duration: 1000 });
        addBreadcrumb({
          category: 'diagnosis.loading',
          message: 'step_waiting_location',
          level: 'info',
        });

        const coords = await getDiagnosisLocation();
        if (!isMountedRef.current) return;

        addBreadcrumb({
          category: 'diagnosis.loading',
          message: 'step_sending_to_api',
          level: 'info',
          data: { hasLocation: !!(coords.latitude && coords.longitude) },
        });

        const result = await sendDiagnosis(
          imageBase64 || '',
          cropApiName || 'Soybean',
          coords.latitude,
          coords.longitude,
          session?.access_token || '',
          user?.id,
          idempotencyKeyRef.current,
        );

        if (!isMountedRef.current) return;

        progress.value = withTiming(1, { duration: 500 });
        addBreadcrumb({
          category: 'diagnosis.loading',
          message: 'step_api_success',
          level: 'info',
          data: {
            durationMs: Date.now() - analysisStart,
            pestId: result.pest_id ?? 'unknown',
            confidence: result.confidence ?? 0,
          },
        });

        clearInterval(interval);
        intervalRef.current = null;
        safeSetTimeout(() => {
          router.replace({
            pathname: '/diagnosis/result',
            params: { data: JSON.stringify(result) },
          });
        }, 600);
      } catch {
        clearInterval(interval);
        intervalRef.current = null;
        if (!isMountedRef.current) return;

        // If offline, queue the diagnosis for later sync
        if (isConnectedRef.current === false) {
          addBreadcrumb({
            category: 'diagnosis.loading',
            message: 'step_offline_queued',
            level: 'info',
          });
          try {
            const coords = locationRef.current;
            await addToQueue({
              userId: user?.id ?? '',
              idempotencyKey: idempotencyKeyRef.current,
              imageBase64: imageBase64 || '',
              cropType: cropApiName || 'Soybean',
              latitude: coords?.latitude ?? null,
              longitude: coords?.longitude ?? null,
            });
            if (!isMountedRef.current) return;
            router.replace({ pathname: '/diagnosis/result', params: { queued: 'true' } });
          } catch (queueErr) {
            captureException(new Error('Offline diagnosis queue failed'), {
              tags: { stage: 'offline_queue' },
            });
            if (!isMountedRef.current) return;
            router.replace({
              pathname: '/diagnosis/result',
              params: {
                error: isDiagnosisQueueCapacityError(queueErr)
                  ? t('diagnosis.offlineQueueFull', { limit: MAX_DIAGNOSIS_QUEUE_ITEMS })
                  : t('diagnosis.offlineQueueError'),
              },
            });
          }
          return;
        }

        // Keep provider/network details out of telemetry and route params.
        captureException(new Error('Diagnosis request failed'), {
          tags: { stage: 'api_call' },
          extra: { durationMs: Date.now() - analysisStart },
        });

        router.replace({
          pathname: '/diagnosis/result',
          params: { error: t('diagnosis.genericError') },
        });
      }
    };

    analyze();

    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      timeoutsRef.current.forEach((id) => clearTimeout(id));
      timeoutsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Let the user abort a slow/stuck analysis instead of being trapped on the
  // spinner (no nav chrome here; iOS swipe-back is disabled during diagnosis).
  // Marking unmounted + clearing timers makes any in-flight response a no-op
  // (every continuation is guarded by isMountedRef), then we pop the screen.
  const handleCancel = useCallback(() => {
    isMountedRef.current = false;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    timeoutsRef.current.forEach((id) => clearTimeout(id));
    timeoutsRef.current = [];
    addBreadcrumb({
      category: 'diagnosis.loading',
      message: 'analyze_cancelled_by_user',
      level: 'info',
    });
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }, []);

  const progressAnimatedStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  const stepTextAnimatedStyle = useAnimatedStyle(() => ({
    opacity: stepOpacity.value,
    transform: [{ translateY: stepTranslateY.value }],
  }));

  return (
    <LinearGradient colors={Gradients.mesh} style={styles.container}>
      {/* Skeleton sits BEHIND the centered progress card so the user perceives
          the result as "already on the way". pointerEvents=none in the
          component itself; we don't want it stealing taps. */}
      <DiagnosisSkeleton />

      <SafeAreaView edges={['top']} style={styles.cancelSafe} pointerEvents="box-none">
        <TouchableOpacity
          testID="diagnosis-loading-cancel"
          style={styles.cancelBtn}
          onPress={handleCancel}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
        >
          <Ionicons name="close" size={26} color="#FFF" />
        </TouchableOpacity>
      </SafeAreaView>

      <View
        style={styles.center}
        accessible
        accessibilityLabel={`${t('diagnosis.analyzingA11y')}. ${STEPS[step]}`}
        accessibilityRole="progressbar"
      >
        <View style={styles.iconCircle}>
          <Ionicons name="leaf" size={38} color="#FFF" accessibilityElementsHidden />
        </View>

        <Animated.Text
          style={[styles.status, stepTextAnimatedStyle]}
          accessibilityLiveRegion="polite"
          maxFontSizeMultiplier={1.3}
        >
          {STEPS[step]}
        </Animated.Text>

        <View style={styles.progressBg} accessibilityElementsHidden>
          <Animated.View style={[styles.progressFill, progressAnimatedStyle]} />
        </View>

        {/* Step counter — gives a tangible sense of progress beyond the bar */}
        <Text style={styles.stepCounter} maxFontSizeMultiplier={1.3}>
          {t('diagnosis.stepCounter', { current: step + 1, total: STEPS.length })}
        </Text>

        <Text style={styles.hint}>{t('diagnosis.aiHint')}</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  cancelSafe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  cancelBtn: {
    marginTop: Spacing.md,
    marginLeft: Spacing.lg,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  center: { alignItems: 'center', paddingHorizontal: 40 },
  iconCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(231,211,161,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  status: {
    fontSize: FontSize.title3,
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
    color: '#FFF',
    textAlign: 'center',
    marginBottom: 24,
  },
  progressBg: {
    width: 200,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: Colors.goldSoft },
  stepCounter: {
    fontSize: FontSize.caption,
    color: 'rgba(255,255,255,0.85)',
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
    marginTop: 10,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.3,
  },
  hint: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.caption,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 20,
  },
});
