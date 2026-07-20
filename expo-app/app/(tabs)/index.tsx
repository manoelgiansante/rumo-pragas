import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import {
  Colors,
  Spacing,
  BorderRadius,
  FontSize,
  Gradients,
  FontFamily,
  FontWeight,
} from '../../constants/theme';
import { PremiumCard } from '../../components/PremiumCard';
import { WeatherCard } from '../../components/WeatherCard';
import { FieldConditionsCard } from '../../components/FieldConditionsCard';
import { AlertCard } from '../../components/AlertCard';
import { HomeScreenSkeleton } from '../../components/HomeScreenSkeleton';
import { fetchDiagnosisCount } from '../../services/diagnosis';
import { classifyFieldConditions24h, fetchWeather } from '../../services/weather';
import type { WeatherData } from '../../services/weather';
import { generateAlerts } from '../../services/alerts';
import type { PestAlert } from '../../services/alerts';
import type { WeatherCardData } from '../../components/WeatherCard';
import { useAuthContext } from '../../contexts/AuthContext';
import { useLocation } from '../../hooks/useLocation';
import {
  discardFailedDiagnosis,
  FailedDiagnosis,
  getFailedQueue,
  getQueueCount,
  retryFailedDiagnosis,
  subscribeDiagnosisQueue,
} from '../../services/diagnosisQueue';
import { scheduleClimateRiskNotifications } from '../../services/notifications';
import { useTranslation } from 'react-i18next';
import { useResponsive } from '../../hooks/useResponsive';
import { showAlert } from '../../services/dialog';

const TIP_KEYS = [
  { icon: 'leaf', titleKey: 'home.tips.monitorTitle', descKey: 'home.tips.monitorDesc' },
  { icon: 'water', titleKey: 'home.tips.irrigationTitle', descKey: 'home.tips.irrigationDesc' },
  {
    icon: 'shield-checkmark',
    titleKey: 'home.tips.rotationTitle',
    descKey: 'home.tips.rotationDesc',
  },
];

