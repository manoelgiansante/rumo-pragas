import { z } from 'zod';
import { ToolHandler, ok, err } from '../_types';

const InputSchema = z.object({
  query: z.string().min(1).max(100),
  culture: z.string().max(80).optional(),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

// Escape PostgREST `or()` filter wildcards in the user-supplied query so it
// can't break out of the ilike pattern (e.g. injecting commas / parens).
function escapeIlike(s: string): string {
  return s.replace(/[%_,()*]/g, (ch) => `\\${ch}`);
}

interface OutbreakRow {
  pest_id: string | null;
  pest_name: string | null;
  crop: string | null;
  severity: string | null;
  description: string | null;
  city: string | null;
  state: string | null;
  region: string | null;
  upvotes: number | null;
  confirmed_count: number | null;
  verified: boolean | null;
  created_at: string | null;
}

interface PestAggregate {
  pest_name: string;
  pest_id: string | null;
  cultures: Set<string>;
  regions: Set<string>;
  severities: Map<string, number>;
  sample_description: string | null;
  outbreak_count: number;
  total_upvotes: number;
  total_confirmed: number;
  verified_count: number;
  last_seen: string | null;
}

export const searchPestLibrary: ToolHandler = {
  name: 'search_pest_library',
  description:
    'Busca na "biblioteca" pública de pragas, derivada de surtos (pragas_outbreaks) reportados e verificados pela comunidade. Pode filtrar por cultura. Retorna agregação por praga: culturas afetadas, regiões, severidade modal, contagem de surtos.',
  inputSchema: {
    type: 'object',
    required: ['query'],
    properties: {
      query: { type: 'string' },
      culture: { type: 'string' },
      limit: { type: 'number', default: 10 },
    },
  },
  async handler(input, ctx) {
    const parsed = InputSchema.safeParse(input);
    if (!parsed.success) return err(`Invalid input: ${parsed.error.message}`);
    const { query, culture, limit } = parsed.data;
    const safe = escapeIlike(query);

    // We pull a wider window of matching outbreaks (5x limit) so the in-memory
    // aggregation can produce `limit` distinct pests. Cap at 250 rows.
    const fetchLimit = Math.min(limit * 5, 250);

    let q = ctx.supabase
      .from('pragas_outbreaks')
      .select(
        'pest_id, pest_name, crop, severity, description, city, state, region, upvotes, confirmed_count, verified, created_at',
      )
      .or(`pest_name.ilike.%${safe}%,description.ilike.%${safe}%,pest_id.ilike.%${safe}%`)
      .order('created_at', { ascending: false })
      .limit(fetchLimit);
    if (culture) q = q.eq('crop', culture);

    const { data, error } = await q;
    if (error) return err(`DB error: ${error.message}`);

    const rows = (data ?? []) as OutbreakRow[];

    // Aggregate per pest_name (fallback pest_id when name absent).
    const agg = new Map<string, PestAggregate>();
    for (const r of rows) {
      const name = (r.pest_name || r.pest_id || '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      let entry = agg.get(key);
      if (!entry) {
        entry = {
          pest_name: name,
          pest_id: r.pest_id,
          cultures: new Set<string>(),
          regions: new Set<string>(),
          severities: new Map<string, number>(),
          sample_description: r.description,
          outbreak_count: 0,
          total_upvotes: 0,
          total_confirmed: 0,
          verified_count: 0,
          last_seen: r.created_at,
        };
        agg.set(key, entry);
      }
      entry.outbreak_count += 1;
      if (r.crop) entry.cultures.add(r.crop);
      const reg = r.region || r.state || r.city;
      if (reg) entry.regions.add(reg);
      if (r.severity) {
        entry.severities.set(r.severity, (entry.severities.get(r.severity) ?? 0) + 1);
      }
      entry.total_upvotes += Number(r.upvotes || 0);
      entry.total_confirmed += Number(r.confirmed_count || 0);
      if (r.verified) entry.verified_count += 1;
      if (!entry.sample_description && r.description) entry.sample_description = r.description;
      if (r.created_at && (!entry.last_seen || r.created_at > entry.last_seen)) {
        entry.last_seen = r.created_at;
      }
    }

    const pests = [...agg.values()]
      .map((e) => {
        // Modal severity
        let modal: string | null = null;
        let modalCount = -1;
        for (const [sev, c] of e.severities) {
          if (c > modalCount) {
            modal = sev;
            modalCount = c;
          }
        }
        return {
          pest_name: e.pest_name,
          pest_id: e.pest_id,
          cultures: [...e.cultures].sort(),
          regions: [...e.regions].slice(0, 10),
          modal_severity: modal,
          outbreak_count: e.outbreak_count,
          verified_count: e.verified_count,
          total_upvotes: e.total_upvotes,
          total_confirmed: e.total_confirmed,
          sample_description: e.sample_description,
          last_seen: e.last_seen,
        };
      })
      .sort((a, b) => {
        // Verified first, then outbreak_count, then upvotes
        if (b.verified_count !== a.verified_count) return b.verified_count - a.verified_count;
        if (b.outbreak_count !== a.outbreak_count) return b.outbreak_count - a.outbreak_count;
        return b.total_upvotes - a.total_upvotes;
      })
      .slice(0, limit);

    return ok({
      query,
      culture: culture ?? null,
      source: 'pragas_outbreaks (community reports)',
      count: pests.length,
      pests,
    });
  },
};
