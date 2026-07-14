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
function mkGame(level, players) {
  const bots = [null, null, null, null];
  return {
    level, frameCount: 0, state: 'playing',
    _respawnTimers: [0, 0, 0, 0],
    players,
    getPlayer(i) { return this.players[i] || null; },
    activePlayers() { return this.players.filter(Boolean); },
    arenaConfig: { arenaGameMode: 'DEATHMATCH' },
    input: { setBotInput: (i, o) => { bots[i] = o; }, clearBotInput: (i) => { bots[i] = null; }, _bots: bots },
  };
}

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
