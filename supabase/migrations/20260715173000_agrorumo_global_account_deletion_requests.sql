-- Portfolio-wide account deletion request queue for Rumo Pragas.
--
-- This migration intentionally DOES NOT delete auth.users or sibling-product
-- data. It records a durable, privacy-preserving request for coordinated
-- manual processing, while immediately suspending the Rumo Pragas surface and
-- revoking its push delivery. Global erasure remains an operator-reviewed
-- portfolio workflow because the jxcn identity is shared by several apps.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

DO $vault_preflight$
BEGIN
  IF to_regprocedure('vault.create_secret(text,text,text,uuid)') IS NULL
     OR to_regclass('vault.decrypted_secrets') IS NULL
     OR to_regclass('vault.secrets') IS NULL
  THEN
    RAISE EXCEPTION 'global_deletion_requires_supabase_vault';
  END IF;
END
$vault_preflight$;

CREATE TABLE IF NOT EXISTS public.agrorumo_deletion_identity_keys (
  key_version smallint PRIMARY KEY CHECK (key_version = 1),
  hmac_key bytea NOT NULL CHECK (octet_length(hmac_key) = 32),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.agrorumo_deletion_identity_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agrorumo_deletion_identity_keys FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.agrorumo_deletion_identity_keys
  FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO public.agrorumo_deletion_identity_keys (key_version, hmac_key)
VALUES (1, extensions.gen_random_bytes(32))
ON CONFLICT (key_version) DO NOTHING;

CREATE OR REPLACE FUNCTION public.agrorumo_deletion_subject_ref(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_key bytea;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_deletion_subject';
  END IF;
  SELECT key_row.hmac_key INTO STRICT v_key
    FROM public.agrorumo_deletion_identity_keys AS key_row
   WHERE key_row.key_version = 1;
  RETURN pg_catalog.encode(
    extensions.hmac(
      pg_catalog.convert_to('subject:' || p_user_id::text, 'UTF8'),
      v_key,
      'sha256'
    ),
    'hex'
  );
END;
$$;
REVOKE ALL ON FUNCTION public.agrorumo_deletion_subject_ref(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agrorumo_deletion_subject_ref(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.agrorumo_deletion_session_ref(p_session_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_key bytea;
BEGIN
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'invalid_deletion_session';
  END IF;
  SELECT key_row.hmac_key INTO STRICT v_key
    FROM public.agrorumo_deletion_identity_keys AS key_row
   WHERE key_row.key_version = 1;
  RETURN pg_catalog.encode(
    extensions.hmac(
      pg_catalog.convert_to('session:' || p_session_id::text, 'UTF8'),
      v_key,
      'sha256'
    ),
    'hex'
  );
END;
$$;
REVOKE ALL ON FUNCTION public.agrorumo_deletion_session_ref(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agrorumo_deletion_session_ref(uuid)
  TO service_role;

CREATE TABLE IF NOT EXISTS public.agrorumo_account_deletion_challenges (
  id uuid PRIMARY KEY,
  subject_ref text NOT NULL UNIQUE CHECK (subject_ref ~ '^[0-9a-f]{64}$'),
  initial_session_ref text NOT NULL CHECK (initial_session_ref ~ '^[0-9a-f]{64}$'),
  secret_digest text NOT NULL CHECK (secret_digest ~ '^[0-9a-f]{64}$'),
  confirmation_version text NOT NULL
    CHECK (confirmation_version = 'agrorumo-global-account-deletion/2026-07-16.1'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reauthentication_not_before_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CHECK (
    reauthentication_not_before_at > created_at
    AND reauthentication_not_before_at <= created_at + interval '2 seconds'
  ),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '15 minutes')
);
CREATE INDEX IF NOT EXISTS idx_agrorumo_account_deletion_challenges_expires
  ON public.agrorumo_account_deletion_challenges (expires_at, id);
ALTER TABLE public.agrorumo_account_deletion_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agrorumo_account_deletion_challenges FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.agrorumo_account_deletion_challenges
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.agrorumo_account_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_ref text NOT NULL UNIQUE CHECK (subject_ref ~ '^[0-9a-f]{64}$'),
  receipt_id uuid NOT NULL UNIQUE,
  idempotency_key uuid NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'requested_manual_review' CHECK (status IN (
    'requested_manual_review',
    'in_review',
    'processing',
    'needs_user_action',
    'legal_retention_only',
    'completed'
  )),
  scope_version text NOT NULL
    CHECK (scope_version = 'agrorumo-entire-account/2026-07-16.1'),
  confirmation_version text NOT NULL
    CHECK (confirmation_version = 'agrorumo-global-account-deletion/2026-07-16.1'),
  reauthentication_method text NOT NULL CHECK (
    reauthentication_method IN ('password', 'oauth', 'otp', 'sso', 'mfa')
  ),
  reauthenticated_at timestamptz NOT NULL,
  apple_authorization_revoked_at timestamptz,
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  due_at timestamptz NOT NULL,
  pragas_access_suspended_at timestamptz NOT NULL,
  pragas_push_revoked_at timestamptz NOT NULL,
  app_cleanup_state text NOT NULL DEFAULT 'queued' CHECK (
    app_cleanup_state IN ('queued', 'processing', 'completed', 'retry')
  ),
  last_status_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  legal_retention_code text CHECK (
    legal_retention_code IS NULL
    OR legal_retention_code ~ '^[a-z0-9_]{1,80}$'
  ),
  CHECK (due_at > requested_at AND due_at <= requested_at + interval '15 days 5 minutes'),
  CHECK (reauthenticated_at <= requested_at + interval '1 minute'),
  CHECK (
    apple_authorization_revoked_at IS NULL
    OR apple_authorization_revoked_at >= requested_at
  ),
  CHECK (
    (status = 'completed' AND completed_at IS NOT NULL)
    OR (status <> 'completed' AND completed_at IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_agrorumo_account_deletion_manual_queue
  ON public.agrorumo_account_deletion_requests (status, due_at, requested_at);
ALTER TABLE public.agrorumo_account_deletion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agrorumo_account_deletion_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.agrorumo_account_deletion_requests
  FROM PUBLIC, anon, authenticated, service_role;

-- Apple authorization revocation is a distributed workflow. The deletion
-- request is reserved first; only then may the Edge Function exchange or
-- revoke at Apple. Refresh tokens are stored solely in Supabase Vault and this
-- table retains only an opaque Vault UUID plus stable, non-PII state codes.
CREATE TABLE IF NOT EXISTS public.agrorumo_account_deletion_apple_revocations (
  request_id uuid PRIMARY KEY REFERENCES public.agrorumo_account_deletion_requests(id)
    ON DELETE RESTRICT,
  state text NOT NULL CHECK (state IN (
    'not_required',
    'reserved',
    'exchange_in_progress',
    'token_ready',
    'revocation_in_progress',
    'retry_pending',
    'revoked'
  )),
  authorization_code_digest text CHECK (
    authorization_code_digest IS NULL
    OR authorization_code_digest ~ '^[0-9a-f]{64}$'
  ),
  token_vault_secret_id uuid,
  attempt_token uuid,
  lease_expires_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error_code text CHECK (
    last_error_code IS NULL OR last_error_code ~ '^[a-z0-9_]{1,80}$'
  ),
  last_attempt_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((state = 'revoked') = (revoked_at IS NOT NULL)),
  CHECK (state <> 'not_required' OR token_vault_secret_id IS NULL),
  CHECK (
    (state IN ('exchange_in_progress', 'revocation_in_progress'))
      = (attempt_token IS NOT NULL AND lease_expires_at IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_agrorumo_apple_revocations_operational
  ON public.agrorumo_account_deletion_apple_revocations (state, updated_at, request_id);
ALTER TABLE public.agrorumo_account_deletion_apple_revocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agrorumo_account_deletion_apple_revocations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.agrorumo_account_deletion_apple_revocations
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.agrorumo_account_deletion_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES public.agrorumo_account_deletion_requests(id)
    ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN (
    'request_accepted',
    'status_changed',
    'manual_evidence_recorded',
    'apple_revocation_state_changed',
    'ephemeral_data_purged'
  )),
  from_status text,
  to_status text NOT NULL,
  detail_code text NOT NULL CHECK (detail_code ~ '^[a-z0-9_]{1,80}$'),
  operator_ref text CHECK (
    operator_ref IS NULL OR operator_ref ~ '^[0-9a-f]{64}$'
  ),
  evidence_digest text CHECK (
    evidence_digest IS NULL OR evidence_digest ~ '^[0-9a-f]{64}$'
  ),
  CHECK (
    event_type <> 'manual_evidence_recorded'
    OR (operator_ref IS NOT NULL AND evidence_digest IS NOT NULL)
  ),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_agrorumo_account_deletion_events_request
  ON public.agrorumo_account_deletion_events (request_id, occurred_at, id);
ALTER TABLE public.agrorumo_account_deletion_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agrorumo_account_deletion_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.agrorumo_account_deletion_events
  FROM PUBLIC, anon, authenticated, service_role;

-- Public receipt lookups are intentionally unauthenticated. Rate limiting is
-- keyed by an HMAC of the gateway-derived network actor, never by the receipt
-- and never by a raw IP, so known and unknown receipts have identical limits.
CREATE TABLE IF NOT EXISTS public.agrorumo_deletion_status_rate_limits (
  actor_ref text PRIMARY KEY CHECK (actor_ref ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_agrorumo_deletion_status_rate_limits_updated
  ON public.agrorumo_deletion_status_rate_limits (updated_at);
ALTER TABLE public.agrorumo_deletion_status_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agrorumo_deletion_status_rate_limits FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.agrorumo_deletion_status_rate_limits
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.agrorumo_deletion_events_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'agrorumo_deletion_event_immutable';
END;
$$;
REVOKE ALL ON FUNCTION public.agrorumo_deletion_events_immutable()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS agrorumo_deletion_events_immutable
  ON public.agrorumo_account_deletion_events;
CREATE TRIGGER agrorumo_deletion_events_immutable
  BEFORE UPDATE OR DELETE ON public.agrorumo_account_deletion_events
  FOR EACH ROW EXECUTE FUNCTION public.agrorumo_deletion_events_immutable();

CREATE OR REPLACE FUNCTION public.begin_agrorumo_account_deletion_challenge(
  p_user_id uuid,
  p_initial_session_id uuid,
  p_challenge_id uuid,
  p_secret_digest text,
  p_confirmation_version text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_subject_ref text;
  v_existing public.agrorumo_account_deletion_requests%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  -- JWT iat/AMR claims have whole-second precision. Requiring the next full
  -- second creates a representable boundary that is strictly after creation;
  -- a pre-challenge authentication from the same second can never pass.
  v_reauthentication_not_before_at timestamptz :=
    date_trunc('second', v_now) + interval '1 second';
  v_expires_at timestamptz := v_now + interval '10 minutes';
BEGIN
  IF p_user_id IS NULL OR p_initial_session_id IS NULL OR p_challenge_id IS NULL
     OR p_secret_digest !~ '^[0-9a-f]{64}$'
     OR p_confirmation_version <> 'agrorumo-global-account-deletion/2026-07-16.1'
  THEN
    RAISE EXCEPTION 'invalid_global_deletion_challenge';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users AS auth_user WHERE auth_user.id = p_user_id) THEN
    RAISE EXCEPTION 'deletion_subject_not_found';
  END IF;

  -- Challenges are authentication material, not durable deletion evidence.
  -- Opportunistically remove bounded expired rows on every begin; successful
  -- confirmations delete their own challenge in the same transaction below.
  WITH expired AS (
    SELECT challenge_row.id
      FROM public.agrorumo_account_deletion_challenges AS challenge_row
     WHERE challenge_row.expires_at <= v_now
     ORDER BY challenge_row.expires_at, challenge_row.id
     FOR UPDATE SKIP LOCKED
     LIMIT 250
  )
  DELETE FROM public.agrorumo_account_deletion_challenges AS challenge_row
   USING expired
   WHERE challenge_row.id = expired.id;

  v_subject_ref := public.agrorumo_deletion_subject_ref(p_user_id);
  PERFORM pg_advisory_xact_lock(
    hashtextextended('agrorumo-global-deletion:' || v_subject_ref, 0)
  );
  SELECT * INTO v_existing
    FROM public.agrorumo_account_deletion_requests AS request_row
   WHERE request_row.subject_ref = v_subject_ref;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'state', 'already_requested',
      'receipt_id', v_existing.receipt_id,
      'status', v_existing.status,
      'requested_at', v_existing.requested_at,
      'due_at', v_existing.due_at,
      'app_cleanup_state', v_existing.app_cleanup_state,
      'apple_authorization_status', coalesce((
        SELECT CASE
          WHEN apple_row.state = 'revoked' THEN 'revoked'
          WHEN apple_row.state = 'not_required' THEN 'not_required'
          ELSE 'retry_pending'
        END
          FROM public.agrorumo_account_deletion_apple_revocations AS apple_row
         WHERE apple_row.request_id = v_existing.id
      ), 'retry_pending')
    );
  END IF;

  INSERT INTO public.agrorumo_account_deletion_challenges (
    id, subject_ref, initial_session_ref, secret_digest,
    confirmation_version, created_at, reauthentication_not_before_at, expires_at
  ) VALUES (
    p_challenge_id,
    v_subject_ref,
    public.agrorumo_deletion_session_ref(p_initial_session_id),
    p_secret_digest,
    p_confirmation_version,
    v_now,
    v_reauthentication_not_before_at,
    v_expires_at
  )
  ON CONFLICT (subject_ref) DO UPDATE
    SET id = EXCLUDED.id,
        initial_session_ref = EXCLUDED.initial_session_ref,
        secret_digest = EXCLUDED.secret_digest,
        confirmation_version = EXCLUDED.confirmation_version,
        created_at = EXCLUDED.created_at,
        reauthentication_not_before_at = EXCLUDED.reauthentication_not_before_at,
        expires_at = EXCLUDED.expires_at;

  RETURN jsonb_build_object(
    'state', 'challenge_created',
    'challenge_id', p_challenge_id,
    'reauthentication_not_before_at', v_reauthentication_not_before_at,
    'expires_at', v_expires_at,
    'confirmation_version', p_confirmation_version
  );
END;
$$;
REVOKE ALL ON FUNCTION public.begin_agrorumo_account_deletion_challenge(
  uuid, uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_agrorumo_account_deletion_challenge(
  uuid, uuid, uuid, text, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_agrorumo_account_deletion_request(
  p_user_id uuid,
  p_current_session_id uuid,
  p_current_session_issued_at timestamptz,
  p_reauthentication_at timestamptz,
  p_challenge_id uuid,
  p_challenge_secret_digest text,
  p_confirmation_version text,
  p_reauthentication_method text,
  p_has_apple_authorization_code boolean,
  p_apple_authorization_code_digest text,
  p_idempotency_key uuid,
  p_receipt_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_subject_ref text;
  v_current_session_ref text;
  v_challenge public.agrorumo_account_deletion_challenges%ROWTYPE;
  v_request public.agrorumo_account_deletion_requests%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_has_apple_identity boolean;
  v_apple_state text;
  v_apple_error text;
BEGIN
  IF p_user_id IS NULL OR p_current_session_id IS NULL
     OR p_current_session_issued_at IS NULL OR p_reauthentication_at IS NULL
     OR p_challenge_id IS NULL
     OR p_challenge_secret_digest !~ '^[0-9a-f]{64}$'
     OR p_confirmation_version <> 'agrorumo-global-account-deletion/2026-07-16.1'
     OR p_reauthentication_method NOT IN ('password', 'oauth', 'otp', 'sso', 'mfa')
     OR p_has_apple_authorization_code IS NULL
     OR (p_has_apple_authorization_code
       AND p_apple_authorization_code_digest !~ '^[0-9a-f]{64}$')
     OR (NOT p_has_apple_authorization_code
       AND p_apple_authorization_code_digest IS NOT NULL)
     OR p_idempotency_key IS NULL OR p_receipt_id IS NULL
  THEN
    RAISE EXCEPTION 'invalid_global_deletion_confirmation';
  END IF;

  v_subject_ref := public.agrorumo_deletion_subject_ref(p_user_id);
  v_current_session_ref := public.agrorumo_deletion_session_ref(p_current_session_id);
  -- This is the canonical account lock already used by link, reactivation and
  -- cleanup. Taking it before writing the global request makes every ordering
  -- converge to a suspended link and revoked push state.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('pragas-account:' || p_user_id::text, 0)
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended('agrorumo-global-deletion:' || v_subject_ref, 0)
  );

  -- A transport retry after COMMIT must recover the original receipt even
  -- though the one-time challenge is already consumed. Only the exact same
  -- subject + idempotency key is replayable.
  SELECT * INTO v_request
    FROM public.agrorumo_account_deletion_requests AS request_row
   WHERE request_row.subject_ref = v_subject_ref
   FOR UPDATE;
  IF FOUND THEN
    IF v_request.idempotency_key IS DISTINCT FROM p_idempotency_key THEN
      RAISE EXCEPTION 'global_deletion_idempotency_conflict';
    END IF;
    RETURN jsonb_build_object(
      'state', 'already_requested',
      'receipt_id', v_request.receipt_id,
      'status', v_request.status,
      'requested_at', v_request.requested_at,
      'due_at', v_request.due_at,
      'pragas_access_suspended', true,
      'pragas_push_revoked', true,
      'app_cleanup_state', v_request.app_cleanup_state,
      'apple_authorization_status', coalesce((
        SELECT CASE
          WHEN apple_row.state = 'revoked' THEN 'revoked'
          WHEN apple_row.state = 'not_required' THEN 'not_required'
          ELSE 'retry_pending'
        END
          FROM public.agrorumo_account_deletion_apple_revocations AS apple_row
         WHERE apple_row.request_id = v_request.id
      ), 'retry_pending'),
      'manual_global_processing', true,
      'global_identity_deleted', false
    );
  END IF;
  IF EXISTS (
    SELECT 1
      FROM public.agrorumo_account_deletion_requests AS request_row
     WHERE request_row.idempotency_key = p_idempotency_key
  ) THEN
    RAISE EXCEPTION 'global_deletion_idempotency_conflict';
  END IF;

  SELECT * INTO v_challenge
    FROM public.agrorumo_account_deletion_challenges AS challenge_row
   WHERE challenge_row.id = p_challenge_id
   FOR UPDATE;
  IF NOT FOUND
     OR v_challenge.subject_ref IS DISTINCT FROM v_subject_ref
     OR v_challenge.secret_digest IS DISTINCT FROM p_challenge_secret_digest
     OR v_challenge.confirmation_version IS DISTINCT FROM p_confirmation_version
     OR v_challenge.expires_at <= v_now
  THEN
    RAISE EXCEPTION 'global_deletion_challenge_invalid_or_expired';
  END IF;
  IF v_challenge.initial_session_ref = v_current_session_ref
     -- The not-before boundary is the first whole second strictly after the
     -- challenge was created. Equality is safe because JWT claims cannot
     -- represent any instant between created_at and that boundary.
     OR p_current_session_issued_at < v_challenge.reauthentication_not_before_at
     OR p_current_session_issued_at > v_now + interval '1 minute'
     OR p_reauthentication_at < v_challenge.reauthentication_not_before_at
     OR p_reauthentication_at > v_now + interval '1 minute'
  THEN
    RAISE EXCEPTION 'fresh_reauthentication_required';
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM auth.identities AS identity_row
     WHERE identity_row.user_id = p_user_id
       AND identity_row.provider = 'apple'
  ) INTO v_has_apple_identity;
  IF NOT v_has_apple_identity AND p_has_apple_authorization_code THEN
    RAISE EXCEPTION 'unexpected_apple_authorization_code';
  END IF;
  v_apple_state := CASE
    WHEN NOT v_has_apple_identity THEN 'not_required'
    WHEN p_has_apple_authorization_code THEN 'reserved'
    ELSE 'retry_pending'
  END;
  v_apple_error := CASE
    WHEN v_has_apple_identity AND NOT p_has_apple_authorization_code
      THEN 'apple_authorization_code_missing'
    ELSE NULL
  END;

  INSERT INTO public.agrorumo_account_deletion_requests (
    subject_ref, receipt_id, idempotency_key, status,
    scope_version, confirmation_version, reauthentication_method,
    reauthenticated_at, apple_authorization_revoked_at,
    requested_at, due_at, pragas_access_suspended_at,
    pragas_push_revoked_at, app_cleanup_state, last_status_at
  ) VALUES (
    v_subject_ref,
    p_receipt_id,
    p_idempotency_key,
    'requested_manual_review',
    'agrorumo-entire-account/2026-07-16.1',
    p_confirmation_version,
    p_reauthentication_method,
    p_reauthentication_at,
    NULL,
    v_now,
    v_now + interval '15 days',
    v_now,
    v_now,
    'queued',
    v_now
  ) RETURNING * INTO v_request;

  INSERT INTO public.agrorumo_account_deletion_apple_revocations (
    request_id, state, authorization_code_digest, last_error_code,
    created_at, updated_at
  ) VALUES (
    v_request.id,
    v_apple_state,
    p_apple_authorization_code_digest,
    v_apple_error,
    v_now,
    v_now
  );

  -- Reuse the existing app-scoped cleanup queue. It removes only data proven
  -- to belong to Rumo Pragas and never deletes the shared auth identity.
  INSERT INTO public.pragas_deletion_jobs (user_id, status, next_attempt_at)
  VALUES (p_user_id, 'requested', v_now)
  ON CONFLICT (user_id) DO UPDATE
    SET status = CASE
          WHEN public.pragas_deletion_jobs.status = 'reactivated' THEN 'requested'
          ELSE public.pragas_deletion_jobs.status
        END,
        attempts = CASE
          WHEN public.pragas_deletion_jobs.status = 'reactivated' THEN 0
          ELSE public.pragas_deletion_jobs.attempts
        END,
        next_attempt_at = CASE
          WHEN public.pragas_deletion_jobs.status = 'reactivated' THEN v_now
          ELSE public.pragas_deletion_jobs.next_attempt_at
        END,
        requested_at = CASE
          WHEN public.pragas_deletion_jobs.status = 'reactivated' THEN v_now
          ELSE public.pragas_deletion_jobs.requested_at
        END,
        app_cleanup_completed_at = CASE
          WHEN public.pragas_deletion_jobs.status = 'reactivated' THEN NULL
          ELSE public.pragas_deletion_jobs.app_cleanup_completed_at
        END,
        reactivated_at = CASE
          WHEN public.pragas_deletion_jobs.status = 'reactivated' THEN NULL
          ELSE public.pragas_deletion_jobs.reactivated_at
        END,
        reactivation_request_id = CASE
          WHEN public.pragas_deletion_jobs.status = 'reactivated' THEN NULL
          ELSE public.pragas_deletion_jobs.reactivation_request_id
        END,
        reactivation_idempotency_key = CASE
          WHEN public.pragas_deletion_jobs.status = 'reactivated' THEN NULL
          ELSE public.pragas_deletion_jobs.reactivation_idempotency_key
        END,
        lease_token = CASE
          WHEN public.pragas_deletion_jobs.status = 'reactivated' THEN NULL
          ELSE public.pragas_deletion_jobs.lease_token
        END,
        lease_expires_at = CASE
          WHEN public.pragas_deletion_jobs.status = 'reactivated' THEN NULL
          ELSE public.pragas_deletion_jobs.lease_expires_at
        END;

  UPDATE public.pragas_app_links
     SET active = false,
         deactivated_at = coalesce(deactivated_at, v_now),
         last_linked_at = v_now
   WHERE user_id = p_user_id;
  UPDATE public.pragas_push_tokens
     SET is_active = false,
         notifications_enabled = false,
         revoked_at = coalesce(revoked_at, v_now),
         updated_at = v_now
   WHERE user_id = p_user_id;
  IF to_regclass('public.pragas_notification_queue') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.pragas_notification_queue WHERE owner_user_id = $1'
      USING p_user_id;
  END IF;

  DELETE FROM public.agrorumo_account_deletion_challenges
   WHERE id = v_challenge.id;

  INSERT INTO public.agrorumo_account_deletion_events (
    request_id, event_type, from_status, to_status, detail_code, occurred_at
  ) VALUES
    (
      v_request.id,
      'request_accepted',
      NULL,
      v_request.status,
      'fresh_reauthentication_and_global_confirmation_verified',
      v_now
    ),
    (
      v_request.id,
      'apple_revocation_state_changed',
      NULL,
      v_apple_state,
      coalesce(v_apple_error, 'apple_revocation_reservation_recorded'),
      v_now
    );

  RETURN jsonb_build_object(
    'state', 'requested',
    'receipt_id', v_request.receipt_id,
    'status', v_request.status,
    'requested_at', v_request.requested_at,
    'due_at', v_request.due_at,
    'pragas_access_suspended', true,
    'pragas_push_revoked', true,
    'app_cleanup_state', v_request.app_cleanup_state,
    'apple_authorization_status', CASE
      WHEN v_apple_state = 'not_required' THEN 'not_required'
      ELSE 'retry_pending'
    END,
    'manual_global_processing', true,
    'global_identity_deleted', false
  );
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_agrorumo_account_deletion_request(
  uuid, uuid, timestamptz, timestamptz, uuid, text, text, text,
  boolean, text, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_agrorumo_account_deletion_request(
  uuid, uuid, timestamptz, timestamptz, uuid, text, text, text,
  boolean, text, uuid, uuid
) TO service_role;

-- Resolve the durable reservation on transport replay. Apple work may then
-- resume from its separately persisted state machine.
CREATE OR REPLACE FUNCTION public.get_agrorumo_account_deletion_replay(
  p_user_id uuid,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_subject_ref text;
  v_request public.agrorumo_account_deletion_requests%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'invalid_global_deletion_replay_lookup';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('pragas-account:' || p_user_id::text, 0)
  );
  v_subject_ref := public.agrorumo_deletion_subject_ref(p_user_id);
  SELECT * INTO v_request
    FROM public.agrorumo_account_deletion_requests AS request_row
   WHERE request_row.subject_ref = v_subject_ref;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('state', 'not_found');
  END IF;
  IF v_request.idempotency_key IS DISTINCT FROM p_idempotency_key THEN
    RAISE EXCEPTION 'global_deletion_idempotency_conflict';
  END IF;
  RETURN jsonb_build_object(
    'state', 'already_requested',
    'receipt_id', v_request.receipt_id,
    'status', v_request.status,
    'requested_at', v_request.requested_at,
    'due_at', v_request.due_at,
    'pragas_access_suspended', true,
    'pragas_push_revoked', true,
    'app_cleanup_state', v_request.app_cleanup_state,
    'apple_authorization_status', coalesce((
      SELECT CASE
        WHEN apple_row.state = 'revoked' THEN 'revoked'
        WHEN apple_row.state = 'not_required' THEN 'not_required'
        ELSE 'retry_pending'
      END
        FROM public.agrorumo_account_deletion_apple_revocations AS apple_row
       WHERE apple_row.request_id = v_request.id
    ), 'retry_pending'),
    'manual_global_processing', true,
    'global_identity_deleted', false
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_agrorumo_account_deletion_replay(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_agrorumo_account_deletion_replay(uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.begin_agrorumo_apple_revocation_attempt(
  p_user_id uuid,
  p_idempotency_key uuid,
  p_authorization_code_digest text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_subject_ref text;
  v_request public.agrorumo_account_deletion_requests%ROWTYPE;
  v_apple public.agrorumo_account_deletion_apple_revocations%ROWTYPE;
  v_from_state text;
  v_attempt_token uuid;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_user_id IS NULL OR p_idempotency_key IS NULL
     OR (p_authorization_code_digest IS NOT NULL
       AND p_authorization_code_digest !~ '^[0-9a-f]{64}$')
  THEN
    RAISE EXCEPTION 'invalid_apple_revocation_attempt';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('pragas-account:' || p_user_id::text, 0)
  );
  v_subject_ref := public.agrorumo_deletion_subject_ref(p_user_id);
  SELECT * INTO v_request
    FROM public.agrorumo_account_deletion_requests AS request_row
   WHERE request_row.subject_ref = v_subject_ref
   FOR UPDATE;
  IF NOT FOUND OR v_request.idempotency_key IS DISTINCT FROM p_idempotency_key THEN
    RAISE EXCEPTION 'global_deletion_idempotency_conflict';
  END IF;
  SELECT * INTO STRICT v_apple
    FROM public.agrorumo_account_deletion_apple_revocations AS apple_row
   WHERE apple_row.request_id = v_request.id
   FOR UPDATE;

  IF v_apple.state IN ('not_required', 'revoked') THEN
    RETURN jsonb_build_object(
      'action', 'none',
      'apple_authorization_status', v_apple.state
    );
  END IF;
  IF v_apple.state IN ('exchange_in_progress', 'revocation_in_progress')
     AND v_apple.lease_expires_at > v_now
  THEN
    RETURN jsonb_build_object(
      'action', 'wait',
      'retry_after_seconds', greatest(
        1,
        ceil(extract(epoch FROM (v_apple.lease_expires_at - v_now)))::integer
      ),
      'apple_authorization_status', 'retry_pending'
    );
  END IF;
  IF v_apple.token_vault_secret_id IS NOT NULL THEN
    v_from_state := v_apple.state;
    v_attempt_token := gen_random_uuid();
    UPDATE public.agrorumo_account_deletion_apple_revocations AS apple_row
       SET state = 'revocation_in_progress',
           attempt_token = v_attempt_token,
           lease_expires_at = v_now + interval '2 minutes',
           attempt_count = attempt_count + 1,
           last_error_code = NULL,
           last_attempt_at = v_now,
           updated_at = v_now
     WHERE apple_row.request_id = v_request.id;
    INSERT INTO public.agrorumo_account_deletion_events (
      request_id, event_type, from_status, to_status, detail_code, occurred_at
    ) VALUES (
      v_request.id, 'apple_revocation_state_changed', v_from_state,
      'revocation_in_progress', 'apple_revocation_attempt_started', v_now
    );
    RETURN jsonb_build_object(
      'action', 'revoke_token',
      'attempt_token', v_attempt_token,
      'apple_authorization_status', 'retry_pending'
    );
  END IF;
  IF p_authorization_code_digest IS NULL THEN
    v_from_state := v_apple.state;
    UPDATE public.agrorumo_account_deletion_apple_revocations AS apple_row
       SET state = 'retry_pending',
           attempt_token = NULL,
           lease_expires_at = NULL,
           last_error_code = 'apple_authorization_code_missing',
           updated_at = v_now
     WHERE apple_row.request_id = v_request.id;
    IF v_from_state IS DISTINCT FROM 'retry_pending'
       OR v_apple.last_error_code IS DISTINCT FROM 'apple_authorization_code_missing'
    THEN
      INSERT INTO public.agrorumo_account_deletion_events (
        request_id, event_type, from_status, to_status, detail_code, occurred_at
      ) VALUES (
        v_request.id, 'apple_revocation_state_changed', v_from_state,
        'retry_pending', 'apple_authorization_code_missing', v_now
      );
    END IF;
    RETURN jsonb_build_object(
      'action', 'needs_authorization_code',
      'apple_authorization_status', 'retry_pending'
    );
  END IF;

  v_from_state := v_apple.state;
  v_attempt_token := gen_random_uuid();
  UPDATE public.agrorumo_account_deletion_apple_revocations AS apple_row
     SET state = 'exchange_in_progress',
         authorization_code_digest = p_authorization_code_digest,
         attempt_token = v_attempt_token,
         lease_expires_at = v_now + interval '2 minutes',
         attempt_count = attempt_count + 1,
         last_error_code = NULL,
         last_attempt_at = v_now,
         updated_at = v_now
   WHERE apple_row.request_id = v_request.id;
  INSERT INTO public.agrorumo_account_deletion_events (
    request_id, event_type, from_status, to_status, detail_code, occurred_at
  ) VALUES (
    v_request.id, 'apple_revocation_state_changed', v_from_state,
    'exchange_in_progress', 'apple_authorization_exchange_started', v_now
  );
  RETURN jsonb_build_object(
    'action', 'exchange_code',
    'attempt_token', v_attempt_token,
    'apple_authorization_status', 'retry_pending'
  );
END;
$$;
REVOKE ALL ON FUNCTION public.begin_agrorumo_apple_revocation_attempt(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_agrorumo_apple_revocation_attempt(uuid, uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.store_agrorumo_apple_revocation_token(
  p_user_id uuid,
  p_idempotency_key uuid,
  p_attempt_token uuid,
  p_authorization_code_digest text,
  p_refresh_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_subject_ref text;
  v_request public.agrorumo_account_deletion_requests%ROWTYPE;
  v_apple public.agrorumo_account_deletion_apple_revocations%ROWTYPE;
  v_secret_id uuid;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_user_id IS NULL OR p_idempotency_key IS NULL OR p_attempt_token IS NULL
     OR p_authorization_code_digest !~ '^[0-9a-f]{64}$'
     OR p_refresh_token IS NULL
     OR octet_length(p_refresh_token) NOT BETWEEN 16 AND 8192
     OR p_refresh_token ~ '[[:cntrl:]]'
  THEN
    RAISE EXCEPTION 'invalid_apple_revocation_token';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('pragas-account:' || p_user_id::text, 0)
  );
  v_subject_ref := public.agrorumo_deletion_subject_ref(p_user_id);
  SELECT * INTO v_request
    FROM public.agrorumo_account_deletion_requests AS request_row
   WHERE request_row.subject_ref = v_subject_ref
   FOR UPDATE;
  IF NOT FOUND OR v_request.idempotency_key IS DISTINCT FROM p_idempotency_key THEN
    RAISE EXCEPTION 'global_deletion_idempotency_conflict';
  END IF;
  SELECT * INTO STRICT v_apple
    FROM public.agrorumo_account_deletion_apple_revocations AS apple_row
   WHERE apple_row.request_id = v_request.id
   FOR UPDATE;
  IF v_apple.state = 'revoked' THEN
    RETURN jsonb_build_object('stored', false, 'apple_authorization_status', 'revoked');
  END IF;
  IF v_apple.state = 'token_ready'
     AND v_apple.token_vault_secret_id IS NOT NULL
     AND v_apple.authorization_code_digest IS NOT DISTINCT FROM p_authorization_code_digest
  THEN
    RETURN jsonb_build_object('stored', true, 'apple_authorization_status', 'retry_pending');
  END IF;
  IF v_apple.state <> 'exchange_in_progress'
     OR v_apple.attempt_token IS DISTINCT FROM p_attempt_token
     OR v_apple.authorization_code_digest IS DISTINCT FROM p_authorization_code_digest
  THEN
    RAISE EXCEPTION 'apple_revocation_exchange_not_reserved';
  END IF;

  v_secret_id := vault.create_secret(
    p_refresh_token,
    NULL,
    'Agrorumo account deletion Apple refresh token; ephemeral and operator-invisible',
    NULL
  );
  IF v_apple.token_vault_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_apple.token_vault_secret_id;
  END IF;
  UPDATE public.agrorumo_account_deletion_apple_revocations AS apple_row
     SET state = 'token_ready',
         token_vault_secret_id = v_secret_id,
         attempt_token = NULL,
         lease_expires_at = NULL,
         last_error_code = NULL,
         updated_at = v_now
   WHERE apple_row.request_id = v_request.id;
  INSERT INTO public.agrorumo_account_deletion_events (
    request_id, event_type, from_status, to_status, detail_code, occurred_at
  ) VALUES (
    v_request.id, 'apple_revocation_state_changed', v_apple.state,
    'token_ready', 'apple_refresh_token_encrypted_in_vault', v_now
  );
  RETURN jsonb_build_object('stored', true, 'apple_authorization_status', 'retry_pending');
END;
$$;
REVOKE ALL ON FUNCTION public.store_agrorumo_apple_revocation_token(
  uuid, uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_agrorumo_apple_revocation_token(
  uuid, uuid, uuid, text, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_agrorumo_apple_revocation_token(
  p_user_id uuid,
  p_idempotency_key uuid,
  p_attempt_token uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_subject_ref text;
  v_request public.agrorumo_account_deletion_requests%ROWTYPE;
  v_apple public.agrorumo_account_deletion_apple_revocations%ROWTYPE;
  v_token text;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_user_id IS NULL OR p_idempotency_key IS NULL OR p_attempt_token IS NULL THEN
    RAISE EXCEPTION 'invalid_apple_revocation_token_claim';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('pragas-account:' || p_user_id::text, 0)
  );
  v_subject_ref := public.agrorumo_deletion_subject_ref(p_user_id);
  SELECT * INTO v_request
    FROM public.agrorumo_account_deletion_requests AS request_row
   WHERE request_row.subject_ref = v_subject_ref
   FOR UPDATE;
  IF NOT FOUND OR v_request.idempotency_key IS DISTINCT FROM p_idempotency_key THEN
    RAISE EXCEPTION 'global_deletion_idempotency_conflict';
  END IF;
  SELECT * INTO STRICT v_apple
    FROM public.agrorumo_account_deletion_apple_revocations AS apple_row
   WHERE apple_row.request_id = v_request.id
   FOR UPDATE;
  IF v_apple.state = 'revoked' THEN
    RETURN NULL;
  END IF;
  IF v_apple.state <> 'revocation_in_progress'
     OR v_apple.attempt_token IS DISTINCT FROM p_attempt_token
     OR v_apple.token_vault_secret_id IS NULL
  THEN
    RAISE EXCEPTION 'apple_revocation_attempt_not_owned';
  END IF;
  SELECT secret_row.decrypted_secret INTO v_token
    FROM vault.decrypted_secrets AS secret_row
   WHERE secret_row.id = v_apple.token_vault_secret_id;
  IF v_token IS NULL OR octet_length(v_token) NOT BETWEEN 16 AND 8192 THEN
    UPDATE public.agrorumo_account_deletion_apple_revocations AS apple_row
       SET state = 'retry_pending',
           token_vault_secret_id = NULL,
           attempt_token = NULL,
           lease_expires_at = NULL,
           last_error_code = 'apple_vault_token_unavailable',
           updated_at = v_now
     WHERE apple_row.request_id = v_request.id;
    INSERT INTO public.agrorumo_account_deletion_events (
      request_id, event_type, from_status, to_status, detail_code, occurred_at
    ) VALUES (
      v_request.id, 'apple_revocation_state_changed', v_apple.state,
      'retry_pending', 'apple_vault_token_unavailable', v_now
    );
    RETURN NULL;
  END IF;
  RETURN v_token;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_agrorumo_apple_revocation_token(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_agrorumo_apple_revocation_token(uuid, uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.record_agrorumo_apple_revocation_result(
  p_user_id uuid,
  p_idempotency_key uuid,
  p_attempt_token uuid,
  p_outcome text,
  p_detail_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_subject_ref text;
  v_request public.agrorumo_account_deletion_requests%ROWTYPE;
  v_apple public.agrorumo_account_deletion_apple_revocations%ROWTYPE;
  v_target_state text;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_user_id IS NULL OR p_idempotency_key IS NULL OR p_attempt_token IS NULL
     OR p_outcome NOT IN ('revoked', 'retry_pending')
     OR p_detail_code !~ '^[a-z0-9_]{1,80}$'
  THEN
    RAISE EXCEPTION 'invalid_apple_revocation_result';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('pragas-account:' || p_user_id::text, 0)
  );
  v_subject_ref := public.agrorumo_deletion_subject_ref(p_user_id);
  SELECT * INTO v_request
    FROM public.agrorumo_account_deletion_requests AS request_row
   WHERE request_row.subject_ref = v_subject_ref
   FOR UPDATE;
  IF NOT FOUND OR v_request.idempotency_key IS DISTINCT FROM p_idempotency_key THEN
    RAISE EXCEPTION 'global_deletion_idempotency_conflict';
  END IF;
  SELECT * INTO STRICT v_apple
    FROM public.agrorumo_account_deletion_apple_revocations AS apple_row
   WHERE apple_row.request_id = v_request.id
   FOR UPDATE;
  IF v_apple.state = 'not_required' THEN
    RETURN jsonb_build_object('apple_authorization_status', 'not_required');
  END IF;
  IF v_apple.state = 'revoked' THEN
    RETURN jsonb_build_object('apple_authorization_status', 'revoked');
  END IF;
  IF v_apple.state NOT IN ('exchange_in_progress', 'revocation_in_progress')
     OR v_apple.attempt_token IS DISTINCT FROM p_attempt_token
     OR (p_outcome = 'revoked' AND v_apple.state <> 'revocation_in_progress')
  THEN
    RAISE EXCEPTION 'apple_revocation_attempt_not_owned';
  END IF;

  v_target_state := p_outcome;
  IF p_outcome = 'revoked' THEN
    UPDATE public.agrorumo_account_deletion_requests AS request_row
       SET apple_authorization_revoked_at = coalesce(
             request_row.apple_authorization_revoked_at,
             v_now
           ),
           last_status_at = v_now
     WHERE request_row.id = v_request.id;
    IF v_apple.token_vault_secret_id IS NOT NULL THEN
      DELETE FROM vault.secrets WHERE id = v_apple.token_vault_secret_id;
    END IF;
    UPDATE public.agrorumo_account_deletion_apple_revocations AS apple_row
       SET state = 'revoked',
           authorization_code_digest = NULL,
           token_vault_secret_id = NULL,
           attempt_token = NULL,
           lease_expires_at = NULL,
           last_error_code = NULL,
           revoked_at = v_now,
           updated_at = v_now
     WHERE apple_row.request_id = v_request.id;
  ELSE
    UPDATE public.agrorumo_account_deletion_apple_revocations AS apple_row
       SET state = 'retry_pending',
           attempt_token = NULL,
           lease_expires_at = NULL,
           last_error_code = p_detail_code,
           updated_at = v_now
     WHERE apple_row.request_id = v_request.id;
  END IF;
  INSERT INTO public.agrorumo_account_deletion_events (
    request_id, event_type, from_status, to_status, detail_code, occurred_at
  ) VALUES (
    v_request.id, 'apple_revocation_state_changed', v_apple.state,
    v_target_state, p_detail_code, v_now
  );
  RETURN jsonb_build_object('apple_authorization_status', p_outcome);
END;
$$;
REVOKE ALL ON FUNCTION public.record_agrorumo_apple_revocation_result(
  uuid, uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_agrorumo_apple_revocation_result(
  uuid, uuid, uuid, text, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.get_agrorumo_account_deletion_app_gate(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = ''
AS $$
DECLARE
  v_global jsonb;
  v_app_status text;
  v_app_cleanup_completed_at timestamptz;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_global_deletion_app_gate_identity';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('pragas-account:' || p_user_id::text, 0)
  );
  SELECT jsonb_build_object(
    'found', true,
    'status', request_row.status,
    'due_at', request_row.due_at,
    'completed_at', request_row.completed_at
  ) INTO v_global
    FROM public.agrorumo_account_deletion_requests AS request_row
   WHERE request_row.subject_ref = public.agrorumo_deletion_subject_ref(p_user_id);
  IF v_global IS NOT NULL THEN RETURN v_global; END IF;

  SELECT deletion_row.status, deletion_row.app_cleanup_completed_at
    INTO v_app_status, v_app_cleanup_completed_at
    FROM public.pragas_deletion_jobs AS deletion_row
   WHERE deletion_row.user_id = p_user_id;
  RETURN jsonb_build_object(
    'found', false,
    'pragas_deletion_status', v_app_status,
    'pragas_app_cleanup_completed_at', v_app_cleanup_completed_at
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_agrorumo_account_deletion_app_gate(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_agrorumo_account_deletion_app_gate(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.consume_agrorumo_deletion_status_rate_limit(
  p_actor_key text,
  p_limit integer DEFAULT 30,
  p_window_seconds integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key bytea;
  v_actor_ref text;
  v_now timestamptz := clock_timestamp();
  v_started timestamptz;
  v_count integer;
  v_reset timestamptz;
BEGIN
  IF p_actor_key IS NULL OR char_length(p_actor_key) NOT BETWEEN 1 AND 512
     OR p_actor_key ~ '[[:cntrl:]]'
     OR p_limit NOT BETWEEN 1 AND 1000
     OR p_window_seconds NOT BETWEEN 10 AND 3600
  THEN
    RAISE EXCEPTION 'invalid_global_deletion_status_rate_limit';
  END IF;
  SELECT key_row.hmac_key INTO STRICT v_key
    FROM public.agrorumo_deletion_identity_keys AS key_row
   WHERE key_row.key_version = 1;
  v_actor_ref := pg_catalog.encode(
    extensions.hmac(
      pg_catalog.convert_to('status-actor:' || p_actor_key, 'UTF8'),
      v_key,
      'sha256'
    ),
    'hex'
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended('agrorumo-deletion-status:' || v_actor_ref, 0)
  );

  WITH stale AS (
    SELECT rate_row.actor_ref
      FROM public.agrorumo_deletion_status_rate_limits AS rate_row
     WHERE rate_row.updated_at < v_now - interval '2 days'
     ORDER BY rate_row.updated_at, rate_row.actor_ref
     FOR UPDATE SKIP LOCKED
     LIMIT 250
  )
  DELETE FROM public.agrorumo_deletion_status_rate_limits AS rate_row
   USING stale
   WHERE rate_row.actor_ref = stale.actor_ref;

  SELECT rate_row.window_started_at, rate_row.request_count
    INTO v_started, v_count
    FROM public.agrorumo_deletion_status_rate_limits AS rate_row
   WHERE rate_row.actor_ref = v_actor_ref
   FOR UPDATE;
  IF NOT FOUND OR v_started + make_interval(secs => p_window_seconds) <= v_now THEN
    v_started := v_now;
    v_count := 1;
    INSERT INTO public.agrorumo_deletion_status_rate_limits (
      actor_ref, window_started_at, request_count, updated_at
    ) VALUES (v_actor_ref, v_started, v_count, v_now)
    ON CONFLICT (actor_ref) DO UPDATE
      SET window_started_at = EXCLUDED.window_started_at,
          request_count = EXCLUDED.request_count,
          updated_at = EXCLUDED.updated_at;
  ELSE
    UPDATE public.agrorumo_deletion_status_rate_limits AS rate_row
       SET request_count = request_count + 1,
           updated_at = v_now
     WHERE rate_row.actor_ref = v_actor_ref
    RETURNING request_count INTO v_count;
  END IF;
  v_reset := v_started + make_interval(secs => p_window_seconds);
  RETURN jsonb_build_object(
    'allowed', v_count <= p_limit,
    'remaining', greatest(p_limit - v_count, 0),
    'reset_at', v_reset,
    'retry_after_seconds', greatest(
      0,
      ceil(extract(epoch FROM (v_reset - v_now)))::integer
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.consume_agrorumo_deletion_status_rate_limit(
  text, integer, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_agrorumo_deletion_status_rate_limit(
  text, integer, integer
) TO service_role;

CREATE OR REPLACE FUNCTION public.get_agrorumo_account_deletion_status(p_receipt_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'found', true,
    'status', request_row.status,
    'requested_at', request_row.requested_at,
    'due_at', request_row.due_at,
    'last_status_at', request_row.last_status_at,
    'completed_at', request_row.completed_at,
    'app_cleanup_state', request_row.app_cleanup_state,
    'apple_authorization_status', CASE
      WHEN apple_row.state = 'revoked' THEN 'revoked'
      WHEN apple_row.state = 'not_required' THEN 'not_required'
      ELSE 'retry_pending'
    END,
    'manual_global_processing', true
  )
    FROM public.agrorumo_account_deletion_requests AS request_row
    JOIN public.agrorumo_account_deletion_apple_revocations AS apple_row
      ON apple_row.request_id = request_row.id
   WHERE request_row.receipt_id = p_receipt_id
$$;
REVOKE ALL ON FUNCTION public.get_agrorumo_account_deletion_status(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_agrorumo_account_deletion_status(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.list_agrorumo_account_deletion_queue(
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  request_id uuid,
  receipt_id uuid,
  status text,
  requested_at timestamptz,
  due_at timestamptz,
  last_status_at timestamptz,
  app_cleanup_state text,
  legal_retention_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500
     OR (p_status IS NOT NULL AND p_status NOT IN (
       'requested_manual_review', 'in_review', 'processing',
       'needs_user_action', 'legal_retention_only', 'completed'
     ))
  THEN
    RAISE EXCEPTION 'invalid_global_deletion_queue_filter';
  END IF;
  RETURN QUERY
  SELECT request_row.id,
         request_row.receipt_id,
         request_row.status,
         request_row.requested_at,
         request_row.due_at,
         request_row.last_status_at,
         request_row.app_cleanup_state,
         request_row.legal_retention_code
    FROM public.agrorumo_account_deletion_requests AS request_row
   WHERE p_status IS NULL OR request_row.status = p_status
   ORDER BY request_row.due_at, request_row.requested_at, request_row.id
   LIMIT p_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.list_agrorumo_account_deletion_queue(text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_agrorumo_account_deletion_queue(text, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.resolve_agrorumo_account_deletion_subject(
  p_request_id uuid
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT auth_user.id
    FROM public.agrorumo_account_deletion_requests AS request_row
    JOIN auth.users AS auth_user
      ON public.agrorumo_deletion_subject_ref(auth_user.id) = request_row.subject_ref
   WHERE request_row.id = p_request_id
$$;
REVOKE ALL ON FUNCTION public.resolve_agrorumo_account_deletion_subject(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_agrorumo_account_deletion_subject(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.transition_agrorumo_account_deletion_request(
  p_request_id uuid,
  p_expected_status text,
  p_new_status text,
  p_detail_code text,
  p_operator_id uuid,
  p_app_cleanup_state text DEFAULT NULL,
  p_legal_retention_code text DEFAULT NULL,
  p_manual_evidence_digest text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request public.agrorumo_account_deletion_requests%ROWTYPE;
  v_apple_state text;
  v_app_job_status text;
  v_app_cleanup_completed_at timestamptz;
  v_user_id uuid;
  v_identity_key bytea;
  v_operator_ref text;
  v_effective_app_cleanup_state text;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_request_id IS NULL OR p_expected_status IS NULL OR p_operator_id IS NULL
     OR p_new_status NOT IN (
       'requested_manual_review', 'in_review', 'processing',
       'needs_user_action', 'legal_retention_only', 'completed'
     )
     OR p_detail_code !~ '^[a-z0-9_]{1,80}$'
     OR (p_app_cleanup_state IS NOT NULL
       AND p_app_cleanup_state NOT IN ('queued', 'processing', 'completed', 'retry'))
     OR (p_legal_retention_code IS NOT NULL
       AND p_legal_retention_code !~ '^[a-z0-9_]{1,80}$')
     OR (p_manual_evidence_digest IS NOT NULL
       AND p_manual_evidence_digest !~ '^[0-9a-f]{64}$')
  THEN
    RAISE EXCEPTION 'invalid_global_deletion_transition';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users AS operator_row WHERE operator_row.id = p_operator_id)
  THEN
    RAISE EXCEPTION 'global_deletion_operator_not_found';
  END IF;
  IF NOT (
    (p_expected_status = 'requested_manual_review'
      AND p_new_status IN ('in_review', 'needs_user_action'))
    OR (p_expected_status = 'needs_user_action' AND p_new_status = 'in_review')
    OR (p_expected_status = 'in_review'
      AND p_new_status IN ('processing', 'needs_user_action'))
    OR (p_expected_status = 'processing'
      AND p_new_status IN ('needs_user_action', 'legal_retention_only', 'completed'))
    OR (p_expected_status = 'legal_retention_only' AND p_new_status = 'completed')
  ) THEN
    RAISE EXCEPTION 'invalid_global_deletion_transition_graph';
  END IF;
  IF p_new_status = 'completed' AND (
    p_detail_code <> 'coordinated_erasure_evidence_verified'
    OR p_manual_evidence_digest IS NULL
    OR (p_app_cleanup_state IS NOT NULL AND p_app_cleanup_state <> 'completed')
  ) THEN
    RAISE EXCEPTION 'global_deletion_completion_evidence_required';
  END IF;
  IF p_new_status <> 'completed' AND p_manual_evidence_digest IS NOT NULL THEN
    RAISE EXCEPTION 'global_deletion_manual_evidence_only_on_completion';
  END IF;
  IF p_new_status = 'legal_retention_only' AND p_legal_retention_code IS NULL THEN
    RAISE EXCEPTION 'global_deletion_legal_retention_code_required';
  END IF;

  v_user_id := public.resolve_agrorumo_account_deletion_subject(p_request_id);
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'global_deletion_request_not_found';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('pragas-account:' || v_user_id::text, 0)
  );
  SELECT * INTO v_request
    FROM public.agrorumo_account_deletion_requests AS request_row
   WHERE request_row.id = p_request_id
   FOR UPDATE;
  IF NOT FOUND OR v_request.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION 'global_deletion_transition_conflict';
  END IF;

  IF p_new_status = 'completed' THEN
    SELECT apple_row.state INTO v_apple_state
      FROM public.agrorumo_account_deletion_apple_revocations AS apple_row
     WHERE apple_row.request_id = p_request_id
     FOR UPDATE;
    IF v_apple_state NOT IN ('revoked', 'not_required') THEN
      RAISE EXCEPTION 'global_deletion_apple_revocation_incomplete';
    END IF;
    SELECT deletion_row.status, deletion_row.app_cleanup_completed_at
      INTO v_app_job_status, v_app_cleanup_completed_at
      FROM public.pragas_deletion_jobs AS deletion_row
     WHERE deletion_row.user_id = v_user_id
     FOR UPDATE;
    IF v_app_job_status IS DISTINCT FROM 'blocked_global_decision'
       OR v_app_cleanup_completed_at IS NULL
    THEN
      RAISE EXCEPTION 'global_deletion_app_cleanup_not_completed';
    END IF;
    v_effective_app_cleanup_state := 'completed';
  ELSE
    v_effective_app_cleanup_state := coalesce(
      p_app_cleanup_state,
      v_request.app_cleanup_state
    );
  END IF;

  SELECT key_row.hmac_key INTO STRICT v_identity_key
    FROM public.agrorumo_deletion_identity_keys AS key_row
   WHERE key_row.key_version = 1;
  v_operator_ref := pg_catalog.encode(
    extensions.hmac(
      pg_catalog.convert_to('operator:' || p_operator_id::text, 'UTF8'),
      v_identity_key,
      'sha256'
    ),
    'hex'
  );
  UPDATE public.agrorumo_account_deletion_requests AS request_row
     SET status = p_new_status,
         app_cleanup_state = v_effective_app_cleanup_state,
         legal_retention_code = coalesce(
           p_legal_retention_code,
           request_row.legal_retention_code
         ),
         last_status_at = v_now,
         completed_at = CASE WHEN p_new_status = 'completed' THEN v_now ELSE NULL END
   WHERE request_row.id = p_request_id
     AND request_row.status = p_expected_status
  RETURNING * INTO v_request;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'global_deletion_transition_conflict';
  END IF;
  INSERT INTO public.agrorumo_account_deletion_events (
    request_id, event_type, from_status, to_status, detail_code,
    operator_ref, occurred_at
  ) VALUES (
    v_request.id, 'status_changed', p_expected_status, p_new_status,
    p_detail_code, v_operator_ref, v_now
  );
  IF p_new_status = 'completed' THEN
    INSERT INTO public.agrorumo_account_deletion_events (
      request_id, event_type, from_status, to_status, detail_code,
      operator_ref, evidence_digest, occurred_at
    ) VALUES (
      v_request.id, 'manual_evidence_recorded', p_expected_status, p_new_status,
      'coordinated_erasure_evidence_verified', v_operator_ref,
      p_manual_evidence_digest, v_now
    );
  END IF;
  RETURN jsonb_build_object(
    'request_id', v_request.id,
    'status', v_request.status,
    'due_at', v_request.due_at,
    'last_status_at', v_request.last_status_at,
    'completed_at', v_request.completed_at,
    'app_cleanup_state', v_request.app_cleanup_state
  );
END;
$$;
REVOKE ALL ON FUNCTION public.transition_agrorumo_account_deletion_request(
  uuid, text, text, text, uuid, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_agrorumo_account_deletion_request(
  uuid, text, text, text, uuid, text, text, text
) TO service_role;

-- The link RPC is the first app gate reached after every SIGNED_IN event. It
-- must observe the global queue under the canonical account lock before the
-- legacy app-deletion job can return a reactivation CTA or recreate rows.
CREATE OR REPLACE FUNCTION public.pragas_link_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $pragas_link_account_global_deletion_precedence_v1$
DECLARE
  v_user_id uuid := auth.uid();
  v_status text;
  v_subscription_status text;
  v_full_name text;
  v_already_linked boolean;
BEGIN
  -- pragas_link_account_global_deletion_precedence_v1
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('pragas-account:' || v_user_id::text, 0)
  );
  IF EXISTS (
    SELECT 1
      FROM public.agrorumo_account_deletion_requests AS request_row
     WHERE request_row.subject_ref = public.agrorumo_deletion_subject_ref(v_user_id)
  ) THEN
    RETURN jsonb_build_object(
      'linked', false,
      'app', 'rumo-pragas',
      'code', 'global_deletion_pending'
    );
  END IF;

  SELECT status INTO v_status
    FROM public.pragas_deletion_jobs
   WHERE user_id = v_user_id;
  IF v_status = 'blocked_global_decision' THEN
    RETURN jsonb_build_object(
      'linked', false, 'app', 'rumo-pragas',
      'code', 'deleted_reactivation_required'
    );
  ELSIF v_status IN ('requested', 'processing', 'retry') THEN
    RETURN jsonb_build_object(
      'linked', false, 'app', 'rumo-pragas', 'code', 'deletion_pending'
    );
  END IF;

  SELECT left(NULLIF(btrim(raw_user_meta_data ->> 'full_name'), ''), 200)
    INTO v_full_name
    FROM auth.users
   WHERE id = v_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'auth_identity_not_found'; END IF;

  INSERT INTO public.pragas_profiles (user_id, full_name)
  VALUES (v_user_id, v_full_name)
  ON CONFLICT (user_id) DO NOTHING;
  IF NOT EXISTS (
    SELECT 1 FROM public.pragas_profiles WHERE user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'pragas_profile_link_failed';
  END IF;

  INSERT INTO public.subscriptions (user_id, plan, status, provider, app)
  VALUES (v_user_id, 'free', 'active', 'free', 'rumo-pragas')
  ON CONFLICT (user_id, app) DO NOTHING;
  SELECT status INTO v_subscription_status
    FROM public.subscriptions
   WHERE user_id = v_user_id AND app = 'rumo-pragas';
  IF NOT FOUND THEN RAISE EXCEPTION 'pragas_subscription_link_failed'; END IF;
  IF v_subscription_status <> 'active' THEN
    RETURN jsonb_build_object(
      'linked', false, 'app', 'rumo-pragas', 'code', 'subscription_inactive'
    );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.pragas_app_links
     WHERE user_id = v_user_id AND active
  ) INTO v_already_linked;
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
    'linked', true, 'app', 'rumo-pragas',
    'code', CASE WHEN v_already_linked THEN 'already_linked' ELSE 'linked' END
  );
END;
$pragas_link_account_global_deletion_precedence_v1$;
REVOKE ALL ON FUNCTION public.pragas_link_account()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pragas_link_account() TO authenticated;

-- Serialize every authenticated Rumo Pragas write behind the same account lock
-- used by link/reactivation/cleanup. This replaces the pre-existing function
-- without changing its signature, so RLS policies and callers remain intact.
CREATE OR REPLACE FUNCTION public.pragas_current_link_allows_access()
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('pragas-account:' || v_user_id::text, 0)
  );
  IF EXISTS (
    SELECT 1
      FROM public.agrorumo_account_deletion_requests AS request_row
     WHERE request_row.subject_ref = public.agrorumo_deletion_subject_ref(v_user_id)
  ) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
      SELECT 1 FROM public.pragas_app_links
       WHERE user_id = v_user_id AND active
    )
    AND EXISTS (
      SELECT 1 FROM public.pragas_profiles
       WHERE user_id = v_user_id
    )
    AND EXISTS (
      SELECT 1 FROM public.subscriptions
       WHERE user_id = v_user_id AND app = 'rumo-pragas' AND status = 'active'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.pragas_deletion_jobs
       WHERE user_id = v_user_id AND status <> 'reactivated'
    );
END;
$$;
REVOKE ALL ON FUNCTION public.pragas_current_link_allows_access()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pragas_current_link_allows_access()
  TO authenticated;

-- A global request permanently blocks automatic Pragas relinking/reactivation.
-- The lock is taken before the visibility check: if confirmation wins, this
-- trigger waits and observes the committed request; if relinking wins, confirm
-- subsequently deactivates the row before it can commit.
CREATE OR REPLACE FUNCTION public.block_pragas_reactivation_during_global_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('pragas-account:' || NEW.user_id::text, 0)
  );
  IF NEW.active AND EXISTS (
    SELECT 1
      FROM public.agrorumo_account_deletion_requests AS request_row
     WHERE request_row.subject_ref = public.agrorumo_deletion_subject_ref(NEW.user_id)
  ) THEN
    RAISE EXCEPTION 'global_account_deletion_requested';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.block_pragas_reactivation_during_global_deletion()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS block_pragas_reactivation_during_global_deletion
  ON public.pragas_app_links;
CREATE TRIGGER block_pragas_reactivation_during_global_deletion
  BEFORE INSERT OR UPDATE OF active ON public.pragas_app_links
  FOR EACH ROW EXECUTE FUNCTION public.block_pragas_reactivation_during_global_deletion();

CREATE OR REPLACE FUNCTION public.block_pragas_push_enable_during_global_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('pragas-account:' || NEW.user_id::text, 0)
  );
  IF (NEW.is_active OR NEW.notifications_enabled) AND EXISTS (
    SELECT 1
      FROM public.agrorumo_account_deletion_requests AS request_row
     WHERE request_row.subject_ref = public.agrorumo_deletion_subject_ref(NEW.user_id)
  ) THEN
    RAISE EXCEPTION 'global_account_deletion_requested';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.block_pragas_push_enable_during_global_deletion()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS block_pragas_push_enable_during_global_deletion
  ON public.pragas_push_tokens;
CREATE TRIGGER block_pragas_push_enable_during_global_deletion
  BEFORE INSERT OR UPDATE OF is_active, notifications_enabled
  ON public.pragas_push_tokens
  FOR EACH ROW EXECUTE FUNCTION public.block_pragas_push_enable_during_global_deletion();

-- SECURITY DEFINER Edge/RPC paths bypass RLS. A bounded set of user-content
-- tables therefore receives the same fail-closed lock/check. DELETE is
-- deliberately excluded so cleanup_pragas_user_rows and portfolio erasure are
-- never blocked by the protection that prevents new data from appearing.
CREATE OR REPLACE FUNCTION public.block_pragas_user_mutation_during_global_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id_text text;
  v_user_id uuid;
BEGIN
  v_user_id_text := to_jsonb(NEW) ->> coalesce(TG_ARGV[0], 'user_id');
  IF v_user_id_text IS NULL OR v_user_id_text = '' THEN RETURN NEW; END IF;
  BEGIN
    v_user_id := v_user_id_text::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_pragas_mutation_identity';
  END;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('pragas-account:' || v_user_id::text, 0)
  );
  IF EXISTS (
    SELECT 1
      FROM public.agrorumo_account_deletion_requests AS request_row
     WHERE request_row.subject_ref = public.agrorumo_deletion_subject_ref(v_user_id)
  ) THEN
    RAISE EXCEPTION 'global_account_deletion_requested';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.block_pragas_user_mutation_during_global_deletion()
  FROM PUBLIC, anon, authenticated;

DO $global_deletion_user_mutation_triggers$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'pragas_profiles', 'pragas_diagnoses', 'pragas_diagnosis_feedback',
    'pragas_diagnosis_usage', 'pragas_chat_messages', 'pragas_ai_consents',
    'pragas_ai_content_reports', 'pragas_location_consent_decisions',
    'pragas_user_preferences', 'pragas_analytics', 'pragas_community_posts',
    'pragas_community_likes', 'pragas_post_likes', 'pragas_post_replies',
    'pragas_post_comments', 'pragas_reply_likes', 'pragas_outbreaks',
    'pragas_outbreak_confirmations', 'pragas_subscriptions'
  ]
  LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN CONTINUE; END IF;
    IF NOT EXISTS (
      SELECT 1
        FROM information_schema.columns AS column_row
       WHERE column_row.table_schema = 'public'
         AND column_row.table_name = v_table
         AND column_row.column_name = 'user_id'
         AND column_row.udt_name = 'uuid'
    ) THEN
      RAISE EXCEPTION 'global_deletion_mutation_trigger_schema_mismatch_%', v_table;
    END IF;
    EXECUTE format(
      'DROP TRIGGER IF EXISTS block_global_deletion_user_mutation ON public.%I',
      v_table
    );
    EXECUTE format(
      'CREATE TRIGGER block_global_deletion_user_mutation '
      || 'BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW '
      || 'EXECUTE FUNCTION public.block_pragas_user_mutation_during_global_deletion(''user_id'')',
      v_table
    );
  END LOOP;
END
$global_deletion_user_mutation_triggers$;

-- These two tables are written by SECURITY DEFINER/service_role paths and are
-- therefore outside authenticated RLS. Their row triggers take the same
-- canonical account lock as reservation and cleanup, closing both direct-table
-- and in-flight RPC writes after a durable global deletion request commits.
CREATE OR REPLACE FUNCTION public.block_pragas_service_write_during_global_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := NEW.user_id;
  -- A row with no subject cannot belong to an account under deletion; fail
  -- open exactly like the user-mutation trigger instead of raising on NULL.
  IF v_user_id IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'analytics_events'
     AND (to_jsonb(NEW) ->> 'app') IS DISTINCT FROM 'rumo-pragas'
  THEN
    RETURN NEW;
  END IF;
  -- Expiry scrubbing only removes a cached response and remains allowed. It
  -- cannot introduce new personal data or restart provider processing.
  IF TG_TABLE_NAME = 'pragas_ai_idempotency_records'
     AND TG_OP = 'UPDATE'
     AND (to_jsonb(OLD) ->> 'state') = 'completed'
     AND (to_jsonb(NEW) ->> 'state') = 'expired'
     AND (to_jsonb(NEW) ->> 'user_id') IS NOT DISTINCT FROM
       (to_jsonb(OLD) ->> 'user_id')
     AND (to_jsonb(NEW) ->> 'scope') IS NOT DISTINCT FROM
       (to_jsonb(OLD) ->> 'scope')
     AND (to_jsonb(NEW) ->> 'idempotency_key') IS NOT DISTINCT FROM
       (to_jsonb(OLD) ->> 'idempotency_key')
     AND (to_jsonb(NEW) ->> 'request_hash') IS NOT DISTINCT FROM
       (to_jsonb(OLD) ->> 'request_hash')
     AND (to_jsonb(NEW) -> 'response_status') = 'null'::jsonb
     AND (to_jsonb(NEW) -> 'response_body') = 'null'::jsonb
     AND (to_jsonb(NEW) -> 'lease_token') = 'null'::jsonb
     AND (to_jsonb(NEW) -> 'lease_expires_at') = 'null'::jsonb
  THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('pragas-account:' || v_user_id::text, 0)
  );
  IF EXISTS (
    SELECT 1
      FROM public.agrorumo_account_deletion_requests AS request_row
     WHERE request_row.subject_ref = public.agrorumo_deletion_subject_ref(v_user_id)
  ) THEN
    RAISE EXCEPTION 'global_account_deletion_requested';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.block_pragas_service_write_during_global_deletion()
  FROM PUBLIC, anon, authenticated;

DO $global_deletion_service_write_triggers$
BEGIN
  IF to_regclass('public.pragas_ai_idempotency_records') IS NULL
     OR to_regclass('public.analytics_events') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'pragas_ai_idempotency_records'
          AND column_name = 'user_id' AND udt_name = 'uuid'
     )
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'analytics_events'
          AND column_name = 'user_id' AND udt_name = 'uuid'
     )
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'analytics_events'
          AND column_name = 'app' AND udt_name = 'text'
     )
  THEN
    RAISE EXCEPTION 'global_deletion_service_write_schema_mismatch';
  END IF;
END
$global_deletion_service_write_triggers$;

DROP TRIGGER IF EXISTS block_global_deletion_service_write
  ON public.pragas_ai_idempotency_records;
CREATE TRIGGER block_global_deletion_service_write
  BEFORE INSERT OR UPDATE ON public.pragas_ai_idempotency_records
  FOR EACH ROW EXECUTE FUNCTION public.block_pragas_service_write_during_global_deletion();
DROP TRIGGER IF EXISTS block_global_deletion_service_write
  ON public.analytics_events;
CREATE TRIGGER block_global_deletion_service_write
  BEFORE INSERT OR UPDATE ON public.analytics_events
  FOR EACH ROW EXECUTE FUNCTION public.block_pragas_service_write_during_global_deletion();

-- No shared-project cron is installed implicitly. Operations runs this
-- bounded routine daily; each invocation is deterministic, lock-safe and can
-- be repeated. Durable requests/events are deliberately retained for the
-- documented legal/audit schedule and are never purged here.
CREATE OR REPLACE FUNCTION public.purge_agrorumo_account_deletion_ephemera(
  p_limit integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_challenges integer := 0;
  v_rate_limits integer := 0;
  v_apple_tokens integer := 0;
  v_row record;
  v_target_state text;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'invalid_global_deletion_ephemera_limit';
  END IF;
  WITH candidates AS (
    SELECT challenge_row.id
      FROM public.agrorumo_account_deletion_challenges AS challenge_row
     WHERE challenge_row.expires_at <= v_now
     ORDER BY challenge_row.expires_at, challenge_row.id
     FOR UPDATE SKIP LOCKED
     LIMIT p_limit
  )
  DELETE FROM public.agrorumo_account_deletion_challenges AS challenge_row
   USING candidates
   WHERE challenge_row.id = candidates.id;
  GET DIAGNOSTICS v_challenges = ROW_COUNT;

  WITH candidates AS (
    SELECT rate_row.actor_ref
      FROM public.agrorumo_deletion_status_rate_limits AS rate_row
     WHERE rate_row.updated_at < v_now - interval '2 days'
     ORDER BY rate_row.updated_at, rate_row.actor_ref
     FOR UPDATE SKIP LOCKED
     LIMIT p_limit
  )
  DELETE FROM public.agrorumo_deletion_status_rate_limits AS rate_row
   USING candidates
   WHERE rate_row.actor_ref = candidates.actor_ref;
  GET DIAGNOSTICS v_rate_limits = ROW_COUNT;

  FOR v_row IN
    SELECT apple_row.request_id,
           apple_row.state,
           apple_row.token_vault_secret_id
      FROM public.agrorumo_account_deletion_apple_revocations AS apple_row
      JOIN public.agrorumo_account_deletion_requests AS request_row
        ON request_row.id = apple_row.request_id
     WHERE apple_row.token_vault_secret_id IS NOT NULL
       AND (
         apple_row.state = 'revoked'
         OR request_row.status = 'completed'
         OR apple_row.updated_at < v_now - interval '30 days'
       )
     ORDER BY apple_row.updated_at, apple_row.request_id
     FOR UPDATE OF apple_row SKIP LOCKED
     LIMIT p_limit
  LOOP
    DELETE FROM vault.secrets WHERE id = v_row.token_vault_secret_id;
    v_target_state := CASE
      WHEN v_row.state = 'revoked' THEN 'revoked'
      ELSE 'retry_pending'
    END;
    UPDATE public.agrorumo_account_deletion_apple_revocations AS apple_row
       SET state = v_target_state,
           authorization_code_digest = NULL,
           token_vault_secret_id = NULL,
           attempt_token = NULL,
           lease_expires_at = NULL,
           last_error_code = CASE
             WHEN v_target_state = 'revoked' THEN NULL
             ELSE 'apple_token_retention_expired'
           END,
           updated_at = v_now
     WHERE apple_row.request_id = v_row.request_id;
    INSERT INTO public.agrorumo_account_deletion_events (
      request_id, event_type, from_status, to_status, detail_code, occurred_at
    ) VALUES (
      v_row.request_id, 'ephemeral_data_purged', v_row.state,
      v_target_state, 'apple_vault_token_purged_after_retention', v_now
    );
    v_apple_tokens := v_apple_tokens + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'expired_challenges_purged', v_challenges,
    'stale_rate_limits_purged', v_rate_limits,
    'apple_vault_tokens_purged', v_apple_tokens
  );
END;
$$;
REVOKE ALL ON FUNCTION public.purge_agrorumo_account_deletion_ephemera(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_agrorumo_account_deletion_ephemera(integer)
  TO service_role;

COMMENT ON TABLE public.agrorumo_account_deletion_requests IS
  'PII-minimized durable queue for individually confirmed whole-account deletion requests; coordinated manual processing only.';
COMMENT ON COLUMN public.agrorumo_account_deletion_requests.subject_ref IS
  'HMAC reference to auth.users.id; never a raw user UUID, email, phone or name.';
COMMENT ON COLUMN public.agrorumo_account_deletion_requests.receipt_id IS
  'Random opaque receipt identifier; contains no user identity.';
COMMENT ON TABLE public.agrorumo_account_deletion_apple_revocations IS
  'Crash-safe Apple revocation state; refresh tokens exist only encrypted inside Supabase Vault.';

COMMIT;
