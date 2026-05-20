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
import { captureException } from '../services/sentry-shim';
import { Colors, Spacing, BorderRadius, FontSize, FontWeight } from '../constants/theme';
import { useAuthContext } from '../contexts/AuthContext';
import { setLocationConsent } from '../services/userPreferences';

/**
 * P0-3 (LGPD) — Location informational screen.
 *
 * Shown once per user after first login. Records an LGPD opt-in in
 * `public.user_preferences` (see migration 20260414000000) when the user
 * taps "Continuar". The user can later revoke this choice from Settings >
 * Privacidade.
 *
 * Apple Guideline 5.1.1(iv) compliance (2026-05-20, bn40 resubmit):
 * This screen used to render TWO buttons — "Permitir localização" (accept)
 * + "Agora não" (decline). Apple flagged BOTH labels:
 *   - "Allow Location" button copy must be "Continue" / "Next" instead.
 *   - "Not Now" dismiss button violates the rule that pre-prompts must
 *     ALWAYS proceed to the system permission request.
 * Now: single "Continuar" CTA. The native iOS location dialog (triggered
 * later by features like region-aware diagnosis / weather alerts when the
 * user explicitly uses them) is the user's real opt-out path — denying
 * there is fully honored. LGPD revocation path remains in Settings.
 *
 * Default when the user fails to reach this screen: no consent (column
 * default in `user_preferences`).
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

  // Apple 5.1.1(iv) bn40 fix: single CTA "Continuar". Records LGPD consent
  // = true so subsequent location features can request the native iOS
  // permission. The OS dialog is the actual opt-out — denying there is
  // honored. Save failures NEVER trap the user on this screen.
  const handleContinue = async () => {
    if (!user?.id) {
      await finish();
      return;
    }
    setIsSaving(true);
    try {
      await setLocationConsent(user.id, true, CONSENT_PURPOSE_PT);
      await finish();
    } catch (e) {
      if (__DEV__) console.warn('[consent-location] continue save failed:', e);
      try {
        captureException(e, { tags: { feature: 'consent-location', action: 'continue' } });
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
          {/* Apple 5.1.1(iv) bn40: SINGLE "Continuar" CTA. Decline button
              removed entirely — the native iOS permission dialog (fired later
              when location is actually needed) is the user's real opt-out. */}
          <TouchableOpacity
            style={styles.acceptBtn}
            onPress={handleContinue}
            activeOpacity={0.8}
            disabled={isSaving}
            accessibilityRole="button"
            accessibilityLabel={t('consent.location.continueA11y')}
          >
            {isSaving ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.acceptText}>{t('consent.location.continueLabel')}</Text>
            )}
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
  footnote: {
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: Spacing.md,
  },
});
