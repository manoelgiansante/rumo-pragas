import {
  fetchWeather,
  WeatherError,
  classifyFieldConditions24h,
  FIELD_CONDITIONS_THRESHOLDS,
} from '../../services/weather';
import type { HourlySlice } from '../../services/weather';
import AsyncStorage from '@react-native-async-storage/async-storage';

// AsyncStorage is globally mocked via jest.setup.ts
const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

const mockFetch = jest.fn();
global.fetch = mockFetch;

const WEATHER_CACHE_KEY = '@rumo_pragas_weather_cache';

function makeOpenMeteoResponse() {
  return {
    current: {
      temperature_2m: 28.5,
      apparent_temperature: 30.1,
      relative_humidity_2m: 72,
      precipitation: 0,
      rain: 0,
      weather_code: 1,
      wind_speed_10m: 12.3,
    },
    daily: {
      time: ['2026-03-26', '2026-03-27', '2026-03-28'],
      temperature_2m_max: [30, 31, 29],
      temperature_2m_min: [20, 21, 19],
      precipitation_sum: [2, 0, 5],
      weather_code: [1, 0, 61],
    },
    hourly: {
      time: Array.from({ length: 24 }, (_, i) => `2026-03-26T${String(i).padStart(2, '0')}:00`),
      wind_speed_10m: Array.from({ length: 24 }, () => 10),
      precipitation_probability: Array.from({ length: 24 }, () => 5),
      relative_humidity_2m: Array.from({ length: 24 }, () => 70),
    },
  };
}

function okWeatherResponse(payload: unknown = makeOpenMeteoResponse()) {
  return {
    ok: true,
    text: async () => JSON.stringify(payload),
  };
}

