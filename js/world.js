// ============================================================
// world.js — Three-biome world generation (Plains / Cave / Nether)
// ============================================================

function buildWorld() {
  const W = WORLD_W, H = WORLD_H;
  const grid = Array.from({ length: H }, () => new Array(W).fill(BLOCK.AIR));

  const set = (r, c, b) => {
    if (r >= 0 && r < H && c >= 0 && c < W) grid[r][c] = b;
  };
  const get = (r, c) => {
    if (r < 0 || r >= H || c < 0 || c >= W) return BLOCK.BEDROCK;
    return grid[r][c];
  };

  _buildPlains(grid, set, get, W, H);
  _buildCave(grid, set, get, W, H);
  _buildNether(grid, set, get, W, H);

  const redstoneComponents = _buildRedstoneComponents(grid, set, get);
  const spawnPoints        = _buildSpawnPoints();

  // ── Bed shelters at checkpoints ───────────────────────────
  // Plains shelter (around col 138, ground row 9)
  // Walls are deliberately omitted — they sealed the shelter and blocked the player.
  // The canopy (ceiling row 6) and floor (row 9) frame the area; both sides are open.
  {
    const CC = CHECKPOINT_PLAINS_COL; // 138
    // Clear any terrain blocks that would block the entrance (rows 7-8 at both sides)
    for (let r = 7; r <= 8; r++)
      for (let c = CC - 3; c <= CC + 3; c++) set(r, c, BLOCK.AIR);
    // Ceiling canopy (planks) — visible overhead marker, does not block sides
    for (let c = CC - 3; c <= CC + 3; c++) set(6, c, BLOCK.OAK_PLANKS);
    // 2-wide bed (left block is the canonical spawn position)
    set(8, CC,     BLOCK.BED);
    set(8, CC + 1, BLOCK.BED);
  }

  // Cave shelter (around col 255, cave floor row 34)
  // Walls and checkpoint platform omitted — they blocked the player from approaching.
  // Bed sits at row 33 (one block above the cave floor), open on both sides.
  {
    const CC = CHECKPOINT_CAVE_COL; // 255
    // Ceiling marker (deepslate overhead)
    for (let c = CC - 3; c <= CC + 3; c++) set(30, c, BLOCK.DEEPSLATE);
    // 2-wide bed at row 33 (player walks on row 34, close enough for proximity check)
    set(33, CC,     BLOCK.BED);
    set(33, CC + 1, BLOCK.BED);
  }

  // ── 30-block wall between cave and nether ─────────────────
  // Left 15 cols (285-299) = deepslate (cave aesthetic)
  // Right 15 cols (300-314) = netherrack (nether aesthetic)
  // All are impassable (mined only from console; mining gated in game.js)
  for (let c = 285; c <= 299; c++) {
    for (let r = 0; r < H - 1; r++) set(r, c, BLOCK.DEEPSLATE);
    set(H - 1, c, BLOCK.BEDROCK);
  }
  for (let c = 300; c <= 314; c++) {
    for (let r = 0; r < H - 1; r++) set(r, c, BLOCK.NETHERRACK);
    set(H - 1, c, BLOCK.BEDROCK);
  }

  // ── Portal frames ─────────────────────────────────────────
  // Cave → Nether portal frame  (cols 270-273, rows 30-34)
  // Frame pillars & top/bottom — interior stays AIR until player fills obsidian
  for (let r = 30; r <= 34; r++) {
    set(r, 270, BLOCK.NETHER_PORTAL_FRAME);
    set(r, 273, BLOCK.NETHER_PORTAL_FRAME);
  }
  for (let c = 270; c <= 273; c++) {
    set(30, c, BLOCK.NETHER_PORTAL_FRAME);
    set(34, c, BLOCK.NETHER_PORTAL_FRAME);
  }
  // Interior always active — pre-filled with portal blocks
  for (let r = 31; r <= 33; r++) {
    for (let c = 271; c <= 272; c++) {
      set(r, c, BLOCK.NETHER_PORTAL);
    }
  }

  // Nether return portal (always active, cols 328-331, rows 30-34)
  // Placed past the 30-block stone wall (295-314), so safe area in nether
  for (let r = 30; r <= 34; r++) {
    set(r, 328, BLOCK.NETHER_PORTAL_FRAME);
    set(r, 331, BLOCK.NETHER_PORTAL_FRAME);
  }
  for (let c = 328; c <= 331; c++) {
    set(30, c, BLOCK.NETHER_PORTAL_FRAME);
    set(34, c, BLOCK.NETHER_PORTAL_FRAME);
  }
  // Interior always active
  for (let r = 31; r <= 33; r++) {
    for (let c = 329; c <= 330; c++) {
      set(r, c, BLOCK.NETHER_PORTAL);
    }
  }
  // Clear netherrack around portal so it's accessible
  for (let r = 27; r <= 33; r++)
    for (let c = 325; c <= 334; c++)
      if (get(r, c) === BLOCK.NETHERRACK && r < 34) set(r, c, BLOCK.AIR);
  // Solid floor under portal
  for (let c = 325; c <= 334; c++) set(34, c, BLOCK.NETHERRACK);

  // ── Goal block (netherite platform in nether) ─────────────
  const goalCol = 444;
  const goalRow = 28;
  // Raised netherrack pedestal under goal
  for (let r = 29; r <= 33; r++) set(r, goalCol, BLOCK.NETHERRACK);
  set(goalRow, goalCol, BLOCK.GOAL);

  // Spawn point (plains, row 13 — unchanged from original)
  const spawnX = 2 * BLOCK_SIZE;
  const spawnY = 13 * BLOCK_SIZE - PLAYER_H;

  // Bed positions — col/row of the LEFT bed block (canonical spawn point)
  const bedPositions = [
    { col: CHECKPOINT_PLAINS_COL, row: 8  },  // plains shelter bed (original row, plains unchanged)
    { col: CHECKPOINT_CAVE_COL,   row: 33 },  // cave shelter bed (row 33, cave floor row 34)
  ];

  const portalData = {
    // Positions player must fill with obsidian (cave portal sides)
    obsidianSlots: [
      { col: 270, row: 31 }, { col: 270, row: 32 }, { col: 270, row: 33 },
      { col: 273, row: 31 }, { col: 273, row: 32 }, { col: 273, row: 33 },
    ],
    cavePortalInterior: [
      { col: 271, row: 31 }, { col: 271, row: 32 }, { col: 271, row: 33 },
      { col: 272, row: 31 }, { col: 272, row: 32 }, { col: 272, row: 33 },
    ],
    caveExit:  { x: 332 * BLOCK_SIZE, y: 33 * BLOCK_SIZE - PLAYER_H }, // nether-side exit (shifted)
    netherExit:{ x: 271 * BLOCK_SIZE, y: 32 * BLOCK_SIZE },            // cave-side exit (shifted)
  };

  // ── Transition zone (cols 450-499) ──────────────────────────────────
  // 450-464: netherrack (continuation of nether aesthetic)
  for (let c = 450; c <= 464; c++) {
    for (let r = 20; r <= 26; r++) set(r, c, BLOCK.NETHERRACK);
    for (let r = 34; r < H - 1; r++) set(r, c, BLOCK.NETHERRACK);
    set(H - 1, c, BLOCK.BEDROCK);
  }
  // 465-479: bedrock barrier (impassable wall, full height)
  for (let r = 0; r < H; r++) {
    for (let c = 465; c <= 479; c++) set(r, c, BLOCK.BEDROCK);
  }
  // 480-499: void zone — no floor, no ceiling (open air, instant death)
  // Columns remain AIR (already default)

  // ── End dimension (cols 500-649) ─────────────────────────────────────
  // Bedrock floor at rows 58-59
  for (let c = 500; c < W; c++) {
    set(END_FLOOR_ROW,     c, BLOCK.BEDROCK);
    set(END_FLOOR_ROW + 1, c, BLOCK.BEDROCK);
  }
  // Obsidian boundary walls (cols 500 and 649, rows 35-59)
  for (let r = 35; r < H; r++) {
    set(r, 500, BLOCK.OBSIDIAN);
    set(r, W - 1, BLOCK.OBSIDIAN);
  }
  // Obsidian towers (non-solid, patched in game.js isSolid)
  for (const tc of END_TOWER_COLS) {
    for (let r = END_TOWER_TOP_ROW; r <= END_TOWER_BOT_ROW; r++) {
      for (let dc = -1; dc <= 1; dc++) set(r, tc + dc, BLOCK.OBSIDIAN);
    }
    set(END_CRYSTAL_ROW, tc, BLOCK.END_CRYSTAL);
  }

  return {
    grid, width: W, height: H,
    goalCol, goalRow,
    spawnX, spawnY,
    redstoneComponents,
    spawnPoints,
    bedPositions,
    portalData,
  };
}

