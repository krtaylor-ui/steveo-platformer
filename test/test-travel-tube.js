// Headless tests for the §Travel Tube geometry/traversal invariants (pure module — verify the
// path math before trusting the fly-through feel in a browser).
const { TRAVEL_TUBE: TT } = require('../js/travel-tube.js');
const BS = 32;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// 1 ── Waypoint cells expand to an axis-aligned polyline; an elbow is inserted between
//      diagonal consecutive clicks (horizontal leg first).
console.log('Invariant 1 — polyline build + elbow insertion:');
{
  const straight = TT.buildPolyline([{ col: 0, row: 0 }, { col: 4, row: 0 }]);
  ok(straight.length === 2, `straight horizontal run = 2 points (got ${straight.length})`);
  ok(near(straight[0].x, 16) && near(straight[0].y, 16), 'first point is the cell centre');

  const elbow = TT.buildPolyline([{ col: 0, row: 0 }, { col: 4, row: 3 }]);
  ok(elbow.length === 3, `diagonal click inserts one elbow (3 points, got ${elbow.length})`);
  // elbow point should share the FIRST click's row (horizontal leg first) and the SECOND's column
  ok(near(elbow[1].y, elbow[0].y) && near(elbow[1].x, elbow[2].x), 'elbow is horizontal-then-vertical');

  const dup = TT.buildPolyline([{ col: 2, row: 2 }, { col: 2, row: 2 }, { col: 2, row: 6 }]);
  ok(dup.length === 2, `duplicate clicks are dropped (got ${dup.length})`);
}

// 2 ── pointAt: endpoints, midpoint, clamping, and heading around a corner.
console.log('Invariant 2 — pointAt position + heading:');
{
  const pts = TT.buildPolyline([{ col: 0, row: 0 }, { col: 4, row: 0 }]);   // 128px run at y=16
  const L = TT.length(pts);
  ok(near(L, 128), `length of a 4-cell run = 128 (got ${L})`);
  const start = TT.pointAt(pts, 0), mid = TT.pointAt(pts, L / 2), end = TT.pointAt(pts, L);
  ok(near(start.x, 16) && near(end.x, 144), 'start/end x correct');
  ok(near(mid.x, 80) && near(mid.y, 16), 'midpoint interpolates');
  ok(near(TT.pointAt(pts, -50).x, 16) && near(TT.pointAt(pts, 9999).x, 144), 'distance clamps to the ends');
  ok(near(start.ang, 0), 'heading along +x is 0 rad');

  const corner = TT.buildPolyline([{ col: 0, row: 0 }, { col: 0, row: 4 }]);  // vertical run
  ok(near(TT.pointAt(corner, TT.length(corner) / 2).ang, Math.PI / 2), 'vertical heading is +y (π/2)');
}

// 3 ── The 3-wide footprint covers the centre track (fly-through) + both walls, nothing farther.
console.log('Invariant 3 — 3-wide footprint (fly the middle):');
{
  const pts = TT.buildPolyline([{ col: 1, row: 5 }, { col: 6, row: 5 }]);   // horizontal at row 5
  const fp = TT.footprint(pts);
  // centre track (row 5) across cols 1..6 must be covered — this is the fly-through lane
  let centreOk = true;
  for (let c = 1; c <= 6; c++) if (!fp.has(c + ',5')) centreOk = false;
  ok(centreOk, 'centre track (row 5) fully covered — the fly lane');
  // both walls (row 4 AND row 6) covered along the run → 3 cells tall
  ok(fp.has('3,4') && fp.has('3,6'), 'both wall tracks (rows 4 & 6) covered (3-wide)');
  // nothing 2 rows away from centre
  ok(!fp.has('3,7') && !fp.has('3,3'), 'no cells beyond the 3-wide band');
}

// 4 ── Mouths point OUTWARD, snapped to the right cardinal for the enter rule.
console.log('Invariant 4 — mouths + cardinal:');
{
  const pts = TT.buildPolyline([{ col: 2, row: 2 }, { col: 8, row: 2 }]);   // runs left→right
  const m = TT.mouths(pts);
  ok(m.length === 2, 'two mouths');
  ok(TT.cardinal(m[0].dir) === 'left', `start mouth faces LEFT (out the left end) — got ${TT.cardinal(m[0].dir)}`);
  ok(TT.cardinal(m[1].dir) === 'right', `end mouth faces RIGHT — got ${TT.cardinal(m[1].dir)}`);

  const vert = TT.buildPolyline([{ col: 3, row: 1 }, { col: 3, row: 7 }]);  // runs top→bottom
  const mv = TT.mouths(vert);
  ok(TT.cardinal(mv[0].dir) === 'up' && TT.cardinal(mv[1].dir) === 'down', 'vertical tube: up mouth on top, down mouth on bottom');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