describe('fetchWeather', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAsyncStorage.getItem.mockResolvedValue(null);
    mockAsyncStorage.setItem.mockResolvedValue(undefined);
  });

  it('returns correct data structure from API', async () => {
    mockFetch.mockResolvedValueOnce(okWeatherResponse());

    const result = await fetchWeather(-23.55, -46.63);

    expect(result).not.toBeNull();
    expect(result!.temperature).toBe(28.5);
    expect(result!.humidity).toBe(72);
    expect(result!.windSpeed).toBe(12.3);
    expect(result!.forecast).toHaveLength(3);
    expect(result!.forecast![0]!.dayAbbrev).toMatch(/Hoje/);
  });

  it('returns cached data when cache is fresh', async () => {
    const cachedData = {
      temperature: 25,
      apparentTemperature: 26,
      humidity: 60,
      precipitation: 0,
      rain: 0,
      weatherCode: 0,
      windSpeed: 5,
      dailyPrecipitationSum: 0,
      description: 'Céu limpo',
      icon: 'sunny',
    };

    mockAsyncStorage.getItem.mockResolvedValueOnce(
      JSON.stringify({
        data: cachedData,
        timestamp: Date.now(),
        latitude: -23.55,
        longitude: -46.63,
      }),
    );

    const result = await fetchWeather(-23.55, -46.63);

    expect(result).toEqual(cachedData);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches from API when cache is expired', async () => {
    const staleTimestamp = Date.now() - 15 * 60 * 1000;

    mockAsyncStorage.getItem.mockResolvedValueOnce(
      JSON.stringify({
        data: {
          temperature: 20,
          apparentTemperature: 20,
          humidity: 60,
          precipitation: 0,
          rain: 0,
          weatherCode: 0,
          windSpeed: 2,
          dailyPrecipitationSum: 0,
          description: 'Céu limpo',
          icon: 'sunny',
        },
        timestamp: staleTimestamp,
        latitude: -23.55,
        longitude: -46.63,
      }),
    );

    mockFetch.mockResolvedValueOnce(okWeatherResponse());

    const result = await fetchWeather(-23.55, -46.63);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result!.temperature).toBe(28.5);
  });

  it('caches successful API responses', async () => {
    mockFetch.mockResolvedValueOnce(okWeatherResponse());

    await fetchWeather(-23.55, -46.63);

    expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
      WEATHER_CACHE_KEY,
      expect.stringContaining('"temperature":28.5'),
    );
  });

  it('falls back to stale cache when API fails', async () => {
    const staleData = {
      temperature: 22,
      apparentTemperature: 23,
      humidity: 55,
      precipitation: 0,
      rain: 0,
      weatherCode: 0,
      windSpeed: 3,
      dailyPrecipitationSum: 0,
      description: 'Céu limpo',
      icon: 'sunny',
    };

    mockAsyncStorage.getItem.mockResolvedValueOnce(null).mockResolvedValueOnce(
      JSON.stringify({
        data: staleData,
        timestamp: Date.now() - 60 * 60 * 1000,
        latitude: -23.55,
        longitude: -46.63,
      }),
    );

    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await fetchWeather(-23.55, -46.63);
    expect(result).toEqual(staleData);
  });

  it('throws WeatherError when API fails and no cache exists', async () => {
    mockAsyncStorage.getItem.mockResolvedValue(null);
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await expect(fetchWeather(-23.55, -46.63)).rejects.toThrow(WeatherError);
  });

  it('throws WeatherError when API returns non-OK status and no cache', async () => {
    mockAsyncStorage.getItem.mockResolvedValue(null);
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    await expect(fetchWeather(-23.55, -46.63)).rejects.toThrow(WeatherError);
  });

  it('rejects malformed upstream data and never caches it', async () => {
    mockFetch.mockResolvedValueOnce(okWeatherResponse({ current: {}, daily: {} }));
    await expect(fetchWeather(-23.55, -46.63)).rejects.toThrow(WeatherError);
    expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('sends only coordinates minimized to two decimals', async () => {
    mockFetch.mockResolvedValueOnce(okWeatherResponse());
    await fetchWeather(-23.551234, -46.638765);
    expect(mockFetch.mock.calls[0][0]).toContain('latitude=-23.55&longitude=-46.64');
  });

  it('requests hourly wind/precip-prob/humidity for the next 24 hours', async () => {
    mockFetch.mockResolvedValueOnce(okWeatherResponse());
    await fetchWeather(-23.55, -46.63);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('hourly=wind_speed_10m,precipitation_probability,relative_humidity_2m');
    expect(url).toContain('forecast_hours=24');
  });

  it('exposes at most 24 hourly slices on WeatherData', async () => {
    mockFetch.mockResolvedValueOnce(okWeatherResponse());
    const result = await fetchWeather(-23.55, -46.63);
    expect(result?.hourly24h).toBeDefined();
    expect(result?.hourly24h?.length).toBeLessThanOrEqual(24);
    expect(result?.hourly24h?.[0]).toMatchObject({
      windSpeed: 10,
      precipitationProbability: 5,
      humidity: 70,
    });
  });

  it('parses a payload without hourly (backward compat) and omits hourly24h', async () => {
    const noHourly = makeOpenMeteoResponse();
    delete (noHourly as { hourly?: unknown }).hourly;
    mockFetch.mockResolvedValueOnce(okWeatherResponse(noHourly));
    const result = await fetchWeather(-23.55, -46.63);
    expect(result).not.toBeNull();
    expect(result?.hourly24h).toBeUndefined();
  });

  it('drops malformed hourly block instead of failing the whole fetch', async () => {
    const bad = makeOpenMeteoResponse();
    // Length mismatch — should be dropped, current + daily still fine.
    (bad as { hourly: { time: string[] } }).hourly.time = ['2026-03-26T00:00'];
    mockFetch.mockResolvedValueOnce(okWeatherResponse(bad));
    const result = await fetchWeather(-23.55, -46.63);
    expect(result).not.toBeNull();
    expect(result?.hourly24h).toBeUndefined();
    expect(result?.temperature).toBe(28.5);
  });
});

