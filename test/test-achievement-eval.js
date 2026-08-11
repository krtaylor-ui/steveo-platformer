// Headless tests for §Epic D — the per-level achievement evaluator (ACHIEVEMENT_EVAL).
const { ACHIEVEMENT_EVAL: A } = require('../js/achievement-eval.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

console.log('1 — each template predicate:');
{
  ok(A.satisfied({ type: 'collect', item: 'coin', count: 5 }, { collected: { coin: 5 } }), 'collect met at exactly N');
  ok(!A.satisfied({ type: 'collect', item: 'coin', count: 5 }, { collected: { coin: 4 } }), 'collect not met below N');
  ok(A.satisfied({ type: 'defeat', count: 3 }, { mobKills: 4 }), 'defeat met above N');
  ok(A.satisfied({ type: 'time', seconds: 30 }, { completed: true, completionMs: 29000 }), 'time met under limit');
  ok(!A.satisfied({ type: 'time', seconds: 30 }, { completed: true, completionMs: 31000 }), 'time not met over limit');
  ok(!A.satisfied({ type: 'time', seconds: 30 }, { completed: false, completionMs: 1000 }), 'time never fires before completion');
  ok(A.satisfied({ type: 'nojump', max: 2 }, { completed: true, jumpCount: 2 }), 'nojump met at the cap');
  ok(!A.satisfied({ type: 'nojump', max: 2 }, { completed: true, jumpCount: 3 }), 'nojump fails over the cap');
  ok(A.satisfied({ type: 'nodamage' }, { completed: true, tookHazardDamage: false }), 'nodamage met when unhurt');
  ok(!A.satisfied({ type: 'nodamage' }, { completed: true, tookHazardDamage: true }), 'nodamage fails when hurt');
}

console.log('2 — unknown types never fire:');
{
  ok(!A.satisfied({ type: 'bogus' }, { completed: true }), 'unknown type → false');
  ok(A.satisfied(null, {}) === false, 'null def → false');
}

console.log('3 — evaluate() returns satisfied defs, capped at 3:');
{
  const defs = [
    { type: 'defeat', count: 1 },              // met
    { type: 'nodamage' },                       // met
    { type: 'time', seconds: 5 },               // not met (61s)
    { type: 'collect', item: 'coin', count: 1 },// would be met but beyond the 3-cap
  ];
  const stats = { mobKills: 2, tookHazardDamage: false, completed: true, completionMs: 61000, collected: { coin: 9 } };
  const got = A.evaluate(defs, stats);
  ok(got.length === 2, 'two of the first three satisfied');
  ok(got.some(d => d.type === 'defeat') && got.some(d => d.type === 'nodamage'), 'the right two');
}

console.log('4 — label() builds readable text + honors a custom name:');
{
  ok(/Collect 3/.test(A.label({ type: 'collect', item: 'apple', count: 3 })), 'collect label');
  ok(A.label({ type: 'defeat', count: 5, name: 'Boss Slayer' }) === 'Boss Slayer', 'custom name wins');
}

console.log('5 — freshStats shape:');
{
  const s = A.freshStats();
  ok(s.mobKills === 0 && s.jumpCount === 0 && s.tookHazardDamage === false && s.completed === false, 'fresh accumulator zeroed');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
