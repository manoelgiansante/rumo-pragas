-- P0-3 (LGPD): user_preferences — explicit opt-in for sharing location
-- Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018) Art. 7º, I
-- require explicit, informed, free consent before processing location data.
-- This table stores the consent receipt. Default = no consent.

CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  share_location boolean NOT NULL DEFAULT false,
  share_location_purpose text,
  consented_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_preferences IS
  'User-level privacy preferences. Controls opt-in flags such as location sharing for LGPD compliance.';
COMMENT ON COLUMN public.user_preferences.share_location IS
  'LGPD opt-in flag. When true, edge functions may read/persist the user location for improved diagnosis and regional alerts.';
COMMENT ON COLUMN public.user_preferences.share_location_purpose IS
  'Free-text justification shown to the user at consent time (kept for audit).';
COMMENT ON COLUMN public.user_preferences.consented_at IS
  'Timestamp when the user granted (or revoked) consent.';

-- keep updated_at fresh
CREATE OR REPLACE FUNCTION public.user_preferences_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_preferences_touch_updated_at ON public.user_preferences;
CREATE TRIGGER user_preferences_touch_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.user_preferences_touch_updated_at();

-- RLS — user can read/write ONLY their own preferences
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_preferences_select_own" ON public.user_preferences;
CREATE POLICY "user_preferences_select_own"
  ON public.user_preferences
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_preferences_insert_own" ON public.user_preferences;
CREATE POLICY "user_preferences_insert_own"
  ON public.user_preferences
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_preferences_update_own" ON public.user_preferences;
CREATE POLICY "user_preferences_update_own"
  ON public.user_preferences
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_preferences_delete_own" ON public.user_preferences;
CREATE POLICY "user_preferences_delete_own"
  ON public.user_preferences
  FOR DELETE
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO authenticated;
