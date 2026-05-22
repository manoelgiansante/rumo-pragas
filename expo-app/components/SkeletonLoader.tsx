/**
 * SkeletonLoader — thin compatibility shim that delegates to <Shimmer/>.
 *
 * Previously this component ran a JS-thread `Animated.timing` opacity loop
 * (5+ shimmers on the home screen = 5+ JS callbacks per frame during the
 * initial render burst). Replaced with the new Reanimated 3 Shimmer which
 * runs on the UI thread and renders a sliding gradient bar.
 *
 * API preserved 1:1 so HistorySkeleton / HomeScreenSkeleton continue to work
 * without changes. New code should import { Shimmer } from 'components/ui'.
 */
import React from 'react';
import { type ViewStyle, type DimensionValue } from 'react-native';
import { Shimmer } from './ui/Shimmer';

interface SkeletonLoaderProps {
  width: DimensionValue;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function SkeletonLoader({ width, height, borderRadius = 8, style }: SkeletonLoaderProps) {
  return <Shimmer width={width} height={height} borderRadius={borderRadius} style={style} />;
}
