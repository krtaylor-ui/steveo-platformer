// Headless tests for Bot AI (Bot AI brief).
// Phase 1 — the foundation:
//   • InputManager synthetic-input seam (setBotInput → pXxx(i) read the bot's
//     virtual input; clearBotInput restores the hardware path).
//   • BOT_AI.navFollow / buildNav / cellOf helpers.
//   • BotController brain + actuator against a mock game: highest-threat blend
//     target pick, engage-vs-hunt-vs-idle goals, movement + aim actuation,
//     dead→neutral, and pathfinder routing around a wall.
// Loads the REAL constants.js / blocks.js / pathfinding.js / input.js / bot-ai.js
// (vm sandbox, same pattern as test-detection.js), with Game + ARENA_RULES mocked.
const fs = require('fs');
const vm = require('vm');
const jsDir = require('path').join(__dirname, '..', 'js');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  FAIL:', msg); } };

const real = {
  window: { addEventListener: () => {} },
  navigator: { getGamepads: () => [] },
  document: { activeElement: null },
  localStorage: { getItem: () => null, setItem: () => {} },
  Math, console, Set, Map, Array, Object, JSON, Number, String, Boolean, Infinity, isFinite,
  // Mocked engine singletons the bot references:
  Game: { ownerId: (i) => 'p' + (i + 1) },
  // Mode-aware, using the REAL Arena Rules Engine element keys (ctf/towers/
  // waveSpawns/bots/spawnEggs/hill/emeralds/pvp) so the dispatch test matches
  // production behaviour (Phase 6 verifies against the real arena-rules.js too).
  ARENA_RULES: { rulesetForMode: (mode) => ({ elements: ({
    CAPTURE_FLAG: { ctf: true, pvp: true }, DEFEND_TOWER: { towers: true, pvp: true },
    COLLECT_EMERALDS: { emeralds: true, bots: true }, SURVIVAL_WAVES: { waveSpawns: true },
    MOB_HUNTER: { bots: true, spawnEggs: true }, KING_OF_HILL: { hill: true, pvp: true },
    DEATHMATCH: { pvp: true },
  })[mode] || { pvp: true } }) },
};
const sandbox = new Proxy(real, {
  has: () => true,
  get: (t, k) => (k in t ? t[k] : (typeof k === 'symbol' ? undefined : 1)),
  set: (t, k, v) => { t[k] = v; return true; },
});
vm.createContext(sandbox);
const run = (file, expose) => vm.runInContext(fs.readFileSync(`${jsDir}/${file}`, 'utf8') + '\n;' + expose, sandbox, { filename: file });

run('constants.js', 'this.BLOCK_SIZE=BLOCK_SIZE; this.BOT_DIFFICULTY_PRESETS=BOT_DIFFICULTY_PRESETS; this.BOT_DEFAULT_DIFFICULTY=BOT_DEFAULT_DIFFICULTY; this.BOT_THREAT_WEIGHTS=BOT_THREAT_WEIGHTS; this.BOT_THREAT_RECENT_FRAMES=BOT_THREAT_RECENT_FRAMES; this.BOT_MELEE_RANGE_BLOCKS=BOT_MELEE_RANGE_BLOCKS; this.BOT_ARCHER_RANGE_BLOCKS=BOT_ARCHER_RANGE_BLOCKS; this.BOT_OBJECTIVE_REACH_BLOCKS=BOT_OBJECTIVE_REACH_BLOCKS; this.BOT_FOLLOW_NEAR=BOT_FOLLOW_NEAR; this.BOT_FOLLOW_FAR=BOT_FOLLOW_FAR; this.BOT_COMPANION_LOOT_DELAY=BOT_COMPANION_LOOT_DELAY; this.GP_DEADZONE_STICK=GP_DEADZONE_STICK;');
run('blocks.js', 'this.BLOCK=BLOCK; this.BLOCK_DATA=BLOCK_DATA;');
run('pathfinding.js', 'this.findMobPath=findMobPath; this.navStandable=navStandable; this.navDropTo=navDropTo; this.NAV_MAX_JUMP_UP=NAV_MAX_JUMP_UP; this.NAV_MAX_JUMP_DX=NAV_MAX_JUMP_DX;');
run('input.js', 'this.InputManager=InputManager;');
run('bot-ai.js', 'this.BOT_AI=BOT_AI; this.BotController=BotController;');
run('bot-telemetry.js', 'this.BOT_TELEMETRY=BOT_TELEMETRY;');

const { InputManager, BOT_AI, BotController, BLOCK, BLOCK_SIZE, BOT_DIFFICULTY_PRESETS } = sandbox;
const B = BLOCK_SIZE;

// ── 1. InputManager synthetic-input seam ─────────────────────
console.log('InputManager synthetic input:');
{
  const canvas = { addEventListener: () => {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }), width: 100, height: 100 };
  const im = new InputManager(canvas);
  ok(im.isBot(2) === false, 'slot starts as a human (no override)');
  im.setBotInput(2, { moveX: 0.8, jump: true, crouch: false, attack: true, aimX: 1, aimY: 0, gpSlot: 0, buttons: { place: true } });
  ok(im.isBot(2) === true, 'setBotInput marks the slot as a bot');
  ok(im.pRight(2) === true && im.pLeft(2) === false, 'pRight/pLeft reflect synthetic moveX');
  ok(Math.abs(im.pMoveX(2) - 0.8) < 1e-9, 'pMoveX returns synthetic moveX (no sensitivity scaling)');
  ok(im.pJump(2) === true, 'pJump reflects synthetic jump');
  ok(im.pAttack(2) === true, 'pAttack reflects synthetic attack (held)');
  ok(im.pGpSlot(2) >= 0, 'pGpSlot >= 0 so the free-aim combat branch is used');
  ok(im.pGp(2).aimX === 1 && im.pGp(2).aimY === 0, 'pGp returns the synthetic aim vector');
  // Just-down edge detection: needs a prev snapshot (updateGamepad) then a fresh press.
  im.updateGamepad();                                   // snapshots buttons (place=true) as prev
  im.setBotInput(2, { moveX: 0, buttons: { place: true } }); // still held → NOT just-down
  ok(im.pJustDown(2, 'place') === false, 'held button is not just-down after snapshot');
  im.updateGamepad();                                   // prev = {place:true}
  im.setBotInput(2, { moveX: 0, buttons: { place: false, context: true } });
  ok(im.pJustDown(2, 'context') === true, 'newly-pressed button IS just-down');
  im.clearBotInput(2);
  ok(im.isBot(2) === false, 'clearBotInput hands the slot back to hardware');
}

// ── nav + game mock helpers ─────────────────────────────────
function mkLevel(rows) {
  const H = rows.length, W = Math.max(...rows.map(r => r.length));
  const at = (r, c) => (r < 0 || r >= H || c < 0 || c >= W) ? '#' : (rows[r][c] || ' ');
  return {
    width: W, height: H,
    isSolid: (r, c) => at(r, c) === '#',
    get: (r, c) => at(r, c) === '#' ? BLOCK.STONE : BLOCK.AIR,
  };
}
let _pid = 0;
function mkPlayer(col, row, opts = {}) {
  // Feet at (row) standing on solid (row+1): x so cx at col centre; y so feet at row bottom.
  const width = 22, height = 48;
  const x = col * B + (B - width) / 2;
  const y = (row + 1) * B - height;   // bottom of body at bottom of `row`
  return {
    id: _pid++, x, y, width, height,
    hp: opts.hp ?? 6, maxHp: opts.maxHp ?? 6,
    onGround: opts.onGround ?? true, vy: opts.vy ?? 0,   // grounded by default (planner runs on ground)
    facing: 1, selectedSlot: 2, bow: opts.bow ?? 'BOW', drawProgress: opts.drawProgress ?? 0,
    teamId: opts.teamId ?? null, _ownerId: opts.owner || null,
    get cx() { return this.x + this.width / 2; },
    get cy() { return this.y + this.height / 2; },
  };
}
function mkGame(level, players, extra = {}) {
  const bots = [null, null, null, null];
  return Object.assign({
    level, frameCount: 0, state: 'playing',
    _respawnTimers: [0, 0, 0, 0],
    players,
    mobManager: { mobs: [] },
    getPlayer(i) { return this.players[i] || null; },
    activePlayers() { return this.players.filter(Boolean); },
    arenaConfig: { arenaGameMode: 'DEATHMATCH' },
    input: { setBotInput: (i, o) => { bots[i] = o; }, clearBotInput: (i) => { bots[i] = null; }, _bots: bots },
  }, extra);
}
// pixelWidth/Height helpers for the hill-less KOTH fallback.
function withPixels(level) { level.pixelWidth = level.width * B; level.pixelHeight = level.height * B; return level; }

