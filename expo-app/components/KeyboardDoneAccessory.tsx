// Reusable "Concluir" (Done) toolbar above the iOS keyboard.
//
// iOS number-style keyboards (phone-pad / numeric / decimal-pad) have NO return
// key, so the user is stranded with no obvious way to dismiss the keyboard
// (CEO requirement: "teclado tem OK quando vai escrever"). Render this once on a
// screen and point any numeric TextInput at it via
// `inputAccessoryViewID={DONE_ACCESSORY_ID}` on iOS.
//
// InputAccessoryView is iOS-only — on Android this renders nothing (Android
// keyboards already expose a check/return key), so it's safe to mount anywhere.
import React from 'react';
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors, Spacing, FontSize, FontWeight } from '../constants/theme';

/** Shared nativeID — use the SAME value on the InputAccessoryView and inputs. */
export const DONE_ACCESSORY_ID = 'doneAccessory';

export function KeyboardDoneAccessory() {
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';

  // Android keyboards already provide a confirm/return action.
  if (Platform.OS !== 'ios') return null;

  return (
    <InputAccessoryView nativeID={DONE_ACCESSORY_ID}>
      <View style={[styles.bar, isDark && styles.barDark]}>
        <TouchableOpacity
          onPress={() => Keyboard.dismiss()}
          accessibilityRole="button"
          accessibilityLabel={t('common.done')}
          hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
          testID="keyboard-done-accessory"
        >
          <Text style={styles.doneText}>{t('common.done')}</Text>
        </TouchableOpacity>
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.systemGray6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.separator,
  },
  barDark: {
    backgroundColor: '#1C1C1E',
    borderTopColor: Colors.separatorDark,
  },
  doneText: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.semibold,
    color: Colors.accent,
  },
});
