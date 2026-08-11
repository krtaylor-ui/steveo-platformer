// Headless tests for §E7 WIND — the pure WIND module: force vector, wall-blocking shadow, redstone gate.
const { WIND } = require('../js/wind-zone.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

console.log('1 — forceFor: cardinal push, normalized diagonals, airborne/grounded factor:');
{
  let f = WIND.forceFor('right', 2, false);
  ok(near(f.ax, 2) && near(f.ay, 0), 'right wind pushes +x at full strength airborne');
  f = WIND.forceFor('up', 2, false);
  ok(near(f.ax, 0) && near(f.ay, -2), 'up wind pushes -y (up) airborne');
  f = WIND.forceFor('downright', 2, false);
  ok(near(Math.hypot(f.ax, f.ay), 2), 'diagonal wind is normalized to the same magnitude');
  // Grounded: default 0 unless affectsGrounded/groundedFactor set.
  ok(WIND.forceFor('right', 2, true).ax === 0, 'grounded gets no push by default');
  ok(near(WIND.forceFor('right', 2, true, { affectsGrounded: true }).ax, 0.7), 'affectsGrounded → 0.35 factor');
  ok(near(WIND.forceFor('right', 2, true, { groundedFactor: 0.5 }).ax, 1), 'explicit groundedFactor honored');
}

console.log('2 — active(): no channel = always on; wired = on only when powered:');
{
  ok(WIND.active({ channel: null }) === true, 'no channel → always blowing');
  ok(WIND.active({ channel: '' }) === true, 'empty channel → always blowing');
  ok(WIND.active({ channel: 'A' }, (ch) => ch === 'A') === true, 'wired + channel powered → blowing');
  ok(WIND.active({ channel: 'A' }, (ch) => ch === 'B') === false, 'wired + channel unpowered → still');
}

console.log('3 — shadowedCells: a thick wall shadows downwind cells; a thin wall does not:');
{
  // A single 5-wide row zone (cols 0..4, row 0), wind blowing right. Put a 2-thick wall at cols 1-2.
  const cells = [0, 1, 2, 3, 4].map((c) => ({ col: c, row: 0 }));
  const solid2 = (c, r) => r === 0 && (c === 1 || c === 2);   // 2 consecutive solids
  const shadow2 = WIND.shadowedCells(cells, 'right', solid2, 2);
  ok(shadow2.has('3,0') && shadow2.has('4,0'), 'cells downwind of a 2-thick wall are shadowed');
  ok(!shadow2.has('0,0'), 'the cell upwind of the wall is NOT shadowed');
  // Thin wall (thickness 1 solid) with a thickness requirement of 2 → no shadow.
  const solid1 = (c, r) => r === 0 && c === 2;
  const shadow1 = WIND.shadowedCells(cells, 'right', solid1, 2);
  ok(shadow1.size === 0, 'a single-cell wall does not block when thickness required is 2');
  // Same thin wall but thickness requirement 1 → it does block downwind.
  const shadowThin = WIND.shadowedCells(cells, 'right', solid1, 1);
  ok(shadowThin.has('3,0') && shadowThin.has('4,0'), 'thickness=1 lets a single wall block');
}

console.log('4 — shadow respects wind direction (left wind shadows the OTHER side):');
{
  const cells = [0, 1, 2, 3, 4].map((c) => ({ col: c, row: 0 }));
  const solid = (c, r) => r === 0 && (c === 2 || c === 3);
  const left = WIND.shadowedCells(cells, 'left', solid, 2);
  ok(left.has('1,0') && left.has('0,0'), 'left wind shadows cells to the LEFT of the wall');
  ok(!left.has('4,0'), 'cells upwind (right) of the wall are exposed to a left wind');
}

console.log('5 — reaches(): exposed cell true, solid/shadowed false:');
{
  const cells = [0, 1, 2, 3].map((c) => ({ col: c, row: 0 }));
  const solid = (c, r) => r === 0 && c === 1;
  const shadow = WIND.shadowedCells(cells, 'right', solid, 1);
  ok(WIND.reaches(0, 0, shadow, solid) === true, 'upwind exposed cell is reached');
  ok(WIND.reaches(1, 0, shadow, solid) === false, 'the wall cell itself is not reached');
  ok(WIND.reaches(2, 0, shadow, solid) === false, 'downwind shadowed cell is not reached');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
