// ============================================================
// travel-tube.js — Travel Tube geometry + traversal (§Travel Tube), PURE + headless-testable
// ------------------------------------------------------------
// A Travel Tube is a placed PATH players fly through head-first at a configurable speed (distinct
// from the instant Warp Pipe). The MATH lives here as pure functions so its invariants can be
// verified headless before trusting the feel in a browser:
//   1. Clicked waypoint CELLS expand to an axis-aligned polyline (an elbow is inserted between any
//      two consecutive clicks that share neither row nor column — horizontal leg first).
//   2. A traveler advances a distance `t` along the polyline; position + heading come from `pointAt`.
//   3. The 2-block-wide FOOTPRINT is every cell within one cell (perpendicular) of the centerline.
//   4. Each end is a MOUTH with an OUTWARD orientation (the direction you exit / enter against).
//
// Coordinates are world pixels; a cell is `bs` px (default 32). game.js owns placement input,
// rendering, collision, and moving the real Player; it calls these helpers for the numbers.
// The model is view-AGNOSTIC (just points + cells) so a future top-down overworld map can reuse it.
// ============================================================

const TRAVEL_TUBE = {
  BS: 32,

  // §1 — Expand clicked waypoint cells → a polyline of centre points (world px). Consecutive
  // clicks that are neither same-row nor same-column get an elbow point (horizontal then vertical)
  // so every leg is axis-aligned (the grid-based path the design calls for).
  buildPolyline(cells, bs = TRAVEL_TUBE.BS) {
    const pt = (c) => ({ x: c.col * bs + bs / 2, y: c.row * bs + bs / 2 });
    if (!cells || cells.length === 0) return [];
    if (cells.length === 1) return [pt(cells[0])];
    const out = [pt(cells[0])];
    for (let i = 1; i < cells.length; i++) {
      const a = cells[i - 1], b = cells[i];
      if (a.col !== b.col && a.row !== b.row) out.push(pt({ col: b.col, row: a.row })); // elbow
      out.push(pt(b));
    }
    // Drop any zero-length duplicates (a click on the same cell).
    return out.filter((p, i) => i === 0 || p.x !== out[i - 1].x || p.y !== out[i - 1].y);
  },

  // Total centerline length (px).
  length(pts) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return L;
  },

  // §2 — Position + heading (radians) at distance `d` along the polyline, clamped to [0, length].
  // `seg` = the index of the segment the point sits on (for per-segment lookups like solidity).
  pointAt(pts, d) {
    if (!pts.length) return { x: 0, y: 0, ang: 0, seg: 0 };
    if (pts.length === 1) return { x: pts[0].x, y: pts[0].y, ang: 0, seg: 0 };
    const total = this.length(pts);
    d = Math.max(0, Math.min(total, d));
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y, segLen = Math.hypot(dx, dy);
      if (segLen === 0) continue;
      if (acc + segLen >= d - 1e-9 || i === pts.length - 1) {
        const t = Math.max(0, Math.min(1, (d - acc) / segLen));
        return { x: pts[i - 1].x + dx * t, y: pts[i - 1].y + dy * t, ang: Math.atan2(dy, dx), seg: i - 1 };
      }
      acc += segLen;
    }
    const last = pts[pts.length - 1];
    return { x: last.x, y: last.y, ang: 0, seg: pts.length - 2 };
  },

  // §3 — The 3-block-wide footprint: the centerline cell (the MIDDLE track you fly through) plus one
  // cell to each side (perpendicular) = the two walls. 3-wide so the traveler flies cleanly down the
  // middle block rather than threading a between-cells seam. Samples at bs/2 steps.
  footprint(pts, bs = TRAVEL_TUBE.BS) {
    const cells = new Set();
    if (!pts.length) return cells;
    const add = (x, y) => cells.add(Math.floor(x / bs) + ',' + Math.floor(y / bs));
    if (pts.length === 1) { add(pts[0].x, pts[0].y); return cells; }
    const L = this.length(pts), step = bs / 2;
    for (let d = 0; d <= L + 1e-6; d += step) {
      const p = this.pointAt(pts, Math.min(d, L));
      const nx = -Math.sin(p.ang), ny = Math.cos(p.ang);   // unit normal to the flow
      for (const o of [-1, 0, 1]) { add(p.x + nx * o * bs, p.y + ny * o * bs); }   // centre + both walls
    }
    return cells;
  },

  // §4 — The two mouths (ends), each with an OUTWARD unit direction (points away from the tube —
  // the way you exit, and the way you must be moving to enter). {x,y,dir:{x,y}}.
  mouths(pts) {
    if (pts.length < 2) return [];
    const dir = (from, to) => { const dx = to.x - from.x, dy = to.y - from.y, m = Math.hypot(dx, dy) || 1; return { x: dx / m, y: dy / m }; };
    const a = pts[0], b = pts[pts.length - 1];
    return [
      { x: a.x, y: a.y, dir: dir(pts[1], a), end: 'start' },
      { x: b.x, y: b.y, dir: dir(pts[pts.length - 2], b), end: 'end' },
    ];
  },

  // Nearest point ON the centerline to (x,y) — used to snap a placed item to the middle track (the
  // fly path). Returns {x,y,d} (d = distance along the polyline). Samples every half-cell.
  nearest(pts, x, y, bs = TRAVEL_TUBE.BS) {
    if (!pts.length) return { x, y, d: 0 };
    if (pts.length === 1) return { x: pts[0].x, y: pts[0].y, d: 0 };
    const L = this.length(pts); let best = null;
    for (let d = 0; d <= L + 1e-6; d += bs / 2) {
      const p = this.pointAt(pts, Math.min(d, L));
      const dist = Math.hypot(p.x - x, p.y - y);
      if (!best || dist < best.dist) best = { x: p.x, y: p.y, d: Math.min(d, L), dist };
    }
    return best;
  },

  // Snap an outward direction to the nearest cardinal ('left'|'right'|'up'|'down') — for the
  // orientation-based ENTER rule (walk into a side mouth, Down into an up mouth, Up into a down mouth).
  cardinal(dir) {
    return Math.abs(dir.x) >= Math.abs(dir.y) ? (dir.x < 0 ? 'left' : 'right') : (dir.y < 0 ? 'up' : 'down');
  },
};

if (typeof window !== 'undefined') window.TRAVEL_TUBE = TRAVEL_TUBE;
if (typeof module !== 'undefined' && module.exports) module.exports = { TRAVEL_TUBE };
