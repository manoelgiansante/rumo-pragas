import React from 'react';
import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppTheme } from '../../src/utils/theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: AppTheme.accent,
        tabBarInactiveTintColor: '#8E8E93',
        headerShown: false,
        tabBarStyle: { paddingBottom: 4 },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Início',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="leaf" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Histórico',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="history" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: 'Biblioteca',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="bookshelf" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Agro IA',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="creation" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Ajustes',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="cog" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
