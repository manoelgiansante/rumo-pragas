import React from 'react';
import { Text, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { Colors, Spacing, FontSize, FontWeight } from '../constants/theme';

/**
 * A banner that slides in from the top when the device is offline.
 * Uses Reanimated for smooth native-thread animation.
 */
export function OfflineBanner() {
  const { isConnected, isInternetReachable } = useNetworkStatus();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);

  // Consider offline if explicitly disconnected OR internet not reachable.
  // Ignore the initial null state (still detecting).
  const isOffline = isConnected === false || isInternetReachable === false;

  const height = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (isOffline) {
      setVisible(true);
      height.value = withTiming(BANNER_HEIGHT + insets.top, { duration: 300 });
      opacity.value = withTiming(1, { duration: 300 });
    } else {
      height.value = withTiming(0, { duration: 300 });
      opacity.value = withTiming(0, { duration: 300 }, (finished) => {
        if (finished) {
          runOnJS(setVisible)(false);
        }
      });
    }
  }, [isOffline, insets.top]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: height.value,
    opacity: opacity.value,
  }));

  if (!visible) return null;

  return (
    <Animated.View style={[styles.banner, animatedStyle, { paddingTop: insets.top }]}>
      <Ionicons name="cloud-offline-outline" size={16} color={Colors.black} />
      <Text style={styles.text}>Sem conexao com a internet</Text>
    </Animated.View>
  );
}

const BANNER_HEIGHT = 40;

const styles = StyleSheet.create({
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
    fontWeight: FontWeight.semibold,
    color: Colors.black,
  },
});
