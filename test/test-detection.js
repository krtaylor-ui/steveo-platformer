// Headless tests for Smart Mobs §4 — Detection core:
//   - the additive gate (_shouldChase): legacy when off, alert-gated when on
//   - sight axis (_updateDetection): range, frontal cone, occlusion by solids + bushes
//   - sound/action (emitNoise): radius + per-axis toggle gating
//   - blockSoundTier ratings
const fs = require('fs');
const vm = require('vm');
const jsDir = require('path').join(__dirname, '..', 'js');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  FAIL:', msg); } };

// Load blocks.js (BLOCK, foliageOccludesSight, blockSoundTier) + mobs.js into one ctx.
const real = {
  window: {}, Math, console, Set, Map, Array, Object, JSON, Number, String, Boolean,
  BLOCK_SIZE: 32, GRAVITY: 0.66, JUMP_VELOCITY: -12, MAX_FALL_SPEED: 12,
  IFRAMES: 20, KNOCKBACK_FORCE: 6, CANVAS_W: 960,
};
const sandbox = new Proxy(real, {
  has: () => true,
  get: (t, k) => (k in t ? t[k] : (typeof k === 'symbol' ? undefined : 1)),
  set: (t, k, v) => { t[k] = v; return true; },
});
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(`${jsDir}/blocks.js`, 'utf8') +
  '\n;this.BLOCK = BLOCK; this.blockSoundTier = blockSoundTier; this.foliageOccludesSight = foliageOccludesSight;',
  sandbox, { filename: 'blocks.js' });
vm.runInContext(fs.readFileSync(`${jsDir}/mobs.js`, 'utf8') +
  '\n;this.MobManager = MobManager; this.Mob = Mob;',
  sandbox, { filename: 'mobs.js' });
const { MobManager, BLOCK, blockSoundTier } = sandbox;

const CFG = {
  enabled: true, sight: true, sound: true, action: true,
  sightRange: 9 * 32, sightArcDeg: 120,
  soundWalk: 5 * 32, soundRun: 9 * 32, soundLoud: 14 * 32, actionRange: 8 * 32,
  packAlert: false, packRadius: 7 * 32,
};
const clearLevel = { isSolid: () => false, grid: null };
// A mob facing right at ~ (111,124); target to the right within range/cone.
const mkMob = (mm, facing = 1) => { const m = mm._createMob('Zombie', 100, 100); m.facing = facing; m._alerted = false; mm.mobs.push(m); return m; };
const tgt = (cx, cy = 124) => ({ cx, cy, y: cy - 24, height: 48 });

console.log('Sound tiers:');
ok(blockSoundTier(BLOCK.GRAVEL) === 'loud', 'gravel = loud');
ok(blockSoundTier(BLOCK.GRASS) === 'quiet', 'grass = quiet');
ok(blockSoundTier(BLOCK.STONE) === 'normal', 'stone = normal');

console.log('Chase gate (additive):');
{
  const mm = new MobManager();
  const m = mkMob(mm);
  m._detect = null;
  ok(m._shouldChase() === true, 'detection OFF → legacy chase allowed');
  m._detect = { enabled: true }; m._alerted = false;
  ok(m._shouldChase() === false, 'detection ON + not alerted → no chase');
  m._alerted = true;
  ok(m._shouldChase() === true, 'detection ON + alerted → chase');
}

console.log('Sight axis:');
{
  const mm = new MobManager(); mm.detectCfg = CFG;
  const m = mkMob(mm, 1);
  mm._updateDetection(m, tgt(111 + 150), clearLevel);
  ok(m._alerted === true, 'sees target in front, in range, clear line');
}
{
  const mm = new MobManager(); mm.detectCfg = CFG;
  const m = mkMob(mm, 1);                        // facing right
  mm._updateDetection(m, tgt(111 - 150), clearLevel);   // target behind
  ok(m._alerted === false, 'target behind the facing cone → NOT seen');
}
{
  const mm = new MobManager(); mm.detectCfg = CFG;
  const m = mkMob(mm, 1);
  mm._updateDetection(m, tgt(111 + 9 * 32 + 60), clearLevel);   // just out of range
  ok(m._alerted === false, 'target beyond sight range → NOT seen');
}
{
  const mm = new MobManager(); mm.detectCfg = CFG;
  const m = mkMob(mm, 1);
  mm._updateDetection(m, tgt(111 + 150), { isSolid: () => true, grid: null });  // wall between
  ok(m._alerted === false, 'solid block occludes line of sight');
}
{
  const mm = new MobManager(); mm.detectCfg = CFG;
  const m = mkMob(mm, 1);
  // Bushes filling col 4-7 on row 3 (the mob's eye row) between mob and target.
  const grid = Array.from({ length: 8 }, () => Array(20).fill(BLOCK.AIR));
  for (let c = 4; c <= 7; c++) grid[3][c] = BLOCK.BUSH_BACK;
  mm._updateDetection(m, tgt(111 + 150), { isSolid: () => false, grid });
  ok(m._alerted === false, 'a bush occludes line of sight (§10 dependency)');
}
{
  const mm = new MobManager(); mm.detectCfg = CFG;
  const m = mkMob(mm, 1);
  const grid = Array.from({ length: 8 }, () => Array(20).fill(BLOCK.AIR));
  for (let c = 4; c <= 7; c++) grid[3][c] = BLOCK.DECO_LEAVES_BACK;  // leaves don't occlude
  mm._updateDetection(m, tgt(111 + 150), { isSolid: () => false, grid });
  ok(m._alerted === true, 'decorative leaves do NOT occlude (still seen through them)');
}
{
  const mm = new MobManager(); mm.detectCfg = { ...CFG, sight: false };
  const m = mkMob(mm, 1);
  mm._updateDetection(m, tgt(111 + 150), clearLevel);
  ok(m._alerted === false, 'sight axis OFF → no sight alert even in the open');
}

