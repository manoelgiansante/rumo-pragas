import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { PremiumCard } from './PremiumCard';
import {
  Colors,
  FontSize,
  FontWeight,
  Spacing,
  BorderRadius,
  FontFamily,
} from '../constants/theme';
import type { FieldConditionsSummary } from '../services/weather';

interface FieldConditionsCardProps {
  summary: FieldConditionsSummary | null;
}

const STATUS_STYLE: Record<
  FieldConditionsSummary['status'],
  {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    color: string;
    labelKey: string;
    hintKey: string;
  }
> = {
  favorable: {
    icon: 'sunny',
    color: Colors.accent,
    labelKey: 'fieldConditions.statusFavorable',
    hintKey: 'fieldConditions.hintFavorable',
  },
  attention: {
    icon: 'partly-sunny',
    color: Colors.warmAmber,
    labelKey: 'fieldConditions.statusAttention',
    hintKey: 'fieldConditions.hintAttention',
  },
  unfavorable: {
    icon: 'thunderstorm',
    color: Colors.coral,
    labelKey: 'fieldConditions.statusUnfavorable',
    hintKey: 'fieldConditions.hintUnfavorable',
  },
};

/**
 * Renders a neutral 24 h field-conditions summary card. The classifier lives
 * in `services/weather.ts#classifyFieldConditions24h`. The card MUST NOT
 * recommend product application, dose or timing — the disclaimer copy is
 * fixed by design and centralized in the `fieldConditions.disclaimer` key.
 */
export const FieldConditionsCard = React.memo(function FieldConditionsCard({
  summary,
}: FieldConditionsCardProps) {
  const isDark = useColorScheme() === 'dark';
  const { t } = useTranslation();

  if (!summary) return null;

  const style = STATUS_STYLE[summary.status];
  const statusLabel = t(style.labelKey);
  const hint = t(style.hintKey);

  return (
    <PremiumCard>
      <View
        style={styles.container}
        accessible
        accessibilityLabel={t('fieldConditions.a11yLabel', {
          status: statusLabel,
          hint,
        })}
        accessibilityRole="summary"
      >
        <View style={styles.headerRow}>
          <View style={[styles.iconCircle, { backgroundColor: `${style.color}22` }]}>
            <Ionicons name={style.icon} size={22} color={style.color} accessibilityElementsHidden />
          </View>
          <View style={styles.headerText}>
            <Text style={[styles.title, isDark && { color: Colors.textDark }]}>
              {t('fieldConditions.title')}
            </Text>
            <Text style={[styles.statusLabel, { color: style.color }]}>{statusLabel}</Text>
          </View>
        </View>
        <Text style={[styles.hint, isDark && { color: Colors.systemGray2 }]}>{hint}</Text>
        <Text style={styles.disclaimer}>{t('fieldConditions.disclaimer')}</Text>
      </View>
    </PremiumCard>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
  },
  statusLabel: {
    fontFamily: FontFamily.bold,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.headline,
  },
  hint: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.subheadline,
    color: Colors.text,
    lineHeight: 20,
  },
  disclaimer: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.caption2,
    color: Colors.textTertiary,
    lineHeight: 16,
    marginTop: 2,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.separator,
    borderRadius: BorderRadius.sm,
  },
});
