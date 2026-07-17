import { supabase } from './supabase';

export interface PragasProfileMutableFields {
  full_name?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  crops?: string[] | null;
  avatar_path?: string | null;
  avatar_url?: string | null;
}

function pickMutableFields(fields: PragasProfileMutableFields): PragasProfileMutableFields {
  return {
    ...(fields.full_name !== undefined ? { full_name: fields.full_name } : {}),
    ...(fields.city !== undefined ? { city: fields.city } : {}),
    ...(fields.state !== undefined ? { state: fields.state } : {}),
    ...(fields.phone !== undefined ? { phone: fields.phone } : {}),
    ...(fields.crops !== undefined ? { crops: fields.crops } : {}),
    ...(fields.avatar_path !== undefined ? { avatar_path: fields.avatar_path } : {}),
    ...(fields.avatar_url !== undefined ? { avatar_url: fields.avatar_url } : {}),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

async function updateExistingProfile(
  userId: string,
  fields: PragasProfileMutableFields,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('pragas_profiles')
    .update(fields)
    .eq('user_id', userId)
    .select('user_id')
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

export async function savePragasProfileFields(
  userId: string,
  fields: PragasProfileMutableFields,
): Promise<void> {
  if (!userId.trim()) throw new Error('PRAGAS_PROFILE_INVALID_USER');
  const mutableFields = pickMutableFields(fields);
  if (Object.keys(mutableFields).length === 0) {
    throw new Error('PRAGAS_PROFILE_NO_MUTABLE_FIELDS');
  }

  if (await updateExistingProfile(userId, mutableFields)) return;

  const { error: insertError } = await supabase
    .from('pragas_profiles')
    .insert({ user_id: userId, ...mutableFields });
  if (!insertError) return;
  if (!isUniqueViolation(insertError)) throw insertError;

  if (!(await updateExistingProfile(userId, mutableFields))) throw insertError;
}
