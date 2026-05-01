import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  RefreshControl,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, Spacing, BorderRadius, FontSize, FontWeight } from '../../constants/theme';
import { PremiumCard } from '../../components/PremiumCard';
import { WeatherCard } from '../../components/WeatherCard';
import { AlertCard } from '../../components/AlertCard';
import { HomeScreenSkeleton } from '../../components/HomeScreenSkeleton';
import { Hero, IconButton, PrimaryAmberButton, SectionHeader, StatTile } from '../../components/ui';
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
  const { location, cityName, getCurrentLocation } = useLocation();
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

  const firstName = useMemo(() => {
    const full = user?.user_metadata?.full_name as string | undefined;
    if (full && typeof full === 'string') {
      const trimmed = full.trim();
      if (trimmed.length > 0) return trimmed.split(/\s+/)[0];
    }
    return t('home.defaultUser');
  }, [user, t]);

  const hasUnreadAlerts = alerts.some((a) => a.severity === 'high');

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

  useEffect(() => {
    getCurrentLocation();
  }, [getCurrentLocation]);
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
    if (!weather) return '—';
    if (weather.humidity > 80 || weather.temperature > 35) return t('home.riskHigh');
    if (weather.humidity > 60 || weather.temperature > 30) return t('home.riskMedium');
    return t('home.riskLow');
  }, [weather, t]);

  const statsData = useMemo(
    () => [
      {
        icon: 'document-text',
        value: diagnosisError ? '!' : diagnosisCount > 0 ? `${diagnosisCount}` : '—',
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
      <Hero style={styles.hero}>
        {/* Subtle bottom fade to blend hero into content */}
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.18)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* Top row: greeting + meta · bell */}
        <View style={styles.heroTopRow}>
          <View style={styles.heroGreetingCol}>
            <Text style={styles.heroGreeting} numberOfLines={1} accessibilityRole="header">
              {greetingText}, {firstName}
            </Text>
            {cityName ? (
              <View style={styles.heroMetaRow} accessible accessibilityLabel={cityName}>
                <Ionicons
                  name="location"
                  size={12}
                  color="rgba(255,255,255,0.78)"
                  accessibilityElementsHidden
                />
                <Text style={styles.heroMetaText} numberOfLines={1}>
                  {cityName}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={styles.bellWrap}>
            <IconButton
              iconName="notifications"
              tone="onHero"
              size={18}
              accessibilityLabel={t('home.regionalAlerts')}
              onPress={() => {
                if (alerts.length > 0) {
                  // Already on this screen — alerts are below; simply scroll-affordance via haptic.
                  // Keep no-op navigation to avoid invented routes.
                }
              }}
            />
            {hasUnreadAlerts ? <View style={styles.bellDot} pointerEvents="none" /> : null}
          </View>
        </View>

        {/* h1 + subtitle */}
        <Text style={styles.heroTitle} accessibilityRole="header">
          {t('home.diagnosePest')}
        </Text>
        <Text style={styles.heroSubtitle}>{t('home.photoOrGallery')}</Text>

        {/* Primary amber CTA */}
        <PrimaryAmberButton
          size="lg"
          block
          iconName="camera"
          onPress={() => router.push('/diagnosis/camera')}
          accessibilityLabel={t('home.diagnosePestA11y')}
          accessibilityHint={t('home.diagnosePestHint')}
          style={styles.primaryCta}
        >
          {t('diagnosis.takePhoto')}
        </PrimaryAmberButton>

        {/* Two translucent secondary buttons */}
        <View style={styles.secondaryRow}>
          <Pressable
            onPress={() => router.push('/diagnosis/camera')}
            accessibilityRole="button"
            accessibilityLabel={t('diagnosis.chooseGalleryA11y')}
            accessibilityHint={t('diagnosis.chooseGalleryHint')}
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
          >
            <Ionicons name="image" size={16} color={Colors.white} />
            <Text style={styles.secondaryBtnText} numberOfLines={1}>
              {t('diagnosis.chooseGallery')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/(tabs)/ai-chat')}
            accessibilityRole="button"
            accessibilityLabel={t('tabs.aiChatA11y')}
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
          >
            <Ionicons name="sparkles" size={16} color={Colors.white} />
            <Text style={styles.secondaryBtnText} numberOfLines={1}>
              {t('tabs.aiChat')}
            </Text>
          </Pressable>
        </View>
      </Hero>

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

        {isFreePlan &&
          !diagnosisError &&
          (() => {
            const remaining = Math.max(0, FREE_MONTHLY_DIAGNOSES - monthlyDiagnosisCount);
            const exhausted = remaining === 0;
            return (
              <TouchableOpacity
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
            <StatTile
              key={i}
              value={
                <View style={styles.statTileValueRow}>
                  <Ionicons
                    name={stat.icon as keyof typeof Ionicons.glyphMap}
                    size={20}
                    color={stat.color}
                    accessibilityElementsHidden
                  />
                  <Text style={[styles.statTileValueText, { color: stat.color }]} numberOfLines={1}>
                    {stat.value}
                  </Text>
                </View>
              }
              label={stat.label}
            />
          ))}
        </View>

        {alerts.length > 0 && (
          <>
            <SectionHeader
              title={t('home.regionalAlerts')}
              style={styles.sectionHeaderInline}
              titleStyle={isDark ? styles.textDark : undefined}
            />
            {alerts.map((alert) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </>
        )}

        <SectionHeader
          title={t('home.bestPractices')}
          style={styles.sectionHeaderInline}
          titleStyle={isDark ? styles.textDark : undefined}
        />
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
  hero: {
    paddingTop: 24,
    paddingBottom: 32,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  heroGreetingCol: {
    flex: 1,
    paddingRight: 12,
  },
  heroGreeting: {
    fontSize: 14,
    fontWeight: FontWeight.medium,
    color: 'rgba(255,255,255,0.92)',
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  heroMetaText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.78)',
    flexShrink: 1,
  },
  bellWrap: {
    position: 'relative',
  },
  bellDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.warmAmber,
    borderWidth: 2,
    borderColor: Colors.accent,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: FontWeight.bold,
    letterSpacing: -0.56, // ~-0.02em at 28
    color: Colors.white,
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 15,
    fontWeight: FontWeight.medium,
    color: 'rgba(255,255,255,0.92)',
    marginBottom: 20,
  },
  primaryCta: {
    // Override built-in amber shadow to match mock spec
    shadowColor: Colors.warmAmber,
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 8,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  secondaryBtnPressed: {
    opacity: 0.85,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: FontWeight.semibold,
    color: Colors.white,
    flexShrink: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 16,
    marginTop: -16,
    gap: Spacing.md,
  },
  trialCounter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
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
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  statTileValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statTileValueText: {
    fontSize: FontSize.title3, // 20
    fontWeight: FontWeight.bold,
    letterSpacing: -0.3,
  },
  sectionHeaderInline: {
    paddingHorizontal: 0,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xs,
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
  errorCard: {
    backgroundColor: Colors.coral + '14',
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.xs,
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
