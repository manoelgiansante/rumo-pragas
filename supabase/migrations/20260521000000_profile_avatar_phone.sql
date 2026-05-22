-- =====================================================
-- Premium polish — Profile fields + Avatar storage
-- 2026-05-21
--
-- 1. Add avatar_url + phone to pragas_profiles (nullable, backward-compatible)
-- 2. Create `avatars` storage bucket (public read, user-scoped write)
-- 3. RLS policies: user can INSERT/UPDATE/DELETE only objects whose path
--    starts with their own auth.uid()
-- =====================================================

-- ---- 1) Schema additions (idempotent, backward-compatible) ----
ALTER TABLE public.pragas_profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT;

-- ---- 2) Avatar storage bucket ----
-- Public bucket: read is open (avatars are non-sensitive, served via CDN).
-- Writes are gated by RLS policies below. Bucket id matches frontend usage.
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- ---- 3) RLS policies on storage.objects for the avatars bucket ----
-- Path convention enforced by client: `<user_id>/avatar-<timestamp>.jpg`.
-- The first folder segment MUST equal auth.uid(), preventing one user from
-- writing into another user's namespace.

DROP POLICY IF EXISTS "avatars_select_public" ON storage.objects;
CREATE POLICY "avatars_select_public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_insert_own" ON storage.objects;
CREATE POLICY "avatars_insert_own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;
CREATE POLICY "avatars_update_own"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars_delete_own" ON storage.objects;
CREATE POLICY "avatars_delete_own"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
