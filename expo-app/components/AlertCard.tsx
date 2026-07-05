import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  Colors,
  Spacing,
  BorderRadius,
  FontSize,
  FontWeight,
  FontFamily,
} from '../constants/theme';
import type { PestAlert, AlertSeverity } from '../services/alerts';

const SEVERITY_CONFIG: Record<
  AlertSeverity,
  { bg: string; border: string; text: string; labelKey: string }
> = {
  high: {
    bg: 'rgba(240, 102, 82, 0.10)',
    border: 'rgba(240, 102, 82, 0.30)',
    text: Colors.coral,
    labelKey: 'severity.high',
  },
  medium: {
    bg: 'rgba(235, 176, 38, 0.10)',
    border: 'rgba(235, 176, 38, 0.30)',
    text: Colors.warmAmber,
    labelKey: 'severity.medium',
  },
  low: {
    bg: 'rgba(26, 150, 107, 0.10)',
    border: 'rgba(26, 150, 107, 0.30)',
    text: Colors.accent,
    labelKey: 'severity.low',
  },
};

interface AlertCardProps {
  alert: PestAlert;
}

export const AlertCard = React.memo(function AlertCard({ alert }: AlertCardProps) {
  const isDark = useColorScheme() === 'dark';
  const { t } = useTranslation();
  const config = SEVERITY_CONFIG[alert.severity];
  const severityLabel = t(config.labelKey);

  const timeAgo = () => {
    const diff = Date.now() - new Date(alert.date).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return t('common.now');
    if (minutes < 60) return t('common.minutesAgo', { count: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t('common.hoursAgo', { count: hours });
    return t('common.daysAgo', { count: Math.floor(hours / 24) });
  };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isDark ? Colors.cardDark : Colors.card,
          borderLeftColor: config.text,
        },
        isDark && styles.cardDark,
      ]}
      accessible
      accessibilityLabel={t('alerts.cardA11y', {
        severity: severityLabel,
        title: alert.title,
        description: alert.description,
        crop: alert.cropAffected,
      })}
      accessibilityRole="alert"
    >
      <View style={styles.header}>
        <View style={[styles.iconCircle, { backgroundColor: config.bg }]}>
          <Ionicons
            name={alert.icon as keyof typeof Ionicons.glyphMap}
            size={18}
            color={config.text}
          />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.title, isDark && { color: Colors.textDark }]} numberOfLines={2}>
            {alert.title}
          </Text>
          <View style={styles.metaRow}>
            <View
              style={[
                styles.severityBadge,
                { backgroundColor: config.bg, borderColor: config.border },
              ]}
            >
              <Text style={[styles.severityText, { color: config.text }]}>{severityLabel}</Text>
            </View>
            {alert.isForecast && (
              <View style={styles.forecastBadge}>
                <Text style={styles.forecastBadgeText}>{t('alerts.forecast')}</Text>
              </View>
            )}
            <Text style={styles.timestamp}>{timeAgo()}</Text>
          </View>
        </View>
      </View>

      <Text style={[styles.description, isDark && { color: Colors.systemGray2 }]} numberOfLines={3}>
        {alert.description}
      </Text>

      <View style={styles.cropRow}>
        <Ionicons name="leaf-outline" size={12} color={Colors.textSecondary} />
        <Text style={styles.cropText}>{alert.cropAffected}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardDark: {
    shadowColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: Spacing.sm,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: FontSize.subheadline,
    fontFamily: FontFamily.semibold,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  severityText: {
    fontSize: FontSize.caption2,
    fontFamily: FontFamily.semibold,
    fontWeight: FontWeight.semibold,
  },
  forecastBadge: {
    backgroundColor: Colors.techBlue,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  forecastBadgeText: {
    fontSize: FontSize.caption2,
    fontFamily: FontFamily.semibold,
    fontWeight: FontWeight.semibold,
    color: Colors.white,
  },
  timestamp: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.caption2,
    color: Colors.textSecondary,
  },
  description: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginLeft: 48,
    marginBottom: Spacing.sm,
  },
  cropRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 48,
  },
  cropText: {
    fontSize: FontSize.caption2,
    color: Colors.textSecondary,
    fontFamily: FontFamily.medium,
    fontWeight: FontWeight.medium,
  },
});
