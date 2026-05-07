import React, { useCallback } from 'react';
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
import { Colors, BorderRadius, FontSize, FontWeight } from '../../constants/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export interface ChipProps extends Omit<PressableProps, 'style' | 'children'> {
  selected?: boolean;
  iconName?: IoniconName;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  haptic?: boolean;
}

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

  const containerStyle: ViewStyle = selected
    ? { backgroundColor: Colors.accent }
    : { backgroundColor: Colors.accent + '14' };

  const fgColor = selected ? Colors.white : Colors.accent;

  // Static (non-pressable) chip
  if (!onPress) {
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
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !!disabled }}
      onPress={handlePress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        containerStyle,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
      {...rest}
    >
      {iconName ? <Ionicons name={iconName} size={14} color={fgColor} style={styles.icon} /> : null}
      {typeof children === 'string' ? (
        <Text style={[styles.text, { color: fgColor }, textStyle]} numberOfLines={1}>
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.full,
    alignSelf: 'flex-start',
  },
  icon: {
    marginRight: 6,
  },
  text: {
    fontSize: FontSize.footnote,
    fontWeight: FontWeight.semibold,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.7,
  },
});

export const Chip = React.memo(ChipImpl);
Chip.displayName = 'Chip';
