// Headless tests for the Overhead mode rulesets + tower placement constraints.
//   node test/test-overhead-modes.js
const { OH_MODES } = require('../js/overhead/overhead-modes.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

console.log('Rulesets — data-driven elements per mode:');
{
  ok(OH_MODES.hasElement('platformer', 'goalStars'), 'platformer has goal stars');
  ok(OH_MODES.hasElement('towerdefense', 'towers') && OH_MODES.hasElement('towerdefense', 'waveSpawns'), 'TD has towers + waves');
  ok(OH_MODES.get('moba').elements.lanes === 3, 'MOBA defaults to 3 lanes');
  ok(OH_MODES.get('towerdefense').elements.mobPaths === 'fixed', 'TD mobs are fixed-path');
  ok(OH_MODES.get('moba').elements.mobPaths === 'fixed-then-roam', 'MOBA mobs fixed-then-roam');
  ok(OH_MODES.get('nonsense').elements.goalStars === true, 'unknown mode falls back to platformer');
  ok(OH_MODES.TOWER_ARCHETYPES.cannon.splash > 0, 'cannon has splash');
}

console.log('Tower placement — two-tier constraints (global + per-type):');
{
  const rs = OH_MODES.get('towerdefense');   // minSpacing 1, minDistanceFromPath 0
  const path = new Set(['5,5', '6,5', '7,5']);
  const ctx = { existingTowers: [{ col: 2, row: 2, type: 'arrow' }], pathCells: path, elevationAt: () => 0 };
  ok(OH_MODES.towerPlacementAllowed(rs, 'arrow', 2, 2, ctx).reason === 'occupied', 'cannot stack on an existing tower');
  ok(OH_MODES.towerPlacementAllowed(rs, 'arrow', 3, 2, ctx).reason === 'too-close', 'adjacent violates minSpacing 1');
  ok(OH_MODES.towerPlacementAllowed(rs, 'arrow', 4, 2, ctx).ok, '2-cell gap is allowed');
  ok(OH_MODES.towerPlacementAllowed(rs, 'arrow', 5, 5, ctx).reason === 'on-path', 'cannot build on the mob path');

  // Per-type override: a "floating" type ignores the distance-from-path rule.
  const rs2 = { placement: { global: { minSpacing: 0, minDistanceFromPath: 2 },
                             perType: { floating: { minDistanceFromPath: 0 } } } };
  const ctx2 = { existingTowers: [], pathCells: new Set(['5,5']), elevationAt: () => 0 };
  ok(OH_MODES.towerPlacementAllowed(rs2, 'arrow', 6, 5, ctx2).reason === 'too-near-path', 'normal tower blocked near path');
  ok(OH_MODES.towerPlacementAllowed(rs2, 'floating', 6, 5, ctx2).ok, 'floating type overrides the path-distance rule');
}

console.log('Tower placement — elevation restriction:');
{
  const rs = { placement: { global: { minSpacing: 0, allowedElevations: [0] }, perType: {} } };
  const ctx = { existingTowers: [], pathCells: new Set(), elevationAt: (c) => (c === 9 ? 2 : 0) };
  ok(OH_MODES.towerPlacementAllowed(rs, 'arrow', 1, 1, ctx).ok, 'allowed on elevation 0');
  ok(OH_MODES.towerPlacementAllowed(rs, 'arrow', 9, 1, ctx).reason === 'bad-elevation', 'blocked on elevation 2');
}

console.log('MOBA minion target priority:');
{
  const pri = OH_MODES.get('moba').minion.targetPriority;   // minion→player→tower→core
  ok(OH_MODES.pickMinionTarget(pri, { minion: [{ id: 'm' }], player: [{ id: 'p' }] }).kind === 'minion', 'prefers minions');
  ok(OH_MODES.pickMinionTarget(pri, { tower: [{ id: 't' }], core: [{ id: 'c' }] }).kind === 'tower', 'tower before core');
  ok(OH_MODES.pickMinionTarget(pri, {}) === null, 'no candidates → null');
}

console.log(`\noverhead modes: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
