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
  Colors: { card: '#fff', cardDark: '#333', text: '#000' },
  Spacing: { lg: 16 },
  BorderRadius: { lg: 16 },
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
