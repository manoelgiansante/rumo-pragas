-- Data-preserving rollback for 20260715170000_pragas_link_account_prod_hotfix.
-- Runtime-created profile/subscription rows are retained. The rollback removes
-- only the exact hotfix function and refuses to drop a later replacement.

BEGIN;

DO $pragas_link_hotfix_rollback$
DECLARE
  v_definition text;
BEGIN
  IF to_regprocedure('public.pragas_link_account()') IS NULL THEN
    RETURN;
  END IF;

  SELECT pg_get_functiondef('public.pragas_link_account()'::regprocedure)
    INTO v_definition;
  IF position('pragas_link_account_prod_hotfix_v1' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'pragas_link_hotfix_rollback_refuses_foreign_function';
  END IF;

  DROP FUNCTION public.pragas_link_account();
END
$pragas_link_hotfix_rollback$;

COMMIT;
