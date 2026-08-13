-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- WORLD PROGRESS — per-(player, world) save so the Level Hub can offer Play / Continue / Restart on
-- Normal & Platformer levels (unlimited worlds, so decoupled from the old 4-slot games table).
-- Apply once in the Supabase SQL editor. Idempotent.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS world_progress (
  user_id    uuid        NOT NULL,
  world_id   uuid        NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  game_data  jsonb,                         -- GAME_STATE.serialize() snapshot; presence = "in progress"
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, world_id)
);
CREATE INDEX IF NOT EXISTS idx_world_progress_user ON world_progress (user_id);
