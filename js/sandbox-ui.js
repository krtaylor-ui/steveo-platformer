// ============================================================
// sandbox-ui.js — Sandbox world browser + editor controller
// (Distinct from js/sandbox.js, which is the in-game SandboxManager.)
// ============================================================

const SANDBOX = {
  currentPage: 0,
  currentFilter: 'all',
  currentSort: 'newest',
  viewFilter: 'side',   // 'side' | 'overhead' — Sandbox browser view toggle
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
    if (games) games.style.display = 'none';   // §C5/F2 — "Import from Games" removed entirely (was re-shown online)
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
    document.getElementById('overhead-new-btn')?.addEventListener('click', () => { if (typeof OH_EDITOR !== 'undefined') OH_EDITOR.open(); });
    // Side-scroll / Overhead view toggle — filters the world list by viewMode.
    document.getElementById('view-side-btn')?.addEventListener('click', () => { this.viewFilter = 'side'; this._syncViewToggle(); this.renderWorlds(this.worlds); });
    document.getElementById('view-overhead-btn')?.addEventListener('click', () => { this.viewFilter = 'overhead'; this._syncViewToggle(); this.renderWorlds(this.worlds); });
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
      this._confirmAction({ title: 'Delete this world?', body: 'This cannot be undone.', confirmLabel: 'Delete', danger: true, onConfirm: () => this.deleteWorld(this.selectedWorldId) });
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
    // §Phase 3 — cache the account roster once so the card Character dropdown can offer saved characters.
    if (this._roster == null && typeof USER_CHARACTERS !== 'undefined') {
      this._roster = [];
      USER_CHARACTERS.list().then((r) => { this._roster = r || []; try { this.renderWorlds(this.worlds); } catch (_) {} });
    }
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

  // Is a world an Overhead-Engine world? (viewMode stored in world_data.)
  _isOverhead(w) { return !!(w && w.world_data && w.world_data.viewMode === 'overhead'); },
  _syncViewToggle() {
    const s = document.getElementById('view-side-btn'), o = document.getElementById('view-overhead-btn');
    const overhead = this.viewFilter === 'overhead';
    if (s) s.classList.toggle('active', !overhead);
    if (o) o.classList.toggle('active', overhead);
  },

  renderWorlds(worlds) {
    const list = document.getElementById('world-list');
    if (!list) return;
    const online = (typeof APP_MODE !== 'undefined' && APP_MODE.isOnline());
    // View toggle: show only side-scroll OR only overhead worlds.
    const wantOverhead = this.viewFilter === 'overhead';
    const filtered = (worlds || []).filter(w => this._isOverhead(w) === wantOverhead);
    let html = filtered.map(w => this._worldCard(w)).join('');
    // Under the Overhead view, also show overhead worlds saved OFFLINE (own store) —
    // otherwise they save successfully but never appear and can't be reopened.
    if (wantOverhead) {
      const have = new Set(filtered.map(w => w.id));
      const offline = this._offlineOverheadWorlds().filter(w => !have.has(w.id));
      if (offline.length) html += offline.map(w => this._worldCard(w)).join('');
    }
    // Online only: also show your LOCAL worlds as full cards under a divider, so
    // you can Edit/Copy/Delete them and (via Copy) promote them to your account —
    // all in one place. (Offline shows only local worlds.)
    // Local worlds are side-scroll only; skip them under the Overhead view.
    if (online && !wantOverhead && typeof LOCAL_WORLDS !== 'undefined') {
      const locals = LOCAL_WORLDS.listAll();
      if (locals.length) {
        html += '<div class="cross-space-title">💾 Your Offline Worlds</div>';
        html += locals.map(w => this._worldCard(w)).join('');
      }
    }
    const emptyMsg = wantOverhead
      ? 'No Overhead worlds yet. Click “🗺 New Overhead World” to build one.'
      : 'No worlds yet. Create one to get started!';
    list.innerHTML = html || `<p class="world-list-empty">${emptyMsg}</p>`;
    this._wireCards();
  },

  // A world lives locally if it's in LOCAL_WORLDS — per-world actions branch on
  // THIS (its origin), not the session mode, so you can edit a local world while
  // online and vice-versa.
  _isLocalWorld(id) { return typeof LOCAL_WORLDS !== 'undefined' && !!LOCAL_WORLDS.get(id); },

  // Overhead worlds saved OFFLINE live in their own store (steveo_overhead_worlds,
  // keyed "oh-<name>"), NOT in steveo_local_worlds — so they need their own read path
  // to appear in the Sandbox list and to Edit/Delete. (Bug: they were saved but never
  // listed, because the Overhead view skipped local worlds entirely.)
  _ohStore() { try { return JSON.parse(localStorage.getItem('steveo_overhead_worlds') || '{}'); } catch (e) { return {}; } },
  _isOfflineOverhead(id) { return !!id && Object.prototype.hasOwnProperty.call(this._ohStore(), id); },
  _offlineOverheadWorlds() {
    const all = this._ohStore();
    return Object.keys(all).map((k) => {
      const wd = all[k] || {};
      // Wrap the raw overhead object in the list-card schema the browser renders from.
      return { id: k, world_name: wd.name || k.replace(/^oh-/, ''), description: wd.description || '', is_published: false, created_at: wd.created_at || null, world_data: wd };
    });
  },

  // §Custom Sprites GAP-1 — the SINGLE place that knows which store owns a world id and writes a shallow
  // patch of world_data fields there. Extracted because the "write a field into whichever store owns this
  // id" logic had been duplicated across changeWorldCharacter + saveCustomCharacter and the oh- branch had
  // drifted three times. Routing is by ID PREFIX first (deterministic, independent of store-read timing:
  // an `oh-` id ALWAYS goes to the overhead store, never the server which 404s it), with store-membership
  // as a fallback. Patch nesting is made CONSISTENT: in all three stores the fields end up in the world's
  // world_data (for the oh- store the record IS the world_data). Also refreshes the in-memory this.worlds
  // card cache. Returns true on success, false on a handled failure. The ONLY writer of these fields.
  async _persistWorldData(worldId, patch) {
    if (!worldId || !patch) return false;
    const id = String(worldId);
    const cachePatch = () => { const w = (this.worlds || []).find((x) => x.id === worldId); if (w) w.world_data = Object.assign({}, w.world_data || {}, patch); };

    // OFFLINE OVERHEAD (oh-*) — the record in steveo_overhead_worlds IS the world_data.
    if (id.startsWith('oh-') || this._isOfflineOverhead(worldId)) {
      try {
        const all = this._ohStore();
        all[worldId] = Object.assign(all[worldId] || {}, patch);   // assign even if the record was falsy (fixes the silent no-op)
        localStorage.setItem('steveo_overhead_worlds', JSON.stringify(all));
        cachePatch(); return true;
      } catch (e) { console.error('persist (oh-) failed:', e); return false; }
    }
    // LOCAL (lw-*) — fields live under world_data. get() returns a DETACHED copy, so write via _all/_persist.
    if (id.startsWith('lw-') || this._isLocalWorld(worldId)) {
      try {
        const map = LOCAL_WORLDS._all(); const rec = map[worldId];
        if (rec) { rec.world_data = Object.assign({}, rec.world_data || {}, patch); LOCAL_WORLDS._persist(map); }
        cachePatch(); return !!rec;
      } catch (e) { console.error('persist (lw-) failed:', e); return false; }
    }
    // SERVER — GET the current world_data, merge the patch, PUT it back (works even against a stale API
    // server that lacks newer dedicated routes; tester saw the /character route 404 on a stale server).
    try {
      const wid = encodeURIComponent(worldId);
      const g = await AUTH.authedFetch(`/api/worlds/sandbox/${wid}`);
      if (!g.ok) { alert('Could not load the world to save.'); return false; }
      const world = await g.json();
      const wd = Object.assign({}, world.world_data || {}, patch);
      const res = await AUTH.authedFetch(`/api/worlds/sandbox/${wid}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ worldData: wd, worldName: world.world_name }) });
      if (!res.ok) { alert('Failed to save.'); return false; }
      cachePatch(); return true;
    } catch (e) { console.error('persist (server) failed:', e); alert('Failed to save.'); return false; }
  },

  // ── QA / automation seams (not used by gameplay) ───────────────────────────────
  // The block-placement palette lives on the IN-EDITOR SandboxManager (window.game.sandbox), which has
  // its own selectItem(). This delegate lets a rig call window.SANDBOX.selectItem('SPIKES') from anywhere
  // while a sandbox world is open — it forwards to the running editor. Returns the resolved block id, or
  // null if no editor is active / the name is unknown. (Then click the canvas to place, right-click to
  // reach the config popups.)
  selectItem(nameOrId, kind = 'block') {
    const g = (typeof window !== 'undefined') ? window.game : null;
    if (!g || !g.sandbox || typeof g.sandbox.selectItem !== 'function') {
      console.warn('SANDBOX.selectItem: open a Sandbox world first (window.game.sandbox is not active).');
      return null;
    }
    return g.sandbox.selectItem(nameOrId, kind);
  },

  // §B1 — capture a small JPEG thumbnail from the live game canvas and store it on the world (best-effort,
  // creator-only, size-capped server-side). Runs on publish, when the editor canvas shows the world.
  async captureThumbnail(worldId) {
    try {
      const src = document.getElementById('gameCanvas'); if (!src || !worldId) return;
      const W = 256, H = 144;
      const off = document.createElement('canvas'); off.width = W; off.height = H;
      off.getContext('2d').drawImage(src, 0, 0, W, H);
      const uri = off.toDataURL('image/jpeg', 0.55);
      if (uri.length > 190000 || typeof AUTH === 'undefined' || !AUTH.authedFetch) return;
      await AUTH.authedFetch('/api/worlds/' + encodeURIComponent(worldId) + '/thumbnail', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ thumbnail: uri }),
      });
    } catch (e) { /* thumbnails are best-effort */ }
  },

  // QA seam — cycle a placed SPIKES block's orientation exactly as a right-click does (E12). Tester-
  // friendly (col,row) order; the engine uses (row,col). Returns the new orientation, or 'removed' when
  // the terminal step deletes the spike. Read game._spikeDirMap / game._spikeDirAt(r,c) to confirm.
  cycleSpikeOrientation(col, row) {
    const g = (typeof window !== 'undefined') ? window.game : null;
    if (!g || typeof g._cycleSpikeDir !== 'function') { console.warn('cycleSpikeOrientation: open a Sandbox world first.'); return null; }
    g._cycleSpikeDir(row, col);
    if (g._spikeDirMap && g._spikeDirMap[row + ',' + col]) return g._spikeDirMap[row + ',' + col];
    return (g.level && g.level.get(row, col) === (typeof BLOCK !== 'undefined' ? BLOCK.SPIKES : 67)) ? g._spikeDirAt(row, col) : 'removed';
  },
  getSpikeDir(col, row) {
    const g = (typeof window !== 'undefined') ? window.game : null;
    return (g && typeof g._spikeDirAt === 'function') ? g._spikeDirAt(row, col) : null;
  },

  // QA seam — set a placed SPEED_BOOSTER block's per-block config directly (E6/E5), bypassing the
  // right-click popup. cfg = { mode:'temp'|'perm', amount:0..2, durSec:1..8 }; missing keys use defaults.
  // Returns the stored config. Read game._boosterCfgAt(row,col) to confirm.
  setBoosterConfig(col, row, cfg) {
    const g = (typeof window !== 'undefined') ? window.game : null;
    if (!g) { console.warn('setBoosterConfig: open a Sandbox world first.'); return null; }
    g._boosterCfg = g._boosterCfg || new Map();
    const base = (typeof SPEED_BOOSTER_FX !== 'undefined') ? SPEED_BOOSTER_FX.DEFAULTS : { mode: 'temp', amount: 0.5, durSec: 3 };
    const c = Object.assign({}, base, cfg || {});
    g._boosterCfg.set(row + ',' + col, c);
    return c;
  },
  getBoosterConfig(col, row) {
    const g = (typeof window !== 'undefined') ? window.game : null;
    return (g && typeof g._boosterCfgAt === 'function') ? g._boosterCfgAt(row, col) : null;
  },

  // QA seam — set a WIND_ZONE group's config (E7). cfg = { dir, strength, thickness, channel, affectsGrounded }.
  // Keys by the group's anchor (like the popup), invalidates the zone cache. Returns the stored config.
  setWindConfig(col, row, cfg) {
    const g = (typeof window !== 'undefined') ? window.game : null;
    if (!g || typeof g._windAnchorAt !== 'function') { console.warn('setWindConfig: open a Sandbox world first.'); return null; }
    const key = g._windAnchorAt(row, col);
    g._windCfg = g._windCfg || new Map();
    const c = Object.assign({ dir: 'right', style: 'chevron', strength: 0.6, thickness: 2, channel: null, affectsGrounded: false }, cfg || {});
    g._windCfg.set(key, c);
    if (g._invalidateWindZones) g._invalidateWindZones();
    return c;
  },
  getWindConfig(col, row) {
    const g = (typeof window !== 'undefined') ? window.game : null;
    return (g && typeof g._windAnchorAt === 'function') ? g._windCfgAt.apply(g, g._windAnchorAt(row, col).split(',').map(Number)) : null;
  },

  // Scriptable publish/unpublish for a specific world id (A1 cap test). Exercises the real
  // POST /api/worlds/sandbox/:id/publish route (server enforces the 20-world cap). Returns the parsed
  // response, or { error } on failure. Logged-in cloud worlds only.
  async publishWorld(worldId, isPublished = true) {
    try {
      const res = await AUTH.authedFetch(`/api/worlds/sandbox/${encodeURIComponent(worldId)}/publish`, {
        // §T1 seam-2 — send downloadable like the UI does, so the seam and the button behave identically.
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isPublished, downloadable: isPublished }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return { error: body.error || `HTTP ${res.status}`, status: res.status };
      const w = (this.worlds || []).find((x) => x.id === worldId); if (w) w.is_published = isPublished;
      return body;
    } catch (e) { console.error('publishWorld failed:', e); return { error: String(e) }; }
  },

  // §Custom Sprites — per-world playable character dropdown (both engines). Persists
  // world_data.characterId; the runtime reads it to draw the character's accessories.
  _charSelect(w) {
    if (typeof CHARACTERS === 'undefined') return '';
    const cur = (w.world_data && w.world_data.characterId) || 'classic';
    const isCustom = cur === 'custom';
    const customName = (w.world_data && w.world_data.customCharacter && w.world_data.customCharacter.name) || 'My Character';
    // Built-in roster + (if present) the world's own custom character + a "build/edit" entry that
    // opens the parts-mixer (Phase 2). Selecting __build__ opens the builder instead of switching.
    const builtins = CHARACTERS.list().map((c) => `<option value="${this._esc(c.id)}"${c.id === cur ? ' selected' : ''}>${this._esc(c.name)}</option>`).join('');
    const customOpt = isCustom ? `<option value="custom" selected>★ ${this._esc(customName)}</option>` : '';
    const buildOpt = `<option value="__build__">🎨 ${isCustom ? 'Edit Custom…' : 'Custom…'}</option>`;
    // §Phase 3 — the account roster (saved characters) as a pickable group; choosing one applies its mix.
    const roster = (this._roster || []);
    const rosterOpts = roster.length
      ? `<optgroup label="My Characters">${roster.map((rc) => `<option value="roster:${this._esc(rc.id)}">🗂 ${this._esc(rc.name || 'Character')}</option>`).join('')}</optgroup>`
      : '';
    return `
          <label class="mode-select-label">Character:
            <select class="char-select" data-world-id="${this._esc(w.id)}">
              ${builtins}${customOpt}${rosterOpts}${buildOpt}
            </select>
          </label>`;
  },

  // Open the Phase-2 parts-mixer for a world; on save, re-render the library so the card reflects it.
  _openCharacterBuilder(worldId) {
    if (typeof CHARACTER_BUILDER === 'undefined') { alert('Character builder not loaded — please hard-reload.'); return; }
    const w = (this.worlds || []).find((x) => x.id === worldId);
    const existing = (w && w.world_data && w.world_data.characterId === 'custom') ? w.world_data.customCharacter : null;
    // renderWorlds REQUIRES the list arg — calling it bare rendered `undefined` and made the whole
    // world list vanish until reload (tester build 439). Pass this.worlds.
    const rerender = () => { try { this.renderWorlds(this.worlds); } catch (_) {} };
    CHARACTER_BUILDER.open(worldId, existing, rerender, rerender);   // re-render on save AND on cancel/close (GAP-3)
  },

  _worldCard(w) {
    const mode = (w.world_data && w.world_data.gameModeDefault) || 'NRM';
    const isLocal = this._isLocalWorld(w.id) || this._isOfflineOverhead(w.id);
    const overhead = this._isOverhead(w);
    const origin = isLocal
      ? '<span class="origin-badge">💾 Local</span>'
      : '<span class="origin-badge origin-cloud">☁ Cloud</span>';
    // Overhead worlds get a 🗺 badge, and (as of build 412) their OWN play-mode dropdown right
    // on the card — set Platform / Speed Run / Arena here without opening the editor (Kevin).
    // The dropdown drives the same gameModeDefault code the New Game world lists filter on.
    // An UNTAGGED overhead world (gameModeDefault NRM) is NOT in any play-mode list yet, so its
    // dropdown must show a "Set play mode…" placeholder (not falsely read "Platform") — otherwise
    // picking the already-shown value fires no change and the world stays undiscoverable (build 421
    // tester: 8 "Platform" overhead worlds never appeared under Platformer). Build 422 fix.
    const overheadTagged = overhead && ['PLT', 'RUN', 'ARN'].includes(mode);
    const badge = overhead
      ? `<span class="mode-badge">🗺 ${overheadTagged ? this.getModeLabel(mode) : 'Not set — pick a Mode'}</span>`
      : `<span class="mode-badge mode-${mode}">${this.getModeLabel(mode)}</span>`;
    const ohModes = [['PLT', 'Platform'], ['RUN', 'Speed Run'], ['ARN', 'Arena']];
    const modeSelect = overhead ? `
          <label class="mode-select-label">Mode:
            <select class="mode-select" data-world-id="${this._esc(w.id)}" data-overhead="1">
              ${overheadTagged ? '' : '<option value="" disabled selected>Set play mode…</option>'}
              ${ohModes.map(([v, t]) => `<option value="${v}"${v === mode ? ' selected' : ''}>${t}</option>`).join('')}
            </select>
          </label>` : `
          <label class="mode-select-label">Mode:
            <select class="mode-select" data-world-id="${this._esc(w.id)}">
              ${['NRM', 'PLT', 'RUN', 'ARN'].map(m =>
                `<option value="${m}"${m === mode ? ' selected' : ''}>${this.getModeLabel(m)}</option>`).join('')}
            </select>
          </label>`;
    return `
      <div class="world-card">
        <div class="world-card-header">
          <h3>${this._esc(w.world_name)}</h3>
          ${badge}
          ${w.is_published ? '<span class="published-badge" title="Published">★</span>' : ''}
          ${origin}
        </div>
        <p>${this._esc(w.description) || '(No description)'}</p>
        <p class="world-card-meta">Created: ${w.created_at ? new Date(w.created_at).toLocaleDateString() : '—'}</p>
        <div class="world-card-actions">
          ${modeSelect}
          ${this._charSelect(w)}
          <button class="btn btn-primary edit-world-btn" data-world-id="${this._esc(w.id)}">Edit</button>
          <button class="btn btn-secondary rename-world-btn" data-world-id="${this._esc(w.id)}">Rename</button>
          <button class="btn btn-secondary desc-world-btn" data-world-id="${this._esc(w.id)}" title="Edit the storefront description">Info</button>
          <button class="btn btn-secondary copy-world-btn" data-world-id="${this._esc(w.id)}">Copy</button>
          ${(typeof WORLD_TRANSFER !== 'undefined' && WORLD_TRANSFER.exportHidden(w.world_data)) ? '' : `<button class="btn btn-secondary export-world-btn" data-world-id="${this._esc(w.id)}" title="Download this world as a .json file">Export</button>`}
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
    list.querySelectorAll('.desc-world-btn').forEach(btn =>
      btn.addEventListener('click', (e) => this.editDescription(e.currentTarget.dataset.worldId)));
    list.querySelectorAll('.copy-world-btn').forEach(btn =>
      btn.addEventListener('click', (e) => this.copyWorld(e.currentTarget.dataset.worldId)));
    list.querySelectorAll('.export-world-btn').forEach(btn =>
      btn.addEventListener('click', (e) => this.exportWorldById(e.currentTarget.dataset.worldId)));
    list.querySelectorAll('.delete-world-btn').forEach(btn =>
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.worldId;
        this._confirmAction({ title: 'Delete this world?', body: 'This cannot be undone.', confirmLabel: 'Delete', danger: true, onConfirm: () => this.deleteWorld(id) });
      }));
    list.querySelectorAll('.mode-select').forEach(sel =>
      sel.addEventListener('change', (e) => this.changeWorldMode(e.currentTarget.dataset.worldId, e.currentTarget.value)));
    list.querySelectorAll('.char-select').forEach(sel =>
      sel.addEventListener('change', (e) => {
        const wid = e.currentTarget.dataset.worldId, val = e.currentTarget.value;
        if (val === '__build__') {
          // GAP-3: restore the dropdown to the world's CURRENT character (not blank) so it reads correctly
          // whether the builder is saved or cancelled — the card re-renders on close either way.
          const w = (this.worlds || []).find((x) => x.id === wid);
          e.currentTarget.value = (w && w.world_data && w.world_data.characterId) || 'classic';
          this._openCharacterBuilder(wid);
          return;
        }
        if (val.indexOf('roster:') === 0) {
          // §Phase 3 — apply a saved roster character to this world (as its custom mix).
          const rc = (this._roster || []).find((x) => String(x.id) === val.slice(7));
          if (rc && rc.definition) this.saveCustomCharacter(wid, rc.definition).then(() => { try { this.renderWorlds(this.worlds); } catch (_) {} });
          return;
        }
        this.changeWorldCharacter(wid, val);
      }));
  },

  // §Custom Sprites — persist a world's chosen character (world_data.characterId) to whichever store owns
  // it, via the single _persistWorldData writer (GAP-1: no more per-store duplication / oh- drift).
  async changeWorldCharacter(worldId, characterId) {
    if (!characterId) return;
    await this._persistWorldData(worldId, { characterId });
  },

  // §Custom Sprites Phase 2 — persist a BUILT custom character (characterId='custom' + the mix
  // {name,body,sel,pal}) via the same single writer. Returns true on success (the builder waits on it).
  async saveCustomCharacter(worldId, def) {
    return this._persistWorldData(worldId, { characterId: 'custom', customCharacter: def });
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
      if (dup && !(await DIALOG.confirm(`A world named “${name}” (or a copy of this one) is already in your online worlds.`, { title: 'Copy anyway?', okText: 'Copy anyway', cancelText: 'Go back' }))) return;
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
    if (!gameModeDefault) return;   // the "Set play mode…" placeholder — ignore
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
      if (w) {
        w.world_data = w.world_data || {}; w.world_data.gameModeDefault = gameModeDefault;
        if (w.world_data.viewMode === 'overhead') { w.world_data.mode = { NRM: 'platformer', PLT: 'platformer', RUN: 'speedrunner', ARN: 'arena' }[gameModeDefault] || w.world_data.mode; }
      }
      // If a mode filter is active, the card may no longer belong — refresh; otherwise
      // re-render in place so the badge/dropdown reflect the new mode immediately.
      if (this.currentFilter !== 'all') await this.loadWorlds();
      else if (typeof this.renderWorlds === 'function') this.renderWorlds(this.worlds);
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
    const input = await DIALOG.prompt('Rename world:', { title: 'Rename world', value: current });
    if (input == null) return;                 // cancelled
    const newName = input.trim();
    if (!newName || newName === current) return;
    // §B6 appropriateness filter — client-side (covers offline/local worlds that never hit the server,
    // and gives instant feedback for cloud worlds; the server re-checks authoritatively).
    if (typeof MODERATION !== 'undefined') {
      const mod = MODERATION.check(newName, 'world name');
      if (!mod.ok) { await DIALOG.alert(mod.reason, { title: 'Name not allowed' }); return; }
    }

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

  // §Epic C — edit a world's storefront description after creation (the create-time field was the only
  // way to set it before). Local worlds update in place; cloud worlds hit the lightweight /description route.
  async editDescription(worldId) {
    const w = this.worlds.find(x => x.id === worldId) ||
      (this._isLocalWorld(worldId) ? LOCAL_WORLDS.get(worldId) : null);
    const current = (w && w.description) || '';
    const input = await DIALOG.prompt('Description (shown in the storefront):', { title: 'Edit description', value: current, multiline: true });
    if (input == null) return;                 // cancelled
    const desc = input.trim();
    if (desc === current) return;
    if (typeof MODERATION !== 'undefined') {
      const mod = MODERATION.check(desc, 'description');
      if (!mod.ok) { await DIALOG.alert(mod.reason, { title: 'Description not allowed' }); return; }
    }
    if (this._isLocalWorld(worldId)) {
      if (LOCAL_WORLDS.update) LOCAL_WORLDS.update(worldId, { description: desc });
      const c = this.worlds.find(x => x.id === worldId); if (c) c.description = desc;
      this.loadWorlds();
      return;
    }
    try {
      const res = await AUTH.authedFetch(`/api/worlds/sandbox/${worldId}/description`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: desc }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); await DIALOG.alert(d.error || 'Failed to update description', { title: 'Error' }); return; }
      const c = this.worlds.find(x => x.id === worldId); if (c) c.description = desc;
      this.loadWorlds();
    } catch (error) {
      console.error('Description edit error:', error);
      await DIALOG.alert('Failed to update description', { title: 'Error' });
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

    // §Epic C — Overhead folds into this one Create World door: delegate to the overhead editor's own
    // new-world setup (grid size + density live there). Name/description from this form are optional here.
    if (gameModeDefault === 'OVH') {
      this.hideCreateWorldModal();
      if (typeof OH_EDITOR !== 'undefined' && OH_EDITOR.open) OH_EDITOR.open();
      else await DIALOG.alert('Overhead editor unavailable', { title: 'Error' });
      return;
    }

    if (!name) { alert('World name required'); return; }
    // §B6 appropriateness filter — client-side on the world name + description (covers offline/local
    // worlds that never reach the server; the server re-checks online creates authoritatively).
    if (typeof MODERATION !== 'undefined') {
      const modN = MODERATION.check(name, 'world name');
      if (!modN.ok) { await DIALOG.alert(modN.reason, { title: 'Name not allowed' }); return; }
      const modD = MODERATION.check(description, 'description');
      if (!modD.ok) { await DIALOG.alert(modD.reason, { title: 'Description not allowed' }); return; }
    }

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

  // Report an import failure IN THE PAGE. Native alert()s park the renderer until a
  // human dismisses them, so an automated session can't see, screenshot or clear one —
  // and the success path was already in-page. Falls back to alert() only if the element
  // is missing (e.g. an older cached index.html). (QA build 346, F4.)
  _importError(msg) {
    const el = document.getElementById('import-file-error');
    if (!el) { alert(msg); return; }
    el.textContent = msg;
    el.style.display = 'block';
  },
  _clearImportError() {
    const el = document.getElementById('import-file-error');
    if (el) { el.textContent = ''; el.style.display = 'none'; }
  },

  // In-page confirmation — NEVER a native confirm()/alert(). A native dialog parks the
  // renderer until a human clicks it and is invisible to automation, so it blocks an
  // unattended QA run; world-card Delete was the last one in this flow. Built dynamically so
  // it does not depend on index.html markup (works on any cached shell) and is screenshottable.
  // The CANCEL button is primary + focused, so a stray Enter never triggers the destructive
  // action (the F9 lesson). Esc or a backdrop click cancels. `opts`: { title, body,
  // confirmLabel, cancelLabel, danger, onConfirm }.
  _confirmAction(opts) {
    opts = opts || {};
    const old = document.getElementById('sb-confirm-modal'); if (old && old.remove) old.remove();
    const wrap = document.createElement('div'); wrap.id = 'sb-confirm-modal';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:9500;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55)';
    const btn = (id, txt, bg) => `<button id="${id}" style="background:${bg};border:1px solid #46557a;color:#fff;border-radius:7px;padding:8px 14px;cursor:pointer;font:14px sans-serif">${txt}</button>`;
    wrap.innerHTML = `<div role="dialog" aria-modal="true" style="background:#1a2233;border:1px solid #46557a;border-radius:12px;padding:18px 20px;max-width:360px;box-shadow:0 8px 30px rgba(0,0,0,.6);color:#dfe7f5">`
      + `<div style="font-weight:600;font-size:15px;margin-bottom:6px">${opts.title || 'Are you sure?'}</div>`
      + `<div style="color:#b6c2da;font:13px sans-serif;margin-bottom:16px">${opts.body || ''}</div>`
      + `<div style="display:flex;gap:8px;justify-content:flex-end">`
      + btn('sb-confirm-cancel', opts.cancelLabel || 'Cancel', '#2b3548')
      + btn('sb-confirm-ok', opts.confirmLabel || 'OK', opts.danger ? '#7a2b2b' : '#2f6f4f')
      + `</div></div>`;
    document.body.appendChild(wrap);
    const close = () => { if (wrap.remove) wrap.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape' || e.code === 'Escape') close(); };
    wrap.querySelector('#sb-confirm-ok').onclick = () => { close(); if (opts.onConfirm) opts.onConfirm(); };
    wrap.querySelector('#sb-confirm-cancel').onclick = close;
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    document.addEventListener('keydown', onKey);
    const cancel = wrap.querySelector('#sb-confirm-cancel'); if (cancel && cancel.focus) cancel.focus();
    return wrap;
  },

  // ── §Epic D — Level Challenges (per-level achievements) editor ──
  // Up to 3 goals stored on world_data.worldAdvSettings.achievements[]; evaluated by
  // ACHIEVEMENT_EVAL on level completion. Migration-free (rides the world save).
  editAchievements(g) {
    g = g || window.game; if (!g) return;
    const aws = g._worldAdvSettings || (g._worldAdvSettings = {});
    if (!Array.isArray(aws.achievements)) aws.achievements = [];
    const defs = aws.achievements.slice(0, 3);
    while (defs.length < 3) defs.push({ type: 'none' });
    const TYPES = [
      ['none', 'None'], ['collect', 'Collect N coins'], ['defeat', 'Defeat N enemies'],
      ['time', 'Finish under Ns'], ['nojump', 'Few jumps'], ['nodamage', 'No hazard damage'],
    ];
    const old = document.getElementById('sb-ach-modal'); if (old && old.remove) old.remove();
    const wrap = document.createElement('div'); wrap.id = 'sb-ach-modal';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:9500;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55)';
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const row = (d, i) => {
      const sel = TYPES.map(([v, l]) => `<option value="${v}"${v === d.type ? ' selected' : ''}>${l}</option>`).join('');
      return `<div class="sb-ach-row" data-i="${i}" style="display:flex;gap:6px;align-items:center;margin-bottom:8px">
        <span style="width:16px;color:#7f8db0">${i + 1}</span>
        <select class="sb-ach-type" style="flex:1;background:#111826;color:#dfe7f5;border:1px solid #46557a;border-radius:6px;padding:5px">${sel}</select>
        <span class="sb-ach-params" style="display:flex;gap:4px;align-items:center;min-width:120px"></span>
      </div>`;
    };
    wrap.innerHTML = `<div role="dialog" aria-modal="true" style="background:#1a2233;border:1px solid #46557a;border-radius:12px;padding:18px 20px;max-width:440px;width:92%;box-shadow:0 8px 30px rgba(0,0,0,.6);color:#dfe7f5">
      <div style="font-weight:600;font-size:15px;margin-bottom:4px">🏆 Level Challenges</div>
      <div style="color:#b6c2da;font:12px sans-serif;margin-bottom:14px">Up to 3 goals players earn by clearing this level. They fire on completion.</div>
      <div id="sb-ach-rows">${defs.map(row).join('')}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
        <button id="sb-ach-cancel" style="background:#2b3548;border:1px solid #46557a;color:#fff;border-radius:7px;padding:8px 14px;cursor:pointer;font:14px sans-serif">Cancel</button>
        <button id="sb-ach-save" style="background:#2f6f4f;border:1px solid #46557a;color:#fff;border-radius:7px;padding:8px 14px;cursor:pointer;font:14px sans-serif">Save</button>
      </div></div>`;
    document.body.appendChild(wrap);
    const numIn = (cls, val, min, max, w) => `<input type="number" class="${cls}" value="${esc(val)}" min="${min}" max="${max}" style="width:${w || 56}px;background:#111826;color:#dfe7f5;border:1px solid #46557a;border-radius:6px;padding:5px">`;
    const renderParams = (rowEl, d) => {
      const box = rowEl.querySelector('.sb-ach-params');
      if (d.type === 'collect') box.innerHTML = numIn('sb-ach-count', d.count || 5, 1, 999) + '<span style="color:#7f8db0;font:12px sans-serif">coins</span>';
      else if (d.type === 'defeat') box.innerHTML = numIn('sb-ach-count', d.count || 3, 1, 999) + '<span style="color:#7f8db0;font:12px sans-serif">enemies</span>';
      else if (d.type === 'time') box.innerHTML = numIn('sb-ach-seconds', d.seconds || 60, 1, 9999) + '<span style="color:#7f8db0;font:12px sans-serif">sec</span>';
      else if (d.type === 'nojump') box.innerHTML = numIn('sb-ach-max', d.max || 5, 0, 999) + '<span style="color:#7f8db0;font:12px sans-serif">jumps</span>';
      else box.innerHTML = '<span style="color:#7f8db0;font:12px sans-serif">' + (d.type === 'nodamage' ? '—' : '') + '</span>';
    };
    const state = defs.map((d) => Object.assign({}, d));
    wrap.querySelectorAll('.sb-ach-row').forEach((rowEl, i) => {
      renderParams(rowEl, state[i]);
      rowEl.querySelector('.sb-ach-type').onchange = (e) => { state[i].type = e.target.value; renderParams(rowEl, state[i]); };
    });
    const close = () => { if (wrap.remove) wrap.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    wrap.querySelector('#sb-ach-cancel').onclick = close;
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    document.addEventListener('keydown', onKey);
    wrap.querySelector('#sb-ach-save').onclick = () => {
      const out = [];
      wrap.querySelectorAll('.sb-ach-row').forEach((rowEl, i) => {
        const t = rowEl.querySelector('.sb-ach-type').value;
        if (t === 'none') return;
        const d = { type: t };
        const gv = (cls) => { const el = rowEl.querySelector('.' + cls); return el ? Math.round(+el.value) : 0; };
        if (t === 'collect') { d.count = gv('sb-ach-count'); d.item = 'coin'; }
        else if (t === 'defeat') d.count = gv('sb-ach-count');
        else if (t === 'time') d.seconds = gv('sb-ach-seconds');
        else if (t === 'nojump') d.max = gv('sb-ach-max');
        out.push(d);
      });
      aws.achievements = out;
      close();
      const msg = out.length ? (out.length + ' challenge' + (out.length > 1 ? 's' : '') + ' set — remember to Save your world') : 'Challenges cleared';
      const t = document.createElement('div');
      t.textContent = msg;
      t.style.cssText = 'position:fixed;left:50%;bottom:32px;transform:translateX(-50%);z-index:9600;background:#2f6f4f;color:#fff;border:1px solid #46557a;border-radius:8px;padding:9px 16px;font:13px sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.5)';
      document.body.appendChild(t);
      setTimeout(() => { if (t.remove) t.remove(); }, 2600);
    };
  },

  // ── §Epic MB — Beat Grid editor (tap-tempo / BPM) ──────────────
  // Stores { enabled, bpm, offsetMs } on worldAdvSettings.beatGrid; the sandbox editor overlays
  // beat lines (game._drawBeatGridOverlay). Tap-tempo uses BEAT_GRID.tapTempo (pure core).
  editBeatGrid(g) {
    g = g || window.game; if (!g) return;
    const aws = g._worldAdvSettings || (g._worldAdvSettings = {});
    const bg = Object.assign({ enabled: false, bpm: 120, offsetMs: 0 }, aws.beatGrid || {});
    // §Phase A — the level's music track (from the shared MUSIC_DISCS catalog); plays during the run and is
    // the source the "Detect beat" button analyzes. Background tracks only.
    const curSong = aws.levelMusicId || '';
    let songOpts = '<option value="">None (silent)</option>';
    if (typeof MUSIC_DISCS !== 'undefined') {
      for (const k of Object.keys(MUSIC_DISCS)) {
        const d = MUSIC_DISCS[k]; if (!d || d.category !== 'background') continue;
        songOpts += `<option value="${k}"${k === curSong ? ' selected' : ''}>${(d.discName || k).replace(/[<>&]/g, '')}</option>`;
      }
    }
    const old = document.getElementById('sb-beat-modal'); if (old && old.remove) old.remove();
    const wrap = document.createElement('div'); wrap.id = 'sb-beat-modal';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:9500;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55)';
    const inp = 'background:#111826;color:#dfe7f5;border:1px solid #46557a;border-radius:6px;padding:6px';
    wrap.innerHTML = `<div role="dialog" aria-modal="true" style="background:#1a2233;border:1px solid #46557a;border-radius:12px;padding:18px 20px;max-width:380px;width:92%;box-shadow:0 8px 30px rgba(0,0,0,.6);color:#dfe7f5">
      <div style="font-weight:600;font-size:15px;margin-bottom:4px">🎵 Beat Grid</div>
      <div style="color:#b6c2da;font:12px sans-serif;margin-bottom:14px">Pick a song, detect its beat, then place hazards on the beat lines. Most exact with Constant Speed on.</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span style="width:70px;color:#b6c2da;font:13px sans-serif">Song</span><select id="sb-beat-song" style="${inp};flex:1">${songOpts}</select></div>
      <button id="sb-beat-detect" style="${inp};background:#33499e;cursor:pointer;width:100%;margin-bottom:6px">♪ Detect beat from song</button>
      <div id="sb-beat-detectinfo" style="color:#7f8db0;font:12px sans-serif;min-height:14px;margin-bottom:12px"></div>
      <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;cursor:pointer"><input type="checkbox" id="sb-beat-enabled"${bg.enabled ? ' checked' : ''}> <span>Show beat lines in editor</span></label>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><span style="width:70px;color:#b6c2da;font:13px sans-serif">BPM</span><input type="number" id="sb-beat-bpm" value="${bg.bpm}" min="20" max="400" style="${inp};width:80px"><button id="sb-beat-tap" style="${inp};background:#33499e;cursor:pointer;flex:1">Tap tempo</button></div>
      <div id="sb-beat-tapinfo" style="color:#7f8db0;font:12px sans-serif;min-height:16px;margin-bottom:10px"></div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span style="width:70px;color:#b6c2da;font:13px sans-serif">Offset</span><input type="number" id="sb-beat-offset" value="${bg.offsetMs}" min="0" max="10000" step="10" style="${inp};width:80px"><span style="color:#7f8db0;font:12px sans-serif">ms (shift the first beat)</span></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
        <button id="sb-beat-cancel" style="${inp};background:#2b3548;cursor:pointer">Cancel</button>
        <button id="sb-beat-save" style="${inp};background:#2f6f4f;cursor:pointer">Save</button>
      </div></div>`;
    document.body.appendChild(wrap);
    let taps = [];
    const bpmEl = wrap.querySelector('#sb-beat-bpm');
    wrap.querySelector('#sb-beat-tap').onclick = () => {
      taps.push(Date.now());
      if (taps.length > 9) taps = taps.slice(-9);
      const bpm = (typeof BEAT_GRID !== 'undefined') ? BEAT_GRID.tapTempo(taps) : 0;
      if (bpm) { bpmEl.value = bpm; wrap.querySelector('#sb-beat-tapinfo').textContent = 'Tapped ' + taps.length + ' → ' + bpm + ' BPM'; }
      else wrap.querySelector('#sb-beat-tapinfo').textContent = 'Keep tapping to the beat…';
    };
    // §Phase A — decode the chosen catalog track in-browser and auto-fill BPM + offset (best effort).
    const songEl = wrap.querySelector('#sb-beat-song');
    const offEl = wrap.querySelector('#sb-beat-offset');
    const dInfo = wrap.querySelector('#sb-beat-detectinfo');
    wrap.querySelector('#sb-beat-detect').onclick = async () => {
      const id = songEl.value;
      if (!id || typeof MUSIC_DISCS === 'undefined' || !MUSIC_DISCS[id]) { dInfo.textContent = 'Pick a song first.'; return; }
      if (typeof BPM_DETECT === 'undefined') { dInfo.textContent = 'Detector unavailable.'; return; }
      dInfo.textContent = 'Analyzing…';
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        const ac = new AC();
        const resp = await fetch(MUSIC_DISCS[id].audioFile);
        const audio = await ac.decodeAudioData(await resp.arrayBuffer());
        // Decimate to ~11 kHz mono so the analysis is fast on a full-length track.
        const ch = audio.getChannelData(0), step = Math.max(1, Math.floor(audio.sampleRate / 11025));
        const small = new Float32Array(Math.floor(ch.length / step));
        for (let i = 0, j = 0; j < small.length; i += step, j++) small[j] = ch[i];
        const r = BPM_DETECT.analyze(small, audio.sampleRate / step);
        try { ac.close(); } catch (_) {}
        if (r.bpm) {
          bpmEl.value = r.bpm; offEl.value = r.offsetMs;
          dInfo.textContent = `Detected ${r.bpm} BPM (confidence ${Math.round((r.confidence || 0) * 100)}%) — adjust if needed.`;
        } else { dInfo.textContent = 'No clear beat found — set BPM manually.'; }
      } catch (e) { dInfo.textContent = 'Could not load/analyze that track.'; }
    };
    const close = () => { if (wrap.remove) wrap.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    wrap.querySelector('#sb-beat-cancel').onclick = close;
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    document.addEventListener('keydown', onKey);
    wrap.querySelector('#sb-beat-save').onclick = () => {
      aws.beatGrid = {
        enabled: wrap.querySelector('#sb-beat-enabled').checked,
        bpm: Math.max(20, Math.min(400, Math.round(+bpmEl.value) || 120)),
        offsetMs: Math.max(0, Math.round(+wrap.querySelector('#sb-beat-offset').value) || 0),
      };
      aws.levelMusicId = songEl.value || null;   // §Phase A — the track that plays during the run
      close();
    };
  },

  // ── Import from file ───────────────────────────────────────────
  showImportFileModal() {
    this._clearImportError();
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
    this._clearImportError();
    const reader = new FileReader();
    reader.onload = (e) => {
      const fileData = e.target.result;
      let parsed;
      try {
        parsed = JSON.parse(fileData);
      } catch (err) {
        this._importError('Invalid JSON file \u2014 that is not a world export.');
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
    if (!this.pendingFileImport) {
      // Distinguish "no file chosen" from "the chosen file could not be read". Reporting
      // "Choose a file first" while the filename is plainly visible in the picker is worse
      // than useless — it sends the user looking for the wrong problem. (QA A9, build 362.)
      const input = document.getElementById('world-file-input');
      const chosen = input && input.files && input.files[0];
      this._importError(chosen
        ? 'Could not read “' + chosen.name + '”. It is not valid JSON, so there is nothing to import.'
        : 'Choose a file first.');
      return;
    }
    const { fileData, fileMode, requestedMode, fileName } = this.pendingFileImport;

    if (fileMode !== requestedMode && !document.getElementById('confirm-mode-override').checked) {
      this._importError('Please confirm the mode conversion before importing.');
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

  // An OVERHEAD world can't go through the normal import path — that writes to
  // LOCAL_WORLDS / the side-scroll rows and forces the mode to NRM, so the world would
  // vanish from the Overhead view. Route it to the same places the overhead editor's
  // Save uses (own offline store, or a sandbox row + PUT when signed in).
  // Pick a display name not already taken in the offline overhead store, returning BOTH
  // it and its storage key. The first cut suffixed only the KEY, so five imports produced
  // five cards all reading "Overhead QA Test" with the same date — safe, but impossible to
  // tell apart. (QA build 346, F2.)
  _uniqueOverheadName(name) {
    const all = this._ohStore();
    let label = name, key = 'oh-' + name, n = 2;
    while (Object.prototype.hasOwnProperty.call(all, key)) { label = name + ' (' + n + ')'; key = 'oh-' + label; n++; }
    return { label, key };
  },

  async _importOverheadWorld(worldData, name) {
    const check = WORLD_TRANSFER.validateOverhead(worldData);
    if (!check.ok) { this._importError('That overhead world file looks damaged:\n• ' + check.errors.join('\n• ')); return null; }
    const wd = JSON.parse(JSON.stringify(worldData));
    wd.name = name;
    wd.viewMode = 'overhead';
    wd.gameModeDefault = 'NRM';
    if (typeof OH_SETTINGS !== 'undefined' && OH_SETTINGS.migrate) OH_SETTINGS.migrate(wd);   // upgrade old files on the way in
    // An import is a NEW world, so it gets its OWN creation date instead of inheriting the
    // source world's — otherwise every copy sorts identically under Newest. (F2.)
    wd.created_at = new Date().toISOString();

    if (typeof APP_MODE !== 'undefined' && APP_MODE.isLocal()) {
      const all = this._ohStore();
      const uniq = this._uniqueOverheadName(name);
      wd.name = uniq.label;                                     // the CARD title, not just the key
      all[uniq.key] = wd;
      try { localStorage.setItem('steveo_overhead_worlds', JSON.stringify(all)); }
      catch (e) { this._importError('Could not save the imported world — browser storage may be full.'); return null; }
      return uniq.label;
    }
    const cr = await AUTH.authedFetch('/api/worlds/sandbox/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worldName: name, description: wd.description || 'Overhead world', worldWidth: 25, worldHeight: 15, gameModeDefault: 'NRM' }) });
    const row = await cr.json();
    if (!cr.ok) { this._importError('Import failed: ' + (row.error || 'could not create the world')); return null; }
    const put = await AUTH.authedFetch('/api/worlds/sandbox/' + row.id, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worldData: wd, worldName: name }) });
    if (!put.ok) { const e = await put.json().catch(() => ({})); this._importError('Import failed: ' + (e.error || 'could not store the world')); return null; }
    return name;
  },

  async importFile(fileData, requestedMode, fileName) {
    // Overhead worlds branch first — same file format, different destination.
    if (typeof WORLD_TRANSFER !== 'undefined') {
      let pre;
      try { pre = JSON.parse(fileData); } catch (e) { this._importError('Invalid JSON file \u2014 that is not a world export.'); return; }
      const res = WORLD_TRANSFER.unwrap(pre, fileName);
      if (res.ok && res.isOverhead) {
        const imported = await this._importOverheadWorld(res.worldData, res.name);
        if (!imported) return;
        document.getElementById('file-import-section').style.display = 'none';
        document.getElementById('import-success-section').style.display = 'block';
        document.getElementById('imported-world-name').textContent = `Imported: ${imported} (🗺 Overhead)`;
        this.pendingFileImport = null;
        this.viewFilter = 'overhead'; this._syncViewToggle();     // show the view it landed in
        setTimeout(() => { this.hideImportFileModal(); this.currentPage = 0; this.loadWorlds(); }, 1500);
        return;
      }
      // A9.6: unwrap() rejects a file that is neither engine's world (the A9 non-world
      // guard). The overhead editor SHOWS that rejection (rejectionMessage); this importer
      // used to ignore res.ok and fall straight through to the raw local/server import — so
      // a wrong-engine or junk file was silently re-routed and (in local mode) written to the
      // list unvalidated. It now surfaces the same explicit reason and stops, in every mode,
      // in-page (never a native alert — those park the renderer and are invisible to QA).
      if (!res.ok) { this._importError(res.error || 'That file is not a Steveo world — there is nothing to import.'); return; }
    }
    if (typeof APP_MODE !== 'undefined' && APP_MODE.isLocal()) {
      let parsed;
      try { parsed = JSON.parse(fileData); } catch (e) { this._importError('Invalid JSON file \u2014 that is not a world export.'); return; }
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
  // §Epic C — Overhead is now a mode here too; it delegates to the overhead editor's own new-world
  // setup (grid size + density), so we hide the side-scroll size fields and show a short note.
  _applyModeDimLock(mode) {
    const arena = mode === 'ARN';
    const overhead = mode === 'OVH';
    const opts  = document.getElementById('create-arena-options');
    const note  = document.getElementById('game-mode-default-note');
    const sizeRow = document.getElementById('create-size-row');
    if (opts) opts.style.display = arena ? 'block' : 'none';
    if (sizeRow) sizeRow.style.display = overhead ? 'none' : (sizeRow.style.display || 'flex');
    if (note) note.textContent = arena
      ? 'Arena: choose Single-Screen (size preset) or Scrolling (free size).'
      : overhead
      ? 'Overhead (top-down): Create opens the overhead editor to pick grid size + density.'
      : 'What mode should this world open in by default?';
    if (overhead) return;   // skip the side-scroll size re-enable + arena vis for overhead
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
  async exportWorld() { return this.exportWorldById(this.selectedWorldId); },

  // Run an OVERHEAD world through the migrator before it goes into a file.
  //
  // The card export serialises the world as STORED, while the editor's ⬇ Export
  // serialises the world it has already migrated in memory on load — so the same world
  // exported the two ways disagreed, and a pre-345 world could round-trip through files
  // forever without ever being stamped. Migrating a COPY here (never the stored object)
  // makes both paths agree. (QA build 346, F1 / M3.)
  _exportReady(wd) {
    if (!wd || typeof wd !== 'object') return wd;
    if (typeof WORLD_TRANSFER === 'undefined' || !WORLD_TRANSFER.isOverheadData(wd)) return wd;
    const copy = JSON.parse(JSON.stringify(wd));
    if (typeof OH_SETTINGS !== 'undefined' && OH_SETTINGS.migrate) OH_SETTINGS.migrate(copy);
    return copy;
  },

  // Per-world Export (one button per card, both views). Resolves the world from
  // whichever store it actually lives in — the OFFLINE OVERHEAD store included, which
  // is why overhead worlds previously had no export path at all and the QA fixture had
  // to be recovered by reading localStorage. Falls back to the server endpoint for a
  // cloud world whose row isn't in the loaded page.
  async exportWorldById(worldId) {
    if (!worldId) { alert('No world loaded'); return; }
    if (typeof WORLD_TRANSFER === 'undefined') { alert('Export unavailable'); return; }
    const stamp = { exportedAt: new Date().toISOString() };
    const send = (wd, name, description, mode) => {
      const payload = WORLD_TRANSFER.wrap(this._exportReady(wd), Object.assign({ name, description, mode }, stamp));
      WORLD_TRANSFER.download(payload, WORLD_TRANSFER.filename(name, WORLD_TRANSFER.today()));
    };

    // 1. Overhead world saved offline (own store, keyed "oh-<name>").
    const ohAll = this._ohStore();
    if (Object.prototype.hasOwnProperty.call(ohAll, worldId)) {
      const wd = ohAll[worldId] || {};
      send(wd, wd.name || String(worldId).replace(/^oh-/, ''), wd.description || '', wd.gameModeDefault || 'NRM');
      return;
    }
    // 2. Local (offline) side-scroll world.
    if (this._isLocalWorld(worldId)) {
      const w = LOCAL_WORLDS.get(worldId);
      if (!w) { alert('World not found'); return; }
      send(w.world_data, w.world_name, w.description, (w.world_data && w.world_data.gameModeDefault) || 'NRM');
      return;
    }
    // 3. A cloud row already loaded in this page (has world_data) — no round trip.
    const row = (this.worlds || []).find(w => w.id === worldId);
    if (row && row.world_data) {
      send(row.world_data, row.world_name, row.description, (row.world_data && row.world_data.gameModeDefault) || 'NRM');
      return;
    }
    // 4. Cloud fallback — the server's export endpoint.
    try {
      const res = await AUTH.authedFetch(`/api/worlds/sandbox/${worldId}/export`);
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
      } else if (this._isOfflineOverhead(worldId)) {
        const wd = this._ohStore()[worldId];
        if (!wd) { alert('World not found'); return; }
        world = { id: worldId, world_name: wd.name || worldId.replace(/^oh-/, ''), world_data: wd };
      } else {
        const res = await AUTH.authedFetch(`/api/worlds/sandbox/${worldId}`);
        if (!res.ok) { alert('Failed to load world'); return; }
        world = await res.json();
      }

      // Overhead-Engine worlds open in the overhead editor, not the side-view one.
      if (this._isOverhead(world) && typeof OH_EDITOR !== 'undefined') {
        OH_EDITOR.open(world);
        return;
      }

      this.selectedWorldId = worldId;
      this.currentWorldData = world;
      // Publishing is an online-only (community) action.
      const pubBtn = document.getElementById('sb-publish-btn');
      if (pubBtn) pubBtn.style.display = local ? 'none' : '';
      // §40.1: hide the editor HUD Export for a world marked "Hide from export". The owner
      // keeps control — they can turn the flag off in World Settings (only Sandbox can), and
      // the server still lets the owner export their own world; this just removes the button.
      const exBtn = document.getElementById('sb-export-btn');
      if (exBtn) exBtn.style.display = (typeof WORLD_TRANSFER !== 'undefined' && WORLD_TRANSFER.exportHidden(world.world_data)) ? 'none' : '';

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
        // §B4 — publishing makes the level downloadable by default (creators can opt out later; a
        // per-world Downloadable toggle in World Settings is a documented follow-up).
        body: JSON.stringify({ isPublished, downloadable: isPublished }),
      });
      const data = await res.json();
      if (!res.ok) { alert(`Error: ${data.error}`); return; }

      this.currentWorldData.is_published = isPublished;
      if (isPublished) this.captureThumbnail(this.selectedWorldId);   // §B1 best-effort auto-thumbnail
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
    if (this._isOfflineOverhead(worldId)) {
      const all = this._ohStore(); delete all[worldId];
      try { localStorage.setItem('steveo_overhead_worlds', JSON.stringify(all)); } catch (e) {}
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

// Expose on window. A top-level `const SANDBOX` is a global LEXICAL binding (reachable by bare name in
// same-realm scripts) but is NOT a window property — so cross-module code that guarded on
// `window.SANDBOX` (e.g. character-builder.js _save) silently saw undefined and no-op'd (Phase 2 save
// blocker, tester build 439). Publishing it here fixes that and matches window.CHARACTER_BUILDER etc.
if (typeof window !== 'undefined') window.SANDBOX = SANDBOX;
if (typeof module !== 'undefined' && module.exports) module.exports = { SANDBOX };   // headless tests (store-routing)
