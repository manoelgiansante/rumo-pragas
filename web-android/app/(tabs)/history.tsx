import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  ScrollView,
  Pressable,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppTheme } from '../../src/utils/theme';
import { useAuth } from '../../src/contexts/AuthContext';
import { SupabaseService } from '../../src/services/supabaseService';
import { DiagnosisResult } from '../../src/types';
import {
  getDiagnosisDisplayName,
  getSeverityLevel,
  getSeverityDisplay,
  getConfidenceLevel,
  getConfidenceDisplay,
  isHealthy,
  parseDiagnosisNotes,
  mapCropName,
} from '../../src/types/helpers';
import { CROPS, getCropByKey } from '../../src/types/cropData';
import { shortDate } from '../../src/utils/dateFormat';

/* ────────────────────────────────────────────────────────────────────────────
 * DiagnosisResult Detail Modal
 * ──────────────────────────────────────────────────────────────────────────── */

function DiagnosisResultModal({
  visible,
  diagnosis,
  onClose,
}: {
  visible: boolean;
  diagnosis: DiagnosisResult | null;
  onClose: () => void;
}) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['description', 'symptoms']),
  );

  if (!diagnosis) return null;

  const parsed = parseDiagnosisNotes(diagnosis.notes);
  const enrichment = parsed?.enrichment;
  const severity = getSeverityLevel(diagnosis);
  const severityInfo = getSeverityDisplay(severity);
  const confLevel = getConfidenceLevel(diagnosis.confidence);
  const confInfo = getConfidenceDisplay(confLevel);
  const healthy = isHealthy(diagnosis);
  const displayName = getDiagnosisDisplayName(diagnosis);
  const preds = parsed?.predictions || parsed?.id_array || [];
  const scientificName = preds.find((p) => p.id !== 'Healthy')?.scientific_name;
  const cropKey = mapCropName(diagnosis.crop);
  const cropInfo = cropKey ? getCropByKey(cropKey) : undefined;

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const bullets = (items: string[]) =>
    items.map((t, i) => (
      <View key={i} style={rs.bulletRow}>
        <View style={rs.bulletDot} />
        <Text style={rs.bulletText}>{t}</Text>
      </View>
    ));

  const section = (
    id: string,
    title: string,
    icon: string,
    color: string,
    children: React.ReactNode,
  ) => {
    const open = expandedSections.has(id);
    return (
      <View style={rs.card} key={id}>
        <TouchableOpacity style={rs.cardHead} onPress={() => toggleSection(id)} activeOpacity={0.7}>
          <View style={[rs.iconBox, { backgroundColor: color + '1F' }]}>
            <MaterialCommunityIcons name={icon as any} size={16} color={color} />
          </View>
          <Text style={rs.cardTitle}>{title}</Text>
          <View style={{ flex: 1 }} />
          <MaterialCommunityIcons
            name={open ? 'chevron-down' : 'chevron-right'}
            size={14}
            color={AppTheme.textTertiary}
          />
        </TouchableOpacity>
        {open && (
          <>
            <View style={rs.divider} />
            <View style={rs.cardBody}>{children}</View>
          </>
        )}
      </View>
    );
  };

  const warning = (msg: string) => (
    <View style={rs.warn}>
      <MaterialCommunityIcons name="alert" size={12} color="#FF9500" />
      <Text style={rs.warnText}>{msg}</Text>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={rs.root}>
        {/* toolbar */}
        <View style={rs.toolbar}>
          <Text style={rs.toolTitle}>Resultado</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={rs.closeBtn}>Fechar</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
          {/* header gradient */}
          <View
            style={[
              rs.header,
              { backgroundColor: healthy ? AppTheme.accent : severityInfo.color + '26' },
            ]}
          >
            <View style={rs.headerInner}>
              <View
                style={[
                  rs.hCircle,
                  { backgroundColor: healthy ? 'rgba(255,255,255,0.2)' : severityInfo.color + '26' },
                ]}
              >
                <MaterialCommunityIcons
                  name={healthy ? 'check-circle' : (severityInfo.icon as any)}
                  size={28}
                  color={healthy ? '#fff' : severityInfo.color}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[rs.hTitle, healthy && { color: '#fff' }]}>
                  {healthy ? 'Planta Saudável' : displayName}
                </Text>
                {healthy ? (
                  <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14 }}>
                    Nenhuma praga ou doença detectada
                  </Text>
                ) : scientificName ? (
                  <Text style={{ color: AppTheme.textSecondary, fontSize: 14, fontStyle: 'italic' }}>
                    {scientificName}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>

          {/* badges row */}
          <View style={rs.badges}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', paddingHorizontal: 20, gap: 8 }}>
                <Badge text={severityInfo.label} icon={severityInfo.icon} color={severityInfo.color} />
                <Badge text={`Confiança: ${confInfo.range}`} icon="chart-bar" color={confInfo.color} />
                {cropInfo && (
                  <Badge text={cropInfo.displayName} icon={cropInfo.icon} color={cropInfo.accentColor} />
                )}
              </View>
            </ScrollView>
          </View>

          {/* collapsible content */}
          <View style={{ paddingTop: 16 }}>
            {enrichment?.description
              ? section('description', 'Descrição', 'file-document', AppTheme.accent, (
                  <Text style={rs.body}>{enrichment.description}</Text>
                ))
              : null}
            {enrichment?.symptoms?.length
              ? section('symptoms', 'Sintomas', 'eye', AppTheme.coral, bullets(enrichment.symptoms))
              : null}
            {enrichment?.causes?.length
              ? section('causes', 'Causas', 'alert', AppTheme.warmAmber, bullets(enrichment.causes))
              : null}
            {enrichment?.favorable_conditions?.length
              ? section(
                  'conditions',
                  'Condições Favoráveis',
                  'weather-partly-cloudy',
                  '#00BCD4',
                  bullets(enrichment.favorable_conditions),
                )
              : null}
            {enrichment?.lifecycle
              ? section('lifecycle', 'Ciclo de Vida', 'autorenew', '#009688', (
                  <Text style={rs.body}>{enrichment.lifecycle}</Text>
                ))
              : null}
            {enrichment?.monitoring?.length
              ? section('monitoring', 'Monitoramento', 'binoculars', AppTheme.techIndigo, bullets(enrichment.monitoring))
              : null}
            {enrichment?.cultural_treatment?.length
              ? section(
                  'cultural',
                  'Controle Cultural / MIP',
                  'hand-back-left',
                  AppTheme.accent,
                  bullets(enrichment.cultural_treatment),
                )
              : null}
            {enrichment?.chemical_treatment?.length
              ? section('chemical', 'Controle Químico', 'flask', AppTheme.techBlue, (
                  <View>
                    {warning('Consulte um agrônomo para receituário agronômico')}
                    {bullets(enrichment.chemical_treatment)}
                  </View>
                ))
              : null}
            {enrichment?.biological_treatment?.length
              ? section(
                  'biological',
                  'Controle Biológico',
                  'ladybug',
                  AppTheme.accentLight,
                  bullets(enrichment.biological_treatment),
                )
              : null}
            {enrichment?.recommended_products?.length
              ? section('products', 'Produtos Recomendados', 'pill', '#26A69A', (
                  <View>
                    {warning('Verifique registro no AGROFIT/MAPA antes de aplicar')}
                    {enrichment.recommended_products.map((p, i) => (
                      <View key={i} style={rs.prodCard}>
                        <Text style={rs.prodName}>{p.name}</Text>
                        {p.active_ingredient && (
                          <Text style={rs.prodLine}>
                            <Text style={rs.prodLabel}>Princípio ativo: </Text>
                            {p.active_ingredient}
                          </Text>
                        )}
                        {p.dosage && (
                          <Text style={rs.prodLine}>
                            <Text style={rs.prodLabel}>Dosagem: </Text>
                            {p.dosage}
                          </Text>
                        )}
                        {p.safety_period && (
                          <Text style={rs.prodLine}>
                            <Text style={rs.prodLabel}>Carência: </Text>
                            {p.safety_period}
                          </Text>
                        )}
                        {p.toxic_class && (
                          <Text style={rs.prodLine}>
                            <Text style={rs.prodLabel}>Classe: </Text>
                            {p.toxic_class}
                          </Text>
                        )}
                      </View>
                    ))}
                  </View>
                ))
              : null}
            {enrichment?.prevention?.length
              ? section('prevention', 'Prevenção', 'shield-check', '#00BCD4', bullets(enrichment.prevention))
              : null}
            {enrichment?.resistance_info
              ? section('resistance', 'Resistência', 'shield-alert', AppTheme.coral, (
                  <Text style={rs.body}>{enrichment.resistance_info}</Text>
                ))
              : null}
            {enrichment?.economic_impact
              ? section('impact', 'Impacto Econômico', 'chart-line', AppTheme.coral, (
                  <Text style={rs.body}>{enrichment.economic_impact}</Text>
                ))
              : null}
            {enrichment?.related_pests?.length
              ? section(
                  'related',
                  'Pragas Relacionadas',
                  'link-variant',
                  AppTheme.techIndigo,
                  bullets(enrichment.related_pests),
                )
              : null}
            {enrichment?.mip_strategy
              ? section('mip', 'Estratégia MIP', 'shield-half-full', AppTheme.accent, (
                  <Text style={rs.body}>{enrichment.mip_strategy}</Text>
                ))
              : null}
            {enrichment?.action_threshold
              ? section('threshold', 'Nível de Ação', 'speedometer', AppTheme.warmAmber, (
                  <Text style={rs.body}>{enrichment.action_threshold}</Text>
                ))
              : null}

            {/* confidence detail */}
            <View style={[rs.card, { marginBottom: 32 }]}>
              <View style={rs.cardBody}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <MaterialCommunityIcons name="cpu-64-bit" size={14} color={AppTheme.accent} />
                  <Text style={[rs.cardTitle, { color: AppTheme.accent }]}>Detalhes da Análise</Text>
                </View>
                <View style={rs.divider} />
                <View style={{ marginTop: 8 }}>
                  <DRow label="Cultura selecionada" value={diagnosis.crop} />
                  {parsed?.crop ? <DRow label="Cultura detectada" value={parsed.crop} /> : null}
                  {parsed?.crop_confidence != null ? (
                    <DRow label="Confiança da cultura" value={`${Math.round(parsed.crop_confidence * 100)}%`} />
                  ) : null}
                  {diagnosis.confidence != null ? (
                    <DRow label="Confiança da praga" value={`${Math.round(diagnosis.confidence * 100)}%`} />
                  ) : null}
                  {diagnosis.pest_id ? <DRow label="ID Agrio" value={diagnosis.pest_id} /> : null}
                  {diagnosis.location_name ? <DRow label="Localização" value={diagnosis.location_name} /> : null}
                </View>
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Badge({ text, icon, color }: { text: string; icon: string; color: string }) {
  return (
    <View style={[rs.badge, { backgroundColor: color + '1F' }]}>
      <MaterialCommunityIcons name={icon as any} size={11} color={color} />
      <Text style={[rs.badgeText, { color }]}>{text}</Text>
    </View>
  );
}

function DRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={{ fontSize: 14, color: AppTheme.textSecondary }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: '600', color: AppTheme.text }}>{value}</Text>
    </View>
  );
}

