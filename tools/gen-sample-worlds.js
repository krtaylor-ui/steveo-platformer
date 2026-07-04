#!/usr/bin/env node
// ============================================================
// gen-sample-worlds.js — Generates the [Sample] test-world batch
// (Phase B of the Sample Worlds brief, 2026-07-04).
//
// Emits raw GAME_STATE.serialize()-shaped .json files into
// ../sample-worlds/ , each importable via the offline Import button
// (parses `parsed.world_data || parsed`; reads world_name || worldName).
//
// Also runs a best-effort STRUCTURAL check per world (NOT a fun check):
//   • every player-spawn / hill / base / tower stands on solid ground
//     with 2-block headroom (not embedded, not over a void/lava),
//   • a physics-honest reachability BFS confirms all key points are
//     mutually reachable using the real jump envelope.
// Physics envelope (from js/constants.js): jump apex 3.4 blk, so
// MAX_JUMP_UP=3, MAX_JUMP_DX=6 (same-level gap 6.8 blk; downward reaches
// farther). Design targets stay <=4 gap / <=3 up for comfortable feel.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');

const BS = 32;
const OUT = path.join(__dirname, '..', 'sample-worlds');

// ── Block ids (subset used here) ─────────────────────────────
const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, OAK_LOG: 4, OAK_LEAVES: 5, BEDROCK: 6,
  PLANKS: 7, OAK_PLANKS: 7, GOAL: 10, GRAVEL: 11, OBSIDIAN: 15, DEEPSLATE: 16, SOUL_SAND: 17,
  NETHERRACK: 21, LAVA: 22, TRAPDOOR: 23, PISTON: 24, LEVER: 27, TNT: 29,
  SPEED_BOOSTER: 56, JUMP_PAD: 57, SPEED_ITEM: 58,
};
const SOLID = new Set([1, 2, 3, 4, 6, 7, 11, 15, 16, 17, 21, 24, 29, 57]);
const HAZARD = new Set([22]); // lava — deadly, never standable
// trapdoor(23) treated as passable for reachability (the mechanic opens it).

// Physics envelope for the reachability check.
const MAX_JUMP_UP = 3;   // blocks the apex clears
const MAX_JUMP_DX = 6;   // horizontal blocks in one jump (same level)
const MAX_DROP    = 40;   // blocks a player may fall to land

// ── Grid helpers ─────────────────────────────────────────────
function makeGrid(W, H) {
  return { W, H, g: Array.from({ length: H }, () => new Array(W).fill(B.AIR)) };
}
function set(gr, c, r, b) { if (r >= 0 && r < gr.H && c >= 0 && c < gr.W) gr.g[r][c] = b; }
function get(gr, c, r) { return (r >= 0 && r < gr.H && c >= 0 && c < gr.W) ? gr.g[r][c] : B.BEDROCK; }
// inclusive rectangle
function rect(gr, c0, r0, c1, r1, b) {
  const ca = Math.min(c0, c1), cb = Math.max(c0, c1);
  const ra = Math.min(r0, r1), rb = Math.max(r0, r1);
  for (let r = ra; r <= rb; r++) for (let c = ca; c <= cb; c++) set(gr, c, r, b);
}
// solid ground from topRow down `depth` rows across [c0,c1]
function ground(gr, c0, c1, topRow, b, depth = 6) { rect(gr, c0, topRow, c1, topRow + depth - 1, b); }
// one-thick platform
function plat(gr, c0, c1, row, b) { rect(gr, c0, row, c1, row, b); }

// ── Placeable factories ──────────────────────────────────────
const ctr = (c, r) => ({ wx: c * BS + BS / 2, wy: r * BS + BS / 2 });
const spawnPt = (col, row, slot) => ({ col, row, ...ctr(col, row), slot });
const emerald = (col, row, group = 1) => ({ col, row, ...ctr(col, row), group });
const powerup = (col, row, powerType = 'HEALTH') => ({ col, row, ...ctr(col, row), powerType });
const spawnLine = (col, row, line = 1) => ({ col, row, ...ctr(col, row), line });
const spawnEgg = (col, row, mobType, freq = 2, cap = 3) =>
  ({ col, row, ...ctr(col, row), mobType, spawnFrequency: freq, maxActiveMobs: cap });
const baseObj = (col, row, team) => ({ type: 'base', col, row, ...ctr(col, row), team });
const towerObj = (col, row, slot) => ({ type: 'tower', col, row, ...ctr(col, row), slot });
const healObj = (col, row) => ({ type: 'heal', col, row, ...ctr(col, row) });

