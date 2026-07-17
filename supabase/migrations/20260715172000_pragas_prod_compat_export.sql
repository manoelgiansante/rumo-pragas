-- Transfer-safe export bridge for the live legacy notification queue.
-- Target: jxcnfyeemdltdfqtgbcl via the hash-allowlisted prod-compat gate.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

-- PRAGAS_NOTIFICATION_QUEUE_MIGRATION_PREFLIGHT_BEGIN
-- Refuse the entire transaction before replacing the reviewed RPC when the
-- optional legacy queue exists with a shape the dynamic query cannot safely
-- execute against. The same checks remain inside the RPC for later drift.
DO $pragas_notification_queue_migration_preflight$
BEGIN
  IF to_regclass('public.pragas_notification_queue') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
        FROM unnest(ARRAY[
          'id', 'token', 'owner_user_id', 'title', 'body', 'data', 'sent',
          'created_at'
        ]) AS required(column_name)
       WHERE NOT EXISTS (
         SELECT 1 FROM information_schema.columns AS column_info
          WHERE column_info.table_schema = 'public'
            AND column_info.table_name = 'pragas_notification_queue'
            AND column_info.column_name = required.column_name
       )
    ) OR NOT EXISTS (
      SELECT 1 FROM information_schema.columns AS column_info
       WHERE column_info.table_schema = 'public'
         AND column_info.table_name = 'pragas_notification_queue'
         AND column_info.column_name = 'token'
         AND column_info.data_type = 'text'
    ) OR NOT EXISTS (
      SELECT 1 FROM information_schema.columns AS column_info
       WHERE column_info.table_schema = 'public'
         AND column_info.table_name = 'pragas_notification_queue'
         AND column_info.column_name = 'created_at'
         AND column_info.data_type IN (
           'timestamp with time zone', 'timestamp without time zone'
         )
    ) OR NOT EXISTS (
      SELECT 1 FROM information_schema.columns AS column_info
       WHERE column_info.table_schema = 'public'
         AND column_info.table_name = 'pragas_notification_queue'
         AND column_info.column_name = 'owner_user_id'
         AND column_info.udt_name = 'uuid'
         AND column_info.is_nullable = 'NO'
         AND column_info.is_generated = 'NEVER'
         AND column_info.is_identity = 'NO'
         AND column_info.column_default IS NULL
    ) OR NOT EXISTS (
      SELECT 1 FROM pg_attribute AS attribute_row
       WHERE attribute_row.attrelid =
         'public.pragas_notification_queue'::regclass
         AND attribute_row.attname = 'id'
         AND attribute_row.attnotnull
         AND NOT attribute_row.attisdropped
         AND EXISTS (
           SELECT 1 FROM pg_index AS index_row
            WHERE index_row.indrelid = attribute_row.attrelid
              AND index_row.indisunique
              AND index_row.indisvalid
              AND index_row.indisready
              AND index_row.indpred IS NULL
              AND index_row.indexprs IS NULL
              AND index_row.indnkeyatts = 1
              AND index_row.indkey[0] = attribute_row.attnum
         )
    ) OR NOT EXISTS (
      SELECT 1 FROM pg_trigger AS trigger_row
       WHERE trigger_row.tgrelid = 'public.pragas_notification_queue'::regclass
         AND trigger_row.tgname = 'pragas_notification_queue_owner_guard'
         AND NOT trigger_row.tgisinternal
         AND trigger_row.tgenabled IN ('O', 'A')
         AND trigger_row.tgfoid = to_regprocedure(
               'public.pragas_notification_queue_owner_guard()'
             )
    ) THEN
      RAISE EXCEPTION
        'pragas_notification_queue_export_schema_mismatch';
    END IF;
  END IF;
END
$pragas_notification_queue_migration_preflight$;
-- PRAGAS_NOTIFICATION_QUEUE_MIGRATION_PREFLIGHT_END

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
  v_rows jsonb := '[]'::jsonb;
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
      FROM unnest(ARRAY[
        'id', 'token', 'owner_user_id', 'title', 'body', 'data', 'sent',
        'created_at'
      ])
        AS required(column_name)
     WHERE NOT EXISTS (
       SELECT 1 FROM information_schema.columns AS column_info
        WHERE column_info.table_schema = 'public'
          AND column_info.table_name = 'pragas_notification_queue'
          AND column_info.column_name = required.column_name
     )
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns AS column_info
     WHERE column_info.table_schema = 'public'
       AND column_info.table_name = 'pragas_notification_queue'
       AND column_info.column_name = 'token'
       AND column_info.data_type = 'text'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns AS column_info
     WHERE column_info.table_schema = 'public'
       AND column_info.table_name = 'pragas_notification_queue'
       AND column_info.column_name = 'created_at'
       AND column_info.data_type IN (
         'timestamp with time zone', 'timestamp without time zone'
       )
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns AS column_info
     WHERE column_info.table_schema = 'public'
       AND column_info.table_name = 'pragas_notification_queue'
       AND column_info.column_name = 'owner_user_id'
       AND column_info.udt_name = 'uuid'
       AND column_info.is_nullable = 'NO'
       AND column_info.is_generated = 'NEVER'
       AND column_info.is_identity = 'NO'
       AND column_info.column_default IS NULL
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
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger AS trigger_row
     WHERE trigger_row.tgrelid = 'public.pragas_notification_queue'::regclass
       AND trigger_row.tgname = 'pragas_notification_queue_owner_guard'
       AND NOT trigger_row.tgisinternal
       AND trigger_row.tgenabled IN ('O', 'A')
       AND trigger_row.tgfoid = to_regprocedure(
             'public.pragas_notification_queue_owner_guard()'
           )
  ) THEN
    RAISE EXCEPTION 'pragas_notification_queue_export_schema_mismatch';
  END IF;

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
      WHERE queue_row.owner_user_id = $1 AND queue_row.created_at <= $2
      ORDER BY queue_row.id::text COLLATE "C" ASC LIMIT $3
    ) AS result
  $query$ USING p_user_id, p_snapshot_at, p_limit INTO v_rows;
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
