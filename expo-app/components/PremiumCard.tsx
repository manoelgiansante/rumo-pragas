import React from 'react';
import { View, StyleSheet, useColorScheme, ViewStyle } from 'react-native';
import { Colors, BorderRadius, Spacing, Shadows } from '../constants/theme';

interface PremiumCardProps {
  children: React.ReactNode;
  padding?: number;
  style?: ViewStyle;
  /** White-pop surface (pure #FFFFFF) for cards that must lift off the cream bg. */
  elevated?: boolean;
}

export function PremiumCard({
  children,
  padding = Spacing.lg,
  style,
  elevated = false,
}: PremiumCardProps) {
  const isDark = useColorScheme() === 'dark';

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isDark ? Colors.cardDark : elevated ? Colors.cardElevated : Colors.card,
          padding,
          // Crisp warm hairline (#E5DECD) gives every surface a defined edge over
          // the cream bg, matching the "old money" bordered look. The soft
          // green-tinted shadow (Shadows.card) reads richer than a flat gray drop.
          borderColor: isDark ? Colors.separatorDark : Colors.separator,
          shadowColor: isDark ? 'transparent' : Shadows.card.shadowColor,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    shadowOffset: Shadows.card.shadowOffset,
    shadowOpacity: Shadows.card.shadowOpacity,
    shadowRadius: Shadows.card.shadowRadius,
    elevation: Shadows.card.elevation,
  },
});