// ── worldAdvSettings builder (mirrors js/game.js defaults) ──
function advSettings(overrides = {}) {
  return Object.assign({
    disableDragonHealing: false, dayCycleMinutes: 10, nightSpawnBoost: false,
    fullMoonHpBoost: false, unlimitedArrows: true, controllerSensitivity: 1,
    controllerAimSensitivity: 1, twoPlayerMode: false, disableXpSpeedBoost: false,
    musicVolume: 0.5, sfxVolume: 0.5, bossHealthMultiplier: 1, bossDamageMultiplier: 1,
    bossAttackRateMultiplier: 1, chatDisabled: false, controllerDeadzone: 0.2,
    physicsGravity: 0.66, jumpPadVForce: -18, jumpHeightBlocks: null,
    airJumpEnabled: false, sprintEnabled: true, worldZoom: 1.0,
    // Speed-Run tuning (engine defaults, stated explicitly for determinism)
    srBaseSpeed: 1.0, srMaxMultiplier: 2.0, srBoostPct: 0.05,
    srTimeBoostEnabled: true, srTimeBoostIntervalSec: 5,
    srDistBoostEnabled: true, srDistBoostIntervalBlocks: 5,
    srMinZoomSpeed: 1.0, srMaxZoomSpeed: null,
    backgroundTheme: 'auto',
    arenaPlayerMaxHealth: 20, arenaZoomMode: 'NONE', arenaPresetZoom: 1.0,
    redstoneSpeed: 1.0, arenaViewType: 'single', arenaMobHealth: 'MEDIUM',
    arenaRespawnTime: 2,
    arenaEnabledTypes: ['MOB_HUNTER', 'COLLECT_EMERALDS', 'KING_OF_HILL',
      'SURVIVAL_WAVES', 'DEATHMATCH', 'CAPTURE_FLAG', 'DEFEND_TOWER'],
    physicsLocked: false, bossScalingLocked: false,
  }, overrides);
}

function provenance(name) {
  // importWorld re-stamps provenance; this documents origin regardless.
  return {
    uid: 'sample-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    createdAt: 0, updatedAt: 0, creator: '[Sample] Generator',
    origin: 'local', copiedFrom: null, copiedAt: null,
  };
}

// Assemble a full world payload from a built grid + parts.
function world(opts) {
  const { name, mode, gr, playerPx, playerPy, adv = {} } = opts;
  return {
    saveVersion: 2,
    playerName: 'Sample',            // + worldName => unique SR levelId
    worldName: name,
    description: opts.description || 'Generated sample/test world.',
    savedAt: '2026-07-04T00:00:00.000Z',
    worldWidth: gr.W, worldHeight: gr.H,
    gameModeDefault: mode,           // NRM|PLT|RUN|ARN (import forces NRM; set via card)
    grid: gr.g,
    playerPx: playerPx | 0, playerPy: playerPy | 0,
    spawnEggs: opts.spawnEggs || [],
    emeralds: opts.emeralds || [],
    powerups: opts.powerups || [],
    spawnLines: opts.spawnLines || [],
    placedHill: opts.placedHill || null,
    playerSpawns: opts.playerSpawns || [],
    arenaObjects: opts.arenaObjects || [],
    placedItems: [], portalLinks: [],
    sandboxLevers: opts.sandboxLevers || [],
    sandboxTrapdoors: opts.sandboxTrapdoors || [],
    sandboxPistons: opts.sandboxPistons || [],
    dustBlocks: opts.dustBlocks || [],
    transmitters: [], receivers: [], gateBlocks: [], chests: [],
    ruinedPortals: [], endPortalAnchors: [],
    dragonState: null, crystalStates: null,
    liveMobs: [], droppedItems: [], dragonDefeated: false,
    collectedDiscs: [],
    worldAdvSettings: advSettings(adv),
    provenance: provenance(name),
    playerProgress: {
      px: playerPx | 0, py: playerPy | 0, hp: 20, xp: 0, level: 0,
      selectedSlot: 0, hotbar: [], inventory: [], equippedArmor: {},
      hasFlintSteel: false, discoveredOres: [],
    },
  };
}

// ── Validation ───────────────────────────────────────────────
// A cell (c,r) is standable if r+1 is solid and r, r-1 are non-solid/non-hazard.
function standable(gr, c, r) {
  if (r < 1 || r >= gr.H - 1 || c < 0 || c >= gr.W) return false;
  const below = get(gr, c, r + 1);
  if (!SOLID.has(below)) return false;
  for (const rr of [r, r - 1]) {
    const b = get(gr, c, rr);
    if (SOLID.has(b) || HAZARD.has(b)) return false;
  }
  return true;
}
function passable(gr, c, r) { const b = get(gr, c, r); return !SOLID.has(b) && !HAZARD.has(b); }
// nearest standable at/below (c,r) within MAX_DROP (for walk-off-ledge fall)
function dropTo(gr, c, r) {
  for (let rr = r; rr <= Math.min(gr.H - 2, r + MAX_DROP); rr++) {
    if (standable(gr, c, rr)) return rr;
  }
  return -1;
}
function key(c, r) { return c + ',' + r; }

