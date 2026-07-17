import { z } from 'zod';
import { ToolHandler, ok, err } from '../_types';

// Schema drift fix (2026-07-06): the real table is `pragas_diagnoses` (jxcn),
// NOT `diagnoses`, and it has NO `status` column — a Pragas row is only ever
// INSERTed after the AI diagnosis completes, so every row is "completed".
// The status filter has been removed (there is nothing to filter on).
const InputSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(20),
});

export const listDiagnoses: ToolHandler = {
  name: 'list_diagnoses',
  description:
    'Lista os diagnósticos de pragas (foto + resultado da IA) do usuário autenticado, mais recentes primeiro.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'number', default: 20 },
    },
  },
  async handler(input, ctx) {
    const parsed = InputSchema.safeParse(input ?? {});
    if (!parsed.success) return err('Invalid input');
    const { limit } = parsed.data;

    const { data, error } = await ctx.supabase
      .from('pragas_diagnoses')
      .select('id,crop,pest_id,pest_name,confidence,created_at')
      .eq('user_id', ctx.userId) // defense-in-depth: RLS already filters
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return err('Diagnoses temporarily unavailable');
    return ok({ count: data?.length ?? 0, diagnoses: data ?? [] });
  },
};
