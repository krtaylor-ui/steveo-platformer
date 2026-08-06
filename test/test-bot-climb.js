// Bot climb INTEGRATION test — drives the REAL Player physics with the REAL
// BotController actuator, frame by frame, over several vertical-climb geometries.
// Unlike test-bot-ai (which unit-tests decisions), this proves the bot actually
// EXECUTES the double-jump climbs a maze's "two-level" sections need — the class of
// bug Kevin hit repeatedly (reaches an interim platform, then fails the next hop).
//
// Regression coverage for the fixes in build 145+:
//   • launch an up-and-across jump from the TAKE-OFF node (not after walking under
//     the target platform / off the platform edge);
//   • don't re-check head-room mid-flight (it read the target platform's underside as
//     an overhang and released the double-jump late);
//   • when head-blocked on the ground, back up to the clear take-off cell;
//   • full-speed air control so a long diagonal jump covers its horizontal reach;
//   • cap the planning envelope at a RELIABLE double-jump (up 5 / dx 9) so A* routes
//     via interim platforms instead of emitting un-executable mega-leaps;
//   • never treat the follow-band as "arrived" while AIRBORNE (brain OR actuator) —
//     the arc grazing the band mid-jump used to drop the path and the bot fell back.
const fs = require('fs'); const vm = require('vm');
const jsDir = require('path').join(__dirname, '..', 'js');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  FAIL:', msg); } };

const real = {
  window: { addEventListener: () => {} }, navigator: { getGamepads: () => [] },
  document: { activeElement: null }, localStorage: { getItem: () => null, setItem: () => {} },
  Math, console, Set, Map, Array, Object, JSON, Number, String, Boolean, Infinity, isFinite, isNaN,
  Game: { ownerId: (i) => 'p' + (i + 1) },
  ARENA_RULES: { rulesetForMode: () => ({ elements: { pvp: true } }) },
};
const sandbox = new Proxy(real, { has: () => true, get: (t, k) => (k in t ? t[k] : (typeof k === 'symbol' ? undefined : 1)), set: (t, k, v) => { t[k] = v; return true; } });
vm.createContext(sandbox);
const run = (file, expose) => vm.runInContext(fs.readFileSync(`${jsDir}/${file}`, 'utf8') + '\n;' + expose, sandbox, { filename: file });
run('constants.js', 'this.BLOCK_SIZE=BLOCK_SIZE; this.GAME_VERSION=GAME_VERSION;');
run('blocks.js', 'this.BLOCK=BLOCK; this.BLOCK_DATA=BLOCK_DATA;');
run('pathfinding.js', 'this.findMobPath=findMobPath;');
run('input.js', 'this.InputManager=InputManager;');
run('player.js', 'this.Player=Player;');
run('bot-ai.js', 'this.BotController=BotController; this.BOT_AI=BOT_AI;');
run('bot-telemetry.js', 'this.BOT_TELEMETRY=BOT_TELEMETRY;');
const { InputManager, BotController, Player, BLOCK, BLOCK_SIZE } = sandbox;
const B = BLOCK_SIZE;

// Run a companion bot (P2) toward a leader (P1) placed on a goal cell; return whether
// it climbs onto the goal's ROW within `maxFrames` and stays grounded there.
function climbs(rows, botCR, goalCR, maxFrames = 700) {
  const H = rows.length, W = rows[0].length;
  const at = (r, c) => (r < 0 || r >= H || c < 0 || c >= W) ? 'X' : (rows[r][c] || ' ');
  const level = { width: W, height: H, pixelWidth: W * B, pixelHeight: H * B,
    isSolid: (r, c) => at(r, c) === 'X', get: (r, c) => at(r, c) === 'X' ? BLOCK.STONE : BLOCK.AIR };
  const mk = (col, row) => { const p = new Player(col * B, 0); p.x = col * B + (B - p.width) / 2; p.y = (row + 1) * B - p.height;
    p._airJumpEnabled = true; p._ledgeHangEnabled = true; p.onGround = true; p.vy = 0; return p; };
  const leader = mk(goalCR[0], goalCR[1]), bot = mk(botCR[0], botCR[1]);
  const players = [leader, bot];
  const im = new InputManager({ addEventListener: () => {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }), width: 100, height: 100 });
  const game = { level, frameCount: 0, state: 'playing', _respawnTimers: [0, 0, 0, 0], players, mobManager: { mobs: [] },
    getPlayer(i) { return players[i] || null; }, activePlayers() { return players.filter(Boolean); },
    arenaConfig: { arenaGameMode: 'DEATHMATCH' },
    _worldAdvSettings: { airJumpEnabled: true, ledgeHangEnabled: true, companionTeleport: false, companionStuckBehavior: 'none', jumpHeightBlocks: 3 },
    input: im, _notify() {} };
  const ctrl = new BotController(game, 1, 'companion', 'MEDIUM');
  const pin = (idx) => ({ isLeft: () => im.pLeft(idx), isRight: () => im.pRight(idx), isJump: () => im.pJump(idx),
    isCrouch: () => im.pCrouch(idx), isRun: () => false, isAttack: () => im.pAttack(idx), moveX: () => im.pMoveX(idx) });
  const feet = (p) => [Math.floor(p.cx / B), Math.floor((p.y + p.height - 1) / B)];
  for (let f = 0; f < maxFrames; f++) {
    game.frameCount = f; ctrl.tick(); im.updateGamepad(); bot.update(pin(1), level);
    const fc = feet(bot);
    if (bot.onGround && fc[1] <= goalCR[1] && Math.abs(fc[0] - goalCR[0]) <= 2) return true;   // reached goal row, grounded
  }
  return false;
}

