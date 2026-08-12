// §E7 WIND / CURRENT ZONES — pure, headless-testable core of the epic wind mechanic (§16).
//
// A wind zone is a placed rectangular region with a DIRECTION (8-way) + STRENGTH that pushes entities
// while they're inside it. It works in BOTH engines (2D + overhead) and in ALL play modes. Two twists the
// brief calls out live here as pure logic so they can be tested without a browser:
//   • WALL-BLOCKING — a solid barrier of >= a configurable thickness within the zone stops the wind past
//     it (cells in its downwind shadow get no push). shadowedCells() computes that shadow set.
//   • REDSTONE GATING — a zone wired to redstone only blows while powered. active() decides that.
//
// Directions are {x,y} with each component in {-1,0,1} (E = {1,0}, NE = {1,-1} with y-down screen coords,
// i.e. -y = up). Strength is a per-frame acceleration magnitude; forceFor() normalizes diagonals so they
// aren't √2 stronger.
const WIND = {
  // 8-way compass → {x,y} (screen coords: +x right, +y DOWN, so up = -y).
  DIRS: {
    right: { x: 1, y: 0 }, left: { x: -1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
    upright: { x: 1, y: -1 }, upleft: { x: -1, y: -1 }, downright: { x: 1, y: 1 }, downleft: { x: -1, y: 1 },
  },

  vec(dir) {
    if (dir && typeof dir === 'object' && 'x' in dir) return dir;
    return this.DIRS[dir] || this.DIRS.right;
  },

  // Per-frame acceleration {ax,ay} for a wind of `strength` in `dir`, scaled by an airborne/grounded
  // factor. Diagonals are normalized so they push at the same speed as a cardinal wind.
  forceFor(dir, strength, grounded, cfg) {
    const v = this.vec(dir);
    const len = Math.hypot(v.x, v.y) || 1;
    const gFactor = grounded ? (cfg && cfg.groundedFactor != null ? cfg.groundedFactor : (cfg && cfg.affectsGrounded ? 0.35 : 0)) : 1;
    const s = strength * gFactor;
    return { ax: (v.x / len) * s, ay: (v.y / len) * s };
  },

  // Is the zone currently blowing? A zone with no redstone channel always blows; one wired to a channel
  // blows only when that channel is powered. `isPowered(channel)` is supplied by the engine.
  active(zone, isPowered) {
    if (!zone) return false;
    if (zone.channel == null || zone.channel === '') return true;
    return !!(isPowered && isPowered(zone.channel));
  },

  // The set ("col,row") of zone cells in the DOWNWIND SHADOW of a wall — a run of >= `thickness`
  // consecutive solid cells lying upwind (within the zone) between the cell and the wind's source edge.
  // cells = [{col,row}] of the zone's bounding box; isSolid(col,row) = grid solidity.
  shadowedCells(cells, dir, isSolid, thickness) {
    const out = new Set();
    const v = this.vec(dir);
    if (!v.x && !v.y) return out;
    const t = Math.max(1, thickness || 2);
    const inZone = new Set(cells.map((c) => c.col + ',' + c.row));
    const maxSteps = cells.length + 4;
    for (const c of cells) {
      if (isSolid(c.col, c.row)) continue;            // solid cells aren't wind cells
      let run = 0, shadowed = false, cc = c.col - v.x, cr = c.row - v.y;   // step UPWIND
      for (let i = 0; i < maxSteps; i++) {
        if (!inZone.has(cc + ',' + cr)) break;        // reached the zone's upwind edge = the wind source
        if (isSolid(cc, cr)) { run++; if (run >= t) { shadowed = true; break; } }
        else run = 0;
        cc -= v.x; cr -= v.y;
      }
      if (shadowed) out.add(c.col + ',' + c.row);
    }
    return out;
  },

  // Convenience: does the wind reach cell (col,row) of the zone this frame? (not solid, not shadowed).
  reaches(col, row, shadow, isSolid) {
    return !isSolid(col, row) && !shadow.has(col + ',' + row);
  },
};

if (typeof window !== 'undefined') window.WIND = WIND;
if (typeof module !== 'undefined' && module.exports) module.exports = { WIND };
