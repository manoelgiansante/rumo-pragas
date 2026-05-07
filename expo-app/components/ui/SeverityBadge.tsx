import React from 'react';
import { View, Text, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { Colors, BorderRadius, FontSize, FontWeight } from '../../constants/theme';

export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

export interface SeverityBadgeProps {
  level: SeverityLevel;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

const COLOR_BY_LEVEL: Record<SeverityLevel, string> = {
  low: Colors.accent,
  medium: Colors.warmAmber,
  high: Colors.coral,
  critical: '#D32F2F',
};

const DEFAULT_LABEL: Record<SeverityLevel, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  critical: 'Crítica',
};

function SeverityBadgeImpl({ level, children, style }: SeverityBadgeProps) {
  const color = COLOR_BY_LEVEL[level];
  const label = children ?? DEFAULT_LABEL[level];

  return (
    <View
      style={[
        styles.pill,
        {
          // 8% bg tint (0x14 ≈ 7.8%)
          backgroundColor: color + '14',
          // 30% border tint (0x4D ≈ 30%)
          borderColor: color + '4D',
        },
        style,
      ]}
    >
      {typeof label === 'string' ? <Text style={[styles.text, { color }]}>{label}</Text> : label}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  text: {
    fontSize: FontSize.caption2,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});

export const SeverityBadge = React.memo(SeverityBadgeImpl);
SeverityBadge.displayName = 'SeverityBadge';
