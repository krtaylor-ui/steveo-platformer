-- Phase 3A.2 — Arena per-mode leaderboards.
-- Run this in the Supabase SQL editor before testing leaderboards.
--
-- player_id is intentionally NOT a foreign key: the `worlds` table's creator_id
-- references public.users, but keeping arena_results FK-free avoids coupling the
-- leaderboard to that table during migration. (To add one later:
--   ALTER TABLE arena_results
--     ADD CONSTRAINT arena_results_player_fk
--     FOREIGN KEY (player_id) REFERENCES public.users(id) ON DELETE CASCADE; )

CREATE TABLE IF NOT EXISTS arena_results (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   UUID NOT NULL,
  player_name TEXT,
  mode        TEXT NOT NULL,
  score       INT  NOT NULL,
  duration    INT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arena_results_mode_score
  ON arena_results (mode, score DESC);
