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
 * Always-visible compliance: current Brazilian regulatory disclaimer and a
 * direct AGROFIT consultation link. The card deliberately excludes commercial
 * products, active ingredients, doses, intervals and endorsement badges.
 *
 * Two runtime states: an informative empty state or the recommendation panel.
 *
 * Renders nothing when `enabled` is false (healthy plant / errors).
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Colors, FontSize, FontWeight, Spacing, FontFamily } from '../constants/theme';
import { PremiumCard } from './PremiumCard';
import type { InfestationLevel } from '../data/mip';
import type { MipLevelData, UseMipKnowledgeResult } from '../hooks/useMipKnowledge';

interface MipCardProps {
  /** Hook output — pass straight through. */
  knowledge: UseMipKnowledgeResult;
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

export function MipCard({ knowledge, enabled = true, onAnalyticsEvent }: MipCardProps) {
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
      });
    },
    [knowledge.entry?.id, knowledge.levels, onAnalyticsEvent],
  );

  const handleOpenAgrofit = useCallback(async () => {
    const url = 'https://agrofit.agricultura.gov.br/agrofit_cons/principal_agrofit_cons';
    onAnalyticsEvent?.('mip_agrofit_opened', { entry_id: knowledge.entry?.id });
    const can = await Linking.canOpenURL(url);
    if (can) await Linking.openURL(url);
  }, [knowledge.entry?.id, onAnalyticsEvent]);

  if (!enabled) return null;

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
                accessibilityLabel={t('mip.chipA11y', { level: t(`mip.level.${level}`) })}
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

        {/* Educational non-chemical guidance for the selected level. */}
        <View style={[styles.panel, { borderLeftColor: selectedColor }]}>
          <Text style={styles.panelHeader}>{t('mip.criterionLabel')}</Text>
          <Text style={[styles.panelBody, isDark && styles.textDark]}>
            {knowledge.entry.niveisDano[selectedLevel].criterio}
          </Text>

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
        </View>

        <View style={styles.officialGuidance}>
          <Text style={styles.officialGuidanceText}>{t('mip.officialGuidance')}</Text>
          <TouchableOpacity
            testID="mip-open-agrofit"
            style={styles.agrofitButton}
            onPress={handleOpenAgrofit}
            accessibilityRole="link"
            accessibilityLabel={t('mip.openAgrofit')}
          >
            <Ionicons name="open-outline" size={15} color={Colors.white} />
            <Text style={styles.agrofitButtonText}>{t('mip.openAgrofit')}</Text>
          </TouchableOpacity>
        </View>

        {/* Regulatory disclaimer — always visible. */}
        <View style={styles.disclaimerBlock} accessible accessibilityRole="text">
          <Ionicons name="shield-checkmark" size={14} color={Colors.warmAmber} />
          <Text style={styles.disclaimerText}>{t('mip.regulatoryDisclaimer')}</Text>
        </View>
      </PremiumCard>
    </View>
  );
}

/** Bullet list block reused for cultural and biological sections. */
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
    fontFamily: FontFamily.bold,
    fontWeight: FontWeight.bold,
    color: Colors.accent,
  },
  entryName: {
    fontSize: FontSize.title3,
    fontFamily: FontFamily.bold,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  entryScientific: {
    fontFamily: FontFamily.italic,
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  sectionLabel: {
    fontSize: FontSize.caption,
    fontFamily: FontFamily.semibold,
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
    fontFamily: FontFamily.bold,
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
    fontFamily: FontFamily.bold,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  panelBody: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.subheadline,
    lineHeight: 21,
    color: Colors.text,
  },
  metaLabel: {
    fontFamily: FontFamily.bold,
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
    fontFamily: FontFamily.bold,
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
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  emptyText: {
    flex: 1,
    fontFamily: FontFamily.regular,
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
    fontFamily: FontFamily.italic,
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  officialGuidance: {
    gap: Spacing.sm,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderRadius: 8,
    backgroundColor: `${Colors.techBlue}0D`,
  },
  officialGuidanceText: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.caption,
    lineHeight: 18,
  },
  agrofitButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 8,
    backgroundColor: Colors.accent,
  },
  agrofitButtonText: {
    color: Colors.white,
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.caption,
  },
});
