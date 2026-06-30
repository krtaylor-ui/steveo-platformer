// ============================================================
// test-world.js — Universal Test World (Phase 3A.3)
// ------------------------------------------------------------
// Launches the CURRENTLY EDITED world in any game mode as a throwaway instance:
// no Supabase save, no leaderboard recording, no autosave. The game shows a
// "🧪 TEST" badge and Esc returns straight to the editor (Game._testMode handles
// the no-persistence + Esc-exit behaviour). Works for all four modes because the
// Game constructor accepts `options.templateData` for sandbox/normal/platformer/
// speedrunner (game.js ~453/489/497/514).
// ============================================================

const TEST_WORLD = {
  // Open the "test in which mode?" modal.
  open() {
    if (!window.game) { alert('Open a world first.'); return; }
    const modal = document.getElementById('test-world-modal');
    if (!modal) { return; }
    modal.style.display = 'flex';
  },

  hide() {
    const modal = document.getElementById('test-world-modal');
    if (modal) modal.style.display = 'none';
  },

  // mode: 'normal' | 'platformer' | 'speedrunner' | 'arena'
  choose(mode) {
    this.hide();
    if (mode === 'arena' && typeof ARENA_SELECT !== 'undefined' && ARENA_SELECT.chooseMode) {
      // Arena also needs a game type — reuse the picker, then launch.
      ARENA_SELECT.chooseMode((gameMode) => this._launch('arena', gameMode));
    } else {
      this._launch(mode, null);
    }
  },

  _launch(mode, arenaGameMode) {
    if (!window.game) return;
    const wid = (typeof SANDBOX_UI !== 'undefined') ? SANDBOX_UI.selectedWorldId : null;
    const worldData = (typeof GAME_STATE !== 'undefined') ? GAME_STATE.serialize(window.game) : null;

    if (window.menu && typeof window.menu._stop === 'function') window.menu._stop();
    if (typeof window.game.destroy === 'function') window.game.destroy();
    const hud = document.getElementById('sandbox-editor-hud');
    if (hud) hud.style.display = 'none';

    const options = { testMode: true };
    if (worldData) options.templateData = worldData;
    if (arenaGameMode) options.arenaGameMode = arenaGameMode;

    window.game = new Game(mode, options, () => {
      window.game = null;
      // Back to the editor on the same world (no changes persisted from the test).
      if (wid && typeof SANDBOX_UI !== 'undefined' && SANDBOX_UI.editWorld) SANDBOX_UI.editWorld(wid);
      else if (typeof SANDBOX_UI !== 'undefined' && SANDBOX_UI._returnToBrowser) SANDBOX_UI._returnToBrowser();
    });
  },
};

if (typeof window !== 'undefined') window.TEST_WORLD = TEST_WORLD;
