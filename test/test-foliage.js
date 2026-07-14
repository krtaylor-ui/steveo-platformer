// Headless tests for Smart Mobs §10 — decorative foliage (bushes / leaves):
//   - block ids exist, are non-solid, and carry the right shape/layer/occlusion flags
//   - isFoliageBlock / foliageOccludesSight helpers
//   - FOLIAGE_COLORS palette
//   - game-state _foliage() colour serialize round-trip
const fs = require('fs');
const vm = require('vm');
const jsDir = require('path').join(__dirname, '..', 'js');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  FAIL:', msg); } };

// ── Load blocks.js (BLOCK, BLOCK_DATA, FOLIAGE_COLORS, helpers) ──
const bSandbox = new Proxy({ Math, Object, console, BLOCK_SIZE: 32 }, {
  has: () => true,
  get: (t, k) => (k in t ? t[k] : (typeof k === 'symbol' ? undefined : 1)),
  set: (t, k, v) => { t[k] = v; return true; },
});
vm.createContext(bSandbox);
vm.runInContext(
  fs.readFileSync(`${jsDir}/blocks.js`, 'utf8') +
  '\n;this.BLOCK = BLOCK; this.BLOCK_DATA = BLOCK_DATA; this.FOLIAGE_COLORS = FOLIAGE_COLORS;' +
  '\n;this.isFoliageBlock = isFoliageBlock; this.foliageOccludesSight = foliageOccludesSight;',
  bSandbox, { filename: 'blocks.js' });
const { BLOCK, BLOCK_DATA, FOLIAGE_COLORS, isFoliageBlock, foliageOccludesSight } = bSandbox;

console.log('Foliage block ids + data:');
const ids = [BLOCK.BUSH_BACK, BLOCK.BUSH_FRONT, BLOCK.DECO_LEAVES_BACK, BLOCK.DECO_LEAVES_FRONT];
ok(ids.every(id => typeof id === 'number'), 'all four foliage ids defined');
ok(ids.every(id => BLOCK_DATA[id] && BLOCK_DATA[id].solid === false), 'foliage is non-solid');
ok(ids.every(id => BLOCK_DATA[id].isFoliage === true), 'foliage carries isFoliage flag');
ok(BLOCK_DATA[BLOCK.BUSH_FRONT].foliageFront === true && BLOCK_DATA[BLOCK.BUSH_BACK].foliageFront === false, 'front/back layer flag encoded per id');
ok(BLOCK_DATA[BLOCK.BUSH_BACK].foliageShape === 'bush' && BLOCK_DATA[BLOCK.DECO_LEAVES_BACK].foliageShape === 'leaves', 'shape flag per id');

console.log('Helpers:');
ok(ids.every(id => isFoliageBlock(id)), 'isFoliageBlock true for foliage');
ok(!isFoliageBlock(BLOCK.GRASS) && !isFoliageBlock(BLOCK.OAK_LEAVES), 'isFoliageBlock false for grass + decorative oak leaves');
ok(foliageOccludesSight(BLOCK.BUSH_BACK) && foliageOccludesSight(BLOCK.BUSH_FRONT), 'bushes occlude sight');
ok(!foliageOccludesSight(BLOCK.DECO_LEAVES_BACK) && !foliageOccludesSight(BLOCK.DECO_LEAVES_FRONT), 'leaves do NOT occlude sight');
ok(!foliageOccludesSight(BLOCK.OAK_LEAVES), 'existing oak leaves do NOT occlude sight');

console.log('Palette:');
ok(Array.isArray(FOLIAGE_COLORS) && FOLIAGE_COLORS.length === 3, 'three foliage colours');
ok(FOLIAGE_COLORS[0].name === 'Green', 'index 0 = green (default)');

// ── Load game-state.js and exercise _foliage() colour serialize ──
const gsSandbox = new Proxy({ Math, Object, console, Number, JSON, Array, Date: { now: () => 1 } }, {
  has: () => true,
  get: (t, k) => (k in t ? t[k] : (typeof k === 'symbol' ? undefined : 1)),
  set: (t, k, v) => { t[k] = v; return true; },
});
vm.createContext(gsSandbox);
vm.runInContext(
  fs.readFileSync(`${jsDir}/game-state.js`, 'utf8') + '\n;this.GAME_STATE = GAME_STATE;',
  gsSandbox, { filename: 'game-state.js' });
const GAME_STATE = gsSandbox.GAME_STATE;

console.log('Foliage colour serialize:');
const foliageMap = { '3,4': 2, '3,5': 1, '7,7': 0 /* zero → dropped */ };
const serialized = GAME_STATE._foliage({ _foliageColorMap: foliageMap });
ok(serialized.length === 2, 'only non-zero colours serialized');
ok(serialized.some(f => f.row === 3 && f.col === 4 && f.color === 2), '(3,4)=orange preserved');
ok(serialized.some(f => f.row === 3 && f.col === 5 && f.color === 1), '(3,5)=yellow preserved');
ok(GAME_STATE._foliage({}).length === 0, 'no map → empty array');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
