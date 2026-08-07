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

console.log('Phase 0b — each player reads its own input and moves independently:');
{
  const spawns = [{ col: 3, row: 8 }, { col: 8, row: 8 }, { col: 13, row: 8 }];
  const g = new OverheadGame(mk({ spawns }), { testMode: true, numPlayers: 3 }, () => {});
  ok(typeof g._controlPlayer === 'function' && typeof g._rawFor === 'function' && typeof g._syncControllerSlots === 'function', '0b methods exist');
  const before = g.players.map(p => ({ x: p.x, y: p.y }));
  // P1 walks right on the keyboard; P2 walks DOWN on its pad; P3 idle.
  g.input.isDown = (c) => c === 'KeyD';
  g.input.pGp = (i) => i === 1 ? { moveX: 0, moveY: 1, aimX: 0, aimY: 0 } : { moveX: 0, moveY: 0, aimX: 0, aimY: 0 };
  g.input.pJustDown = () => false; g.input.pAttack = () => false;
  for (let f = 0; f < 10; f++) g._update();
  ok(g.players[0].x - before[0].x > 4, 'P1 (keyboard) moved right');
  ok(Math.abs(g.players[0].y - before[0].y) < 1, 'P1 did not drift vertically');
  ok(g.players[1].y - before[1].y > 4, 'P2 (pad) moved down independently');
  ok(Math.abs(g.players[1].x - before[1].x) < 1, 'P2 did not drift horizontally');
  ok(Math.abs(g.players[2].x - before[2].x) < 1 && Math.abs(g.players[2].y - before[2].y) < 1, 'P3 (idle pad) stayed put');
}

console.log('Phase 0b — a secondary player is NOT killed by a pit yet (held out like a mob; death = 0e):');
{
  // A pit column between P2's spawn and where it walks; deadly pits on. P2 must not trigger _die
  // (which would end the match for everyone) — it should be blocked by collision instead.
  const W = 20, H = 16, ground = [], elevation = [];
  for (let r = 0; r < H; r++) { ground.push(new Array(W).fill('grass')); elevation.push(new Array(W).fill(0)); }
  for (let r = 6; r <= 10; r++) ground[r][10] = 'pit';   // a vertical pit wall at col 10
  const world = mk({ mapSnapshot: { gridW: W, gridH: H, density: 1, baseW: W, baseH: H, cell: 32, objectScaleMode: 'independent', ground, elevation, decorations: [] },
    spawns: [{ col: 2, row: 8 }, { col: 8, row: 8 }], settings: Object.assign(OH_SETTINGS.defaults(), { pitMode: 'deadly' }) });
  const g = new OverheadGame(world, { testMode: true, numPlayers: 2 }, () => {});
  g.input.isDown = () => false;
  g.input.pGp = (i) => i === 1 ? { moveX: 1, moveY: 0, aimX: 0, aimY: 0 } : { moveX: 0, moveY: 0, aimX: 0, aimY: 0 };
  g.input.pJustDown = () => false; g.input.pAttack = () => false;
  for (let f = 0; f < 30; f++) g._update();   // P2 walks right into the pit wall
  ok(g.state === 'playing', 'P2 walking into a pit did NOT end the match (no global death from a secondary)');
  ok(g.players[1].x < (10 + 0.5) * 32, 'P2 was blocked before entering the pit column');
}

console.log('Phase 0d — shared auto-fit camera: single-player unchanged:');
{
  const g = new OverheadGame(mk(), { testMode: true }, () => {});
  const z0 = g.grid.masterZoom;
  g.input.isDown = () => false;
  for (let f = 0; f < 8; f++) g._update();
  ok(Math.abs(g.grid.masterZoom - z0) < 1e-6, 'single player: zoom stays at base (no auto-fit)');
  ok(g.camera && typeof g.camera.x === 'number', 'single player: camera still resolves (unchanged centerOn path)');
}

console.log('Phase 0d — 2 players: zoom OUT to frame the group, centre on the midpoint, zoom back on regroup:');
{
  // A wide world so spreading the pair actually exceeds one screen (forces zoom-out).
  const W = 44, H = 16, ground = [], elevation = [];
  for (let r = 0; r < H; r++) { ground.push(new Array(W).fill('grass')); elevation.push(new Array(W).fill(0)); }
  const world = mk({ mapSnapshot: { gridW: W, gridH: H, density: 1, baseW: W, baseH: H, cell: 32, objectScaleMode: 'independent', ground, elevation, decorations: [] },
    spawns: [{ col: 3, row: 8 }, { col: 5, row: 8 }] });
  const g = new OverheadGame(world, { testMode: true, numPlayers: 2 }, () => {});
  const base = g._baseZoom;
  g.input.isDown = () => false; g.input.pJustDown = () => false; g.input.pAttack = () => false;
  // Drive P2 far to the right — spread the pair well past one screen.
  g.input.pGp = (i) => i === 1 ? { moveX: 1, moveY: 0, aimX: 0, aimY: 0 } : { moveX: 0, moveY: 0, aimX: 0, aimY: 0 };
  for (let f = 0; f < 220; f++) g._update();
  const spread = Math.abs(g.players[1].x - g.players[0].x);
  ok(spread > 800, 'the two players spread more than one screen apart');
  ok(g.grid.masterZoom < base - 0.05, 'camera zoomed OUT to keep both framed');
  const midX = (g.players[0].x + g.players[1].x) / 2;
  const camMidX = g.camera.x + (CANVAS_W / g.grid.masterZoom) / 2;
  ok(Math.abs(camMidX - midX) < 40, 'camera centres on the group midpoint');
  const zoomedOut = g.grid.masterZoom;
  // Regroup: P2 walks back left toward P1.
  g.input.pGp = (i) => i === 1 ? { moveX: -1, moveY: 0, aimX: 0, aimY: 0 } : { moveX: 0, moveY: 0, aimX: 0, aimY: 0 };
  for (let f = 0; f < 220; f++) g._update();
  ok(g.grid.masterZoom > zoomedOut + 0.05, 'camera zooms back IN as they regroup');
  ok(g.grid.masterZoom <= base + 1e-6, 'zoom never exceeds the world base zoom');
}

