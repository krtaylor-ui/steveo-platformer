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
const GEAR_PALETTE_ITEMS = [
  ...Object.keys(TOOL_DATA).map(key => ({
    kind: 'tool', key,
    name:  TOOL_DATA[key].name,
    type:  TOOL_DATA[key].type,
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
  // ── Spawn Eggs ───────────────────────────────────────────────
  ...SPAWN_EGG_DEFS.map(d => ({ kind: 'egg', ...d })),
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
    this.brushSize             = 1;     // 1 | 2 | 4

    // Quick-access hotbar (8 block slots)
    this.sbHotbar    = Array(SB_SLOTS).fill(null);
    this.sbHotbarSel = 0;
    this.sbHotbar[0] = { kind: 'block', value: BLOCK.GRASS };   // seed first slot

    // Palette panel
    this.paletteOpen = false;
    this.paletteTab  = 'overworld';  // 'overworld'|'nether'|'gear'|'other'

    // Placed spawn eggs: [{col,row,wx,wy,mobType}]
    this.placedEggs = [];

    // Placed weapon/tool drops: [{col,row,wx,wy,toolKey,bobOffset}]
    this.placedItems = [];

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

  // Returns a hotbar entry object representing the current selection.
  _currentSelectionEntry() {
    if (this.isBlockItemSelected) return { kind: 'blockItem', value: this.selectedBlockItemType, count: this.selectedBlockItemCount };
    if (this.isToolSelected)      return { kind: 'tool',      value: this.selectedToolKey };
    if (this.isEggSelected)       return { kind: 'egg',       value: this.selectedEggKey  };
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
           !this.isGateSelected && !this.isBlockItemSelected && !!SB_MULTI_FOOTPRINT[this.selectedBlock];
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
        return null;
      }
    }

    // Remove button (disabled for ruined portals)
    const removeY = py + ph - 52;
    if (!portal.ruined && mx >= px + 12 && mx <= px + pw - 12 && my >= removeY && my <= removeY + 32) {
      return 'remove';
    }

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
    for (let i = 0; i < TABS.length; i++) {
      const tx = px + 8 + i * 91;
      const ty = py + 32;
      if (mx >= tx && mx <= tx + 87 && my >= ty && my <= ty + 26) {
        this.paletteTab = TABS[i];
        return true;
      }
    }

    // Block / egg / tool grid
    const gridY  = py + 66;
    const slotSz = 44;
    const startX = px + 8;
    const isSpecial = this.paletteTab === 'other' || this.paletteTab === 'gear';
    const items  = this.paletteTab === 'other' ? OTHER_PALETTE_ITEMS
                 : this.paletteTab === 'gear'  ? GEAR_PALETTE_ITEMS
                 : (SANDBOX_PALETTE_BLOCKS[this.paletteTab] || []);

    for (let i = 0; i < items.length; i++) {
      const gx = startX + (i % 8) * slotSz;
      const gy = gridY + Math.floor(i / 8) * slotSz;
      if (mx >= gx && mx <= gx + slotSz - 2 && my >= gy && my <= gy + slotSz - 2) {
        if (isSpecial) {
          const item = items[i];
          this.selectedDust     = false;
          this.selectedGateType = null;
          if (item.kind === 'tool') {
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

    // Egg popup
    // X close button
    if (mx >= px + pw - 26 && mx <= px + pw - 6 && my >= py + 6 && my <= py + 26) {
      this.closePopup(); return true;
    }
    if (mx < px || mx > px + pw || my < py || my > py + 170) {
      this.closePopup();
      return false;
    }
    // Cycle button
    if (mx >= px + 14 && mx <= px + pw - 14 && my >= py + 84 && my <= py + 116) {
      this.cycleEggType(this.popup.eggIdx);
      return true;
    }
    // Remove button
    if (mx >= px + 14 && mx <= px + pw - 14 && my >= py + 124 && my <= py + 156) {
      this.removeEgg(this.popup.eggIdx);
      return true;
    }
    return true;
  }

  // ── Layouts ──────────────────────────────────────────────────

  _paletteLayout() {
    const pw = 380, ph = 290;
    return { px: (CANVAS_W - pw) / 2, py: (CANVAS_H - ph) / 2 - 10, pw, ph };
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

  draw(ctx, camera, input, player, frameCount) {
    this._drawPlacedItems(ctx, camera, frameCount);
    this._drawPlacedEggs(ctx, camera, frameCount);
    this._drawPortalLabels(ctx, camera);
    this._drawHUD(ctx, player, frameCount, input);
    if (this.paletteOpen)  this._drawPalette(ctx, input);
    if (this.popup)        this._drawPopup(ctx, input);
    if (this.portalPopup)  this._drawPortalPopup(ctx, input);
  }

  _drawPlacedItems(ctx, camera, frameCount) {
    for (let i = 0; i < this.placedItems.length; i++) {
      const it  = this.placedItems[i];
      const sx  = it.wx - camera.x;
      const sy  = it.wy - camera.y;
      if (sx < -30 || sx > CANVAS_W + 30 || sy < -30 || sy > CANVAS_H + 30) continue;
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
                    : data?.type === 'sword'   ? '⚔'
                    : data?.type === 'bow'     ? '🏹'
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
        ctx.fillText(sym, cx, cy);
      }
      ctx.restore();
    }
  }

  _drawPlacedEggs(ctx, camera, frameCount) {
    for (let i = 0; i < this.placedEggs.length; i++) {
      const e  = this.placedEggs[i];
      const sx = e.wx - camera.x;
      const sy = e.wy - camera.y;
      if (sx < -50 || sx > CANVAS_W + 50 || sy < -50 || sy > CANVAS_H + 50) continue;
      const def = SPAWN_EGG_DEFS.find(d => d.key === e.mobType) || SPAWN_EGG_DEFS[0];
      const sel = this.popup?.kind === 'egg' && this.popup.eggIdx === i;
      _drawEgg(ctx, sx, sy, def, frameCount, sel);
    }
  }

  // ── Portal labels (rendered over world blocks in sandbox) ────

  _drawPortalLabels(ctx, camera) {
    for (const p of this.sandboxPortals) {
      // Centre of the 4×5 portal footprint
      const cx = (p.anchorCol + 2) * BLOCK_SIZE - camera.x;
      const cy = (p.anchorRow + 2.5) * BLOCK_SIZE - camera.y;
      if (cx < -50 || cx > CANVAS_W + 50 || cy < -50 || cy > CANVAS_H + 50) continue;

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

    // Remove portal button (hidden for ruined portals \u2014 frame obsidian is protected)
    const removeY = py + ph - 52;
    if (portal.ruined) {
      ctx.fillStyle = 'rgba(80,60,100,0.25)';
      _roundRect(ctx, px + 12, removeY, pw - 24, 32, 5); ctx.fill();
      ctx.strokeStyle = '#443355'; ctx.lineWidth = 1;
      _roundRect(ctx, px + 12, removeY, pw - 24, 32, 5); ctx.stroke();
      ctx.fillStyle = '#665577'; ctx.font = '10px Courier New';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Complete & activate with Flint & Steel (U)', CANVAS_W / 2, removeY + 16);
    } else {
      const remHov  = mx >= px + 12 && mx <= px + pw - 12 && my >= removeY && my <= removeY + 32;
      ctx.fillStyle   = remHov ? 'rgba(220,50,50,0.3)' : 'rgba(0,0,0,0.4)';
      _roundRect(ctx, px + 12, removeY, pw - 24, 32, 5); ctx.fill();
      ctx.strokeStyle = remHov ? '#FF4444' : '#553333'; ctx.lineWidth = 1.5;
      _roundRect(ctx, px + 12, removeY, pw - 24, 32, 5); ctx.stroke();
      ctx.fillStyle    = remHov ? '#fff' : '#cc6666';
      ctx.font         = '11px Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('\u2715  Remove Portal', CANVAS_W / 2, removeY + 16);
    }

    // Footer
    ctx.fillStyle    = 'rgba(100,100,120,0.5)';
    ctx.font         = '8px Courier New';
    ctx.fillText('Click outside to close', CANVAS_W / 2, py + ph - 8);

    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
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
                      : data?.type === 'pickaxe' ? '⛏' : data?.type === 'sword' ? '⚔'
                      : data?.type === 'bow' ? '🏹' : '🛡';
          const ecx = sx + SB_SLOT_SIZE / 2, ecy = sy + SB_SLOT_SIZE / 2;
          ctx.fillStyle    = color;
          ctx.font         = '20px serif';
          ctx.textAlign    = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(sym, ecx, ecy);
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
    for (let i = 0; i < TABS.length; i++) {
      const tx  = px + 8 + i * 91;
      const ty  = py + 32;
      const tab = TABS[i];
      const act = this.paletteTab === tab.key;
      const hov = mx >= tx && mx <= tx + 87 && my >= ty && my <= ty + 26;
      ctx.fillStyle   = act ? `${tab.color}33` : (hov ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.3)');
      _roundRect(ctx, tx, ty, 87, 26, 4); ctx.fill();
      ctx.strokeStyle = act ? tab.color : (hov ? '#888' : '#333');
      ctx.lineWidth   = act ? 2 : 1;
      _roundRect(ctx, tx, ty, 87, 26, 4); ctx.stroke();
      ctx.fillStyle = act ? tab.color : (hov ? '#ccc' : '#666');
      ctx.font      = act ? 'bold 10px Courier New' : '10px Courier New';
      ctx.fillText(tab.label, tx + 43, ty + 13);
    }

    // Item grid
    const gridY  = py + 66;
    const slotSz = 44;
    const startX = px + 8;
    const isOther = this.paletteTab === 'other';
    const isGear  = this.paletteTab === 'gear';
    const items  = isOther ? OTHER_PALETTE_ITEMS
                 : isGear  ? GEAR_PALETTE_ITEMS
                 : (SANDBOX_PALETTE_BLOCKS[this.paletteTab] || []);

    for (let i = 0; i < items.length; i++) {
      const gx  = startX + (i % 8) * slotSz;
      const gy  = gridY + Math.floor(i / 8) * slotSz;
      const hov = mx >= gx && mx <= gx + slotSz - 2 && my >= gy && my <= gy + slotSz - 2;
      const isSpecialTab = isOther || isGear;
      const itm = isSpecialTab ? items[i] : null;

      let selected;
      if (isSpecialTab) {
        if (itm.kind === 'tool')       selected = this.isToolSelected      && this.selectedToolKey      === itm.key;
        else if (itm.kind === 'egg')   selected = this.isEggSelected       && this.selectedEggKey       === itm.key;
        else if (itm.kind === 'dust')  selected = this.isDustSelected;
        else if (itm.kind === 'gate')  selected = this.isGateSelected      && this.selectedGateType     === itm.gateType;
        else if (itm.kind === 'blockItem') selected = this.isBlockItemSelected && this.selectedBlockItemType === itm.blockType;
        else selected = !this.isEggSelected && !this.isToolSelected && !this.isDustSelected &&
                        !this.isGateSelected && !this.isBlockItemSelected && this.selectedBlock === itm.blockType;
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
                  : itm.type === 'pickaxe' ? '⛏' : itm.type === 'sword' ? '⚔' : itm.type === 'bow' ? '🏹' : '🛡';
        ctx.fillText(sym, cxc, cyc + 9);
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

    // ── Egg popup ─────────────────────────────────────────────
    const egg = this.placedEggs[this.popup.eggIdx];
    if (!egg) { this.popup = null; ctx.restore(); return; }
    const def = SPAWN_EGG_DEFS.find(d => d.key === egg.mobType) || SPAWN_EGG_DEFS[0];

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#13131f';
    _roundRect(ctx, px, py, pw, ph, 8); ctx.fill();
    ctx.strokeStyle = def.color; ctx.lineWidth = 2;
    _roundRect(ctx, px, py, pw, ph, 8); ctx.stroke();

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

    _btn('⟳  Change Mob Type', px + 14, py + 84,  pw - 28, 32, '#7ec8e3', '#445566');
    _btn('✕  Remove',          px + 14, py + 124, pw - 28, 32, '#FF6644', '#553333');

    ctx.fillStyle    = 'rgba(100,100,120,0.5)';
    ctx.font         = '8px Courier New';
    ctx.fillText('Click outside to close', CANVAS_W / 2, py + ph - 6);

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
