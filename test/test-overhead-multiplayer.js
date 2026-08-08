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

function pipeWorld(over) {
  const W = 20, H = 16, ground = [], elevation = [];
  for (let r = 0; r < H; r++) { ground.push(new Array(W).fill('grass')); elevation.push(new Array(W).fill(0)); }
  return mk(Object.assign({
    mapSnapshot: { gridW: W, gridH: H, density: 1, baseW: W, baseH: H, cell: 32, objectScaleMode: 'independent', ground, elevation, decorations: [] },
    buildings: [{ typeId: 'pipe', col: 4, row: 4, config: { dest: '14,4' } }, { typeId: 'pipe', col: 14, row: 4, config: {} }],
    spawns: [{ col: 2, row: 12 }, { col: 5, row: 12 }],
    settings: Object.assign(OH_SETTINGS.defaults(), { pipeClimbAnim: false, portalStepAnim: false }),   // instant teleport for deterministic asserts
  }, over || {}));
}

console.log('Phase 0c(2) — a SECONDARY player uses a pipe on its OWN E press:');
{
  const g = new OverheadGame(pipeWorld(), { testMode: true, numPlayers: 2 }, () => {});
  g.players[0].x = 2.5 * 32; g.players[0].y = 12.5 * 32;   // P1 far from any pipe
  g.players[1].x = 4.5 * 32; g.players[1].y = 6.5 * 32;    // P2 just below the (4,4) pipe mouth
  const p1x0 = g.players[0].x;
  g.input.isDown = () => false; g.input.isJustDown = () => false; g.input.pAttack = () => false;
  g.input.pGp = () => ({ moveX: 0, moveY: 0, aimX: 0, aimY: 0 });
  g.input.pJustDown = (i, btn) => (i === 1 && btn === 'context');   // P2 presses E (RB=context)
  g._update();
  ok(Math.abs(g.players[1].x - 15 * 32) < 6 && Math.abs(g.players[1].y - 6.5 * 32) < 6, 'P2 teleported to the destination pipe on its own E');
  ok(Math.abs(g.players[0].x - p1x0) < 1, 'P1 (not pressing E, far away) was unaffected');
}

console.log('Phase 0c(2) — per-pipe "pull everyone through" (groupTravel) brings nearby players along:');
{
  const g = new OverheadGame(pipeWorld({ buildings: [{ typeId: 'pipe', col: 4, row: 4, config: { dest: '14,4', groupTravel: true } }, { typeId: 'pipe', col: 14, row: 4, config: {} }] }), { testMode: true, numPlayers: 2 }, () => {});
  g.players[0].x = 4.5 * 32; g.players[0].y = 6.5 * 32;    // P1 at the mouth
  g.players[1].x = 5.2 * 32; g.players[1].y = 6.5 * 32;    // P2 also near the same mouth
  g.input.pAttack = () => false; g.input.pJustDown = () => false;
  g.input.pGp = () => ({ moveX: 0, moveY: 0, aimX: 0, aimY: 0 });
  g.input.isDown = () => false; g.input.isJustDown = (c) => c === 'KeyE';   // P1 presses E
  g._update();
  ok(Math.abs(g.players[0].x - 15 * 32) < 6, 'P1 (the trigger) went through');
  ok(Math.abs(g.players[1].x - 15 * 32) < 6, 'P2 was PULLED through together (Mario-3D-World style)');
}

console.log('Phase 0c(2) — WITHOUT groupTravel, only the triggering player travels:');
{
  const g = new OverheadGame(pipeWorld(), { testMode: true, numPlayers: 2 }, () => {});
  g.players[0].x = 4.5 * 32; g.players[0].y = 6.5 * 32;
  g.players[1].x = 5.2 * 32; g.players[1].y = 6.5 * 32;
  const p2x0 = g.players[1].x;
  g.input.pAttack = () => false; g.input.pJustDown = () => false;
  g.input.pGp = () => ({ moveX: 0, moveY: 0, aimX: 0, aimY: 0 });
  g.input.isDown = () => false; g.input.isJustDown = (c) => c === 'KeyE';   // P1 presses E
  g._update();
  ok(Math.abs(g.players[0].x - 15 * 32) < 6, 'P1 went through');
  ok(Math.abs(g.players[1].x - p2x0) < 1, 'P2 stayed put (single-player pipe)');
}

