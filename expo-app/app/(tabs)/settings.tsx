import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  StyleSheet,
  useColorScheme,
  ActivityIndicator,
  Platform,
  ActionSheetIOS,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  Gradients,
} from '../../constants/theme';
import { useAuthContext } from '../../contexts/AuthContext';
import { useOTAUpdate } from '../../hooks/useOTAUpdate';
import { supabase } from '../../services/supabase';
import { restorePurchases, isRevenueCatConfigured } from '../../services/purchases';
import { Avatar } from '../../components/Avatar';

const PUSH_ENABLED_KEY = '@rumo_pragas_push_enabled';

const PLAN_LIMITS: Record<string, number> = {
  free: 3,
  pro: 30,
  enterprise: -1,
};

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
// Section primitives (premium native-feel layout)
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
  iconColor?: string;
  label: string;
  value?: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
  isDark: boolean;
  destructive?: boolean;
  isLast?: boolean;
  testID?: string;
  accessibilityHint?: string;
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
// Subscription hero card (top of Settings)
// ============================================================================

interface SubCardProps {
  plan: string;
  planLabel: string;
  used: number;
  limit: number;
  loading: boolean;
  error: boolean;
  onUpgrade: () => void;
  onRetry: () => void;
}

function SubscriptionCard({
  plan,
  planLabel,
  used,
  limit,
  loading,
  error,
  onUpgrade,
  onRetry,
}: SubCardProps) {
  const { t } = useTranslation();
  const isPro = plan !== 'free';
  const remaining = limit === -1 ? Infinity : Math.max(0, limit - used);

  if (error && !loading) {
    return (
      <TouchableOpacity style={styles.subErrorCard} onPress={onRetry} activeOpacity={0.7}>
        <Ionicons name="cloud-offline-outline" size={22} color={Colors.coral} />
        <View style={{ flex: 1 }}>
          <Text style={styles.subErrorTitle}>{t('settings.subLoadError')}</Text>
          <Text style={styles.subErrorSub}>{t('settings.subLoadRetry')}</Text>
        </View>
        <Ionicons name="refresh" size={20} color={Colors.coral} />
      </TouchableOpacity>
    );
  }

  return (
    <LinearGradient
      colors={Gradients.hero}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.subCard}
    >
      <View style={styles.subCardHeader}>
        <View style={styles.subBadge}>
          <Ionicons
            name={isPro ? 'diamond' : 'leaf-outline'}
            size={14}
            color={isPro ? Colors.warmAmber : '#FFF'}
          />
          <Text style={styles.subBadgeText}>{planLabel}</Text>
        </View>
        {loading ? (
          <ActivityIndicator size="small" color="#FFF" />
        ) : (
          <Text style={styles.subUsage}>
            {limit === -1
              ? t('settings.diagnosticsCountUnlimited', { used })
              : t('settings.diagnosticsCountLimited', { used, limit })}
          </Text>
        )}
      </View>

      {limit !== -1 && !loading ? (
        <View style={styles.usageBarTrack}>
          <View
            style={[styles.usageBarFill, { width: `${Math.min(100, (used / limit) * 100)}%` }]}
          />
        </View>
      ) : null}

      <Text style={styles.subTagline}>
        {isPro ? t('settings.subTaglinePro') : t('settings.subTaglineFree')}
      </Text>

      {!isPro && !loading ? (
        <TouchableOpacity
          style={styles.subCta}
          onPress={onUpgrade}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('settings.upgradePlan')}
          testID="settings-upgrade-cta"
        >
          <Text style={styles.subCtaText}>{t('settings.upgradePlan')}</Text>
          <Ionicons name="arrow-forward" size={16} color={Colors.accent} />
        </TouchableOpacity>
      ) : null}

      {isPro && remaining !== Infinity ? (
        <Text style={styles.subRemaining}>{t('settings.diagnosticsRemaining', { remaining })}</Text>
      ) : null}
    </LinearGradient>
  );
}

// ============================================================================
// Settings screen
// ============================================================================

