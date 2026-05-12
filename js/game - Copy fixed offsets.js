// ============================================================
// game.js — Main game loop, rendering orchestration, HUD
// ============================================================

const SLOT_SIZE = 46;
const SLOT_GAP  = 3;
const HOTBAR_Y  = CANVAS_H - SLOT_SIZE - 10;
const HOTBAR_X  = (CANVAS_W - (9 * SLOT_SIZE + 8 * SLOT_GAP)) / 2;

class Game {
  constructor(mode = 'normal', options = {}, onReturnToMenu = null) {
    this.canvas          = document.getElementById('gameCanvas');
    this.ctx             = this.canvas.getContext('2d');
    this.input           = new InputManager(this.canvas);
    this.gameMode        = mode;          // 'normal' | 'sandbox' | 'platformer'
    this._onReturnToMenu = onReturnToMenu;
    this._running        = true;

    this._buildLevel();

    this.state         = 'playing'; // 'playing' | 'won' | 'dead' | 'paused' | 'confirmExit'
    this.frameCount    = 0;
    this.clouds        = this._makeClouds();
    this.craftingMenu  = new CraftingMenu();
    this.notifications = [];         // { text, color, life, maxLife }
    this._tooWeakNotified = false;
    this._lKeyWas      = false;
    this._spaceWasBow  = false;
    this._uWas         = false;
    this._fWas         = false;
    this._escWas       = false;
    this._godWas       = false;

    // Inventory UI
    this.inventoryOpen = false;
    this._iKeyWas      = false;
    this._invHeld      = null;   // { type, count } being dragged
    this._invHeldSrc   = null;   // { loc:'hotbar'|'inventory', index }

    // Chest system
    this._chests     = new Map();  // 'col,row' → {col, row, items: Array(8).fill(null)}
    this._chestOpen  = null;       // {col, row} of open chest, or null
    this._eChestWas  = false;
    // Sandbox chest: item being held for placement
    this._sbChestHeld = null;     // null | { item, source: 'palette'|'chest' }

    // Bed spawns — set by _buildLevel(); do NOT re-initialize here
    // (bedSpawns and _activeSpawnBed are already set by the _buildLevel() call above)

    // Ruined portal registry (all modes)
    this._ruinedPortals       = new Map(); // "anchorRow,anchorCol" → {anchorRow,anchorCol,activated}
    this._portalObsidianCells = new Set(); // "col,row" → non-solid portal frame obsidian

    // End Portal anchor registry (sandbox + normal modes)
    this._endPortalAnchors = new Map(); // "anchorCol,anchorRow" → {col,row,eyeCount,active}

    // Ender Dragon (Phase 11A-2)
    this._dragon              = null;
    this._dragonBodySprites   = new Array(5).fill(null);
    this._dragonHeadSprites   = new Array(2).fill(null);
    this._dragonSpritesLoaded = false;
    this._loadDragonSprites();

    // T-key God Mode teleport menu
    this._teleportMenu = false;
    this._tWas         = false;

    // Redstone dust overlay (all modes)
    this._dustBlocks = new Map();  // "col,row" → {col,row,on,everTriggered,setting}
    this._dustPopup  = null;       // null | {col,row} — sandbox settings popup
    // Logic gate overlay (all modes)
    this._gateBlocks = new Map();  // "col,row" → gate object
    this._gateConfigPopup = null;  // null | {col,row,assignments} — config popup during placement
    // Dust connection topology cache — rebuilt only when blocks change, not every frame
    this._dustConnCache = new Map(); // integer key → {left,right,up,down}
    this._dustConnDirty = true;
    // Transmitter / Receiver blocks (all modes)
    this._transmitters = new Map(); // "col,row" → {col,row,number,powered}
    this._receivers    = new Map(); // "col,row" → {col,row,listenTo:Set,powered}
    this._rxConfigPopup      = null;   // null | {col,row}
    this._pistonConfigPopup  = null;   // null | {col,row} — direction selection for sandbox pistons
    // Propagation queue: dust state changes and device responses scheduled by frame
    this._rsQueue    = [];         // [{col,row,powered,frame} | {type:'device',comp,frame} | {type:'gate',...}]

    // Sandbox-specific setup
    this.sandbox         = null;
    this._sbPlayerName   = options.playerName || 'Player';
    this._sbWorldName    = options.worldName  || 'World';
    this._saveDialog     = null;   // null | { fields:[playerName,worldName], active:0 }
    this._saveKbListener = null;

    this._showHelp = false; // toggled by ? (Shift+/)

    // Undo / redo history (sandbox mode only)
    this._historyStack  = [];   // array of {gridDeltas, overlayBefore, overlayAfter}
    this._historyPos    = -1;   // index of last applied action; -1 = nothing
    this._pendingAction = null; // staging area while an action is executing

    // Auto-paint stroke (Shift+drag, sandbox only)
    this._autoPaintMode     = null;  // null | 'place' | 'erase'
    this._autoPaintLastCell = null;  // {row, col} last painted cell (avoid re-paint same cell)
    this._strokeState       = null;  // null | {gridBefore: Map, overlayBefore} — stroke in progress

    // Copy/paste (sandbox only)
    this._sbSelStart   = null;  // {row, col} — anchor of Ctrl+Drag selection
    this._copySelection = null; // null | {r1, c1, r2, c2} — finalized selection rectangle
    this._copyBuffer    = null; // null | {width, height, blocks, rsComps, dust, gates, tx, rx, chests, eggs, items}
    this._pasteMode     = false; // true = paste preview active, waiting for click to place

    // Normal mode playing a sandbox world
    this._sandboxLoadKey  = options.sandboxLoadKey || null;
    this._normalNewGame   = options.newGame || false; // true = fresh start, skip checkpoint
    this._normalPortals   = [];   // [{anchorRow, anchorCol, biome, label, destLabel}] for portal routing

    // Platformer mode playing a sandbox world
    this._platformerLoadKey  = options.platformerLoadKey || null;
    this._platformerItems    = [];   // [{wx, wy, toolKey, collected, phase}]
    this._deathCause           = null; // string shown on death screen
    this._deathTimestamp       = 0;    // Date.now() when player died
    this._godModeUsed          = false; // true if god mode was ever enabled this session
    this._platformerStartMs    = null; // ms timestamp when play begins
    this._platformerFinishMs   = null; // ms elapsed at level completion
    this._platformerCheckpoints = [];  // [{col, row, elapsedMs}] checkpoints hit
    this._platformerLevelName  = '';
    this._platformerCreator    = '';

    if (this.gameMode === 'sandbox') {
      this.sandbox = new SandboxManager();
      this.player.godMode = true;
      // On a fresh (unsaved) world, convert built-in spawn points to visible sandbox eggs
      if (!options.loadKey) {
        const MOB_TO_EGG = {
          Zombie: 'zombie', Skeleton: 'skeleton', Creeper: 'creeper',
          CaveSpider: 'cave_spider', Piglin: 'piglin', Blaze: 'blaze',
          WitherSkeleton: 'wither_skeleton',
        };
        for (const sp of this.mobManager.spawnPoints) {
          const mobType = MOB_TO_EGG[sp.mobTypeName];
          if (!mobType) continue;
          this.sandbox.placedEggs.push({
            col: sp.col, row: sp.row,
            wx: sp.col * BLOCK_SIZE + BLOCK_SIZE / 2,
            wy: sp.row * BLOCK_SIZE + BLOCK_SIZE / 2,
            mobType,
            bobOffset: Math.random() * Math.PI * 2,
          });
        }
      }
      // Load saved world if a key was provided
      if (options.loadKey) this._loadSandboxWorld(options.loadKey);
      // Auto-register the two built-in world portals so they appear with labels
      // and clicking them opens the link popup instead of deleting them.
      // Skip if already restored from a saved portalLinks array.
      if (!this.sandbox.findPortalAtCell(10, 270)) {
        this.sandbox.registerPortal(10, 270, 'overworld'); // gets '1' on fresh world
      }
      if (!this.sandbox.findPortalAtCell(10, 328)) {
        this.sandbox.registerPortal(10, 328, 'nether'); // gets 'A' on fresh world
      }
    }

    // Normal mode: load sandbox world if key provided
    if (this.gameMode === 'normal' && this._sandboxLoadKey) {
      this._loadNormalWorld(this._sandboxLoadKey);
    }

    // Platformer mode: load sandbox world if key provided
    if (this.gameMode === 'platformer' && this._platformerLoadKey) {
      this._loadPlatformerWorld(this._platformerLoadKey);
      this.player.selectedSlot = 1; // start with sword selected
      this._platformerStartMs  = Date.now();
    }

    // Portal fade transition
    this._portalTransition = null; // { phase:'out'|'in', timer, destX, destY }

    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _buildLevel() {
    const data           = buildWorld();
    this.level           = new Level(data);
    this.player          = new Player(data.spawnX, data.spawnY);
    this.mobManager      = new MobManager();
    this.mobManager.setupSpawnPoints(data.spawnPoints);
    this.camera          = new Camera(this.level.pixelWidth, this.level.pixelHeight);
    this.bedSpawns       = data.bedPositions;
    this._activeSpawnBed = -1;
    this.portalData      = data.portalData;
    this.portalCooldown  = 0;   // frames before portal can be used again

    // Redstone
    this.redstone = new RedstoneSystem(data.redstoneComponents);

    // Monkey-patch Level.isSolid for trapdoors + portal frame passthrough
    const _origIsSolid = this.level.isSolid.bind(this.level);
    const rs = this.redstone;
    this.level.isSolid = (row, col) => {
      // Below world bottom: always passable so players (and mobs) fall into the void
      if (row >= this.level.height) return false;
      const b = this.level.get(row, col);
      if (b === BLOCK.TRAPDOOR) {
        return !rs.isTrapdoorOpen(col, row);
      }
      if (b === BLOCK.NETHER_PORTAL_FRAME) {
        return this.level.get(row + 1, col) !== BLOCK.NETHER_PORTAL_FRAME;
      }
      // Portal frame obsidian — non-solid (player walks through portal opening)
      if (b === BLOCK.OBSIDIAN && this._portalObsidianCells.has(`${col},${row}`)) return false;
      // End tower obsidian — decorative, non-solid (player walks through)
      if (b === BLOCK.OBSIDIAN && col >= BIOME_END_START &&
          row >= END_TOWER_TOP_ROW && row <= END_TOWER_BOT_ROW) {
        for (const tc of END_TOWER_COLS) {
          if (col >= tc - 1 && col <= tc + 1) return false;
        }
      }
      // End Portal interior (active portal blocks) — non-solid, player passes through
      if (b === BLOCK.END_PORTAL) return false;
      // Extended piston head is solid at its computed position
      if (rs.isPistonHeadAt(col, row)) return true;
      return _origIsSolid(row, col);
    };

    // Snap camera immediately
    this.camera.x = Math.max(0, Math.min(this.level.pixelWidth  - CANVAS_W,
                             this.player.x - CANVAS_W / 2));
    this.camera.y = Math.max(0, Math.min(this.level.pixelHeight - CANVAS_H,
                             this.player.y - CANVAS_H * 0.55));
  }

  // ── Blocky Minecraft-style clouds ───────────────────────────

  _makeClouds() {
    const shapes = [
      [[0,0],[1,0],[2,0],[3,0],[1,-1],[2,-1]],
      [[0,0],[1,0],[2,0],[0,-1],[1,-1]],
      [[0,0],[1,0],[2,0],[3,0],[1,-1],[2,-1],[2,-2]],
      [[0,0],[1,0],[2,0],[3,0],[4,0],[1,-1],[2,-1],[3,-1]],
      [[0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[2,-1],[3,-1]],
      [[0,0],[1,0],[2,0],[1,-1]],
    ];
    const clouds = [];
    for (let i = 0; i < 10; i++) {
      clouds.push({
        x:     Math.random() * this.level.pixelWidth,
        y:     24 + Math.random() * 96,
        shape: shapes[Math.floor(Math.random() * shapes.length)],
        sp:    0.12 + Math.random() * 0.22,
      });
    }
    return clouds;
  }

  // ── Main Loop ─────────────────────────────────────────────

  _loop(ts) {
    if (!this._running) return;
    requestAnimationFrame(this._loop);
    // Cap at ~60 fps regardless of display refresh rate (120 Hz / 144 Hz monitors).
    // 14 ms threshold gives tolerance for VSync jitter at true 60 Hz (16.67 ms period).
    if (this._lastTs !== undefined && ts - this._lastTs < 14) return;
    this._lastTs = ts;
    this.frameCount++;
    this._update();
    this._render();
    this.input.flush();
  }

  destroy() {
    this._running = false;
    this._closeSaveDialog();
  }

  _notify(text, color = '#fff', life = 180) {
    this.notifications.push({ text, color, life, maxLife: life });
  }

  _update() {
    // ── ? (Shift+/) toggles help screen — checked before any other input ──
    const _shiftHelp = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
    if (this.input.isJustDown('Slash') && _shiftHelp) this._showHelp = !this._showHelp;
    if (this._showHelp) { if (this.input.mouse.clicked) this._showHelp = false; return; }

    // ── ESC: pause / unpause (not on win screen) ───────────────
    const escNow = this.input.isDown('Escape');
    if (escNow && !this._escWas) {
      if (this._teleportMenu) {
        this._teleportMenu = false;
      } else if (this._chestOpen) {
        this._closeChest();
      } else if (this.inventoryOpen) {
        this._returnHeldItem();
        this.inventoryOpen = false;
      } else if (this.state === 'playing')     this.state = 'paused';
      else if   (this.state === 'paused')      this.state = 'playing';
      else if   (this.state === 'confirmExit') this.state = 'paused';
    }
    this._escWas = escNow;

    // ── Pause / confirm-exit: handle pause menu only ───────────
    if (this.state === 'paused' || this.state === 'confirmExit') {
      this._updatePause();
      return;
    }

    // ── Dead state: show death screen, wait for respawn click ─────
    if (this.state === 'dead') {
      const elapsed = Date.now() - this._deathTimestamp;
      if (elapsed >= 3000 && this.input.mouse.clicked) {
        const btn = this._deadRespawnBtnRect();
        if (this.input.mouse.x >= btn.x && this.input.mouse.x <= btn.x + btn.w &&
            this.input.mouse.y >= btn.y && this.input.mouse.y <= btn.y + btn.h) {
          this._doRespawn();
        }
      }
      return;
    }

    if (this.state !== 'playing') {
      // 'won' — R or Enter restarts; also show Main Menu option in draw
      if (this.input.isDown('KeyR') || this.input.isDown('Enter')) {
        this._buildLevel();
        this.craftingMenu  = new CraftingMenu();
        this.notifications = [];
        this._tooWeakNotified = false;
        this.inventoryOpen = false;
        this._iKeyWas      = false;
        this._uWas         = false;
        this._invHeld      = null;
        this._invHeldSrc   = null;
        this._portalTransition = null;
        this.state = 'playing';
      }
      // M key → main menu from win screen
      if (this.input.isDown('KeyM')) {
        this.destroy();
        if (this._onReturnToMenu) this._onReturnToMenu();
      }
      return;
    }

    // ── First-frame mode notification ──────────────────────────
    if (this.frameCount === 1 && this.gameMode !== 'normal') {
      const names = { sandbox: 'Sandbox', platformer: 'Platformer' };
      this._notify(`${names[this.gameMode] ?? this.gameMode} mode active`, '#FFD700', 300);
    }
    if (this.frameCount === 1) {
      this._notify('Press ? for controls', '#667788', 240);
    }

    // ── Portal fade transition — block gameplay while active ──
    if (this._portalTransition) {
      const pt = this._portalTransition;
      pt.timer++;
      if (pt.phase === 'out' && pt.timer >= 120) {
        // Teleport now
        this.player.x  = pt.destX;
        this.player.y  = pt.destY;
        this.player.vx = 0; this.player.vy = 0;
        pt.phase = 'in';
        pt.timer = 0;
      } else if (pt.phase === 'in' && pt.timer >= 120) {
        this._portalTransition = null;
        this.portalCooldown    = 120;
      }
      this.camera.follow(this.player);
      return;
    }

    // ── Save dialog (sandbox): block all gameplay while open ──
    if (this._saveDialog) {
      this._updateSaveDialog();
      return;
    }

    // ── E key: open/close nearest chest (intercept before crafting menu) ──
    const eNow = this.input.isDown('KeyE');
    if (eNow && !this._eChestWas && !this.craftingMenu.open) {
      if (this._chestOpen) {
        this._closeChest();
      } else {
        const ch = this._nearestChest();
        if (ch) {
          this._chestOpen    = ch;
          this.inventoryOpen = true;
          this.craftingMenu._eWasDown = true;  // consume E so crafting menu ignores it
          // Show open-lid state
          this.level.set(ch.row, ch.col, BLOCK.CHEST);  // triggers redraw with state.open=true
        }
      }
    }
    this._eChestWas = eNow;

    // ── I key: toggle inventory / sandbox palette (disabled in platformer) ──
    const iDown = this.input.isDown('KeyI');
    if (iDown && !this._iKeyWas && this.gameMode !== 'platformer') {
      if (this.gameMode === 'sandbox' && this.sandbox) {
        this.sandbox.togglePalette();
      } else {
        this.inventoryOpen = !this.inventoryOpen;
        if (!this.inventoryOpen) this._returnHeldItem();
      }
    }
    this._iKeyWas = iDown;

    // Sandbox palette/popup: handle clicks and freeze gameplay
    if (this.gameMode === 'sandbox' && this.sandbox) {
      if (this.sandbox.paletteOpen) {
        // Scroll wheel still switches active hotbar slot while palette is open
        if (this.input.scrollDelta !== 0) {
          this.sandbox.selectHotbarSlot(
            (this.sandbox.sbHotbarSel + this.input.scrollDelta + 8) % 8
          );
        }
        this.sandbox.handlePaletteClick(this.input.mouse.x, this.input.mouse.y, this.input.mouse.clicked);
        return;
      }
      if (this.sandbox.popup) {
        this.sandbox.handlePopupClick(this.input.mouse.x, this.input.mouse.y, this.input.mouse.clicked);
        return;
      }
      if (this.sandbox.portalPopup) {
        const result = this.sandbox.handlePortalPopupClick(
          this.input.mouse.x, this.input.mouse.y, this.input.mouse.clicked
        );
        if (result === 'remove') {
          const p = this.sandbox.findPortalById(this.sandbox.portalPopup.portalId);
          if (p) {
            const netherCount = this.sandbox.sandboxPortals.filter(sp => sp.biome === 'nether').length;
            if (p.biome === 'nether' && netherCount <= 1) {
              this._notify('Cannot remove the last nether portal — the Nether would be unreachable!', '#FF4444', 300);
            } else {
              this.sandbox.unregisterPortal(p.anchorRow, p.anchorCol);
              this._sandboxRemovePortal(p.anchorRow + 1, p.anchorCol + 1);
            }
          }
          this.sandbox.closePortalPopup();
        }
        return;
      }
      // Dust settings popup
      if (this._dustPopup) {
        this._handleDustPopupInput();
        return;
      }
      // Gate config popup (side-selection shown immediately after placing a gate)
      if (this._gateConfigPopup) {
        this._handleGateConfigPopupInput();
        return;
      }
      // Receiver config popup
      if (this._rxConfigPopup) {
        this._handleRxConfigPopupInput();
        return;
      }
      // Piston direction config popup
      if (this._pistonConfigPopup) {
        this._handlePistonConfigPopupInput();
        return;
      }
    }

    // Normal inventory open: handle clicks and freeze gameplay
    if (this.inventoryOpen) {
      this._handleInventoryClick();
      return;
    }

    // ── Crafting menu — process first; freeze game while open (disabled in platformer) ──
    const crafted = this.gameMode !== 'platformer'
      ? this.craftingMenu.update(this.input, this.player)
      : null;
    if (crafted) {
      const data = ARMOR_DATA[crafted] || TOOL_DATA[crafted];
      if (data) this._notify(`Crafted: ${data.name}!`, data.color, 240);
    }
    if (this.craftingMenu.open) return;

    // ── Notification decay ──────────────────────────────────
    this.notifications = this.notifications.filter(n => { n.life--; return n.life > 0; });

    // ── Hyper speed toggle (sandbox always; Normal/Platformer requires god mode) ──
    if (this.input.isJustDown('KeyH')) {
      if (this.gameMode === 'sandbox' || this.player.godMode) {
        this.player.hyperSpeed = !this.player.hyperSpeed;
        this._notify(this.player.hyperSpeed ? 'Hyper Speed ON ⚡' : 'Hyper Speed OFF', this.player.hyperSpeed ? '#FFDD44' : '#888888', 150);
      } else {
        this._notify('Hyper Speed requires God Mode', '#888888', 120);
      }
    }

    // ── Undo / redo + copy/paste (sandbox only) ────────────────
    if (this.gameMode === 'sandbox' && this.sandbox) {
      const _ctrlHeld = this.input.isDown('ControlLeft') || this.input.isDown('ControlRight');
      const _shiftForRedo = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
      if (_ctrlHeld) {
        if (this.input.isJustDown('KeyZ') && !_shiftForRedo) this._historyUndo();
        else if (this.input.isJustDown('KeyY'))              this._historyRedo();
        else if (this.input.isJustDown('KeyZ') && _shiftForRedo) this._historyRedo();
        else if (this.input.isJustDown('KeyC'))              this._sbCopyRegion();
        else if (this.input.isJustDown('KeyV') && this._copyBuffer) { this._pasteMode = true; this._copySelection = null; }
      }
      // Cancel paste mode with Escape or right-click
      if (this._pasteMode && (this.input.isJustDown('Escape') || this.input.mouse.rightClicked)) {
        this._pasteMode = false;
        this._notify('Paste cancelled', '#888888', 80);
      }
    }

    // ── Hotbar slot selection ──────────────────────────────────
    let _sbHotbarConsumed = false;  // true when hotbar absorbed this frame's click
    if (this.gameMode === 'sandbox' && this.sandbox) {
      const _shiftHeld = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
      // ── Brush size: Shift+1/2/3 ───────────────────────────────
      if (_shiftHeld) {
        if (this.input.isJustDown('Digit1'))      this.sandbox.setBrushSize(1);
        else if (this.input.isJustDown('Digit2')) this.sandbox.setBrushSize(2);
        else if (this.input.isJustDown('Digit3')) this.sandbox.setBrushSize(4);
      }
      // Brush button clicks (checked before hotbar so they can't fall through)
      if (this.sandbox.handleBrushClick(this.input.mouse.x, this.input.mouse.y, this.input.mouse.clicked)) {
        _sbHotbarConsumed = true;
      } else {
        // Sandbox: hotbar click / right-click / number keys / scroll
        _sbHotbarConsumed = this.sandbox.handleHotbarClick(
          this.input.mouse.x, this.input.mouse.y,
          this.input.mouse.clicked, this.input.mouse.rightClicked
        );
      }
      if (!_sbHotbarConsumed) {
        const hk = this.input.hotbarKey();
        if (hk >= 0 && hk < 8 && !_shiftHeld) this.sandbox.selectHotbarSlot(hk);
        if (this.input.scrollDelta !== 0) {
          if (_shiftHeld) {
            this.sandbox.cycleBrushSize(this.input.scrollDelta > 0 ? 1 : -1);
          } else {
            this.sandbox.selectHotbarSlot(
              (this.sandbox.sbHotbarSel + this.input.scrollDelta + 8) % 8
            );
          }
        }
      }
    } else {
      const hk = this.input.hotbarKey();
      if (hk >= 0) this.player.selectedSlot = hk;
      if (this.input.scrollDelta !== 0) {
        this.player.selectedSlot =
          (this.player.selectedSlot + this.input.scrollDelta + 9) % 9;
      }
    }

    // ── Player movement / weapon toggle ────────────────────
    this.player.update(this.input, this.level);

    // ── Soul sand slowing ──────────────────────────────────
    const pFeetRow = Math.floor((this.player.y + this.player.height) / BLOCK_SIZE);
    const pFeetCol = Math.floor(this.player.cx / BLOCK_SIZE);
    if (this.level.get(pFeetRow, pFeetCol) === BLOCK.SOUL_SAND ||
        this.level.get(pFeetRow - 1, pFeetCol) === BLOCK.SOUL_SAND) {
      this.player.vx *= 0.6;
    }

    // ── Lava: instant kill ─────────────────────────────────
    const pMidRow = Math.floor(this.player.cy / BLOCK_SIZE);
    const pMidCol = Math.floor(this.player.cx / BLOCK_SIZE);
    if (this.level.get(pMidRow, pMidCol) === BLOCK.LAVA && !this.player.godMode && this.player.hp > 0) {
      this.player.hp = 0;
      this._triggerDeath('Burned by lava');
    }

    // ── End void: instant kill when below bedrock floor or in void transition zone ────
    if (!this.player.godMode && this.player.hp > 0) {
      const feetRow = Math.floor((this.player.y + this.player.height) / BLOCK_SIZE);
      // End dimension void (below bedrock floor)
      if (pMidCol >= BIOME_END_START && feetRow > END_FLOOR_ROW + 1) {
        this.player.hp = 0;
        this._triggerDeath('Fell into the void');
      }
      // Transition void zone (cols 480-499 — no floor, instant death)
      else if (pMidCol >= 480 && pMidCol <= 499 && feetRow > 35) {
        this.player.hp = 0;
        this._triggerDeath('Fell into the void');
      }
    }

    // ── Cursor world position ──────────────────────────────
    const world    = this.camera.toWorld(this.input.mouse.x, this.input.mouse.y);
    const hoverCol = Math.floor(world.x / BLOCK_SIZE);
    const hoverRow = Math.floor(world.y / BLOCK_SIZE);
    const target   = this.level.get(hoverRow, hoverCol);

    // ── Weapon actions: bow / sword / pickaxe ─────────────
    // Cancel bow draw if player switched off bow slot
    if (this.player.weaponMode !== 'bow' && this.player.bowDrawing) {
      this.player.bowDrawing   = false;
      this.player.drawProgress = 0;
    }
    if (this.player.weaponMode === 'bow') {
      // Hold click/Space to charge; release to fire
      const aimDown = this.input.isAttack() || this.input.mouse.down;
      if (aimDown) {
        this.player.bowDrawing   = true;
        this.player.drawProgress = Math.min(1, this.player.drawProgress + 1 / BOW_CHARGE_FRAMES);
      } else if (this.player.bowDrawing) {
        const charge = this.player.drawProgress;
        const speed  = BOW_MIN_SPEED + (BOW_MAX_SPEED - BOW_MIN_SPEED) * charge;
        const angle  = Math.atan2(world.y - this.player.cy, world.x - this.player.cx);
        this.mobManager.addPlayerArrow(
          this.player.cx, this.player.cy,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          PLAYER_ARROW_DAMAGE
        );
        this.player.bowDrawing   = false;
        this.player.drawProgress = 0;
      }
    } else if (this.player.weaponMode === 'sword') {
      // ── Sword: click/Space attacks (works even when slot is empty) ──
      if ((this.input.isAttack() || this.input.mouse.clicked) && this.player.attackCooldown === 0) {
        this.mobManager.playerAttack(this.player);
        this.player.attackCooldown = ATTACK_COOLDOWN;
        this.player.swingTimer     = 15;
      }
    } else if (this.player.weaponMode === 'pickaxe') {
      // ── Pickaxe: Space/click also attacks mobs; mouse-hold mines (below) ──
      if ((this.input.isAttack() || this.input.mouse.clicked) && this.player.attackCooldown === 0) {
        this.mobManager.playerAttack(this.player);
        this.player.attackCooldown = ATTACK_COOLDOWN;
        this.player.swingTimer     = 15;
      }
    }

    // ── L key: toggle nearest lever ────────────────────────
    const lDown = this.input.isDown('KeyL');
    if (lDown && !this._lKeyWas) {
      const toggled = this.redstone.tryToggleLeverNear(this.level, this.player);
      if (toggled) this._rsStartFromSource(toggled.col, toggled.row, toggled.on);
    }
    this._lKeyWas = lDown;

    // ── Redstone update (pressure plates, TNT countdown) ───
    this.redstone.update(this.level, this.player, this.input);
    this.redstone.updatePistonAnimations();
    this._applyPistonKnockback();
    // Before TNT explodes, drop items from any chests in blast radius
    for (const comp of this.redstone.components) {
      if (comp.type === 'tnt' && comp.fuse === 1) {
        const R = 3;
        for (const ch of this._chests.values()) {
          if (Math.abs(ch.col - comp.col) <= R && Math.abs(ch.row - comp.row) <= R)
            this._dropChestItems(ch.col, ch.row);
        }
      }
    }
    this.redstone.tickTnt(this.level, this.mobManager);
    // Remove dust/gate overlays whose block was destroyed (e.g. by TNT).
    // Rate-limited: only scan every 30 frames — TNT has a 120-frame fuse so this is plenty.
    if (this.frameCount % 30 === 0) {
      let changed = false;
      for (const [key, dust] of this._dustBlocks) {
        if (this.level.get(dust.row, dust.col) === BLOCK.AIR) {
          this._dustBlocks.delete(key);
          const qi = this._rsQueue.findIndex(e => !e.type && e.col === dust.col && e.row === dust.row);
          if (qi >= 0) this._rsQueue.splice(qi, 1);
          changed = true;
        }
      }
      for (const [key, gate] of this._gateBlocks) {
        if (this.level.get(gate.row, gate.col) === BLOCK.AIR) {
          this._gateBlocks.delete(key); changed = true;
        }
      }
      if (changed) this._dustConnDirty = true;
    }

    // ── Redstone dust propagation queue ────────────────────
    this._rsProcessQueue();
    // Detect pressure plate state changes and start dust propagation.
    // Initialise _rsWasOn on first encounter to avoid a spurious trigger on frame 1.
    for (const comp of this.redstone.components) {
      if (comp.type === 'pressure_plate') {
        if (comp._rsWasOn === undefined) { comp._rsWasOn = comp.on; continue; }
        if (comp.on !== comp._rsWasOn) {
          comp._rsWasOn = comp.on;
          this._rsStartFromSource(comp.col, comp.row, comp.on);
        }
      }
    }

    // ── Item gravity (sandbox placed items + platformer collectibles) ──
    this._updateItemPhysics();

    // ── Apple use: click on Steve ──────────────────────────
    if (this.input.mouse.clicked &&
        this.player.selectedItem?.type === BLOCK.APPLE) {
      const sx = this.player.x - this.camera.x;
      const sy = this.player.y - this.camera.y;
      const mx = this.input.mouse.x, my = this.input.mouse.y;
      if (mx >= sx && mx <= sx + this.player.width &&
          my >= sy && my <= sy + this.player.height) {
        if (this.player.hp < this.player.maxHp) {
          const healed = this.player.heal(BLOCK_DATA[BLOCK.APPLE].healAmount);
          this.player.takeFromSlot(this.player.selectedSlot);
          this._notify(`Ate an apple! +${healed} HP`, '#44FF44', 120);
        } else {
          this._notify('Already at full health!', '#AAFFAA', 80);
        }
      }
    }

    const isSandbox = this.gameMode === 'sandbox' && this.sandbox;

    // ── Sandbox: click-to-place / click-to-remove / egg popup ──
    if (isSandbox && this.input.mouse.clicked && !_sbHotbarConsumed) {
      const _ctrlClick  = (this.input.isDown('ControlLeft') || this.input.isDown('ControlRight')) && !this.input.mouse.altClicked;
      const _shiftClick = (this.input.isDown('ShiftLeft')   || this.input.isDown('ShiftRight'))   && !this.input.mouse.altClicked;
      if (_ctrlClick && !this.sandbox.paletteOpen && !this.sandbox.popup) {
        // Ctrl+Click/Drag: start region selection
        this._sbSelStart    = {row: hoverRow, col: hoverCol};
        this._copySelection = {r1: hoverRow, c1: hoverCol, r2: hoverRow, c2: hoverCol};
        this._pasteMode     = false;
      } else if (_shiftClick && !this.sandbox.paletteOpen && !this.sandbox.popup && !this.sandbox.portalPopup) {
        // Shift+Click: start auto-paint stroke
        this._pasteMode = false;
        this._strokeBegin();
        this._autoPaintMode = (target === BLOCK.AIR) ? 'place' : 'erase';
        this._autoPaintCell(hoverRow, hoverCol);
      } else if (this._pasteMode && !this.input.mouse.altClicked && !this.sandbox.paletteOpen && !this.sandbox.popup) {
        // Paste mode: click executes paste
        this._sbExecutePaste(hoverRow, hoverCol);
        this._pasteMode = false;
      } else {
      this._historyBegin(hoverRow, hoverCol);
      // Alt+Click → eyedropper: pick block under cursor
      if (this.input.mouse.altClicked) {
        this._sandboxEyedropper(hoverRow, hoverCol);
      } else {
      // Check reach
      const bx   = hoverCol * BLOCK_SIZE + BLOCK_SIZE / 2;
      const by   = hoverRow * BLOCK_SIZE + BLOCK_SIZE / 2;
      const dist = Math.hypot(bx - this.player.cx, by - this.player.cy) / BLOCK_SIZE;
      if (dist <= SANDBOX_BREAK_REACH) {
        // Check for floating placed objects first (eggs and item drops)
        const eggIdx  = this.sandbox.hitTestEggs(world.x, world.y);
        const itemIdx = this.sandbox.hitTestItems(world.x, world.y);
        if (eggIdx >= 0) {
          this.sandbox.openPopup(eggIdx);
        } else if (itemIdx >= 0) {
          this.sandbox.openItemPopup(itemIdx);
        } else if (target === BLOCK.AIR) {
          // Empty space → place selected item type
          if (this.sandbox.isDustSelected) {
            this._notify('Redstone Dust must be placed on a solid block — click a block surface', '#CC4444', 120);
          } else if (this.sandbox.isGateSelected) {
            this._notify('Gate must be placed on a solid block — click a block surface', '#CC4444', 120);
          } else if (this.sandbox.isEggSelected) {
            this.sandbox.placeEgg(world.x, world.y);
          } else if (this.sandbox.isToolSelected) {
            this.sandbox.placeItem(world.x, world.y);
          } else if (this.sandbox.isMultiBlock) {
            this._sandboxPlaceMulti(hoverRow, hoverCol);
          } else {
            const sb = this.sandbox.selectedBlock;
            if (this.sandbox.brushSize > 1 && this.sandbox.isBrushApplicable) {
              this._sandboxBrushPlace(hoverRow, hoverCol, sb);
            } else {
            // Goal star: remove existing before placing new
            if (sb === BLOCK.GOAL && this.level.goalCol >= 0) {
              this.level.set(this.level.goalRow, this.level.goalCol, BLOCK.AIR);
            }
            this.level.set(hoverRow, hoverCol, sb);
            if (sb === BLOCK.GOAL) {
              this.level.goalCol = hoverCol;
              this.level.goalRow = hoverRow;
            }
            // Register lever/trapdoor/pressure_plate in redstone system
            if (sb === BLOCK.LEVER && !this.redstone.getAt(hoverCol, hoverRow)) {
              this.redstone.addComponent({type: 'lever', col: hoverCol, row: hoverRow, on: false, links: [], sandboxPlaced: true});
              this._notify('Lever placed — click it (with Lever selected) to toggle', '#FFD700', 120);
            } else if (sb === BLOCK.TRAPDOOR && !this.redstone.getAt(hoverCol, hoverRow)) {
              this.redstone.addComponent({type: 'trapdoor', col: hoverCol, row: hoverRow, open: false, links: [], sandboxPlaced: true});
              this._notify('Trap Door placed — click it (with Trap Door selected) to toggle', '#C8A558', 120);
            } else if (sb === BLOCK.PRESSURE_PLATE && !this.redstone.getAt(hoverCol, hoverRow)) {
              this.redstone.addComponent({type: 'pressure_plate', col: hoverCol, row: hoverRow, on: false, links: [], sandboxPlaced: true});
              this._notify('Pressure Plate placed — activates when walked on', '#CCCCAA', 120);
            } else if (sb === BLOCK.TNT && !this.redstone.getAt(hoverCol, hoverRow)) {
              this.redstone.addComponent({type: 'tnt', col: hoverCol, row: hoverRow, fuse: 0, links: [], sandboxPlaced: true});
            } else if (sb === BLOCK.TRANSMITTER) {
              const num = this._txAssignNumber();
              if (num === null) {
                this._notify('Maximum 99 transmitters reached', '#FF4444', 120);
                this.level.set(hoverRow, hoverCol, BLOCK.AIR);
              } else {
                this._transmitters.set(`${hoverCol},${hoverRow}`, { col: hoverCol, row: hoverRow, number: num, powered: false });
                this._notify(`Transmitter #${num} placed`, '#CC5555', 90);
              }
            } else if (sb === BLOCK.RECEIVER) {
              this._receivers.set(`${hoverCol},${hoverRow}`, { col: hoverCol, row: hoverRow, listenTo: new Set(), powered: false });
              this._rxConfigPopup = { col: hoverCol, row: hoverRow };
            } else if (sb === BLOCK.CHEST) {
              const ck = `${hoverCol},${hoverRow}`;
              if (!this._chests.has(ck)) {
                this._chests.set(ck, { col: hoverCol, row: hoverRow, items: Array(8).fill(null) });
                this._notify('Chest placed — press E to open', '#C8A558', 120);
              }
            } else if (sb === BLOCK.PISTON_BODY) {
              if (!this.redstone.getAt(hoverCol, hoverRow)) {
                this.redstone.addComponent({
                  type: 'piston', col: hoverCol, row: hoverRow,
                  dir: 'right', inverted: false, extended: false, sandboxPlaced: true,
                });
                this._pistonConfigPopup = { col: hoverCol, row: hoverRow };
              }
            }
            } // end single-block placement (else branch of brushSize > 1)
          }
        } else if ((target === BLOCK.NETHER_PORTAL_FRAME || target === BLOCK.NETHER_PORTAL) &&
                   this.sandbox.findPortalAtCell(hoverRow, hoverCol)) {
          // Registered sandbox portal → open link popup instead of removing
          this.sandbox.openPortalPopup(
            this.sandbox.findPortalAtCell(hoverRow, hoverCol).id
          );
        } else if (target === BLOCK.OBSIDIAN &&
                   this._portalObsidianCells.has(`${hoverCol},${hoverRow}`)) {
          // Ruined portal frame obsidian → open link popup if a ruined portal is registered here
          const rpSbPortal = this.sandbox.findPortalAtCell(hoverRow, hoverCol);
          if (rpSbPortal?.ruined) this.sandbox.openPortalPopup(rpSbPortal.id);
        } else if (this.sandbox.isDustSelected) {
          // Dust selected — click on existing solid block
          const dustKey = `${hoverCol},${hoverRow}`;
          if (this._dustBlocks.has(dustKey)) {
            this._dustPopup = { col: hoverCol, row: hoverRow };
          } else if (this._isDustValidTarget(target)) {
            this._dustBlocks.set(dustKey, {
              col: hoverCol, row: hoverRow,
              on: false, everTriggered: false, setting: 'always_show',
            });
            this._dustConnDirty = true;
            this._notify('Dust placed — click again to open settings', '#CC2222', 90);
          } else {
            this._notify('Cannot place dust on this block type', '#CC4444', 80);
          }
        } else if (target === BLOCK.RECEIVER) {
          // Click on any receiver → open config popup
          this._rxConfigPopup = { col: hoverCol, row: hoverRow };
        } else if (target === BLOCK.TRANSMITTER &&
                   !this.sandbox.isEggSelected && !this.sandbox.isToolSelected &&
                   this.sandbox.selectedBlock === BLOCK.TRANSMITTER) {
          // Click on transmitter with transmitter selected → show info only
          const tx = this._transmitters.get(`${hoverCol},${hoverRow}`);
          if (tx) this._notify(`Transmitter #${tx.number} — select a different block to remove`, '#CC5555', 120);
        } else if (this.sandbox.isGateSelected) {
          const gateKey = `${hoverCol},${hoverRow}`;
          if (this._gateBlocks.has(gateKey)) {
            this._gateConfigPopup = this._newGateConfigPopup(hoverCol, hoverRow);
          } else if (this._isDustValidTarget(target)) {
            const gType = this.sandbox.selectedGateType;
            this._gateBlocks.set(gateKey, {
              col: hoverCol, row: hoverRow, type: gType,
              inputSide: null, inputSide2: null, outputSide: null,
              outputPowered: false, everTriggered: false, setting: 'always_show',
            });
            this._dustConnDirty = true;
            this._gateConfigPopup = this._newGateConfigPopup(hoverCol, hoverRow);
          } else {
            this._notify('Cannot place gate here', '#CC4444', 80);
          }
        } else if (target === BLOCK.LEVER &&
                   !this.sandbox.isEggSelected && !this.sandbox.isToolSelected &&
                   this.sandbox.selectedBlock === BLOCK.LEVER) {
          // Lever selected + click on placed lever → toggle state
          const comp = this.redstone.getAt(hoverCol, hoverRow);
          if (comp && comp.type === 'lever') {
            comp.on = !comp.on;
            this._notify(`Lever: ${comp.on ? 'ON' : 'OFF'}`, '#FFD700', 80);
            this._rsStartFromSource(hoverCol, hoverRow, comp.on);
          }
        } else if (target === BLOCK.TRAPDOOR &&
                   !this.sandbox.isEggSelected && !this.sandbox.isToolSelected &&
                   this.sandbox.selectedBlock === BLOCK.TRAPDOOR) {
          // Trapdoor selected + click on placed trapdoor → toggle state
          const comp = this.redstone.getAt(hoverCol, hoverRow);
          if (comp && comp.type === 'trapdoor') {
            comp.open = !comp.open;
            this._notify(`Trap Door: ${comp.open ? 'OPEN' : 'CLOSED'}`, '#C8A558', 80);
          }
        } else if (target === BLOCK.PISTON_BODY) {
          // Click placed piston body → open direction config again
          const comp = this.redstone.getAt(hoverCol, hoverRow);
          if (comp && comp.type === 'piston' && comp.sandboxPlaced) {
            this._pistonConfigPopup = { col: hoverCol, row: hoverRow };
          }
        } else if ((target === BLOCK.END_PORTAL_FRAME) &&
                   !this.sandbox.isEggSelected && !this.sandbox.isToolSelected &&
                   this.sandbox.selectedBlock === BLOCK.EYE_OF_ENDER) {
          // Eye of Ender selected + click on frame block → place eye
          this._tryPlaceEye(hoverRow, hoverCol);
        } else {
          // Non-air block → instant remove (connected removal for beds/portals)
          if (this.sandbox.brushSize > 1 && this.sandbox.isBrushApplicable) {
            this._sandboxBrushRemove(hoverRow, hoverCol);
          } else {
            this._sandboxRemoveBlock(hoverRow, hoverCol, target);
          }
        }
      }
      } // end else (not altClicked)
      this._historyCommit();
      } // end else (normal click path)
    }

    // ── Sandbox: Shift+hold continuous paint / Ctrl+hold selection drag ──────
    if (isSandbox && this.input.mouse.down && !this.input.mouse.clicked && !_sbHotbarConsumed
        && !this.sandbox.paletteOpen && !this.sandbox.popup) {
      const _shiftHeld3 = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
      const _ctrlHeld3  = this.input.isDown('ControlLeft') || this.input.isDown('ControlRight');
      if (_shiftHeld3 && this._strokeState) {
        // Continue auto-paint only if cursor moved to a new cell
        const last = this._autoPaintLastCell;
        if (!last || last.row !== hoverRow || last.col !== hoverCol) {
          this._autoPaintCell(hoverRow, hoverCol);
        }
      } else if (_ctrlHeld3 && this._sbSelStart) {
        // Extend copy-selection rectangle
        this._copySelection = {
          r1: Math.min(this._sbSelStart.row, hoverRow), c1: Math.min(this._sbSelStart.col, hoverCol),
          r2: Math.max(this._sbSelStart.row, hoverRow), c2: Math.max(this._sbSelStart.col, hoverCol),
        };
      }
    }

    // ── End stroke when Shift released or mouse released ─────────────────────
    if (isSandbox) {
      const _shiftHeld4 = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
      if (this._strokeState && (!this.input.mouse.down || !_shiftHeld4)) {
        this._strokeEnd();
        this._autoPaintMode     = null;
        this._autoPaintLastCell = null;
      }
      if (this._sbSelStart && !this.input.mouse.down) this._sbSelStart = null;
    }

    // ── Normal mode: click to place block (disabled in platformer) ─────────
    if (!isSandbox && this.gameMode !== 'platformer' && this.input.mouse.clicked && target === BLOCK.AIR) {
      const placed = this._tryPlace(hoverRow, hoverCol);
      if (placed) this._checkPortalCompletion();
    }

    // ── Hold mouse: mine (disabled in sandbox and platformer) ──
    const isWallCol = hoverCol >= 285 && hoverCol <= 314;
    const canMine   = !isSandbox &&
                      this.gameMode !== 'platformer' &&
                      this.player.weaponMode === 'pickaxe' &&
                      this.input.mouse.down   &&
                      target !== BLOCK.AIR    &&
                      !isWallCol              &&
                      !this._portalObsidianCells.has(`${hoverCol},${hoverRow}`);

    if (canMine) {
      this.level.startBreaking(hoverRow, hoverCol);
    } else if (!isSandbox && this.gameMode !== 'platformer') {
      this.level.stopBreaking();
      this._tooWeakNotified = false;
    }

    if (!isSandbox && this.gameMode !== 'platformer') {
      const mineResult = this.level.updateBreaking(
        this.player.cx, this.player.cy,
        this.player.pickaxeTier, this.player.pickaxeSpeed
      );
      if (mineResult?.broken) {
        if (mineResult.blockType === BLOCK.GOAL) {
          this.level.goalCol = -1;
          this.level.goalRow = -1;
        }
        const newOre = this.player.addBlock(mineResult.blockType);
        if (newOre !== null) {
          const oreName = BLOCK_DATA[newOre]?.name ?? '?';
          this._notify(`${oreName} found! New recipes unlocked. [E]`, '#44DDFF', 280);
        }
      }
      if (mineResult?.tooWeak && !this._tooWeakNotified) {
        const tierNames = ['Wooden', 'Stone', 'Iron', 'Diamond', 'Netherite'];
        const needed    = tierNames[mineResult.requiredTier] ?? '?';
        this._notify(`Need ${needed} Pickaxe to mine this!`, '#FF9944');
        this._tooWeakNotified = true;
      }
      if (!mineResult?.tooWeak) this._tooWeakNotified = false;
    }

    // ── Mob AI + combat (suppressed in sandbox — mobs appear as eggs) ──
    if (!isSandbox) {
      const hpBefore = this.player.hp;
      this.mobManager.update(this.player, this.level);
      const dmgTaken = hpBefore - this.player.hp;
      if (dmgTaken > 0) {
        this.mobManager.addPlayerDamageNum(this.player, dmgTaken);
        this._checkDeath();
      }

      // ── Collect dropped items ──────────────────────────────
      const collected = this.mobManager.collectDropsNear(this.player);
      for (const { itemKey, amount } of collected) {
        for (let i = 0; i < amount; i++) this.player.addBlock(itemKey);
      }
    }

    // ── Collect placed tool/weapon/armor items (platformer + normal) ──
    if (this.gameMode === 'platformer' || this.gameMode === 'normal') {
      for (const it of this._platformerItems) {
        if (it.collected) continue;
        const dx = this.player.cx - it.wx;
        const dy = (this.player.y + this.player.height / 2) - it.wy;
        if (Math.sqrt(dx * dx + dy * dy) < BLOCK_SIZE * 1.5) {
          this._collectPlatformerItem(it);
        }
      }

      // ── Auto-checkpoint: record time when player reaches a bed column ──
      if (this._platformerStartMs) {
        const pCol = Math.floor(this.player.cx / BLOCK_SIZE);
        for (const bed of this.bedSpawns) {
          if (Math.abs(pCol - bed.col) <= 3) {
            const already = this._platformerCheckpoints.find(
              cp => cp.col === bed.col && cp.row === bed.row
            );
            if (!already) {
              const elapsedMs = Date.now() - this._platformerStartMs;
              this._platformerCheckpoints.push({ col: bed.col, row: bed.row, elapsedMs });
              this._notify('Checkpoint!', '#90CAF9', 150);
            }
          }
        }
      }
    }

    // ── F key: Sandbox save  /  Normal & Platformer bed respawn ────
    const fNow = this.input.isDown('KeyF');
    if (fNow && !this._fWas) {
      if (this.gameMode === 'sandbox') {
        this._openSaveDialog();
      } else if (this._sandboxLoadKey || this._platformerLoadKey) {
        // Normal/Platformer mode playing a sandbox world — set respawn at any nearby bed
        const pCol = Math.floor(this.player.cx / BLOCK_SIZE);
        const pRow = Math.floor(this.player.cy / BLOCK_SIZE);
        let bedAnchor = null; // { col, row } of the left-most BED cell
        outer:
        for (let dc = -3; dc <= 3; dc++) {
          for (let dr = 0; dr <= 2; dr++) {
            const r = pRow + dr, c = pCol + dc;
            if (this.level.get(r, c) === BLOCK.BED) {
              // Walk left to the anchor cell of this 2-wide bed
              let lc = c;
              while (lc > 0 && this.level.get(r, lc - 1) === BLOCK.BED) lc--;
              bedAnchor = { col: lc, row: r };
              break outer;
            }
          }
        }
        if (bedAnchor) {
          // Register in bedSpawns so the death system and glow both work
          let idx = this.bedSpawns.findIndex(b => b.col === bedAnchor.col && b.row === bedAnchor.row);
          if (idx < 0) idx = this.bedSpawns.push(bedAnchor) - 1;
          this._activeSpawnBed = idx;
          if (this._sandboxLoadKey) this._saveNormalProgress(); // save only for normal mode
          this._notify('Respawn point set!', '#FFDD44', 220);
        } else {
          this._notify('No bed nearby — walk to a bed and press F', '#FF9944', 180);
        }
      } else {
        // Default normal mode: set spawn at pre-defined checkpoint beds
        const playerCol = Math.floor(this.player.cx / BLOCK_SIZE);
        let usedBed = false;
        for (let idx = 0; idx < this.bedSpawns.length; idx++) {
          const bed  = this.bedSpawns[idx];
          if (Math.abs(playerCol - bed.col) <= 3) {
            if (idx !== this._activeSpawnBed) {
              this._activeSpawnBed = idx;
              this._notify('Spawn point set! You will respawn here.', '#FFDD44', 220);
            } else {
              this._notify('Spawn point already set here.', '#FFDD44', 120);
            }
            usedBed = true;
            break;
          }
        }
        if (!usedBed) {
          this._notify('No bed nearby — walk up to a bed and press F', '#FF9944', 180);
        }
      }
    }
    this._fWas = fNow;

    // ── God mode toggle: G+O+D simultaneously (non-sandbox only) ──
    const godCombo = this.input.isDown('KeyG') && this.input.isDown('KeyO') && this.input.isDown('KeyD');
    if (this.gameMode !== 'sandbox' && godCombo && !this._godWas) {
      this.player.godMode = !this.player.godMode;
      if (!this.player.godMode && this.player.flying) this.player.flying = false;
      if (this.player.godMode) this._godModeUsed = true;
      this._notify(
        this.player.godMode ? 'GOD MODE ENABLED' : 'GOD MODE DISABLED',
        this.player.godMode ? '#FFD700' : '#AAAAAA',
        240
      );
    }
    this._godWas = godCombo;

    // ── Portal: press U ────────────────────────────────────────
    const uNow = this.input.isDown('KeyU');
    if (uNow && !this._uWas && this.portalCooldown <= 0) {
      this._tryActivateRuinedPortal(); // no-op if no ruined portals nearby
      // Normal/platformer: use Eye of Ender from hotbar on adjacent FRAME blocks
      if (this.gameMode !== 'sandbox') this._tryPlaceEyeFromHotbar();
      this._checkPortal();
    }
    this._uWas = uNow;

    // ── God Mode teleport menu: press T ───────────────────────
    const tNow = this.input.isDown('KeyT');
    if (tNow && !this._tWas && this.player.godMode) {
      this._teleportMenu = !this._teleportMenu;
    }
    this._tWas = tNow;

    // Handle teleport menu clicks (so input.clicked is consumed before other handlers)
    if (this._teleportMenu && this.player.godMode && this.input.mouse.clicked) {
      this._handleTeleportMenuClick(this.input.mouse.x, this.input.mouse.y);
    }

    // ── Portal cooldown tick ───────────────────────────────
    if (this.portalCooldown > 0) this.portalCooldown--;

    // ── Ender Dragon ───────────────────────────────────────
    if (!this._dragon && this._dragonSpritesLoaded) this._spawnDragon();
    this._updateDragon();

    // ── Camera ─────────────────────────────────────────────
    this.camera.follow(this.player);

    // ── Clouds (only animate in plains) ───────────────────
    const playerBiome = this._playerBiome();
    if (playerBiome === 'plains') {
      for (const c of this.clouds) {
        c.x += c.sp;
        if (c.x > this.level.pixelWidth + 300) c.x = -300;
      }
    }

    // ── Win condition (not sandbox; goal star can be moved) ───
    if (this.state === 'playing' && this.gameMode !== 'sandbox') {
      const gc = this.level.goalCol, gr = this.level.goalRow;
      if (gc >= 0 && this.level.get(gr, gc) === BLOCK.GOAL) {
        const gx = gc * BLOCK_SIZE, gy = gr * BLOCK_SIZE;
        if (this.player.x + this.player.width > gx &&
            this.player.x < gx + BLOCK_SIZE &&
            this.player.y + this.player.height > gy &&
            this.player.y < gy + BLOCK_SIZE) {
          if (this.gameMode === 'platformer' && this._platformerStartMs) {
            this._platformerFinishMs = Date.now() - this._platformerStartMs;
          }
          this.state = 'won';
        }
      }
    }

    // ── Void / fall death — triggers as soon as feet go below world bottom ──
    if (this.player.y + this.player.height > this.level.pixelHeight && !this.player.godMode) {
      this._triggerDeath('Fell into a pit');
    }
  }

  // ── Chest helpers ─────────────────────────────────────────
  _nearestChest() {
    const REACH = 2.5 * BLOCK_SIZE;
    for (const ch of this._chests.values()) {
      if (Math.hypot((ch.col + 0.5) * BLOCK_SIZE - this.player.cx,
                     (ch.row + 0.5) * BLOCK_SIZE - this.player.cy) <= REACH) return ch;
    }
    return null;
  }

  _closeChest() {
    if (!this._chestOpen) return;
    this._returnHeldItem();
    this._sbChestHeld  = null;
    this._chestOpen    = null;
    this.inventoryOpen = false;
  }

  _dropChestItems(col, row) {
    const ch = this._chests.get(`${col},${row}`);
    if (!ch) return;
    const drops = ch.items.filter(Boolean).map(it => {
      const key = it.toolKey || it.armorKey;
      return { x: col * BLOCK_SIZE + BLOCK_SIZE / 2, y: row * BLOCK_SIZE, itemKey: key || it.type, amount: it.count ?? 1 };
    });
    if (drops.length) this.mobManager.dropItems(drops);
    ch.items.fill(null);
  }

  _autoEquipTool(toolKey) {
    const data = TOOL_DATA[toolKey];
    if (!data) return;
    if (data.type === 'pickaxe') {
      if ((TOOL_DATA[this.player.pickaxe]?.tier ?? -1) < data.tier) this.player.pickaxe = toolKey;
    } else if (data.type === 'sword') {
      if ((TOOL_DATA[this.player.sword]?.tier ?? -1) < data.tier) this.player.sword = toolKey;
    } else if (data.type === 'bow')    { this.player.bow      = toolKey; }
    else if (data.type === 'shield')      { this.player.hasShield     = true; }
    else if (data.type === 'flint_steel') { this.player.hasFlintSteel = true; }
    this._notify(`Equipped ${data.name}!`, data.color, 180);
  }

  _cycleSandboxChestSlot(index) {
    const ch = this._chests.get(`${this._chestOpen.col},${this._chestOpen.row}`);
    if (!ch) return;
    const BANK = [
      null,
      ...Object.keys(TOOL_DATA).map(k  => ({ type: 'tool',  toolKey:  k, count: 1 })),
      ...Object.keys(ARMOR_DATA).map(k => ({ type: 'armor', armorKey: k, count: 1 })),
      { type: BLOCK.APPLE, count: 5 },
    ];
    const cur = ch.items[index];
    const curIdx = BANK.findIndex(it => {
      if (!it && !cur) return true;
      if (!it || !cur) return false;
      if (it.toolKey)  return it.toolKey  === cur.toolKey;
      if (it.armorKey) return it.armorKey === cur.armorKey;
      return it.type === cur.type;
    });
    ch.items[index] = BANK[(curIdx + 1) % BANK.length];
  }

  // ── Sandbox chest panel ───────────────────────────────────────

  _sbChestPaletteItems() {
    const tab = this.sandbox?.paletteTab || 'overworld';
    if (tab === 'gear')  return GEAR_PALETTE_ITEMS;
    if (tab === 'other') return OTHER_PALETTE_ITEMS;
    return SANDBOX_PALETTE_BLOCKS[tab] || [];
  }

  _sbChestItemToChestEntry(paletteItem) {
    if (!paletteItem) return null;
    if (typeof paletteItem === 'number') return { type: paletteItem, count: 1 };
    if (paletteItem.kind === 'tool') {
      if (paletteItem.type === 'armor') return { type: 'armor', armorKey: paletteItem.key, count: 1 };
      return { type: 'tool', toolKey: paletteItem.key, count: 1 };
    }
    if (paletteItem.kind === 'block') return { type: paletteItem.blockType, count: 1 };
    if (paletteItem.kind === 'egg')   return null; // eggs can't be in chests
    if (paletteItem.kind === 'dust' || paletteItem.kind === 'gate') return null;
    return null;
  }

  _handleSandboxChestClick() {
    if (!this._chestOpen || !this.sandbox) return;
    const ch = this._chests.get(`${this._chestOpen.col},${this._chestOpen.row}`);
    if (!ch) return;
    const mx = this.input.mouse.x, my = this.input.mouse.y;
    const L  = this._sbChestLayout();
    const clicked = this.input.mouse.clicked;
    const rClicked = this.input.mouse.rightClicked;

    // X close button
    if (clicked && mx >= L.xbx && mx <= L.xbx + 20 && my >= L.xby && my <= L.xby + 20) {
      this._closeChest(); return;
    }

    // Sandbox hotbar at bottom — interactive even when chest is open
    if (my >= SB_HOTBAR_Y) {
      for (let i = 0; i < SB_SLOTS; i++) {
        const sx = SB_HOTBAR_X + i * (SB_SLOT_SIZE + SB_SLOT_GAP);
        if (mx >= sx && mx < sx + SB_SLOT_SIZE && my < SB_HOTBAR_Y + SB_SLOT_SIZE) {
          if (clicked) {
            if (this._sbChestHeld) {
              // Drop held item into hotbar slot
              const item = this._sbChestHeld.item;
              let entry = null;
              if (item.type === 'tool' && item.toolKey) {
                entry = { kind: 'tool', value: item.toolKey };
              } else if (item.type === 'armor' && item.armorKey) {
                entry = { kind: 'tool', value: item.armorKey };
              } else if (typeof item.type === 'number') {
                entry = { kind: 'block', value: item.type };
              }
              if (entry) {
                this.sandbox.sbHotbar[i] = entry;
                this.sandbox.sbHotbarSel = i;
                this.sandbox._applyHotbarEntry(entry);
              }
              if (this._sbChestHeld.source === 'chest') this._sbChestHeld = null;
            } else {
              this.sandbox.selectHotbarSlot(i);
            }
          } else if (rClicked) {
            this.sandbox.sbHotbar[i] = null;
          }
          return;
        }
      }
      return; // click in hotbar area but not on a slot — ignore, don't close
    }

    // Click outside panel → close
    if (clicked && (mx < L.px || mx > L.px + L.pw || my < L.py || my > L.py + L.ph)) {
      this._closeChest(); return;
    }

    // Tab bar
    if (clicked) {
      const TABS = ['overworld', 'nether', 'gear', 'other'];
      for (let i = 0; i < TABS.length; i++) {
        const tx = L.tabX + i * 92;
        if (mx >= tx && mx <= tx + 88 && my >= L.tabY && my <= L.tabY + 24) {
          this.sandbox.paletteTab = TABS[i];
          return;
        }
      }
    }

    // Chest slots
    for (let i = 0; i < 8; i++) {
      const sx = L.chestSlotsX + i * (L.slotSz + L.gap);
      if (mx >= sx && mx < sx + L.slotSz && my >= L.chestSlotsY && my < L.chestSlotsY + L.slotSz) {
        if (rClicked) {
          ch.items[i] = null;
          return;
        }
        if (!clicked) return;
        if (this._sbChestHeld) {
          if (this._sbChestHeld.source === 'palette') {
            // Palette items are infinite — just place in slot
            ch.items[i] = Object.assign({}, this._sbChestHeld.item);
          } else {
            // Swap with chest slot
            const prev = ch.items[i] ? Object.assign({}, ch.items[i]) : null;
            ch.items[i] = Object.assign({}, this._sbChestHeld.item);
            this._sbChestHeld = prev ? { item: prev, source: 'chest' } : null;
          }
        } else {
          // Pick up from chest slot
          if (ch.items[i]) {
            this._sbChestHeld = { item: Object.assign({}, ch.items[i]), source: 'chest' };
            ch.items[i] = null;
          }
        }
        return;
      }
    }

    // Palette item grid
    if (clicked) {
      const tab = this.sandbox.paletteTab;
      const isSpecial = tab === 'other' || tab === 'gear';
      const items = this._sbChestPaletteItems();
      for (let i = 0; i < items.length; i++) {
        const gx = L.gridX + (i % 8) * L.slotSz;
        const gy = L.gridY + Math.floor(i / 8) * L.slotSz;
        if (mx >= gx && mx < gx + L.slotSz - 2 && my >= gy && my < gy + L.slotSz - 2) {
          const entry = isSpecial
            ? this._sbChestItemToChestEntry(items[i])
            : { type: items[i], count: 1 };
          if (!entry) return; // eggs/dust/gates can't go in chests
          // Toggle: if already holding this item from palette, deselect
          if (this._sbChestHeld?.source === 'palette' &&
              JSON.stringify(this._sbChestHeld.item) === JSON.stringify(entry)) {
            this._sbChestHeld = null;
          } else {
            this._sbChestHeld = { item: entry, source: 'palette' };
          }
          return;
        }
      }
    }
  }

  _sbChestLayout() {
    const pw = 420, slotSz = SLOT_SIZE, gap = SLOT_GAP;
    const tab = this.sandbox?.paletteTab || 'overworld';
    const items = this._sbChestPaletteItems();
    const nRows = Math.max(1, Math.ceil(items.length / 8));
    const pad = 16, titleH = 28, chestH = 20 + slotSz + 8, tabH = 30, hintH = 20;
    const ph = pad + titleH + chestH + tabH + nRows * slotSz + hintH + pad;
    const px = Math.floor((CANVAS_W - pw) / 2);
    const py = Math.max(8, Math.floor((SB_HOTBAR_Y - ph) / 2));
    const contentX = px + pad;
    const chestW   = 8 * (slotSz + gap) - gap;
    const chestSlotsX = px + pad + Math.floor((pw - pad * 2 - chestW) / 2);
    const chestSlotsY = py + pad + titleH + 20;
    const tabY  = chestSlotsY + slotSz + 8;
    const gridX = px + pad;
    const gridY = tabY + tabH;
    const tabX  = px + pad;
    const xbx   = px + pw - 30, xby = py + 8;
    return { px, py, pw, ph, slotSz, gap, contentX,
             chestSlotsX, chestSlotsY, tabX, tabY, gridX, gridY, xbx, xby };
  }

  _drawSandboxChestPanel(ctx) {
    if (!this._chestOpen || !this.sandbox) return;
    const ch = this._chests.get(`${this._chestOpen.col},${this._chestOpen.row}`);
    const mx = this.input.mouse.x, my = this.input.mouse.y;
    const L  = this._sbChestLayout();

    // Dim (but leave sandbox hotbar visible at bottom)
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, CANVAS_W, SB_HOTBAR_Y);

    // Panel
    ctx.fillStyle = '#1A1A2A';
    _roundRect(ctx, L.px, L.py, L.pw, L.ph, 8); ctx.fill();
    ctx.strokeStyle = '#FF9800'; ctx.lineWidth = 1.5;
    _roundRect(ctx, L.px, L.py, L.pw, L.ph, 8); ctx.stroke();

    // Title
    ctx.fillStyle = '#FF9800'; ctx.font = 'bold 13px Courier New';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('CHEST  —  Sandbox Mode', CANVAS_W / 2, L.py + 14);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

    // X close button
    const xHov = mx >= L.xbx && mx <= L.xbx + 20 && my >= L.xby && my <= L.xby + 20;
    ctx.fillStyle   = xHov ? 'rgba(255,80,80,0.3)' : 'rgba(0,0,0,0.4)';
    _roundRect(ctx, L.xbx, L.xby, 20, 20, 4); ctx.fill();
    ctx.strokeStyle = xHov ? '#FF5555' : '#554444'; ctx.lineWidth = 1;
    _roundRect(ctx, L.xbx, L.xby, 20, 20, 4); ctx.stroke();
    ctx.fillStyle = xHov ? '#fff' : '#AA7777';
    ctx.font = 'bold 12px Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('✕', L.xbx + 10, L.xby + 10);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

    // "Chest Contents" sub-label
    ctx.fillStyle = '#888899'; ctx.font = '9px Courier New';
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('— Chest Contents  (right-click slot to clear) —', CANVAS_W / 2, L.chestSlotsY - 4);
    ctx.textAlign = 'left';

    // Chest slots
    for (let i = 0; i < 8; i++) {
      const sx = L.chestSlotsX + i * (L.slotSz + L.gap);
      const sy = L.chestSlotsY;
      const hov = mx >= sx && mx < sx + L.slotSz && my >= sy && my < sy + L.slotSz;
      ctx.fillStyle = hov ? 'rgba(255,152,0,0.15)' : 'rgba(0,0,0,0.55)';
      ctx.fillRect(sx, sy, L.slotSz, L.slotSz);
      ctx.strokeStyle = hov ? '#FF9800' : '#555566'; ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, L.slotSz - 1, L.slotSz - 1);
      const item = ch ? ch.items[i] : null;
      if (item) this._drawChestItemIcon(ctx, item, sx, sy, L.slotSz);
    }

    // Tab bar
    const TABS = [
      { key: 'overworld', label: 'Overworld', color: '#4CAF50' },
      { key: 'nether',    label: 'Nether',    color: '#FF4400' },
      { key: 'gear',      label: 'Gear',      color: '#FFD700' },
      { key: 'other',     label: 'Other',     color: '#FF9800' },
    ];
    for (let i = 0; i < TABS.length; i++) {
      const tx  = L.tabX + i * 92;
      const tab = TABS[i];
      const act = this.sandbox.paletteTab === tab.key;
      const hov = mx >= tx && mx <= tx + 88 && my >= L.tabY && my <= L.tabY + 24;
      ctx.fillStyle   = act ? `${tab.color}33` : (hov ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.3)');
      _roundRect(ctx, tx, L.tabY, 88, 24, 4); ctx.fill();
      ctx.strokeStyle = act ? tab.color : (hov ? '#888' : '#333'); ctx.lineWidth = act ? 2 : 1;
      _roundRect(ctx, tx, L.tabY, 88, 24, 4); ctx.stroke();
      ctx.fillStyle = act ? tab.color : (hov ? '#ccc' : '#666');
      ctx.font = act ? 'bold 10px Courier New' : '10px Courier New';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(tab.label, tx + 44, L.tabY + 12);
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

    // Palette item grid
    const curTab   = this.sandbox.paletteTab;
    const isSpec   = curTab === 'other' || curTab === 'gear';
    const palItems = this._sbChestPaletteItems();
    for (let i = 0; i < palItems.length; i++) {
      const gx  = L.gridX + (i % 8) * L.slotSz;
      const gy  = L.gridY + Math.floor(i / 8) * L.slotSz;
      const itm = isSpec ? palItems[i] : null;
      const hov = mx >= gx && mx < gx + L.slotSz - 2 && my >= gy && my < gy + L.slotSz - 2;
      const entry = isSpec
        ? this._sbChestItemToChestEntry(palItems[i])
        : { type: palItems[i], count: 1 };
      const noGo = !entry; // can't go in chest (egg/dust/gate)
      const held = this._sbChestHeld;
      const isSelected = held?.source === 'palette' && !noGo &&
        JSON.stringify(held.item) === JSON.stringify(entry);

      ctx.fillStyle = noGo ? 'rgba(0,0,0,0.2)' : isSelected ? 'rgba(255,152,0,0.28)' : hov ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.4)';
      _roundRect(ctx, gx, gy, L.slotSz - 2, L.slotSz - 2, 4); ctx.fill();
      ctx.strokeStyle = noGo ? '#222233' : isSelected ? '#FF9800' : hov ? '#888' : '#333';
      ctx.lineWidth = isSelected ? 2 : 1;
      _roundRect(ctx, gx, gy, L.slotSz - 2, L.slotSz - 2, 4); ctx.stroke();

      if (noGo) {
        ctx.fillStyle = '#333344'; ctx.font = '7px Courier New';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('N/A', gx + (L.slotSz-2)/2, gy + (L.slotSz-2)/2);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      } else if (entry && typeof entry.type === 'number') {
        // Block icon
        const pad = 5, sz = L.slotSz - 2 - pad * 2;
        ctx.save();
        ctx.translate(gx + pad, gy + pad);
        ctx.scale(sz / BLOCK_SIZE, sz / BLOCK_SIZE);
        drawBlock(ctx, entry.type, 0, 0, 0);
        ctx.restore();
      } else if (entry?.type === 'tool' && TOOL_DATA[entry.toolKey]) {
        const td = TOOL_DATA[entry.toolKey];
        const ICONS = { pickaxe: '⛏', sword: '⚔', bow: '🏹', shield: '🛡' };
        const cxc = gx + (L.slotSz - 2) / 2, cyc = gy + (L.slotSz - 2) / 2;
        ctx.fillStyle = td.color;
        ctx.font = 'bold 11px Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const abbr = td.name.split(' ').map(w => w[0]).join('').substring(0, 3);
        ctx.fillText(abbr, cxc, cyc - 3);
        ctx.font = '13px serif';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText(ICONS[td.type] ?? '?', cxc, cyc + 10);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      } else if (entry?.type === 'armor' && ARMOR_DATA[entry.armorKey]) {
        const ad = ARMOR_DATA[entry.armorKey];
        const PIECE_ICONS = { head: '⛑', chest: '🛡', legs: 'L', feet: '👟' };
        const cxc = gx + (L.slotSz - 2) / 2, cyc = gy + (L.slotSz - 2) / 2;
        ctx.fillStyle = ad.color;
        ctx.font = 'bold 10px Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const abbr = ad.name.split(' ').map(w => w[0]).join('').substring(0, 3);
        ctx.fillText(abbr, cxc, cyc - 3);
        ctx.font = '12px serif';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText(PIECE_ICONS[ad.piece] ?? '?', cxc, cyc + 10);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      }
    }

    // Hint text
    ctx.fillStyle = 'rgba(100,100,120,0.6)'; ctx.font = '8px Courier New';
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('Click item → select, click chest slot → place  •  right-click chest slot to clear',
      CANVAS_W / 2, L.py + L.ph - 6);
    ctx.textAlign = 'left';

    // Held item follows cursor
    if (this._sbChestHeld) {
      const item = this._sbChestHeld.item;
      const sz = L.slotSz, p = 4;
      ctx.fillStyle = 'rgba(255,152,0,0.3)';
      ctx.fillRect(mx - sz/2, my - sz/2, sz, sz);
      ctx.strokeStyle = '#FF9800'; ctx.lineWidth = 1.5;
      ctx.strokeRect(mx - sz/2, my - sz/2, sz, sz);
      if (item && typeof item.type === 'number') {
        const scale = (sz - p * 2) / BLOCK_SIZE;
        ctx.save();
        ctx.translate(mx - sz/2 + p, my - sz/2 + p);
        ctx.scale(scale, scale);
        drawBlock(ctx, item.type, 0, 0, 0);
        ctx.restore();
      } else if (item?.type === 'tool' && TOOL_DATA[item.toolKey]) {
        const td = TOOL_DATA[item.toolKey];
        const ICONS = { pickaxe: '⛏', sword: '⚔', bow: '🏹', shield: '🛡' };
        ctx.fillStyle = td.color; ctx.font = `${Math.floor(sz * 0.42)}px serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(ICONS[td.type] ?? '?', mx, my);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      } else if (item?.type === 'armor' && ARMOR_DATA[item.armorKey]) {
        const ad = ARMOR_DATA[item.armorKey];
        const PIECE_L = { head: 'H', chest: 'C', legs: 'L', feet: 'F' };
        ctx.fillStyle = ad.color;
        ctx.fillRect(mx - sz/2 + p, my - sz/2 + p, sz - p*2, sz - p*2);
        ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.floor(sz*0.38)}px Courier New`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(PIECE_L[ad.piece] ?? '?', mx, my);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      }
    }
  }

