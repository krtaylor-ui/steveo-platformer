// Headless tests for §Epic MB — the Beat Grid pure core (tap-tempo + time→distance).
const { BEAT_GRID: B } = require('../js/beat-grid.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

console.log('1 — tapTempo: BPM from tap intervals:');
{
  ok(B.tapTempo([]) === 0 && B.tapTempo([100]) === 0, '<2 taps → 0');
  // 120 BPM = 500ms/beat.
  ok(B.tapTempo([0, 500, 1000, 1500]) === 120, '4 taps 500ms apart → 120 BPM');
  ok(B.tapTempo([0, 1000]) === 60, '1000ms interval → 60 BPM');
  // Slightly uneven taps average out.
  ok(Math.abs(B.tapTempo([0, 480, 1010, 1500]) - 120) <= 3, 'uneven taps average near 120');
}

console.log('2 — beatMs / beatTimes:');
{
  ok(B.beatMs(120) === 500, '120 BPM → 500 ms/beat');
  ok(B.beatMs(0) === 0, '0 BPM → 0');
  const times = B.beatTimes(120, 250, 3);
  ok(times.length === 3 && times[0] === 250 && times[1] === 750 && times[2] === 1250, 'beat times step from the offset');
}

console.log('3 — beatXs: distance = start + speed × time (constant speed):');
{
  // 120 BPM, no offset, start x=100, 200 px/sec.
  const xs = B.beatXs(120, 0, 100, 200, 3);
  ok(xs[0] === 100, 'beat 0 at start x');
  ok(xs[1] === 200, 'beat 1 at +100px (0.5s × 200)');
  ok(xs[2] === 300, 'beat 2 at +200px');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
