// Overhead editor: incremental terrain-cache patching (fast editing on big maps) +
// bridge width bands. Exercises OH_EDITOR's cache methods on a lightweight fake context.
//   node test/test-overhead-editor-perf.js
global.window = global; global.CANVAS_W = 800; global.CANVAS_H = 500; global.GAME_VERSION = 'v3 build 327 (editor-perf test)';
function stubCtx() { return new Proxy({ filter: 'none', globalAlpha: 1, imageSmoothingEnabled: true, canvas: { width: 1, height: 1 } }, { get(t, k) { if (k === 'measureText') return () => ({ width: 8 }); if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} }); if (k === 'getContext') return () => stubCtx(); if (k === 'drawImage') return () => {}; if (k in t) return t[k]; return (typeof k === 'string') ? (() => {}) : undefined; }, set(t, k, v) { t[k] = v; return true; } }); }
const cls = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
function mkCanvas() { return { style: {}, classList: cls, width: 1, height: 1, getContext: () => stubCtx(), getBoundingClientRect: () => ({ width: 800, height: 500, left: 0, top: 0 }) }; }
global.document = { getElementById: () => mkCanvas(), head: { appendChild() {} }, createElement: () => mkCanvas(), body: { appendChild() {}, classList: cls }, addEventListener() {} };
global.window.addEventListener = () => {}; global.window.dispatchEvent = () => {}; global.Event = function () {};
global.InputManager = function () { this.flush = () => {}; this.isJustDown = () => false; this.isDown = () => false; this.mouse = { x: 0, y: 0, moveVec: { x: 0, y: 0 } }; };
global.requestAnimationFrame = () => 0;
const path = require('path');
['palette', 'grid', 'buildings', 'movement', 'controls', 'combat', 'weapons', 'elevation', 'settings', 'daynight', 'redstone', 'templates', 'launch', 'editor']
  .forEach((m) => require(path.join(__dirname, '..', 'js', 'overhead', 'overhead-' + m + '.js')));
const OH_EDITOR = global.OH_EDITOR, OVERHEAD = global.OVERHEAD;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

console.log('Bridge width bands:');
{
  const h = OVERHEAD.bridgeSpanCells({ from: { col: 2, row: 5 }, to: { col: 8, row: 5 }, width: 3 });
  ok(h.length === 7 * 3, 'a 3-wide horizontal span covers 7×3 cells');
  ok(h.some((c) => c.row === 4) && h.some((c) => c.row === 6), 'the band widens perpendicular to the run (rows 4 & 6)');
  const v = OVERHEAD.bridgeSpanCells({ from: { col: 3, row: 2 }, to: { col: 3, row: 9 }, width: 2 });
  ok(v.some((c) => c.col === 3) && v.some((c) => c.col === 4), 'a vertical span widens across columns');
  ok(OVERHEAD.bridgeSpanCells({ from: { col: 1, row: 1 }, to: { col: 5, row: 1 } }).length === 5, 'no width = the original 1-wide line');
}

console.log('Incremental terrain-cache patch:');
{
  const W = 120, H = 90, ground = [], elevation = [];
  for (let r = 0; r < H; r++) { ground.push(new Array(W).fill('grass')); elevation.push(new Array(W).fill(0)); }
  const m = { gridW: W, gridH: H, cell: 8, ground, elevation }, g = { cell: 8, masterZoom: 1 };
  OVERHEAD._elevScale = 1;
  const ed = { view: { elev: false, hideAbove: false }, elevLevel: 2, world: { mapSnapshot: m, settings: { playerHeight: 1 } }, grid: g,
    _mapMaxElev: OH_EDITOR._mapMaxElev, _buildTerrCache: OH_EDITOR._buildTerrCache, _patchTerrCache: OH_EDITOR._patchTerrCache, _paintTerrainRegion: OH_EDITOR._paintTerrainRegion, _markDirty: OH_EDITOR._markDirty, _capE: OH_EDITOR._capE };
  ed._buildTerrCache(m, g, ed._mapMaxElev.call(ed));
  ok(!!ed._terrCache && ed._terrCacheMaxE === 5, 'the cache builds with elevation headroom (padMax = maxE + 4)');
  for (let r = 10; r < 14; r++) for (let c = 20; c < 24; c++) { ed._markDirty(c, r); ground[r][c] = 'stone'; elevation[r][c] = 2; }
  ok(ed._editBox && ed._editBox.c0 === 20 && ed._editBox.c1 === 23, '_markDirty tracks the painted bounding box');
  let threw = false; try { ok(ed._patchTerrCache(ed._editBox) === true, 'a patch within the headroom succeeds (no full rebuild)'); } catch (e) { threw = true; console.log('  threw:', e.message); }
  ok(!threw, 'the patch does not throw');
  ed._markDirty(30, 30); elevation[30][30] = 12;
  ok(ed._patchTerrCache(ed._editBox) === false, 'a patch past the pad headroom refuses (signals a full rebuild)');
  ed.view.elev = true; let t2 = false; try { ed._buildTerrCache(m, g, ed._mapMaxElev.call(ed)); ed._patchTerrCache({ c0: 20, r0: 10, c1: 23, r1: 13 }); } catch (e) { t2 = true; }
  ok(!t2, 'patching the elevation-map view does not throw');
  ed.view.elev = false; ed.view.hideAbove = true; let t3 = false; try { ed._buildTerrCache(m, g, ed._mapMaxElev.call(ed)); ed._patchTerrCache({ c0: 20, r0: 10, c1: 23, r1: 13 }); } catch (e) { t3 = true; }
  ok(!t3, 'patching with hide-above-elev does not throw');
}

