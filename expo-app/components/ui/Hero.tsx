import React from 'react';
import { StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Gradients, BorderRadius } from '../../constants/theme';

export interface HeroProps {
  children: React.ReactNode;
  topInset?: number;
  style?: StyleProp<ViewStyle>;
}

function HeroImpl({ children, topInset = 0, style }: HeroProps) {
  return (
    <LinearGradient
      colors={Gradients.hero}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.hero, { paddingTop: 16 + topInset }, style]}
    >
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    borderBottomLeftRadius: BorderRadius.xl, // 24
    borderBottomRightRadius: BorderRadius.xl,
  },
});

export const Hero = React.memo(HeroImpl);
Hero.displayName = 'Hero';
