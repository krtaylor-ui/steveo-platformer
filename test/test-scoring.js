// Headless tests for the arena scoring model (per-mode player score, team
// aggregation summed-vs-shared, and CTF/Tower stat writes).
const fs = require('fs');
const vm = require('vm');
const path = require('path').join(__dirname, '..', 'js');
const sandbox = { window: {}, BLOCK_SIZE: 32, PLAYER_W: 20, PLAYER_H: 52, PLAYER_ARROW_DAMAGE: 1, Math, console };
vm.createContext(sandbox);
for (const f of ['ctf-system.js', 'tower-system.js', 'arena-rules.js', 'arena-modes.js']) {
  vm.runInContext(fs.readFileSync(`${path}/${f}`, 'utf8'), sandbox, { filename: f });
}
const AM = sandbox.window.ARENA_MODES;
const CTF = sandbox.window.CTF_SYSTEM;
const TOWER = sandbox.window.TOWER_SYSTEM;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const blank = () => ({ kills: 0, mobKills: 0, emeralds: 0, flagCaptures: 0, towerDamage: 0 });
function mkGame(modeKey, players) {
  return {
    _arenaMode: modeKey ? { key: modeKey, hold: { p1: 0, p2: 0, p3: 0, p4: 0 }, wavesCleared: 0 } : undefined,
    arenaConfig: { arenaGameMode: modeKey },
    arenaState: { stats: { p1: blank(), p2: blank(), p3: blank(), p4: blank() }, teamScores: [0, 0] },
    _players: players,
    activePlayers() { return this._players; },
    _numPlayers() { return this._players.length; },
    _notify() {},
    level: { pixelWidth: 1000, pixelHeight: 400, spawnY: 120 },
    frameCount: 100,
  };
}
const P = (id, team) => ({ _ownerId: id, teamId: team ?? null, x: 100, y: 100, width: 20, height: 52, hp: 6, maxHp: 6 });

console.log('Per-mode player score:');
// Quick Battle (no mode): kills + mobKills + emeralds
let g = mkGame(null, [P('p1')]);
Object.assign(g.arenaState.stats.p1, { kills: 2, mobKills: 3, emeralds: 1 });
ok(AM.playerScore(g, 'p1') === 6, `Quick Battle = k+m+e (got ${AM.playerScore(g, 'p1')})`);

g = mkGame('MOB_HUNTER', [P('p1')]); Object.assign(g.arenaState.stats.p1, { kills: 5, mobKills: 4, emeralds: 9 });
ok(AM.playerScore(g, 'p1') === 4, `Mob Hunter = mobKills (got ${AM.playerScore(g, 'p1')})`);

g = mkGame('COLLECT_EMERALDS', [P('p1')]); g.arenaState.stats.p1.emeralds = 7;
ok(AM.playerScore(g, 'p1') === 7, `Emeralds = emeralds`);

g = mkGame('KING_OF_HILL', [P('p1')]); g._arenaMode.hold.p1 = 1800; g.arenaState.stats.p1.hillSeconds = 30;
ok(AM.playerScore(g, 'p1') === 3, `KOTH = hill 10s-blocks (30s → 3, got ${AM.playerScore(g, 'p1')})`);

g = mkGame('SURVIVAL_WAVES', [P('p1'), P('p2')]); g._arenaMode.wavesCleared = 4;
ok(AM.playerScore(g, 'p1') === 4 && AM.playerScore(g, 'p2') === 4, `Survival = waves defeated (shared)`);

g = mkGame('DEATHMATCH', [P('p1')]); Object.assign(g.arenaState.stats.p1, { kills: 3, mobKills: 9 });
ok(AM.playerScore(g, 'p1') === 3, `Deathmatch = player kills only (mobs ignored, got ${AM.playerScore(g, 'p1')})`);

g = mkGame('DEFEND_TOWER', [P('p1')]); Object.assign(g.arenaState.stats.p1, { kills: 5, towerDamage: 8 });
ok(AM.playerScore(g, 'p1') === 0, `Defend Tower = no points`);

console.log('Team score summed vs shared:');
// Summed (Mob Hunter): team0 = p1+p3 mobKills
g = mkGame('MOB_HUNTER', [P('p1', 0), P('p2', 1), P('p3', 0), P('p4', 1)]);
g.arenaState.stats.p1.mobKills = 2; g.arenaState.stats.p3.mobKills = 3; g.arenaState.stats.p2.mobKills = 1;
ok(AM.teamScore(g, 0) === 5, `MobHunter team0 summed = 2+3 (got ${AM.teamScore(g, 0)})`);
ok(AM.teamScore(g, 1) === 1, `MobHunter team1 summed = 1`);

// Shared (CTF): team captures NOT summed per-player-score
g = mkGame('CAPTURE_FLAG', [P('p1', 0), P('p2', 1), P('p3', 0), P('p4', 1)]);
g.arenaState.stats.p1.flagCaptures = 2; g.arenaState.stats.p3.flagCaptures = 1; g.arenaState.stats.p2.flagCaptures = 1;
ok(AM.playerScore(g, 'p1') === 2, `CTF player score = OWN captures (engine model, got ${AM.playerScore(g, 'p1')})`);
ok(AM.teamScore(g, 0) === 3, `CTF team0 = sum of members (2+1=3)`);
ok(AM.teamScore(g, 1) === 1, `CTF team1 shared = 1`);

// Shared (Survival): both players show waves, team = waves (not doubled)
g = mkGame('SURVIVAL_WAVES', [P('p1', 0), P('p3', 0)]); g._arenaMode.wavesCleared = 5;
ok(AM.teamScore(g, 0) === 5, `Survival team shared = 5 (not 10, got ${AM.teamScore(g, 0)})`);

console.log('CTF _score writes flagCaptures stat + team totals:');
g = mkGame('CAPTURE_FLAG', [P('p1', 0), P('p2', 1)]);
CTF.captures = [0, 0]; CTF.flags = [{ team: 0 }, { team: 1 }];
CTF._score(g, g._players[0]);
ok(g.arenaState.stats.p1.flagCaptures === 1, `CTF _score bumps p1 flagCaptures`);
ok(CTF.captures[0] === 1, `CTF team0 total = 1`);
ok(AM._teamCaptures(g, 0) === 1, `arena-modes _teamCaptures reads it`);

console.log('Tower _damage writes towerDamage stat:');
g = mkGame('DEFEND_TOWER', [P('p1'), P('p2')]);
TOWER.active = true; TOWER._winner = null;
TOWER.towers = [{ ownerId: 'p1', hp: 9, maxHp: 9, _hitBy: {} }];
TOWER._damage(g, TOWER.towers[0], 2, 'p2');
ok(g.arenaState.stats.p2.towerDamage === 2, `Tower damage credited to attacker (got ${g.arenaState.stats.p2.towerDamage})`);
TOWER._damage(g, TOWER.towers[0], 100, 'p2'); // overkill counts only remaining
ok(g.arenaState.stats.p2.towerDamage === 9, `towerDamage counts only HP actually removed (got ${g.arenaState.stats.p2.towerDamage})`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