export default function SettingsScreen() {
  const isDark = useColorScheme() === 'dark';
  const { user, signOut } = useAuthContext();
  const { t, i18n } = useTranslation();
  const [pushEnabled, setPushEnabled] = useState(true);
  const [plan, setPlan] = useState<string>('free');
  const [usedThisMonth, setUsedThisMonth] = useState<number>(0);
  const [subLoading, setSubLoading] = useState(true);
  const [subError, setSubError] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const subLoadingRef = useRef(false);
  const [restoring, setRestoring] = useState(false);
  const { isChecking, checkForUpdate } = useOTAUpdate();
  const userName = user?.user_metadata?.full_name || t('home.defaultUser');
  const userEmail = user?.email || '';

  const PLAN_LABELS: Record<string, string> = useMemo(
    () => ({
      free: t('settings.planFree'),
      pro: t('settings.planPro'),
      enterprise: t('settings.planEnterprise'),
    }),
    [t],
  );

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
          .eq('id', user.id)
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
            const selected = LANGUAGE_OPTIONS[buttonIndex].code;
            i18n.changeLanguage(selected);
            AsyncStorage.setItem(LANGUAGE_KEY, selected);
          }
        },
      );
    } else {
      Alert.alert(t('settings.languageTitle'), undefined, [
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

  const loadSubscriptionData = useCallback(async () => {
    if (!user || subLoadingRef.current) return;
    subLoadingRef.current = true;
    setSubLoading(true);
    setSubError(false);
    try {
      const now = new Date();
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [subResult, countResult] = await Promise.all([
        supabase.from('subscriptions').select('plan, status').eq('user_id', user.id).maybeSingle(),
        supabase
          .from('pragas_diagnoses')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gte('created_at', firstOfMonth),
      ]);

      const currentPlan = (subResult.data?.status === 'active' && subResult.data?.plan) || 'free';
      setPlan(currentPlan);
      setUsedThisMonth(countResult.count ?? 0);
    } catch (e) {
      if (__DEV__) console.error('Failed to load subscription data:', e);
      Sentry.captureException(e, { tags: { feature: 'settings.subscription' } });
      setSubError(true);
    } finally {
      subLoadingRef.current = false;
      setSubLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadSubscriptionData();
  }, [loadSubscriptionData]);

  // Apple 3.1.2 / Google Play: deep link to store-managed subscription
  const openManageSubscription = useCallback(() => {
    const url =
      Platform.OS === 'ios'
        ? 'itms-apps://apps.apple.com/account/subscriptions'
        : 'https://play.google.com/store/account/subscriptions';
    Linking.openURL(url).catch(() => {
      Alert.alert(t('common.error'), t('settings.manageSubscriptionError'));
    });
  }, [t]);

  const handleRestorePurchases = useCallback(async () => {
    if (!isRevenueCatConfigured()) return;
    setRestoring(true);
    Haptics.selectionAsync().catch(() => {});
    try {
      const customerInfo = await restorePurchases();
      if (customerInfo) {
        const hasActive =
          customerInfo.entitlements.active['pro'] || customerInfo.entitlements.active['enterprise'];
        if (hasActive) {
          Alert.alert(t('paywall.purchasesRestored'), t('paywall.subscriptionReactivated'), [
            { text: 'OK', onPress: loadSubscriptionData },
          ]);
        } else {
          Alert.alert(t('paywall.noSubscriptionFound'), t('paywall.noSubscriptionFoundMsg'));
        }
      }
    } catch (e) {
      Sentry.captureException(e, { tags: { feature: 'settings.restorePurchases' } });
      Alert.alert(t('common.error'), t('paywall.restoreError'));
    } finally {
      setRestoring(false);
    }
  }, [t, loadSubscriptionData]);

  const handleSignOut = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    Alert.alert(t('settings.signOutConfirmTitle'), t('settings.signOutConfirmMessage'), [
      { text: t('settings.cancel'), style: 'cancel' },
      { text: t('settings.signOut'), style: 'destructive', onPress: signOut },
    ]);
  };

  const handleDeleteAccount = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    Alert.alert(t('settings.deleteConfirmTitle'), t('settings.deleteConfirmMessage'), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('settings.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            // LGPD Art. 18, V + Apple 5.1.1(v): immediate in-app deletion.
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

            if (sessionError || !sessionData?.session?.access_token) {
              Alert.alert(t('common.error'), t('settings.deletionError'));
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
              Alert.alert(t('common.error'), t('settings.deletionError'));
              return;
            }

            await signOut();
            Alert.alert(t('settings.deletionReceived'), t('settings.deletionReceivedMessage'));
          } catch (e) {
            if (__DEV__) console.error('handleDeleteAccount exception:', e);
            Sentry.captureException(e, { tags: { feature: 'settings.deleteAccount' } });
            Alert.alert(t('common.error'), t('settings.deletionError'));
          }
        },
      },
    ]);
  };

  const openMail = () => {
    import('expo-linking').then(({ openURL }) =>
      openURL(
        `mailto:suporte@agrorumo.com.br?subject=${encodeURIComponent(t('settings.supportSubject'))}`,
      ),
    );
  };

  return (
    <ScrollView
      style={[styles.container, isDark && styles.containerDark]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
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

      {/* Subscription hero */}
      <View style={styles.subCardWrap}>
        <SubscriptionCard
          plan={plan}
          planLabel={PLAN_LABELS[plan] || plan}
          used={usedThisMonth}
          limit={PLAN_LIMITS[plan] ?? 0}
          loading={subLoading}
          error={subError}
          onRetry={loadSubscriptionData}
          onUpgrade={() => router.push('/paywall')}
        />
      </View>

      {/* ACCOUNT */}
      <Section isDark={isDark} title={t('settings.sectionAccount')}>
        <Row
          isDark={isDark}
          icon="person-circle-outline"
          label={t('settings.editProfile')}
          onPress={() => router.push('/edit-profile')}
          testID="settings-row-edit-profile"
        />
        {isRevenueCatConfigured() && (
          <Row
            isDark={isDark}
            icon="refresh-circle-outline"
            label={restoring ? t('common.loading') : t('paywall.restorePurchases')}
            onPress={restoring ? undefined : handleRestorePurchases}
            trailing={
              restoring ? <ActivityIndicator size="small" color={Colors.accent} /> : undefined
            }
            testID="settings-row-restore"
          />
        )}
        {!subLoading && plan !== 'free' && (
          <Row
            isDark={isDark}
            icon="card-outline"
            label={t('settings.manageSubscription')}
            onPress={openManageSubscription}
            isLast
            testID="settings-row-manage-sub"
          />
        )}
      </Section>

      {/* PREFERENCES */}
      <Section isDark={isDark} title={t('settings.sectionPreferences')}>
        <Row
          isDark={isDark}
          icon="moon-outline"
          label={t('settings.darkMode')}
          value={isDark ? t('settings.darkModeActive') : t('settings.darkModeInactive')}
        />
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
          icon="information-circle-outline"
          label={t('settings.version')}
          value="1.0.0"
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
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  containerDark: { backgroundColor: Colors.backgroundDark },
  header: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.md,
  },
  headerTitle: {
    fontSize: FontSize.largeTitle,
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
  profileName: { fontSize: FontSize.headline, fontWeight: FontWeight.semibold, color: Colors.text },
  profileEmail: {
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

  // Subscription hero
  subCardWrap: { marginHorizontal: Spacing.lg, marginTop: Spacing.lg },
  subCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: 12,
  },
  subCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  subBadgeText: {
    color: '#FFF',
    fontSize: FontSize.footnote,
    fontWeight: FontWeight.semibold,
  },
  subUsage: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: FontSize.footnote,
    fontWeight: FontWeight.medium,
  },
  usageBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
  },
  usageBarFill: {
    height: '100%',
    backgroundColor: Colors.warmAmber,
    borderRadius: 3,
  },
  subTagline: {
    color: '#FFF',
    fontSize: FontSize.subheadline,
    lineHeight: 20,
    opacity: 0.95,
  },
  subRemaining: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: FontSize.footnote,
  },
  subCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFF',
    paddingVertical: 12,
    borderRadius: BorderRadius.full,
    marginTop: 4,
  },
  subCtaText: {
    color: Colors.accent,
    fontSize: FontSize.subheadline,
    fontWeight: FontWeight.bold,
  },
  subErrorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.coral + '40',
  },
  subErrorTitle: {
    fontSize: FontSize.subheadline,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
  subErrorSub: { fontSize: FontSize.caption, color: Colors.textSecondary, marginTop: 2 },

  // Sections
  section: { marginTop: Spacing.xxl },
  sectionTitle: {
    fontSize: FontSize.caption,
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
  rowLabel: { flex: 1, fontSize: FontSize.body, color: Colors.text },
  rowLabelDestructive: { color: Colors.coral, fontWeight: FontWeight.semibold },
  rowValue: { fontSize: FontSize.subheadline, color: Colors.textSecondary, maxWidth: 160 },
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
    fontWeight: FontWeight.medium,
    color: Colors.coral,
    textDecorationLine: 'underline',
  },
  textDark: { color: Colors.textDark },
  textMuted: { color: Colors.systemGray },
});