export default function HomeScreen() {
  const { t } = useTranslation();
  const { user, session } = useAuthContext();
  // QW-1 (W16-1, 2026-05-22): getCurrentLocation() is now triggered inside
  // consent-location.tsx#handleAccept, AFTER the user opt-in. We only READ the
  // location/cityName here. Triggering Location.requestForegroundPermissionsAsync()
  // on Home mount caused the iOS/Android OS permission prompt to appear with no
  // context (the LGPD consent screen was already gone by then). Now the OS
  // prompt is chained right after the explicit accept tap, so the user has
  // visual continuity.
  const { location, cityName } = useLocation();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { isTablet, contentMaxWidth } = useResponsive();
  const [weather, setWeather] = useState<WeatherCardData | null>(null);
  const [weatherRaw, setWeatherRaw] = useState<WeatherData | null>(null);
  const [diagnosisCount, setDiagnosisCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [weatherError, setWeatherError] = useState(false);
  const [diagnosisError, setDiagnosisError] = useState(false);
  const [pendingQueueCount, setPendingQueueCount] = useState(0);
  const [failedDiagnoses, setFailedDiagnoses] = useState<FailedDiagnosis[]>([]);
  const [recoveringId, setRecoveringId] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const hasScheduledNotifications = useRef(false);

  const alerts: PestAlert[] = useMemo(() => {
    if (!weatherRaw) return [];
    return generateAlerts(weatherRaw).slice(0, 5);
  }, [weatherRaw]);

  // Field-conditions summary is derived — no fetch, no side-effects. Returns
  // null when the upstream did not supply hourly data (e.g. cached weather
  // from before hourly was requested); in that case the card is hidden.
  const fieldConditions = useMemo(
    () => classifyFieldConditions24h(weatherRaw?.hourly24h),
    [weatherRaw?.hourly24h],
  );

  // Schedule notifications for high-severity alerts (once per session)
  useEffect(() => {
    if (hasScheduledNotifications.current) return;
    const highAlerts = alerts.filter((a) => a.severity === 'high');
    if (highAlerts.length > 0) {
      hasScheduledNotifications.current = true;
      scheduleClimateRiskNotifications(alerts).catch(() => {
        if (__DEV__) console.warn('[Home] Falha ao agendar alerta climático local');
      });
    }
  }, [alerts]);

  const greetingText = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return t('home.goodMorning');
    if (hour < 18) return t('home.goodAfternoon');
    return t('home.goodEvening');
  }, [t]);

  const loadQueueState = useCallback(async () => {
    const [pending, failed] = user?.id
      ? await Promise.all([getQueueCount(user.id), getFailedQueue(user.id)])
      : [0, []];
    setPendingQueueCount(pending);
    setFailedDiagnoses(failed);
  }, [user?.id]);

  const loadData = useCallback(async () => {
    // Run all data fetches in parallel for faster loading
    const promises: Promise<void>[] = [];

    // Check for pending offline diagnoses
    promises.push(
      loadQueueState().catch((err) => {
        if (__DEV__) console.warn('[Home] Queue state fetch failed:', err);
      }),
    );

    if (location) {
      promises.push(
        (async () => {
          try {
            setWeatherError(false);
            const w = await fetchWeather(location.latitude, location.longitude);
            if (w) {
              setWeatherRaw(w);
              setWeather({
                temperature: w.temperature,
                humidity: w.humidity,
                windSpeed: w.windSpeed,
                dailyPrecipitationSum: w.dailyPrecipitationSum,
                description: w.description,
                icon: w.icon,
                location: cityName || undefined,
                forecast: w.forecast,
              });
            }
          } catch {
            if (__DEV__) console.warn('[Home] Falha ao buscar clima');
            setWeatherError(true);
          }
        })(),
      );
    }

    if (session?.access_token && user?.id) {
      promises.push(
        (async () => {
          try {
            setDiagnosisError(false);
            setDiagnosisCount(await fetchDiagnosisCount(session.access_token, user.id));
          } catch {
            if (__DEV__) console.warn('[Home] Falha ao buscar diagnósticos');
            setDiagnosisError(true);
          }
        })(),
      );
    }

    await Promise.all(promises);
  }, [location, cityName, session, user, loadQueueState]);

  // QW-1 (W16-1, 2026-05-22): Location prompt moved to consent-location.tsx#handleAccept.
  // Do NOT fire getCurrentLocation() here — it would re-prompt users who already
  // declined LGPD consent (effectively bypassing their choice) and re-show the OS
  // dialog every time Home remounts. Diagnosis uses the consent-aware location
  // method, which verifies app consent before touching native location APIs.
  useEffect(() => {
    let mounted = true;
    loadData().finally(() => {
      if (mounted) setIsInitialLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [loadData]);

  useEffect(() => subscribeDiagnosisQueue(loadQueueState), [loadQueueState]);

  const retryFailed = useCallback(
    async (id: string) => {
      setRecoveringId(id);
      try {
        if (!user?.id) return;
        await retryFailedDiagnosis(id, user.id);
        await loadQueueState();
      } catch {
        showAlert(t('common.error'), t('home.failedRetryError'));
      } finally {
        setRecoveringId(null);
      }
    },
    [loadQueueState, t, user?.id],
  );

  const confirmDiscardFailed = useCallback(
    (id: string) => {
      showAlert(t('home.failedDiscardTitle'), t('home.failedDiscardMessage'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('home.failedDiscardAction'),
          style: 'destructive',
          onPress: () => {
            setRecoveringId(id);
            (user?.id ? discardFailedDiagnosis(id, user.id) : Promise.resolve())
              .then(loadQueueState)
              .catch(() => showAlert(t('common.error'), t('home.failedDiscardError')))
              .finally(() => setRecoveringId(null));
          },
        },
      ]);
    },
    [loadQueueState, t, user?.id],
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const riskLevelText = useMemo(() => {
    if (!weather) return '\u2014';
    if (weather.humidity > 80 || weather.temperature > 35) return t('home.riskHigh');
    if (weather.humidity > 60 || weather.temperature > 30) return t('home.riskMedium');
    return t('home.riskLow');
  }, [weather, t]);

  const statsData = useMemo(
    () => [
      {
        icon: 'document-text',
        // A real "0" reads as a fresh account; the em-dash looked like a failed
        // load. On error we surface "!" + a tap-to-retry; otherwise the card
        // deep-links into the history tab.
        value: diagnosisError ? '!' : `${diagnosisCount}`,
        label: diagnosisError ? t('common.error') : t('home.diagnoses'),
        color: diagnosisError ? Colors.coral : Colors.accent,
        onPress: diagnosisError ? loadData : () => router.push('/(tabs)/history'),
      },
      {
        icon: 'shield-checkmark',
        value: 'MIP',
        label: t('home.strategy'),
        color: Colors.techBlue,
        onPress: undefined,
      },
      {
        icon: 'trending-up',
        value: riskLevelText,
        label: t('home.monitoring'),
        color: Colors.warmAmber,
        onPress: undefined,
      },
    ],
    [diagnosisError, diagnosisCount, riskLevelText, t, loadData],
  );

  if (isInitialLoading) {
    return <HomeScreenSkeleton />;
  }

  return (
    <ScrollView
      style={[styles.container, isDark && styles.containerDark]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />
      }
    >
      <LinearGradient
        colors={Gradients.hero}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        {/* Subtle bottom fade to blend hero into content */}
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.18)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View
          style={[
            styles.heroContent,
            // Web desktop / iPad: saudação alinhada à mesma coluna do conteúdo
            // (sem isso o texto ficava colado na borda esquerda da janela).
            isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center' as const, width: '100%' },
          ]}
        >
          <Text style={styles.greeting}>{greetingText}</Text>
          <Text style={styles.userName}>
            {user?.user_metadata?.full_name || t('home.defaultUser')}
          </Text>
        </View>
      </LinearGradient>

      <View
        style={[
          styles.content,
          isTablet && {
            maxWidth: contentMaxWidth,
            alignSelf: 'center' as const,
            width: '100%',
          },
        ]}
      >
        {/* Hierarquia da home (doc-05, IMPL-3 T3): diagnosticar é a tarefa nº1
            da categoria — o CTA primário abre o scroll, ACIMA dos cards de
            clima. Só a ORDEM mudou; copy/cores/tamanhos intactos. */}
        <TouchableOpacity
          testID="home-cta-diagnose"
          onPress={() => router.push('/diagnosis/camera')}
          activeOpacity={0.88}
          accessibilityLabel={t('home.diagnosePestA11y')}
          accessibilityRole="button"
          accessibilityHint={t('home.diagnosePestHint')}
          style={styles.ctaShadow}
        >
          <LinearGradient
            colors={Gradients.hero}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.ctaContainer}
          >
            <View style={styles.ctaIconCircle}>
              <Ionicons name="camera" size={30} color="#FFF" accessibilityElementsHidden />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.ctaTitle}>{t('home.diagnoseNow')}</Text>
              <Text style={styles.ctaSub}>{t('home.scanCtaHint')}</Text>
            </View>
            <View style={styles.ctaArrow}>
              <Ionicons name="arrow-forward" size={20} color="#FFF" accessibilityElementsHidden />
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {weatherError && diagnosisError && !weather ? (
          <TouchableOpacity
            testID="home-retry-load-data"
            onPress={loadData}
            activeOpacity={0.7}
            style={styles.errorCard}
            accessibilityLabel={t('home.errorLoadDataA11y')}
            accessibilityRole="button"
          >
            <Ionicons name="wifi-outline" size={28} color={Colors.coral} />
            <Text style={styles.errorCardText}>{t('home.errorLoadData')}</Text>
            <Text style={styles.retryText}>{t('home.errorLoadDataHint')}</Text>
          </TouchableOpacity>
        ) : weatherError && !weather ? (
          <TouchableOpacity
            testID="home-retry-load-weather"
            onPress={loadData}
            activeOpacity={0.7}
            style={styles.errorCard}
            accessibilityLabel={t('home.errorLoadWeatherA11y')}
            accessibilityRole="button"
          >
            <Ionicons name="cloud-offline-outline" size={22} color={Colors.coral} />
            <Text style={styles.errorCardText}>{t('home.errorLoadWeather')}</Text>
            <Text style={styles.retryText}>{t('home.retryTap')}</Text>
          </TouchableOpacity>
        ) : null}
        {weather && <WeatherCard weather={weather} />}
        {fieldConditions && <FieldConditionsCard summary={fieldConditions} />}

        <TouchableOpacity
          testID="home-cta-describe"
          onPress={() =>
            router.push({
              pathname: '/(tabs)/ai-chat',
              params: { prefill: 'symptoms', ts: String(Date.now()) },
            })
          }
          activeOpacity={0.7}
          accessibilityLabel={t('home.describeSymptomsA11y')}
          accessibilityRole="button"
          accessibilityHint={t('home.describeSymptomsHint')}
          style={styles.describeCta}
        >
          <View style={styles.describeIconCircle}>
            <Ionicons
              name="chatbubbles-outline"
              size={20}
              color={Colors.accent}
              accessibilityElementsHidden
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.describeTitle}>{t('home.describeSymptoms')}</Text>
            <Text style={styles.describeSub}>{t('home.describeSymptomsSub')}</Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={Colors.systemGray2}
            accessibilityElementsHidden
          />
        </TouchableOpacity>

        {pendingQueueCount > 0 && (
          <View style={styles.pendingCard} accessible accessibilityRole="alert">
            <Ionicons name="cloud-upload-outline" size={18} color={Colors.warmAmber} />
            <Text style={styles.pendingText}>
              {pendingQueueCount} {t('home.pendingDiagnoses')} — {t('home.waitingConnection')}
            </Text>
          </View>
        )}

        {failedDiagnoses.length > 0 && (
          <View style={styles.failedQueueCard} accessibilityRole="alert">
            <View style={styles.failedQueueHeader}>
              <Ionicons name="warning-outline" size={20} color={Colors.coral} />
              <View style={{ flex: 1 }}>
                <Text style={styles.failedQueueTitle}>{t('home.failedDiagnosesTitle')}</Text>
                <Text style={styles.failedQueueDescription}>
                  {t('home.failedDiagnosesDescription')}
                </Text>
              </View>
            </View>
            {failedDiagnoses.map((item) => (
              <View
                key={item.id}
                style={styles.failedQueueItem}
                testID={`failed-diagnosis-${item.id}`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.failedQueueCrop}>{item.cropType}</Text>
                  <Text style={styles.failedQueueDate}>
                    {new Date(item.createdAt).toLocaleString()}
                  </Text>
                </View>
                <TouchableOpacity
                  testID={`failed-diagnosis-retry-${item.id}`}
                  style={styles.failedRetryButton}
                  onPress={() => retryFailed(item.id)}
                  disabled={recoveringId !== null}
                  accessibilityRole="button"
                  accessibilityLabel={t('home.failedRetryA11y', { crop: item.cropType })}
                  accessibilityState={{ disabled: recoveringId !== null }}
                >
                  <Ionicons name="refresh" size={16} color={Colors.white} />
                  <Text style={styles.failedRetryText}>{t('common.retry')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID={`failed-diagnosis-discard-${item.id}`}
                  style={styles.failedDiscardButton}
                  onPress={() => confirmDiscardFailed(item.id)}
                  disabled={recoveringId !== null}
                  accessibilityRole="button"
                  accessibilityLabel={t('home.failedDiscardA11y', { crop: item.cropType })}
                  accessibilityState={{ disabled: recoveringId !== null }}
                >
                  <Ionicons name="trash-outline" size={18} color={Colors.coral} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <View style={styles.statsRow}>
          {statsData.map((stat, i) => {
            const card = (
              <View
                style={styles.statCard}
                accessible={!stat.onPress}
                accessibilityLabel={`${stat.label}: ${stat.value}`}
                accessibilityRole="summary"
              >
                <Ionicons
                  name={stat.icon as keyof typeof Ionicons.glyphMap}
                  size={22}
                  color={stat.color}
                  accessibilityElementsHidden
                />
                <Text style={[styles.statValue, isDark && styles.textDark]}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
            );
            return (
              <PremiumCard key={i} style={{ flex: 1 }}>
                {stat.onPress ? (
                  <TouchableOpacity
                    testID={`home-stat-${i}`}
                    onPress={stat.onPress}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`${stat.label}: ${stat.value}`}
                  >
                    {card}
                  </TouchableOpacity>
                ) : (
                  card
                )}
              </PremiumCard>
            );
          })}
        </View>

        {alerts.length > 0 && (
          <>
            <View style={styles.alertsHeader}>
              <View style={styles.alertsTitleRow}>
                <Ionicons name="notifications" size={20} color={Colors.coral} />
                <Text
                  style={[
                    styles.sectionTitle,
                    isDark && styles.textDark,
                    { marginTop: 0, marginBottom: 0 },
                  ]}
                >
                  {t('home.regionalAlerts')}
                </Text>
              </View>
              <View style={styles.alertsBadge}>
                <Text style={styles.alertsBadgeText}>{alerts.length}</Text>
              </View>
            </View>
            {alerts.map((alert) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </>
        )}

        <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
          {t('home.bestPractices')}
        </Text>
        {TIP_KEYS.map((tip, i) => (
          <PremiumCard key={i} style={{ marginBottom: Spacing.sm }}>
            <View
              style={styles.tipRow}
              accessible
              accessibilityLabel={`${t(tip.titleKey)}: ${t(tip.descKey)}`}
            >
              <View style={[styles.tipIcon, { backgroundColor: Colors.accent + '1F' }]}>
                <Ionicons
                  name={tip.icon as keyof typeof Ionicons.glyphMap}
                  size={18}
                  color={Colors.accent}
                  accessibilityElementsHidden
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.tipTitle, isDark && styles.textDark]}>{t(tip.titleKey)}</Text>
                <Text style={styles.tipDesc}>{t(tip.descKey)}</Text>
              </View>
            </View>
          </PremiumCard>
        ))}
        <View style={{ height: 32 }} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  containerDark: { backgroundColor: Colors.backgroundDark },
  hero: { height: 190, justifyContent: 'flex-end' },
  heroContent: { padding: 20, paddingBottom: 24 },
  greeting: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.subheadline,
    color: 'rgba(255,255,255,0.9)',
  },
  userName: {
    fontSize: FontSize.title,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: '#FFF',
    marginTop: 2,
  },
  content: { padding: Spacing.lg, marginTop: -16 },
  scanRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  scanIcon: {
    width: 60,
    height: 60,
    borderRadius: BorderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanTitle: { fontSize: FontSize.title3, fontFamily: FontFamily.bold, fontWeight: '700' },
  scanSub: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.subheadline,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  ctaShadow: {
    shadowColor: Colors.accentDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 8,
    borderRadius: BorderRadius.lg,
  },
  ctaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
  },
  ctaIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaTitle: {
    fontSize: FontSize.title3,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    color: '#FFF',
  },
  ctaSub: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.subheadline,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  ctaArrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  describeCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.separator,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.md,
  },
  describeIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.systemGray6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  describeTitle: {
    fontFamily: FontFamily.semibold,
    fontWeight: FontWeight.semibold,
    fontSize: FontSize.subheadline,
    color: Colors.text,
  },
  describeSub: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.footnote,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
  statCard: { alignItems: 'center', gap: 6 },
  // Metric reads as a real number/label, not caption-sized filler.
  statValue: {
    fontSize: FontSize.title3,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  statLabel: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.caption2,
    color: Colors.textSecondary,
  },
  sectionTitle: {
    fontSize: FontSize.title3,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    letterSpacing: -0.3,
    // Asymmetric section rhythm (24 above / 12 below) groups each block with
    // its content and opens air before a new section.
    marginTop: Spacing.xxl,
    marginBottom: Spacing.md,
  },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  tipIcon: {
    width: 42,
    height: 42,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tipTitle: { fontSize: FontSize.subheadline, fontFamily: FontFamily.semibold, fontWeight: '600' },
  tipDesc: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  textDark: { color: Colors.textDark },
  alertsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xxl,
    marginBottom: Spacing.md,
  },
  alertsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  alertsBadge: {
    backgroundColor: Colors.coral,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertsBadgeText: {
    color: '#FFF',
    fontSize: FontSize.caption2,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
  },
  errorCard: {
    backgroundColor: Colors.coral + '14',
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.coral + '33',
  },
  errorCardText: {
    fontSize: FontSize.subheadline,
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
    color: Colors.coral,
  },
  retryText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
  },
  pendingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.warmAmber + '14',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.warmAmber + '33',
  },
  pendingText: {
    flex: 1,
    fontSize: FontSize.caption,
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
    color: Colors.earthText,
  },
  failedQueueCard: {
    gap: Spacing.md,
    marginTop: Spacing.sm,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: `${Colors.coral}45`,
    borderRadius: BorderRadius.md,
    backgroundColor: `${Colors.coral}0D`,
  },
  failedQueueHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  failedQueueTitle: {
    color: Colors.coral,
    fontFamily: FontFamily.bold,
    fontSize: FontSize.subheadline,
  },
  failedQueueDescription: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.caption,
    lineHeight: 18,
    marginTop: 2,
  },
  failedQueueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.separator,
  },
  failedQueueCrop: {
    color: Colors.text,
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.caption,
  },
  failedQueueDate: {
    color: Colors.textTertiary,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.caption2,
    marginTop: 2,
  },
  failedRetryButton: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.accent,
  },
  failedRetryText: {
    color: Colors.white,
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.caption,
  },
  failedDiscardButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
    backgroundColor: `${Colors.coral}14`,
  },
});
