// ============================================================
// blocks.js — Block type IDs, data, and pixel-art rendering
// ============================================================

const BLOCK = Object.freeze({
  AIR:               0,
  GRASS:             1,
  DIRT:              2,
  STONE:             3,
  OAK_LOG:           4,
  OAK_LEAVES:        5,
  BEDROCK:           6,
  OAK_PLANKS:        7,
  COAL_ORE:          8,
  IRON_ORE:          9,
  GOAL:              10,
  GRAVEL:            11,
  DIAMOND_ORE:       12,
  GOLD_ORE:          13,
  NETHERITE_ORE:     14,
  OBSIDIAN:          15,
  DEEPSLATE:         16,
  SOUL_SAND:         17,
  CRIMSON_LOG:       18,
  WARPED_LOG:        19,
  NETHER_PORTAL:     20,
  NETHERRACK:        21,
  LAVA:              22,
  TRAPDOOR:          23,
  PISTON_BODY:       24,
  PISTON_HEAD:       25,
  NETHER_PORTAL_FRAME:26,
  LEVER:             27,
  PRESSURE_PLATE:    28,
  TNT:               29,
  STRING:            30,
  APPLE:             31,
  BED:               32,
  TRANSMITTER:       34,
  RECEIVER:          35,
  CHEST:             36,
  END_CRYSTAL:            38,
  END_PORTAL:             39,
  END_PORTAL_FRAME:       40,   // End Portal frame block (empty — needs Eye of Ender)
  END_PORTAL_FRAME_FULL:  41,   // End Portal frame block with Eye of Ender inserted
  EYE_OF_ENDER:           42,   // Eye of Ender item (placed into frame blocks)
  // Phase 11C-1 items
  BLAZE_ROD:              44,   // Dropped by Blazes; crafting material for Eye of Ender
  ENDER_PEARL:            45,   // Dropped by Endermen; crafting material for Eye of Ender
  DRAGON_EGG:             46,   // Dropped by Ender Dragon on defeat
  // Phase 11G
  ARROW:                  47,   // Craftable consumable; required to fire bow
  // Phase 13
  GLOWSTONE:              48,   // Nether block; crafting ingredient for Respawn Anchor
  RESPAWN_ANCHOR:         49,   // Crafted from Obsidian + Glowstone; sets Nether respawn
  // Phase 13.5 — Sound & Music
  MUSIC_PLAYER:           50,   // Interactive jukebox block; sandbox-placeable
  MUSIC_DISC:             51,   // Music disc item (never placed in grid; uses discKey property)
  // Phase 14 — Wither Boss
  WITHER_SKELETON_HEAD:   52,   // item: placed in altar skull slots; dropped by Wither Skeletons
  WITHER_SKULL_SLOT:      53,   // altar slot block: accepts Wither Skeleton Head
  SOUL_SAND_SLOT:         54,   // altar slot block: accepts Soul Sand
  ALTAR_BLOCK:            55,   // decorative altar base (solid, auto-placed)
  // Phase 17 — Speed Runner Mode
  SPEED_BOOSTER:          56,   // non-solid trigger zone (+50% speed on touch)
  JUMP_PAD:               57,   // solid slime launch pad (big upward boost)
  SPEED_ITEM:             58,   // collectible lightning bolt (+15% speed for 3 s)
  // Smart Mobs §10 — decorative foliage (non-solid). The render LAYER is encoded in
  // the id: *_BACK draws behind the player/mob sprite, *_FRONT draws in front of it
  // (concealment). Bushes occlude mob line-of-sight (§4a); leaves are purely cosmetic.
  // Per-cell COLOUR (green/yellow/orange) lives in game._foliageColorMap, cycled by
  // re-clicking a placed cell (mirrors the Goal-Star colour cycle).
  BUSH_BACK:              59,
  BUSH_FRONT:             60,
  DECO_LEAVES_BACK:       61,
  DECO_LEAVES_FRONT:      62,
  // Opaque ("solid"-look) decorative leaves — the classic full-cell leaves art, now
  // available front/back + coloured (repurposed from the original Oak Leaves look).
  // Non-collision + non-occluding, like the original; the FRONT variant renders over
  // the player so it can partly hide them.
  LEAF_SOLID_BACK:        63,
  LEAF_SOLID_FRONT:       64,
  // §Classic Blocks pack (2026-07-24) — Mario/old-school flexibility blocks.
  LADDER:                 65,   // non-solid; hold up/down to climb
  TRAMPOLINE:             66,   // solid; force-driven bounce (higher fall → higher launch)
  SPIKES:                 67,   // non-solid hazard; contact damages (like lava)
  COIN:                   68,   // non-solid collectible (scores like an emerald)
  ICE:                    69,   // solid; slippery (low ground friction)
  QUESTION_BLOCK:         70,   // solid; bump from below → pops an item, becomes USED
  QUESTION_USED:          71,   // solid; spent question block
  HIDDEN_BLOCK:           72,   // invisible + non-solid until bumped from below → solid + visible
  ONEWAY_PLATFORM:        73,   // jump up THROUGH it, land on top; down+jump drops through
  WARP_PIPE:              74,   // solid pipe; press Down on top → descend + teleport to a partner pipe
  CONVEYOR_LEFT:          75,   // solid; pushes whoever stands on it left
  CONVEYOR_RIGHT:         76,   // solid; pushes right
  CRUMBLE_BLOCK:          77,   // solid; crumbles away shortly after something stands on it
  BREAKABLE_BLOCK:        78,   // solid brick; shatters when hit from below (may hold an item)
  PIPE_STEM:              79,   // (retired — the seamless 1×1 Warp Pipe replaces it; kept for old saves)
  SLIME_BLOCK:            80,   // solid bouncy block (same physics as the Trampoline, slime look)
  BAR:                    81,   // non-solid monkey-bar; hang from the BAR at the block's BOTTOM, swing L/R, jump off
  BAR_PLATFORM:           82,   // Bar + a Jump-Through platform on top: stand on top, drop through onto the bar
  TUBE_WALL:              83,   // §Travel Tube — a placed transparent tube you fly through; footprint cells (solid glass)
  TARGET_BLOCK:           84,   // §Phase R — redstone SOURCE: arrow/attack hit → pulse OR toggle; powers its links + adjacent dust
  PULSE_CONVERTER:        85,   // §Phase R — converts an incoming redstone PULSE into a persistent toggle (on/off/on…)
  REDSTONE_LAMP:          86,   // §Phase R — lights up when it gets a redstone signal; click (lamp selected) to recolour
});

// §Phase R — Redstone Lamp colours (click a placed lamp with the Lamp selected to cycle). One hue
// each; the renderer dims it when unpowered so the colour still reads clearly while off.
const LAMP_COLORS = [
  { name: 'Red', c: '#ff5a4a' }, { name: 'Orange', c: '#ffa23a' }, { name: 'Yellow', c: '#ffe94a' },
  { name: 'Green', c: '#5cf06a' }, { name: 'Cyan', c: '#4ff0e0' }, { name: 'Blue', c: '#5a9cff' },
  { name: 'Purple', c: '#b06cff' }, { name: 'Pink', c: '#ff6cc4' }, { name: 'White', c: '#f2f2f2' },
];

// Colour palette for decorative foliage (§10). Index 0 = green (default).
const FOLIAGE_COLORS = [
  { name: 'Green',  base: '#3f8a34', light: '#5bb048', dark: '#2c5f22' },
  { name: 'Yellow', base: '#c8a52a', light: '#e2c44c', dark: '#9a7d18' },
  { name: 'Orange', base: '#c56a20', light: '#e18b3a', dark: '#964c12' },
];
// Smart Mobs §4b — a block's SOUND rating: 'loud' | 'quiet' | 'normal'. Kept as a real
// 3-tier internal rating (not a 2-value hack) so more blocks can be rated later without
// rework. This build explicitly rates Gravel = loud and Grass = quiet; all else normal.
//   loud   → touching/moving on it is heard broadly, even while crouching.
//   quiet  → moving/landing on it makes ZERO sound.
//   normal → sound depends on movement state (still/crouch = silent, walk/run scale up).
function blockSoundTier(id) {
  if (id === BLOCK.GRAVEL) return 'loud';
  if (id === BLOCK.GRASS)  return 'quiet';
  return 'normal';
}

// True if a block id is one of the decorative-foliage ids.
function isFoliageBlock(id) {
  return id === BLOCK.BUSH_BACK  || id === BLOCK.BUSH_FRONT ||
         id === BLOCK.DECO_LEAVES_BACK || id === BLOCK.DECO_LEAVES_FRONT ||
         id === BLOCK.LEAF_SOLID_BACK  || id === BLOCK.LEAF_SOLID_FRONT;
}
// True if the block id occludes a mob's line of sight (§4a). Solid blocks always do;
// among foliage, only bushes conceal — leaves are see-through cosmetic cover.
function foliageOccludesSight(id) {
  return id === BLOCK.BUSH_BACK || id === BLOCK.BUSH_FRONT;
}

