-- =====================================================================
-- Migration: Lock chat-usage RPCs to service_role ONLY (revoke authenticated)
-- Created:    2026-07-07
-- Project:    jxcnfyeemdltdfqtgbcl (SHARED — all non-RM AgroRumo apps)
-- App:        rumo-pragas
--
-- ┌───────────────────────────────────────────────────────────────────┐
-- │  STATUS: PROPOSAL ONLY — *** DO NOT APPLY WITHOUT CEO APPROVAL ***  │
-- │  Shared production DB (jxcn). Versioned only; NOT applied here.     │
-- └───────────────────────────────────────────────────────────────────┘
--
-- PROBLEM (grant drift confirmed live in prod 2026-07-07)
-- -------------------------------------------------------
-- public.get_chat_usage_count(uuid, text) and
-- public.increment_chat_usage(uuid, text) are SECURITY DEFINER and BOTH accept
-- an arbitrary p_user_id argument (NOT auth.uid()). Live grantees in jxcn are
-- {authenticated, postgres, service_role} — i.e. EXECUTE is granted to
-- `authenticated`.
--
-- The predecessor migration 20260702120000_revoke_chat_usage_rpc_from_anon.sql
-- correctly revoked anon/PUBLIC but then GRANTed EXECUTE to `authenticated`,
-- which reintroduces the exact vector the ORIGINAL migration
-- (20260628130000_pragas_chat_usage_counter.sql) deliberately guarded against
-- in its ZERO-S header note:
--   "granted to service_role ONLY — deliberately NOT to anon/authenticated, so
--    a client cannot call increment_chat_usage directly to inflate another
--    user's usage (DoS-to-paywall)."
--
-- Because the functions are SECURITY DEFINER (bypass RLS) and take an arbitrary
-- p_user_id, ANY authenticated user can call:
--   • increment_chat_usage('<victim_uuid>','rumo-pragas') → inflate a VICTIM's
--     monthly counter and push them into the CHAT_LIMIT_REACHED 403 (DoS-to-
--     paywall) once paid monthly caps are re-enabled (FREE_MODE=false).
--   • get_chat_usage_count('<victim_uuid>', ...) → probe ANY user's usage.
-- This is dormant today only because FREE_MODE makes every plan's cap -1
-- (unlimited), so ai-chat never reads the counter. It becomes an ACTIVE abuse
-- vector the moment re-monetization flips FREE_MODE off.
--
-- CALLER ANALYSIS (why revoking `authenticated` is safe)
-- ------------------------------------------------------
-- The ONLY caller of either RPC is supabase/functions/ai-chat/index.ts, which
-- verifies the user JWT (supabase.auth.getUser) and then invokes both RPCs via
-- the SERVICE-ROLE client (supabaseAdmin). The mobile/web client never calls
-- these RPCs — it reads its own usage via the RLS-scoped SELECT policy
-- chat_usage_select_own (auth.uid() = user_id). Grep of expo-app confirms zero
-- direct .rpc('get_chat_usage_count'|'increment_chat_usage') call sites.
-- Therefore removing the `authenticated` grant breaks no client path.
--
-- FIX
-- ---
-- Revoke EXECUTE from PUBLIC, anon AND authenticated; grant EXECUTE to
-- service_role only — restoring the original design intent. Idempotent.
--
-- Signatures verified against 20260628130000 / 20260702120000 (both functions
-- live in schema public with args (uuid, text)).
-- =====================================================================

-- get_chat_usage_count(uuid, text)
REVOKE EXECUTE ON FUNCTION public.get_chat_usage_count(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_chat_usage_count(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_chat_usage_count(uuid, text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.get_chat_usage_count(uuid, text) TO service_role;

-- increment_chat_usage(uuid, text)
REVOKE EXECUTE ON FUNCTION public.increment_chat_usage(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_chat_usage(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_chat_usage(uuid, text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.increment_chat_usage(uuid, text) TO service_role;
