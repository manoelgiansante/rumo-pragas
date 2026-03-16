import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Modal,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../src/contexts/AuthContext';
import { AppTheme } from '../src/utils/theme';

export default function AuthScreen() {
  const {
    isAuthenticated,
    isLoading,
    errorMessage,
    signIn,
    signUp,
    requestPasswordReset,
    clearError,
  } = useAuth();
  const router = useRouter();

  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);

  // Reset password modal
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  // Animation
  const heroOpacity = React.useRef(new Animated.Value(0)).current;
  const heroTranslateY = React.useRef(new Animated.Value(12)).current;
  const iconScale = React.useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(heroOpacity, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(heroTranslateY, { toValue: 0, duration: 800, useNativeDriver: true }),
      Animated.spring(iconScale, { toValue: 1, friction: 6, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/(tabs)/home');
    }
  }, [isAuthenticated]);

  const handleSubmit = async () => {
    if (isSignUpMode) {
      await signUp(email, password, fullName);
    } else {
      await signIn(email, password);
    }
  };

  const handleResetPassword = async () => {
    setIsResetting(true);
    const msg = await requestPasswordReset(resetEmail);
    setResetMessage(msg);
    setIsResetting(false);
  };

  const toggleMode = (signUp: boolean) => {
    clearError();
    setIsSignUpMode(signUp);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero Section */}
        <View style={styles.heroContainer}>
          <View style={styles.heroGradient}>
            {/* Gradient overlay at bottom */}
            <View style={styles.heroFade} />
          </View>
          <View style={styles.heroContent}>
            <Animated.View
              style={[
                styles.iconCircle,
                { opacity: heroOpacity, transform: [{ scale: iconScale }] },
              ]}
            >
              <MaterialCommunityIcons name="leaf" size={28} color="#fff" />
            </Animated.View>
            <Animated.View
              style={[
                styles.heroTextContainer,
                { opacity: heroOpacity, transform: [{ translateY: heroTranslateY }] },
              ]}
            >
              <Text style={styles.heroTitle}>Rumo Pragas</Text>
              <Text style={styles.heroSubtitle}>
                {'Inteligência artificial para\nproteção de lavouras'}
              </Text>
            </Animated.View>
          </View>
        </View>

        {/* Form Section */}
        <View style={styles.formContainer}>
          {/* Segmented Control */}
          <View style={styles.segmentedControl}>
            <TouchableOpacity
              style={[styles.segmentButton, !isSignUpMode && styles.segmentButtonActive]}
              onPress={() => toggleMode(false)}
              activeOpacity={0.7}
            >
              <Text style={[styles.segmentText, !isSignUpMode && styles.segmentTextActive]}>
                Entrar
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentButton, isSignUpMode && styles.segmentButtonActive]}
              onPress={() => toggleMode(true)}
              activeOpacity={0.7}
            >
              <Text style={[styles.segmentText, isSignUpMode && styles.segmentTextActive]}>
                Criar Conta
              </Text>
            </TouchableOpacity>
          </View>

          {/* Fields */}
          <View style={styles.fieldsContainer}>
            {isSignUpMode && (
              <View style={styles.inputContainer}>
                <MaterialCommunityIcons
                  name="account"
                  size={18}
                  color={AppTheme.textSecondary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.textInput}
                  placeholder="Nome completo"
                  placeholderTextColor={AppTheme.textSecondary}
                  value={fullName}
                  onChangeText={setFullName}
                  autoCorrect={false}
                  autoCapitalize="words"
                />
              </View>
            )}

            <View style={styles.inputContainer}>
              <MaterialCommunityIcons
                name="email"
                size={18}
                color={AppTheme.textSecondary}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.textInput}
                placeholder="E-mail"
                placeholderTextColor={AppTheme.textSecondary}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputContainer}>
              <MaterialCommunityIcons
                name="lock"
                size={18}
                color={AppTheme.textSecondary}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.textInput}
                placeholder="Senha"
                placeholderTextColor={AppTheme.textSecondary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!passwordVisible}
                autoCapitalize="none"
              />
              <TouchableOpacity
                onPress={() => setPasswordVisible(!passwordVisible)}
                style={styles.eyeButton}
              >
                <MaterialCommunityIcons
                  name={passwordVisible ? 'eye-off' : 'eye'}
                  size={18}
                  color={AppTheme.textTertiary}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Error Message */}
          {errorMessage && (
            <View style={styles.errorContainer}>
              <MaterialCommunityIcons name="alert" size={14} color={AppTheme.coral} />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>
                {isSignUpMode ? 'Criar Conta' : 'Entrar'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Forgot Password */}
          {!isSignUpMode && (
            <TouchableOpacity
              style={styles.forgotButton}
              onPress={() => {
                setResetEmail(email);
                setResetMessage(null);
                setShowResetModal(true);
              }}
            >
              <Text style={styles.forgotButtonText}>Esqueceu sua senha?</Text>
            </TouchableOpacity>
          )}

          {/* Terms */}
          <View style={styles.termsContainer}>
            <Text style={styles.termsText}>Ao continuar, você concorda com nossos</Text>
            <View style={styles.termsLinks}>
              <TouchableOpacity
                onPress={() => Linking.openURL('https://rumopragas.com.br/termos')}
              >
                <Text style={styles.termsLink}>Termos de Uso</Text>
              </TouchableOpacity>
              <Text style={styles.termsText}> e </Text>
              <TouchableOpacity
                onPress={() => Linking.openURL('https://rumopragas.com.br/privacidade')}
              >
                <Text style={styles.termsLink}>Política de Privacidade</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Reset Password Modal */}
      <Modal
        visible={showResetModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowResetModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowResetModal(false)}>
              <Text style={styles.modalCloseText}>Fechar</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            <View style={styles.resetIconCircle}>
              <MaterialCommunityIcons name="email-check" size={34} color={AppTheme.accent} />
            </View>

            <Text style={styles.resetTitle}>Recuperar Senha</Text>
            <Text style={styles.resetSubtitle}>
              Digite seu e-mail para receber um link de recuperação de senha.
            </Text>

            <View style={[styles.inputContainer, styles.resetInput]}>
              <MaterialCommunityIcons
                name="email"
                size={18}
                color={AppTheme.textSecondary}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.textInput}
                placeholder="E-mail"
                placeholderTextColor={AppTheme.textSecondary}
                value={resetEmail}
                onChangeText={setResetEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {resetMessage && (
              <View style={styles.resetMessageContainer}>
                <MaterialCommunityIcons
                  name={resetMessage.includes('enviado') ? 'check-circle' : 'alert'}
                  size={14}
                  color={resetMessage.includes('enviado') ? AppTheme.accent : AppTheme.coral}
                />
                <Text
                  style={[
                    styles.resetMessageText,
                    {
                      color: resetMessage.includes('enviado')
                        ? AppTheme.accent
                        : AppTheme.coral,
                    },
                  ]}
                >
                  {resetMessage}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.submitButton, isResetting && styles.submitButtonDisabled]}
              onPress={handleResetPassword}
              disabled={isResetting}
              activeOpacity={0.8}
            >
              {isResetting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>Enviar Link</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    flexGrow: 1,
  },

  // Hero
  heroContainer: {
    height: 310,
    position: 'relative',
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: AppTheme.accent,
  },
  heroFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 120,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  heroContent: {
    position: 'absolute',
    bottom: 24,
    left: 24,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  heroTextContainer: {
    gap: 6,
  },
  heroTitle: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#fff',
  },
  heroSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 20,
  },

  // Form
  formContainer: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 40,
  },

  // Segmented Control
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: AppTheme.surfaceCard,
    borderRadius: 8,
    padding: 2,
    marginBottom: 20,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 7,
    alignItems: 'center',
  },
  segmentButtonActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '500',
    color: AppTheme.textSecondary,
  },
  segmentTextActive: {
    color: AppTheme.text,
    fontWeight: '600',
  },

  // Input Fields
  fieldsContainer: {
    gap: 14,
    marginBottom: 14,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppTheme.surfaceCard,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  inputIcon: {
    width: 20,
    marginRight: 12,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: AppTheme.text,
    padding: 0,
  },
  eyeButton: {
    padding: 4,
  },

  // Error
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    marginBottom: 14,
  },
  errorText: {
    fontSize: 13,
    color: AppTheme.coral,
    flex: 1,
  },

  // Submit Button
  submitButton: {
    backgroundColor: AppTheme.accent,
    borderRadius: 14,
    height: 54,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: AppTheme.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#fff',
  },

  // Forgot Password
  forgotButton: {
    alignSelf: 'flex-end',
    marginBottom: 20,
  },
  forgotButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: AppTheme.accent,
  },

  // Terms
  termsContainer: {
    alignItems: 'center',
    paddingTop: 8,
  },
  termsText: {
    fontSize: 11,
    color: AppTheme.textTertiary,
  },
  termsLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  termsLink: {
    fontSize: 11,
    fontWeight: '500',
    color: AppTheme.accent,
  },

  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  modalCloseText: {
    fontSize: 16,
    color: AppTheme.accent,
    fontWeight: '500',
  },
  modalContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    alignItems: 'center',
  },
  resetIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${AppTheme.accent}1F`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  resetTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: AppTheme.text,
    marginBottom: 8,
  },
  resetSubtitle: {
    fontSize: 14,
    color: AppTheme.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  resetInput: {
    alignSelf: 'stretch',
    marginBottom: 16,
  },
  resetMessageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'stretch',
    paddingHorizontal: 4,
    marginBottom: 16,
  },
  resetMessageText: {
    fontSize: 13,
    flex: 1,
  },
});