console.log('Phase 0c(2) — editor exposes the per-pipe travel toggle (source):');
{
  const edSrc = require('fs').readFileSync(path.join(__dirname, '..', 'js', 'overhead', 'overhead-editor.js'), 'utf8');
  ok(/id="cfg-group"/.test(edSrc) && /b\.config\.groupTravel = document\.getElementById\('cfg-group'\)\.checked/.test(edSrc), 'the pipe/portal dialog has a "pull all players" (groupTravel) toggle');
}

console.log('Phase 0e — multiplayer: a player DOWNS + respawns at its own spawn; the match does NOT freeze:');
{
  const W = 20, H = 16, ground = [], elevation = [];
  for (let r = 0; r < H; r++) { ground.push(new Array(W).fill('grass')); elevation.push(new Array(W).fill(0)); }
  for (let r = 6; r <= 8; r++) ground[r][8] = 'pit';   // a deadly pit column in P2's row
  const world = mk({ mapSnapshot: { gridW: W, gridH: H, density: 1, baseW: W, baseH: H, cell: 32, objectScaleMode: 'independent', ground, elevation, decorations: [] },
    spawns: [{ col: 3, row: 12 }, { col: 6, row: 7 }], settings: Object.assign(OH_SETTINGS.defaults(), { pitMode: 'deadly' }) });
  const g = new OverheadGame(world, { testMode: true, numPlayers: 2 }, () => {});
  const p2spawnX = g.players[1].x, p1x0 = g.players[0].x;
  g.input.isJustDown = () => false; g.input.pJustDown = () => false; g.input.pAttack = () => false;
  g.input.isDown = (c) => c === 'KeyD';                                   // P1 walks right on safe ground (row 12)
  g.input.pGp = (i) => i === 1 ? { moveX: 1, moveY: 0, aimX: 0, aimY: 0 } : { moveX: 0, moveY: 0, aimX: 0, aimY: 0 };   // P2 walks into the pit
  let sawP2Down = false;
  for (let f = 0; f < 40; f++) { g._update(); if (g.players[1]._dead) sawP2Down = true; }
  ok(sawP2Down, 'P2 went DOWN when it hit the deadly pit');
  ok(g.state === 'playing', 'the match did NOT freeze/end when P2 died (per-player death)');
  ok(g.players[0].x > p1x0 + 4, 'P1 kept moving/playing while P2 was down');
  for (let f = 0; f < 150 && g.players[1]._dead; f++) g._update();
  ok(!g.players[1]._dead, 'P2 respawned on its own');
  ok(Math.abs(g.players[1].x - p2spawnX) < 40, 'P2 respawned at its OWN spawn');
}

console.log('Phase 0e — single-player death is unchanged (still ends the game globally):');
{
  const W = 20, H = 16, ground = [], elevation = [];
  for (let r = 0; r < H; r++) { ground.push(new Array(W).fill('grass')); elevation.push(new Array(W).fill(0)); }
  for (let r = 6; r <= 8; r++) ground[r][8] = 'pit';
  const world = mk({ mapSnapshot: { gridW: W, gridH: H, density: 1, baseW: W, baseH: H, cell: 32, objectScaleMode: 'independent', ground, elevation, decorations: [] },
    spawns: [{ col: 6, row: 7 }], settings: Object.assign(OH_SETTINGS.defaults(), { pitMode: 'deadly' }) });
  const g = new OverheadGame(world, { testMode: true }, () => {});   // 1 player
  ok(g.players.length === 1, 'single player');
  g.input.isJustDown = () => false; g.input.isDown = (c) => c === 'KeyD';   // walk into the pit
  for (let f = 0; f < 40 && g.state === 'playing'; f++) g._update();
  ok(g.state === 'dying' || g.state === 'dead', 'single-player death still ends the game globally (unchanged)');
}

