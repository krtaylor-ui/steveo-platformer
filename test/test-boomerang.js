// Headless tests for the §Phase 3 Boomerang flight invariants (Arrow._updateBoomerang).
// Loads mobs.js in a vm with REAL BOOM_* constants stubbed (the loader's proxy would
// otherwise resolve unknown globals to 1, expiring the boomerang at age 2).
const fs = require('fs');
const vm = require('vm');
const path = require('path').join(__dirname, '..', 'js');

const real = {
  window: {}, Math, console, Set, Map, Array, Object, JSON, Number, String, Boolean,
  BLOCK: {}, BLOCK_SIZE: 32, GRAVITY: 0.5, JUMP_VELOCITY: -8, MAX_FALL_SPEED: 12,
  IFRAMES: 20, KNOCKBACK_FORCE: 6, ITEM_DROP_LIFETIME: 3600, XP_PER_ORB: 3,
  MOB_ACTIVATION_RANGE: 800, MOB_MIN_SPAWN_DIST: 200, MOB_RESPAWN_FRAMES: 600,
  CANVAS_W: 960, BOW_GRAVITY: 0.2, PLAYER_W: 20, PLAYER_H: 52,
  // Real boomerang constants (must not fall through to the proxy's 1).
  BOOM_RANGE_BLOCKS: 10, BOOM_SPEED: 17, BOOM_MIN_SPEED_MULT: 0.35,
  BOOM_DECEL_PCT: 0.75, BOOM_RETURN_MULT: 1.0, BOOM_STEER_PCT: 30,
  BOOM_SPIN_RATE: 0.5, BOOM_MAX_LIFE: 600,
};
const sandbox = new Proxy(real, {
  has: () => true,
  get: (t, k) => (k in t ? t[k] : (typeof k === 'symbol' ? undefined : 1)),
  set: (t, k, v) => { t[k] = v; return true; },
});
vm.createContext(sandbox);
const src = fs.readFileSync(`${path}/mobs.js`, 'utf8') + '\n;this.Arrow = Arrow;';
vm.runInContext(src, sandbox, { filename: 'mobs.js' });
const Arrow = sandbox.Arrow;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

// A player centred at (110, 126); the boomerang launches from there going right.
const player = { x: 100, y: 100, width: 20, height: 52 };
const ox = player.x + player.width / 2, oy = player.y + player.height / 2;
function mkBoom(opts = {}) {
  const a = new Arrow(ox, oy, 17, 0, 5, 0, true);
  a.boomerang = true; a.pierce = true; a.guided = true; a.gravity = 0;
  a._boomOX = ox; a._boomOY = oy;
  a._boomRange = (opts.rangeBl || 10) * 32;
  a._boomSpeed = opts.speed || 17;
  a._boomDecelPct = opts.decelPct || 0.75;
  a._boomMinMult = 0.35;
  a._boomReturnMult = opts.returnMult || 1.0;
  a._boomLook = '2d'; a._spinRate = 0.5;
  return a;
}

console.log('Boomerang — outbound decelerates then auto-returns:');
{
  const b = mkBoom();
  // Tick a few frames while still near the origin (before the decel point at 240px).
  for (let i = 0; i < 5; i++) b.update(player, {});
  const earlySpeed = Math.hypot(b.vx, b.vy);
  ok(earlySpeed > 15, 'outbound speed stays near launch (≈17) before the decel point');
  ok(Math.abs(earlySpeed - 17) < 1.5, `early speed ~17 (got ${earlySpeed.toFixed(2)})`);
  // Run until it flips to the return leg.
  let flipped = false, guard = 0;
  while (!b._boomReturning && guard++ < 400) b.update(player, {});
  ok(b._boomReturning, 'switches to the return leg after reaching its range');
  const distAtFlip = Math.hypot(b.x - ox, b.y - oy);
  ok(distAtFlip >= 10 * 32 - 40, `flips at ~range (got ${Math.round(distAtFlip)}px, range 320)`);
}

console.log('Boomerang — speed drops after the deceleration point:');
{
  const b = mkBoom();
  let speedBefore = null, speedAfter = null, guard = 0;
  while (!b._boomReturning && guard++ < 400) {
    const dist = Math.hypot(b.x - ox, b.y - oy);
    const spd = Math.hypot(b.vx, b.vy);
    if (dist < 200) speedBefore = spd;              // before decel (240px)
    if (dist > 290 && speedAfter == null) speedAfter = spd;  // near the end
    b.update(player, {});
  }
  ok(speedBefore != null && speedAfter != null, 'sampled speed before + after the decel point');
  ok(speedAfter < speedBefore, `speed decreases past the decel point (${speedBefore?.toFixed(1)} → ${speedAfter?.toFixed(1)})`);
}

console.log('Boomerang — returns to the player and is caught:');
{
  const b = mkBoom();
  let guard = 0;
  while (b.alive && guard++ < 800) b.update(player, {});
  ok(!b.alive, 'the boomerang eventually ends (caught or expires)');
  ok(b._boomCaught === true, 'it is CAUGHT at the player (not merely expired)');
  ok(guard < 700, `caught well before the safety expiry (frames: ${guard})`);
}

console.log('Boomerang — pierce set clears its hit set on the turn (can re-hit on return):');
{
  const b = mkBoom();
  b._hitMobs = new Set(['a', 'b']);   // pretend it grazed two mobs outbound
  let guard = 0;
  while (!b._boomReturning && guard++ < 400) b.update(player, {});
  ok(b._hitMobs.size === 0, 'hit set cleared when it turns back (mobs are hittable again on the way home)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
