// Overhead accessory rendering (Custom Sprites Phase 1) — a headless render smoke test.
//   node test/test-overhead-sprite-accessories.js
// Drives OVERHEAD.drawOverheadPlayer for EVERY character (with its feat + palette) through a stub
// canvas, so any throw in the accessory code (_ohAccHead / _ohAccBehind) is caught. Also confirms
// the accessory helpers exist and that an unknown character falls back cleanly.
global.window = global;
function stubCtx() {
  return new Proxy({ filter: 'none', globalAlpha: 1 }, {
    get(t, k) { if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (k in t) return t[k]; return (typeof k === 'string') ? (() => {}) : undefined; },
    set(t, k, v) { t[k] = v; return true; } });
}
const path = require('path');
require(path.join(__dirname, '..', 'js', 'overhead', 'overhead-palette.js'));
require(path.join(__dirname, '..', 'js', 'overhead', 'overhead-launch.js'));
const { CHARACTERS } = require(path.join(__dirname, '..', 'js', 'characters.js'));
const OVERHEAD = global.OVERHEAD;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

console.log('Overhead accessories — helpers + render smoke:');
ok(OVERHEAD && typeof OVERHEAD.drawOverheadPlayer === 'function', 'drawOverheadPlayer present');
ok(typeof OVERHEAD._ohAccHead === 'function' && typeof OVERHEAD._ohAccBehind === 'function', 'accessory helpers present');

const ctx = stubCtx();
let threw = null;
CHARACTERS.list().forEach((c) => {
  try {
    // moving walk, with spin/somersault variants to exercise the transformed context too
    OVERHEAD.drawOverheadPlayer(ctx, 120, 120, 22, 30, true, 0.6, { character: CHARACTERS.feat(c.id), palette: CHARACTERS.defaultPalette(c.id), weapon: null });
    OVERHEAD.drawOverheadPlayer(ctx, 120, 120, 22, 30, true, 0.6, { character: CHARACTERS.feat(c.id), palette: CHARACTERS.defaultPalette(c.id), weapon: null, spin: 1.2 });
    OVERHEAD.drawOverheadPlayer(ctx, 120, 120, 22, 30, false, 0, { character: CHARACTERS.feat(c.id), palette: CHARACTERS.defaultPalette(c.id), weapon: null, somersault: 0.5 });
  } catch (e) { threw = c.id + ': ' + e.message; }
});
ok(!threw, 'every character renders (walk + spin + somersault) without throwing' + (threw ? ' — ' + threw : ''));

// unknown character id -> classic feat (no throw), and no-feat default is safe
let threw2 = null;
try { OVERHEAD.drawOverheadPlayer(ctx, 100, 100, 20, 0, true, 0, { character: CHARACTERS.feat('does-not-exist'), palette: CHARACTERS.defaultPalette('does-not-exist'), weapon: null });
  OVERHEAD.drawOverheadPlayer(ctx, 100, 100, 20, 0, true, 0, { weapon: null }); } catch (e) { threw2 = e.message; }
ok(!threw2, 'unknown id + no-feat both render safely' + (threw2 ? ' — ' + threw2 : ''));

console.log(`\noverhead sprite accessories: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