const rs = StyleSheet.create({
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
  header: { height: 160, justifyContent: 'flex-end' },
  headerInner: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 16 },
  hCircle: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center' },
  hTitle: { fontSize: 20, fontWeight: 'bold', color: AppTheme.text },
  badges: { backgroundColor: AppTheme.cardBackground, paddingVertical: 16 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 5,
  },
  badgeText: { fontSize: 12, fontWeight: '600' },
  card: {
    backgroundColor: AppTheme.cardBackground,
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 10 },
  iconBox: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 14, fontWeight: 'bold', color: AppTheme.text },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: AppTheme.border, marginHorizontal: 16 },
  cardBody: { paddingHorizontal: 16, paddingVertical: 14 },
  body: { fontSize: 14, color: AppTheme.text, lineHeight: 20 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 10 },
  bulletDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: AppTheme.accent, marginTop: 7 },
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
  prodCard: { backgroundColor: AppTheme.surfaceCard, borderRadius: 8, padding: 10, marginBottom: 8 },
  prodName: { fontSize: 14, fontWeight: '600', color: AppTheme.text, marginBottom: 4 },
  prodLine: { fontSize: 12, color: AppTheme.text, marginTop: 2 },
  prodLabel: { color: AppTheme.textSecondary },
});

/* ────────────────────────────────────────────────────────────────────────────
 * History Screen
 * ──────────────────────────────────────────────────────────────────────────── */

