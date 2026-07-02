// Parity tests: the ARENA_RULES presets reproduce the current hardcoded modes.
const fs = require('fs');
const vm = require('vm');
const path = require('path').join(__dirname, '..', 'js');
const sandbox = { window: {}, BLOCK_SIZE: 32, PLAYER_W: 20, PLAYER_H: 52, Math, console };
vm.createContext(sandbox);
for (const f of ['ctf-system.js', 'tower-system.js', 'arena-rules.js', 'arena-modes.js']) {
  vm.runInContext(fs.readFileSync(`${path}/${f}`, 'utf8'), sandbox, { filename: f });
}
const RULES = sandbox.window.ARENA_RULES;
const AM = sandbox.window.ARENA_MODES;
const TOWER = sandbox.window.TOWER_SYSTEM;
const KEYS = sandbox.window.ARENA_STAT_KEYS;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const blank = () => { const s = {}; for (const k of KEYS) s[k] = 0; return s; };
function mkGame(modeKey, players, extra) {
  const g = {
    _arenaMode: modeKey ? { key: modeKey, hold: { p1: 0, p2: 0, p3: 0, p4: 0 }, wavesCleared: 0, totalWaves: 5, killTarget: 10, captureTarget: 3 } : undefined,
    arenaConfig: { arenaGameMode: modeKey },
    arenaState: { stats: { p1: blank(), p2: blank(), p3: blank(), p4: blank() }, teamScores: [0, 0] },
    _players: players,
    activePlayers() { return this._players; },
    _numPlayers() { return this._players.length; },
    mobManager: { mobs: [] },
  };
  Object.assign(g, extra || {});
  return g;
}
const P = (id, team) => ({ _ownerId: id, teamId: team ?? null, hp: 6, maxHp: 6, width: 20, height: 52, x: 0, y: 0 });
const rs = (k) => RULES.normalize(RULES.PRESETS[k]);

console.log('Scoring parity (rules preset == hardcoded ARENA_MODES):');
// Quick Battle
let g = mkGame(null, [P('p1')]); Object.assign(g.arenaState.stats.p1, { kills: 2, mobKills: 3, emeralds: 1 });
ok(RULES.playerScore(rs('QUICK_BATTLE'), g, 'p1') === 6, 'QuickBattle rules=6');
ok(AM.playerScore(g, 'p1') === 6, 'QuickBattle hardcoded=6');

// Mob Hunter
g = mkGame('MOB_HUNTER', [P('p1')]); Object.assign(g.arenaState.stats.p1, { mobKills: 4, kills: 9, emeralds: 9 });
ok(RULES.playerScore(rs('MOB_HUNTER'), g, 'p1') === 4, 'MobHunter rules=4 (mobKills only)');
ok(AM.playerScore(g, 'p1') === 4, 'MobHunter hardcoded=4');

// Collect Emeralds
g = mkGame('COLLECT_EMERALDS', [P('p1')]); g.arenaState.stats.p1.emeralds = 7;
ok(RULES.playerScore(rs('COLLECT_EMERALDS'), g, 'p1') === 7, 'Emeralds rules=7');
ok(AM.playerScore(g, 'p1') === 7, 'Emeralds hardcoded=7');

// KOTH: hardcoded uses hold frames (round /60); rules use hillSeconds stat.
g = mkGame('KING_OF_HILL', [P('p1')]); g._arenaMode.hold.p1 = 1500; g.arenaState.stats.p1.hillSeconds = 25;
ok(RULES.playerScore(rs('KING_OF_HILL'), g, 'p1') === 25, 'KOTH rules=25s');
ok(AM.playerScore(g, 'p1') === 25, 'KOTH hardcoded=25s (1500f/60)');

// Survival: shared wavesDefeated
g = mkGame('SURVIVAL_WAVES', [P('p1'), P('p2')]); g._arenaMode.wavesCleared = 4;
ok(RULES.playerScore(rs('SURVIVAL_WAVES'), g, 'p1') === 4 && RULES.playerScore(rs('SURVIVAL_WAVES'), g, 'p2') === 4, 'Survival rules=4 shared');
ok(AM.playerScore(g, 'p1') === 4, 'Survival hardcoded=4');

