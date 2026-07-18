import type { SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const STORAGE_BATCH_SIZE = 100;
const MAX_STORAGE_ENTRIES = 10_000;
const MAX_STORAGE_DEPTH = 10;

const STORAGE_BUCKETS = ["pragas-images", "pragas-avatars"] as const;

export class AccountCleanupError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AccountCleanupError";
  }
}

interface StorageEntry {
  id?: string | null;
  name: string;
}

interface StorageApiErrorShape {
  message?: unknown;
  status?: unknown;
  statusCode?: unknown;
}

export function isMissingStorageBucketError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as StorageApiErrorShape;
  const message = typeof candidate.message === "string"
    ? candidate.message.trim().toLowerCase()
    : "";
  const status = typeof candidate.status === "number" ? candidate.status : Number(candidate.status);
  const statusCode = typeof candidate.statusCode === "string"
    ? candidate.statusCode.trim().toLowerCase()
    : String(candidate.statusCode ?? "").trim().toLowerCase();
  return message === "bucket not found" &&
    (status === 400 || status === 404 || statusCode === "404" || statusCode === "nosuchbucket");
}

export async function purgeStoragePrefix(
  admin: SupabaseClient,
  bucket: string,
  prefix: string,
  state: { visited: number },
  depth = 0,
): Promise<void> {
  if (depth > MAX_STORAGE_DEPTH) throw new AccountCleanupError("storage_depth_exceeded");
  const entries: StorageEntry[] = [];
  for (let offset = 0; offset <= MAX_STORAGE_ENTRIES; offset += STORAGE_BATCH_SIZE) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, {
      limit: STORAGE_BATCH_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      // A bucket that was never provisioned (or was removed after its data was
      // retired) is already empty for this account. Match the Storage API's
      // exact bucket-level error; other 4xx/404 failures remain fatal.
      if (isMissingStorageBucketError(error)) return;
      throw new AccountCleanupError(`storage_list_${bucket}`);
    }
    const page = (data ?? []) as StorageEntry[];
    if (offset === MAX_STORAGE_ENTRIES && page.length > 0) {
      throw new AccountCleanupError(`storage_entry_limit_${bucket}`);
    }
    entries.push(...page);
    state.visited += page.length;
    if (state.visited > MAX_STORAGE_ENTRIES) {
      throw new AccountCleanupError(`storage_entry_limit_${bucket}`);
    }
    if (page.length < STORAGE_BATCH_SIZE) break;
  }

  const files = entries.filter((entry) => entry.id != null);
  const folders = entries.filter((entry) => entry.id == null);
  for (let start = 0; start < files.length; start += STORAGE_BATCH_SIZE) {
    const paths = files
      .slice(start, start + STORAGE_BATCH_SIZE)
      .map((entry) => `${prefix}/${entry.name}`);
    const { error } = await admin.storage.from(bucket).remove(paths);
    if (error && !isMissingStorageBucketError(error)) {
      throw new AccountCleanupError(`storage_remove_${bucket}`);
    }
  }
  for (const folder of folders) {
    await purgeStoragePrefix(admin, bucket, `${prefix}/${folder.name}`, state, depth + 1);
  }
}

export function extractLegacyPragasAvatarPath(
  avatarUrl: unknown,
  userId: string,
  supabaseUrl = SUPABASE_URL,
): string | null {
  if (typeof avatarUrl !== "string" || !avatarUrl || !supabaseUrl) return null;
  try {
    const avatar = new URL(avatarUrl);
    const expectedOrigin = new URL(supabaseUrl).origin;
    if (avatar.origin !== expectedOrigin || avatar.hash) return null;
    const cacheBusters = avatar.searchParams.getAll("t");
    if (
      avatar.search &&
      (cacheBusters.length !== 1 || !/^\d{1,20}$/.test(cacheBusters[0] ?? "") ||
        [...avatar.searchParams.keys()].some((key) => key !== "t"))
    ) return null;
    const prefix = "/storage/v1/object/public/avatars/";
    if (!avatar.pathname.startsWith(prefix)) return null;
    const path = decodeURIComponent(avatar.pathname.slice(prefix.length));
    const segments = path.split("/");
    if (
      segments.length !== 2 || segments[0] !== userId ||
      !/^avatar-[A-Za-z0-9._-]+\.(?:jpe?g|png|webp)$/i.test(segments[1])
    ) return null;
    return `${userId}/${segments[1]}`;
  } catch {
    return null;
  }
}

async function removeProvenLegacyAvatar(
  admin: SupabaseClient,
  userId: string,
): Promise<void> {
  const { data, error } = await admin
    .from("pragas_profiles")
    .select("avatar_url")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new AccountCleanupError("legacy_avatar_lookup_failed");
  const exactPath = extractLegacyPragasAvatarPath(data?.avatar_url, userId);
  if (!exactPath) return;
  const { error: removeError } = await admin.storage.from("avatars").remove([exactPath]);
  if (removeError) throw new AccountCleanupError("legacy_avatar_remove_failed");
}

export async function cleanupPragasUserData(
  admin: SupabaseClient,
  userId: string,
): Promise<void> {
  // Never scan the global shared `avatars/<userId>/` prefix. A historical
  // object is removed only when the Pragas profile proves one exact, strict
  // same-project path; malformed/unscoped URLs are preserved.
  await removeProvenLegacyAvatar(admin, userId);

  for (const bucket of STORAGE_BUCKETS) {
    await purgeStoragePrefix(admin, bucket, userId, { visited: 0 });
  }

  const { error } = await admin.rpc("cleanup_pragas_user_rows", { p_user_id: userId });
  if (error) throw new AccountCleanupError("database_cleanup_failed");
}
