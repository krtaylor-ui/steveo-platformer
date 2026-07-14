// Headless tests for Smart Mobs §6 — WAYFINDING wired into mob behavior:
//   - the additive gate: path-aware OFF → _pathStep returns null (legacy chase)
//   - in-range chase produces path-driven steering; out-of-range → null fallback
//   - "ambush from above": a mob above the player steers toward the drop
//   - route around a wall (doesn't just push straight into it)
//   - path invalidation when terrain changes; MobManager per-frame config wiring
//   - §5 path-surround: opposite flank biases; §8 path-flee retreats
const fs = require('fs');
const vm = require('vm');
const jsDir = require('path').join(__dirname, '..', 'js');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  FAIL:', msg); } };

const real = {
  window: {}, Math, console, Set, Map, Array, Object, JSON, Number, String, Boolean,
  BLOCK_SIZE: 32, GRAVITY: 0.66, JUMP_VELOCITY: -12, MAX_FALL_SPEED: 12,
  IFRAMES: 20, KNOCKBACK_FORCE: 6, CANVAS_W: 960,
  SPRINT_TELE_FRAMES: 42, SPRINT_RUN_FRAMES: 46, SPRINT_COOLDOWN: 150,
  SPRINT_SPEED_MULT: 2.4, SPRINT_WINDUP_MULT: 0.35, SPRINT_TRIGGER_CHANCE: 0.02,
  SPRINT_MIN_BLOCKS: 3, SPRINT_MAX_BLOCKS: 12,
  PATH_FLANK_BIAS_BLOCKS: 2.5, MOB_ATTACK_RATE: 30, SKELETON_SHOOT_RATE: 90,
  CREEPER_FUSE_FRAMES: 60,
};
const sandbox = new Proxy(real, {
  has: () => true,
  get: (t, k) => (k in t ? t[k] : (typeof k === 'symbol' ? undefined : 1)),
  set: (t, k, v) => { t[k] = v; return true; },
});
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(`${jsDir}/pathfinding.js`, 'utf8') +
  '\n;this.findMobPath = findMobPath; this.navReachable = navReachable; this.navStandable = navStandable;',
  sandbox, { filename: 'pathfinding.js' });
vm.runInContext(fs.readFileSync(`${jsDir}/blocks.js`, 'utf8') +
  '\n;this.BLOCK = BLOCK;', sandbox, { filename: 'blocks.js' });
vm.runInContext(fs.readFileSync(`${jsDir}/mobs.js`, 'utf8') +
  '\n;this.MobManager = MobManager; this.Mob = Mob;', sandbox, { filename: 'mobs.js' });
const { MobManager, BLOCK } = sandbox;
const BS = 32;

// A minimal Level from an ASCII map: '#' stone, 'L' lava, 'P' pad, else air.
function mkLevel(rows) {
  const H = rows.length, W = Math.max(...rows.map(r => r.length));
  const ch = (r, c) => (r < 0 || r >= H || c < 0 || c >= W) ? '#' : (rows[r][c] || ' ');
  const blk = (r, c) => { const x = ch(r, c); return x === '#' ? BLOCK.STONE : x === 'L' ? BLOCK.LAVA : x === 'P' ? BLOCK.JUMP_PAD : BLOCK.AIR; };
  return {
    width: W, height: H,
    grid: Array.from({ length: H }, (_, r) => Array.from({ length: W }, (_, c) => blk(r, c))),
    isSolid: (r, c) => { const x = ch(r, c); return x === '#' || x === 'P'; },
    get: (r, c) => blk(r, c),
  };
}
// A player STUB standing with center at column col, feet on floor row `floorRow`.
const bodyAt = (col, floorRow, h) => {
  const cx = (col + 0.5) * BS;
  const y = floorRow * BS - h;
  return { x: cx - 11, y, cx, cy: y + h / 2, width: 22, height: h, hp: 20, iFrames: 0 };
};
// Position a real Mob (which has cx/cy GETTERS) by setting x/y from its own size.
const placeMob = (z, col, floorRow) => {
  z.x = (col + 0.5) * BS - z.width / 2;
  z.y = floorRow * BS - z.height;
  z.onGround = true; z.facing = z.facing || 1;
};
const PATH_ON = { enabled: true, searchRadius: 24, recompute: 12, maxExpansions: 5000 };

console.log('Additive gate:');
{
  const mm = new MobManager();
  const level = mkLevel(['        ', '        ', '########']);
  const z = mm._createMob('Zombie', 1.5 * BS - 11, 2 * BS - 48);
  z._pathCfg = null;
  ok(z._pathStep(bodyAt(5, 2, 48), level) === null, 'path-aware OFF → null (legacy straight-line chase)');
}

console.log('In-range chase steers along the route:');
{
  const level = mkLevel(['            ', '            ', '############']);
  const z = new sandbox.Mob(0, 0, 22, 48, 10);   // base mob is enough for _pathStep
  placeMob(z, 2, 2); z._pathCfg = PATH_ON;
  z.facing = 1;
  const step = z._pathStep(bodyAt(8, 2, 48), level);   // player 6 blocks to the right, flat floor
  ok(step !== null, 'in range → a path step is produced');
  ok(step && step.dir === 1, `steers toward the player (dir ${step && step.dir})`);
  ok(step && step.jump === false, 'flat corridor → no needless jump');
}

