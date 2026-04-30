import { z } from 'zod';
import { ToolHandler, ok, err } from '../_types';

const InputSchema = z.object({
  query: z.string().min(1).max(100),
  culture: z.string().max(80).optional(),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

// Escape PostgREST `or()` filter wildcards in the user-supplied query so it
// can't break out of the ilike pattern (e.g. injecting commas / parens).
function escapeIlike(s: string): string {
  return s.replace(/[%_,()*]/g, (ch) => `\\${ch}`);
}

export const searchPestLibrary: ToolHandler = {
  name: 'search_pest_library',
  description: 'Busca na biblioteca pública de pragas por nome/sintoma. Pode filtrar por cultura.',
  inputSchema: {
    type: 'object',
    required: ['query'],
    properties: {
      query: { type: 'string' },
      culture: { type: 'string' },
      limit: { type: 'number', default: 10 },
    },
  },
  async handler(input, ctx) {
    const parsed = InputSchema.safeParse(input);
    if (!parsed.success) return err(`Invalid input: ${parsed.error.message}`);
    const { query, culture, limit } = parsed.data;

    // pest_library is public (no per-user data) but we still go through the
    // JWT-bound client so anonymous callers cannot reach it.
    const safe = escapeIlike(query);
    let q = ctx.supabase
      .from('pest_library')
      .select('id, name, scientific_name, cultures, description, control_methods')
      .or(`name.ilike.%${safe}%,scientific_name.ilike.%${safe}%,description.ilike.%${safe}%`)
      .limit(limit);
    if (culture) q = q.contains('cultures', [culture]);

    const { data, error } = await q;
    if (error) return err(`DB error: ${error.message}`);
    return ok({ query, culture, count: data?.length ?? 0, pests: data ?? [] });
  },
};
