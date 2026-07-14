// Generates SAMPLE Bot AI telemetry (Bot AI brief, Phase 7 deliverable #5):
// several simulated matches PER MODE, so the log file demonstrates that records
// ACCUMULATE (not overwrite) and can be loaded together as one batch. The bot
// BRAINS are the REAL js/bot-ai.js (so the decision traces + goalCounts are
// genuine); match stats/outcomes are synthesized (no browser/physics here) and
// clearly scaled by difficulty so the sample is illustrative.
//
//   node tools/gen-bot-telemetry-samples.js   →   saves/bot-telemetry-samples.json
//
// The output conforms to BOT_TELEMETRY_SCHEMA.md (steveo-bot-telemetry/v1).
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const jsDir = path.join(__dirname, '..', 'js');

const real = {
  window: {}, document: undefined, localStorage: undefined,
  Math, console, Set, Map, Array, Object, JSON, Number, String, Boolean, Infinity, isFinite, Date,
  Game: { ownerId: (i) => 'p' + (i + 1) },
};
const sandbox = new Proxy(real, { has: () => true, get: (t, k) => (k in t ? t[k] : (typeof k === 'symbol' ? undefined : 1)), set: (t, k, v) => { t[k] = v; return true; } });
vm.createContext(sandbox);
const load = (f, expose) => vm.runInContext(fs.readFileSync(`${jsDir}/${f}`, 'utf8') + '\n;' + (expose || ''), sandbox, { filename: f });
load('constants.js', 'this.BLOCK_SIZE=BLOCK_SIZE; this.BOT_DIFFICULTY_PRESETS=BOT_DIFFICULTY_PRESETS;');
load('blocks.js', 'this.BLOCK=BLOCK;');
load('pathfinding.js', 'this.findMobPath=findMobPath;');
load('arena-rules.js', 'this.ARENA_RULES=ARENA_RULES;');
load('arena-modes.js', 'this.ARENA_MODES=ARENA_MODES;');   // real playerScore for outcome.score
load('bot-ai.js', 'this.BOT_AI=BOT_AI; this.BotController=BotController;');
load('bot-telemetry.js', 'this.BOT_TELEMETRY=BOT_TELEMETRY;');
const { BLOCK, BLOCK_SIZE: B, BotController, BOT_TELEMETRY } = sandbox;

// ── tiny world + entity mocks ────────────────────────────────
function mkLevel() {
  const rows = ['                              ', '                              ', '                              ', '##############################'];
  const H = rows.length, W = rows[0].length;
  const at = (r, c) => (r < 0 || r >= H || c < 0 || c >= W) ? '#' : (rows[r][c] || ' ');
  return { width: W, height: H, pixelWidth: W * B, pixelHeight: H * B, isSolid: (r, c) => at(r, c) === '#', get: (r, c) => at(r, c) === '#' ? BLOCK.STONE : BLOCK.AIR };
}
let pid = 0;
function mkPlayer(col, opts = {}) {
  const width = 22, height = 48, x = col * B + 5, y = 3 * B - height;
  return { id: pid++, x, y, width, height, hp: opts.hp ?? 6, maxHp: 6, facing: 1, selectedSlot: 2, bow: 'BOW', drawProgress: 0, teamId: opts.teamId ?? null, _ownerId: opts.owner || null, get cx() { return this.x + this.width / 2; }, get cy() { return this.y + this.height / 2; } };
}
function blankStat() { return { kills: 0, deaths: 0, mobKills: 0, emeralds: 0, hillSeconds: 0, hillStreak: 0, flagCaptures: 0, towerDamage: 0, towersDestroyed: 0 }; }

// A deterministic pseudo-random (no Math.random, so runs are reproducible).
let seed = 20260714;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed & 0xffff) / 0x10000; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));

