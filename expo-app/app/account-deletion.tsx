import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useAuthContext } from '../contexts/AuthContext';
import {
  Colors,
  BorderRadius,
  FontFamily,
  FontSize,
  FontWeight,
  Spacing,
} from '../constants/theme';
import { createEphemeralSupabaseClient, supabase } from '../services/supabase';
import { reauthenticateWithAppleForAccountDeletion } from '../services/appleAuth';
import { useGoogleSignIn } from '../services/googleAuth';
import {
  beginGlobalAccountDeletion,
  confirmGlobalAccountDeletion,
  GlobalAccountDeletionError,
  loadPersistedGlobalDeletionState,
  persistGlobalDeletionState,
  resumeGlobalAccountDeletionAppleRevocation,
  type GlobalDeletionChallenge,
  type GlobalDeletionReceipt,
} from '../services/globalAccountDeletion';
import { purgePragasLocalUserData } from '../services/localDataPurge';
import { captureMessage } from '../services/sentry-shim';

type ReauthenticationKind = 'password' | 'apple' | 'google';

export default function AccountDeletionScreen() {
  const isDark = useColorScheme() === 'dark';
  const { t, i18n } = useTranslation();
  const { user, session, signOut } = useAuthContext();
  const reauthenticationClient = useMemo(() => createEphemeralSupabaseClient(), []);
  const google = useGoogleSignIn(reauthenticationClient);
  const idempotencyKeyRef = useRef(Crypto.randomUUID());
  const [acknowledged, setAcknowledged] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<ReauthenticationKind | null>(null);
  const [receipt, setReceipt] = useState<GlobalDeletionReceipt | null>(null);
  const [appleRetryBusy, setAppleRetryBusy] = useState(false);
  const [localPurgeComplete, setLocalPurgeComplete] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const providers = useMemo(() => {
    const configured = user?.app_metadata?.providers;
    if (Array.isArray(configured)) {
      return new Set(configured.filter((value): value is string => typeof value === 'string'));
    }
    const primary = user?.app_metadata?.provider;
    return new Set(typeof primary === 'string' ? [primary] : []);
  }, [user?.app_metadata?.provider, user?.app_metadata?.providers]);
  // Apple-linked identities must reauthenticate with Apple so the native
  // single-use authorization code can be exchanged and revoked server-side.
  const requiresAppleReauthentication = providers.has('apple');
  const canUsePassword =
    !requiresAppleReauthentication && providers.has('email') && Boolean(user?.email);
  const canUseApple = Platform.OS === 'ios' && requiresAppleReauthentication;
  const canUseGoogle =
    !requiresAppleReauthentication && providers.has('google') && google.configured;

  useEffect(() => {
    let active = true;
    if (!user?.id) return () => undefined;
    void loadPersistedGlobalDeletionState(user.id)
      .then((state) => {
        if (!active || !state) return;
        idempotencyKeyRef.current = state.idempotencyKey;
        setReceipt(state.receipt);
      })
      .catch(() => {
        captureMessage('global deletion receipt restore failed', {
          level: 'warning',
          tags: { feature: 'accountDeletion', step: 'receipt_restore' },
        });
      });
    return () => {
      active = false;
    };
  }, [user?.id]);

  const recordReceipt = async (result: GlobalDeletionReceipt) => {
    setReceipt(result);
    setErrorMessage(null);
    if (!user?.id) {
      setLocalPurgeComplete(false);
      return;
    }
    try {
      await persistGlobalDeletionState(user.id, result, idempotencyKeyRef.current);
    } catch {
      captureMessage('global deletion receipt persistence failed', {
        level: 'warning',
        tags: { feature: 'accountDeletion', step: 'receipt_persist' },
      });
    }
    try {
      await purgePragasLocalUserData(user.id);
      setLocalPurgeComplete(true);
    } catch {
      setLocalPurgeComplete(false);
      captureMessage('global deletion local purge failed', {
        level: 'warning',
        tags: { feature: 'accountDeletion', step: 'local_purge' },
      });
    }
  };

  const beginChallenge = async (): Promise<GlobalDeletionChallenge | null> => {
    const currentSession = session ?? (await supabase.auth.getSession()).data.session;
    if (!currentSession) throw new Error('UNAUTHENTICATED');
    const result = await beginGlobalAccountDeletion(currentSession);
    if (result.kind === 'already_requested') {
      await recordReceipt({
        receipt: result.receipt,
        status: result.status,
        requestedAt: result.requestedAt,
        dueAt: result.dueAt,
        appCleanupState: result.appCleanupState,
        appleAuthorizationStatus: result.appleAuthorizationStatus,
      });
      return null;
    }
    return result;
  };

  const commitWithFreshSession = async (
    challenge: GlobalDeletionChallenge,
    freshSession: NonNullable<typeof session>,
    appleAuthorizationCode?: string,
  ) => {
    if (!user?.id || freshSession.user.id !== user.id) {
      // The isolated client can authenticate a different account, but it can
      // never replace the app session. Reject the proof without touching the
      // original user's persisted AuthContext.
      throw new Error('REAUTHENTICATED_IDENTITY_MISMATCH');
    }
    const result = await confirmGlobalAccountDeletion(
      freshSession,
      challenge,
      idempotencyKeyRef.current,
      appleAuthorizationCode,
    );
    await recordReceipt(result);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const runReauthentication = async (kind: ReauthenticationKind) => {
    if (!acknowledged || busy) return;
    setBusy(kind);
    setErrorMessage(null);
    try {
      const challenge = await beginChallenge();
      if (!challenge) return;
      const waitMs = Date.parse(challenge.reauthenticateAfter) - Date.now() + 25;
      if (!Number.isFinite(waitMs) || waitMs > 2_000) {
        throw new Error('INVALID_REAUTHENTICATION_BOUNDARY');
      }
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));

      if (kind === 'password') {
        if (!user?.email || !password) throw new Error('PASSWORD_REQUIRED');
        const { data, error } = await reauthenticationClient.auth.signInWithPassword({
          email: user.email,
          password,
        });
        if (error || !data.session) throw new Error('REAUTHENTICATION_FAILED');
        await commitWithFreshSession(challenge, data.session);
        return;
      }

      if (kind === 'apple') {
        const result = await reauthenticateWithAppleForAccountDeletion(reauthenticationClient);
        if (!result?.session) throw new Error('REAUTHENTICATION_CANCELLED');
        await commitWithFreshSession(challenge, result.session, result.authorizationCode);
        return;
      }

      const outcome = await google.signIn();
      if (outcome.kind !== 'success') throw new Error('REAUTHENTICATION_CANCELLED');
      const { data } = await reauthenticationClient.auth.getSession();
      if (!data.session) throw new Error('REAUTHENTICATION_FAILED');
      await commitWithFreshSession(challenge, data.session);
    } catch (error) {
      if (
        error instanceof GlobalAccountDeletionError &&
        error.code === 'FRESH_REAUTHENTICATION_REQUIRED'
      ) {
        idempotencyKeyRef.current = Crypto.randomUUID();
      }
      setErrorMessage(t('accountDeletion.reauthenticationError'));
      captureMessage('global account deletion request failed', {
        level: 'warning',
        tags: { feature: 'accountDeletion', step: 'request' },
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      await reauthenticationClient.auth.signOut({ scope: 'local' }).catch(() => undefined);
      setPassword('');
      setBusy(null);
    }
  };

  const finishAndSignOut = async () => {
    try {
      await signOut();
    } catch {
      captureMessage('post-deletion sign out failed', {
        level: 'warning',
        tags: { feature: 'accountDeletion', step: 'sign_out' },
      });
    }
  };

  const resumeAppleRevocation = async () => {
    if (!receipt || !user?.id || appleRetryBusy) return;
    setAppleRetryBusy(true);
    setErrorMessage(null);
    try {
      const currentSession = session ?? (await supabase.auth.getSession()).data.session;
      if (!currentSession) throw new GlobalAccountDeletionError('UNAUTHENTICATED');
      let result: GlobalDeletionReceipt;
      try {
        result = await resumeGlobalAccountDeletionAppleRevocation(
          currentSession,
          receipt,
          idempotencyKeyRef.current,
        );
      } catch (error) {
        if (
          !(error instanceof GlobalAccountDeletionError) ||
          error.code !== 'APPLE_REAUTHENTICATION_REQUIRED' ||
          !requiresAppleReauthentication ||
          Platform.OS !== 'ios'
        ) {
          throw error;
        }
        const apple = await reauthenticateWithAppleForAccountDeletion(reauthenticationClient);
        if (!apple?.session || apple.session.user.id !== user.id) {
          throw new Error('REAUTHENTICATED_IDENTITY_MISMATCH', { cause: error });
        }
        result = await resumeGlobalAccountDeletionAppleRevocation(
          apple.session,
          receipt,
          idempotencyKeyRef.current,
          apple.authorizationCode,
        );
      }
      setReceipt(result);
      await persistGlobalDeletionState(user.id, result, idempotencyKeyRef.current);
      if (result.appleAuthorizationStatus === 'revoked') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    } catch {
      setErrorMessage(t('accountDeletion.appleRevocationRetryError'));
      captureMessage('global account deletion Apple revocation retry failed', {
        level: 'warning',
        tags: { feature: 'accountDeletion', step: 'apple_revocation_retry' },
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      await reauthenticationClient.auth.signOut({ scope: 'local' }).catch(() => undefined);
      setAppleRetryBusy(false);
    }
  };

  const shareReceipt = async () => {
    if (!receipt) return;
    await Share.share({
      message: t('accountDeletion.receiptShare', {
        receipt: receipt.receipt,
        dueDate: new Date(receipt.dueAt).toLocaleDateString(i18n.language),
      }),
    }).catch(() => {});
  };

  if (receipt) {
    return (
      <SafeAreaView style={[styles.container, isDark && styles.containerDark]}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={56} color={Colors.accent} />
          </View>
          <Text style={[styles.title, isDark && styles.textDark]}>
            {t('accountDeletion.receivedTitle')}
          </Text>
          <Text style={[styles.body, isDark && styles.textMuted]}>
            {t('accountDeletion.receivedMessage', {
              dueDate: new Date(receipt.dueAt).toLocaleDateString(i18n.language),
            })}
          </Text>
          <View style={[styles.receiptCard, isDark && styles.cardDark]}>
            <Text style={[styles.receiptLabel, isDark && styles.textMuted]}>
              {t('accountDeletion.receiptLabel')}
            </Text>
            <Text selectable style={[styles.receipt, isDark && styles.textDark]}>
              {receipt.receipt}
            </Text>
          </View>
          {receipt.appleAuthorizationStatus === 'retry_pending' ? (
            <>
              <Text
                style={[styles.appleStatusWarning, isDark && styles.textMuted]}
                accessibilityLiveRegion="polite"
                testID="account-deletion-apple-revocation-pending"
              >
                {t('accountDeletion.appleRevocationPending')}
              </Text>
              <TouchableOpacity
                style={[styles.secondaryButton, appleRetryBusy && styles.buttonDisabled]}
                disabled={appleRetryBusy}
                onPress={() => void resumeAppleRevocation()}
                accessibilityRole="button"
                testID="account-deletion-retry-apple-revocation"
              >
                {appleRetryBusy ? (
                  <ActivityIndicator color={Colors.accent} />
                ) : (
                  <Text style={styles.secondaryButtonText}>
                    {t('accountDeletion.retryAppleRevocation')}
                  </Text>
                )}
              </TouchableOpacity>
            </>
          ) : null}
          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          {localPurgeComplete === false ? (
            <Text style={styles.warningText}>{t('accountDeletion.localPurgeWarning')}</Text>
          ) : null}
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => void shareReceipt()}
            accessibilityRole="button"
            testID="account-deletion-share-receipt"
          >
            <Ionicons name="share-outline" size={18} color={Colors.accent} />
            <Text style={styles.secondaryButtonText}>{t('accountDeletion.shareReceipt')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => void finishAndSignOut()}
            accessibilityRole="button"
            testID="account-deletion-finish"
          >
            <Text style={styles.primaryButtonText}>{t('accountDeletion.finish')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, isDark && styles.containerDark]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('accountDeletion.back')}
          testID="account-deletion-back"
        >
          <Ionicons name="chevron-back" size={28} color={isDark ? Colors.white : Colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, isDark && styles.textDark]}>
          {t('accountDeletion.title')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.warningCard, isDark && styles.cardDark]}>
          <Ionicons name="warning-outline" size={26} color={Colors.coral} />
          <Text style={[styles.warningTitle, isDark && styles.textDark]}>
            {t('accountDeletion.wholeAccountTitle')}
          </Text>
          <Text style={[styles.body, isDark && styles.textMuted]}>
            {t('accountDeletion.wholeAccountMessage')}
          </Text>
        </View>

        <View style={styles.impactList}>
          {(['impactPragas', 'impactOtherApps', 'impactRetention', 'impactTimeline'] as const).map(
            (key) => (
              <View key={key} style={styles.impactRow}>
                <Ionicons name="ellipse" size={7} color={Colors.coral} />
                <Text style={[styles.impactText, isDark && styles.textMuted]}>
                  {t(`accountDeletion.${key}`)}
                </Text>
              </View>
            ),
          )}
        </View>

        <View style={[styles.acknowledgement, isDark && styles.cardDark]}>
          <Text style={[styles.acknowledgementText, isDark && styles.textDark]}>
            {t('accountDeletion.acknowledgement')}
          </Text>
          <Switch
            value={acknowledged}
            onValueChange={setAcknowledged}
            trackColor={{ false: Colors.systemGray4, true: Colors.coral }}
            accessibilityLabel={t('accountDeletion.acknowledgementA11y')}
            testID="account-deletion-acknowledge"
          />
        </View>

        <Text style={[styles.reauthTitle, isDark && styles.textDark]}>
          {t('accountDeletion.reauthenticateTitle')}
        </Text>
        <Text style={[styles.body, isDark && styles.textMuted]}>
          {t('accountDeletion.reauthenticateMessage')}
        </Text>

        {canUsePassword ? (
          <View style={styles.passwordGroup}>
            <TextInput
              style={[styles.input, isDark && styles.inputDark]}
              value={password}
              onChangeText={setPassword}
              placeholder={t('accountDeletion.passwordPlaceholder')}
              placeholderTextColor={Colors.systemGray2}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              accessibilityLabel={t('accountDeletion.passwordPlaceholder')}
              testID="account-deletion-password"
            />
            <TouchableOpacity
              style={[
                styles.destructiveButton,
                (!acknowledged || !password || busy) && styles.buttonDisabled,
              ]}
              disabled={!acknowledged || !password || Boolean(busy)}
              onPress={() => void runReauthentication('password')}
              accessibilityRole="button"
              testID="account-deletion-confirm-password"
            >
              {busy === 'password' ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.destructiveButtonText}>
                  {t('accountDeletion.confirmWithPassword')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}

        {canUseApple ? (
          <TouchableOpacity
            style={[styles.providerButton, (!acknowledged || busy) && styles.buttonDisabled]}
            disabled={!acknowledged || Boolean(busy)}
            onPress={() => void runReauthentication('apple')}
            accessibilityRole="button"
            testID="account-deletion-confirm-apple"
          >
            {busy === 'apple' ? (
              <ActivityIndicator color={Colors.text} />
            ) : (
              <>
                <Ionicons name="logo-apple" size={20} color={Colors.text} />
                <Text style={styles.providerButtonText}>
                  {t('accountDeletion.confirmWithApple')}
                </Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}

        {canUseGoogle ? (
          <TouchableOpacity
            style={[
              styles.providerButton,
              (!acknowledged || busy || !google.ready) && styles.buttonDisabled,
            ]}
            disabled={!acknowledged || Boolean(busy) || !google.ready}
            onPress={() => void runReauthentication('google')}
            accessibilityRole="button"
            testID="account-deletion-confirm-google"
          >
            {busy === 'google' ? (
              <ActivityIndicator color={Colors.text} />
            ) : (
              <>
                <Ionicons name="logo-google" size={20} color={Colors.text} />
                <Text style={styles.providerButtonText}>
                  {t('accountDeletion.confirmWithGoogle')}
                </Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}

        {!canUsePassword && !canUseApple && !canUseGoogle ? (
          <Text style={styles.warningText}>{t('accountDeletion.providerUnavailable')}</Text>
        ) : null}
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  containerDark: { backgroundColor: Colors.backgroundDark },
  header: {
    minHeight: 52,
    paddingHorizontal: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontFamily: FontFamily.semibold,
    fontWeight: FontWeight.semibold,
    fontSize: FontSize.headline,
    color: Colors.text,
  },
  headerSpacer: { width: 28 },
  content: { padding: Spacing.xl, paddingBottom: 60, gap: Spacing.lg },
  textDark: { color: Colors.white },
  textMuted: { color: Colors.systemGray2 },
  title: {
    fontFamily: FontFamily.bold,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.title,
    color: Colors.text,
    textAlign: 'center',
  },
  body: {
    fontFamily: FontFamily.regular,
    fontWeight: FontWeight.regular,
    fontSize: FontSize.subheadline,
    lineHeight: 21,
    color: Colors.textSecondary,
  },
  warningCard: {
    backgroundColor: '#FFF3F0',
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: '#F7C9BF',
  },
  cardDark: { backgroundColor: Colors.cardDark, borderColor: Colors.separatorDark },
  warningTitle: {
    fontFamily: FontFamily.semibold,
    fontWeight: FontWeight.semibold,
    fontSize: FontSize.headline,
    color: Colors.text,
  },
  impactList: { gap: Spacing.md },
  impactRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  impactText: {
    flex: 1,
    fontFamily: FontFamily.regular,
    fontWeight: FontWeight.regular,
    fontSize: FontSize.subheadline,
    lineHeight: 20,
    color: Colors.textSecondary,
  },
  acknowledgement: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.separator,
  },
  acknowledgementText: {
    flex: 1,
    fontFamily: FontFamily.medium,
    fontWeight: FontWeight.medium,
    fontSize: FontSize.subheadline,
    lineHeight: 20,
    color: Colors.text,
  },
  reauthTitle: {
    fontFamily: FontFamily.semibold,
    fontWeight: FontWeight.semibold,
    fontSize: FontSize.headline,
    color: Colors.text,
    marginTop: Spacing.sm,
  },
  passwordGroup: { gap: Spacing.md },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: Colors.separator,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    color: Colors.text,
    backgroundColor: Colors.white,
    fontFamily: FontFamily.regular,
    fontWeight: FontWeight.regular,
    fontSize: FontSize.body,
  },
  inputDark: {
    backgroundColor: Colors.cardDark,
    borderColor: Colors.separatorDark,
    color: Colors.white,
  },
  destructiveButton: {
    minHeight: 52,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  destructiveButtonText: {
    color: Colors.white,
    fontFamily: FontFamily.semibold,
    fontWeight: FontWeight.semibold,
    fontSize: FontSize.body,
    textAlign: 'center',
  },
  providerButton: {
    minHeight: 52,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.separator,
    backgroundColor: Colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  providerButtonText: {
    color: Colors.text,
    fontFamily: FontFamily.semibold,
    fontWeight: FontWeight.semibold,
    fontSize: FontSize.body,
  },
  buttonDisabled: { opacity: 0.45 },
  errorText: {
    color: Colors.coral,
    fontFamily: FontFamily.medium,
    fontWeight: FontWeight.medium,
    fontSize: FontSize.subheadline,
    lineHeight: 20,
    textAlign: 'center',
  },
  warningText: {
    color: Colors.earthText,
    fontFamily: FontFamily.medium,
    fontWeight: FontWeight.medium,
    fontSize: FontSize.subheadline,
    lineHeight: 20,
    textAlign: 'center',
  },
  successIcon: { alignItems: 'center', marginTop: Spacing.xxl },
  receiptCard: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.separator,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  receiptLabel: {
    fontFamily: FontFamily.medium,
    fontWeight: FontWeight.medium,
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  receipt: {
    fontFamily: FontFamily.semibold,
    fontWeight: FontWeight.semibold,
    fontSize: FontSize.subheadline,
    lineHeight: 22,
    color: Colors.text,
  },
  appleStatusWarning: {
    color: Colors.coral,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.footnote,
    lineHeight: 20,
    textAlign: 'center',
  },
  secondaryButton: {
    minHeight: 50,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.accent,
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: Colors.accent,
    fontFamily: FontFamily.semibold,
    fontWeight: FontWeight.semibold,
    fontSize: FontSize.body,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: Colors.white,
    fontFamily: FontFamily.semibold,
    fontWeight: FontWeight.semibold,
    fontSize: FontSize.body,
  },
});
