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
// Reuse the SHARED movement model (Smart Mobs §6) so the Speed-Run structural
// validator and the mob pathfinder can never drift apart — one physics envelope,
// one neighbour model. (This checker is where that model was first written; it
// now lives in js/pathfinding.js and is imported back here.)
const { navReachable } = require('../js/pathfinding.js');

const BS = 32;
const OUT = path.join(__dirname, '..', 'sample-worlds');

// ── Block ids (subset used here) ─────────────────────────────
const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, OAK_LOG: 4, OAK_LEAVES: 5, BEDROCK: 6,
  PLANKS: 7, OAK_PLANKS: 7, COAL_ORE: 8, IRON_ORE: 9, GOAL: 10, GRAVEL: 11,
  DIAMOND_ORE: 12, GOLD_ORE: 13, OBSIDIAN: 15, DEEPSLATE: 16, SOUL_SAND: 17,
  NETHERRACK: 21, LAVA: 22, TRAPDOOR: 23, PISTON: 24, LEVER: 27, TNT: 29,
  GLOWSTONE: 48, SPEED_BOOSTER: 56, JUMP_PAD: 57, SPEED_ITEM: 58,
};
const SOLID = new Set([1, 2, 3, 4, 6, 7, 8, 9, 11, 12, 13, 15, 16, 17, 21, 24, 29, 48, 57]);
const HAZARD = new Set([22]); // lava — deadly, never standable
// trapdoor(23) treated as passable for reachability (the mechanic opens it).

// Physics envelope for the reachability check.
const MAX_JUMP_UP = 3;   // blocks the apex clears
const MAX_JUMP_DX = 6;   // horizontal blocks in one jump (same level)
const MAX_DROP    = 40;   // blocks a player may fall to land
const PAD_JUMP_UP = 7;   // JUMP_PAD launch apex (vy≈-18 → ~7.6 blocks)
const PAD_JUMP_DX = 10;  // JUMP_PAD horizontal reach

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