// ─────────────────────────────────────────────────────────────
// Biome builders
// ─────────────────────────────────────────────────────────────

function _buildPlains(grid, set, get, W, H) {
  // Ground height map for cols 0-149
  const gh = new Array(150).fill(13);

  gh[17] = 12; gh[18] = 12; gh[19] = 11; gh[20] = 11;
  gh[21] = 11; gh[22] = 11; gh[23] = 12; gh[24] = 12;
  for (let c = 35; c <= 39; c++) gh[c] = 13;
  for (let c = 46; c <= 80; c++) gh[c] = 14;
  gh[81] = 13; gh[82] = 12; gh[83] = 12; gh[84] = 11;
  for (let c = 85; c <= 115; c++) gh[c] = 11;
  gh[116] = 10; gh[117] = 10; gh[118] = 9; gh[119] = 9;
  for (let c = 120; c <= 148; c++) gh[c] = 9;
  for (let c = 140; c <= 148; c++) gh[c] = 8;

  const gapA = (c) => c >= 40 && c <= 44;

  for (let c = 0; c < 150; c++) {
    if (gapA(c)) continue;
    const gr = gh[c];
    set(gr,     c, BLOCK.GRASS);
    set(gr + 1, c, BLOCK.DIRT);
    set(gr + 2, c, BLOCK.DIRT);
    set(gr + 3, c, BLOCK.DIRT);
    for (let r = gr + 4; r < H - 1; r++) set(r, c, BLOCK.STONE);
    set(H - 1, c, BLOCK.BEDROCK);
  }

  for (let c = 40; c <= 44; c++) {
    set(H - 1, c, BLOCK.BEDROCK);
    set(H - 2, c, BLOCK.STONE);
    set(H - 3, c, BLOCK.STONE);
  }

  // Trees
  const addTree = (tc, trunkH = 4) => {
    const gr = gh[tc];
    for (let r = gr - trunkH; r < gr; r++) set(r, tc, BLOCK.OAK_LOG);
    for (let dr = -(trunkH + 2); dr <= -(trunkH - 1); dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        if (get(gr + dr, tc + dc) === BLOCK.AIR) set(gr + dr, tc + dc, BLOCK.OAK_LEAVES);
      }
    }
    for (let dc = -1; dc <= 1; dc++) {
      if (get(gr - trunkH - 3, tc + dc) === BLOCK.AIR)
        set(gr - trunkH - 3, tc + dc, BLOCK.OAK_LEAVES);
    }
  };
  addTree(8); addTree(28); addTree(62); addTree(95); addTree(128);

  // Platforms
  const plat = (r, c, len, type = BLOCK.OAK_PLANKS) => {
    for (let i = 0; i < len; i++) set(r, c + i, type);
  };
  plat(9,  18, 5); plat(10, 41, 3); plat(12, 55, 4);
  plat(11, 70, 5); plat(9,  88, 5); plat(7, 104, 6);
  plat(6, 118, 5);

  // Checkpoint shelter floor (extends the platform 1 block each side for wall footings)
  plat(9, CHECKPOINT_PLAINS_COL - 2, 5);
  set(9, CHECKPOINT_PLAINS_COL - 3, BLOCK.OAK_PLANKS);
  set(9, CHECKPOINT_PLAINS_COL + 3, BLOCK.OAK_PLANKS);

  // Plains ores
  const ore = (r, c, type) => { if (get(r, c) === BLOCK.STONE) set(r, c, type); };
  [ [16,10],[16,22],[17,15],[16,36],[17,38],[16,50],[17,60],[17,68],[16,82],[16,100],[17,108],[16,118],[17,132] ]
    .forEach(([r,c]) => ore(r, c, BLOCK.COAL_ORE));
  [ [17,12],[18,20],[18,48],[17,72],[18,90],[17,114],[18,137] ]
    .forEach(([r,c]) => ore(r, c, BLOCK.IRON_ORE));
  [ [17,18],[18,32],[18,62],[17,78],[17,103],[18,122] ]
    .forEach(([r,c]) => ore(r, c, BLOCK.GOLD_ORE));
  [ [18,25],[18,52],[18,92],[18,135] ]
    .forEach(([r,c]) => ore(r, c, BLOCK.DIAMOND_ORE));
  [ [18,38],[18,74],[18,125] ]
    .forEach(([r,c]) => ore(r, c, BLOCK.NETHERITE_ORE));
}

