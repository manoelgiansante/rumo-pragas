import { z } from 'zod';
import { getSupabase } from '../_supabase';
import { ToolHandler, ok, err } from '../_types';

const InputSchema = z.object({
  query: z.string().min(1).max(100),
  culture: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

export const searchPestLibrary: ToolHandler = {
  name: 'search_pest_library',
  description: 'Busca na biblioteca de pragas por nome/sintoma. Pode filtrar por cultura.',
  inputSchema: {
    type: 'object',
    required: ['query'],
    properties: {
      query: { type: 'string' },
      culture: { type: 'string' },
      limit: { type: 'number', default: 10 },
    },
  },
  async handler(input) {
    const parsed = InputSchema.safeParse(input);
    if (!parsed.success) return err(`Invalid input: ${parsed.error.message}`);
    const { query, culture, limit } = parsed.data;

    const supabase = getSupabase();
    let q = supabase
      .from('pest_library')
      .select('id, name, scientific_name, cultures, description, control_methods')
      .limit(limit);
    // Use ilike on name / description for full-text-ish search
    q = q.or(`name.ilike.%${query}%,scientific_name.ilike.%${query}%,description.ilike.%${query}%`);
    if (culture) q = q.contains('cultures', [culture]);

    const { data, error } = await q;
    if (error) return err(`DB error: ${error.message}`);
    return ok({ query, culture, count: data?.length ?? 0, pests: data ?? [] });
  },
};