// ── 2. navFollow / cellOf ────────────────────────────────────
console.log('BOT_AI.navFollow + cellOf:');
{
  const level = mkLevel(['          ', '          ', '##########']);
  const nav = BOT_AI.buildNav(level);
  const actor = mkPlayer(1, 1);
  const cell = BOT_AI.cellOf(actor);
  ok(cell[0] === 1 && cell[1] === 1, `cellOf feet cell = (1,1), got (${cell})`);
  const path = [[1, 1], [2, 1], [3, 1], [4, 1]];
  const step = BOT_AI.navFollow(actor, path, nav);
  ok(step.dir === 1, 'navFollow steers right toward the next cell');
  ok(step.jump === false, 'no jump needed on flat ground');
  // Rising step ahead (target cell one row above, adjacent) → jump. Flat nav is
  // fine here — the rise branch doesn't consult nav (only the gap branch does).
  const a2 = mkPlayer(2, 2);
  const step2 = BOT_AI.navFollow(a2, [[2, 2], [3, 1]], nav);
  ok(step2.dir === 1, 'steers toward the raised cell');
  ok(step2.jump === true, 'jumps for a rise ahead');
}

// ── 3. threat blend target pick ──────────────────────────────
console.log('Highest-threat blend target selection:');
{
  const level = mkLevel(['                              ', '                              ', '##############################']);
  // (a) Same HP, different distance → the proximity term makes the NEARER win.
  {
    const bot = mkPlayer(5, 1, { owner: 'p2' });
    const near = mkPlayer(8, 1, { owner: 'p1', hp: 6, maxHp: 6 });
    const far  = mkPlayer(20, 1, { owner: 'p3', hp: 6, maxHp: 6 });
    const ctrl = new BotController(mkGame(level, [near, bot, far]), 1, 'competitive', 'MEDIUM');
    ok(ctrl._pickThreatTarget() === near, 'same HP → nearer target wins (proximity term)');
  }
  // (b) Same distance, different HP → the low-HP term makes the WOUNDED one win.
  {
    const bot = mkPlayer(5, 1, { owner: 'p2' });
    const full = mkPlayer(9, 1, { owner: 'p1', hp: 6, maxHp: 6 });
    const hurt = mkPlayer(1, 1, { owner: 'p3', hp: 1, maxHp: 6 }); // |1-5|==|9-5|==4 blocks
    const ctrl = new BotController(mkGame(level, [full, bot, hurt]), 1, 'competitive', 'MEDIUM');
    ok(ctrl._pickThreatTarget() === hurt, 'same distance → wounded (low-HP) target wins (finish-kill bias)');
  }
  // (c) Out of range → no target picked (drives the hunt fallback).
  {
    const bot = mkPlayer(5, 1, { owner: 'p2' });
    const away = mkPlayer(50, 1, { owner: 'p1' }); // > MEDIUM detectRange (22)
    const ctrl = new BotController(mkGame(level, [away, bot]), 1, 'competitive', 'MEDIUM');
    ok(ctrl._pickThreatTarget() == null, 'target beyond detect range is not picked');
  }
}

// ── 4. goal selection: engage / hunt / idle ─────────────────
console.log('Goal selection (engage / hunt / idle):');
{
  const level = mkLevel(['                              ', '                              ', '##############################']);
  const bot = mkPlayer(5, 1, { owner: 'p2' });
  const opp = mkPlayer(9, 1, { owner: 'p1' });          // within MEDIUM detectRange (22)
  const game = mkGame(level, [opp, bot]);
  const ctrl = new BotController(game, 1, 'competitive', 'MEDIUM');
  ctrl._think();
  ok(ctrl.goal.kind === 'engage', `in-range opponent → engage (got ${ctrl.goal.kind})`);
  ok(ctrl.goal.targetRef === opp, 'engage goal targets the opponent');
  // Move the opponent out of detect range but still present → hunt.
  opp.x = 60 * B;
  ctrl._think();
  ok(ctrl.goal.kind === 'hunt', `out-of-range opponent → hunt (got ${ctrl.goal.kind})`);
  // Opponent dead → idle.
  opp.hp = 0;
  ctrl._think();
  ok(ctrl.goal.kind === 'idle', `no live opponents → idle (got ${ctrl.goal.kind})`);
}

// ── 5. actuation: movement + aim written to synthetic input ──
console.log('Actuation writes synthetic input toward the target:');
{
  const level = mkLevel(['                              ', '                              ', '##############################']);
  const bot = mkPlayer(5, 1, { owner: 'p2' });
  const opp = mkPlayer(16, 1, { owner: 'p1' });         // far but within range → engage+approach
  const game = mkGame(level, [opp, bot]);
  const ctrl = new BotController(game, 1, 'competitive', 'HARD'); // HARD = tiny aim error, alwaysRun
  // Run several frames so reaction delay elapses and a path is built.
  for (let f = 0; f < 20; f++) { game.frameCount = f; ctrl.tick(); }
  const inp = game.input._bots[1];
  ok(inp != null, 'bot wrote a synthetic input object for its slot');
  ok(inp.moveX > 0.1, `bot moves right toward the opponent (moveX=${inp.moveX && inp.moveX.toFixed(2)})`);
  ok(inp.aimX > 0.7, 'bot aims toward the opponent (to the right)');
  ok(Math.abs(inp.aimY) < 0.4, 'aim is roughly level (opponent at same height)');
}

// ── 6. dead bot → neutral no-op input ───────────────────────
console.log('Dead / respawning bot → neutral input:');
{
  const level = mkLevel(['          ', '          ', '##########']);
  const bot = mkPlayer(3, 1, { owner: 'p2', hp: 0 });
  const opp = mkPlayer(6, 1, { owner: 'p1' });
  const game = mkGame(level, [opp, bot]);
  const ctrl = new BotController(game, 1, 'competitive', 'MEDIUM');
  ctrl.tick();
  const inp = game.input._bots[1];
  ok(inp.moveX === 0 && inp.attack === false && inp.jump === false, 'dead bot issues no movement/attack');
}

// ── 7. pathfinder routing around a wall (goal executor) ─────
console.log('Goal executor paths around a wall:');
{
  //           (headroom rows on top so cells stay standable) — opp beyond the
  //           archer's ~9-block hold range so the bot actually paths to it.
  const level = mkLevel([
    '                        ',
    '                        ',
    '                        ',
    '          #             ',   // a 1-tall wall at col10 between bot and opp
    '########################',
  ]);
  const bot = mkPlayer(1, 3, { owner: 'p2' });
  const opp = mkPlayer(18, 3, { owner: 'p1' });
  const game = mkGame(level, [opp, bot]);
  const ctrl = new BotController(game, 1, 'competitive', 'HARD');
  for (let f = 0; f < 15; f++) { game.frameCount = f; ctrl.tick(); }
  ok(ctrl._path != null, 'a route to the opponent was found around/over the wall');
  const inp = game.input._bots[1];
  ok(inp.moveX > 0.1, 'bot advances toward the opponent along the route');
}

