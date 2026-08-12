-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- SR LEVEL HUB — replace the 4 Speed Runner save-slots with three level groups:
--   System (admin-curated, ordered, shared leaderboards) · My Levels (your Live worlds) · Community (Added).
-- Apply once in the Supabase SQL editor. Idempotent (IF NOT EXISTS / ON CONFLICT).
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- 1) worlds: three new flags/columns ------------------------------------------------------------------
--    is_system  — curated by the admin (krtaylor); shows in the "System" tab for everyone.
--    sort_order — admin-defined ordering of the System list (ascending; ties break by published_at).
--    is_live    — the OWNER has marked this world playable → shows in their own "My Levels" tab.
--                 (Distinct from is_published, which controls community-store visibility.)
ALTER TABLE worlds ADD COLUMN IF NOT EXISTS is_system  boolean DEFAULT false;
ALTER TABLE worlds ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;
ALTER TABLE worlds ADD COLUMN IF NOT EXISTS is_live    boolean DEFAULT false;

-- Fast reads for the System tab (ordered) and the My-Levels tab (owner + live + mode).
CREATE INDEX IF NOT EXISTS idx_worlds_system ON worlds (is_system, sort_order) WHERE is_system = true;
CREATE INDEX IF NOT EXISTS idx_worlds_live   ON worlds (creator_id, is_live)   WHERE is_live = true;

-- 2) world_added: the player's personal "Added from community" library ---------------------------------
--    Distinct from world_favorites (a "like"): this is "I put it in my play list".
CREATE TABLE IF NOT EXISTS world_added (
  user_id    uuid        NOT NULL,
  world_id   uuid        NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  added_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, world_id)
);
CREATE INDEX IF NOT EXISTS idx_world_added_user ON world_added (user_id, added_at DESC);

-- 3) OPTIONAL — promote your existing published Speed Runner worlds into the System list, in one go.
--    Uncomment + set your creator_id (or run the admin "Mark as System" action from the app instead).
-- UPDATE worlds SET is_system = true
--   WHERE creator_id = '<KRTAYLOR-USER-UUID>' AND mode = 'SPEEDRUNNER' AND is_published = true;
