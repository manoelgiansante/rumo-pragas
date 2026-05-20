import { z } from 'zod';
import { ToolHandler, ok, err } from '../_types';

const InputSchema = z.object({
  // user mode: ignored. hub mode: REQUIRED.
  userId: z.string().uuid().optional(),
  sinceDays: z.number().int().min(1).max(365).optional().default(90),
});

export const getPestHistory: ToolHandler = {
  name: 'get_pest_history',
  description:
    'Histórico de pragas diagnosticadas pelo usuário: frequência, tendência, top pragas e culturas. User mode: scope via JWT. Hub mode: requer userId.',
  inputSchema: {
    type: 'object',
    properties: {
      userId: { type: 'string', description: 'UUID do usuário (obrigatório em hub mode)' },
      sinceDays: { type: 'number', default: 90 },
    },
  },
  async handler(input, ctx) {
    const parsed = InputSchema.safeParse(input ?? {});
    if (!parsed.success) return err(`Invalid input: ${parsed.error.message}`);
    const { sinceDays } = parsed.data;

    const userId = ctx.mode === 'user' ? ctx.userId : parsed.data.userId;
    if (!userId) {
      return err(
        ctx.mode === 'hub'
          ? 'In hub mode, userId is required to scope pest history to a user.'
          : 'Authenticated user id missing.',
      );
    }

    const since = new Date(Date.now() - sinceDays * 86400_000).toISOString();

    const { data, error } = await ctx.supabase
      .from('pragas_diagnoses')
      .select('pest_name, pest_id, crop, confidence, created_at')
      .eq('user_id', userId) // defense-in-depth: user mode RLS also filters
      .gte('created_at', since)
      .order('created_at', { ascending: false });
    if (error) return err(`DB error: ${error.message}`);

    const rows = data ?? [];

    // Aggregate by pest
    const pestCounts = new Map<
      string,
      { count: number; totalConf: number; lastSeen: string | null; pest_id: string | null }
    >();
    // Aggregate by crop
    const cropCounts = new Map<string, number>();

    for (const d of rows) {
      const name = (d.pest_name || d.pest_id || '').trim();
      if (name) {
        const cur = pestCounts.get(name) ?? {
          count: 0,
          totalConf: 0,
          lastSeen: null as string | null,
          pest_id: d.pest_id ?? null,
        };
        cur.count += 1;
        cur.totalConf += Number(d.confidence || 0);
        if (d.created_at && (!cur.lastSeen || d.created_at > cur.lastSeen))
          cur.lastSeen = d.created_at;
        pestCounts.set(name, cur);
      }
      if (d.crop) {
        cropCounts.set(d.crop, (cropCounts.get(d.crop) ?? 0) + 1);
      }
    }

    const topPests = [...pestCounts.entries()]
      .map(([name, v]) => ({
        name,
        pest_id: v.pest_id,
        count: v.count,
        avgConfidence: v.count > 0 ? Number((v.totalConf / v.count).toFixed(2)) : 0,
        lastSeen: v.lastSeen,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topCrops = [...cropCounts.entries()]
      .map(([crop, count]) => ({ crop, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return ok({
      userId,
      sinceDays,
      totalDiagnoses: rows.length,
      topPests,
      topCrops,
    });
  },
};
