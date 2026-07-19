-- =====================================================================
-- Rumo Pragas paid photo quota (PROPOSAL ONLY — DO NOT APPLY HERE)
-- Project: jxcnfyeemdltdfqtgbcl (shared; never byfg/Rumo Maquinas)
-- Rollout order: migration -> billing functions -> diagnose -> app binary.
-- PRECONDITION: coordinated proposal
-- 20260628120000_subscriptions_per_app_isolation.sql is already applied, so
-- subscriptions.app + UNIQUE(user_id, app) exist before billing functions.
-- =====================================================================

-- Keep legacy values because `subscriptions` is shared by other jxcn apps.
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_plan_check CHECK (
    plan IN ('free', 'pro', 'enterprise', 'producer', 'farm', 'agronomist')
  );

CREATE TABLE IF NOT EXISTS public.pragas_photo_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  app text NOT NULL DEFAULT 'rumo-pragas',
  cycle_start timestamptz NOT NULL,
  cycle_end timestamptz NOT NULL,
  plan text NOT NULL,
  included_limit integer NOT NULL CHECK (included_limit >= 0),
  used_count integer NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  extra_purchased integer NOT NULL DEFAULT 0 CHECK (extra_purchased >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, app, cycle_start),
  CHECK (cycle_end > cycle_start)
);

CREATE TABLE IF NOT EXISTS public.pragas_photo_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  user_id uuid NOT NULL,
  app text NOT NULL,
  cycle_start timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'consumed', 'released')),
  reserved_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  UNIQUE (user_id, app, request_id),
  FOREIGN KEY (user_id, app, cycle_start)
    REFERENCES public.pragas_photo_usage(user_id, app, cycle_start)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pragas_photo_reservations_usage
  ON public.pragas_photo_reservations(user_id, app, cycle_start, status);

CREATE TABLE IF NOT EXISTS public.pragas_photo_topups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  app text NOT NULL DEFAULT 'rumo-pragas',
  cycle_start timestamptz NOT NULL,
  cycle_end timestamptz NOT NULL,
  plan text NOT NULL CHECK (plan IN ('producer', 'farm', 'agronomist')),
  included_limit integer NOT NULL CHECK (included_limit > 0),
  photo_count integer NOT NULL DEFAULT 1 CHECK (photo_count = 1),
  unit_amount_cents integer NOT NULL CHECK (unit_amount_cents > 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'failed')),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 16 AND 128),
  stripe_payment_intent_id text UNIQUE,
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (user_id, app, idempotency_key),
  CHECK (cycle_end > cycle_start)
);

CREATE INDEX IF NOT EXISTS idx_pragas_photo_topups_month
  ON public.pragas_photo_topups(user_id, app, created_at, status);

ALTER TABLE public.pragas_photo_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pragas_photo_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pragas_photo_topups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pragas_photo_usage_select_own ON public.pragas_photo_usage;
CREATE POLICY pragas_photo_usage_select_own ON public.pragas_photo_usage
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS pragas_photo_reservations_select_own ON public.pragas_photo_reservations;
CREATE POLICY pragas_photo_reservations_select_own ON public.pragas_photo_reservations
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS pragas_photo_topups_select_own ON public.pragas_photo_topups;
CREATE POLICY pragas_photo_topups_select_own ON public.pragas_photo_topups
  FOR SELECT USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.pragas_photo_usage, public.pragas_photo_reservations, public.pragas_photo_topups
  FROM anon, authenticated;
GRANT SELECT
  ON public.pragas_photo_usage, public.pragas_photo_reservations, public.pragas_photo_topups
  TO authenticated;
GRANT ALL
  ON public.pragas_photo_usage, public.pragas_photo_reservations, public.pragas_photo_topups
  TO service_role;

