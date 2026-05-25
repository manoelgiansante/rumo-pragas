import React, { useCallback, useEffect } from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  View,
  type PressableProps,
  type ViewStyle,
  type TextStyle,
  type StyleProp,
  type GestureResponderEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Colors, BorderRadius, FontSize, FontWeight } from '../../constants/theme';
import { useReducedMotion } from '../../hooks/useReducedMotion';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export interface ChipProps extends Omit<PressableProps, 'style' | 'children'> {
  selected?: boolean;
  iconName?: IoniconName;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  haptic?: boolean;
}

const PRESS_SPRING = { damping: 18, stiffness: 320, mass: 0.7 } as const;

function ChipImpl({
  selected = false,
  iconName,
  children,
  style,
  textStyle,
  haptic = true,
  onPress,
  disabled,
  ...rest
}: ChipProps) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  // selectionProgress drives an animated colour fade between selected/unselected
  // states. Apple HIG: state changes should ease (200-280ms), not snap.
  const selectionProgress = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    selectionProgress.value = withTiming(selected ? 1 : 0, {
      duration: reduceMotion ? 0 : 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [selected, reduceMotion, selectionProgress]);

  const handlePressIn = useCallback(() => {
    if (!disabled && !reduceMotion) {
      scale.value = withSpring(0.96, PRESS_SPRING);
    }
  }, [disabled, reduceMotion, scale]);

  const handlePressOut = useCallback(() => {
    if (!disabled && !reduceMotion) {
      scale.value = withSpring(1, PRESS_SPRING);
    }
  }, [disabled, reduceMotion, scale]);

  const handlePress = useCallback(
    (e: GestureResponderEvent) => {
      if (disabled) return;
      if (haptic) {
        Haptics.selectionAsync().catch(() => {});
      }
      onPress?.(e);
    },
    [haptic, onPress, disabled],
  );

  const animatedContainerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    backgroundColor: interpolateColor(
      selectionProgress.value,
      [0, 1],
      [Colors.accent + '14', Colors.accent],
    ),
  }));

  const animatedTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(selectionProgress.value, [0, 1], [Colors.accent, Colors.white]),
  }));

  // Static (non-pressable) chip — no animation needed since selection can't change.
  if (!onPress) {
    const containerStyle: ViewStyle = selected
      ? { backgroundColor: Colors.accent }
      : { backgroundColor: Colors.accent + '14' };
    const fgColor = selected ? Colors.white : Colors.accent;

    return (
      <View style={[styles.base, containerStyle, disabled && styles.disabled, style]}>
        {iconName ? (
          <Ionicons name={iconName} size={14} color={fgColor} style={styles.icon} />
        ) : null}
        {typeof children === 'string' ? (
          <Text style={[styles.text, { color: fgColor }, textStyle]} numberOfLines={1}>
            {children}
          </Text>
        ) : (
          children
        )}
      </View>
    );
  }

  return (
    <Animated.View
      style={[styles.base, animatedContainerStyle, disabled && styles.disabled, style]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected, disabled: !!disabled }}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        style={styles.pressableInner}
        {...rest}
      >
        {iconName ? <AnimatedIcon name={iconName} selected={selected} /> : null}
        {typeof children === 'string' ? (
          <Animated.Text style={[styles.text, animatedTextStyle, textStyle]} numberOfLines={1}>
            {children}
          </Animated.Text>
        ) : (
          children
        )}
      </Pressable>
    </Animated.View>
  );
}

// Icon swaps colour discretely (Ionicons font glyphs can't tween colour
// smoothly without losing pixel-perfect rendering). The container fade
// already gives the eye a smooth transition.
function AnimatedIcon({ name, selected }: { name: IoniconName; selected: boolean }) {
  return (
    <Ionicons
      name={name}
      size={14}
      color={selected ? Colors.white : Colors.accent}
      style={styles.icon}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    borderRadius: BorderRadius.full,
  },
  pressableInner: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    paddingHorizontal: 14,
  },
  icon: {
    marginRight: 6,
  },
  text: {
    fontSize: FontSize.footnote,
    fontWeight: FontWeight.semibold,
  },
  disabled: {
    opacity: 0.7,
  },
});

export const Chip = React.memo(ChipImpl);
Chip.displayName = 'Chip';
