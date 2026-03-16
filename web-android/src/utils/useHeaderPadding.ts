import { Platform, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Returns the paddingTop to use for custom screen headers
 * that account for the status bar / safe area.
 */
export function useHeaderPadding(): number {
  const insets = useSafeAreaInsets();
  if (Platform.OS === 'web') return 16;
  return insets.top + 10;
}