-- Atomically reserves one photo before the paid provider runs. The row lock and
-- used_count increment make concurrent requests unable to overspend a quota.
CREATE OR REPLACE FUNCTION public.reserve_pragas_photo(
  p_user_id uuid,
  p_app text,
  p_plan text,
  p_cycle_start timestamptz,
  p_cycle_end timestamptz,
  p_included_limit integer,
  p_request_id uuid
)
RETURNS TABLE(reservation_id uuid, allowed boolean, used integer, quota_total integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing public.pragas_photo_reservations%ROWTYPE;
  v_usage public.pragas_photo_usage%ROWTYPE;
  v_reservation_id uuid;
BEGIN
  IF p_app <> 'rumo-pragas'
     OR p_plan NOT IN ('free', 'producer', 'farm', 'agronomist')
     OR p_included_limit < 0
     OR p_cycle_end <= p_cycle_start THEN
    RAISE EXCEPTION 'invalid quota arguments';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':' || p_app || ':' || p_cycle_start::text, 0)
  );

  SELECT * INTO v_existing
    FROM public.pragas_photo_reservations
   WHERE user_id = p_user_id AND app = p_app AND request_id = p_request_id;

  IF FOUND THEN
    SELECT * INTO v_usage FROM public.pragas_photo_usage
     WHERE user_id = p_user_id AND app = p_app AND cycle_start = p_cycle_start;
    RETURN QUERY SELECT v_existing.id,
      v_existing.status IN ('reserved', 'consumed'),
      COALESCE(v_usage.used_count, 0),
      COALESCE(v_usage.included_limit + v_usage.extra_purchased, p_included_limit);
    RETURN;
  END IF;

  INSERT INTO public.pragas_photo_usage AS usage (
    user_id, app, cycle_start, cycle_end, plan, included_limit
  ) VALUES (
    p_user_id, p_app, p_cycle_start, p_cycle_end, p_plan, p_included_limit
  )
  ON CONFLICT (user_id, app, cycle_start) DO UPDATE SET
    cycle_end = EXCLUDED.cycle_end,
    plan = EXCLUDED.plan,
    included_limit = EXCLUDED.included_limit,
    updated_at = now();

  SELECT * INTO v_usage FROM public.pragas_photo_usage
   WHERE user_id = p_user_id AND app = p_app AND cycle_start = p_cycle_start
   FOR UPDATE;

  IF v_usage.used_count >= v_usage.included_limit + v_usage.extra_purchased THEN
    RETURN QUERY SELECT NULL::uuid, false, v_usage.used_count,
      v_usage.included_limit + v_usage.extra_purchased;
    RETURN;
  END IF;

  INSERT INTO public.pragas_photo_reservations (
    request_id, user_id, app, cycle_start
  ) VALUES (p_request_id, p_user_id, p_app, p_cycle_start)
  RETURNING id INTO v_reservation_id;

  UPDATE public.pragas_photo_usage
     SET used_count = used_count + 1, updated_at = now()
   WHERE user_id = p_user_id AND app = p_app AND cycle_start = p_cycle_start
   RETURNING * INTO v_usage;

  RETURN QUERY SELECT v_reservation_id, true, v_usage.used_count,
    v_usage.included_limit + v_usage.extra_purchased;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_pragas_photo_reservation(
  p_reservation_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM public.pragas_photo_reservations
   WHERE id = p_reservation_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_status = 'released' THEN RETURN false; END IF;
  IF v_status = 'consumed' THEN RETURN true; END IF;
  UPDATE public.pragas_photo_reservations
     SET status = 'consumed', finalized_at = now()
   WHERE id = p_reservation_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_pragas_photo_reservation(
  p_reservation_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.pragas_photo_reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.pragas_photo_reservations
   WHERE id = p_reservation_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_row.status = 'consumed' THEN RETURN false; END IF;
  IF v_row.status = 'released' THEN RETURN true; END IF;
  UPDATE public.pragas_photo_reservations
     SET status = 'released', finalized_at = now()
   WHERE id = p_reservation_id;
  UPDATE public.pragas_photo_usage
     SET used_count = GREATEST(used_count - 1, 0), updated_at = now()
   WHERE user_id = v_row.user_id AND app = v_row.app
     AND cycle_start = v_row.cycle_start;
  RETURN true;
END;
$$;

-- Holds a monthly top-up slot before contacting Stripe. Pending rows count
-- toward the ceiling to close the concurrent-double-charge race.
CREATE OR REPLACE FUNCTION public.begin_pragas_photo_topup(
  p_user_id uuid,
  p_app text,
  p_plan text,
  p_cycle_start timestamptz,
  p_cycle_end timestamptz,
  p_included_limit integer,
  p_unit_amount_cents integer,
  p_monthly_limit integer,
  p_idempotency_key text
)
RETURNS TABLE(topup_id uuid, allowed boolean, monthly_count integer, topup_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing public.pragas_photo_topups%ROWTYPE;
  v_count integer;
  v_id uuid;
  v_month_start timestamptz := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
BEGIN
  IF p_app <> 'rumo-pragas'
     OR p_plan NOT IN ('producer', 'farm', 'agronomist')
     OR p_included_limit <= 0 OR p_unit_amount_cents <= 0
     OR p_monthly_limit < 1 OR p_cycle_end <= p_cycle_start
     OR length(p_idempotency_key) NOT BETWEEN 16 AND 128 THEN
    RAISE EXCEPTION 'invalid topup arguments';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_app || ':topup', 0));

  SELECT * INTO v_existing FROM public.pragas_photo_topups
   WHERE user_id = p_user_id AND app = p_app AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN QUERY SELECT v_existing.id, v_existing.status <> 'failed', 0, v_existing.status;
    RETURN;
  END IF;

  SELECT count(*)::integer INTO v_count FROM public.pragas_photo_topups
   WHERE user_id = p_user_id AND app = p_app
     AND created_at >= v_month_start AND created_at < v_month_start + interval '1 month'
     AND status IN ('pending', 'succeeded');

  IF v_count >= p_monthly_limit THEN
    RETURN QUERY SELECT NULL::uuid, false, v_count, 'limit'::text;
    RETURN;
  END IF;

  INSERT INTO public.pragas_photo_topups (
    user_id, app, cycle_start, cycle_end, plan, included_limit,
    unit_amount_cents, idempotency_key
  ) VALUES (
    p_user_id, p_app, p_cycle_start, p_cycle_end, p_plan, p_included_limit,
    p_unit_amount_cents, p_idempotency_key
  ) RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, true, v_count + 1, 'pending'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_pragas_photo_topup(
  p_topup_id uuid,
  p_user_id uuid,
  p_payment_intent_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.pragas_photo_topups%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.pragas_photo_topups
   WHERE id = p_topup_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_row.status = 'failed' THEN RETURN false; END IF;
  IF v_row.status = 'succeeded' THEN RETURN true; END IF;

  INSERT INTO public.pragas_photo_usage AS usage (
    user_id, app, cycle_start, cycle_end, plan, included_limit, extra_purchased
  ) VALUES (
    v_row.user_id, v_row.app, v_row.cycle_start, v_row.cycle_end,
    v_row.plan, v_row.included_limit, 1
  )
  ON CONFLICT (user_id, app, cycle_start) DO UPDATE SET
    cycle_end = EXCLUDED.cycle_end,
    plan = EXCLUDED.plan,
    included_limit = EXCLUDED.included_limit,
    extra_purchased = usage.extra_purchased + 1,
    updated_at = now();

  UPDATE public.pragas_photo_topups SET
    status = 'succeeded', stripe_payment_intent_id = p_payment_intent_id,
    completed_at = now()
  WHERE id = p_topup_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_pragas_photo_topup(
  p_topup_id uuid,
  p_user_id uuid,
  p_failure_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.pragas_photo_topups SET
    status = 'failed', failure_code = left(p_failure_code, 100), completed_at = now()
  WHERE id = p_topup_id AND user_id = p_user_id AND status = 'pending';
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_pragas_photo(uuid, text, text, timestamptz, timestamptz, integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_pragas_photo_reservation(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_pragas_photo_reservation(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.begin_pragas_photo_topup(uuid, text, text, timestamptz, timestamptz, integer, integer, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_pragas_photo_topup(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_pragas_photo_topup(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reserve_pragas_photo(uuid, text, text, timestamptz, timestamptz, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_pragas_photo_reservation(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_pragas_photo_reservation(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.begin_pragas_photo_topup(uuid, text, text, timestamptz, timestamptz, integer, integer, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_pragas_photo_topup(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_pragas_photo_topup(uuid, uuid, text) TO service_role;
