import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts) return `${key}: ${JSON.stringify(opts)}`;
      return key;
    },
  }),
}));
jest.mock('../../constants/theme', () => ({
  FontFamily: {
    regular: 'Poppins_400Regular',
    medium: 'Poppins_500Medium',
    semibold: 'Poppins_600SemiBold',
    bold: 'Poppins_700Bold',
    italic: 'Poppins_400Regular_Italic',
  },
  Colors: {
    accent: '#1A966B',
    coral: '#F06652',
    warmAmber: '#EBB026',
    text: '#000',
    textDark: '#fff',
    textSecondary: '#8E8E93',
    card: '#fff',
    cardDark: '#333',
    background: '#F2F2F7',
    systemGray: '#8E8E93',
    systemGray3: '#C7C7CC',
    systemGray5: '#E5E5EA',
    systemGray6: '#F2F2F7',
    white: '#FFFFFF',
    teal: '#5AC8FA',
    divider: '#E5E5EA',
    dividerDark: '#3A3A3C',
  },
  Gradients: { primary: ['#1A966B', '#14785A'] },
  FontSize: {
    caption: 12,
    footnote: 13,
    subheadline: 15,
    body: 17,
    title3: 20,
    title2: 22,
    largeTitle: 34,
  },
  FontWeight: { regular: '400', medium: '500', semibold: '600', bold: '700' },
  Spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 },
  BorderRadius: { sm: 8, md: 12, lg: 16, full: 9999 },
}));

jest.mock('../../components/PremiumCard', () => ({
  PremiumCard: ({ children }: { children: React.ReactNode }) => children,
}));

import { WeatherCard } from '../../components/WeatherCard';
import type { WeatherCardData } from '../../components/WeatherCard';

function makeWeather(overrides: Partial<WeatherCardData> = {}): WeatherCardData {
  return {
    temperature: 28.5,
    humidity: 72,
    windSpeed: 12.3,
    dailyPrecipitationSum: 2.5,
    description: 'Parcialmente nublado',
    icon: 'partly-sunny',
    ...overrides,
  };
}

describe('WeatherCard', () => {
  it('renders temperature and description', () => {
    const { toJSON } = render(<WeatherCard weather={makeWeather()} />);
    const tree = JSON.stringify(toJSON());
    expect(tree).toContain('29'); // 28.5 rounds to 29
    expect(tree).toBeTruthy();
  });

  it('renders loading state', () => {
    const { toJSON } = render(<WeatherCard weather={null} isLoading />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders null state gracefully', () => {
    const { toJSON } = render(<WeatherCard weather={null} />);
    // WeatherCard returns null when no weather data and not loading
    expect(toJSON()).toBeNull();
  });

  it('renders with forecast data', () => {
    const weather = makeWeather({
      forecast: [
        {
          date: '2026-04-10',
          dayAbbrev: 'Qui',
          weatherCode: 0,
          temperatureMax: 30,
          temperatureMin: 20,
          precipitationSum: 0,
          description: 'Sunny',
          icon: 'sunny',
        },
        {
          date: '2026-04-11',
          dayAbbrev: 'Sex',
          weatherCode: 61,
          temperatureMax: 25,
          temperatureMin: 18,
          precipitationSum: 10,
          description: 'Rain',
          icon: 'rainy',
        },
      ],
    });
    const { toJSON } = render(<WeatherCard weather={weather} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders with location', () => {
    const weather = makeWeather({ location: 'Campinas, SP' });
    const { toJSON } = render(<WeatherCard weather={weather} />);
    const tree = JSON.stringify(toJSON());
    expect(tree).toContain('Campinas');
  });

  it('handles different weather icons', () => {
    const icons = ['sunny', 'rainy', 'thunderstorm', 'cloudy', 'snow', 'unknown'];
    icons.forEach((icon) => {
      const { toJSON } = render(<WeatherCard weather={makeWeather({ icon })} />);
      expect(toJSON()).toBeTruthy();
    });
  });
});
