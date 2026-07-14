// ============================================================
// pathfinding.js — Shared tile-grid A* / reachability subsystem
// ------------------------------------------------------------
// The SINGLE source of truth for "can a platformer-physics actor travel from
// cell A to cell B, and by what route?" Ported verbatim from the physics-honest
// BFS reachability checker in tools/gen-sample-worlds.js (Speed-Run validator),
// so a level that has been validated as completable for a PLAYER is, by
// construction, sane for MOB pathing too — same movement envelope, one model.
//
// Smart Mobs §6 (Wayfinding) is the first consumer; it is deliberately built as
// a reusable subsystem (see FUTURE_ROADMAP §4 — Arena objective-bots + the
// TD/MOBA free-roam escape hatch are the intended future consumers).
//
// GRID-AGNOSTIC. Everything operates on a `nav` adapter, so the same code runs
// against the browser Level (`level.isSolid(row,col)` + `level.grid`) and the
// Node generator's own grid. A `nav` is:
//   { W, H,
//     solid(c, r)  -> is the block at column c, row r solid (out-of-bounds = wall)
//     hazard(c, r) -> is it a deadly block a mob must never stand in (lava)
//     pad(c, r)    -> is it a jump-pad block (launches much higher/farther) }
// NOTE the (c, r) = (col, row) order — matches the generator; the browser
// adapter swaps into level's (row, col) internally.
//
// Two entry points share ONE neighbour model (navNeighbors):
//   navReachable(nav, sc, sr, opts) -> Set<"c,r"> of every reachable cell (the
//                                      generator's structural validator uses this)
//   findMobPath(nav, start, goal, opts) -> { path:[[c,r],...], cost } | null
//                                      (mobs use this to get an actual route)
// ============================================================

// Physics envelope — the movement-cost model. These mirror js/constants.js
// (GRAVITY 0.66, JUMP_VELOCITY -12, MOVE_SPEED 6 => apex ~3.4 blk, same-level
// gap ~6.8 blk) and are the numbers the Speed-Run validator has always used.
const NAV_MAX_JUMP_UP = 3;    // blocks the jump apex clears
const NAV_MAX_JUMP_DX = 6;    // horizontal blocks in one same-level jump
const NAV_MAX_DROP    = 40;   // blocks an actor may fall to land
const NAV_PAD_JUMP_UP = 7;    // JUMP_PAD launch apex (vy ~ -18 => ~7.6 blocks)
const NAV_PAD_JUMP_DX = 10;   // JUMP_PAD horizontal reach

// A cell (c,r) is standable if the block below is solid and the actor's body
// (feet row r + head row r-1) is clear of solids/hazards. (Verbatim from the
// generator's standable().)
function navStandable(nav, c, r) {
  if (r < 1 || r >= nav.H - 1 || c < 0 || c >= nav.W) return false;
  if (!nav.solid(c, r + 1)) return false;
  if (nav.solid(c, r) || nav.hazard(c, r)) return false;
  if (nav.solid(c, r - 1) || nav.hazard(c, r - 1)) return false;
  return true;
}

function navPassable(nav, c, r) { return !nav.solid(c, r) && !nav.hazard(c, r); }

// Nearest standable at/below (c,r) within NAV_MAX_DROP — models a walk-off-ledge
// fall (and is used to snap an airborne start/goal down to the ground).
function navDropTo(nav, c, r) {
  const maxR = Math.min(nav.H - 2, r + NAV_MAX_DROP);
  for (let rr = r; rr <= maxR; rr++) if (navStandable(nav, c, rr)) return rr;
  return -1;
}

function _navKey(c, r) { return c + ',' + r; }

