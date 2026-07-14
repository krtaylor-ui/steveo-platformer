// Headless tests for Smart Mobs §9 — spider webs:
//   - Web projectile: travels, applies the slow on contact, dies on hit/wall/lifetime
//   - Player.applyWeb: reduction math, stacking compounding, duration-timer reset
const fs = require('fs');
const vm = require('vm');
const jsDir = require('path').join(__dirname, '..', 'js');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  FAIL:', msg); } };

const mkSandbox = () => {
  const real = {
    window: {}, document: {}, Math, console, Set, Map, Array, Object, JSON, Number, String, Boolean,
    BLOCK_SIZE: 32, GRAVITY: 0.66, JUMP_VELOCITY: -12, MAX_FALL_SPEED: 12, CANVAS_W: 960,
  };
  const sb = new Proxy(real, { has: () => true, get: (t, k) => (k in t ? t[k] : (typeof k === 'symbol' ? undefined : 1)), set: (t, k, v) => { t[k] = v; return true; } });
  vm.createContext(sb);
  return sb;
};

// ── Web projectile (from mobs.js) ──
const ms = mkSandbox();
vm.runInContext(fs.readFileSync(`${jsDir}/mobs.js`, 'utf8') + '\n;this.Web = Web;', ms, { filename: 'mobs.js' });
const Web = ms.Web;

console.log('Web projectile:');
{
  const flatLevel = { isSolid: (r, c) => false };
  const cfg = { reduction: 0.33, durationFrames: 180, stacking: false };
  // A web heading right toward a player it overlaps → applies the slow + dies.
  const web = new Web(100, 100, 6, 0, cfg);
  let applied = null;
  const player = { x: 96, y: 90, width: 24, height: 40, applyWeb: (r, d, s) => { applied = { r, d, s }; } };
  web.update(player, flatLevel);
  ok(applied && applied.r === 0.33 && applied.d === 180, 'web applies its slow config on contact');
  ok(web.alive === false, 'web dies after hitting the player');
}
{
  const web = new Web(100, 100, 6, 0, { reduction: 0.33, durationFrames: 180, stacking: false });
  const wallLevel = { isSolid: () => true };
  const player = { x: 9999, y: 9999, width: 10, height: 10, applyWeb: () => {} };
  web.update(player, wallLevel);
  ok(web.alive === false, 'web dies on a solid wall');
}
{
  const web = new Web(0, 0, 6, 0, { reduction: 0.33, durationFrames: 180, stacking: false });
  const flatLevel = { isSolid: () => false };
  const player = { x: 9999, y: 9999, width: 10, height: 10, applyWeb: () => {} };
  for (let i = 0; i < 160; i++) web.update(player, flatLevel);
  ok(web.alive === false, 'web expires after its lifetime if it hits nothing');
}

// ── Player.applyWeb math (real method from player.js) ──
const ps = mkSandbox();
vm.runInContext(fs.readFileSync(`${jsDir}/player.js`, 'utf8') + '\n;this.Player = Player;', ps, { filename: 'player.js' });
const Player = ps.Player;
const mkPlayer = () => { const p = Object.create(Player.prototype); p._webSlowTimer = 0; p._webSlowMult = 1; return p; };

console.log('Player.applyWeb:');
{
  const p = mkPlayer();
  p.applyWeb(0.33, 180, false);
  ok(Math.abs(p._webSlowMult - 0.67) < 1e-9, '33% reduction → 0.67 speed multiplier');
  ok(p._webSlowTimer === 180, 'duration timer set to the configured length');
}
{
  const p = mkPlayer();
  p.applyWeb(0.33, 180, true);        // first hit
  p._webSlowTimer = 90;               // still slowed
  p.applyWeb(0.33, 180, true);        // second hit, stacking on
  ok(Math.abs(p._webSlowMult - 0.4489) < 1e-4, 'stacking compounds: 0.67 → ~0.4489 (44%)');
  ok(p._webSlowTimer === 180, 'each new web resets the duration timer to full');
}
{
  const p = mkPlayer();
  p.applyWeb(0.33, 180, false);
  p._webSlowTimer = 90;
  p.applyWeb(0.33, 180, false);       // stacking OFF → just re-applies base cut
  ok(Math.abs(p._webSlowMult - 0.67) < 1e-9, 'no stacking → stays at 0.67 (no compounding)');
  ok(p._webSlowTimer === 180, 'timer still resets without stacking');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
