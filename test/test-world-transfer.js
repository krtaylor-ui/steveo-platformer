// World export/import (build 346) — the file format + the overhead round trip.
//   node test/test-world-transfer.js
// What this pins:
//   1. wrap() produces the v1 wrapper and tags view_mode from the world itself;
//   2. unwrap() reads BOTH a wrapper and a RAW world object (hand-made fixtures);
//   3. an exported overhead world survives migrate() and still CONSTRUCTS + RUNS in
//      the live OverheadGame — i.e. export → import is genuinely lossless, which is
//      the whole point (the QA fixture previously had to be dug out of localStorage);
//   4. validateOverhead() refuses a side-scroll file / a truncated map instead of
//      letting the editor half-load it.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

const WT = require(path.join(__dirname, '..', 'js', 'world-transfer.js'));

// ── Headless browser stubs (same shape as the other overhead tests).
global.window = global;
global.CANVAS_W = 800; global.CANVAS_H = 500; global.GAME_VERSION = 'v3 build 346 (transfer test)';
function stubCtx() { return new Proxy({ filter: 'none' }, { get(t, k) { if (k === 'measureText') return () => ({ width: 80 }); if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} }); if (k === 'canvas') return { width: 800, height: 500 }; if (k in t) return t[k]; return (typeof k === 'string') ? (() => {}) : undefined; }, set(t, k, v) { t[k] = v; return true; } }); }
const cls = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
function mkEl() { return { style: {}, classList: cls, appendChild() {}, addEventListener() {}, getContext: () => stubCtx(), getBoundingClientRect: () => ({ width: 800, height: 500, left: 0, top: 0 }), width: 800, height: 500 }; }
global.document = { getElementById: () => mkEl(), head: { appendChild() {} }, createElement: () => mkEl(), body: { appendChild() {}, classList: cls }, addEventListener() {} };
global.window.addEventListener = () => {}; global.window.dispatchEvent = () => {}; global.Event = function () {};
global.InputManager = function () { this.flush = () => {}; this.isJustDown = () => false; this.isDown = () => false; this.mouse = { x: 0, y: 0, clicked: false, down: false, rightClicked: false, moveVec: { x: 0, y: 0 } }; };
global.requestAnimationFrame = () => 0;
['palette', 'grid', 'buildings', 'movement', 'controls', 'combat', 'weapons', 'elevation', 'settings', 'daynight', 'redstone', 'templates', 'launch', 'game']
  .forEach((m) => require(path.join(__dirname, '..', 'js', 'overhead', 'overhead-' + m + '.js')));
const OverheadGame = global.OverheadGame, OH_SETTINGS = global.OH_SETTINGS;

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'overhead-qa-test-world.json'), 'utf8'));

console.log('wrap() — the v1 file format:');
const payload = WT.wrap(fixture, { name: 'Overhead QA Test', exportedAt: '2026-08-03T00:00:00.000Z' });
ok(payload.steveoExport === 1, 'stamps steveoExport: 1');
ok(payload.world_name === 'Overhead QA Test', 'carries the world name');
ok(payload.view_mode === 'overhead', "tags view_mode 'overhead' from the world data");
ok(payload.world_data && payload.world_data.mapSnapshot, 'nests the world under world_data');
ok(payload.exportedAt === '2026-08-03T00:00:00.000Z', 'uses the caller-supplied timestamp');
const sideWrap = WT.wrap({ blocks: [], gameModeDefault: 'PLT' }, { name: 'Side World' });
ok(sideWrap.view_mode === 'side', "a non-overhead world tags view_mode 'side'");
ok(sideWrap.game_mode_default === 'PLT', 'keeps the side-scroll game mode');

console.log('unwrap() — wrapper AND raw world:');
const fromWrapper = WT.unwrap(JSON.parse(JSON.stringify(payload)), 'ignored.json');
ok(fromWrapper.ok && fromWrapper.isOverhead, 'reads a wrapper as an overhead world');
ok(fromWrapper.name === 'Overhead QA Test', 'takes the name from the wrapper');
ok(fromWrapper.wrapped === true, 'reports that it was wrapped');
const fromRaw = WT.unwrap(JSON.parse(JSON.stringify(fixture)), 'my-fixture.json');
ok(fromRaw.ok && fromRaw.isOverhead, 'reads a RAW overhead world (no wrapper)');
ok(fromRaw.name === 'Overhead QA Test', "prefers the world's embedded name over the filename");
ok(fromRaw.wrapped === false, 'reports that it was NOT wrapped');
const noName = WT.unwrap({ viewMode: 'overhead', mapSnapshot: fixture.mapSnapshot }, 'my_cool-world.json');
ok(noName.name === 'my cool world', 'falls back to the file basename when no name is embedded');
ok(WT.unwrap(null).ok === false, 'refuses null');
ok(WT.unwrap([1, 2, 3]).ok === false, 'refuses an array');
ok(WT.unwrap({ world_data: 'nope' }).ok === false, 'refuses a wrapper whose world_data is not an object');

