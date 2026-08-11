// §A2 — level validator (pure, migration-free). A level must have at least one FINISH before it can go
// Live / Published, so a player can never get stuck in an unwinnable published level. Handles BOTH
// representations: the 2D side-scroll grid (a BLOCK.GOAL cell) and the overhead world (world.goal, or a
// building/portal flagged config.isGoal). Used to gate the Draft→Live/Published state transition (Epic A).
const GOAL_BLOCK_ID = 10;   // BLOCK.GOAL (js/blocks.js)

const LEVEL_VALIDATOR = {
  // Returns true if the world data contains at least one finish/goal.
  hasFinish(worldData) {
    if (!worldData || typeof worldData !== 'object') return false;

    // Overhead goal cell (a {col,row,...}) or a building/portal flagged as the goal.
    if (worldData.goal) return true;
    if (Array.isArray(worldData.buildings)) {
      for (const b of worldData.buildings) {
        if (b && ((b.config && b.config.isGoal) || b.isGoal)) return true;
      }
    }

    // 2D side-scroll grid: any BLOCK.GOAL cell.
    const grid = worldData.grid;
    if (Array.isArray(grid)) {
      for (const row of grid) {
        if (!Array.isArray(row)) continue;
        for (const cell of row) if (cell === GOAL_BLOCK_ID) return true;
      }
    }
    return false;
  },

  // Convenience for the state gate: { ok, reason }.
  canGoLive(worldData) {
    return this.hasFinish(worldData)
      ? { ok: true }
      : { ok: false, reason: 'Add at least one Goal (finish) before making this level Live or Published.' };
  },
};

if (typeof window !== 'undefined') window.LEVEL_VALIDATOR = LEVEL_VALIDATOR;
if (typeof module !== 'undefined' && module.exports) module.exports = LEVEL_VALIDATOR;
