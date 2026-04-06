import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Colors, FontSize, Gradients } from '../../constants/theme';
import { sendDiagnosis } from '../../services/diagnosis';
import { useAuthContext } from '../../contexts/AuthContext';
import { useLocation } from '../../hooks/useLocation';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { addToQueue } from '../../services/diagnosisQueue';
import { useTranslation } from 'react-i18next';

export default function LoadingScreen() {
  const { t } = useTranslation();
  const STEPS = [
    t('diagnosis.steps.preparing'),
    t('diagnosis.steps.sending'),
    t('diagnosis.steps.identifying'),
    t('diagnosis.steps.processing'),
  ];
  const { imageBase64, cropApiName } = useLocalSearchParams<{
    imageBase64: string;
    cropApiName: string;
  }>();
  const { session } = useAuthContext();
  const { location, getCurrentLocation } = useLocation();
  const { isConnected } = useNetworkStatus();
  const [step, setStep] = useState(0);
  const [progress] = useState(new Animated.Value(0));
  const hasStartedAnalysis = useRef(false);

  useEffect(() => {
    getCurrentLocation();
  }, [getCurrentLocation]);

  useEffect(() => {
    // Guard against StrictMode double-invoke — prevents duplicate Claude API calls
    if (hasStartedAnalysis.current) return;
    hasStartedAnalysis.current = true;

    const interval = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 2000);

    const analyze = async () => {
      try {
        Animated.timing(progress, { toValue: 0.3, duration: 1000, useNativeDriver: false }).start();

        const result = await sendDiagnosis(
          imageBase64 || '',
          cropApiName || 'Soybean',
          location?.latitude ?? null,
          location?.longitude ?? null,
          session?.access_token || '',
        );

        Animated.timing(progress, { toValue: 1, duration: 500, useNativeDriver: false }).start();

        clearInterval(interval);
        setTimeout(() => {
          router.replace({
            pathname: '/diagnosis/result',
            params: { data: JSON.stringify(result) },
          });
        }, 600);
      } catch (error: any) {
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
          } catch (queueError) {
            router.replace({
              pathname: '/diagnosis/result',
              params: { error: t('diagnosis.offlineQueueError') },
            });
          }
          return;
        }

        router.replace({
          pathname: '/diagnosis/result',
          params: { error: error.message || t('diagnosis.genericError') },
        });
      }
    };

    analyze();
    return () => clearInterval(interval);
  }, []);

  const progressWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <LinearGradient colors={Gradients.mesh as any} style={styles.container}>
      <View
        style={styles.center}
        accessible
        accessibilityLabel={`${t('diagnosis.analyzingA11y')}. ${STEPS[step]}`}
        accessibilityRole="progressbar"
      >
        <View style={styles.iconCircle}>
          <Ionicons name="leaf" size={38} color="#FFF" accessibilityElementsHidden />
        </View>

        <Text style={styles.status} accessibilityLiveRegion="polite">
          {STEPS[step]}
        </Text>

        <View style={styles.progressBg} accessibilityElementsHidden>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
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
