// ============================================================
// arena-maps.js — Arena world builders (Phase 3A.1)
//
// Produces the Level-data shape consumed by `new Level(data)` and
// `Game._buildLevel` (grid/width/height/goalCol/goalRow/spawnX/spawnY plus
// spawnPoints, bedPositions, portalData, redstoneComponents). Two entry points:
//
//   buildArenaWorldData(mapName)        → a built-in arena layout
//   buildArenaWorldDataFromSave(save)   → a user-designed arena from world_data
//
// `Game._setupArena(data)` layers fixed camera + bots + scoring on top. It reads
// an optional `data._arena = { playerSpawns:[{col,row}], botSpawns:[{col}] }`;
// when absent it falls back to level.spawnX/Y + `_arenaBotColumns`.
// ============================================================

// Empty portalData shape (arenas have no dimensional portals).
function _arenaEmptyPortalData() {
  return { obsidianSlots: [], cavePortalInterior: [], caveExit: null, netherExit: null };
}

// ── Built-in arena maps ───────────────────────────────────────
// A fixed-camera arena is framed to roughly fit the viewport at zoom 1.0
// (CANVAS_W/BLOCK_SIZE = 25 cols, CANVAS_H/BLOCK_SIZE ≈ 15 rows).
function buildArenaWorldData(mapName) {
  switch (mapName) {
    case 'DEATHMATCH_SMALL':
    default:
      return _buildDeathmatchSmall();
  }
}

function _buildDeathmatchSmall() {
  const W = 25, H = 15;
  const grid = Array.from({ length: H }, () => new Array(W).fill(BLOCK.AIR));
  const set = (r, c, b) => { if (r >= 0 && r < H && c >= 0 && c < W) grid[r][c] = b; };

  const FLOOR = H - 2;            // row 13 — players stand here
  // Bedrock perimeter: bottom row + side walls (impassable boundary).
  for (let c = 0; c < W; c++) set(H - 1, c, BLOCK.BEDROCK);
  for (let r = 0; r < H; r++) { set(r, 0, BLOCK.BEDROCK); set(r, W - 1, BLOCK.BEDROCK); }
  // Stone floor across the interior at FLOOR.
  for (let c = 1; c < W - 1; c++) set(FLOOR, c, BLOCK.STONE);

  // Cover platforms (symmetric) for line-of-sight breaks.
  const plat = (r, c, len) => { for (let i = 0; i < len; i++) set(r, c + i, BLOCK.OAK_PLANKS); };
  plat(FLOOR - 3, 5, 3);
  plat(FLOOR - 3, W - 8, 3);
  plat(FLOOR - 6, 10, 5);        // center high platform

  const spawnX = 2 * BLOCK_SIZE;
  const spawnY = (FLOOR - 3) * BLOCK_SIZE;   // a little above the floor; gravity settles it

  return {
    grid, width: W, height: H,
    goalCol: W - 5, goalRow: H - 2,
    spawnX, spawnY,
    redstoneComponents: [],
    spawnPoints: [],
    bedPositions: [],
    portalData: _arenaEmptyPortalData(),
    _arena: {
      playerSpawns: [{ col: 2, row: FLOOR - 3 }, { col: W - 3, row: FLOOR - 3 }],
      // botSpawns omitted → _setupArena spreads botCount columns via _arenaBotColumns.
    },
  };
}

