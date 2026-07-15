-- Rumo Pragas backend safety primitives.
-- Target project: jxcnfyeemdltdfqtgbcl (shared). Every object is Pragas-prefixed.
-- This migration is additive, idempotent and has a reviewed rollback script in
-- supabase/rollback/20260714143000_pragas_backend_security.down.sql.

DO $$
BEGIN
  CREATE TYPE public.pragas_ai_report_reason AS ENUM (
    'unsafe_recommendation',
    'incorrect_information',
    'harmful_content',
    'privacy',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE public.pragas_ai_report_status AS ENUM (
    'received',
    'reviewing',
    'resolved',
    'dismissed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE public.pragas_diagnosis_feedback_verdict AS ENUM (
    'correct',
    'incorrect',
    'unsure'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

-- Deletion state deliberately uses text plus a named CHECK constraint below.
-- PostgreSQL 17 cannot safely use a value added to a pre-existing enum until
-- the surrounding migration transaction commits. Keeping the operational
-- state independent from a possibly partial development enum makes replay
-- deterministic without transaction boundaries or unsafe intermediate state.

CREATE OR REPLACE FUNCTION public.pragas_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pragas_touch_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pragas_touch_updated_at() FROM anon;
REVOKE EXECUTE ON FUNCTION public.pragas_touch_updated_at() FROM authenticated;

-- ---------------------------------------------------------------------------
-- Normalize the historical profile drift. A clean replay starts with `id`
-- only, while the shared production schema and current clients use `user_id`.
-- Keep both identifiers, backfill only provable auth links, and avoid copying
-- email into the app profile (data minimization).
-- ---------------------------------------------------------------------------
ALTER TABLE public.pragas_profiles
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS avatar_path text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS phone text;

UPDATE public.pragas_profiles AS profile
   SET user_id = profile.id
 WHERE profile.user_id IS NULL
   AND EXISTS (
     SELECT 1 FROM auth.users AS auth_user WHERE auth_user.id = profile.id
   );

CREATE UNIQUE INDEX IF NOT EXISTS idx_pragas_profiles_user_id_unique
  ON public.pragas_profiles (user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.pragas_profiles'::regclass
       AND conname = 'pragas_profiles_user_id_fkey'
  ) THEN
    ALTER TABLE public.pragas_profiles
      ADD CONSTRAINT pragas_profiles_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.pragas_profiles AS profile
     WHERE profile.user_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM auth.users AS auth_user WHERE auth_user.id = profile.user_id
       )
  ) THEN
    ALTER TABLE public.pragas_profiles
      VALIDATE CONSTRAINT pragas_profiles_user_id_fkey;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pragas_profiles AS profile WHERE profile.user_id IS NULL
  ) THEN
    ALTER TABLE public.pragas_profiles ALTER COLUMN user_id SET NOT NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.pragas_profiles'::regclass
       AND conname = 'pragas_profiles_avatar_path_check'
  ) THEN
    ALTER TABLE public.pragas_profiles
      ADD CONSTRAINT pragas_profiles_avatar_path_check CHECK (
        avatar_path IS NULL OR avatar_path ~ (
          '^' || user_id::text ||
          '/avatar-[A-Za-z0-9._-]+[.](jpg|jpeg|png|webp)$'
        )
      ) NOT VALID;
  END IF;
END
$$;

ALTER TABLE public.pragas_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pragas_profiles_select_by_user_id ON public.pragas_profiles;
CREATE POLICY pragas_profiles_select_by_user_id
  ON public.pragas_profiles FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id AND id = user_id);

DROP POLICY IF EXISTS pragas_profiles_insert_by_user_id ON public.pragas_profiles;
CREATE POLICY pragas_profiles_insert_by_user_id
  ON public.pragas_profiles FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id AND id = user_id);

DROP POLICY IF EXISTS pragas_profiles_update_by_user_id ON public.pragas_profiles;
CREATE POLICY pragas_profiles_update_by_user_id
  ON public.pragas_profiles FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id AND id = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id AND id = user_id);

-- The historical schema did not consistently grant UPDATE even when the RLS
-- policy existed. Profile/avatar editing needs both layers; ownership remains
-- enforced by the policies and identity constraint above.
GRANT SELECT, UPDATE ON TABLE public.pragas_profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.pragas_profiles_sync_user_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := NEW.id;
  END IF;
  IF NEW.id <> NEW.user_id THEN
    RAISE EXCEPTION 'pragas_profile_identity_mismatch';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pragas_profiles_sync_user_id()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS pragas_profiles_sync_user_id ON public.pragas_profiles;
CREATE TRIGGER pragas_profiles_sync_user_id
  BEFORE INSERT OR UPDATE OF id, user_id ON public.pragas_profiles
  FOR EACH ROW EXECUTE FUNCTION public.pragas_profiles_sync_user_id();

-- Preserve any unknown historical drift for explicit review, but prevent every
-- future INSERT/UPDATE from creating split ownership even if a trigger is
-- accidentally bypassed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.pragas_profiles'::regclass
       AND conname = 'pragas_profiles_identity_match_check'
  ) THEN
    ALTER TABLE public.pragas_profiles
      ADD CONSTRAINT pragas_profiles_identity_match_check
      CHECK (id = user_id) NOT VALID;
  END IF;
END
$$;

-- The historical auth.users signup trigger is a portfolio-owned shared hook.
-- A function-body substring cannot prove exclusive Pragas ownership, so this
-- migration intentionally performs zero mutation on auth triggers. Removal is
-- gated on an approved trigger name + definition hash from a sanitized jxcn
-- schema dump. The complete-link predicate below still requires both a Pragas
-- profile and an active app-scoped subscription, so a stray profile can never
-- authorize access while that external portfolio review is pending.

-- An app-scoped ledger is the only proof that the authenticated user actually
-- entered Rumo Pragas. The historical portfolio signup trigger may create a
-- profile and subscription for every shared auth identity, so those two rows
-- alone must never activate this app.
CREATE TABLE IF NOT EXISTS public.pragas_app_links (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  link_version text NOT NULL CHECK (link_version = '2026-07-14.1'),
  active boolean NOT NULL DEFAULT true,
  linked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_linked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deactivated_at timestamptz,
  CHECK (
    (active AND deactivated_at IS NULL)
    OR (NOT active AND deactivated_at IS NOT NULL)
  )
);

ALTER TABLE public.pragas_app_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pragas_app_links FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pragas_app_links FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pragas_app_links TO service_role;

CREATE TABLE IF NOT EXISTS public.pragas_user_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  share_location boolean NOT NULL DEFAULT false,
  share_location_purpose text CHECK (
    share_location_purpose IS NULL OR char_length(share_location_purpose) <= 500
  ),
  consented_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (share_location = false OR consented_at IS NOT NULL)
);

ALTER TABLE public.pragas_user_preferences
  ADD COLUMN IF NOT EXISTS location_consent_revision bigint NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.pragas_user_preferences'::regclass
       AND conname = 'pragas_user_preferences_location_revision_check'
  ) THEN
    ALTER TABLE public.pragas_user_preferences
      ADD CONSTRAINT pragas_user_preferences_location_revision_check
      CHECK (location_consent_revision >= 0);
  END IF;
END
$$;

-- Durable idempotency and a server-authoritative revision make location
-- consent safe across web tabs, devices and process restarts. Client clocks are
-- audit metadata only; they never decide ordering.
CREATE TABLE IF NOT EXISTS public.pragas_location_consent_decisions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  decision_id uuid NOT NULL,
  observed_revision bigint,
  applied_revision bigint NOT NULL,
  share_location boolean NOT NULL,
  purpose text NOT NULL CHECK (char_length(purpose) BETWEEN 1 AND 500),
  consented_at timestamptz NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('applied', 'stale_grant')),
  resulting_share_location boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, decision_id),
  CHECK (observed_revision IS NULL OR observed_revision >= 0),
  CHECK (applied_revision >= 0)
);

ALTER TABLE public.pragas_location_consent_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pragas_location_consent_decisions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pragas_location_consent_decisions
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.pragas_location_consent_decisions TO service_role;

CREATE INDEX IF NOT EXISTS idx_pragas_location_consent_decisions_retention
  ON public.pragas_location_consent_decisions (
    user_id, created_at DESC, decision_id DESC
  );

-- Bound the audit/idempotency window on migration replay as well as at runtime.
-- Revocations remain fail-closed after pruning: replaying one simply records a
-- new false decision. A pruned old grant still carries its old revision and is
-- rejected by CAS, so pruning can never resurrect consent.
WITH ranked AS (
  SELECT user_id, decision_id,
         row_number() OVER (
           PARTITION BY user_id ORDER BY created_at DESC, decision_id DESC
         ) AS retention_rank
    FROM public.pragas_location_consent_decisions
)
DELETE FROM public.pragas_location_consent_decisions AS decision
 USING ranked
 WHERE ranked.user_id = decision.user_id
   AND ranked.decision_id = decision.decision_id
   AND ranked.retention_rank > 256;

