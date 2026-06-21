import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { BorderRadius, Colors, FontSize, FontWeight } from '../constants/theme';
import type { DiagnosisResult } from '../types/diagnosis';

export interface DiagnosisItem {
  id: string;
  pest_name?: string | undefined;
  pest_id?: string | undefined;
  scientific_name?: string | undefined;
  crop: string;
  confidence?: number | undefined;
  severity?: 'low' | 'medium' | 'high' | 'critical' | undefined;
  notes?: string | undefined;
  created_at: string;
  is_healthy?: boolean | undefined;
}

interface DiagnosisCardProps {
  diagnosis: DiagnosisItem | DiagnosisResult;
  compact?: boolean;
}

/** @deprecated onPress prop was removed - use a wrapper TouchableOpacity instead */

function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'low':
      return Colors.accent;
    case 'medium':
      return Colors.warmAmber;
    case 'high':
      return Colors.coral;
    case 'critical':
      return '#D32F2F';
    default:
      return Colors.systemGray;
  }
}

function getSeverityLabelKey(severity: string): string {
  switch (severity) {
    case 'low':
      return 'severity.low';
    case 'medium':
      return 'severity.medium';
    case 'high':
      return 'severity.high';
    case 'critical':
      return 'severity.critical';
    default:
      return 'severity.medium';
  }
}

function formatDateShort(dateStr: string, monthKeys: string[]): string {
  try {
    const date = new Date(dateStr);
    const day = date.getDate().toString().padStart(2, '0');
    const month = monthKeys[date.getMonth()];
    return `${day} ${month}`;
  } catch {
    return dateStr;
  }
}

function getCropEmoji(crop: string): string {
  const emojiMap: Record<string, string> = {
    soja: '🫘',
    milho: '🌽',
    cafe: '☕',
    algodao: '🏵️',
    cana: '🎋',
    trigo: '🌾',
    arroz: '🍚',
    feijao: '🫘',
    batata: '🥔',
    tomate: '🍅',
    mandioca: '🥖',
    citros: '🍊',
    uva: '🍇',
    banana: '🍌',
  };
  return emojiMap[crop] ?? '🌱';
}

const CROP_NAME_KEYS: Record<string, string> = {
  soja: 'crops.soja',
  milho: 'crops.milho',
  cafe: 'crops.cafe',
  algodao: 'crops.algodao',
  cana: 'crops.cana',
  trigo: 'crops.trigo',
  arroz: 'crops.arroz',
  feijao: 'crops.feijao',
  batata: 'crops.batata',
  tomate: 'crops.tomate',
  mandioca: 'crops.mandioca',
  citros: 'crops.citros',
  uva: 'crops.uva',
  banana: 'crops.banana',
};

function parseSeverityFromNotes(notes?: string): string {
  if (!notes) return 'medium';
  try {
    const parsed = JSON.parse(notes);
    return parsed?.enrichment?.severity || 'medium';
  } catch {
    return 'medium';
  }
}

function parseNameFromNotes(notes?: string): string | undefined {
  if (!notes) return undefined;
  try {
    const parsed = JSON.parse(notes);
    return parsed?.enrichment?.name_pt;
  } catch {
    return undefined;
  }
}

export const DiagnosisCard = React.memo(function DiagnosisCard({
  diagnosis,
  compact: _compact = false,
}: DiagnosisCardProps) {
  const isDark = useColorScheme() === 'dark';
  const { t } = useTranslation();
  const severity = diagnosis.severity || parseSeverityFromNotes(diagnosis.notes);
  const severityColor = getSeverityColor(severity);
  const isHealthy =
    ('is_healthy' in diagnosis && diagnosis.is_healthy) ?? diagnosis.pest_id === 'Healthy';
  const displayName =
    parseNameFromNotes(diagnosis.notes) || diagnosis.pest_name || t('diagnosis.diagnosisLabel');
  const monthKeys = [
    t('common.monthJan'),
    t('common.monthFeb'),
    t('common.monthMar'),
    t('common.monthApr'),
    t('common.monthMay'),
    t('common.monthJun'),
    t('common.monthJul'),
    t('common.monthAug'),
    t('common.monthSep'),
    t('common.monthOct'),
    t('common.monthNov'),
    t('common.monthDec'),
  ];
  const getCropName = (crop: string) => (CROP_NAME_KEYS[crop] ? t(CROP_NAME_KEYS[crop]) : crop);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isDark ? Colors.cardDark : Colors.card,
          shadowColor: isDark ? 'transparent' : '#000',
        },
      ]}
      accessible
      accessibilityLabel={`${displayName}, ${diagnosis.crop ? getCropName(diagnosis.crop) : t('diagnosis.cropNotInformed')}, ${t('diagnosis.confidenceA11y', { pct: Math.round((diagnosis.confidence ?? 0) * 100) })}, ${t('severity.label')} ${t(getSeverityLabelKey(severity))}, ${formatDateShort(diagnosis.created_at, monthKeys)}`}
      accessibilityRole="summary"
    >
      <View style={[styles.iconBox, { backgroundColor: `${severityColor}15` }]}>
        <Ionicons
          name={isHealthy ? 'checkmark-circle' : 'bug'}
          size={22}
          color={isHealthy ? Colors.accent : severityColor}
        />
      </View>

      <View style={styles.info}>
        <Text style={[styles.pestName, isDark && { color: Colors.textDark }]} numberOfLines={1}>
          {displayName}
        </Text>

        <View style={styles.metaRow}>
          {diagnosis.crop ? (
            <View style={styles.cropBadge}>
              <Text style={styles.cropEmoji}>{getCropEmoji(diagnosis.crop)}</Text>
              <Text style={styles.cropText}>{getCropName(diagnosis.crop)}</Text>
            </View>
          ) : null}

          <Text style={styles.dot}>{'  \u2022  '}</Text>
          <Text style={styles.confidence}>{Math.round((diagnosis.confidence ?? 0) * 100)}%</Text>
        </View>
      </View>

      <View style={styles.rightSection}>
        <Text style={styles.date}>{formatDateShort(diagnosis.created_at, monthKeys)}</Text>
        <Text style={[styles.severityLabel, { color: severityColor }]}>
          {t(getSeverityLabelKey(severity))}
        </Text>
        <View style={[styles.severityBar, { backgroundColor: severityColor }]} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: BorderRadius.lg,
    gap: 14,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: 4,
  },
  pestName: {
    fontSize: FontSize.subheadline,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cropBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  cropEmoji: {
    fontSize: 10,
  },
  cropText: {
    fontSize: FontSize.caption2,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
  },
  dot: {
    fontSize: FontSize.caption2,
    color: Colors.textTertiary,
  },
  confidence: {
    fontSize: FontSize.caption2,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  rightSection: {
    alignItems: 'flex-end',
    gap: 4,
  },
  date: {
    fontSize: FontSize.caption2,
    color: Colors.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  severityLabel: {
    fontSize: FontSize.caption2,
    fontWeight: FontWeight.semibold,
  },
  severityBar: {
    width: 24,
    height: 4,
    borderRadius: 2,
  },
});
