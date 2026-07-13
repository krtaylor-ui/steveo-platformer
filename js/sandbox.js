// ============================================================
// sandbox.js — Sandbox mode: block palette, hotbar, spawn eggs, popups
// ============================================================

const SANDBOX_PALETTE_BLOCKS = {
  overworld: [
    BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.OAK_LOG,
    BLOCK.OAK_LEAVES, BLOCK.OAK_PLANKS, BLOCK.GRAVEL,
    BLOCK.COAL_ORE, BLOCK.IRON_ORE, BLOCK.GOLD_ORE,
    BLOCK.DIAMOND_ORE, BLOCK.NETHERITE_ORE,
    BLOCK.OBSIDIAN, BLOCK.DEEPSLATE, BLOCK.BEDROCK,
  ],
  nether: [
    BLOCK.NETHERRACK, BLOCK.SOUL_SAND, BLOCK.CRIMSON_LOG,
    BLOCK.WARPED_LOG, BLOCK.OBSIDIAN, BLOCK.LAVA, BLOCK.GLOWSTONE,
  ],
};

const SPAWN_EGG_DEFS = [
  { key: 'zombie',          label: 'Zombie',         color: '#2A8A2A' },
  { key: 'skeleton',        label: 'Skeleton',        color: '#CCCCCC' },
  { key: 'creeper',         label: 'Creeper',         color: '#55BB55' },
  { key: 'cave_spider',     label: 'Cave Spider',     color: '#334488' },
  { key: 'piglin',          label: 'Piglin',          color: '#FFAA44' },
  { key: 'blaze',           label: 'Blaze',           color: '#FF8800' },
  { key: 'wither_skeleton', label: 'Wither Skel.',    color: '#444444' },
  { key: 'enderman',        label: 'Enderman',         color: '#111111' },
];

// "Gear" palette tab: weapons, tools, and armor
// Gear palette groups tools BY TYPE (all pickaxes, then all swords, spears, axes,
// tridents, bows, crossbows, …), tiers ascending within each group — instead of
// TOOL_DATA's tier-interleaved insertion order. weaponClass distinguishes the
// melee families that share type 'sword' (sword/spear/axe/trident) and the ranged
// families that share type 'bow' (bow/crossbow); non-weapons fall back to `type`.
const _GEAR_GROUP_ORDER = ['pickaxe', 'sword', 'spear', 'axe', 'trident', 'bow', 'crossbow', 'shield', 'flint_steel'];
const _gearGroup = (key) => (TOOL_DATA[key].weaponClass || TOOL_DATA[key].type);
const _gearRank  = (key) => { const i = _GEAR_GROUP_ORDER.indexOf(_gearGroup(key)); return i < 0 ? 99 : i; };
const GEAR_PALETTE_ITEMS = [
  ...Object.keys(TOOL_DATA)
    .sort((a, b) => (_gearRank(a) - _gearRank(b)) || ((TOOL_DATA[a].tier || 0) - (TOOL_DATA[b].tier || 0)))
    .map(key => ({
      kind: 'tool', key,
      name:  TOOL_DATA[key].name,
      type:  TOOL_DATA[key].type,
      weaponClass: TOOL_DATA[key].weaponClass,   // for per-weapon palette icons (Smart Mobs §2)
      color: TOOL_DATA[key].color,
    })),
  ...Object.keys(ARMOR_DATA).map(key => ({
    kind: 'tool', key,
    name:  ARMOR_DATA[key].name,
    type:  'armor',
    piece: ARMOR_DATA[key].piece,
    color: ARMOR_DATA[key].color,
  })),
];

// Virtual block type for ruined portal tool — palette/hotbar only, never placed in grid
const SB_RUINED_PORTAL = 37;
const SB_END_PORTAL    = 43;  // virtual palette type for End Portal tool (types 40-42 are real blocks)
const SB_WITHER_ALTAR  = 56;  // virtual palette type for Wither Altar 3×4 multi-block

// "Other" palette tab: redstone, structural, spawn eggs
const OTHER_PALETTE_ITEMS = [
  // ── Redstone devices ─────────────────────────────────────────
  { kind: 'block',    blockType: BLOCK.LEVER },
  { kind: 'block',    blockType: BLOCK.TRAPDOOR },
  { kind: 'block',    blockType: BLOCK.PRESSURE_PLATE },
  { kind: 'dust',     name: 'Redstone Dust', color: '#CC2222' },
  { kind: 'gate',     gateType: 'not', name: 'NOT Gate',   color: '#00AAAA' },
  { kind: 'gate',     gateType: 'and', name: 'AND Gate',   color: '#CC7700' },
  { kind: 'block',    blockType: BLOCK.TRANSMITTER,        },
  { kind: 'block',    blockType: BLOCK.RECEIVER,           },
  // ── Pistons ───────────────────────────────────────────────────
  { kind: 'block', blockType: BLOCK.PISTON_BODY },
  // ── Storage ───────────────────────────────────────────────────
  { kind: 'block', blockType: BLOCK.CHEST },
  // ── Structural / Special ─────────────────────────────────────
  { kind: 'block', blockType: BLOCK.BED },
  { kind: 'block', blockType: BLOCK.RESPAWN_ANCHOR },
  { kind: 'block', blockType: BLOCK.NETHER_PORTAL_FRAME },
  { kind: 'block', blockType: SB_RUINED_PORTAL },
  { kind: 'block', blockType: SB_END_PORTAL },
  { kind: 'block', blockType: BLOCK.EYE_OF_ENDER },
  { kind: 'block', blockType: SB_WITHER_ALTAR },
  { kind: 'block', blockType: BLOCK.WITHER_SKELETON_HEAD },
  { kind: 'block', blockType: BLOCK.GOAL },
  // Speed Runner blocks
  { kind: 'block', blockType: BLOCK.SPEED_BOOSTER },
  { kind: 'block', blockType: BLOCK.JUMP_PAD },
  { kind: 'block', blockType: BLOCK.SPEED_ITEM },
  { kind: 'block', blockType: BLOCK.TNT },
  { kind: 'block', blockType: BLOCK.MUSIC_PLAYER },
  // ── Consumable items ─────────────────────────────────────────
  { kind: 'blockItem', blockType: BLOCK.ARROW, defaultCount: 20, name: 'Arrow Stack' },
  // ── Arena collectibles (Phase 3A.2) ──────────────────────────
  { kind: 'emerald', name: 'Emerald',  color: '#2ecc71' },
  { kind: 'powerup', name: 'Power-Up', color: '#e67e22' },
  // ── Arena objectives (Phase 3A.3) ────────────────────────────
  { kind: 'hill',      name: 'Hill (KotH)',  color: '#f1c40f' },
  { kind: 'spawnline', name: 'Spawn Line',   color: '#9b59b6' },
  // Player spawn points (Phase 3 — distinct from Survival "Spawn Line" mob markers).
  { kind: 'spawnpoint', name: 'Player Spawn', color: '#4aa3ff' },
  // Arena objects (Phase 3 v3) — CTF Base (flag inherent to its centre), Defend-
  // the-Tower target, and Heal Tower pickup. One unified placeable, `obj` subtype.
  { kind: 'arenaobj', obj: 'base',  name: 'CTF Base',   color: '#e74c3c' },
  { kind: 'arenaobj', obj: 'tower', name: 'Tower',      color: '#9a9488' },
  { kind: 'arenaobj', obj: 'heal',  name: 'Heal Tower', color: '#2ecc71' },
  // ── Spawn Eggs ───────────────────────────────────────────────
  ...SPAWN_EGG_DEFS.map(d => ({ kind: 'egg', ...d })),
];

// Power-up types (editor cycle order). Runtime effects live in powerup-system.js.
const SB_POWERUP_TYPES = [
  { type: 'HEALTH',    label: 'Health',    color: '#e74c3c', symbol: '✚' },
  { type: 'SPEED',     label: 'Speed',     color: '#3498db', symbol: '»' },
  { type: 'FIRE_RATE', label: 'Fire Rate', color: '#f1c40f', symbol: '🏹' },
  { type: 'SHIELD',    label: 'Shield',    color: '#9b59b6', symbol: '⛨' },
];

// Multi-block footprint templates — anchor is dr=0,dc=0 (top-left cell)
const SB_MULTI_FOOTPRINT = {
  [BLOCK.BED]: [
    { dr: 0, dc: 0, type: BLOCK.BED },
    { dr: 0, dc: 1, type: BLOCK.BED },
  ],
  [BLOCK.NETHER_PORTAL_FRAME]: [
    // Top row
    { dr: 0, dc: 0, type: BLOCK.NETHER_PORTAL_FRAME },
    { dr: 0, dc: 1, type: BLOCK.NETHER_PORTAL_FRAME },
    { dr: 0, dc: 2, type: BLOCK.NETHER_PORTAL_FRAME },
    { dr: 0, dc: 3, type: BLOCK.NETHER_PORTAL_FRAME },
    // Left side
    { dr: 1, dc: 0, type: BLOCK.NETHER_PORTAL_FRAME },
    { dr: 2, dc: 0, type: BLOCK.NETHER_PORTAL_FRAME },
    { dr: 3, dc: 0, type: BLOCK.NETHER_PORTAL_FRAME },
    // Right side
    { dr: 1, dc: 3, type: BLOCK.NETHER_PORTAL_FRAME },
    { dr: 2, dc: 3, type: BLOCK.NETHER_PORTAL_FRAME },
    { dr: 3, dc: 3, type: BLOCK.NETHER_PORTAL_FRAME },
    // Bottom row
    { dr: 4, dc: 0, type: BLOCK.NETHER_PORTAL_FRAME },
    { dr: 4, dc: 1, type: BLOCK.NETHER_PORTAL_FRAME },
    { dr: 4, dc: 2, type: BLOCK.NETHER_PORTAL_FRAME },
    { dr: 4, dc: 3, type: BLOCK.NETHER_PORTAL_FRAME },
    // Interior (portal cells)
    { dr: 1, dc: 1, type: BLOCK.NETHER_PORTAL },
    { dr: 1, dc: 2, type: BLOCK.NETHER_PORTAL },
    { dr: 2, dc: 1, type: BLOCK.NETHER_PORTAL },
    { dr: 2, dc: 2, type: BLOCK.NETHER_PORTAL },
    { dr: 3, dc: 1, type: BLOCK.NETHER_PORTAL },
    { dr: 3, dc: 2, type: BLOCK.NETHER_PORTAL },
  ],
  // End Portal (5 wide × 3 tall): 5 frame blocks on top + obsidian structure
  // Layout: F=END_PORTAL_FRAME (empty), O=OBSIDIAN
  //   FFFFF  row 0  ← frame blocks (Eyes of Ender go here to activate)
  //   OOOOO  row 1  ← all solid; middle 3 become END_PORTAL on activation
  //   OOOOO  row 2  ← solid obsidian base (player stands on top)
  [SB_END_PORTAL]: [
    // Row 0: 5 End Portal Frame blocks (need Eye of Ender in each to activate)
    { dr: 0, dc: 0, type: BLOCK.END_PORTAL_FRAME },
    { dr: 0, dc: 1, type: BLOCK.END_PORTAL_FRAME },
    { dr: 0, dc: 2, type: BLOCK.END_PORTAL_FRAME },
    { dr: 0, dc: 3, type: BLOCK.END_PORTAL_FRAME },
    { dr: 0, dc: 4, type: BLOCK.END_PORTAL_FRAME },
    // Row 1: 5 obsidian blocks (middle 3 become END_PORTAL on activation)
    { dr: 1, dc: 0, type: BLOCK.OBSIDIAN },
    { dr: 1, dc: 1, type: BLOCK.OBSIDIAN },
    { dr: 1, dc: 2, type: BLOCK.OBSIDIAN },
    { dr: 1, dc: 3, type: BLOCK.OBSIDIAN },
    { dr: 1, dc: 4, type: BLOCK.OBSIDIAN },
    // Row 2: solid obsidian base
    { dr: 2, dc: 0, type: BLOCK.OBSIDIAN },
    { dr: 2, dc: 1, type: BLOCK.OBSIDIAN },
    { dr: 2, dc: 2, type: BLOCK.OBSIDIAN },
    { dr: 2, dc: 3, type: BLOCK.OBSIDIAN },
    { dr: 2, dc: 4, type: BLOCK.OBSIDIAN },
  ],
  // Ruined portal — only places obsidian blocks; gaps (M) and interior (P) remain AIR
  // Layout (5 rows × 4 cols): M=gap, P=portal interior, O=frame obsidian, S=solid obsidian
  //   MMMO  row 0
  //   MPPO  row 1
  //   OPPO  row 2
  //   OPPO  row 3
  //   SSSS  row 4
  [SB_RUINED_PORTAL]: [
    { dr: 0, dc: 3, type: BLOCK.OBSIDIAN },  // O (0,3)
    { dr: 1, dc: 3, type: BLOCK.OBSIDIAN },  // O (1,3)
    { dr: 2, dc: 0, type: BLOCK.OBSIDIAN },  // O (2,0)
    { dr: 2, dc: 3, type: BLOCK.OBSIDIAN },  // O (2,3)
    { dr: 3, dc: 0, type: BLOCK.OBSIDIAN },  // O (3,0)
    { dr: 3, dc: 3, type: BLOCK.OBSIDIAN },  // O (3,3)
    { dr: 4, dc: 0, type: BLOCK.OBSIDIAN },  // S (4,0)
    { dr: 4, dc: 1, type: BLOCK.OBSIDIAN },  // S (4,1)
    { dr: 4, dc: 2, type: BLOCK.OBSIDIAN },  // S (4,2)
    { dr: 4, dc: 3, type: BLOCK.OBSIDIAN },  // S (4,3)
  ],
  // Wither Altar (3 wide × 4 tall):
  // Row 0: [WS][WS][WS]  ← Wither Skull Slots (3 needed)
  // Row 1: [SS][SS][SS]   ← Soul Sand Slots (3)
  // Row 2: [ ][SS][ ]     ← Soul Sand Slot (1 more)
  // Row 3: [AB][AB][AB]   ← Altar Blocks (decorative, auto-placed)
  [SB_WITHER_ALTAR]: [
    { dr: 0, dc: 0, type: BLOCK.WITHER_SKULL_SLOT },
    { dr: 0, dc: 1, type: BLOCK.WITHER_SKULL_SLOT },
    { dr: 0, dc: 2, type: BLOCK.WITHER_SKULL_SLOT },
    { dr: 1, dc: 0, type: BLOCK.SOUL_SAND_SLOT },
    { dr: 1, dc: 1, type: BLOCK.SOUL_SAND_SLOT },
    { dr: 1, dc: 2, type: BLOCK.SOUL_SAND_SLOT },
    { dr: 2, dc: 1, type: BLOCK.SOUL_SAND_SLOT },
    { dr: 3, dc: 0, type: BLOCK.ALTAR_BLOCK },
    { dr: 3, dc: 1, type: BLOCK.ALTAR_BLOCK },
    { dr: 3, dc: 2, type: BLOCK.ALTAR_BLOCK },
  ],
};

// Hotbar constants (8 slots, same size/position as normal hotbar)
const SB_SLOTS     = 8;
const SB_SLOT_SIZE = 46;
const SB_SLOT_GAP  = 3;
const SB_HOTBAR_Y  = CANVAS_H - SB_SLOT_SIZE - 10;
const SB_HOTBAR_X  = (CANVAS_W - (SB_SLOTS * SB_SLOT_SIZE + (SB_SLOTS - 1) * SB_SLOT_GAP)) / 2;

// Brush size buttons — sit to the right of the hotbar
const SB_BRUSH_SIZES = [1, 2, 4];
const SB_BRUSH_BTN_W = 34;
const SB_BRUSH_BTN_H = SB_SLOT_SIZE;
const SB_BRUSH_BTN_X = SB_HOTBAR_X + SB_SLOTS * (SB_SLOT_SIZE + SB_SLOT_GAP) + 6;
const SB_BRUSH_BTN_Y = SB_HOTBAR_Y;