function _buildCave(grid, set, get, W, H) {
  // Cols 150-299 — deepslate ceiling, cave interior, stone floor
  for (let c = 150; c < 300; c++) {
    // Ceiling deepslate (rows 20-27, leaving rows 0-19 as open sky above)
    for (let r = 20; r <= 27; r++) set(r, c, BLOCK.DEEPSLATE);
    // Floor stone (rows 35 to H-2) + bedrock at H-1
    for (let r = 35; r < H - 1; r++) set(r, c, BLOCK.STONE);
    set(H - 1, c, BLOCK.BEDROCK);
  }

  // Cave floor height variation
  const floorBase = 34;
  const makeFloorPlatform = (c1, c2, row) => {
    for (let c = c1; c <= c2; c++) {
      for (let r = row; r < H - 1; r++) set(r, c, BLOCK.STONE);
      set(H - 1, c, BLOCK.BEDROCK);
    }
  };
  makeFloorPlatform(150, 165, floorBase);
  makeFloorPlatform(166, 210, 35);
  makeFloorPlatform(211, 260, 34);
  // Lava pit (cols 213-217, rows 35-38)
  for (let c = 213; c <= 217; c++) {
    for (let r = 35; r <= 38; r++) set(r, c, BLOCK.LAVA);
  }
  makeFloorPlatform(261, 299, 34);

  // (Checkpoint platform removed — it was blocking player from approaching the bed shelter)

  // Floating platforms / stalagmites
  const cplat = (r, c, len) => { for (let i=0;i<len;i++) set(r,c+i,BLOCK.DEEPSLATE); };
  cplat(32, 155, 4);
  cplat(31, 172, 5);
  cplat(30, 195, 4);
  cplat(31, 225, 6);
  cplat(32, 245, 4);
  cplat(30, 265, 4);

  // Cave ores (deepslate-embedded — just replace some deepslate/stone)
  const cOre = (r, c, type) => {
    if (get(r,c) !== BLOCK.AIR && get(r,c) !== BLOCK.LAVA && get(r,c) !== BLOCK.BEDROCK) {
      set(r, c, type);
    }
  };
  [ [26,158],[26,175],[27,195],[26,215],[27,230],[26,250],[27,270] ]
    .forEach(([r,c]) => cOre(r, c, BLOCK.COAL_ORE));
  [ [27,160],[27,180],[26,210],[27,240],[26,260],[27,285] ]
    .forEach(([r,c]) => cOre(r, c, BLOCK.IRON_ORE));
  [ [36,162],[37,185],[36,220],[37,250],[36,275] ]
    .forEach(([r,c]) => cOre(r, c, BLOCK.DIAMOND_ORE));
  [ [37,170],[37,205],[37,260],[37,290] ]
    .forEach(([r,c]) => cOre(r, c, BLOCK.NETHERITE_ORE));

  // Gravel patches
  [ [34,153],[34,168],[34,200],[34,235],[34,265] ]
    .forEach(([r,c]) => {
      for (let dc = 0; dc < 3; dc++) {
        if (get(r, c+dc) === BLOCK.STONE) set(r, c+dc, BLOCK.GRAVEL);
      }
    });
}

