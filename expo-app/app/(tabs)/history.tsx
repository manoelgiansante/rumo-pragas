import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  StyleSheet,
  useColorScheme,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Colors, Spacing, BorderRadius, FontSize } from '../../constants/theme';
import { PremiumCard } from '../../components/PremiumCard';
import { DiagnosisCard } from '../../components/DiagnosisCard';
import { SearchInput } from '../../components/SearchInput';
import { supabase } from '../../services/supabase';
import { useAuthContext } from '../../contexts/AuthContext';
import { HistorySkeleton } from '../../components/HistorySkeleton';
import { useTranslation } from 'react-i18next';
import { useResponsive } from '../../hooks/useResponsive';
import * as Haptics from 'expo-haptics';

export default function HistoryScreen() {
  const { t } = useTranslation();
  const { user, session } = useAuthContext();
  const isDark = useColorScheme() === 'dark';
  const { isTablet, contentMaxWidth } = useResponsive();
  const [diagnoses, setDiagnoses] = useState<any[]>([]);
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
      console.error('[History] Erro ao buscar diagnosticos:', err);
      setError(true);
    }
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      loadDiagnoses();
    }, [user, session]),
  );

  const deleteDiagnosis = async (id: string) => {
    Alert.alert(t('history.deleteTitle'), t('history.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('history.deleteTitle'),
        style: 'destructive',
        onPress: async () => {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          await supabase.from('pragas_diagnoses').delete().eq('id', id);
          setDiagnoses((d) => d.filter((x) => x.id !== id));
        },
      },
    ]);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDiagnoses();
    setRefreshing(false);
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

  const keyExtractor = useCallback((item: any) => item.id, []);

  if (loading) {
    return <HistorySkeleton />;
  }

  if (error && diagnoses.length === 0) {
    return (
      <View style={[styles.center, isDark && styles.containerDark]}>
        <Ionicons name="cloud-offline-outline" size={48} color={Colors.coral} />
        <Text style={[styles.emptyTitle, isDark && styles.textDark]}>
          {t('history.errorLoading')}
        </Text>
        <Text style={styles.emptyDesc}>{t('history.errorLoading')}</Text>
        <TouchableOpacity
          onPress={loadDiagnoses}
          activeOpacity={0.7}
          style={styles.retryButton}
          accessibilityLabel="Tentar novamente"
          accessibilityRole="button"
        >
          <Ionicons name="refresh" size={18} color={Colors.white} accessibilityElementsHidden />
          <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, isDark && styles.containerDark]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View
        style={[
          styles.searchRow,
          isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center' as const, width: '100%' },
        ]}
      >
        <SearchInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('history.searchPlaceholder')}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={keyExtractor}
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
        ListEmptyComponent={
          <View style={styles.center}>
            <Ionicons name="document-text-outline" size={48} color={Colors.systemGray3} />
            <Text style={[styles.emptyTitle, isDark && styles.textDark]}>
              {t('history.noDiagnoses')}
            </Text>
            <Text style={styles.emptyDesc}>{t('history.noDiagnosesDesc')}</Text>
          </View>
        }
        ListHeaderComponent={
          <Text style={[styles.count, isDark && styles.textDark]}>
            {t('history.diagnosisCount', { count: filtered.length })}
          </Text>
        }
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
  searchRow: { marginHorizontal: Spacing.lg, marginTop: Spacing.lg },
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
});