// Deathmatch
g = mkGame('DEATHMATCH', [P('p1')]); Object.assign(g.arenaState.stats.p1, { kills: 3, mobKills: 9 });
ok(RULES.playerScore(rs('DEATHMATCH'), g, 'p1') === 3, 'Deathmatch rules=3 (kills only)');
ok(AM.playerScore(g, 'p1') === 3, 'Deathmatch hardcoded=3');

// Defend the Tower: no points
g = mkGame('DEFEND_TOWER', [P('p1')]); Object.assign(g.arenaState.stats.p1, { kills: 5, towerDamage: 8 });
ok(RULES.playerScore(rs('DEFEND_TOWER'), g, 'p1') === 0, 'Tower rules=0 points');
ok(AM.playerScore(g, 'p1') === 0, 'Tower hardcoded=0 points');

console.log('Team aggregation (summed vs shared):');
g = mkGame('MOB_HUNTER', [P('p1', 0), P('p2', 1), P('p3', 0)]);
g.arenaState.stats.p1.mobKills = 2; g.arenaState.stats.p3.mobKills = 3; g.arenaState.stats.p2.mobKills = 1;
ok(RULES.teamScore(rs('MOB_HUNTER'), g, 0) === 5, 'MobHunter team0 summed=5');
g = mkGame('SURVIVAL_WAVES', [P('p1', 0), P('p3', 0)]); g._arenaMode.wavesCleared = 6;
ok(RULES.teamScore(rs('SURVIVAL_WAVES'), g, 0) === 6, 'Survival team shared=6 (not 12)');
g = mkGame('CAPTURE_FLAG', [P('p1', 0), P('p2', 1), P('p3', 0)]);
g.arenaState.stats.p1.flagCaptures = 2; g.arenaState.stats.p3.flagCaptures = 1;
ok(RULES.teamScore(rs('CAPTURE_FLAG'), g, 0) === 3, 'CTF team0=3 (sum of members)');

console.log('End / win conditions parity:');
// Deathmatch ends at killTarget
g = mkGame('DEATHMATCH', [P('p1'), P('p2')]); g.arenaState.stats.p1.kills = 9;
ok(RULES.isEnded(rs('DEATHMATCH'), g, false) === false, 'Deathmatch not ended at 9');
g.arenaState.stats.p1.kills = 10;
ok(RULES.isEnded(rs('DEATHMATCH'), g, false) === true, 'Deathmatch ends at 10');
ok(RULES.winner(rs('DEATHMATCH'), g) === 'p1', 'Deathmatch winner=p1');

// KOTH never ends early; only on timer (v3 behaviour)
g = mkGame('KING_OF_HILL', [P('p1')]); g.arenaState.stats.p1.hillSeconds = 999;
ok(RULES.isEnded(rs('KING_OF_HILL'), g, false) === false, 'KOTH does not end early');
ok(RULES.isEnded(rs('KING_OF_HILL'), g, true) === true, 'KOTH ends on timer');

// Collect Emeralds ends when all collected (structural)
g = mkGame('COLLECT_EMERALDS', [P('p1')], { });
sandbox.EMERALD_SYSTEM = { allRoundsComplete: () => true };
ok(RULES.isEnded(rs('COLLECT_EMERALDS'), g, false) === true, 'Emeralds end when all collected');
sandbox.EMERALD_SYSTEM = { allRoundsComplete: () => false };
ok(RULES.isEnded(rs('COLLECT_EMERALDS'), g, false) === false, 'Emeralds not ended when incomplete');

// Quick Battle ends when all bots dead
g = mkGame(null, [P('p1')], { mobManager: { mobs: [{ alive: false }] } });
ok(RULES.isEnded(rs('QUICK_BATTLE'), g, false) === true, 'QuickBattle ends when all bots dead');
g = mkGame(null, [P('p1')], { mobManager: { mobs: [{ alive: true }] } });
ok(RULES.isEnded(rs('QUICK_BATTLE'), g, false) === false, 'QuickBattle not ended with bots alive');

