-- Campaign Mode (MVP) — server-backed storage.
-- Run this in the Supabase SQL editor before testing Campaign mode.
--
-- Two tables:
--   campaigns          — one row per Campaign (definition = the full CAMPAIGN_MODEL
--                        object: zones, worlds, goalStarRouting, labels, etc.).
--   campaign_progress  — one row per (campaign, player): current world, completed
--                        worlds' best scores, discovered secrets, running inventory.
--
-- Publishing rule (§6/§11): only one Campaign may be is_published = TRUE at a
-- time, and only the admin account may flip it (enforced in campaign-routes.js,
-- not in the schema — the app owns that policy).
--
-- creator_id / player_id are intentionally NOT foreign keys (mirrors
-- arena_results.sql) to avoid coupling the migration to public.users.

CREATE TABLE IF NOT EXISTS campaigns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id   UUID NOT NULL,
  creator_name TEXT,
  name         TEXT NOT NULL,
  definition   JSONB NOT NULL,
  is_published BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_creator   ON campaigns (creator_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_published ON campaigns (is_published) WHERE is_published = TRUE;

CREATE TABLE IF NOT EXISTS campaign_progress (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL,
  player_id   UUID NOT NULL,
  progress    JSONB NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (campaign_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_progress_player ON campaign_progress (player_id);
