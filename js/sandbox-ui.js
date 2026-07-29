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
    this._applyModeUI();
    // Offline: seed the pre-loaded starter worlds once before listing.
    if (typeof APP_MODE !== 'undefined' && APP_MODE.isLocal() && typeof LOCAL_WORLDS !== 'undefined') {
      await LOCAL_WORLDS.seedDefaults();
    }
    await this.loadWorlds();
  },

  // Offline: file import/export work locally; only importing CLOUD games is
  // online-only. Create/edit/save/copy/delete all run against LOCAL_WORLDS.
  _applyModeUI() {
    const local = (typeof APP_MODE !== 'undefined' && APP_MODE.isLocal());
    const games = document.getElementById('import-games-btn');
    if (games) games.style.display = local ? 'none' : '';   // cloud games = online only
    const file = document.getElementById('import-file-btn');
    if (file) file.style.display = '';                        // file import works offline too
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
    document.getElementById('campaign-builder-btn')?.addEventListener('click', () => { if (typeof CAMPAIGN_BUILDER !== 'undefined') CAMPAIGN_BUILDER.open(); });
    document.getElementById('overhead-demo-btn')?.addEventListener('click', () => { if (typeof OVERHEAD !== 'undefined') OVERHEAD.launchDemo(); });
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
    // Arena worlds have fixed dimensions — lock the width/height inputs when chosen.
    document.getElementById('game-mode-default-input')?.addEventListener('change', (e) => this._applyModeDimLock(e.target.value));
    document.getElementById('arena-view-type-input')?.addEventListener('change', () => this._applyArenaViewVis());

    // Import games modal
    document.getElementById('import-selected-btn')?.addEventListener('click', () => this.importSelectedGames());
    document.getElementById('cancel-import-btn')?.addEventListener('click', () => this.hideImportGamesModal());

    // Import from file modal
    document.getElementById('world-file-input')?.addEventListener('change', (e) => {
      if (e.target.files[0]) this.handleFileSelect(e.target.files[0]);
    });
    document.getElementById('confirm-import-btn')?.addEventListener('click', () => this.confirmImport());
    document.getElementById('cancel-import-file-btn')?.addEventListener('click', () => this.hideImportFileModal());

    // Copy world modal (name + destination)
    document.getElementById('copy-world-confirm')?.addEventListener('click', () => this._confirmCopy());
    document.getElementById('copy-world-cancel')?.addEventListener('click', () => this._hideCopyModal());

    // Editor HUD
    document.getElementById('sb-editor-back-btn')?.addEventListener('click', () => this.exitEditor());
    document.getElementById('sb-save-btn')?.addEventListener('click', () => this.saveWorld());
    document.getElementById('sb-publish-btn')?.addEventListener('click', () => this.togglePublish());
    document.getElementById('sb-export-btn')?.addEventListener('click', () => this.exportWorld());
    document.getElementById('sb-copy-btn')?.addEventListener('click', () => this.copyWorld(this.selectedWorldId));
    document.getElementById('sb-delete-btn')?.addEventListener('click', () => {
      if (confirm('Delete this world? This cannot be undone.')) this.deleteWorld(this.selectedWorldId);
    });
    document.getElementById('sb-test-arena-btn')?.addEventListener('click', () => { if (typeof TEST_WORLD !== 'undefined') TEST_WORLD.choose('arena'); });
    // Universal Test World (Phase 3A.3)
    document.getElementById('sb-test-world-btn')?.addEventListener('click', () => { if (typeof TEST_WORLD !== 'undefined') TEST_WORLD.open(); });
    document.getElementById('sb-combo-trainer-btn')?.addEventListener('click', () => { if (typeof TEST_WORLD !== 'undefined') TEST_WORLD.comboTrainer(); });
    document.getElementById('test-world-cancel-btn')?.addEventListener('click', () => { if (typeof TEST_WORLD !== 'undefined') TEST_WORLD.hide(); });
    document.querySelectorAll('.test-world-mode').forEach(btn =>
      btn.addEventListener('click', () => { if (typeof TEST_WORLD !== 'undefined') TEST_WORLD.choose(btn.dataset.mode); }));

    // Arena Settings modal (Phase 3A.2)
    document.getElementById('sb-arena-settings-btn')?.addEventListener('click', () => this.openArenaSettings());
    // World Settings quick button (non-arena modes)
    document.getElementById('sb-world-settings-btn')?.addEventListener('click', () => this.openWorldSettings());
    document.getElementById('as-cancel-btn')?.addEventListener('click', () => this.hideArenaSettings());
    document.getElementById('as-apply-btn')?.addEventListener('click', () => this.applyArenaSettings());
    document.getElementById('as-health')?.addEventListener('input', (e) => {
      document.getElementById('as-health-val').textContent = String(Math.round(+e.target.value / 2));
    });
    document.getElementById('as-preset-zoom')?.addEventListener('input', (e) => {
      document.getElementById('as-zoom-val').textContent = `${(+e.target.value).toFixed(2)}×`;
    });
    document.getElementById('as-redstone')?.addEventListener('input', (e) => {
      document.getElementById('as-redstone-val').textContent = `${(+e.target.value).toFixed(2)}×`;
    });
    document.getElementById('as-zoom-mode')?.addEventListener('change', (e) => this._syncPresetZoomVisibility(e.target.value));
  },

  // ── Arena Settings (Phase 3A.3) ────────────────────────────────
  // The editor's ⚙ Arena Settings button jumps straight to the Arena tab.
  // Now opens the modern HTML World Settings panel (bug fix: it used to force
  // the retired canvas menu); falls back to canvas only under the Konami flag.
  openArenaSettings() {
    const g = window.game;
    if (!g || !g._worldAdvSettings) { alert('Open a world first.'); return; }
    if (typeof WORLD_SETTINGS !== 'undefined' && !g._useClassicPause) {
      WORLD_SETTINGS.open(g, 'arena');
    } else {
      g._worldSettingsOpen = true;
      g._wsTab = 'arena';
    }
  },

  // ── World Settings quick button (all non-arena modes) ──────────
  // Single-click into the HTML World Settings panel from the Sandbox editor
  // (previously Esc → Settings tab → World Settings = three clicks). Arena
  // worlds use the ⚙ Arena Settings button instead. Speed-Run worlds land on
  // the Speed Run tab; everything else on the World tab.
  openWorldSettings() {
    const g = window.game;
    if (!g || !g._worldAdvSettings) { alert('Open a world first.'); return; }
    const tab = this._editorWorldMode === 'RUN' ? 'speedrun' : 'world';
    if (typeof WORLD_SETTINGS !== 'undefined' && !g._useClassicPause) {
      WORLD_SETTINGS.open(g, tab);
    } else {
      g._worldSettingsOpen = true;
      g._wsTab = tab === 'speedrun' ? 'speedrun' : 'world';
    }
  },

  hideArenaSettings() {
    document.getElementById('arena-settings-modal').style.display = 'none';
  },

  applyArenaSettings() {
    const g = window.game;
    if (!g || !g._worldAdvSettings) { this.hideArenaSettings(); return; }
    const s = g._worldAdvSettings;
    s.arenaPlayerMaxHealth = Math.max(2, Math.min(40, parseInt(document.getElementById('as-health').value, 10) || 20));
    s.arenaZoomMode        = document.getElementById('as-zoom-mode').value || 'NONE';
    s.arenaPresetZoom      = Math.max(0.3, Math.min(1.5, parseFloat(document.getElementById('as-preset-zoom').value) || 1.0));
    s.redstoneSpeed        = Math.max(0.5, Math.min(2.0, parseFloat(document.getElementById('as-redstone').value) || 1.0));
    this.hideArenaSettings();
    this._setSaveIndicator('unsaved');
  },

  _syncPresetZoomVisibility(mode) {
    const grp = document.getElementById('as-preset-zoom-group');
    if (grp) grp.style.display = (mode === 'PRESET') ? 'block' : 'none';
  },

  // ── Load + render worlds ───────────────────────────────────────
  async loadWorlds() {
    if (typeof APP_MODE !== 'undefined' && APP_MODE.isLocal()) {
      const data = LOCAL_WORLDS.list({ page: this.currentPage, filter: this.currentFilter, sort: this.currentSort });
      this.worlds = data.worlds;
      this.renderWorlds(this.worlds);
      this.updatePagination(data.page, data.totalPages);
      return;
    }
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
    if (!list) return;
    const online = (typeof APP_MODE !== 'undefined' && APP_MODE.isOnline());
    let html = (worlds || []).map(w => this._worldCard(w)).join('');
    // Online only: also show your LOCAL worlds as full cards under a divider, so
    // you can Edit/Copy/Delete them and (via Copy) promote them to your account —
    // all in one place. (Offline shows only local worlds.)
    if (online && typeof LOCAL_WORLDS !== 'undefined') {
      const locals = LOCAL_WORLDS.listAll();
      if (locals.length) {
        html += '<div class="cross-space-title">💾 Your Offline Worlds</div>';
        html += locals.map(w => this._worldCard(w)).join('');
      }
    }
    list.innerHTML = html || '<p class="world-list-empty">No worlds yet. Create one to get started!</p>';
    this._wireCards();
  },

  // A world lives locally if it's in LOCAL_WORLDS — per-world actions branch on
  // THIS (its origin), not the session mode, so you can edit a local world while
  // online and vice-versa.
  _isLocalWorld(id) { return typeof LOCAL_WORLDS !== 'undefined' && !!LOCAL_WORLDS.get(id); },

  _worldCard(w) {
    const mode = (w.world_data && w.world_data.gameModeDefault) || 'NRM';
    const isLocal = this._isLocalWorld(w.id);
    const origin = isLocal
      ? '<span class="origin-badge">💾 Local</span>'
      : '<span class="origin-badge origin-cloud">☁ Cloud</span>';
    return `
      <div class="world-card">
        <div class="world-card-header">
          <h3>${this._esc(w.world_name)}</h3>
          <span class="mode-badge mode-${mode}">${this.getModeLabel(mode)}</span>
          ${w.is_published ? '<span class="published-badge" title="Published">★</span>' : ''}
          ${origin}
        </div>
        <p>${this._esc(w.description) || '(No description)'}</p>
        <p class="world-card-meta">Created: ${w.created_at ? new Date(w.created_at).toLocaleDateString() : '—'}</p>
        <div class="world-card-actions">
          <label class="mode-select-label">Mode:
            <select class="mode-select" data-world-id="${this._esc(w.id)}">
              ${['NRM', 'PLT', 'RUN', 'ARN'].map(m =>
                `<option value="${m}"${m === mode ? ' selected' : ''}>${this.getModeLabel(m)}</option>`).join('')}
            </select>
          </label>
          <button class="btn btn-primary edit-world-btn" data-world-id="${this._esc(w.id)}">Edit</button>
          <button class="btn btn-secondary rename-world-btn" data-world-id="${this._esc(w.id)}">Rename</button>
          <button class="btn btn-secondary copy-world-btn" data-world-id="${this._esc(w.id)}">Copy</button>
          <button class="btn btn-danger delete-world-btn" data-world-id="${this._esc(w.id)}">Delete</button>
        </div>
      </div>`;
  },

  _wireCards() {
    const list = document.getElementById('world-list');
    if (!list) return;
    list.querySelectorAll('.edit-world-btn').forEach(btn =>
      btn.addEventListener('click', (e) => this.editWorld(e.currentTarget.dataset.worldId)));
    list.querySelectorAll('.rename-world-btn').forEach(btn =>
      btn.addEventListener('click', (e) => this.renameWorld(e.currentTarget.dataset.worldId)));
    list.querySelectorAll('.copy-world-btn').forEach(btn =>
      btn.addEventListener('click', (e) => this.copyWorld(e.currentTarget.dataset.worldId)));
    list.querySelectorAll('.delete-world-btn').forEach(btn =>
      btn.addEventListener('click', (e) => {
        if (confirm('Delete this world? This cannot be undone.')) this.deleteWorld(e.currentTarget.dataset.worldId);
      }));
    list.querySelectorAll('.mode-select').forEach(sel =>
      sel.addEventListener('change', (e) => this.changeWorldMode(e.currentTarget.dataset.worldId, e.currentTarget.value)));
  },

  // Cross-space section — ONLINE ONLY. Shows your LOCAL worlds (badged) as tiles
  // with a single "⬆ Copy to Online". (In offline mode we intentionally show only
  // local worlds — surfacing cloud worlds there would be confusing.) Cloud cards
  // get their own "⬇ Copy to Offline" in renderWorlds.
  // ── Copy modal (name + destination) ────────────────────────────
  // One Copy button per card opens this: choose a name and where the copy goes
  // (💾 Offline / ☁ Online). Default = the world's current space; Online is
  // disabled when not signed in.
  _openCopyModal(worldId) {
    const isLocal = this._isLocalWorld(worldId);
    const src = isLocal ? LOCAL_WORLDS.get(worldId)
      : ((this.worlds || []).find(w => w.id === worldId)
         || (this.currentWorldData && this.currentWorldData.id === worldId ? this.currentWorldData : null));
    if (!src) { alert('World not found'); return; }
    this._copySrc = { id: worldId, isLocal, world: src };
    const modal = document.getElementById('copy-world-modal');
    if (!modal) return;
    const nameEl = document.getElementById('copy-world-name');
    if (nameEl) nameEl.value = `${src.world_name} (Copy)`;
    const loggedIn = (typeof AUTH !== 'undefined' && AUTH.isLoggedIn && AUTH.isLoggedIn());
    const offR = document.getElementById('copy-dest-offline');
    const onR  = document.getElementById('copy-dest-online');
    const onRow = document.getElementById('copy-dest-online-row');
    if (onR)  onR.disabled = !loggedIn;
    if (onRow) onRow.style.opacity = loggedIn ? '1' : '0.5';
    // Default to the world's own space (fall back to offline if online unavailable).
    if (!isLocal && loggedIn) { if (onR) onR.checked = true; }
    else { if (offR) offR.checked = true; }
    modal.style.display = 'flex';
  },

  _hideCopyModal() {
    const m = document.getElementById('copy-world-modal');
    if (m) m.style.display = 'none';
    this._copySrc = null;
  },

  async _confirmCopy() {
    const ctx = this._copySrc;
    if (!ctx) return;
    const nameEl = document.getElementById('copy-world-name');
    const name = ((nameEl && nameEl.value) || '').trim() || `${ctx.world.world_name} (Copy)`;
    const destEl = document.querySelector('input[name="copy-dest"]:checked');
    const dest = (destEl && destEl.value) || (ctx.isLocal ? 'offline' : 'online');
    const srcData = ctx.world.world_data || {};

    if (dest === 'online') {
      if (!(typeof AUTH !== 'undefined' && AUTH.isLoggedIn && AUTH.isLoggedIn())) {
        alert('Sign in (Play Online) to copy into your account.'); return;
      }
      // Duplicate guard vs your cloud worlds (shared lineage OR same name).
      const srcUid = srcData.provenance && srcData.provenance.uid;
      const dup = (this.worlds || []).find(c => {
        if (this._isLocalWorld(c.id)) return false;
        const cp = c.world_data && c.world_data.provenance;
        if (cp && srcUid && cp.copiedFrom === srcUid) return true;
        return c.world_name === name;
      });
      if (dup && !confirm(`A world named “${name}” (or a copy of this one) is already in your online worlds.\n\nOK = copy anyway\nCancel = go back and rename`)) return;
      await this._doCopyToCloud(name, srcData, ctx.world.description);
    } else {
      LOCAL_WORLDS.importWorld({ worldName: name, description: ctx.world.description || '', worldData: srcData, mode: srcData.gameModeDefault });
    }
    this._hideCopyModal();
    this.currentPage = 0;
    await this.loadWorlds();
  },

  async _doCopyToCloud(name, srcData, description) {
    const wd = JSON.parse(JSON.stringify(srcData || {}));
    const srcUid = (wd.provenance && wd.provenance.uid) || null;
    const user = (typeof AUTH !== 'undefined' && AUTH.getUser && AUTH.getUser());
    wd.provenance = {
      uid: 'c-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      createdAt: Date.now(), updatedAt: Date.now(),
      creator: (user && user.username) || 'Player', origin: 'cloud',
      copiedFrom: srcUid, copiedAt: srcUid ? Date.now() : null,
    };
    try {
      const cRes = await AUTH.authedFetch('/api/worlds/sandbox/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worldName: name, description: description || '',
          worldWidth: wd.worldWidth || 650, worldHeight: wd.worldHeight || 60, gameModeDefault: wd.gameModeDefault || 'NRM', config: {} }),
      });
      const created = await cRes.json();
      if (!cRes.ok) { alert('Copy failed: ' + (created.error || '')); return; }
      await AUTH.authedFetch(`/api/worlds/sandbox/${created.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ worldData: wd }),
      });
    } catch (e) { console.error('Copy to online error:', e); alert('Copy to online failed.'); }
  },

  // Inline game-mode change from a world card (no editor round-trip).
  async changeWorldMode(worldId, gameModeDefault) {
    if (this._isLocalWorld(worldId)) {
      LOCAL_WORLDS.setMode(worldId, gameModeDefault);
      const w = this.worlds.find(x => x.id === worldId);
      if (w) { w.world_data = w.world_data || {}; w.world_data.gameModeDefault = gameModeDefault; }
      if (this.currentFilter !== 'all') await this.loadWorlds();
      return;
    }
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

  // ── Rename a world from the select screen (local or cloud) ─────
  async renameWorld(worldId) {
    const w = this.worlds.find(x => x.id === worldId) ||
      (this._isLocalWorld(worldId) ? LOCAL_WORLDS.get(worldId) : null);
    const current = (w && w.world_name) || '';
    const input = window.prompt('Rename world:', current);
    if (input == null) return;                 // cancelled
    const newName = input.trim();
    if (!newName || newName === current) return;

    if (this._isLocalWorld(worldId)) {
      LOCAL_WORLDS.rename(worldId, newName);
      const c = this.worlds.find(x => x.id === worldId);
      if (c) c.world_name = newName;
      this.loadWorlds();
      return;
    }
    try {
      const res = await AUTH.authedFetch(`/api/worlds/sandbox/${worldId}/name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worldName: newName }),
      });
      if (!res.ok) { alert('Failed to rename world'); return; }
      const c = this.worlds.find(x => x.id === worldId);
      if (c) c.world_name = newName;
      this.loadWorlds();
    } catch (error) {
      console.error('Rename error:', error);
      alert('Failed to rename world');
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
    this._applyModeDimLock(document.getElementById('game-mode-default-input')?.value || 'NRM');
  },
  hideCreateWorldModal() {
    document.getElementById('create-world-modal').style.display = 'none';
    document.getElementById('world-name-input').value = '';
    document.getElementById('world-description-input').value = '';
    document.getElementById('world-width-input').value = '650';
    document.getElementById('world-height-input').value = '60';
    document.getElementById('game-mode-default-input').value = 'NRM';
    const av = document.getElementById('arena-view-type-input'); if (av) av.value = 'single';
    this._applyModeDimLock('NRM'); // reset arena options + show size row
  },

  async createWorld() {
    const name = document.getElementById('world-name-input').value.trim();
    const description = document.getElementById('world-description-input').value;
    const worldWidth = parseInt(document.getElementById('world-width-input').value, 10);
    const worldHeight = parseInt(document.getElementById('world-height-input').value, 10);
    const gameModeDefault = document.getElementById('game-mode-default-input').value;

    if (!name) { alert('World name required'); return; }

    // Physics now live in World Settings → Physics (server applies defaults here).
    // Arena (Phase 3A.3): Single-Screen = size preset; Scrolling = free size.
    const arena = gameModeDefault === 'ARN';
    let sendWidth, sendHeight, config = {};
    if (arena) {
      const view = document.getElementById('arena-view-type-input')?.value || 'single';
      config = { arenaViewType: view };
      if (view === 'single') {
        const preset = document.getElementById('arena-size-preset-input')?.value || 'small';
        const P = { small: [25, 15], medium: [50, 30], large: [75, 45] }[preset] || [25, 15];
        sendWidth = P[0]; sendHeight = P[1];
      } else {
        sendWidth = worldWidth; sendHeight = worldHeight;
        if (!(sendWidth >= 25 && sendWidth <= 2000)) { alert('Width must be 25-2000'); return; }
        if (!(sendHeight >= 15 && sendHeight <= 500)) { alert('Height must be 15-500'); return; }
      }
    } else {
      sendWidth = worldWidth; sendHeight = worldHeight;
      if (!(worldWidth >= 25 && worldWidth <= 2000)) { alert('Width must be 25-2000'); return; }
      if (!(worldHeight >= 15 && worldHeight <= 500)) { alert('Height must be 15-500'); return; }
    }

    if (typeof APP_MODE !== 'undefined' && APP_MODE.isLocal()) {
      LOCAL_WORLDS.create({ worldName: name, description, worldWidth: sendWidth, worldHeight: sendHeight, gameModeDefault, config });
      this.hideCreateWorldModal();
      this.currentPage = 0;
      await this.loadWorlds();
      return;
    }
    try {
      const res = await AUTH.authedFetch('/api/worlds/sandbox/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worldName: name, description, worldWidth: sendWidth, worldHeight: sendHeight, gameModeDefault, config }),
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
      this.pendingFileImport = { fileData, fileMode, requestedMode, fileName: file.name };

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
    const { fileData, fileMode, requestedMode, fileName } = this.pendingFileImport;

    if (fileMode !== requestedMode && !document.getElementById('confirm-mode-override').checked) {
      alert('Please confirm the mode conversion before importing');
      return;
    }
    await this.importFile(fileData, requestedMode, fileName);
  },

  // Derive a world name from an imported payload: embedded name (top-level or
  // nested in world_data, either casing), else the file's basename, else a
  // generic fallback. Fixes imports landing as "Imported World".
  _worldNameFromImport(parsed, wd, fileName) {
    const embedded = (parsed && (parsed.world_name || parsed.worldName)) ||
                     (wd && (wd.world_name || wd.worldName));
    if (embedded && String(embedded).trim()) return String(embedded).trim();
    if (fileName) {
      const base = String(fileName).replace(/^.*[\\/]/, '').replace(/\.json$/i, '')
        .replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (base) return base;
    }
    return 'Imported World';
  },

  async importFile(fileData, requestedMode, fileName) {
    if (typeof APP_MODE !== 'undefined' && APP_MODE.isLocal()) {
      let parsed;
      try { parsed = JSON.parse(fileData); } catch (e) { alert('Invalid JSON file'); return; }
      const wd = parsed.world_data || parsed;                    // export wrapper OR raw payload
      const name = this._worldNameFromImport(parsed, wd, fileName);
      const created = LOCAL_WORLDS.importWorld({ worldName: name, description: parsed.description || '', worldData: wd, mode: requestedMode });
      document.getElementById('file-import-section').style.display = 'none';
      document.getElementById('import-success-section').style.display = 'block';
      document.getElementById('imported-world-name').textContent = `Imported: ${created.world_name}`;
      this.pendingFileImport = null;
      setTimeout(() => { this.hideImportFileModal(); this.currentPage = 0; this.loadWorlds(); }, 1500);
      return;
    }
    try {
      const res = await AUTH.authedFetch('/api/worlds/sandbox/import-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileData, requestedMode, fileName }),
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
    return { NRM: 'Normal', PLT: 'Platformer', RUN: 'Speed Runner', ARN: 'Arena' }[mode] || mode;
  },

  // Arena worlds are a fixed 25×15; lock the dimension inputs when ARN is selected.
  _applyModeDimLock(mode) {
    const arena = mode === 'ARN';
    const opts  = document.getElementById('create-arena-options');
    const note  = document.getElementById('game-mode-default-note');
    if (opts) opts.style.display = arena ? 'block' : 'none';
    if (note) note.textContent = arena
      ? 'Arena: choose Single-Screen (size preset) or Scrolling (free size).'
      : 'What mode should this world open in by default?';
    // Re-enable the manual size inputs (a prior arena selection may have hidden them).
    const w = document.getElementById('world-width-input');
    const h = document.getElementById('world-height-input');
    if (w) w.disabled = false;
    if (h) h.disabled = false;
    this._applyArenaViewVis();
  },

  // Single-screen arena uses a size preset (hide the manual size row); scrolling
  // arena and all non-arena modes show the manual width/height inputs.
  _applyArenaViewVis() {
    const arena = document.getElementById('game-mode-default-input')?.value === 'ARN';
    const view  = document.getElementById('arena-view-type-input')?.value || 'single';
    const single = arena && view === 'single';
    const presetGroup = document.getElementById('arena-preset-group');
    const sizeRow = document.getElementById('create-size-row');
    if (presetGroup) presetGroup.style.display = single ? 'block' : 'none';
    if (sizeRow) sizeRow.style.display = single ? 'none' : 'flex';
  },

  // ── Export the open world as a downloadable JSON file ──────────
  async exportWorld() {
    if (!this.selectedWorldId) { alert('No world loaded'); return; }
    if (this._isLocalWorld(this.selectedWorldId)) {
      const w = LOCAL_WORLDS.get(this.selectedWorldId);
      if (!w) { alert('No world loaded'); return; }
      const payload = {
        world_name: w.world_name, description: w.description,
        game_mode_default: (w.world_data && w.world_data.gameModeDefault) || 'NRM',
        world_data: w.world_data, exportedAt: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (w.world_name || 'world').replace(/[^a-z0-9_-]+/gi, '_') + '.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }
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
  async editWorld(worldId, snapshotData = null) {
    try {
      const local = this._isLocalWorld(worldId);
      let world;
      if (snapshotData) {
        // §Phase A — reopen from the IN-MEMORY editor snapshot (unsaved edits preserved),
        // NOT the persisted file. Used by the Test round-trip return path so testing an
        // unsaved config (e.g. a World Setting) never discards it. Metadata (name /
        // published / dims / mode) comes from the world already open; the live grid +
        // worldAdvSettings + placeables come from the snapshot layered on top. Nothing is
        // written to disk — Save is still the only thing that persists.
        const meta = this.currentWorldData || {};
        world = {
          world_name:  meta.world_name || 'World',
          is_published: !!meta.is_published,
          world_data:  Object.assign({}, meta.world_data || {}, snapshotData),
        };
      } else if (local) {
        world = LOCAL_WORLDS.get(worldId);
        if (!world) { alert('World not found'); return; }
      } else {
        const res = await AUTH.authedFetch(`/api/worlds/sandbox/${worldId}`);
        if (!res.ok) { alert('Failed to load world'); return; }
        world = await res.json();
      }

      this.selectedWorldId = worldId;
      this.currentWorldData = world;
      // Publishing is an online-only (community) action.
      const pubBtn = document.getElementById('sb-publish-btn');
      if (pubBtn) pubBtn.style.display = local ? 'none' : '';

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
      const isArena = data.gameModeDefault === 'ARN';
      this._editorWorldMode = data.gameModeDefault || 'NRM';
      // ⚙ Arena Settings button is only meaningful for arena worlds.
      const asBtn = document.getElementById('sb-arena-settings-btn');
      if (asBtn) asBtn.style.display = isArena ? '' : 'none';
      // ⚙ World Settings quick button appears for every non-arena mode.
      const wsBtn = document.getElementById('sb-world-settings-btn');
      if (wsBtn) wsBtn.style.display = isArena ? 'none' : '';
      const options = hasGrid
        ? { templateData: data }
        // Fresh ARN world: open the editor on a starter arena shell at the world's
        // chosen size (Phase 3A.3 — previously hardcoded 25×15).
        : isArena
          ? { worldWidth: data.worldWidth || 25, worldHeight: data.worldHeight || 15, arenaStarter: true }
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
      if (this._isLocalWorld(this.selectedWorldId)) {
        const ok = LOCAL_WORLDS.save(this.selectedWorldId, worldData);
        this._setSaveIndicator(ok ? 'saved' : 'unsaved');
        if (!ok) alert('Failed to save world');
        return;
      }
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
    if (this._isLocalWorld(this.selectedWorldId)) {
      alert('Publishing shares a world with the community — an online feature. A local world must be copied to your online account first.');
      return;
    }
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
      // Record the publish for stats/achievements (Phase 4, fire-and-forget).
      if (isPublished) {
        AUTH.authedFetch('/api/stats/publish', { method: 'POST' })
          .then(r => r.json())
          .then((d) => { if (d && d.unlocked && d.unlocked.length) console.log('Achievement unlocked:', d.unlocked.map(a => a.name).join(', ')); })
          .catch(() => {});
      }
    } catch (error) {
      console.error('Publish error:', error);
      alert('Failed to publish world');
    }
  },

  // Copy — opens the name+destination modal (works from cards and the editor).
  copyWorld(worldId) { this._openCopyModal(worldId); },

  async deleteWorld(worldId) {
    if (!worldId) return;
    if (this._isLocalWorld(worldId)) {
      LOCAL_WORLDS.remove(worldId);
      if (this.selectedWorldId === worldId) this.exitEditor();
      else await this.loadWorlds();
      return;
    }
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

  // ── Phase 3A.1: launch the Arena prototype from the editor ──────
  // Tears down the editor game and runs the hardcoded Deathmatch arena.
  // On exit (Esc on the end screen) we re-open the editor for the same world.
  launchArenaTest() {
    if (!window.game) { alert('Open a world first.'); return; }
    const wid = this.selectedWorldId;
    // Capture the CURRENT edited layout so the arena plays what you designed.
    const worldData = (typeof GAME_STATE !== 'undefined') ? GAME_STATE.serialize(window.game) : null;

    const start = (mode) => {
      if (window.menu && typeof window.menu._stop === 'function') window.menu._stop();
      if (typeof window.game.destroy === 'function') window.game.destroy();
      document.getElementById('sandbox-editor-hud').style.display = 'none';
      // testMode → shows the ✕ EXIT TEST button + Esc returns straight to the
      // editor (no leaderboard/persistence), so you're never stuck in a test.
      const options = worldData ? { templateData: worldData, testMode: true } : { testMode: true };
      if (mode) options.arenaGameMode = mode;
      window.game = new Game('arena', options, () => {
        window.game = null;
        if (wid) this.editWorld(wid);
        else this._returnToBrowser();
      });
    };

    // Pick a game mode first (Phase 3A.2), then launch. Falls back to classic.
    if (typeof ARENA_SELECT !== 'undefined' && ARENA_SELECT.chooseMode) ARENA_SELECT.chooseMode(start);
    else start(null);
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
