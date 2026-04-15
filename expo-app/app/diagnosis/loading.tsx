import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { FontSize, Gradients } from '../../constants/theme';
import { sendDiagnosis } from '../../services/diagnosis';
import { useAuthContext } from '../../contexts/AuthContext';
import { useLocation } from '../../hooks/useLocation';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { addToQueue } from '../../services/diagnosisQueue';
import { useTranslation } from 'react-i18next';
import { useDiagnosis } from '../../contexts/DiagnosisContext';

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
  const hasStartedAnalysis = useRef(false);

  useEffect(() => {
    getCurrentLocation();
  }, [getCurrentLocation]);

  useEffect(() => {
    // Guard against StrictMode double-invoke — prevents duplicate Claude API calls
    if (hasStartedAnalysis.current) return;
    hasStartedAnalysis.current = true;

    const interval = setInterval(() => {
      // Fade out, swap text, fade in — runs on UI thread via Reanimated worklets
      stepOpacity.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.quad) });
      stepTranslateY.value = withTiming(-6, { duration: 180, easing: Easing.out(Easing.quad) });
      setTimeout(() => {
        setStep((s) => Math.min(s + 1, STEPS.length - 1));
        stepTranslateY.value = 6;
        stepOpacity.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
        stepTranslateY.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
      }, 180);
    }, 1500);

    const analyze = async () => {
      try {
        progress.value = withTiming(0.3, { duration: 1000 });

        const result = await sendDiagnosis(
          imageBase64 || '',
          cropApiName || 'Soybean',
          location?.latitude ?? null,
          location?.longitude ?? null,
          session?.access_token || '',
          user?.id,
        );

        progress.value = withTiming(1, { duration: 500 });

        clearInterval(interval);
        setTimeout(() => {
          router.replace({
            pathname: '/diagnosis/result',
            params: { data: JSON.stringify(result) },
          });
        }, 600);
      } catch (error: unknown) {
        clearInterval(interval);

        // If offline, queue the diagnosis for later sync
        if (isConnected === false) {
          try {
            await addToQueue({
              imageBase64: imageBase64 || '',
              cropType: cropApiName || 'Soybean',
              latitude: location?.latitude ?? null,
              longitude: location?.longitude ?? null,
            });
            router.replace({ pathname: '/diagnosis/result', params: { queued: 'true' } });
          } catch {
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
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

        <Text style={styles.hint}>{t('diagnosis.aiHint')}</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  center: { alignItems: 'center', paddingHorizontal: 40 },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  status: {
    fontSize: FontSize.title3,
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
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: '#FFF' },
  hint: { fontSize: FontSize.caption, color: 'rgba(255,255,255,0.6)', marginTop: 20 },
});