// Per-mode setup: build a game, wire the needed systems, place bots + an opponent,
// run the real brains for `frames`, synthesize difficulty-scaled stats, return records.
function simMatch(mode, difficulties, matchIndex) {
  const level = mkLevel();
  const teamMode = (mode === 'CAPTURE_FLAG' || mode === 'DEFEND_TOWER');
  // Bots take slots 2..; a human-ish opponent is p1.
  const human = mkPlayer(4, { owner: 'p1', teamId: teamMode ? 1 : null });
  const bots = difficulties.map((d, i) => mkPlayer(8 + i * 3, { owner: 'p' + (i + 2), teamId: teamMode ? 0 : null }));
  const players = [human, ...bots];
  const stats = { p1: blankStat(), p2: blankStat(), p3: blankStat(), p4: blankStat() };
  const game = {
    level, frameCount: 0, state: 'playing', _respawnTimers: [0, 0, 0, 0], players,
    mobManager: { mobs: [] },
    getPlayer(i) { return this.players[i] || null; },
    activePlayers() { return this.players.filter(Boolean); },
    arenaConfig: { arenaGameMode: mode, kothScoring: ['STICKY', 'SOLE', 'ALL'][matchIndex % 3] },
    arenaState: { stats, gameStartTime: 1, endTime: 1 },
    input: { setBotInput() {}, clearBotInput() {} },
  };
  // Mode systems so brains pick the objective goal.
  sandbox.ARENA_MODES._onHill = (g, p) => Math.abs(p.cx - g.level.pixelWidth / 2) < 3 * B;
  if (mode === 'CAPTURE_FLAG') sandbox.CTF_SYSTEM = { flags: [{ team: 0, x: 3 * B, y: 2 * B, carriedBy: null, dropped: false }, { team: 1, x: 27 * B, y: 2 * B, carriedBy: null, dropped: false }], bases: [{ x: 3 * B, y: 2 * B }, { x: 27 * B, y: 2 * B }], isCarrying: () => false };
  else sandbox.CTF_SYSTEM = undefined;
  if (mode === 'DEFEND_TOWER') sandbox.TOWER_SYSTEM = { towers: [{ ownerId: 'p2', x: 6 * B, y: B, w: B, h: 2 * B, maxHp: 9, hp: 9 }, { ownerId: 'p1', x: 26 * B, y: B, w: B, h: 2 * B, maxHp: 9, hp: 9 }] };
  else sandbox.TOWER_SYSTEM = undefined;
  if (mode === 'COLLECT_EMERALDS') sandbox.EMERALD_SYSTEM = { _activeEmeralds: () => [{ wx: 14 * B, wy: 2 * B, collected: false }, { wx: 22 * B, wy: 2 * B, collected: false }] };
  else sandbox.EMERALD_SYSTEM = undefined;
  if (mode === 'MOB_HUNTER' || mode === 'SURVIVAL_WAVES') game.mobManager.mobs = [
    { id: 1, alive: true, hp: 5, x: 12 * B, y: 2 * B, width: 22, height: 48, get cx() { return this.x + 11; }, get cy() { return this.y + 24; } },
    { id: 2, alive: true, hp: 5, x: 18 * B, y: 2 * B, width: 22, height: 48, get cx() { return this.x + 11; }, get cy() { return this.y + 24; } },
  ];

  const ctrls = bots.map((b, i) => new BotController(game, i + 1, teamMode ? 'coop' : 'competitive', difficulties[i]));
  game._botControllers = ctrls;

  // Run the real brains; jiggle the opponent in/out of range so goals vary.
  const frames = 480;
  for (let f = 0; f < frames; f++) {
    game.frameCount = f;
    if (f % 140 === 0) human.x = (human.x > 15 * B ? 6 : 20) * B;   // move opponent → trace variety
    for (const c of ctrls) c.tick();
  }

  // Synthesize difficulty-scaled outcome stats (illustrative; real stats come from
  // actual play in the browser). Harder bots trade up.
  const scale = { EASY: 0.5, MEDIUM: 1.0, HARD: 1.7 };
  ctrls.forEach((c) => {
    const s = stats[c.ownerId]; const k = scale[c.difficultyKey];
    if (mode === 'DEATHMATCH') { s.kills = Math.round(ri(2, 6) * k); s.deaths = Math.round(ri(1, 5) / k); }
    else if (mode === 'KING_OF_HILL') { s.hillSeconds = Math.round(ri(20, 80) * k); s.kills = ri(0, 3); s.deaths = ri(0, 3); }
    else if (mode === 'CAPTURE_FLAG') { s.flagCaptures = Math.round(ri(0, 3) * k); s.kills = ri(0, 4); s.deaths = ri(0, 3); }
    else if (mode === 'DEFEND_TOWER') { s.towerDamage = Math.round(ri(2, 9) * k); s.towersDestroyed = s.towerDamage >= 9 ? 1 : 0; }
    else if (mode === 'COLLECT_EMERALDS') { s.emeralds = Math.round(ri(3, 12) * k); }
    else if (mode === 'MOB_HUNTER' || mode === 'SURVIVAL_WAVES') { s.mobKills = Math.round(ri(4, 14) * k); s.deaths = ri(0, 2); }
  });
  // Winner = highest per-mode score among all owners (bots + the p1 opponent).
  let winnerId = null, bestScore = -Infinity;
  for (const id of ['p1', 'p2', 'p3', 'p4']) {
    if (!game.players.some(p => p._ownerId === id)) continue;
    const sc = sandbox.ARENA_MODES.playerScore(game, id);
    if (sc > bestScore) { bestScore = sc; winnerId = id; }
  }
  const ts = Date.now() - (200 - matchIndex) * 60000;   // spread timestamps so they sort
  return BOT_TELEMETRY.buildRecords(game, { ts, matchId: `${mode}-${matchIndex + 1}`, winnerId, durationSec: 300 });
}

