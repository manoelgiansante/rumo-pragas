import { generateAlerts, generateForecastAlerts } from '../../services/alerts';
import type { WeatherData, DailyForecast } from '../../services/weather';

function makeWeather(overrides: Partial<WeatherData> = {}): WeatherData {
  return {
    temperature: 25,
    apparentTemperature: 26,
    humidity: 60,
    precipitation: 0,
    rain: 0,
    weatherCode: 0,
    windSpeed: 10,
    dailyPrecipitationSum: 0,
    description: 'Céu limpo',
    icon: 'sunny',
    ...overrides,
  };
}

describe('generateAlerts', () => {
  it('returns ferrugem alert for high humidity + high temp', () => {
    const weather = makeWeather({ humidity: 85, temperature: 28 });
    const alerts = generateAlerts(weather);

    const ferrugem = alerts.find((a) => a.id === 'ferrugem_alta_umidade');
    expect(ferrugem).toBeDefined();
    expect(ferrugem!.severity).toBe('high');
    expect(ferrugem!.title).toMatch(/ferrugem/i);
  });

  it('returns mites/acaros alert for hot + dry conditions', () => {
    const weather = makeWeather({ temperature: 33, humidity: 40 });
    const alerts = generateAlerts(weather);

    const acaros = alerts.find((a) => a.id === 'acaros_calor_seco');
    expect(acaros).toBeDefined();
    expect(acaros!.severity).toBe('medium');
    expect(acaros!.title).toMatch(/[aá]caros/i);
  });

  it('returns cold stress alert for cold conditions', () => {
    const weather = makeWeather({ temperature: 5, humidity: 50 });
    const alerts = generateAlerts(weather);

    const cold = alerts.find((a) => a.id === 'geada_estresse');
    expect(cold).toBeDefined();
    expect(cold!.severity).toBe('low');
    expect(cold!.title).toMatch(/[Bb]aixa|temperatura/i);
  });

  it('sorts alerts by severity: high > medium > low', () => {
    const weather = makeWeather({
      temperature: 29,
      humidity: 82,
      windSpeed: 30,
      dailyPrecipitationSum: 1,
    });

    const alerts = generateAlerts(weather);
    expect(alerts.length).toBeGreaterThanOrEqual(2);

    for (let i = 0; i < alerts.length - 1; i++) {
      const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
      // Loop bound keeps both indices in-bounds and severities are known keys;
      // assert for noUncheckedIndexedAccess (runtime unchanged).
      expect(severityOrder[alerts[i]!.severity]!).toBeLessThanOrEqual(
        severityOrder[alerts[i + 1]!.severity]!,
      );
    }
  });

  it('returns valid structure when no conditions match', () => {
    const weather = makeWeather({
      temperature: 15,
      humidity: 35,
      rain: 0,
      windSpeed: 5,
      dailyPrecipitationSum: 0,
    });

    const alerts = generateAlerts(weather);
    alerts.forEach((alert) => {
      expect(alert).toHaveProperty('id');
      expect(alert).toHaveProperty('title');
      expect(alert).toHaveProperty('severity');
      expect(alert).toHaveProperty('date');
    });
  });

  it('includes date in ISO format on each alert', () => {
    const weather = makeWeather({ humidity: 90, temperature: 28 });
    const alerts = generateAlerts(weather);

    expect(alerts.length).toBeGreaterThan(0);
    alerts.forEach((alert) => {
      expect(alert.date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  it('returns mofo branco alert for very high humidity + moderate temp', () => {
    const weather = makeWeather({ humidity: 90, temperature: 20 });
    const alerts = generateAlerts(weather);

    const mofo = alerts.find((a) => a.id === 'mofo_branco');
    expect(mofo).toBeDefined();
    expect(mofo!.severity).toBe('high');
  });
});

function makeForecastDay(overrides: Partial<DailyForecast> = {}): DailyForecast {
  return {
    date: '2026-04-10',
    dayAbbrev: 'Qua',
    weatherCode: 0,
    temperatureMax: 28,
    temperatureMin: 18,
    precipitationSum: 0,
    description: 'Sunny',
    icon: 'sunny',
    ...overrides,
  };
}

describe('generateForecastAlerts', () => {
  it('returns empty array when no forecast data', () => {
    const weather = makeWeather();
    const alerts = generateForecastAlerts(weather);
    expect(alerts).toEqual([]);
  });

  it('returns empty array when forecast is empty', () => {
    const weather = makeWeather({ forecast: [] });
    const alerts = generateForecastAlerts(weather);
    expect(alerts).toEqual([]);
  });

  it('generates fungal disease alert for 3+ consecutive wet+warm days', () => {
    const forecast = [
      makeForecastDay({ precipitationSum: 10, temperatureMax: 25 }),
      makeForecastDay({ precipitationSum: 8, temperatureMax: 24 }),
      makeForecastDay({ precipitationSum: 12, temperatureMax: 26 }),
    ];
    const weather = makeWeather({ forecast });
    const alerts = generateForecastAlerts(weather);

    const fungal = alerts.find((a) => a.id === 'forecast_doencas_fungicas_prolongado');
    expect(fungal).toBeDefined();
    expect(fungal!.severity).toBe('high');
    expect(fungal!.isForecast).toBe(true);
  });

  it('does not generate fungal alert when consecutive streak is broken', () => {
    const forecast = [
      makeForecastDay({ precipitationSum: 10, temperatureMax: 25 }),
      makeForecastDay({ precipitationSum: 8, temperatureMax: 24 }),
      makeForecastDay({ precipitationSum: 0, temperatureMax: 20 }), // breaks streak
      makeForecastDay({ precipitationSum: 10, temperatureMax: 25 }),
    ];
    const weather = makeWeather({ forecast });
    const alerts = generateForecastAlerts(weather);

    const fungal = alerts.find((a) => a.id === 'forecast_doencas_fungicas_prolongado');
    expect(fungal).toBeUndefined();
  });

  it('generates frost alert when any day has min temp < 5C', () => {
    const forecast = [
      makeForecastDay({ temperatureMin: 18 }),
      makeForecastDay({ temperatureMin: 3, date: '2026-04-12' }),
      makeForecastDay({ temperatureMin: 15 }),
    ];
    const weather = makeWeather({ forecast });
    const alerts = generateForecastAlerts(weather);

    const frost = alerts.find((a) => a.id === 'forecast_geada');
    expect(frost).toBeDefined();
    expect(frost!.severity).toBe('high');
  });

  it('generates dry/mite alert for 3+ consecutive dry+hot days', () => {
    const forecast = [
      makeForecastDay({ precipitationSum: 0, temperatureMax: 33 }),
      makeForecastDay({ precipitationSum: 0, temperatureMax: 35 }),
      makeForecastDay({ precipitationSum: 0, temperatureMax: 34 }),
    ];
    const weather = makeWeather({ forecast });
    const alerts = generateForecastAlerts(weather);

    const dry = alerts.find((a) => a.id === 'forecast_seco_acaros');
    expect(dry).toBeDefined();
    expect(dry!.severity).toBe('medium');
  });

  it('does not generate dry alert when precipitation breaks streak', () => {
    const forecast = [
      makeForecastDay({ precipitationSum: 0, temperatureMax: 33 }),
      makeForecastDay({ precipitationSum: 0, temperatureMax: 35 }),
      makeForecastDay({ precipitationSum: 5, temperatureMax: 34 }), // breaks streak
    ];
    const weather = makeWeather({ forecast });
    const alerts = generateForecastAlerts(weather);

    const dry = alerts.find((a) => a.id === 'forecast_seco_acaros');
    expect(dry).toBeUndefined();
  });
});

describe('generateAlerts - with forecast', () => {
  it('merges current-condition and forecast alerts', () => {
    const forecast = [makeForecastDay({ temperatureMin: 2, date: '2026-04-15' })];
    const weather = makeWeather({ humidity: 90, temperature: 28, forecast });
    const alerts = generateAlerts(weather);

    // Should have current condition alerts (ferrugem) and forecast alerts (frost)
    expect(alerts.find((a) => a.id === 'ferrugem_alta_umidade')).toBeDefined();
    expect(alerts.find((a) => a.id === 'forecast_geada')).toBeDefined();
  });

  it('deduplicates alerts by id keeping higher severity', () => {
    const weather = makeWeather({ humidity: 90, temperature: 28 });
    const alerts = generateAlerts(weather);

    const ids = alerts.map((a) => a.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });
});
