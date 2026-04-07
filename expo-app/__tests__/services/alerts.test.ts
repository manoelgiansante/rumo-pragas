import { generateAlerts } from '../../services/alerts';
import type { WeatherData } from '../../services/weather';

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
      expect(severityOrder[alerts[i].severity]).toBeLessThanOrEqual(
        severityOrder[alerts[i + 1].severity],
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
