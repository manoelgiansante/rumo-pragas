/**
 * useMipKnowledge
 *
 * Resolves a MIP catalog entry from a diagnosis result (pest name + symptoms
 * + crop) and produces the three infestation-level recommendations
 * (baixo / medio / alto) for the UI to render.
 *
 * Design notes:
 *  - Lookup is local (no network) — `data/mip/` is bundled with the app.
 *  - Lookup is sync, but the hook exposes an artificial `loading` state
 *    (one-tick delay) so the UI can show a skeleton matching the rest of
 *    the screen feel.
 *  - Resolution heuristic: builds a keyword bag from `pest_name`,
 *    `enrichment.name_pt`, `enrichment.scientific_name`, plus the
 *    `enrichment.symptoms` array, and runs `searchByKeywords` filtered by
 *    the selected crop (when present). Returns the top match if score >=
 *    a configurable threshold (default 2 — at least one strong hit).
 *  - Premium gate: free users only get the `baixo` level recommendation
 *    (cultural + biological — `getRecommendation` already omits chemical
 *    at level "baixo" so there's no risk of leaking chemical info to free).
 *
 * NEVER call `setState` in render path → all writes happen inside
 * `useEffect`s.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  getRecommendation,
  searchByKeywords,
  type InfestationLevel,
  type MipEntry,
  type MipRecommendation,
} from '../data/mip';
import { CROPS } from '../constants/crops';
import type { AgrioEnrichment } from '../types/diagnosis';

/** Plan tier as returned by RevenueCat / subscription sync. */
export type SubscriptionTier = 'free' | 'pro' | 'enterprise';

/**
 * Levels visible to a given tier.
 *
 * FREE BUILD OVERRIDE (2026-06-30) — fix/pragas-free-2026-06-30: the app ships
 * 100% FREE (Apple Guideline 2.3.2), so the full MIP/EMBRAPA treatment-protocol
 * library (baixo/medio/alto) is unlocked for EVERY tier. With no locked levels,
 * <MipCard/> shows no lock chips and no "upgrade" CTA. Revert this commit to
 * restore the metered (free = `baixo` only) gate.
 */
export const TIER_LEVELS: Record<SubscriptionTier, InfestationLevel[]> = {
  free: ['baixo', 'medio', 'alto'],
  pro: ['baixo', 'medio', 'alto'],
  enterprise: ['baixo', 'medio', 'alto'],
};

export interface UseMipKnowledgeArgs {
  /** Raw pest name returned by the IA (`result.pest_name`). */
  pestName?: string | undefined;
  /** Enriched agronomic notes (from edge function). */
  enrichment?: AgrioEnrichment | undefined;
  /** Crop label as stored in `result.crop` (display name OR id). */
  crop?: string | undefined;
  /** Subscription tier — drives which levels are unlocked. */
  tier: SubscriptionTier;
  /** Min `searchByKeywords` score to accept a match (default 2). */
  minScore?: number | undefined;
  /**
   * Whether the screen is even eligible to show MIP (skip when isHealthy
   * / invalid image / error states).
   */
  enabled?: boolean | undefined;
}

export interface MipLevelData {
  level: InfestationLevel;
  /** Whether this level is unlocked for the current tier. */
  unlocked: boolean;
  /** Recommendation payload (always computed — UI gates display). */
  recommendation: MipRecommendation;
}

export interface UseMipKnowledgeResult {
  /** True while we are simulating a fetch (1 tick) for skeleton parity. */
  loading: boolean;
  /** Resolved catalog entry (or null when no match). */
  entry: MipEntry | null;
  /**
   * Three-level recommendations (baixo/medio/alto) with `unlocked` flag.
   * Empty array when entry not found.
   */
  levels: MipLevelData[];
  /** Match score from `searchByKeywords` (debug / analytics). */
  matchScore: number;
  /** When true, render empty state ("Sem protocolo MIP cadastrado…"). */
  empty: boolean;
}

