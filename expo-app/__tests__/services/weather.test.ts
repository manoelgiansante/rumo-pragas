import { fetchWeather, WeatherError } from '../../services/weather';
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
});
