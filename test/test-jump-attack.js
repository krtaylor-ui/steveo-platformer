// Jump-attack / stomp mechanic + Mario-style enemies (Goomba, Koopa, Shell).
//   node test/test-jump-attack.js
const fs = require('fs');
const vm = require('vm');
const path = require('path').join(__dirname, '..', 'js');
const real = {
  window: {}, Math, console, Set, Map, Array, Object, JSON, Number, String, Boolean,
  BLOCK: {}, BLOCK_SIZE: 32, GRAVITY: 0.66, JUMP_VELOCITY: -12, MAX_FALL_SPEED: 21.6,
  IFRAMES: 40, KNOCKBACK_FORCE: 9, ITEM_DROP_LIFETIME: 3600, XP_PER_ORB: 3,
  MOB_ACTIVATION_RANGE: 800, MOB_MIN_SPAWN_DIST: 200, MOB_RESPAWN_FRAMES: 600,
  CANVAS_W: 960, BOW_GRAVITY: 0.2, PLAYER_W: 20, PLAYER_H: 52, MOB_ATTACK_RATE: 30,
};
const sandbox = new Proxy(real, { has: () => true, get: (t, k) => (k in t ? t[k] : (typeof k === 'symbol' ? undefined : 1)), set: (t, k, v) => { t[k] = v; return true; } });
vm.createContext(sandbox);
const src = fs.readFileSync(`${path}/mobs.js`, 'utf8') + '\n;this.Goomba=Goomba; this.Koopa=Koopa; this.Shell=Shell; this.Mob=Mob;';
vm.runInContext(src, sandbox, { filename: 'mobs.js' });
const { Goomba, Koopa, Shell } = sandbox;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
// a minimal "player": position + size + velocity
const mkPlayer = (x, y, vy) => ({ x, y, width: 20, height: 40, vx: 0, vy, onGround: false, get cx() { return this.x + this.width / 2; }, dead: false, takeDamage() {} });

console.log('Stomp detection (_isStomp):');
{
  const g = new Goomba(100, 200);   // 24x22 at (100,200)
  const falling = mkPlayer(100, 178, 6);   // feet at 218, just onto the goomba top (200), descending
  ok(g._isStomp(falling) === true, 'a descending player overlapping the top = a stomp');
  const rising = mkPlayer(100, 178, -6);
  ok(g._isStomp(rising) === false, 'a RISING player (vy<0) is not a stomp (you get hit)');
  const beside = mkPlayer(140, 200, 6);   // no horizontal overlap
  ok(g._isStomp(beside) === false, 'no overlap = no stomp');
}

console.log('Goomba squishes in one stomp:');
{
  const g = new Goomba(100, 200); const p = mkPlayer(100, 180, 6);
  g.onStomp(null, p);
  ok((g._squishT | 0) > 0, 'onStomp starts the squish timer');
  ok(p.vy < 0, 'the player bounces up off the stomp');
  ok(g.alive === true, 'still alive during the squish animation (reaped when the timer ends)');
}

console.log('Koopa: shell pops on stomp 1, squish on stomp 2:');
{
  const mgr = { mobs: [], spawnShell(x, y, f) { const s = new Shell(x, y, f); this.mobs.push(s); return s; } };
  const k = new Koopa(100, 200); const p = mkPlayer(100, 180, 6);
  ok(k.hasShell === true, 'a koopa starts with its shell');
  k.onStomp(mgr, p);
  ok(k.hasShell === false, 'first stomp knocks the shell off');
  ok(mgr.mobs.length === 1 && mgr.mobs[0] instanceof Shell, 'a kickable Shell spawns');
  ok((k._squishT | 0) === 0 && k.alive, 'the koopa survives the first stomp (shell-less)');
  const p2 = mkPlayer(100, 180, 6);
  k.onStomp(mgr, p2);
  ok((k._squishT | 0) > 0, 'a second stomp squishes it');
}

console.log('Shell: idle → kicked, sliding KOs a mob:');
{
  const shell = new Shell(300, 200, 1);
  ok(shell.slideState === 'idle', 'a fresh shell sits idle');
  const p = mkPlayer(300, 200, 6);
  shell.onStomp(null, p);
  ok(shell.slideState === 'sliding', 'stomping an idle shell kicks it into a slide');
  // put a victim mob in the shell path and run the KO check inside update
  const victim = new Goomba(shell.x + 2, shell.y);
  const mgr = { mobs: [shell, victim] }; shell._mobManager = mgr; shell._kickCd = 0;
  const lvl = { isSolid: () => false, getBlockAt: () => 0, width: 10000, height: 2000 };
  shell.update(mkPlayer(-500, -500, 0), lvl);   // player far away; run the sliding KO pass
  ok(victim.alive === false || victim._launched === true, 'a sliding shell KOs a mob it overlaps');
  const p3 = mkPlayer(shell.x, shell.y, 6);
  shell.onStomp(null, p3);
  ok(shell.slideState === 'idle', 'stomping a sliding shell stops it');
}

console.log(`\njump-attack: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
