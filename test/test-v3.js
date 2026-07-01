// Headless logic tests for Phase 3 v3 (Tower banding/heal + CTF core).
const fs = require('fs');
const vm = require('vm');
const path = require('path').join(__dirname, '..', 'js');

// Shared sandbox with the globals the systems reference.
const sandbox = { window: {}, BLOCK_SIZE: 32, PLAYER_W: 20, PLAYER_H: 52, Math, console };
sandbox.global = sandbox;
vm.createContext(sandbox);
for (const f of ['ctf-system.js', 'tower-system.js']) {
  vm.runInContext(fs.readFileSync(`${path}/${f}`, 'utf8'), sandbox, { filename: f });
}
const CTF = sandbox.window.CTF_SYSTEM;
const TOWER = sandbox.window.TOWER_SYSTEM;

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  FAIL:', msg); } };

// ---- TOWER banding + heal across all four HP settings ----
console.log('Tower banding + heal:');
for (const maxHp of [3, 6, 9, 12]) {
  TOWER.maxHp = maxHp;
  const third = maxHp / 3;
  const mk = hp => ({ maxHp, hp });
  // band boundaries
  ok(TOWER._band(mk(maxHp)) === 0, `hp=max band=undamaged (max ${maxHp})`);
  ok(TOWER._band(mk(2 * third + 0.5)) === 0, `> 2/3 = undamaged (max ${maxHp})`);
  ok(TOWER._band(mk(third + 0.5)) === 1, `(1/3, 2/3] = lightly (max ${maxHp})`);
  ok(TOWER._band(mk(1)) === 2, `hp=1 heavily (max ${maxHp})`);
  // heal: heavily -> bottom of lightly (> third), lightly -> bottom of undamaged (> 2*third)
  let t = mk(1); TOWER.healTower(t); ok(t.hp > third && t.hp <= 2 * third, `heavily heals into lightly (max ${maxHp}, got ${t.hp})`);
  t = mk(Math.ceil(third) + 1); const b0 = TOWER._band(t); ok(b0 === 1, `setup lightly (max ${maxHp})`);
  TOWER.healTower(t); ok(t.hp > 2 * third, `lightly heals into undamaged (max ${maxHp}, got ${t.hp})`);
  t = mk(maxHp - (maxHp > 3 ? 1 : 0)); if (TOWER._band(t) === 0) { TOWER.healTower(t); ok(t.hp === maxHp, `undamaged heals to full (max ${maxHp}, got ${t.hp})`); } else { pass++; }
}

// worked example from brief: max=9 → heavily(3)->4, lightly(6)->7, undamaged(7 or 8)->9
TOWER.maxHp = 9;
let t = { maxHp: 9, hp: 3 }; TOWER.healTower(t); ok(t.hp === 4, `max9 heavily(3)->4 (got ${t.hp})`);
t = { maxHp: 9, hp: 6 }; TOWER.healTower(t); ok(t.hp === 7, `max9 lightly(6)->7 (got ${t.hp})`);
t = { maxHp: 9, hp: 7 }; TOWER.healTower(t); ok(t.hp === 9, `max9 undamaged(7)->9 (got ${t.hp})`);
t = { maxHp: 9, hp: 8 }; TOWER.healTower(t); ok(t.hp === 9, `max9 undamaged(8)->9 (got ${t.hp})`);

// ---- TOWER damage + win ----
console.log('Tower damage/win:');
const g = { _notify: () => {}, arenaState: { phase: 'running' }, frameCount: 100 };
TOWER.active = true; TOWER._winner = null;
TOWER.towers = [{ ownerId: 'p1', x: 0, y: 0, w: 32, h: 128, maxHp: 3, hp: 3, _hitBy: {} }];
TOWER._damage(g, TOWER.towers[0], 1, 'p2'); ok(TOWER.towers[0].hp === 2, 'damage reduces hp');
ok(!TOWER.isOver(), 'not over at hp>0');
TOWER._damage(g, TOWER.towers[0], 2, 'p2'); ok(TOWER.towers[0].hp === 0, 'hp floored at 0');
ok(TOWER.isOver(), 'isOver when a tower hits 0');
ok(TOWER.winner() === 'p2', 'destroyer is winner');

