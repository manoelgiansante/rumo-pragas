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

/**
 * Hourly slice used by the field-conditions card (24 h forward-looking).
 * Values come from Open-Meteo `hourly=`; if the API returns fewer / more
 * hours we only ever consume the next 24 h from now.
 */
export interface HourlySlice {
  /** ISO local timestamp — parsed with `T12:00:00` fallback like daily. */
  time: string;
  /** km/h. */
  windSpeed: number;
  /** Percent (0..100). */
  precipitationProbability: number;
  /** Percent (0..100). */
  humidity: number;
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
  /** Next up-to-24 h hourly slices, ordered ascending. May be omitted if
   *  the upstream did not return the hourly section. */
  hourly24h?: HourlySlice[];
}

import i18n from '../i18n';
import { minimizeCoordinates } from './locationPrivacy';

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
const WEATHER_TIMEOUT_MS = 10_000;
const WEATHER_RESPONSE_MAX_BYTES = 128 * 1024;

interface WeatherCache {
  data: WeatherData;
  timestamp: number;
  latitude: number;
  longitude: number;
}

interface OpenMeteoPayload {
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    precipitation: number;
    rain: number;
    weather_code: number;
    wind_speed_10m: number;
  };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    weather_code: number[];
  };
  /** Optional block — the classifier degrades gracefully if it is missing. */
  hourly?: {
    time: string[];
    wind_speed_10m: number[];
    precipitation_probability: number[];
    relative_humidity_2m: number[];
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isFiniteNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(isFiniteNumber);
}

function parseOpenMeteoPayload(value: unknown): OpenMeteoPayload | null {
  if (!value || typeof value !== 'object') return null;
  const root = value as Record<string, unknown>;
  if (!root.current || typeof root.current !== 'object') return null;
  if (!root.daily || typeof root.daily !== 'object') return null;
  const current = root.current as Record<string, unknown>;
  const daily = root.daily as Record<string, unknown>;
  const currentValues = [
    current.temperature_2m,
    current.apparent_temperature,
    current.relative_humidity_2m,
    current.precipitation,
    current.rain,
    current.weather_code,
    current.wind_speed_10m,
  ];
  if (!currentValues.every(isFiniteNumber)) return null;
  const dailyTime = daily.time;
  if (!Array.isArray(dailyTime) || dailyTime.length < 1 || dailyTime.length > 7) return null;
  if (!dailyTime.every((date) => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date))) {
    return null;
  }
  const arrays = [
    daily.temperature_2m_max,
    daily.temperature_2m_min,
    daily.precipitation_sum,
    daily.weather_code,
  ];
  if (!arrays.every(isFiniteNumberArray)) return null;
  if (!arrays.every((array) => (array as number[]).length === dailyTime.length)) return null;
  // Hourly block is OPTIONAL. If present, it must be well-formed; if
  // malformed we drop it (return the payload without hourly) rather than
  // failing the whole weather fetch — the manageability card degrades
  // to "no card" but the current weather still renders.
  if (root.hourly !== undefined) {
    const hourly = root.hourly;
    if (!hourly || typeof hourly !== 'object') {
      delete root.hourly;
    } else {
      const h = hourly as Record<string, unknown>;
      const hourlyTime = h.time;
      const hourlyArrays = [h.wind_speed_10m, h.precipitation_probability, h.relative_humidity_2m];
      const validTime =
        Array.isArray(hourlyTime) &&
        hourlyTime.length > 0 &&
        hourlyTime.length <= 240 &&
        hourlyTime.every((t) => typeof t === 'string');
      const validArrays =
        hourlyArrays.every(isFiniteNumberArray) &&
        hourlyArrays.every((a) => (a as number[]).length === (hourlyTime as string[]).length);
      if (!validTime || !validArrays) {
        delete root.hourly;
      }
    }
  }
  return value as OpenMeteoPayload;
}

function isWeatherData(value: unknown): value is WeatherData {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return (
    [
      data.temperature,
      data.apparentTemperature,
      data.humidity,
      data.precipitation,
      data.rain,
      data.weatherCode,
      data.windSpeed,
      data.dailyPrecipitationSum,
    ].every(isFiniteNumber) &&
    typeof data.description === 'string' &&
    typeof data.icon === 'string'
  );
}

