-- 2026-07-21 — Data fix: pragas_diagnoses rows persisted with crop = ''.
--
-- WHY: both diagnose slugs used to persist crop = '' for invalid_image rows.
-- The deployed clients' parseDiagnosisRow (1.0.11 iOS public + 1.0.12 in
-- Apple review) rejects crop = '' and fetchDiagnoses drops the WHOLE
-- Histórico list when a single row fails — one bad row permanently broke the
-- History tab for its owner. The edge-fn fix (same commit) stops emitting
-- empty crops; this backfill repairs the rows already persisted.
--
-- VALUE: 'outro' — exactly what the fixed cropId fallback produces when no
-- crop was requested/detected (the invalid-image UI keys off
-- pest_id = 'invalid_image', never off crop).
--
-- Scope check before apply (2026-07-21): exactly 1 row matched —
--   id 71e3875f-3240-487d-a4fa-884d92e1e688 (pest_id invalid_image,
--   confidence 0, created 2026-07-01). Reversal: set crop = '' back on the
--   ids captured by the pre-apply SELECT.
UPDATE public.pragas_diagnoses
SET crop = 'outro'
WHERE crop = '';
