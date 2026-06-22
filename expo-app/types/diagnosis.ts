import i18n from '../i18n';
export interface AgrioPrediction {
  id: string;
  confidence: number;
  common_name?: string;
  scientific_name?: string;
  category?: string;
  type?: string;
}

export interface AgrioProduct {
  name: string;
  active_ingredient?: string;
  dosage?: string;
  interval?: string;
  safety_period?: string;
  toxic_class?: string;
}

export interface AgrioEnrichment {
  name_pt?: string;
  name_es?: string;
  scientific_name?: string;
  description?: string;
  description_es?: string;
  causes?: string[];
  causes_es?: string[];
  symptoms?: string[];
  symptoms_es?: string[];
  chemical_treatment?: string[];
  chemical_treatment_es?: string[];
  biological_treatment?: string[];
  biological_treatment_es?: string[];
  cultural_treatment?: string[];
  cultural_treatment_es?: string[];
  prevention?: string[];
  prevention_es?: string[];
  severity?: SeverityLevel;
  lifecycle?: string;
  economic_impact?: string;
  monitoring?: string[];
  favorable_conditions?: string[];
  resistance_info?: string;
  recommended_products?: AgrioProduct[];
  related_pests?: string[];
  action_threshold?: string;
  mip_strategy?: string;
}

export interface AgrioNotesData {
  message?: string;
  crop?: string;
  crop_confidence?: number;
  id_array?: AgrioPrediction[];
  predictions?: AgrioPrediction[];
  enrichment?: AgrioEnrichment;
}

export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'none';

export type ConfidenceLevelName = 'high' | 'medium' | 'low' | 'very_low';

export interface DiagnosisResult {
  id: string;
  user_id: string;
  crop: string;
  pest_id?: string | undefined;
  pest_name?: string | undefined;
  confidence?: number | undefined;
  severity?: SeverityLevel | undefined;
  image_url?: string | undefined;
  notes?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  location_lat?: number | undefined;
  location_lng?: number | undefined;
  location_name?: string | undefined;
  created_at: string;
  parsedNotes?: AgrioNotesData | undefined;
}

// --- Helpers ---

export function getSeverityConfig(level: SeverityLevel): {
  displayName: string;
  color: string;
  icon: string;
} {
  const configs: Record<SeverityLevel, { i18nKey: string; color: string; icon: string }> = {
    critical: { i18nKey: 'severity.critical', color: '#FF3B30', icon: 'alert-triangle' },
    high: { i18nKey: 'severity.high', color: '#FF9500', icon: 'alert-circle' },
    medium: { i18nKey: 'severity.medium', color: '#FFCC00', icon: 'info' },
    low: { i18nKey: 'severity.low', color: '#2E8C3E', icon: 'check-circle' },
    none: { i18nKey: 'severity.none', color: '#8E8E93', icon: 'minus-circle' },
  };
  const cfg = configs[level];
  return { displayName: i18n.t(cfg.i18nKey), color: cfg.color, icon: cfg.icon };
}

/** Set of valid severity levels for type-safe validation */
const VALID_SEVERITY_LEVELS: ReadonlySet<string> = new Set<SeverityLevel>([
  'critical',
  'high',
  'medium',
  'low',
  'none',
]);

/** @deprecated Use getSeverityConfig() for i18n support. Kept for backward compatibility — now delegates to i18n. */
export const SEVERITY_CONFIG: Record<
  SeverityLevel,
  { displayName: string; color: string; icon: string }
> = {
  critical: { displayName: i18n.t('severity.critical'), color: '#FF3B30', icon: 'alert-triangle' },
  high: { displayName: i18n.t('severity.high'), color: '#FF9500', icon: 'alert-circle' },
  medium: { displayName: i18n.t('severity.medium'), color: '#FFCC00', icon: 'info' },
  low: { displayName: i18n.t('severity.low'), color: '#2E8C3E', icon: 'check-circle' },
  none: { displayName: i18n.t('severity.none'), color: '#8E8E93', icon: 'minus-circle' },
};

export function getConfidenceLevelConfig(level: ConfidenceLevelName): {
  displayName: string;
  color: string;
  percentage: string;
} {
  const configs: Record<
    ConfidenceLevelName,
    { i18nKey: string; color: string; percentage: string }
  > = {
    high: { i18nKey: 'confidence.high', color: '#2E8C3E', percentage: '85%+' },
    medium: { i18nKey: 'confidence.medium', color: '#FFCC00', percentage: '60-84%' },
    low: { i18nKey: 'confidence.low', color: '#FF9500', percentage: '40-59%' },
    very_low: { i18nKey: 'confidence.veryLow', color: '#FF3B30', percentage: '<40%' },
  };
  const cfg = configs[level];
  return { displayName: i18n.t(cfg.i18nKey), color: cfg.color, percentage: cfg.percentage };
}

/** @deprecated Use getConfidenceLevelConfig() for i18n support. Kept for backward compatibility — now delegates to i18n. */
export const CONFIDENCE_LEVELS: Record<
  ConfidenceLevelName,
  { displayName: string; color: string; percentage: string }
> = {
  high: { displayName: i18n.t('confidence.high'), color: '#2E8C3E', percentage: '85%+' },
  medium: { displayName: i18n.t('confidence.medium'), color: '#FFCC00', percentage: '60-84%' },
  low: { displayName: i18n.t('confidence.low'), color: '#FF9500', percentage: '40-59%' },
  very_low: { displayName: i18n.t('confidence.veryLow'), color: '#FF3B30', percentage: '<40%' },
};

export function getConfidenceLevel(confidence?: number): ConfidenceLevelName {
  if (!confidence) return 'low';
  if (confidence >= 0.85) return 'high';
  if (confidence >= 0.6) return 'medium';
  if (confidence >= 0.4) return 'low';
  return 'very_low';
}

export function getSeverityLevel(result: DiagnosisResult): SeverityLevel {
  const severity = result.parsedNotes?.enrichment?.severity;
  if (severity && VALID_SEVERITY_LEVELS.has(severity)) return severity;
  return 'medium';
}

export function getDisplayName(result: DiagnosisResult): string {
  return (
    result.parsedNotes?.enrichment?.name_pt ??
    result.pest_name ??
    result.pest_id ??
    i18n.t('diagnosis.defaultName')
  );
}

export function getScientificName(result: DiagnosisResult): string | undefined {
  const preds = result.parsedNotes?.predictions ?? result.parsedNotes?.id_array ?? [];
  const top = preds.find((p) => p.id !== 'Healthy') ?? preds[0];
  return top?.scientific_name;
}

export function getAllPredictions(result: DiagnosisResult): AgrioPrediction[] {
  return result.parsedNotes?.predictions ?? result.parsedNotes?.id_array ?? [];
}

export function isHealthy(result: DiagnosisResult): boolean {
  return result.pest_id === 'Healthy' || result.pest_name === 'Healthy';
}

export function parseNotes(notes?: string): AgrioNotesData | undefined {
  if (!notes) return undefined;
  try {
    return JSON.parse(notes) as AgrioNotesData;
  } catch {
    return undefined;
  }
}