// The shared neighbour model: from a standable cell, every standable cell the
// actor can reach in one "move" — a walk step, a walk-off-ledge drop, or a jump
// honouring the arc-gated envelope (horizontal reach shrinks the higher you go).
// Standing on a JUMP_PAD swaps in the larger pad envelope. Verbatim port of the
// generator's reachable() inner loop; `out` is filled with [c, r, dc, dr] so
// callers can cost each edge by how it was traversed (dr<0 = climb, dr>0 = drop).
function navNeighbors(nav, c, r, baseUp, baseDx, out, wallClimb) {
  out.length = 0;
  // walk left/right (same row) or drop off a ledge
  for (const dc of [-1, 1]) {
    const nc = c + dc;
    if (navStandable(nav, nc, r)) {
      out.push([nc, r, dc, 0]);
    } else if (navPassable(nav, nc, r) && navPassable(nav, nc, r - 1)) {
      const lr = navDropTo(nav, nc, r);
      if (lr >= 0) out.push([nc, lr, dc, lr - r]);
    }
  }
  // jumps: up to jUp up, NAV_MAX_DROP down, jDx across.
  const onPad = nav.pad(c, r + 1);
  const jUp = onPad ? Math.max(NAV_PAD_JUMP_UP, baseUp) : baseUp;
  const jDx = onPad ? Math.max(NAV_PAD_JUMP_DX, baseDx) : baseDx;
  // Can't gain height with a ceiling directly on your head. A 2-cell body's head
  // sits at r-1; to RISE, the cell it moves into (r-2) must be clear. Under a
  // one-block overhang r-2 is solid, so ALL upward jumps from here are impossible
  // — dropping them forces A* to route out sideways/back to a spot with headroom
  // and jump from there ("back up and jump over the canopy") instead of returning
  // a shorter but un-followable straight-up jump (the "vibrate under the overhang"
  // bug). Horizontal jumps + drops are unaffected.
  const headBlocked = nav.solid(c, r - 2);
  for (let dc = -jDx; dc <= jDx; dc++) {
    for (let dr = -jUp; dr <= NAV_MAX_DROP; dr++) {
      if (dc === 0 && dr === 0) continue;
      if (dr < 0 && headBlocked) continue;   // overhang overhead → no upward jump from this cell
      const nc = c + dc, nr = r + dr;
      if (!navStandable(nav, nc, nr)) continue;
      // horizontal reach shrinks the higher you go (rough arc gate)
      const upCost = dr < 0 ? -dr : 0;
      const budget = jDx - upCost;
      if (Math.abs(dc) > Math.max(1, budget)) continue;
      out.push([nc, nr, dc, dr]);
    }
  }
  // Wall-jump climb (bots only — passed via opts.wallClimb; mobs + the generator
  // pass 0). Pressed against a wall you can scrabble UPWARD (wall-slide + wall-jump),
  // so from a wall-adjacent cell reach standable cells up to `wallClimb` blocks higher
  // where a wall persists. Only adds UPWARD, wall-backed edges — never an open-gap
  // crossing — so it can't make the planner think it can cross a gap it can't.
  if (wallClimb > 0) {
    for (const wd of [-1, 1]) {
      if (!nav.solid(c + wd, r) && !nav.solid(c + wd, r - 1)) continue;  // need a wall beside (body height)
      for (let up = 1; up <= wallClimb; up++) {
        for (const nc of [c, c + wd]) {                   // top out ON the wall, or up the shaft
          const nr = r - up;
          if (navStandable(nav, nc, nr)) out.push([nc, nr, nc - c, -up]);
        }
      }
    }
  }
  return out;
}

// BFS over standable cells honouring the jump envelope. Returns the reachable
// Set of "c,r". This is exactly what the generator's structural validator needs;
// it is kept here so the validator and the mob pathfinder never drift apart.
function navReachable(nav, startC, startR, opts) {
  opts = opts || {};
  const baseUp = opts.maxUp || NAV_MAX_JUMP_UP;
  const baseDx = opts.maxDx || NAV_MAX_JUMP_DX;
  let sr = navStandable(nav, startC, startR) ? startR : navDropTo(nav, startC, startR);
  if (sr < 0) return new Set();
  const seen = new Set([_navKey(startC, sr)]);
  const q = [[startC, sr]];
  const nbrs = [];
  while (q.length) {
    const [c, r] = q.pop();
    navNeighbors(nav, c, r, baseUp, baseDx, nbrs);
    for (const n of nbrs) {
      const k = _navKey(n[0], n[1]);
      if (!seen.has(k)) { seen.add(k); q.push([n[0], n[1]]); }
    }
  }
  return seen;
}

// ── Edge cost model (drives "ambush from above") ─────────────
// Horizontal travel is the dominant cost (~1 / block = time to walk/leap it).
// Climbing UP is extra effort; DROPPING is nearly free (you fall fast), so when
// a short drop and a long walk-around both reach a target, A* prefers the drop —
// which is precisely the "ambush from above" behaviour, emergent from cost, not
// a bespoke tactic (see brief §1/§2).
const NAV_CLIMB_COST = 0.6;   // per block of rise
const NAV_DROP_COST  = 0.05;  // per block of fall (tiny, but non-zero)
function _navEdgeCost(dc, dr) {
  let c = Math.max(1, Math.abs(dc));
  if (dr < 0) c += NAV_CLIMB_COST * (-dr);
  else if (dr > 0) c += NAV_DROP_COST * dr;
  return c;
}

