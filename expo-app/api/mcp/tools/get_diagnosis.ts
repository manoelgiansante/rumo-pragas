import { z } from 'zod';
import { ToolHandler, ok, err } from '../_types';

const InputSchema = z.object({
  diagnosisId: z.string().uuid(),
  // user mode: ignored. hub mode: REQUIRED so we scope to a specific user.
  userId: z.string().uuid().optional(),
});

export const getDiagnosis: ToolHandler = {
  name: 'get_diagnosis',
  description:
    'Retorna o diagnóstico completo (praga, confiança, cultura, localização). User mode: scope via JWT. Hub mode: requer userId.',
  inputSchema: {
    type: 'object',
    required: ['diagnosisId'],
    properties: {
      diagnosisId: { type: 'string' },
      userId: {
        type: 'string',
        description: 'UUID do dono do diagnóstico (obrigatório em hub mode)',
      },
    },
  },
  async handler(input, ctx) {
    const parsed = InputSchema.safeParse(input);
    if (!parsed.success) return err(`Invalid input: ${parsed.error.message}`);

    const userId = ctx.mode === 'user' ? ctx.userId : parsed.data.userId;
    if (!userId) {
      return err(
        ctx.mode === 'hub'
          ? 'In hub mode, userId is required to scope the diagnosis lookup.'
          : 'Authenticated user id missing.',
      );
    }

    // RLS will filter rows the caller cannot see (user mode); we additionally
    // constrain by `user_id` so a missing/looser policy still cannot leak data,
    // and in hub mode it is the ONLY ownership guard.
    const { data, error } = await ctx.supabase
      .from('pragas_diagnoses')
      .select('*')
      .eq('id', parsed.data.diagnosisId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return err(`DB error: ${error.message}`);
    // Return 404-style "not found" -- never reveal existence-of-other-users' rows.
    if (!data) return err('Diagnóstico não encontrado');
    return ok(data);
  },
};