function _buildNether(grid, set, get, W, H) {
  // Cols 300-449 — netherrack ceiling, netherrack/soul sand floor
  for (let c = 300; c < 450; c++) {
    // Netherrack ceiling (rows 20-26, leaving rows 0-19 as open sky above)
    for (let r = 20; r <= 26; r++) set(r, c, BLOCK.NETHERRACK);
    // Interior (rows 27-33) stays AIR
    // Netherrack floor (rows 34 to H-2) + bedrock at H-1
    for (let r = 34; r < H - 1; r++) set(r, c, BLOCK.NETHERRACK);
    set(H - 1, c, BLOCK.BEDROCK);
  }

  // Lava pools
  const lavaPool = (c1, c2) => {
    for (let c = c1; c <= c2; c++) {
      set(35, c, BLOCK.LAVA); set(36, c, BLOCK.LAVA);
      set(37, c, BLOCK.LAVA); set(38, c, BLOCK.LAVA);
    }
  };
  lavaPool(320, 326);
  lavaPool(355, 362);
  lavaPool(400, 408);
  lavaPool(430, 437);

  // Soul sand patches
  [ [34,310],[34,311],[34,312], [34,340],[34,341],[34,342],
    [34,380],[34,381],[34,382], [34,415],[34,416] ]
    .forEach(([r,c]) => set(r, c, BLOCK.SOUL_SAND));

  // Crimson/warped tree logs
  const netherTree = (c, type) => {
    set(33, c, type); set(32, c, type); set(31, c, type);
    for (let dc = -1; dc <= 1; dc++) set(30, c+dc, BLOCK.OAK_LEAVES);
  };
  netherTree(336, BLOCK.CRIMSON_LOG);
  netherTree(345, BLOCK.WARPED_LOG);
  netherTree(390, BLOCK.CRIMSON_LOG);
  netherTree(425, BLOCK.WARPED_LOG);

  // Floating netherrack platforms
  const nplat = (r, c, len) => { for (let i=0;i<len;i++) set(r,c+i,BLOCK.NETHERRACK); };
  nplat(31, 320, 4);
  nplat(30, 330, 5);
  nplat(31, 350, 4);
  nplat(29, 370, 6);
  nplat(30, 395, 4);
  nplat(28, 415, 5);
  nplat(27, 435, 6);

  // Nether ores
  [ [25,315],[25,340],[25,370],[25,400],[25,430] ]
    .forEach(([r,c]) => set(r, c, BLOCK.GOLD_ORE));
  [ [26,325],[26,360],[26,410],[26,440] ]
    .forEach(([r,c]) => set(r, c, BLOCK.NETHERITE_ORE));
  // Glowstone clusters on ceiling (mineable; needed for Respawn Anchor crafting)
  [ [26,318],[26,350],[26,385],[26,420],[26,445] ]
    .forEach(([r,c]) => set(r, c, BLOCK.GLOWSTONE));

  // Goal pedestal (already set in buildWorld after this)
  // Raised platform
  for (let c = 440; c <= 448; c++) {
    set(29, c, BLOCK.NETHERRACK);
    set(30, c, BLOCK.NETHERRACK);
    for (let r = 34; r <= 38; r++) set(r, c, BLOCK.NETHERRACK);
  }
  for (let c = 442; c <= 446; c++) set(28, c, BLOCK.NETHERRACK);
}

// ─────────────────────────────────────────────────────────────
// Redstone puzzle layout
// ─────────────────────────────────────────────────────────────

function _buildRedstoneComponents(grid, set, get) {
  const components = [];

  // ── Puzzle 1 (cave cols 162-170): inverted piston ──────────
  // Stone wall blocking path at col 166, rows 29-32
  for (let r = 29; r <= 32; r++) set(r, 166, BLOCK.STONE);
  // Piston body at col 165, row 30
  set(30, 165, BLOCK.PISTON_BODY);
  // Lever at col 163, row 31 (on the platform)
  set(31, 163, BLOCK.LEVER);

  const lev1 = { type: 'lever', col: 163, row: 31, on: false,
                  links: ['165,30'] };
  const pis1 = { type: 'piston', col: 165, row: 30,
                  dir: 'right', inverted: true, extended: true };
  // Head drawn via component (component-based rendering, not grid block)
  components.push(lev1, pis1);

  // ── Puzzle 2 (cave cols 210-220): trapdoor bridge + levers ─
  // Trapdoor bridge over lava pit (cols 213-216, row 34)
  for (let c = 213; c <= 216; c++) {
    set(34, c, BLOCK.TRAPDOOR);
    components.push({ type: 'trapdoor', col: c, row: 34, open: false,
                       links: [] });
  }
  // Lever 1 at col 208, row 32
  set(32, 208, BLOCK.LEVER);
  // Lever 2 at col 220, row 32
  set(32, 220, BLOCK.LEVER);
  // Pressure plate at col 210, row 34
  set(34, 210, BLOCK.PRESSURE_PLATE);

  // All three sources link to all four trapdoors
  const tdKeys = ['213,34','214,34','215,34','216,34'];
  const lev2a  = { type: 'lever', col: 208, row: 32, on: false, links: tdKeys };
  const lev2b  = { type: 'lever', col: 220, row: 32, on: false, links: tdKeys };
  const plate2 = { type: 'pressure_plate', col: 210, row: 34, on: false, links: tdKeys };
  components.push(lev2a, lev2b, plate2);

  // ── Puzzle 3 (nether cols 374-383): TNT wall ────────────────
  // Netherrack wall at cols 378-382, rows 30-33
  for (let r = 30; r <= 33; r++) {
    for (let c = 378; c <= 382; c++) set(r, c, BLOCK.NETHERRACK);
  }
  // TNT at col 379, row 32
  set(32, 379, BLOCK.TNT);
  // Pressure plate at col 374, row 34
  set(34, 374, BLOCK.PRESSURE_PLATE);

  const tntComp  = { type: 'tnt', col: 379, row: 32, fuse: 0, links: [] };
  const plate3   = { type: 'pressure_plate', col: 374, row: 34, on: false,
                      links: ['379,32'] };
  components.push(tntComp, plate3);

  return components;
}

