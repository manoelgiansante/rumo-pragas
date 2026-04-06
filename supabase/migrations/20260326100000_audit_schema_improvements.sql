-- =====================================================
-- Migration: Schema improvements from audit
-- =====================================================

-- 1. Add severity column to diagnoses for structured severity tracking
ALTER TABLE pragas_diagnoses ADD COLUMN IF NOT EXISTS severity TEXT
  CHECK (severity IS NULL OR severity IN ('low', 'medium', 'high', 'critical'));

-- 2. Add index on created_at for monthly count queries (used by subscription limits)
CREATE INDEX IF NOT EXISTS idx_diagnoses_created_at ON pragas_diagnoses(created_at);

-- 3. Add UPDATE policy on pragas_diagnoses (missing - users can't update their own diagnoses)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'pragas_diagnoses'
      AND policyname = 'Users can update own diagnoses'
  ) THEN
    CREATE POLICY "Users can update own diagnoses"
      ON pragas_diagnoses FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;
END
$$;

-- 4. Add 'trialing' to subscriptions status check constraint
-- First drop old constraint, then recreate with trialing included
-- (trialing was already in schema.sql but this ensures it for existing DBs)
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('active', 'canceled', 'past_due', 'trialing'));

-- 5. Add index on deletion_requested_at for efficient cron deletion queries
CREATE INDEX IF NOT EXISTS idx_profiles_deletion_requested
  ON pragas_profiles(deletion_requested_at)
  WHERE deletion_requested_at IS NOT NULL;

-- 6. Convert notes to JSONB for structured diagnosis metadata
-- Using a safe approach: add new column, migrate data, rename
-- Step 6a: Add new JSONB column
ALTER TABLE pragas_diagnoses ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Step 6b: Migrate existing text notes into metadata.notes field
UPDATE pragas_diagnoses
SET metadata = jsonb_build_object('notes', notes)
WHERE notes IS NOT NULL AND (metadata IS NULL OR metadata = '{}');

-- Note: We keep the 'notes' column for backward compatibility.
-- The app should transition to using 'metadata' for new data.
-- Once app migration is complete, 'notes' column can be dropped.
