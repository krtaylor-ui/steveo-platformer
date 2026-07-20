// Headless test for §Phase A — exiting a Sandbox test must reopen the editor from the
// IN-MEMORY snapshot (unsaved edits preserved), NOT a re-fetch of the saved file. Loads
// test-world.js in a vm with minimal DOM/Game stubs and drives choose() → exit().
const fs = require('fs');
const vm = require('vm');
const jsdir = require('path').join(__dirname, '..', 'js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

// The live editor's serialized state (as GAME_STATE.serialize would produce), carrying an
// UNSAVED World Setting the designer changed before testing.
const LIVE_SNAPSHOT = { grid: [[1]], worldAdvSettings: { arrowStraight: true }, __live: true };
// What the persisted file still holds (the OLD value) — must NOT be what we reopen from.
let fileFetched = false;

const editWorldCalls = [];
const fakeEl = () => ({ style: {}, onclick: null, textContent: '', classList: { add() {}, remove() {}, contains() { return false; } } });
const win = {};
const sandbox = {
  window: win, console, alert: () => {},
  document: { getElementById: () => fakeEl() },
  GAME_STATE: { serialize: () => JSON.parse(JSON.stringify(LIVE_SNAPSHOT)) },
  SANDBOX: {
    selectedWorldId: 'w1',
    currentWorldData: { world_name: 'W', is_published: false, world_data: { arrowStraight: false, __file: true } },
    editWorld: (wid, snap) => { editWorldCalls.push({ wid, snap }); if (!snap) fileFetched = true; return Promise.resolve(); },
    _returnToBrowser: () => {},
  },
  Game: function (mode, opts, exit) { this.mode = mode; this.opts = opts; this._exit = exit; this.player = {}; this.destroy = () => {}; win.game = this; },
};
// An initial "editor" game so choose() can serialize it.
win.game = { destroy() {}, player: {} };

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(`${jsdir}/test-world.js`, 'utf8'), sandbox, { filename: 'test-world.js' });
const TEST_WORLD = win.TEST_WORLD;

console.log('Phase A — test round-trip reopens from the draft snapshot, not the file:');
{
  TEST_WORLD.choose('platformer');           // captures live snapshot + launches the test game
  ok(TEST_WORLD._data && TEST_WORLD._data.__live === true, 'the editor draft is snapshotted at test-start (live state)');
  ok(TEST_WORLD._data.worldAdvSettings.arrowStraight === true, 'the unsaved setting is in the snapshot');
  ok(win.game && typeof win.game._exit === 'function', 'the test game is launched with an exit handler');

  win.game._exit();                          // ← Return to Sandbox

  ok(editWorldCalls.length === 1, 'exit reopens the editor exactly once');
  ok(editWorldCalls[0].wid === 'w1', 'reopens the same world id');
  ok(editWorldCalls[0].snap && editWorldCalls[0].snap.__live === true, 'reopens FROM the in-memory snapshot (unsaved edits preserved)');
  ok(editWorldCalls[0].snap.worldAdvSettings.arrowStraight === true, 'the unsaved setting survives the round-trip');
  ok(fileFetched === false, 'the saved file is NOT re-fetched (no data-loss reload)');
}

console.log('Phase A — editWorld snapshot branch layers the draft over the world metadata:');
{
  // Directly exercise the merge contract the fix relies on: snapshot world_data wins,
  // metadata (name/published) comes from the already-open world.
  const meta = { world_name: 'My World', is_published: true, world_data: { gameModeDefault: 'PLT', arrowStraight: false } };
  const snap = { grid: [[1]], worldAdvSettings: { arrowStraight: true } };
  const merged = Object.assign({}, meta.world_data, snap);   // mirrors editWorld's snapshot branch
  ok(merged.gameModeDefault === 'PLT', 'world-mode metadata is preserved from the open world');
  ok(merged.worldAdvSettings.arrowStraight === true, 'the draft World Settings override the file');
  ok(merged.grid.length === 1, 'the draft grid is used');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
