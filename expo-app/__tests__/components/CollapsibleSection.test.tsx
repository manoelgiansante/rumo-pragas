import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'common.expanded': 'expanded',
        'common.collapsed': 'collapsed',
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
  },
  FontSize: { title3: 18 },
  FontWeight: { bold: '700' },
  Spacing: { sm: 8, md: 12 },
}));

import { CollapsibleSection } from '../../components/CollapsibleSection';

describe('CollapsibleSection', () => {
  it('renders title and children when expanded by default', () => {
    const { getByText } = render(
      <CollapsibleSection title="Test Section" icon="leaf">
        <Text>Section content</Text>
      </CollapsibleSection>,
    );

    expect(getByText('Test Section')).toBeTruthy();
    expect(getByText('Section content')).toBeTruthy();
  });

  it('hides children when defaultExpanded is false', () => {
    const { getByText, queryByText } = render(
      <CollapsibleSection title="Collapsed" icon="leaf" defaultExpanded={false}>
        <Text>Hidden content</Text>
      </CollapsibleSection>,
    );

    expect(getByText('Collapsed')).toBeTruthy();
    expect(queryByText('Hidden content')).toBeNull();
  });

  it('toggles content visibility on press', () => {
    const { getByText, queryByText, getByRole } = render(
      <CollapsibleSection title="Toggle" icon="leaf">
        <Text>Toggleable content</Text>
      </CollapsibleSection>,
    );

    expect(getByText('Toggleable content')).toBeTruthy();

    // Press to collapse
    fireEvent.press(getByRole('button'));
    expect(queryByText('Toggleable content')).toBeNull();

    // Press to expand again
    fireEvent.press(getByRole('button'));
    expect(getByText('Toggleable content')).toBeTruthy();
  });
});
