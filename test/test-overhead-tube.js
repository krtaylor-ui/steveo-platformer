// Overhead GLASS TUBE (O4) — a linked-pair transport that flies the player along a visible tube.
//   node test/test-overhead-tube.js
// Covers: tube is indexed for transit; _startTubeFly seeds per-player fly state; _updateTubeFly lerps
// then finishes at the destination; two players fly independently; _triggerTransit routes a tube to a
// fly and groupTravel pulls a nearby second player.
global.window = global;
global.CANVAS_W = 800; global.CANVAS_H = 500; global.GAME_VERSION = 'v3 build 420 (tube test)';
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
const OverheadGame = global.OverheadGame, OH_SETTINGS = global.OH_SETTINGS, OH_BUILDINGS = global.OH_BUILDINGS;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

function mk(over) {
  const W = 24, H = 20, ground = [], elevation = [];
  for (let r = 0; r < H; r++) { ground.push(new Array(W).fill('grass')); elevation.push(new Array(W).fill(0)); }
  return Object.assign({
    name: 'tube', mode: 'platformer', viewMode: 'overhead', gameModeDefault: 'PLT', controlScheme: 'free-aim', rules: {},
    mapSnapshot: { gridW: W, gridH: H, density: 1, baseW: W, baseH: H, cell: 32, objectScaleMode: 'independent', ground, elevation, decorations: [] },
    buildings: [
      { typeId: 'tube', col: 3, row: 3, config: { dest: '16,14' } },
      { typeId: 'tube', col: 16, row: 14, config: { dest: '3,3' } },
    ],
    mobs: [], items: [], spawns: [{ col: 3, row: 4 }, { col: 4, row: 4 }], ramps: [], bridges: [], redstone: [],
    goal: { col: 21, row: 17, color: 0 }, settings: OH_SETTINGS.defaults(),
  }, over || {});
}

console.log('Glass Tube — registry + transit indexing:');
{
  ok(!!OH_BUILDINGS.get('tube'), 'tube building type is registered');
  ok(OH_BUILDINGS.get('tube').glassTube === true, 'tube is flagged glassTube');
  const g = new OverheadGame(mk(), { testMode: true, numPlayers: 2 }, () => {});
  ok(g._portalByKey.get('3,3') && g._portalByKey.get('16,14'), 'both tube endpoints are indexed for transit');
}

console.log('Glass Tube — fly seed / advance / finish:');
{
  const g = new OverheadGame(mk(), { testMode: true, numPlayers: 2 }, () => {});
  const p = g.players[0];
  const db = g._portalByKey.get('16,14'), dfp = OH_BUILDINGS.footprintOf('tube', g._density);
  const dest = { px: (db.col + dfp.w / 2) * g.grid.cell, py: (db.row + dfp.h + 0.5) * g.grid.cell, key: '16,14' };
  g._startTubeFly(p, g._portalByKey.get('3,3'), dest);
  ok(p._tube && p._tube.dur > 0, 'fly state seeded with a positive duration');
  const sx = p._tube.sx, sy = p._tube.sy;
  ok(Math.abs(p.x - sx) < 1 && Math.abs(p.y - sy) < 1, 'player starts at the entry endpoint');
  // advance one step -> moved toward the exit
  g._updateTubeFly(p);
  ok(Math.hypot(p.x - dest.px, p.y - dest.py) < Math.hypot(sx - dest.px, sy - dest.py), 'player moves toward the exit each frame');
  // run to completion
  let guard = 0; while (p._tube && guard++ < 500) g._updateTubeFly(p);
  ok(!p._tube, 'fly ends (state cleared)');
  ok(Math.abs(p.x - dest.px) < 1 && Math.abs(p.y - dest.py) < 1, 'player lands exactly at the exit endpoint');
  ok(p._portalCd === true, 'arrival cooldown set so the exit does not instantly re-trigger');
}

console.log('Glass Tube — per-player (2-4 fly independently) + groupTravel:');
{
  const g = new OverheadGame(mk(), { testMode: true, numPlayers: 2 }, () => {});
  const p1 = g.players[0], p2 = g.players[1];
  const mkDest = (key) => { const db = g._portalByKey.get(key), f = OH_BUILDINGS.footprintOf('tube', g._density); return { px: (db.col + f.w / 2) * g.grid.cell, py: (db.row + f.h + 0.5) * g.grid.cell, key }; };
  g._startTubeFly(p1, g._portalByKey.get('3,3'), mkDest('16,14'));
  g._startTubeFly(p2, g._portalByKey.get('16,14'), mkDest('3,3'));
  ok(p1._tube && p2._tube && p1._tube !== p2._tube, 'both players fly at once with independent state');
  g._updateTubeFly(p1);
  ok(!!p2._tube, 'advancing P1 does not disturb P2 (no shared/global transit state)');

  // groupTravel: P1 uses a tube with a P2 standing right next to the mouth -> both fly.
  const g2 = new OverheadGame(mk({ buildings: [{ typeId: 'tube', col: 3, row: 3, config: { dest: '16,14', groupTravel: true } }, { typeId: 'tube', col: 16, row: 14, config: {} }] }), { testMode: true, numPlayers: 2 }, () => {});
  const a = g2.players[0], b = g2.players[1];
  a.x = (3 + 1) * g2.grid.cell; a.y = (3 + 1) * g2.grid.cell;   // near the (3,3) tube centre
  b.x = a.x + 4; b.y = a.y + 4;                                  // P2 right beside the mouth
  const db2 = g2._portalByKey.get('16,14'), f2 = OH_BUILDINGS.footprintOf('tube', g2._density);
  g2._triggerTransit(a, g2._portalByKey.get('3,3'), { px: (db2.col + f2.w / 2) * g2.grid.cell, py: (db2.row + f2.h + 0.5) * g2.grid.cell, key: '16,14' });
  ok(!!a._tube, 'triggering a tube flies the acting player');
  ok(!!b._tube, 'groupTravel pulls the nearby second player into the tube too');
}

console.log(`\noverhead glass tube: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
