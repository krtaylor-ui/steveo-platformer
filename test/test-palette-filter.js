// Headless tests for §E13 (§15) — the "Other" palette mode-filter predicate.
const { otherItemVisibleInMode: vis } = require('../js/palette-filter.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

const universal = { kind: 'block', blockType: 1 };                 // no modes
const arenaObj  = { kind: 'arenaobj', modes: ['arena'] };
const goal      = { kind: 'block', modes: ['normal', 'platformer', 'speedrunner'] };
const srItem    = { kind: 'block', modes: ['speedrunner'] };

console.log('1 — universal items (no modes) show in every mode:');
{
  for (const m of ['normal', 'platformer', 'speedrunner', 'arena', null, 'sandbox']) ok(vis(universal, m), `universal shows in ${m}`);
}

console.log('2 — mode-tagged items show only in their modes:');
{
  ok(vis(arenaObj, 'arena'), 'arena objective shows in arena');
  ok(!vis(arenaObj, 'speedrunner'), 'arena objective hidden in speed runner');
  ok(!vis(arenaObj, 'normal'), 'arena objective hidden in normal');
  ok(vis(goal, 'speedrunner') && vis(goal, 'platformer') && vis(goal, 'normal'), 'goal shows in its three modes');
  ok(!vis(goal, 'arena'), 'goal hidden in arena');
  ok(vis(srItem, 'speedrunner') && !vis(srItem, 'platformer'), 'SR-only item scoped to speed runner');
}

console.log('3 — sandbox / null / unknown world mode shows everything (design any mode):');
{
  ok(vis(arenaObj, 'sandbox'), 'sandbox shows arena objective');
  ok(vis(arenaObj, null), 'null worldMode shows arena objective');
  ok(vis(srItem, undefined), 'undefined worldMode shows SR item');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
