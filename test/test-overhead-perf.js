// Frame budget, adaptive quality and the pre-launch estimate (build 359).
//   node test/test-overhead-perf.js
// Kevin's report: a density-4 100x70 world starts near 8fps, hits 60 zoomed all the way in,
// and sits ~30 zoomed out — with nothing changed but the zoom. Cause: the expensive passes
// are PER VISIBLE CELL and the visible-cell count grows as zoom^-2.
const path = require('path');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const P = require(path.join(__dirname, '..', 'js', 'overhead', 'overhead-perf.js'));

// Kevin's actual world: 100x70 blocks at density 4 = 400x280 cells, live shadows + day/night.
const world = (over) => Object.assign({
  mapSnapshot: { gridW: 400, gridH: 280, density: 4, cell: 8, baseW: 100, baseH: 70 },
  settings: { shadowStyle: 'live', dayNight: true },
  mobs: new Array(12), redstone: new Array(30),
}, over || {});
const view = { viewW: 1526, viewH: 804 };
const at = (zoom, over) => P.estimate(world(over), Object.assign({ zoom }, view));

console.log('The estimate reproduces the reported curve:');
const zOut = at(0.5), zMid = at(1), zIn = at(3);
ok(zOut.visible > zMid.visible && zMid.visible > zIn.visible, 'visible cells fall as you zoom in');
ok(zIn.fps > zMid.fps && zMid.fps > zOut.fps, `fps rises as you zoom in (${zOut.fps} -> ${zMid.fps} -> ${zIn.fps})`);
ok(zIn.fps >= 55, 'zoomed right in is smooth, as Kevin sees (60)');
ok(zOut.band === 'heavy', 'zoomed right out is flagged heavy');
// Quadratic, not linear: halving zoom should roughly quadruple the cells.
const r = at(0.5).visible / at(1).visible;
ok(r > 2.5, `cost scales with zoom^-2, not zoom^-1 (x${r.toFixed(1)} for half the zoom)`);

console.log('Shadow style is the single biggest lever:');
const live = at(1), fixed = at(1, { settings: { shadowStyle: 'fixed', dayNight: true } });
ok(fixed.fps > live.fps, `Fixed shadows beat live (${live.fps} -> ${fixed.fps} fps)`);
ok(fixed.cost < live.cost / 2, 'and cost less than half as much per frame');
const noNight = at(1, { settings: { shadowStyle: 'fixed', dayNight: false } });
ok(noNight.fps >= fixed.fps, 'turning day/night off helps again');

console.log('Warnings are specific and actionable:');
const w = at(0.5).warnings.join(' | ');
ok(/Live shadows on [\d,]+ visible cells/.test(w), 'it names the live-shadow cost with a real number');
ok(/Fixed/.test(w), 'and says what to change');
ok(/100×70 map at density 4 is 400×280 = 112,000 cells/.test(w),
   'the density warning states BLOCKS and CELLS correctly (gridW is already density-multiplied)');
// The verdict is separate from the warnings: a world can be comfortable at this zoom AND
// still carry a standing note about its size. Suppressing the good news reads as alarming.
ok(/Comfortable at this zoom/.test(at(3).verdict), 'a cheap world says so plainly in its verdict');
ok(/Heavy/.test(at(0.5).verdict), 'and a heavy one says that');
ok(at(3).warnings.length > 0, 'while the standing size note still stands alongside it');
const many = at(1, { mobs: new Array(90) });
ok(many.warnings.some((x) => /90 mobs/.test(x)), 'too many mobs is flagged');
const busy = at(1, { redstone: new Array(200) });
ok(busy.warnings.some((x) => /200 redstone devices/.test(x)), 'a huge redstone network is flagged');

console.log('Governor: settles, and prefers a steady cap over stripping the look:');
{
  const g = P.makeGovernor({ cap: 60 });
  const cost = () => ({ full: 34, noglare: 28, baked: 15, noshadow: 12, flat: 9 })[g.cfg().id] || 10;
  const seen = [];
  for (let i = 0; i < 900; i++) { g.sample(cost()); if (g.reason && seen[seen.length - 1] !== g.reason) seen.push(g.reason); }
  ok(seen.length > 0, 'it reacts to a world it cannot hold at 60');
  ok(/No glass glare/.test(seen[0]), 'the CHEAPEST visual goes first (glare), not shadows');
  ok(seen.some((x) => /capped to \d+fps/.test(x)), 'then it lowers the cap rather than stripping more');
  ok(!seen.some((x) => /No shadows/.test(x)), 'shadows survive when a lower cap is enough — the designer chose them');
  ok(g.cap <= 45, `it settled on a steady cap (${g.cap}fps)`);
  ok(seen.length <= 4, `and settled quickly rather than flapping (${seen.length} changes in 900 frames)`);
}
{
  // A world so heavy that even 30fps cannot be held must end up at minimum quality.
  const g = P.makeGovernor({ cap: 60 });
  for (let i = 0; i < 3000; i++) g.sample(200);
  ok(g.tier === P.TIERS.length - 1, 'a hopeless world falls all the way to the flattest tier');
  ok(g.cap === 30, 'and holds 30fps');
  ok(/too heavy/.test(g.reason), 'and says so plainly, so a designer knows to change the world');
}
{
  // A cheap world must NOT be degraded, and a recovered one must come back.
  const g = P.makeGovernor({ cap: 60 });
  for (let i = 0; i < 300; i++) g.sample(6);
  ok(g.tier === 0 && g.cap === 60, 'a cheap world is left completely alone');
  const g2 = P.makeGovernor({ cap: 60 });
  for (let i = 0; i < 400; i++) g2.sample(40);        // heavy: forces a drop
  const droppedTier = g2.tier;
  for (let i = 0; i < 900; i++) g2.sample(5);         // then it gets cheap (player zoomed in)
  ok(g2.tier < droppedTier || g2.cap === 60, 'quality is restored when the load goes away');
}
{
  const g = P.makeGovernor({ enabled: false, cap: 60 });
  for (let i = 0; i < 400; i++) g.sample(500);
  ok(g.tier === 0 && g.cap === 60, 'a designer who turns adaptive quality OFF is obeyed absolutely');
}

