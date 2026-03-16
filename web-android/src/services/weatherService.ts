// ─── Types ───────────────────────────────────────────────────────────────────

interface OpenMeteoCurrent {
  temperature_2m: number;
  apparent_temperature?: number;
  relative_humidity_2m: number;
  precipitation: number;
  weather_code: number;
  wind_speed_10m?: number;
}

interface OpenMeteoDaily {
  precipitation_sum?: number[];
  rain_sum?: number[];
}

interface OpenMeteoResponse {
  current: OpenMeteoCurrent;
  daily?: OpenMeteoDaily;
}

export interface WeatherData {
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  precipitation: number;
  dailyPrecipitation: number;
  windSpeed: number;
  description: string;
  icon: string;
  location: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function weatherDescription(code: number): string {
  switch (code) {
    case 0:
      return 'Céu limpo';
    case 1:
    case 2:
    case 3:
      return 'Parcialmente nublado';
    case 45:
    case 48:
      return 'Nevoeiro';
    case 51:
    case 53:
    case 55:
      return 'Garoa';
    case 61:
    case 63:
    case 65:
      return 'Chuva';
    case 66:
    case 67:
      return 'Chuva gelada';
    case 71:
    case 73:
    case 75:
      return 'Neve';
    case 80:
    case 81:
    case 82:
      return 'Pancadas de chuva';
    case 95:
    case 96:
    case 99:
      return 'Tempestade';
    default:
      return 'Variável';
  }
}

function weatherIcon(code: number): string {
  switch (code) {
    case 0:
      return 'weather-sunny';
    case 1:
    case 2:
    case 3:
      return 'weather-partly-cloudy';
    case 45:
    case 48:
      return 'weather-fog';
    case 51:
    case 53:
    case 55:
      return 'weather-partly-rainy';
    case 61:
    case 63:
    case 65:
      return 'weather-rainy';
    case 80:
    case 81:
    case 82:
      return 'weather-pouring';
    case 95:
    case 96:
    case 99:
      return 'weather-lightning-rainy';
    default:
      return 'weather-cloudy';
  }
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const WeatherService = {
  async fetchWeather(
    latitude: number,
    longitude: number,
  ): Promise<WeatherData> {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,rain,weather_code,wind_speed_10m` +
      `&daily=precipitation_sum,rain_sum&timezone=auto&forecast_days=1`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error('Erro ao buscar dados climáticos');
    }

    const response: OpenMeteoResponse = await res.json();

    const dailyPrecip = response.daily?.precipitation_sum?.[0] ?? 0.0;

    return {
      temperature: response.current.temperature_2m,
      apparentTemperature:
        response.current.apparent_temperature ?? response.current.temperature_2m,
      humidity: response.current.relative_humidity_2m,
      precipitation: response.current.precipitation,
      dailyPrecipitation: dailyPrecip,
      windSpeed: response.current.wind_speed_10m ?? 0,
      description: weatherDescription(response.current.weather_code),
      icon: weatherIcon(response.current.weather_code),
      location: '',
    };
  },
};