// ── Drive 3 matches per mode, varying difficulty, accumulate ─────
const MODES = ['DEATHMATCH', 'KING_OF_HILL', 'CAPTURE_FLAG', 'DEFEND_TOWER', 'COLLECT_EMERALDS', 'MOB_HUNTER'];
const DIFF_ROTATION = [['EASY', 'MEDIUM'], ['MEDIUM', 'HARD'], ['HARD', 'EASY']];
const accumulated = [];
for (const mode of MODES) {
  for (let m = 0; m < 3; m++) {          // 3 matches per mode → accumulation
    accumulated.push(...simMatch(mode, DIFF_ROTATION[m], m));
  }
}

const batch = BOT_TELEMETRY.exportBatch(accumulated);
const outPath = path.join(__dirname, '..', 'saves', 'bot-telemetry-samples.json');
fs.writeFileSync(outPath, JSON.stringify(batch, null, 2));

console.log(`Wrote ${outPath}`);
console.log(`  matches (bot-records): ${batch.matchCount}  (${MODES.length} modes × 3 matches × 2 bots)`);
console.log(`  schema: ${batch.schema}   dataDictionary: ${batch.dataDictionary}`);
console.log('\nSummary (BOT_TELEMETRY.summarize — per mode × difficulty):');
for (const row of BOT_TELEMETRY.summarize(accumulated)) {
  console.log(`  ${row.mode.padEnd(16)} ${String(row.difficulty).padEnd(7)} matches=${row.matches} winRate=${row.winRate} avgScore=${row.avgScore} avgK=${row.avgKills} avgD=${row.avgDeaths}`);
}
// sanity: prove accumulation (many records share modes) + batch-loadability (re-parse)
const reparsed = JSON.parse(fs.readFileSync(outPath, 'utf8'));
if (reparsed.matches.length !== batch.matchCount) { console.error('FAIL: batch did not round-trip'); process.exit(1); }
console.log(`\nRound-trip OK: re-loaded ${reparsed.matches.length} records as one batch.`);
