/**
 * Pest Detail Page — `/diagnosis/pest/[id]`
 *
 * Full fact sheet for a single pest, hydrated from the local AsyncStorage
 * cache populated by `result.tsx`. Reachable from:
 *  - Result screen "Ver detalhes" CTA
 *  - History (future)
 *  - Deep links (future)
 *
 * Premium gate: this entire screen is Pro-only. The Result CTA already
 * checks `isPro` before navigating here, but we also enforce it here so
 * that deep links / history links can't bypass.
 *
 * Data flow:
 *   mount → loadPestFromCache(id) → render hero, sections, products
 *   No remote fetch in V1 (cache-only, fully offline). When edge endpoint
 *   for pest fact sheets ships, add `fetchPestFromRemote` as fallback.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Image,
  Platform,
  useColorScheme,
  ActivityIndicator,
} from 'react-native';
import { showAlert } from '../../../services/dialog';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { useTranslation } from 'react-i18next';
import { Colors, Spacing, BorderRadius, FontSize, Gradients } from '../../../constants/theme';
import { PremiumCard } from '../../../components/PremiumCard';
import { CollapsibleSection } from '../../../components/CollapsibleSection';
import { useSubscription } from '../../../hooks/useSubscription';
import { loadPestFromCache, type PestCacheEntry } from '../../../services/pestRegistry';

const HERO_HEIGHT = 320;

// EMBRAPA + MAPA + AGROFIT search portals — opened in external browser.
// We don't deep link to a specific pest page because URL formats differ per
// portal; the search query produces a reliable landing.
function buildEmbrapaSearchUrl(query: string): string {
  return `https://www.embrapa.br/busca-de-publicacoes?p_p_id=buscapublicacao_WAR_pcebusca6_1portlet&p_p_state=normal&_buscapublicacao_WAR_pcebusca6_1portlet_queryString=${encodeURIComponent(query)}`;
}
function buildMapaSearchUrl(query: string): string {
  return `https://www.gov.br/agricultura/pt-br/busca?SearchableText=${encodeURIComponent(query)}`;
}
function buildAgrofitSearchUrl(query: string): string {
  return `https://agrofit.agricultura.gov.br/agrofit_cons/principal_agrofit_cons?titulo=${encodeURIComponent(query)}`;
}

export default function PestDetailScreen() {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isPro, isLoading: subLoading } = useSubscription();
  const [entry, setEntry] = useState<PestCacheEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const data = await loadPestFromCache(id || '');
      if (mounted) {
        setEntry(data);
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

  // Premium gate redirect — never reachable in V1 (Result already gates),
  // but defensive against deep links / future history surface.
  //
  // `/paywall` is a MODAL, so this screen stays mounted UNDERNEATH it after the
  // replace. A one-shot ref guarantees we never re-fire the replace toward the
  // modal (which would feed the navigation store and risk an update loop) if
  // this effect re-runs for any reason while the paywall is open.
  const paywallRedirectedRef = useRef(false);
  useEffect(() => {
    if (subLoading) return;
    if (!isPro && !paywallRedirectedRef.current) {
      paywallRedirectedRef.current = true;
      router.replace('/paywall');
    } else if (isPro) {
      // Entitlement arrived (e.g. user purchased on the paywall) — re-arm so a
      // future downgrade can gate again.
      paywallRedirectedRef.current = false;
    }
  }, [subLoading, isPro]);

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

  if (loading || subLoading) {
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

  const { enrichment, pest_name, scientific_name, crop, image_uri } = entry;
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
    <SafeAreaView style={[styles.container, isDark && styles.containerDark]}>
      <ScrollView contentInsetAdjustmentBehavior="automatic">
        {/* HERO — captured image (or gradient fallback) */}
        <View style={styles.heroWrap}>
          {image_uri ? (
            <Image
              source={{ uri: image_uri }}
              style={styles.heroImage}
              resizeMode="cover"
              accessible
              accessibilityLabel={t('diagnosis.pestDetailHeroAlt')}
              accessibilityRole="image"
            />
          ) : (
            <LinearGradient colors={Gradients.hero} style={styles.heroImage} />
          )}
          <LinearGradient
            colors={['transparent', 'rgba(6,40,29,0.55)', 'rgba(6,40,29,0.92)']}
            style={styles.heroGradient}
            pointerEvents="none"
          />
          <View style={styles.heroTopRow}>
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
              iconColor="#4CAF50"
            >
              {enrichment.biological_treatment!.map((s: string, i: number) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={[styles.bullet, { backgroundColor: '#4CAF50' }]} />
                  <Text style={[styles.sectionText, isDark && styles.textDark]}>{s}</Text>
                </View>
              ))}
            </CollapsibleSection>
          )}
          {(enrichment.chemical_treatment?.length ?? 0) > 0 && (
            <CollapsibleSection
              title={t('diagnosis.chemicalControl')}
              icon="flask"
              iconColor={Colors.techBlue}
            >
              <View style={styles.warning}>
                <Ionicons name="warning" size={14} color={Colors.warmAmber} />
                <Text style={styles.warningText}>{t('diagnosis.chemicalWarning')}</Text>
              </View>
              {enrichment.chemical_treatment!.map((s: string, i: number) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={[styles.bullet, { backgroundColor: Colors.techBlue }]} />
                  <Text style={[styles.sectionText, isDark && styles.textDark]}>{s}</Text>
                </View>
              ))}
            </CollapsibleSection>
          )}

          {/* COMMERCIAL PRODUCTS — table-like cards with dosage/interval/safety */}
          <CollapsibleSection
            title={t('diagnosis.pestDetailCommercialProducts')}
            icon="basket"
            iconColor={Colors.warmAmber}
            defaultExpanded={false}
          >
            {(enrichment.recommended_products?.length ?? 0) > 0 ? (
              <View style={{ gap: 10 }}>
                <View style={styles.warning}>
                  <Ionicons name="warning" size={14} color={Colors.warmAmber} />
                  <Text style={styles.warningText}>{t('diagnosis.chemicalWarning')}</Text>
                </View>
                {enrichment.recommended_products!.map((p, i) => (
                  <View key={i} style={styles.productCard} testID={`pest-product-${i}`}>
                    <Text style={[styles.productName, isDark && styles.textDark]}>{p.name}</Text>
                    {p.active_ingredient ? (
                      <Text style={styles.productActive}>{p.active_ingredient}</Text>
                    ) : null}
                    <View style={styles.productMetaRow}>
                      {p.dosage ? (
                        <View style={styles.productMetaItem}>
                          <Text style={styles.productMetaLabel}>
                            {t('diagnosis.pestDetailDosage')}
                          </Text>
                          <Text style={[styles.productMetaValue, isDark && styles.textDark]}>
                            {p.dosage}
                          </Text>
                        </View>
                      ) : null}
                      {p.interval ? (
                        <View style={styles.productMetaItem}>
                          <Text style={styles.productMetaLabel}>
                            {t('diagnosis.pestDetailInterval')}
                          </Text>
                          <Text style={[styles.productMetaValue, isDark && styles.textDark]}>
                            {p.interval}
                          </Text>
                        </View>
                      ) : null}
                      {p.safety_period ? (
                        <View style={styles.productMetaItem}>
                          <Text style={styles.productMetaLabel}>
                            {t('diagnosis.pestDetailSafetyPeriod')}
                          </Text>
                          <Text style={[styles.productMetaValue, isDark && styles.textDark]}>
                            {p.safety_period}
                          </Text>
                        </View>
                      ) : null}
                      {p.toxic_class ? (
                        <View style={styles.productMetaItem}>
                          <Text style={styles.productMetaLabel}>
                            {t('diagnosis.pestDetailToxicClass')}
                          </Text>
                          <Text style={[styles.productMetaValue, isDark && styles.textDark]}>
                            {p.toxic_class}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={[styles.sectionText, { color: Colors.textSecondary }]}>
                {t('diagnosis.pestDetailProductsEmpty')}
              </Text>
            )}
          </CollapsibleSection>

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
                      <Text style={{ fontWeight: '700' }}>
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

        {/* REFERENCES — external authoritative sources */}
        <PremiumCard style={styles.refsCard}>
          <View style={styles.refsHeader}>
            <Ionicons name="library" size={18} color={Colors.accent} />
            <Text style={[styles.refsTitle, isDark && styles.textDark]}>
              {t('diagnosis.pestDetailReferences')}
            </Text>
          </View>
          <ReferenceRow
            label={t('diagnosis.pestDetailReferenceEmbrapa')}
            onPress={() => handleOpenLink(buildEmbrapaSearchUrl(refQuery))}
            t={t}
            testID="pest-ref-embrapa"
          />
          <ReferenceRow
            label={t('diagnosis.pestDetailReferenceMapa')}
            onPress={() => handleOpenLink(buildMapaSearchUrl(refQuery))}
            t={t}
            testID="pest-ref-mapa"
          />
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
  heroWrap: { height: HERO_HEIGHT, backgroundColor: '#06281D', position: 'relative' },
  heroImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  heroGradient: { ...StyleSheet.absoluteFillObject },
  heroTopRow: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 2,
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
  heroTitlePillText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
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
  heroBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '600' },
  heroPestName: {
    color: '#FFF',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.2,
    lineHeight: 30,
  },
  heroScientific: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontStyle: 'italic',
    marginTop: 4,
  },
  synonymsRow: { marginTop: 10, flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  synonymsLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600' },
  synonymsText: { color: 'rgba(255,255,255,0.9)', fontSize: 12, flex: 1 },
  // --- Sections ---
  sections: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, gap: Spacing.sm },
  sectionText: { fontSize: FontSize.subheadline, lineHeight: 22, flex: 1, color: Colors.text },
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
  warningText: { fontSize: FontSize.caption, color: Colors.earthText, flex: 1 },
  // --- Product cards ---
  productCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.separator,
    padding: 12,
  },
  productName: { fontSize: FontSize.subheadline, fontWeight: '700', color: Colors.text },
  productActive: {
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 2,
  },
  productMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  productMetaItem: { minWidth: 80 },
  productMetaLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontWeight: '600',
  },
  productMetaValue: {
    fontSize: FontSize.subheadline,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 2,
  },
  // --- References ---
  refsCard: { marginHorizontal: Spacing.lg, marginTop: Spacing.lg, marginBottom: Spacing.md },
  refsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  refsTitle: { fontSize: FontSize.subheadline, fontWeight: '800', color: Colors.text },
  refRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.separator,
  },
  refRowText: { flex: 1, fontSize: FontSize.subheadline, color: Colors.text },
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
  errorTitle: { fontSize: FontSize.title2, fontWeight: '700', marginBottom: 8, color: Colors.text },
  errorMsg: {
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
  closeBtnText: { fontSize: FontSize.headline, fontWeight: '700', color: '#FFF' },
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
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 16,
    fontStyle: 'italic',
  },
});
