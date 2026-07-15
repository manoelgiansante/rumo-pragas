/**
 * Pest Detail Page — `/diagnosis/pest/[id]`
 *
 * Full fact sheet for a single pest, hydrated from the local AsyncStorage
 * cache populated by `result.tsx`. Reachable from:
 *  - Result screen "Ver detalhes" CTA
 *  - History
 *  - Pest library
 *
 * The app ships 100% FREE (Apple Guideline 3.1.1): this screen is reachable by
 * every user — from the result CTA, history or a deep link. No entitlement gate.
 *
 * Data flow:
 *   mount → loadPestFromCache(user,id) → render educational fact sheet
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  ActivityIndicator,
} from 'react-native';
// Cross-platform safe area: RN's SafeAreaView is iOS-only — on Android
// (edge-to-edge) the hero back button sat under the status bar. The native
// per-view measurement is also correct inside the iOS sheet modal.
import { SafeAreaView } from 'react-native-safe-area-context';
import { showAlert } from '../../../services/dialog';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { useTranslation } from 'react-i18next';
import {
  Colors,
  Spacing,
  BorderRadius,
  FontSize,
  Gradients,
  FontFamily,
} from '../../../constants/theme';
import { PremiumCard } from '../../../components/PremiumCard';
import { CollapsibleSection } from '../../../components/CollapsibleSection';
import { loadPestFromCache, type PestCacheEntry } from '../../../services/pestRegistry';
import { useMipKnowledge } from '../../../hooks/useMipKnowledge';
import { useAuthContext } from '../../../contexts/AuthContext';
import type { AgrioEnrichment } from '../../../types/diagnosis';
import type { MipEntry } from '../../../data/mip';

const HERO_HEIGHT = 320;

type EnrichmentLabels = (key: string) => string;

/** Result of merging a diagnosis enrichment with the MIP catalog fallback. */
interface MipMergeResult {
  enrichment: AgrioEnrichment;
}

/**
 * Map a MIP catalog entry onto the AgrioEnrichment shape the fact sheet reads.
 *
 * The Agrio diagnose path (default since 2026-07-06) emits enrichment with
 * ONLY name_pt / scientific_name / severity — so lifecycle, favorable
 * conditions and monitoring come back empty and the fact sheet
 * looked blank ("Ciclo de vida não disponível…"). The rich agronomic content
 * lives in the bundled MIP catalog (`data/mip`); this maps it onto the same
 * fields the screen already renders.
 *
 * Only keys the catalog actually has data for are inserted (exact-optional-
 * property-types safe — never assigns `undefined`). Labels for the derived
 * favorable-conditions / safety-period strings are localized via `t`.
 */
function mipEntryToEnrichment(entry: MipEntry, t: EnrichmentLabels): Partial<AgrioEnrichment> {
  const out: Partial<AgrioEnrichment> = {};

  const descricao = entry.sintomas.descricao?.trim();
  if (descricao) out.symptoms = [descricao];

  const ciclo = entry.cicloVida?.trim();
  if (ciclo) out.lifecycle = ciclo;

  const favorable: string[] = [];
  const cf = entry.condicoesFavorecimento;
  if (cf.temperatura?.trim())
    favorable.push(`${t('diagnosis.mipLabelTemperature')}: ${cf.temperatura.trim()}`);
  if (cf.umidade?.trim())
    favorable.push(`${t('diagnosis.mipLabelHumidity')}: ${cf.umidade.trim()}`);
  if (cf.estacao?.trim()) favorable.push(`${t('diagnosis.mipLabelSeason')}: ${cf.estacao.trim()}`);
  if (cf.observacoes) {
    for (const o of cf.observacoes) {
      const trimmed = o?.trim();
      if (trimmed) favorable.push(trimmed);
    }
  }
  if (favorable.length > 0) out.favorable_conditions = favorable;

  if (entry.mip.cultural.length > 0) out.cultural_treatment = [...entry.mip.cultural];
  if (entry.mip.biologico.length > 0) out.biological_treatment = [...entry.mip.biologico];

  const monitoring: string[] = [];
  const metodo = entry.monitoramento.metodo?.trim();
  const freq = entry.monitoramento.frequencia?.trim();
  if (metodo) monitoring.push(metodo);
  if (freq) monitoring.push(freq);
  if (monitoring.length > 0) out.monitoring = monitoring;

  const nivel = entry.monitoramento.nivelControle?.trim();
  if (nivel) out.action_threshold = nivel;

  return out;
}

