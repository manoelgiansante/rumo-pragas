import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { AI_CONSENT_VERSION, AIConsentPurpose } from '../services/aiConsent';
import { BorderRadius, Colors, FontFamily, FontSize, Spacing } from '../constants/theme';

interface AIConsentModalProps {
  visible: boolean;
  purpose: AIConsentPurpose;
  onAccept: () => Promise<void> | void;
  onCancel: () => void;
}

const PRIVACY_URL = 'https://pragas.agrorumo.com/privacidade';
const TERMS_URL = 'https://pragas.agrorumo.com/termos';

export function AIConsentModal({ visible, purpose, onAccept, onCancel }: AIConsentModalProps) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);

  const accept = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onAccept();
    } finally {
      setSaving(false);
    }
  };

  const openDocument = (url: string) => {
    // Keep the consent modal mounted behind the system browser. Closing the
    // browser returns to the same disclosure, so the user can make an informed
    // choice without having to retrigger the diagnosis/chat action.
    void WebBrowser.openBrowserAsync(url);
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onCancel}
      accessibilityViewIsModal
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityElementsHidden />
        <View style={styles.card} testID={`ai-consent-${purpose}`}>
          <View style={styles.icon} accessibilityElementsHidden>
            <Ionicons name="shield-checkmark-outline" size={28} color={Colors.accent} />
          </View>
          <Text style={styles.title} accessibilityRole="header">
            {t('aiConsent.title')}
          </Text>
          <Text style={styles.description}>{t(`aiConsent.${purpose}Disclosure`)}</Text>
          <Text style={styles.safety}>{t('aiConsent.safety')}</Text>

          <View style={styles.links}>
            <TouchableOpacity
              testID="ai-consent-privacy"
              onPress={() => openDocument(PRIVACY_URL)}
              accessibilityRole="link"
              accessibilityLabel={t('auth.privacyPolicy')}
            >
              <Text style={styles.link}>{t('auth.privacyPolicy')}</Text>
            </TouchableOpacity>
            <Text style={styles.linkSeparator}>·</Text>
            <TouchableOpacity
              testID="ai-consent-terms"
              onPress={() => openDocument(TERMS_URL)}
              accessibilityRole="link"
              accessibilityLabel={t('auth.termsOfUse')}
            >
              <Text style={styles.link}>{t('auth.termsOfUse')}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.version}>
            {t('aiConsent.version', { version: AI_CONSENT_VERSION })}
          </Text>

          <TouchableOpacity
            testID="ai-consent-accept"
            style={[styles.acceptButton, saving && styles.disabled]}
            onPress={accept}
            disabled={saving}
            accessibilityRole="button"
            accessibilityState={{ disabled: saving, busy: saving }}
            accessibilityLabel={t('aiConsent.accept')}
          >
            {saving ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.acceptText}>{t('aiConsent.accept')}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            testID="ai-consent-cancel"
            style={styles.cancelButton}
            onPress={onCancel}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel={t('aiConsent.cancel')}
          >
            <Text style={styles.cancelText}>{t('aiConsent.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  card: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.white,
    padding: Spacing.xl,
  },
  icon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${Colors.accent}15`,
    marginBottom: Spacing.md,
  },
  title: {
    color: Colors.text,
    fontFamily: FontFamily.bold,
    fontSize: FontSize.title2,
    marginBottom: Spacing.sm,
  },
  description: {
    color: Colors.text,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.subheadline,
    lineHeight: 22,
  },
  safety: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.caption,
    lineHeight: 18,
    marginTop: Spacing.md,
  },
  links: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  link: {
    color: Colors.accent,
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.subheadline,
    textDecorationLine: 'underline',
  },
  linkSeparator: { color: Colors.textTertiary },
  version: {
    color: Colors.textTertiary,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.caption2,
    marginTop: Spacing.sm,
  },
  acceptButton: {
    minHeight: 50,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent,
    marginTop: Spacing.lg,
  },
  disabled: { opacity: 0.65 },
  acceptText: {
    color: Colors.white,
    fontFamily: FontFamily.bold,
    fontSize: FontSize.headline,
  },
  cancelButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xs,
  },
  cancelText: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.subheadline,
  },
});
