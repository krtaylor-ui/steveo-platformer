// Arena worlds must restore CLASSIC-BLOCK metadata (Travel Tubes, pipes, question blocks,
// rails/moving platforms), not just the grid. A placed Travel Tube's TUBE_WALL footprint is
// solid, but the visible BAND is drawn from `travelTubes`; the arena build path used to drop
// it, so the tube was invisible-but-blocking. This pins the two-part fix.
//   node test/test-arena-classic-blocks.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

const ROOT = path.join(__dirname, '..');
const ctx = { window: {}, console };
ctx.window = ctx;
vm.createContext(ctx);
const run = (f, expose) => vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8') + (expose ? '\n;' + expose : ''), ctx, { filename: f });
run('constants.js', 'this.BLOCK_SIZE=BLOCK_SIZE;');
run('blocks.js', 'this.BLOCK=BLOCK;');
run('arena-maps.js', 'this.buildArenaWorldDataFromSave=buildArenaWorldDataFromSave;');
const build = ctx.buildArenaWorldDataFromSave;
const BLOCK = ctx.BLOCK;

console.log('buildArenaWorldDataFromSave carries the classic-block metadata through:');
{
  const W = 6, H = 6;
  const grid = Array.from({ length: H }, () => new Array(W).fill(BLOCK.AIR));
  grid[3][3] = BLOCK.TUBE_WALL;   // a tube footprint cell (solid, draws nothing itself)
  const save = {
    worldWidth: W, worldHeight: H, grid,
    travelTubes: [{ id: 1, cells: [{ col: 3, row: 3 }], speed: 7, mode: 'solid' }],
    pipeLinks: [['3,3', '4,4']],
    blockContents: [['2,2', { type: 'coin' }]],
    rails: [{ id: 1, isSwitch: false, cells: [] }],
  };
  const data = build(save);
  ok(data && Array.isArray(data.grid), 'a saved arena grid builds');
  ok(Array.isArray(data.travelTubes) && data.travelTubes.length === 1 && data.travelTubes[0].id === 1,
     'travelTubes ride along (so the visible band can render, not just the blocking cells)');
  ok(Array.isArray(data.pipeLinks) && Array.isArray(data.blockContents) && Array.isArray(data.rails),
     'pipe links, question-block contents, and rails/platforms carry too');
  ok(data.grid[3][3] === BLOCK.TUBE_WALL, 'the TUBE_WALL footprint cell is still in the grid (stays solid)');
}

console.log('The arena build path restores that metadata (was skipped → invisible-but-solid tubes):');
{
  const gameSrc = fs.readFileSync(path.join(ROOT, 'js', 'game.js'), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const buildLevel = gameSrc.slice(gameSrc.indexOf('_buildLevel() {'), gameSrc.indexOf('_setupArena(data) {'));
  ok(/if \(this\.gameMode === 'arena'\) this\._restoreClassicBlockData\(data\);/.test(buildLevel),
     '_buildLevel calls _restoreClassicBlockData(data) for the arena path');
  ok(buildLevel.indexOf('_restoreClassicBlockData(data)') < buildLevel.indexOf("_setupArena(data)"),
     'and does it before _setupArena');
}

console.log(`\narena classic blocks: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
