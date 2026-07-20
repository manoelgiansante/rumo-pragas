import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Share,
  StyleSheet,
  useColorScheme,
  Platform,
  ActionSheetIOS,
  ActivityIndicator,
} from 'react-native';
import { showAlert } from '../../services/dialog';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import * as Crypto from 'expo-crypto';
import { useTranslation } from 'react-i18next';
import { captureMessage } from '../../services/sentry-shim';
import { LANGUAGE_KEY } from '../../i18n';
import {
  Colors,
  Spacing,
  BorderRadius,
  FontSize,
  FontWeight,
  FontFamily,
} from '../../constants/theme';
import { useAuthContext } from '../../contexts/AuthContext';
import { useResponsive } from '../../hooks/useResponsive';
import { useOTAUpdate } from '../../hooks/useOTAUpdate';
import { supabase } from '../../services/supabase';
import { Avatar } from '../../components/Avatar';
import { getPragasAvatarSignedUrl, parseOwnedLegacyAvatarUrl } from '../../services/avatar';
import {
  isPushNotificationsEnabled,
  isRemotePushBuildConfigured,
  setPushNotificationsEnabled,
} from '../../services/notifications';
import {
  getUserPreferences,
  setLocationConsent,
  LOCATION_CONSENT_PURPOSE,
} from '../../services/userPreferences';
import { useLocation } from '../../hooks/useLocation';
import {
  deliverPragasUserDataExport,
  requestPragasUserDataExport,
  UserDataExportError,
} from '../../services/userDataExport';
import {
  AIConsentPurpose,
  hasAIConsent,
  revokeAIConsentEverywhere,
} from '../../services/aiConsent';

const LANGUAGE_OPTIONS: { code: string; label: string }[] = [
  { code: 'pt-BR', label: 'Português' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
];

const LANGUAGE_DISPLAY: Record<string, string> = {
  'pt-BR': 'Português',
  en: 'English',
  es: 'Español',
};

// ============================================================================
// Section primitives (native-feel layout)
// ============================================================================

interface SectionProps {
  title: string;
  children: React.ReactNode;
  isDark: boolean;
  footer?: string;
}

function Section({ title, children, isDark, footer }: SectionProps) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, isDark && styles.textMuted]}>{title}</Text>
      <View style={[styles.sectionContent, isDark && styles.sectionContentDark]}>{children}</View>
      {footer ? (
        <Text style={[styles.sectionFooter, isDark && styles.textMuted]}>{footer}</Text>
      ) : null}
    </View>
  );
}

interface RowProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string | undefined;
  label: string;
  value?: string | undefined;
  onPress?: (() => void) | undefined;
  trailing?: React.ReactNode | undefined;
  isDark: boolean;
  destructive?: boolean | undefined;
  isLast?: boolean | undefined;
  testID?: string | undefined;
  accessibilityHint?: string | undefined;
  busy?: boolean | undefined;
}