// Survival ends on all-players-dead (deathEndsMatch) or survivedAllWaves
g = mkGame('SURVIVAL_WAVES', [P('p1'), P('p2')]); g._players[0].hp = 0; g._players[1].hp = 0;
ok(RULES.isEnded(rs('SURVIVAL_WAVES'), g, false) === true, 'Survival ends when all dead');
g = mkGame('SURVIVAL_WAVES', [P('p1')]); g._arenaMode.wavesCleared = 5; g._arenaMode.totalWaves = 5;
ok(RULES.isEnded(rs('SURVIVAL_WAVES'), g, false) === true, 'Survival ends when all waves cleared');

// CTF ends at captureTarget team captures
g = mkGame('CAPTURE_FLAG', [P('p1', 0), P('p2', 1)]); g.arenaState.stats.p1.flagCaptures = 3;
ok(RULES.isEnded(rs('CAPTURE_FLAG'), g, false) === true, 'CTF ends at 3 team captures');

// Defend the Tower ends when a tower destroyed; winner=destroyer
g = mkGame('DEFEND_TOWER', [P('p1'), P('p2')]);
TOWER.active = true; TOWER._winner = 'p2'; TOWER.towers = [{ ownerId: 'p1', hp: 0, maxHp: 9 }];
g.arenaState.stats.p2.towersDestroyed = 1;
ok(RULES.isEnded(rs('DEFEND_TOWER'), g, false) === true, 'Tower ends on destruction');
ok(RULES.winner(rs('DEFEND_TOWER'), g) === 'p2', 'Tower winner=destroyer p2');
// timeout: most tower HP wins
TOWER._winner = null; TOWER.towers = [{ ownerId: 'p1', hp: 7, maxHp: 9 }, { ownerId: 'p2', hp: 3, maxHp: 9 }];
ok(RULES.winner(rs('DEFEND_TOWER'), g) === 'p1', 'Tower timeout winner = most HP (p1)');

console.log('Win-condition sequencing (stages):');
const stageRs = RULES.normalize({
  elements: { towers: true, ctf: true, hill: true },
  stages: [
    { combinator: 'any', conditions: [{ type: 'towersDestroyed', target: 1 }] },
    { combinator: 'any', conditions: [{ type: 'flagsCaptured', target: 1 }] },
    { combinator: 'any', conditions: [{ type: 'hillSecondsTotal', target: 60 }] },
  ],
});
const sg = mkGame('CUSTOM', [P('p1', 0)]); sg._stageIndex = 0;
ok(RULES.isEnded(stageRs, sg, false) === false && sg._stageIndex === 0, 'stage 0 pending');
sg.arenaState.stats.p1.towersDestroyed = 1;
ok(RULES.isEnded(stageRs, sg, false) === false && sg._stageIndex === 1, 'destroy tower → advance to stage 1');
sg.arenaState.stats.p1.flagCaptures = 1;
ok(RULES.isEnded(stageRs, sg, false) === false && sg._stageIndex === 2, 'capture flag → advance to stage 2');
sg.arenaState.stats.p1.hillSeconds = 60;
ok(RULES.isEnded(stageRs, sg, false) === true, 'hold hill 60s → final stage → match ends');
ok(RULES.stageInfo(stageRs, sg).total === 3, 'stageInfo reports total stages');
// CUSTOM ruleset via rulesetForMode(cfg.customRuleset)
const customCfg = { customRuleset: { elements: { pvp: true }, scoring: { perKill: 2 }, win: { combinator: 'any', conditions: [{ type: 'playerKills', target: 5 }] } } };
const cr = RULES.rulesetForMode('CUSTOM', customCfg);
const cg = mkGame('CUSTOM', [P('p1')]); cg.arenaState.stats.p1.kills = 3;
ok(RULES.playerScore(cr, cg, 'p1') === 6, 'CUSTOM scoring weights apply (3 kills × 2 = 6)');
ok(RULES.isEnded(cr, cg, false) === false, 'CUSTOM win not met at 3 kills');
cg.arenaState.stats.p1.kills = 5;
ok(RULES.isEnded(cr, cg, false) === true, 'CUSTOM win met at 5 kills');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
