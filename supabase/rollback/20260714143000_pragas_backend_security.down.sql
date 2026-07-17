-- The corresponding migration is permanently superseded and inert.
-- Its historical rollback previously targeted objects now owned by the
-- 2026071517xx production-compatibility sequence, so it is intentionally a
-- no-op as well. Use the version-matched 2026071517xx rollback scripts.

DO $pragas_backend_security_superseded_rollback$
BEGIN
  NULL;
END
$pragas_backend_security_superseded_rollback$;