class SandboxManager {
  constructor() {
    // Current brush
    this.selectedBlock         = BLOCK.GRASS;
    this.selectedEggKey        = null;   // non-null → placing spawn eggs
    this.selectedToolKey       = null;   // non-null → placing weapon/tool drops
    this.selectedDust          = false;  // true → placing redstone dust overlay
    this.selectedGateType      = null;   // null | 'not' | 'and'
    this.selectedBlockItemType  = null;  // non-null → placing block-item stacks
    this.selectedBlockItemCount = 20;   // default stack size for block items
    this.selectedEmerald       = false; // true → placing emeralds (Phase 3A.2)
    this.selectedPowerup       = false; // true → placing power-ups (Phase 3A.2)
    this.selectedHill          = false; // true → placing the King-of-the-Hill platform (Phase 3A.3)
    this.selectedSpawnLine     = false; // true → placing survival-wave spawn markers (Phase 3A.3)
    this.lastEmeraldGroup      = 1;     // 1–3, drives new-emerald group
    this.lastSpawnLineNum      = 1;     // 1–4, drives new spawn-marker line
    this.brushSize             = 1;     // 1 | 2 | 4

    // Quick-access hotbar (8 block slots)
    this.sbHotbar    = Array(SB_SLOTS).fill(null);
    this.sbHotbarSel = 0;
    this.sbHotbar[0] = { kind: 'block', value: BLOCK.GRASS };   // seed first slot

    // Palette panel
    this.paletteOpen = false;
    this.paletteTab  = 'overworld';  // 'overworld'|'nether'|'gear'|'other'
    this.paletteScroll = 0;          // px scroll offset for the item grid (tabs can overflow)

    // Placed spawn eggs: [{col,row,wx,wy,mobType}]
    this.placedEggs = [];

    // Placed weapon/tool drops: [{col,row,wx,wy,toolKey,bobOffset}]
    this.placedItems = [];

    // Arena collectibles (Phase 3A.2)
    this.placedEmeralds = []; // [{col,row,wx,wy,group}]
    this.placedPowerups = []; // [{col,row,wx,wy,powerType}]
    // Arena objectives (Phase 3A.3)
    this.placedSpawnLines = []; // [{col,row,wx,wy,line}] survival-wave spawn markers
    this.placedHill       = null; // {col,row,w,h} King-of-the-Hill control zone (default 4×1)
    this.lastHillW        = 4;     // default/last hill width  (1–20 blocks)
    this.lastHillH        = 1;     // default/last hill height (1–20 blocks)
    // Player spawn points (Phase 3) — [{col,row,wx,wy,slot}]; slot 1–4 assigns which
    // player starts here (arena). Story/Sandbox/etc. use slot 1 only. Movable + deletable.
    this.placedSpawnPoints = [];
    this.lastSpawnPointSlot = 1;
    // Arena objects (Phase 3 v3): [{ type:'base'|'tower'|'heal', col,row,wx,wy, team, slot }]
    this.placedArenaObjs = [];
    this.selectedArenaObj = null; // 'base' | 'tower' | 'heal' | null

    // Config popup for a placed egg / item drop
    this.popup = null; // { kind:'egg'|'item', eggIdx|itemIdx } or null

    // Sandbox portal registry (numbered = overworld/cave, lettered = nether)
    this.sandboxPortals  = [];   // [{ id, label, biome, anchorRow, anchorCol, destId }]
    this._nextPortalId   = 1;
    this.portalPopup     = null; // { portalId } or null
  }

  get isEggSelected()       { return this.selectedEggKey       !== null; }
  get isToolSelected()      { return this.selectedToolKey      !== null; }
  get isDustSelected()      { return this.selectedDust; }
  get isGateSelected()      { return this.selectedGateType     !== null; }
  get isBlockItemSelected() { return this.selectedBlockItemType !== null; }
  get isEmeraldSelected()   { return this.selectedEmerald; }
  get isPowerupSelected()   { return this.selectedPowerup; }
  get isHillSelected()      { return this.selectedHill; }
  get isSpawnLineSelected() { return this.selectedSpawnLine; }
  get isSpawnPointSelected() { return this.selectedSpawnPoint; }
  get isArenaObjSelected()   { return this.selectedArenaObj !== null; }

  // Returns a hotbar entry object representing the current selection.
  _currentSelectionEntry() {
    if (this.isBlockItemSelected) return { kind: 'blockItem', value: this.selectedBlockItemType, count: this.selectedBlockItemCount };
    if (this.isToolSelected)      return { kind: 'tool',      value: this.selectedToolKey };
    if (this.isEggSelected)       return { kind: 'egg',       value: this.selectedEggKey  };
    if (this.isEmeraldSelected)   return { kind: 'emerald',   value: 'emerald' };
    if (this.isPowerupSelected)   return { kind: 'powerup',   value: 'powerup' };
    if (this.isHillSelected)      return { kind: 'hill',      value: 'hill' };
    if (this.isSpawnLineSelected) return { kind: 'spawnline', value: 'spawnline' };
    if (this.isSpawnPointSelected) return { kind: 'spawnpoint', value: 'spawnpoint' };
    if (this.isArenaObjSelected)   return { kind: 'arenaobj', value: this.selectedArenaObj };
    if (this.isDustSelected)      return { kind: 'dust',      value: 'dust' };
    if (this.isGateSelected)      return { kind: 'gate',      value: this.selectedGateType };
    return { kind: 'block', value: this.selectedBlock };
  }

  // Apply a stored hotbar entry to the active selection fields.
  _applyHotbarEntry(entry) {
    if (!entry) return;
    this.selectedDust          = false;
    this.selectedGateType      = null;
    this.selectedBlockItemType = null;
    this.selectedEmerald       = false;
    this.selectedPowerup       = false;
    this.selectedHill          = false;
    this.selectedSpawnLine     = false;
    this.selectedSpawnPoint    = false;
    this.selectedArenaObj      = null;
    if (entry.kind === 'arenaobj') {
      this.selectedArenaObj = entry.value;
      this.selectedEggKey   = null;
      this.selectedToolKey  = null;
      return;
    }
    if (entry.kind === 'emerald') {
      this.selectedEmerald = true;
      this.selectedEggKey  = null;
      this.selectedToolKey = null;
      return;
    }
    if (entry.kind === 'powerup') {
      this.selectedPowerup = true;
      this.selectedEggKey  = null;
      this.selectedToolKey = null;
      return;
    }
    if (entry.kind === 'hill') {
      this.selectedHill    = true;
      this.selectedEggKey  = null;
      this.selectedToolKey = null;
      return;
    }
    if (entry.kind === 'spawnline') {
      this.selectedSpawnLine = true;
      this.selectedEggKey    = null;
      this.selectedToolKey   = null;
      return;
    }
    if (entry.kind === 'spawnpoint') {
      this.selectedSpawnPoint = true;
      this.selectedEggKey     = null;
      this.selectedToolKey    = null;
      return;
    }
    if (entry.kind === 'block') {
      this.selectedBlock   = entry.value;
      this.selectedEggKey  = null;
      this.selectedToolKey = null;
    } else if (entry.kind === 'egg') {
      this.selectedEggKey  = entry.value;
      this.selectedToolKey = null;
    } else if (entry.kind === 'tool') {
      this.selectedToolKey = entry.value;
      this.selectedEggKey  = null;
    } else if (entry.kind === 'dust') {
      this.selectedDust    = true;
      this.selectedEggKey  = null;
      this.selectedToolKey = null;
    } else if (entry.kind === 'gate') {
      this.selectedGateType = entry.value;
      this.selectedEggKey   = null;
      this.selectedToolKey  = null;
    } else if (entry.kind === 'blockItem') {
      this.selectedBlockItemType  = entry.value;
      this.selectedBlockItemCount = entry.count ?? 20;
      this.selectedEggKey  = null;
      this.selectedToolKey = null;
    }
  }

  get isMultiBlock() {
    return !this.isEggSelected && !this.isToolSelected && !this.isDustSelected &&
           !this.isGateSelected && !this.isBlockItemSelected &&
           !this.isEmeraldSelected && !this.isPowerupSelected && !!SB_MULTI_FOOTPRINT[this.selectedBlock];
  }

  // Returns array of {r, c, type} for the current multi-block item, or null.
  getFootprint(anchorRow, anchorCol) {
    const template = SB_MULTI_FOOTPRINT[this.selectedBlock];
    if (!template) return null;
    return template.map(({ dr, dc, type }) => ({
      r: anchorRow + dr, c: anchorCol + dc, type,
    }));
  }

  // ── Palette toggle ───────────────────────────────────────────

  togglePalette() {
    this.paletteOpen = !this.paletteOpen;
    if (!this.paletteOpen) this.popup = null;
  }

  // ── Hotbar helpers ────────────────────────────────────────────

  selectHotbarSlot(i) {
    this.sbHotbarSel = Math.max(0, Math.min(SB_SLOTS - 1, i));
    this._applyHotbarEntry(this.sbHotbar[this.sbHotbarSel]);
  }

  // ── Brush size ────────────────────────────────────────────────

  setBrushSize(n) { this.brushSize = n; }

  cycleBrushSize(dir) {
    const idx = SB_BRUSH_SIZES.indexOf(this.brushSize);
    this.brushSize = SB_BRUSH_SIZES[(idx + dir + SB_BRUSH_SIZES.length) % SB_BRUSH_SIZES.length];
  }

  // True when brush > 1 should affect block placement/removal
  get isBrushApplicable() {
    if (this.isEggSelected || this.isToolSelected || this.isDustSelected || this.isGateSelected || this.isBlockItemSelected) return false;
    if (this.isMultiBlock) return false;
    const sb = this.selectedBlock;
    return sb !== BLOCK.LEVER     && sb !== BLOCK.TRAPDOOR      && sb !== BLOCK.PRESSURE_PLATE &&
           sb !== BLOCK.TNT       && sb !== BLOCK.TRANSMITTER   && sb !== BLOCK.RECEIVER       &&
           sb !== BLOCK.CHEST     && sb !== BLOCK.PISTON_BODY   && sb !== BLOCK.GOAL          &&
           sb !== BLOCK.EYE_OF_ENDER;
  }

  // Returns true when click hits a brush button and sets the new size
  handleBrushClick(mx, my, clicked) {
    for (let i = 0; i < SB_BRUSH_SIZES.length; i++) {
      const bx = SB_BRUSH_BTN_X + i * (SB_BRUSH_BTN_W + 3);
      if (mx >= bx && mx < bx + SB_BRUSH_BTN_W &&
          my >= SB_BRUSH_BTN_Y && my < SB_BRUSH_BTN_Y + SB_BRUSH_BTN_H) {
        if (clicked) this.brushSize = SB_BRUSH_SIZES[i];
        return clicked;
      }
    }
    return false;
  }

  // Returns true if (mx,my) is inside the hotbar and handled the click
  handleHotbarClick(mx, my, leftClicked, rightClicked) {
    if (!leftClicked && !rightClicked) return false;
    for (let i = 0; i < SB_SLOTS; i++) {
      const sx = SB_HOTBAR_X + i * (SB_SLOT_SIZE + SB_SLOT_GAP);
      if (mx >= sx && mx < sx + SB_SLOT_SIZE &&
          my >= SB_HOTBAR_Y && my < SB_HOTBAR_Y + SB_SLOT_SIZE) {
        if (rightClicked) {
          this.sbHotbar[i] = null;
        } else {
          this.sbHotbarSel = i;
          this._applyHotbarEntry(this.sbHotbar[i]);
        }
        return true;
      }
    }
    return false;
  }

  // ── Egg management ───────────────────────────────────────────

  hitTestEggs(wx, wy) {
    const R = 18;
    for (let i = 0; i < this.placedEggs.length; i++) {
      const e = this.placedEggs[i];
      if (Math.abs(wx - e.wx) < R && Math.abs(wy - e.wy) < R) return i;
    }
    return -1;
  }

  placeEgg(wx, wy) {
    const col = Math.floor(wx / BLOCK_SIZE);
    const row = Math.floor(wy / BLOCK_SIZE);
    if (this.placedEggs.some(e => e.col === col && e.row === row)) return;
    this.placedEggs.push({
      col, row,
      wx: col * BLOCK_SIZE + BLOCK_SIZE / 2,
      wy: row * BLOCK_SIZE + BLOCK_SIZE / 2,
      mobType: this.selectedEggKey,
      // Phase 3A.2 — per-spawner arena tuning (mobs per 10s + active cap).
      spawnFrequency: 2,
      maxActiveMobs:  3,
    });
  }

  openPopup(eggIdx)       { this.popup = { kind: 'egg',  eggIdx  }; }
  openItemPopup(itemIdx)  { this.popup = { kind: 'item', itemIdx }; }
  closePopup()            { this.popup = null; }

  cycleEggType(idx) {
    if (idx < 0 || idx >= this.placedEggs.length) return;
    const keys = SPAWN_EGG_DEFS.map(d => d.key);
    const cur  = keys.indexOf(this.placedEggs[idx].mobType);
    this.placedEggs[idx].mobType = keys[(cur + 1) % keys.length];
  }

  removeEgg(idx) {
    if (idx >= 0 && idx < this.placedEggs.length) this.placedEggs.splice(idx, 1);
    this.popup = null;
  }

  // ── Arena collectibles (Phase 3A.2) ─────────────────────────
  placeEmerald(wx, wy) {
    const col = Math.floor(wx / BLOCK_SIZE), row = Math.floor(wy / BLOCK_SIZE);
    if (this.placedEmeralds.some(e => e.col === col && e.row === row)) return;
    // Phase 3A.3 — emerald GROUP (1–3). New emeralds inherit the last-used group;
    // change per-emerald via the popup. Group cycling drives Collect-Emeralds rounds.
    this.placedEmeralds.push({ col, row, wx: col * BLOCK_SIZE + BLOCK_SIZE / 2, wy: row * BLOCK_SIZE + BLOCK_SIZE / 2, group: this.lastEmeraldGroup || 1 });
  }
  placePowerup(wx, wy) {
    const col = Math.floor(wx / BLOCK_SIZE), row = Math.floor(wy / BLOCK_SIZE);
    if (this.placedPowerups.some(p => p.col === col && p.row === row)) return;
    this.placedPowerups.push({ col, row, wx: col * BLOCK_SIZE + BLOCK_SIZE / 2, wy: row * BLOCK_SIZE + BLOCK_SIZE / 2, powerType: 'HEALTH' });
  }
  hitTestEmeralds(wx, wy) {
    const R = 16;
    for (let i = 0; i < this.placedEmeralds.length; i++) {
      const e = this.placedEmeralds[i];
      if (Math.abs(wx - e.wx) < R && Math.abs(wy - e.wy) < R) return i;
    }
    return -1;
  }
  hitTestPowerups(wx, wy) {
    const R = 16;
    for (let i = 0; i < this.placedPowerups.length; i++) {
      const p = this.placedPowerups[i];
      if (Math.abs(wx - p.wx) < R && Math.abs(wy - p.wy) < R) return i;
    }
    return -1;
  }
  cyclePowerupType(idx) {
    if (idx < 0 || idx >= this.placedPowerups.length) return;
    const types = SB_POWERUP_TYPES.map(t => t.type);
    const cur   = types.indexOf(this.placedPowerups[idx].powerType);
    this.placedPowerups[idx].powerType = types[(cur + 1) % types.length];
  }
  cycleEmeraldGroup(idx) {
    if (idx < 0 || idx >= this.placedEmeralds.length) return;
    const g = ((this.placedEmeralds[idx].group || 1) % 3) + 1; // 1→2→3→1
    this.placedEmeralds[idx].group = g;
    this.lastEmeraldGroup = g; // new emeralds default to the last group you set
  }
  removeEmerald(idx) { if (idx >= 0 && idx < this.placedEmeralds.length) this.placedEmeralds.splice(idx, 1); this.popup = null; }
  removePowerup(idx) { if (idx >= 0 && idx < this.placedPowerups.length) this.placedPowerups.splice(idx, 1); this.popup = null; }

  // ── Hill (King of the Hill) — single 4-wide platform anchor (Phase 3A.3) ──
  placeHill(wx, wy) {
    const col = Math.floor(wx / BLOCK_SIZE), row = Math.floor(wy / BLOCK_SIZE);
    // Resizable W×H control zone (Phase 3A.3); inherits the last-used size.
    this.placedHill = { col, row, w: this.lastHillW || 4, h: this.lastHillH || 1 };
  }
  // True if (wx,wy) hits anywhere in the placed W×H hill zone.
  hitTestHill(wx, wy) {
    if (!this.placedHill) return false;
    const col = Math.floor(wx / BLOCK_SIZE), row = Math.floor(wy / BLOCK_SIZE);
    const H = this.placedHill;
    return col >= H.col && col <= H.col + (H.w || 4) - 1 && row >= H.row && row <= H.row + (H.h || 1) - 1;
  }
  resizeHill(dw, dh) {
    if (!this.placedHill) return;
    this.placedHill.w = Math.max(1, Math.min(20, (this.placedHill.w || 4) + dw));
    this.placedHill.h = Math.max(1, Math.min(20, (this.placedHill.h || 1) + dh));
    this.lastHillW = this.placedHill.w; this.lastHillH = this.placedHill.h;
  }
  removeHill() { this.placedHill = null; this.popup = null; }
  openHillPopup() { this.popup = { kind: 'hill' }; }

  // ── Spawn Lines — survival-wave spawn markers, tagged by line 1–4 (Phase 3A.3) ──
  placeSpawnLine(wx, wy) {
    const col = Math.floor(wx / BLOCK_SIZE), row = Math.floor(wy / BLOCK_SIZE);
    if (this.placedSpawnLines.some(s => s.col === col && s.row === row)) return;
    this.placedSpawnLines.push({ col, row, wx: col * BLOCK_SIZE + BLOCK_SIZE / 2, wy: row * BLOCK_SIZE + BLOCK_SIZE / 2, line: this.lastSpawnLineNum || 1 });
  }
  hitTestSpawnLines(wx, wy) {
    const R = 16;
    for (let i = 0; i < this.placedSpawnLines.length; i++) {
      const s = this.placedSpawnLines[i];
      if (Math.abs(wx - s.wx) < R && Math.abs(wy - s.wy) < R) return i;
    }
    return -1;
  }
  cycleSpawnLineNum(idx) {
    if (idx < 0 || idx >= this.placedSpawnLines.length) return;
    const n = ((this.placedSpawnLines[idx].line || 1) % 4) + 1; // 1→2→3→4→1
    this.placedSpawnLines[idx].line = n;
    this.lastSpawnLineNum = n;
  }
  removeSpawnLine(idx) { if (idx >= 0 && idx < this.placedSpawnLines.length) this.placedSpawnLines.splice(idx, 1); this.popup = null; }
  openSpawnLinePopup(idx) { this.popup = { kind: 'spawnline', spawnLineIdx: idx }; }

