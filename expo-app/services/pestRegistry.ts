/** User-scoped, privacy-minimized cache for the pest fact sheet. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addBreadcrumb } from './sentry-shim';
import type { AgrioEnrichment, SeverityLevel } from '../types/diagnosis';

const CACHE_PREFIX = '@rumopragas/pest-cache/v2/';
const CACHE_VERSION = 2;
const MAX_ENTRY_BYTES = 64 * 1024;
const SAFE_KEY_PART_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const SEVERITIES = new Set<SeverityLevel>(['critical', 'high', 'medium', 'low', 'none']);

export interface PestCacheEntry {
  v: number;
  id: string;
  scientific_name?: string | undefined;
  pest_name?: string | undefined;
  crop?: string | undefined;
  enrichment: AgrioEnrichment;
  updated_at: number;
}

function cacheKey(userId: string, id: string): string | null {
  if (!SAFE_KEY_PART_RE.test(userId) || !SAFE_KEY_PART_RE.test(id)) return null;
  return `${CACHE_PREFIX}${userId}/${id}`;
}

function cleanString(value: unknown, maxLength = 500): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = [...value]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 0x1f || codePoint === 0x7f ? ' ' : character;
    })
    .join('')
    .trim();
  return clean ? clean.slice(0, maxLength) : undefined;
}

function cleanStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const clean = value
    .slice(0, 20)
    .map((item) => cleanString(item))
    .filter((item): item is string => !!item);
  return clean.length > 0 ? clean : undefined;
}

/** Only educational, non-prescriptive fields are eligible for local persistence. */
function sanitizeEnrichment(value: unknown): AgrioEnrichment {
  if (typeof value !== 'object' || value === null) return {};
  const input = value as Record<string, unknown>;
  const output: AgrioEnrichment = {};
  const strings = [
    'name_pt',
    'name_es',
    'scientific_name',
    'description',
    'description_es',
    'lifecycle',
    'economic_impact',
    'resistance_info',
    'action_threshold',
    'mip_strategy',
  ] as const;
  const arrays = [
    'causes',
    'causes_es',
    'symptoms',
    'symptoms_es',
    'biological_treatment',
    'biological_treatment_es',
    'cultural_treatment',
    'cultural_treatment_es',
    'prevention',
    'prevention_es',
    'monitoring',
    'favorable_conditions',
    'related_pests',
  ] as const;

  const writable = output as Record<string, unknown>;
  for (const key of strings) {
    const clean = cleanString(input[key], key.startsWith('description') ? 2_000 : 500);
    if (clean) writable[key] = clean;
  }
  for (const key of arrays) {
    const clean = cleanStringArray(input[key]);
    if (clean) writable[key] = clean;
  }
  if (typeof input.severity === 'string' && SEVERITIES.has(input.severity as SeverityLevel)) {
    output.severity = input.severity as SeverityLevel;
  }
  return output;
}

function normalizeEntry(value: unknown, expectedId: string): PestCacheEntry | null {
  if (typeof value !== 'object' || value === null) return null;
  const input = value as Record<string, unknown>;
  if (
    input.v !== CACHE_VERSION ||
    input.id !== expectedId ||
    typeof input.updated_at !== 'number' ||
    !Number.isFinite(input.updated_at) ||
    input.updated_at <= 0
  ) {
    return null;
  }
  const pestName = cleanString(input.pest_name, 160);
  const scientificName = cleanString(input.scientific_name, 160);
  const crop = cleanString(input.crop, 80);
  return {
    v: CACHE_VERSION,
    id: expectedId,
    ...(pestName ? { pest_name: pestName } : {}),
    ...(scientificName ? { scientific_name: scientificName } : {}),
    ...(crop ? { crop } : {}),
    enrichment: sanitizeEnrichment(input.enrichment),
    updated_at: input.updated_at,
  };
}

export async function savePestToCache(
  userId: string,
  entry: Omit<PestCacheEntry, 'v' | 'updated_at'>,
): Promise<void> {
  try {
    const key = cacheKey(userId, entry.id);
    if (!key) return;
    const payload = normalizeEntry(
      {
        v: CACHE_VERSION,
        id: entry.id,
        pest_name: entry.pest_name,
        scientific_name: entry.scientific_name,
        crop: entry.crop,
        enrichment: entry.enrichment,
        updated_at: Date.now(),
      },
      entry.id,
    );
    if (!payload) return;
    const json = JSON.stringify(payload);
    if (json.length > MAX_ENTRY_BYTES) {
      addBreadcrumb({
        category: 'pest-cache',
        message: 'pest cache entry rejected by size limit',
        level: 'warning',
      });
      return;
    }
    await AsyncStorage.setItem(key, json);
  } catch {
    addBreadcrumb({
      category: 'pest-cache',
      message: 'pest cache save unavailable',
      level: 'warning',
    });
  }
}

export async function loadPestFromCache(
  userId: string,
  id: string,
): Promise<PestCacheEntry | null> {
  try {
    const key = cacheKey(userId, id);
    if (!key) return null;
    const raw = await AsyncStorage.getItem(key);
    if (!raw || raw.length > MAX_ENTRY_BYTES) return null;
    return normalizeEntry(JSON.parse(raw) as unknown, id);
  } catch {
    addBreadcrumb({
      category: 'pest-cache',
      message: 'pest cache load unavailable',
      level: 'warning',
    });
    return null;
  }
}
