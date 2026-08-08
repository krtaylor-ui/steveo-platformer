// Overhead PLAY path — OVERHEAD_PLAY module (real, non-test launch dispatch).
//   node test/test-overhead-play-path.js
// Pure-logic coverage: the module loads headlessly, resolves the overhead world
// from either a raw world or a { world_data } wrapper, and derives player count
// from spawns. (DOM overlays are browser-verified separately.)
global.window = global;
const path = require('path');
const { OVERHEAD_PLAY } = require(path.join(__dirname, '..', 'js', 'overhead-play.js'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

console.log('OVERHEAD_PLAY — world resolution + player count:');
ok(OVERHEAD_PLAY && typeof OVERHEAD_PLAY.init === 'function', 'module loads and exposes init()');

// Raw overhead world object.
const raw = { viewMode: 'overhead', mapSnapshot: { gridW: 20 }, spawns: [{ col: 1, row: 1 }, { col: 5, row: 5 }] };
ok(OVERHEAD_PLAY._resolveWorld(raw) === raw, 'resolves a RAW overhead world object as-is');
ok(OVERHEAD_PLAY._playerCount(raw) === 2, 'player count = spawn count (2)');

// Wrapped world_data.
const wrapped = { world_data: { viewMode: 'overhead', mapSnapshot: {}, spawns: [{ col: 0, row: 0 }] } };
ok(OVERHEAD_PLAY._resolveWorld(wrapped) === wrapped.world_data, 'unwraps { world_data } to the overhead world');
ok(OVERHEAD_PLAY._playerCount(wrapped.world_data) === 1, 'player count clamps to >= 1 for a single spawn');

// Clamp to 4 max even with more spawns; and null-safety.
const many = { viewMode: 'overhead', mapSnapshot: {}, spawns: [1, 2, 3, 4, 5, 6].map((i) => ({ col: i, row: i })) };
ok(OVERHEAD_PLAY._playerCount(many) === 4, 'player count clamps to 4 max');
ok(OVERHEAD_PLAY._playerCount({}) === 1, 'no spawns -> 1 player (no throw)');
ok(OVERHEAD_PLAY._resolveWorld(null) === null, 'null game_data -> null (handled)');

console.log(`\noverhead play: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