/**
 * Fill ONLY the empty fields of `base` from the MIP entry — a pure fallback.
 * The enrichment path is never removed: any field the model already provided
 * wins; the MIP catalog only backfills what came back blank.
 *
 * SAFETY: commercial products, active ingredients and other prescriptive
 * pesticide fields are never merged, even for an exact catalog match.
 */
function mergeEnrichmentWithMip(
  base: AgrioEnrichment,
  mip: MipEntry,
  t: EnrichmentLabels,
): MipMergeResult {
  const fromMip = mipEntryToEnrichment(mip, t);
  const merged = { ...base } as AgrioEnrichment & Record<string, unknown>;
  // Never surface prescriptive pesticide fields produced by AI or a fuzzy MIP
  // match. Registration, crop, dose, interval and withholding period must be
  // verified in AGROFIT and prescribed by a licensed agronomist.
  delete merged.chemical_treatment;
  delete merged.chemical_treatment_es;
  delete merged.recommended_products;
  const needArr = (v?: unknown[]) => !v || v.length === 0;
  const needStr = (v?: string) => !v || v.trim().length === 0;

  if (needArr(merged.symptoms) && fromMip.symptoms) merged.symptoms = fromMip.symptoms;
  if (needStr(merged.lifecycle) && fromMip.lifecycle) merged.lifecycle = fromMip.lifecycle;
  if (needArr(merged.favorable_conditions) && fromMip.favorable_conditions)
    merged.favorable_conditions = fromMip.favorable_conditions;
  if (needArr(merged.cultural_treatment) && fromMip.cultural_treatment)
    merged.cultural_treatment = fromMip.cultural_treatment;
  if (needArr(merged.biological_treatment) && fromMip.biological_treatment)
    merged.biological_treatment = fromMip.biological_treatment;
  if (needArr(merged.monitoring) && fromMip.monitoring) merged.monitoring = fromMip.monitoring;
  if (needStr(merged.action_threshold) && fromMip.action_threshold)
    merged.action_threshold = fromMip.action_threshold;
  if (needStr(merged.mip_strategy) && fromMip.mip_strategy)
    merged.mip_strategy = fromMip.mip_strategy;

  return { enrichment: merged };
}

function buildAgrofitSearchUrl(query: string): string {
  return `https://agrofit.agricultura.gov.br/agrofit_cons/principal_agrofit_cons?titulo=${encodeURIComponent(query)}`;
}