// Per-block properties
// mineTier: 0=wooden, 1=stone, 2=iron, 3=diamond, 4=netherite
const BLOCK_DATA = {
  [BLOCK.AIR]:           { name: 'Air',           hardness: 0,        mineable: false, solid: false, mineTier: 0 },
  [BLOCK.GRASS]:         { name: 'Grass',          hardness: 60,       mineable: true,  solid: true,  mineTier: 0 },
  [BLOCK.DIRT]:          { name: 'Dirt',           hardness: 45,       mineable: true,  solid: true,  mineTier: 0 },
  [BLOCK.STONE]:         { name: 'Stone',          hardness: 120,      mineable: true,  solid: true,  mineTier: 0 },
  [BLOCK.OAK_LOG]:       { name: 'Oak Log',        hardness: 80,       mineable: true,  solid: true,  mineTier: 0 },
  [BLOCK.OAK_LEAVES]:    { name: 'Oak Leaves',     hardness: 20,       mineable: true,  solid: false, mineTier: 0 },
  [BLOCK.BEDROCK]:       { name: 'Bedrock',        hardness: Infinity, mineable: false, solid: true,  mineTier: 0 },
  [BLOCK.OAK_PLANKS]:    { name: 'Oak Planks',     hardness: 60,       mineable: true,  solid: true,  mineTier: 0 },
  [BLOCK.COAL_ORE]:      { name: 'Coal Ore',       hardness: 130,      mineable: true,  solid: true,  mineTier: 0 },
  [BLOCK.IRON_ORE]:      { name: 'Iron Ore',       hardness: 150,      mineable: true,  solid: true,  mineTier: 1 },
  [BLOCK.GOAL]:          { name: 'Goal Star',      hardness: 120,      mineable: true,  solid: false, mineTier: 0, isGoal: true },
  [BLOCK.GRAVEL]:        { name: 'Gravel',         hardness: 40,       mineable: true,  solid: true,  mineTier: 0 },
  [BLOCK.DIAMOND_ORE]:   { name: 'Diamond Ore',    hardness: 200,      mineable: true,  solid: true,  mineTier: 2 },
  [BLOCK.GOLD_ORE]:      { name: 'Gold Ore',       hardness: 160,      mineable: true,  solid: true,  mineTier: 2 },
  [BLOCK.NETHERITE_ORE]:      { name: 'Netherite Ore',    hardness: 300,      mineable: true,  solid: true,  mineTier: 3 },
  [BLOCK.OBSIDIAN]:           { name: 'Obsidian',          hardness: 600,      mineable: true,  solid: true,  mineTier: 3 },
  [BLOCK.DEEPSLATE]:          { name: 'Deepslate',         hardness: 200,      mineable: true,  solid: true,  mineTier: 1 },
  [BLOCK.SOUL_SAND]:          { name: 'Soul Sand',         hardness: 50,       mineable: true,  solid: true,  mineTier: 0, slowsPlayer: true },
  [BLOCK.CRIMSON_LOG]:        { name: 'Crimson Log',       hardness: 80,       mineable: true,  solid: true,  mineTier: 0 },
  [BLOCK.WARPED_LOG]:         { name: 'Warped Log',        hardness: 80,       mineable: true,  solid: true,  mineTier: 0 },
  [BLOCK.NETHER_PORTAL]:      { name: 'Nether Portal',     hardness: Infinity, mineable: false, solid: false, mineTier: 0, isPortal: true },
  [BLOCK.NETHERRACK]:         { name: 'Netherrack',        hardness: 30,       mineable: true,  solid: true,  mineTier: 0 },
  [BLOCK.LAVA]:               { name: 'Lava',              hardness: Infinity, mineable: false, solid: false, mineTier: 0, isDamage: true },
  [BLOCK.TRAPDOOR]:           { name: 'Trapdoor',          hardness: 60,       mineable: false, solid: false, mineTier: 0, isTrapdoor: true },
  [BLOCK.PISTON_BODY]:        { name: 'Piston',            hardness: Infinity, mineable: false, solid: true,  mineTier: 0 },
  [BLOCK.PISTON_HEAD]:        { name: 'Piston Head',       hardness: Infinity, mineable: false, solid: true,  mineTier: 0 },
  [BLOCK.NETHER_PORTAL_FRAME]:{ name: 'Portal Frame',      hardness: Infinity, mineable: false, solid: true,  mineTier: 0 },
  [BLOCK.LEVER]:              { name: 'Lever',             hardness: Infinity, mineable: false, solid: false, mineTier: 0 },
  [BLOCK.PRESSURE_PLATE]:     { name: 'Pressure Plate',    hardness: Infinity, mineable: false, solid: false, mineTier: 0 },
  [BLOCK.TNT]:                { name: 'TNT',               hardness: 10,       mineable: false, solid: true,  mineTier: 0 },
  [BLOCK.STRING]:             { name: 'String',            hardness: 0,        mineable: false, solid: false, mineTier: 0, isItem: true },
  [BLOCK.APPLE]:              { name: 'Apple',             hardness: 0,        mineable: false, solid: false, mineTier: 0, isItem: true, isFood: true, healAmount: 4 },
  [BLOCK.BED]:                { name: 'Bed',               hardness: 0,        mineable: false, solid: false, mineTier: 0, isBed: true },
  // Pseudo-block used for palette/hotbar display only — never stored in level grid
  33:                         { name: 'Redstone Dust',     hardness: Infinity, mineable: false, solid: false, mineTier: 0, isDust: true },
  [BLOCK.TRANSMITTER]:        { name: 'Transmitter',       hardness: Infinity, mineable: false, solid: true,  mineTier: 0 },
  [BLOCK.RECEIVER]:           { name: 'Receiver',          hardness: Infinity, mineable: false, solid: true,  mineTier: 0 },
  [BLOCK.CHEST]:              { name: 'Chest',             hardness: 80,       mineable: true,  solid: true,  mineTier: 0 },
  // Virtual type 37 — palette/hotbar icon for Ruined Portal tool; never placed in level grid
  37:                         { name: 'Ruined Portal',     hardness: Infinity, mineable: false, solid: false, mineTier: 0 },
  [BLOCK.END_CRYSTAL]:            { name: 'End Crystal',             hardness: Infinity, mineable: false, solid: false, mineTier: 0 },
  [BLOCK.END_PORTAL]:             { name: 'End Portal',              hardness: Infinity, mineable: false, solid: false, mineTier: 0, isEndPortal: true },
  [BLOCK.END_PORTAL_FRAME]:       { name: 'Portal Frame',            hardness: Infinity, mineable: false, solid: true,  mineTier: 0 },
  [BLOCK.END_PORTAL_FRAME_FULL]:  { name: 'Portal Frame (Eye)',      hardness: Infinity, mineable: false, solid: true,  mineTier: 0 },
  [BLOCK.EYE_OF_ENDER]:           { name: 'Eye of Ender',            hardness: 0,        mineable: false, solid: false, mineTier: 0, isItem: true, isEye: true },
  // Virtual type 43 — palette/hotbar icon for End Portal tool; never placed in level grid
  43:                             { name: 'End Portal',              hardness: Infinity, mineable: false, solid: false, mineTier: 0 },
  // Virtual type 200 — palette/hotbar icon for Wither Altar; never placed in level grid (moved off
  // 56, which is the real SPEED_BOOSTER block — the collision was swapping their icon + name).
  200:                            { name: 'Wither Altar',            hardness: Infinity, mineable: false, solid: false, mineTier: 0 },
  [BLOCK.BLAZE_ROD]:              { name: 'Blaze Rod',               hardness: 0,        mineable: false, solid: false, mineTier: 0, isItem: true },
  [BLOCK.ENDER_PEARL]:            { name: 'Ender Pearl',             hardness: 0,        mineable: false, solid: false, mineTier: 0, isItem: true },
  [BLOCK.DRAGON_EGG]:             { name: 'Dragon Egg',              hardness: 0,        mineable: false, solid: false, mineTier: 0, isItem: true },
  [BLOCK.ARROW]:                  { name: 'Arrow',                   hardness: 0,        mineable: false, solid: false, mineTier: 0, isItem: true },
  [BLOCK.GLOWSTONE]:              { name: 'Glowstone',               hardness: 60,       mineable: true,  solid: true,  mineTier: 0, emitsLight: true },
  [BLOCK.RESPAWN_ANCHOR]:         { name: 'Respawn Anchor',          hardness: 120,      mineable: true,  solid: true,  mineTier: 2 },
  [BLOCK.MUSIC_PLAYER]:           { name: 'Music Player',            hardness: 80,       mineable: true,  solid: true,  mineTier: 0 },
  [BLOCK.MUSIC_DISC]:             { name: 'Music Disc',              hardness: 0,        mineable: false, solid: false, mineTier: 0, isItem: true },
  // Phase 14
  [BLOCK.WITHER_SKELETON_HEAD]:   { name: 'Wither Skull',   hardness: 0,        mineable: false, solid: false, mineTier: 0, isItem: true },
  [BLOCK.WITHER_SKULL_SLOT]:      { name: 'Skull Slot',     hardness: Infinity, mineable: false, solid: false, mineTier: 0 },
  [BLOCK.SOUL_SAND_SLOT]:         { name: 'Soul Sand Slot', hardness: Infinity, mineable: false, solid: false, mineTier: 0 },
  [BLOCK.ALTAR_BLOCK]:            { name: 'Altar Block',    hardness: Infinity, mineable: false, solid: true,  mineTier: 0 },
  // Phase 17 — Speed Runner
  [BLOCK.SPEED_BOOSTER]: { name: 'Speed Booster', hardness: Infinity, mineable: false, solid: false, mineTier: 0 },
  [BLOCK.JUMP_PAD]:      { name: 'Jump Pad',       hardness: Infinity, mineable: false, solid: true,  mineTier: 0 },
  [BLOCK.SPEED_ITEM]:    { name: 'Speed Item',     hardness: Infinity, mineable: false, solid: false, mineTier: 0 },
  // Smart Mobs §10 — decorative foliage (non-solid). `occludes` = blocks mob sight.
  [BLOCK.BUSH_BACK]:         { name: 'Bush (Behind)',   hardness: 15, mineable: true, solid: false, mineTier: 0, isFoliage: true, foliageShape: 'bush',   foliageFront: false, occludes: true },
  [BLOCK.BUSH_FRONT]:        { name: 'Bush (Front)',    hardness: 15, mineable: true, solid: false, mineTier: 0, isFoliage: true, foliageShape: 'bush',   foliageFront: true,  occludes: true },
  [BLOCK.DECO_LEAVES_BACK]:  { name: 'Leaves (Behind)', hardness: 15, mineable: true, solid: false, mineTier: 0, isFoliage: true, foliageShape: 'leaves', foliageFront: false },
  [BLOCK.DECO_LEAVES_FRONT]: { name: 'Leaves (Front)',  hardness: 15, mineable: true, solid: false, mineTier: 0, isFoliage: true, foliageShape: 'leaves', foliageFront: true  },
  [BLOCK.LEAF_SOLID_BACK]:   { name: 'Solid Leaves (Behind)', hardness: 15, mineable: true, solid: false, mineTier: 0, isFoliage: true, foliageShape: 'leaves_solid', foliageFront: false },
  [BLOCK.LEAF_SOLID_FRONT]:  { name: 'Solid Leaves (Front)',  hardness: 15, mineable: true, solid: false, mineTier: 0, isFoliage: true, foliageShape: 'leaves_solid', foliageFront: true  },
  // §Classic Blocks pack. Designer-placeable; most are non-mineable in play (mechanics, not
  // resources) so they read as fixed level furniture, and are removed with the eraser in Sandbox.
  [BLOCK.LADDER]:            { name: 'Ladder',          hardness: Infinity, mineable: false, solid: false, mineTier: 0, classic: true },
  [BLOCK.TRAMPOLINE]:        { name: 'Trampoline',      hardness: Infinity, mineable: false, solid: true,  mineTier: 0, classic: true },
  [BLOCK.SPIKES]:            { name: 'Spikes',          hardness: Infinity, mineable: false, solid: false, mineTier: 0, classic: true, hazard: true },
  [BLOCK.COIN]:              { name: 'Coin',            hardness: Infinity, mineable: false, solid: false, mineTier: 0, classic: true },
  [BLOCK.ICE]:               { name: 'Ice',             hardness: Infinity, mineable: false, solid: true,  mineTier: 0, classic: true },
  [BLOCK.QUESTION_BLOCK]:    { name: 'Question Block',  hardness: Infinity, mineable: false, solid: true,  mineTier: 0, classic: true },
  [BLOCK.QUESTION_USED]:     { name: 'Used Block',      hardness: Infinity, mineable: false, solid: true,  mineTier: 0, classic: true },
  [BLOCK.HIDDEN_BLOCK]:      { name: 'Hidden Block',    hardness: Infinity, mineable: false, solid: false, mineTier: 0, classic: true },
  [BLOCK.ONEWAY_PLATFORM]:   { name: 'Jump-Through',    hardness: Infinity, mineable: false, solid: false, mineTier: 0, classic: true },
  [BLOCK.WARP_PIPE]:         { name: 'Warp Pipe',       hardness: Infinity, mineable: false, solid: true,  mineTier: 0, classic: true },
  [BLOCK.CONVEYOR_LEFT]:     { name: 'Conveyor ◀',      hardness: Infinity, mineable: false, solid: true,  mineTier: 0, classic: true },
  [BLOCK.CONVEYOR_RIGHT]:    { name: 'Conveyor ▶',      hardness: Infinity, mineable: false, solid: true,  mineTier: 0, classic: true },
  [BLOCK.CRUMBLE_BLOCK]:     { name: 'Crumbling Block', hardness: Infinity, mineable: false, solid: true,  mineTier: 0, classic: true },
  [BLOCK.BREAKABLE_BLOCK]:   { name: 'Breakable Block', hardness: Infinity, mineable: false, solid: true,  mineTier: 0, classic: true },
  [BLOCK.PIPE_STEM]:         { name: 'Pipe Stem',       hardness: Infinity, mineable: false, solid: true,  mineTier: 0, classic: true },
  [BLOCK.SLIME_BLOCK]:       { name: 'Slime Block',     hardness: Infinity, mineable: false, solid: true,  mineTier: 0, classic: true },
  [BLOCK.BAR]:               { name: 'Bar',             hardness: Infinity, mineable: false, solid: false, mineTier: 0, classic: true },
  [BLOCK.BAR_PLATFORM]:      { name: 'Bar + Platform',  hardness: Infinity, mineable: false, solid: false, mineTier: 0, classic: true },
  [BLOCK.TUBE_WALL]:         { name: 'Travel Tube',     hardness: Infinity, mineable: false, solid: true,  mineTier: 0, classic: true },
  [BLOCK.TARGET_BLOCK]:      { name: 'Target Block',    hardness: Infinity, mineable: false, solid: true,  mineTier: 0 },
  [BLOCK.PULSE_CONVERTER]:   { name: 'Pulse Converter', hardness: Infinity, mineable: false, solid: true,  mineTier: 0 },
  [BLOCK.REDSTONE_LAMP]:     { name: 'Redstone Lamp',   hardness: Infinity, mineable: false, solid: true,  mineTier: 0 },
};

// ── Pixel-art block renderers ────────────────────────────────