function Row({
  icon,
  iconColor,
  label,
  value,
  onPress,
  trailing,
  isDark,
  destructive,
  isLast,
  testID,
  accessibilityHint,
  busy,
}: RowProps) {
  const isInteractive = !!onPress && !busy;
  return (
    <TouchableOpacity
      style={[styles.row, isLast && styles.rowLast]}
      onPress={isInteractive ? onPress : undefined}
      disabled={busy || (!onPress && !trailing)}
      activeOpacity={0.6}
      accessibilityLabel={label}
      accessibilityRole={isInteractive ? 'button' : 'none'}
      accessibilityValue={value ? { text: value } : undefined}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!busy, busy: !!busy }}
      testID={testID}
    >
      <View style={[styles.rowIconWrap, { backgroundColor: (iconColor ?? Colors.accent) + '14' }]}>
        <Ionicons
          name={icon}
          size={17}
          color={destructive ? Colors.coral : (iconColor ?? Colors.accent)}
        />
      </View>
      <Text
        style={[
          styles.rowLabel,
          isDark && styles.textDark,
          destructive && styles.rowLabelDestructive,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {value ? (
        <Text style={[styles.rowValue, isDark && styles.rowValueDark]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {trailing}
      {isInteractive && !trailing ? (
        <Ionicons name="chevron-forward" size={16} color={Colors.systemGray3} />
      ) : null}
    </TouchableOpacity>
  );
}

// ============================================================================
// Settings screen
// ============================================================================

export default function SettingsScreen() {
  const isDark = useColorScheme() === 'dark';
  const { user, session, signOut } = useAuthContext();
  const { isTablet, contentMaxWidth } = useResponsive();
  const { t, i18n } = useTranslation();
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushPreferenceLoading, setPushPreferenceLoading] = useState(true);
  const [locationSharing, setLocationSharing] = useState(false);
  const [locationPreferenceLoading, setLocationPreferenceLoading] = useState(true);
  const [locationPreferenceSaving, setLocationPreferenceSaving] = useState(false);
  const [exportingData, setExportingData] = useState(false);
  const [aiConsentLoading, setAIConsentLoading] = useState(true);
  const [aiConsentSaving, setAIConsentSaving] = useState<AIConsentPurpose | null>(null);
  const [aiConsentState, setAIConsentState] = useState<Record<AIConsentPurpose, boolean>>({
    diagnosis: false,
    chat: false,
  });
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const { isChecking, checkForUpdate } = useOTAUpdate();
  const { requestPermission } = useLocation();
  const exportIdempotencyKeyRef = useRef(Crypto.randomUUID());
  const userName = user?.user_metadata?.full_name || t('home.defaultUser');
  const userEmail = user?.email || '';

  // Load persisted push notification preference
  useEffect(() => {
    let mounted = true;
    isPushNotificationsEnabled().then((value) => {
      if (mounted) {
        setPushEnabled(value);
        setPushPreferenceLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Load a short-lived URL from the private Pragas avatar bucket.
  useEffect(() => {
    if (!user?.id) return;
    let mounted = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('pragas_profiles')
          .select('avatar_path, avatar_url')
          .eq('user_id', user.id)
          .maybeSingle();
        if (error || !data) return;
        const signed = await getPragasAvatarSignedUrl(user.id, data.avatar_path ?? null);
        const legacy = parseOwnedLegacyAvatarUrl(user.id, data.avatar_url ?? null)
          ? data.avatar_url
          : null;
        if (mounted) setAvatarUrl(signed ?? legacy);
      } catch {
        // Non-fatal: fall back to initial-letter avatar
      }
    })();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  useEffect(() => {
    let mounted = true;
    setAIConsentLoading(true);
    setAIConsentState({ diagnosis: false, chat: false });
    if (!user?.id) {
      setAIConsentLoading(false);
      return () => {
        mounted = false;
      };
    }
    Promise.all([hasAIConsent(user.id, 'diagnosis'), hasAIConsent(user.id, 'chat')]).then(
      ([diagnosis, chat]) => {
        if (!mounted) return;
        setAIConsentState({ diagnosis, chat });
        setAIConsentLoading(false);
      },
    );
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  useEffect(() => {
    let mounted = true;
    setLocationPreferenceLoading(true);
    setLocationSharing(false);
    if (!user?.id) {
      setLocationPreferenceLoading(false);
      return () => {
        mounted = false;
      };
    }
    getUserPreferences(user.id).then((preferences) => {
      if (!mounted) return;
      setLocationSharing(preferences.share_location === true);
      setLocationPreferenceLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const handlePushToggle = useCallback(
    async (value: boolean) => {
      const previous = pushEnabled;
      setPushEnabled(value);
      try {
        const actual = await setPushNotificationsEnabled(value);
        setPushEnabled(actual);
        if (value && !actual) {
          showAlert(t('common.error'), t('settings.notificationsPermissionDenied'));
        }
        Haptics.selectionAsync().catch(() => {});
      } catch {
        setPushEnabled(previous);
        showAlert(t('common.error'), t('settings.pushPreferenceError'));
      }
    },
    [pushEnabled, t],
  );

  const persistLocationPreference = useCallback(
    async (enabled: boolean) => {
      if (!user?.id || locationPreferenceSaving) return;
      setLocationPreferenceSaving(true);
      const previousValue = locationSharing;
      setLocationSharing(enabled);
      try {
        await setLocationConsent(user.id, enabled, LOCATION_CONSENT_PURPOSE);
        setLocationSharing(enabled);
        Haptics.selectionAsync().catch(() => {});
      } catch {
        setLocationSharing(previousValue);
        captureMessage('location preference save failed', {
          level: 'warning',
          tags: { feature: 'settings.locationConsent', action: enabled ? 'grant' : 'revoke' },
        });
        showAlert(t('common.error'), t('settings.locationPreferenceError'));
      } finally {
        setLocationPreferenceSaving(false);
      }
    },
    [locationPreferenceSaving, locationSharing, t, user?.id],
  );

  const handleLocationToggle = useCallback(
    (enabled: boolean) => {
      if (!enabled) {
        void persistLocationPreference(false);
        return;
      }
      showAlert(t('settings.locationDisclosureTitle'), t('settings.locationDisclosureMessage'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.locationAllow'),
          onPress: () => {
            void (async () => {
              setLocationPreferenceSaving(true);
              let granted: boolean;
              try {
                granted = await requestPermission();
              } catch {
                granted = false;
              } finally {
                setLocationPreferenceSaving(false);
              }
              if (!granted) {
                showAlert(
                  t('settings.locationPermissionDeniedTitle'),
                  t('settings.locationPermissionDeniedMessage'),
                );
                return;
              }
              await persistLocationPreference(true);
            })();
          },
        },
      ]);
    },
    [persistLocationPreference, requestPermission, t],
  );

  const handleAIConsentToggle = useCallback(
    async (purpose: AIConsentPurpose, enabled: boolean) => {
      if (!user?.id || aiConsentSaving) return;
      if (enabled) {
        showAlert(t('settings.aiConsentTitle'), t('settings.aiConsentReacceptAtUse'));
        return;
      }
      setAIConsentSaving(purpose);
      try {
        await revokeAIConsentEverywhere(user.id, purpose);
        setAIConsentState((current) => ({ ...current, [purpose]: false }));
        showAlert(t('settings.aiConsentRevokedTitle'), t('settings.aiConsentRevoked'));
      } catch {
        // Do not claim withdrawal or flip the UI after a server/local partial
        // failure. Retry uses an idempotent server RPC.
        showAlert(t('common.error'), t('settings.aiConsentRevokeError'));
      } finally {
        setAIConsentSaving(null);
      }
    },
    [aiConsentSaving, t, user?.id],
  );

  const handleExportData = useCallback(async () => {
    if (exportingData) return;
    let accessToken = session?.access_token ?? '';
    if (!accessToken) {
      const { data } = await supabase.auth.getSession();
      accessToken = data.session?.access_token ?? '';
    }
    if (!accessToken) {
      showAlert(t('common.error'), t('settings.exportUnavailableError'));
      return;
    }
    setExportingData(true);
    try {
      const result = await requestPragasUserDataExport(
        accessToken,
        exportIdempotencyKeyRef.current,
      );
      await deliverPragasUserDataExport(
        result.json,
        result.filename,
        t('settings.exportShareTitle'),
      );
      exportIdempotencyKeyRef.current = Crypto.randomUUID();
      showAlert(t('settings.exportSuccessTitle'), t('settings.exportSuccessMessage'));
    } catch (error) {
      captureMessage('data export failed', {
        level: 'warning',
        tags: {
          feature: 'settings.exportData',
          code: error instanceof UserDataExportError ? error.code : 'unexpected',
        },
      });
      const incomplete =
        error instanceof UserDataExportError &&
        (error.code === 'invalid_export' || error.code === 'too_large');
      showAlert(
        t('common.error'),
        t(incomplete ? 'settings.exportIncompleteError' : 'settings.exportUnavailableError'),
      );
    } finally {
      setExportingData(false);
    }
  }, [exportingData, session?.access_token, t]);

  const handleLanguageChange = useCallback(() => {
    const options = LANGUAGE_OPTIONS.map((opt) => opt.label);

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...options, t('common.cancel')],
          cancelButtonIndex: options.length,
          title: t('settings.languageTitle'),
        },
        (buttonIndex) => {
          if (buttonIndex < options.length) {
            // options is derived 1:1 from LANGUAGE_OPTIONS, so this index is
            // in-bounds; assert for noUncheckedIndexedAccess (runtime unchanged).
            const selected = LANGUAGE_OPTIONS[buttonIndex]!.code;
            i18n.changeLanguage(selected);
            AsyncStorage.setItem(LANGUAGE_KEY, selected);
          }
        },
      );
    } else {
      showAlert(t('settings.languageTitle'), undefined, [
        ...LANGUAGE_OPTIONS.map((opt) => ({
          text: opt.label,
          onPress: () => {
            i18n.changeLanguage(opt.code);
            AsyncStorage.setItem(LANGUAGE_KEY, opt.code);
          },
        })),
        { text: t('common.cancel'), style: 'cancel' as const },
      ]);
    }
  }, [i18n, t]);

  const handleSignOut = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    showAlert(t('settings.signOutConfirmTitle'), t('settings.signOutConfirmMessage'), [
      { text: t('settings.cancel'), style: 'cancel' },
      { text: t('settings.signOut'), style: 'destructive', onPress: signOut },
    ]);
  };

  const handleDeleteAccount = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    router.push('/account-deletion');
  };

  const openMail = () => {
    // A device without a configured mail client (e.g. an App Review iPad)
    // rejects openURL — guard it so it never becomes an unhandled rejection.
    import('expo-linking')
      .then(({ openURL }) =>
        openURL(
          `mailto:suporte@agrorumo.com?subject=${encodeURIComponent(t('settings.supportSubject'))}`,
        ),
      )
      .catch(() => {
        showAlert(t('settings.support'), 'suporte@agrorumo.com');
      });
  };

  const openTutorials = () => {
    import('expo-linking')
      .then(({ openURL }) => openURL('https://tutoriais.pragas.agrorumo.com'))
      .catch(() => {
        showAlert(t('settings.videoTutorials'), 'tutoriais.pragas.agrorumo.com');
      });
  };

  const handleShareApp = () => {
    const url =
      Platform.OS === 'ios'
        ? 'https://apps.apple.com/br/app/id6762232682'
        : 'https://play.google.com/store/apps/details?id=com.agrorumo.rumopragas';
    Share.share({ message: `${t('settings.shareMessage')} ${url}` }).catch(() => {
      /* usuário cancelou o share sheet — não é erro */
    });
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.container, isDark && styles.containerDark]}>
      <ScrollView
        style={styles.flex}
        showsVerticalScrollIndicator={false}
        // Web desktop / iPad: mesma largura máxima dos outros tabs — sem isso as
        // linhas de ajuste esticavam a tela inteira (mobile esticado).
        contentContainerStyle={
          isTablet
            ? { maxWidth: contentMaxWidth, alignSelf: 'center' as const, width: '100%' }
            : undefined
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, isDark && styles.textDark]} accessibilityRole="header">
            {t('settings.headerTitle')}
          </Text>
        </View>

        {/* Profile card */}
        <View style={[styles.profileCard, isDark && styles.profileCardDark]}>
          <Avatar uri={avatarUrl} name={userName} size={64} />
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, isDark && styles.textDark]} numberOfLines={1}>
              {userName}
            </Text>
            <Text style={styles.profileEmail} numberOfLines={1}>
              {userEmail}
            </Text>
            <View style={styles.roleBadge}>
              <Ionicons name="shield-checkmark" size={11} color={Colors.accent} />
              <Text style={styles.roleText}>{t('settings.farmerRole')}</Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => router.push('/edit-profile')}
            style={styles.editProfileIcon}
            accessibilityRole="button"
            accessibilityLabel={t('settings.editProfile')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            testID="settings-edit-profile"
          >
            <Ionicons name="create-outline" size={20} color={Colors.accent} />
          </TouchableOpacity>
        </View>

        {/* ACCOUNT */}
        <Section isDark={isDark} title={t('settings.sectionAccount')}>
          <Row
            isDark={isDark}
            icon="person-circle-outline"
            label={t('settings.editProfile')}
            onPress={() => router.push('/edit-profile')}
            isLast
            testID="settings-row-edit-profile"
          />
        </Section>

        {/* PREFERENCES */}
        <Section isDark={isDark} title={t('settings.sectionPreferences')}>
          <Row
            isDark={isDark}
            icon="globe-outline"
            label={t('settings.language')}
            value={LANGUAGE_DISPLAY[i18n.language] || i18n.language}
            onPress={handleLanguageChange}
            isLast
            testID="settings-row-language"
          />
        </Section>

        {/* NOTIFICATIONS */}
        <Section
          isDark={isDark}
          title={t('settings.sectionNotifications')}
          {...(Platform.OS === 'android' && !isRemotePushBuildConfigured()
            ? { footer: t('settings.androidLocalNotificationsOnly') }
            : {})}
        >
          <Row
            isDark={isDark}
            icon="notifications-outline"
            label={t('settings.pushNotifications')}
            trailing={
              pushPreferenceLoading ? (
                <ActivityIndicator color={Colors.accent} />
              ) : (
                <Switch
                  value={pushEnabled}
                  onValueChange={handlePushToggle}
                  trackColor={{ true: Colors.accent, false: Colors.systemGray4 }}
                  ios_backgroundColor={Colors.systemGray4}
                  accessibilityLabel={t('settings.pushNotifA11y')}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: pushEnabled }}
                  testID="settings-switch-push"
                />
              )
            }
            isLast
          />
        </Section>

        {/* PRIVACY */}
        <Section
          isDark={isDark}
          title={t('settings.sectionPrivacy')}
          footer={t('settings.privacyFooter')}
        >
          <Row
            isDark={isDark}
            icon="location-outline"
            label={t('settings.locationSharing')}
            trailing={
              locationPreferenceLoading ? (
                <ActivityIndicator color={Colors.accent} />
              ) : (
                <Switch
                  value={locationSharing}
                  onValueChange={handleLocationToggle}
                  disabled={locationPreferenceSaving}
                  trackColor={{ true: Colors.accent, false: Colors.systemGray4 }}
                  ios_backgroundColor={Colors.systemGray4}
                  accessibilityLabel={t('settings.locationSharingA11y')}
                  accessibilityHint={t('settings.locationSharingHint')}
                  accessibilityRole="switch"
                  accessibilityState={{
                    checked: locationSharing,
                    disabled: locationPreferenceSaving,
                    busy: locationPreferenceSaving,
                  }}
                  testID="settings-switch-location"
                />
              )
            }
          />
          <Row
            isDark={isDark}
            icon="camera-outline"
            label={t('settings.aiConsentDiagnosis')}
            trailing={
              aiConsentLoading ? (
                <ActivityIndicator color={Colors.accent} />
              ) : (
                <Switch
                  value={aiConsentState.diagnosis}
                  disabled={aiConsentSaving !== null}
                  onValueChange={(value) => void handleAIConsentToggle('diagnosis', value)}
                  accessibilityLabel={t('settings.aiConsentDiagnosisA11y')}
                  accessibilityRole="switch"
                  accessibilityState={{
                    checked: aiConsentState.diagnosis,
                    disabled: aiConsentSaving !== null,
                  }}
                  testID="settings-switch-ai-consent-diagnosis"
                />
              )
            }
          />
          <Row
            isDark={isDark}
            icon="chatbubble-ellipses-outline"
            label={t('settings.aiConsentChat')}
            trailing={
              aiConsentLoading ? (
                <ActivityIndicator color={Colors.accent} />
              ) : (
                <Switch
                  value={aiConsentState.chat}
                  disabled={aiConsentSaving !== null}
                  onValueChange={(value) => void handleAIConsentToggle('chat', value)}
                  accessibilityLabel={t('settings.aiConsentChatA11y')}
                  accessibilityRole="switch"
                  accessibilityState={{
                    checked: aiConsentState.chat,
                    disabled: aiConsentSaving !== null,
                  }}
                  testID="settings-switch-ai-consent-chat"
                />
              )
            }
          />
          <Row
            isDark={isDark}
            icon="download-outline"
            label={t('settings.exportData')}
            onPress={handleExportData}
            trailing={exportingData ? <ActivityIndicator color={Colors.accent} /> : undefined}
            busy={exportingData}
            testID="settings-row-export-data"
            accessibilityHint={t('settings.exportDataHint')}
          />
          <Row
            isDark={isDark}
            icon="lock-closed-outline"
            label={t('auth.privacyPolicy')}
            onPress={() => router.push('/privacy')}
            testID="settings-row-privacy-policy"
          />
          <Row
            isDark={isDark}
            icon="document-text-outline"
            label={t('auth.termsOfUse')}
            onPress={() => router.push('/terms')}
            isLast
            testID="settings-row-terms"
          />
        </Section>

        {/* ABOUT */}
        <Section isDark={isDark} title={t('settings.sectionAbout')}>
          <Row
            isDark={isDark}
            icon="refresh-outline"
            label={isChecking ? t('settings.checking') : t('settings.checkUpdates')}
            onPress={checkForUpdate}
          />
          <Row
            isDark={isDark}
            icon="mail-outline"
            label={t('settings.contactSupport')}
            onPress={openMail}
          />
          <Row
            isDark={isDark}
            icon="share-social-outline"
            label={t('settings.shareApp')}
            onPress={handleShareApp}
            testID="settings-row-share-app"
          />
          <Row
            isDark={isDark}
            icon="play-circle-outline"
            label={t('settings.videoTutorials')}
            onPress={openTutorials}
            testID="settings-row-tutorials"
          />
          <Row
            isDark={isDark}
            icon="information-circle-outline"
            label={t('settings.version')}
            // Read the real runtime version only — a hardcoded fallback showed a
            // stale/wrong version whenever it kicked in. expoConfig.version is
            // always populated from app.json in a real build.
            value={Constants.expoConfig?.version}
            isLast
          />
        </Section>

        {/* DESTRUCTIVE — Sign out + Delete account */}
        <View style={styles.dangerZone}>
          <TouchableOpacity
            style={[styles.signOutBtn, isDark && styles.signOutBtnDark]}
            onPress={handleSignOut}
            accessibilityLabel={t('settings.signOutA11y')}
            accessibilityRole="button"
            activeOpacity={0.7}
            testID="settings-sign-out"
          >
            <Ionicons name="log-out-outline" size={18} color={Colors.coral} />
            <Text style={styles.signOutText}>{t('settings.signOut')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.deleteAccountBtn}
            onPress={handleDeleteAccount}
            accessibilityLabel={t('settings.deleteAccountA11y')}
            accessibilityRole="button"
            accessibilityHint={t('settings.deleteAccountHint')}
            activeOpacity={0.85}
            testID="settings-delete-account"
          >
            <Ionicons name="trash-outline" size={16} color={Colors.coral} />
            <Text style={styles.deleteAccountText}>{t('settings.deleteAccount')}</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 64 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  containerDark: { backgroundColor: Colors.backgroundDark },
  flex: { flex: 1 },
  // paddingHorizontal alinhado ao large title de Histórico/Biblioteca (16pt)
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerTitle: {
    fontSize: FontSize.largeTitle,
    fontFamily: FontFamily.bold,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },

  // Profile card
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.separator,
    padding: Spacing.lg,
  },
  profileCardDark: { backgroundColor: '#1C1C1E', borderColor: Colors.separatorDark },
  profileInfo: { flex: 1, minWidth: 0 },
  profileName: {
    fontSize: FontSize.headline,
    fontFamily: FontFamily.semibold,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
  profileEmail: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    alignSelf: 'flex-start',
    backgroundColor: Colors.accent + '14',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  roleText: {
    fontSize: FontSize.caption2,
    fontFamily: FontFamily.semibold,
    fontWeight: FontWeight.semibold,
    color: Colors.accent,
  },
  editProfileIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.accent + '14',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Sections
  section: { marginTop: Spacing.xxl },
  sectionTitle: {
    fontSize: FontSize.caption,
    fontFamily: FontFamily.semibold,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingHorizontal: Spacing.xxl,
    marginBottom: 8,
  },
  sectionContent: {
    backgroundColor: Colors.card,
    marginHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.separator,
    overflow: 'hidden',
  },
  sectionContentDark: { backgroundColor: '#1C1C1E', borderColor: Colors.separatorDark },
  sectionFooter: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.caption,
    color: Colors.textTertiary,
    paddingHorizontal: Spacing.xxl,
    marginTop: 8,
    lineHeight: 16,
  },

  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: Spacing.lg,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.separator,
    minHeight: 52,
  },
  rowLast: { borderBottomWidth: 0 },
  rowIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowLabel: {
    fontFamily: FontFamily.regular,
    flex: 1,
    fontSize: FontSize.body,
    color: Colors.text,
  },
  rowLabelDestructive: {
    color: Colors.coral,
    fontFamily: FontFamily.semibold,
    fontWeight: FontWeight.semibold,
  },
  rowValue: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.subheadline,
    color: Colors.textSecondary,
    maxWidth: 160,
  },
  rowValueDark: { color: Colors.systemGray2 },

  // Destructive
  dangerZone: { marginTop: Spacing.xxl, paddingHorizontal: Spacing.lg, gap: 10 },
  signOutBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    padding: Spacing.lg,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.separator,
    minHeight: 52,
  },
  signOutBtnDark: { backgroundColor: '#1C1C1E', borderColor: Colors.separatorDark },
  signOutText: {
    fontSize: FontSize.subheadline,
    fontFamily: FontFamily.semibold,
    fontWeight: FontWeight.semibold,
    color: Colors.coral,
  },
  deleteAccountBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: BorderRadius.lg,
  },
  deleteAccountText: {
    fontSize: FontSize.footnote,
    fontFamily: FontFamily.medium,
    fontWeight: FontWeight.medium,
    color: Colors.coral,
    textDecorationLine: 'underline',
  },
  textDark: { color: Colors.textDark },
  textMuted: { color: Colors.systemGray },
});