// BFS over standable cells honoring the jump envelope. Returns reachable Set of "c,r".
function reachable(gr, startC, startR) {
  // snap start down to ground
  let sr = standable(gr, startC, startR) ? startR : dropTo(gr, startC, startR);
  if (sr < 0) return new Set();
  const seen = new Set([key(startC, sr)]);
  const q = [[startC, sr]];
  while (q.length) {
    const [c, r] = q.pop();
    const nbrs = [];
    // walk left/right (same row) or drop off a ledge
    for (const dc of [-1, 1]) {
      const nc = c + dc;
      if (standable(gr, nc, r)) nbrs.push([nc, r]);
      else if (passable(gr, nc, r) && passable(gr, nc, r - 1)) {
        const lr = dropTo(gr, nc, r);
        if (lr >= 0) nbrs.push([nc, lr]);
      }
    }
    // jumps: up to MAX_JUMP_UP up, MAX_DROP down, MAX_JUMP_DX across
    for (let dc = -MAX_JUMP_DX; dc <= MAX_JUMP_DX; dc++) {
      for (let dr = -MAX_JUMP_UP; dr <= MAX_DROP; dr++) {
        if (dc === 0 && dr === 0) continue;
        const nc = c + dc, nr = r + dr;
        if (!standable(gr, nc, nr)) continue;
        // horizontal reach shrinks the higher you go (rough arc gate)
        const upCost = dr < 0 ? -dr : 0;
        const budget = MAX_JUMP_DX - upCost; // 3-up jump still crosses ~3 across
        if (Math.abs(dc) > Math.max(1, budget)) continue;
        nbrs.push([nc, nr]);
      }
    }
    for (const [nc, nr] of nbrs) {
      const k = key(nc, nr);
      if (!seen.has(k)) { seen.add(k); q.push([nc, nr]); }
    }
  }
  return seen;
}

// Confirm a "point of interest" sits on standable ground; return the standable
// cell (snapping down one row if the marker is placed one above the floor).
function poiCell(gr, c, r, label, problems) {
  for (const rr of [r, r + 1, r - 1, r + 2]) {
    if (standable(gr, c, rr)) return [c, rr];
  }
  problems.push(`${label} @ (${c},${r}) is not on solid ground with headroom`);
  return null;
}

function validate(name, gr, pois, startCR) {
  const problems = [];
  const cells = [];
  for (const p of pois) {
    const cell = poiCell(gr, p.c, p.r, p.label, problems);
    if (cell) cells.push({ ...p, cell });
  }
  // reachability from the given start (or first POI)
  const [scRaw, srRaw] = startCR || [cells[0]?.cell[0], cells[0]?.cell[1]];
  const reach = reachable(gr, scRaw, srRaw);
  for (const c of cells) {
    if (!reach.has(key(c.cell[0], c.cell[1]))) {
      problems.push(`${c.label} @ (${c.cell[0]},${c.cell[1]}) is UNREACHABLE from start (${scRaw},${srRaw})`);
    }
  }
  return { problems, reachCount: reach.size };
}

// ============================================================
// WORLD BUILDERS
// ============================================================
const worlds = [];
function emit(payload, pois, startCR, gr) {
  const res = validate(payload.worldName, gr, pois, startCR);
  worlds.push({ payload, res });
}

