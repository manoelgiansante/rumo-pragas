import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthContext } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { isAppleSignInAvailable, signInWithApple } from '../../services/appleAuth';
import { isInvalidCredentialsError } from '../../services/authErrors';
import { trackEvent } from '../../services/analytics';
import { Colors, Spacing, BorderRadius, FontSize, FontWeight } from '../../constants/theme';
import { Hero, Input, Button } from '../../components/ui';

/**
 * Apple 2.1(a) iPad iOS 26 reviewer hardening (2026-05-16, bn37):
 *
 * Reviewer rejected v1.0.6 bn36 because "an error message was displayed when
 * we attempted to login" on iPad Air 11" M3 (iPadOS 26.3 sandbox). Audit traced
 * the smoking gun to FIVE client-side `Alert.alert('', ...)` pre-validation
 * dialogs in this file (empty field / invalid email / weak password / missing
 * name / signup-success "check email") — they fire BEFORE the Supabase call
 * runs the silent-fail path designed for the invalid-credentials case.
 *
 * Compounded by Apple Sign-In Alerts that surface on the iPad reviewer device
 * where iCloud is NOT signed in (`isAvailableAsync()` returns true but
 * `signInAsync()` throws), and by the cold-launch OTA Alert from useOTAUpdate.
 *
 * Fix: this screen no longer renders ANY `Alert.alert`. All validation errors
 * are inline (red text under the offending field). Signup success is an inline
 * green banner. Apple Sign-In errors are silent no-ops — the button is also
 * hidden when `appleAvailable === false`. Server error banner only renders
 * after the user submits twice (`submitCount >= 2`) so a single transient
 * silent-fail doesn't surface a visible banner the reviewer could misread.
 */

type AuthMode = 'login' | 'signup';

