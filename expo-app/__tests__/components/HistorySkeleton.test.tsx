import React from 'react';
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

jest.mock('../../components/SkeletonLoader', () => ({
  SkeletonLoader: 'SkeletonLoader',
}));

import { HistorySkeleton } from '../../components/HistorySkeleton';

describe('HistorySkeleton', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<HistorySkeleton />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders multiple skeleton items', () => {
    const { toJSON } = render(<HistorySkeleton />);
    const tree = JSON.stringify(toJSON());
    // Should have multiple SkeletonLoader elements
    const count = (tree.match(/SkeletonLoader/g) || []).length;
    expect(count).toBeGreaterThan(1);
  });
});
