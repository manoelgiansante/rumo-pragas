import React from 'react';
import { View, ScrollView, StyleSheet, useColorScheme } from 'react-native';
import { SkeletonLoader } from './SkeletonLoader';
import { Colors, Spacing, BorderRadius } from '../constants/theme';

export function HomeScreenSkeleton() {
  const isDark = useColorScheme() === 'dark';

  return (
    <ScrollView style={[styles.container, isDark && styles.containerDark]} scrollEnabled={false}>
      {/* Hero gradient placeholder */}
      <SkeletonLoader width="100%" height={190} borderRadius={0} />

      <View style={styles.content}>
        {/* Weather card */}
        <SkeletonLoader width="100%" height={180} borderRadius={BorderRadius.lg} />

        {/* Scan button area */}
        <SkeletonLoader
          width="100%"
          height={80}
          borderRadius={BorderRadius.lg}
          style={{ marginTop: Spacing.lg }}
        />

        {/* Stats row - 3 boxes */}
        <View style={styles.statsRow}>
          <SkeletonLoader
            width={0}
            height={80}
            borderRadius={BorderRadius.lg}
            style={{ flex: 1 }}
          />
          <SkeletonLoader
            width={0}
            height={80}
            borderRadius={BorderRadius.lg}
            style={{ flex: 1 }}
          />
          <SkeletonLoader
            width={0}
            height={80}
            borderRadius={BorderRadius.lg}
            style={{ flex: 1 }}
          />
        </View>

        {/* Alerts section header */}
        <SkeletonLoader
          width={180}
          height={24}
          borderRadius={BorderRadius.sm}
          style={{ marginTop: Spacing.xl }}
        />

        {/* Alert card placeholders */}
        <SkeletonLoader
          width="100%"
          height={90}
          borderRadius={BorderRadius.lg}
          style={{ marginTop: Spacing.md }}
        />
        <SkeletonLoader
          width="100%"
          height={90}
          borderRadius={BorderRadius.lg}
          style={{ marginTop: Spacing.sm }}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  containerDark: {
    backgroundColor: Colors.backgroundDark,
  },
  content: {
    padding: Spacing.lg,
    marginTop: -16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
});
