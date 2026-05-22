import { captureException } from './sentry-shim';

export interface DailyForecast {
  date: string;
  dayAbbrev: string;
  weatherCode: number;
  temperatureMax: number;
  temperatureMin: number;
  precipitationSum: number;
  description: string;
  icon: string;
}

export interface WeatherData {
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  precipitation: number;
  rain: number;
  weatherCode: number;
  windSpeed: number;
  dailyPrecipitationSum: number;
  description: string;
  icon: string;
  forecast?: DailyForecast[];
}

import i18n from '../i18n';

function getDayAbbrevs(): string[] {
  return i18n.t('weather.days', { returnObjects: true }) as unknown as string[];
}

/** Map weather code → icon (static) + i18n description key */
const WEATHER_CODE_ICON: Record<number, { key: string; icon: string }> = {
  0: { key: 'weather.clear', icon: 'sunny' },
  1: { key: 'weather.mostlyClear', icon: 'partly-sunny' },
  2: { key: 'weather.partlyCloudy', icon: 'partly-sunny' },
  3: { key: 'weather.overcast', icon: 'cloudy' },
  45: { key: 'weather.fog', icon: 'cloudy' },
  48: { key: 'weather.rimeFog', icon: 'cloudy' },
  51: { key: 'weather.drizzleLight', icon: 'rainy' },
  53: { key: 'weather.drizzleMod', icon: 'rainy' },
  55: { key: 'weather.drizzleHeavy', icon: 'rainy' },
  56: { key: 'weather.freezingDrizzleLight', icon: 'rainy' },
  57: { key: 'weather.freezingDrizzleHeavy', icon: 'rainy' },
  61: { key: 'weather.rainLight', icon: 'rainy' },
  63: { key: 'weather.rainMod', icon: 'rainy' },
  65: { key: 'weather.rainHeavy', icon: 'rainy' },
  66: { key: 'weather.freezingRainLight', icon: 'rainy' },
  67: { key: 'weather.freezingRainHeavy', icon: 'rainy' },
  71: { key: 'weather.snowLight', icon: 'snow' },
  73: { key: 'weather.snowMod', icon: 'snow' },
  75: { key: 'weather.snowHeavy', icon: 'snow' },
  77: { key: 'weather.hail', icon: 'snow' },
  80: { key: 'weather.showersLight', icon: 'thunderstorm' },
  81: { key: 'weather.showersMod', icon: 'thunderstorm' },
  82: { key: 'weather.showersViolent', icon: 'thunderstorm' },
  85: { key: 'weather.snowShowersLight', icon: 'snow' },
  86: { key: 'weather.snowShowersHeavy', icon: 'snow' },
  95: { key: 'weather.thunderstorm', icon: 'thunderstorm' },
  96: { key: 'weather.thunderstormHailLight', icon: 'thunderstorm' },
  99: { key: 'weather.thunderstormHailHeavy', icon: 'thunderstorm' },
};

function getWeatherDescription(code: number): { description: string; icon: string } {
  const entry = WEATHER_CODE_ICON[code];
  if (!entry) return { description: i18n.t('weather.unknown'), icon: 'partly-sunny' };
  return { description: i18n.t(entry.key), icon: entry.icon };
}

import AsyncStorage from '@react-native-async-storage/async-storage';

const WEATHER_CACHE_KEY = '@rumo_pragas_weather_cache';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface WeatherCache {
  data: WeatherData;
  timestamp: number;
}

async function getCachedWeather(): Promise<WeatherData | null> {
  try {
    const raw = await AsyncStorage.getItem(WEATHER_CACHE_KEY);
    if (!raw) return null;
    const cache: WeatherCache = JSON.parse(raw);
    const age = Date.now() - cache.timestamp;
    if (age > CACHE_TTL_MS) return null;
    return cache.data;
  } catch {
    return null;
  }
}

async function setCachedWeather(data: WeatherData): Promise<void> {
  try {
    const cache: WeatherCache = { data, timestamp: Date.now() };
    await AsyncStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Silently fail — caching is best-effort
  }
}

/**
 * Returns cached weather data regardless of TTL.
 * Used as fallback when the network request fails.
 */
async function getStaleCache(): Promise<WeatherData | null> {
  try {
    const raw = await AsyncStorage.getItem(WEATHER_CACHE_KEY);
    if (!raw) return null;
    const cache: WeatherCache = JSON.parse(raw);
    return cache.data;
  } catch {
    return null;
  }
}

export async function fetchWeather(
  latitude: number,
  longitude: number,
): Promise<WeatherData | null> {
  // Return fresh cache if available (within TTL)
  const cached = await getCachedWeather();
  if (cached) return cached;

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,rain,weather_code,wind_speed_10m` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code` +
      `&timezone=auto&forecast_days=7`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Weather API error: ${response.status}`);
    }

    const json = await response.json();
    const current = json.current;
    const daily = json.daily;
    const code = current.weather_code as number;
    const mapped = getWeatherDescription(code);

    const dayAbbrevs = getDayAbbrevs();
    const forecast: DailyForecast[] = (daily.time as string[]).map((dateStr: string, i: number) => {
      const dayCode = daily.weather_code[i] as number;
      const dayMapped = getWeatherDescription(dayCode);
      const date = new Date(dateStr + 'T12:00:00');
      return {
        date: dateStr,
        dayAbbrev: i === 0 ? i18n.t('weather.today') : dayAbbrevs[date.getDay()],
        weatherCode: dayCode,
        temperatureMax: daily.temperature_2m_max[i],
        temperatureMin: daily.temperature_2m_min[i],
        precipitationSum: daily.precipitation_sum[i],
        description: dayMapped.description,
        icon: dayMapped.icon,
      };
    });

    const weatherData: WeatherData = {
      temperature: current.temperature_2m,
      apparentTemperature: current.apparent_temperature,
      humidity: current.relative_humidity_2m,
      precipitation: current.precipitation,
      rain: current.rain,
      weatherCode: code,
      windSpeed: current.wind_speed_10m,
      dailyPrecipitationSum: daily.precipitation_sum?.[0] ?? 0,
      description: mapped.description,
      icon: mapped.icon,
      forecast,
    };

    // Cache the successful response
    await setCachedWeather(weatherData);

    return weatherData;
  } catch (error) {
    if (__DEV__)
      console.error(
        '[Weather] Failed to fetch weather data:',
        error instanceof Error ? error.message : error,
      );
    // ZERO-O: weather card silent failure was contributing to "home looks empty"
    // for new users on first launch. Surface so we can monitor open-meteo SLA.
    captureException(error, { tags: { feature: 'weather', step: 'fetch' } });

    // Network failed -- return stale cache if available so the UI still shows something
    const stale = await getStaleCache();
    if (stale) {
      if (__DEV__) console.warn('[Weather] Using stale cache as fallback');
      return stale;
    }

    // No cache at all -- throw so the caller can show an error state
    throw new WeatherError(
      i18n.t('errors.weatherUnavailable'),
      error instanceof Error ? error : undefined,
    );
  }
}

export class WeatherError extends Error {
  cause?: Error;
  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'WeatherError';
    this.cause = cause;
  }
}