function drawBlock(ctx, type, px, py, breakProgress, state = {}) {
  if (type === BLOCK.AIR) return;
  px = Math.floor(px);
  py = Math.floor(py);
  const s = BLOCK_SIZE;

  switch (type) {
    case BLOCK.GRASS:             _drawGrass(ctx, px, py, s);                         break;
    case BLOCK.DIRT:              _drawDirt(ctx, px, py, s);                           break;
    case BLOCK.STONE:             _drawStone(ctx, px, py, s);                          break;
    case BLOCK.OAK_LOG:           _drawLog(ctx, px, py, s);                            break;
    case BLOCK.OAK_LEAVES:        _drawLeaves(ctx, px, py, s);                         break;
    case BLOCK.BUSH_BACK:
    case BLOCK.BUSH_FRONT:        _drawFoliage(ctx, px, py, s, 'bush',   state.foliageColor ?? 0); break;
    case BLOCK.DECO_LEAVES_BACK:
    case BLOCK.DECO_LEAVES_FRONT: _drawFoliage(ctx, px, py, s, 'leaves', state.foliageColor ?? 0); break;
    case BLOCK.LEAF_SOLID_BACK:
    case BLOCK.LEAF_SOLID_FRONT:  _drawFoliage(ctx, px, py, s, 'leaves_solid', state.foliageColor ?? 0); break;
    case BLOCK.BEDROCK:           _drawBedrock(ctx, px, py, s);                        break;
    case BLOCK.OAK_PLANKS:        _drawPlanks(ctx, px, py, s);                         break;
    case BLOCK.COAL_ORE:          _drawOre(ctx, px, py, s, '#111');                    break;
    case BLOCK.IRON_ORE:          _drawOre(ctx, px, py, s, '#C8997E');                 break;
    case BLOCK.GOAL:              _drawGoal(ctx, px, py, s);                            break;
    case BLOCK.GRAVEL:            _drawGravel(ctx, px, py, s);                         break;
    case BLOCK.DIAMOND_ORE:       _drawOre(ctx, px, py, s, '#44DDFF');                 break;
    case BLOCK.GOLD_ORE:          _drawOre(ctx, px, py, s, '#FFD700');                 break;
    case BLOCK.NETHERITE_ORE:     _drawNetheriteOre(ctx, px, py, s);                   break;
    case BLOCK.OBSIDIAN:          _drawObsidian(ctx, px, py, s);                       break;
    case BLOCK.DEEPSLATE:         _drawDeepslate(ctx, px, py, s);                      break;
    case BLOCK.SOUL_SAND:         _drawSoulSand(ctx, px, py, s);                       break;
    case BLOCK.CRIMSON_LOG:       _drawCrimsonLog(ctx, px, py, s);                     break;
    case BLOCK.WARPED_LOG:        _drawWarpedLog(ctx, px, py, s);                      break;
    case BLOCK.NETHER_PORTAL:     _drawNetherPortal(ctx, px, py, s);                   break;
    case BLOCK.NETHERRACK:        _drawNetherrack(ctx, px, py, s);                     break;
    case BLOCK.LAVA:              _drawLava(ctx, px, py, s);                            break;
    case BLOCK.TRAPDOOR:          _drawTrapdoor(ctx, px, py, s, state.open);           break;
    case BLOCK.PISTON_BODY:       _drawPistonBody(ctx, px, py, s, state);              break;
    case BLOCK.PISTON_HEAD:       _drawPistonHead(ctx, px, py, s, state);              break;
    case BLOCK.NETHER_PORTAL_FRAME: _drawPortalFrame(ctx, px, py, s);                  break;
    case BLOCK.LEVER:             _drawLeverBlock(ctx, px, py, s, state.on);           break;
    case BLOCK.PRESSURE_PLATE:    _drawPressurePlate(ctx, px, py, s, state.pressed);   break;
    case BLOCK.TNT:               _drawTnt(ctx, px, py, s);                            break;
    case 33 /* REDSTONE_DUST */:  _drawRedstoneDustIcon(ctx, px, py, s);               break;
    case BLOCK.TRANSMITTER:       _drawTransmitter(ctx, px, py, s, state.number, state.powered); break;
    case BLOCK.RECEIVER:          _drawReceiver(ctx, px, py, s, state.listenNums, state.powered); break;
    case BLOCK.STRING:            _drawStringItem(ctx, px, py, s);                     break;
    case BLOCK.APPLE:             _drawAppleItem(ctx, px, py, s);                      break;
    case BLOCK.BED:               _drawBed(ctx, px, py, s, state.active, state.bedHalf); break;
    case BLOCK.CHEST:             _drawChest(ctx, px, py, s, state.open);               break;
    case 37 /* RUINED_PORTAL_ICON */: _drawRuinedPortalIcon(ctx, px, py, s);            break;
    case BLOCK.END_CRYSTAL:            _drawEndCrystal(ctx, px, py, s);               break;
    case BLOCK.END_PORTAL:             _drawEndPortal(ctx, px, py, s);                break;
    case BLOCK.END_PORTAL_FRAME:       _drawEndPortalFrame(ctx, px, py, s, false);    break;
    case BLOCK.END_PORTAL_FRAME_FULL:  _drawEndPortalFrame(ctx, px, py, s, true);     break;
    case BLOCK.EYE_OF_ENDER:           _drawEyeOfEnderItem(ctx, px, py, s);           break;
    case 43 /* END_PORTAL_ICON */:     _drawEndPortalIcon(ctx, px, py, s);            break;
    case 200 /* WITHER_ALTAR_ICON (virtual; moved off 56 to stop colliding with SPEED_BOOSTER) */: _drawWitherAltarIcon(ctx, px, py, s); break;
    case BLOCK.BLAZE_ROD:              _drawBlazeRodItem(ctx, px, py, s);             break;
    case BLOCK.ENDER_PEARL:            _drawEnderPearlItem(ctx, px, py, s);           break;
    case BLOCK.DRAGON_EGG:             _drawDragonEggItem(ctx, px, py, s);            break;
    case BLOCK.ARROW:                  _drawArrowItem(ctx, px, py, s);                break;
    case BLOCK.GLOWSTONE:              _drawGlowstone(ctx, px, py, s);               break;
    case BLOCK.RESPAWN_ANCHOR:         _drawRespawnAnchor(ctx, px, py, s, state.active); break;
    case BLOCK.MUSIC_PLAYER:           _drawMusicPlayer(ctx, px, py, s, state.playing); break;
    case BLOCK.MUSIC_DISC:             _drawMusicDiscItem(ctx, px, py, s, state.discName); break;
    case BLOCK.WITHER_SKELETON_HEAD:   _drawWitherSkullItem(ctx, px, py, s);            break;
    case BLOCK.WITHER_SKULL_SLOT:      _drawWitherSkullSlot(ctx, px, py, s);            break;
    case BLOCK.SOUL_SAND_SLOT:         _drawSoulSandSlotBlock(ctx, px, py, s);          break;
    case BLOCK.ALTAR_BLOCK:            _drawAltarBlock(ctx, px, py, s);                 break;
    // Phase 17 — Speed Runner blocks
    case BLOCK.SPEED_BOOSTER:          _drawSpeedBoosterBlock(ctx, px, py, s);          break;
    case BLOCK.JUMP_PAD:               _drawJumpPadBlock(ctx, px, py, s);               break;
    case BLOCK.SPEED_ITEM:             _drawSpeedItemBlock(ctx, px, py, s);             break;
    // §Classic Blocks pack
    case BLOCK.LADDER:                 _drawLadder(ctx, px, py, s);                     break;
    case BLOCK.TRAMPOLINE:             _drawTrampoline(ctx, px, py, s, state.compress || 0); break;
    case BLOCK.SLIME_BLOCK:            _drawSlime(ctx, px, py, s, state.compress || 0);      break;
    case BLOCK.SPIKES:                 _drawSpikes(ctx, px, py, s);                     break;
    case BLOCK.COIN:                   _drawCoinBlock(ctx, px, py, s, state.frame || 0);break;
    case BLOCK.ICE:                    _drawIce(ctx, px, py, s);                        break;
    case BLOCK.QUESTION_BLOCK:         _drawQuestionBlock(ctx, px, py, s, false, state.frame || 0); break;
    case BLOCK.QUESTION_USED:          _drawQuestionBlock(ctx, px, py, s, true, 0);     break;
    case BLOCK.HIDDEN_BLOCK:           _drawHiddenBlock(ctx, px, py, s, !!state.editor);break;
    case BLOCK.ONEWAY_PLATFORM:        _drawOneWay(ctx, px, py, s);                     break;
    case BLOCK.WARP_PIPE:              _drawWarpPipe(ctx, px, py, s, state);            break;
    case BLOCK.CONVEYOR_LEFT:          _drawConveyor(ctx, px, py, s, -1, state.frame || 0); break;
    case BLOCK.CONVEYOR_RIGHT:         _drawConveyor(ctx, px, py, s,  1, state.frame || 0); break;
    case BLOCK.CRUMBLE_BLOCK:          _drawCrumble(ctx, px, py, s, state.crumbling);   break;
    case BLOCK.BREAKABLE_BLOCK:        _drawBreakable(ctx, px, py, s, !!state.hasItem); break;
    case BLOCK.PIPE_STEM:              _drawWarpPipe(ctx, px, py, s, state, true);      break;
    case BLOCK.BAR:                    _drawBar(ctx, px, py, s, false);                 break;
    case BLOCK.BAR_PLATFORM:           _drawBar(ctx, px, py, s, true);                  break;
    case BLOCK.TUBE_WALL:              _drawTubeWall(ctx, px, py, s, state);            break;
    case BLOCK.TARGET_BLOCK:           _drawTargetBlock(ctx, px, py, s, state.on);      break;
    case BLOCK.PULSE_CONVERTER:        _drawPulseConverter(ctx, px, py, s, state.on, state.dir); break;
    case BLOCK.REDSTONE_LAMP:          _drawRedstoneLamp(ctx, px, py, s, state.on, state.colorIdx); break;
  }

  // Mining crack overlay
  if (breakProgress > 0) {
    ctx.save();
    ctx.globalAlpha = breakProgress * 0.65;
    ctx.fillStyle = '#000';
    ctx.fillRect(px, py, s, s);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    const cx = px + s / 2, cy = py + s / 2;
    const lines = Math.ceil(breakProgress * 5);
    const pts = [
      [px+4,  py+4,  cx,    cy   ],
      [px+s-4,py+4,  cx,    cy   ],
      [px+4,  py+s-4,cx,    cy   ],
      [px+s-4,py+s-4,cx,    cy   ],
      [cx,    py+2,  cx,    cy   ],
    ];
    for (let i = 0; i < lines; i++) {
      ctx.beginPath();
      ctx.moveTo(pts[i][0], pts[i][1]);
      ctx.lineTo(pts[i][2], pts[i][3]);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Edge shadow — skip for partial-fill blocks and TX/RX (draw their own border), and for the
  // see-through §Classic Blocks (the 0.28-black box outlined them against the backdrop — and
  // made Hidden blocks visible in play).
  if (type !== BLOCK.LEVER && type !== BLOCK.TRAPDOOR &&
      type !== BLOCK.PRESSURE_PLATE && type !== 33 /* REDSTONE_DUST */ &&
      type !== BLOCK.TRANSMITTER && type !== BLOCK.RECEIVER &&
      type !== BLOCK.RESPAWN_ANCHOR &&
      type !== BLOCK.LADDER && type !== BLOCK.HIDDEN_BLOCK && type !== BLOCK.COIN && type !== BLOCK.SPIKES &&
      type !== BLOCK.TRAMPOLINE && type !== BLOCK.SLIME_BLOCK &&
      type !== BLOCK.BAR && type !== BLOCK.BAR_PLATFORM && type !== BLOCK.TUBE_WALL) {   // springs/glass/mostly-empty leave gaps → the box shows through
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
  }
}

function _drawGrass(ctx, px, py, s) {
  // Dirt base
  ctx.fillStyle = '#8B6340';
  ctx.fillRect(px, py, s, s);
  _dirtDetail(ctx, px, py, s);
  // Green top strip
  ctx.fillStyle = '#5A9E2F';
  ctx.fillRect(px, py, s, 9);
  ctx.fillStyle = '#4A8C22';
  ctx.fillRect(px+3,  py+1, 5, 4);
  ctx.fillRect(px+14, py+2, 6, 3);
  ctx.fillRect(px+23, py+1, 5, 4);
  // Bleed onto sides
  ctx.fillStyle = '#5A9E2F';
  ctx.fillRect(px,    py+9, s, 3);
  ctx.fillStyle = '#3A7E0F';
  ctx.fillRect(px+2,  py+9, 3, 2);
  ctx.fillRect(px+18, py+9, 3, 2);
}

function _drawDirt(ctx, px, py, s) {
  ctx.fillStyle = '#8B6340';
  ctx.fillRect(px, py, s, s);
  _dirtDetail(ctx, px, py, s);
}

function _dirtDetail(ctx, px, py, s) {
  ctx.fillStyle = '#7A5530';
  ctx.fillRect(px+5,  py+10, 4, 4);
  ctx.fillRect(px+18, py+16, 3, 3);
  ctx.fillRect(px+10, py+22, 4, 4);
  ctx.fillRect(px+23, py+22, 3, 3);
  ctx.fillRect(px+2,  py+25, 3, 3);
  ctx.fillStyle = '#9D7050';
  ctx.fillRect(px+14, py+8,  3, 3);
  ctx.fillRect(px+26, py+18, 3, 3);
}

function _drawStone(ctx, px, py, s) {
  ctx.fillStyle = '#787878';
  ctx.fillRect(px, py, s, s);
  ctx.fillStyle = '#888';
  ctx.fillRect(px+2,  py+2,  14, 14);
  ctx.fillRect(px+18, py+16, 12, 12);
  ctx.fillStyle = '#666';
  ctx.fillRect(px+16, py+2,  14, 12);
  ctx.fillRect(px+2,  py+16, 12, 12);
}

function _drawLog(ctx, px, py, s) {
  ctx.fillStyle = '#7D5A28';
  ctx.fillRect(px, py, s, s);
  ctx.fillStyle = '#6B4A1C';
  ctx.fillRect(px+4,  py, 3, s);
  ctx.fillRect(px+12, py, 2, s);
  ctx.fillRect(px+20, py, 3, s);
  ctx.fillRect(px+26, py, 2, s);
  ctx.fillStyle = '#9C7A3A';
  ctx.fillRect(px+1, py+8,  2, 14);
  ctx.fillRect(px+8, py+4,  2, 20);
  ctx.fillRect(px+16,py+8,  2, 14);
}

function _drawLeaves(ctx, px, py, s) {
  ctx.fillStyle = '#3A7A2C';
  ctx.fillRect(px, py, s, s);
  ctx.fillStyle = '#4A9A3C';
  ctx.fillRect(px+2,  py+2,  9, 9);
  ctx.fillRect(px+18, py+4,  7, 7);
  ctx.fillRect(px+8,  py+18, 9, 9);
  ctx.fillRect(px+22, py+20, 7, 7);
  ctx.fillStyle = '#2A5A1A';
  ctx.fillRect(px+12, py+10, 8, 8);
  ctx.fillRect(px+2,  py+20, 7, 7);
}

// Smart Mobs §10 — decorative foliage. Draws leafy blobs with transparent gaps
// (never a full opaque cell) so the FRONT layer only partially conceals whatever is
// behind it. `shape` = 'bush' (denser, bottom-weighted mound) or 'leaves' (airier,
// scattered). `colorIdx` selects the green/yellow/orange palette.
function _drawFoliage(ctx, px, py, s, shape, colorIdx) {
  const pal = FOLIAGE_COLORS[colorIdx] || FOLIAGE_COLORS[0];
  const blob = (bx, by, bw, bh, col) => {
    ctx.fillStyle = col;
    ctx.fillRect(px + bx, py + by, bw, bh);
  };
  if (shape === 'leaves_solid') {
    // Opaque full-cell leaves. Green (index 0) = the exact classic Oak-Leaves look so
    // the "repurposed" block matches the original; other colours tint the same pattern.
    if (colorIdx === 0) { _drawLeaves(ctx, px, py, s); return; }
    ctx.fillStyle = pal.dark;  ctx.fillRect(px, py, s, s);
    ctx.fillStyle = pal.base;
    ctx.fillRect(px + 2,  py + 2,  9, 9);
    ctx.fillRect(px + 18, py + 4,  7, 7);
    ctx.fillRect(px + 8,  py + 18, 9, 9);
    ctx.fillRect(px + 22, py + 20, 7, 7);
    ctx.fillRect(px + 2,  py + 12, 8, 8);
    ctx.fillRect(px + 13, py + 9,  8, 8);
    ctx.fillStyle = pal.light;
    ctx.fillRect(px + 4,  py + 4,  4, 4);
    ctx.fillRect(px + 20, py + 6,  3, 3);
    ctx.fillRect(px + 10, py + 20, 4, 4);
    ctx.fillStyle = pal.dark;
    ctx.fillRect(px + 12, py + 14, 6, 6);
    ctx.fillRect(px + 2,  py + 22, 7, 5);
    return;
  }
  if (shape === 'bush') {
    // Rounded mound sitting on the cell floor.
    blob(4,  10, s - 8, s - 12, pal.dark);
    blob(6,  6,  s - 12, s - 8, pal.base);
    blob(9,  3,  s - 18, 10,    pal.base);
    blob(8,  8,  7, 7, pal.light);
    blob(s - 15, 12, 7, 7, pal.light);
    blob(13, 17, 6, 6, pal.dark);
  } else {
    // Airier scattered leaf clusters (leaves the corners open).
    blob(3,  4,  10, 10, pal.base);
    blob(17, 6,  10, 10, pal.base);
    blob(9,  16, 11, 11, pal.base);
    blob(20, 18, 8,  8,  pal.dark);
    blob(4,  4,  5,  5,  pal.light);
    blob(18, 6,  5,  5,  pal.light);
    blob(11, 17, 5,  5,  pal.light);
    blob(2,  18, 6,  6,  pal.dark);
  }
}

function _drawBedrock(ctx, px, py, s) {
  ctx.fillStyle = '#2E2E2E';
  ctx.fillRect(px, py, s, s);
  ctx.fillStyle = '#444';
  ctx.fillRect(px+2,  py+2,  12, 12);
  ctx.fillRect(px+18, py+16, 12, 12);
  ctx.fillStyle = '#1A1A1A';
  ctx.fillRect(px+14, py+4,  14, 10);
  ctx.fillRect(px+2,  py+16, 14, 12);
  ctx.fillStyle = '#383838';
  ctx.fillRect(px+8,  py+14, 6,  6);
}

function _drawPlanks(ctx, px, py, s) {
  ctx.fillStyle = '#C8A558';
  ctx.fillRect(px, py, s, s);
  ctx.fillStyle = '#B89040';
  ctx.fillRect(px, py+8,  s, 2);
  ctx.fillRect(px, py+18, s, 2);
  ctx.fillRect(px, py+26, s, 2);
  ctx.fillStyle = '#D8B868';
  ctx.fillRect(px+4,  py+2,  10, 5);
  ctx.fillRect(px+18, py+10, 11, 6);
  // Knot/nail dots
  ctx.fillStyle = '#9A7035';
  const nails = [[2,6],[28,6],[2,16],[28,16],[2,24],[28,24]];
  nails.forEach(([nx,ny]) => ctx.fillRect(px+nx, py+ny, 2, 2));
}

function _drawOre(ctx, px, py, s, oreColor) {
  _drawStone(ctx, px, py, s);
  ctx.fillStyle = oreColor;
  ctx.fillRect(px+4,  py+4,  6, 6);
  ctx.fillRect(px+20, py+6,  5, 5);
  ctx.fillRect(px+6,  py+20, 6, 6);
  ctx.fillRect(px+22, py+22, 5, 5);
  ctx.fillRect(px+13, py+13, 5, 5);
}

function _drawGoal(ctx, px, py, s) {
  const t   = Date.now() / 600;
  const glo = 0.65 + Math.sin(t) * 0.35;

  // Dark obsidian frame
  ctx.fillStyle = '#1A0D2E';
  ctx.fillRect(px, py, s, s);

  // Animated portal interior
  const grad = ctx.createRadialGradient(px+s/2, py+s/2, 2, px+s/2, py+s/2, s/2-2);
  grad.addColorStop(0,   `rgba(120,255,120,${glo})`);
  grad.addColorStop(0.5, `rgba(40,160,40,${glo*0.85})`);
  grad.addColorStop(1,   `rgba(10,60,10,0.5)`);
  ctx.fillStyle = grad;
  ctx.fillRect(px+5, py+5, s-10, s-10);

  // Gold border
  ctx.save();
  ctx.shadowColor = `rgba(255,215,0,${glo})`;
  ctx.shadowBlur  = 8;
  ctx.strokeStyle = `rgba(255,215,0,${glo})`;
  ctx.lineWidth   = 3;
  ctx.strokeRect(px+3, py+3, s-6, s-6);
  ctx.restore();

  // Star glyph
  ctx.fillStyle = `rgba(255,255,120,${glo})`;
  ctx.font      = `bold ${Math.floor(s*0.55)}px serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★', px + s/2, py + s/2 + 1);
}

function _drawGravel(ctx, px, py, s) {
  ctx.fillStyle = '#9A9490';
  ctx.fillRect(px, py, s, s);
  ctx.fillStyle = '#8A8480';
  ctx.fillRect(px+3,  py+3,  8, 8);
  ctx.fillRect(px+16, py+2,  9, 9);
  ctx.fillRect(px+4,  py+18, 8, 9);
  ctx.fillRect(px+20, py+20, 9, 8);
  ctx.fillStyle = '#AAA8A4';
  ctx.fillRect(px+11, py+10, 7, 7);
  ctx.fillRect(px+2,  py+12, 6, 6);
}

function _drawNetheriteOre(ctx, px, py, s) {
  // Dark netherrack base with dark-brown/grey ore veins
  ctx.fillStyle = '#2A1A1A';
  ctx.fillRect(px, py, s, s);
  ctx.fillStyle = '#3A2A2A';
  ctx.fillRect(px+2,  py+2,  14, 14);
  ctx.fillRect(px+18, py+16, 12, 12);
  ctx.fillStyle = '#1E1212';
  ctx.fillRect(px+16, py+2,  14, 12);
  ctx.fillRect(px+2,  py+16, 14, 12);
  // Netherite ore spots — dark metallic brownish
  ctx.fillStyle = '#8B7355';
  ctx.fillRect(px+4,  py+4,  6, 6);
  ctx.fillRect(px+20, py+6,  5, 5);
  ctx.fillRect(px+6,  py+20, 6, 6);
  ctx.fillRect(px+22, py+22, 5, 5);
  ctx.fillRect(px+13, py+13, 5, 5);
  // Highlight shimmer
  ctx.fillStyle = '#A09070';
  ctx.fillRect(px+5,  py+5,  2, 2);
  ctx.fillRect(px+21, py+7,  2, 2);
  ctx.fillRect(px+7,  py+21, 2, 2);
}

function _drawObsidian(ctx, px, py, s) {
  ctx.fillStyle = '#1A0A2E';
  ctx.fillRect(px, py, s, s);
  ctx.fillStyle = '#2A1A3E';
  ctx.fillRect(px+2,  py+2,  12, 12);
  ctx.fillRect(px+18, py+18, 12, 12);
  ctx.fillStyle = '#0E0618';
  ctx.fillRect(px+14, py+2,  14, 12);
  ctx.fillRect(px+2,  py+14, 12, 14);
  ctx.fillStyle = '#4A2A6A';
  ctx.fillRect(px+6,  py+6,  4, 4);
  ctx.fillRect(px+22, py+10, 3, 3);
  ctx.fillRect(px+10, py+22, 3, 3);
}

function _drawDeepslate(ctx, px, py, s) {
  ctx.fillStyle = '#444448';
  ctx.fillRect(px, py, s, s);
  ctx.fillStyle = '#555558';
  ctx.fillRect(px+2,  py+2,  13, 13);
  ctx.fillRect(px+17, py+17, 13, 13);
  ctx.fillStyle = '#333336';
  ctx.fillRect(px+15, py+2,  13, 13);
  ctx.fillRect(px+2,  py+15, 13, 13);
  ctx.fillStyle = '#666669';
  ctx.fillRect(px+8,  py+8,  5, 5);
}

function _drawSoulSand(ctx, px, py, s) {
  ctx.fillStyle = '#4A3828';
  ctx.fillRect(px, py, s, s);
  ctx.fillStyle = '#3A2818';
  ctx.fillRect(px+4,  py+4,  8, 8);
  ctx.fillRect(px+18, py+16, 8, 8);
  ctx.fillRect(px+8,  py+20, 8, 6);
  // Soul faces
  ctx.fillStyle = '#1A100A';
  ctx.fillRect(px+6,  py+6,  2, 2);
  ctx.fillRect(px+10, py+6,  2, 2);
  ctx.fillRect(px+7,  py+10, 4, 2);
  ctx.fillRect(px+20, py+18, 2, 2);
  ctx.fillRect(px+24, py+18, 2, 2);
  ctx.fillRect(px+21, py+22, 4, 2);
}

function _drawCrimsonLog(ctx, px, py, s) {
  ctx.fillStyle = '#8B1A1A';
  ctx.fillRect(px, py, s, s);
  ctx.fillStyle = '#6B0A0A';
  ctx.fillRect(px+4,  py, 3, s);
  ctx.fillRect(px+12, py, 2, s);
  ctx.fillRect(px+20, py, 3, s);
  ctx.fillRect(px+26, py, 2, s);
  ctx.fillStyle = '#AA3A3A';
  ctx.fillRect(px+1, py+8,  2, 14);
  ctx.fillRect(px+8, py+4,  2, 20);
}

function _drawWarpedLog(ctx, px, py, s) {
  ctx.fillStyle = '#1A6B6B';
  ctx.fillRect(px, py, s, s);
  ctx.fillStyle = '#0A4B4B';
  ctx.fillRect(px+4,  py, 3, s);
  ctx.fillRect(px+12, py, 2, s);
  ctx.fillRect(px+20, py, 3, s);
  ctx.fillRect(px+26, py, 2, s);
  ctx.fillStyle = '#2A8B8B';
  ctx.fillRect(px+1, py+8,  2, 14);
  ctx.fillRect(px+8, py+4,  2, 20);
}

function _drawNetherPortal(ctx, px, py, s) {
  const t   = Date.now() / 400;
  const glo = 0.45 + Math.sin(t) * 0.25;
  // Semi-transparent so player can pass "in front" visually
  ctx.save();
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = `rgba(80,0,160,${glo})`;
  ctx.fillRect(px, py, s, s);
  ctx.fillStyle = `rgba(160,60,240,${glo * 0.8})`;
  ctx.fillRect(px+3, py+2, s-6, s-4);
  // Swirl flecks
  ctx.fillStyle = `rgba(220,160,255,${glo})`;
  const seed = Math.floor(Date.now() / 180) % 4;
  const flecks = [[4,4],[s-9,7],[5,s-11],[s-11,s-9]];
  for (let i = 0; i < flecks.length; i++) {
    if ((i + seed) % 3 !== 0) ctx.fillRect(px + flecks[i][0], py + flecks[i][1], 4, 4);
  }
  ctx.restore();
}

function _drawNetherrack(ctx, px, py, s) {
  ctx.fillStyle = '#7A1A1A';
  ctx.fillRect(px, py, s, s);
  ctx.fillStyle = '#8A2A2A';
  ctx.fillRect(px+2,  py+2,  12, 12);
  ctx.fillRect(px+18, py+16, 12, 12);
  ctx.fillStyle = '#5A0A0A';
  ctx.fillRect(px+14, py+2,  14, 12);
  ctx.fillRect(px+2,  py+14, 12, 14);
}

function _drawLava(ctx, px, py, s) {
  const t   = Date.now() / 500;
  const glo = 0.8 + Math.sin(t) * 0.2;
  ctx.fillStyle = `rgba(220,60,0,${glo})`;
  ctx.fillRect(px, py, s, s);
  ctx.fillStyle = `rgba(255,140,0,${glo * 0.8})`;
  ctx.fillRect(px+2,  py+4,  10, 8);
  ctx.fillRect(px+18, py+12, 10, 8);
  ctx.fillStyle = `rgba(255,200,0,${glo * 0.6})`;
  ctx.fillRect(px+8,  py+8,  6, 6);
  ctx.fillRect(px+22, py+20, 6, 6);
}

function _drawTrapdoor(ctx, px, py, s, open) {
  if (open) {
    // Hang vertically on the right side, pointing straight down
    ctx.fillStyle = '#C8A558';
    ctx.fillRect(px + s - 8, py, 8, s);
    ctx.fillStyle = '#B89040';
    ctx.fillRect(px + s - 8, py + 8,  8, 2);
    ctx.fillRect(px + s - 8, py + 18, 8, 2);
    ctx.fillStyle = '#D8B868';
    ctx.fillRect(px + s - 7, py + 4, 4, 10);
  } else {
    // Horizontal plank at the TOP of the block — walkable surface
    ctx.fillStyle = '#C8A558';
    ctx.fillRect(px, py, s, 8);
    ctx.fillStyle = '#B89040';
    ctx.fillRect(px, py, s, 2);
    ctx.fillStyle = '#D8B868';
    ctx.fillRect(px + 4,  py + 2, 10, 4);
    ctx.fillRect(px + 18, py + 2, 10, 4);
  }
}

function _drawPistonBody(ctx, px, py, s, state = {}) {
  const dir = state.dir || 'right';
  // Steel outer frame
  ctx.fillStyle = '#888880';
  ctx.fillRect(px, py, s, s);
  // Wood face
  ctx.fillStyle = '#C8A558';
  ctx.fillRect(px+4, py+4, s-8, s-8);
  // Metal ribs
  ctx.fillStyle = '#9A9A90';
  ctx.fillRect(px+2,   py+2,   s-4, 4);
  ctx.fillRect(px+2,   py+s-6, s-4, 4);
  ctx.fillRect(px+2,   py+6,   4, s-12);
  ctx.fillRect(px+s-6, py+6,   4, s-12);
  // Direction arrow (shows which side the head extends from)
  ctx.fillStyle = '#3A3A30';
  ctx.beginPath();
  const m = s / 2;
  if (dir === 'right') {
    ctx.moveTo(px+s-8, py+m); ctx.lineTo(px+s-15, py+m-5); ctx.lineTo(px+s-15, py+m+5);
  } else if (dir === 'left') {
    ctx.moveTo(px+8,   py+m); ctx.lineTo(px+15,   py+m-5); ctx.lineTo(px+15,   py+m+5);
  } else if (dir === 'down') {
    ctx.moveTo(px+m, py+s-8); ctx.lineTo(px+m-5, py+s-15); ctx.lineTo(px+m+5, py+s-15);
  } else {
    ctx.moveTo(px+m, py+8);   ctx.lineTo(px+m-5, py+15);   ctx.lineTo(px+m+5, py+15);
  }
  ctx.closePath(); ctx.fill();
}

function _drawPistonHead(ctx, px, py, s, state = {}) {
  const dir = state.dir || 'right';
  // Gold face plate
  ctx.fillStyle = '#C8A558';
  ctx.fillRect(px, py, s, s);
  // Silver plate lines (perpendicular to push direction)
  ctx.fillStyle = '#AAA8A0';
  if (dir === 'right' || dir === 'left') {
    ctx.fillRect(px+2, py+2,   s-4, 8);
    ctx.fillRect(px+2, py+s-10, s-4, 8);
  } else {
    ctx.fillRect(px+2,   py+2, 8, s-4);
    ctx.fillRect(px+s-10, py+2, 8, s-4);
  }
  // Rod connecting back to piston body
  ctx.fillStyle = '#888880';
  if (dir === 'right')     ctx.fillRect(px,       py+s/2-3, 10, 6);
  else if (dir === 'left') ctx.fillRect(px+s-10,  py+s/2-3, 10, 6);
  else if (dir === 'down') ctx.fillRect(px+s/2-3, py,       6, 10);
  else                     ctx.fillRect(px+s/2-3, py+s-10,  6, 10);
}

function _drawPortalFrame(ctx, px, py, s) {
  // Obsidian-like but with purple tinge
  ctx.fillStyle = '#1A0A2E';
  ctx.fillRect(px, py, s, s);
  ctx.fillStyle = '#2A1A4E';
  ctx.fillRect(px+2,  py+2,  s-4, s-4);
  ctx.fillStyle = '#0E0618';
  ctx.fillRect(px+6,  py+6,  s-12, s-12);
  ctx.fillStyle = '#6A2A9A';
  ctx.fillRect(px+10, py+10, s-20, s-20);
}

function _drawLeverBlock(ctx, px, py, s, on) {
  // Stone base
  ctx.fillStyle = '#787878';
  ctx.fillRect(px, py + s - 10, s, 10);
  // Lever stick
  ctx.fillStyle = '#8B6340';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#8B6340';
  ctx.beginPath();
  if (on) {
    // Lever tilted right (on)
    ctx.moveTo(px + s/2, py + s - 10);
    ctx.lineTo(px + s/2 + 8, py + s - 22);
  } else {
    // Lever tilted left (off)
    ctx.moveTo(px + s/2, py + s - 10);
    ctx.lineTo(px + s/2 - 8, py + s - 22);
  }
  ctx.stroke();
  // Lever knob
  ctx.fillStyle = '#C8A558';
  ctx.fillRect(px + s/2 + (on ? 5 : -9), py + s - 24, 6, 6);
}

function _drawPressurePlate(ctx, px, py, s, pressed) {
  const oy = pressed ? 2 : 0;
  ctx.fillStyle = '#C8C8C0';
  ctx.fillRect(px + 4, py + s - 6 + oy, s - 8, 4);
  ctx.fillStyle = '#AAA8A0';
  ctx.fillRect(px + 4, py + s - 6 + oy, s - 8, 2);
}

function _drawBed(ctx, px, py, s, active = false, bedHalf = null) {
  const wood  = active ? '#D4A045' : '#8B6340';
  const board = active ? '#C8983C' : '#5A3A10';

  if (bedHalf === 'left') {
    // Left block = HEAD end (headboard on left, pillow visible)
    ctx.fillStyle = wood;
    ctx.fillRect(px, py, s, s);
    // Mattress — full width, open on the right edge
    ctx.fillStyle = '#CC3333';
    ctx.fillRect(px + 2, py + 2, s - 2, s - 10);
    // Pillow
    ctx.fillStyle = '#EEEEDD';
    ctx.fillRect(px + 6, py + 4, 18, 8);
    // Headboard on left
    ctx.fillStyle = active ? '#D4A045' : '#6B4A1C';
    ctx.fillRect(px, py, 4, s - 6);
    // Left leg
    ctx.fillStyle = '#3D1C02';
    ctx.fillRect(px + 2, py + s - 6, 4, 6);
    if (active) {
      ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2;
      ctx.strokeRect(px + 1, py + 1, s - 1, s - 2);
    }
  } else if (bedHalf === 'right') {
    // Right block = FOOT end (footboard on right, blanket/cover)
    ctx.fillStyle = wood;
    ctx.fillRect(px, py, s, s);
    // Mattress — full width, open on left edge
    ctx.fillStyle = '#CC3333';
    ctx.fillRect(px, py + 2, s - 2, s - 10);
    // Blanket cover
    ctx.fillStyle = '#991111';
    ctx.fillRect(px + 2, py + 4, s - 8, 8);
    // Blanket stripes
    ctx.fillStyle = '#AA2222';
    ctx.fillRect(px + 4,  py + 5, 4, 6);
    ctx.fillRect(px + 12, py + 5, 4, 6);
    ctx.fillRect(px + 20, py + 5, 4, 6);
    // Footboard on right
    ctx.fillStyle = board;
    ctx.fillRect(px + s - 4, py + 8, 4, s - 14);
    // Right leg
    ctx.fillStyle = '#3D1C02';
    ctx.fillRect(px + s - 6, py + s - 6, 4, 6);
    if (active) {
      ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2;
      ctx.strokeRect(px, py + 1, s - 1, s - 2);
    }
  } else {
    // Standalone single-block bed (legacy / inventory icon)
    ctx.fillStyle = wood;
    ctx.fillRect(px, py, s, s);
    ctx.fillStyle = '#CC3333';
    ctx.fillRect(px + 2, py + 2, s - 4, s - 10);
    ctx.fillStyle = '#EEEEDD';
    ctx.fillRect(px + 4, py + 4, 10, 8);
    ctx.fillStyle = '#AA2222';
    ctx.fillRect(px + 14, py + 4, 3, 8);
    ctx.fillRect(px + 20, py + 4, 3, 8);
    ctx.fillStyle = active ? '#D4A045' : '#6B4A1C';
    ctx.fillRect(px, py, 4, s - 6);
    ctx.fillStyle = board;
    ctx.fillRect(px + s - 4, py + 8, 4, s - 14);
    ctx.fillStyle = '#3D1C02';
    ctx.fillRect(px + 2,     py + s - 6, 4, 6);
    ctx.fillRect(px + s - 6, py + s - 6, 4, 6);
    if (active) {
      ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2;
      ctx.strokeRect(px + 1, py + 1, s - 2, s - 2);
    }
  }
}

function _drawStringItem(ctx, px, py, s) {
  // Item background
  ctx.fillStyle = '#3A3A3A';
  ctx.fillRect(px + 2, py + 2, s - 4, s - 4);
  // String threads
  ctx.strokeStyle = '#EEEEEE';
  ctx.lineWidth = 1.5;
  const cx = px + s / 2;
  ctx.beginPath();
  ctx.moveTo(cx - 6, py + 4);  ctx.lineTo(cx - 4, py + s - 4);
  ctx.moveTo(cx,     py + 4);  ctx.lineTo(cx + 2, py + s - 4);
  ctx.moveTo(cx + 6, py + 4);  ctx.lineTo(cx + 8, py + s - 4);
  ctx.stroke();
  // Cross threads
  ctx.strokeStyle = '#CCCCCC';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px + 4,  py + 10); ctx.lineTo(px + s - 4, py + 12);
  ctx.moveTo(px + 4,  py + 18); ctx.lineTo(px + s - 4, py + 20);
  ctx.stroke();
}

function _drawAppleItem(ctx, px, py, s) {
  const cx = px + s / 2;
  const cy = py + s / 2 + 2;
  // Background
  ctx.fillStyle = '#2A1A1A';
  ctx.fillRect(px + 2, py + 2, s - 4, s - 4);
  // Apple body
  ctx.fillStyle = '#CC2222';
  ctx.fillRect(cx - 9, cy - 7, 18, 14);
  ctx.fillRect(cx - 7, cy - 9, 14, 18);
  // Highlight
  ctx.fillStyle = '#EE4444';
  ctx.fillRect(cx - 6, cy - 6, 5, 5);
  // Stem
  ctx.fillStyle = '#5A3A10';
  ctx.fillRect(cx - 1, py + 4, 2, 6);
  // Leaf
  ctx.fillStyle = '#2A8A2A';
  ctx.fillRect(cx,     py + 5, 5, 3);
}

function _drawTnt(ctx, px, py, s) {
  // Red body
  ctx.fillStyle = '#CC2222';
  ctx.fillRect(px, py, s, s);
  // White label bands
  ctx.fillStyle = '#EEEEEE';
  ctx.fillRect(px, py+4,  s, 6);
  ctx.fillRect(px, py+s-10, s, 6);
  // "TNT" lettering (simple pixel style)
  ctx.fillStyle = '#CC2222';
  // T
  ctx.fillRect(px+3, py+5, 5, 2);
  ctx.fillRect(px+5, py+5, 2, 4);
  // N
  ctx.fillRect(px+10, py+5, 2, 5);
  ctx.fillRect(px+10, py+6, 4, 2);
  ctx.fillRect(px+14, py+5, 2, 5);
  // T (second)
  ctx.fillRect(px+17, py+5, 5, 2);
  ctx.fillRect(px+19, py+5, 2, 4);
  // Fuse on top
  ctx.fillStyle = '#888880';
  ctx.fillRect(px + s/2 - 1, py - 4, 2, 6);
}

function _drawTransmitter(ctx, px, py, s, number, powered) {
  ctx.fillStyle = powered ? '#331111' : '#1A1A2A';
  ctx.fillRect(px, py, s, s);
  ctx.strokeStyle = powered ? '#FF4444' : '#664444';
  ctx.lineWidth   = powered ? 2 : 1.5;
  ctx.strokeRect(px + 1, py + 1, s - 2, s - 2);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // "TX" label
  ctx.fillStyle = powered ? '#FF8888' : '#886666';
  ctx.font = 'bold 8px Courier New';
  ctx.fillText('TX', px + s / 2, py + s * 0.33);
  // Number
  ctx.fillStyle = powered ? '#FFBBBB' : '#AAAAAA';
  ctx.font = 'bold 12px Courier New';
  ctx.fillText(number != null ? String(number) : '?', px + s / 2, py + s * 0.67);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

function _drawReceiver(ctx, px, py, s, listenNums, powered) {
  ctx.fillStyle = powered ? '#0A1A33' : '#111A2A';
  ctx.fillRect(px, py, s, s);
  ctx.strokeStyle = powered ? '#4488FF' : '#334466';
  ctx.lineWidth   = powered ? 2 : 1.5;
  ctx.strokeRect(px + 1, py + 1, s - 2, s - 2);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = powered ? '#88AAFF' : '#6688AA';
  ctx.font = 'bold 8px Courier New';
  ctx.fillText('RX', px + s / 2, py + s * 0.33);
  const nums = listenNums && listenNums.length ? listenNums.slice(0, 3).join(',') : '?';
  ctx.fillStyle = powered ? '#BBCCFF' : '#AAAACC';
  ctx.font = nums.length > 4 ? 'bold 7px Courier New' : 'bold 11px Courier New';
  ctx.fillText(nums, px + s / 2, py + s * 0.67);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

function _drawChest(ctx, px, py, s, open) {
  const W = s, H = s;
  // Body
  ctx.fillStyle = '#7A4510';
  ctx.fillRect(px + 1, py + 11, W - 2, H - 12);
  // Body grain bands
  ctx.fillStyle = '#5A2E08';
  ctx.fillRect(px + 2, py + 11, 4, H - 12);
  ctx.fillRect(px + W - 6, py + 11, 4, H - 12);
  ctx.fillRect(px + 1, py + H - 5, W - 2, 4);
  // Lid
  if (open) {
    // Open: thin strip at top, dark interior visible
    ctx.fillStyle = '#A06020';
    ctx.fillRect(px + 1, py + 1, W - 2, 5);
    ctx.fillStyle = '#C88030';
    ctx.fillRect(px + 2, py + 2, W - 4, 3);
    ctx.fillStyle = '#1A0A02';
    ctx.fillRect(px + 3, py + 7, W - 6, 5);
  } else {
    // Closed: full lid occupies top third
    ctx.fillStyle = '#A06020';
    ctx.fillRect(px + 1, py + 1, W - 2, 9);
    ctx.fillStyle = '#C88030';
    ctx.fillRect(px + 2, py + 2, W - 4, 6);
    ctx.fillStyle = '#E0A040';
    ctx.fillRect(px + 3, py + 3, W - 6, 2);
  }
  // Lid-body seam
  ctx.fillStyle = '#3A1A04';
  ctx.fillRect(px + 1, py + 10, W - 2, 1);
  // Gold latch (centred on seam)
  ctx.fillStyle = '#FFD700';
  ctx.fillRect(px + W / 2 - 3, py + 7, 6, 6);
  ctx.fillStyle = '#B89000';
  ctx.fillRect(px + W / 2 - 2, py + 8, 4, 4);
  ctx.fillStyle = '#FFE840';
  ctx.fillRect(px + W / 2 - 1, py + 8, 2, 2);
  // Border
  ctx.strokeStyle = '#3A1A04';
  ctx.lineWidth   = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, W - 1, H - 1);
}

// Palette/hotbar icon for ruined portal tool (virtual type 37 — never in level grid)
function _drawRuinedPortalIcon(ctx, px, py, s) {
  // Dark obsidian base
  ctx.fillStyle = '#1A0A2E';
  ctx.fillRect(px, py, s, s);
  // Right column frame (complete)
  ctx.fillStyle = '#2A1A4E';
  ctx.fillRect(px + s - 8, py + 2, 6, s - 4);
  // Bottom row frame (complete)
  ctx.fillStyle = '#2A1A4E';
  ctx.fillRect(px + 2, py + s - 8, s - 4, 6);
  // Dim interior
  ctx.fillStyle = 'rgba(60,0,100,0.45)';
  ctx.fillRect(px + 4, py + 4, s - 12, s - 12);
  // Red X on the top-left (broken/missing section)
  ctx.strokeStyle = '#CC2222';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(px + 3, py + 3);  ctx.lineTo(px + 12, py + 12);
  ctx.moveTo(px + 12, py + 3); ctx.lineTo(px + 3,  py + 12);
  ctx.stroke();
  // Label
  ctx.fillStyle = '#AA77FF';
  ctx.font = 'bold 6px Courier New';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('RUINED', px + s / 2, py + s - 4);
  ctx.textAlign = 'left';
}

function _drawEndCrystal(ctx, px, py, s) {
  // Dark purple/black base
  ctx.fillStyle = '#0D0020';
  ctx.fillRect(px, py, s, s);
  // Radial glow
  const grad = ctx.createRadialGradient(px + s / 2, py + s / 2, 2, px + s / 2, py + s / 2, s / 2);
  grad.addColorStop(0,   '#CC88FF');
  grad.addColorStop(0.45,'#6600AA');
  grad.addColorStop(1,   '#0D0020');
  ctx.fillStyle = grad;
  ctx.fillRect(px + 2, py + 2, s - 4, s - 4);
  // Cyan inner diamond
  ctx.fillStyle = '#44FFEE';
  const cx = px + s / 2, cy = py + s / 2, r = 5;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy);
  ctx.closePath(); ctx.fill();
  // Border glow
  ctx.strokeStyle = '#AA55FF';
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 1, py + 1, s - 2, s - 2);
}

function _drawEndPortal(ctx, px, py, s) {
  // Deep void background
  ctx.fillStyle = '#020008';
  ctx.fillRect(px, py, s, s);
  // Swirling purple-teal field
  const grad = ctx.createLinearGradient(px, py, px + s, py + s);
  grad.addColorStop(0,   'rgba(80,0,140,0.55)');
  grad.addColorStop(0.5, 'rgba(0,100,120,0.35)');
  grad.addColorStop(1,   'rgba(80,0,140,0.55)');
  ctx.fillStyle = grad;
  ctx.fillRect(px, py, s, s);
  // Star particles
  ctx.fillStyle = '#CCAAFF';
  const stars = [[0.18,0.28],[0.72,0.12],[0.52,0.62],[0.88,0.42],[0.38,0.84]];
  for (const [dx, dy] of stars) ctx.fillRect(px + dx * s, py + dy * s, 2, 2);
  ctx.fillStyle = '#EEDDFF';
  const bright = [[0.34,0.44],[0.80,0.68],[0.14,0.54]];
  for (const [dx, dy] of bright) ctx.fillRect(px + dx * s, py + dy * s, 3, 3);
  // Faint cyan edge glow
  ctx.strokeStyle = 'rgba(100,220,200,0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
}

function _drawEndPortalFrame(ctx, px, py, s, full) {
  // Stone-grey base with green/purple gem facets — End Portal frame
  ctx.fillStyle = '#3A4A3A';
  ctx.fillRect(px, py, s, s);
  // Stone texture
  ctx.fillStyle = '#2E3E2E';
  ctx.fillRect(px + 2,      py + 2,      14, 14);
  ctx.fillRect(px + s - 14, py + s - 14, 12, 12);
  ctx.fillStyle = '#4A5A4A';
  ctx.fillRect(px + s - 12, py + 2,      10, 12);
  ctx.fillRect(px + 2,      py + s - 12, 10, 10);
  // Gem facets (green accents)
  ctx.fillStyle = '#44AA44';
  ctx.fillRect(px + 6,      py + 6,  4, 4);
  ctx.fillRect(px + s - 10, py + 6,  4, 4);
  ctx.fillRect(px + 6,      py + s - 10, 4, 4);
  ctx.fillStyle = '#88FF88';
  ctx.fillRect(px + 7,      py + 7,  2, 2);
  ctx.fillRect(px + s - 9,  py + 7,  2, 2);
  ctx.fillRect(px + 7,      py + s - 9, 2, 2);
  if (full) {
    // Eye of Ender — glowing iris in center
    const t   = Date.now() / 700;
    const glo = 0.55 + Math.sin(t) * 0.3;
    const cx  = px + s / 2, cy = py + s / 2;
    // Outer glow
    const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, s * 0.35);
    grad.addColorStop(0,   `rgba(100,220,120,${glo})`);
    grad.addColorStop(0.5, `rgba(40,160,60,${glo * 0.7})`);
    grad.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(px + 4, py + 4, s - 8, s - 8);
    // Eye slit
    ctx.fillStyle = `rgba(0,80,0,${glo})`;
    ctx.fillRect(cx - 7, cy - 3, 14, 6);
    ctx.fillStyle = `rgba(0,220,80,${glo})`;
    ctx.fillRect(cx - 5, cy - 2, 10, 4);
    // Pupil
    ctx.fillStyle = '#000';
    ctx.fillRect(cx - 2, cy - 2, 4, 4);
    // Border glow
    ctx.strokeStyle = `rgba(100,255,120,${glo * 0.8})`;
    ctx.lineWidth   = 1;
    ctx.strokeRect(px + 1, py + 1, s - 2, s - 2);
  }
}

function _drawEyeOfEnderItem(ctx, px, py, s) {
  const t   = Date.now() / 500;
  const glo = 0.6 + Math.sin(t) * 0.3;
  const cx  = px + s / 2, cy = py + s / 2;
  // Dark background
  ctx.fillStyle = '#0A0A1A';
  ctx.fillRect(px + 2, py + 2, s - 4, s - 4);
  // Radial aura
  const grad = ctx.createRadialGradient(cx, cy, 1, cx, cy, s / 2 - 2);
  grad.addColorStop(0,   `rgba(80,220,100,${glo})`);
  grad.addColorStop(0.5, `rgba(20,100,40,${glo * 0.5})`);
  grad.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(px + 2, py + 2, s - 4, s - 4);
  // Eye ellipse
  ctx.fillStyle = `rgba(0,180,60,${glo})`;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 10, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  // Iris
  ctx.fillStyle = `rgba(100,255,120,${glo})`;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 7, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Pupil
  ctx.fillStyle = '#000';
  ctx.fillRect(cx - 2, cy - 2, 4, 4);
  // Label
  ctx.fillStyle = `rgba(100,255,120,${glo * 0.8})`;
  ctx.font      = 'bold 6px Courier New';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('EYE', cx, py + s - 3);
  ctx.textAlign    = 'left';
}

function _drawEndPortalIcon(ctx, px, py, s) {
  // Frame background
  ctx.fillStyle = '#223';
  ctx.fillRect(px, py, s, s);
  // Portal frame border
  ctx.fillStyle = '#887766';
  ctx.fillRect(px, py, s, 5);
  ctx.fillRect(px, py + s - 5, s, 5);
  ctx.fillRect(px, py, 5, s);
  ctx.fillRect(px + s - 5, py, 5, s);
  // End portal interior
  ctx.fillStyle = '#020008';
  ctx.fillRect(px + 5, py + 5, s - 10, s - 10);
  ctx.fillStyle = 'rgba(80,0,140,0.5)';
  ctx.fillRect(px + 5, py + 5, s - 10, s - 10);
  // Stars
  ctx.fillStyle = '#CCAAFF';
  ctx.fillRect(px + 9,  py + 9,  2, 2);
  ctx.fillRect(px + 20, py + 14, 2, 2);
  ctx.fillRect(px + 12, py + 20, 2, 2);
  // Label
  ctx.fillStyle = '#AA77FF';
  ctx.font = 'bold 6px Courier New';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('END', px + s / 2, py + s - 3);
  ctx.textAlign = 'left';
}

// Palette/hotbar icon for redstone dust (overlay block — never in level grid)
function _drawRedstoneDustIcon(ctx, px, py, s) {
  // Stone-like background so the dust pattern is legible
  ctx.fillStyle = '#606060';
  ctx.fillRect(px, py, s, s);
  ctx.fillStyle = '#505050';
  ctx.fillRect(px + 2, py + 2, 14, 14);
  ctx.fillRect(px + 18, py + 16, 12, 12);
  // Dust strip across the top portion of the icon
  ctx.fillStyle = '#CC2222';
  ctx.fillRect(px + 3, py + 4, s - 6, 3);
  // Dot nodes (bright red)
  ctx.fillStyle = '#FF5555';
  ctx.fillRect(px + 3,      py + 3, 5, 5);
  ctx.fillRect(px + s/2-2,  py + 3, 5, 5);
  ctx.fillRect(px + s - 8,  py + 3, 5, 5);
  // Label
  ctx.fillStyle = 'rgba(255,170,170,0.8)';
  ctx.font = 'bold 7px Courier New';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('DUST', px + s / 2, py + s - 4);
  ctx.textAlign = 'left';
}

function _drawBlazeRodItem(ctx, px, py, s) {
  const cx = px + s / 2;
  ctx.fillStyle = '#1A1000';
  ctx.fillRect(px + 2, py + 2, s - 4, s - 4);
  // Glowing rod
  ctx.fillStyle = '#FF8800';
  ctx.fillRect(cx - 3, py + 4, 6, s - 8);
  // Bright core
  ctx.fillStyle = '#FFDD44';
  ctx.fillRect(cx - 1, py + 5, 2, s - 10);
  // Notch rings
  ctx.fillStyle = '#FF4400';
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(cx - 4, py + 8 + i * 7, 8, 2);
  }
  ctx.fillStyle = 'rgba(255,200,80,0.6)';
  ctx.font = 'bold 6px Courier New';
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('ROD', cx, py + s - 3);
  ctx.textAlign = 'left';
}

function _drawEnderPearlItem(ctx, px, py, s) {
  const cx = px + s / 2, cy = py + s / 2;
  ctx.fillStyle = '#050D12';
  ctx.fillRect(px + 2, py + 2, s - 4, s - 4);
  // Pearl glow
  const t   = Date.now() / 700;
  const glo = 0.55 + Math.sin(t) * 0.25;
  const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, 10);
  g.addColorStop(0,   `rgba(30,200,120,${glo})`);
  g.addColorStop(0.6, `rgba(0,80,60,${glo * 0.6})`);
  g.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fill();
  // Pearl body
  ctx.fillStyle = `rgba(20,160,100,${glo})`;
  ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = `rgba(80,255,160,${glo * 0.7})`;
  ctx.beginPath(); ctx.arc(cx - 2, cy - 2, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(100,255,180,0.5)';
  ctx.font = 'bold 5px Courier New';
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('PEARL', cx, py + s - 3);
  ctx.textAlign = 'left';
}

function _drawArrowItem(ctx, px, py, s) {
  const cx = px + s / 2, cy = py + s / 2;
  ctx.save();
  // Shaft
  ctx.strokeStyle = '#A07840';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 8, cy + 8);
  ctx.lineTo(cx + 7, cy - 7);
  ctx.stroke();
  // Arrowhead (filled triangle at tip)
  ctx.fillStyle = '#888888';
  ctx.beginPath();
  ctx.moveTo(cx + 7, cy - 7);
  ctx.lineTo(cx + 3, cy - 2);
  ctx.lineTo(cx + 2, cy - 6);
  ctx.closePath();
  ctx.fill();
  // Fletching (small lines at tail)
  ctx.strokeStyle = '#CC4444';
  ctx.lineWidth   = 1.5;
  ctx.beginPath(); ctx.moveTo(cx - 7, cy + 7); ctx.lineTo(cx - 10, cy + 5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 7, cy + 7); ctx.lineTo(cx - 5, cy + 10); ctx.stroke();
  ctx.restore();
}

function _drawGlowstone(ctx, px, py, s) {
  // Golden-yellow glowing block
  ctx.fillStyle = '#D4A017';
  ctx.fillRect(px, py, s, s);
  // Brighter center patches
  ctx.fillStyle = '#FFD84A';
  ctx.fillRect(px + 4,  py + 4,  10, 10);
  ctx.fillRect(px + 18, py + 16, 10, 10);
  ctx.fillRect(px + 6,  py + 18, 8,  8);
  // Highlight spots
  ctx.fillStyle = '#FFEE88';
  ctx.fillRect(px + 6,  py + 6,  5, 5);
  ctx.fillRect(px + 20, py + 18, 5, 5);
  ctx.fillRect(px + 8,  py + 20, 4, 4);
  // Outer glow tinge
  ctx.fillStyle = 'rgba(255,220,80,0.22)';
  ctx.fillRect(px, py, s, 3);
  ctx.fillRect(px, py + s - 3, s, 3);
  ctx.fillRect(px, py, 3, s);
  ctx.fillRect(px + s - 3, py, 3, s);
}

function _drawRespawnAnchor(ctx, px, py, s, active) {
  // Dark obsidian base
  ctx.fillStyle = '#1A0A2A';
  ctx.fillRect(px, py, s, s);
  // Purple-tinted face panels
  ctx.fillStyle = '#2D1845';
  ctx.fillRect(px + 2, py + 2, 13, 13);
  ctx.fillRect(px + 17, py + 17, 13, 13);
  ctx.fillStyle = '#3A2255';
  ctx.fillRect(px + 17, py + 2, 13, 13);
  ctx.fillRect(px + 2, py + 17, 13, 13);
  // Anchor symbol (cross shape in center)
  const cx = px + s / 2, cy = py + s / 2;
  const col = active ? '#AA44FF' : '#664488';
  ctx.fillStyle = col;
  ctx.fillRect(cx - 2, cy - 9, 4, 18); // vertical bar
  ctx.fillRect(cx - 7, cy - 2, 14, 4); // horizontal bar
  ctx.fillRect(cx - 5, cy + 5, 10, 3); // anchor bottom spread
  // Glow when active
  if (active) {
    ctx.fillStyle = 'rgba(180,80,255,0.35)';
    ctx.fillRect(px, py, s, s);
    ctx.fillStyle = '#CC88FF';
    ctx.fillRect(cx - 1, cy - 8, 2, 16);
    ctx.fillRect(cx - 6, cy - 1, 12, 2);
  }
}

function _drawMusicPlayer(ctx, px, py, s, playing) {
  // Dark wood body
  ctx.fillStyle = '#2A1A0A';
  ctx.fillRect(px, py, s, s);
  // Wood grain panels
  ctx.fillStyle = '#3D2510';
  ctx.fillRect(px + 2, py + 2, s - 4, 10);
  ctx.fillRect(px + 2, py + s - 12, s - 4, 10);
  // Speaker grille (center)
  ctx.fillStyle = '#1A0A00';
  ctx.fillRect(px + 4, py + 14, s - 8, s - 28);
  // Grille bars
  ctx.fillStyle = '#3A2000';
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(px + 4, py + 16 + i * 4, s - 8, 2);
  }
  // Note symbol (♪)
  const playing_ = !!playing;
  ctx.fillStyle = playing_ ? '#FFDD44' : '#665533';
  ctx.font = 'bold 11px Courier New';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('♪', px + s / 2, py + s / 2);
  ctx.textAlign = 'left';
  // Glow when playing
  if (playing_) {
    ctx.fillStyle = 'rgba(255,220,0,0.18)';
    ctx.fillRect(px, py, s, s);
  }
}

function _drawMusicDiscItem(ctx, px, py, s, discName) {
  const cx = px + s / 2, cy = py + s / 2;
  // Dark background
  ctx.fillStyle = '#111122';
  ctx.fillRect(px + 2, py + 2, s - 4, s - 4);
  // Disc body (dark record)
  ctx.fillStyle = '#222233';
  ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.fill();
  // Grooves
  ctx.strokeStyle = '#2A2A44'; ctx.lineWidth = 1;
  for (let r = 5; r <= 11; r += 2) {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  }
  // Label (center circle)
  ctx.fillStyle = '#AA44CC';
  ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
  // Center hole
  ctx.fillStyle = '#111122';
  ctx.beginPath(); ctx.arc(cx, cy, 1.5, 0, Math.PI * 2); ctx.fill();
  // "DISC" label at bottom
  ctx.fillStyle = '#8866AA';
  ctx.font = 'bold 5px Courier New';
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(discName ? discName.slice(0, 8) : 'DISC', cx, py + s - 2);
  ctx.textAlign = 'left';
}

function _drawDragonEggItem(ctx, px, py, s) {
  const cx = px + s / 2, cy = py + s / 2 + 1;
  ctx.fillStyle = '#0A0010';
  ctx.fillRect(px + 2, py + 2, s - 4, s - 4);
  // Egg shape (oval, taller than wide)
  ctx.fillStyle = '#3A0050';
  ctx.beginPath();
  ctx.ellipse(cx, cy, 9, 12, 0, 0, Math.PI * 2); ctx.fill();
  // Dark purple overlay
  ctx.fillStyle = '#220033';
  ctx.beginPath();
  ctx.ellipse(cx, cy - 1, 7, 10, 0, 0, Math.PI * 2); ctx.fill();
  // Highlight
  ctx.fillStyle = '#8800BB';
  ctx.beginPath();
  ctx.ellipse(cx - 2, cy - 4, 3, 4, -0.4, 0, Math.PI * 2); ctx.fill();
  // Shimmer
  ctx.fillStyle = 'rgba(200,100,255,0.5)';
  ctx.beginPath(); ctx.arc(cx - 3, cy - 5, 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(180,80,255,0.6)';
  ctx.font = 'bold 5px Courier New';
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('EGG', cx, py + s - 3);
  ctx.textAlign = 'left';
}

function _drawWitherAltarIcon(ctx, px, py, s) {
  // Miniature representation: skull on top, 3 sand blocks, base
  ctx.fillStyle = '#0D0D1A'; ctx.fillRect(px, py, s, s);
  const cw = s / 3;
  // Row 0: skull slots
  ctx.fillStyle = '#222233';
  ctx.fillRect(px, py, cw - 1, cw - 1);
  ctx.fillRect(px + cw * 2 + 1, py, cw - 1, cw - 1);
  ctx.fillStyle = '#884466';
  ctx.beginPath(); ctx.arc(px + cw / 2, py + cw / 2, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(px + cw * 2 + cw / 2 + 1, py + cw / 2, 4, 0, Math.PI * 2); ctx.fill();
  // Row 1: soul sand
  ctx.fillStyle = '#503820';
  for (let i = 0; i < 3; i++) ctx.fillRect(px + i * cw + 1, py + cw + 1, cw - 2, cw - 2);
  // Row 2: center sand
  ctx.fillRect(px + cw + 1, py + cw * 2 + 1, cw - 2, cw - 2);
  // Row 3: altar base
  ctx.fillStyle = '#2A2028';
  ctx.fillRect(px, py + cw * 3, s, cw);
  ctx.strokeStyle = '#6633AA'; ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + cw * 3 + 0.5, s - 1, cw - 1);
}

// ── Phase 14: Wither Boss blocks ─────────────────────────────

function _drawWitherSkullItem(ctx, px, py, s) {
  const cx = px + s / 2, cy = py + s / 2;
  ctx.fillStyle = '#1A1A1A';
  ctx.fillRect(px + 1, py + 1, s - 2, s - 2);
  // Skull dome
  ctx.fillStyle = '#888888';
  ctx.beginPath(); ctx.arc(cx, cy - 2, 9, Math.PI, 0); ctx.closePath(); ctx.fill();
  // Jaw
  ctx.fillStyle = '#777777';
  ctx.fillRect(cx - 7, cy + 3, 14, 6);
  // Eye sockets
  ctx.fillStyle = '#222244';
  ctx.fillRect(cx - 7, cy - 5, 5, 5);
  ctx.fillRect(cx + 2, cy - 5, 5, 5);
  // Glowing eyes
  ctx.fillStyle = '#CC44FF';
  ctx.fillRect(cx - 6, cy - 4, 3, 3);
  ctx.fillRect(cx + 3, cy - 4, 3, 3);
  // Teeth
  ctx.fillStyle = '#DDDDDD';
  for (let i = 0; i < 4; i++) ctx.fillRect(cx - 5 + i * 4, cy + 4, 2, 4);
  ctx.fillStyle = '#AA66CC';
  ctx.font = 'bold 5px Courier New';
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('SKULL', cx, py + s - 1);
  ctx.textAlign = 'left';
}

function _drawWitherSkullSlot(ctx, px, py, s) {
  // Unfilled slot: dark border with faint skull hint
  ctx.fillStyle = '#0D0D1A';
  ctx.fillRect(px, py, s, s);
  ctx.strokeStyle = '#554433';
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 1, py + 1, s - 2, s - 2);
  // Faint skull outline
  ctx.strokeStyle = 'rgba(136,68,102,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(px + s / 2, py + s / 2 - 2, 9, Math.PI, 0);
  ctx.closePath(); ctx.stroke();
  ctx.strokeRect(px + s / 2 - 7, py + s / 2 + 3, 14, 6);
  // Corner marks
  ctx.fillStyle = '#886644';
  ctx.fillRect(px + 1, py + 1, 3, 3);
  ctx.fillRect(px + s - 4, py + 1, 3, 3);
  ctx.fillRect(px + 1, py + s - 4, 3, 3);
  ctx.fillRect(px + s - 4, py + s - 4, 3, 3);
}

function _drawSoulSandSlotBlock(ctx, px, py, s) {
  // Unfilled soul sand slot: dark border with faint sand texture hint
  ctx.fillStyle = '#0D0D0A';
  ctx.fillRect(px, py, s, s);
  ctx.strokeStyle = '#554433';
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 1, py + 1, s - 2, s - 2);
  // Faint sand colour wash
  ctx.fillStyle = 'rgba(80,60,40,0.35)';
  ctx.fillRect(px + 4, py + 4, s - 8, s - 8);
  // Corner marks
  ctx.fillStyle = '#886644';
  ctx.fillRect(px + 1, py + 1, 3, 3);
  ctx.fillRect(px + s - 4, py + 1, 3, 3);
  ctx.fillRect(px + 1, py + s - 4, 3, 3);
  ctx.fillRect(px + s - 4, py + s - 4, 3, 3);
  // Small "S" label
  ctx.fillStyle = 'rgba(140,110,70,0.6)';
  ctx.font = 'bold 7px Courier New';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('S', px + s / 2, py + s / 2);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

function _drawAltarBlock(ctx, px, py, s) {
  // Dark stone altar base with rune markings
  ctx.fillStyle = '#1A1018';
  ctx.fillRect(px, py, s, s);
  // Stone texture
  ctx.fillStyle = '#2A2028';
  ctx.fillRect(px + 1, py + 1, s - 2, s - 2);
  ctx.fillStyle = '#201820';
  ctx.fillRect(px + 2, py + 2, 12, 12);
  ctx.fillRect(px + s - 14, py + 2, 12, 12);
  ctx.fillRect(px + 2, py + s - 14, 12, 12);
  ctx.fillRect(px + s - 14, py + s - 14, 12, 12);
  // Rune marks (purple glyphs)
  ctx.strokeStyle = '#6633AA';
  ctx.lineWidth = 1;
  const cx = px + s / 2, cy = py + s / 2;
  ctx.beginPath();
  ctx.moveTo(cx - 8, cy - 8); ctx.lineTo(cx, cy - 3); ctx.lineTo(cx + 8, cy - 8);
  ctx.moveTo(cx - 8, cy + 8); ctx.lineTo(cx, cy + 3); ctx.lineTo(cx + 8, cy + 8);
  ctx.moveTo(cx, cy - 3); ctx.lineTo(cx, cy + 3);
  ctx.stroke();
  // Outer border
  ctx.strokeStyle = '#443344';
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
}

// ── Phase 17: Speed Runner block renderers ───────────────────

function _drawSpeedBoosterBlock(ctx, px, py, s) {
  ctx.fillStyle = 'rgba(255,215,0,0.22)';
  ctx.fillRect(px, py, s, s);
  ctx.strokeStyle = '#FFD700';
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 2, py + 2, s - 4, s - 4);
  ctx.strokeStyle = 'rgba(255,200,0,0.65)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const off = 7 + i * 9;
    ctx.beginPath();
    ctx.moveTo(px + off, py + 4);
    ctx.lineTo(px + off - 8, py + s - 4);
    ctx.stroke();
  }
  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 11px Courier New';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('»»', px + s / 2, py + s / 2);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

function _drawJumpPadBlock(ctx, px, py, s) {
  ctx.fillStyle = '#2D8A2D';
  ctx.fillRect(px, py, s, s);
  ctx.fillStyle = '#5CB85C';
  ctx.fillRect(px + 2, py + 2, s - 4, 8);
  const cx = px + s / 2, cy = py + s / 2;
  ctx.strokeStyle = '#90EE90'; ctx.lineWidth = 1.5;
  for (const r of [5, 9, 12]) {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = '#BBFFBB';
  ctx.font = 'bold 14px Courier New';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('↑', cx, cy);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.strokeStyle = '#1A5C1A'; ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
}

function _drawSpeedItemBlock(ctx, px, py, s) {
  const cx = px + s / 2, cy = py + s / 2;
  ctx.fillStyle = 'rgba(255,230,0,0.15)';
  ctx.fillRect(px, py, s, s);
  ctx.fillStyle = '#FFE600';
  ctx.strokeStyle = '#FF9900'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx + 4,  py + 5);
  ctx.lineTo(cx - 1,  cy - 1);
  ctx.lineTo(cx + 4,  cy - 1);
  ctx.lineTo(cx - 4,  py + s - 5);
  ctx.lineTo(cx + 1,  cy + 2);
  ctx.lineTo(cx - 3,  cy + 2);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,230,0,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, s / 2 - 2, 0, Math.PI * 2); ctx.stroke();
}

// ── §Classic Blocks pack renderers (2026-07-24) ─────────────────
function _drawLadder(ctx, px, py, s) {
  // Faint backing so the rungs read the same on ANY background (a dark biome/night backdrop
  // used to show through the gaps and look like a black outline). Kept subtle so it's clearly
  // a ladder, not a solid block.
  ctx.fillStyle = 'rgba(150,110,60,0.14)';
  ctx.fillRect(px + 4, py, s - 8, s);
  ctx.strokeStyle = '#9a6b3a'; ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(px + 6, py);      ctx.lineTo(px + 6, py + s);
  ctx.moveTo(px + s - 6, py);  ctx.lineTo(px + s - 6, py + s);
  ctx.stroke();
  ctx.lineWidth = 2;
  for (let ry = 6; ry < s; ry += 10) { ctx.beginPath(); ctx.moveTo(px + 6, py + ry); ctx.lineTo(px + s - 6, py + ry); ctx.stroke(); }
}
// Trampoline: two parallel plates with a coil SPRING between them. `compress` 0..1 squashes the
// spring (top plate dips) — driven by the game when a player lands (spring compresses → launch).
function _drawTrampoline(ctx, px, py, s, compress = 0) {
  const plateH = 5;
  const restTop = py + 3, botY = py + s - plateH;
  const topY = restTop + compress * 9;                 // top plate dips when compressed
  const coilTop = topY + plateH, coilBot = botY;
  const coilH = Math.max(2, coilBot - coilTop);
  // Coil spring (zig-zag) between the plates.
  ctx.strokeStyle = '#c9ced8'; ctx.lineWidth = 2;
  ctx.beginPath();
  const coils = 4, midx = px + s / 2, amp = s / 2 - 5;
  for (let i = 0; i <= coils; i++) {
    const y = coilTop + (coilH * i) / coils;
    const x = midx + (i % 2 === 0 ? -amp : amp);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  // Bottom plate (dark base) + top plate (bouncy surface).
  ctx.fillStyle = '#5a6472'; ctx.fillRect(px, botY, s, plateH);
  ctx.fillStyle = '#7a8798'; ctx.fillRect(px, botY, s, 2);
  ctx.fillStyle = '#3fd08a'; ctx.fillRect(px, topY, s, plateH);
  ctx.fillStyle = '#bff5da'; ctx.fillRect(px, topY, s, 2);
  ctx.strokeStyle = '#1f5f43'; ctx.strokeRect(px + 0.5, topY + 0.5, s - 1, plateH - 1);
}
// Slime block — same bounce physics, Minecraft-slime look (translucent green cube + inner core).
function _drawSlime(ctx, px, py, s, compress = 0) {
  const dip = compress * 6;
  ctx.fillStyle = 'rgba(90,200,110,0.55)'; ctx.fillRect(px, py + dip, s, s - dip);
  ctx.fillStyle = 'rgba(70,170,90,0.65)'; ctx.strokeStyle = 'rgba(40,120,60,0.8)'; ctx.lineWidth = 1.5;
  ctx.strokeRect(px + 1.5, py + 1.5 + dip, s - 3, s - 3 - dip);
  ctx.fillStyle = 'rgba(60,150,80,0.9)'; ctx.fillRect(px + 9, py + 9 + dip, s - 18, s - 18 - dip);   // inner core
  ctx.fillStyle = 'rgba(200,255,210,0.5)'; ctx.fillRect(px + 4, py + 4 + dip, 5, 5);                 // highlight
}
function _drawSpikes(ctx, px, py, s) {
  ctx.fillStyle = '#8a9099';
  const n = 3, w = s / n;
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.moveTo(px + i * w, py + s);
    ctx.lineTo(px + i * w + w / 2, py + 3);
    ctx.lineTo(px + (i + 1) * w, py + s);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#c9d2db';
  for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.moveTo(px + i * w + w / 2 - 1, py + 3); ctx.lineTo(px + i * w + w / 2 + 2, py + 10); ctx.lineTo(px + i * w + w / 2, py + 12); ctx.closePath(); ctx.fill(); }
}
function _drawCoinBlock(ctx, px, py, s, frame) {
  const cx = px + s / 2, cy = py + s / 2;
  const w = Math.abs(Math.cos((frame || 0) * 0.08)) * (s / 2 - 4) + 2;   // spin
  ctx.fillStyle = '#f2c531'; ctx.strokeStyle = '#a5791a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(cx, cy, w, s / 2 - 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff2b0'; ctx.font = 'bold 10px Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (w > 5) ctx.fillText('$', cx, cy + 1);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}
function _drawIce(ctx, px, py, s) {
  ctx.fillStyle = '#a9dcf0'; ctx.fillRect(px, py, s, s);
  ctx.fillStyle = '#cdeefb'; ctx.fillRect(px, py, s, 4);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(px + 5, py + 6); ctx.lineTo(px + 13, py + 16); ctx.moveTo(px + s - 6, py + 5); ctx.lineTo(px + s - 14, py + 14); ctx.stroke();
  ctx.strokeStyle = 'rgba(90,150,180,0.5)'; ctx.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
}
function _drawQuestionBlock(ctx, px, py, s, used, frame) {
  const bob = used ? 0 : Math.sin((frame || 0) * 0.06) * 1;
  ctx.fillStyle = used ? '#8a6a3a' : '#e0a52a';
  ctx.fillRect(px, py + bob, s, s - Math.abs(bob));
  ctx.strokeStyle = used ? '#5f4826' : '#a5791a'; ctx.lineWidth = 2; ctx.strokeRect(px + 1, py + 1 + bob, s - 2, s - 2);
  // corner rivets
  ctx.fillStyle = used ? '#5f4826' : '#7a5a1a';
  for (const [dx, dy] of [[3, 3], [s - 5, 3], [3, s - 5], [s - 5, s - 5]]) ctx.fillRect(px + dx, py + dy + bob, 2, 2);
  if (!used) { ctx.fillStyle = '#fff4cf'; ctx.font = 'bold 16px Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', px + s / 2, py + s / 2 + bob); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; }
}
function _drawHiddenBlock(ctx, px, py, s, editor) {
  if (!editor) return;   // invisible in play until bumped (the game swaps it visible)
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
  ctx.strokeRect(px + 2.5, py + 2.5, s - 5, s - 5); ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = 'bold 14px Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('?', px + s / 2, py + s / 2); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}
// Jump-Through platform — now a FULL block (so the grapple/other mechanics see a surface), but
// visually distinct: a solid top plank + a lighter, semi-transparent "slatted" body so it reads
// as pass-through-from-below rather than a solid wall.
function _drawOneWay(ctx, px, py, s) {
  ctx.fillStyle = '#b9853f'; ctx.fillRect(px, py, s, 6);            // solid top plank (the stand-on surface)
  ctx.fillStyle = '#8a5f27'; ctx.fillRect(px, py + 5, s, 2);       // plank underside line
  ctx.fillStyle = 'rgba(160,120,60,0.45)'; ctx.fillRect(px, py + 7, s, s - 7);   // translucent body
  ctx.strokeStyle = 'rgba(120,85,40,0.55)'; ctx.lineWidth = 1;     // vertical slats (see-through look)
  for (let x = 5; x < s; x += 7) { ctx.beginPath(); ctx.moveTo(px + x + 0.5, py + 8); ctx.lineTo(px + x + 0.5, py + s - 1); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(255,240,200,0.6)'; ctx.beginPath();      // ↑ hint (jump up through)
  ctx.moveTo(px + s / 2 - 4, py + s - 5); ctx.lineTo(px + s / 2, py + s - 9); ctx.lineTo(px + s / 2 + 4, py + s - 5); ctx.stroke();
}
// One pipe cell (Warp Pipe or Pipe Stem). Seamless: edges/highlights/mouth are drawn ONLY on
// sides with no adjacent pipe (state.pipeT/B/L/R), so a 2×N cluster reads as one continuous pipe.
// `stem` = a body-only cell (never draws the mouth lip). The mouth shows on a Warp Pipe cell whose
// TOP is open (nothing pipe above) — the enterable opening.
// Monkey-bar. The GRAB bar is a horizontal steel bar at the BOTTOM of the cell (so a grapple
// anchoring to the block's bottom edge lines up with where you hang). `withPlatform` adds a
// Jump-Through plank on top (the BAR_PLATFORM variant): stand on the plank, drop through onto
// the bar. See-through everywhere except the plank + bar.
function _drawBar(ctx, px, py, s, withPlatform) {
  if (withPlatform) {
    ctx.fillStyle = '#b9853f'; ctx.fillRect(px, py, s, 5);           // stand-on plank
    ctx.fillStyle = '#8a5f27'; ctx.fillRect(px, py + 4, s, 2);
  }
  ctx.strokeStyle = 'rgba(150,152,160,0.55)'; ctx.lineWidth = 2;     // mounting posts down to the bar
  const postTop = py + (withPlatform ? 6 : 1);
  ctx.beginPath();
  ctx.moveTo(px + 5.5, postTop); ctx.lineTo(px + 5.5, py + s - 5);
  ctx.moveTo(px + s - 5.5, postTop); ctx.lineTo(px + s - 5.5, py + s - 5);
  ctx.stroke();
  const barY = py + s - 5;                                           // bar at the BOTTOM edge
  ctx.fillStyle = '#8e9199'; ctx.fillRect(px, barY, s, 4);
  ctx.fillStyle = '#c7ccd4'; ctx.fillRect(px, barY, s, 1);          // highlight
  ctx.fillStyle = '#5c6068'; ctx.fillRect(px, barY + 3, s, 1);      // shade
}
// §Travel Tube — a footprint cell of a fly-through tube. IN-WORLD (state.world) it draws NOTHING —
// the tube is rendered as a continuous band by the game's tube passes, so per-cell squares would
// fight the rounded look. Everywhere else (palette / hotbar, no world flag) it draws a glass ICON.
function _drawTubeWall(ctx, px, py, s, state) {
  if (state && state.world) return;
  ctx.fillStyle = 'rgba(150,205,232,0.5)'; ctx.fillRect(px + 3, py + 3, s - 6, s - 6);
  ctx.fillStyle = 'rgba(222,240,250,0.4)'; ctx.fillRect(px + 5, py + 5, s - 10, 3);
  ctx.strokeStyle = 'rgba(150,190,215,0.95)'; ctx.lineWidth = 2; ctx.strokeRect(px + 3.5, py + 3.5, s - 7, s - 7);
}
// §Phase R — Target Block: a bullseye that lights up while ON/pulsing. Hit by an arrow or attack.
function _drawTargetBlock(ctx, px, py, s, on) {
  ctx.fillStyle = '#c9c2b4'; ctx.fillRect(px, py, s, s);                 // stone-ish body
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
  const cx = px + s / 2, cy = py + s / 2;
  const rings = [[s * 0.42, on ? '#ff5a44' : '#a94434'], [s * 0.30, '#efe7d6'], [s * 0.17, on ? '#ff7a4a' : '#b8563a']];
  for (const [r, col] of rings) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = on ? '#fff2c0' : '#7a2f22'; ctx.beginPath(); ctx.arc(cx, cy, s * 0.07, 0, Math.PI * 2); ctx.fill();  // bullseye
  if (on) { ctx.strokeStyle = 'rgba(255,120,80,0.7)'; ctx.lineWidth = 2; ctx.strokeRect(px + 1.5, py + 1.5, s - 3, s - 3); }
}
// §Phase R — Pulse Converter: directional pulse↔toggle latch. `dir` = the PULSE (P) side; the
// TOGGLE (T) side is opposite. Labels placed on those two edges; a centre dot lights when outputting.
function _drawPulseConverter(ctx, px, py, s, on, dir) {
  dir = dir || 'right';
  ctx.fillStyle = '#3a4652'; ctx.fillRect(px, py, s, s);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
  ctx.fillStyle = on ? '#57e0a0' : '#2a333c'; ctx.beginPath(); ctx.arc(px + s / 2, py + s / 2, s * 0.16, 0, Math.PI * 2); ctx.fill();
  const pos = { right: [0.82, 0.5], left: [0.18, 0.5], down: [0.5, 0.82], up: [0.5, 0.18] };
  const opp = { right: 'left', left: 'right', down: 'up', up: 'down' };
  const [pfx, pfy] = pos[dir], [tfx, tfy] = pos[opp[dir]];
  ctx.fillStyle = '#cdd6e0'; ctx.font = `bold ${Math.round(s * 0.26)}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('P', px + s * pfx, py + s * pfy); ctx.fillText('T', px + s * tfx, py + s * tfy);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}
// §Phase R — Redstone Lamp: a coloured glass lamp, dim when off, glowing when powered.
function _drawRedstoneLamp(ctx, px, py, s, on, colorIdx) {
  const col = (LAMP_COLORS[(colorIdx || 0) % LAMP_COLORS.length] || LAMP_COLORS[0]).c;
  ctx.fillStyle = '#2b2b30'; ctx.fillRect(px, py, s, s);                        // dark frame
  const m = 3;
  ctx.save();
  ctx.globalAlpha = on ? 1 : 0.28;                                              // much darker when off → strong on/off contrast
  ctx.fillStyle = col; ctx.fillRect(px + m, py + m, s - 2 * m, s - 2 * m);
  ctx.restore();
  if (on) {                                                                     // glow + highlight
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(px + m + 1, py + m + 1, s - 2 * m - 2, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.beginPath(); ctx.arc(px + s / 2, py + s / 2, s * 0.28, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = on ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;  // filament cross
  ctx.beginPath(); ctx.moveTo(px + m, py + s / 2); ctx.lineTo(px + s - m, py + s / 2); ctx.moveTo(px + s / 2, py + m); ctx.lineTo(px + s / 2, py + s - m); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
}
function _drawWarpPipe(ctx, px, py, s, state = {}, stem = false) {
  const t = !!state.pipeT, b = !!state.pipeB, l = !!state.pipeL, r = !!state.pipeR;
  // Overdraw 1px INTO connected neighbors so sub-pixel tile rounding can't leave a seam.
  ctx.fillStyle = '#2fae4e'; ctx.fillRect(px - (l ? 1 : 0), py - (t ? 1 : 0), s + (l ? 1 : 0) + (r ? 1 : 0), s + (t ? 1 : 0) + (b ? 1 : 0));
  if (!r) { ctx.fillStyle = '#1f7d38'; ctx.fillRect(px + s - 7, py, 7, s); }   // shade on the open right edge
  if (!l) { ctx.fillStyle = '#7de89a'; ctx.fillRect(px + 2, py, 4, s); }       // highlight on the open left edge
  if (!stem && !t) { ctx.fillStyle = '#25913f'; ctx.fillRect(px - 1, py, s + 2, 8); ctx.fillStyle = '#134f22'; ctx.fillRect(px - 1, py + 8, s + 2, 2); }  // mouth lip
  ctx.strokeStyle = '#134f22'; ctx.lineWidth = 1; ctx.beginPath();             // outline OUTER edges only
  if (!t) { ctx.moveTo(px, py + 0.5); ctx.lineTo(px + s, py + 0.5); }
  if (!b) { ctx.moveTo(px, py + s - 0.5); ctx.lineTo(px + s, py + s - 0.5); }
  if (!l) { ctx.moveTo(px + 0.5, py); ctx.lineTo(px + 0.5, py + s); }
  if (!r) { ctx.moveTo(px + s - 0.5, py); ctx.lineTo(px + s - 0.5, py + s); }
  ctx.stroke();
}
function _drawConveyor(ctx, px, py, s, dir, frame) {
  ctx.fillStyle = '#3a3f4a'; ctx.fillRect(px, py, s, s);
  ctx.fillStyle = '#5a6070'; ctx.fillRect(px, py, s, 9);
  // moving chevrons
  ctx.fillStyle = '#aab2c4';
  const off = ((frame || 0) * 0.6 * dir) % 12;
  for (let x = -12; x < s + 12; x += 12) {
    const bx = px + ((x + off) % (s + 12) + (s + 12)) % (s + 12);
    ctx.beginPath();
    if (dir > 0) { ctx.moveTo(bx, py + 1); ctx.lineTo(bx + 5, py + 4.5); ctx.lineTo(bx, py + 8); }
    else         { ctx.moveTo(bx + 5, py + 1); ctx.lineTo(bx, py + 4.5); ctx.lineTo(bx + 5, py + 8); }
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#2a2f3a'; ctx.fillRect(px + 3, py + s - 6, 3, 3); ctx.fillRect(px + s - 6, py + s - 6, 3, 3);
}
function _drawCrumble(ctx, px, py, s, crumbling) {
  ctx.fillStyle = crumbling ? '#a06a4a' : '#b98a5a'; ctx.fillRect(px, py, s, s);
  ctx.strokeStyle = '#7a5330'; ctx.lineWidth = 1;
  // cracks
  ctx.beginPath();
  ctx.moveTo(px + 5, py + 2); ctx.lineTo(px + 9, py + 12); ctx.lineTo(px + 6, py + s - 3);
  ctx.moveTo(px + s - 4, py + 4); ctx.lineTo(px + s - 10, py + 14); ctx.lineTo(px + s - 5, py + s - 2);
  ctx.moveTo(px + 12, py + 7); ctx.lineTo(px + s - 12, py + 9);
  ctx.stroke();
  if (crumbling) { ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(px, py, s, s); }
}
function _drawBreakable(ctx, px, py, s, hasItem) {
  ctx.fillStyle = '#b5642f'; ctx.fillRect(px, py, s, s);
  ctx.strokeStyle = '#7d4520'; ctx.lineWidth = 1;
  // brick courses
  for (let ry = 0; ry < s; ry += 8) {
    ctx.beginPath(); ctx.moveTo(px, py + ry + 0.5); ctx.lineTo(px + s, py + ry + 0.5); ctx.stroke();
    const off = (ry / 8) % 2 === 0 ? 0 : s / 2;
    ctx.beginPath(); ctx.moveTo(px + off + 0.5, py + ry); ctx.lineTo(px + off + 0.5, py + ry + 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px + (off + s / 2) % s + 0.5, py + ry); ctx.lineTo(px + (off + s / 2) % s + 0.5, py + ry + 8); ctx.stroke();
  }
  ctx.strokeStyle = '#d98a4f'; ctx.strokeRect(px + 1, py + 1, s - 2, 2);
  if (hasItem) { ctx.fillStyle = 'rgba(255,240,160,0.85)'; ctx.beginPath(); ctx.arc(px + s / 2, py + s / 2, 3, 0, Math.PI * 2); ctx.fill(); }
}