console.log('Cache patch snaps to whole pixels (build 362):');
{
  const src2 = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'overhead', 'overhead-editor.js'), 'utf8');
  const fn = src2.slice(src2.indexOf('_paintTerrainRegion(cx, orig'), src2.indexOf('_drawEditRegion(ctx, S, cs'));
  ok(/const rx = Math\.floor\(cr0\.x - up\), ry = Math\.floor\(cr0\.y - up\)/.test(fn),
     'the cleared region starts on a whole pixel');
  ok(/rw = Math\.ceil\(cr1\.x \+ 2\) - rx, rh = Math\.ceil\(cr1\.y \+ 2\) - ry/.test(fn),
     'and ends on one, so repeated patches land on identical boundaries');
  ok(/offPerLevel = unit \? \(qf \/ unit\) : 0\.22/.test(fn), 'reach follows the real elevation offset');
  ok(/Math\.max\(0\.22, offPerLevel\)/.test(fn), 'and never shrinks below the old assumption');
  ok(!/reach = Math\.ceil\(maxE \* 0\.22\) \+ 3;/.test(fn), 'the hardcoded 0.22 is gone (elevOffset goes to 0.5)');
  ok(/id="oh-clean"/.test(src2) && /Map redrawn/.test(src2), 'a Clean button forces a full rebuild as an escape hatch');
}

console.log('The editor render must not throw, or leak canvas state (QA F-EDITOR-LOOP):');
{
  const src3 = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'overhead', 'overhead-editor.js'), 'utf8');
  // Dangling since build 327, thrown ~138x/sec whenever the Perf overlay was on, aborting
  // _render at that line so nothing after it drew.
  // Strip comments first — the fix's own comment NAMES the dead identifier to explain it, and
  // an assertion that reads prose is testing documentation, not code. (Second time today.)
  const code3 = src3.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  ok(!/editingLive/.test(code3), 'the dangling `editingLive` reference is gone from the CODE');
  ok(/this\._editBox \? 'CACHED \+ live patch/.test(src3), 'the Perf overlay reports the real live-patch state instead');
  // A throw between the clip's save() and restore() used to leak one canvas state per frame.
  ok(/if \(this\._clipOwed\) \{ try \{ ctx\.restore\(\); \} catch \(e\) \{\} this\._clipOwed = false; \}/.test(src3),
     'an unpaid restore from a faulted frame is settled before saving again');
  ok(/this\._clipOwed = true;/.test(src3) && /ctx\.restore\(\); this\._clipOwed = false;/.test(src3),
     'the flag is set on save and cleared on restore, so the stack cannot grow');
  // Every remaining identifier in the Perf overlay block must actually exist in scope.
  const perf = src3.slice(src3.indexOf('if (this.view.perf) {'), src3.indexOf('// Distinct MAP-EDGE indicator'));
  ok(!/\$\{[a-zA-Z_][a-zA-Z0-9_]*\s*\?/.test(perf.replace(/\$\{this\.[^}]*/g, '')) || /this\._editBox/.test(perf),
     'the overlay interpolates only in-scope values');
}

console.log(`\noverhead editor perf: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
