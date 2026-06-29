const GAME_SELECTION = {
  currentMode: null,
  currentSlot: null,
  games: [],

  async init(mode) {
    this.currentMode = mode;
    this._showScreen();
    await this._loadGames();
    this._setupEventListeners();
  },

  _showScreen() {
    document.getElementById('dashboard-screen').style.display = 'none';
    document.getElementById('game-selection-screen').style.display = 'block';
    document.getElementById('game-selection-mode-title').textContent = `${this.currentMode} Mode`;
  },

  async _loadGames() {
    try {
      const token = AUTH.getToken();
      const response = await fetch(`/api/games?mode=${this.currentMode}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      this.games = data.games;
      this._renderSlots();
    } catch (error) {
      console.error('Load games error:', error);
      alert('Failed to load games');
    }
  },

  _renderSlots() {
    this.games.forEach((game, slotNum) => {
      const slotEl = document.getElementById(`slot-${slotNum}`);
      const contentEl = slotEl.querySelector('.slot-content');

      if (game) {
        contentEl.classList.add('filled');
        contentEl.innerHTML = `
          <h3 class="game-name">${game.game_name}</h3>
          <p class="world-name">World: ${game.world_id}</p>
          <div class="game-actions">
            <button class="btn btn-primary continue-btn" data-game-id="${game.id}">Continue</button>
            <button class="btn btn-secondary restart-btn" data-game-id="${game.id}">Restart</button>
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
  },

  _setupEventListeners() {
    document.getElementById('game-selection-back-btn')?.addEventListener('click', () => {
      this._goBack();
    });

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

    document.getElementById('create-game-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this._createGame();
    });

    document.getElementById('cancel-create-btn')?.addEventListener('click', () => {
      this._hideCreateModal();
    });
  },

  _showCreateModal() {
    document.getElementById('create-game-modal').style.display = 'flex';
    this._loadWorlds();
  },

  _hideCreateModal() {
    document.getElementById('create-game-modal').style.display = 'none';
    document.getElementById('game-name-input').value = '';
  },

  _loadWorlds() {
    const worldSelect = document.getElementById('world-select');
    worldSelect.innerHTML = `<option value="default-${this.currentMode.toLowerCase()}">Default ${this.currentMode} World</option>`;
  },

  async _createGame() {
    try {
      const gameName = document.getElementById('game-name-input').value.trim();
      const worldId = document.getElementById('world-select').value;

      if (!gameName || !worldId) {
        alert('Please fill in all fields');
        return;
      }

      const token = AUTH.getToken();
      const response = await fetch('/api/games/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
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
    }
  },

  _continueGame(gameId) {
    console.log(`Continuing game: ${gameId}`);
    alert('Game loading... (coming in Phase 1D)');
  },

  async _restartGame(gameId) {
    try {
      const token = AUTH.getToken();
      const response = await fetch(`/api/games/${gameId}/restart`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        alert('Failed to restart game');
        return;
      }
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
      const token = AUTH.getToken();
      const response = await fetch(`/api/games/${gameId}/copy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
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
      const token = AUTH.getToken();
      const response = await fetch(`/api/games/${gameId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        alert('Failed to delete game');
        return;
      }
      await this._loadGames();
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete game');
    }
  },

  _goBack() {
    document.getElementById('game-selection-screen').style.display = 'none';
    document.getElementById('dashboard-screen').style.display = 'block';
  },
};
