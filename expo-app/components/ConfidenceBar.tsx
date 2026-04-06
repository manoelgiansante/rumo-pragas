import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontSize, FontWeight, BorderRadius } from '../constants/theme';

interface ConfidenceBarProps {
  value: number; // 0..1
}

function getBarColor(value: number): string {
  if (value >= 0.7) return Colors.coral;
  if (value >= 0.4) return Colors.warmAmber;
  return Colors.systemGray3;
}

export function ConfidenceBar({ value }: ConfidenceBarProps) {
  const color = getBarColor(value);
  const pct = Math.round(value * 100);

  return (
    <View
      style={styles.container}
      accessible
      accessibilityLabel={`Confianca: ${pct} por cento`}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: pct }}
    >
      <View style={styles.track} accessibilityElementsHidden>
        <View style={[styles.fill, { width: `${Math.min(pct, 100)}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.label} accessibilityElementsHidden>{pct}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  track: {
    width: 50,
    height: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.systemGray5,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: BorderRadius.full,
  },
  label: {
    fontSize: FontSize.caption,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    width: 36,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
});
