// ============================================================
// sandbox-ui.js — Sandbox world browser + editor controller
// (Distinct from js/sandbox.js, which is the in-game SandboxManager.)
// ============================================================

const SANDBOX = {
  currentPage: 0,
  currentFilter: 'all',
  currentSort: 'newest',
  selectedWorldId: null,
  currentWorldData: null,
  worlds: [],
  pendingFileImport: null,
  _staticBound: false,

  // ── Entry point ────────────────────────────────────────────────
  async init() {
    this._showBrowser();
    this._setupStaticListeners();
    await this.loadWorlds();
  },

  _showBrowser() {
    document.getElementById('dashboard-screen').style.display = 'none';
    document.getElementById('sandbox-screen').style.display = 'block';
  },

  // Listeners on permanent DOM (browser controls, modals, editor HUD).
  // Bound exactly once so re-entering Sandbox never stacks duplicate handlers.
  _setupStaticListeners() {
    if (this._staticBound) return;
    this._staticBound = true;

    document.getElementById('sandbox-back-btn')?.addEventListener('click', () => this.goBack());
    document.getElementById('create-world-btn')?.addEventListener('click', () => this.showCreateWorldModal());
    document.getElementById('import-games-btn')?.addEventListener('click', () => this.showImportGamesModal());
    document.getElementById('import-file-btn')?.addEventListener('click', () => this.showImportFileModal());

    document.getElementById('mode-filter')?.addEventListener('change', (e) => {
      this.currentFilter = e.target.value;
      this.currentPage = 0;
      this.loadWorlds();
    });
    document.getElementById('sort-filter')?.addEventListener('change', (e) => {
      this.currentSort = e.target.value;
      this.currentPage = 0;
      this.loadWorlds();
    });

    document.getElementById('prev-page-btn')?.addEventListener('click', () => {
      if (this.currentPage > 0) { this.currentPage--; this.loadWorlds(); }
    });
    document.getElementById('next-page-btn')?.addEventListener('click', () => {
      this.currentPage++; this.loadWorlds();
    });

    // Create world modal
    document.getElementById('create-world-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.createWorld();
    });
    document.getElementById('cancel-world-create-btn')?.addEventListener('click', () => this.hideCreateWorldModal());

    // Import games modal
    document.getElementById('import-selected-btn')?.addEventListener('click', () => this.importSelectedGames());
    document.getElementById('cancel-import-btn')?.addEventListener('click', () => this.hideImportGamesModal());

    // Import from file modal
    document.getElementById('world-file-input')?.addEventListener('change', (e) => {
      if (e.target.files[0]) this.handleFileSelect(e.target.files[0]);
    });
    document.getElementById('confirm-import-btn')?.addEventListener('click', () => this.confirmImport());
    document.getElementById('cancel-import-file-btn')?.addEventListener('click', () => this.hideImportFileModal());

    // Editor HUD
    document.getElementById('sb-editor-back-btn')?.addEventListener('click', () => this.exitEditor());
    document.getElementById('sb-save-btn')?.addEventListener('click', () => this.saveWorld());
    document.getElementById('sb-publish-btn')?.addEventListener('click', () => this.togglePublish());
    document.getElementById('sb-export-btn')?.addEventListener('click', () => this.exportWorld());
    document.getElementById('sb-copy-btn')?.addEventListener('click', () => this.copyWorld(this.selectedWorldId));
    document.getElementById('sb-delete-btn')?.addEventListener('click', () => {
      if (confirm('Delete this world? This cannot be undone.')) this.deleteWorld(this.selectedWorldId);
    });
  },

  // ── Load + render worlds ───────────────────────────────────────
  async loadWorlds() {
    try {
      const res = await AUTH.authedFetch(
        `/api/worlds/sandbox?page=${this.currentPage}&filter=${this.currentFilter}&sort=${this.currentSort}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'request failed');

      this.worlds = data.worlds || [];
      this.renderWorlds(this.worlds);
      this.updatePagination(data.page, data.totalPages);
    } catch (error) {
      console.error('Load worlds error:', error);
      alert('Failed to load worlds');
    }
  },

  renderWorlds(worlds) {
    const list = document.getElementById('world-list');
    if (!worlds || worlds.length === 0) {
      list.innerHTML = '<p class="world-list-empty">No worlds yet. Create one to get started!</p>';
      return;
    }

    list.innerHTML = worlds.map(w => {
      const mode = w.world_data?.gameModeDefault || 'NRM';
      return `
      <div class="world-card">
        <div class="world-card-header">
          <h3>${this._esc(w.world_name)}</h3>
          <span class="mode-badge mode-${mode}">${this.getModeLabel(mode)}</span>
          ${w.is_published ? '<span class="published-badge">Published</span>' : ''}
        </div>
        <p>${this._esc(w.description) || '(No description)'}</p>
        <p class="world-card-meta">Created: ${new Date(w.created_at).toLocaleDateString()}</p>
        <div class="world-card-actions">
          <label class="mode-select-label">Mode:
            <select class="mode-select" data-world-id="${w.id}">
              ${['NRM', 'PLT', 'RUN'].map(m =>
                `<option value="${m}"${m === mode ? ' selected' : ''}>${this.getModeLabel(m)}</option>`).join('')}
            </select>
          </label>
          <button class="btn btn-primary edit-world-btn" data-world-id="${w.id}">Edit</button>
          <button class="btn btn-secondary copy-world-btn" data-world-id="${w.id}">Copy</button>
          <button class="btn btn-danger delete-world-btn" data-world-id="${w.id}">Delete</button>
        </div>
      </div>
    `;
    }).join('');

    list.querySelectorAll('.edit-world-btn').forEach(btn =>
      btn.addEventListener('click', (e) => this.editWorld(e.target.dataset.worldId)));
    list.querySelectorAll('.copy-world-btn').forEach(btn =>
      btn.addEventListener('click', (e) => this.copyWorld(e.target.dataset.worldId)));
    list.querySelectorAll('.delete-world-btn').forEach(btn =>
      btn.addEventListener('click', (e) => {
        if (confirm('Delete this world? This cannot be undone.')) this.deleteWorld(e.target.dataset.worldId);
      }));
    list.querySelectorAll('.mode-select').forEach(sel =>
      sel.addEventListener('change', (e) => this.changeWorldMode(e.target.dataset.worldId, e.target.value)));
  },

  // Inline game-mode change from a world card (no editor round-trip).
  async changeWorldMode(worldId, gameModeDefault) {
    try {
      const res = await AUTH.authedFetch(`/api/worlds/sandbox/${worldId}/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameModeDefault }),
      });
      if (!res.ok) { alert('Failed to change game mode'); await this.loadWorlds(); return; }
      // Keep local cache in sync so a filter re-query stays consistent.
      const w = this.worlds.find(x => x.id === worldId);
      if (w) { w.world_data = w.world_data || {}; w.world_data.gameModeDefault = gameModeDefault; }
      // If a mode filter is active, the card may no longer belong — refresh.
      if (this.currentFilter !== 'all') await this.loadWorlds();
    } catch (error) {
      console.error('Change mode error:', error);
      alert('Failed to change game mode');
    }
  },

  updatePagination(page, totalPages) {
    const tp = Math.max(totalPages, 1);
    document.getElementById('page-info').textContent = `Page ${page + 1} of ${tp}`;
    document.getElementById('prev-page-btn').disabled = page === 0;
    document.getElementById('next-page-btn').disabled = page >= tp - 1;
  },

  // ── Create world ───────────────────────────────────────────────
  showCreateWorldModal() {
    document.getElementById('create-world-modal').style.display = 'flex';
  },
  hideCreateWorldModal() {
    document.getElementById('create-world-modal').style.display = 'none';
    document.getElementById('world-name-input').value = '';
    document.getElementById('world-description-input').value = '';
    document.getElementById('world-width-input').value = '650';
    document.getElementById('world-height-input').value = '60';
    document.getElementById('game-mode-default-input').value = 'NRM';
    const g = document.getElementById('gravity-level-input'); if (g) g.value = '0.66';
    const j = document.getElementById('jump-height-input');   if (j) j.value = '3.5';
    const a = document.getElementById('air-jump-input');      if (a) a.checked = false;
    const s = document.getElementById('sprint-input');        if (s) s.checked = true;
  },

  async createWorld() {
    const name = document.getElementById('world-name-input').value.trim();
    const description = document.getElementById('world-description-input').value;
    const worldWidth = parseInt(document.getElementById('world-width-input').value, 10);
    const worldHeight = parseInt(document.getElementById('world-height-input').value, 10);
    const gameModeDefault = document.getElementById('game-mode-default-input').value;

    // Per-world movement config (gravity, jump height, air jump, sprint).
    const config = {
      gravity:        parseFloat(document.getElementById('gravity-level-input')?.value || '0.66'),
      jumpHeight:     parseFloat(document.getElementById('jump-height-input')?.value || '3.5'),
      airJumpEnabled: !!document.getElementById('air-jump-input')?.checked,
      sprintEnabled:  document.getElementById('sprint-input')?.checked !== false,
    };

    if (!name) { alert('World name required'); return; }
    if (!(worldWidth >= 100 && worldWidth <= 2000)) { alert('Width must be 100-2000'); return; }
    if (!(worldHeight >= 30 && worldHeight <= 500)) { alert('Height must be 30-500'); return; }

    try {
      const res = await AUTH.authedFetch('/api/worlds/sandbox/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worldName: name, description, worldWidth, worldHeight, gameModeDefault, config }),
      });
      const data = await res.json();
      if (!res.ok) { alert(`Error: ${data.error}`); return; }

      this.hideCreateWorldModal();
      this.currentPage = 0;
      await this.loadWorlds();
    } catch (error) {
      console.error('Create world error:', error);
      alert('Failed to create world');
    }
  },

  // ── Import from file ───────────────────────────────────────────
  showImportFileModal() {
    document.getElementById('import-file-modal').style.display = 'flex';
    document.getElementById('file-import-section').style.display = 'block';
    document.getElementById('import-success-section').style.display = 'none';
    document.getElementById('world-file-input').value = '';
    document.getElementById('mode-mismatch-warning').style.display = 'none';
    document.getElementById('confirm-mode-override').checked = false;
    this.pendingFileImport = null;
  },
  hideImportFileModal() {
    document.getElementById('import-file-modal').style.display = 'none';
    this.pendingFileImport = null;
  },

  // Read the chosen file, stash its contents, and warn if its game mode won't
  // survive the import into Sandbox (which always lands on NRM by default).
  handleFileSelect(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const fileData = e.target.result;
      let parsed;
      try {
        parsed = JSON.parse(fileData);
      } catch (err) {
        alert('Invalid JSON file');
        return;
      }

      const fileMode = parsed.game_mode_default || (parsed.world_data && parsed.world_data.gameModeDefault) || 'NRM';
      const requestedMode = 'NRM'; // Sandbox imports default to Normal.
      this.pendingFileImport = { fileData, fileMode, requestedMode };

      const warning = document.getElementById('mode-mismatch-warning');
      if (fileMode !== requestedMode) {
        document.getElementById('mismatch-text').textContent =
          `This file is for ${this.getModeLabel(fileMode)} mode, but you're importing into Sandbox. ` +
          `The world will be converted to ${this.getModeLabel(requestedMode)} mode.`;
        document.getElementById('override-mode-span').textContent = this.getModeLabel(requestedMode);
        document.getElementById('confirm-mode-override').checked = false;
        warning.style.display = 'block';
      } else {
        warning.style.display = 'none';
      }
    };
    reader.readAsText(file);
  },

  // Triggered by the modal's Import button. Requires confirmation only when the
  // file's mode differs from the target (NRM).
  async confirmImport() {
    if (!this.pendingFileImport) { alert('Select a file first'); return; }
    const { fileData, fileMode, requestedMode } = this.pendingFileImport;

    if (fileMode !== requestedMode && !document.getElementById('confirm-mode-override').checked) {
      alert('Please confirm the mode conversion before importing');
      return;
    }
    await this.importFile(fileData, requestedMode);
  },

  async importFile(fileData, requestedMode) {
    try {
      const res = await AUTH.authedFetch('/api/worlds/sandbox/import-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileData, requestedMode }),
      });
      const result = await res.json();
      if (!res.ok) { alert(`Error: ${result.error}`); return; }

      document.getElementById('file-import-section').style.display = 'none';
      document.getElementById('import-success-section').style.display = 'block';
      document.getElementById('imported-world-name').textContent = `Imported: ${result.world.world_name}`;
      this.pendingFileImport = null;

      setTimeout(() => {
        this.hideImportFileModal();
        this.currentPage = 0;
        this.loadWorlds();
      }, 1500);
    } catch (error) {
      console.error('Import error:', error);
      alert('Failed to import world');
    }
  },

  getModeLabel(mode) {
    return { NRM: 'Normal', PLT: 'Platformer', RUN: 'Speed Runner' }[mode] || mode;
  },

  // ── Export the open world as a downloadable JSON file ──────────
  async exportWorld() {
    if (!this.selectedWorldId) { alert('No world loaded'); return; }
    try {
      const res = await AUTH.authedFetch(`/api/worlds/sandbox/${this.selectedWorldId}/export`);
      if (!res.ok) { alert('Failed to export world'); return; }

      let filename = 'world.json';
      const header = res.headers.get('Content-Disposition');
      const match = header && header.match(/filename="([^"]+)"/);
      if (match) filename = match[1];

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export world');
    }
  },

  // ── Import saved games ─────────────────────────────────────────
  async showImportGamesModal() {
    try {
      const res = await AUTH.authedFetch('/api/worlds/sandbox/imported');
      const data = await res.json();
      const gamesList = document.getElementById('games-list');

      if (!data.games || data.games.length === 0) {
        gamesList.innerHTML = '<p>No games to import. Create games in other modes first!</p>';
      } else {
        gamesList.innerHTML = data.games.map(g => `
          <div class="game-item">
            <input type="checkbox" value="${g.id}" class="game-checkbox">
            <label>${this._esc(g.name)} (${g.mode})</label>
          </div>
        `).join('');
      }
      document.getElementById('import-games-modal').style.display = 'flex';
    } catch (error) {
      console.error('Load import games error:', error);
      alert('Failed to load games');
    }
  },
  hideImportGamesModal() {
    document.getElementById('import-games-modal').style.display = 'none';
  },

  async importSelectedGames() {
    const gameIds = Array.from(document.querySelectorAll('.game-checkbox:checked')).map(c => c.value);
    if (gameIds.length === 0) { alert('Select at least one game to import'); return; }

    try {
      for (const gameId of gameIds) {
        await AUTH.authedFetch('/api/worlds/sandbox/import-game', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId }),
        });
      }
      this.hideImportGamesModal();
      this.currentPage = 0;
      await this.loadWorlds();
      alert(`Imported ${gameIds.length} game(s)`);
    } catch (error) {
      console.error('Import error:', error);
      alert('Failed to import games');
    }
  },

  // ── Editor: open a world in sandbox mode ───────────────────────
  async editWorld(worldId) {
    try {
      const res = await AUTH.authedFetch(`/api/worlds/sandbox/${worldId}`);
      if (!res.ok) { alert('Failed to load world'); return; }
      const world = await res.json();

      this.selectedWorldId = worldId;
      this.currentWorldData = world;

      // Tear down the legacy menu loop + any prior game before launching, so
      // nothing draws/handles input on top of the editor (mirrors GAME_PLAY).
      if (window.menu && typeof window.menu._stop === 'function') window.menu._stop();
      if (window.game && typeof window.game.destroy === 'function') window.game.destroy();

      // Swap browser for the editor HUD (the shared #gameCanvas is the surface).
      document.getElementById('sandbox-screen').style.display = 'none';
      document.getElementById('sandbox-editor-hud').style.display = 'flex';
      document.getElementById('sandbox-editor-title').textContent = world.world_name;
      document.getElementById('sb-publish-btn').textContent = world.is_published ? 'Unpublish' : 'Publish';
      this._setSaveIndicator('unsaved');

      // Worlds with a real grid load via templateData; fresh worlds build an
      // empty level from their stored dimensions.
      const data = world.world_data || {};
      const hasGrid = Array.isArray(data.grid) && data.grid.length > 0;
      const options = hasGrid
        ? { templateData: data }
        : { worldWidth: data.worldWidth || 650, worldHeight: data.worldHeight || 60 };

      window.game = new Game('sandbox', options, () => this._onEditorExit());

      // Restore saved player progress (position/inventory) on top of the world.
      if (hasGrid) GAME_STATE.deserialize(window.game, data);
    } catch (error) {
      console.error('Edit world error:', error);
      alert('Failed to load world for editing');
    }
  },

  async saveWorld() {
    if (!this.selectedWorldId || !window.game) { alert('No world loaded'); return; }
    try {
      const worldData = GAME_STATE.serialize(window.game);
      const res = await AUTH.authedFetch(`/api/worlds/sandbox/${this.selectedWorldId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worldData }),
      });
      if (!res.ok) { alert('Failed to save world'); return; }
      this._setSaveIndicator('saved');
    } catch (error) {
      console.error('Save world error:', error);
      alert('Failed to save world');
    }
  },

  async togglePublish() {
    if (!this.selectedWorldId || !this.currentWorldData) return;
    const isPublished = !this.currentWorldData.is_published;
    try {
      const res = await AUTH.authedFetch(`/api/worlds/sandbox/${this.selectedWorldId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished }),
      });
      const data = await res.json();
      if (!res.ok) { alert(`Error: ${data.error}`); return; }

      this.currentWorldData.is_published = isPublished;
      document.getElementById('sb-publish-btn').textContent = isPublished ? 'Unpublish' : 'Publish';
      alert(isPublished ? 'World published!' : 'World unpublished');
    } catch (error) {
      console.error('Publish error:', error);
      alert('Failed to publish world');
    }
  },

  // ── Copy / delete (work from both browser cards and editor) ────
  async copyWorld(worldId) {
    if (!worldId) return;
    const source = this.worlds.find(w => w.id === worldId) || this.currentWorldData;
    const defaultName = source ? `${source.world_name} (Copy)` : 'Copy';
    const newName = prompt('New world name:', defaultName);
    if (newName === null) return;

    try {
      const res = await AUTH.authedFetch(`/api/worlds/sandbox/${worldId}/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName }),
      });
      if (!res.ok) { alert('Failed to copy world'); return; }

      if (this.selectedWorldId) this.exitEditor();
      else { this.currentPage = 0; await this.loadWorlds(); }
    } catch (error) {
      console.error('Copy error:', error);
      alert('Failed to copy world');
    }
  },

  async deleteWorld(worldId) {
    if (!worldId) return;
    try {
      const res = await AUTH.authedFetch(`/api/worlds/sandbox/${worldId}`, { method: 'DELETE' });
      if (!res.ok) { alert('Failed to delete world'); return; }

      if (this.selectedWorldId === worldId) this.exitEditor();
      else await this.loadWorlds();
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete world');
    }
  },

  // ── Editor teardown ────────────────────────────────────────────
  // Back button: stop the game ourselves, then return to the browser.
  exitEditor() {
    if (window.game && typeof window.game.destroy === 'function') window.game.destroy();
    window.game = null;
    this._returnToBrowser();
  },

  // Game-initiated exit (Esc → Exit): the game already destroyed itself.
  _onEditorExit() {
    window.game = null;
    this._returnToBrowser();
  },

  _returnToBrowser() {
    this.selectedWorldId = null;
    this.currentWorldData = null;
    document.getElementById('sandbox-editor-hud').style.display = 'none';
    document.getElementById('sandbox-screen').style.display = 'block';
    this.loadWorlds();
  },

  goBack() {
    document.getElementById('sandbox-screen').style.display = 'none';
    document.getElementById('dashboard-screen').style.display = 'block';
    if (typeof DASHBOARD !== 'undefined') DASHBOARD._loadMostRecentWorld();
  },

  // ── Helpers ────────────────────────────────────────────────────
  _setSaveIndicator(state) {
    const el = document.getElementById('sb-save-indicator');
    if (!el) return;
    if (state === 'saved') {
      el.textContent = 'Saved';
      el.classList.add('saved');
    } else {
      el.textContent = 'Unsaved changes';
      el.classList.remove('saved');
    }
  },

  _esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },
};
