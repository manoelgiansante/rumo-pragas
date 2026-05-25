/**
 * PressableScale — drop-in Pressable that scales down on press with haptic.
 *
 * Apple HIG (Buttons): "Apply a subtle scale (typically 0.95-0.97) on tap so
 * users feel the button responding even before the action completes."
 *
 * Why a wrapper (not a HOC):
 *  - We need access to the press lifecycle (onPressIn / onPressOut) to drive
 *    spring animations on UI thread.
 *  - Pressable's `style={({pressed})=>...}` API only fires opacity on the JS
 *    thread (one frame late). Spring scale via worklet is silky.
 *
 * Respects `useReducedMotion`:
 *  - When ON: no scale animation. Haptic still fires (it's audio/tactile, not
 *    visual motion, so Apple HIG considers it independent of Reduce Motion).
 *
 * Usage:
 *   <PressableScale onPress={handlePress} hapticStyle="light">
 *     <Card>...</Card>
 *   </PressableScale>
 */
import React, { useCallback } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useReducedMotion } from '../../hooks/useReducedMotion';

type HapticStyle = 'none' | 'selection' | 'light' | 'medium' | 'heavy' | 'success' | 'warning';

export interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  children: React.ReactNode;
  /** Target scale at full press. Defaults to 0.97 (Apple-ish). */
  scaleTo?: number;
  /** Haptic feedback fired on press. 'light' is the default — matches our buttons. */
  hapticStyle?: HapticStyle;
  /** Optional outer style (passed to the animated wrapper). */
  style?: StyleProp<ViewStyle>;
  /** When true, no scale & no haptic — useful while data is loading. */
  disabled?: boolean;
}

const SPRING_CONFIG = {
  damping: 18,
  stiffness: 320,
  mass: 0.7,
} as const;

function fireHaptic(style: HapticStyle): void {
  switch (style) {
    case 'none':
      return;
    case 'selection':
      Haptics.selectionAsync().catch(() => {});
      return;
    case 'light':
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      return;
    case 'medium':
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      return;
    case 'heavy':
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      return;
    case 'success':
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return;
    case 'warning':
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
  }
}

export function PressableScale({
  children,
  scaleTo = 0.97,
  hapticStyle = 'light',
  style,
  disabled,
  onPressIn,
  onPressOut,
  onPress,
  ...rest
}: PressableScaleProps) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);

  const handlePressIn = useCallback(
    (e: Parameters<NonNullable<PressableProps['onPressIn']>>[0]) => {
      if (!disabled && !reduceMotion) {
        scale.value = withSpring(scaleTo, SPRING_CONFIG);
      }
      onPressIn?.(e);
    },
    [disabled, reduceMotion, scale, scaleTo, onPressIn],
  );

  const handlePressOut = useCallback(
    (e: Parameters<NonNullable<PressableProps['onPressOut']>>[0]) => {
      if (!disabled && !reduceMotion) {
        scale.value = withSpring(1, SPRING_CONFIG);
      } else if (reduceMotion) {
        // ensure no residual scale lingers if Reduce Motion is toggled mid-press
        scale.value = withTiming(1, { duration: 0 });
      }
      onPressOut?.(e);
    },
    [disabled, reduceMotion, scale, onPressOut],
  );

  const handlePress = useCallback(
    (e: Parameters<NonNullable<PressableProps['onPress']>>[0]) => {
      if (disabled) return;
      fireHaptic(hapticStyle);
      onPress?.(e);
    },
    [disabled, hapticStyle, onPress],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[animatedStyle, style]}>
      <Pressable
        {...rest}
        disabled={disabled}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
