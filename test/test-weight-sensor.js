// §Weight Sensor tests — a SOLID block that emits redstone while a player/mob/both stands ON TOP.
// Verifies the trigger modes (players/mobs/both) and, crucially, that detection uses the platform's
// SMOOTH surface Y (so a plate riding a sub-cell-moving platform doesn't flicker off under a rider).
const fs = require('fs');
const vm = require('vm');
const jsDir = require('path').join(__dirname, '..', 'js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

const real = { window: {}, document: {}, Math, console, Set, Map, Array, Object, JSON, Number, String, Boolean, isNaN, parseInt, parseFloat };
const sandbox = new Proxy(real, { has: () => true, get: (t, k) => (k in t ? t[k] : (typeof k === 'symbol' ? undefined : 1)), set: (t, k, v) => { t[k] = v; return true; } });
vm.createContext(sandbox);
const load = (f, e) => vm.runInContext(fs.readFileSync(`${jsDir}/${f}`, 'utf8') + (e ? `\n;${e}` : ''), sandbox, { filename: f });
load('constants.js', 'this.BLOCK_SIZE=BLOCK_SIZE;');
load('blocks.js', 'this.BLOCK=BLOCK;');
load('travel-tube.js');
load('moving-platform.js', 'this.MOVING_PLATFORM=MOVING_PLATFORM;');
load('redstone.js', 'this.RedstoneSystem=RedstoneSystem;');
load('game.js', 'this.Game=Game;');
const { Game, RedstoneSystem, BLOCK, BLOCK_SIZE: BS } = sandbox;
const W = 40, H = 30;

function mkGame() {
  const grid = Array.from({ length: H }, () => Array(W).fill(BLOCK.AIR));
  const g = Object.create(Game.prototype);
  Object.assign(g, {
    gameMode: 'platformer', frameCount: 0, _rsQueue: [], _worldAdvSettings: { redstoneSpeed: 1 },
    _dustBlocks: new Map(), _receivers: new Map(), _transmitters: new Map(), _gateBlocks: new Map(),
    _dirControllers: new Map(), _dustConnCache: new Map(), _notify: () => {},
    mobManager: { mobs: [] }, player: null, player2: null,
  });
  g.level = { width: W, height: H, grid, get: (r, c) => (r >= 0 && r < H && c >= 0 && c < W ? grid[r][c] : BLOCK.AIR), set: (r, c, v) => { if (r >= 0 && r < H && c >= 0 && c < W) grid[r][c] = v; } };
  g.redstone = new RedstoneSystem([]);
  return g;
}
const ent = (col, row) => ({ x: col * BS + 2, y: row * BS - 24, width: 24, height: 24, vy: 0, hp: 10 });

// 1 ── trigger modes gate players vs mobs correctly.
console.log('Weight Sensor — trigger modes (players / mobs / both):');
function press(trigger, who) {
  const g = mkGame(); const col = 5, row = 8;
  g.level.set(row, col, BLOCK.WEIGHT_PLATE);
  g.redstone.addComponent({ type: 'weight', col, row, on: false, trigger, links: [], sandboxPlaced: true });
  if (who === 'player') g.player = ent(col, row);
  if (who === 'mob') g.mobManager.mobs = [ent(col, row)];
  g._updateWeightPlates();
  return g.redstone.getAt(col, row).on;
}
ok(press('players', 'player') === true,  'players: a player on top powers it');
ok(press('players', 'mob') === false,    'players: a mob on top does NOT');
ok(press('mobs', 'mob') === true,        'mobs: a mob on top powers it');
ok(press('mobs', 'player') === false,    'mobs: a player on top does NOT');
ok(press('both', 'player') === true,     'both: a player powers it');
ok(press('both', 'mob') === true,        'both: a mob powers it');
ok(press('both', 'none') === false,      'both: nobody standing = off');

// 2 ── a powered weight sensor drives an adjacent sink (lamp) via conduction.
console.log('Weight Sensor — powers an adjacent redstone sink:');
{
  const g = mkGame(); const col = 5, row = 8;
  g.level.set(row, col, BLOCK.WEIGHT_PLATE);
  g.level.set(row, col + 1, BLOCK.REDSTONE_LAMP);
  g.redstone.addComponent({ type: 'weight', col, row, on: false, trigger: 'both', links: [], sandboxPlaced: true });
  g.redstone.addComponent({ type: 'lamp', col: col + 1, row, on: false, color: 0, links: [], sandboxPlaced: true });
  g.player = ent(col, row);
  g._updateWeightPlates();
  const lamp = g.redstone.getAt(col + 1, row);
  ok(g._sinkGroupPowered(lamp) === true, 'adjacent lamp is powered while stood on');
  g.player = null; g._updateWeightPlates();
  ok(g._sinkGroupPowered(lamp) === false, 'adjacent lamp unpowered when the sensor releases');
}

// 3 ── on a sub-cell-moving platform, detection tracks the SMOOTH surface (no flicker).
console.log('Weight Sensor — flicker-free on a moving platform (smooth Y):');
{
  const g = mkGame(); const col = 5, row = 8;
  g.level.set(row, col, BLOCK.WEIGHT_PLATE);
  g.level.set(row + 1, col, BLOCK.ANCHOR_BLOCK);
  g.redstone.addComponent({ type: 'weight', col, row, on: false, trigger: 'both', links: [], sandboxPlaced: true });
  g._rails = [{ id: 1, cells: [{ col, row: row + 1 }, { col, row: row + 10 }], vis: 'visible' }];
  g._platforms = [{ id: 1, railId: 1, anchorCol: col, anchorRow: row + 1, anchorDist: 0, initialDir: 1, mode: 'continuous', speed: 2, returnMode: 'roundtrip' }];
  g._initPlatformsRuntime();
  const pl = g._platforms[0];
  pl._ay = pl._ay0 + 7;               // platform slid 7px DOWN — comp.row still quantized to the old cell
  g._rebuildPlatformSolidCells();
  const wc = g.redstone.components.find(c => c.type === 'weight');
  const topY = g._cellTopY(wc.col, wc.row);
  ok(Math.abs(topY - wc.row * BS) > 5, 'smooth top Y differs from the quantized cell top (sub-cell motion)');
  g.player = { x: wc.col * BS + 2, y: topY - 24, width: 24, height: 24, vy: 0 };   // rider rests on the smooth surface
  g._updateWeightPlates();
  ok(wc.on === true, 'rider on the smooth surface still registers (quantized test would flicker off)');
}

if (fail) { console.log(`\n${fail} FAILED, ${pass} passed`); process.exit(1); }
console.log(`\nAll ${pass} weight-sensor assertions passed`);