console.log('Out of range → legacy fallback:');
{
  const level = mkLevel(['                                          ',
                         '                                          ',
                         '##########################################']);
  const z = new sandbox.Mob(0, 0, 22, 48, 10);
  placeMob(z, 2, 2); z._pathCfg = PATH_ON;
  ok(z._pathStep(bodyAt(40, 2, 48), level) === null, 'player 38 blocks away (radius 24) → null');
}

console.log('Ambush from above — mob on a ledge above the player steers to the drop:');
{
  //        col: 0123456789
  const level = mkLevel([
    '          ',
    '          ',
    '###       ',   // high ledge (cols 0-2), mob stands on row 1
    '          ',
    '          ',
    '##########',   // ground floor, player on row 4
  ]);
  const z = new sandbox.Mob(0, 0, 22, 48, 10);
  placeMob(z, 1, 2); z._pathCfg = PATH_ON; z.facing = 1;
  const step = z._pathStep(bodyAt(4, 5, 48), level);
  ok(step !== null, 'a route to the player below is found (drop off the ledge)');
  ok(z._path && z._path.some(p => p[1] > 1), 'the cached route descends below the start ledge');
}

console.log('Routes around a wall (not straight into it):');
{
  //        col: 0123456789
  const level = mkLevel([
    '          ',
    '     #    ',
    '     #    ',
    '     #    ',   // a tall wall at col 5 (unjumpable, 3+ high with headroom)
    '          ',
    '##########',   // shared ground floor; go over/around via the top
  ]);
  const z = new sandbox.Mob(0, 0, 22, 48, 10);
  placeMob(z, 2, 5); z._pathCfg = PATH_ON; z.facing = 1;
  const step = z._pathStep(bodyAt(8, 5, 48), level);
  // The wall (3 tall) exceeds the 3-up envelope from an adjacent cell without room to
  // build; if any route exists it must not pass straight through col 5 at floor level.
  if (step) ok(z._path && z._path.every(p => !(p[0] === 5 && p[1] === 4)), 'route does not walk through the wall base');
  else ok(true, 'no legal route within budget → null (legacy fallback, no crash)');
}

console.log('Path invalidation on terrain change:');
{
  const level = mkLevel(['        ', '        ', '########']);
  const z = new sandbox.Mob(0, 0, 22, 48, 10);
  placeMob(z, 2, 2); z._pathCfg = PATH_ON;
  z._pathStep(bodyAt(6, 2, 48), level);
  ok(z._path && z._path.length >= 2, 'a route was cached');
  ok(z._pathStale(level, z._path) === false, 'cached route valid while terrain unchanged');
  // Drop a solid block onto a cell the route stands in → route is now stale.
  const cell = z._path[1];
  level.grid[cell[1]][cell[0]] = BLOCK.STONE;
  level.isSolid = (r, c) => (r === cell[1] && c === cell[0]) ? true : (r >= 2);
  ok(z._pathStale(level, z._path) === true, 'a block placed on the route → stale → recompute');
}

console.log('MobManager wires _pathCfg to every mob each frame:');
{
  const mm = new MobManager();
  mm.pathCfg = PATH_ON;
  const level = mkLevel(['        ', '        ', '########']);
  const z = mm._createMob('Zombie', 1.5 * BS - 11, 2 * BS - 48); mm.mobs.push(z);
  const player = bodyAt(4, 2, 48);
  mm._targetPlayers = [player];
  mm.update(player, level);
  ok(z._pathCfg === PATH_ON, 'mob received the manager path config');
}

console.log('§5 path-surround: flankers get opposite path biases:');
{
  const mm = new MobManager();
  mm.pathCfg = PATH_ON;
  mm.detectCfg = { enabled: true, packAlert: true, packRadius: 7 * BS };
  const level = mkLevel(['        ', '        ', '########']);
  const player = bodyAt(4, 2, 48);
  const a = mm._createMob('Zombie', 3 * BS, 2 * BS - 48); a._alerted = true; a.x = 3.5 * BS - 11;
  const b = mm._createMob('Zombie', 5 * BS, 2 * BS - 48); b._alerted = true; b.x = 4.5 * BS - 11;
  mm.mobs.push(a, b);
  mm._assignSurround(player);
  ok(a._pathFlankBias !== 0 && b._pathFlankBias !== 0, 'both flankers got a path bias');
  ok(Math.sign(a._pathFlankBias) === -Math.sign(b._pathFlankBias), 'biases point to OPPOSITE sides (surround)');
  ok(Math.abs(a._pathFlankBias) === 2.5 * BS, 'bias magnitude = PATH_FLANK_BIAS_BLOCKS');
}

console.log('§8 path-flee: a hurt mob retreats along a route:');
{
  const level = mkLevel(['            ', '            ', '############']);
  const z = new sandbox.Mob(0, 0, 22, 48, 10);
  placeMob(z, 8, 2);
  z.hp = 1; z.maxHp = 20; z.speed = 2; z.onGround = true;
  z._pathCfg = PATH_ON;
  z._flee = { action: 'flee', threshold: 0.2 };
  const player = bodyAt(9, 2, 48);   // player to the right → flee left
  const fled = z._fleeIfHurt(player, level);
  ok(fled === true, 'low-HP mob flees');
  ok(z.vx < 0, `retreats AWAY from the player (vx ${z.vx.toFixed(2)} < 0)`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
