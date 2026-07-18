-- SUPERSEDED — intentionally inert.
--
-- This historical candidate assumed `pragas_profiles.id = user_id`. The live
-- jxcnfyeemdltdfqtgbcl contract deliberately uses a generated row `id` and a
-- unique ownership `user_id`; all 82 profiles observed read-only on 2026-07-15
-- use that shape. The former body also rewrote existing feedback/push state and
-- could overwrite an app entitlement. It must never execute in any environment.
--
-- Production compatibility is installed only by the hash-allowlisted sequence:
--   20260715170000_pragas_link_account_prod_hotfix.sql
--   20260715171000_pragas_prod_compat_runtime.sql
--   20260715172000_pragas_prod_compat_export.sql
-- through supabase/scripts/deploy-pragas-prod-compat.sh.
--
-- Keep this timestamped no-op so clean migration replays and repositories that
-- already recorded version 20260714143000 converge without hiding dangerous SQL
-- behind a removable flag or renumbering migration history.

DO $pragas_backend_security_superseded$
BEGIN
  NULL;
END
$pragas_backend_security_superseded$;