  // ── Platformer chest loot popup ──────────────────────────────

  _platChestItemStatus(item) {
    if (!item) return 'empty';
    if (item.type === 'tool' && TOOL_DATA[item.toolKey]) {
      const td = TOOL_DATA[item.toolKey];
      if (td.type === 'pickaxe') {
        const curTier = TOOL_DATA[this.player.pickaxe]?.tier ?? -1;
        return td.tier > curTier ? 'upgrade' : td.tier === curTier ? 'same' : 'worse';
      }
      if (td.type === 'sword') {
        const curTier = TOOL_DATA[this.player.sword]?.tier ?? -1;
        return td.tier > curTier ? 'upgrade' : td.tier === curTier ? 'same' : 'worse';
      }
      if (td.type === 'bow')    return this.player.bow    ? 'same' : 'new';
      if (td.type === 'shield')      return this.player.hasShield     ? 'same' : 'new';
      if (td.type === 'flint_steel') return this.player.hasFlintSteel ? 'same' : 'new';
    }
    if (item.type === 'armor' && ARMOR_DATA[item.armorKey]) {
      const ad = ARMOR_DATA[item.armorKey];
      const curKey  = this.player.equippedArmor[ad.piece];
      if (!curKey) return 'new';
      const curProt = ARMOR_DATA[curKey]?.protection ?? 0;
      return ad.protection > curProt ? 'upgrade' : ad.protection === curProt ? 'same' : 'worse';
    }
    return 'inventory'; // blocks, apples, other
  }

  _platChestTakeAll() {
    const ch = this._chests.get(`${this._chestOpen.col},${this._chestOpen.row}`);
    if (!ch) return;
    for (const item of ch.items) {
      if (!item) continue;
      const status = this._platChestItemStatus(item);
      if (item.type === 'tool' && TOOL_DATA[item.toolKey]) {
        if (status === 'upgrade' || status === 'new') {
          this._autoEquipTool(item.toolKey);
        } else {
          // Store lower-tier tools in inventory
          for (let i = 0; i < 36; i++) {
            if (!this.player.inventory[i]) { this.player.inventory[i] = { ...item }; break; }
          }
        }
      } else if (item.type === 'armor' && ARMOR_DATA[item.armorKey]) {
        if (status === 'upgrade' || status === 'new') {
          this.player.addArmorItem(item.armorKey);
        } else {
          for (let i = 0; i < 36; i++) {
            if (!this.player.inventory[i]) { this.player.inventory[i] = { ...item }; break; }
          }
        }
      } else if (typeof item.type === 'number') {
        for (let n = 0; n < (item.count || 1); n++) this.player.addPickup(item.type);
      } else {
        for (let i = 0; i < 36; i++) {
          if (!this.player.inventory[i]) { this.player.inventory[i] = { ...item }; break; }
        }
      }
    }
    ch.items.fill(null);
  }

  _handlePlatformerChestClick() {
    if (!this.input.mouse.clicked) return;
    const ch = this._chests.get(`${this._chestOpen.col},${this._chestOpen.row}`);
    const items = ch ? ch.items.filter(Boolean) : [];
    const mx = this.input.mouse.x, my = this.input.mouse.y;
    const pw = 380, bw = 140, bh = 38;
    const rowH = 38, pad = 16, headerH = 40;
    const ph = pad + headerH + Math.max(1, items.length) * rowH + 12 + bh + pad;
    const px = Math.floor((CANVAS_W - pw) / 2);
    const py = Math.floor((CANVAS_H - ph) / 2);
    // X / Close button
    const xbx = px + pw - 30, xby = py + 8;
    if (mx >= xbx && mx <= xbx + 20 && my >= xby && my <= xby + 20) {
      this._closeChest(); return;
    }
    // "Equip & Take" button
    const btnY = py + ph - pad - bh;
    const equipX = px + pw / 2 - bw - 6;
    if (mx >= equipX && mx <= equipX + bw && my >= btnY && my <= btnY + bh) {
      this._platChestTakeAll();
      this._closeChest(); return;
    }
    // "Close" button
    const closeX = px + pw / 2 + 6;
    if (mx >= closeX && mx <= closeX + bw && my >= btnY && my <= btnY + bh) {
      this._closeChest(); return;
    }
    // Click outside
    if (mx < px || mx > px + pw || my < py || my > py + ph) {
      this._closeChest();
    }
  }