/**
 * Map an Agrio crop display name (PT-BR / EN) to a catalog culture id.
 * Falls back to the raw input lowercased (the catalog id itself).
 */
function normaliseCropId(raw?: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const lowered = trimmed.toLowerCase();
  // Exact catalog id match (e.g. "soja", "milho")
  const byId = CROPS.find((c) => c.id === lowered);
  if (byId) return byId.id;
  // Display name match (e.g. "Soja", "Café")
  const byDisplay = CROPS.find((c) => c.displayName.toLowerCase() === lowered);
  if (byDisplay) return byDisplay.id;
  // API name match (e.g. "Soybean", "Corn")
  const byApi = CROPS.find((c) => c.apiName.toLowerCase() === lowered);
  if (byApi) return byApi.id;
  return lowered;
}

/**
 * Build the keyword bag fed to `searchByKeywords` from diagnosis inputs.
 * We use:
 *  - The pest name itself (strongest signal — should match nomeComum or
 *    nomesAlternativos)
 *  - Scientific name when present
 *  - First few symptoms (already in PT-BR by the time enrichment lands)
 */
function buildKeywords(pestName?: string, enrichment?: AgrioEnrichment): string[] {
  const bag: string[] = [];
  if (enrichment?.name_pt) bag.push(enrichment.name_pt);
  if (pestName && pestName !== enrichment?.name_pt) bag.push(pestName);
  if (enrichment?.scientific_name) bag.push(enrichment.scientific_name);
  if (enrichment?.symptoms) {
    // Take first 3 symptoms — avoids dilution by long symptom lists.
    for (const s of enrichment.symptoms.slice(0, 3)) {
      if (s && s.length >= 4) bag.push(s);
    }
  }
  return bag;
}

export function useMipKnowledge({
  pestName,
  enrichment,
  crop,
  tier,
  minScore = 2,
  enabled = true,
}: UseMipKnowledgeArgs): UseMipKnowledgeResult {
  const [loading, setLoading] = useState<boolean>(enabled);

  // Resolve match synchronously — the bag and lookup are cheap and pure.
  const { entry, matchScore } = useMemo(() => {
    if (!enabled) return { entry: null as MipEntry | null, matchScore: 0 };
    const keywords = buildKeywords(pestName, enrichment);
    if (keywords.length === 0) return { entry: null, matchScore: 0 };
    const cropId = normaliseCropId(crop);
    // First pass: filter by crop. Try unfiltered fallback if no hit.
    let scored = searchByKeywords(keywords, { cultureFilter: cropId, limit: 5 });
    if (scored.length === 0 && cropId) {
      scored = searchByKeywords(keywords, { limit: 5 });
    }
    if (scored.length === 0) return { entry: null, matchScore: 0 };
    // The length check above guarantees scored[0] exists; assert for
    // noUncheckedIndexedAccess without changing runtime behavior.
    const top = scored[0]!;
    if (top.score < minScore) return { entry: null, matchScore: top.score };
    return { entry: top.entry, matchScore: top.score };
  }, [pestName, enrichment, crop, minScore, enabled]);

  // Build the 3-level recommendations + unlocked flag.
  const levels = useMemo<MipLevelData[]>(() => {
    if (!entry) return [];
    const order: InfestationLevel[] = ['baixo', 'medio', 'alto'];
    const unlockedSet = new Set(TIER_LEVELS[tier]);
    const out: MipLevelData[] = [];
    for (const level of order) {
      const rec = getRecommendation(entry.id, level);
      if (!rec) continue;
      out.push({ level, unlocked: unlockedSet.has(level), recommendation: rec });
    }
    return out;
  }, [entry, tier]);

  // Skeleton parity: flip loading off on the next tick so the UI can show
  // the skeleton in the same frame that the rest of the result paints.
  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => setLoading(false), 0);
    return () => clearTimeout(timer);
  }, [enabled, pestName, crop, enrichment?.name_pt, enrichment?.scientific_name]);

  const empty = enabled && !loading && !entry;

  return { loading, entry, levels, matchScore, empty };
}
