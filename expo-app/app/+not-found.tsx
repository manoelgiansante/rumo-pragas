import { View, Text, StyleSheet, Pressable } from 'react-native';
import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

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
    backgroundColor: '#FAFAF7',
  },
  title: {
    fontSize: 48,
    fontWeight: '800',
    color: '#1B7A3D',
    marginBottom: 8,
  },
  message: {
    fontSize: 16,
    color: '#6B7164',
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#1B7A3D',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