// Minimal binary min-heap keyed on f-score (fast enough for the bounded searches
// mobs run; avoids an O(n) scan per pop on larger open sets).
class _NavHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(f, item) {
    const a = this.a; a.push([f, item]); let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) { a[0] = last; let i = 0; const n = a.length;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < n && a[l][0] < a[m][0]) m = l;
        if (r < n && a[r][0] < a[m][0]) m = r;
        if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top[1];
  }
}

// A* from `start` to `goal` over the shared neighbour model. Returns
// { path:[[c,r]...], cost } (path[0] = start cell, last = the standable goal
// cell) or null when no route exists within the search bound. Options:
//   maxUp / maxDx    — jump envelope override (default player envelope)
//   maxRadius        — cap exploration to this Manhattan radius (blocks) from
//                      start; a goal beyond it returns null (caller falls back)
//   maxExpansions    — hard node-expansion cap (runaway backstop)
function findMobPath(nav, start, goal, opts) {
  opts = opts || {};
  const baseUp = opts.maxUp || NAV_MAX_JUMP_UP;
  const baseDx = opts.maxDx || NAV_MAX_JUMP_DX;
  const wallClimb = opts.wallClimb || 0;   // bots pass this when Wall Slide is enabled
  const maxRadius = opts.maxRadius || 40;
  const maxExpansions = opts.maxExpansions || 6000;

  // Snap start + goal down to standable ground (either may be airborne).
  let [sc, sr] = start;
  if (!navStandable(nav, sc, sr)) { const d = navDropTo(nav, sc, sr); if (d < 0) return null; sr = d; }
  let [gc, gr] = goal;
  if (!navStandable(nav, gc, gr)) {
    let d = navDropTo(nav, gc, gr);
    if (d < 0) { // try one cell up (a marker placed a block above the floor)
      d = navStandable(nav, gc, gr - 1) ? gr - 1 : -1;
    }
    if (d < 0) return null;
    gr = d;
  }
  const goalKey = _navKey(gc, gr);
  if (_navKey(sc, sr) === goalKey) return { path: [[sc, sr]], cost: 0 };
  // Cheap out-of-bound: goal too far to be actionable.
  if (Math.abs(gc - sc) + Math.abs(gr - sr) > maxRadius * 2) return null;

  // Base heuristic = horizontal Manhattan (admissible). opts.vBias adds a vertical
  // pull (bots pass ~0.4) to FOCUS the search in mazes/vertical levels — reaches
  // farther within the expansion budget at the cost of strict optimality. Default 0
  // = the original admissible heuristic (mobs, generator, tests unchanged).
  const vBias = opts.vBias || 0;
  const h = (c, r) => Math.abs(c - gc) + vBias * Math.abs(r - gr);
  const gScore = new Map([[_navKey(sc, sr), 0]]);
  const cameFrom = new Map();
  const open = new _NavHeap();
  open.push(h(sc, sr), [sc, sr]);
  const nbrs = [];
  let expansions = 0;

  while (open.size) {
    const [c, r] = open.pop();
    const k = _navKey(c, r);
    if (k === goalKey) {
      // reconstruct
      const path = [[c, r]];
      let cur = k;
      while (cameFrom.has(cur)) { const p = cameFrom.get(cur); path.push([p[0], p[1]]); cur = _navKey(p[0], p[1]); }
      path.reverse();
      return { path, cost: gScore.get(goalKey) };
    }
    if (++expansions > maxExpansions) return null;
    const gCur = gScore.get(k);
    navNeighbors(nav, c, r, baseUp, baseDx, nbrs, wallClimb);
    for (const n of nbrs) {
      const [nc, nr, dc, dr] = n;
      if (Math.abs(nc - sc) + Math.abs(nr - sr) > maxRadius * 2) continue; // stay inside the budget
      const nk = _navKey(nc, nr);
      const tentative = gCur + _navEdgeCost(dc, dr);
      const prev = gScore.get(nk);
      if (prev === undefined || tentative < prev) {
        gScore.set(nk, tentative);
        cameFrom.set(nk, [c, r]);
        open.push(tentative + h(nc, nr), [nc, nr]);
      }
    }
  }
  return null;
}

// Export for Node (the generator + headless tests require this); in the browser
// these are plain script-scope globals shared with mobs.js.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    NAV_MAX_JUMP_UP, NAV_MAX_JUMP_DX, NAV_MAX_DROP, NAV_PAD_JUMP_UP, NAV_PAD_JUMP_DX,
    navStandable, navPassable, navDropTo, navNeighbors, navReachable, findMobPath,
  };
}
