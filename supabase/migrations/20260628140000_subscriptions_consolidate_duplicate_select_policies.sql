-- =====================================================================
-- Migration: Consolidate duplicate SELECT policies on `subscriptions`
-- Created:    2026-06-28
-- Project:    jxcnfyeemdltdfqtgbcl (SHARED — all non-RM AgroRumo apps)
-- Audit item: P3 — store-config / Supabase hygiene (golive 2026-06-27)
--
-- ┌───────────────────────────────────────────────────────────────────┐
-- │  STATUS: PROPOSAL ONLY — *** DO NOT APPLY STANDALONE ***            │
-- │  Touches the SHARED `public.subscriptions` table. Apply only after  │
-- │  the verification SELECT below is run against jxcn and a CEO /      │
-- │  portfolio owner confirms the dropped policies are pure duplicates. │
-- └───────────────────────────────────────────────────────────────────┘
--
-- PROBLEM
-- -------
-- `public.subscriptions` is shared by every non-RM AgroRumo app. Over time,
-- several apps' init/migration scripts each created their OWN row-owner
-- SELECT policy on this table, all with the IDENTICAL predicate
-- `(auth.uid() = user_id)` but DIFFERENT names (e.g. the Pragas canonical
-- "Users can view own subscription" plus look-alikes added by sibling apps).
-- The audit observed 3 functionally-identical SELECT policies coexisting.
-- They are not a security risk (RLS = OR of permissive policies, and they
-- are byte-identical), but they are dead weight: confusing, and each extra
-- permissive policy is one more predicate Postgres ORs on every read.
--
-- FIX (safe-by-construction)
-- --------------------------
-- Keep exactly ONE canonical owner-scoped SELECT policy and drop every
-- OTHER *permissive* FOR-SELECT policy whose normalized USING expression is
-- EXACTLY `(auth.uid() = user_id)`. The block below NEVER touches:
--   • the canonical policy we keep ("Users can view own subscription"),
--   • the FOR ALL service_role policy ("Service role can manage subscriptions",
--     qual = `(auth.role() = 'service_role')` — different predicate), or
--   • any SELECT policy with a DIFFERENT USING expression (a sibling app may
--     legitimately scope reads differently — we leave those untouched).
-- Result is identical effective access, fewer redundant predicates.
--
-- WHY GATED (shared prod): another app could, in theory, depend on one of
-- the duplicate NAMES (unlikely — RLS is anonymous to the client). Confirm
-- with the verification query before applying, and apply ONCE for the whole
-- portfolio, not per-app.
--
-- VERIFICATION (run this SELECT against jxcn BEFORE applying — read-only):
--   SELECT policyname, permissive, cmd, qual
--   FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'subscriptions'
--   ORDER BY cmd, policyname;
--   -- Expect: 1 FOR ALL service_role policy + N>1 SELECT policies whose
--   --         qual is `(auth.uid() = user_id)`. This migration collapses
--   --         those N SELECT duplicates to the single canonical one.
-- =====================================================================

DO $$
DECLARE
  canonical_name CONSTANT text := 'Users can view own subscription';
  pol RECORD;
BEGIN
  -- Ensure the canonical owner-scoped SELECT policy exists (idempotent).
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'subscriptions'
      AND policyname = canonical_name
  ) THEN
    EXECUTE format(
      'CREATE POLICY %I ON public.subscriptions FOR SELECT USING (auth.uid() = user_id)',
      canonical_name
    );
  END IF;

  -- Drop every OTHER permissive SELECT policy whose predicate is byte-identical
  -- to the canonical one. Different predicates / FOR ALL policies are skipped.
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'subscriptions'
      AND cmd        = 'SELECT'
      AND permissive = 'PERMISSIVE'
      AND policyname <> canonical_name
      AND regexp_replace(qual, '\s', '', 'g') = '(auth.uid()=user_id)'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.subscriptions', pol.policyname);
  END LOOP;
END
$$;

-- Note: no data is touched and effective access is unchanged. RLS continues
-- to scope reads by `auth.uid() = user_id`; service_role still bypasses RLS
-- and retains its explicit FOR ALL policy for clarity.