console.log('Phase 0f — mobs target the NEAREST player (and switch when someone else gets closer):');
{
  const g = new OverheadGame(mk({ mobs: [{ col: 10, row: 8, type: 'zombie', hp: 8, speed: 2, detect: 6 }], spawns: [{ col: 3, row: 8 }, { col: 16, row: 8 }] }), { testMode: true, numPlayers: 2 }, () => {});
  ok(g.mobs.length === 1 && typeof g.mobs[0].x === 'number', 'the mob instantiated with a world position');
  const m = g.mobs[0]; m.detect = 900; m.speed = 3;   // force detection + a clear step for the assert
  g.input.isDown = () => false; g.input.isJustDown = () => false; g.input.pJustDown = () => false; g.input.pAttack = () => false;
  g.input.pGp = () => ({ moveX: 0, moveY: 0, aimX: 0, aimY: 0 });
  // P1 close on the LEFT, P2 far on the RIGHT.
  g.players[0].x = 8.5 * 32; g.players[0].y = 8.5 * 32;
  g.players[1].x = 18.5 * 32; g.players[1].y = 8.5 * 32;
  ok(g._nearestPlayer(m.x, m.y) === g.players[0], 'nearest player to the mob is P1 (closer)');
  const mx0 = m.x;
  for (let f = 0; f < 20; f++) g._update();
  ok(m.x < mx0 - 2, 'mob chased the nearer player P1 (moved left)');
  // Now make P2 the closest — mob should switch and head right.
  g.players[0].x = 2.5 * 32; g.players[1].x = m.x + 1.5 * 32; g.players[1].y = 8.5 * 32;
  ok(g._nearestPlayer(m.x, m.y) === g.players[1], 'nearest player switched to P2');
  const mx1 = m.x;
  for (let f = 0; f < 20; f++) g._update();
  ok(m.x > mx1 + 2, 'mob switched target and chased P2 (moved right)');
}

console.log('Phase 0d/0e — EDGE-HOLD: a straggler is held on-screen, not lost off the edge (tester finding):');
{
  const W = 60, H = 16, ground = [], elevation = [];
  for (let r = 0; r < H; r++) { ground.push(new Array(W).fill('grass')); elevation.push(new Array(W).fill(0)); }
  const world = mk({ mapSnapshot: { gridW: W, gridH: H, density: 1, baseW: W, baseH: H, cell: 32, objectScaleMode: 'independent', ground, elevation, decorations: [] },
    spawns: [{ col: 4, row: 8 }, { col: 7, row: 8 }] });
  const g = new OverheadGame(world, { testMode: true, numPlayers: 2 }, () => {});
  g.input.isDown = () => false; g.input.isJustDown = () => false; g.input.pJustDown = () => false; g.input.pAttack = () => false;
  g.input.pGp = (i) => i === 1 ? { moveX: 1, moveY: 0, aimX: 0, aimY: 0 } : { moveX: 0, moveY: 0, aimX: 0, aimY: 0 };
  for (let f = 0; f < 500; f++) g._update();
  const z = g.grid.masterZoom;
  const p2sx = (g.players[1].x - g.camera.x) * z;   // P2 screen-x
  const p1sx = (g.players[0].x - g.camera.x) * z;   // P1 screen-x
  ok(p2sx <= CANVAS_W + 6 && p2sx >= -6, 'the driven player (P2) is HELD on-screen, not lost off the edge');
  ok(p1sx <= CANVAS_W + 6 && p1sx >= -6, 'the idle player (P1) is also kept on-screen');
  const spread = Math.abs(g.players[1].x - g.players[0].x);
  ok(spread <= CANVAS_W / z + 4, 'group spread is capped to the shared view (tethered, cannot separate past the screen)');
  ok(z >= (g.grid.MIN_ZOOM || 0.35) && z >= g._baseZoom * 0.5 - 1e-6, 'auto-zoom respects the MP floor (not zoomed out to the raw minimum)');
}

