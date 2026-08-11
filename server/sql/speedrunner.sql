-- ============================================================
-- speedrunner.sql — Speed Runner storefront / level-state / leaderboard migrations.
-- Run in the Supabase SQL editor (additive; safe to re-run). Format model: community.sql.
-- Prereqs (confirmed present 2026-08-11): community.sql + stats.sql applied.
-- ============================================================

-- 1. LEVEL STATES — Draft / Live / Published, downloadable opt-in, immutable creator.
ALTER TABLE public.worlds ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT 'draft'
  CHECK (state IN ('draft','live','published'));
ALTER TABLE public.worlds ADD COLUMN IF NOT EXISTS downloadable BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.worlds ADD COLUMN IF NOT EXISTS original_author_id UUID;

-- Backfill: anything already published becomes 'published'.
UPDATE public.worlds SET state = 'published' WHERE is_published = TRUE AND state = 'draft';

-- Provenance is stamped once and must never change (a downloader can't rewrite the creator).
CREATE OR REPLACE FUNCTION public.lock_original_author() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.original_author_id IS NOT NULL
     AND NEW.original_author_id IS DISTINCT FROM OLD.original_author_id THEN
    RAISE EXCEPTION 'original_author_id is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lock_original_author ON public.worlds;
CREATE TRIGGER trg_lock_original_author
  BEFORE UPDATE ON public.worlds
  FOR EACH ROW EXECUTE FUNCTION public.lock_original_author();

-- 2. PLAY COUNT + RECENCY — Most-Played / Trending sorts.
ALTER TABLE public.worlds ADD COLUMN IF NOT EXISTS play_count      INT NOT NULL DEFAULT 0;
ALTER TABLE public.worlds ADD COLUMN IF NOT EXISTS last_played_at  TIMESTAMPTZ;

-- 3. RATING AVERAGE — fixes the sum-vs-avg sort (was ordering by rating_sum).
ALTER TABLE public.worlds ADD COLUMN IF NOT EXISTS rating_avg NUMERIC
  GENERATED ALWAYS AS (CASE WHEN rating_count > 0 THEN rating_sum::NUMERIC / rating_count ELSE 0 END) STORED;
CREATE INDEX IF NOT EXISTS idx_worlds_rating_avg ON public.worlds (rating_avg DESC);

-- 4. TAGS — GIN-indexed array + curated tag list + request queue.
ALTER TABLE public.worlds ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_worlds_tags ON public.worlds USING GIN (tags);

CREATE TABLE IF NOT EXISTS public.system_tags (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tag_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by UUID,
  name         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. THUMBNAILS — capture URL / data-URI column. (ALSO create a public Storage bucket
--    'world-thumbnails' in the dashboard — that step is manual.)
ALTER TABLE public.worlds ADD COLUMN IF NOT EXISTS thumbnail TEXT;

-- 6. PER-LEVEL ACHIEVEMENT UNLOCKS — world scope on the existing table.
ALTER TABLE public.player_achievements ADD COLUMN IF NOT EXISTS world_id UUID;
CREATE INDEX IF NOT EXISTS idx_player_ach_world ON public.player_achievements (player_id, world_id);

-- 7. LEADERBOARD RE-KEY — speedrun_results.level_id ("author:worldName") -> worlds.id.
ALTER TABLE public.speedrun_results ADD COLUMN IF NOT EXISTS world_id UUID;
UPDATE public.speedrun_results r
   SET world_id = w.id
  FROM public.worlds w
  JOIN public.users u ON u.id = w.creator_id
 WHERE r.world_id IS NULL
   AND r.level_id = u.username || ':' || w.world_name;
CREATE INDEX IF NOT EXISTS idx_speedrun_world ON public.speedrun_results (world_id);

-- Published cap (2 -> 20) is CODE (server/worlds-routes.js PUBLISH_CAP), not SQL.
-- ============================================================
