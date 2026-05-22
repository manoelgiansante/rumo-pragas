/**
 * Pest Registry — single source of truth for the pest-detail page (`/diagnosis/pest/[id]`).
 *
 * Strategy:
 * - Last successful diagnosis is cached in AsyncStorage keyed by `pest_id`.
 * - When the detail page mounts with an id, we read from the cache first
 *   (instant render, works fully offline) and then optionally enrich from
 *   a future remote endpoint without blocking UI.
 * - This keeps the detail page self-contained and reusable from history,
 *   notifications, deep links, etc.
 *
 * IMPORTANT: This module never throws — all failures degrade to `null` and the
 * caller renders an empty state. No silent telemetry-less swallow: errors are
 * reported via the Sentry shim with breadcrumb context.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { addBreadcrumb } from './sentry-shim';
import type { AgrioEnrichment, AgrioPrediction } from '../types/diagnosis';

const CACHE_PREFIX = '@rumopragas/pest-cache/';
// Bump when the cache shape changes — invalidates older entries automatically.
const CACHE_VERSION = 1;
// Cap individual entries so a degenerate enrichment can't blow AsyncStorage.
const MAX_ENTRY_BYTES = 200 * 1024;

export interface PestCacheEntry {
  v: number;
  id: string;
  scientific_name?: string;
  pest_name?: string;
  crop?: string;
  image_uri?: string;
  confidence?: number;
  enrichment: AgrioEnrichment;
  alternatives?: AgrioPrediction[];
  updated_at: number;
}

function cacheKey(id: string): string {
  // Hard-validate id — never let arbitrary input shape the storage key.
  const safe = String(id).slice(0, 128).replace(/[^A-Za-z0-9_\-:.]/g, '_');
  return `${CACHE_PREFIX}${safe}`;
}

export async function savePestToCache(entry: Omit<PestCacheEntry, 'v' | 'updated_at'>): Promise<void> {
  try {
    if (!entry.id) return;
    const payload: PestCacheEntry = {
      ...entry,
      v: CACHE_VERSION,
      updated_at: Date.now(),
    };
    const json = JSON.stringify(payload);
    if (json.length > MAX_ENTRY_BYTES) {
      addBreadcrumb({
        category: 'pest-cache',
        message: 'pest entry exceeds MAX_ENTRY_BYTES — skipping save',
        level: 'warning',
        data: { id: entry.id, bytes: json.length },
      });
      return;
    }
    await AsyncStorage.setItem(cacheKey(entry.id), json);
  } catch (e) {
    addBreadcrumb({
      category: 'pest-cache',
      message: 'savePestToCache failed',
      level: 'error',
      data: { error: e instanceof Error ? e.message : String(e) },
    });
  }
}

export async function loadPestFromCache(id: string): Promise<PestCacheEntry | null> {
  try {
    if (!id) return null;
    const raw = await AsyncStorage.getItem(cacheKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PestCacheEntry;
    if (parsed.v !== CACHE_VERSION) return null;
    return parsed;
  } catch (e) {
    addBreadcrumb({
      category: 'pest-cache',
      message: 'loadPestFromCache failed',
      level: 'error',
      data: { error: e instanceof Error ? e.message : String(e) },
    });
    return null;
  }
}
