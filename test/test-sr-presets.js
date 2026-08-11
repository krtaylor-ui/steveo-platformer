// Headless tests for §E10 — Speed Runner rule-set presets.
const { WORLD_SETTINGS: WS } = require('../js/world-settings-ui.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

console.log('1 — presets exist with the documented ids:');
{
  const ids = WS.SR_PRESETS.map(p => p.id);
  for (const id of ['classic', 'autoscroll', 'plumber', 'shape', 'zen']) ok(ids.includes(id), `preset "${id}" present`);
  ok(WS.SR_PRESETS.every(p => p.label && p.vals && typeof p.vals === 'object'), 'every preset has a label + vals batch');
}

console.log('2 — applying a preset writes its whole batch into _worldAdvSettings:');
{
  const game = { _worldAdvSettings: { srBaseSpeed: 9, someOther: 'keep' } };
  const shape = WS.SR_PRESETS.find(p => p.id === 'shape');
  WS._applySrPreset(game, shape);
  const a = game._worldAdvSettings;
  ok(a.srConstantSpeed === true, 'shape sets constant speed on');
  ok(a.srAccel === 'instant', 'shape sets instant acceleration');
  ok(a.srBaseSpeed === 1.5, 'shape overwrites base speed');
  ok(a.someOther === 'keep', 'unrelated settings are left untouched (still editable)');
}

console.log('3 — classic restores the defaults:');
{
  const game = { _worldAdvSettings: { srConstantSpeed: true, srAccel: 'instant', srInstantRetry: true } };
  WS._applySrPreset(game, WS.SR_PRESETS.find(p => p.id === 'classic'));
  const a = game._worldAdvSettings;
  ok(a.srConstantSpeed === false && a.srMaxEqualsBase === false, 'classic clears auto-run / max=base');
  ok(a.srBaseSpeed === 1.0 && a.srMaxMultiplier === 2.0 && a.srAccel === 0.5, 'classic = default pace');
  ok(a.srInstantRetry === false, 'classic uses the countdown');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
