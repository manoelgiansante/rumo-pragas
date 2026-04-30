import { z } from 'zod';
import { ToolHandler, ok, err } from '../_types';

const InputSchema = z.object({
  status: z.enum(['pending', 'completed', 'failed']).optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

export const listDiagnoses: ToolHandler = {
  name: 'list_diagnoses',
  description:
    'Lista diagnósticos de pragas (foto + resultado AI) do usuário autenticado. Filtros: status.',
  inputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['pending', 'completed', 'failed'] },
      limit: { type: 'number', default: 20 },
    },
  },
  async handler(input, ctx) {
    const parsed = InputSchema.safeParse(input ?? {});
    if (!parsed.success) return err(`Invalid input: ${parsed.error.message}`);
    const { status, limit } = parsed.data;

    let q = ctx.supabase
      .from('diagnoses')
      .select('id, user_id, pest_name, confidence, status, created_at, image_url')
      .eq('user_id', ctx.userId) // defense-in-depth: RLS already filters
      .order('created_at', { ascending: false })
      .limit(limit);
    if (status) q = q.eq('status', status);

    const { data, error } = await q;
    if (error) return err(`DB error: ${error.message}`);
    return ok({ count: data?.length ?? 0, diagnoses: data ?? [] });
  },
};