// -----------------------------------------------------------------------------
// classifyFieldConditions24h — neutral 24 h field-conditions classifier used
// by the HomeScreen "Condições climáticas para manejo" card. Rules mirror the
// thresholds in FIELD_CONDITIONS_THRESHOLDS; changing those constants MUST
// come with updated tests.
// -----------------------------------------------------------------------------
describe('classifyFieldConditions24h', () => {
  function makeSlices(overrides: Partial<HourlySlice>[] = []): HourlySlice[] {
    return Array.from({ length: 24 }, (_, i) => ({
      time: `2026-03-26T${String(i).padStart(2, '0')}:00`,
      windSpeed: 5,
      precipitationProbability: 5,
      humidity: 60,
      ...(overrides[i] ?? {}),
    }));
  }

  it('returns null on missing / empty / non-array input (shadow paths)', () => {
    expect(classifyFieldConditions24h(undefined)).toBeNull();
    expect(classifyFieldConditions24h(null)).toBeNull();
    expect(classifyFieldConditions24h([])).toBeNull();
    // Non-array fed through `any` — defense in depth for cache-shape drift.
    expect(classifyFieldConditions24h('nope' as unknown as HourlySlice[])).toBeNull();
  });

  it('classifies mild weather as favorable', () => {
    const summary = classifyFieldConditions24h(makeSlices());
    expect(summary?.status).toBe('favorable');
    expect(summary?.reasons).toEqual([]);
  });

  it('classifies a strong-wind hour as unfavorable', () => {
    const slices = makeSlices([{ windSpeed: FIELD_CONDITIONS_THRESHOLDS.windStrongKmh + 1 }]);
    const summary = classifyFieldConditions24h(slices);
    expect(summary?.status).toBe('unfavorable');
    expect(summary?.reasons).toContain('wind_strong');
  });

  it('classifies a likely-rain hour as unfavorable', () => {
    const slices = makeSlices([
      { precipitationProbability: FIELD_CONDITIONS_THRESHOLDS.precipProbHighPct + 1 },
    ]);
    const summary = classifyFieldConditions24h(slices);
    expect(summary?.status).toBe('unfavorable');
    expect(summary?.reasons).toContain('precip_high');
  });

  it('classifies borderline wind (only) as attention', () => {
    const slices = makeSlices([{ windSpeed: FIELD_CONDITIONS_THRESHOLDS.windBorderlineKmh + 1 }]);
    const summary = classifyFieldConditions24h(slices);
    expect(summary?.status).toBe('attention');
    expect(summary?.reasons).toContain('wind_borderline');
  });

  it('classifies borderline precip probability (only) as attention', () => {
    const slices = makeSlices([
      { precipitationProbability: FIELD_CONDITIONS_THRESHOLDS.precipProbBorderlinePct + 1 },
    ]);
    const summary = classifyFieldConditions24h(slices);
    expect(summary?.status).toBe('attention');
    expect(summary?.reasons).toContain('precip_borderline');
  });

  it('escalates to unfavorable when both wind strong AND precip high hit', () => {
    const slices = makeSlices([
      {
        windSpeed: FIELD_CONDITIONS_THRESHOLDS.windStrongKmh + 5,
        precipitationProbability: FIELD_CONDITIONS_THRESHOLDS.precipProbHighPct + 5,
      },
    ]);
    const summary = classifyFieldConditions24h(slices);
    expect(summary?.status).toBe('unfavorable');
    expect(summary?.reasons).toEqual(expect.arrayContaining(['wind_strong', 'precip_high']));
    // Borderline flags MUST NOT stack when the strong flag is already set.
    expect(summary?.reasons).not.toContain('wind_borderline');
    expect(summary?.reasons).not.toContain('precip_borderline');
  });

  it('reports peak values from the window, ignoring non-finite slices', () => {
    const slices = makeSlices([
      { windSpeed: Number.NaN, precipitationProbability: 12, humidity: Number.NaN },
      { windSpeed: 18, precipitationProbability: 45, humidity: 82 },
      { windSpeed: 11, precipitationProbability: 20, humidity: 78 },
    ]);
    const summary = classifyFieldConditions24h(slices);
    expect(summary?.maxWindSpeed).toBe(18);
    expect(summary?.maxPrecipitationProbability).toBe(45);
    expect(summary?.maxHumidity).toBe(82);
  });

  it('caps the analysis window at 24 slices', () => {
    // Feed 48 slices; a strong-wind hour AFTER index 23 must be ignored.
    const slices: HourlySlice[] = Array.from({ length: 48 }, (_, i) => ({
      time: `2026-03-26T${String(i).padStart(2, '0')}:00`,
      windSpeed: i === 30 ? FIELD_CONDITIONS_THRESHOLDS.windStrongKmh + 10 : 5,
      precipitationProbability: 0,
      humidity: 60,
    }));
    const summary = classifyFieldConditions24h(slices);
    expect(summary?.status).toBe('favorable');
    expect(summary?.reasons).toEqual([]);
  });
});
