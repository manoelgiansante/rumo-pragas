import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  FlatList,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, BorderRadius, FontSize, Gradients } from '../../constants/theme';
import { CROPS, CropType } from '../../constants/crops';
import { SearchInput } from '../../components/SearchInput';
import { useResponsive } from '../../hooks/useResponsive';

export default function CropSelectScreen() {
  const { imageUri, imageBase64 } = useLocalSearchParams<{
    imageUri: string;
    imageBase64: string;
  }>();
  const [selected, setSelected] = useState<CropType>(CROPS[0]);
  const [search, setSearch] = useState('');
  const { isTablet, contentMaxWidth, numColumns } = useResponsive();
  const isNavigating = useRef(false);

  const filtered = CROPS.filter(
    (c) => !search || c.displayName.toLowerCase().includes(search.toLowerCase()),
  );

  const handleSelect = (crop: CropType) => {
    Haptics.selectionAsync();
    setSelected(crop);
  };

  const startDiagnosis = () => {
    // Prevent double-tap (race condition from audit ACH)
    if (isNavigating.current) return;
    isNavigating.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: '/diagnosis/loading',
      params: { imageUri, imageBase64, cropId: selected.id, cropApiName: selected.apiName },
    });
    // Reset after short delay in case user navigates back
    setTimeout(() => {
      isNavigating.current = false;
    }, 2000);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityLabel="Voltar"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerText}>Selecionar Cultura</Text>
        <View style={{ width: 36 }} />
      </View>

      {imageUri && (
        <View
          style={styles.preview}
          accessible
          accessibilityLabel="Imagem selecionada. Escolha a cultura para melhor precisao"
        >
          <Image
            source={{ uri: imageUri }}
            style={styles.previewImage}
            accessibilityLabel="Foto selecionada para diagnostico"
            accessibilityRole="image"
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.previewTitle}>Imagem selecionada</Text>
            <Text style={styles.previewSub}>Escolha a cultura para melhor precisão</Text>
          </View>
          <Ionicons
            name="checkmark-circle"
            size={24}
            color={Colors.accent}
            accessibilityElementsHidden
          />
        </View>
      )}

      <View style={styles.searchRow}>
        <SearchInput value={search} onChangeText={setSearch} placeholder="Buscar cultura..." />
      </View>

      <Text style={styles.question}>Qual cultura está afetada?</Text>

      <FlatList
        data={filtered}
        numColumns={numColumns}
        key={isTablet ? 'tablet' : 'phone'}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          { paddingHorizontal: Spacing.lg },
          isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center' as const, width: '100%' },
        ]}
        columnWrapperStyle={{ gap: 8, marginBottom: 8 }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="search-outline" size={48} color={Colors.systemGray3} />
            <Text style={styles.emptyTitle}>Nenhuma cultura encontrada</Text>
            <Text style={styles.emptyDesc}>Tente buscar com outro termo</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.cropItem, selected.id === item.id && styles.cropItemSelected]}
            onPress={() => handleSelect(item)}
            activeOpacity={0.7}
            accessibilityLabel={`${item.displayName}${selected.id === item.id ? ', selecionado' : ''}`}
            accessibilityRole="button"
            accessibilityState={{ selected: selected.id === item.id }}
          >
            <Text style={styles.cropEmoji} accessibilityElementsHidden>
              {item.icon}
            </Text>
            <Text
              style={[styles.cropName, selected.id === item.id && styles.cropNameSelected]}
              numberOfLines={1}
            >
              {item.displayName}
            </Text>
          </TouchableOpacity>
        )}
      />

      <View style={styles.footer}>
        <TouchableOpacity
          onPress={startDiagnosis}
          activeOpacity={0.8}
          accessibilityLabel={`Iniciar diagnostico para ${selected.displayName}`}
          accessibilityRole="button"
          accessibilityHint="Envia a imagem para analise por inteligencia artificial"
        >
          <LinearGradient colors={Gradients.hero as any} style={styles.startBtn}>
            <Text style={styles.startBtnText}>Iniciar Diagnóstico</Text>
            <Ionicons name="arrow-forward" size={18} color="#FFF" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.systemGray6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: { fontSize: FontSize.headline, fontWeight: '700' },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: Spacing.lg,
    padding: Spacing.lg,
    backgroundColor: Colors.systemGray6,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  previewImage: { width: 56, height: 56, borderRadius: 12 },
  previewTitle: { fontSize: FontSize.subheadline, fontWeight: '600' },
  previewSub: { fontSize: FontSize.caption, color: Colors.textSecondary, marginTop: 2 },
  searchRow: { marginHorizontal: Spacing.lg, marginBottom: Spacing.md },
  question: {
    fontSize: FontSize.title3,
    fontWeight: '700',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  cropItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.systemGray6,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cropItemSelected: { borderColor: Colors.accent, backgroundColor: Colors.accent + '15' },
  cropEmoji: { fontSize: 28 },
  cropName: {
    fontSize: FontSize.caption2,
    fontWeight: '600',
    marginTop: 4,
    color: Colors.textSecondary,
  },
  cropNameSelected: { color: Colors.accent },
  emptyContainer: { alignItems: 'center', paddingTop: 40, gap: 8 },
  emptyTitle: { fontSize: FontSize.title3, fontWeight: '700', color: Colors.text },
  emptyDesc: { fontSize: FontSize.subheadline, color: Colors.textSecondary },
  footer: { padding: Spacing.lg, paddingBottom: 32 },
  startBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    height: 56,
    borderRadius: BorderRadius.lg,
  },
  startBtnText: { fontSize: FontSize.headline, fontWeight: '700', color: '#FFF' },
});
