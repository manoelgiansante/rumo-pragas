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
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
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
import { AppBar, Chip, SectionHeader } from '../../components/ui';

const PUSH_ENABLED_KEY = '@rumo_pragas_push_enabled';
const APP_VERSION = Constants.expoConfig?.version ?? '1.0.1';

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

interface RowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
  isFirst?: boolean;
  danger?: boolean;
  isDark: boolean;
}

function Row({ icon, label, value, onPress, trailing, isFirst, danger, isDark }: RowProps) {
  const labelColor = danger ? Colors.coral : Colors.text;
  const iconColor = danger ? Colors.coral : Colors.textSecondary;

  return (
    <TouchableOpacity
      style={[
        styles.row,
        !isFirst && styles.rowBordered,
        isDark && styles.rowDark,
        !isFirst && isDark && styles.rowBorderedDark,
      ]}
      onPress={onPress}
      disabled={!onPress && !trailing}
      activeOpacity={0.7}
      accessibilityLabel={label}
      accessibilityRole={onPress ? 'button' : 'none'}
      accessibilityValue={value ? { text: value } : undefined}
    >
      <Ionicons name={icon} size={24} color={iconColor} style={styles.rowIcon} />
      <Text style={[styles.rowLabel, { color: labelColor }, isDark && !danger && styles.textDark]}>
        {label}
      </Text>
      {value && <Text style={styles.rowValue}>{value}</Text>}
      {trailing}
      {onPress && !danger && (
        <Ionicons name="chevron-forward" size={18} color={Colors.systemGray3} />
      )}
    </TouchableOpacity>
  );
}

interface SettingsGroupProps {
  children: React.ReactNode;
  isDark: boolean;
}

function SettingsGroup({ children, isDark }: SettingsGroupProps) {
  return <View style={[styles.groupContent, isDark && styles.groupContentDark]}>{children}</View>;
}