console.log('filename():');
ok(WT.filename('Overhead QA Test', '2026-08-03') === 'Overhead_QA_Test-2026-08-03.json', 'sanitises + dates the filename');
ok(WT.filename('Starter · Platformer', '') === 'Starter_Platformer.json', 'strips punctuation, no date when none given');
ok(WT.filename('', '') === 'world.json', 'falls back to world.json');

console.log('validateOverhead() — refuse, do not half-load:');
ok(WT.validateOverhead(fixture).ok, 'the real fixture validates');
const sideErr = WT.validateOverhead({ blocks: [], gameModeDefault: 'PLT' });
ok(!sideErr.ok && /viewMode/.test(sideErr.errors.join(' ')), 'a side-scroll world is refused (viewMode)');
ok(!WT.validateOverhead({ viewMode: 'overhead' }).ok, 'a world with no mapSnapshot is refused');
const truncated = JSON.parse(JSON.stringify(fixture));
truncated.mapSnapshot.ground = truncated.mapSnapshot.ground.slice(0, 3);
const tRes = WT.validateOverhead(truncated);
ok(!tRes.ok && /rows/.test(tRes.errors.join(' ')), 'a truncated ground array is refused (row count)');

console.log('ROUND TRIP — export then import must still run in the live runtime:');
// Mirror exactly what the editor does: wrap the payload Save would write, serialise it
// to a file, read it back, unwrap, migrate, construct.
const saved = Object.assign({}, fixture, { viewMode: 'overhead', gameModeDefault: 'NRM', schemaVersion: OH_SETTINGS.SCHEMA });
const fileText = JSON.stringify(WT.wrap(saved, { name: 'Overhead QA Test', exportedAt: '2026-08-03T00:00:00.000Z' }), null, 2);
const reread = WT.unwrap(JSON.parse(fileText), 'Overhead_QA_Test-2026-08-03.json');
ok(reread.ok && reread.isOverhead, 'the serialised file re-reads as an overhead world');
const imported = JSON.parse(JSON.stringify(reread.worldData));
OH_SETTINGS.migrate(imported);
ok(imported.schemaVersion === OH_SETTINGS.SCHEMA, 'migrate() leaves it at the current schema');

// The structural payload must survive byte-for-byte where it matters.
const m0 = fixture.mapSnapshot, m1 = imported.mapSnapshot;
ok(m1.gridW === m0.gridW && m1.gridH === m0.gridH, 'grid size survives (' + m1.gridW + '×' + m1.gridH + ')');
ok(m1.density === m0.density, 'density survives');
ok(JSON.stringify(m1.ground) === JSON.stringify(m0.ground), 'the full ground array survives unchanged');
ok((imported.redstone || []).length === (fixture.redstone || []).length,
   'the redstone board survives (' + (imported.redstone || []).length + ' devices)');
ok((imported.bridges || []).length === (fixture.bridges || []).length, 'the bridges survive');
ok((imported.items || []).length === (fixture.items || []).length, 'the items (keys) survive');
ok(JSON.stringify(imported.spawns) === JSON.stringify(fixture.spawns), 'the spawns survive');

let g = null;
try { g = new OverheadGame(JSON.parse(JSON.stringify(imported)), { testMode: true }, () => {}); ok(true, 'the imported world CONSTRUCTS in OverheadGame'); }
catch (e) { ok(false, 'construct threw: ' + e.message); }
if (g) {
  try { for (let i = 0; i < 5; i++) g._update(); ok(true, 'runs 5 frames without throwing'); }
  catch (e) { ok(false, 'update loop threw: ' + e.message); }
  ok(g._redstone.length === (fixture.redstone || []).length, 'the runtime sees every device after the round trip');
}

// A pre-schemaVersion file (what a world exported before build 345 looks like) must
// still import — this is the case the tester needs for the old fixtures.
console.log('LEGACY file (no schemaVersion) still imports:');
const legacy = JSON.parse(JSON.stringify(fixture));
delete legacy.schemaVersion;
const legacyRead = WT.unwrap(JSON.parse(JSON.stringify(WT.wrap(legacy, { name: 'Legacy' }))), 'legacy.json');
ok(legacyRead.ok, 'a wrapper around a pre-345 world unwraps');
const legacyWorld = JSON.parse(JSON.stringify(legacyRead.worldData));
OH_SETTINGS.migrate(legacyWorld);
ok(legacyWorld.schemaVersion === OH_SETTINGS.SCHEMA, 'the migrator upgrades it to the current schema');
try { const lg = new OverheadGame(JSON.parse(JSON.stringify(legacyWorld)), { testMode: true }, () => {}); lg._update(); ok(true, 'the migrated legacy world constructs + runs'); }
catch (e) { ok(false, 'legacy world threw: ' + e.message); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
