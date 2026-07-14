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
  ARENA_RULES: { rulesetForMode: () => ({ elements: { pvp: true } }) },
};
const sandbox = new Proxy(real, {
  has: () => true,
  get: (t, k) => (k in t ? t[k] : (typeof k === 'symbol' ? undefined : 1)),
  set: (t, k, v) => { t[k] = v; return true; },
});
vm.createContext(sandbox);
const run = (file, expose) => vm.runInContext(fs.readFileSync(`${jsDir}/${file}`, 'utf8') + '\n;' + expose, sandbox, { filename: file });

run('constants.js', 'this.BLOCK_SIZE=BLOCK_SIZE; this.BOT_DIFFICULTY_PRESETS=BOT_DIFFICULTY_PRESETS; this.BOT_DEFAULT_DIFFICULTY=BOT_DEFAULT_DIFFICULTY; this.BOT_THREAT_WEIGHTS=BOT_THREAT_WEIGHTS; this.BOT_THREAT_RECENT_FRAMES=BOT_THREAT_RECENT_FRAMES; this.BOT_MELEE_RANGE_BLOCKS=BOT_MELEE_RANGE_BLOCKS; this.BOT_ARCHER_RANGE_BLOCKS=BOT_ARCHER_RANGE_BLOCKS; this.BOT_OBJECTIVE_REACH_BLOCKS=BOT_OBJECTIVE_REACH_BLOCKS; this.GP_DEADZONE_STICK=GP_DEADZONE_STICK;');
run('blocks.js', 'this.BLOCK=BLOCK;');
run('pathfinding.js', 'this.findMobPath=findMobPath; this.navStandable=navStandable;');
run('input.js', 'this.InputManager=InputManager;');
run('bot-ai.js', 'this.BOT_AI=BOT_AI; this.BotController=BotController;');

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
  const dispatch = (elements) => { sandbox.ARENA_RULES = { rulesetForMode: () => ({ elements }) }; ctrl._think(); return ctrl.goal.kind; };
  ok(dispatch({ pvp: true }).startsWith('engage') || dispatch({ pvp: true }) === 'hunt', 'pvp elements → kills strategy');
  sandbox.EMERALD_SYSTEM = { _activeEmeralds: () => [{ wx: 8 * B, wy: 2 * B, collected: false }] };
  ok(dispatch({ emeralds: true }) === 'emerald', 'emeralds element → emerald strategy');
  sandbox.EMERALD_SYSTEM = undefined;
  ok(dispatch({ waves: true }) === 'idle' || dispatch({ waves: true }) === 'mob', 'waves element → wave strategy (mob or idle when none)');
  // restore default mock
  sandbox.ARENA_RULES = { rulesetForMode: () => ({ elements: { pvp: true } }) };
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