function parseWeatherCache(raw: string): WeatherCache | null {
  try {
    const value = JSON.parse(raw) as Partial<WeatherCache>;
    if (
      !isWeatherData(value.data) ||
      !isFiniteNumber(value.timestamp) ||
      !isFiniteNumber(value.latitude) ||
      !isFiniteNumber(value.longitude)
    ) {
      return null;
    }
    return value as WeatherCache;
  } catch {
    return null;
  }
}

async function getCachedWeather(latitude: number, longitude: number): Promise<WeatherData | null> {
  try {
    const raw = await AsyncStorage.getItem(WEATHER_CACHE_KEY);
    if (!raw) return null;
    const cache = parseWeatherCache(raw);
    if (!cache) return null;
    if (cache.latitude !== latitude || cache.longitude !== longitude) return null;
    const age = Date.now() - cache.timestamp;
    if (age > CACHE_TTL_MS) return null;
    return cache.data;
  } catch {
    return null;
  }
}

async function setCachedWeather(
  data: WeatherData,
  latitude: number,
  longitude: number,
): Promise<void> {
  try {
    const cache: WeatherCache = { data, timestamp: Date.now(), latitude, longitude };
    await AsyncStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Silently fail — caching is best-effort
  }
}

/**
 * Returns cached weather data regardless of TTL.
 * Used as fallback when the network request fails.
 */
async function getStaleCache(latitude: number, longitude: number): Promise<WeatherData | null> {
  try {
    const raw = await AsyncStorage.getItem(WEATHER_CACHE_KEY);
    if (!raw) return null;
    const cache = parseWeatherCache(raw);
    if (!cache) return null;
    if (cache.latitude !== latitude || cache.longitude !== longitude) return null;
    return cache.data;
  } catch {
    return null;
  }
}

export async function fetchWeather(
  latitude: number,
  longitude: number,
): Promise<WeatherData | null> {
  const approximate = minimizeCoordinates(latitude, longitude);
  if (!approximate) return null;
  latitude = approximate.latitude;
  longitude = approximate.longitude;
  // Return fresh cache if available (within TTL)
  const cached = await getCachedWeather(latitude, longitude);
  if (cached) return cached;

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,rain,weather_code,wind_speed_10m` +
      `&hourly=wind_speed_10m,precipitation_probability,relative_humidity_2m` +
      `&forecast_hours=24` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code` +
      `&timezone=auto&forecast_days=7`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WEATHER_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw new Error('WEATHER_UPSTREAM_ERROR');

    const responseText = await response.text();
    if (new TextEncoder().encode(responseText).byteLength > WEATHER_RESPONSE_MAX_BYTES) {
      throw new Error('WEATHER_RESPONSE_TOO_LARGE');
    }
    let rawPayload: unknown;
    try {
      rawPayload = JSON.parse(responseText);
    } catch {
      throw new Error('WEATHER_INVALID_RESPONSE');
    }
    const json = parseOpenMeteoPayload(rawPayload);
    if (!json) throw new Error('WEATHER_INVALID_RESPONSE');
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
        // getDayAbbrevs() returns 7 entries; getDay() is always 0-6, so the
        // lookup is in-bounds. Assert for noUncheckedIndexedAccess (runtime
        // unchanged).
        dayAbbrev: i === 0 ? i18n.t('weather.today') : dayAbbrevs[date.getDay()]!,
        weatherCode: dayCode,
        // parseOpenMeteoPayload verifies all daily arrays have exactly the
        // same length as `time`, so these indexed values are present.
        temperatureMax: daily.temperature_2m_max[i]!,
        temperatureMin: daily.temperature_2m_min[i]!,
        precipitationSum: daily.precipitation_sum[i]!,
        description: dayMapped.description,
        icon: dayMapped.icon,
      };
    });

    // Cap to the next 24 hours from now regardless of what Open-Meteo returns
    // (`forecast_hours=24` already limits it, but defense in depth).
    const hourly24h: HourlySlice[] | undefined = json.hourly
      ? json.hourly.time.slice(0, 24).map((time, i) => ({
          time,
          windSpeed: json.hourly!.wind_speed_10m[i] ?? 0,
          precipitationProbability: json.hourly!.precipitation_probability[i] ?? 0,
          humidity: json.hourly!.relative_humidity_2m[i] ?? 0,
        }))
      : undefined;

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
      ...(hourly24h ? { hourly24h } : {}),
    };

    // Cache the successful response
    await setCachedWeather(weatherData, latitude, longitude);

    return weatherData;
  } catch (error) {
    if (__DEV__) console.warn('[Weather] Request unavailable');

    // Network failed -- return stale cache if available so the UI still shows something
    const stale = await getStaleCache(latitude, longitude);
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
  cause?: Error | undefined;
  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'WeatherError';
    this.cause = cause;
  }
}

