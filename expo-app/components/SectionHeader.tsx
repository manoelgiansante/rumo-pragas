import React from 'react';
import { View, Text, StyleSheet, useColorScheme, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors, FontSize, FontFamily, Spacing } from '../constants/theme';

interface SectionHeaderProps {
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  /** Optional trailing element (badge / count / action). */
  trailing?: React.ReactNode;
  style?: ViewStyle;
}

/**
 * Premium "old money" section header: a gold accent rule + bold title.
 * Gives every content block a strong, consistent entry point across screens.
 */
export function SectionHeader({ title, icon, iconColor, trailing, style }: SectionHeaderProps) {
  const isDark = useColorScheme() === 'dark';
  return (
    <View style={[styles.row, style]}>
      <View style={styles.goldRule} />
      {icon ? (
        <Ionicons
          name={icon}
          size={18}
          color={iconColor ?? Colors.brand}
          style={styles.icon}
          accessibilityElementsHidden
        />
      ) : null}
      <Text
        style={[styles.title, isDark && styles.titleDark]}
        accessibilityRole="header"
        numberOfLines={1}
      >
        {title}
      </Text>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: Spacing.xxl,
    marginBottom: Spacing.md,
  },
  // Short vertical gold bar — the signature "premium" tick before a section.
  goldRule: {
    width: 4,
    height: 20,
    borderRadius: 2,
    backgroundColor: Colors.gold,
  },
  icon: { marginLeft: 2 },
  title: {
    flex: 1,
    fontSize: FontSize.title3,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: Colors.text,
  },
  titleDark: { color: Colors.textDark },
  trailing: { marginLeft: 'auto' },
});
