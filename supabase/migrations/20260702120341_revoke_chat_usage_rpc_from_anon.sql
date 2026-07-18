-- =====================================================================
-- Migration: Lock down chat-usage RPCs — revoke anon/PUBLIC grant drift
-- Created:    2026-07-02
-- Project:    jxcnfyeemdltdfqtgbcl (SHARED — all non-RM AgroRumo apps)
-- App:        rumo-pragas
--
-- ┌───────────────────────────────────────────────────────────────────┐
-- │  STATUS: PROPOSAL ONLY — *** DO NOT APPLY WITHOUT CEO APPROVAL ***  │
-- │  Shared production DB (jxcn). Versioned only; NOT applied here.     │
-- └───────────────────────────────────────────────────────────────────┘
--
-- PROBLEM (grant drift found in production)
-- -----------------------------------------
-- public.get_chat_usage_count(uuid, text) and
-- public.increment_chat_usage(uuid, text) are SECURITY DEFINER. In prod they
-- are EXECUTABLE BY anon/PUBLIC: Postgres grants EXECUTE to PUBLIC by default
-- on function creation, and the REVOKE in migration 20260628130000 never
-- reached prod (repo↔prod drift). Because the functions are SECURITY DEFINER,
-- any anon caller (curl with the public anon key) can invoke them directly to
-- inflate ANY user_id's monthly ai-chat counter (DoS-to-paywall) or probe
-- another user's usage — defeating the whole point of the server-side counter.
--
-- FIX
-- ---
-- Revoke EXECUTE from PUBLIC and anon; grant EXECUTE to authenticated (and
-- re-affirm service_role, used by the ai-chat edge fn). Idempotent.
--
-- Signatures verified against migration 20260628130000_pragas_chat_usage_counter.sql
-- (both functions live in schema public with args (uuid, text)).
-- =====================================================================

-- get_chat_usage_count(uuid, text)
REVOKE EXECUTE ON FUNCTION public.get_chat_usage_count(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_chat_usage_count(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_chat_usage_count(uuid, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_chat_usage_count(uuid, text) TO service_role;

-- increment_chat_usage(uuid, text)
REVOKE EXECUTE ON FUNCTION public.increment_chat_usage(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_chat_usage(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.increment_chat_usage(uuid, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.increment_chat_usage(uuid, text) TO service_role;