// ─────────────────────────────────────────────────────────────
// Mob spawn points
// ─────────────────────────────────────────────────────────────

function _buildSpawnPoints() {
  return [
    // Plains (original rows — plains biome unchanged)
    { col: 15,  row: 12, mobTypeName: 'Zombie',    timer: 0, active: true },
    { col: 35,  row: 12, mobTypeName: 'Zombie',    timer: 0, active: true },
    { col: 55,  row: 13, mobTypeName: 'Skeleton',  timer: 0, active: true },
    { col: 75,  row: 13, mobTypeName: 'Creeper',   timer: 0, active: true },
    { col: 100, row: 10, mobTypeName: 'Skeleton',  timer: 0, active: true },
    { col: 120, row: 8,  mobTypeName: 'Zombie',    timer: 0, active: true },

    // Cave
    { col: 158, row: 33, mobTypeName: 'CaveSpider',  timer: 0, active: true },
    { col: 180, row: 34, mobTypeName: 'CaveSpider',  timer: 0, active: true },
    { col: 200, row: 33, mobTypeName: 'Zombie',      timer: 0, active: true },
    { col: 225, row: 33, mobTypeName: 'CaveSpider',  timer: 0, active: true },
    { col: 245, row: 33, mobTypeName: 'Skeleton',    timer: 0, active: true },
    { col: 270, row: 33, mobTypeName: 'CaveSpider',  timer: 0, active: true },

    // Nether (cols 285-314 are the stone wall, so start spawns at 340+)
    { col: 340, row: 33, mobTypeName: 'Piglin',          timer: 0, active: true },
    { col: 355, row: 33, mobTypeName: 'WitherSkeleton',  timer: 0, active: true },
    { col: 360, row: 33, mobTypeName: 'Blaze',           timer: 0, active: true },
    { col: 390, row: 33, mobTypeName: 'Piglin',          timer: 0, active: true },
    { col: 420, row: 33, mobTypeName: 'Blaze',           timer: 0, active: true },
    { col: 440, row: 32, mobTypeName: 'WitherSkeleton',  timer: 0, active: true },

    // End (cols 500-649)
    { col: 515, row: 56, mobTypeName: 'Enderman', timer: 0, active: true },
    { col: 540, row: 56, mobTypeName: 'Enderman', timer: 0, active: true },
    { col: 565, row: 56, mobTypeName: 'Enderman', timer: 0, active: true },
    { col: 610, row: 56, mobTypeName: 'Enderman', timer: 0, active: true },
    { col: 635, row: 56, mobTypeName: 'Enderman', timer: 0, active: true },
  ];
}

// ============================================================
// Template World Generator — deterministic sandbox starter world
// ============================================================

