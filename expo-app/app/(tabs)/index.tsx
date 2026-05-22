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
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, Spacing, BorderRadius, FontSize, Gradients } from '../../constants/theme';
import { PremiumCard } from '../../components/PremiumCard';
import { WeatherCard } from '../../components/WeatherCard';
import { AlertCard } from '../../components/AlertCard';
import { HomeScreenSkeleton } from '../../components/HomeScreenSkeleton';
import { supabase } from '../../services/supabase';
import { fetchWeather } from '../../services/weather';
import type { WeatherData } from '../../services/weather';
import { generateAlerts } from '../../services/alerts';
import type { PestAlert } from '../../services/alerts';
import type { WeatherCardData } from '../../components/WeatherCard';
import { useAuthContext } from '../../contexts/AuthContext';
import { useLocation } from '../../hooks/useLocation';
import { getQueueCount } from '../../services/diagnosisQueue';
import { schedulePestAlertNotifications } from '../../services/notifications';
import { useTranslation } from 'react-i18next';
import { useResponsive } from '../../hooks/useResponsive';
import { checkSubscriptionStatus, isRevenueCatConfigured } from '../../services/purchases';

const FREE_MONTHLY_DIAGNOSES = 3;

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
  const [monthlyDiagnosisCount, setMonthlyDiagnosisCount] = useState(0);
  const [isFreePlan, setIsFreePlan] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [weatherError, setWeatherError] = useState(false);
  const [diagnosisError, setDiagnosisError] = useState(false);
  const [pendingQueueCount, setPendingQueueCount] = useState(0);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const hasScheduledNotifications = useRef(false);

  const alerts: PestAlert[] = useMemo(() => {
    if (!weatherRaw) return [];
    return generateAlerts(weatherRaw).slice(0, 5);
  }, [weatherRaw]);

  // Schedule notifications for high-severity alerts (once per session)
  useEffect(() => {
    if (hasScheduledNotifications.current) return;
    const highAlerts = alerts.filter((a) => a.severity === 'high');
    if (highAlerts.length > 0) {
      hasScheduledNotifications.current = true;
      schedulePestAlertNotifications(alerts).catch((err) => {
        if (__DEV__) console.warn('[Home] Falha ao agendar notificacoes de alerta:', err);
      });
    }
  }, [alerts]);

  const greetingText = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return t('home.goodMorning');
    if (hour < 18) return t('home.goodAfternoon');
    return t('home.goodEvening');
  }, [t]);

  const loadData = useCallback(async () => {
    // Run all data fetches in parallel for faster loading
    const promises: Promise<void>[] = [];

    // Check for pending offline diagnoses
    promises.push(
      getQueueCount()
        .then((qCount) => setPendingQueueCount(qCount))
        .catch((err) => {
          if (__DEV__) console.warn('[Home] Queue count fetch failed:', err);
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
          } catch (err) {
            if (__DEV__) console.error('[Home] Erro ao buscar clima:', err);
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
            const { count, error } = await supabase
              .from('pragas_diagnoses')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', user.id);
            if (error) throw error;
            setDiagnosisCount(count ?? 0);
          } catch (err) {
            if (__DEV__) console.error('[Home] Erro ao buscar diagnosticos:', err);
            setDiagnosisError(true);
          }
        })(),
      );

      // Month-scoped count for the free-plan remaining counter
      promises.push(
        (async () => {
          try {
            const firstOfMonth = new Date();
            firstOfMonth.setDate(1);
            firstOfMonth.setHours(0, 0, 0, 0);
            const { count } = await supabase
              .from('pragas_diagnoses')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', user.id)
              .gte('created_at', firstOfMonth.toISOString());
            setMonthlyDiagnosisCount(count ?? 0);
          } catch (err) {
            if (__DEV__) console.warn('[Home] Monthly count fetch failed:', err);
          }
        })(),
      );

      // Subscription status (don't block if RevenueCat not configured)
      if (isRevenueCatConfigured()) {
        promises.push(
          (async () => {
            try {
              const { isActive } = await checkSubscriptionStatus();
              setIsFreePlan(!isActive);
            } catch (err) {
              if (__DEV__) console.warn('[Home] Subscription check failed:', err);
            }
          })(),
        );
      }
    }

    await Promise.all(promises);
  }, [location, cityName, session, user]);

  // QW-1 (W16-1, 2026-05-22): Location prompt moved to consent-location.tsx#handleAccept.
  // Do NOT fire getCurrentLocation() here — it would re-prompt users who already
  // declined LGPD consent (effectively bypassing their choice) and re-show the OS
  // dialog every time Home remounts. The diagnosis flow (app/diagnosis/loading.tsx)
  // still calls getCurrentLocation() at point-of-use which is the correct moment.
  useEffect(() => {
    let mounted = true;
    loadData().finally(() => {
      if (mounted) setIsInitialLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [loadData]);

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
        value: diagnosisError ? '!' : diagnosisCount > 0 ? `${diagnosisCount}` : '\u2014',
        label: diagnosisError ? t('common.error') : t('home.diagnoses'),
        color: diagnosisError ? Colors.coral : Colors.accent,
      },
      { icon: 'shield-checkmark', value: 'MIP', label: t('home.strategy'), color: Colors.techBlue },
      {
        icon: 'trending-up',
        value: riskLevelText,
        label: t('home.monitoring'),
        color: Colors.warmAmber,
      },
    ],
    [diagnosisError, diagnosisCount, riskLevelText, t],
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
        <View style={styles.heroContent}>
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

        {isFreePlan &&
          !diagnosisError &&
          (() => {
            const remaining = Math.max(0, FREE_MONTHLY_DIAGNOSES - monthlyDiagnosisCount);
            const exhausted = remaining === 0;
            return (
              <TouchableOpacity
                testID={exhausted ? 'home-trial-exhausted' : 'home-trial-remaining'}
                onPress={() => router.push('/paywall')}
                activeOpacity={0.8}
                style={[styles.trialCounter, exhausted && styles.trialCounterExhausted]}
                accessibilityRole="button"
                accessibilityLabel={
                  exhausted
                    ? t('home.freeDiagnosesUsed')
                    : t('home.freeDiagnosesRemaining', {
                        count: remaining,
                        total: FREE_MONTHLY_DIAGNOSES,
                      })
                }
              >
                <Ionicons
                  name={exhausted ? 'alert-circle' : 'sparkles'}
                  size={16}
                  color={exhausted ? Colors.coral : Colors.accent}
                />
                <Text
                  style={[
                    styles.trialCounterText,
                    { color: exhausted ? Colors.coral : Colors.accent },
                  ]}
                >
                  {exhausted
                    ? t('home.freeDiagnosesUsed')
                    : t('home.freeDiagnosesRemaining', {
                        count: remaining,
                        total: FREE_MONTHLY_DIAGNOSES,
                      })}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={14}
                  color={exhausted ? Colors.coral : Colors.accent}
                />
              </TouchableOpacity>
            );
          })()}

        {pendingQueueCount > 0 && (
          <View style={styles.pendingCard} accessible accessibilityRole="alert">
            <Ionicons name="cloud-upload-outline" size={18} color={Colors.warmAmber} />
            <Text style={styles.pendingText}>
              {pendingQueueCount} {t('home.pendingDiagnoses')} — {t('home.waitingConnection')}
            </Text>
          </View>
        )}

        <View style={styles.statsRow}>
          {statsData.map((stat, i) => (
            <PremiumCard key={i} style={{ flex: 1 }}>
              <View
                style={styles.statCard}
                accessible
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
            </PremiumCard>
          ))}
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
  greeting: { fontSize: FontSize.subheadline, color: 'rgba(255,255,255,0.9)' },
  userName: { fontSize: FontSize.title, fontWeight: '700', color: '#FFF' },
  content: { padding: Spacing.lg, marginTop: -16 },
  scanRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  scanIcon: {
    width: 60,
    height: 60,
    borderRadius: BorderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanTitle: { fontSize: FontSize.title3, fontWeight: '700' },
  scanSub: { fontSize: FontSize.subheadline, color: Colors.textSecondary, marginTop: 2 },
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
  ctaTitle: { fontSize: FontSize.title3, fontWeight: '700', color: '#FFF' },
  ctaSub: {
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
  trialCounter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.accent + '14',
    borderWidth: 1,
    borderColor: Colors.accent + '33',
  },
  trialCounterExhausted: {
    backgroundColor: Colors.coral + '14',
    borderColor: Colors.coral + '33',
  },
  trialCounterText: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    flexShrink: 1,
  },
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
  statCard: { alignItems: 'center', gap: 6 },
  statValue: { fontSize: FontSize.subheadline, fontWeight: '700' },
  statLabel: { fontSize: FontSize.caption2, color: Colors.textSecondary },
  sectionTitle: {
    fontSize: FontSize.title3,
    fontWeight: '700',
    marginTop: Spacing.xl,
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
  tipTitle: { fontSize: FontSize.subheadline, fontWeight: '600' },
  tipDesc: { fontSize: FontSize.caption, color: Colors.textSecondary, marginTop: 2 },
  textDark: { color: Colors.textDark },
  alertsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xl,
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
    fontWeight: '600',
    color: Colors.coral,
  },
  retryText: {
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
    fontWeight: '600',
    color: Colors.warmAmber,
  },
});
