import { z } from 'zod';
import { ToolHandler, ok, err } from '../_types';

const InputSchema = z.object({
  // user mode: ignored (derived from JWT)
  // hub mode: REQUIRED so tool can scope to a user
  userId: z.string().uuid().optional(),
  crop: z.string().max(80).optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

export const listDiagnoses: ToolHandler = {
  name: 'list_diagnoses',
  description:
    'Lista diagnósticos de pragas (foto + resultado AI) do usuário. Em user mode usa o JWT; em hub mode requer userId. Filtro opcional: crop.',
  inputSchema: {
    type: 'object',
    properties: {
      userId: { type: 'string', description: 'UUID do usuário (obrigatório em hub mode)' },
      crop: { type: 'string', description: 'Filtro por cultura (ex: soja, milho)' },
      limit: { type: 'number', default: 20 },
    },
  },
  async handler(input, ctx) {
    const parsed = InputSchema.safeParse(input ?? {});
    if (!parsed.success) return err(`Invalid input: ${parsed.error.message}`);
    const { crop, limit } = parsed.data;

    // Resolve effective userId:
    // - user mode: always from JWT (ignore input)
    // - hub mode: from input (RLS bypassed -- caller must scope explicitly)
    const userId = ctx.mode === 'user' ? ctx.userId : parsed.data.userId;
    if (!userId) {
      return err(
        ctx.mode === 'hub'
          ? 'In hub mode, userId is required to scope diagnoses to a user.'
          : 'Authenticated user id missing.',
      );
    }

    let q = ctx.supabase
      .from('pragas_diagnoses')
      .select(
        'id, user_id, crop, pest_id, pest_name, confidence, image_url, notes, location_name, created_at',
      )
      .eq('user_id', userId) // defense-in-depth: in user mode RLS would also filter
      .order('created_at', { ascending: false })
      .limit(limit);
    if (crop) q = q.eq('crop', crop);

    const { data, error } = await q;
    if (error) return err(`DB error: ${error.message}`);
    return ok({ userId, count: data?.length ?? 0, diagnoses: data ?? [] });
  },
};
