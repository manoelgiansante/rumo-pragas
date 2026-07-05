import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { showAlert } from '../../services/dialog';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Colors,
  Spacing,
  BorderRadius,
  FontSize,
  Gradients,
  FontFamily,
} from '../../constants/theme';
import { DiagnosisCard } from '../../components/DiagnosisCard';
import type { DiagnosisResult, AgrioPrediction } from '../../types/diagnosis';
import { parseNotes } from '../../types/diagnosis';
import { SearchInput } from '../../components/SearchInput';
import { savePestToCache } from '../../services/pestRegistry';
import { supabase } from '../../services/supabase';
import { useAuthContext } from '../../contexts/AuthContext';
import { HistorySkeleton } from '../../components/HistorySkeleton';
import { useTranslation } from 'react-i18next';
import { useResponsive } from '../../hooks/useResponsive';
import * as Haptics from 'expo-haptics';
import * as Sentry from '@sentry/react-native';

export default function HistoryScreen() {
  const { t } = useTranslation();
  const { user, session } = useAuthContext();
  const isDark = useColorScheme() === 'dark';
  const { isTablet, contentMaxWidth } = useResponsive();
  const [diagnoses, setDiagnoses] = useState<DiagnosisResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');

  const loadDiagnoses = async () => {
    if (!session?.access_token || !user?.id) return;
    setLoading(true);
    setError(false);
    try {
      const { data, error: queryError } = await supabase
        .from('pragas_diagnoses')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (queryError) throw queryError;
      setDiagnoses(data ?? []);
    } catch (err) {
      if (__DEV__) console.error('[History] Erro ao buscar diagnosticos:', err);
      Sentry.captureException(err, { tags: { feature: 'history.load' } });
      setError(true);
    }
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      loadDiagnoses();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, session]),
  );

  const deleteDiagnosis = async (id: string) => {
    showAlert(t('history.deleteTitle'), t('history.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('history.deleteTitle'),
        style: 'destructive',
        onPress: async () => {
          try {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            const { error } = await supabase.from('pragas_diagnoses').delete().eq('id', id);
            if (error) {
              Sentry.captureException(error, { tags: { feature: 'history.delete' } });
              showAlert(t('common.error'), t('history.deleteError'));
              return;
            }
            setDiagnoses((d) => d.filter((x) => x.id !== id));
          } catch (err) {
            if (__DEV__) console.error('[History] Failed to delete diagnosis:', err);
            Sentry.captureException(err, { tags: { feature: 'history.delete' } });
            showAlert(t('common.error'), t('history.deleteError'));
          }
        },
      },
    ]);
  };

  // Tap a history row → open its diagnosis. For real pests we warm the offline
  // pest cache from the stored record first, so the fact sheet always renders
  // even on a fresh install / different device (the cache is otherwise only
  // populated by result.tsx on the device that ran the diagnosis). Healthy /
  // invalid-image records have no pest fact sheet, so we rebuild the full result
  // screen from the record instead (it is self-contained via the `data` param).
  const openDiagnosis = useCallback((item: DiagnosisResult) => {
    void Haptics.selectionAsync().catch(() => {
      /* haptics best-effort */
    });
    const pestId = item.pest_id;
    const isHealthy =
      !pestId || pestId === 'Healthy' || (item.pest_name || '').toLowerCase().includes('healthy');
    const isInvalid = pestId === 'invalid_image';

    if (!pestId || isHealthy || isInvalid) {
      router.push({ pathname: '/diagnosis/result', params: { data: JSON.stringify(item) } });
      return;
    }

    const notes = item.parsedNotes ?? parseNotes(item.notes);
    const enrichment = notes?.enrichment ?? {};
    const predictions: AgrioPrediction[] = notes?.predictions ?? notes?.id_array ?? [];
    const alternatives = predictions.filter((p) => p.id !== pestId).slice(0, 3);
    void savePestToCache({
      id: pestId,
      pest_name: item.pest_name,
      scientific_name: enrichment.scientific_name,
      crop: item.crop,
      image_uri: item.image_url,
      confidence: item.confidence,
      enrichment,
      alternatives,
    });
    router.push(`/diagnosis/pest/${encodeURIComponent(pestId)}`);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDiagnoses();
    setRefreshing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, session]);

  const filtered = useMemo(
    () =>
      diagnoses.filter(
        (d) =>
          !search ||
          (d.pest_name || '').toLowerCase().includes(search.toLowerCase()) ||
          (d.crop || '').toLowerCase().includes(search.toLowerCase()),
      ),
    [diagnoses, search],
  );

  const keyExtractor = useCallback((item: DiagnosisResult) => item.id, []);

  if (loading) {
    // Top safe area: tab screens render header-less (headerShown: false), so the
    // skeleton must clear the status bar / notch exactly like the loaded screen.
    return (
      <SafeAreaView edges={['top']} style={[styles.container, isDark && styles.containerDark]}>
        <HistorySkeleton />
      </SafeAreaView>
    );
  }

  if (error && diagnoses.length === 0) {
    return (
      <View style={[styles.center, isDark && styles.containerDark]}>
        <Ionicons name="cloud-offline-outline" size={48} color={Colors.coral} />
        <Text style={[styles.emptyTitle, isDark && styles.textDark]}>
          {t('history.errorLoading')}
        </Text>
        <Text style={styles.emptyDesc}>{t('history.errorLoadingDesc')}</Text>
        <TouchableOpacity
          testID="history-retry"
          onPress={loadDiagnoses}
          activeOpacity={0.7}
          style={styles.retryButton}
          accessibilityLabel={t('history.retryA11y')}
          accessibilityRole="button"
        >
          <Ionicons name="refresh" size={18} color={Colors.white} accessibilityElementsHidden />
          <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.container, isDark && styles.containerDark]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View
          style={[
            styles.searchRow,
            isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center' as const, width: '100%' },
          ]}
        >
          <SearchInput
            testID="history-search"
            value={search}
            onChangeText={setSearch}
            placeholder={t('history.searchPlaceholder')}
          />
        </View>

        <FlatList
          data={filtered}
          keyExtractor={keyExtractor}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[
            { padding: Spacing.lg, paddingBottom: 100 },
            isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center' as const, width: '100%' },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.accent}
              colors={[Colors.accent]}
            />
          }
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          ListEmptyComponent={
            diagnoses.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIllustration}>
                  <LinearGradient
                    colors={[Colors.accentLight + '33', Colors.accent + '14']}
                    style={styles.emptyIllustrationBg}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  />
                  <View style={styles.emptyIllustrationRing}>
                    <LinearGradient
                      colors={Gradients.hero}
                      style={styles.emptyIllustrationInner}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <Ionicons name="leaf" size={36} color="#FFF" />
                    </LinearGradient>
                  </View>
                </View>
                <Text style={[styles.emptyTitle, isDark && styles.textDark]}>
                  {t('diagnosis.emptyHistoryTitle')}
                </Text>
                <Text style={styles.emptyDesc}>{t('diagnosis.emptyHistoryDesc')}</Text>
                <TouchableOpacity
                  testID="history-empty-cta-start"
                  onPress={() => router.push('/diagnosis/camera')}
                  activeOpacity={0.85}
                  style={styles.emptyCtaShadow}
                  accessibilityRole="button"
                  accessibilityLabel={t('diagnosis.startFirstDiagnosis')}
                >
                  <LinearGradient
                    colors={Gradients.hero}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.emptyCta}
                  >
                    <Ionicons name="camera" size={18} color="#FFF" />
                    <Text style={styles.emptyCtaText}>{t('diagnosis.startFirstDiagnosis')}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.center}>
                <Ionicons name="search-outline" size={48} color={Colors.systemGray3} />
                <Text style={[styles.emptyTitle, isDark && styles.textDark]}>
                  {t('history.noDiagnoses')}
                </Text>
                <Text style={styles.emptyDesc}>{t('history.noDiagnosesDesc')}</Text>
              </View>
            )
          }
          ListHeaderComponent={
            <Text style={[styles.count, isDark && styles.textDark]}>
              {t('history.diagnosisCount', { count: filtered.length })}
            </Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`history-item-${item.id}`}
              onPress={() => openDiagnosis(item)}
              onLongPress={() => deleteDiagnosis(item.id)}
              activeOpacity={0.8}
              accessibilityLabel={t('history.itemA11y', {
                pest: item.pest_name || t('history.noName'),
                crop: item.crop || t('history.notInformed'),
                confidence: Math.round((item.confidence ?? 0) * 100),
              })}
              accessibilityRole="button"
              accessibilityHint={t('history.openHint')}
            >
              <DiagnosisCard diagnosis={item} />
            </TouchableOpacity>
          )}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  containerDark: { backgroundColor: Colors.backgroundDark },
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  searchRow: { marginHorizontal: Spacing.lg, marginTop: Spacing.lg },
  count: {
    fontSize: FontSize.subheadline,
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
    marginBottom: Spacing.md,
  },
  loadingText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.subheadline,
    color: Colors.textSecondary,
    marginTop: 12,
  },
  emptyTitle: {
    fontSize: FontSize.title3,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    marginTop: 16,
  },
  emptyDesc: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.subheadline,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  textDark: { color: Colors.textDark },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.lg,
  },
  retryButtonText: {
    fontSize: FontSize.subheadline,
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
    color: Colors.white,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: Spacing.xl,
  },
  emptyIllustration: {
    width: 160,
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  emptyIllustrationBg: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
  },
  emptyIllustrationRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  emptyIllustrationInner: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyCtaShadow: {
    marginTop: Spacing.xl,
    shadowColor: Colors.accentDark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
    borderRadius: BorderRadius.lg,
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 14,
    borderRadius: BorderRadius.lg,
  },
  emptyCtaText: {
    color: '#FFF',
    fontSize: FontSize.headline,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
  },
});