  _drawPlatformerChestPopup(ctx) {
    const ch = this._chests.get(`${this._chestOpen.col},${this._chestOpen.row}`);
    const items = ch ? ch.items.filter(Boolean) : [];
    const mx = this.input.mouse.x, my = this.input.mouse.y;

    const pw = 380, bw = 140, bh = 38;
    const rowH = 38, pad = 16, headerH = 40;
    const ph = pad + headerH + Math.max(1, items.length) * rowH + 12 + bh + pad;
    const px = Math.floor((CANVAS_W - pw) / 2);
    const py = Math.floor((CANVAS_H - ph) / 2);

    // Dim
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Panel
    ctx.fillStyle = '#1A1A2A';
    _roundRect(ctx, px, py, pw, ph, 8); ctx.fill();
    ctx.strokeStyle = '#7ec8e3'; ctx.lineWidth = 1.5;
    _roundRect(ctx, px, py, pw, ph, 8); ctx.stroke();

    // Title
    ctx.fillStyle = '#7ec8e3'; ctx.font = 'bold 13px Courier New';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('CHEST CONTENTS', CANVAS_W / 2, py + 20);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

    // X close button
    const xbx = px + pw - 30, xby = py + 8;
    const xHov = mx >= xbx && mx <= xbx + 20 && my >= xby && my <= xby + 20;
    ctx.fillStyle = xHov ? 'rgba(255,80,80,0.3)' : 'rgba(0,0,0,0.4)';
    _roundRect(ctx, xbx, xby, 20, 20, 4); ctx.fill();
    ctx.strokeStyle = xHov ? '#FF5555' : '#554444'; ctx.lineWidth = 1;
    _roundRect(ctx, xbx, xby, 20, 20, 4); ctx.stroke();
    ctx.fillStyle = xHov ? '#fff' : '#AA7777'; ctx.font = 'bold 12px Courier New';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('✕', xbx + 10, xby + 10);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

    // Divider
    ctx.fillStyle = '#333344';
    ctx.fillRect(px + 12, py + headerH, pw - 24, 1);

    const STATUS_CFG = {
      upgrade:   { label: '↑ UPGRADE',   color: '#4CAF50' },
      new:       { label: '✦ NEW',        color: '#7ec8e3' },
      same:      { label: '= SAME',       color: '#666677' },
      worse:     { label: '↓ WORSE',      color: '#885555' },
      inventory: { label: '→ INVENTORY',  color: '#8899AA' },
    };

    const TOOL_ICONS = { pickaxe: '⛏', sword: '⚔', bow: '🏹', shield: '🛡', flint_steel: '🔥' };
    const PIECE_L    = { head: 'H', chest: 'C', legs: 'L', feet: 'F' };

    if (items.length === 0) {
      ctx.fillStyle = '#556677'; ctx.font = '11px Courier New';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Chest is empty', CANVAS_W / 2, py + headerH + rowH / 2);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }

    for (let i = 0; i < items.length; i++) {
      const item   = items[i];
      const status = this._platChestItemStatus(item);
      const cfg    = STATUS_CFG[status] ?? STATUS_CFG.inventory;
      const ry     = py + headerH + i * rowH;

      // Row background (subtle for upgrades/new)
      if (status === 'upgrade' || status === 'new') {
        ctx.fillStyle = `${cfg.color}11`;
        ctx.fillRect(px + 8, ry + 2, pw - 16, rowH - 4);
      }

      // Icon (28×28)
      const iconX = px + 14, iconY = ry + 5, iconSz = 28;
      ctx.save();
      if (item.type === 'tool' && TOOL_DATA[item.toolKey]) {
        const td = TOOL_DATA[item.toolKey];
        ctx.fillStyle = td.color;
        ctx.fillRect(iconX, iconY, iconSz, iconSz);
        ctx.fillStyle = '#fff'; ctx.font = '16px serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(TOOL_ICONS[td.type] ?? '?', iconX + iconSz / 2, iconY + iconSz / 2);
      } else if (item.type === 'armor' && ARMOR_DATA[item.armorKey]) {
        const ad = ARMOR_DATA[item.armorKey];
        ctx.fillStyle = ad.color;
        ctx.fillRect(iconX, iconY, iconSz, iconSz);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 14px Courier New';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(PIECE_L[ad.piece] ?? '?', iconX + iconSz / 2, iconY + iconSz / 2);
      } else if (typeof item.type === 'number') {
        const scale = iconSz / BLOCK_SIZE;
        ctx.translate(iconX, iconY); ctx.scale(scale, scale);
        drawBlock(ctx, item.type, 0, 0, 0);
      }
      ctx.restore();
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

      // Item name
      let name = '?';
      if (item.type === 'tool' && TOOL_DATA[item.toolKey])   name = TOOL_DATA[item.toolKey].name;
      else if (item.type === 'armor' && ARMOR_DATA[item.armorKey]) name = ARMOR_DATA[item.armorKey].name;
      else if (typeof item.type === 'number') {
        name = BLOCK_DATA[item.type]?.name ?? '?';
        if (item.count > 1) name += ` ×${item.count}`;
      }
      ctx.fillStyle = (status === 'same' || status === 'worse') ? '#8899AA' : '#DDDDEE';
      ctx.font = status === 'upgrade' || status === 'new' ? 'bold 11px Courier New' : '11px Courier New';
      ctx.fillText(name, px + 50, ry + rowH / 2 + 4);

      // Status badge (right-aligned)
      const badgeW = ctx.measureText(cfg.label).width + 10;
      ctx.fillStyle = `${cfg.color}22`;
      _roundRect(ctx, px + pw - 16 - badgeW, ry + 9, badgeW, 20, 4); ctx.fill();
      ctx.strokeStyle = cfg.color; ctx.lineWidth = 1;
      _roundRect(ctx, px + pw - 16 - badgeW, ry + 9, badgeW, 20, 4); ctx.stroke();
      ctx.fillStyle = cfg.color; ctx.font = 'bold 9px Courier New';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(cfg.label, px + pw - 16 - badgeW / 2, ry + 19);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }

    // Buttons
    const btnY   = py + ph - pad - bh;
    const equipX = px + pw / 2 - bw - 6;
    const closeX = px + pw / 2 + 6;
    const hasEquippable = items.some(it => {
      const s = this._platChestItemStatus(it);
      return s === 'upgrade' || s === 'new';
    });

    // "Equip & Take" button
    const eHov = mx >= equipX && mx <= equipX + bw && my >= btnY && my <= btnY + bh;
    ctx.fillStyle = eHov ? 'rgba(76,175,80,0.9)' : hasEquippable ? 'rgba(76,175,80,0.35)' : 'rgba(40,60,40,0.4)';
    _roundRect(ctx, equipX, btnY, bw, bh, 6); ctx.fill();
    ctx.strokeStyle = eHov ? '#8BC34A' : hasEquippable ? '#4CAF50' : '#336633'; ctx.lineWidth = 1.5;
    _roundRect(ctx, equipX, btnY, bw, bh, 6); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px Courier New';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('⚙ Equip & Take', equipX + bw / 2, btnY + bh / 2);

    // "Leave" button
    const cHov = mx >= closeX && mx <= closeX + bw && my >= btnY && my <= btnY + bh;
    ctx.fillStyle = cHov ? 'rgba(100,100,120,0.8)' : 'rgba(50,50,70,0.5)';
    _roundRect(ctx, closeX, btnY, bw, bh, 6); ctx.fill();
    ctx.strokeStyle = cHov ? '#888' : '#444'; ctx.lineWidth = 1.5;
    _roundRect(ctx, closeX, btnY, bw, bh, 6); ctx.stroke();
    ctx.fillStyle = '#ccc';
    ctx.fillText('Leave', closeX + bw / 2, btnY + bh / 2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  _drawChestItemIcon(ctx, item, sx, sy, slotSz) {
    if (!item) return;
    const p = 5;
    if (item.type === 'armor' && ARMOR_DATA[item.armorKey]) {
      const ad = ARMOR_DATA[item.armorKey];
      ctx.fillStyle = ad.color;
      ctx.fillRect(sx + p, sy + p, slotSz - p * 2, slotSz - p * 2);
      const PIECE_L = { head: 'H', chest: 'C', legs: 'L', feet: 'F' };
      ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.floor(slotSz * 0.38)}px Courier New`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(PIECE_L[ad.piece] ?? '?', sx + slotSz / 2, sy + slotSz / 2);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    } else if (item.type === 'tool' && TOOL_DATA[item.toolKey]) {
      const td = TOOL_DATA[item.toolKey];
      const ICONS = { pickaxe: '⛏', sword: '⚔', bow: '🏹', shield: '🛡' };
      ctx.fillStyle = td.color;
      ctx.fillRect(sx + p, sy + p, slotSz - p * 2, slotSz - p * 2);
      ctx.fillStyle = '#fff'; ctx.font = `${Math.floor(slotSz * 0.45)}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(ICONS[td.type] ?? '?', sx + slotSz / 2, sy + slotSz / 2);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    } else if (typeof item.type === 'number') {
      const scale = (slotSz - p * 2) / BLOCK_SIZE;
      ctx.save();
      ctx.translate(sx + p, sy + p);
      ctx.scale(scale, scale);
      drawBlock(ctx, item.type, 0, 0, 0);
      ctx.restore();
      if (item.count > 1) {
        ctx.fillStyle = '#fff'; ctx.font = 'bold 10px Courier New';
        ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
        ctx.fillText(item.count, sx + slotSz - 3, sy + slotSz - 2);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      }
    }
  }

  _playerBiome() {
    const col = Math.floor(this.player.cx / BLOCK_SIZE);
    if (col >= BIOME_END_START) return 'end';
    if (col >= BIOME_CAVE_END)  return 'nether';
    // For plains + cave columns: sky when player is above row 16, cave black below
    const row = Math.floor(this.player.cy / BLOCK_SIZE);
    return row < 16 ? 'plains' : 'cave';
  }

  _checkDeath() {
    if (!this.player.isDead) return;
    const cause = 'Killed by ' + (this._nearestMobName() ?? 'a monster');
    this._triggerDeath(cause);
  }

  _triggerDeath(cause = 'You died') {
    if (this.state === 'dead') return; // already dead
    this._deathCause     = cause;
    this._deathTimestamp = Date.now();
    // Drop hotbar items at player position
    const drops = [];
    for (let i = 0; i < 9; i++) {
      const slot = this.player.hotbar[i];
      if (slot && slot.count > 0) {
        drops.push({ x: this.player.cx, y: this.player.cy, itemKey: slot.type, amount: slot.count });
        this.player.hotbar[i] = null;
      }
    }
    this.mobManager.dropItems(drops);
    this.state = 'dead';
  }

  _doRespawn() {
    const bed = this._activeBedSpawn();
    if (bed) {
      this.player.respawnAt(
        (bed.col + 0.5) * BLOCK_SIZE - this.player.width / 2,
        bed.row * BLOCK_SIZE - this.player.height
      );
    } else {
      this.player.respawnAt(this.level.spawnX, this.level.spawnY);
    }
    this._notify('Items dropped nearby.', '#FF4444', 300);
    this.state = 'playing';
  }

  _nearestMobName() {
    const nameMap = {
      Zombie: 'a Zombie', Skeleton: 'a Skeleton', Creeper: 'a Creeper',
      CaveSpider: 'a Cave Spider', Piglin: 'a Piglin', Blaze: 'a Blaze',
      WitherSkeleton: 'a Wither Skeleton',
    };
    let closest = null, bestDist = Infinity;
    for (const mob of this.mobManager.mobs) {
      if (!mob.alive) continue;
      const d = Math.hypot(mob.cx - this.player.cx, mob.cy - this.player.cy);
      if (d < bestDist) { bestDist = d; closest = mob; }
    }
    if (!closest) return null;
    return nameMap[closest.constructor.name] ?? 'a monster';
  }

  _deadRespawnBtnRect() {
    return { x: (CANVAS_W - 200) / 2, y: CANVAS_H / 2 + 50, w: 200, h: 44 };
  }

  _activeBedSpawn() {
    if (this._activeSpawnBed >= 0 && this._activeSpawnBed < this.bedSpawns.length) {
      return this.bedSpawns[this._activeSpawnBed];
    }
    return null;
  }

  _checkPortal() {
    const pd  = this.portalData;
    const pcx = this.player.cx;
    const pcy = this.player.cy;

    // Check if standing in any portal block
    const pCol = Math.floor(pcx / BLOCK_SIZE);
    const pRow = Math.floor(pcy / BLOCK_SIZE);
    const b    = this.level.get(pRow, pCol);

    // END_PORTAL block — routes to End arrival point
    if (b === BLOCK.END_PORTAL) {
      const destX = END_PORTAL_ARRIVAL_COL * BLOCK_SIZE - this.player.width / 2;
      const destY = END_PORTAL_ARRIVAL_ROW * BLOCK_SIZE - this.player.height;
      this._portalTransition = { phase: 'out', timer: 0, destX, destY };
      this._notify('Entering The End...', '#AA44FF', 200);
      return;
    }

    if (b !== BLOCK.NETHER_PORTAL) return;

    // Sandbox portal routing takes priority over built-in portals
    if (this.gameMode === 'sandbox' && this.sandbox) {
      const sbPortal = this.sandbox.findPortalAtCell(pRow, pCol);
      if (sbPortal) {
        if (sbPortal.destId !== null) {
          const dest = this.sandbox.findPortalById(sbPortal.destId);
          if (dest) {
            // Land in the interior of the destination portal (1 cell in from left, bottom interior row)
            const destX = (dest.anchorCol + 1.5) * BLOCK_SIZE - this.player.width / 2;
            const destY = (dest.anchorRow + 3)   * BLOCK_SIZE - this.player.height;
            this._portalTransition = { phase: 'out', timer: 0, destX, destY };
            const label = dest.biome === 'nether' ? `Nether portal ${dest.label}` : `Portal ${dest.label}`;
            this._notify(`\u27a1 Entering ${label}...`, '#AA00FF', 200);
            // Auto-complete ruined portal at destination if not yet activated
            const rpKey = `${dest.anchorRow},${dest.anchorCol}`;
            if (this._ruinedPortals.has(rpKey) && !this._ruinedPortals.get(rpKey).activated) {
              this._autoCompleteRuinedPortal(dest.anchorRow, dest.anchorCol);
              this._notify('The portal bursts to life as you arrive!', '#AA00FF', 300);
            }
          }
        } else {
          this._notify(`Portal ${sbPortal.label} has no destination — click it to assign one`, '#FF9944', 200);
        }
        return; // handled by sandbox routing
      }
    }

    // Normal/platformer mode playing a sandbox world — use saved portal links
    if ((this.gameMode === 'normal' || this.gameMode === 'platformer') && this._normalPortals.length > 0) {
      const portal = this._normalPortals.find(p =>
        pRow >= p.anchorRow && pRow <= p.anchorRow + 4 &&
        pCol >= p.anchorCol && pCol <= p.anchorCol + 3
      );
      if (portal) {
        const dest = portal.destLabel
          ? this._normalPortals.find(p => p.label === portal.destLabel)
          : null;
        if (dest) {
          const destX = (dest.anchorCol + 1.5) * BLOCK_SIZE - this.player.width / 2;
          const destY = (dest.anchorRow + 3)   * BLOCK_SIZE - this.player.height;
          this._portalTransition = { phase: 'out', timer: 0, destX, destY };
          this._notify(`Portal ${portal.label} → ${dest.label}`, '#AA00FF', 200);
          // Auto-complete ruined portal at destination if not yet activated
          const rpKey = `${dest.anchorRow},${dest.anchorCol}`;
          if (this._ruinedPortals.has(rpKey) && !this._ruinedPortals.get(rpKey).activated) {
            this._autoCompleteRuinedPortal(dest.anchorRow, dest.anchorCol);
            this._notify('The portal bursts to life as you arrive!', '#AA00FF', 300);
          }
        } else {
          this._notify(`Portal ${portal.label} has no destination`, '#FF9944', 160);
        }
        return;
      }
    }

    // Built-in world portal logic (non-sandbox, or unregistered portals)
    const inCave   = pCol >= 271 && pCol <= 272 && pRow >= 11 && pRow <= 13;
    const inNether = pCol >= 329 && pCol <= 330 && pRow >= 11 && pRow <= 13;
    if (inCave) {
      this._portalTransition = { phase: 'out', timer: 0, destX: pd.caveExit.x, destY: pd.caveExit.y };
      this._notify('Entering the Nether...', '#AA00FF', 200);
    } else if (inNether) {
      this._portalTransition = { phase: 'out', timer: 0, destX: pd.netherExit.x, destY: pd.netherExit.y };
      this._notify('Returning from the Nether...', '#44DDFF', 200);
    }
  }

  _checkPortalCompletion() {
    const pd    = this.portalData;
    const slots = pd.obsidianSlots;
    const allFilled = slots.every(s => this.level.get(s.row, s.col) === BLOCK.OBSIDIAN);
    if (!allFilled) return;
    // Already activated?
    if (this.level.get(pd.cavePortalInterior[0].row, pd.cavePortalInterior[0].col) === BLOCK.NETHER_PORTAL) return;
    for (const pos of pd.cavePortalInterior) {
      this.level.set(pos.row, pos.col, BLOCK.NETHER_PORTAL);
    }
    this._notify('Nether portal activated! Jump to enter.', '#AA00FF', 300);
  }

  _tryPlace(row, col) {
    const item = this.player.selectedItem;
    if (!item) return false;
    // Items (string, apple) can't be placed as blocks
    if (BLOCK_DATA[item.type]?.isItem) return false;
    const bx   = col * BLOCK_SIZE + BLOCK_SIZE / 2;
    const by   = row * BLOCK_SIZE + BLOCK_SIZE / 2;
    const dist = Math.hypot(bx - this.player.cx, by - this.player.cy) / BLOCK_SIZE;
    if (dist > BREAK_REACH) return false;
    // Block would overlap player?
    const blkX = col * BLOCK_SIZE, blkY = row * BLOCK_SIZE;
    if (blkX < this.player.x + this.player.width && blkX + BLOCK_SIZE > this.player.x &&
        blkY < this.player.y + this.player.height && blkY + BLOCK_SIZE > this.player.y) return false;
    const type = this.player.takeSelected();
    if (type !== null) {
      // Goal star: only one allowed — remove existing before placing new
      if (type === BLOCK.GOAL && this.level.goalCol >= 0) {
        this.level.set(this.level.goalRow, this.level.goalCol, BLOCK.AIR);
      }
      this.level.set(row, col, type);
      if (type === BLOCK.GOAL) {
        this.level.goalCol = col;
        this.level.goalRow = row;
      }
      return true;
    }
    return false;
  }

  // ── Inventory helpers ──────────────────────────────────────

  _invLayout() {
    const cols = 9, rows = 4;
    const slotSz = SLOT_SIZE, gap = SLOT_GAP;
    const contentW = cols * slotSz + (cols - 1) * gap;
    const pad = 20, titleH = 28, sepH = 12;
    const panelW = contentW + pad * 2;

    // Chest section (8 slots in 1 row, only when a chest is open)
    const CHEST_SLOTS = 8;
    const chestW  = CHEST_SLOTS * (slotSz + gap) - gap;
    const chestOffX = Math.floor((contentW - chestW) / 2); // centre within content
    const chestH  = this._chestOpen ? (titleH + slotSz + sepH) : 0;

    const panelH = pad + chestH + titleH + rows * (slotSz + gap) - gap + sepH + slotSz + pad;
    const panelX = Math.floor((CANVAS_W - panelW) / 2);
    const panelY = Math.floor((CANVAS_H - panelH) / 2);
    const contentX = panelX + pad;

    const chestTitleY = this._chestOpen ? panelY + pad              : null;
    const chestSlotsY = this._chestOpen ? panelY + pad + titleH     : null;
    const chestSlotsX = panelX + pad + chestOffX;

    const invY    = panelY + pad + chestH + titleH;
    const hotbarY = invY + rows * (slotSz + gap) - gap + sepH;

    // Equipment panel (right side)
    const eqPanelW = 108;
    const eqPanelX = panelX + panelW + 8;
    const eqPanelY = panelY;
    const eqPanelH = panelH;
    const eqSlotX  = eqPanelX + (eqPanelW - slotSz) / 2;
    const EQ_SLOTS = ['head', 'chest', 'legs', 'feet'];
    const eqSlotY  = EQ_SLOTS.map((_, i) => eqPanelY + 44 + i * (slotSz + 18));

    return { panelX, panelY, panelW, panelH, contentX, invY, hotbarY, slotSz, gap, cols, rows,
             chestTitleY, chestSlotsY, chestSlotsX, chestW, CHEST_SLOTS,
             eqPanelX, eqPanelY, eqPanelW, eqPanelH, eqSlotX, eqSlotY };
  }

  _getInventorySlotAt(mx, my) {
    const L = this._invLayout();
    for (let r = 0; r < L.rows; r++) {
      for (let c = 0; c < L.cols; c++) {
        const sx = L.contentX + c * (L.slotSz + L.gap);
        const sy = L.invY     + r * (L.slotSz + L.gap);
        if (mx >= sx && mx < sx + L.slotSz && my >= sy && my < sy + L.slotSz) {
          return { loc: 'inventory', index: r * 9 + c };
        }
      }
    }
    for (let c = 0; c < L.cols; c++) {
      const sx = L.contentX + c * (L.slotSz + L.gap);
      if (mx >= sx && mx < sx + L.slotSz &&
          my >= L.hotbarY && my < L.hotbarY + L.slotSz) {
        return { loc: 'hotbar', index: c };
      }
    }
    // Equipment slots
    const EQ_SLOTS = ['head', 'chest', 'legs', 'feet'];
    for (let i = 0; i < 4; i++) {
      if (mx >= L.eqSlotX && mx < L.eqSlotX + L.slotSz &&
          my >= L.eqSlotY[i] && my < L.eqSlotY[i] + L.slotSz) {
        return { loc: 'equipment', slot: EQ_SLOTS[i] };
      }
    }
    // Chest slots
    if (this._chestOpen && L.chestSlotsY !== null) {
      for (let i = 0; i < L.CHEST_SLOTS; i++) {
        const sx = L.chestSlotsX + i * (L.slotSz + L.gap);
        if (mx >= sx && mx < sx + L.slotSz &&
            my >= L.chestSlotsY && my < L.chestSlotsY + L.slotSz) {
          return { loc: 'chest', index: i };
        }
      }
    }
    return null;
  }

  _handleInventoryClick() {
    // Platformer mode with chest open: delegate to loot popup handler
    if (this.gameMode === 'platformer' && this._chestOpen) {
      this._handlePlatformerChestClick();
      return;
    }
    // Sandbox mode with chest open: delegate to sandbox chest handler
    if (this.gameMode === 'sandbox' && this._chestOpen) {
      this._handleSandboxChestClick();
      return;
    }
    const mx = this.input.mouse.x, my = this.input.mouse.y;
    const L = this._invLayout();

    // Right-click on chest slot in sandbox: cycle item content
    if (this.input.mouse.rightClicked && this._chestOpen && this.gameMode === 'sandbox') {
      const rSlot = this._getInventorySlotAt(mx, my);
      if (rSlot?.loc === 'chest') { this._cycleSandboxChestSlot(rSlot.index); return; }
    }

    if (!this.input.mouse.clicked) return;

    // X close button
    if (mx >= L.panelX + L.panelW - 30 && mx <= L.panelX + L.panelW - 10 &&
        my >= L.panelY + 8 && my <= L.panelY + 28) {
      this._returnHeldItem();
      this._closeChest();
      this.inventoryOpen = false;
      return;
    }

    const slot = this._getInventorySlotAt(mx, my);

    if (!slot) { this._returnHeldItem(); return; }

    // ── Equipment slot interaction ─────────────────────────────
    if (slot.loc === 'equipment') {
      const eqSlot   = slot.slot;
      const curKey   = this.player.equippedArmor[eqSlot];
      const curItem  = curKey ? { type: 'armor', armorKey: curKey, count: 1 } : null;
      if (!this._invHeld) {
        if (curItem) {
          this._invHeld    = curItem;
          this._invHeldSrc = slot;
          this.player.equippedArmor[eqSlot] = null;
        }
      } else if (this._invHeld.type === 'armor' && ARMOR_DATA[this._invHeld.armorKey]?.piece === eqSlot) {
        this.player.equippedArmor[eqSlot] = this._invHeld.armorKey;
        this._invHeld    = curItem;
        this._invHeldSrc = curItem ? slot : null;
      }
      return;
    }

    // ── Chest slot ────────────────────────────────────────────
    if (slot.loc === 'chest') {
      const chest = this._chests.get(`${this._chestOpen.col},${this._chestOpen.row}`);
      if (!chest) return;
      const clicked = chest.items[slot.index];
      if (!this._invHeld) {
        if (clicked) {
          this._invHeld = Object.assign({}, clicked);
          this._invHeldSrc = slot;
          chest.items[slot.index] = null;
        }
      } else {
        // Drop held item into chest slot (swap if occupied)
        const prev = clicked ? Object.assign({}, clicked) : null;
        chest.items[slot.index] = Object.assign({}, this._invHeld);
        this._invHeld    = prev;
        this._invHeldSrc = prev ? slot : null;
      }
      return;
    }

    // Slots 0-3 are reserved (pickaxe/sword/bow/apple) — cannot be moved
    if (slot.loc === 'hotbar' && slot.index < 4) return;

    const arr     = slot.loc === 'hotbar' ? this.player.hotbar : this.player.inventory;
    const clicked = arr[slot.index];

    if (!this._invHeld) {
      if (clicked) {
        this._invHeld    = Object.assign({}, clicked);
        this._invHeldSrc = slot;
        arr[slot.index]  = null;
      }
    } else {
      // Tool items auto-equip when dropped on inventory/hotbar
      if (this._invHeld.type === 'tool' && this._invHeld.toolKey) {
        this._autoEquipTool(this._invHeld.toolKey);
        this._invHeld = null; this._invHeldSrc = null;
        return;
      }
      // Armor items auto-equip via addArmorItem
      if (this._invHeld.type === 'armor' && this._invHeld.armorKey) {
        this.player.addArmorItem(this._invHeld.armorKey);
        this._invHeld = null; this._invHeldSrc = null;
        return;
      }
      const canMerge = clicked && clicked.type === this._invHeld.type
        && clicked.type !== 'armor' && !this._invHeld.armorKey;
      if (canMerge) {
        arr[slot.index] = { type: clicked.type, count: clicked.count + this._invHeld.count };
        this._invHeld = null; this._invHeldSrc = null;
      } else {
        arr[slot.index] = Object.assign({}, this._invHeld);
        this._invHeld    = clicked ? Object.assign({}, clicked) : null;
        this._invHeldSrc = clicked ? slot : null;
      }
    }
  }

  _returnHeldItem() {
    if (!this._invHeld) return;
    // Try to put back at source
    const src = this._invHeldSrc;
    if (src) {
      if (src.loc === 'equipment') {
        if (!this.player.equippedArmor[src.slot]) {
          this.player.equippedArmor[src.slot] = this._invHeld.armorKey;
          this._invHeld = null; this._invHeldSrc = null;
          return;
        }
      } else if (src.loc === 'chest') {
        const ch = this._chests.get(`${this._chestOpen?.col},${this._chestOpen?.row}`);
        if (ch && !ch.items[src.index]) {
          ch.items[src.index] = this._invHeld;
          this._invHeld = null; this._invHeldSrc = null;
          return;
        }
      } else {
        const arr = src.loc === 'hotbar' ? this.player.hotbar : this.player.inventory;
        if (!arr[src.index]) {
          arr[src.index]   = this._invHeld;
          this._invHeld    = null;
          this._invHeldSrc = null;
          return;
        }
      }
    }
    // Find any free inventory slot
    for (let i = 0; i < 36; i++) {
      if (!this.player.inventory[i]) {
        this.player.inventory[i] = this._invHeld;
        break;
      }
    }
    this._invHeld    = null;
    this._invHeldSrc = null;
  }

  // ── Rendering ─────────────────────────────────────────────

  _render() {
    const ctx      = this.ctx;
    const world    = this.camera.toWorld(this.input.mouse.x, this.input.mouse.y);
    const hoverCol = Math.floor(world.x / BLOCK_SIZE);
    const hoverRow = Math.floor(world.y / BLOCK_SIZE);

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    const biome = this._playerBiome();
    this._drawSky(ctx, biome);
    if (biome === 'plains') this._drawClouds(ctx);
    this.level.draw(ctx, this.camera, this.redstone);
    // Re-draw open chest with lid-open state on top
    if (this._chestOpen) {
      const sx = this._chestOpen.col * BLOCK_SIZE - this.camera.x;
      const sy = this._chestOpen.row * BLOCK_SIZE - this.camera.y;
      if (sx > -BLOCK_SIZE && sx < CANVAS_W + BLOCK_SIZE)
        drawBlock(ctx, BLOCK.CHEST, sx, sy, 0, { open: true });
    }
    this.redstone.draw(ctx, this.camera, this.level);
    this._drawDustOverlay(ctx);
    this._drawGateOverlay(ctx);
    this._drawTxRxBlocks(ctx);
    this._drawRuinedPortalOverlay(ctx);

    // Copy-selection overlay (sandbox)
    if (this.gameMode === 'sandbox') this._drawCopySelection(ctx);

    // Place ghost / mining highlight
    const target = this.level.get(hoverRow, hoverCol);
    const item   = this.player.selectedItem;
    if (this.gameMode === 'sandbox' && this.sandbox) {
      if (this._pasteMode) {
        this._drawPastePreview(ctx, hoverRow, hoverCol);
      } else {
        this._drawSandboxGhost(ctx, hoverRow, hoverCol);
      }
    } else if (target === BLOCK.AIR && item) {
      this._drawPlaceGhost(ctx, hoverRow, hoverCol, item.type);
    } else {
      this.level.drawHover(ctx, hoverRow, hoverCol, this.camera);
    }

    // Draw collectible placed items (platformer + normal mode)
    if (this.gameMode === 'platformer' || this.gameMode === 'normal') this._drawPlatformerItems(ctx);

    // Mobs, arrows, damage numbers, explosions (suppressed in sandbox)
    if (this.gameMode !== 'sandbox') this.mobManager.draw(ctx, this.camera);

    this._renderDragon(ctx);
    this._drawCheckpoints(ctx);
    this.player.draw(ctx, this.camera);
    this._drawEndPortalForeground(ctx);
    this._drawHUD(ctx, hoverRow, hoverCol);

    // Sandbox overlays: eggs, mode badge, palette, popup
    if (this.gameMode === 'sandbox' && this.sandbox) {
      this.sandbox.draw(ctx, this.camera, this.input, this.player, this.frameCount);
      this._drawUndoIndicator(ctx);
      if (this._pasteMode) {
        ctx.save();
        ctx.font = '10px Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = 'rgba(136,255,136,0.85)';
        ctx.fillText('Click to paste  •  Esc / Right-click to cancel', CANVAS_W / 2, SB_HOTBAR_Y - 20);
        ctx.textAlign = 'left'; ctx.restore();
      }
      if (this._dustPopup) this._drawDustPopup(ctx);
      if (this._gateConfigPopup)   this._drawGateConfigPopup(ctx);
      if (this._rxConfigPopup)     this._drawRxConfigPopup(ctx);
      if (this._pistonConfigPopup) this._drawPistonConfigPopup(ctx);
    }

    this._drawBiomeLabel(ctx, biome);
    this._drawBowCharge(ctx);
    this._drawNotifications(ctx);
    if (this.gameMode !== 'sandbox' && this.player.godMode) this._drawGodModeBadge(ctx);
    if (this._teleportMenu && this.player.godMode) this._drawTeleportMenu(ctx);
    if (this.gameMode === 'platformer') this._drawPlatformerHUD(ctx);

    // Inventory renders on top of world, below crafting menu
    if (this.inventoryOpen) this._drawInventory(ctx);

    // Crafting menu renders on top of everything
    this.craftingMenu.draw(ctx, this.player, this.input);

    // Portal fade overlay
    if (this._portalTransition) {
      const { phase, timer } = this._portalTransition;
      const alpha = phase === 'out' ? timer / 120 : 1 - timer / 120;
      ctx.save();
      ctx.fillStyle = `rgba(80,0,150,${(alpha * 0.92).toFixed(3)})`;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.restore();
    }

    if (this.state === 'dead') this._drawDead(ctx);
    if (this.state === 'won') this._drawWin(ctx);
    if (this.state === 'paused' || this.state === 'confirmExit') this._drawPauseOverlay(ctx);
    if (this._saveDialog) this._drawSaveDialog(ctx);
    if (this._showHelp) this._drawHelpScreen(ctx);
  }

  // ── Inventory panel ──────────────────────────────────────

  _drawInventory(ctx) {
    // Platformer mode with chest open: use loot popup
    if (this.gameMode === 'platformer' && this._chestOpen) {
      this._drawPlatformerChestPopup(ctx);
      return;
    }
    // Sandbox mode with chest open: use dedicated sandbox chest panel
    if (this.gameMode === 'sandbox' && this._chestOpen) {
      this._drawSandboxChestPanel(ctx);
      return;
    }

    const L   = this._invLayout();
    const mx  = this.input.mouse.x, my = this.input.mouse.y;

    // Dim background
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Panel
    ctx.fillStyle = '#1A1A2A';
    _roundRect(ctx, L.panelX, L.panelY, L.panelW, L.panelH, 8);
    ctx.fill();
    ctx.strokeStyle = '#555566';
    ctx.lineWidth   = 1.5;
    _roundRect(ctx, L.panelX, L.panelY, L.panelW, L.panelH, 8);
    ctx.stroke();

    // Title (replaced by the dynamic title drawn after separator label; remove old one)

    // X close button (slightly inset from corner)
    const _ixbx = L.panelX + L.panelW - 30, _ixby = L.panelY + 8;
    const _ixHov = mx >= _ixbx && mx <= _ixbx + 20 && my >= _ixby && my <= _ixby + 20;
    ctx.fillStyle   = _ixHov ? 'rgba(255,80,80,0.3)' : 'rgba(0,0,0,0.4)';
    _roundRect(ctx, _ixbx, _ixby, 20, 20, 4); ctx.fill();
    ctx.strokeStyle = _ixHov ? '#FF5555' : '#554444'; ctx.lineWidth = 1;
    _roundRect(ctx, _ixbx, _ixby, 20, 20, 4); ctx.stroke();
    ctx.fillStyle    = _ixHov ? '#fff' : '#AA7777';
    ctx.font         = 'bold 12px Courier New';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✕', _ixbx + 10, _ixby + 10);
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';

    // Panel title — "CHEST" when chest open, else "INVENTORY"
    ctx.fillStyle    = '#CCCCDD';
    ctx.font         = 'bold 13px Courier New';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      this._chestOpen ? 'CHEST' : 'INVENTORY',
      L.panelX + L.panelW / 2, L.panelY + 14
    );
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

    // Separator label (hotbar)
    ctx.fillStyle = '#888899';
    ctx.font      = '9px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('— Hotbar —',
      L.panelX + L.panelW / 2, L.hotbarY - 4);
    ctx.textAlign = 'left';

    // Draw a slot grid
    const drawSlot = (item, sx, sy, active = false) => {
      const hovered = mx >= sx && mx < sx + L.slotSz && my >= sy && my < sy + L.slotSz;
      ctx.fillStyle = hovered ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.55)';
      ctx.fillRect(sx, sy, L.slotSz, L.slotSz);
      ctx.strokeStyle = active ? '#FFD700' : hovered ? '#AAAACC' : '#444455';
      ctx.lineWidth   = active ? 2.5 : 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, L.slotSz - 1, L.slotSz - 1);

