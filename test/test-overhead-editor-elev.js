// Overhead editor elevation clarity + fixes: erase removes only the top level (keeps blocks
// below), buildings need corner support, click-selected entities delete, bridges default to
// plain (drawbridge is a config toggle). Exercises OH_EDITOR methods on a fake context.
//   node test/test-overhead-editor-elev.js
global.window = global; global.CANVAS_W = 800; global.CANVAS_H = 500; global.GAME_VERSION = 'v3 build 328 (elev test)';
const cls = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
function mkEl() { return { style: {}, classList: cls, appendChild() {}, addEventListener() {}, getContext: () => ({}), getBoundingClientRect: () => ({ width: 800, height: 500, left: 0, top: 0 }) }; }
global.document = { getElementById: () => mkEl(), head: { appendChild() {} }, createElement: () => mkEl(), body: { appendChild() {}, classList: cls }, addEventListener() {} };
global.window.addEventListener = () => {}; global.window.dispatchEvent = () => {}; global.Event = function () {};
global.InputManager = function () { this.flush = () => {}; this.isJustDown = () => false; this.isDown = () => false; this.mouse = { x: 0, y: 0, moveVec: { x: 0, y: 0 } }; };
global.requestAnimationFrame = () => 0;
const path = require('path');
['palette', 'grid', 'buildings', 'movement', 'controls', 'combat', 'weapons', 'elevation', 'settings', 'daynight', 'redstone', 'templates', 'launch', 'editor']
  .forEach((m) => require(path.join(__dirname, '..', 'js', 'overhead', 'overhead-' + m + '.js')));
const OH_EDITOR = global.OH_EDITOR, OH_BUILDINGS = global.OH_BUILDINGS;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

function mkMap(W, H) { const ground = [], elevation = []; for (let r = 0; r < H; r++) { ground.push(new Array(W).fill('grass')); elevation.push(new Array(W).fill(0)); } return { gridW: W, gridH: H, cell: 8, ground, elevation }; }
function mkEd(m) { return { world: { mapSnapshot: m, buildings: [], mobs: [], items: [], ramps: [], bridges: [], redstone: [], spawns: [] }, tool: 'erase', _shift: false, elevLevel: 0, _editBox: null, terrainKey: 'stone', _scatter: 0,
  _opCell: OH_EDITOR._opCell, _markDirty: OH_EDITOR._markDirty, _buildingFits: OH_EDITOR._buildingFits, _deleteObj: OH_EDITOR._deleteObj, _pushHistory() {}, _flash() {} }; }

console.log('Erase removes the top level, keeps blocks below:');
{
  const m = mkMap(20, 20), ed = mkEd(m);
  m.elevation[5][5] = 3; m.ground[5][5] = 'stone';
  ed.elevLevel = 3; ed._opCell.call(ed, 5, 5);
  ok(m.elevation[5][5] === 2, 'erasing level 3 of a height-3 column drops it to 2 (was zeroing to 0)');
  ok(m.ground[5][5] === 'stone', 'the block type below is preserved');
  m.elevation[6][6] = 5; ed.elevLevel = 3; ed._opCell.call(ed, 6, 6);
  ok(m.elevation[6][6] === 2, 'erasing level 3 of a height-5 column removes 3+ and keeps 1,2 (=> height 2)');
  m.elevation[7][7] = 2; ed.elevLevel = 4; ed._opCell.call(ed, 7, 7);
  ok(m.elevation[7][7] === 2, 'erasing a level ABOVE the column top leaves it untouched');
  m.elevation[8][8] = 1; m.ground[8][8] = 'stone'; ed.elevLevel = 0; ed._opCell.call(ed, 8, 8);
  ok(m.elevation[8][8] === 0 && m.ground[8][8] === 'grass', 'erasing at level 0 clears the cell to grass');
}

console.log('Building corner support:');
{
  const m = mkMap(20, 20), ed = mkEd(m);
  const twoByTwo = OH_BUILDINGS.list ? (OH_BUILDINGS.list().find((b) => { const t = OH_BUILDINGS.get(b); return t && t.footprint.w >= 2; }) || OH_BUILDINGS.list()[0]) : 'house';
  ok(ed._buildingFits.call(ed, twoByTwo, 3, 3, 0) === true, 'a ground-level building (level 0) needs no support');
  ok(ed._buildingFits.call(ed, twoByTwo, 3, 3, 2) === false, 'a raised building over flat ground is rejected (no corner support)');
  const t = OH_BUILDINGS.get(twoByTwo), fw = t ? t.footprint.w : 1, fh = t ? t.footprint.h : 1;
  for (const [cc, rr] of [[3, 3], [3 + fw - 1, 3], [3, 3 + fh - 1], [3 + fw - 1, 3 + fh - 1]]) m.elevation[rr][cc] = 2;
  ok(ed._buildingFits.call(ed, twoByTwo, 3, 3, 2) === true, 'raising all four corners to the level lets it fit');
  ed.world.buildings.push({ typeId: twoByTwo, col: 3, row: 3 });
  ok(ed._buildingFits.call(ed, twoByTwo, 3, 3, 2) === false, 'it will not place overlapping another building');
  ok(ed._buildingFits.call(ed, twoByTwo, 20, 20, 0) === false, 'a footprint running off the map is rejected');
}

