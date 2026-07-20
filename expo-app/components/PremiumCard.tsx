import React from 'react';
import { View, StyleSheet, useColorScheme, ViewStyle } from 'react-native';
import { Colors, BorderRadius, Spacing } from '../constants/theme';

interface PremiumCardProps {
  children: React.ReactNode;
  padding?: number;
  style?: ViewStyle;
}

export function PremiumCard({ children, padding = Spacing.lg, style }: PremiumCardProps) {
  const isDark = useColorScheme() === 'dark';

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isDark ? Colors.cardDark : Colors.card,
          padding,
          // Crisp hairline border (#E5DECD light / separatorDark) gives every
          // surface a defined edge over the warm off-white bg — matches the
          // bordered inputs on the login sheet. Without it a white card on
          // #FAFAF7 reads as a floaty flat rectangle.
          borderColor: isDark ? Colors.separatorDark : Colors.separator,
          shadowColor: isDark ? 'transparent' : '#000',
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
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
});
