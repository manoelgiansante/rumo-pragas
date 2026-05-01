import React from 'react';
import { View, StyleSheet, type ViewStyle, type StyleProp, type ViewProps } from 'react-native';
import { Colors, BorderRadius, Spacing } from '../../constants/theme';

export interface CardProps extends Omit<ViewProps, 'style'> {
  children: React.ReactNode;
  padding?: number;
  style?: StyleProp<ViewStyle>;
}

function CardImpl({ children, padding = Spacing.lg, style, ...rest }: CardProps) {
  return (
    <View style={[styles.card, { padding }, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    // elev-2: 0 3px 10px rgba(15,26,20,0.06)
    shadowColor: '#0F1A14',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 10,
    elevation: 3,
  },
});

export const Card = React.memo(CardImpl);
Card.displayName = 'Card';
