-- Data-preserving runtime rollback for 20260714143000_pragas_backend_security.
--
-- This transaction disables migration-owned entry points and policies after
-- their dedicated Edge Functions have been disabled. It intentionally retains
-- every user row, consent, deletion marker, audit/rate/idempotency ledger,
-- private storage object, table, column, constraint and enum. A later forward
-- migration can therefore restore runtime behavior without data recovery.

BEGIN;

-- Fail before changing any object if this is not the expected candidate
-- schema. The transaction makes every subsequent DDL change all-or-nothing.
DO $$
DECLARE
  v_required text;
  v_required_procedure text;
BEGIN
  FOREACH v_required IN ARRAY ARRAY[
    'pragas_app_links',
    'pragas_user_preferences',
    'pragas_location_consent_decisions',
    'pragas_ai_content_reports',
    'pragas_ai_consents',
    'pragas_ai_idempotency_records',
    'pragas_api_rate_limit_events',
    'pragas_api_rate_limit_counters',
    'pragas_deletion_jobs',
    'pragas_push_notifications',
    'pragas_push_tokens'
  ]
  LOOP
    IF to_regclass(format('public.%I', v_required)) IS NULL THEN
      RAISE EXCEPTION 'pragas_rollback_preflight_missing_%', v_required;
    END IF;
  END LOOP;
  IF to_regtype('public.pragas_ai_report_status') IS NULL
     OR to_regtype('public.pragas_ai_report_reason') IS NULL
  THEN
    RAISE EXCEPTION 'pragas_rollback_preflight_missing_retained_type';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'pragas_deletion_jobs'
       AND column_name = 'status'
       AND data_type = 'text'
  ) OR NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.pragas_deletion_jobs'::regclass
       AND conname = 'pragas_deletion_jobs_status_check'
       AND pg_get_constraintdef(oid) LIKE '%requested%'
       AND pg_get_constraintdef(oid) LIKE '%processing%'
       AND pg_get_constraintdef(oid) LIKE '%retry%'
       AND pg_get_constraintdef(oid) LIKE '%blocked_global_decision%'
       AND pg_get_constraintdef(oid) LIKE '%reactivated%'
  ) THEN
    RAISE EXCEPTION 'pragas_rollback_preflight_invalid_deletion_state_contract';
  END IF;

  FOREACH v_required_procedure IN ARRAY ARRAY[
    'public.pragas_current_link_allows_access()',
    'public.pragas_link_account()',
    'public.set_pragas_location_consent(uuid,boolean,text,timestamp with time zone,bigint)',
    'public.touch_pragas_push_token(text,text,boolean)',
    'public.consume_pragas_api_rate_limit(uuid,text,integer,integer,uuid,text)',
    'public.consume_pragas_mcp_rate_limit(uuid,text)',
    'public.reserve_pragas_ai_idempotency(uuid,text,uuid,text)',
    'public.mark_pragas_ai_provider_started(uuid,text,uuid,text,uuid)',
    'public.complete_pragas_ai_idempotency(uuid,text,uuid,text,uuid,integer,jsonb,integer)',
    'public.claim_pragas_push_notification(uuid,text,text)',
    'public.mark_pragas_push_provider_started(uuid,text,uuid)',
    'public.cleanup_pragas_user_rows(uuid)'
  ]
  LOOP
    IF to_regprocedure(v_required_procedure) IS NULL THEN
      RAISE EXCEPTION 'pragas_rollback_preflight_missing_procedure_%',
        v_required_procedure;
    END IF;
  END LOOP;
END
$$;

-- Storage policies depend on the complete-link predicate and must go first.
-- Objects and the private bucket remain untouched.
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RETURN;
  END IF;
  DROP POLICY IF EXISTS pragas_avatars_select_own ON storage.objects;
  DROP POLICY IF EXISTS pragas_avatars_insert_own ON storage.objects;
  DROP POLICY IF EXISTS pragas_avatars_update_own ON storage.objects;
  DROP POLICY IF EXISTS pragas_avatars_delete_own ON storage.objects;
END
$$;

-- Remove only migration-owned runtime gates that call the link predicate.
DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'pragas_profiles', 'pragas_diagnoses', 'pragas_user_preferences',
    'pragas_ai_content_reports', 'pragas_diagnosis_feedback',
    'pragas_push_tokens', 'pragas_reply_likes', 'pragas_post_replies',
    'pragas_post_comments', 'pragas_post_likes', 'pragas_community_likes',
    'pragas_community_posts', 'pragas_outbreak_confirmations',
    'pragas_outbreaks', 'pragas_diagnosis_usage', 'pragas_chat_messages',
    'pragas_analytics', 'pragas_error_logs', 'pragas_api_rate_limit_events',
    'pragas_api_rate_limit_counters', 'pragas_subscriptions',
    'pragas_ai_consents', 'pragas_ai_idempotency_records',
    'subscriptions', 'chat_usage'
  ]
  LOOP
    IF to_regclass(format('public.%I', v_table)) IS NOT NULL THEN
      EXECUTE format(
        'DROP POLICY IF EXISTS pragas_active_link_restrict ON public.%I',
        v_table
      );
    END IF;
  END LOOP;
END
$$;

-- Detach only triggers whose helper is removed below. Touch triggers and their
-- helper remain because their retained tables still require timestamp upkeep.
DROP TRIGGER IF EXISTS pragas_profiles_sync_user_id ON public.pragas_profiles;
DROP TRIGGER IF EXISTS pragas_diagnosis_feedback_validate_owner
  ON public.pragas_diagnosis_feedback;

