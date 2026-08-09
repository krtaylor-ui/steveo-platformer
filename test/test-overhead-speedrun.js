// Overhead SPEED RUN (Phase 2) — run timer + finish-enable + best-time leaderboard.
//   node test/test-overhead-speedrun.js
// Covers: the leaderboard module (format / qualify / add / levelId), and the overhead engine's timer
// (starts on movement, ticks, stops at finish) + finish-enable for speedrunner mode + record-on-win.
global.window = global;
global.CANVAS_W = 800; global.CANVAS_H = 500; global.GAME_VERSION = 'v3 build 423 (sr test)';

// In-memory localStorage stub (the leaderboard persists here).
const _ls = {}; global.localStorage = { getItem: (k) => (k in _ls ? _ls[k] : null), setItem: (k, v) => { _ls[k] = String(v); }, removeItem: (k) => { delete _ls[k]; } };

const path = require('path');
// Load the speedrunner leaderboard as globals (the overhead engine references them by bare name).
const SR = require(path.join(__dirname, '..', 'js', 'speedrunner-mode.js'));
global.SpeedRunnerLeaderboard = SR.SpeedRunnerLeaderboard; global.SPEEDRUN_SYNC = SR.SPEEDRUN_SYNC;
global.srFormatTime = SR.srFormatTime; global.srUsername = SR.srUsername; global.srGetSavedInitials = SR.srGetSavedInitials;

function stubCtx() { return new Proxy({ filter: 'none', globalAlpha: 1, globalCompositeOperation: 'source-over', canvas: { width: 800, height: 500 } }, { get(t, k) { if (k === 'measureText') return () => ({ width: 80 }); if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} }); if (k === 'getContext') return () => stubCtx(); if (k in t) return t[k]; return (typeof k === 'string') ? (() => {}) : undefined; }, set(t, k, v) { t[k] = v; return true; } }); }
const cls = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
function mkEl() { return { style: {}, classList: cls, appendChild() {}, addEventListener() {}, getContext: () => stubCtx(), getBoundingClientRect: () => ({ width: 800, height: 500, left: 0, top: 0 }), width: 800, height: 500 }; }
global.document = { getElementById: () => mkEl(), head: { appendChild() {} }, createElement: () => mkEl(), body: { appendChild() {}, classList: cls }, addEventListener() {} };
global.window.addEventListener = () => {}; global.window.dispatchEvent = () => {}; global.Event = function () {};
global.InputManager = function () { this.flush = () => {}; this.isJustDown = () => false; this.isDown = () => false; this.mouse = { x: 0, y: 0, clicked: false, down: false, rightClicked: false, moveVec: { x: 0, y: 0 } }; this.gamepads = []; };
global.requestAnimationFrame = () => 0;
['palette', 'grid', 'buildings', 'movement', 'controls', 'combat', 'weapons', 'elevation', 'settings', 'daynight', 'redstone', 'templates', 'launch', 'game']
  .forEach((m) => require(path.join(__dirname, '..', 'js', 'overhead', 'overhead-' + m + '.js')));
const OverheadGame = global.OverheadGame, OH_SETTINGS = global.OH_SETTINGS;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

console.log('Speed Run — leaderboard module:');
{
  ok(SR.srFormatTime(0) === '0:00.00', 'format 0ms -> 0:00.00');
  ok(SR.srFormatTime(65230) === '1:05.23', 'format 65230ms -> 1:05.23');
  const lid = 'Kevin:Maze';
  ok(SR.SpeedRunnerLeaderboard.qualifies(lid, 9999) === true, 'any time qualifies on an empty board');
  SR.SpeedRunnerLeaderboard.add(lid, 'KEV', 9000);
  SR.SpeedRunnerLeaderboard.add(lid, 'KEV', 7000);
  const lb = SR.SpeedRunnerLeaderboard.get(lid);
  ok(lb.length === 2 && lb[0].ms === 7000, 'board sorts best-first');
  // fill to 5 then a slower time no longer qualifies
  SR.SpeedRunnerLeaderboard.add(lid, 'AAA', 8000); SR.SpeedRunnerLeaderboard.add(lid, 'BBB', 8500); SR.SpeedRunnerLeaderboard.add(lid, 'CCC', 8800);
  ok(SR.SpeedRunnerLeaderboard.qualifies(lid, 12000) === false, 'a slow time does not qualify once the board is full (5)');
  ok(SR.SpeedRunnerLeaderboard.qualifies(lid, 6000) === true, 'a faster-than-worst time qualifies');
}

