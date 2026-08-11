// Headless tests for §A2 — the level finish/goal validator (migration-free gate for Live/Published).
const V = require('../js/level-validator.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

console.log('1 — 2D grid: a BLOCK.GOAL(10) cell counts as a finish:');
{
  const withGoal = { grid: [[0, 0, 1], [0, 10, 0]] };
  const noGoal   = { grid: [[0, 0, 1], [0, 2, 0]] };
  ok(V.hasFinish(withGoal), 'grid with a GOAL cell has a finish');
  ok(!V.hasFinish(noGoal), 'grid without a GOAL cell has no finish');
}

console.log('2 — overhead: world.goal or a building/portal isGoal counts:');
{
  ok(V.hasFinish({ goal: { col: 5, row: 5, color: 0 } }), 'overhead world.goal counts');
  ok(V.hasFinish({ buildings: [{ typeId: 'portal', config: { isGoal: true } }] }), 'a portal flagged isGoal counts');
  ok(V.hasFinish({ buildings: [{ typeId: 'statue', isGoal: true }] }), 'a top-level isGoal flag counts');
  ok(!V.hasFinish({ buildings: [{ typeId: 'portal', config: { isGoal: false } }] }), 'a non-goal portal does not count');
}

console.log('3 — empty / malformed data has no finish:');
{
  ok(!V.hasFinish(null), 'null → no finish');
  ok(!V.hasFinish({}), 'empty object → no finish');
  ok(!V.hasFinish({ grid: [] }), 'empty grid → no finish');
}

console.log('4 — canGoLive gates with a friendly reason:');
{
  ok(V.canGoLive({ grid: [[10]] }).ok, 'a level with a goal can go live');
  const r = V.canGoLive({ grid: [[0]] });
  ok(!r.ok && /Goal/.test(r.reason), 'a level without a goal is blocked with a reason');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