DROP FUNCTION IF EXISTS public.touch_pragas_push_token(text, text, boolean);
DROP FUNCTION IF EXISTS public.set_pragas_location_consent(
  uuid, boolean, text, timestamptz, bigint
);
DROP FUNCTION IF EXISTS public.grant_pragas_ai_consent(text, text);
DROP FUNCTION IF EXISTS public.revoke_pragas_ai_consent(text);
DROP FUNCTION IF EXISTS public.consume_pragas_mcp_rate_limit(uuid, text);
DROP FUNCTION IF EXISTS public.consume_pragas_mcp_rate_limit(uuid);
DROP FUNCTION IF EXISTS public.reactivate_pragas_account(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.pragas_link_account();
DROP FUNCTION IF EXISTS public.complete_pragas_deletion_job(uuid, uuid);
DROP FUNCTION IF EXISTS public.retry_pragas_deletion_job(uuid, uuid, text, timestamptz);
DROP FUNCTION IF EXISTS public.claim_pragas_deletion_job(uuid);
DROP FUNCTION IF EXISTS public.claim_pragas_deletion_jobs(integer);
DROP FUNCTION IF EXISTS public.request_pragas_account_deletion(uuid);
DROP FUNCTION IF EXISTS public.cleanup_pragas_user_rows(uuid);

DROP FUNCTION IF EXISTS public.mark_pragas_push_unknown_outcome(
  uuid, text, uuid, integer, integer, integer
);
DROP FUNCTION IF EXISTS public.complete_pragas_push_notification(
  uuid, text, uuid, text, integer, integer, integer
);
DROP FUNCTION IF EXISTS public.mark_pragas_push_provider_started(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.release_pragas_push_notification(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.claim_pragas_push_notification(uuid, text, text);

DROP FUNCTION IF EXISTS public.scrub_expired_pragas_ai_idempotency(integer);
DROP FUNCTION IF EXISTS public.mark_pragas_ai_unknown_outcome(
  uuid, text, uuid, text, uuid
);
DROP FUNCTION IF EXISTS public.release_pragas_ai_idempotency(
  uuid, text, uuid, text, uuid
);
DROP FUNCTION IF EXISTS public.release_pragas_ai_idempotency(uuid, text, uuid, text);
DROP FUNCTION IF EXISTS public.complete_pragas_ai_idempotency(
  uuid, text, uuid, text, uuid, integer, jsonb, integer
);
DROP FUNCTION IF EXISTS public.complete_pragas_ai_idempotency(
  uuid, text, uuid, text, integer, jsonb, integer
);
DROP FUNCTION IF EXISTS public.mark_pragas_ai_provider_started(
  uuid, text, uuid, text, uuid
);
DROP FUNCTION IF EXISTS public.reserve_pragas_ai_idempotency(uuid, text, uuid, text);
DROP FUNCTION IF EXISTS public.record_pragas_ai_consent(uuid, text, text);
DROP FUNCTION IF EXISTS public.record_pragas_analytics_events(uuid, jsonb);
DROP FUNCTION IF EXISTS public.consume_pragas_api_rate_limit(
  uuid, text, integer, integer, uuid, text
);
DROP FUNCTION IF EXISTS public.consume_pragas_api_rate_limit(
  uuid, text, integer, integer, uuid
);
DROP FUNCTION IF EXISTS public.transition_pragas_ai_content_report(
  uuid, public.pragas_ai_report_status, uuid, text
);
DROP FUNCTION IF EXISTS public.pragas_validate_diagnosis_feedback_owner();
DROP FUNCTION IF EXISTS public.pragas_profiles_sync_user_id();

-- All predicate-dependent functions are now detached. Data-bearing tables,
-- types, constraints, ledgers and the shared timestamp helper remain.
DROP FUNCTION IF EXISTS public.pragas_current_link_allows_access();

-- Restore the exact pre-candidate client surface. The data-bearing revision
-- column and decision ledger remain retained by this data-preserving rollback,
-- but authenticated clients again use the prior own-row RLS + table grants.
REVOKE ALL ON TABLE public.pragas_user_preferences FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.pragas_user_preferences TO authenticated;

COMMENT ON COLUMN public.pragas_profiles.avatar_path IS
  'Retained rollback compatibility column for private pragas-avatars objects.';

DO $$
DECLARE
  v_required text;
BEGIN
  FOREACH v_required IN ARRAY ARRAY[
    'pragas_app_links',
    'pragas_user_preferences',
    'pragas_location_consent_decisions',
    'pragas_ai_content_reports',
    'pragas_ai_consents',
    'pragas_ai_idempotency_records',
    'pragas_api_rate_limit_events',
    'pragas_api_rate_limit_counters',
    'pragas_deletion_jobs',
    'pragas_push_notifications',
    'pragas_push_tokens'
  ]
  LOOP
    IF to_regclass(format('public.%I', v_required)) IS NULL THEN
      RAISE EXCEPTION 'pragas_rollback_removed_data_table_%', v_required;
    END IF;
  END LOOP;
  IF to_regtype('public.pragas_ai_report_status') IS NULL
     OR to_regtype('public.pragas_ai_report_reason') IS NULL
  THEN
    RAISE EXCEPTION 'pragas_rollback_removed_retained_type';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'pragas_deletion_jobs'
       AND column_name = 'status'
       AND data_type = 'text'
  ) OR NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.pragas_deletion_jobs'::regclass
       AND conname = 'pragas_deletion_jobs_status_check'
       AND pg_get_constraintdef(oid) LIKE '%requested%'
       AND pg_get_constraintdef(oid) LIKE '%processing%'
       AND pg_get_constraintdef(oid) LIKE '%retry%'
       AND pg_get_constraintdef(oid) LIKE '%blocked_global_decision%'
       AND pg_get_constraintdef(oid) LIKE '%reactivated%'
  ) THEN
    RAISE EXCEPTION 'pragas_rollback_removed_deletion_state_contract';
  END IF;
END
$$;

COMMIT;
