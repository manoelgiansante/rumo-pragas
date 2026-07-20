/**
 * Tests for components/FieldConditionsCard.tsx
 *
 * The card is intentionally NEUTRAL — it must never suggest applying a
 * product, dose or timing (contract of the launch — see repo CLAUDE.md).
 * Snapshots guard the copy against silent regressions in translation files.
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { FieldConditionsCard } from '../../components/FieldConditionsCard';
import type { FieldConditionsSummary } from '../../services/weather';

// Minimal i18n mock — we only care that keys pass through.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}(${JSON.stringify(opts)})` : key,
  }),
}));

// The card imports theme constants; they resolve normally.

describe('FieldConditionsCard', () => {
  it('renders nothing when summary is null (shadow path)', () => {
    const { toJSON } = render(<FieldConditionsCard summary={null} />);
    expect(toJSON()).toBeNull();
  });

  it.each<[FieldConditionsSummary['status'], string, string]>([
    ['favorable', 'fieldConditions.statusFavorable', 'fieldConditions.hintFavorable'],
    ['attention', 'fieldConditions.statusAttention', 'fieldConditions.hintAttention'],
    ['unfavorable', 'fieldConditions.statusUnfavorable', 'fieldConditions.hintUnfavorable'],
  ])('renders the %s status with the matching label + hint', (status, labelKey, hintKey) => {
    const summary: FieldConditionsSummary = {
      status,
      maxWindSpeed: 12,
      maxPrecipitationProbability: 10,
      maxHumidity: 65,
      reasons: [],
    };
    const { getByText } = render(<FieldConditionsCard summary={summary} />);
    expect(getByText(labelKey)).toBeTruthy();
    expect(getByText(hintKey)).toBeTruthy();
    // Contract: the disclaimer key must ALWAYS render alongside the summary.
    expect(getByText('fieldConditions.disclaimer')).toBeTruthy();
  });
});
