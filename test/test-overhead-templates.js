// Overhead TEMPLATES — the reusable-model overlay. Verifies the module (system tree,
// voxel expansion, capture, checksum) AND the runtime integration: placements are ADDITIVE
// (the terrain grid is never overwritten, so ground under a canopy is preserved → no black
// void), a trunk voxel makes its cell solid, and render/shadow run without throwing.
//   node test/test-overhead-templates.js
global.window = global;
global.CANVAS_W = 800; global.CANVAS_H = 500; global.GAME_VERSION = 'v3 build 321 (templates test)';
function stubCtx() { return new Proxy({ filter: 'none', globalAlpha: 1, globalCompositeOperation: 'source-over', imageSmoothingEnabled: true, canvas: { width: 800, height: 500 } }, { get(t, k) { if (k === 'measureText') return () => ({ width: 80 }); if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} }); if (k === 'getContext') return () => stubCtx(); if (k in t) return t[k]; return (typeof k === 'string') ? (() => {}) : undefined; }, set(t, k, v) { t[k] = v; return true; } }); }
const cls = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
function mkEl() { return { style: {}, classList: cls, appendChild() {}, addEventListener() {}, getContext: () => stubCtx(), getBoundingClientRect: () => ({ width: 800, height: 500, left: 0, top: 0 }), width: 800, height: 500 }; }
global.document = { getElementById: () => mkEl(), head: { appendChild() {} }, createElement: () => mkEl(), body: { appendChild() {}, classList: cls }, addEventListener() {} };
global.window.addEventListener = () => {}; global.window.dispatchEvent = () => {}; global.Event = function () {};
global.InputManager = function () { this.flush = () => {}; this.isJustDown = () => false; this.isDown = () => false; this.mouse = { x: 0, y: 0, clicked: false, down: false, rightClicked: false, moveVec: { x: 0, y: 0 } }; };
global.requestAnimationFrame = () => 0;
const path = require('path');
['palette', 'grid', 'buildings', 'movement', 'controls', 'combat', 'weapons', 'elevation', 'settings', 'daynight', 'redstone', 'templates', 'launch', 'game']
  .forEach((m) => require(path.join(__dirname, '..', 'js', 'overhead', 'overhead-' + m + '.js')));
const OverheadGame = global.OverheadGame, OH_SETTINGS = global.OH_SETTINGS, T = global.OH_TEMPLATES;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

console.log('Template module (system tree, voxels, capture, checksum):');
const tree = T.resolve('sys:tree');
ok(tree && tree.cells.length === 16, 'system tree resolves with 16 voxels');
const trunk = tree.cells.filter((c) => c.dx === 0 && c.dy === 0);
ok(trunk.filter((c) => c.block === 'log').length === 2, 'trunk = 2 stacked log voxels (dz 1-2)');
ok(tree.cells.some((c) => c.block === 'leaves' && c.dz === 4), 'canopy reaches dz 4');
{
  const world = { templates: [], templateStamps: [{ id: 'a', templateId: 'sys:tree', col: 5, row: 5, base: 0 }] };
  const vox = T.expandStamps(world, 20, 20);
  ok(vox.length === 16, 'a placed tree expands to 16 absolute voxels');
  ok(vox.some((v) => v.col === 5 && v.row === 5 && v.block === 'log'), 'trunk voxel at the anchor');
}
{
  const cap = T.capture('Pillar', { ax: 0, ay: 0, x: 2, y: 2, z: 3 }, () => ({ block: 'stone', elev: 2 }), 0);
  ok(cap.def.cells.length === 4 && cap.def.dims.x === 2, 'capture collects a 2×2 region into a template');
  ok(cap.floating === true, 'a region whose content starts above dz 1 is flagged floating');
  ok(T.checksum(tree) === T.checksum(tree) && T.checksum(tree) !== T.checksum(cap.def), 'checksum is stable + distinguishes templates');
}

console.log('Runtime overlay — ADDITIVE, solid trunk, renders + shadows:');
{
  const W = 12, H = 10, ground = [], elevation = [];
  for (let r = 0; r < H; r++) { ground.push(new Array(W).fill('grass')); elevation.push(new Array(W).fill(0)); }
  const world = { name: 't', mode: 'platformer', viewMode: 'overhead', gameModeDefault: 'NRM', controlScheme: 'free-aim', rules: {},
    mapSnapshot: { gridW: W, gridH: H, density: 1, baseW: W, baseH: H, cell: 32, objectScaleMode: 'independent', ground, elevation, decorations: [] },
    buildings: [], mobs: [], items: [], spawns: [{ col: 0, row: 0 }], ramps: [], bridges: [], redstone: [],
    templates: [], templateStamps: [{ id: 'a', templateId: 'sys:tree', col: 5, row: 5, base: 0 }],
    goal: null, settings: Object.assign(OH_SETTINGS.defaults(), { dayNight: true, shadows: true }) };
  const g = new OverheadGame(JSON.parse(JSON.stringify(world)), { testMode: true }, () => {});
  ok(g._templateVoxels.length === 16, 'runtime expands the tree stamp to voxels');
  ok(g._templateSolid.has('5,5'), 'the trunk cell is solid (blocks movement)');
  ok(g._key(5, 4) === 'grass' && g._elev(5, 4) === 0, 'ADDITIVE: ground under the canopy is still grass @0 (no void)');
  const S = (x, y) => ({ x: x + 10, y: y + 10 });
  let threw = false;
  try { g._drawEntity({ kind: 'tv', row: 5, level: 2, ref: g._templateVoxels[0] }, S, 1, 20); g._tod = 0.72; g._drawShadows(stubCtx(), S, 20, 0, W - 1, 0, H - 1); g._shadowStyle = 'fixed'; g._drawStaticShadows(stubCtx(), 20); } catch (e) { threw = true; console.log('  (render threw:', e.message, ')'); }
  ok(!threw, 'render + live + static shadows run with template voxels');
}

console.log(`\noverhead templates: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