console.log('Phase 0g (launch hook) — editor multi-spawn + Test launches N players (source):');
{
  const fs = require('fs');
  const edSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'overhead', 'overhead-editor.js'), 'utf8');
  // Multi-spawn: append up to 4, click-to-remove (no longer replaces the array with one).
  ok(!/this\.tool === 'spawn'\) \{ this\.world\.spawns = \[\{ col, row \}\]; return; \}/.test(edSrc), 'the spawn tool no longer hard-replaces spawns with a single entry');
  ok(/sps\.length < 4\) \{ sps\.push\(\{ col, row \}\)/.test(edSrc), 'the spawn tool appends up to 4 player spawns');
  ok(/at >= 0\) \{ sps\.splice\(at, 1\)/.test(edSrc), 'clicking an existing spawn removes it');
  // Markers are labelled per index P1..P4.
  ok(/forEach\(\(spn, i\) =>/.test(edSrc) && /'P' \+ \(i \+ 1\)/.test(edSrc), 'spawn markers are labelled P1..P4 by index');
  // Test launches numPlayers = spawn count (1-4).
  ok(/const numPlayers = Math\.max\(1, Math\.min\(4, \(this\.world\.spawns \|\| \[\]\)\.length \|\| 1\)\)/.test(edSrc), 'Test derives numPlayers from the spawn count');
  ok(/launchWorld\(draft, \{ testMode: true, numPlayers \}/.test(edSrc), 'Test passes numPlayers through to the overhead runtime');
}

console.log('Phase 0c — render draws EVERY active player (was P1 only):');
{
  const g = new OverheadGame(mk({ spawns: [{ col: 3, row: 8 }, { col: 6, row: 8 }, { col: 9, row: 8 }] }), { testMode: true, numPlayers: 3 }, () => {});
  let drawn = 0; g._drawPlayer = () => { drawn++; };   // spy
  g._render();
  ok(drawn === 3, 'all 3 players are drawn (not just P1)');
}

console.log('Phase 0c — pipe transit is per-player: one player in a pipe does NOT freeze the others:');
{
  const W = 20, H = 16, ground = [], elevation = [];
  for (let r = 0; r < H; r++) { ground.push(new Array(W).fill('grass')); elevation.push(new Array(W).fill(0)); }
  const world = mk({ mapSnapshot: { gridW: W, gridH: H, density: 1, baseW: W, baseH: H, cell: 32, objectScaleMode: 'independent', ground, elevation, decorations: [] },
    buildings: [{ typeId: 'pipe', col: 4, row: 4, config: { dest: '14,4' } }, { typeId: 'pipe', col: 14, row: 4, config: {} }],
    spawns: [{ col: 3, row: 10 }, { col: 8, row: 10 }] });
  const g = new OverheadGame(world, { testMode: true, numPlayers: 2 }, () => {});
  // Put P1 into a pipe climb directly; state must live on P1, not globally.
  g._startPipeClimb(g.players[0], g.buildings[0], { px: 14.5 * 32, py: 5.5 * 32, key: '14,4' });
  ok(!!g.players[0]._climb && !g.players[1]._climb, 'the climb is on P1 only (per-player state)');
  const p2x0 = g.players[1].x;
  g.input.isDown = () => false; g.input.pJustDown = () => false; g.input.pAttack = () => false;
  g.input.pGp = (i) => i === 1 ? { moveX: 1, moveY: 0, aimX: 0, aimY: 0 } : { moveX: 0, moveY: 0, aimX: 0, aimY: 0 };
  for (let f = 0; f < 12; f++) g._update();
  ok(g.players[1].x - p2x0 > 4, 'P2 keeps moving while P1 is mid-pipe (the old global freeze is gone)');
  // P1 finishes its climb independently and teleports.
  for (let f = 0; f < 200 && g.players[0]._climb; f++) g._update();
  ok(!g.players[0]._climb, 'P1 climb completes on its own');
  ok(Math.abs(g.players[0].x - 14.5 * 32) < 2, 'P1 teleported to the destination pipe');
}

console.log(`\noverhead multiplayer (0a+0b+0c+0d+0g): ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
