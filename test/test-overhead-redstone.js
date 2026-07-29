// Headless tests for the Overhead redstone core (power propagation + channels).
//   node test/test-overhead-redstone.js
const { OH_REDSTONE } = require('../js/overhead/overhead-redstone.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const P = (res, c, r) => OH_REDSTONE.cellPowered(res, c, r);

console.log('Sources + dust propagation:');
{
  const dev = [
    { col: 1, row: 1, kind: 'lever', on: false },
    { col: 2, row: 1, kind: 'dust' }, { col: 3, row: 1, kind: 'dust' }, { col: 4, row: 1, kind: 'dust' },
    { col: 5, row: 1, kind: 'lamp' },
  ];
  let r = OH_REDSTONE.evaluate(dev);
  ok(!P(r, 5, 1), 'lamp OFF while the lever is off');
  dev[0].on = true; r = OH_REDSTONE.evaluate(dev);
  ok(P(r, 2, 1) && P(r, 4, 1), 'dust carries power along the wire');
  ok(P(r, 5, 1), 'lamp lights when the wire reaches it');
  // break the wire
  dev.splice(2, 1); r = OH_REDSTONE.evaluate(dev);   // remove dust at (3,1)
  ok(!P(r, 4, 1) && !P(r, 5, 1), 'a broken wire stops power downstream');
}

console.log('Channels (wireless) — lever with a channel drives a receiver anywhere:');
{
  const dev = [
    { col: 1, row: 1, kind: 'lever', on: true, channel: 'gate' },
    { col: 20, row: 9, kind: 'rx', channel: 'gate' },
    { col: 21, row: 9, kind: 'rx', channel: 'other' },
  ];
  let r = OH_REDSTONE.evaluate(dev);
  ok(OH_REDSTONE.channelOn(r, 'gate'), 'gate channel is on');
  ok(P(r, 20, 9), 'receiver on the gate channel is powered (no wire needed)');
  ok(!P(r, 21, 9), 'receiver on a different channel stays off');
  dev[0].on = false; r = OH_REDSTONE.evaluate(dev);
  ok(!OH_REDSTONE.channelOn(r, 'gate') && !P(r, 20, 9), 'turning the lever off clears the channel');
}

console.log('Transmitter — a wired tx re-broadcasts on a channel:');
{
  const dev = [
    { col: 1, row: 1, kind: 'lever', on: true },
    { col: 2, row: 1, kind: 'dust' },
    { col: 3, row: 1, kind: 'tx', channel: 'gate' },
    { col: 40, row: 40, kind: 'rx', channel: 'gate' },
  ];
  const r = OH_REDSTONE.evaluate(dev);
  ok(OH_REDSTONE.channelOn(r, 'gate') && P(r, 40, 40), 'powered tx drives its channel to a far receiver');
}

console.log('toggleAt:');
{
  const dev = [{ col: 4, row: 4, kind: 'lever', on: false }];
  ok(OH_REDSTONE.toggleAt(dev, 4, 4) && dev[0].on === true, 'toggles a lever on');
  ok(OH_REDSTONE.toggleAt(dev, 4, 4) && dev[0].on === false, 'toggles it back off');
  ok(!OH_REDSTONE.toggleAt(dev, 9, 9), 'no lever at an empty cell → false');
}

console.log(`\noverhead redstone: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
