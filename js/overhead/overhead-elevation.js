// ══════════════════════════════════════════════════════════════════════════
// Overhead Engine — elevation + autotile (§5). PURE, headless-testable.
//
// Elevation is faked with the classic 2.5D "staircase" trick — NO real 3D:
//   • each level lifts a cell's render Y by (level × STEP_PX);
//   • a visible cliff-face is drawn on the exposed south edge;
//   • everything is drawn in (row + elevation) order so higher rows / higher
//     ground correctly overlap what's behind + below.
//
// Walls between elevation levels are AUTOTILED — the wall sprite is chosen by a
// neighbour bitmask (which of the 4 cardinal neighbours sit at a LOWER level),
// so designers never hand-place directional wall pieces.
//
// Auto-Climb tiers (Disabled/1/2/Unlimited) gate how many levels a walking
// transition may cross. Jump elevation-crossing is a SEPARATE configurable
// (maxElevationJump, default 0 — see overhead-movement.js).
//
// LOS / ranged-blocking by elevation is ARCHITECTED here (config + a stub) but
// intentionally NOT implemented this session, per the brief.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const STEP_PX = 12;   // vertical render lift per elevation level (the staircase offset)

  // Bit flags for the 4 cardinal neighbours.
  const N = 1, E = 2, S = 4, W = 8;

  // Y-offset (render lift, negative = up-screen) for a given elevation level.
  const yOffset = (level) => -(level | 0) * STEP_PX;

  // Height of the exposed cliff-face below a cell, in px, given the drop to the
  // cell to its south (0 if no drop). Used to draw the cliff texture.
  function cliffHeight(level, southLevel) {
    const drop = (level | 0) - (southLevel | 0);
    return drop > 0 ? drop * STEP_PX : 0;
  }

  // Autotile bitmask for a wall/edge cell: set a bit for each cardinal neighbour
  // that is LOWER than this cell (i.e. an exposed edge on that side). getLevel is
  // a function (col,row)->level|null (null = out of bounds → treated as lower).
  function edgeBitmask(col, row, level, getLevel) {
    let m = 0;
    const lower = (c, r) => { const l = getLevel(c, r); return l == null || l < level; };
    if (lower(col, row - 1)) m |= N;
    if (lower(col + 1, row)) m |= E;
    if (lower(col, row + 1)) m |= S;
    if (lower(col - 1, row)) m |= W;
    return m;
  }

  // Draw-order key: higher = drawn later (in front). row dominates; elevation is
  // a tiebreaker so a raised cell in the same row draws in front of flat ground.
  const drawKey = (row, level) => row * 1000 + (level | 0);

  // Sort a list of {row, level, ...} for painter's-algorithm rendering.
  function sortForDraw(items) {
    return items.slice().sort((a, b) => drawKey(a.row, a.level || 0) - drawKey(b.row, b.level || 0));
  }

  // Auto-Climb: may a walking transition from `fromLevel` to `toLevel` happen?
  // tier: 'disabled' | '1' | '2' | 'unlimited' (or 0/1/2/Infinity).
  function autoClimbAllows(fromLevel, toLevel, tier) {
    const diff = Math.abs((toLevel | 0) - (fromLevel | 0));
    if (diff === 0) return true;                 // same level always fine
    const cap = climbCap(tier);
    return diff <= cap;
  }
  function climbCap(tier) {
    if (tier === 'unlimited' || tier === Infinity) return Infinity;
    if (tier === 'disabled' || tier == null || tier === 0 || tier === 'none') return 0;
    const n = parseInt(tier, 10);
    return Number.isFinite(n) ? n : 0;
  }

  // ── Stairs / Ramps ─────────────────────────────────────────────────────────
  // A stair/ramp placeable declares the two levels it bridges and its axis. It
  // ALWAYS permits crossing its declared 1-level (or n-level) delta regardless of
  // the auto-climb tier — it's an explicit designer-placed transition.
  function rampAllows(ramp, fromLevel, toLevel) {
    if (!ramp) return false;
    const a = ramp.lowLevel | 0, b = ramp.highLevel | 0;
    return (fromLevel === a && toLevel === b) || (fromLevel === b && toLevel === a);
  }

  // ── LOS / ranged-blocking (ARCHITECTED, not implemented — brief §5/§17) ──────
  // Config lives on the world: { losBlockLevels, hideLevels }. The predicate is a
  // stub that always returns false this session, so callers can wire the call site
  // now and the logic can drop in later with no rework.
  function losBlocked(/* fromCell, toCell, getLevel, cfg */) {
    return false;   // TODO(elevation-LOS): implement level-difference sightline blocking
  }

  const OH_ELEV = {
    STEP_PX, N, E, S, W,
    yOffset, cliffHeight, edgeBitmask, drawKey, sortForDraw,
    autoClimbAllows, climbCap, rampAllows, losBlocked,
  };

  if (typeof window !== 'undefined') window.OH_ELEV = OH_ELEV;
  if (typeof module !== 'undefined' && module.exports) module.exports = { OH_ELEV };
})();
