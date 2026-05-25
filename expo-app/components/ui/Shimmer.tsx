/**
 * Shimmer — Reanimated 3 skeleton with a sliding light bar (UI thread).
 *
 * Replaces the legacy `Animated.timing` opacity pulse from `SkeletonLoader`
 * which ran on the JS thread (causes frame drops during initial render burst
 * of the home screen / history screen, both of which render 5+ skeletons).
 *
 * Why this is better:
 *  1. Worklet-based — animation lives on UI thread, no JS bridge crossing
 *     even during heavy mount work (image preloads, supabase parallel queries).
 *  2. LinearGradient sliding bar feels more "premium" than a flat opacity blink
 *     (matches what users see in Apple Health, Instagram, X).
 *  3. Respects `useReducedMotion` — falls back to a static muted block.
 *
 * Performance: one shared value per Shimmer instance, but the loop is started
 * inside a single `useEffect` and cancelled on unmount. Reanimated coalesces
 * concurrent animations on the UI thread, so 6 shimmers ≈ 1 shimmer in cost.
 */
import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  useColorScheme,
  type DimensionValue,
  type LayoutChangeEvent,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useReducedMotion } from '../../hooks/useReducedMotion';

interface ShimmerProps {
  width: DimensionValue;
  height: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

// Use a wider gradient (4x width) so the bright band fully slides off-screen.
const SHIMMER_WIDTH_MULTIPLIER = 4;

export function Shimmer({ width, height, borderRadius = 8, style }: ShimmerProps) {
  const reduceMotion = useReducedMotion();
  const isDark = useColorScheme() === 'dark';
  // Measured container width drives the slide distance — translateX needs a
  // numeric pixel value (Reanimated transforms only accept numbers, not %).
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const translateX = useSharedValue(-1);

  useEffect(() => {
    if (reduceMotion) return;
    // Slide from -1 (off-screen left, one container width) to +1 (off-screen
    // right). Multiplied by measured pixel width in the animated style below.
    translateX.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(translateX);
    };
  }, [reduceMotion, translateX]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value * measuredWidth }],
  }));

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w !== measuredWidth) setMeasuredWidth(w);
  };

  const baseColor = isDark ? '#1F2F29' : '#E5DECD';
  // Highlight tinted slightly toward the brand green for cohesion (vs raw white,
  // which feels surgical against the warm off-white background of the app).
  const highlightColors = isDark
    ? (['rgba(31,47,41,0)', 'rgba(60,80,72,0.5)', 'rgba(31,47,41,0)'] as const)
    : (['rgba(229,222,205,0)', 'rgba(255,253,247,0.9)', 'rgba(229,222,205,0)'] as const);

  return (
    <View
      onLayout={handleLayout}
      style={[
        styles.container,
        {
          width,
          height,
          borderRadius,
          backgroundColor: baseColor,
        },
        style,
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {!reduceMotion && measuredWidth > 0 ? (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              width: SHIMMER_WIDTH_MULTIPLIER * measuredWidth,
              left: -(SHIMMER_WIDTH_MULTIPLIER - 1) * (measuredWidth / 2),
            },
            animatedStyle,
          ]}
          pointerEvents="none"
        >
          <LinearGradient
            colors={highlightColors}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
