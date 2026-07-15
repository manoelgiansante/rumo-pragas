import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { PragasAccountStatus } from '../hooks/useAuth';
import { BorderRadius, Colors, FontFamily, FontSize, Spacing } from '../constants/theme';

interface PragasAccountGateProps {
  status: Exclude<PragasAccountStatus, 'idle' | 'linked'>;
  error?: string | null;
  onReactivate: () => void;
  onRetry: () => void;
  onSignOut: () => void;
}

export function PragasAccountGate({
  status,
  error,
  onReactivate,
  onRetry,
  onSignOut,
}: PragasAccountGateProps) {
  const { t } = useTranslation();
  const busy = status === 'linking';
  const isDeleted = status === 'deleted_reactivation_required';
  const isPending = status === 'deletion_pending';

  const title = busy
    ? t('accountGate.linkingTitle')
    : isDeleted
      ? t('accountGate.reactivateTitle')
      : isPending
        ? t('accountGate.pendingTitle')
        : t('accountGate.errorTitle');
  const description = busy
    ? t('accountGate.linkingDescription')
    : isDeleted
      ? t('accountGate.reactivateDescription')
      : isPending
        ? t('accountGate.pendingDescription')
        : t('accountGate.errorDescription');

  return (
    <View style={styles.screen} accessibilityViewIsModal testID="pragas-account-gate">
      <View style={styles.card}>
        {busy && (
          <ActivityIndicator
            color={Colors.accent}
            size="large"
            accessibilityLabel={t('accountGate.loadingA11y')}
          />
        )}
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        <Text style={styles.description}>{description}</Text>
        {status === 'error' && error ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {t('accountGate.errorCode', { code: error })}
          </Text>
        ) : null}

        {isDeleted && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('accountGate.reactivate')}
            accessibilityHint={t('accountGate.reactivateHint')}
            onPress={onReactivate}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            testID="reactivate-pragas-account"
          >
            <Text style={styles.primaryButtonText}>{t('accountGate.reactivate')}</Text>
          </Pressable>
        )}

        {status === 'error' && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.retry')}
            onPress={onRetry}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            testID="retry-pragas-link"
          >
            <Text style={styles.primaryButtonText}>{t('common.retry')}</Text>
          </Pressable>
        )}

        {!busy && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settings.signOut')}
            onPress={onSignOut}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
            testID="pragas-gate-sign-out"
          >
            <Text style={styles.secondaryButtonText}>{t('settings.signOut')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.separator,
    padding: Spacing.xxl,
    gap: Spacing.lg,
  },
  title: {
    color: Colors.text,
    fontFamily: FontFamily.bold,
    fontSize: FontSize.title2,
    textAlign: 'center',
  },
  description: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.subheadline,
    lineHeight: 23,
    textAlign: 'center',
  },
  error: {
    color: Colors.coral,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.caption,
    textAlign: 'center',
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  primaryButtonText: {
    color: Colors.white,
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.subheadline,
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.separator,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  secondaryButtonText: {
    color: Colors.text,
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.subheadline,
  },
  pressed: { opacity: 0.76 },
});
