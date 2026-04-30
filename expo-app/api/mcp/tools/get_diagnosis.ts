import { z } from 'zod';
import { ToolHandler, ok, err } from '../_types';

const InputSchema = z.object({ diagnosisId: z.string().uuid() });

export const getDiagnosis: ToolHandler = {
  name: 'get_diagnosis',
  description:
    'Retorna o diagnóstico completo do usuário autenticado (praga identificada, confiança, recomendações).',
  inputSchema: {
    type: 'object',
    required: ['diagnosisId'],
    properties: { diagnosisId: { type: 'string' } },
  },
  async handler(input, ctx) {
    const parsed = InputSchema.safeParse(input);
    if (!parsed.success) return err(`Invalid input: ${parsed.error.message}`);

    // RLS will filter rows the caller cannot see; we additionally constrain
    // by `user_id` so a missing/looser policy still cannot leak data.
    const { data, error } = await ctx.supabase
      .from('diagnoses')
      .select('*')
      .eq('id', parsed.data.diagnosisId)
      .eq('user_id', ctx.userId)
      .maybeSingle();
    if (error) return err(`DB error: ${error.message}`);
    // Return 404-style "not found" — never reveal existence-of-other-users' rows.
    if (!data) return err('Diagnóstico não encontrado');
    return ok(data);
  },
};