// -----------------------------------------------------------------------------
// Field conditions classifier (next 24 h)
// -----------------------------------------------------------------------------
// Produces a NEUTRAL classification of the next 24 h for GENERAL field
// activities (walking, inspecting, planning). Deliberately NOT tied to any
// pesticide window / dose / product recommendation — the UI card built on top
// of this classifier must render the disclaimer copy from
// `reinspection`/`fieldConditions` i18n blocks.

export type FieldConditionsStatus = 'favorable' | 'attention' | 'unfavorable';

/** Thresholds are conservative and generic (no crop / product hint). */
export const FIELD_CONDITIONS_THRESHOLDS = Object.freeze({
  /** km/h — sustained forecast wind considered strong for general field work. */
  windStrongKmh: 25,
  /** Percent — probability of precipitation considered "likely" enough to flag. */
  precipProbHighPct: 60,
  /** Percent — probability considered "possible" (borderline). */
  precipProbBorderlinePct: 30,
  /** km/h — wind considered borderline (attention). */
  windBorderlineKmh: 15,
});

export interface FieldConditionsSummary {
  status: FieldConditionsStatus;
  /** Peak hourly wind in the window (km/h). */
  maxWindSpeed: number;
  /** Peak precipitation probability in the window (0..100). */
  maxPrecipitationProbability: number;
  /** Peak humidity in the window (0..100). */
  maxHumidity: number;
  /** Bounded reason codes; UI maps to i18n copy. Never surface raw thresholds. */
  reasons: Array<'wind_strong' | 'precip_high' | 'wind_borderline' | 'precip_borderline'>;
}

/**
 * Classifies the next 24 h into `favorable` / `attention` / `unfavorable`
 * for general field activities. Returns `null` when hourly data is missing
 * or empty — callers should HIDE the card in that case (no card is better
 * than a stale / made-up one).
 *
 * Rules (explicit + auditable — see FIELD_CONDITIONS_THRESHOLDS):
 *   - strong wind (>= windStrongKmh) OR high precip probability
 *     (>= precipProbHighPct) → unfavorable.
 *   - borderline wind (>= windBorderlineKmh) OR borderline precip
 *     probability (>= precipProbBorderlinePct) → attention.
 *   - otherwise → favorable.
 */
export function classifyFieldConditions24h(
  hourly: HourlySlice[] | undefined | null,
): FieldConditionsSummary | null {
  if (!Array.isArray(hourly) || hourly.length === 0) return null;
  const window = hourly.slice(0, 24);
  if (window.length === 0) return null;

  let maxWindSpeed = 0;
  let maxPrecipitationProbability = 0;
  let maxHumidity = 0;
  for (const slice of window) {
    if (Number.isFinite(slice.windSpeed) && slice.windSpeed > maxWindSpeed) {
      maxWindSpeed = slice.windSpeed;
    }
    if (
      Number.isFinite(slice.precipitationProbability) &&
      slice.precipitationProbability > maxPrecipitationProbability
    ) {
      maxPrecipitationProbability = slice.precipitationProbability;
    }
    if (Number.isFinite(slice.humidity) && slice.humidity > maxHumidity) {
      maxHumidity = slice.humidity;
    }
  }

  const reasons: FieldConditionsSummary['reasons'] = [];
  const windStrong = maxWindSpeed >= FIELD_CONDITIONS_THRESHOLDS.windStrongKmh;
  const precipHigh = maxPrecipitationProbability >= FIELD_CONDITIONS_THRESHOLDS.precipProbHighPct;
  const windBorderline =
    !windStrong && maxWindSpeed >= FIELD_CONDITIONS_THRESHOLDS.windBorderlineKmh;
  const precipBorderline =
    !precipHigh &&
    maxPrecipitationProbability >= FIELD_CONDITIONS_THRESHOLDS.precipProbBorderlinePct;

  if (windStrong) reasons.push('wind_strong');
  if (precipHigh) reasons.push('precip_high');
  if (windBorderline) reasons.push('wind_borderline');
  if (precipBorderline) reasons.push('precip_borderline');

  const status: FieldConditionsStatus =
    windStrong || precipHigh ? 'unfavorable' : reasons.length > 0 ? 'attention' : 'favorable';

  return {
    status,
    maxWindSpeed,
    maxPrecipitationProbability,
    maxHumidity,
    reasons,
  };
}
