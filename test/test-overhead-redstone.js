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
    { col: 1, row: 1, kind: 'lever', on: true, channel: 'gate' },   // channel == transmit
    { col: 20, row: 9, kind: 'rx', rxChannel: 'gate' },
    { col: 21, row: 9, kind: 'rx', rxChannel: 'other' },
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
    { col: 40, row: 40, kind: 'rx', rxChannel: 'gate' },
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

console.log('Generalized TX/RX channels on any device:');
{
  const dev = [
    { col: 1, row: 1, kind: 'lever', on: true, txChannel: 'a' },
    { col: 5, row: 5, kind: 'lamp', rxChannel: 'a' },       // receives a → on
    { col: 6, row: 5, kind: 'lamp', rxChannel: 'b' },       // b never driven → off
  ];
  let r = OH_REDSTONE.evaluate(dev);
  ok(P(r, 5, 5) && !P(r, 6, 5), 'lamp on rxChannel a is powered; on b stays off');
  dev[0].on = false; r = OH_REDSTONE.evaluate(dev);
  ok(!P(r, 5, 5), 'clearing the transmitter clears its receiver');
}

console.log('Pressure plate (runtime sets _active):');
{
  const dev = [{ col: 2, row: 2, kind: 'plate', _active: false, txChannel: 'door' }, { col: 9, row: 9, kind: 'rx', rxChannel: 'door' }];
  let r = OH_REDSTONE.evaluate(dev);
  ok(!OH_REDSTONE.channelOn(r, 'door'), 'plate idle → channel off');
  dev[0]._active = true; r = OH_REDSTONE.evaluate(dev);
  ok(OH_REDSTONE.channelOn(r, 'door') && P(r, 9, 9), 'plate stepped-on drives its channel + the receiver');
}

console.log('AND gate (needs 2 powered inputs) + NOT gate (inverter):');
{
  // two levers feeding an AND at (2,2): levers at (1,2) and (3,2) via... place adjacent.
  const AND = [
    { col: 1, row: 2, kind: 'lever', on: true }, { col: 3, row: 2, kind: 'lever', on: true },
    { col: 2, row: 2, kind: 'and', txChannel: 'g' }, { col: 9, row: 1, kind: 'lamp', rxChannel: 'g' },
  ];
  let r = OH_REDSTONE.evaluate(AND);
  ok(OH_REDSTONE.channelOn(r, 'g') && P(r, 9, 1), 'AND with both inputs on → channel g + lamp on');
  AND[0].on = false; r = OH_REDSTONE.evaluate(AND);
  ok(!OH_REDSTONE.channelOn(r, 'g'), 'AND with one input off → off');
  // NOT gate: lever off → NOT on; lever on → NOT off.
  const NOT = [{ col: 1, row: 1, kind: 'lever', on: false }, { col: 2, row: 1, kind: 'not', txChannel: 'n' }];
  r = OH_REDSTONE.evaluate(NOT);
  ok(OH_REDSTONE.channelOn(r, 'n'), 'NOT with input OFF → output on');
  NOT[0].on = true; r = OH_REDSTONE.evaluate(NOT);
  ok(!OH_REDSTONE.channelOn(r, 'n'), 'NOT with input ON → output off');
}

console.log('Numbered transmitters + multi-source receiver (rxIds):');
{
  const dev = [
    { col: 1, row: 1, kind: 'lever', on: false, txId: 5 },
    { col: 2, row: 2, kind: 'lever', on: true, txId: 9 },
    { col: 9, row: 9, kind: 'lamp', rxIds: [5, 9] },   // listens to BOTH #5 and #9 (OR)
  ];
  let r = OH_REDSTONE.evaluate(dev);
  ok(P(r, 9, 9), 'receiver on because source #9 is broadcasting (multi-source OR)');
  dev[1].on = false; r = OH_REDSTONE.evaluate(dev);
  ok(!P(r, 9, 9), 'both sources off → receiver off');
  dev[0].on = true; r = OH_REDSTONE.evaluate(dev);
  ok(P(r, 9, 9), 'turning on the OTHER listened source (#5) powers it again');
  ok(OH_REDSTONE.receives(r, { rxIds: [5] }) && !OH_REDSTONE.receives(r, { rxIds: [9] }), 'receives() checks numbered sources');
}

console.log('Directional gate (input/output sides):');
{
  // AND at (2,2) reads inputs W (1,2) + N (2,1); outputs E (3,2) → a lamp/dust there.
  const dev = [
    { col: 1, row: 2, kind: 'lever', on: true }, { col: 2, row: 1, kind: 'lever', on: true },
    { col: 2, row: 2, kind: 'and', inputs: ['w', 'n'], outputs: ['e'] },
    { col: 3, row: 2, kind: 'lamp' },   // on the output side (E, adjacency)
    { col: 2, row: 3, kind: 'lamp' },   // on the gate's unused SOUTH side → not fed
  ];
  let r = OH_REDSTONE.evaluate(dev);
  ok(P(r, 3, 2), 'gate feeds the lamp on its OUTPUT side');
  ok(!P(r, 2, 3), 'gate does NOT feed a lamp off its output side');
  dev[0].on = false; r = OH_REDSTONE.evaluate(dev);
  ok(!P(r, 3, 2), 'AND drops when one input side loses power');
  // a lever on a non-input side must not satisfy the AND
  const d2 = [{ col: 3, row: 5, kind: 'lever', on: true }, { col: 4, row: 5, kind: 'lever', on: true }, { col: 5, row: 5, kind: 'and', inputs: ['n'], outputs: ['s'] }, { col: 5, row: 6, kind: 'lamp' }];
  r = OH_REDSTONE.evaluate(d2);
  ok(!P(r, 5, 6), 'AND with input side N (empty) ignores the W lever → off');
}

console.log('Dust is pure WIRE — it conducts but never transmits a channel:');
{
  // A lever (Tx #1) → dust → dust → lamp. The dust carries a legacy txId (as older
  // saved worlds did), but must NOT broadcast 'T2'/'T3'; only the lever broadcasts 'T1'.
  const dev = [
    { col: 1, row: 1, kind: 'lever', on: true, txId: 1 },
    { col: 2, row: 1, kind: 'dust', txId: 2 }, { col: 3, row: 1, kind: 'dust', txId: 3 },
    { col: 4, row: 1, kind: 'lamp', rxIds: [1] },
  ];
  const r = OH_REDSTONE.evaluate(dev);
  ok(P(r, 2, 1) && P(r, 3, 1), 'powered dust still CONDUCTS to neighbours');
  ok(OH_REDSTONE.channelOn(r, 'T1'), 'the lever transmits on its channel T1');
  ok(!OH_REDSTONE.channelOn(r, 'T2') && !OH_REDSTONE.channelOn(r, 'T3'), 'dust does NOT transmit T2/T3 even with a baked txId');
  ok(P(r, 4, 1), 'a lamp listening to the lever (T1) lights through the dust wire');
}

console.log(`\noverhead redstone: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
