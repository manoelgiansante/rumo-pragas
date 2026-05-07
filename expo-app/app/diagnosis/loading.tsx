import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { Colors, FontSize, FontWeight } from '../../constants/theme';
import { Hero } from '../../components/ui';
import { sendDiagnosis } from '../../services/diagnosis';
import { useAuthContext } from '../../contexts/AuthContext';
import { useLocation } from '../../hooks/useLocation';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { addToQueue } from '../../services/diagnosisQueue';
import { useTranslation } from 'react-i18next';
import { useDiagnosis } from '../../contexts/DiagnosisContext';

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
  const { location, getCurrentLocation } = useLocation();
  const { isConnected } = useNetworkStatus();
  const [step, setStep] = useState(0);
  const progress = useSharedValue(0);
  const stepOpacity = useSharedValue(1);
  const stepTranslateY = useSharedValue(0);
  // Animated leaf: gentle pulse + slow rotation, runs on UI thread.
  const leafScale = useSharedValue(1);
  const leafRotate = useSharedValue(0);
  const hasStartedAnalysis = useRef(false);
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
    getCurrentLocation();
  }, [getCurrentLocation]);

  // Kick off the leaf "thinking" animation once on mount (worklet, UI thread).
  useEffect(() => {
    leafScale.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
    leafRotate.value = withRepeat(
      withSequence(
        withTiming(6, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
        withTiming(-6, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      true,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    // Wait for location to resolve (or timeout) BEFORE sending diagnosis.
    // Previous version used deps [] + closure on `location` which was always
    // null on first render — producing null coords even when location was ready.
    const waitForLocation = async (): Promise<{
      latitude: number | null;
      longitude: number | null;
    }> => {
      const start = Date.now();
      while (Date.now() - start < LOCATION_TIMEOUT_MS) {
        if (!isMountedRef.current) return { latitude: null, longitude: null };
        if (locationRef.current) {
          return {
            latitude: locationRef.current.latitude,
            longitude: locationRef.current.longitude,
          };
        }
        await new Promise<void>((resolve) => {
          safeSetTimeout(() => resolve(), 100);
        });
      }
      return { latitude: null, longitude: null };
    };

    const analyze = async () => {
      try {
        progress.value = withTiming(0.3, { duration: 1000 });

        const coords = await waitForLocation();
        if (!isMountedRef.current) return;

        const result = await sendDiagnosis(
          imageBase64 || '',
          cropApiName || 'Soybean',
          coords.latitude,
          coords.longitude,
          session?.access_token || '',
          user?.id,
        );

        if (!isMountedRef.current) return;

        progress.value = withTiming(1, { duration: 500 });

        clearInterval(interval);
        intervalRef.current = null;
        safeSetTimeout(() => {
          router.replace({
            pathname: '/diagnosis/result',
            params: { data: JSON.stringify(result) },
          });
        }, 600);
      } catch (error: unknown) {
        clearInterval(interval);
        intervalRef.current = null;
        if (!isMountedRef.current) return;

        // If offline, queue the diagnosis for later sync
        if (isConnectedRef.current === false) {
          try {
            const coords = locationRef.current;
            await addToQueue({
              imageBase64: imageBase64 || '',
              cropType: cropApiName || 'Soybean',
              latitude: coords?.latitude ?? null,
              longitude: coords?.longitude ?? null,
            });
            if (!isMountedRef.current) return;
            router.replace({ pathname: '/diagnosis/result', params: { queued: 'true' } });
          } catch {
            if (!isMountedRef.current) return;
            router.replace({
              pathname: '/diagnosis/result',
              params: { error: t('diagnosis.offlineQueueError') },
            });
          }
          return;
        }

        router.replace({
          pathname: '/diagnosis/result',
          params: { error: error instanceof Error ? error.message : t('diagnosis.genericError') },
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

  const progressAnimatedStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  const stepTextAnimatedStyle = useAnimatedStyle(() => ({
    opacity: stepOpacity.value,
    transform: [{ translateY: stepTranslateY.value }],
  }));

  const leafAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: leafScale.value }, { rotate: `${leafRotate.value}deg` }],
  }));

  return (
    <View style={styles.root}>
      {/* Top half: brand Hero (deep leaf gradient) */}
      <Hero topInset={32} style={styles.heroTop}>
        <View
          style={styles.heroInner}
          accessible
          accessibilityLabel={`${t('diagnosis.analyzingA11y')}. ${STEPS[step]}`}
          accessibilityRole="progressbar"
        >
          <Animated.View style={[styles.leafCircle, leafAnimatedStyle]}>
            <Ionicons name="leaf" size={44} color="#FFF" accessibilityElementsHidden />
            {/* Subtle sparkle accent in warm amber, off-axis */}
            <View style={styles.sparkle} pointerEvents="none">
              <Ionicons name="sparkles" size={18} color={Colors.warmAmber} />
            </View>
          </Animated.View>

          <Animated.Text
            style={[styles.title, stepTextAnimatedStyle]}
            accessibilityLiveRegion="polite"
            maxFontSizeMultiplier={1.3}
          >
            {STEPS[step]}
          </Animated.Text>

          <Text style={styles.subtitle} maxFontSizeMultiplier={1.4}>
            {t('diagnosis.aiHint')}
          </Text>
        </View>
      </Hero>

      {/* Bottom half: progress bar + step indicator on background */}
      <View style={styles.bottom}>
        <View style={styles.progressBg} accessibilityElementsHidden>
          <Animated.View style={[styles.progressFill, progressAnimatedStyle]} />
        </View>
        <Text style={styles.stepCounter} accessibilityElementsHidden>
          {`${step + 1} / ${STEPS.length}`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  heroTop: {
    flex: 1,
    justifyContent: 'center',
    // Hero already has bottom rounded corners (xl)
  },
  heroInner: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  leafCircle: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
  },
  sparkle: {
    position: 'absolute',
    top: 8,
    right: 6,
  },
  // 22/700 white per spec
  title: {
    fontSize: FontSize.title2, // 22
    fontWeight: FontWeight.bold,
    color: '#FFF',
    textAlign: 'center',
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  // 15 white@0.85 per spec
  subtitle: {
    fontSize: FontSize.subheadline, // 15
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
  },
  bottom: {
    paddingHorizontal: 32,
    paddingTop: 24,
    paddingBottom: 40,
    alignItems: 'center',
  },
  progressBg: {
    width: '100%',
    maxWidth: 240,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.systemGray5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: Colors.accent,
  },
  stepCounter: {
    marginTop: 12,
    fontSize: FontSize.caption,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    letterSpacing: 0.4,
    fontVariant: ['tabular-nums'],
  },
});