// ════════════════════════════════════════════════════════════
// Phase 2 — ruleset-element strategies
// ════════════════════════════════════════════════════════════
const flatLevel = () => withPixels(mkLevel(['                              ', '                              ', '                              ', '##############################']));

// ── HILL (KOTH) — approach / hold / SOLE displacement ───────
console.log('Phase 2 — Hill (KOTH):');
{
  const level = flatLevel();
  // Hill zone spans cols 12..17 (pixels).
  const hill = { x: 12 * B, y: 2 * B, w: 6 * B, h: 1 * B };
  sandbox.ARENA_MODES = { _onHill: (game, p) => { const h = game._arenaHill; return !!h && p.cx >= h.x && p.cx <= h.x + h.w; } };
  // (a) Off the hill → approach it.
  {
    const bot = mkPlayer(3, 2, { owner: 'p2' });
    const game = mkGame(level, [mkPlayer(25, 2, { owner: 'p1' }), bot], { _arenaHill: hill, arenaConfig: { arenaGameMode: 'KING_OF_HILL', kothScoring: 'SOLE' } });
    const ctrl = new BotController(game, 1, 'competitive', 'MEDIUM');
    const g = ctrl._goalHill({ hill: true });
    ok(g.kind === 'hill-approach', `off hill → approach (got ${g.kind})`);
    ok(g.approach === 'reach' && g.cell[0] >= 12 && g.cell[0] <= 18, 'approach targets the hill cell (reach)');
  }
  // (b) On the hill, SOLE, an enemy also on it → displace that enemy.
  {
    const bot = mkPlayer(14, 2, { owner: 'p2' });          // on the hill
    const enemyOn = mkPlayer(16, 2, { owner: 'p1' });      // also on the hill
    const game = mkGame(level, [enemyOn, bot], { _arenaHill: hill, arenaConfig: { arenaGameMode: 'KING_OF_HILL', kothScoring: 'SOLE' } });
    const ctrl = new BotController(game, 1, 'competitive', 'MEDIUM');
    const g = ctrl._goalHill({ hill: true });
    ok(g.kind === 'hill-hold' && g.targetRef === enemyOn, 'SOLE + contested → hold & displace the occupant');
    ok(g.reason.indexOf('displac') >= 0, 'reason notes displacement');
  }
  // (c) On the hill, ALL, alone → just be present (hold, no forced target).
  {
    const bot = mkPlayer(14, 2, { owner: 'p2' });
    const game = mkGame(level, [mkPlayer(28, 2, { owner: 'p1' }), bot], { _arenaHill: hill, arenaConfig: { arenaGameMode: 'KING_OF_HILL', kothScoring: 'ALL' } });
    const ctrl = new BotController(game, 1, 'competitive', 'MEDIUM');
    const g = ctrl._goalHill({ hill: true });
    ok(g.kind === 'hill-hold' && g.approach === 'reach', 'ALL + alone → hold present on the hill');
  }
  sandbox.ARENA_MODES = undefined;
}

// ── FLAGS (CTF) — grab / capture / defend ───────────────────
console.log('Phase 2 — Flags (CTF):');
{
  const level = flatLevel();
  const bot = mkPlayer(5, 2, { owner: 'p2', teamId: 0 });
  const opp = mkPlayer(25, 2, { owner: 'p1', teamId: 1 });
  const flags = [
    { team: 0, x: 3 * B, y: 2 * B, homeX: 3 * B, homeY: 2 * B, carriedBy: null, dropped: false },
    { team: 1, x: 27 * B, y: 2 * B, homeX: 27 * B, homeY: 2 * B, carriedBy: null, dropped: false },
  ];
  const bases = [{ x: 3 * B, y: 2 * B }, { x: 27 * B, y: 2 * B }];
  sandbox.CTF_SYSTEM = { flags, bases, isCarrying: (p) => flags.some(f => f.carriedBy === p) };
  const game = mkGame(level, [opp, bot], { arenaConfig: { arenaGameMode: 'CAPTURE_FLAG' } });
  const ctrl = new BotController(game, 1, 'competitive', 'MEDIUM');
  // (a) Enemy flag free → go grab it (team 1's flag at col 27).
  let g = ctrl._goalFlags({ flags: true });
  ok(g.kind === 'flag-grab' && g.cell[0] === 27, `enemy flag free → grab (got ${g.kind} @${g.cell && g.cell[0]})`);
  // (b) Carrying the enemy flag → capture at own base (col 3).
  flags[1].carriedBy = bot;
  g = ctrl._goalFlags({ flags: true });
  ok(g.kind === 'flag-capture' && g.cell[0] === 3, 'carrying → run to own base to capture');
  // (c) A teammate already carries the enemy flag (offense covered) AND an enemy
  //     stole our flag → don't duplicate; chase the carrier to recover ours.
  const mate = mkPlayer(20, 2, { owner: 'p3', teamId: 0 });
  game.players.push(mate);                 // team 0 teammate
  flags[1].carriedBy = mate;               // teammate has the enemy flag (not free)
  flags[0].carriedBy = opp;                // enemy carrying OUR flag
  g = ctrl._goalFlags({ flags: true });
  ok(g.kind === 'flag-defend' && g.targetRef === opp, 'teammate has enemy flag + ours stolen → chase the carrier');
  sandbox.CTF_SYSTEM = undefined;
}

// ── TOWER (Defend the Tower) — attack / defend ──────────────
console.log('Phase 2 — Tower:');
{
  const level = flatLevel();
  const bot = mkPlayer(5, 2, { owner: 'p2' });
  const opp = mkPlayer(25, 2, { owner: 'p1' });
  const towers = [
    { ownerId: 'p2', x: 4 * B, y: 1 * B, w: B, h: 2 * B, maxHp: 9, hp: 9 },   // mine
    { ownerId: 'p1', x: 26 * B, y: 1 * B, w: B, h: 2 * B, maxHp: 9, hp: 9 },  // enemy
  ];
  sandbox.TOWER_SYSTEM = { towers };
  const game = mkGame(level, [opp, bot], { arenaConfig: { arenaGameMode: 'DEFEND_TOWER' } });
  const ctrl = new BotController(game, 1, 'competitive', 'MEDIUM');
  // (a) Attack the nearest enemy tower.
  let g = ctrl._goalTower({ tower: true });
  ok(g.kind === 'tower-attack' && Math.abs(g.targetRef.cx - (26 * B + B / 2)) < 1, 'attacks the enemy tower (aim at its centre)');
  ok(g.targetRef.hp === 9, 'tower target carries hp (combat can damage it)');
  // (b) My tower badly hurt + an enemy near it → defend.
  towers[0].hp = 2;                         // <= maxHp/3
  opp.x = (5) * B;                          // move opponent next to my tower (col ~4)
  g = ctrl._goalTower({ tower: true });
  ok(g.kind === 'tower-defend' && g.targetRef === opp, 'own tower low + enemy near → defend');
  sandbox.TOWER_SYSTEM = undefined;
}

// ── EMERALDS ────────────────────────────────────────────────
console.log('Phase 2 — Emeralds:');
{
  const level = flatLevel();
  const bot = mkPlayer(5, 2, { owner: 'p2' });
  const ems = [{ wx: 20 * B, wy: 2 * B, collected: false }, { wx: 8 * B, wy: 2 * B, collected: false }];
  sandbox.EMERALD_SYSTEM = { _activeEmeralds: () => ems };
  const game = mkGame(level, [mkPlayer(1, 2, { owner: 'p1' }), bot], { arenaConfig: { arenaGameMode: 'COLLECT_EMERALDS' } });
  const ctrl = new BotController(game, 1, 'competitive', 'MEDIUM');
  const g = ctrl._goalEmeralds({ emeralds: true });
  ok(g.kind === 'emerald' && g.cell[0] === 8, `heads to the NEAREST emerald (col 8, got ${g.cell && g.cell[0]})`);
  sandbox.EMERALD_SYSTEM = undefined;
}

