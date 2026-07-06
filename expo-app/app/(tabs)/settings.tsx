import React, { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { showAlert } from '../../services/dialog';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import * as Sentry from '@sentry/react-native';
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

const PUSH_ENABLED_KEY = '@rumo_pragas_push_enabled';

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
}: RowProps) {
  const isInteractive = !!onPress;
  return (
    <TouchableOpacity
      style={[styles.row, isLast && styles.rowLast]}
      onPress={onPress}
      disabled={!onPress && !trailing}
      activeOpacity={0.6}
      accessibilityLabel={label}
      accessibilityRole={isInteractive ? 'button' : 'none'}
      accessibilityValue={value ? { text: value } : undefined}
      accessibilityHint={accessibilityHint}
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
  const { user, signOut } = useAuthContext();
  const { isTablet, contentMaxWidth } = useResponsive();
  const { t, i18n } = useTranslation();
  const [pushEnabled, setPushEnabled] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const { isChecking, checkForUpdate } = useOTAUpdate();
  const userName = user?.user_metadata?.full_name || t('home.defaultUser');
  const userEmail = user?.email || '';

  // Load persisted push notification preference
  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(PUSH_ENABLED_KEY).then((value) => {
      if (mounted && value !== null) {
        setPushEnabled(value === 'true');
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Load avatar URL alongside subscription data (single round trip optimisation)
  useEffect(() => {
    if (!user?.id) return;
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase
          .from('pragas_profiles')
          .select('avatar_url')
          .eq('user_id', user.id)
          .maybeSingle();
        if (mounted && data?.avatar_url) setAvatarUrl(data.avatar_url);
      } catch {
        // Non-fatal: fall back to initial-letter avatar
      }
    })();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const handlePushToggle = useCallback((value: boolean) => {
    setPushEnabled(value);
    AsyncStorage.setItem(PUSH_ENABLED_KEY, String(value));
    Haptics.selectionAsync().catch(() => {});
  }, []);

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
    showAlert(t('settings.deleteConfirmTitle'), t('settings.deleteConfirmMessage'), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('settings.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            // LGPD Art. 18, V + Apple 5.1.1(v): immediate in-app deletion.
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

            if (sessionError || !sessionData?.session?.access_token) {
              showAlert(t('common.error'), t('settings.deletionError'));
              return;
            }

            const { data, error } = await supabase.functions.invoke('delete-user-account', {
              headers: {
                Authorization: `Bearer ${sessionData.session.access_token}`,
              },
            });

            if (error || !data?.ok) {
              if (__DEV__) console.error('delete-user-account failed:', error, data);
              Sentry.captureMessage('delete-user-account failed', {
                level: 'error',
                tags: { feature: 'settings.deleteAccount' },
              });
              showAlert(t('common.error'), t('settings.deletionError'));
              return;
            }

            await signOut();
            showAlert(t('settings.deletionReceived'), t('settings.deletionReceivedMessage'));
          } catch (e) {
            if (__DEV__) console.error('handleDeleteAccount exception:', e);
            Sentry.captureException(e, { tags: { feature: 'settings.deleteAccount' } });
            showAlert(t('common.error'), t('settings.deletionError'));
          }
        },
      },
    ]);
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
        <Section isDark={isDark} title={t('settings.sectionNotifications')}>
          <Row
            isDark={isDark}
            icon="notifications-outline"
            label={t('settings.pushNotifications')}
            trailing={
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
            icon="lock-closed-outline"
            label={t('auth.privacyPolicy')}
            onPress={() => router.push('/privacy')}
          />
          <Row
            isDark={isDark}
            icon="document-text-outline"
            label={t('auth.termsOfUse')}
            onPress={() => router.push('/terms')}
            isLast
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
            value={Constants.expoConfig?.version ?? '1.0.7'}
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
    padding: Spacing.lg,
  },
  profileCardDark: { backgroundColor: '#1C1C1E' },
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
    overflow: 'hidden',
  },
  sectionContentDark: { backgroundColor: '#1C1C1E' },
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
    minHeight: 52,
  },
  signOutBtnDark: { backgroundColor: '#1C1C1E' },
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
