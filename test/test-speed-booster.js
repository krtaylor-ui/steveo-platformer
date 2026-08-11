// Headless tests for the §Speed Boost Zone (E6) pure effect model — SPEED_BOOSTER_FX.
// Verifies the movement multiplier, the temporary linger+decay, and the permanent latch.
const { SPEED_BOOSTER_FX: FX } = require('../js/speed-booster.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

console.log('1 — no overlap → multiplier stays 1:');
{
  const s = {};
  ok(FX.step(s, null) === 1, 'idle frame returns 1');
  ok(FX.step(s, null) === 1, 'still 1 after a second idle frame');
}

console.log('2 — temporary boost holds full strength while overlapping, then lingers & decays:');
{
  const s = {};
  const cfg = { mode: 'temp', amount: 0.5, durSec: 3 };
  // While overlapping, held at +50%.
  ok(near(FX.step(s, cfg, 10), 1.5), 'on-block frame → 1.5x');
  ok(near(FX.step(s, cfg, 10), 1.5), 'still 1.5x while overlapping');
  // Leave the block: it lingers durSec*fps = 30 frames then snaps back.
  let m = 1.5, frames = 0;
  while (frames < 40) { m = FX.step(s, null, 10); frames++; if (m === 1) break; }
  ok(m === 1, 'temporary boost eventually decays back to 1 after leaving');
  ok(frames >= 29 && frames <= 31, `linger lasts ~durSec*fps frames (got ${frames})`);
}

console.log('3 — permanent boost latches and survives leaving the block:');
{
  const s = {};
  const cfg = { mode: 'perm', amount: 1.0 };
  ok(near(FX.step(s, cfg), 2.0), 'on-block → 2.0x');
  let m = 2.0;
  for (let i = 0; i < 300; i++) m = FX.step(s, null);   // 5 seconds off the block
  ok(near(m, 2.0), 'permanent boost persists indefinitely off the block');
  ok(near(FX.reset(s), 1) && s.permMult === 1, 'reset() clears the permanent latch');
}

console.log('4 — max(perm,temp): a weaker temp never lowers a stronger perm:');
{
  const s = {};
  FX.step(s, { mode: 'perm', amount: 1.0 });           // perm 2.0x
  const m = FX.step(s, { mode: 'temp', amount: 0.25 }); // temp 1.25x
  ok(near(m, 2.0), 'effective multiplier takes the stronger of perm/temp');
}

console.log('5 — DEFAULTS drive an unconfigured booster:');
{
  const s = {};
  const m = FX.step(s, FX.DEFAULTS, 10);
  ok(near(m, 1 + FX.DEFAULTS.amount), 'default booster applies the default amount');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
