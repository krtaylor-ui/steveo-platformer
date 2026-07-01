// Replicates _onArenaPauseChange + _arenaElapsedMs with a fake clock to prove
// the arena timer freezes while paused and resumes correctly.
let NOW = 1000;
const clock = () => NOW;
const a = { gameStartTime: 1000, endTime: null, pausedAt: null, pausedTotal: 0, countdownStart: null };
const isArena = true;
function onPause(paused) {
  if (!isArena) return;
  if (paused) { if (!a.pausedAt) a.pausedAt = clock(); }
  else if (a.pausedAt) {
    const seg = clock() - a.pausedAt;
    if (a.gameStartTime) a.pausedTotal = (a.pausedTotal || 0) + seg;
    else if (a.countdownStart) a.countdownStart += seg;
    a.pausedAt = null;
  }
}
function elapsed() {
  if (!a || !a.gameStartTime) return 0;
  const end = a.endTime || clock();
  const livePause = a.pausedAt ? (clock() - a.pausedAt) : 0;
  return Math.max(0, end - a.gameStartTime - (a.pausedTotal || 0) - livePause);
}
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

NOW = 6000; ok(elapsed() === 5000, `5s elapsed before pause (got ${elapsed()})`);
onPause(true);                     // pause at t=6000 (5s in)
NOW = 6000 + 10000;                // 10s pass while paused
ok(elapsed() === 5000, `timer FROZEN during pause (got ${elapsed()})`);
NOW = 16000 + 3000;                // 13s of pause total
ok(elapsed() === 5000, `still frozen deeper into pause (got ${elapsed()})`);
onPause(false);                    // resume at t=19000
ok(elapsed() === 5000, `no jump on resume (got ${elapsed()})`);
NOW += 2000;                       // play 2 more seconds
ok(elapsed() === 7000, `resumes counting (got ${elapsed()})`);

// second pause cycle accumulates correctly
onPause(true); NOW += 5000; ok(elapsed() === 7000, `2nd pause frozen (got ${elapsed()})`);
onPause(false); NOW += 1000; ok(elapsed() === 8000, `after 2nd resume (got ${elapsed()})`);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
