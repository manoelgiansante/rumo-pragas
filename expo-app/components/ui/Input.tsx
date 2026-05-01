import React, { forwardRef, useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  type TextInputProps,
  type ViewStyle,
  type TextStyle,
  type StyleProp,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius, FontSize, FontWeight } from '../../constants/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  leftIcon?: IoniconName;
  rightIcon?: IoniconName;
  onRightIconPress?: () => void;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
}

export const Input = forwardRef<TextInput, InputProps>(function InputImpl(
  {
    label,
    error,
    leftIcon,
    rightIcon,
    onRightIconPress,
    containerStyle,
    inputStyle,
    onFocus,
    onBlur,
    placeholderTextColor,
    ...rest
  },
  ref,
) {
  const [focused, setFocused] = useState(false);

  // Using `Parameters<NonNullable<TextInputProps['onFocus']>>[0]` keeps us
  // compatible with whatever event shape this RN version exposes
  // (FocusEvent in newer RN, NativeSyntheticEvent<TextInputFocusEventData> in older).
  type FocusEv = Parameters<NonNullable<TextInputProps['onFocus']>>[0];
  type BlurEv = Parameters<NonNullable<TextInputProps['onBlur']>>[0];

  const handleFocus = useCallback(
    (e: FocusEv) => {
      setFocused(true);
      onFocus?.(e);
    },
    [onFocus],
  );

  const handleBlur = useCallback(
    (e: BlurEv) => {
      setFocused(false);
      onBlur?.(e);
    },
    [onBlur],
  );

  const borderColor = error ? Colors.coral : focused ? Colors.accent : Colors.separator;
  const borderWidth = focused || error ? 2 : 1;

  return (
    <View style={containerStyle}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[
          styles.inputWrap,
          {
            borderColor,
            borderWidth,
            // Compensate inner padding when border becomes 2px to avoid jump
            paddingHorizontal: 16 - (borderWidth - 1),
          },
        ]}
      >
        {leftIcon ? (
          <Ionicons name={leftIcon} size={18} color={Colors.textTertiary} style={styles.leftIcon} />
        ) : null}
        <TextInput
          ref={ref}
          style={[
            styles.input,
            leftIcon ? styles.inputWithLeft : null,
            rightIcon ? styles.inputWithRight : null,
            inputStyle,
          ]}
          placeholderTextColor={placeholderTextColor ?? Colors.textTertiary}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...rest}
        />
        {rightIcon ? (
          <Ionicons
            name={rightIcon}
            size={18}
            color={Colors.textTertiary}
            style={styles.rightIcon}
            onPress={onRightIconPress}
            suppressHighlighting
          />
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  label: {
    fontSize: FontSize.footnote,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
  },
  input: {
    flex: 1,
    fontSize: FontSize.body,
    color: Colors.text,
    height: '100%',
    paddingVertical: 0,
  },
  inputWithLeft: {
    marginLeft: 10,
  },
  inputWithRight: {
    marginRight: 10,
  },
  leftIcon: {
    marginRight: 0,
  },
  rightIcon: {
    marginLeft: 0,
  },
  error: {
    fontSize: FontSize.caption,
    color: Colors.coral,
    marginTop: 4,
  },
});

Input.displayName = 'Input';
