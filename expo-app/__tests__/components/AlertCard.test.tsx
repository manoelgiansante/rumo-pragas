import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'severity.high': 'Alta',
        'severity.medium': 'Media',
        'severity.low': 'Baixa',
        'alerts.affected': 'Culturas afetadas',
        'alerts.forecast': 'Previsao',
      };
      return map[key] || key;
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
    text: '#000',
    textDark: '#fff',
    textSecondary: '#8E8E93',
    card: '#fff',
    cardDark: '#333',
  },
  Spacing: { xs: 4, sm: 8, md: 12, lg: 16 },
  BorderRadius: { md: 12 },
  FontSize: { caption: 12, subheadline: 15, body: 17 },
  FontWeight: { regular: '400', semibold: '600', bold: '700' },
}));

import { AlertCard } from '../../components/AlertCard';

describe('AlertCard', () => {
  const highAlert = {
    id: 'test-1',
    title: 'Ferrugem Asiatica',
    description: 'Alta umidade e temperatura favorecem a ferrugem',
    severity: 'high' as const,
    icon: 'alert-circle',
    cropAffected: 'Soja, Feijao',
    date: '2026-04-09T12:00:00Z',
  };

  const mediumAlert = {
    ...highAlert,
    id: 'test-2',
    title: 'Acaros',
    severity: 'medium' as const,
  };

  const forecastAlert = {
    ...highAlert,
    id: 'test-3',
    title: 'Previsao de Geada',
    isForecast: true,
  };

  it('renders alert title and description', () => {
    const { getByText } = render(<AlertCard alert={highAlert} />);
    expect(getByText('Ferrugem Asiatica')).toBeTruthy();
    expect(getByText(/Alta umidade/)).toBeTruthy();
  });

  it('renders crop affected info', () => {
    const { getByText } = render(<AlertCard alert={highAlert} />);
    expect(getByText(/Soja/)).toBeTruthy();
  });

  it('renders medium severity alert', () => {
    const { getByText } = render(<AlertCard alert={mediumAlert} />);
    expect(getByText('Acaros')).toBeTruthy();
  });

  it('renders forecast badge when isForecast is true', () => {
    const { getByText } = render(<AlertCard alert={forecastAlert} />);
    expect(getByText('Previsao de Geada')).toBeTruthy();
  });
});
