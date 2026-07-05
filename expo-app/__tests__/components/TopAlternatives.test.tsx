import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}));

// Light theme stub — TopAlternatives only reads colours + font sizes.
jest.mock('../../constants/theme', () => ({
  FontFamily: {
    regular: 'Poppins_400Regular',
    medium: 'Poppins_500Medium',
    semibold: 'Poppins_600SemiBold',
    bold: 'Poppins_700Bold',
    italic: 'Poppins_400Regular_Italic',
  },
  Colors: {
    accent: '#0B3D2E',
    warmAmber: '#C89B3C',
    techIndigo: '#7A5C2E',
    text: '#0F1A14',
    textDark: '#F2F7F4',
    textSecondary: '#435044',
    systemGray: '#8A8373',
    systemGray3: '#BAB097',
    systemGray5: '#E5DECD',
    systemGray6: '#F7F3EC',
    cardDark: '#14201B',
  },
  FontSize: { caption2: 11, caption: 12, subheadline: 15 },
  FontWeight: { semibold: '600', bold: '700' },
  BorderRadius: { sm: 8, md: 12 },
}));

// The collapsible is not interesting for ranking logic — render children inline.
jest.mock('../../components/CollapsibleSection', () => ({
  CollapsibleSection: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { TopAlternatives } from '../../components/TopAlternatives';

describe('TopAlternatives', () => {
  it('renders nothing when predictions array is empty', () => {
    const { toJSON } = render(<TopAlternatives predictions={[]} primaryId="abc" />);
    expect(toJSON()).toBeNull();
  });

  it('renders nothing when only the primary prediction is available', () => {
    const { toJSON } = render(
      <TopAlternatives
        predictions={[{ id: 'abc', confidence: 0.9, common_name: 'Primary' }]}
        primaryId="abc"
      />,
    );
    expect(toJSON()).toBeNull();
  });

  it('excludes the Healthy sentinel and the primary id', () => {
    const { queryByLabelText, getByLabelText } = render(
      <TopAlternatives
        predictions={[
          { id: 'abc', confidence: 0.9, common_name: 'Primary' },
          { id: 'Healthy', confidence: 0.5, common_name: 'Healthy' },
          { id: 'def', confidence: 0.42, common_name: 'Alt One' },
        ]}
        primaryId="abc"
      />,
    );
    // Each alternative is rendered in a row with an aria-label containing the name.
    expect(queryByLabelText(/Primary/)).toBeNull();
    expect(queryByLabelText(/Healthy/)).toBeNull();
    expect(getByLabelText(/Alt One/)).toBeTruthy();
  });

  it('ranks alternatives by descending confidence and shows ranks', () => {
    const { getByText, getAllByLabelText } = render(
      <TopAlternatives
        predictions={[
          { id: 'abc', confidence: 0.9, common_name: 'Primary' },
          { id: 'def', confidence: 0.41, common_name: 'Low' },
          { id: 'ghi', confidence: 0.78, common_name: 'High' },
          { id: 'jkl', confidence: 0.6, common_name: 'Mid' },
        ]}
        primaryId="abc"
      />,
    );
    // Numbered ranks start at #2 (the hero is #1, not rendered here)
    expect(getByText('#2')).toBeTruthy();
    expect(getByText('#3')).toBeTruthy();
    expect(getByText('#4')).toBeTruthy();
    // Three alternatives rendered (max defaults to 3)
    const rows = getAllByLabelText(/diagnosis\.alternativeA11y/);
    expect(rows).toHaveLength(3);
    // Order check via aria-label payload (encoded as JSON in our mock t())
    const labels = rows.map((r) => r.props.accessibilityLabel as string);
    expect(labels[0]).toContain('"name":"High"');
    expect(labels[1]).toContain('"name":"Mid"');
    expect(labels[2]).toContain('"name":"Low"');
    expect(labels[0]).toContain('"pct":78');
  });

  it('caps the rendered list at `max`', () => {
    const { getAllByLabelText } = render(
      <TopAlternatives
        predictions={[
          { id: 'a', confidence: 0.9, common_name: 'A' },
          { id: 'b', confidence: 0.8, common_name: 'B' },
          { id: 'c', confidence: 0.7, common_name: 'C' },
          { id: 'd', confidence: 0.6, common_name: 'D' },
        ]}
        max={2}
      />,
    );
    const rows = getAllByLabelText(/diagnosis\.alternativeA11y/);
    expect(rows).toHaveLength(2);
    const labels = rows.map((r) => r.props.accessibilityLabel as string);
    expect(labels[0]).toContain('"name":"A"');
    expect(labels[1]).toContain('"name":"B"');
  });
});