function mk(mode, over) {
  const W = 16, H = 12, ground = [], elevation = [];
  for (let r = 0; r < H; r++) { ground.push(new Array(W).fill('grass')); elevation.push(new Array(W).fill(0)); }
  return Object.assign({
    name: 'Maze', playerName: 'Kevin', mode, viewMode: 'overhead', gameModeDefault: mode === 'speedrunner' ? 'RUN' : 'PLT',
    controlScheme: 'free-aim', rules: {},
    mapSnapshot: { gridW: W, gridH: H, density: 1, baseW: W, baseH: H, cell: 32, objectScaleMode: 'independent', ground, elevation, decorations: [] },
    buildings: [], mobs: [], items: [], spawns: [{ col: 2, row: 6 }], ramps: [], bridges: [], redstone: [],
    goal: { col: 12, row: 6, color: 0 }, settings: OH_SETTINGS.defaults(),
  }, over || {});
}

console.log('Speed Run — overhead timer start/tick/stop:');
{
  const g = new OverheadGame(mk('speedrunner'), { testMode: true, numPlayers: 1 }, () => {});
  ok(g._srMode === true, 'speedrunner world enables SR mode');
  ok(g._srT === 0 && !g._srRunning, 'timer idle before any movement');
  g._srTick();
  ok(g._srT === 0 && !g._srRunning, 'timer stays at 0 while the player has not moved');
  g.player._moving = true; g._srTick();
  ok(g._srRunning && g._srT > 0, 'timer starts + advances once the player moves');
  const t1 = g._srT; g._srTick(); g._srTick();
  ok(g._srT > t1, 'timer keeps ticking');
  ok(g._srLevelId() === 'Kevin:Maze', 'levelId = author:worldName');
}

console.log('Speed Run — finish enables the goal + records the time:');
{
  const g = new OverheadGame(mk('speedrunner'), { testMode: true, numPlayers: 1 }, () => {});
  g.player._moving = true; for (let i = 0; i < 30; i++) g._srTick();   // ~0.5s
  const before = g._srT;
  // walk onto the goal cell and interact -> finish
  const cell = g.grid.cell;
  g.player.x = (g.goal.col + 0.5) * cell; g.player.y = (g.goal.row + 0.5) * cell;
  g.player._intent = { action: false, move: { x: 0, y: 0 } };
  g._playerInteract(g.player);
  ok(g.state === 'won', 'reaching the goal in speedrunner mode WINS (finish enabled)');
  ok(g._srDone && !g._srRunning, 'timer stops at the finish');
  ok(g._srFinalMs > 0 && Math.abs(g._srFinalMs - before) < 40, 'final time captured (~ the running time)');
  const lb = SR.SpeedRunnerLeaderboard.get('Kevin:Maze');
  ok(lb.some((r) => r.ms === g._srFinalMs), 'the finish time was recorded on the leaderboard');
}

console.log('Speed Run — platformer goal still works (not broken):');
{
  const g = new OverheadGame(mk('platformer'), { testMode: true, numPlayers: 1 }, () => {});
  ok(g._srMode === false, 'platformer world is NOT SR mode (no timer)');
  const cell = g.grid.cell; g.player.x = (g.goal.col + 0.5) * cell; g.player.y = (g.goal.row + 0.5) * cell;
  g.player._intent = { action: false, move: { x: 0, y: 0 } };
  g._playerInteract(g.player);
  ok(g.state === 'won', 'platformer goal still wins');
}

console.log(`\noverhead speed run: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
