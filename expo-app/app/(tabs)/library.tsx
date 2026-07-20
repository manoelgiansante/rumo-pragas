import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  useColorScheme,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Colors,
  Spacing,
  BorderRadius,
  FontSize,
  Gradients,
  FontFamily,
  Shadows,
  severityStyle,
} from '../../constants/theme';
import { CROPS } from '../../constants/crops';
import { SearchInput } from '../../components/SearchInput';
import { useTranslation } from 'react-i18next';
import { useResponsive } from '../../hooks/useResponsive';
import { trackPestDetailViewed } from '../../services/analytics';

/** URL-safe slug for the pest-detail route (no cache id exists for library pests). */
function pestSlug(crop: string, name: string): string {
  return `lib-${crop}-${name}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const PESTS_BY_CROP: Record<string, { name: string; scientific: string; severity: string }[]> = {
  soja: [
    { name: 'Ferrugem Asi\u00e1tica', scientific: 'Phakopsora pachyrhizi', severity: 'critical' },
    { name: 'Lagarta da Soja', scientific: 'Anticarsia gemmatalis', severity: 'high' },
    { name: 'Percevejo Marrom', scientific: 'Euschistus heros', severity: 'high' },
    { name: 'Mosca Branca', scientific: 'Bemisia tabaci', severity: 'medium' },
    { name: '\u00c1caro-rajado', scientific: 'Tetranychus urticae', severity: 'medium' },
    { name: 'Nematoide das galhas', scientific: 'Meloidogyne incognita', severity: 'high' },
  ],
  milho: [
    { name: 'Lagarta do Cartucho', scientific: 'Spodoptera frugiperda', severity: 'critical' },
    { name: 'Cigarrinha do Milho', scientific: 'Dalbulus maidis', severity: 'high' },
    { name: 'Cercosporiose', scientific: 'Cercospora zeae-maydis', severity: 'medium' },
    { name: 'Percevejo Barriga-verde', scientific: 'Dichelops melacanthus', severity: 'high' },
    { name: 'Helmintosporiose', scientific: 'Exserohilum turcicum', severity: 'medium' },
  ],
  cafe: [
    { name: 'Broca do Caf\u00e9', scientific: 'Hypothenemus hampei', severity: 'critical' },
    { name: 'Ferrugem do Caf\u00e9', scientific: 'Hemileia vastatrix', severity: 'high' },
    { name: 'Bicho Mineiro', scientific: 'Leucoptera coffeella', severity: 'medium' },
    { name: 'Nematoide das Les\u00f5es', scientific: 'Pratylenchus coffeae', severity: 'high' },
    { name: 'Cercosporiose', scientific: 'Cercospora coffeicola', severity: 'medium' },
  ],
  algodao: [
    { name: 'Bicudo do Algodoeiro', scientific: 'Anthonomus grandis', severity: 'critical' },
    { name: 'Lagarta Rosada', scientific: 'Pectinophora gossypiella', severity: 'high' },
    { name: 'Mosca Branca', scientific: 'Bemisia tabaci', severity: 'high' },
    { name: 'Ramul\u00e1ria', scientific: 'Ramularia areola', severity: 'medium' },
  ],
  cana: [
    { name: 'Broca da Cana', scientific: 'Diatraea saccharalis', severity: 'critical' },
    { name: 'Cigarrinha das Ra\u00edzes', scientific: 'Mahanarva fimbriolata', severity: 'high' },
    { name: 'Ferrugem Alaranjada', scientific: 'Puccinia kuehnii', severity: 'high' },
    { name: 'Smut', scientific: 'Sporisorium scitamineum', severity: 'medium' },
  ],
  trigo: [
    { name: 'Ferrugem da Folha', scientific: 'Puccinia triticina', severity: 'critical' },
    { name: 'Giberela', scientific: 'Fusarium graminearum', severity: 'high' },
    { name: 'Pulg\u00e3o do Trigo', scientific: 'Schizaphis graminum', severity: 'high' },
    { name: 'Mancha Amarela', scientific: 'Drechslera tritici-repentis', severity: 'medium' },
  ],
  arroz: [
    { name: 'Brusone', scientific: 'Magnaporthe oryzae', severity: 'critical' },
    { name: 'Percevejo do Gr\u00e3o', scientific: 'Oebalus poecilus', severity: 'high' },
    { name: 'Mancha Parda', scientific: 'Bipolaris oryzae', severity: 'medium' },
    { name: 'Broca do Colmo', scientific: 'Chilo suppressalis', severity: 'medium' },
  ],
  feijao: [
    { name: 'Antracnose', scientific: 'Colletotrichum lindemuthianum', severity: 'critical' },
    { name: 'Mosca Branca', scientific: 'Bemisia tabaci', severity: 'high' },
    { name: 'Ferrugem do Feijoeiro', scientific: 'Uromyces appendiculatus', severity: 'high' },
    { name: 'Crestamento Bacteriano', scientific: 'Xanthomonas axonopodis', severity: 'medium' },
  ],
  batata: [
    { name: 'Requeima', scientific: 'Phytophthora infestans', severity: 'critical' },
    { name: 'Pinta Preta', scientific: 'Alternaria solani', severity: 'high' },
    { name: 'Tra\u00e7a da Batata', scientific: 'Phthorimaea operculella', severity: 'high' },
    { name: 'Murcha Bacteriana', scientific: 'Ralstonia solanacearum', severity: 'medium' },
  ],
  tomate: [
    { name: 'Tuta Absoluta', scientific: 'Tuta absoluta', severity: 'critical' },
    { name: 'Requeima', scientific: 'Phytophthora infestans', severity: 'high' },
    { name: 'Vira-cabe\u00e7a', scientific: 'Tomato spotted wilt virus', severity: 'high' },
    { name: 'O\u00eddio', scientific: 'Leveillula taurica', severity: 'medium' },
  ],
  mandioca: [
    { name: 'Mandarov\u00e1', scientific: 'Erinnyis ello', severity: 'high' },
    { name: 'Mosca Branca', scientific: 'Aleurothrixus aepim', severity: 'high' },
    { name: 'Podrid\u00e3o Radicular', scientific: 'Phytophthora drechsleri', severity: 'medium' },
  ],
  citros: [
    { name: 'Greening/HLB', scientific: 'Candidatus Liberibacter', severity: 'critical' },
    { name: 'Cancro C\u00edtrico', scientific: 'Xanthomonas citri', severity: 'high' },
    { name: '\u00c1caro da Leprose', scientific: 'Brevipalpus yothersi', severity: 'high' },
    { name: 'Pinta Preta', scientific: 'Phyllosticta citricarpa', severity: 'medium' },
  ],
  uva: [
    { name: 'M\u00edldio', scientific: 'Plasmopara viticola', severity: 'critical' },
    { name: 'O\u00eddio', scientific: 'Uncinula necator', severity: 'high' },
    { name: 'Mosca das Frutas', scientific: 'Anastrepha fraterculus', severity: 'medium' },
  ],
  banana: [
    { name: 'Sigatoka Negra', scientific: 'Mycosphaerella fijiensis', severity: 'critical' },
    { name: 'Moleque da Bananeira', scientific: 'Cosmopolites sordidus', severity: 'high' },
    {
      name: 'Mal do Panam\u00e1',
      scientific: 'Fusarium oxysporum f.sp. cubense',
      severity: 'high',
    },
  ],
  sorgo: [
    { name: 'Pulg\u00e3o do Sorgo', scientific: 'Rhopalosiphum maidis', severity: 'high' },
    { name: 'Antracnose', scientific: 'Colletotrichum sublineolum', severity: 'high' },
    { name: 'Lagarta do Cartucho', scientific: 'Spodoptera frugiperda', severity: 'medium' },
  ],
  amendoim: [
    { name: 'Mancha Castanha', scientific: 'Cercospora arachidicola', severity: 'high' },
    { name: 'Mancha Preta', scientific: 'Cercosporidium personatum', severity: 'high' },
    { name: 'Tripes', scientific: 'Enneothrips flavens', severity: 'medium' },
  ],
  girassol: [
    { name: 'Mancha de Altern\u00e1ria', scientific: 'Alternariaster helianthi', severity: 'high' },
    { name: 'Mofo Branco', scientific: 'Sclerotinia sclerotiorum', severity: 'critical' },
    { name: 'Besouro Amarelo', scientific: 'Astylus variegatus', severity: 'medium' },
  ],
  cebola: [
    { name: 'M\u00edldio', scientific: 'Peronospora destructor', severity: 'critical' },
    { name: 'Tripes do Alho', scientific: 'Thrips tabaci', severity: 'high' },
    { name: 'Mancha P\u00farpura', scientific: 'Alternaria porri', severity: 'medium' },
  ],
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: 'severity.critical',
  high: 'severity.high',
  medium: 'severity.medium',
  low: 'severity.low',
};

const PestItem = React.memo(function PestItem({
  item,
  isDark,
}: {
  item: { name: string; scientific: string; severity: string; crop: string };
  isDark: boolean;
}) {
  const { t } = useTranslation();
  const cropInfo = CROPS.find((c) => c.id === item.crop);
  const severityLabelKey = SEVERITY_LABELS[item.severity] || 'severity.medium';

  // FIX-7: the library was a dead-end (static cards). Tapping now opens the pest
  // fact sheet. No cached diagnosis exists for a library pest, so we forward the
  // name/scientific/crop as params; pest/[id] synthesizes an entry and the MIP
  // catalog fallback hydrates the sheet.
  const handlePress = useCallback(() => {
    const slug = pestSlug(item.crop, item.name);
    trackPestDetailViewed(slug, 'library');
    router.push({
      pathname: '/diagnosis/pest/[id]',
      params: { id: slug, name: item.name, scientific: item.scientific, crop: item.crop },
    });
  }, [item]);

  const sev = severityStyle(item.severity);

  return (
    <TouchableOpacity
      style={styles.pestCard}
      onPress={handlePress}
      activeOpacity={0.85}
      accessibilityLabel={`${item.name}, ${item.scientific}, ${t('severity.label')} ${t(severityLabelKey)}, ${cropInfo?.displayName || item.crop}`}
      accessibilityRole="button"
      accessibilityHint={t('library.pestDetailHint')}
      testID={`library-pest-${item.crop}-${item.name}`}
    >
      {/* Visual "cover" — a soft severity-tinted tile with the crop mark. */}
      <LinearGradient
        colors={[sev.bg, Colors.cardElevated]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.pestCover}
      >
        <Text style={styles.pestCoverEmoji} accessibilityElementsHidden>
          {cropInfo?.icon}
        </Text>
        <View style={[styles.severityChip, { backgroundColor: sev.tint }]}>
          <View style={styles.severityDot} />
          <Text style={styles.severityChipText}>{t(severityLabelKey)}</Text>
        </View>
      </LinearGradient>
      <View style={styles.pestCardBody}>
        <Text style={[styles.pestName, isDark && styles.textDark]} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.pestScientific} numberOfLines={1}>
          {item.scientific}
        </Text>
        <View style={styles.pestCardFooter}>
          <Text style={styles.cropBadge} accessibilityElementsHidden>
            {cropInfo?.icon} {cropInfo?.displayName || item.crop}
          </Text>
          <Ionicons name="arrow-forward" size={14} color={sev.tint} />
        </View>
      </View>
    </TouchableOpacity>
  );
});

export default function LibraryScreen() {
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const { isTablet, contentMaxWidth } = useResponsive();
  // Grid: 2 cards per row on phones, 3 on tablet/desktop.
  const libColumns = isTablet ? 3 : 2;
  const [selectedCrop, setSelectedCrop] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const allPests = useMemo(() => {
    const pests: { name: string; scientific: string; severity: string; crop: string }[] = [];
    for (const [crop, list] of Object.entries(PESTS_BY_CROP)) {
      for (const pest of list) pests.push({ ...pest, crop });
    }
    return pests;
  }, []);

  const filtered = useMemo(
    () =>
      allPests.filter(
        (p) =>
          (!selectedCrop || p.crop === selectedCrop) &&
          (!search || p.name.toLowerCase().includes(search.toLowerCase())),
      ),
    [allPests, selectedCrop, search],
  );

  const keyExtractor = useCallback(
    (item: { crop: string; name: string }, i: number) => `${item.crop}-${item.name}-${i}`,
    [],
  );

  return (
    <SafeAreaView edges={['top']} style={[styles.container, isDark && styles.containerDark]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Título da tela (metodologia: toda tela tem título) — padrão large
            title alinhado ao header dos Ajustes. */}
        <View
          style={[
            styles.pageHeader,
            isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center' as const, width: '100%' },
          ]}
        >
          <Text style={[styles.pageTitle, isDark && styles.textDark]} accessibilityRole="header">
            {t('tabs.library')}
          </Text>
        </View>
        <View
          style={[
            styles.searchRow,
            isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center' as const, width: '100%' },
          ]}
        >
          <SearchInput
            testID="library-search"
            value={search}
            onChangeText={setSearch}
            placeholder={t('library.searchPlaceholder')}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: Spacing.lg, gap: 8, paddingBottom: 8 }}
        >
          <TouchableOpacity
            testID="library-chip-all"
            style={[styles.chip, !selectedCrop && styles.chipActive]}
            onPress={() => setSelectedCrop(null)}
            accessibilityLabel={t('library.allCropsA11y')}
            accessibilityRole="button"
            accessibilityState={{ selected: !selectedCrop }}
          >
            <Text style={[styles.chipText, !selectedCrop && styles.chipTextActive]}>
              {t('library.allCrops')}
            </Text>
          </TouchableOpacity>
          {CROPS.filter((c) => PESTS_BY_CROP[c.id]).map((crop) => (
            <TouchableOpacity
              key={crop.id}
              testID={`library-chip-${crop.id}`}
              style={[styles.chip, selectedCrop === crop.id && styles.chipActive]}
              onPress={() => setSelectedCrop(crop.id === selectedCrop ? null : crop.id)}
              accessibilityLabel={t('library.filterByCrop', { crop: crop.displayName })}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedCrop === crop.id }}
            >
              <Text style={styles.chipEmoji} accessibilityElementsHidden>
                {crop.icon}
              </Text>
              <Text style={[styles.chipText, selectedCrop === crop.id && styles.chipTextActive]}>
                {crop.displayName}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <FlatList
          data={filtered}
          keyExtractor={keyExtractor}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          numColumns={libColumns}
          key={`lib-${libColumns}`}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={[
            { padding: Spacing.lg, paddingBottom: 100 },
            isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center' as const, width: '100%' },
          ]}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={5}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="search-outline" size={48} color={Colors.systemGray3} />
              <Text style={[styles.emptyTitle, isDark && styles.textDark]}>
                {t('library.noPests')}
              </Text>
              <Text style={styles.emptyDesc}>{t('library.emptyHint')}</Text>
              {(search || selectedCrop) && (
                <TouchableOpacity
                  testID="library-clear-filter"
                  style={styles.clearFilterBtn}
                  onPress={() => {
                    setSearch('');
                    setSelectedCrop(null);
                  }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t('library.clearFilters')}
                >
                  <Ionicons name="close-circle" size={16} color={Colors.accent} />
                  <Text style={styles.clearFilterText}>{t('library.clearFilters')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                testID="library-empty-cta-diagnose"
                onPress={() => router.push('/diagnosis/camera')}
                activeOpacity={0.85}
                style={styles.emptyCtaShadow}
                accessibilityRole="button"
                accessibilityLabel={t('home.diagnoseNow')}
              >
                <LinearGradient
                  colors={Gradients.hero}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.emptyCta}
                >
                  <Ionicons name="camera" size={18} color="#FFF" />
                  <Text style={styles.emptyCtaText}>{t('home.diagnoseNow')}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => <PestItem item={item} isDark={isDark} />}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  containerDark: { backgroundColor: Colors.backgroundDark },
  flex: { flex: 1 },
  center: { alignItems: 'center', paddingTop: 60 },
  pageHeader: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  pageTitle: {
    fontSize: FontSize.largeTitle,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    color: Colors.text,
  },
  searchRow: { marginHorizontal: Spacing.lg, marginTop: Spacing.md, marginBottom: Spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.systemGray6,
    gap: 4,
  },
  chipActive: { backgroundColor: Colors.brand },
  chipText: {
    fontSize: FontSize.caption,
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  chipTextActive: { color: '#FFF' },
  chipEmoji: { fontSize: 14 },
  gridRow: { gap: Spacing.md },
  // --- Grid card ---
  pestCard: {
    flex: 1,
    backgroundColor: Colors.cardElevated,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.separator,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    ...Shadows.card,
  },
  pestCover: {
    height: 92,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.separator,
  },
  pestCoverEmoji: { fontSize: 42 },
  severityChip: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  severityDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.9)' },
  severityChipText: {
    fontSize: FontSize.caption2,
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
    color: '#FFF',
  },
  pestCardBody: { padding: Spacing.md, gap: 2 },
  pestName: {
    fontSize: FontSize.subheadline,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    color: Colors.text,
    lineHeight: 19,
  },
  pestScientific: {
    fontFamily: FontFamily.italic,
    fontSize: FontSize.caption2,
    color: Colors.textSecondary,
  },
  pestCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  cropBadge: {
    fontSize: FontSize.caption2,
    fontFamily: FontFamily.medium,
    fontWeight: '500',
    color: Colors.textTertiary,
    flex: 1,
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
    textAlign: 'center',
  },
  clearFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.accent + '14',
    borderRadius: BorderRadius.md,
  },
  clearFilterText: {
    fontSize: FontSize.subheadline,
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
    color: Colors.accent,
  },
  textDark: { color: Colors.textDark },
  emptyCtaShadow: {
    marginTop: Spacing.lg,
    shadowColor: Colors.accentDark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 5,
    borderRadius: BorderRadius.lg,
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 12,
    borderRadius: BorderRadius.lg,
  },
  emptyCtaText: {
    color: '#FFF',
    fontSize: FontSize.headline,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
  },
});
