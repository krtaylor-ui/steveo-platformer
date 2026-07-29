// Headless tests for Overhead weapon trajectories (crossbow/trident/boomerang).
//   node test/test-overhead-weapons.js
const { OH_WEAPONS } = require('../js/overhead/overhead-weapons.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const near = (a, b, e) => Math.abs(a - b) <= (e || 2);

console.log('Crossbow — straight bolt, capped range:');
{
  let s = OH_WEAPONS.startBolt(0, 0, 0, { crossbowSpeed: 10, crossbowRange: 100 });
  for (let i = 0; i < 9; i++) OH_WEAPONS.stepBolt(s);
  ok(!s.dead && near(s.x, 90, 1) && near(s.y, 0, 1), 'travels straight along aim');
  for (let i = 0; i < 5; i++) OH_WEAPONS.stepBolt(s);
  ok(s.dead, 'dies at max range');
}

console.log('Trident — throws out then RECALLS to the player\'s current position:');
{
  const player = { x: 0, y: 0 };
  let s = OH_WEAPONS.startTrident(0, 0, 0, { tridentSpeed: 8, tridentRange: 200, tridentReturnSpeed: 10 });
  for (let i = 0; i < 5; i++) OH_WEAPONS.stepTrident(s, player);
  ok(s.state === 'out' && s.x > 0, 'flies out along aim');
  // Player walks away while the trident is out.
  player.x = 40; player.y = 30;
  OH_WEAPONS.recallTrident(s);
  ok(s.state === 'return', 'recall flips to return');
  for (let i = 0; i < 200 && !s.caught; i++) OH_WEAPONS.stepTrident(s, player);
  ok(s.caught && near(s.x, 40, 1) && near(s.y, 30, 1), 'returns to the player\'s CURRENT position');
}

console.log('Trident — auto-returns at max range without an explicit recall:');
{
  const player = { x: 0, y: 0 };
  let s = OH_WEAPONS.startTrident(0, 0, 0, { tridentSpeed: 10, tridentRange: 50, tridentReturnSpeed: 10 });
  for (let i = 0; i < 200 && !s.caught; i++) OH_WEAPONS.stepTrident(s, player);
  ok(s.caught, 'auto-returns and is caught');
}

console.log('Boomerang — oval arc: starts at player, passes the target, returns:');
{
  const px = 100, py = 100, angle = 0, aimDist = 200;
  let s = OH_WEAPONS.startBoomerang(px, py, angle, aimDist, { boomerangSpeed: 6, boomerangMaxRange: 300, boomerangWidth: 0.4 });
  // Start ~ at the player.
  ok(near(s.x, px, 1) && near(s.y, py, 1), 'starts at the player');
  // Midpoint (t≈0.5) passes the target (far vertex) at ~aimDist along the aim.
  const mid = OH_WEAPONS.boomerangPos(s, 0.5);
  ok(near(mid.x, px + aimDist, 2) && near(mid.y, py, 2), 'far vertex reaches the aim/target point');
  // Quarter point bulges sideways (oval, not a straight line).
  const q = OH_WEAPONS.boomerangPos(s, 0.25);
  ok(Math.abs(q.y - py) > 20, 'arcs sideways at the quarter point (oval shape)');
  // Step to completion → returns to the player and dies.
  let guard = 0; while (!s.dead && guard++ < 100000) OH_WEAPONS.stepBoomerang(s);
  ok(s.dead && near(s.x, px, 3) && near(s.y, py, 3), 'returns to the player and ends');
}

console.log('Boomerang — respects the max-range clamp:');
{
  let s = OH_WEAPONS.startBoomerang(0, 0, 0, 9999, { boomerangMaxRange: 150 });
  const mid = OH_WEAPONS.boomerangPos(s, 0.5);
  ok(near(mid.x, 150, 2), 'aim beyond max range is clamped to maxRange');
}

console.log(`\noverhead weapons: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