// ── Shared Speed-Run generator ───────────────────────────────
// Builds a left→right route as a start plateau + a chain of platforms whose
// lip-to-lip jump distance and rise are guaranteed within the physics budget
// (empty gap ∈ {2,3} → dc ∈ {3,4}; |rise| ≤ 2 → up-budget 6−2 = 4 ≥ dc). This
// makes the whole route reachable BY CONSTRUCTION; the validator re-confirms.
// Deterministic (index-driven, no RNG) so runs reproduce.
function buildSpeedRun(opts) {
  const { name, W, H, base, block, bandUp, hazard, desc, theme,
          itemStep, boosterCols, padCols, soulCols } = opts;
  const gr = makeGrid(W, H);
  if (hazard != null) rect(gr, 0, base + 2, W - 1, H - 2, hazard);
  rect(gr, 0, H - 1, W - 1, H - 1, B.BEDROCK);

  const startW = 26;
  ground(gr, 0, startW, base, block, 5);
  let top = base, c = startW;             // c = last occupied column (a lip)
  const gaps = [2, 3, 2, 3, 3];           // empty-column counts → dc = gap+1 ∈ {3,4}
  const rises = [-1, 1, -2, 0, 2, -1, 1, -2, 2, 0]; // + = up (row decreases)
  let i = 0;
  while (c < W - 34) {
    const gap = gaps[i % gaps.length];
    let rise = rises[i % rises.length];
    let ntop = top - rise;                // up = smaller row number
    ntop = Math.max(base - bandUp, Math.min(base, ntop));
    if (Math.abs(ntop - top) > 2) ntop = top + Math.sign(ntop - top) * 2; // clamp rise ≤2
    const w = 14 + (i % 4) * 4;
    const a = c + gap + 1;                 // start col of next platform (dc = a-c = gap+1)
    const b = Math.min(W - 8, a + w - 1);
    ground(gr, a, b, ntop, block, 5);
    top = ntop; c = b; i++;
  }
  // final plateau + GOAL gate
  ground(gr, c + 1, W - 1, top, block, 5);
  const goalC = W - 6;
  set(gr, goalC, top - 1, B.GOAL); set(gr, goalC, top - 2, B.GOAL);

  // decorations (placed on platform tops where solid ground is 1 below)
  const onTop = (cc, dy, b) => { // find platform top at column cc, place b `dy` above it
    for (let rr = 0; rr < H; rr++) if (SOLID.has(get(gr, cc, rr))) { set(gr, cc, rr - dy, b); return; }
  };
  for (const bc of (boosterCols || [])) { onTop(bc, 1, B.SPEED_BOOSTER); onTop(bc + 1, 1, B.SPEED_BOOSTER); }
  for (const pc of (padCols || [])) onTop(pc, 1, B.JUMP_PAD);
  for (const sc of (soulCols || [])) onTop(sc, 0, B.SOUL_SAND); // replace the top block itself
  for (let ic = 40; ic < W - 40; ic += (itemStep || 120)) onTop(ic, 3, B.SPEED_ITEM);

  const startC = 4, startR = base - 1;
  const payload = world({
    name, mode: 'RUN', gr, playerPx: startC * BS, playerPy: (startR - 1) * BS - 20,
    // autoStepUp on by default for Speed Run — walk/run up 1-block ledges without
    // jumping (build 54). Toggle per-world in World Settings → Physics → Auto-Climb.
    description: desc, adv: { backgroundTheme: theme, autoStepUp: true },
  });
  emit(payload, [
    { c: startC, r: startR, label: 'start' },
    { c: goalC, r: top - 1, label: 'GOAL' },
  ], [startC, startR], gr);
}

function buildSR1() {
  buildSpeedRun({
    name: '[Sample] SR · First Steps', W: 900, H: 40, base: 30, block: B.GRASS,
    bandUp: 4, hazard: null, theme: 'sky',
    desc: 'Easy intro Speed Run — wide platforms, gentle gaps, forgiving. (Set Mode: Speed Runner.)',
    itemStep: 110, boosterCols: [110, 360, 640], padCols: [230, 500, 780],
  });
}
function buildSR2() {
  buildSpeedRun({
    name: '[Sample] SR · Cavern Dash', W: 1050, H: 46, base: 34, block: B.DEEPSLATE,
    bandUp: 6, hazard: null, theme: 'cave',
    desc: 'Medium technical Speed Run — deepslate cavern, tighter rhythm jumps. (Set Mode: Speed Runner.)',
    itemStep: 100, boosterCols: [90, 330, 560, 820], padCols: [160, 430, 700, 940],
  });
}
function buildSR3() {
  buildSpeedRun({
    name: '[Sample] SR · Nether Gauntlet', W: 1200, H: 50, base: 36, block: B.NETHERRACK,
    bandUp: 5, hazard: B.LAVA, theme: 'nether',
    desc: 'Hard hazard Speed Run — lava floor under the route, precise jumps, jump-pad chains. (Set Mode: Speed Runner.)',
    itemStep: 110, boosterCols: [130, 400, 720, 980], padCols: [230, 500, 780, 1050],
    soulCols: [90, 300, 620, 900],
  });
}