  // ── Player Spawn Points — where players start, tagged by slot 1–4 (Phase 3) ──
  // Distinct from Survival "Spawn Lines" (which spawn mobs). Arena assigns each
  // connected player to a distinct slot; Story/Sandbox/etc. use slot 1 only.
  placeSpawnPoint(wx, wy) {
    const col = Math.floor(wx / BLOCK_SIZE), row = Math.floor(wy / BLOCK_SIZE);
    if (this.placedSpawnPoints.some(s => s.col === col && s.row === row)) return;
    if (this.placedSpawnPoints.length >= 4) return; // cap at 4 (MAX_PLAYERS)
    // Default the new point to the lowest slot number not yet used (1..4).
    const used = new Set(this.placedSpawnPoints.map(s => s.slot));
    let slot = 1; while (slot <= 4 && used.has(slot)) slot++;
    if (slot > 4) slot = this.lastSpawnPointSlot || 1;
    this.placedSpawnPoints.push({ col, row, wx: col * BLOCK_SIZE + BLOCK_SIZE / 2, wy: row * BLOCK_SIZE + BLOCK_SIZE / 2, slot });
    this.lastSpawnPointSlot = slot;
  }
  hitTestSpawnPoints(wx, wy) {
    const R = 16;
    for (let i = 0; i < this.placedSpawnPoints.length; i++) {
      const s = this.placedSpawnPoints[i];
      if (Math.abs(wx - s.wx) < R && Math.abs(wy - s.wy) < R) return i;
    }
    return -1;
  }
  cycleSpawnPointSlot(idx) {
    if (idx < 0 || idx >= this.placedSpawnPoints.length) return;
    const n = ((this.placedSpawnPoints[idx].slot || 1) % 4) + 1; // 1→2→3→4→1
    this.placedSpawnPoints[idx].slot = n;
    this.lastSpawnPointSlot = n;
  }
  removeSpawnPoint(idx) { if (idx >= 0 && idx < this.placedSpawnPoints.length) this.placedSpawnPoints.splice(idx, 1); this.popup = null; }
  openSpawnPointPopup(idx) { this.popup = { kind: 'spawnpoint', spawnPointIdx: idx }; }
  // Number of distinct players this world can currently host (placed spawn points, capped 4).
  supportedPlayerCount() { return Math.min(4, this.placedSpawnPoints.length); }

  // ── Arena objects (Phase 3 v3): CTF Base / Tower / Heal Tower ──────────────
  placeArenaObj(type, wx, wy) {
    const col = Math.floor(wx / BLOCK_SIZE), row = Math.floor(wy / BLOCK_SIZE);
    if (this.placedArenaObjs.some(o => o.type === type && o.col === col && o.row === row)) return;
    if (type === 'base'  && this.placedArenaObjs.filter(o => o.type === 'base').length  >= 2) return; // 2 teams
    if (type === 'tower' && this.placedArenaObjs.filter(o => o.type === 'tower').length >= 4) return; // up to 4
    const obj = { type, col, row, wx: col * BLOCK_SIZE + BLOCK_SIZE / 2, wy: row * BLOCK_SIZE + BLOCK_SIZE / 2 };
    if (type === 'base') { const used = new Set(this.placedArenaObjs.filter(o => o.type === 'base').map(o => o.team)); obj.team = used.has(0) ? 1 : 0; }
    if (type === 'tower') { const used = new Set(this.placedArenaObjs.filter(o => o.type === 'tower').map(o => o.slot)); let s = 1; while (s <= 4 && used.has(s)) s++; obj.slot = s > 4 ? 1 : s; }
    this.placedArenaObjs.push(obj);
  }
  hitTestArenaObjs(wx, wy) {
    const R = 18;
    for (let i = 0; i < this.placedArenaObjs.length; i++) {
      const o = this.placedArenaObjs[i];
      if (Math.abs(wx - o.wx) < R && Math.abs(wy - o.wy) < R) return i;
    }
    return -1;
  }
  cycleArenaObj(idx) {
    const o = this.placedArenaObjs[idx]; if (!o) return;
    if (o.type === 'base')  o.team = (o.team === 0) ? 1 : 0;     // Red ↔ Blue
    if (o.type === 'tower') o.slot = ((o.slot || 1) % 4) + 1;    // owner 1→2→3→4→1
  }
  removeArenaObj(idx) { if (idx >= 0 && idx < this.placedArenaObjs.length) this.placedArenaObjs.splice(idx, 1); this.popup = null; }
  openArenaObjPopup(idx) { this.popup = { kind: 'arenaobj', arenaObjIdx: idx }; }
  openEmeraldPopup(idx) { this.popup = { kind: 'emerald', emeraldIdx: idx }; }
  openPowerupPopup(idx) { this.popup = { kind: 'powerup', powerupIdx: idx }; }

  // ── Placed item drops (weapons / tools) ─────────────────────

  placeItem(wx, wy) {
    const col = Math.floor(wx / BLOCK_SIZE);
    const row = Math.floor(wy / BLOCK_SIZE);
    if (this.placedItems.some(it => it.col === col && it.row === row)) return;
    if (this.isBlockItemSelected) {
      this.placedItems.push({
        col, row,
        wx:        col * BLOCK_SIZE + BLOCK_SIZE / 2,
        wy:        row * BLOCK_SIZE + BLOCK_SIZE / 2,
        blockType: this.selectedBlockItemType,
        count:     this.selectedBlockItemCount,
        toolKey:   null,
        bobOffset: Math.random() * Math.PI * 2,
        vy:        0,
      });
    } else {
      this.placedItems.push({
        col, row,
        wx:        col * BLOCK_SIZE + BLOCK_SIZE / 2,
        wy:        row * BLOCK_SIZE + BLOCK_SIZE / 2,
        toolKey:   this.selectedToolKey,
        blockType: null,
        bobOffset: Math.random() * Math.PI * 2,
        vy:        0,
      });
    }
  }

  hitTestItems(wx, wy) {
    const R = 18;
    for (let i = 0; i < this.placedItems.length; i++) {
      const it = this.placedItems[i];
      if (Math.abs(wx - it.wx) < R && Math.abs(wy - it.wy) < R) return i;
    }
    return -1;
  }

  removeItem(idx) {
    if (idx >= 0 && idx < this.placedItems.length) this.placedItems.splice(idx, 1);
    this.popup = null;
  }

  // ── Sandbox portal registry ───────────────────────────────────

  // Create a new portal entry with an auto-assigned label.
  // biome: 'overworld' (plains+cave, numbered 1,2,3…) | 'nether' (lettered A,B,C…)
  // ruined: true for ruined nether portals (affects popup UI)
  registerPortal(anchorRow, anchorCol, biome, ruined = false) {
    const isNether = biome === 'nether';
    const used = new Set(
      this.sandboxPortals.filter(p => p.biome === biome).map(p => p.label)
    );
    let label;
    if (isNether) {
      label = 'A';
      for (let i = 0; i < 26; i++) {
        const l = String.fromCharCode(65 + i);
        if (!used.has(l)) { label = l; break; }
      }
    } else {
      let n = 1;
      while (used.has(String(n))) n++;
      label = String(n);
    }
    const entry = { id: this._nextPortalId++, label, biome, anchorRow, anchorCol, destId: null, ruined: !!ruined };
    this.sandboxPortals.push(entry);
    return entry;
  }

  // Restore a saved portal with explicit label (used on world load).
  _restorePortal(anchorRow, anchorCol, biome, label, ruined = false) {
    const entry = { id: this._nextPortalId++, label, biome, anchorRow, anchorCol, destId: null, ruined: !!ruined };
    this.sandboxPortals.push(entry);
    return entry;
  }

  // Remove portal from registry and clear any incoming links.
  unregisterPortal(anchorRow, anchorCol) {
    const idx = this.sandboxPortals.findIndex(
      p => p.anchorRow === anchorRow && p.anchorCol === anchorCol
    );
    if (idx < 0) return;
    const removedId = this.sandboxPortals[idx].id;
    this.sandboxPortals.splice(idx, 1);
    for (const p of this.sandboxPortals) {
      if (p.destId === removedId) p.destId = null;
    }
    if (this.portalPopup?.portalId === removedId) this.portalPopup = null;
  }

  // Find which registered portal contains a given grid cell (if any).
  findPortalAtCell(row, col) {
    for (const p of this.sandboxPortals) {
      if (row >= p.anchorRow && row <= p.anchorRow + 4 &&
          col >= p.anchorCol && col <= p.anchorCol + 3) return p;
    }
    return null;
  }

  findPortalById(id) {
    return this.sandboxPortals.find(p => p.id === id) ?? null;
  }

  openPortalPopup(portalId) {
    this.popup = null; // close egg/item popup
    this.portalPopup = { portalId };
  }

  closePortalPopup() { this.portalPopup = null; }

  setPortalDest(fromId, toId) {
    const p = this.findPortalById(fromId);
    if (p) p.destId = toId;
  }

  // Returns null normally, or 'remove' when the remove-portal button is clicked.
  handlePortalPopupClick(mx, my, clicked) {
    if (!clicked || !this.portalPopup) return null;
    const { px, py, pw, ph } = this._portalPopupLayout();
    const portal = this.findPortalById(this.portalPopup.portalId);
    if (!portal) { this.closePortalPopup(); return null; }

    // X close button
    if (mx >= px + pw - 26 && mx <= px + pw - 6 && my >= py + 6 && my <= py + 26) {
      this.closePortalPopup(); return null;
    }

    // Click outside → close
    if (mx < px || mx > px + pw || my < py || my > py + ph) {
      this.closePortalPopup(); return null;
    }

    // Destination buttons grid
    const opposites = this.sandboxPortals.filter(p => p.biome !== portal.biome);
    const btnSz = 36, btnGap = 4, perRow = 8;
    const gridX = px + 12, gridY = py + 66;
    for (let i = 0; i < opposites.length; i++) {
      const bx = gridX + (i % perRow) * (btnSz + btnGap);
      const by = gridY + Math.floor(i / perRow) * (btnSz + btnGap);
      if (mx >= bx && mx <= bx + btnSz && my >= by && my <= by + btnSz) {
        // Toggle: click selected → unlink; click other → link
        this.setPortalDest(portal.id, portal.destId === opposites[i].id ? null : opposites[i].id);
        this.portalPopup.confirmDelete = false; // any other interaction cancels a pending delete
        return null;
      }
    }

    // Remove/delete button — two-click confirm (works for normal AND ruined portals).
    const removeY = py + ph - 52;
    if (mx >= px + 12 && mx <= px + pw - 12 && my >= removeY && my <= removeY + 32) {
      if (!this.portalPopup.confirmDelete) { this.portalPopup.confirmDelete = true; return null; }
      return 'remove';
    }

    this.portalPopup.confirmDelete = false; // click elsewhere in the panel cancels the confirm
    return null; // inside panel but no action target
  }

  // ── Click handling (called from game._update) ────────────────

  // Returns true if click was consumed by palette
  handlePaletteClick(mx, my, clicked) {
    if (!this.paletteOpen || !clicked) return false;

    // ── Hotbar slots remain interactive while palette is open ───
    if (my >= SB_HOTBAR_Y && my < SB_HOTBAR_Y + SB_SLOT_SIZE) {
      for (let i = 0; i < SB_SLOTS; i++) {
        const sx = SB_HOTBAR_X + i * (SB_SLOT_SIZE + SB_SLOT_GAP);
        if (mx >= sx && mx < sx + SB_SLOT_SIZE) {
          // Assign currently selected item to this slot and make it active
          this.sbHotbarSel = i;
          this.sbHotbar[i] = this._currentSelectionEntry();
          return true;
        }
      }
    }

    const { px, py, pw, ph } = this._paletteLayout();

    // ── X close button (top-right of panel) ────────────────────
    if (mx >= px + pw - 26 && mx <= px + pw - 6 && my >= py + 6 && my <= py + 26) {
      this.paletteOpen = false;
      return true;
    }

    // Outside panel → close
    if (mx < px || mx > px + pw || my < py || my > py + ph) {
      this.paletteOpen = false;
      return false;
    }

    // Tab row
    const TABS = ['overworld', 'nether', 'gear', 'other'];
    const tg = this._paletteTabGeom();
    for (let i = 0; i < TABS.length; i++) {
      const tx = tg.x0 + i * tg.tabW;
      if (mx >= tx && mx <= tx + (tg.tabW - tg.gap) && my >= tg.y && my <= tg.y + tg.h) {
        this.paletteTab = TABS[i];
        this.paletteScroll = 0; // reset scroll when switching tabs
        return true;
      }
    }

    // Block / egg / tool grid (scroll-aware — mirrors _drawPalette geometry)
    const geom = this._paletteGridGeom();
    const gridTop = geom.gridTop, gridBottom = geom.gridBottom, slotSz = geom.slotSz, startX = geom.startX, cols = geom.cols;
    const isSpecial = this.paletteTab === 'other' || this.paletteTab === 'gear';
    const items  = this._paletteItems();
    const maxScroll = Math.max(0, Math.ceil(items.length / cols) * slotSz - (gridBottom - gridTop));
    const scroll = Math.max(0, Math.min(this.paletteScroll, maxScroll));

    for (let i = 0; i < items.length; i++) {
      const gx = startX + (i % cols) * slotSz;
      const gy = gridTop + Math.floor(i / cols) * slotSz - scroll;
      if (gy + slotSz - 2 < gridTop || gy > gridBottom) continue; // off-screen — not clickable
      if (mx >= gx && mx <= gx + slotSz - 2 && my >= gy && my <= gy + slotSz - 2) {
        if (isSpecial) {
          const item = items[i];
          this.selectedDust     = false;
          this.selectedGateType = null;
          this.selectedEmerald  = false;
          this.selectedPowerup  = false;
          this.selectedHill     = false;
          this.selectedSpawnLine = false;
          this.selectedSpawnPoint = false;
          this.selectedArenaObj = null;
          if (item.kind === 'arenaobj') {
            this.selectedArenaObj = item.obj;
            this.selectedEggKey    = null;
            this.selectedToolKey   = null;
            this.selectedBlockItemType = null;
          } else if (item.kind === 'emerald') {
            this.selectedEmerald = true;
            this.selectedEggKey  = null;
            this.selectedToolKey = null;
            this.selectedBlockItemType = null;
          } else if (item.kind === 'powerup') {
            this.selectedPowerup = true;
            this.selectedEggKey  = null;
            this.selectedToolKey = null;
            this.selectedBlockItemType = null;
          } else if (item.kind === 'hill') {
            this.selectedHill    = true;
            this.selectedEggKey  = null;
            this.selectedToolKey = null;
            this.selectedBlockItemType = null;
          } else if (item.kind === 'spawnline') {
            this.selectedSpawnLine = true;
            this.selectedEggKey    = null;
            this.selectedToolKey   = null;
            this.selectedBlockItemType = null;
          } else if (item.kind === 'spawnpoint') {
            this.selectedSpawnPoint = true;
            this.selectedEggKey    = null;
            this.selectedToolKey   = null;
            this.selectedBlockItemType = null;
          } else if (item.kind === 'tool') {
            this.selectedToolKey = item.key;
            this.selectedEggKey  = null;
          } else if (item.kind === 'block') {
            this.selectedBlock   = item.blockType;
            this.selectedToolKey = null;
            this.selectedEggKey  = null;
          } else if (item.kind === 'dust') {
            this.selectedDust    = true;
            this.selectedEggKey  = null;
            this.selectedToolKey = null;
          } else if (item.kind === 'gate') {
            this.selectedGateType = item.gateType;
            this.selectedEggKey   = null;
            this.selectedToolKey  = null;
          } else if (item.kind === 'blockItem') {
            this.selectedBlockItemType  = item.blockType;
            this.selectedBlockItemCount = item.defaultCount ?? 20;
            this.selectedEggKey  = null;
            this.selectedToolKey = null;
          } else { // egg
            this.selectedEggKey  = item.key;
            this.selectedToolKey = null;
          }
        } else {
          this.selectedBlock   = items[i];
          this.selectedEggKey  = null;
          this.selectedToolKey = null;
          this.selectedEmerald = false;
          this.selectedPowerup = false;
          this.selectedHill    = false;
          this.selectedSpawnLine = false;
          this.selectedSpawnPoint = false;
        }
        // Auto-assign current selection to the active hotbar slot
        this.sbHotbar[this.sbHotbarSel] = this._currentSelectionEntry();
        return true;
      }
    }

    return true; // consumed (inside panel but not a slot)
  }