// ── WAVES / MOBS ────────────────────────────────────────────
console.log('Phase 2 — Waves / Mob Hunter:');
{
  const level = flatLevel();
  const bot = mkPlayer(5, 2, { owner: 'p2' });
  const mob = { id: 7, alive: true, hp: 5, x: 10 * B, y: 2 * B, width: 22, height: 48, get cx() { return this.x + 11; }, get cy() { return this.y + 24; } };
  const game = mkGame(level, [mkPlayer(1, 2, { owner: 'p1' }), bot], { arenaConfig: { arenaGameMode: 'MOB_HUNTER' }, mobManager: { mobs: [mob] } });
  const ctrl = new BotController(game, 1, 'competitive', 'MEDIUM');
  const g = ctrl._goalWaves({ waves: true });
  ok(g.kind === 'mob' && g.targetRef === mob, 'engages the nearest live mob');
  ok(g.action === 'combat', 'mob goal is a combat goal');
}

// ── _think dispatch picks the right strategy per elements ───
console.log('Phase 2 — _think element dispatch:');
{
  const level = flatLevel();
  const bot = mkPlayer(5, 2, { owner: 'p2' });
  const game = mkGame(level, [mkPlayer(9, 2, { owner: 'p1' }), bot]);
  const ctrl = new BotController(game, 1, 'competitive', 'MEDIUM');
  const savedRules = sandbox.ARENA_RULES;
  const dispatch = (elements) => { sandbox.ARENA_RULES = { rulesetForMode: () => ({ elements }) }; ctrl._think(); return ctrl.goal.kind; };
  ok(dispatch({ pvp: true }).startsWith('engage') || dispatch({ pvp: true }) === 'hunt', 'pvp elements → kills strategy');
  sandbox.EMERALD_SYSTEM = { _activeEmeralds: () => [{ wx: 8 * B, wy: 2 * B, collected: false }] };
  ok(dispatch({ emeralds: true }) === 'emerald', 'emeralds element → emerald strategy');
  sandbox.EMERALD_SYSTEM = undefined;
  ok(dispatch({ waveSpawns: true }) === 'idle', 'waveSpawns element, no mobs → idle (guarded)');
  sandbox.ARENA_RULES = savedRules;   // restore the mode-aware mock for Phase 3
}

// ════════════════════════════════════════════════════════════
// Phase 3 — co-op team coordination (complementary roles)
// ════════════════════════════════════════════════════════════
// Build a game with two team-0 bots + an enemy, wire game._botControllers so the
// bots can read each other's live goals.
function mkCoop(level, extra, botCols) {
  const enemy = mkPlayer(28, 2, { owner: 'p1', teamId: 1 });
  const a = mkPlayer(botCols[0], 2, { owner: 'p2', teamId: 0 });
  const b = mkPlayer(botCols[1], 2, { owner: 'p3', teamId: 0 });
  const game = mkGame(level, [enemy, a, b], extra);
  const ca = new BotController(game, 1, 'coop', 'MEDIUM');
  const cb = new BotController(game, 2, 'coop', 'MEDIUM');
  game._botControllers = [ca, cb];
  return { game, ca, cb, a, b, enemy };
}

console.log('Phase 3 — CTF split (grab vs defend):');
{
  const level = flatLevel();
  const flags = [
    { team: 0, x: 3 * B, y: 2 * B, homeX: 3 * B, homeY: 2 * B, carriedBy: null, dropped: false },
    { team: 1, x: 10 * B, y: 2 * B, homeX: 10 * B, homeY: 2 * B, carriedBy: null, dropped: false },
  ];
  sandbox.CTF_SYSTEM = { flags, bases: [{ x: 3 * B, y: 2 * B }, { x: 27 * B, y: 2 * B }], isCarrying: (p) => flags.some(f => f.carriedBy === p) };
  // Bot A at col 8 (closer to the enemy flag at col 10), Bot B at col 5 (farther).
  const { ca, cb } = mkCoop(level, { arenaConfig: { arenaGameMode: 'CAPTURE_FLAG' } }, [8, 5]);
  ca._think(); cb._think();
  ok(ca.goal.kind === 'flag-grab', `closer bot goes for the flag (got ${ca.goal.kind})`);
  ok(cb.goal.kind === 'flag-escort', `farther bot takes the complementary defend role (got ${cb.goal.kind})`);
  sandbox.CTF_SYSTEM = undefined;
}

console.log('Phase 3 — Tower split (attack vs defend):');
{
  const level = flatLevel();
  const towers = [
    { ownerId: 'p2', x: 4 * B, y: 1 * B, w: B, h: 2 * B, maxHp: 9, hp: 9 },   // team-0 (ours)
    { ownerId: 'p1', x: 26 * B, y: 1 * B, w: B, h: 2 * B, maxHp: 9, hp: 9 },  // enemy
  ];
  sandbox.TOWER_SYSTEM = { towers };
  const { ca, cb } = mkCoop(level, { arenaConfig: { arenaGameMode: 'DEFEND_TOWER' } }, [10, 6]);
  ca._think(); cb._think();
  ok(ca.goal.kind === 'tower-attack', `first bot attacks the enemy tower (got ${ca.goal.kind})`);
  ok(cb.goal.kind === 'tower-defend', `second bot defends our tower (got ${cb.goal.kind})`);
  sandbox.TOWER_SYSTEM = undefined;
}

console.log('Phase 3 — Emerald split (different clusters):');
{
  const level = flatLevel();
  const ems = [{ wx: 12 * B, wy: 2 * B, collected: false }, { wx: 24 * B, wy: 2 * B, collected: false }];
  sandbox.EMERALD_SYSTEM = { _activeEmeralds: () => ems };
  // Both bots near col 9/10 → both nearest to the col-12 gem; coop splits them.
  const { ca, cb } = mkCoop(level, { arenaConfig: { arenaGameMode: 'COLLECT_EMERALDS' } }, [9, 10]);
  ca._think(); cb._think();
  ok(ca.goal.cell[0] === 12, 'first bot takes the nearest emerald');
  ok(cb.goal.cell[0] === 24, 'second bot takes the OTHER emerald (no dogpile)');
  sandbox.EMERALD_SYSTEM = undefined;
}

console.log('Phase 3 — Mob split (different mobs):');
{
  const level = flatLevel();
  const mk = (id, col) => ({ id, alive: true, hp: 5, x: col * B, y: 2 * B, width: 22, height: 48, get cx() { return this.x + 11; }, get cy() { return this.y + 24; } });
  const m1 = mk(1, 12), m2 = mk(2, 15);
  const { ca, cb } = mkCoop(level, { arenaConfig: { arenaGameMode: 'SURVIVAL_WAVES' }, mobManager: { mobs: [m1, m2] } }, [9, 10]);
  ca._think(); cb._think();
  ok(ca.goal.targetRef === m1, 'first bot takes the nearest mob');
  ok(cb.goal.targetRef === m2, 'second bot takes a different mob (no dogpile)');
}

console.log('Phase 3 — FFA (no team) → no coordination:');
{
  const level = flatLevel();
  const ems = [{ wx: 12 * B, wy: 2 * B, collected: false }, { wx: 24 * B, wy: 2 * B, collected: false }];
  sandbox.EMERALD_SYSTEM = { _activeEmeralds: () => ems };
  // Two FFA bots (teamId null) both go for the nearest gem — coordination is off.
  const a = mkPlayer(9, 2, { owner: 'p2' }), b = mkPlayer(10, 2, { owner: 'p3' });
  const game = mkGame(level, [mkPlayer(1, 2, { owner: 'p1' }), a, b], { arenaConfig: { arenaGameMode: 'COLLECT_EMERALDS' } });
  const ca = new BotController(game, 1, 'competitive', 'MEDIUM'), cb = new BotController(game, 2, 'competitive', 'MEDIUM');
  game._botControllers = [ca, cb];
  ca._think(); cb._think();
  ok(ca.goal.cell[0] === 12 && cb.goal.cell[0] === 12, 'FFA bots both chase the nearest gem (no complementary split)');
  sandbox.EMERALD_SYSTEM = undefined;
}

