import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PremiumCard } from './PremiumCard';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius } from '../constants/theme';
import type { DailyForecast } from '../services/weather';

export interface WeatherCardData {
  temperature: number;
  humidity: number;
  windSpeed: number;
  dailyPrecipitationSum: number;
  description: string;
  icon: string;
  location?: string;
  forecast?: DailyForecast[];
}

interface WeatherCardProps {
  weather: WeatherCardData | null;
  isLoading?: boolean;
}

function getWeatherIcon(icon: string): React.ComponentProps<typeof Ionicons>['name'] {
  if (icon.includes('sun') || icon.includes('clear')) return 'sunny';
  if (icon.includes('cloud.rain') || icon.includes('rain')) return 'rainy';
  if (icon.includes('cloud.bolt') || icon.includes('thunder')) return 'thunderstorm';
  if (icon.includes('cloud')) return 'cloudy';
  if (icon.includes('snow')) return 'snow';
  return 'partly-sunny';
}

export const WeatherCard = React.memo(function WeatherCard({
  weather,
  isLoading = false,
}: WeatherCardProps) {
  const isDark = useColorScheme() === 'dark';

  if (isLoading) {
    return (
      <PremiumCard>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={Colors.accent} />
          <Text style={[styles.loadingText, isDark && { color: Colors.textDark }]}>
            Carregando clima...
          </Text>
        </View>
      </PremiumCard>
    );
  }

  if (!weather) return null;

  return (
    <PremiumCard>
      <View
        style={styles.container}
        accessible
        accessibilityLabel={`Clima em ${weather.location || 'sua regiao'}: ${Math.round(weather.temperature)} graus, ${weather.description}, umidade ${Math.round(weather.humidity)} por cento, precipitacao ${weather.dailyPrecipitationSum.toFixed(1)} milimetros, vento ${Math.round(weather.windSpeed)} quilometros por hora`}
        accessibilityRole="summary"
      >
        <View style={styles.leftSection}>
          <View style={styles.iconCircle}>
            <Ionicons name={getWeatherIcon(weather.icon)} size={24} color={Colors.warmAmber} accessibilityElementsHidden />
          </View>
          <View style={styles.tempInfo}>
            <Text style={[styles.location, isDark && { color: Colors.systemGray2 }]}>
              {weather.location || 'Sua regiao'}
            </Text>
            <Text style={[styles.temperature, isDark && { color: Colors.textDark }]}>
              {Math.round(weather.temperature)}
              {'\u00B0'}C
            </Text>
            <Text style={[styles.description, isDark && { color: Colors.systemGray2 }]}>
              {weather.description}
            </Text>
          </View>
        </View>

        <View style={styles.metricsColumn}>
          <MetricRow
            icon="water"
            value={`${Math.round(weather.humidity)}%`}
            color="#00BCD4"
            isDark={isDark}
          />
          <MetricRow
            icon="rainy"
            value={`${weather.dailyPrecipitationSum.toFixed(1)} mm`}
            color={Colors.techBlue}
            isDark={isDark}
          />
          <MetricRow
            icon="leaf"
            value={`${Math.round(weather.windSpeed)} km/h`}
            color="#009688"
            isDark={isDark}
          />
        </View>
      </View>

      {weather.forecast && weather.forecast.length > 0 && (
        <>
          <View
            style={[styles.forecastDivider, isDark && { backgroundColor: Colors.separatorDark }]}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.forecastRow}
          >
            {weather.forecast.map((day) => (
              <ForecastDayCard key={day.date} day={day} isDark={isDark} />
            ))}
          </ScrollView>
        </>
      )}
    </PremiumCard>
  );
});

function ForecastDayCard({ day, isDark }: { day: DailyForecast; isDark: boolean }) {
  return (
    <View style={[styles.forecastCard, isDark && { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
      <Text style={[styles.forecastDay, isDark && { color: Colors.systemGray2 }]}>
        {day.dayAbbrev}
      </Text>
      <Ionicons name={getWeatherIcon(day.icon)} size={18} color={Colors.warmAmber} />
      <Text style={[styles.forecastTemp, isDark && { color: Colors.textDark }]}>
        {Math.round(day.temperatureMax)}
        {'\u00B0'}
      </Text>
      <Text style={[styles.forecastTempMin, isDark && { color: Colors.systemGray2 }]}>
        {Math.round(day.temperatureMin)}
        {'\u00B0'}
      </Text>
    </View>
  );
}

function MetricRow({
  icon,
  value,
  color,
  isDark,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  value: string;
  color: string;
  isDark: boolean;
}) {
  return (
    <View style={styles.metricRow}>
      <Ionicons name={icon} size={12} color={color} />
      <Text style={[styles.metricValue, isDark && { color: Colors.systemGray2 }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  iconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(235, 176, 38, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tempInfo: {
    gap: 2,
  },
  location: {
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
  },
  temperature: {
    fontSize: FontSize.title2,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  description: {
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
    textTransform: 'capitalize',
  },
  metricsColumn: {
    alignItems: 'flex-end',
    gap: Spacing.sm,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metricValue: {
    fontSize: FontSize.caption,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  forecastDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.separator,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  forecastRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingVertical: 4,
  },
  forecastCard: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(0,0,0,0.03)',
    minWidth: 52,
  },
  forecastDay: {
    fontSize: 11,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    textTransform: 'capitalize',
  },
  forecastTemp: {
    fontSize: FontSize.caption,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  forecastTempMin: {
    fontSize: 11,
    color: Colors.systemGray3,
    fontVariant: ['tabular-nums'],
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: Spacing.md,
  },
  loadingText: {
    fontSize: FontSize.subheadline,
    color: Colors.textSecondary,
  },
});
