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
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthContext } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { isAppleSignInAvailable, signInWithApple } from '../../services/appleAuth';
import { Colors, Spacing, BorderRadius, FontSize, FontWeight } from '../../constants/theme';
import { Hero, Input, Button } from '../../components/ui';

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

  // Inline validation errors (display in addition to existing Alert.alert)
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [nameError, setNameError] = useState('');

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
    setEmailError('');
    setPasswordError('');
    setNameError('');

    if (!email.trim() || !password.trim()) {
      if (!email.trim()) setEmailError(t('auth.fillAllFields'));
      if (!password.trim()) setPasswordError(t('auth.fillAllFields'));
      Alert.alert('', t('auth.fillAllFields'));
      return;
    }

    if (!isValidEmail(email.trim())) {
      setEmailError(t('auth.invalidEmail'));
      Alert.alert('', t('auth.invalidEmail'));
      return;
    }

    if (mode === 'signup' && !isStrongPassword(password)) {
      setPasswordError(t('auth.weakPassword'));
      Alert.alert('', t('auth.weakPassword'));
      return;
    }

    if (mode === 'signup' && !fullName.trim()) {
      setNameError(t('auth.enterFullName'));
      Alert.alert('', t('auth.enterFullName'));
      return;
    }

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (mode === 'login') {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password, fullName.trim());
        Alert.alert('', t('auth.checkEmail'));
      }
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleResetPassword = async () => {
    if (!email.trim()) {
      setEmailError(t('auth.enterEmail'));
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
    setEmailError('');
    setPasswordError('');
    setNameError('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleAppleSignIn = async () => {
    try {
      setAppleLoading(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const result = await signInWithApple();
      if (!result) {
        // User cancelled
        return;
      }
    } catch (err: unknown) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const message = err instanceof Error ? err.message : t('auth.loginError');
      Alert.alert(t('common.error'), message);
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
              >
                <Text style={[styles.segmentText, mode === 'signup' && styles.segmentTextActive]}>
                  {t('auth.signup')}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Server error message */}
            {error ? (
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
            />

            {/* Password field */}
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
            />

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
