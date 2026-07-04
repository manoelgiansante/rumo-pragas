import { View, Text, StyleSheet, Pressable } from 'react-native';
import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Colors } from '../constants/theme';

export default function NotFoundScreen() {
  const { t } = useTranslation();

  return (
    <>
      <Stack.Screen options={{ title: t('notFound.headerTitle') }} />
      <View style={styles.container}>
        <Text style={styles.title} accessibilityRole="header" accessibilityLabel="404">
          404
        </Text>
        <Text
          style={styles.message}
          accessibilityRole="header"
          accessibilityLabel={t('notFound.title')}
        >
          {t('notFound.description')}
        </Text>
        <Pressable
          testID="notfound-back-home"
          style={styles.button}
          onPress={() => router.replace('/')}
          accessibilityRole="button"
          accessibilityLabel={t('notFound.backHomeA11y')}
          accessibilityHint={t('notFound.backHome')}
        >
          <Text style={styles.buttonText}>{t('notFound.backHome')}</Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: Colors.background,
  },
  title: {
    fontSize: 48,
    fontWeight: '800',
    color: Colors.accent,
    marginBottom: 8,
  },
  message: {
    fontSize: 16,
    color: Colors.textTertiary,
    marginBottom: 24,
  },
  button: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  buttonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
});