// ════════════════════════════════════════════════════════════
// Phase 4 — companion bot (friendly follower)
// ════════════════════════════════════════════════════════════
console.log('Phase 4 — Companion follow-band + mob targeting:');
{
  const level = flatLevel();
  const leader = mkPlayer(5, 2, { owner: 'p1' });        // human P1
  const comp = mkPlayer(6, 2, { owner: 'p2' });          // companion P2 (no bow → melee)
  comp.bow = null;
  const game = mkGame(level, [leader, comp], { gameMode: 'platformer', mobManager: { mobs: [] } });
  const ctrl = new BotController(game, 1, 'companion', 'MEDIUM');
  // (a) Close to the leader, no mobs → stays near (idle), does not chase P1.
  let g = ctrl._thinkCompanion();
  ok(g.kind === 'companion-idle', `near leader, no mob → idle (got ${g.kind})`);
  ok(g.targetRef == null, 'companion never targets the player');
  // (b) Leader runs far away → catch up.
  leader.x = 40 * B;
  g = ctrl._thinkCompanion();
  ok(g.kind === 'companion-follow', 'leader far → follow/catch up');
  ok(g.reachBlocks === sandbox.BOT_FOLLOW_NEAR || g.reachBlocks > 0, 'follow stops within the near band');
  // (c) A hostile mob appears in range → fight the MOB (not the player).
  leader.x = 6 * B;                                       // leader back close
  const mob = { id: 3, alive: true, hp: 5, x: 9 * B, y: 2 * B, width: 22, height: 48, get cx() { return this.x + 11; }, get cy() { return this.y + 24; } };
  game.mobManager.mobs = [mob];
  g = ctrl._thinkCompanion();
  ok(g.kind === 'companion-fight' && g.targetRef === mob, 'mob in range → fight the mob');
}

console.log('Phase 4 — Companion loot priority (time-delay + player-first):');
{
  const level = flatLevel();
  const leader = mkPlayer(5, 2, { owner: 'p1' });
  const comp = mkPlayer(10, 2, { owner: 'p2' });
  const game = mkGame(level, [leader, comp]);
  // Item at col 10 (right at the companion, player far at col 5).
  const item = { wx: 10 * B, wy: 2 * B, collected: false };
  ok(BOT_AI.companionShouldGrab(game, comp, item, 5) === false, 'not eligible before the delay elapses');
  ok(BOT_AI.companionShouldGrab(game, comp, item, sandbox.BOT_COMPANION_LOOT_DELAY + 1) === true, 'eligible after the delay when the companion is closer');
  // Player standing on the item → player is closer → NOT eligible (player first pick).
  leader.x = 10 * B;
  ok(BOT_AI.companionShouldGrab(game, comp, item, 9999) === false, 'player closer/heading for it → companion defers');
}

// ════════════════════════════════════════════════════════════
// Phase 5 — difficulty tuning (real wired params differentiate tiers)
// ════════════════════════════════════════════════════════════
console.log('Phase 5 — difficulty presets are real + monotonic:');
{
  const E = BOT_DIFFICULTY_PRESETS.EASY, M = BOT_DIFFICULTY_PRESETS.MEDIUM, H = BOT_DIFFICULTY_PRESETS.HARD;
  ok(E.brainTick > M.brainTick && M.brainTick > H.brainTick, 'harder = faster decisions (smaller brainTick)');
  ok(E.reactionFrames > M.reactionFrames && M.reactionFrames > H.reactionFrames, 'harder = quicker reaction');
  ok(E.detectRange < M.detectRange && M.detectRange < H.detectRange, 'harder = larger detection range');
  ok(E.navPrecision < M.navPrecision && M.navPrecision < H.navPrecision, 'harder = tighter navigation');
  ok(E.aimError > M.aimError && M.aimError > H.aimError, 'harder = smaller aim error');
  ok(E.aggression < M.aggression && M.aggression < H.aggression, 'harder = more aggressive');
}
console.log('Phase 5 — detectRange actually gates who a bot engages:');
{
  const level = flatLevel();
  // Opponent 15 blocks away: outside EASY range (12), inside MEDIUM (22) / HARD (40).
  const mkOne = (diff) => { const bot = mkPlayer(5, 2, { owner: 'p2' }); return new BotController(mkGame(level, [mkPlayer(20, 2, { owner: 'p1' }), bot]), 1, 'competitive', diff); };
  ok(mkOne('EASY')._pickThreatTarget() == null, 'EASY (detect 12) cannot see the 15-block opponent → hunts');
  ok(mkOne('MEDIUM')._pickThreatTarget() != null, 'MEDIUM (detect 22) sees + engages it');
  ok(mkOne('HARD')._pickThreatTarget() != null, 'HARD (detect 40) sees + engages it');
}
console.log('Phase 5 — aim error: HARD lands closer to the true angle than EASY:');
{
  const level = flatLevel();
  const trueAngle = 0; // opponent directly to the right
  const measure = (diff) => {
    const bot = mkPlayer(5, 2, { owner: 'p2' });
    const opp = mkPlayer(11, 2, { owner: 'p1' });
    const game = mkGame(level, [opp, bot]);
    const ctrl = new BotController(game, 1, 'competitive', diff);
    let sum = 0, n = 0;
    for (let f = 0; f < 400; f++) {
      game.frameCount = f; ctrl._acquireFrame = -9999; // skip reaction gate
      ctrl.goal = { targetId: 'p1', targetRef: opp, action: 'combat' };
      ctrl._combat(opp);
      const ang = Math.atan2(ctrl._input.aimY, ctrl._input.aimX);
      sum += Math.abs(ang - trueAngle); n++;
    }
    return sum / n;
  };
  const eErr = measure('EASY'), hErr = measure('HARD');
  ok(hErr < eErr, `HARD mean aim error (${hErr.toFixed(3)}) < EASY (${eErr.toFixed(3)})`);
}

// ════════════════════════════════════════════════════════════
// Phase 6 — Custom Rules (verify against the REAL arena-rules.js)
// ════════════════════════════════════════════════════════════
// Load the actual Arena Rules Engine and confirm the bot's dispatch keys match
// the engine's element keys — for every preset AND for custom rulesets.
run('arena-rules.js', 'this.ARENA_RULES=ARENA_RULES;');
const REAL_RULES = sandbox.ARENA_RULES;   // now the real engine (replaces the mock)

console.log('Phase 6 — bot dispatch keys match the REAL preset elements:');
{
  const need = {
    CAPTURE_FLAG: 'ctf', DEFEND_TOWER: 'towers', KING_OF_HILL: 'hill',
    COLLECT_EMERALDS: 'emeralds', SURVIVAL_WAVES: 'waveSpawns', DEATHMATCH: 'pvp',
  };
  for (const [mode, key] of Object.entries(need)) {
    const el = REAL_RULES.rulesetForMode(mode, {}).elements;
    ok(el && el[key] === true, `${mode} ruleset has elements.${key} (the key the bot dispatches on)`);
  }
  const mh = REAL_RULES.rulesetForMode('MOB_HUNTER', {}).elements;
  ok(mh && (mh.bots || mh.spawnEggs || mh.waveSpawns), 'MOB_HUNTER exposes a mob-source element (bots/spawnEggs)');
}

