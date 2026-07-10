// ============================================================
// game.js — Main game loop, rendering orchestration, HUD
// ============================================================

// ── Phase 13: Particle system ────────────────────────────────
class Particle {
  constructor(x, y, vx, vy, color, life, size) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.color = color; this.life = life; this.maxLife = life;
    this.size = size || 4;
  }
  update() {
    this.x += this.vx; this.y += this.vy;
    this.vy += 0.15; this.vx *= 0.96;
    this.life--;
    return this.life > 0;
  }
  draw(ctx, camera) {
    const sx = Math.floor(this.x - camera.x);
    const sy = Math.floor(this.y - camera.y);
    if (sx < -20 || sx > CANVAS_W + 20 || sy < -20 || sy > CANVAS_H + 20) return;
    ctx.save();
    ctx.globalAlpha = this.life / this.maxLife;
    ctx.fillStyle = this.color;
    const sz = Math.max(1, this.size * (this.life / this.maxLife));
    ctx.fillRect(sx - sz / 2, sy - sz / 2, sz, sz);
    ctx.restore();
  }
}

const SLOT_SIZE = 46;
const SLOT_GAP  = 3;
const HOTBAR_Y  = CANVAS_H - SLOT_SIZE - 10;
const HOTBAR_X  = (CANVAS_W - (9 * SLOT_SIZE + 8 * SLOT_GAP)) / 2;

// Returns the menu state the player should land on after exiting a game.
// Online games always return to the online lobby; local normal/platformer games
// return to their level-select screen; everything else goes to the main menu.
function _localMenuState(game) {
  if (game._onlineGameId) return 'online';
  if (game.gameMode === 'platformer')   return 'platformerSelect';
  if (game.gameMode === 'normal')       return 'normalSelect';
  if (game.gameMode === 'speedrunner')  return 'speedrunnerSelect';
  return undefined;
}

class Game {
  constructor(mode = 'normal', options = {}, onReturnToMenu = null) {
    this.canvas          = document.getElementById('gameCanvas');
    this.ctx             = this.canvas.getContext('2d');
    // The game view (title + canvas + controls) is hidden at boot via
    // body.pre-game so the empty canvas box doesn't flash before the dashboard
    // appears. A game is starting now → reveal it and recompute the canvas
    // display size (resizeCanvas keyed off the resize event; the internal
    // 800×500 resolution is unaffected by visibility).
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.remove('pre-game');
      // Menu-only retro FX (posterize/scanlines/etc.) pause while a match runs.
      document.body.classList.add('in-game');
      window.dispatchEvent(new Event('resize'));
    }
    this.input           = new InputManager(this.canvas);
    this.gameMode        = mode;          // 'normal' | 'sandbox' | 'platformer' | 'speedrunner'
    this._onReturnToMenu = onReturnToMenu;
    this._testMode       = !!(options && options.testMode); // Universal Test World — no persistence
    this._zoomOverride   = null; // Z-key manual zoom (sandbox/God): null = prescribed default
    this._zoomOverrideIdx = -1;  // -1 = default; 0..3 = 100/200/300/400%
    this._deathParts     = [];   // body-part scatter on death (all modes; Phase 3A.3)
    this._running        = true;

    // Must be initialized before _buildLevel() which reads twoPlayerMode (Phase 12)
    this._worldAdvSettings = {
      disableDragonHealing:      false,
      dayCycleMinutes:           DAY_CYCLE_DEFAULT_MINUTES,
      nightSpawnBoost:           true,
      nightSpawnRate:            2,      // ×spawn rate at night when boost on (configurable)
      fullMoonHpBoost:           true,
      fullMoonHpAmount:          1.5,    // mob HP × on full-moon nights (configurable)
      unlimitedArrows:           false,
      controllerSensitivity:     1.0,
      controllerAimSensitivity:  1.0,
      twoPlayerMode:             options.twoPlayerMode ?? false,
      // Platformer scoring (campaign-prep) — all default off / classic behaviour.
      platformerEmeralds:        false,   // placed emeralds are collectible + counted
      platformerScore:           false,   // track a running score
      emeraldPoints:             100,     // score per emerald
      goalClearPoints:           1000,    // score for reaching a Goal Star
      disableXpSpeedBoost:       false,
      musicVolume:               DEFAULT_MUSIC_VOLUME,
      sfxVolume:                 DEFAULT_SFX_VOLUME,
      // Phase 16 — Multiplayer boss scaling
      bossHealthMultiplier:      1.0,
      bossDamageMultiplier:      1.0,
      bossAttackRateMultiplier:  1.0,
      chatDisabled:              false,
      showOnlineHealthBars:      true,
      compactHotbar:             false,    // Phase 3A.3 — use the small hotbar in all modes
      // Phase 16-E — Controller
      controllerDeadzone:        GP_DEADZONE_STICK,
      // Phase 17 — Speed Runner world settings
      srBaseSpeed:               1.0,
      srMaxMultiplier:           2.0,
      srBoostPct:                0.05,
      srAccel:                   0.5,    // acceleration per frame (px/frame) — race-car ramp to max
      srDecel:                   2,      // release deceleration, × the accel rate (tunable in pause)
      srTimeBoostEnabled:        true,
      srTimeBoostIntervalSec:    5,
      srDistBoostEnabled:        true,
      srDistBoostIntervalBlocks: 5,
      srMinZoomSpeed:            1.0,   // speed (effectiveMult) at which zoom starts; -1 = disabled
      srMaxZoomSpeed:            null,  // speed at which max zoom is reached; null = srMaxMultiplier
      // Phase 17-D — Physics (per-world)
      physicsGravity:            GRAVITY,   // 0.66
      jumpPadVForce:             -18,       // launch velocity for JUMP_PAD blocks
      // Phase 1 Refinement — per-world movement config
      jumpHeightBlocks:          null,      // null = use default JUMP_VELOCITY; else apex in blocks
      airJumpEnabled:            false,     // allow one mid-air (double) jump
      sprintEnabled:             true,      // Shift = 2× ground speed
      autoStepUp:                false,     // walk/run up 1-block ledges without jumping (universal, per-world)
      // Optional movement moves (all per-world, default off)
      wallSlideEnabled:          false,     // slow slide down a wall when pressing into it mid-air
      wallJumpLockAway:          false,     // wall jump forces an arc away, no steering until land/wall/ledge
      ledgeHangEnabled:          false,     // grab & hang from block edges (climb up / drop / climb down)
      slideEnabled:              false,     // jump + down → ground slide
      slideInvincible:           false,     // invincible during the slide
      slideDurationFrames:       30,        // slide length (frames)
      slideSpeedMult:            1.6,       // horizontal speed multiplier while sliding
      // Phase 3A.3 — universal per-world "prescribed" zoom (all modes). The
      // sandbox/God-mode Z key cycles 100/200/300/400% then back to this default.
      worldZoom:                 1.0,       // 0.5–2.0 base view zoom
      // Tier 1 — per-world background theme. 'auto' = position-driven (sky/cave
      // by depth, nether/end by column, as always). Any other value forces that
      // backdrop everywhere (VISUAL ONLY — gameplay biome regions are unchanged).
      backgroundTheme:           'auto',    // 'auto' | 'sky' | 'cave' | 'nether' | 'end'
      // Phase 3A.2 — per-world arena config
      arenaPlayerMaxHealth:      20,        // hp (2–40); UI shows hearts = hp/2
      arenaZoomMode:             'NONE',    // 'NONE' | 'PRESET' | 'DYNAMIC'
      arenaPresetZoom:           1.0,       // 0.3–1.5 (PRESET mode)
      redstoneSpeed:             1.0,       // 0.5–2.0 cadence multiplier (coarse)
      // Phase 3A.3 — arena world config (flat keys, consistent with the above)
      arenaViewType:             'single',  // 'single' (fixed camera) | 'scrolling' (camera follows)
      arenaMobHealth:            'MEDIUM',  // 'EASY' | 'MEDIUM' | 'HARD' — default mob-HP preset
      arenaRespawnTime:          2,         // seconds (0–10) — arena respawn delay
      arenaEnabledTypes:         ['MOB_HUNTER', 'COLLECT_EMERALDS', 'KING_OF_HILL', 'SURVIVAL_WAVES', 'DEATHMATCH', 'CAPTURE_FLAG', 'DEFEND_TOWER'],
      // Sandbox designer locks: when true, the in-play pause menu greys these
      // sections ("Locked in World Settings") so players can't override the
      // designer's tuning. Toggled from the Sandbox World Settings panel.
      physicsLocked:             false,
      bossScalingLocked:         false,
    };
    // Phase 3B — player-model refactor. `players[]` is the backing store for
    // 1-4 local players. `player`/`player2` are live accessors over slots 0/1
    // so the ~200 existing call sites keep working unchanged during the
    // incremental migration; new N-player logic uses players[]/getPlayer()/
    // activePlayers(). Slots may hold null (a dead/absent player) — always
    // iterate via activePlayers() (filters null) rather than players directly.
    this.players = [];
    Object.defineProperty(this, 'player', {
      get() { return this.players[0] || null; },
      set(v) { this.players[0] = v || null; },
      configurable: true,
    });
    Object.defineProperty(this, 'player2', {
      get() { return this.players[1] || null; },
      set(v) { this.players[1] = v || null; },
      configurable: true,
    });

    // Track the user's explicit pre-launch 2P choice so it can survive world-load overwrite
    this._launchTwoPlayerMode = options.twoPlayerMode;
    // Phase 3B — per-player respawn timers (slots 0..3). _p1/_p2RespawnTimer are
    // accessors over slots 0/1 so existing call sites keep working.
    this._respawnTimers = [0, 0, 0, 0];
    Object.defineProperty(this, '_p1RespawnTimer', {
      get() { return this._respawnTimers[0]; }, set(v) { this._respawnTimers[0] = v; }, configurable: true,
    });
    Object.defineProperty(this, '_p2RespawnTimer', {
      get() { return this._respawnTimers[1]; }, set(v) { this._respawnTimers[1] = v; }, configurable: true,
    });
    this.player2         = null;
    this._p2SpawnX       = 0;
    this._p2SpawnY       = 0;
    this._p2RespawnTimer = 0;
    this._p1RespawnTimer = 0;  // 2P co-op: P1 uses timer instead of death modal

    // Phase 13: Particles + screen shake + Nether bed + Respawn Anchor
    this._particles           = [];
    this._screenShake         = { intensity: 0, frames: 0, maxFrames: 0 };
    this._netherBedFuse       = 0;    // countdown (frames) before Nether bed explosion
    this._netherBedPos        = null; // { col, row } of bed about to explode
    this._activeRespawnAnchor = null; // { col, row } of set respawn anchor

    // Phase 13.5-4: Audio cache (pre-loaded for zero-latency playback)
    this._audioCache = {};

    // Phase 13.5: Sound & Music System
    this._musicSystem = {
      bgAudio:           null,    // HTMLAudioElement for background music
      fadeInterval:      null,    // setInterval handle for fade effects
      currentTrack:      null,    // disc key or file path of current BG track
      lastNormalTrack:   null,    // BG track to resume after boss music ends
      bossMusicActive:   false,   // true while Ender Dragon battle music is playing
      netherMusicActive: false,   // true while Nether boss music is playing
      witherMusicActive: false,   // true while Wither battle music is playing
      victoryMusicActive: false,  // true while victory fanfare is playing (suppresses endBoss)
    };
    this._collectedDiscs   = new Set();     // Set of disc keys the player has found
    this._musicPlayerBlocks = new Map();    // "col,row" → {col,row,isConfigured,configuredSongs[]}
    this._musicPlayerUI    = null;          // null | {block, mode:'config'|'playback', tempSongs:Set}
    this._mobSoundTimer    = 0;            // counts up; mob sound fires every 300 frames

    // Phase 17-D: Determine sandbox world dimensions before building the level.
    // Peek at saved data (if loadKey given) or use caller-supplied dimensions.
    this._sandboxDims = null;
    if (this.gameMode === 'sandbox') {
      if (options.worldWidth && options.worldHeight) {
        this._sandboxDims = { width: options.worldWidth | 0, height: options.worldHeight | 0 };
      } else if (options.templateData) {
        // Reopening a saved world (editWorld passes templateData) — size the level
        // to the saved dimensions, else the saved grid. Without this the editor fell
        // through to the 600-wide default world and stamped the grid at top-left.
        const peeked = options.templateData;
        if (peeked.worldWidth && peeked.worldHeight) {
          this._sandboxDims = { width: peeked.worldWidth | 0, height: peeked.worldHeight | 0 };
        } else if (peeked.grid?.length > 0 && peeked.grid[0]?.length > 0) {
          this._sandboxDims = { width: peeked.grid[0].length, height: peeked.grid.length };
        }
      } else if (options.loadKey && typeof options.loadKey === 'string') {
        try {
          const peeked = SandboxSaves.load(options.loadKey);
          if (peeked?.worldWidth && peeked?.worldHeight) {
            this._sandboxDims = { width: peeked.worldWidth, height: peeked.worldHeight };
          } else if (peeked?.grid?.length > 0 && peeked.grid[0]?.length > 0) {
            this._sandboxDims = { width: peeked.grid[0].length, height: peeked.grid.length };
          }
        } catch {}
      }
    }

    // Phase 3A.1 — Arena mode init (must precede _buildLevel, which branches on it)
    this.isArena = (this.gameMode === 'arena');
    // Mining is a reusable capability, not tied to a hotbar slot. Enabled in
    // Normal mode; a future Arena game type can flip this on (e.g. via a ruleset
    // element). When enabled, holding the mouse on a mineable block mines it with
    // the player's best owned pickaxe (no manual select) — see the mining gate +
    // the pickaxe-tier HUD badge (Normal only).
    this._miningEnabled = (this.gameMode === 'normal');
    // New ARN sandbox worlds (no grid yet) open in the editor with the starter layout.
    this._arenaStarter = !!options.arenaStarter;
    // True when the SANDBOX editor is editing an arena world (fresh or with a grid),
    // so the editor view can auto-fit single-screen arenas like play does (Phase 3A.3).
    this._editArena = this._arenaStarter || !!(options.templateData && options.templateData.gameModeDefault === 'ARN');
    if (this.isArena) {
      this.arenaConfig = Object.assign(
        { gameDuration: 300000, respawnDelay: 2000, botCount: 3, mapName: 'DEATHMATCH_SMALL',
          // Phase 3A.2 — selected game mode (null → Phase 3A.1 Deathmatch behavior).
          arenaGameMode: options.arenaGameMode || null },
        options.arenaConfig || {}
      );
      this.arenaRespawnFrames = Math.max(1, Math.round(this.arenaConfig.respawnDelay / (1000 / 60)));
      this.arenaState  = { phase: 'countdown', countdownStart: null, gameStartTime: null, endTime: null,
        // Per-player individual stats — always tracked; the per-mode SCORE is
        // derived from these by ARENA_MODES.playerScore (see arena-modes.js).
        stats: (typeof ARENA_RULES !== 'undefined')
          ? { p1: ARENA_RULES.blankStat(), p2: ARENA_RULES.blankStat(), p3: ARENA_RULES.blankStat(), p4: ARENA_RULES.blankStat() }
          : {
              p1: { kills: 0, deaths: 0, mobKills: 0, emeralds: 0, hillSeconds: 0, hillStreak: 0, flagCaptures: 0, towerDamage: 0, towersDestroyed: 0 },
              p2: { kills: 0, deaths: 0, mobKills: 0, emeralds: 0, hillSeconds: 0, hillStreak: 0, flagCaptures: 0, towerDamage: 0, towersDestroyed: 0 },
              p3: { kills: 0, deaths: 0, mobKills: 0, emeralds: 0, hillSeconds: 0, hillStreak: 0, flagCaptures: 0, towerDamage: 0, towersDestroyed: 0 },
              p4: { kills: 0, deaths: 0, mobKills: 0, emeralds: 0, hillSeconds: 0, hillStreak: 0, flagCaptures: 0, towerDamage: 0, towersDestroyed: 0 },
            },
        // Reserved for Phase 3C teams (no logic yet).
        teamsEnabled: false, teamScores: { A: 0, B: 0 } };
      this._arenaSpawns = { p1: { x: 0, y: 0 }, p2: { x: 0, y: 0 }, p3: { x: 0, y: 0 }, p4: { x: 0, y: 0 } };
      // A user-designed arena (played from the picker / editor Test) arrives as a saved grid.
      this._arenaTemplateData = options.templateData || options.worldData || null;
      // World id + name for per-world leaderboards (null for Quick Battle).
      this._arenaWorldId = options.worldId || null;
      this._arenaWorldName = options.worldName || null;
    }

    // World provenance / lineage (uid, created/updated, origin, copiedFrom). Lives
    // inside world_data so it travels with the world across export/import/copy and
    // local↔cloud — the basis for the future "copy to online/offline" + cleanup tool.
    this._loadedProvenance = (options.templateData && options.templateData.provenance)
                          || (options.worldData && options.worldData.provenance) || null;

    this._buildLevel();

    this.state         = 'playing'; // 'playing' | 'won' | 'dead' | 'paused' | 'confirmExit'
    this.totalGameTime = 0;         // persistent total play time (ms); managed by GAME_TIMER
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

    // Pause menu tab system (Phase 11K-2)
    this._pauseTab        = 'pause';  // 'pause' | 'settings' | 'help'
    this._pauseSelIdx     = 0;        // D-Pad cursor in PAUSE tab
    this._pauseHelpScroll = 0;        // scroll offset in HELP tab
    this._useClassicPause = false;    // true → the restored canvas pause menu (Konami)
    this._konamiBuf       = [];       // rolling input tokens for the secret combo
    this._ltWasDown       = false;    // sandbox LT trigger edge (undo)
    this._rtWasDown       = false;    // sandbox RT trigger edge (redo)

    // Inventory UI
    this.inventoryOpen = false;
    this._iKeyWas      = false;
    this._invHeld      = null;   // { type, count } being dragged
    this._invHeldSrc   = null;   // { loc:'hotbar'|'inventory', index }

    // Chest system
    this._chests        = new Map();  // 'col,row' → {col, row, items: Array(8).fill(null)}
    this._chestOpen     = null;       // {col, row} of open chest, or null
    this._chestModalSel = 0;          // 0=Equip&Take, 1=Leave — keyboard/controller nav in chest modal
    this._eChestWas     = false;
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

    // Phase 11B-2: End Crystals + dragon defeat
    this._endCrystals         = END_TOWER_COLS.map(col => ({ col, row: END_CRYSTAL_ROW, destroyed: false }));
    this._dragonDefeated      = false;
    this._dragonVictoryScreen = false;
    this._dragonExitPortal    = false;
    this._savedDragonState    = null;

    // Phase 14 — Wither Boss
    this._witherBoss          = null;
    this._witherAltars        = [];   // [{anchorRow,anchorCol,skulls:[f,f,f],sand:[f,f,f,f]}]
    this._witherDefeated      = false;
    this._witherPreFightX     = 0;    // player position saved before teleport
    this._witherPreFightY     = 0;
    this._witherFade          = null; // { alpha, phase:'out'|'in', callback }
    this._lastAltarAnchorRow  = null; // altar position to restore on death
    this._lastAltarAnchorCol  = null;
    this._witherVictoryScreen = false;
    this._witherVictoryTimer  = 0;
    this._witherSprites       = { left: null, right: null, forward: null, awakening: new Array(5).fill(null) };
    this._witherSpritesLoaded = false;
    this._loadWitherSprites();

    // Phase 11D: End entry tracking + advanced world settings
    this._endEntryCell    = null;  // { col, row } set when player enters End Portal
    // _worldAdvSettings and player2 state initialized before _buildLevel() above
    this._wsTab            = 'drops'; // 'drops' | 'time' | 'advanced' | 'input' | 'audio' | 'multiplayer' | 'speedrunner'

    // Phase 16 — Multiplayer
    this._mpSyncTimer       = 0;    // frame counter for position-sync throttle (send every 3 frames)
    this._mpInvSyncTimer    = 0;    // frame counter for inventory sync (every 1800 frames = 30s)
    this._adminMode         = localStorage.getItem('mp_admin_mode') === '1';
    this._dogsBuffer        = [];   // key sequence buffer for DOGS admin unlock
    this._wsAudioDragTarget = null; // 'music' | 'sfx' | null — tracks slider drag in Audio tab
    this._pauseVolDrag      = null; // 'music' | 'sfx' | null — tracks slider drag in pause SETTINGS tab

    // Phase 16-B: Multiplayer polish state
    this._onlineGameId       = options.onlineGameId || null;
    this._chatMessages       = [];   // [{playerName, shirtColor, message, timestamp}]
    this._lastActivity       = Date.now();
    this._isAfk              = false;
    this._afkCheckTimer      = 0;
    this._gameNotifications  = [];   // [{text, color, timer}] — join/leave toasts
    this._chatDomReady       = false;
    this._onlineMenuOpen     = false; // non-pausing in-game online menu
    this._afkListenerCleanup = null;  // cleanup fn for document AFK event listeners

    // Auto-connect when launched via OnlineUI (Phase 16-A)
    if (options.onlineGameId) {
      const _gameId    = options.onlineGameId;
      const _pName     = options.onlinePlayerName || 'Player';
      const _app       = options.onlineAppearance || {};
      const _wData     = options.worldData || options.worldState || null;
      const _bid = options.onlineBrowserId || null;
      setTimeout(() => {
        if (window.multiplayerManager) {
          const mgr = window.multiplayerManager;
          mgr.connect(_gameId, _wData, _pName, _app, _bid);
          mgr.onInventoryRestored = (state) => this._restoreOnlineInventory(state);
          this._setupChatUI();
          mgr.chatCallback = (data) => this._onChatMessage(data);
          // Server-authoritative item pickup: the item is only added to MY
          // inventory when the server confirms I'm the claimer (prevents two
          // players both collecting the same floor item).
          mgr.onItemGranted = (type) => {
            if (type != null) this.player.addBlock(type);
            this._playSound('sounds/item-collected.mp3', 0.7);
          };
          // Server-authoritative pickup for PLACED collectibles (_platformerItems):
          // the server picks the first claimer; everyone removes the item, only
          // the claimer actually collects it.
          mgr.onPlacedItemClaimed = (key, byPlayer) => {
            const it = this._platformerItems[key];
            if (!it || it.collected) return;
            if (byPlayer === mgr.playerId) this._collectPlatformerItem(it);
            else it.collected = true; // someone else got it — remove, don't grant
          };
          // Phase 17-E: Relay mob drops from host to all joiners via server
          this.mobManager.dropCallback = (items) => {
            if (mgr.isConnected && mgr.isCreator) mgr.sendMobDrops(items);
          };
        }
        // Document-level AFK activity tracking (more reliable than per-frame polling)
        const _onActivity = () => { this._lastActivity = Date.now(); };
        document.addEventListener('keydown',   _onActivity, { passive: true });
        document.addEventListener('mousemove', _onActivity, { passive: true });
        document.addEventListener('mousedown', _onActivity, { passive: true });
        document.addEventListener('wheel',     _onActivity, { passive: true });
        this._afkListenerCleanup = () => {
          document.removeEventListener('keydown',   _onActivity);
          document.removeEventListener('mousemove', _onActivity);
          document.removeEventListener('mousedown', _onActivity);
          document.removeEventListener('wheel',     _onActivity);
        };
      }, 100);
    }

    // Context action for gamepad RB (computed every frame)
    this._contextAction  = null;   // 'chest'|'lever'|'bed'|'portal'|'apple'|... for P1
    this._contextAction2 = null;   // same for P2
    this._contextPrompt  = null;   // display string shown above P1
    this._contextPrompt2 = null;   // display string shown above P2

    // Phase 11F: Day/night cycle
    this._dayNight = {
      isDay:       true,
      nightPhase:  0,           // 0-7 moon phase
      timer:       0,           // ms elapsed in current half-cycle
      halfCycleMs: DAY_CYCLE_DEFAULT_MINUTES * 60 * 1000 / 2,
    };
    this._sunSprite   = null;
    this._moonSprites = new Array(8).fill(null);
    this._celestialLoaded = false;
    this._stars = this._generateStars();
    this._loadCelestialSprites();

    // Phase 11C-2: World Settings / Mob Drop config
    this._mobDropSettings = {
      zombie:          [{ item: BLOCK.APPLE,       chance: 100 }, { item: 0, chance: 0 }],
      skeleton:        [{ item: BLOCK.ARROW,       chance: 100 }, { item: BLOCK.APPLE, chance: 50 }],
      creeper:         [{ item: BLOCK.APPLE,       chance: 100 }, { item: 0, chance: 0 }],
      cave_spider:     [{ item: BLOCK.STRING,      chance: 100 }, { item: BLOCK.APPLE,       chance: 100 }],
      piglin:          [{ item: BLOCK.SOUL_SAND,   chance: 40  }, { item: BLOCK.APPLE,       chance: 50  }],
      blaze:           [{ item: BLOCK.BLAZE_ROD,   chance: 100 }, { item: BLOCK.APPLE,       chance: 50  }],
      wither_skeleton: [{ item: BLOCK.WITHER_SKELETON_HEAD, chance: 33 }, { item: BLOCK.SOUL_SAND, chance: 25 }],
      enderman:        [{ item: BLOCK.ENDER_PEARL, chance: 100 }, { item: BLOCK.APPLE,       chance: 50  }],
    };
    this._worldSettingsOpen  = false;
    this._htmlSettingsOpen   = false;   // unified HTML World Settings panel open
    this._wsHighlightMobKey  = null;   // mob key to scroll to when opening from egg right-click

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

    this._tutorialOpen    = false;  // ? (Shift+/) toggles tutorial overlay
    this._tutorialScrollY = 0;      // scroll offset within tutorial content

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
    this._deathHadDrops        = false;
    this._godModeUsed          = false; // true if god mode was ever enabled this session
    this._platformerStartMs    = null; // ms timestamp when play begins
    this._platformerFinishMs   = null; // ms elapsed at level completion
    // Campaign-prep scoring state (platformer). Reset each level load.
    this._score               = 0;    // running score (when platformerScore on)
    this._emeraldsCollected   = 0;    // emeralds picked up this level
    this._emeraldsActive      = false;// EMERALD_SYSTEM initialised for this platformer level
    this._wonExitColor        = 0;    // goal-star colour index of the goal that ended the level (for future campaign routing)
    this._platformerCheckpoints = [];  // [{col, row, elapsedMs}] checkpoints hit
    this._platformerLevelName  = '';
    this._platformerCreator    = '';

    if (this.gameMode === 'sandbox') {
      this.sandbox = new SandboxManager();
      this.player.godMode = true;
      // On a fresh (unsaved) world, convert built-in spawn points to visible sandbox eggs,
      // then clear the mob manager's spawn list — sandbox mode never spawns mobs directly.
      if (!options.loadKey) {
        const MOB_TO_EGG = {
          Zombie: 'zombie', Skeleton: 'skeleton', Creeper: 'creeper',
          CaveSpider: 'cave_spider', Piglin: 'piglin', Blaze: 'blaze',
          WitherSkeleton: 'wither_skeleton', Enderman: 'enderman',
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
        this.mobManager.setupSpawnPoints([]); // clear; sandbox uses eggs, not direct spawn points
      }
      // Load saved world or template
      if (options.loadKey) {
        this._loadSandboxWorld(options.loadKey);
        this._syncTwoPlayerAfterLoad();
      } else if (options.templateData) {
        this._loadSandboxWorld(options.templateData);
        this._syncTwoPlayerAfterLoad();
      }
      // Brand-new empty sandbox world (from template): no preset mobs or portals.
      // Persist the flag in _worldAdvSettings so it survives save/load.
      if (this._sandboxDims && !options.loadKey && !options.templateData) {
        this._worldAdvSettings.isEmptySandbox = true;
      }

      // Auto-register the two built-in world portals so they appear with labels
      // and clicking them opens the link popup instead of deleting them.
      // Skip for empty sandbox worlds (portals are at buildWorld() coordinates, not meaningful here).
      // Skip if already restored from a saved portalLinks array.
      if (!this._worldAdvSettings.isEmptySandbox) {
        if (!this.sandbox.findPortalAtCell(10, 270)) {
          this.sandbox.registerPortal(10, 270, 'overworld'); // gets '1' on fresh world
        }
        if (!this.sandbox.findPortalAtCell(10, 328)) {
          this.sandbox.registerPortal(10, 328, 'nether'); // gets 'A' on fresh world
        }
      }

      // Ensure custom teleport points exist (new worlds get one Spawn entry; old saves default to same)
      if (!Array.isArray(this._worldAdvSettings.customTeleportPoints)) {
        this._worldAdvSettings.customTeleportPoints = [
          { label: 'Spawn', x: this.level.spawnX, y: this.level.spawnY },
        ];
      }
    }

    // Normal mode: load sandbox world (saved key) or template
    if (this.gameMode === 'normal') {
      if (this._sandboxLoadKey) {
        this._loadNormalWorld(this._sandboxLoadKey);
        this._syncTwoPlayerAfterLoad();
      } else if (options.templateData) {
        this._loadNormalWorld(options.templateData);
        this._syncTwoPlayerAfterLoad();
      }
    }

    // Platformer mode: load sandbox world (saved key) or template
    if (this.gameMode === 'platformer') {
      const platData = this._platformerLoadKey || options.templateData;
      if (platData) {
        this._loadPlatformerWorld(platData);
        this._syncTwoPlayerAfterLoad();
        this.player.selectedSlot = 1;
        this._platformerStartMs  = Date.now();
        this.player.platformerSlots = new Map([
          [BLOCK.OBSIDIAN,     4],
          [BLOCK.EYE_OF_ENDER, 5],
        ]);
      }
    }

    // Phase 17 — Speed Runner mode
    this._sr = null;
    if (this.gameMode === 'speedrunner') {
      this._initSpeedRunnerMode(options);
      const srData = options.speedrunnerLoadKey || options.templateData;
      if (srData) this._loadSpeedRunnerWorld(srData);
    }

    // Portal fade transition
    this._portalTransition = null; // { phase:'out'|'in', timer, destX, destY }

    // Initialize audio (Phase 13.5) — must run after all state is set
    this._initAudio();

    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _buildLevel() {
    const data = this.gameMode === 'arena'
      // Play a user-designed arena from its saved grid, else the built-in default map.
      ? (buildArenaWorldDataFromSave(this._arenaTemplateData) || buildArenaWorldData(this.arenaConfig?.mapName || 'DEATHMATCH_SMALL'))
      // New ARN sandbox world (no grid yet): open the editor on a starter arena
      // shell at the world's chosen dimensions (Phase 3A.3 — was fixed 25×15).
      : (this.gameMode === 'sandbox' && this._arenaStarter)
        ? buildArenaStarterWorld(this._sandboxDims ? this._sandboxDims.width : 25,
                                 this._sandboxDims ? this._sandboxDims.height : 15)
        : (this.gameMode === 'sandbox' && this._sandboxDims)
          ? buildEmptySandboxWorld(this._sandboxDims.width, this._sandboxDims.height)
          : buildWorld();
    this.level           = new Level(data);
    this.player          = new Player(data.spawnX, data.spawnY);
    this._p2SpawnX = data.spawnX + BLOCK_SIZE * 2;
    this._p2SpawnY = data.spawnY;
    if (this._worldAdvSettings.twoPlayerMode) {
      this.player2 = new Player(this._p2SpawnX, this._p2SpawnY);
      this.player2.godMode = (this.gameMode === 'sandbox');
      this.player2.selectedSlot = 1;
    } else {
      this.player2 = null;
    }
    this._p2RespawnTimer = 0;
    this._p1RespawnTimer = 0;
    this.mobManager                = new MobManager();
    this.mobManager.dropConfig     = this._mobDropSettings;
    this.mobManager.soundCallback  = (file, vol) => this._playSound(file, vol);
    this.mobManager.setupSpawnPoints(data.spawnPoints);
    // _camera is set after Camera construction below
    this.camera          = new Camera(this.level.pixelWidth, this.level.pixelHeight);
    this.mobManager._camera = this.camera;
    this.bedSpawns       = data.bedPositions;
    this._activeSpawnBed = -1;
    this.portalData      = data.portalData;
    this.portalCooldown  = 0;   // frames before portal can be used again

    // Redstone
    this.redstone = new RedstoneSystem(data.redstoneComponents);
    this.redstone.soundCallback = (file, vol) => this._playSound(file, vol);

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

    // Phase 3A.1 — arena setup (fixed camera, bots, gear, scoring) on top of the built level
    if (this.gameMode === 'arena') this._setupArena(data);
  }

  // ── Phase 3A.1: Arena setup ────────────────────────────────
  // Works for both the built-in map (data._arena present) and user-designed
  // arenas loaded from a saved grid (spawns/bots derived from the grid).
  _setupArena(data) {
    const m   = data._arena;       // present only for the built-in map
    const W   = this.level.width;
    const H   = this.level.height;

    // Arena skips the _loadXxxWorld path, so saved per-world settings (zoom mode,
    // player health, redstone speed, …) never get applied. Pull them from the
    // template here so the editor's ⚙ Arena Settings take effect in play.
    if (this._arenaTemplateData && typeof this._arenaTemplateData.worldAdvSettings === 'object'
        && this._arenaTemplateData.worldAdvSettings) {
      Object.assign(this._worldAdvSettings, this._arenaTemplateData.worldAdvSettings);
    }
    // If the loaded arena world enables 2-player co-op, ensure P2 exists now.
    // twoPlayerMode often arrives via the template merge above — AFTER _buildLevel
    // already ran its player2 check — so create it here. The arming block below
    // then gives it the bow + arena HP. (Fixes P2 spawning bow-less: it could
    // select the bow slot but had no bow to render or fire.)
    // Phase 3B — arena supports 1-4 local players. playerCount arrives from the
    // pre-launch modal (arenaConfig); fall back to the legacy 2P flag.
    this._worldAdvSettings.playerCount = Math.max(1, Math.min(4,
      (this.arenaConfig.playerCount | 0) || (this._worldAdvSettings.twoPlayerMode ? 2 : 1)));
    const nP = this._numPlayers();
    if (nP >= 2) this._worldAdvSettings.twoPlayerMode = true; // keep legacy readers coherent

    // Player spawn positions (pixels). Built-in map carries explicit spawns;
    // otherwise the level default (P1) + evenly-spaced columns for P2-P4.
    const spawnKeys = ['p1', 'p2', 'p3', 'p4'];
    // Editor-placed player spawn points (Phase 3), sorted by designer slot 1..4.
    // These take priority over the auto-spread fallback so designers control starts.
    const placedSpawns = (this._arenaTemplateData && Array.isArray(this._arenaTemplateData.playerSpawns))
      ? this._arenaTemplateData.playerSpawns
          .filter(s => s && typeof s.col === 'number' && typeof s.row === 'number')
          .slice()
          .sort((a, b) => (a.slot || 1) - (b.slot || 1))
      : [];
    for (let i = 0; i < 4; i++) {
      const ms = m && m.playerSpawns && m.playerSpawns[i];
      // Prefer the placed point tagged for this player number; else the i-th by slot order.
      const placed = placedSpawns.find(s => (s.slot || 1) === i + 1) || placedSpawns[i];
      if (ms) {
        this._arenaSpawns[spawnKeys[i]] = { x: ms.col * BLOCK_SIZE, y: ms.row * BLOCK_SIZE };
      } else if (placed) {
        this._arenaSpawns[spawnKeys[i]] = { x: placed.col * BLOCK_SIZE, y: placed.row * BLOCK_SIZE };
      } else if (i === 0) {
        this._arenaSpawns.p1 = { x: this.level.spawnX, y: this.level.spawnY };
      } else {
        // Spread remaining players across the map width at the spawn row.
        const frac = i / 4; // 0.25 / 0.5 / 0.75 of the way across
        this._arenaSpawns[spawnKeys[i]] = { x: Math.floor((W - 3) * frac) * BLOCK_SIZE, y: this.level.spawnY };
      }
    }

    // Apply per-world arena config (Phase 3A.2). Pre-launch playerHealthHp
    // (Phase 3A.3) overrides the world default when present.
    const hpSrc = this.arenaConfig.playerHealthHp || this._worldAdvSettings.arenaPlayerMaxHealth || 20;
    const maxHp = Math.max(2, Math.min(40, hpSrc));
    this.redstoneSpeed = Math.max(0.5, Math.min(2.0, this._worldAdvSettings.redstoneSpeed || 1.0));

    // Create players[1..nP-1] if not already present (P1 built by _buildLevel).
    for (let i = 1; i < nP; i++) {
      if (!this.players[i]) {
        const sp = this._arenaSpawns[spawnKeys[i]];
        this.players[i] = new Player(sp.x, sp.y);
        this.players[i].godMode = false;
        this.players[i].selectedSlot = 1;
        this._respawnTimers[i] = 0;
      }
    }

    // Arm all players with the bow + unlimited arrows so combat works immediately.
    this._worldAdvSettings.unlimitedArrows = true;
    for (let i = 0; i < nP; i++) {
      const p = this.players[i];
      if (!p) continue;
      p.maxHp = maxHp;
      p._ownerId = Game.ownerId(i);  // PvP owner tag ('p1'..'p4')
      this._armArenaPlayer(p, this._arenaSpawns[spawnKeys[i]]);
      // Reserved team fields (Phase 3C — no logic yet; see [[phase3-arena-redesign]]).
      p.teamId = p.teamId ?? null; p.teamColor = p.teamColor ?? null;
    }

    // Disable mob drops when requested (pre-launch toggle, all modes; default off).
    this.mobManager.dropsDisabled = !!this.arenaConfig.disableMobDrops;

    // Player lives (pre-launch / Custom Rules): 0 = unlimited; else N respawns.
    const _lv = this.arenaConfig.lives;
    this._arenaLives = (_lv && _lv !== 'unlimited') ? Math.max(1, _lv | 0) : 0;
    this._arenaStartPlayers = this.activePlayers().length;
    if (this._arenaLives > 0) this.activePlayers().forEach(p => { p._arenaLives = this._arenaLives; });

    // Enemies:
    //  • SURVIVAL_WAVES → ignore spawn eggs + default bots entirely; ARENA_MODES
    //    spawns escalating waves from the designed spawn-lines.
    //  • else if spawn eggs present → per-spawner frequency/cap on-screen spawning.
    //  • else → default Skeleton bots (Quick Play / built-in map / back-compat).
    // Custom Rules: mob spawning is driven by the ruleset's three discrete mob
    // elements — bots (ambient), spawnEggs (designer spawners), waveSpawns
    // (structural waves). Presets keep their existing behaviour below (unchanged).
    const _cel = (this.arenaConfig.arenaGameMode === 'CUSTOM' && typeof ARENA_RULES !== 'undefined')
      ? ARENA_RULES.rulesetForMode('CUSTOM', this.arenaConfig).elements : null;
    if (_cel) {
      if (this.arenaConfig.disableMobs || _cel.waveSpawns || (!_cel.bots && !_cel.spawnEggs)) {
        this.mobManager.spawnPoints = []; this.mobManager.arenaMode = false; // waves spawn via ARENA_MODES
      } else if (_cel.spawnEggs && this.mobManager.spawnPoints.length > 0) {
        this.mobManager.arenaMode = true; // per-spawner egg spawning
      } else if (_cel.bots) {
        const botCols = (m && m.botSpawns?.length) ? m.botSpawns.map(b => b.col) : this._arenaBotColumns(W, this.arenaConfig.botCount);
        for (const col of botCols.slice(0, this.arenaConfig.botCount)) {
          const footY = this._arenaFloorY(col, H);
          const bot = this.mobManager._createMob('Skeleton', col * BLOCK_SIZE, footY);
          if (bot) this.mobManager.mobs.push(bot);
        }
      } else { this.mobManager.spawnPoints = []; this.mobManager.arenaMode = false; }
    } else if (this.arenaConfig.disableMobs) {
      // Bug-fix pass §2.7: "Disable Mobs" — no bots spawn in this match.
      this.mobManager.spawnPoints = [];
      this.mobManager.arenaMode = false;
    } else if (this.arenaConfig.arenaGameMode === 'SURVIVAL_WAVES') {
      this.mobManager.spawnPoints = [];
      this.mobManager.arenaMode = false;
    } else if (this.mobManager.spawnPoints.length > 0) {
      this.mobManager.arenaMode = true;
    } else {
      // No ambient respawns: spawnPoints is empty, so default bots don't respawn.
      const botCols = (m && m.botSpawns?.length)
        ? m.botSpawns.map(b => b.col)
        : this._arenaBotColumns(W, this.arenaConfig.botCount);
      for (const col of botCols.slice(0, this.arenaConfig.botCount)) {
        const footY = this._arenaFloorY(col, H);
        const bot = this.mobManager._createMob('Skeleton', col * BLOCK_SIZE, footY);
        if (bot) this.mobManager.mobs.push(bot);
      }
    }

    // Kill attribution → per-player individual stats. Mob kills are always
    // tracked as a stat; whether they contribute to a mode's SCORE is decided by
    // ARENA_MODES.playerScore (e.g. Deathmatch score = player kills only).
    this.mobManager.onKill = (owner) => {
      const st = this.arenaState.stats[owner]; if (st) st.mobKills++;
    };

    // Phase 3B PvP spike — friendly-fire gates player→player arrow damage.
    // Defaults OFF (co-op unaffected); WI6 will expose the toggle in pre-launch.
    // Deathmatch requires PvP; otherwise the Friendly-Fire toggle gates it.
    this._pvpEnabled = !!(this.arenaConfig &&
      (this.arenaConfig.friendlyFire || this.arenaConfig.arenaGameMode === 'DEATHMATCH'
       || this.arenaConfig.arenaGameMode === 'CAPTURE_FLAG'
       || (_cel && _cel.pvp)));
    this.mobManager.pvpEnabled = this._pvpEnabled;
    this.mobManager.onPlayerKill = (killer /*, victimId */) => {
      const st = this.arenaState.stats[killer]; if (st) st.kills++;
    };

    // Camera (Phase 3A.3): single-screen = fixed, centered (neutralize follow);
    // scrolling = let the normal follow/followMidpoint run each frame.
    const viewType = this._worldAdvSettings.arenaViewType || 'single';
    this._arenaScrolling = (viewType === 'scrolling');
    if (!this._arenaScrolling) {
      this.camera.follow = () => {};
      this.camera.followMidpoint = () => {};
      this.camera.followPlayers = () => {};  // Phase 3B: neutralize N-player follow too
      this.camera.x = Math.max(0, Math.min(this.level.pixelWidth  - CANVAS_W, (this.level.pixelWidth  - CANVAS_W) / 2));
      this.camera.y = Math.max(0, Math.min(this.level.pixelHeight - CANVAS_H, (this.level.pixelHeight - CANVAS_H) / 2));
    }

    // Hill (Phase 3A.3): the designed 4-wide platform if placed, else null
    // (arena-modes falls back to the arena-centre radius).
    const hill = this._arenaTemplateData && this._arenaTemplateData.placedHill;
    this._arenaHill = (hill && typeof hill.col === 'number' && typeof hill.row === 'number')
      ? { x: hill.col * BLOCK_SIZE, y: hill.row * BLOCK_SIZE, w: (hill.w || 4) * BLOCK_SIZE, h: (hill.h || 1) * BLOCK_SIZE }
      : null;

    // Survival-wave spawn markers (pixels), grouped by line (Phase 3A.3).
    const lines = (this._arenaTemplateData && Array.isArray(this._arenaTemplateData.spawnLines))
      ? this._arenaTemplateData.spawnLines : [];
    this._arenaSpawnLines = lines
      .filter(s => s && typeof s.col === 'number' && typeof s.row === 'number')
      .map(s => ({ x: s.col * BLOCK_SIZE + BLOCK_SIZE / 2, y: s.row * BLOCK_SIZE + BLOCK_SIZE / 2, line: s.line || 1 }));

    // Mob-HP preset → multiplier applied to every arena-created mob (pre-launch
    // mobDifficulty overrides the world default). EASY=½, MEDIUM=1, HARD=1½.
    const diff = (this.arenaConfig.mobDifficulty && this.arenaConfig.mobDifficulty !== 'WORLD')
      ? this.arenaConfig.mobDifficulty : (this._worldAdvSettings.arenaMobHealth || 'MEDIUM');
    this.mobManager.arenaMobHpMult = { EASY: 0.5, MEDIUM: 1.0, HARD: 1.5 }[diff] || 1.0;
    // Arena mobs move 2× by default (survival waves scale this up further).
    this.mobManager.arenaMobSpeedMult = 2.0;

    // Respawn delay from the world setting (seconds → frames).
    const respawnSec = (this._worldAdvSettings.arenaRespawnTime != null) ? this._worldAdvSettings.arenaRespawnTime : 2;
    this.arenaRespawnFrames = Math.max(1, Math.round(respawnSec * 60));

    // Phase 3A.2/3A.3 — collectibles + power-ups + game mode.
    if (typeof EMERALD_SYSTEM !== 'undefined') EMERALD_SYSTEM.init(this);
    if (typeof POWERUP_SYSTEM !== 'undefined') POWERUP_SYSTEM.init(this);
    if (typeof ARENA_MODES !== 'undefined' && this.arenaConfig.arenaGameMode && ARENA_MODES.initMode) {
      ARENA_MODES.initMode(this.arenaConfig.arenaGameMode, this);
    }
    // Arena objects (Phase 3 v3): derive CTF bases / towers / heal items from the
    // designer-placed markers (arena template, else the live sandbox) so CTF_SYSTEM
    // and TOWER_SYSTEM can anchor to them (they fall back to auto-placement if none).
    {
      const objs = (this._arenaTemplateData && Array.isArray(this._arenaTemplateData.arenaObjects))
        ? this._arenaTemplateData.arenaObjects
        : ((this.sandbox && Array.isArray(this.sandbox.placedArenaObjs)) ? this.sandbox.placedArenaObjs : []);
      const cx = (o) => (o.wx != null) ? o.wx : (o.col + 0.5) * BLOCK_SIZE;
      const cy = (o) => (o.wy != null) ? o.wy : (o.row + 0.5) * BLOCK_SIZE;
      const bases = objs.filter(o => o.type === 'base');
      const towers = objs.filter(o => o.type === 'tower');
      const heals = objs.filter(o => o.type === 'heal');
      this._ctfBases   = bases.length  ? bases.map(o => ({ team: (o.team === 1) ? 1 : 0, x: cx(o), y: cy(o) })) : null;
      this._arenaTowers = towers.length ? towers.map(o => ({ ownerId: 'p' + (o.slot || 1), slot: o.slot || 1, col: o.col, row: o.row })) : null;
      this._healItems  = heals.map(o => ({ wx: cx(o), wy: cy(o) }));
    }
    // Capture the Flag (Phase 3C) — assigns teams + flag bases when mode is CTF.
    if (typeof CTF_SYSTEM !== 'undefined') CTF_SYSTEM.init(this);
    // Defend the Tower (Phase 3 v3) — one Tower per player at their spawn.
    if (typeof TOWER_SYSTEM !== 'undefined') TOWER_SYSTEM.init(this);
  }

  // Per-running-frame: emerald + power-up pickups for each player, then tick
  // power-up effect timers. Score is credited to the picking player. (Phase 3A.2)
  _updateArenaCollectibles() {
    const award = (p, who) => {
      if (!p) return;
      if (typeof EMERALD_SYSTEM !== 'undefined') {
        EMERALD_SYSTEM.checkPickup(p, () => { const st = this.arenaState.stats[who]; if (st) st.emeralds++; });
      }
      if (typeof POWERUP_SYSTEM !== 'undefined') POWERUP_SYSTEM.checkPickup(p);
    };
    // Award all active players (Phase 3: P3/P4 previously missed emerald pickups).
    this.activePlayers().forEach((p) => award(p, p._ownerId || 'p1'));
    if (typeof POWERUP_SYSTEM !== 'undefined') POWERUP_SYSTEM.update(this);
    if (typeof CTF_SYSTEM !== 'undefined') CTF_SYSTEM.update(this);
    if (typeof TOWER_SYSTEM !== 'undefined') TOWER_SYSTEM.update(this);
  }

  // Evenly spread N bot columns across the interior (avoiding the side walls).
  _arenaBotColumns(W, n) {
    const cols = [];
    const lo = 2, hi = W - 3;
    const span = Math.max(1, hi - lo);
    for (let i = 0; i < n; i++) cols.push(Math.round(lo + span * ((i + 1) / (n + 1))));
    return cols;
  }

  // Top of the first solid tile in a column (pixels) so a mob stands on the floor.
  _arenaFloorY(col, H) {
    for (let r = 0; r < H; r++) {
      if (this.level.isSolid(r, col)) return r * BLOCK_SIZE;
    }
    return (H - 1) * BLOCK_SIZE;
  }

  _armArenaPlayer(p, spawn) {
    p.bow = 'BOW';
    p.selectedSlot = 2; // bow slot (weaponMode getter → 'bow')
    p.hp = p.maxHp;
    p.respawnAt(spawn.x, spawn.y);
  }

  // The manual Z zoom is available while editing (sandbox) or in God mode.
  _zoomOverrideAllowed() {
    return this.gameMode === 'sandbox' || !!(this.player && this.player.godMode);
  }

  // Bottom-left EXIT button used in Universal Test World (Phase 3A.3).
  _testExitRect() { return { x: 10, y: CANVAS_H - 32, w: 116, h: 24 }; }

  // ── Death body-part scatter (all modes) — recreated from the Speed-Runner
  // death animation: the player breaks into rotating, tumbling rectangles that
  // fly apart, fall under gravity, then fade. Phase 3A.3.
  _spawnDeathParts(player) {
    if (!player) return;
    const px = player.x, py = player.y, now = Date.now();
    const partDefs = [
      { cx: px+10, cy: py+ 8, w:16, h:16, color:'#F4C78A' }, // head skin
      { cx: px+10, cy: py+ 2, w:16, h: 6, color:'#7D4E1A' }, // hair
      { cx: px+10, cy: py+26, w:12, h:16, color:'#4A8FD4' }, // torso
      { cx: px+10, cy: py+32, w:12, h: 4, color:'#2C5F8A' }, // belt
      { cx: px+ 5, cy: py+24, w: 6, h:16, color:'#4A8FD4' }, // left arm
      { cx: px+17, cy: py+24, w: 6, h:16, color:'#4A8FD4' }, // right arm
      { cx: px+ 6, cy: py+41, w: 8, h:14, color:'#2C5F8A' }, // left leg
      { cx: px+14, cy: py+41, w: 8, h:14, color:'#2C5F8A' }, // right leg
      { cx: px+ 6, cy: py+50, w: 8, h: 4, color:'#3D1C02' }, // left shoe
      { cx: px+14, cy: py+50, w: 8, h: 4, color:'#3D1C02' }, // right shoe
    ];
    for (const d of partDefs) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * 5;
      this._deathParts.push({
        x: d.cx, y: d.cy,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 5, // bias upward
        rot: (Math.random() - 0.5) * 0.4, rotV: (Math.random() - 0.5) * 0.22,
        w: d.w, h: d.h, color: d.color, alpha: 1.0, born: now,
      });
    }
    if (this._deathParts.length > 120) this._deathParts.splice(0, this._deathParts.length - 120);
  }

  _updateDeathParts() {
    if (!this._deathParts.length) return;
    const now = Date.now();
    for (const part of this._deathParts) {
      part.x += part.vx; part.y += part.vy;
      part.vy += 0.35;  // gravity
      part.vx *= 0.98;  // air drag
      part.rot += part.rotV;
      if (now - part.born > 600) part.alpha = Math.max(0, part.alpha - 0.04); // fade after ~0.6s
    }
    this._deathParts = this._deathParts.filter(p => p.alpha > 0);
  }

  _drawDeathParts(ctx) {
    for (const part of this._deathParts) {
      if (part.alpha <= 0) continue;
      const sx = Math.floor(part.x - this.camera.x), sy = Math.floor(part.y - this.camera.y);
      ctx.save();
      ctx.globalAlpha = part.alpha;
      ctx.translate(sx, sy); ctx.rotate(part.rot);
      ctx.fillStyle = part.color;
      ctx.fillRect(-part.w / 2, -part.h / 2, part.w, part.h);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // ── Phase 3A.3: unified view zoom (all modes) ───────────────
  // Resolution order: Speed-Runner's own speed-zoom → manual Z override
  // (sandbox/God) → arena prescribed zoom → universal worldZoom default.
  _resolveViewZoom() {
    if (this.gameMode === 'speedrunner' && this._sr) return this._sr.srZoom ?? 1.0;
    if (this._zoomOverride != null && this._zoomOverrideAllowed()) {
      const z = this._zoomOverride;
      this._focusCam(z); // keep the player (or arena) on screen under the override
      return z;
    }
    if (this.isArena) return this._arenaActiveZoom();
    // Sandbox editing an arena single-screen world → fit the whole arena (like play).
    if (this.gameMode === 'sandbox' && this._editArena && this._worldAdvSettings.arenaViewType !== 'scrolling') {
      const z = this._fitZoom();
      const c = this._clampArenaCam(this.level.pixelWidth / 2, this.level.pixelHeight / 2, z);
      this.camera.x = c.x; this.camera.y = c.y;
      return z;
    }
    return Math.max(0.2, Math.min(4, (this._worldAdvSettings && this._worldAdvSettings.worldZoom) || 1.0));
  }

  // Re-centre the camera so the focus stays on screen under zoom `z`. Arenas frame
  // the level centre; everything else frames the player (midpoint in 2-player).
  // Reuses the zoom-aware clamp so the viewport never leaves the level.
  // Resolve the frame's view zoom AND camera focus, and publish the zoom to the
  // camera so toWorld()/highlight/placement all use the SAME transform. Must run
  // BEFORE any mouse→grid conversion in a frame (update AND render) — otherwise
  // the block-placement highlight is computed with the previous frame's zoom/
  // camera but drawn under the current one, so it drifts from the cursor when
  // zoomed. Idempotent within a frame (safe to call in both update and render).
  _syncViewTransform() {
    const z = this._resolveViewZoom();
    this.camera._srZoom = z;
    return z;
  }

  _focusCam(z) {
    let fx, fy;
    if (this.isArena) { fx = this.level.pixelWidth / 2; fy = this.level.pixelHeight / 2; }
    else {
      const p = this.player;
      fx = p.x + (p.width || PLAYER_W) / 2;
      fy = p.y + (p.height || PLAYER_H) / 2;
      if (this.player2) { fx = (fx + this.player2.x + (this.player2.width || PLAYER_W) / 2) / 2; fy = (fy + this.player2.y + (this.player2.height || PLAYER_H) / 2) / 2; }
    }
    const c = this._clampArenaCam(fx, fy, z);
    this.camera.x = c.x; this.camera.y = c.y;
  }

  // Zoom that fits the whole level in the viewport (≤1 so small levels aren't
  // magnified). Used by single-screen/fixed-camera arenas (Phase 3A.3).
  _fitZoom() {
    return Math.max(0.2, Math.min(1.0, Math.min(CANVAS_W / this.level.pixelWidth, CANVAS_H / this.level.pixelHeight)));
  }

  // ── Phase 3A.2/3A.3: Arena zoom ─────────────────────────────
  // Returns the active arena zoom (1.0 = none) and recenters the camera under the
  // zoomed viewport (overriding _setupArena's fixed center). Single-screen with no
  // explicit zoom mode auto-fits the whole arena on screen.
  _arenaActiveZoom() {
    const s = this._worldAdvSettings;
    const mode = (s && s.arenaZoomMode) || 'NONE';
    // Single-screen (fixed camera) + no manual mode → fit the whole arena.
    if (mode === 'NONE' && (s && s.arenaViewType) !== 'scrolling') {
      const z = this._fitZoom();
      const cam = this._clampArenaCam(this.level.pixelWidth / 2, this.level.pixelHeight / 2, z);
      this.camera.x = cam.x; this.camera.y = cam.y;
      return z;
    }
    if (mode === 'PRESET') {
      const z = Math.max(0.3, Math.min(1.5, (s && s.arenaPresetZoom) || 1.0));
      const cam = this._clampArenaCam(this.level.pixelWidth / 2, this.level.pixelHeight / 2, z);
      this.camera.x = cam.x; this.camera.y = cam.y;
      return z;
    }
    if (mode === 'DYNAMIC') {
      if (this.activePlayers().length >= 2) {
        // Multiple players: frame the bounding box of all (+padding), zoom to fit.
        const t = this._computeDynamicZoom();
        this._arenaDynZoom = (this._arenaDynZoom == null)
          ? t.z
          : this._arenaDynZoom + (t.z - this._arenaDynZoom) * 0.1; // smooth-lerp
        const cam = this._clampArenaCam(t.fx, t.fy, this._arenaDynZoom);
        this.camera.x = cam.x; this.camera.y = cam.y;
        return this._arenaDynZoom;
      }
      // Single player: just follow the one player at normal zoom (no midpoint
      // zoom-out). Without this, DYNAMIC fell through to the level-center fixed
      // camera and the lone player drifted off-centre.
      this._arenaDynZoom = 1.0;
      const cam = this._clampArenaCam(this.player.cx, this.player.cy, 1.0);
      this.camera.x = cam.x; this.camera.y = cam.y;
      return 1.0;
    }
    return 1.0; // NONE → keep the fixed centering from _setupArena
  }

  // Zoom + focus that frames all live players (+padding) within the canvas.
  // Generalized to 1-4 players (Phase 3B); the bounding box spans activePlayers().
  _computeDynamicZoom() {
    const live = this.activePlayers();
    const pad = 3 * BLOCK_SIZE;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of live) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x + p.width);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y + p.height);
    }
    const zW = CANVAS_W / ((maxX - minX) + pad * 2);
    const zH = CANVAS_H / ((maxY - minY) + pad * 2);
    const z  = Math.max(0.3, Math.min(1.5, Math.min(zW, zH)));
    return { z, fx: (minX + maxX) / 2, fy: (minY + maxY) / 2 };
  }

  // Center the camera on (fx,fy) and clamp so the zoomed viewport stays within the
  // level. Scale is about canvas center, so the world point at screen-center is
  // camX + CANVAS_W/2 (independent of z); the visible half-extent is (CANVAS/2)/z.
  _clampArenaCam(fx, fy, z) {
    const halfW = (CANVAS_W / 2) / z, halfH = (CANVAS_H / 2) / z;
    let camX = fx - CANVAS_W / 2;
    let camY = fy - CANVAS_H / 2;
    const minCamX = halfW - CANVAS_W / 2;
    const maxCamX = this.level.pixelWidth  - halfW - CANVAS_W / 2;
    const minCamY = halfH - CANVAS_H / 2;
    const maxCamY = this.level.pixelHeight - halfH - CANVAS_H / 2;
    camX = (minCamX > maxCamX) ? (this.level.pixelWidth  - CANVAS_W) / 2 : Math.max(minCamX, Math.min(maxCamX, camX));
    camY = (minCamY > maxCamY) ? (this.level.pixelHeight - CANVAS_H) / 2 : Math.max(minCamY, Math.min(maxCamY, camY));
    return { x: camX, y: camY };
  }

  // Arena world-space overlays (emeralds, power-ups), drawn inside the zoom ctx so
  // they scale with the world. Systems are populated in Parts 4/6; guarded so this
  // is a no-op until they load.
  _drawArenaWorldOverlay(ctx) {
    if (typeof EMERALD_SYSTEM !== 'undefined' && EMERALD_SYSTEM.draw) EMERALD_SYSTEM.draw(ctx, this.camera, this.frameCount);
    if (typeof POWERUP_SYSTEM !== 'undefined' && POWERUP_SYSTEM.draw) POWERUP_SYSTEM.draw(ctx, this.camera, this.frameCount);
    if (typeof CTF_SYSTEM !== 'undefined' && CTF_SYSTEM.draw) CTF_SYSTEM.draw(ctx, this.camera, this.frameCount);
    if (typeof TOWER_SYSTEM !== 'undefined' && TOWER_SYSTEM.draw) TOWER_SYSTEM.draw(ctx, this.camera, this.frameCount);
    // King-of-the-Hill platform — tinted green while held, gold otherwise (Phase 3A.3).
    if (this._arenaHill && this._arenaMode && this._arenaMode.key === 'KING_OF_HILL' && typeof _drawHillPlatform === 'function') {
      // Hill tinted by its owner: P1 blue, P2 red, P3 green, P4 yellow; unowned = yellow.
      // v3: no white "contested" tint — Sticky keeps the owner's colour while contested
      // (owner persists in state); Sole clears the owner when contested → yellow.
      const owner = (typeof ARENA_MODES !== 'undefined' && ARENA_MODES.hillOwner) ? ARENA_MODES.hillOwner(this) : null;
      const ownerColors = { p1: '#42a0ff', p2: '#ff5a5a', p3: '#5aff7a', p4: '#f5d142' };
      const color = ownerColors[owner] || '#f1c40f';
      _drawHillPlatform(ctx, this._arenaHill.x - this.camera.x, this._arenaHill.y - this.camera.y, color,
        this._arenaHill.w / BLOCK_SIZE, this._arenaHill.h / BLOCK_SIZE);
    }
  }

  // Per-world redstone rate multiplier, honored in ALL modes (0.25×–8×). At high
  // values pistons/trapdoors fire near-instantly — useful for fast Speed-Run
  // traps (a pressure plate hit early can trip a piston further along in time).
  _rsRate() {
    return Math.max(0.25, Math.min(8.0, (this._worldAdvSettings && this._worldAdvSettings.redstoneSpeed) || 1.0));
  }

  // Redstone propagation step in frames (coarse per-world cadence; Phase 3A.2).
  // Baseline 6 frames; higher rate → fewer frames (faster), min 1.
  _rsStepFrames() {
    return Math.max(1, Math.round(6 / this._rsRate()));
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
    const deltaMs = this._lastTs !== undefined ? ts - this._lastTs : 16.67;
    this._lastTs = ts;
    this.frameCount++;
    this._update(deltaMs);
    this._render();
    this.input.flush();
  }

  destroy() {
    // Stop the loop FIRST so the frame is never left half-rendered. Everything
    // after is best-effort cleanup wrapped so a single failure can't throw out of
    // destroy() — otherwise the caller's return-to-menu callback never fires and
    // the last game frame stays frozen on screen (the Sandbox test-exit freeze).
    this._running = false;
    try {
      // Back to the menus → re-enable menu-only retro FX.
      if (typeof document !== 'undefined' && document.body) document.body.classList.remove('in-game');
      // Ensure the HTML pause overlay never lingers past teardown.
      if (typeof PAUSE_MENU !== 'undefined') PAUSE_MENU.close();
      this._closeSaveDialog();
      // Clean up AFK document event listeners
      if (this._afkListenerCleanup) { this._afkListenerCleanup(); this._afkListenerCleanup = null; }
      // Remove chat DOM overlay if present
      if (this._chatDomElement) { this._chatDomElement.remove(); this._chatDomElement = null; }
      // Fade out game audio so it doesn't bleed into the menu
      const bg = this._musicSystem?.bgAudio;
      if (bg && !bg.paused) {
        const startVol = bg.volume;
        const steps = 40;
        let count = 0;
        const iv = setInterval(() => {
          count++;
          bg.volume = Math.max(0, startVol - count * (startVol / steps));
          if (count >= steps) { clearInterval(iv); bg.pause(); }
        }, 50);
      }
    } catch (e) {
      if (typeof console !== 'undefined') console.error('Game.destroy cleanup error (ignored):', e);
    }
  }

  _notify(text, color = '#fff', life = 180) {
    this.notifications.push({ text, color, life, maxLife: life });
  }

  _update(deltaMs = 16.67) {
    // Smart Mobs §2 — apply the world's chosen starting weapons once, on the
    // first update (after world load + any saved-progress deserialize).
    if (!this._startWeaponsApplied) { this._startWeaponsApplied = true; this._applyStartingWeapons(); }
    // Trident returns to hand once the thrown projectile lands/hits/expires.
    if (this.player && this.player._tridentOut && (!this.player._tridentArrow || !this.player._tridentArrow.alive)) {
      this.player._tridentOut = false; this.player._tridentArrow = null;
    }
    // ── Poll gamepad state first (Phase 11K-1) ──────────────
    this.input.updateGamepad();
    // Right stick moves the cursor every frame — before any early returns so it works
    // in inventory, menus, popups, pause, etc. Speed: ~14px/frame ≈ 1 sec to cross screen.
    this.input.applyStickCursor(14, CANVAS_W, CANVAS_H);
    // Controller A button → simulate mouse click when any menu/overlay is open.
    // Only applies to overlays (not gameplay) so A still jumps during normal play.
    const _p1GpConnected = this.input.p1GpSlot >= 0 && this.input.gamepads[this.input.p1GpSlot]?.connected;
    if (_p1GpConnected && this.input.p1JustDown('jump')) {
      const inOverlay = this.inventoryOpen || this._worldSettingsOpen || this._htmlSettingsOpen ||
                        this.state === 'paused' || this.state === 'confirmExit' ||
                        this.state === 'dead'   || this._tutorialOpen ||
                        this._saveDialog != null || this._musicPlayerUI != null ||
                        this.craftingMenu?.open;
      if (inOverlay) this.input.mouse.clicked = true;
    }
    // Reset context action each frame (recomputed later if gameplay is active)
    this._contextAction  = null;
    this._contextAction2 = null;
    this._contextPrompt  = null;
    this._contextPrompt2 = null;

    // ── Phase 16-B: AFK tracking (via document listeners) + notification decay ──
    if (this._onlineGameId) {
      // Activity timestamps set by document event listeners; check state every 600 frames (~10s)
      this._afkCheckTimer++;
      if (this._afkCheckTimer >= 600) {
        this._afkCheckTimer = 0;
        const nowAfk = Date.now() - this._lastActivity > 300000; // 5 min
        if (nowAfk !== this._isAfk) {
          this._isAfk = nowAfk;
          if (window.multiplayerManager?.isConnected) {
            window.multiplayerManager.sendStatus(this._isAfk);
          }
        }
      }
    }
    // Game join/leave notification decay
    if (this._gameNotifications) {
      this._gameNotifications = this._gameNotifications.filter(n => { n.timer--; return n.timer > 0; });
    }

    // ── Tutorial overlay — ? (Shift+/) toggles; checked before other input ──
    const _shiftHelp = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
    if (this.input.isJustDown('Slash') && _shiftHelp) {
      this._tutorialOpen = !this._tutorialOpen;
      if (this._tutorialOpen) this._tutorialScrollY = 0;
    }
    if (this._tutorialOpen) {
      // Scroll content
      if (this.input.scrollDelta) this._tutorialScrollY = Math.max(0, this._tutorialScrollY + this.input.scrollDelta * 30);
      if (this.input.isJustDown('ArrowDown')) this._tutorialScrollY += 30;
      if (this.input.isJustDown('ArrowUp'))   this._tutorialScrollY = Math.max(0, this._tutorialScrollY - 30);
      // Close via ESC
      if (this.input.isJustDown('Escape')) this._tutorialOpen = false;
      // Close via X button or ? button click
      if (this.input.mouse.clicked) {
        const PW = 540, PH = 450;
        const PX = (CANVAS_W - PW) / 2, PY = (CANVAS_H - PH) / 2;
        const XBX = PX + PW - 28, XBY = PY + 8;
        const BTN_X = CANVAS_W - 32, BTN_Y = 8;
        const mx = this.input.mouse.x, my = this.input.mouse.y;
        if ((mx >= XBX && mx <= XBX + 20 && my >= XBY && my <= XBY + 20) ||
            (mx >= BTN_X && mx <= BTN_X + 24 && my >= BTN_Y && my <= BTN_Y + 24)) {
          this._tutorialOpen = false;
        }
      }
      return; // block game input while tutorial is open
    }
    // Help button (?) click — open tutorial
    if (this.input.mouse.clicked) {
      const BTN_X = CANVAS_W - 32, BTN_Y = 8;
      if (this.input.mouse.x >= BTN_X && this.input.mouse.x <= BTN_X + 24 &&
          this.input.mouse.y >= BTN_Y && this.input.mouse.y <= BTN_Y + 24) {
        this._tutorialOpen = true; this._tutorialScrollY = 0;
      }
    }

    // Test World: clickable EXIT button — works any time, including the arena end
    // screen, so you're never stuck (Phase 3A.3). Esc also exits (handled below).
    if (this._testMode && this.input.mouse.clicked) {
      const r = this._testExitRect();
      const mx = this.input.mouse.x, my = this.input.mouse.y;
      if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
        this.destroy();
        if (this._onReturnToMenu) this._onReturnToMenu();
        return;
      }
    }

    // Animate death body-part scatter (all modes; runs even on the death/end screen).
    this._updateDeathParts();

    // ── ESC: pause / unpause (not on win screen) ───────────────
    const escNow  = this.input.isDown('Escape');
    const escEdge = (escNow && !this._escWas) || this.input.p1JustDown('menu');
    if (escEdge) {
      // Test mode (Sandbox playtest): Esc exits straight back to the editor via
      // _onReturnToMenu (the launcher's callback). The on-screen ↺ Restart /
      // ← Sandbox buttons (#test-hud) are the primary controls; no pause-freeze.
      if (this._testMode) {
        this.destroy();
        if (this._onReturnToMenu) this._onReturnToMenu();
        return;
      } else if (this.isArena && this.arenaState.phase === 'ended') {
        this.destroy();
        if (this._onReturnToMenu) this._onReturnToMenu();
        return;
      } else if (this._teleportMenu) {
        this._teleportMenu = false;
      } else if (this._chestOpen) {
        this._closeChest();
      } else if (this.inventoryOpen) {
        this._returnHeldItem();
        this.inventoryOpen = false;
      } else if (this._onlineGameId) {
        // Online: never pause — toggle the non-pausing online overlay menu
        if (this._worldSettingsOpen) this._worldSettingsOpen = false;
        else this._onlineMenuOpen = !this._onlineMenuOpen;
      } else if (this.state === 'playing')     this.state = 'paused';
      else if   (this.state === 'paused')      this.state = 'playing';
      else if   (this.state === 'confirmExit') this.state = 'paused';
    }
    this._escWas = escNow;

    // Freeze/resume the arena match timer whenever the game is paused — detected
    // centrally each frame so EVERY resume path is covered (ESC toggle AND the
    // pause-menu Resume/save/settings buttons, which set state directly).
    if (this.isArena) {
      const pausedNow = (this.state === 'paused' || this.state === 'confirmExit');
      if (pausedNow !== this._arenaWasPaused) {
        this._onArenaPauseChange(pausedNow);
        this._arenaWasPaused = pausedNow;
      }
    }

    // ── Secret combo (Konami) — toggles the classic canvas pause menu ──
    this._checkKonami();

    // ── Pause / confirm-exit ──
    const _paused = this.state === 'paused' || this.state === 'confirmExit';
    // Speed Runner: freeze the race clock while paused. The timer is wall-clock
    // (Date.now() − startMs), so on resume we shift every SR time-anchor forward by
    // the paused duration — the elapsed time excludes time spent paused.
    if (this.gameMode === 'speedrunner' && this._sr) {
      if (_paused && !this._srPausedAt) {
        this._srPausedAt = Date.now();
      } else if (!_paused && this._srPausedAt) {
        this._srShiftClocks(Date.now() - this._srPausedAt);
        this._srPausedAt = 0;
      }
    }
    if (this._useClassicPause) {
      // Classic canvas menu: keep the HTML overlay closed and drive canvas input.
      if (typeof PAUSE_MENU !== 'undefined' && PAUSE_MENU.isOpen()) PAUSE_MENU.close();
      if (_paused) { this._updatePause(); return; }
    } else {
      // Default: reconcile the HTML overlay against the game state each frame so
      // EVERY transition (Esc toggle + the overlay's own buttons) shows/hides it.
      if (typeof PAUSE_MENU !== 'undefined') PAUSE_MENU.sync(this, _paused);
      if (_paused) return;
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
        if (this._onlineGameId) window.multiplayerManager?.disconnect();
        this.destroy();
        if (this._onReturnToMenu) this._onReturnToMenu(_localMenuState(this));
      }
      return;
    }

    // ── Phase 3A.1: Arena state machine ───────────────────────
    if (this.isArena) {
      const a = this.arenaState;
      if (a.phase === 'countdown') {
        if (a.countdownStart == null) a.countdownStart = Date.now();
        if (Date.now() - a.countdownStart >= 3600) { // 3·2·1·GO ≈ 3.6s
          a.phase = 'running';
          a.gameStartTime = Date.now();
        }
        return; // freeze gameplay during the countdown
      }
      if (a.phase === 'ended') {
        return; // freeze on the end screen (ESC to exit, handled above)
      }
      // running: collectibles + power-ups update every frame.
      this._updateArenaCollectibles();

      // Lives (last-standing): if the match started with 2+ players and only one
      // remains un-eliminated, end it — the survivor wins on the end screen.
      if (this._arenaLives > 0 && this._arenaStartPlayers > 1 && this.activePlayers().length <= 1) {
        a.phase = 'ended'; a.endTime = a.endTime || Date.now();
        return;
      }

      // A game mode (Phase 3A.2) owns the win condition when one is set;
      // otherwise fall back to the Phase 3A.1 Deathmatch rule.
      const dur = this.arenaConfig.gameDuration;
      const timeUp = dur > 0 && this._arenaElapsedMs() >= dur;
      if (typeof ARENA_MODES !== 'undefined' && this.arenaConfig.arenaGameMode && ARENA_MODES.update) {
        ARENA_MODES.update(this); // flips a.phase to 'ended' via its win condition
        if (a.phase === 'ended' || timeUp) { // timeUp ends timer-bound modes (e.g. Fight Mobs)
          a.phase = 'ended';
          a.endTime = a.endTime || Date.now();
          return;
        }
      } else {
        // Spawner-driven arenas continually respawn, so they never run out of
        // bots — end only on the timer. Default-bot Deathmatch ends when the last
        // bot dies (or on the timer).
        const aliveBots = this.mobManager.mobs.filter(mb => mb.alive).length;
        const allDead = !this.mobManager.arenaMode && aliveBots === 0;
        if (allDead || timeUp) {
          a.phase = 'ended';
          a.endTime = Date.now();
          return;
        }
      }
    }

    // ── First-frame mode notification ──────────────────────────
    if (this.frameCount === 1 && this.gameMode !== 'normal') {
      const names = { sandbox: 'Sandbox', platformer: 'Platformer', speedrunner: 'Speed Runner' };
      if (this.gameMode !== 'speedrunner') {  // SR shows its own start screen
        this._notify(`${names[this.gameMode] ?? this.gameMode} mode active`, '#FFD700', 300);
      }
    }
    if (this.frameCount === 1) {
      this._notify('Press H or ? for help', '#667788', 240);
    }

    // ── Day/night timer (always advances, all modes) ───────────
    this._updateDayNight(deltaMs);

    // ── Phase 17-E: Host broadcasts time / mob / redstone state to joiners ─
    if (this._onlineGameId && window.multiplayerManager?.isConnected && window.multiplayerManager?.isCreator) {
      const mgr = window.multiplayerManager;
      // Time sync every 10 s (~600 frames)
      if (this.frameCount % 600 === 0 && this.frameCount > 0) mgr.sendTimeSync(this._dayNight);
      // Mob state every ~100ms (~6 frames) — includes projectiles so joiners see arrows/fireballs
      if (this.frameCount % 6 === 0 && this.gameMode !== 'sandbox') {
        const _arrows = this.mobManager.arrows.filter(a => a.alive).map(a => ({ x: a.x, y: a.y, vx: a.vx, vy: a.vy }));
        const _blaze  = this.mobManager.blazeShots.filter(bs => bs.alive).map(bs => ({ x: bs.x, y: bs.y, vx: bs.vx, vy: bs.vy }));
        mgr.sendMobState(this.mobManager.serializeMobs(), _arrows, _blaze);
      }
      // Redstone component states every 0.5 s (~30 frames)
      if (this.frameCount % 30 === 0 && this.redstone?.components?.length) {
        const rsSnap = this.redstone.components.map(c => ({
          col: c.col, row: c.row, type: c.type,
          on: c.on, open: c.open, extended: c.extended,
        }));
        const dustSnap = [...(this._dustBlocks?.values() ?? [])].map(d => ({ col: d.col, row: d.row, on: d.on, everTriggered: d.everTriggered }));
        mgr.sendRedstoneState(rsSnap, dustSnap);
      }
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
        if (this.player2 && this._p2RespawnTimer === 0) {
          this.player2.x  = pt.destX + BLOCK_SIZE;
          this.player2.y  = pt.destY;
          this.player2.vx = 0; this.player2.vy = 0;
        }
        pt.phase = 'in';
        pt.timer = 0;
      } else if (pt.phase === 'in' && pt.timer >= 120) {
        this._portalTransition = null;
        this.portalCooldown    = 120;
      }
      this._followCamera();
      return;
    }

    // ── Wither fade transition — black overlay, player stays visible ──
    if (this._witherFade) {
      const wf = this._witherFade;
      if (wf.phase === 'out') {
        wf.alpha = Math.min(1, wf.alpha + 1 / 60);
        if (wf.alpha >= 1) {
          if (wf.callback) { wf.callback(); wf.callback = null; }
          wf.phase = 'in';
        }
      } else {
        wf.alpha = Math.max(0, wf.alpha - 1 / 60);
        if (wf.alpha <= 0) { this._witherFade = null; this.portalCooldown = 60; }
      }
      this._followCamera();
      if (this._witherBoss) {
        this.camera.x = Math.max(WITHER_ARENA_MIN_COL * BLOCK_SIZE,
                         Math.min(WITHER_ARENA_MAX_COL * BLOCK_SIZE - CANVAS_W, this.camera.x));
        this.camera.y = WITHER_CAM_LOCK_Y;
      }
      return;
    }

    // ── Music Player UI: update when open (all modes) ─────────────────────────
    if (this._musicPlayerUI) {
      this._updateMusicPlayerUI();
      this._followCamera();
      return;
    }

    // ── Save dialog (sandbox): block all gameplay while open ──
    if (this._saveDialog) {
      this._updateSaveDialog();
      return;
    }

    // ── World Settings panel (sandbox): block gameplay while open ──
    if (this._worldSettingsOpen) {
      this._updateWorldSettings();
      this._followCamera();
      return;
    }

    // ── Online in-game menu overlay: block gameplay input while open ──
    if (this._onlineGameId && this._onlineMenuOpen) {
      this._updateOnlineMenu();
      this._followCamera();
      return;
    }

    // ── Dragon victory screen: intercept clicks, block gameplay ──
    if (this._dragonVictoryScreen) {
      if (this.input.mouse.clicked) {
        const pw = 420, ph = 210;
        const panY = (CANVAS_H - ph) / 2;
        const bw = 180, bh = 34;
        const bx = (CANVAS_W - bw) / 2, by = panY + ph - 56;
        const mx = this.input.mouse.x, my = this.input.mouse.y;
        if (mx >= bx && mx <= bx + bw && my >= by && my <= by + bh) {
          this._dragonVictoryScreen = false;
        }
      }
      if (this.input.isJustDown('KeyU') || this.input.p1JustDown('place') ||
          this.input.p1JustDown('jump') || this.input.p1JustDown('menu')) {
        this._dragonVictoryScreen = false;
      }
      this._followCamera();
      return;
    }

    // ── Wither victory screen: early dismiss via key/button ───
    if (this._witherVictoryScreen) {
      const ph = 210, panY = (CANVAS_H - ph) / 2;
      const bw = 180, bh = 34;
      const bx = (CANVAS_W - bw) / 2, by = panY + ph - 56;
      const mx = this.input.mouse.x, my = this.input.mouse.y;
      if ((this.input.mouse.clicked && mx >= bx && mx <= bx + bw && my >= by && my <= by + bh) ||
          this.input.isJustDown('KeyU') || this.input.p1JustDown('place') ||
          this.input.p1JustDown('jump') || this.input.p1JustDown('menu')) {
        this._witherVictoryScreen = false;
      }
    }

    // ── E key: open/close nearest chest (intercept before crafting menu) ──
    const eNow = this.input.isDown('KeyE');
    if (eNow && !this._eChestWas && !this.craftingMenu.open) {
      if (this._chestOpen) {
        this._closeChest();
      } else {
        const ch = this._nearestChest();
        if (ch) {
          this._chestOpen     = ch;
          this._chestModalSel = 0;
          this.inventoryOpen  = true;
          this.craftingMenu._eWasDown = true;  // consume E so crafting menu ignores it
          this._playSound('sounds/chest-open.mp3');
          // Show open-lid state
          this.level.set(ch.row, ch.col, BLOCK.CHEST);  // triggers redraw with state.open=true
        }
      }
    }
    this._eChestWas = eNow;

    // ── I key: toggle inventory / sandbox palette (disabled in platformer) ──
    const iDown = this.input.isDown('KeyI');
    if (iDown && !this._iKeyWas && this.gameMode !== 'platformer' && this.gameMode !== 'speedrunner') {
      if (this.gameMode === 'sandbox' && this.sandbox) {
        this.sandbox.togglePalette();
      } else {
        this.inventoryOpen = !this.inventoryOpen;
        if (!this.inventoryOpen) this._returnHeldItem();
      }
    }
    this._iKeyWas = iDown;

    // ── P2 Home key: toggle inventory (normal mode only) ──────
    if (this.player2 && this.gameMode === 'normal' && this.input.isP2Inventory()) {
      this.inventoryOpen = !this.inventoryOpen;
      if (!this.inventoryOpen) this._returnHeldItem();
    }

    // Sandbox palette/popup: handle clicks and freeze gameplay
    if (this.gameMode === 'sandbox' && this.sandbox) {
      if (this.sandbox.paletteOpen) {
        // Scroll wheel switches the active hotbar slot while the palette is open
        // (the palette itself is sized to show every item without scrolling).
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
              // Ruined portals are an obsidian frame (+ optional NETHER_PORTAL interior)
              // tracked in _ruinedPortals/_portalObsidianCells — the block-BFS below
              // only clears NETHER_PORTAL_FRAME/NETHER_PORTAL, so ruined ones need their
              // own cleanup or the obsidian would be left behind.
              if (p.ruined) this._removeRuinedPortal(p.anchorRow, p.anchorCol);
              else          this._sandboxRemovePortal(p.anchorRow + 1, p.anchorCol + 1);
              this._notify(p.ruined ? 'Ruined portal deleted' : 'Portal removed', '#AACCFF', 180);
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
      // Platformer chest: direction keys/dpad navigate buttons; confirm = Equip&Take or Leave
      if (this.gameMode === 'platformer' && this._chestOpen) {
        const navLeft  = this.input.isJustDown('ArrowLeft')  || this.input.p1JustDown('dpad3') || this.input.p2JustDown('dpad3');
        const navRight = this.input.isJustDown('ArrowRight') || this.input.p1JustDown('dpad1') || this.input.p2JustDown('dpad1');
        if (navLeft)  this._chestModalSel = 0;
        if (navRight) this._chestModalSel = 1;
        const confirm = this.input.isJustDown('KeyU') || this.input.isJustDown('KeyE') ||
                        this.input.isJustDown('Space') ||
                        this.input.p1JustDown('place') || this.input.p1JustDown('jump') || this.input.p1JustDown('attack') ||
                        this.input.p2JustDown('place') || this.input.p2JustDown('jump') || this.input.p2JustDown('attack');
        if (confirm) {
          if (this._chestModalSel === 0) this._platChestTakeAll();
          this._closeChest(); return;
        }
        if (this.input.isJustDown('Escape') || this.input.p1JustDown('crouch') || this.input.p2JustDown('crouch')) {
          this._closeChest(); return;
        }
      }
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
      this._playSound('sounds/crafting-item.mp3');
    }
    if (this.craftingMenu.open) return;

    // ── Notification decay ──────────────────────────────────
    this.notifications = this.notifications.filter(n => { n.life--; return n.life > 0; });

    // ── World Settings toggle (sandbox only, P key) ──────────────
    // Default: the unified HTML panel. Classic canvas panel stays behind the
    // Konami "classic menu" (_useClassicPause) as a bonus.
    if (this.gameMode === 'sandbox' && this.input.isJustDown('KeyP')) {
      if (this._useClassicPause || typeof WORLD_SETTINGS === 'undefined') {
        this._worldSettingsOpen = !this._worldSettingsOpen;
      } else if (WORLD_SETTINGS.isOpen()) {
        WORLD_SETTINGS.close();
      } else {
        WORLD_SETTINGS.open(this);
      }
    }

    // ── H key: hyper speed cycle — Normal → 3× → 6× → Normal (sandbox / god mode only) ──
    if (this.input.isJustDown('KeyH')) {
      if (this.gameMode === 'sandbox' || this.player.godMode) {
        const p = this.player;
        p.hyperLevel      = (p.hyperLevel + 1) % 3;
        p.hyperSpeed      = p.hyperLevel > 0;        // keep existing 3× flag in sync
        p.speedMultiplier = p.hyperLevel === 2 ? 2 : 1; // stacks on top → 6× at level 2
        const msg = ['Hyper Speed OFF', 'Hyper Speed ON ⚡ (3×)', '2× Hyper Speed ⚡⚡ (6×)'][p.hyperLevel];
        this._notify(msg, p.hyperLevel ? '#FFDD44' : '#888888', 150);
      } else {
        this._notify('Hyper Speed requires God Mode', '#888888', 120);
      }
    }

    // ── X key: phase-through-blocks toggle (sandbox / god mode only) ──
    if (this.input.isJustDown('KeyX')) {
      if (this.gameMode === 'sandbox' || this.player.godMode) {
        this.player.canPhaseThrough = !this.player.canPhaseThrough;
        this._notify(
          this.player.canPhaseThrough ? 'Phase-Through ON 👻' : 'Phase-Through OFF',
          this.player.canPhaseThrough ? '#B084FF' : '#888888', 150
        );
      } else {
        this._notify('Phase-Through requires God Mode', '#888888', 120);
      }
    }

    // ── God Mode invariant: phase-through + hyper speed reset when god mode is off ──
    if (!this.player.godMode) {
      this.player.canPhaseThrough = false;
      if (this.player.hyperLevel !== 0) {
        this.player.hyperLevel      = 0;
        this.player.hyperSpeed      = false;
        this.player.speedMultiplier = 1;
      }
    }

    // ── Z: cycle manual zoom override (sandbox editor or God mode) ──
    // Plain Z (Ctrl+Z stays Undo) steps 100→200→300→400% then back to the
    // world's prescribed default zoom. Works in every mode while editing/God.
    if (this._zoomOverrideAllowed() && this.input.isJustDown('KeyZ')
        && !this.input.isDown('ControlLeft') && !this.input.isDown('ControlRight')) {
      this._zoomOverrideIdx = (this._zoomOverrideIdx + 1) % 5;
      this._zoomOverride = [0.25, 0.6, 1.0, 1.5, null][this._zoomOverrideIdx];
      const pct = this._zoomOverride == null ? 'Default' : `${Math.round(this._zoomOverride * 100)}%`;
      this._notify(`Zoom: ${pct}`, '#7ec8e3', 90);
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
      // D-Pad: quick-select hotbar slots 0–3
      if (this.input.p1JustDown('dpad0')) this.player.selectedSlot = 0;
      if (this.input.p1JustDown('dpad1')) this.player.selectedSlot = 1;
      if (this.input.p1JustDown('dpad2')) this.player.selectedSlot = 2;
      if (this.input.p1JustDown('dpad3')) this.player.selectedSlot = 3;
      // LB: previous hotbar slot
      if (this.input.p1JustDown('prevSlot')) {
        this.player.selectedSlot = (this.player.selectedSlot - 1 + 9) % 9;
      }
    }

    // Sandbox-only controller mappings (Phase 11K-2)
    if (this.gameMode === 'sandbox' && this.sandbox) {
      const p1Slot = this.input.p1GpSlot >= 0 ? this.input.p1GpSlot : 0;
      const gp0    = this.input.gamepads[p1Slot];
      const ltNow  = gp0?.triggerL > 0.5;
      const rtNow  = gp0?.triggerR > 0.5;
      if (ltNow && !this._ltWasDown) this._historyUndo();
      if (rtNow && !this._rtWasDown) this._historyRedo();
      this._ltWasDown = ltNow;
      this._rtWasDown = rtNow;
      // Y button → toggle sandbox palette (only when no context action is available)
      // Context action is computed later at _computeContextAction(); palette is the fallback.
    }

    // ── Secondary-player gamepad hotbar (Phase 12/3B) ─────
    for (let i = 1; i < this.players.length; i++) {
      const p = this.players[i];
      if (!p || this._respawnTimers[i] > 0) continue;
      if (this.input.pJustDown(i, 'dpad0')) p.selectedSlot = 0;
      if (this.input.pJustDown(i, 'dpad1')) p.selectedSlot = 1;
      if (this.input.pJustDown(i, 'dpad2')) p.selectedSlot = 2;
      if (this.input.pJustDown(i, 'dpad3')) p.selectedSlot = 3;
      if (this.input.pJustDown(i, 'prevSlot')) p.selectedSlot = (p.selectedSlot - 1 + 9) % 9;
      if (this.input.pJustDown(i, 'context'))  p.selectedSlot = (p.selectedSlot + 1) % 9;
      // Secondary Y button handled after _computeContextAction below
    }

    // ── Player movement / weapon toggle ────────────────────
    // Apply controller sensitivity and deadzone so moveX() scales analog stick correctly
    this.input.controllerSensitivity    = this._worldAdvSettings.controllerSensitivity    ?? 1.0;
    this.input.controllerAimSensitivity = this._worldAdvSettings.controllerAimSensitivity ?? 1.0;
    this.input.controllerDeadzone       = this._worldAdvSettings.controllerDeadzone       ?? GP_DEADZONE_STICK;
    // Sync player input slots from ControllerConfig each frame (P1-P4)
    if (typeof ControllerConfig !== 'undefined') {
      this.input.p1GpSlot = ControllerConfig.getAssignment(1);
      this.input.p2GpSlot = ControllerConfig.getAssignment(2);
      this.input.p3GpSlot = ControllerConfig.getAssignment(3);
      this.input.p4GpSlot = ControllerConfig.getAssignment(4);
      // Per-player controller tuning (each controller user's own sensitivity /
      // aim / deadzone) — authoritative over the single global values above.
      for (let i = 0; i < 4; i++) {
        this.input.playerSensitivity[i]    = ControllerConfig.getSensitivity(i + 1);
        this.input.playerAimSensitivity[i] = ControllerConfig.getAimSensitivity(i + 1);
        this.input.playerDeadzone[i]       = ControllerConfig.getDeadzone(i + 1);
      }
    }
    // Single-player: both keyboard and any connected gamepad drive P1 simultaneously.
    // Disabled in co-op/arena multiplayer and online games for per-player isolation.
    this.input.dualInput = this.activePlayers().length <= 1 && !this._onlineGameId;
    // Sync XP speed boost flag to all local players
    for (const p of this.activePlayers()) p.xpSpeedDisabled = !!this._worldAdvSettings.disableXpSpeedBoost;

    // ── P1 respawn timer (2P co-op / arena) ────────────────
    if (this._p1RespawnTimer > 0) {
      this._p1RespawnTimer--;
      if (this._p1RespawnTimer === 0) {
        const rx = this.isArena ? this._arenaSpawns.p1.x : (this.player2 ? this.player2.x + BLOCK_SIZE : this.player.x);
        const ry = this.isArena ? this._arenaSpawns.p1.y : (this.player2 ? this.player2.y : this.player.y);
        this.player.respawnAt(rx, ry);
        this._notify(this.isArena ? 'Respawned!' : 'Player 1 rejoins!', '#FFD700', 120);
      }
    } else {
      this._applyMovementConfig(this.player);
      this.player.update(this.input, this.level);
    }
    this._playMovementSfx(this.player);   // Smart Mobs §4 — footstep + landing SFX

    // Phase 17: Speed Runner post-update (boost multipliers, collision, ghost)
    if (this.gameMode === 'speedrunner') this._updateSpeedRunner();

    // ── Secondary players (P2-P4) update ───────────────────
    // P1 is the full-featured keyboard/mouse player; P2-P4 are gamepad
    // combatants (Phase 3B — arena; co-op keeps only P2). Movement/jump/
    // attack via generic per-index input; combat handled in the weapon block.
    const spawnKeys = ['p1', 'p2', 'p3', 'p4'];
    for (let i = 1; i < this.players.length; i++) {
      const p = this.players[i];
      if (!p) continue;
      if (this._respawnTimers[i] > 0) {
        this._respawnTimers[i]--;
        if (this._respawnTimers[i] === 0) {
          const sp = this._arenaSpawns[spawnKeys[i]] || { x: this.player.x - BLOCK_SIZE, y: this.player.y };
          const rx = this.isArena ? sp.x : this.player.x - BLOCK_SIZE;
          const ry = this.isArena ? sp.y : this.player.y;
          p.respawnAt(rx, ry);
          this._notify(this.isArena ? `P${i + 1} respawned!` : `Player ${i + 1} rejoins!`, '#88AAFF', 120);
        }
        continue;
      }
      const idx = i;
      const pInput = {
        isLeft:   () => this.input.pLeft(idx),
        isRight:  () => this.input.pRight(idx),
        isJump:   () => this.input.pJump(idx),
        isCrouch: () => this.input.pCrouch(idx),
        isRun:    () => false,
        isAttack: () => this.input.pAttack(idx),
        moveX:    () => this.input.pMoveX(idx),
      };
      this._applyMovementConfig(p);
      p.update(pInput, this.level);
    }
    // Resolve pairwise collisions among all live players so they don't overlap.
    { const live = this.activePlayers();
      for (let a = 0; a < live.length; a++)
        for (let b = a + 1; b < live.length; b++)
          this._resolvePlayerCollision(live[a], live[b]); }

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
    if (this._p1RespawnTimer === 0 && this.level.get(pMidRow, pMidCol) === BLOCK.LAVA && !this.player.godMode && this.player.hp > 0) {
      this.player.hp = 0;
      this._triggerDeath('Burned by lava');
    }

    // ── End void: instant kill when below bedrock floor or in void transition zone ────
    if (this._p1RespawnTimer === 0 && !this.player.godMode && this.player.hp > 0) {
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

    // ── Secondary-player physics hazards (Phase 12/3B) ────
    for (let i = 1; i < this.players.length; i++) {
      const p = this.players[i];
      if (!p || this._respawnTimers[i] > 0) continue;
      const feetRow = Math.floor((p.y + p.height) / BLOCK_SIZE);
      const feetCol = Math.floor(p.cx / BLOCK_SIZE);
      const midRow  = Math.floor(p.cy / BLOCK_SIZE);
      const midCol  = Math.floor(p.cx / BLOCK_SIZE);
      // Soul sand
      if (this.level.get(feetRow, feetCol) === BLOCK.SOUL_SAND ||
          this.level.get(feetRow - 1, feetCol) === BLOCK.SOUL_SAND) {
        p.vx *= 0.6;
      }
      // Lava
      if (this.level.get(midRow, midCol) === BLOCK.LAVA && !p.godMode && p.hp > 0) {
        p.hp = 0;
        this._triggerSecondaryDeath(i, 'Burned by lava');
      }
      // Void
      if (!p.godMode && p.hp > 0) {
        if (midCol >= BIOME_END_START && feetRow > END_FLOOR_ROW + 1) {
          p.hp = 0;
          this._triggerSecondaryDeath(i, 'Fell into the void');
        } else if (midCol >= 480 && midCol <= 499 && feetRow > 35) {
          p.hp = 0;
          this._triggerSecondaryDeath(i, 'Fell into the void');
        }
      }
    }

    // Online joiner flag: host-authoritative mob sync; computed once per tick
    const _isOnlineJoiner = !!(this._onlineGameId && window.multiplayerManager?.isConnected && !window.multiplayerManager?.isCreator);
    // Mob simulation is host-only. This is true for any non-host in an online
    // game — including the pre-connection window before isCreator is known —
    // so a joiner can NEVER spawn/simulate local mobs (which would otherwise
    // appear as a frozen, unsynced "ghost" mob only the joiner sees).
    const _onlineNonHost = !!(this._onlineGameId && !window.multiplayerManager?.isCreator);

    // ── Cursor world position ──────────────────────────────
    // Resolve zoom + camera first so the grid cell we mine/place into matches
    // exactly what the highlight is drawn on under the current zoom.
    this._syncViewTransform();
    const world    = this.camera.toWorld(this.input.mouse.x, this.input.mouse.y);
    const hoverCol = Math.floor(world.x / BLOCK_SIZE);
    const hoverRow = Math.floor(world.y / BLOCK_SIZE);
    const target   = this.level.get(hoverRow, hoverCol);

    // ── Weapon actions: bow / sword / pickaxe ─────────────
    // CTF: carrying a flag disables all combat (no attack / no shield) (§6).
    const p1CarryingFlag = (typeof CTF_SYSTEM !== 'undefined' && CTF_SYSTEM.isCarrying(this.player));
    // A left-click that would start MINING shouldn't also swing the sword.
    const p1OverMineable = this._miningEnabled && target !== BLOCK.AIR &&
                           !(hoverCol >= 285 && hoverCol <= 314) &&
                           !this._portalObsidianCells.has(`${hoverCol},${hoverRow}`);
    // Cancel bow draw if player switched off bow slot (or is carrying a flag)
    if ((this.player.weaponMode !== 'bow' || p1CarryingFlag) && this.player.bowDrawing) {
      this.player.bowDrawing   = false;
      this.player.drawProgress = 0;
    }
    if (this._p1RespawnTimer === 0 && !p1CarryingFlag && this.player.weaponMode === 'bow') {
      // Hold click/Space to charge; release to fire
      const hasArrows = this._worldAdvSettings.unlimitedArrows || this.player.countItem(BLOCK.ARROW) > 0;
      const aimDown = this.input.isAttack() || this.input.mouse.down;
      if (aimDown && hasArrows) {
        this.player.bowDrawing   = true;
        // Track whether this draw is mouse-aimed (mouse held) vs keyboard (Space).
        if (this.input.mouse.down) this.player.bowMouseAim = true;
        else if (this.input.isAttack()) this.player.bowMouseAim = false;
        // Phase 3A.2 — FIRE_RATE power-up charges the bow faster (_fireRateMult).
        this.player.drawProgress = Math.min(1, this.player.drawProgress + (1 / BOW_CHARGE_FRAMES) * (this.player._fireRateMult || 1));
      } else if (aimDown && !hasArrows) {
        // Cancel any in-progress draw — no arrows
        this.player.bowDrawing   = false;
        this.player.drawProgress = 0;
      } else if (this.player.bowDrawing) {
        const charge = this.player.drawProgress;
        const speed  = BOW_MIN_SPEED + (BOW_MAX_SPEED - BOW_MIN_SPEED) * charge;
        // Free-aim toward the cursor when aiming with the mouse (or a gamepad);
        // pure-keyboard draws (Space, no mouse) snap-aim from the movement keys.
        const freeAim = this.player.bowMouseAim || this.input.p1GpSlot >= 0;
        const angle = freeAim
          ? Math.atan2(world.y - this.player.cy, world.x - this.player.cx)
          : this._snapAimAngle(this.player, this.input.isJump(), this.input.isCrouch());
        const rt = this._rangedTraits(this.player);   // Smart Mobs §2 (Crossbow = pierce)
        this.mobManager.addPlayerArrow(
          this.player.cx, this.player.cy,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          Math.max(1, Math.round(PLAYER_ARROW_DAMAGE * (rt.dmgMult || 1))),
          'p1',
          { pierce: rt.pierce }
        );
        this._playSound('sounds/bow-fire.mp3');
        if (!this._worldAdvSettings.unlimitedArrows) this._consumeArrow();
        this.player.bowDrawing   = false;
        this.player.drawProgress = 0;
      }
    } else if (this._p1RespawnTimer === 0 && !p1CarryingFlag && this.player.weaponMode === 'sword') {
      // ── Melee (sword/spear/axe/trident) ──
      const traits = this._meleeTraits(this.player);   // Smart Mobs §2
      // Trident throw (Q / right-click / gamepad R3): fly out, damage, auto-return
      // (loyalty-style). While it's out the melee thrust is disabled until it returns.
      if (this.player.meleeClass === 'trident' && traits.throwable && !this.player._tridentOut &&
          this.player.attackCooldown === 0 && this.input.isThrow()) {
        let angle;
        if (this.input.p1GpSlot >= 0) {
          const gp = this.input.gamepads[this.input.p1GpSlot], m = Math.hypot(gp.aimX, gp.aimY);
          angle = m > 0.2 ? Math.atan2(gp.aimY, gp.aimX) : (this.player.facing > 0 ? 0 : Math.PI);
        } else {
          angle = Math.atan2(world.y - this.player.cy, world.x - this.player.cx);
        }
        const dmg = Math.max(1, Math.round(this.player.weaponDamage * (traits.dmgMult || 1) * 1.3));
        this.player._tridentArrow = this.mobManager.addPlayerArrow(
          this.player.cx, this.player.cy, Math.cos(angle) * 18, Math.sin(angle) * 18, dmg, 'p1', { trident: true });
        this.player._tridentOut = true;
        this.player.attackCooldown = Math.round(ATTACK_COOLDOWN * (traits.cooldownMult || 1));
        this.player.swingTimer = 15;
        this._playSound('sounds/bow-fire.mp3');
      } else if (!this.player._tridentOut &&
          (this.input.isAttack() || (this.input.mouse.clicked && !p1OverMineable)) && this.player.attackCooldown === 0) {
        this.mobManager.playerAttack(this.player, 'p1', traits);
        this._playerAttackDragon();
        this._playerMeleeWither();
        // Joiner: also attack remote mobs via event
        if (_isOnlineJoiner) {
          for (const hit of this.mobManager.playerAttackRemoteCheck(this.player, window.multiplayerManager.remoteMobs))
            window.multiplayerManager.sendMobDamage(hit.mobId, hit.damage, hit.knockDir);
        }
        this.player.attackCooldown = Math.round(ATTACK_COOLDOWN * (traits.cooldownMult || 1));
        this.player.swingTimer     = 15;
        this._playSound('sounds/attack-sword.mp3');
      }
    } else if (this._p1RespawnTimer === 0 && !p1CarryingFlag && this.player.weaponMode === 'pickaxe') {
      // ── Pickaxe: Space/click also attacks mobs; mouse-hold mines (below) ──
      if ((this.input.isAttack() || this.input.mouse.clicked) && this.player.attackCooldown === 0) {
        this.mobManager.playerAttack(this.player);
        this._playerAttackDragon();
        this._playerMeleeWither();
        // Joiner: also attack remote mobs via event
        if (_isOnlineJoiner) {
          for (const hit of this.mobManager.playerAttackRemoteCheck(this.player, window.multiplayerManager.remoteMobs))
            window.multiplayerManager.sendMobDamage(hit.mobId, hit.damage, hit.knockDir);
        }
        this.player.attackCooldown = ATTACK_COOLDOWN;
        this.player.swingTimer     = 15;
      }
    }

    // ── Secondary-player weapon (bow or melee) — P2-P4 (Phase 12/3B) ──
    for (let i = 1; i < this.players.length; i++) {
      const p = this.players[i];
      if (!p || this._respawnTimers[i] > 0) continue;
      // CTF: carrying a flag disables combat (no attack / no shield) (§6).
      if (typeof CTF_SYSTEM !== 'undefined' && CTF_SYSTEM.isCarrying(p)) { p.bowDrawing = false; p.drawProgress = 0; continue; }
      const owner   = Game.ownerId(i);
      const attHeld = this.input.pAttack(i);
      if (p.bow) {
        // Free-aim with the right stick (atan2 of the stick vector) when it's
        // deflected; hold the last angle while it's centred so aim stays put
        // during a draw. Keyboard P2 falls back to snap-aim. Angle is stored on
        // the player so the on-screen reticle + the fired arrow match.
        const gp     = this.input.pGp(i);
        const aimMag = Math.hypot(gp.aimX, gp.aimY);
        if (this.input.pGpSlot(i) >= 0) {
          if (aimMag > 0.15) p._aimAngle = Math.atan2(gp.aimY, gp.aimX);
          else if (p._aimAngle == null) p._aimAngle = p.facing > 0 ? 0 : Math.PI;
        } else {
          p._aimAngle = this._snapAimAngle(p, this.input.pJump(i), this.input.pCrouch(i));
        }
        const hasArrows = this._worldAdvSettings.unlimitedArrows || p.countItem(BLOCK.ARROW) > 0;
        if (attHeld && hasArrows) {
          p.bowDrawing   = true;
          p.drawProgress = Math.min(1, p.drawProgress + (1 / BOW_CHARGE_FRAMES) * (p._fireRateMult || 1));
        } else if (attHeld && !hasArrows) {
          p.bowDrawing   = false;
          p.drawProgress = 0;
        } else if (p.bowDrawing) {
          const charge = p.drawProgress;
          const speed  = BOW_MIN_SPEED + (BOW_MAX_SPEED - BOW_MIN_SPEED) * charge;
          const angle  = p._aimAngle;
          this.mobManager.addPlayerArrow(
            p.cx, p.cy,
            Math.cos(angle) * speed, Math.sin(angle) * speed,
            PLAYER_ARROW_DAMAGE,
            owner
          );
          this._playSound('sounds/bow-fire.mp3');
          if (!this._worldAdvSettings.unlimitedArrows) this._consumeArrowForPlayer(p);
          p.bowDrawing   = false;
          p.drawProgress = 0;
        } else {
          p.bowDrawing   = false;
          p.drawProgress = 0;
        }
      } else {
        // ── Melee ──
        if (attHeld && p.attackCooldown === 0) {
          this.mobManager.playerAttack(p, owner);
          p.attackCooldown = ATTACK_COOLDOWN;
          p.swingTimer     = 15;
          this._playSound('sounds/attack-sword.mp3');
        }
      }
    }

    // ── L key: toggle nearest lever ────────────────────────
    const lDown = this.input.isDown('KeyL');
    if (lDown && !this._lKeyWas) {
      const _isJoiner = !!(this._onlineGameId && window.multiplayerManager?.isConnected && !window.multiplayerManager?.isCreator);
      if (_isJoiner) {
        // Relay to host — the host owns redstone state and syncs it back within
        // 0.5s. Toggling locally would be reverted by the next redstoneState
        // broadcast, showing as an on→off flicker from a single keypress.
        const lv = this.redstone.findNearestLever(this.player);
        if (lv) {
          window.multiplayerManager.sendRedstoneAction(lv.col, lv.row, 'toggleLever');
          this._playSound('sounds/lever.mp3', 0.7);
        }
      } else {
        const toggled = this.redstone.tryToggleLeverNear(this.level, this.player);
        if (toggled) {
          this._rsStartFromSource(toggled.col, toggled.row, toggled.on);
          this._playSound('sounds/lever.mp3', 0.7);
        }
      }
    }
    this._lKeyWas = lDown;

    // ── P2 PageDown: toggle nearest lever ─────────────────────
    if (this.player2 && this.input.isP2UseLever()) {
      const toggled = this.redstone.tryToggleLeverNear(this.level, this.player2);
      if (toggled) {
        this._rsStartFromSource(toggled.col, toggled.row, toggled.on);
        this._playSound('sounds/lever.mp3', 0.7);
      }
    }

    // ── Gamepad: context actions — must come AFTER _computeContextAction ─────
    this._computeContextAction();
    // RB: cycle hotbar right (P1)
    if (this.input.p1JustDown('context')) {
      this.player.selectedSlot = (this.player.selectedSlot + 1) % 9;
    }
    // Y button: Use Item (all modes — sandbox falls back to palette if no action available)
    if (this.input.p1JustDown('place')) {
      if (this._contextAction) {
        this._executeContextAction(this.player);
      } else if (this.gameMode === 'sandbox' && this.sandbox) {
        this.sandbox.togglePalette();
      }
    }
    for (let i = 1; i < this.players.length; i++) {
      const p = this.players[i];
      if (p && this._respawnTimers[i] === 0 && this.input.pJustDown(i, 'place')) {
        this._executeContextAction(p);
      }
    }
    // God mode cheat: hold all 4 face buttons + press Up
    {
      const slot = this.input.p1GpSlot >= 0 ? this.input.p1GpSlot : 0;
      const gp   = this.input.gamepads[slot];
      if (gp?.connected && gp.attack && gp.place && gp.jump && gp.crouch && this.input.p1JustDown('dpad0')) {
        this.player.godMode = !this.player.godMode;
        this._notify(this.player.godMode ? 'God Mode ON' : 'God Mode OFF', '#FFD700', 180);
      }
    }

    // ── Redstone update (pressure plates, TNT countdown) ───
    if (_isOnlineJoiner) {
      // Joiners skip full redstone propagation — host-synced states are authoritative.
      // Only detect which pressure plates the local player is standing on and relay changes.
      if (!this._ppCache) this._ppCache = new Map();
      const _p = this.player;
      for (const comp of this.redstone.components) {
        if (comp.type !== 'pressure_plate') continue;
        const px = comp.col * BLOCK_SIZE, py = comp.row * BLOCK_SIZE;
        const onPlate = _p.x + _p.width > px + 4 && _p.x < px + BLOCK_SIZE - 4 &&
                        Math.abs((_p.y + _p.height) - (py + BLOCK_SIZE)) < 8;
        const key = `${comp.col},${comp.row}`;
        if (this._ppCache.get(key) !== onPlate) {
          this._ppCache.set(key, onPlate);
          window.multiplayerManager.sendRedstoneAction(comp.col, comp.row, 'pressurePlate', onPlate);
        }
      }
    } else {
      // Host (or offline): run full redstone propagation, including joiner plate positions.
      const _rsExtraOn = (this._onlineGameId && window.multiplayerManager?.isCreator)
        ? (col, row) => window.multiplayerManager.joinersOnPlates?.has(`${col},${row}`) ?? false
        : null;
      this.redstone.update(this.level, this.player, this.input, _rsExtraOn);
    }
    this.redstone.updatePistonAnimations(this._rsRate());
    this._applyPistonKnockback();
    // Before TNT explodes, drop items from any chests in blast radius + play sound + visual
    for (const comp of this.redstone.components) {
      if (comp.type === 'tnt' && comp.fuse === 1) {
        this._playSound('sounds/explosion-tnt.mp3');
        const R = 3;
        const cx = (comp.col + 0.5) * BLOCK_SIZE;
        const cy = (comp.row + 0.5) * BLOCK_SIZE;
        // Larger explosion visual than creeper (3.5 vs 2.5 block radius)
        this.mobManager.explosions.push(new ExplosionEffect(cx, cy, 3.5 * BLOCK_SIZE));
        // Camera shake
        this._screenShake.intensity = 8;
        this._screenShake.frames    = 18;
        this._screenShake.maxFrames = 18;
        // Relay TNT explosion to joiners (host only). Mirrors the creeper relay
        // below — without this, joiners never saw TNT blasts.
        if (this._onlineGameId && window.multiplayerManager?.isConnected && window.multiplayerManager?.isCreator) {
          window.multiplayerManager.sendExplosion(comp.col, comp.row, R, 'sounds/explosion-tnt.mp3');
        }
        for (const ch of this._chests.values()) {
          if (Math.abs(ch.col - comp.col) <= R && Math.abs(ch.row - comp.row) <= R)
            this._dropChestItems(ch.col, ch.row);
        }
      }
    }
    // Consume mob explosion events (creeper/etc) — play sound + shake + clear
    for (const ev of this.mobManager.explosionEvents) {
      this._playSound('sounds/explosion-creeper.mp3');
      this._screenShake.intensity = 5;
      this._screenShake.frames    = 12;
      this._screenShake.maxFrames = 12;
      // Phase 17-E: relay explosion to joiners (host only)
      if (this._onlineGameId && window.multiplayerManager?.isConnected && window.multiplayerManager?.isCreator) {
        window.multiplayerManager.sendExplosion(ev.col, ev.row, ev.radius);
      }
    }
    this.mobManager.explosionEvents = [];
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
          this._playSound('sounds/eat-apple.mp3', 0.8);
          this._notify(`Ate an apple! +${healed} HP`, '#44FF44', 120);
        } else {
          this._notify('Already at full health!', '#AAFFAA', 80);
        }
      }
    }

    // ── P2 End key / Y button: Use Item context action ─────────
    if (this.player2 && this.input.isP2UseItem()) {
      this._executeContextAction(this.player2);
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
        const emIdx   = this.sandbox.hitTestEmeralds(world.x, world.y);
        const puIdx   = this.sandbox.hitTestPowerups(world.x, world.y);
        const slIdx   = this.sandbox.hitTestSpawnLines(world.x, world.y);
        const spIdx   = this.sandbox.hitTestSpawnPoints(world.x, world.y);
        const aoIdx   = this.sandbox.hitTestArenaObjs(world.x, world.y);
        if (eggIdx >= 0) {
          this.sandbox.openPopup(eggIdx);
        } else if (itemIdx >= 0) {
          this.sandbox.openItemPopup(itemIdx);
        } else if (emIdx >= 0) {
          this.sandbox.openEmeraldPopup(emIdx);
        } else if (puIdx >= 0) {
          this.sandbox.openPowerupPopup(puIdx);
        } else if (slIdx >= 0) {
          this.sandbox.openSpawnLinePopup(slIdx);
        } else if (spIdx >= 0) {
          this.sandbox.openSpawnPointPopup(spIdx);
        } else if (aoIdx >= 0) {
          this.sandbox.openArenaObjPopup(aoIdx);
        } else if (this.sandbox.hitTestHill(world.x, world.y)) {
          this.sandbox.openHillPopup();
        } else if (target === BLOCK.AIR) {
          // Empty space → place selected item type
          if (this.sandbox.isDustSelected) {
            this._notify('Redstone Dust must be placed on a solid block — click a block surface', '#CC4444', 120);
          } else if (this.sandbox.isGateSelected) {
            this._notify('Gate must be placed on a solid block — click a block surface', '#CC4444', 120);
          } else if (this.sandbox.isEggSelected) {
            this.sandbox.placeEgg(world.x, world.y);
          } else if (this.sandbox.isEmeraldSelected) {
            this.sandbox.placeEmerald(world.x, world.y);
          } else if (this.sandbox.isPowerupSelected) {
            this.sandbox.placePowerup(world.x, world.y);
          } else if (this.sandbox.isHillSelected) {
            this.sandbox.placeHill(world.x, world.y);
          } else if (this.sandbox.isSpawnLineSelected) {
            this.sandbox.placeSpawnLine(world.x, world.y);
          } else if (this.sandbox.isSpawnPointSelected) {
            if (this.sandbox.placedSpawnPoints.length >= 4) {
              this._notify('Max 4 player spawn points (one per player)', '#CC8844', 120);
            } else {
              this.sandbox.placeSpawnPoint(world.x, world.y);
            }
          } else if (this.sandbox.isArenaObjSelected) {
            this.sandbox.placeArenaObj(this.sandbox.selectedArenaObj, world.x, world.y);
          } else if (this.sandbox.isToolSelected || this.sandbox.isBlockItemSelected) {
            this.sandbox.placeItem(world.x, world.y);
          } else if (this.sandbox.isMultiBlock) {
            this._sandboxPlaceMulti(hoverRow, hoverCol);
          } else {
            const sb = this.sandbox.selectedBlock;
            if (this.sandbox.brushSize > 1 && this.sandbox.isBrushApplicable) {
              this._sandboxBrushPlace(hoverRow, hoverCol, sb);
            } else {
            // Goal star: MULTIPLE allowed (campaign-prep). A fresh goal joins the
            // colour of any goal it touches (keeps a stack/line uniform); click a
            // placed goal WITH the Goal tool to cycle the whole group's colour
            // (handled in the non-air branch below).
            this.level.set(hoverRow, hoverCol, sb);
            this._playSound('sounds/placing-block.mp3', 0.6);
            if (sb === BLOCK.GOAL) {
              this.level.goalCol = hoverCol;
              this.level.goalRow = hoverRow;
              this._setGoalColor(hoverRow, hoverCol, this._adjacentGoalColor(hoverRow, hoverCol));
              this._invalidateGoalCells();
            }
            window.multiplayerManager?.placeBlock(hoverCol, hoverRow, sb);
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
            } else if (sb === BLOCK.MUSIC_PLAYER) {
              const mpk = `${hoverCol},${hoverRow}`;
              if (!this._musicPlayerBlocks.has(mpk)) {
                this._musicPlayerBlocks.set(mpk, {
                  col: hoverCol, row: hoverRow,
                  isConfigured: false, configuredSongs: [],
                });
                this._notify('Music Player placed — right-click to configure', '#CC88FF', 140);
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
            this._playSound('sounds/lever.mp3', 0.7);
          }
        } else if (target === BLOCK.TRAPDOOR &&
                   !this.sandbox.isEggSelected && !this.sandbox.isToolSelected &&
                   this.sandbox.selectedBlock === BLOCK.TRAPDOOR) {
          // Trapdoor selected + click on placed trapdoor → toggle state
          const comp = this.redstone.getAt(hoverCol, hoverRow);
          if (comp && comp.type === 'trapdoor') {
            comp.open = !comp.open;
            this._notify(`Trap Door: ${comp.open ? 'OPEN' : 'CLOSED'}`, '#C8A558', 80);
            this._playSound('sounds/trapdoor.mp3', 0.65);
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
        } else if (target === BLOCK.GOAL && this.sandbox.selectedBlock === BLOCK.GOAL &&
                   !this.sandbox.isEggSelected && !this.sandbox.isToolSelected &&
                   !this.sandbox.isEmeraldSelected && !this.sandbox.isPowerupSelected &&
                   !this.sandbox.isDustSelected && !this.sandbox.isGateSelected &&
                   !this.sandbox.isBlockItemSelected && !this.sandbox.isHillSelected &&
                   !this.sandbox.isSpawnLineSelected && !this.sandbox.isSpawnPointSelected &&
                   !this.sandbox.isArenaObjSelected) {
          // Goal Star selected + click a placed goal → cycle the whole touching
          // group's colour (select a DIFFERENT block/tool, then click, to remove).
          this._cycleGoalGroupColor(hoverRow, hoverCol);
        } else {
          // Non-air block → instant remove (connected removal for beds/portals)
          if (this.sandbox.brushSize > 1 && this.sandbox.isBrushApplicable) {
            this._sandboxBrushRemove(hoverRow, hoverCol);
          } else {
            this._sandboxRemoveBlock(hoverRow, hoverCol, target);
            window.multiplayerManager?.breakBlock(hoverCol, hoverRow);
          }
        }
      }
      } // end else (not altClicked)
      this._historyCommit();
      } // end else (normal click path)
    }

    // ── Sandbox: right-click on placed egg → open World Settings for that mob ──
    if (isSandbox && this.input.mouse.rightClicked && !_sbHotbarConsumed) {
      const eggIdx = this.sandbox.hitTestEggs(world.x, world.y);
      if (eggIdx >= 0) {
        const egg = this.sandbox.placedEggs[eggIdx];
        if (egg) {
          this._wsHighlightMobKey = egg.mobType;
          this._worldSettingsOpen = true;
        }
      }
    }

    // ── Music Player: right-click to open UI (all modes) ──────────────────────
    if (this.input.mouse.rightClicked && !this._musicPlayerUI) {
      const mp = this._nearMusicPlayer();
      if (mp) this._openMusicPlayerUI(mp);
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
      const _itemBeforePlace = this.player.selectedItem;
      const placed = this._tryPlace(hoverRow, hoverCol);
      if (placed) {
        this._checkPortalCompletion();
        if (_itemBeforePlace) window.multiplayerManager?.placeBlock(hoverCol, hoverRow, _itemBeforePlace.type);
      }
    }

    // ── Hold mouse: mine. Mining is always-active where _miningEnabled (Normal
    // mode; a future Arena mode can enable it) — no pickaxe slot to select; it
    // uses the player's best owned pickaxe. Holding over a mineable block mines.
    const isWallCol = hoverCol >= 285 && hoverCol <= 314;
    const canMine   = this._miningEnabled &&
                      this.input.mouse.down   &&
                      target !== BLOCK.AIR    &&
                      !isWallCol              &&
                      !this._portalObsidianCells.has(`${hoverCol},${hoverRow}`);
    this.player._mining = !!canMine; // drives the pickaxe arm while mining

    if (canMine) {
      this.level.startBreaking(hoverRow, hoverCol);
    } else if (this._miningEnabled) {
      this.level.stopBreaking();
      this._tooWeakNotified = false;
    }

    if (this._miningEnabled) {
      const mineResult = this.level.updateBreaking(
        this.player.cx, this.player.cy,
        this.player.pickaxeTier, this.player.pickaxeSpeed
      );
      if (mineResult?.broken) {
        this._playSound('sounds/mining.mp3');
        window.multiplayerManager?.breakBlock(hoverCol, hoverRow);
        if (mineResult.blockType === BLOCK.GOAL) {
          this.level.goalCol = -1;
          this.level.goalRow = -1;
          this._setGoalColor(hoverRow, hoverCol, 0);
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
    // _isOnlineJoiner computed near top of _update(); reused here.
    if (!isSandbox) {
      const _dn = this._dayNight;
      const _aws = this._worldAdvSettings;
      // Night spawn boost: timer multiplier = 1/rate (rate 2 ⇒ 0.5 = twice as often).
      this.mobManager.nightSpawnMultiplier = (!_dn.isDay && _aws.nightSpawnBoost)
        ? 1 / Math.max(1, _aws.nightSpawnRate || 2) : 1.0;
      this.mobManager.fullMoonActive       = (!_dn.isDay && _dn.nightPhase === 3 && _aws.fullMoonHpBoost);
      this.mobManager.fullMoonHpMult       = _aws.fullMoonHpAmount || 1.5;
      // Online host: give mob AI stubs for joiner positions so mobs chase all players
      if (this._onlineGameId && window.multiplayerManager?.isCreator) {
        this.mobManager.onlinePlayers = Object.entries(window.multiplayerManager.otherPlayers)
          .filter(([, p]) => p.hp > 0)
          .map(([pid, p]) => ({
            x: p.x, y: p.y, hp: p.hp, iFrames: 0,
            width: PLAYER_W, height: PLAYER_H,
            crouching: false, hasShield: false, _playerId: pid, _pendingDamage: null,
            get cx() { return this.x + PLAYER_W / 2; },
            get cy() { return this.y + PLAYER_H / 2; },
            takeDamage(amount, dir) { if (!this._pendingDamage) this._pendingDamage = { amount, dir }; },
          }));
      } else {
        this.mobManager.onlinePlayers = [];
      }
      const hpBefore = this.player.hp;
      if (!_onlineNonHost) {
        this.mobManager.update(this.player, this.level, this.player2 || null, this.players.slice(2).filter(Boolean));
      } else {
        // Joiners skip mob AI but still need item physics so drops settle and stay visible.
        this.mobManager.droppedItems = this.mobManager.droppedItems.filter(item => {
          item.update(this.level);
          return item.alive;
        });
        // Explosion visuals (TNT/creeper) arrive via the 'explosion' socket event
        // and are pushed to mobManager.explosions. Since mobManager.update() is
        // skipped here, tick their lifetimes so they fade out instead of
        // lingering forever on the joiner's screen.
        if (Array.isArray(this.mobManager.explosions)) {
          this.mobManager.explosions = this.mobManager.explosions.filter(e => { e.life--; return e.life > 0; });
        }
      }
      const dmgTaken = hpBefore - this.player.hp;

      // Online host: relay pending damage from mob AI to joiners; check arrows vs joiners
      if (this._onlineGameId && window.multiplayerManager?.isCreator) {
        const mgr = window.multiplayerManager;
        for (const stub of this.mobManager.onlinePlayers) {
          if (stub._pendingDamage) {
            mgr.sendRemotePlayerDamaged(stub._playerId, stub._pendingDamage.amount, stub._pendingDamage.dir);
            stub._pendingDamage = null;
          }
        }
        // Arrow hits on joiners (arrows only check local player in update; check joiners here)
        for (const stub of this.mobManager.onlinePlayers) {
          this.mobManager.arrows = this.mobManager.arrows.filter(a => {
            if (!a.alive || a.isPlayerArrow) return a.alive;
            if (a.x > stub.x && a.x < stub.x + PLAYER_W &&
                a.y > stub.y && a.y < stub.y + PLAYER_H) {
              mgr.sendRemotePlayerDamaged(stub._playerId, a.damage, Math.sign(a.vx));
              a.alive = false; return false;
            }
            return true;
          });
        }
      }
      if (dmgTaken > 0) {
        this.mobManager.addPlayerDamageNum(this.player, dmgTaken);
        this._playSound('sounds/player-damaged.mp3');
        this._checkDeath();
      }
      // Online JOINERS receive mob damage via the host-relayed 'remotePlayerDamaged'
      // socket event, which lands outside the local dmgTaken accounting above — so
      // the death check never ran and joiners couldn't die at 0 HP. Check here each
      // frame (idempotent: _triggerDeath no-ops once already dead/respawning).
      if (this._onlineGameId && window.multiplayerManager && !window.multiplayerManager.isCreator) {
        this._checkDeath();
      }

      // ── Secondary-player mob damage pass (Phase 12/3B) — P2-P4 ──
      for (let pi = 1; pi < this.players.length; pi++) {
        const sp = this.players[pi];
        if (!sp || this._respawnTimers[pi] > 0) continue;
        const spHpBefore = sp.hp;
        for (const mob of this.mobManager.mobs) {
          if (!mob.alive || mob.iFrames > 0) continue;
          // Contact damage
          if (mob.attackTimer !== undefined) {
            if (mob.attackTimer === 0 && mob._touchesPlayer(sp)) {
              sp.takeDamage(mob.meleeDamage, Math.sign(sp.cx - mob.cx));
              mob.attackTimer = MOB_ATTACK_RATE;
            }
          } else {
            // Mobs without attackTimer (CaveSpider) — use iFrames gate only
            if (sp.iFrames === 0 && mob._touchesPlayer(sp)) {
              sp.takeDamage(mob.meleeDamage, Math.sign(sp.cx - mob.cx));
            }
          }
        }
        // Enemy arrow damage
        for (const arr of this.mobManager.arrows) {
          if (!arr.active) continue;
          const ax = arr.x, ay = arr.y;
          if (ax >= sp.x && ax <= sp.x + sp.width &&
              ay >= sp.y && ay <= sp.y + sp.height) {
            sp.takeDamage(2, Math.sign(arr.vx));
            arr.active = false;
          }
        }
        const spDmgTaken = spHpBefore - sp.hp;
        if (spDmgTaken > 0) {
          this.mobManager.addPlayerDamageNum(sp, spDmgTaken);
          this._playSound('sounds/player-damaged.mp3');
        }
        // Death check runs EVERY frame (mob-melee + enemy-arrow + PvP damage are
        // applied inside mobManager.update() before spHpBefore is captured here).
        if (sp.hp <= 0 && !sp.godMode) this._triggerSecondaryDeath(pi, 'Defeated');
        // Item collection
        const spCollected = this.mobManager.collectDropsNear(sp);
        for (const { itemKey, amount } of spCollected) {
          if (typeof itemKey === 'string') {
            if (this.gameMode === 'platformer' && (ARMOR_DATA[itemKey] || TOOL_DATA[itemKey])) {
              const dx = sp.x + sp.width / 2;
              const dy = sp.y;
              if (!this._platEquipItem(sp, itemKey, dx, dy)) {
                this.mobManager.dropItems([{ x: dx, y: dy, itemKey, amount: 1, pickupDelay: 90 }]);
              }
            }
          } else {
            for (let k = 0; k < amount; k++) sp.addBlock(itemKey);
          }
        }
      }

      // ── Collect dropped items ──────────────────────────────
      const collected = this.state !== 'dead'
        ? this.mobManager.collectDropsNear(this.player)
        : [];
      if (collected.length > 0) this._playSound('sounds/item-collected.mp3', 0.7);
      for (const { itemKey, amount } of collected) {
        if (typeof itemKey === 'string') {
          if (itemKey.startsWith('disc:')) {
            this._collectMusicDisc(itemKey.slice(5));
          } else if (this.gameMode === 'platformer' && (ARMOR_DATA[itemKey] || TOOL_DATA[itemKey])) {
            const dx = this.player.x + this.player.width / 2;
            const dy = this.player.y;
            if (!this._platEquipItem(this.player, itemKey, dx, dy)) {
              // Rejected (same/worse) — return to world so another player can grab it
              this.mobManager.dropItems([{ x: dx, y: dy, itemKey, amount: 1, pickupDelay: 90 }]);
            }
          } else if (ARMOR_DATA[itemKey]) {
            this.player.addArmorItem(itemKey);
          } else if (TOOL_DATA[itemKey]) {
            const td = TOOL_DATA[itemKey];
            if (td.type === 'pickaxe')    this.player.pickaxe = itemKey;
            else if (td.type === 'bow')   this.player.bow     = itemKey;
            else                          this.player.sword   = itemKey;
          }
        } else {
          for (let i = 0; i < amount; i++) this.player.addBlock(itemKey);
          if (itemKey === BLOCK.BLAZE_ROD) this.player.discoveredOres.add(BLOCK.BLAZE_ROD);
        }
      }
      // ── Periodic mob sounds ────────────────────────────────
      this._mobSoundTimer++;
      if (this._mobSoundTimer >= 300) {
        this._mobSoundTimer = 0;
        this._playNearbyMobSound();
      }
      // ── Boss/Nether/Victory music state machine ───────────────
      const playerCol   = Math.floor(this.player.x / BLOCK_SIZE);
      const playerInEnd = playerCol >= BIOME_END_START;
      const inNether    = playerCol >= BIOME_CAVE_END && playerCol < BIOME_END_START;
      // dragonAlive: true only when player is in End AND dragon is alive (not yet in defeat animation)
      // Omitting state !== 'defeated' check keeps it true during the 4-s defeat animation so
      // _endBossMusic() never fires early — _playVictoryMusic() handles the transition.
      const dragonAlive = playerInEnd && this._dragon && this._dragon.isAlive;
      const ms          = this._musicSystem;

      // Don't re-trigger music transitions while the player is on the death screen
      if (this.state !== 'dead') {
        if (dragonAlive && !ms.bossMusicActive && !ms.victoryMusicActive) {
          // Dragon fight takes priority — stop Nether/Wither music if running
          if (ms.netherMusicActive)  { ms.netherMusicActive  = false; ms.lastNormalTrack = null; }
          if (ms.witherMusicActive)  { ms.witherMusicActive  = false; }
          this._startBossMusic();
        } else if (playerInEnd && this._dragon && !dragonAlive && ms.bossMusicActive && !ms.victoryMusicActive) {
          this._endBossMusic();
        } else if (inNether && !ms.netherMusicActive && !ms.bossMusicActive && !ms.witherMusicActive && !ms.victoryMusicActive) {
          this._startNetherMusic();
        } else if (!inNether && ms.netherMusicActive && !ms.bossMusicActive) {
          this._stopNetherMusic();
        }
        // Stop Wither music if Wither is gone and player left arena
        if (ms.witherMusicActive && !this._witherBoss) {
          this._endWitherMusic();
        }
      }
    }

    // ── Collect placed tool/weapon/armor items (platformer + normal) ──
    if (this.gameMode === 'platformer' || this.gameMode === 'normal') {
      const _online = !!(this._onlineGameId && window.multiplayerManager?.isConnected);
      for (let i = 0; i < this._platformerItems.length; i++) {
        const it = this._platformerItems[i];
        if (it.collected || it._claimPending) continue;
        const dx = this.player.cx - it.wx;
        const dy = (this.player.y + this.player.height / 2) - it.wy;
        if (Math.sqrt(dx * dx + dy * dy) < BLOCK_SIZE * 1.5) {
          if (_online) {
            // Server-authoritative claim (by index) so two players can't both
            // collect the same placed item. Grant happens in onPlacedItemClaimed.
            it._claimPending = true;
            window.multiplayerManager.claimPlacedItem(i);
          } else {
            this._collectPlatformerItem(it);
          }
        }
      }

      // ── Collect emeralds (campaign-prep, opt-in per world) ──
      if (this._emeraldsActive && typeof EMERALD_SYSTEM !== 'undefined') {
        const aws = this._worldAdvSettings;
        const got = EMERALD_SYSTEM.checkPickup(this.player, () => {
          this._emeraldsCollected++;
          if (aws.platformerScore) this._score += (aws.emeraldPoints || 0);
        });
        if (got > 0) this._playSound('sounds/item-collected.mp3', 0.7);
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

    // ── F key: Sandbox save  /  Normal & Platformer bed/anchor respawn ────
    const fNow = this.input.isDown('KeyF');
    if (fNow && !this._fWas) {
      if (this.gameMode === 'sandbox') {
        this._openSaveDialog();
      } else {
        const pCol = Math.floor(this.player.cx / BLOCK_SIZE);
        const pRow = Math.floor(this.player.cy / BLOCK_SIZE);
        const inNether = pCol >= BIOME_CAVE_END && pCol < BIOME_END_START;

        // Check nearby Respawn Anchor first (works in Nether)
        let anchorFound = null;
        outer_fa: for (let dc = -2; dc <= 2; dc++) {
          for (let dr = -2; dr <= 2; dr++) {
            if (this.level.get(pRow + dr, pCol + dc) === BLOCK.RESPAWN_ANCHOR) {
              anchorFound = { col: pCol + dc, row: pRow + dr };
              break outer_fa;
            }
          }
        }
        if (anchorFound) {
          this._activeRespawnAnchor = anchorFound;
          this._activeSpawnBed = -1;
          this._playSound('sounds/use-bed.mp3', 0.8);
          this._notify('Nether respawn point set!', '#AA88FF', 220);
          if (this._sandboxLoadKey) this._saveNormalProgress();
        } else if (inNether) {
          // Bed in Nether — arm explosion fuse
          let bedPos = null;
          outer_nb: for (let dc = -3; dc <= 3; dc++) {
            for (let dr = -1; dr <= 3; dr++) {
              if (this.level.get(pRow + dr, pCol + dc) === BLOCK.BED) {
                bedPos = { col: pCol + dc, row: pRow + dr };
                break outer_nb;
              }
            }
          }
          if (bedPos && this._netherBedFuse <= 0) {
            this._netherBedFuse = 180;
            this._netherBedPos  = bedPos;
            this._notify('Beds explode in the Nether!', '#FF4444', 200);
          }
        } else if (this._sandboxLoadKey || this._platformerLoadKey) {
          // Normal/Platformer mode playing a sandbox world — set respawn at any nearby bed
          let bedAnchor = null;
          outer:
          for (let dc = -3; dc <= 3; dc++) {
            for (let dr = 0; dr <= 2; dr++) {
              const r = pRow + dr, c = pCol + dc;
              if (this.level.get(r, c) === BLOCK.BED) {
                let lc = c;
                while (lc > 0 && this.level.get(r, lc - 1) === BLOCK.BED) lc--;
                bedAnchor = { col: lc, row: r };
                break outer;
              }
            }
          }
          if (bedAnchor) {
            let idx = this.bedSpawns.findIndex(b => b.col === bedAnchor.col && b.row === bedAnchor.row);
            if (idx < 0) idx = this.bedSpawns.push(bedAnchor) - 1;
            this._activeSpawnBed = idx;
            if (this._sandboxLoadKey) this._saveNormalProgress();
            this._notify('Respawn point set!', '#FFDD44', 220);
            this._playSound('sounds/use-bed.mp3');
          } else {
            this._notify('No bed nearby — walk to a bed and press F', '#FF9944', 180);
          }
        } else {
          // Default normal mode: set spawn at pre-defined checkpoint beds
          let usedBed = false;
          for (let idx = 0; idx < this.bedSpawns.length; idx++) {
            const bed  = this.bedSpawns[idx];
            if (Math.abs(pCol - bed.col) <= 3) {
              if (idx !== this._activeSpawnBed) {
                this._activeSpawnBed = idx;
                this._notify('Spawn point set! You will respawn here.', '#FFDD44', 220);
              } else {
                this._notify('Spawn point already set here.', '#FFDD44', 120);
              }
              this._playSound('sounds/use-bed.mp3', 0.8);
              usedBed = true;
              break;
            }
          }
          if (!usedBed) {
            this._notify('No bed nearby — walk up to a bed and press F', '#FF9944', 180);
          }
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

     // DOGS admin-mode unlock (sequence: D-O-G-S)
     { const k = Object.keys(this.input.keys).find(k => this.input.isJustDown(k));
       if (k) {
         const ch = k.replace('Key','').toLowerCase();
         if ('dogs'.indexOf(ch) >= 0) {
           this._dogsBuffer.push(ch);
           if (this._dogsBuffer.length > 4) this._dogsBuffer.shift();
           if (this._dogsBuffer.join('') === 'dogs') {
             this._adminMode = true;
             localStorage.setItem('mp_admin_mode', '1');
             this._notify('Admin mode activated', '#FFD700', 180);
             this._dogsBuffer = [];
           }
         } else {
           this._dogsBuffer = [];
         }
       }
     }

    // ── G key: drop selected item (not sandbox, not god-combo) ─
    if (!godCombo && this.input.isJustDown('KeyG') &&
        this.gameMode !== 'sandbox' && !this.inventoryOpen && !this._worldSettingsOpen) {
      this._dropCurrentItem();
    }

    // ── U key: Use Item (context-sensitive) ───────────────────
    const uNow = this.input.isDown('KeyU');
    if (uNow && !this._uWas) {
      this._executeContextAction(this.player);
    }
    this._uWas = uNow;

    // ── Phase 16-B: T key — open chat (online) or teleport (god mode) ───
    const tNow  = this.input.isDown('KeyT');
    const tEdge = tNow && !this._tWas;
    if (tEdge) {
      const chatInput = document.getElementById('mp-chat-input');
      if (this._onlineGameId && chatInput && !this._worldAdvSettings.chatDisabled && document.activeElement !== chatInput) {
        chatInput.focus();
      } else if (this.player.godMode && !this._onlineGameId) {
        this._teleportMenu = !this._teleportMenu;
      }
    }
    this._tWas = tNow;

    // Handle teleport menu clicks (so input.clicked is consumed before other handlers)
    if (this._teleportMenu && this.player.godMode && this.input.mouse.clicked) {
      this._handleTeleportMenuClick(this.input.mouse.x, this.input.mouse.y);
    }

    // ── Portal cooldown tick ───────────────────────────────
    if (this.portalCooldown > 0) this.portalCooldown--;

    // ── Nether bed fuse countdown ──────────────────────────
    if (this._netherBedFuse > 0) {
      this._netherBedFuse--;
      if (this._netherBedFuse === 0 && this._netherBedPos) {
        // Trigger explosion at bed location
        this._playSound('sounds/explosion-bed.mp3');
        const { col, row } = this._netherBedPos;
        const R = 2;
        const bx = (col + 0.5) * BLOCK_SIZE, by = (row + 0.5) * BLOCK_SIZE;
        // Visual + shake (same sprite as TNT, same size)
        this.mobManager.explosions.push(new ExplosionEffect(bx, by, 3 * BLOCK_SIZE));
        this._screenShake.intensity = 7;
        this._screenShake.frames    = 15;
        this._screenShake.maxFrames = 15;
        for (let dr = -R; dr <= R; dr++) {
          for (let dc = -R; dc <= R; dc++) {
            if (dr * dr + dc * dc <= R * R) {
              const b = this.level.get(row + dr, col + dc);
              if (b !== BLOCK.BEDROCK && b !== BLOCK.AIR)
                this.level.set(row + dr, col + dc, BLOCK.AIR);
            }
          }
        }
        // Damage player if in blast radius
        if (Math.hypot(this.player.cx - bx, this.player.cy - by) <= (R + 1) * BLOCK_SIZE) {
          this.player.takeDamage(8);
        }
        this._netherBedPos = null;
      }
    }

    // ── Ender Dragon ───────────────────────────────────────
    // Boss zones share End biome (col 500+) but use row bands to discriminate:
    //   rows 40-59 → Ender Dragon arena (End Portal arrives at row 55)
    //   rows 20-39 → Wither arena       (altar teleport arrives at row 35)
    //   rows  0-19 → reserved for Warden (future)
    {
      const pCol = Math.floor(this.player.x / BLOCK_SIZE);
      const pRow = Math.floor(this.player.y / BLOCK_SIZE);
      if (pCol >= BIOME_END_START && pRow >= 40 &&
          !this._dragon &&
          !this._witherBoss && this._dragonSpritesLoaded) this._spawnDragon();
    }
    this._updateDragon();
    // Exit portal proximity check — auto-triggers when player walks into it (no U key needed)
    this._checkExitPortal();

    // ── Wither Boss ────────────────────────────────────────
    this._updateWither();

    // ── Camera ─────────────────────────────────────────────
    if (this.activePlayers().length >= 2) this.camera.followPlayers(this.activePlayers());
    else if (this.gameMode === 'speedrunner' && this._sr) this._srFollowCamera();
    else              this.camera.follow(this.player);

    // Lock camera to Wither arena when fight is active (horizontal + vertical)
    if (this._witherBoss) {
      this.camera.x = Math.max(WITHER_ARENA_MIN_COL * BLOCK_SIZE,
                       Math.min(WITHER_ARENA_MAX_COL * BLOCK_SIZE - CANVAS_W, this.camera.x));
      this.camera.y = WITHER_CAM_LOCK_Y;
    }

    // ── Clouds (only animate in plains) ───────────────────
    const playerBiome = this._playerBiome();
    if (playerBiome === 'plains') {
      for (const c of this.clouds) {
        c.x += c.sp;
        if (c.x > this.level.pixelWidth + 300) c.x = -300;
      }
    }

    // ── Win condition (not sandbox) — supports MULTIPLE goal stars. Any goal
    //    the player touches ends the level; its colour index is recorded on
    //    _wonExitColor for the future Campaign layer to route on. ────────────
    if (this.state === 'playing' && this.gameMode !== 'sandbox' && this.gameMode !== 'speedrunner') {
      for (const g of this._getGoalCells()) {
        if (this.level.get(g.row, g.col) !== BLOCK.GOAL) continue; // stale (e.g. destroyed)
        const gx = g.col * BLOCK_SIZE, gy = g.row * BLOCK_SIZE;
        if (this.player.x + this.player.width > gx &&
            this.player.x < gx + BLOCK_SIZE &&
            this.player.y + this.player.height > gy &&
            this.player.y < gy + BLOCK_SIZE) {
          if (this.gameMode === 'platformer' && this._platformerStartMs) {
            this._platformerFinishMs = Date.now() - this._platformerStartMs;
          }
          this._wonExitColor = g.color || 0;
          if (this._worldAdvSettings.platformerScore) {
            this._score += (this._worldAdvSettings.goalClearPoints || 0);
          }
          this.state = 'won';
          break;
        }
      }
    }

    // ── Void / fall death — triggers as soon as feet go below world bottom ──
    if (this.player.y + this.player.height > this.level.pixelHeight && !this.player.godMode) {
      this._triggerDeath('Fell into a pit');
    }

    // ── Phase 16: Multiplayer sync ─────────────────────────────
     if (window.multiplayerManager?.isConnected) {
       this._mpSyncTimer++;
       if (this._mpSyncTimer >= 3) {
         this._mpSyncTimer = 0;
         window.multiplayerManager.updatePosition(
           this.player.x, this.player.y, this.player.vx || 0, this.player.vy || 0,
           this.player.facing, this.player.crouching, this.player.swingTimer || 0
         );
       }
       // Sync inventory to server every 30 s (for Normal mode save + Platformer drop-on-disconnect)
       this._mpInvSyncTimer++;
       if (this._mpInvSyncTimer >= 1800) {
         this._mpInvSyncTimer = 0;
         this._syncInventoryToServer();
       }
       // Requests pickup of nearby items; the actual inventory grant happens
       // in the server-confirmed itemPickedUp handler (mgr.onItemGranted).
       window.multiplayerManager.checkPickup(this.player);
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
    if (this._onlineGameId && window.multiplayerManager?.isConnected) {
      const ch = this._chests.get(`${this._chestOpen.col},${this._chestOpen.row}`);
      if (ch) window.multiplayerManager.sendChestUpdate(ch.col, ch.row, ch.items);
    }
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

  // Platformer-mode equipment upgrade logic.
  // Returns true if itemKey was consumed (equipped), false if rejected (player already has equal/better).
  // When upgrading, the displaced old item is dropped at (dropX, dropY) with a pickup delay.
  _platEquipItem(player, itemKey, dropX, dropY) {
    if (ARMOR_DATA[itemKey]) {
      const ad  = ARMOR_DATA[itemKey];
      const cur = player.equippedArmor[ad.piece];
      const curProt = cur ? (ARMOR_DATA[cur]?.protection ?? 0) : -1;
      if (ad.protection <= curProt) return false;
      if (cur) this.mobManager.dropItems([{ x: dropX, y: dropY, itemKey: cur, amount: 1, pickupDelay: 90 }]);
      player.equippedArmor[ad.piece] = itemKey;
      this._notify(`Equipped ${ad.name}!`, ad.color ?? '#aaffaa', 180);
      return true;
    }
    if (TOOL_DATA[itemKey]) {
      const td = TOOL_DATA[itemKey];
      if (td.type === 'pickaxe') {
        const curKey  = player.pickaxe;
        const curTier = curKey ? (TOOL_DATA[curKey]?.tier ?? -1) : -1;
        if (td.tier <= curTier) return false;
        if (curKey) this.mobManager.dropItems([{ x: dropX, y: dropY, itemKey: curKey, amount: 1, pickupDelay: 90 }]);
        player.pickaxe = itemKey;
        this._notify(`Equipped ${td.name}!`, td.color ?? '#aaffaa', 180);
        return true;
      }
      if (td.type === 'sword') {
        const curKey  = player.sword;
        const curTier = curKey ? (TOOL_DATA[curKey]?.tier ?? -1) : -1;
        if (td.tier <= curTier) return false;
        if (curKey) this.mobManager.dropItems([{ x: dropX, y: dropY, itemKey: curKey, amount: 1, pickupDelay: 90 }]);
        player.sword = itemKey;
        this._notify(`Equipped ${td.name}!`, td.color ?? '#aaffaa', 180);
        return true;
      }
      if (td.type === 'bow')         { if (player.bow)          return false; player.bow = itemKey; }
      else if (td.type === 'shield') { if (player.hasShield)    return false; player.hasShield = true; }
      else if (td.type === 'flint_steel') { if (player.hasFlintSteel) return false; player.hasFlintSteel = true; }
      else return false;
      this._notify(`Equipped ${td.name}!`, td.color ?? '#aaffaa', 180);
      return true;
    }
    return false;
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
    if (this._onlineGameId && window.multiplayerManager?.isConnected) {
      window.multiplayerManager.sendChestUpdate(ch.col, ch.row, ch.items);
    }
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
    const chestX = this._chestOpen.col * BLOCK_SIZE + BLOCK_SIZE / 2;
    const chestY = this._chestOpen.row * BLOCK_SIZE;
    for (let idx = 0; idx < ch.items.length; idx++) {
      const item = ch.items[idx];
      if (!item) continue;
      if (item.type === 'tool' && TOOL_DATA[item.toolKey]) {
        if (this._platEquipItem(this.player, item.toolKey, chestX, chestY)) {
          ch.items[idx] = null;
        }
        // rejected → stays in chest
      } else if (item.type === 'armor' && ARMOR_DATA[item.armorKey]) {
        if (this._platEquipItem(this.player, item.armorKey, chestX, chestY)) {
          ch.items[idx] = null;
        }
        // rejected → stays in chest
      } else if (typeof item.type === 'number') {
        for (let n = 0; n < (item.count || 1); n++) this.player.addBlock(item.type);
        ch.items[idx] = null;
      } else {
        for (let i = 0; i < 36; i++) {
          if (!this.player.inventory[i]) { this.player.inventory[i] = { ...item }; break; }
        }
        ch.items[idx] = null;
      }
    }
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
    const gpConn = this.input.p1GpSlot >= 0 && this.input.gamepads[this.input.p1GpSlot]?.connected;
    const equipLabel = gpConn ? '⚙ [Y] Equip & Take' : '⚙ Equip & Take';
    const leaveLabel = gpConn ? '[B] Leave'           : 'Leave';
    const navSel0 = this._chestModalSel === 0;  // keyboard/controller focus on Equip
    const navSel1 = this._chestModalSel === 1;  // keyboard/controller focus on Leave
    const eHov = (mx >= equipX && mx <= equipX + bw && my >= btnY && my <= btnY + bh) || navSel0;
    const cHov = (mx >= closeX && mx <= closeX + bw && my >= btnY && my <= btnY + bh) || navSel1;
    ctx.fillStyle = eHov ? 'rgba(76,175,80,0.65)' : hasEquippable ? 'rgba(76,175,80,0.35)' : 'rgba(40,60,40,0.4)';
    _roundRect(ctx, equipX, btnY, bw, bh, 6); ctx.fill();
    ctx.strokeStyle = eHov ? '#8BC34A' : hasEquippable ? '#4CAF50' : '#336633'; ctx.lineWidth = navSel0 ? 2.5 : 1.5;
    _roundRect(ctx, equipX, btnY, bw, bh, 6); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px Courier New';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(equipLabel, equipX + bw / 2, btnY + bh / 2);

    // "Leave" button
    ctx.fillStyle = cHov ? 'rgba(100,100,120,0.8)' : 'rgba(50,50,70,0.5)';
    _roundRect(ctx, closeX, btnY, bw, bh, 6); ctx.fill();
    ctx.strokeStyle = cHov ? '#888' : '#444'; ctx.lineWidth = navSel1 ? 2.5 : 1.5;
    _roundRect(ctx, closeX, btnY, bw, bh, 6); ctx.stroke();
    ctx.fillStyle = '#ccc'; ctx.font = 'bold 10px Courier New';
    ctx.fillText(leaveLabel, closeX + bw / 2, btnY + bh / 2);

    // Keyboard/controller nav hint
    if (gpConn) {
      ctx.fillStyle = '#667788'; ctx.font = '8px Courier New';
      ctx.fillText('◄ ► to select  [Y]/[A] confirm  [B]/Esc close', CANVAS_W / 2, btnY + bh + 12);
    } else {
      ctx.fillStyle = '#667788'; ctx.font = '8px Courier New';
      ctx.fillText('← → to select  U/Space confirm  Esc close', CANVAS_W / 2, btnY + bh + 12);
    }
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
    // For plains + cave columns: sky when player is above row 28, cave black below
    const row = Math.floor(this.player.cy / BLOCK_SIZE);
    return row < 28 ? 'plains' : 'cave';
  }

  // Visual backdrop selector (Tier 1). Honors the per-world backgroundTheme
  // override; falls back to the position-based gameplay biome when 'auto'. This
  // is VISUAL ONLY — _playerBiome() (music, void death, dragon, portals) is
  // unchanged, so forcing a theme never alters gameplay biome regions.
  _skyBiome() {
    const theme = this._worldAdvSettings?.backgroundTheme;
    if (theme && theme !== 'auto') {
      return theme === 'sky' ? 'plains' : theme; // 'cave' | 'nether' | 'end' pass through
    }
    return this._playerBiome();
  }

  _checkDeath() {
    if (!this.player.isDead) return;
    const cause = 'Killed by ' + (this._nearestMobName() ?? 'a monster');
    this._triggerDeath(cause);
  }

  _triggerDeath(cause = 'You died') {
    if (this.state === 'dead' || this._p1RespawnTimer > 0) return; // already dead/respawning
    this._playSound('sounds/player-death.mp3');
    this._deathCause     = cause;
    this._deathTimestamp = Date.now();

    // Death effect (all modes): scatter the player's body parts (the Speed-Runner
    // death animation), and cancel any in-progress bow draw (Phase 3A.3).
    this._spawnDeathParts(this.player);
    this.player.bowDrawing = false; this.player.drawProgress = 0;
    // CTF: a defeated flag carrier drops the flag here (never keeps it on respawn).
    if (typeof CTF_SYSTEM !== 'undefined' && CTF_SYSTEM.active) CTF_SYSTEM.onPlayerDefeated(this, this.player);
    if (this.isArena && this.arenaState.stats.p1) this.arenaState.stats.p1.deaths++;

    // Arena: respawn after a short delay. With limited Lives, decrement and end
    // the match for P1 when exhausted (solo → game over; MP → standings shown).
    if (this.isArena) {
      if (this._arenaLives > 0) {
        this.player._arenaLives = (this.player._arenaLives || 0) - 1;
        if (this.player._arenaLives <= 0) {
          this._notify('Out of lives!', '#FF5555', 200);
          this.arenaState.phase = 'ended';
          this.arenaState.endTime = this.arenaState.endTime || Date.now();
          this.player.hp = this.player.maxHp; // keep the object valid for the end screen
          return;
        }
      }
      const livesLeft = this._arenaLives > 0 ? `  (${this.player._arenaLives} ${this.player._arenaLives === 1 ? 'life' : 'lives'} left)` : '';
      this._notify('Respawning…' + livesLeft, '#FFD700', this.arenaRespawnFrames);
      this._p1RespawnTimer = this.arenaRespawnFrames;
      this.player.hp = this.player.maxHp;
      return;
    }

    // 2P co-op: use respawn timer instead of death modal
    if (this.player2) {
      this.player.lives = Math.max(0, (this.player.lives ?? 3) - 1);
      if (this.player.lives <= 0) {
        // P1 eliminated — promote P2 to solo; no death modal
        this._notify('P1 eliminated! P2 continues solo.', '#FF4444', 240);
        this.player     = this.player2;
        this.player2    = null;
        this._p2RespawnTimer = 0;
        this._p1RespawnTimer = 0;
        // Re-sync input slot: P2's slot becomes P1's slot
        this.input.p1GpSlot = this.input.p2GpSlot;
        this.input.p2GpSlot = 1;  // reset to default
        if (typeof ControllerConfig !== 'undefined') {
          ControllerConfig.setAssignment(1, this.input.p1GpSlot);
        }
        return;
      }
      this._notify(`P1: ${cause}`, '#FFD700', 150);
      this._p1RespawnTimer = 180;
      this.player.hp = this.player.maxHp;
      return;
    }

    const drops = [];
    if (this.gameMode === 'normal') {
      const dx = this.player.cx, dy = this.player.cy;
      const spread = () => dx + (Math.random() - 0.5) * 48;
      // Drop block items from hotbar + inventory
      const allSlots = [...this.player.hotbar, ...this.player.inventory];
      for (const slot of allSlots) {
        if (slot && typeof slot.type === 'number' && slot.count > 0) {
          drops.push({ x: spread(), y: dy, itemKey: slot.type, amount: slot.count });
        }
      }
      this.player.hotbar.fill(null);
      this.player.inventory.fill(null);
      // Drop upgraded tools (keep default wooden gear — that's the floor)
      if (this.player.sword && this.player.sword !== 'WOODEN_SWORD') {
        drops.push({ x: spread(), y: dy, itemKey: this.player.sword, amount: 1 });
        this.player.sword = 'WOODEN_SWORD';
      }
      if (this.player.pickaxe && this.player.pickaxe !== 'WOODEN_PICKAXE') {
        drops.push({ x: spread(), y: dy, itemKey: this.player.pickaxe, amount: 1 });
        this.player.pickaxe = 'WOODEN_PICKAXE';
      }
      if (this.player.bow) {
        drops.push({ x: spread(), y: dy, itemKey: this.player.bow, amount: 1 });
        this.player.bow = null;
      }
      // Drop all equipped armor
      for (const slot of ['head', 'chest', 'legs', 'feet']) {
        const key = this.player.equippedArmor[slot];
        if (key) {
          drops.push({ x: spread(), y: dy, itemKey: key, amount: 1 });
          this.player.equippedArmor[slot] = null;
        }
      }
    } else if (this.gameMode === 'sandbox') {
      // Sandbox: drop hotbar block items only
      for (let i = 0; i < 9; i++) {
        const slot = this.player.hotbar[i];
        if (slot && typeof slot.type === 'number' && slot.count > 0) {
          drops.push({ x: this.player.cx, y: this.player.cy, itemKey: slot.type, amount: slot.count });
          this.player.hotbar[i] = null;
        }
      }
    }
    // Platformer: no drops, player keeps all items

    this._deathHadDrops = drops.length > 0;
    if (drops.length > 0) this.mobManager.dropItems(drops);
    this.state = 'dead';
    // Fade music on death; clear boss/nether/wither state so it doesn't persist post-respawn
    this._musicSystem.bossMusicActive   = false;
    this._musicSystem.netherMusicActive = false;
    this._musicSystem.witherMusicActive = false;
    this._fadeOutMusic(600, null);

    // Cancel active Wither fight — releases camera lock so respawn renders correctly
    if (this._witherBoss) {
      this._witherBoss          = null;
      this._witherFade          = null;
      this._witherVictoryScreen = false;
      this._witherVictoryTimer  = 0;
      // Restore empty altar so the player can try again after respawning
      if (this._lastAltarAnchorRow !== null) {
        this._restoreEmptyAltar(this._lastAltarAnchorRow, this._lastAltarAnchorCol);
      }
    }
  }

  // ── Phase 12: 2-Player Co-op helpers ──────────────────────

  _syncTwoPlayerAfterLoad() {
    // If user chose 2P explicitly at launch, override what the save had
    if (this._launchTwoPlayerMode !== undefined) {
      this._worldAdvSettings.twoPlayerMode = this._launchTwoPlayerMode;
    }
    // Sync player2 to current setting (silent — no notification at startup)
    this._applyTwoPlayerMode(this._worldAdvSettings.twoPlayerMode, true);
  }

  // Back-compat wrapper — P2 death routes through the generic handler.
  _triggerP2Death(cause = 'Player 2 died') { this._triggerSecondaryDeath(1, cause); }

  // Death for a secondary player (slot i ≥ 1). Arena = unlimited respawns;
  // non-arena co-op keeps the lives / drop-to-solo semantics (P2 only).
  _triggerSecondaryDeath(i, cause = 'Player died') {
    if (this._respawnTimers[i] > 0) return;
    const p = this.players[i];
    if (!p) return;
    // Death effect (body-part scatter) + cancel any bow draw (Phase 3A.3).
    this._spawnDeathParts(p); p.bowDrawing = false; p.drawProgress = 0;
    // Death sound for P2-P4 too (Bug-fix pass §2.5 — only P1 played it before).
    this._playSound('sounds/player-death.mp3');
    // CTF: drop any carried flag here so the respawned player never keeps it (§6).
    if (typeof CTF_SYSTEM !== 'undefined' && CTF_SYSTEM.active) CTF_SYSTEM.onPlayerDefeated(this, p);
    if (this.isArena) { const s = this.arenaState.stats[p._ownerId || Game.ownerId(i)]; if (s) s.deaths++; }
    // Arena: respawn after a delay. With limited Lives, decrement and eliminate
    // (remove) this player when exhausted — safe (activePlayers skips null slots).
    if (this.isArena) {
      if (this._arenaLives > 0) {
        p._arenaLives = (p._arenaLives || 0) - 1;
        if (p._arenaLives <= 0) {
          this._notify(`P${i + 1} eliminated!`, '#FF5555', 200);
          this.players[i] = null;
          this._respawnTimers[i] = 0;
          return;
        }
      }
      this._respawnTimers[i] = this.arenaRespawnFrames;
      p.hp = p.maxHp;
      return;
    }
    // Non-arena co-op (P2 only): lives → drop to solo when exhausted.
    p.lives = Math.max(0, (p.lives ?? 3) - 1);
    this._notify(`P${i + 1}: ${cause}`, '#FF8888', 150);
    if (p.lives <= 0) {
      this._notify(`P${i + 1} Game Over — P1 continues solo!`, '#FF4444', 240);
      this.players[i] = null;
      this._respawnTimers[i] = 0;
      return;
    }
    this._respawnTimers[i] = 180; // 3 s at 60 fps
  }

  // Push per-world movement settings (gravity, jump height, air jump, sprint)
  // onto a player before its update(). Jump velocity is derived from gravity so
  // the configured apex (in blocks) holds regardless of the gravity setting:
  //   apex_px = v² / (2g)  →  v = √(2 · g · apex_blocks · BLOCK_SIZE)
  // Cached list of every Goal Star cell in the grid, each tagged with its
  // colour index (from _goalColorMap, default 0). Lazily built and cheap for
  // played worlds (grid is static); sandbox edits call _invalidateGoalCells().
  _getGoalCells() {
    if (this._goalCells) return this._goalCells;
    const cells = [];
    const grid = this.level && this.level.grid;
    if (grid) {
      const cm = this._goalColorMap || {};
      for (let r = 0; r < grid.length; r++) {
        const row = grid[r];
        if (!row) continue;
        for (let c = 0; c < row.length; c++) {
          if (row[c] === BLOCK.GOAL) cells.push({ row: r, col: c, color: cm[r + ',' + c] || 0 });
        }
      }
    }
    this._goalCells = cells;
    return cells;
  }
  _invalidateGoalCells() { this._goalCells = null; }
  // Colour index for a Goal Star at (row,col); 0 = classic gold.
  _goalColorAt(r, c) { return (this._goalColorMap && this._goalColorMap[r + ',' + c]) || 0; }
  _setGoalColor(r, c, color) {
    if (!this._goalColorMap) this._goalColorMap = {};
    if (color) this._goalColorMap[r + ',' + c] = color;
    else delete this._goalColorMap[r + ',' + c];
    this._invalidateGoalCells();
  }
  // All 4-connected Goal Star cells reachable from (row,col) — a "touching" group
  // (a stack or line of goals). Used so one colour change repaints the whole group.
  _connectedGoalCells(row, col) {
    const grid = this.level && this.level.grid;
    if (!grid || !grid[row] || grid[row][col] !== BLOCK.GOAL) return [];
    const seen = new Set([row + ',' + col]);
    const out = [], stack = [[row, col]];
    while (stack.length) {
      const [r, c] = stack.pop();
      out.push({ row: r, col: c });
      for (const [nr, nc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
        if (nr < 0 || nc < 0 || nr >= grid.length || !grid[nr] || nc >= grid[nr].length) continue;
        const k = nr + ',' + nc;
        if (grid[nr][nc] === BLOCK.GOAL && !seen.has(k)) { seen.add(k); stack.push([nr, nc]); }
      }
    }
    return out;
  }
  // Colour of the first Goal Star touching (row,col), else 0 — a new goal joins its
  // neighbours' colour so a stack/line stays uniform as you build it.
  _adjacentGoalColor(row, col) {
    const grid = this.level && this.level.grid;
    if (!grid) return 0;
    for (const [nr, nc] of [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]]) {
      if (nr < 0 || nc < 0 || nr >= grid.length || !grid[nr] || nc >= grid[nr].length) continue;
      if (grid[nr][nc] === BLOCK.GOAL) { const c = this._goalColorAt(nr, nc); if (c) return c; }
    }
    return 0;
  }
  // Cycle the colour of the whole connected goal group containing (row,col).
  _cycleGoalGroupColor(row, col) {
    const group = this._connectedGoalCells(row, col);
    if (!group.length) return;
    const n    = (typeof GOAL_COLORS !== 'undefined') ? GOAL_COLORS.length : 10;
    const next = (this._goalColorAt(row, col) + 1) % n;
    for (const g of group) this._setGoalColor(g.row, g.col, next);
    this._invalidateGoalCells();
    const nm = (typeof GOAL_COLORS !== 'undefined') ? (GOAL_COLORS[next]?.name || '') : '';
    this._notify(`Goal colour: ${nm}${group.length > 1 ? ` (×${group.length})` : ''}`, '#FFE066', 100);
  }

  _applyMovementConfig(p) {
    const aws = this._worldAdvSettings;
    const g   = aws.physicsGravity ?? GRAVITY;
    p._gravityOverride = g;
    p._sprintEnabled   = aws.sprintEnabled !== false;
    p._airJumpEnabled  = !!aws.airJumpEnabled;
    p._autoStepUp      = !!aws.autoStepUp;
    p._wallSlideEnabled = !!aws.wallSlideEnabled;
    p._wallJumpLockAway = !!aws.wallJumpLockAway;
    p._ledgeHangEnabled = !!aws.ledgeHangEnabled;
    p._slideEnabled     = !!aws.slideEnabled;
    p._slideInvincible  = !!aws.slideInvincible;
    p._slideDur         = Math.max(6, Math.min(120, aws.slideDurationFrames ?? 30));
    p._slideMult        = Math.max(1, Math.min(3, aws.slideSpeedMult ?? 1.6));
    p._jumpVelocityOverride = aws.jumpHeightBlocks
      ? -Math.sqrt(2 * g * aws.jumpHeightBlocks * BLOCK_SIZE)
      : null;
  }

  _resolvePlayerCollision(p1, p2) {
    const overlapX = (p1.x + p1.width)  - p2.x;
    const overlapX2= (p2.x + p2.width)  - p1.x;
    if (overlapX <= 0 || overlapX2 <= 0) return;
    const topA = p1.y, botA = p1.y + p1.height;
    const topB = p2.y, botB = p2.y + p2.height;
    if (botA <= topB || botB <= topA) return;
    // Horizontal push: push each away by half overlap
    const push = Math.min(overlapX, overlapX2) / 2;
    const dir  = p1.cx < p2.cx ? 1 : -1;
    p1.x -= dir * push;
    p2.x += dir * push;
  }

  // ── Phase 3B player-model accessors ──────────────────────────
  // Slot index → player (or null). Slots: 0=P1, 1=P2, 2=P3, 3=P4.
  getPlayer(i) { return this.players[i] || null; }

  // All present players (skips empty/absent slots), in slot order. Use this to
  // iterate for input/camera/rendering/scoring instead of touching players[]
  // directly (which may contain nulls for absent slots).
  activePlayers() { return this.players.filter(Boolean); }

  // Owner id ('p1'..'p4') for a slot index — matches arena score keys.
  static ownerId(i) { return 'p' + (i + 1); }

  // Freeze / resume the arena match timer across pause (Bug-fix pass §2.4).
  // We accumulate total paused time (pausedTotal) and, while currently paused,
  // also subtract the live pause segment (pausedAt) — so both the HUD readout
  // AND the timeUp win-check freeze during the pause, not just correct on resume.
  _onArenaPauseChange(paused) {
    if (!this.isArena) return;
    const a = this.arenaState;
    if (paused) {
      if (!a.pausedAt) a.pausedAt = Date.now();
    } else if (a.pausedAt) {
      const seg = Date.now() - a.pausedAt;
      // Running-phase pauses accumulate into pausedTotal; a pause during the
      // pre-match countdown (gameStartTime not set yet) only shifts countdownStart.
      if (a.gameStartTime) a.pausedTotal = (a.pausedTotal || 0) + seg;
      else if (a.countdownStart) a.countdownStart += seg;
      a.pausedAt = null;
    }
  }

  // Elapsed match time (ms) with paused time removed. Used by the HUD timer and
  // the timeUp win-check so the timer visibly stops while the game is paused.
  _arenaElapsedMs() {
    const a = this.arenaState;
    if (!a || !a.gameStartTime) return 0;
    const end = a.endTime || Date.now();
    const livePause = a.pausedAt ? (Date.now() - a.pausedAt) : 0;
    return Math.max(0, end - a.gameStartTime - (a.pausedTotal || 0) - livePause);
  }

  // Position the camera: centroid-follow for 2+ players, single-follow for 1.
  _followCamera() {
    const live = this.activePlayers();
    if (live.length >= 2) this.camera.followPlayers(live);
    else                  this.camera.follow(this.player);
  }

  // Local-player count (1-4). Arena honors playerCount; other modes stay 1-2
  // via the legacy twoPlayerMode flag. Clamped defensively.
  _numPlayers() {
    const aws = this._worldAdvSettings;
    let n = this.isArena ? (aws.playerCount || (aws.twoPlayerMode ? 2 : 1))
                         : (aws.twoPlayerMode ? 2 : 1);
    return Math.max(1, Math.min(4, n | 0));
  }

  _applyTwoPlayerMode(enabled, silent = false) {
    this._worldAdvSettings.twoPlayerMode = enabled;
    if (enabled && !this.player2) {
      // Mid-game join: spawn next to P1's current position; at spawn point if P1 not yet placed
      const spawnX = this.player ? this.player.x + BLOCK_SIZE * 2 : this._p2SpawnX;
      const spawnY = this.player ? this.player.y                   : this._p2SpawnY;
      this.player2 = new Player(spawnX, spawnY);
      this.player2.godMode = (this.gameMode === 'sandbox');
      this.player2.selectedSlot = 1;
      this._p2RespawnTimer = 0;
      // Arena: a mid-game 2P join must be armed exactly like the primary spawn
      // path, else P2 gets no bow and can't fire (weaponMode falls back to 'item').
      if (this.isArena) {
        this.player2.maxHp = this.player.maxHp;
        this._armArenaPlayer(this.player2, this._arenaSpawns?.p2 || { x: spawnX, y: spawnY });
      }
      if (!silent) this._notify('2-Player Co-op ON  (IJKL / 2nd controller)', '#88AAFF', 180);
    } else if (!enabled && this.player2) {
      this.player2 = null;
      if (!silent) this._notify('2-Player Co-op OFF', '#888899', 120);
    }
  }

  // Secondary-player HUD (P2-P4), stacked at top-right via yOff (Phase 12/3B).
  _drawSecondaryHUD(ctx, p2, pIdx = 1, yOff = 0) {
    if (!p2) return;
    ctx.save();

    // ── HP bar (mirrored top-right) ──────────────────────────
    const bw = 180, bh = 14;
    const barR = CANVAS_W - 10;   // right edge of bar
    const bx2  = barR - bw;        // left edge of bar = 610
    const by2  = 10 + yOff;

    // Background pill (extends left for label area, mirrors P1's rightward extension)
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    _roundRect(ctx, bx2 - 46, by2 - 2, bw + 48, bh + 4, 4);
    ctx.fill();

    // Red track
    ctx.fillStyle = '#550000';
    ctx.fillRect(bx2, by2, bw, bh);

    // Coloured fill (same pct logic as P1)
    const hpPct = p2.hp / p2.maxHp;
    ctx.fillStyle = hpPct > 0.6 ? '#22BB22' : hpPct > 0.3 ? '#BBBB00' : '#CC2222';
    ctx.fillRect(bx2, by2, Math.round(bw * hpPct), bh);

    // Segment ticks
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 1; i < p2.maxHp / 2; i++) {
      ctx.fillRect(bx2 + Math.round(bw * (i / (p2.maxHp / 2))), by2, 1, bh);
    }

    // Border
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx2, by2, bw, bh);

    // Heart icon + HP text — to the LEFT of the bar (right-aligned)
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#FF5566';
    ctx.font = '13px serif';
    ctx.textAlign = 'right';
    ctx.fillText('♥', bx2 - 4, by2 + 12);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px Courier New';
    ctx.fillText(`${p2.hp}/${p2.maxHp}`, bx2 - 18, by2 + 11);

    // Player label just left of HP text
    ctx.fillStyle = '#88AAFF';
    ctx.font = 'bold 9px Courier New';
    ctx.fillText('P' + (pIdx + 1), bx2 - 52, by2 + 11);

    // 2P lives: small head icons to the LEFT of P2 HP bar (left of label area)
    {
      const livesLeft = p2.lives ?? 3;
      const iconSz = 10, gap = 2;
      const lx0 = bx2 - 52 - 2 * (iconSz + gap) - 4;  // left of "P2" label
      for (let i = 0; i < 2; i++) {
        const alive = i < livesLeft - 1;
        const ix = lx0 + i * (iconSz + gap);
        ctx.fillStyle = alive ? '#88AAFF' : 'rgba(30,40,80,0.6)';
        ctx.fillRect(ix, by2 + 1, iconSz, iconSz);
        ctx.strokeStyle = alive ? '#2244AA' : '#112233';
        ctx.lineWidth = 1;
        ctx.strokeRect(ix, by2 + 1, iconSz, iconSz);
        if (alive) {
          ctx.fillStyle = '#5533AA';
          ctx.fillRect(ix + 3, by2 + 3, 2, 2);
          ctx.fillRect(ix + 7, by2 + 3, 2, 2);
          ctx.fillRect(ix + 3, by2 + 7, 6, 2);
        }
      }
    }

    // ── XP bar (right-aligned below HP bar) ─────────────────
    const xpW = 120, xpX2 = CANVAS_W - 10 - xpW, xpY2 = 30 + yOff;
    const xpFrac  = p2.xp / p2.maxXp;
    const xpMaxed = p2.xp >= p2.maxXp;

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    _roundRect(ctx, xpX2, xpY2, xpW, 13, 4); ctx.fill();

    if (xpFrac > 0) {
      ctx.fillStyle = xpMaxed ? '#FFD700' : '#22CC44';
      _roundRect(ctx, xpX2, xpY2, Math.round(xpW * xpFrac), 13, 4); ctx.fill();
    }

    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    for (let i = 1; i < p2.maxXp; i++) {
      ctx.fillRect(xpX2 + Math.round(xpW * i / p2.maxXp), xpY2, 1, 13);
    }

    // XP label right-aligned; speed hint left-aligned (same logic as P1 but mirrored)
    ctx.fillStyle = xpMaxed ? '#FFD700' : '#fff';
    ctx.font = xpMaxed ? 'bold 9px Courier New' : '9px Courier New';
    ctx.textAlign = 'right';
    ctx.fillText(xpMaxed ? 'XP MAX!' : `XP Lv.${p2.xpLevel}`, xpX2 + xpW - 4, xpY2 + 10);
    if (p2.xp > 0 && !xpMaxed) {
      const mult = Math.round(p2._xpMult * 10) / 10;
      ctx.fillStyle = 'rgba(100,255,140,0.8)';
      ctx.font = '8px Courier New';
      ctx.textAlign = 'left';
      ctx.fillText(`${mult}× spd`, xpX2 + 2, xpY2 + 10);
    }

    // Respawn overlay covering both bars
    if (this._respawnTimers[pIdx] > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      _roundRect(ctx, bx2 - 46, by2 - 2, bw + 48, bh + 4, 4); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      _roundRect(ctx, xpX2, xpY2, xpW, 13, 4); ctx.fill();
      ctx.fillStyle = '#FF8888';
      ctx.font = 'bold 10px Courier New';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(`Respawn ${Math.ceil(this._respawnTimers[pIdx] / 60)}s`, CANVAS_W - 10, by2 + bh / 2);
    }

    // ── Compact 9-slot hotbar (right-aligned under XP bar) — P2 only ──
    if (pIdx === 1) this._drawCompactHotbar(ctx, p2, true);

    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  // 4-player layout (v3 §4): P3/P4 get a compact health bar + hotbar in the
  // lower band — P3 directly below P1's hotbar (left), P4 below P2's (right).
  // P1 (top-left) and P2 (top-right full HUD) are unchanged.
  _drawLowerPlayerHUD(ctx, p, pIdx) {
    if (!p) return;
    ctx.save();
    const SZ = 19, GAP = 1;
    const bw = 9 * SZ + 8 * GAP;        // match hotbar width (179)
    const bh = 14;
    const rightAlign = (pIdx === 3);    // P4 → right, P3 → left
    const bx = rightAlign ? (CANVAS_W - 10 - bw) : 10;
    const healthY = 72;                 // just below the P1/P2 hotbars (bottom ≈66)
    const hotbarY = healthY + bh + 3;   // 89

    // Background pill + red track + coloured fill
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    _roundRect(ctx, bx - 2, healthY - 2, bw + 4, bh + 4, 4); ctx.fill();
    ctx.fillStyle = '#550000';
    ctx.fillRect(bx, healthY, bw, bh);
    const hpPct = Math.max(0, p.hp / p.maxHp);
    ctx.fillStyle = hpPct > 0.6 ? '#22BB22' : hpPct > 0.3 ? '#BBBB00' : '#CC2222';
    ctx.fillRect(bx, healthY, Math.round(bw * hpPct), bh);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 1; i < p.maxHp / 2; i++) ctx.fillRect(bx + Math.round(bw * (i / (p.maxHp / 2))), healthY, 1, bh);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1;
    ctx.strokeRect(bx, healthY, bw, bh);

    // Player label (P3 green / P4 yellow) + HP text
    const col = pIdx === 2 ? '#5aff7a' : '#f5d142';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = col; ctx.font = 'bold 9px Courier New'; ctx.textAlign = 'left';
    ctx.fillText('P' + (pIdx + 1), bx + 3, healthY + bh / 2);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'right';
    ctx.fillText(`${Math.max(0, p.hp)}/${p.maxHp}`, bx + bw - 3, healthY + bh / 2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

    // Hotbar directly below the health bar
    this._drawCompactHotbar(ctx, p, rightAlign, hotbarY);

    // Respawn overlay
    if (this._respawnTimers[pIdx] > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      _roundRect(ctx, bx - 2, healthY - 2, bw + 4, bh + 4, 4); ctx.fill();
      ctx.fillStyle = '#FF8888'; ctx.font = 'bold 9px Courier New';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`Respawn ${Math.ceil(this._respawnTimers[pIdx] / 60)}s`, bx + bw / 2, healthY + bh / 2);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();
  }

  _doRespawn() {
    // Respawn Anchor takes priority over bed if set
    if (this._activeRespawnAnchor) {
      const anc = this._activeRespawnAnchor;
      // Only use anchor if it still exists in the world
      if (this.level.get(anc.row, anc.col) === BLOCK.RESPAWN_ANCHOR) {
        this.player.respawnAt(
          (anc.col + 0.5) * BLOCK_SIZE - this.player.width / 2,
          anc.row * BLOCK_SIZE - this.player.height
        );
        if (this._deathHadDrops) this._notify('Items dropped nearby.', '#FF4444', 300);
        this._snapCameraToPlayer();
        this.state = 'playing';
        this._restartBackgroundMusic();
        return;
      }
      this._activeRespawnAnchor = null;  // anchor was destroyed
    }
    const bed = this._activeBedSpawn();
    if (bed) {
      this.player.respawnAt(
        (bed.col + 0.5) * BLOCK_SIZE - this.player.width / 2,
        bed.row * BLOCK_SIZE - this.player.height
      );
    } else {
      this.player.respawnAt(this.level.spawnX, this.level.spawnY);
    }
    if (this._deathHadDrops) this._notify('Items dropped nearby.', '#FF4444', 300);
    this._snapCameraToPlayer();
    this.state = 'playing';
    // Resume background music — clear any stale fade state first so the
    // playlist starts cleanly regardless of what was interrupted by death.
    this._restartBackgroundMusic();
  }

  _restartBackgroundMusic() {
    const ms = this._musicSystem;
    if (ms.bossMusicActive || ms.witherMusicActive) return;
    if (ms.fadeInterval) { clearInterval(ms.fadeInterval); ms.fadeInterval = null; }
    if (ms.bgAudio) { ms.bgAudio.pause(); ms.bgAudio.volume = 0; }
    ms.currentTrack = null;   // let _advancePlaylist pick freely
    this._advancePlaylist();
  }

  _snapCameraToPlayer() {
    const camX = this.player.x + PLAYER_W / 2 - CANVAS_W / 2;
    const camY = this.player.y + this.player.height / 2 - CANVAS_H * 0.55;
    this.camera.x = Math.max(0, Math.min(this.level.pixelWidth  - CANVAS_W, camX));
    this.camera.y = Math.max(0, Math.min(this.level.pixelHeight - CANVAS_H, camY));
  }

  _nearestMobName() {
    const nameMap = {
      Zombie: 'a Zombie', Skeleton: 'a Skeleton', Creeper: 'a Creeper',
      CaveSpider: 'a Cave Spider', Piglin: 'a Piglin', Blaze: 'a Blaze',
      WitherSkeleton: 'a Wither Skeleton', Enderman: 'an Enderman',
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
      // If the dragon was previously defeated, reset it so it respawns on this entry
      if (this._dragonDefeated || (this._dragon && !this._dragon.isAlive)) {
        this._dragon             = null;
        this._dragonDefeated     = false;
        this._dragonExitPortal   = false;
        this._dragonVictoryScreen = false;
      }
      this._endEntryCell = { col: pCol, row: pRow }; // remember for exit portal return
      const destX = END_PORTAL_ARRIVAL_COL * BLOCK_SIZE - this.player.width / 2;
      const destY = END_PORTAL_ARRIVAL_ROW * BLOCK_SIZE - this.player.height;
      this._portalTransition = { phase: 'out', timer: 0, destX, destY };
      this._playSound('sounds/end-portal.mp3');
      this._notify('Entering The End...', '#AA44FF', 200);
      // Start End battle music immediately (dragon spawns on next frame)
      if (!this._musicSystem.bossMusicActive) {
        if (this._musicSystem.netherMusicActive) {
          this._musicSystem.netherMusicActive = false;
          this._musicSystem.lastNormalTrack = null;
        }
        this._startBossMusic();
      }
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
            this._playSound('sounds/nether-portal.mp3');
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

    // Normal/platformer/speedrunner mode playing a sandbox world — use saved portal links
    if ((this.gameMode === 'normal' || this.gameMode === 'platformer' || this.gameMode === 'speedrunner') && this._normalPortals.length > 0) {
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
          this._playSound('sounds/nether-portal.mp3');
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
    const inCave   = pCol >= 271 && pCol <= 272 && pRow >= 31 && pRow <= 33;
    const inNether = pCol >= 329 && pCol <= 330 && pRow >= 31 && pRow <= 33;
    if (inCave) {
      this._portalTransition = { phase: 'out', timer: 0, destX: pd.caveExit.x, destY: pd.caveExit.y };
      this._playSound('sounds/nether-portal.mp3');
      this._notify('Entering the Nether...', '#AA00FF', 200);
    } else if (inNether) {
      this._portalTransition = { phase: 'out', timer: 0, destX: pd.netherExit.x, destY: pd.netherExit.y };
      this._playSound('sounds/nether-portal.mp3');
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
    if (this._onlineGameId && window.multiplayerManager?.isCreator) {
      const changes = pd.cavePortalInterior.map(pos => ({ row: pos.row, col: pos.col, block: BLOCK.NETHER_PORTAL }));
      window.multiplayerManager.sendBlockChanged(changes);
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
      // Goal star: MULTIPLE allowed (campaign-prep). A fresh goal joins the colour
      // of any goal it touches (colour cycling is done in the sandbox editor).
      this.level.set(row, col, type);
      if (type === BLOCK.GOAL) {
        this.level.goalCol = col;
        this.level.goalRow = row;
        this._setGoalColor(row, col, this._adjacentGoalColor(row, col));
        this._invalidateGoalCells();
      }
      return true;
    }
    return false;
  }

  // ── Phase 16: Drop current item (G key) ────────────────────

  _dropCurrentItem() {
    const item = this.player.selectedItem;
    if (!item) return;
    const blockType = item.type;
    if (!blockType) return;
    // Remove one of the item from the player's selected slot
    this.player.takeSelected();
    // Spawn as a local physics item drop (reuses mob ItemDrop)
    if (typeof ItemDrop !== 'undefined') {
      this.mobManager.droppedItems.push(new ItemDrop(
        this.player.cx,
        this.player.y + this.player.height / 2,
        blockType, 1
      ));
    }
    // Sync to multiplayer server
    if (window.multiplayerManager?.isConnected) {
      window.multiplayerManager.dropItem(blockType, this.player.cx, this.player.cy);
    }
    this._notify('Item dropped [G]', '#AAAAAA', 60);
  }

  _syncInventoryToServer() {
    const mgr = window.multiplayerManager;
    if (!mgr?.isConnected) return;
    // Serialize hotbar slots into a flat array of {type, count} entries
    const inv = (this.player.hotbar || []).map(slot => slot ? { type: slot.type, count: slot.count || 1 } : null);
    mgr.syncInventory(inv, this.player.hp, this.player.x, this.player.y);
  }

  _restoreOnlineInventory(state) {
    if (!state || !Array.isArray(state.inventory)) return;
    // Restore hotbar from saved state
    const slots = state.inventory;
    for (let i = 0; i < slots.length && i < (this.player.hotbar?.length || 0); i++) {
      if (slots[i]) this.player.hotbar[i] = { type: slots[i].type, count: slots[i].count || 1 };
    }
    if (state.hp > 0) this.player.hp = Math.min(state.hp, 20);
    this._notify('Inventory restored from last session', '#44BBFF', 180);
  }

  // ── Phase 16-B: Chat UI ───────────────────────────────────

  _escHtml(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  _setupChatUI() {
    if (this._chatDomReady) return;
    this._chatDomReady = true;

    const chat = document.createElement('div');
    chat.id = 'mp-chat';
    chat.style.cssText = 'position:fixed;bottom:10px;left:10px;width:320px;z-index:100;font-family:monospace';
    chat.innerHTML = `
      <div id="mp-chat-msgs" style="background:rgba(0,0,0,0.6);color:#fff;padding:6px;height:140px;overflow-y:auto;font-size:12px;border-radius:4px 4px 0 0"></div>
      <div style="display:flex">
        <input id="mp-chat-input" type="text" maxlength="100" placeholder="Press T to chat..."
               style="flex:1;background:rgba(0,0,0,0.8);color:#fff;border:none;padding:4px 6px;font-size:12px;outline:none">
        <button id="mp-chat-send" style="background:#444;color:#fff;border:none;padding:4px 8px;cursor:pointer;font-size:12px">→</button>
      </div>
    `;
    document.body.appendChild(chat);

    const input  = document.getElementById('mp-chat-input');
    const send   = document.getElementById('mp-chat-send');

    const doSend = () => {
      const val = input.value.trim();
      if (!val) return;
      if (window.multiplayerManager) window.multiplayerManager.sendChat(val);
      input.value = '';
      input.blur();
    };

    send.addEventListener('click', doSend);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); doSend(); }
      if (e.key === 'Escape') { input.value = ''; input.blur(); }
      // Consume the event so it doesn't trigger game actions
      e.stopPropagation();
    });
    // Prevent keyup propagation too (keeps keys from getting stuck in game.input.keys)
    input.addEventListener('keyup', e => e.stopPropagation());

    // Clean up when game is destroyed
    this._chatDomElement = chat;
    if (this._worldAdvSettings.chatDisabled) chat.style.display = 'none';
  }

  _onChatMessage(data) {
    this._chatMessages.push(data);
    if (this._chatMessages.length > 100) this._chatMessages.shift();
    const msgs = document.getElementById('mp-chat-msgs');
    if (!msgs) return;
    const div = document.createElement('div');
    div.innerHTML = `<span style="color:${this._escHtml(data.shirtColor || '#ffffff')}">${this._escHtml(data.playerName || 'Unknown')}</span>: ${this._escHtml(data.message)}`;
    msgs.appendChild(div);
    // Keep last 100 DOM nodes
    while (msgs.children.length > 100) msgs.removeChild(msgs.firstChild);
    msgs.scrollTop = msgs.scrollHeight;
  }

  // ── Phase 16-B: Join/leave game notification toasts ───────

  _pushGameNotification(text, color) {
    if (!this._gameNotifications) this._gameNotifications = [];
    this._gameNotifications.push({ text, color, timer: 240 });
  }

  _drawGameNotifications(ctx) {
    if (!this._gameNotifications || this._gameNotifications.length === 0) return;
    ctx.save();
    ctx.font         = 'bold 11px Courier New';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    const cx = CANVAS_W / 2;
    let y = 12;
    for (const n of this._gameNotifications) {
      const alpha = Math.min(1, n.timer / 30);
      const tw    = ctx.measureText(n.text).width;
      ctx.globalAlpha = alpha;
      ctx.fillStyle   = 'rgba(0,0,0,0.65)';
      _roundRect(ctx, cx - tw / 2 - 10, y - 2, tw + 20, 18, 4);
      ctx.fill();
      ctx.fillStyle   = n.color;
      ctx.fillText(n.text, cx, y);
      y += 22;
    }
    ctx.globalAlpha  = 1;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  // ── Online in-game menu (non-pausing) ─────────────────────

  _onlineMenuLayout() {
    const pw = 320, ph = 280;
    const px = (CANVAS_W - pw) / 2, py = (CANVAS_H - ph) / 2;
    return { pw, ph, px, py };
  }

  _updateOnlineMenu() {
    if (!this.input.mouse.clicked) return;
    const mx = this.input.mouse.x, my = this.input.mouse.y;
    const { pw, ph, px, py } = this._onlineMenuLayout();
    const bw = 240, bx = px + (pw - bw) / 2;
    const btnH = 44;

    // X close button
    if (mx >= px + pw - 28 && mx <= px + pw - 8 && my >= py + 8 && my <= py + 28) {
      this._onlineMenuOpen = false; return;
    }

    // Resume
    const resumeY = py + 76;
    if (mx >= bx && mx <= bx + bw && my >= resumeY && my <= resumeY + btnH) {
      this._onlineMenuOpen = false; return;
    }

    // Settings
    const settingsY = resumeY + btnH + 10;
    if (mx >= bx && mx <= bx + bw && my >= settingsY && my <= settingsY + btnH) {
      this._onlineMenuOpen = false;
      this._worldSettingsOpen = true;
      this._wsTab = 'advanced'; // sensible default: chat, 2p, etc.
      return;
    }

    // Leave Game
    const leaveY = settingsY + btnH + 10;
    if (mx >= bx && mx <= bx + bw && my >= leaveY && my <= leaveY + btnH) {
      window.multiplayerManager?.disconnect();
      this.destroy();
      if (this._onReturnToMenu) this._onReturnToMenu('online');
      else location.reload();
      return;
    }
  }

  _drawOnlineMenu(ctx) {
    const mx = this.input.mouse.x, my = this.input.mouse.y;
    const { pw, ph, px, py } = this._onlineMenuLayout();
    const bw = 240, bx = px + (pw - bw) / 2;
    const btnH = 44;

    ctx.save();

    // Backdrop
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Panel
    ctx.fillStyle = '#13131f';
    _roundRect(ctx, px, py, pw, ph, 10); ctx.fill();
    ctx.strokeStyle = '#9C27B0'; ctx.lineWidth = 2;
    _roundRect(ctx, px, py, pw, ph, 10); ctx.stroke();

    // Header
    ctx.font = 'bold 14px Courier New'; ctx.fillStyle = '#CE93D8';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('ONLINE GAME', px + pw / 2, py + 28);

    // Online badge
    const mgr = window.multiplayerManager;
    if (mgr?.isConnected) {
      ctx.font = '9px Courier New'; ctx.fillStyle = '#44EE44';
      ctx.fillText(`● Connected  •  Player ${mgr.playerNumber ?? '?'}`, px + pw / 2, py + 48);
    }

    // X close button
    { const xbx = px + pw - 28, xby = py + 8;
      const xHov = mx >= xbx && mx <= xbx + 20 && my >= xby && my <= xby + 20;
      ctx.fillStyle   = xHov ? 'rgba(255,80,80,0.3)' : 'rgba(0,0,0,0.4)';
      _roundRect(ctx, xbx, xby, 20, 20, 4); ctx.fill();
      ctx.strokeStyle = xHov ? '#FF5555' : '#554444'; ctx.lineWidth = 1;
      _roundRect(ctx, xbx, xby, 20, 20, 4); ctx.stroke();
      ctx.fillStyle = xHov ? '#fff' : '#AA7777';
      ctx.font = 'bold 12px Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('✕', xbx + 10, xby + 10); }

    const drawBtn = (label, y, color) => {
      const hov = mx >= bx && mx <= bx + bw && my >= y && my <= y + btnH;
      ctx.fillStyle   = hov ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.55)';
      _roundRect(ctx, bx, y, bw, btnH, 6); ctx.fill();
      ctx.strokeStyle = hov ? color : `${color}66`; ctx.lineWidth = hov ? 2 : 1;
      _roundRect(ctx, bx, y, bw, btnH, 6); ctx.stroke();
      ctx.fillStyle = hov ? '#fff' : color;
      ctx.font = 'bold 13px Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, bx + bw / 2, y + btnH / 2);
    };

    const resumeY   = py + 76;
    const settingsY = resumeY + btnH + 10;
    const leaveY    = settingsY + btnH + 10;

    drawBtn('▶  Resume Game',   resumeY,   '#88CCFF');
    drawBtn('⚙  Settings',      settingsY, '#FFCC66');
    drawBtn('⟵  Leave Game',   leaveY,    '#FF6B6B');

    ctx.font = '9px Courier New'; ctx.fillStyle = '#444466';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Leaving disconnects you. Rejoin from the lobby.', px + pw / 2, leaveY + btnH + 18);

    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.restore();
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
    window._gameRef = this; // Phase 16: expose for multiplayerManager callbacks
    const ctx      = this.ctx;
    const _p1GpConnected = this.input.p1GpSlot >= 0 && this.input.gamepads[this.input.p1GpSlot]?.connected;
    // Resolve zoom + camera BEFORE converting the cursor to a grid cell, so the
    // highlight lands under the mouse at any zoom (see _syncViewTransform).
    const _activeZoom = this._syncViewTransform();
    const world    = this.camera.toWorld(this.input.mouse.x, this.input.mouse.y);
    const hoverCol = Math.floor(world.x / BLOCK_SIZE);
    const hoverRow = Math.floor(world.y / BLOCK_SIZE);

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Apply screen shake (always save/restore so the restore is unconditional)
    ctx.save();
    const shake = this._screenShake;
    if (shake.frames > 0) {
      const decay = shake.frames / shake.maxFrames;
      const ox    = (Math.random() * 2 - 1) * shake.intensity * decay;
      const oy    = (Math.random() * 2 - 1) * shake.intensity * decay;
      ctx.translate(ox, oy);
      shake.frames--;
    }

    const biome = this._skyBiome();
    this._drawSky(ctx, biome);
    if (biome === 'plains') {
      this._drawCelestial(ctx);   // stars + sun/moon behind clouds
      this._drawClouds(ctx);
    }
    // World-space zoom — scale around canvas center (sky stays unaffected, drawn
    // above). Used by Speed-Runner (zoom-out at speed) and Arena (PRESET zoom in/
    // out, or DYNAMIC co-op fit). The matching ctx.restore() is below, after the
    // world overlays. Unlike SR (zoom-out only), arena PRESET can also zoom IN, so
    // the transform applies whenever zoom differs from 1.0 in either direction.
    // _activeZoom + camera._srZoom already resolved at the top of _render via
    // _syncViewTransform() (so the cursor→grid conversion above matches).
    ctx.save();
    if (Math.abs(_activeZoom - 1.0) > 0.005) {
      ctx.translate(CANVAS_W / 2, CANVAS_H / 2);
      ctx.scale(_activeZoom, _activeZoom);
      ctx.translate(-CANVAS_W / 2, -CANVAS_H / 2);
    }
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
    this._drawAltarItems(ctx);

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

    // Bow aim crosshair — visible anywhere (including over air) when P1 controller is connected
    if (this.player.weaponMode === 'bow' && _p1GpConnected && !this.inventoryOpen) {
      const mx = this.input.mouse.x, my = this.input.mouse.y;
      const r  = 9;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.80)';
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.moveTo(mx - r, my); ctx.lineTo(mx - 3, my);
      ctx.moveTo(mx + 3, my); ctx.lineTo(mx + r, my);
      ctx.moveTo(mx, my - r); ctx.lineTo(mx, my - 3);
      ctx.moveTo(mx, my + 3); ctx.lineTo(mx, my + r);
      ctx.stroke();
      ctx.strokeStyle = this.player.bowDrawing ? 'rgba(255,120,50,0.9)' : 'rgba(255,220,100,0.7)';
      ctx.lineWidth   = 1;
      ctx.beginPath(); ctx.arc(mx, my, 3, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // Secondary-player (P2-P4) bow aim reticles — the right stick moves each
    // target. Drawn in world space (anchored a fixed distance along the aim
    // angle) so they track the camera + zoom like other world objects.
    if (!this.inventoryOpen) {
      for (let i = 1; i < this.players.length; i++) {
        const sp = this.players[i];
        if (!sp || !sp.bow || sp._aimAngle == null || this._respawnTimers[i] > 0) continue;
        const R  = 64;
        const rx = sp.cx + Math.cos(sp._aimAngle) * R - this.camera.x;
        const ry = sp.cy + Math.sin(sp._aimAngle) * R - this.camera.y;
        const r  = 8;
        ctx.save();
        ctx.strokeStyle = sp.bowDrawing ? 'rgba(120,180,255,0.95)' : 'rgba(120,180,255,0.6)';
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.moveTo(rx - r, ry); ctx.lineTo(rx - 3, ry);
        ctx.moveTo(rx + 3, ry); ctx.lineTo(rx + r, ry);
        ctx.moveTo(rx, ry - r); ctx.lineTo(rx, ry - 3);
        ctx.moveTo(rx, ry + 3); ctx.lineTo(rx, ry + r);
        ctx.stroke();
        ctx.beginPath(); ctx.arc(rx, ry, 3, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }

    // Draw collectible placed items (platformer + normal mode)
    if (this.gameMode === 'platformer' || this.gameMode === 'normal') this._drawPlatformerItems(ctx);
    // Emerald collectibles (campaign-prep, opt-in) — world-space draw.
    if (this._emeraldsActive && typeof EMERALD_SYSTEM !== 'undefined' && EMERALD_SYSTEM.draw)
      EMERALD_SYSTEM.draw(ctx, this.camera, this.frameCount);
    // Colour tints for non-gold Goal Stars (play + sandbox editor).
    if (this._goalColorMap) this._drawGoalColorOverlays(ctx);
    // Phase 16: Draw items dropped by other players
    if (window.multiplayerManager?.isConnected)
      window.multiplayerManager.drawDroppedItems(ctx, this.camera);

    // Mobs, arrows, damage numbers, explosions (suppressed in sandbox)
    if (this.gameMode !== 'sandbox') this.mobManager.draw(ctx, this.camera);

    this._renderEndCrystalGlow(ctx);
    this._renderDragon(ctx);
    this._renderExitPortal(ctx);
    this._renderWither(ctx);
    this._drawCheckpoints(ctx);

    // Wither fade: black overlay covers world/mobs/Wither but NOT the player
    if (this._witherFade && this._witherFade.alpha > 0) {
      ctx.save();
      ctx.fillStyle = `rgba(0,0,0,${this._witherFade.alpha.toFixed(3)})`;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.restore();
    }

    // Hide the player while dead/respawning so only the body-part scatter shows
    // (no lingering "ghost" sprite). SR uses its own dead flag; other modes use the
    // respawn timer (arena/co-op) or the solo death state.
    const _p1Hidden = (this.gameMode === 'speedrunner' && this._sr?.dead)
                      || this._p1RespawnTimer > 0 || this.state === 'dead';
    if (!_p1Hidden) this.player.draw(ctx, this.camera);
    // Phase 16: Draw other multiplayer players (behind P2 labels)
    if (window.multiplayerManager?.isConnected)
      window.multiplayerManager.drawOtherPlayers(ctx, this.camera);
    // Draw secondary players (P2-P4) + per-player labels when multiplayer active
    // (Phase 12/3B). Per-player name-tag colors distinguish up to 4 players.
    if (this.activePlayers().length >= 2) {
      const LABEL_COLORS = ['#88AAFF', '#FF8888', '#88DD88', '#FFCC55']; // P1-P4
      let respawnStackY = CANVAS_H / 2 + 40;
      for (let i = 1; i < this.players.length; i++) {
        const sp = this.players[i];
        if (sp && this._respawnTimers[i] === 0) sp.draw(ctx, this.camera);
      }
      ctx.save();
      ctx.font = 'bold 9px Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      // P1 label
      const p1s = this.camera.toScreen(this.player.x + this.player.width / 2, this.player.y - 6);
      ctx.fillStyle = LABEL_COLORS[0]; ctx.fillText('P1', p1s.x, p1s.y);
      // Secondary labels / respawn countdowns
      for (let i = 1; i < this.players.length; i++) {
        const sp = this.players[i];
        if (!sp) continue;
        ctx.textAlign = 'center';
        if (this._respawnTimers[i] === 0) {
          ctx.font = 'bold 9px Courier New';
          const s = this.camera.toScreen(sp.x + sp.width / 2, sp.y - 6);
          ctx.fillStyle = LABEL_COLORS[i] || '#FFFFFF'; ctx.fillText('P' + (i + 1), s.x, s.y);
        } else {
          const sec = Math.ceil(this._respawnTimers[i] / 60);
          ctx.font = 'bold 11px Courier New'; ctx.fillStyle = LABEL_COLORS[i] || '#FFFFFF';
          ctx.fillText(`P${i + 1} respawn: ${sec}s`, CANVAS_W / 2, respawnStackY);
          respawnStackY += 18;
        }
      }
      ctx.restore();
    }
    this._drawEndPortalForeground(ctx);
    // SR world-space overlays (particles, ghost, speed items) drawn inside zoom context
    if (this.gameMode === 'speedrunner' && this._sr) {
      this._drawSRWorldOverlay(ctx);
    }
    // Arena world-space overlays (emeralds, power-ups) drawn inside the zoom context
    if (this.isArena) this._drawArenaWorldOverlay(ctx);
    // Sandbox WORLD overlays (placed eggs/emeralds/power-ups/hill/spawn-lines/items
    // + portal labels) must scale with the zoom too — draw them inside the transform.
    if (this.gameMode === 'sandbox' && this.sandbox && this.sandbox.drawWorld) {
      this.sandbox.drawWorld(ctx, this.camera, this.frameCount);
    }
    // Death body-part scatter (world-space, scales with zoom). SR draws its own.
    if (this.gameMode !== 'speedrunner' && this._deathParts.length) this._drawDeathParts(ctx);
    ctx.restore(); // end world zoom (matches the unconditional save above)
    this._drawHUD(ctx, hoverRow, hoverCol);
    // Phase 16: Multiplayer HUD (player list + connection badge)
    if (window.multiplayerManager?.isConnected) window.multiplayerManager.drawHUD(ctx);
    // Phase 17-E: Remote mob rendering for online joiners
    if (window.multiplayerManager?.isConnected) window.multiplayerManager.drawRemoteMobs(ctx, this.camera);

    // Sandbox HUD (palette, hotbar, popups) — screen-space, NOT zoomed.
    if (this.gameMode === 'sandbox' && this.sandbox) {
      this.sandbox.drawHud(ctx, this.input, this.player, this.frameCount);
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
    if (this._onlineGameId) this._drawGameNotifications(ctx);
    if (this.gameMode !== 'speedrunner' && (this.player.godMode || this.player.hyperLevel > 0)) this._drawGodModeHud(ctx);
    if (this._teleportMenu && this.player.godMode) this._drawTeleportMenu(ctx);
    if (this.gameMode === 'platformer') this._drawPlatformerHUD(ctx);
    if (this.gameMode === 'speedrunner') this._drawSpeedRunnerHUD(ctx);

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

    if (this._dragonVictoryScreen)  this._drawDragonVictoryScreen(ctx);
    if (this._witherVictoryScreen)  this._drawWitherVictoryScreen(ctx);
    if (this._worldSettingsOpen)   this._drawWorldSettings(ctx);
    if (this._musicPlayerUI)       this._drawMusicPlayerUI(ctx);
    if (this.state === 'dead' && this.gameMode !== 'speedrunner') this._drawDead(ctx);
    if (this.state === 'won'  && this.gameMode !== 'speedrunner') this._drawWin(ctx);
    if (this.isArena && this.arenaState.phase === 'countdown') this._drawArenaCountdown(ctx);
    if (this.isArena && this.arenaState.phase === 'ended')     this._drawArenaEnd(ctx);
    if (this._onlineGameId && this._onlineMenuOpen) this._drawOnlineMenu(ctx);
    // The pause menu itself is now an HTML overlay (js/pause-menu.js); only the
    // arena objectives panel still draws on canvas beside it while paused.
    if (this.state === 'paused' || this.state === 'confirmExit') {
      // Classic mode draws the full canvas menu (which itself draws the arena
      // objectives panel); default HTML mode draws only the objectives panel
      // beside the overlay.
      if (this._useClassicPause) this._drawPauseOverlay(ctx);
      else this._drawArenaObjectivesPanel(ctx);
    }
    if (this._saveDialog) this._drawSaveDialog(ctx);
    if (this._tutorialOpen) this._drawTutorial(ctx);

    // Controller cursor — drawn last so it sits on top of every overlay
    if (_p1GpConnected) {
      const inOverlay = this.inventoryOpen || this._worldSettingsOpen || this._htmlSettingsOpen ||
                        this.state === 'paused' || this.state === 'confirmExit' ||
                        this.state === 'dead'   || this._tutorialOpen ||
                        this._saveDialog != null || this._musicPlayerUI != null ||
                        this.craftingMenu?.open;
      if (inOverlay) this._drawControllerCursor(ctx);
    }

    ctx.restore(); // matches screen-shake save at top of _render
  }

  _drawControllerCursor(ctx) {
    const mx = this.input.mouse.x, my = this.input.mouse.y;
    const r  = 7;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.88)';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(mx - r, my); ctx.lineTo(mx - 2, my);
    ctx.moveTo(mx + 2, my); ctx.lineTo(mx + r, my);
    ctx.moveTo(mx, my - r); ctx.lineTo(mx, my - 2);
    ctx.moveTo(mx, my + 2); ctx.lineTo(mx, my + r);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath(); ctx.arc(mx, my, 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
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

    // Hotbar row — slots 0-1 are reserved weapons (sword, bow); the pickaxe was
    // removed (mining is always-active). Slots 2-8 are inventory (hotbar[2..8],
    // indices unchanged, so placement/pickup are unaffected).
    for (let c = 0; c < L.cols; c++) {
      const sx = L.contentX + c * (L.slotSz + L.gap);
      if (c < 2) {
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
        const toolKey  = c === 0 ? this.player.sword : this.player.bow;
        const toolIcon = c === 0 ? '⚔' : '🏹';
        const toolData = toolKey ? TOOL_DATA[toolKey] : null;
        ctx.save();
        if (!toolData) ctx.globalAlpha = 0.35;
        ctx.fillStyle = toolData ? toolData.color : '#AAAAAA';
        ctx.font = `${Math.floor(L.slotSz * 0.45)}px serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(toolIcon, sx + L.slotSz / 2, L.hotbarY + L.slotSz / 2);
        ctx.restore();
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
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

    // Smooth sky→cave blend based on player centre row (24 = start, 28 = full cave).
    // A forced background theme pins the blend so it ignores player depth:
    // 'sky' → always full sky (t=0), 'cave' → always full cave (t=1).
    const _theme = this._worldAdvSettings?.backgroundTheme;
    const t = (_theme === 'cave') ? 1
            : (_theme === 'sky')  ? 0
            : Math.max(0, Math.min(1,
                (this.player.cy - 24 * BLOCK_SIZE) / (4 * BLOCK_SIZE)
              ));

    if (t < 1) {
      // Day/night sky colors with dawn/dusk blend
      const dn = this._dayNight;
      const progress = Math.min(1, dn.timer / dn.halfCycleMs);
      let skyBlend = 0; // 0 = full day, 1 = full night
      if (dn.isDay) {
        skyBlend = progress < (DAWN_DUSK_MS / dn.halfCycleMs)
          ? 1 - (progress / (DAWN_DUSK_MS / dn.halfCycleMs)) // dawn: night→day
          : 0;
      } else {
        skyBlend = progress < (DAWN_DUSK_MS / dn.halfCycleMs)
          ? progress / (DAWN_DUSK_MS / dn.halfCycleMs)       // dusk: day→night
          : 1;
      }

      // Day sky
      if (skyBlend < 1) {
        const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
        sky.addColorStop(0,   '#1a6ea8');
        sky.addColorStop(0.5, '#4da6d8');
        sky.addColorStop(1,   '#b8e0f0');
        ctx.fillStyle   = sky;
        ctx.globalAlpha = (1 - skyBlend) * (1 - t);
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.globalAlpha = 1;
      }
      // Night sky
      if (skyBlend > 0) {
        const night = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
        night.addColorStop(0, '#04080F');
        night.addColorStop(1, '#0A1020');
        ctx.fillStyle   = night;
        ctx.globalAlpha = skyBlend * (1 - t);
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.globalAlpha = 1;
      }
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

  // ── Day/night cycle ──────────────────────────────────────────

  _updateDayNight(deltaMs) {
    const dn = this._dayNight;
    dn.timer += deltaMs;
    if (dn.timer >= dn.halfCycleMs) {
      dn.timer -= dn.halfCycleMs;
      if (dn.isDay) {
        dn.isDay = false;
      } else {
        dn.isDay = true;
        dn.nightPhase = (dn.nightPhase + 1) % 8;
      }
    }
  }

  _generateStars() {
    const stars = [];
    let seed = 12345;
    const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xFFFFFFFF; };
    for (let i = 0; i < 120; i++) {
      stars.push({
        x:          rng() * (CANVAS_W + 600),
        y:          rng() * CANVAS_H * 0.68,
        size:       rng() < 0.75 ? 1 : 2,
        brightness: 0.35 + rng() * 0.65,
      });
    }
    return stars;
  }

  _loadCelestialSprites() {
    const sun = new Image();
    sun.onload = () => { this._sunSprite = sun; };
    sun.src = 'images/Sun.png';
    for (let i = 0; i < 8; i++) {
      const moon = new Image();
      ((idx) => { moon.onload = () => { this._moonSprites[idx] = moon; }; })(i);
      moon.src = `images/Moon-${i}.png`;
    }
  }

  _drawCelestial(ctx) {
    const dn        = this._dayNight;
    const progress  = Math.min(1, dn.timer / dn.halfCycleMs);
    const dawnFrac  = DAWN_DUSK_MS / dn.halfCycleMs;
    let skyBlend;
    if (dn.isDay) {
      skyBlend = progress < dawnFrac ? 1 - (progress / dawnFrac) : 0;
    } else {
      skyBlend = progress < dawnFrac ? progress / dawnFrac : 1;
    }
    const sunAlpha   = 1 - skyBlend;
    const nightAlpha = skyBlend;

    const screenX = -100 + (CANVAS_W + 200) * progress;
    const worldRow = SUN_ARC_START_ROW - Math.sin(progress * Math.PI) * (SUN_ARC_START_ROW - SUN_ARC_PEAK_ROW);
    const screenY  = worldRow * BLOCK_SIZE - this.camera.y;

    if (nightAlpha > 0) this._drawStars(ctx, nightAlpha);
    if (sunAlpha   > 0 && dn.isDay)   this._drawSun(ctx, screenX, screenY, sunAlpha);
    if (nightAlpha > 0 && !dn.isDay)  this._drawMoon(ctx, screenX, screenY, nightAlpha);
  }

  _drawStars(ctx, alpha) {
    ctx.save();
    for (const star of this._stars) {
      const sx = ((star.x - this.camera.x * 0.04) % (CANVAS_W + 600) + CANVAS_W + 600) % (CANVAS_W + 600) - 100;
      const sy = star.y;
      if (sy < 0 || sy > CANVAS_H) continue;
      ctx.globalAlpha = alpha * star.brightness;
      ctx.fillStyle   = '#FFFFFF';
      ctx.fillRect(sx, sy, star.size, star.size);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _drawSun(ctx, sx, sy, alpha) {
    const SIZE = 56;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (this._sunSprite) {
      ctx.drawImage(this._sunSprite, sx - SIZE / 2, sy - SIZE / 2, SIZE, SIZE);
    } else {
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.arc(sx, sy, SIZE / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _drawMoon(ctx, sx, sy, alpha) {
    const SIZE = 48;
    ctx.save();
    ctx.globalAlpha = alpha;
    const sprite = this._moonSprites[this._dayNight.nightPhase];
    if (sprite) {
      ctx.drawImage(sprite, sx - SIZE / 2, sy - SIZE / 2, SIZE, SIZE);
    } else {
      ctx.fillStyle = '#E8E8D0';
      ctx.beginPath();
      ctx.arc(sx, sy, SIZE / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
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
    if (this.sandbox.isEggSelected)       return;
    if (this.sandbox.isToolSelected)      return;
    if (this.sandbox.isBlockItemSelected) return;
    // Non-block placeables: preview THEIR own icon (translucent) at the cursor —
    // never fall through to the block-ghost, which would wrongly show the last
    // selectedBlock (e.g. a Goal Star) while an emerald/spawn item is selected.
    {
      const pcx = hoverCol * BLOCK_SIZE - this.camera.x + BLOCK_SIZE / 2;
      const pcy = hoverRow * BLOCK_SIZE - this.camera.y + BLOCK_SIZE / 2;
      const fc  = this.frameCount;
      const drawGhost = (fn) => { ctx.save(); ctx.globalAlpha = 0.5; try { fn(); } catch (e) {} ctx.restore(); };
      if (this.sandbox.isEmeraldSelected)    { drawGhost(() => _drawEmeraldIcon(ctx, pcx, pcy, fc, false)); return; }
      if (this.sandbox.isPowerupSelected)    { drawGhost(() => _drawPowerupIcon(ctx, pcx, pcy, 'HEALTH', fc, false)); return; }
      if (this.sandbox.isSpawnPointSelected) { drawGhost(() => _drawSpawnPointMarker(ctx, pcx, pcy, 1, fc)); return; }
      if (this.sandbox.isSpawnLineSelected)  { drawGhost(() => _drawSpawnLineMarker(ctx, pcx, pcy, 1, fc)); return; }
      if (this.sandbox.isArenaObjSelected)   { drawGhost(() => _drawArenaObjMarker(ctx, pcx, pcy, { type: this.sandbox.selectedArenaObj, team: 0, slot: 1 }, fc, true)); return; }
      if (this.sandbox.isHillSelected)       { drawGhost(() => { ctx.fillStyle = '#f1c40f'; ctx.fillRect(pcx - 11, pcy + 2, 22, 5); ctx.fillStyle = '#fff7c0'; ctx.font = 'bold 13px Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('★', pcx, pcy - 4); }); return; }
    }
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
    // Wither Altar: register in altar list
    if (this.sandbox.selectedBlock === SB_WITHER_ALTAR) {
      this._registerWitherAltar(anchorRow, anchorCol);
      this._notify('Wither Altar placed — use U with Wither Skulls (×2) and Soul Sand (×4) to summon the Wither', '#886622', 340);
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
        this._rsEnqueue({ col: c, row: r, powered, frame: this.frameCount + this._rsStepFrames() });
      }
      // Adjacent transmitter block
      if (this.level.get(r, c) === BLOCK.TRANSMITTER) {
        this._rsEnqueue({ type: 'transmitter', col: c, row: r, frame: this.frameCount + this._rsStepFrames() });
      }
      // Adjacent gate with input facing this source
      const gate = this._gateBlocks.get(`${c},${r}`);
      if (gate && gate.inputSide) {
        const [gdr, gdc] = GD[gate.inputSide];
        if (c + gdc === srcCol && r + gdr === srcRow) {
          this._rsEnqueue({ type: 'gate', col: c, row: r, frame: this.frameCount + this._rsStepFrames() });
        }
      }
      if (gate && gate.type === 'and' && gate.inputSide2) {
        const [gdr2, gdc2] = GD[gate.inputSide2];
        if (c + gdc2 === srcCol && r + gdr2 === srcRow) {
          this._rsEnqueue({ type: 'gate', col: c, row: r, frame: this.frameCount + this._rsStepFrames() });
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
    const f = frame ?? (this.frameCount + this._rsStepFrames());
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
      emeralds: this.sandbox ? this.sandbox.placedEmeralds.map(e => ({...e})) : [],
      powerups: this.sandbox ? this.sandbox.placedPowerups.map(p => ({...p})) : [],
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
      this.sandbox.placedEmeralds = (snap.emeralds || []).map(e => ({...e}));
      this.sandbox.placedPowerups = (snap.powerups || []).map(p => ({...p}));
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
        if (ir >= r1 && ir <= r2 && ic >= c1 && ic <= c2)
          items.push({dr: ir - r1, dc: ic - c1, toolKey: it.toolKey ?? null, blockType: it.blockType ?? null, count: it.count ?? null});
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
      for (const {dr, dc, toolKey, blockType, count} of buf.items) {
        const r = anchorRow + dr, c = anchorCol + dc;
        if (r < 0 || r >= this.level.height || c < 0 || c >= this.level.width) continue;
        this.sandbox.placedItems.push({col: c, row: r, wx: c * BLOCK_SIZE + BLOCK_SIZE / 2, wy: r * BLOCK_SIZE + BLOCK_SIZE / 2, toolKey: toolKey ?? null, blockType: blockType ?? null, count: count ?? null, vy: 0, bobOffset: Math.random() * Math.PI * 2});
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
    } else if (blockType === BLOCK.WITHER_SKULL_SLOT || blockType === BLOCK.SOUL_SAND_SLOT ||
               blockType === BLOCK.ALTAR_BLOCK) {
      // Remove any altar that contains this block
      this._witherAltars = this._witherAltars.filter(a => {
        const fp = [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,1],[3,0],[3,1],[3,2]];
        return !fp.some(([dr, dc]) => a.anchorRow + dr === row && a.anchorCol + dc === col);
      });
      this.level.set(row, col, BLOCK.AIR);
    } else if (blockType === BLOCK.NETHER_PORTAL_FRAME || blockType === BLOCK.NETHER_PORTAL ||
               blockType === BLOCK.END_PORTAL || blockType === BLOCK.END_PORTAL_FRAME ||
               blockType === BLOCK.END_PORTAL_FRAME_FULL) {
      this._sandboxRemovePortal(row, col);
    } else {
      this.level.set(row, col, BLOCK.AIR);
      if (blockType === BLOCK.GOAL) {
        this.level.goalCol = -1;
        this.level.goalRow = -1;
        this._setGoalColor(row, col, 0);
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
      if (blockType === BLOCK.MUSIC_PLAYER) {
        const mpk = `${col},${row}`;
        if (this._musicPlayerUI?.block?.col === col && this._musicPlayerUI?.block?.row === row) {
          this._musicPlayerUI = null;
        }
        this._musicPlayerBlocks.delete(mpk);
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

  // ── Arrow consumption ───────────────────────────────────────

  // Returns aim angle (radians) for keyboard/snap-aim.
  // upHeld = jump key held, downHeld = crouch key held at the moment of release.
  _snapAimAngle(player, upHeld, downHeld) {
    const f = player.facing;                        // 1=right, -1=left
    if (upHeld && !downHeld) {
      const moving = Math.abs(player.vx) > 0.5;
      return moving
        ? (f > 0 ? -Math.PI / 4 : -(Math.PI * 3 / 4))  // diagonal up in facing direction
        : -Math.PI / 2;                                   // straight up when stationary
    }
    if (downHeld && !player.onGround) {
      return f > 0 ? Math.PI / 4 : Math.PI * 3 / 4;     // diagonal down (airborne only)
    }
    return f > 0 ? 0 : Math.PI;                           // straight ahead
  }

  _exportAsTemplate() {
    // Build a save object identical to what SandboxSaves.save() would produce,
    // then trigger a browser download as JSON. Drop it in templates/ to use as
    // the default world for any game mode.
    const pName = this._sbPlayerName || 'Template';
    const wName = this._sbWorldName  || 'world';
    const result = SandboxSaves.save(
      pName, wName,
      this.level, this.sandbox, this.player,
      this.redstone, this._dustBlocks, this._gateBlocks,
      this._transmitters, this._receivers,
      this._chests, this._ruinedPortals, this._endPortalAnchors,
      this._dragon, this._endCrystals, this._dragonDefeated,
      this._mobDropSettings, this._worldAdvSettings,
      this._collectedDiscs, this._musicPlayerBlocks, this._witherAltars
    );
    if (!result.ok) { this._notify('Export failed: ' + (result.error || '?'), '#FF4444', 240); return; }
    const raw = localStorage.getItem(SandboxSaves.key(pName, wName));
    if (!raw) { this._notify('Export failed — save not found', '#FF4444', 180); return; }
    const blob = new Blob([raw], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `world-sandbox.json`;
    a.click();
    URL.revokeObjectURL(url);
    this._notify('Template exported — place in templates/ folder', '#88FF88', 240);
  }

  _consumeArrow() {
    // Remove 1 arrow from hotbar first, then inventory
    for (const slots of [this.player.hotbar, this.player.inventory]) {
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        if (s && s.type === BLOCK.ARROW && s.count > 0) {
          s.count--;
          if (s.count === 0) slots[i] = null;
          return;
        }
      }
    }
  }

  // Consume one arrow from any player's hotbar/inventory (Phase 3B).
  _consumeArrowForPlayer(p) {
    if (!p) return;
    for (const slots of [p.hotbar, p.inventory]) {
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        if (s && s.type === BLOCK.ARROW && s.count > 0) {
          s.count--;
          if (s.count === 0) slots[i] = null;
          return;
        }
      }
    }
  }

  _consumeArrowP2() {
    if (!this.player2) return;
    for (const slots of [this.player2.hotbar, this.player2.inventory]) {
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        if (s && s.type === BLOCK.ARROW && s.count > 0) {
          s.count--;
          if (s.count === 0) slots[i] = null;
          return;
        }
      }
    }
  }

  // ── Ruined Portal repair (Platformer/Normal: hold Obsidian, press U) ──

  _tryRepairPortalFromHotbar() {
    if (!this._ruinedPortals.size) return false;
    const slot = this.player.hotbar[this.player.selectedSlot];
    if (!slot || slot.type !== BLOCK.OBSIDIAN) return false;

    const pRow = Math.floor(this.player.cy / BLOCK_SIZE);
    const pCol = Math.floor(this.player.cx / BLOCK_SIZE);

    for (const portal of this._ruinedPortals.values()) {
      if (portal.activated) continue;
      const { anchorRow, anchorCol } = portal;
      if (pRow < anchorRow - 1 || pRow > anchorRow + 5) continue;
      if (pCol < anchorCol - 1 || pCol > anchorCol + 4) continue;

      // Fill the first empty gap position
      for (const [dr, dc] of Game.RP_GAP_OFFSETS) {
        const r = anchorRow + dr, c = anchorCol + dc;
        if (this.level.get(r, c) !== BLOCK.OBSIDIAN) {
          this.level.set(r, c, BLOCK.OBSIDIAN);
          this._portalObsidianCells.add(`${c},${r}`);
          this.player.takeFromSlot(this.player.selectedSlot);

          const remaining = Game.RP_GAP_OFFSETS.filter(([gdr, gdc]) =>
            this.level.get(anchorRow + gdr, anchorCol + gdc) !== BLOCK.OBSIDIAN
          ).length;
          if (remaining === 0) {
            this._notify('Portal repaired! Use Flint & Steel (U) to activate.', '#AA44FF', 240);
          } else {
            this._notify(`Obsidian placed. ${remaining} gap${remaining !== 1 ? 's' : ''} remaining.`, '#9977CC', 140);
          }
          return true;
        }
      }
    }
    return false;
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
        this._playSound('sounds/enable-end-portal.mp3');
        this._notify('The End Portal activates! Press U inside to enter The End.', '#AA44FF', 360);
      } else {
        this._playSound('sounds/placing-eye-of-ender.mp3');
        this._notify(`Eye of Ender placed! (${anchor.eyeCount}/5)`, '#AA44FF', 140);
      }
      if (this._onlineGameId && window.multiplayerManager?.isCreator) {
        const changes = [{ row, col, block: BLOCK.END_PORTAL_FRAME_FULL }];
        if (anchor.eyeCount >= 5) {
          for (let dr = 0; dr <= 2; dr++)
            for (let dc = 1; dc <= 3; dc++)
              changes.push({ row: anchor.row + dr, col: anchor.col + dc, block: BLOCK.END_PORTAL });
        }
        window.multiplayerManager.sendBlockChanged(changes, {
          endPortalAnchor: { col: anchor.col, row: anchor.row, eyeCount: anchor.eyeCount, active: anchor.active },
        });
      }
      return;
    }
    this._notify('No inactive portal frame here', '#888888', 80);
  }

  // ── Ender Dragon (Phase 11A-2) ────────────────────────────

  _playerAttackDragon() {
    const p = this.player;
    // Dragon melee
    const d = this._dragon;
    if (d && d.isAlive && d.state !== 'defeated') {
      const bodyCx = d.x + DRAGON_BODY_W / 2;
      const bodyCy = d.y + DRAGON_BODY_H / 2;
      const headCx = d._headX + DRAGON_HEAD_W / 2;
      const headCy = d._headY + DRAGON_HEAD_H / 2;
      const bodyDist = Math.hypot(bodyCx - p.cx, bodyCy - p.cy);
      const headDist = Math.hypot(headCx - p.cx, headCy - p.cy);
      if (bodyDist <= ATTACK_REACH || headDist <= ATTACK_REACH) {
        const dmg = p.weaponDamage;
        if (dmg > 0) {
          d.hp = Math.max(0, d.hp - dmg);
          this.mobManager.damageNums.push(
            new DamageNumber(bodyCx, d.y - 8, dmg, '#FF44FF')
          );
        }
      }
    }
    // End Crystal melee
    for (const crystal of this._endCrystals) {
      if (crystal.destroyed) continue;
      const cx = crystal.col * BLOCK_SIZE + BLOCK_SIZE / 2;
      const cy = crystal.row * BLOCK_SIZE + BLOCK_SIZE / 2;
      if (Math.hypot(cx - p.cx, cy - p.cy) <= ATTACK_REACH) {
        this._destroyCrystal(crystal);
      }
    }
  }

  _destroyCrystal(crystal) {
    if (crystal.destroyed) return;
    crystal.destroyed = true;
    this.level.set(crystal.row, crystal.col, BLOCK.AIR);
    this._playSound('sounds/end-crystal-explosion.mp3');
    this._notify('End Crystal destroyed!', '#FFAA00', 200);
  }

  _drawDragonHUD(ctx) {
    const d = this._dragon;
    if (!d || !d.isAlive || d.state === 'defeated') return;
    // Only show in End biome
    const playerCol = Math.floor(this.player.cx / BLOCK_SIZE);
    if (playerCol < BIOME_END_START) return;

    const barW = 200, barH = 12;
    const bx = CANVAS_W - barW - 12, by = 12;
    const fill = Math.max(0, (d.hp / d.maxHp) * barW);

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    _roundRect(ctx, bx - 2, by - 14, barW + 4, barH + 18, 4); ctx.fill();

    // Label
    ctx.font = 'bold 9px Courier New';
    ctx.fillStyle = '#CC88FF';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('ENDER DRAGON', bx, by - 2);

    // Dark track
    ctx.fillStyle = '#330033';
    ctx.fillRect(bx, by, barW, barH);

    // Purple fill
    const pct = d.hp / d.maxHp;
    ctx.fillStyle = pct > 0.5 ? '#AA44FF' : pct > 0.25 ? '#FF44AA' : '#FF2222';
    ctx.fillRect(bx, by, Math.round(fill), barH);

    // Segment ticks (10 HP each)
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    for (let i = 1; i < 10; i++) {
      ctx.fillRect(bx + i * 20 - 0.5, by, 1, barH);
    }

    // HP text
    ctx.font = '9px Courier New';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.ceil(d.hp)}/${d.maxHp} HP`, bx + barW, by + barH + 9);
    ctx.textAlign = 'left';
  }

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
    // Reset defeat state so repeated fights work correctly
    this._dragonDefeated    = false;
    this._dragonExitPortal  = false;
    this._dragonVictoryScreen = false;
    const _dragonHpMult = this._worldAdvSettings?.bossHealthMultiplier ?? 1.0;
    const _dragonMaxHp  = Math.round(100 * _dragonHpMult);
    this._dragon = {
      x:                      spawnCol * BLOCK_SIZE,
      y:                      spawnRow * BLOCK_SIZE,
      direction:              'left',
      hp:                     _dragonMaxHp,
      maxHp:                  _dragonMaxHp,
      animationFrame:         0,
      verticalDirection:      1,
      state:                  'flying',
      isAlive:                true,
      _distTracker:           0,
      fireAttackCooldown:     180,  // 3 s before first attack
      headOpen:               false,
      headOpenTimer:          0,
      fireProjectiles:        [],
      fireballAttackDisabled: false,
      _headX:                 0,
      _headY:                 0,
      diveDistance:           0,
      diveStartY:             0,
      diveGroundDist:         0,
      defeatTimer:            0,
      roarTimer:              0,
      nextRoarTime:           Math.random() * 4000 + 3000,  // 3-7 s in ms
      wingFlapPlayed:         false,
    };
    // Restore saved in-progress state from load (skip defeated/dead states — they should respawn fresh)
    if (this._savedDragonState) {
      const ds = this._savedDragonState;
      if (ds.state !== 'defeated' && (ds.hp ?? 1) > 0) {
        if (typeof ds.hp    === 'number') this._dragon.hp    = ds.hp;
        if (typeof ds.x     === 'number') this._dragon.x     = ds.x;
        if (typeof ds.y     === 'number') this._dragon.y     = ds.y;
        if (ds.state)                     this._dragon.state = ds.state;
        if (ds.fireballAttackDisabled)    this._dragon.fireballAttackDisabled = true;
      }
      this._savedDragonState = null;
    }
  }

  _updateDragon() {
    const d = this._dragon;
    if (!d) return;

    // ── Defeat animation ticker ───────────────────────────────
    if (d.state === 'defeated') {
      d.defeatTimer++;
      if (d.defeatTimer >= 240 && !this._dragonDefeated) {
        d.isAlive = false;
        this._dragonDefeated      = true;
        this._dragonExitPortal    = true;
        this._dragonVictoryScreen = true;
        // Drop Dragon Egg + Dragon's Lament music disc at defeat location
        this.mobManager.dropItems([
          { x: d.x + DRAGON_BODY_W / 2, y: d.y, itemKey: BLOCK.DRAGON_EGG, amount: 1 },
          { x: d.x + DRAGON_BODY_W / 2 + BLOCK_SIZE, y: d.y, itemKey: 'disc:DRAGONS_LAMENT', amount: 1 },
        ]);
      }
      return;
    }

    if (!d.isAlive) return;

    // ── Check for defeat ──────────────────────────────────────
    if (d.hp <= 0) {
      d.hp = 0;
      d.state = 'defeated';
      d.defeatTimer = 0;
      d.fireProjectiles = [];
      this._playSound('sounds/ender-dragon-defeated.mp3');
      this._playVictoryMusic();
      return;
    }

    const LEFT_BOUND  = BIOME_END_START * BLOCK_SIZE;
    const RIGHT_BOUND = (BIOME_END_START + 149) * BLOCK_SIZE - DRAGON_BODY_W;
    const BOB_OFFSETS = [0.25, 0.125, 0, -0.125, -0.25];

    // ── Horizontal movement (3× speed while diving / ground-skimming) ─────
    const hSpeed = (d.state === 'diving' || d.state === 'dive_ground') ? DRAGON_SPEED * 3 : DRAGON_SPEED;
    if (d.direction === 'left') {
      d.x -= hSpeed;
      if (d.x <= LEFT_BOUND) {
        d.x = LEFT_BOUND;
        d.direction = 'right';
        if (d.state === 'flying' && Math.random() < 0.3) {
          d.state = 'dive_ready';
          d.diveStartY = d.y;
          d.fireballAttackDisabled = true;
        }
      }
    } else {
      d.x += hSpeed;
      if (d.x >= RIGHT_BOUND) {
        d.x = RIGHT_BOUND;
        d.direction = 'left';
        if (d.state === 'flying' && Math.random() < 0.3) {
          d.state = 'dive_ready';
          d.diveStartY = d.y;
          d.fireballAttackDisabled = true;
        }
      }
    }

    // ── Dive state machine ────────────────────────────────────
    if (d.state === 'dive_ready') {
      const horizDist = Math.abs(this.player.cx - (d.x + DRAGON_BODY_W / 2));
      if (horizDist <= 10 * BLOCK_SIZE) {
        d.state = 'diving';
        d.diveDistance = 0;
        this._playSound('sounds/ender-dragon-dive.mp3');
      }
    } else if (d.state === 'diving') {
      const diveSpeed = 3 * DRAGON_SPEED;
      d.y += diveSpeed;
      d.diveDistance += diveSpeed;
      // Player body contact during dive
      if (this.player.x + this.player.width > d.x && this.player.x < d.x + DRAGON_BODY_W &&
          this.player.y + this.player.height > d.y && this.player.y < d.y + DRAGON_BODY_H) {
        if (this.player.iFrames === 0 && this.player.takeDamage(20)) {
          this.mobManager.addPlayerDamageNum(this.player, 20);
          this._notify('Dragon dive strikes you!', '#FF4400', 120);
          this._checkDeath();
        }
        d.state = 'dive_return';
      } else if (d.y >= DIVE_GROUND_Y) {
        // Reached ground level — start horizontal skim
        d.y = DIVE_GROUND_Y;
        d.state = 'dive_ground';
        d.diveGroundDist = 0;
      }
    } else if (d.state === 'dive_ground') {
      d.y = DIVE_GROUND_Y; // stay level
      d.diveGroundDist += hSpeed;
      // Player contact at ground level
      if (this.player.x + this.player.width > d.x && this.player.x < d.x + DRAGON_BODY_W &&
          this.player.y + this.player.height > d.y && this.player.y < d.y + DRAGON_BODY_H) {
        if (this.player.iFrames === 0 && this.player.takeDamage(20)) {
          this.mobManager.addPlayerDamageNum(this.player, 20);
          this._notify('Dragon skims you!', '#FF4400', 120);
          this._checkDeath();
        }
      }
      if (d.diveGroundDist >= 10 * BLOCK_SIZE) {
        d.state = 'dive_return';
      }
    } else if (d.state === 'dive_return') {
      d.y -= 3 * DRAGON_SPEED;
      if (d.y <= d.diveStartY) {
        d.y = d.diveStartY;
        d.state = 'flying';
        d.fireballAttackDisabled = false;
      }
    }

    // ── Block-tick: advance animation + bobbing (flying only) ─
    d._distTracker += DRAGON_SPEED;
    while (d._distTracker >= BLOCK_SIZE) {
      d._distTracker -= BLOCK_SIZE;
      if (d.state === 'flying') {
        d.animationFrame += d.verticalDirection;
        if (d.animationFrame >= 4) { d.animationFrame = 4; d.verticalDirection = -1; }
        if (d.animationFrame <= 0) { d.animationFrame = 0; d.verticalDirection =  1; }
        d.y += BOB_OFFSETS[d.animationFrame] * BLOCK_SIZE;
      }
    }
    // ── Dragon sounds: only play when player is in End dimension ─
    const playerInEnd = this.player.x >= BIOME_END_START * BLOCK_SIZE;
    if (playerInEnd) {
      // Periodic roar (every 3-7 seconds while alive)
      if (d.isAlive && d.state !== 'defeated') {
        d.roarTimer += 1000 / 60;
        if (d.roarTimer >= d.nextRoarTime) {
          d.roarTimer = 0;
          d.nextRoarTime = Math.random() * 4000 + 3000;
          this._playSound('sounds/ender-dragon.mp3');
        }
      }
      // Wing flap (synced with animationFrame peak)
      if (d.animationFrame === 4 && !d.wingFlapPlayed) {
        this._playSound('sounds/ender-dragon-wing-flap.mp3', 0.7);
        d.wingFlapPlayed = true;
      }
    }
    if (d.animationFrame === 0) d.wingFlapPlayed = false;

    // Crystal healing: once per frame, only when player is in End and healing enabled
    if (this.player.x >= BIOME_END_START * BLOCK_SIZE && !this._worldAdvSettings.disableDragonHealing) {
      for (const crystal of this._endCrystals) {
        if (!crystal.destroyed && d.hp < d.maxHp) {
          const crystalPx = crystal.col * BLOCK_SIZE;
          if (crystalPx >= d.x && crystalPx <= d.x + DRAGON_BODY_W) {
            d.hp = Math.min(d.maxHp, d.hp + 0.5);
          }
        }
      }
    }

    // ── Clamp vertical position (flying / dive states only) ───
    if (d.state === 'flying' || d.state === 'dive_ready') {
      const minY = (DRAGON_SPAWN_ROW - 1) * BLOCK_SIZE;
      const maxY = (DRAGON_SPAWN_ROW + 1) * BLOCK_SIZE;
      d.y = Math.max(minY, Math.min(maxY, d.y));
    }

    // ── Cache head position ────────────────────────────────────
    const playerIsToRight = this.player.x > d.x + DRAGON_BODY_W / 2;
    if (playerIsToRight) {
      d._headX = d.direction === 'left' ? d.x  - 30 : d.x + DRAGON_BODY_W;
    } else {
      d._headX = d.direction === 'right' ? d.x + DRAGON_BODY_W - 20 : d.x - DRAGON_HEAD_W;
    }
    d._headY = d.y + 12;

    // ── Fire attack (flying state only) ───────────────────────
    if (!d.fireballAttackDisabled && d.state === 'flying') {
      if (d.fireAttackCooldown > 0) {
        d.fireAttackCooldown--;
      } else {
        const fbX = d._headX + DRAGON_HEAD_W / 2;
        const fbY = d._headY + DRAGON_HEAD_H / 2;
        const tDx = this.player.cx - fbX;
        const tDy = this.player.cy - fbY;
        const tDist = Math.hypot(tDx, tDy) || 1;
        const fbSpeed = 6;
        d.fireProjectiles.push({
          x: fbX, y: fbY,
          vx: (tDx / tDist) * fbSpeed,
          vy: (tDy / tDist) * fbSpeed,
          distTraveled: 0,
          alive: true,
        });
        d.headOpen      = true;
        d.headOpenTimer = 60;
        d.fireAttackCooldown = 180;
        this._playSound('sounds/ender-dragon-fireball.mp3');
      }
    }

    // Tick head-open timer
    if (d.headOpenTimer > 0) {
      d.headOpenTimer--;
      if (d.headOpenTimer === 0) d.headOpen = false;
    }

    // ── Update fire projectiles ────────────────────────────────
    const p = this.player;
    d.fireProjectiles = d.fireProjectiles.filter(fb => {
      if (!fb.alive) return false;
      fb.x += fb.vx;
      fb.y += fb.vy || 0;
      fb.distTraveled += Math.hypot(fb.vx, fb.vy || 0);
      if (fb.distTraveled >= 20 * BLOCK_SIZE) return false;
      const fc = Math.floor(fb.x / BLOCK_SIZE);
      const fr = Math.floor(fb.y / BLOCK_SIZE);
      if (this.level.isSolid(fr, fc)) return false;
      if (fb.x > p.x && fb.x < p.x + p.width &&
          fb.y > p.y && fb.y < p.y + p.height) {
        if (p.hasShield && p.crouching && !(typeof CTF_SYSTEM !== 'undefined' && CTF_SYSTEM.isCarrying(p))) {
          this._notify('Shield blocks fire!', '#44AAFF', 90);
        } else {
          if (p.takeDamage(20)) {
            this.mobManager.addPlayerDamageNum(p, 20);
            this._notify('Dragon fire hits you!', '#FF6600', 120);
            this._checkDeath();
          }
        }
        return false;
      }
      return true;
    });

    // ── Player arrows vs dragon ────────────────────────────────
    for (const pa of this.mobManager.playerArrows) {
      if (!pa.alive) continue;
      if (pa.x > d._headX && pa.x < d._headX + DRAGON_HEAD_W &&
          pa.y > d._headY && pa.y < d._headY + DRAGON_HEAD_H) {
        const dmg = pa.damage * 2;
        d.hp = Math.max(0, d.hp - dmg);
        this.mobManager.damageNums.push(
          new DamageNumber(pa.x, d._headY - 8, dmg, '#FF44FF')
        );
        pa.alive = false;
        continue;
      }
      if (pa.x > d.x && pa.x < d.x + DRAGON_BODY_W &&
          pa.y > d.y && pa.y < d.y + DRAGON_BODY_H) {
        d.hp = Math.max(0, d.hp - pa.damage);
        this.mobManager.damageNums.push(
          new DamageNumber(pa.x, d.y - 8, pa.damage, '#FF44FF')
        );
        pa.alive = false;
      }
    }

    // ── Player arrows vs End Crystals ─────────────────────────
    for (const pa of this.mobManager.playerArrows) {
      if (!pa.alive) continue;
      for (const crystal of this._endCrystals) {
        if (crystal.destroyed) continue;
        const cx = crystal.col * BLOCK_SIZE;
        const cy = crystal.row * BLOCK_SIZE;
        if (pa.x > cx && pa.x < cx + BLOCK_SIZE && pa.y > cy && pa.y < cy + BLOCK_SIZE) {
          this._destroyCrystal(crystal);
          pa.alive = false;
          break;
        }
      }
    }
  }

  _renderDragon(ctx) {
    const d = this._dragon;
    if (!d || !d.isAlive || !this._dragonSpritesLoaded) return;

    const sx = Math.floor(d.x - this.camera.x);
    const sy = Math.floor(d.y - this.camera.y);

    // ── Defeat animation ──────────────────────────────────────
    if (d.state === 'defeated') {
      const defeatSprite = this._dragonBodySprites[2];
      if (defeatSprite && defeatSprite.complete && defeatSprite.naturalWidth > 0) {
        const fallOff = Math.floor(d.defeatTimer * 1.5);
        const alpha = d.defeatTimer < 120
          ? 1.0
          : Math.max(0, 1 - (d.defeatTimer - 120) / 120);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(sx + DRAGON_BODY_W / 2, sy + fallOff + DRAGON_BODY_H / 2);
        ctx.scale(1, -1);
        ctx.drawImage(defeatSprite, -DRAGON_BODY_W / 2, -DRAGON_BODY_H / 2, DRAGON_BODY_W, DRAGON_BODY_H);
        ctx.restore();
      }
      return;
    }

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
    const headSprite = this._dragonHeadSprites[d.headOpen ? 1 : 0];
    if (!headSprite || !headSprite.complete || headSprite.naturalWidth === 0) return;

    const playerIsToRight = (this.player.x > d.x + DRAGON_BODY_W / 2);
    let headWorldX, headRotation;

    if (playerIsToRight) {
      headRotation = -DRAGON_HEAD_ROT;
      headWorldX = (d.direction === 'left')
        ? d.x - 30
        : d.x + DRAGON_BODY_W;
    } else {
      headRotation = -DRAGON_HEAD_ROT;
      headWorldX = (d.direction === 'right')
        ? d.x + DRAGON_BODY_W - 30
        : d.x - DRAGON_HEAD_W;
    }

    const hsx = Math.floor(headWorldX - this.camera.x);
    const hsy = Math.floor(d.y + 28 - this.camera.y);

    ctx.save();
    if (playerIsToRight) {
      ctx.translate(hsx + DRAGON_HEAD_W, hsy + 20);
      ctx.scale(-1, 1);
    } else {
      ctx.translate(hsx, hsy + 20);
    }
    ctx.rotate(headRotation);
    ctx.drawImage(headSprite, 0, -20, DRAGON_HEAD_W, DRAGON_HEAD_H);
    ctx.restore();

    // ── Fire projectiles ─────────────────────────────────────
    for (const fb of d.fireProjectiles) {
      if (!fb.alive) continue;
      const fx = Math.floor(fb.x - this.camera.x);
      const fy = Math.floor(fb.y - this.camera.y);
      ctx.save();
      const grd = ctx.createRadialGradient(fx, fy, 2, fx, fy, 10);
      grd.addColorStop(0,   'rgba(255,200,80,0.95)');
      grd.addColorStop(0.5, 'rgba(255,80,0,0.7)');
      grd.addColorStop(1,   'rgba(200,20,0,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(fx, fy, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(fx, fy, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  _renderEndCrystalGlow(ctx) {
    const playerCol = Math.floor(this.player.cx / BLOCK_SIZE);
    if (playerCol < BIOME_END_START) return;
    for (const crystal of this._endCrystals) {
      if (crystal.destroyed) continue;
      const cx = Math.floor(crystal.col * BLOCK_SIZE + BLOCK_SIZE / 2 - this.camera.x);
      const cy = Math.floor(crystal.row * BLOCK_SIZE - this.camera.y);
      if (cx < -40 || cx > CANVAS_W + 40) continue;
      ctx.save();
      const pulse = 0.6 + 0.4 * Math.sin(this.frameCount * 0.04 + crystal.col * 0.8);
      // Beam upward
      const bGrd = ctx.createLinearGradient(cx, cy, cx, cy - 80);
      bGrd.addColorStop(0, `rgba(180,50,255,${(0.5 * pulse).toFixed(3)})`);
      bGrd.addColorStop(1, 'rgba(180,50,255,0)');
      ctx.fillStyle = bGrd;
      ctx.fillRect(cx - 2, cy - 80, 4, 80);
      // Core glow
      const grd = ctx.createRadialGradient(cx, cy, 1, cx, cy, 14);
      grd.addColorStop(0,   `rgba(255,120,255,${(0.85 * pulse).toFixed(3)})`);
      grd.addColorStop(0.5, `rgba(160,40,255,${(0.5 * pulse).toFixed(3)})`);
      grd.addColorStop(1,   'rgba(160,40,255,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  _renderExitPortal(ctx) {
    if (!this._dragonExitPortal) return;
    const exitCol = END_PORTAL_ARRIVAL_COL;
    const exitRow = END_PORTAL_ARRIVAL_ROW - 1;
    const px = Math.floor(exitCol * BLOCK_SIZE - this.camera.x);
    const py = Math.floor(exitRow * BLOCK_SIZE - this.camera.y);
    const w = BLOCK_SIZE * 2, h = BLOCK_SIZE * 3;
    const pulse = 0.7 + 0.3 * Math.sin(this.frameCount * 0.06);
    ctx.save();
    const grd = ctx.createLinearGradient(px, py, px + w, py + h);
    grd.addColorStop(0,   `rgba(100,0,200,${(0.7 * pulse).toFixed(3)})`);
    grd.addColorStop(0.5, `rgba(180,0,255,${(0.9 * pulse).toFixed(3)})`);
    grd.addColorStop(1,   `rgba(80,0,180,${(0.7 * pulse).toFixed(3)})`);
    ctx.fillStyle = grd;
    ctx.fillRect(px, py, w, h);
    // Outer glow ring
    const grd2 = ctx.createRadialGradient(px + w / 2, py + h / 2, 4, px + w / 2, py + h / 2, 44);
    grd2.addColorStop(0, 'rgba(200,100,255,0.35)');
    grd2.addColorStop(1, 'rgba(200,100,255,0)');
    ctx.fillStyle = grd2;
    ctx.beginPath(); ctx.arc(px + w / 2, py + h / 2, 44, 0, Math.PI * 2); ctx.fill();
    // Label
    ctx.font = 'bold 9px Courier New';
    ctx.fillStyle = '#DD99FF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('PRESS U TO EXIT END', px + w / 2, py - 6);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  _checkExitPortal() {
    if (!this._dragonExitPortal) return;
    const exitCol = END_PORTAL_ARRIVAL_COL;
    const exitRow = END_PORTAL_ARRIVAL_ROW - 1;
    const portalCx = (exitCol + 1) * BLOCK_SIZE;
    const portalCy = (exitRow + 1.5) * BLOCK_SIZE;
    if (Math.hypot(this.player.cx - portalCx, this.player.cy - portalCy) > 3 * BLOCK_SIZE) return;
    // Return near where the player entered the End; fallback to safe nether point
    let destX, destY;
    if (this._endEntryCell) {
      destX = (this._endEntryCell.col - 3) * BLOCK_SIZE - this.player.width / 2;
      destY = (this._endEntryCell.row - 3) * BLOCK_SIZE - this.player.height;
    } else {
      // Fallback: just outside the nether-side portal in the default world
      destX = 325 * BLOCK_SIZE - this.player.width / 2;
      destY = 11 * BLOCK_SIZE - this.player.height;
    }
    this._playSound('sounds/end-portal.mp3');
    this._portalTransition = { phase: 'out', timer: 0, destX, destY };
    this._notify('Leaving the End...', '#AA44FF', 120);
    // Null dragon so re-entering the End portal spawns a fresh one
    this._dragon             = null;
    this._dragonDefeated     = false;
    this._dragonExitPortal   = false;
    this._dragonVictoryScreen = false;
    // Fade boss music when leaving End (dragon defeated at this point)
    if (this._musicSystem.bossMusicActive) this._endBossMusic();
  }

  // ── World Settings helpers ──────────────────────────────────

  _wsLayout() {
    const pw = 580, ph = 360;
    const px = (CANVAS_W - pw) / 2;
    const py = (CANVAS_H - ph) / 2;
    const TAB_Y    = py + 26;
    const TAB_H    = 22;
    const CONTENT_Y = TAB_Y + TAB_H + 4;
    const ROW_H   = 30;
    const MOB_COL  = px + 12;
    const D1_ITEM  = px + 130;
    const D1_PCT   = px + 270;
    const D2_ITEM  = px + 330;
    const D2_PCT   = px + 470;
    const HEADER_Y = CONTENT_Y + 14;
    const FIRST_ROW = CONTENT_Y + 30;
    return { pw, ph, px, py, TAB_Y, TAB_H, CONTENT_Y, ROW_H, MOB_COL, D1_ITEM, D1_PCT, D2_ITEM, D2_PCT, HEADER_Y, FIRST_ROW };
  }

  _wsDropItems() {
    return [
      { block: 0,                          label: '(none)'        },
      { block: BLOCK.APPLE,                label: 'Apple'         },
      { block: BLOCK.ARROW,                label: 'Arrow'         },
      { block: BLOCK.STRING,               label: 'String'        },
      { block: BLOCK.COAL_ORE,             label: 'Coal'          },
      { block: BLOCK.IRON_ORE,             label: 'Iron Ore'      },
      { block: BLOCK.SOUL_SAND,            label: 'Soul Sand'     },
      { block: BLOCK.BLAZE_ROD,            label: 'Blaze Rod'     },
      { block: BLOCK.ENDER_PEARL,          label: 'Ender Pearl'   },
      { block: BLOCK.WITHER_SKELETON_HEAD, label: 'Wither Skull'  },
      { block: BLOCK.DRAGON_EGG,           label: 'Dragon Egg'    },
    ];
  }

  _wsMobOrder() {
    return [
      { key: 'zombie',          label: 'Zombie'       },
      { key: 'skeleton',        label: 'Skeleton'     },
      { key: 'creeper',         label: 'Creeper'      },
      { key: 'cave_spider',     label: 'Cave Spider'  },
      { key: 'piglin',          label: 'Piglin'       },
      { key: 'blaze',           label: 'Blaze'        },
      { key: 'wither_skeleton', label: 'Wither Skel.' },
      { key: 'enderman',        label: 'Enderman'     },
    ];
  }

  _srPersistSettings() {
    // Write SR settings to a quick-access key so SR mode picks them up without a full world save
    if (!this._sbPlayerName || !this._sbWorldName) return;
    const worldKey = SandboxSaves.key(this._sbPlayerName, this._sbWorldName);
    const aws = this._worldAdvSettings;
    try {
      localStorage.setItem('sr_cfg_' + worldKey, JSON.stringify({
        srBaseSpeed:               aws.srBaseSpeed,
        srMaxMultiplier:           aws.srMaxMultiplier,
        srBoostPct:                aws.srBoostPct,
        srTimeBoostEnabled:        aws.srTimeBoostEnabled,
        srTimeBoostIntervalSec:    aws.srTimeBoostIntervalSec,
        srDistBoostEnabled:        aws.srDistBoostEnabled,
        srDistBoostIntervalBlocks: aws.srDistBoostIntervalBlocks,
        srMinZoomSpeed:            aws.srMinZoomSpeed,
        srMaxZoomSpeed:            aws.srMaxZoomSpeed,
      }));
    } catch {}
  }

  _updateWorldSettings() {
    const L    = this._wsLayout();
    const mx   = this.input.mouse.x, my = this.input.mouse.y;
    const mobs = this._wsMobOrder();
    const items = this._wsDropItems();
    const CHANCES = [0, 25, 50, 75, 100];

    // Close on Escape or P key
    if (this.input.isJustDown('Escape') || this.input.isJustDown('KeyP')) {
      this._worldSettingsOpen = false;
      this._wsHighlightMobKey = null;
      return;
    }

    // Audio slider drag: must run every frame (needs mouse.down, not just click)
    if (this._wsTab === 'audio') {
      const slX = L.px + 200, slW = L.pw - 220;
      if (this.input.mouse.down) {
        if (mx >= slX && mx <= slX + slW && my >= L.FIRST_ROW + 4 && my <= L.FIRST_ROW + 28) {
          const v = Math.max(0, Math.min(1, (mx - slX) / slW));
          this._worldAdvSettings.musicVolume = Math.round(v * 20) / 20; // snap to 5% increments
          this._applyMusicVolume();
          this._wsAudioDragTarget = 'music';
        } else if (mx >= slX && mx <= slX + slW && my >= L.FIRST_ROW + 56 && my <= L.FIRST_ROW + 80) {
          const v = Math.max(0, Math.min(1, (mx - slX) / slW));
          this._worldAdvSettings.sfxVolume = Math.round(v * 20) / 20;
          this._wsAudioDragTarget = 'sfx';
        }
      } else {
        this._wsAudioDragTarget = null;
      }
    }

    if (!this.input.mouse.clicked) return;

    // Close button (X)
    const xbx = L.px + L.pw - 28, xby = L.py + 8;
    if (mx >= xbx && mx <= xbx + 20 && my >= xby && my <= xby + 20) {
      this._worldSettingsOpen = false;
      this._wsHighlightMobKey = null;
      return;
    }

    // Click outside panel → close
    if (mx < L.px || mx > L.px + L.pw || my < L.py || my > L.py + L.ph) {
      this._worldSettingsOpen = false;
      this._wsHighlightMobKey = null;
      return;
    }

    // Tab bar clicks — sandbox shows all 8 tabs; other modes only show the 4 player-relevant tabs
    const _allWsTabs = [{ id: 'drops', label: 'Drops' }, { id: 'time', label: 'Time' }, { id: 'advanced', label: 'Advanced' }, { id: 'input', label: 'Input' }, { id: 'audio', label: 'Audio' }, { id: 'multiplayer', label: 'Multi' }, { id: 'speedrunner', label: 'SR' }, { id: 'physics', label: 'Physics' }, { id: 'background', label: 'BG' }, { id: 'arena', label: 'Arena' }];
    const _playTabIds = ['advanced', 'input', 'audio', 'multiplayer'];
    const TABS = (this.gameMode === 'sandbox') ? _allWsTabs : _allWsTabs.filter(t => _playTabIds.includes(t.id));
    const TAB_STRIDE = Math.floor((L.pw - 16) / TABS.length), TAB_W = TAB_STRIDE - 3;
    for (let t = 0; t < TABS.length; t++) {
      const tx = L.px + 8 + t * TAB_STRIDE;
      if (mx >= tx && mx <= tx + TAB_W && my >= L.TAB_Y && my <= L.TAB_Y + L.TAB_H) {
        this._wsTab = TABS[t].id;
        return;
      }
    }

    if (this._wsTab === 'audio') return; // sliders handled above; no click-based actions

    if (this._wsTab === 'input') {
      const SENS_VALS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
      const tgX = L.px + L.pw - 82, tgW = 64, tgH = 24;
      // Row 1: controller sensitivity
      const r1Y = L.FIRST_ROW;
      if (mx >= tgX && mx <= tgX + tgW && my >= r1Y && my <= r1Y + tgH) {
        const cur  = SENS_VALS.findIndex(v => Math.abs(v - (this._worldAdvSettings.controllerSensitivity ?? 1.0)) < 0.01);
        this._worldAdvSettings.controllerSensitivity = SENS_VALS[(cur < 0 ? 2 : cur + 1) % SENS_VALS.length];
      }
      // Row 2: aim sensitivity
      const r2Y = L.FIRST_ROW + 48;
      if (mx >= tgX && mx <= tgX + tgW && my >= r2Y && my <= r2Y + tgH) {
        const cur  = SENS_VALS.findIndex(v => Math.abs(v - (this._worldAdvSettings.controllerAimSensitivity ?? 1.0)) < 0.01);
        this._worldAdvSettings.controllerAimSensitivity = SENS_VALS[(cur < 0 ? 2 : cur + 1) % SENS_VALS.length];
      }
      // Row 3: deadzone
      const DZ_VALS = [0.05, 0.10, 0.15, 0.20, 0.25, 0.30];
      const r3Y = L.FIRST_ROW + 96;
      if (mx >= tgX && mx <= tgX + tgW && my >= r3Y && my <= r3Y + tgH) {
        const cur = DZ_VALS.findIndex(v => Math.abs(v - (this._worldAdvSettings.controllerDeadzone ?? GP_DEADZONE_STICK)) < 0.005);
        this._worldAdvSettings.controllerDeadzone = DZ_VALS[(cur < 0 ? 3 : cur + 1) % DZ_VALS.length];
      }
      // Row 4: P1 input assignment (cycles KB1 → KB2 → Gamepad 1-4)
      if (typeof ControllerConfig !== 'undefined') {
        const asgY  = L.FIRST_ROW + 130;
        const INOPTS = [-1, -2, 0, 1, 2, 3];
        if (mx >= tgX && mx <= tgX + tgW && my >= asgY && my <= asgY + tgH) {
          const cur  = INOPTS.indexOf(ControllerConfig.getAssignment(1));
          const next = INOPTS[(cur < 0 ? 2 : cur + 1) % INOPTS.length];
          ControllerConfig.setAssignment(1, next);
          this.input.p1GpSlot = next;
        }
      }
      return;
    }

    if (this._wsTab === 'time') {
      const CYCLE_OPTS = [5, 10, 20, 30];
      const tgW = 64, tgH = 24, tgX = L.px + L.pw - 82;
      // Row 1: day cycle duration (value button)
      const r1Y = L.FIRST_ROW;
      if (mx >= tgX && mx <= tgX + tgW && my >= r1Y && my <= r1Y + tgH) {
        const cur = CYCLE_OPTS.indexOf(this._worldAdvSettings.dayCycleMinutes);
        const next = CYCLE_OPTS[(cur < 0 ? 0 : cur + 1) % CYCLE_OPTS.length];
        this._worldAdvSettings.dayCycleMinutes = next;
        this._dayNight.halfCycleMs = next * 60 * 1000 / 2;
      }
      // Row 2: night spawn boost toggle
      const r2Y = L.FIRST_ROW + 48;
      if (mx >= tgX && mx <= tgX + tgW && my >= r2Y && my <= r2Y + tgH) {
        this._worldAdvSettings.nightSpawnBoost = !this._worldAdvSettings.nightSpawnBoost;
      }
      // Row 3: full moon HP boost toggle
      const r3Y = L.FIRST_ROW + 96;
      if (mx >= tgX && mx <= tgX + tgW && my >= r3Y && my <= r3Y + tgH) {
        this._worldAdvSettings.fullMoonHpBoost = !this._worldAdvSettings.fullMoonHpBoost;
      }
      return;
    }

    if (this._wsTab === 'advanced') {
      const tgX = L.px + L.pw - 82, tgW = 64, tgH = 24;
      if (this.gameMode === 'sandbox') {
        // Row 1: Dragon Healing
        if (mx >= tgX && mx <= tgX + tgW && my >= L.FIRST_ROW && my <= L.FIRST_ROW + tgH)
          this._worldAdvSettings.disableDragonHealing = !this._worldAdvSettings.disableDragonHealing;
        // Row 2: Unlimited Arrows
        if (mx >= tgX && mx <= tgX + tgW && my >= L.FIRST_ROW + 48 && my <= L.FIRST_ROW + 48 + tgH)
          this._worldAdvSettings.unlimitedArrows = !this._worldAdvSettings.unlimitedArrows;
        // Row 3: 2-Player Co-op (disabled in online games)
        if (!this._onlineGameId && mx >= tgX && mx <= tgX + tgW && my >= L.FIRST_ROW + 96 && my <= L.FIRST_ROW + 96 + tgH)
          this._applyTwoPlayerMode(!this._worldAdvSettings.twoPlayerMode);
        // Row 4: Disable XP Speed Boost
        if (mx >= tgX && mx <= tgX + tgW && my >= L.FIRST_ROW + 144 && my <= L.FIRST_ROW + 144 + tgH)
          this._worldAdvSettings.disableXpSpeedBoost = !this._worldAdvSettings.disableXpSpeedBoost;
        // Row 5: Show Players Health
        if (mx >= tgX && mx <= tgX + tgW && my >= L.FIRST_ROW + 192 && my <= L.FIRST_ROW + 192 + tgH)
          this._worldAdvSettings.showOnlineHealthBars = !(this._worldAdvSettings.showOnlineHealthBars !== false);
        // Export as Template button
        const expBtnX = L.px + 12, expBtnW = L.pw - 24, expBtnH = 26, expBtnY = L.FIRST_ROW + 240;
        if (mx >= expBtnX && mx <= expBtnX + expBtnW && my >= expBtnY && my <= expBtnY + expBtnH)
          this._exportAsTemplate();
      } else {
        // Row 1: 2-Player Co-op (disabled in online games)
        if (!this._onlineGameId && mx >= tgX && mx <= tgX + tgW && my >= L.FIRST_ROW && my <= L.FIRST_ROW + tgH)
          this._applyTwoPlayerMode(!this._worldAdvSettings.twoPlayerMode);
        // Row 2: Show Players Health
        if (mx >= tgX && mx <= tgX + tgW && my >= L.FIRST_ROW + 48 && my <= L.FIRST_ROW + 48 + tgH)
          this._worldAdvSettings.showOnlineHealthBars = !(this._worldAdvSettings.showOnlineHealthBars !== false);
        // Row 3: Compact Hotbar
        if (mx >= tgX && mx <= tgX + tgW && my >= L.FIRST_ROW + 96 && my <= L.FIRST_ROW + 96 + tgH)
          this._worldAdvSettings.compactHotbar = !this._worldAdvSettings.compactHotbar;
      }
      return;
    }

    if (this._wsTab === 'multiplayer') {
      const aws = this._worldAdvSettings;
      const btnX = L.px + 16, btnW = L.pw - 32, btnH = 26;

      const doConnect = () => {
        const sparseBlocks = {};
        if (this.level?.grid) {
          for (let r = 0; r < this.level.grid.length; r++) {
            for (let c = 0; c < this.level.grid[r].length; c++) {
              const t = this.level.grid[r][c];
              if (t !== 0) sparseBlocks[`${c},${r}`] = t;
            }
          }
        }
        window.multiplayerManager.connect(
          this._sbWorldName || 'world',
          { name: this._sbWorldName || 'World', blocks: sparseBlocks,
            multiplierSettings: { bossHealthMultiplier: aws.bossHealthMultiplier, bossDamageMultiplier: aws.bossDamageMultiplier, bossAttackRateMultiplier: aws.bossAttackRateMultiplier } },
          this._sbPlayerName || 'Player'
        );
      };

      if (this.gameMode === 'sandbox') {
        const MP_MULT_OPTS = [0.5, 1.0, 1.5, 2.0, 3.0];
        const tgX = L.px + L.pw - 82, tgW = 64, tgH = 24;
        // Row 1: Boss Health Multiplier
        if (mx >= tgX && mx <= tgX + tgW && my >= L.FIRST_ROW && my <= L.FIRST_ROW + tgH) {
          const cur = MP_MULT_OPTS.findIndex(v => Math.abs(v - (aws.bossHealthMultiplier ?? 1.0)) < 0.01);
          aws.bossHealthMultiplier = MP_MULT_OPTS[(cur < 0 ? 1 : cur + 1) % MP_MULT_OPTS.length];
          if (window.multiplayerManager?.isConnected) window.multiplayerManager.pushSettings({ bossHealthMultiplier: aws.bossHealthMultiplier });
        }
        // Row 2: Boss Damage Multiplier
        if (mx >= tgX && mx <= tgX + tgW && my >= L.FIRST_ROW + 48 && my <= L.FIRST_ROW + 48 + tgH) {
          const cur = MP_MULT_OPTS.findIndex(v => Math.abs(v - (aws.bossDamageMultiplier ?? 1.0)) < 0.01);
          aws.bossDamageMultiplier = MP_MULT_OPTS[(cur < 0 ? 1 : cur + 1) % MP_MULT_OPTS.length];
          if (window.multiplayerManager?.isConnected) window.multiplayerManager.pushSettings({ bossDamageMultiplier: aws.bossDamageMultiplier });
        }
        // Row 3: Boss Attack Rate Multiplier
        if (mx >= tgX && mx <= tgX + tgW && my >= L.FIRST_ROW + 96 && my <= L.FIRST_ROW + 96 + tgH) {
          const cur = MP_MULT_OPTS.findIndex(v => Math.abs(v - (aws.bossAttackRateMultiplier ?? 1.0)) < 0.01);
          aws.bossAttackRateMultiplier = MP_MULT_OPTS[(cur < 0 ? 1 : cur + 1) % MP_MULT_OPTS.length];
          if (window.multiplayerManager?.isConnected) window.multiplayerManager.pushSettings({ bossAttackRateMultiplier: aws.bossAttackRateMultiplier });
        }
        // Row 4: Disable Chat toggle
        if (mx >= tgX && mx <= tgX + tgW && my >= L.FIRST_ROW + 144 && my <= L.FIRST_ROW + 144 + tgH) {
          aws.chatDisabled = !aws.chatDisabled;
          const chatEl = this._chatDomElement;
          if (chatEl) chatEl.style.display = aws.chatDisabled ? 'none' : '';
        }
        // Connect / Disconnect button
        const mr5Y = L.FIRST_ROW + 200;
        if (mx >= btnX && mx <= btnX + btnW && my >= mr5Y && my <= mr5Y + btnH) {
          if (window.multiplayerManager?.isConnected) window.multiplayerManager.disconnect();
          else doConnect();
        }
        // Download World
        const dlY = L.FIRST_ROW + 240;
        if (window.multiplayerManager?.isConnected &&
            mx >= btnX && mx <= btnX + btnW && my >= dlY && my <= dlY + btnH)
          window.multiplayerManager.downloadWorld();
        // Delete game (creator)
        const delY = L.FIRST_ROW + 280;
        if (window.multiplayerManager?.isCreator && mx >= btnX && mx <= btnX + btnW && my >= delY && my <= delY + btnH) {
          if (confirm('Delete this game permanently? All players will be disconnected.'))
            window.multiplayerManager.deleteGame(window.multiplayerManager.worldId);
        }
      } else {
        // Non-sandbox: Disable Chat toggle + connect/disconnect + download
        const nsTgX = L.px + L.pw - 82, nsTgW = 64, nsTgH = 24;
        if (mx >= nsTgX && mx <= nsTgX + nsTgW && my >= L.FIRST_ROW && my <= L.FIRST_ROW + nsTgH) {
          aws.chatDisabled = !aws.chatDisabled;
          const chatEl = this._chatDomElement;
          if (chatEl) chatEl.style.display = aws.chatDisabled ? 'none' : '';
        }
        const nsBtnY = L.FIRST_ROW + 56;
        if (mx >= btnX && mx <= btnX + btnW && my >= nsBtnY && my <= nsBtnY + btnH) {
          if (window.multiplayerManager?.isConnected) window.multiplayerManager.disconnect();
          else doConnect();
        }
        const dlY = nsBtnY + 48;
        if (window.multiplayerManager?.isConnected &&
            mx >= btnX && mx <= btnX + btnW && my >= dlY && my <= dlY + btnH)
          window.multiplayerManager.downloadWorld();
      }
      return;
    }

    if (this._wsTab === 'speedrunner') {
      const aws  = this._worldAdvSettings;
      const tgX  = L.px + L.pw - 82, tgW = 64, tgH = 24;
      const ivX  = tgX - 76,          ivW = 68;
      const R    = 40; // must match draw section
      const BASE_SPEED_OPTS   = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0];
      const MAX_MULT_OPTS     = [1.0, 1.5, 2.0, 3.0, 4.0, 5.0];
      const BOOST_PCT_OPTS    = [0.05, 0.10, 0.15, 0.20];
      const TIME_INT_OPTS     = [1, 2, 5, 10, 20];
      const DIST_INT_OPTS     = [1, 2, 5, 10, 20, 30];
      const ZOOM_SPD_OPTS     = [-1, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];
      const MAX_ZOOM_SPD_OPTS = [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];

      const hit = (rY) => mx >= tgX && mx <= tgX + tgW && my >= rY && my <= rY + tgH;

      // Row 1: Base Speed
      if (hit(L.FIRST_ROW)) {
        const cur = BASE_SPEED_OPTS.findIndex(v => Math.abs(v - (aws.srBaseSpeed ?? 1.0)) < 0.01);
        aws.srBaseSpeed = BASE_SPEED_OPTS[(cur < 0 ? 2 : cur + 1) % BASE_SPEED_OPTS.length];
      }
      // Row 2: Max Speed Cap
      if (hit(L.FIRST_ROW + R)) {
        const cur = MAX_MULT_OPTS.findIndex(v => Math.abs(v - (aws.srMaxMultiplier ?? 2.0)) < 0.01);
        aws.srMaxMultiplier = MAX_MULT_OPTS[(cur < 0 ? 2 : cur + 1) % MAX_MULT_OPTS.length];
      }
      // Row 3: Boost Per Tick
      if (hit(L.FIRST_ROW + R*2)) {
        const cur = BOOST_PCT_OPTS.findIndex(v => Math.abs(v - (aws.srBoostPct ?? 0.05)) < 0.005);
        aws.srBoostPct = BOOST_PCT_OPTS[(cur < 0 ? 0 : cur + 1) % BOOST_PCT_OPTS.length];
      }
      // Row 4: Time Boost — toggle + interval
      const r4Y = L.FIRST_ROW + R*3;
      if (hit(r4Y))
        aws.srTimeBoostEnabled = !(aws.srTimeBoostEnabled ?? true);
      if ((aws.srTimeBoostEnabled ?? true) && mx >= ivX && mx <= ivX + ivW && my >= r4Y && my <= r4Y + tgH) {
        const cur = TIME_INT_OPTS.indexOf(aws.srTimeBoostIntervalSec ?? 5);
        aws.srTimeBoostIntervalSec = TIME_INT_OPTS[(cur < 0 ? 2 : cur + 1) % TIME_INT_OPTS.length];
      }
      // Row 5: Distance Boost — toggle + interval
      const r5Y = L.FIRST_ROW + R*4;
      if (hit(r5Y))
        aws.srDistBoostEnabled = !(aws.srDistBoostEnabled ?? true);
      if ((aws.srDistBoostEnabled ?? true) && mx >= ivX && mx <= ivX + ivW && my >= r5Y && my <= r5Y + tgH) {
        const cur = DIST_INT_OPTS.indexOf(aws.srDistBoostIntervalBlocks ?? 5);
        aws.srDistBoostIntervalBlocks = DIST_INT_OPTS[(cur < 0 ? 2 : cur + 1) % DIST_INT_OPTS.length];
      }
      // Row 6: Min Zoom Speed
      if (hit(L.FIRST_ROW + R*5)) {
        const cur = ZOOM_SPD_OPTS.findIndex(v => Math.abs(v - (aws.srMinZoomSpeed ?? 1.0)) < 0.01);
        aws.srMinZoomSpeed = ZOOM_SPD_OPTS[(cur < 0 ? 1 : cur + 1) % ZOOM_SPD_OPTS.length];
      }
      // Row 7: Max Zoom Speed
      if (hit(L.FIRST_ROW + R*6)) {
        const srMax = aws.srMaxMultiplier ?? SR_CONFIG.maxMultiplier;
        const curVal = aws.srMaxZoomSpeed ?? srMax;
        const cur = MAX_ZOOM_SPD_OPTS.findIndex(v => Math.abs(v - curVal) < 0.01);
        aws.srMaxZoomSpeed = MAX_ZOOM_SPD_OPTS[(cur < 0 ? 1 : cur + 1) % MAX_ZOOM_SPD_OPTS.length];
      }
      // Persist SR settings immediately without requiring a full world save
      this._srPersistSettings();
      return;
    }

    if (this._wsTab === 'physics') {
      const aws = this._worldAdvSettings;
      const tgX = L.px + L.pw - 82, tgW = 64, tgH = 24;
      const GRAVITY_OPTS = [0.10, 0.20, 0.33, 0.50, 0.66, 0.80, 1.00, 1.20, 1.50];
      const JUMPPAD_OPTS = [-6, -9, -12, -15, -18, -21, -24];
      const JUMPH_OPTS = [null, 2, 2.5, 3, 3.5, 4, 4.5, 5];
      const RY = (k) => L.FIRST_ROW + k * 42;   // physics-tab row spacing (9 rows)
      const hitRow = (rY) => mx >= tgX && mx <= tgX + tgW && my >= rY && my <= rY + tgH;
      // Row 1: Gravity
      if (hitRow(RY(0))) {
        const cur = GRAVITY_OPTS.findIndex(v => Math.abs(v - (aws.physicsGravity ?? GRAVITY)) < 0.005);
        aws.physicsGravity = GRAVITY_OPTS[(cur < 0 ? 4 : cur + 1) % GRAVITY_OPTS.length];
      }
      // Row 2: Jump Pad Force
      if (hitRow(RY(1))) {
        const cur = JUMPPAD_OPTS.indexOf(aws.jumpPadVForce ?? -18);
        aws.jumpPadVForce = JUMPPAD_OPTS[(cur < 0 ? 4 : cur + 1) % JUMPPAD_OPTS.length];
      }
      // Row 3: Jump Height (player jump apex, in blocks; null = default)
      if (hitRow(RY(2))) {
        const cur = JUMPH_OPTS.findIndex(v => v === (aws.jumpHeightBlocks ?? null));
        aws.jumpHeightBlocks = JUMPH_OPTS[(cur < 0 ? 0 : cur + 1) % JUMPH_OPTS.length];
      }
      // Row 4: Air Jump (double jump) toggle
      if (hitRow(RY(3))) aws.airJumpEnabled = !aws.airJumpEnabled;
      // Row 5: Sprint toggle (default on)
      if (hitRow(RY(4))) aws.sprintEnabled = (aws.sprintEnabled === false);
      // Row 6: Auto-Climb — walk/run up 1-block ledges without jumping (universal)
      if (hitRow(RY(5))) aws.autoStepUp = !aws.autoStepUp;
      // Row 7: Default Zoom (base view zoom, all modes)
      if (hitRow(RY(6))) {
        const Z = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
        const cur = Z.findIndex(v => Math.abs(v - (aws.worldZoom ?? 1.0)) < 0.001);
        aws.worldZoom = Z[(cur < 0 ? 2 : cur + 1) % Z.length];
      }
      // Row 8: Lock Physics — greys the pause-menu physics section for players
      if (hitRow(RY(7))) aws.physicsLocked = !aws.physicsLocked;
      // Row 9: Lock Boss Scaling — greys the pause-menu boss multipliers
      if (hitRow(RY(8))) aws.bossScalingLocked = !aws.bossScalingLocked;
      return;
    }

    if (this._wsTab === 'background') {
      const aws = this._worldAdvSettings;
      const tgX = L.px + L.pw - 100, tgW = 82, tgH = 24;
      const BG_OPTS = ['auto', 'sky', 'cave', 'nether', 'end'];
      // Row 1: Background theme cycle
      if (mx >= tgX && mx <= tgX + tgW && my >= L.FIRST_ROW && my <= L.FIRST_ROW + tgH) {
        const cur = BG_OPTS.indexOf(aws.backgroundTheme || 'auto');
        aws.backgroundTheme = BG_OPTS[(cur < 0 ? 0 : cur + 1) % BG_OPTS.length];
      }
      return;
    }

    if (this._wsTab === 'arena') {
      const aws  = this._worldAdvSettings;
      const tgX  = L.px + L.pw - 100, tgW = 86, tgH = 22, rowH = 30;
      const cyc  = (arr, cur) => arr[(arr.indexOf(cur) + 1) % arr.length];
      const cycF = (arr, cur) => { const i = arr.findIndex(v => Math.abs(v - cur) < 0.001); return arr[(i < 0 ? 0 : i + 1) % arr.length]; };
      const hitRow = (i) => { const rY = L.FIRST_ROW + i * rowH; return mx >= tgX && mx <= tgX + tgW && my >= rY && my <= rY + tgH; };
      if (hitRow(0)) aws.arenaPlayerMaxHealth = cyc([2,4,6,8,10,12,14,16,18,20], aws.arenaPlayerMaxHealth || 20);
      else if (hitRow(1)) aws.arenaViewType = (aws.arenaViewType === 'scrolling') ? 'single' : 'scrolling';
      else if (hitRow(2)) aws.arenaZoomMode = cyc(['NONE','PRESET','DYNAMIC'], aws.arenaZoomMode || 'NONE');
      else if (hitRow(3)) aws.arenaPresetZoom = cycF([0.3,0.5,0.7,1.0,1.2,1.5], aws.arenaPresetZoom || 1.0);
      else if (hitRow(4)) aws.arenaMobHealth = cyc(['EASY','MEDIUM','HARD'], aws.arenaMobHealth || 'MEDIUM');
      else if (hitRow(5)) aws.arenaRespawnTime = cyc([0,1,2,3,5,8,10], aws.arenaRespawnTime ?? 2);
      else if (hitRow(6)) aws.redstoneSpeed = cycF([0.5,1.0,2.0,3.0,4.0,6.0,8.0], aws.redstoneSpeed || 1.0);
      else if (Array.isArray(this._wsArenaChips)) {
        for (const c of this._wsArenaChips) {
          if (mx >= c.x && mx <= c.x + c.w && my >= c.y && my <= c.y + c.h) {
            if (!Array.isArray(aws.arenaEnabledTypes)) aws.arenaEnabledTypes = [];
            const idx = aws.arenaEnabledTypes.indexOf(c.key);
            if (idx >= 0) aws.arenaEnabledTypes.splice(idx, 1); else aws.arenaEnabledTypes.push(c.key);
            break;
          }
        }
      }
      return;
    }

    // ── Mob Drops tab ──────────────────────────────────────────
    for (let i = 0; i < mobs.length; i++) {
      const rowY = L.FIRST_ROW + i * L.ROW_H;
      if (my < rowY || my > rowY + L.ROW_H) continue;
      const { key } = mobs[i];
      const slots = this._mobDropSettings[key];
      if (!slots) continue;

      for (let d = 0; d < 2; d++) {
        const itemX = d === 0 ? L.D1_ITEM : L.D2_ITEM;
        const pctX  = d === 0 ? L.D1_PCT  : L.D2_PCT;

        // Click on item cell → cycle to next item
        if (mx >= itemX && mx <= itemX + 120) {
          const cur = items.findIndex(it => it.block === slots[d].item);
          const next = (cur + 1) % items.length;
          slots[d].item = items[next].block;
          if (slots[d].item !== 0 && slots[d].chance === 0) slots[d].chance = 100;
          if (slots[d].item === 0) slots[d].chance = 0;
          this.mobManager.dropConfig = this._mobDropSettings;
          return;
        }

        // Click on % cell → cycle to next chance
        if (mx >= pctX && mx <= pctX + 50) {
          if (slots[d].item === 0) return;
          const cur = CHANCES.indexOf(slots[d].chance);
          slots[d].chance = CHANCES[(cur + 1) % CHANCES.length];
          this.mobManager.dropConfig = this._mobDropSettings;
          return;
        }
      }
    }
  }

  // Seed 2 default player spawn points (Phase 3 auto-migration) near the level's
  // start position. They are ordinary placed objects — fully movable + deletable.
  _seedDefaultSpawnPoints() {
    if (!this.sandbox || !this.level) return;
    const bs = BLOCK_SIZE;
    const W = this.level.width, H = this.level.height;
    const baseCol = Math.max(1, Math.min(W - 2, Math.round((this.level.spawnX || bs * 3) / bs)));
    const baseRow = Math.max(1, Math.min(H - 2, Math.round((this.level.spawnY || bs * 3) / bs)));
    const cols = [baseCol, Math.max(1, Math.min(W - 2, baseCol + 4))];
    this.sandbox.placedSpawnPoints = cols.map((col, i) => ({
      col, row: baseRow, wx: col * bs + bs / 2, wy: baseRow * bs + bs / 2, slot: i + 1,
    }));
  }

  // Warnings for the Arena settings tab: an enabled game type missing its
  // required design element (uses the editor's placed objects). Phase 3A.3.
  _arenaSettingsWarnings(enabled) {
    const w = [];
    const sb = this.sandbox;
    if (!sb) return w;
    if (enabled.includes('KING_OF_HILL') && !sb.placedHill) w.push('King of the Hill: no Hill placed');
    if (enabled.includes('COLLECT_EMERALDS') && (!sb.placedEmeralds || sb.placedEmeralds.length === 0)) w.push('Collect Emeralds: no emeralds placed');
    if (enabled.includes('SURVIVAL_WAVES') && (!sb.placedSpawnLines || sb.placedSpawnLines.length === 0)) w.push('Survival Waves: no Spawn Lines placed');
    // Player spawn points (Phase 3) — how many players this world can currently host.
    const spawnN = typeof sb.supportedPlayerCount === 'function' ? sb.supportedPlayerCount() : (sb.placedSpawnPoints ? sb.placedSpawnPoints.length : 0);
    if (enabled.length > 0) {
      if (spawnN === 0) w.push('No Player Spawns placed — add up to 4 (arena falls back to auto-start positions)');
      else if (spawnN < 4) w.push(`Player Spawns: supports up to ${spawnN} player${spawnN === 1 ? '' : 's'} (add more for 3–4P)`);
      else w.push('Player Spawns: supports up to 4 players');
    }
    return w;
  }

  _drawWorldSettings(ctx) {
    const L    = this._wsLayout();
    const mobs = this._wsMobOrder();
    const items = this._wsDropItems();

    ctx.save();

    // Backdrop
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Panel
    ctx.fillStyle = '#1E1E2A';
    ctx.strokeStyle = '#555577';
    ctx.lineWidth = 1;
    ctx.fillRect(L.px, L.py, L.pw, L.ph);
    ctx.strokeRect(L.px, L.py, L.pw, L.ph);

    // Title
    ctx.fillStyle = '#CCCCFF';
    ctx.font = 'bold 13px Courier New';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('World Settings', L.px + L.pw / 2, L.py + 14);

    // Close button
    const xbx = L.px + L.pw - 28, xby = L.py + 4;
    ctx.fillStyle = '#554455';
    ctx.fillRect(xbx, xby, 20, 20);
    ctx.fillStyle = '#FFAAAA';
    ctx.font = 'bold 13px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('×', xbx + 10, xby + 11);

    // Tab bar — sandbox shows all 8 tabs; other modes show only 4 player-relevant tabs
    const _allWsTabs2 = [{ id: 'drops', label: 'Drops' }, { id: 'time', label: 'Time' }, { id: 'advanced', label: 'Advanced' }, { id: 'input', label: 'Input' }, { id: 'audio', label: 'Audio' }, { id: 'multiplayer', label: 'Multi' }, { id: 'speedrunner', label: 'SR' }, { id: 'physics', label: 'Physics' }, { id: 'background', label: 'BG' }, { id: 'arena', label: 'Arena' }];
    const _playTabIds2 = ['advanced', 'input', 'audio', 'multiplayer'];
    const TABS = (this.gameMode === 'sandbox') ? _allWsTabs2 : _allWsTabs2.filter(t => _playTabIds2.includes(t.id));
    const TAB_STRIDE = Math.floor((L.pw - 16) / TABS.length), TAB_W = TAB_STRIDE - 3;
    for (let t = 0; t < TABS.length; t++) {
      const tx = L.px + 8 + t * TAB_STRIDE;
      const active = this._wsTab === TABS[t].id;
      ctx.fillStyle  = active ? '#3A3A5A' : '#252535';
      ctx.strokeStyle = active ? '#8888CC' : '#444466';
      ctx.lineWidth = 1;
      ctx.fillRect(tx, L.TAB_Y, TAB_W, L.TAB_H);
      ctx.strokeRect(tx, L.TAB_Y, TAB_W, L.TAB_H);
      ctx.font = active ? 'bold 9px Courier New' : '9px Courier New';
      ctx.fillStyle = active ? '#CCCCFF' : '#777788';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(TABS[t].label, tx + TAB_W / 2, L.TAB_Y + L.TAB_H / 2);
    }

    // Separator under tab bar
    ctx.strokeStyle = '#444466';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(L.px + 4, L.TAB_Y + L.TAB_H + 2);
    ctx.lineTo(L.px + L.pw - 4, L.TAB_Y + L.TAB_H + 2);
    ctx.stroke();

    if (this._wsTab === 'time') {
      // ── Time Settings tab ────────────────────────────────────
      const aws = this._worldAdvSettings;
      ctx.font = '9px Courier New';
      ctx.fillStyle = '#888899';
      ctx.textAlign = 'center';
      ctx.fillText('P or Esc to close', L.px + L.pw / 2, L.CONTENT_Y + 8);

      const tgW = 64, tgH = 24, tgX = L.px + L.pw - 82;
      const drawRow = (rY, label, sub, btnLabel, active) => {
        ctx.font = '11px Courier New';
        ctx.fillStyle = '#AAAACC';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, L.MOB_COL, rY + 11);
        ctx.font = '9px Courier New';
        ctx.fillStyle = '#666677';
        ctx.fillText(sub, L.MOB_COL, rY + 26);
        ctx.fillStyle  = active ? '#3A5A2A' : '#2A2A3A';
        ctx.strokeStyle = active ? '#66CC44' : '#555577';
        ctx.lineWidth = 1;
        ctx.fillRect(tgX, rY, tgW, tgH);
        ctx.strokeRect(tgX, rY, tgW, tgH);
        ctx.font = 'bold 11px Courier New';
        ctx.fillStyle = active ? '#88FF66' : '#AAAACC';
        ctx.textAlign = 'center';
        ctx.fillText(btnLabel, tgX + tgW / 2, rY + 13);
      };

      // Row 1: Day cycle duration
      const CYCLE_OPTS = [5, 10, 20, 30];
      drawRow(L.FIRST_ROW, 'Day Cycle Duration',
        '(click to change full cycle length)',
        `${aws.dayCycleMinutes} min`, true);

      // Row 2: Night spawn boost
      drawRow(L.FIRST_ROW + 48, 'Night Spawn Rate',
        '(surface mobs spawn 2× faster at night)',
        aws.nightSpawnBoost ? 'ON' : 'OFF', aws.nightSpawnBoost);

      // Row 3: Full moon HP boost
      drawRow(L.FIRST_ROW + 96, 'Full Moon HP Boost',
        '(full moon: surface mobs +50% max HP)',
        aws.fullMoonHpBoost ? 'ON' : 'OFF', aws.fullMoonHpBoost);

    } else if (this._wsTab === 'advanced') {
      // ── Advanced tab ─────────────────────────────────────────
      const aws = this._worldAdvSettings;
      ctx.font = '9px Courier New';
      ctx.fillStyle = '#888899';
      ctx.textAlign = 'center';
      ctx.fillText('P or Esc to close', L.px + L.pw / 2, L.CONTENT_Y + 8);

      const tgX = L.px + L.pw - 82, tgW = 64, tgH = 24;
      const drawAdvRow = (rY, label, sub, active, disabled = false) => {
        ctx.font = '11px Courier New'; ctx.fillStyle = disabled ? '#555566' : '#AAAACC';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(label, L.MOB_COL, rY + 11);
        ctx.font = '9px Courier New'; ctx.fillStyle = disabled ? '#3A3A4A' : '#666677';
        ctx.fillText(sub, L.MOB_COL, rY + 26);
        ctx.fillStyle  = disabled ? '#1E1E2A' : (active ? '#3A5A2A' : '#2A2A3A');
        ctx.strokeStyle = disabled ? '#333344' : (active ? '#66CC44' : '#555577');
        ctx.lineWidth = 1;
        ctx.fillRect(tgX, rY, tgW, tgH);
        ctx.strokeRect(tgX, rY, tgW, tgH);
        ctx.font = 'bold 11px Courier New';
        ctx.fillStyle = disabled ? '#444455' : (active ? '#88FF66' : '#888899');
        ctx.textAlign = 'center';
        ctx.fillText(disabled ? 'N/A' : (active ? 'ON' : 'OFF'), tgX + tgW / 2, rY + 13);
      };

      if (this.gameMode === 'sandbox') {
        drawAdvRow(L.FIRST_ROW,       'Disable Dragon Healing',  '(crystals stop healing the dragon)',    aws.disableDragonHealing);
        drawAdvRow(L.FIRST_ROW + 48,  'Unlimited Arrows',        '(bow fires without consuming arrows)',  aws.unlimitedArrows);
        drawAdvRow(L.FIRST_ROW + 96,  '2-Player Co-op',          this._onlineGameId ? '(not available in online games)' : '(IJKL keys or 2nd gamepad for P2)', aws.twoPlayerMode, !!this._onlineGameId);
        drawAdvRow(L.FIRST_ROW + 144, 'Disable XP Speed Boost',  '(XP no longer increases move speed)',   aws.disableXpSpeedBoost);
        drawAdvRow(L.FIRST_ROW + 192, 'Show Players Health',     '(other players health bars in top-right)', aws.showOnlineHealthBars !== false);
        const expBtnX = L.px + 12, expBtnW = L.pw - 24, expBtnH = 26, expBtnY = L.FIRST_ROW + 240;
        const expHov  = this.input.mouse.x >= expBtnX && this.input.mouse.x <= expBtnX + expBtnW &&
                        this.input.mouse.y >= expBtnY && this.input.mouse.y <= expBtnY + expBtnH;
        ctx.fillStyle   = expHov ? 'rgba(80,180,80,0.25)' : 'rgba(40,80,40,0.5)';
        ctx.strokeStyle = expHov ? '#66CC66' : '#448844'; ctx.lineWidth = 1;
        _roundRect(ctx, expBtnX, expBtnY, expBtnW, expBtnH, 4); ctx.fill();
        _roundRect(ctx, expBtnX, expBtnY, expBtnW, expBtnH, 4); ctx.stroke();
        ctx.font = 'bold 10px Courier New'; ctx.fillStyle = expHov ? '#AAFFAA' : '#88CC88';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('⬇  Export World as Template JSON', expBtnX + expBtnW / 2, expBtnY + 13);
      } else {
        drawAdvRow(L.FIRST_ROW,      '2-Player Co-op',      this._onlineGameId ? '(not available in online games)' : '(IJKL keys or 2nd gamepad for P2)', aws.twoPlayerMode, !!this._onlineGameId);
        drawAdvRow(L.FIRST_ROW + 48, 'Show Players Health', '(other players health bars in top-right)', aws.showOnlineHealthBars !== false);
        drawAdvRow(L.FIRST_ROW + 96, 'Compact Hotbar',      '(small hotbar under the XP bar)', aws.compactHotbar === true);
      }
    } else if (this._wsTab === 'input') {
      // ── Input Settings tab ────────────────────────────────────
      const mx2 = this.input.mouse.x, my2 = this.input.mouse.y;
      const aws2 = this._worldAdvSettings;
      const SENS_VALS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
      const tgW = 64, tgH = 24, tgX = L.px + L.pw - 82;

      ctx.font = '9px Courier New'; ctx.fillStyle = '#888899';
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('Click value to cycle · P or Esc to close', L.px + L.pw / 2, L.CONTENT_Y + 8);

      const drawSensRow = (rY, label, sub, val) => {
        ctx.font = '11px Courier New'; ctx.fillStyle = '#AAAACC';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(label, L.MOB_COL, rY + 11);
        ctx.font = '9px Courier New'; ctx.fillStyle = '#666677';
        ctx.fillText(sub, L.MOB_COL, rY + 26);
        const hov = mx2 >= tgX && mx2 <= tgX + tgW && my2 >= rY && my2 <= rY + tgH;
        ctx.fillStyle = hov ? '#1A2A3A' : '#232333';
        ctx.strokeStyle = hov ? '#44AAFF' : '#555577'; ctx.lineWidth = 1;
        ctx.fillRect(tgX, rY, tgW, tgH); ctx.strokeRect(tgX, rY, tgW, tgH);
        ctx.font = 'bold 11px Courier New'; ctx.fillStyle = '#88CCFF';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(val.toFixed(2) + 'x', tgX + tgW / 2, rY + 13);
      };

      drawSensRow(L.FIRST_ROW,      'Move Sensitivity',
        '(left stick — click to adjust)',
        aws2.controllerSensitivity ?? 1.0);
      drawSensRow(L.FIRST_ROW + 48, 'Aim Sensitivity',
        '(right stick — click to adjust)',
        aws2.controllerAimSensitivity ?? 1.0);

      // Deadzone row (reuse drawSensRow label area, but show % value)
      const dzVal = aws2.controllerDeadzone ?? GP_DEADZONE_STICK;
      drawSensRow(L.FIRST_ROW + 96, 'Stick Deadzone',
        '(inner dead zone — click to adjust)',
        1.0); // placeholder — overdrawn below
      // Overdraw the value button with the actual deadzone %
      const dzTgX = L.px + L.pw - 82, dzTgW = 64, dzTgH = 24;
      const dzRY  = L.FIRST_ROW + 96;
      const dzHov = mx2 >= dzTgX && mx2 <= dzTgX + dzTgW && my2 >= dzRY && my2 <= dzRY + dzTgH;
      ctx.fillStyle = dzHov ? '#1A2A3A' : '#232333';
      ctx.strokeStyle = dzHov ? '#44AAFF' : '#555577'; ctx.lineWidth = 1;
      ctx.fillRect(dzTgX, dzRY, dzTgW, dzTgH); ctx.strokeRect(dzTgX, dzRY, dzTgW, dzTgH);
      ctx.font = 'bold 11px Courier New'; ctx.fillStyle = '#88CCFF';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(Math.round(dzVal * 100) + '%', dzTgX + dzTgW / 2, dzRY + 13);

      // ── P1 input assignment ────────────────────────────────
      if (typeof ControllerConfig !== 'undefined') {
        const asgY   = L.FIRST_ROW + 130;
        const asgVal = ControllerConfig.getAssignment(1);
        const asgLabelMap = { '-1': 'KB1 (WASD)', '-2': 'KB2 (Arrows)' };
        const asgText = asgVal >= 0 ? `Gamepad ${asgVal + 1}` : (asgLabelMap[String(asgVal)] ?? 'KB1');
        ctx.font = '11px Courier New'; ctx.fillStyle = '#AAAACC';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText('P1 Input', L.MOB_COL, asgY + 11);
        ctx.font = '9px Courier New'; ctx.fillStyle = '#666677';
        ctx.fillText('(controller or keyboard — click to cycle)', L.MOB_COL, asgY + 26);
        const asgHov = mx2 >= tgX && mx2 <= tgX + tgW && my2 >= asgY && my2 <= asgY + tgH;
        ctx.fillStyle = asgHov ? '#1A2A3A' : '#232333';
        ctx.strokeStyle = asgHov ? '#44AAFF' : '#555577'; ctx.lineWidth = 1;
        ctx.fillRect(tgX, asgY, tgW, tgH); ctx.strokeRect(tgX, asgY, tgW, tgH);
        ctx.font = 'bold 10px Courier New'; ctx.fillStyle = '#88CCFF';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(asgText, tgX + tgW / 2, asgY + 13);
      }

      // ── Connected controllers ──────────────────────────────
      const gpListY = L.FIRST_ROW + 158;
      ctx.font = 'bold 9px Courier New'; ctx.fillStyle = '#888899';
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('CONNECTED CONTROLLERS', L.MOB_COL, gpListY);
      ctx.strokeStyle = '#33334488'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(L.MOB_COL, gpListY + 3); ctx.lineTo(L.px + L.pw - 20, gpListY + 3); ctx.stroke();

      const rawGps = navigator.getGamepads ? navigator.getGamepads() : [];
      for (let gi = 0; gi < 4; gi++) {
        const gp  = rawGps[gi];
        const gy  = gpListY + 14 + gi * 26;
        const on  = gp && gp.connected;
        ctx.fillStyle = on ? 'rgba(50,180,80,0.15)' : 'rgba(40,40,60,0.4)';
        ctx.fillRect(L.MOB_COL, gy, L.pw - L.MOB_COL + L.px - 20, 22);
        // Dot
        ctx.fillStyle = on ? '#33DD55' : '#334455';
        ctx.beginPath(); ctx.arc(L.MOB_COL + 8, gy + 11, 5, 0, Math.PI * 2); ctx.fill();
        if (on) { ctx.strokeStyle = '#66FF88'; ctx.lineWidth = 1; ctx.stroke(); }
        // Label
        ctx.font = on ? '10px Courier New' : '9px Courier New';
        ctx.fillStyle = on ? '#AADDAA' : '#445566';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        const gpLabel = on
          ? `P${gi + 1}: ${gp.id.length > 36 ? gp.id.slice(0, 36) + '…' : gp.id}`
          : `P${gi + 1}: — not connected —`;
        ctx.fillText(gpLabel, L.MOB_COL + 18, gy + 11);
      }
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    } else if (this._wsTab === 'audio') {
      // ── Audio Settings tab ────────────────────────────────────
      const aws3 = this._worldAdvSettings;
      const sliderX = L.px + 200, sliderW = L.pw - 220;
      ctx.font = '9px Courier New'; ctx.fillStyle = '#888899';
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('Drag slider to adjust · P or Esc to close', L.px + L.pw / 2, L.CONTENT_Y + 8);

      const drawVolRow = (rY, label, sub, vol) => {
        ctx.font = '11px Courier New'; ctx.fillStyle = '#AAAACC';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(label, L.MOB_COL, rY + 11);
        ctx.font = '9px Courier New'; ctx.fillStyle = '#666677';
        ctx.fillText(sub, L.MOB_COL, rY + 26);
        // Slider track
        ctx.fillStyle = '#1A1A2A'; ctx.strokeStyle = '#444466'; ctx.lineWidth = 1;
        ctx.fillRect(sliderX, rY + 8, sliderW, 10);
        ctx.strokeRect(sliderX, rY + 8, sliderW, 10);
        // Filled portion
        const fillW = Math.round(vol * sliderW);
        ctx.fillStyle = '#6644AA';
        ctx.fillRect(sliderX + 1, rY + 9, Math.max(0, fillW - 2), 8);
        // Handle
        ctx.fillStyle = '#AA88FF';
        ctx.fillRect(sliderX + fillW - 4, rY + 6, 8, 14);
        // Percentage label
        ctx.font = 'bold 11px Courier New'; ctx.fillStyle = '#CCAAFF';
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText(Math.round(vol * 100) + '%', L.px + L.pw - 14, rY + 13);
        ctx.textAlign = 'left';
      };

      drawVolRow(L.FIRST_ROW,      'Music Volume',      '(background music)', aws3.musicVolume ?? DEFAULT_MUSIC_VOLUME);
      drawVolRow(L.FIRST_ROW + 52, 'Sound Effects',     '(mining, combat, explosions)', aws3.sfxVolume ?? DEFAULT_SFX_VOLUME);

      // Currently playing
      const curTrack = this._musicSystem.currentTrack
        ? (MUSIC_DISCS[this._musicSystem.currentTrack]?.discName ?? this._musicSystem.currentTrack)
        : '(none)';
      ctx.font = '9px Courier New'; ctx.fillStyle = '#888899';
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('Now Playing: ' + curTrack, L.MOB_COL, L.FIRST_ROW + 120);

      // Credit line
      ctx.font = '9px Courier New'; ctx.fillStyle = '#554466';
      ctx.textAlign = 'center';
      ctx.fillText('Music by @LaudividniMusic and @T_en_M', L.px + L.pw / 2, L.py + L.ph - 12);
      ctx.textAlign = 'left';
    } else if (this._wsTab === 'multiplayer') {
      // ── Multiplayer tab ────────────────────────────────────────
      const aws = this._worldAdvSettings;
      const tgW = 64, tgH = 24, tgX = L.px + L.pw - 82;
      const connected = !!window.multiplayerManager?.isConnected;
      const statusColor = connected ? '#44EE44' : '#EE4444';
      const statusText  = connected
        ? `Connected as Player ${window.multiplayerManager.playerNumber} (${window.multiplayerManager.worldId})`
        : 'Not connected';
      const btnX = L.px + 16, btnW = L.pw - 32, btnH = 26;

      // Status bar
      ctx.font = '9px Courier New'; ctx.fillStyle = statusColor;
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(statusText, L.px + L.pw / 2, L.CONTENT_Y + 8);

      if (this.gameMode === 'sandbox') {
        const MP_MULT_OPTS = [0.5, 1.0, 1.5, 2.0, 3.0];
        ctx.font = '9px Courier New'; ctx.fillStyle = '#888899';
        ctx.fillText('Boss scaling · click value to cycle · P or Esc to close', L.px + L.pw / 2, L.CONTENT_Y + 20);

        const drawMpRow = (rY, label, sub, val) => {
          ctx.font = '11px Courier New'; ctx.fillStyle = '#AAAACC';
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillText(label, L.MOB_COL, rY + 11);
          ctx.font = '9px Courier New'; ctx.fillStyle = '#666677';
          ctx.fillText(sub, L.MOB_COL, rY + 26);
          ctx.fillStyle  = '#2A3A2A'; ctx.strokeStyle = '#44CC44'; ctx.lineWidth = 1;
          ctx.fillRect(tgX, rY, tgW, tgH);
          ctx.strokeRect(tgX, rY, tgW, tgH);
          ctx.font = 'bold 11px Courier New'; ctx.fillStyle = '#88FF66';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(`${val}×`, tgX + tgW / 2, rY + 13);
        };
        const drawMpToggleRow = (rY, label, sub, active) => {
          ctx.font = '11px Courier New'; ctx.fillStyle = '#AAAACC';
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillText(label, L.MOB_COL, rY + 11);
          ctx.font = '9px Courier New'; ctx.fillStyle = '#666677';
          ctx.fillText(sub, L.MOB_COL, rY + 26);
          ctx.fillStyle  = active ? '#3A5A2A' : '#2A2A3A';
          ctx.strokeStyle = active ? '#66CC44' : '#555577';
          ctx.lineWidth = 1;
          ctx.fillRect(tgX, rY, tgW, tgH); ctx.strokeRect(tgX, rY, tgW, tgH);
          ctx.font = 'bold 11px Courier New';
          ctx.fillStyle = active ? '#88FF66' : '#888899';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(active ? 'ON' : 'OFF', tgX + tgW / 2, rY + 13);
        };

        drawMpRow(L.FIRST_ROW,       'Boss Health',      'Multiplier (applies at boss spawn)',  aws.bossHealthMultiplier ?? 1.0);
        drawMpRow(L.FIRST_ROW + 48,  'Boss Damage',      'Multiplier (player damage received)', aws.bossDamageMultiplier ?? 1.0);
        drawMpRow(L.FIRST_ROW + 96,  'Boss Attack Rate', 'Multiplier (attack frequency)',       aws.bossAttackRateMultiplier ?? 1.0);
        drawMpToggleRow(L.FIRST_ROW + 144, 'Disable Chat', '(hides chat window in online games)', aws.chatDisabled);

        // Connect / Disconnect button
        const mr5Y = L.FIRST_ROW + 200;
        ctx.fillStyle  = connected ? '#3A1A1A' : '#1A3A1A';
        ctx.strokeStyle = connected ? '#EE4444' : '#44EE44'; ctx.lineWidth = 1;
        ctx.fillRect(btnX, mr5Y, btnW, btnH); ctx.strokeRect(btnX, mr5Y, btnW, btnH);
        ctx.font = 'bold 11px Courier New';
        ctx.fillStyle = connected ? '#FF8888' : '#88FF88';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(connected ? '⊗  Disconnect from Server' : '⊕  Connect to Server', btnX + btnW / 2, mr5Y + 13);

        if (connected) {
          const dlY = L.FIRST_ROW + 240;
          ctx.fillStyle  = '#1A2A3A'; ctx.strokeStyle = '#4488CC'; ctx.lineWidth = 1;
          ctx.fillRect(btnX, dlY, btnW, btnH); ctx.strokeRect(btnX, dlY, btnW, btnH);
          ctx.font = 'bold 11px Courier New'; ctx.fillStyle = '#88CCFF';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('⬇  Download World as JSON', btnX + btnW / 2, dlY + 13);

          if (window.multiplayerManager?.isCreator) {
            const delY = L.FIRST_ROW + 280;
            const delHov = this._hit(btnX, delY, btnW, btnH);
            ctx.fillStyle = delHov ? '#7f1010' : '#3a0808';
            ctx.fillRect(btnX, delY, btnW, btnH);
            ctx.strokeStyle = '#c62828'; ctx.lineWidth = 1;
            ctx.strokeRect(btnX, delY, btnW, btnH);
            ctx.fillStyle = delHov ? '#ffcdd2' : '#ef9a9a';
            ctx.font = 'bold 11px Courier New';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('🗑 Delete Game', btnX + btnW / 2, delY + btnH / 2);
          }
        }
      } else {
        // Non-sandbox: Disable Chat toggle + connect/disconnect + download
        ctx.font = '9px Courier New'; ctx.fillStyle = '#888899';
        ctx.fillText('P or Esc to close', L.px + L.pw / 2, L.CONTENT_Y + 20);

        // Disable Chat toggle
        const nsToggleRow = (rY, label, sub, active) => {
          ctx.font = '11px Courier New'; ctx.fillStyle = '#AAAACC';
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillText(label, L.MOB_COL, rY + 11);
          ctx.font = '9px Courier New'; ctx.fillStyle = '#666677';
          ctx.fillText(sub, L.MOB_COL, rY + 26);
          ctx.fillStyle  = active ? '#3A5A2A' : '#2A2A3A';
          ctx.strokeStyle = active ? '#66CC44' : '#555577'; ctx.lineWidth = 1;
          ctx.fillRect(tgX, rY, tgW, tgH); ctx.strokeRect(tgX, rY, tgW, tgH);
          ctx.font = 'bold 11px Courier New';
          ctx.fillStyle = active ? '#88FF66' : '#888899';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(active ? 'ON' : 'OFF', tgX + tgW / 2, rY + 13);
        };
        nsToggleRow(L.FIRST_ROW, 'Disable Chat', '(hides chat window in online games)', aws.chatDisabled);

        // Connect / Disconnect button
        const nsBtnY = L.FIRST_ROW + 56;
        ctx.fillStyle  = connected ? '#3A1A1A' : '#1A3A1A';
        ctx.strokeStyle = connected ? '#EE4444' : '#44EE44'; ctx.lineWidth = 1;
        ctx.fillRect(btnX, nsBtnY, btnW, btnH); ctx.strokeRect(btnX, nsBtnY, btnW, btnH);
        ctx.font = 'bold 11px Courier New';
        ctx.fillStyle = connected ? '#FF8888' : '#88FF88';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(connected ? '⊗  Disconnect from Server' : '⊕  Connect to Server', btnX + btnW / 2, nsBtnY + 13);

        if (connected) {
          const dlY = nsBtnY + 48;
          ctx.fillStyle  = '#1A2A3A'; ctx.strokeStyle = '#4488CC'; ctx.lineWidth = 1;
          ctx.fillRect(btnX, dlY, btnW, btnH); ctx.strokeRect(btnX, dlY, btnW, btnH);
          ctx.font = 'bold 11px Courier New'; ctx.fillStyle = '#88CCFF';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('⬇  Download World as JSON', btnX + btnW / 2, dlY + 13);
        }
      }

      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    } else if (this._wsTab === 'speedrunner') {
      // ── Speed Runner tab ──────────────────────────────────────
      const aws  = this._worldAdvSettings;
      const mx2  = this.input.mouse.x, my2 = this.input.mouse.y;
      const tgX  = L.px + L.pw - 82, tgW = 64, tgH = 24;
      const ivX  = tgX - 76,          ivW = 68;

      ctx.font = '9px Courier New'; ctx.fillStyle = '#888899';
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('Applied when world is launched in Speed Runner mode  ·  P or Esc to close',
        L.px + L.pw / 2, L.CONTENT_Y + 8);

      // Helper: single cycle-value button row
      const drawSrValRow = (rY, label, sub, valStr) => {
        ctx.font = '11px Courier New'; ctx.fillStyle = '#AAAACC';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(label, L.MOB_COL, rY + 11);
        ctx.font = '9px Courier New'; ctx.fillStyle = '#666677';
        ctx.fillText(sub, L.MOB_COL, rY + 26);
        const hov = mx2 >= tgX && mx2 <= tgX + tgW && my2 >= rY && my2 <= rY + tgH;
        ctx.fillStyle = hov ? '#1A2A3A' : '#232333';
        ctx.strokeStyle = hov ? '#44AAFF' : '#555577'; ctx.lineWidth = 1;
        ctx.fillRect(tgX, rY, tgW, tgH); ctx.strokeRect(tgX, rY, tgW, tgH);
        ctx.font = 'bold 11px Courier New'; ctx.fillStyle = '#88CCFF';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(valStr, tgX + tgW / 2, rY + 13);
      };

      // Helper: toggle + interval buttons row
      const drawSrBoostRow = (rY, label, sub, enabled, ivLabel) => {
        ctx.font = '11px Courier New'; ctx.fillStyle = '#AAAACC';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(label, L.MOB_COL, rY + 11);
        ctx.font = '9px Courier New'; ctx.fillStyle = '#666677';
        ctx.fillText(sub, L.MOB_COL, rY + 26);
        // ON/OFF toggle
        ctx.fillStyle   = enabled ? '#3A5A2A' : '#2A2A3A';
        ctx.strokeStyle = enabled ? '#66CC44' : '#555577'; ctx.lineWidth = 1;
        ctx.fillRect(tgX, rY, tgW, tgH); ctx.strokeRect(tgX, rY, tgW, tgH);
        ctx.font = 'bold 11px Courier New'; ctx.fillStyle = enabled ? '#88FF66' : '#AAAACC';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(enabled ? 'ON' : 'OFF', tgX + tgW / 2, rY + 13);
        // Interval cycle button (dimmed when disabled)
        const ivHov = enabled && mx2 >= ivX && mx2 <= ivX + ivW && my2 >= rY && my2 <= rY + tgH;
        ctx.fillStyle   = enabled ? (ivHov ? '#1A2A3A' : '#232333') : '#1A1A2A';
        ctx.strokeStyle = enabled ? (ivHov ? '#44AAFF' : '#555577') : '#333344'; ctx.lineWidth = 1;
        ctx.fillRect(ivX, rY, ivW, tgH); ctx.strokeRect(ivX, rY, ivW, tgH);
        ctx.font = 'bold 11px Courier New'; ctx.fillStyle = enabled ? '#88CCFF' : '#445566';
        ctx.fillText(ivLabel, ivX + ivW / 2, rY + 13);
      };

      const BASE_SPEED_OPTS  = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0];
      const MAX_MULT_OPTS    = [1.0, 1.5, 2.0, 3.0, 4.0, 5.0];
      const BOOST_PCT_OPTS   = [0.05, 0.10, 0.15, 0.20];
      const ZOOM_SPD_OPTS    = [-1, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0]; // -1 = disabled
      const MAX_ZOOM_SPD_OPTS= [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];
      const R = 40; // row spacing (px) — tighter to fit 7 rows in panel

      const minZV = aws.srMinZoomSpeed ?? 1.0;
      const maxZV = aws.srMaxZoomSpeed ?? (aws.srMaxMultiplier ?? SR_CONFIG.maxMultiplier);
      const minZStr = minZV < 0 ? 'OFF' : minZV.toFixed(1) + 'x';
      const maxZStr = maxZV <= 1.0 ? 'Always' : maxZV.toFixed(1) + 'x';

      drawSrValRow(L.FIRST_ROW,       'Base Speed',
        '(default movement speed multiplier)',
        (aws.srBaseSpeed ?? 1.0).toFixed(2) + 'x');
      drawSrValRow(L.FIRST_ROW + R,   'Max Speed Cap',
        '(upper limit on total combined boost)',
        (aws.srMaxMultiplier ?? SR_CONFIG.maxMultiplier).toFixed(1) + 'x');
      drawSrValRow(L.FIRST_ROW + R*2, 'Boost Per Tick',
        '(speed gain per time/distance interval)',
        Math.round((aws.srBoostPct ?? SR_CONFIG.timeBoostPct) * 100) + '%');

      const tivSec    = aws.srTimeBoostIntervalSec    ?? SR_CONFIG.timeBoostIntervalSec;
      const tivBlocks = aws.srDistBoostIntervalBlocks ?? 5;
      drawSrBoostRow(L.FIRST_ROW + R*3, 'Time Boost',
        '(accelerates after running continuously)',
        aws.srTimeBoostEnabled ?? true, `every ${tivSec}s`);
      drawSrBoostRow(L.FIRST_ROW + R*4, 'Distance Boost',
        '(accelerates after covering ground)',
        aws.srDistBoostEnabled ?? true, `every ${tivBlocks}b`);

      drawSrValRow(L.FIRST_ROW + R*5, 'Min Zoom Speed',
        '(speed when zoom starts; OFF = never zoom)',
        minZStr);
      drawSrValRow(L.FIRST_ROW + R*6, 'Max Zoom Speed',
        '(speed at which maximum zoom is reached)',
        maxZStr);

      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    } else if (this._wsTab === 'physics') {
      // ── Physics tab ───────────────────────────────────────────
      const aws  = this._worldAdvSettings;
      const mx2  = this.input.mouse.x, my2 = this.input.mouse.y;
      const tgX  = L.px + L.pw - 82, tgW = 64, tgH = 24;

      ctx.font = '9px Courier New'; ctx.fillStyle = '#888899';
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('Per-world physics overrides  ·  P or Esc to close',
        L.px + L.pw / 2, L.CONTENT_Y + 8);

      const drawPhysRow = (rY, label, sub, valStr) => {
        ctx.font = '11px Courier New'; ctx.fillStyle = '#AAAACC';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(label, L.MOB_COL, rY + 11);
        ctx.font = '9px Courier New'; ctx.fillStyle = '#666677';
        ctx.fillText(sub, L.MOB_COL, rY + 26);
        const hov = mx2 >= tgX && mx2 <= tgX + tgW && my2 >= rY && my2 <= rY + tgH;
        ctx.fillStyle = hov ? '#1A2A3A' : '#232333';
        ctx.strokeStyle = hov ? '#44AAFF' : '#555577'; ctx.lineWidth = 1;
        ctx.fillRect(tgX, rY, tgW, tgH); ctx.strokeRect(tgX, rY, tgW, tgH);
        ctx.font = 'bold 11px Courier New'; ctx.fillStyle = '#88CCFF';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(valStr, tgX + tgW / 2, rY + 13);
      };

      const RY = (k) => L.FIRST_ROW + k * 42;   // physics-tab row spacing (9 rows)
      drawPhysRow(RY(0), 'Gravity',
        '(acceleration per frame — default 0.66)',
        (aws.physicsGravity ?? GRAVITY).toFixed(2));
      drawPhysRow(RY(1), 'Jump Pad Force',
        '(vertical launch on JUMP_PAD blocks)',
        (aws.jumpPadVForce ?? -18).toString());
      drawPhysRow(RY(2), 'Jump Height',
        '(player jump apex in blocks — default ~3.5)',
        aws.jumpHeightBlocks ? aws.jumpHeightBlocks + ' bl' : 'Default');
      drawPhysRow(RY(3), 'Air Jump',
        '(allow one mid-air double jump)',
        aws.airJumpEnabled ? 'On' : 'Off');
      drawPhysRow(RY(4), 'Sprint',
        '(hold Shift to move 2× speed)',
        aws.sprintEnabled !== false ? 'On' : 'Off');
      drawPhysRow(RY(5), 'Auto-Climb',
        '(walk/run up 1-block ledges — no jump needed)',
        aws.autoStepUp ? 'On' : 'Off');
      drawPhysRow(RY(6), 'Default Zoom',
        '(base view zoom; Z cycles 100-400% in sandbox/God)',
        `${(aws.worldZoom || 1).toFixed(2)}x`);
      drawPhysRow(RY(7), 'Lock Physics',
        '(grey these out in the pause menu — players can\'t override)',
        aws.physicsLocked ? 'On' : 'Off');
      drawPhysRow(RY(8), 'Lock Boss Scaling',
        '(grey boss health/damage/rate in the pause menu)',
        aws.bossScalingLocked ? 'On' : 'Off');

      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    } else if (this._wsTab === 'background') {
      // ── Background tab (Tier 1) ───────────────────────────────
      const aws  = this._worldAdvSettings;
      const mx2  = this.input.mouse.x, my2 = this.input.mouse.y;
      const tgX  = L.px + L.pw - 100, tgW = 82, tgH = 24;

      ctx.font = '9px Courier New'; ctx.fillStyle = '#888899';
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('Per-world backdrop (visual only)  ·  P or Esc to close',
        L.px + L.pw / 2, L.CONTENT_Y + 8);

      const THEME_LABELS = { auto: 'Auto', sky: 'Sky', cave: 'Cave', nether: 'Nether', end: 'End' };
      const drawBgRow = (rY, label, sub, valStr) => {
        ctx.font = '11px Courier New'; ctx.fillStyle = '#AAAACC';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(label, L.MOB_COL, rY + 11);
        ctx.font = '9px Courier New'; ctx.fillStyle = '#666677';
        ctx.fillText(sub, L.MOB_COL, rY + 26);
        const hov = mx2 >= tgX && mx2 <= tgX + tgW && my2 >= rY && my2 <= rY + tgH;
        ctx.fillStyle = hov ? '#1A2A3A' : '#232333';
        ctx.strokeStyle = hov ? '#44AAFF' : '#555577'; ctx.lineWidth = 1;
        ctx.fillRect(tgX, rY, tgW, tgH); ctx.strokeRect(tgX, rY, tgW, tgH);
        ctx.font = 'bold 11px Courier New'; ctx.fillStyle = '#88CCFF';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(valStr, tgX + tgW / 2, rY + 13);
      };

      drawBgRow(L.FIRST_ROW, 'Background',
        '(Auto = follows location: sky/cave by depth, nether/end by area)',
        THEME_LABELS[aws.backgroundTheme || 'auto']);

      ctx.font = '9px Courier New'; ctx.fillStyle = '#666677';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('Sky / Cave / Nether / End force that backdrop everywhere in this world.',
        L.MOB_COL, L.FIRST_ROW + 64);
      ctx.fillText('Gameplay is unchanged — this only swaps the painted background.',
        L.MOB_COL, L.FIRST_ROW + 80);

      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    } else if (this._wsTab === 'arena') {
      // ── Arena tab (Phase 3A.3) ────────────────────────────────
      const aws  = this._worldAdvSettings;
      const mx2  = this.input.mouse.x, my2 = this.input.mouse.y;
      const tgX  = L.px + L.pw - 100, tgW = 86, tgH = 22;
      ctx.font = '9px Courier New'; ctx.fillStyle = '#888899';
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('Per-world arena defaults  ·  P or Esc to close', L.px + L.pw / 2, L.CONTENT_Y + 8);

      const rowH = 30;
      const drawRow = (i, label, valStr) => {
        const rY = L.FIRST_ROW + i * rowH;
        ctx.font = '11px Courier New'; ctx.fillStyle = '#AAAACC';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(label, L.MOB_COL, rY + 11);
        const hov = mx2 >= tgX && mx2 <= tgX + tgW && my2 >= rY && my2 <= rY + tgH;
        ctx.fillStyle = hov ? '#1A2A3A' : '#232333';
        ctx.strokeStyle = hov ? '#44AAFF' : '#555577'; ctx.lineWidth = 1;
        ctx.fillRect(tgX, rY, tgW, tgH); ctx.strokeRect(tgX, rY, tgW, tgH);
        ctx.font = 'bold 11px Courier New'; ctx.fillStyle = '#88CCFF';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(valStr, tgX + tgW / 2, rY + 12);
        return rY;
      };

      const hp = aws.arenaPlayerMaxHealth || 20;
      drawRow(0, 'Player Health', `${Math.round(hp / 2)} ❤`);
      drawRow(1, 'World View',    (aws.arenaViewType === 'scrolling') ? 'Scrolling' : 'Single');
      drawRow(2, 'Zoom Mode',     aws.arenaZoomMode || 'NONE');
      drawRow(3, 'Preset Zoom',   `${(aws.arenaPresetZoom || 1).toFixed(2)}x`);
      drawRow(4, 'Mob Health',    aws.arenaMobHealth || 'MEDIUM');
      drawRow(5, 'Respawn Time',  `${aws.arenaRespawnTime ?? 2}s`);
      drawRow(6, 'Redstone Speed',`${(aws.redstoneSpeed || 1).toFixed(2)}x`);

      // Enabled game types — ALL arena modes as toggle chips (2 rows of 4).
      // These declare which modes a world supports; unselected modes are greyed
      // out in the Arena mode picker (arena-select chooseMode/_supports).
      const typesY = L.FIRST_ROW + 7 * rowH;
      ctx.font = '11px Courier New'; ctx.fillStyle = '#AAAACC';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('Game Types', L.MOB_COL, typesY + 11);
      const enabled = Array.isArray(aws.arenaEnabledTypes) ? aws.arenaEnabledTypes : [];
      // Custom Rules is intentionally omitted — it's ALWAYS available in Arena
      // (it defines its own elements/scoring), so it isn't a per-world toggle.
      const chips = [
        ['MOB_HUNTER', 'Hunt'], ['COLLECT_EMERALDS', 'Emrld'], ['KING_OF_HILL', 'Hill'], ['SURVIVAL_WAVES', 'Wave'],
        ['DEATHMATCH', 'DM'],   ['CAPTURE_FLAG', 'CTF'],       ['DEFEND_TOWER', 'Tower'],
      ];
      const chipW = 56, chipGap = 4, perRow = 4, chipX0 = L.px + 120;
      this._wsArenaChips = [];
      chips.forEach(([key, lbl], ci) => {
        const row = Math.floor(ci / perRow), col = ci % perRow;
        const cx = chipX0 + col * (chipW + chipGap);
        const cy = typesY + row * (tgH + chipGap);
        const on = enabled.includes(key);
        const hov = mx2 >= cx && mx2 <= cx + chipW && my2 >= cy && my2 <= cy + tgH;
        ctx.fillStyle = on ? (hov ? '#2e6b3a' : '#27562f') : (hov ? '#3a2a2a' : '#2a2333');
        ctx.strokeStyle = on ? '#4CAF50' : '#555577'; ctx.lineWidth = 1;
        ctx.fillRect(cx, cy, chipW, tgH); ctx.strokeRect(cx, cy, chipW, tgH);
        ctx.font = 'bold 10px Courier New'; ctx.fillStyle = on ? '#9fffce' : '#888899';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(lbl, cx + chipW / 2, cy + 12);
        this._wsArenaChips.push({ x: cx, y: cy, w: chipW, h: tgH, key });
      });

      // Warnings (enabled type missing its required design element), below both rows.
      const warnY = typesY + 2 * (tgH + chipGap) + 10;
      const warn = this._arenaSettingsWarnings(enabled);
      if (warn.length) {
        ctx.font = '9px Courier New'; ctx.fillStyle = '#FF9800';
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText('⚠ ' + warn[0], L.MOB_COL, warnY);
        if (warn[1]) ctx.fillText('⚠ ' + warn[1], L.MOB_COL, warnY + 13);
      }
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    } else {
      // ── Mob Drops tab ─────────────────────────────────────────
      ctx.font = '9px Courier New';
      ctx.fillStyle = '#888899';
      ctx.textAlign = 'center';
      ctx.fillText('Click item to cycle · Click % to change chance · P or Esc to close', L.px + L.pw / 2, L.CONTENT_Y + 8);

      // Column headers
      ctx.font = 'bold 9px Courier New';
      ctx.fillStyle = '#8888AA';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('MOB',    L.MOB_COL, L.HEADER_Y);
      ctx.fillText('DROP 1', L.D1_ITEM, L.HEADER_Y);
      ctx.fillText('%',      L.D1_PCT,  L.HEADER_Y);
      ctx.fillText('DROP 2', L.D2_ITEM, L.HEADER_Y);
      ctx.fillText('%',      L.D2_PCT,  L.HEADER_Y);

      // Mob rows
      for (let i = 0; i < mobs.length; i++) {
        const { key, label } = mobs[i];
        const rowY   = L.FIRST_ROW + i * L.ROW_H;
        const slots  = this._mobDropSettings[key] || [];
        const isHL   = key === this._wsHighlightMobKey;

        ctx.fillStyle = isHL ? 'rgba(120,80,200,0.25)' : (i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent');
        ctx.fillRect(L.px + 4, rowY, L.pw - 8, L.ROW_H);

        ctx.font = '10px Courier New';
        ctx.fillStyle = isHL ? '#CC99FF' : '#AAAACC';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, L.MOB_COL, rowY + L.ROW_H / 2);

        for (let d = 0; d < 2; d++) {
          const slot    = slots[d] || { item: 0, chance: 0 };
          const itemX   = d === 0 ? L.D1_ITEM : L.D2_ITEM;
          const pctX    = d === 0 ? L.D1_PCT  : L.D2_PCT;
          const itemDef = items.find(it => it.block === slot.item) || items[0];
          const cellH   = 20, cellY = rowY + (L.ROW_H - cellH) / 2;

          ctx.strokeStyle = '#444466'; ctx.lineWidth = 1;
          ctx.strokeRect(itemX, cellY, 120, cellH);
          ctx.fillStyle = slot.item === 0 ? '#2A2A3A' : '#2E2A3E';
          ctx.fillRect(itemX, cellY, 120, cellH);
          if (slot.item !== 0) {
            drawBlock(ctx, slot.item, itemX + 2, cellY + 2, 0, {});
            ctx.font = '9px Courier New'; ctx.fillStyle = '#CCCCEE'; ctx.textAlign = 'left';
            ctx.fillText(itemDef.label, itemX + 20, cellY + cellH / 2);
          } else {
            ctx.font = '9px Courier New'; ctx.fillStyle = '#555566'; ctx.textAlign = 'left';
            ctx.fillText('(none)', itemX + 6, cellY + cellH / 2);
          }

          ctx.strokeRect(pctX, cellY, 44, cellH);
          ctx.fillStyle = slot.item === 0 ? '#2A2A3A' : (slot.chance === 100 ? '#1A3020' : slot.chance > 0 ? '#2A2A20' : '#2A2020');
          ctx.fillRect(pctX, cellY, 44, cellH);
          ctx.font = 'bold 10px Courier New';
          ctx.fillStyle = slot.item === 0 ? '#444455' : (slot.chance === 100 ? '#66FF88' : slot.chance > 0 ? '#DDDD44' : '#FF5555');
          ctx.textAlign = 'center';
          ctx.fillText(slot.item === 0 ? '—' : slot.chance + '%', pctX + 22, cellY + cellH / 2);
        }
      }
    }

    ctx.restore();
  }

  _drawDragonVictoryScreen(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const pw = 420, ph = 210;
    const panX = (CANVAS_W - pw) / 2, panY = (CANVAS_H - ph) / 2;

    ctx.fillStyle = '#18002E';
    _roundRect(ctx, panX, panY, pw, ph, 12); ctx.fill();
    ctx.strokeStyle = '#AA44FF'; ctx.lineWidth = 3;
    _roundRect(ctx, panX, panY, pw, ph, 12); ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#FF44FF';
    ctx.font = 'bold 26px Courier New';
    ctx.fillText('ENDER DRAGON DEFEATED!', CANVAS_W / 2, panY + 58);

    ctx.fillStyle = '#CC88FF';
    ctx.font = '13px Courier New';
    ctx.fillText('An exit portal has appeared.', CANVAS_W / 2, panY + 90);
    ctx.fillStyle = '#aaa';
    ctx.font = '11px Courier New';
    ctx.fillText('Step into the purple portal and press U to return.', CANVAS_W / 2, panY + 112);

    // Continue button
    const bw = 180, bh = 34;
    const bx = (CANVAS_W - bw) / 2, by = panY + ph - 56;
    ctx.fillStyle = '#6622AA';
    _roundRect(ctx, bx, by, bw, bh, 6); ctx.fill();
    ctx.strokeStyle = '#AA44FF'; ctx.lineWidth = 2;
    _roundRect(ctx, bx, by, bw, bh, 6); ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 13px Courier New';
    ctx.fillText('Continue Playing', CANVAS_W / 2, by + 22);

    ctx.textAlign = 'left';
    ctx.restore();
  }

  // ── Wither Boss (Phase 14) ────────────────────────────────

  _drawAltarItems(ctx) {
    // Draw filled-in skull/sand icons over altar slot blocks
    for (const altar of this._witherAltars) {
      const { anchorRow: ar, anchorCol: ac } = altar;
      // Skull slots: (ar, ac), (ar, ac+1), (ar, ac+2)
      for (let i = 0; i < 3; i++) {
        if (!altar.skulls[i]) continue;
        const sx = (ac + i) * BLOCK_SIZE - this.camera.x;
        const sy = ar * BLOCK_SIZE - this.camera.y;
        drawBlock(ctx, BLOCK.WITHER_SKELETON_HEAD, sx, sy, 0);
      }
      // Sand slots: (ar+1,ac), (ar+1,ac+1), (ar+1,ac+2), (ar+2,ac+1)
      const sandPositions = [[1,0],[1,1],[1,2],[2,1]];
      for (let i = 0; i < 4; i++) {
        if (!altar.sand[i]) continue;
        const [dr, dc] = sandPositions[i];
        const sx = (ac + dc) * BLOCK_SIZE - this.camera.x;
        const sy = (ar + dr) * BLOCK_SIZE - this.camera.y;
        drawBlock(ctx, BLOCK.SOUL_SAND, sx, sy, 0);
      }
    }
  }

  _loadWitherSprites() {
    const files = {
      left:  'images/wither-left.png',
      right: 'images/wither-right.png',
      forward: 'images/wither-forward.png',
    };
    let loaded = 0;
    const total = 3 + 5;
    const onLoad = () => { if (++loaded === total) this._witherSpritesLoaded = true; };
    for (const [key, src] of Object.entries(files)) {
      const img = new Image();
      img.onload = onLoad;
      img.onerror = onLoad; // count errors so we don't hang waiting
      img.src = src;
      this._witherSprites[key] = img;
    }
    for (let i = 0; i < 5; i++) {
      const img = new Image();
      img.onload = onLoad;
      img.onerror = onLoad;
      img.src = `images/wither-awakening-${i}.png`;
      this._witherSprites.awakening[i] = img;
    }
  }

  _registerWitherAltar(anchorRow, anchorCol) {
    // Remove any existing altar at same anchor
    this._witherAltars = this._witherAltars.filter(a =>
      a.anchorRow !== anchorRow || a.anchorCol !== anchorCol);
    this._witherAltars.push({
      anchorRow, anchorCol,
      skulls: [false, false, false],         // 3 skull slots
      sand:   [false, false, false, false],  // 4 soul sand slots
    });
  }

  _restoreEmptyAltar(anchorRow, anchorCol) {
    // Re-place altar structure (empty — no skulls/sand) after a failed fight
    const blocks = [
      [0, 0, BLOCK.WITHER_SKULL_SLOT], [0, 1, BLOCK.WITHER_SKULL_SLOT], [0, 2, BLOCK.WITHER_SKULL_SLOT],
      [1, 0, BLOCK.SOUL_SAND_SLOT],    [1, 1, BLOCK.SOUL_SAND_SLOT],    [1, 2, BLOCK.SOUL_SAND_SLOT],
      [2, 1, BLOCK.SOUL_SAND_SLOT],
      [3, 0, BLOCK.ALTAR_BLOCK],       [3, 1, BLOCK.ALTAR_BLOCK],       [3, 2, BLOCK.ALTAR_BLOCK],
    ];
    for (const [dr, dc, type] of blocks) {
      this.level.set(anchorRow + dr, anchorCol + dc, type);
    }
    this._registerWitherAltar(anchorRow, anchorCol);
  }

  _findNearbyWitherAltar(pCol, pRow, rangeBlocks) {
    for (const altar of this._witherAltars) {
      // Altar centre is (anchorCol+1, anchorRow+1.5) in block coords
      const aCx = altar.anchorCol + 1;
      const aCy = altar.anchorRow + 1.5;
      if (Math.abs(pCol - aCx) <= rangeBlocks && Math.abs(pRow - aCy) <= rangeBlocks)
        return altar;
    }
    return null;
  }

  _tryPlaceAltarItem() {
    if (this._witherBoss) return; // Wither already active
    const slot = this.player.hotbar[this.player.selectedSlot];
    if (!slot) return;
    const pCol = Math.floor(this.player.cx / BLOCK_SIZE);
    const pRow = Math.floor(this.player.cy / BLOCK_SIZE);
    const altar = this._findNearbyWitherAltar(pCol, pRow, 4);
    if (!altar) return;

    if (slot.type === BLOCK.WITHER_SKELETON_HEAD) {
      const idx = altar.skulls.indexOf(false);
      if (idx === -1) { this._notify('All skull slots filled', '#886622', 80); return; }
      altar.skulls[idx] = true;
      this.player.takeFromSlot(this.player.selectedSlot);
      this._playSound('sounds/place-block.mp3');
      const n = altar.skulls.filter(Boolean).length;
      this._notify(`Wither Skull placed (${n}/3)`, '#AA8833', 120);
      if (this._onlineGameId && window.multiplayerManager?.isCreator)
        window.multiplayerManager.sendAltarUpdate(altar.anchorRow, altar.anchorCol, altar.skulls, altar.sand);
      this._checkAltarCompletion(altar);
    } else if (slot.type === BLOCK.SOUL_SAND) {
      const idx = altar.sand.indexOf(false);
      if (idx === -1) { this._notify('All soul sand slots filled', '#886622', 80); return; }
      altar.sand[idx] = true;
      this.player.takeFromSlot(this.player.selectedSlot);
      this._playSound('sounds/place-block.mp3');
      const n = altar.sand.filter(Boolean).length;
      this._notify(`Soul Sand placed (${n}/4)`, '#AA8833', 120);
      if (this._onlineGameId && window.multiplayerManager?.isCreator)
        window.multiplayerManager.sendAltarUpdate(altar.anchorRow, altar.anchorCol, altar.skulls, altar.sand);
      this._checkAltarCompletion(altar);
    }
  }

  _checkAltarCompletion(altar) {
    if (!altar.skulls.every(Boolean) || !altar.sand.every(Boolean)) return;
    this._summonWither(altar);
  }

  _summonWither(altar) {
    // Remember altar position so it can be restored if the player dies
    this._lastAltarAnchorRow = altar.anchorRow;
    this._lastAltarAnchorCol = altar.anchorCol;

    // Remove altar blocks from level
    const fp = [
      [0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,1],[3,0],[3,1],[3,2],
    ];
    for (const [dr, dc] of fp) {
      this.level.set(altar.anchorRow + dr, altar.anchorCol + dc, BLOCK.AIR);
    }
    this._witherAltars = this._witherAltars.filter(a => a !== altar);

    // Save player position before the fight so we can return here on victory
    this._witherPreFightX = this.player.x;
    this._witherPreFightY = this.player.y;

    this._playSound('sounds/enable-end-portal.mp3');

    // Fade to black (world disappears; player stays visible via _witherFade overlay).
    // Callback fires at peak black: teleport player + spawn Wither, then fade back in.
    this._witherFade = {
      alpha: 0,
      phase: 'out',
      callback: () => {
        this.player.x  = WITHER_PLAYER_COL * BLOCK_SIZE;
        this.player.y  = WITHER_PLAYER_ROW * BLOCK_SIZE;
        this.player.vx = 0; this.player.vy = 0;

        const _witherHpMult = this._worldAdvSettings?.bossHealthMultiplier ?? 1.0;
        const _witherHp     = Math.round(WITHER_MAX_HP * _witherHpMult);
        this._witherBoss = {
          x:          WITHER_SPAWN_COL * BLOCK_SIZE,
          y:          WITHER_SPAWN_ROW * BLOCK_SIZE,
          hp:         _witherHp,
          maxHp:      _witherHp,
          state:      'awakening',
          sprite:     'forward',
          vx:         0,
          hitFlash:   0,
          awakeningFrame: 0,
          awakeningTimer: 0,
          movDir:     1,
          movTimer:   0,
          movDuration: 120 + Math.floor(Math.random() * 120),
          bobTimer:   0,
          attackTimer: 0,
          attackDelay: 120 + Math.floor(Math.random() * 120),
          skulls:     [],
        };

        this._startWitherMusic();
        this._notify('The Wither awakens!', '#CC6600', 200);
      },
    };
  }

  _updateWither() {
    const w = this._witherBoss;
    if (!w) return;

    if (w.state === 'awakening') {
      w.awakeningTimer++;
      // 5 frames, each 60 ticks (1 second)
      w.awakeningFrame = Math.min(4, Math.floor(w.awakeningTimer / 60));
      if (w.awakeningTimer >= 300) {  // 5 seconds
        w.state = 'active';
        this._notify('The Wither is enraged!', '#FF4400', 160);
      }
      return;
    }

    if (w.state === 'dying') {
      w.awakeningTimer++;
      if (w.awakeningTimer >= 180 && !this._witherDefeated) {
        this._witherDefeated      = true;
        this._witherVictoryScreen = true;
        this._witherVictoryTimer  = 0;
        this._endWitherMusic();
        // Drop Nether Star equivalent at Wither position
        this.mobManager.dropItems([
          { x: w.x + WITHER_BODY_W / 2, y: w.y, itemKey: BLOCK.WITHER_SKELETON_HEAD, amount: 1 },
        ]);
        // After victory screen, fade to black then return player to pre-fight position
        setTimeout(() => {
          this._witherFade = {
            alpha: 0,
            phase: 'out',
            callback: () => {
              this._witherBoss         = null;
              this._witherVictoryScreen = false;
              this.player.x  = this._witherPreFightX;
              this.player.y  = this._witherPreFightY;
              this.player.vx = 0; this.player.vy = 0;
            },
          };
        }, 3000);
      }
      return;
    }

    if (w.state !== 'active') return;

    // Check death
    if (w.hp <= 0) {
      w.hp = 0;
      w.state = 'dying';
      w.awakeningTimer = 0;
      w.skulls = [];
      this._playSound('sounds/ender-dragon-defeated.mp3');
      this._playVictoryMusic();
      return;
    }

    // ── Horizontal movement ──────────────────────────────────
    w.movTimer++;
    if (w.movTimer >= w.movDuration) {
      w.movTimer = 0;
      w.movDuration = 120 + Math.floor(Math.random() * 120);
      // 80% bias toward player, 20% random
      if (Math.random() < 0.8) {
        w.movDir = this.player.cx > (w.x + WITHER_BODY_W / 2) ? 1 : -1;
      } else {
        w.movDir = Math.random() < 0.5 ? 1 : -1;
      }
    }

    const hSpeedPx = 1.5; // px per frame
    w.x += w.movDir * hSpeedPx;

    // Clamp to arena
    const minX = WITHER_ARENA_MIN_COL * BLOCK_SIZE + BLOCK_SIZE;
    const maxX = (WITHER_ARENA_MAX_COL - 2) * BLOCK_SIZE - WITHER_BODY_W;
    w.x = Math.max(minX, Math.min(maxX, w.x));

    // Update sprite direction
    if      (w.movDir > 0) w.sprite = 'right';
    else if (w.movDir < 0) w.sprite = 'left';
    // (stays left/right — only goes forward when speed is ~0)
    w.vx = w.movDir * hSpeedPx;

    // ── Vertical sinusoidal bob ────────────────────────────────
    w.bobTimer++;
    const bobAmplitude = 3 * BLOCK_SIZE;
    const bobPeriod    = 600; // ticks for full cycle
    w.y = WITHER_BASE_ROW * BLOCK_SIZE + Math.sin((w.bobTimer / bobPeriod) * Math.PI * 2) * bobAmplitude;

    // ── Attacks ────────────────────────────────────────────────
    w.attackTimer++;
    if (w.attackTimer >= w.attackDelay) {
      w.attackTimer = 0;
      w.attackDelay = 120 + Math.floor(Math.random() * 120);
      if (Math.random() < 0.6) this._witherFireBlackSkull(w);
      else                     this._witherFireBlueSkull(w);
    }

    // ── Update skulls ─────────────────────────────────────────
    const p = this.player;
    w.skulls = w.skulls.filter(sk => {
      if (sk.dead) return false;
      sk.x += sk.vx;
      sk.y += sk.vy;
      sk.age++;
      if (sk.age > sk.maxAge) return false;

      // Block collision for blue skulls
      if (sk.kind === 'blue') {
        const fc = Math.floor(sk.x / BLOCK_SIZE);
        const fr = Math.floor(sk.y / BLOCK_SIZE);
        if (this.level.isSolid(fr, fc) && !sk.exploded) {
          this._blueSkullExplode(sk, p);
          return false;
        }
      }

      // Player collision
      if (sk.x > p.x && sk.x < p.x + p.width &&
          sk.y > p.y && sk.y < p.y + p.height) {
        if (sk.kind === 'blue' && !sk.exploded) {
          this._blueSkullExplode(sk, p);
        } else {
          if (p.takeDamage(sk.damage)) {
            this.mobManager.addPlayerDamageNum(p, sk.damage);
            this._notify('Wither skull hits you!', '#FF6600', 90);
            this._checkDeath();
          }
        }
        return false;
      }
      return true;
    });

    // ── Player arrows vs Wither ────────────────────────────────
    for (const pa of this.mobManager.playerArrows) {
      if (!pa.alive) continue;
      const hb = this._witherHitbox(w);
      if (pa.x > hb.x && pa.x < hb.x + hb.w &&
          pa.y > hb.y && pa.y < hb.y + hb.h) {
        const dmg = pa.damage;
        w.hp = Math.max(0, w.hp - dmg);
        this.mobManager.damageNums.push(new DamageNumber(pa.x, w.y - 8, dmg, '#FFAA22'));
        w.hitFlash = 8;
        pa.alive = false;
      }
    }

    if (w.hitFlash > 0) w.hitFlash--;

    // ── Wither music trigger ────────────────────────────────────
    const pCol = Math.floor(this.player.cx / BLOCK_SIZE);
    if (pCol >= WITHER_ARENA_MIN_COL && pCol <= WITHER_ARENA_MAX_COL) {
      if (!this._musicSystem.witherMusicActive) this._startWitherMusic();
    }
  }

  _witherHitbox(w) {
    if (w.sprite === 'forward') {
      return { x: w.x, y: w.y, w: WITHER_BODY_W, h: WITHER_BODY_H };
    }
    // Left / right: narrower (1 block wide)
    const cx = w.x + WITHER_BODY_W / 2;
    return { x: cx - WITHER_SIDE_W / 2, y: w.y, w: WITHER_SIDE_W, h: WITHER_BODY_H };
  }

  // Smart Mobs §2 — resolve a weapon's active traits: WEAPON_TRAITS[class] base,
  // merged with any per-world overrides in _worldAdvSettings.weapons[class]
  // (set in World Settings → Combat → Weapons). Sword cleave resolves by tier.
  _meleeTraits(player) {
    const cls = player.meleeClass || 'sword';
    const base = (typeof WEAPON_TRAITS !== 'undefined' && WEAPON_TRAITS[cls]) || WEAPON_TRAITS.sword;
    const t = Object.assign({}, base);
    if (t.cleave === 'tier') {
      const tier = (TOOL_DATA[player.sword] && TOOL_DATA[player.sword].tier) || 0;
      t.cleave = swordCleaveForTier(tier);
    }
    const ov = this._worldAdvSettings.weapons && this._worldAdvSettings.weapons[cls];
    if (ov) {
      if (ov.hitAll === true) t.cleave = 0;             // 0 = unlimited (hit all)
      else if (ov.hitAll === false && (t.cleave === 0 || t.cleave === Infinity)) t.cleave = 1;
      if (ov.dmgMult    != null) t.dmgMult      = ov.dmgMult;
      if (ov.knockback  != null) t.knockback    = ov.knockback;
      if (ov.cooldownMult != null) t.cooldownMult = ov.cooldownMult;
      // Attack Speed (higher = faster) divides the base swing cooldown.
      if (ov.atkSpeed   != null && ov.atkSpeed > 0) t.cooldownMult = (t.cooldownMult || 1) / ov.atkSpeed;
      if (ov.throwable  != null) t.throwable    = !!ov.throwable;
    }
    return t;
  }
  _rangedTraits(player) {
    const cls = player.rangedClass || 'bow';
    const base = (typeof WEAPON_TRAITS !== 'undefined' && WEAPON_TRAITS[cls]) || WEAPON_TRAITS.bow;
    const t = Object.assign({}, base);
    const ov = this._worldAdvSettings.weapons && this._worldAdvSettings.weapons[cls];
    if (ov) {
      if (ov.pierce  != null) t.pierce  = !!ov.pierce;
      if (ov.dmgMult != null) t.dmgMult = ov.dmgMult;
    }
    return t;
  }

  // Smart Mobs §2 — equip the world's chosen starting weapons (World Settings →
  // Combat → Weapons). Melee 'sword' is left alone so normal tier progression
  // still works; spear/axe/trident replace the melee slot. Crossbow replaces the
  // bow slot when the player has (or, in sandbox/god mode, is granted) a ranged
  // weapon. Idempotent — safe to call on every world load.
  _applyStartingWeapons() {
    const s = this._worldAdvSettings || {};
    const MELEE  = { spear: 'IRON_SPEAR', axe: 'IRON_AXE', trident: 'TRIDENT' };
    const creative = this.gameMode === 'sandbox';
    for (const pl of (this.players || [this.player])) {
      if (!pl) continue;
      if (s.startingMelee && MELEE[s.startingMelee]) pl.sword = MELEE[s.startingMelee];
      if (s.startingRanged === 'crossbow' && (pl.bow || pl.godMode || creative)) pl.bow = 'CROSSBOW';
    }
  }

  _playerMeleeWither() {
    const w = this._witherBoss;
    if (!w || w.state !== 'active') return;
    const hb = this._witherHitbox(w);
    const p = this.player;
    const dist = Math.hypot((hb.x + hb.w / 2) - p.cx, (hb.y + hb.h / 2) - p.cy);
    if (dist > ATTACK_REACH) return;
    const dmg = p.weaponDamage || 1;
    w.hp = Math.max(0, w.hp - dmg);
    this.mobManager.damageNums.push(new DamageNumber(p.cx, w.y - 8, dmg, '#FFAA22'));
    w.hitFlash = 8;
  }

  _witherFireBlackSkull(w) {
    const cx = w.x + WITHER_BODY_W / 2;
    const cy = w.y + WITHER_BODY_H / 2;
    const tDx = this.player.cx - cx;
    const tDy = this.player.cy - cy;
    const dist = Math.hypot(tDx, tDy) || 1;
    const speed = 4; // px/frame
    w.skulls.push({
      kind: 'black',
      x: cx, y: cy,
      vx: (tDx / dist) * speed,
      vy: (tDy / dist) * speed,
      damage: 20,
      age: 0, maxAge: 600,
      dead: false,
    });
    this._playSound('sounds/ender-dragon-fireball.mp3');
  }

  _witherFireBlueSkull(w) {
    const cx = w.x + WITHER_BODY_W / 2;
    const cy = w.y + WITHER_BODY_H / 2;
    const tDx = this.player.cx - cx;
    const tDy = this.player.cy - cy;
    const dist = Math.hypot(tDx, tDy) || 1;
    const speed = 2.5;
    w.skulls.push({
      kind: 'blue',
      x: cx, y: cy,
      vx: (tDx / dist) * speed,
      vy: (tDy / dist) * speed,
      damage: 50,
      exploded: false,
      age: 0, maxAge: 900,
      dead: false,
    });
    this._playSound('sounds/explosion-tnt.mp3');
  }

  _blueSkullExplode(skull, player) {
    skull.exploded = true;
    this._playSound('sounds/explosion-tnt.mp3');
    this._screenShake.intensity = 6; this._screenShake.frames = 14; this._screenShake.maxFrames = 14;
    this.mobManager.explosions.push(new ExplosionEffect(skull.x, skull.y, 3 * BLOCK_SIZE));
    // Damage player if in range (4 blocks)
    if (Math.hypot(player.cx - skull.x, player.cy - skull.y) <= 4 * BLOCK_SIZE) {
      if (player.takeDamage(skull.damage)) {
        this.mobManager.addPlayerDamageNum(player, skull.damage);
        this._notify('Blue skull EXPLODES!', '#4466FF', 120);
        this._checkDeath();
      }
    }
  }

  _renderWither(ctx) {
    const w = this._witherBoss;
    if (!w) return;

    const sx = Math.floor(w.x - this.camera.x);
    const sy = Math.floor(w.y - this.camera.y);

    if (sx + WITHER_BODY_W < -32 || sx > CANVAS_W + 32) return;

    ctx.save();

    // Hit flash
    if (w.hitFlash > 0) {
      ctx.globalAlpha = w.hitFlash % 2 === 0 ? 0.4 : 1.0;
    }

    if (w.state === 'awakening') {
      // Awakening animation: try sprite, fallback to canvas
      const aw = this._witherSprites.awakening[w.awakeningFrame];
      if (aw && aw.complete && aw.naturalWidth > 0) {
        ctx.drawImage(aw, sx, sy, WITHER_BODY_W, WITHER_BODY_H);
      } else {
        this._drawWitherFallback(ctx, sx, sy, 0.3 + w.awakeningFrame * 0.14);
      }
    } else if (w.state === 'dying') {
      const alpha = Math.max(0, 1 - w.awakeningTimer / 150);
      ctx.globalAlpha *= alpha;
      this._drawWitherFallback(ctx, sx, sy, 1.0);
    } else {
      // Active — draw directional sprite or fallback
      const sprImg = this._witherSprites[w.sprite];
      const drawW = (w.sprite === 'forward') ? WITHER_BODY_W : WITHER_SIDE_W;
      const offX  = (w.sprite !== 'forward') ? (WITHER_BODY_W - WITHER_SIDE_W) / 2 : 0;
      if (sprImg && sprImg.complete && sprImg.naturalWidth > 0) {
        ctx.drawImage(sprImg, sx + offX, sy, drawW, WITHER_BODY_H);
      } else {
        this._drawWitherFallback(ctx, sx, sy, 1.0);
      }
    }

    ctx.restore();

    // Render skulls
    for (const sk of w.skulls) {
      const skx = Math.floor(sk.x - this.camera.x);
      const sky = Math.floor(sk.y - this.camera.y);
      ctx.save();
      ctx.beginPath();
      ctx.arc(skx, sky, sk.kind === 'black' ? 6 : 9, 0, Math.PI * 2);
      ctx.fillStyle = sk.kind === 'black' ? '#222244' : '#2244AA';
      ctx.fill();
      // Glowing core
      ctx.beginPath();
      ctx.arc(skx, sky, sk.kind === 'black' ? 3 : 5, 0, Math.PI * 2);
      ctx.fillStyle = sk.kind === 'black' ? '#8844CC' : '#4488FF';
      ctx.fill();
      ctx.restore();
    }
  }

  _drawWitherFallback(ctx, sx, sy, energyLevel) {
    // Canvas-drawn Wither silhouette for when sprites aren't loaded
    const cx = sx + WITHER_BODY_W / 2;
    const pulse = Math.sin(this.frameCount * 0.1) * 0.5 + 0.5;

    // Main body (dark armored torso)
    ctx.fillStyle = '#1A1422';
    ctx.fillRect(sx + 28, sy + 24, 40, 60);

    // Three head positions (spine)
    const headData = [
      { ox: 0, col: '#2A1A3A' },    // centre head
      { ox: -28, col: '#241630' },  // left head
      { ox: +28, col: '#241630' },  // right head
    ];
    for (const { ox, col } of headData) {
      ctx.fillStyle = col;
      ctx.fillRect(cx + ox - 14, sy + 4, 28, 22);
      // Glowing eye slots
      ctx.fillStyle = `rgba(200,100,255,${0.6 + pulse * 0.4 * energyLevel})`;
      ctx.fillRect(cx + ox - 11, sy + 8, 7, 7);
      ctx.fillRect(cx + ox + 4,  sy + 8, 7, 7);
    }

    // Shoulder armour plates
    ctx.fillStyle = '#331A44';
    ctx.fillRect(sx + 8,  sy + 30, 22, 16);
    ctx.fillRect(sx + 66, sy + 30, 22, 16);

    // Dark energy aura
    const aura = ctx.createRadialGradient(cx, sy + 50, 10, cx, sy + 50, 54);
    aura.addColorStop(0, `rgba(100,0,150,${0.3 * energyLevel})`);
    aura.addColorStop(1, 'rgba(100,0,150,0)');
    ctx.fillStyle = aura;
    ctx.beginPath(); ctx.arc(cx, sy + 50, 54, 0, Math.PI * 2); ctx.fill();
  }

  _drawWitherHUD(ctx) {
    const w = this._witherBoss;
    if (!w || w.state === 'awakening' || w.state === 'dying') return;

    const barW = 200, barH = 12;
    // Position above the Dragon HUD if Dragon is also active (stack them)
    const byOffset = (this._dragon && this._dragon.isAlive) ? 46 : 0;
    const bx = CANVAS_W - barW - 12;
    const by = 12 + byOffset;
    const fill = Math.max(0, (w.hp / w.maxHp) * barW);

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    _roundRect(ctx, bx - 2, by - 14, barW + 4, barH + 18, 4); ctx.fill();

    ctx.font = 'bold 9px Courier New';
    ctx.fillStyle = '#FFAA22';
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('WITHER', bx, by - 2);

    ctx.fillStyle = '#2A1A00';
    ctx.fillRect(bx, by, barW, barH);

    const pct = w.hp / w.maxHp;
    ctx.fillStyle = pct > 0.5 ? '#FF8800' : pct > 0.25 ? '#FF4400' : '#FF2222';
    ctx.fillRect(bx, by, Math.round(fill), barH);

    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    for (let i = 1; i < 10; i++) ctx.fillRect(bx + i * 20 - 0.5, by, 1, barH);

    ctx.font = '9px Courier New';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.ceil(w.hp)}/${w.maxHp} HP`, bx + barW, by + barH + 9);
    ctx.textAlign = 'left';
  }

  _drawWitherVictoryScreen(ctx) {
    if (!this._witherVictoryScreen) return;
    this._witherVictoryTimer++;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const pw = 420, ph = 210;
    const panX = (CANVAS_W - pw) / 2, panY = (CANVAS_H - ph) / 2;

    ctx.fillStyle = '#1A0800';
    _roundRect(ctx, panX, panY, pw, ph, 12); ctx.fill();
    ctx.strokeStyle = '#FF8800'; ctx.lineWidth = 3;
    _roundRect(ctx, panX, panY, pw, ph, 12); ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFAA22';
    ctx.font = 'bold 26px Courier New';
    ctx.fillText('WITHER DEFEATED!', CANVAS_W / 2, panY + 58);

    ctx.fillStyle = '#FFCC88';
    ctx.font = '13px Courier New';
    ctx.fillText('The Nether is safe… for now.', CANVAS_W / 2, panY + 90);
    ctx.fillStyle = '#aaa';
    ctx.font = '11px Courier New';
    ctx.fillText('You will be returned to the Overworld shortly.', CANVAS_W / 2, panY + 112);

    // Auto-dismiss after 5 seconds
    if (this._witherVictoryTimer >= 300) this._witherVictoryScreen = false;

    const bw = 180, bh = 34;
    const bx = (CANVAS_W - bw) / 2, by = panY + ph - 56;
    ctx.fillStyle = '#663300';
    _roundRect(ctx, bx, by, bw, bh, 6); ctx.fill();
    ctx.strokeStyle = '#FF8800'; ctx.lineWidth = 2;
    _roundRect(ctx, bx, by, bw, bh, 6); ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 13px Courier New';
    ctx.fillText('Continue Playing', CANVAS_W / 2, by + 22);

    ctx.textAlign = 'left';
    ctx.restore();
  }

  _startWitherMusic() {
    if (this._musicSystem.witherMusicActive) return;
    this._musicSystem.witherMusicActive = true;
    this._musicSystem.lastNormalTrack   = this._musicSystem.currentTrack;
    const bg = this._musicSystem.bgAudio;
    if (!bg) return;
    this._fadeOutMusic(500, () => {
      bg.src    = WITHER_MUSIC_FILE;
      bg.loop   = true;
      bg.volume = 0;
      const p = bg.play();
      if (p) p.catch(() => {});
      this._fadeInMusic(500);
    });
  }

  _endWitherMusic() {
    if (!this._musicSystem.witherMusicActive) return;
    this._musicSystem.witherMusicActive = false;
    const bg = this._musicSystem.bgAudio;
    if (bg) bg.loop = false;
    this._fadeOutMusic(500, () => {
      const resume = this._musicSystem.lastNormalTrack;
      if (resume) this._playBackgroundTrack(resume);
      else        this._advancePlaylist();
    });
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

  // Delete a ruined portal: clear its obsidian frame, any filled gap obsidian, and
  // the interior (AIR, or NETHER_PORTAL if it was activated) from the grid, then drop
  // it from the ruined-portal registries. (Its sandbox entry is removed separately by
  // SandboxManager.unregisterPortal.) Only obsidian/portal blocks inside the 4×4 box
  // are cleared, so unrelated blocks the player built next to it are left intact.
  _removeRuinedPortal(anchorRow, anchorCol) {
    const clear = (dr, dc) => {
      const r = anchorRow + dr, c = anchorCol + dc;
      const b = this.level.get(r, c);
      if (b === BLOCK.OBSIDIAN || b === BLOCK.NETHER_PORTAL) this.level.set(r, c, BLOCK.AIR);
      this._portalObsidianCells.delete(`${c},${r}`);
    };
    for (const [dr, dc] of Game.RP_FRAME_OFFSETS)    clear(dr, dc);
    for (const [dr, dc] of Game.RP_GAP_OFFSETS)      clear(dr, dc);
    for (const [dr, dc] of Game.RP_INTERIOR_OFFSETS) clear(dr, dc);
    this._ruinedPortals.delete(`${anchorRow},${anchorCol}`);
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
    if (this._onlineGameId && window.multiplayerManager?.isCreator) {
      const changes = Game.RP_INTERIOR_OFFSETS.map(([dr, dc]) => ({
        row: anchorRow + dr, col: anchorCol + dc, block: BLOCK.NETHER_PORTAL,
      }));
      window.multiplayerManager.sendBlockChanged(changes, { ruinedPortal: { anchorRow, anchorCol } });
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

  // Scan the live grid and re-populate _portalObsidianCells.
  // Called by multiplayer.js after the server overwrites the grid, so joining players
  // get the same non-solid portal/obsidian behaviour as the session creator.
  _rebuildPortalObsidianFromGrid() {
    if (!this.level) return;
    this._portalObsidianCells.clear();
    const { width: W, height: H, grid } = this.level;
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        if (grid[r][c] !== BLOCK.NETHER_PORTAL) continue;
        // OBSIDIAN adjacent to an active portal interior is non-solid so the
        // player can step through the opening — but NEVER the obsidian BELOW the
        // portal: that is the base the player stands on. Marking it non-solid
        // (the old [1,0]/[2,0] downward offsets) made joiners fall through the
        // portal base (the host never runs this scan, so its base stayed solid).
        for (const [dr, dc] of [[-1,0],[0,-1],[0,1],[-2,0],[0,-2],[0,2]]) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < H && nc >= 0 && nc < W && grid[nr][nc] === BLOCK.OBSIDIAN) {
            this._portalObsidianCells.add(`${nc},${nr}`);
          }
        }
      }
    }
    // Also detect ruined-portal frames: look for the 6-cell OBSIDIAN frame pattern.
    const FO = Game.RP_FRAME_OFFSETS;
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        if (FO.every(([dr, dc]) => {
          const nr = r + dr, nc = c + dc;
          return nr >= 0 && nr < H && nc >= 0 && nc < W && grid[nr][nc] === BLOCK.OBSIDIAN;
        })) {
          for (const [dr, dc] of FO) this._portalObsidianCells.add(`${c + dc},${r + dr}`);
        }
      }
    }
  }

  // Scan the live grid and register redstone-interactive blocks that joiners
  // don't have components for (lever, trapdoor, pressure_plate, tnt).
  // Called after _applyServerBlocks so online joiners can interact with them.
  _rebuildRedstoneFromGrid() {
    if (!this.level || !this.redstone) return;
    const { width: W, height: H, grid } = this.level;
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const b = grid[r][c];
        if      (b === BLOCK.LEVER          && !this.redstone.getAt(c, r))
          this.redstone.addComponent({type: 'lever',          col: c, row: r, on: false,    links: [], sandboxPlaced: true});
        else if (b === BLOCK.TRAPDOOR       && !this.redstone.getAt(c, r))
          this.redstone.addComponent({type: 'trapdoor',       col: c, row: r, open: false,  links: [], sandboxPlaced: true});
        else if (b === BLOCK.PRESSURE_PLATE && !this.redstone.getAt(c, r))
          this.redstone.addComponent({type: 'pressure_plate', col: c, row: r, on: false,    links: [], sandboxPlaced: true});
        else if (b === BLOCK.TNT            && !this.redstone.getAt(c, r))
          this.redstone.addComponent({type: 'tnt',            col: c, row: r, fuse: 0,      links: [], sandboxPlaced: true});
        else if (b === BLOCK.PISTON_BODY    && !this.redstone.getAt(c, r))
          this.redstone.addComponent({type: 'piston',         col: c, row: r, dir: 'right', inverted: false, extended: false, links: [], sandboxPlaced: true});
      }
    }
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
    // Speed Runner uses its own minimal HUD — skip the normal combat HUD
    if (this.gameMode === 'speedrunner') {
      this._drawCoords(ctx);
      this._drawHelpButton(ctx);
      ctx.restore();
      return;
    }
    this._drawHealthBar(ctx);
    this._drawDragonHUD(ctx);
    this._drawWitherHUD(ctx);
    // XP bar and hotbar suppressed in sandbox (no XP gain, sandbox has its own hotbar)
    if (this.gameMode !== 'sandbox') {
      this._drawXpBar(ctx);
      if (this.player2 || this.isArena || this._worldAdvSettings.compactHotbar) {
        // 2P / local-MP, Arena, or the Compact-Hotbar setting: small hotbar under XP.
        this._drawCompactHotbar(ctx, this.player, false);
      } else {
        this._drawHotbar(ctx);
        this._drawWeaponLabel(ctx);
      }
    }
    this._drawPickaxeBadge(ctx); // always-active mining tier (Normal mode)
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
    if (this.gameMode === 'platformer') this._drawPlatformerScoreHud(ctx);
    if (this._testMode) {
      const r = this._testExitRect();
      const mx = this.input.mouse.x, my = this.input.mouse.y;
      const hov = mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;
      ctx.fillStyle = hov ? 'rgba(220,60,60,0.95)' : 'rgba(220,60,60,0.8)';
      _roundRect(ctx, r.x, r.y, r.w, r.h, 5); ctx.fill();
      ctx.strokeStyle = '#ff9a9a'; ctx.lineWidth = 1; _roundRect(ctx, r.x, r.y, r.w, r.h, 5); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 11px Courier New';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('✕ EXIT TEST', r.x + r.w / 2, r.y + r.h / 2);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      // small hint
      ctx.fillStyle = 'rgba(255,180,120,0.9)'; ctx.font = '8px Courier New'; ctx.textAlign = 'left';
      ctx.fillText('🧪 Test (Esc)', r.x, r.y - 4);
    }
    this._drawHelpButton(ctx);
    this._drawControllerStatus(ctx);
    this._drawContextPrompt(ctx);
    for (let i = 1; i < this.players.length; i++) {
      const p = this.players[i];
      if (!p) continue;
      if (i === 1) this._drawSecondaryHUD(ctx, p, i, 0); // P2 top-right (full HUD)
      else         this._drawLowerPlayerHUD(ctx, p, i);  // P3 lower-left, P4 lower-right
    }
    if (this.isArena) this._drawArenaHUD(ctx);
    ctx.restore();
  }

  // ── Phase 3A.1: Arena HUD (timer + kills + bots), drawn over the canvas HUD ──
  _drawArenaHUD(ctx) {
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    // Timer (counts down to the limit, or up if unlimited)
    let t = this._arenaElapsedMs();
    const dur = this.arenaConfig.gameDuration;
    const shown = dur > 0 ? Math.max(0, dur - t) : t;
    const sec = Math.floor(shown / 1000), mm = Math.floor(sec / 60), ss = sec % 60;
    ctx.font = 'bold 18px Courier New';
    ctx.fillStyle = '#FFD700';
    ctx.fillText(`${mm}:${String(ss).padStart(2, '0')}`, CANVAS_W / 2, 14);

    // Per-player score (derived per mode) + bots remaining.
    const bots = this.mobManager.mobs.filter(m => m.alive).length;
    ctx.font = 'bold 13px Courier New';
    ctx.fillStyle = '#FFFFFF';
    let line;
    if (typeof ARENA_MODES !== 'undefined' && ARENA_MODES.playerScore) {
      const ids = this.activePlayers().map(p => p._ownerId || 'p1');
      const parts = ids.map(id => `${id.toUpperCase()}: ${ARENA_MODES.playerScore(this, id)}`);
      line = (ids.length > 1 ? parts.join('   ') : `Score: ${ARENA_MODES.playerScore(this, 'p1')}`) + `    Bots: ${bots}`;
    } else {
      line = `Score: ${this.arenaState.stats.p1.kills}    Bots: ${bots}`;
    }
    ctx.fillText(line, CANVAS_W / 2, 32);

    // Game-mode objective line (Phase 3A.2).
    if (typeof ARENA_MODES !== 'undefined' && this.arenaConfig.arenaGameMode) {
      const mt = ARENA_MODES.getHUDText(this);
      if (mt) {
        ctx.font = '11px Courier New';
        ctx.fillStyle = '#FFD27F';
        ctx.fillText(mt, CANVAS_W / 2, 62);
      }
    }

    // Zoom readout (only when a zoom is active).
    const z = this.camera._srZoom || 1.0;
    if (Math.abs(z - 1.0) > 0.005) {
      ctx.font = '11px Courier New';
      ctx.fillStyle = '#9FD3FF';
      ctx.fillText(`Zoom: ${z.toFixed(2)}×`, CANVAS_W / 2, 48);
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  // ── Phase 3A.1: Arena countdown overlay (3·2·1·GO) ──
  _drawArenaCountdown(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    const el = this.arenaState.countdownStart ? Date.now() - this.arenaState.countdownStart : 0;
    const label = el < 1000 ? '3' : el < 2000 ? '2' : el < 3000 ? '1' : 'GO!';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = label === 'GO!' ? '#4CAF50' : '#FFD700';
    ctx.font = 'bold 120px Arial';
    ctx.fillText(label, CANVAS_W / 2, CANVAS_H / 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 18px Arial';
    ctx.fillText('Deathmatch — defeat the bots!', CANVAS_W / 2, CANVAS_H / 2 + 90);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  // ── Arena end screen (Phase 3A.1 Deathmatch + 3A.2 modes) ──
  _drawArenaEnd(ctx) {
    this._submitArenaResultOnce(); // leaderboard submit (once), mode runs only
    this._fetchArenaLeaderOnce();  // current world/mode Leader (async, cached)

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = CANVAS_W / 2, cy = CANVAS_H / 2;
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 40px Arial';
    ctx.fillText('Game Over!', cx, cy - 118);

    const AM = (typeof ARENA_MODES !== 'undefined') ? ARENA_MODES : null;
    const mode = this.arenaConfig.arenaGameMode;
    ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 22px Arial';
    ctx.fillText(AM ? AM.label(mode) : 'Quick Battle', cx, cy - 80);

    // Winner / headline score.
    let winTxt = (AM && AM.winnerText) ? AM.winnerText(this) : null;
    if (!winTxt) winTxt = `Score: ${AM ? AM.score(this) : 0}`;
    ctx.fillStyle = '#FFD700'; ctx.font = 'bold 24px Arial';
    ctx.fillText(winTxt, cx, cy - 48);

    // Per-player individual stats breakdown.
    this._drawArenaStatsTable(ctx, cx, cy - 16);

    // Current world/mode Leader ("who to beat") — the single top scorer.
    if (this._arenaLeader) {
      const L = this._arenaLeader;
      ctx.fillStyle = '#FFD700'; ctx.font = 'bold 15px Courier New';
      ctx.fillText('👑 LEADER', cx, cy + 100);
      ctx.fillStyle = '#FFFFFF'; ctx.font = '14px Courier New';
      ctx.fillText(`${L.player_name || 'Player'} — ${L.score}`, cx, cy + 120);
    }

    ctx.fillStyle = '#AAAAAA'; ctx.font = 'bold 18px Arial';
    ctx.fillText('Press ESC to exit', cx, cy + 148);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  // Per-player individual stats table for the arena end screen. Columns adapt to
  // the mode (Score always; Flags only for CTF; TwrDmg only for Defend the Tower).
  _drawArenaStatsTable(ctx, cx, y) {
    const ids = this.activePlayers().map(p => p._ownerId || 'p1');
    if (!ids.length) return;
    const AM = (typeof ARENA_MODES !== 'undefined') ? ARENA_MODES : null;
    const mode = this.arenaConfig.arenaGameMode;
    const cols = [
      { h: 'Player', get: (id) => id.toUpperCase() },
      { h: 'Score',  get: (id) => AM ? AM.playerScore(this, id) : 0 },
      { h: 'Kills',  get: (id) => this.arenaState.stats[id]?.kills || 0 },
      { h: 'Deaths', get: (id) => this.arenaState.stats[id]?.deaths || 0 },
      { h: 'Mobs',   get: (id) => this.arenaState.stats[id]?.mobKills || 0 },
      { h: 'Gems',   get: (id) => this.arenaState.stats[id]?.emeralds || 0 },
    ];
    if (mode === 'KING_OF_HILL') cols.push({ h: 'HillS', get: (id) => this.arenaState.stats[id]?.hillSeconds || 0 });
    if (mode === 'CAPTURE_FLAG') cols.push({ h: 'Flags', get: (id) => this.arenaState.stats[id]?.flagCaptures || 0 });
    if (mode === 'DEFEND_TOWER') cols.push({ h: 'TwrDmg', get: (id) => this.arenaState.stats[id]?.towerDamage || 0 });
    // Custom Rules: per-player win progress (step reached / conditions met). This
    // is what establishes the winner when nobody fully completed their objective.
    const rs = (mode === 'CUSTOM' && typeof ARENA_RULES !== 'undefined' && AM && AM._rulesetFor) ? AM._rulesetFor(this) : null;
    if (rs) cols.push({ h: 'Progress', get: (id) => {
      const os = ARENA_RULES.objectiveStatus(rs, this, id);
      if (os.mode === 'stages') return os.won ? '✓WON' : `S${Math.min(os.current + 1, os.total)}/${os.total}`;
      if (os.mode === 'flat')   return os.won ? '✓WON' : `${os.conditions.filter(c => c.met).length}/${os.conditions.length}`;
      return '—';
    } });

    const winnerId = (rs && ARENA_RULES.winner) ? ARENA_RULES.winner(rs, this) : ((AM && AM.winnerText && AM._leader && mode === 'DEATHMATCH') ? AM._leader(this).id : null);
    const colW = 72;
    const startX = cx - (cols.length - 1) * colW / 2;
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px Courier New'; ctx.fillStyle = '#88CCFF';
    cols.forEach((c, i) => ctx.fillText(c.h, startX + i * colW, y));
    ctx.font = '13px Courier New';
    ids.forEach((id, r) => {
      const ry = y + 22 + r * 20;
      ctx.fillStyle = (id === winnerId) ? '#FFD700' : '#FFFFFF'; // highlight the winner
      cols.forEach((c, i) => ctx.fillText(String(c.get(id)), startX + i * colW, ry));
    });
  }

  // Submit the arena result to the leaderboard exactly once (mode runs only).
  _submitArenaResultOnce() {
    if (this._arenaResultSubmitted) return;
    this._arenaResultSubmitted = true;
    if (this._testMode) return; // Test World never records to the leaderboard

    const mode = this.arenaConfig.arenaGameMode;
    if (!mode || typeof LEADERBOARD_SYSTEM === 'undefined' || !LEADERBOARD_SYSTEM.submit) return;
    const score = (typeof ARENA_MODES !== 'undefined') ? ARENA_MODES.score(this) : (this.arenaState.stats.p1.kills || 0);
    const durMs  = (this.arenaState.gameStartTime && this.arenaState.endTime)
      ? this.arenaState.endTime - this.arenaState.gameStartTime : 0;
    LEADERBOARD_SYSTEM.submit(mode, score, Math.round(durMs / 1000), this._arenaWorldId);
    this._recordMatchStats(mode, durMs);
  }

  // Fetch the current (pre-match) Leader for this world+mode, once, so the end
  // screen can show "who to beat" alongside the just-finished result. Cached on
  // this._arenaLeader; the redraw loop picks it up when it resolves.
  _fetchArenaLeaderOnce() {
    if (this._arenaLeaderFetched) return;
    this._arenaLeaderFetched = true;
    const mode = this.arenaConfig.arenaGameMode;
    if (!mode || typeof LEADERBOARD_SYSTEM === 'undefined' || !LEADERBOARD_SYSTEM.fetchLeader) return;
    LEADERBOARD_SYSTEM.fetchLeader(mode, this._arenaWorldId)
      .then(lead => { this._arenaLeader = lead || null; })
      .catch(() => {});
  }

  // Record the local player's match into stats/achievements (Phase 4, fire-and-forget).
  _recordMatchStats(mode, durMs) {
    if (typeof AUTH === 'undefined' || !AUTH.authedFetch || !AUTH.isLoggedIn || !AUTH.isLoggedIn()) return;
    // Did the human (P1) win? PvP → leader/team; PvE → survived.
    let won = false, captures = 0;
    const AM = (typeof ARENA_MODES !== 'undefined') ? ARENA_MODES : null;
    if (mode === 'DEATHMATCH' && AM) won = AM._leader(this).id === 'p1';
    else if (mode === 'CAPTURE_FLAG') {
      const ts = this.arenaState.teamScores || [0, 0];
      const p1Team = (this.player && this.player.teamId != null) ? this.player.teamId : 0;
      captures = ts[p1Team] || 0;
      won = (ts[p1Team] || 0) >= (ts[1 - p1Team] || 0) && (ts[0] || ts[1]);
    } else {
      won = !!(this.player && this.player.hp > 0); // survived / completed
    }
    const body = {
      won: !!won,
      kills: this.arenaState.stats.p1.kills || 0,
      captures,
      playTimeMs: Math.max(0, Math.round(durMs)),
    };
    try {
      AUTH.authedFetch('/api/stats/match', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }).then(r => r.json()).then((data) => {
        if (data && data.unlocked && data.unlocked.length && this._notify) {
          for (const a of data.unlocked) this._notify(`🏆 Achievement: ${a.name}`, '#f5b301', 240);
        }
      }).catch(() => {});
    } catch (e) { /* fire-and-forget */ }
  }

  _drawHelpButton(ctx) {
    const SZ = 24, BX = CANVAS_W - SZ - 8, BY = 8;
    const mx = this.input.mouse.x, my = this.input.mouse.y;
    const hov = mx >= BX && mx <= BX + SZ && my >= BY && my <= BY + SZ;
    const active = this._tutorialOpen;
    ctx.save();
    ctx.fillStyle = active ? 'rgba(68,170,255,0.35)' : (hov ? 'rgba(68,170,255,0.2)' : 'rgba(0,0,0,0.55)');
    _roundRect(ctx, BX, BY, SZ, SZ, 12); ctx.fill();
    ctx.strokeStyle = active ? '#44AAFF' : (hov ? '#44AAFF99' : '#445566');
    ctx.lineWidth = active ? 2 : 1;
    _roundRect(ctx, BX, BY, SZ, SZ, 12); ctx.stroke();
    ctx.fillStyle = active ? '#88CCFF' : (hov ? '#88CCFF' : '#5577AA');
    ctx.font = 'bold 15px Courier New';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('?', BX + SZ / 2, BY + SZ / 2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
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

    // 2P co-op: P1 respawn overlay
    if (this._p1RespawnTimer > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      _roundRect(ctx, bx - 2, by - 2, bw + 48, bh + 4, 4); ctx.fill();
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 10px Courier New';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(`Respawn ${Math.ceil(this._p1RespawnTimer / 60)}s`, bx, by + bh / 2);
    }

    // 2P lives: small head icons to the RIGHT of P1 HP bar
    if (this.player2) {
      const livesLeft = p.lives ?? 3;
      const iconSz = 10, gap = 2;
      const lx0 = bx + bw + 50;  // after heart + HP text
      for (let i = 0; i < 2; i++) {
        const alive = i < livesLeft - 1; // -1 because current life is "active"
        const ix = lx0 + i * (iconSz + gap);
        ctx.fillStyle = alive ? '#FFD700' : 'rgba(80,70,30,0.6)';
        ctx.fillRect(ix, by + 1, iconSz, iconSz);
        ctx.strokeStyle = alive ? '#AA8800' : '#443300';
        ctx.lineWidth = 1;
        ctx.strokeRect(ix, by + 1, iconSz, iconSz);
        if (alive) {
          ctx.fillStyle = '#5533AA';
          ctx.fillRect(ix + 3, by + 3, 2, 2);
          ctx.fillRect(ix + 7, by + 3, 2, 2);
          ctx.fillRect(ix + 3, by + 7, 6, 2);
        }
      }
    }
  }

  // Compact 9-slot hotbar used in 2P mode — width matches HP bar (180px).
  // rightAlign=false → P1 left side; rightAlign=true → P2 right side.
  _drawCompactHotbar(ctx, player, rightAlign, hbYOverride = null) {
    const SZ = 19, GAP = 1;
    const totalW = 9 * SZ + 8 * GAP;   // 179px ≈ HP bar width (180px)
    const hbX = rightAlign ? (CANVAS_W - 10 - totalW) : 10;
    const hbY = hbYOverride != null ? hbYOverride : 47;   // XP bar ends at y=43, +4px gap
    const accentCol = rightAlign ? '#88AAFF' : '#FFD700';

    for (let i = 0; i < 9; i++) {
      const sx     = hbX + i * (SZ + GAP);
      const sy     = hbY;
      const slot   = player.hotbar[i];
      const active = i === player.selectedSlot;

      ctx.fillStyle   = active ? (rightAlign ? 'rgba(100,160,255,0.25)' : 'rgba(255,215,0,0.22)') : 'rgba(0,0,0,0.62)';
      ctx.fillRect(sx, sy, SZ, SZ);
      ctx.strokeStyle = active ? accentCol : '#555';
      ctx.lineWidth   = active ? 1.5 : 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, SZ - 1, SZ - 1);

      // Weapon slots 0-1 (sword, bow); pickaxe removed (mining is always-active).
      if (i <= 1) {
        const toolKey  = i === 0 ? player.sword : player.bow;
        const toolIcon = i === 0 ? '⚔' : '🏹';
        const toolData = toolKey ? TOOL_DATA[toolKey] : null;
        ctx.save();
        if (!toolData) ctx.globalAlpha = 0.35;
        ctx.fillStyle = toolData ? toolData.color : 'rgba(180,140,80,0.6)';
        ctx.font = `${SZ * 0.65}px serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(toolIcon, sx + SZ / 2, sy + SZ / 2);
        ctx.restore();
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      } else if (slot) {
        const pad = 2, scale = (SZ - pad * 2) / BLOCK_SIZE;
        ctx.save();
        ctx.translate(sx + pad, sy + pad); ctx.scale(scale, scale);
        drawBlock(ctx, slot.type, 0, 0, 0);
        ctx.restore();
        ctx.fillStyle    = '#fff'; ctx.font = 'bold 7px Courier New';
        ctx.textAlign    = 'right'; ctx.textBaseline = 'bottom';
        ctx.fillText(slot.count, sx + SZ - 1, sy + SZ - 1);
        ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      }

      // Slot number (tiny)
      ctx.fillStyle    = active ? accentCol : 'rgba(255,255,255,0.28)';
      ctx.font         = '6px Courier New';
      ctx.textBaseline = 'top';
      ctx.fillText(i + 1, sx + 2, sy + 1);
      ctx.textBaseline = 'alphabetic';
    }
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

      // Weapon slots 0-1: sword (0), bow (1). Pickaxe removed (mining always-active).
      if (i <= 1) {
        const toolKey  = i === 0 ? p.sword : p.bow;
        const toolIcon = i === 0 ? '⚔' : '🏹';
        const toolData = toolKey ? TOOL_DATA[toolKey] : null;
        if (toolData) {
          ctx.fillStyle    = toolData.color;
          ctx.font         = `${SLOT_SIZE * 0.52}px serif`;
          ctx.textAlign    = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(toolIcon, sx + SLOT_SIZE / 2, sy + SLOT_SIZE / 2);
          ctx.textAlign    = 'left'; ctx.textBaseline = 'alphabetic';
          if (i === 0) { // sword tier label
            ctx.fillStyle    = 'rgba(255,255,255,0.55)'; ctx.font = '7px Courier New';
            ctx.textAlign    = 'right'; ctx.textBaseline = 'bottom';
            const tierNames  = ['W', 'S', 'I', 'D', 'N'];
            ctx.fillText(tierNames[toolData.tier] ?? '', sx + SLOT_SIZE - 3, sy + SLOT_SIZE - 2);
            ctx.textAlign    = 'left'; ctx.textBaseline = 'alphabetic';
          }
        } else if (i === 1) {
          // Bow slot empty — ghost + craft hint
          ctx.fillStyle    = 'rgba(180,140,80,0.35)'; ctx.font = `${SLOT_SIZE * 0.52}px serif`;
          ctx.textAlign    = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('🏹', sx + SLOT_SIZE / 2, sy + SLOT_SIZE / 2);
          ctx.textAlign    = 'left'; ctx.textBaseline = 'alphabetic';
          ctx.fillStyle    = 'rgba(200,180,100,0.5)'; ctx.font = '7px Courier New';
          ctx.textAlign    = 'center'; ctx.fillText('craft', sx + SLOT_SIZE / 2, sy + SLOT_SIZE - 3);
          ctx.textAlign    = 'left';
        }
        // Arrow count overlay on the bow slot (i===1) when equipped + finite ammo
        if (i === 1 && toolKey && !this._worldAdvSettings.unlimitedArrows) {
          const arrowCount = p.countItem(BLOCK.ARROW);
          ctx.fillStyle    = arrowCount === 0 ? '#FF5555' : '#FFFFFF';
          ctx.font         = 'bold 10px Courier New';
          ctx.textAlign    = 'right'; ctx.textBaseline = 'bottom';
          ctx.fillText(arrowCount, sx + SLOT_SIZE - 3, sy + SLOT_SIZE - 2);
          ctx.textAlign    = 'left'; ctx.textBaseline = 'alphabetic';
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

  // Pickaxe-tier badge — shown when mining is a capability (Normal mode). Since
  // the pickaxe is no longer a hotbar slot, this tells the player which tier is
  // auto-used when they mine. Top-left, just under the XP bar.
  _drawPickaxeBadge(ctx) {
    if (!this._miningEnabled || !this.player) return;
    const data = TOOL_DATA[this.player.pickaxe]; if (!data) return;
    const label = '⛏ ' + String(data.name || 'Pickaxe').replace(/\s*Pickaxe$/i, '');
    ctx.save();
    ctx.font = 'bold 11px Courier New';
    // The left compact hotbar (2P / arena / compactHotbar option) sits at y≈47-66,
    // right where this badge would — drop the badge below it to avoid overlap.
    const compactLeft = !!(this.player2 || this.isArena || this._worldAdvSettings.compactHotbar);
    const w = ctx.measureText(label).width + 18, x = 10, y = compactLeft ? 70 : 48, h = 18;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; _roundRect(ctx, x, y, w, h, 5); ctx.fill();
    ctx.strokeStyle = data.color || '#C8A55A'; ctx.lineWidth = 1; _roundRect(ctx, x, y, w, h, 5); ctx.stroke();
    ctx.fillStyle = data.color || '#C8A55A';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x + 9, y + h / 2 + 1);
    ctx.restore();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
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

  // ── Gamepad context action helpers (Phase 11K-1) ────────────

  _nearBed() {
    const pCol = Math.floor(this.player.cx / BLOCK_SIZE);
    const pRow = Math.floor(this.player.cy / BLOCK_SIZE);
    for (let dc = -3; dc <= 3; dc++) {
      for (let dr = -1; dr <= 3; dr++) {
        if (this.level.get(pRow + dr, pCol + dc) === BLOCK.BED) return true;
      }
    }
    return false;
  }

  _nearPortal() {
    if (this.portalCooldown > 0) return false;
    const pCol = Math.floor(this.player.cx / BLOCK_SIZE);
    const pRow = Math.floor(this.player.cy / BLOCK_SIZE);
    for (let dc = -4; dc <= 4; dc++) {
      for (let dr = -4; dr <= 4; dr++) {
        const c = pCol + dc, r = pRow + dr;
        const b = this.level.get(r, c);
        if (b === BLOCK.NETHER_PORTAL || this._portalObsidianCells.has(`${c},${r}`)) return true;
      }
    }
    return false;
  }

  _nearRespawnAnchor() {
    const pCol = Math.floor(this.player.cx / BLOCK_SIZE);
    const pRow = Math.floor(this.player.cy / BLOCK_SIZE);
    for (let dc = -2; dc <= 2; dc++) {
      for (let dr = -2; dr <= 2; dr++) {
        if (this.level.get(pRow + dr, pCol + dc) === BLOCK.RESPAWN_ANCHOR) return true;
      }
    }
    return false;
  }

  // Returns the nearest interactable object for `player`, or null.
  // Result: { type, dist } — sorted by distance; apple is always last resort (dist=Infinity).
  _nearestInteractable(player) {
    const candidates = [];
    const pCx  = player.cx, pCy = player.cy;
    const pCol  = Math.floor(pCx / BLOCK_SIZE);
    const pRow  = Math.floor(pCy / BLOCK_SIZE);
    const dist  = (cx, cy) => Math.hypot(cx - pCx, cy - pCy);
    const bCtr  = (c, r)   => [(c + 0.5) * BLOCK_SIZE, (r + 0.5) * BLOCK_SIZE];

    // Chest
    for (const ch of this._chests.values()) {
      const [cx, cy] = bCtr(ch.col, ch.row);
      const d = dist(cx, cy);
      if (d <= 2.5 * BLOCK_SIZE) candidates.push({ type: 'chest', dist: d });
    }

    // Lever
    if (this.redstone) {
      for (const c of this.redstone.components) {
        if (c.type !== 'lever') continue;
        const [cx, cy] = bCtr(c.col, c.row);
        const d = dist(cx, cy);
        if (d <= 2.5 * BLOCK_SIZE) candidates.push({ type: 'lever', dist: d });
      }
    }

    // Bed
    let bedDist = Infinity;
    for (let dc = -3; dc <= 3; dc++) {
      for (let dr = -1; dr <= 3; dr++) {
        if (this.level.get(pRow + dr, pCol + dc) === BLOCK.BED) {
          const d = dist(...bCtr(pCol + dc, pRow + dr));
          if (d < bedDist) bedDist = d;
        }
      }
    }
    if (bedDist < Infinity) candidates.push({ type: 'bed', dist: bedDist });

    // Respawn anchor
    let anchorDist = Infinity;
    for (let dc = -2; dc <= 2; dc++) {
      for (let dr = -2; dr <= 2; dr++) {
        if (this.level.get(pRow + dr, pCol + dc) === BLOCK.RESPAWN_ANCHOR) {
          const d = dist(...bCtr(pCol + dc, pRow + dr));
          if (d < anchorDist) anchorDist = d;
        }
      }
    }
    if (anchorDist < Infinity) candidates.push({ type: 'respawn_anchor', dist: anchorDist });

    // Portal (nether / end / obsidian frame) — only when not on cooldown
    if (this.portalCooldown <= 0) {
      let portalDist = Infinity;
      for (let dc = -4; dc <= 4; dc++) {
        for (let dr = -4; dr <= 4; dr++) {
          const c = pCol + dc, r = pRow + dr;
          const b = this.level.get(r, c);
          if (b === BLOCK.NETHER_PORTAL || b === BLOCK.END_PORTAL ||
              b === BLOCK.END_PORTAL_FRAME || b === BLOCK.END_PORTAL_FRAME_FULL ||
              this._portalObsidianCells.has(`${c},${r}`)) {
            const d = dist(...bCtr(c, r));
            if (d < portalDist) portalDist = d;
          }
        }
      }
      if (portalDist < Infinity) candidates.push({ type: 'portal', dist: portalDist });
    }

    // Wither altar — only when matching item selected
    if (!this._witherBoss) {
      const slot = player.hotbar[player.selectedSlot];
      if (slot && (slot.type === BLOCK.WITHER_SKELETON_HEAD || slot.type === BLOCK.SOUL_SAND)) {
        const altar = this._findNearbyWitherAltar(pCol, pRow, 4);
        if (altar) {
          const d = dist((altar.anchorCol + 1) * BLOCK_SIZE, (altar.anchorRow + 1.5) * BLOCK_SIZE);
          candidates.push({ type: 'wither_altar', dist: d });
        }
      }
    }

    // Music player
    for (const mp of this._musicPlayerBlocks.values()) {
      const [cx, cy] = bCtr(mp.col, mp.row);
      const d = dist(cx, cy);
      if (d <= 3 * BLOCK_SIZE) candidates.push({ type: 'music_player', dist: d });
    }

    // Apple (hotbar fallback — always lowest priority)
    const sel = player.hotbar[player.selectedSlot];
    if (sel && sel.type === BLOCK.APPLE && sel.count > 0 && player.hp < player.maxHp) {
      candidates.push({ type: 'apple', dist: Infinity });
    }

    if (!candidates.length) return null;
    candidates.sort((a, b) => a.dist - b.dist);
    return candidates[0];
  }

  _computeContextAction() {
    this._contextAction  = null;
    this._contextPrompt  = null;
    this._contextAction2 = null;
    this._contextPrompt2 = null;

    const _makeLabels = (key, chestOpen) => ({
      respawn_anchor: `${key} Set Nether Spawn`,
      bed:            this.gameMode === 'sandbox' ? `${key} Save World` : `${key} Set Spawn`,
      chest:          chestOpen ? `${key} Close Chest` : `${key} Open Chest`,
      portal:         `${key} Use Portal`,
      wither_altar:   `${key} Place Item`,
      music_player:   `${key} Music Player`,
      lever:          `${key} Toggle Lever`,
      apple:          `${key} Eat Apple`,
    });

    const p1 = this._nearestInteractable(this.player);
    this._contextAction = p1?.type ?? null;
    if (p1) {
      const key = (this.input.p1GpSlot >= 0 && this.input.gamepads[this.input.p1GpSlot]?.connected) ? '[Y]' : '[U]';
      this._contextPrompt = _makeLabels(key, !!this._chestOpen)[p1.type] ?? null;
    }

    if (this.player2 && this._p2RespawnTimer === 0) {
      const p2 = this._nearestInteractable(this.player2);
      this._contextAction2 = p2?.type ?? null;
      if (p2) {
        const key2 = (this.input.p2GpSlot >= 0 && this.input.gamepads[this.input.p2GpSlot]?.connected) ? '[Y]' : '[U]';
        this._contextPrompt2 = _makeLabels(key2, !!this._chestOpen)[p2.type] ?? null;
      }
    }
  }

  _executeContextAction(player = this.player) {
    const isP2   = player === this.player2;
    const action = isP2 ? this._contextAction2 : this._contextAction;
    const pCol   = Math.floor(player.cx / BLOCK_SIZE);
    const pRow   = Math.floor(player.cy / BLOCK_SIZE);

    if (action === 'apple') {
      if (player.hp < player.maxHp) {
        const healed = player.heal(BLOCK_DATA[BLOCK.APPLE].healAmount);
        player.takeFromSlot(player.selectedSlot);
        this._playSound('sounds/eat-apple.mp3', 0.8);
        this._notify(`${isP2 ? 'P2 ate' : 'Ate'} an apple! +${healed} HP`, '#44FF44', 120);
      } else {
        this._notify('Already at full health!', '#AAFFAA', 80);
      }

    } else if (action === 'respawn_anchor') {
      if (this.gameMode !== 'sandbox') {
        let anchor = null;
        outer_ra: for (let dc = -2; dc <= 2; dc++) {
          for (let dr = -2; dr <= 2; dr++) {
            if (this.level.get(pRow + dr, pCol + dc) === BLOCK.RESPAWN_ANCHOR) {
              anchor = { col: pCol + dc, row: pRow + dr };
              break outer_ra;
            }
          }
        }
        if (anchor) {
          if (isP2) {
            this._p2SpawnX = (anchor.col + 0.5) * BLOCK_SIZE - player.width / 2;
            this._p2SpawnY = anchor.row * BLOCK_SIZE;
          } else {
            this._activeRespawnAnchor = anchor;
            this._activeSpawnBed = -1;
            if (this._sandboxLoadKey) this._saveNormalProgress();
          }
          this._playSound('sounds/use-bed.mp3', 0.8);
          this._notify(`${isP2 ? 'P2 ' : ''}Nether respawn point set!`, '#AA88FF', 220);
        }
      }

    } else if (action === 'chest') {
      if (this._chestOpen) {
        this._closeChest();
      } else {
        let bestCh = null, bestDist = Infinity;
        for (const ch of this._chests.values()) {
          const d = Math.hypot((ch.col + 0.5) * BLOCK_SIZE - player.cx,
                               (ch.row + 0.5) * BLOCK_SIZE - player.cy);
          if (d <= 2.5 * BLOCK_SIZE && d < bestDist) { bestDist = d; bestCh = ch; }
        }
        if (bestCh) {
          this._chestOpen     = bestCh;
          this._chestModalSel = 0;
          this.inventoryOpen  = true;
          this.craftingMenu._eWasDown = true;
          this._playSound('sounds/chest-open.mp3');
        }
      }

    } else if (action === 'lever') {
      const _isJoiner = !!(this._onlineGameId && window.multiplayerManager?.isConnected && !window.multiplayerManager?.isCreator);
      if (_isJoiner) {
        // Relay to host — host runs the redstone logic, state syncs back within 0.5 s
        const lv = this.redstone.findNearestLever(player);
        if (lv) window.multiplayerManager.sendRedstoneAction(lv.col, lv.row, 'toggleLever');
        this._playSound('sounds/lever.mp3', 0.7);
      } else {
        const toggled = this.redstone.tryToggleLeverNear(this.level, player);
        if (toggled) {
          this._rsStartFromSource(toggled.col, toggled.row, toggled.on);
          this._playSound('sounds/lever.mp3', 0.7);
        }
      }

    } else if (action === 'bed') {
      if (this.gameMode === 'sandbox') {
        if (!isP2) this._openSaveDialog();
      } else {
        const inNether = pCol >= BIOME_CAVE_END && pCol < BIOME_END_START;
        if (inNether) {
          if (this._netherBedFuse <= 0) {
            let bedPos = null;
            outer2: for (let dc = -3; dc <= 3; dc++) {
              for (let dr = -1; dr <= 3; dr++) {
                if (this.level.get(pRow + dr, pCol + dc) === BLOCK.BED) {
                  bedPos = { col: pCol + dc, row: pRow + dr };
                  break outer2;
                }
              }
            }
            if (bedPos) {
              this._netherBedFuse = 180;
              this._netherBedPos  = bedPos;
              this._notify('Beds explode in the Nether!', '#FF4444', 200);
            }
          }
        } else {
          let found = false;
          outer: for (let dc = -3; dc <= 3 && !found; dc++) {
            for (let dr = -1; dr <= 3 && !found; dr++) {
              if (this.level.get(pRow + dr, pCol + dc) === BLOCK.BED) {
                const r = pRow + dr, c = pCol + dc;
                let lc = c;
                while (lc > 0 && this.level.get(r, lc - 1) === BLOCK.BED) lc--;
                const bedAnchor = { col: lc, row: r };
                if (isP2) {
                  this._p2SpawnX = (lc + 0.5) * BLOCK_SIZE - player.width / 2;
                  this._p2SpawnY = r * BLOCK_SIZE;
                  this._notify('P2 respawn point set!', '#FFDD44', 220);
                } else {
                  let idx = this.bedSpawns.findIndex(b => b.col === bedAnchor.col && b.row === bedAnchor.row);
                  if (idx < 0) idx = this.bedSpawns.push(bedAnchor) - 1;
                  this._activeSpawnBed = idx;
                  if (this._sandboxLoadKey) this._saveNormalProgress();
                  this._notify('Respawn point set!', '#FFDD44', 220);
                }
                this._playSound('sounds/use-bed.mp3');
                found = true;
              }
            }
          }
        }
      }

    } else if (action === 'portal') {
      if (this.gameMode !== 'sandbox') this._tryRepairPortalFromHotbar();
      this._tryActivateRuinedPortal();
      if (this.gameMode !== 'sandbox') this._tryPlaceEyeFromHotbar();
      this._checkPortal();
      this._checkExitPortal();

    } else if (action === 'wither_altar') {
      if (!this._witherBoss) {
        const slot = player.hotbar[player.selectedSlot];
        if (!slot) return;
        const altar = this._findNearbyWitherAltar(pCol, pRow, 4);
        if (!altar) return;
        if (slot.type === BLOCK.WITHER_SKELETON_HEAD) {
          const idx = altar.skulls.indexOf(false);
          if (idx === -1) { this._notify('All skull slots filled', '#886622', 80); return; }
          altar.skulls[idx] = true;
          player.takeFromSlot(player.selectedSlot);
          this._playSound('sounds/place-block.mp3');
          this._notify(`Wither Skull placed (${altar.skulls.filter(Boolean).length}/3)`, '#AA8833', 120);
          this._checkAltarCompletion(altar);
        } else if (slot.type === BLOCK.SOUL_SAND) {
          const idx = altar.sand.indexOf(false);
          if (idx === -1) { this._notify('All soul sand slots filled', '#886622', 80); return; }
          altar.sand[idx] = true;
          player.takeFromSlot(player.selectedSlot);
          this._playSound('sounds/place-block.mp3');
          this._notify(`Soul Sand placed (${altar.sand.filter(Boolean).length}/4)`, '#AA8833', 120);
          this._checkAltarCompletion(altar);
        }
      }

    } else if (action === 'music_player') {
      let bestMp = null, bestDist = Infinity;
      for (const mp of this._musicPlayerBlocks.values()) {
        const d = Math.hypot((mp.col + 0.5) * BLOCK_SIZE - player.cx,
                             (mp.row + 0.5) * BLOCK_SIZE - player.cy);
        if (d <= 3 * BLOCK_SIZE && d < bestDist) { bestDist = d; bestMp = mp; }
      }
      if (bestMp) this._openMusicPlayerUI(bestMp);

    }
    // When Y button has no nearby interactable, do nothing (hotbar cycling is RB only)
  }

  // ── Controller status HUD (Phase 11K-1) ──────────────────

  _drawControllerStatus(ctx) {
    // Only render if at least one controller is connected
    const raw = navigator.getGamepads ? navigator.getGamepads() : [];
    let anyConnected = false;
    for (let i = 0; i < 4; i++) {
      if (raw[i] && raw[i].connected) { anyConnected = true; break; }
    }
    if (!anyConnected) return;

    ctx.save();
    const dotR = 5, gap = 14, startX = 10, startY = CANVAS_H - 18;

    // Background pill
    const pillW = 4 * gap + 4, pillH = 14;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    _roundRect(ctx, startX - 3, startY - pillH / 2 - 1, pillW, pillH + 2, 4);
    ctx.fill();

    for (let i = 0; i < 4; i++) {
      const gp  = raw[i];
      const cx2 = startX + i * gap + dotR;
      const cy2 = startY;
      const on  = gp && gp.connected;

      ctx.fillStyle = on ? '#33DD55' : '#334455';
      ctx.beginPath();
      ctx.arc(cx2, cy2, dotR, 0, Math.PI * 2);
      ctx.fill();

      if (on) {
        ctx.strokeStyle = '#88FFAA';
        ctx.lineWidth   = 1;
        ctx.stroke();
        // Controller index
        ctx.fillStyle    = '#001100';
        ctx.font         = 'bold 6px Courier New';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(i + 1, cx2, cy2);
      }
    }
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  // Show context prompt label above the player when a Use Item action is available
  _drawContextPrompt(ctx) {
    if (this.inventoryOpen || this.craftingMenu?.open) return;
    ctx.save();
    ctx.font = '9px Courier New';

    const _drawPrompt = (text, cx, playerTopY, color) => {
      const tw = ctx.measureText(text).width;
      const sc = this.camera.toScreen(cx, playerTopY);
      const bx = Math.max(4, Math.min(CANVAS_W - tw - 12, sc.x - tw / 2 - 4));
      const by = Math.max(4, sc.y - 28);
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      _roundRect(ctx, bx, by, tw + 8, 15, 3); ctx.fill();
      ctx.fillStyle = color;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(text, bx + 4, by + 7.5);
    };

    if (this._contextPrompt) {
      _drawPrompt(this._contextPrompt, this.player.cx, this.player.y, '#FFD700');
    }
    if (this._contextPrompt2 && this.player2) {
      _drawPrompt(this._contextPrompt2, this.player2.cx, this.player2.y, '#88AAFF');
    }

    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  _drawBiomeLabel(ctx, biome) {
    const labels = { plains: 'Plains', cave: 'Deep Cave', nether: 'The Nether', end: 'The End' };
    const colors = { plains: '#88CC44', cave: '#8888CC', nether: '#FF4400', end: '#AA44FF' };
    const text   = labels[biome] || biome;
    ctx.save();
    ctx.fillStyle    = 'rgba(0,0,0,0.4)';
    ctx.fillRect(CANVAS_W - 152, 10, 118, 20);
    ctx.fillStyle    = colors[biome] || '#fff';
    ctx.font         = 'bold 10px Courier New';
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, CANVAS_W - 34, 20);
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  _drawBowCharge(ctx) {
    const drawBar = (charge, barX, barY, labelX) => {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      _roundRect(ctx, barX - 2, barY - 2, 100 + 4, 12, 3); ctx.fill();
      const col = charge < 0.5 ? '#FF8800' : charge < 0.9 ? '#FFDD00' : '#88FF44';
      ctx.fillStyle = col;
      _roundRect(ctx, barX, barY, 100 * charge, 8, 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '8px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(charge * 100)}%`, labelX, barY - 4);
      ctx.textAlign = 'left';
    };

    ctx.save();
    const p = this.player;
    if (p.weaponMode === 'bow' && p.bowDrawing) {
      const barX = this.player2 ? 10 : (CANVAS_W - 100) / 2;
      drawBar(p.drawProgress, barX, HOTBAR_Y - 24, barX + 50);
    }
    if (this.player2?.bowDrawing) {
      const barX = CANVAS_W - 110;
      drawBar(this.player2.drawProgress, barX, HOTBAR_Y - 24, barX + 50);
    }
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

  // Creator/dev status line (top-left): Speed level, God Mode, Phase-Through.
  _drawGodModeHud(ctx) {
    const p = this.player;
    const speedTxt = `🚀 ${['1×', '3×', '6×'][p.hyperLevel] || '1×'}`;
    const segs = [
      { t: speedTxt,                          c: '#4CAF50' },
      { t: `🛡️ ${p.godMode ? 'ON' : 'OFF'}`,  c: p.godMode ? '#FF6B6B' : '#999999' },
      { t: `👻 ${p.canPhaseThrough ? 'ON' : 'OFF'}`, c: p.canPhaseThrough ? '#B084FF' : '#999999' },
    ];
    ctx.save();
    ctx.font         = 'bold 11px Courier New';
    ctx.textBaseline = 'middle';
    ctx.textAlign    = 'left';
    const gap = 14, padX = 10, bx = 8, by = 8, bh = 22;
    let bw = padX * 2;
    for (let i = 0; i < segs.length; i++) bw += ctx.measureText(segs[i].t).width + (i ? gap : 0);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    _roundRect(ctx, bx, by, bw, bh, 4); ctx.fill();
    let x = bx + padX;
    for (const s of segs) {
      ctx.fillStyle = s.c;
      ctx.fillText(s.t, x, by + bh / 2 + 1);
      x += ctx.measureText(s.t).width + gap;
    }
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  _teleportDests() {
    // Custom points (sandbox-managed) take priority over hardcoded biome destinations
    const custom = this._worldAdvSettings.customTeleportPoints;
    if (Array.isArray(custom)) return custom;

    // Adventure world fallback — hardcoded biome waypoints
    const dests = this._worldAdvSettings.isEmptySandbox ? [] : [
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
    const isSandbox = this.gameMode === 'sandbox';
    const custom    = Array.isArray(this._worldAdvSettings.customTeleportPoints);
    const canEdit   = isSandbox && custom;
    const dests     = this._teleportDests();
    const canAdd    = canEdit && dests.length < 10;

    const pw   = 400, btnH = 34, gap = 5, padV = 12;
    const delW = canEdit ? 36 : 0;
    const addH = canAdd ? btnH + gap : 0;
    const ph   = padV + 28 + dests.length * (btnH + gap) + addH + padV;
    const px   = (CANVAS_W - pw) / 2, py = (CANVAS_H - ph) / 2;

    // Click outside closes menu
    if (mx < px || mx > px + pw || my < py || my > py + ph) {
      this._teleportMenu = false; return;
    }

    const rowsY = py + padV + 28;

    // Destination rows
    for (let i = 0; i < dests.length; i++) {
      const by = rowsY + i * (btnH + gap);
      const bx = px + 10;
      const bw = pw - 20 - (delW > 0 ? delW + gap : 0);

      // Delete button
      if (canEdit) {
        const dx = bx + bw + gap;
        if (mx >= dx && mx <= dx + delW && my >= by && my <= by + btnH) {
          if (window.confirm(`Delete "${dests[i].label}"?`)) {
            this._worldAdvSettings.customTeleportPoints.splice(i, 1);
          }
          return;
        }
      }

      // Teleport button
      if (mx >= bx && mx <= bx + bw && my >= by && my <= by + btnH) {
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

    // "Set Teleportation Destination" button
    if (canAdd) {
      const ay = rowsY + dests.length * (btnH + gap) + gap;
      if (mx >= px + 10 && mx <= px + pw - 10 && my >= ay && my <= ay + btnH) {
        const col = Math.floor(this.player.cx / BLOCK_SIZE);
        const row = Math.floor(this.player.cy / BLOCK_SIZE);
        const defaultName = `x:${col} y:${row}`;
        const name = window.prompt('Name this teleport destination:', defaultName);
        if (name !== null) {
          const label = name.trim() || defaultName;
          this._worldAdvSettings.customTeleportPoints.push({
            label,
            x: this.player.x,
            y: this.player.y,
          });
          this._notify(`Saved: ${label}`, '#66FF99', 180);
        }
        return;
      }
    }
  }

  _drawTeleportMenu(ctx) {
    const mx = this.input.mouse.x, my = this.input.mouse.y;
    const isSandbox  = this.gameMode === 'sandbox';
    const custom     = Array.isArray(this._worldAdvSettings.customTeleportPoints);
    const canEdit    = isSandbox && custom;
    const dests      = this._teleportDests();
    const canAdd     = canEdit && dests.length < 10;

    const pw   = 400, btnH = 34, gap = 5, padV = 12;
    const delW = canEdit ? 36 : 0;                       // width of 🗑 column
    const addH = canAdd ? btnH + gap : 0;
    const ph   = padV + 28 + dests.length * (btnH + gap) + addH + padV;
    const px   = (CANVAS_W - pw) / 2, py = (CANVAS_H - ph) / 2;

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

    const rowsY = py + padV + 28;
    for (let i = 0; i < dests.length; i++) {
      const by  = rowsY + i * (btnH + gap);
      const bx  = px + 10;
      const bw  = pw - 20 - (delW > 0 ? delW + gap : 0);
      const hov = mx >= bx && mx <= bx + bw && my >= by && my <= by + btnH;
      ctx.fillStyle   = hov ? 'rgba(255,215,0,0.15)' : 'rgba(0,0,0,0.4)';
      _roundRect(ctx, bx, by, bw, btnH, 5); ctx.fill();
      ctx.strokeStyle = hov ? '#FFD700' : '#444'; ctx.lineWidth = hov ? 1.5 : 1;
      _roundRect(ctx, bx, by, bw, btnH, 5); ctx.stroke();
      ctx.fillStyle   = hov ? '#fff' : '#ccc'; ctx.font = '11px Courier New';
      ctx.textAlign   = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(dests[i].label, bx + bw / 2, by + btnH / 2);

      // Delete button (sandbox only)
      if (canEdit) {
        const dx  = bx + bw + gap, dw = delW;
        const dhov = mx >= dx && mx <= dx + dw && my >= by && my <= by + btnH;
        ctx.fillStyle   = dhov ? 'rgba(255,60,60,0.35)' : 'rgba(80,20,20,0.6)';
        _roundRect(ctx, dx, by, dw, btnH, 5); ctx.fill();
        ctx.strokeStyle = dhov ? '#FF6666' : '#663333'; ctx.lineWidth = 1;
        _roundRect(ctx, dx, by, dw, btnH, 5); ctx.stroke();
        ctx.fillStyle = dhov ? '#fff' : '#FF9999'; ctx.font = '13px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🗑', dx + dw / 2, by + btnH / 2);
      }
    }

    // "Set Teleportation Destination" button
    if (canAdd) {
      const ay  = rowsY + dests.length * (btnH + gap) + gap;
      const ahov = mx >= px + 10 && mx <= px + pw - 10 && my >= ay && my <= ay + btnH;
      ctx.fillStyle   = ahov ? 'rgba(80,200,120,0.2)' : 'rgba(20,60,30,0.6)';
      _roundRect(ctx, px + 10, ay, pw - 20, btnH, 5); ctx.fill();
      ctx.strokeStyle = ahov ? '#66FF99' : '#336644'; ctx.lineWidth = 1;
      _roundRect(ctx, px + 10, ay, pw - 20, btnH, 5); ctx.stroke();
      ctx.fillStyle = ahov ? '#fff' : '#88FFAA'; ctx.font = 'bold 11px Courier New';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('+ Set Teleportation Destination', CANVAS_W / 2, ay + btnH / 2);
    } else if (canEdit && dests.length >= 10) {
      const ay = rowsY + dests.length * (btnH + gap) + gap;
      ctx.fillStyle = 'rgba(120,100,60,0.5)'; ctx.font = '9px Courier New';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Maximum 10 destinations reached — delete one to add more', CANVAS_W / 2, ay + 10);
    }

    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  _drawCoords(ctx) {
    const col      = Math.floor(this.player.cx / BLOCK_SIZE);
    const row      = Math.floor(this.player.cy / BLOCK_SIZE);
    const coordStr = `x:${col} y:${row}`;

    // Platformer / Speed Runner: append live timer on a second line
    let timerStr = null;
    if (this.gameMode === 'speedrunner' && this._sr?.startMs && !this._sr?.won) {
      const elapsed  = Date.now() - this._sr.startMs;
      const totalSec = Math.floor(elapsed / 1000);
      const mins     = Math.floor(totalSec / 60);
      const ss       = String(totalSec % 60).padStart(2, '0');
      const cs       = String(Math.floor((elapsed % 1000) / 10)).padStart(2, '0');
      timerStr = `⚡ ${mins}:${ss}.${cs}`;
    } else if (this.gameMode === 'platformer' && this._platformerStartMs) {
      const elapsed  = Date.now() - this._platformerStartMs;
      const totalSec = Math.floor(elapsed / 1000);
      const mins     = Math.floor(totalSec / 60);
      const ss       = String(totalSec % 60).padStart(2, '0');
      const cs       = String(Math.floor((elapsed % 1000) / 10)).padStart(2, '0');
      timerStr = `⏱ ${mins}:${ss}.${cs}`;
    }

    const boxH = timerStr ? 36 : 20;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(CANVAS_W - 128, CANVAS_H - boxH - 6, 118, boxH);
    ctx.font      = '9px Courier New';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#888';
    ctx.fillText(coordStr, CANVAS_W - 10, CANVAS_H - (timerStr ? 22 : 10));
    if (timerStr) {
      ctx.fillStyle = '#FFD700';
      ctx.fillText(timerStr, CANVAS_W - 10, CANVAS_H - 8);
    }
    ctx.textAlign = 'left';
  }

  // ── Overlays ─────────────────────────────────────────────

  // ── Tutorial overlay (Phase 11H) ─────────────────────────────

  _getTutorialContent() {
    const R = (key, desc) => ({ type: 'row',    key,  desc });
    const B = (text)      => ({ type: 'bullet', text });
    const G = ()          => ({ type: 'gap' });
    const S = (title, items) => ({ title, items });

    if (this.gameMode === 'normal') return [
      S('CONTROLS', [
        R('[WASD / Arrows]',  'Move left / right; W or Space = jump'),
        R('[C]',              'Crouch / use shield'),
        R('[LMB]',            'Attack or mine block'),
        R('[RMB]',            'Place block / use item'),
        R('[U]',              'Interact (portals, obsidian, eyes)'),
        R('[I]',              'Open inventory & crafting'),
        R('[E]',              'Open nearby chest'),
        R('[B]',              'Toggle bed (set respawn point)'),
        R('[F] near bed',     'Save game & set respawn'),
        R('[H] or [?]',       'Toggle this help screen'),
        R('[Esc]',            'Pause game'),
      ]),
      S('HOTBAR', [
        R('[0–4] or Scroll',  'Select hotbar slot'),
        R('Slot 0',           'Pickaxe — mine blocks'),
        R('Slot 1',           'Sword — melee combat'),
        R('Slot 2',           'Bow — ranged attacks'),
        R('Slot 3',           'Apple — eat to heal (4 HP each)'),
        R('Slot 4+',          'Tools, blocks, misc items'),
      ]),
      S('BASIC GAMEPLAY', [
        B('Mine blocks with Pickaxe [LMB] to collect resources'),
        B('Fight mobs with Sword [LMB] or Bow; charge bow to increase range'),
        B('Eat apples [RMB with apple held] to restore 4 HP each'),
        B('Crouch [C] to shield — blocks incoming arrow damage'),
        B('Craft tools and armor in the Inventory [I]'),
        B('Collect armor pieces from drops to reduce damage taken'),
      ]),
      S('PROGRESSION', [
        R('Overworld',        'Mine wood, stone, ore; craft tools'),
        R('Cave',             'Deeper resources; tougher mobs'),
        R('Nether',           'Portal at col 285; high-tier loot'),
        R('The End',          'Portal in Nether; defeat Ender Dragon to win'),
      ]),
      S('CRAFTING BASICS', [
        B('Wood → Planks → Sticks → Wooden Tools'),
        B('Stone + Sticks → Stone Tools (stronger)'),
        B('Iron Ore + Fuel → Iron Ingots → Iron Tools & Armor'),
        B('Open Inventory [I] and drag materials to craft slots'),
        B('Higher-tier tools mine faster and deal more damage'),
      ]),
      S('COMBAT TIPS', [
        B('Use sword for close range; switch to bow for flying/distant mobs'),
        B('Crouch [C] while mobs shoot to block arrow damage with shield'),
        B('Eat apples between fights — keep health above half'),
        B('Full Moon nights: mobs have +50% health, be extra careful'),
        B('Mobs drop items on defeat — collect for crafting materials'),
        B('Lava damages instantly; find water sources to stay safe nearby'),
      ]),
      S('PORTAL GUIDE', [
        R('Nether Portal',    'Find at col 285; press [U] to enter'),
        R('Repair Portal',    'Hold Flint & Steel then press [U] to ignite'),
        R('End Portal',       'Located in the Nether; requires Eyes of Ender'),
        R('Eye Placement',    'Hold Eye of Ender; press [U] near empty frame slot'),
        R('5 Eyes needed',    'Fill all 5 frame slots to activate End Portal'),
      ]),
      S('GENERAL INFO', [
        R('Day / Night',      '5 min each; more mobs spawn at night'),
        R('Health',           '20 HP max; damage from mobs, lava, falls'),
        R('Death',            'Respawn at last bed or spawn point'),
        R('Save',             'Press [F] near a bed to save progress'),
        R('Full Moon',        'Every 8 nights — mobs get +50% health boost'),
      ]),
    ];

    if (this.gameMode === 'platformer') return [
      S('CONTROLS — PLAYER 1', [
        R('[WASD / Arrows]',  'Move; W = jump (double-jump available)'),
        R('[Space]',          'Attack / charge bow'),
        R('[S / Down]',       'Crouch / use shield'),
        R('[U]',              'Place block in portal frame / enter portal'),
        R('[I]',              'Open inventory'),
        R('[E]',              'Open nearby chest'),
        R('[H] or [?]',       'Toggle this help screen'),
        R('[Esc]',            'Pause game'),
      ]),
      S('BOW AIMING', [
        B('Hold Space to charge the bow — release to fire'),
        B('Single-player: arrow flies toward the mouse cursor'),
        B('2-player: aim is based on movement keys held at release:'),
        R('  W/I held',       '→ Diagonal up (or straight up if still)'),
        R('  S/K held + air', '→ Diagonal down'),
        R('  Default',        '→ Straight ahead in facing direction'),
      ]),
      S('KEY DIFFERENCES FROM NORMAL', [
        B('NO MINING — all blocks are solid and cannot be broken'),
        B('NO CRAFTING — items found in chests or dropped by mobs'),
        B('COMBAT FOCUSED — fight mobs to progress through levels'),
        B('PORTAL PUZZLES — repair portals to unlock the next area'),
        B('Double-jump available: press Jump again while airborne'),
        B('Equipment auto-upgrades: picking up better gear replaces old (dropped nearby)'),
        B('Shields and bows: can only carry one — pick up if you do not have one'),
      ]),
      S('2-PLAYER LOCAL CO-OP', [
        R('P2 (IJKL mode)',   'IJKL to move, U to attack / charge bow'),
        R('P2 (Arrows mode)', 'Arrows to move, Insert to attack'),
        R('P2 Bow aim',       'Hold attack → aim I/K (or Up/Dn) → release'),
        G(),
        B('Both players share the same screen — camera follows midpoint'),
        B('Equipment drops can be grabbed by either player — if rejected (same/better gear), it is re-dropped nearby for the other player'),
        B('P2 respawns after 3 seconds on death'),
      ]),
      S('HOTBAR', [
        R('Slot 0',           'Sword — melee combat'),
        R('Slot 1',           'Bow — ranged attacks'),
        R('Slot 2',           'Shield / item'),
        R('Slot 3',           'Apple / healing food'),
        R('Slot 4+',          'Keys, tools, portal materials'),
      ]),
      S('PORTAL MECHANICS', [
        R('Ruined Nether Portal', 'Needs 4 Obsidian blocks to repair'),
        R('Step 1',           'Pick up Obsidian from chests or mob drops'),
        R('Step 2',           'Hold Obsidian and stand near the portal'),
        R('Step 3',           'Press [U] to place one block in next empty slot'),
        R('Step 4',           'Repeat 4 times to complete the frame'),
        R('Step 5',           'Hold Flint & Steel, press [U] to ignite portal'),
        G(),
        R('End Portal',       'Needs 5 Eyes of Ender to activate'),
        R('Step 1',           'Collect Eyes of Ender (from Endermen or chests)'),
        R('Step 2',           'Hold Eye of Ender and stand near End Portal'),
        R('Step 3',           'Press [U] to place Eye in next empty frame slot'),
        R('Step 4',           'Repeat 5 times — portal activates automatically'),
      ]),
      S('PROGRESSION', [
        R('Overworld',        'Defeat mobs; loot chests for items'),
        R('Nether Portal',    'Repair with 4 Obsidian; ignite with Flint & Steel'),
        R('Nether',           'Collect Eyes of Ender and Nether materials'),
        R('End Portal',       'Place 5 Eyes to activate; enter portal'),
        R('The End',          'Defeat Ender Dragon to complete the game'),
      ]),
      S('COMBAT & TIPS', [
        B('Explore thoroughly — all items needed to complete each area are available'),
        B('Chests contain essential materials; open every chest you find'),
        B('Crouch [C] to block arrows with shield during tough fights'),
        B('Stock up on arrows and food before fighting ranged mobs'),
        B('Full Moon nights: mobs have +50% health — be extra cautious'),
        B('Mobs drop useful items when defeated — farm if you need more'),
      ]),
      S('GENERAL INFO', [
        R('Day / Night',      '5 min each; more mobs at night'),
        R('Health',           '20 HP max; eat food to heal'),
        R('Death',            'Respawn at last bed or spawn point'),
        R('Full Moon',        'Every 8 nights — +50% mob health'),
      ]),
    ];

    // Sandbox
    return [
      S('CONTROLS', [
        R('[WASD / Arrows]',  'Move; W = jump / fly up'),
        R('[Shift]',          'Fly down (when flying)'),
        R('[W×2]',            'Double-tap W to start flying'),
        R('[LMB]',            'Place selected block'),
        R('[RMB]',            'Remove block'),
        R('[I]',              'Open block palette'),
        R('[E]',              'Open / close nearby chest'),
        R('[L]',              'Toggle nearest lever'),
        R('[H] or [?]',       'Toggle this help screen'),
        R('[Ctrl+H]',         'Hyper Speed 3× toggle'),
        R('[P]',              'World Settings'),
        R('[F]',              'Save world'),
        R('[Esc]',            'Pause game'),
      ]),
      S('EDITING TOOLS', [
        R('[LMB] on air',     'Place selected block'),
        R('[LMB] on block',   'Remove block'),
        R('[Alt+Click]',      'Eyedropper — pick block type'),
        R('[Shift+Drag]',     'Auto-paint (place or erase continuously)'),
        R('[Shift+1/2/3]',    'Set brush size: 1×1 / 2×2 / 4×4'),
        R('[Ctrl+Drag]',      'Select a region'),
        R('[Ctrl+C]',         'Copy selected region'),
        R('[Ctrl+V]',         'Paste — click to place'),
        R('[Ctrl+Z]',         'Undo last action'),
        R('[Ctrl+Y]',         'Redo'),
      ]),
      S('HOTBAR & INVENTORY', [
        R('[1–8] or Scroll',  'Select hotbar slot'),
        R('[I]',              'Open palette — all blocks & items'),
        R('[Palette tabs]',   'Overworld / Nether / Gear / Other'),
        R('Right-click slot', 'Clear hotbar slot'),
        B('Drag items from palette to hotbar for quick access'),
        B('Unlimited supply of every block and item — no crafting needed'),
      ]),
      S('MOB SPAWNING', [
        R('Spawn Eggs',       'Found in Palette → Other tab'),
        R('[RMB] with egg',   'Place mob at cursor position'),
        R('World Settings',   'Configure mob drop rates [P]'),
        B('Spawned mobs behave normally: combat, drops, and AI'),
        B('Right-click placed mob egg in World Settings to edit drops'),
      ]),
      S('REDSTONE SYSTEM', [
        R('Levers',           'Toggle on/off; powers connected dust'),
        R('Pressure Plates',  'Triggered by player or mob stepping on'),
        R('Redstone Dust',    'Connects devices; carries power signal'),
        R('Pistons',          'Push blocks when powered; configure direction'),
        R('NOT Gate',         'Inverts signal (on→off, off→on)'),
        R('AND Gate',         'Output on only when both inputs on'),
        R('Transmitter/Rx',   'Wireless signal over any distance'),
        B('Right-click placed gate or TX/RX to configure connections'),
      ]),
      S('PORTALS & STRUCTURES', [
        R('Nether Portal',    'Place from Other palette; lights automatically'),
        R('Ruined Portal',    'Damaged portal structure for adventure builds'),
        R('End Portal',       'Multi-block structure; place Eyes to activate'),
        B('Multi-block structures (portals) placed as single footprint'),
        B('Enter portals with [U] to travel between biomes'),
      ]),
      S('WORLD SETTINGS [P]', [
        R('Mob Drops',        'Customize what each mob type drops'),
        R('Day/Night Speed',  'Set cycle length (1–20 min per half)'),
        R('Mob Spawning',     'Enable or disable mob spawning'),
        R('Full Moon Boost',  'Toggle +50% HP on full moon nights'),
        R('Unlimited Arrows', 'Toggle infinite arrow supply'),
        B('Open with [P] key; click outside or press Esc to close'),
      ]),
      S('BIOME GUIDE', [
        R('Overworld',        'Plains / Cave — col 0 to 299'),
        R('Nether',           'Col 300+ — magma, lava, Blazes'),
        R('The End',          'Col 450+ — Endermen, Ender Dragon'),
        B('Teleport menu [T] (with God Mode active) to jump between biomes'),
        B('Build custom levels in any biome; all blocks work everywhere'),
      ]),
      S('CREATIVE TIPS', [
        B('Use brush tools + auto-paint [Shift+Drag] for fast terrain shaping'),
        B('Undo [Ctrl+Z] if you make a mistake — up to 200 steps stored'),
        B('Design platformer levels in sandbox; export for friends to play'),
        B('Spawn eggs + World Settings lets you create custom mob arenas'),
        B('Redstone puzzles: link levers → dust → pistons for moving platforms'),
      ]),
    ];
  }

  _wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width <= maxWidth) { line = test; }
      else { if (line) lines.push(line); line = word; }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  _drawTutorial(ctx) {
    const PW = 540, PH = 450;
    const PX = (CANVAS_W - PW) / 2, PY = (CANVAS_H - PH) / 2;
    const mx = this.input.mouse.x, my = this.input.mouse.y;

    // Dark overlay
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.88)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Panel
    ctx.fillStyle = '#080D1C';
    _roundRect(ctx, PX, PY, PW, PH, 10); ctx.fill();

    const modeAccent = { normal: '#44AAFF', platformer: '#44EE88', sandbox: '#FFAA44' };
    const accent = modeAccent[this.gameMode] || '#88AAFF';
    ctx.strokeStyle = accent + 'AA'; ctx.lineWidth = 2;
    _roundRect(ctx, PX, PY, PW, PH, 10); ctx.stroke();

    // Title
    const modeNames = { normal: 'Normal Mode — Survival Adventure', platformer: 'Platformer Mode — Guided Adventure', sandbox: 'Sandbox Mode — Creative Freedom' };
    ctx.fillStyle = accent;
    ctx.font = 'bold 13px Courier New';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(modeNames[this.gameMode] || 'How to Play', CANVAS_W / 2, PY + 20);

    // Title divider
    ctx.strokeStyle = accent + '44'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PX + 16, PY + 34); ctx.lineTo(PX + PW - 16, PY + 34); ctx.stroke();

    // X close button
    const XBX = PX + PW - 28, XBY = PY + 7, XBS = 20;
    const xHov = mx >= XBX && mx <= XBX + XBS && my >= XBY && my <= XBY + XBS;
    ctx.fillStyle = xHov ? 'rgba(255,60,60,0.35)' : 'rgba(60,10,10,0.5)';
    _roundRect(ctx, XBX, XBY, XBS, XBS, 4); ctx.fill();
    ctx.strokeStyle = xHov ? '#FF5555' : '#553333'; ctx.lineWidth = 1;
    _roundRect(ctx, XBX, XBY, XBS, XBS, 4); ctx.stroke();
    ctx.fillStyle = xHov ? '#fff' : '#AA6666'; ctx.font = 'bold 12px Courier New';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('✕', XBX + XBS / 2, XBY + XBS / 2);

    // Content area geometry
    const CA_X = PX + 16;
    const CA_Y = PY + 40;
    const CA_W = PW - 32;
    const CA_H = PH - 56;
    const KW   = 148;
    const LROW = 14;
    const BROW = 12;
    const HGAP = 20;
    const SGAP = 10;

    const sections = this._getTutorialContent();

    // Compute total content height for scroll clamping
    let totalH = 0;
    for (const sec of sections) {
      totalH += HGAP;
      for (const item of sec.items) {
        if (item.type === 'row')    totalH += LROW;
        else if (item.type === 'gap') totalH += 6;
        else if (item.type === 'bullet') {
          ctx.font = '9px Courier New';
          const wrapped = this._wrapText(ctx, item.text, CA_W - 14);
          totalH += wrapped.length * BROW + 2;
        }
      }
      totalH += SGAP;
    }
    const maxScroll = Math.max(0, totalH - CA_H);
    this._tutorialScrollY = Math.min(this._tutorialScrollY, maxScroll);

    // Clip to content area
    ctx.save();
    ctx.beginPath();
    ctx.rect(CA_X - 2, CA_Y, CA_W + 4, CA_H);
    ctx.clip();
    ctx.translate(0, CA_Y - this._tutorialScrollY);

    let y = 0;
    const HCOLOR = accent, KCOLOR = '#BBCCEE', DCOLOR = '#7788AA', BCOLOR = '#99AABB';

    for (const sec of sections) {
      // Section header
      ctx.fillStyle = HCOLOR; ctx.font = 'bold 10px Courier New';
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(sec.title, CA_X, y + 12);
      ctx.strokeStyle = HCOLOR + '33'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(CA_X, y + 15); ctx.lineTo(CA_X + CA_W, y + 15); ctx.stroke();
      y += HGAP;

      for (const item of sec.items) {
        if (item.type === 'row') {
          ctx.fillStyle = KCOLOR; ctx.font = 'bold 9px Courier New';
          ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
          ctx.fillText(item.key, CA_X, y + 10);
          ctx.fillStyle = DCOLOR; ctx.font = '9px Courier New';
          ctx.fillText(item.desc, CA_X + KW, y + 10);
          y += LROW;
        } else if (item.type === 'gap') {
          y += 6;
        } else if (item.type === 'bullet') {
          ctx.fillStyle = BCOLOR; ctx.font = '9px Courier New';
          ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
          const lines = this._wrapText(ctx, item.text, CA_W - 14);
          for (let li = 0; li < lines.length; li++) {
            ctx.fillText((li === 0 ? '• ' : '  ') + lines[li], CA_X + 4, y + 10);
            y += BROW;
          }
          y += 2;
        }
      }
      y += SGAP;
    }

    ctx.restore(); // end clip+translate

    // Scrollbar
    if (maxScroll > 0) {
      const SBX = PX + PW - 7;
      const sbH = Math.max(24, (CA_H / (totalH)) * CA_H);
      const sbY = CA_Y + (this._tutorialScrollY / maxScroll) * (CA_H - sbH);
      ctx.fillStyle = 'rgba(60,80,120,0.3)';
      ctx.fillRect(SBX, CA_Y, 4, CA_H);
      ctx.fillStyle = accent + '88';
      ctx.fillRect(SBX, sbY, 4, sbH);
    }

    // Bottom hint
    ctx.fillStyle = '#334455';
    ctx.font = '8px Courier New';
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('ESC · H · ✕ to close   •   Scroll or ↑↓ to read', CANVAS_W / 2, PY + PH - 5);

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

  // Arena win-condition status, shown beside the pause panel (left side) so it
  // stays off the in-play HUD. Reads the rules engine's objectiveStatus().
  _drawArenaObjectivesPanel(ctx) {
    if (!this.isArena || typeof ARENA_RULES === 'undefined' || typeof ARENA_MODES === 'undefined') return;
    const rs = ARENA_MODES._rulesetFor ? ARENA_MODES._rulesetFor(this) : null;
    if (!rs) return;
    const players = this.activePlayers();
    const lines = [];
    const clip = (s) => s.length > 30 ? s.slice(0, 29) + '…' : s;
    const sample = ARENA_RULES.objectiveStatus(rs, this, (players[0] && players[0]._ownerId) || 'p1');
    if (sample.mode === 'timer') {
      lines.push({ t: 'Play until time runs out —', c: '#aab' }, { t: 'highest score wins.', c: '#aab' });
    } else {
      // Win conditions are per-player — show each player's progress. With 3-4
      // players, show just the headline per player to fit; 1-2 show conditions.
      const detail = players.length <= 2;
      for (const p of players) {
        const id = p._ownerId || 'p1';
        const st = ARENA_RULES.objectiveStatus(rs, this, id);
        if (st.mode === 'stages') {
          lines.push({ t: `${id.toUpperCase()}  Step ${Math.min(st.current + 1, st.total)}/${st.total}${st.won ? '  ✓ WON' : ''}`, c: st.won ? '#5aff7a' : '#FFD700' });
          const cur = st.stages[Math.min(st.current, st.total - 1)];
          if (detail && cur) for (const c of cur.conditions) {
            const lg = (c.logic && c.logic !== 'and') ? c.logic.toUpperCase() + ' ' : '';
            lines.push({ t: clip(`  ${c.met ? '✓' : '○'} ${lg}${c.label} ${c.current}/${c.target}`), c: c.met ? '#5aff7a' : '#ccd' });
          }
        } else {
          const met = st.conditions.filter(c => c.met).length;
          lines.push({ t: `${id.toUpperCase()}  ${met}/${st.conditions.length} ${st.combinator === 'all' ? '(all)' : '(any)'}${st.won ? '  ✓ WON' : ''}`, c: st.won ? '#5aff7a' : '#FFD700' });
          if (detail) for (const c of st.conditions) {
            const lg = (c.logic && c.logic !== 'and') ? c.logic.toUpperCase() + ' ' : '';
            lines.push({ t: clip(`  ${c.met ? '✓' : '○'} ${lg}${c.label} ${c.current}/${c.target}`), c: c.met ? '#5aff7a' : '#ccd' });
          }
        }
      }
    }
    const pad = 12, lineH = 16, w = 200, x = 12;
    const h = pad * 2 + 22 + lines.length * lineH;
    const y = Math.max(12, (CANVAS_H - h) / 2);
    ctx.save();
    ctx.fillStyle = 'rgba(10,10,25,0.92)'; _roundRect(ctx, x, y, w, h, 8); ctx.fill();
    ctx.strokeStyle = '#444466'; ctx.lineWidth = 2; _roundRect(ctx, x, y, w, h, 8); ctx.stroke();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#FFD700'; ctx.font = 'bold 12px Courier New';
    ctx.fillText('🎯 OBJECTIVES', x + pad, y + pad + 10);
    ctx.font = '11px Courier New';
    let ly = y + pad + 30;
    for (const L of lines) { ctx.fillStyle = L.c; ctx.fillText(L.t, x + pad, ly); ly += lineH; }
    ctx.restore();
  }

  // ── Sandbox save dialog ───────────────────────────────────────

  // ── Secret combo (Konami) ───────────────────────────────────────
  // ↑ ↑ ↓ ↓ ← → ← → A B on the keyboard (arrows + A/B keys) OR the controller
  // (d-pad + A/B buttons). Detected as one token per frame; the exact sequence
  // fires _onSecretMenuCombo(). Kept flexible so the trigger can be rebound to
  // something else later — for now it toggles the classic canvas pause menu.
  _checkKonami() {
    const inp = this.input; if (!inp) return;
    let tok = null;
    if      (inp.isJustDown('ArrowUp')    || inp.p1JustDown('dpad0'))  tok = 'U';
    else if (inp.isJustDown('ArrowDown')  || inp.p1JustDown('dpad2'))  tok = 'D';
    else if (inp.isJustDown('ArrowLeft')  || inp.p1JustDown('dpad3'))  tok = 'L';
    else if (inp.isJustDown('ArrowRight') || inp.p1JustDown('dpad1'))  tok = 'R';
    else if (inp.isJustDown('KeyA')       || inp.p1JustDown('jump'))   tok = 'A';
    else if (inp.isJustDown('KeyB')       || inp.p1JustDown('crouch')) tok = 'B';
    if (!tok) return;
    const SEQ = ['U', 'U', 'D', 'D', 'L', 'R', 'L', 'R', 'B', 'A'];
    const buf = this._konamiBuf;
    buf.push(tok);
    if (buf.length > SEQ.length) buf.shift();
    if (buf.length === SEQ.length && SEQ.every((t, i) => buf[i] === t)) {
      this._konamiBuf = [];
      this._onSecretMenuCombo();
    }
  }

  // What the secret combo does (rebindable). For now: toggle the classic menu.
  _onSecretMenuCombo() {
    this._useClassicPause = !this._useClassicPause;
    if (this._useClassicPause && typeof PAUSE_MENU !== 'undefined') PAUSE_MENU.close();
    this._notify(this._useClassicPause ? '🕹️ Classic menu unlocked!' : 'Classic menu off',
      this._useClassicPause ? '#FFD700' : '#888888', 200);
  }

  // ── Classic (canvas) pause menu ─────────────────────────────────
  // Restored from build 24. Only used when this._useClassicPause is set (via
  // the Konami combo → _onSecretMenuCombo). The default menu is the HTML
  // overlay (js/pause-menu.js); these draw/handle the retro canvas version.
  _pauseLayout() {
    const isSb       = this.gameMode === 'sandbox';
    const hasLvlSel  = (this.gameMode === 'normal'      && !!this._sandboxLoadKey) ||
                       (this.gameMode === 'platformer'  && !!this._platformerLoadKey);
    // Only Level Select needs the taller 3-button panel now. Sandbox's old
    // "Save World" pause button was removed — saving lives on the top-right
    // editor Save button (plus F / B quick-save), so it was redundant.
    const threeBtn   = hasLvlSel;

    // Controller-assignment rows — always show P1 row; add P2 row in 2P mode
    const numCtrlPlayers = (!isSb && !this._onlineGameId)
      ? (this._worldAdvSettings.twoPlayerMode ? 2 : 1) : 0;
    // Each player row is 36px; add 22px for the section header
    const ctrlExtra = numCtrlPlayers > 0 ? (22 + numCtrlPlayers * 36) : 0;

    const tabH = 36;  // height of the tab bar at top of panel
    const pw = 360, ph = (threeBtn ? 268 : 240) + tabH + ctrlExtra;
    const px = (CANVAS_W - pw) / 2, py = (CANVAS_H - ph) / 2;
    const bw = 300, bx = (CANVAS_W - bw) / 2;
    const layout = {
      px, py, pw, ph, tabH, numCtrlPlayers,
      resumeBtn: { x: bx, y: py + tabH + 88,                    w: bw, h: 44, label: '▶  Resume'      },
      menuBtn:   { x: bx, y: py + tabH + (threeBtn ? 204 : 146), w: bw, h: 44, label: '⟵  Main Menu' },
    };
    if (hasLvlSel) layout.levelSelBtn = { x: bx, y: py + tabH + 146, w: bw, h: 44, label: '🗺  Level Select'  };
    return layout;
  }

  // Generic N-player controller assignment rows.
  // Drawn in the Settings tab when twoPlayerMode is on.
  // To support 3-4 players later: pass a larger numPlayers value — nothing else changes.
  _drawCtrlAssignRows(ctx, numPlayers, px, py, pw, tabH, mx, my) {
    // -1=KB1(WASD), -2=KB2(Arrows+Ins/Del); 0-3=gamepad slots
    const OPTS      = [-1, -2, 0, 1, 2, 3];
    const SEC_Y     = py + tabH + 128;    // section starts below the 2P toggle
    const BTN_W     = 80, BTN_H = 26, ROW_H = 36;
    const BTN_X     = px + pw - 24 - BTN_W;
    const rawGps    = navigator.getGamepads ? navigator.getGamepads() : [];
    // Player accent colours — add more entries when adding P3/P4
    const P_COLORS  = { 1: '#FFD700', 2: '#88AAFF', 3: '#88FF88', 4: '#FF8888' };
    const KB_LABELS = { '-1': 'KB1 (WASD)', '-2': 'KB2 (Arrows)' };

    // Section header + divider line
    ctx.save();
    ctx.font = 'bold 9px Courier New'; ctx.fillStyle = '#888899';
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('INPUT ASSIGNMENT', px + 24, SEC_Y + 10);
    ctx.strokeStyle = '#33334466'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 24, SEC_Y + 14); ctx.lineTo(px + pw - 24, SEC_Y + 14);
    ctx.stroke();

    for (let p = 1; p <= numPlayers; p++) {
      const rowY    = SEC_Y + 22 + (p - 1) * ROW_H;
      const midY    = rowY + BTN_H / 2;
      const assigned = ControllerConfig.getAssignment(p);
      const gpRaw    = assigned >= 0 ? rawGps[assigned] : null;
      const connected = !!(gpRaw && gpRaw.connected);
      const pColor   = P_COLORS[p] ?? '#AAAACC';

      // Row stripe
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(px + 20, rowY - 2, pw - 40, BTN_H + 4);

      // Player badge pill
      ctx.fillStyle = `${pColor}22`;
      _roundRect(ctx, px + 24, rowY + 2, 26, BTN_H - 4, 3); ctx.fill();
      ctx.strokeStyle = pColor; ctx.lineWidth = 1;
      _roundRect(ctx, px + 24, rowY + 2, 26, BTN_H - 4, 3); ctx.stroke();
      ctx.fillStyle = pColor; ctx.font = 'bold 10px Courier New';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`P${p}`, px + 37, midY);

      // Connection dot + description
      if (assigned >= 0) {
        // Dot
        ctx.fillStyle = connected ? '#33DD55' : '#554455';
        ctx.beginPath(); ctx.arc(px + 62, midY, 4, 0, Math.PI * 2); ctx.fill();
        if (connected) { ctx.strokeStyle = '#66FF88'; ctx.lineWidth = 1; ctx.stroke(); }
        // Text
        ctx.fillStyle = connected ? '#AAAACC' : '#665577';
        ctx.font = '9px Courier New'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        const label = connected ? `Gamepad ${assigned + 1}` : `Gamepad ${assigned + 1}  ✗`;
        ctx.fillText(label, px + 74, midY);
      } else {
        // Keyboard: no dot, show KB1/KB2 label
        ctx.fillStyle = '#AAAACC'; ctx.font = '9px Courier New';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(KB_LABELS[String(assigned)] ?? 'Keyboard', px + 58, midY);
      }

      // Cycle button label
      let cycleLabel;
      if (assigned === -1) cycleLabel = 'KB1';
      else if (assigned === -2) cycleLabel = 'KB2';
      else cycleLabel = `Gamepad ${assigned + 1}`;

      // Cycle button
      const btnHov = mx >= BTN_X && mx <= BTN_X + BTN_W && my >= rowY && my <= rowY + BTN_H;
      ctx.fillStyle = btnHov ? '#1A2A3A' : '#232333';
      ctx.strokeStyle = btnHov ? '#44AAFF' : '#555577'; ctx.lineWidth = 1;
      _roundRect(ctx, BTN_X, rowY, BTN_W, BTN_H, 4); ctx.fill();
      _roundRect(ctx, BTN_X, rowY, BTN_W, BTN_H, 4); ctx.stroke();
      ctx.fillStyle = '#88CCFF'; ctx.font = 'bold 10px Courier New';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(cycleLabel, BTN_X + BTN_W / 2, rowY + BTN_H / 2);
    }

    ctx.restore();
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
    const mx  = this.input.mouse.x, my = this.input.mouse.y;
    const hit = (b) => mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h;
    const clicked = this.input.mouse.clicked;

    if (this.state === 'paused') {
      const { px, py, pw, ph, tabH, numCtrlPlayers, resumeBtn, menuBtn, saveBtn, levelSelBtn } = this._pauseLayout();
      const TABS = ['pause', 'settings', 'help'];
      const tabW = Math.floor(pw / 3);

      // Keyboard shortcuts while paused → switch tab
      if (this.input.isJustDown('KeyI')) { this._pauseTab = 'settings'; return; }

      // Gamepad: B button → resume
      if (this.input.p1JustDown('crouch')) {
        this.state = 'playing'; this._pauseTab = 'pause'; return;
      }

      // Gamepad: D-Pad left/right → switch tab
      const gpTabL = this.input.p1JustDown('dpad3');
      const gpTabR = this.input.p1JustDown('dpad1');
      if (gpTabL || gpTabR) {
        const idx  = TABS.indexOf(this._pauseTab);
        this._pauseTab = TABS[((idx + (gpTabR ? 1 : -1)) + TABS.length) % TABS.length];
        this._pauseSelIdx = 0;
        return;
      }

      // X close button (top-right corner, checked before tabs to avoid overlap)
      if (clicked && mx >= px + pw - 28 && mx <= px + pw - 8 && my >= py + 8 && my <= py + 28) {
        this.state = 'playing'; this._pauseTab = 'pause'; return;
      }

      // Tab header mouse clicks
      if (clicked) {
        for (let t = 0; t < TABS.length; t++) {
          const tx = px + t * tabW;
          if (mx >= tx && mx <= tx + tabW && my >= py && my <= py + tabH) {
            this._pauseTab = TABS[t]; this._pauseSelIdx = 0; return;
          }
        }
      }

      // ── PAUSE tab ──────────────────────────────────────────
      if (this._pauseTab === 'pause') {
        const allBtns = saveBtn     ? [resumeBtn, saveBtn,     menuBtn]
                      : levelSelBtn ? [resumeBtn, levelSelBtn, menuBtn]
                      :               [resumeBtn, menuBtn];
        const N = allBtns.length;

        // Gamepad cursor
        if (this.input.p1JustDown('dpad0')) this._pauseSelIdx = (this._pauseSelIdx - 1 + N) % N;
        if (this.input.p1JustDown('dpad2')) this._pauseSelIdx = (this._pauseSelIdx + 1) % N;
        if (this._pauseSelIdx >= N) this._pauseSelIdx = N - 1;

        const activateBtn = (btn) => {
          if (btn === resumeBtn)               { this.state = 'playing'; this._pauseTab = 'pause'; return; }
          if (saveBtn     && btn === saveBtn)  { this.state = 'playing'; this._openSaveDialog(); return; }
          if (levelSelBtn && btn === levelSelBtn) {
            if (this.gameMode === 'normal') this._saveNormalProgress();
            this.destroy();
            const rs = this.gameMode === 'platformer' ? 'platformerSelect' : 'normalSelect';
            if (this._onReturnToMenu) this._onReturnToMenu(rs); else location.reload();
            return;
          }
          this.state = 'confirmExit';
        };

        // Gamepad A → activate selected
        if (this.input.p1JustDown('jump')) { activateBtn(allBtns[this._pauseSelIdx]); return; }

        // Mouse clicks on buttons
        if (clicked) {
          for (const btn of allBtns) { if (hit(btn)) { activateBtn(btn); return; } }
        }
      }

      // ── SETTINGS tab ───────────────────────────────────────
      if (this._pauseTab === 'settings') {
        // Volume slider drag — runs every frame while mouse held (not just on click frames)
        const slX = px + 90, slW = pw - 130;
        const volY   = py + ph - 90;
        const mSlY   = volY + 20;  // music slider row Y
        const sSlY   = volY + 46;  // sfx slider row Y
        if (this.input.mouse.down) {
          const inM = mx >= slX && mx <= slX + slW && my >= mSlY + 4 && my <= mSlY + 22;
          const inS = mx >= slX && mx <= slX + slW && my >= sSlY + 4 && my <= sSlY + 22;
          if (this._pauseVolDrag === 'music' || (inM && !this._pauseVolDrag)) {
            this._pauseVolDrag = 'music';
            const v = Math.max(0, Math.min(1, (mx - slX) / slW));
            this._worldAdvSettings.musicVolume = Math.round(v * 20) / 20;
            this._applyMusicVolume();
          } else if (this._pauseVolDrag === 'sfx' || (inS && !this._pauseVolDrag)) {
            this._pauseVolDrag = 'sfx';
            const v = Math.max(0, Math.min(1, (mx - slX) / slW));
            this._worldAdvSettings.sfxVolume = Math.round(v * 20) / 20;
          }
        } else {
          this._pauseVolDrag = null;
        }

        if (this.gameMode === 'sandbox') {
          // Sandbox: click/A → open full World Settings panel
          const inPanel = mx >= px && mx <= px + pw && my >= py + tabH && my <= py + ph;
          if ((clicked && inPanel) || this.input.p1JustDown('jump')) {
            this.state = 'playing'; this._worldSettingsOpen = true; this._pauseTab = 'pause';
          }
        } else {
          // Normal/Platformer: 2-player toggle
          const tgX = px + (pw - 64) / 2, tgY = py + tabH + 90, tgW = 64, tgH = 28;
          if (!this._onlineGameId &&
              ((clicked && mx >= tgX && mx <= tgX + tgW && my >= tgY && my <= tgY + tgH)
               || this.input.p1JustDown('jump'))) {
            this.state = 'playing';
            this._applyTwoPlayerMode(!this._worldAdvSettings.twoPlayerMode);
            this._pauseTab = 'pause';
          }

          // Controller assignment row buttons (one per player when 2P is on)
          if (numCtrlPlayers > 0 && clicked) {
            const OPTS   = [-1, -2, 0, 1, 2, 3];  // -1=KB1, -2=KB2, 0-3=gamepad
            const SEC_Y  = py + tabH + 128;
            const BTN_W  = 80, BTN_H = 26, ROW_H = 36;
            const BTN_X  = px + pw - 24 - BTN_W;
            for (let p = 1; p <= numCtrlPlayers; p++) {
              const rowY = SEC_Y + 22 + (p - 1) * ROW_H;
              if (mx >= BTN_X && mx <= BTN_X + BTN_W && my >= rowY && my <= rowY + BTN_H) {
                const cur  = ControllerConfig.getAssignment(p);
                let   idx  = OPTS.indexOf(cur);
                let   next;
                // KB2 is only valid if the other player has KB1
                do {
                  idx = (idx + 1) % OPTS.length;
                  next = OPTS[idx];
                  const otherAssign = ControllerConfig.getAssignment(p === 1 ? 2 : 1);
                  if (next === -2 && otherAssign !== -1) continue; // skip KB2 if other player doesn't have KB1
                  break;
                } while (true);
                ControllerConfig.setAssignment(p, next);
              }
            }
          }
        }
      }

      // ── HELP tab ───────────────────────────────────────────
      if (this._pauseTab === 'help') {
        const maxScroll = Math.max(0, (this.player2 ? 20 : 15) - 7);
        if (this.input.p1JustDown('dpad0')) this._pauseHelpScroll = Math.max(0, this._pauseHelpScroll - 1);
        if (this.input.p1JustDown('dpad2')) this._pauseHelpScroll = Math.min(maxScroll, this._pauseHelpScroll + 1);
        if (this.input.scrollDelta !== 0)
          this._pauseHelpScroll = Math.max(0, Math.min(maxScroll, this._pauseHelpScroll + this.input.scrollDelta));
        const inPanel = mx >= px && mx <= px + pw && my >= py + tabH && my <= py + ph;
        if ((clicked && inPanel) || this.input.p1JustDown('jump')) {
          this.state = 'playing'; this._tutorialOpen = true; this._tutorialScrollY = 0; this._pauseTab = 'pause';
        }
      }

    } else if (this.state === 'confirmExit') {
      const { px, py, pw, confirmBtn, cancelBtn } = this._confirmLayout();
      // Gamepad: B button → cancel
      if (this.input.p1JustDown('crouch')) { this.state = 'paused'; return; }
      if (!clicked) return;
      // X button → back to pause
      if (mx >= px + pw - 28 && mx <= px + pw - 8 && my >= py + 8 && my <= py + 28) {
        this.state = 'paused'; return;
      }
      if (hit(confirmBtn)) {
        this._saveNormalProgress();
        if (this._onlineGameId) window.multiplayerManager?.disconnect();
        this.destroy();
        if (this._onReturnToMenu) this._onReturnToMenu(_localMenuState(this));
        else location.reload();
      }
      if (hit(cancelBtn)) this.state = 'paused';
    }
  }

  _drawPauseVolSliders(ctx, px, py, pw, ph, volY) {
    const aws = this._worldAdvSettings;
    const slX = px + 90, slW = pw - 130;
    if (volY === undefined) volY = py + ph - 90;

    // Divider + header
    ctx.strokeStyle = '#333355'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px + 10, volY - 6); ctx.lineTo(px + pw - 10, volY - 6); ctx.stroke();
    ctx.font = 'bold 10px Courier New'; ctx.fillStyle = '#7788AA';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('♪ Volume', px + pw / 2, volY + 4);

    const drawRow = (rY, label, vol) => {
      ctx.font = '10px Courier New'; ctx.fillStyle = '#AAAACC';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(label, px + 10, rY + 13);
      // Track
      ctx.fillStyle = '#1A1A2A'; ctx.strokeStyle = '#444466'; ctx.lineWidth = 1;
      ctx.fillRect(slX, rY + 8, slW, 10); ctx.strokeRect(slX, rY + 8, slW, 10);
      // Fill
      const fw = Math.round(vol * slW);
      ctx.fillStyle = '#6644AA';
      ctx.fillRect(slX + 1, rY + 9, Math.max(0, fw - 2), 8);
      // Handle
      ctx.fillStyle = '#AA88FF';
      ctx.fillRect(slX + fw - 4, rY + 6, 8, 14);
      // Pct
      ctx.font = 'bold 10px Courier New'; ctx.fillStyle = '#CCAAFF';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(Math.round(vol * 100) + '%', px + pw - 8, rY + 13);
    };

    drawRow(volY + 20, 'Music', aws.musicVolume ?? DEFAULT_MUSIC_VOLUME);
    drawRow(volY + 46, 'SFX',   aws.sfxVolume   ?? DEFAULT_SFX_VOLUME);

    // Now playing
    const curTrack = this._musicSystem.currentTrack
      ? (MUSIC_DISCS[this._musicSystem.currentTrack]?.discName ?? '♪')
      : '(none)';
    ctx.font = '9px Courier New'; ctx.fillStyle = '#556677';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Now Playing: ' + curTrack, px + pw / 2, py + ph - 8);
  }

  _drawPauseOverlay(ctx) {
    const mx  = this.input.mouse.x, my = this.input.mouse.y;
    const hit = (b) => mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    if (this.state === 'paused') {
      this._drawArenaObjectivesPanel(ctx); // arena win-condition status (left side)
      const { px, py, pw, ph, tabH, numCtrlPlayers, resumeBtn, menuBtn, saveBtn, levelSelBtn } = this._pauseLayout();
      const TABS       = ['pause', 'settings', 'help'];
      const TAB_LABELS = ['⏸ PAUSE', '⚙ SETTINGS', '? HELP'];
      const tabW       = Math.floor(pw / 3);
      const gpConn     = this.input.p1GpSlot >= 0 && this.input.gamepads[this.input.p1GpSlot]?.connected;

      // Panel background
      ctx.fillStyle = '#13131f';
      _roundRect(ctx, px, py, pw, ph, 10); ctx.fill();
      ctx.strokeStyle = '#444466'; ctx.lineWidth = 2;
      _roundRect(ctx, px, py, pw, ph, 10); ctx.stroke();

      // ── Tab bar ──────────────────────────────────────────────
      for (let t = 0; t < 3; t++) {
        const tx    = px + t * tabW;
        const isAct = TABS[t] === this._pauseTab;
        const tHov  = mx >= tx && mx <= tx + tabW && my >= py && my <= py + tabH;
        ctx.fillStyle   = isAct ? '#1e1e40' : (tHov ? '#191932' : '#111120');
        ctx.fillRect(tx, py, tabW, tabH);
        ctx.strokeStyle = isAct ? '#6666cc' : '#333355';
        ctx.lineWidth   = 1;
        ctx.strokeRect(tx, py, tabW, tabH);
        ctx.fillStyle    = isAct ? '#aabbff' : (tHov ? '#8899cc' : '#556688');
        ctx.font         = 'bold 10px Courier New';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(TAB_LABELS[t], tx + tabW / 2, py + tabH / 2);
      }
      // Separator line below tabs
      ctx.strokeStyle = '#444466'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, py + tabH); ctx.lineTo(px + pw, py + tabH); ctx.stroke();

      // X close button (top-right, above tab bar) — resumes game
      { const xbx = px + pw - 28, xby = py + 8;
        const xHov = mx >= xbx && mx <= xbx + 20 && my >= xby && my <= xby + 20;
        ctx.fillStyle   = xHov ? 'rgba(255,80,80,0.3)' : 'rgba(0,0,0,0.4)';
        _roundRect(ctx, xbx, xby, 20, 20, 4); ctx.fill();
        ctx.strokeStyle = xHov ? '#FF5555' : '#554444'; ctx.lineWidth = 1;
        _roundRect(ctx, xbx, xby, 20, 20, 4); ctx.stroke();
        ctx.fillStyle = xHov ? '#fff' : '#AA7777';
        ctx.font = 'bold 12px Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('✕', xbx + 10, xby + 10); }

      // ── PAUSE tab content ────────────────────────────────────
      if (this._pauseTab === 'pause') {
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle    = '#7ec8e3';
        ctx.font         = 'bold 18px Courier New';
        ctx.fillText('⏸  PAUSED', CANVAS_W / 2, py + tabH + 30);

        const modeColors = { normal: '#4CAF50', sandbox: '#FF9800', platformer: '#2196F3' };
        const modeNames  = { normal: 'Normal Mode', sandbox: 'Sandbox Mode', platformer: 'Platformer Mode' };
        const mCol       = modeColors[this.gameMode] ?? '#888';
        ctx.fillStyle    = `${mCol}33`;
        _roundRect(ctx, px + 50, py + tabH + 46, pw - 100, 20, 4); ctx.fill();
        ctx.strokeStyle  = mCol; ctx.lineWidth = 1;
        _roundRect(ctx, px + 50, py + tabH + 46, pw - 100, 20, 4); ctx.stroke();
        ctx.fillStyle    = mCol;
        ctx.font         = '10px Courier New';
        ctx.fillText(modeNames[this.gameMode] ?? this.gameMode, CANVAS_W / 2, py + tabH + 56);

        // Platformer: show level name + creator in the gap above Resume
        if (this.gameMode === 'platformer' && this._platformerLevelName) {
          ctx.font      = '9px Courier New';
          ctx.fillStyle = 'rgba(180,210,255,0.75)';
          ctx.fillText(
            `${this._platformerLevelName}  ·  by ${this._platformerCreator}`,
            CANVAS_W / 2, py + tabH + 76
          );
        }

        const allBtns = saveBtn     ? [resumeBtn, saveBtn,     menuBtn]
                      : levelSelBtn ? [resumeBtn, levelSelBtn, menuBtn]
                      :               [resumeBtn, menuBtn];
        for (let i = 0; i < allBtns.length; i++) {
          const btn    = allBtns[i];
          const hov    = hit(btn);
          const isSel  = gpConn && this._pauseSelIdx === i;
          const isSave = btn === saveBtn;
          const isLvl  = btn === levelSelBtn;
          const accent = isSave ? '#4CAF50' : isLvl ? '#2196F3' : null;
          ctx.fillStyle   = (hov || isSel) ? (accent ? `${accent}33` : 'rgba(255,255,255,0.12)') : 'rgba(0,0,0,0.55)';
          _roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 6); ctx.fill();
          ctx.strokeStyle = (hov || isSel) ? (accent ?? '#fff') : (accent ? `${accent}66` : '#555');
          ctx.lineWidth   = isSel ? 2 : 1.5;
          _roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 6); ctx.stroke();
          ctx.fillStyle    = (hov || isSel) ? '#fff' : (accent ? `${accent}CC` : '#ccc');
          ctx.font         = 'bold 13px Courier New';
          ctx.textAlign    = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(btn.label, CANVAS_W / 2, btn.y + btn.h / 2);
        }

        ctx.fillStyle = 'rgba(110,110,130,0.55)';
        ctx.font      = '9px Courier New';
        ctx.textAlign = 'center';
        let hint = saveBtn     ? '[Esc] resume  •  [F] quick save'
                 : levelSelBtn ? '[Esc] resume  •  [F] save at bed'
                 :               '[Esc] to resume';
        if (gpConn) hint += '  •  [←→] tabs  [↑↓] select  [A] confirm';
        ctx.fillText(hint, CANVAS_W / 2, py + ph - 10);
      }

      // ── SETTINGS tab content ─────────────────────────────────
      if (this._pauseTab === 'settings') {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (this.gameMode === 'sandbox') {
          // Sandbox: full World Settings button
          ctx.fillStyle = '#FFCC66'; ctx.font = 'bold 15px Courier New';
          ctx.fillText('⚙  World Settings', CANVAS_W / 2, py + tabH + 38);
          ctx.fillStyle = '#888899'; ctx.font = '11px Courier New';
          ctx.fillText('Mob drops  •  Day/Night  •  Advanced', CANVAS_W / 2, py + tabH + 62);
          ctx.fillText('Controller sensitivity  •  Input options', CANVAS_W / 2, py + tabH + 80);
          const obx = (CANVAS_W - 260) / 2, oby = py + tabH + 100, obw = 260, obh = 44;
          const obHov = mx >= obx && mx <= obx + obw && my >= oby && my <= oby + obh;
          ctx.fillStyle   = (obHov || gpConn) ? 'rgba(255,200,80,0.15)' : 'rgba(0,0,0,0.55)';
          _roundRect(ctx, obx, oby, obw, obh, 6); ctx.fill();
          ctx.strokeStyle = (obHov || gpConn) ? '#FFCC66' : '#665533'; ctx.lineWidth = gpConn ? 2 : 1.5;
          _roundRect(ctx, obx, oby, obw, obh, 6); ctx.stroke();
          ctx.fillStyle = (obHov || gpConn) ? '#fff' : '#FFCC66'; ctx.font = 'bold 13px Courier New';
          ctx.fillText('Open World Settings', CANVAS_W / 2, oby + obh / 2);
          ctx.fillStyle = 'rgba(110,110,130,0.55)'; ctx.font = '9px Courier New';
          ctx.fillText(gpConn ? '[A] Open  [B] Back  [←→] Switch Tab  •  [P] shortcut'
                              : 'Click to open  •  [P] key shortcut from game',
            CANVAS_W / 2, py + ph - 98);
          this._drawPauseVolSliders(ctx, px, py, pw, ph);
        } else {
          // Normal / Platformer: 2-Player Co-op toggle (disabled in online games)
          const is2p  = this._worldAdvSettings.twoPlayerMode;
          const noTwop = !!this._onlineGameId;
          ctx.fillStyle = noTwop ? '#444466' : '#88AAFF'; ctx.font = 'bold 13px Courier New';
          ctx.fillText('2-Player Co-op', CANVAS_W / 2, py + tabH + 36);
          ctx.fillStyle = '#888899'; ctx.font = '10px Courier New';
          ctx.fillText(noTwop ? 'Not available in online games' : 'IJKL keys or 2nd gamepad for Player 2', CANVAS_W / 2, py + tabH + 58);
          if (!noTwop) ctx.fillText('If P2 joins mid-game, they spawn next to P1', CANVAS_W / 2, py + tabH + 74);
          const tgX = px + (pw - 64) / 2, tgY = py + tabH + 90, tgW = 64, tgH = 28;
          const tgHov = !noTwop && mx >= tgX && mx <= tgX + tgW && my >= tgY && my <= tgY + tgH;
          ctx.fillStyle   = noTwop ? '#1E1E2A' : (is2p ? '#3A5A2A' : '#2A2A3A');
          _roundRect(ctx, tgX, tgY, tgW, tgH, 5); ctx.fill();
          ctx.strokeStyle = noTwop ? '#333344' : (is2p ? '#66CC44' : '#555577'); ctx.lineWidth = tgHov || gpConn ? 2 : 1;
          _roundRect(ctx, tgX, tgY, tgW, tgH, 5); ctx.stroke();
          ctx.fillStyle = noTwop ? '#444455' : (is2p ? '#88FF66' : '#888899'); ctx.font = 'bold 12px Courier New';
          ctx.fillText(noTwop ? 'N/A' : (is2p ? 'ON' : 'OFF'), tgX + tgW / 2, tgY + tgH / 2);

          // Controller assignment rows (only when 2P is active)
          if (numCtrlPlayers > 0) {
            this._drawCtrlAssignRows(ctx, numCtrlPlayers, px, py, pw, tabH, mx, my);
          }

          this._drawPauseVolSliders(ctx, px, py, pw, ph);
        }
      }

      // ── HELP tab content ──────────────────────────────────────
      if (this._pauseTab === 'help') {
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle    = '#88ddaa';
        ctx.font         = 'bold 13px Courier New';
        ctx.fillText('Controls Quick Reference', CANVAS_W / 2, py + tabH + 18);

        const is2P = !!this.player2;
        const rows = [
          ['Movement',    'WASD / Arrows / L-Stick'],
          ['Jump',        'W / Up / [A button]'],
          ['Sprint',      'Shift (full stick auto)'],
          ['Crouch',      'S / Down / [B button]'],
          ['Attack/Mine', 'Space / L-Click / [X]'],
          ['Bow (aim)',   is2P ? 'Hold Space → aim W/S → release' : 'Hold Space or L-Click → release'],
          ['Use/Place',   'Right-click'],
          ['Hotbar',      '1-9 / Scroll / D-Pad'],
          ['Inventory',   'I (Normal mode)'],
          ['Palette',     'I / [Y] (Sandbox)'],
          ['Undo/Redo',   'Ctrl+Z/Y / LT/RT (Sandbox)'],
          ['Crafting',    'C key'],
          ['Checkpoint',  'F key (at bed)'],
          ['Settings',    'P key / [←→] SETTINGS tab'],
          ['Pause',       'Esc / Start button'],
          ...(is2P ? [
            ['─── P2 ───', '──────────────────────────'],
            ['P2 Move',    this.input.p2GpSlot >= 0 ? 'L-Stick' : (this.input.p2GpSlot === -2 ? 'Arrows' : 'WASD')],
            ['P2 Jump',    this.input.p2GpSlot >= 0 ? '[A]'     : (this.input.p2GpSlot === -2 ? 'Up' : 'W')],
            ['P2 Attack',  this.input.p2GpSlot >= 0 ? '[X]'     : (this.input.p2GpSlot === -2 ? 'Insert' : 'Space')],
            ['P2 Bow aim', this.input.p2GpSlot >= 0 ? 'Hold [X] → release' : (this.input.p2GpSlot === -2 ? 'Hold Ins → aim Up/Dn → release' : 'Hold Space → aim W/S → release')],
          ] : []),
        ];
        const visible  = 7;
        const rowH     = 20;
        const listTop  = py + tabH + 34;
        const maxScroll = Math.max(0, rows.length - visible);
        if (this._pauseHelpScroll > maxScroll) this._pauseHelpScroll = maxScroll;
        const scroll = this._pauseHelpScroll;

        ctx.save();
        ctx.beginPath();
        ctx.rect(px + 8, listTop, pw - 16, visible * rowH + 2);
        ctx.clip();

        for (let i = 0; i < rows.length; i++) {
          const vy = listTop + (i - scroll) * rowH + rowH / 2;
          if (vy < listTop - 1 || vy > listTop + visible * rowH + 1) continue;
          ctx.fillStyle    = '#667788';
          ctx.font         = 'bold 10px Courier New';
          ctx.textAlign    = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(rows[i][0], px + 14, vy);
          ctx.fillStyle = '#aabbcc';
          ctx.font      = '10px Courier New';
          ctx.textAlign = 'right';
          ctx.fillText(rows[i][1], px + pw - 14, vy);
        }
        ctx.restore();

        if (rows.length > visible) {
          const barH  = visible * rowH - 4;
          const barX  = px + pw - 6;
          const barY  = listTop + 2;
          const thumbH = Math.max(16, barH * visible / rows.length);
          const thumbY = barY + (barH - thumbH) * (scroll / maxScroll);
          ctx.fillStyle = '#222233'; ctx.fillRect(barX, barY, 3, barH);
          ctx.fillStyle = '#557799'; ctx.fillRect(barX, thumbY, 3, thumbH);
        }

        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle    = 'rgba(110,110,130,0.55)';
        ctx.font         = '9px Courier New';
        ctx.fillText(
          gpConn ? '[↑↓] Scroll  [A] Full Tutorial  [B] Back  [←→] Switch Tab'
                 : 'Scroll  •  Click for Full Tutorial',
          CANVAS_W / 2, py + ph - 10
        );
      }

      // Version label — bottom-left of panel, left-aligned (doesn't clash with centred hint)
      ctx.fillStyle    = 'rgba(100,110,140,0.5)';
      ctx.font         = '8px Courier New';
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(GAME_VERSION, px + 8, py + ph - 4);

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
      const _isHost = !!(this._onlineGameId && window.multiplayerManager?.isCreator);
      ctx.fillStyle = _isHost ? '#FF6666' : '#FF9966';
      ctx.font      = 'bold 17px Courier New';
      ctx.fillText(_isHost ? 'Leave and End Session?' : 'Return to Main Menu?', CANVAS_W / 2, py + 36);
      ctx.fillStyle = _isHost ? '#FF8888' : '#888899';
      ctx.font      = '11px Courier New';
      ctx.fillText(_isHost ? 'You are the host. All players will be kicked.' : 'Any unsaved progress will be lost.', CANVAS_W / 2, py + 64);
      ctx.fillStyle = 'rgba(100,100,100,0.45)';
      ctx.font      = '9px Courier New';
      ctx.fillText(_isHost ? 'The game session will end permanently.' : 'Any unsaved progress in Sandbox will be lost.', CANVAS_W / 2, py + 84);

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
    const result = SandboxSaves.save(pName, wName, this.level, this.sandbox, this.player, this.redstone, this._dustBlocks, this._gateBlocks, this._transmitters, this._receivers, this._chests, this._ruinedPortals, this._endPortalAnchors, this._dragon, this._endCrystals, this._dragonDefeated, this._mobDropSettings, this._worldAdvSettings, this._collectedDiscs, this._musicPlayerBlocks, this._witherAltars);
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

  _loadSandboxWorld(keyOrData) {
    const raw  = typeof keyOrData === 'string' ? SandboxSaves.load(keyOrData) : keyOrData;
    const data = SaveMigrations.migrateSave(raw);
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
          // Phase 3A.2 — per-spawner arena fields (default when absent on old saves)
          spawnFrequency: typeof e.spawnFrequency === 'number' ? e.spawnFrequency : 2,
          maxActiveMobs:  typeof e.maxActiveMobs  === 'number' ? e.maxActiveMobs  : 3,
        }));
    }

    // Restore Goal-Star colours (campaign-prep) for the editor.
    this._goalColorMap = {};
    if (Array.isArray(data.goalStars)) {
      for (const g of data.goalStars) {
        if (g && typeof g.row === 'number' && typeof g.col === 'number' && g.color) {
          this._goalColorMap[g.row + ',' + g.col] = g.color;
        }
      }
    }
    this._invalidateGoalCells();

    // Restore arena collectibles (Phase 3A.2) + objectives (Phase 3A.3)
    if (this.sandbox) {
      this.sandbox.placedEmeralds = (Array.isArray(data.emeralds) ? data.emeralds : [])
        .filter(e => e && typeof e.col === 'number' && typeof e.row === 'number')
        .map(e => ({ col: e.col, row: e.row, wx: e.col * BLOCK_SIZE + BLOCK_SIZE / 2, wy: e.row * BLOCK_SIZE + BLOCK_SIZE / 2, group: (e.group >= 1 && e.group <= 3) ? e.group : 1 }));
      this.sandbox.placedPowerups = (Array.isArray(data.powerups) ? data.powerups : [])
        .filter(p => p && typeof p.col === 'number' && typeof p.row === 'number')
        .map(p => ({ col: p.col, row: p.row, wx: p.col * BLOCK_SIZE + BLOCK_SIZE / 2, wy: p.row * BLOCK_SIZE + BLOCK_SIZE / 2, powerType: p.powerType || 'HEALTH' }));
      this.sandbox.placedSpawnLines = (Array.isArray(data.spawnLines) ? data.spawnLines : [])
        .filter(s => s && typeof s.col === 'number' && typeof s.row === 'number')
        .map(s => ({ col: s.col, row: s.row, wx: s.col * BLOCK_SIZE + BLOCK_SIZE / 2, wy: s.row * BLOCK_SIZE + BLOCK_SIZE / 2, line: (s.line >= 1 && s.line <= 4) ? s.line : 1 }));
      this.sandbox.placedHill = (data.placedHill && typeof data.placedHill.col === 'number' && typeof data.placedHill.row === 'number')
        ? { col: data.placedHill.col, row: data.placedHill.row,
            w: Math.max(1, Math.min(20, data.placedHill.w || 4)), h: Math.max(1, Math.min(20, data.placedHill.h || 1)) }
        : null;
      // Player spawn points (Phase 3). Key `playerSpawns` (distinct from mob spawnPoints).
      this.sandbox.placedSpawnPoints = (Array.isArray(data.playerSpawns) ? data.playerSpawns : [])
        .filter(s => s && typeof s.col === 'number' && typeof s.row === 'number')
        .slice(0, 4)
        .map(s => ({ col: s.col, row: s.row, wx: s.col * BLOCK_SIZE + BLOCK_SIZE / 2, wy: s.row * BLOCK_SIZE + BLOCK_SIZE / 2, slot: (s.slot >= 1 && s.slot <= 4) ? s.slot : 1 }));
      // Auto-migration: worlds authored before spawn points existed get 2 seeded
      // (movable + deletable) so arena play works out of the box for 2 players.
      if (this.sandbox.placedSpawnPoints.length === 0) this._seedDefaultSpawnPoints();
      // Arena objects (Phase 3 v3): CTF Base / Tower / Heal Tower placeables.
      this.sandbox.placedArenaObjs = (Array.isArray(data.arenaObjects) ? data.arenaObjects : [])
        .filter(o => o && typeof o.col === 'number' && typeof o.row === 'number' && ['base', 'tower', 'heal'].includes(o.type))
        .map(o => ({ type: o.type, col: o.col, row: o.row, wx: o.col * BLOCK_SIZE + BLOCK_SIZE / 2, wy: o.row * BLOCK_SIZE + BLOCK_SIZE / 2,
                     team: (o.team === 1) ? 1 : 0, slot: (o.slot >= 1 && o.slot <= 4) ? o.slot : 1 }));
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

    // Restore placed item drops (weapons/tools/block items)
    if (Array.isArray(data.placedItems) && this.sandbox) {
      this.sandbox.placedItems = data.placedItems
        .filter(it => it && typeof it.col === 'number' && typeof it.row === 'number'
                   && (it.toolKey || (it.blockType != null && typeof it.count === 'number')))
        .map(it => ({
          col:       it.col,
          row:       it.row,
          wx:        it.col * BLOCK_SIZE + BLOCK_SIZE / 2,
          wy:        it.row * BLOCK_SIZE + BLOCK_SIZE / 2,
          toolKey:   it.toolKey   ?? null,
          blockType: it.blockType ?? null,
          count:     it.count     ?? null,
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

    // Restore dragon + crystal states
    this._savedDragonState = data.dragonState || null;
    this._dragonDefeated   = !!data.dragonDefeated;
    if (this._dragonDefeated) this._dragonExitPortal = true;
    if (Array.isArray(data.crystalStates)) {
      for (const cs of data.crystalStates) {
        const crystal = this._endCrystals.find(c => c.col === cs.col && c.row === cs.row);
        if (crystal && cs.destroyed) {
          crystal.destroyed = true;
          this.level.set(crystal.row, crystal.col, BLOCK.AIR);
        }
      }
    }

    // Restore mob drop settings
    if (data.mobDropSettings && typeof data.mobDropSettings === 'object') {
      for (const key of Object.keys(this._mobDropSettings)) {
        if (Array.isArray(data.mobDropSettings[key])) {
          this._mobDropSettings[key] = data.mobDropSettings[key];
        }
      }
      this.mobManager.dropConfig = this._mobDropSettings;
    }
    // Restore advanced world settings
    if (data.worldAdvSettings && typeof data.worldAdvSettings === 'object') {
      Object.assign(this._worldAdvSettings, data.worldAdvSettings);
      if (typeof this._worldAdvSettings.dayCycleMinutes === 'number')
        this._dayNight.halfCycleMs = this._worldAdvSettings.dayCycleMinutes * 60 * 1000 / 2;
    }
    // Restore music data (Phase 13.5)
    this._restoreMusicData(data);
    // Restore Wither altars (Phase 14)
    this._restoreWitherAltars(data.witherAltars);

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

  _loadNormalWorld(keyOrData) {
    // Loaded either from a localStorage save (string key, legacy menu flow) or
    // directly from cloud world_data (object, new game-slot flow).
    const key  = typeof keyOrData === 'string' ? keyOrData : null;
    const raw  = key ? SandboxSaves.load(key) : keyOrData;
    const data = SaveMigrations.migrateSave(raw);
    if (!data) { this._notify('Failed to load world!', '#FF4444', 300); return; }

    this._resizeLevelFromData(data);

    // NormalProgress is a localStorage-only checkpoint keyed by the save key, so
    // it only applies to the legacy string-key flow. Cloud games persist via
    // GAME_STATE/AUTO_SAVE instead, so there's no progress to overlay (key=null).
    const progress = (key && !this._normalNewGame) ? NormalProgress.load(key) : null;

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
      wither_skeleton: 'WitherSkeleton', enderman: 'Enderman',
    };
    // Replace buildWorld() default spawn points with only player-placed eggs.
    // buildWorld() seeds the mob manager before this load runs; merging would spawn
    // mobs at hardcoded buildWorld() positions even in custom worlds with no eggs.
    const eggSpawns = Array.isArray(data.spawnEggs)
      ? data.spawnEggs
          .filter(e => e && typeof e.col === 'number' && typeof e.row === 'number' && EGG_TO_MOB[e.mobType])
          .map(e => ({ col: e.col, row: e.row, mobTypeName: EGG_TO_MOB[e.mobType], timer: 0, active: true }))
      : [];
    this.mobManager.setupSpawnPoints(eggSpawns);

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
    // Derive portal-frame solidity from the grid (frame walk-through, base solid)
    // so pre-built portals are enterable in single-player and as host — joiners
    // already do this on join, leaving single-player/host with all-solid obsidian.
    this._rebuildPortalObsidianFromGrid();

    // Placed tool/weapon/armor/block items → collectible world drops (same pipeline as platformer)
    this._platformerItems = (Array.isArray(data.placedItems) ? data.placedItems : [])
      .filter(it => it && typeof it.col === 'number' && typeof it.row === 'number'
                 && ((it.toolKey && (TOOL_DATA[it.toolKey] || ARMOR_DATA[it.toolKey]))
                  || (it.blockType != null && typeof it.count === 'number')))
      .map(it => ({
        wx:        it.col * BLOCK_SIZE + BLOCK_SIZE / 2,
        wy:        it.row * BLOCK_SIZE + BLOCK_SIZE / 2,
        toolKey:   it.toolKey   ?? null,
        blockType: it.blockType ?? null,
        count:     it.count     ?? null,
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

    // Overlay saved runtime redstone state on top of the template layout, so a
    // world played in Normal mode keeps toggled levers / powered wiring across
    // leave/re-enter (the sim re-propagates downstream from these on next tick).
    if (progress && progress.redstoneState && typeof progress.redstoneState === 'object') {
      const rsState = progress.redstoneState;
      for (const l of (rsState.levers || [])) {
        const comp = this.redstone.getAt(l.col, l.row);
        if (comp && comp.type === 'lever') comp.on = !!l.on;
      }
      for (const t of (rsState.trapdoors || [])) {
        const comp = this.redstone.getAt(t.col, t.row);
        if (comp && comp.type === 'trapdoor') comp.open = !!t.open;
      }
      for (const p of (rsState.pistons || [])) {
        const comp = this.redstone.getAt(p.col, p.row);
        if (comp && comp.type === 'piston') comp.extended = !!p.extended;
      }
      for (const d of (rsState.dust || [])) {
        const dust = this._dustBlocks.get(`${d.col},${d.row}`);
        if (dust) { dust.on = !!d.on; dust.everTriggered = !!d.everTriggered; }
      }
      for (const g of (rsState.gates || [])) {
        const gate = this._gateBlocks.get(`${g.col},${g.row}`);
        if (gate) { gate.outputPowered = !!g.outputPowered; gate.everTriggered = !!g.everTriggered; }
      }
      for (const t of (rsState.transmitters || [])) {
        const tx = this._transmitters.get(`${t.col},${t.row}`);
        if (tx) tx.powered = !!t.powered;
      }
      for (const r of (rsState.receivers || [])) {
        const rx = this._receivers.get(`${r.col},${r.row}`);
        if (rx) rx.powered = !!r.powered;
      }
      this._dustConnDirty = true;
    }

    // Restore live mobs + ground drops so re-entering the world keeps the exact
    // set that was alive/dropped, rather than respawning from spawn eggs. Prefer
    // the NormalProgress checkpoint (legacy localStorage flow); fall back to the
    // world payload (cloud game-slot flow, where `data` is the saved snapshot).
    // Skipped on New Game so a fresh start spawns from eggs.
    if (!this._normalNewGame) {
      const savedMobs  = (progress && Array.isArray(progress.liveMobs) && progress.liveMobs.length)
        ? progress.liveMobs : (Array.isArray(data.liveMobs) ? data.liveMobs : []);
      const savedDrops = (progress && Array.isArray(progress.droppedItems) && progress.droppedItems.length)
        ? progress.droppedItems : (Array.isArray(data.droppedItems) ? data.droppedItems : []);
      if (savedMobs.length)  this.mobManager.adoptSerializedMobs(savedMobs);
      if (savedDrops.length) this.mobManager.restoreDroppedItems(savedDrops);
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
      // New Game: clear any existing checkpoint and start 1 minute into the day
      if (key) NormalProgress.remove(key); // only the legacy localStorage flow has a key
      this._dayNight.timer = 60 * 1000;
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

    // Restore dragon + crystal states
    this._savedDragonState = data.dragonState || null;
    this._dragonDefeated   = !!data.dragonDefeated;
    if (this._dragonDefeated) this._dragonExitPortal = true;
    if (Array.isArray(data.crystalStates)) {
      for (const cs of data.crystalStates) {
        const crystal = this._endCrystals.find(c => c.col === cs.col && c.row === cs.row);
        if (crystal && cs.destroyed) {
          crystal.destroyed = true;
          this.level.set(crystal.row, crystal.col, BLOCK.AIR);
        }
      }
    }

    // Restore mob drop settings
    if (data.mobDropSettings && typeof data.mobDropSettings === 'object') {
      for (const key of Object.keys(this._mobDropSettings)) {
        if (Array.isArray(data.mobDropSettings[key])) {
          this._mobDropSettings[key] = data.mobDropSettings[key];
        }
      }
      this.mobManager.dropConfig = this._mobDropSettings;
    }
    // Restore advanced world settings
    if (data.worldAdvSettings && typeof data.worldAdvSettings === 'object') {
      Object.assign(this._worldAdvSettings, data.worldAdvSettings);
    }
    // Restore music data from sandbox save + normal progress collected discs
    this._restoreMusicData(data);
    this._restoreWitherAltars(data.witherAltars);
    if (progress && Array.isArray(progress.collectedDiscs)) {
      for (const d of progress.collectedDiscs) this._collectedDiscs.add(d);
    }

    // Restore day/night state from NormalProgress
    if (progress && progress.dayNight && typeof progress.dayNight === 'object') {
      const dn = progress.dayNight;
      if (typeof dn.isDay      === 'boolean') this._dayNight.isDay      = dn.isDay;
      if (typeof dn.nightPhase === 'number')  this._dayNight.nightPhase = dn.nightPhase % 8;
      if (typeof dn.timer      === 'number')  this._dayNight.timer      = dn.timer;
      if (typeof dn.halfCycleMs === 'number' && dn.halfCycleMs > 0)
        this._dayNight.halfCycleMs = dn.halfCycleMs;
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
      this.level.grid, collectedKeys, this._chests, this._dayNight,
      this._worldAdvSettings.twoPlayerMode, this._collectedDiscs,
      this._captureRedstoneState(), this._captureDroppedItems(),
      this.mobManager ? this.mobManager.serializeMobs() : []
    );
    if (!result.ok) this._notify('Save failed: ' + result.error, '#FF4444', 200);
  }

  // Snapshot the live redstone device states so they survive leave/re-enter in
  // Normal mode (the world template only carries their initial wiring layout).
  _captureRedstoneState() {
    const comps = this.redstone?.components || [];
    return {
      levers:    comps.filter(c => c.type === 'lever')    .map(c => ({ col: c.col, row: c.row, on: !!c.on })),
      trapdoors: comps.filter(c => c.type === 'trapdoor') .map(c => ({ col: c.col, row: c.row, open: !!c.open })),
      pistons:   comps.filter(c => c.type === 'piston')   .map(c => ({ col: c.col, row: c.row, extended: !!c.extended })),
      dust: [...(this._dustBlocks?.values() ?? [])].map(d => ({ col: d.col, row: d.row, on: !!d.on, everTriggered: !!d.everTriggered })),
      gates: [...(this._gateBlocks?.values() ?? [])].map(g => ({ col: g.col, row: g.row, outputPowered: !!g.outputPowered, everTriggered: !!g.everTriggered })),
      transmitters: [...(this._transmitters?.values() ?? [])].map(t => ({ col: t.col, row: t.row, powered: !!t.powered })),
      receivers:    [...(this._receivers?.values() ?? [])].map(r => ({ col: r.col, row: r.row, powered: !!r.powered })),
    };
  }

  // Snapshot ground item drops (mob loot / broken-block drops) not yet collected.
  _captureDroppedItems() {
    const drops = this.mobManager?.droppedItems || [];
    return drops.filter(d => d && d.alive).map(d => ({
      x: Math.round(d.x), y: Math.round(d.y),
      itemKey: d.itemKey, amount: d.amount, life: d.life,
    }));
  }

  // ── Platformer mode: play a Sandbox-created world as a platformer level ──

  _loadPlatformerWorld(keyOrData) {
    const raw  = typeof keyOrData === 'string' ? SandboxSaves.load(keyOrData) : keyOrData;
    const data = SaveMigrations.migrateSave(raw);
    if (!data) { this._notify('Failed to load level!', '#FF4444', 300); return; }

    this._platformerLevelName = data.worldName  || 'Unknown Level';
    this._platformerCreator   = data.playerName || 'Unknown';

    this._resizeLevelFromData(data);

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

    // Player 1 spawn point (Phase 3): a placed player spawn point overrides the
    // sandbox editor position, so a Platformer level starts the player at the
    // DESIGNED spot — not wherever the designer left off in the editor.
    {
      const spawns = Array.isArray(data.playerSpawns) ? data.playerSpawns : [];
      const p1 = spawns.find(s => (s.slot || 1) === 1) || spawns[0];
      if (p1 && typeof p1.col === 'number' && typeof p1.row === 'number') {
        const px = p1.col * BLOCK_SIZE, py = p1.row * BLOCK_SIZE;
        this.level.spawnX = px; this.level.spawnY = py;
        if (this.player) { this.player.x = px; this.player.y = py; this.player.vx = 0; this.player.vy = 0; }
      }
    }

    // Convert spawn eggs to mob spawn points
    const EGG_TO_MOB = {
      zombie: 'Zombie', skeleton: 'Skeleton', creeper: 'Creeper',
      cave_spider: 'CaveSpider', piglin: 'Piglin', blaze: 'Blaze',
      wither_skeleton: 'WitherSkeleton', enderman: 'Enderman',
    };
    const eggSpawnsPf = Array.isArray(data.spawnEggs)
      ? data.spawnEggs
          .filter(e => e && typeof e.col === 'number' && typeof e.row === 'number' && EGG_TO_MOB[e.mobType])
          .map(e => ({ col: e.col, row: e.row, mobTypeName: EGG_TO_MOB[e.mobType], timer: 0, active: true }))
      : [];
    this.mobManager.setupSpawnPoints(eggSpawnsPf);

    // Restore live mobs + ground drops saved with this world (cloud game-slot
    // snapshot), so re-entering keeps the mobs that were alive instead of
    // respawning fresh from spawn eggs. Fresh templates carry none → no-op.
    if (Array.isArray(data.liveMobs) && data.liveMobs.length) {
      this.mobManager.adoptSerializedMobs(data.liveMobs);
    }
    if (Array.isArray(data.droppedItems) && data.droppedItems.length) {
      this.mobManager.restoreDroppedItems(data.droppedItems);
    }

    // Placed tool/weapon/block items → collectible pickups
    this._platformerItems = (Array.isArray(data.placedItems) ? data.placedItems : [])
      .filter(it => it && typeof it.col === 'number' && typeof it.row === 'number'
                 && ((it.toolKey && (TOOL_DATA[it.toolKey] || ARMOR_DATA[it.toolKey]))
                  || (it.blockType != null && typeof it.count === 'number')))
      .map(it => ({
        wx:        it.col * BLOCK_SIZE + BLOCK_SIZE / 2,
        wy:        it.row * BLOCK_SIZE + BLOCK_SIZE / 2,
        toolKey:   it.toolKey   ?? null,
        blockType: it.blockType ?? null,
        count:     it.count     ?? null,
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
    // Frame walk-through / base-solid portal solidity derived from the grid.
    this._rebuildPortalObsidianFromGrid();

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

    // Dragon: always fresh in platformer — sandbox defeat state must not carry over.
    // The dragon will spawn when the player first enters the End via the portal.
    this._savedDragonState    = null;
    this._dragonDefeated      = false;
    this._dragonExitPortal    = false;
    this._dragonVictoryScreen = false;
    // Crystal states still apply (destroyed crystals stay destroyed in the level grid)
    if (Array.isArray(data.crystalStates)) {
      for (const cs of data.crystalStates) {
        const crystal = this._endCrystals.find(c => c.col === cs.col && c.row === cs.row);
        if (crystal && cs.destroyed) {
          crystal.destroyed = true;
          this.level.set(crystal.row, crystal.col, BLOCK.AIR);
        }
      }
    }

    // Restore mob drop settings
    if (data.mobDropSettings && typeof data.mobDropSettings === 'object') {
      for (const key of Object.keys(this._mobDropSettings)) {
        if (Array.isArray(data.mobDropSettings[key])) {
          this._mobDropSettings[key] = data.mobDropSettings[key];
        }
      }
      this.mobManager.dropConfig = this._mobDropSettings;
    }
    // Restore advanced world settings
    if (data.worldAdvSettings && typeof data.worldAdvSettings === 'object') {
      Object.assign(this._worldAdvSettings, data.worldAdvSettings);
      if (typeof this._worldAdvSettings.dayCycleMinutes === 'number')
        this._dayNight.halfCycleMs = this._worldAdvSettings.dayCycleMinutes * 60 * 1000 / 2;
    }
    // ── Campaign-prep: goal-star colours, scoring reset, emerald collectibles ──
    this._goalColorMap = {};
    if (Array.isArray(data.goalStars)) {
      for (const g of data.goalStars) {
        if (g && typeof g.row === 'number' && typeof g.col === 'number' && g.color) {
          this._goalColorMap[g.row + ',' + g.col] = g.color;
        }
      }
    }
    this._invalidateGoalCells();
    this._score = 0;
    this._emeraldsCollected = 0;
    this._wonExitColor = 0;
    this._emeraldsActive = false;
    if (this._worldAdvSettings.platformerEmeralds && Array.isArray(data.emeralds)
        && data.emeralds.length && typeof EMERALD_SYSTEM !== 'undefined') {
      this._levelEmeralds = data.emeralds;
      EMERALD_SYSTEM.init(this);
      this._emeraldsActive = EMERALD_SYSTEM.total > 0;
    }

    // Restore music data (Phase 13.5)
    this._restoreMusicData(data);
    this._restoreWitherAltars(data.witherAltars);

    // Snap camera to player
    this.camera.x = Math.max(0, Math.min(this.level.pixelWidth  - CANVAS_W, this.player.x - CANVAS_W / 2));
    this.camera.y = Math.max(0, Math.min(this.level.pixelHeight - CANVAS_H, this.player.y - CANVAS_H * 0.55));
  }

  _collectPlatformerItem(item) {
    item.collected = true;
    if (item.blockType) {
      const count = item.count || 1;
      for (let i = 0; i < count; i++) this.player.addBlock(item.blockType);
      const bname = BLOCK_DATA[item.blockType]?.name ?? 'item';
      this._notify(`Picked up ${count > 1 ? count + ' ' : ''}${bname}${count > 1 ? 's' : ''}!`, '#A07840', 200);
      return;
    }
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

  // Tint any Goal Star whose colour index > 0 (0 = classic gold, drawn as-is by
  // the block renderer). A translucent colour wash + a matching ring makes the
  // exit's colour readable without touching the base star sprite.
  _drawGoalColorOverlays(ctx) {
    const cells = this._getGoalCells();
    if (!cells.length) return;
    const palette = (typeof GOAL_COLORS !== 'undefined') ? GOAL_COLORS : null;
    if (!palette) return;
    const s = BLOCK_SIZE;
    for (const g of cells) {
      if (!g.color) continue;
      const entry = palette[g.color];
      if (!entry) continue;
      const sx = g.col * s - this.camera.x, sy = g.row * s - this.camera.y;
      if (sx < -s || sx > CANVAS_W + s || sy < -s || sy > CANVAS_H + s) continue;
      ctx.save();
      ctx.globalAlpha = 0.38;
      ctx.fillStyle = entry.hex;
      ctx.fillRect(sx + 2, sy + 2, s - 4, s - 4);
      ctx.globalAlpha = 1;
      ctx.lineWidth = 3;
      ctx.strokeStyle = entry.hex;
      ctx.strokeRect(sx + 2.5, sy + 2.5, s - 5, s - 5);
      ctx.restore();
    }
  }

  // Compact top-centre pill: running score and/or emerald count (platformer,
  // only when the world opts in via World Settings).
  _drawPlatformerScoreHud(ctx) {
    const aws = this._worldAdvSettings;
    const parts = [];
    if (aws.platformerScore) parts.push('★ ' + this._score);
    if (this._emeraldsActive && typeof EMERALD_SYSTEM !== 'undefined')
      parts.push('💎 ' + this._emeraldsCollected + '/' + EMERALD_SYSTEM.total);
    if (!parts.length) return;
    const label = parts.join('     ');
    ctx.save();
    ctx.font = 'bold 12px Courier New';
    const lw = ctx.measureText(label).width;
    const bx = CANVAS_W / 2 - lw / 2 - 12, by = 6;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    _roundRect(ctx, bx, by, lw + 24, 20, 5); ctx.fill();
    ctx.strokeStyle = 'rgba(255,224,102,0.5)'; ctx.lineWidth = 1;
    _roundRect(ctx, bx, by, lw + 24, 20, 5); ctx.stroke();
    ctx.fillStyle = '#FFE066';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, CANVAS_W / 2, by + 10);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  _drawPlatformerItems(ctx) {
    const icons = { pickaxe: '⛏', sword: '⚔', bow: '🏹', shield: '🛡', flint_steel: '🔥' };
    const armorIcons = { head: '⛑', chest: '🛡', legs: 'L', feet: '👟' };
    for (const it of this._platformerItems) {
      if (it.collected) continue;
      const sx = it.wx - this.camera.x;
      const sy = it.wy - this.camera.y + Math.sin(this.frameCount * 0.07 + it.phase) * 4;
      if (sx < -40 || sx > CANVAS_W + 40 || sy < -40 || sy > CANVAS_H + 40) continue;

      if (it.blockType) {
        // Block item drop (e.g. Arrow Stack)
        const bsz = 20;
        ctx.save();
        ctx.translate(sx - bsz / 2, sy - bsz / 2);
        ctx.scale(bsz / BLOCK_SIZE, bsz / BLOCK_SIZE);
        drawBlock(ctx, it.blockType, 0, 0, 0);
        ctx.restore();
        const cnt = it.count ?? 1;
        if (cnt > 1) {
          ctx.fillStyle    = 'rgba(0,0,0,0.72)';
          ctx.fillRect(sx - 10, sy + 8, 20, 10);
          ctx.fillStyle    = '#fff';
          ctx.font         = 'bold 7px Courier New';
          ctx.textAlign    = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`×${cnt}`, sx, sy + 13);
          ctx.textAlign    = 'left';
          ctx.textBaseline = 'alphabetic';
        }
        continue;
      }

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

  _drawPlatformerHUD(_ctx) {
    // Mode badge, level name, and timer moved — see _drawCoords and pause menu.
  }

  // ════════════════════════════════════════════════════════════
  // Phase 17 — Speed Runner Mode
  // ════════════════════════════════════════════════════════════

  _initSpeedRunnerMode(_options) {
    this._sr = {
      startMs:         null,   // ms when race timer started (null = pre-race)
      dead:            false,
      deathMs:         0,
      won:             false,
      finishMs:        0,
      ghostVisible:    true,
      ghostData:       null,   // loaded best ghost for playback
      ghostFrameIdx:   0,
      ghostRec:        null,   // SpeedRunnerGhost recording current run
      levelId:         null,
      distanceTraveled:0,
      lastX:           0,
      boosts: {
        timeBased:     1.0,
        distBased:     1.0,
        blockBoost:    1.0,   // reset each frame, set if touching booster
        item:          1.0,
        itemExpiresMs: 0,
        itemStack:     0,
      },
      speedItems:      [],     // {col,row,collected,bobPhase}
      goals:           [],     // {col,row}
      nameEntry:       null,   // {letters,cursor} during name entry
      nameEntryMs:     0,
      leaderboard:     null,
      showLeaderboard: false,
      _kKeyWas:        false,
      spawnX:          0,
      spawnY:          0,
      particles:       [],     // sparkle/firework particles
      srZoom:          1.0,    // current camera zoom (lerps 1.0→0.72)
      srLookAhead:     0,      // world-px look-ahead offset on camera.x
      momentum: { running: false, runStartMs: 0, runDist: 0, lastVxSign: 0 },
    };
  }

  // Expand level dimensions in-place when a saved world is larger than the default buildWorld() size.
  // Must be called before any grid data is copied in, so all set() calls land within bounds.
  _resizeLevelFromData(data) {
    const savedW = data.worldWidth  || (Array.isArray(data.grid) ? Math.max(1, ...data.grid.map(r => Array.isArray(r) ? r.length : 0)) : 0);
    const savedH = data.worldHeight || (Array.isArray(data.grid) ? data.grid.length : 0);
    if (savedW <= this.level.width && savedH <= this.level.height) return;
    const newW = Math.max(savedW, this.level.width);
    const newH = Math.max(savedH, this.level.height);
    this.level.grid        = Array.from({ length: newH }, () => new Array(newW).fill(BLOCK.AIR));
    this.level.width       = newW;
    this.level.height      = newH;
    this.level.pixelWidth  = newW * BLOCK_SIZE;
    this.level.pixelHeight = newH * BLOCK_SIZE;
    this.camera._levelW    = this.level.pixelWidth;
    this.camera._levelH    = this.level.pixelHeight;
  }

  _loadSpeedRunnerWorld(keyOrData) {
    const raw  = typeof keyOrData === 'string' ? SandboxSaves.load(keyOrData) : keyOrData;
    const data = (typeof SaveMigrations !== 'undefined') ? SaveMigrations.migrateSave(raw) : raw;
    if (!data) { this._notify('Failed to load SR level!', '#FF4444', 300); return; }

    this._resizeLevelFromData(data);

    // Apply grid from save
    if (Array.isArray(data.grid)) {
      for (let r = 0; r < data.grid.length; r++) {
        const row = data.grid[r];
        if (!Array.isArray(row)) continue;
        for (let c = 0; c < row.length; c++) this.level.set(r, c, row[c]);
      }
    }

    // Load SR world settings (base speed, boost config, etc.)
    if (data.worldAdvSettings) Object.assign(this._worldAdvSettings, data.worldAdvSettings);

    // Overlay with any SR-specific settings saved without a full world save
    if (typeof keyOrData === 'string') {
      try {
        const quick = JSON.parse(localStorage.getItem('sr_cfg_' + keyOrData) || 'null');
        if (quick) Object.assign(this._worldAdvSettings, quick);
      } catch {}
    }

    // Unique level ID for ghost + leaderboard
    this._sr.levelId = `${data.playerName || ''}:${data.worldName || ''}`;
    // Hybrid leaderboard: pull any server times for this level and merge them
    // into the local top-5 (best-effort; local stays authoritative offline).
    if (typeof SPEEDRUN_SYNC !== 'undefined') {
      SPEEDRUN_SYNC.merge(this._sr.levelId)
        .then(lb => { if (this._sr) this._sr.leaderboard = lb; })
        .catch(() => {});
    }

    // Scan grid for goals and speed items; extract speed items from grid (drawn dynamically)
    this._sr.goals      = [];
    this._sr.speedItems = [];
    for (let r = 0; r < this.level.height; r++) {
      for (let c = 0; c < this.level.width; c++) {
        const b = this.level.grid[r][c];
        if (b === BLOCK.GOAL) {
          this._sr.goals.push({ col: c, row: r });
        } else if (b === BLOCK.SPEED_ITEM) {
          this._sr.speedItems.push({ col: c, row: r, collected: false, bobPhase: Math.random() * Math.PI * 2 });
          this.level.set(r, c, BLOCK.AIR); // remove from grid; SR HUD draws these
        }
      }
    }

    // Load best ghost for this level
    this._sr.ghostData = SpeedRunnerGhost.loadData(this._sr.levelId);

    // Record spawn position
    this._sr.spawnX = this.player.x;
    this._sr.spawnY = this.player.y;
    this._sr.lastX  = this.player.x;

    // Portal links (same format as platformer mode)
    if (Array.isArray(data.portalLinks)) {
      this._normalPortals = data.portalLinks.map(p => ({
        anchorRow: p.anchorRow, anchorCol: p.anchorCol,
        biome:     p.biome,    label:     p.label,
        destLabel: p.destLabel ?? null,
      }));
    }
    // Frame walk-through / base-solid portal solidity derived from the grid.
    this._rebuildPortalObsidianFromGrid();

    // SR player setup: fast movement, no normal deaths or flight
    this.player.godMode    = true;  // SR handles its own death; godMode blocks normal damage/death-screen
    this.player.hyperSpeed = true;  // 3× base movement (applies via player._handleInput)

    // Convert spawn eggs to mob spawners (same as platformer)
    const EGG_TO_MOB = {
      zombie:'Zombie', skeleton:'Skeleton', creeper:'Creeper',
      cave_spider:'CaveSpider', piglin:'Piglin', blaze:'Blaze',
      wither_skeleton:'WitherSkeleton', enderman:'Enderman',
    };
    const eggSpawnsSr = Array.isArray(data.spawnEggs)
      ? data.spawnEggs
          .filter(e => e && typeof e.col === 'number' && EGG_TO_MOB[e.mobType])
          .map(e => ({ col: e.col, row: e.row, mobTypeName: EGG_TO_MOB[e.mobType], timer: 0, active: true }))
      : [];
    this.mobManager.setupSpawnPoints(eggSpawnsSr);

    // Register interactive redstone devices so levers/trapdoors work in SR
    for (let r = 0; r < this.level.height; r++) {
      for (let c = 0; c < this.level.width; c++) {
        const b = this.level.grid[r][c];
        if (b === BLOCK.LEVER && !this.redstone.getAt(c, r)) {
          this.redstone.addComponent({ type: 'lever', col: c, row: r, on: false, links: [] });
        } else if (b === BLOCK.TRAPDOOR && !this.redstone.getAt(c, r)) {
          this.redstone.addComponent({ type: 'trapdoor', col: c, row: r, open: false, links: [] });
        }
      }
    }

    // Snapshot the authored initial redstone state so each SR run re-arms traps /
    // pistons / levers to exactly how the designer left them (see _srRespawn).
    this._sr._redstoneInit = this.redstone.components.map(c => ({
      on: c.on, open: c.open, extended: c.extended, fuse: c.fuse,
    }));
  }

  _srGetEffectiveMultiplier() {
    const b      = this._sr.boosts;
    const now    = Date.now();
    if (now > b.itemExpiresMs && b.item !== 1.0) { b.item = 1.0; b.itemStack = 0; }
    const maxMult = this._worldAdvSettings.srMaxMultiplier ?? SR_CONFIG.maxMultiplier;
    // Normal accumulation (time/dist/item boosts) caps at maxMult. The
    // SPEED_BOOSTER block stacks ON TOP and can push above the cap, up to
    // 1.5× maxMult — so hitting a booster at max speed still speeds you up.
    const base = Math.min(b.timeBased * b.distBased * b.item, maxMult);
    return Math.min(base * b.blockBoost, maxMult * 1.5);
  }

  _updateSpeedRunner() {
    if (!this._sr) return;
    const sr = this._sr;

    // Disable flight even with godMode=true (SR is not a fly-through challenge)
    if (this.player.flying) this.player.flying = false;

    // Ghost toggle — K key
    const kNow = this.input.isDown('KeyK');
    if (kNow && !sr._kKeyWas) {
      sr.ghostVisible = !sr.ghostVisible;
      this._notify(sr.ghostVisible ? 'Ghost: ON' : 'Ghost: OFF', '#AAAAFF', 90);
    }
    sr._kKeyWas = kNow;

    // Update sparkle particles
    sr.particles = sr.particles.filter(p => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.vx *= 0.96; p.life--;
      return p.life > 0;
    });

    // ── Dead / respawn state ──────────────────────────────────
    if (sr.dead) {
      const elapsed = Date.now() - sr.deathMs;
      // Animate explosion parts
      for (const part of (sr.deathParts || [])) {
        part.x   += part.vx;
        part.y   += part.vy;
        part.vy  += 0.35;   // gravity
        part.vx  *= 0.98;   // air drag
        part.rot += part.rotV;
        if (elapsed > SR_CONFIG.respawnFadeMs)
          part.alpha = Math.max(0, part.alpha - 0.04);
      }
      if (elapsed > SR_CONFIG.respawnFadeMs + SR_CONFIG.respawnWaitMs) {
        if (this.input.isJustDown('Space') || this.input.p1JustDown('jump') ||
            this.input.isJustDown('KeyW')) {
          this._srRespawn();
        }
      }
      sr.srZoom      += (1.0 - sr.srZoom)      * 0.08;
      sr.srLookAhead += (0   - sr.srLookAhead) * 0.08;
      return;
    }

    // ── Victory state ─────────────────────────────────────────
    if (sr.won) {
      if (sr.nameEntry) {
        this._srHandleNameEntry();
      } else if (sr.showLeaderboard) {
        if (this.input.isJustDown('Space') || this.input.p1JustDown('jump') ||
            this.input.mouse.clicked) {
          sr.showLeaderboard = false;
          this.destroy();
          if (this._onReturnToMenu) this._onReturnToMenu('speedrunnerSelect');
        }
      }
      sr.srZoom      += (1.0 - sr.srZoom)      * 0.08;
      sr.srLookAhead += (0   - sr.srLookAhead) * 0.08;
      return;
    }

    // ── Pre-race: player frozen at spawn until jump pressed ──
    if (!sr.startMs) {
      // Race-light countdown (3·2·1·GO) — auto-starts; no click needed.
      if (sr.countdownStart == null) sr.countdownStart = Date.now();
      // Keep player frozen at spawn during the countdown.
      this.player.x  = sr.spawnX; this.player.y  = sr.spawnY;
      this.player.vx = 0;         this.player.vy = 0;
      sr.vx = 0; // reset accelerate-model velocity for the run
      sr.srZoom      += (1.0 - sr.srZoom)      * 0.08;
      sr.srLookAhead += (0   - sr.srLookAhead) * 0.08;
      if (Date.now() - sr.countdownStart >= SR_CONFIG.countdownMs) {
        // GREEN — race begins. Record whether accelerate was already held (so a
        // press held through the countdown doesn't earn the reaction bonus).
        sr.startMs        = Date.now();
        sr.goMs           = sr.startMs;
        sr.perfectChecked = false;
        sr.accelAtGo      = this.input.isRight() || this.input.isDown('ArrowRight')
                          || this.input.isDown('KeyD')
                          || this.input.gamepads.some(g => g && g.connected && (g.dpad1 || g.moveX > 0.3));
        sr.lastX          = this.player.x;
        sr.ghostRec       = new SpeedRunnerGhost(sr.levelId);
        sr.ghostFrameIdx  = 0;
      }
      return;
    }

    // ── Active race ───────────────────────────────────────────

    const now    = Date.now();
    const aws    = this._worldAdvSettings;
    const baseSpeed = aws.srBaseSpeed ?? 1.0;

    // ── Race-car movement: gradual accel from 0 to a FIXED max; a boost raises
    // the ceiling (reach max faster / exceed it) for its duration; releasing
    // coasts down. Forward only, no braking. No time/dist accumulation — the max
    // is fixed, so actual speed always matches the recorded ghost.
    const accel = this.input.isRight()
      || this.input.isDown('ArrowRight') || this.input.isDown('KeyD')
      || this.input.gamepads.some(g => g && g.connected && (g.dpad1 || g.moveX > 0.3));
    sr.accelHeld = accel;
    this.player.srControlled = true;   // SR owns horizontal vx (see player.js)
    if (sr.vx == null) sr.vx = Math.max(0, this.player.vx || 0);
    const SR_ACCEL  = Math.max(0.05, aws.srAccel ?? 0.5);  // fixed accel/frame (tunable)
    const SR_DECEL  = (aws.srDecel ?? 2) * SR_ACCEL;       // release decel (tunable)
    const maxSpeed  = this.player.moveSpeed * 3 * (aws.srMaxMultiplier ?? SR_CONFIG.maxMultiplier) * baseSpeed;
    sr.maxSpeed     = maxSpeed;
    // Active boost (booster block / pickup / perfect start) raises the ceiling and
    // accelerates faster; capped at 1.5× max.
    const boostMult = Math.min(1.5, Math.max(sr.boosts.blockBoost || 1, sr.boosts.item || 1));
    const effMax    = maxSpeed * boostMult;
    const accelRate = SR_ACCEL * (boostMult > 1 ? 2 : 1);
    if (accel) {
      if (sr.vx < effMax) sr.vx = Math.min(effMax, sr.vx + accelRate);
      else                sr.vx = Math.max(effMax, sr.vx - SR_DECEL); // ease down when a boost ends
    } else {
      sr.vx = Math.max(0, sr.vx - SR_DECEL);
    }
    this.player.vx = sr.vx;

    // Perfect start: a fresh accelerate press within perfectStartMs of GREEN
    // (and not held through the countdown) grants a short speed boost.
    if (!sr.perfectChecked) {
      const sinceGo = now - (sr.goMs || now);
      if (sinceGo > SR_CONFIG.perfectStartMs) {
        sr.perfectChecked = true;                       // window closed → no bonus
      } else if (accel && !sr.accelAtGo) {
        sr.boosts.item          = 1 + SR_CONFIG.perfectStartBoost;
        sr.boosts.itemExpiresMs = now + SR_CONFIG.perfectStartMsDur;
        sr.boosts.itemStack     = 1;
        sr.perfectChecked       = true;
        sr.fireUntil            = now + SR_CONFIG.perfectStartMsDur; // flame trail cue
        this._notify('⚡ PERFECT START!', '#FFDD44', 120);
      } else if (accel && sr.accelAtGo) {
        sr.perfectChecked = true;                       // held through → no reaction bonus
      }
    }

    // Perfect-start flame trail — orange/red particles streaming off the back.
    if (sr.fireUntil && now < sr.fireUntil && sr.vx > 1) {
      const p = this.player, rearX = p.x + p.width / 2 - 12;
      for (let i = 0; i < 2; i++) {
        sr.particles.push({
          x: rearX + Math.random() * 8,
          y: p.y + 10 + Math.random() * (p.height - 20),
          vx: -2 - Math.random() * 2.5,
          vy: -0.5 - Math.random() * 1.5,
          life: 12 + Math.random() * 12,
          color: ['#FF3B00', '#FF7B00', '#FFC400'][Math.floor(Math.random() * 3)],
        });
      }
    }

    // Distance moved this frame (always track for total race stats)
    const frameDx = Math.abs(this.player.x - sr.lastX);
    sr.lastX = this.player.x;
    sr.distanceTraveled += frameDx;

    // Reset block boost (re-set by _srCheckBoosterBlocks below if in contact).
    sr.boosts.blockBoost = 1.0;

    // Camera zoom driven by ACTUAL speed fraction (rest → max, exceeding on boost).
    const speedMult  = (sr.vx || 0) / (this.player.moveSpeed * 3 * baseSpeed);
    const srMaxMult  = aws.srMaxMultiplier ?? SR_CONFIG.maxMultiplier;
    const minZoomSpd = aws.srMinZoomSpeed ?? 1.0;            // -1 = zoom disabled
    const maxZoomSpd = aws.srMaxZoomSpeed ?? srMaxMult;      // null → same as speed cap

    let zoomPct = 0;
    if (minZoomSpd >= 0 && maxZoomSpd > minZoomSpd) {
      zoomPct = Math.max(0, Math.min(1, (speedMult - minZoomSpd) / (maxZoomSpd - minZoomSpd)));
    }
    sr.srZoom += (1.0 - zoomPct * 0.28 - sr.srZoom) * 0.08;
    const SR_LA_MAX = (0.40 * CANVAS_W) / 0.72 - PLAYER_W / 2; // ≈ 434 world-px at max
    const laTarget  = (sr.vx > 0.01 ? 1 : 0) * zoomPct * SR_LA_MAX;
    sr.srLookAhead += (laTarget - sr.srLookAhead) * 0.08;

    this._srCheckBoosterBlocks();
    this._srCheckJumpPads();
    this._srCheckSpeedItems();
    this._srCheckGoals();
    this._srCheckMobCollision();
    this._srCheckProjectiles();

    // Lava instant death
    const pMidRow = Math.floor(this.player.cy / BLOCK_SIZE);
    const pMidCol = Math.floor(this.player.cx / BLOCK_SIZE);
    if (this.level.get(pMidRow, pMidCol) === BLOCK.LAVA) {
      this._srTriggerDeath(); return;
    }

    // Void death
    if (this.player.y + this.player.height > this.level.pixelHeight) {
      this._srTriggerDeath(); return;
    }

    // Record ghost frame
    if (sr.ghostRec) sr.ghostRec.record(this.player);

    // Advance ghost playback
    if (sr.ghostData && sr.ghostVisible && sr.ghostData.frames.length > 0) {
      const t = Date.now() - sr.startMs;
      while (sr.ghostFrameIdx < sr.ghostData.frames.length - 1 &&
             sr.ghostData.frames[sr.ghostFrameIdx + 1].t <= t) {
        sr.ghostFrameIdx++;
      }
    }
  }

  _srCheckBoosterBlocks() {
    const p = this.player;
    const bL = Math.floor(p.x / BLOCK_SIZE);
    const bR = Math.floor((p.x + p.width  - 1) / BLOCK_SIZE);
    const bT = Math.floor(p.y / BLOCK_SIZE);
    const bB = Math.floor((p.y + p.height - 1) / BLOCK_SIZE);
    for (let r = bT; r <= bB; r++) {
      for (let c = bL; c <= bR; c++) {
        if (this.level.get(r, c) === BLOCK.SPEED_BOOSTER) {
          this._sr.boosts.blockBoost = 1.0 + SR_CONFIG.boosterBlockBoost;
          return;
        }
      }
    }
  }

  _srCheckJumpPads() {
    if (!this.player.onGround) return;
    const p     = this.player;
    const bL    = Math.floor(p.x / BLOCK_SIZE);
    const bR    = Math.floor((p.x + p.width - 1) / BLOCK_SIZE);
    const bFeet = Math.floor((p.y + p.height) / BLOCK_SIZE);
    for (let c = bL; c <= bR; c++) {
      if (this.level.get(bFeet, c) === BLOCK.JUMP_PAD) {
        this.player.vy        = this._worldAdvSettings.jumpPadVForce ?? SR_CONFIG.jumpPadVY;
        this.player.onGround  = false;
        this._playSound('sounds/jump.mp3', 0.9);
        this._srAddParticles(c * BLOCK_SIZE + BLOCK_SIZE / 2, bFeet * BLOCK_SIZE, '#90EE90', 8);
        return;
      }
    }
  }

  _srCheckSpeedItems() {
    const px = this.player.cx, py = this.player.cy;
    for (const item of this._sr.speedItems) {
      if (item.collected) continue;
      const ix = (item.col + 0.5) * BLOCK_SIZE;
      const iy = (item.row + 0.5) * BLOCK_SIZE;
      if (Math.hypot(px - ix, py - iy) >= BLOCK_SIZE * 1.2) continue;
      item.collected = true;
      const now    = Date.now();
      const boosts = this._sr.boosts;
      if (boosts.itemExpiresMs <= now) {
        boosts.itemStack     = 1;
        boosts.itemExpiresMs = now + SR_CONFIG.itemDurationMs;
      } else {
        boosts.itemStack     = Math.min(boosts.itemStack + 1, SR_CONFIG.itemStackMax);
        boosts.itemExpiresMs += SR_CONFIG.itemExtensionMs;
      }
      boosts.item = 1.0 + SR_CONFIG.itemBoost * boosts.itemStack;
      this._playSound('sounds/item-collected.mp3', 0.8);
      this._srAddParticles(ix, iy, '#FFD700', 10);
    }
  }

  _srCheckGoals() {
    const p = this.player;
    for (const g of this._sr.goals) {
      const gx = g.col * BLOCK_SIZE;
      // Full-height finish LINE: any horizontal contact with the goal's column
      // wins, at any vertical position — so a jumper is caught too. (The finish
      // spans the whole column wherever the goal block was placed.)
      if (p.x + p.width > gx && p.x < gx + BLOCK_SIZE) {
        this._srTriggerWin(); return;
      }
    }
  }

  _srCheckMobCollision() {
    const p = this.player;
    for (const mob of this.mobManager.mobs) {
      if (!mob.alive || mob.hp <= 0) continue;
      if (mob._touchesPlayer(p)) {
        this._srTriggerDeath(); return;
      }
    }
  }

  _srCheckProjectiles() {
    const p = this.player;
    // Mob arrows (godMode blocks Arrow.update's takeDamage, so we check positions here)
    for (const arr of this.mobManager.arrows) {
      if (!arr.alive || arr.isPlayerArrow) continue;
      if (arr.x > p.x && arr.x < p.x + p.width &&
          arr.y > p.y && arr.y < p.y + p.height) {
        arr.alive = false;
        this._srTriggerDeath(); return;
      }
    }
    // Blaze shots
    if (this.mobManager.blazeShots) {
      for (const bs of this.mobManager.blazeShots) {
        if (!bs.alive || bs.deflected) continue;
        if (bs.x > p.x && bs.x < p.x + p.width &&
            bs.y > p.y && bs.y < p.y + p.height) {
          bs.alive = false;
          this._srTriggerDeath(); return;
        }
      }
    }
    // Wither skulls
    if (this._wither) {
      for (const sk of (this._wither.skulls || [])) {
        if (sk.dead) continue;
        if (sk.x > p.x && sk.x < p.x + p.width &&
            sk.y > p.y && sk.y < p.y + p.height) {
          sk.dead = true;
          this._srTriggerDeath(); return;
        }
      }
    }
  }

  _srTriggerDeath() {
    if (this._sr.dead || this._sr.won) return;
    this._sr.dead     = true;
    this._sr.deathMs  = Date.now();
    this._sr.ghostRec = null;
    this._playSound('sounds/player-death.mp3');
    this._srAddParticles(this.player.cx, this.player.cy, '#FF4444', 20);

    // Build explosion — each body part is a rectangle with world-space position + physics
    const px = this.player.x, py = this.player.y;
    const partDefs = [
      { cx: px+10, cy: py+ 8, w:16, h:16, color:'#F4C78A' }, // head skin
      { cx: px+10, cy: py+ 2, w:16, h: 6, color:'#7D4E1A' }, // hair
      { cx: px+10, cy: py+26, w:12, h:16, color:'#4A8FD4' }, // torso
      { cx: px+10, cy: py+32, w:12, h: 4, color:'#2C5F8A' }, // belt
      { cx: px+ 5, cy: py+24, w: 6, h:16, color:'#4A8FD4' }, // left arm
      { cx: px+17, cy: py+24, w: 6, h:16, color:'#4A8FD4' }, // right arm
      { cx: px+ 6, cy: py+41, w: 8, h:14, color:'#2C5F8A' }, // left leg
      { cx: px+14, cy: py+41, w: 8, h:14, color:'#2C5F8A' }, // right leg
      { cx: px+ 6, cy: py+50, w: 8, h: 4, color:'#3D1C02' }, // left shoe
      { cx: px+14, cy: py+50, w: 8, h: 4, color:'#3D1C02' }, // right shoe
    ];
    this._sr.deathParts = partDefs.map(d => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * 5;
      return {
        x: d.cx, y: d.cy,
        vx:   Math.cos(angle) * speed,
        vy:   Math.sin(angle) * speed - 5, // bias upward
        rot:  (Math.random() - 0.5) * 0.4,
        rotV: (Math.random() - 0.5) * 0.22,
        w: d.w, h: d.h,
        color: d.color,
        alpha: 1.0,
      };
    });
  }

  _srTriggerWin() {
    if (this._sr.won) return;
    const elapsed      = Date.now() - this._sr.startMs;
    this._sr.won       = true;
    this._sr.finishMs  = elapsed;
    this._playSound('sounds/win.mp3');

    // Burst fireworks from player position
    for (let i = 0; i < 50; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 9;
      this._sr.particles.push({
        x: this.player.cx, y: this.player.cy,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 5,
        life: 45 + Math.random() * 50,
        color: ['#FF6B6B','#FFD700','#4ECDC4','#FFA07A','#FFFFFF'][i % 5],
      });
    }

    // Test mode (Sandbox playtest): finishing is not a real run — never save a
    // ghost or record a high score. Show the (read-only) leaderboard, then Space
    // returns to the editor (handled in _updateSpeedRunner via _onReturnToMenu).
    if (this._testMode) {
      this._sr.leaderboard     = SpeedRunnerLeaderboard.get(this._sr.levelId);
      this._sr.showLeaderboard = true;
      return;
    }

    // Save ghost if it's a new best
    if (this._sr.ghostRec) {
      this._sr.ghostRec.finish(elapsed);
      const gData = this._sr.ghostRec.toSaveData(
        this._sbPlayerName || 'Player', PLAYER_COLORS[0]
      );
      SpeedRunnerGhost.saveIfBest(gData, this._sr.levelId);
      this._sr.ghostData = SpeedRunnerGhost.loadData(this._sr.levelId);
    }

    // Show name entry or leaderboard
    if (SpeedRunnerLeaderboard.qualifies(this._sr.levelId, elapsed)) {
      // Pre-fill the arcade initials from the player's remembered value so a
      // returning player can just confirm instead of re-typing.
      const saved = (typeof srGetSavedInitials === 'function') ? srGetSavedInitials() : '';
      const letters = ['A', 'A', 'A', ''];
      for (let i = 0; i < 4; i++) if (saved[i]) letters[i] = saved[i];
      this._sr.nameEntry   = { letters, cursor: 0 };
      this._sr.nameEntryMs = elapsed;
    } else {
      this._sr.leaderboard    = SpeedRunnerLeaderboard.get(this._sr.levelId);
      this._sr.showLeaderboard = true;
    }
  }

  _srHandleNameEntry() {
    const ne = this._sr.nameEntry;
    if (!ne) return;
    if (this.input.isJustDown('ArrowLeft')  && ne.cursor > 0) ne.cursor--;
    if (this.input.isJustDown('ArrowRight') && ne.cursor < 3) ne.cursor++;
    if (this.input.isJustDown('ArrowUp')) {
      if (ne.cursor === 3 && ne.letters[3] === '') {
        ne.letters[3] = 'A';                // blank 4th → add 'A'
      } else {
        const c = ne.letters[ne.cursor].charCodeAt(0);
        ne.letters[ne.cursor] = String.fromCharCode(c === 90 ? 65 : c + 1);
      }
    }
    if (this.input.isJustDown('ArrowDown')) {
      if (ne.cursor === 3 && ne.letters[3] === 'A') {
        ne.letters[3] = '';                  // 'A' → remove optional 4th
      } else if (ne.cursor !== 3 || ne.letters[3] !== '') {
        const c = ne.letters[ne.cursor].charCodeAt(0);
        ne.letters[ne.cursor] = String.fromCharCode(c === 65 ? 90 : c - 1);
      }
    }
    if (this.input.isJustDown('Enter') || this.input.isJustDown('Space') ||
        this.input.p1JustDown('jump')) {
      const name = ne.letters.filter(l => l !== '').join('');
      this._sr.leaderboard    = SpeedRunnerLeaderboard.add(this._sr.levelId, name, this._sr.nameEntryMs);
      this._sr.nameEntry      = null;
      this._sr.showLeaderboard = true;
    }
  }

  // Shift all Speed-Runner wall-clock anchors forward by `delta` ms (used to
  // exclude paused time from the race clock and all time-based SR state).
  _srShiftClocks(delta) {
    const sr = this._sr;
    if (!sr || !delta) return;
    if (sr.startMs)        sr.startMs        += delta;
    if (sr.countdownStart) sr.countdownStart += delta;
    if (sr.goMs)           sr.goMs           += delta;
    if (sr.deathMs)        sr.deathMs        += delta;
    if (sr.boosts && sr.boosts.itemExpiresMs) sr.boosts.itemExpiresMs += delta;
  }

  // Full run restart (HUD ↺ Restart button): clear victory/death/name-entry state
  // and reset to the start line via _srRespawn (which re-runs the countdown, resets
  // boosts/items/mobs/redstone and nulls the race clock).
  _srRestartRun() {
    if (!this._sr) return;
    const sr = this._sr;
    sr.won = false;
    sr.finishMs = 0;
    sr.nameEntry = null;
    sr.showLeaderboard = false;
    sr.dead = false;
    this._srPausedAt = 0; // drop any pending pause-shift; a fresh run re-anchors the clock
    this._srRespawn();
  }

  _srRespawn() {
    const sr = this._sr;
    this.player.x  = sr.spawnX;
    this.player.y  = sr.spawnY;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.hp = this.player.maxHp;
    sr.boosts = { timeBased:1.0, distBased:1.0, blockBoost:1.0, item:1.0, itemExpiresMs:0, itemStack:0 };
    sr.momentum = { running: false, runStartMs: 0, runDist: 0, lastVxSign: 0 };
    sr.distanceTraveled = 0;
    sr.lastX  = sr.spawnX;
    for (const item of sr.speedItems) item.collected = false;
    sr.ghostRec      = null;
    sr.deathParts    = null;
    sr.dead          = false;
    sr.startMs        = null;  // re-run: countdown restarts before the race
    sr.countdownStart = null;
    sr.goMs           = null;
    sr.perfectChecked = false;
    sr.ghostFrameIdx  = 0;
    sr.vx             = 0;
    sr.fireUntil      = 0;

    // Reset the level to its authored start state so every run is identical:
    // respawn mobs (clear the field + re-ready every spawn point), clear leftover
    // drops from the last run, and re-arm redstone to its initial snapshot.
    if (this.mobManager) {
      this.mobManager.mobs = [];
      this.mobManager.droppedItems = [];
      for (const sp of this.mobManager.spawnPoints) sp.timer = 0;
    }
    if (this.redstone && sr._redstoneInit) {
      this.redstone.components.forEach((c, i) => {
        const s = sr._redstoneInit[i]; if (!s) return;
        if (s.on !== undefined)       c.on = s.on;
        if (s.open !== undefined)     c.open = s.open;
        if (s.extended !== undefined) c.extended = s.extended;
        if (s.fuse !== undefined)     c.fuse = s.fuse;
      });
    }
  }

  _srFollowCamera() {
    const sr = this._sr;
    // Hard-snap X so the player stays centred regardless of speed.
    // camera.follow() uses a 12 % lerp that falls behind at 150 %+ and lets the player run off-screen.
    const lookAhead = sr?.srLookAhead ?? 0;
    const targetX   = this.player.x + PLAYER_W / 2 - CANVAS_W / 2 + lookAhead;
    this.camera.x   = Math.max(0, Math.min(this.camera._levelW - CANVAS_W, targetX));
    // Y still lerps for smooth vertical tracking
    const targetY   = this.player.y + this.player.height / 2 - CANVAS_H * 0.55;
    this.camera.y  += (targetY - this.camera.y) * 0.10;
    this.camera.y   = Math.max(0, Math.min(this.camera._levelH - CANVAS_H, this.camera.y));
  }

  _srAddParticles(x, y, color, count = 8) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 4;
      this._sr.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        life: 20 + Math.random() * 25,
        color,
      });
    }
  }

  // World-space SR overlays — drawn INSIDE the zoom transform (called from _render before ctx.restore)
  _drawSRWorldOverlay(ctx) {
    if (!this._sr) return;
    const sr = this._sr;

    // ── Death explosion parts ──────────────────────────────────
    if (sr.dead && sr.deathParts) {
      for (const part of sr.deathParts) {
        if (part.alpha <= 0) continue;
        const sx = Math.floor(part.x - this.camera.x);
        const sy = Math.floor(part.y - this.camera.y);
        ctx.save();
        ctx.globalAlpha = part.alpha;
        ctx.translate(sx, sy);
        ctx.rotate(part.rot);
        ctx.fillStyle = part.color;
        ctx.fillRect(-part.w / 2, -part.h / 2, part.w, part.h);
        ctx.restore();
      }
    }

    // ── SR sparkle particles ───────────────────────────────────
    ctx.save();
    for (const p of sr.particles) {
      const alpha = Math.min(1, p.life / 40);
      const sz    = Math.max(1, 5 * alpha);
      ctx.globalAlpha = alpha;
      ctx.fillStyle   = p.color;
      ctx.fillRect(p.x - this.camera.x - sz/2, p.y - this.camera.y - sz/2, sz, sz);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // ── Ghost playback ─────────────────────────────────────────
    if (sr.ghostData && sr.ghostVisible && sr.startMs && !sr.dead) {
      const frames = sr.ghostData.frames;
      if (frames.length > 0) {
        const f  = frames[Math.min(sr.ghostFrameIdx, frames.length - 1)];
        const sx = f.x - this.camera.x;
        const sy = f.y - this.camera.y;
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.fillStyle   = sr.ghostData.playerColor || '#AAAAFF';
        ctx.fillRect(sx, sy, PLAYER_W, PLAYER_H);
        ctx.globalAlpha = 0.8;
        ctx.fillStyle   = '#FFFFFF';
        ctx.font        = 'bold 8px Courier New';
        ctx.textAlign   = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(sr.ghostData.playerName || 'Ghost', sx + PLAYER_W / 2, sy - 4);
        ctx.textAlign   = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.restore();
      }
    }

    // ── Speed items (floating, bobbing) ───────────────────────
    const tBob = Date.now() / 500;
    for (const item of sr.speedItems) {
      if (item.collected) continue;
      const sx = item.col * BLOCK_SIZE - this.camera.x;
      const sy = item.row * BLOCK_SIZE - this.camera.y + Math.sin(tBob + item.bobPhase) * 3;
      if (sx < -BLOCK_SIZE || sx > CANVAS_W + BLOCK_SIZE) continue;
      drawBlock(ctx, BLOCK.SPEED_ITEM, Math.floor(sx), Math.floor(sy), 0);
    }
  }

  _drawSpeedRunnerHUD(ctx) {
    if (!this._sr) return;
    const sr = this._sr;

    // ── Pre-race countdown (race lights: 3·2·1·GO) ─────────────
    if (!sr.startMs && !sr.dead && !sr.won) {
      const cd  = sr.countdownStart ? (Date.now() - sr.countdownStart) : 0;
      const CD  = SR_CONFIG.countdownMs;
      const num = Math.max(1, Math.ceil((CD - cd) / 1000));  // 3 → 2 → 1
      const lit = Math.min(3, Math.floor(cd / 1000) + 1);    // red lights lit so far
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FF6B6B'; ctx.font = 'bold 34px Courier New';
      ctx.fillText('SPEED RUNNER', CANVAS_W / 2, CANVAS_H / 2 - 78);
      const cx = CANVAS_W / 2, ly = CANVAS_H / 2 - 20, R = 20, gap = 56;
      for (let i = 0; i < 3; i++) {
        const on = i < lit;
        ctx.beginPath(); ctx.arc(cx + (i - 1) * gap, ly, R, 0, Math.PI * 2);
        ctx.fillStyle = on ? '#FF3B3B' : '#3a1a1a';
        if (on) { ctx.shadowColor = '#FF3B3B'; ctx.shadowBlur = 18; }
        ctx.fill(); ctx.shadowBlur = 0;
        ctx.strokeStyle = on ? '#FF8080' : '#552222'; ctx.lineWidth = 3; ctx.stroke();
      }
      ctx.fillStyle = '#FFDD44'; ctx.font = 'bold 54px Courier New';
      ctx.fillText(String(num), cx, CANVAS_H / 2 + 44);
      ctx.fillStyle = '#888'; ctx.font = '11px Courier New';
      ctx.fillText('Hit Accelerate the instant it turns GREEN for a perfect start  ·  [K] ghost', cx, CANVAS_H / 2 + 92);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.restore();
      return;
    }

    // ── GO! flash (first ~0.7 s of the race) ───────────────────
    if (sr.goMs && Date.now() - sr.goMs < 700) {
      const a = Math.max(0, 1 - (Date.now() - sr.goMs) / 700);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const cx = CANVAS_W / 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.arc(cx + (i - 1) * 44, 66, 15, 0, Math.PI * 2);
        ctx.fillStyle = '#2BE04B'; ctx.shadowColor = '#2BE04B'; ctx.shadowBlur = 20;
        ctx.fill(); ctx.shadowBlur = 0;
      }
      ctx.fillStyle = '#2BE04B'; ctx.font = 'bold 58px Courier New';
      ctx.fillText('GO!', cx, CANVAS_H / 2 - 20);
      ctx.globalAlpha = 1; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.restore();
    }

    // ── Dead / respawn overlay ─────────────────────────────────
    if (sr.dead) {
      const elapsed = Date.now() - sr.deathMs;
      const fadeMs  = SR_CONFIG.respawnFadeMs;
      const waitMs  = SR_CONFIG.respawnWaitMs;
      ctx.save();
      ctx.fillStyle = `rgba(0,0,0,${Math.min(0.75, elapsed / fadeMs * 0.75).toFixed(3)})`;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      if (elapsed > fadeMs) {
        ctx.fillStyle    = '#FF4444';
        ctx.font         = 'bold 28px Courier New';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('YOU DIED', CANVAS_W / 2, CANVAS_H / 2 - 40);
        ctx.fillStyle = elapsed > fadeMs + waitMs ? '#FFFFFF' : '#FFAA44';
        ctx.font      = '16px Courier New';
        ctx.fillText(
          elapsed > fadeMs + waitMs
            ? 'Press SPACE to Restart'
            : `Restarting...`,
          CANVAS_W / 2, CANVAS_H / 2 + 10
        );
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'alphabetic';
      }
      ctx.restore();
      return;
    }

    if (!sr.startMs) return;

    // ── Active race HUD ────────────────────────────────────────
    const elapsed = Date.now() - sr.startMs;

    // Large timer — center top
    const timeStr = srFormatTime(elapsed);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(CANVAS_W / 2 - 92, 6, 184, 50);
    ctx.fillStyle    = '#FFFFFF';
    ctx.font         = 'bold 36px Courier New';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(timeStr, CANVAS_W / 2, 31);
    ctx.restore();

    // Speed meter — ACTUAL character speed as a % of the world's max speed.
    // 100% = at max; a boost can push it above 100% (bar caps, % keeps counting).
    const maxSpd  = sr.maxSpeed || (this.player.moveSpeed * 3 * (this._worldAdvSettings.srMaxMultiplier ?? SR_CONFIG.maxMultiplier) * (this._worldAdvSettings.srBaseSpeed ?? 1));
    const spdPct  = maxSpd > 0 ? (sr.vx || 0) / maxSpd : 0;   // 0 → 1 (→ ~1.5 on a boost)
    const pct     = Math.max(0, Math.min(1, spdPct));
    const boosted = spdPct > 1.001;
    const meterW = 180, meterH = 14, mX = 10, mY = CANVAS_H - 40;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(mX, mY, meterW, meterH);
    const grad = ctx.createLinearGradient(mX, 0, mX + meterW, 0);
    grad.addColorStop(0,   '#FFD700');
    grad.addColorStop(0.5, '#FF9900');
    grad.addColorStop(1,   '#FF6B6B');
    ctx.fillStyle = grad;
    ctx.fillRect(mX, mY, Math.round(meterW * pct), meterH);
    if (boosted) { // boost overlay pulsing on the full bar
      ctx.fillStyle = 'rgba(120,220,255,0.45)';
      ctx.fillRect(mX, mY, meterW, meterH);
    }
    ctx.strokeStyle = boosted ? '#7BD8FF' : '#FFFFFF'; ctx.lineWidth = 1;
    ctx.strokeRect(mX, mY, meterW, meterH);
    ctx.fillStyle    = boosted ? '#7BD8FF' : '#FFFFFF';
    ctx.font         = 'bold 9px Courier New';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`SPD ${Math.round(spdPct * 100)}%${boosted ? ' ⚡' : ''}`, mX, mY - 3);
    ctx.restore();

    // Item boost timer
    const now = Date.now();
    if (sr.boosts.itemExpiresMs > now) {
      const remain = ((sr.boosts.itemExpiresMs - now) / 1000).toFixed(1);
      ctx.save();
      ctx.fillStyle    = '#FFD700';
      ctx.font         = 'bold 12px Courier New';
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(`⚡×${sr.boosts.itemStack}  ${remain}s`, 10, CANVAS_H - 50);
      ctx.restore();
    }

    // Ghost indicator (bottom right)
    if (sr.ghostData) {
      ctx.save();
      ctx.fillStyle    = sr.ghostVisible ? 'rgba(170,170,255,0.85)' : 'rgba(80,80,120,0.65)';
      ctx.font         = '9px Courier New';
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(
        `[K] Ghost:${sr.ghostVisible ? 'ON' : 'OFF'}  Best:${srFormatTime(sr.ghostData.finishMs)}`,
        CANVAS_W - 10, CANVAS_H - 10
      );
      ctx.restore();
    }

    // ── Victory overlay ────────────────────────────────────────
    if (sr.won) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Theme-aware accent (indigo in Modern, neon-cyan in Retro) read from the
      // live CSS token, with the classic gold as a fallback.
      let accent = '#FFD700';
      try {
        const rs = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
        if (rs) accent = rs;
      } catch (e) {}

      ctx.fillStyle    = accent;
      ctx.font         = 'bold 44px Courier New';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('FINISH!', CANVAS_W / 2, CANVAS_H / 2 - 90);

      ctx.fillStyle = '#FFFFFF';
      ctx.font      = 'bold 28px Courier New';
      ctx.fillText(srFormatTime(sr.finishMs), CANVAS_W / 2, CANVAS_H / 2 - 44);

      if (sr.nameEntry) {
        const ne = sr.nameEntry;
        ctx.fillStyle = accent;
        ctx.font      = 'bold 15px Courier New';
        ctx.fillText('NEW HIGH SCORE! Enter your name:', CANVAS_W / 2, CANVAS_H / 2 + 4);
        // 4 letter boxes, 4th is optional (may be empty)
        const lx = CANVAS_W / 2 - 57;
        for (let i = 0; i < 4; i++) {
          const bx = lx + i * 38, by = CANVAS_H / 2 + 26;
          const isEmpty = i === 3 && ne.letters[3] === '';
          const isActive = i === ne.cursor;
          ctx.fillStyle = isActive ? 'rgba(255,215,0,0.35)' : (isEmpty ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.12)');
          ctx.fillRect(bx - 13, by - 22, 26, 30);
          ctx.strokeStyle = isActive ? accent : (isEmpty ? '#444' : '#666');
          ctx.lineWidth   = isActive ? 2 : 1;
          ctx.strokeRect(bx - 13, by - 22, 26, 30);
          ctx.font         = 'bold 22px Courier New';
          ctx.textBaseline = 'alphabetic';
          if (isEmpty) {
            // Show dashed placeholder for optional slot
            ctx.fillStyle = isActive ? '#FFD700' : '#555';
            ctx.font      = 'bold 18px Courier New';
            ctx.fillText(isActive ? '_' : '·', bx, by);
          } else {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(ne.letters[i], bx, by);
          }
          ctx.textBaseline = 'middle';
          // "optional" label under 4th box
          if (i === 3) {
            ctx.font = '8px Courier New'; ctx.fillStyle = '#666';
            ctx.fillText('opt', bx, by + 16);
          }
        }
        ctx.fillStyle = '#999';
        ctx.font      = '10px Courier New';
        ctx.fillText('← → move  ↑ ↓ change letter  SPACE/Enter to confirm', CANVAS_W / 2, CANVAS_H / 2 + 82);

      } else if (sr.showLeaderboard && sr.leaderboard) {
        ctx.fillStyle = accent;
        ctx.font      = 'bold 16px Courier New';
        ctx.fillText('TOP TIMES', CANVAS_W / 2, CANVAS_H / 2 + 12);
        ctx.font = '13px Courier New';
        const lb = sr.leaderboard;
        for (let i = 0; i < lb.length; i++) {
          ctx.fillStyle = '#DDDDDD';
          // Show the account username in parentheses when it differs from the
          // arcade initials (server-synced entries carry it).
          const who = (lb[i].user && lb[i].user.toUpperCase() !== lb[i].name) ? `  (${lb[i].user})` : '';
          ctx.fillText(`#${i+1}  ${lb[i].name}  ${srFormatTime(lb[i].ms)}${who}`,
                       CANVAS_W / 2, CANVAS_H / 2 + 34 + i * 20);
        }
        ctx.fillStyle = '#777';
        ctx.font      = '11px Courier New';
        ctx.fillText('SPACE to continue', CANVAS_W / 2, CANVAS_H / 2 + 140);
      }

      ctx.textAlign    = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.restore();
    }
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

  // ══════════════════════════════════════════════════════════════
  // Phase 13.5 — Sound & Music System
  // ══════════════════════════════════════════════════════════════

  _initAudio() {
    // Pre-load SFX into cache for zero-latency playback
    this._preloadSounds();

    // Create the single persistent background music element
    const bg = new Audio();
    bg.loop   = false; // manual next-track selection
    bg.volume = 0;
    // Respect the global music-mute preference (toggled from the dashboard).
    if (typeof MUSIC_CONTROL !== 'undefined') bg.muted = MUSIC_CONTROL.isMuted();
    bg.addEventListener('ended', () => {
      if (!this._musicSystem.bossMusicActive && !this._musicSystem.witherMusicActive) this._advancePlaylist();
    });
    bg.addEventListener('error', () => {
      // Intro or track failed to load — advance to next available song
      if (!this._musicSystem.bossMusicActive && !this._musicSystem.witherMusicActive && !this._musicSystem.currentTrack) {
        this._advancePlaylist();
      }
    });
    // Confirms audio is actually producing sound (not just src-set). The gesture
    // fallback below keeps retrying until this fires, so a rejected/interrupted
    // first play() can no longer leave the whole session silent.
    this._musicSystem.everStarted = false;
    bg.addEventListener('playing', () => { this._musicSystem.everStarted = true; });
    this._musicSystem.bgAudio = bg;

    // Seed collected discs with all defaultUnlocked entries
    for (const [key, disc] of Object.entries(MUSIC_DISCS)) {
      if (disc.defaultUnlocked) this._collectedDiscs.add(key);
    }

    // Crossfade from menu audio (which is already playing and has unlocked autoplay)
    // into the game's playlist. If menu audio isn't available, start directly.
    const menuAudio = window._menuAudio;
    if (menuAudio && !menuAudio.paused) {
      const startVol = menuAudio.volume;
      const steps = 40;
      let count = 0;
      const iv = setInterval(() => {
        count++;
        menuAudio.volume = Math.max(0, startVol - count * (startVol / steps));
        if (count >= steps) {
          clearInterval(iv);
          menuAudio.pause();
          this._advancePlaylist();
        }
      }, 50);
    } else {
      // Menu audio wasn't playing — start straight away (reaching gameplay already
      // required a user gesture, so autoplay is unlocked in the common case).
      this._advancePlaylist();
    }

    // Resilient fallback: keep (re)starting the playlist on ANY user gesture until
    // the audio element actually fires 'playing'. Covers a blocked/interrupted
    // first play() (async crossfade, mid-flight fade, transient-activation loss),
    // which previously left in-game music silent for the whole session. The
    // listeners self-remove once sound is confirmed. Boss/wither music opts out.
    const kickMusic = () => {
      const ms = this._musicSystem;
      if (ms.everStarted) {
        document.removeEventListener('keydown',   kickMusic, true);
        document.removeEventListener('mousedown', kickMusic, true);
        return;
      }
      if (ms.bossMusicActive || ms.witherMusicActive) return;
      if (typeof MUSIC_CONTROL !== 'undefined' && MUSIC_CONTROL.isMuted()) return;
      this._advancePlaylist();
    };
    document.addEventListener('keydown',   kickMusic, true);
    document.addEventListener('mousedown', kickMusic, true);
  }

  _playIntroMusic() {
    const introFile = 'music/intro/intro.mp3';
    const bg = this._musicSystem.bgAudio;
    if (!bg) return;
    bg.src    = introFile;
    bg.volume = (this._worldAdvSettings.musicVolume ?? DEFAULT_MUSIC_VOLUME) * MAX_AUDIO_VOLUME;
    bg.loop   = false;
    const p = bg.play();
    if (p) p.catch(() => {});
    // After intro ends, start background playlist (handled by 'ended' listener → _advancePlaylist)
  }

  _advancePlaylist() {
    if (this._musicSystem.bossMusicActive || this._musicSystem.witherMusicActive) return;
    const songs = this._getEnabledSongs();
    if (!songs.length) return;
    // Exclude current track from selection if there are other options
    let choices = songs.filter(k => k !== this._musicSystem.currentTrack);
    if (!choices.length) choices = songs;
    const key = choices[Math.floor(Math.random() * choices.length)];
    this._playBackgroundTrack(key);
  }

  _getEnabledSongs() {
    // Returns all collected disc keys except dedicated boss-battle overrides (those with droppedBy set)
    return Object.keys(MUSIC_DISCS).filter(key => {
      const disc = MUSIC_DISCS[key];
      return !disc.droppedBy && this._collectedDiscs.has(key);
    });
  }

  _playBackgroundTrack(discKey) {
    const disc = MUSIC_DISCS[discKey];
    if (!disc) return;
    const bg = this._musicSystem.bgAudio;
    if (!bg) return;
    this._musicSystem.currentTrack = discKey;
    // Set src + call play() for the new track. Kept as its own fn so we can invoke
    // it SYNCHRONOUSLY from a gesture-triggered start (see below) — deferring play()
    // inside the _fadeOutMusic setInterval detached it from the user-activation
    // window, so the autoplay policy rejected it and music stayed silent (this also
    // broke the sandbox jukebox, which routes through here).
    const startTrack = () => {
      bg.src    = disc.audioFile;
      bg.loop   = false;
      bg.volume = 0;
      const p = bg.play();
      if (p) p.catch(() => {});
      this._fadeInMusic(400);
    };
    // Only cross-fade when a track is actually audible right now; otherwise start
    // immediately so play() stays within the triggering gesture.
    if (!bg.paused && bg.currentTime > 0 && bg.volume > 0) {
      this._fadeOutMusic(400, startTrack);
    } else {
      if (this._musicSystem.fadeInterval) { clearInterval(this._musicSystem.fadeInterval); this._musicSystem.fadeInterval = null; }
      startTrack();
    }
  }

  // Apply the current music volume to the live audio AND keep the global mute in
  // sync. Any volume > 0 clears a lingering title-screen mute (MUSIC_CONTROL) so
  // players can always recover audio from the in-game volume slider; volume 0
  // mutes. This is the "master mute next to the volume controls" — the slider IS it.
  _applyMusicVolume() {
    const vol = this._worldAdvSettings.musicVolume ?? DEFAULT_MUSIC_VOLUME;
    if (typeof MUSIC_CONTROL !== 'undefined') {
      const wantMuted = vol <= 0;
      if (MUSIC_CONTROL.isMuted() !== wantMuted) MUSIC_CONTROL.toggle(); // persists + applies to all live audio
    }
    const bg = this._musicSystem && this._musicSystem.bgAudio;
    if (bg) {
      bg.muted  = (typeof MUSIC_CONTROL !== 'undefined') ? MUSIC_CONTROL.isMuted() : false;
      bg.volume = vol * MAX_AUDIO_VOLUME;
    }
  }

  _preloadSounds() {
    const FILES = [
      'sounds/bow-fire.mp3','sounds/attack-sword.mp3','sounds/placing-block.mp3',
      'sounds/player-damaged.mp3','sounds/player-death.mp3','sounds/mining.mp3',
      'sounds/item-collected.mp3','sounds/chest-open.mp3','sounds/use-bed.mp3',
      'sounds/crafting-item.mp3','sounds/eat-apple.mp3',
      'sounds/lever.mp3','sounds/trapdoor.mp3','sounds/piston.mp3','sounds/pressure-plate.mp3',
      'sounds/nether-portal.mp3','sounds/enable-nether-portal.mp3',
      'sounds/placing-eye-of-ender.mp3','sounds/enable-end-portal.mp3','sounds/end-portal.mp3',
      'sounds/end-crystal-explosion.mp3',
      'sounds/explosion-tnt.mp3','sounds/explosion-creeper.mp3','sounds/explosion-bed.mp3',
      'sounds/ender-dragon.mp3','sounds/ender-dragon-fireball.mp3',
      'sounds/ender-dragon-dive.mp3','sounds/ender-dragon-wing-flap.mp3',
      'sounds/ender-dragon-defeated.mp3',
      'sounds/mob-zombie.mp3','sounds/mob-skeleton.mp3','sounds/mob-creeper.mp3',
      'sounds/mob-blaze.mp3','sounds/mob-enderman.mp3','sounds/mob-piglin.mp3',
      'sounds/mob-spider.mp3',
      'sounds/zombie-defeated.mp3','sounds/skeleton-defeated.mp3','sounds/blaze-defeated.mp3',
      'sounds/piglin-defeated.mp3','sounds/creeper-defeated.mp3',
      'sounds/enderman-defeated.mp3','sounds/spider-defeated.mp3',
    ];
    for (const f of FILES) {
      if (this._audioCache[f]) continue;
      try {
        const a = new Audio();
        a.preload = 'auto';
        a.src = f;
        this._audioCache[f] = a;
      } catch (_) {}
    }
  }

  // Smart Mobs §4 — play the player's footstep / landing SFX from the per-frame
  // movement noise events. Quiet by design (Kevin's ask); volumes are separate
  // multipliers so they can be tuned independently of other SFX. Crouch-walking
  // (sneaking) is quieter still. Files are expected at sounds/footstep.mp3 and
  // sounds/land.mp3 — missing files fail silently (see _playSound).
  _playMovementSfx(p) {
    if (!p) return;
    // No footsteps while building in the sandbox editor (test worlds run as their
    // real mode, so those still get them). Clear pending flags so they don't queue.
    if (this.gameMode === 'sandbox') { p._sfxFootstep = false; p._sfxLand = 0; return; }
    if (p._sfxFootstep) {
      p._sfxFootstep = false;
      this._playSound('sounds/footstep.mp3', (p.isSneaking ? 0.18 : 0.4) * (FOOTSTEP_SFX_VOL ?? 1));
    }
    if (p._sfxLand > 0) {
      // Scale volume with impact speed (soft hop → firmer thud), capped.
      const vm = Math.min(0.7, 0.35 + p._sfxLand / MAX_FALL_SPEED * 0.5) * (LAND_SFX_VOL ?? 1);
      p._sfxLand = 0;
      this._playSound('sounds/land.mp3', vm);
    }
  }

  _playSound(file, volMult = 1.0) {
    const vol = (this._worldAdvSettings.sfxVolume ?? DEFAULT_SFX_VOLUME) * MAX_AUDIO_VOLUME * Math.max(0, volMult);
    if (vol <= 0) return;
    try {
      let s = this._audioCache[file];
      if (s) {
        // Clone if already playing so overlapping sounds work
        if (!s.paused && s.currentTime > 0) {
          s = s.cloneNode();
          s.volume = Math.min(1, vol);
          s.play().catch(() => {});
          return;
        }
        s.currentTime = 0;
        s.volume = Math.min(1, vol);
        s.play().catch(() => {});
      } else {
        // Not pre-loaded — create and cache on first use
        const a = new Audio(file);
        a.volume = Math.min(1, vol);
        a.play().catch(() => {});
        this._audioCache[file] = a;
      }
    } catch (_) {}
  }

  _fadeOutMusic(ms, callback) {
    const bg = this._musicSystem.bgAudio;
    if (!bg) { if (callback) callback(); return; }
    if (this._musicSystem.fadeInterval) clearInterval(this._musicSystem.fadeInterval);
    const steps    = Math.max(1, Math.round(ms / 50));
    const stepVol  = bg.volume / steps;
    let   count    = 0;
    this._musicSystem.fadeInterval = setInterval(() => {
      count++;
      bg.volume = Math.max(0, bg.volume - stepVol);
      if (count >= steps || bg.volume <= 0) {
        clearInterval(this._musicSystem.fadeInterval);
        this._musicSystem.fadeInterval = null;
        bg.pause();
        bg.volume = 0;
        if (callback) callback();
      }
    }, 50);
  }

  _fadeInMusic(ms) {
    const bg        = this._musicSystem.bgAudio;
    if (!bg) return;
    const target    = (this._worldAdvSettings.musicVolume ?? DEFAULT_MUSIC_VOLUME) * MAX_AUDIO_VOLUME;
    const steps     = Math.max(1, Math.round(ms / 50));
    const stepVol   = target / steps;
    let   count     = 0;
    if (this._musicSystem.fadeInterval) clearInterval(this._musicSystem.fadeInterval);
    this._musicSystem.fadeInterval = setInterval(() => {
      count++;
      bg.volume = Math.min(target, bg.volume + stepVol);
      if (count >= steps || bg.volume >= target) {
        clearInterval(this._musicSystem.fadeInterval);
        this._musicSystem.fadeInterval = null;
        bg.volume = target;
      }
    }, 50);
  }

  _startBossMusic() {
    this._musicSystem.bossMusicActive   = true;
    this._musicSystem.lastNormalTrack   = this._musicSystem.currentTrack;
    const bossDisc = Object.entries(MUSIC_DISCS).find(([, d]) => d.category === 'boss' && d.droppedBy === 'ENDER_DRAGON');
    if (!bossDisc) return;
    const bg = this._musicSystem.bgAudio;
    if (!bg) return;
    this._fadeOutMusic(500, () => {
      bg.src    = bossDisc[1].audioFile;
      bg.loop   = true;
      bg.volume = 0;
      const p = bg.play();
      if (p) p.catch(() => {});
      this._fadeInMusic(500);
    });
  }

  _endBossMusic() {
    this._musicSystem.bossMusicActive = false;
    const bg = this._musicSystem.bgAudio;
    if (bg) bg.loop = false;
    this._fadeOutMusic(500, () => {
      const resume = this._musicSystem.lastNormalTrack;
      if (resume) this._playBackgroundTrack(resume);
      else        this._advancePlaylist();
    });
  }

  _startNetherMusic() {
    const bossTracks = Object.entries(MUSIC_DISCS).filter(([k, d]) =>
      d.category === 'boss' && !d.droppedBy && this._collectedDiscs.has(k));
    if (!bossTracks.length) return; // no boss tracks available — keep background music
    this._musicSystem.netherMusicActive = true;
    this._musicSystem.lastNormalTrack   = this._musicSystem.currentTrack;
    const [key, disc] = bossTracks[Math.floor(Math.random() * bossTracks.length)];
    const bg = this._musicSystem.bgAudio;
    if (!bg) return;
    this._fadeOutMusic(1000, () => {
      bg.src    = disc.audioFile;
      bg.loop   = true;
      bg.volume = 0;
      this._musicSystem.currentTrack = key;
      const p = bg.play();
      if (p) p.catch(() => {});
      this._fadeInMusic(1000);
    });
  }

  _stopNetherMusic() {
    this._musicSystem.netherMusicActive = false;
    const bg = this._musicSystem.bgAudio;
    if (bg) bg.loop = false;
    this._fadeOutMusic(800, () => {
      const resume = this._musicSystem.lastNormalTrack;
      if (resume) this._playBackgroundTrack(resume);
      else        this._advancePlaylist();
    });
  }

  _playVictoryMusic() {
    this._musicSystem.victoryMusicActive = true;
    this._musicSystem.bossMusicActive    = false; // prevents endBossMusic from firing
    const bg = this._musicSystem.bgAudio;
    if (bg) bg.loop = false;
    this._fadeOutMusic(800, () => {
      if (!bg) return;
      bg.src    = VICTORY_MUSIC_FILE;
      bg.loop   = false;
      bg.volume = 0;
      const p = bg.play();
      if (p) p.catch(() => {});
      this._fadeInMusic(600);
      // Clear the flag once the fanfare ends (the main 'ended' listener then resumes playlist)
      bg.addEventListener('ended', () => {
        this._musicSystem.victoryMusicActive = false;
      }, { once: true });
    });
  }

  _collectMusicDisc(discKey) {
    if (!MUSIC_DISCS[discKey]) return;
    if (this._collectedDiscs.has(discKey)) return; // already collected
    this._collectedDiscs.add(discKey);
    const disc = MUSIC_DISCS[discKey];
    this._notify(`Unlocked: ${disc.discName}! (Music Player)`, '#CC88FF', 260);
    // Add to inventory as a visual disc item
    this.player.addBlock(BLOCK.MUSIC_DISC);
  }

  _playNearbyMobSound() {
    const MOB_SOUNDS = {
      Zombie:         'sounds/mob-zombie.mp3',
      Skeleton:       'sounds/mob-skeleton.mp3',
      Creeper:        'sounds/mob-creeper.mp3',
      Blaze:          'sounds/mob-blaze.mp3',
      Enderman:       'sounds/mob-enderman.mp3',
      WitherSkeleton: 'sounds/mob-zombie.mp3',
      Piglin:         'sounds/mob-piglin.mp3',
      CaveSpider:     'sounds/mob-spider.mp3',
    };
    const nearby = this.mobManager.mobs.filter(m =>
      m.alive &&
      Math.hypot(m.cx - this.player.cx, m.cy - this.player.cy) < 600
    );
    if (!nearby.length) return;
    const mob = nearby[Math.floor(Math.random() * nearby.length)];
    const snd = MOB_SOUNDS[mob.constructor?.name] ?? MOB_SOUNDS[mob.type];
    if (snd) this._playSound(snd);
  }

  // ── Music Player block helpers ────────────────────────────────

  _nearMusicPlayer() {
    const pCx = this.player.cx, pCy = this.player.cy;
    for (const mp of this._musicPlayerBlocks.values()) {
      const bCx = (mp.col + 0.5) * BLOCK_SIZE;
      const bCy = (mp.row + 0.5) * BLOCK_SIZE;
      if (Math.hypot(bCx - pCx, bCy - pCy) <= 3 * BLOCK_SIZE) return mp;
    }
    return null;
  }

  _openMusicPlayerUI(block) {
    if (!block) return;
    if (this._musicPlayerUI) { this._musicPlayerUI = null; return; }
    this._musicPlayerUI = {
      block,
      mode: this.gameMode === 'sandbox' ? 'config' : 'jukebox',
      tempSongs: new Set(block.configuredSongs || []),
      scroll: 0,
    };
  }

  _updateMusicPlayerUI() {
    const ui = this._musicPlayerUI;
    if (!ui) return;
    const mx = this.input.mouse.x, my = this.input.mouse.y;
    const L  = this._mpLayout();

    if (this.input.isJustDown('Escape') || this.input.p1JustDown('crouch')) { this._musicPlayerUI = null; return; }

    // Determine which keys to show
    const allKeys = ui.mode === 'config'
      ? Object.keys(MUSIC_DISCS)
      : Object.keys(MUSIC_DISCS).filter(k => !MUSIC_DISCS[k].droppedBy && this._collectedDiscs.has(k));
    const totalRows  = allKeys.length;
    const maxScroll  = Math.max(0, totalRows - L.VISIBLE_ROWS);

    // Scroll wheel (runs every frame, before click-only check)
    if (this.input.scrollDelta !== 0) {
      ui.scroll = Math.max(0, Math.min(maxScroll, ui.scroll + this.input.scrollDelta));
    }

    if (!this.input.mouse.clicked) return;

    // Click outside → close
    if (mx < L.px || mx > L.px + L.pw || my < L.py || my > L.py + L.ph) {
      this._musicPlayerUI = null; return;
    }

    // Close (×) button
    if (mx >= L.px + L.pw - 24 && mx <= L.px + L.pw - 4 && my >= L.py + 4 && my <= L.py + 24) {
      this._musicPlayerUI = null; return;
    }

    // Scrollbar click — jump scroll position
    if (totalRows > L.VISIBLE_ROWS && mx >= L.SCROLL_X && mx <= L.SCROLL_X + 10 && my >= L.CONTENT_Y && my <= L.CONTENT_Y + L.CONTENT_H) {
      const frac = (my - L.CONTENT_Y) / L.CONTENT_H;
      ui.scroll = Math.round(frac * maxScroll);
      return;
    }

    // Shared: play button hit-test — works in all modes, plays track without closing panel
    const _hitPlay = (rowY) =>
      mx >= L.PLAY_BTN_X && mx <= L.PLAY_BTN_X + 20 && my >= rowY + 5 && my <= rowY + 22;

    if (ui.mode === 'config') {
      for (let i = 0; i < allKeys.length; i++) {
        const key    = allKeys[i];
        const locked = !this._collectedDiscs.has(key);
        const rowY   = L.CONTENT_Y + (i - ui.scroll) * L.ROW_H;
        if (rowY < L.CONTENT_Y - L.ROW_H || rowY > L.CONTENT_Y + L.CONTENT_H) continue;
        // Play button (unlocked tracks only)
        if (!locked && _hitPlay(rowY)) {
          if (!this._musicSystem.bossMusicActive && !this._musicSystem.witherMusicActive) this._playBackgroundTrack(key);
          return;
        }
        // Checkbox (unlocked tracks only)
        if (!locked && mx >= L.px + 14 && mx <= L.px + 26 && my >= rowY + 4 && my <= rowY + 16) {
          if (ui.tempSongs.has(key)) ui.tempSongs.delete(key);
          else                       ui.tempSongs.add(key);
          return;
        }
      }
      // Apply button
      if (mx >= L.BTN1_X && mx <= L.BTN1_X + 80 && my >= L.BTN_Y && my <= L.BTN_Y + 28) {
        ui.block.configuredSongs = [...ui.tempSongs];
        ui.block.isConfigured    = true;
        this._musicPlayerUI      = null;
        this._notify('Music Player configured!', '#CC88FF', 160);
        return;
      }
      // Cancel button
      if (mx >= L.BTN2_X && mx <= L.BTN2_X + 80 && my >= L.BTN_Y && my <= L.BTN_Y + 28) {
        this._musicPlayerUI = null;
      }

    } else {
      // Jukebox mode — clicking anywhere on a row (row area or ▶ button) plays the track
      for (let i = 0; i < allKeys.length; i++) {
        const key  = allKeys[i];
        const rowY = L.CONTENT_Y + (i - ui.scroll) * L.ROW_H;
        if (rowY < L.CONTENT_Y - L.ROW_H || rowY > L.CONTENT_Y + L.CONTENT_H) continue;
        if (my >= rowY && my <= rowY + L.ROW_H && mx >= L.px + 10 && mx <= L.PLAY_BTN_X + 20) {
          if (!this._musicSystem.bossMusicActive) {
            // Allow jukebox to override nether music; clear nether state so it doesn't restart
            if (this._musicSystem.netherMusicActive) {
              this._musicSystem.netherMusicActive = false;
              this._musicSystem.lastNormalTrack = null;
            }
            this._playBackgroundTrack(key);
            const dName = MUSIC_DISCS[key]?.discName ?? key;
            this._notify(`Now playing: ${dName}`, '#CC88FF', 180);
          }
          return; // keep panel open
        }
      }
      // Close button
      if (mx >= L.BTN2_X && mx <= L.BTN2_X + 80 && my >= L.BTN_Y && my <= L.BTN_Y + 28) {
        this._musicPlayerUI = null;
      }
    }
  }

  _mpLayout() {
    const pw = 360, ph = 340;
    const px = (CANVAS_W - pw) / 2, py = (CANVAS_H - ph) / 2;
    const CONTENT_Y    = py + 58;
    const BTN_Y        = py + ph - 44;
    const BTN1_X       = px + 16;
    const BTN2_X       = px + pw - 96;
    const ROW_H        = 28;
    const CONTENT_H    = BTN_Y - CONTENT_Y - 4;
    const VISIBLE_ROWS = Math.floor(CONTENT_H / ROW_H);
    const SCROLL_X     = px + pw - 14;   // 10px scrollbar track
    const PLAY_BTN_X   = SCROLL_X - 26;  // 20px play button, 6px gap from scrollbar
    const LIST_RIGHT   = PLAY_BTN_X - 4; // song name area ends before play button
    return { pw, ph, px, py, CONTENT_Y, BTN_Y, BTN1_X, BTN2_X, ROW_H, CONTENT_H, VISIBLE_ROWS, SCROLL_X, PLAY_BTN_X, LIST_RIGHT };
  }

  _drawMusicPlayerUI(ctx) {
    const ui = this._musicPlayerUI;
    if (!ui) return;
    const L  = this._mpLayout();

    // Determine which keys to show
    const allKeys = ui.mode === 'config'
      ? Object.keys(MUSIC_DISCS)
      : Object.keys(MUSIC_DISCS).filter(k => !MUSIC_DISCS[k].droppedBy && this._collectedDiscs.has(k));
    const totalRows  = allKeys.length;
    const maxScroll  = Math.max(0, totalRows - L.VISIBLE_ROWS);
    const scroll     = Math.max(0, Math.min(maxScroll, ui.scroll || 0));
    const curKey     = this._musicSystem.currentTrack;

    ctx.save();

    // Backdrop
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Panel
    ctx.fillStyle = '#1A1020';
    ctx.strokeStyle = '#886699'; ctx.lineWidth = 1;
    ctx.fillRect(L.px, L.py, L.pw, L.ph);
    ctx.strokeRect(L.px, L.py, L.pw, L.ph);

    // Title bar
    ctx.fillStyle = '#2A1A38';
    ctx.fillRect(L.px, L.py, L.pw, 30);

    // Close (×) button
    ctx.fillStyle = '#553355';
    ctx.fillRect(L.px + L.pw - 24, L.py + 4, 20, 20);
    ctx.fillStyle = '#FFAAFF'; ctx.font = 'bold 13px Courier New';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('×', L.px + L.pw - 14, L.py + 14);

    // Title
    ctx.font = 'bold 12px Courier New'; ctx.fillStyle = '#DDAAFF';
    ctx.textAlign = 'center';
    if (ui.mode === 'config') {
      ctx.fillText('MUSIC PLAYER — CONFIGURE', L.px + L.pw / 2, L.py + 16);
      ctx.font = '10px Courier New'; ctx.fillStyle = '#887799';
      ctx.fillText('Check songs for background rotation · Scroll to see all', L.px + L.pw / 2, L.py + 44);
    } else {
      ctx.fillText('MUSIC PLAYER', L.px + L.pw / 2, L.py + 16);
      ctx.font = '10px Courier New'; ctx.fillStyle = '#887799';
      const curName = curKey ? (MUSIC_DISCS[curKey]?.discName ?? curKey) : '(none)';
      ctx.fillText('Now Playing: ' + curName, L.px + L.pw / 2, L.py + 44);
    }

    // ── Clipped content area ───────────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.rect(L.px + 8, L.CONTENT_Y, L.pw - 22, L.CONTENT_H + L.ROW_H);
    ctx.clip();

    for (let i = 0; i < allKeys.length; i++) {
      const key    = allKeys[i];
      const disc   = MUSIC_DISCS[key];
      if (!disc) continue;
      const rowY   = L.CONTENT_Y + (i - scroll) * L.ROW_H;
      if (rowY + L.ROW_H < L.CONTENT_Y || rowY > L.CONTENT_Y + L.CONTENT_H + L.ROW_H) continue;

      if (ui.mode === 'config') {
        const locked  = !this._collectedDiscs.has(key);
        const checked = ui.tempSongs.has(key);
        // Checkbox
        ctx.fillStyle  = locked ? '#1A1A26' : (checked ? '#553377' : '#1A1020');
        ctx.strokeStyle = locked ? '#333344' : '#886699'; ctx.lineWidth = 1;
        ctx.fillRect(L.px + 14, rowY + 6, 12, 12);
        ctx.strokeRect(L.px + 14, rowY + 6, 12, 12);
        if (checked) {
          ctx.fillStyle = '#CC99FF'; ctx.font = 'bold 9px Courier New';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('✓', L.px + 20, rowY + 12);
        }
        // Song name
        const lockLabel = locked ? ' (locked)' : (MUSIC_DISCS[key].droppedBy ? ' ★' : '');
        ctx.font = '11px Courier New';
        ctx.fillStyle = locked ? '#3A3A4A' : '#CCAAFF';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(disc.discName + lockLabel, L.px + 32, rowY + 12);
        // Play button (unlocked tracks only)
        if (!locked) {
          const mx2 = this.input.mouse.x, my2 = this.input.mouse.y;
          const hov = mx2 >= L.PLAY_BTN_X && mx2 <= L.PLAY_BTN_X + 20 && my2 >= rowY + 5 && my2 <= rowY + 22;
          ctx.fillStyle = hov ? '#553377' : '#2A1A38';
          ctx.strokeStyle = '#886699'; ctx.lineWidth = 1;
          ctx.fillRect(L.PLAY_BTN_X, rowY + 5, 20, 18);
          ctx.strokeRect(L.PLAY_BTN_X, rowY + 5, 20, 18);
          ctx.fillStyle = hov ? '#FFAAFF' : '#AA88FF';
          ctx.font = '10px Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('▶', L.PLAY_BTN_X + 10, rowY + 14);
        }

      } else {
        // Jukebox row — full row is clickable
        const isPlaying = key === curKey;
        const mx2 = this.input.mouse.x, my2 = this.input.mouse.y;
        const rowHov = mx2 >= L.px + 10 && mx2 <= L.PLAY_BTN_X + 20
                    && my2 >= rowY && my2 <= rowY + L.ROW_H;
        const rowW = L.PLAY_BTN_X + 20 - (L.px + 10);
        ctx.fillStyle = isPlaying ? 'rgba(100,50,150,0.45)'
                      : rowHov    ? 'rgba(80,40,120,0.4)'
                      :             'rgba(30,10,50,0.4)';
        ctx.fillRect(L.px + 10, rowY + 2, rowW, 24);
        if (isPlaying || rowHov) {
          ctx.strokeStyle = isPlaying ? '#886699' : '#664488'; ctx.lineWidth = 1;
          ctx.strokeRect(L.px + 10, rowY + 2, rowW, 24);
        }
        ctx.fillStyle = isPlaying ? '#FFAAFF' : rowHov ? '#DDBBFF' : '#CCAAFF';
        ctx.font = isPlaying ? 'bold 11px Courier New' : '11px Courier New';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText((isPlaying ? '▶ ' : '   ') + disc.discName, L.px + 16, rowY + 14);
        // ▶ button on right
        const btnHov = mx2 >= L.PLAY_BTN_X && mx2 <= L.PLAY_BTN_X + 20 && my2 >= rowY + 5 && my2 <= rowY + 22;
        ctx.fillStyle = btnHov ? '#553377' : '#2A1A38';
        ctx.strokeStyle = '#886699'; ctx.lineWidth = 1;
        ctx.fillRect(L.PLAY_BTN_X, rowY + 5, 20, 18);
        ctx.strokeRect(L.PLAY_BTN_X, rowY + 5, 20, 18);
        ctx.fillStyle = btnHov ? '#FFAAFF' : '#AA88FF';
        ctx.font = '10px Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('▶', L.PLAY_BTN_X + 10, rowY + 14);
      }
    }

    if (ui.mode === 'jukebox' && allKeys.length === 0) {
      ctx.fillStyle = '#554466'; ctx.font = '10px Courier New';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('No music discs collected yet', L.px + L.pw / 2, L.CONTENT_Y + 30);
    }

    ctx.restore(); // end clip

    // ── Scrollbar ────────────────────────────────────────────────
    if (totalRows > L.VISIBLE_ROWS) {
      const trackH  = L.CONTENT_H;
      const thumbH  = Math.max(16, Math.round(trackH * L.VISIBLE_ROWS / totalRows));
      const thumbY  = L.CONTENT_Y + (maxScroll > 0 ? Math.round((trackH - thumbH) * scroll / maxScroll) : 0);
      ctx.fillStyle = '#221A2E';
      ctx.fillRect(L.SCROLL_X, L.CONTENT_Y, 10, trackH);
      ctx.fillStyle = '#886699';
      ctx.fillRect(L.SCROLL_X, thumbY, 10, thumbH);
    }

    // ── Buttons ─────────────────────────────────────────────────
    const _drawBtn = (bx, by, bw, bh, label, bg, fg) => {
      ctx.fillStyle = bg; ctx.strokeStyle = '#886699'; ctx.lineWidth = 1;
      ctx.fillRect(bx, by, bw, bh); ctx.strokeRect(bx, by, bw, bh);
      ctx.fillStyle = fg; ctx.font = 'bold 11px Courier New';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, bx + bw / 2, by + bh / 2);
    };

    if (ui.mode === 'config') {
      _drawBtn(L.BTN1_X,     L.BTN_Y, 80, 28, 'Apply',  '#2A3A22', '#88FF66');
      _drawBtn(L.BTN2_X,     L.BTN_Y, 80, 28, 'Cancel', '#2A1A20', '#AA8888');
    } else {
      _drawBtn(L.BTN2_X,     L.BTN_Y, 80, 28, 'Close',  '#2A1A20', '#AA8888');
    }

    // Credits
    ctx.font = '8px Courier New'; ctx.fillStyle = '#443355';
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('Music by @LaudividniMusic and @T_en_M', L.px + L.pw / 2, L.py + L.ph - 6);

    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  // ── Music persistence helpers ─────────────────────────────────

  _restoreMusicData(data) {
    // Restore collected discs from sandbox save
    if (Array.isArray(data.collectedDiscs)) {
      for (const d of data.collectedDiscs) {
        if (MUSIC_DISCS[d]) this._collectedDiscs.add(d);
      }
    }
    // Restore music player block configs
    if (Array.isArray(data.musicPlayerBlocks)) {
      for (const mp of data.musicPlayerBlocks) {
        if (typeof mp.col === 'number' && typeof mp.row === 'number') {
          this._musicPlayerBlocks.set(`${mp.col},${mp.row}`, {
            col: mp.col, row: mp.row,
            isConfigured:   !!mp.isConfigured,
            configuredSongs: Array.isArray(mp.configuredSongs) ? mp.configuredSongs : [],
          });
        }
      }
    }
    // Also scan the loaded grid and register any MUSIC_PLAYER block not already in
    // the registry. Sandbox self-registers blocks on click, but normal/platformer
    // only had the saved configs — a block placed but never configured wouldn't be
    // in _musicPlayerBlocks, so _nearMusicPlayer() found nothing and the jukebox
    // never opened. This makes every Music Player block interactable in all modes.
    if (this.level && this.level.grid) {
      for (let r = 0; r < this.level.height; r++) {
        for (let c = 0; c < this.level.width; c++) {
          if (this.level.grid[r][c] === BLOCK.MUSIC_PLAYER) {
            const k = `${c},${r}`;
            if (!this._musicPlayerBlocks.has(k)) {
              this._musicPlayerBlocks.set(k, { col: c, row: r, isConfigured: false, configuredSongs: [] });
            }
          }
        }
      }
    }
  }

  _restoreWitherAltars(savedArray) {
    this._witherAltars = [];
    if (!Array.isArray(savedArray)) return;
    for (const a of savedArray) {
      if (typeof a.anchorRow !== 'number' || typeof a.anchorCol !== 'number') continue;
      this._witherAltars.push({
        anchorRow: a.anchorRow,
        anchorCol: a.anchorCol,
        skulls: Array.isArray(a.skulls) ? a.skulls.map(Boolean) : [false, false],
        sand:   Array.isArray(a.sand)   ? a.sand.map(Boolean)   : [false, false, false, false],
      });
    }
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
