import React, { useCallback } from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
  type PressableProps,
  type ViewStyle,
  type TextStyle,
  type StyleProp,
  type GestureResponderEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, BorderRadius, FontWeight, Spacing } from '../../constants/theme';
import type { ButtonSize } from './Button';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export interface PrimaryAmberButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  size?: ButtonSize;
  block?: boolean;
  iconName?: IoniconName;
  loading?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  haptic?: boolean;
}

const SIZES: Record<
  ButtonSize,
  { height: number; paddingHorizontal: number; fontSize: number; iconSize: number; gap: number }
> = {
  sm: { height: 40, paddingHorizontal: 16, fontSize: 15, iconSize: 16, gap: 8 },
  md: { height: 48, paddingHorizontal: 20, fontSize: 17, iconSize: 18, gap: 8 },
  lg: { height: 56, paddingHorizontal: 24, fontSize: 17, iconSize: 20, gap: 10 },
};

function PrimaryAmberButtonImpl({
  size = 'md',
  block = false,
  iconName,
  loading = false,
  disabled = false,
  children,
  style,
  textStyle,
  haptic = true,
  onPress,
  ...rest
}: PrimaryAmberButtonProps) {
  const dims = SIZES[size];
  const isDisabled = disabled || loading;

  const handlePress = useCallback(
    (e: GestureResponderEvent) => {
      if (isDisabled) return;
      if (haptic) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }
      onPress?.(e);
    },
    [isDisabled, haptic, onPress],
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPress={handlePress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          height: dims.height,
          paddingHorizontal: dims.paddingHorizontal,
          gap: dims.gap,
        },
        block && styles.block,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator size="small" color={Colors.text} />
      ) : (
        <>
          {iconName ? <Ionicons name={iconName} size={dims.iconSize} color={Colors.text} /> : null}
          <View style={styles.labelWrap}>
            {typeof children === 'string' ? (
              <Text
                numberOfLines={1}
                style={[
                  styles.label,
                  { fontSize: dims.fontSize, fontWeight: FontWeight.semibold },
                  textStyle,
                ]}
              >
                {children}
              </Text>
            ) : (
              children
            )}
          </View>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.warmAmber,
    // Amber-tinted shadow rgba(200,155,60,0.30) — matches mock's hero CTA glow.
    shadowColor: Colors.warmAmber,
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 6,
  },
  block: {
    alignSelf: 'stretch',
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.7,
  },
  labelWrap: {
    flexShrink: 1,
  },
  label: {
    textAlign: 'center',
    color: Colors.text,
  },
});

export const PrimaryAmberButton = React.memo(PrimaryAmberButtonImpl);
PrimaryAmberButton.displayName = 'PrimaryAmberButton';
