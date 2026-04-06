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

const DAY_ABBREVS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

const WEATHER_CODE_MAP: Record<number, { description: string; icon: string }> = {
  0: { description: 'Ceu limpo', icon: 'sunny' },
  1: { description: 'Predominantemente limpo', icon: 'partly-sunny' },
  2: { description: 'Parcialmente nublado', icon: 'partly-sunny' },
  3: { description: 'Nublado', icon: 'cloudy' },
  45: { description: 'Nevoeiro', icon: 'cloudy' },
  48: { description: 'Nevoeiro com geada', icon: 'cloudy' },
  51: { description: 'Garoa leve', icon: 'rainy' },
  53: { description: 'Garoa moderada', icon: 'rainy' },
  55: { description: 'Garoa intensa', icon: 'rainy' },
  56: { description: 'Garoa congelante leve', icon: 'rainy' },
  57: { description: 'Garoa congelante intensa', icon: 'rainy' },
  61: { description: 'Chuva leve', icon: 'rainy' },
  63: { description: 'Chuva moderada', icon: 'rainy' },
  65: { description: 'Chuva forte', icon: 'rainy' },
  66: { description: 'Chuva congelante leve', icon: 'rainy' },
  67: { description: 'Chuva congelante forte', icon: 'rainy' },
  71: { description: 'Neve leve', icon: 'snow' },
  73: { description: 'Neve moderada', icon: 'snow' },
  75: { description: 'Neve forte', icon: 'snow' },
  77: { description: 'Granizo', icon: 'snow' },
  80: { description: 'Pancadas leves', icon: 'thunderstorm' },
  81: { description: 'Pancadas moderadas', icon: 'thunderstorm' },
  82: { description: 'Pancadas violentas', icon: 'thunderstorm' },
  85: { description: 'Neve fraca', icon: 'snow' },
  86: { description: 'Neve forte', icon: 'snow' },
  95: { description: 'Tempestade', icon: 'thunderstorm' },
  96: { description: 'Tempestade com granizo leve', icon: 'thunderstorm' },
  99: { description: 'Tempestade com granizo forte', icon: 'thunderstorm' },
};

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
    const mapped = WEATHER_CODE_MAP[code] ?? { description: 'Desconhecido', icon: 'partly-sunny' };

    const forecast: DailyForecast[] = (daily.time as string[]).map((dateStr: string, i: number) => {
      const dayCode = daily.weather_code[i] as number;
      const dayMapped = WEATHER_CODE_MAP[dayCode] ?? {
        description: 'Desconhecido',
        icon: 'partly-sunny',
      };
      const date = new Date(dateStr + 'T12:00:00');
      return {
        date: dateStr,
        dayAbbrev: i === 0 ? 'Hoje' : DAY_ABBREVS[date.getDay()],
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
    console.error(
      '[Weather] Falha ao buscar dados meteorologicos:',
      error instanceof Error ? error.message : error,
    );

    // Network failed -- return stale cache if available so the UI still shows something
    const stale = await getStaleCache();
    if (stale) {
      console.info('[Weather] Usando cache expirado como fallback');
      return stale;
    }

    // No cache at all -- throw so the caller can show an error state
    throw new WeatherError(
      'Nao foi possivel obter dados meteorologicos. Verifique sua conexao.',
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
