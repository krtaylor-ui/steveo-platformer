// Headless tests for the §Phase 7 combo state machine (pure). Verifies the data-driven
// per-combo enabling + the advance() classification the game drives off landed hits.
const { COMBOS } = require('../js/combos.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

console.log('Per-combo enabling (independent toggles):');
{
  ok(COMBOS.enabled({}).length === 0, 'nothing enabled by default');
  ok(COMBOS.enabled({ comboRisingStrike: true }).length === 1, 'one toggle → one combo');
  ok(COMBOS.enabled({ comboRisingStrike: true }).map((d) => d.id)[0] === 'risingStrike', 'the right one');
  ok(COMBOS.enabled({ comboRisingStrike: true, comboSweepSlam: true }).length === 2, 'both toggles → both');
}

console.log('Rising Strike (down, up → special):');
{
  const defs = COMBOS.enabled({ comboRisingStrike: true });
  let r = COMBOS.advance([], 'down', defs); ok(r.status === 'progress', 'down = progress');
  r = COMBOS.advance(r.seq, 'up', defs); ok(r.status === 'finish' && r.def.id === 'risingStrike', 'down,up = FINISH');
  ok(r.seq.length === 0, 'sequence resets after the special');
}

console.log('Sweep Slam (up, down → special):');
{
  const defs = COMBOS.enabled({ comboSweepSlam: true });
  let r = COMBOS.advance([], 'up', defs);
  r = COMBOS.advance(r.seq, 'down', defs);
  ok(r.status === 'finish' && r.def.id === 'sweepSlam', 'up,down finishes Sweep Slam');
}

console.log('Broken chains + restarts (no "back" in this game):');
{
  const defs = COMBOS.enabled({ comboRisingStrike: true, comboSweepSlam: true });
  // down, down: the 2nd down isn't Rising's 2nd step (up), but it re-starts a combo's first step.
  let r = COMBOS.advance([], 'down', defs);
  r = COMBOS.advance(r.seq, 'down', defs);
  ok(r.status === 'progress' && r.seq.length === 1 && r.seq[0] === 'down', 'a breaking press restarts as a new first step');
  const n = COMBOS.advance(['down'], 'neutral', defs);
  ok(n.status === 'none' && n.seq.length === 0, 'a non-combo direction clears the sequence');
}

console.log('Disabled combos never fire:');
{
  const defs = COMBOS.enabled({ comboRisingStrike: false });
  const r = COMBOS.advance(COMBOS.advance(COMBOS.advance([], 'forward', defs).seq, 'forward', defs).seq, 'up', defs);
  ok(r.status === 'none', 'with the toggle off, the sequence never finishes');
}

console.log('§Combo Creator — custom combos + trainer defs:');
{
  COMBOS.customList = []; COMBOS._loaded = true;   // fresh (localStorage unavailable headless)
  const nBuiltin = COMBOS.DEFS.length;
  const c = COMBOS.addCustom({ name: 'Test Uppercut', seq: ['down', 'forward', 'up'] });
  ok(c && c.id && c.custom === true, 'addCustom returns an entry with an id + custom flag');
  ok(COMBOS.customList.length === 1, 'custom combo stored');
  ok(COMBOS.trainerDefs().length === nBuiltin + 1, 'trainerDefs = built-ins + custom');
  // The pure matcher works on a custom def just like a built-in.
  const defs = COMBOS.trainerDefs();
  const r = COMBOS.advance(COMBOS.advance(COMBOS.advance([], 'down', defs).seq, 'forward', defs).seq, 'up', defs);
  ok(r.status === 'finish' && r.def && r.def.name === 'Test Uppercut', 'custom sequence finishes via advance()');
  COMBOS.removeCustom(c.id);
  ok(COMBOS.customList.length === 0, 'removeCustom drops it');
  ok(COMBOS.trainerDefs().length === nBuiltin, 'trainerDefs back to built-ins only');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
