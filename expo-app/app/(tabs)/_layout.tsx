import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/theme';
import { ErrorBoundary } from '../../components/ErrorBoundary';

export default function TabsLayout() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <ErrorBoundary>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: Colors.accent,
          tabBarInactiveTintColor: Colors.systemGray,
          tabBarStyle: {
            backgroundColor: Colors.background,
            borderTopWidth: 1,
            borderTopColor: Colors.separator,
            height: 80 + insets.bottom,
            paddingTop: 8,
            paddingBottom: insets.bottom || 8,
            elevation: 0,
            shadowOpacity: 0,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '500',
          },
          headerShown: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t('tabs.home'),
            tabBarAccessibilityLabel: t('tabs.homeA11y'),
            tabBarIcon: ({ color, size }: { color: string; size: number }) => (
              <Ionicons name="home" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: t('tabs.history'),
            tabBarAccessibilityLabel: t('tabs.historyA11y'),
            tabBarIcon: ({ color, size }: { color: string; size: number }) => (
              <Ionicons name="time" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="library"
          options={{
            title: t('tabs.library'),
            tabBarAccessibilityLabel: t('tabs.libraryA11y'),
            tabBarIcon: ({ color, size }: { color: string; size: number }) => (
              <Ionicons name="library" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="ai-chat"
          options={{
            title: t('tabs.aiChat'),
            tabBarAccessibilityLabel: t('tabs.aiChatA11y'),
            tabBarIcon: ({ color, size }: { color: string; size: number }) => (
              <Ionicons name="sparkles" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: t('tabs.settings'),
            tabBarAccessibilityLabel: t('tabs.settingsA11y'),
            tabBarIcon: ({ color, size }: { color: string; size: number }) => (
              <Ionicons name="settings" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    </ErrorBoundary>
  );
}
