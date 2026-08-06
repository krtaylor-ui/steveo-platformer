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

// Build 362 (QA A9): an arbitrary JSON file used to be ACCEPTED as a raw world, announced as
// "Imported: <filename>" and written into the world list under a name from its filename.
console.log('A file has to actually be a world:');
ok(WT.unwrap({ foo: 1, bar: [2, 3] }, 'notes.json').ok === false, 'a JSON file with no map data is refused');
ok(/not a Steveo world/.test(WT.unwrap({ foo: 1 }, 'notes.json').error), 'and says so in those words');
ok(WT.unwrap({ hello: 'world' }, 'x.json').ok === false, 'including one that merely mentions a world');
// Every shape a real world can arrive in must still pass — old exports included.
ok(WT.unwrap({ blocks: [] }, 'a.json').ok === true, 'a side-scroll world with blocks[] passes');
ok(WT.unwrap({ level: {} }, 'b.json').ok === true, 'one with a level object passes');
ok(WT.unwrap({ width: 40, height: 20 }, 'c.json').ok === true, 'one with only a size passes (old exports)');
ok(WT.unwrap({ mapSnapshot: { gridW: 4 } }, 'd.json').ok === true, 'an overhead-shaped file with no viewMode flag passes');
ok(WT.unwrap(fixture, 'e.json').ok === true, 'and the real overhead fixture still passes');

console.log('filename():');
ok(WT.filename('Overhead QA Test', '2026-08-03') === 'Overhead_QA_Test-2026-08-03.json', 'sanitises + dates the filename');
ok(WT.filename('Starter · Platformer', '') === 'Starter_Platformer.json', 'strips punctuation, no date when none given');
ok(WT.filename('', '') === 'world.json', 'falls back to world.json');

console.log('validateOverhead() — refuse, do not half-load:');
ok(WT.validateOverhead(fixture).ok, 'the real fixture validates');
const sideErr = WT.validateOverhead({ blocks: [], gameModeDefault: 'PLT' });
// Build 347 (QA F6) re-phrased this: a wrong-ENGINE file is refused as such, and must NOT
// be described with schema internals — that read as "your file is corrupt".
ok(!sideErr.ok && sideErr.kind === 'wrong-engine', 'a side-scroll world is refused as wrong-engine');
ok(!/mapSnapshot|viewMode/.test(sideErr.errors.join(' ')), 'the refusal avoids schema internals');
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

