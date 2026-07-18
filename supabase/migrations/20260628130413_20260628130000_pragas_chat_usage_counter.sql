-- =====================================================================
-- Migration: Persistent monthly chat-message counter (anti-abuse)
-- Created:    2026-06-28
-- Project:    jxcnfyeemdltdfqtgbcl (SHARED — all non-RM AgroRumo apps)
-- Audit item: P2 — ai-chat free monthly cap was bypassable (golive 2026-06-27)
--
-- ┌───────────────────────────────────────────────────────────────────┐
-- │  STATUS: PROPOSAL ONLY — *** DO NOT APPLY WITHOUT CEO APPROVAL ***  │
-- │  Shared production DB. Apply once, then deploy ai-chat edge fn.     │
-- └───────────────────────────────────────────────────────────────────┘
--
-- PROBLEM
-- -------
-- supabase/functions/ai-chat/index.ts enforced the free-plan monthly cap
-- (CHAT_LIMITS.free = 10) by counting `messages.filter(role==='user')` in
-- the ARRAY supplied by the client. That count is fully client-controlled:
--   • The "Limpar Conversa" button resets the local array to empty, so the
--     server sees userMessageCount = 1 again → unlimited free chat.
--   • A crafted request can omit prior turns entirely.
-- Result: the paywall on the paid Anthropic chat route is a no-op.
--
-- FIX
-- ---
-- Move the counter server-side and persist it per (user_id, app, year_month),
-- mirroring how supabase/functions/diagnose/index.ts counts pragas_diagnoses
-- for the monthly diagnosis quota. The edge function reads the current count
-- (fail-CLOSED on error, ZERO-O) before answering and increments it AFTER a
-- successful answer, so the cap can no longer be reset from the client.
--
-- ZERO-S NOTE (intentional): this is NOT an employee/anon flow. The RPCs are
-- invoked by ai-chat using the service-role client AFTER it verifies the user
-- JWT (supabase.auth.getUser). They are therefore granted to `service_role`
-- ONLY — deliberately NOT to `anon`/`authenticated`, so a client cannot call
-- increment_chat_usage directly to inflate another user's usage (DoS-to-paywall).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Persistent per-(user, app, month) counter table
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_usage (
  user_id    uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  app        text        NOT NULL DEFAULT 'rumo-pragas',
  year_month text        NOT NULL,                 -- 'YYYY-MM' in UTC
  count      integer     NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, app, year_month)
);

COMMENT ON TABLE public.chat_usage IS
  'Server-side monthly ai-chat message counter per (user, app). Replaces the '
  'client-array message count that the "Limpar Conversa" button could reset. '
  'Mutated only by SECDEF RPCs via service_role. Added 2026-06-28.';

-- RLS on. No INSERT/UPDATE/DELETE policy => all direct client writes denied;
-- mutations flow exclusively through the SECDEF RPCs below (service_role).
ALTER TABLE public.chat_usage ENABLE ROW LEVEL SECURITY;

-- Owners may READ their own usage (harmless; lets the app surface "X/10 used").
DROP POLICY IF EXISTS chat_usage_select_own ON public.chat_usage;
CREATE POLICY chat_usage_select_own ON public.chat_usage
  FOR SELECT USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 2. Read current month's count (fail-closed source of truth)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_chat_usage_count(
  p_user_id uuid,
  p_app     text
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT cu.count
       FROM public.chat_usage cu
      WHERE cu.user_id = p_user_id
        AND cu.app = p_app
        AND cu.year_month = to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM')),
    0
  );
$$;

COMMENT ON FUNCTION public.get_chat_usage_count(uuid, text) IS
  'Returns the current UTC-month ai-chat message count for (user, app). '
  'Called by the ai-chat edge fn (service_role) before answering.';

-- ---------------------------------------------------------------------
-- 3. Atomically increment this month's count, returning the new value
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_chat_usage(
  p_user_id uuid,
  p_app     text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ym    text := to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM');
  v_count integer;
BEGIN
  INSERT INTO public.chat_usage (user_id, app, year_month, count, updated_at)
  VALUES (p_user_id, p_app, v_ym, 1, now())
  ON CONFLICT (user_id, app, year_month)
  DO UPDATE SET count = public.chat_usage.count + 1, updated_at = now()
  RETURNING count INTO v_count;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.increment_chat_usage(uuid, text) IS
  'Increments the current UTC-month ai-chat counter for (user, app) by 1 and '
  'returns the new value. Called by the ai-chat edge fn (service_role) AFTER a '
  'successful answer.';

-- ---------------------------------------------------------------------
-- 4. Grants — service_role ONLY (see ZERO-S note in header)
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_chat_usage_count(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_chat_usage(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_chat_usage_count(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_chat_usage(uuid, text) TO service_role;
