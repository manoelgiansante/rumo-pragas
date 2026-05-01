import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import * as Sentry from '@sentry/react-native';
import { Colors, Spacing, BorderRadius, FontSize, FontWeight } from '../constants/theme';
import { useAuthContext } from '../contexts/AuthContext';
import { setLocationConsent } from '../services/userPreferences';

/**
 * P0-3 (LGPD) — Location consent screen.
 *
 * Shown once per user after first login. Records an explicit opt-in or opt-out
 * decision in `public.user_preferences` (see migration 20260414000000).
 * The user can later change this choice from Settings.
 *
 * Default when the user skips or fails to reach this screen: no consent.
 */

export const LOCATION_CONSENT_SHOWN_KEY = '@rumo_pragas_location_consent_shown';

const CONSENT_PURPOSE_PT =
  'Compartilhar localização com o agrônomo IA para melhorar o diagnóstico de pragas regionais e alertas climáticos.';

export default function ConsentLocationScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuthContext();
  const [isSaving, setIsSaving] = useState(false);

  const finish = async () => {
    await AsyncStorage.setItem(LOCATION_CONSENT_SHOWN_KEY, 'true');
    router.replace('/(tabs)');
  };

  const handleAccept = async () => {
    if (!user?.id) {
      await finish();
      return;
    }
    setIsSaving(true);
    try {
      await setLocationConsent(user.id, true, CONSENT_PURPOSE_PT);
      await finish();
    } catch (e) {
      // Symmetric fallback: if save fails, log to Sentry but never trap the
      // user on this screen. They can revisit the choice later from Settings.
      if (__DEV__) console.warn('[consent-location] accept save failed:', e);
      try {
        Sentry.captureException(e, { tags: { feature: 'consent-location', action: 'accept' } });
      } catch {
        /* never crash on Sentry */
      }
      await finish();
    }
  };

  const handleDecline = async () => {
    if (!user?.id) {
      await finish();
      return;
    }
    setIsSaving(true);
    try {
      await setLocationConsent(user.id, false, CONSENT_PURPOSE_PT);
      await finish();
    } catch (e) {
      // Even if save fails, treat as declined and move on — default is no consent
      if (__DEV__) console.warn('[consent-location] decline save failed:', e);
      try {
        Sentry.captureException(e, { tags: { feature: 'consent-location', action: 'decline' } });
      } catch {
        /* never crash on Sentry */
      }
      await finish();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <LinearGradient
          colors={['#0F6B4D', '#1A966B']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.iconGradient}
        >
          <Ionicons name="location" size={56} color="#FFF" />
        </LinearGradient>

        <Text style={styles.title}>{t('consent.location.title')}</Text>
        <Text style={styles.subtitle}>{t('consent.location.subtitle')}</Text>

        <View style={styles.benefitsCard}>
          <BenefitRow icon="leaf" text={t('consent.location.benefit1')} />
          <BenefitRow icon="cloud" text={t('consent.location.benefit2')} />
          <BenefitRow icon="notifications" text={t('consent.location.benefit3')} />
        </View>

        <View style={styles.lgpdNotice}>
          <Ionicons name="shield-checkmark" size={18} color={Colors.accent} />
          <Text style={styles.lgpdText}>{t('consent.location.lgpdNotice')}</Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.acceptBtn}
            onPress={handleAccept}
            activeOpacity={0.8}
            disabled={isSaving}
            accessibilityRole="button"
            accessibilityLabel={t('consent.location.acceptA11y')}
          >
            {isSaving ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.acceptText}>{t('consent.location.accept')}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.declineBtn}
            onPress={handleDecline}
            activeOpacity={0.7}
            disabled={isSaving}
            accessibilityRole="button"
            accessibilityLabel={t('consent.location.declineA11y')}
          >
            <Text style={styles.declineText}>{t('consent.location.decline')}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footnote}>{t('consent.location.footnote')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function BenefitRow({
  icon,
  text,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  text: string;
}) {
  return (
    <View style={styles.benefitRow}>
      <View style={styles.benefitIcon}>
        <Ionicons name={icon} size={18} color={Colors.accent} />
      </View>
      <Text style={styles.benefitText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    padding: Spacing.xxl,
    paddingTop: Platform.OS === 'ios' ? Spacing.xxxl : Spacing.xxl,
    alignItems: 'center',
  },
  iconGradient: {
    width: 104,
    height: 104,
    borderRadius: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  title: {
    fontSize: FontSize.title2,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSize.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.xxl,
    paddingHorizontal: Spacing.sm,
  },
  benefitsCard: {
    width: '100%',
    backgroundColor: Colors.systemGray5,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  benefitIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.accent + '1F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  benefitText: {
    flex: 1,
    fontSize: FontSize.subheadline,
    color: Colors.text,
    lineHeight: 20,
  },
  lgpdNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: Spacing.md,
    backgroundColor: Colors.accent + '10',
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xxl,
  },
  lgpdText: {
    flex: 1,
    fontSize: FontSize.caption,
    color: Colors.text,
    lineHeight: 18,
  },
  actions: {
    width: '100%',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  acceptBtn: {
    backgroundColor: Colors.accent,
    paddingVertical: 16,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
  },
  acceptText: {
    fontSize: FontSize.headline,
    fontWeight: FontWeight.bold,
    color: '#FFF',
  },
  declineBtn: {
    backgroundColor: 'transparent',
    paddingVertical: 16,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.systemGray5,
  },
  declineText: {
    fontSize: FontSize.headline,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  footnote: {
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: Spacing.md,
  },
});
