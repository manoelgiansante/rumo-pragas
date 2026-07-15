import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Crypto from 'expo-crypto';
import { useAuthContext } from '../../contexts/AuthContext';
import {
  AdminAIReport,
  AdminReportStatus,
  isPragasAdmin,
  listAdminAIReports,
  updateAdminAIReport,
} from '../../services/adminAIReports';
import { BorderRadius, Colors, FontFamily, FontSize, Spacing } from '../../constants/theme';

const FILTERS: Array<AdminReportStatus | 'all'> = [
  'all',
  'received',
  'reviewing',
  'resolved',
  'dismissed',
];

export default function AdminAIReportsScreen() {
  const { t } = useTranslation();
  const { user, session } = useAuthContext();
  const allowed = isPragasAdmin(user);
  const [filter, setFilter] = useState<AdminReportStatus | 'all'>('received');
  const [reports, setReports] = useState<AdminAIReport[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const updateOperationRefs = useRef<Record<string, { fingerprint: string; key: string }>>({});

  const load = useCallback(async () => {
    if (!allowed || !session?.access_token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const options: { limit: number; status?: AdminReportStatus } = { limit: 100 };
      if (filter !== 'all') options.status = filter;
      const page = await listAdminAIReports(session.access_token, options);
      setReports(page.reports);
      setNotes(
        Object.fromEntries(page.reports.map((report) => [report.id, report.reviewNote ?? ''])),
      );
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [allowed, filter, session?.access_token]);

  useEffect(() => {
    void load();
  }, [load]);

  const update = async (report: AdminAIReport, status: Exclude<AdminReportStatus, 'received'>) => {
    if (!session?.access_token || updatingId) return;
    setUpdatingId(report.id);
    try {
      const input: Parameters<typeof updateAdminAIReport>[1] = { id: report.id, status };
      const note = notes[report.id]?.trim();
      if (note) input.note = note;
      const fingerprint = JSON.stringify(input);
      const existing = updateOperationRefs.current[report.id];
      if (!existing || existing.fingerprint !== fingerprint) {
        updateOperationRefs.current[report.id] = { fingerprint, key: Crypto.randomUUID() };
      }
      await updateAdminAIReport(
        session.access_token,
        input,
        updateOperationRefs.current[report.id]!.key,
      );
      delete updateOperationRefs.current[report.id];
      await load();
    } catch {
      setError(true);
    } finally {
      setUpdatingId(null);
    }
  };

  if (!allowed) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center} accessibilityRole="alert" testID="admin-ai-reports-forbidden">
          <Ionicons name="lock-closed" size={40} color={Colors.coral} />
          <Text style={styles.title}>{t('adminAIReports.forbiddenTitle')}</Text>
          <Text style={styles.centerText}>{t('adminAIReports.forbidden')}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.back()}>
            <Text style={styles.primaryButtonText}>{t('common.done')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          testID="admin-ai-reports-back"
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('common.done')}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} accessibilityRole="header">
          {t('adminAIReports.title')}
        </Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={styles.filters} accessibilityRole="radiogroup">
        {FILTERS.map((status) => (
          <TouchableOpacity
            key={status}
            testID={`admin-ai-reports-filter-${status}`}
            style={[styles.filter, filter === status && styles.filterSelected]}
            onPress={() => setFilter(status)}
            accessibilityRole="radio"
            accessibilityState={{ selected: filter === status }}
          >
            <Text style={[styles.filterText, filter === status && styles.filterTextSelected]}>
              {t(`adminAIReports.status.${status}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center} testID="admin-ai-reports-loading">
          <ActivityIndicator size="large" color={Colors.accent} />
          <Text style={styles.centerText}>{t('common.loading')}</Text>
        </View>
      ) : error ? (
        <View style={styles.center} accessibilityRole="alert" testID="admin-ai-reports-error">
          <Text style={styles.title}>{t('adminAIReports.error')}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={load}>
            <Text style={styles.primaryButtonText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : reports.length === 0 ? (
        <View style={styles.center} testID="admin-ai-reports-empty">
          <Ionicons name="checkmark-circle-outline" size={42} color={Colors.accent} />
          <Text style={styles.title}>{t('adminAIReports.empty')}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {reports.map((report) => (
            <View key={report.id} style={styles.card} testID={`admin-ai-report-${report.id}`}>
              <View style={styles.cardHeader}>
                <Text style={styles.reason}>{t(`adminAIReports.reason.${report.reason}`)}</Text>
                <Text style={styles.status}>{t(`adminAIReports.status.${report.status}`)}</Text>
              </View>
              <Text style={styles.meta}>
                {report.reporter} · {new Date(report.createdAt).toLocaleString()}
              </Text>
              <Text style={styles.content} selectable>
                {report.content}
              </Text>
              {report.details ? <Text style={styles.details}>{report.details}</Text> : null}
              <TextInput
                testID={`admin-ai-report-note-${report.id}`}
                style={styles.note}
                value={notes[report.id] ?? ''}
                onChangeText={(value) =>
                  setNotes((current) => ({ ...current, [report.id]: value }))
                }
                placeholder={t('adminAIReports.notePlaceholder')}
                placeholderTextColor={Colors.textTertiary}
                multiline
                maxLength={2000}
                accessibilityLabel={t('adminAIReports.noteA11y')}
              />
              <View style={styles.actions}>
                {report.status === 'received' ? (
                  <StatusButton
                    label={t('adminAIReports.review')}
                    onPress={() => update(report, 'reviewing')}
                    disabled={updatingId !== null}
                  />
                ) : null}
                {report.status !== 'resolved' && report.status !== 'dismissed' ? (
                  <StatusButton
                    label={t('adminAIReports.resolve')}
                    onPress={() => update(report, 'resolved')}
                    disabled={updatingId !== null}
                  />
                ) : null}
                {report.status !== 'dismissed' && report.status !== 'resolved' ? (
                  <StatusButton
                    label={t('adminAIReports.dismiss')}
                    onPress={() => update(report, 'dismissed')}
                    disabled={updatingId !== null}
                    secondary
                  />
                ) : null}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function StatusButton({
  label,
  onPress,
  disabled,
  secondary = false,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  secondary?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.action, secondary && styles.actionSecondary, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      <Text style={[styles.actionText, secondary && styles.actionTextSecondary]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: Colors.text, fontFamily: FontFamily.bold, fontSize: FontSize.headline },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: Spacing.md },
  filter: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: Colors.systemGray4,
    borderRadius: 999,
  },
  filterSelected: { borderColor: Colors.accent, backgroundColor: `${Colors.accent}12` },
  filterText: { color: Colors.textSecondary, fontFamily: FontFamily.regular, fontSize: 11 },
  filterTextSelected: { color: Colors.accent, fontFamily: FontFamily.semibold },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    padding: Spacing.xl,
  },
  centerText: { color: Colors.textSecondary, fontFamily: FontFamily.regular, textAlign: 'center' },
  title: { color: Colors.text, fontFamily: FontFamily.bold, fontSize: FontSize.title3 },
  primaryButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.accent,
  },
  primaryButtonText: { color: Colors.white, fontFamily: FontFamily.bold },
  list: { gap: Spacing.md, padding: Spacing.md, paddingBottom: 40 },
  card: {
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.separator,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.card,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md },
  reason: { flex: 1, color: Colors.coral, fontFamily: FontFamily.bold, fontSize: FontSize.caption },
  status: { color: Colors.accent, fontFamily: FontFamily.semibold, fontSize: FontSize.caption },
  meta: { color: Colors.textTertiary, fontFamily: FontFamily.regular, fontSize: 10, marginTop: 4 },
  content: { color: Colors.text, fontFamily: FontFamily.regular, lineHeight: 20, marginTop: 10 },
  details: { color: Colors.textSecondary, fontFamily: FontFamily.italic, marginTop: 8 },
  note: {
    minHeight: 70,
    marginTop: Spacing.md,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.systemGray4,
    borderRadius: BorderRadius.md,
    color: Colors.text,
    textAlignVertical: 'top',
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: Spacing.md },
  action: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.accent,
  },
  actionSecondary: { backgroundColor: `${Colors.coral}14` },
  actionText: { color: Colors.white, fontFamily: FontFamily.semibold, fontSize: FontSize.caption },
  actionTextSecondary: { color: Colors.coral },
  disabled: { opacity: 0.5 },
});
