-- ============================================================
-- Migration: add email column to profiles
-- Run in Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. Add email column (nullable, unique)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Create unique index for fast webhook lookups
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_idx
  ON public.profiles (email)
  WHERE email IS NOT NULL;

-- 3. Backfill existing rows from auth.users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND p.email IS NULL;

-- 4. Update the handle_new_user trigger to also copy email on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Update upsert_profile RPC to accept and store email
CREATE OR REPLACE FUNCTION public.upsert_profile(
  p_name TEXT DEFAULT '',
  p_bio TEXT DEFAULT '',
  p_skills TEXT[] DEFAULT '{}',
  p_testimonials TEXT[] DEFAULT '{}',
  p_portfolio_links TEXT[] DEFAULT '{}',
  p_email TEXT DEFAULT NULL
)
RETURNS SETOF public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  INSERT INTO profiles (id, email, name, bio, skills, testimonials, portfolio_links, updated_at)
  VALUES (
    auth.uid(),
    COALESCE(p_email, (SELECT email FROM auth.users WHERE id = auth.uid())),
    p_name,
    p_bio,
    p_skills,
    p_testimonials,
    p_portfolio_links,
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email            = COALESCE(EXCLUDED.email, profiles.email),
    name             = EXCLUDED.name,
    bio              = EXCLUDED.bio,
    skills           = EXCLUDED.skills,
    testimonials     = EXCLUDED.testimonials,
    portfolio_links  = EXCLUDED.portfolio_links,
    updated_at       = NOW()
  RETURNING *;
END;
$$;
