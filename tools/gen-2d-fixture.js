// gen-2d-fixture.js — build the 2D "ladder + travel tube + chest" test fixture world.
//   node tools/gen-2d-fixture.js > docs/FIXTURE_2D_ladder_tube_chest.json
// Purpose: unblock tester items B6.3 (2D travel tube) and B7 (2D chest palette + remove) which were
// BLOCKED because the sandbox palette is canvas-rendered and can't be driven synthetically. The
// tester IMPORTS this ready-made world (Sandbox -> Import from File) and plays it — no palette needed.
// Emits a BARE world object (grid at top level), the same shape default-worlds/*.json use, which the
// importer accepts directly (it also accepts a {world_data} wrapper).

const BS = 32;
const B = { AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, GOAL: 10, CHEST: 36, LADDER: 65 };

const W = 48, H = 20;
const SURFACE = 15;                 // grass row; player walks on top of it
const grid = [];
for (let r = 0; r < H; r++) grid.push(new Array(W).fill(B.AIR));
for (let c = 0; c < W; c++) {
  grid[SURFACE][c] = B.GRASS;       // walkable surface
  for (let r = SURFACE + 1; r < H; r++) grid[r][c] = B.DIRT;   // fill below
}

// — Ladder (col 6): a climbable column from the surface up to a small stone ledge —
const LAD = 6, LAD_TOP = 8;
for (let r = LAD_TOP; r <= SURFACE - 1; r++) grid[r][LAD] = B.LADDER;   // climb up from ground
for (let c = LAD - 2; c <= LAD + 2; c++) grid[LAD_TOP - 1][c] = B.STONE; // top landing ledge

// — Travel tube (horizontal, row 14): walk RIGHT into the left mouth (col 12) -> fly to col 30 —
const TUBE = { id: 1, cells: [{ col: 12, row: 14 }, { col: 30, row: 14 }], speed: 7, mode: 'solid', items: [], angled: false };

// — Chest (col 36) sitting on the surface: grid block + contents (3 filled, rest empty for B7 remove) —
const CH_COL = 36, CH_ROW = SURFACE - 1;
grid[CH_ROW][CH_COL] = B.CHEST;
const chest = {
  col: CH_COL, row: CH_ROW,
  items: [
    { type: B.GRASS, count: 5 },
    { type: B.STONE, count: 3 },
    { type: 'tool', toolKey: 'DIAMOND_SWORD', count: 1 },
    null, null, null, null, null,
  ],
};

// — Goal star at the far right (col 44) —
const GOAL_COL = 44;
for (let r = SURFACE - 3; r <= SURFACE - 1; r++) grid[r][GOAL_COL] = B.GOAL;

const world = {
  worldName: 'FIXTURE - Ladder + Tube + Chest (2D)',
  playerName: 'QA',
  savedAt: '2026-08-11T00:00:00.000Z',
  saveVersion: 2,
  gameModeDefault: 'PLT',
  worldWidth: W,
  worldHeight: H,
  grid,
  // spawn near the left; the player falls onto the grass and walks right past ladder -> tube -> chest -> goal
  playerPx: 2 * BS,
  playerPy: (SURFACE - 3) * BS,
  playerProgress: null,
  travelTubes: [TUBE],
  chests: [chest],
  // everything else the loader may read — empty so nothing is undefined
  spawnEggs: [], placedItems: [], emeralds: [], powerups: [], spawnLines: [],
  portalLinks: [], ruinedPortals: [], endPortalAnchors: [],
  sandboxLevers: [], sandboxTrapdoors: [], sandboxPistons: [], dustBlocks: [],
  transmitters: [], receivers: [], gateBlocks: [], rails: [], platforms: [],
  worldAdvSettings: { twoPlayerMode: false },
  provenance: { uid: 'fixture-2d-ltc', createdAt: 0, updatedAt: 0, creator: 'QA', origin: 'fixture' },
};

process.stdout.write(JSON.stringify(world, null, 2) + '\n');
