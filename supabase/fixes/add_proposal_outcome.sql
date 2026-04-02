-- Migration: add outcome tracking to proposals
-- Run this once in your Supabase SQL editor

ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS outcome TEXT
  CHECK (outcome IN ('won', 'replied', 'no_response'));

-- Index for fast few-shot queries (fetch winning proposals by user)
CREATE INDEX IF NOT EXISTS idx_proposals_outcome
  ON proposals (user_id, outcome, created_at DESC);
