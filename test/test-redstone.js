// Redstone perf-cache test — the O(1) piston-head lookup must match the old O(components)
// scan (build 151). isPistonHeadAt is called from level.isSolid on EVERY solidity check,
// so pathfinding hammered it; it's now a per-frame cached Set instead of a per-call loop.
const fs = require('fs');
const vm = require('vm');
const jsDir = require('path').join(__dirname, '..', 'js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

const real = { window: {}, document: {}, Math, console, Set, Map, Array, Object, JSON, Number, String, Boolean };
const sandbox = new Proxy(real, { has: () => true, get: (t, k) => (k in t ? t[k] : (typeof k === 'symbol' ? undefined : 1)), set: (t, k, v) => { t[k] = v; return true; } });
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(`${jsDir}/blocks.js`, 'utf8') + '\n;this.BLOCK=BLOCK;', sandbox, { filename: 'blocks.js' });
vm.runInContext(fs.readFileSync(`${jsDir}/redstone.js`, 'utf8') + '\n;this.RedstoneSystem=RedstoneSystem;', sandbox, { filename: 'redstone.js' });
const { RedstoneSystem } = sandbox;

console.log('Piston-head cache (O(1) isPistonHeadAt):');
{
  // A piston at (5,5) facing up → its head extends to (5,4) when extended.
  const rs = new RedstoneSystem([
    { type: 'piston', col: 5, row: 5, dir: 'up', extended: true },
    { type: 'wire',   col: 6, row: 5 },   // a non-piston component must never register a head
  ]);
  ok(rs.isPistonHeadAt(5, 4) === true, 'extended piston head cell is solid');
  ok(rs.isPistonHeadAt(5, 5) === false, 'the piston body cell is not the head');
  ok(rs.isPistonHeadAt(6, 5) === false, 'a non-piston component is never a head');
  ok(rs.isPistonHeadAt(99, 99) === false, 'an empty cell is not a head');

  // Retract it: animTarget 0 → the head cell clears after the per-frame rebuild.
  rs.components[0].animTarget = 0;
  rs.updatePistonAnimations(1);   // rebuilds the cache
  ok(rs.isPistonHeadAt(5, 4) === false, 'retracted piston no longer registers a head');

  // Extend again: animTarget 1 → head returns after rebuild.
  rs.components[0].animTarget = 1;
  rs.updatePistonAnimations(1);
  ok(rs.isPistonHeadAt(5, 4) === true, 're-extended piston registers the head again');

  // Sandbox add/remove refreshes the cache immediately.
  rs.addComponent({ type: 'piston', col: 10, row: 5, dir: 'right', extended: true });
  ok(rs.isPistonHeadAt(11, 5) === true, 'added extended piston (facing right) → head at col+1');
  rs.removeAt(10, 5);
  ok(rs.isPistonHeadAt(11, 5) === false, 'removed piston clears its head');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