// BFS over standable cells honoring the jump envelope. Returns reachable Set of
// "c,r". Delegates to the shared model in js/pathfinding.js via a thin nav adapter
// over this grid (out-of-bounds = BEDROCK, matching get()), so the validator uses
// the exact same standable/passable/jump-envelope logic the mobs do.
function reachable(gr, startC, startR, opts = {}) {
  const nav = {
    W: gr.W, H: gr.H,
    solid:  (c, r) => SOLID.has(get(gr, c, r)),
    hazard: (c, r) => HAZARD.has(get(gr, c, r)),
    pad:    (c, r) => get(gr, c, r) === B.JUMP_PAD,
  };
  return navReachable(nav, startC, startR, opts);
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

function validate(name, gr, pois, startCR, opts = {}) {
  const problems = [];
  const cells = [];
  for (const p of pois) {
    const cell = poiCell(gr, p.c, p.r, p.label, problems);
    if (cell) cells.push({ ...p, cell });
  }
  // reachability from the given start (or first POI)
  const [scRaw, srRaw] = startCR || [cells[0]?.cell[0], cells[0]?.cell[1]];
  const reach = reachable(gr, scRaw, srRaw, opts);
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
function emit(payload, pois, startCR, gr, opts = {}) {
  const res = validate(payload.worldName, gr, pois, startCR, opts);
  worlds.push({ payload, res });
}

// ── Speed-Run generator v2 (Batch-1 feedback, build 55) ──────
// Builds a level from a left→right SEGMENT SCRIPT. Design rules baked in
// (see world_creation.md "Speed Run design rules v2"):
//   • Long runs, FEW gaps; every gap doable (≤4 jump, or a jump-pad for wider).
//   • NO stranding floor: gaps are bottomless (void death) or lava channels.
//   • Telegraph each gap: a gold ground "warning strip" + a sky marker; jump-pads
//     use the green pad itself + a glowstone sky "gateway".
//   • Zone bands: the sub-surface body block changes by region (visual identity).
//   • Ramps (1-block staircases) climb automatically — reserve jumps for gaps.
// Deterministic (no RNG). The reachability validator (pad-aware) re-confirms.
const SR = { DEPTH: 6, STEP_W: 2, PAD_W: 4, CUE_STRIP: 3, SKY_ROW: 6, LEAD: 4, START_W: 24, FINISH_W: 26 };

function srSegWidth(s) {
  if (s.run)   return s.run;
  if (s.boost) return s.boost;
  if (s.gap)   return s.gap;
  if (s.pad)   return s.pad;
  if (s.ramp)  return s.ramp * SR.STEP_W;
  return 0;
}

function buildSpeedRun(opts) {
  const { name, H, base, surface, bodyBands, hazard, desc, theme, minTop, script } = opts;
  const totalW = SR.START_W + script.reduce((a, s) => a + srSegWidth(s), 0) + SR.FINISH_W;
  const gr = makeGrid(totalW, H);
  const zoneW = totalW / 3;
  const bodyAt = (col) => bodyBands[Math.max(0, Math.min(2, Math.floor(col / zoneW)))];

  // Lay a run of ground: surface block on `topRow`, zone body beneath. NO bottom
  // floor — anything not covered here is open void (fatal fall) unless lava-filled.
  const layGround = (a, b, topRow) => {
    for (let cc = a; cc <= b; cc++) {
      set(gr, cc, topRow, surface);
      for (let rr = topRow + 1; rr < topRow + SR.DEPTH; rr++) set(gr, cc, rr, bodyAt(cc));
    }
  };
  const skyBar = (centerCol, wide, thick, blk) => {
    for (let cc = centerCol - (wide >> 1); cc <= centerCol + (wide >> 1); cc++)
      for (let rr = SR.SKY_ROW; rr < SR.SKY_ROW + thick; rr++) set(gr, cc, rr, blk);
  };
  const skyGate = (col, blk) => { // two vertical pillars framing the approach
    for (let rr = SR.SKY_ROW; rr < SR.SKY_ROW + 4; rr++) { set(gr, col - 1, rr, blk); set(gr, col + 3, rr, blk); }
  };
  const groundCue = (a, b, topRow) => { for (let cc = a; cc <= b; cc++) set(gr, cc, topRow, B.GOLD_ORE); };
  const lavaFill = (a, b, topRow) => { // lava channel flush with the surface, in the gap
    if (hazard == null) return;
    for (let cc = a; cc <= b; cc++) for (let rr = topRow; rr < topRow + 4; rr++) set(gr, cc, rr, hazard);
  };
  const item = (col, topRow) => set(gr, col, topRow - 2, B.SPEED_ITEM); // head-height collectible

  // Start plateau
  layGround(0, SR.START_W, base);
  let c = SR.START_W, top = base, gapIx = 0;

  for (const s of script) {
    if (s.run) {
      layGround(c + 1, c + s.run, top);
      for (let k = 30; k < s.run; k += 34) item(c + k, top);   // sprinkle speed items
      c += s.run;
    } else if (s.boost) {
      layGround(c + 1, c + s.boost, top);
      for (let cc = c + 1; cc <= c + s.boost; cc++) set(gr, cc, top - 1, B.SPEED_BOOSTER); // run-through boost
      c += s.boost;
    } else if (s.ramp) {
      const dir = s.dir === 'down' ? 1 : -1;                    // up = row decreases
      for (let i = 0; i < s.ramp; i++) {
        let nt = top + dir;
        nt = Math.max(minTop, Math.min(base, nt));
        layGround(c + 1, c + SR.STEP_W, nt);
        top = nt; c += SR.STEP_W;
      }
    } else if (s.gap) {
      groundCue(c - SR.CUE_STRIP + 1, c, top);                  // gold warning strip on takeoff
      skyBar(c - SR.LEAD, 3, 1 + (gapIx % 3), B.GOLD_ORE);      // sky marker (thickness varies per gap)
      lavaFill(c + 1, c + s.gap, top);                          // lava channel (nether) — else bottomless
      c += s.gap; gapIx++;
    } else if (s.pad) {
      for (let cc = c - SR.PAD_W + 1; cc <= c; cc++) set(gr, cc, top, B.JUMP_PAD); // 4-wide pad ON the ground
      skyGate(c - SR.LEAD, B.GLOWSTONE);                        // tall "gateway" = big jump ahead
      lavaFill(c + 1, c + s.pad, top);
      c += s.pad; gapIx++;
    }
  }

  // Finish plateau + full-height GOAL line (spans the whole column above the
  // surface, so a jumper is caught at any height — matches the SR full-column
  // finish detection). Surface/body stay solid so you can run into it.
  layGround(c + 1, totalW - 1, top);
  const goalC = totalW - 8;
  for (let rr = 0; rr <= top - 1; rr++) set(gr, goalC, rr, B.GOAL);

  const startC = 4, startR = base - 1;
  const payload = world({
    name, mode: 'RUN', gr, playerPx: startC * BS, playerPy: (startR - 1) * BS - 20,
    description: desc, adv: { backgroundTheme: theme, autoStepUp: true },
  });
  emit(payload, [
    { c: startC, r: startR, label: 'start' },
    { c: goalC, r: top - 1, label: 'GOAL' },
  ], [startC, startR], gr);
}

// EASY — long forgiving run, 5 obstacles, one pad jump.
function buildSR1() {
  buildSpeedRun({
    name: '[Sample] SR · First Steps', H: 40, base: 30, surface: B.GRASS,
    bodyBands: [B.DIRT, B.STONE, B.GRAVEL], hazard: null, theme: 'sky', minTop: 16,
    desc: 'Easy intro Speed Run — long runs, few well-telegraphed gaps, auto-climb ramps. (Set Mode: Speed Runner.)',
    script: [
      { run: 110 }, { ramp: 2, dir: 'up' }, { run: 100 },
      { boost: 6 }, { gap: 3 }, { run: 130 },
      { ramp: 2, dir: 'down' }, { run: 110 },
      { gap: 3 }, { run: 120 },
      { gap: 4 }, { run: 120 },
      { pad: 7 }, { run: 130 },
      { gap: 3 }, { run: 110 },
      { gap: 4 }, { run: 100 },
    ],
  });
}
// MEDIUM — a cave run with a trap booster + two pad jumps.
function buildSR2() {
  buildSpeedRun({
    name: '[Sample] SR · Cavern Dash', H: 46, base: 34, surface: B.DEEPSLATE,
    bodyBands: [B.STONE, B.DEEPSLATE, B.GRAVEL], hazard: null, theme: 'cave', minTop: 16,
    desc: 'Medium Speed Run — deepslate cavern, a trap booster + pad jumps, but long runs between. (Set Mode: Speed Runner.)',
    script: [
      { run: 100 }, { ramp: 3, dir: 'up' }, { run: 90 },
      { gap: 3 }, { run: 120 },
      { boost: 6, trap: true }, { gap: 4 }, { run: 120 },
      { ramp: 2, dir: 'down' }, { run: 100 },
      { gap: 4 }, { run: 110 },
      { pad: 8 }, { run: 130 },
      { gap: 3 }, { run: 100 },
      { boost: 6 }, { gap: 4 }, { run: 120 },
      { pad: 7 }, { run: 120 },
      { gap: 3 }, { run: 100 },
    ],
  });
}
// HARD — nether, lava-channel gaps, trap boosters + pad jumps (still long runs).
function buildSR3() {
  buildSpeedRun({
    name: '[Sample] SR · Nether Gauntlet', H: 50, base: 36, surface: B.NETHERRACK,
    bodyBands: [B.NETHERRACK, B.SOUL_SAND, B.OBSIDIAN], hazard: B.LAVA, theme: 'nether', minTop: 16,
    desc: 'Hard Speed Run — lava-channel gaps (falls are fatal), pad jumps + a trap booster. (Set Mode: Speed Runner.)',
    script: [
      { run: 90 }, { ramp: 2, dir: 'up' }, { run: 80 },
      { gap: 3 }, { run: 110 },
      { gap: 4 }, { run: 90 },
      { boost: 6, trap: true }, { gap: 4 }, { run: 100 },
      { pad: 8 }, { run: 120 },
      { ramp: 3, dir: 'down' }, { run: 90 },
      { gap: 4 }, { run: 100 },
      { boost: 6 }, { gap: 4 }, { run: 110 },
      { pad: 8 }, { run: 120 },
      { gap: 3 }, { run: 90 },
      { gap: 4 }, { run: 90 },
    ],
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

// ==== PLATFORMER — First Steps Redux (original "1-1"-style homage) ==========
// A friendly opening level built around the new moves (double jump, ledge hang,
// ground slide, auto-climb) — original layout, Steveo's own tiles, no enemies.
// Solid earth throughout (no bottomless pits); higher platforms need a double
// jump; a tall ledge rewards an edge-grab; an optional slide tunnel skips a hop.
function buildHomage() {
  const W = 720, H = 44, base = 34, gr = makeGrid(W, H);
  const GR = B.GRASS, DIRT = B.DIRT, LOG = B.OAK_LOG, STONE = B.STONE;
  // Friendly terrain: solid earth everywhere so a missed jump is never fatal.
  rect(gr, 0, base + 1, W - 1, H - 2, DIRT);
  rect(gr, 0, base, W - 1, base, GR);
  rect(gr, 0, H - 1, W - 1, H - 1, B.BEDROCK);
  // Raised platform (grass cap + 2 dirt) at `top`, cols c0..c1.
  const plat3 = (c0, c1, top) => { for (let c = c0; c <= c1; c++) { set(gr, c, top, GR); set(gr, c, top + 1, DIRT); set(gr, c, top + 2, DIRT); } };
  const colFill = (c0, c1, r0, r1, blk) => rect(gr, c0, r0, c1, r1, blk);

  // 1) Opening runway 0–58 (flat, teaches movement).
  // 2) Tube hop — a 3-tall log column to jump over.
  colFill(60, 61, base - 3, base - 1, LOG);
  // 3) Another tube pair with a 1-block SLIDE gap between them at ground level:
  //    hop both (main) or slide the gap (flavor). Ceiling bar forces a low profile.
  colFill(96, 97, base - 3, base - 1, LOG);
  set(gr, 98, base - 1, LOG); set(gr, 99, base - 1, LOG);   // low bar → slide under, or jump the pair
  // 4) Forced DOUBLE-JUMP: a wall blocks the ground; go up onto a high platform.
  colFill(150, 154, base - 8, base, STONE);                 // impassable wall at ground
  plat3(146, 168, base - 6);                                // double-jump up (6) at the wall's left edge
  // 5) DOUBLE-JUMP climb — a short stack of tall steps (≈5 up each).
  plat3(176, 188, base - 6);
  plat3(190, 202, base - 11);
  // 6) Tall LEDGE (edge-grab reward, also double-jump reachable ≈5 up).
  plat3(205, 220, base - 16);
  // 7) Bridge right, then descend back toward ground (drops are always safe).
  plat3(224, 250, base - 12);
  plat3(254, 276, base - 7);
  // 8) Optional SLIDE tunnel: a 2-thick platform with a 1-block gap beneath —
  //    slide through at ground (shortcut) or take the top (jump on, walk over).
  colFill(300, 312, base - 3, base - 2, STONE);             // roof: bottom at base-2 → base-1 slide gap
  plat3(296, 299, base - 4);                                // step up onto the roof top (over-route)
  // 9) Final ascending staircase (1-block steps → auto-climb) up to the goal.
  let s = base;
  for (let i = 0; i < 6; i++) { s -= 1; plat3(360 + i * 4, 363 + i * 4, s); }
  plat3(384, W - 1, s);                                     // finish plateau
  const goalC = W - 8;
  for (let rr = 0; rr <= s - 1; rr++) set(gr, goalC, rr, B.GOAL);  // full-height finish banner

  const startC = 4, startR = base - 1;
  const payload = world({
    name: '[Sample] First Steps Redux', mode: 'PLT', gr, playerPx: startC * BS, playerPy: (startR - 2) * BS,
    description: 'Original beginner platformer built for the new moves — double-jump up the tall platforms, edge-grab the high ledge, slide the tunnel. No enemies. (Set Mode: Platformer.)',
    adv: { backgroundTheme: 'sky', airJumpEnabled: true, ledgeHangEnabled: true, slideEnabled: true, autoStepUp: true },
  });
  // Double jump ≈6 up / a bit more across; validate the critical path with that envelope.
  emit(payload, [
    { c: startC, r: startR, label: 'start' },
    { c: 157, r: base - 7, label: 'double-jump-plateau' },
    { c: 196, r: base - 12, label: 'climb-top' },
    { c: 212, r: base - 17, label: 'high-ledge' },
    { c: goalC, r: s - 1, label: 'GOAL' },
  ], [startC, startR], gr, { maxUp: 6, maxDx: 8 });
}

// ── Run all ──────────────────────────────────────────────────
buildSR1(); buildSR2(); buildSR3();
buildFFA(); buildTeam(); buildCTF(); buildKOTH(); buildDefend(); buildCreative();
buildHomage();

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
