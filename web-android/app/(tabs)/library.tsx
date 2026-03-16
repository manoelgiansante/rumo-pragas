import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppTheme } from '../../src/utils/theme';
import { Pest, SeverityLevel } from '../../src/types';
import { allPests } from '../../src/data/pestData';
import { CROPS, getCropByKey, CropInfo } from '../../src/types/cropData';
import { getSeverityDisplay } from '../../src/types/helpers';

/* ────────────────────────────────────────────────────────────────────────────
 * PestDetailModal
 * ──────────────────────────────────────────────────────────────────────────── */

function PestDetailModal({
  visible,
  pest,
  onClose,
}: {
  visible: boolean;
  pest: Pest | null;
  onClose: () => void;
}) {
  if (!pest) return null;

  const si = getSeverityDisplay(pest.severity);
  const ci = getCropByKey(pest.crop);

  const sectionCard = (
    title: string,
    icon: string,
    color: string,
    children: React.ReactNode,
  ) => (
    <View style={pd.section}>
      <View style={pd.secHead}>
        <View style={[pd.secIconBox, { backgroundColor: color + '1F' }]}>
          <MaterialCommunityIcons name={icon as any} size={16} color={color} />
        </View>
        <Text style={pd.secTitle}>{title}</Text>
      </View>
      <View style={pd.secDivider} />
      <View style={{ marginTop: 10 }}>{children}</View>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={pd.root}>
        <View style={pd.toolbar}>
          <Text style={pd.toolTitle}>Detalhes da Praga</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={pd.closeBtn}>Fechar</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Header */}
          <View style={[pd.headerBg, { backgroundColor: si.color + '33' }]}>
            <View style={pd.headerInner}>
              <View style={[pd.hCircle, { backgroundColor: si.color + '1F', borderColor: si.color + '40', borderWidth: 2 }]}>
                <MaterialCommunityIcons name={si.icon as any} size={30} color={si.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={pd.hName}>{pest.namePt}</Text>
                <Text style={pd.hSci}>{pest.scientificName}</Text>
                <Text style={pd.hEs}>{pest.nameEs}</Text>
              </View>
            </View>
          </View>

          {/* Badges */}
          <View style={pd.badgesRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', paddingHorizontal: 20, gap: 8 }}>
                {ci && <PBadge text={ci.displayName} icon={ci.icon} color={ci.accentColor} />}
                <PBadge text={pest.category} icon="tag" color={AppTheme.techBlue} />
                <PBadge text={si.label} icon={si.icon} color={si.color} />
                {pest.isNotifiable && (
                  <PBadge text="Notificação Obrigatória" icon="alert-octagon" color={AppTheme.coral} />
                )}
              </View>
            </ScrollView>
          </View>

          {/* Detail sections */}
          <View style={{ paddingTop: 16 }}>
            {sectionCard('Sobre', 'information', AppTheme.accent, (
              <Text style={pd.body}>{pest.description}</Text>
            ))}
            {sectionCard('Sintomas', 'eye', AppTheme.coral, (
              <View>
                {pest.symptoms.map((s, i) => (
                  <View key={i} style={pd.bulletRow}>
                    <View style={[pd.bulletDot, { backgroundColor: AppTheme.coral + '99' }]} />
                    <Text style={pd.bulletText}>{s}</Text>
                  </View>
                ))}
              </View>
            ))}
            {sectionCard('Ciclo de Vida', 'autorenew', AppTheme.techIndigo, (
              <Text style={pd.body}>{pest.lifecycle}</Text>
            ))}
            {sectionCard('Controle Cultural', 'leaf', AppTheme.accent, (
              <Text style={pd.body}>{pest.treatmentCultural}</Text>
            ))}
            {sectionCard('Controle Convencional', 'flask', AppTheme.techBlue, (
              <View>
                <View style={pd.warn}>
                  <MaterialCommunityIcons name="alert" size={12} color="#FF9500" />
                  <Text style={pd.warnText}>Consulte um agrônomo para receituário agronômico</Text>
                </View>
                <Text style={pd.body}>{pest.treatmentConventional}</Text>
              </View>
            ))}
            {sectionCard('Controle Biológico', 'ladybug', AppTheme.warmAmber, (
              <Text style={pd.body}>{pest.treatmentOrganic}</Text>
            ))}
            {sectionCard('Prevenção', 'shield-check', '#00BCD4', (
              <Text style={pd.body}>{pest.prevention}</Text>
            ))}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function PBadge({ text, icon, color }: { text: string; icon: string; color: string }) {
  return (
    <View style={[pd.badge, { backgroundColor: color + '1F' }]}>
      <MaterialCommunityIcons name={icon as any} size={11} color={color} />
      <Text style={[pd.badgeText, { color }]}>{text}</Text>
    </View>
  );
}

const pd = StyleSheet.create({
  root: { flex: 1, backgroundColor: AppTheme.background },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: AppTheme.cardBackground,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: AppTheme.border,
  },
  toolTitle: { fontSize: 17, fontWeight: '600', color: AppTheme.text },
  closeBtn: { fontSize: 16, color: AppTheme.techBlue },
  headerBg: { height: 180, justifyContent: 'flex-end', backgroundColor: AppTheme.cardBackground },
  headerInner: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 16 },
  hCircle: { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center' },
  hName: { fontSize: 20, fontWeight: 'bold', color: AppTheme.text },
  hSci: { fontSize: 14, color: AppTheme.textSecondary, fontStyle: 'italic', marginTop: 2 },
  hEs: { fontSize: 12, color: AppTheme.textTertiary, marginTop: 2 },
  badgesRow: { backgroundColor: AppTheme.cardBackground, paddingVertical: 16 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 5,
  },
  badgeText: { fontSize: 12, fontWeight: '600' },
  section: {
    backgroundColor: AppTheme.cardBackground,
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  secIconBox: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  secTitle: { fontSize: 14, fontWeight: 'bold', color: AppTheme.text },
  secDivider: { height: StyleSheet.hairlineWidth, backgroundColor: AppTheme.border, marginTop: 12 },
  body: { fontSize: 14, color: AppTheme.text, lineHeight: 20 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 10 },
  bulletDot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  bulletText: { fontSize: 14, color: AppTheme.text, flex: 1, lineHeight: 20 },
  warn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,149,0,0.08)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    gap: 8,
  },
  warnText: { fontSize: 12, color: '#FF9500', flex: 1 },
});

/* ────────────────────────────────────────────────────────────────────────────
 * Library Screen
 * ──────────────────────────────────────────────────────────────────────────── */

function pestIcon(category: string): string {
  switch (category.toLowerCase()) {
    case 'lepidoptera': return 'bug';
    case 'hemiptera': return 'ladybug';
    case 'fungi': return 'leaf';
    case 'coleoptera': return 'bug';
    default: return 'leaf';
  }
}

export default function LibraryScreen() {
  const [searchText, setSearchText] = useState('');
  const [selectedCrop, setSelectedCrop] = useState<string | null>(null);
  const [selectedPest, setSelectedPest] = useState<Pest | null>(null);

  const cropCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allPests.forEach((p) => {
      counts[p.crop] = (counts[p.crop] || 0) + 1;
    });
    return CROPS.map((c) => ({ ...c, count: counts[c.key] || 0 })).filter((c) => c.count > 0);
  }, []);

  const filteredPests = useMemo(() => {
    let list = allPests;
    if (selectedCrop) list = list.filter((p) => p.crop === selectedCrop);
    if (searchText) {
      const q = searchText.toLowerCase();
      list = list.filter(
        (p) =>
          p.namePt.toLowerCase().includes(q) ||
          p.scientificName.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q),
      );
    }
    return list;
  }, [searchText, selectedCrop]);

  const renderChip = (
    icon: string,
    name: string,
    color: string,
    isSelected: boolean,
    count: number | null,
    onPress: () => void,
  ) => (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={s.chipWrap}>
      <View style={s.chipIconWrap}>
        <View
          style={[
            s.chipIconBg,
            {
              backgroundColor: isSelected ? color : color + '1F',
              shadowColor: isSelected ? color : 'transparent',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: isSelected ? 0.25 : 0,
              shadowRadius: 8,
              elevation: isSelected ? 4 : 0,
            },
          ]}
        >
          <MaterialCommunityIcons
            name={icon as any}
            size={20}
            color={isSelected ? '#fff' : color}
          />
        </View>
        {count != null && (
          <View style={[s.countBadge, { backgroundColor: color }]}>
            <Text style={s.countText}>{count}</Text>
          </View>
        )}
      </View>
      <Text
        style={[
          s.chipLabel,
          { color: isSelected ? color : AppTheme.textSecondary },
        ]}
        numberOfLines={1}
      >
        {name}
      </Text>
    </TouchableOpacity>
  );

  const renderPestCard = ({ item }: { item: Pest }) => {
    const si = getSeverityDisplay(item.severity);
    const ci = getCropByKey(item.crop);
    return (
      <TouchableOpacity
        style={s.pestCard}
        onPress={() => setSelectedPest(item)}
        activeOpacity={0.7}
      >
        <View style={[s.pcIcon, { backgroundColor: si.color + '1F' }]}>
          <MaterialCommunityIcons name={pestIcon(item.category) as any} size={22} color={si.color} />
        </View>
        <View style={s.pcInfo}>
          <Text style={s.pcName} numberOfLines={1}>{item.namePt}</Text>
          <Text style={s.pcSci} numberOfLines={1}>{item.scientificName}</Text>
          <View style={s.pcMeta}>
            {ci && (
              <View style={[s.pcCropBadge, { backgroundColor: ci.accentColor + '1A' }]}>
                <MaterialCommunityIcons name={ci.icon as any} size={9} color={ci.accentColor} />
                <Text style={[s.pcCropText, { color: ci.accentColor }]}>{ci.displayName}</Text>
              </View>
            )}
            <Text style={s.pcCategory}>{item.category}</Text>
          </View>
        </View>
        <View style={s.pcRight}>
          <View style={[s.pcSevBar, { backgroundColor: si.color }]} />
          <Text style={s.pcSevLabel}>{si.label}</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={12} color={AppTheme.textTertiary} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>Biblioteca</Text>
      </View>

      {/* Search */}
      <View style={s.search}>
        <MaterialCommunityIcons name="magnify" size={18} color={AppTheme.textSecondary} />
        <TextInput
          style={s.searchInput}
          placeholder="Buscar praga..."
          placeholderTextColor={AppTheme.textTertiary}
          value={searchText}
          onChangeText={setSearchText}
        />
        {searchText.length > 0 && (
          <TouchableOpacity onPress={() => setSearchText('')}>
            <MaterialCommunityIcons name="close-circle" size={16} color={AppTheme.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Crop chips */}
      <View style={{ marginTop: 8, marginBottom: 12 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
          {renderChip(
            'view-grid',
            'Todos',
            AppTheme.techBlue,
            selectedCrop === null,
            null,
            () => setSelectedCrop(null),
          )}
          {cropCounts.map((c) =>
            renderChip(
              c.icon,
              c.displayName,
              c.accentColor,
              selectedCrop === c.key,
              c.count,
              () => setSelectedCrop(selectedCrop === c.key ? null : c.key),
            ),
          )}
        </ScrollView>
      </View>

      {/* Pest list */}
      {filteredPests.length === 0 ? (
        <View style={s.empty}>
          <MaterialCommunityIcons name="magnify" size={48} color={AppTheme.textTertiary} />
          <Text style={s.emptyTitle}>Nenhuma praga encontrada</Text>
          <Text style={s.emptySubtitle}>Tente buscar por outro termo.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredPests}
          keyExtractor={(i) => i.id}
          renderItem={renderPestCard}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
      )}

      {/* Pest detail modal */}
      <PestDetailModal
        visible={!!selectedPest}
        pest={selectedPest}
        onClose={() => setSelectedPest(null)}
      />
    </View>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Styles
 * ──────────────────────────────────────────────────────────────────────────── */

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: AppTheme.background },
  header: {
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 8,
    backgroundColor: AppTheme.cardBackground,
  },
  title: { fontSize: 28, fontWeight: 'bold', color: AppTheme.text },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppTheme.surfaceCard,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 15, color: AppTheme.text },

  // Chips
  chipWrap: { alignItems: 'center', minWidth: 72 },
  chipIconWrap: { position: 'relative' },
  chipIconBg: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countBadge: {
    position: 'absolute',
    top: -4,
    right: -6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 18,
    alignItems: 'center',
  },
  countText: { fontSize: 10, fontWeight: 'bold', color: '#fff' },
  chipLabel: { fontSize: 10, fontWeight: '600', marginTop: 8 },

  // Pest cards
  pestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppTheme.cardBackground,
    borderRadius: 16,
    padding: 14,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  pcIcon: { width: 52, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  pcInfo: { flex: 1, gap: 4 },
  pcName: { fontSize: 14, fontWeight: '600', color: AppTheme.text },
  pcSci: { fontSize: 12, color: AppTheme.textSecondary, fontStyle: 'italic' },
  pcMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pcCropBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 3,
  },
  pcCropText: { fontSize: 10, fontWeight: '500' },
  pcCategory: { fontSize: 10, color: AppTheme.textTertiary },
  pcRight: { alignItems: 'center', gap: 4 },
  pcSevBar: { width: 4, height: 20, borderRadius: 2 },
  pcSevLabel: { fontSize: 9, fontWeight: '600', color: AppTheme.textSecondary },

  // Empty
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: AppTheme.text, marginTop: 12 },
  emptySubtitle: { fontSize: 14, color: AppTheme.textSecondary, marginTop: 4 },
});
