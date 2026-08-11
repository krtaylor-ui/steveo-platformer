// Headless tests for §Spike Orientation (E12 / §14) — the pure SPIKE_ORIENT module: which orientations
// are valid in a given neighbour context, the default inferred from the surface, the right-click cycle
// that TERMINATES in a remove (not a wrap), and the orientation-aware hazard sub-rect.
const { SPIKE_ORIENT: SO } = require('../js/spike-orient.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + ` (got ${JSON.stringify(a)})`);

console.log('1 — valid orientations point AWAY from each solid face:');
{
  eq(SO.validFor({ down: true }),  ['up'],    'solid below → up (floor spike)');
  eq(SO.validFor({ up: true }),    ['down'],  'solid above → down (ceiling spike)');
  eq(SO.validFor({ right: true }), ['left'],  'solid on the right → points left');
  eq(SO.validFor({ left: true }),  ['right'], 'solid on the left → points right');
}

console.log('2 — several solids give several valid orientations; a floating spike allows any:');
{
  eq(SO.validFor({ down: true, left: true }), ['up', 'right'], 'floor+left-wall corner → up then right');
  eq(SO.validFor({}), ['up', 'down', 'left', 'right'], 'no surface → all four valid');
}

console.log('3 — default is the first valid = inferred from the surface:');
{
  ok(SO.defaultFor({ down: true }) === 'up', 'default on a floor = up');
  ok(SO.defaultFor({ up: true }) === 'down', 'default on a ceiling = down');
  ok(SO.defaultFor({}) === 'up', 'default floating = up');
}

console.log('4 — right-click cycle walks the valid set, then REMOVES (terminal, not a wrap):');
{
  const valid = ['up', 'right'];   // floor + left wall
  ok(SO.nextOrRemove('up', valid) === 'right', 'up → right');
  ok(SO.nextOrRemove('right', valid) === null, 'past the last valid → remove (null)');
  // single-valid context: one click past the only orientation removes it.
  ok(SO.nextOrRemove('up', ['up']) === null, 'single valid orientation → next click removes');
  // context changed out from under the stored dir → snap to the first valid instead of removing.
  ok(SO.nextOrRemove('down', ['up', 'right']) === 'up', 'stale dir snaps to first valid');
}

console.log('5 — hazard sub-rect covers the exposed 75% toward the tips:');
{
  const s = 32, t = 24;
  eq(SO.hazardRect('up', s),    { x: 0, y: s - t, w: s, h: t }, 'up → bottom 75%');
  eq(SO.hazardRect('down', s),  { x: 0, y: 0, w: s, h: t },     'down → top 75%');
  eq(SO.hazardRect('left', s),  { x: 0, y: 0, w: t, h: s },     'left → left 75%');
  eq(SO.hazardRect('right', s), { x: s - t, y: 0, w: t, h: s }, 'right → right 75%');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
