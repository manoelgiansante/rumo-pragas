import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Animated,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { AppTheme } from '../../src/utils/theme';
import { WeatherService, WeatherData } from '../../src/services/weatherService';
import { SupabaseService } from '../../src/services/supabaseService';
import { DiagnosisResult } from '../../src/types';

// ─── Quick Tips Data (same as iOS QuickTip.defaultTips) ──────────────────────

interface QuickTip {
  id: string;
  icon: string;
  title: string;
  description: string;
}

const defaultTips: QuickTip[] = [
  {
    id: '1',
    icon: 'camera-enhance',
    title: 'Foto Nítida',
    description: 'Tire fotos de perto, com boa iluminação, focando nos sintomas da planta.',
  },
  {
    id: '2',
    icon: 'leaf-circle',
    title: 'MIP Primeiro',
    description: 'Priorize controle biológico e cultural antes de tratamentos químicos.',
  },
  {
    id: '3',
    icon: 'clock-check',
    title: 'Monitore Sempre',
    description: 'Amostragens semanais permitem detecção precoce e controle eficiente.',
  },
  {
    id: '4',
    icon: 'thermometer',
    title: 'Clima e Pragas',
    description: 'Alta umidade e temperatura favorecem doenças fúngicas. Fique atento!',
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function getRiskLevel(weather: WeatherData | null): string {
  if (!weather) return '\u2014';
  if (weather.humidity > 80 || weather.temperature > 35) return 'Alto';
  if (weather.humidity > 60 || weather.temperature > 30) return 'Médio';
  return 'Baixo';
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${day}/${month}`;
}

// ─── Default coordinates (Brasília) ──────────────────────────────────────────

const DEFAULT_LAT = -15.78;
const DEFAULT_LON = -47.93;

// ─── Component ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { accessToken, currentUser } = useAuth();
  const router = useRouter();

  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [isLoadingWeather, setIsLoadingWeather] = useState(false);
  const [recentDiagnosis, setRecentDiagnosis] = useState<DiagnosisResult | null>(null);
  const [diagnosisCount, setDiagnosisCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Animations
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const slideAnim = React.useRef(new Animated.Value(20)).current;

  const userName = currentUser?.user_metadata?.full_name || 'Produtor';

  const loadWeather = useCallback(async () => {
    setIsLoadingWeather(true);
    try {
      const data = await WeatherService.fetchWeather(DEFAULT_LAT, DEFAULT_LON);
      setWeather({ ...data, location: data.location || 'Sua região' });
    } catch {
      setWeather(null);
    }
    setIsLoadingWeather(false);
  }, []);

  const loadRecentDiagnosis = useCallback(async () => {
    if (!accessToken || !currentUser?.id) return;
    try {
      const results = await SupabaseService.fetchDiagnoses(accessToken, currentUser.id, 1);
      setRecentDiagnosis(results.length > 0 ? results[0] : null);
    } catch {
      setRecentDiagnosis(null);
    }
  }, [accessToken, currentUser]);

  const loadDiagnosisCount = useCallback(async () => {
    if (!accessToken || !currentUser?.id) return;
    try {
      const count = await SupabaseService.countDiagnoses(accessToken, currentUser.id);
      setDiagnosisCount(count);
    } catch {
      setDiagnosisCount(0);
    }
  }, [accessToken, currentUser]);

  const loadAll = useCallback(async () => {
    await Promise.all([loadWeather(), loadRecentDiagnosis(), loadDiagnosisCount()]);
  }, [loadWeather, loadRecentDiagnosis, loadDiagnosisCount]);

  useEffect(() => {
    loadAll().then(() => {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]).start();
    });
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  return (
    <View style={styles.container}>
      {/* Navigation Bar */}
      <View style={styles.navBar}>
        <MaterialCommunityIcons name="leaf" size={20} color={AppTheme.accent} />
        <Text style={styles.navBarTitle}>Rumo Pragas</Text>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={AppTheme.accent} />
        }
      >
        {/* Hero Header */}
        <View style={styles.heroContainer}>
          <View style={styles.heroGradient} />
          <View style={styles.heroFade} />
          <View style={styles.heroTextContent}>
            <Text style={styles.greetingText}>{getGreeting()}</Text>
            <Text style={styles.userName}>{userName}</Text>
          </View>
        </View>

        {/* Main Content */}
        <Animated.View
          style={[
            styles.mainContent,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Weather Card */}
          {isLoadingWeather ? (
            <View style={styles.card}>
              <View style={styles.weatherLoading}>
                <ActivityIndicator size="small" color={AppTheme.accent} />
                <Text style={styles.weatherLoadingText}>Carregando clima...</Text>
              </View>
            </View>
          ) : weather ? (
            <View style={styles.card}>
              <View style={styles.weatherRow}>
                <View style={styles.weatherLeft}>
                  <View style={styles.weatherIconCircle}>
                    <MaterialCommunityIcons
                      name={(weather.icon as any) || 'weather-sunny'}
                      size={24}
                      color={AppTheme.warmAmber}
                    />
                  </View>
                  <View>
                    <Text style={styles.weatherLocation}>{weather.location}</Text>
                    <Text style={styles.weatherTemp}>{Math.round(weather.temperature)}°C</Text>
                    <Text style={styles.weatherDesc}>
                      {weather.description.charAt(0).toUpperCase() + weather.description.slice(1)}
                    </Text>
                  </View>
                </View>
                <View style={styles.weatherRight}>
                  <View style={styles.weatherMetric}>
                    <MaterialCommunityIcons name="water-percent" size={12} color="#00BCD4" />
                    <Text style={styles.weatherMetricText}>{Math.round(weather.humidity)}%</Text>
                  </View>
                  <View style={styles.weatherMetric}>
                    <MaterialCommunityIcons name="weather-rainy" size={12} color={AppTheme.techBlue} />
                    <Text style={styles.weatherMetricText}>
                      {weather.dailyPrecipitation.toFixed(1)} mm
                    </Text>
                  </View>
                  <View style={styles.weatherMetric}>
                    <MaterialCommunityIcons name="weather-windy" size={12} color="#009688" />
                    <Text style={styles.weatherMetricText}>
                      {Math.round(weather.windSpeed)} km/h
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          ) : null}

          {/* Scan Button */}
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => router.push('/diagnosis' as any)}
          >
            <View style={styles.scanRow}>
              <View style={styles.scanIconBox}>
                <MaterialCommunityIcons name="camera-enhance" size={26} color="#fff" />
              </View>
              <View style={styles.scanTextContainer}>
                <Text style={styles.scanTitle}>Diagnosticar Praga</Text>
                <Text style={styles.scanSubtitle}>Foto ou galeria &bull; IA especializada</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={AppTheme.textTertiary} />
            </View>
          </TouchableOpacity>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <TouchableOpacity
              style={styles.statCard}
              activeOpacity={0.7}
              onPress={() => router.push('/(tabs)/history' as any)}
            >
              <MaterialCommunityIcons name="text-search" size={22} color={AppTheme.accent} />
              <Text style={styles.statValue}>
                {diagnosisCount > 0 ? `${diagnosisCount}` : '\u2014'}
              </Text>
              <Text style={styles.statLabel}>Diagnósticos</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.statCard}
              activeOpacity={0.7}
              onPress={() => router.push('/diagnosis' as any)}
            >
              <MaterialCommunityIcons name="shield-check" size={22} color={AppTheme.techBlue} />
              <Text style={styles.statValue}>MIP</Text>
              <Text style={styles.statLabel}>Estratégia</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.statCard} activeOpacity={0.7}>
              <MaterialCommunityIcons name="chart-line" size={22} color={AppTheme.warmAmber} />
              <Text style={styles.statValue}>{getRiskLevel(weather)}</Text>
              <Text style={styles.statLabel}>Monitoramento</Text>
            </TouchableOpacity>
          </View>

          {/* Recent Diagnosis */}
          {recentDiagnosis && (
            <View style={styles.sectionContainer}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Último Diagnóstico</Text>
                <MaterialCommunityIcons name="clock" size={14} color={AppTheme.textSecondary} />
              </View>
              <TouchableOpacity style={styles.card} activeOpacity={0.7}>
                <View style={styles.diagnosisRow}>
                  <View style={styles.diagnosisIconCircle}>
                    <MaterialCommunityIcons name="bug" size={20} color={AppTheme.accent} />
                  </View>
                  <View style={styles.diagnosisTextContainer}>
                    <Text style={styles.diagnosisName} numberOfLines={1}>
                      {recentDiagnosis.pest_name || 'Análise'}
                    </Text>
                    <Text style={styles.diagnosisDetail}>
                      {recentDiagnosis.crop || 'Cultura'}
                      {' \u2022 '}
                      {formatDate(recentDiagnosis.created_at)}
                    </Text>
                  </View>
                  {recentDiagnosis.confidence != null && (
                    <View style={styles.confidenceBadge}>
                      <Text style={styles.confidenceText}>
                        {Math.round(recentDiagnosis.confidence * 100)}%
                      </Text>
                    </View>
                  )}
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={18}
                    color={AppTheme.textTertiary}
                  />
                </View>
              </TouchableOpacity>
            </View>
          )}

          {/* Tips Section */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Boas Práticas</Text>
              <MaterialCommunityIcons name="lightbulb" size={14} color={AppTheme.warmAmber} />
            </View>
            {defaultTips.map((tip) => (
              <View key={tip.id} style={styles.card}>
                <View style={styles.tipRow}>
                  <View style={styles.tipIconBox}>
                    <MaterialCommunityIcons
                      name={tip.icon as any}
                      size={18}
                      color={AppTheme.accent}
                    />
                  </View>
                  <View style={styles.tipTextContainer}>
                    <Text style={styles.tipTitle}>{tip.title}</Text>
                    <Text style={styles.tipDescription} numberOfLines={2}>
                      {tip.description}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: AppTheme.background,
  },
  scrollContent: {
    paddingBottom: 32,
  },

  // Nav Bar
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingTop: Platform.OS === 'ios' ? 56 : 44,
    paddingBottom: 10,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: AppTheme.border,
  },
  navBarTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: AppTheme.text,
  },

  // Hero
  heroContainer: {
    height: 190,
    position: 'relative',
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: AppTheme.accent,
  },
  heroFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    backgroundColor: AppTheme.background,
    opacity: 0.5,
  },
  heroTextContent: {
    position: 'absolute',
    bottom: 20,
    left: 20,
  },
  greetingText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 4,
  },
  userName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },

  // Main Content
  mainContent: {
    paddingHorizontal: 16,
    marginTop: -16,
    gap: 16,
  },

  // Card
  card: {
    backgroundColor: AppTheme.cardBackground,
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },

  // Weather
  weatherLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  weatherLoadingText: {
    fontSize: 14,
    color: AppTheme.textSecondary,
  },
  weatherRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  weatherLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  weatherIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: `${AppTheme.warmAmber}26`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  weatherLocation: {
    fontSize: 12,
    color: AppTheme.textSecondary,
    marginBottom: 2,
  },
  weatherTemp: {
    fontSize: 22,
    fontWeight: 'bold',
    color: AppTheme.text,
  },
  weatherDesc: {
    fontSize: 12,
    color: AppTheme.textSecondary,
    marginTop: 1,
  },
  weatherRight: {
    gap: 8,
    alignItems: 'flex-end',
  },
  weatherMetric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  weatherMetricText: {
    fontSize: 12,
    fontWeight: '600',
    color: AppTheme.text,
    fontVariant: ['tabular-nums'],
  },

  // Scan Button
  scanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  scanIconBox: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: AppTheme.accent,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: AppTheme.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  scanTextContainer: {
    flex: 1,
    gap: 4,
  },
  scanTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: AppTheme.text,
  },
  scanSubtitle: {
    fontSize: 14,
    color: AppTheme.textSecondary,
  },

  // Stats Row
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: AppTheme.cardBackground,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  statValue: {
    fontSize: 15,
    fontWeight: 'bold',
    color: AppTheme.text,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: AppTheme.textSecondary,
  },

  // Section
  sectionContainer: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: AppTheme.text,
  },

  // Recent Diagnosis
  diagnosisRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  diagnosisIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: `${AppTheme.accent}1F`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  diagnosisTextContainer: {
    flex: 1,
    gap: 2,
  },
  diagnosisName: {
    fontSize: 15,
    fontWeight: '600',
    color: AppTheme.text,
  },
  diagnosisDetail: {
    fontSize: 12,
    color: AppTheme.textSecondary,
  },
  confidenceBadge: {
    backgroundColor: `${AppTheme.accent}1F`,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  confidenceText: {
    fontSize: 12,
    fontWeight: '600',
    color: AppTheme.accent,
  },

  // Tips
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  tipIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: `${AppTheme.accent}1F`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tipTextContainer: {
    flex: 1,
    gap: 3,
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: AppTheme.text,
  },
  tipDescription: {
    fontSize: 12,
    color: AppTheme.textSecondary,
    lineHeight: 17,
  },
});
