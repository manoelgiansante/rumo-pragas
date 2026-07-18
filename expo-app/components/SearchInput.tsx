import React from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Colors, BorderRadius, FontSize, FontFamily } from '../constants/theme';

interface SearchInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  testID?: string;
}

export function SearchInput({ value, onChangeText, placeholder, testID }: SearchInputProps) {
  const isDark = useColorScheme() === 'dark';
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder || t('common.searchDefault');

  return (
    <View style={[styles.container, isDark && styles.containerDark]} accessibilityRole="search">
      <Ionicons name="search" size={18} color={Colors.textSecondary} />
      <TextInput
        testID={testID ? `${testID}-input` : 'search-input'}
        style={[styles.input, isDark && styles.inputDark]}
        placeholder={resolvedPlaceholder}
        placeholderTextColor={Colors.textSecondary}
        value={value}
        onChangeText={onChangeText}
        returnKeyType="search"
        autoCorrect={false}
        accessibilityLabel={resolvedPlaceholder}
      />
      {value.length > 0 && (
        <TouchableOpacity
          testID={testID ? `${testID}-clear` : 'search-clear'}
          onPress={() => onChangeText('')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={t('common.clearSearchA11y')}
          accessibilityRole="button"
        >
          <Ionicons name="close-circle" size={18} color={Colors.textSecondary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.systemGray6,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: 14,
    gap: 8,
  },
  containerDark: {
    backgroundColor: '#2C2C2E',
  },
  input: {
    flex: 1,
    height: 44,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.body,
    color: Colors.text,
  },
  inputDark: {
    color: Colors.textDark,
  },
});
