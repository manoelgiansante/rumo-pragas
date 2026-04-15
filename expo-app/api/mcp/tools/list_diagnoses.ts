import { z } from 'zod';
import { getSupabase } from '../_supabase';
import { ToolHandler, ok, err } from '../_types';

const InputSchema = z.object({
  userId: z.string().uuid().optional(),
  status: z.enum(['pending', 'completed', 'failed']).optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

export const listDiagnoses: ToolHandler = {
  name: 'list_diagnoses',
  description: 'Lista diagnósticos de pragas (foto + resultado AI). Filtros: userId, status.',
  inputSchema: {
    type: 'object',
    properties: {
      userId: { type: 'string' },
      status: { type: 'string', enum: ['pending', 'completed', 'failed'] },
      limit: { type: 'number', default: 20 },
    },
  },
  async handler(input) {
    const parsed = InputSchema.safeParse(input ?? {});
    if (!parsed.success) return err(`Invalid input: ${parsed.error.message}`);
    const { userId, status, limit } = parsed.data;

    const supabase = getSupabase();
    let q = supabase
      .from('diagnoses')
      .select('id, user_id, pest_name, confidence, status, created_at, image_url')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (userId) q = q.eq('user_id', userId);
    if (status) q = q.eq('status', status);

    const { data, error } = await q;
    if (error) return err(`DB error: ${error.message}`);
    return ok({ count: data?.length ?? 0, diagnoses: data ?? [] });
  },
};
