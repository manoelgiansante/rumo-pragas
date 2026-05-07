import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  SectionList,
  TouchableOpacity,
  Alert,
  StyleSheet,
  useColorScheme,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, BorderRadius, FontSize, Gradients } from '../../constants/theme';
import { DiagnosisCard } from '../../components/DiagnosisCard';
import type { DiagnosisResult } from '../../types/diagnosis';
import { supabase } from '../../services/supabase';
import { useAuthContext } from '../../contexts/AuthContext';
import { HistorySkeleton } from '../../components/HistorySkeleton';
import { useTranslation } from 'react-i18next';
import { useResponsive } from '../../hooks/useResponsive';
import * as Haptics from 'expo-haptics';
import { AppBar, IconButton, Input, Chip, SectionHeader } from '../../components/ui';

const ALL_CROPS = '__all__';

type Section = {
  title: string;
  data: DiagnosisResult[];
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

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
  const [cropFilter, setCropFilter] = useState<string>(ALL_CROPS);

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
    Alert.alert(t('history.deleteTitle'), t('history.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('history.deleteTitle'),
        style: 'destructive',
        onPress: async () => {
          try {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            const { error } = await supabase.from('pragas_diagnoses').delete().eq('id', id);
            if (error) {
              Alert.alert(t('common.error'), t('history.deleteError'));
              return;
            }
            setDiagnoses((d) => d.filter((x) => x.id !== id));
          } catch (err) {
            if (__DEV__) console.error('[History] Failed to delete diagnosis:', err);
            Alert.alert(t('common.error'), t('history.deleteError'));
          }
        },
      },
    ]);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDiagnoses();
    setRefreshing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, session]);

  // Crop chips derived from current dataset (preserve original casing from data).
  const cropOptions = useMemo(() => {
    const map = new Map<string, string>(); // key=lower, value=display
    for (const d of diagnoses) {
      const c = (d.crop || '').trim();
      if (!c) continue;
      const k = c.toLowerCase();
      if (!map.has(k)) map.set(k, c);
    }
    return Array.from(map.entries()).map(([key, label]) => ({ key, label }));
  }, [diagnoses]);

  const filtered = useMemo(
    () =>
      diagnoses.filter((d) => {
        const matchesSearch =
          !search ||
          (d.pest_name || '').toLowerCase().includes(search.toLowerCase()) ||
          (d.crop || '').toLowerCase().includes(search.toLowerCase());
        const matchesCrop = cropFilter === ALL_CROPS || (d.crop || '').toLowerCase() === cropFilter;
        return matchesSearch && matchesCrop;
      }),
    [diagnoses, search, cropFilter],
  );

  // Group by date bucket (Hoje / Esta semana / Anteriores). Order preserved within each.
  const sections = useMemo<Section[]>(() => {
    if (filtered.length === 0) return [];
    const now = new Date();
    const today = startOfDay(now);
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - 7);

    const today$: DiagnosisResult[] = [];
    const week$: DiagnosisResult[] = [];
    const older$: DiagnosisResult[] = [];

    for (const d of filtered) {
      const t0 = new Date(d.created_at).getTime();
      if (Number.isNaN(t0)) {
        older$.push(d);
        continue;
      }
      if (t0 >= today.getTime()) today$.push(d);
      else if (t0 >= weekStart.getTime()) week$.push(d);
      else older$.push(d);
    }

    const out: Section[] = [];
    if (today$.length) out.push({ title: 'Hoje', data: today$ });
    if (week$.length) out.push({ title: 'Esta semana', data: week$ });
    if (older$.length) out.push({ title: 'Anteriores', data: older$ });
    return out;
  }, [filtered]);

  const keyExtractor = useCallback((item: DiagnosisResult) => item.id, []);

  if (loading) {
    return <HistorySkeleton />;
  }

  if (error && diagnoses.length === 0) {
    return (
      <View style={[styles.container, isDark && styles.containerDark]}>
        <AppBar
          title={t('history.title') || 'Histórico'}
          trailing={
            <IconButton
              iconName="filter-outline"
              accessibilityLabel={t('library.filterByCrop', { crop: '' }) || 'Filtrar'}
              onPress={loadDiagnoses}
            />
          }
        />
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={48} color={Colors.coral} />
          <Text style={[styles.emptyTitle, isDark && styles.textDark]}>
            {t('history.errorLoading')}
          </Text>
          <Text style={styles.emptyDesc}>{t('history.errorLoading')}</Text>
          <TouchableOpacity
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
      </View>
    );
  }

  const tabletWidth = isTablet
    ? { maxWidth: contentMaxWidth, alignSelf: 'center' as const, width: '100%' as const }
    : null;

  return (
    <KeyboardAvoidingView
      style={[styles.container, isDark && styles.containerDark]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <AppBar
        title={t('history.title') || 'Histórico'}
        trailing={
          <IconButton
            iconName="filter-outline"
            accessibilityLabel={t('library.filterByCrop', { crop: '' }) || 'Filtrar'}
            onPress={() => {
              // Toggle through "all" — leaves the chip row as the primary filter UI.
              setCropFilter(ALL_CROPS);
            }}
          />
        }
      />

      <View style={[styles.searchRow, tabletWidth]}>
        <Input
          value={search}
          onChangeText={setSearch}
          placeholder={t('history.searchPlaceholder')}
          leftIcon="search-outline"
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel={t('history.searchPlaceholder')}
        />
      </View>

      {cropOptions.length > 0 ? (
        <View style={tabletWidth}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.chipRow}
          >
            <Chip
              selected={cropFilter === ALL_CROPS}
              onPress={() => setCropFilter(ALL_CROPS)}
              accessibilityLabel={t('library.allCropsA11y')}
            >
              {t('library.allCrops')}
            </Chip>
            {cropOptions.map((c) => (
              <Chip
                key={c.key}
                selected={cropFilter === c.key}
                onPress={() => setCropFilter(c.key)}
                accessibilityLabel={t('library.filterByCrop', { crop: c.label })}
              >
                {c.label}
              </Chip>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <SectionList<DiagnosisResult, Section>
        sections={sections}
        keyExtractor={keyExtractor}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={[{ padding: Spacing.lg, paddingBottom: 100 }, tabletWidth]}
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
        renderSectionHeader={({ section }) => (
          <SectionHeader title={section.title} style={styles.sectionHeader} />
        )}
        renderItem={({ item }) => (
          <TouchableOpacity
            onLongPress={() => deleteDiagnosis(item.id)}
            activeOpacity={0.8}
            accessibilityLabel={t('history.itemA11y', {
              pest: item.pest_name || t('history.noName'),
              crop: item.crop || t('history.notInformed'),
              confidence: Math.round((item.confidence ?? 0) * 100),
            })}
            accessibilityRole="button"
            accessibilityHint={t('history.deleteHint')}
          >
            <DiagnosisCard diagnosis={item} />
          </TouchableOpacity>
        )}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  containerDark: { backgroundColor: Colors.backgroundDark },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  searchRow: { marginHorizontal: Spacing.lg, marginTop: Spacing.sm },
  chipRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  sectionHeader: {
    paddingHorizontal: 0,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  count: { fontSize: FontSize.subheadline, fontWeight: '600', marginBottom: Spacing.md },
  loadingText: { fontSize: FontSize.subheadline, color: Colors.textSecondary, marginTop: 12 },
  emptyTitle: { fontSize: FontSize.title3, fontWeight: '700', marginTop: 16 },
  emptyDesc: { fontSize: FontSize.subheadline, color: Colors.textSecondary, marginTop: 4 },
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
    fontWeight: '700',
  },
});
