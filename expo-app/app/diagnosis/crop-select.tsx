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
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, BorderRadius, FontSize, FontWeight } from '../../constants/theme';
import { CROPS, CropType } from '../../constants/crops';
import { SearchInput } from '../../components/SearchInput';
import { useResponsive } from '../../hooks/useResponsive';
import { useTranslation } from 'react-i18next';
import { useDiagnosis } from '../../contexts/DiagnosisContext';
import { AppBar, IconButton, Button } from '../../components/ui';

export default function CropSelectScreen() {
  const { t } = useTranslation();
  const { imageUri, setCrop } = useDiagnosis();
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
    if (isNavigating.current) return;
    isNavigating.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCrop(selected.id);
    router.push({
      pathname: '/diagnosis/loading',
      params: { cropApiName: selected.apiName },
    });
    setTimeout(() => {
      isNavigating.current = false;
    }, 2000);
  };

  // 2-col grid on phone (or whatever useResponsive returns for tablet).
  // Spec: 2-col grid of crop tiles (16px radius, 1.5px border separator,
  // selected = 2px accent border + 5% accent tint background).
  const gridColumns = isTablet ? numColumns : 2;

  return (
    <SafeAreaView style={styles.container}>
      <AppBar
        title={t('cropSelect.title')}
        leading={
          <IconButton
            iconName="arrow-back"
            accessibilityLabel={t('cropSelect.back')}
            onPress={() => router.back()}
          />
        }
      />

      {imageUri && (
        <View style={styles.preview} accessible accessibilityLabel={t('cropSelect.imageA11y')}>
          <Image
            source={{ uri: imageUri }}
            style={styles.previewImage}
            accessibilityLabel={t('cropSelect.photoA11y')}
            accessibilityRole="image"
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.previewTitle}>{t('cropSelect.imageSelected')}</Text>
            <Text style={styles.previewSub}>{t('cropSelect.imageSelectedHint')}</Text>
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
        <SearchInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('cropSelect.searchPlaceholder')}
        />
      </View>

      <Text style={styles.question}>{t('cropSelect.question')}</Text>

      <FlatList
        data={filtered}
        numColumns={gridColumns}
        key={`grid-${gridColumns}`}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
          isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center' as const, width: '100%' },
        ]}
        columnWrapperStyle={{ gap: 12, marginBottom: 12 }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="search-outline" size={48} color={Colors.systemGray3} />
            <Text style={styles.emptyTitle}>{t('cropSelect.noCrops')}</Text>
            <Text style={styles.emptyDesc}>{t('cropSelect.noCropsHint')}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isSelected = selected.id === item.id;
          return (
            <TouchableOpacity
              style={[
                styles.cropTile,
                isSelected && {
                  borderWidth: 2,
                  borderColor: Colors.accent,
                  // 5% accent tint per spec (0x0D ≈ 5.1%)
                  backgroundColor: Colors.accent + '0D',
                },
              ]}
              onPress={() => handleSelect(item)}
              activeOpacity={0.7}
              accessibilityLabel={`${item.displayName}${isSelected ? `, ${t('cropSelect.cropSelected', { crop: '' })}` : ''}`}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
            >
              <Text style={styles.cropEmoji} accessibilityElementsHidden>
                {item.icon}
              </Text>
              <Text
                style={[styles.cropName, isSelected && { color: Colors.accent }]}
                numberOfLines={1}
              >
                {item.displayName}
              </Text>
              {/* Brand-color underline (per spec): each crop has its own colour */}
              <View
                style={[
                  styles.cropUnderline,
                  { backgroundColor: item.color },
                  isSelected && { height: 3, opacity: 1 },
                ]}
              />
            </TouchableOpacity>
          );
        }}
      />

      <View style={styles.footer}>
        <Button
          variant="primary"
          size="lg"
          block
          iconName="arrow-forward"
          onPress={startDiagnosis}
          accessibilityLabel={t('cropSelect.startA11y', { crop: selected.displayName })}
          accessibilityHint={t('cropSelect.startHint')}
        >
          {t('cropSelect.startDiagnosis')}
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: Spacing.lg,
    padding: Spacing.lg,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.separator,
  },
  previewImage: { width: 56, height: 56, borderRadius: 12 },
  previewTitle: {
    fontSize: FontSize.subheadline,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
  previewSub: { fontSize: FontSize.caption, color: Colors.textSecondary, marginTop: 2 },
  searchRow: { marginHorizontal: Spacing.lg, marginBottom: Spacing.md },
  question: {
    fontSize: FontSize.title3,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    letterSpacing: -0.3,
  },
  // Crop tile per spec: vertical layout, 1.5px separator border, radius 16, padding 16.
  cropTile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.separator,
    minHeight: 110,
  },
  cropEmoji: { fontSize: 32, marginBottom: 8 },
  cropName: {
    fontSize: FontSize.subheadline, // 15
    fontWeight: FontWeight.semibold, // 600
    color: Colors.text,
    marginBottom: 6,
  },
  cropUnderline: {
    width: 32,
    height: 2,
    borderRadius: 999,
    opacity: 0.85,
  },
  emptyContainer: { alignItems: 'center', paddingTop: 40, gap: 8 },
  emptyTitle: {
    fontSize: FontSize.title3,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  emptyDesc: { fontSize: FontSize.subheadline, color: Colors.textSecondary },
  footer: { padding: Spacing.lg, paddingBottom: Spacing.xxxl },
});
