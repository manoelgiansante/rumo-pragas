/**
 * StaggeredEntrance — fade + translate-up entrance with per-child delay.
 *
 * Used for paywall plan cards, empty states, and any "list of cards that
 * appears all at once" surface. Adds a 70ms delay between children which
 * reads as "premium" without being noticeably slow.
 *
 * Apple HIG: "Use motion to guide attention sequentially rather than all
 * at once — staggered reveals feel intentional, simultaneous reveals feel
 * accidental."
 *
 * Respects Reduce Motion: children render in their final position with
 * zero delay (no fade either).
 *
 * Usage:
 *   <StaggeredEntrance>
 *     <PlanCard ... />
 *     <PlanCard ... />
 *     <PlanCard ... />
 *   </StaggeredEntrance>
 */
import React, { Children, useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useReducedMotion } from '../../hooks/useReducedMotion';

interface StaggeredItemProps {
  delay: number;
  children: React.ReactNode;
  reduceMotion: boolean;
}

function StaggeredItem({ delay, children, reduceMotion }: StaggeredItemProps) {
  const opacity = useSharedValue(reduceMotion ? 1 : 0);
  const translateY = useSharedValue(reduceMotion ? 0 : 12);

  useEffect(() => {
    if (reduceMotion) return;
    opacity.value = withDelay(
      delay,
      withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }),
    );
    translateY.value = withDelay(
      delay,
      withTiming(0, { duration: 380, easing: Easing.out(Easing.cubic) }),
    );
  }, [reduceMotion, delay, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
}

interface StaggeredEntranceProps {
  children: React.ReactNode;
  /** ms between each child entrance. Defaults to 70 (snappy but readable). */
  step?: number;
  /** ms before the first child enters. Defaults to 0. */
  initialDelay?: number;
}

export function StaggeredEntrance({
  children,
  step = 70,
  initialDelay = 0,
}: StaggeredEntranceProps) {
  const reduceMotion = useReducedMotion();
  const items = Children.toArray(children);

  return (
    <>
      {items.map((child, i) => (
        <StaggeredItem key={i} delay={initialDelay + i * step} reduceMotion={reduceMotion}>
          {child}
        </StaggeredItem>
      ))}
    </>
  );
}
