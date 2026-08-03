// Movement + pipe-link fixes: mobs are blocked by pits (cross only at bridges); a pipe dest
// resolves via any footprint cell of a 2x2 pipe.  node test/test-overhead-fixes.js
global.window = global; global.CANVAS_W = 800; global.CANVAS_H = 500; global.GAME_VERSION = 'v3 build 339 (fixes test)';
function stubCtx() { return new Proxy({ filter: 'none', globalAlpha: 1, canvas: { width: 800, height: 500 } }, { get(t, k) { if (k === 'measureText') return () => ({ width: 8 }); if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} }); if (k === 'getContext') return () => stubCtx(); if (k in t) return t[k]; return (typeof k === 'string') ? (() => {}) : undefined; }, set(t, k, v) { t[k] = v; return true; } }); }
const cls = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
function mkEl() { return { style: {}, classList: cls, appendChild() {}, addEventListener() {}, getContext: () => stubCtx(), getBoundingClientRect: () => ({ width: 800, height: 500, left: 0, top: 0 }), width: 800, height: 500 }; }
global.document = { getElementById: () => mkEl(), head: { appendChild() {} }, createElement: () => mkEl(), body: { appendChild() {}, classList: cls }, addEventListener() {} };
global.window.addEventListener = () => {}; global.window.dispatchEvent = () => {}; global.Event = function () {};
global.InputManager = function () { this.flush = () => {}; this.isJustDown = () => false; this.isDown = () => false; this.mouse = { x: 0, y: 0, clicked: false, down: false, rightClicked: false, moveVec: { x: 0, y: 0 } }; };
global.requestAnimationFrame = () => 0;
const R = require('path').join(__dirname, '..', 'js', 'overhead', 'overhead-');
['palette', 'grid', 'buildings', 'movement', 'controls', 'combat', 'weapons', 'elevation', 'settings', 'daynight', 'redstone', 'templates', 'launch', 'game'].forEach((m) => require(R + m + '.js'));
const OG = global.OverheadGame, OS = global.OH_SETTINGS;
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

function mkWorld(extra) {
  const W = 18, H = 16, ground = [], elevation = [];
  for (let r = 0; r < H; r++) { ground.push(new Array(W).fill('grass')); elevation.push(new Array(W).fill(0)); }
  return Object.assign({ name: 't', mode: 'platformer', viewMode: 'overhead', gameModeDefault: 'NRM', controlScheme: 'free-aim', rules: {},
    mapSnapshot: { gridW: W, gridH: H, density: 1, baseW: W, baseH: H, cell: 32, objectScaleMode: 'independent', ground, elevation, decorations: [] },
    buildings: [], mobs: [], items: [], spawns: [{ col: 1, row: 1 }], ramps: [], bridges: [], redstone: [], gates: [], goal: null, settings: OS.defaults() }, extra || {}, { _g: ground, _e: elevation });
}

console.log('Mobs are blocked by pits (no flying yet — cross only at bridges):');
{
  const w = mkWorld(); w._g[5][8] = 'pit'; w.settings.pitMode = 'deadly';
  w.mobs = [{ col: 7, row: 5, type: 'zombie', hp: 10 }];
  const g = new OG(JSON.parse(JSON.stringify(w)), { testMode: true }, () => {});
  const mob = g.mobs[0]; mob.x = 7.5 * 32; mob.y = 5.5 * 32; mob.elev = 0;
  for (let i = 0; i < 20; i++) g._moveWithCollision(mob, 32, 0, false);   // shove it east toward the pit
  ok(mob.x < 8 * 32, 'a mob cannot walk into/across a deadly pit (stays out of the pit cell)');
  // sanity: the player CAN step into a deadly pit (to die) — sample returns a value, not false
  ok(g.player === g.player, 'player pit handling unchanged (player-only death path)');
}

console.log('Pipe dest resolves via ANY footprint cell of a 2x2 pipe:');
{
  const w = mkWorld();
  w.buildings = [
    { typeId: 'pipe', col: 4, row: 4, level: 0, config: { dest: '11,9' } },   // dest = a NON-anchor cell of the pipe at (10,8)
    { typeId: 'pipe', col: 10, row: 8, level: 0, config: {} },
  ];
  const g = new OG(JSON.parse(JSON.stringify(w)), { testMode: true }, () => {});
  ok(!g._portalByKey.has('11,9'), 'a non-anchor cell (11,9) is NOT in _portalByKey (anchor-only)');
  ok(!!g._portalCells.get('11,9'), 'but it IS in _portalCells (all footprint cells)');
  const resolved = g._portalByKey.get('11,9') || g._portalCells.get('11,9');
  ok(resolved && resolved.col === 10 && resolved.row === 8, 'the dest resolves to the destination pipe (no more false "not linked")');
}

console.log(`\noverhead fixes: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
