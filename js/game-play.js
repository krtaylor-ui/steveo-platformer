// ============================================================
// game-play.js — Load a game from API, launch Game, handle HUD
// ============================================================

const GAME_PLAY = {
  gameId:   null,
  gameName: null,
  gameMode: null,

  // ════════════════════════════════════════════════════════════
  // INIT: Fetch game record, construct Game, begin auto-save
  // ════════════════════════════════════════════════════════════
  async init(gameId) {
    try {
      this.gameId = gameId;
      this._showLoader(true);

      const response = await AUTH.authedFetch(`/api/games/${gameId}`);

      if (!response.ok) throw new Error('Failed to load game');
      const record = await response.json();

      this.gameName = record.game_name;
      // DB stores uppercase mode ('NORMAL') → game.js uses lowercase ('normal')
      this.gameMode = record.mode.toLowerCase();

      // Stop the legacy menu render/click loop (started on page load) so it
      // doesn't draw and handle clicks on top of the game → flicker + ghost
      // buttons. Also tear down any lingering Game loop before starting a new one.
      if (window.menu && typeof window.menu._stop === 'function') window.menu._stop();
      if (window.game && typeof window.game.destroy === 'function') window.game.destroy();

      // Build options for Game constructor
      const gameData = record.game_data || {};

      // ── Engine dispatch by viewMode ──────────────────────────────────────
      // Overhead worlds run on the top-down engine (OverheadGame), not the side-scroll
      // Game. Hand the whole session to OVERHEAD_PLAY, which has its own world-load,
      // controller-setup, pause and exit flow. Side-scroll continues below unchanged.
      // Detect overhead robustly: viewMode is the primary signal, but an overhead world
      // ALWAYS has a mapSnapshot (grid/ground/elevation) that side-scroll worlds never carry —
      // so fall back to that in case viewMode was dropped by an older save/copy path. Without
      // this fallback an overhead world silently loads as a generic 2D adventure level
      // (Kevin, build 411 — "picked an overhead world, a 2D world showed up").
      const wd = (gameData && gameData.world_data) ? gameData.world_data : gameData;
      const isOverhead = !!(wd && (wd.viewMode === 'overhead' || wd.mapSnapshot)) ||
        gameData.viewMode === 'overhead' || !!gameData.mapSnapshot;
      try { console.log('[GamePlay] engine dispatch →', isOverhead ? 'OVERHEAD' : 'side-scroll',
        '(mode', this.gameMode + ', viewMode', (wd && wd.viewMode) + ', mapSnapshot', !!(wd && wd.mapSnapshot) + ')'); } catch (_) {}
      if (isOverhead) {
        if (typeof OVERHEAD_PLAY === 'undefined' || typeof OverheadGame === 'undefined') {
          alert('Overhead engine not loaded — please hard-reload.'); this._goBackToSelection(); return;
        }
        this._showLoader(false);
        return OVERHEAD_PLAY.init({
          gameId: this.gameId, gameName: this.gameName, gameMode: this.gameMode,
          record, gameData, onExit: () => this._onGameExit(),
        });
      }

      // Reveal canvas, show HUD (side-scroll)
      document.getElementById('game-selection-screen').style.display = 'none';
      document.getElementById('play-hud').style.display = 'flex';
      document.getElementById('play-hud-title').textContent = this.gameName;
      // A game that has never been played reads as "new" → start fresh at the world's
      // spawn point; an in-progress game restores the saved position/loadout ("Continue").
      // last_played_at is meant to be null until the first save, but the DB column may
      // DEFAULT now() on insert, so also treat last_played_at ≈ created_at as never-saved.
      // Restarted this session (client marker) → force fresh even if the server hasn't
      // re-stamped the record yet (redeploy lag).
      const wasRestarted = typeof GAME_SELECTION !== 'undefined' &&
        GAME_SELECTION._justRestarted && GAME_SELECTION._justRestarted.has(String(gameId));
      const isNew = wasRestarted || !gameData.playerProgress ||
        !record.last_played_at ||
        (record.created_at && (new Date(record.last_played_at) - new Date(record.created_at)) < 3000);
      // Once we actually play it, it's no longer "just restarted" (a save will give it real
      // progress); drop the marker so a later visit reflects true state.
      if (wasRestarted) GAME_SELECTION._justRestarted.delete(String(gameId));
      const options  = { templateData: gameData, newGame: isNew };
      // Normal / platformer still expect world:'adventure' so their level generation
      // runs before the templateData override replaces the grid.
      if (this.gameMode === 'normal' || this.gameMode === 'platformer') {
        options.world = 'adventure';
      }

      // Create the game — _loadNormalWorld / _loadPlatformerWorld runs inside constructor
      window.game = new Game(this.gameMode, options, () => this._onGameExit());

      // Apply saved player position, health, inventory on top of world load (a NEW game
      // skips this so it spawns at the designed spawn point, not the editor position).
      GAME_STATE.deserialize(window.game, gameData, { newGame: isNew });

      // Start the play-time tracker for THIS game. Session resets to 0; the
      // total continues from the loaded save. It's pause-aware, so it won't
      // count while the config splash holds the game paused below.
      if (typeof GAME_TIMER !== 'undefined') GAME_TIMER.init(window.game);

      // Start 10-second auto-save loop
      AUTO_SAVE.start(this.gameId);
      this._setupHudButtons();

      // Hold the game on a config splash until the player chooses to start.
      this._showStartupScreen(window.game);

    } catch (err) {
      console.error('[GamePlay] Init error:', err);
      alert('Failed to load game. Please try again.');
      this._goBackToSelection();
    } finally {
      this._showLoader(false);
    }
  },

  // ════════════════════════════════════════════════════════════
  // STARTUP SCREEN: Pause the game and show its world config until
  // the player presses Space / the Start button. Starts the timer.
  // ════════════════════════════════════════════════════════════
  _showStartupScreen(game) {
    const screen = document.getElementById('game-config-startup');
    // No splash element (or no game) → game just stays playing (timer counts).
    if (!screen || !game) return;

    // Freeze the freshly-built game until the player starts (timer is
    // pause-aware, so the session clock holds at 0:00 until they begin).
    game.state = 'paused';

    const aws = game._worldAdvSettings || {};
    const g   = aws.physicsGravity ?? 0.66;
    const gravityLabel = g <= 0.45 ? 'Low (floaty)' : g >= 0.75 ? 'High (heavy)' : 'Normal';
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    set('startup-world-name', this.gameName || 'World');
    set('startup-world-mode', `Game Mode: ${this._modeLabel(this.gameMode)}`);
    set('startup-gravity', gravityLabel);
    set('startup-jump-height', aws.jumpHeightBlocks ? `${aws.jumpHeightBlocks} blocks` : '~3.5 blocks (default)');
    set('startup-air-jump', aws.airJumpEnabled ? '✅ Enabled' : '❌ Disabled');
    set('startup-sprint', aws.sprintEnabled !== false ? '✅ Enabled' : '❌ Disabled');

    // (§1c) Per-session companion chooser — shown for the companion-capable modes reachable
    // via this splash (Platformer / Normal). Pre-filled from the world's saved value; the
    // choice made here overrides _worldAdvSettings.companionBot / .p2Char at Start. Safe
    // because the companion is spawned lazily on the first unpaused tick, AFTER begin().
    const companionCapable = this.gameMode === 'platformer' || this.gameMode === 'normal';
    const compBlock   = document.getElementById('startup-companion');
    const compModeSel = document.getElementById('startup-companion-mode');
    const compCharSel = document.getElementById('startup-companion-char');
    const compCharRow = document.getElementById('startup-companion-char-row');
    if (compBlock) compBlock.style.display = companionCapable ? '' : 'none';
    if (companionCapable && compModeSel) {
      compModeSel.value = ['EASY', 'MEDIUM', 'HARD'].includes(aws.companionBot) ? aws.companionBot : 'off';
      if (compCharSel) compCharSel.value = (aws.p2Char === 'female') ? 'female' : 'male';
      const syncCharRow = () => { if (compCharRow) compCharRow.style.display = (compModeSel.value === 'off') ? 'none' : ''; };
      syncCharRow();
      compModeSel.onchange = syncCharRow;
    }

    screen.style.display = 'flex';

    const startBtn = document.getElementById('startup-start-btn');
    const backBtn  = document.getElementById('startup-back-btn');

    const cleanup = () => {
      screen.style.display = 'none';
      document.removeEventListener('keydown', onKey);
      if (startBtn) startBtn.removeEventListener('click', begin);
      if (backBtn)  backBtn.removeEventListener('click', goBack);
    };
    const begin = () => {
      cleanup();
      const g = window.game;
      // (§1c) Apply the per-session companion choice (overrides the world's saved value)
      // before unpausing — _maybeSetupCompanion() reads these on the next tick.
      if (g && companionCapable && compModeSel) {
        g._worldAdvSettings.companionBot = compModeSel.value;   // 'off' | 'EASY' | 'MEDIUM' | 'HARD'
        if (compModeSel.value !== 'off' && compCharSel) g._worldAdvSettings.p2Char = compCharSel.value;
      }
      // Unpause — the (already-running, pause-aware) timer resumes counting.
      if (g) g.state = 'playing';
    };
    // Go Back: abort before playing — tear down the freshly-built game and
    // return to the game-selection screen (same as a normal exit).
    const goBack = () => {
      cleanup();
      if (window.game && typeof window.game.destroy === 'function') window.game.destroy();
      this._onGameExit();
    };
    const onKey = (e) => {
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); begin(); }
      else if (e.code === 'Escape') { e.preventDefault(); goBack(); }
    };

    document.addEventListener('keydown', onKey);
    if (startBtn) startBtn.addEventListener('click', begin);
    if (backBtn)  backBtn.addEventListener('click', goBack);
  },

  _modeLabel(mode) {
    return { normal: 'Normal', platformer: 'Platformer', speedrunner: 'Speed Runner', sandbox: 'Sandbox' }[mode]
      || (mode ? mode[0].toUpperCase() + mode.slice(1) : 'Normal');
  },

  // ════════════════════════════════════════════════════════════
  // HUD BUTTONS: Wire up Pause and Exit
  // ════════════════════════════════════════════════════════════
  _setupHudButtons() {
    const pauseBtn = document.getElementById('play-hud-pause');
    const exitBtn  = document.getElementById('play-hud-exit');
    const restartBtn = document.getElementById('play-hud-restart');

    if (pauseBtn) {
      pauseBtn.onclick = () => this._togglePause();
    }
    if (exitBtn) {
      exitBtn.onclick = () => this._exitGame();
    }
    // Restart button — Speed Runner only (restarts the run to its start line).
    if (restartBtn) {
      restartBtn.style.display = (this.gameMode === 'speedrunner') ? '' : 'none';
      restartBtn.onclick = () => this._restartSpeedRun();
    }
  },

  // ════════════════════════════════════════════════════════════
  // RESTART (Speed Runner): reset the run to the start line + timer,
  // without leaving the game. Unpauses first if paused.
  // ════════════════════════════════════════════════════════════
  _restartSpeedRun() {
    const g = window.game;
    if (!g || g.gameMode !== 'speedrunner' || typeof g._srRestartRun !== 'function') return;
    if (g.state === 'paused') {
      g.state = 'playing';
      const pb = document.getElementById('play-hud-pause');
      if (pb) pb.textContent = 'Pause';
    }
    g._srRestartRun();
  },

  // ════════════════════════════════════════════════════════════
  // PAUSE: Toggle game pause state
  // ════════════════════════════════════════════════════════════
  _togglePause() {
    if (!window.game) return;
    const isPaused = window.game.state === 'paused';
    window.game.state = isPaused ? 'playing' : 'paused';

    const btn = document.getElementById('play-hud-pause');
    if (btn) btn.textContent = isPaused ? 'Pause' : 'Resume';
  },

  // ════════════════════════════════════════════════════════════
  // EXIT: Stop auto-save and return to game selection
  // ════════════════════════════════════════════════════════════
  async _exitGame() {
    // Stop the timer first so the live total is on the game object before the
    // final auto-save serializes it.
    if (typeof GAME_TIMER !== 'undefined') GAME_TIMER.stop();
    AUTO_SAVE.stop();
    // Brief wait so the in-flight final save request can dispatch
    await new Promise(r => setTimeout(r, 350));
    // The HUD Exit button bypasses the game's own Esc→Exit teardown, so stop
    // the game loop explicitly to avoid a lingering loop on the next play.
    if (window.game && typeof window.game.destroy === 'function') window.game.destroy();
    window.game = null;
    this._goBackToSelection();
  },

  // Called when the game itself triggers exit (Esc → Exit Game in pause menu)
  _onGameExit() {
    if (typeof GAME_TIMER !== 'undefined') GAME_TIMER.stop();
    AUTO_SAVE.stop();
    // Game already called destroy() before this callback; just drop the ref.
    window.game = null;
    this._goBackToSelection();
  },

  // ════════════════════════════════════════════════════════════
  // NAVIGATION: Tear down play view, return to slot list
  // ════════════════════════════════════════════════════════════
  _goBackToSelection() {
    document.getElementById('play-hud').style.display = 'none';
    document.getElementById('game-selection-screen').style.display = 'block';

    // Reset pause button label + hide the SR-only restart button for next session
    const pauseBtn = document.getElementById('play-hud-pause');
    if (pauseBtn) pauseBtn.textContent = 'Pause';
    const restartBtn = document.getElementById('play-hud-restart');
    if (restartBtn) restartBtn.style.display = 'none';

    // Ensure static listeners exist (idempotent), sync the heading to the
    // played game's mode, and refresh the slot list — _loadGames() re-renders
    // slots and rebinds their per-button listeners.
    GAME_SELECTION._setupStaticListeners();
    GAME_SELECTION._updateModeTitle();
    GAME_SELECTION._loadGames();
  },

  // ════════════════════════════════════════════════════════════
  // LOADER: Show / hide loading overlay
  // ════════════════════════════════════════════════════════════
  _showLoader(visible) {
    const el = document.getElementById('game-loading-overlay');
    if (el) el.style.display = visible ? 'flex' : 'none';
  },
};