export default function SettingsScreen() {
  const isDark = useColorScheme() === 'dark';
  const { user, signOut } = useAuthContext();
  const { t, i18n } = useTranslation();
  // Dark mode follows system preference (no manual toggle)
  const [pushEnabled, setPushEnabled] = useState(true);
  const [plan, setPlan] = useState<string>('free');
  const [usedThisMonth, setUsedThisMonth] = useState<number>(0);
  const [subLoading, setSubLoading] = useState(true);
  const [subError, setSubError] = useState(false);
  const subLoadingRef = useRef(false);
  const [restoring, setRestoring] = useState(false);
  const { isChecking, checkForUpdate } = useOTAUpdate();
  const userName = user?.user_metadata?.full_name || t('home.defaultUser');
  const userEmail = user?.email || '';
  const initial = (userName.trim().charAt(0) || 'P').toUpperCase();

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

  const handlePushToggle = useCallback((value: boolean) => {
    setPushEnabled(value);
    AsyncStorage.setItem(PUSH_ENABLED_KEY, String(value));
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
      // Android: use Alert with buttons
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
      setSubError(true);
    } finally {
      subLoadingRef.current = false;
      setSubLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadSubscriptionData();
  }, [loadSubscriptionData]);

  // Apple Guideline 3.1.2 / Google Play policy: paying users must be able to
  // manage/cancel their subscription from inside the app.
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
    } catch {
      Alert.alert(t('common.error'), t('paywall.restoreError'));
    } finally {
      setRestoring(false);
    }
  }, [t, loadSubscriptionData]);

  const handleSignOut = () => {
    Alert.alert(t('settings.signOut'), t('settings.signOut') + '?', [
      { text: t('settings.cancel'), style: 'cancel' },
      { text: t('settings.signOut'), style: 'destructive', onPress: signOut },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(t('settings.deleteConfirmTitle'), t('settings.deleteConfirmMessage'), [
      { text: t('settings.cancel'), style: 'cancel' },
      {
        text: t('settings.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            // LGPD Art. 18, V + Apple 5.1.1(v): immediate in-app deletion.
            // Must pass the user's JWT so the Edge Function can verify identity
            // before permanently wiping data and auth record.
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
              Alert.alert(t('common.error'), t('settings.deletionError'));
              return;
            }

            await signOut();
            Alert.alert(t('settings.deletionReceived'), t('settings.deletionReceivedMessage'));
          } catch (e) {
            if (__DEV__) console.error('handleDeleteAccount exception:', e);
            Alert.alert(t('common.error'), t('settings.deletionError'));
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <AppBar title="Ajustes" />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Profile gradient card */}
        <LinearGradient
          colors={Gradients.tech}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.profileCard}
        >
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </View>
          <View style={styles.profileMeta}>
            <Text style={styles.profileName} numberOfLines={1}>
              {userName}
            </Text>
            {userEmail ? (
              <Text style={styles.profileEmail} numberOfLines={1}>
                {userEmail}
              </Text>
            ) : null}
            <View style={styles.profileChipRow}>
              {subLoading ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Chip style={styles.profileChip} textStyle={styles.profileChipText}>
                  {PLAN_LABELS[plan] || plan}
                </Chip>
              )}
            </View>
          </View>
          <TouchableOpacity
            style={styles.editProfileIcon}
            onPress={() => router.push('/edit-profile')}
            activeOpacity={0.7}
            accessibilityLabel={t('settings.editProfile')}
            accessibilityRole="button"
          >
            <Ionicons name="create-outline" size={20} color={Colors.white} />
          </TouchableOpacity>
        </LinearGradient>

        {/* Pro upsell — free plan only */}
        {!subLoading && plan === 'free' && (
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={() => router.push('/paywall')}
            accessibilityLabel={t('settings.upgradePlan')}
            accessibilityRole="button"
            style={styles.upsellWrap}
          >
            <LinearGradient
              colors={Gradients.hero}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.upsellCard}
            >
              <View style={styles.upsellIconCircle}>
                <Ionicons name="diamond" size={20} color={Colors.white} />
              </View>
              <View style={styles.upsellMeta}>
                <Text style={styles.upsellTitle}>{t('settings.upgradePlan')}</Text>
                <Text style={styles.upsellSub} numberOfLines={2}>
                  {t('paywall.subtitle')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.white} />
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* Subscription */}
        <SectionHeader title={t('settings.subscription')} />
        <SettingsGroup isDark={isDark}>
          {subError && !subLoading ? (
            <TouchableOpacity
              style={[styles.row, isDark && styles.rowDark]}
              onPress={loadSubscriptionData}
              activeOpacity={0.7}
            >
              <Ionicons
                name="cloud-offline-outline"
                size={24}
                color={Colors.coral}
                style={styles.rowIcon}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, isDark && styles.textDark]}>
                  {t('settings.subLoadError')}
                </Text>
                <Text style={styles.rowSub}>{t('settings.subLoadRetry')}</Text>
              </View>
              <Ionicons name="refresh" size={18} color={Colors.coral} />
            </TouchableOpacity>
          ) : (
            <>
              <Row
                isFirst
                isDark={isDark}
                icon="diamond-outline"
                label={t('settings.currentPlan')}
                value={subLoading ? undefined : PLAN_LABELS[plan] || plan}
                trailing={
                  subLoading ? <ActivityIndicator size="small" color={Colors.accent} /> : undefined
                }
              />
              <Row
                isDark={isDark}
                icon="analytics-outline"
                label={t('settings.monthlyUsage')}
                value={
                  subLoading
                    ? undefined
                    : PLAN_LIMITS[plan] === -1
                      ? t('settings.diagnosticsCountUnlimited', { used: usedThisMonth })
                      : t('settings.diagnosticsCountLimited', {
                          used: usedThisMonth,
                          limit: PLAN_LIMITS[plan],
                        })
                }
                trailing={
                  subLoading ? <ActivityIndicator size="small" color={Colors.accent} /> : undefined
                }
              />
              {plan === 'free' && (
                <Row
                  isDark={isDark}
                  icon="arrow-up-circle-outline"
                  label={t('settings.upgradePlan')}
                  onPress={() => router.push('/paywall')}
                />
              )}
              {isRevenueCatConfigured() && (
                <Row
                  isDark={isDark}
                  icon="refresh-circle-outline"
                  label={restoring ? t('common.loading') : t('paywall.restorePurchases')}
                  onPress={restoring ? undefined : handleRestorePurchases}
                  trailing={
                    restoring ? <ActivityIndicator size="small" color={Colors.accent} /> : undefined
                  }
                />
              )}
              {/* Apple Guideline 3.1.2: native subscription management link. */}
              {!subLoading && plan !== 'free' && (
                <Row
                  isDark={isDark}
                  icon="card-outline"
                  label={t('settings.manageSubscription')}
                  onPress={openManageSubscription}
                />
              )}
            </>
          )}
        </SettingsGroup>

        {/* Appearance */}
        <SectionHeader title={t('settings.appearance')} />
        <SettingsGroup isDark={isDark}>
          <Row
            isFirst
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
          />
          <Row
            isDark={isDark}
            icon="notifications-outline"
            label={t('settings.notifications')}
            trailing={
              <Switch
                value={pushEnabled}
                onValueChange={handlePushToggle}
                trackColor={{ true: Colors.accent }}
                accessibilityLabel={t('settings.pushNotifA11y')}
                accessibilityRole="switch"
                accessibilityState={{ checked: pushEnabled }}
              />
            }
          />
        </SettingsGroup>

        {/* About */}
        <SectionHeader title={t('settings.about')} />
        <SettingsGroup isDark={isDark}>
          <Row
            isFirst
            isDark={isDark}
            icon="hand-left-outline"
            label={t('auth.privacyPolicy')}
            onPress={() => router.push('/privacy')}
          />
          <Row
            isDark={isDark}
            icon="document-text-outline"
            label={t('auth.termsOfUse')}
            onPress={() => router.push('/terms')}
          />
          <Row
            isDark={isDark}
            icon="refresh-outline"
            label={isChecking ? t('settings.checking') : t('settings.checkUpdates')}
            onPress={checkForUpdate}
          />
          <Row
            isDark={isDark}
            icon="information-circle-outline"
            label={t('settings.version')}
            value={APP_VERSION}
          />
          <Row
            isDark={isDark}
            icon="mail-outline"
            label={t('settings.contactSupport')}
            onPress={() => {
              import('expo-linking').then(({ openURL }) =>
                openURL(
                  `mailto:suporte@agrorumo.com.br?subject=${encodeURIComponent(t('settings.supportSubject'))}`,
                ),
              );
            }}
          />
        </SettingsGroup>

        {/* Account — danger zone (no section header, separated from "Sobre" by spacing) */}
        <View style={{ height: Spacing.md }} />
        <SettingsGroup isDark={isDark}>
          <Row
            isFirst
            isDark={isDark}
            danger
            icon="log-out-outline"
            label={t('settings.signOut')}
            onPress={handleSignOut}
          />
          <Row
            isDark={isDark}
            danger
            icon="trash-outline"
            label={t('settings.deleteAccount')}
            onPress={handleDeleteAccount}
          />
        </SettingsGroup>

        <Text style={styles.footer}>{`Rumo Pragas · v${APP_VERSION}`}</Text>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  containerDark: { backgroundColor: Colors.backgroundDark },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: Spacing.xxl },

  // Profile gradient card
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 22,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },
  profileMeta: { flex: 1, gap: 2 },
  profileName: {
    fontSize: 17,
    fontWeight: FontWeight.semibold,
    color: Colors.white,
  },
  profileEmail: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  profileChipRow: { flexDirection: 'row', marginTop: 8 },
  profileChip: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    height: 26,
    paddingHorizontal: 10,
  },
  profileChipText: {
    color: Colors.white,
    fontSize: FontSize.caption,
  },
  editProfileIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },

  // Pro upsell
  upsellWrap: { marginHorizontal: Spacing.lg, marginTop: Spacing.md },
  upsellCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    shadowColor: Colors.accentDark,
    shadowOpacity: 0.28,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 6,
  },
  upsellIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  upsellMeta: { flex: 1 },
  upsellTitle: {
    fontSize: 17,
    fontWeight: FontWeight.semibold,
    color: Colors.white,
  },
  upsellSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },

  // Settings groups + rows
  groupContent: {
    backgroundColor: Colors.card,
    marginHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  groupContentDark: { backgroundColor: '#1C1C1E' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
    backgroundColor: 'transparent',
  },
  rowDark: { backgroundColor: 'transparent' },
  rowBordered: {
    borderTopWidth: 1,
    borderTopColor: Colors.separator,
  },
  rowBorderedDark: {
    borderTopColor: '#2C2C2E',
  },
  rowIcon: { width: 28, textAlign: 'center' },
  rowLabel: {
    flex: 1,
    fontSize: 17,
    fontWeight: FontWeight.medium,
  },
  rowValue: {
    fontSize: FontSize.subheadline,
    color: Colors.textSecondary,
  },
  rowSub: {
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  // Footer
  footer: {
    fontSize: 12,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: Spacing.xl,
  },

  // Legacy/dark text helpers
  textDark: { color: Colors.textDark },
});
