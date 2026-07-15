-- Data-preserving rollback for 20260715172000_pragas_prod_compat_export.
-- The runtime migration remains intact. Remove only the exact export bridge
-- installed by 172000; refuse to drop a later or foreign replacement.

BEGIN;

DO $pragas_prod_compat_export_rollback$
DECLARE
  v_definition text;
BEGIN
  IF to_regprocedure(
    'public.export_pragas_notification_queue_snapshot(uuid,timestamp with time zone,integer)'
  ) IS NULL THEN
    RETURN;
  END IF;

  SELECT pg_get_functiondef(
    'public.export_pragas_notification_queue_snapshot(uuid,timestamp with time zone,integer)'::regprocedure
  ) INTO v_definition;
  IF position('pragas_prod_compat_export_v1' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'pragas_prod_compat_export_rollback_refuses_foreign_function';
  END IF;

  DROP FUNCTION public.export_pragas_notification_queue_snapshot(
    uuid, timestamptz, integer
  );
END
$pragas_prod_compat_export_rollback$;

COMMIT;
