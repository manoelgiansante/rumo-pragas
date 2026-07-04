/**
 * MipCard
 *
 * Catalog card rendered after the diagnosis enrichment sections. Shows three
 * infestation-level chips (baixo / medio / alto) with the recommendation for
 * the selected level inside a collapsible.
 *
 * The app is 100% free, so every level is available to every user — tapping any
 * chip simply selects it. No locked chips and no CTA.
 *
 * Always-visible compliance:
 *  - CREA disclaimer (MIP_CREA_DISCLAIMER).
 *  - References (EMBRAPA / MAPA / IRAC / FRAC) — citable to everyone.
 *
 * Three runtime states:
 *  - `loading`: skeleton matching the rest of the screen
 *  - `empty`:   informative placeholder ("Sem protocolo MIP cadastrado…")
 *  - default:   chips + recommendation panel
 *
 * Renders nothing when `enabled` is false (healthy plant / errors).
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors, FontSize, FontWeight, Spacing } from '../constants/theme';
import { PremiumCard } from './PremiumCard';
import { SkeletonLoader } from './SkeletonLoader';
import type { InfestationLevel, MipReference } from '../data/mip';
import type {
  MipLevelData,
  SubscriptionTier,
  UseMipKnowledgeResult,
} from '../hooks/useMipKnowledge';

interface MipCardProps {
  /** Hook output — pass straight through. */
  knowledge: UseMipKnowledgeResult;
  /** Plan tier — retained only as an analytics dimension. */
  tier: SubscriptionTier;
  /** Hide the whole card (healthy plant, error states). */
  enabled?: boolean;
  /**
   * Optional analytics hook. Fired when the user toggles a level or opens a
   * reference URL.
   */
  onAnalyticsEvent?: (event: string, properties?: Record<string, unknown>) => void;
}

const LEVEL_COLORS: Record<InfestationLevel, string> = {
  baixo: Colors.accent,
  medio: Colors.warmAmber,
  alto: Colors.coral,
};

const LEVEL_ORDER: InfestationLevel[] = ['baixo', 'medio', 'alto'];

