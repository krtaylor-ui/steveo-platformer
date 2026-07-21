// ============================================================
// test-world.js — Universal Test World (Phase 3A.3, HUD refresh build 57)
// ------------------------------------------------------------
// Launches the CURRENTLY EDITED world in any game mode as a throwaway instance:
// no Supabase save, no leaderboard/high-score recording, no autosave. While a
// test runs, an always-on-top #test-hud shows two buttons — ↺ Restart and
// ← Return to Sandbox — so there's a clear exit in every mode (the old canvas
// ✕ button was skipped by the Speed-Runner HUD). Esc also exits to the editor.
// The edited world is captured ONCE so Restart replays the exact same layout.
// ============================================================

const TEST_WORLD = {
  _data: null,   // serialized editor world (captured once per test session)
  _wid: null,    // sandbox world id to reopen on exit

  open() {
    if (!window.game) { alert('Open a world first.'); return; }
    const modal = document.getElementById('test-world-modal');
    if (modal) modal.style.display = 'flex';
  },

  hide() {
    const modal = document.getElementById('test-world-modal');
    if (modal) modal.style.display = 'none';
  },

  // Snapshot/restore the editor player's loadout so a test round-trip doesn't
  // wipe the hotbar. Deep-copies slot objects so the live arrays aren't shared.
  _captureLoadout(p) {
    if (!p) return null;
    return {
      hotbar:    (p.hotbar    || []).map((s) => (s ? { ...s } : null)),
      inventory: (p.inventory || []).map((s) => (s ? { ...s } : null)),
      selectedSlot: p.selectedSlot,
      sword: p.sword, bow: p.bow, pickaxe: p.pickaxe,
      hasShield: p.hasShield, hasFlintSteel: p.hasFlintSteel,
    };
  },
  _restoreLoadout(p, L) {
    if (!p || !L) return;
    p.hotbar    = L.hotbar.map((s) => (s ? { ...s } : null));
    p.inventory = L.inventory.map((s) => (s ? { ...s } : null));
    p.selectedSlot = L.selectedSlot ?? 0;
    p.sword = L.sword; p.bow = L.bow; p.pickaxe = L.pickaxe;
    p.hasShield = L.hasShield; p.hasFlintSteel = L.hasFlintSteel;
  },

  // mode: 'normal' | 'platformer' | 'speedrunner' | 'arena'
  choose(mode) {
    this.hide();
    // Capture the edited world ONCE (from the live editor) so Restart replays it.
    this._wid  = (typeof SANDBOX !== 'undefined') ? SANDBOX.selectedWorldId : null;
    this._data = (typeof GAME_STATE !== 'undefined' && window.game) ? GAME_STATE.serialize(window.game) : null;
    // Preserve the editor player's hotbar/inventory across the test round-trip.
    this._loadout = this._captureLoadout(window.game && window.game.player);
    if (mode === 'arena' && typeof ARENA_SELECT !== 'undefined' && ARENA_SELECT.chooseMode) {
      // Arena also needs a game type — reuse the picker, then launch.
      ARENA_SELECT.chooseMode((gameMode) => this._launch('arena', gameMode));
    } else {
      this._launch(mode, null);
    }
  },

  _launch(mode, arenaGameMode) {
    if (window.menu && typeof window.menu._stop === 'function') window.menu._stop();
    if (window.game && typeof window.game.destroy === 'function') window.game.destroy();
    const hud = document.getElementById('sandbox-editor-hud');
    if (hud) hud.style.display = 'none';

    const options = { testMode: true };
    if (this._data) options.templateData = this._data;
    if (arenaGameMode) options.arenaGameMode = arenaGameMode;

    // Exit → back to the editor on the same world (nothing from the test persists).
    // Used by the ← Return button, Esc, the pause menu, and natural end screens.
    // CRITICAL: destroy the running test game first. The ← Return button calls this
    // directly (not via a Game handler that already destroyed), and Game._loop keeps
    // re-scheduling itself off `this` — nulling window.game does NOT stop it. Without
    // the destroy() the old test game keeps looping and rendering ON TOP of the new
    // Sandbox editor, so you appear "stuck" in the mode you were playing.
    let _exited = false;
    const exit = () => {
      if (_exited) return; // guard against double-exit (button + Game handler)
      _exited = true;
      this._hideControls();
      if (window.game && typeof window.game.destroy === 'function') {
        try { window.game.destroy(); } catch (e) { if (typeof console !== 'undefined') console.error('test-world exit destroy error (ignored):', e); }
      }
      window.game = null;
      // Reopen the editor on the same world; fall back to the world browser if the
      // id wasn't captured. (The object is `SANDBOX` — referencing the old wrong
      // name SANDBOX_UI here silently no-op'd both paths and froze the exit.)
      const loadout = this._loadout;
      if (this._wid && typeof SANDBOX !== 'undefined' && SANDBOX.editWorld) {
        // §Phase A — reopen the editor from the IN-MEMORY snapshot captured at test-start
        // (`this._data`), NOT a re-fetch of the saved file, so UNSAVED edits (World
        // Settings, placed blocks/items) survive the test round-trip. Was `editWorld(wid)`
        // which re-read the stale file and silently discarded everything not yet Saved.
        // editWorld is async — restore the pre-test hotbar once the editor reloads.
        Promise.resolve(SANDBOX.editWorld(this._wid, this._data)).then(() => {
          this._restoreLoadout(window.game && window.game.player, loadout);
        }).catch(() => {});
      } else if (typeof SANDBOX !== 'undefined' && SANDBOX._returnToBrowser) {
        SANDBOX._returnToBrowser();
      }
    };
    window.game = new Game(mode, options, exit);
    // Restart = relaunch the same test from scratch (fresh timer / clean state).
    this._showControls(() => this._launch(mode, arenaGameMode), exit);
  },

  // §Combo Trainer — launch the flat "test gym" from Sandbox (no templateData: the trainer
  // builds its own flat world). Captures the editor snapshot/loadout so exit reopens cleanly.
  comboTrainer() {
    this.hide();
    this._wid  = (typeof SANDBOX !== 'undefined') ? SANDBOX.selectedWorldId : null;
    this._data = (typeof GAME_STATE !== 'undefined' && window.game) ? GAME_STATE.serialize(window.game) : null;
    this._loadout = this._captureLoadout(window.game && window.game.player);
    this._launchTrainer();
  },
  _launchTrainer() {
    if (window.menu && typeof window.menu._stop === 'function') window.menu._stop();
    if (window.game && typeof window.game.destroy === 'function') window.game.destroy();
    const hud = document.getElementById('sandbox-editor-hud');
    if (hud) hud.style.display = 'none';
    let _exited = false;
    const exit = () => {
      if (_exited) return;
      _exited = true;
      this._hideControls();
      if (window.game && typeof window.game.destroy === 'function') {
        try { window.game.destroy(); } catch (e) { /* ignore */ }
      }
      window.game = null;
      const loadout = this._loadout;
      if (this._wid && typeof SANDBOX !== 'undefined' && SANDBOX.editWorld) {
        Promise.resolve(SANDBOX.editWorld(this._wid, this._data)).then(() => {
          this._restoreLoadout(window.game && window.game.player, loadout);
        }).catch(() => {});
      } else if (typeof SANDBOX !== 'undefined' && SANDBOX._returnToBrowser) {
        SANDBOX._returnToBrowser();
      }
    };
    window.game = new Game('normal', { comboTrainer: true, testMode: true }, exit);
    this._showControls(() => this._launchTrainer(), exit);
  },

  _showControls(onRestart, onExit) {
    const hud = document.getElementById('test-hud');
    if (!hud) return;
    hud.style.display = 'flex';
    const r = document.getElementById('test-hud-restart');
    const x = document.getElementById('test-hud-exit');
    if (r) r.onclick = () => onRestart();
    if (x) x.onclick = () => onExit();
  },

  _hideControls() {
    const hud = document.getElementById('test-hud');
    if (hud) hud.style.display = 'none';
  },
};

if (typeof window !== 'undefined') window.TEST_WORLD = TEST_WORLD;
