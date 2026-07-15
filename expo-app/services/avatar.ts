import * as Crypto from 'expo-crypto';
import { Config } from '../constants/config';
import { supabase, timeoutHeader } from './supabase';

export const PRAGAS_AVATAR_BUCKET = 'pragas-avatars';
export const PRAGAS_AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const PRAGAS_AVATAR_SIGNED_URL_SECONDS = 15 * 60;
const LEGACY_AVATAR_BUCKET = 'avatars';
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isOwnedPragasAvatarPath(userId: string, path: string | null): path is string {
  if (!userId.trim() || !path) return false;
  const pattern = new RegExp(
    `^${escapeRegExp(userId)}/avatar-[a-zA-Z0-9-]{1,80}\\.(?:jpg|jpeg|png|webp)$`,
  );
  return pattern.test(path);
}

export function parseOwnedLegacyAvatarUrl(userId: string, value: string | null): string | null {
  if (!value || !Config.SUPABASE_URL) return null;
  try {
    const candidate = new URL(value);
    const base = new URL(Config.SUPABASE_URL);
    if (candidate.origin !== base.origin || candidate.hash) return null;
    const queryEntries = Array.from(candidate.searchParams.entries());
    if (
      queryEntries.length > 1 ||
      (queryEntries.length === 1 &&
        (queryEntries[0]![0] !== 't' || !/^\d{1,20}$/.test(queryEntries[0]![1])))
    ) {
      return null;
    }
    const prefix = `/storage/v1/object/public/${LEGACY_AVATAR_BUCKET}/`;
    if (!candidate.pathname.startsWith(prefix)) return null;
    const path = decodeURIComponent(candidate.pathname.slice(prefix.length));
    return isOwnedPragasAvatarPath(userId, path) ? path : null;
  } catch {
    return null;
  }
}

function validateSignedUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const signed = new URL(value);
    const base = new URL(Config.SUPABASE_URL);
    return signed.protocol === 'https:' && signed.origin === base.origin ? value : null;
  } catch {
    return null;
  }
}

export async function getPragasAvatarSignedUrl(
  userId: string,
  path: string | null,
): Promise<string | null> {
  if (!isOwnedPragasAvatarPath(userId, path)) return null;
  const { data, error } = await supabase.storage
    .from(PRAGAS_AVATAR_BUCKET)
    .createSignedUrl(path, PRAGAS_AVATAR_SIGNED_URL_SECONDS);
  if (error) return null;
  return validateSignedUrl(data?.signedUrl);
}

async function removeExactObject(bucket: string, path: string): Promise<void> {
  try {
    await supabase.storage.from(bucket).remove([path]);
  } catch {
    // Orphan cleanup is retryable by the server-side account cleanup job.
  }
}

export interface ReplacePragasAvatarInput {
  userId: string;
  bytes: ArrayBuffer;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  previousPath: string | null;
  previousLegacyUrl: string | null;
}

export interface ReplacePragasAvatarResult {
  path: string;
  signedUrl: string | null;
}

export async function replacePragasAvatar(
  input: ReplacePragasAvatarInput,
): Promise<ReplacePragasAvatarResult> {
  const { userId, bytes, mimeType, previousPath, previousLegacyUrl } = input;
  if (!userId.trim() || !ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error('AVATAR_INVALID_INPUT');
  }
  if (bytes.byteLength < 1 || bytes.byteLength > PRAGAS_AVATAR_MAX_BYTES) {
    throw new Error('AVATAR_INVALID_SIZE');
  }

  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const path = `${userId}/avatar-${Crypto.randomUUID()}.${extension}`;
  if (!isOwnedPragasAvatarPath(userId, path)) throw new Error('AVATAR_INVALID_PATH');

  const { error: uploadError } = await supabase.storage
    .from(PRAGAS_AVATAR_BUCKET)
    .upload(path, bytes, {
      contentType: mimeType,
      upsert: false,
      headers: timeoutHeader(60_000),
    });
  if (uploadError) throw new Error('AVATAR_UPLOAD_FAILED');

  const { error: profileError } = await supabase.from('pragas_profiles').upsert(
    {
      user_id: userId,
      avatar_path: path,
      avatar_url: null,
    },
    { onConflict: 'user_id' },
  );
  if (profileError) {
    await removeExactObject(PRAGAS_AVATAR_BUCKET, path);
    throw new Error('AVATAR_PROFILE_SAVE_FAILED');
  }

  if (previousPath !== path && isOwnedPragasAvatarPath(userId, previousPath)) {
    await removeExactObject(PRAGAS_AVATAR_BUCKET, previousPath);
  }
  const legacyPath = parseOwnedLegacyAvatarUrl(userId, previousLegacyUrl);
  if (legacyPath) await removeExactObject(LEGACY_AVATAR_BUCKET, legacyPath);

  return {
    path,
    signedUrl: await getPragasAvatarSignedUrl(userId, path),
  };
}