// ==== ARENA A — Grassland Melee (4P FFA, Overworld) ==========
function buildFFA() {
  const W = 50, H = 26, gr = makeGrid(W, H);
  const floor = 20;
  ground(gr, 0, W - 1, floor, B.GRASS, H - floor); // full grass floor
  rect(gr, 0, H - 1, W - 1, H - 1, B.BEDROCK);
  // side walls
  rect(gr, 0, 0, 0, H - 1, B.STONE); rect(gr, W - 1, 0, W - 1, H - 1, B.STONE);
  // two raised mesas — 3 blocks up (jumpable: apex clears 3), spawns on top
  ground(gr, 8, 16, floor - 3, B.GRASS, 2);   // left mesa top row floor-3
  ground(gr, 33, 41, floor - 3, B.GRASS, 2);  // right mesa
  // central pit with a bridge (pit = 3 deep, bridge island in the middle)
  rect(gr, 22, floor, 27, floor + 3, B.AIR); // carve pit
  plat(gr, 24, 25, floor - 2, B.OAK_LOG);    // small bridge island
  // spawn points: P1/P2 on the floor corners, P3/P4 on the mesas
  const spawns = [spawnPt(3, floor - 1, 1), spawnPt(46, floor - 1, 2),
                  spawnPt(12, floor - 4, 3), spawnPt(37, floor - 4, 4)];
  // emeralds — 2 groups, contested middle bridge + mesas
  const ems = [emerald(24, floor - 4, 1), emerald(25, floor - 4, 1), emerald(20, floor - 1, 1),
               emerald(29, floor - 1, 1), emerald(12, floor - 4, 2), emerald(37, floor - 4, 2),
               emerald(19, floor - 1, 2), emerald(30, floor - 1, 2)];
  const pus = [powerup(12, floor - 4, 'SPEED'), powerup(37, floor - 4, 'HEALTH')];
  const lines = [spawnLine(6, floor - 1, 1), spawnLine(43, floor - 1, 1)];
  const eggs = [spawnEgg(6, floor - 1, 'zombie'), spawnEgg(43, floor - 1, 'skeleton')];
  const payload = world({
    name: '[Sample] Arena · Grassland Melee', mode: 'ARN', gr, playerPx: 3 * BS, playerPy: (floor - 3) * BS,
    description: '4-player FFA — open grassy bowl, 2 mesas, centre pit-bridge. (Set Mode: Arena.)',
    adv: { backgroundTheme: 'sky' },
    playerSpawns: spawns, emeralds: ems, powerups: pus, spawnLines: lines, spawnEggs: eggs,
  });
  const pois = spawns.map((s, i) => ({ c: s.col, r: s.row, label: `spawn${i + 1}` }))
    .concat([{ c: 24, r: floor - 4, label: 'centre-emeralds' }]);
  emit(payload, pois, [3, floor - 2], gr);
}

// ==== ARENA B — Void Twins (2v2 Team, End) ===================
function buildTeam() {
  const W = 46, H = 26, gr = makeGrid(W, H);
  const top = 15; // island top row
  // Two team islands (mirrored) + central shared island, floating over the void.
  // Left team island
  ground(gr, 3, 15, top, B.OBSIDIAN, 3);
  ground(gr, 5, 13, top - 3, B.DEEPSLATE, 1); // upper ledge
  // Right team island (mirror)
  ground(gr, 30, 42, top, B.OBSIDIAN, 3);
  ground(gr, 32, 40, top - 3, B.DEEPSLATE, 1);
  // Central shared island (KOTH-ready), reachable by symmetric jumps
  ground(gr, 20, 25, top + 1, B.DEEPSLATE, 3);
  // stepping islands to central (symmetric, gaps ~4)
  ground(gr, 17, 18, top, B.OBSIDIAN, 1); ground(gr, 27, 28, top, B.OBSIDIAN, 1);
  // team spawns: slots 1&3 left, 2&4 right (mirrored)
  const spawns = [spawnPt(5, top - 2, 1), spawnPt(40, top - 2, 2),
                  spawnPt(12, top - 2, 3), spawnPt(33, top - 2, 4)];
  const hill = { col: 21, row: top - 1, w: 4, h: 2 };
  const ems = [emerald(6, top - 5, 1), emerald(39, top - 5, 1),
               emerald(22, top - 1, 2), emerald(23, top - 1, 2)];
  const pus = [powerup(9, top - 2, 'HEALTH'), powerup(36, top - 2, 'HEALTH')];
  const payload = world({
    name: '[Sample] Arena · Void Twins', mode: 'ARN', gr, playerPx: 5 * BS, playerPy: (top - 3) * BS,
    description: '2v2 team map — symmetric End islands over the void, central contest island (KOTH-ready). (Set Mode: Arena.)',
    adv: { backgroundTheme: 'end', twoPlayerMode: true },
    playerSpawns: spawns, placedHill: hill, emeralds: ems, powerups: pus,
  });
  const pois = spawns.map((s, i) => ({ c: s.col, r: s.row, label: `spawn${i + 1}` }))
    .concat([{ c: 21, r: top, label: 'hill' }]);
  emit(payload, pois, [5, top - 2], gr);
}

