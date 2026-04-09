-- ============================================================
-- GigAlertPro – Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL)
-- ============================================================

-- 1. User profiles (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT '',
  bio         TEXT NOT NULL DEFAULT '',
  skills      TEXT[] NOT NULL DEFAULT '{}',
  testimonials TEXT[] NOT NULL DEFAULT '{}',
  portfolio_links TEXT[] NOT NULL DEFAULT '{}',
  hourly_rate    NUMERIC,
  availability   TEXT NOT NULL DEFAULT 'available' CHECK (availability IN ('available', 'busy', 'unavailable')),
  plan        TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  -- Stripe subscription fields
  dodo_customer_id         TEXT,
  dodo_subscription_id     TEXT,
  subscription_status      TEXT,   -- trialing, active, past_due, cancelled
  billing_period           TEXT,   -- monthly, yearly
  cancel_at_period_end     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create a profile row when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Upsert profile – called from the client via supabase.rpc('upsert_profile', ...)
-- SECURITY DEFINER bypasses RLS so it always works.
CREATE OR REPLACE FUNCTION public.upsert_profile(
  p_name TEXT DEFAULT '',
  p_bio TEXT DEFAULT '',
  p_skills TEXT[] DEFAULT '{}',
  p_testimonials TEXT[] DEFAULT '{}',
  p_portfolio_links TEXT[] DEFAULT '{}'
)
RETURNS SETOF public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  INSERT INTO profiles (id, name, bio, skills, testimonials, portfolio_links, updated_at)
  VALUES (
    auth.uid(),
    p_name,
    p_bio,
    p_skills,
    p_testimonials,
    p_portfolio_links,
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    bio = EXCLUDED.bio,
    skills = EXCLUDED.skills,
    testimonials = EXCLUDED.testimonials,
    portfolio_links = EXCLUDED.portfolio_links,
    updated_at = NOW()
  RETURNING *;
END;
$$;

-- 2. Keywords tracked by each user
CREATE TABLE IF NOT EXISTS public.keywords (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  keyword     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, keyword)
);

-- 3. Gig alerts (matches found by the Reddit scanner)
CREATE TABLE IF NOT EXISTS public.gig_alerts (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reddit_post_id  TEXT NOT NULL UNIQUE,                 -- dedup key
  title           TEXT NOT NULL,
  body_preview    TEXT NOT NULL DEFAULT '',
  url             TEXT NOT NULL,
  subreddit       TEXT NOT NULL,
  budget          TEXT,
  author          TEXT,
  reddit_created  TIMESTAMPTZ NOT NULL,
  matched_keywords TEXT[] NOT NULL DEFAULT '{}',
  score           INTEGER NOT NULL DEFAULT 0,           -- relevance score 0-100
  comment_count   INTEGER NOT NULL DEFAULT 0,           -- Reddit comment count
  upvotes         INTEGER NOT NULL DEFAULT 0,           -- Reddit upvotes
  flair           TEXT,                                 -- Reddit link flair
  category        TEXT,                                 -- detected gig category
  source          TEXT NOT NULL DEFAULT 'reddit',       -- source platform: reddit, craigslist, x
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Per-user alert state (read/unread, dismissed, etc.)
CREATE TABLE IF NOT EXISTS public.user_alerts (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  alert_id    BIGINT NOT NULL REFERENCES public.gig_alerts(id) ON DELETE CASCADE,
  is_read     BOOLEAN NOT NULL DEFAULT false,
  dismissed   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, alert_id)
);

-- 5. Saved proposals
CREATE TABLE IF NOT EXISTS public.proposals (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  alert_id    BIGINT REFERENCES public.gig_alerts(id) ON DELETE SET NULL,
  gig_title   TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  text        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Scanner state (tracks last seen Reddit post per subreddit)
CREATE TABLE IF NOT EXISTS public.scanner_state (
  subreddit       TEXT PRIMARY KEY,
  last_post_id    TEXT NOT NULL DEFAULT '',
  last_scanned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Saved gigs (bookmarked by users)
CREATE TABLE IF NOT EXISTS public.saved_gigs (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  alert_id    BIGINT NOT NULL REFERENCES public.gig_alerts(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, alert_id)
);

-- Seed the subreddits we scan
INSERT INTO public.scanner_state (subreddit) VALUES
  ('forhire'), ('slavelabour'), ('freelance'), ('hiring'),
  ('jobbit'), ('remotework'), ('freelance_forhire'),
  ('gameDevClassifieds'), ('DesignJobs'), ('ProgrammingJobs'),
  ('CodingJobs'), ('Programmers_forhire'), ('SoftwareEngineerJobs'),
  ('WebDeveloperJobs'), ('techjobs'), ('WebDevJobs'),
  ('MachineLearningJobs'), ('DeveloperJobs'), ('GraphicDesignJobs'),
  ('Designers_forhire'), ('HireAnEditor'), ('ContentWriter_forhire'),
  ('IllustratorsForHire'), ('artistforhire'), ('forhire2'),
  ('YouTubeEditorsForHire'), ('VoiceWork'), ('VideoEditors_forhire'),
  ('VoiceActing'), ('MarketingJobs'), ('hireforgigs'),
  ('ForHireFreelance'), ('DevsForHire'), ('Jobs4Bitcoins'),
  ('WritingJobBoard'),
  ('RecruitingHiringPH'), ('VancouverJobs'),
  -- X / Nitter search feeds
  ('remotelegaljobs'),
  ('x:hiring-developer'), ('x:hiring-designer'), ('x:hiring-freelancer'),
  ('x:hiring-writer'), ('x:freelance-gig'), ('x:remote-developer-job'),
  ('x:looking-for-developer'), ('x:need-a-developer'),
  ('x:need-a-designer'), ('x:looking-for-freelancer')
ON CONFLICT DO NOTHING;

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================
ALTER TABLE public.profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keywords     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_alerts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposals    ENABLE ROW LEVEL SECURITY;
-- gig_alerts and scanner_state are read-only for users, write by service_role

-- ── Profiles policies ──
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ── Keywords policies ──
CREATE POLICY "Users can view own keywords"
  ON public.keywords FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own keywords"
  ON public.keywords FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own keywords"
  ON public.keywords FOR DELETE
  USING (auth.uid() = user_id);

-- ── gig_alerts: readable by all authenticated users (populated by scanner via service_role) ──
ALTER TABLE public.gig_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read gig_alerts"
  ON public.gig_alerts FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert gig_alerts"
  ON public.gig_alerts FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update gig_alerts"
  ON public.gig_alerts FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ── User alerts policies ──
CREATE POLICY "Users can view own user_alerts"
  ON public.user_alerts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own user_alerts"
  ON public.user_alerts FOR UPDATE
  USING (auth.uid() = user_id);

-- ── Proposals policies ──
CREATE POLICY "Users can view own proposals"
  ON public.proposals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own proposals"
  ON public.proposals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own proposals"
  ON public.proposals FOR DELETE
  USING (auth.uid() = user_id);

-- (Duplicate policies removed – see block above for the canonical definitions)

-- Scanner state: only service_role writes; authenticated can read
ALTER TABLE public.scanner_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read scanner_state" ON public.scanner_state FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================================
-- Indexes for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_keywords_user ON public.keywords(user_id);
CREATE INDEX IF NOT EXISTS idx_gig_alerts_created ON public.gig_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gig_alerts_subreddit ON public.gig_alerts(subreddit);
CREATE INDEX IF NOT EXISTS idx_gig_alerts_source ON public.gig_alerts(source);
CREATE INDEX IF NOT EXISTS idx_user_alerts_user ON public.user_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_alerts_read ON public.user_alerts(user_id, is_read) WHERE NOT is_read;
CREATE INDEX IF NOT EXISTS idx_proposals_user ON public.proposals(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_gigs_user ON public.saved_gigs(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_gigs_alert ON public.saved_gigs(alert_id);

-- Enable Realtime on tables that the frontend subscribes to
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.gig_alerts;

-- ============================================================
-- AI Usage Tracking
-- Records every OpenAI call per user for cost control & quotas.
-- Run this block in the Supabase SQL Editor.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ai_usage (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  model             TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  prompt_tokens     INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens      INTEGER NOT NULL DEFAULT 0,
  cost_estimate     NUMERIC(12, 8) NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

-- Users can read their own usage (for a future "Usage" dashboard)
CREATE POLICY "Users read own ai_usage"
  ON public.ai_usage FOR SELECT
  USING (auth.uid() = user_id);

-- Only the service_role backend can insert (api/generate-proposal.js writes via service key)
-- No INSERT policy for authenticated role — inserts are done server-side via service_role.

CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON public.ai_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON public.ai_usage(created_at DESC);
