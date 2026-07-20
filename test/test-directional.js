// Headless tests for §Phase 6 directional melee — the height interaction (an overhead
// UP attack sails over a short/crouching target; a DOWN attack connects with it) in the
// real MobManager.playerAttack, for PvE (short mob) and PvP (crouching target).
const fs = require('fs');
const vm = require('vm');
const path = require('path').join(__dirname, '..', 'js');

const real = {
  window: {}, Math, console, Set, Map, Array, Object, JSON, Number, String, Boolean,
  Infinity: Infinity, NaN: NaN, isNaN, isFinite,   // the sandbox proxy would otherwise resolve these globals to 1

  BLOCK: {}, BLOCK_SIZE: 32, GRAVITY: 0.5, JUMP_VELOCITY: -8, MAX_FALL_SPEED: 12,
  IFRAMES: 0, KNOCKBACK_FORCE: 9, ATTACK_REACH: 80, ITEM_DROP_LIFETIME: 3600, XP_PER_ORB: 3,
  MOB_ACTIVATION_RANGE: 800, MOB_MIN_SPAWN_DIST: 200, MOB_RESPAWN_FRAMES: 600,
  CANVAS_W: 960, BOW_GRAVITY: 0.2, PLAYER_W: 20, PLAYER_H: 52,
};
const sandbox = new Proxy(real, { has: () => true, get: (t, k) => (k in t ? t[k] : (typeof k === 'symbol' ? undefined : 1)), set: (t, k, v) => { t[k] = v; return true; } });
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(`${path}/mobs.js`, 'utf8') + '\n;this.MobManager = MobManager; this.Mob = Mob;', sandbox, { filename: 'mobs.js' });
const MobManager = sandbox.MobManager;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

// Build a manager with a TALL mob and a SHORT mob overlapping the same spot, and a player
// adjacent (within reach). height<=BLOCK_SIZE (32) marks "short".
function scene() {
  const mm = new MobManager();
  mm.mobs.length = 0;
  const tall = mm._createMob('Zombie', 420, 300);     // full-height
  const short = mm._createMob('CaveSpider', 420, 320); // 16px tall → "short"
  mm.mobs.push(tall, short);                           // _createMob returns without adding
  tall.hp = 50; short.hp = 50; tall.iframes = 0; short.iframes = 0;
  // Player at the centroid of both mobs so BOTH are comfortably within ATTACK_REACH
  // (the height filter — not distance — is what these tests exercise).
  const px = (tall.cx + short.cx) / 2, py = (tall.cy + short.cy) / 2;
  const player = { cx: px, cy: py, x: px - 10, y: py - 26, width: 20, height: 52, facing: 1, meleeDamage: 6 };
  return { mm, tall, short, player };
}
const sword = (dir) => ({ arcDeg: 360, reachMult: 1.4, dmgMult: 1, knockback: 1, cleave: 0, dir });

console.log('Directional melee — height interaction (short mob):');
{
  // UP attack: the short mob is skipped; the tall mob is hit.
  const s = scene();
  s.mm.playerAttack(s.player, 'p1', sword('up'));
  ok(s.short.hp === 50, 'UP attack sails over the short mob (not damaged)');
  ok(s.tall.hp < 50, 'UP attack still hits the tall mob');
}
{
  // DOWN attack: the short mob IS hit.
  const s = scene();
  s.mm.playerAttack(s.player, 'p1', sword('down'));
  ok(s.short.hp < 50, 'DOWN attack connects with the short mob');
}
{
  // NEUTRAL attack: both are hit (no height filter).
  const s = scene();
  s.mm.playerAttack(s.player, 'p1', sword('neutral'));
  ok(s.short.hp < 50 && s.tall.hp < 50, 'NEUTRAL attack hits both');
}

console.log('Directional melee — crouching target (PvP height-dodge):');
{
  // A crouching, normal-HEIGHT target is treated as low: UP misses, DOWN hits.
  const s = scene();
  s.tall.crouching = true;
  s.mm.playerAttack(s.player, 'p1', sword('up'));
  ok(s.tall.hp === 50, 'UP attack misses a CROUCHING target (crouch to dodge overhead)');
  const s2 = scene();
  s2.tall.crouching = true;
  s2.mm.playerAttack(s2.player, 'p1', sword('down'));
  ok(s2.tall.hp < 50, 'DOWN attack hits the crouching target');
}

console.log('Directional melee — damage scales with the trait multiplier (fwd/back handoff):');
{
  // playerAttack computes damage from dmgMult; game.js applies the fwd(+dmg)/back(−dmg)
  // multipliers into dmgMult before calling. Verify the pass-through.
  const s = scene();
  s.mm.playerAttack(s.player, 'p1', { arcDeg: 360, reachMult: 1.4, dmgMult: 1.3, knockback: 0.6, cleave: 0, dir: 'forward' });
  const dmgFwd = 50 - s.tall.hp;
  const s2 = scene();
  s2.mm.playerAttack(s2.player, 'p1', { arcDeg: 360, reachMult: 1.4, dmgMult: 0.7, knockback: 1.7, cleave: 0, dir: 'back' });
  const dmgBack = 50 - s2.tall.hp;
  ok(dmgFwd > dmgBack, `forward hits harder than back (${dmgFwd} vs ${dmgBack})`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
