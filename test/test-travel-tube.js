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

// 3 ── The 2-wide footprint covers both tracks of a straight run and nothing far off it.
console.log('Invariant 3 — 2-wide footprint:');
{
  const pts = TT.buildPolyline([{ col: 1, row: 5 }, { col: 6, row: 5 }]);   // horizontal at row 5
  const fp = TT.footprint(pts);
  // row 5 across cols 1..6 must be covered (the centre track)
  let centreOk = true;
  for (let c = 1; c <= 6; c++) if (!fp.has(c + ',5')) centreOk = false;
  ok(centreOk, 'centre track (row 5) fully covered');
  // it should be ~2 cells tall → at least one of row 4 / row 6 present along the run
  ok(fp.has('3,4') || fp.has('3,6'), 'a second track is covered (2-wide)');
  // nothing 3 rows away
  ok(!fp.has('3,8') && !fp.has('3,2'), 'no cells far off the path');
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
