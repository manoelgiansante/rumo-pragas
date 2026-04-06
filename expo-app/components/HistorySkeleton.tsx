import React from 'react';
import { View, StyleSheet, useColorScheme } from 'react-native';
import { SkeletonLoader } from './SkeletonLoader';
import { Colors, Spacing, BorderRadius } from '../constants/theme';

export function HistorySkeleton() {
  const isDark = useColorScheme() === 'dark';

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      {/* Search bar placeholder */}
      <View style={styles.searchRow}>
        <SkeletonLoader width="100%" height={44} borderRadius={BorderRadius.md} />
      </View>

      <View style={styles.list}>
        {/* Count text placeholder */}
        <SkeletonLoader
          width={140}
          height={18}
          borderRadius={BorderRadius.sm}
          style={{ marginBottom: Spacing.md }}
        />

        {/* 4 diagnosis card placeholders */}
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.card, isDark && styles.cardDark]}>
            <View style={styles.cardRow}>
              {/* Thumbnail placeholder */}
              <SkeletonLoader width={64} height={64} borderRadius={BorderRadius.sm} />
              <View style={styles.cardContent}>
                {/* Title line */}
                <SkeletonLoader width="70%" height={16} borderRadius={4} />
                {/* Subtitle line */}
                <SkeletonLoader
                  width="50%"
                  height={12}
                  borderRadius={4}
                  style={{ marginTop: Spacing.sm }}
                />
                {/* Date line */}
                <SkeletonLoader
                  width="35%"
                  height={12}
                  borderRadius={4}
                  style={{ marginTop: Spacing.sm }}
                />
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
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
  searchRow: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
  },
  list: {
    padding: Spacing.lg,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  cardDark: {
    backgroundColor: Colors.cardDark,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  cardContent: {
    flex: 1,
  },
});
