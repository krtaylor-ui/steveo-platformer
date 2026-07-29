// Headless tests for the Overhead Map/World version-linking, Test-Mode overlay/
// validation, and Extract-Map tool.  node test/test-overhead-map.js
const { OH_MAP } = require('../js/overhead/overhead-map.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

// A 3×2 map: ground everywhere (id 1) except (2,1) empty; elevation raised at (0,0).
function mapV(version) {
  return OH_MAP.newMap({
    id: 'map1', version, gridW: 3, gridH: 2,
    ground:    [[1, 1, 1], [1, 1, 0]],
    elevation: [[1, 0, 0], [0, 0, 0]],
  });
}

console.log('Version-linking: snapshot is default, needsUpdate detects newer:');
{
  const m1 = mapV(1);
  const w = OH_MAP.newWorld({ id: 'w1', mapId: 'map1', mapVersion: 1, mapSnapshot: OH_MAP.deepCopyMap(m1),
    buildings: [{ typeId: 'core', col: 0, row: 0 }] });
  ok(OH_MAP.needsUpdate(w, mapV(1)) === false, 'same version → no update');
  ok(OH_MAP.needsUpdate(w, mapV(2)) === true, 'newer version → needs update');
  // Default play uses the snapshot, unaffected by the newer map.
  ok(w.mapSnapshot.version === 1, 'world still on snapshot v1 by default');
}

console.log('Test overlay is non-committing; relink is permanent:');
{
  const w = OH_MAP.newWorld({ id: 'w1', mapId: 'map1', mapVersion: 1, mapSnapshot: mapV(1) });
  const overlay = OH_MAP.testOverlay(w, mapV(2));
  ok(overlay._overlayActive && overlay.mapSnapshot.version === 2, 'overlay renders on the current map');
  ok(w.mapVersion === 1, 'overlay did NOT mutate the world (still v1)');
  const relinked = OH_MAP.relink(w, mapV(2));
  ok(relinked.mapVersion === 2 && relinked.mapSnapshot.version === 2, 'relink permanently adopts v2');
  ok(w.mapVersion === 1, 'relink returns a new object, original untouched');
}

console.log('Test-Mode placement validation flags floating / OOB / elevation shift:');
{
  const orig = mapV(1);
  const w = OH_MAP.newWorld({
    id: 'w1', mapId: 'map1', mapVersion: 1, mapSnapshot: orig,
    buildings: [{ typeId: 'core', col: 2, row: 1 },    // on empty ground → floating
                { typeId: 'shop', col: 9, row: 9 },     // out of bounds
                { typeId: 'healer', col: 0, row: 0 }],  // elevation raised — fine on v1
  });
  // Validate against a v2 map where (0,0) elevation dropped to 0.
  const m2 = mapV(2); m2.elevation[0][0] = 0;
  const r = OH_MAP.validatePlacement(w, m2);
  ok(r.ok === false, 'issues found');
  ok(r.issues.some((i) => i.kind === 'floating' && i.col === 2), 'floating building flagged');
  ok(r.issues.some((i) => i.kind === 'out-of-bounds'), 'OOB flagged');
  ok(r.issues.some((i) => i.kind === 'elevation-changed' && i.col === 0), 'elevation shift flagged');
}

console.log('validatePlacement flags overlap with solid terrain:');
{
  const m = mapV(1);
  const w = OH_MAP.newWorld({ mapSnapshot: m, mobs: [{ col: 1, row: 0 }] });
  const solid = (id) => id === 1;   // treat ground id 1 as solid for this test
  const r = OH_MAP.validatePlacement(w, m, solid);
  ok(r.issues.some((i) => i.kind === 'overlaps-solid' && i.col === 1), 'solid-terrain overlap flagged');
}

console.log('Extract Map — terrain always carried; mode-aware validity:');
{
  const src = OH_MAP.newWorld({
    mode: 'normal',
    mapSnapshot: mapV(1),
    buildings: [{ typeId: 'statue', col: 0, row: 0 }],
    items: [{ col: 1, row: 1, kind: 'coin' }],
    mobs: [{ col: 2, row: 0, type: 'zombie' }],
  });
  // → Platformer: everything allowed.
  let r = OH_MAP.extractMap(src, { destMode: 'platformer', includeStructures: true, includePlacedItems: true, includeMobs: true, includeRedstone: false });
  ok(r.map.gridW === 3 && r.map.ground.length === 2, 'terrain carried into the new Map');
  ok(r.carried.buildings.length === 1 && r.carried.items.length === 1 && r.carried.mobs.length === 1, 'platformer carries all');
  // → Arena: mobs convert to spawns.
  r = OH_MAP.extractMap(src, { destMode: 'arena', includeMobs: true });
  ok(!r.carried.mobs && r.carried.spawns && r.carried.spawns.length === 1 && r.carried.spawns[0].converted, 'arena converts mobs → spawns');
  ok(r.carried.droppedByMode.includes('mobs:converted'), 'conversion recorded');
  // → Tower Defense: mobs disallowed.
  r = OH_MAP.extractMap(src, { destMode: 'towerdefense', includeMobs: true });
  ok(!r.carried.mobs && !r.carried.spawns, 'TD drops free mobs');
  ok(r.carried.droppedByMode.some((s) => s.startsWith('mobs:dropped')), 'TD drop recorded');
  // Structures excluded when unchecked.
  r = OH_MAP.extractMap(src, { destMode: 'platformer', includeStructures: false });
  ok(r.map.decorations.length === 0 && !r.carried.buildings, 'structures excluded when unchecked');
}

console.log('extractValidity matrix:');
{
  ok(OH_MAP.extractValidity('moba').mobs === false, 'MOBA disallows free mobs');
  ok(OH_MAP.extractValidity('arena').mobs === 'convert', 'Arena converts');
  ok(OH_MAP.extractValidity('normal').mobs === true, 'Normal allows');
  ok(OH_MAP.extractValidity('anything-unknown').structures === true, 'unknown mode falls back sanely');
}

console.log(`\noverhead map: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
