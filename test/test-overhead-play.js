// Headless tests for Overhead movement (jump/anim), control schemes, and combat.
//   node test/test-overhead-play.js
const { OH_MOVE } = require('../js/overhead/overhead-movement.js');
const { OH_CONTROLS } = require('../js/overhead/overhead-controls.js');
const { OH_COMBAT } = require('../js/overhead/overhead-combat.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

console.log('MOVE — jump timing + parabola lift:');
{
  const st = OH_MOVE.startJump({ jumpDur: 20, jumpHeight: 30, moveX: 4, moveY: 0 });
  ok(st.jumping && st.vx === 4, 'jump carries planar velocity');
  ok(OH_MOVE.jumpLift(st) === 0, 'lift 0 at takeoff');
  for (let i = 0; i < 10; i++) OH_MOVE.advanceJump(st);   // t=10, mid-hop
  ok(near(OH_MOVE.jumpLift(st), 30, 0.5), 'lift peaks ~height at mid-hop');
  let landed = false;
  for (let i = 0; i < 10; i++) landed = OH_MOVE.advanceJump(st).landed || landed;
  ok(landed && !st.jumping, 'jump lands after its duration');
}

console.log('MOVE — double jump extends the arc + flip:');
{
  const st = OH_MOVE.startJump({ jumpDur: 20, jumpHeight: 30 });
  OH_MOVE.advanceJump(st); OH_MOVE.advanceJump(st);
  ok(OH_MOVE.canDoubleJump(st), 'can double jump mid-air');
  OH_MOVE.doubleJump(st);
  ok(st.doubleUsed && st.flip && st.dur > 20 && st.height > 30, 'double jump extends + flags flip');
  ok(!OH_MOVE.canDoubleJump(st), 'cannot double jump twice');
}

console.log('MOVE — landing edge detection (hazard/gap only, maxElevationJump=0):');
{
  const st = OH_MOVE.startJump({});   // maxElevationJump defaults 0
  ok(OH_MOVE.landingValid(st, { landingIsSolidGround: true, elevDelta: 0 }).valid, 'solid same-level = valid');
  ok(OH_MOVE.landingValid(st, { landingIsGap: true }).reason === 'gap', 'gap landing invalid');
  ok(OH_MOVE.landingValid(st, { landingIsHazard: true }).reason === 'hazard', 'hazard landing invalid');
  ok(OH_MOVE.landingValid(st, { landingIsSolidGround: true, elevDelta: 1 }).reason === 'elevation', 'cross-elevation invalid at cap 0');
  const st2 = OH_MOVE.startJump({ maxElevationJump: 1 });
  ok(OH_MOVE.landingValid(st2, { landingIsSolidGround: true, elevDelta: 1 }).valid, 'cap 1 allows a 1-level cross (future mode)');
}

console.log('MOVE — limb animation only animates while moving:');
{
  ok(OH_MOVE.limbPhase(100, false).legL === 0, 'idle = no limb offset');
  ok(OH_MOVE.limbPhase(7, true).legL !== 0, 'moving = limbs swing');
}

console.log('CONTROLS — scheme pick (world forces, else player pref, else default):');
{
  ok(OH_CONTROLS.pickScheme('twin-stick', 'free-aim') === 'twin-stick', 'world override wins');
  ok(OH_CONTROLS.pickScheme(null, 'move-to-aim') === 'move-to-aim', 'player pref used');
  ok(OH_CONTROLS.pickScheme(null, null) === 'free-aim', 'default = free-aim');
}

console.log('CONTROLS — weapon can force twin-stick override:');
{
  const e = OH_CONTROLS.effectiveScheme('free-aim', { forceTwinStick: true });
  ok(e.scheme === 'twin-stick' && e.overridden, 'weapon forces twin-stick + flags override');
  ok(OH_CONTROLS.effectiveScheme('free-aim', {}).overridden === false, 'no override normally');
}

console.log('CONTROLS — free-aim: move independent of aim, explicit fire:');
{
  const r = OH_CONTROLS.resolve('free-aim',
    { moveVec: { x: 0, y: 1 }, aimVec: { x: 1, y: 0 }, fireBtn: true, actionBtn: true }, {});
  ok(near(r.move.y, 1) && near(r.aim.x, 1), 'move down while aiming right');
  ok(r.fire === true && r.action === true, 'explicit fire + universal action');
}

console.log('CONTROLS — move-to-aim: aim follows movement, angle-lock snaps:');
{
  const r = OH_CONTROLS.resolve('move-to-aim', { moveVec: { x: 1, y: 0.2 } }, { angleLockDeg: 45 });
  ok(near(r.aimAngle, 0), 'aim snaps to 0° (nearest 45° increment)');
  ok(r.aim.x > 0.99, 'aim vector matches snapped angle');
}

console.log('CONTROLS — twin-stick: aim-tilt auto-fires (per-weapon flag), melee works:');
{
  // Auto-fire weapon: tilting the aim stick fires without a button.
  let r = OH_CONTROLS.resolve('twin-stick',
    { moveVec: { x: 1, y: 0 }, aimVec: { x: 0, y: 1 }, aimStickMag: 0.9, meleeBtn: true }, { weaponAutoFire: true });
  ok(r.fire === true, 'aim tilt auto-fires');
  ok(near(r.move.x, 1) && near(r.aim.y, 1), 'independent move + aim (strafing)');
  ok(r.melee === true, 'melee still works under twin-stick');
  // Below deadzone → no auto-fire.
  r = OH_CONTROLS.resolve('twin-stick', { aimVec: { x: 0.1, y: 0 }, aimStickMag: 0.1 }, { weaponAutoFire: true });
  ok(r.fire === false, 'no fire below the aim deadzone');
  // Non-auto weapon → needs explicit fire even under twin-stick.
  r = OH_CONTROLS.resolve('twin-stick', { aimVec: { x: 1, y: 0 }, aimStickMag: 0.9, fireBtn: false }, { weaponAutoFire: false });
  ok(r.fire === false, 'deliberate weapon does not auto-fire on tilt');
}

console.log('COMBAT — cone hit respects reach + angle + maxHits:');
{
  const origin = { x: 0, y: 0 };
  const targets = [
    { id: 'front', x: 50, y: 0, r: 8 },
    { id: 'behind', x: -50, y: 0, r: 8 },
    { id: 'far', x: 300, y: 0, r: 8 },
    { id: 'side', x: 0, y: 50, r: 8 },
  ];
  const hits = OH_COMBAT.coneHit(origin, 0, targets, { reach: 80, halfAngle: Math.PI / 4 });
  ok(hits.some((t) => t.id === 'front'), 'front target hit');
  ok(!hits.some((t) => t.id === 'behind'), 'behind not hit (out of cone)');
  ok(!hits.some((t) => t.id === 'far'), 'far not hit (out of reach)');
  ok(!hits.some((t) => t.id === 'side'), 'side not hit (90° outside 45° half-cone)');
  ok(OH_COMBAT.coneHit(origin, 0, targets, { reach: 80, halfAngle: Math.PI / 4, maxHits: 1 }).length === 1, 'maxHits caps');
}

console.log('COMBAT — radius, line, nearest-enemy, damage:');
{
  const ts = [{ x: 10, y: 0, r: 4 }, { x: 100, y: 0, r: 4 }];
  ok(OH_COMBAT.radiusHit({ x: 0, y: 0 }, ts, 20).length === 1, 'radius blast hits near only');
  ok(OH_COMBAT.lineHit({ x: 0, y: 0 }, { x: 200, y: 0 }, ts, 6) === ts[0], 'line hits nearest along the ray');
  const enemies = [{ x: 5, y: 0, team: 'red' }, { x: 3, y: 0, team: 'blue' }];
  ok(OH_COMBAT.nearestEnemy({ x: 0, y: 0 }, enemies, 'blue', (t) => t.team).team === 'red', 'nearest ENEMY-team unit');
  ok(OH_COMBAT.resolveDamage({ damage: 10, falloff: 1, reach: 100 }, {}, 50) === 5, 'damage falloff at half reach');
}

console.log(`\noverhead play: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
