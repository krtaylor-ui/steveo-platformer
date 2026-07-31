// §Glass (side-scroll) — the GLASS block exists (solid, minable, see-through) and
// _shatterGlassBlock breaks it into shards when the world allows shattering, else leaves
// it intact. Shared by every trigger (arrow / head-butt / hard fall / explosion).
//   node test/test-glass-block.js
const fs = require('fs'), vm = require('vm');
const jsDir = require('path').join(__dirname, '..', 'js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const real = { window: {}, document: {}, Math, console, Set, Map, Array, Object, JSON, Number, String, Boolean, isNaN, parseInt, parseFloat };
const sandbox = new Proxy(real, { has: () => true, get: (t, k) => (k in t ? t[k] : (typeof k === 'symbol' ? undefined : 1)), set: (t, k, v) => { t[k] = v; return true; } });
vm.createContext(sandbox);
const load = (f, e) => vm.runInContext(fs.readFileSync(`${jsDir}/${f}`, 'utf8') + (e ? `\n;${e}` : ''), sandbox, { filename: f });
load('constants.js', 'this.BLOCK_SIZE=BLOCK_SIZE;');
load('blocks.js', 'this.BLOCK=BLOCK; this.BLOCK_DATA=BLOCK_DATA; this.drawBlock=drawBlock;');
load('travel-tube.js'); load('moving-platform.js', 'this.MOVING_PLATFORM=MOVING_PLATFORM;');
load('redstone.js', 'this.RedstoneSystem=RedstoneSystem;'); load('game.js', 'this.Game=Game;');
const { Game, BLOCK, BLOCK_DATA, drawBlock } = sandbox;

console.log('Glass block definition:');
ok(typeof BLOCK.GLASS === 'number', 'BLOCK.GLASS is defined');
const gp = BLOCK_DATA[BLOCK.GLASS];
ok(gp && gp.solid === true, 'glass is solid');
ok(gp && gp.mineable === true, 'glass is minable (Normal mode)');
ok(gp && gp.isGlass === true, 'glass carries the isGlass flag');
{ // render smoke
  const grad = { addColorStop() {} };
  const ctx = new Proxy({}, { get(t, k) { if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad; return (typeof k === 'string') ? (() => {}) : undefined; }, set() { return true; } });
  let threw = false; try { drawBlock(ctx, BLOCK.GLASS, 0, 0, 0, {}); } catch (e) { threw = true; }
  ok(!threw, 'drawBlock(GLASS) renders without throwing');
}

console.log('_shatterGlassBlock (shared by every trigger):');
function mkGame(shatterSetting) {
  const g = Object.create(Game.prototype);
  const grid = { 5: { 5: BLOCK.GLASS, 6: BLOCK.STONE } };
  g.level = { get: (r, c) => (grid[r] && grid[r][c] != null ? grid[r][c] : BLOCK.AIR), set: (r, c, v) => { (grid[r] || (grid[r] = {}))[c] = v; } };
  g._worldAdvSettings = { glassShatter: shatterSetting };
  g._fx = 0; g._shatterFx = () => { g._fx++; }; g._playSound = () => {};
  return g;
}
{
  const g = mkGame(true);
  const broke = g._shatterGlassBlock(5, 5);
  ok(broke === true && g.level.get(5, 5) === BLOCK.AIR, 'shatter ON: glass breaks to AIR');
  ok(g._fx === 1, 'shatter spawns the shard FX');
  ok(g._shatterGlassBlock(5, 6) === false, 'a non-glass block (stone) is not shattered');
}
{
  const g = mkGame(false);
  ok(g._shatterGlassBlock(5, 5) === false && g.level.get(5, 5) === BLOCK.GLASS, 'shatter OFF: glass is left intact');
}
{ // TNT radius shatters every glass cell in range (explosion trigger)
  const g = Object.create(Game.prototype);
  const grid = {}; for (let r = 4; r <= 6; r++) { grid[r] = {}; for (let c = 4; c <= 6; c++) grid[r][c] = BLOCK.GLASS; }
  g.level = { get: (r, c) => (grid[r] && grid[r][c] != null ? grid[r][c] : BLOCK.AIR), set: (r, c, v) => { (grid[r] || (grid[r] = {}))[c] = v; } };
  g._worldAdvSettings = { glassShatter: true }; g._shatterFx = () => {}; g._playSound = () => {};
  g._shatterGlassInRadius(5, 5, 2);
  let remaining = 0; for (let r = 4; r <= 6; r++) for (let c = 4; c <= 6; c++) if (g.level.get(r, c) === BLOCK.GLASS) remaining++;
  ok(remaining === 0, 'an explosion shatters every glass block in its radius');
}

console.log(`\nglass block: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
