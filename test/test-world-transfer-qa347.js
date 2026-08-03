// Build 347 — regressions for the QA findings against build 346's export/import.
//   node test/test-world-transfer-qa347.js
// Covers:
//   F1 / M3  card export must run the migrator (it exported the RAW stored world, so a
//            world never opened since 345 came out with no schemaVersion)
//   F2       a duplicate import must be tellable apart — display NAME suffixed, not just
//            the storage key, and its own created_at
//   F3 / M6  the shipped sample must match its own description (no phantom glass wall)
//   F5 / M7  the editor's import apply step works headlessly (the button path was a
//            native picker that could read as inert)
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

const ROOT = path.join(__dirname, '..');
const WT = require(path.join(ROOT, 'js', 'world-transfer.js'));

// ── Headless browser stubs, plus a localStorage good enough for the import path.
global.window = global;
global.CANVAS_W = 800; global.CANVAS_H = 500; global.GAME_VERSION = 'v3 build 347 (qa fixes test)';
function stubCtx() { return new Proxy({ filter: 'none' }, { get(t, k) { if (k === 'measureText') return () => ({ width: 80 }); if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} }); if (k === 'canvas') return { width: 800, height: 500 }; if (k in t) return t[k]; return (typeof k === 'string') ? (() => {}) : undefined; }, set(t, k, v) { t[k] = v; return true; } }); }
const cls = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
function mkEl() { return { style: {}, classList: cls, appendChild() {}, removeChild() {}, addEventListener() {}, getContext: () => stubCtx(), getBoundingClientRect: () => ({ width: 800, height: 500, left: 0, top: 0 }), querySelectorAll: () => [], querySelector: () => null, width: 800, height: 500, textContent: '', innerHTML: '', files: [] }; }
global.document = { getElementById: () => mkEl(), head: { appendChild() {} }, createElement: () => mkEl(), body: { appendChild() {}, classList: cls }, addEventListener() {}, querySelectorAll: () => [], hasFocus: () => true };
global.window.addEventListener = () => {}; global.window.dispatchEvent = () => {}; global.Event = function () {};
global.InputManager = function () { this.flush = () => {}; this.isJustDown = () => false; this.isDown = () => false; this.mouse = { x: 0, y: 0, clicked: false, down: false, rightClicked: false, moveVec: { x: 0, y: 0 } }; };
global.requestAnimationFrame = () => 0;
const store = {};
global.localStorage = {
  getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
global.APP_MODE = { isLocal: () => true, isOnline: () => false };
// world-transfer.js was require()d above (before the window stub existed), so publish it
// on the global the way the browser <script> tag would.
global.WORLD_TRANSFER = WT;
global.alert = () => { throw new Error('alert() must not be reachable in the import path — it parks the renderer (QA F4)'); };
global.confirm = () => { throw new Error('confirm() must not be reachable in the import path (QA F4)'); };

['palette', 'grid', 'buildings', 'movement', 'controls', 'combat', 'weapons', 'elevation', 'settings', 'daynight', 'redstone', 'templates', 'launch', 'game', 'editor']
  .forEach((m) => require(path.join(ROOT, 'js', 'overhead', 'overhead-' + m + '.js')));
// sandbox-ui.js declares `const SANDBOX = {...}` at top level, which a CJS require()
// keeps module-local — evaluate it as a script in the global scope and pull the object out.
const vm = require('vm');
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'js', 'sandbox-ui.js'), 'utf8'), { filename: 'sandbox-ui.js' });
const SANDBOX = vm.runInThisContext('SANDBOX');
const OH_SETTINGS = global.OH_SETTINGS, OH_EDITOR = global.OH_EDITOR;

const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'overhead-qa-test-world.json'), 'utf8'));
// A world as STORED before 345: no schemaVersion. This is what the card export read.
const legacyStored = JSON.parse(JSON.stringify(fixture));
delete legacyStored.schemaVersion;
legacyStored.viewMode = 'overhead';
legacyStored.name = 'Overhead QA Test';

console.log('F1 / M3 — card export must migrate (it used to ship the raw stored world):');
const ready = SANDBOX._exportReady(legacyStored);
ok(ready.schemaVersion === OH_SETTINGS.SCHEMA, 'export payload carries schemaVersion (' + ready.schemaVersion + ')');
ok(legacyStored.schemaVersion === undefined, 'the STORED world is left untouched (migrated a copy, not the original)');
const wrapped = WT.wrap(ready, { name: 'Overhead QA Test' });
ok(wrapped.world_data.schemaVersion === OH_SETTINGS.SCHEMA, 'the wrapper that hits disk carries it too');
// Both export paths must now agree on the same world.
const editorPath = Object.assign({}, legacyStored, { viewMode: 'overhead', gameModeDefault: 'NRM', schemaVersion: OH_SETTINGS.SCHEMA });
ok(editorPath.schemaVersion === WT.wrap(SANDBOX._exportReady(legacyStored)).world_data.schemaVersion,
   'card export and editor export agree on schemaVersion');
