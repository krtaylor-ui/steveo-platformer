// Headless tests for §E8 — SpeedRunnerStats (attempt counter + best-progress %).
// A tiny localStorage mock lets the storage helpers run under node.
global.localStorage = (() => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() };
})();
const { SpeedRunnerStats: S } = require('../js/speedrunner-mode.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

console.log('1 — progressPct is a clamped 0..100 fraction of the run length:');
{
  ok(S.progressPct(0, 0, 100) === 0, 'at spawn = 0%');
  ok(S.progressPct(50, 0, 100) === 50, 'halfway = 50%');
  ok(S.progressPct(100, 0, 100) === 100, 'at finish = 100%');
  ok(S.progressPct(150, 0, 100) === 100, 'past finish clamps to 100%');
  ok(S.progressPct(-10, 0, 100) === 0, 'before spawn clamps to 0%');
  ok(S.progressPct(50, 0, 0) === 0, 'zero-length run → 0% (no divide-by-zero)');
  // Non-zero spawn offset.
  ok(near(S.progressPct(300, 200, 400), 50), 'progress measured from spawn, not 0');
}

console.log('2 — attempt counter increments and persists per level:');
{
  ok(S.attempts('lvlA') === 0, 'unseen level starts at 0 attempts');
  ok(S.bumpAttempt('lvlA') === 1, 'first bump → 1');
  ok(S.bumpAttempt('lvlA') === 2, 'second bump → 2');
  ok(S.attempts('lvlA') === 2, 'attempts persists');
  ok(S.attempts('lvlB') === 0, 'a different level is independent');
}

console.log('3 — best-progress % only ever climbs:');
{
  ok(S.bestPct('lvlA') === 0, 'no best yet');
  ok(S.recordPct('lvlA', 40) === 40, 'first record sets 40%');
  ok(S.recordPct('lvlA', 25) === 40, 'a worse run does not lower the best');
  ok(S.recordPct('lvlA', 80) === 80, 'a better run raises the best');
  ok(S.bestPct('lvlA') === 80, 'best persists at 80%');
  ok(S.recordPct('lvlA', 100) === 100, 'a clear banks 100%');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
