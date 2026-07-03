-- ============================================================
-- stats.sql — Phase 4 (basic) Achievements + Analytics + per-world/PB leaderboards
-- Run in the Supabase SQL editor (additive; safe to re-run).
-- ============================================================

-- Per-world + personal-best leaderboards reuse arena_results with a world_id.
ALTER TABLE public.arena_results ADD COLUMN IF NOT EXISTS world_id UUID;
CREATE INDEX IF NOT EXISTS idx_arena_results_world ON public.arena_results (world_id, mode, score DESC);
CREATE INDEX IF NOT EXISTS idx_arena_results_player ON public.arena_results (player_id, mode, score DESC);

-- ── Player stats: one row per player (usage analytics) ──────────────
CREATE TABLE IF NOT EXISTS public.player_stats (
  player_id     UUID PRIMARY KEY,
  player_name   TEXT,
  matches_played INT NOT NULL DEFAULT 0,
  wins          INT NOT NULL DEFAULT 0,
  kills         INT NOT NULL DEFAULT 0,
  deaths        INT NOT NULL DEFAULT 0,
  ctf_captures  INT NOT NULL DEFAULT 0,
  worlds_published INT NOT NULL DEFAULT 0,
  play_time_ms  BIGINT NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Achievements: one row per (player, achievement key) unlock ──────
CREATE TABLE IF NOT EXISTS public.player_achievements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id     UUID NOT NULL,
  achievement   TEXT NOT NULL,          -- key, e.g. 'first_win', 'first_publish', 'first_capture'
  unlocked_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, achievement)
);
CREATE INDEX IF NOT EXISTS idx_player_achievements_player ON public.player_achievements (player_id);
