// Headless tests for the §Moving Platforms math (pure module — verify traversal ends, weighted mass,
// center-of-gravity tilt, ballistic launch, and connectivity flood-fill before trusting the feel).
const { MOVING_PLATFORM: MP } = require('../js/moving-platform.js');
const { TRAVEL_TUBE: TT } = require('../js/travel-tube.js');
const BS = 32;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// 1 ── advance(): one-way clamp, round-trip bounce, closed-loop wrap.
console.log('Invariant 1 — advance end behavior (one-way / round-trip / loop):');
{
  const L = 100;
  // One-way: clamps at the far end and reports stopped, dir unchanged.
  let s = MP.advance(95, 1, 10, L, {});
  ok(s.dist === 100 && s.dir === 1 && s.atEnd && s.stopped, 'one-way clamps + stops at end');
  // Round-trip: bounces (reverses dir) at the end, not stopped.
  s = MP.advance(95, 1, 10, L, { roundTrip: true });
  ok(s.dist === 100 && s.dir === -1 && s.atEnd && !s.stopped, 'round-trip reverses at end');
  s = MP.advance(5, -1, 10, L, { roundTrip: true });
  ok(s.dist === 0 && s.dir === 1 && !s.stopped, 'round-trip reverses at start');
  // Loop: wraps around [0,L), never stops/reverses.
  s = MP.advance(95, 1, 10, L, { loop: true });
  ok(near(s.dist, 5) && s.dir === 1 && !s.atEnd && !s.stopped, 'loop wraps past the end');
  s = MP.advance(5, -1, 10, L, { loop: true });
  ok(near(s.dist, 95) && s.dir === -1, 'loop wraps past the start');
  // Degenerate rail (L=0): static.
  s = MP.advance(0, 1, 10, 0, {});
  ok(s.dist === 0 && s.atEnd, 'zero-length rail is static');
}

// 2 ── weight(): default-1 == block count; per-type weights sum.
console.log('Invariant 2 — weighted mass:');
{
  const cells = [{ col: 0, row: 0, blockType: 1 }, { col: 1, row: 0, blockType: 1 }, { col: 2, row: 0, blockType: 9 }];
  ok(MP.weight(cells) === 3, 'default weight = block count');
  const heavy = MP.weight(cells, (t) => (t === 9 ? 5 : 1));
  ok(heavy === 7, `per-type weight sums (2*1 + 1*5 = 7, got ${heavy})`);
}

// 3 ── centerOfMass(): centroid shifts toward the heavier side + rider point mass.
console.log('Invariant 3 — center of mass:');
{
  const cells = [{ col: 0, row: 0, blockType: 1 }, { col: 2, row: 0, blockType: 1 }];  // centres x=16, x=80
  const com = MP.centerOfMass(cells, BS, null);
  ok(near(com.x, 48) && com.weight === 2, 'even mass → centroid midway');
  // Make the right block 3x heavier → centroid shifts right of 48.
  const com2 = MP.centerOfMass(cells, BS, (t, i) => 1, null);
  ok(near(com2.x, 48), 'uniform weight unchanged');
  const heavyRight = MP.centerOfMass([{ col: 0, row: 0, blockType: 1 }, { col: 2, row: 0, blockType: 9 }], BS, (t) => (t === 9 ? 3 : 1));
  ok(heavyRight.x > 48, 'heavier right block pulls centroid right');
  // Rider point mass on the left pulls it back.
  const withRider = MP.centerOfMass(cells, BS, null, [{ x: 16, y: 0, weight: 4 }]);
  ok(withRider.x < 48, 'a rider adds a point mass that shifts the centroid');
  ok(MP.centerOfMass([], BS, null) === null, 'empty set → null');
}

// 4 ── ballisticStep() + launchVelocity(): projectile integration + exit direction.
console.log('Invariant 4 — ballistic launch:');
{
  const v = MP.launchVelocity(10, 0);          // straight right
  ok(near(v.vx, 10) && near(v.vy, 0), 'horizontal launch');
  const up = MP.launchVelocity(10, -Math.PI / 2);
  ok(near(up.vx, 0, 1e-9) && near(up.vy, -10), 'straight-up launch');
  // A step applies velocity then gravity.
  let s = MP.ballisticStep(0, 0, 5, -8, 0.35);
  ok(s.x === 5 && s.y === -8 && s.vx === 5 && near(s.vy, -7.65), 'one ballistic step (pos+=v, vy+=g)');
  // Arc peaks then falls: iterate until vy>0.
  let y = 0, vy = -8, steps = 0;
  while (vy < 0 && steps < 1000) { const n = MP.ballisticStep(0, y, 0, vy, 0.35); y = n.y; vy = n.vy; steps++; }
  ok(y < 0 && vy >= 0, 'arc rises to a peak then begins to fall');
}

// 5 ── tiltAngle(): heavier/offset mass tilts that way, clamped to the max.
console.log('Invariant 5 — center-of-gravity tilt:');
{
  ok(MP.tiltAngle(50, 50, 0.5) === 0, 'balanced (com == pivot) → level');
  ok(MP.tiltAngle(50, 90, 0.5) > 0, 'mass to the right → positive tilt');
  ok(MP.tiltAngle(50, 10, 0.5) < 0, 'mass to the left → negative tilt');
  const clamped = MP.tiltAngle(50, 100000, 0.5);
  ok(near(clamped, 0.5), 'tilt clamps to ±maxAngle');
}

// 6 ── floodFill(): the connected component bound to an anchor; unconnected blocks excluded.
console.log('Invariant 6 — platform connectivity flood fill:');
{
  // grid: a 3-cell L plus a detached block.
  const solid = new Set(['5,5', '6,5', '6,6', '9,9']);
  const isBlock = (c, r) => solid.has(c + ',' + r);
  const set = MP.floodFill(5, 5, isBlock);
  ok(set.length === 3, `flood fill grabs the 3 connected cells (got ${set.length})`);
  ok(!set.some(c => c.col === 9 && c.row === 9), 'detached block excluded');
  ok(MP.floodFill(0, 0, isBlock).length === 0, 'anchor not on a block → empty');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
