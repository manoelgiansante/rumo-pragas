-- Transfer-safe export bridge for the live legacy notification queue.
-- Target: jxcnfyeemdltdfqtgbcl via the hash-allowlisted prod-compat gate.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

CREATE OR REPLACE FUNCTION public.export_pragas_notification_queue_snapshot(
  p_user_id uuid,
  p_snapshot_at timestamptz,
  p_limit integer DEFAULT 10001
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET timezone = 'UTC'
AS $$
-- pragas_prod_compat_export_v1
DECLARE
  v_candidate_tokens text[] := ARRAY[]::text[];
  v_owned_tokens text[] := ARRAY[]::text[];
  v_rows jsonb := '[]'::jsonb;
  v_token text;
BEGIN
  IF p_user_id IS NULL OR p_snapshot_at IS NULL
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 10001
  THEN
    RAISE EXCEPTION 'invalid_pragas_notification_export_page';
  END IF;
  IF to_regclass('public.pragas_notification_queue') IS NULL THEN
    RETURN v_rows;
  END IF;
  IF EXISTS (
    SELECT 1
      FROM unnest(ARRAY['id', 'token', 'title', 'body', 'data', 'sent', 'created_at'])
        AS required(column_name)
     WHERE NOT EXISTS (
       SELECT 1 FROM information_schema.columns AS column_info
        WHERE column_info.table_schema = 'public'
          AND column_info.table_name = 'pragas_notification_queue'
          AND column_info.column_name = required.column_name
     )
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_attribute AS attribute_row
     WHERE attribute_row.attrelid = 'public.pragas_notification_queue'::regclass
       AND attribute_row.attname = 'id' AND attribute_row.attnotnull
       AND NOT attribute_row.attisdropped
       AND EXISTS (
         SELECT 1 FROM pg_index AS index_row
          WHERE index_row.indrelid = attribute_row.attrelid
            AND index_row.indisunique AND index_row.indisvalid
            AND index_row.indisready AND index_row.indpred IS NULL
            AND index_row.indexprs IS NULL AND index_row.indnkeyatts = 1
            AND index_row.indkey[0] = attribute_row.attnum
       )
  ) THEN
    RAISE EXCEPTION 'pragas_notification_queue_export_schema_mismatch';
  END IF;

  SELECT coalesce(
    array_agg(DISTINCT candidate.token_value ORDER BY candidate.token_value),
    ARRAY[]::text[]
  ) INTO v_candidate_tokens
  FROM (
    SELECT token AS token_value FROM public.pragas_push_tokens
     WHERE user_id = p_user_id AND created_at <= p_snapshot_at AND token IS NOT NULL
    UNION
    SELECT expo_token FROM public.pragas_push_tokens
     WHERE user_id = p_user_id AND created_at <= p_snapshot_at AND expo_token IS NOT NULL
  ) AS candidate;
  IF cardinality(v_candidate_tokens) > 20000 THEN
    RAISE EXCEPTION 'pragas_notification_queue_export_token_limit';
  END IF;
  FOREACH v_token IN ARRAY v_candidate_tokens LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('pragas-push-token:' || v_token, 0));
  END LOOP;

  SELECT coalesce(
    array_agg(DISTINCT owned.token_value ORDER BY owned.token_value),
    ARRAY[]::text[]
  ) INTO v_owned_tokens
  FROM (
    SELECT source.token AS token_value
      FROM public.pragas_push_tokens AS source
     WHERE source.user_id = p_user_id AND source.created_at <= p_snapshot_at
       AND source.token IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.pragas_push_tokens AS current_owner
          WHERE current_owner.user_id <> p_user_id
            AND current_owner.is_active AND current_owner.notifications_enabled
            AND (current_owner.token = source.token
              OR current_owner.expo_token = source.token)
       )
    UNION
    SELECT source.expo_token
      FROM public.pragas_push_tokens AS source
     WHERE source.user_id = p_user_id AND source.created_at <= p_snapshot_at
       AND source.expo_token IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.pragas_push_tokens AS current_owner
          WHERE current_owner.user_id <> p_user_id
            AND current_owner.is_active AND current_owner.notifications_enabled
            AND (current_owner.token = source.expo_token
              OR current_owner.expo_token = source.expo_token)
       )
  ) AS owned;
  IF cardinality(v_owned_tokens) = 0 THEN RETURN v_rows; END IF;

  EXECUTE $query$
    SELECT coalesce(
      jsonb_agg(result.row_data ORDER BY result.cursor_id COLLATE "C" ASC),
      '[]'::jsonb
    )
    FROM (
      SELECT jsonb_build_object(
        'id', queue_row.id, 'title', queue_row.title, 'body', queue_row.body,
        'data', queue_row.data, 'sent', queue_row.sent,
        'created_at', queue_row.created_at
      ) AS row_data, queue_row.id::text AS cursor_id
      FROM public.pragas_notification_queue AS queue_row
      WHERE queue_row.token = ANY ($1) AND queue_row.created_at <= $2
      ORDER BY queue_row.id::text COLLATE "C" ASC LIMIT $3
    ) AS result
  $query$ USING v_owned_tokens, p_snapshot_at, p_limit INTO v_rows;
  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.export_pragas_notification_queue_snapshot(
  uuid, timestamptz, integer
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.export_pragas_notification_queue_snapshot(
  uuid, timestamptz, integer
) TO service_role;

COMMENT ON FUNCTION public.export_pragas_notification_queue_snapshot(
  uuid, timestamptz, integer
) IS 'Service-only bounded snapshot of legacy Pragas notifications.';

COMMIT;
