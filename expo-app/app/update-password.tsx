import { useState, useRef } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import * as Sentry from '@sentry/react-native';
import { showAlert } from '../services/dialog';
import { updatePassword } from '../services/auth';
import {
  Colors,
  Spacing,
  BorderRadius,
  FontSize,
  FontWeight,
  FontFamily,
} from '../constants/theme';

/**
 * Update-password screen — reached from the password-recovery deep link
 * (see services/passwordRecovery.ts). A recovery session is already active by
 * the time we land here, so `supabase.auth.updateUser({ password })` succeeds.
 */
export default function UpdatePasswordScreen() {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submitGuardRef = useRef(false);
  const confirmRef = useRef<TextInput>(null);

  const isStrongPassword = (pw: string): boolean =>
    pw.length >= 8 && /[a-zA-Z]/.test(pw) && /\d/.test(pw);

  const handleSubmit = async () => {
    if (submitGuardRef.current || submitting) return;

    if (!isStrongPassword(password)) {
      showAlert('', t('auth.weakPassword'));
      return;
    }
    if (password !== confirm) {
      showAlert('', t('updatePassword.mismatch'));
      return;
    }

    submitGuardRef.current = true;
    setSubmitting(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await updatePassword(password);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert('', t('updatePassword.success'));
      // The recovery session is now a full session — send them into the app.
      router.replace('/(tabs)');
    } catch (err) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Sentry.captureException(err, {
        tags: { feature: 'auth', action: 'update_password' },
      });
      const message = err instanceof Error ? err.message : t('updatePassword.error');
      showAlert(t('common.error'), message);
    } finally {
      setSubmitting(false);
      setTimeout(() => {
        submitGuardRef.current = false;
      }, 500);
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
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Ionicons name="lock-closed" size={32} color={Colors.accent} />
            </View>
            <Text style={styles.title}>{t('updatePassword.title')}</Text>
            <Text style={styles.subtitle}>{t('updatePassword.subtitle')}</Text>
          </View>

          <View style={styles.form}>
            {/* New password */}
            <View style={styles.inputContainer}>
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color={Colors.systemGray}
                style={styles.inputIcon}
              />
              <TextInput
                testID="update-password-input"
                style={[styles.input, styles.passwordInput]}
                placeholder={t('updatePassword.newPasswordPlaceholder')}
                placeholderTextColor={Colors.systemGray2}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                returnKeyType="next"
                onSubmitEditing={() => confirmRef.current?.focus()}
                accessibilityLabel={t('updatePassword.newPasswordPlaceholder')}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                accessibilityRole="button"
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={Colors.systemGray}
                />
              </TouchableOpacity>
            </View>

            {/* Confirm password */}
            <View style={styles.inputContainer}>
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color={Colors.systemGray}
                style={styles.inputIcon}
              />
              <TextInput
                testID="update-password-confirm"
                ref={confirmRef}
                style={styles.input}
                placeholder={t('updatePassword.confirmPlaceholder')}
                placeholderTextColor={Colors.systemGray2}
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
                accessibilityLabel={t('updatePassword.confirmPlaceholder')}
              />
            </View>

            <TouchableOpacity
              testID="update-password-submit"
              accessibilityLabel={t('updatePassword.submit')}
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ disabled: submitting, busy: submitting }}
            >
              {submitting ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.submitText}>{t('updatePassword.submit')}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.replace('/(auth)/login')}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel={t('updatePassword.backToLogin')}
            >
              <Text style={styles.backText}>{t('updatePassword.backToLogin')}</Text>
            </TouchableOpacity>
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
    paddingHorizontal: Spacing.xxl,
  },
  header: {
    alignItems: 'center',
    paddingTop: Spacing.xxxl,
    paddingBottom: Spacing.xxl,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.systemGray6,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSize.title2,
    fontFamily: FontFamily.bold,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.subheadline,
    color: Colors.systemGray,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
  },
  form: {
    flex: 1,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.systemGray6,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    height: 52,
    marginBottom: Spacing.lg,
  },
  inputIcon: {
    marginRight: Spacing.md,
  },
  input: {
    flex: 1,
    fontFamily: FontFamily.regular,
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
  submitButton: {
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.md,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitText: {
    fontSize: FontSize.body,
    fontFamily: FontFamily.semibold,
    fontWeight: FontWeight.semibold,
    color: Colors.white,
  },
  backButton: {
    alignSelf: 'center',
    marginTop: Spacing.xl,
  },
  backText: {
    fontSize: FontSize.footnote,
    color: Colors.accent,
    fontFamily: FontFamily.medium,
    fontWeight: FontWeight.medium,
  },
});