  handlePopupClick(mx, my, clicked) {
    if (!this.popup || !clicked) return false;
    const { px, py, pw } = this._popupLayout();

    if (this.popup.kind === 'item') {
      const it = this.placedItems[this.popup.itemIdx];
      if (!it) { this.closePopup(); return false; }
      const isBlockItem = !!it.blockType;
      const popH = isBlockItem ? 175 : 130;
      // X close button
      if (mx >= px + pw - 26 && mx <= px + pw - 6 && my >= py + 6 && my <= py + 26) {
        this.closePopup(); return true;
      }
      // Click outside → close
      if (mx < px || mx > px + pw || my < py || my > py + popH) {
        this.closePopup(); return false;
      }
      if (isBlockItem) {
        // -10 button
        if (mx >= px + 14 && mx <= px + 14 + 60 && my >= py + 84 && my <= py + 116) {
          it.count = Math.max(1, (it.count || 1) - 10); return true;
        }
        // +10 button
        if (mx >= px + pw - 74 && mx <= px + pw - 14 && my >= py + 84 && my <= py + 116) {
          it.count = Math.min(999, (it.count || 1) + 10); return true;
        }
        // Remove button
        if (mx >= px + 14 && mx <= px + pw - 14 && my >= py + 127 && my <= py + 159) {
          this.removeItem(this.popup.itemIdx); return true;
        }
      } else {
        if (mx >= px + 14 && mx <= px + pw - 14 && my >= py + 84 && my <= py + 116) {
          this.removeItem(this.popup.itemIdx); return true;
        }
      }
      return true;
    }

    // Emerald popup (popH = 120, matches _drawPopup) — Phase 3A.2
    if (this.popup.kind === 'emerald') {
      if (mx >= px + pw - 26 && mx <= px + pw - 6 && my >= py + 6 && my <= py + 26) { this.closePopup(); return true; }
      if (mx < px || mx > px + pw || my < py || my > py + 168) { this.closePopup(); return false; }
      if (mx >= px + 14 && mx <= px + pw - 14 && my >= py + 88  && my <= py + 118) { this.cycleEmeraldGroup(this.popup.emeraldIdx); return true; }
      if (mx >= px + 14 && mx <= px + pw - 14 && my >= py + 124 && my <= py + 154) { this.removeEmerald(this.popup.emeraldIdx); return true; }
      return true;
    }

    // Power-up popup (popH = 168, matches _drawPopup) — Phase 3A.2
    if (this.popup.kind === 'powerup') {
      if (mx >= px + pw - 26 && mx <= px + pw - 6 && my >= py + 6 && my <= py + 26) { this.closePopup(); return true; }
      if (mx < px || mx > px + pw || my < py || my > py + 168) { this.closePopup(); return false; }
      if (mx >= px + 14 && mx <= px + pw - 14 && my >= py + 88  && my <= py + 118) { this.cyclePowerupType(this.popup.powerupIdx); return true; }
      if (mx >= px + 14 && mx <= px + pw - 14 && my >= py + 124 && my <= py + 154) { this.removePowerup(this.popup.powerupIdx); return true; }
      return true;
    }

    // Hill popup (popH = 120) — Phase 3A.3 (remove only; size/shape locked)
    if (this.popup.kind === 'hill') {
      if (mx >= px + pw - 26 && mx <= px + pw - 6 && my >= py + 6 && my <= py + 26) { this.closePopup(); return true; }
      if (mx < px || mx > px + pw || my < py || my > py + 200) { this.closePopup(); return false; }
      // Width steppers (row at py+60)
      if (my >= py + 60 && my <= py + 84) {
        if (mx >= px + 14 && mx <= px + 42)           { this.resizeHill(-1, 0); return true; }
        if (mx >= px + pw - 42 && mx <= px + pw - 14) { this.resizeHill(1, 0);  return true; }
      }
      // Height steppers (row at py+108)
      if (my >= py + 108 && my <= py + 132) {
        if (mx >= px + 14 && mx <= px + 42)           { this.resizeHill(0, -1); return true; }
        if (mx >= px + pw - 42 && mx <= px + pw - 14) { this.resizeHill(0, 1);  return true; }
      }
      if (mx >= px + 14 && mx <= px + pw - 14 && my >= py + 160 && my <= py + 190) { this.removeHill(); return true; }
      return true;
    }

    // Spawn-line popup (popH = 168) — Phase 3A.3 (cycle line 1–4 + remove)
    if (this.popup.kind === 'spawnline') {
      if (mx >= px + pw - 26 && mx <= px + pw - 6 && my >= py + 6 && my <= py + 26) { this.closePopup(); return true; }
      if (mx < px || mx > px + pw || my < py || my > py + 168) { this.closePopup(); return false; }
      if (mx >= px + 14 && mx <= px + pw - 14 && my >= py + 88  && my <= py + 118) { this.cycleSpawnLineNum(this.popup.spawnLineIdx); return true; }
      if (mx >= px + 14 && mx <= px + pw - 14 && my >= py + 124 && my <= py + 154) { this.removeSpawnLine(this.popup.spawnLineIdx); return true; }
      return true;
    }

    // Player spawn-point popup (popH = 168) — Phase 3 (cycle slot 1–4 + remove)
    if (this.popup.kind === 'spawnpoint') {
      if (mx >= px + pw - 26 && mx <= px + pw - 6 && my >= py + 6 && my <= py + 26) { this.closePopup(); return true; }
      if (mx < px || mx > px + pw || my < py || my > py + 168) { this.closePopup(); return false; }
      if (mx >= px + 14 && mx <= px + pw - 14 && my >= py + 88  && my <= py + 118) { this.cycleSpawnPointSlot(this.popup.spawnPointIdx); return true; }
      if (mx >= px + 14 && mx <= px + pw - 14 && my >= py + 124 && my <= py + 154) { this.removeSpawnPoint(this.popup.spawnPointIdx); return true; }
      return true;
    }

    // Arena-object popup (Base / Tower / Heal) — cycle team/owner + remove.
    if (this.popup.kind === 'arenaobj') {
      const o = this.placedArenaObjs[this.popup.arenaObjIdx];
      if (mx >= px + pw - 26 && mx <= px + pw - 6 && my >= py + 6 && my <= py + 26) { this.closePopup(); return true; }
      if (mx < px || mx > px + pw || my < py || my > py + 168) { this.closePopup(); return false; }
      // Change button only applies to base/tower (heal has nothing to cycle).
      if (o && o.type !== 'heal' && mx >= px + 14 && mx <= px + pw - 14 && my >= py + 88 && my <= py + 118) { this.cycleArenaObj(this.popup.arenaObjIdx); return true; }
      if (mx >= px + 14 && mx <= px + pw - 14 && my >= py + 124 && my <= py + 154) { this.removeArenaObj(this.popup.arenaObjIdx); return true; }
      return true;
    }

    // Egg popup (eggH = 244, matches _drawPopup)
    const egg = this.placedEggs[this.popup.eggIdx];
    // X close button
    if (mx >= px + pw - 26 && mx <= px + pw - 6 && my >= py + 6 && my <= py + 26) {
      this.closePopup(); return true;
    }
    if (mx < px || mx > px + pw || my < py || my > py + 244) {
      this.closePopup();
      return false;
    }
    // Cycle button
    if (mx >= px + 14 && mx <= px + pw - 14 && my >= py + 84 && my <= py + 112) {
      this.cycleEggType(this.popup.eggIdx);
      return true;
    }
    // Spawn-rate steppers (mobs / 10s, 1–10)
    if (egg && my >= py + 120 && my <= py + 144) {
      if (mx >= px + 14 && mx <= px + 42)            { egg.spawnFrequency = Math.max(1,  (egg.spawnFrequency ?? 2) - 1); return true; }
      if (mx >= px + pw - 42 && mx <= px + pw - 14)  { egg.spawnFrequency = Math.min(10, (egg.spawnFrequency ?? 2) + 1); return true; }
    }
    // Max-active steppers (1–10)
    if (egg && my >= py + 160 && my <= py + 184) {
      if (mx >= px + 14 && mx <= px + 42)            { egg.maxActiveMobs = Math.max(1,  (egg.maxActiveMobs ?? 3) - 1); return true; }
      if (mx >= px + pw - 42 && mx <= px + pw - 14)  { egg.maxActiveMobs = Math.min(10, (egg.maxActiveMobs ?? 3) + 1); return true; }
    }
    // Remove button
    if (mx >= px + 14 && mx <= px + pw - 14 && my >= py + 196 && my <= py + 226) {
      this.removeEgg(this.popup.eggIdx);
      return true;
    }
    return true;
  }

  // ── Layouts ──────────────────────────────────────────────────

  _paletteLayout() {
    // Wide enough to show every item in a tab without scrolling (10 cols × ~4 rows).
    const pw = 470, ph = 290;
    return { px: (CANVAS_W - pw) / 2, py: (CANVAS_H - ph) / 2 - 10, pw, ph };
  }

  // Tab-row geometry shared by draw + click (4 tabs filling the panel width).
  _paletteTabGeom() {
    const { px, py, pw } = this._paletteLayout();
    const tabW = (pw - 16) / 4;
    return { tabW, gap: 4, y: py + 32, h: 26, x0: px + 8 };
  }

  // Item grid geometry shared by draw + click + scroll (single source of truth).
  _paletteGridGeom() {
    const { px, py, pw, ph } = this._paletteLayout();
    const gridTop = py + 66, gridBottom = py + ph - 22; // leave room for the footer hint
    return { px, py, pw, ph, gridTop, gridBottom, slotSz: 44, cols: 10, startX: px + 8, viewH: gridBottom - gridTop };
  }

  _paletteItems() {
    return this.paletteTab === 'other' ? OTHER_PALETTE_ITEMS
         : this.paletteTab === 'gear'  ? GEAR_PALETTE_ITEMS
         : (SANDBOX_PALETTE_BLOCKS[this.paletteTab] || []);
  }

  _paletteMaxScroll() {
    const g = this._paletteGridGeom();
    const rows = Math.ceil(this._paletteItems().length / g.cols);
    return Math.max(0, rows * g.slotSz - g.viewH);
  }

  // Wheel scroll while the palette is open (dir = +1 down / -1 up), one row per tick.
  scrollPalette(dir) {
    this.paletteScroll = Math.max(0, Math.min(this._paletteMaxScroll(), this.paletteScroll + dir * 44));
  }

  _popupLayout() {
    const pw = 220, ph = 170;
    return { px: (CANVAS_W - pw) / 2, py: (CANVAS_H - ph) / 2, pw, ph };
  }

  _portalPopupLayout() {
    const pw = 360;
    const portal = this.portalPopup && this.findPortalById(this.portalPopup.portalId);
    const nOpp   = portal ? this.sandboxPortals.filter(p => p.biome !== portal.biome).length : 0;
    const btnRows = Math.max(1, Math.ceil(nOpp / 8));
    const ph = 66 + btnRows * 40 + 68;
    return { px: (CANVAS_W - pw) / 2, py: Math.max(10, (CANVAS_H - ph) / 2), pw, ph };
  }

  // ── Drawing ──────────────────────────────────────────────────

  // World-space overlays — drawn INSIDE the camera zoom transform so they scale +
  // line up with the blocks (Phase 3A.3 zoom fix).
  drawWorld(ctx, camera, frameCount) {
    this._drawPlacedItems(ctx, camera, frameCount);
    this._drawPlacedEggs(ctx, camera, frameCount);
    this._drawPlacedEmeralds(ctx, camera, frameCount);
    this._drawPlacedPowerups(ctx, camera, frameCount);
    this._drawPlacedHill(ctx, camera);
    this._drawPlacedSpawnLines(ctx, camera, frameCount);
    this._drawPlacedSpawnPoints(ctx, camera, frameCount);
    this._drawPlacedArenaObjs(ctx, camera, frameCount);
    this._drawPortalLabels(ctx, camera);
  }

  // Screen-space HUD (palette, hotbar, popups) — drawn OUTSIDE the zoom transform.
  drawHud(ctx, input, player, frameCount) {
    this._drawHUD(ctx, player, frameCount, input);
    if (this.paletteOpen)  this._drawPalette(ctx, input);
    if (this.popup)        this._drawPopup(ctx, input);
    if (this.portalPopup)  this._drawPortalPopup(ctx, input);
  }

  // Back-compat: full draw (world overlays + HUD) for any caller not split-aware.
  draw(ctx, camera, input, player, frameCount) {
    this.drawWorld(ctx, camera, frameCount);
    this.drawHud(ctx, input, player, frameCount);
  }

