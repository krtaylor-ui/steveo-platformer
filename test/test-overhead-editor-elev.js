// Overhead editor elevation clarity + fixes: erase removes only the top level (keeps blocks
// below), buildings need corner support, click-selected entities delete, bridges default to
// plain (drawbridge is a config toggle). Exercises OH_EDITOR methods on a fake context.
//   node test/test-overhead-editor-elev.js
global.window = global; global.CANVAS_W = 800; global.CANVAS_H = 500; global.GAME_VERSION = 'v3 build 328 (elev test)';
global.localStorage = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = v; } };
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

console.log('Building auto-snap (rests on flat ground under it, any elevation):');
{
  const m = mkMap(20, 20), ed = mkEd(m); ed._bFootprint = OH_EDITOR._bFootprint;
  const all = (OH_BUILDINGS.all ? OH_BUILDINGS.all() : []).map((b) => b.id || b);
  const twoByTwo = all.find((id) => { const t = OH_BUILDINGS.get(id); return t && !t.scaleWithDensity; }) || all[0];
  const fp = ed._bFootprint.call(ed, twoByTwo), fw = fp.w, fh = fp.h;
  ok(ed._buildingFits.call(ed, twoByTwo, 3, 3) === 0, 'on flat grass it snaps to level 0');
  for (let r = 3; r < 3 + fh; r++) for (let c = 3; c < 3 + fw; c++) m.elevation[r][c] = 2;
  ok(ed._buildingFits.call(ed, twoByTwo, 3, 3) === 2, 'on a flat height-2 platform it snaps to level 2 (no elevLevel matching)');
  m.elevation[3][3] = 1;   // make one corner uneven
  ok(ed._buildingFits.call(ed, twoByTwo, 3, 3) === false, 'uneven ground under the footprint is rejected (needs flat)');
  for (let r = 3; r < 3 + fh; r++) for (let c = 3; c < 3 + fw; c++) m.elevation[r][c] = 0;
  ed.world.buildings.push({ typeId: twoByTwo, col: 3, row: 3 });
  ok(ed._buildingFits.call(ed, twoByTwo, 3, 3) === false, 'it will not place overlapping another building');
  ok(ed._buildingFits.call(ed, twoByTwo, 20, 20) === false, 'a footprint running off the map is rejected');
  // pipes/portals scale their footprint with density (stay proportional to the player)
  ok(OH_BUILDINGS.footprintOf('pipe', 1).w === 2, 'a pipe is 2×2 at density 1');
  ok(OH_BUILDINGS.footprintOf('pipe', 4).w === 4, 'a pipe becomes 4×4 at density 4');
  ok(OH_BUILDINGS.footprintOf(twoByTwo, 4).w === fw, 'a normal building does NOT scale with density');
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
  Object.assign(ed, { _buildingAt: OH_EDITOR._buildingAt, _selectObjAt: OH_EDITOR._selectObjAt, _selHasSettings: OH_EDITOR._selHasSettings, _selMovable: OH_EDITOR._selMovable, _deleteSel: OH_EDITOR._deleteSel, _selName: OH_EDITOR._selName, _hoverName: OH_EDITOR._hoverName, _deviceAt: OH_EDITOR._deviceAt, _deviceLabel: OH_EDITOR._deviceLabel, _renderSelBar() {}, _hideSelBar() {} });
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

console.log('Redstone devices are selectable from where they LOOK - density-scaled (A4.7, build 363):');
{
  // A4.7 CORRECTION. The build-347 assertions here encoded a mental model the drawLever
  // GEOMETRY contradicts, which is exactly why A4.7 stayed broken: the lever sprite is CENTRED
  // on the cell centre (radius u*0.9, u = cell*DENSITY*zoom) and is NOT lifted by elevation.
  // Measured footprint vs the anchor:  density 1 -> rows[0..+1] col0 ;  density 4 -> rows[-2..+3]
  // col +/-2.  So at density 1 the arm tip only just pokes into the anchor cell (it does NOT
  // reach a full row above), and elevation never changes the reach -- the old 'row+2 only if
  // raised' gate measured the wrong quantity. See tools/measure-lever.
  const mk = (density) => {
    const m = mkMap(16, 16), ed = mkEd(m);
    Object.assign(ed, { _buildingAt: OH_EDITOR._buildingAt, _selectObjAt: OH_EDITOR._selectObjAt, _selName: OH_EDITOR._selName,
      _selHasSettings: OH_EDITOR._selHasSettings, _hoverName: OH_EDITOR._hoverName, _deviceAt: OH_EDITOR._deviceAt,
      _deviceReach: OH_EDITOR._deviceReach, _deviceLabel: OH_EDITOR._deviceLabel, _renderSelBar() {}, _hideSelBar() {} });
    ed.grid = { density };
    ed.world.redstone = [{ kind: 'lever', col: 6, row: 9, txId: 3, on: false }, { kind: 'lamp', col: 2, row: 2 }];
    return { m, ed };
  };

  const d1 = mk(1);
  d1.ed._selectObjAt(6, 9);
  ok(d1.ed._selEnt && d1.ed._selEnt.kind === 'device', 'density 1: an exact click selects the lever');
  ok(d1.ed._selHasSettings(d1.ed._selEnt), 'so the settings / move / delete bar is reachable');
  ok(d1.ed._selName(d1.ed._selEnt) === 'lever · Tx #3', 'the action bar names the transmitter channel');
  d1.ed._selEnt = null; d1.ed._selectObjAt(6, 10);
  ok(d1.ed._selEnt && d1.ed._selEnt.kind === 'device', 'density 1: clicking the base one row BELOW the anchor selects it');
  d1.ed._selEnt = null; d1.ed._selectObjAt(6, 8);
  ok(!d1.ed._selEnt || d1.ed._selEnt.kind !== 'device', 'density 1: one row ABOVE does NOT select (the sprite does not reach there)');
  d1.m.elevation[9][6] = 2; d1.ed._selEnt = null; d1.ed._selectObjAt(6, 8);
  ok(!d1.ed._selEnt || d1.ed._selEnt.kind !== 'device', 'density 1: raising the device does NOT extend the hit-area (density-driven, not elevation-gated)');

  const d4 = mk(4);
  d4.ed._selectObjAt(6, 7);
  ok(d4.ed._selEnt && d4.ed._selEnt.kind === 'device' && d4.ed._selEnt.ref.txId === 3, 'density 4: clicking the arm tip 2 rows ABOVE the anchor selects the lever (the reported bug)');
  ok(d4.ed._hoverName(6, 7) === 'lever · Tx #3', 'density 4: hovering the arm tip names the transmitter channel');
  d4.ed._selEnt = null; d4.ed._selectObjAt(6, 12);
  ok(d4.ed._selEnt && d4.ed._selEnt.kind === 'device', 'density 4: clicking the base 3 rows BELOW the anchor selects it');
  d4.ed._selEnt = null; d4.ed._selectObjAt(8, 9);
  ok(d4.ed._selEnt && d4.ed._selEnt.kind === 'device', 'density 4: clicking 2 cols to the side selects it');

  ok(d1.ed._deviceLabel({ kind: 'lamp' }) === 'lamp · Rx', 'a lamp reads "lamp · Rx", not a Tx number');
  ok(d1.ed._deviceLabel({ kind: 'dust', txId: 7 }) === 'dust', 'dust is plain wire - no channel, even with a legacy txId');
}

console.log('World schema migrator:');
{
  const S = require(require('path').join(__dirname, '..', 'js', 'overhead', 'overhead-settings.js')) && global.OH_SETTINGS;
  const old = { settings: {} }; global.OH_SETTINGS.migrate(old);
  ok(old.schemaVersion === global.OH_SETTINGS.SCHEMA, 'an old (unversioned) world is stamped to the current schema');
  ok(Array.isArray(old.gates) && Array.isArray(old.redstone), 'structure arrays (gates/redstone) are guaranteed after migrate');
  ok(old.settings.elevOffset === 0.5 && old.settings.lockZoom === false, 'new settings defaults reach an old world via migrate→resolve (elevOffset default is now 0.5 — Phase 2)');
  const fut = { schemaVersion: 99, settings: {} }; global.OH_SETTINGS.migrate(fut);
  ok(fut.schemaVersion === 99, 'a world from a NEWER build is loaded as-is (not downgraded)');
  const w = { settings: {} }; global.OH_SETTINGS.migrate(w); const v = w.schemaVersion; global.OH_SETTINGS.migrate(w);
  ok(w.schemaVersion === v, 'migrate is idempotent');
}

console.log('Customizable dual menu bars — layout model:');
{
  const ed = { _ALL_GROUPS: OH_EDITOR._ALL_GROUPS, _defaultLayout: OH_EDITOR._defaultLayout, _loadLayout: OH_EDITOR._loadLayout, _saveLayout: OH_EDITOR._saveLayout, _moveGroup: OH_EDITOR._moveGroup, _moveGroupToRail: OH_EDITOR._moveGroupToRail, _renderBar() {} };
  global.localStorage._d = {};
  ed._loadLayout();
  ok(ed._railLayout.left.length === ed._ALL_GROUPS.length && ed._railLayout.right.length === 0, 'default layout puts every palette on the LEFT rail');
  ed._moveGroupToRail('Redstone', 'right');
  ok(ed._railLayout.right.indexOf('Redstone') === 0 && ed._railLayout.left.indexOf('Redstone') < 0, 'a palette can move to the RIGHT rail');
  ok(ed._railLayout.rightWidth > 0, 'moving to the right rail gives it a width');
  ed._moveGroup('Mobs', 'Terrain');   // put Mobs just before Terrain
  ok(ed._railLayout.left.indexOf('Mobs') === ed._railLayout.left.indexOf('Terrain') - 1, 'a palette can be reordered within a rail');
  ed._saveLayout();
  const ed2 = { _ALL_GROUPS: OH_EDITOR._ALL_GROUPS, _defaultLayout: OH_EDITOR._defaultLayout, _loadLayout: OH_EDITOR._loadLayout };
  ed2._loadLayout();
  ok(ed2._railLayout.right.indexOf('Redstone') === 0, 'the layout persists (reloads from storage)');
  global.localStorage._d = {};
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
