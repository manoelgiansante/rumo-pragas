import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AIContentReportReason } from '../services/aiContentReports';
import { BorderRadius, Colors, FontFamily, FontSize, Spacing } from '../constants/theme';

const REASONS: AIContentReportReason[] = [
  'unsafe_recommendation',
  'incorrect_information',
  'harmful_content',
  'privacy',
  'other',
];

interface AIReportModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (reason: AIContentReportReason, details?: string) => Promise<void>;
}

export function AIReportModal({ visible, onClose, onSubmit }: AIReportModalProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<AIContentReportReason>('incorrect_information');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setReason('incorrect_information');
    setDetails('');
    setSubmitting(false);
  }, [visible]);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(reason, details.trim() || undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityElementsHidden />
        <View style={styles.card} testID="ai-report-modal">
          <Text style={styles.title} accessibilityRole="header">
            {t('aiReport.title')}
          </Text>
          <Text style={styles.subtitle}>{t('aiReport.subtitle')}</Text>
          <View style={styles.reasons} accessibilityRole="radiogroup">
            {REASONS.map((item) => {
              const selected = item === reason;
              return (
                <TouchableOpacity
                  key={item}
                  testID={`ai-report-reason-${item}`}
                  style={[styles.reason, selected && styles.reasonSelected]}
                  onPress={() => setReason(item)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={t(`aiReport.reasons.${item}`)}
                >
                  <Text style={[styles.reasonText, selected && styles.reasonTextSelected]}>
                    {t(`aiReport.reasons.${item}`)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TextInput
            testID="ai-report-details"
            style={styles.input}
            value={details}
            onChangeText={setDetails}
            placeholder={t('aiReport.detailsPlaceholder')}
            placeholderTextColor={Colors.textTertiary}
            multiline
            maxLength={1000}
            accessibilityLabel={t('aiReport.detailsA11y')}
          />
          <TouchableOpacity
            testID="ai-report-submit"
            style={[styles.submit, submitting && styles.disabled]}
            onPress={submit}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityState={{ busy: submitting, disabled: submitting }}
          >
            {submitting ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.submitText}>{t('aiReport.submit')}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cancel}
            onPress={onClose}
            disabled={submitting}
            accessibilityRole="button"
          >
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
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
    padding: Spacing.xl,
    backgroundColor: Colors.white,
  },
  title: { color: Colors.text, fontFamily: FontFamily.bold, fontSize: FontSize.title2 },
  subtitle: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.subheadline,
    lineHeight: 20,
    marginTop: Spacing.xs,
  },
  reasons: { gap: Spacing.sm, marginTop: Spacing.lg },
  reason: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.systemGray4,
    borderRadius: BorderRadius.md,
  },
  reasonSelected: { borderColor: Colors.accent, backgroundColor: `${Colors.accent}12` },
  reasonText: {
    color: Colors.text,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.subheadline,
  },
  reasonTextSelected: { color: Colors.accent, fontFamily: FontFamily.semibold },
  input: {
    minHeight: 88,
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.systemGray4,
    borderRadius: BorderRadius.md,
    color: Colors.text,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.subheadline,
    textAlignVertical: 'top',
  },
  submit: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.accent,
    marginTop: Spacing.lg,
  },
  disabled: { opacity: 0.65 },
  submitText: { color: Colors.white, fontFamily: FontFamily.bold, fontSize: FontSize.headline },
  cancel: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  cancelText: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.subheadline,
  },
});