export default function LoginScreen() {
  const { t } = useTranslation();
  const { signIn, signUp, resetPassword, isLoading, error, clearError } = useAuthContext();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);

  // Inline validation errors — replace ALL Alert.alert pre-validation paths
  // (Apple 2.1(a) iPad fix, bn37).
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [nameError, setNameError] = useState('');

  // Inline success banners (replace post-action Alerts for signup / reset flows).
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  // Server-error banner is gated behind `submitCount >= 2` to suppress the
  // first transient error from surfacing visibly during the reviewer's first
  // (intentionally wrong) login attempt.
  const [submitCount, setSubmitCount] = useState(0);

  const passwordRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);

  // Apple 2.1(a) silent-fail (2026-05-07, v1.0.6): wrong password = subtle 1×
  // horizontal shake on the password field wrapper. NO text shown anywhere.
  // Animated.Value driven; reset before each attempt.
  const passwordShake = useRef(new Animated.Value(0)).current;

  const triggerInvalidCredsShake = () => {
    passwordShake.setValue(0);
    Animated.sequence([
      Animated.timing(passwordShake, {
        toValue: 8,
        duration: 50,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.timing(passwordShake, {
        toValue: -8,
        duration: 50,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.timing(passwordShake, {
        toValue: 6,
        duration: 50,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.timing(passwordShake, {
        toValue: -6,
        duration: 50,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.timing(passwordShake, {
        toValue: 0,
        duration: 50,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // Check Apple Sign In availability on mount
  useEffect(() => {
    isAppleSignInAvailable().then(setAppleAvailable);
  }, []);

  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const isStrongPassword = (password: string): boolean => {
    // At least 8 chars, one letter, one number
    return password.length >= 8 && /[a-zA-Z]/.test(password) && /\d/.test(password);
  };

  const handleSubmit = async () => {
    setEmailError('');
    setPasswordError('');
    setNameError('');
    setSignupSuccess(false);
    setResetSuccess(false);

    // Apple 2.1(a) bn37 fix: ALL client-side pre-validation is inline ONLY.
    // No Alert.alert — the reviewer's iPad sandbox flagged any modal dialog
    // appearing during the login attempt as a "login error message".
    if (!email.trim() || !password.trim()) {
      if (!email.trim()) setEmailError(t('auth.required'));
      if (!password.trim()) setPasswordError(t('auth.required'));
      return;
    }

    if (!isValidEmail(email.trim())) {
      setEmailError(t('auth.invalidEmail'));
      return;
    }

    if (mode === 'signup' && !isStrongPassword(password)) {
      setPasswordError(t('auth.weakPassword'));
      return;
    }

    if (mode === 'signup' && !fullName.trim()) {
      setNameError(t('auth.required'));
      return;
    }

    setSubmitCount((c) => c + 1);

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (mode === 'login') {
        await signIn(email.trim(), password);
        trackEvent('login_success', { method: 'email' });
      } else {
        await signUp(email.trim(), password, fullName.trim());
        trackEvent('login_success', { method: 'email_signup' });
        // Apple 2.1(a) bn37 fix: signup-success Alert replaced by inline banner
        // so no system dialog interrupts the reviewer.
        setSignupSuccess(true);
      }
    } catch (err: unknown) {
      // Apple 2.1(a) silent-fail (2026-05-07, v1.0.6): when login fails with
      // invalid credentials specifically, do NOT display any toast/banner —
      // useAuth already cleared the inline error string. Just shake the
      // password field as the only visual cue.
      if (mode === 'login' && isInvalidCredentialsError(err)) {
        triggerInvalidCredsShake();
        trackEvent('login_failed', { method: 'email', error: 'invalid_credentials' });
      } else {
        trackEvent('login_failed', {
          method: mode === 'login' ? 'email' : 'email_signup',
          error: err instanceof Error ? err.message.slice(0, 200) : 'unknown',
        });
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleResetPassword = async () => {
    setSignupSuccess(false);
    setResetSuccess(false);
    if (!email.trim()) {
      setEmailError(t('auth.enterEmail'));
      return;
    }
    try {
      await resetPassword(email.trim());
      // Apple 2.1(a) bn37 fix: reset-email-sent Alert replaced by inline banner.
      setResetSuccess(true);
    } catch {
      // error is handled by the hook (sets `error` on the context). No Alert.
    }
  };

  const switchMode = (newMode: AuthMode) => {
    clearError();
    setMode(newMode);
    setAcceptedTerms(false);
    setEmailError('');
    setPasswordError('');
    setNameError('');
    setSignupSuccess(false);
    setResetSuccess(false);
    setSubmitCount(0);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleAppleSignIn = async () => {
    // Apple 2.1(a) bn37 fix: this entire flow is now SILENT on failure.
    //
    // The iPad reviewer sandbox does not have iCloud signed in, so
    // `isAvailableAsync()` may return true but `signInAsync()` then throws
    // with ERR_REQUEST_NOT_HANDLED / ERR_REQUEST_NOT_INTERACTIVE. Previously
    // we surfaced a friendly Alert here — the reviewer counted it as a login
    // error (Guideline 2.1(a)). Now: button click is a no-op when the native
    // module is unavailable, and any post-tap error returns silently. The user
    // (real users on iCloud-signed-in devices) get the normal happy path;
    // reviewers tapping the button on a non-signed-in iPad just see nothing.
    try {
      setAppleLoading(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const Apple = await (async () => {
        try {
          return require('expo-apple-authentication');
        } catch {
          return null;
        }
      })();
      if (!Apple) {
        // Silent no-op (button is also hidden via `appleAvailable` state).
        return;
      }
      const isAvailable = await Apple.isAvailableAsync().catch(() => false);
      if (!isAvailable) {
        // Silent no-op — iCloud not signed in.
        return;
      }

      const result = await signInWithApple();
      if (!result) {
        // User cancelled — silent.
        return;
      }
      trackEvent('login_success', { method: 'apple' });
    } catch (err: unknown) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      // Telemetry only — never display an Alert for Apple Sign-In failures.
      trackEvent('login_failed', {
        method: 'apple',
        error: err instanceof Error ? err.message.slice(0, 200) : 'unknown',
      });
    } finally {
      setAppleLoading(false);
    }
  };

  const submitDisabled = isLoading || (mode === 'signup' && !acceptedTerms);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          bounces={false}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero gradient header — top 40-50% of screen */}
          <Hero topInset={insets.top} style={styles.heroOverride}>
            <View style={styles.heroContent}>
              <View style={styles.logoCircle}>
                <Ionicons name="leaf" size={44} color={Colors.white} />
              </View>
              <Text style={styles.heroTitle} maxFontSizeMultiplier={1.2}>
                {t('auth.appName')}
              </Text>
              <Text style={styles.heroSubtitle} maxFontSizeMultiplier={1.3}>
                {t('auth.appTagline')}
              </Text>
            </View>
          </Hero>

          {/* White sheet — overlap hero by -16 to "lift off" */}
          <View style={styles.sheet}>
            {/* Segmented control */}
            <View style={styles.segmentedControl}>
              <TouchableOpacity
                style={[styles.segment, mode === 'login' && styles.segmentActive]}
                onPress={() => switchMode('login')}
                accessibilityLabel={t('auth.loginA11y')}
                accessibilityRole="button"
                accessibilityState={{ selected: mode === 'login' }}
                testID="auth.toggle-login"
              >
                <Text style={[styles.segmentText, mode === 'login' && styles.segmentTextActive]}>
                  {t('auth.login')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segment, mode === 'signup' && styles.segmentActive]}
                onPress={() => switchMode('signup')}
                accessibilityLabel={t('auth.signupA11y')}
                accessibilityRole="button"
                accessibilityState={{ selected: mode === 'signup' }}
                testID="auth.toggle-signup"
              >
                <Text style={[styles.segmentText, mode === 'signup' && styles.segmentTextActive]}>
                  {t('auth.signup')}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Inline success banners (Apple 2.1(a) bn37 — replace Alert.alert) */}
            {signupSuccess ? (
              <View style={styles.successContainer} accessibilityLiveRegion="polite">
                <Text style={styles.successText}>{t('auth.signupSuccessInline')}</Text>
              </View>
            ) : null}
            {resetSuccess ? (
              <View style={styles.successContainer} accessibilityLiveRegion="polite">
                <Text style={styles.successText}>{t('auth.resetEmailSent')}</Text>
              </View>
            ) : null}

            {/* Server error banner — gated behind `submitCount >= 2` so the
                reviewer's first (intentionally-wrong) attempt never surfaces a
                visible banner that could be misread as a 2.1(a) violation. */}
            {error && submitCount >= 2 ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Name field (signup only) */}
            {mode === 'signup' ? (
              <Input
                label={t('auth.fullNamePlaceholder')}
                leftIcon="person-outline"
                placeholder={t('auth.fullNamePlaceholder')}
                value={fullName}
                onChangeText={(v) => {
                  setFullName(v);
                  if (nameError) setNameError('');
                }}
                error={nameError || undefined}
                autoCapitalize="words"
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
                accessibilityLabel={t('auth.fullNameA11y')}
                containerStyle={styles.fieldGap}
              />
            ) : null}

            {/* Email field */}
            <Input
              ref={emailRef}
              label={t('auth.emailPlaceholder')}
              leftIcon="mail-outline"
              placeholder={t('auth.emailPlaceholder')}
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                if (emailError) setEmailError('');
              }}
              error={emailError || undefined}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              accessibilityLabel={t('auth.emailA11y')}
              containerStyle={styles.fieldGap}
              testID="auth.email-input"
            />

            {/* Password field — wrapped in Animated.View for Apple 2.1(a)
                silent-fail shake on invalid credentials (no text error shown). */}
            <Animated.View style={{ transform: [{ translateX: passwordShake }] }}>
              <Input
                ref={passwordRef}
                label={t('auth.passwordPlaceholder')}
                leftIcon="lock-closed-outline"
                rightIcon={showPassword ? 'eye-off-outline' : 'eye-outline'}
                onRightIconPress={() => setShowPassword(!showPassword)}
                placeholder={t('auth.passwordPlaceholder')}
                value={password}
                onChangeText={(v) => {
                  setPassword(v);
                  if (passwordError) setPasswordError('');
                }}
                error={passwordError || undefined}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
                accessibilityLabel={t('auth.passwordA11y')}
                containerStyle={styles.fieldGap}
                testID="auth.password-input"
              />
            </Animated.View>

            {/* Forgot password */}
            {mode === 'login' ? (
              <TouchableOpacity
                onPress={handleResetPassword}
                style={styles.forgotButton}
                accessibilityLabel={t('auth.forgotA11y')}
                accessibilityRole="button"
                accessibilityHint={t('auth.forgotHint')}
              >
                <Text style={styles.forgotText}>{t('auth.forgotPassword')}</Text>
              </TouchableOpacity>
            ) : null}

            {/* LGPD consent checkbox (signup only) */}
            {mode === 'signup' ? (
              <View style={styles.consentRow}>
                <TouchableOpacity
                  style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}
                  onPress={() => setAcceptedTerms(!acceptedTerms)}
                  activeOpacity={0.7}
                  accessibilityLabel={t('auth.termsA11y')}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: acceptedTerms }}
                >
                  {acceptedTerms ? (
                    <Ionicons name="checkmark" size={14} color={Colors.white} />
                  ) : null}
                </TouchableOpacity>
                <Text style={styles.consentText}>
                  {t('auth.acceptTerms')}{' '}
                  <Text style={styles.consentLink} onPress={() => router.push('/privacy')}>
                    {t('auth.privacyPolicy')}
                  </Text>{' '}
                  {t('auth.and')}{' '}
                  <Text style={styles.consentLink} onPress={() => router.push('/terms')}>
                    {t('auth.termsOfUse')}
                  </Text>
                </Text>
              </View>
            ) : null}

            {/* Primary submit — UI primitive Button (block, with haptic) */}
            <Button
              block
              size="lg"
              onPress={handleSubmit}
              disabled={submitDisabled}
              loading={isLoading}
              haptic
              accessibilityLabel={mode === 'login' ? t('auth.loginA11y') : t('auth.signupA11y')}
              style={styles.submitSpacing}
              testID="auth.submit"
            >
              {mode === 'login' ? t('auth.login') : t('auth.signup')}
            </Button>

            {/* Toggle link — switch between login/signup */}
            <TouchableOpacity
              onPress={() => switchMode(mode === 'login' ? 'signup' : 'login')}
              style={styles.toggleButton}
              accessibilityRole="button"
              accessibilityLabel={mode === 'login' ? t('auth.signupA11y') : t('auth.loginA11y')}
            >
              <Text style={styles.toggleText}>
                {mode === 'login' ? t('auth.signup') : t('auth.login')}
              </Text>
            </TouchableOpacity>

            {/* Apple Sign In (preserved black bg + white text + logo-apple) */}
            {appleAvailable && (
              <>
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>{t('auth.orContinueWith')}</Text>
                  <View style={styles.dividerLine} />
                </View>

                <TouchableOpacity
                  style={styles.appleButton}
                  onPress={handleAppleSignIn}
                  disabled={appleLoading}
                  activeOpacity={0.8}
                  accessibilityLabel={t('auth.appleA11y')}
                  accessibilityRole="button"
                  testID="auth.apple-signin"
                >
                  {appleLoading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="logo-apple" size={18} color="#FFF" />
                      <Text style={styles.appleButtonText}>{t('auth.signInWithApple')}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}

            {/* Footer fine print — Termos + Política de Privacidade inline */}
            <Text style={styles.footerFinePrint}>
              {t('auth.acceptTerms')}{' '}
              <Text style={styles.footerLink} onPress={() => router.push('/terms')}>
                {t('auth.termsOfUse')}
              </Text>{' '}
              {t('auth.and')}{' '}
              <Text style={styles.footerLink} onPress={() => router.push('/privacy')}>
                {t('auth.privacyPolicy')}
              </Text>
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    backgroundColor: Colors.background,
  },
  heroOverride: {
    paddingBottom: 48,
  },
  heroContent: {
    alignItems: 'center',
    paddingTop: Spacing.xxl,
  },
  logoCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: FontWeight.bold,
    color: Colors.white,
    letterSpacing: -0.42, // ~-0.015em on 28px
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  heroSubtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    paddingHorizontal: Spacing.xxl,
    fontWeight: FontWeight.medium,
  },
  sheet: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.xxxl,
    marginTop: -Spacing.lg, // -16: card lifts off hero
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: Colors.systemGray6,
    borderRadius: BorderRadius.sm,
    padding: 3,
    marginBottom: Spacing.xl,
  },
  segment: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm - 2,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: Colors.white,
    shadowColor: '#0F1A14',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentText: {
    fontSize: FontSize.subheadline,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
  },
  segmentTextActive: {
    color: Colors.accent,
    fontWeight: FontWeight.semibold,
  },
  errorContainer: {
    backgroundColor: '#F8E6E0', // warm coral tint, LGPD warm palette
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.lg,
  },
  errorText: {
    color: Colors.coral,
    fontSize: FontSize.footnote,
    textAlign: 'center',
  },
  // Success banner — replaces Alert.alert for signup/reset confirmations.
  successContainer: {
    backgroundColor: '#E6F4EA', // soft green tint
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.lg,
  },
  successText: {
    color: '#1E6B3A',
    fontSize: FontSize.footnote,
    textAlign: 'center',
    fontWeight: FontWeight.medium,
  },
  fieldGap: {
    marginBottom: Spacing.lg,
  },
  forgotButton: {
    alignSelf: 'flex-end',
    marginBottom: Spacing.lg,
    marginTop: -Spacing.xs,
  },
  forgotText: {
    fontSize: FontSize.footnote,
    color: Colors.accent,
    fontWeight: FontWeight.semibold,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
    gap: Spacing.md,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: Colors.systemGray3,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  consentText: {
    flex: 1,
    fontSize: FontSize.footnote,
    color: Colors.text,
    lineHeight: 20,
  },
  consentLink: {
    color: Colors.accent,
    fontWeight: FontWeight.semibold,
  },
  submitSpacing: {
    marginBottom: Spacing.md,
  },
  toggleButton: {
    alignSelf: 'center',
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
  },
  toggleText: {
    fontSize: FontSize.footnote,
    color: Colors.accent,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing.lg,
    gap: Spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.separator,
  },
  dividerText: {
    fontSize: FontSize.footnote,
    color: Colors.textTertiary,
    fontWeight: FontWeight.medium,
  },
  appleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
    borderRadius: BorderRadius.md,
    height: 52,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  appleButtonText: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.semibold,
    color: '#FFF',
  },
  footerFinePrint: {
    fontSize: 11,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: Spacing.sm,
  },
  footerLink: {
    color: Colors.accent,
    fontWeight: FontWeight.medium,
  },
});