      if (item) {
        if (item.type === 'armor' && ARMOR_DATA[item.armorKey]) {
          const ad = ARMOR_DATA[item.armorKey];
          const p  = 6;
          ctx.fillStyle = ad.color;
          ctx.fillRect(sx + p, sy + p, L.slotSz - p * 2, L.slotSz - p * 2);
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(sx + p, sy + p, L.slotSz - p * 2, 4);
          const PIECE_L = { head: 'H', chest: 'C', legs: 'L', feet: 'F' };
          ctx.fillStyle = '#fff';
          ctx.font      = `bold ${Math.floor(L.slotSz * 0.38)}px Courier New`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(PIECE_L[ad.piece] ?? '?', sx + L.slotSz / 2, sy + L.slotSz / 2);
          ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        } else if (item.type === 'tool') {
          const td = TOOL_DATA[item.toolKey];
          if (td) {
            const p = 5;
            ctx.fillStyle = td.color;
            ctx.fillRect(sx + p, sy + p, L.slotSz - p * 2, L.slotSz - p * 2);
            const TOOL_ICONS = { pickaxe: '⛏', sword: '⚔', bow: '🏹', shield: '🛡', flint_steel: '🔥' };
            ctx.fillStyle = '#fff';
            ctx.font = `${Math.floor(L.slotSz * 0.45)}px serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(TOOL_ICONS[td.type] ?? '?', sx + L.slotSz / 2, sy + L.slotSz / 2);
            ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
          }
        } else {
          const pad   = 5;
          const scale = (L.slotSz - pad * 2) / BLOCK_SIZE;
          ctx.save();
          ctx.translate(sx + pad, sy + pad);
          ctx.scale(scale, scale);
          drawBlock(ctx, item.type, 0, 0, 0);
          ctx.restore();

          ctx.fillStyle    = '#fff';
          ctx.font         = 'bold 10px Courier New';
          ctx.textAlign    = 'right';
          ctx.textBaseline = 'bottom';
          ctx.fillText(item.count, sx + L.slotSz - 3, sy + L.slotSz - 2);
          ctx.textAlign    = 'left';
          ctx.textBaseline = 'alphabetic';
        }
      }
    };

    // ── Chest slots (when chest is open) ─────────────────────────
    if (this._chestOpen && L.chestSlotsY !== null) {
      const chest = this._chests.get(`${this._chestOpen.col},${this._chestOpen.row}`);
      for (let i = 0; i < L.CHEST_SLOTS; i++) {
        const sx = L.chestSlotsX + i * (L.slotSz + L.gap);
        drawSlot(chest ? chest.items[i] : null, sx, L.chestSlotsY);
      }
      // Separator + "INVENTORY" sub-label
      const sepY = L.chestSlotsY + L.slotSz + 4;
      ctx.fillStyle = '#333344';
      ctx.fillRect(L.panelX + 16, sepY, L.panelW - 32, 1);
      ctx.fillStyle = '#888899';
      ctx.font = '9px Courier New';
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('— Inventory —', L.panelX + L.panelW / 2, sepY + 9);
      ctx.textAlign = 'left';
    }

    // Inventory rows
    for (let r = 0; r < L.rows; r++) {
      for (let c = 0; c < L.cols; c++) {
        const sx = L.contentX + c * (L.slotSz + L.gap);
        const sy = L.invY     + r * (L.slotSz + L.gap);
        drawSlot(this.player.inventory[r * 9 + c], sx, sy);
      }
    }

    // Hotbar row — slots 0-3 are reserved (locked) and show their icons always
    for (let c = 0; c < L.cols; c++) {
      const sx = L.contentX + c * (L.slotSz + L.gap);
      if (c < 4) {
        // Reserved slot: draw locked background + icon
        const hovered = mx >= sx && mx < sx + L.slotSz && my >= L.hotbarY && my < L.hotbarY + L.slotSz;
        ctx.fillStyle = c === this.player.selectedSlot ? 'rgba(255,215,0,0.22)' : 'rgba(30,20,50,0.75)';
        ctx.fillRect(sx, L.hotbarY, L.slotSz, L.slotSz);
        ctx.strokeStyle = c === this.player.selectedSlot ? '#FFD700' : '#6655AA';
        ctx.lineWidth   = c === this.player.selectedSlot ? 2.5 : 1.5;
        ctx.strokeRect(sx + 0.5, L.hotbarY + 0.5, L.slotSz - 1, L.slotSz - 1);
        // Lock icon (top-right corner)
        ctx.fillStyle = 'rgba(150,130,200,0.7)';
        ctx.font      = '7px Courier New';
        ctx.textAlign = 'right'; ctx.textBaseline = 'top';
        ctx.fillText('🔒', sx + L.slotSz - 2, L.hotbarY + 2);
        ctx.textAlign = 'left';
        // Tool/item icon
        if (c === 0 || c === 1 || c === 2) {
          const toolKey  = c === 0 ? this.player.pickaxe : c === 1 ? this.player.sword : this.player.bow;
          const toolIcon = c === 0 ? '⛏' : c === 1 ? '⚔' : '🏹';
          const toolData = toolKey ? TOOL_DATA[toolKey] : null;
          if (toolData) {
            ctx.fillStyle = toolData.color;
            ctx.font = `${Math.floor(L.slotSz * 0.45)}px serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(toolIcon, sx + L.slotSz / 2, L.hotbarY + L.slotSz / 2);
            ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
          } else {
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = '#AAAAAA';
            ctx.font = `${Math.floor(L.slotSz * 0.45)}px serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(toolIcon, sx + L.slotSz / 2, L.hotbarY + L.slotSz / 2);
            ctx.globalAlpha = 1;
            ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
          }
        } else if (c === 3) {
          // Apple slot
          const appleSlot = this.player.hotbar[3];
          const hasApple  = appleSlot && appleSlot.type === BLOCK.APPLE && appleSlot.count > 0;
          ctx.save();
          if (!hasApple) ctx.globalAlpha = 0.35;
          const pad   = 5;
          const scale = (L.slotSz - pad * 2) / BLOCK_SIZE;
          ctx.translate(sx + pad, L.hotbarY + pad);
          ctx.scale(scale, scale);
          drawBlock(ctx, BLOCK.APPLE, 0, 0, 0);
          ctx.restore();
          if (hasApple) {
            ctx.fillStyle = '#fff'; ctx.font = 'bold 10px Courier New';
            ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
            ctx.fillText(appleSlot.count, sx + L.slotSz - 3, L.hotbarY + L.slotSz - 2);
            ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
          }
        }
      } else {
        drawSlot(this.player.hotbar[c], sx, L.hotbarY, c === this.player.selectedSlot);
      }
    }

    // ─��� Equipment panel ────────────────────────────────────────
    const EQ_LABELS = ['Head', 'Chest', 'Legs', 'Feet'];
    const EQ_SLOTS  = ['head', 'chest', 'legs', 'feet'];
    ctx.fillStyle = '#1A1A2A';
    _roundRect(ctx, L.eqPanelX, L.eqPanelY, L.eqPanelW, L.eqPanelH, 8);
    ctx.fill();
    ctx.strokeStyle = '#555566'; ctx.lineWidth = 1.5;
    _roundRect(ctx, L.eqPanelX, L.eqPanelY, L.eqPanelW, L.eqPanelH, 8);
    ctx.stroke();

    ctx.fillStyle = '#CCCCDD'; ctx.font = 'bold 11px Courier New';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('ARMOR', L.eqPanelX + L.eqPanelW / 2, L.eqPanelY + 14);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

    for (let i = 0; i < 4; i++) {
      const eqKey  = this.player.equippedArmor[EQ_SLOTS[i]];
      const eqItem = eqKey ? { type: 'armor', armorKey: eqKey, count: 1 } : null;
      const esy    = L.eqSlotY[i];
      // Label
      ctx.fillStyle = '#888899'; ctx.font = '8px Courier New';
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(EQ_LABELS[i], L.eqSlotX + L.slotSz / 2, esy - 3);
      ctx.textAlign = 'left';
      drawSlot(eqItem, L.eqSlotX, esy);
      // Armor protection tooltip on hover
      if (eqItem && mx >= L.eqSlotX && mx < L.eqSlotX + L.slotSz &&
          my >= esy && my < esy + L.slotSz) {
        const ad = ARMOR_DATA[eqKey];
        if (ad) {
          ctx.fillStyle = '#DDDDEE'; ctx.font = '8px Courier New';
          ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
          ctx.fillText(ad.name, L.eqSlotX + L.slotSz / 2, esy - 13);
          ctx.textAlign = 'left';
        }
      }
    }

    // Flint & Steel indicator (if player has it)
    if (this.player.hasFlintSteel) {
      const fsY = L.eqPanelY + L.eqPanelH - 38;
      ctx.fillStyle = 'rgba(200,136,50,0.18)';
      _roundRect(ctx, L.eqPanelX + 6, fsY, L.eqPanelW - 12, 22, 4);
      ctx.fill();
      ctx.strokeStyle = '#CC8833'; ctx.lineWidth = 1;
      _roundRect(ctx, L.eqPanelX + 6, fsY, L.eqPanelW - 12, 22, 4);
      ctx.stroke();
      ctx.font = '11px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FFCC66';
      ctx.fillText('🔥 Flint & Steel', L.eqPanelX + L.eqPanelW / 2, fsY + 11);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }

    // Armor reduction summary
    const totalRed = this.player.getArmorReduction();
    if (totalRed > 0) {
      ctx.fillStyle = '#AADDAA'; ctx.font = '8px Courier New';
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(`DMG -${totalRed}`, L.eqPanelX + L.eqPanelW / 2, L.eqPanelY + L.eqPanelH - 10);
      ctx.textAlign = 'left';
    }

    // Held item follows cursor
    if (this._invHeld) {
      if (this._invHeld.type === 'armor' && ARMOR_DATA[this._invHeld.armorKey]) {
        const ad = ARMOR_DATA[this._invHeld.armorKey];
        const p  = 4, sz = L.slotSz;
        ctx.fillStyle = ad.color;
        ctx.fillRect(mx - sz / 2 + p, my - sz / 2 + p, sz - p * 2, sz - p * 2);
        ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.floor(sz * 0.38)}px Courier New`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const PIECE_L = { head: 'H', chest: 'C', legs: 'L', feet: 'F' };
        ctx.fillText(PIECE_L[ad.piece] ?? '?', mx, my);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      } else if (this._invHeld.type === 'tool' && TOOL_DATA[this._invHeld.toolKey]) {
        const td = TOOL_DATA[this._invHeld.toolKey];
        const p = 4, sz = L.slotSz;
        ctx.fillStyle = td.color;
        ctx.fillRect(mx - sz / 2 + p, my - sz / 2 + p, sz - p * 2, sz - p * 2);
        const TOOL_ICONS = { pickaxe: '⛏', sword: '⚔', bow: '🏹', shield: '🛡', flint_steel: '🔥' };
        ctx.fillStyle = '#fff'; ctx.font = `${Math.floor(sz * 0.45)}px serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(TOOL_ICONS[td.type] ?? '?', mx, my);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      } else {
        const pad   = 4;
        const scale = (L.slotSz - pad * 2) / BLOCK_SIZE;
        ctx.save();
        ctx.translate(mx - L.slotSz / 2 + pad, my - L.slotSz / 2 + pad);
        ctx.scale(scale, scale);
        drawBlock(ctx, this._invHeld.type, 0, 0, 0);
        ctx.restore();
        ctx.fillStyle    = '#fff';
        ctx.font         = 'bold 10px Courier New';
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(this._invHeld.count,
          mx + L.slotSz / 2 - 3, my + L.slotSz / 2 - 2);
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'alphabetic';
      }
    }
  }

  // ── Background ───────────────────────────────────────────

  _drawSky(ctx, biome = 'plains') {
    if (biome === 'end') {
      ctx.fillStyle = '#020008';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      // Subtle purple nebula gradient
      const neb = ctx.createRadialGradient(CANVAS_W * 0.6, CANVAS_H * 0.35, 0, CANVAS_W * 0.6, CANVAS_H * 0.35, CANVAS_W * 0.6);
      neb.addColorStop(0,   'rgba(80,0,150,0.25)');
      neb.addColorStop(0.5, 'rgba(40,0,80,0.12)');
      neb.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = neb;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      // Static starfield (seeded by camera position for parallax effect)
      ctx.fillStyle = '#CCAAFF';
      const starSeeds = [
        [0.08,0.12],[0.22,0.05],[0.41,0.18],[0.57,0.08],[0.73,0.22],[0.89,0.07],
        [0.15,0.32],[0.34,0.41],[0.62,0.29],[0.78,0.38],[0.93,0.31],[0.05,0.45],
        [0.48,0.52],[0.66,0.48],[0.82,0.58],[0.11,0.62],[0.27,0.72],[0.44,0.68],
        [0.59,0.76],[0.74,0.65],[0.90,0.71],[0.19,0.85],[0.36,0.88],[0.53,0.82],
      ];
      for (const [fx, fy] of starSeeds) {
        const sx = (fx * CANVAS_W - this.camera.x * 0.05 + CANVAS_W * 2) % CANVAS_W;
        const sy = (fy * CANVAS_H - this.camera.y * 0.02 + CANVAS_H * 2) % CANVAS_H;
        ctx.fillRect(sx, sy, 2, 2);
      }
      ctx.fillStyle = '#EEDDFF';
      const brightStars = [[0.30,0.15],[0.68,0.42],[0.12,0.55],[0.85,0.22],[0.50,0.78]];
      for (const [fx, fy] of brightStars) {
        const sx = (fx * CANVAS_W - this.camera.x * 0.05 + CANVAS_W * 2) % CANVAS_W;
        const sy = (fy * CANVAS_H - this.camera.y * 0.02 + CANVAS_H * 2) % CANVAS_H;
        ctx.fillRect(sx, sy, 3, 3);
      }
      return;
    }

    if (biome === 'nether') {
      const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
      grad.addColorStop(0,   '#1A0000');
      grad.addColorStop(0.5, '#3A0800');
      grad.addColorStop(1,   '#220000');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      return;
    }

    // Smooth sky→cave blend based on camera Y crossing row 16
    // Transition band: 4 rows centred on row 16 (pixels 448–576)
    const TRANSITION_PX = 16 * BLOCK_SIZE;
    const HALF_BAND     = 2 * BLOCK_SIZE;
    const t = Math.max(0, Math.min(1,
      (this.camera.y - (TRANSITION_PX - HALF_BAND)) / (HALF_BAND * 2)
    ));

    if (t < 1) {
      const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
      sky.addColorStop(0,   '#1a6ea8');
      sky.addColorStop(0.5, '#4da6d8');
      sky.addColorStop(1,   '#b8e0f0');
      ctx.fillStyle   = sky;
      ctx.globalAlpha = 1 - t;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.globalAlpha = 1;
    }

    if (t > 0) {
      const cave = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
      cave.addColorStop(0, '#050505');
      cave.addColorStop(1, '#101018');
      ctx.fillStyle   = cave;
      ctx.globalAlpha = t;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.globalAlpha = 1;
    }
  }

  _drawClouds(ctx) {
    const bs = 26;
    ctx.save();
    for (const c of this.clouds) {
      const ox = c.x - this.camera.x * 0.3;
      const oy = c.y - this.camera.y * 0.1;
      const maxDX = Math.max(...c.shape.map(([dx]) => dx)) * bs + bs;
      if (ox + maxDX < 0 || ox > CANVAS_W) continue;

      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      for (const [dx, dy] of c.shape)
        ctx.fillRect(Math.floor(ox+dx*bs), Math.floor(oy+dy*bs), bs, bs);
      ctx.fillStyle = 'rgba(180,195,215,0.70)';
      for (const [dx, dy] of c.shape)
        ctx.fillRect(Math.floor(ox+dx*bs), Math.floor(oy+dy*bs+bs-5), bs, 5);
      ctx.fillStyle = 'rgba(200,215,230,0.40)';
      for (const [dx, dy] of c.shape)
        ctx.fillRect(Math.floor(ox+dx*bs+bs-4), Math.floor(oy+dy*bs), 4, bs);
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      for (const [dx, dy] of c.shape) {
        ctx.fillRect(Math.floor(ox+dx*bs), Math.floor(oy+dy*bs), bs, 1);
        ctx.fillRect(Math.floor(ox+dx*bs), Math.floor(oy+dy*bs), 1, bs);
      }
    }
    ctx.restore();
  }

  _drawPlaceGhost(ctx, row, col, blockType) {
    const sx = col * BLOCK_SIZE - this.camera.x;
    const sy = row * BLOCK_SIZE - this.camera.y;
    ctx.save();
    ctx.globalAlpha = 0.45;
    drawBlock(ctx, blockType, sx, sy, 0);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth   = 2;
    ctx.strokeRect(sx + 1, sy + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);
    ctx.restore();
  }

  // Ghost preview for sandbox mode (single block or multi-block footprint)
  _drawSandboxGhost(ctx, hoverRow, hoverCol) {
    if (this.sandbox.isEggSelected)  return;
    if (this.sandbox.isToolSelected) return;
    if (this.sandbox.isDustSelected) {
      const target = this.level.get(hoverRow, hoverCol);
      if (target !== BLOCK.AIR && this._isDustValidTarget(target)) {
        const sx = hoverCol * BLOCK_SIZE - this.camera.x;
        const sy = hoverRow * BLOCK_SIZE - this.camera.y;
        this._drawDustPattern(ctx, sx, sy, false, 0.5);
      }
      return;
    }
    if (this.sandbox.isGateSelected) {
      const target = this.level.get(hoverRow, hoverCol);
      if (target !== BLOCK.AIR && this._isDustValidTarget(target)) {
        const sx = hoverCol * BLOCK_SIZE - this.camera.x;
        const sy = hoverRow * BLOCK_SIZE - this.camera.y;
        ctx.save();
        ctx.globalAlpha = 0.45;
        const c = this.sandbox.selectedGateType === 'not' ? '#00AAAA' : '#CC7700';
        ctx.fillStyle = c;
        ctx.fillRect(sx + 8, sy + 8, BLOCK_SIZE - 16, BLOCK_SIZE - 16);
        ctx.restore();
      }
      return;
    }

    if (this.sandbox.isMultiBlock) {
      const fp = this.sandbox.getFootprint(hoverRow, hoverCol);
      if (!fp) return;
      const valid = fp.every(({ r, c }) => this.level.get(r, c) === BLOCK.AIR);
      ctx.save();
      for (const { r, c, type } of fp) {
        const sx = c * BLOCK_SIZE - this.camera.x;
        const sy = r * BLOCK_SIZE - this.camera.y;
        ctx.globalAlpha = 0.45;
        drawBlock(ctx, type, sx, sy, 0);
        ctx.globalAlpha = valid ? 0.18 : 0.35;
        ctx.fillStyle = valid ? 'rgba(0,255,100,1)' : 'rgba(255,60,60,1)';
        ctx.fillRect(sx, sy, BLOCK_SIZE, BLOCK_SIZE);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = valid ? 'rgba(0,255,100,0.7)' : 'rgba(255,60,60,0.8)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(sx + 1, sy + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);
      }
      // Ruined portal: also show gap (M) and interior (P) positions as purple hints
      if (this.sandbox.selectedBlock === SB_RUINED_PORTAL) {
        const allHints = [...Game.RP_GAP_OFFSETS, ...Game.RP_INTERIOR_OFFSETS];
        for (const [dr, dc] of allHints) {
          const sx = (hoverCol + dc) * BLOCK_SIZE - this.camera.x;
          const sy = (hoverRow + dr) * BLOCK_SIZE - this.camera.y;
          ctx.globalAlpha = 0.22;
          ctx.fillStyle = '#AA44FF';
          ctx.fillRect(sx, sy, BLOCK_SIZE, BLOCK_SIZE);
          ctx.globalAlpha = 0.5;
          ctx.strokeStyle = 'rgba(170,68,255,0.6)';
          ctx.lineWidth = 1;
          ctx.strokeRect(sx + 1, sy + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);
        }
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    } else if (this.sandbox.brushSize > 1 && this.sandbox.isBrushApplicable) {
      // Multi-block brush preview: green overlay on AIR (will fill), red on solid (no effect)
      const sz   = this.sandbox.brushSize;
      const half = Math.floor(sz / 2);
      const sb   = this.sandbox.selectedBlock;
      ctx.save();
      for (let dr = 0; dr < sz; dr++) {
        for (let dc = 0; dc < sz; dc++) {
          const r  = hoverRow - half + dr;
          const c  = hoverCol - half + dc;
          if (r < 0 || r >= this.level.height || c < 0 || c >= this.level.width) continue;
          const sx = c * BLOCK_SIZE - this.camera.x;
          const sy = r * BLOCK_SIZE - this.camera.y;
          const t  = this.level.get(r, c);
          ctx.globalAlpha = 0.38;
          drawBlock(ctx, sb, sx, sy, 0);
          ctx.globalAlpha = t === BLOCK.AIR ? 0.20 : 0.36;
          ctx.fillStyle   = t === BLOCK.AIR ? '#44FF88' : '#FF6644';
          ctx.fillRect(sx, sy, BLOCK_SIZE, BLOCK_SIZE);
          ctx.globalAlpha = 0.6;
          ctx.strokeStyle = t === BLOCK.AIR ? '#44FF88' : '#FF6644';
          ctx.lineWidth   = 1;
          ctx.strokeRect(sx + 0.5, sy + 0.5, BLOCK_SIZE - 1, BLOCK_SIZE - 1);
        }
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    } else {
      const target = this.level.get(hoverRow, hoverCol);
      if (target === BLOCK.AIR) {
        this._drawPlaceGhost(ctx, hoverRow, hoverCol, this.sandbox.selectedBlock);
      } else {
        this.level.drawHover(ctx, hoverRow, hoverCol, this.camera);
      }
    }
  }

  // ── Sandbox multi-block placement / removal ───────────────────

  _sandboxPlaceMulti(anchorRow, anchorCol) {
    const fp = this.sandbox.getFootprint(anchorRow, anchorCol);
    if (!fp) return;

    // Ruined portal: biome restriction — overworld/cave only
    if (this.sandbox.selectedBlock === SB_RUINED_PORTAL) {
      if (anchorCol >= BIOME_CAVE_END) {
        this._notify('Ruined portals can only be placed in overworld or cave biomes', '#FF6644', 160);
        return;
      }
    }

    if (!fp.every(({ r, c }) => this.level.get(r, c) === BLOCK.AIR)) {
      this._notify('Area blocked — clear space first', '#FF6644', 100);
      return;
    }
    for (const { r, c, type } of fp) {
      this.level.set(r, c, type);
    }
    // Register portal in sandbox registry so it can be linked
    if (this.sandbox.selectedBlock === BLOCK.NETHER_PORTAL_FRAME) {
      const biome = anchorCol >= BIOME_CAVE_END ? 'nether' : 'overworld';
      const entry = this.sandbox.registerPortal(anchorRow, anchorCol, biome);
      this._notify(`Portal ${entry.label} placed — click it to assign a destination`, '#AA88FF', 200);
    }
    // Register ruined portal and mark frame obsidian as non-solid
    if (this.sandbox.selectedBlock === SB_RUINED_PORTAL) {
      this._registerRuinedPortal(anchorRow, anchorCol);
      const rpEntry = this.sandbox.registerPortal(anchorRow, anchorCol, 'overworld', true);
      this._notify(`Ruined portal ${rpEntry.label} placed — click it to link a destination, fill gaps with obsidian, then use Flint & Steel (U)`, '#AA77FF', 340);
    }
    // End Portal: register anchor and notify player
    if (this.sandbox.selectedBlock === SB_END_PORTAL) {
      const anchorKey = `${anchorCol},${anchorRow}`;
      this._endPortalAnchors.set(anchorKey, { col: anchorCol, row: anchorRow, eyeCount: 0, active: false });
      this._notify('End Portal placed — place 5 Eyes of Ender in the frame blocks to activate', '#AA44FF', 280);
    }
  }

  // ── Redstone dust propagation (Phase 6C) ─────────────────────

  // Kick off propagation from a source (lever or pressure plate) at (srcCol, srcRow).
  _rsStartFromSource(srcCol, srcRow, powered) {
    const DIRS = [[0,1],[0,-1],[1,0],[-1,0]];
    const GD = Game.GATE_DIRS;
    for (const [dr, dc] of DIRS) {
      const c = srcCol + dc, r = srcRow + dr;
      // Adjacent dust — always queue OFF signals even if dust is already off,
      // because a pending ON may be in the queue and must be cancelled/overridden.
      const dust = this._dustBlocks.get(`${c},${r}`);
      if (dust && (dust.on !== powered || !powered)) {
        this._rsEnqueue({ col: c, row: r, powered, frame: this.frameCount + 6 });
      }
      // Adjacent transmitter block
      if (this.level.get(r, c) === BLOCK.TRANSMITTER) {
        this._rsEnqueue({ type: 'transmitter', col: c, row: r, frame: this.frameCount + 6 });
      }
      // Adjacent gate with input facing this source
      const gate = this._gateBlocks.get(`${c},${r}`);
      if (gate && gate.inputSide) {
        const [gdr, gdc] = GD[gate.inputSide];
        if (c + gdc === srcCol && r + gdr === srcRow) {
          this._rsEnqueue({ type: 'gate', col: c, row: r, frame: this.frameCount + 6 });
        }
      }
      if (gate && gate.type === 'and' && gate.inputSide2) {
        const [gdr2, gdc2] = GD[gate.inputSide2];
        if (c + gdc2 === srcCol && r + gdr2 === srcRow) {
          this._rsEnqueue({ type: 'gate', col: c, row: r, frame: this.frameCount + 6 });
        }
      }
    }
  }

  // Add an entry to the queue, skipping true duplicates.
  // When adding an OFF signal for a dust cell, cancel any pending ON for the same cell
  // so a brief press can't leave dust stuck on.
  _rsEnqueue(entry) {
    if (!entry.type && !entry.powered) {
      const qi = this._rsQueue.findIndex(
        e => !e.type && e.col === entry.col && e.row === entry.row && e.powered
      );
      if (qi >= 0) this._rsQueue.splice(qi, 1);
    }
    const dup = this._rsQueue.some(e => {
      if (entry.type !== e.type) return false;
      if (entry.type === 'device') return e.comp === entry.comp;
      if (entry.type === 'gate')   return e.col === entry.col && e.row === entry.row;
      return e.col === entry.col && e.row === entry.row && e.powered === entry.powered;
    });
    if (!dup) this._rsQueue.push(entry);
  }

  // Called every frame — fire any entries whose target frame has been reached.
  // Processes in-place (no array allocations) to avoid GC pressure.
  _rsProcessQueue() {
    if (!this._rsQueue.length) return;
    const DIRS = [[0,1],[0,-1],[1,0],[-1,0]];
    // Iterate backward so splice doesn't shift unvisited entries
    for (let i = this._rsQueue.length - 1; i >= 0; i--) {
      const entry = this._rsQueue[i];
      if (entry.frame > this.frameCount) continue;
      this._rsQueue.splice(i, 1);

      if (entry.type === 'device')      { this._rsApplyDevice(entry.comp); continue; }
      if (entry.type === 'gate')        { this._rsEvaluateGate(entry.col, entry.row, entry.frame); continue; }
      if (entry.type === 'transmitter') { this._rsActivateTransmitter(entry.col, entry.row, entry.frame); continue; }
      if (entry.type === 'receiver')    { this._rsActivateReceiver(entry.col, entry.row, entry.powered, entry.frame); continue; }

      const dust = this._dustBlocks.get(`${entry.col},${entry.row}`);
      if (!dust || dust.on === entry.powered) continue;

      dust.on = entry.powered;
      dust.everTriggered = true; // visible after ANY first state change, not just when powered

      const GD = Game.GATE_DIRS;
      for (const [dr, dc] of DIRS) {
        const nc = entry.col + dc, nr = entry.row + dr;
        // Continue dust chain
        const next = this._dustBlocks.get(`${nc},${nr}`);
        if (next && next.on !== entry.powered) {
          this._rsEnqueue({ col: nc, row: nr, powered: entry.powered, frame: entry.frame + 6 });
        }
        // Device at neighbor
        const devComp = this.redstone.getAt(nc, nr);
        if (devComp && (devComp.type === 'trapdoor' || devComp.type === 'tnt' || devComp.type === 'piston')) {
          this._rsEnqueue({ type: 'device', comp: devComp, frame: entry.frame + 6 });
        }
        // Transmitter block at neighbor
        if (this.level.get(nr, nc) === BLOCK.TRANSMITTER) {
          this._rsEnqueue({ type: 'transmitter', col: nc, row: nr, frame: entry.frame + 6 });
        }
        // Gate at neighbor with input facing this dust
        const gate = this._gateBlocks.get(`${nc},${nr}`);
        if (gate && gate.inputSide) {
          const [gdr, gdc] = GD[gate.inputSide];
          if (nc + gdc === entry.col && nr + gdr === entry.row) {
            this._rsEnqueue({ type: 'gate', col: nc, row: nr, frame: entry.frame + 6 });
          }
        }
        if (gate && gate.type === 'and' && gate.inputSide2) {
          const [gdr2, gdc2] = GD[gate.inputSide2];
          if (nc + gdc2 === entry.col && nr + gdr2 === entry.row) {
            this._rsEnqueue({ type: 'gate', col: nc, row: nr, frame: entry.frame + 6 });
          }
        }
      }
    }
  }

  // Evaluate a gate's logic and propagate its output.
  _rsEvaluateGate(gCol, gRow, sourceFrame) {
    const gate = this._gateBlocks.get(`${gCol},${gRow}`);
    if (!gate || !gate.inputSide || !gate.outputSide) return;
    const GD = Game.GATE_DIRS;

    const getSignal = (side) => {
      const [dr, dc] = GD[side];
      const c = gCol + dc, r = gRow + dr;
      const d = this._dustBlocks.get(`${c},${r}`);
      if (d) return d.on;
      const comp = this.redstone.getAt(c, r);
      if (comp && (comp.type === 'lever' || comp.type === 'pressure_plate')) return !!comp.on;
      const srcGate = this._gateBlocks.get(`${c},${r}`);
      if (srcGate && srcGate.outputSide) {
        const [ogdr, ogdc] = GD[srcGate.outputSide];
        if (srcGate.col + ogdc === gCol && srcGate.row + ogdr === gRow) return !!srcGate.outputPowered;
      }
      return false;
    };

    const in1 = getSignal(gate.inputSide);
    const newOutput = gate.type === 'not' ? !in1 : (in1 && getSignal(gate.inputSide2));

    // Gate received a signal — mark visible regardless of whether output changes
    gate.everTriggered = true;
    if (gate.outputPowered === newOutput) return;
    gate.outputPowered = newOutput;

    // Propagate gate output
    const [outDr, outDc] = GD[gate.outputSide];
    const outCol = gCol + outDc, outRow = gRow + outDr;

    const outDust = this._dustBlocks.get(`${outCol},${outRow}`);
    if (outDust && outDust.on !== newOutput) {
      this._rsEnqueue({ col: outCol, row: outRow, powered: newOutput, frame: sourceFrame + 6 });
    }
    const outDev = this.redstone.getAt(outCol, outRow);
    if (outDev && (outDev.type === 'trapdoor' || outDev.type === 'tnt' || outDev.type === 'piston')) {
      this._rsEnqueue({ type: 'device', comp: outDev, frame: sourceFrame + 6 });
    }
    const outGate = this._gateBlocks.get(`${outCol},${outRow}`);
    if (outGate && outGate.inputSide) {
      const [igdr, igdc] = GD[outGate.inputSide];
      if (outGate.col + igdc === gCol && outGate.row + igdr === gRow) {
        this._rsEnqueue({ type: 'gate', col: outCol, row: outRow, frame: sourceFrame + 6 });
      }
    }
    if (outGate && outGate.type === 'and' && outGate.inputSide2) {
      const [igdr2, igdc2] = GD[outGate.inputSide2];
      if (outGate.col + igdc2 === gCol && outGate.row + igdr2 === gRow) {
        this._rsEnqueue({ type: 'gate', col: outCol, row: outRow, frame: sourceFrame + 6 });
      }
    }
  }

  // Apply OR-gate logic to a device: open/trigger if any adjacent dust is powered.
  _rsApplyDevice(comp) {
    const DIRS = [[0,1],[0,-1],[1,0],[-1,0]];
    const anyOn = DIRS.some(([dr, dc]) => {
      const d = this._dustBlocks.get(`${comp.col + dc},${comp.row + dr}`);
      return d && d.on;
    });
    if (comp.type === 'trapdoor') {
      comp.open = anyOn;
    } else if (comp.type === 'tnt' && anyOn && !comp.fuse) {
      comp.fuse = 120;
    } else if (comp.type === 'piston') {
      this.redstone._activate(comp, anyOn, this.level);
    }
  }

  // ── Piston knockback (applied each frame during extension animation) ──

  _applyPistonKnockback() {
    if (this.gameMode === 'sandbox') return; // no knockback in sandbox
    for (const comp of this.redstone.components) {
      if (comp.type !== 'piston') continue;
      const prog = comp.animProgress ?? 0;
      const tgt  = comp.animTarget  ?? 0;
      // Only apply during early extension (first 2 frames)
      if (tgt !== 1 || prog < 0.01 || prog > 2 / 6) continue;

      const { dr, dc } = _pistonDelta(comp.dir);
      const headCol = comp.col + dc, headRow = comp.row + dr;
      const headPx  = headCol * BLOCK_SIZE, headPy = headRow * BLOCK_SIZE;

      // Player knockback
      if (!this.player.godMode &&
          this.player.x < headPx + BLOCK_SIZE && this.player.x + this.player.width  > headPx &&
          this.player.y < headPy + BLOCK_SIZE && this.player.y + this.player.height > headPy) {
        this.player.vx += dc * 5;
        if (dr !== 0) this.player.vy += dr * 4;
        else this.player.vy = Math.min(this.player.vy, -3); // slight upward nudge
      }

      // Mob knockback
      for (const mob of this.mobManager.mobs) {
        if (mob.hp <= 0) continue;
        if (mob.x < headPx + BLOCK_SIZE && mob.x + mob.w  > headPx &&
            mob.y < headPy + BLOCK_SIZE && mob.y + mob.h  > headPy) {
          mob.vx = (mob.vx || 0) + dc * 4;
          mob.vy = (mob.vy || 0) + dr * 3;
        }
      }
    }
  }

  // ── Transmitter / Receiver system (Phase 6G) ──────────────────

  _txAssignNumber() {
    const used = new Set([...this._transmitters.values()].map(t => t.number));
    for (let n = 1; n <= 99; n++) { if (!used.has(n)) return n; }
    return null;
  }

  _isReceiverStillPowered(rx) {
    for (const num of rx.listenTo) {
      for (const tx of this._transmitters.values()) {
        if (tx.number === num && tx.powered) return true;
      }
    }
    return false;
  }

  // Called when a transmitter block may have had its adjacent dust state change.
  _rsActivateTransmitter(col, row, frame) {
    const tx = this._transmitters.get(`${col},${row}`);
    if (!tx) return;
    const DIRS = [[0,1],[0,-1],[1,0],[-1,0]];
    const anyDustOn = DIRS.some(([dr, dc]) => {
      const d = this._dustBlocks.get(`${col+dc},${row+dr}`);
      return d && d.on;
    });
    const wasPowered = tx.powered;
    tx.powered = anyDustOn;
    if (tx.powered === wasPowered) return;
    // Broadcast to all receivers listening for this transmitter's number
    for (const rx of this._receivers.values()) {
      if (!rx.listenTo.has(tx.number)) continue;
      if (tx.powered) {
        if (!rx.powered) this._rsEnqueue({ type: 'receiver', col: rx.col, row: rx.row, powered: true,  frame: frame + 6 });
      } else {
        if (!this._isReceiverStillPowered(rx)) {
          this._rsEnqueue({ type: 'receiver', col: rx.col, row: rx.row, powered: false, frame: frame + 6 });
        }
      }
    }
  }

  // Called when a receiver should change its power state.
  _rsActivateReceiver(col, row, powered, frame) {
    const rx = this._receivers.get(`${col},${row}`);
    if (!rx || rx.powered === powered) return;
    rx.powered = powered;
    this._rsStartFromReceiver(col, row, powered, frame);
  }

  // Power (or unpower) adjacent dust/devices from a receiver block.
  _rsStartFromReceiver(col, row, powered, frame) {
    const f = frame ?? (this.frameCount + 6);
    const DIRS = [[0,1],[0,-1],[1,0],[-1,0]];
    for (const [dr, dc] of DIRS) {
      const nc = col + dc, nr = row + dr;
      const dust = this._dustBlocks.get(`${nc},${nr}`);
      if (dust && dust.on !== powered) {
        this._rsEnqueue({ col: nc, row: nr, powered, frame: f });
      }
      const devComp = this.redstone.getAt(nc, nr);
      if (devComp && (devComp.type === 'trapdoor' || devComp.type === 'tnt' || devComp.type === 'piston')) {
        this._rsEnqueue({ type: 'device', comp: devComp, frame: f });
      }
    }
  }

  // ── Ruined portal inactive interior overlay ───────────────────

  _drawRuinedPortalOverlay(ctx) {
    if (!this._ruinedPortals.size) return;
    ctx.save();
    const t = Date.now() / 800;
    for (const portal of this._ruinedPortals.values()) {
      if (portal.activated) continue;
      const { anchorRow, anchorCol } = portal;
      for (const [dr, dc] of Game.RP_INTERIOR_OFFSETS) {
        const sx = (anchorCol + dc) * BLOCK_SIZE - this.camera.x;
        const sy = (anchorRow + dr) * BLOCK_SIZE - this.camera.y;
        if (sx < -BLOCK_SIZE || sx > CANVAS_W + BLOCK_SIZE) continue;
        // Dark inactive portal — obsidian-like with very faint purple glow
        ctx.fillStyle = '#0E0618';
        ctx.fillRect(sx, sy, BLOCK_SIZE, BLOCK_SIZE);
        const glo = 0.12 + Math.sin(t + dr * 0.7 + dc * 1.1) * 0.05;
        ctx.fillStyle = `rgba(50,0,90,${glo})`;
        ctx.fillRect(sx + 2, sy + 2, BLOCK_SIZE - 4, BLOCK_SIZE - 4);
        // Edge shadow matching standard block rendering
        ctx.strokeStyle = 'rgba(0,0,0,0.28)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(sx + 0.5, sy + 0.5, BLOCK_SIZE - 1, BLOCK_SIZE - 1);
      }
    }
    ctx.restore();
  }

  // ── TX/RX block rendering ─────────────────────────────────────

  _drawTxRxBlocks(ctx) {
    const startCol = Math.max(0,            Math.floor(this.camera.x / BLOCK_SIZE) - 1);
    const endCol   = Math.min(this.level.width-1,  Math.ceil((this.camera.x + CANVAS_W) / BLOCK_SIZE) + 1);
    const startRow = Math.max(0,            Math.floor(this.camera.y / BLOCK_SIZE) - 1);
    const endRow   = Math.min(this.level.height-1, Math.ceil((this.camera.y + CANVAS_H) / BLOCK_SIZE) + 1);

    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const block = this.level.grid[r][c];
        if (block !== BLOCK.TRANSMITTER && block !== BLOCK.RECEIVER) continue;
        const sx = c * BLOCK_SIZE - this.camera.x;
        const sy = r * BLOCK_SIZE - this.camera.y;
        if (block === BLOCK.TRANSMITTER) {
          const tx = this._transmitters.get(`${c},${r}`);
          _drawTransmitter(ctx, sx, sy, BLOCK_SIZE, tx?.number, tx?.powered);
        } else {
          const rx = this._receivers.get(`${c},${r}`);
          const nums = rx ? [...rx.listenTo].sort((a,b)=>a-b) : [];
          _drawReceiver(ctx, sx, sy, BLOCK_SIZE, nums, rx?.powered);
        }
        // Number badge in sandbox — always show
        if (this.gameMode === 'sandbox' && block === BLOCK.TRANSMITTER) {
          const tx = this._transmitters.get(`${c},${r}`);
          if (tx) {
            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.65)';
            ctx.fillRect(sx, sy - 12, 20, 12);
            ctx.fillStyle = '#FF8888';
            ctx.font = 'bold 8px Courier New';
            ctx.textAlign = 'left'; ctx.textBaseline = 'top';
            ctx.fillText(`#${tx.number}`, sx + 2, sy - 12);
            ctx.restore();
          }
        }
      }
    }
  }

  // ── Receiver config popup ─────────────────────────────────────

  _drawRxConfigPopup(ctx) {
    if (!this._rxConfigPopup) return;
    const rx = this._receivers.get(`${this._rxConfigPopup.col},${this._rxConfigPopup.row}`);
    if (!rx) { this._rxConfigPopup = null; return; }

    const pw = 340, ph = 220;
    const px = (CANVAS_W - pw) / 2, py = (CANVAS_H - ph) / 2;
    const mx = this.input.mouse.x, my = this.input.mouse.y;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
    ctx.fillStyle = '#0A1420'; _roundRect(ctx,px,py,pw,ph,8); ctx.fill();
    ctx.strokeStyle = '#4488FF'; ctx.lineWidth=2; _roundRect(ctx,px,py,pw,ph,8); ctx.stroke();

    // X button
    const xbx=px+pw-26, xby=py+6, xHov=mx>=xbx&&mx<=xbx+20&&my>=xby&&my<=xby+20;
    ctx.fillStyle=xHov?'rgba(255,80,80,0.3)':'rgba(0,0,0,0.4)'; _roundRect(ctx,xbx,xby,20,20,4); ctx.fill();
    ctx.strokeStyle=xHov?'#FF5555':'#554444'; ctx.lineWidth=1; _roundRect(ctx,xbx,xby,20,20,4); ctx.stroke();
    ctx.fillStyle=xHov?'#fff':'#AA7777'; ctx.font='bold 12px Courier New';
    ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('✕',xbx+10,xby+10);

    ctx.fillStyle='#88AAFF'; ctx.font='bold 12px Courier New';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('CONFIGURE RECEIVER', CANVAS_W/2, py+18);

    // Currently listening
    const listening = [...rx.listenTo].sort((a,b)=>a-b);
    ctx.fillStyle='#666'; ctx.font='9px Courier New';
    ctx.fillText(listening.length ? `Listening to: ${listening.join(', ')}` : 'Not listening to any transmitter', CANVAS_W/2, py+36);

    // Transmitter number buttons
    const txNums = [...new Set([...this._transmitters.values()].map(t=>t.number))].sort((a,b)=>a-b);
    if (txNums.length === 0) {
      ctx.fillStyle='#444'; ctx.font='10px Courier New';
      ctx.fillText('No transmitters placed yet', CANVAS_W/2, py+90);
    } else {
      ctx.fillStyle='#555'; ctx.font='8px Courier New';
      ctx.fillText('Click transmitter numbers to toggle:', CANVAS_W/2, py+54);
      const btnSz=34, gap=4, perRow=8;
      const gridX=px+12, gridY=py+64;
      for (let i=0; i<txNums.length; i++) {
        const n=txNums[i];
        const bx=gridX+(i%perRow)*(btnSz+gap), by=gridY+Math.floor(i/perRow)*(btnSz+gap);
        const sel=rx.listenTo.has(n);
        const hov=mx>=bx&&mx<=bx+btnSz&&my>=by&&my<=by+btnSz;
        ctx.fillStyle=sel?'rgba(68,136,255,0.35)':(hov?'rgba(68,136,255,0.15)':'rgba(0,0,0,0.5)');
        _roundRect(ctx,bx,by,btnSz,btnSz,4); ctx.fill();
        ctx.strokeStyle=sel?'#4488FF':(hov?'#4488FF88':'#333'); ctx.lineWidth=sel?2:1;
        _roundRect(ctx,bx,by,btnSz,btnSz,4); ctx.stroke();
        ctx.fillStyle=sel?'#AACCFF':(hov?'#ccc':'#888');
        ctx.font='bold 12px Courier New'; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(n, bx+btnSz/2, by+btnSz/2);
      }
    }

    // Remove button
    const remY=py+ph-44;
    const remHov=mx>=px+12&&mx<=px+pw-12&&my>=remY&&my<=remY+28;
    ctx.fillStyle=remHov?'rgba(220,50,50,0.3)':'rgba(0,0,0,0.4)';
    _roundRect(ctx,px+12,remY,pw-24,28,5); ctx.fill();
    ctx.strokeStyle=remHov?'#FF4444':'#553333'; ctx.lineWidth=1.5;
    _roundRect(ctx,px+12,remY,pw-24,28,5); ctx.stroke();
    ctx.fillStyle=remHov?'#fff':'#cc6666'; ctx.font='11px Courier New';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('✕  Remove Receiver', CANVAS_W/2, remY+14);

    ctx.fillStyle='rgba(100,100,120,0.5)'; ctx.font='8px Courier New';
    ctx.fillText('Click outside to close', CANVAS_W/2, py+ph-6);
    ctx.textAlign='left'; ctx.textBaseline='alphabetic'; ctx.restore();
  }

  _handleRxConfigPopupInput() {
    if (!this._rxConfigPopup) return;
    const rx = this._receivers.get(`${this._rxConfigPopup.col},${this._rxConfigPopup.row}`);
    if (!rx) { this._rxConfigPopup = null; return; }
    if (!this.input.mouse.clicked) return;

    const pw=340, ph=220;
    const px=(CANVAS_W-pw)/2, py=(CANVAS_H-ph)/2;
    const mx=this.input.mouse.x, my=this.input.mouse.y;

    // X button
    if (mx>=px+pw-26&&mx<=px+pw-6&&my>=py+6&&my<=py+26) { this._rxConfigPopup=null; return; }
    // Outside
    if (mx<px||mx>px+pw||my<py||my>py+ph) { this._rxConfigPopup=null; return; }

    // Number toggle buttons
    const txNums=[...new Set([...this._transmitters.values()].map(t=>t.number))].sort((a,b)=>a-b);
    const btnSz=34, gap=4, perRow=8;
    const gridX=px+12, gridY=py+64;
    for (let i=0;i<txNums.length;i++) {
      const n=txNums[i];
      const bx=gridX+(i%perRow)*(btnSz+gap), by=gridY+Math.floor(i/perRow)*(btnSz+gap);
      if (mx>=bx&&mx<=bx+btnSz&&my>=by&&my<=by+btnSz) {
        if (rx.listenTo.has(n)) rx.listenTo.delete(n); else rx.listenTo.add(n);
        return;
      }
    }

    // Remove button
    const remY=py+ph-44;
    if (mx>=px+12&&mx<=px+pw-12&&my>=remY&&my<=remY+28) {
      const col=this._rxConfigPopup.col, row=this._rxConfigPopup.row;
      this._rxConfigPopup=null;
      this._sandboxRemoveBlock(row, col, BLOCK.RECEIVER);
      this.level.set(row, col, BLOCK.AIR);
    }
  }

  // ── Logic gate system (Phase 6F) ─────────────────────────────
  // Direction map: side name → [dr, dc] (row-delta, col-delta)
  // e.g. 'right' → dc=+1, 'down' → dr=+1
  static get GATE_DIRS() {
    return { right:[0,1], left:[0,-1], down:[1,0], up:[-1,0] };
  }

  _newGateConfigPopup(col, row) {
    const gate = this._gateBlocks.get(`${col},${row}`);
    if (!gate) return null;
    // Restore existing assignments if reconfiguring
    return {
      col, row,
      a: { // assignments per side
        left:  gate.inputSide==='left'  ? 'in1' : gate.inputSide2==='left'  ? 'in2' : gate.outputSide==='left'  ? 'out' : '',
        right: gate.inputSide==='right' ? 'in1' : gate.inputSide2==='right' ? 'in2' : gate.outputSide==='right' ? 'out' : '',
        up:    gate.inputSide==='up'    ? 'in1' : gate.inputSide2==='up'    ? 'in2' : gate.outputSide==='up'    ? 'out' : '',
        down:  gate.inputSide==='down'  ? 'in1' : gate.inputSide2==='down'  ? 'in2' : gate.outputSide==='down'  ? 'out' : '',
      },
    };
  }

  _gateConfigValid(popup) {
    const gate = this._gateBlocks.get(`${popup.col},${popup.row}`);
    if (!gate) return false;
    const vals = Object.values(popup.a);
    const outs = vals.filter(v => v === 'out').length;
    const in1s = vals.filter(v => v === 'in1').length;
    if (gate.type === 'not') return outs === 1 && in1s === 1;
    const in2s = vals.filter(v => v === 'in2').length;
    return outs === 1 && in1s === 1 && in2s === 1;
  }

  _applyGateConfig(popup) {
    const gate = this._gateBlocks.get(`${popup.col},${popup.row}`);
    if (!gate) return;
    gate.inputSide  = Object.keys(popup.a).find(s => popup.a[s] === 'in1') || null;
    gate.inputSide2 = Object.keys(popup.a).find(s => popup.a[s] === 'in2') || null;
    gate.outputSide = Object.keys(popup.a).find(s => popup.a[s] === 'out') || null;
    this._dustConnDirty = true; // gate sides affect dust connection topology
  }

  _handleGateConfigPopupInput() {
    if (!this._gateConfigPopup) return;
    const p = this._gateConfigPopup;
    const gate = this._gateBlocks.get(`${p.col},${p.row}`);
    if (!gate) { this._gateConfigPopup = null; return; }
    if (!this.input.mouse.clicked) return;

    const pw = 240, ph = 200;
    const px = (CANVAS_W - pw) / 2, py = (CANVAS_H - ph) / 2;
    const mx = this.input.mouse.x, my = this.input.mouse.y;

    // X / cancel — remove gate if it has no valid config yet
    if (mx >= px + pw - 26 && mx <= px + pw - 6 && my >= py + 6 && my <= py + 26) {
      if (!gate.inputSide || !gate.outputSide) this._gateBlocks.delete(`${p.col},${p.row}`);
      this._gateConfigPopup = null; return;
    }
    if (mx < px || mx > px + pw || my < py || my > py + ph) {
      if (!gate.inputSide || !gate.outputSide) this._gateBlocks.delete(`${p.col},${p.row}`);
      this._gateConfigPopup = null; return;
    }

    // Side buttons in cross layout  (up, left, right, down)
    const cx = px + pw / 2, cy = py + 100;
    const btnSz = 36;
    const sideButtons = {
      up:    [cx - btnSz/2, cy - 46],
      left:  [cx - 74,      cy - btnSz/2],
      right: [cx + 38,      cy - btnSz/2],
      down:  [cx - btnSz/2, cy + 10],
    };
    for (const [side, [bx, by]] of Object.entries(sideButtons)) {
      if (mx >= bx && mx <= bx + btnSz && my >= by && my <= by + btnSz) {
        // Cycle assignment for this side
        const cur = p.a[side];
        const seq = gate.type === 'not' ? ['', 'in1', 'out'] : ['', 'in1', 'in2', 'out'];
        const next = seq[(seq.indexOf(cur) + 1) % seq.length];
        // Clear any other side that has the same assignment (exclusive roles)
        if (next !== '') {
          for (const s of Object.keys(p.a)) {
            if (s !== side && p.a[s] === next) p.a[s] = '';
          }
        }
        p.a[side] = next;
        return;
      }
    }

    // Apply / Done button
    const doneY = py + ph - 44;
    if (this._gateConfigValid(p) && mx >= px + 12 && mx <= px + pw - 12 && my >= doneY && my <= doneY + 32) {
      this._applyGateConfig(p);
      this._gateConfigPopup = null;
      this._notify('Gate configured', '#AAFFAA', 60);
    }
  }

  // ── Piston direction config popup ────────────────────────────

  _handlePistonConfigPopupInput() {
    if (!this._pistonConfigPopup) return;
    const { col, row } = this._pistonConfigPopup;
    const comp = this.redstone.getAt(col, row);
    if (!comp) { this._pistonConfigPopup = null; return; }
    if (!this.input.mouse.clicked) return;

    const pw = 220, ph = 180;
    const px = (CANVAS_W - pw) / 2, py = (CANVAS_H - ph) / 2;
    const mx = this.input.mouse.x, my = this.input.mouse.y;

    // X / cancel — remove the piston
    if (mx >= px + pw - 26 && mx <= px + pw - 6 && my >= py + 6 && my <= py + 26) {
      this.redstone.removeAt(col, row);
      this.level.set(row, col, BLOCK.AIR);
      this._pistonConfigPopup = null; return;
    }
    if (mx < px || mx > px + pw || my < py || my > py + ph) {
      this.redstone.removeAt(col, row);
      this.level.set(row, col, BLOCK.AIR);
      this._pistonConfigPopup = null; return;
    }

    // Direction buttons (cross layout)
    const cx = px + pw / 2, cy = py + 100, btnSz = 40;
    const dirs = [
      { dir: 'up',    bx: cx - btnSz/2, by: cy - 56 },
      { dir: 'down',  bx: cx - btnSz/2, by: cy + 16 },
      { dir: 'left',  bx: cx - 66,      by: cy - btnSz/2 },
      { dir: 'right', bx: cx + 26,      by: cy - btnSz/2 },
    ];
    for (const { dir, bx, by } of dirs) {
      if (mx >= bx && mx <= bx + btnSz && my >= by && my <= by + btnSz) {
        comp.dir = dir;
        this._pistonConfigPopup = null;
        this._notify(`Piston set: ${dir}`, '#FFAA44', 80);
        return;
      }
    }

    // Inverted toggle
    const invY = py + ph - 44;
    if (mx >= px + 14 && mx <= px + pw - 14 && my >= invY && my <= invY + 28) {
      comp.inverted = !comp.inverted;
    }
  }

  _drawPistonConfigPopup(ctx) {
    if (!this._pistonConfigPopup) return;
    const { col, row } = this._pistonConfigPopup;
    const comp = this.redstone.getAt(col, row);
    if (!comp) { this._pistonConfigPopup = null; return; }

    const pw = 220, ph = 180;
    const px = (CANVAS_W - pw) / 2, py = (CANVAS_H - ph) / 2;
    const mx = this.input.mouse.x, my = this.input.mouse.y;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#13131f'; _roundRect(ctx, px, py, pw, ph, 8); ctx.fill();
    ctx.strokeStyle = '#FFAA44'; ctx.lineWidth = 2;
    _roundRect(ctx, px, py, pw, ph, 8); ctx.stroke();

    // X button
    const xbx = px+pw-26, xby = py+6;
    const xHov = mx>=xbx&&mx<=xbx+20&&my>=xby&&my<=xby+20;
    ctx.fillStyle = xHov?'rgba(255,80,80,0.3)':'rgba(0,0,0,0.4)';
    _roundRect(ctx,xbx,xby,20,20,4); ctx.fill();
    ctx.strokeStyle = xHov?'#FF5555':'#554444'; ctx.lineWidth=1;
    _roundRect(ctx,xbx,xby,20,20,4); ctx.stroke();
    ctx.fillStyle = xHov?'#fff':'#AA7777'; ctx.font='bold 12px Courier New';
    ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('✕',xbx+10,xby+10);

    ctx.fillStyle = '#FFAA44'; ctx.font = 'bold 12px Courier New';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('SELECT PISTON DIRECTION', CANVAS_W/2, py + 18);

    // Direction buttons
    const cx = px + pw / 2, cy = py + 100, btnSz = 40;
    const ARROWS = { up: '↑', down: '↓', left: '←', right: '→' };
    const dirs = [
      { dir: 'up',    bx: cx - btnSz/2, by: cy - 56 },
      { dir: 'down',  bx: cx - btnSz/2, by: cy + 16 },
      { dir: 'left',  bx: cx - 66,      by: cy - btnSz/2 },
      { dir: 'right', bx: cx + 26,      by: cy - btnSz/2 },
    ];
    for (const { dir, bx, by } of dirs) {
      const sel = comp.dir === dir;
      const hov = mx >= bx && mx <= bx + btnSz && my >= by && my <= by + btnSz;
      ctx.fillStyle = sel ? 'rgba(255,170,68,0.35)' : hov ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.5)';
      _roundRect(ctx,bx,by,btnSz,btnSz,5); ctx.fill();
      ctx.strokeStyle = sel ? '#FFAA44' : hov ? '#888' : '#444'; ctx.lineWidth = sel ? 2 : 1;
      _roundRect(ctx,bx,by,btnSz,btnSz,5); ctx.stroke();
      ctx.fillStyle = sel ? '#FFAA44' : hov ? '#ddd' : '#888';
      ctx.font = 'bold 20px Courier New';
      ctx.fillText(ARROWS[dir], bx + btnSz/2, by + btnSz/2);
    }
    ctx.font = '8px Courier New'; ctx.fillStyle = '#666';
    ctx.fillText('extends →', cx, cy);

    // Inverted toggle
    const invY = py + ph - 44;
    const invHov = mx >= px+14 && mx <= px+pw-14 && my >= invY && my <= invY+28;
    ctx.fillStyle = comp.inverted ? 'rgba(255,100,100,0.25)' : invHov ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.4)';
    _roundRect(ctx, px+14, invY, pw-28, 28, 5); ctx.fill();
    ctx.strokeStyle = comp.inverted ? '#FF6666' : invHov ? '#888' : '#444'; ctx.lineWidth = 1;
    _roundRect(ctx, px+14, invY, pw-28, 28, 5); ctx.stroke();
    ctx.fillStyle = comp.inverted ? '#FF6666' : '#888';
    ctx.font = '10px Courier New';
    ctx.fillText(comp.inverted ? '⚡ Inverted (ON=retract)' : 'Inverted: OFF  (click to toggle)', cx, invY + 14);

    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.restore();
  }

  _drawGateConfigPopup(ctx) {
    if (!this._gateConfigPopup) return;
    const p = this._gateConfigPopup;
    const gate = this._gateBlocks.get(`${p.col},${p.row}`);
    if (!gate) { this._gateConfigPopup = null; return; }

    const pw = 240, ph = 200;
    const px = (CANVAS_W - pw) / 2, py = (CANVAS_H - ph) / 2;
    const mx = this.input.mouse.x, my = this.input.mouse.y;
    const isNot = gate.type === 'not';
    const accent = isNot ? '#00AAAA' : '#CC7700';

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
    ctx.fillStyle = '#13131f'; _roundRect(ctx, px, py, pw, ph, 8); ctx.fill();
    ctx.strokeStyle = accent; ctx.lineWidth = 2; _roundRect(ctx, px, py, pw, ph, 8); ctx.stroke();

    // X button
    const xbx = px+pw-26, xby = py+6;
    const xHov = mx>=xbx&&mx<=xbx+20&&my>=xby&&my<=xby+20;
    ctx.fillStyle = xHov?'rgba(255,80,80,0.3)':'rgba(0,0,0,0.4)';
    _roundRect(ctx,xbx,xby,20,20,4); ctx.fill();
    ctx.strokeStyle=xHov?'#FF5555':'#554444';ctx.lineWidth=1;_roundRect(ctx,xbx,xby,20,20,4);ctx.stroke();
    ctx.fillStyle=xHov?'#fff':'#AA7777';ctx.font='bold 12px Courier New';
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('✕',xbx+10,xby+10);

    ctx.fillStyle = accent; ctx.font = 'bold 12px Courier New';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`CONFIGURE ${isNot?'NOT':'AND'} GATE`, CANVAS_W/2, py+18);

    ctx.fillStyle='#666';ctx.font='9px Courier New';
    ctx.fillText(isNot?'Click sides: IN → OUT → clear':'Click sides: IN-A → IN-B → OUT → clear', CANVAS_W/2, py+34);

    // Cross layout of side buttons
    const cx = px + pw/2, cy = py + 100;
    const btnSz = 36;
    const sideButtons = {
      up:    [cx - btnSz/2, cy - 46],
      left:  [cx - 74,      cy - btnSz/2],
      right: [cx + 38,      cy - btnSz/2],
      down:  [cx - btnSz/2, cy + 10],
    };
    const ROLE_COLOR = { in1:'#4488FF', in2:'#44DDFF', out:accent, '':'#333' };
    const ROLE_LABEL = { in1:'IN', in2:'IN-B', out:'OUT', '':'—' };

    // Draw gate body placeholder
    ctx.fillStyle = '#333'; ctx.fillRect(cx-12, cy-12, 24, 24);
    ctx.fillStyle = accent; ctx.font='bold 16px Courier New';
    ctx.fillText(isNot?'¬':'&', cx, cy);

    for (const [side, [bx, by]] of Object.entries(sideButtons)) {
      const role = p.a[side] ?? '';
      const hov = mx>=bx&&mx<=bx+btnSz&&my>=by&&my<=by+btnSz;
      ctx.fillStyle = role ? (ROLE_COLOR[role]+'33') : (hov?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.5)');
      _roundRect(ctx,bx,by,btnSz,btnSz,4); ctx.fill();
      ctx.strokeStyle = role ? ROLE_COLOR[role] : (hov?'#888':'#444'); ctx.lineWidth=role?2:1;
      _roundRect(ctx,bx,by,btnSz,btnSz,4); ctx.stroke();
      ctx.fillStyle = role ? ROLE_COLOR[role] : (hov?'#ccc':'#555');
      ctx.font = 'bold 8px Courier New'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(ROLE_LABEL[role]||'—', bx+btnSz/2, by+btnSz/2);
    }

    // Done button
    const valid = this._gateConfigValid(p);
    const doneY = py+ph-44;
    const doneHov = valid&&mx>=px+12&&mx<=px+pw-12&&my>=doneY&&my<=doneY+32;
    ctx.fillStyle = doneHov?`${accent}33`:(valid?`${accent}18`:'rgba(0,0,0,0.3)');
    _roundRect(ctx,px+12,doneY,pw-24,32,5); ctx.fill();
    ctx.strokeStyle = doneHov?accent:(valid?accent+'88':'#333'); ctx.lineWidth=1.5;
    _roundRect(ctx,px+12,doneY,pw-24,32,5); ctx.stroke();
    ctx.fillStyle = doneHov?'#fff':(valid?accent:'#555');
    ctx.font='11px Courier New'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(valid?'✓  Apply Configuration':'Select all sides first', CANVAS_W/2, doneY+16);

    ctx.textAlign='left'; ctx.textBaseline='alphabetic'; ctx.restore();
  }

  // Gate overlay rendering
  _drawGateOverlay(ctx) {
    const D = Game.GATE_DIRS;
    const isSandbox = this.gameMode === 'sandbox';
    for (const gate of this._gateBlocks.values()) {
      const sx = gate.col * BLOCK_SIZE - this.camera.x;
      const sy = gate.row * BLOCK_SIZE - this.camera.y;
      if (sx < -BLOCK_SIZE || sx > CANVAS_W + BLOCK_SIZE) continue;
      if (sy < -BLOCK_SIZE || sy > CANVAS_H + BLOCK_SIZE) continue;

      const isNot    = gate.type === 'not';
      const powered  = gate.outputPowered;
      const triggered = gate.everTriggered;
      const hidden   = gate.setting === 'always_hide';

      let alpha = 1.0;
      if (isSandbox) {
        // In sandbox: always show — dim if not yet triggered or always_hide
        alpha = (!triggered || hidden) ? 0.35 : 1.0;
      } else {
        if (!triggered || hidden) continue;
      }

      ctx.save();
      ctx.globalAlpha = alpha;

      // Gate body
      const offColor = isNot ? '#005555' : '#553300';
      const onColor  = isNot ? '#00FFCC' : '#FFAA00';
      ctx.fillStyle = powered ? onColor : offColor;
      ctx.fillRect(sx + 9, sy + 9, 14, 14);

      // Gate symbol
      ctx.fillStyle = powered ? 'rgba(0,0,0,0.8)' : (isNot?'#00AAAA':'#CC7700');
      ctx.font = 'bold 10px Courier New';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(isNot ? '¬' : '&', sx + 16, sy + 16);

      // Side arrows (only when sides are configured)
      const drawSideArrow = (side, roleLabel) => {
        if (!side || !D[side]) return;
        const [dr, dc] = D[side];
        const tipX = sx + 16 + dc * 14;
        const tipY = sy + 16 + dr * 14;
        const baseX = sx + 16 + dc * 8;
        const baseY = sy + 16 + dr * 8;
        ctx.strokeStyle = roleLabel === 'out' ? (powered ? onColor : (isNot?'#00CCCC':'#FF9900')) : '#8888FF';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(baseX, baseY); ctx.lineTo(tipX, tipY); ctx.stroke();
        // Arrow tip
        const perpX = -dr, perpY = dc;
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - dc*4 + perpX*3, tipY - dr*4 + perpY*3);
        ctx.lineTo(tipX - dc*4 - perpX*3, tipY - dr*4 - perpY*3);
        ctx.closePath(); ctx.fill();
        // NOT inversion bubble on output
        if (isNot && roleLabel === 'out') {
          ctx.strokeStyle = powered?onColor:'#00AAAA'; ctx.lineWidth=1;
          ctx.beginPath(); ctx.arc(tipX, tipY, 3, 0, Math.PI*2); ctx.stroke();
        }
      };

      if (gate.outputSide) {
        drawSideArrow(gate.inputSide,  'in');
        if (gate.type === 'and') drawSideArrow(gate.inputSide2, 'in');
        drawSideArrow(gate.outputSide, 'out');
      }

      // Always-hide badge in sandbox
      if (isSandbox && hidden) {
        ctx.fillStyle='rgba(255,80,80,0.8)'; ctx.font='bold 7px Courier New';
        ctx.textAlign='center'; ctx.textBaseline='top';
        ctx.fillText('H', sx+BLOCK_SIZE/2, sy+5);
      }

      ctx.restore();
    }
  }

  // ── Item physics (gravity for placed/collectible items) ──────

  _updateItemPhysics() {
    // Sandbox placed items
    if (this.gameMode === 'sandbox' && this.sandbox) {
      const items = this.sandbox.placedItems;
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (it.vy === undefined) it.vy = 0; // backward-compat with old saves

        const col = Math.floor(it.wx / BLOCK_SIZE);
        // Standing-on check: one pixel below the item's visual bottom
        const groundRow = Math.floor((it.wy + 9) / BLOCK_SIZE);
        const onGround  = this.level.isSolid(groundRow, col);

        if (onGround) {
          it.vy = 0;
        } else {
          it.vy = Math.min(it.vy + GRAVITY, MAX_FALL_SPEED);
          it.wy += it.vy;
          // Snap to surface if passed through
          const newGRow = Math.floor((it.wy + 9) / BLOCK_SIZE);
          if (this.level.isSolid(newGRow, col)) {
            it.wy  = newGRow * BLOCK_SIZE - 9;
            it.vy  = (it.vy < -1) ? it.vy * -0.3 : 0;
          }
        }

        // Lava — burn up after 2 seconds
        const lavaRow = Math.floor(it.wy / BLOCK_SIZE);
        if (this.level.get(lavaRow, col) === BLOCK.LAVA) {
          it.lavaTimer = (it.lavaTimer || 0) + 1;
          if (it.lavaTimer > 120) { this.sandbox.removeItem(i); continue; }
        } else {
          it.lavaTimer = 0;
        }

        // Keep grid coords in sync (used for save and duplicate-placement check)
        it.col = Math.floor(it.wx / BLOCK_SIZE);
        it.row = Math.floor(it.wy / BLOCK_SIZE);
      }
    }

    // Collectible placed items (platformer + normal mode)
    if (this.gameMode === 'platformer' || this.gameMode === 'normal') {
      for (const it of this._platformerItems) {
        if (it.collected) continue;
        if (it.vy === undefined) it.vy = 0;

        const col       = Math.floor(it.wx / BLOCK_SIZE);
        const groundRow = Math.floor((it.wy + 9) / BLOCK_SIZE);
        if (this.level.isSolid(groundRow, col)) {
          it.vy = 0;
        } else {
          it.vy = Math.min(it.vy + GRAVITY, MAX_FALL_SPEED);
          it.wy += it.vy;
          const newGRow = Math.floor((it.wy + 9) / BLOCK_SIZE);
          if (this.level.isSolid(newGRow, col)) {
            it.wy = newGRow * BLOCK_SIZE - 9;
            it.vy = 0;
          }
        }
      }
    }
  }

  _isDustValidTarget(blockType) {
    const bd = BLOCK_DATA[blockType];
    return bd && bd.solid &&
      blockType !== BLOCK.PISTON_BODY && blockType !== BLOCK.PISTON_HEAD;
  }

  // ════════════════════════════════════════════════════════════
  // UNDO / REDO  (sandbox mode only, max 200 steps)
  // ════════════════════════════════════════════════════════════

  // Compact snapshot of all overlay state (not the grid — grid uses deltas)
  _captureOverlay() {
    return {
      rs: this.redstone.components.map(c => ({
        ...c,
        links: [...(c.links || [])],
        animProgress: c.animProgress ?? (c.extended ? 1 : 0),
        animTarget:   c.animTarget   ?? (c.extended ? 1 : 0),
      })),
      dust:   [...this._dustBlocks.entries()].map(([k, v]) => [k, {...v}]),
      gates:  [...this._gateBlocks.entries()].map(([k, v]) => [k, {...v}]),
      tx:     [...this._transmitters.entries()].map(([k, v]) => [k, {...v}]),
      rx:     [...this._receivers.entries()].map(([k, v]) => [k, {...v, listenTo: [...v.listenTo]}]),
      chests: [...this._chests.entries()].map(([k, v]) => [k, {...v, items: [...v.items]}]),
      eggs:   this.sandbox ? this.sandbox.placedEggs.map(e => ({...e})) : [],
      items:  this.sandbox ? this.sandbox.placedItems.map(i => ({...i})) : [],
      ruinedPortals: [...this._ruinedPortals.entries()].map(([k, v]) => [k, {...v}]),
      portalObsidian: [...this._portalObsidianCells],
      endPortalAnchors: [...this._endPortalAnchors.entries()].map(([k, v]) => [k, {...v}]),
    };
  }

  // Restore overlay state from a snapshot (for undo/redo)
  _restoreOverlay(snap) {
    this.redstone.components = snap.rs.map(c => ({
      ...c,
      links: [...(c.links || [])],
      // Snap piston animation to logical state so it doesn't freeze mid-extend
      animProgress: c.extended ? 1 : 0,
      animTarget:   c.extended ? 1 : 0,
    }));
    this.redstone._map = new Map();
    for (const c of this.redstone.components) this.redstone._map.set(`${c.col},${c.row}`, c);

    this._dustBlocks  = new Map(snap.dust.map(([k, v]) => [k, {...v}]));
    this._gateBlocks  = new Map(snap.gates.map(([k, v]) => [k, {...v}]));
    this._transmitters = new Map(snap.tx.map(([k, v]) => [k, {...v}]));
    this._receivers   = new Map(snap.rx.map(([k, v]) => [k, {...v, listenTo: new Set(v.listenTo)}]));
    this._chests      = new Map(snap.chests.map(([k, v]) => [k, {...v, items: [...v.items]}]));

    if (this.sandbox) {
      this.sandbox.placedEggs  = snap.eggs.map(e => ({...e}));
      this.sandbox.placedItems = snap.items.map(i => ({...i}));
    }

    // Restore ruined portals
    if (snap.ruinedPortals) {
      this._ruinedPortals = new Map(snap.ruinedPortals.map(([k, v]) => [k, {...v}]));
    }
    if (snap.portalObsidian) {
      this._portalObsidianCells = new Set(snap.portalObsidian);
    }
    // Restore End Portal anchors
    if (snap.endPortalAnchors) {
      this._endPortalAnchors = new Map(snap.endPortalAnchors.map(([k, v]) => [k, {...v}]));
    }

    // Housekeeping
    this._dustConnDirty = true;
    this._rsQueue       = [];
    if (this._chestOpen) {
      if (!this._chests.has(`${this._chestOpen.col},${this._chestOpen.row}`)) this._closeChest();
    }
  }

  // Called at the start of a sandbox click — captures "before" state
  _historyBegin(hoverRow, hoverCol) {
    // Determine grid cells to watch (brush area or single cell or multi-block footprint)
    const sb   = this.sandbox;
    const cells = [];
    const addCell = (r, c) => {
      if (r >= 0 && r < this.level.height && c >= 0 && c < this.level.width) cells.push({r, c});
    };

    if (sb.brushSize > 1 && sb.isBrushApplicable) {
      const sz = sb.brushSize, half = Math.floor(sz / 2);
      for (let dr = 0; dr < sz; dr++) for (let dc = 0; dc < sz; dc++) addCell(hoverRow - half + dr, hoverCol - half + dc);
    } else if (sb.isMultiBlock) {
      const fp = sb.getFootprint(hoverRow, hoverCol);
      if (fp) fp.forEach(({r, c}) => addCell(r, c));
      // Ruined portal: also track gap + interior positions (they stay AIR but overlay changes)
      if (sb.selectedBlock === SB_RUINED_PORTAL) {
        for (const [dr, dc] of Game.RP_GAP_OFFSETS) addCell(hoverRow + dr, hoverCol + dc);
        for (const [dr, dc] of Game.RP_INTERIOR_OFFSETS) addCell(hoverRow + dr, hoverCol + dc);
      }
    } else {
      addCell(hoverRow, hoverCol);
      // Bed or portal removal may affect neighbours
      const t = this.level.get(hoverRow, hoverCol);
      if (t === BLOCK.BED) { addCell(hoverRow, hoverCol - 1); addCell(hoverRow, hoverCol + 1); }
      if (t === BLOCK.NETHER_PORTAL_FRAME || t === BLOCK.NETHER_PORTAL ||
          t === BLOCK.END_PORTAL || t === BLOCK.END_PORTAL_FRAME || t === BLOCK.END_PORTAL_FRAME_FULL) {
        for (let dr = -1; dr <= 5; dr++) for (let dc = -1; dc <= 5; dc++) addCell(hoverRow + dr, hoverCol + dc);
      }
    }

    // Deduplicate
    const seen = new Set(), unique = [];
    for (const cell of cells) {
      const key = `${cell.r},${cell.c}`;
      if (!seen.has(key)) { seen.add(key); unique.push(cell); }
    }

    this._pendingAction = {
      gridBefore: unique.map(({r, c}) => ({r, c, type: this.level.get(r, c)})),
      overlayBefore: this._captureOverlay(),
    };
  }

  // Called after a sandbox click — diffs and pushes to history if anything changed
  _historyCommit() {
    if (!this._pendingAction) return;
    const {gridBefore, overlayBefore} = this._pendingAction;
    this._pendingAction = null;

    // Grid deltas (only cells that actually changed)
    const gridDeltas = gridBefore
      .map(({r, c, type}) => ({r, c, before: type, after: this.level.get(r, c)}))
      .filter(d => d.before !== d.after);

    // Overlay diff (JSON compare — overlays are small so this is fast)
    const overlayAfter = this._captureOverlay();
    const overlayChanged = JSON.stringify(overlayBefore) !== JSON.stringify(overlayAfter);

    if (gridDeltas.length === 0 && !overlayChanged) return; // nothing to record

    // Truncate redo stack and push
    this._historyStack.splice(this._historyPos + 1);
    this._historyStack.push({gridDeltas, overlayBefore, overlayAfter});
    if (this._historyStack.length > 200) this._historyStack.shift();
    this._historyPos = this._historyStack.length - 1;
  }

  _historyUndo() {
    if (this._historyPos < 0) { this._notify('Nothing to undo', '#888888', 60); return; }
    const action = this._historyStack[this._historyPos];
    this._historyPos--;
    for (const d of action.gridDeltas) this.level.set(d.r, d.c, d.before);
    this._restoreOverlay(action.overlayBefore);
    const remaining = this._historyPos + 1;
    this._notify(`Undo  (${remaining} left)`, '#88AAFF', 80);
  }

  _historyRedo() {
    if (this._historyPos >= this._historyStack.length - 1) { this._notify('Nothing to redo', '#888888', 60); return; }
    this._historyPos++;
    const action = this._historyStack[this._historyPos];
    for (const d of action.gridDeltas) this.level.set(d.r, d.c, d.after);
    this._restoreOverlay(action.overlayAfter);
    const redoLeft = this._historyStack.length - 1 - this._historyPos;
    this._notify(`Redo  (${redoLeft} more)`, '#AAFFAA', 80);
  }

  // ── Undo/redo indicator (drawn over sandbox HUD) ──────────────
  _drawUndoIndicator(ctx) {
    const undoCount = this._historyPos + 1;
    const redoCount = this._historyStack.length - 1 - this._historyPos;
    if (undoCount === 0 && redoCount === 0) return;

    const x = 8, y = SB_HOTBAR_Y, w = 52, h = SB_BRUSH_BTN_H;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '10px Courier New';
    ctx.fillStyle = undoCount > 0 ? '#88AAFF' : '#444';
    ctx.fillText(`↩ ${undoCount}`, x + w / 2, y + h / 2 - 8);
    ctx.fillStyle = redoCount > 0 ? '#AAFFAA' : '#444';
    ctx.fillText(`↪ ${redoCount}`, x + w / 2, y + h / 2 + 8);

    ctx.fillStyle = 'rgba(130,130,150,0.65)';
    ctx.font = '7px Courier New'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('HISTORY', x + w / 2, y - 3);

    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  // ════════════════════════════════════════════════════════════
  // AUTO-PAINT STROKE  (Shift+drag, sandbox)
  // ════════════════════════════════════════════════════════════

  _strokeBegin() {
    this._strokeState = {
      gridBefore: new Map(),   // "r,c" → blockType before first touch
      overlayBefore: this._captureOverlay(),
    };
  }

  _strokeEnd() {
    if (!this._strokeState) return;
    const {gridBefore, overlayBefore} = this._strokeState;
    this._strokeState = null;
    const gridDeltas = [];
    for (const [key, before] of gridBefore) {
      const [r, c] = key.split(',').map(Number);
      const after = this.level.get(r, c);
      if (before !== after) gridDeltas.push({r, c, before, after});
    }
    const overlayAfter    = this._captureOverlay();
    const overlayChanged  = JSON.stringify(overlayBefore) !== JSON.stringify(overlayAfter);
    if (gridDeltas.length === 0 && !overlayChanged) return;
    this._historyStack.splice(this._historyPos + 1);
    this._historyStack.push({gridDeltas, overlayBefore, overlayAfter});
    if (this._historyStack.length > 200) this._historyStack.shift();
    this._historyPos = this._historyStack.length - 1;
  }

  // Paint/erase at (hoverRow, hoverCol) during a stroke — records before-values
  _autoPaintCell(hoverRow, hoverCol) {
    if (!this._strokeState) return;
    const sb = this.sandbox;
    if (!sb.isBrushApplicable) return; // eggs, dust, gates etc. not painted in stroke mode
    const sz = sb.brushSize, half = Math.floor(sz / 2);
    for (let dr = 0; dr < sz; dr++) {
      for (let dc = 0; dc < sz; dc++) {
        const r = hoverRow - half + dr, c = hoverCol - half + dc;
        if (r < 0 || r >= this.level.height || c < 0 || c >= this.level.width) continue;
        const key = `${r},${c}`;
        if (!this._strokeState.gridBefore.has(key)) this._strokeState.gridBefore.set(key, this.level.get(r, c));
      }
    }
    if (this._autoPaintMode === 'place')  this._sandboxBrushPlace(hoverRow, hoverCol, sb.selectedBlock);
    else                                   this._sandboxBrushRemove(hoverRow, hoverCol);
    this._autoPaintLastCell = {row: hoverRow, col: hoverCol};
  }

  // ════════════════════════════════════════════════════════════
  // COPY / PASTE REGION  (Ctrl+Drag to select, Ctrl+C, Ctrl+V)
  // ════════════════════════════════════════════════════════════

  _sbCopyRegion() {
    if (!this._copySelection) { this._notify('Select a region first (Ctrl+Drag)', '#FFAA44', 150); return; }
    const {r1, c1, r2, c2} = this._copySelection;
    const width = c2 - c1 + 1, height = r2 - r1 + 1;
    const blocks = [], rsComps = [], dust = [], gates = [], tx = [], rx = [], chests = [], eggs = [], items = [];
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const dr = r - r1, dc = c - c1;
        const key = `${c},${r}`;
        const type = this.level.get(r, c);
        if (type !== BLOCK.AIR) blocks.push({dr, dc, type});
        const rsComp = this.redstone.getAt(c, r);
        if (rsComp) rsComps.push({dr, dc, data: {...rsComp, links: []}});
        if (this._dustBlocks.has(key))   dust.push({dr, dc, data: {...this._dustBlocks.get(key)}});
        if (this._gateBlocks.has(key))   gates.push({dr, dc, data: {...this._gateBlocks.get(key)}});
        if (this._transmitters.has(key)) tx.push({dr, dc});
        if (this._receivers.has(key))    rx.push({dr, dc});
        const chest = this._chests.get(key);
        if (chest) chests.push({dr, dc, items: [...chest.items]});
      }
    }
    if (this.sandbox) {
      for (const e of this.sandbox.placedEggs) {
        const er = Math.floor(e.wy / BLOCK_SIZE), ec = Math.floor(e.wx / BLOCK_SIZE);
        if (er >= r1 && er <= r2 && ec >= c1 && ec <= c2) eggs.push({dr: er - r1, dc: ec - c1, mobType: e.mobType});
      }
      for (const it of this.sandbox.placedItems) {
        const ir = Math.floor(it.wy / BLOCK_SIZE), ic = Math.floor(it.wx / BLOCK_SIZE);
        if (ir >= r1 && ir <= r2 && ic >= c1 && ic <= c2) items.push({dr: ir - r1, dc: ic - c1, toolKey: it.toolKey});
      }
    }
    this._copyBuffer = {width, height, blocks, rsComps, dust, gates, tx, rx, chests, eggs, items};
    this._notify(`Copied ${width}×${height}  (${blocks.length} blocks)`, '#AAFFAA', 150);
  }

  _sbExecutePaste(anchorRow, anchorCol) {
    if (!this._copyBuffer) return;
    const buf = this._copyBuffer;
    // Capture history before modifying
    const gridBefore = new Map();
    for (let dr = 0; dr < buf.height; dr++) {
      for (let dc = 0; dc < buf.width; dc++) {
        const r = anchorRow + dr, c = anchorCol + dc;
        if (r >= 0 && r < this.level.height && c >= 0 && c < this.level.width) {
          const key = `${r},${c}`;
          if (!gridBefore.has(key)) gridBefore.set(key, this.level.get(r, c));
        }
      }
    }
    const overlayBefore = this._captureOverlay();
    // Place grid blocks (fill AIR only — non-destructive paste)
    for (const {dr, dc, type} of buf.blocks) {
      const r = anchorRow + dr, c = anchorCol + dc;
      if (r < 0 || r >= this.level.height || c < 0 || c >= this.level.width) continue;
      if (this.level.get(r, c) === BLOCK.AIR) this.level.set(r, c, type);
    }
    // Redstone components
    for (const {dr, dc, data} of buf.rsComps) {
      const r = anchorRow + dr, c = anchorCol + dc;
      if (r < 0 || r >= this.level.height || c < 0 || c >= this.level.width) continue;
      if (!this.redstone.getAt(c, r)) this.redstone.addComponent({...data, col: c, row: r, links: [], sandboxPlaced: true});
    }
    // Dust / gate overlays
    for (const {dr, dc, data} of buf.dust) {
      const r = anchorRow + dr, c = anchorCol + dc;
      if (r < 0 || r >= this.level.height || c < 0 || c >= this.level.width) continue;
      this._dustBlocks.set(`${c},${r}`, {...data, col: c, row: r, on: false, everTriggered: false});
    }
    if (buf.dust.length > 0) this._dustConnDirty = true;
    for (const {dr, dc, data} of buf.gates) {
      const r = anchorRow + dr, c = anchorCol + dc;
      if (r < 0 || r >= this.level.height || c < 0 || c >= this.level.width) continue;
      this._gateBlocks.set(`${c},${r}`, {...data, col: c, row: r, outputPowered: false, everTriggered: false});
    }
    if (buf.gates.length > 0) this._dustConnDirty = true;
    // TX / RX (fresh wiring — numbers auto-assigned)
    for (const {dr, dc} of buf.tx) {
      const r = anchorRow + dr, c = anchorCol + dc;
      if (r < 0 || r >= this.level.height || c < 0 || c >= this.level.width) continue;
      const num = this._txAssignNumber();
      if (num !== null) this._transmitters.set(`${c},${r}`, {col: c, row: r, number: num, powered: false});
    }
    for (const {dr, dc} of buf.rx) {
      const r = anchorRow + dr, c = anchorCol + dc;
      if (r < 0 || r >= this.level.height || c < 0 || c >= this.level.width) continue;
      this._receivers.set(`${c},${r}`, {col: c, row: r, listenTo: new Set(), powered: false});
    }
    // Chests
    for (const {dr, dc, items: cItems} of buf.chests) {
      const r = anchorRow + dr, c = anchorCol + dc;
      if (r < 0 || r >= this.level.height || c < 0 || c >= this.level.width) continue;
      const ck = `${c},${r}`;
      if (!this._chests.has(ck)) this._chests.set(ck, {col: c, row: r, items: [...cItems]});
    }
    // Eggs and items
    if (this.sandbox) {
      for (const {dr, dc, mobType} of buf.eggs) {
        const r = anchorRow + dr, c = anchorCol + dc;
        if (r < 0 || r >= this.level.height || c < 0 || c >= this.level.width) continue;
        this.sandbox.placedEggs.push({col: c, row: r, wx: c * BLOCK_SIZE + BLOCK_SIZE / 2, wy: r * BLOCK_SIZE + BLOCK_SIZE / 2, mobType, bobOffset: Math.random() * Math.PI * 2});
      }
      for (const {dr, dc, toolKey} of buf.items) {
        const r = anchorRow + dr, c = anchorCol + dc;
        if (r < 0 || r >= this.level.height || c < 0 || c >= this.level.width) continue;
        this.sandbox.placedItems.push({col: c, row: r, wx: c * BLOCK_SIZE + BLOCK_SIZE / 2, wy: r * BLOCK_SIZE + BLOCK_SIZE / 2, toolKey, vy: 0, bobOffset: Math.random() * Math.PI * 2});
      }
    }
    // Push to undo history
    const gridDeltas = [];
    for (const [key, before] of gridBefore) {
      const [r, c] = key.split(',').map(Number);
      const after = this.level.get(r, c);
      if (before !== after) gridDeltas.push({r, c, before, after});
    }
    const overlayAfter   = this._captureOverlay();
    const overlayChanged = JSON.stringify(overlayBefore) !== JSON.stringify(overlayAfter);
    if (gridDeltas.length > 0 || overlayChanged) {
      this._historyStack.splice(this._historyPos + 1);
      this._historyStack.push({gridDeltas, overlayBefore, overlayAfter});
      if (this._historyStack.length > 200) this._historyStack.shift();
      this._historyPos = this._historyStack.length - 1;
    }
    this._notify(`Pasted ${buf.width}×${buf.height}`, '#AAFFAA', 120);
  }

  // ── Copy-selection overlay (cyan dashed rect + dimensions) ───
  _drawCopySelection(ctx) {
    if (!this._copySelection) return;
    const {r1, c1, r2, c2} = this._copySelection;
    const sx = c1 * BLOCK_SIZE - this.camera.x, sy = r1 * BLOCK_SIZE - this.camera.y;
    const sw = (c2 - c1 + 1) * BLOCK_SIZE,       sh = (r2 - r1 + 1) * BLOCK_SIZE;
    ctx.save();
    ctx.fillStyle = 'rgba(0,255,255,0.07)';
    ctx.fillRect(sx, sy, sw, sh);
    ctx.strokeStyle = '#00FFFF'; ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 3]);
    ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);
    ctx.setLineDash([]);
    const label = `${c2 - c1 + 1}×${r2 - r1 + 1}`;
    ctx.font = 'bold 10px Courier New';
    const lw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(sx + sw / 2 - lw / 2 - 4, sy - 18, lw + 8, 14);
    ctx.fillStyle = '#00FFFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(label, sx + sw / 2, sy - 6);
    ctx.textAlign = 'left'; ctx.restore();
  }

  // ── Paste preview: ghost of copy buffer at cursor ──────────────
  _drawPastePreview(ctx, hoverRow, hoverCol) {
    if (!this._copyBuffer) return;
    const buf = this._copyBuffer;
    ctx.save();
    for (const {dr, dc, type} of buf.blocks) {
      const sx = (hoverCol + dc) * BLOCK_SIZE - this.camera.x;
      const sy = (hoverRow + dr) * BLOCK_SIZE - this.camera.y;
      ctx.globalAlpha = 0.42;
      drawBlock(ctx, type, sx, sy, 0);
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#88FF88';
      ctx.fillRect(sx, sy, BLOCK_SIZE, BLOCK_SIZE);
    }
    // Bounding outline
    const ox = hoverCol * BLOCK_SIZE - this.camera.x, oy = hoverRow * BLOCK_SIZE - this.camera.y;
    ctx.globalAlpha = 0.7; ctx.strokeStyle = '#88FF88'; ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 2]);
    ctx.strokeRect(ox, oy, buf.width * BLOCK_SIZE, buf.height * BLOCK_SIZE);
    ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.restore();
  }

  // ── Eyedropper: Alt+Click picks block into current hotbar slot ──
  _sandboxEyedropper(row, col) {
    const blockType = this.level.get(row, col);
    if (blockType === BLOCK.AIR) return;
    const entry = { kind: 'block', value: blockType };
    this.sandbox.sbHotbar[this.sandbox.sbHotbarSel] = entry;
    this.sandbox._applyHotbarEntry(entry);
    const name = BLOCK_DATA[blockType]?.name ?? 'Block';
    this._notify(`Picked: ${name}`, '#FFD700', 60);
  }

  // ── Brush placement: fill AIR cells in NxN area ──────────────
  _sandboxBrushPlace(anchorRow, anchorCol, blockType) {
    const sz   = this.sandbox.brushSize;
    const half = Math.floor(sz / 2);
    for (let dr = 0; dr < sz; dr++) {
      for (let dc = 0; dc < sz; dc++) {
        const r = anchorRow - half + dr;
        const c = anchorCol - half + dc;
        if (r < 0 || r >= this.level.height || c < 0 || c >= this.level.width) continue;
        if (this.level.get(r, c) !== BLOCK.AIR) continue;
        this.level.set(r, c, blockType);
      }
    }
  }

  // ── Brush removal: remove all non-AIR blocks in NxN area ─────
  _sandboxBrushRemove(anchorRow, anchorCol) {
    const sz   = this.sandbox.brushSize;
    const half = Math.floor(sz / 2);
    for (let dr = 0; dr < sz; dr++) {
      for (let dc = 0; dc < sz; dc++) {
        const r = anchorRow - half + dr;
        const c = anchorCol - half + dc;
        if (r < 0 || r >= this.level.height || c < 0 || c >= this.level.width) continue;
        const t = this.level.get(r, c);
        if (t === BLOCK.AIR) continue;
        this._sandboxRemoveBlock(r, c, t);
      }
    }
  }

  _sandboxRemoveBlock(row, col, blockType) {
    if (blockType === BLOCK.BED) {
      this._sandboxRemoveBed(row, col);
    } else if (blockType === BLOCK.OBSIDIAN && this._portalObsidianCells.has(`${col},${row}`)) {
      // Portal frame obsidian — cannot be removed individually
      this._notify('Portal frame — place obsidian in all gaps, then activate with Flint & Steel', '#AA77FF', 140);
      return;
    } else if (blockType === BLOCK.NETHER_PORTAL_FRAME || blockType === BLOCK.NETHER_PORTAL ||
               blockType === BLOCK.END_PORTAL || blockType === BLOCK.END_PORTAL_FRAME ||
               blockType === BLOCK.END_PORTAL_FRAME_FULL) {
      this._sandboxRemovePortal(row, col);
    } else {
      this.level.set(row, col, BLOCK.AIR);
      if (blockType === BLOCK.GOAL) {
        this.level.goalCol = -1;
        this.level.goalRow = -1;
      }
      if (blockType === BLOCK.LEVER || blockType === BLOCK.TRAPDOOR ||
          blockType === BLOCK.PRESSURE_PLATE || blockType === BLOCK.TNT ||
          blockType === BLOCK.PISTON_BODY) {
        this.redstone.removeAt(col, row);
      }
      if (blockType === BLOCK.CHEST) {
        this._dropChestItems(col, row);
        this._chests.delete(`${col},${row}`);
        if (this._chestOpen?.col === col && this._chestOpen?.row === row) {
          this._closeChest();
        }
      }
      if (blockType === BLOCK.TRANSMITTER) {
        const tx = this._transmitters.get(`${col},${row}`);
        if (tx) {
          // Deactivate any receivers that were solely powered by this transmitter
          for (const rx of this._receivers.values()) {
            if (rx.listenTo.has(tx.number)) {
              rx.listenTo.delete(tx.number);
              if (!this._isReceiverStillPowered(rx)) {
                rx.powered = false;
                this._rsStartFromReceiver(rx.col, rx.row, false);
              }
            }
          }
        }
        this._transmitters.delete(`${col},${row}`);
      }
      if (blockType === BLOCK.RECEIVER) {
        this._receivers.delete(`${col},${row}`);
      }
      // Remove any dust/gate overlay on this cell
      const _hadDustOrGate = this._dustBlocks.has(`${col},${row}`) || this._gateBlocks.has(`${col},${row}`);
      this._dustBlocks.delete(`${col},${row}`);
      this._gateBlocks.delete(`${col},${row}`);
      if (_hadDustOrGate) this._dustConnDirty = true;
    }
  }

  _sandboxRemoveBed(row, col) {
    this.level.set(row, col, BLOCK.AIR);
    if (this.level.get(row, col - 1) === BLOCK.BED) this.level.set(row, col - 1, BLOCK.AIR);
    if (this.level.get(row, col + 1) === BLOCK.BED) this.level.set(row, col + 1, BLOCK.AIR);
  }

  _sandboxRemovePortal(row, col) {
    // BFS flood-fill: remove all connected portal frame/interior cells
    const isPortalBlock = b =>
      b === BLOCK.NETHER_PORTAL_FRAME || b === BLOCK.NETHER_PORTAL ||
      b === BLOCK.END_PORTAL || b === BLOCK.END_PORTAL_FRAME || b === BLOCK.END_PORTAL_FRAME_FULL;

    const visited = new Set();
    const queue   = [[row, col]];
    while (queue.length && visited.size < 60) {
      const [r, c] = queue.shift();
      const key = r * 10000 + c;
      if (visited.has(key)) continue;
      if (!isPortalBlock(this.level.get(r, c))) continue;
      visited.add(key);
      queue.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]);
    }
    // Find affected anchors before clearing blocks
    const anchorKeys = new Set();
    for (const key of visited) {
      const r = Math.floor(key / 10000);
      const c = key % 10000;
      for (const [ak, anchor] of this._endPortalAnchors) {
        if (r === anchor.row && c >= anchor.col && c <= anchor.col + 4) anchorKeys.add(ak);
        if (r === anchor.row + 1 && c >= anchor.col && c <= anchor.col + 4) anchorKeys.add(ak);
      }
      this.level.set(r, c, BLOCK.AIR);
    }
    // Unregister removed anchors
    for (const ak of anchorKeys) this._endPortalAnchors.delete(ak);
  }

  // ── End Portal Eye placement ──────────────────────────────

  _tryPlaceEyeFromHotbar() {
    const slot = this.player.hotbar[this.player.selectedSlot];
    if (!slot || slot.type !== BLOCK.EYE_OF_ENDER) return;
    const pCol = Math.floor(this.player.cx / BLOCK_SIZE);
    const pRow = Math.floor(this.player.cy / BLOCK_SIZE);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const r = pRow + dr, c = pCol + dc;
        if (this.level.get(r, c) === BLOCK.END_PORTAL_FRAME) {
          this._tryPlaceEye(r, c);
          this.player.takeFromSlot(this.player.selectedSlot);
          return;
        }
      }
    }
  }

  _tryPlaceEye(row, col) {
    if (this.level.get(row, col) !== BLOCK.END_PORTAL_FRAME) return;
    // Find the anchor whose top frame row contains this cell
    for (const [key, anchor] of this._endPortalAnchors) {
      if (anchor.active) continue;
      if (row !== anchor.row) continue;
      if (col < anchor.col || col > anchor.col + 4) continue;
      // Place eye in this frame block
      this.level.set(row, col, BLOCK.END_PORTAL_FRAME_FULL);
      anchor.eyeCount++;
      if (anchor.eyeCount >= 5) {
        // All 5 eyes — activate portal: fill inner 3 cols across all 3 rows (9 blocks)
        for (let dr = 0; dr <= 2; dr++) {
          for (let dc = 1; dc <= 3; dc++) {
            this.level.set(anchor.row + dr, anchor.col + dc, BLOCK.END_PORTAL);
          }
        }
        anchor.active = true;
        this._notify('The End Portal activates! Press U inside to enter The End.', '#AA44FF', 360);
      } else {
        this._notify(`Eye of Ender placed! (${anchor.eyeCount}/5)`, '#AA44FF', 140);
      }
      return;
    }
    this._notify('No inactive portal frame here', '#888888', 80);
  }

  // ── Ender Dragon (Phase 11A-2) ────────────────────────────

  _loadDragonSprites() {
    const bodyFiles = [
      'images/dragon-frame-0-up.png',
      'images/dragon-frame-1-partial-up.png',
      'images/dragon-frame-2-neutral.png',
      'images/dragon-frame-3-partial-down.png',
      'images/dragon-frame-4-down.png',
    ];
    const headFiles = [
      'images/dragon-head-0-closed.png',
      'images/dragon-head-1-open.png',
    ];
    let loaded = 0;
    const total = bodyFiles.length + headFiles.length;
    const onLoad = () => { if (++loaded === total) this._dragonSpritesLoaded = true; };
    bodyFiles.forEach((src, i) => {
      const img = new Image();
      img.onload = img.onerror = onLoad;
      img.src = src;
      this._dragonBodySprites[i] = img;
    });
    headFiles.forEach((src, i) => {
      const img = new Image();
      img.onload = img.onerror = onLoad;
      img.src = src;
      this._dragonHeadSprites[i] = img;
    });
  }

  _spawnDragon() {
    const spawnCol = DRAGON_SPAWN_COL, spawnRow = DRAGON_SPAWN_ROW;
    // Require 12 blocks of unobstructed (non-solid) space above spawn point
    for (let dr = 1; dr <= 12; dr++) {
      const b = this.level.get(spawnRow - dr, spawnCol);
      if (BLOCK_DATA[b]?.solid) return;
    }
    this._dragon = {
      x:                 spawnCol * BLOCK_SIZE,
      y:                 spawnRow * BLOCK_SIZE,
      direction:         'left',
      hp:                100,
      animationFrame:    0,
      verticalDirection: 1,
      state:             'flying',
      isAlive:           true,
      _distTracker:      0,
    };
  }

  _updateDragon() {
    const d = this._dragon;
    if (!d || !d.isAlive) return;

    const LEFT_BOUND  = BIOME_END_START * BLOCK_SIZE;
    const RIGHT_BOUND = (BIOME_END_START + 149) * BLOCK_SIZE - DRAGON_BODY_W;
    const BOB_OFFSETS = [0.25, 0.125, 0, -0.125, -0.25];

    // Move horizontally
    if (d.direction === 'left') {
      d.x -= DRAGON_SPEED;
      if (d.x <= LEFT_BOUND) { d.x = LEFT_BOUND; d.direction = 'right'; }
    } else {
      d.x += DRAGON_SPEED;
      if (d.x >= RIGHT_BOUND) { d.x = RIGHT_BOUND; d.direction = 'left'; }
    }

    // Block-tick: advance animation + apply bobbing every BLOCK_SIZE pixels traveled
    d._distTracker += DRAGON_SPEED;
    while (d._distTracker >= BLOCK_SIZE) {
      d._distTracker -= BLOCK_SIZE;
      d.animationFrame += d.verticalDirection;
      if (d.animationFrame >= 4) { d.animationFrame = 4; d.verticalDirection = -1; }
      if (d.animationFrame <= 0) { d.animationFrame = 0; d.verticalDirection =  1; }
      d.y += BOB_OFFSETS[d.animationFrame] * BLOCK_SIZE;
    }

    // Clamp vertical position to flight range
    const minY = (DRAGON_SPAWN_ROW - 1) * BLOCK_SIZE;
    const maxY = (DRAGON_SPAWN_ROW + 1) * BLOCK_SIZE;
    d.y = Math.max(minY, Math.min(maxY, d.y));
  }

  _renderDragon(ctx) {
    const d = this._dragon;
    if (!d || !d.isAlive || !this._dragonSpritesLoaded) return;

    const sx = Math.floor(d.x - this.camera.x);
    const sy = Math.floor(d.y - this.camera.y);

    // Off-screen culling
    if (sx + DRAGON_BODY_W < -32 || sx > CANVAS_W + 32) return;

    // ── Body sprite ──────────────────────────────────────────
    const bodySprite = this._dragonBodySprites[d.animationFrame];
    if (bodySprite && bodySprite.complete && bodySprite.naturalWidth > 0) {
      ctx.save();
      if (d.direction === 'right') {
        ctx.translate(sx + DRAGON_BODY_W, sy);
        ctx.scale(-1, 1);
        ctx.drawImage(bodySprite, 0, 0, DRAGON_BODY_W, DRAGON_BODY_H);
      } else {
        ctx.drawImage(bodySprite, sx, sy, DRAGON_BODY_W, DRAGON_BODY_H);
      }
      ctx.restore();
    }

    // ── Head sprite ──────────────────────────────────────────
    const headSprite = this._dragonHeadSprites[0]; // closed mouth in Phase 11A-2
    if (!headSprite || !headSprite.complete || headSprite.naturalWidth === 0) return;

    // Compare player to dragon center so direction flips at the visual midpoint
    const playerIsToRight = (this.player.x > d.x + DRAGON_BODY_W / 2);
    let headWorldX, headRotation;

    if (playerIsToRight) {
      // Head faces RIGHT (sprite will be mirrored)
      headRotation = -DRAGON_HEAD_ROT;
      headWorldX = (d.direction === 'left')
        ? d.x - 30   // looking backward: offset for blank-space
        : d.x + DRAGON_BODY_W;       // looking forward: flush to body right edge
    } else {
      // Head faces LEFT (sprite drawn normally)
      headRotation = -DRAGON_HEAD_ROT;
      headWorldX = (d.direction === 'right')
        ? d.x + DRAGON_BODY_W - 30   // looking backward: offset for blank-space
        : d.x - DRAGON_HEAD_W;       // looking forward: flush to body left edge
    }

    const hsx = Math.floor(headWorldX - this.camera.x);
    const hsy = Math.floor(d.y + 28 - this.camera.y);

    ctx.save();
    if (playerIsToRight) {
      // Mirror: translate to right edge of where sprite will appear, flip, pivot 20px down
      ctx.translate(hsx + DRAGON_HEAD_W, hsy + 20);
      ctx.scale(-1, 1);
    } else {
      // Normal: pivot at left edge, 20px down
      ctx.translate(hsx, hsy + 20);
    }
    ctx.rotate(headRotation);
    ctx.drawImage(headSprite, 0, -20, DRAGON_HEAD_W, DRAGON_HEAD_H);
    ctx.restore();
  }

  // ── Ruined portal helpers ─────────────────────────────────

  // Frame obsidian positions relative to anchor (dr, dc)
  static get RP_FRAME_OFFSETS() { return [[0,3],[1,3],[2,0],[2,3],[3,0],[3,3]]; }
  static get RP_GAP_OFFSETS()   { return [[0,0],[0,1],[0,2],[1,0]]; }
  static get RP_INTERIOR_OFFSETS() { return [[1,1],[1,2],[2,1],[2,2],[3,1],[3,2]]; }

  _registerRuinedPortal(anchorRow, anchorCol) {
    const key = `${anchorRow},${anchorCol}`;
    this._ruinedPortals.set(key, { anchorRow, anchorCol, activated: false });
    for (const [dr, dc] of Game.RP_FRAME_OFFSETS) {
      this._portalObsidianCells.add(`${anchorCol + dc},${anchorRow + dr}`);
    }
  }

  _isRuinedPortalComplete(anchorRow, anchorCol) {
    return Game.RP_GAP_OFFSETS.every(([dr, dc]) =>
      this.level.get(anchorRow + dr, anchorCol + dc) === BLOCK.OBSIDIAN
    );
  }

  _activateRuinedPortal(anchorRow, anchorCol) {
    const key = `${anchorRow},${anchorCol}`;
    const portal = this._ruinedPortals.get(key);
    if (!portal || portal.activated) return false;
    portal.activated = true;
    for (const [dr, dc] of Game.RP_INTERIOR_OFFSETS) {
      this.level.set(anchorRow + dr, anchorCol + dc, BLOCK.NETHER_PORTAL);
    }
    // Gap obsidian (now filled) also becomes portal frame — non-solid
    for (const [dr, dc] of Game.RP_GAP_OFFSETS) {
      this._portalObsidianCells.add(`${anchorCol + dc},${anchorRow + dr}`);
    }
    return true;
  }

  _autoCompleteRuinedPortal(anchorRow, anchorCol) {
    // Fill all gap positions with obsidian and activate
    for (const [dr, dc] of Game.RP_GAP_OFFSETS) {
      this.level.set(anchorRow + dr, anchorCol + dc, BLOCK.OBSIDIAN);
    }
    this._activateRuinedPortal(anchorRow, anchorCol);
  }

  _restoreRuinedPortals(savedArray) {
    if (!Array.isArray(savedArray)) return;
    for (const rp of savedArray) {
      if (typeof rp.anchorRow !== 'number' || typeof rp.anchorCol !== 'number') continue;
      const { anchorRow, anchorCol, activated } = rp;
      const key = `${anchorRow},${anchorCol}`;
      this._ruinedPortals.set(key, { anchorRow, anchorCol, activated: !!activated });
      // Always mark frame obsidian as non-solid
      for (const [dr, dc] of Game.RP_FRAME_OFFSETS) {
        this._portalObsidianCells.add(`${anchorCol + dc},${anchorRow + dr}`);
      }
      // If activated, gap obsidian is also non-solid
      if (activated) {
        for (const [dr, dc] of Game.RP_GAP_OFFSETS) {
          this._portalObsidianCells.add(`${anchorCol + dc},${anchorRow + dr}`);
        }
      }
    }
  }

  _tryActivateRuinedPortal() {
    if (!this._ruinedPortals.size) return;
    const pRow = Math.floor(this.player.cy / BLOCK_SIZE);
    const pCol = Math.floor(this.player.cx / BLOCK_SIZE);
    for (const portal of this._ruinedPortals.values()) {
      if (portal.activated) continue;
      const { anchorRow, anchorCol } = portal;
      if (pRow >= anchorRow - 1 && pRow <= anchorRow + 5 &&
          pCol >= anchorCol - 1 && pCol <= anchorCol + 4) {
        if (!this.player.hasFlintSteel) {
          this._notify('You need Flint & Steel to activate this portal', '#FF9944', 160);
          return;
        }
        if (this._isRuinedPortalComplete(anchorRow, anchorCol)) {
          this._activateRuinedPortal(anchorRow, anchorCol);
          this._notify('Nether portal activated! Press U to enter.', '#AA00FF', 300);
          this.portalCooldown = 30;
        } else {
          this._notify('Portal incomplete — place obsidian in the 4 gap positions first', '#FF9944', 200);
        }
        return;
      }
    }
  }

  // ── HUD ──────────────────────────────────────────────────

  _drawHUD(ctx, hoverRow, hoverCol) {
    ctx.save();
    this._drawHealthBar(ctx);
    // XP bar and hotbar suppressed in sandbox (no XP gain, sandbox has its own hotbar)
    if (this.gameMode !== 'sandbox') {
      this._drawXpBar(ctx);
      this._drawHotbar(ctx);
      this._drawWeaponLabel(ctx);
    }
    if (this.player.hasShield)     this._drawShieldIndicator(ctx);
    if (this.player.hasFlintSteel) this._drawFlintSteelIndicator(ctx);
    this._drawBlockInfo(ctx, hoverRow, hoverCol);
    this._drawCoords(ctx);
    // Hyper speed badge (all modes)
    if (this.player.hyperSpeed) {
      const label = '⚡ HYPER SPEED';
      ctx.font = 'bold 10px Courier New';
      const lw = ctx.measureText(label).width;
      const bx = CANVAS_W / 2 - lw / 2 - 10, by = 35;
      ctx.fillStyle = 'rgba(255,200,0,0.22)';
      _roundRect(ctx, bx, by, lw + 20, 18, 4); ctx.fill();
      ctx.strokeStyle = '#FFDD44'; ctx.lineWidth = 1;
      _roundRect(ctx, bx, by, lw + 20, 18, 4); ctx.stroke();
      ctx.fillStyle = '#FFDD44'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, CANVAS_W / 2, by + 9);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();
  }

  _drawHealthBar(ctx) {
    const p   = this.player;
    const bw  = 180, bh = 14;
    const bx  = 10,  by = 10;

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    _roundRect(ctx, bx - 2, by - 2, bw + 48, bh + 4, 4);
    ctx.fill();

    // Red track
    ctx.fillStyle = '#550000';
    ctx.fillRect(bx, by, bw, bh);

    // Green fill (colour shifts with hp)
    const pct = p.hp / p.maxHp;
    ctx.fillStyle = pct > 0.6 ? '#22BB22' : pct > 0.3 ? '#BBBB00' : '#CC2222';
    ctx.fillRect(bx, by, Math.round(bw * pct), bh);

    // Segment ticks (one per 2 hp = 10 ticks for 20 hp)
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 1; i < p.maxHp / 2; i++) {
      ctx.fillRect(bx + Math.round(bw * (i / (p.maxHp / 2))), by, 1, bh);
    }

    // Border
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth   = 1;
    ctx.strokeRect(bx, by, bw, bh);

    // Heart icon + text
    ctx.fillStyle = '#FF5566';
    ctx.font      = '13px serif';
    ctx.fillText('♥', bx + bw + 6, by + 12);
    ctx.fillStyle = '#fff';
    ctx.font      = 'bold 10px Courier New';
    ctx.fillText(`${p.hp}/${p.maxHp}`, bx + bw + 22, by + 11);
  }

  _drawHotbar(ctx) {
    const p = this.player;
    for (let i = 0; i < 9; i++) {
      const sx     = HOTBAR_X + i * (SLOT_SIZE + SLOT_GAP);
      const sy     = HOTBAR_Y;
      const slot   = p.hotbar[i];
      const active = i === p.selectedSlot;

      ctx.fillStyle = active ? 'rgba(255,215,0,0.22)' : 'rgba(0,0,0,0.62)';
      ctx.fillRect(sx, sy, SLOT_SIZE, SLOT_SIZE);
      ctx.strokeStyle = active ? '#FFD700' : '#555';
      ctx.lineWidth   = active ? 2.5 : 1.5;
      ctx.strokeRect(sx + 0.5, sy + 0.5, SLOT_SIZE - 1, SLOT_SIZE - 1);

      // Tool slots 0-2: show tool icon even if hotbar slot is empty
      if (i === 0 || i === 1 || i === 2) {
        const toolKey  = i === 0 ? p.pickaxe : i === 1 ? p.sword : p.bow;
        const toolIcon = i === 0 ? '⛏' : i === 1 ? '⚔' : '🏹';
        const toolData = toolKey ? TOOL_DATA[toolKey] : null;
        if (toolData) {
          ctx.fillStyle    = toolData.color;
          ctx.font         = `${SLOT_SIZE * 0.52}px serif`;
          ctx.textAlign    = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(toolIcon, sx + SLOT_SIZE / 2, sy + SLOT_SIZE / 2);
          ctx.textAlign    = 'left';
          ctx.textBaseline = 'alphabetic';
          // Tier label (tiny, bottom right)
          if (i < 2) {
            ctx.fillStyle    = 'rgba(255,255,255,0.55)';
            ctx.font         = '7px Courier New';
            ctx.textAlign    = 'right';
            ctx.textBaseline = 'bottom';
            const tierNames  = ['W','S','I','D','N'];
            ctx.fillText(tierNames[toolData.tier] ?? '', sx + SLOT_SIZE - 3, sy + SLOT_SIZE - 2);
            ctx.textAlign    = 'left';
            ctx.textBaseline = 'alphabetic';
          }
        } else if (i === 2) {
          // Bow slot empty — show ghost icon
          ctx.fillStyle    = 'rgba(180,140,80,0.35)';
          ctx.font         = `${SLOT_SIZE * 0.52}px serif`;
          ctx.textAlign    = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('🏹', sx + SLOT_SIZE / 2, sy + SLOT_SIZE / 2);
          ctx.textAlign    = 'left';
          ctx.textBaseline = 'alphabetic';
          ctx.fillStyle    = 'rgba(200,180,100,0.5)';
          ctx.font         = '7px Courier New';
          ctx.textAlign    = 'center';
          ctx.fillText('craft', sx + SLOT_SIZE / 2, sy + SLOT_SIZE - 3);
          ctx.textAlign    = 'left';
        }
      } else if (i === 3) {
        // Apple slot (reserved slot 4) — show apple icon, greyed if none held
        const appleSlot = p.hotbar[3];
        const hasApple  = appleSlot && appleSlot.type === BLOCK.APPLE && appleSlot.count > 0;
        ctx.save();
        if (!hasApple) ctx.globalAlpha = 0.35;
        const pad   = 5;
        const scale = (SLOT_SIZE - pad * 2) / BLOCK_SIZE;
        ctx.translate(sx + pad, sy + pad);
        ctx.scale(scale, scale);
        drawBlock(ctx, BLOCK.APPLE, 0, 0, 0);
        ctx.restore();
        if (hasApple) {
          ctx.fillStyle    = '#fff';
          ctx.font         = 'bold 10px Courier New';
          ctx.textAlign    = 'right';
          ctx.textBaseline = 'bottom';
          ctx.fillText(appleSlot.count, sx + SLOT_SIZE - 3, sy + SLOT_SIZE - 2);
          ctx.textAlign    = 'left';
          ctx.textBaseline = 'alphabetic';
        } else {
          ctx.fillStyle    = 'rgba(200,180,100,0.5)';
          ctx.font         = '7px Courier New';
          ctx.textAlign    = 'center';
          ctx.textBaseline = 'alphabetic';
          ctx.fillText('none', sx + SLOT_SIZE / 2, sy + SLOT_SIZE - 3);
          ctx.textAlign    = 'left';
        }
      } else if (slot) {
        // Normal item slot
        const pad   = 5;
        const scale = (SLOT_SIZE - pad * 2) / BLOCK_SIZE;
        ctx.save();
        ctx.translate(sx + pad, sy + pad);
        ctx.scale(scale, scale);
        drawBlock(ctx, slot.type, 0, 0, 0);
        ctx.restore();

        ctx.fillStyle    = '#fff';
        ctx.font         = 'bold 10px Courier New';
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(slot.count, sx + SLOT_SIZE - 3, sy + SLOT_SIZE - 2);
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign    = 'left';
      }

      // Slot number
      ctx.fillStyle    = active ? '#FFD700' : 'rgba(255,255,255,0.35)';
      ctx.font         = '8px Courier New';
      ctx.textBaseline = 'top';
      ctx.fillText(i + 1, sx + 3, sy + 3);
      ctx.textBaseline = 'alphabetic';
    }
  }

  _drawWeaponLabel(ctx) {
    const p = this.player;
    let label, color;
    if (p.weaponMode === 'bow') {
      label = '🏹  Bow  [click/Space=shoot | E=craft]';
      color = '#C8A55A';
    } else if (p.weaponMode === 'pickaxe') {
      const data = TOOL_DATA[p.pickaxe];
      label = '⛏  ' + data.name + '  [click/Space=attack+mine | E=craft]';
      color = data.color;
    } else if (p.weaponMode === 'sword') {
      const data = TOOL_DATA[p.sword];
      label = '⚔  ' + data.name + '  [click/Space=attack | E=craft]';
      color = data.color;
    } else {
      // Item slot (3-8): show item name or nothing
      const item = p.selectedItem;
      if (!item) return;
      label = (BLOCK_DATA[item.type]?.name ?? '?') + '  [1-4=tools | U=use]';
      color = '#CCCCCC';
    }
    ctx.fillStyle    = color;
    ctx.font         = '11px Courier New';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, CANVAS_W / 2, HOTBAR_Y - 4);
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // ── Redstone dust overlay ─────────────────────────────────────

  // Returns true if a neighbour cell at (nc,nr) should draw a dust arm toward it.
  // facingDr/facingDc = direction the gate at (nc,nr) must face back toward this dust.
  _dustConnects(nc, nr, facingDr, facingDc) {
    if (this._dustBlocks.has(`${nc},${nr}`)) return true;
    const bt = this.level.get(nr, nc);
    if (bt === BLOCK.LEVER || bt === BLOCK.PRESSURE_PLATE ||
        bt === BLOCK.TRAPDOOR || bt === BLOCK.TNT ||
        bt === BLOCK.TRANSMITTER || bt === BLOCK.RECEIVER) return true;
    const g = this._gateBlocks.get(`${nc},${nr}`);
    if (g) {
      const GD = Game.GATE_DIRS;
      const match = s => s && GD[s][0] === facingDr && GD[s][1] === facingDc;
      if (match(g.inputSide) || match(g.outputSide)) return true;
    }
    return false;
  }

  // Rebuild the connection-topology cache for all dust blocks.
  // Called once whenever blocks change; much cheaper than per-frame recomputation.
  _rebuildDustConnCache() {
    this._dustConnCache.clear();
    for (const dust of this._dustBlocks.values()) {
      // Integer key: avoids string allocation on every cache lookup during render
      const key = dust.col * 10000 + dust.row;
      this._dustConnCache.set(key, {
        right: this._dustConnects(dust.col + 1, dust.row,      0, -1),
        left:  this._dustConnects(dust.col - 1, dust.row,      0,  1),
        down:  this._dustConnects(dust.col,     dust.row + 1, -1,  0),
        up:    this._dustConnects(dust.col,     dust.row - 1,  1,  0),
      });
    }
    this._dustConnDirty = false;
  }

  _drawDustOverlay(ctx) {
    // Rebuild connection topology only when blocks have changed (not every frame)
    if (this._dustConnDirty) this._rebuildDustConnCache();

    const isSandbox = this.gameMode === 'sandbox';
    for (const dust of this._dustBlocks.values()) {
      const sx = dust.col * BLOCK_SIZE - this.camera.x;
      const sy = dust.row * BLOCK_SIZE - this.camera.y;
      if (sx < -BLOCK_SIZE || sx > CANVAS_W + BLOCK_SIZE) continue;
      if (sy < -BLOCK_SIZE || sy > CANVAS_H + BLOCK_SIZE) continue;

      let alpha;
      const hidden = dust.setting === 'always_hide';
      if (isSandbox) {
        alpha = (!dust.everTriggered || hidden) ? 0.32 : 1.0;
      } else {
        if (!dust.everTriggered || hidden) continue;
        alpha = 1.0;
      }

      const conn = this._dustConnCache.get(dust.col * 10000 + dust.row)
                || { left: false, right: false, up: false, down: false };

      this._drawDustConnected(ctx, sx, sy, dust.on, alpha, conn);

      if (isSandbox && hidden) {
        ctx.save();
        ctx.fillStyle = 'rgba(255,80,80,0.8)';
        ctx.font = 'bold 7px Courier New';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText('H', sx + BLOCK_SIZE / 2, sy + BLOCK_SIZE / 2 + 5);
        ctx.restore();
      }
    }
  }

  // Draws a dust block as a centred node with arms toward connected neighbours.
  // No shadow blur — replaced by color-only distinction (much cheaper).
  _drawDustConnected(ctx, sx, sy, on, alpha, conn) {
    ctx.save();
    ctx.globalAlpha = alpha;
    // Powered: brighter red.  Unpowered: dark red.
    ctx.fillStyle = on ? '#FF4444' : '#550000';

    const s  = BLOCK_SIZE;
    const cx = sx + s / 2;
    const cy = sy + s / 2;
    const lw = 3;
    const hw = Math.floor(lw / 2);

    if (conn.left || conn.right || conn.up || conn.down) {
      if (conn.right) ctx.fillRect(cx,      cy - hw, s / 2, lw);
      if (conn.left)  ctx.fillRect(sx,      cy - hw, s / 2, lw);
      if (conn.down)  ctx.fillRect(cx - hw, cy,      lw, s / 2);
      if (conn.up)    ctx.fillRect(cx - hw, sy,      lw, s / 2);
      ctx.fillRect(cx - hw - 1, cy - hw - 1, lw + 2, lw + 2);
    } else {
      ctx.fillRect(cx - 3, cy - 1, 6, 2);
      ctx.fillRect(cx - 1, cy - 3, 2, 6);
    }
    ctx.restore();
  }

  // Simple cross used for placement-ghost preview only.
  _drawDustPattern(ctx, sx, sy, on, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = on ? '#FF4444' : '#550000';
    const cx = sx + BLOCK_SIZE / 2, cy = sy + BLOCK_SIZE / 2;
    ctx.fillRect(cx - 3, cy - 1, 6, 2);
    ctx.fillRect(cx - 1, cy - 3, 2, 6);
    ctx.restore();
  }

  // ── Dust settings popup (sandbox only) ───────────────────────

  _drawDustPopup(ctx) {
    if (!this._dustPopup) return;
    const dust = this._dustBlocks.get(`${this._dustPopup.col},${this._dustPopup.row}`);
    if (!dust) { this._dustPopup = null; return; }

    const pw = 224, ph = 164;
    const px = (CANVAS_W - pw) / 2, py = (CANVAS_H - ph) / 2;
    const mx = this.input.mouse.x, my = this.input.mouse.y;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    ctx.fillStyle = '#13131f';
    _roundRect(ctx, px, py, pw, ph, 8); ctx.fill();
    ctx.strokeStyle = '#CC2222'; ctx.lineWidth = 2;
    _roundRect(ctx, px, py, pw, ph, 8); ctx.stroke();

    // X close button
    const xbx = px + pw - 26, xby = py + 6;
    const xHov = mx >= xbx && mx <= xbx + 20 && my >= xby && my <= xby + 20;
    ctx.fillStyle = xHov ? 'rgba(255,80,80,0.3)' : 'rgba(0,0,0,0.4)';
    _roundRect(ctx, xbx, xby, 20, 20, 4); ctx.fill();
    ctx.strokeStyle = xHov ? '#FF5555' : '#554444'; ctx.lineWidth = 1;
    _roundRect(ctx, xbx, xby, 20, 20, 4); ctx.stroke();
    ctx.fillStyle = xHov ? '#fff' : '#AA7777';
    ctx.font = 'bold 12px Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('✕', xbx + 10, xby + 10);

    // Title
    ctx.fillStyle = '#FF4444';
    ctx.font = 'bold 12px Courier New';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('REDSTONE DUST', CANVAS_W / 2, py + 18);

    // Setting label
    ctx.fillStyle = '#888';
    ctx.font = '9px Courier New';
    ctx.fillText('Visibility setting:', CANVAS_W / 2, py + 44);

    // Button: Always Show
    const showX = px + 12, showY = py + 56, btnW = (pw - 28) / 2, btnH = 34;
    const showSel = dust.setting === 'always_show';
    const showHov = mx >= showX && mx <= showX + btnW && my >= showY && my <= showY + btnH;
    ctx.fillStyle = showSel ? 'rgba(200,30,30,0.35)' : (showHov ? 'rgba(200,30,30,0.15)' : 'rgba(0,0,0,0.5)');
    _roundRect(ctx, showX, showY, btnW, btnH, 5); ctx.fill();
    ctx.strokeStyle = showSel ? '#FF4444' : (showHov ? '#CC4444' : '#444'); ctx.lineWidth = showSel ? 2 : 1;
    _roundRect(ctx, showX, showY, btnW, btnH, 5); ctx.stroke();
    ctx.fillStyle = showSel ? '#FF8888' : '#888';
    ctx.font = showSel ? 'bold 9px Courier New' : '9px Courier New';
    ctx.fillText('Always Show', showX + btnW / 2, showY + 11);
    ctx.font = '7px Courier New';
    ctx.fillStyle = showSel ? '#FFAAAA' : '#555';
    ctx.fillText('visible once triggered', showX + btnW / 2, showY + 25);

    // Button: Always Hide
    const hideX = showX + btnW + 4, hideY = showY;
    const hideSel = dust.setting === 'always_hide';
    const hideHov = mx >= hideX && mx <= hideX + btnW && my >= hideY && my <= hideY + btnH;
    ctx.fillStyle = hideSel ? 'rgba(80,0,0,0.45)' : (hideHov ? 'rgba(80,0,0,0.2)' : 'rgba(0,0,0,0.5)');
    _roundRect(ctx, hideX, hideY, btnW, btnH, 5); ctx.fill();
    ctx.strokeStyle = hideSel ? '#882222' : (hideHov ? '#662222' : '#444'); ctx.lineWidth = hideSel ? 2 : 1;
    _roundRect(ctx, hideX, hideY, btnW, btnH, 5); ctx.stroke();
    ctx.fillStyle = hideSel ? '#CC6666' : '#888';
    ctx.font = hideSel ? 'bold 9px Courier New' : '9px Courier New';
    ctx.fillText('Always Hide', hideX + btnW / 2, hideY + 11);
    ctx.font = '7px Courier New';
    ctx.fillStyle = hideSel ? '#AA5555' : '#555';
    ctx.fillText('stays invisible', hideX + btnW / 2, hideY + 25);

    // Remove button
    const remY = py + 104;
    const remHov = mx >= px + 12 && mx <= px + pw - 12 && my >= remY && my <= remY + 32;
    ctx.fillStyle = remHov ? 'rgba(220,50,50,0.3)' : 'rgba(0,0,0,0.4)';
    _roundRect(ctx, px + 12, remY, pw - 24, 32, 5); ctx.fill();
    ctx.strokeStyle = remHov ? '#FF4444' : '#553333'; ctx.lineWidth = 1.5;
    _roundRect(ctx, px + 12, remY, pw - 24, 32, 5); ctx.stroke();
    ctx.fillStyle = remHov ? '#fff' : '#cc6666';
    ctx.font = '11px Courier New';
    ctx.fillText('✕  Remove Dust', CANVAS_W / 2, remY + 16);

    ctx.fillStyle = 'rgba(100,100,120,0.5)';
    ctx.font = '8px Courier New';
    ctx.fillText('Click outside to close', CANVAS_W / 2, py + ph - 6);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  _handleDustPopupInput() {
    if (!this._dustPopup) return;
    const dust = this._dustBlocks.get(`${this._dustPopup.col},${this._dustPopup.row}`);
    if (!dust) { this._dustPopup = null; return; }
    if (!this.input.mouse.clicked) return;

    const pw = 224, ph = 164;
    const px = (CANVAS_W - pw) / 2, py = (CANVAS_H - ph) / 2;
    const mx = this.input.mouse.x, my = this.input.mouse.y;

    // X close
    if (mx >= px + pw - 26 && mx <= px + pw - 6 && my >= py + 6 && my <= py + 26) {
      this._dustPopup = null; return;
    }
    // Outside → close
    if (mx < px || mx > px + pw || my < py || my > py + ph) {
      this._dustPopup = null; return;
    }
    // Always Show button
    const btnW = (pw - 28) / 2;
    if (mx >= px + 12 && mx <= px + 12 + btnW && my >= py + 56 && my <= py + 90) {
      dust.setting = 'always_show'; return;
    }
    // Always Hide button
    if (mx >= px + 12 + btnW + 4 && mx <= px + pw - 12 && my >= py + 56 && my <= py + 90) {
      dust.setting = 'always_hide'; return;
    }
    // Remove button
    if (mx >= px + 12 && mx <= px + pw - 12 && my >= py + 104 && my <= py + 136) {
      this._dustBlocks.delete(`${this._dustPopup.col},${this._dustPopup.row}`);
      this._dustPopup = null; return;
    }
  }

  _drawBiomeLabel(ctx, biome) {
    const labels = { plains: 'Plains', cave: 'Deep Cave', nether: 'The Nether', end: 'The End' };
    const colors = { plains: '#88CC44', cave: '#8888CC', nether: '#FF4400', end: '#AA44FF' };
    const text   = labels[biome] || biome;
    ctx.save();
    ctx.fillStyle    = 'rgba(0,0,0,0.4)';
    ctx.fillRect(CANVAS_W - 128, 10, 118, 20);
    ctx.fillStyle    = colors[biome] || '#fff';
    ctx.font         = 'bold 10px Courier New';
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, CANVAS_W - 10, 20);
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  _drawBowCharge(ctx) {
    const p = this.player;
    if (p.weaponMode !== 'bow' || !p.bowDrawing) return;
    const charge = p.drawProgress;
    const barW   = 100, barX = (CANVAS_W - barW) / 2;
    const barY   = HOTBAR_Y - 24;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    _roundRect(ctx, barX - 2, barY - 2, barW + 4, 12, 3);
    ctx.fill();
    const col = charge < 0.5 ? '#FF8800' : charge < 0.9 ? '#FFDD00' : '#88FF44';
    ctx.fillStyle = col;
    _roundRect(ctx, barX, barY, barW * charge, 8, 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font      = '8px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(charge * 100)}%`, CANVAS_W / 2, barY - 4);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  _drawEndPortalForeground(ctx) {
    const startCol = Math.max(0,                        Math.floor(this.camera.x / BLOCK_SIZE) - 1);
    const endCol   = Math.min(this.level.width  - 1,   Math.ceil((this.camera.x + CANVAS_W) / BLOCK_SIZE) + 1);
    const startRow = Math.max(0,                        Math.floor(this.camera.y / BLOCK_SIZE) - 1);
    const endRow   = Math.min(this.level.height - 1,   Math.ceil((this.camera.y + CANVAS_H) / BLOCK_SIZE) + 1);
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        if (this.level.get(r, c) === BLOCK.END_PORTAL) {
          drawBlock(ctx, BLOCK.END_PORTAL, c * BLOCK_SIZE - this.camera.x, r * BLOCK_SIZE - this.camera.y, 0);
        }
      }
    }
  }

  _drawCheckpoints(ctx) {
    // Draw golden glow around the active 2-block bed spawn
    const bed = this._activeBedSpawn();
    if (!bed) return;
    const sx = bed.col * BLOCK_SIZE - this.camera.x;
    const sy = bed.row * BLOCK_SIZE - this.camera.y;
    if (sx < -80 || sx > CANVAS_W + 80) return;
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.15 * Math.sin(this.frameCount * 0.06);
    ctx.fillStyle = '#FFD700';
    // Cover both blocks (2 × BLOCK_SIZE wide)
    ctx.fillRect(Math.floor(sx - 4), Math.floor(sy - 4), BLOCK_SIZE * 2 + 8, BLOCK_SIZE + 8);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _drawBlockInfo(ctx, hoverRow, hoverCol) {
    const hovBlock = this.level.get(hoverRow, hoverCol);
    const item     = this.player.selectedItem;

    let label = null;
    if (hovBlock !== BLOCK.AIR && hovBlock !== undefined) {
      label = BLOCK_DATA[hovBlock]?.name ?? '?';
      if (hovBlock === BLOCK.LEVER) {
        const comp = this.redstone.getAt(hoverCol, hoverRow);
        if (comp) label += ` [${comp.on ? 'ON' : 'OFF'}]`;
      } else if (hovBlock === BLOCK.TRAPDOOR) {
        const comp = this.redstone.getAt(hoverCol, hoverRow);
        if (comp) label += ` [${comp.open ? 'OPEN' : 'CLOSED'}]`;
      }
    } else if (hovBlock === BLOCK.AIR && item) {
      label = `Place ${BLOCK_DATA[item.type]?.name ?? '?'}`;
    }
    if (!label) return;

    const infoW = 190, infoX = (CANVAS_W - infoW) / 2, infoY = 30;
    ctx.fillStyle = 'rgba(0,0,0,0.58)';
    _roundRect(ctx, infoX, infoY, infoW, 24, 5);
    ctx.fill();
    ctx.fillStyle = '#eee';
    ctx.font      = '11px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(label, CANVAS_W / 2, infoY + 16);
    ctx.textAlign = 'left';

    const bp = this.level.getBreakProgress(hoverRow, hoverCol);
    if (bp > 0) {
      const barW = 130, barX = (CANVAS_W - barW) / 2, barY = infoY + 28;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      _roundRect(ctx, barX, barY, barW, 7, 3);
      ctx.fill();
      ctx.fillStyle = '#F5A623';
      _roundRect(ctx, barX, barY, barW * bp, 7, 3);
      ctx.fill();
    }
  }

  _drawFlintSteelIndicator(ctx) {
    const shieldOffset = this.player.hasShield ? 18 : 0;
    const px = 10, py = 52 + shieldOffset;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    _roundRect(ctx, px - 2, py - 2, 80, 16, 4); ctx.fill();
    ctx.fillStyle = '#CC8833';
    ctx.font = 'bold 10px Courier New';
    ctx.fillText('🔥 Flint & Steel', px + 2, py + 10);
  }

  _drawShieldIndicator(ctx) {
    const px = 10, py = 52;
    const active = this.player.crouching;
    ctx.fillStyle = active ? 'rgba(100,180,220,0.22)' : 'rgba(0,0,0,0.5)';
    _roundRect(ctx, px - 2, py - 2, 68, 16, 4);
    ctx.fill();
    ctx.fillStyle = active ? '#9CCCE0' : '#6B9DB8';
    ctx.font      = 'bold 10px Courier New';
    ctx.fillText(active ? '🛡 Blocking' : '🛡 Shield', px + 2, py + 10);
  }

  _drawXpBar(ctx) {
    const p      = this.player;
    const frac   = p.xp / p.maxXp;          // 0 → 1
    const lvl    = p.xpLevel;               // integer 0–5
    const maxed  = p.xp >= p.maxXp;
    const barW   = 120, barX = 10, barY = 30;

    // Track
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    _roundRect(ctx, barX, barY, barW, 13, 4);
    ctx.fill();

    // Fill — green, turns gold when maxed
    if (frac > 0) {
      ctx.fillStyle = maxed ? '#FFD700' : '#22CC44';
      _roundRect(ctx, barX, barY, Math.round(barW * frac), 13, 4);
      ctx.fill();
    }

    // Level segment dividers (one per XP level)
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    for (let i = 1; i < p.maxXp; i++) {
      ctx.fillRect(barX + Math.round(barW * i / p.maxXp), barY, 1, 13);
    }

    // Label
    ctx.fillStyle = maxed ? '#FFD700' : '#fff';
    ctx.font      = maxed ? 'bold 9px Courier New' : '9px Courier New';
    ctx.fillText(maxed ? 'XP MAX!' : `XP Lv.${lvl}`, barX + 4, barY + 10);

    // Speed hint when XP > 0
    if (p.xp > 0 && !maxed) {
      const mult = Math.round(p._xpMult * 10) / 10;
      ctx.fillStyle    = 'rgba(100,255,140,0.8)';
      ctx.font         = '8px Courier New';
      ctx.textAlign    = 'right';
      ctx.fillText(`${mult}× spd`, barX + barW - 2, barY + 10);
      ctx.textAlign    = 'left';
    }
  }

  _drawNotifications(ctx) {
    if (this.notifications.length === 0) return;
    ctx.save();
    ctx.font         = 'bold 11px Courier New';
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'top';
    let y = 58;
    for (let i = this.notifications.length - 1; i >= 0; i--) {
      const n     = this.notifications[i];
      const alpha = Math.min(1, n.life / 30);
      const tw    = ctx.measureText(n.text).width;
      ctx.globalAlpha = alpha;
      ctx.fillStyle   = 'rgba(0,0,0,0.6)';
      _roundRect(ctx, CANVAS_W - tw - 24, y - 2, tw + 18, 18, 4);
      ctx.fill();
      ctx.fillStyle = n.color;
      ctx.fillText(n.text, CANVAS_W - 8, y);
      y += 22;
    }
    ctx.globalAlpha  = 1;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  _drawGodModeBadge(ctx) {
    const label  = '⚡ GOD MODE';
    ctx.save();
    ctx.font         = 'bold 10px Courier New';
    ctx.textBaseline = 'middle';
    ctx.textAlign    = 'left';
    const tw   = ctx.measureText(label).width;
    const bx   = 8, by = 8, bw = tw + 16, bh = 20;
    const pulse = 0.65 + 0.35 * Math.sin(this.frameCount * 0.1);
    ctx.globalAlpha = pulse;
    ctx.fillStyle   = 'rgba(0,0,0,0.55)';
    _roundRect(ctx, bx, by, bw, bh, 4); ctx.fill();
    ctx.fillStyle   = '#FFD700';
    ctx.fillText(label, bx + 8, by + bh / 2);
    ctx.globalAlpha  = 1;
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  _teleportDests() {
    const dests = [
      { label: 'Spawn (Plains)',  x: 2 * BLOCK_SIZE,                                     y: 13 * BLOCK_SIZE - PLAYER_H },
      { label: 'Cave entrance',   x: 150 * BLOCK_SIZE,                                    y: 29 * BLOCK_SIZE - PLAYER_H },
      { label: 'Nether portal',   x: 329 * BLOCK_SIZE,                                    y: 32 * BLOCK_SIZE - PLAYER_H },
      { label: 'The End',         x: END_PORTAL_ARRIVAL_COL * BLOCK_SIZE - PLAYER_W / 2, y: END_PORTAL_ARRIVAL_ROW * BLOCK_SIZE - PLAYER_H },
    ];
    for (const [, anchor] of this._endPortalAnchors) {
      if (anchor.active) dests.push({
        label: `End Portal @ col ${anchor.col}`,
        x: (anchor.col + 2) * BLOCK_SIZE - PLAYER_W / 2,
        y: (anchor.row + 1) * BLOCK_SIZE - PLAYER_H,
      });
    }
    return dests;
  }

  _handleTeleportMenuClick(mx, my) {
    const pw = 340, btnH = 32, padV = 12;
    const dests = this._teleportDests();
    const ph = padV + 28 + dests.length * (btnH + 4) + padV;
    const px = (CANVAS_W - pw) / 2, py = (CANVAS_H - ph) / 2;

    // Click outside closes menu
    if (mx < px || mx > px + pw || my < py || my > py + ph) {
      this._teleportMenu = false; return;
    }
    for (let i = 0; i < dests.length; i++) {
      const by = py + padV + 28 + i * (btnH + 4);
      if (mx >= px + 10 && mx <= px + pw - 10 && my >= by && my <= by + btnH) {
        this.player.x = dests[i].x;
        this.player.y = dests[i].y;
        this.player.vx = 0; this.player.vy = 0;
        this._portalTransition = null;
        this._teleportMenu = false;
        this._notify(`Teleported to ${dests[i].label}`, '#FFD700', 180);
        this.camera.x = Math.max(0, Math.min(this.level.pixelWidth  - CANVAS_W, this.player.x - CANVAS_W / 2));
        this.camera.y = Math.max(0, Math.min(this.level.pixelHeight - CANVAS_H, this.player.y - CANVAS_H * 0.55));
        return;
      }
    }
  }

  _drawTeleportMenu(ctx) {
    const mx = this.input.mouse.x, my = this.input.mouse.y;
    const pw = 340, btnH = 32, padV = 12;
    const dests = this._teleportDests();
    const ph = padV + 28 + dests.length * (btnH + 4) + padV;
    const px = (CANVAS_W - pw) / 2, py = (CANVAS_H - ph) / 2;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#0d0d1a';
    _roundRect(ctx, px, py, pw, ph, 8); ctx.fill();
    ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2;
    _roundRect(ctx, px, py, pw, ph, 8); ctx.stroke();

    ctx.fillStyle = '#FFD700'; ctx.font = 'bold 12px Courier New';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('⚡ GOD MODE — TELEPORT  [T / Esc to close]', CANVAS_W / 2, py + padV + 10);

    for (let i = 0; i < dests.length; i++) {
      const by = py + padV + 28 + i * (btnH + 4);
      const hov = mx >= px + 10 && mx <= px + pw - 10 && my >= by && my <= by + btnH;
      ctx.fillStyle = hov ? 'rgba(255,215,0,0.15)' : 'rgba(0,0,0,0.4)';
      _roundRect(ctx, px + 10, by, pw - 20, btnH, 5); ctx.fill();
      ctx.strokeStyle = hov ? '#FFD700' : '#444'; ctx.lineWidth = hov ? 1.5 : 1;
      _roundRect(ctx, px + 10, by, pw - 20, btnH, 5); ctx.stroke();
      ctx.fillStyle = hov ? '#fff' : '#ccc'; ctx.font = '11px Courier New';
      ctx.fillText(dests[i].label, CANVAS_W / 2, by + btnH / 2);
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  _drawCoords(ctx) {
    const col = Math.floor(this.player.cx / BLOCK_SIZE);
    const row = Math.floor(this.player.cy / BLOCK_SIZE);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(CANVAS_W - 128, CANVAS_H - 26, 118, 20);
    ctx.fillStyle    = '#888';
    ctx.font         = '9px Courier New';
    ctx.textAlign    = 'right';
    ctx.fillText(`x:${col} y:${row}`, CANVAS_W - 10, CANVAS_H - 10);
    ctx.textAlign    = 'left';
  }

  // ── Overlays ─────────────────────────────────────────────

  _drawHelpScreen(ctx) {
    const isSB = this.gameMode === 'sandbox';
    const isNM = this.gameMode === 'normal';
    const px = 15, py = 12, pw = 770, ph = 476;
    const cx = px + pw / 2;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.90)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#0d0d1a';
    _roundRect(ctx, px, py, pw, ph, 10); ctx.fill();
    ctx.strokeStyle = '#FF9800'; ctx.lineWidth = 2;
    _roundRect(ctx, px, py, pw, ph, 10); ctx.stroke();

    const modeLabel = isSB ? 'SANDBOX' : isNM ? 'NORMAL' : 'PLATFORMER';
    ctx.fillStyle = '#FF9800'; ctx.font = 'bold 13px Courier New';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${modeLabel} MODE — KEYBOARD & MOUSE CONTROLS`, cx, py + 18);
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px + 12, py + 30); ctx.lineTo(px + pw - 12, py + 30); ctx.stroke();

    ctx.fillStyle = '#445'; ctx.font = '9px Courier New';
    ctx.fillText('Press ? or click anywhere to close', cx, py + ph - 10);

    // ── Section renderer ─────────────────────────────────────
    const KCOLOR = '#CCDDFF', DCOLOR = '#8899BB', HCOLOR = '#FF9800';
    const KW = 155, ROW = 13, HEAD = 17;
    const section = (title, rows, x, y) => {
      ctx.fillStyle = HCOLOR; ctx.font = 'bold 10px Courier New';
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(title, x, y);
      ctx.strokeStyle = '#FF980044'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y + 3); ctx.lineTo(x + 340, y + 3); ctx.stroke();
      y += HEAD;
      for (const [k, d] of rows) {
        ctx.fillStyle = KCOLOR; ctx.font = '9px Courier New';
        ctx.fillText(k, x, y);
        ctx.fillStyle = DCOLOR;
        ctx.fillText(d, x + KW, y);
        y += ROW;
      }
      return y + 6;
    };

    const colA = px + 14, colB = px + 14 + 388;
    let yA = py + 40, yB = py + 40;

    if (isSB) {
      yA = section('MOVEMENT', [
        ['W / ↑',        'Move up / Fly up'],
        ['A / ←',        'Move left'],
        ['S / ↓',        'Move down / Fly down'],
        ['D / →',        'Move right'],
        ['W×2',          'Start flying (double-tap)'],
        ['S×2',          'Land (double-tap while flying)'],
        ['H',            'Hyper Speed 3× toggle'],
      ], colA, yA);
      yA = section('HOTBAR & WORLD', [
        ['1 – 8',        'Select hotbar slot'],
        ['Scroll',       'Cycle hotbar slot'],
        ['Right-click slot', 'Clear hotbar slot'],
        ['I',            'Open block palette'],
        ['F',            'Save world'],
        ['E',            'Open / close nearby chest'],
        ['L',            'Toggle nearest lever'],
        ['Esc',          'Pause'],
        ['?',            'Toggle this help screen'],
      ], colA, yA);

      yB = section('EDITING', [
        ['Left Click (air)',    'Place selected block'],
        ['Left Click (block)',  'Remove block'],
        ['Alt+Click',          'Eyedropper — pick block type'],
        ['Shift+Click+Drag',   'Auto-paint (place or erase)'],
        ['Shift+1 / 2 / 3',   'Brush size: 1×1 / 2×2 / 4×4'],
        ['Shift+Scroll',       'Cycle brush size'],
        ['Ctrl+Drag',          'Select region'],
        ['Ctrl+C',             'Copy selected region'],
        ['Ctrl+V',             'Paste preview — click to place'],
        ['Ctrl+Z',             'Undo'],
        ['Ctrl+Y / Ctrl+⇧+Z', 'Redo'],
      ], colB, yB);

    } else if (isNM) {
      yA = section('MOVEMENT', [
        ['W / ↑',   'Jump'],
        ['A / ←',   'Move left'],
        ['S / ↓',   'Crouch'],
        ['D / →',   'Move right'],
      ], colA, yA);
      yA = section('COMBAT', [
        ['Space / Left Click',        'Attack (sword) or mine (pickaxe)'],
        ['Hold Space / Left Click',   'Charge bow — release to fire'],
        ['Click self (apple held)',   'Eat apple to restore HP'],
      ], colA, yA);

      yB = section('WORLD', [
        ['1 – 9',        'Select hotbar slot'],
        ['Scroll',       'Cycle hotbar slot'],
        ['I',            'Inventory / crafting'],
        ['E',            'Open / close nearby chest'],
        ['F near bed',   'Save game & set respawn point'],
        ['Hold Click',   'Mine block (pickaxe equipped)'],
        ['Click (air)',  'Place held block'],
        ['L',            'Toggle nearest lever'],
        ['U (portal)',   'Enter portal'],
        ['U (F&S held)', 'Activate ruined portal'],
        ['Esc',          'Pause'],
        ['?',            'Toggle this help screen'],
      ], colB, yB);

    } else {
      // Platformer
      yA = section('MOVEMENT', [
        ['W / ↑',   'Jump'],
        ['A / ←',   'Move left'],
        ['S / ↓',   'Crouch'],
        ['D / →',   'Move right'],
      ], colA, yA);
      yA = section('COMBAT', [
        ['Space / Left Click',       'Attack (sword) or mine (pickaxe)'],
        ['Hold Space / Left Click',  'Charge bow — release to fire'],
      ], colA, yA);

      yB = section('OTHER', [
        ['1 – 9',       'Select weapon slot'],
        ['Scroll',      'Cycle weapon slot'],
        ['F near bed',  'Set respawn point'],
        ['E',           'Open / close nearby chest'],
        ['U (portal)',  'Enter portal'],
        ['Esc',         'Pause'],
        ['?',           'Toggle this help screen'],
      ], colB, yB);
    }

    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  _drawDead(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.68)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const cx = CANVAS_W / 2, cy = CANVAS_H / 2;
    ctx.textAlign = 'center';

    // "YOU DIED" title
    ctx.fillStyle = '#CC2222';
    ctx.font = 'bold 40px Courier New';
    ctx.fillText('YOU DIED', cx, cy - 48);

    // Cause of death
    ctx.fillStyle = '#FFAAAA';
    ctx.font = '17px Courier New';
    ctx.fillText(this._deathCause || 'You died', cx, cy - 6);

    // Respawn button (shown after 3 s, countdown while waiting)
    const elapsed = Date.now() - this._deathTimestamp;
    const btn     = this._deadRespawnBtnRect();
    if (elapsed >= 3000) {
      ctx.fillStyle = '#2E7D32';
      _roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 8); ctx.fill();
      ctx.strokeStyle = '#66BB6A'; ctx.lineWidth = 2;
      _roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 8); ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 17px Courier New';
      ctx.fillText('Respawn', cx, btn.y + btn.h / 2 + 6);
    } else {
      const secs = Math.ceil((3000 - elapsed) / 1000);
      ctx.fillStyle = '#555';
      _roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 8); ctx.fill();
      ctx.fillStyle = '#888';
      ctx.font = '14px Courier New';
      ctx.fillText(`Respawn in ${secs}…`, cx, btn.y + btn.h / 2 + 5);
    }

    ctx.textAlign = 'left';
    ctx.restore();
  }

  _drawWin(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const isPlatformer = this.gameMode === 'platformer';
    const checkpoints  = isPlatformer ? this._platformerCheckpoints : [];
    const checkH       = checkpoints.length > 0 ? checkpoints.length * 18 + 14 : 0;
    const pw = 400, ph = 240 + checkH;
    const px = (CANVAS_W - pw) / 2, py = (CANVAS_H - ph) / 2;
    ctx.fillStyle = '#1A1A2A';
    _roundRect(ctx, px, py, pw, ph, 12); ctx.fill();
    ctx.strokeStyle = isPlatformer ? '#2196F3' : '#FFD700'; ctx.lineWidth = 3;
    _roundRect(ctx, px, py, pw, ph, 12); ctx.stroke();

    ctx.fillStyle = isPlatformer ? '#64B5F6' : '#FFD700';
    ctx.font      = 'bold 32px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('LEVEL COMPLETE!', CANVAS_W / 2, py + 62);

    if (isPlatformer && this._platformerFinishMs !== null) {
      // Show completion time
      const fmtMs = ms => {
        const totalSecs = Math.floor(ms / 1000);
        const mins = Math.floor(totalSecs / 60);
        const ss   = String(totalSecs % 60).padStart(2, '0');
        const cs   = String(Math.floor((ms % 1000) / 10)).padStart(2, '0');
        return `${mins}:${ss}.${cs}`;
      };
      ctx.fillStyle = '#FFD700'; ctx.font = 'bold 24px Courier New';
      ctx.fillText(fmtMs(this._platformerFinishMs), CANVAS_W / 2, py + 106);
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '10px Courier New';
      ctx.fillText('completion time', CANVAS_W / 2, py + 124);
      if (this._platformerLevelName) {
        ctx.fillStyle = '#aaa'; ctx.font = '11px Courier New';
        ctx.fillText(`${this._platformerLevelName}  ·  by ${this._platformerCreator}`,
          CANVAS_W / 2, py + 142);
      }
      // Checkpoint splits
      if (checkpoints.length > 0) {
        ctx.fillStyle = '#888'; ctx.font = '10px Courier New';
        ctx.fillText('— checkpoints —', CANVAS_W / 2, py + 162);
        checkpoints.forEach((cp, i) => {
          ctx.fillStyle = '#90CAF9';
          ctx.fillText(`CP ${i + 1}  ${fmtMs(cp.elapsedMs)}`, CANVAS_W / 2, py + 178 + i * 18);
        });
      }
    } else {
      ctx.fillStyle = '#aaa'; ctx.font = '14px Courier New';
      ctx.fillText(`Blocks mined: ${this.player.totalMined}`, CANVAS_W / 2, py + 100);
      const filled = this.player.hotbar.filter(Boolean);
      if (filled.length > 0) {
        ctx.fillStyle = '#888'; ctx.font = '11px Courier New';
        ctx.fillText(`Carrying ${filled.reduce((s, e) => s + e.count, 0)} blocks`,
          CANVAS_W / 2, py + 126);
      }
    }

    // God mode badge
    if (this._godModeUsed) {
      ctx.fillStyle = '#FFD700'; ctx.font = 'bold 10px Courier New';
      ctx.fillText('⚡ God Mode was used', CANVAS_W / 2, py + ph - 88);
    }

    ctx.fillStyle = '#6CDB6C'; ctx.font = '12px Courier New';
    ctx.fillText('Press R or Enter to restart', CANVAS_W / 2, py + ph - 68);
    ctx.fillStyle = '#7ec8e3'; ctx.font = '11px Courier New';
    ctx.fillText('Press M for Main Menu', CANVAS_W / 2, py + ph - 46);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  // ── Pause menu ───────────────────────────────────────────────

  _pauseLayout() {
    const isSb       = this.gameMode === 'sandbox';
    const hasLvlSel  = (this.gameMode === 'normal'      && !!this._sandboxLoadKey) ||
                       (this.gameMode === 'platformer'  && !!this._platformerLoadKey);
    const threeBtn   = isSb || hasLvlSel;
    const pw = 310, ph = threeBtn ? 268 : 210;
    const px = (CANVAS_W - pw) / 2, py = (CANVAS_H - ph) / 2;
    const bw = 250, bx = (CANVAS_W - bw) / 2;
    const layout = {
      px, py, pw, ph,
      resumeBtn: { x: bx, y: py + 88,              w: bw, h: 44, label: '▶  Resume'      },
      menuBtn:   { x: bx, y: py + (threeBtn ? 204 : 146), w: bw, h: 44, label: '⟵  Main Menu' },
    };
    if (isSb)      layout.saveBtn     = { x: bx, y: py + 146, w: bw, h: 44, label: '💾  Save World'   };
    if (hasLvlSel) layout.levelSelBtn = { x: bx, y: py + 146, w: bw, h: 44, label: '🗺  Level Select'  };
    return layout;
  }

  _confirmLayout() {
    const pw = 380, ph = 178, px = (CANVAS_W - pw) / 2, py = (CANVAS_H - ph) / 2;
    return {
      px, py, pw, ph,
      confirmBtn: { x: px + 28,       y: py + 112, w: 146, h: 42, label: 'Confirm' },
      cancelBtn:  { x: px + pw - 174, y: py + 112, w: 146, h: 42, label: 'Cancel'  },
    };
  }

  _updatePause() {
    if (!this.input.mouse.clicked) return;
    const mx  = this.input.mouse.x, my = this.input.mouse.y;
    const hit = (b) => mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h;

    if (this.state === 'paused') {
      const { px, py, pw, resumeBtn, menuBtn, saveBtn, levelSelBtn } = this._pauseLayout();
      // X button → resume
      if (mx >= px + pw - 28 && mx <= px + pw - 8 && my >= py + 8 && my <= py + 28) {
        this.state = 'playing'; return;
      }
      if (hit(resumeBtn)) this.state = 'playing';
      if (saveBtn    && hit(saveBtn))    { this.state = 'playing'; this._openSaveDialog(); }
      if (levelSelBtn && hit(levelSelBtn)) {
        if (this.gameMode === 'normal') this._saveNormalProgress();
        this.destroy();
        const returnState = this.gameMode === 'platformer' ? 'platformerSelect' : 'normalSelect';
        if (this._onReturnToMenu) this._onReturnToMenu(returnState);
        else location.reload();
        return;
      }
      if (hit(menuBtn)) this.state = 'confirmExit';
    } else if (this.state === 'confirmExit') {
      const { px, py, pw, confirmBtn, cancelBtn } = this._confirmLayout();
      // X button → back to pause
      if (mx >= px + pw - 28 && mx <= px + pw - 8 && my >= py + 8 && my <= py + 28) {
        this.state = 'paused'; return;
      }
      if (hit(confirmBtn)) {
        this._saveNormalProgress(); // save progress before leaving (no-op if not a sandbox world)
        this.destroy();
        if (this._onReturnToMenu) this._onReturnToMenu();
        else location.reload();
      }
      if (hit(cancelBtn)) this.state = 'paused';
    }
  }

  _drawPauseOverlay(ctx) {
    const mx  = this.input.mouse.x, my = this.input.mouse.y;
    const hit = (b) => mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    if (this.state === 'paused') {
      const { px, py, pw, ph, resumeBtn, menuBtn, saveBtn, levelSelBtn } = this._pauseLayout();

      ctx.fillStyle = '#13131f';
      _roundRect(ctx, px, py, pw, ph, 10); ctx.fill();
      ctx.strokeStyle = '#444466'; ctx.lineWidth = 2;
      _roundRect(ctx, px, py, pw, ph, 10); ctx.stroke();

      // X close button (resumes game)
      { const xbx = px + pw - 28, xby = py + 8;
        const xHov = mx >= xbx && mx <= xbx + 20 && my >= xby && my <= xby + 20;
        ctx.fillStyle = xHov ? 'rgba(255,80,80,0.3)' : 'rgba(0,0,0,0.4)';
        _roundRect(ctx, xbx, xby, 20, 20, 4); ctx.fill();
        ctx.strokeStyle = xHov ? '#FF5555' : '#554444'; ctx.lineWidth = 1;
        _roundRect(ctx, xbx, xby, 20, 20, 4); ctx.stroke();
        ctx.fillStyle = xHov ? '#fff' : '#AA7777';
        ctx.font = 'bold 12px Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('✕', xbx + 10, xby + 10); }

      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#7ec8e3';
      ctx.font      = 'bold 20px Courier New';
      ctx.fillText('⏸  PAUSED', CANVAS_W / 2, py + 34);

      // Mode badge
      const modeColors = { normal: '#4CAF50', sandbox: '#FF9800', platformer: '#2196F3' };
      const modeNames  = { normal: 'Normal Mode', sandbox: 'Sandbox Mode', platformer: 'Platformer Mode' };
      const mCol       = modeColors[this.gameMode] ?? '#888';
      ctx.fillStyle = `${mCol}33`;
      _roundRect(ctx, px + 60, py + 52, pw - 120, 20, 4); ctx.fill();
      ctx.strokeStyle = mCol; ctx.lineWidth = 1;
      _roundRect(ctx, px + 60, py + 52, pw - 120, 20, 4); ctx.stroke();
      ctx.fillStyle = mCol;
      ctx.font      = '10px Courier New';
      ctx.fillText(modeNames[this.gameMode] ?? this.gameMode, CANVAS_W / 2, py + 62);

      const allBtns = saveBtn     ? [resumeBtn, saveBtn,     menuBtn]
                    : levelSelBtn ? [resumeBtn, levelSelBtn, menuBtn]
                    :               [resumeBtn, menuBtn];
      for (const btn of allBtns) {
        const hov    = hit(btn);
        const isSave = btn === saveBtn;
        const isLvl  = btn === levelSelBtn;
        const accent = isSave ? '#4CAF50' : isLvl ? '#2196F3' : null;
        ctx.fillStyle   = hov ? (accent ? `${accent}33` : 'rgba(255,255,255,0.12)') : 'rgba(0,0,0,0.55)';
        _roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 6); ctx.fill();
        ctx.strokeStyle = hov ? (accent ?? '#fff') : (accent ? `${accent}66` : '#555');
        ctx.lineWidth   = 1.5;
        _roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 6); ctx.stroke();
        ctx.fillStyle = hov ? '#fff' : (accent ? `${accent}CC` : '#ccc');
        ctx.font      = 'bold 13px Courier New';
        ctx.fillText(btn.label, CANVAS_W / 2, btn.y + btn.h / 2);
      }

      ctx.fillStyle = 'rgba(110,110,130,0.55)';
      ctx.font      = '9px Courier New';
      const hint = saveBtn     ? '[Esc] to resume  •  [F] quick save'
                 : levelSelBtn ? '[Esc] to resume  •  [F] save at bed'
                 :               '[Esc] to resume';
      ctx.fillText(hint, CANVAS_W / 2, py + ph - 12);

    } else if (this.state === 'confirmExit') {
      const { px, py, pw, ph, confirmBtn, cancelBtn } = this._confirmLayout();

      ctx.fillStyle = '#13131f';
      _roundRect(ctx, px, py, pw, ph, 10); ctx.fill();
      ctx.strokeStyle = '#663333'; ctx.lineWidth = 2;
      _roundRect(ctx, px, py, pw, ph, 10); ctx.stroke();

      // X close button (cancels → back to pause)
      { const xbx = px + pw - 28, xby = py + 8;
        const xHov = mx >= xbx && mx <= xbx + 20 && my >= xby && my <= xby + 20;
        ctx.fillStyle = xHov ? 'rgba(255,80,80,0.3)' : 'rgba(0,0,0,0.4)';
        _roundRect(ctx, xbx, xby, 20, 20, 4); ctx.fill();
        ctx.strokeStyle = xHov ? '#FF5555' : '#554444'; ctx.lineWidth = 1;
        _roundRect(ctx, xbx, xby, 20, 20, 4); ctx.stroke();
        ctx.fillStyle = xHov ? '#fff' : '#AA7777';
        ctx.font = 'bold 12px Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('✕', xbx + 10, xby + 10); }

      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FF9966';
      ctx.font      = 'bold 17px Courier New';
      ctx.fillText('Return to Main Menu?', CANVAS_W / 2, py + 36);
      ctx.fillStyle = '#888899';
      ctx.font      = '11px Courier New';
      ctx.fillText('Any unsaved progress will be lost.', CANVAS_W / 2, py + 64);
      ctx.fillStyle = 'rgba(100,100,100,0.45)';
      ctx.font      = '9px Courier New';
      ctx.fillText('Any unsaved progress in Sandbox will be lost.', CANVAS_W / 2, py + 84);

      const btnDefs = [
        { ...confirmBtn, color: '#FF6644' },
        { ...cancelBtn,  color: '#4CAF50' },
      ];
      for (const btn of btnDefs) {
        const hov = hit(btn);
        ctx.fillStyle   = hov ? `${btn.color}55` : 'rgba(0,0,0,0.55)';
        _roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 6); ctx.fill();
        ctx.strokeStyle = hov ? btn.color : '#444';
        ctx.lineWidth   = 1.5;
        _roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 6); ctx.stroke();
        ctx.fillStyle = hov ? '#fff' : '#ccc';
        ctx.font      = 'bold 13px Courier New';
        ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2);
      }
    }

    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  // ── Sandbox save dialog ───────────────────────────────────────

  _openSaveDialog() {
    if (this._saveDialog) return;
    this._saveDialog = { fields: [this._sbPlayerName, this._sbWorldName], active: 0 };
    this._saveKbListener = (e) => {
      if (!this._saveDialog) return;
      e.preventDefault();
      const i      = this._saveDialog.active;
      const maxLen = i === 0 ? 16 : 24;
      if (e.key === 'Backspace') {
        this._saveDialog.fields[i] = this._saveDialog.fields[i].slice(0, -1);
      } else if (e.key === 'Tab') {
        this._saveDialog.active = 1 - this._saveDialog.active;
      } else if (e.key === 'Enter') {
        this._executeSave();
      } else if (e.key === 'Escape') {
        this._closeSaveDialog();
      } else if (e.key.length === 1 && this._saveDialog.fields[i].length < maxLen) {
        if (/^[\w\s\-'.!]$/.test(e.key)) this._saveDialog.fields[i] += e.key;
      }
    };
    document.addEventListener('keydown', this._saveKbListener);
  }

  _closeSaveDialog() {
    this._saveDialog = null;
    if (this._saveKbListener) {
      document.removeEventListener('keydown', this._saveKbListener);
      this._saveKbListener = null;
    }
  }

  _executeSave() {
    if (!this._saveDialog) return;
    const [pName, wName] = this._saveDialog.fields.map(s => s.trim());
    if (!pName || !wName) return;
    this._sbPlayerName = pName;
    this._sbWorldName  = wName;
    const result = SandboxSaves.save(pName, wName, this.level, this.sandbox, this.player, this.redstone, this._dustBlocks, this._gateBlocks, this._transmitters, this._receivers, this._chests, this._ruinedPortals, this._endPortalAnchors);
    if (result.ok) {
      this._historyStack = []; this._historyPos = -1; // clear history on successful save
      this._notify(`Saved: ${pName} — ${wName}`, '#44FF88', 300);
    } else {
      this._notify(`Save failed: ${result.error}`, '#FF4444', 360);
    }
    this._closeSaveDialog();
  }

  _updateSaveDialog() {
    if (!this._saveDialog || !this.input.mouse.clicked) return;
    const { px, py, pw } = this._saveDialogLayout();
    const mx = this.input.mouse.x, my = this.input.mouse.y;
    const fw = 300, fx = px + (pw - fw) / 2;

    // Click text fields to focus them
    if (mx >= fx && mx < fx + fw) {
      if (my >= py + 86 && my < py + 130)  { this._saveDialog.active = 0; return; }
      if (my >= py + 155 && my < py + 199) { this._saveDialog.active = 1; return; }
    }

    // Save button
    if (mx >= px + 24 && mx < px + 24 + 120 && my >= py + 220 && my < py + 220 + 40) {
      this._executeSave(); return;
    }
    // Cancel button
    if (mx >= px + pw - 144 && mx < px + pw - 24 && my >= py + 220 && my < py + 220 + 40) {
      this._closeSaveDialog(); return;
    }
  }

  _saveDialogLayout() {
    const pw = 380, ph = 280;
    return { px: (CANVAS_W - pw) / 2, py: (CANVAS_H - ph) / 2, pw, ph };
  }

  _drawSaveDialog(ctx) {
    if (!this._saveDialog) return;
    const { px, py, pw, ph } = this._saveDialogLayout();
    const mx = this.input.mouse.x, my = this.input.mouse.y;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Panel
    ctx.fillStyle = '#12121e';
    _roundRect(ctx, px, py, pw, ph, 10); ctx.fill();
    ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 2;
    _roundRect(ctx, px, py, pw, ph, 10); ctx.stroke();

    // Title
    ctx.fillStyle    = '#4CAF50';
    ctx.font         = 'bold 15px Courier New';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('💾  SAVE SANDBOX WORLD', CANVAS_W / 2, py + 26);

    const fw = 300, fx = px + (pw - fw) / 2;
    const labels   = ['Player Name', 'World Name'];
    const maxLens  = [16, 24];
    const fieldYs  = [py + 86, py + 155];

    for (let i = 0; i < 2; i++) {
      const fy  = fieldYs[i];
      const act = this._saveDialog.active === i;
      const val = this._saveDialog.fields[i];

      // Label
      ctx.fillStyle    = act ? '#7ec8e3' : '#666';
      ctx.font         = '10px Courier New';
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(labels[i] + `  (max ${maxLens[i]} chars)`, fx, fy - 6);

      // Input box
      ctx.fillStyle   = act ? 'rgba(20,40,60,0.95)' : 'rgba(8,8,18,0.85)';
      _roundRect(ctx, fx, fy, fw, 44, 5); ctx.fill();
      ctx.strokeStyle = act ? '#7ec8e3' : '#333';
      ctx.lineWidth   = act ? 2 : 1;
      _roundRect(ctx, fx, fy, fw, 44, 5); ctx.stroke();

      // Value + blinking cursor
      const cursor = act && Math.floor(this.frameCount / 28) % 2 === 0 ? '|' : '';
      ctx.fillStyle    = val ? '#fff' : '#333';
      ctx.font         = '13px Courier New';
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(val ? val + cursor : (act ? cursor : ''), fx + 12, fy + 22);
    }

    // Hints
    ctx.fillStyle    = 'rgba(100,100,120,0.6)';
    ctx.font         = '9px Courier New';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('[Tab] switch field  •  [Enter] save  •  [Esc] cancel', CANVAS_W / 2, py + 212);

    // Buttons
    const ready = this._saveDialog.fields[0].trim() && this._saveDialog.fields[1].trim();
    const btnDefs = [
      { x: px + 24, y: py + 220, w: 120, h: 40, label: 'Save World',
        color: ready ? '#4CAF50' : '#333', hov: ready && mx >= px + 24 && mx < px + 144 && my >= py + 220 && my < py + 260 },
      { x: px + pw - 144, y: py + 220, w: 120, h: 40, label: 'Cancel',
        color: '#555', hov: mx >= px + pw - 144 && mx < px + pw - 24 && my >= py + 220 && my < py + 260 },
    ];
    for (const b of btnDefs) {
      ctx.fillStyle   = b.hov ? `${b.color}44` : 'rgba(0,0,0,0.5)';
      _roundRect(ctx, b.x, b.y, b.w, b.h, 5); ctx.fill();
      ctx.strokeStyle = b.hov ? b.color : '#333'; ctx.lineWidth = 1.5;
      _roundRect(ctx, b.x, b.y, b.w, b.h, 5); ctx.stroke();
      ctx.fillStyle    = b.hov ? '#fff' : (b.color === '#333' ? '#444' : b.color);
      ctx.font         = 'bold 11px Courier New';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2);
    }

    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  // ── Sandbox load ──────────────────────────────────────────────

  _loadSandboxWorld(key) {
    const data = SandboxSaves.load(key);
    if (!data) {
      this._notify('Failed to load world!', '#FF4444', 300);
      return;
    }

    // Restore grid
    if (Array.isArray(data.grid)) {
      for (let r = 0; r < Math.min(data.grid.length, this.level.height); r++) {
        const row = data.grid[r];
        if (!Array.isArray(row)) continue;
        for (let c = 0; c < Math.min(row.length, this.level.width); c++) {
          this.level.grid[r][c] = typeof row[c] === 'number' ? row[c] : BLOCK.AIR;
        }
      }
    }

    // Restore spawn eggs
    if (Array.isArray(data.spawnEggs) && this.sandbox) {
      this.sandbox.placedEggs = data.spawnEggs
        .filter(e => e && typeof e.col === 'number' && typeof e.row === 'number')
        .map(e => ({
          col:     e.col,
          row:     e.row,
          wx:      e.col * BLOCK_SIZE + BLOCK_SIZE / 2,
          wy:      e.row * BLOCK_SIZE + BLOCK_SIZE / 2,
          mobType: e.mobType || 'zombie',
        }));
    }

    // Restore sandbox portal registry + links
    if (Array.isArray(data.portalLinks) && this.sandbox) {
      const labelMap = {};
      // First pass: create all portal entries with saved labels
      for (const pl of data.portalLinks) {
        if (typeof pl.anchorRow === 'number' && typeof pl.anchorCol === 'number' &&
            pl.label && pl.biome) {
          const entry = this.sandbox._restorePortal(pl.anchorRow, pl.anchorCol, pl.biome, pl.label, pl.ruined ?? false);
          labelMap[pl.label] = entry;
        }
      }
      // Second pass: wire up destId links
      for (const pl of data.portalLinks) {
        if (pl.destLabel && labelMap[pl.label] && labelMap[pl.destLabel]) {
          labelMap[pl.label].destId = labelMap[pl.destLabel].id;
        }
      }
    }

    // Restore placed item drops (weapons/tools)
    if (Array.isArray(data.placedItems) && this.sandbox) {
      this.sandbox.placedItems = data.placedItems
        .filter(it => it && typeof it.col === 'number' && typeof it.row === 'number' && it.toolKey)
        .map(it => ({
          col:       it.col,
          row:       it.row,
          wx:        it.col * BLOCK_SIZE + BLOCK_SIZE / 2,
          wy:        it.row * BLOCK_SIZE + BLOCK_SIZE / 2,
          toolKey:   it.toolKey,
          bobOffset: Math.random() * Math.PI * 2,
          vy:        0,
        }));
    }

    // Restore chests
    this._chests.clear();
    if (Array.isArray(data.chests)) {
      for (const ch of data.chests) {
        if (typeof ch.col === 'number' && typeof ch.row === 'number') {
          this._chests.set(`${ch.col},${ch.row}`, {
            col: ch.col, row: ch.row,
            items: Array.isArray(ch.items)
              ? ch.items.map(it => it || null).slice(0, 8).concat(Array(8).fill(null)).slice(0, 8)
              : Array(8).fill(null),
          });
        }
      }
    }
    // Ensure every CHEST block in the grid has an entry
    for (let r = 0; r < this.level.height; r++) {
      for (let c = 0; c < this.level.width; c++) {
        if (this.level.grid[r][c] === BLOCK.CHEST) {
          const ck = `${c},${r}`;
          if (!this._chests.has(ck))
            this._chests.set(ck, { col: c, row: r, items: Array(8).fill(null) });
        }
      }
    }

    // Scan grid for lever/trapdoor/pressure_plate and register in redstone
    for (let r = 0; r < this.level.height; r++) {
      for (let c = 0; c < this.level.width; c++) {
        const b = this.level.grid[r][c];
        if (b === BLOCK.LEVER && !this.redstone.getAt(c, r)) {
          this.redstone.addComponent({type: 'lever', col: c, row: r, on: false, links: [], sandboxPlaced: true});
        } else if (b === BLOCK.TRAPDOOR && !this.redstone.getAt(c, r)) {
          this.redstone.addComponent({type: 'trapdoor', col: c, row: r, open: false, links: [], sandboxPlaced: true});
        } else if (b === BLOCK.PRESSURE_PLATE && !this.redstone.getAt(c, r)) {
          this.redstone.addComponent({type: 'pressure_plate', col: c, row: r, on: false, links: [], sandboxPlaced: true});
        } else if (b === BLOCK.TNT && !this.redstone.getAt(c, r)) {
          this.redstone.addComponent({type: 'tnt', col: c, row: r, fuse: 0, links: [], sandboxPlaced: true});
        }
      }
    }

    // Override with saved lever/trapdoor states
    if (Array.isArray(data.sandboxLevers)) {
      for (const l of data.sandboxLevers) {
        const comp = this.redstone.getAt(l.col, l.row);
        if (comp && comp.type === 'lever') comp.on = !!l.on;
      }
    }
    if (Array.isArray(data.sandboxTrapdoors)) {
      for (const t of data.sandboxTrapdoors) {
        const comp = this.redstone.getAt(t.col, t.row);
        if (comp && comp.type === 'trapdoor') comp.open = !!t.open;
      }
    }
    if (Array.isArray(data.sandboxPistons)) {
      for (const p of data.sandboxPistons) {
        if (typeof p.col === 'number' && typeof p.row === 'number' && !this.redstone.getAt(p.col, p.row)) {
          this.redstone.addComponent({
            type: 'piston', col: p.col, row: p.row,
            dir: p.dir || 'right', inverted: !!p.inverted,
            extended: !!p.extended, sandboxPlaced: true,
          });
        }
      }
    }

    // Restore redstone dust overlay blocks
    this._dustBlocks.clear();
    if (Array.isArray(data.dustBlocks)) {
      for (const d of data.dustBlocks) {
        if (typeof d.col === 'number' && typeof d.row === 'number') {
          this._dustBlocks.set(`${d.col},${d.row}`, {
            col: d.col, row: d.row,
            on:            !!d.on,
            everTriggered: !!d.everTriggered,
            setting:       d.setting || 'always_show',
          });
        }
      }
    }
    // Restore gate overlay blocks
    this._dustConnDirty = true; // topology changed — rebuild on next draw
    this._gateBlocks.clear(); this._gateConfigPopup = null;
    if (Array.isArray(data.gateBlocks)) {
      for (const g of data.gateBlocks) {
        if (typeof g.col === 'number' && typeof g.row === 'number' && g.type) {
          this._gateBlocks.set(`${g.col},${g.row}`, {
            col: g.col, row: g.row, type: g.type,
            inputSide: g.inputSide || null, inputSide2: g.inputSide2 || null, outputSide: g.outputSide || null,
            outputPowered: !!g.outputPowered, everTriggered: !!g.everTriggered,
            setting: g.setting || 'always_show',
          });
        }
      }
    }
    // Restore transmitters and receivers
    this._transmitters.clear(); this._receivers.clear(); this._rxConfigPopup = null;
    if (Array.isArray(data.transmitters)) {
      for (const t of data.transmitters) {
        if (typeof t.col === 'number' && typeof t.number === 'number') {
          this._transmitters.set(`${t.col},${t.row}`, { col: t.col, row: t.row, number: t.number, powered: false });
        }
      }
    }
    if (Array.isArray(data.receivers)) {
      for (const r of data.receivers) {
        if (typeof r.col === 'number') {
          this._receivers.set(`${r.col},${r.row}`, { col: r.col, row: r.row, listenTo: new Set(r.listenTo || []), powered: false });
        }
      }
    }

    // Restore sandbox hotbar
    if (Array.isArray(data.sbHotbar) && this.sandbox) {
      for (let i = 0; i < this.sandbox.sbHotbar.length; i++) {
        const saved = data.sbHotbar[i];
        this.sandbox.sbHotbar[i] = (saved && saved.kind) ? { ...saved } : null;
      }
      const sel = typeof data.sbHotbarSel === 'number'
        ? Math.max(0, Math.min(7, data.sbHotbarSel)) : 0;
      this.sandbox.sbHotbarSel = sel;
      this.sandbox._applyHotbarEntry(this.sandbox.sbHotbar[sel]);
    }

    // Restore ruined portals
    this._ruinedPortals.clear();
    this._portalObsidianCells.clear();
    this._restoreRuinedPortals(data.ruinedPortals);

    // Restore End Portal anchors
    this._endPortalAnchors.clear();
    if (Array.isArray(data.endPortalAnchors)) {
      for (const a of data.endPortalAnchors) {
        this._endPortalAnchors.set(`${a.col},${a.row}`, {
          col: a.col, row: a.row, eyeCount: a.eyeCount ?? 0, active: !!a.active,
        });
      }
    }

    // Restore player position
    if (typeof data.playerPx === 'number') {
      this.player.x = data.playerPx;
      this.player.y = typeof data.playerPy === 'number' ? data.playerPy : this.player.y;
    }

    // Re-snap camera
    this.camera.x = Math.max(0, Math.min(this.level.pixelWidth  - CANVAS_W,
                             this.player.x - CANVAS_W / 2));
    this.camera.y = Math.max(0, Math.min(this.level.pixelHeight - CANVAS_H,
                             this.player.y - CANVAS_H * 0.55));
  }

  // ── Normal mode: play a Sandbox-created world ─────────────────

  _loadNormalWorld(key) {
    const data = SandboxSaves.load(key);
    if (!data) { this._notify('Failed to load world!', '#FF4444', 300); return; }

    // Load progress early so grid snapshot can be applied before redstone/chest setup
    const progress = !this._normalNewGame ? NormalProgress.load(key) : null;

    // Apply saved grid
    if (Array.isArray(data.grid)) {
      for (let r = 0; r < Math.min(data.grid.length, this.level.height); r++) {
        const row = data.grid[r];
        if (!Array.isArray(row)) continue;
        for (let c = 0; c < Math.min(row.length, this.level.width); c++) {
          this.level.grid[r][c] = typeof row[c] === 'number' ? row[c] : BLOCK.AIR;
        }
      }
    }

    // Overlay grid snapshot (blocks destroyed by TNT/creepers since last save)
    if (progress && Array.isArray(progress.gridSnapshot)) {
      for (let r = 0; r < Math.min(progress.gridSnapshot.length, this.level.height); r++) {
        const row = progress.gridSnapshot[r];
        if (!Array.isArray(row)) continue;
        for (let c = 0; c < Math.min(row.length, this.level.width); c++) {
          if (typeof row[c] === 'number') this.level.grid[r][c] = row[c];
        }
      }
      this._dustConnDirty = true;
    }

    // Convert spawn eggs → mob spawn points
    const EGG_TO_MOB = {
      zombie: 'Zombie', skeleton: 'Skeleton', creeper: 'Creeper',
      cave_spider: 'CaveSpider', piglin: 'Piglin', blaze: 'Blaze',
      wither_skeleton: 'WitherSkeleton',
    };
    if (Array.isArray(data.spawnEggs)) {
      const eggSpawns = data.spawnEggs
        .filter(e => e && typeof e.col === 'number' && typeof e.row === 'number' && EGG_TO_MOB[e.mobType])
        .map(e => ({ col: e.col, row: e.row, mobTypeName: EGG_TO_MOB[e.mobType], timer: 0, active: true }));
      // Merge with world's built-in spawn points
      this.mobManager.setupSpawnPoints([...this.mobManager.spawnPoints, ...eggSpawns]);
    }

    // Load portal links for in-game routing (no sandbox manager needed)
    if (Array.isArray(data.portalLinks)) {
      this._normalPortals = data.portalLinks
        .filter(p => p && typeof p.anchorRow === 'number' && typeof p.anchorCol === 'number')
        .map(p => ({
          anchorRow: p.anchorRow, anchorCol: p.anchorCol,
          biome:     p.biome,    label:     p.label,
          destLabel: p.destLabel ?? null,
        }));
    }

    // Placed tool/weapon/armor items → collectible world drops (same pipeline as platformer)
    this._platformerItems = (Array.isArray(data.placedItems) ? data.placedItems : [])
      .filter(it => it && typeof it.col === 'number' && typeof it.row === 'number'
                 && it.toolKey && (TOOL_DATA[it.toolKey] || ARMOR_DATA[it.toolKey]))
      .map(it => ({
        wx: it.col * BLOCK_SIZE + BLOCK_SIZE / 2,
        wy: it.row * BLOCK_SIZE + BLOCK_SIZE / 2,
        toolKey:   it.toolKey,
        collected: false,
        phase:     Math.random() * Math.PI * 2,
        vy:        0,
      }));

    // Restore chests
    this._chests.clear();
    if (Array.isArray(data.chests)) {
      for (const ch of data.chests) {
        if (typeof ch.col === 'number' && typeof ch.row === 'number') {
          this._chests.set(`${ch.col},${ch.row}`, {
            col: ch.col, row: ch.row,
            items: Array.isArray(ch.items)
              ? ch.items.map(it => it || null).slice(0, 8).concat(Array(8).fill(null)).slice(0, 8)
              : Array(8).fill(null),
          });
        }
      }
    }
    // Ensure every CHEST block in the grid has an entry (handles older saves / adventure world)
    for (let r = 0; r < this.level.height; r++) {
      for (let c = 0; c < this.level.width; c++) {
        if (this.level.grid[r][c] === BLOCK.CHEST) {
          const ck = `${c},${r}`;
          if (!this._chests.has(ck))
            this._chests.set(ck, { col: c, row: r, items: Array(8).fill(null) });
        }
      }
    }

    // Overlay saved chest contents from progress (tracks removed items between saves)
    if (progress && Array.isArray(progress.chests)) {
      for (const ch of progress.chests) {
        if (typeof ch.col !== 'number' || typeof ch.row !== 'number') continue;
        const key = `${ch.col},${ch.row}`;
        if (this._chests.has(key)) {
          this._chests.get(key).items = Array.isArray(ch.items)
            ? ch.items.map(it => it || null).slice(0, 8).concat(Array(8).fill(null)).slice(0, 8)
            : Array(8).fill(null);
        }
      }
    }

    // Register all interactive blocks (lever, trapdoor, pressure_plate) in redstone
    for (let r = 0; r < this.level.height; r++) {
      for (let c = 0; c < this.level.width; c++) {
        const b = this.level.grid[r][c];
        if (b === BLOCK.LEVER && !this.redstone.getAt(c, r)) {
          this.redstone.addComponent({type: 'lever', col: c, row: r, on: false, links: []});
        } else if (b === BLOCK.TRAPDOOR && !this.redstone.getAt(c, r)) {
          this.redstone.addComponent({type: 'trapdoor', col: c, row: r, open: false, links: []});
        } else if (b === BLOCK.PRESSURE_PLATE && !this.redstone.getAt(c, r)) {
          this.redstone.addComponent({type: 'pressure_plate', col: c, row: r, on: false, links: []});
        } else if (b === BLOCK.TNT && !this.redstone.getAt(c, r)) {
          this.redstone.addComponent({type: 'tnt', col: c, row: r, fuse: 0, links: []});
        }
      }
    }
    // Restore saved lever states and trapdoor open/close states
    if (Array.isArray(data.sandboxLevers)) {
      for (const l of data.sandboxLevers) {
        const comp = this.redstone.getAt(l.col, l.row);
        if (comp && comp.type === 'lever') comp.on = !!l.on;
      }
    }
    if (Array.isArray(data.sandboxTrapdoors)) {
      for (const t of data.sandboxTrapdoors) {
        const comp = this.redstone.getAt(t.col, t.row);
        if (comp && comp.type === 'trapdoor') comp.open = !!t.open;
      }
    }
    if (Array.isArray(data.sandboxPistons)) {
      for (const p of data.sandboxPistons) {
        if (typeof p.col === 'number' && typeof p.row === 'number' && !this.redstone.getAt(p.col, p.row)) {
          this.redstone.addComponent({
            type: 'piston', col: p.col, row: p.row,
            dir: p.dir || 'right', inverted: !!p.inverted,
            extended: !!p.extended, sandboxPlaced: true,
          });
        }
      }
    }

    // Restore dust/gate overlay blocks — everTriggered reset to false so circuits
    // are invisible until the player first activates them in this mode.
    this._dustBlocks.clear();
    if (Array.isArray(data.dustBlocks)) {
      for (const d of data.dustBlocks) {
        if (typeof d.col === 'number' && typeof d.row === 'number') {
          this._dustBlocks.set(`${d.col},${d.row}`, {
            col: d.col, row: d.row,
            on: !!d.on, everTriggered: false, setting: d.setting || 'always_show',
          });
        }
      }
    }
    this._dustConnDirty = true;
    this._gateBlocks.clear();
    if (Array.isArray(data.gateBlocks)) {
      for (const g of data.gateBlocks) {
        if (typeof g.col === 'number' && typeof g.row === 'number' && g.type) {
          this._gateBlocks.set(`${g.col},${g.row}`, {
            col: g.col, row: g.row, type: g.type,
            inputSide: g.inputSide||null, inputSide2: g.inputSide2||null, outputSide: g.outputSide||null,
            outputPowered: !!g.outputPowered, everTriggered: false,
            setting: g.setting || 'always_show',
          });
        }
      }
    }
    this._transmitters.clear(); this._receivers.clear();
    if (Array.isArray(data.transmitters)) {
      for (const t of data.transmitters) {
        if (typeof t.col === 'number' && typeof t.number === 'number') {
          this._transmitters.set(`${t.col},${t.row}`, { col: t.col, row: t.row, number: t.number, powered: false });
        }
      }
    }
    if (Array.isArray(data.receivers)) {
      for (const r of data.receivers) {
        if (typeof r.col === 'number') {
          this._receivers.set(`${r.col},${r.row}`, { col: r.col, row: r.row, listenTo: new Set(r.listenTo||[]), powered: false });
        }
      }
    }

    // Mark already-collected items so they don't reappear
    if (progress && Array.isArray(progress.collectedItems) && progress.collectedItems.length > 0) {
      const done = new Set(progress.collectedItems);
      for (const it of this._platformerItems) {
        const k = `${Math.floor(it.wx / BLOCK_SIZE)},${Math.floor(it.wy / BLOCK_SIZE)}`;
        if (done.has(k)) it.collected = true;
      }
    }

    // Restore player progress (if any saved and not starting fresh)
    if (this._normalNewGame) {
      // New Game: clear any existing checkpoint to ensure a fresh start
      NormalProgress.remove(key);
    } else {
      if (progress) {
        if (typeof progress.hp    === 'number') this.player.hp    = Math.max(1, progress.hp);
        if (typeof progress.xp    === 'number') this.player.xp    = progress.xp;
        if (typeof progress.level === 'number') this.player.level = progress.level;
        if (typeof progress.selectedSlot === 'number') this.player.selectedSlot = progress.selectedSlot;
        if (Array.isArray(progress.hotbar))    this.player.hotbar    = progress.hotbar.map(s => s || null);
        if (Array.isArray(progress.inventory)) this.player.inventory = progress.inventory.map(s => s || null);
        if (progress.equippedArmor && typeof progress.equippedArmor === 'object') {
          for (const slot of ['head', 'chest', 'legs', 'feet']) {
            const k = progress.equippedArmor[slot];
            if (k && ARMOR_DATA[k]) this.player.equippedArmor[slot] = k;
          }
        }
        if (progress.hasFlintSteel) this.player.hasFlintSteel = true;
        if (Array.isArray(progress.discoveredOres)) {
          for (const ore of progress.discoveredOres) this.player.discoveredOres.add(ore);
        }
        // Restore spawn position: prefer saved bed location, fall back to saved px/py
        if (typeof progress.bedCol === 'number' && typeof progress.bedRow === 'number') {
          this.player.x = (progress.bedCol + 0.5) * BLOCK_SIZE - this.player.width / 2;
          this.player.y = progress.bedRow * BLOCK_SIZE - this.player.height;
          // Re-register bed so death respawns here too
          let bedIdx = this.bedSpawns.findIndex(
            b => b.col === progress.bedCol && b.row === progress.bedRow
          );
          if (bedIdx < 0) bedIdx = this.bedSpawns.push(
            { col: progress.bedCol, row: progress.bedRow }
          ) - 1;
          this._activeSpawnBed = bedIdx;
        } else if (typeof progress.px === 'number') {
          this.player.x = progress.px;
          this.player.y = typeof progress.py === 'number' ? progress.py : this.player.y;
        }
      }
    }

    // Restore ruined portals
    this._ruinedPortals.clear();
    this._portalObsidianCells.clear();
    this._restoreRuinedPortals(data.ruinedPortals);

    // Restore End Portal anchors
    this._endPortalAnchors.clear();
    if (Array.isArray(data.endPortalAnchors)) {
      for (const a of data.endPortalAnchors) {
        this._endPortalAnchors.set(`${a.col},${a.row}`, {
          col: a.col, row: a.row, eyeCount: a.eyeCount ?? 0, active: !!a.active,
        });
      }
    }

    // Snap camera to player
    this.camera.x = Math.max(0, Math.min(this.level.pixelWidth  - CANVAS_W, this.player.x - CANVAS_W / 2));
    this.camera.y = Math.max(0, Math.min(this.level.pixelHeight - CANVAS_H, this.player.y - CANVAS_H * 0.55));
  }

  _saveNormalProgress() {
    if (!this._sandboxLoadKey) return;
    const bed           = this._activeBedSpawn();
    const collectedKeys = this._platformerItems
      .filter(it => it.collected)
      .map(it => `${Math.floor(it.wx / BLOCK_SIZE)},${Math.floor(it.wy / BLOCK_SIZE)}`);
    const result = NormalProgress.save(
      this._sandboxLoadKey, this.player, bed || null,
      this.level.grid, collectedKeys, this._chests
    );
    if (!result.ok) this._notify('Save failed: ' + result.error, '#FF4444', 200);
  }

  // ── Platformer mode: play a Sandbox-created world as a platformer level ──

  _loadPlatformerWorld(key) {
    const data = SandboxSaves.load(key);
    if (!data) { this._notify('Failed to load level!', '#FF4444', 300); return; }

    this._platformerLevelName = data.worldName  || 'Unknown Level';
    this._platformerCreator   = data.playerName || 'Unknown';

    // Apply the saved grid
    if (Array.isArray(data.grid)) {
      for (let r = 0; r < data.grid.length; r++) {
        const row = data.grid[r];
        if (!Array.isArray(row)) continue;
        for (let c = 0; c < row.length; c++) {
          this.level.set(r, c, row[c]);
        }
      }
    }

    // Convert spawn eggs to mob spawn points
    const EGG_TO_MOB = {
      zombie: 'Zombie', skeleton: 'Skeleton', creeper: 'Creeper',
      cave_spider: 'CaveSpider', piglin: 'Piglin', blaze: 'Blaze',
      wither_skeleton: 'WitherSkeleton',
    };
    if (Array.isArray(data.spawnEggs)) {
      const eggSpawns = data.spawnEggs
        .filter(e => e && typeof e.col === 'number' && typeof e.row === 'number' && EGG_TO_MOB[e.mobType])
        .map(e => ({ col: e.col, row: e.row, mobTypeName: EGG_TO_MOB[e.mobType], timer: 0, active: true }));
      this.mobManager.setupSpawnPoints([...this.mobManager.spawnPoints, ...eggSpawns]);
    }

    // Placed tool/weapon items → collectible pickups
    this._platformerItems = (Array.isArray(data.placedItems) ? data.placedItems : [])
      .filter(it => it && typeof it.col === 'number' && typeof it.row === 'number' && it.toolKey && (TOOL_DATA[it.toolKey] || ARMOR_DATA[it.toolKey]))
      .map(it => ({
        wx:        it.col * BLOCK_SIZE + BLOCK_SIZE / 2,
        wy:        it.row * BLOCK_SIZE + BLOCK_SIZE / 2,
        toolKey:   it.toolKey,
        collected: false,
        phase:     Math.random() * Math.PI * 2,
        vy:        0,
      }));

    // Portal links for routing
    if (Array.isArray(data.portalLinks)) {
      this._normalPortals = data.portalLinks.map(p => ({
        anchorRow: p.anchorRow, anchorCol: p.anchorCol,
        biome:     p.biome,    label:     p.label,
        destLabel: p.destLabel ?? null,
      }));
    }

    // Register interactive blocks in redstone so they work in platformer mode
    for (let r = 0; r < this.level.height; r++) {
      for (let c = 0; c < this.level.width; c++) {
        const b = this.level.grid[r][c];
        if (b === BLOCK.LEVER && !this.redstone.getAt(c, r)) {
          this.redstone.addComponent({type: 'lever', col: c, row: r, on: false, links: []});
        } else if (b === BLOCK.TRAPDOOR && !this.redstone.getAt(c, r)) {
          this.redstone.addComponent({type: 'trapdoor', col: c, row: r, open: false, links: []});
        } else if (b === BLOCK.PRESSURE_PLATE && !this.redstone.getAt(c, r)) {
          this.redstone.addComponent({type: 'pressure_plate', col: c, row: r, on: false, links: []});
        } else if (b === BLOCK.TNT && !this.redstone.getAt(c, r)) {
          this.redstone.addComponent({type: 'tnt', col: c, row: r, fuse: 0, links: []});
        }
      }
    }
    if (Array.isArray(data.sandboxLevers)) {
      for (const l of data.sandboxLevers) {
        const comp = this.redstone.getAt(l.col, l.row);
        if (comp && comp.type === 'lever') comp.on = !!l.on;
      }
    }
    if (Array.isArray(data.sandboxTrapdoors)) {
      for (const t of data.sandboxTrapdoors) {
        const comp = this.redstone.getAt(t.col, t.row);
        if (comp && comp.type === 'trapdoor') comp.open = !!t.open;
      }
    }
    if (Array.isArray(data.sandboxPistons)) {
      for (const p of data.sandboxPistons) {
        if (typeof p.col === 'number' && typeof p.row === 'number' && !this.redstone.getAt(p.col, p.row)) {
          this.redstone.addComponent({
            type: 'piston', col: p.col, row: p.row,
            dir: p.dir || 'right', inverted: !!p.inverted,
            extended: !!p.extended, sandboxPlaced: true,
          });
        }
      }
    }

    // Restore chests from save data, then scan grid for any missed CHEST blocks
    this._chests.clear();
    if (Array.isArray(data.chests)) {
      for (const ch of data.chests) {
        if (typeof ch.col === 'number' && typeof ch.row === 'number') {
          this._chests.set(`${ch.col},${ch.row}`, {
            col: ch.col, row: ch.row,
            items: Array.isArray(ch.items)
              ? ch.items.map(it => it || null).slice(0, 8).concat(Array(8).fill(null)).slice(0, 8)
              : Array(8).fill(null),
          });
        }
      }
    }
    for (let r = 0; r < this.level.height; r++) {
      for (let c = 0; c < this.level.width; c++) {
        if (this.level.grid[r][c] === BLOCK.CHEST) {
          const ck = `${c},${r}`;
          if (!this._chests.has(ck))
            this._chests.set(ck, { col: c, row: r, items: Array(8).fill(null) });
        }
      }
    }

    // Restore dust/gate overlay blocks — everTriggered reset so circuits start hidden.
    this._dustBlocks.clear();
    if (Array.isArray(data.dustBlocks)) {
      for (const d of data.dustBlocks) {
        if (typeof d.col === 'number' && typeof d.row === 'number') {
          this._dustBlocks.set(`${d.col},${d.row}`, {
            col: d.col, row: d.row,
            on: !!d.on, everTriggered: false, setting: d.setting || 'always_show',
          });
        }
      }
    }
    this._dustConnDirty = true;
    this._gateBlocks.clear();
    if (Array.isArray(data.gateBlocks)) {
      for (const g of data.gateBlocks) {
        if (typeof g.col === 'number' && typeof g.row === 'number' && g.type) {
          this._gateBlocks.set(`${g.col},${g.row}`, {
            col: g.col, row: g.row, type: g.type,
            inputSide: g.inputSide||null, inputSide2: g.inputSide2||null, outputSide: g.outputSide||null,
            outputPowered: !!g.outputPowered, everTriggered: false,
            setting: g.setting || 'always_show',
          });
        }
      }
    }
    this._transmitters.clear(); this._receivers.clear();
    if (Array.isArray(data.transmitters)) {
      for (const t of data.transmitters) {
        if (typeof t.col === 'number' && typeof t.number === 'number') {
          this._transmitters.set(`${t.col},${t.row}`, { col: t.col, row: t.row, number: t.number, powered: false });
        }
      }
    }
    if (Array.isArray(data.receivers)) {
      for (const r of data.receivers) {
        if (typeof r.col === 'number') {
          this._receivers.set(`${r.col},${r.row}`, { col: r.col, row: r.row, listenTo: new Set(r.listenTo||[]), powered: false });
        }
      }
    }

    // Restore ruined portals
    this._ruinedPortals.clear();
    this._portalObsidianCells.clear();
    this._restoreRuinedPortals(data.ruinedPortals);

    // Restore End Portal anchors
    this._endPortalAnchors.clear();
    if (Array.isArray(data.endPortalAnchors)) {
      for (const a of data.endPortalAnchors) {
        this._endPortalAnchors.set(`${a.col},${a.row}`, {
          col: a.col, row: a.row, eyeCount: a.eyeCount ?? 0, active: !!a.active,
        });
      }
    }

    // Snap camera to player
    this.camera.x = Math.max(0, Math.min(this.level.pixelWidth  - CANVAS_W, this.player.x - CANVAS_W / 2));
    this.camera.y = Math.max(0, Math.min(this.level.pixelHeight - CANVAS_H, this.player.y - CANVAS_H * 0.55));
  }

  _collectPlatformerItem(item) {
    item.collected = true;
    const armorData = ARMOR_DATA[item.toolKey];
    if (armorData) {
      this.player.addArmorItem(item.toolKey);
      this._notify(`Picked up ${armorData.name}!`, armorData.color, 200);
      return;
    }
    const data = TOOL_DATA[item.toolKey];
    if (!data) return;
    if (data.type === 'pickaxe') {
      const cur = TOOL_DATA[this.player.pickaxe];
      if (!cur || data.tier > cur.tier) {
        this.player.pickaxe = item.toolKey;
        this._notify(`Picked up ${data.name}!`, data.color, 200);
      }
    } else if (data.type === 'sword') {
      const cur = TOOL_DATA[this.player.sword];
      if (!cur || data.tier > cur.tier) {
        this.player.sword = item.toolKey;
        this._notify(`Picked up ${data.name}!`, data.color, 200);
      }
    } else if (data.type === 'bow') {
      this.player.bow = item.toolKey;
      this._notify('Picked up Bow!', data.color, 200);
    } else if (data.type === 'shield') {
      this.player.hasShield = true;
      this._notify('Picked up Shield!', data.color, 200);
    } else if (data.type === 'flint_steel') {
      this.player.hasFlintSteel = true;
      this._notify('Picked up Flint & Steel!', data.color, 200);
    }
  }

  _drawPlatformerItems(ctx) {
    const icons = { pickaxe: '⛏', sword: '⚔', bow: '🏹', shield: '🛡', flint_steel: '🔥' };
    const armorIcons = { head: '⛑', chest: '🛡', legs: 'L', feet: '👟' };
    for (const it of this._platformerItems) {
      if (it.collected) continue;
      const sx = it.wx - this.camera.x;
      const sy = it.wy - this.camera.y + Math.sin(this.frameCount * 0.07 + it.phase) * 4;
      if (sx < -40 || sx > CANVAS_W + 40 || sy < -40 || sy > CANVAS_H + 40) continue;
      const armorData = ARMOR_DATA[it.toolKey];
      const data = TOOL_DATA[it.toolKey] || armorData;
      if (!data) continue;
      const sym = armorData ? (armorIcons[armorData.piece] ?? '🛡') : (icons[data.type] ?? '?');
      // Glow halo
      ctx.save();
      ctx.shadowColor = data.color;
      ctx.shadowBlur  = 12;
      ctx.font         = '20px serif';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(sym, sx, sy);
      ctx.shadowBlur   = 0;
      ctx.restore();
    }
  }

  _drawPlatformerHUD(ctx) {
    ctx.save();

    // ── Mode badge (top-left) ──────────────────────────────
    const modeLabel = '▶ PLATFORMER';
    ctx.font         = 'bold 10px Courier New';
    ctx.textBaseline = 'middle';
    ctx.textAlign    = 'left';
    const mlw = ctx.measureText(modeLabel).width;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    _roundRect(ctx, 8, 8, mlw + 16, 20, 4); ctx.fill();
    ctx.fillStyle = '#2196F3';
    ctx.fillText(modeLabel, 16, 18);

    // ── Level name + creator (below mode badge) ────────────
    if (this._platformerLevelName) {
      const nameStr = `${this._platformerLevelName}  ·  by ${this._platformerCreator}`;
      ctx.font      = '9px Courier New';
      const nw      = ctx.measureText(nameStr).width;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      _roundRect(ctx, 8, 32, nw + 14, 16, 3); ctx.fill();
      ctx.fillStyle = 'rgba(180,210,255,0.85)';
      ctx.fillText(nameStr, 15, 40);
    }

    // ── Live timer (top-right, beside notifications) ────────
    if (this._platformerStartMs && this.state === 'playing') {
      const elapsed  = Date.now() - this._platformerStartMs;
      const totalSec = Math.floor(elapsed / 1000);
      const mins     = Math.floor(totalSec / 60);
      const ss       = String(totalSec % 60).padStart(2, '0');
      const cs       = String(Math.floor((elapsed % 1000) / 10)).padStart(2, '0');
      const timeStr  = `${mins}:${ss}.${cs}`;
      ctx.font       = 'bold 11px Courier New';
      ctx.textAlign  = 'right';
      const tw       = ctx.measureText(timeStr).width;
      ctx.fillStyle  = 'rgba(0,0,0,0.5)';
      _roundRect(ctx, CANVAS_W - tw - 22, 8, tw + 16, 20, 4); ctx.fill();
      ctx.fillStyle  = '#FFD700';
      ctx.fillText(timeStr, CANVAS_W - 8, 18);
    }

    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  _drawGameOver_UNUSED(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const pw = 400, ph = 210;
    const px = (CANVAS_W - pw) / 2, py = (CANVAS_H - ph) / 2;
    ctx.fillStyle = '#1A0000';
    _roundRect(ctx, px, py, pw, ph, 12); ctx.fill();
    ctx.strokeStyle = '#CC2222'; ctx.lineWidth = 3;
    _roundRect(ctx, px, py, pw, ph, 12); ctx.stroke();

    ctx.fillStyle = '#FF3333';
    ctx.font      = 'bold 34px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('YOU DIED', CANVAS_W / 2, py + 65);

    ctx.fillStyle = '#AA4444'; ctx.font = '13px Courier New';
    ctx.fillText('Eliminated by the mobs of Level 1', CANVAS_W / 2, py + 100);

    ctx.fillStyle = '#888'; ctx.font = '12px Courier New';
    ctx.fillText(`Blocks mined: ${this.player.totalMined}`, CANVAS_W / 2, py + 128);

    ctx.fillStyle = '#FF9966'; ctx.font = '12px Courier New';
    ctx.fillText('Press R or Enter to try again', CANVAS_W / 2, py + 165);
    ctx.textAlign = 'left';
    ctx.restore();
  }
}

// ── Utility ──────────────────────────────────────────────────

function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y,     x + w, y + r,     r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x,     y + h, x,     y + h - r, r);
  ctx.lineTo(x,     y + r);
  ctx.arcTo(x,     y,     x + r, y,         r);
  ctx.closePath();
}

// Boot is handled by menu.js → MenuSystem → new Game(mode, options, callback)
