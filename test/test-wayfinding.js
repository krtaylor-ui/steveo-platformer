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
  PATH_CROWD_THRESHOLD: 8, PATH_CROWD_RECOMPUTE_MULT: 2.5, PATH_CROWD_RADIUS_MULT: 0.6,
  MOB_PATH_BUDGET: 4, MOB_PATH_RECOMPUTES_PER_FRAME: 2,
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

console.log('Short mob HOPS a 1-block obstacle (Cave-Spider fix); tall mob auto-steps:');
{
  //        col: 0123456789
  const level = mkLevel([
    '          ',
    '          ',
    '   #      ',   // a 1-block step at col 3, sitting on the floor
    '##########',   // floor
  ]);
  // Short mob (height 16, <= 1 block) adjacent to the step → must jump.
  const spider = new sandbox.Mob(0, 0, 16, 16, 6);
  placeMob(spider, 2, 3); spider._pathCfg = PATH_ON; spider.facing = 1;
  const s1 = spider._pathStep(bodyAt(7, 3, 48), level);
  ok(s1 && s1.jump === true, 'short mob jumps the 1-block obstacle (no longer hangs)');
  // Tall mob (height 48) in the same spot → relies on _mobPhysics auto step-up.
  const zombie = new sandbox.Mob(0, 0, 22, 48, 10);
  placeMob(zombie, 2, 3); zombie._pathCfg = PATH_ON; zombie.facing = 1;
  const s2 = zombie._pathStep(bodyAt(7, 3, 48), level);
  ok(s2 && s2.jump === false, 'tall mob does NOT jump a 1-block step (auto-steps smoothly)');
}

console.log('Crowd throttle degrades the path config above the threshold:');
{
  const mm = new MobManager();
  mm.pathCfg = { enabled: true, searchRadius: 24, recompute: 12, maxExpansions: 5000 };
  mm._activePathCount = 5;                       // <= threshold → unchanged
  ok(mm._crowdAdjustedPathCfg() === mm.pathCfg, 'uncrowded → base config (unchanged)');
  mm._activePathCount = 9;                       // > threshold (8) → degraded
  const d = mm._crowdAdjustedPathCfg();
  ok(d !== mm.pathCfg && d._degraded === true, 'crowded → a degraded config');
  ok(d.recompute === 30, `recompute stretched 12 → ${d.recompute} (less frequent)`);
  ok(d.searchRadius === 14, `radius shrunk 24 → ${d.searchRadius} (cheaper search)`);
  ok(d.maxExpansions === 3000, `node cap reduced 5000 → ${d.maxExpansions}`);
  mm.pathCfg = null;
  ok(mm._crowdAdjustedPathCfg() === null, 'path-aware off → null (no throttle)');
}

console.log('Active-pather count reflects mobs following routes this frame:');
{
  const mm = new MobManager();
  mm.pathCfg = { enabled: true, searchRadius: 24, recompute: 12, maxExpansions: 5000 };
  const level = mkLevel(['            ', '            ', '############']);
  const z = mm._createMob('Zombie', 3 * BS, 2 * BS - 48); z._alerted = true; mm.mobs.push(z);
  const player = bodyAt(6, 2, 48);
  mm._targetPlayers = [player];
  mm.update(player, level);
  ok(mm._activePathCount === 1, `one chasing mob counted as wayfinding (got ${mm._activePathCount})`);
}

console.log('Bounded pathfinding — only the nearest few mobs are "smart" (perf):');
{
  const mm = new MobManager();
  const cfg = { enabled: true, searchRadius: 24, recompute: 12, maxExpansions: 2500 };
  const level = mkLevel(['                              ', '                              ', '##############################']);
  const player = bodyAt(15, 1, 48);
  // 10 chasing mobs strung across the floor, all within the search radius of the player.
  for (let i = 0; i < 10; i++) { const z = mm._createMob('Zombie', (3 + i * 2) * BS, 1 * BS - 48); z._alerted = true; mm.mobs.push(z); }
  const set = mm._selectPathfinders(player, null, cfg);
  ok(set instanceof Set && set.size === 4, `only MOB_PATH_BUDGET (4) mobs selected to pathfind (got ${set && set.size})`);
  // The selected mobs must be the CLOSEST to the player (nearest-first), not arbitrary.
  const dist = (m) => Math.abs(m.cx - player.cx);
  const chosenMax = Math.max(...[...set].map(dist));
  const unchosenMin = Math.min(...mm.mobs.filter(m => !set.has(m)).map(dist));
  ok(chosenMax <= unchosenMin, 'the selected pathfinders are the nearest mobs to the player');
  // Few mobs in range → no restriction (null = everyone may path).
  const mm2 = new MobManager();
  for (let i = 0; i < 3; i++) { const z = mm2._createMob('Zombie', (14 + i) * BS, 1 * BS - 48); z._alerted = true; mm2.mobs.push(z); }
  ok(mm2._selectPathfinders(player, null, cfg) === null, '<= budget in range → no restriction (null)');
}

console.log('Per-frame A* cap — recomputes are bounded regardless of mob count:');
{
  const mm = new MobManager();
  mm.pathCfg = { enabled: true, searchRadius: 24, recompute: 12, maxExpansions: 2500 };
  const level = mkLevel(['                    ', '                    ', '####################']);
  const player = bodyAt(10, 1, 48);
  for (let i = 0; i < 10; i++) { const z = mm._createMob('Zombie', (1 + i) * BS, 1 * BS - 48); z._alerted = true; mm.mobs.push(z); }
  // Count findMobPath calls in one update() frame (all mobs stale on their first frame).
  let calls = 0; const orig = sandbox.findMobPath;
  sandbox.findMobPath = (...a) => { calls++; return orig(...a); };
  try { mm.update(player, level); } finally { sandbox.findMobPath = orig; }
  ok(calls <= 2, `at most MOB_PATH_RECOMPUTES_PER_FRAME (2) A* runs in a frame, even with 10 mobs (got ${calls})`);
  ok(calls >= 1, 'but at least one mob does pathfind (not fully starved)');
}

console.log('Flee pathfinding also honours the per-frame A* cap (heavy ×3-retry caller):');
{
  const mm = new MobManager();
  mm.pathCfg = { enabled: true, searchRadius: 24, recompute: 12, maxExpansions: 2500 };
  mm.fleeCfg = { zombie: { action: 'flee', threshold: 0.99 } };   // always flee (low HP)
  const level = mkLevel(['                    ', '                    ', '####################']);
  const player = bodyAt(3, 2, 48);
  // 10 hurt zombies → all want to flee; flee used to run 3 A* each, every frame, uncapped.
  for (let i = 0; i < 10; i++) { const z = mm._createMob('Zombie', (7 + i) * BS, 1 * BS - 48); z._alerted = true; z.hp = 1; z.maxHp = 6; mm.mobs.push(z); }
  let calls = 0; const orig = sandbox.findMobPath;
  sandbox.findMobPath = (...a) => { calls++; return orig(...a); };
  try { mm.update(player, level); } finally { sandbox.findMobPath = orig; }
  ok(calls <= 2, `fleeing mobs also capped at 2 A* runs/frame (was 12+ uncapped; got ${calls})`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