// ==== ARENA C — Fortress Rush (CTF, Nether) ==================
function buildCTF() {
  const W = 60, H = 24, gr = makeGrid(W, H);
  const floor = 18;
  ground(gr, 0, W - 1, floor, B.NETHERRACK, H - floor);
  rect(gr, 0, H - 1, W - 1, H - 1, B.BEDROCK);
  rect(gr, 0, 0, 0, H - 1, B.OBSIDIAN); rect(gr, W - 1, 0, W - 1, H - 1, B.OBSIDIAN);
  // two mirrored fortresses (raised ramparts) at each end
  ground(gr, 2, 12, floor - 4, B.NETHERRACK, 1);   // left rampart
  ground(gr, 47, 57, floor - 4, B.NETHERRACK, 1);  // right rampart
  // steps up to each rampart (climbable, <=3 each)
  plat(gr, 12, 13, floor - 1, B.NETHERRACK); plat(gr, 13, 14, floor - 2, B.NETHERRACK); plat(gr, 14, 15, floor - 3, B.NETHERRACK);
  plat(gr, 46, 47, floor - 1, B.NETHERRACK); plat(gr, 45, 46, floor - 2, B.NETHERRACK); plat(gr, 44, 45, floor - 3, B.NETHERRACK);
  // top ridge lane (exposed) across the middle
  ground(gr, 18, 41, floor - 6, B.NETHERRACK, 1);
  // steps from floor to ridge on both sides
  plat(gr, 16, 17, floor - 4, B.NETHERRACK); plat(gr, 17, 18, floor - 5, B.NETHERRACK);
  plat(gr, 42, 43, floor - 4, B.NETHERRACK); plat(gr, 41, 42, floor - 5, B.NETHERRACK);
  // low lane lava pinches (small, jumpable ~3 wide, never under base/spawn)
  rect(gr, 24, floor, 26, floor + 2, B.AIR); rect(gr, 24, floor + 1, 26, floor + 2, B.LAVA);
  rect(gr, 33, floor, 35, floor + 2, B.AIR); rect(gr, 33, floor + 1, 35, floor + 2, B.LAVA);
  // CTF bases on ramparts (team 0 left, team 1 right)
  const bases = [baseObj(6, floor - 5, 0), baseObj(53, floor - 5, 1)];
  const spawns = [spawnPt(4, floor - 5, 1), spawnPt(9, floor - 5, 3),   // team0 (left)
                  spawnPt(55, floor - 5, 2), spawnPt(50, floor - 5, 4)]; // team1 (right)
  const pus = [powerup(29, floor - 7, 'SPEED'), powerup(30, floor - 7, 'SPEED')];
  const payload = world({
    name: '[Sample] Arena · Fortress Rush', mode: 'ARN', gr, playerPx: 4 * BS, playerPy: (floor - 6) * BS,
    description: 'Capture the Flag (2v2) — mirrored Nether fortresses, 3 lanes, lava pinches on the low route. (Set Mode: Arena.)',
    adv: { backgroundTheme: 'nether', twoPlayerMode: true },
    playerSpawns: spawns, arenaObjects: bases, powerups: pus,
  });
  const pois = spawns.map((s, i) => ({ c: s.col, r: s.row, label: `spawn${i + 1}` }))
    .concat([{ c: 6, r: floor - 5, label: 'base0' }, { c: 53, r: floor - 5, label: 'base1' },
             { c: 29, r: floor - 6, label: 'ridge' }]);
  emit(payload, pois, [4, floor - 5], gr);
}

// ==== ARENA D — Crater Crown (KOTH, Cave) ====================
function buildKOTH() {
  const W = 40, H = 24, gr = makeGrid(W, H);
  const floor = 19;
  ground(gr, 0, W - 1, floor, B.DEEPSLATE, H - floor);
  rect(gr, 0, H - 1, W - 1, H - 1, B.BEDROCK);
  rect(gr, 0, 0, 0, H - 1, B.STONE); rect(gr, W - 1, 0, W - 1, H - 1, B.STONE);
  // central plateau (the crown) — raised, approachable from 4 directions
  ground(gr, 16, 23, floor - 4, B.DEEPSLATE, 1);
  // two ground ramps (left & right) up to the plateau (<=3 steps)
  plat(gr, 13, 14, floor - 1, B.DEEPSLATE); plat(gr, 14, 15, floor - 2, B.DEEPSLATE); plat(gr, 15, 16, floor - 3, B.DEEPSLATE);
  plat(gr, 25, 26, floor - 1, B.DEEPSLATE); plat(gr, 24, 25, floor - 2, B.DEEPSLATE); plat(gr, 23, 24, floor - 3, B.DEEPSLATE);
  // two side ledges (3 up, jumpable) for the other two approaches
  ground(gr, 6, 11, floor - 3, B.DEEPSLATE, 1);
  ground(gr, 28, 33, floor - 3, B.DEEPSLATE, 1);
  // hill zone on the plateau
  const hill = { col: 18, row: floor - 5, w: 4, h: 2 };
  const spawns = [spawnPt(3, floor - 1, 1), spawnPt(36, floor - 1, 2),
                  spawnPt(8, floor - 4, 3), spawnPt(31, floor - 4, 4)];
  const pus = [powerup(8, floor - 4, 'HEALTH'), powerup(31, floor - 4, 'SHIELD')];
  const ems = [emerald(18, floor - 5, 1), emerald(21, floor - 5, 1), emerald(4, floor - 1, 1), emerald(35, floor - 1, 1)];
  const payload = world({
    name: '[Sample] Arena · Crater Crown', mode: 'ARN', gr, playerPx: 3 * BS, playerPy: (floor - 3) * BS,
    description: 'King of the Hill — central cavern plateau contestable from 4 approaches. (Set Mode: Arena.)',
    adv: { backgroundTheme: 'cave' },
    playerSpawns: spawns, placedHill: hill, powerups: pus, emeralds: ems,
  });
  const pois = spawns.map((s, i) => ({ c: s.col, r: s.row, label: `spawn${i + 1}` }))
    .concat([{ c: 18, r: floor - 5, label: 'hill' }]);
  emit(payload, pois, [3, floor - 2], gr);
}

