import React from 'react';
import { Text, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { Colors, Spacing, FontSize, FontWeight, FontFamily } from '../constants/theme';

/**
 * A banner that slides in from the top when the device is offline.
 * Uses Reanimated for smooth native-thread animation.
 */
export function OfflineBanner() {
  const { isConnected, isInternetReachable } = useNetworkStatus();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  // Consider offline if explicitly disconnected OR internet not reachable.
  // Ignore the initial null state (still detecting).
  const isOffline = isConnected === false || isInternetReachable === false;

  const spacerHeight = useSharedValue(0);
  const bannerHeight = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (isOffline) {
      setVisible(true);
      spacerHeight.value = withTiming(BANNER_HEIGHT, { duration: 300 });
      bannerHeight.value = withTiming(BANNER_HEIGHT + insets.top, { duration: 300 });
      opacity.value = withTiming(1, { duration: 300 });
    } else {
      spacerHeight.value = withTiming(0, { duration: 300 });
      bannerHeight.value = withTiming(0, { duration: 300 });
      opacity.value = withTiming(0, { duration: 300 }, (finished) => {
        if (finished) {
          runOnJS(setVisible)(false);
        }
      });
    }
  }, [isOffline, insets.top, spacerHeight, bannerHeight, opacity]);

  const spacerStyle = useAnimatedStyle(() => ({
    height: spacerHeight.value,
  }));
  const bannerStyle = useAnimatedStyle(() => ({
    height: bannerHeight.value,
    opacity: opacity.value,
  }));

  if (!visible) return null;

  return (
    <Animated.View testID="offline-banner-spacer" style={[styles.spacer, spacerStyle]}>
      <Animated.View
        testID="offline-banner"
        style={[styles.banner, bannerStyle, { paddingTop: insets.top }]}
        pointerEvents="none"
        accessibilityLabel={t('common.offlineBanner')}
        accessibilityRole="alert"
      >
        <Ionicons name="cloud-offline-outline" size={16} color={Colors.black} />
        <Text style={styles.text}>{t('common.offline')}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const BANNER_HEIGHT = 40;

const styles = StyleSheet.create({
  spacer: {
    position: 'relative',
    zIndex: 1000,
  },
  banner: {
    backgroundColor: Colors.warmAmber,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    overflow: 'hidden',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  text: {
    fontSize: FontSize.footnote,
    fontFamily: FontFamily.semibold,
    fontWeight: FontWeight.semibold,
    color: Colors.black,
  },
});