console.log('Click-selected entity delete (_deleteObj):');
{
  const m = mkMap(10, 10), ed = mkEd(m);
  const mob = { col: 2, row: 2, type: 'skeleton' }, item = { col: 4, row: 4, itemKey: 'sword' };
  ed.world.mobs.push(mob); ed.world.items.push(item);
  ed._selEnt = { kind: 'mob', ref: mob };
  ed._deleteObj.call(ed, mob);
  ok(ed.world.mobs.length === 0, 'deleting a selected mob removes it');
  ok(ed._selEnt === null, 'the selection clears after delete');
  ed._deleteObj.call(ed, item);
  ok(ed.world.items.length === 0, 'deleting a selected item removes it');
}

console.log('Unified selection + action bar logic:');
{
  const m = mkMap(16, 16), ed = mkEd(m);
  Object.assign(ed, { _buildingAt: OH_EDITOR._buildingAt, _selectObjAt: OH_EDITOR._selectObjAt, _selHasSettings: OH_EDITOR._selHasSettings, _selMovable: OH_EDITOR._selMovable, _deleteSel: OH_EDITOR._deleteSel, _selName: OH_EDITOR._selName, _hoverName: OH_EDITOR._hoverName, _renderSelBar() {}, _hideSelBar() {} });
  ed.world.gates = [{ col: 5, row: 5, len: 2, rest: 0, angle: 90 }];
  ed.world.mobs.push({ col: 2, row: 2, type: 'goomba' });
  m.elevation[7][7] = 3; m.ground[7][7] = 'stone';
  ed._selectObjAt(2, 2); ok(ed._selEnt && ed._selEnt.kind === 'mob', 'clicking a mob selects it (kind=mob)');
  ok(ed._selMovable(ed._selEnt) && !ed._selHasSettings(ed._selEnt), 'a mob is movable and has no settings');
  ed._selectObjAt(5, 5); ok(ed._selEnt.kind === 'gate' && ed._selHasSettings(ed._selEnt), 'clicking a gate selects it and it HAS settings');
  ok(ed._selName(ed._selEnt) === 'Gate', 'the action bar names a gate "Gate" (not the block underneath)');
  ed._selectObjAt(7, 7); ok(ed._selEnt.kind === 'terrain', 'clicking a plain block selects the terrain');
  ok(ed._selMovable(ed._selEnt), 'a terrain block is movable');
  ed._deleteSel(); ok((m.elevation[7][7] | 0) === 0 && m.ground[7][7] === 'grass', 'deleting a selected block clears that cell');
  ed._selectObjAt(2, 2); ed._deleteSel(); ok(ed.world.mobs.length === 0, 'deleting a selected mob removes it');
  ed._selectObjAt(9, 9); ok(ed._selEnt && ed._selEnt.kind === 'terrain', 'empty ground still selects as terrain (grass)');
}

console.log('Hide-above slice caps tall cells (no black holes):');
{
  const ed = { view: { hideAbove: false }, elevLevel: 2, _capE: OH_EDITOR._capE };
  ok(ed._capE.call(ed, 5) === 5, 'with hide-above OFF, elevation is unchanged');
  ed.view.hideAbove = true;
  ok(ed._capE.call(ed, 5) === 2, 'with hide-above ON, a taller cell is capped to the active level (shows the block under)');
  ok(ed._capE.call(ed, 2) === 2, 'a cell at the active level is unchanged');
  ok(ed._capE.call(ed, 1) === 1, 'a cell below the active level is unchanged');
}

console.log('Mouse-focused zoom keeps the point under the cursor fixed:');
{
  const under = (ed, sx, sy) => ({ x: ed.cam.x + sx / ed.grid.masterZoom, y: ed.cam.y + (sy - ed._topInset) / ed.grid.masterZoom });
  const ed = { grid: { masterZoom: 1, cell: 32 }, cam: { x: 100, y: 80 }, _topInset: 46, _zoomAt: OH_EDITOR._zoomAt };
  const e = { clientX: 400, clientY: 346 }, sx = 400, sy = 346, before = under(ed, sx, sy);
  ed._zoomAt.call(ed, 2, e);
  const a = under(ed, sx, sy);
  ok(ed.grid.masterZoom === 2, 'the wheel changes the zoom level');
  ok(Math.abs(before.x - a.x) < 0.01 && Math.abs(before.y - a.y) < 0.01, 'zooming IN keeps the world point under the cursor fixed');
  ed._zoomAt.call(ed, 0.5, e);
  const b = under(ed, sx, sy);
  ok(Math.abs(before.x - b.x) < 0.01 && Math.abs(before.y - b.y) < 0.01, 'zooming back OUT keeps it fixed too');
}

console.log(`\noverhead editor elev: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
