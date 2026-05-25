/**
 * AnimatedEmptyState — illustrated empty state with a slow floating icon.
 *
 * Replaces the "static Ionicon + grey title + grey body" pattern that empty
 * screens use across the app. The gentle float (≤ 6px) tells the user the
 * screen rendered correctly (vs. "is this just frozen?") without distracting
 * them from the CTA underneath.
 *
 * Apple HIG: "Use motion to convey state when a screen has no data — a static
 * empty state can read as a loading bug."
 *
 * Respects Reduce Motion: icon renders static, no float.
 *
 * Usage:
 *   <AnimatedEmptyState
 *     icon="time-outline"
 *     title={t('history.emptyTitle')}
 *     body={t('history.emptyBody')}
 *   >
 *     <Button onPress={...}>Diagnosticar</Button>
 *   </AnimatedEmptyState>
 */
import React, { useEffect } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { Colors, FontSize, FontWeight, Spacing } from '../../constants/theme';
import { useReducedMotion } from '../../hooks/useReducedMotion';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface AnimatedEmptyStateProps {
  icon: IoniconName;
  title: string;
  body?: string;
  /** Anything rendered below the body — typically a CTA button. */
  children?: React.ReactNode;
  iconColor?: string;
  iconBgColor?: string;
  style?: StyleProp<ViewStyle>;
}

export function AnimatedEmptyState({
  icon,
  title,
  body,
  children,
  iconColor = Colors.accent,
  iconBgColor,
  style,
}: AnimatedEmptyStateProps) {
  const reduceMotion = useReducedMotion();
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    translateY.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 1800, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      true,
    );
    return () => {
      cancelAnimation(translateY);
    };
  }, [reduceMotion, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const resolvedBg = iconBgColor ?? iconColor + '14'; // 8% alpha

  return (
    <View style={[styles.container, style]}>
      <Animated.View
        style={[styles.iconCircle, { backgroundColor: resolvedBg }, animatedStyle]}
        accessibilityElementsHidden
      >
        <Ionicons name={icon} size={36} color={iconColor} />
      </Animated.View>
      <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
        {title}
      </Text>
      {body ? (
        <Text style={styles.body} maxFontSizeMultiplier={1.4}>
          {body}
        </Text>
      ) : null}
      {children ? <View style={styles.ctaWrap}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxxl,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSize.headline,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  body: {
    fontSize: FontSize.subheadline,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 300,
  },
  ctaWrap: {
    marginTop: Spacing.xl,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
});
