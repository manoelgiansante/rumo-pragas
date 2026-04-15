import { z } from 'zod';
import { getSupabase } from '../_supabase';
import { ToolHandler, ok, err } from '../_types';

const InputSchema = z.object({ diagnosisId: z.string().uuid() });

export const getDiagnosis: ToolHandler = {
  name: 'get_diagnosis',
  description: 'Retorna o diagnóstico completo (praga identificada, confiança, recomendações).',
  inputSchema: {
    type: 'object',
    required: ['diagnosisId'],
    properties: { diagnosisId: { type: 'string' } },
  },
  async handler(input) {
    const parsed = InputSchema.safeParse(input);
    if (!parsed.success) return err(`Invalid input: ${parsed.error.message}`);

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('diagnoses')
      .select('*')
      .eq('id', parsed.data.diagnosisId)
      .maybeSingle();
    if (error) return err(`DB error: ${error.message}`);
    if (!data) return err('Diagnóstico não encontrado');
    return ok(data);
  },
};