export default function HistoryScreen() {
  const { accessToken, currentUser } = useAuth();
  const [diagnoses, setDiagnoses] = useState<DiagnosisResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedCropFilter, setSelectedCropFilter] = useState<string | null>(null);
  const [selectedDiagnosis, setSelectedDiagnosis] = useState<DiagnosisResult | null>(null);
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!accessToken || !currentUser?.id) return;
    try {
      const data = await SupabaseService.fetchDiagnoses(accessToken, currentUser.id);
      setDiagnoses(data);
    } catch {
      /* silent */
    }
  }, [accessToken, currentUser?.id]);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      await loadHistory();
      setIsLoading(false);
    })();
  }, [loadHistory]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadHistory();
    setRefreshing(false);
  }, [loadHistory]);

  const filtered = diagnoses.filter((d) => {
    const name = getDiagnosisDisplayName(d).toLowerCase();
    const matchSearch = !searchText || name.includes(searchText.toLowerCase());
    const ck = mapCropName(d.crop);
    const matchCrop = !selectedCropFilter || ck === selectedCropFilter;
    return matchSearch && matchCrop;
  });

  const handleDelete = (item: DiagnosisResult) => {
    Alert.alert('Excluir', 'Deseja excluir este diagnóstico?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            if (accessToken) {
              await SupabaseService.deleteDiagnosis(accessToken, item.id);
              setDiagnoses((p) => p.filter((d) => d.id !== item.id));
            }
          } catch {
            Alert.alert('Erro', 'Não foi possível excluir o diagnóstico.');
          }
        },
      },
    ]);
  };

  const renderRow = ({ item }: { item: DiagnosisResult }) => {
    const name = getDiagnosisDisplayName(item);
    const sev = getSeverityLevel(item);
    const si = getSeverityDisplay(sev);
    const h = isHealthy(item);
    const ck = mapCropName(item.crop);
    const ci = ck ? getCropByKey(ck) : undefined;

    return (
      <TouchableOpacity style={s.row} onPress={() => setSelectedDiagnosis(item)} activeOpacity={0.7}>
        <View style={[s.rowIcon, { backgroundColor: h ? AppTheme.accent + '1F' : si.color + '1F' }]}>
          <MaterialCommunityIcons
            name={h ? 'check-circle' : (si.icon as any)}
            size={22}
            color={h ? AppTheme.accent : si.color}
          />
        </View>
        <View style={s.rowInfo}>
          <Text style={s.rowName} numberOfLines={1}>{name}</Text>
          <View style={s.rowMeta}>
            {ci && (
              <View style={s.cropBadge}>
                <MaterialCommunityIcons name={ci.icon as any} size={9} color={ci.accentColor} />
                <Text style={[s.cropText, { color: ci.accentColor }]}>{ci.displayName}</Text>
              </View>
            )}
            {item.confidence != null && (
              <>
                <Text style={s.dot}>{'  \u2022  '}</Text>
                <Text style={s.conf}>{Math.round(item.confidence * 100)}%</Text>
              </>
            )}
          </View>
        </View>
        <View style={s.rowRight}>
          <Text style={s.date}>{shortDate(item.created_at)}</Text>
          <View style={[s.sevBar, { backgroundColor: si.color }]} />
        </View>
        <TouchableOpacity
          style={{ paddingLeft: 4 }}
          onPress={() => handleDelete(item)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialCommunityIcons name="delete-outline" size={20} color={AppTheme.coral} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>Histórico</Text>
        <TouchableOpacity onPress={() => setShowFilterMenu(true)}>
          <MaterialCommunityIcons
            name={selectedCropFilter ? 'filter' : 'filter-outline'}
            size={24}
            color={selectedCropFilter ? AppTheme.accent : AppTheme.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={s.search}>
        <MaterialCommunityIcons name="magnify" size={18} color={AppTheme.textSecondary} />
        <TextInput
          style={s.searchInput}
          placeholder="Buscar por praga..."
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

      {/* Active filter badge */}
      {selectedCropFilter && (() => {
        const ci = getCropByKey(selectedCropFilter);
        return (
          <View style={s.filterRow}>
            <View style={s.filterBadge}>
              <MaterialCommunityIcons name={(ci?.icon as any) || 'leaf'} size={14} color={ci?.accentColor || AppTheme.accent} />
              <Text style={[s.filterLabel, { color: ci?.accentColor || AppTheme.accent }]}>
                Filtro: {ci?.displayName || selectedCropFilter}
              </Text>
              <TouchableOpacity onPress={() => setSelectedCropFilter(null)}>
                <Text style={s.clearBtn}>Limpar</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })()}

      {/* Content */}
      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={AppTheme.accent} />
          <Text style={s.stateLabel}>Carregando histórico...</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={s.center}>
          <MaterialCommunityIcons name="file-search-outline" size={56} color={AppTheme.textTertiary} />
          <Text style={s.emptyTitle}>Nenhum diagnóstico</Text>
          <Text style={s.stateLabel}>
            Seus diagnósticos aparecerão aqui após a primeira análise.
          </Text>
          <Text style={s.hint}>Use a aba Início para fazer seu primeiro diagnóstico</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          renderItem={renderRow}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListHeaderComponent={
            <Text style={s.count}>{filtered.length} diagnósticos</Text>
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={AppTheme.accent} />
          }
        />
      )}

      {/* Filter menu */}
      <Modal visible={showFilterMenu} transparent animationType="fade">
        <Pressable style={s.overlay} onPress={() => setShowFilterMenu(false)}>
          <ScrollView style={s.menuScroll} contentContainerStyle={{ paddingVertical: 8 }}>
            <TouchableOpacity
              style={s.menuItem}
              onPress={() => { setSelectedCropFilter(null); setShowFilterMenu(false); }}
            >
              <MaterialCommunityIcons name="view-grid" size={18} color={AppTheme.techBlue} />
              <Text style={s.menuText}>Todos</Text>
            </TouchableOpacity>
            {CROPS.map((c) => (
              <TouchableOpacity
                key={c.key}
                style={s.menuItem}
                onPress={() => { setSelectedCropFilter(c.key); setShowFilterMenu(false); }}
              >
                <MaterialCommunityIcons name={c.icon as any} size={18} color={c.accentColor} />
                <Text style={s.menuText}>{c.displayName}</Text>
                {selectedCropFilter === c.key && (
                  <MaterialCommunityIcons name="check" size={16} color={AppTheme.accent} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Pressable>
      </Modal>

      {/* Result detail */}
      <DiagnosisResultModal
        visible={!!selectedDiagnosis}
        diagnosis={selectedDiagnosis}
        onClose={() => setSelectedDiagnosis(null)}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    marginVertical: 8,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 15, color: AppTheme.text },
  filterRow: { paddingHorizontal: 16, marginBottom: 8 },
  filterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppTheme.cardBackground,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  filterLabel: { fontSize: 13, fontWeight: '500', flex: 1 },
  clearBtn: { fontSize: 13, color: AppTheme.techBlue },
  count: {
    fontSize: 12,
    color: AppTheme.textSecondary,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    textTransform: 'uppercase',
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: AppTheme.text, marginTop: 16 },
  stateLabel: { fontSize: 14, color: AppTheme.textSecondary, marginTop: 8, textAlign: 'center' },
  hint: { fontSize: 12, color: AppTheme.textTertiary, marginTop: 8, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppTheme.cardBackground,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 14,
    padding: 14,
    gap: 14,
  },
  rowIcon: { width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  rowInfo: { flex: 1, gap: 4 },
  rowName: { fontSize: 14, fontWeight: '600', color: AppTheme.text },
  rowMeta: { flexDirection: 'row', alignItems: 'center' },
  cropBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  cropText: { fontSize: 10, fontWeight: '500' },
  dot: { fontSize: 10, color: AppTheme.textTertiary },
  conf: { fontSize: 10, fontWeight: '600', color: AppTheme.textSecondary },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  date: { fontSize: 10, color: AppTheme.textTertiary },
  sevBar: { width: 24, height: 4, borderRadius: 2 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-start',
    paddingTop: 100,
    alignItems: 'flex-end',
    paddingRight: 16,
  },
  menuScroll: {
    backgroundColor: AppTheme.cardBackground,
    borderRadius: 14,
    width: 220,
    maxHeight: 420,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 10 },
  menuText: { fontSize: 14, color: AppTheme.text, flex: 1 },
});
