import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/contexts/AuthContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppTheme } from '../src/utils/theme';

export default function Index() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [showSplash, setShowSplash] = useState(true);
  const leafScale = React.useRef(new Animated.Value(0.5)).current;
  const textOpacity = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(leafScale, { toValue: 1, friction: 6, useNativeDriver: true }),
      Animated.timing(textOpacity, { toValue: 1, duration: 600, delay: 300, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => {
        setShowSplash(false);
        if (isAuthenticated) {
          router.replace('/(tabs)/home');
        } else {
          router.replace('/auth');
        }
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isLoading, isAuthenticated]);

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <View style={[styles.ring, { width: 160, height: 160 }]} />
        <View style={[styles.ring, { width: 120, height: 120 }]} />
        <Animated.View style={[styles.leafCircle, { transform: [{ scale: leafScale }] }]}>
          <View style={styles.leafInner}>
            <MaterialCommunityIcons name="leaf" size={38} color="#fff" />
          </View>
        </Animated.View>
      </View>
      <Animated.View style={[styles.textContainer, { opacity: textOpacity }]}>
        <Text style={styles.title}>Rumo Pragas</Text>
        <Text style={styles.subtitle}>
          {'Inteligência artificial para\nproteção de lavouras'}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppTheme.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  ring: {
    position: 'absolute',
    borderRadius: 100,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  leafCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  leafInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: 20,
  },
});
