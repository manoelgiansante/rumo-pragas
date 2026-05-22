// -----------------------------------------------------------------------------
// DiagnosisSkeleton — translucent preview of the result card rendered behind
// the loading-screen progress UI so the user perceives the analysis as
// "already coming together" instead of staring at a blank screen.
// -----------------------------------------------------------------------------
// Lives at z-index 0 under the loading content (which sits on a translucent
// gradient overlay). The shimmer animation runs entirely on the UI thread via
// Reanimated worklets — no JS-thread work, no re-renders.
//
// Intentionally NOT shown on Android < 12 to avoid layered-blur cost on older
// devices; on those we fall back to the plain gradient. Detected via
// `Platform.Version` which is a number on Android and a string on iOS.
// -----------------------------------------------------------------------------

import React, { useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { Colors, BorderRadius, Spacing } from '../constants/theme';

interface Props {
  /** Set to false once the real result is about to render so we stop animating. */
  active?: boolean;
}

// Disable on older Android — the cost-benefit of an extra animated layer is
// not worth it on pre-12 GPUs that already struggle with translucent blur.
const SKIP_SKELETON =
  Platform.OS === 'android' && typeof Platform.Version === 'number' && Platform.Version < 31;

export function DiagnosisSkeleton({ active = true }: Props) {
  const shimmer = useSharedValue(0);

  useEffect(() => {
    if (!active || SKIP_SKELETON) return;
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => {
      // Stopping the animation just freezes the shared value at its current
      // position — the worklet won't tick again so there's no leak.
      shimmer.value = 0;
    };
  }, [active, shimmer]);

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 1], [0.45, 0.85]),
  }));

  if (SKIP_SKELETON) return null;

  return (
    <View pointerEvents="none" style={styles.container} accessibilityElementsHidden>
      <Animated.View style={[styles.headerBlock, shimmerStyle]} />
      <View style={styles.row}>
        <Animated.View style={[styles.circle, shimmerStyle]} />
        <View style={styles.column}>
          <Animated.View style={[styles.line, { width: '78%' }, shimmerStyle]} />
          <Animated.View style={[styles.lineSmall, { width: '52%' }, shimmerStyle]} />
        </View>
      </View>
      <Animated.View style={[styles.confidenceTrack, shimmerStyle]} />
      <View style={styles.badgeRow}>
        <Animated.View style={[styles.badge, shimmerStyle]} />
        <Animated.View style={[styles.badge, { width: 90 }, shimmerStyle]} />
        <Animated.View style={[styles.badge, { width: 60 }, shimmerStyle]} />
      </View>
      <Animated.View style={[styles.section, shimmerStyle]} />
      <Animated.View style={[styles.section, { height: 80 }, shimmerStyle]} />
    </View>
  );
}

const SHIMMER_BG = 'rgba(255,255,255,0.18)';

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    paddingTop: 80,
    paddingHorizontal: Spacing.lg,
    gap: 14,
  },
  headerBlock: {
    height: 140,
    borderRadius: BorderRadius.lg,
    backgroundColor: SHIMMER_BG,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  circle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: SHIMMER_BG,
  },
  column: {
    flex: 1,
    gap: 8,
  },
  line: {
    height: 14,
    borderRadius: 4,
    backgroundColor: SHIMMER_BG,
  },
  lineSmall: {
    height: 10,
    borderRadius: 4,
    backgroundColor: SHIMMER_BG,
  },
  confidenceTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: SHIMMER_BG,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    width: 70,
    height: 22,
    borderRadius: 11,
    backgroundColor: SHIMMER_BG,
  },
  section: {
    height: 60,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.systemGray6 + '88',
  },
});
