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

import { DiagnosisCard } from '../../components/DiagnosisCard';
import type { DiagnosisItem } from '../../components/DiagnosisCard';

function makeDiagnosis(overrides: Partial<DiagnosisItem> = {}): DiagnosisItem {
  return {
    id: 'diag-1',
    crop: 'Soja',
    pest_name: 'Ferrugem Asiatica',
    confidence: 0.85,
    severity: 'high',
    created_at: '2026-04-09T12:00:00Z',
    ...overrides,
  };
}

describe('DiagnosisCard', () => {
  it('renders pest name and crop', () => {
    const { getByText } = render(<DiagnosisCard diagnosis={makeDiagnosis()} />);
    expect(getByText('Ferrugem Asiatica')).toBeTruthy();
  });

  it('renders healthy state when is_healthy is true', () => {
    const diag = makeDiagnosis({ is_healthy: true, pest_name: undefined, pest_id: 'Healthy' });
    const { toJSON } = render(<DiagnosisCard diagnosis={diag} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders with low severity', () => {
    const { toJSON } = render(<DiagnosisCard diagnosis={makeDiagnosis({ severity: 'low' })} />);
    const tree = JSON.stringify(toJSON());
    expect(tree).toContain('#1A966B');
  });

  it('renders with critical severity', () => {
    const { toJSON } = render(
      <DiagnosisCard diagnosis={makeDiagnosis({ severity: 'critical' })} />,
    );
    const tree = JSON.stringify(toJSON());
    // Critical severity now uses the shared danger token (Colors.coral) instead of a
    // hardcoded #D32F2F — mock maps coral to #F06652 (design token consolidation, D4).
    expect(tree).toContain('#F06652');
  });

  it('renders in compact mode', () => {
    const { toJSON } = render(<DiagnosisCard diagnosis={makeDiagnosis()} compact />);
    expect(toJSON()).toBeTruthy();
  });

  it('handles missing pest_name gracefully', () => {
    const diag = makeDiagnosis({ pest_name: undefined, pest_id: 'unknown-pest' });
    const { toJSON } = render(<DiagnosisCard diagnosis={diag} />);
    expect(toJSON()).toBeTruthy();
  });

  it('handles missing severity gracefully', () => {
    const diag = makeDiagnosis({ severity: undefined });
    const { toJSON } = render(<DiagnosisCard diagnosis={diag} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders with scientific name data', () => {
    const diag = makeDiagnosis({ scientific_name: 'Phakopsora pachyrhizi' });
    const { toJSON } = render(<DiagnosisCard diagnosis={diag} />);
    expect(toJSON()).toBeTruthy();
  });
});
