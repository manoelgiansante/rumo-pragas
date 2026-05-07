import React, { useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  type ViewStyle,
  type TextStyle,
  type StyleProp,
  type GestureResponderEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors, FontSize, FontWeight } from '../../constants/theme';

export interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onActionPress?: () => void;
  style?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  actionStyle?: StyleProp<TextStyle>;
  haptic?: boolean;
}

function SectionHeaderImpl({
  title,
  actionLabel,
  onActionPress,
  style,
  titleStyle,
  actionStyle,
  haptic = true,
}: SectionHeaderProps) {
  const handleAction = useCallback(
    (_e: GestureResponderEvent) => {
      if (haptic) {
        Haptics.selectionAsync().catch(() => {});
      }
      onActionPress?.();
    },
    [haptic, onActionPress],
  );

  return (
    <View style={[styles.row, style]}>
      <Text style={[styles.title, titleStyle]} numberOfLines={1}>
        {title}
      </Text>
      {actionLabel ? (
        <Pressable
          onPress={handleAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          hitSlop={8}
          style={({ pressed }) => (pressed ? styles.pressed : undefined)}
        >
          <Text style={[styles.action, actionStyle]} numberOfLines={1}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: FontSize.headline, // 17
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  action: {
    fontSize: 14,
    fontWeight: FontWeight.medium,
    color: Colors.accent,
  },
  pressed: {
    opacity: 0.6,
  },
});

export const SectionHeader = React.memo(SectionHeaderImpl);
SectionHeader.displayName = 'SectionHeader';
