import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';

jest.mock('../../constants/theme', () => ({
  FontFamily: {
    regular: 'Poppins_400Regular',
    medium: 'Poppins_500Medium',
    semibold: 'Poppins_600SemiBold',
    bold: 'Poppins_700Bold',
    italic: 'Poppins_400Regular_Italic',
  },
  Colors: {
    card: '#fff',
    cardElevated: '#ffffff',
    cardDark: '#333',
    text: '#000',
    separator: '#E5DECD',
    separatorDark: '#1F2F29',
  },
  Spacing: { lg: 16 },
  BorderRadius: { lg: 16 },
  Shadows: {
    card: {
      shadowColor: '#0B3D2E',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 12,
      elevation: 3,
    },
  },
}));

import { PremiumCard } from '../../components/PremiumCard';

describe('PremiumCard', () => {
  it('renders children', () => {
    const { getByText } = render(
      <PremiumCard>
        <Text>Premium Content</Text>
      </PremiumCard>,
    );
    expect(getByText('Premium Content')).toBeTruthy();
  });

  it('applies custom padding', () => {
    const { toJSON } = render(
      <PremiumCard padding={24}>
        <Text>Content</Text>
      </PremiumCard>,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('applies custom style', () => {
    const { toJSON } = render(
      <PremiumCard style={{ marginTop: 10 }}>
        <Text>Content</Text>
      </PremiumCard>,
    );
    expect(toJSON()).toBeTruthy();
  });
});