console.log('Phase 6 — custom rulesets route to the right strategy:');
{
  const level = flatLevel();
  // Helper: build a game whose REAL CUSTOM elements come from a customRuleset, with
  // the needed systems present, and return the bot's chosen goal kind.
  const customKind = (elements, systems) => {
    const bot = mkPlayer(5, 2, { owner: 'p2', teamId: 0 });
    const opp = mkPlayer(9, 2, { owner: 'p1', teamId: 1 });
    const game = mkGame(level, [opp, bot], { arenaConfig: { arenaGameMode: 'CUSTOM', customRuleset: { elements }, kothScoring: 'STICKY' } });
    Object.assign(sandbox, systems || {});
    const ctrl = new BotController(game, 1, 'competitive', 'MEDIUM');
    ctrl._think();
    // cleanup mocked systems
    for (const k of Object.keys(systems || {})) sandbox[k] = undefined;
    return ctrl.goal.kind;
  };
  // Custom: hill only → hill strategy.
  sandbox.ARENA_MODES = { _onHill: () => false };
  ok(customKind({ hill: true }, {}).startsWith('hill'), 'custom {hill} → hill strategy');
  sandbox.ARENA_MODES = undefined;
  // Custom: ctf → flag strategy.
  const flags = [{ team: 0, x: 3 * B, y: 2 * B, carriedBy: null, dropped: false }, { team: 1, x: 27 * B, y: 2 * B, carriedBy: null, dropped: false }];
  ok(customKind({ ctf: true, pvp: true }, { CTF_SYSTEM: { flags, bases: [{ x: 3 * B, y: 2 * B }, { x: 27 * B, y: 2 * B }], isCarrying: () => false } }).startsWith('flag'), 'custom {ctf} → flag strategy');
  // Custom: towers → tower strategy.
  const towers = [{ ownerId: 'p2', x: 4 * B, y: B, w: B, h: 2 * B, maxHp: 9, hp: 9 }, { ownerId: 'p1', x: 26 * B, y: B, w: B, h: 2 * B, maxHp: 9, hp: 9 }];
  ok(customKind({ towers: true }, { TOWER_SYSTEM: { towers } }).startsWith('tower'), 'custom {towers} → tower strategy');
  // Custom: emeralds + pvp → emeralds take priority when gems exist.
  ok(customKind({ emeralds: true, pvp: true }, { EMERALD_SYSTEM: { _activeEmeralds: () => [{ wx: 8 * B, wy: 2 * B, collected: false }] } }) === 'emerald', 'custom {emeralds,pvp} with gems → emerald');
  // Custom: pvp only → kills.
  ok(['engage', 'hunt'].includes(customKind({ pvp: true }, {})), 'custom {pvp} → kills');
}
sandbox.ARENA_RULES = REAL_RULES;   // keep the real engine for any later blocks

// ════════════════════════════════════════════════════════════
// Phase 7 — telemetry (records, trace collapse, batch, summarize)
// ════════════════════════════════════════════════════════════
console.log('Phase 7 — telemetry records + batch + summarize:');
{
  const BOT_TELEMETRY = sandbox.BOT_TELEMETRY;
  const level = flatLevel();
  const bot = mkPlayer(5, 2, { owner: 'p2' });
  const opp = mkPlayer(9, 2, { owner: 'p1' });
  const game = mkGame(level, [opp, bot], { arenaConfig: { arenaGameMode: 'DEATHMATCH' } });
  game.arenaState = { stats: { p1: {}, p2: { kills: 5, deaths: 2, mobKills: 1 } }, gameStartTime: 1, endTime: 1 };
  const ctrl = new BotController(game, 1, 'competitive', 'HARD');
  game._botControllers = [ctrl];
  for (let f = 0; f < 60; f++) { game.frameCount = f; ctrl._think(); }  // populate a trace
  const recs = BOT_TELEMETRY.buildRecords(game, { ts: 1000, matchId: 'test-1', winnerId: 'p2', durationSec: 120 });
  ok(recs.length === 1, 'one record per bot');
  const r = recs[0];
  ok(r.schema === 'steveo-bot-telemetry/v1', 'record carries the schema id');
  ok(r.mode === 'DEATHMATCH' && r.bot.difficulty === 'HARD' && r.bot.slot === 2, 'record has mode + difficulty + slot');
  ok(r.outcome.result === 'win', 'winner resolves to a win');
  ok(r.stats.kills === 5 && r.stats.deaths === 2, 'objective stats copied from arenaState');
  ok(Array.isArray(r.decisionTrace) && r.decisionTrace.length >= 1, 'decision trace present');
  ok(r.decisionTrace.every(run => run.toFrame >= run.fromFrame && run.samples >= 1), 'trace runs are well-formed (collapsed)');
  ok(typeof r.goalCounts === 'object' && Object.keys(r.goalCounts).length >= 1, 'goalCounts present');
  // Trace collapse: many identical consecutive decisions → few runs.
  ok(r.decisionTrace.length < 40, `consecutive identical decisions collapsed (${r.decisionTrace.length} runs from 60 ticks)`);
  // Batch + summarize over an accumulated set.
  const batch = BOT_TELEMETRY.exportBatch(recs.concat(recs));
  ok(batch.schema === 'steveo-bot-telemetry/v1' && batch.matchCount === 2 && batch.dataDictionary === 'BOT_TELEMETRY_SCHEMA.md', 'exportBatch wraps records + points to the data dictionary');
  const sum = BOT_TELEMETRY.summarize(recs.concat(recs));
  ok(sum.length === 1 && sum[0].mode === 'DEATHMATCH' && sum[0].difficulty === 'HARD' && sum[0].matches === 2 && sum[0].winRate === 1, 'summarize aggregates per mode×difficulty');
}

// ════════════════════════════════════════════════════════════
// Wayfinding hardening — overhang / stuck handling (companion trap fix)
// ════════════════════════════════════════════════════════════
console.log('Wayfinding fix — actuator does not jump into a ceiling:');
{
  const nav = BOT_AI.buildNav(mkLevel(['      ', '  #   ', '      ', '      ', '######']));
  const actor = mkPlayer(2, 3);                       // feet row3, head row2 clear, cell above head (row1 col2) solid
  const step = BOT_AI.navFollow(actor, [[2, 3], [3, 1]], nav);  // path wants to rise
  ok(step.jump === false, 'no jump when a ceiling sits directly above the head (no wasted bonk)');
  ok(step.dir === 1, 'still steers horizontally to get out from under the canopy');
  const navOpen = BOT_AI.buildNav(mkLevel(['      ', '      ', '      ', '      ', '######']));
  ok(BOT_AI.navFollow(actor, [[2, 3], [3, 1]], navOpen).jump === true, 'DOES jump for the same rise when headroom is clear');
}
console.log('Wayfinding fix — stuck bot triggers a back-up-and-jump escape:');
{
  const level = mkLevel(['     ', '     ', '#####']);
  const bot = mkPlayer(2, 1, { owner: 'p2' });
  const game = mkGame(level, [mkPlayer(1, 1, { owner: 'p1' }), bot]);
  const ctrl = new BotController(game, 1, 'competitive', 'HARD');   // navPrecision 1 → stuck limit 18
  let escapeMove = null;
  for (let f = 0; f < 30; f++) {
    game.frameCount = f;
    const wasEscaping = ctrl._escapeTimer > 0;       // escape override applies during the call
    ctrl._input.moveX = 0; ctrl._input.jump = false;
    ctrl._applyMove({ dir: 1, jump: false });        // "always trying right" but cx never moves → wedged
    if (wasEscaping && escapeMove === null) escapeMove = { moveX: ctrl._input.moveX, jump: ctrl._input.jump };
  }
  ok(escapeMove !== null, 'a wedged bot enters an escape maneuver (not endless vibration)');
  ok(escapeMove.moveX < 0 && escapeMove.jump === true, 'escape backs up (reverse dir) AND jumps to clear the obstacle');
}
console.log('Vertical jump — straight up beside a platform (not into it):');
{
  const level = flatLevel();
  const bot = mkPlayer(5, 2, { owner: 'p2' });
  const game = mkGame(level, [mkPlayer(9, 2, { owner: 'p1' }), bot]);
  const ctrl = new BotController(game, 1, 'competitive', 'HARD');
  // Target ~directly above (tx ≈ current column), rise 3 → vertical jump.
  bot.onGround = true;
  ctrl._applyMove({ dir: 1, jump: true, rise: 3, tx: bot.cx + 3, tr: 0 });
  ok(Math.abs(ctrl._input.moveX) < 0.01 && ctrl._input.jump === true, 'takeoff launches STRAIGHT UP (no horizontal into the platform)');
  bot.onGround = false;
  ctrl._applyMove({ dir: 1, jump: false, rise: 3, tx: bot.cx + 3, tr: 0 });
  ok(Math.abs(ctrl._input.moveX) < 0.01, 'rises straight beside the platform (no drift into it)');
  // Offset target → takeoff carries horizontal to cover ground.
  bot.onGround = true;
  ctrl._applyMove({ dir: 1, jump: true, rise: 2, tx: bot.cx + 5 * B, tr: 0 });
  ok(ctrl._input.moveX > 0.3, 'offset target → takeoff moves horizontally to cover the distance');
}