console.log('Frame cap actually paces frames:');
{
  const g = P.makeGovernor({ cap: 30 });
  ok(g.shouldRender(0) === true, 'first frame renders');
  ok(g.shouldRender(5) === false, 'a frame 5ms later is skipped at a 30fps cap');
  ok(g.shouldRender(40) === true, 'a frame 40ms later renders');
  const un = P.makeGovernor({ cap: 60 });
  ok(un.shouldRender(0) && un.shouldRender(1) && un.shouldRender(2), 'at 60 nothing is skipped');
}

console.log('A designer cap is a ceiling the governor never exceeds (build 360):');
{
  const g = P.makeGovernor({ cap: 30 });
  for (let i = 0; i < 900; i++) g.sample(4);          // trivially cheap world
  ok(g.cap === 30, 'a cheap world does NOT get raised above the designer cap of 30');
  ok(g.tier === 0, 'and nothing is sacrificed, since 30fps is easily held');
  const g2 = P.makeGovernor({ cap: 45 });
  for (let i = 0; i < 400; i++) g2.sample(120);       // hopeless
  ok(g2.cap <= 45, 'the governor may go BELOW the designer cap when it must');
  for (let i = 0; i < 1500; i++) g2.sample(3);        // becomes cheap again
  ok(g2.cap <= 45, 'and recovers only as far as the designer cap, never past it');
}

console.log('Soak log produces a copyable result, not a vibe (build 361):');
{
  const log = P.makeSoakLog({ intervalMs: 1000 });
  const gov = P.makeGovernor({ cap: 60 });
  let t = 0;
  for (let i = 0; i < 200; i++) { t += 250; log.tick(t, { fps: 60, ms: 16, worstMs: 20, cells: 9000 }, gov); }
  ok(log.samples.length === 50, `samples on the interval, not per frame (${log.samples.length} for 200 frames at 4x the interval)`);
  ok(log.samples[0].s === 0 && log.samples[log.samples.length - 1].s > 0, 'samples carry elapsed seconds');
  ok(/SOAK \d+ min, 50 samples/.test(log.summary()), 'the summary states duration and sample count');
  ok(/fps\s+first 60/.test(log.summary()), 'and first/last/avg/min fps');
  ok(/errors\s+0/.test(log.summary()), 'and a measured error count, not a remembered one');
  ok(/sec,fps,worstMs,cells,heapMB,tier,cap,errors/.test(log.csv()), 'csv() gives raw rows for a spreadsheet');
  ok(log.csv().split('\n').length === 51, 'one csv row per sample plus a header');
}
{
  // Leak detection must compare thirds, not endpoints, so one GC dip cannot hide a climb.
  const log = P.makeSoakLog({ intervalMs: 1000 });
  let t = 0;
  for (let i = 0; i < 90; i++) { t += 1000; log.samples.push({ s: i, fps: 60, worst: 20, cells: 100, heap: 100 + i * 3, tier: 0, cap: 60, err: 0 }); }
  ok(/INVESTIGATE: looks like a leak/.test(log.summary()), 'a monotonic heap climb is called out');
  const flat = P.makeSoakLog({ intervalMs: 1000 });
  for (let i = 0; i < 90; i++) flat.samples.push({ s: i, fps: 60, worst: 20, cells: 100, heap: 100 + (i % 5), tier: 0, cap: 60, err: 0 });
  ok(!/INVESTIGATE/.test(flat.summary()), 'a normal GC sawtooth is NOT called a leak');
}
{
  // Governor decisions must be timestamped, so a quality drop can be matched against
  // whatever else the machine was doing at that moment.
  const log = P.makeSoakLog({ intervalMs: 1000 });
  const gov = P.makeGovernor({ cap: 60 });
  let t = 0;
  for (let i = 0; i < 40; i++) { t += 1000; log.tick(t, { fps: 60, ms: 16, worstMs: 20, cells: 100 }, gov); }
  const before = log.events.length;
  for (let k = 0; k < 200; k++) gov.sample(120);
  t += 1000; log.tick(t, { fps: 20, ms: 50, worstMs: 60, cells: 100 }, gov);
  ok(log.events.length > before, 'a governor change is recorded as an event');
  ok(typeof log.events[log.events.length - 1].at === 'number', 'with the second it happened at');
}

console.log('Tier table is ordered richest-to-cheapest:');
for (let i = 1; i < P.TIERS.length; i++) {
  const a = P.frameCost(10000, P.TIERS[i - 1]), b = P.frameCost(10000, P.TIERS[i]);
  ok(b <= a, `tier ${i} (${P.TIERS[i].label}) costs no more than tier ${i - 1}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
