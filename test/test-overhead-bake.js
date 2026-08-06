// Chunked terrain bake + Loading World / zoom-out intro (P3.10, build 373).
// The opening 112k-cell bake used to run synchronously in one frame (~8fps freeze); it now
// bakes a chunk per frame behind a Loading banner, then eases the zoom out to the creator's
// default. Pins: the bake is incremental with honest progress, the sync path still works
// (measure / re-bake), and the zoom-out animation eases from a zoomed-in start to the default.
//   node test/test-overhead-bake.js
const path = require('path');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

global.window = global; global.CANVAS_W = 800; global.CANVAS_H = 500; global.GAME_VERSION = 'v3 build 373 (bake test)';
global.localStorage = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = v; } };
function stubCtx() { return new Proxy({ filter: 'none' }, { get(t, k) { if (k === 'measureText') return () => ({ width: 40 }); if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} }); if (k === 'canvas') return { width: 800, height: 500 }; if (k in t) return t[k]; return (typeof k === 'string') ? (() => {}) : undefined; }, set(t, k, v) { t[k] = v; return true; } }); }
const cls = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
function mkEl() { return { style: {}, classList: cls, appendChild() {}, addEventListener() {}, getContext: () => stubCtx(), getBoundingClientRect: () => ({ width: 800, height: 500, left: 0, top: 0 }), width: 64, height: 64 }; }
global.document = { getElementById: () => mkEl(), head: { appendChild() {} }, createElement: () => mkEl(), body: { appendChild() {}, classList: cls }, addEventListener() {} };
global.window.addEventListener = () => {}; global.window.dispatchEvent = () => {}; global.Event = function () {};
global.InputManager = function () { this.flush = () => {}; this.clearHeld = () => {}; this.isJustDown = () => false; this.isDown = () => false; this.mouse = { x: 0, y: 0, clicked: false, down: false, rightClicked: false, moveVec: { x: 0, y: 0 } }; };
global.requestAnimationFrame = () => 0;
['palette', 'grid', 'buildings', 'movement', 'controls', 'combat', 'weapons', 'elevation', 'settings', 'daynight', 'redstone', 'templates', 'perf', 'launch', 'game']
  .forEach((m) => require(path.join(__dirname, '..', 'js', 'overhead', 'overhead-' + m + '.js')));
const OverheadGame = global.OverheadGame, OH_GRID = global.OH_GRID;

// A modest world so the bake has real cells to chew through.
function world(W, H) {
  const ground = [], elevation = [];
  for (let r = 0; r < H; r++) { ground.push(new Array(W).fill('grass')); elevation.push(new Array(W).fill(0)); }
  elevation[2][2] = 3;   // a raised stack so maxE/pad are exercised
  return { viewMode: 'overhead', mapSnapshot: { gridW: W, gridH: H, density: 1, cell: 16, ground, elevation }, spawns: [{ col: 1, row: 1 }], settings: { masterZoom: 1 } };
}

console.log('Incremental bake: a chunk per frame, honest progress, then a published cache:');
{
  const g = new OverheadGame(world(20, 20), { testMode: true }, () => {});
  ok(!g._terrainCache, 'no cache exists until the bake runs');
  g._beginTerrainBake();
  ok(g._bake && g._bake.total > 0, 'begin sets up a sorted cell list to work through');
  ok(g.bakeProgress() === 0, 'progress starts at 0');
  g._stepTerrainBake(50);
  const midway = g.bakeProgress();
  ok(midway > 0 && midway < 1, `a single step advances but does not finish (${(midway * 100) | 0}%)`);
  ok(!g._terrainCache, 'the cache is NOT published until the bake completes');
  g._stepTerrainBake(1e9);
  ok(g.bakeProgress() === 1 && g._terrainCache, 'finishing the bake publishes the cache and reads 100%');
  ok(!g._bake, 'and clears the in-progress bake state');
}

console.log('Synchronous bake still works (mid-play re-bake / perf measure):');
{
  const g = new OverheadGame(world(12, 12), { testMode: true }, () => {});
  g._bakeTerrainNow();
  ok(g._terrainCache && g.bakeProgress() === 1, '_bakeTerrainNow() produces a cache in one call');
  // The historical name is a synchronous alias.
  g._terrainCache = null;
  g._buildTerrainCache();
  ok(g._terrainCache, '_buildTerrainCache() (legacy name) still bakes synchronously');
}

console.log('Zoom-out intro: hold zoomed IN, ease to the creator default AFTER the load:');
{
  const g = new OverheadGame(world(12, 12), { testMode: true }, () => {});
  g.settings.masterZoom = 1;                 // creator default
  g.player = { x: 96, y: 96 };
  g._startLoadZoom();
  ok(g._loadZoom && g.grid.masterZoom > 1.5, 'the view starts clearly zoomed IN on the player');
  ok(g._loadZoom.to === 1, 'the target is the creator default zoom');
  const dur = g._loadZoom.dur;
  for (let i = 0; i <= dur; i++) g._tickLoadZoom();
  ok(!g._loadZoom && Math.abs(g.grid.masterZoom - 1) < 1e-6, 'after the animation it settles exactly on the default, then stops');
}

console.log('The Loading screen draws without throwing (progress banner):');
{
  const g = new OverheadGame(world(10, 10), { testMode: true }, () => {});
  g._beginTerrainBake(); g._stepTerrainBake(5);
  try { g._drawLoading(stubCtx()); ok(true, '_drawLoading renders a banner + progress bar'); }
  catch (e) { ok(false, '_drawLoading threw: ' + e.message); }
}

console.log(`\noverhead bake: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