CREATE OR REPLACE FUNCTION public.set_pragas_location_consent(
  p_decision_id uuid,
  p_share_location boolean,
  p_purpose text,
  p_consented_at timestamptz,
  p_observed_revision bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_current_revision bigint;
  v_current_share_location boolean;
  v_new_revision bigint;
  v_existing public.pragas_location_consent_decisions%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'location_consent_unauthorized';
  END IF;
  IF p_decision_id IS NULL
     OR p_share_location IS NULL
     OR p_purpose IS NULL
     OR p_purpose <> 'rumo-pragas:approximate-location:open-meteo+diagnosis-context:2026-07-14.1'
     OR p_consented_at IS NULL
     OR p_observed_revision < 0
     OR (p_share_location AND p_observed_revision IS NULL)
  THEN
    RAISE EXCEPTION 'invalid_location_consent_decision';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.pragas_app_links AS link
     WHERE link.user_id = v_user_id
       AND link.active
  ) THEN
    RAISE EXCEPTION 'pragas_app_link_inactive';
  END IF;

  INSERT INTO public.pragas_user_preferences (user_id)
  VALUES (v_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT preference.location_consent_revision, preference.share_location
    INTO v_current_revision, v_current_share_location
    FROM public.pragas_user_preferences AS preference
   WHERE preference.user_id = v_user_id
   FOR UPDATE;

  SELECT decision.*
    INTO v_existing
    FROM public.pragas_location_consent_decisions AS decision
   WHERE decision.user_id = v_user_id
     AND decision.decision_id = p_decision_id;

  IF FOUND THEN
    IF v_existing.observed_revision IS DISTINCT FROM p_observed_revision
       OR v_existing.share_location IS DISTINCT FROM p_share_location
       OR v_existing.purpose IS DISTINCT FROM p_purpose
       OR v_existing.consented_at IS DISTINCT FROM p_consented_at
    THEN
      RAISE EXCEPTION 'location_consent_decision_reuse';
    END IF;
    RETURN jsonb_build_object(
      'applied', v_existing.outcome = 'applied',
      'replayed', true,
      'code', v_existing.outcome,
      'decision_id', p_decision_id,
      'decision_revision', v_existing.applied_revision,
      'current_revision', v_current_revision,
      'current_share_location', v_current_share_location
    );
  END IF;

  -- Grants are compare-and-set: a grant based on revision N may not overwrite
  -- any decision that advanced the server to N+1. Revocations intentionally do
  -- not require a matching revision and always advance state, so an offline
  -- withdrawal can never be lost to an older grant.
  IF p_share_location AND p_observed_revision <> v_current_revision THEN
    INSERT INTO public.pragas_location_consent_decisions (
      user_id, decision_id, observed_revision, applied_revision,
      share_location, purpose, consented_at, outcome,
      resulting_share_location
    ) VALUES (
      v_user_id, p_decision_id, p_observed_revision, v_current_revision,
      true, p_purpose, p_consented_at, 'stale_grant',
      v_current_share_location
    );
    DELETE FROM public.pragas_location_consent_decisions AS old_decision
     USING (
       SELECT decision.decision_id
         FROM public.pragas_location_consent_decisions AS decision
        WHERE decision.user_id = v_user_id
        ORDER BY decision.created_at DESC, decision.decision_id DESC
        OFFSET 256
     ) AS expired
     WHERE old_decision.user_id = v_user_id
       AND old_decision.decision_id = expired.decision_id;
    RETURN jsonb_build_object(
      'applied', false,
      'replayed', false,
      'code', 'stale_grant',
      'decision_id', p_decision_id,
      'decision_revision', v_current_revision,
      'current_revision', v_current_revision,
      'current_share_location', v_current_share_location
    );
  END IF;

  v_new_revision := v_current_revision + 1;
  UPDATE public.pragas_user_preferences AS preference
     SET share_location = p_share_location,
         share_location_purpose = p_purpose,
         consented_at = p_consented_at,
         location_consent_revision = v_new_revision
   WHERE preference.user_id = v_user_id;

  INSERT INTO public.pragas_location_consent_decisions (
    user_id, decision_id, observed_revision, applied_revision,
    share_location, purpose, consented_at, outcome,
    resulting_share_location
  ) VALUES (
    v_user_id, p_decision_id, p_observed_revision, v_new_revision,
    p_share_location, p_purpose, p_consented_at, 'applied',
    p_share_location
  );

  DELETE FROM public.pragas_location_consent_decisions AS old_decision
   USING (
     SELECT decision.decision_id
       FROM public.pragas_location_consent_decisions AS decision
      WHERE decision.user_id = v_user_id
      ORDER BY decision.created_at DESC, decision.decision_id DESC
      OFFSET 256
   ) AS expired
   WHERE old_decision.user_id = v_user_id
     AND old_decision.decision_id = expired.decision_id;

  RETURN jsonb_build_object(
    'applied', true,
    'replayed', false,
    'code', 'applied',
    'decision_id', p_decision_id,
    'decision_revision', v_new_revision,
    'current_revision', v_new_revision,
    'current_share_location', p_share_location
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_pragas_location_consent(
  uuid, boolean, text, timestamptz, bigint
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_pragas_location_consent(
  uuid, boolean, text, timestamptz, bigint
) TO authenticated;

-- The legacy generic table is shared. Create a disabled app-specific row only
-- for identities proven by a diagnosis/app subscription; never treat the old
-- consent as Pragas consent because purpose/providers changed. The source row
-- remains untouched and the client must obtain fresh explicit consent.
INSERT INTO public.pragas_user_preferences (
  user_id, share_location, share_location_purpose, consented_at, updated_at
)
SELECT
  preference.user_id,
  false,
  NULL,
  NULL,
  preference.updated_at
FROM public.user_preferences AS preference
WHERE EXISTS (
  SELECT 1 FROM public.pragas_diagnoses AS diagnosis
   WHERE diagnosis.user_id = preference.user_id
) OR EXISTS (
  SELECT 1 FROM public.pragas_app_links AS link
   WHERE link.user_id = preference.user_id
     AND link.active
)
ON CONFLICT (user_id) DO NOTHING;

DROP TRIGGER IF EXISTS pragas_user_preferences_touch_updated_at
  ON public.pragas_user_preferences;
CREATE TRIGGER pragas_user_preferences_touch_updated_at
  BEFORE UPDATE ON public.pragas_user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.pragas_touch_updated_at();

ALTER TABLE public.pragas_user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pragas_user_preferences FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pragas_user_preferences_own ON public.pragas_user_preferences;
CREATE POLICY pragas_user_preferences_own
  ON public.pragas_user_preferences FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
REVOKE ALL ON TABLE public.pragas_user_preferences FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.pragas_user_preferences FROM authenticated;
GRANT SELECT ON TABLE public.pragas_user_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pragas_user_preferences TO service_role;

-- Future-only LGPD location minimization. NOT VALID intentionally leaves the
-- four known historical rows untouched; PostgreSQL still enforces these
-- constraints on every new or changed row. Historical coarsening is a separate
-- real-data remediation gate and is never performed by this launch migration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.pragas_diagnoses'::regclass
       AND conname = 'pragas_diagnoses_location_range_check'
  ) THEN
    ALTER TABLE public.pragas_diagnoses
      ADD CONSTRAINT pragas_diagnoses_location_range_check CHECK (
        (location_lat IS NULL OR location_lat BETWEEN -90 AND 90)
        AND (location_lng IS NULL OR location_lng BETWEEN -180 AND 180)
        AND ((location_lat IS NULL) = (location_lng IS NULL))
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.pragas_diagnoses'::regclass
       AND conname = 'pragas_diagnoses_location_precision_check'
  ) THEN
    ALTER TABLE public.pragas_diagnoses
      ADD CONSTRAINT pragas_diagnoses_location_precision_check CHECK (
        (location_lat IS NULL OR location_lat = round(location_lat::numeric, 2)::double precision)
        AND
        (location_lng IS NULL OR location_lng = round(location_lng::numeric, 2)::double precision)
      ) NOT VALID;
  END IF;
END
$$;

-- Durable evidence of the exact AI consent presented by the client. Direct
-- client mutation is deliberately denied: the diagnosis/chat Edge Functions
-- validate the header contract and record acceptance/use through service-only
-- RPCs immediately before a provider can receive content.
CREATE TABLE IF NOT EXISTS public.pragas_ai_consents (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('diagnosis', 'chat')),
  version text NOT NULL CHECK (
    version = '2026-07-14.1' AND char_length(version) <= 32
  ),
  accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_used_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz,
  PRIMARY KEY (user_id, purpose, version),
  CHECK (last_used_at >= accepted_at),
  CHECK (revoked_at IS NULL OR revoked_at >= accepted_at)
);

ALTER TABLE public.pragas_ai_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pragas_ai_consents FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pragas_ai_consents FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pragas_ai_consents TO service_role;

CREATE OR REPLACE FUNCTION public.record_pragas_ai_consent(
  p_user_id uuid,
  p_purpose text,
  p_version text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_accepted_at timestamptz;
BEGIN
  IF p_user_id IS NULL OR p_purpose NOT IN ('diagnosis', 'chat')
     OR p_version <> '2026-07-14.1'
  THEN
    RAISE EXCEPTION 'invalid_pragas_ai_consent';
  END IF;

  -- Provider routes may only record use of an already-active ledger entry.
  -- Headers are context, never an authorization to undo a global revocation.
  UPDATE public.pragas_ai_consents AS consent
     SET last_used_at = v_now
   WHERE consent.user_id = p_user_id
     AND consent.purpose = p_purpose
     AND consent.version = p_version
     AND consent.revoked_at IS NULL
  RETURNING consent.accepted_at INTO v_accepted_at;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'accepted', false,
      'purpose', p_purpose,
      'version', p_version,
      'code', 'ai_consent_inactive'
    );
  END IF;

  RETURN jsonb_build_object(
    'accepted', true,
    'purpose', p_purpose,
    'version', p_version,
    'accepted_at', v_accepted_at,
    'last_used_at', v_now
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_pragas_ai_consent(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_pragas_ai_consent(uuid, text, text)
  TO service_role;

-- Shared analytics/audit tables historically had no app discriminator. Keep
-- legacy NULL rows untouched; all new Pragas writes must identify the app so
-- access/export/deletion can be precise without changing sibling-app data.
ALTER TABLE IF EXISTS public.analytics_events
  ADD COLUMN IF NOT EXISTS app text;
ALTER TABLE IF EXISTS public.audit_log
  ADD COLUMN IF NOT EXISTS app text;

DO $$
BEGIN
  IF to_regclass('public.analytics_events') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.analytics_events'::regclass
       AND conname = 'analytics_events_app_check'
  ) THEN
    ALTER TABLE public.analytics_events
      ADD CONSTRAINT analytics_events_app_check
      CHECK (app IS NULL OR app ~ '^[a-z0-9][a-z0-9-]{0,63}$') NOT VALID;
    ALTER TABLE public.analytics_events VALIDATE CONSTRAINT analytics_events_app_check;
  END IF;
  IF to_regclass('public.audit_log') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.audit_log'::regclass
       AND conname = 'audit_log_app_check'
  ) THEN
    ALTER TABLE public.audit_log
      ADD CONSTRAINT audit_log_app_check
      CHECK (app IS NULL OR app ~ '^[a-z0-9][a-z0-9-]{0,63}$') NOT VALID;
    ALTER TABLE public.audit_log VALIDATE CONSTRAINT audit_log_app_check;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_analytics_events_user_app
  ON public.analytics_events (user_id, app);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_app
  ON public.audit_log (user_id, app);

-- A stable client-generated event UUID makes retries safe without changing the
-- semantics of sibling/legacy analytics rows (their discriminator stays NULL).
ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS pragas_event_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_events_pragas_event_id
  ON public.analytics_events (user_id, pragas_event_id)
  WHERE app = 'rumo-pragas' AND pragas_event_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.record_pragas_analytics_events(
  p_user_id uuid,
  p_events jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item jsonb;
  v_event_id uuid;
  v_event_name text;
  v_platform text;
  v_properties jsonb;
  v_timestamp timestamptz;
  v_inserted integer := 0;
  v_row_count integer;
  v_total integer;
BEGIN
  IF p_user_id IS NULL OR jsonb_typeof(p_events) <> 'array' THEN
    RAISE EXCEPTION 'invalid_analytics_batch';
  END IF;
  v_total := jsonb_array_length(p_events);
  IF v_total < 1 OR v_total > 100 THEN
    RAISE EXCEPTION 'invalid_analytics_batch_size';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.pragas_app_links AS link
     WHERE link.user_id = p_user_id
       AND link.active
  ) OR NOT EXISTS (
    SELECT 1 FROM public.pragas_profiles AS profile
     WHERE profile.user_id = p_user_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.subscriptions AS subscription
     WHERE subscription.user_id = p_user_id
       AND subscription.app = 'rumo-pragas'
       AND subscription.status = 'active'
  ) OR EXISTS (
    SELECT 1 FROM public.pragas_deletion_jobs AS deletion
     WHERE deletion.user_id = p_user_id
       AND deletion.status <> 'reactivated'
  ) THEN
    RAISE EXCEPTION 'pragas_app_link_inactive';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_events)
  LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'invalid_analytics_event';
    END IF;
    BEGIN
      v_event_id := (v_item ->> 'event_id')::uuid;
      v_timestamp := (v_item ->> 'timestamp')::timestamptz;
    EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
      RAISE EXCEPTION 'invalid_analytics_event';
    END;
    v_event_name := v_item ->> 'event';
    v_platform := v_item ->> 'platform';
    v_properties := coalesce(v_item -> 'properties', '{}'::jsonb);

    IF v_event_id IS NULL
       OR v_event_name IS NULL
       OR v_event_name !~ '^[A-Za-z0-9_.:-]{1,120}$'
       OR v_platform IS NULL
       OR v_platform !~ '^[A-Za-z0-9_.-]{1,32}$'
       OR jsonb_typeof(v_properties) <> 'object'
       OR octet_length(v_properties::text) > 10000
       OR v_timestamp < clock_timestamp() - interval '30 days'
       OR v_timestamp > clock_timestamp() + interval '5 minutes'
    THEN
      RAISE EXCEPTION 'invalid_analytics_event';
    END IF;

    INSERT INTO public.analytics_events (
      user_id, app, pragas_event_id, event, properties, platform, timestamp
    ) VALUES (
      p_user_id, 'rumo-pragas', v_event_id, v_event_name,
      v_properties, v_platform, v_timestamp
    )
    ON CONFLICT (user_id, pragas_event_id)
      WHERE app = 'rumo-pragas' AND pragas_event_id IS NOT NULL
      DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_inserted := v_inserted + v_row_count;
  END LOOP;

  RETURN jsonb_build_object(
    'accepted', v_total,
    'inserted', v_inserted,
    'duplicates', v_total - v_inserted
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_pragas_analytics_events(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_pragas_analytics_events(uuid, jsonb)
  TO service_role;

-- Push delivery has an external side effect. A durable request hash and lease
-- separate safe pre-provider recovery from terminal unknown outcomes so a
-- crashed worker never resends a notification that Expo may have accepted.
DO $$
BEGIN
  IF to_regclass('public.pragas_push_notifications') IS NULL THEN
    RAISE EXCEPTION 'pragas_schema_preflight_missing_pragas_push_notifications';
  END IF;
END
$$;

ALTER TABLE public.pragas_push_notifications
  ADD COLUMN IF NOT EXISTS request_hash text,
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS unknown_outcome_at timestamptz;

UPDATE public.pragas_push_notifications AS notification
   SET request_hash = coalesce(
         notification.request_hash,
         encode(digest(notification.notification_id || ':legacy', 'sha256'), 'hex')
       )
 WHERE notification.request_hash IS NULL;

-- A legacy pending row has no trustworthy provider boundary. Preserve it as a
-- terminal audit record rather than risk a duplicate external delivery.
UPDATE public.pragas_push_notifications AS notification
   SET status = 'unknown_outcome',
       provider_started_at = coalesce(notification.provider_started_at, notification.updated_at),
       unknown_outcome_at = coalesce(notification.unknown_outcome_at, clock_timestamp()),
       lease_token = NULL,
       lease_expires_at = NULL,
       updated_at = clock_timestamp()
 WHERE notification.status = 'pending';

ALTER TABLE public.pragas_push_notifications
  ALTER COLUMN request_hash SET NOT NULL;

DO $$
DECLARE
  v_constraint record;
BEGIN
  FOR v_constraint IN
    SELECT constraint_row.conname
      FROM pg_constraint AS constraint_row
     WHERE constraint_row.conrelid = 'public.pragas_push_notifications'::regclass
       AND constraint_row.contype = 'c'
       AND pg_get_constraintdef(constraint_row.oid) ILIKE '%status%pending%sent%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.pragas_push_notifications DROP CONSTRAINT %I',
      v_constraint.conname
    );
  END LOOP;
END
$$;

ALTER TABLE public.pragas_push_notifications
  DROP CONSTRAINT IF EXISTS pragas_push_notifications_request_hash_check,
  DROP CONSTRAINT IF EXISTS pragas_push_notifications_status_check,
  DROP CONSTRAINT IF EXISTS pragas_push_notifications_lease_state_check;
ALTER TABLE public.pragas_push_notifications
  ADD CONSTRAINT pragas_push_notifications_request_hash_check
    CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT pragas_push_notifications_status_check
    CHECK (status IN ('pending', 'sent', 'partial', 'failed', 'unknown_outcome')),
  ADD CONSTRAINT pragas_push_notifications_lease_state_check CHECK (
    (status = 'pending' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL
      AND unknown_outcome_at IS NULL)
    OR
    (status IN ('sent', 'partial', 'failed') AND lease_token IS NULL
      AND lease_expires_at IS NULL AND unknown_outcome_at IS NULL)
    OR
    (status = 'unknown_outcome' AND provider_started_at IS NOT NULL
      AND unknown_outcome_at IS NOT NULL AND lease_token IS NULL
      AND lease_expires_at IS NULL)
  );

CREATE OR REPLACE FUNCTION public.claim_pragas_push_notification(
  p_notification_id uuid,
  p_request_hash text,
  p_category text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_record public.pragas_push_notifications%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_lease_token uuid;
BEGIN
  IF p_notification_id IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$'
     OR p_category NOT IN ('transactional', 'climate_risk_educational')
  THEN
    RAISE EXCEPTION 'invalid_pragas_push_claim';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('pragas-push:' || p_notification_id::text, 0)
  );
  SELECT notification.* INTO v_record
    FROM public.pragas_push_notifications AS notification
   WHERE notification.notification_id = p_notification_id::text
   FOR UPDATE;
  IF FOUND THEN
    IF v_record.request_hash <> p_request_hash THEN
      RETURN jsonb_build_object('state', 'conflict');
    END IF;
    IF v_record.status = 'unknown_outcome' THEN
      RETURN jsonb_build_object('state', 'unknown_outcome');
    END IF;
    IF v_record.status <> 'pending' THEN
      RETURN jsonb_build_object(
        'state', 'completed',
        'notification_id', v_record.notification_id,
        'status', v_record.status,
        'recipient_count', v_record.recipient_count,
        'accepted_count', v_record.accepted_count,
        'error_count', v_record.error_count
      );
    END IF;
    IF v_record.lease_expires_at > v_now THEN
      RETURN jsonb_build_object(
        'state', 'in_progress',
        'retry_after_seconds', greatest(
          1,
          ceil(extract(epoch FROM (v_record.lease_expires_at - v_now)))::integer
        )
      );
    END IF;
    IF v_record.provider_started_at IS NOT NULL THEN
      UPDATE public.pragas_push_notifications AS notification
         SET status = 'unknown_outcome',
             unknown_outcome_at = v_now,
             lease_token = NULL,
             lease_expires_at = NULL,
             updated_at = v_now
       WHERE notification.notification_id = p_notification_id::text;
      RETURN jsonb_build_object('state', 'unknown_outcome');
    END IF;
    v_lease_token := gen_random_uuid();
    UPDATE public.pragas_push_notifications AS notification
       SET lease_token = v_lease_token,
           lease_expires_at = v_now + interval '5 minutes',
           updated_at = v_now
     WHERE notification.notification_id = p_notification_id::text;
    RETURN jsonb_build_object(
      'state', 'reserved', 'lease_token', v_lease_token, 'reclaimed', true
    );
  END IF;

  v_lease_token := gen_random_uuid();
  INSERT INTO public.pragas_push_notifications (
    notification_id, sender, category, payload, status, request_hash,
    lease_token, lease_expires_at
  ) VALUES (
    p_notification_id::text, 'system', p_category, '{"schema_version":1}'::jsonb,
    'pending', p_request_hash, v_lease_token, v_now + interval '5 minutes'
  );
  RETURN jsonb_build_object('state', 'reserved', 'lease_token', v_lease_token);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_pragas_push_provider_started(
  p_notification_id uuid,
  p_request_hash text,
  p_lease_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_updated integer;
BEGIN
  UPDATE public.pragas_push_notifications AS notification
     SET provider_started_at = coalesce(notification.provider_started_at, clock_timestamp()),
         updated_at = clock_timestamp()
   WHERE notification.notification_id = p_notification_id::text
     AND notification.request_hash = p_request_hash
     AND notification.status = 'pending'
     AND notification.lease_token = p_lease_token
     AND notification.lease_expires_at > clock_timestamp();
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_pragas_push_notification(
  p_notification_id uuid,
  p_request_hash text,
  p_lease_token uuid,
  p_status text,
  p_recipient_count integer,
  p_accepted_count integer,
  p_error_count integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_updated integer;
BEGIN
  IF p_status NOT IN ('sent', 'partial', 'failed')
     OR p_recipient_count < 0 OR p_accepted_count < 0 OR p_error_count < 0
     OR p_accepted_count + p_error_count <> p_recipient_count
  THEN
    RAISE EXCEPTION 'invalid_pragas_push_completion';
  END IF;
  UPDATE public.pragas_push_notifications AS notification
     SET status = p_status,
         recipient_count = p_recipient_count,
         accepted_count = p_accepted_count,
         error_count = p_error_count,
         lease_token = NULL,
         lease_expires_at = NULL,
         updated_at = clock_timestamp()
   WHERE notification.notification_id = p_notification_id::text
     AND notification.request_hash = p_request_hash
     AND notification.status = 'pending'
     AND notification.lease_token = p_lease_token;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_pragas_push_unknown_outcome(
  p_notification_id uuid,
  p_request_hash text,
  p_lease_token uuid,
  p_recipient_count integer,
  p_accepted_count integer,
  p_error_count integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_updated integer;
BEGIN
  IF p_recipient_count < 0 OR p_accepted_count < 0 OR p_error_count < 0
     OR p_accepted_count + p_error_count > p_recipient_count
  THEN
    RAISE EXCEPTION 'invalid_pragas_push_unknown_outcome';
  END IF;
  UPDATE public.pragas_push_notifications AS notification
     SET status = 'unknown_outcome',
         recipient_count = p_recipient_count,
         accepted_count = p_accepted_count,
         error_count = p_error_count,
         unknown_outcome_at = clock_timestamp(),
         lease_token = NULL,
         lease_expires_at = NULL,
         updated_at = clock_timestamp()
   WHERE notification.notification_id = p_notification_id::text
     AND notification.request_hash = p_request_hash
     AND notification.status = 'pending'
     AND notification.lease_token = p_lease_token
     AND notification.provider_started_at IS NOT NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_pragas_push_notification(
  p_notification_id uuid,
  p_request_hash text,
  p_lease_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_deleted integer;
BEGIN
  DELETE FROM public.pragas_push_notifications AS notification
   WHERE notification.notification_id = p_notification_id::text
     AND notification.request_hash = p_request_hash
     AND notification.status = 'pending'
     AND notification.lease_token = p_lease_token
     AND notification.provider_started_at IS NULL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted = 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_pragas_push_notification(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_pragas_push_provider_started(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_pragas_push_notification(
  uuid, text, uuid, text, integer, integer, integer
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_pragas_push_unknown_outcome(
  uuid, text, uuid, integer, integer, integer
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_pragas_push_notification(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pragas_push_notification(uuid, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_pragas_push_provider_started(uuid, text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_pragas_push_notification(
  uuid, text, uuid, text, integer, integer, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_pragas_push_unknown_outcome(
  uuid, text, uuid, integer, integer, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_pragas_push_notification(uuid, text, uuid)
  TO service_role;

-- Canonical multi-device push registry. Unknown historical rows remain
-- present but cannot receive pushes until a fresh, explicit device consent is
-- recorded through the authenticated RPC below.
CREATE TABLE IF NOT EXISTS public.pragas_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text,
  expo_token text,
  platform text,
  device_info jsonb,
  notifications_enabled boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT false,
  consented_at timestamptz,
  revoked_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.pragas_push_tokens
  ADD COLUMN IF NOT EXISTS token text,
  ADD COLUMN IF NOT EXISTS expo_token text,
  ADD COLUMN IF NOT EXISTS platform text,
  ADD COLUMN IF NOT EXISTS device_info jsonb,
  ADD COLUMN IF NOT EXISTS notifications_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consented_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT clock_timestamp();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.pragas_push_tokens'::regclass
       AND conname = 'pragas_push_tokens_contract_check'
  ) THEN
    ALTER TABLE public.pragas_push_tokens
      ADD CONSTRAINT pragas_push_tokens_contract_check CHECK (
        (expo_token IS NULL OR (
          char_length(expo_token) BETWEEN 20 AND 512
          AND expo_token ~ '^(ExponentPushToken|ExpoPushToken)[[][A-Za-z0-9_-]+[]]$'
        ))
        AND (platform IS NULL OR platform IN ('ios', 'android'))
        AND (
          NOT (is_active AND notifications_enabled)
          OR (expo_token IS NOT NULL AND platform IS NOT NULL
              AND consented_at IS NOT NULL AND revoked_at IS NULL)
        )
      ) NOT VALID;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pragas_push_tokens_active_token
  ON public.pragas_push_tokens (expo_token)
  WHERE expo_token IS NOT NULL AND is_active AND notifications_enabled;
CREATE INDEX IF NOT EXISTS idx_pragas_push_tokens_delivery
  ON public.pragas_push_tokens (user_id)
  WHERE is_active AND notifications_enabled;

DROP TRIGGER IF EXISTS pragas_push_tokens_touch_updated_at
  ON public.pragas_push_tokens;
CREATE TRIGGER pragas_push_tokens_touch_updated_at
  BEFORE UPDATE ON public.pragas_push_tokens
  FOR EACH ROW EXECUTE FUNCTION public.pragas_touch_updated_at();

ALTER TABLE public.pragas_push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pragas_push_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pragas_push_tokens_select_own ON public.pragas_push_tokens;
CREATE POLICY pragas_push_tokens_select_own
  ON public.pragas_push_tokens FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
REVOKE ALL ON TABLE public.pragas_push_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.pragas_push_tokens TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pragas_push_tokens TO service_role;

-- Fail before installing functions if the shared project drifts away from the
-- explicit, read-only remote preflight used by Pragas. This never guesses a
-- column name and deliberately excludes historical severity/metadata fields
-- that do not exist in jxcn despite older documentation claiming otherwise.
DO $$
DECLARE
  v_required record;
BEGIN
  FOR v_required IN
    SELECT * FROM (VALUES
      ('pragas_profiles', 'id'),
      ('pragas_profiles', 'user_id'),
      ('pragas_profiles', 'full_name'),
      ('pragas_profiles', 'city'),
      ('pragas_profiles', 'state'),
      ('pragas_profiles', 'crops'),
      ('pragas_profiles', 'avatar_path'),
      ('pragas_profiles', 'avatar_url'),
      ('pragas_profiles', 'phone'),
      ('pragas_profiles', 'created_at'),
      ('pragas_profiles', 'updated_at'),
      ('pragas_diagnoses', 'id'),
      ('pragas_diagnoses', 'user_id'),
      ('pragas_diagnoses', 'crop'),
      ('pragas_diagnoses', 'pest_name'),
      ('pragas_diagnoses', 'confidence'),
      ('pragas_diagnoses', 'image_url'),
      ('pragas_diagnoses', 'notes'),
      ('pragas_diagnoses', 'location_lat'),
      ('pragas_diagnoses', 'location_lng'),
      ('pragas_diagnoses', 'location_name'),
      ('pragas_diagnoses', 'created_at'),
      ('subscriptions', 'user_id'),
      ('subscriptions', 'app'),
      ('subscriptions', 'plan'),
      ('subscriptions', 'status'),
      ('subscriptions', 'provider'),
      ('subscriptions', 'updated_at'),
      ('pragas_push_tokens', 'user_id'),
      ('pragas_push_tokens', 'token'),
      ('pragas_push_tokens', 'expo_token'),
      ('pragas_push_tokens', 'platform'),
      ('pragas_push_tokens', 'device_info'),
      ('pragas_push_tokens', 'notifications_enabled'),
      ('pragas_push_tokens', 'is_active'),
      ('pragas_push_tokens', 'consented_at'),
      ('pragas_push_tokens', 'revoked_at'),
      ('pragas_push_tokens', 'last_seen_at'),
      ('pragas_push_tokens', 'created_at'),
      ('pragas_push_tokens', 'updated_at'),
      ('analytics_events', 'user_id'),
      ('analytics_events', 'app'),
      ('analytics_events', 'event'),
      ('analytics_events', 'properties'),
      ('analytics_events', 'platform'),
      ('analytics_events', 'timestamp'),
      ('audit_log', 'user_id'),
      ('audit_log', 'app'),
      ('audit_log', 'action'),
      ('audit_log', 'details'),
      ('audit_log', 'created_at'),
      ('chat_usage', 'user_id'),
      ('chat_usage', 'app'),
      ('chat_usage', 'year_month'),
      ('chat_usage', 'count'),
      ('chat_usage', 'updated_at')
    ) AS required(table_name, column_name)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns AS column_info
       WHERE column_info.table_schema = 'public'
         AND column_info.table_name = v_required.table_name
         AND column_info.column_name = v_required.column_name
    ) THEN
      RAISE EXCEPTION 'pragas_schema_preflight_missing_%.%',
        v_required.table_name, v_required.column_name;
    END IF;
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- User reports of unsafe AI content. Reporters may INSERT their own report but
-- may never SELECT it directly; review is service-role or Pragas-admin only.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pragas_ai_content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  submission_key uuid NOT NULL,
  message_id text NOT NULL CHECK (char_length(message_id) BETWEEN 1 AND 128),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 8000),
  reason public.pragas_ai_report_reason NOT NULL,
  details text CHECK (details IS NULL OR char_length(details) <= 2000),
  status public.pragas_ai_report_status NOT NULL DEFAULT 'received',
  review_note text CHECK (review_note IS NULL OR char_length(review_note) <= 2000),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT pragas_ai_report_review_state CHECK (
    (
      status = 'received' AND reviewed_by IS NULL AND reviewed_at IS NULL AND resolved_at IS NULL
    ) OR (
      status = 'reviewing' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND resolved_at IS NULL
    ) OR (
      status IN ('resolved', 'dismissed') AND reviewed_by IS NOT NULL AND
      reviewed_at IS NOT NULL AND resolved_at IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_pragas_ai_reports_status_created
  ON public.pragas_ai_content_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pragas_ai_reports_user_created
  ON public.pragas_ai_content_reports (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pragas_ai_reports_submission
  ON public.pragas_ai_content_reports (user_id, submission_key);

DROP TRIGGER IF EXISTS pragas_ai_reports_touch_updated_at
  ON public.pragas_ai_content_reports;
CREATE TRIGGER pragas_ai_reports_touch_updated_at
  BEFORE UPDATE ON public.pragas_ai_content_reports
  FOR EACH ROW EXECUTE FUNCTION public.pragas_touch_updated_at();

ALTER TABLE public.pragas_ai_content_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pragas_ai_content_reports FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pragas_ai_reports_insert_own
  ON public.pragas_ai_content_reports;
CREATE POLICY pragas_ai_reports_insert_own
  ON public.pragas_ai_content_reports
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id AND status = 'received');

DROP POLICY IF EXISTS pragas_ai_reports_admin_select
  ON public.pragas_ai_content_reports;
CREATE POLICY pragas_ai_reports_admin_select
  ON public.pragas_ai_content_reports
  FOR SELECT TO authenticated
  USING ((SELECT auth.jwt() -> 'app_metadata' ->> 'pragas_admin') = 'true');

DROP POLICY IF EXISTS pragas_ai_reports_admin_update
  ON public.pragas_ai_content_reports;
CREATE POLICY pragas_ai_reports_admin_update
  ON public.pragas_ai_content_reports
  FOR UPDATE TO authenticated
  USING ((SELECT auth.jwt() -> 'app_metadata' ->> 'pragas_admin') = 'true')
  WITH CHECK ((SELECT auth.jwt() -> 'app_metadata' ->> 'pragas_admin') = 'true');

REVOKE ALL ON TABLE public.pragas_ai_content_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pragas_ai_content_reports TO service_role;

CREATE OR REPLACE FUNCTION public.transition_pragas_ai_content_report(
  p_report_id uuid,
  p_new_status public.pragas_ai_report_status,
  p_actor_id uuid,
  p_review_note text DEFAULT NULL
)
RETURNS SETOF public.pragas_ai_content_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current public.pragas_ai_report_status;
BEGIN
  IF p_new_status NOT IN ('reviewing', 'resolved', 'dismissed') THEN
    RAISE EXCEPTION 'invalid_report_transition';
  END IF;
  IF p_review_note IS NOT NULL AND char_length(p_review_note) > 2000 THEN
    RAISE EXCEPTION 'review_note_too_long';
  END IF;

  SELECT report.status
    INTO v_current
    FROM public.pragas_ai_content_reports AS report
   WHERE report.id = p_report_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'report_not_found';
  END IF;
  IF v_current IN ('resolved', 'dismissed') THEN
    RAISE EXCEPTION 'report_already_terminal';
  END IF;

  RETURN QUERY
  UPDATE public.pragas_ai_content_reports AS report
     SET status = p_new_status,
         review_note = NULLIF(btrim(p_review_note), ''),
         reviewed_by = p_actor_id,
         reviewed_at = clock_timestamp(),
         resolved_at = CASE
           WHEN p_new_status IN ('resolved', 'dismissed') THEN clock_timestamp()
           ELSE NULL
         END
   WHERE report.id = p_report_id
  RETURNING report.*;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.transition_pragas_ai_content_report(
  uuid, public.pragas_ai_report_status, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_pragas_ai_content_report(
  uuid, public.pragas_ai_report_status, uuid, text
) TO service_role;

-- ---------------------------------------------------------------------------
-- Diagnosis feedback. It records the user's assessment, never ground truth.
-- The ownership trigger prevents cross-user diagnosis references even if a
-- caller bypasses the Edge Function and writes through PostgREST.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pragas_diagnosis_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  diagnosis_id uuid NOT NULL REFERENCES public.pragas_diagnoses(id) ON DELETE CASCADE,
  verdict public.pragas_diagnosis_feedback_verdict NOT NULL,
  selected_alternative text CHECK (
    selected_alternative IS NULL OR
    (verdict = 'incorrect' AND char_length(selected_alternative) <= 200)
  ),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 1000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (user_id, diagnosis_id)
);

-- Production predates the contract above and may still have the legacy
-- `feedback/comment/pest_id` shape. Preserve those columns and rows while
-- adding the strict launch contract in place.
ALTER TABLE public.pragas_diagnosis_feedback
  ADD COLUMN IF NOT EXISTS verdict public.pragas_diagnosis_feedback_verdict,
  ADD COLUMN IF NOT EXISTS selected_alternative text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'pragas_diagnosis_feedback'
       AND column_name = 'feedback'
  ) THEN
    EXECUTE $backfill$
      UPDATE public.pragas_diagnosis_feedback
         SET verdict = CASE
           WHEN trim(both '"' FROM lower(btrim(feedback::text))) IN (
             'correct', 'correto', 'correta', 'true', 'sim', 'yes',
             'positive', 'accurate', 'like', 'helpful'
           ) THEN 'correct'::public.pragas_diagnosis_feedback_verdict
           WHEN trim(both '"' FROM lower(btrim(feedback::text))) IN (
             'incorrect', 'incorreto', 'incorreta', 'false', 'nao', 'não',
             'no', 'negative', 'inaccurate', 'dislike', 'not_helpful'
           ) THEN 'incorrect'::public.pragas_diagnosis_feedback_verdict
           ELSE 'unsure'::public.pragas_diagnosis_feedback_verdict
         END
       WHERE verdict IS NULL
    $backfill$;
  END IF;

  UPDATE public.pragas_diagnosis_feedback
     SET verdict = 'unsure'
   WHERE verdict IS NULL;

  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'pragas_diagnosis_feedback'
       AND column_name = 'comment'
  ) THEN
    EXECUTE $backfill$
      UPDATE public.pragas_diagnosis_feedback
         SET notes = left(NULLIF(btrim(comment::text), ''), 1000)
       WHERE notes IS NULL
    $backfill$;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'pragas_diagnosis_feedback'
       AND column_name = 'pest_id'
  ) THEN
    EXECUTE $backfill$
      UPDATE public.pragas_diagnosis_feedback
         SET selected_alternative = left(NULLIF(btrim(pest_id::text), ''), 200)
       WHERE selected_alternative IS NULL
         AND verdict = 'incorrect'
    $backfill$;
  END IF;
END
$$;

UPDATE public.pragas_diagnosis_feedback
   SET updated_at = coalesce(created_at, clock_timestamp())
 WHERE updated_at IS NULL;

ALTER TABLE public.pragas_diagnosis_feedback
  ALTER COLUMN verdict SET DEFAULT 'unsure',
  ALTER COLUMN verdict SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT clock_timestamp(),
  ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.pragas_diagnosis_feedback'::regclass
       AND conname = 'pragas_diagnosis_feedback_selected_alternative_check'
  ) THEN
    ALTER TABLE public.pragas_diagnosis_feedback
      ADD CONSTRAINT pragas_diagnosis_feedback_selected_alternative_check
      CHECK (
        selected_alternative IS NULL OR
        (verdict = 'incorrect' AND char_length(selected_alternative) <= 200)
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.pragas_diagnosis_feedback'::regclass
       AND conname = 'pragas_diagnosis_feedback_notes_check'
  ) THEN
    ALTER TABLE public.pragas_diagnosis_feedback
      ADD CONSTRAINT pragas_diagnosis_feedback_notes_check
      CHECK (notes IS NULL OR char_length(notes) <= 1000) NOT VALID;
  END IF;
END
$$;

ALTER TABLE public.pragas_diagnosis_feedback
  VALIDATE CONSTRAINT pragas_diagnosis_feedback_selected_alternative_check;
ALTER TABLE public.pragas_diagnosis_feedback
  VALIDATE CONSTRAINT pragas_diagnosis_feedback_notes_check;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pragas_diagnosis_feedback_user_diagnosis_unique
  ON public.pragas_diagnosis_feedback (user_id, diagnosis_id);

CREATE INDEX IF NOT EXISTS idx_pragas_diagnosis_feedback_created
  ON public.pragas_diagnosis_feedback (created_at DESC);

CREATE OR REPLACE FUNCTION public.pragas_validate_diagnosis_feedback_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.pragas_diagnoses AS diagnosis
     WHERE diagnosis.id = NEW.diagnosis_id
       AND diagnosis.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'diagnosis_not_owned';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pragas_validate_diagnosis_feedback_owner()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS pragas_diagnosis_feedback_validate_owner
  ON public.pragas_diagnosis_feedback;
CREATE TRIGGER pragas_diagnosis_feedback_validate_owner
  BEFORE INSERT OR UPDATE OF user_id, diagnosis_id
  ON public.pragas_diagnosis_feedback
  FOR EACH ROW EXECUTE FUNCTION public.pragas_validate_diagnosis_feedback_owner();

DROP TRIGGER IF EXISTS pragas_diagnosis_feedback_touch_updated_at
  ON public.pragas_diagnosis_feedback;
CREATE TRIGGER pragas_diagnosis_feedback_touch_updated_at
  BEFORE UPDATE ON public.pragas_diagnosis_feedback
  FOR EACH ROW EXECUTE FUNCTION public.pragas_touch_updated_at();

ALTER TABLE public.pragas_diagnosis_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pragas_diagnosis_feedback FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_policy record;
BEGIN
  FOR v_policy IN
    SELECT policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'pragas_diagnosis_feedback'
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON public.pragas_diagnosis_feedback',
      v_policy.policyname
    );
  END LOOP;
END
$$;

CREATE POLICY pragas_diagnosis_feedback_own
  ON public.pragas_diagnosis_feedback
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.pragas_diagnosis_feedback FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pragas_diagnosis_feedback TO service_role;

-- ---------------------------------------------------------------------------
-- Atomic fixed-window rate limiting with a 24-hour idempotency ledger.
-- All mutation is service-role-only after server-side JWT validation.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pragas_api_rate_limit_counters (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN (
    'diagnose',
    'ai_chat',
    'report_ai_content',
    'diagnosis_feedback',
    'admin_ai_reports',
    'export_user_data',
    'delete_user_account',
    'reactivate_user_account',
    'mcp'
  )),
  window_started_at timestamptz NOT NULL,
  window_seconds integer NOT NULL CHECK (window_seconds BETWEEN 1 AND 86400),
  request_count integer NOT NULL CHECK (request_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, scope)
);

CREATE TABLE IF NOT EXISTS public.pragas_api_rate_limit_events (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope text NOT NULL,
  idempotency_key uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, scope, idempotency_key),
  FOREIGN KEY (user_id, scope)
    REFERENCES public.pragas_api_rate_limit_counters(user_id, scope)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pragas_rate_limit_events_expiry
  ON public.pragas_api_rate_limit_events (expires_at);

ALTER TABLE public.pragas_api_rate_limit_events
  ADD COLUMN IF NOT EXISTS request_hash text;
UPDATE public.pragas_api_rate_limit_events AS event
   SET request_hash = encode(
     digest(event.user_id::text || ':' || event.scope || ':' || event.idempotency_key::text, 'sha256'),
     'hex'
   )
 WHERE event.request_hash IS NULL;
ALTER TABLE public.pragas_api_rate_limit_events
  ALTER COLUMN request_hash SET NOT NULL;
ALTER TABLE public.pragas_api_rate_limit_events
  DROP CONSTRAINT IF EXISTS pragas_api_rate_limit_events_request_hash_check;
ALTER TABLE public.pragas_api_rate_limit_events
  ADD CONSTRAINT pragas_api_rate_limit_events_request_hash_check
  CHECK (request_hash ~ '^[0-9a-f]{64}$');

-- Recreate the scope check by name so an idempotent replay also upgrades a
-- partially applied earlier draft of this migration.
ALTER TABLE public.pragas_api_rate_limit_counters
  DROP CONSTRAINT IF EXISTS pragas_api_rate_limit_counters_scope_check;
ALTER TABLE public.pragas_api_rate_limit_counters
  ADD CONSTRAINT pragas_api_rate_limit_counters_scope_check CHECK (scope IN (
    'diagnose', 'ai_chat', 'report_ai_content', 'diagnosis_feedback',
    'admin_ai_reports', 'export_user_data', 'delete_user_account',
    'reactivate_user_account', 'analytics', 'mcp'
  )) NOT VALID;
ALTER TABLE public.pragas_api_rate_limit_counters
  VALIDATE CONSTRAINT pragas_api_rate_limit_counters_scope_check;

ALTER TABLE public.pragas_api_rate_limit_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pragas_api_rate_limit_counters FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pragas_api_rate_limit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pragas_api_rate_limit_events FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.pragas_api_rate_limit_counters FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pragas_api_rate_limit_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pragas_api_rate_limit_counters TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pragas_api_rate_limit_events TO service_role;

CREATE OR REPLACE FUNCTION public.consume_pragas_api_rate_limit(
  p_user_id uuid,
  p_scope text,
  p_limit integer,
  p_window_seconds integer,
  p_idempotency_key uuid,
  p_request_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_window_started_at timestamptz;
  v_stored_window_seconds integer;
  v_count integer;
  v_reset_at timestamptz;
  v_result jsonb;
  v_existing_hash text;
  v_was_replay boolean := false;
BEGIN
  IF p_user_id IS NULL OR p_idempotency_key IS NULL
     OR p_request_hash !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'invalid_rate_limit_identity';
  END IF;
  IF p_scope NOT IN (
    'diagnose', 'ai_chat', 'report_ai_content', 'diagnosis_feedback',
    'admin_ai_reports', 'export_user_data', 'delete_user_account',
    'reactivate_user_account', 'analytics', 'mcp'
  ) THEN
    RAISE EXCEPTION 'invalid_rate_limit_scope';
  END IF;
  IF p_limit < 1 OR p_limit > 10000 OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'invalid_rate_limit_configuration';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('pragas-rate:' || p_user_id::text || ':' || p_scope, 0)
  );

  SELECT event.result, event.request_hash
    INTO v_result, v_existing_hash
    FROM public.pragas_api_rate_limit_events AS event
   WHERE event.user_id = p_user_id
     AND event.scope = p_scope
     AND event.idempotency_key = p_idempotency_key
     AND event.expires_at > v_now;
  IF FOUND THEN
    IF v_existing_hash <> p_request_hash THEN
      RETURN v_result || jsonb_build_object(
        'allowed', false,
        'replayed', false,
        'conflict', true
      );
    END IF;
    -- A matching key proves request identity but does not make another
    -- execution free. Continue through the counter so identical retries cannot
    -- bypass limits on export, MCP, analytics or provider endpoints.
    v_was_replay := true;
  END IF;

  DELETE FROM public.pragas_api_rate_limit_events AS event
   WHERE event.user_id = p_user_id
     AND event.scope = p_scope
     AND event.expires_at <= v_now;

  SELECT counter.window_started_at, counter.window_seconds, counter.request_count
    INTO v_window_started_at, v_stored_window_seconds, v_count
    FROM public.pragas_api_rate_limit_counters AS counter
   WHERE counter.user_id = p_user_id
     AND counter.scope = p_scope
   FOR UPDATE;

  IF NOT FOUND THEN
    v_window_started_at := v_now;
    v_stored_window_seconds := p_window_seconds;
    v_count := 1;
    INSERT INTO public.pragas_api_rate_limit_counters (
      user_id, scope, window_started_at, window_seconds, request_count, updated_at
    ) VALUES (
      p_user_id, p_scope, v_window_started_at, p_window_seconds, v_count, v_now
    );
  ELSIF
    v_stored_window_seconds <> p_window_seconds OR
    v_window_started_at + make_interval(secs => v_stored_window_seconds) <= v_now
  THEN
    v_window_started_at := v_now;
    v_stored_window_seconds := p_window_seconds;
    v_count := 1;
    UPDATE public.pragas_api_rate_limit_counters AS counter
       SET window_started_at = v_window_started_at,
           window_seconds = p_window_seconds,
           request_count = v_count,
           updated_at = v_now
     WHERE counter.user_id = p_user_id
       AND counter.scope = p_scope;
  ELSE
    UPDATE public.pragas_api_rate_limit_counters AS counter
       SET request_count = counter.request_count + 1,
           updated_at = v_now
     WHERE counter.user_id = p_user_id
       AND counter.scope = p_scope
    RETURNING counter.request_count INTO v_count;
  END IF;

  v_reset_at := v_window_started_at + make_interval(secs => v_stored_window_seconds);
  v_result := jsonb_build_object(
    'allowed', v_count <= p_limit,
    'replayed', v_was_replay,
    'conflict', false,
    'remaining', greatest(p_limit - v_count, 0),
    'reset_at', v_reset_at,
    'retry_after_seconds', greatest(
      0,
      ceil(extract(epoch FROM (v_reset_at - v_now)))::integer
    )
  );

  INSERT INTO public.pragas_api_rate_limit_events (
    user_id, scope, idempotency_key, request_hash, result, created_at, expires_at
  ) VALUES (
    p_user_id,
    p_scope,
    p_idempotency_key,
    p_request_hash,
    v_result,
    v_now,
    CASE WHEN v_count <= p_limit THEN v_now + interval '24 hours' ELSE v_reset_at END
  )
  ON CONFLICT (user_id, scope, idempotency_key) DO UPDATE
    SET request_hash = EXCLUDED.request_hash,
        result = EXCLUDED.result,
        created_at = EXCLUDED.created_at,
        expires_at = EXCLUDED.expires_at;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_pragas_api_rate_limit(
  uuid, text, integer, integer, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_pragas_api_rate_limit(
  uuid, text, integer, integer, uuid, text
) TO service_role;

-- A partially applied draft may leave the five-argument overload behind. It
-- cannot bind a key to a request body, so retain it only for dependency-safe
-- replay and remove every executable grant.
DO $$
BEGIN
  IF to_regprocedure(
    'public.consume_pragas_api_rate_limit(uuid,text,integer,integer,uuid)'
  ) IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION '
      || 'public.consume_pragas_api_rate_limit(uuid,text,integer,integer,uuid) '
      || 'FROM PUBLIC, anon, authenticated, service_role';
  END IF;
END
$$;

-- Provider-call idempotency is separate from rate-limit idempotency. The
-- durable tombstone is retained until app-data deletion so the same key can
-- never call an AI provider twice. Response payloads are cached for a bounded
-- period (diagnosis/chat callers currently use 24 hours); after expiry, replay
-- is rejected without invoking the provider again.
CREATE TABLE IF NOT EXISTS public.pragas_ai_idempotency_records (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('diagnosis', 'chat')),
  idempotency_key uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  state text NOT NULL DEFAULT 'processing' CHECK (
    state IN ('processing', 'completed', 'expired', 'unknown_outcome')
  ),
  lease_token uuid,
  lease_expires_at timestamptz,
  provider_started_at timestamptz,
  unknown_outcome_at timestamptz,
  response_status integer CHECK (response_status IS NULL OR response_status BETWEEN 200 AND 599),
  response_body jsonb,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  response_expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, scope, idempotency_key),
  CHECK (
    (state = 'processing' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL
      AND completed_at IS NULL AND unknown_outcome_at IS NULL
      AND response_status IS NULL AND response_body IS NULL AND response_expires_at IS NULL)
    OR
    (state = 'completed' AND completed_at IS NOT NULL AND response_status IS NOT NULL
      AND response_body IS NOT NULL AND response_expires_at IS NOT NULL
      AND lease_token IS NULL AND lease_expires_at IS NULL AND unknown_outcome_at IS NULL)
    OR
    (state = 'expired' AND completed_at IS NOT NULL AND response_status IS NULL
      AND response_body IS NULL AND response_expires_at IS NOT NULL
      AND lease_token IS NULL AND lease_expires_at IS NULL AND unknown_outcome_at IS NULL)
    OR
    (state = 'unknown_outcome' AND provider_started_at IS NOT NULL
      AND unknown_outcome_at IS NOT NULL AND completed_at IS NULL
      AND response_status IS NULL AND response_body IS NULL AND response_expires_at IS NULL
      AND lease_token IS NULL AND lease_expires_at IS NULL)
  )
);

ALTER TABLE public.pragas_ai_idempotency_records
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS unknown_outcome_at timestamptz;

-- A draft processing row can be reclaimed only before a provider starts. Give
-- every such row a bounded lease so a crash never leaves an eternal lock.
UPDATE public.pragas_ai_idempotency_records AS record
   SET lease_token = coalesce(record.lease_token, gen_random_uuid()),
       lease_expires_at = coalesce(
         record.lease_expires_at,
         record.updated_at + interval '5 minutes'
       )
 WHERE record.state = 'processing';

-- Upgrade an earlier partial replay of this migration to the privacy-preserving
-- expired tombstone state without relying on auto-generated constraint names.
ALTER TABLE public.pragas_ai_idempotency_records
  DROP CONSTRAINT IF EXISTS pragas_ai_idempotency_state_check;
ALTER TABLE public.pragas_ai_idempotency_records
  DROP CONSTRAINT IF EXISTS pragas_ai_idempotency_response_state_check;
DO $$
DECLARE
  v_constraint record;
BEGIN
  FOR v_constraint IN
    SELECT constraint_row.conname
      FROM pg_constraint AS constraint_row
     WHERE constraint_row.conrelid = 'public.pragas_ai_idempotency_records'::regclass
       AND constraint_row.contype = 'c'
       AND (
         pg_get_constraintdef(constraint_row.oid) ILIKE '%state%processing%completed%'
         OR pg_get_constraintdef(constraint_row.oid) ILIKE '%response_body%response_expires_at%'
       )
  LOOP
    EXECUTE format(
      'ALTER TABLE public.pragas_ai_idempotency_records DROP CONSTRAINT %I',
      v_constraint.conname
    );
  END LOOP;
END
$$;

ALTER TABLE public.pragas_ai_idempotency_records
  ADD CONSTRAINT pragas_ai_idempotency_state_check CHECK (
    state IN ('processing', 'completed', 'expired', 'unknown_outcome')
  ) NOT VALID;
ALTER TABLE public.pragas_ai_idempotency_records
  ADD CONSTRAINT pragas_ai_idempotency_response_state_check CHECK (
    (state = 'processing' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL
      AND completed_at IS NULL AND unknown_outcome_at IS NULL
      AND response_status IS NULL AND response_body IS NULL AND response_expires_at IS NULL)
    OR
    (state = 'completed' AND completed_at IS NOT NULL AND response_status IS NOT NULL
      AND response_body IS NOT NULL AND response_expires_at IS NOT NULL
      AND lease_token IS NULL AND lease_expires_at IS NULL AND unknown_outcome_at IS NULL)
    OR
    (state = 'expired' AND completed_at IS NOT NULL AND response_status IS NULL
      AND response_body IS NULL AND response_expires_at IS NOT NULL
      AND lease_token IS NULL AND lease_expires_at IS NULL AND unknown_outcome_at IS NULL)
    OR
    (state = 'unknown_outcome' AND provider_started_at IS NOT NULL
      AND unknown_outcome_at IS NOT NULL AND completed_at IS NULL
      AND response_status IS NULL AND response_body IS NULL AND response_expires_at IS NULL
      AND lease_token IS NULL AND lease_expires_at IS NULL)
  ) NOT VALID;
ALTER TABLE public.pragas_ai_idempotency_records
  VALIDATE CONSTRAINT pragas_ai_idempotency_state_check;
ALTER TABLE public.pragas_ai_idempotency_records
  VALIDATE CONSTRAINT pragas_ai_idempotency_response_state_check;

CREATE INDEX IF NOT EXISTS idx_pragas_ai_idempotency_response_expiry
  ON public.pragas_ai_idempotency_records (response_expires_at)
  WHERE state = 'completed';

ALTER TABLE public.pragas_ai_idempotency_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pragas_ai_idempotency_records FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pragas_ai_idempotency_records FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pragas_ai_idempotency_records
  TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_pragas_ai_idempotency(
  p_user_id uuid,
  p_scope text,
  p_idempotency_key uuid,
  p_request_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_record public.pragas_ai_idempotency_records%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_lease_token uuid;
BEGIN
  IF p_user_id IS NULL OR p_scope NOT IN ('diagnosis', 'chat')
     OR p_idempotency_key IS NULL
     OR p_request_hash !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'invalid_pragas_ai_idempotency_reservation';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'pragas-ai-idempotency:' || p_user_id::text || ':' || p_scope || ':' ||
      p_idempotency_key::text,
      0
    )
  );

  SELECT record.*
    INTO v_record
    FROM public.pragas_ai_idempotency_records AS record
   WHERE record.user_id = p_user_id
     AND record.scope = p_scope
     AND record.idempotency_key = p_idempotency_key
   FOR UPDATE;

  IF FOUND THEN
    IF v_record.request_hash <> p_request_hash THEN
      RETURN jsonb_build_object('state', 'conflict');
    END IF;
    IF v_record.state = 'processing' THEN
      IF v_record.lease_expires_at > v_now THEN
        RETURN jsonb_build_object(
          'state', 'in_progress',
          'retry_after_seconds', greatest(
            1,
            ceil(extract(epoch FROM (v_record.lease_expires_at - v_now)))::integer
          )
        );
      END IF;
      IF v_record.provider_started_at IS NOT NULL THEN
        UPDATE public.pragas_ai_idempotency_records AS record
           SET state = 'unknown_outcome',
               lease_token = NULL,
               lease_expires_at = NULL,
               unknown_outcome_at = v_now,
               updated_at = v_now
         WHERE record.user_id = p_user_id
           AND record.scope = p_scope
           AND record.idempotency_key = p_idempotency_key;
        RETURN jsonb_build_object('state', 'unknown_outcome');
      END IF;

      -- The previous worker crashed before starting a provider call. Rotating
      -- the lease token makes that stale worker unable to complete or release.
      v_lease_token := gen_random_uuid();
      UPDATE public.pragas_ai_idempotency_records AS record
         SET lease_token = v_lease_token,
             lease_expires_at = v_now + interval '5 minutes',
             updated_at = v_now
       WHERE record.user_id = p_user_id
         AND record.scope = p_scope
         AND record.idempotency_key = p_idempotency_key;
      RETURN jsonb_build_object(
        'state', 'reserved',
        'lease_token', v_lease_token,
        'reclaimed', true
      );
    END IF;
    IF v_record.state = 'completed' AND v_record.response_expires_at > v_now THEN
      RETURN jsonb_build_object(
        'state', 'completed',
        'response_status', v_record.response_status,
        'response_body', v_record.response_body
      );
    END IF;
    IF v_record.state = 'completed' THEN
      UPDATE public.pragas_ai_idempotency_records AS record
         SET state = 'expired',
             response_status = NULL,
             response_body = NULL,
             updated_at = clock_timestamp()
       WHERE record.user_id = p_user_id
         AND record.scope = p_scope
         AND record.idempotency_key = p_idempotency_key;
    END IF;
    IF v_record.state = 'unknown_outcome' THEN
      RETURN jsonb_build_object('state', 'unknown_outcome');
    END IF;
    RETURN jsonb_build_object('state', 'expired');
  END IF;

  v_lease_token := gen_random_uuid();
  INSERT INTO public.pragas_ai_idempotency_records (
    user_id, scope, idempotency_key, request_hash, lease_token, lease_expires_at
  ) VALUES (
    p_user_id, p_scope, p_idempotency_key, p_request_hash,
    v_lease_token, v_now + interval '5 minutes'
  );
  RETURN jsonb_build_object('state', 'reserved', 'lease_token', v_lease_token);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reserve_pragas_ai_idempotency(uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_pragas_ai_idempotency(uuid, text, uuid, text)
  TO service_role;

-- This is the irreversible boundary for retry safety. A provider call may
-- begin only while the caller still owns an unexpired lease. After this mark,
-- an abandoned request becomes terminal unknown_outcome rather than being
-- replayed and potentially charging or acting twice.
CREATE OR REPLACE FUNCTION public.mark_pragas_ai_provider_started(
  p_user_id uuid,
  p_scope text,
  p_idempotency_key uuid,
  p_request_hash text,
  p_lease_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF p_user_id IS NULL OR p_scope NOT IN ('diagnosis', 'chat')
     OR p_idempotency_key IS NULL OR p_lease_token IS NULL
     OR p_request_hash !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'invalid_pragas_ai_provider_start';
  END IF;

  UPDATE public.pragas_ai_idempotency_records AS record
     SET provider_started_at = coalesce(record.provider_started_at, clock_timestamp()),
         updated_at = clock_timestamp()
   WHERE record.user_id = p_user_id
     AND record.scope = p_scope
     AND record.idempotency_key = p_idempotency_key
     AND record.request_hash = p_request_hash
     AND record.state = 'processing'
     AND record.lease_token = p_lease_token
     AND record.lease_expires_at > clock_timestamp();
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_pragas_ai_provider_started(
  uuid, text, uuid, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_pragas_ai_provider_started(
  uuid, text, uuid, text, uuid
) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_pragas_ai_idempotency(
  p_user_id uuid,
  p_scope text,
  p_idempotency_key uuid,
  p_request_hash text,
  p_lease_token uuid,
  p_response_status integer,
  p_response_body jsonb,
  p_response_ttl_seconds integer DEFAULT 86400
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_record public.pragas_ai_idempotency_records%ROWTYPE;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_user_id IS NULL OR p_scope NOT IN ('diagnosis', 'chat')
     OR p_idempotency_key IS NULL
     OR p_lease_token IS NULL
     OR p_request_hash !~ '^[0-9a-f]{64}$'
     OR p_response_status NOT BETWEEN 200 AND 599
     OR p_response_body IS NULL
     OR p_response_ttl_seconds NOT BETWEEN 60 AND 604800
  THEN
    RAISE EXCEPTION 'invalid_pragas_ai_idempotency_completion';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'pragas-ai-idempotency:' || p_user_id::text || ':' || p_scope || ':' ||
      p_idempotency_key::text,
      0
    )
  );

  SELECT record.*
    INTO v_record
    FROM public.pragas_ai_idempotency_records AS record
   WHERE record.user_id = p_user_id
     AND record.scope = p_scope
     AND record.idempotency_key = p_idempotency_key
   FOR UPDATE;

  IF NOT FOUND OR v_record.request_hash <> p_request_hash THEN
    RAISE EXCEPTION 'pragas_ai_idempotency_reservation_missing';
  END IF;

  IF v_record.state = 'completed' THEN
    RETURN jsonb_build_object(
      'completed', true,
      'already_completed', true,
      'response_status', v_record.response_status,
      'response_body', v_record.response_body
    );
  END IF;
  IF v_record.state = 'expired' THEN
    RETURN jsonb_build_object('completed', false, 'expired', true);
  END IF;
  IF v_record.state = 'unknown_outcome' THEN
    RETURN jsonb_build_object('completed', false, 'unknown_outcome', true);
  END IF;
  IF v_record.state <> 'processing' OR v_record.lease_token <> p_lease_token THEN
    RETURN jsonb_build_object('completed', false, 'lease_lost', true);
  END IF;

  UPDATE public.pragas_ai_idempotency_records AS record
     SET state = 'completed',
         response_status = p_response_status,
         response_body = p_response_body,
         completed_at = v_now,
         response_expires_at = v_now + make_interval(secs => p_response_ttl_seconds),
         lease_token = NULL,
         lease_expires_at = NULL,
         updated_at = v_now
   WHERE record.user_id = p_user_id
     AND record.scope = p_scope
     AND record.idempotency_key = p_idempotency_key;

  RETURN jsonb_build_object('completed', true, 'already_completed', false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_pragas_ai_idempotency(
  uuid, text, uuid, text, uuid, integer, jsonb, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_pragas_ai_idempotency(
  uuid, text, uuid, text, uuid, integer, jsonb, integer
) TO service_role;

DROP FUNCTION IF EXISTS public.complete_pragas_ai_idempotency(
  uuid, text, uuid, text, integer, jsonb, integer
);

-- Release is permitted only while the provider has not been called. Edge
-- handlers use it for transient pre-provider failures (for example a quota
-- lookup outage), allowing a safe retry with the same stable key.
CREATE OR REPLACE FUNCTION public.release_pragas_ai_idempotency(
  p_user_id uuid,
  p_scope text,
  p_idempotency_key uuid,
  p_request_hash text,
  p_lease_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF p_user_id IS NULL OR p_scope NOT IN ('diagnosis', 'chat')
     OR p_idempotency_key IS NULL OR p_lease_token IS NULL
     OR p_request_hash !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'invalid_pragas_ai_idempotency_release';
  END IF;
  DELETE FROM public.pragas_ai_idempotency_records AS record
   WHERE record.user_id = p_user_id
     AND record.scope = p_scope
     AND record.idempotency_key = p_idempotency_key
     AND record.request_hash = p_request_hash
     AND record.state = 'processing'
     AND record.lease_token = p_lease_token
     AND record.provider_started_at IS NULL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted = 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.release_pragas_ai_idempotency(uuid, text, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_pragas_ai_idempotency(uuid, text, uuid, text, uuid)
  TO service_role;

DROP FUNCTION IF EXISTS public.release_pragas_ai_idempotency(uuid, text, uuid, text);

CREATE OR REPLACE FUNCTION public.mark_pragas_ai_unknown_outcome(
  p_user_id uuid,
  p_scope text,
  p_idempotency_key uuid,
  p_request_hash text,
  p_lease_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF p_user_id IS NULL OR p_scope NOT IN ('diagnosis', 'chat')
     OR p_idempotency_key IS NULL OR p_lease_token IS NULL
     OR p_request_hash !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'invalid_pragas_ai_unknown_outcome';
  END IF;

  UPDATE public.pragas_ai_idempotency_records AS record
     SET state = 'unknown_outcome',
         lease_token = NULL,
         lease_expires_at = NULL,
         unknown_outcome_at = clock_timestamp(),
         updated_at = clock_timestamp()
   WHERE record.user_id = p_user_id
     AND record.scope = p_scope
     AND record.idempotency_key = p_idempotency_key
     AND record.request_hash = p_request_hash
     AND record.state = 'processing'
     AND record.lease_token = p_lease_token
     AND record.provider_started_at IS NOT NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_pragas_ai_unknown_outcome(
  uuid, text, uuid, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_pragas_ai_unknown_outcome(
  uuid, text, uuid, text, uuid
) TO service_role;

CREATE OR REPLACE FUNCTION public.scrub_expired_pragas_ai_idempotency(
  p_limit integer DEFAULT 500
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_scrubbed integer;
BEGIN
  WITH candidates AS (
    SELECT record.user_id, record.scope, record.idempotency_key
      FROM public.pragas_ai_idempotency_records AS record
     WHERE record.state = 'completed'
       AND record.response_expires_at <= clock_timestamp()
     ORDER BY record.response_expires_at
     FOR UPDATE SKIP LOCKED
     LIMIT greatest(1, least(coalesce(p_limit, 500), 5000))
  )
  UPDATE public.pragas_ai_idempotency_records AS record
     SET state = 'expired',
         response_status = NULL,
         response_body = NULL,
         updated_at = clock_timestamp()
    FROM candidates
   WHERE record.user_id = candidates.user_id
     AND record.scope = candidates.scope
     AND record.idempotency_key = candidates.idempotency_key;
  GET DIAGNOSTICS v_scrubbed = ROW_COUNT;
  RETURN v_scrubbed;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.scrub_expired_pragas_ai_idempotency(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scrub_expired_pragas_ai_idempotency(integer)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Explicit Pragas deletion queue. It performs app cleanup but deliberately
-- never deletes auth.users while the portfolio-wide account semantics remain a
-- business gate. No email or other unnecessary identifier is stored.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pragas_deletion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'requested',
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error_code text CHECK (last_error_code IS NULL OR char_length(last_error_code) <= 100),
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  app_cleanup_completed_at timestamptz,
  reactivated_at timestamptz,
  reactivation_request_id uuid,
  reactivation_idempotency_key uuid,
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.pragas_deletion_jobs
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS reactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS reactivation_request_id uuid,
  ADD COLUMN IF NOT EXISTS reactivation_idempotency_key uuid,
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

-- A partially applied development migration may already have created the
-- status column with an incomplete enum. Normalize it before any function uses
-- the full state machine. This sequence is safe inside one PostgreSQL 17
-- transaction because it does not add or consume enum labels.
ALTER TABLE public.pragas_deletion_jobs
  ALTER COLUMN status DROP DEFAULT;
DO $$
BEGIN
  IF (
    SELECT attribute.atttypid <> 'text'::regtype
      FROM pg_attribute AS attribute
     WHERE attribute.attrelid = 'public.pragas_deletion_jobs'::regclass
       AND attribute.attname = 'status'
       AND NOT attribute.attisdropped
  ) THEN
    EXECUTE 'ALTER TABLE public.pragas_deletion_jobs '
      || 'ALTER COLUMN status TYPE text USING status::text';
  END IF;
END
$$;
ALTER TABLE public.pragas_deletion_jobs
  ALTER COLUMN status SET DEFAULT 'requested',
  ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.pragas_deletion_jobs
  DROP CONSTRAINT IF EXISTS pragas_deletion_jobs_status_check;
ALTER TABLE public.pragas_deletion_jobs
  ADD CONSTRAINT pragas_deletion_jobs_status_check CHECK (
    status IN (
      'requested',
      'processing',
      'retry',
      'blocked_global_decision',
      'reactivated'
    )
  );

CREATE INDEX IF NOT EXISTS idx_pragas_deletion_jobs_queue
  ON public.pragas_deletion_jobs (status, next_attempt_at);

DROP TRIGGER IF EXISTS pragas_deletion_jobs_touch_updated_at
  ON public.pragas_deletion_jobs;
CREATE TRIGGER pragas_deletion_jobs_touch_updated_at
  BEFORE UPDATE ON public.pragas_deletion_jobs
  FOR EACH ROW EXECUTE FUNCTION public.pragas_touch_updated_at();

ALTER TABLE public.pragas_deletion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pragas_deletion_jobs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pragas_deletion_jobs_insert_own
  ON public.pragas_deletion_jobs;
CREATE POLICY pragas_deletion_jobs_insert_own
  ON public.pragas_deletion_jobs
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id AND status = 'requested');

DROP POLICY IF EXISTS pragas_deletion_jobs_select_own
  ON public.pragas_deletion_jobs;
CREATE POLICY pragas_deletion_jobs_select_own
  ON public.pragas_deletion_jobs
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.pragas_deletion_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pragas_deletion_jobs TO service_role;

CREATE OR REPLACE FUNCTION public.request_pragas_account_deletion(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.pragas_deletion_jobs%ROWTYPE;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_deletion_identity';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('pragas-account:' || p_user_id::text, 0)
  );

  SELECT job.*
    INTO v_job
    FROM public.pragas_deletion_jobs AS job
   WHERE job.user_id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.pragas_deletion_jobs (user_id, status, next_attempt_at)
    VALUES (p_user_id, 'requested', v_now)
    RETURNING * INTO v_job;
  ELSIF v_job.status = 'reactivated' THEN
    UPDATE public.pragas_deletion_jobs AS job
       SET status = 'requested',
           attempts = 0,
           last_error_code = NULL,
           next_attempt_at = v_now,
           requested_at = v_now,
           app_cleanup_completed_at = NULL,
           reactivated_at = NULL,
           reactivation_request_id = NULL,
           reactivation_idempotency_key = NULL,
           lease_token = NULL,
           lease_expires_at = NULL
     WHERE job.id = v_job.id
    RETURNING * INTO v_job;
  END IF;

  UPDATE public.pragas_app_links AS link
     SET active = false,
         deactivated_at = coalesce(link.deactivated_at, v_now),
         last_linked_at = v_now
   WHERE link.user_id = p_user_id;

  RETURN jsonb_build_object(
    'id', v_job.id,
    'status', v_job.status,
    'app_cleanup_completed_at', v_job.app_cleanup_completed_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_pragas_account_deletion(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_pragas_account_deletion(uuid)
  TO service_role;

-- Explicit app linking replaces the unsafe shared auth.users trigger. The RPC
-- derives the identity from auth.uid(), accepts no user-controlled ID and will
-- never silently undo a deletion marker.
CREATE OR REPLACE FUNCTION public.pragas_link_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_status text;
  v_full_name text;
  v_already_linked boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('pragas-account:' || v_user_id::text, 0)
  );

  SELECT job.status
    INTO v_status
    FROM public.pragas_deletion_jobs AS job
   WHERE job.user_id = v_user_id;

  IF v_status = 'blocked_global_decision' THEN
    RETURN jsonb_build_object(
      'linked', false,
      'app', 'rumo-pragas',
      'code', 'deleted_reactivation_required'
    );
  ELSIF v_status IN ('requested', 'processing', 'retry') THEN
    RETURN jsonb_build_object(
      'linked', false,
      'app', 'rumo-pragas',
      'code', 'deletion_pending'
    );
  END IF;

  SELECT
    EXISTS (
      SELECT 1 FROM public.pragas_app_links AS link
       WHERE link.user_id = v_user_id
         AND link.active
    ) AND EXISTS (
      SELECT 1 FROM public.pragas_profiles AS profile
       WHERE profile.user_id = v_user_id
         AND profile.id = v_user_id
    ) AND EXISTS (
      SELECT 1 FROM public.subscriptions AS subscription
       WHERE subscription.user_id = v_user_id
         AND subscription.app = 'rumo-pragas'
         AND subscription.status = 'active'
    )
    INTO v_already_linked;

  SELECT left(NULLIF(btrim(auth_user.raw_user_meta_data ->> 'full_name'), ''), 200)
    INTO v_full_name
    FROM auth.users AS auth_user
   WHERE auth_user.id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'auth_identity_not_found';
  END IF;

  INSERT INTO public.pragas_profiles (id, user_id, full_name)
  VALUES (v_user_id, v_user_id, v_full_name)
  ON CONFLICT DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM public.pragas_profiles AS profile
     WHERE profile.id = v_user_id
       AND profile.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'pragas_profile_identity_conflict';
  END IF;

  INSERT INTO public.subscriptions (user_id, plan, status, provider, app)
  VALUES (v_user_id, 'free', 'active', 'free', 'rumo-pragas')
  ON CONFLICT (user_id, app) DO UPDATE
    SET plan = 'free',
        status = 'active',
        provider = 'free',
        updated_at = clock_timestamp();

  INSERT INTO public.pragas_app_links (
    user_id, link_version, active, linked_at, last_linked_at, deactivated_at
  ) VALUES (
    v_user_id, '2026-07-14.1', true, clock_timestamp(), clock_timestamp(), NULL
  )
  ON CONFLICT (user_id) DO UPDATE
    SET link_version = EXCLUDED.link_version,
        active = true,
        last_linked_at = clock_timestamp(),
        deactivated_at = NULL;

  RETURN jsonb_build_object(
    'linked', true,
    'app', 'rumo-pragas',
    'code', CASE WHEN v_already_linked THEN 'already_linked' ELSE 'linked' END
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pragas_link_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pragas_link_account() TO authenticated;

-- Service-only transition used by the dedicated reactivation Edge Function.
-- It deliberately creates a fresh free app state; deleted data is never
-- restored and the global auth identity remains unchanged.
CREATE OR REPLACE FUNCTION public.reactivate_pragas_account(
  p_user_id uuid,
  p_request_id uuid,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.pragas_deletion_jobs%ROWTYPE;
  v_full_name text;
  v_now timestamptz := clock_timestamp();
  v_was_reactivated boolean := false;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'invalid_reactivation_request';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('pragas-account:' || p_user_id::text, 0)
  );

  SELECT job.*
    INTO v_job
    FROM public.pragas_deletion_jobs AS job
   WHERE job.user_id = p_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reactivation_not_required';
  END IF;
  IF v_job.status IN ('requested', 'processing', 'retry') THEN
    RAISE EXCEPTION 'deletion_pending';
  END IF;
  IF v_job.status NOT IN ('blocked_global_decision', 'reactivated') THEN
    RAISE EXCEPTION 'invalid_reactivation_state';
  END IF;
  v_was_reactivated := v_job.status = 'reactivated';

  SELECT left(NULLIF(btrim(auth_user.raw_user_meta_data ->> 'full_name'), ''), 200)
    INTO v_full_name
    FROM auth.users AS auth_user
   WHERE auth_user.id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'auth_identity_not_found';
  END IF;

  UPDATE public.pragas_deletion_jobs AS job
     SET status = 'reactivated',
         reactivated_at = coalesce(job.reactivated_at, v_now),
         reactivation_request_id = coalesce(job.reactivation_request_id, p_request_id),
         reactivation_idempotency_key = coalesce(
           job.reactivation_idempotency_key,
           p_idempotency_key
         ),
         last_error_code = NULL,
         next_attempt_at = v_now,
         lease_token = NULL,
         lease_expires_at = NULL
   WHERE job.user_id = p_user_id;

  INSERT INTO public.pragas_profiles (id, user_id, full_name)
  VALUES (p_user_id, p_user_id, v_full_name)
  ON CONFLICT DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM public.pragas_profiles AS profile
     WHERE profile.id = p_user_id
       AND profile.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'pragas_profile_identity_conflict';
  END IF;

  INSERT INTO public.subscriptions (user_id, plan, status, provider, app)
  VALUES (p_user_id, 'free', 'active', 'free', 'rumo-pragas')
  ON CONFLICT (user_id, app) DO UPDATE
    SET plan = 'free',
        status = 'active',
        provider = 'free',
        updated_at = clock_timestamp();

  INSERT INTO public.pragas_app_links (
    user_id, link_version, active, linked_at, last_linked_at, deactivated_at
  ) VALUES (
    p_user_id, '2026-07-14.1', true, v_now, v_now, NULL
  )
  ON CONFLICT (user_id) DO UPDATE
    SET link_version = EXCLUDED.link_version,
        active = true,
        last_linked_at = v_now,
        deactivated_at = NULL;

  RETURN jsonb_build_object(
    'reactivated', true,
    'already_reactivated', v_was_reactivated,
    'data_restored', false
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reactivate_pragas_account(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reactivate_pragas_account(uuid, uuid, uuid)
  TO service_role;

-- Restrictive RLS policies and authenticated wrappers cannot query the
-- service-only deletion table directly. This parameterless SECURITY DEFINER
-- predicate derives auth.uid() and reveals only whether the complete app link
-- is active: explicit ledger + profile + active app subscription + no deletion
-- marker.
CREATE OR REPLACE FUNCTION public.pragas_current_link_allows_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.pragas_app_links AS link
       WHERE link.user_id = auth.uid()
         AND link.active
    )
    AND EXISTS (
      SELECT 1 FROM public.pragas_profiles AS profile
       WHERE profile.user_id = auth.uid()
         AND profile.id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.subscriptions AS subscription
       WHERE subscription.user_id = auth.uid()
         AND subscription.app = 'rumo-pragas'
         AND subscription.status = 'active'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.pragas_deletion_jobs AS deletion
       WHERE deletion.user_id = auth.uid()
         AND deletion.status <> 'reactivated'
    )
$$;

REVOKE EXECUTE ON FUNCTION public.pragas_current_link_allows_access()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pragas_current_link_allows_access()
  TO authenticated;

-- Explicit UI consent is the only path that can grant/re-grant AI processing.
-- Identity is derived from auth.uid(); a stale device header cannot call this
-- implicitly from a provider route.
CREATE OR REPLACE FUNCTION public.grant_pragas_ai_consent(
  p_purpose text,
  p_version text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_accepted_at timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF p_purpose NOT IN ('diagnosis', 'chat') OR p_version <> '2026-07-14.1' THEN
    RAISE EXCEPTION 'invalid_pragas_ai_consent';
  END IF;
  IF NOT public.pragas_current_link_allows_access() THEN
    RAISE EXCEPTION 'pragas_app_link_inactive';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'pragas-ai-consent:' || v_user_id::text || ':' || p_purpose,
      0
    )
  );
  INSERT INTO public.pragas_ai_consents (
    user_id, purpose, version, accepted_at, last_used_at, revoked_at
  ) VALUES (
    v_user_id, p_purpose, p_version, v_now, v_now, NULL
  )
  ON CONFLICT (user_id, purpose, version) DO UPDATE
    SET accepted_at = CASE
          WHEN public.pragas_ai_consents.revoked_at IS NULL
            THEN public.pragas_ai_consents.accepted_at
          ELSE v_now
        END,
        last_used_at = v_now,
        revoked_at = NULL
  RETURNING accepted_at INTO v_accepted_at;

  RETURN jsonb_build_object(
    'granted', true,
    'purpose', p_purpose,
    'version', p_version,
    'accepted_at', v_accepted_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grant_pragas_ai_consent(text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_pragas_ai_consent(text, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_pragas_ai_consent(p_purpose text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_revoked_at timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF p_purpose NOT IN ('diagnosis', 'chat') THEN
    RAISE EXCEPTION 'invalid_pragas_ai_consent_purpose';
  END IF;
  IF NOT public.pragas_current_link_allows_access() THEN
    RAISE EXCEPTION 'pragas_app_link_inactive';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'pragas-ai-consent:' || v_user_id::text || ':' || p_purpose,
      0
    )
  );
  UPDATE public.pragas_ai_consents AS consent
     SET revoked_at = coalesce(consent.revoked_at, v_now)
   WHERE consent.user_id = v_user_id
     AND consent.purpose = p_purpose;

  SELECT max(consent.revoked_at)
    INTO v_revoked_at
    FROM public.pragas_ai_consents AS consent
   WHERE consent.user_id = v_user_id
     AND consent.purpose = p_purpose;

  RETURN jsonb_build_object(
    'revoked', true,
    'purpose', p_purpose,
    'revoked_at', coalesce(v_revoked_at, v_now)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.revoke_pragas_ai_consent(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_pragas_ai_consent(text)
  TO authenticated;

-- Device registration derives ownership from auth.uid(). The Expo token is the
-- minimum device handle required for delivery; no fingerprint/model is stored.
-- Disabling is a soft revocation and enabling records fresh consent.
CREATE OR REPLACE FUNCTION public.touch_pragas_push_token(
  p_token text,
  p_platform text,
  p_notifications_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_row public.pragas_push_tokens%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF NOT public.pragas_current_link_allows_access() THEN
    RAISE EXCEPTION 'pragas_app_link_inactive';
  END IF;
  IF p_token IS NULL
     OR char_length(p_token) NOT BETWEEN 20 AND 512
     OR p_token !~ '^(ExponentPushToken|ExpoPushToken)[[][A-Za-z0-9_-]+[]]$'
     OR p_platform NOT IN ('ios', 'android')
     OR p_notifications_enabled IS NULL
  THEN
    RAISE EXCEPTION 'invalid_pragas_push_registration';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'pragas-push-token:' || p_token,
      0
    )
  );

  IF NOT p_notifications_enabled THEN
    -- An opt-out must revoke already queued delivery as well as the registry
    -- row. Do not touch the queue when legacy drift shows another currently
    -- active owner for the same Expo token.
    IF EXISTS (
      SELECT 1
        FROM public.pragas_push_tokens AS token
       WHERE token.user_id = v_user_id
         AND token.is_active
         AND token.notifications_enabled
         AND (token.expo_token = p_token OR token.token = p_token)
    ) AND NOT EXISTS (
      SELECT 1
        FROM public.pragas_push_tokens AS token
       WHERE token.user_id <> v_user_id
         AND token.is_active
         AND token.notifications_enabled
         AND (token.expo_token = p_token OR token.token = p_token)
    ) AND to_regclass('public.pragas_notification_queue') IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns AS column_info
         WHERE column_info.table_schema = 'public'
           AND column_info.table_name = 'pragas_notification_queue'
           AND column_info.column_name = 'token'
      ) THEN
        RAISE EXCEPTION 'pragas_notification_queue_schema_mismatch';
      END IF;
      EXECUTE 'DELETE FROM public.pragas_notification_queue WHERE token = $1'
        USING p_token;
    END IF;

    UPDATE public.pragas_push_tokens AS token
       SET notifications_enabled = false,
           is_active = false,
           revoked_at = coalesce(token.revoked_at, v_now),
           last_seen_at = v_now
     WHERE token.user_id = v_user_id
       AND (token.expo_token = p_token OR token.token = p_token)
    RETURNING token.* INTO v_row;

    RETURN jsonb_build_object(
      'registered', false,
      'revoked', true,
      'revoked_at', coalesce(v_row.revoked_at, v_now)
    );
  END IF;

  -- An Expo token can be reassigned after reinstall. Pending queue rows cannot
  -- be attributed safely after that ownership change, so remove them under the
  -- same token lock before activating the new owner. A missing/drifted queue
  -- contract aborts the whole transaction rather than leaking a notification.
  IF EXISTS (
    SELECT 1
      FROM public.pragas_push_tokens AS token
     WHERE token.user_id <> v_user_id
       AND (token.expo_token = p_token OR token.token = p_token)
  ) AND to_regclass('public.pragas_notification_queue') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns AS column_info
       WHERE column_info.table_schema = 'public'
         AND column_info.table_name = 'pragas_notification_queue'
         AND column_info.column_name = 'token'
    ) THEN
      RAISE EXCEPTION 'pragas_notification_queue_schema_mismatch';
    END IF;
    EXECUTE 'DELETE FROM public.pragas_notification_queue WHERE token = $1'
      USING p_token;
  END IF;

  -- Revoke the old association only after the queue is clean so notifications
  -- can never leak across accounts/devices.
  UPDATE public.pragas_push_tokens AS token
     SET notifications_enabled = false,
         is_active = false,
         revoked_at = coalesce(token.revoked_at, v_now),
         last_seen_at = v_now
   WHERE (token.expo_token = p_token OR token.token = p_token)
     AND (
       token.user_id <> v_user_id
     )
     AND (token.is_active OR token.notifications_enabled);

  UPDATE public.pragas_push_tokens AS token
     SET token = p_token,
         expo_token = p_token,
         platform = p_platform,
         notifications_enabled = true,
         is_active = true,
         consented_at = v_now,
         revoked_at = NULL,
         last_seen_at = v_now
   WHERE token.user_id = v_user_id
     AND (token.expo_token = p_token OR token.token = p_token)
  RETURNING token.* INTO v_row;

  IF NOT FOUND THEN
    INSERT INTO public.pragas_push_tokens (
      user_id, token, expo_token, platform,
      notifications_enabled, is_active, consented_at, revoked_at, last_seen_at
    ) VALUES (
      v_user_id, p_token, p_token, p_platform,
      true, true, v_now, NULL, v_now
    )
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object(
    'registered', true,
    'revoked', false,
    'platform', v_row.platform,
    'consented_at', v_row.consented_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.touch_pragas_push_token(text, text, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_pragas_push_token(text, text, boolean)
  TO authenticated;

-- Dedicated private avatar bucket. Read/write is linked-account and strict
-- user-prefix only; clients render short-lived signed URLs from avatar_path.
-- The historical shared `avatars` bucket remains unchanged.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO storage.buckets (
    id, name, public, file_size_limit, allowed_mime_types
  ) VALUES (
    'pragas-avatars', 'pragas-avatars', false, 2097152,
    ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
  )
  ON CONFLICT (id) DO UPDATE
    SET public = false,
        file_size_limit = 2097152,
        allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[];
END
$$;

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RETURN;
  END IF;

  DROP POLICY IF EXISTS pragas_avatars_select_public ON storage.objects;
  DROP POLICY IF EXISTS pragas_avatars_select_own ON storage.objects;
  CREATE POLICY pragas_avatars_select_own
    ON storage.objects FOR SELECT TO authenticated
    USING (
      bucket_id = 'pragas-avatars'
      AND public.pragas_current_link_allows_access()
      AND (storage.foldername(name))[1] = auth.uid()::text
    );

  DROP POLICY IF EXISTS pragas_avatars_insert_own ON storage.objects;
  CREATE POLICY pragas_avatars_insert_own
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'pragas-avatars'
      AND public.pragas_current_link_allows_access()
      AND (storage.foldername(name))[1] = auth.uid()::text
      AND name ~ (
        '^' || auth.uid()::text ||
        '/avatar-[A-Za-z0-9._-]+[.](jpg|jpeg|png|webp)$'
      )
    );

  DROP POLICY IF EXISTS pragas_avatars_update_own ON storage.objects;
  CREATE POLICY pragas_avatars_update_own
    ON storage.objects FOR UPDATE TO authenticated
    USING (
      bucket_id = 'pragas-avatars'
      AND public.pragas_current_link_allows_access()
      AND (storage.foldername(name))[1] = auth.uid()::text
    )
    WITH CHECK (
      bucket_id = 'pragas-avatars'
      AND public.pragas_current_link_allows_access()
      AND (storage.foldername(name))[1] = auth.uid()::text
      AND name ~ (
        '^' || auth.uid()::text ||
        '/avatar-[A-Za-z0-9._-]+[.](jpg|jpeg|png|webp)$'
      )
    );

  DROP POLICY IF EXISTS pragas_avatars_delete_own ON storage.objects;
  CREATE POLICY pragas_avatars_delete_own
    ON storage.objects FOR DELETE TO authenticated
    USING (
      bucket_id = 'pragas-avatars'
      AND public.pragas_current_link_allows_access()
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
END
$$;

-- Authenticated MCP clients get only a fixed, identity-derived wrapper. They
-- cannot choose another user, scope, limit or time window.
CREATE OR REPLACE FUNCTION public.consume_pragas_mcp_rate_limit(
  p_idempotency_key uuid,
  p_request_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL OR p_idempotency_key IS NULL
     OR p_request_hash !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF NOT public.pragas_current_link_allows_access() THEN
    RAISE EXCEPTION 'pragas_app_link_inactive';
  END IF;

  RETURN public.consume_pragas_api_rate_limit(
    v_user_id,
    'mcp',
    30,
    60,
    p_idempotency_key,
    p_request_hash
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_pragas_mcp_rate_limit(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_pragas_mcp_rate_limit(uuid, text)
  TO authenticated;

DO $$
BEGIN
  IF to_regprocedure('public.consume_pragas_mcp_rate_limit(uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.consume_pragas_mcp_rate_limit(uuid) '
      || 'FROM PUBLIC, anon, authenticated, service_role';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.claim_pragas_deletion_jobs(p_limit integer DEFAULT 25)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  attempts integer,
  lease_token uuid,
  lease_expires_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH candidates AS (
    SELECT job.id
      FROM public.pragas_deletion_jobs AS job
     WHERE (
       job.status IN ('requested', 'retry')
       AND job.next_attempt_at <= clock_timestamp()
     ) OR (
       job.status = 'processing'
       AND job.lease_expires_at <= clock_timestamp()
     )
     ORDER BY job.requested_at
     FOR UPDATE SKIP LOCKED
     LIMIT greatest(1, least(coalesce(p_limit, 25), 100))
  )
  UPDATE public.pragas_deletion_jobs AS job
     SET status = 'processing',
         attempts = job.attempts + 1,
         last_error_code = NULL,
         lease_token = gen_random_uuid(),
         lease_expires_at = clock_timestamp() + interval '10 minutes'
    FROM candidates
   WHERE job.id = candidates.id
  RETURNING job.id, job.user_id, job.attempts,
            job.lease_token, job.lease_expires_at;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_pragas_deletion_jobs(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pragas_deletion_jobs(integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.claim_pragas_deletion_job(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  attempts integer,
  lease_token uuid,
  lease_expires_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.pragas_deletion_jobs AS job
     SET status = 'processing',
         attempts = job.attempts + 1,
         last_error_code = NULL,
         lease_token = gen_random_uuid(),
         lease_expires_at = clock_timestamp() + interval '10 minutes'
   WHERE job.user_id = p_user_id
     AND (
       (
         job.status IN ('requested', 'retry')
         AND job.next_attempt_at <= clock_timestamp()
       ) OR (
         job.status = 'processing'
         AND job.lease_expires_at <= clock_timestamp()
       )
     )
  RETURNING job.id, job.user_id, job.attempts,
            job.lease_token, job.lease_expires_at;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_pragas_deletion_job(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pragas_deletion_job(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.complete_pragas_deletion_job(
  p_job_id uuid,
  p_lease_token uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH completed AS (
    UPDATE public.pragas_deletion_jobs AS job
       SET status = 'blocked_global_decision',
           app_cleanup_completed_at = coalesce(
             job.app_cleanup_completed_at,
             clock_timestamp()
           ),
           last_error_code = 'global_identity_and_unscoped_history_retained',
           lease_token = NULL,
           lease_expires_at = NULL
     WHERE job.id = p_job_id
       AND job.status = 'processing'
       AND job.lease_token = p_lease_token
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM completed)
$$;

REVOKE EXECUTE ON FUNCTION public.complete_pragas_deletion_job(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_pragas_deletion_job(uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.retry_pragas_deletion_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_error_code text,
  p_next_attempt_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated boolean;
BEGIN
  IF p_job_id IS NULL OR p_lease_token IS NULL
     OR p_error_code IS NULL
     OR p_error_code !~ '^[a-z0-9_]{1,100}$'
     OR p_next_attempt_at IS NULL
     OR p_next_attempt_at < clock_timestamp()
     OR p_next_attempt_at > clock_timestamp() + interval '2 days'
  THEN
    RAISE EXCEPTION 'invalid_deletion_retry';
  END IF;

  WITH retried AS (
    UPDATE public.pragas_deletion_jobs AS job
       SET status = 'retry',
           last_error_code = p_error_code,
           next_attempt_at = p_next_attempt_at,
           lease_token = NULL,
           lease_expires_at = NULL
     WHERE job.id = p_job_id
       AND job.status = 'processing'
       AND job.lease_token = p_lease_token
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM retried) INTO v_updated;
  RETURN v_updated;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.retry_pragas_deletion_job(
  uuid, uuid, text, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retry_pragas_deletion_job(
  uuid, uuid, text, timestamptz
) TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_pragas_user_rows(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_table text;
  v_count bigint;
  v_deleted jsonb := '{}'::jsonb;
  v_owned_push_tokens text[] := ARRAY[]::text[];
  v_push_token text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_cleanup_identity';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('pragas-account:' || p_user_id::text, 0)
  );

  -- The legacy notification queue has no user_id. Ownership is established
  -- only through this user's device tokens, and a token currently activated by
  -- another user wins over an old inactive association. This prevents an A→B
  -- token transfer from letting A's later cleanup erase B's new notifications.
  IF to_regclass('public.pragas_notification_queue') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
        FROM (VALUES
          ('pragas_notification_queue', 'token'),
          ('pragas_push_tokens', 'user_id'),
          ('pragas_push_tokens', 'token'),
          ('pragas_push_tokens', 'expo_token'),
          ('pragas_push_tokens', 'is_active'),
          ('pragas_push_tokens', 'notifications_enabled')
        ) AS required(table_name, column_name)
       WHERE NOT EXISTS (
         SELECT 1 FROM information_schema.columns AS column_info
          WHERE column_info.table_schema = 'public'
            AND column_info.table_name = required.table_name
            AND column_info.column_name = required.column_name
       )
    ) THEN
      RAISE EXCEPTION 'pragas_notification_queue_schema_mismatch';
    END IF;

    EXECUTE $query$
      SELECT coalesce(
        array_agg(DISTINCT candidate.token_value ORDER BY candidate.token_value),
        ARRAY[]::text[]
      )
        FROM (
          SELECT source.token AS token_value
            FROM public.pragas_push_tokens AS source
           WHERE source.user_id = $1 AND source.token IS NOT NULL
          UNION
          SELECT source.expo_token AS token_value
            FROM public.pragas_push_tokens AS source
           WHERE source.user_id = $1 AND source.expo_token IS NOT NULL
        ) AS candidate
    $query$ USING p_user_id INTO v_owned_push_tokens;

    -- Lock every historical token in deterministic order using the same key as
    -- touch_pragas_push_token. Re-check ownership only after the locks are held
    -- so a concurrent A→B transfer cannot race this deletion.
    FOREACH v_push_token IN ARRAY v_owned_push_tokens
    LOOP
      PERFORM pg_advisory_xact_lock(
        hashtextextended('pragas-push-token:' || v_push_token, 0)
      );
    END LOOP;

    EXECUTE $query$
      SELECT coalesce(
        array_agg(DISTINCT owned.token_value ORDER BY owned.token_value),
        ARRAY[]::text[]
      )
        FROM (
          SELECT source.token AS token_value
            FROM public.pragas_push_tokens AS source
           WHERE source.user_id = $1
             AND source.token IS NOT NULL
             AND NOT EXISTS (
               SELECT 1 FROM public.pragas_push_tokens AS current_owner
                WHERE current_owner.user_id <> $1
                  AND current_owner.is_active
                  AND current_owner.notifications_enabled
                  AND (
                    current_owner.token = source.token
                    OR current_owner.expo_token = source.token
                  )
             )
          UNION
          SELECT source.expo_token AS token_value
            FROM public.pragas_push_tokens AS source
           WHERE source.user_id = $1
             AND source.expo_token IS NOT NULL
             AND NOT EXISTS (
               SELECT 1 FROM public.pragas_push_tokens AS current_owner
                WHERE current_owner.user_id <> $1
                  AND current_owner.is_active
                  AND current_owner.notifications_enabled
                  AND (
                    current_owner.token = source.expo_token
                    OR current_owner.expo_token = source.expo_token
                  )
             )
        ) AS owned
    $query$ USING p_user_id INTO v_owned_push_tokens;

    EXECUTE 'DELETE FROM public.pragas_notification_queue WHERE token = ANY ($1)'
      USING v_owned_push_tokens;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('pragas_notification_queue', v_count);
  END IF;

  -- Children precede parents. Tables which exist only in the shared production
  -- schema are intentionally conditional so clean local replays remain valid.
  FOREACH v_table IN ARRAY ARRAY[
    'pragas_reply_likes',
    'pragas_post_replies',
    'pragas_post_comments',
    'pragas_post_likes',
    'pragas_community_likes',
    'pragas_community_posts',
    'pragas_outbreak_confirmations',
    'pragas_outbreaks',
    'pragas_diagnosis_feedback',
    'pragas_diagnosis_usage',
    'pragas_chat_messages',
    'pragas_ai_content_reports',
    'pragas_ai_consents',
    'pragas_ai_idempotency_records',
    'pragas_location_consent_decisions',
    'pragas_app_links',
    'pragas_analytics',
    'pragas_error_logs',
    'pragas_api_rate_limit_events',
    'pragas_api_rate_limit_counters',
    'pragas_diagnoses',
    'pragas_push_tokens',
    'pragas_subscriptions',
    'pragas_user_preferences'
  ]
  LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns AS column_info
       WHERE column_info.table_schema = 'public'
         AND column_info.table_name = v_table
         AND column_info.column_name = 'user_id'
    ) THEN
      -- Never guess a remote-only table's ownership relationship. Failing the
      -- transaction leaves every row intact for an explicit schema review.
      RAISE EXCEPTION 'pragas_cleanup_schema_mismatch_%', v_table;
    END IF;
    EXECUTE format('DELETE FROM public.%I WHERE user_id = $1', v_table)
      USING p_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object(v_table, v_count);
  END LOOP;

  DELETE FROM public.subscriptions
   WHERE user_id = p_user_id
     AND app = 'rumo-pragas';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('subscriptions', v_count);

  IF to_regclass('public.chat_usage') IS NOT NULL THEN
    DELETE FROM public.chat_usage
     WHERE user_id = p_user_id
       AND app = 'rumo-pragas';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('chat_usage', v_count);
  END IF;

  IF to_regclass('public.analytics_events') IS NOT NULL THEN
    DELETE FROM public.analytics_events
     WHERE user_id = p_user_id
       AND app = 'rumo-pragas';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('analytics_events', v_count);
  END IF;

  IF to_regclass('public.audit_log') IS NOT NULL THEN
    DELETE FROM public.audit_log
     WHERE user_id = p_user_id
       AND app = 'rumo-pragas';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('audit_log', v_count);
  END IF;

  DELETE FROM public.pragas_profiles WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('pragas_profiles', v_count);

  RETURN jsonb_build_object(
    'deleted', v_deleted,
    'retained_shared_unscoped',
    jsonb_build_array('analytics_events', 'audit_log', 'user_preferences')
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_pragas_user_rows(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_pragas_user_rows(uuid)
  TO service_role;

-- A completed or pending deletion job is also the durable unlink marker. Add
-- restrictive policies so an authenticated client cannot silently recreate
-- Pragas data while the shared global auth identity is intentionally retained.
DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'pragas_profiles',
    'pragas_diagnoses',
    'pragas_user_preferences',
    'pragas_ai_content_reports',
    'pragas_diagnosis_feedback',
    'pragas_push_tokens',
    'pragas_reply_likes',
    'pragas_post_replies',
    'pragas_post_comments',
    'pragas_post_likes',
    'pragas_community_likes',
    'pragas_community_posts',
    'pragas_outbreak_confirmations',
    'pragas_outbreaks',
    'pragas_diagnosis_usage',
    'pragas_chat_messages',
    'pragas_analytics',
    'pragas_error_logs',
    'pragas_api_rate_limit_events',
    'pragas_api_rate_limit_counters',
    'pragas_subscriptions',
    'pragas_ai_consents',
    'pragas_ai_idempotency_records'
  ]
  LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('DROP POLICY IF EXISTS pragas_active_link_restrict ON public.%I', v_table);
    EXECUTE format(
      'CREATE POLICY pragas_active_link_restrict ON public.%I '
      || 'AS RESTRICTIVE FOR ALL TO authenticated '
      || 'USING (public.pragas_current_link_allows_access()) '
      || 'WITH CHECK (public.pragas_current_link_allows_access())',
      v_table
    );
  END LOOP;

  FOREACH v_table IN ARRAY ARRAY['subscriptions', 'chat_usage']
  LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('DROP POLICY IF EXISTS pragas_active_link_restrict ON public.%I', v_table);
    EXECUTE format(
      'CREATE POLICY pragas_active_link_restrict ON public.%I '
      || 'AS RESTRICTIVE FOR ALL TO authenticated '
      || 'USING ('
      || 'app IS DISTINCT FROM ''rumo-pragas'' OR public.pragas_current_link_allows_access()'
      || ') '
      || 'WITH CHECK ('
      || 'app IS DISTINCT FROM ''rumo-pragas'' OR public.pragas_current_link_allows_access()'
      || ')',
      v_table
    );
  END LOOP;
END
$$;

COMMENT ON TABLE public.pragas_ai_content_reports IS
  'Rumo Pragas user reports of AI content; reporter insert-only, admin/service review.';
COMMENT ON TABLE public.pragas_diagnosis_feedback IS
  'Rumo Pragas user feedback, explicitly an opinion and not agronomic ground truth.';
COMMENT ON TABLE public.pragas_api_rate_limit_counters IS
  'Atomic server-authoritative rate limits for Rumo Pragas Edge Functions.';
COMMENT ON TABLE public.pragas_deletion_jobs IS
  'Rumo Pragas app cleanup queue; global auth deletion remains intentionally gated.';
COMMENT ON TABLE public.pragas_app_links IS
  'Explicit app-entry ledger; legacy auth signup profile/subscription rows never activate Pragas.';
