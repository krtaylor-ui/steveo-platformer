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

      // Reveal canvas, show HUD
      document.getElementById('game-selection-screen').style.display = 'none';
      document.getElementById('play-hud').style.display = 'flex';
      document.getElementById('play-hud-title').textContent = this.gameName;

      // Build options for Game constructor
      const gameData = record.game_data || {};
      const options  = { templateData: gameData };
      // Normal / platformer still expect world:'adventure' so their level generation
      // runs before the templateData override replaces the grid.
      if (this.gameMode === 'normal' || this.gameMode === 'platformer') {
        options.world = 'adventure';
      }

      // Create the game — _loadNormalWorld / _loadPlatformerWorld runs inside constructor
      window.game = new Game(this.gameMode, options, () => this._onGameExit());

      // Apply saved player position, health, inventory on top of world load
      GAME_STATE.deserialize(window.game, gameData);

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

    screen.style.display = 'flex';

    const startBtn = document.getElementById('startup-start-btn');

    const begin = () => {
      screen.style.display = 'none';
      document.removeEventListener('keydown', onKey);
      if (startBtn) startBtn.removeEventListener('click', begin);
      // Unpause — the (already-running, pause-aware) timer resumes counting.
      if (window.game) window.game.state = 'playing';
    };
    const onKey = (e) => {
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); begin(); }
    };

    document.addEventListener('keydown', onKey);
    if (startBtn) startBtn.addEventListener('click', begin);
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

    if (pauseBtn) {
      pauseBtn.onclick = () => this._togglePause();
    }
    if (exitBtn) {
      exitBtn.onclick = () => this._exitGame();
    }
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

    // Reset pause button label for next session
    const pauseBtn = document.getElementById('play-hud-pause');
    if (pauseBtn) pauseBtn.textContent = 'Pause';

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