export default function PestDetailScreen() {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { user } = useAuthContext();
  // The Library passes name/scientific/crop as params (there is no cached
  // diagnosis for a library pest). Diagnoses reach this screen with only `id`.
  const {
    id,
    name,
    scientific,
    crop: cropParam,
  } = useLocalSearchParams<{
    id: string;
    name?: string;
    scientific?: string;
    crop?: string;
  }>();
  const [cacheEntry, setCacheEntry] = useState<PestCacheEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const data = user?.id ? await loadPestFromCache(user.id, id || '') : null;
      if (mounted) {
        setCacheEntry(data);
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id, user?.id]);

  // Effective entry: the AsyncStorage cache (populated by a diagnosis) wins.
  // When reached from the Library there is no cached diagnosis, so synthesize a
  // minimal entry from the nav params — the MIP-catalog fallback then hydrates
  // the full fact sheet (see mergeEnrichmentWithMip). Deep links with neither a
  // cache hit nor params still fall through to the "not found" state below.
  const entry = useMemo<PestCacheEntry | null>(() => {
    if (cacheEntry) return cacheEntry;
    if (!name && !scientific) return null;
    const synthEnrichment: AgrioEnrichment = {};
    if (name) synthEnrichment.name_pt = name;
    if (scientific) synthEnrichment.scientific_name = scientific;
    return {
      v: 1,
      id: id || '',
      pest_name: name,
      scientific_name: scientific,
      crop: cropParam,
      enrichment: synthEnrichment,
      updated_at: Date.now(),
    };
  }, [cacheEntry, id, name, scientific, cropParam]);

  const handleOpenLink = useCallback(
    async (url: string) => {
      try {
        const canOpen = await Linking.canOpenURL(url);
        if (canOpen) {
          await Linking.openURL(url);
        } else {
          showAlert(t('common.error'), t('diagnosis.pestDetailCannotOpenLink'));
        }
      } catch {
        showAlert(t('common.error'), t('diagnosis.pestDetailCannotOpenLink'));
      }
    },
    [t],
  );

  // FIX-1: resolve the bundled MIP catalog entry (same heuristic result.tsx
  // uses) so the fact sheet can fall back to it when the Agrio enrichment is
  // sparse. Hooks run before early returns (Rules of Hooks); the hook tolerates
  // undefined inputs while the cache entry is still loading.
  const mipKnowledge = useMipKnowledge({
    pestName: entry?.pest_name,
    enrichment: entry?.enrichment,
    crop: entry?.crop,
    enabled: !!entry?.pest_name,
  });

  // Merge: model enrichment wins field-by-field; the MIP catalog only backfills
  // non-chemical educational fields. Sanitize even when no catalog entry exists
  // so cached AI output can never expose prescriptive pesticide fields.
  const merge = useMemo<MipMergeResult>(() => {
    const base = {
      ...(entry?.enrichment ?? ({} as AgrioEnrichment)),
    } as AgrioEnrichment & Record<string, unknown>;
    delete base.chemical_treatment;
    delete base.chemical_treatment_es;
    delete base.recommended_products;
    return mipKnowledge.entry
      ? mergeEnrichmentWithMip(base, mipKnowledge.entry, t)
      : { enrichment: base };
  }, [entry?.enrichment, mipKnowledge.entry, t]);
  const displayEnrichment = merge.enrichment;

  // Only show the spinner while the cache is still loading AND we have no
  // synthetic entry from params yet (library taps render immediately).
  if (loading && !entry) {
    return (
      <SafeAreaView style={[styles.container, isDark && styles.containerDark]}>
        <View style={styles.loadingCenter}>
          <ActivityIndicator color={Colors.accent} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!entry) {
    return (
      <SafeAreaView style={[styles.container, isDark && styles.containerDark]}>
        <View style={styles.errorCenter}>
          <View style={[styles.errorIcon, { backgroundColor: Colors.systemGray5 }]}>
            <Ionicons name="leaf-outline" size={44} color={Colors.systemGray} />
          </View>
          <Text style={[styles.errorTitle, isDark && styles.textDark]}>
            {t('diagnosis.pestDetailNotFoundTitle')}
          </Text>
          <Text style={styles.errorMsg}>{t('diagnosis.pestDetailNotFoundMsg')}</Text>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => router.back()}
            accessibilityLabel={t('diagnosis.pestDetailCloseA11y')}
            accessibilityRole="button"
            testID="pest-detail-back-button"
          >
            <Text style={styles.closeBtnText}>{t('diagnosis.close')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const { pest_name, scientific_name, crop } = entry;
  // Use the MIP-merged enrichment everywhere the sheet renders agronomic data.
  const enrichment = displayEnrichment;
  const displayName = enrichment.name_pt || pest_name || t('diagnosis.pestDetected');
  // Synonyms heuristic: when enrichment provides both name_pt and the original
  // pest_name (e.g. English common name from the model), surface as synonyms.
  const synonyms: string[] = [];
  if (pest_name && enrichment.name_pt && pest_name !== enrichment.name_pt) {
    synonyms.push(pest_name);
  }
  if (enrichment.name_es && enrichment.name_es !== enrichment.name_pt) {
    synonyms.push(enrichment.name_es);
  }

  // Reference search query — pestName + crop for better recall.
  const refQuery = `${displayName}${crop ? ' ' + crop : ''}`;

  return (
    // edges=['bottom'] only: the hero image intentionally bleeds under the
    // status bar (top inset is applied to the overlay button row instead).
    <SafeAreaView edges={['bottom']} style={[styles.container, isDark && styles.containerDark]}>
      <ScrollView contentInsetAdjustmentBehavior="automatic">
        {/* HERO — no diagnosis photo is retained in this cache. */}
        <View style={styles.heroWrap}>
          <LinearGradient colors={Gradients.hero} style={styles.heroImage} />
          <LinearGradient
            colors={['transparent', 'rgba(6,40,29,0.55)', 'rgba(6,40,29,0.92)']}
            style={styles.heroGradient}
            pointerEvents="none"
          />
          <SafeAreaView edges={['top']} style={styles.heroTopSafe} pointerEvents="box-none">
            <View style={styles.heroTopRow} pointerEvents="box-none">
              <TouchableOpacity
                onPress={() => router.back()}
                style={styles.iconBtn}
                accessibilityLabel={t('diagnosis.pestDetailCloseA11y')}
                accessibilityRole="button"
                testID="pest-detail-close-button"
              >
                <Ionicons name="chevron-back" size={22} color="#FFF" />
              </TouchableOpacity>
              <View style={styles.heroTitlePill}>
                <Ionicons name="document-text" size={12} color="#FFF" />
                <Text style={styles.heroTitlePillText}>{t('diagnosis.pestDetailTitle')}</Text>
              </View>
              <View style={{ width: 38 }} />
            </View>
          </SafeAreaView>
          <View style={styles.heroContent}>
            {crop ? (
              <View style={styles.heroBadge}>
                <Ionicons name="leaf" size={11} color="#FFF" />
                <Text style={styles.heroBadgeText}>{crop}</Text>
              </View>
            ) : null}
            <Text style={styles.heroPestName} numberOfLines={2} maxFontSizeMultiplier={1.4}>
              {displayName}
            </Text>
            {scientific_name ? (
              <Text style={styles.heroScientific} numberOfLines={1}>
                {scientific_name}
              </Text>
            ) : null}
            {synonyms.length > 0 && (
              <View style={styles.synonymsRow}>
                <Text style={styles.synonymsLabel}>{t('diagnosis.pestDetailSynonyms')}:</Text>
                <Text style={styles.synonymsText} numberOfLines={2}>
                  {synonyms.join(' · ')}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* DETAILED SYMPTOMS */}
        <View style={styles.sections}>
          {(enrichment.symptoms?.length ?? 0) > 0 && (
            <CollapsibleSection
              title={t('diagnosis.pestDetailSymptomsDetailed')}
              icon="eye"
              iconColor={Colors.coral}
              defaultExpanded
            >
              {enrichment.symptoms!.map((s: string, i: number) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={[styles.bullet, { backgroundColor: Colors.coral }]} />
                  <Text style={[styles.sectionText, isDark && styles.textDark]}>{s}</Text>
                </View>
              ))}
            </CollapsibleSection>
          )}

          {/* LIFE CYCLE */}
          <CollapsibleSection
            title={t('diagnosis.pestDetailLifecycle')}
            icon="reload"
            iconColor={Colors.techBlue}
            defaultExpanded
          >
            <Text style={[styles.sectionText, isDark && styles.textDark]}>
              {enrichment.lifecycle || t('diagnosis.pestDetailLifecycleEmpty')}
            </Text>
          </CollapsibleSection>

          {/* FAVORABLE CONDITIONS — temperature/humidity/season */}
          <CollapsibleSection
            title={t('diagnosis.favorableConditions')}
            icon="thermometer"
            iconColor={Colors.warmAmber}
          >
            {(enrichment.favorable_conditions?.length ?? 0) > 0 ? (
              enrichment.favorable_conditions!.map((s: string, i: number) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={[styles.bullet, { backgroundColor: Colors.warmAmber }]} />
                  <Text style={[styles.sectionText, isDark && styles.textDark]}>{s}</Text>
                </View>
              ))
            ) : (
              <Text style={[styles.sectionText, { color: Colors.textSecondary }]}>
                {t('diagnosis.pestDetailFavorableEmpty')}
              </Text>
            )}
          </CollapsibleSection>

          {/* 3-LEVEL IPM (MIP) */}
          {(enrichment.cultural_treatment?.length ?? 0) > 0 && (
            <CollapsibleSection
              title={t('diagnosis.culturalControl')}
              icon="hand-left"
              iconColor={Colors.accent}
              defaultExpanded
            >
              {enrichment.cultural_treatment!.map((s: string, i: number) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={[styles.bullet, { backgroundColor: Colors.accent }]} />
                  <Text style={[styles.sectionText, isDark && styles.textDark]}>{s}</Text>
                </View>
              ))}
            </CollapsibleSection>
          )}
          {(enrichment.biological_treatment?.length ?? 0) > 0 && (
            <CollapsibleSection
              title={t('diagnosis.biologicalControl')}
              icon="bug"
              iconColor={Colors.accentLight}
            >
              {enrichment.biological_treatment!.map((s: string, i: number) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={[styles.bullet, { backgroundColor: Colors.accentLight }]} />
                  <Text style={[styles.sectionText, isDark && styles.textDark]}>{s}</Text>
                </View>
              ))}
            </CollapsibleSection>
          )}
          {/* MONITORING — method + frequency + action threshold */}
          <CollapsibleSection
            title={t('diagnosis.monitoring')}
            icon="eye"
            iconColor={Colors.techBlue}
          >
            {(enrichment.monitoring?.length ?? 0) > 0 ? (
              <>
                {enrichment.monitoring!.map((s: string, i: number) => (
                  <View key={i} style={styles.bulletRow}>
                    <View style={[styles.bullet, { backgroundColor: Colors.techBlue }]} />
                    <Text style={[styles.sectionText, isDark && styles.textDark]}>{s}</Text>
                  </View>
                ))}
                {enrichment.action_threshold ? (
                  <View
                    style={[
                      styles.warning,
                      { marginTop: 10, backgroundColor: Colors.coral + '14' },
                    ]}
                  >
                    <Ionicons name="alert-circle" size={14} color={Colors.coral} />
                    <Text style={[styles.warningText, { color: Colors.coral }]}>
                      <Text style={{ fontFamily: FontFamily.bold, fontWeight: '700' }}>
                        {t('diagnosis.pestDetailActionThreshold')}:{' '}
                      </Text>
                      {enrichment.action_threshold}
                    </Text>
                  </View>
                ) : null}
              </>
            ) : (
              <Text style={[styles.sectionText, { color: Colors.textSecondary }]}>
                {t('diagnosis.pestDetailMonitoringEmpty')}
              </Text>
            )}
          </CollapsibleSection>

          {/* IPM STRATEGY (when present) */}
          {enrichment.mip_strategy ? (
            <CollapsibleSection
              title={t('diagnosis.mipStrategy')}
              icon="leaf"
              iconColor={Colors.accent}
            >
              <Text style={[styles.sectionText, isDark && styles.textDark]}>
                {enrichment.mip_strategy}
              </Text>
            </CollapsibleSection>
          ) : null}

          {/* ECONOMIC IMPACT */}
          {enrichment.economic_impact ? (
            <CollapsibleSection
              title={t('diagnosis.economicImpact')}
              icon="trending-down"
              iconColor={Colors.coral}
            >
              <Text style={[styles.sectionText, isDark && styles.textDark]}>
                {enrichment.economic_impact}
              </Text>
            </CollapsibleSection>
          ) : null}
        </View>

        {/* Official registry + professional prescription. No endorsement badge. */}
        <PremiumCard style={styles.refsCard}>
          <View style={styles.refsHeader}>
            <Ionicons name="library" size={18} color={Colors.accent} />
            <Text style={[styles.refsTitle, isDark && styles.textDark]}>
              {t('diagnosis.officialConsultationTitle')}
            </Text>
          </View>
          <Text style={styles.officialConsultationText}>
            {t('diagnosis.officialConsultationText')}
          </Text>
          <ReferenceRow
            label={t('diagnosis.pestDetailReferenceAgrofit')}
            onPress={() => handleOpenLink(buildAgrofitSearchUrl(refQuery))}
            t={t}
            testID="pest-ref-agrofit"
          />
        </PremiumCard>

        {/* CREA disclaimer — same as result.tsx, mandatory on every pest fact sheet */}
        <View
          style={styles.legalDisclaimer}
          accessible
          accessibilityRole="text"
          accessibilityLabel={t('diagnosis.legalDisclaimer')}
        >
          <Ionicons
            name="information-circle"
            size={16}
            color={Colors.textSecondary}
            accessibilityElementsHidden
          />
          <Text style={styles.legalDisclaimerText}>{t('diagnosis.legalDisclaimer')}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

interface ReferenceRowProps {
  label: string;
  onPress: () => void;
  testID: string;
  t: (k: string) => string;
}

function ReferenceRow({ label, onPress, testID, t }: ReferenceRowProps) {
  return (
    <TouchableOpacity
      style={styles.refRow}
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint={t('diagnosis.pestDetailExternalLinkHint')}
      testID={testID}
      activeOpacity={0.7}
    >
      <Ionicons name="link" size={16} color={Colors.accent} />
      <Text style={styles.refRowText} numberOfLines={2}>
        {label}
      </Text>
      <Ionicons name="open-outline" size={16} color={Colors.textSecondary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  containerDark: { backgroundColor: Colors.backgroundDark },
  textDark: { color: Colors.textDark },
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  // --- Hero ---
  heroWrap: { height: HERO_HEIGHT, backgroundColor: Colors.brandDark, position: 'relative' },
  heroImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  heroGradient: { ...StyleSheet.absoluteFillObject },
  heroTopSafe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroTitlePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  heroTitlePillText: {
    color: '#FFF',
    fontSize: 12,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
  },
  heroContent: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 20,
    zIndex: 2,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: 8,
  },
  heroBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
  },
  heroPestName: {
    color: '#FFF',
    fontSize: 26,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: 30,
  },
  heroScientific: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: FontFamily.italic,
    fontSize: 14,
    marginTop: 4,
  },
  synonymsRow: { marginTop: 10, flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  synonymsLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
  },
  synonymsText: {
    fontFamily: FontFamily.regular,
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    flex: 1,
  },
  // --- Sections ---
  sections: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, gap: Spacing.sm },
  sectionText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.subheadline,
    lineHeight: 22,
    flex: 1,
    color: Colors.text,
  },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 6 },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    backgroundColor: Colors.warmAmber + '14',
    borderRadius: 8,
    marginBottom: 10,
  },
  warningText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.caption,
    color: Colors.earthText,
    flex: 1,
  },
  // --- References ---
  refsCard: { marginHorizontal: Spacing.lg, marginTop: Spacing.lg, marginBottom: Spacing.md },
  refsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  refsTitle: {
    fontSize: FontSize.subheadline,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    color: Colors.text,
  },
  officialConsultationText: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.caption,
    lineHeight: 18,
    marginBottom: Spacing.sm,
  },
  refRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.separator,
  },
  refRowText: {
    fontFamily: FontFamily.regular,
    flex: 1,
    fontSize: FontSize.subheadline,
    color: Colors.text,
  },
  // --- Error / not found ---
  errorCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  errorIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  errorTitle: {
    fontSize: FontSize.title2,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    marginBottom: 8,
    color: Colors.text,
  },
  errorMsg: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.subheadline,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
  closeBtn: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: BorderRadius.lg,
  },
  closeBtnText: {
    fontSize: FontSize.headline,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    color: '#FFF',
  },
  // --- Legal disclaimer ---
  legalDisclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginHorizontal: Spacing.lg,
    marginBottom: 32,
    padding: 12,
    backgroundColor: Colors.systemGray5,
    borderRadius: BorderRadius.sm,
  },
  legalDisclaimerText: {
    flex: 1,
    fontFamily: FontFamily.italic,
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
});
