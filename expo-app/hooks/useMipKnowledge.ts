/**
 * useMipKnowledge
 *
 * Resolves a MIP catalog entry from a diagnosis result (pest name + symptoms
 * + crop) and produces the three infestation-level recommendations
 * (baixo / medio / alto) for the UI to render.
 *
 * Design notes:
 *  - Lookup is local (no network) — `data/mip/` is bundled with the app.
 *  - Lookup is synchronous; no artificial loading state or plan gate exists.
 *  - Resolution heuristic: builds a keyword bag from `pest_name`,
 *    `enrichment.name_pt`, `enrichment.scientific_name`, plus the
 *    `enrichment.symptoms` array, and runs `searchByKeywords` filtered by
 *    the selected crop (when present). Returns the top match if score >=
 *    a configurable threshold (default 2 — at least one strong hit).
 *  - Every infestation level (baixo / medio / alto) is available to every user.
 */
import { useMemo } from 'react';
import {
  getRecommendation,
  searchByKeywords,
  type InfestationLevel,
  type MipEntry,
  type MipRecommendation,
} from '../data/mip';
import { CROPS } from '../constants/crops';
import type { AgrioEnrichment } from '../types/diagnosis';

export interface UseMipKnowledgeArgs {
  /** Raw pest name returned by the IA (`result.pest_name`). */
  pestName?: string | undefined;
  /** Enriched agronomic notes (from edge function). */
  enrichment?: AgrioEnrichment | undefined;
  /** Crop label as stored in `result.crop` (display name OR id). */
  crop?: string | undefined;
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
  /** Educational recommendation available to every authenticated user. */
  recommendation: MipRecommendation;
}

export interface UseMipKnowledgeResult {
  /** Resolved catalog entry (or null when no match). */
  entry: MipEntry | null;
  /**
   * Three-level recommendations (baixo/medio/alto), or an empty array.
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
  minScore = 2,
  enabled = true,
}: UseMipKnowledgeArgs): UseMipKnowledgeResult {
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

  // Build the three educational levels. The app has no subscription gate.
  const levels = useMemo<MipLevelData[]>(() => {
    if (!entry) return [];
    const order: InfestationLevel[] = ['baixo', 'medio', 'alto'];
    const out: MipLevelData[] = [];
    for (const level of order) {
      const rec = getRecommendation(entry.id, level);
      if (!rec) continue;
      out.push({ level, recommendation: rec });
    }
    return out;
  }, [entry]);

  const empty = enabled && !entry;

  return { entry, levels, matchScore, empty };
}
