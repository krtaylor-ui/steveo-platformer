// Headless tests for the Overhead Day/Night cycle (pure phase + sky model).
//   node test/test-overhead-daynight.js
const { OH_DAYNIGHT } = require('../js/overhead/overhead-daynight.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-6 : e);

console.log('Phase — wraps into [0,1) and respects the start offset:');
{
  ok(near(OH_DAYNIGHT.phase(0, 120, 0), 0), 't=0 at start 0');
  ok(near(OH_DAYNIGHT.phase(60, 120, 0), 0.5), 'half a 120s day → noon phase');
  ok(near(OH_DAYNIGHT.phase(120, 120, 0), 0), 'a full day wraps back to 0');
  ok(near(OH_DAYNIGHT.phase(180, 120, 0), 0.5), '1.5 days wraps to 0.5');
  ok(near(OH_DAYNIGHT.phase(0, 120, 0.35), 0.35), 'start offset applied');
  ok(near(OH_DAYNIGHT.phase(60, 120, 0.75), 0.25), 'offset + wrap (0.75 + 0.5 → 0.25)');
  ok(near(OH_DAYNIGHT.phase(0, 0, 0), 0), 'zero length is guarded (no NaN/Infinity)');
}

console.log('Darkness — bright at noon, dark at midnight, smooth between:');
{
  ok(near(OH_DAYNIGHT.darkness(0.5), 0, 1e-9), 'noon = full daylight (0)');
  ok(near(OH_DAYNIGHT.darkness(0.0), 1, 1e-9), 'midnight = deepest dark (1)');
  ok(OH_DAYNIGHT.darkness(0.25) > 0.4 && OH_DAYNIGHT.darkness(0.25) < 0.6, 'dawn ≈ halfway');
  ok(OH_DAYNIGHT.darkness(0.1) > OH_DAYNIGHT.darkness(0.2), 'monotonic toward midnight');
}

console.log('Sky overlay — clear at noon, opaque blue at night, warm at dawn/dusk:');
{
  const noon = OH_DAYNIGHT.sky(0.5, 0.6);
  ok(noon.a < 0.01, 'midday overlay is essentially invisible');
  const night = OH_DAYNIGHT.sky(0.0, 0.6);
  ok(near(night.a, 0.6, 1e-9) && night.b > night.r, 'midnight is a near-max cool-blue wash');
  const dawn = OH_DAYNIGHT.sky(0.25, 0.6);
  ok(dawn.r > dawn.b, 'dawn wash is warm (more red than blue)');
  ok(OH_DAYNIGHT.sky(0.5, 0.6).a <= 0.6 && OH_DAYNIGHT.sky(0.0, 0.3).a <= 0.3, 'alpha respects maxAlpha cap');
}

console.log('Label + detection multiplier:');
{
  ok(OH_DAYNIGHT.label(0.5) === 'Day', 'noon labelled Day');
  ok(OH_DAYNIGHT.label(0.0) === 'Night', 'midnight labelled Night');
  ok(OH_DAYNIGHT.label(0.25) === 'Dawn', '0.25 labelled Dawn');
  ok(OH_DAYNIGHT.label(0.75) === 'Dusk', '0.75 labelled Dusk');
  ok(near(OH_DAYNIGHT.detectMultiplier(0.5), 1, 1e-9), 'daytime detection is unchanged (×1)');
  ok(OH_DAYNIGHT.detectMultiplier(0.0) > 1.3, 'night boosts mob detection range');
}

console.log(`\noverhead day/night: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
