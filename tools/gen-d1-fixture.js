// ══════════════════════════════════════════════════════════════════════════
// Density-1 test FIXTURE generator (QA).
//   node tools/gen-d1-fixture.js
// Emits tools/overhead-worlds/mega-fixture-d1.json — a DENSITY-1 overhead world
// carrying exactly what the 363 (lever hit-area) and 369 (pipe climb-in) d1
// COMPARISON halves need: a lever on flat ground, a lever on a RAISED block, and
// two LINKED pipes with open ground to walk into from below. Also a small pit +
// raised wall + a mob/item so it doubles as a general d1 sanity map.
// Import via Sandbox -> "Import from file"; it lands in the Overhead browser.
// Validated headlessly here by loading the real OverheadGame + running frames and
// asserting the two pipes actually link — same harness as gen-overhead-worlds.js.
// ══════════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = path.join(__dirname, 'overhead-worlds');

// ── Load the engine headlessly (canvas/DOM stubs; identical to the main generator) ──
global.window = global;
function stubCtx() { return new Proxy({}, { get(t, k) { if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} }); if (k === 'measureText') return () => ({ width: 0 }); if (k === 'canvas') return { width: 800, height: 500 }; return (typeof k === 'string') ? (() => {}) : undefined; }, set() { return true; } }); }
const cls = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
function mkEl() { return { style: {}, classList: cls, appendChild() {}, addEventListener() {}, getContext: () => stubCtx(), getBoundingClientRect: () => ({ width: 800, height: 500, left: 0, top: 0 }), width: 800, height: 500 }; }
global.document = { getElementById: () => mkEl(), head: { appendChild() {} }, createElement: () => mkEl(), body: { appendChild() {}, classList: cls }, addEventListener() {} };
global.window.addEventListener = () => {}; global.window.dispatchEvent = () => {}; global.Event = function () {};
global.InputManager = function () { this.flush = () => {}; this.isJustDown = () => false; this.isDown = () => false; this.justPressed = () => false; this.mouse = { x: 0, y: 0, clicked: false, down: false, rightClicked: false, moveVec: { x: 0, y: 0 } }; };
global.requestAnimationFrame = () => 0;
['palette', 'grid', 'buildings', 'movement', 'controls', 'combat', 'weapons', 'elevation', 'settings', 'daynight', 'redstone', 'templates', 'launch', 'game']
  .forEach((m) => require(path.join(ROOT, 'js/overhead/overhead-' + m + '.js')));
const OverheadGame = global.OverheadGame, OH_SETTINGS = global.OH_SETTINGS, OH_BUILDINGS = global.OH_BUILDINGS;

// ── Minimal builder (density 1) ──────────────────────────────────────────────
const W = 24, H = 16;
const ground = [], elevation = [];
for (let r = 0; r < H; r++) { ground.push(new Array(W).fill('grass')); elevation.push(new Array(W).fill(0)); }
const set = (c, r, key, e) => { if (c < 0 || r < 0 || c >= W || r >= H) return; ground[r][c] = key; if (e != null) elevation[r][c] = e; };
const rect = (c0, r0, c1, r1, key, e) => { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) set(c, r, key, e); };

// A short raised WALL (elev 2) mid-map, with open ground to its NORTH (row above) — the 363
// wall context. A raised BLOCK to stand a lever on. A small PIT. All clear of the bottom
// corridor (rows 13-14) so spawn->goal stays a straight, reachable walk.
rect(9, 6, 13, 6, 'stone', 2);     // raised wall across the middle
set(8, 8, 'stone', 2);             // a single raised block to seat the raised lever on
rect(3, 3, 4, 4, 'pit', 0);        // a small pit in flat ground

const redstone = [
  { col: 5,  row: 8, kind: 'lever', on: false, channel: 'gate', txId: 1 },   // lever on FLAT ground
  { col: 8,  row: 8, kind: 'lever', on: false, channel: 'gate', txId: 2 },   // lever on the RAISED block (elev 2)
];

// Two LINKED pipes (config.dest = the other's anchor key "col,row"). Open ground below each
// (row 9) so you walk in from the south, matching the 369 approach.
const buildings = [
  { typeId: 'pipe', col: 15, row: 8, config: { dest: '20,8' } },
  { typeId: 'pipe', col: 20, row: 8, config: { dest: '15,8' } },
];

const world = {
  name: 'Mega Fixture (d1)', mode: 'platformer', viewMode: 'overhead', gameModeDefault: 'NRM',
  // Fixed (not Date.now) so re-running the tool is deterministic and doesn't churn the file.
  // Without it the Sandbox card shows "Created: -" (the nit the tester flagged).
  created_at: '2026-08-07T00:00:00.000Z',
  controlScheme: 'free-aim', angleLockDeg: 0, rules: {},
  mapSnapshot: { gridW: W, gridH: H, density: 1, baseW: W, baseH: H, cell: 32, objectScaleMode: 'independent', ground, elevation, decorations: [] },
  buildings,
  mobs: [{ col: 18, row: 12, type: 'zombie', hp: 8, speed: 1.4, detect: 6 }],
  items: [{ col: 6, row: 12, kind: 'coin', itemKey: 'coin' }],
  spawns: [{ col: 2, row: 13 }], ramps: [], bridges: [], redstone,
  goal: { col: 21, row: 13, color: 0 },
  // pitMode default = 'block' (post-370) so the pit does NOT kill during 369 testing; 366's
  // deadly-pit case is a separate world. Everything else = engine defaults.
  settings: OH_SETTINGS.defaults(),
};

// ── Validate: load the real engine, run frames, assert the pipes actually link ──
const issues = [];
try {
  const g = new OverheadGame(JSON.parse(JSON.stringify(world)), { testMode: true }, () => {});
  for (let f = 0; f < 8; f++) { g._update(); g._render(); }
  // Both pipes registered, and each dest resolves to the other.
  const byKey = g._portalByKey;
  if (!byKey || byKey.size !== 2) issues.push('expected 2 linked pipes, got ' + (byKey ? byKey.size : 'none'));
  for (const b of world.buildings) { if (!byKey.get(b.config.dest)) issues.push('pipe at ' + b.col + ',' + b.row + ' has an unresolved dest ' + b.config.dest); }
  // Spawn/goal sanity.
  const sp = world.spawns[0];
  if (ground[sp.row][sp.col] === 'pit') issues.push('spawn on a pit');
  if (!world.goal || ground[world.goal.row][world.goal.col] === 'pit') issues.push('goal missing/on a pit');
  // Density is 1 (the whole point).
  if (world.mapSnapshot.density !== 1) issues.push('density is not 1');
  // Pipe footprint at d1 should be small (1 cell) — sanity that density scaling is on.
  const fp = OH_BUILDINGS.footprintOf('pipe', 1);
  if (!(fp.w >= 1 && fp.h >= 1)) issues.push('pipe footprint at d1 looks wrong: ' + JSON.stringify(fp));
  console.log('pipe footprint @ d1 =', fp.w + 'x' + fp.h, '| linked pipes =', byKey.size);
} catch (e) { issues.push("engine threw: " + e.message); console.error(e.stack); }

if (issues.length) { console.error('FIXTURE INVALID:\n - ' + issues.join('\n - ')); process.exit(1); }

// ── Emit (raw overhead object + world_name, matching the sample format) ──
world.world_name = world.name;
const file = path.join(OUT, 'mega-fixture-d1.json');
fs.writeFileSync(file, JSON.stringify(world, null, 2));
console.log('OK -> ' + path.relative(ROOT, file));