console.log('Air control — two-phase (rise beside a ledge, then land on the column):');
{
  const level = flatLevel();
  const bot = mkPlayer(5, 2, { owner: 'p2', onGround: false });   // airborne, feet row 2
  const game = mkGame(level, [mkPlayer(9, 2, { owner: 'p1' }), bot]);
  const ctrl = new BotController(game, 1, 'competitive', 'HARD');
  // Landing ABOVE + OFFSET (tr=0, tx 5 blocks right) → drift toward it to cover ground.
  ctrl._applyMove({ dir: 1, jump: false, rise: 5, tx: bot.cx + 5 * B, tr: 0 });
  ok(ctrl._input.moveX > 0.25, 'below an OFFSET ledge → drifts toward it (covers horizontal during the arc)');
  // At the landing row (tr=2) and far → traverse toward the column.
  ctrl._applyMove({ dir: 1, jump: false, rise: 0, tx: bot.cx + 5 * B, tr: 2 });
  ok(ctrl._input.moveX > 0.3, 'at the landing row → traverse toward the column');
  // Over the column → ease to 0 (land on it, no overshoot).
  ctrl._applyMove({ dir: 1, jump: false, rise: 0, tx: bot.cx + 1, tr: 2 });
  ok(Math.abs(ctrl._input.moveX) < 0.01, 'over the column → eases to 0 (drops on, not past)');
}

console.log('Airborne jump-intent — keeps wanting to jump toward a higher node:');
{
  const level = withPixels(mkLevel(['          ', '          ', '          ', '          ', '          ', '          ', '##########']));
  const bot = mkPlayer(5, 5, { owner: 'p2' });          // feet row5 (floor row6)
  const game = mkGame(level, [mkPlayer(9, 5, { owner: 'p1' }), bot]);
  const ctrl = new BotController(game, 1, 'competitive', 'HARD');
  const nav = BOT_AI.buildNav(level);
  ctrl._path = [[5, 5], [5, 1]]; ctrl._pathIdx = 1;     // node 4 blocks up
  bot.onGround = false;                                 // airborne, below the node
  const step = ctrl._followStep(nav);
  ok(step.jump === true, 'airborne below a higher node → still wants to jump (so double-jump / ledge-grab can fire)');
  ok(step.rise >= 3, `rise reflects the climb needed (got ${step.rise})`);
}

console.log('Node-by-node — advances only after LANDING on a node (no fly-past):');
{
  const level = flatLevel();
  const bot = mkPlayer(8, 2, { owner: 'p2' });          // sitting over node [8,2]
  const game = mkGame(level, [mkPlayer(20, 2, { owner: 'p1' }), bot]);
  const ctrl = new BotController(game, 1, 'competitive', 'HARD');
  const nav = BOT_AI.buildNav(level);
  ctrl._path = [[3, 2], [8, 2], [12, 2]]; ctrl._pathIdx = 1;
  bot.onGround = false;                                 // airborne over the node
  ctrl._followStep(nav);
  ok(ctrl._pathIdx === 1, 'airborne over a node → does NOT advance (must land on it first)');
  bot.onGround = true;                                  // landed
  ctrl._followStep(nav);
  ok(ctrl._pathIdx === 2, 'landed on the node → advances to the next');
}

console.log('Ledge-hang — bot pulses jump to climb up (not stuck hanging):');
{
  const level = flatLevel();
  const bot = mkPlayer(5, 2, { owner: 'p2' });
  bot._hangState = 'hang';                              // grabbed a ledge
  const game = mkGame(level, [mkPlayer(9, 2, { owner: 'p1' }), bot], { gameMode: 'platformer' });
  const ctrl = new BotController(game, 1, 'companion', 'MEDIUM');
  const jumps = new Set();
  for (let f = 0; f < 4; f++) { game.frameCount = f; ctrl.tick(); jumps.add(game.input._bots[1].jump); }
  ok(jumps.has(true) && jumps.has(false), 'jump PULSES (release+press) to make a climb-up edge — not held forever');
  ok(game.input._bots[1].crouch === false, 'never presses crouch while hanging (would drop off)');
}

console.log('Wayfinding fix — repeated fruitless escapes stop pacing (re-decide):');
{
  const level = mkLevel(['     ', '     ', '#####']);
  const bot = mkPlayer(2, 1, { owner: 'p2' });
  const game = mkGame(level, [mkPlayer(1, 1, { owner: 'p1' }), bot]);
  const ctrl = new BotController(game, 1, 'competitive', 'HARD');
  let reDecided = false;
  for (let f = 0; f < 200; f++) {
    game.frameCount = f;
    ctrl._input.moveX = 0; ctrl._input.jump = false;
    ctrl._applyMove({ dir: 1, jump: false });        // wedged forever (cx never moves)
    if (ctrl._path === null && ctrl._brainTimer === 0) reDecided = true;
  }
  ok(reDecided, 'after BOT_ESCAPE_MAX fruitless escapes the bot drops the goal to re-decide (no endless pacing)');
}
console.log('Wayfinding fix — companion warps to the leader when it cannot reach:');
{
  const level = flatLevel();
  const leader = mkPlayer(25, 2, { owner: 'p1' });     // far ahead
  const comp = mkPlayer(2, 2, { owner: 'p2' });        // 23 blocks behind (> WARP_DIST 22)
  const game = mkGame(level, [leader, comp], { gameMode: 'platformer' });
  const ctrl = new BotController(game, 1, 'companion', 'MEDIUM');
  const beforeX = comp.x;
  ctrl.tick();
  ok(comp.x !== beforeX, 'companion is repositioned (warped) toward the far leader');
  ok(Math.hypot(leader.cx - comp.cx, leader.cy - comp.cy) / B <= 4, 'companion ends up beside the leader');
  // Teleport World Setting OFF → no warp (nav must handle it).
  const comp2 = mkPlayer(2, 2, { owner: 'p2' });
  const game2 = mkGame(level, [mkPlayer(25, 2, { owner: 'p1' }), comp2], { gameMode: 'platformer', _worldAdvSettings: { companionTeleport: false, companionStuckBehavior: 'none' } });
  const ctrl2 = new BotController(game2, 1, 'companion', 'MEDIUM');
  const bx2 = comp2.x; ctrl2.tick();
  ok(comp2.x === bx2, 'companionTeleport:false disables the warp (for nav stress-testing)');
  // Direct (Euclidean) distance: a leader far ABOVE (vertical) also triggers teleport.
  const compV = mkPlayer(5, 40, { owner: 'p2' });
  const leadV = mkPlayer(5, 40, { owner: 'p1' }); leadV.y = 2 * B;   // ~38 blocks straight up
  const gameV = mkGame(level, [leadV, compV], { gameMode: 'platformer', _worldAdvSettings: { companionTeleport: true, companionTeleportRange: 18 } });
  const ctrlV = new BotController(gameV, 1, 'companion', 'MEDIUM');
  const byV = compV.y; ctrlV.tick();
  ok(compV.y !== byV, 'vertical distance beyond range triggers teleport (direct distance, not horizontal-only)');
}

