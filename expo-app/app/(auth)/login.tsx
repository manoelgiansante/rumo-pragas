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
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Sentry from '@sentry/react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthContext } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { isAppleSignInAvailable, signInWithApple } from '../../services/appleAuth';
import {
  Colors,
  Spacing,
  BorderRadius,
  FontSize,
  FontWeight,
  Gradients,
} from '../../constants/theme';
type AuthMode = 'login' | 'signup';

export default function LoginScreen() {
  const { t } = useTranslation();
  const { signIn, signUp, resetPassword, isLoading, error, clearError } = useAuthContext();

  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  // Guards against rapid double-tap submitting the same form twice. The
  // network request might be in-flight before isLoading flips, so we use a
  // local ref to short-circuit re-entry within the same tick.
  const submitGuardRef = useRef(false);

  const passwordRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);

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
    // Idempotency guard — prevents double-submit on rapid tap.
    if (submitGuardRef.current || isLoading) return;

    if (!email.trim() || !password.trim()) {
      Alert.alert('', t('auth.fillAllFields'));
      return;
    }

    if (!isValidEmail(email.trim())) {
      Alert.alert('', t('auth.invalidEmail'));
      return;
    }

    if (mode === 'signup' && !isStrongPassword(password)) {
      Alert.alert('', t('auth.weakPassword'));
      return;
    }

    // QW-3 (W16-1, 2026-05-22): fullName is OPTIONAL on signup. -1 required
    // field is worth ~8-12% conv lift on Android (where the soft keyboard
    // covers the form). The user can fill it later in edit-profile.

    submitGuardRef.current = true;
    Sentry.addBreadcrumb({
      category: 'auth',
      message: `login.submit.${mode}`,
      level: 'info',
    });
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (mode === 'login') {
        await signIn(email.trim(), password);
      } else {
        // QW-3: pass undefined when empty so the backend stores NULL instead
        // of an empty string in profiles.full_name. Avoids "" as a sentinel
        // that downstream code might display as the user's name.
        const trimmedName = fullName.trim();
        await signUp(email.trim(), password, trimmedName ? trimmedName : undefined);
        Alert.alert('', t('auth.checkEmail'));
      }
    } catch (err) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      // We swallow the surface message (the hook owns the error banner), but
      // we want Sentry to know which failure happened for prod debugging.
      Sentry.addBreadcrumb({
        category: 'auth',
        message: `login.submit.${mode}.failed`,
        level: 'warning',
        data: { message: err instanceof Error ? err.message : 'unknown' },
      });
    } finally {
      // Release the guard after one tick so the screen has a chance to
      // unmount on success; on failure we want the user to retry immediately.
      setTimeout(() => {
        submitGuardRef.current = false;
      }, 500);
    }
  };

  const handleResetPassword = async () => {
    if (!email.trim()) {
      Alert.alert('', t('auth.enterEmail'));
      return;
    }
    try {
      await resetPassword(email.trim());
      Alert.alert('', t('auth.emailSent'));
    } catch {
      // error is handled by the hook
    }
  };

  const switchMode = (newMode: AuthMode) => {
    clearError();
    setMode(newMode);
    setAcceptedTerms(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleAppleSignIn = async () => {
    if (appleLoading) return;
    try {
      setAppleLoading(true);
      Sentry.addBreadcrumb({
        category: 'auth',
        message: 'login.apple.start',
        level: 'info',
      });
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const result = await signInWithApple();
      if (!result) {
        // User cancelled
        Sentry.addBreadcrumb({
          category: 'auth',
          message: 'login.apple.cancelled',
          level: 'info',
        });
        return;
      }
      Sentry.addBreadcrumb({
        category: 'auth',
        message: 'login.apple.success',
        level: 'info',
      });
    } catch (err: unknown) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const message = err instanceof Error ? err.message : t('auth.loginError');
      Sentry.captureException(err, { tags: { feature: 'auth', action: 'apple_signin' } });
      Alert.alert(t('common.error'), message);
    } finally {
      setAppleLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          {/* Hero gradient header */}
          <LinearGradient
            colors={Gradients.hero as [string, string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={styles.heroContent}>
              <View style={styles.iconCircle}>
                <Ionicons name="leaf" size={40} color={Colors.white} />
              </View>
              <Text style={styles.heroTitle}>{t('auth.appName')}</Text>
              <Text style={styles.heroSubtitle}>{t('auth.appTagline')}</Text>
            </View>
          </LinearGradient>

          {/* Form card */}
          <View style={styles.formCard}>
            {/* Segmented control */}
            <View style={styles.segmentedControl}>
              <TouchableOpacity
                testID="login-segment-login"
                style={[styles.segment, mode === 'login' && styles.segmentActive]}
                onPress={() => switchMode('login')}
                accessibilityLabel={t('auth.loginA11y')}
                accessibilityRole="button"
                accessibilityState={{ selected: mode === 'login' }}
              >
                <Text style={[styles.segmentText, mode === 'login' && styles.segmentTextActive]}>
                  {t('auth.login')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="login-segment-signup"
                style={[styles.segment, mode === 'signup' && styles.segmentActive]}
                onPress={() => switchMode('signup')}
                accessibilityLabel={t('auth.signupA11y')}
                accessibilityRole="button"
                accessibilityState={{ selected: mode === 'signup' }}
              >
                <Text style={[styles.segmentText, mode === 'signup' && styles.segmentTextActive]}>
                  {t('auth.signup')}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Error message */}
            {error ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Name field (signup only) */}
            {mode === 'signup' ? (
              <View style={styles.inputGroup}>
                <View style={styles.inputContainer}>
                  <Ionicons
                    name="person-outline"
                    size={20}
                    color={Colors.systemGray}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    testID="login-input-fullname"
                    style={styles.input}
                    placeholder={t('auth.fullNameOptionalPlaceholder')}
                    placeholderTextColor={Colors.systemGray2}
                    value={fullName}
                    onChangeText={setFullName}
                    autoCapitalize="words"
                    returnKeyType="next"
                    onSubmitEditing={() => emailRef.current?.focus()}
                    accessibilityLabel={t('auth.fullNameOptionalA11y')}
                    accessibilityRole="text"
                  />
                </View>
              </View>
            ) : null}

            {/* Email field */}
            <View style={styles.inputGroup}>
              <View style={styles.inputContainer}>
                <Ionicons
                  name="mail-outline"
                  size={20}
                  color={Colors.systemGray}
                  style={styles.inputIcon}
                />
                <TextInput
                  testID="login-input-email"
                  ref={emailRef}
                  style={styles.input}
                  placeholder={t('auth.emailPlaceholder')}
                  placeholderTextColor={Colors.systemGray2}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  accessibilityLabel={t('auth.emailA11y')}
                  accessibilityRole="text"
                />
              </View>
            </View>

            {/* Password field */}
            <View style={styles.inputGroup}>
              <View style={styles.inputContainer}>
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color={Colors.systemGray}
                  style={styles.inputIcon}
                />
                <TextInput
                  testID="login-input-password"
                  ref={passwordRef}
                  style={[styles.input, styles.passwordInput]}
                  placeholder={t('auth.passwordPlaceholder')}
                  placeholderTextColor={Colors.systemGray2}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                  accessibilityLabel={t('auth.passwordA11y')}
                  accessibilityRole="text"
                />
                <TouchableOpacity
                  testID="login-toggle-password-visibility"
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityLabel={
                    showPassword ? t('auth.hidePassword') : t('auth.showPassword')
                  }
                  accessibilityRole="button"
                >
                  {showPassword ? (
                    <Ionicons name="eye-off-outline" size={20} color={Colors.systemGray} />
                  ) : (
                    <Ionicons name="eye-outline" size={20} color={Colors.systemGray} />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Forgot password */}
            {mode === 'login' ? (
              <TouchableOpacity
                testID="login-forgot-password"
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
                  testID="login-checkbox-terms"
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

            {/* Submit button */}
            <TouchableOpacity
              testID="login-submit"
              style={[
                styles.submitButton,
                (isLoading || (mode === 'signup' && !acceptedTerms)) && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={isLoading || (mode === 'signup' && !acceptedTerms)}
              activeOpacity={0.8}
              accessibilityLabel={mode === 'login' ? t('auth.loginA11y') : t('auth.signupA11y')}
              accessibilityRole="button"
              accessibilityState={{
                disabled: isLoading || (mode === 'signup' && !acceptedTerms),
                busy: isLoading,
              }}
            >
              <LinearGradient
                colors={[Colors.accent, Colors.accentDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.submitGradient}
              >
                {isLoading ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.submitText} maxFontSizeMultiplier={1.2}>
                    {mode === 'login' ? t('auth.login') : t('auth.signup')}
                  </Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Terms (login mode only — signup has explicit LGPD consent above) */}
            {mode === 'login' ? (
              <Text style={styles.termsText}>
                {t('auth.acceptTerms')}{' '}
                <Text style={styles.termsLink} onPress={() => router.push('/terms')}>
                  {t('auth.termsOfUse')}
                </Text>{' '}
                {t('auth.and')}{' '}
                <Text style={styles.termsLink} onPress={() => router.push('/privacy')}>
                  {t('auth.privacyPolicy')}
                </Text>
              </Text>
            ) : null}

            {/* Social sign-in divider & Apple Sign In */}
            {appleAvailable && (
              <>
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>{t('auth.orContinueWith')}</Text>
                  <View style={styles.dividerLine} />
                </View>

                <TouchableOpacity
                  testID="login-apple-signin"
                  style={styles.appleButton}
                  onPress={handleAppleSignIn}
                  disabled={appleLoading}
                  activeOpacity={0.8}
                  accessibilityLabel={t('auth.appleA11y')}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: appleLoading, busy: appleLoading }}
                >
                  {appleLoading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="logo-apple" size={20} color="#FFF" />
                      <Text style={styles.appleButtonText}>{t('auth.signInWithApple')}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
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
  },
  hero: {
    paddingTop: Platform.OS === 'ios' ? 80 : 60,
    paddingBottom: 48,
    borderBottomLeftRadius: BorderRadius.xl,
    borderBottomRightRadius: BorderRadius.xl,
  },
  heroContent: {
    alignItems: 'center',
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  heroTitle: {
    fontSize: FontSize.largeTitle,
    fontWeight: FontWeight.bold,
    color: Colors.white,
    marginBottom: Spacing.sm,
  },
  heroSubtitle: {
    fontSize: FontSize.subheadline,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    paddingHorizontal: Spacing.xxxl,
  },
  formCard: {
    flex: 1,
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.xxxl,
    paddingBottom: Spacing.xxxl,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: Colors.systemGray6,
    borderRadius: BorderRadius.sm,
    padding: 3,
    marginBottom: Spacing.xxl,
  },
  segment: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm - 2,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: Colors.white,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentText: {
    fontSize: FontSize.subheadline,
    fontWeight: FontWeight.medium,
    color: Colors.systemGray,
  },
  segmentTextActive: {
    color: Colors.accent,
    fontWeight: FontWeight.semibold,
  },
  errorContainer: {
    backgroundColor: '#FFEBEE',
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.lg,
  },
  errorText: {
    color: Colors.coral,
    fontSize: FontSize.footnote,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.systemGray6,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    height: 52,
  },
  inputIcon: {
    marginRight: Spacing.md,
  },
  input: {
    flex: 1,
    fontSize: FontSize.body,
    color: Colors.text,
    height: '100%',
  },
  passwordInput: {
    paddingRight: 40,
  },
  eyeButton: {
    position: 'absolute',
    right: Spacing.lg,
  },
  forgotButton: {
    alignSelf: 'flex-end',
    marginBottom: Spacing.xxl,
    marginTop: -Spacing.sm,
  },
  forgotText: {
    fontSize: FontSize.footnote,
    color: Colors.accent,
    fontWeight: FontWeight.medium,
  },
  submitButton: {
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    marginBottom: Spacing.xxl,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitGradient: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
  },
  submitText: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.semibold,
    color: Colors.white,
  },
  termsText: {
    fontSize: FontSize.caption,
    color: Colors.systemGray,
    textAlign: 'center',
    lineHeight: 18,
  },
  termsLink: {
    color: Colors.accent,
    fontWeight: FontWeight.medium,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.xl,
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
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing.xl,
    gap: Spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.systemGray4,
  },
  dividerText: {
    fontSize: FontSize.footnote,
    color: Colors.systemGray,
    fontWeight: FontWeight.medium,
  },
  appleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
    borderRadius: BorderRadius.md,
    paddingVertical: 14,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  appleButtonText: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.semibold,
    color: '#FFF',
  },
});
