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

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  variant?: ButtonVariant;
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

function getVariantStyles(variant: ButtonVariant): {
  container: ViewStyle;
  text: TextStyle;
  iconColor: string;
} {
  switch (variant) {
    case 'primary':
      return {
        container: {
          backgroundColor: Colors.accent,
          shadowColor: Colors.accentDark,
          shadowOpacity: 0.28,
          shadowOffset: { width: 0, height: 8 },
          shadowRadius: 16,
          elevation: 6,
        },
        text: { color: Colors.white },
        iconColor: Colors.white,
      };
    case 'secondary':
      return {
        container: {
          // 8% tint of accent (0x14 = 20/255 ≈ 7.8%)
          backgroundColor: Colors.accent + '14',
        },
        text: { color: Colors.accent },
        iconColor: Colors.accent,
      };
    case 'outline':
      return {
        container: {
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: Colors.separator,
        },
        text: { color: Colors.text },
        iconColor: Colors.text,
      };
    case 'ghost':
    default:
      return {
        container: { backgroundColor: 'transparent' },
        text: { color: Colors.accent },
        iconColor: Colors.accent,
      };
  }
}

function ButtonImpl({
  variant = 'primary',
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
}: ButtonProps) {
  const dims = SIZES[size];
  const v = getVariantStyles(variant);
  const isDisabled = disabled || loading;

  const handlePress = useCallback(
    (e: GestureResponderEvent) => {
      if (isDisabled) return;
      if (haptic) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
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
        v.container,
        block && styles.block,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.iconColor} />
      ) : (
        <>
          {iconName ? <Ionicons name={iconName} size={dims.iconSize} color={v.iconColor} /> : null}
          <View style={styles.labelWrap}>
            {typeof children === 'string' ? (
              <Text
                numberOfLines={1}
                style={[
                  styles.label,
                  { fontSize: dims.fontSize, fontWeight: FontWeight.semibold },
                  v.text,
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
  },
});

export const Button = React.memo(ButtonImpl);
Button.displayName = 'Button';
