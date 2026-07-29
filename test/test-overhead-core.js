// Headless tests for the Overhead Engine core substrate: grid/zoom, elevation/
// autotile, building taxonomy.  node test/test-overhead-core.js
const { OH_GRID } = require('../js/overhead/overhead-grid.js');
const { OH_ELEV } = require('../js/overhead/overhead-elevation.js');
const { OH_BUILDINGS } = require('../js/overhead/overhead-buildings.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

console.log('GRID — dimensions, cells, sub-cells:');
{
  const g = OH_GRID.make({ gridW: 40, gridH: 30, density: 2 });
  ok(OH_GRID.pixelWidth(g) === 40 * 32, 'pixel width = gridW*cell');
  ok(OH_GRID.pixelHeight(g) === 30 * 32, 'pixel height');
  ok(OH_GRID.subCellPx(g) === 16, 'density 2 → 16px sub-cell');
  ok(OH_GRID.cellAt(g, 70, 40).col === 2 && OH_GRID.cellAt(g, 70, 40).row === 1, 'cellAt floors to cell');
  ok(OH_GRID.subCellAt(g, 70, 40).sc === 4, 'subCellAt uses density');
  ok(OH_GRID.inBounds(g, 39, 29) && !OH_GRID.inBounds(g, 40, 0), 'inBounds');
  ok(OH_GRID.density = g.density === 2, 'density fixed on the grid');
}

console.log('GRID — zoom + world/screen round-trip:');
{
  const g = OH_GRID.make({ gridW: 40, gridH: 30, masterZoom: 2 });
  const cam = { x: 100, y: 50 };
  const s = OH_GRID.worldToScreen(g, cam, 132, 82);
  ok(s.x === 64 && s.y === 64, 'worldToScreen applies cam + zoom');
  const w = OH_GRID.screenToWorld(g, cam, s.x, s.y);
  ok(near(w.x, 132) && near(w.y, 82), 'screenToWorld inverts worldToScreen');
  OH_GRID.zoomBy(g, 10);
  ok(g.masterZoom === OH_GRID.MAX_ZOOM, 'zoom clamps to MAX');
  OH_GRID.zoomBy(g, 0.001);
  ok(g.masterZoom === OH_GRID.MIN_ZOOM, 'zoom clamps to MIN');
}

console.log('GRID — camera clamps to world bounds (scrolling):');
{
  const g = OH_GRID.make({ gridW: 100, gridH: 100, masterZoom: 1 });   // 3200×3200 world
  let cam = OH_GRID.clampCamera(g, { x: -500, y: -500 }, 800, 500);
  ok(cam.x === 0 && cam.y === 0, 'clamps top-left to 0');
  cam = OH_GRID.clampCamera(g, { x: 99999, y: 99999 }, 800, 500);
  ok(cam.x === 3200 - 800 && cam.y === 3200 - 500, 'clamps bottom-right to world edge');
  // Small world (smaller than the view) centers.
  const gs = OH_GRID.make({ gridW: 10, gridH: 5, masterZoom: 1 });     // 320×160
  cam = OH_GRID.clampCamera(gs, { x: 0, y: 0 }, 800, 500);
  ok(cam.x === (320 - 800) / 2, 'small world centered horizontally');
}

console.log('GRID — object scale mode:');
{
  ok(OH_GRID.objectScale(OH_GRID.make({ density: 2, objectScaleMode: 'independent' })) === 1, 'independent = 1');
  ok(OH_GRID.objectScale(OH_GRID.make({ density: 4, objectScaleMode: 'track' })) === 0.25, 'track scales with density');
}

console.log('ELEV — y-offset + cliff + draw order:');
{
  ok(OH_ELEV.yOffset(3) === -3 * OH_ELEV.STEP_PX, 'yOffset lifts up per level');
  ok(OH_ELEV.cliffHeight(2, 0) === 2 * OH_ELEV.STEP_PX, 'cliff height = drop×step');
  ok(OH_ELEV.cliffHeight(1, 2) === 0, 'no cliff when neighbour is higher');
  const sorted = OH_ELEV.sortForDraw([{ row: 5, level: 0 }, { row: 3, level: 2 }, { row: 5, level: 1 }]);
  ok(sorted[0].row === 3, 'lower row draws first (behind)');
  ok(sorted[1].level === 0 && sorted[2].level === 1, 'same row: lower elevation draws first');
}

console.log('ELEV — autotile edge bitmask:');
{
  // A plateau cell at level 1; ground (level 0) to the S and E → bits S|E set.
  const getLevel = (c, r) => {
    if (c === 0 && r === 0) return 1;   // our cell
    if (c === 1 && r === 0) return 0;   // east lower
    if (c === 0 && r === 1) return 0;   // south lower
    if (c === -1 && r === 0) return 1;  // west same
    if (c === 0 && r === -1) return 1;  // north same
    return 1;
  };
  const m = OH_ELEV.edgeBitmask(0, 0, 1, getLevel);
  ok((m & OH_ELEV.E) && (m & OH_ELEV.S), 'east + south edges detected');
  ok(!(m & OH_ELEV.N) && !(m & OH_ELEV.W), 'north + west not edges');
  // Out-of-bounds neighbour counts as lower (exposed edge).
  ok(OH_ELEV.edgeBitmask(0, 0, 1, () => null) === (OH_ELEV.N | OH_ELEV.E | OH_ELEV.S | OH_ELEV.W), 'OOB = all edges');
}

console.log('ELEV — auto-climb tiers + ramps:');
{
  ok(OH_ELEV.autoClimbAllows(0, 0, 'disabled') === true, 'same level always ok');
  ok(OH_ELEV.autoClimbAllows(0, 1, 'disabled') === false, 'disabled blocks any step');
  ok(OH_ELEV.autoClimbAllows(0, 1, '1') === true && OH_ELEV.autoClimbAllows(0, 2, '1') === false, '1-level tier');
  ok(OH_ELEV.autoClimbAllows(0, 2, '2') === true, '2-level tier');
  ok(OH_ELEV.autoClimbAllows(0, 9, 'unlimited') === true, 'unlimited');
  const ramp = { lowLevel: 0, highLevel: 1 };
  ok(OH_ELEV.rampAllows(ramp, 0, 1) && OH_ELEV.rampAllows(ramp, 1, 0), 'ramp bridges both directions');
  ok(!OH_ELEV.rampAllows(ramp, 0, 2), 'ramp only bridges its declared levels');
  ok(OH_ELEV.losBlocked() === false, 'LOS stub returns false (architected, not implemented)');
}

console.log('BUILDINGS — registry + placement + skins + footprint:');
{
  ok(OH_BUILDINGS.get('portal').interactionType === 'enter', 'portal is enter-type');
  ok(OH_BUILDINGS.get('savepoint').blocksMovement === false, 'savepoint is walkable');
  ok(OH_BUILDINGS.byCategory('Tower').length >= 1, 'tower category present');
  const inst = OH_BUILDINGS.place('core', 5, 6);
  ok(inst && inst.typeId === 'core', 'place returns an instance');
  ok(OH_BUILDINGS.footprintCells(inst).length === 36, 'core footprint = 6×6 = 36 cells');
  const p = OH_BUILDINGS.place('portal', 0, 0);
  const s0 = p.skin; OH_BUILDINGS.cycleSkin(p);
  ok(p.skin !== s0, 'cycleSkin advances the skin variant');
  ok(OH_BUILDINGS.place('nope', 0, 0) === null, 'unknown type → null');
}

console.log(`\noverhead core: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
