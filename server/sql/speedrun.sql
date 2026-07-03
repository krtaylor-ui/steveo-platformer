-- Speed Run leaderboards (hybrid with the client localStorage top-5).
-- Run this in the Supabase SQL editor before testing server-backed speed-run
-- times. Additive and safe; the client keeps working offline without it (the
-- /api/speedrun/* endpoints just 500 and the local top-5 is used).
--
-- player_id is intentionally NOT a foreign key (same rationale as arena_results).
-- level_id mirrors the client's `sr_lb_${levelId}` key (playerName:worldName).

CREATE TABLE IF NOT EXISTS speedrun_results (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   UUID NOT NULL,
  player_name TEXT,          -- account username (for the future browse screen)
  level_id    TEXT NOT NULL, -- playerName:worldName
  initials    TEXT,          -- classic arcade 3-4 letter display
  ms          INT  NOT NULL, -- run time in milliseconds (lower = better)
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Fast top-N per level (fastest first).
CREATE INDEX IF NOT EXISTS idx_speedrun_results_level_ms
  ON speedrun_results (level_id, ms ASC);
