const GAME_SELECTION = {
  currentMode: null,
  currentSlot: null,
  games: [],
  _staticBound: false,
  _creating: false,
  // Game IDs restarted THIS session — treated as new (Start Game + fresh spawn) even if
  // the server hasn't yet stamped it (redeploy lag). Cleared once the game is played+saved.
  _justRestarted: new Set(),

  async init(mode) {
    this.currentMode = mode;
    this._showScreen();
    this._setupStaticListeners();
    await this._loadGames();
  },

  _showScreen() {
    document.getElementById('dashboard-screen').style.display = 'none';
    document.getElementById('game-selection-screen').style.display = 'block';
    this._updateModeTitle();
  },

  // Sync the screen heading to the current mode. Called on entry AND when
  // returning from a game (e.g. a Quick Play launch sets currentMode to the
  // played game's mode, so the heading must follow it — not the last mode viewed).
  _updateModeTitle() {
    const labels = { NORMAL: 'Normal', PLATFORMER: 'Platformer', SPEEDRUNNER: 'Speed Runner', SANDBOX: 'Sandbox' };
    const el = document.getElementById('game-selection-mode-title');
    if (el) el.textContent = `${labels[this.currentMode] || this.currentMode} Mode`;
  },

  async _loadGames() {
    try {
      const response = await AUTH.authedFetch(`/api/games?mode=${this.currentMode}`);

      const data = await response.json();
      if (!response.ok) throw new Error(`${response.status}: ${data.error || 'request failed'}`);
      this.games = data.games;
      this._renderSlots();
    } catch (error) {
      console.error('Load games error:', error);
      alert(`Failed to load games (${error.message})`);
    }
  },

  // A game is "new / never really played" if it has no save yet. `last_played_at` is
  // only meant to be set by the first save — but the DB column may DEFAULT now() on
  // insert, so we can't just test for null. Treat it as new when last_played_at is
  // missing OR still ≈ created_at (i.e. it hasn't been bumped by an actual save).
  _isNewGame(g) {
    if (!g) return true;
    if (this._justRestarted.has(String(g.id))) return true;   // restarted this session
    // Most reliable: the server strips the editor's playerProgress from a fresh/restarted
    // game's data, so its absence = never played (works once the server is redeployed).
    if (g.game_data && !g.game_data.playerProgress) return true;
    if (!g.last_played_at) return true;
    if (!g.created_at) return false;
    return (new Date(g.last_played_at) - new Date(g.created_at)) < 3000;   // <3s gap → never saved
  },

  _renderSlots() {
    this.games.forEach((game, slotNum) => {
      const slotEl = document.getElementById(`slot-${slotNum}`);
      const contentEl = slotEl.querySelector('.slot-content');

      if (game) {
        contentEl.classList.add('filled');
        contentEl.innerHTML = `
          <h3 class="game-name">${game.game_name}</h3>
          <p class="world-name">World: ${game.world_name || 'Unnamed World'}</p>
          <div class="game-actions">
            <button class="btn btn-primary continue-btn" data-game-id="${game.id}">${this.currentMode === 'SPEEDRUNNER' ? 'Play' : (this._isNewGame(game) ? 'Start Game' : 'Continue')}</button>
            ${this.currentMode === 'SPEEDRUNNER' ? '' : `<button class="btn btn-secondary restart-btn" data-game-id="${game.id}">Restart</button>`}
            <button class="btn btn-secondary copy-btn" data-game-id="${game.id}">Copy</button>
            <button class="btn btn-danger delete-btn" data-game-id="${game.id}">Delete</button>
          </div>
        `;
      } else {
        contentEl.classList.remove('filled');
        contentEl.innerHTML = `
          <p class="empty-text">Empty</p>
          <button class="btn btn-primary create-game-btn" data-slot="${slotNum}">Create New Game</button>
        `;
      }
    });

    // Slot buttons are recreated on every render, so (re)bind their listeners
    // here. The fresh DOM elements mean no handlers can stack up.
    this._setupSlotListeners();
  },

  // Listeners on permanent DOM elements (form, back/cancel buttons). These must
  // be bound exactly once — init() and the return-from-game path both run, and
  // re-binding would stack duplicate handlers (one click → multiple submits).
  _setupStaticListeners() {
    if (this._staticBound) return;
    this._staticBound = true;

    document.getElementById('game-selection-back-btn')?.addEventListener('click', () => {
      this._goBack();
    });

    document.getElementById('create-game-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this._createGame();
    });

    document.getElementById('cancel-create-btn')?.addEventListener('click', () => {
      this._hideCreateModal();
    });
  },

  // Listeners on per-slot buttons, which _renderSlots() recreates each render.
  _setupSlotListeners() {
    document.querySelectorAll('.create-game-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.currentSlot = parseInt(e.target.dataset.slot);
        this._showCreateModal();
      });
    });

    document.querySelectorAll('.continue-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this._continueGame(e.target.dataset.gameId);
      });
    });

    document.querySelectorAll('.restart-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (confirm('Restart this game? Progress will be lost.')) {
          this._restartGame(e.target.dataset.gameId);
        }
      });
    });

    document.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this._showCopyModal(e.target.dataset.gameId);
      });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (confirm('Delete this game? This cannot be undone.')) {
          this._deleteGame(e.target.dataset.gameId);
        }
      });
    });
  },

  _showCreateModal() {
    document.getElementById('create-game-modal').style.display = 'flex';
    this._loadWorlds();
  },

  async _loadWorlds() {
    const worldSelect = document.getElementById('world-select');
    worldSelect.disabled = false;
    worldSelect.innerHTML = '<option value="">Loading worlds…</option>';

    try {
      const response = await AUTH.authedFetch(`/api/worlds?mode=${this.currentMode}`);

      if (!response.ok) {
        // Server responded with an error status (bad mode, auth, 5xx, …)
        let detail = '';
        try { detail = (await response.json()).error || ''; } catch (_) {}
        console.error('Worlds fetch failed:', response.status, detail);
        this._showWorldsError(`${response.status} ${detail}`.trim());
        return;
      }

      const data = await response.json();
      const worlds = data.worlds || [];

      // An empty list is NOT an error — a new player simply has no worlds yet.
      if (worlds.length === 0) {
        console.log('No worlds available yet for', this.currentMode);
        this._showNoWorldsAvailable();
        return;
      }

      this._populateWorldDropdown(worlds);
    } catch (error) {
      console.error('Load worlds error:', error);
      this._showWorldsError('Network error loading worlds');
    }
  },

  _populateWorldDropdown(worlds) {
    const worldSelect = document.getElementById('world-select');
    if (!worldSelect) return;

    worldSelect.disabled = false;
    worldSelect.innerHTML = '<option value="">Select a world…</option>'
      + worlds
        .map(w => `<option value="${w.id}">${w.world_name} ${w.mine ? '(yours)' : `(by ${w.creator_name})`}</option>`)
        .join('');

    this._setCreateEnabled(true);
  },

  _showNoWorldsAvailable() {
    const worldSelect = document.getElementById('world-select');
    if (worldSelect) {
      worldSelect.innerHTML = '<option value="">No worlds available yet</option>';
      worldSelect.disabled = true;
    }
    this._setCreateEnabled(false, 'No worlds available');
  },

  _showWorldsError(message) {
    const worldSelect = document.getElementById('world-select');
    if (worldSelect) {
      worldSelect.innerHTML = `<option value="">Error: ${message}</option>`;
      worldSelect.disabled = true;
    }
    this._setCreateEnabled(false, 'Create Game');
  },

  _setCreateEnabled(enabled, label) {
    const createBtn = document.querySelector('#create-game-form button[type="submit"]');
    if (!createBtn) return;
    createBtn.disabled = !enabled;
    if (label) createBtn.textContent = label;
    else createBtn.textContent = 'Create Game';
  },

  _hideCreateModal() {
    document.getElementById('create-game-modal').style.display = 'none';
    document.getElementById('game-name-input').value = '';
  },

  async _createGame() {
    // Guard against double-submits racing each other into the same slot.
    if (this._creating) return;

    const gameName = document.getElementById('game-name-input').value.trim();
    const worldId = document.getElementById('world-select').value;

    if (!gameName || !worldId) {
      alert('Please fill in all fields');
      return;
    }

    this._creating = true;
    this._setCreateEnabled(false, 'Creating…');
    try {
      const response = await AUTH.authedFetch('/api/games/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameName,
          worldId,
          mode: this.currentMode,
          slot: this.currentSlot,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        alert(`Error: ${data.error}`);
        return;
      }

      this._hideCreateModal();
      await this._loadGames();
    } catch (error) {
      console.error('Create game error:', error);
      alert('Failed to create game');
    } finally {
      this._creating = false;
      this._setCreateEnabled(true);
    }
  },

  _continueGame(gameId) {
    const game = this.games.find(g => g && String(g.id) === String(gameId));
    if (game) {
      QUICK_PLAY.addGame({
        gameId,
        gameName:  game.game_name,
        worldName: game.world_name || 'Unnamed World',
        mode:      this.currentMode,
      });
    }
    GAME_PLAY.init(gameId);
  },

  async _restartGame(gameId) {
    try {
      const response = await AUTH.authedFetch(`/api/games/${gameId}/restart`, {
        method: 'POST',
      });

      if (!response.ok) {
        alert('Failed to restart game');
        return;
      }
      this._justRestarted.add(String(gameId));   // treat as fresh until played+saved (redeploy-independent)
      await this._loadGames();
    } catch (error) {
      console.error('Restart error:', error);
      alert('Failed to restart game');
    }
  },

  _showCopyModal(gameId) {
    const emptySlots = this.games
      .map((game, idx) => (game ? null : idx))
      .filter(slot => slot !== null);

    if (emptySlots.length === 0) {
      alert('No empty slots available. Delete a game first.');
      return;
    }

    this._copyGame(gameId, emptySlots[0]);
  },

  async _copyGame(gameId, targetSlot) {
    try {
      const response = await AUTH.authedFetch(`/api/games/${gameId}/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetSlot }),
      });

      if (!response.ok) {
        alert('Failed to copy game');
        return;
      }
      await this._loadGames();
    } catch (error) {
      console.error('Copy error:', error);
      alert('Failed to copy game');
    }
  },

  async _deleteGame(gameId) {
    try {
      const response = await AUTH.authedFetch(`/api/games/${gameId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        alert('Failed to delete game');
        return;
      }
      // A deleted game must not linger in the Quick Play list.
      QUICK_PLAY.removeGame(gameId);
      await this._loadGames();
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete game');
    }
  },

  _goBack() {
    document.getElementById('game-selection-screen').style.display = 'none';
    document.getElementById('dashboard-screen').style.display = 'block';
    // Refresh the Quick Play list — a game may have just been played.
    if (typeof DASHBOARD !== 'undefined') DASHBOARD._loadMostRecentWorld();
  },
};

// ════════════════════════════════════════════════════════════
// QUICK_PLAY — sliding window of the most recently played games.
// Stored in localStorage; surfaced on the dashboard for one-click replay.
// ════════════════════════════════════════════════════════════
const QUICK_PLAY = {
  maxGames:   4,
  storageKey: 'quickPlayGames',

  addGame({ gameId, gameName, worldName, mode }) {
    let games = this.getGames().filter(g => String(g.gameId) !== String(gameId));
    games.unshift({ gameId, gameName, worldName, mode, timestamp: Date.now() });
    games = games.slice(0, this.maxGames);
    try { localStorage.setItem(this.storageKey, JSON.stringify(games)); } catch (_) {}
  },

  getGames() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) { return []; }
  },

  mostRecent() {
    return this.getGames()[0] || null;
  },

  // Remove a game from the Quick Play list only (does not delete the game).
  removeGame(gameId) {
    const games = this.getGames().filter(g => String(g.gameId) !== String(gameId));
    try { localStorage.setItem(this.storageKey, JSON.stringify(games)); } catch (_) {}
  },
};