export function MipCard({ knowledge, tier, enabled = true, onAnalyticsEvent }: MipCardProps) {
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';

  // Selected level defaults to the first available one ("baixo").
  const initialLevel: InfestationLevel = useMemo(
    () => knowledge.levels[0]?.level ?? 'baixo',
    [knowledge.levels],
  );

  const [selectedLevel, setSelectedLevel] = useState<InfestationLevel>(initialLevel);

  const selected: MipLevelData | undefined = useMemo(
    () => knowledge.levels.find((l) => l.level === selectedLevel),
    [knowledge.levels, selectedLevel],
  );

  const handleSelectLevel = useCallback(
    (level: InfestationLevel) => {
      const found = knowledge.levels.find((l) => l.level === level);
      if (!found) return;
      setSelectedLevel(level);
      onAnalyticsEvent?.('mip_level_selected', {
        level,
        entry_id: knowledge.entry?.id,
        tier,
      });
    },
    [knowledge.entry?.id, knowledge.levels, onAnalyticsEvent, tier],
  );

  const handleOpenReference = useCallback(
    async (ref: MipReference) => {
      if (!ref.url) return;
      onAnalyticsEvent?.('mip_reference_opened', { source: ref.source, url: ref.url });
      const can = await Linking.canOpenURL(ref.url);
      if (can) await Linking.openURL(ref.url);
    },
    [onAnalyticsEvent],
  );

  if (!enabled) return null;

  if (knowledge.loading) {
    return (
      <View testID="mip-card-skeleton">
        <PremiumCard style={styles.cardWrap}>
          <SkeletonLoader width="40%" height={18} style={{ marginBottom: Spacing.md }} />
          <View style={{ flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md }}>
            <SkeletonLoader width={80} height={32} borderRadius={999} />
            <SkeletonLoader width={80} height={32} borderRadius={999} />
            <SkeletonLoader width={80} height={32} borderRadius={999} />
          </View>
          <SkeletonLoader width="100%" height={14} style={{ marginBottom: 6 }} />
          <SkeletonLoader width="92%" height={14} style={{ marginBottom: 6 }} />
          <SkeletonLoader width="80%" height={14} />
        </PremiumCard>
      </View>
    );
  }

  if (knowledge.empty) {
    return (
      <View testID="mip-card-empty">
        <PremiumCard style={styles.cardWrap}>
          <View style={styles.titleRow}>
            <Ionicons name="leaf" size={18} color={Colors.accent} />
            <Text style={[styles.title, isDark && styles.textDark]}>{t('mip.title')}</Text>
          </View>
          <View style={styles.emptyRow}>
            <Ionicons name="information-circle-outline" size={22} color={Colors.textSecondary} />
            <Text style={styles.emptyText}>{t('mip.emptyState')}</Text>
          </View>
        </PremiumCard>
      </View>
    );
  }

  if (!knowledge.entry || !selected) return null;

  const rec = selected.recommendation;
  const selectedColor = LEVEL_COLORS[selectedLevel];

  return (
    <View testID="mip-card">
      <PremiumCard style={styles.cardWrap}>
        <View style={styles.titleRow}>
          <Ionicons name="leaf" size={18} color={Colors.accent} />
          <Text style={[styles.title, isDark && styles.textDark]}>{t('mip.title')}</Text>
          <View style={styles.tierBadge}>
            <Ionicons name="shield-checkmark" size={10} color={Colors.accent} />
            <Text style={styles.tierBadgeText}>EMBRAPA / MAPA</Text>
          </View>
        </View>

        <Text style={styles.entryName}>{knowledge.entry.nomeComum}</Text>
        <Text style={styles.entryScientific}>{knowledge.entry.nomeCientifico}</Text>

        <Text style={styles.sectionLabel}>{t('mip.levelPickerLabel')}</Text>
        <View style={styles.chipsRow}>
          {LEVEL_ORDER.map((level) => {
            const data = knowledge.levels.find((l) => l.level === level);
            if (!data) return null;
            const isActive = selectedLevel === level;
            const color = LEVEL_COLORS[level];
            return (
              <Pressable
                key={level}
                onPress={() => handleSelectLevel(level)}
                accessibilityRole="button"
                accessibilityLabel={t('mip.chipA11yUnlocked', { level: t(`mip.level.${level}`) })}
                accessibilityState={{ selected: isActive }}
                testID={`mip-chip-${level}`}
                style={({ pressed }) => [
                  styles.chip,
                  {
                    backgroundColor: isActive ? color : color + '14',
                    borderColor: color + (isActive ? 'FF' : '33'),
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <Text style={[styles.chipText, { color: isActive ? '#FFF' : color }]}>
                  {t(`mip.level.${level}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Recommendation panel for the selected unlocked level */}
        <View style={[styles.panel, { borderLeftColor: selectedColor }]}>
          <Text style={styles.panelHeader}>{t('mip.criterionLabel')}</Text>
          <Text style={[styles.panelBody, isDark && styles.textDark]}>
            {knowledge.entry.niveisDano[selectedLevel].criterio}
          </Text>

          <Text style={[styles.panelHeader, styles.panelHeaderSpaced]}>
            {t('mip.recommendedActionLabel')}
          </Text>
          <Text style={[styles.panelBody, isDark && styles.textDark]}>{rec.acaoPrincipal}</Text>

          {rec.acoesCulturais.length > 0 && (
            <RecBullets
              title={t('mip.culturalActions')}
              items={rec.acoesCulturais}
              icon="hand-left"
              iconColor={Colors.accent}
              isDark={isDark}
            />
          )}
          {rec.acoesBiologicas.length > 0 && (
            <RecBullets
              title={t('mip.biologicalActions')}
              items={rec.acoesBiologicas}
              icon="bug"
              iconColor={Colors.accentLight}
              isDark={isDark}
            />
          )}
          {rec.acoesMecanicas.length > 0 && (
            <RecBullets
              title={t('mip.mechanicalActions')}
              items={rec.acoesMecanicas}
              icon="construct"
              iconColor={Colors.techBlue}
              isDark={isDark}
            />
          )}
          {rec.acoesQuimicas && (
            <ChemicalBlock
              classes={rec.acoesQuimicas.classes}
              ingredientes={rec.acoesQuimicas.ingredientesAtivosSugeridos}
              observacoes={rec.acoesQuimicas.observacoes}
              entry={knowledge.entry}
              level={selectedLevel}
              isDark={isDark}
            />
          )}

          {rec.monitoramento && (
            <View style={styles.subsection}>
              <Text style={styles.subsectionTitle}>{t('mip.monitoringLabel')}</Text>
              <Text style={[styles.panelBody, isDark && styles.textDark]}>
                <Text style={styles.metaLabel}>{t('mip.monitoringMethod')}: </Text>
                {rec.monitoramento.metodo}
              </Text>
              <Text style={[styles.panelBody, isDark && styles.textDark]}>
                <Text style={styles.metaLabel}>{t('mip.monitoringFrequency')}: </Text>
                {rec.monitoramento.frequencia}
              </Text>
              <Text style={[styles.panelBody, isDark && styles.textDark]}>
                <Text style={styles.metaLabel}>{t('mip.monitoringControlLevel')}: </Text>
                {rec.monitoramento.nivelControle}
              </Text>
            </View>
          )}

          {rec.rotacaoResistencia && (
            <View style={styles.subsection}>
              <Text style={styles.subsectionTitle}>{t('mip.resistanceRotation')}</Text>
              <Text style={[styles.panelBody, isDark && styles.textDark]}>
                {rec.rotacaoResistencia}
              </Text>
            </View>
          )}
        </View>

        {/* References — visible to everyone (compliance + scientific credibility) */}
        {rec.referencias.length > 0 && (
          <View style={styles.referencesBlock}>
            <Text style={styles.subsectionTitle}>{t('mip.referencesLabel')}</Text>
            <View style={styles.refRow}>
              {rec.referencias.map((ref, i) => (
                <Pressable
                  key={`${ref.source}-${i}`}
                  onPress={() => handleOpenReference(ref)}
                  disabled={!ref.url}
                  accessibilityRole={ref.url ? 'link' : 'text'}
                  accessibilityLabel={t('mip.referenceA11y', {
                    source: ref.source,
                    year: ref.ano,
                  })}
                  style={({ pressed }) => [
                    styles.refChip,
                    { opacity: ref.url ? (pressed ? 0.7 : 1) : 0.8 },
                  ]}
                >
                  <Text style={styles.refSource}>{ref.source}</Text>
                  <Text style={styles.refYear}>{ref.ano}</Text>
                  {ref.url && <Ionicons name="open-outline" size={11} color={Colors.techBlue} />}
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* CREA disclaimer — ALWAYS visible regardless of tier */}
        <View style={styles.disclaimerBlock} accessible accessibilityRole="text">
          <Ionicons name="shield-checkmark" size={14} color={Colors.warmAmber} />
          <Text style={styles.disclaimerText}>{rec.disclaimerCREA}</Text>
        </View>
      </PremiumCard>
    </View>
  );
}

/** Bullet list block reused for cultural / biological / mechanical sections. */
function RecBullets({
  title,
  items,
  icon,
  iconColor,
  isDark,
}: {
  title: string;
  items: string[];
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  isDark: boolean;
}) {
  return (
    <View style={styles.subsection}>
      <View style={styles.subsectionTitleRow}>
        <Ionicons name={icon} size={14} color={iconColor} />
        <Text style={styles.subsectionTitle}>{title}</Text>
      </View>
      {items.map((line, i) => (
        <View key={i} style={styles.bulletRow}>
          <View style={[styles.bullet, { backgroundColor: iconColor }]} />
          <Text style={[styles.panelBody, isDark && styles.textDark]}>{line}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Chemical strategy block — same visual rhythm as bullets but with
 * a prominent warning banner reinforcing the agronomic prescription
 * requirement (Lei 7.802/89).
 */
function ChemicalBlock({
  classes,
  ingredientes,
  observacoes,
  entry,
  level,
  isDark,
}: {
  classes: string[];
  ingredientes: string[];
  observacoes: string[];
  entry: {
    mip: {
      quimico: {
        ingredientesAtivos: ReadonlyArray<{
          produtosComerciais: ReadonlyArray<{ nome: string; formulacao: string; dosagem: string }>;
        }>;
      };
    };
  };
  level: InfestationLevel;
  isDark: boolean;
}) {
  const { t } = useTranslation();
  // Flatten first product of each ingredient — gives the user the canonical
  // formulation reference without overloading the card.
  const products = entry.mip.quimico.ingredientesAtivos
    .flatMap((ia) => ia.produtosComerciais.slice(0, 1))
    .slice(0, 3);

  return (
    <View style={styles.subsection}>
      <View style={styles.subsectionTitleRow}>
        <Ionicons name="flask" size={14} color={Colors.techBlue} />
        <Text style={styles.subsectionTitle}>{t('mip.chemicalActions')}</Text>
      </View>
      <View style={styles.chemWarning}>
        <Ionicons name="warning" size={12} color={Colors.warmAmber} />
        <Text style={styles.chemWarningText}>{t('mip.chemicalWarning')}</Text>
      </View>

      {classes.length > 0 && (
        <Text style={[styles.panelBody, isDark && styles.textDark]}>
          <Text style={styles.metaLabel}>{t('mip.chemicalClasses')}: </Text>
          {classes.join(', ')}
        </Text>
      )}

      {ingredientes.map((ia, i) => (
        <View key={i} style={styles.bulletRow}>
          <View style={[styles.bullet, { backgroundColor: Colors.techBlue }]} />
          <Text style={[styles.panelBody, isDark && styles.textDark]}>{ia}</Text>
        </View>
      ))}

      {products.length > 0 && (
        <View style={[styles.subsection, { marginTop: Spacing.sm }]}>
          <Text style={styles.subsectionTitle}>
            {t('mip.commercialProductsLabel', { level: t(`mip.level.${level}`) })}
          </Text>
          {products.map((p, i) => (
            <View key={i} style={styles.productRow}>
              <Text style={[styles.productName, isDark && styles.textDark]}>{p.nome}</Text>
              <Text style={styles.productMeta}>
                {p.formulacao} · {p.dosagem}
              </Text>
            </View>
          ))}
        </View>
      )}

      {observacoes.length > 0 && (
        <View style={styles.subsection}>
          {observacoes.map((obs, i) => (
            <Text key={i} style={styles.obsText}>
              · {obs}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrap: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  textDark: { color: Colors.textDark },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: FontSize.headline,
    fontWeight: FontWeight.bold,
    color: Colors.accent,
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.accent + '14',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  tierBadgeText: {
    fontSize: 9,
    fontWeight: FontWeight.bold,
    color: Colors.accent,
    letterSpacing: 0.4,
  },
  entryName: {
    fontSize: FontSize.title3,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  entryScientific: {
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    marginBottom: Spacing.md,
  },
  sectionLabel: {
    fontSize: FontSize.caption,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  chipText: {
    fontSize: FontSize.caption,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.3,
  },
  panel: {
    borderLeftWidth: 3,
    paddingLeft: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
  },
  panelHeader: {
    fontSize: FontSize.caption,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  panelHeaderSpaced: {
    marginTop: Spacing.md,
  },
  panelBody: {
    fontSize: FontSize.subheadline,
    lineHeight: 21,
    color: Colors.text,
  },
  metaLabel: {
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
  },
  subsection: {
    marginTop: Spacing.md,
  },
  subsectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  subsectionTitle: {
    fontSize: FontSize.footnote,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 4,
  },
  bullet: { width: 5, height: 5, borderRadius: 3, marginTop: 8 },
  chemWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    backgroundColor: Colors.warmAmber + '14',
    borderRadius: 6,
    marginBottom: Spacing.sm,
  },
  chemWarningText: {
    flex: 1,
    fontSize: 11,
    color: Colors.earthText,
    fontWeight: FontWeight.semibold,
  },
  productRow: {
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.separator,
  },
  productName: {
    fontSize: FontSize.footnote,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
  productMeta: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  obsText: {
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 16,
    marginBottom: 2,
  },
  referencesBlock: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  refRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  refChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.techBlue + '14',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  refSource: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Colors.techBlue,
  },
  refYear: {
    fontSize: 10,
    color: Colors.textSecondary,
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  emptyText: {
    flex: 1,
    fontSize: FontSize.subheadline,
    color: Colors.textSecondary,
    lineHeight: 21,
  },
  disclaimerBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    padding: 10,
    backgroundColor: Colors.warmAmber + '0F',
    borderRadius: 8,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 16,
    fontStyle: 'italic',
  },
});