console.log('Sound / action (emitNoise):');
{
  const mm = new MobManager(); mm.detectCfg = CFG;
  const near = mkMob(mm, 1);   // at cx 111
  mm.emitNoise(200, 124, 5 * 32, 'sound');   // within 160px of the mob
  ok(near._alerted === true, 'footstep noise within radius alerts a mob (through walls, no LoS)');
}
{
  const mm = new MobManager(); mm.detectCfg = CFG;
  const far = mkMob(mm, 1);
  mm.emitNoise(111 + 6 * 32, 124, 5 * 32, 'sound');   // 192px away, radius 160 → miss
  ok(far._alerted === false, 'noise beyond radius does not alert');
}
{
  const mm = new MobManager(); mm.detectCfg = { ...CFG, sound: false };
  const m = mkMob(mm, 1);
  mm.emitNoise(120, 124, 5 * 32, 'sound');
  ok(m._alerted === false, 'sound axis OFF → footstep noise ignored');
}
{
  const mm = new MobManager(); mm.detectCfg = { ...CFG, action: false };
  const m = mkMob(mm, 1);
  mm.emitNoise(120, 124, 8 * 32, 'action');
  ok(m._alerted === false, 'action axis OFF → attack/jump noise ignored');
}
{
  const mm = new MobManager(); mm.detectCfg = { ...CFG, enabled: false };
  const m = mkMob(mm, 1);
  mm.emitNoise(120, 124, 8 * 32, 'sound');
  mm._updateDetection(m, tgt(111 + 150), clearLevel);
  ok(m._alerted === false, 'master detection OFF → neither sight nor noise alerts');
}

console.log('Pack behavior (§5):');
{
  const mm = new MobManager(); mm.detectCfg = { ...CFG, packAlert: true };
  const a = mm._createMob('Zombie', 100, 100); a._alerted = true;
  const b = mm._createMob('Zombie', 100 + 4 * 32, 100); b._alerted = false;   // within 7-block radius
  const far = mm._createMob('Zombie', 100 + 20 * 32, 100); far._alerted = false;
  mm.mobs.push(a, b, far);
  mm._propagatePackAlerts();
  ok(b._alerted === true, 'alerted mob rouses a nearby mob (pack propagation)');
  ok(far._alerted === false, 'a mob beyond the spread radius is not roused');
}
{
  const mm = new MobManager(); mm.detectCfg = { ...CFG, packAlert: false };
  const a = mm._createMob('Zombie', 100, 100); a._alerted = true;
  const b = mm._createMob('Zombie', 100 + 4 * 32, 100); b._alerted = false;
  mm.mobs.push(a, b);
  mm._propagatePackAlerts();
  ok(b._alerted === false, 'no propagation when pack behavior is off');
}
{
  const mm = new MobManager(); mm.detectCfg = { ...CFG, packAlert: true };
  const player = tgt(500, 300);
  const m1 = mm._createMob('Zombie', 400, 276); m1._alerted = true;   // both left of player
  const m2 = mm._createMob('Zombie', 420, 276); m2._alerted = true;
  mm.mobs.push(m1, m2);
  mm._assignSurround(player);
  ok(m1._flankOffset !== 0 && m2._flankOffset !== 0, 'surround assigns flank offsets to clustered melee mobs');
  ok(Math.sign(m1._flankOffset) !== Math.sign(m2._flankOffset), 'clustered mobs get OPPOSITE sides (surround)');
}
{
  const mm = new MobManager(); mm.detectCfg = { ...CFG, packAlert: false };
  const player = tgt(500, 300);
  const m1 = mm._createMob('Zombie', 400, 276); m1._alerted = true;
  mm.mobs.push(m1);
  m1._flankOffset = 99;
  mm._assignSurround(player);
  ok(m1._flankOffset === 0, 'surround clears flank offset when pack behavior is off');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
