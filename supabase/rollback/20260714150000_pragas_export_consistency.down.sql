-- Data-preserving rollback for the export-only runtime added by 20260714150000.
BEGIN;

DO $$
BEGIN
  IF to_regprocedure(
    'public.export_pragas_notification_queue_snapshot(uuid,timestamp with time zone,integer)'
  ) IS NULL THEN
    RAISE EXCEPTION 'pragas_export_rollback_preflight_missing_function';
  END IF;
END
$$;

DROP FUNCTION public.export_pragas_notification_queue_snapshot(
  uuid, timestamptz, integer
);

DO $$
BEGIN
  IF to_regprocedure(
    'public.export_pragas_notification_queue_snapshot(uuid,timestamp with time zone,integer)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'pragas_export_rollback_left_function';
  END IF;
END
$$;

COMMIT;
