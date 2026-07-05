import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key === 'diagnosis.confidenceA11y' && opts) return `Confidence: ${opts.pct}%`;
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
    coral: '#F06652',
    warmAmber: '#EBB026',
    systemGray3: '#C7C7CC',
    systemGray5: '#E5E5EA',
    textSecondary: '#8E8E93',
    accent: '#1A966B',
  },
  FontSize: { caption: 12 },
  FontWeight: { semibold: '600' },
  BorderRadius: { full: 9999 },
}));

import { ConfidenceBar } from '../../components/ConfidenceBar';

describe('ConfidenceBar', () => {
  it('renders without crashing for high confidence', () => {
    const { toJSON } = render(<ConfidenceBar value={0.92} />);
    const tree = JSON.stringify(toJSON());
    expect(tree).toContain('92%');
  });

  it('renders without crashing for medium confidence', () => {
    const { toJSON } = render(<ConfidenceBar value={0.55} />);
    const tree = JSON.stringify(toJSON());
    expect(tree).toContain('55%');
  });

  it('renders without crashing for low confidence', () => {
    const { toJSON } = render(<ConfidenceBar value={0.2} />);
    const tree = JSON.stringify(toJSON());
    expect(tree).toContain('20%');
  });

  it('renders accessibility label with percentage', () => {
    const { getByLabelText } = render(<ConfidenceBar value={0.75} />);
    expect(getByLabelText('Confidence: 75%')).toBeTruthy();
  });

  it('handles zero value', () => {
    const { toJSON } = render(<ConfidenceBar value={0} />);
    const tree = JSON.stringify(toJSON());
    expect(tree).toContain('0%');
  });

  it('uses accent (green) color for high confidence values', () => {
    // High confidence >= 0.7 intentionally uses accent/green (Colors.accent).
    // Coral is reserved for alerts/errors — see ConfidenceBar.getBarColor comment.
    const { toJSON } = render(<ConfidenceBar value={0.8} />);
    const tree = JSON.stringify(toJSON());
    expect(tree).toContain('#1A966B');
  });

  it('uses amber color for medium confidence values', () => {
    const { toJSON } = render(<ConfidenceBar value={0.5} />);
    const tree = JSON.stringify(toJSON());
    expect(tree).toContain('#EBB026');
  });

  it('uses gray color for low confidence values', () => {
    const { toJSON } = render(<ConfidenceBar value={0.2} />);
    const tree = JSON.stringify(toJSON());
    expect(tree).toContain('#C7C7CC');
  });
});
