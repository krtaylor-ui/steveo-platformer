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

console.log('Governor (P3.9 flags): sacrificeable first, then cap, protects the chosen look:');
{
  // A cost model driven by which passes are ACTIVE, so the governor's choices feed back into
  // the frame time it measures — exactly what happens in the real loop.
  const g = P.makeGovernor({ cap: 60 });   // default flags: glare sacrificeable, night + shadows protected
  const cost = () => { const c = g.cfg(); let ms = 9; if (c.shadows !== 'off') ms += 19; if (c.night) ms += 6; if (c.glare) ms += 3; return ms; };
  const seen = [];
  for (let i = 0; i < 900; i++) { g.sample(cost()); if (g.reason && seen[seen.length - 1] !== g.reason) seen.push(g.reason); }
  ok(seen.length > 0, 'it reacts to a world it cannot hold at 60');
  ok(/glass glare/.test(seen[0]) && /dropped/.test(seen[0]), 'the CHEAPEST SACRIFICEABLE pass goes first (glare), not shadows');
  ok(seen.some((x) => /capped to \d+fps/.test(x)), 'then it lowers the cap rather than stripping the protected look');
  ok(!seen.some((x) => /shadows/.test(x)) && g.cfg().shadows !== 'off', 'the protected shadows survive when a lower cap is enough — the designer chose them');
  ok(g.cap <= 45, `it settled on a steady cap (${g.cap}fps)`);
  ok(seen.length <= 4, `and settled quickly rather than flapping (${seen.length} changes in 900 frames)`);
}
{
  // A world so heavy even 30fps cannot be held drops EVERYTHING — protected passes only as
  // the last resort, after the cap is already at 30.
  const g = P.makeGovernor({ cap: 60 });
  for (let i = 0; i < 3000; i++) g.sample(200);
  ok(g.tier === 3, 'a hopeless world sacrifices all three passes');
  ok(g.cfg().shadows === 'off' && g.cfg().night === false && g.cfg().glare === false, 'so nothing expensive is drawn');
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
console.log('Per-pass Protected / Sacrificeable / Off (P3.9):');
{
  // "never take my shadows": shadows Protected, glare Sacrificeable. Under load glare goes,
  // the cap drops, and shadows are only touched at the very end.
  const g = P.makeGovernor({ cap: 60, flags: { shadows: 'protected', night: 'sacrificeable', glare: 'sacrificeable' } });
  for (let i = 0; i < 3000; i++) g.sample(200);
  const order = g._stack;   // drop order
  ok(order.indexOf('shadows') === order.length - 1, 'the PROTECTED pass (shadows) is sacrificed LAST');
  ok(order.indexOf('glare') < order.indexOf('shadows') && order.indexOf('night') < order.indexOf('shadows'), 'both sacrificeable passes go before the protected one');
}
{
  // 'off' means the designer already disabled it — it never draws and is never "dropped".
  const g = P.makeGovernor({ cap: 60, flags: { shadows: 'off', night: 'protected', glare: 'protected' } });
  ok(g.cfg().shadows === 'off', 'an OFF pass is off from the first frame');
  for (let i = 0; i < 3000; i++) g.sample(200);
  ok(g._stack.indexOf('shadows') < 0, 'an OFF pass is never counted as a governor sacrifice');
  ok(g.cfg().night === false && g.cfg().glare === false, 'the protected passes still fall as a last resort when even 30fps fails');
}
{
  // Everything protected: the governor lowers the cap before touching any pass.
  const g = P.makeGovernor({ cap: 60, flags: { shadows: 'protected', night: 'protected', glare: 'protected' } });
  const seen = [];
  for (let i = 0; i < 300; i++) { g.sample(40); if (g.reason && seen[seen.length - 1] !== g.reason) seen.push(g.reason); }
  ok(/capped/.test(seen[0]), 'with nothing sacrificeable, the FIRST move is to lower the cap, not strip a pass');
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

console.log('The governor must react to what the PLAYER sees (build 362, QA F-A7.1):');
{
  const g = P.makeGovernor({ cap: 60 });
  // The exact reported case: our render call returns in 16ms while the browser takes 37ms per
  // frame to rasterise a huge canvas. Sampling our own execution says "fine" forever.
  for (let i = 0; i < 400; i++) g.sample(16);
  ok(g.tier === 0, 'sampling only our JS render time never reacts — this was the bug');
  const g2 = P.makeGovernor({ cap: 60 });
  for (let i = 0; i < 400; i++) g2.sample(37);        // the interval the player actually gets
  ok(g2.tier > 0 || g2.cap < 60, 'sampling the frame INTERVAL does react (fps 27 is not "fine")');
  // And the fix must not make a capped, healthy run look like it is struggling.
  const g3 = P.makeGovernor({ cap: 30 });
  for (let i = 0; i < 600; i++) g3.sample(33.3);      // exactly the 30fps cadence it asked for
  ok(g3.tier === 0, 'a run pacing itself at its own 30fps cap is NOT treated as a struggle');
}

console.log('Leak flag needs an absolute rise too (build 362, QA F-A7.3):');
{
  // +40% of a 20MB heap is 8MB — a handful of offscreen canvases. Not a leak.
  const small = P.makeSoakLog({ intervalMs: 1000 });
  for (let i = 0; i < 90; i++) small.samples.push({ s: i, fps: 60, worst: 20, cells: 100, heap: 20 + i * 0.09, tier: 0, cap: 60, err: 0 });
  ok(!/INVESTIGATE/.test(small.summary()), 'a +40% rise on a SMALL heap is not called a leak');
  ok(/likely noise/.test(small.summary()), 'but it is still reported, with the reason');
  // A real one: big relative AND big absolute.
  const big = P.makeSoakLog({ intervalMs: 1000 });
  for (let i = 0; i < 90; i++) big.samples.push({ s: i, fps: 60, worst: 20, cells: 100, heap: 100 + i * 1.2, tier: 0, cap: 60, err: 0 });
  ok(/INVESTIGATE: looks like a leak/.test(big.summary()), 'a large rise in BOTH terms still flags');
}

console.log('Tier table is ordered richest-to-cheapest:');
for (let i = 1; i < P.TIERS.length; i++) {
  const a = P.frameCost(10000, P.TIERS[i - 1]), b = P.frameCost(10000, P.TIERS[i]);
  ok(b <= a, `tier ${i} (${P.TIERS[i].label}) costs no more than tier ${i - 1}`);
}

console.log('assess() MEASURES with a real clock (fake clock here) — per-tier + per-pass:');
{
  // A fake render whose cost depends on the cfg, and a fake clock advanced by that cost, so
  // the harness's timing/isolation logic is exercised without a real canvas.
  let clock = 0;
  const now = () => clock;
  const renderOnce = (cfg) => {
    let c = 1.0;                                   // baseline per-frame cost
    if (cfg.shadows === 'live') c += 2.0; else if (cfg.shadows === 'fixed') c += 0.05;
    if (cfg.night) c += 0.6;
    if (cfg.glare) c += 0.25;
    clock += c;
  };
  const r = P.assess(renderOnce, { now, frames: 10, warmup: 2 });
  // Per-tier: 'full' (live shadows+night+glare) must be the slowest, 'flat' the fastest.
  const byId = {}; r.tiers.forEach((t) => byId[t.id] = t);
  ok(byId.full.msPerFrame > byId.flat.msPerFrame, 'the Full tier measures slower than Flat (warmup excluded from timing)');
  ok(byId.flat.fps > byId.full.fps, 'and reports a higher fps for the cheaper tier');
  ok(Math.abs(byId.full.msPerFrame - 3.85) < 0.02, 'Full = baseline 1 + shadows 2 + night 0.6 + glare 0.25 = 3.85ms/frame (measured, not predicted)');
  // Per-pass isolation on a flat baseline.
  ok(Math.abs(r.baselineMs - 1.0) < 0.02, 'the flat baseline is ~1ms');
  ok(Math.abs(r.passes.shadowsLive - 2.0) < 0.02, 'live shadows isolated at ~2.0ms over baseline');
  ok(Math.abs(r.passes.night - 0.6) < 0.02, 'night isolated at ~0.6ms');
  ok(Math.abs(r.passes.glare - 0.25) < 0.02, 'glass glare isolated at ~0.25ms');
  ok(r.passes.shadowsLive > r.passes.night && r.passes.night > r.passes.glare, 'the breakdown ranks the passes worst-first');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
