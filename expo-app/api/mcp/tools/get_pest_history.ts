import { z } from 'zod';
import { getSupabase } from '../_supabase';
import { ToolHandler, ok, err } from '../_types';

const InputSchema = z.object({
  userId: z.string().uuid(),
  sinceDays: z.number().int().min(1).max(365).optional().default(90),
});

export const getPestHistory: ToolHandler = {
  name: 'get_pest_history',
  description: 'Histórico de pragas diagnosticadas pelo usuário: frequência, tendência, top pragas.',
  inputSchema: {
    type: 'object',
    required: ['userId'],
    properties: {
      userId: { type: 'string' },
      sinceDays: { type: 'number', default: 90 },
    },
  },
  async handler(input) {
    const parsed = InputSchema.safeParse(input);
    if (!parsed.success) return err(`Invalid input: ${parsed.error.message}`);
    const { userId, sinceDays } = parsed.data;
    const since = new Date(Date.now() - sinceDays * 86400_000).toISOString();

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('diagnoses')
      .select('pest_name, confidence, created_at, status')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .gte('created_at', since)
      .order('created_at', { ascending: false });
    if (error) return err(`DB error: ${error.message}`);

    const rows = data ?? [];
    const counts = new Map<string, { count: number; avgConf: number; totalConf: number }>();
    for (const d of rows) {
      if (!d.pest_name) continue;
      const cur = counts.get(d.pest_name) ?? { count: 0, avgConf: 0, totalConf: 0 };
      cur.count += 1;
      cur.totalConf += Number(d.confidence || 0);
      cur.avgConf = cur.totalConf / cur.count;
      counts.set(d.pest_name, cur);
    }
    const top = [...counts.entries()]
      .map(([name, v]) => ({ name, count: v.count, avgConfidence: Number(v.avgConf.toFixed(2)) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return ok({ userId, sinceDays, totalDiagnoses: rows.length, topPests: top });
  },
};