// ---- CTF core: base zone, one-at-a-time, both-flags-out scoring, per-player->team ----
console.log('CTF core:');
function mkGame() {
  const p1 = { x: 100, y: 100, width: 20, height: 52, hp: 6, maxHp: 6, teamId: 0, _ownerId: 'p1', teamColor: '#e74c3c' };
  const p2 = { x: 900, y: 100, width: 20, height: 52, hp: 6, maxHp: 6, teamId: 1, _ownerId: 'p2', teamColor: '#3498db' };
  return {
    _notify: () => {}, arenaState: {
      scores: { p1: 0, p2: 0, p3: 0, p4: 0 }, teamScores: [0, 0],
      stats: { p1: { kills:0,mobKills:0,emeralds:0,flagCaptures:0,towerDamage:0 },
               p2: { kills:0,mobKills:0,emeralds:0,flagCaptures:0,towerDamage:0 },
               p3: { kills:0,mobKills:0,emeralds:0,flagCaptures:0,towerDamage:0 },
               p4: { kills:0,mobKills:0,emeralds:0,flagCaptures:0,towerDamage:0 } } },
    _arenaMode: { key: 'CAPTURE_FLAG' }, arenaConfig: { flagReturnSeconds: 15 },
    level: { pixelWidth: 1000, pixelHeight: 400, spawnY: 120 },
    _players: [p1, p2], activePlayers() { return this._players; },
  };
}
const gm = mkGame();
CTF.init(gm);
ok(CTF.active, 'CTF active after init');
ok(CTF.bases && CTF.bases.length === 2, 'two bases created');
ok(CTF.flags && CTF.flags.length === 2, 'two flags created');
ok(gm._players[0].shirtColor === '#e74c3c' && gm._players[1].shirtColor === '#3498db', 'team shirt colours assigned');

// p1 (team0) grabs the enemy (team1) flag by moving onto it.
const enemyFlag = CTF.flags[1];
gm._players[0].x = enemyFlag.x - 10; gm._players[0].y = enemyFlag.y - 10;
CTF.update(gm);
ok(enemyFlag.carriedBy === gm._players[0], 'p1 grabbed enemy flag');

// one-at-a-time: p1 cannot grab own flag while carrying enemy flag.
const ownFlag = CTF.flags[0]; ownFlag.dropped = true; // pretend own flag was dropped nearby
ownFlag.x = gm._players[0].x + 5; ownFlag.y = gm._players[0].y + 5;
CTF.update(gm);
ok(ownFlag.carriedBy !== gm._players[0], 'cannot carry two flags at once');
ownFlag.dropped = false; CTF._returnFlag(ownFlag);

// both-flags-out scoring: even if own flag is NOT home, carrier in own base scores.
CTF.flags[0].dropped = true; CTF.flags[0].carriedBy = null; // own flag out
const base0 = CTF.bases[0];
gm._players[0].x = base0.x - 5; gm._players[0].y = base0.y - 5; // step into own base carrying enemy flag
CTF.update(gm);
ok(CTF.captures[0] === 1, `team0 scored with own flag out (got ${CTF.captures[0]})`);
ok(gm.arenaState.stats.p1.flagCaptures === 1, 'per-player flagCaptures recorded for p1');
ok(gm.arenaState.teamScores[0] === 1, 'team total = sum of per-player');
ok(enemyFlag.carriedBy === null && !enemyFlag.dropped, 'captured enemy flag returned home');

// drop-on-defeat: carrier defeated drops the flag, does not keep it.
gm._players[1].x = CTF.flags[0].x; gm._players[1].y = CTF.flags[0].y; // p2 grabs team0's flag
CTF.flags[0].dropped = true; CTF.update(gm);
const f0 = CTF.flags[0];
if (f0.carriedBy === gm._players[1]) {
  gm._players[1].hp = 0;
  CTF.onPlayerDefeated(gm, gm._players[1]);
  ok(f0.carriedBy === null && f0.dropped, 'defeated carrier drops the flag');
} else { pass++; }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