// ── User-designed arena (from saved world_data) ───────────────
// Mirrors the grid + basic-redstone reconstruction that `_loadSandboxWorld`
// performs, minus the dust/gate/transmitter overlays (those live on the Game
// instance and are not reconstructed for arena play). Returns null when the
// save has no usable grid so `_buildLevel` falls back to the built-in map.
function buildArenaWorldDataFromSave(save) {
  const data = (typeof SaveMigrations !== 'undefined') ? SaveMigrations.migrateSave(save) : save;
  if (!data || !Array.isArray(data.grid) || !data.grid.length) return null;

  const H = data.worldHeight || data.grid.length;
  const W = data.worldWidth  || (Array.isArray(data.grid[0]) ? data.grid[0].length : 0);
  if (!W || !H) return null;

  // Copy grid into a fresh W×H grid (clamped; out-of-range cells default to AIR).
  const grid = Array.from({ length: H }, () => new Array(W).fill(BLOCK.AIR));
  for (let r = 0; r < Math.min(data.grid.length, H); r++) {
    const row = data.grid[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < Math.min(row.length, W); c++) {
      grid[r][c] = typeof row[c] === 'number' ? row[c] : BLOCK.AIR;
    }
  }

  // Reconstruct functional redstone components from the grid + saved states.
  const redstoneComponents = _arenaRedstoneFromSave(grid, W, H, data);

  // Spawn eggs → spawn points (Part 3 extends per-spawner fields; _setupArena
  // decides whether to drive enemies from these or fall back to default bots).
  const EGG_TO_MOB = {
    zombie: 'Zombie', skeleton: 'Skeleton', creeper: 'Creeper',
    cave_spider: 'CaveSpider', piglin: 'Piglin', blaze: 'Blaze',
    wither_skeleton: 'WitherSkeleton', enderman: 'Enderman',
  };
  const spawnPoints = Array.isArray(data.spawnEggs)
    ? data.spawnEggs
        .filter(e => e && typeof e.col === 'number' && typeof e.row === 'number' && EGG_TO_MOB[e.mobType])
        .map(e => ({
          col: e.col, row: e.row, mobTypeName: EGG_TO_MOB[e.mobType], timer: 0, active: true,
          // Phase 3A.2 — per-spawner arena tuning carried into _updateSpawnPoints.
          spawnFrequency: typeof e.spawnFrequency === 'number' ? e.spawnFrequency : 2,
          maxActiveMobs:  typeof e.maxActiveMobs  === 'number' ? e.maxActiveMobs  : 3,
        }))
    : [];

  // Player spawn: prefer the saved player position, else first solid floor at col 2.
  let spawnX = typeof data.playerPx === 'number' ? data.playerPx : 2 * BLOCK_SIZE;
  let spawnY = typeof data.playerPy === 'number' ? data.playerPy : 2 * BLOCK_SIZE;

  return {
    grid, width: W, height: H,
    goalCol: Math.max(0, W - 5), goalRow: H - 2,
    spawnX, spawnY,
    redstoneComponents,
    spawnPoints,
    bedPositions: [],
    portalData: _arenaEmptyPortalData(),
    // No _arena block → _setupArena uses level spawns + _arenaBotColumns.
  };
}

// Scan grid for redstone primitives and apply saved sandbox states. Mirrors the
// component reconstruction in `_loadSandboxWorld` (game.js). Dust/gates are not
// reconstructed here, so dust-wired logic is inert in arenas (known limitation).
function _arenaRedstoneFromSave(grid, W, H, data) {
  const comps = [];
  const at = {}; // "col,row" → component, to dedupe + apply states
  const key = (c, r) => `${c},${r}`;
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const b = grid[r][c];
      let comp = null;
      if (b === BLOCK.LEVER)               comp = { type: 'lever', col: c, row: r, on: false, links: [], sandboxPlaced: true };
      else if (b === BLOCK.TRAPDOOR)       comp = { type: 'trapdoor', col: c, row: r, open: false, links: [], sandboxPlaced: true };
      else if (b === BLOCK.PRESSURE_PLATE) comp = { type: 'pressure_plate', col: c, row: r, on: false, links: [], sandboxPlaced: true };
      else if (b === BLOCK.TNT)            comp = { type: 'tnt', col: c, row: r, fuse: 0, links: [], sandboxPlaced: true };
      if (comp) { comps.push(comp); at[key(c, r)] = comp; }
    }
  }
  // Saved pistons are component-rendered (no grid block), so add them directly.
  if (Array.isArray(data.sandboxPistons)) {
    for (const p of data.sandboxPistons) {
      if (typeof p.col === 'number' && typeof p.row === 'number' && !at[key(p.col, p.row)]) {
        const comp = {
          type: 'piston', col: p.col, row: p.row,
          dir: p.dir || 'right', inverted: !!p.inverted, extended: !!p.extended, sandboxPlaced: true,
        };
        comps.push(comp); at[key(p.col, p.row)] = comp;
      }
    }
  }
  // Apply saved lever/trapdoor on-states.
  if (Array.isArray(data.sandboxLevers)) {
    for (const l of data.sandboxLevers) { const cm = at[key(l.col, l.row)]; if (cm && cm.type === 'lever') cm.on = !!l.on; }
  }
  if (Array.isArray(data.sandboxTrapdoors)) {
    for (const t of data.sandboxTrapdoors) { const cm = at[key(t.col, t.row)]; if (cm && cm.type === 'trapdoor') cm.open = !!t.open; }
  }
  return comps;
}

// Expose globals (scripts load in plain <script> order, no modules).
if (typeof window !== 'undefined') {
  window.buildArenaWorldData = buildArenaWorldData;
  window.buildArenaWorldDataFromSave = buildArenaWorldDataFromSave;
}
