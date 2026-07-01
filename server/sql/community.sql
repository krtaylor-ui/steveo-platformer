-- ============================================================
-- community.sql — Phase 3 Community Browse + Publishing polish
-- Run in the Supabase SQL editor (additive; safe to re-run).
-- ============================================================

-- Publishing polish: publication timestamp + rating rollups on the worlds table.
ALTER TABLE public.worlds ADD COLUMN IF NOT EXISTS published_at   TIMESTAMPTZ;
ALTER TABLE public.worlds ADD COLUMN IF NOT EXISTS genre          TEXT;
ALTER TABLE public.worlds ADD COLUMN IF NOT EXISTS difficulty     TEXT;      -- EASY | MEDIUM | HARD
ALTER TABLE public.worlds ADD COLUMN IF NOT EXISTS download_count INT NOT NULL DEFAULT 0;
ALTER TABLE public.worlds ADD COLUMN IF NOT EXISTS rating_sum     INT NOT NULL DEFAULT 0;
ALTER TABLE public.worlds ADD COLUMN IF NOT EXISTS rating_count   INT NOT NULL DEFAULT 0;
-- original_author preserves attribution across downloads/forks (creator_name of the source).
ALTER TABLE public.worlds ADD COLUMN IF NOT EXISTS original_author TEXT;

CREATE INDEX IF NOT EXISTS idx_worlds_published ON public.worlds (is_published, published_at DESC);

-- ── Favorites: one row per (user, world) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.world_favorites (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  world_id   UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, world_id)
);
CREATE INDEX IF NOT EXISTS idx_world_favorites_user  ON public.world_favorites (user_id);
CREATE INDEX IF NOT EXISTS idx_world_favorites_world ON public.world_favorites (world_id);

-- ── Ratings: one row per (user, world); 1–5 stars ───────────────────
CREATE TABLE IF NOT EXISTS public.world_ratings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  world_id   UUID NOT NULL,
  stars      INT  NOT NULL CHECK (stars BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, world_id)
);
CREATE INDEX IF NOT EXISTS idx_world_ratings_world ON public.world_ratings (world_id);
