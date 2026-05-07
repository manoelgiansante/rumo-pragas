import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  type ViewStyle,
  type TextStyle,
  type StyleProp,
} from 'react-native';
import { Colors, BorderRadius, FontSize, FontWeight } from '../../constants/theme';

export interface StatTileProps {
  value: React.ReactNode;
  label: string;
  sub?: string;
  style?: StyleProp<ViewStyle>;
  valueStyle?: StyleProp<TextStyle>;
  labelStyle?: StyleProp<TextStyle>;
  subStyle?: StyleProp<TextStyle>;
}

function StatTileImpl({
  value,
  label,
  sub,
  style,
  valueStyle,
  labelStyle,
  subStyle,
}: StatTileProps) {
  return (
    <View style={[styles.tile, style]}>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text style={[styles.value, valueStyle]} numberOfLines={1}>
          {value}
        </Text>
      ) : (
        value
      )}
      <Text style={[styles.label, labelStyle]} numberOfLines={1}>
        {label}
      </Text>
      {sub ? (
        <Text style={[styles.sub, subStyle]} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.separator,
    borderRadius: BorderRadius.md, // 12
    padding: 14,
    alignItems: 'center',
  },
  value: {
    fontSize: FontSize.title2, // 22
    fontWeight: FontWeight.bold,
    color: Colors.accent,
    letterSpacing: -0.33, // ≈ -0.015em at 22
    fontVariant: ['tabular-nums'],
  },
  label: {
    fontSize: FontSize.caption2, // 11
    fontWeight: FontWeight.semibold,
    color: Colors.textTertiary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 6,
    textAlign: 'center',
  },
  sub: {
    fontSize: FontSize.caption2, // 11
    color: Colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
});

export const StatTile = React.memo(StatTileImpl);
StatTile.displayName = 'StatTile';