// A side-scroll world must pass through untouched (no overhead migrator on it).
const side = { blocks: [], gameModeDefault: 'PLT' };
ok(SANDBOX._exportReady(side) === side, 'a side-scroll world is returned as-is, not migrated');

console.log('F2 — duplicate imports must be tellable apart:');
delete store['steveo_overhead_worlds'];
const names = [];
for (let i = 0; i < 4; i++) {
  // eslint-disable-next-line no-await-in-loop
  names.push(SANDBOX._importOverheadWorld(JSON.parse(JSON.stringify(fixture)), 'Overhead QA Test'));
}
Promise.all(names).then((labels) => {
  ok(labels[0] === 'Overhead QA Test', 'first import keeps the plain name');
  ok(labels[1] === 'Overhead QA Test (2)', 'second import is labelled "(2)" (was identical before)');
  ok(labels[3] === 'Overhead QA Test (4)', 'fourth import is labelled "(4)"');
  ok(new Set(labels).size === 4, 'all four DISPLAY names are distinct');

  const all = JSON.parse(store['steveo_overhead_worlds']);
  const keys = Object.keys(all);
  ok(keys.length === 4, 'four separate worlds stored — nothing clobbered (' + keys.length + ')');
  const storedNames = keys.map((k) => all[k].name);
  ok(new Set(storedNames).size === 4, 'the stored world_data.name is suffixed too, so the CARDS differ');
  ok(keys.every((k) => all[k].created_at), 'every import stamped a created_at');
  ok(keys.every((k) => all[k].schemaVersion === OH_SETTINGS.SCHEMA), 'every import was migrated on the way in');

  console.log('F3 / M6 — the shipped sample must match its own description:');
  const samplePath = path.join(ROOT, 'sample-worlds', 'Overhead_QA_Test.export.json');
  const sample = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
  const sres = WT.unwrap(sample, 'Overhead_QA_Test.export.json');
  ok(sres.ok && sres.isOverhead, 'the sample unwraps as an overhead world');
  const tally = {};
  sres.worldData.mapSnapshot.ground.flat().forEach((b) => { tally[b] = (tally[b] || 0) + 1; });
  const claimsGlass = /glass wall|glass\s*×/i.test(sample.description || '');
  ok(!(claimsGlass && !tally.glass), 'the description does not promise glass the world lacks');
  // Whatever the description claims about pit/lava must be true of the data.
  const s = sres.worldData.settings || {};
  const d = sample.description || '';
  if (/pitMode=/.test(d)) ok(d.indexOf('pitMode=' + s.pitMode) >= 0, 'described pitMode matches the data (' + s.pitMode + ')');
  if (/lavaMode=/.test(d)) ok(d.indexOf('lavaMode=' + s.lavaMode) >= 0, 'described lavaMode matches the data (' + s.lavaMode + ')');
  ok(/no glass/i.test(d) === !tally.glass, 'the "no glass" note agrees with the block tally');
  ok((sres.worldData.redstone || []).length === (fixture.redstone || []).length, 'sample still carries the full redstone board');

  console.log('F5 / M7 — the editor import apply step works without a native picker:');
  OH_EDITOR._loadLayout();                                  // _renderBar needs the rail layout (open() normally does this)
  OH_EDITOR.world = JSON.parse(JSON.stringify(fixture));
  OH_EDITOR.world.name = 'Open World';
  OH_EDITOR.worldId = 'oh-Open World';
  OH_EDITOR._hist = ['stale']; OH_EDITOR._histPos = 0;
  const applied = OH_EDITOR._applyImportedWorld(sres.worldData, 'Imported Board');
  ok(applied && OH_EDITOR.world.name === 'Imported Board', 'the imported world replaces the open one');
  ok(OH_EDITOR.worldId === null, 'worldId is cleared, so Save creates a new world instead of overwriting');
  ok(OH_EDITOR.world.schemaVersion === OH_SETTINGS.SCHEMA, 'the applied world is migrated');
  ok(OH_EDITOR._hist.length === 1 && OH_EDITOR._histPos === 0, 'undo stack reset — undo cannot resurrect the previous world');
  ok(OH_EDITOR.grid && OH_EDITOR.grid.gridW === sres.worldData.mapSnapshot.gridW, 'the grid was rebuilt for the new map');

  console.log('F4 — the import path must not reach a blocking dialog:');
  // global.alert/confirm throw, so a damaged file reaching one would fail here.
  let threw = null;
  try { SANDBOX._importOverheadWorld({ viewMode: 'overhead' }, 'Damaged'); }
  catch (e) { threw = e; }
  ok(!threw, 'a damaged world reports in-page instead of calling alert()' + (threw ? ' — ' + threw.message : ''));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