console.log('Bot climb execution (real physics + real actuator):');

// 1) A single 4-block climb needs a DOUBLE-JUMP; the bot must launch, double-jump at the
//    apex, and land ON the platform (not stop mid-arc when it grazes the follow-band).
ok(climbs([
  '            ', '            ', '      XXXX  ',   // platform c6-9 → standable r1
  '            ', '            ', '            ', 'XXXXXXXXXXXX', // floor → standable r5 (4 up)
], [1, 5], [7, 1]), 'single 4-up double-jump onto a platform');

// 2) STACKED two-level climb (small offset each hop): interim then upper, each a
//    double-jump. Exercises "reaches interim, must double-jump again" — the exact bug.
ok(climbs([
  '            ', '            ', '    XXX     ',   // upper c4-6 → standable r1
  '            ', '            ', '   XXX      ',   // interim c3-5 → standable r4
  '            ', '            ', 'XXXXXXXXXXXX',    // floor → standable r7
], [9, 7], [5, 1]), 'stacked two-level: two consecutive double-jumps via an interim');

// 3) A wide DIAGONAL two-level climb (interim far to one side): up-AND-across jumps that
//    must cover real horizontal distance at full air speed.
ok(climbs([
  '                ', '                ', '   XX           ', // upper c3-4 → standable r1
  '                ', '                ', '                ',
  '          XX    ',                                          // interim c10-11 → standable r5
  '                ', '                ', '                ', 'XXXXXXXXXXXXXXXX',
], [14, 9], [3, 1]), 'wide diagonal two-level climb (up-and-across hops)');

// 4) A plain 1-block step must still be handled (walk/hop, no regression to flat nav).
ok(climbs([
  '            ', '            ', '       XXXXX',   // raised floor c7-11 → standable r1
  'XXXXXXX     ',                                    // lower floor c0-6 → standable r2
  'XXXXXXXXXXXX',
], [1, 2], [9, 1]), 'a 1-block step up is still climbed');

// Stale-key flush (open-items-after-348): a keydown with no matching keyup must NOT
// survive into the next session. flush() (per frame) keeps held keys on purpose; a new
// session calls clearHeld(), which drops them. Assert the two differ so a regression that
// merges them (and breaks held-key movement, or leaves keys stale) fails loudly.
{
  const im = new InputManager({ addEventListener: () => {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }), width: 100, height: 100 });
  im.keys['KeyD'] = true; im.mouse.down = true;          // a held key with no keyup, e.g. focus lost mid-press
  im.flush();
  ok(im.isDown('KeyD'), 'flush() KEEPS a held key (per-frame; held movement must repeat)');
  im.clearHeld();
  ok(!im.isDown('KeyD'), 'clearHeld() DROPS the held key so it cannot walk the player next run');
  ok(im.mouse.down === false, 'clearHeld() also releases a held mouse button');
}

// Guard: constants.js must parse (the fact this test reached here after run('constants.js')
// already proves it) AND GAME_VERSION must be a non-empty string. A build-note with an
// unescaped apostrophe once terminated the single-quoted string and made the WHOLE app a
// syntax error; tools/bump-build.js now escapes, and this pins that it stays parseable.
{
  const V = sandbox.GAME_VERSION;
  ok(typeof V === 'string' && V.length > 0, 'GAME_VERSION eval\'d to a non-empty string');
  ok(/build \d+/.test(V), 'GAME_VERSION carries a build number');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