  _drawPlacedItems(ctx, camera, frameCount) {
    for (let i = 0; i < this.placedItems.length; i++) {
      const it  = this.placedItems[i];
      const sx  = it.wx - camera.x;
      const sy  = it.wy - camera.y;
      if (sx < camera.viewMinX() - 30 || sx > camera.viewMaxX() + 30 || sy < camera.viewMinY() - 30 || sy > camera.viewMaxY() + 30) continue;
      const bob = (it.vy === 0) ? Math.sin(frameCount * 0.05 + it.bobOffset) * 2 : 0;
      const sel = this.popup?.kind === 'item' && this.popup.itemIdx === i;
      const cx = Math.floor(sx);
      const cy = Math.floor(sy + bob);

      ctx.save();
      if (sel) {
        ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 3;
        ctx.strokeRect(cx - 14, cy - 14, 28, 28);
      }

      if (it.blockType) {
        // Block item (e.g. Arrow Stack) — render block sprite + count badge
        const bsz = 24;
        ctx.fillStyle = 'rgba(0,0,0,0.72)';
        ctx.fillRect(cx - 13, cy - 13, 26, 26);
        ctx.strokeStyle = '#A07840'; ctx.lineWidth = 1.5;
        ctx.strokeRect(cx - 13, cy - 13, 26, 26);
        ctx.translate(cx - bsz / 2, cy - bsz / 2);
        ctx.scale(bsz / BLOCK_SIZE, bsz / BLOCK_SIZE);
        drawBlock(ctx, it.blockType, 0, 0, 0);
        ctx.restore();
        ctx.save();
        // Count badge
        const cnt = it.count ?? 1;
        ctx.fillStyle    = 'rgba(0,0,0,0.82)';
        ctx.fillRect(cx - 11, cy + 7, 22, 10);
        ctx.fillStyle    = '#FFFFFF';
        ctx.font         = 'bold 7px Courier New';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`×${cnt}`, cx, cy + 12);
      } else {
        // Tool / armor item
        const data  = TOOL_DATA[it.toolKey] || ARMOR_DATA[it.toolKey];
        const color = data?.color ?? '#FFD700';
        const sym   = data?.piece === 'head'  ? '⛑'
                    : data?.piece === 'chest' ? '🛡'
                    : data?.piece === 'legs'  ? 'L'
                    : data?.piece === 'feet'  ? '👟'
                    : data?.type === 'flint_steel' ? '🔥'
                    : data?.type === 'pickaxe' ? '⛏'
                    : (data?.type === 'sword' || data?.type === 'bow') ? weaponIconFor(data)
                    : '🛡';
        ctx.shadowColor = color; ctx.shadowBlur = 10;
        ctx.fillStyle   = 'rgba(0,0,0,0.72)';
        ctx.fillRect(cx - 12, cy - 12, 24, 24);
        ctx.shadowBlur  = 0;
        ctx.strokeStyle = color; ctx.lineWidth = 1.5;
        ctx.strokeRect(cx - 12, cy - 12, 24, 24);
        ctx.fillStyle    = color;
        ctx.font         = '16px serif';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        if (!(data?.weaponClass && drawWeaponIcon(ctx, data.weaponClass, cx, cy, 22, data.color))) ctx.fillText(sym, cx, cy);
      }
      ctx.restore();
    }
  }

  _drawPlacedEggs(ctx, camera, frameCount) {
    for (let i = 0; i < this.placedEggs.length; i++) {
      const e  = this.placedEggs[i];
      const sx = e.wx - camera.x;
      const sy = e.wy - camera.y;
      if (sx < camera.viewMinX() - 50 || sx > camera.viewMaxX() + 50 || sy < camera.viewMinY() - 50 || sy > camera.viewMaxY() + 50) continue;
      const def = SPAWN_EGG_DEFS.find(d => d.key === e.mobType) || SPAWN_EGG_DEFS[0];
      const sel = this.popup?.kind === 'egg' && this.popup.eggIdx === i;
      _drawEgg(ctx, sx, sy, def, frameCount, sel);
    }
  }

  _drawPlacedEmeralds(ctx, camera, frameCount) {
    for (let i = 0; i < this.placedEmeralds.length; i++) {
      const e  = this.placedEmeralds[i];
      const sx = e.wx - camera.x, sy = e.wy - camera.y;
      if (sx < camera.viewMinX() - 40 || sx > camera.viewMaxX() + 40 || sy < camera.viewMinY() - 40 || sy > camera.viewMaxY() + 40) continue;
      const sel = this.popup?.kind === 'emerald' && this.popup.emeraldIdx === i;
      _drawEmeraldIcon(ctx, sx, sy, frameCount, sel);
      // Group tag (1–3) so designers can see grouping at a glance.
      ctx.save();
      ctx.fillStyle = '#0a3d1e'; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.arc(sx + 9, sy - 9, 7, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = '#9fffce';
      ctx.font = 'bold 9px Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(e.group || 1), sx + 9, sy - 9);
      ctx.restore();
    }
  }

  _drawPlacedPowerups(ctx, camera, frameCount) {
    for (let i = 0; i < this.placedPowerups.length; i++) {
      const p  = this.placedPowerups[i];
      const sx = p.wx - camera.x, sy = p.wy - camera.y;
      if (sx < camera.viewMinX() - 40 || sx > camera.viewMaxX() + 40 || sy < camera.viewMinY() - 40 || sy > camera.viewMaxY() + 40) continue;
      const sel = this.popup?.kind === 'powerup' && this.popup.powerupIdx === i;
      _drawPowerupIcon(ctx, sx, sy, p.powerType, frameCount, sel);
    }
  }

  _drawPlacedHill(ctx, camera) {
    if (!this.placedHill) return;
    const sx = this.placedHill.col * BLOCK_SIZE - camera.x;
    const sy = this.placedHill.row * BLOCK_SIZE - camera.y;
    _drawHillPlatform(ctx, sx, sy, '#f1c40f', this.placedHill.w, this.placedHill.h);
  }

  _drawPlacedSpawnLines(ctx, camera, frameCount) {
    for (const s of this.placedSpawnLines) {
      const sx = s.wx - camera.x, sy = s.wy - camera.y;
      if (sx < camera.viewMinX() - 40 || sx > camera.viewMaxX() + 40 || sy < camera.viewMinY() - 40 || sy > camera.viewMaxY() + 40) continue;
      _drawSpawnLineMarker(ctx, sx, sy, s.line || 1, frameCount);
    }
  }

  _drawPlacedSpawnPoints(ctx, camera, frameCount) {
    for (const s of this.placedSpawnPoints) {
      const sx = s.wx - camera.x, sy = s.wy - camera.y;
      if (sx < camera.viewMinX() - 40 || sx > camera.viewMaxX() + 40 || sy < camera.viewMinY() - 40 || sy > camera.viewMaxY() + 40) continue;
      _drawSpawnPointMarker(ctx, sx, sy, s.slot || 1, frameCount);
    }
  }

  _drawPlacedArenaObjs(ctx, camera, frameCount) {
    for (const o of this.placedArenaObjs) {
      const sx = o.wx - camera.x, sy = o.wy - camera.y;
      if (sx < camera.viewMinX() - 80 || sx > camera.viewMaxX() + 80 || sy < camera.viewMinY() - 140 || sy > camera.viewMaxY() + 80) continue;
      _drawArenaObjMarker(ctx, sx, sy, o, frameCount);
    }
  }

  // ── Portal labels (rendered over world blocks in sandbox) ────

  _drawPortalLabels(ctx, camera) {
    for (const p of this.sandboxPortals) {
      // Centre of the 4×5 portal footprint
      const cx = (p.anchorCol + 2) * BLOCK_SIZE - camera.x;
      const cy = (p.anchorRow + 2.5) * BLOCK_SIZE - camera.y;
      if (cx < camera.viewMinX() - 50 || cx > camera.viewMaxX() + 50 || cy < camera.viewMinY() - 50 || cy > camera.viewMaxY() + 50) continue;

      const isNether = p.biome === 'nether';
      const color    = isNether ? '#FF8844' : '#44BBFF';

      ctx.save();
      // Label badge
      ctx.font = 'bold 15px Courier New';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      const lw = ctx.measureText(p.label).width;
      const bw = Math.max(lw + 14, 30), bh = 24;
      ctx.fillStyle = 'rgba(0,0,0,0.78)';
      _roundRect(ctx, cx - bw / 2, cy - bh / 2, bw, bh, 5); ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      _roundRect(ctx, cx - bw / 2, cy - bh / 2, bw, bh, 5); ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillText(p.label, cx, cy);

      // Destination arrow below badge
      if (p.destId !== null) {
        const dest = this.findPortalById(p.destId);
        if (dest) {
          const arrow = `\u2192 ${dest.label}`;
          ctx.font = '9px Courier New';
          const aw = ctx.measureText(arrow).width;
          ctx.fillStyle = 'rgba(0,0,0,0.65)';
          ctx.fillRect(cx - aw / 2 - 4, cy + bh / 2 + 2, aw + 8, 14);
          ctx.fillStyle = dest.biome === 'nether' ? '#FF8844' : '#44BBFF';
          ctx.fillText(arrow, cx, cy + bh / 2 + 9);
        }
      }
      ctx.restore();
    }
  }

  // ── Portal link popup ─────────────────────────────────────────

  _drawPortalPopup(ctx, input) {
    if (!this.portalPopup) return;
    const { px, py, pw, ph } = this._portalPopupLayout();
    const mx = input.mouse.x, my = input.mouse.y;
    const portal = this.findPortalById(this.portalPopup.portalId);
    if (!portal) { this.portalPopup = null; return; }

    const isNether    = portal.biome === 'nether';
    const accentColor = isNether ? '#FF8844' : (portal.ruined ? '#AA77FF' : '#44BBFF');
    const biomeLabel  = isNether ? 'Nether Portal' : (portal.ruined ? 'Ruined Nether Portal' : 'Overworld Portal');
    const destBiome   = isNether ? 'overworld' : 'nether';

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    ctx.fillStyle = '#13131f';
    _roundRect(ctx, px, py, pw, ph, 8); ctx.fill();
    ctx.strokeStyle = accentColor; ctx.lineWidth = 2;
    _roundRect(ctx, px, py, pw, ph, 8); ctx.stroke();

    // X close button
    { const xbx = px + pw - 26, xby = py + 6;
      const xHov = mx >= xbx && mx <= xbx + 20 && my >= xby && my <= xby + 20;
      ctx.fillStyle = xHov ? 'rgba(255,80,80,0.3)' : 'rgba(0,0,0,0.4)';
      _roundRect(ctx, xbx, xby, 20, 20, 4); ctx.fill();
      ctx.strokeStyle = xHov ? '#FF5555' : '#554444'; ctx.lineWidth = 1;
      _roundRect(ctx, xbx, xby, 20, 20, 4); ctx.stroke();
      ctx.fillStyle = xHov ? '#fff' : '#AA7777';
      ctx.font = 'bold 12px Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('✕', xbx + 10, xby + 10); }

    // Title
    ctx.fillStyle    = accentColor;
    ctx.font         = 'bold 13px Courier New';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`PORTAL ${portal.label}  —  ${biomeLabel}`, CANVAS_W / 2, py + 16);

    // Current link status
    const dest = portal.destId !== null ? this.findPortalById(portal.destId) : null;
    ctx.font      = '10px Courier New';
    ctx.fillStyle = dest ? '#88FF88' : '#666';
    ctx.fillText(
      dest ? `\u2192 Links to Portal ${dest.label}` : 'Not linked — select a destination below',
      CANVAS_W / 2, py + 38
    );

    // "Available portals:" sub-header
    const opposites = this.sandboxPortals.filter(p => p.biome !== portal.biome);
    ctx.font      = '8px Courier New';
    ctx.fillStyle = '#555';
    ctx.fillText(
      opposites.length ? `Available ${destBiome} portals (click to link / click again to unlink):` : `No ${destBiome} portals placed yet`,
      CANVAS_W / 2, py + 56
    );

    // Destination buttons
    const btnSz = 36, btnGap = 4, perRow = 8;
    const gridX = px + 12, gridY = py + 66;
    for (let i = 0; i < opposites.length; i++) {
      const op  = opposites[i];
      const bx  = gridX + (i % perRow) * (btnSz + btnGap);
      const by  = gridY + Math.floor(i / perRow) * (btnSz + btnGap);
      const sel = portal.destId === op.id;
      const hov = mx >= bx && mx <= bx + btnSz && my >= by && my <= by + btnSz;
      const opC = op.biome === 'nether' ? '#FF8844' : '#44BBFF';

      ctx.fillStyle   = sel ? `${opC}55` : (hov ? `${opC}22` : 'rgba(0,0,0,0.45)');
      _roundRect(ctx, bx, by, btnSz, btnSz, 5); ctx.fill();
      ctx.strokeStyle = sel ? opC : (hov ? opC + '88' : '#333');
      ctx.lineWidth   = sel ? 2.5 : 1;
      _roundRect(ctx, bx, by, btnSz, btnSz, 5); ctx.stroke();

      ctx.fillStyle    = sel ? '#fff' : (hov ? '#ddd' : '#999');
      ctx.font         = 'bold 15px Courier New';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(op.label, bx + btnSz / 2, by + btnSz / 2);
    }

    // Remove/delete portal button. Works for ruined portals too now (their obsidian
    // frame is cleared by the game handler). Two-click confirm guards accidental deletes.
    const removeY    = py + ph - 52;
    const confirming = !!this.portalPopup.confirmDelete;
    const remHov     = mx >= px + 12 && mx <= px + pw - 12 && my >= removeY && my <= removeY + 32;
    ctx.fillStyle   = confirming ? 'rgba(230,140,30,0.35)' : (remHov ? 'rgba(220,50,50,0.3)' : 'rgba(0,0,0,0.4)');
    _roundRect(ctx, px + 12, removeY, pw - 24, 32, 5); ctx.fill();
    ctx.strokeStyle = confirming ? '#FFAA33' : (remHov ? '#FF4444' : '#553333'); ctx.lineWidth = 1.5;
    _roundRect(ctx, px + 12, removeY, pw - 24, 32, 5); ctx.stroke();
    ctx.fillStyle    = (confirming || remHov) ? '#fff' : '#cc6666';
    ctx.font         = '11px Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(
      confirming ? '\u26a0  Click again to DELETE'
                 : (portal.ruined ? '\u2715  Delete Ruined Portal' : '\u2715  Remove Portal'),
      CANVAS_W / 2, removeY + 16
    );

    // Footer
    ctx.fillStyle    = 'rgba(100,100,120,0.5)';
    ctx.font         = '8px Courier New';
    ctx.fillText('Click outside to close', CANVAS_W / 2, py + ph - 8);

    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  // Small label centred at the bottom of a hotbar slot (Phase 3A.3 arena tools).
  _sbSlotLabel(ctx, text, color, sx, sy) {
    ctx.fillStyle = color; ctx.font = '6px Courier New';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(text, sx + SB_SLOT_SIZE / 2, sy + SB_SLOT_SIZE - 4);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  // ── HUD ───────────────────────────────────────────────────────
  _drawHUD(ctx, player, frameCount, input) {
    ctx.save();

    // ── Mode badge (top centre) ────────────────────────────────
    ctx.font = 'bold 11px Courier New';
    const label = 'SANDBOX MODE';
    const lw    = ctx.measureText(label).width;
    const bx    = CANVAS_W / 2 - lw / 2 - 12;
    const by    = 8;
    ctx.fillStyle   = 'rgba(255,152,0,0.22)';
    _roundRect(ctx, bx, by, lw + 24, 20, 4); ctx.fill();
    ctx.strokeStyle = '#FF9800'; ctx.lineWidth = 1;
    _roundRect(ctx, bx, by, lw + 24, 20, 4); ctx.stroke();
    ctx.fillStyle    = '#FF9800';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, CANVAS_W / 2, by + 10);

    // ── Flight indicator ───────────────────────────────────────
    if (player.flying) {
      const fl = '✈  Flying  [S×2 to land]';
      const fw = ctx.measureText(fl).width;
      const fx = CANVAS_W / 2 - fw / 2 - 10;
      ctx.fillStyle   = 'rgba(33,150,243,0.22)';
      _roundRect(ctx, fx, by + 26, fw + 20, 18, 4); ctx.fill();
      ctx.strokeStyle = '#2196F3'; ctx.lineWidth = 1;
      _roundRect(ctx, fx, by + 26, fw + 20, 18, 4); ctx.stroke();
      ctx.fillStyle = '#2196F3';
      ctx.fillText(fl, CANVAS_W / 2, by + 35);
    }

    // ── Hint text above hotbar ─────────────────────────────────
    ctx.fillStyle    = 'rgba(130,130,150,0.55)';
    ctx.font         = '8px Courier New';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('[I] palette  •  Shift+1/2/3=brush  •  Alt+click=pick  •  W×2=fly',
                 CANVAS_W / 2, SB_HOTBAR_Y - 6);

    // ── Sandbox hotbar (replaces normal hotbar visually) ───────
    const mx = input?.mouse.x ?? -1, my = input?.mouse.y ?? -1;
    for (let i = 0; i < SB_SLOTS; i++) {
      const sx     = SB_HOTBAR_X + i * (SB_SLOT_SIZE + SB_SLOT_GAP);
      const sy     = SB_HOTBAR_Y;
      const active = i === this.sbHotbarSel;
      const hov    = mx >= sx && mx < sx + SB_SLOT_SIZE && my >= sy && my < sy + SB_SLOT_SIZE;

      ctx.fillStyle = active ? 'rgba(255,152,0,0.28)' : (hov ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.62)');
      ctx.fillRect(sx, sy, SB_SLOT_SIZE, SB_SLOT_SIZE);
      ctx.strokeStyle = active ? '#FF9800' : (hov ? '#888' : '#555');
      ctx.lineWidth   = active ? 2.5 : 1.5;
      ctx.strokeRect(sx + 0.5, sy + 0.5, SB_SLOT_SIZE - 1, SB_SLOT_SIZE - 1);

      const entry = this.sbHotbar[i];
      if (entry !== null) {
        if (entry.kind === 'block') {
          const pad = 5, sz = SB_SLOT_SIZE - pad * 2;
          ctx.save();
          ctx.translate(sx + pad, sy + pad);
          ctx.scale(sz / BLOCK_SIZE, sz / BLOCK_SIZE);
          drawBlock(ctx, entry.value, 0, 0, 0);
          ctx.restore();
        } else if (entry.kind === 'egg') {
          const def = SPAWN_EGG_DEFS.find(d => d.key === entry.value) || SPAWN_EGG_DEFS[0];
          const ecx = sx + SB_SLOT_SIZE / 2, ecy = sy + SB_SLOT_SIZE / 2 - 2;
          ctx.fillStyle = def.color;
          ctx.beginPath(); ctx.ellipse(ecx, ecy, 9, 12, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.beginPath(); ctx.ellipse(ecx - 3, ecy - 2, 2, 3, -0.5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          ctx.beginPath(); ctx.ellipse(ecx - 3, ecy - 4, 2, 4, -0.4, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle    = def.color;
          ctx.font         = '6px Courier New';
          ctx.textAlign    = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(def.label.split(' ')[0].substring(0, 5), ecx, sy + SB_SLOT_SIZE - 4);
          ctx.textAlign    = 'left';
          ctx.textBaseline = 'alphabetic';
        } else if (entry.kind === 'gate') {
          const GD = { not: { color:'#00AAAA', sym:'¬' }, and: { color:'#CC7700', sym:'&' } };
          const gd = GD[entry.value] || GD.not;
          const ecx = sx + SB_SLOT_SIZE / 2, ecy = sy + SB_SLOT_SIZE / 2;
          ctx.fillStyle = gd.color;
          ctx.fillRect(ecx - 9, ecy - 9, 18, 18);
          ctx.fillStyle = 'rgba(0,0,0,0.8)';
          ctx.font = 'bold 13px Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(gd.sym, ecx, ecy - 1);
          ctx.fillStyle = gd.color;
          ctx.font = '6px Courier New'; ctx.textBaseline = 'bottom';
          ctx.fillText(entry.value.toUpperCase(), ecx, sy + SB_SLOT_SIZE - 3);
          ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        } else if (entry.kind === 'dust') {
          const ecx = sx + SB_SLOT_SIZE / 2, ecy = sy + SB_SLOT_SIZE / 2;
          ctx.fillStyle = '#CC2222';
          ctx.fillRect(sx + 6, ecy - 2, SB_SLOT_SIZE - 12, 3);
          ctx.fillStyle = '#FF5555';
          ctx.fillRect(sx + 6,     ecy - 3, 5, 5);
          ctx.fillRect(ecx - 2,   ecy - 3, 5, 5);
          ctx.fillRect(sx + SB_SLOT_SIZE - 12, ecy - 3, 5, 5);
          ctx.fillStyle    = '#CC4444';
          ctx.font         = 'bold 7px Courier New';
          ctx.textAlign    = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText('DUST', ecx, sy + SB_SLOT_SIZE - 4);
          ctx.textAlign    = 'left';
          ctx.textBaseline = 'alphabetic';
        } else if (entry.kind === 'tool') {
          const data  = TOOL_DATA[entry.value] || ARMOR_DATA[entry.value];
          const color = data?.color ?? '#FFD700';
          const sym   = data?.piece === 'head' ? '⛑' : data?.piece === 'chest' ? '🛡'
                      : data?.piece === 'legs' ? 'L' : data?.piece === 'feet' ? '👟'
                      : data?.type === 'flint_steel' ? '🔥'
                      : data?.type === 'pickaxe' ? '⛏'
                      : (data?.type === 'sword' || data?.type === 'bow') ? weaponIconFor(data) : '🛡';
          const ecx = sx + SB_SLOT_SIZE / 2, ecy = sy + SB_SLOT_SIZE / 2;
          ctx.fillStyle    = color;
          ctx.font         = '20px serif';
          ctx.textAlign    = 'center';
          ctx.textBaseline = 'middle';
          if (!(data?.weaponClass && drawWeaponIcon(ctx, data.weaponClass, ecx, ecy, 22, data.color))) ctx.fillText(sym, ecx, ecy);
          ctx.textAlign    = 'left';
          ctx.textBaseline = 'alphabetic';
        } else if (entry.kind === 'blockItem') {
          const bsz = SB_SLOT_SIZE - 12;
          const ecx = sx + SB_SLOT_SIZE / 2, ecy = sy + SB_SLOT_SIZE / 2 - 5;
          ctx.save();
          ctx.translate(ecx - bsz / 2, ecy - bsz / 2);
          ctx.scale(bsz / BLOCK_SIZE, bsz / BLOCK_SIZE);
          drawBlock(ctx, entry.value, 0, 0, 0);
          ctx.restore();
          ctx.fillStyle    = '#FFFFFF';
          ctx.font         = 'bold 7px Courier New';
          ctx.textAlign    = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(`×${entry.count ?? 20}`, ecx, sy + SB_SLOT_SIZE - 4);
          ctx.textAlign    = 'left';
          ctx.textBaseline = 'alphabetic';
        } else if (entry.kind === 'emerald') {
          const ecx = sx + SB_SLOT_SIZE / 2, ecy = sy + SB_SLOT_SIZE / 2 - 3;
          _drawEmeraldIcon(ctx, ecx, ecy, 0, false);
          this._sbSlotLabel(ctx, 'EMRLD', '#2ecc71', sx, sy);
        } else if (entry.kind === 'powerup') {
          const ecx = sx + SB_SLOT_SIZE / 2, ecy = sy + SB_SLOT_SIZE / 2 - 3;
          _drawPowerupIcon(ctx, ecx, ecy, 'HEALTH', 0, false);
          this._sbSlotLabel(ctx, 'POWER', '#e67e22', sx, sy);
        } else if (entry.kind === 'hill') {
          const ecx = sx + SB_SLOT_SIZE / 2, ecy = sy + SB_SLOT_SIZE / 2 - 2;
          ctx.fillStyle = '#f1c40f'; ctx.fillRect(ecx - 11, ecy + 2, 22, 5);
          ctx.fillStyle = '#fff7c0'; ctx.font = 'bold 11px Courier New';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('★', ecx, ecy - 5);
          this._sbSlotLabel(ctx, 'HILL', '#f1c40f', sx, sy);
        } else if (entry.kind === 'spawnline') {
          const ecx = sx + SB_SLOT_SIZE / 2, ecy = sy + SB_SLOT_SIZE / 2 - 3;
          _drawSpawnLineMarker(ctx, ecx, ecy, 1, 0);
          this._sbSlotLabel(ctx, 'SPAWN', '#9b59b6', sx, sy);
        } else if (entry.kind === 'spawnpoint') {
          const ecx = sx + SB_SLOT_SIZE / 2, ecy = sy + SB_SLOT_SIZE / 2 - 2;
          _drawSpawnPointMarker(ctx, ecx, ecy, entry.slot || 1, 0);
          this._sbSlotLabel(ctx, 'P-SPWN', '#4aa3ff', sx, sy);
        } else if (entry.kind === 'arenaobj') {
          const ecx = sx + SB_SLOT_SIZE / 2, ecy = sy + SB_SLOT_SIZE / 2 - 1;
          const t = entry.value;
          _drawArenaObjMarker(ctx, ecx, ecy, { type: t, team: 0, slot: 1 }, 0, true);
          const lbl = t === 'base' ? 'BASE' : t === 'tower' ? 'TOWER' : 'HEAL';
          const col = t === 'base' ? '#e74c3c' : t === 'tower' ? '#f5d142' : '#2ecc71';
          this._sbSlotLabel(ctx, lbl, col, sx, sy);
        }
      }

      // Slot number
      ctx.fillStyle    = active ? '#FF9800' : 'rgba(255,255,255,0.35)';
      ctx.font         = '8px Courier New';
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(i + 1, sx + 3, sy + 3);
      ctx.textBaseline = 'alphabetic';
    }

    // ── Current selection label (above hotbar) ─────────────────
    let selName, selColor;
    if (this.isBlockItemSelected) {
      const bdata = BLOCK_DATA[this.selectedBlockItemType];
      selName  = `${bdata?.name ?? '?'} ×${this.selectedBlockItemCount}`;
      selColor = '#A07840';
    } else if (this.isToolSelected) {
      const data = TOOL_DATA[this.selectedToolKey] || ARMOR_DATA[this.selectedToolKey];
      selName  = data?.name ?? this.selectedToolKey;
      selColor = data?.color ?? '#FFD700';
    } else if (this.isEggSelected) {
      const def = SPAWN_EGG_DEFS.find(d => d.key === this.selectedEggKey);
      selName  = `Egg: ${def?.label ?? '?'}`;
      selColor = def?.color ?? '#FF9800';
    } else if (this.isDustSelected) {
      selName  = 'Redstone Dust';
      selColor = '#CC2222';
    } else if (this.isGateSelected) {
      selName  = this.selectedGateType === 'not' ? 'NOT Gate' : 'AND Gate';
      selColor = this.selectedGateType === 'not' ? '#00AAAA' : '#CC7700';
    } else if (this.isEmeraldSelected) {
      selName = 'Emerald';        selColor = '#2ecc71';
    } else if (this.isPowerupSelected) {
      selName = 'Power-Up';       selColor = '#e67e22';
    } else if (this.isHillSelected) {
      selName = 'Hill Zone';      selColor = '#f1c40f';
    } else if (this.isSpawnLineSelected) {
      selName = 'Spawn Line';     selColor = '#9b59b6';
    } else if (this.isSpawnPointSelected) {
      selName = 'Player Spawn';   selColor = '#4aa3ff';
    } else if (this.isArenaObjSelected) {
      const t = this.selectedArenaObj;
      selName  = t === 'base' ? 'Base' : t === 'tower' ? 'Tower' : t === 'heal' ? 'Heal Pad' : 'Arena Object';
      selColor = t === 'base' ? '#e74c3c' : t === 'tower' ? '#f5d142' : '#2ecc71';
    } else {
      selName  = BLOCK_DATA[this.selectedBlock]?.name ?? '?';
      selColor = '#FFD700';
    }

    ctx.font = '10px Courier New';
    const nw  = ctx.measureText(selName).width;
    const selX = SB_HOTBAR_X + this.sbHotbarSel * (SB_SLOT_SIZE + SB_SLOT_GAP) + SB_SLOT_SIZE / 2;
    const labelY = SB_HOTBAR_Y - 18;
    ctx.fillStyle    = 'rgba(0,0,0,0.7)';
    _roundRect(ctx, selX - nw / 2 - 8, labelY - 10, nw + 16, 14, 3); ctx.fill();
    ctx.fillStyle    = selColor;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(selName, selX, labelY - 3);

    // ── Brush size buttons (right of hotbar) ──────────────────
    const BRUSH_LABELS = ['1×1', '2×2', '4×4'];
    const brushTotalW  = SB_BRUSH_SIZES.length * SB_BRUSH_BTN_W + (SB_BRUSH_SIZES.length - 1) * 3;
    for (let i = 0; i < SB_BRUSH_SIZES.length; i++) {
      const bx  = SB_BRUSH_BTN_X + i * (SB_BRUSH_BTN_W + 3);
      const by  = SB_BRUSH_BTN_Y;
      const act = this.brushSize === SB_BRUSH_SIZES[i];
      const hov = mx >= bx && mx < bx + SB_BRUSH_BTN_W && my >= by && my < by + SB_BRUSH_BTN_H;
      ctx.fillStyle   = act ? 'rgba(255,152,0,0.32)' : (hov ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.55)');
      ctx.fillRect(bx, by, SB_BRUSH_BTN_W, SB_BRUSH_BTN_H);
      ctx.strokeStyle = act ? '#FF9800' : (hov ? '#888' : '#444');
      ctx.lineWidth   = act ? 2 : 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, SB_BRUSH_BTN_W - 1, SB_BRUSH_BTN_H - 1);
      ctx.fillStyle    = act ? '#FF9800' : (hov ? '#ccc' : '#777');
      ctx.font         = act ? 'bold 9px Courier New' : '9px Courier New';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(BRUSH_LABELS[i], bx + SB_BRUSH_BTN_W / 2, by + SB_BRUSH_BTN_H / 2);
    }
    ctx.fillStyle    = 'rgba(130,130,150,0.65)';
    ctx.font         = '7px Courier New';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('BRUSH', SB_BRUSH_BTN_X + brushTotalW / 2, SB_BRUSH_BTN_Y - 3);

    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  // ── Palette panel ─────────────────────────────────────────────

  _drawPalette(ctx, input) {
    const { px, py, pw, ph } = this._paletteLayout();
    const mx = input.mouse.x, my = input.mouse.y;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.70)';
    ctx.fillRect(0, 0, CANVAS_W, SB_HOTBAR_Y);

    ctx.fillStyle = '#13131f';
    _roundRect(ctx, px, py, pw, ph, 8); ctx.fill();
    ctx.strokeStyle = '#FF9800'; ctx.lineWidth = 1.5;
    _roundRect(ctx, px, py, pw, ph, 8); ctx.stroke();

    ctx.fillStyle    = '#FF9800';
    ctx.font         = 'bold 12px Courier New';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BLOCK PALETTE', CANVAS_W / 2, py + 18);

    // X close button
    const xbx = px + pw - 26, xby = py + 6;
    const xHov = mx >= xbx && mx <= xbx + 20 && my >= xby && my <= xby + 20;
    ctx.fillStyle   = xHov ? 'rgba(255,80,80,0.3)' : 'rgba(0,0,0,0.4)';
    _roundRect(ctx, xbx, xby, 20, 20, 4); ctx.fill();
    ctx.strokeStyle = xHov ? '#FF5555' : '#554444'; ctx.lineWidth = 1;
    _roundRect(ctx, xbx, xby, 20, 20, 4); ctx.stroke();
    ctx.fillStyle = xHov ? '#fff' : '#AA7777';
    ctx.font      = 'bold 12px Courier New';
    ctx.fillText('✕', xbx + 10, xby + 10);

    // Tabs
    const TABS = [
      { key: 'overworld', label: 'Overworld', color: '#4CAF50' },
      { key: 'nether',    label: 'Nether',    color: '#FF4400' },
      { key: 'gear',      label: 'Gear',      color: '#FFD700' },
      { key: 'other',     label: 'Other',     color: '#FF9800' },
    ];
    const tg = this._paletteTabGeom();
    for (let i = 0; i < TABS.length; i++) {
      const tw  = tg.tabW - tg.gap;
      const tx  = tg.x0 + i * tg.tabW;
      const ty  = tg.y;
      const tab = TABS[i];
      const act = this.paletteTab === tab.key;
      const hov = mx >= tx && mx <= tx + tw && my >= ty && my <= ty + tg.h;
      ctx.fillStyle   = act ? `${tab.color}33` : (hov ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.3)');
      _roundRect(ctx, tx, ty, tw, tg.h, 4); ctx.fill();
      ctx.strokeStyle = act ? tab.color : (hov ? '#888' : '#333');
      ctx.lineWidth   = act ? 2 : 1;
      _roundRect(ctx, tx, ty, tw, tg.h, 4); ctx.stroke();
      ctx.fillStyle = act ? tab.color : (hov ? '#ccc' : '#666');
      ctx.font      = act ? 'bold 10px Courier New' : '10px Courier New';
      ctx.fillText(tab.label, tx + tw / 2, ty + tg.h / 2);
    }

    // Item grid (scrollable — a tab can hold more rows than the panel shows)
    const geom = this._paletteGridGeom();
    const gridTop = geom.gridTop, gridBottom = geom.gridBottom, slotSz = geom.slotSz, startX = geom.startX, cols = geom.cols;
    const isOther = this.paletteTab === 'other';
    const isGear  = this.paletteTab === 'gear';
    const items  = isOther ? OTHER_PALETTE_ITEMS
                 : isGear  ? GEAR_PALETTE_ITEMS
                 : (SANDBOX_PALETTE_BLOCKS[this.paletteTab] || []);
    const maxScroll = Math.max(0, Math.ceil(items.length / cols) * slotSz - (gridBottom - gridTop));
    this.paletteScroll = Math.max(0, Math.min(this.paletteScroll, maxScroll));
    const scroll = this.paletteScroll;
    // Clip the grid to the viewport (extend up a little so hover labels aren't cut).
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, gridTop - 12, pw, (gridBottom - gridTop) + 12);
    ctx.clip();

    for (let i = 0; i < items.length; i++) {
      const gx  = startX + (i % cols) * slotSz;
      const gy  = gridTop + Math.floor(i / cols) * slotSz - scroll;
      if (gy + slotSz - 2 < gridTop || gy > gridBottom) continue; // cull off-screen rows
      const hov = mx >= gx && mx <= gx + slotSz - 2 && my >= gy && my <= gy + slotSz - 2 && my >= gridTop && my <= gridBottom;
      const isSpecialTab = isOther || isGear;
      const itm = isSpecialTab ? items[i] : null;

      let selected;
      if (isSpecialTab) {
        if (itm.kind === 'tool')       selected = this.isToolSelected      && this.selectedToolKey      === itm.key;
        else if (itm.kind === 'egg')   selected = this.isEggSelected       && this.selectedEggKey       === itm.key;
        else if (itm.kind === 'emerald') selected = this.isEmeraldSelected;
        else if (itm.kind === 'powerup') selected = this.isPowerupSelected;
        else if (itm.kind === 'hill')      selected = this.isHillSelected;
        else if (itm.kind === 'spawnline') selected = this.isSpawnLineSelected;
        else if (itm.kind === 'spawnpoint') selected = this.isSpawnPointSelected;
        else if (itm.kind === 'dust')  selected = this.isDustSelected;
        else if (itm.kind === 'gate')  selected = this.isGateSelected      && this.selectedGateType     === itm.gateType;
        else if (itm.kind === 'blockItem') selected = this.isBlockItemSelected && this.selectedBlockItemType === itm.blockType;
        else selected = !this.isEggSelected && !this.isToolSelected && !this.isDustSelected &&
                        !this.isGateSelected && !this.isBlockItemSelected && !this.isEmeraldSelected &&
                        !this.isPowerupSelected && !this.isHillSelected && !this.isSpawnLineSelected &&
                        !this.isSpawnPointSelected &&
                        this.selectedBlock === itm.blockType;
      } else {
        selected = !this.isEggSelected && !this.isToolSelected && !this.isDustSelected &&
                   !this.isBlockItemSelected && this.selectedBlock === items[i];
      }

      const hlColor = isSpecialTab && itm?.kind === 'tool' ? (itm.color + '55')
                    : isSpecialTab && itm?.kind === 'dust'  ? 'rgba(200,30,30,0.25)'
                    : isSpecialTab && itm?.kind === 'gate'  ? (itm.color + '44')
                    : 'rgba(255,215,0,0.2)';
      ctx.fillStyle   = selected ? hlColor : (hov ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.4)');
      _roundRect(ctx, gx, gy, slotSz - 2, slotSz - 2, 4); ctx.fill();
      const selStroke = isSpecialTab && itm?.kind === 'tool' ? itm.color : '#FFD700';
      ctx.strokeStyle = selected ? selStroke : (hov ? '#888' : '#333');
      ctx.lineWidth   = selected ? 2 : 1;
      _roundRect(ctx, gx, gy, slotSz - 2, slotSz - 2, 4); ctx.stroke();

      const cxc = gx + (slotSz - 2) / 2, cyc = gy + (slotSz - 2) / 2;

      if (isSpecialTab && itm.kind === 'tool') {
        // Tool icon: colored background tint + abbreviation + type symbol
        ctx.fillStyle    = itm.color;
        ctx.font         = 'bold 12px Courier New';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        const abbr = itm.name.split(' ').map(w => w[0]).join('').substring(0, 3);
        ctx.fillText(abbr, cxc, cyc - 4);
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.font      = '8px Courier New';
        const sym = itm.piece === 'head' ? '⛑' : itm.piece === 'chest' ? '🛡'
                  : itm.piece === 'legs' ? 'L' : itm.piece === 'feet' ? '👟'
                  : itm.type === 'flint_steel' ? '🔥'
                  : itm.type === 'pickaxe' ? '⛏'
                  : (itm.type === 'sword' || itm.type === 'bow') ? weaponIconFor(itm) : '🛡';
        if (!(itm.weaponClass && drawWeaponIcon(ctx, itm.weaponClass, cxc, cyc + 9, 22, itm.color))) ctx.fillText(sym, cxc, cyc + 9);
        if (hov) {
          ctx.fillStyle    = itm.color;
          ctx.font         = '7px Courier New';
          ctx.textBaseline = 'bottom';
          ctx.fillText(itm.name, cxc, gy - 1);
        }
      } else if (isSpecialTab && itm.kind === 'gate') {
        ctx.fillStyle = itm.color;
        ctx.fillRect(gx + 8, gy + 6, slotSz - 18, slotSz - 18);
        ctx.fillStyle = selected ? '#fff' : 'rgba(0,0,0,0.7)';
        ctx.font = 'bold 11px Courier New';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(itm.gateType === 'not' ? '¬' : '&', cxc, cyc - 2);
        ctx.fillStyle = selected ? itm.color : '#888';
        ctx.font = '7px Courier New'; ctx.textBaseline = 'bottom';
        ctx.fillText(itm.name.split(' ')[0], cxc, gy + slotSz - 4);
        if (hov) {
          ctx.fillStyle = itm.color; ctx.font = '7px Courier New'; ctx.textBaseline = 'bottom';
          ctx.fillText(itm.name, cxc, gy - 1);
        }
      } else if (isSpecialTab && itm.kind === 'dust') {
        // Redstone dust icon: dust line + dots on grey background
        ctx.fillStyle = '#444';
        ctx.fillRect(gx + 2, gy + 2, slotSz - 6, slotSz - 6);
        ctx.fillStyle = '#CC2222';
        ctx.fillRect(gx + 5, gy + 12, slotSz - 12, 3);
        ctx.fillStyle = '#FF5555';
        ctx.fillRect(gx + 5,             gy + 11, 5, 5);
        ctx.fillRect(gx + (slotSz-2)/2-2, gy + 11, 5, 5);
        ctx.fillRect(gx + slotSz - 13,   gy + 11, 5, 5);
        ctx.fillStyle    = selected ? '#FF8888' : '#CC4444';
        ctx.font         = 'bold 7px Courier New';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('DUST', cxc, gy + slotSz - 4);
        if (hov) {
          ctx.fillStyle    = '#FF5555';
          ctx.font         = '7px Courier New';
          ctx.textBaseline = 'bottom';
          ctx.fillText('Redstone Dust', cxc, gy - 1);
        }
      } else if (isSpecialTab && itm.kind === 'blockItem') {
        const bsz = slotSz - 16;
        ctx.save();
        ctx.translate(gx + 7, gy + 4);
        ctx.scale(bsz / BLOCK_SIZE, bsz / BLOCK_SIZE);
        drawBlock(ctx, itm.blockType, 0, 0, 0);
        ctx.restore();
        ctx.fillStyle    = selected ? '#fff' : '#aaa';
        ctx.font         = 'bold 7px Courier New';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`×${itm.defaultCount}`, cxc, gy + slotSz - 4);
        if (hov) {
          ctx.fillStyle    = '#A07840';
          ctx.font         = '7px Courier New';
          ctx.textBaseline = 'bottom';
          ctx.fillText(itm.name, cxc, gy - 1);
        }
      } else if (isSpecialTab && itm.kind === 'egg') {
        const def = itm;
        const ecx = cxc, ecy = cyc - 4;
        ctx.fillStyle = def.color;
        ctx.beginPath(); ctx.ellipse(ecx, ecy, 9, 12, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(ecx - 3, ecy - 2, 2, 3, -0.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle    = selected ? '#fff' : '#999';
        ctx.font         = '7px Courier New';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(def.label.split(' ').map(w => w[0]).join(''), cxc, gy + slotSz - 4);
        // Tooltip: full mob name on hover
        if (hov) {
          ctx.fillStyle    = def.color;
          ctx.font         = '7px Courier New';
          ctx.textBaseline = 'bottom';
          ctx.fillText(def.label, cxc, gy - 1);
        }
      } else if (isSpecialTab && itm.kind === 'emerald') {
        _drawEmeraldIcon(ctx, cxc, cyc - 2, 0, false);
        if (hov) {
          ctx.fillStyle = itm.color; ctx.font = '7px Courier New';
          ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          ctx.fillText(itm.name, cxc, gy - 1);
        }
      } else if (isSpecialTab && itm.kind === 'powerup') {
        _drawPowerupIcon(ctx, cxc, cyc - 2, 'HEALTH', 0, false);
        ctx.fillStyle = selected ? '#fff' : '#aaa'; ctx.font = '7px Courier New';
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText('PWR', cxc, gy + slotSz - 4);
        if (hov) {
          ctx.fillStyle = itm.color; ctx.font = '7px Courier New'; ctx.textBaseline = 'bottom';
          ctx.fillText(itm.name, cxc, gy - 1);
        }
      } else if (isSpecialTab && itm.kind === 'hill') {
        ctx.fillStyle = '#f1c40f'; ctx.fillRect(cxc - 12, cyc + 2, 24, 5);
        ctx.fillStyle = '#fff7c0'; ctx.font = 'bold 12px Courier New';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('★', cxc, cyc - 5);
        ctx.fillStyle = selected ? '#fff' : '#aaa'; ctx.font = '7px Courier New'; ctx.textBaseline = 'bottom';
        ctx.fillText('HILL', cxc, gy + slotSz - 4);
        if (hov) { ctx.fillStyle = itm.color; ctx.fillText(itm.name, cxc, gy - 1); }
      } else if (isSpecialTab && itm.kind === 'spawnline') {
        _drawSpawnLineMarker(ctx, cxc, cyc - 2, 1, 0);
        ctx.fillStyle = selected ? '#fff' : '#aaa'; ctx.font = '7px Courier New';
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText('SPWN', cxc, gy + slotSz - 4);
        if (hov) { ctx.fillStyle = itm.color; ctx.fillText(itm.name, cxc, gy - 1); }
      } else if (isSpecialTab && itm.kind === 'spawnpoint') {
        _drawSpawnPointMarker(ctx, cxc, cyc - 2, 1, 0);
        ctx.fillStyle = selected ? '#fff' : '#aaa'; ctx.font = '7px Courier New';
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText('P-SPWN', cxc, gy + slotSz - 4);
        if (hov) { ctx.fillStyle = itm.color; ctx.fillText(itm.name, cxc, gy - 1); }
      } else if (isSpecialTab && itm.kind === 'arenaobj') {
        _drawArenaObjMarker(ctx, cxc, cyc - 1, { type: itm.obj, team: 0, slot: 1 }, 0, true);
        const lbl = itm.obj === 'base' ? 'BASE' : itm.obj === 'tower' ? 'TOWER' : 'HEAL';
        ctx.fillStyle = selected ? '#fff' : '#aaa'; ctx.font = '7px Courier New';
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(lbl, cxc, gy + slotSz - 4);
        if (hov) { ctx.fillStyle = itm.color; ctx.fillText(itm.name, cxc, gy - 1); }
      } else {
        // Block (either special tab block kind or regular tab block)
        const btype = isSpecialTab ? itm.blockType : items[i];
        const pad = 6, sz = slotSz - 2 - pad * 2;
        ctx.save();
        ctx.translate(gx + pad, gy + pad);
        ctx.scale(sz / BLOCK_SIZE, sz / BLOCK_SIZE);
        drawBlock(ctx, btype, 0, 0, 0);
        ctx.restore();
        if (hov) {
          ctx.fillStyle    = '#FFD700';
          ctx.font         = '7px Courier New';
          ctx.textAlign    = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(BLOCK_DATA[btype]?.name ?? '?', cxc, gy - 1);
        }
      }
    }

    ctx.restore(); // end grid clip

    // Scrollbar (only when the grid overflows the viewport)
    if (maxScroll > 0) {
      const trackX = px + pw - 9, trackY = gridTop, trackH = gridBottom - gridTop;
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      _roundRect(ctx, trackX, trackY, 5, trackH, 2); ctx.fill();
      const contentH = Math.ceil(items.length / cols) * slotSz;
      const thumbH   = Math.max(24, trackH * (trackH / contentH));
      const thumbY   = trackY + (trackH - thumbH) * (scroll / maxScroll);
      ctx.fillStyle = '#FF9800';
      _roundRect(ctx, trackX, thumbY, 5, thumbH, 2); ctx.fill();
    }

    ctx.fillStyle    = 'rgba(100,100,120,0.5)';
    ctx.font         = '8px Courier New';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Select item → click a hotbar slot below to assign  •  right-click slot to clear', CANVAS_W / 2, py + ph - 8);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  // ── Spawn egg config popup ────────────────────────────────────

  _drawPopup(ctx, input) {
    if (!this.popup) return;
    const { px, py, pw, ph } = this._popupLayout();
    const mx = input.mouse.x, my = input.mouse.y;

    const _btn = (label, bpx, bpy, bpw, bph, hovColor, baseColor) => {
      const hov = mx >= bpx && mx <= bpx + bpw && my >= bpy && my <= bpy + bph;
      ctx.fillStyle   = hov ? `${hovColor}33` : 'rgba(0,0,0,0.5)';
      _roundRect(ctx, bpx, bpy, bpw, bph, 5); ctx.fill();
      ctx.strokeStyle = hov ? hovColor : baseColor; ctx.lineWidth = 1.5;
      _roundRect(ctx, bpx, bpy, bpw, bph, 5); ctx.stroke();
      ctx.fillStyle    = hov ? '#fff' : '#ccc';
      ctx.font         = '11px Courier New';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, bpx + bpw / 2, bpy + bph / 2);
    };

    ctx.save();

    // ── Item drop popup ───────────────────────────────────────
    if (this.popup.kind === 'item') {
      const it = this.placedItems[this.popup.itemIdx];
      if (!it) { this.popup = null; ctx.restore(); return; }
      const isBlockItem = !!it.blockType;

      if (isBlockItem) {
        // Block-item popup (e.g. Arrow Stack) with count controls
        const bdata = BLOCK_DATA[it.blockType];
        const color = '#A07840';
        const popH  = 175;

        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.fillStyle = '#13131f';
        _roundRect(ctx, px, py, pw, popH, 8); ctx.fill();
        ctx.strokeStyle = color; ctx.lineWidth = 2;
        _roundRect(ctx, px, py, pw, popH, 8); ctx.stroke();

        // X button
        { const xbx = px + pw - 26, xby = py + 6;
          const xHov = mx >= xbx && mx <= xbx + 20 && my >= xby && my <= xby + 20;
          ctx.fillStyle = xHov ? 'rgba(255,80,80,0.3)' : 'rgba(0,0,0,0.4)';
          _roundRect(ctx, xbx, xby, 20, 20, 4); ctx.fill();
          ctx.strokeStyle = xHov ? '#FF5555' : '#554444'; ctx.lineWidth = 1;
          _roundRect(ctx, xbx, xby, 20, 20, 4); ctx.stroke();
          ctx.fillStyle = xHov ? '#fff' : '#AA7777';
          ctx.font = 'bold 12px Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('✕', xbx + 10, xby + 10); }

        ctx.fillStyle    = '#FFD700';
        ctx.font         = 'bold 12px Courier New';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('ITEM DROP', CANVAS_W / 2, py + 18);

        ctx.fillStyle = color;
        ctx.font      = 'bold 11px Courier New';
        ctx.fillText(bdata?.name ?? '?', CANVAS_W / 2, py + 44);

        // Count display
        ctx.fillStyle = '#fff';
        ctx.font      = 'bold 14px Courier New';
        ctx.fillText(`×${it.count ?? 1}`, CANVAS_W / 2, py + 66);

        // -10 / +10 buttons
        _btn('−10', px + 14, py + 84, 60, 32, '#FF8844', '#553322');
        _btn('+10', px + pw - 74, py + 84, 60, 32, '#44BB44', '#224422');

        _btn('✕  Remove', px + 14, py + 127, pw - 28, 32, '#FF6644', '#553333');

        ctx.fillStyle    = 'rgba(100,100,120,0.5)';
        ctx.font         = '8px Courier New';
        ctx.fillText('Click outside to close', CANVAS_W / 2, py + popH - 6);
        ctx.restore();
        return;
      }

      const data  = TOOL_DATA[it.toolKey] || ARMOR_DATA[it.toolKey];
      const color = data?.color ?? '#FFD700';
      const popH  = 130;

      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = '#13131f';
      _roundRect(ctx, px, py, pw, popH, 8); ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      _roundRect(ctx, px, py, pw, popH, 8); ctx.stroke();

      // X button
      { const xbx = px + pw - 26, xby = py + 6;
        const xHov = mx >= xbx && mx <= xbx + 20 && my >= xby && my <= xby + 20;
        ctx.fillStyle = xHov ? 'rgba(255,80,80,0.3)' : 'rgba(0,0,0,0.4)';
        _roundRect(ctx, xbx, xby, 20, 20, 4); ctx.fill();
        ctx.strokeStyle = xHov ? '#FF5555' : '#554444'; ctx.lineWidth = 1;
        _roundRect(ctx, xbx, xby, 20, 20, 4); ctx.stroke();
        ctx.fillStyle = xHov ? '#fff' : '#AA7777';
        ctx.font = 'bold 12px Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('✕', xbx + 10, xby + 10); }

      ctx.fillStyle    = '#FFD700';
      ctx.font         = 'bold 12px Courier New';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('ITEM DROP', CANVAS_W / 2, py + 18);

      ctx.fillStyle = color;
      ctx.font      = 'bold 11px Courier New';
      ctx.fillText(data?.name ?? it.toolKey, CANVAS_W / 2, py + 54);

      _btn('✕  Remove', px + 14, py + 84, pw - 28, 32, '#FF6644', '#553333');

      ctx.fillStyle    = 'rgba(100,100,120,0.5)';
      ctx.font         = '8px Courier New';
      ctx.fillText('Click outside to close', CANVAS_W / 2, py + popH - 6);
      ctx.restore();
      return;
    }

    // ── Emerald popup (Phase 3A.2) — remove only ──────────────
    if (this.popup.kind === 'emerald') {
      const em = this.placedEmeralds[this.popup.emeraldIdx];
      if (!em) { this.popup = null; ctx.restore(); return; }
      const popH = 168;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = '#13131f'; _roundRect(ctx, px, py, pw, popH, 8); ctx.fill();
      ctx.strokeStyle = '#2ecc71'; ctx.lineWidth = 2; _roundRect(ctx, px, py, pw, popH, 8); ctx.stroke();
      ctx.fillStyle = '#FFD700'; ctx.font = 'bold 12px Courier New';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('EMERALD', CANVAS_W / 2, py + 18);
      _drawEmeraldIcon(ctx, CANVAS_W / 2, py + 48, 0, false);
      ctx.fillStyle = '#2ecc71'; ctx.font = 'bold 11px Courier New';
      ctx.fillText(`Group ${em.group || 1}  (Collect-Emeralds rounds)`, CANVAS_W / 2, py + 74);
      _btn('⟳  Change Group', px + 14, py + 88,  pw - 28, 30, '#7ec8e3', '#445566');
      _btn('✕  Remove',       px + 14, py + 124, pw - 28, 30, '#FF6644', '#553333');
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.restore();
      return;
    }

    // ── Power-up popup (Phase 3A.2) — change type + remove ────
    if (this.popup.kind === 'powerup') {
      const pu = this.placedPowerups[this.popup.powerupIdx];
      if (!pu) { this.popup = null; ctx.restore(); return; }
      const def = _powerupDef(pu.powerType);
      const popH = 168;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = '#13131f'; _roundRect(ctx, px, py, pw, popH, 8); ctx.fill();
      ctx.strokeStyle = def.color; ctx.lineWidth = 2; _roundRect(ctx, px, py, pw, popH, 8); ctx.stroke();
      ctx.fillStyle = '#FFD700'; ctx.font = 'bold 12px Courier New';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('POWER-UP', CANVAS_W / 2, py + 18);
      _drawPowerupIcon(ctx, CANVAS_W / 2, py + 48, pu.powerType, 0, false);
      ctx.fillStyle = def.color; ctx.font = 'bold 11px Courier New';
      ctx.fillText(def.label, CANVAS_W / 2, py + 74);
      _btn('⟳  Change Type', px + 14, py + 88,  pw - 28, 30, '#7ec8e3', '#445566');
      _btn('✕  Remove',      px + 14, py + 124, pw - 28, 30, '#FF6644', '#553333');
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.restore();
      return;
    }

    // ── Hill popup (Phase 3A.3) — resizable W×H control zone ──
    if (this.popup.kind === 'hill') {
      const hw = this.placedHill?.w || 4, hh = this.placedHill?.h || 1;
      const popH = 200;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = '#13131f'; _roundRect(ctx, px, py, pw, popH, 8); ctx.fill();
      ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 2; _roundRect(ctx, px, py, pw, popH, 8); ctx.stroke();
      ctx.fillStyle = '#FFD700'; ctx.font = 'bold 12px Courier New';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('HILL (King of the Hill)', CANVAS_W / 2, py + 22);
      ctx.fillStyle = '#cfcf9f'; ctx.font = '9px Courier New';
      ctx.fillText('Control zone — stand inside to hold', CANVAS_W / 2, py + 40);
      const _hrow = (label, valueText, by) => {
        ctx.fillStyle = '#9fb0c0'; ctx.font = '9px Courier New';
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(label, CANVAS_W / 2, by - 3);
        _btn('−', px + 14, by, 28, 24, '#7ec8e3', '#445566');
        _btn('+', px + pw - 42, by, 28, 24, '#7ec8e3', '#445566');
        ctx.fillStyle = '#fff'; ctx.font = 'bold 12px Courier New';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(valueText, CANVAS_W / 2, by + 12);
      };
      _hrow('Width',  `${hw} blocks`, py + 60);
      _hrow('Height', `${hh} blocks`, py + 108);
      _btn('✕  Remove', px + 14, py + 160, pw - 28, 30, '#FF6644', '#553333');
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.restore();
      return;
    }

    // ── Spawn-line popup (Phase 3A.3) — cycle line + remove ───
    if (this.popup.kind === 'spawnline') {
      const sl = this.placedSpawnLines[this.popup.spawnLineIdx];
      if (!sl) { this.popup = null; ctx.restore(); return; }
      const popH = 168;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = '#13131f'; _roundRect(ctx, px, py, pw, popH, 8); ctx.fill();
      ctx.strokeStyle = '#9b59b6'; ctx.lineWidth = 2; _roundRect(ctx, px, py, pw, popH, 8); ctx.stroke();
      ctx.fillStyle = '#FFD700'; ctx.font = 'bold 12px Courier New';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('SPAWN LINE', CANVAS_W / 2, py + 22);
      ctx.fillStyle = '#c9a0e8'; ctx.font = 'bold 11px Courier New';
      ctx.fillText(`Line ${sl.line || 1}  (Survival Waves)`, CANVAS_W / 2, py + 66);
      _btn('⟳  Change Line', px + 14, py + 88,  pw - 28, 30, '#7ec8e3', '#445566');
      _btn('✕  Remove',      px + 14, py + 124, pw - 28, 30, '#FF6644', '#553333');
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.restore();
      return;
    }

    // ── Player spawn-point popup (Phase 3) — cycle slot + remove ───
    if (this.popup.kind === 'spawnpoint') {
      const sp = this.placedSpawnPoints[this.popup.spawnPointIdx];
      if (!sp) { this.popup = null; ctx.restore(); return; }
      const popH = 168;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = '#13131f'; _roundRect(ctx, px, py, pw, popH, 8); ctx.fill();
      ctx.strokeStyle = '#4aa3ff'; ctx.lineWidth = 2; _roundRect(ctx, px, py, pw, popH, 8); ctx.stroke();
      ctx.fillStyle = '#FFD700'; ctx.font = 'bold 12px Courier New';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('PLAYER SPAWN', CANVAS_W / 2, py + 22);
      ctx.fillStyle = '#a9d3ff'; ctx.font = 'bold 11px Courier New';
      ctx.fillText(`Player ${sp.slot || 1}  (Arena: this player starts here)`, CANVAS_W / 2, py + 66);
      _btn('⟳  Change Player #', px + 14, py + 88,  pw - 28, 30, '#7ec8e3', '#445566');
      _btn('✕  Remove',         px + 14, py + 124, pw - 28, 30, '#FF6644', '#553333');
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.restore();
      return;
    }

    // ── Arena-object popup (Base / Tower / Heal) ──────────────
    if (this.popup.kind === 'arenaobj') {
      const o = this.placedArenaObjs[this.popup.arenaObjIdx];
      if (!o) { this.popup = null; ctx.restore(); return; }
      const popH = 168;
      const titles = { base: 'CTF BASE', tower: 'TOWER', heal: 'HEAL TOWER' };
      const accent = { base: '#e74c3c', tower: '#f5d142', heal: '#2ecc71' }[o.type] || '#7ec8e3';
      const teamNames = (typeof CTF_TEAM_NAMES !== 'undefined') ? CTF_TEAM_NAMES : ['Red', 'Blue'];
      let sub = '';
      if (o.type === 'base')  sub = `${teamNames[o.team || 0]} team  (flag spawns at centre)`;
      if (o.type === 'tower') sub = `Owner: Player ${o.slot || 1}`;
      if (o.type === 'heal')  sub = 'Repairs the owner\'s tower one band';
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = '#13131f'; _roundRect(ctx, px, py, pw, popH, 8); ctx.fill();
      ctx.strokeStyle = accent; ctx.lineWidth = 2; _roundRect(ctx, px, py, pw, popH, 8); ctx.stroke();
      ctx.fillStyle = '#FFD700'; ctx.font = 'bold 12px Courier New';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(titles[o.type] || 'ARENA OBJECT', CANVAS_W / 2, py + 22);
      ctx.fillStyle = accent; ctx.font = 'bold 11px Courier New';
      ctx.fillText(sub, CANVAS_W / 2, py + 66);
      if (o.type !== 'heal') _btn(o.type === 'base' ? '⟳  Change Team' : '⟳  Change Owner', px + 14, py + 88, pw - 28, 30, '#7ec8e3', '#445566');
      _btn('✕  Remove', px + 14, py + 124, pw - 28, 30, '#FF6644', '#553333');
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.restore();
      return;
    }

    // ── Egg popup ─────────────────────────────────────────────
    const egg = this.placedEggs[this.popup.eggIdx];
    if (!egg) { this.popup = null; ctx.restore(); return; }
    const def = SPAWN_EGG_DEFS.find(d => d.key === egg.mobType) || SPAWN_EGG_DEFS[0];
    const eggH = 244; // taller than the default ph to fit the arena spawner steppers

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#13131f';
    _roundRect(ctx, px, py, pw, eggH, 8); ctx.fill();
    ctx.strokeStyle = def.color; ctx.lineWidth = 2;
    _roundRect(ctx, px, py, pw, eggH, 8); ctx.stroke();

    // X button
    { const xbx = px + pw - 26, xby = py + 6;
      const xHov = mx >= xbx && mx <= xbx + 20 && my >= xby && my <= xby + 20;
      ctx.fillStyle = xHov ? 'rgba(255,80,80,0.3)' : 'rgba(0,0,0,0.4)';
      _roundRect(ctx, xbx, xby, 20, 20, 4); ctx.fill();
      ctx.strokeStyle = xHov ? '#FF5555' : '#554444'; ctx.lineWidth = 1;
      _roundRect(ctx, xbx, xby, 20, 20, 4); ctx.stroke();
      ctx.fillStyle = xHov ? '#fff' : '#AA7777';
      ctx.font = 'bold 12px Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('✕', xbx + 10, xby + 10); }

    ctx.fillStyle    = '#FFD700';
    ctx.font         = 'bold 12px Courier New';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SPAWN EGG', CANVAS_W / 2, py + 18);

    _drawEgg(ctx, CANVAS_W / 2, py + 46, def, 0, false);

    ctx.fillStyle = def.color;
    ctx.font      = 'bold 11px Courier New';
    ctx.fillText(def.label, CANVAS_W / 2, py + 74);

    _btn('⟳  Change Mob Type', px + 14, py + 84, pw - 28, 28, '#7ec8e3', '#445566');

    // Arena spawner steppers (Phase 3A.2): mobs per 10s + active cap.
    const freq = egg.spawnFrequency ?? 2;
    const maxA = egg.maxActiveMobs  ?? 3;
    const _row = (label, valueText, by) => {
      ctx.fillStyle = '#9fb0c0'; ctx.font = '9px Courier New';
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(label, CANVAS_W / 2, by - 3);
      _btn('−', px + 14,      by, 28, 24, '#7ec8e3', '#445566');
      _btn('+', px + pw - 42, by, 28, 24, '#7ec8e3', '#445566');
      ctx.fillStyle = '#fff'; ctx.font = 'bold 12px Courier New';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(valueText, CANVAS_W / 2, by + 12);
    };
    _row('Spawn rate', `${freq} / 10s`, py + 120);
    _row('Max active', `${maxA}`,        py + 160);

    _btn('✕  Remove', px + 14, py + 196, pw - 28, 30, '#FF6644', '#553333');

    ctx.fillStyle    = 'rgba(100,100,120,0.5)';
    ctx.font         = '8px Courier New';
    ctx.textAlign    = 'center';
    ctx.fillText('Click outside to close', CANVAS_W / 2, py + eggH - 6);

    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }
}

// ── Shared egg sprite renderer ────────────────────────────────────

function _drawEgg(ctx, sx, sy, def, frameCount, highlighted) {
  ctx.save();
  const bob = Math.sin((frameCount || 0) * 0.05) * 2;
  if (highlighted) {
    ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(sx, sy + bob, 19, 23, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = def.color;
  ctx.beginPath(); ctx.ellipse(sx, sy + bob, 14, 18, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath(); ctx.ellipse(sx - 4, sy - 4 + bob, 3, 4, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(sx + 4, sy + 2 + bob, 3, 4,  0.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath(); ctx.ellipse(sx - 4, sy - 6 + bob, 3, 5, -0.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle    = 'rgba(255,255,255,0.85)';
  ctx.font         = 'bold 7px Courier New';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(def.label.split(' ')[0].substring(0, 7), sx, sy + 20 + bob);
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

// ── Shared arena-collectible sprites (Phase 3A.2) ─────────────────
// Defined at module scope so the runtime EMERALD_SYSTEM / POWERUP_SYSTEM
// (separate files) reuse the exact same look the editor shows.
function _drawEmeraldIcon(ctx, sx, sy, frameCount, highlighted) {
  ctx.save();
  const y = sy + Math.sin((frameCount || 0) * 0.05) * 3;
  if (highlighted) { ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 3; ctx.strokeRect(sx - 13, y - 15, 26, 30); }
  ctx.fillStyle = '#2ecc71';
  ctx.beginPath();
  ctx.moveTo(sx, y - 12); ctx.lineTo(sx + 9, y); ctx.lineTo(sx, y + 12); ctx.lineTo(sx - 9, y); ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#196f3d'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath(); ctx.moveTo(sx, y - 12); ctx.lineTo(sx + 9, y); ctx.lineTo(sx, y); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function _powerupDef(type) {
  return (typeof SB_POWERUP_TYPES !== 'undefined'
    ? SB_POWERUP_TYPES.find(t => t.type === type)
    : null) || { type: 'HEALTH', label: 'Health', color: '#e74c3c', symbol: '✚' };
}

// Hill platform: 4 blocks wide × 1 tall, anchored at top-left (sx,sy) in screen px.
// `color` tints it (designer gold; in-game it can take the controller's colour). Phase 3A.3.
function _drawHillPlatform(ctx, sx, sy, color, wBlocks, hBlocks) {
  ctx.save();
  const w = (wBlocks || 4) * BLOCK_SIZE, h = (hBlocks || 1) * BLOCK_SIZE;
  ctx.fillStyle = color || '#f1c40f';
  ctx.globalAlpha = h > BLOCK_SIZE ? 0.45 : 0.85; // taller zones are translucent so you see inside
  ctx.fillRect(sx, sy, w, h);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#fff7c0'; ctx.lineWidth = 2; ctx.strokeRect(sx + 1, sy + 1, w - 2, h - 2);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.font = 'bold 11px Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('★ HILL', sx + w / 2, sy + h / 2);
  ctx.restore();
}

// Survival-wave spawn marker: a swirling portal-ish disc tagged with its line number. Phase 3A.3.
function _drawSpawnLineMarker(ctx, sx, sy, lineNum, frameCount) {
  ctx.save();
  const t = (frameCount || 0) * 0.08;
  ctx.translate(sx, sy);
  ctx.fillStyle = 'rgba(155,89,182,0.85)';
  ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#d2a8e8'; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let a = 0; a < Math.PI * 2; a += 0.5) {
    const r = 6 + 4 * Math.sin(a * 2 + t);
    const x = Math.cos(a + t) * r, y = Math.sin(a + t) * r;
    a === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath(); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(lineNum || 1), 0, 0);
  ctx.restore();
}

// Player spawn point marker: a blue banner/flag pin tagged with the player number. Phase 3.
// Deliberately visually distinct from the purple Survival "Spawn Line" swirl.
function _drawSpawnPointMarker(ctx, sx, sy, slot, frameCount) {
  ctx.save();
  ctx.translate(sx, sy);
  const bob = Math.sin((frameCount || 0) * 0.06) * 1.5;
  // Pin base
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(0, 14, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
  // Pole
  ctx.strokeStyle = '#2b3d55'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 14); ctx.lineTo(0, -14 + bob); ctx.stroke();
  // Flag/banner
  ctx.fillStyle = '#4aa3ff';
  ctx.beginPath();
  ctx.moveTo(0, -14 + bob); ctx.lineTo(15, -10 + bob); ctx.lineTo(0, -4 + bob);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#bfe0ff'; ctx.lineWidth = 1; ctx.stroke();
  // Player number badge at the base
  ctx.fillStyle = '#0d1b2e';
  ctx.beginPath(); ctx.arc(0, 4, 8, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#4aa3ff'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('P' + (slot || 1), 0, 5);
  ctx.restore();
}

// Arena object marker (Phase 3 v3): CTF Base (3×2 glow zone + team flag at its
// centre), Tower (4-tall battlemented structure with owner banner), or Heal
// Tower (green cross). `small` draws a compact glyph for palette/hotbar slots.
function _drawArenaObjMarker(ctx, sx, sy, o, frameCount, small) {
  const BS = (typeof BLOCK_SIZE !== 'undefined') ? BLOCK_SIZE : 32;
  const teamCols = (typeof CTF_TEAM_COLORS !== 'undefined') ? CTF_TEAM_COLORS : ['#e74c3c', '#3498db'];
  const ownerCols = { 1: '#42a0ff', 2: '#ff5a5a', 3: '#5aff7a', 4: '#f5d142' };
  ctx.save();
  ctx.translate(sx, sy);
  if (o.type === 'base') {
    const col = teamCols[o.team || 0];
    if (small) {
      ctx.fillStyle = col + '33'; ctx.fillRect(-11, -6, 22, 12);
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.setLineDash([3, 2]); ctx.strokeRect(-11, -6, 22, 12); ctx.setLineDash([]);
      ctx.strokeStyle = '#2b2b3a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(0, -8); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(9, -5); ctx.lineTo(0, -2); ctx.closePath(); ctx.fill();
    } else {
      const w = 3 * BS, h = 2 * BS;
      ctx.fillStyle = col + '22'; ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.strokeStyle = col + 'cc'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.strokeRect(-w / 2, -h / 2, w, h); ctx.setLineDash([]);
      // Flag at centre (inherent to the base)
      const bob = Math.sin((frameCount || 0) * 0.12) * 2;
      ctx.strokeStyle = '#2b2b3a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 16); ctx.lineTo(0, -18); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(16 + bob, -13); ctx.lineTo(2, -6); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
    }
  } else if (o.type === 'tower') {
    const oc = ownerCols[o.slot || 1] || '#cccccc';
    const w = small ? 12 : BS, h = small ? 22 : BS * 4;
    ctx.fillStyle = '#8a8175'; ctx.fillRect(-w / 2, -h, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
    for (let r = 0; r <= 4; r++) { const ly = -h + (h / 4) * r; ctx.beginPath(); ctx.moveTo(-w / 2, ly); ctx.lineTo(w / 2, ly); ctx.stroke(); }
    ctx.strokeRect(-w / 2 + 0.5, -h + 0.5, w - 1, h - 1);
    // battlements
    ctx.fillStyle = '#8a8175'; ctx.fillRect(-w / 2 - 2, -h - 4, 4, 6); ctx.fillRect(-2, -h - 4, 4, 6); ctx.fillRect(w / 2 - 2, -h - 4, 4, 6);
    // owner banner
    ctx.fillStyle = oc; ctx.fillRect(-5, -h + 5, 10, 12);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(-5, -h + 5, 10, 12);
    if (!small) {
      ctx.fillStyle = '#fff'; ctx.font = 'bold 9px Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('P' + (o.slot || 1), 0, -h + 11);
    }
  } else { // heal
    const r = small ? 8 : 10;
    const bob = small ? 0 : Math.sin((frameCount || 0) * 0.08) * 2;
    ctx.fillStyle = 'rgba(40,220,90,0.95)';
    ctx.fillRect(-r / 3, -r + bob, (r / 3) * 2, r * 2);
    ctx.fillRect(-r, -r / 3 + bob, r * 2, (r / 3) * 2);
    ctx.strokeStyle = '#0a3'; ctx.lineWidth = 1;
    ctx.strokeRect(-r / 3, -r + bob, (r / 3) * 2, r * 2);
    ctx.strokeRect(-r, -r / 3 + bob, r * 2, (r / 3) * 2);
  }
  ctx.restore();
}

function _drawPowerupIcon(ctx, sx, sy, type, frameCount, highlighted) {
  ctx.save();
  const y = sy + Math.sin((frameCount || 0) * 0.05) * 3;
  const def = _powerupDef(type);
  if (highlighted) { ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx, y, 15, 0, Math.PI * 2); ctx.stroke(); }
  ctx.fillStyle = def.color;
  ctx.beginPath(); ctx.arc(sx, y, 11, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(def.symbol, sx, y + 1);
  ctx.restore();
}
