/**
 * SuccessCheck — animated check ring used for success states (healthy crop,
 * subscription activated, restored purchases, etc.).
 *
 * Why no confetti library:
 *  - react-native-confetti-cannon adds a 400KB+ native dependency for a
 *    one-shot UI flourish. Doesn't match our minimal-deps philosophy.
 *  - Apple HIG recommends "subtle motion" — a scale-in ring + check stroke
 *    grow is the iOS Health success pattern, more on-brand for an agricultural
 *    diagnosis app than a party confetti burst.
 *
 * Animation timeline (UI thread, worklet):
 *   t=0      ring scale 0  → 1.12  spring (overshoot)
 *   t=120    ring scale 1.12 → 1.0  spring (settle)
 *   t=80     check stroke fades + slides in
 *   t=380    haptic success notification (single shot)
 *
 * Respects Reduce Motion: renders static check immediately, no animation.
 */
import React, { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Colors } from '../../constants/theme';
import { useReducedMotion } from '../../hooks/useReducedMotion';

interface SuccessCheckProps {
  size?: number;
  /** Fires a Success notification haptic when the animation completes. */
  haptic?: boolean;
  /** Tint colour for the check icon. Defaults to brand green. */
  color?: string;
  /** Background ring tint. Defaults to 12% of `color`. */
  ringColor?: string;
  style?: StyleProp<ViewStyle>;
}

function triggerHaptic(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function SuccessCheck({
  size = 80,
  haptic = true,
  color = Colors.accent,
  ringColor,
  style,
}: SuccessCheckProps) {
  const reduceMotion = useReducedMotion();
  const ringScale = useSharedValue(reduceMotion ? 1 : 0);
  const checkScale = useSharedValue(reduceMotion ? 1 : 0);
  const checkOpacity = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      if (haptic) triggerHaptic();
      return;
    }
    // Ring pops in with a slight overshoot, then settles.
    ringScale.value = withSequence(
      withSpring(1.12, { damping: 10, stiffness: 200, mass: 0.6 }),
      withSpring(1, { damping: 14, stiffness: 200, mass: 0.6 }),
    );
    // Check icon fades + scales in 80ms after ring starts.
    checkOpacity.value = withDelay(
      80,
      withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) }),
    );
    checkScale.value = withDelay(
      80,
      withSequence(
        withSpring(1.08, { damping: 10, stiffness: 240, mass: 0.5 }),
        withSpring(1, { damping: 14, stiffness: 240, mass: 0.5 }, () => {
          if (haptic) runOnJS(triggerHaptic)();
        }),
      ),
    );
  }, [reduceMotion, haptic, ringScale, checkScale, checkOpacity]);

  const ringAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
  }));
  const checkAnimatedStyle = useAnimatedStyle(() => ({
    opacity: checkOpacity.value,
    transform: [{ scale: checkScale.value }],
  }));

  const resolvedRing = ringColor ?? color + '1F'; // 12% alpha

  return (
    <View
      style={[styles.container, { width: size, height: size }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: resolvedRing,
          },
          ringAnimatedStyle,
        ]}
      />
      <Animated.View style={[styles.iconWrap, checkAnimatedStyle]}>
        <Ionicons name="checkmark-circle" size={size * 0.65} color={color} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
