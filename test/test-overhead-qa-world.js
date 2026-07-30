// Regression test around a REAL browser-saved overhead world (the QA board built by
// the Chrome browser-tester on build 307): 40×26, 45 redstone devices covering every
// kind, 3 bridges (incl. a drawbridge), 6 ramps, key + lock, pit/lava/glowstone.
//   node test/test-overhead-qa-world.js
// It pins two things that only a real saved world exercises:
//   1. the exact saved SCHEMA still constructs + runs in the live OverheadGame, and
//   2. the dust-is-wire / sinks-receive-only fix holds against LEGACY data — this save
//      predates the fix, so 22 dust cells carry stale txIds that must NOT broadcast.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

// ── Headless browser stubs (canvas/document/input), mirroring the other overhead tests.
global.window = global;
global.CANVAS_W = 800; global.CANVAS_H = 500; global.GAME_VERSION = 'v3 build 311 (qa fixture)';
function stubCtx() { return new Proxy({ filter: 'none' }, { get(t, k) { if (k === 'measureText') return () => ({ width: 80 }); if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} }); if (k === 'canvas') return { width: 800, height: 500 }; if (k in t) return t[k]; return (typeof k === 'string') ? (() => {}) : undefined; }, set(t, k, v) { t[k] = v; return true; } }); }
const cls = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
function mkEl() { return { style: {}, classList: cls, appendChild() {}, addEventListener() {}, getContext: () => stubCtx(), getBoundingClientRect: () => ({ width: 800, height: 500, left: 0, top: 0 }), width: 800, height: 500 }; }
global.document = { getElementById: () => mkEl(), head: { appendChild() {} }, createElement: () => mkEl(), body: { appendChild() {}, classList: cls }, addEventListener() {} };
global.window.addEventListener = () => {}; global.window.dispatchEvent = () => {}; global.Event = function () {};
global.InputManager = function () { this.flush = () => {}; this.isJustDown = () => false; this.isDown = () => false; this.mouse = { x: 0, y: 0, clicked: false, down: false, rightClicked: false, moveVec: { x: 0, y: 0 } }; };
global.requestAnimationFrame = () => 0;
['palette', 'grid', 'buildings', 'movement', 'controls', 'combat', 'weapons', 'elevation', 'settings', 'daynight', 'redstone', 'launch', 'game']
  .forEach((m) => require(path.join(__dirname, '..', 'js', 'overhead', 'overhead-' + m + '.js')));
const OverheadGame = global.OverheadGame, OH_REDSTONE = global.OH_REDSTONE;

const w = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'overhead-qa-test-world.json'), 'utf8'));

console.log('QA world — schema still loads + runs in the live runtime:');
let g = null;
try { g = new OverheadGame(JSON.parse(JSON.stringify(w)), { testMode: true }, () => {}); ok(true, 'constructs'); }
catch (e) { ok(false, 'constructs — threw ' + e.message); }
if (g) {
  try { for (let i = 0; i < 5; i++) g._update(); ok(true, 'runs 5 frames without throwing'); }
  catch (e) { ok(false, 'update loop threw ' + e.message); }
  ok(g._redstone.length === 45, 'all 45 redstone devices survived load (' + g._redstone.length + ')');
  ok((g._bridges || []).length === 3, '3 bridges loaded');

  console.log('Legacy dust/sinks (baked txIds) must NOT broadcast:');
  const dustTx = g._redstone.filter((d) => d.kind === 'dust' && d.txId != null);
  ok(dustTx.length > 0, 'fixture actually carries legacy dust txIds (' + dustTx.length + ') to test against');
  for (const d of g._redstone) if (d.kind === 'lever') d.on = true;      // energise the whole board
  const r = OH_REDSTONE.evaluate(g._redstone);
  const dustLeak = dustTx.filter((d) => r.channels['T' + d.txId]);
  const sinkLeak = g._redstone.filter((d) => ['lamp', 'piston', 'rx'].indexOf(d.kind) >= 0 && d.txId != null && r.channels['T' + d.txId]);
  ok(dustLeak.length === 0, 'no dust cell broadcasts a channel (leaks: ' + dustLeak.length + ')');
  ok(sinkLeak.length === 0, 'no sink (lamp/piston/rx) broadcasts a channel (leaks: ' + sinkLeak.length + ')');
}

console.log(`\noverhead QA world: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
