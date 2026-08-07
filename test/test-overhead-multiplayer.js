// Overhead multiplayer — Phase 0a: players[] array + `player` shim + N-player build.
//   node test/test-overhead-multiplayer.js
// Guarantees for 0a: single-player is byte-for-byte unchanged (default = 1 player, `player` ===
// players[0]); opts.numPlayers builds 2-4 players at spawns[i] with per-player ownerId/spawn;
// fewer spawns than players fans the extras out; and the (still single-player) update/render loop
// runs with N players present without throwing.
global.window = global;
global.CANVAS_W = 800; global.CANVAS_H = 500; global.GAME_VERSION = 'v3 build 394 (mp test)';
function stubCtx() { return new Proxy({ filter: 'none', globalAlpha: 1, globalCompositeOperation: 'source-over', canvas: { width: 800, height: 500 } }, { get(t, k) { if (k === 'measureText') return () => ({ width: 80 }); if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} }); if (k === 'getContext') return () => stubCtx(); if (k in t) return t[k]; return (typeof k === 'string') ? (() => {}) : undefined; }, set(t, k, v) { t[k] = v; return true; } }); }
const cls = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
function mkEl() { return { style: {}, classList: cls, appendChild() {}, addEventListener() {}, getContext: () => stubCtx(), getBoundingClientRect: () => ({ width: 800, height: 500, left: 0, top: 0 }), width: 800, height: 500 }; }
global.document = { getElementById: () => mkEl(), head: { appendChild() {} }, createElement: () => mkEl(), body: { appendChild() {}, classList: cls }, addEventListener() {} };
global.window.addEventListener = () => {}; global.window.dispatchEvent = () => {}; global.Event = function () {};
global.InputManager = function () { this.flush = () => {}; this.isJustDown = () => false; this.isDown = () => false; this.mouse = { x: 0, y: 0, clicked: false, down: false, rightClicked: false, moveVec: { x: 0, y: 0 } }; this.gamepads = []; };
global.requestAnimationFrame = () => 0;
const path = require('path');
['palette', 'grid', 'buildings', 'movement', 'controls', 'combat', 'weapons', 'elevation', 'settings', 'daynight', 'redstone', 'templates', 'launch', 'game']
  .forEach((m) => require(path.join(__dirname, '..', 'js', 'overhead', 'overhead-' + m + '.js')));
const OverheadGame = global.OverheadGame, OH_SETTINGS = global.OH_SETTINGS;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

function mk(over) {
  const W = 20, H = 16, ground = [], elevation = [];
  for (let r = 0; r < H; r++) { ground.push(new Array(W).fill('grass')); elevation.push(new Array(W).fill(0)); }
  return Object.assign({
    name: 'mp', mode: 'platformer', viewMode: 'overhead', gameModeDefault: 'NRM', controlScheme: 'free-aim', rules: {},
    mapSnapshot: { gridW: W, gridH: H, density: 1, baseW: W, baseH: H, cell: 32, objectScaleMode: 'independent', ground, elevation, decorations: [] },
    buildings: [], mobs: [], items: [], spawns: [{ col: 2, row: 13 }], ramps: [], bridges: [], redstone: [],
    goal: { col: 17, row: 13, color: 0 }, settings: OH_SETTINGS.defaults(),
  }, over || {});
}

console.log('Phase 0a — default construction is single-player (unchanged):');
{
  const g = new OverheadGame(mk(), { testMode: true }, () => {});
  ok(Array.isArray(g.players) && g.players.length === 1, 'default = exactly 1 player');
  ok(g.player === g.players[0], '`player` getter aliases players[0]');
  ok(g.activePlayers().length === 1, 'activePlayers() returns the one player');
  ok(g.player._ownerId === 'p1' && g.player._index === 0, 'P1 has ownerId p1 / index 0');
  ok(g.player._spawn && Math.abs(g.player._spawn.x - g.player.x) < 1e-6, 'P1 records its own spawn');
  // the shim is a live alias, not a copy
  g.player.hp = 7; ok(g.players[0].hp === 7, 'writing through `player` mutates players[0]');
}

console.log('Phase 0a — N players from spawns[i], with ownerId + per-player spawn:');
{
  const spawns = [{ col: 2, row: 13 }, { col: 5, row: 13 }, { col: 8, row: 13 }];
  const g = new OverheadGame(mk({ spawns }), { testMode: true, numPlayers: 3 }, () => {});
  ok(g.players.length === 3, 'numPlayers:3 builds 3 players');
  ok(g.activePlayers().length === 3, 'all 3 are active');
  ok(g.players.map(p => p._ownerId).join(',') === 'p1,p2,p3', 'ownerIds are p1,p2,p3');
  const xs = g.players.map(p => Math.round(p.x));
  ok(new Set(xs).size === 3, 'the 3 players spawn at distinct x (their own spawn cells)');
  ok(g.players.every(p => p._spawn && Math.abs(p._spawn.x - p.x) < 1e-6), 'each player records its own spawn');
  ok(Math.abs(g.players[1].x - 5.5 * 32) < 1e-6, 'P2 sits at spawns[1]');
}

console.log('Phase 0a — more players than spawns: extras fan out (no overlap, no crash):');
{
  const g = new OverheadGame(mk({ spawns: [{ col: 3, row: 10 }] }), { testMode: true, numPlayers: 4 }, () => {});
  ok(g.players.length === 4, 'numPlayers:4 with 1 spawn still builds 4 players');
  const xs = g.players.map(p => Math.round(p.x));
  ok(new Set(xs).size === 4, 'the 4 players fan out to distinct x rather than stacking');
}

console.log('Phase 0a — clamp + update/render loop runs with N players present:');
{
  const g = new OverheadGame(mk(), { testMode: true, numPlayers: 9 }, () => {});
  ok(g.players.length === 4, 'numPlayers clamps to 4');
  const g3 = new OverheadGame(mk({ spawns: [{ col: 2, row: 13 }, { col: 5, row: 13 }, { col: 8, row: 13 }] }), { testMode: true, numPlayers: 3 }, () => {});
  let threw = false; try { for (let f = 0; f < 8; f++) { g3._update(); g3._render(); } } catch (e) { threw = true; console.log('  (threw:', e.message, ')'); }
  ok(!threw, 'update+render run for 8 frames with 3 players without throwing');
  ok(g3.players.length === 3, 'still 3 players after frames');
}

console.log(`\noverhead multiplayer (0a): ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
