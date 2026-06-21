import React from 'react';
import { Text, StyleSheet, Image, ImageStyle, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Gradients, FontSize, FontWeight } from '../constants/theme';

/**
 * Premium avatar component used in Settings + Edit Profile.
 * Falls back to a green-gradient circle with the user's initial when no
 * `uri` is provided — this matches Apple/Google Material guidance for
 * personal profile avatars (always recognisable, never empty).
 *
 * Sizes follow Apple's "Personal Identity" sizing rec (44 / 60 / 96).
 */
interface AvatarProps {
  uri?: string | null;
  name: string;
  size?: number;
  style?: ViewStyle;
}

export function Avatar({ uri, name, size = 60, style }: AvatarProps) {
  const initial = (name?.trim()?.charAt(0) || '?').toUpperCase();
  const fontScale = size >= 80 ? 0.42 : 0.4;

  if (uri) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        accessibilityRole="image"
        accessibilityLabel={name}
        source={{ uri }}
        style={[
          { width: size, height: size, borderRadius: size / 2 } as ImageStyle,
          style as ImageStyle,
        ]}
      />
    );
  }

  return (
    <LinearGradient
      colors={Gradients.hero}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.fallback, { width: size, height: size, borderRadius: size / 2 }, style]}
    >
      <Text
        style={[styles.initial, { fontSize: Math.round(size * fontScale) }]}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {initial}
      </Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fallback: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  initial: {
    color: '#FFF',
    fontWeight: FontWeight.bold,
    fontSize: FontSize.title2,
  },
});