console.log('Teleport ON — stuck-fallback warps even when straight-line-close (maze case):');
{
  const level = flatLevel();
  const leader = mkPlayer(12, 2, { owner: 'p1' });      // 10 blocks away: under the 18-block range → no distance warp
  const comp = mkPlayer(2, 2, { owner: 'p2' });
  const game = mkGame(level, [leader, comp], { gameMode: 'platformer', _worldAdvSettings: { companionTeleport: true } });
  const ctrl = new BotController(game, 1, 'companion', 'MEDIUM');
  const bx = comp.x;
  for (let f = 0; f < 5; f++) { ctrl._companionAssist(); }
  ok(comp.x === bx, 'does NOT warp early while straight-line-close (within range)');
  for (let f = 0; f < 200; f++) { ctrl._companionAssist(); }  // never closes → long stall
  ok(comp.x !== bx, 'stuck-fallback warps after a long stall even with Teleport ON (no permanent trap)');
}

console.log('Companion stuck behaviors (Teleport OFF):');
{
  const level = flatLevel();
  const mk = (beh, leaderCol) => {
    const leader = mkPlayer(leaderCol == null ? 25 : leaderCol, 2, { owner: 'p1' });
    const comp = mkPlayer(2, 2, { owner: 'p2' });
    const game = mkGame(level, [leader, comp], { gameMode: 'platformer', _worldAdvSettings: { companionTeleport: false, companionStuckBehavior: beh } });
    return { ctrl: new BotController(game, 1, 'companion', 'MEDIUM'), comp, leader };
  };
  // 'none' → shows the ! mark, never warps (stress-test).
  { const { ctrl, comp } = mk('none'); const bx = comp.x; for (let f = 0; f < 200; f++) ctrl._companionAssist(); ok(comp._stuckMark === true, 'none: shows the ! mark when stuck'); ok(comp.x === bx, 'none: never warps'); }
  // 'teleport' → after the stuck delay, warps.
  { const { ctrl, comp } = mk('teleport'); const bx = comp.x; for (let f = 0; f < 200; f++) ctrl._companionAssist(); ok(comp.x !== bx, 'teleport: warps after the stuck delay'); }
  // 'follow' → latches stuck while far; engages mirror once the player comes near.
  { const { ctrl, comp, leader } = mk('follow');
    for (let f = 0; f < 80; f++) ctrl._companionAssist();
    ok(comp._stuckMark === true && (ctrl._mirrorTimer || 0) === 0, 'follow: shows ! and waits (not mirroring) while the player is far');
    leader.x = 6 * B;                                   // player comes near (4 blocks: within mirror range, not yet reunited)
    ctrl._companionAssist();
    ok(ctrl._mirrorTimer > 0, 'follow: mirrors once the player is near');
  }
}

console.log('Warp stays on the leader\'s level (no cave-drop below):');
{
  // Leader on a platform (row 3) with a cave floor far below (row 12). The warp must
  // land the bot beside the leader (row ~3), never drop into the cave.
  const rows = [];
  for (let r = 0; r < 13; r++) rows.push(' '.repeat(20));
  rows[4] = '####      ##########';   // leader's platform (cols 0-3 and 10-19) at row4 (feet row3)
  rows[12] = '#'.repeat(20);          // cave floor far below
  const level = withPixels(mkLevel(rows));
  const leader = mkPlayer(1, 3, { owner: 'p1' });       // on the platform (feet row3, floor row4)
  const comp = mkPlayer(15, 3, { owner: 'p2' });
  const game = mkGame(level, [leader, comp], { gameMode: 'platformer', _worldAdvSettings: { companionTeleport: true, companionTeleportRange: 5 } });
  const ctrl = new BotController(game, 1, 'companion', 'MEDIUM');
  ctrl.tick();   // far (14 blocks) → warp
  const compRow = Math.floor((comp.y + comp.height - 1) / B);
  ok(compRow <= 4, `warp lands beside the leader (row ${compRow}), NOT in the cave below (row 11)`);
}

console.log('Wayfinding — jump envelope reflects enabled moves + double-jump pulse:');
{
  const level = flatLevel();
  const bot = mkPlayer(5, 2, { owner: 'p2' });
  const game = mkGame(level, [mkPlayer(6, 2, { owner: 'p1' }), bot]);
  const ctrl = new BotController(game, 1, 'competitive', 'MEDIUM');
  game._worldAdvSettings = {};
  const base = ctrl._jumpEnvelope();
  ok(base.maxUp === 3, `default envelope = 3-block jump (got ${base.maxUp})`);
  game._worldAdvSettings = { airJumpEnabled: true };
  ok(ctrl._jumpEnvelope().maxUp === 5, 'double jump raises reachable height to a reliable 5 (single 3 + air-jump 2)');
  // Ledge-hang is an EXECUTION aid, not a planning extension: it must NOT raise maxUp
  // (folding it in let A* emit taller "shortcut" leaps the bot couldn't land — it would
  // skip an interim platform, then head-bonk the upper ledge on the way up). It widens
  // horizontal REACH (airtime) only.
  game._worldAdvSettings = { ledgeHangEnabled: true };
  ok(ctrl._jumpEnvelope().maxUp === 3, 'ledge hang does NOT raise jump height (execution aid, not planning)');
  game._worldAdvSettings = { airJumpEnabled: true, ledgeHangEnabled: true };
  ok(ctrl._jumpEnvelope().maxUp === 5, 'double-jump height stays a reliable 5 with ledge-hang on');
  // Double-jump pulse on a tall rise: ground press → hold → release near apex → press.
  game._worldAdvSettings = { airJumpEnabled: true }; ctrl._jumpEnvelope();   // _envUp = 3
  const P = ctrl.player; P._airJumpEnabled = true; P._airJumpsUsed = 0;
  P.onGround = true; P.vy = 0;
  ok(ctrl._jumpControl(true, 5) === true, 'ground: presses jump');
  P.onGround = false; P.vy = -10;
  ok(ctrl._jumpControl(true, 5) === true, 'airborne rising fast: holds (still climbing, well below apex)');
  P.vy = -3;
  ok(ctrl._jumpControl(true, 5) === true, 'still below the apex (vy -3): keeps holding, does NOT fire early');
  P.vy = -1;                                             // essentially at the apex
  ok(ctrl._jumpControl(true, 5) === false, 'AT the apex: releases to arm the air-jump edge');
  ok(ctrl._jumpControl(true, 5) === true, 'next frame: presses again → air-jump fires at the top');
  // Locked total-rise: the LIVE remaining rise shrinks as we climb; the double-jump
  // must still fire (else it flips off mid-ascent and re-fires late while falling).
  ctrl._jArmed = false; ctrl._jumpRise = undefined;
  P.onGround = true; ctrl._jumpControl(true, 5);         // take off: lock total rise = 5
  P.onGround = false; P._airJumpsUsed = 0; P.vy = -1;    // apex; live remaining rise now only 2
  ctrl._jumpControl(true, 2);                            // arm (release)
  ok(ctrl._jumpControl(true, 2) === true, 'shrunk live rise (2) STILL double-jumps — total (5) locked at take-off');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