// A9.6 — a wrong-engine / non-world file must be REPORTED, not silently re-routed.
console.log('A9.6 — the sandbox importer surfaces unwrap()\'s rejection instead of falling through:');
{
  // unwrap() itself rejects a file that is neither engine's world.
  const junk = WT.unwrap({ hello: 'world', numbers: [1, 2, 3] }, 'notes.json');
  ok(!junk.ok, 'a plain JSON object that is neither engine unwraps as NOT ok');
  ok(/not a Steveo world/i.test(junk.error || ''), 'and carries an explicit reason to show the user');
  // A recognisable side-scroll world is still accepted (the sandbox takes both engines).
  const ss = WT.unwrap({ blocks: [[0, 1]], width: 20, height: 10 }, 'level.json');
  ok(ss.ok && !ss.isOverhead, 'a real side-scroll world still imports (not rejected as wrong-engine)');
  // The importer must consult res.ok before its raw local/server fall-through. Assert the
  // guard against CODE, not comments (lesson 5) — the previous bug was exactly that the
  // fall-through ignored res.ok.
  const sbSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'sandbox-ui.js'), 'utf8')
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const importStart = sbSrc.indexOf('async importFile(');
  const importFn = sbSrc.slice(importStart, sbSrc.indexOf('APP_MODE.isLocal()', importStart));
  ok(/if \(!res\.ok\) \{ this\._importError\(res\.error/.test(importFn),
     'importFile() reports res.error and returns BEFORE the raw local/server import');
}

// §40.1 — "Hide from export" flag: one predicate, honoured client + server.
console.log('§40.1 — exportHidden()/exportAllowed() and the server owner-exception:');
{
  ok(WT.exportHidden({}) === false, 'a world with no flag is exportable by default');
  ok(WT.exportAllowed({}) === true, 'exportAllowed is the inverse');
  ok(WT.exportHidden({ hideFromExport: true }) === true, 'a top-level flag hides it');
  ok(WT.exportHidden({ worldAdvSettings: { hideFromExport: true } }) === true, 'a side-scroll settings flag hides it');
  ok(WT.exportHidden({ settings: { hideFromExport: true } }) === true, 'an overhead settings flag hides it');
  ok(WT.exportHidden({ settings: { hideFromExport: false } }) === false, 'explicitly false stays exportable');
  ok(WT.exportHidden(null) === false && WT.exportHidden(undefined) === false, 'a missing world is treated as exportable (no crash)');
  // Server route: 403 for a NON-owner on a hidden world; the OWNER is always allowed; and
  // export otherwise stays owner-only. Assert against comment-stripped source (lesson 5).
  const routeSrc = fs.readFileSync(path.join(__dirname, '..', 'server', 'worlds-routes.js'), 'utf8')
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const exp = routeSrc.slice(routeSrc.indexOf("'/api/worlds/sandbox/:worldId/export'"), routeSrc.indexOf("'/api/worlds/sandbox/:worldId'"));
  ok(/const isOwner = world\.creator_id === req\.user\.id/.test(exp), 'the route computes ownership');
  ok(/if \(!isOwner && WORLD_TRANSFER\.exportHidden\(world\.world_data\)\)[\s\S]*?status\(403\)/.test(exp), 'a NON-owner exporting a hidden world gets 403');
  ok(exp.indexOf('status(403)') < exp.indexOf('if (!isOwner) return res.status(404)'), 'the owner-exception is checked BEFORE the owner-only 404, so the owner is never blocked');
  ok(!/\.eq\('creator_id', req\.user\.id\)/.test(exp), 'the fetch is no longer creator-scoped (so it can tell owner from stranger)');

  // Three client UI sites hide Export when the flag is set (comment-stripped source).
  const strip = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const sb = strip('js/sandbox-ui.js');
  ok(/WORLD_TRANSFER\.exportHidden\(w\.world_data\)\) \? '' :/.test(sb), 'site 1: the world-card Export button is not rendered when hidden');
  ok(/exBtn\.style\.display = \(typeof WORLD_TRANSFER[\s\S]*?exportHidden\(world\.world_data\)\) \? 'none'/.test(sb), 'site 2: the editor/play-HUD Export button is hidden when the open world is hidden');
  const ed = strip('js/overhead/overhead-editor.js');
  ok(/WORLD_TRANSFER\.exportHidden\(this\.world\)\) \? '' :/.test(ed), 'site 3: the overhead editor ⬇ Export button is not rendered when hidden');
  ok(/const ex = g\('oh-export'\); if \(ex\)/.test(ed), 'and its click wiring is guarded so an absent button does not throw');
  // The toggle to SET the flag exists in BOTH settings surfaces, labelled per the brief.
  ok(/key: 'hideFromExport'[\s\S]*?label: 'Hide from export'/.test(strip('js/world-settings-ui.js')), 'side-scroll settings expose a "Hide from export" toggle');
  ok(/TOG\('hideFromExport'|key: 'hideFromExport'/.test(strip('js/overhead/overhead-settings.js')), 'overhead settings expose a "Hide from export" toggle (now a schema row)');
  // QA 368: the full offline-overhead chain — a SAVED overhead world (settings.hideFromExport)
  // reaches the world-card as world_data.settings and hides the card's Export button.
  const savedOverhead = { viewMode: 'overhead', name: 'W', settings: { hideFromExport: true, moveSpeed: 0.11 } };
  const listEntry = { id: 'oh-W', world_name: 'W', world_data: savedOverhead };   // shape SANDBOX._ohStore() maps to
  ok(WT.exportHidden(listEntry.world_data) === true, '368: a saved overhead world hides Export at the card (world_data.settings.hideFromExport)');
  ok(WT.exportHidden({ viewMode: 'overhead', settings: {} }) === false, '368: an overhead world without the flag still shows Export');
  // QA 368: the LABEL must not make a protection/"can't download" claim (the brief: "Hide from
  // export", never "Protect"). The over-claim was also literally false while the card bug lived.
  const ohLabel = strip('js/overhead/overhead-settings.js');
  ok(/'hideFromExport', G_LOCK, 'Hide from export'/.test(ohLabel), '368: the overhead label is exactly "Hide from export" (no parenthetical claim)');
  ok(!/can.t download a copy|can.t grab a copy/.test(ohLabel), '368: no "can\'t download/grab a copy" protection claim in the overhead label/hint');
  ok(!/can.t download a copy/.test(strip('js/world-settings-ui.js')), '368: the side-scroll hint drops the "can\'t download a copy" claim too');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
