import React, { useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  type ViewStyle,
  type TextStyle,
  type StyleProp,
  type PressableProps,
  type GestureResponderEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Colors, FontSize, FontWeight } from '../../constants/theme';
import { useReducedMotion } from '../../hooks/useReducedMotion';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export interface IconButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  iconName: IoniconName;
  tone?: 'default' | 'onHero';
  size?: number;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  haptic?: boolean;
}

const PRESS_SPRING = { damping: 18, stiffness: 320, mass: 0.7 } as const;

function IconButtonImpl({
  iconName,
  tone = 'default',
  size = 18,
  accessibilityLabel,
  style,
  onPress,
  onPressIn,
  onPressOut,
  disabled,
  haptic = true,
  ...rest
}: IconButtonProps) {
  const isOnHero = tone === 'onHero';
  const bg = isOnHero ? 'rgba(255,255,255,0.18)' : Colors.accent + '14';
  const color = isOnHero ? Colors.white : Colors.accent;
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);

  const handlePressIn = useCallback(
    (e: GestureResponderEvent) => {
      if (!disabled && !reduceMotion) {
        scale.value = withSpring(0.94, PRESS_SPRING);
      }
      onPressIn?.(e);
    },
    [disabled, reduceMotion, scale, onPressIn],
  );

  const handlePressOut = useCallback(
    (e: GestureResponderEvent) => {
      if (!disabled && !reduceMotion) {
        scale.value = withSpring(1, PRESS_SPRING);
      }
      onPressOut?.(e);
    },
    [disabled, reduceMotion, scale, onPressOut],
  );

  const handlePress = useCallback(
    (e: GestureResponderEvent) => {
      if (disabled) return;
      if (haptic) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      onPress?.(e);
    },
    [disabled, haptic, onPress],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[animatedStyle, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        style={[
          iconButtonStyles.base,
          { backgroundColor: bg },
          disabled && iconButtonStyles.disabled,
        ]}
        hitSlop={8}
        {...rest}
      >
        <Ionicons name={iconName} size={size} color={color} />
      </Pressable>
    </Animated.View>
  );
}

export const IconButton = React.memo(IconButtonImpl);
IconButton.displayName = 'IconButton';

const iconButtonStyles = StyleSheet.create({
  base: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.7,
  },
});

export interface AppBarProps {
  title?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  children?: React.ReactNode;
}

function AppBarImpl({ title, leading, trailing, style, titleStyle, children }: AppBarProps) {
  return (
    <View style={[styles.bar, style]}>
      {leading ? <View style={styles.slot}>{leading}</View> : null}
      {children ?? (
        <Text style={[styles.title, titleStyle]} numberOfLines={1}>
          {title}
        </Text>
      )}
      {trailing ? <View style={styles.slot}>{trailing}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: Colors.background,
  },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: FontSize.title2,
    fontWeight: FontWeight.bold,
    letterSpacing: -0.33, // ≈ -0.015em at 22pt
    color: Colors.text,
  },
});

export const AppBar = React.memo(AppBarImpl);
AppBar.displayName = 'AppBar';
