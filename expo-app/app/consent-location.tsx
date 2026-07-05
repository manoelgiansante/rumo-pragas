import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Platform,
  ActivityIndicator,
  BackHandler,
} from 'react-native';
import { showAlert } from '../services/dialog';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  Colors,
  Spacing,
  BorderRadius,
  FontSize,
  FontWeight,
  FontFamily,
} from '../constants/theme';
import { useAuthContext } from '../contexts/AuthContext';
import { useNavigationGate } from '../contexts/NavigationGateContext';
import { LOCATION_CONSENT_SHOWN_KEY as GATE_LOCATION_CONSENT_SHOWN_KEY } from '../services/navigationGate';
import { setLocationConsent } from '../services/userPreferences';
import { useLocation } from '../hooks/useLocation';
import { trackEvent } from '../services/analytics';

/**
 * P0-3 (LGPD) — Location consent screen.
 *
 * Shown once per user after first login. Records an explicit opt-in or opt-out
 * decision in `public.user_preferences` (see migration 20260414000000).
 * The user can later change this choice from Settings.
 *
 * Default when the user skips or fails to reach this screen: no consent.
 */

// Re-exported from the canonical navigation-gate module to avoid key drift.
export const LOCATION_CONSENT_SHOWN_KEY = GATE_LOCATION_CONSENT_SHOWN_KEY;

const CONSENT_PURPOSE_PT =
  'Compartilhar localização com o agrônomo IA para melhorar o diagnóstico de pragas regionais e alertas climáticos.';

export default function ConsentLocationScreen() {
  const { t } = useTranslation();
  const { user } = useAuthContext();
  const { markLocationConsentSeen } = useNavigationGate();
  const { requestPermission, getCurrentLocation } = useLocation();
  const [isSaving, setIsSaving] = useState(false);

  // Harden the LGPD consent gate on Android: the hardware/gesture back button
  // must NOT let the user skip the consent decision (gestureEnabled:false in the
  // Stack only blocks the iOS swipe). Returning true consumes the event so the
  // user has to make an explicit choice via "Continuar".
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  // RUMO-PRAGAS-7/8 fix: this screen NO LONGER self-navigates. It only records
  // the consent flag via the reactive navigation gate. The single source-of-truth
  // routing effect in app/_layout.tsx observes the flag flip and replaces to
  // '/(tabs)' exactly once. Self-navigating here is what created the dual-writer
  // race (two callers of router.replace) that the layout effect then bounced into
  // an infinite "Maximum update depth exceeded" loop on iPad/iOS 26.
  const finish = () => {
    markLocationConsentSeen();
  };

  // Apple Guideline 5.1.1(iv) fix (2026-05-27): the primary button is now
  // "Continuar"/"Continue" and there is NO exit ("Not now") button. Tapping the
  // button ALWAYS fires the native iOS location permission prompt, and we record
  // the LGPD consent decision from the user's choice in that native prompt:
  //   - granted  -> setLocationConsent(true)  + fetch location
  //   - denied   -> setLocationConsent(false)
  // The purpose is disclosed on this screen before the prompt, so explicit-consent
  // (LGPD) remains intact and is revocable later in Settings > Privacy.
  const handleContinue = async () => {
    if (!user?.id) {
      finish();
      return;
    }
    setIsSaving(true);

    // ALWAYS proceed to the native permission prompt on tap (Apple 5.1.1(iv)).
    // requestPermission() calls Location.requestForegroundPermissionsAsync() and
    // returns true only when the user grants in the native dialog.
    let granted: boolean;
    try {
      granted = await requestPermission();
    } catch (err) {
      if (__DEV__) console.warn('[consent-location] permission request failed:', err);
      granted = false;
    }

    try {
      if (granted) {
        await setLocationConsent(user.id, true, CONSENT_PURPOSE_PT);
        trackEvent('location_consent_accepted');
        // Fire-and-forget the location fetch so we don't block finishing. The
        // permission is already granted, so this resolves coords (Home reads
        // useLocation when it lands). Degrades gracefully on failure.
        const fetchPromise = getCurrentLocation()
          .then((coords) => {
            trackEvent('location_first_fetch', {
              success: !!coords,
              source: 'consent_continue',
            });
          })
          .catch((err) => {
            if (__DEV__) console.warn('[consent-location] first fetch failed:', err);
            trackEvent('location_first_fetch', { success: false, source: 'consent_continue' });
          });
        void fetchPromise;
      } else {
        await setLocationConsent(user.id, false, CONSENT_PURPOSE_PT);
        trackEvent('location_consent_declined');
      }
      finish();
    } catch {
      setIsSaving(false);
      showAlert(t('common.error'), t('consent.location.saveError'), [{ text: t('common.ok') }]);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <LinearGradient
          colors={[Colors.brand, Colors.accent]}
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
            testID="consent-location-accept"
            style={styles.acceptBtn}
            onPress={handleContinue}
            activeOpacity={0.8}
            disabled={isSaving}
            accessibilityRole="button"
            accessibilityLabel={t('consent.location.acceptA11y')}
            accessibilityState={{ disabled: isSaving, busy: isSaving }}
          >
            {isSaving ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.acceptText}>{t('consent.location.accept')}</Text>
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
    fontFamily: FontFamily.bold,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontFamily: FontFamily.regular,
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
    fontFamily: FontFamily.regular,
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
    fontFamily: FontFamily.regular,
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
    fontFamily: FontFamily.bold,
    fontWeight: FontWeight.bold,
    color: '#FFF',
  },
  footnote: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: Spacing.md,
  },
});