// ==== ARENA E — Keep Siege (Defend the Tower, Overworld) =====
function buildDefend() {
  const W = 48, H = 26, gr = makeGrid(W, H);
  const floor = 20;
  ground(gr, 0, W - 1, floor, B.GRASS, H - floor);
  rect(gr, 0, H - 1, W - 1, H - 1, B.BEDROCK);
  rect(gr, 0, 0, 0, H - 1, B.STONE); rect(gr, W - 1, 0, W - 1, H - 1, B.STONE);
  // two raised stone keeps (opposite ends)
  ground(gr, 2, 12, floor - 4, B.STONE, 1);
  ground(gr, 35, 45, floor - 4, B.STONE, 1);
  // ramparts set back: a low wall in front of each tower
  plat(gr, 10, 10, floor - 5, B.STONE); plat(gr, 10, 10, floor - 6, B.STONE);
  plat(gr, 37, 37, floor - 5, B.STONE); plat(gr, 37, 37, floor - 6, B.STONE);
  // steps up to each keep (<=3)
  plat(gr, 12, 13, floor - 1, B.STONE); plat(gr, 13, 14, floor - 2, B.STONE); plat(gr, 14, 15, floor - 3, B.STONE);
  plat(gr, 35, 36, floor - 1, B.STONE); plat(gr, 34, 35, floor - 2, B.STONE); plat(gr, 33, 34, floor - 3, B.STONE);
  // central raised platform for the heal tower (equidistant, exposed)
  ground(gr, 22, 25, floor - 3, B.OAK_PLANKS, 1);
  plat(gr, 20, 21, floor - 1, B.OAK_PLANKS); plat(gr, 21, 22, floor - 2, B.OAK_PLANKS);
  plat(gr, 27, 28, floor - 1, B.OAK_PLANKS); plat(gr, 26, 27, floor - 2, B.OAK_PLANKS);
  // Towers (one per keep) + central Heal Tower
  const objs = [towerObj(5, floor - 5, 1), towerObj(42, floor - 5, 2), healObj(23, floor - 4)];
  const spawns = [spawnPt(4, floor - 5, 1), spawnPt(9, floor - 5, 3),
                  spawnPt(43, floor - 5, 2), spawnPt(38, floor - 5, 4)];
  const pus = [powerup(17, floor - 1, 'HEALTH'), powerup(30, floor - 1, 'HEALTH')];
  const payload = world({
    name: '[Sample] Arena · Keep Siege', mode: 'ARN', gr, playerPx: 4 * BS, playerPy: (floor - 6) * BS,
    description: 'Defend the Tower — two stone keeps, set-back towers, contested central Heal Tower. (Set Mode: Arena.)',
    adv: { backgroundTheme: 'sky', twoPlayerMode: true },
    playerSpawns: spawns, arenaObjects: objs, powerups: pus,
  });
  const pois = spawns.map((s, i) => ({ c: s.col, r: s.row, label: `spawn${i + 1}` }))
    .concat([{ c: 5, r: floor - 5, label: 'tower1' }, { c: 42, r: floor - 5, label: 'tower2' },
             { c: 23, r: floor - 4, label: 'healtower' }]);
  emit(payload, pois, [4, floor - 5], gr);
}