function buildTemplateWorldSave(playerName, worldName) {
  const W = WORLD_W, H = WORLD_H;
  const grid = Array.from({ length: H }, () => new Array(W).fill(BLOCK.AIR));

  const set = (r, c, b) => { if (r >= 0 && r < H && c >= 0 && c < W) grid[r][c] = b; };
  const get = (r, c) => { if (r < 0 || r >= H || c < 0 || c >= W) return BLOCK.BEDROCK; return grid[r][c]; };

  // Seeded LCG for deterministic generation
  let _s = 0x5E7A09;
  const rng = () => { _s = (_s * 1664525 + 1013904223) & 0xFFFFFFFF; return (_s >>> 0) / 0x100000000; };

  // Surface height for overworld cols 0-284 (rows 14-21 range)
  const surfH = c => {
    if (c >= 255 && c <= 284) return 19; // flat approach to portal
    return Math.min(21, Math.max(14, Math.round(
      17 + 2.5 * Math.sin(c * 0.038)
         + 1.5 * Math.sin(c * 0.083 + 1.4)
         + 0.8 * Math.sin(c * 0.17 + 0.7)
    )));
  };

  // ── Portal gate wall (cols 285-314) ──────────────────────
  for (let r = 0; r < H - 1; r++) {
    for (let c = 285; c <= 299; c++) set(r, c, BLOCK.BEDROCK);
    for (let c = 300; c <= 314; c++) set(r, c, BLOCK.NETHERRACK);
  }
  for (let c = 285; c <= 314; c++) set(H - 1, c, BLOCK.BEDROCK);

  // ── Overworld terrain (cols 0-284) ───────────────────────
  for (let c = 0; c <= 284; c++) {
    const sh = surfH(c);
    set(H - 1, c, BLOCK.BEDROCK);
    set(sh,     c, BLOCK.GRASS);
    set(sh + 1, c, BLOCK.DIRT);
    set(sh + 2, c, BLOCK.DIRT);
    set(sh + 3, c, BLOCK.DIRT);
    for (let r = sh + 4; r <= 24; r++) set(r, c, BLOCK.STONE);
    for (let r = 25; r <= 31; r++)     set(r, c, BLOCK.DEEPSLATE);
    for (let r = 32; r <= H - 2; r++) set(r, c, BLOCK.STONE);
  }

  // Trees
  const addTree = (tc, h = 4) => {
    const sh = surfH(tc);
    for (let r = sh - h; r < sh; r++) set(r, tc, BLOCK.OAK_LOG);
    for (let dr = -(h + 2); dr <= -(h - 1); dr++)
      for (let dc = -2; dc <= 2; dc++)
        if (get(sh + dr, tc + dc) === BLOCK.AIR) set(sh + dr, tc + dc, BLOCK.OAK_LEAVES);
    for (let dc = -1; dc <= 1; dc++)
      if (get(sh - h - 3, tc + dc) === BLOCK.AIR) set(sh - h - 3, tc + dc, BLOCK.OAK_LEAVES);
  };
  for (const tc of [10, 28, 52, 78, 105, 132, 160, 190, 220, 245])
    if (tc < 255) addTree(tc, tc % 3 === 0 ? 5 : 4);

  // Starting shelter + bed (cols 5-13)
  {
    const sh = surfH(8);
    for (let c = 5; c <= 13; c++) set(sh - 4, c, BLOCK.OAK_PLANKS);
    for (let r = sh - 3; r <= sh - 1; r++)
      for (let c = 5; c <= 13; c++)
        if (get(r, c) !== BLOCK.AIR) set(r, c, BLOCK.AIR);
    set(sh - 1, 8, BLOCK.BED); set(sh - 1, 9, BLOCK.BED);
  }

  // ── Overworld cave pockets (isolated) ────────────────────
  const owCaves = [
    { cc: 28, cr: 36, rx: 5, ry: 3 }, { cc: 58, cr: 43, rx: 6, ry: 4 },
    { cc: 82, cr: 38, rx: 4, ry: 3 }, { cc: 108, cr: 51, rx: 7, ry: 4 },
    { cc: 135, cr: 35, rx: 5, ry: 3 }, { cc: 160, cr: 45, rx: 6, ry: 4 },
    { cc: 178, cr: 55, rx: 5, ry: 3 }, { cc: 200, cr: 39, rx: 6, ry: 4 },
    { cc: 222, cr: 49, rx: 5, ry: 3 }, { cc: 240, cr: 55, rx: 6, ry: 3 },
    { cc: 252, cr: 37, rx: 4, ry: 3 }, { cc: 268, cr: 46, rx: 5, ry: 4 },
    { cc: 48, cr: 56, rx: 4, ry: 2 }, { cc: 74, cr: 48, rx: 5, ry: 3 },
    { cc: 148, cr: 53, rx: 5, ry: 3 }, { cc: 210, cr: 57, rx: 4, ry: 2 },
  ];
  for (const { cc, cr, rx, ry } of owCaves)
    for (let r = Math.max(32, cr - ry); r <= Math.min(57, cr + ry); r++)
      for (let c = Math.max(0, cc - rx); c <= Math.min(284, cc + rx); c++) {
        const dx = (c - cc) / rx, dy = (r - cr) / ry;
        if (dx * dx + dy * dy <= 1) set(r, c, BLOCK.AIR);
      }

  // ── Overworld ores (depth-based) ─────────────────────────
  for (let r = 32; r <= 57; r++) {
    for (let c = 0; c <= 284; c++) {
      if (get(r, c) !== BLOCK.STONE) continue;
      const v = rng();
      if (r <= 40) {
        if (v < 0.052) set(r, c, BLOCK.COAL_ORE);
        else if (v < 0.076) set(r, c, BLOCK.IRON_ORE);
      } else if (r <= 50) {
        if (v < 0.036) set(r, c, BLOCK.IRON_ORE);
        else if (v < 0.048) set(r, c, BLOCK.COAL_ORE);
        else if (v < 0.056) set(r, c, BLOCK.DIAMOND_ORE);
      } else {
        if (v < 0.028) set(r, c, BLOCK.DIAMOND_ORE);
        else if (v < 0.036) set(r, c, BLOCK.GOLD_ORE);
      }
    }
  }
  // Rare lava pools in deepest overworld caves (r>=52)
  for (const { cc, cr, rx, ry } of owCaves) {
    if (cr + ry < 52) continue;
    const floorR = Math.min(57, cr + ry - 1);
    for (let c = cc - 1; c <= cc + 1; c++)
      if (get(floorR, c) === BLOCK.AIR && get(floorR + 1, c) !== BLOCK.AIR) set(floorR, c, BLOCK.LAVA);
  }

  // ── Overworld portal (surface, cols 265-268) ─────────────
  // Surface forced to row 19 at cols 255-284 → portal sits on flat ground
  const OW_PR = 15, OW_PC = 265; // anchor: top-left of 4-wide × 5-tall frame
  // Frame border
  for (let r = OW_PR; r <= OW_PR + 4; r++) {
    set(r, OW_PC,     BLOCK.NETHER_PORTAL_FRAME);
    set(r, OW_PC + 3, BLOCK.NETHER_PORTAL_FRAME);
  }
  for (let c = OW_PC; c <= OW_PC + 3; c++) {
    set(OW_PR,     c, BLOCK.NETHER_PORTAL_FRAME);
    set(OW_PR + 4, c, BLOCK.NETHER_PORTAL_FRAME);
  }
  // Interior portal blocks
  for (let r = OW_PR + 1; r <= OW_PR + 3; r++)
    for (let c = OW_PC + 1; c <= OW_PC + 2; c++) set(r, c, BLOCK.NETHER_PORTAL);
  // Clear stone/dirt that might fill portal interior
  for (let r = OW_PR + 1; r <= OW_PR + 3; r++)
    for (let c = OW_PC + 1; c <= OW_PC + 2; c++) set(r, c, BLOCK.NETHER_PORTAL);

  // ── Nether fill (cols 315-449) ────────────────────────────
  for (let r = 0; r <= H - 2; r++)
    for (let c = 315; c <= 449; c++) set(r, c, BLOCK.NETHERRACK);
  for (let c = 315; c <= 449; c++) set(H - 1, c, BLOCK.BEDROCK);

  // ── Nether cave network (connected) ──────────────────────
  // Three horizontal main tunnels
  const NETH_START = 315;
  const carveRect = (r1, r2, c1, c2) => {
    for (let r = Math.max(1, r1); r <= Math.min(H - 2, r2); r++)
      for (let c = Math.max(NETH_START, c1); c <= Math.min(449, c2); c++) set(r, c, BLOCK.AIR);
  };
  const carveEllipse = (cr, cc, ry, rx) => {
    for (let r = Math.max(1, cr - ry); r <= Math.min(H - 2, cr + ry); r++)
      for (let c = Math.max(NETH_START, cc - rx); c <= Math.min(449, cc + rx); c++) {
        const dx = (c - cc) / rx, dy = (r - cr) / ry;
        if (dx * dx + dy * dy <= 1) set(r, c, BLOCK.AIR);
      }
  };

  // Upper cave for return portal
  carveRect(3, 14, 315, 345);

  // Main horizontal tunnels
  for (let c = NETH_START; c <= 449; c++) {
    const w1 = Math.round(1.5 + Math.sin(c * 0.11) * 1);
    const w2 = Math.round(2 + Math.sin(c * 0.09 + 1) * 1.5);
    const w3 = Math.round(1.5 + Math.sin(c * 0.13 + 2) * 1);
    carveRect(16 - w1, 20 + w1, c, c);
    carveRect(28 - w2, 34 + w2, c, c);
    carveRect(44 - w3, 49 + w3, c, c);
  }

  // Vertical shafts connecting tunnels
  for (const shC of [332, 355, 378, 400, 422, 443]) {
    carveRect(3, 52, shC - 2, shC + 2);
  }

  // Chambers at key points
  carveEllipse(18, 340, 6, 9); carveEllipse(31, 358, 7, 10);
  carveEllipse(18, 382, 5, 8); carveEllipse(46, 400, 6, 9);
  carveEllipse(31, 425, 7, 10); carveEllipse(18, 445, 5, 7);
  carveEllipse(46, 340, 5, 7); carveEllipse(46, 422, 5, 8);

  // ── Nether decorative blocks ──────────────────────────────
  // Soul sand on cave floors
  for (let c = NETH_START; c <= 449; c++)
    for (let r = 1; r <= H - 2; r++)
      if (get(r, c) === BLOCK.NETHERRACK && get(r - 1, c) === BLOCK.AIR && rng() < 0.04)
        set(r, c, BLOCK.SOUL_SAND);

  // Crimson/warped logs in cave walls
  for (const [logR, logC, type] of [
    [18, 338, BLOCK.CRIMSON_LOG], [17, 338, BLOCK.CRIMSON_LOG],
    [31, 360, BLOCK.WARPED_LOG],  [30, 360, BLOCK.WARPED_LOG],
    [18, 385, BLOCK.CRIMSON_LOG], [17, 385, BLOCK.CRIMSON_LOG],
    [31, 408, BLOCK.WARPED_LOG],  [30, 408, BLOCK.WARPED_LOG],
    [18, 430, BLOCK.CRIMSON_LOG], [17, 430, BLOCK.CRIMSON_LOG],
    [46, 345, BLOCK.WARPED_LOG],  [45, 345, BLOCK.WARPED_LOG],
  ]) if (get(logR, logC) === BLOCK.AIR) set(logR, logC, type);

  // ── Nether ores ───────────────────────────────────────────
  for (let r = 1; r <= 57; r++) {
    for (let c = NETH_START; c <= 449; c++) {
      if (get(r, c) !== BLOCK.NETHERRACK) continue;
      const v = rng();
      if (r <= 20)      { if (v < 0.010) set(r, c, BLOCK.NETHERITE_ORE); else if (v < 0.028) set(r, c, BLOCK.GOLD_ORE); }
      else if (r <= 40) { if (v < 0.014) set(r, c, BLOCK.NETHERITE_ORE); else if (v < 0.032) set(r, c, BLOCK.GOLD_ORE); }
      else              { if (v < 0.022) set(r, c, BLOCK.NETHERITE_ORE); else if (v < 0.032) set(r, c, BLOCK.GOLD_ORE); }
    }
  }

  // ── Nether lava pools ─────────────────────────────────────
  for (const [lr, lc, lw] of [
    [33, 333, 6], [35, 360, 8], [48, 380, 5], [33, 402, 7],
    [48, 425, 8], [48, 340, 5], [20, 372, 4], [20, 430, 5],
  ]) for (let c = lc; c < lc + lw; c++)
    if (get(lr, c) === BLOCK.AIR && get(lr + 1, c) !== BLOCK.AIR) set(lr, c, BLOCK.LAVA);

  // ── Nether return portal (upper-left cave, cols 320-323, rows 4-8) ──
  const NE_PR = 4, NE_PC = 320;
  for (let r = NE_PR; r <= NE_PR + 4; r++) {
    set(r, NE_PC,     BLOCK.NETHER_PORTAL_FRAME);
    set(r, NE_PC + 3, BLOCK.NETHER_PORTAL_FRAME);
  }
  for (let c = NE_PC; c <= NE_PC + 3; c++) {
    set(NE_PR,     c, BLOCK.NETHER_PORTAL_FRAME);
    set(NE_PR + 4, c, BLOCK.NETHER_PORTAL_FRAME);
  }
  for (let r = NE_PR + 1; r <= NE_PR + 3; r++)
    for (let c = NE_PC + 1; c <= NE_PC + 2; c++) set(r, c, BLOCK.NETHER_PORTAL);
  // Solid floor under nether portal
  for (let c = NE_PC - 1; c <= NE_PC + 4; c++) set(NE_PR + 5, c, BLOCK.NETHERRACK);

  // ── Goal star (end of nether) ─────────────────────────────
  set(47, 445, BLOCK.GOAL);
  for (let r = 48; r <= H - 2; r++) set(r, 445, BLOCK.NETHERRACK);

  // ── Transition zone (cols 450-499) ──────────────────────────────────
  for (let c = 450; c <= 464; c++) {
    for (let r = 20; r <= 26; r++) set(r, c, BLOCK.NETHERRACK);
    for (let r = 34; r < H - 1; r++) set(r, c, BLOCK.NETHERRACK);
    set(H - 1, c, BLOCK.BEDROCK);
  }
  for (let r = 0; r < H; r++) {
    for (let c = 465; c <= 479; c++) set(r, c, BLOCK.BEDROCK);
  }

  // ── End dimension (cols 500-649) ─────────────────────────────────────
  for (let c = 500; c < W; c++) {
    set(END_FLOOR_ROW,     c, BLOCK.BEDROCK);
    set(END_FLOOR_ROW + 1, c, BLOCK.BEDROCK);
  }
  for (let r = 35; r < H; r++) {
    set(r, 500, BLOCK.OBSIDIAN);
    set(r, W - 1, BLOCK.OBSIDIAN);
  }
  for (const tc of END_TOWER_COLS) {
    for (let r = END_TOWER_TOP_ROW; r <= END_TOWER_BOT_ROW; r++) {
      for (let dc = -1; dc <= 1; dc++) set(r, tc + dc, BLOCK.OBSIDIAN);
    }
    set(END_CRYSTAL_ROW, tc, BLOCK.END_CRYSTAL);
  }

  // ── Portal links for Normal mode routing ─────────────────
  const portalLinks = [
    { label: '1', biome: 'overworld', anchorRow: OW_PR, anchorCol: OW_PC, destLabel: 'A' },
    { label: 'A', biome: 'nether',    anchorRow: NE_PR, anchorCol: NE_PC, destLabel: '1' },
  ];

  // ── Pre-placed spawn eggs — one for each mob type ────────
  const spawnEggs = [
    // Overworld mobs: one block above surface so mobs fall to ground
    { col: 20,  row: surfH(20)  - 1, mobType: 'zombie'         },
    { col: 40,  row: surfH(40)  - 1, mobType: 'skeleton'       },
    { col: 60,  row: surfH(60)  - 1, mobType: 'creeper'        },
    { col: 80,  row: surfH(80)  - 1, mobType: 'cave_spider'    },
    // Nether mobs: inside upper nether cave (rows 3-14, cols 315-345)
    { col: 328, row: 10,             mobType: 'piglin'          },
    { col: 335, row: 10,             mobType: 'blaze'           },
    { col: 342, row: 10,             mobType: 'wither_skeleton' },
  ];

  // ── Build and store save payload ─────────────────────────
  const payload = {
    playerName, worldName,
    savedAt: new Date().toISOString(),
    grid: grid.map(row => Array.from(row)),
    spawnEggs, placedItems: [], portalLinks,
    sandboxLevers: [], sandboxTrapdoors: [], sandboxPistons: [],
    dustBlocks: [], transmitters: [], receivers: [], gateBlocks: [],
    chests: [],
    playerPx: 2 * BLOCK_SIZE,
    playerPy: (surfH(3) - 2) * BLOCK_SIZE,
  };

  const key = SandboxSaves.key(playerName, worldName);
  try {
    localStorage.setItem(key, JSON.stringify(payload));
    return { ok: true, key };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