console.log('Phase combat — a SECONDARY player fires a ranged weapon on its own input + damages a mob:');
{
  const g = new OverheadGame(mk({ mobs: [{ col: 12, row: 8, type: 'zombie', hp: 20, speed: 2, detect: 6 }], spawns: [{ col: 2, row: 8 }, { col: 8, row: 8 }] }), { testMode: true, numPlayers: 2 }, () => {});
  const mob = g.mobs[0]; mob.speed = 0; mob.detect = 0;   // stationary target directly right of P2
  g.players[1].weapon = 'crossbow'; g.players[1].weapons = ['crossbow'];
  g.players[1].x = 8.5 * 32; g.players[1].y = 8.5 * 32;   // P2 left of the mob
  g.players[0].x = 2.5 * 32; g.players[0].y = 8.5 * 32;   // P1 out of the way
  g.input.isDown = () => false; g.input.isJustDown = () => false; g.input.pJustDown = () => false;
  g.input.pGp = (i) => i === 1 ? { moveX: 0, moveY: 0, aimX: 1, aimY: 0 } : { moveX: 0, moveY: 0, aimX: 0, aimY: 0 };   // P2 aims right at the mob
  g.input.pAttack = (i) => i === 1;   // P2 holds fire
  const before = g._bolts.length;
  g._update();
  ok(g._bolts.length > before, 'P2 fired a crossbow bolt on its own input (per-player combat)');
  const hp0 = mob.hp;
  for (let f = 0; f < 40; f++) g._update();
  ok(mob.hp < hp0, "P2's bolts damaged the mob");
}

console.log('Phase combat — a SECONDARY player melees a nearby mob on its own melee button:');
{
  const g = new OverheadGame(mk({ mobs: [{ col: 9, row: 8, type: 'zombie', hp: 20, speed: 2, detect: 6 }], spawns: [{ col: 2, row: 8 }, { col: 8, row: 8 }] }), { testMode: true, numPlayers: 2 }, () => {});
  const mob = g.mobs[0]; mob.speed = 0; mob.detect = 0;
  g.players[1].weapon = null;   // unarmed -> pickaxe cone melee
  g.players[1].x = 8.5 * 32; g.players[1].y = 8.5 * 32;   // P2 adjacent-left of the mob at col 9
  g.players[0].x = 2.5 * 32;
  g.input.isDown = () => false; g.input.isJustDown = () => false; g.input.pAttack = () => false;
  g.input.pGp = (i) => i === 1 ? { moveX: 0, moveY: 0, aimX: 1, aimY: 0 } : { moveX: 0, moveY: 0, aimX: 0, aimY: 0 };
  g.input.pJustDown = (i, btn) => (i === 1 && btn === 'attack');   // P2 presses melee (X)
  const hp0 = mob.hp;
  for (let f = 0; f < 10; f++) g._update();
  ok(mob.hp < hp0, 'P2 melee (X) damaged the adjacent mob');
  ok(g.players[1]._swingT > 0 || g.players[1]._fireCd > 0, "P2's swing animation/cooldown triggered");
}

console.log('Phase combat — P1 combat unchanged (mouse fire still works):');
{
  const g = new OverheadGame(mk({ mobs: [{ col: 12, row: 8, type: 'zombie', hp: 20, speed: 2, detect: 6 }], spawns: [{ col: 8, row: 8 }] }), { testMode: true }, () => {});
  g.players[0].weapon = 'crossbow'; g.players[0].weapons = ['crossbow'];
  g.players[0].x = 8.5 * 32; g.players[0].y = 8.5 * 32; g.players[0].aim = { x: 1, y: 0 };
  g.input.isDown = () => false; g.input.isJustDown = () => false;
  g.input.mouse = { x: 700, y: 250, clicked: true, down: true, rightClicked: false, moveVec: { x: 0, y: 0 } };   // P1 holds fire
  const before = g._bolts.length;
  g._update();
  ok(g._bolts.length > before, 'P1 still fires on mouse (single-player combat unchanged)');
}

console.log(`\noverhead multiplayer (0a-0f + edge-hold + per-player combat): ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