// ==== ARENA F — Switch & Sever (Creative + redstone, Cave) ===
function buildCreative() {
  const W = 44, H = 26, gr = makeGrid(W, H);
  const floor = 20;
  ground(gr, 0, W - 1, floor, B.DEEPSLATE, H - floor);
  rect(gr, 0, H - 1, W - 1, H - 1, B.BEDROCK);
  rect(gr, 0, 0, 0, H - 1, B.STONE); rect(gr, W - 1, 0, W - 1, H - 1, B.STONE);
  const levers = [], trapdoors = [], pistons = [], dust = [];
  const D = (c, r) => dust.push({ col: c, row: r, on: false, setting: 'always_show', everTriggered: false });

  // ── Vault: a walled emerald chamber (cols 20-25) sealed by a TRAPDOOR door.
  // Walls of deepslate from floor-1 up to floor-4; the doorway at col 19 is the
  // TRAPDOOR (closed=solid). Opening it (lever) lets players in.
  rect(gr, 19, floor - 4, 26, floor - 4, B.DEEPSLATE); // ceiling
  rect(gr, 19, floor - 3, 19, floor - 1, B.DEEPSLATE); // left wall (with door gap at floor-1)
  rect(gr, 26, floor - 3, 26, floor - 1, B.DEEPSLATE); // right wall
  set(gr, 19, floor - 1, B.TRAPDOOR); // the door (entrance at floor level)
  trapdoors.push({ col: 19, row: floor - 1, open: false });
  // vault emeralds inside
  const ems = [emerald(21, floor - 1, 1), emerald(22, floor - 1, 1), emerald(23, floor - 1, 1),
               emerald(24, floor - 1, 1), emerald(21, floor - 2, 1), emerald(24, floor - 2, 1)];
  // Lever near the vault (col 15) wired by dust along the floor-top to the door.
  set(gr, 15, floor - 1, B.LEVER); levers.push({ col: 15, row: floor - 1, on: false });
  // dust chain: from a cell orthogonally adjacent to the lever, along row floor-1,
  // to a cell orthogonally adjacent to the trapdoor (col 18, i.e. left of door col 19).
  for (let c = 16; c <= 18; c++) D(c, floor - 1);
  // (lever@15 -> dust@16 adjacent; dust@18 adjacent to trapdoor@19 -> opens on power)

  // ── Demo piston shortcut: a lever->dust->piston that retracts a block to open a gap.
  // A 1-wide wall of deepslate at col 33 (floor-1..floor-3) blocks a side alcove with
  // a power-up. A piston at col 33/floor-1 pushing 'up' isn't right; instead use a
  // trapdoor-style: simpler = second lever opens a second trapdoor to the alcove.
  rect(gr, 33, floor - 3, 33, floor - 2, B.DEEPSLATE); // door jamb (rows above the door — can't jump over)
  set(gr, 33, floor - 1, B.TRAPDOOR); trapdoors.push({ col: 33, row: floor - 1, open: false });
  rect(gr, 33, floor - 4, 36, floor - 4, B.DEEPSLATE); // alcove ceiling
  rect(gr, 36, floor - 3, 36, floor - 1, B.DEEPSLATE); // alcove far wall
  set(gr, 30, floor - 1, B.LEVER); levers.push({ col: 30, row: floor - 1, on: false });
  for (let c = 31; c <= 32; c++) D(c, floor - 1);
  const pus = [powerup(35, floor - 1, 'HEALTH')];

  // Player spawns (4) out on the open floor, away from the vault
  const spawns = [spawnPt(3, floor - 2, 1), spawnPt(40, floor - 2, 2),
                  spawnPt(8, floor - 2, 3), spawnPt(11, floor - 2, 4)];
  const payload = world({
    name: '[Sample] Arena · Switch & Sever', mode: 'ARN', gr, playerPx: 3 * BS, playerPy: (floor - 3) * BS,
    description: 'Creative/redstone — flip the lever to open the emerald vault; second lever opens a power-up alcove. (Set Mode: Arena.)',
    adv: { backgroundTheme: 'cave' },
    playerSpawns: spawns, emeralds: ems, powerups: pus,
    sandboxLevers: levers, sandboxTrapdoors: trapdoors, sandboxPistons: pistons, dustBlocks: dust,
  });
  // Reachability: trapdoors are treated as passable (door opens), so the vault
  // should be reachable once the lever is flipped. Validate that assumption.
  const pois = spawns.map((s, i) => ({ c: s.col, r: s.row, label: `spawn${i + 1}` }))
    .concat([{ c: 22, r: floor - 1, label: 'vault' }, { c: 35, r: floor - 1, label: 'alcove-powerup' }]);
  emit(payload, pois, [3, floor - 2], gr);
}

// ── Run all ──────────────────────────────────────────────────
buildSR1(); buildSR2(); buildSR3();
buildFFA(); buildTeam(); buildCTF(); buildKOTH(); buildDefend(); buildCreative();

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
let allOk = true;
const report = [];
for (const { payload, res } of worlds) {
  const fname = payload.worldName.replace(/^\[Sample\]\s*/, '').replace(/[^A-Za-z0-9]+/g, '_') + '.json';
  fs.writeFileSync(path.join(OUT, fname), JSON.stringify(payload));
  const ok = res.problems.length === 0;
  allOk = allOk && ok;
  report.push({ name: payload.worldName, file: fname, mode: payload.gameModeDefault,
    size: `${payload.worldWidth}x${payload.worldHeight}`, ok, reach: res.reachCount, problems: res.problems });
}
console.log(JSON.stringify(report, null, 2));
console.log(allOk ? '\nALL WORLDS PASS STRUCTURAL CHECK' : '\n*** SOME WORLDS HAVE STRUCTURAL PROBLEMS ***');
process.exit(allOk ? 0 : 2);
