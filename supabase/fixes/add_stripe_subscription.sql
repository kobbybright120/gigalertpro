-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Add Stripe subscription columns to profiles table
-- Run this in: Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dodo_customer_id         TEXT,
  ADD COLUMN IF NOT EXISTS dodo_subscription_id     TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status      TEXT,
  ADD COLUMN IF NOT EXISTS billing_period           TEXT,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end     BOOLEAN NOT NULL DEFAULT false;

-- Index for fast webhook lookups by Stripe customer ID
CREATE INDEX IF NOT EXISTS profiles_dodo_customer_id_idx
  ON public.profiles (dodo_customer_id)
  WHERE dodo_customer_id IS NOT NULL;
