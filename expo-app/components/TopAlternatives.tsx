// -----------------------------------------------------------------------------
// TopAlternatives — ranked card of the next-best predictions returned by Agrio.
// -----------------------------------------------------------------------------
// Diagnostic models almost never return a single answer with 100% confidence —
// the underlying API (`AgrioNotesData.predictions` / legacy `id_array`) ships
// the top N candidates ranked by score. Showing the runner-ups gives the user
// a self-correction mechanism: if the top match doesn't look like the leaf in
// front of them, alternatives 2 and 3 often do.
//
// Behaviour:
//   - We display the SECOND and THIRD predictions (the primary is already the
//     hero of the result screen — we don't repeat it here).
//   - "Healthy" entries are filtered: they are not useful as alternatives to a
//     specific pest diagnosis and would confuse the user.
//   - Rendered inside a CollapsibleSection so it stays out of the way unless
//     the user is actively second-guessing the primary diagnosis.
//   - Pure presentational — no network calls, no Sentry capture. Receives the
//     full predictions array and slices on the fly.
//
// We never invoke setState here — the parent (`app/diagnosis/result.tsx`)
// owns all routing/sharing actions. This component intentionally has zero
// side effects so it's safe to render in any state.
// -----------------------------------------------------------------------------

import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors, FontSize, FontWeight, BorderRadius } from '../constants/theme';
import { CollapsibleSection } from './CollapsibleSection';
import type { AgrioPrediction } from '../types/diagnosis';

interface Props {
  predictions: AgrioPrediction[];
  /** ID of the primary prediction shown in the hero — excluded from the list. */
  primaryId?: string;
  /** Show at most this many alternatives. Default: 3. */
  max?: number;
}

function getConfidenceTone(value: number): { bg: string; fg: string; label: string } {
  if (value >= 0.7) return { bg: Colors.accent + '1A', fg: Colors.accent, label: 'high' };
  if (value >= 0.4) return { bg: Colors.warmAmber + '1A', fg: '#8a6a1f', label: 'medium' };
  return { bg: Colors.systemGray5, fg: Colors.systemGray, label: 'low' };
}

export function TopAlternatives({ predictions, primaryId, max = 3 }: Props) {
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';

  // Exclude the hero pick and any "Healthy" sentinel rows; rank by confidence.
  const alternatives = (predictions ?? [])
    .filter((p) => p && p.id !== primaryId && p.id !== 'Healthy')
    .filter((p) => typeof p.confidence === 'number')
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .slice(0, max);

  if (alternatives.length === 0) return null;

  return (
    <CollapsibleSection
      title={t('diagnosis.topAlternatives')}
      icon="git-compare"
      iconColor={Colors.techIndigo}
    >
      <Text style={styles.subtitle}>{t('diagnosis.topAlternativesHint')}</Text>
      {alternatives.map((p, index) => {
        const pct = Math.round((p.confidence ?? 0) * 100);
        const tone = getConfidenceTone(p.confidence ?? 0);
        const displayName = p.common_name || p.scientific_name || p.id;
        return (
          <View
            key={`${p.id}-${index}`}
            style={[styles.row, isDark && styles.rowDark]}
            accessible
            accessibilityLabel={t('diagnosis.alternativeA11y', {
              rank: index + 2,
              name: displayName,
              pct,
            })}
          >
            <View style={[styles.rankBadge, { backgroundColor: tone.bg }]}>
              <Text style={[styles.rankText, { color: tone.fg }]}>#{index + 2}</Text>
            </View>
            <View style={styles.body}>
              <Text
                style={[styles.name, isDark && styles.textDark]}
                numberOfLines={1}
                accessibilityElementsHidden
              >
                {displayName}
              </Text>
              {p.scientific_name && p.scientific_name !== displayName && (
                <Text style={styles.scientific} numberOfLines={1}>
                  {p.scientific_name}
                </Text>
              )}
              {/* Mini-bar showing relative confidence — quick visual scan */}
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${Math.min(pct, 100)}%`, backgroundColor: tone.fg },
                  ]}
                  accessibilityElementsHidden
                />
              </View>
            </View>
            <Text style={[styles.pct, { color: tone.fg }]} accessibilityElementsHidden>
              {pct}%
            </Text>
            <Ionicons
              name="information-circle-outline"
              size={14}
              color={Colors.systemGray3}
              accessibilityElementsHidden
            />
          </View>
        );
      })}
      <Text style={styles.disclaimer}>{t('diagnosis.topAlternativesDisclaimer')}</Text>
    </CollapsibleSection>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
    marginBottom: 10,
    lineHeight: 17,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.systemGray6,
    marginBottom: 8,
  },
  rowDark: {
    backgroundColor: Colors.cardDark,
  },
  rankBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankText: {
    fontSize: FontSize.caption2,
    fontWeight: FontWeight.bold,
  },
  body: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontSize: FontSize.subheadline,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
  textDark: {
    color: Colors.textDark,
  },
  scientific: {
    fontSize: FontSize.caption2,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  barTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.systemGray5,
    overflow: 'hidden',
    marginTop: 2,
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
  },
  pct: {
    fontSize: FontSize.caption,
    fontWeight: FontWeight.bold,
    fontVariant: ['tabular-nums'],
    minWidth: 36,
    textAlign: 'right',
  },
  disclaimer: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 4,
  },
});
