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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { LANGUAGE_KEY } from '../../i18n';
import { Colors, Spacing, BorderRadius, FontSize, Gradients } from '../../constants/theme';
import { useAuthContext } from '../../contexts/AuthContext';
import { useOTAUpdate } from '../../hooks/useOTAUpdate';
import { supabase } from '../../services/supabase';

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
    AsyncStorage.getItem(PUSH_ENABLED_KEY).then((value) => {
      if (value !== null) {
        setPushEnabled(value === 'true');
      }
    });
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
  }, [i18n]);

  const loadSubscriptionData = useCallback(async () => {
    if (!user || subLoadingRef.current) return;
    subLoadingRef.current = true;
    setSubLoading(true);
    setSubError(false);
    try {
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('plan, status')
        .eq('user_id', user.id)
        .maybeSingle();

      const currentPlan = (sub?.status === 'active' && sub?.plan) || 'free';
      setPlan(currentPlan);

      const now = new Date();
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const { count } = await supabase
        .from('pragas_diagnoses')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', firstOfMonth);

      setUsedThisMonth(count ?? 0);
    } catch (e) {
      console.error('Failed to load subscription data:', e);
      setSubError(true);
    } finally {
      subLoadingRef.current = false;
      setSubLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadSubscriptionData();
  }, [loadSubscriptionData]);

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
            // Mark deletion request in profile (LGPD: respond within 15 days)
            if (user) {
              await supabase
                .from('pragas_profiles')
                .update({ deletion_requested_at: new Date().toISOString() })
                .eq('id', user.id);
            }
            await signOut();
            Alert.alert(t('settings.deletionReceived'), t('settings.deletionReceivedMessage'));
          } catch {
            Alert.alert(t('common.error'), t('settings.deletionError'));
          }
        },
      },
    ]);
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, isDark && styles.textMuted]}>{title}</Text>
      <View style={[styles.sectionContent, isDark && styles.sectionContentDark]}>{children}</View>
    </View>
  );

  const Row = ({ icon, label, value, onPress, trailing }: any) => (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      disabled={!onPress && !trailing}
      activeOpacity={0.7}
      accessibilityLabel={label}
      accessibilityRole={onPress ? 'button' : 'none'}
      accessibilityValue={value ? { text: value } : undefined}
    >
      <Ionicons name={icon} size={20} color={Colors.accent} style={{ width: 28 }} />
      <Text style={[styles.rowLabel, isDark && styles.textDark]}>{label}</Text>
      {value && <Text style={styles.rowValue}>{value}</Text>}
      {trailing}
      {onPress && <Ionicons name="chevron-forward" size={16} color={Colors.systemGray3} />}
    </TouchableOpacity>
  );

  return (
    <ScrollView style={[styles.container, isDark && styles.containerDark]}>
      <Section title={t('settings.profile')}>
        <View style={styles.profileRow}>
          <LinearGradient colors={Gradients.hero as any} style={styles.avatar}>
            <Text style={styles.avatarText}>{userName.charAt(0).toUpperCase()}</Text>
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={[styles.profileName, isDark && styles.textDark]}>{userName}</Text>
            <Text style={styles.profileEmail}>{userEmail}</Text>
            <View style={styles.roleBadge}>
              <Ionicons name="shield-checkmark" size={10} color={Colors.accent} />
              <Text style={styles.roleText}>Produtor Rural</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity
          style={styles.editProfileBtn}
          onPress={() => router.push('/edit-profile')}
          activeOpacity={0.7}
        >
          <Ionicons name="create-outline" size={16} color={Colors.accent} />
          <Text style={styles.editProfileText}>{t('settings.editProfile')}</Text>
        </TouchableOpacity>
      </Section>

      <Section title={t('settings.subscription')}>
        {subError && !subLoading ? (
          <TouchableOpacity
            style={styles.subErrorRow}
            onPress={loadSubscriptionData}
            activeOpacity={0.7}
          >
            <Ionicons name="cloud-offline-outline" size={20} color={Colors.coral} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, isDark && styles.textDark]}>
                {t('settings.subLoadError')}
              </Text>
              <Text style={{ fontSize: FontSize.caption, color: Colors.textSecondary }}>
                {t('settings.subLoadRetry')}
              </Text>
            </View>
            <Ionicons name="refresh" size={18} color={Colors.coral} />
          </TouchableOpacity>
        ) : (
          <>
            <Row
              icon="diamond"
              label={t('settings.currentPlan')}
              value={subLoading ? undefined : PLAN_LABELS[plan] || plan}
              trailing={
                subLoading ? <ActivityIndicator size="small" color={Colors.accent} /> : undefined
              }
            />
            <Row
              icon="analytics"
              label={t('settings.monthlyUsage')}
              value={
                subLoading
                  ? undefined
                  : PLAN_LIMITS[plan] === -1
                    ? `${usedThisMonth} diagnosticos`
                    : `${usedThisMonth}/${PLAN_LIMITS[plan]} diagnosticos`
              }
              trailing={
                subLoading ? <ActivityIndicator size="small" color={Colors.accent} /> : undefined
              }
            />
            {plan === 'free' && (
              <Row
                icon="arrow-up-circle"
                label={t('settings.upgradePlan')}
                onPress={() => router.push('/paywall')}
              />
            )}
          </>
        )}
      </Section>

      <Section title={t('settings.appearance')}>
        <Row
          icon="moon"
          label={t('settings.darkMode')}
          value={isDark ? t('settings.darkModeActive') : t('settings.darkModeInactive')}
        />
        <Row
          icon="globe"
          label={t('settings.language')}
          value={LANGUAGE_DISPLAY[i18n.language] || i18n.language}
          onPress={handleLanguageChange}
        />
        <Row
          icon="notifications"
          label={t('settings.notifications')}
          trailing={
            <Switch
              value={pushEnabled}
              onValueChange={handlePushToggle}
              trackColor={{ true: Colors.accent }}
              accessibilityLabel="Notificacoes push"
              accessibilityRole="switch"
              accessibilityState={{ checked: pushEnabled }}
            />
          }
        />
      </Section>

      <Section title={t('settings.about')}>
        <Row
          icon="hand-left"
          label={t('auth.privacyPolicy')}
          onPress={() => router.push('/privacy')}
        />
        <Row
          icon="document-text"
          label={t('auth.termsOfUse')}
          onPress={() => router.push('/terms')}
        />
        <Row
          icon="refresh-outline"
          label={isChecking ? t('settings.checking') : t('settings.checkUpdates')}
          onPress={checkForUpdate}
        />
        <Row icon="information-circle" label={t('settings.version')} value="1.0.0" />
        <Row
          icon="mail-outline"
          label={t('settings.contactSupport')}
          onPress={() => {
            import('expo-linking').then(({ openURL }) =>
              openURL('mailto:suporte@agrorumo.com.br?subject=Suporte%20Rumo%20Pragas'),
            );
          }}
        />
      </Section>

      <TouchableOpacity
        style={styles.signOutBtn}
        onPress={handleSignOut}
        accessibilityLabel="Sair da conta"
        accessibilityRole="button"
      >
        <Ionicons
          name="log-out-outline"
          size={18}
          color={Colors.coral}
          accessibilityElementsHidden
        />
        <Text style={styles.signOutText}>{t('settings.signOut')}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.deleteAccountBtn}
        onPress={handleDeleteAccount}
        accessibilityLabel="Excluir conta permanentemente"
        accessibilityRole="button"
        accessibilityHint="Solicita a exclusao de todos os seus dados conforme a LGPD"
      >
        <Ionicons name="trash-outline" size={18} color="#FFF" accessibilityElementsHidden />
        <Text style={styles.deleteAccountText}>{t('settings.deleteAccount')}</Text>
      </TouchableOpacity>

      <View style={{ height: 50 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  containerDark: { backgroundColor: Colors.backgroundDark },
  section: { marginTop: Spacing.xl },
  sectionTitle: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    paddingHorizontal: Spacing.xl,
    marginBottom: 6,
  },
  sectionContent: {
    backgroundColor: Colors.card,
    marginHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  sectionContentDark: { backgroundColor: '#1C1C1E' },
  profileRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.lg, gap: 16 },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: FontSize.title2, fontWeight: '700', color: '#FFF' },
  profileName: { fontSize: FontSize.headline, fontWeight: '600' },
  profileEmail: { fontSize: FontSize.caption, color: Colors.textSecondary, marginTop: 2 },
  roleBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  roleText: { fontSize: FontSize.caption2, fontWeight: '600', color: Colors.accent },
  editProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: Colors.separator,
  },
  editProfileText: {
    fontSize: FontSize.subheadline,
    fontWeight: '600',
    color: Colors.accent,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    gap: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.separator,
  },
  rowLabel: { flex: 1, fontSize: FontSize.body },
  rowValue: { fontSize: FontSize.subheadline, color: Colors.textSecondary },
  signOutBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: Spacing.xxl,
    marginHorizontal: Spacing.lg,
    padding: Spacing.lg,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
  },
  signOutText: { fontSize: FontSize.subheadline, fontWeight: '600', color: Colors.coral },
  deleteAccountBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: Spacing.lg,
    marginHorizontal: Spacing.lg,
    padding: Spacing.lg,
    backgroundColor: Colors.coral,
    borderRadius: BorderRadius.lg,
  },
  deleteAccountText: { fontSize: FontSize.subheadline, fontWeight: '600', color: '#FFF' },
  textDark: { color: Colors.textDark },
  textMuted: { color: Colors.systemGray },
  subErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    gap: 10,
  },
});
