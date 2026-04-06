import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, FontSize, FontWeight } from '../constants/theme';
import type { PestAlert, AlertSeverity } from '../services/alerts';

const SEVERITY_CONFIG: Record<
  AlertSeverity,
  { bg: string; border: string; text: string; label: string }
> = {
  high: {
    bg: 'rgba(240, 102, 82, 0.10)',
    border: 'rgba(240, 102, 82, 0.30)',
    text: '#D94432',
    label: 'Alto',
  },
  medium: {
    bg: 'rgba(235, 176, 38, 0.10)',
    border: 'rgba(235, 176, 38, 0.30)',
    text: '#C49520',
    label: 'Medio',
  },
  low: {
    bg: 'rgba(26, 150, 107, 0.10)',
    border: 'rgba(26, 150, 107, 0.30)',
    text: '#0F6B4D',
    label: 'Baixo',
  },
};

interface AlertCardProps {
  alert: PestAlert;
}

export const AlertCard = React.memo(function AlertCard({ alert }: AlertCardProps) {
  const isDark = useColorScheme() === 'dark';
  const config = SEVERITY_CONFIG[alert.severity];

  const timeAgo = () => {
    const diff = Date.now() - new Date(alert.date).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Agora';
    if (minutes < 60) return `${minutes}min atras`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h atras`;
    return `${Math.floor(hours / 24)}d atras`;
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
      accessibilityLabel={`Alerta ${config.label}: ${alert.title}. ${alert.description}. Cultura afetada: ${alert.cropAffected}`}
      accessibilityRole="alert"
    >
      <View style={styles.header}>
        <View style={[styles.iconCircle, { backgroundColor: config.bg }]}>
          <Ionicons name={alert.icon as any} size={18} color={config.text} />
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
              <Text style={[styles.severityText, { color: config.text }]}>{config.label}</Text>
            </View>
            {alert.isForecast && (
              <View style={styles.forecastBadge}>
                <Text style={styles.forecastBadgeText}>Previsao</Text>
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
    fontWeight: FontWeight.semibold,
    color: '#FFFFFF',
  },
  timestamp: {
    fontSize: FontSize.caption2,
    color: Colors.textSecondary,
  },
  description: {
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
    fontWeight: FontWeight.medium,
  },
});
