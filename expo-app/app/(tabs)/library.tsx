import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  useColorScheme,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, FontSize } from '../../constants/theme';
import { CROPS } from '../../constants/crops';
import { PremiumCard } from '../../components/PremiumCard';
import { SearchInput } from '../../components/SearchInput';
import { useTranslation } from 'react-i18next';
import { useResponsive } from '../../hooks/useResponsive';

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

const severityColor: Record<string, string> = {
  critical: Colors.coral,
  high: Colors.warmAmber,
  medium: Colors.techBlue,
  low: Colors.accent,
};

export default function LibraryScreen() {
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const { isTablet, contentMaxWidth, numColumns } = useResponsive();
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
          placeholder={t('library.searchPlaceholder')}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: Spacing.lg, gap: 8, paddingBottom: 8 }}
      >
        <TouchableOpacity
          style={[styles.chip, !selectedCrop && styles.chipActive]}
          onPress={() => setSelectedCrop(null)}
          accessibilityLabel="Todas as culturas"
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
            style={[styles.chip, selectedCrop === crop.id && styles.chipActive]}
            onPress={() => setSelectedCrop(crop.id === selectedCrop ? null : crop.id)}
            accessibilityLabel={`Filtrar por ${crop.displayName}`}
            accessibilityRole="button"
            accessibilityState={{ selected: selectedCrop === crop.id }}
          >
            <Text style={styles.chipEmoji} accessibilityElementsHidden>{crop.icon}</Text>
            <Text style={[styles.chipText, selectedCrop === crop.id && styles.chipTextActive]}>
              {crop.displayName}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={keyExtractor}
        key={isTablet ? 'tablet' : 'phone'}
        contentContainerStyle={[
          { padding: Spacing.lg, paddingBottom: 100 },
          isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center' as const, width: '100%' },
        ]}
        ListEmptyComponent={
          <View style={styles.center}>
            <Ionicons name="search-outline" size={48} color={Colors.systemGray3} />
            <Text style={[styles.emptyTitle, isDark && styles.textDark]}>
              {t('library.noPests')}
            </Text>
            <Text style={styles.emptyDesc}>
              Tente buscar com outro termo ou selecione outra cultura
            </Text>
            {(search || selectedCrop) && (
              <TouchableOpacity
                style={styles.clearFilterBtn}
                onPress={() => {
                  setSearch('');
                  setSelectedCrop(null);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="close-circle" size={16} color={Colors.accent} />
                <Text style={styles.clearFilterText}>Limpar filtros</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <PremiumCard style={{ marginBottom: Spacing.sm }}>
            <View style={styles.pestRow}>
              <View
                style={[styles.severityDot, { backgroundColor: severityColor[item.severity] }]}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.pestName, isDark && styles.textDark]}>{item.name}</Text>
                <Text style={styles.pestScientific}>{item.scientific}</Text>
              </View>
              <Text style={styles.cropBadge}>{CROPS.find((c) => c.id === item.crop)?.icon}</Text>
            </View>
          </PremiumCard>
        )}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  containerDark: { backgroundColor: Colors.backgroundDark },
  center: { alignItems: 'center', paddingTop: 60 },
  searchRow: { marginHorizontal: Spacing.lg, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.systemGray6,
    gap: 4,
  },
  chipActive: { backgroundColor: Colors.accent },
  chipText: { fontSize: FontSize.caption, fontWeight: '600', color: Colors.textSecondary },
  chipTextActive: { color: '#FFF' },
  chipEmoji: { fontSize: 14 },
  pestRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  severityDot: { width: 8, height: 8, borderRadius: 4 },
  pestName: { fontSize: FontSize.subheadline, fontWeight: '600' },
  pestScientific: { fontSize: FontSize.caption, color: Colors.textSecondary, fontStyle: 'italic' },
  cropBadge: { fontSize: 20 },
  emptyTitle: { fontSize: FontSize.title3, fontWeight: '700', marginTop: 16 },
  emptyDesc: { fontSize: FontSize.subheadline, color: Colors.textSecondary, marginTop: 4, textAlign: 'center' },
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
  clearFilterText: { fontSize: FontSize.subheadline, fontWeight: '600', color: Colors.accent },
  textDark: { color: Colors.textDark },
});
