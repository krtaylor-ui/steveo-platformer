// ============================================================
// moving-platform.js — Moving Platform math (§Moving Platforms), PURE + headless-testable
// ------------------------------------------------------------
// A RAIL is a waypoint path (same model as a Travel Tube — see travel-tube.js) that one or more
// PLATFORMS ride. A platform is a connected group of blocks bound to an ANCHOR that sits on the rail.
// The geometry of the rail centerline is reused from TRAVEL_TUBE (buildPolyline / pointAt / length);
// this module owns the platform-SPECIFIC math so the tricky bits (traversal at the ends, weighted
// mass, ballistic launch, center-of-gravity tilt) can be verified headless before trusting the feel:
//   • advance()      — move a distance along the rail honoring loop / round-trip / one-way ends.
//   • weight()       — per-block-type weighted sum (default 1 each → behaves like a plain count).
//   • centerOfMass() — weighted centroid (world px) for Center-of-Gravity tilt + collision compare.
//   • ballisticStep()— one Euler step of projectile motion for the Launch Platform arc.
//   • tiltAngle()    — static seesaw tilt from the anchor→center-of-mass horizontal offset.
//   • floodFill()    — the connected block set bound to an anchor (computed once at author/save time).
//
// Coordinates are world pixels; a cell is `bs` px (default 32). game.js owns state, input, rendering,
// collision, and moving real entities; it calls these helpers for the numbers.
// ============================================================

const MOVING_PLATFORM = {
  BS: 32,

  // Advance `dist` (px along the rail) by `dir*step`, honoring end behavior. Returns
  // { dist, dir, atEnd, stopped }:
  //   • loop:true      → wrap around [0,L) (closed-loop rail, never stops, never reverses).
  //   • roundTrip:true → bounce: reverse `dir` at 0 and L (open rail, Round-Trip return mode).
  //   • otherwise      → One-Way: clamp at the far end and report stopped (the platform parks there).
  advance(dist, dir, step, L, opts = {}) {
    const { loop = false, roundTrip = false } = opts;
    if (!(L > 0)) return { dist: 0, dir, atEnd: true, stopped: !loop };   // degenerate/static rail
    let d = dist + dir * step;
    if (loop) {
      d = ((d % L) + L) % L;
      return { dist: d, dir, atEnd: false, stopped: false };
    }
    if (d <= 0)  return { dist: 0, dir: roundTrip ?  1 : dir, atEnd: true, stopped: !roundTrip };
    if (d >= L)  return { dist: L, dir: roundTrip ? -1 : dir, atEnd: true, stopped: !roundTrip };
    return { dist: d, dir, atEnd: false, stopped: false };
  },

  // Per-block-type weighted sum over a platform's construction cells. `weightOf(blockType)` returns a
  // number (default 1 for every type today, so this == block count until per-type weights are tuned).
  weight(cells, weightOf) {
    let w = 0;
    for (const c of cells) w += Math.max(0, weightOf ? (weightOf(c.blockType) ?? 1) : 1);
    return w;
  },

  // Weighted centroid of the cells in world px, plus the total weight. Returns null for an empty set.
  // `extra` = optional [{x,y,weight}] point masses (e.g. a rider standing on the platform).
  centerOfMass(cells, bs, weightOf, extra) {
    let wx = 0, wy = 0, tw = 0;
    for (const c of cells) {
      const w = Math.max(0, weightOf ? (weightOf(c.blockType) ?? 1) : 1);
      wx += (c.col * bs + bs / 2) * w;
      wy += (c.row * bs + bs / 2) * w;
      tw += w;
    }
    if (extra) for (const e of extra) { wx += e.x * e.weight; wy += e.y * e.weight; tw += e.weight; }
    if (tw <= 0) return null;
    return { x: wx / tw, y: wy / tw, weight: tw };
  },

  // One Euler integration step of projectile motion. Returns the next {x,y,vx,vy}. Gravity pulls +y.
  ballisticStep(x, y, vx, vy, g) {
    return { x: x + vx, y: y + vy, vx, vy: vy + g };
  },

  // Exit velocity off a launch ramp: the platform's current scalar speed directed along the ramp's
  // exit heading (radians). Returns {vx,vy}.
  launchVelocity(speed, exitAngle) {
    return { vx: Math.cos(exitAngle) * speed, vy: Math.sin(exitAngle) * speed };
  },

  // Static seesaw tilt (radians) from the horizontal offset between the pivot (anchor) x and the
  // center-of-mass x. `stiffness` scales offset→angle; result clamped to ±maxAngle. Heavier side sinks.
  tiltAngle(pivotX, comX, maxAngle, stiffness = 0.006) {
    const offset = comX - pivotX;                 // +→ mass is to the right, right side drops
    const a = offset * stiffness;
    return Math.max(-maxAngle, Math.min(maxAngle, a));
  },

  // Connected-component flood fill from an anchor cell over grid cells that pass `isBlock(col,row)`.
  // 4-connectivity. Returns an array of {col,row} (includes the anchor cell if it passes). Bounded by
  // `limit` cells as a runaway guard. Used ONCE at author/save time to freeze a platform's structure.
  floodFill(anchorCol, anchorRow, isBlock, limit = 4096) {
    const out = [];
    if (!isBlock(anchorCol, anchorRow)) return out;
    const seen = new Set();
    const stack = [[anchorCol, anchorRow]];
    seen.add(anchorCol + ',' + anchorRow);
    while (stack.length && out.length < limit) {
      const [c, r] = stack.pop();
      out.push({ col: c, row: r });
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc, nr = r + dr, k = nc + ',' + nr;
        if (!seen.has(k) && isBlock(nc, nr)) { seen.add(k); stack.push([nc, nr]); }
      }
    }
    return out;
  },
};

if (typeof window !== 'undefined') window.MOVING_PLATFORM = MOVING_PLATFORM;
if (typeof module !== 'undefined' && module.exports) module.exports = { MOVING_PLATFORM };
