import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius } from '../constants/theme';

export interface DiagnosisItem {
  id: string;
  pest_name?: string;
  pest_id?: string;
  scientific_name?: string;
  crop: string;
  confidence?: number;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  notes?: string;
  created_at: string;
  is_healthy?: boolean;
}

interface DiagnosisCardProps {
  diagnosis: DiagnosisItem;
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

function getSeverityLabel(severity: string): string {
  switch (severity) {
    case 'low':
      return 'Baixo';
    case 'medium':
      return 'Medio';
    case 'high':
      return 'Alto';
    case 'critical':
      return 'Critico';
    default:
      return severity;
  }
}

function formatDatePtBr(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const day = date.getDate().toString().padStart(2, '0');
    const months = [
      'jan',
      'fev',
      'mar',
      'abr',
      'mai',
      'jun',
      'jul',
      'ago',
      'set',
      'out',
      'nov',
      'dez',
    ];
    const month = months[date.getMonth()];
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

function getCropDisplayName(crop: string): string {
  const nameMap: Record<string, string> = {
    soja: 'Soja',
    milho: 'Milho',
    cafe: 'Cafe',
    algodao: 'Algodao',
    cana: 'Cana',
    trigo: 'Trigo',
    arroz: 'Arroz',
    feijao: 'Feijao',
    batata: 'Batata',
    tomate: 'Tomate',
    mandioca: 'Mandioca',
    citros: 'Citros',
    uva: 'Uva',
    banana: 'Banana',
  };
  return nameMap[crop] ?? crop;
}

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
  compact = false,
}: DiagnosisCardProps) {
  const isDark = useColorScheme() === 'dark';
  const severity = diagnosis.severity || parseSeverityFromNotes(diagnosis.notes);
  const severityColor = getSeverityColor(severity);
  const isHealthy = diagnosis.is_healthy ?? diagnosis.pest_id === 'Healthy';
  const displayName = parseNameFromNotes(diagnosis.notes) || diagnosis.pest_name || 'Diagnostico';

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
      accessibilityLabel={`${displayName}, ${diagnosis.crop ? getCropDisplayName(diagnosis.crop) : 'cultura nao informada'}, confianca ${Math.round((diagnosis.confidence ?? 0) * 100)} por cento, severidade ${getSeverityLabel(severity)}, ${formatDatePtBr(diagnosis.created_at)}`}
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
              <Text style={styles.cropText}>{getCropDisplayName(diagnosis.crop)}</Text>
            </View>
          ) : null}

          <Text style={styles.dot}>{'  \u2022  '}</Text>
          <Text style={styles.confidence}>{Math.round((diagnosis.confidence ?? 0) * 100)}%</Text>
        </View>
      </View>

      <View style={styles.rightSection}>
        <Text style={styles.date}>{formatDatePtBr(diagnosis.created_at)}</Text>
        <Text style={[styles.severityLabel, { color: severityColor }]}>
          {getSeverityLabel(severity)}
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
