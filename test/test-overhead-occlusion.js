// §42 depth-correct occlusion (P4, build 374) — the DEPTH RULE for which raised terrain
// cells hide an entity. The visual result needs a browser; this pins the rule that decides
// "one build vs three": a taller wall NEARER the camera occludes; a shorter wall one row
// south does NOT occlude a mob standing high on a tall wall.
//   node test/test-overhead-occlusion.js
const path = require('path');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

global.window = global; global.CANVAS_W = 800; global.CANVAS_H = 500; global.GAME_VERSION = 'v3 build 374 (occlusion test)';
global.localStorage = { _d: {}, getItem() { return null; }, setItem() {} };
function stubCtx() { return new Proxy({ filter: 'none' }, { get(t, k) { if (k === 'measureText') return () => ({ width: 40 }); if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} }); if (k === 'canvas') return { width: 800, height: 500 }; if (k in t) return t[k]; return (typeof k === 'string') ? (() => {}) : undefined; }, set(t, k, v) { t[k] = v; return true; } }); }
const cls = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
function mkEl() { return { style: {}, classList: cls, appendChild() {}, addEventListener() {}, getContext: () => stubCtx(), getBoundingClientRect: () => ({ width: 800, height: 500, left: 0, top: 0 }), width: 64, height: 64 }; }
global.document = { getElementById: () => mkEl(), head: { appendChild() {} }, createElement: () => mkEl(), body: { appendChild() {}, classList: cls }, addEventListener() {} };
global.window.addEventListener = () => {}; global.window.dispatchEvent = () => {}; global.Event = function () {};
global.InputManager = function () { this.flush = () => {}; this.clearHeld = () => {}; this.isDown = () => false; this.isJustDown = () => false; this.mouse = { x: 0, y: 0, moveVec: { x: 0, y: 0 } }; };
global.requestAnimationFrame = () => 0;
['palette', 'grid', 'buildings', 'movement', 'controls', 'combat', 'weapons', 'elevation', 'settings', 'daynight', 'redstone', 'templates', 'perf', 'launch', 'game']
  .forEach((m) => require(path.join(__dirname, '..', 'js', 'overhead', 'overhead-' + m + '.js')));
const OverheadGame = global.OverheadGame;

function mkGame(W, H, setup) {
  const ground = [], elevation = [];
  for (let r = 0; r < H; r++) { ground.push(new Array(W).fill('grass')); elevation.push(new Array(W).fill(0)); }
  if (setup) setup(elevation, ground);
  const g = new OverheadGame({ viewMode: 'overhead', mapSnapshot: { gridW: W, gridH: H, density: 1, cell: 16, ground, elevation }, spawns: [{ col: 0, row: 0 }], settings: {} }, { testMode: true }, () => {});
  return g;
}
const has = (cells, c, r) => cells.some((o) => o.c === c && o.r === r);

console.log('A taller wall NEARER the camera occludes a mob at ground level:');
{
  // Mob at (5,5) level 0; a level-2 wall one row SOUTH at (5,6).
  const g = mkGame(12, 12, (el) => { el[6][5] = 2; });
  const cells = g._occluderCells(5, 5, 0);
  ok(has(cells, 5, 6), 'the level-2 wall one row south is repainted over the mob (it hides it)');
}
console.log('A SHORTER wall one row south does NOT occlude a mob standing HIGH on a tall wall:');
{
  // Mob standing at level 3; a level-1 wall one row south at (5,6).
  const g = mkGame(12, 12, (el) => { el[6][5] = 1; });
  const cells = g._occluderCells(5, 5, 3);
  ok(!has(cells, 5, 6), 'the shorter (level-1) wall is NOT repainted — the elevated mob stays visible (the design subtlety)');
}
console.log('Flat ground never occludes, and cells BEHIND the entity are left alone:');
{
  const g = mkGame(12, 12, (el) => { el[6][5] = 2; el[4][5] = 3; });   // tall wall NORTH (behind) too
  const cells = g._occluderCells(5, 5, 0);
  ok(!has(cells, 5, 4), 'a tall wall NORTH of the entity (behind the camera line) is not repainted over it');
  const flat = mkGame(12, 12);                                          // all level 0
  ok(g._occluderCells.call(flat, 5, 5, 0).length === 0, 'flat ground produces no occluders — nothing hides a mob on open ground');
}
console.log('Only NEARER-and-taller cells qualify (c+r > entity depth AND elev > level):');
{
  const g = mkGame(14, 14, (el) => { el[6][6] = 2; el[7][7] = 2; el[6][4] = 2; });   // some near, some not
  const cells = g._occluderCells(5, 5, 0);
  ok(cells.every((o) => (o.c + o.r) > 10), 'every occluder is nearer the camera than the entity (c+r > 10)');
  ok(cells.every((o) => o.e > 0), 'every occluder is taller than the entity footing (level 0)');
  ok(has(cells, 6, 6), 'a nearby nearer+taller wall qualifies');
}

console.log(`\noverhead occlusion: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
