// ============================================================
// arena-select.js — Arena picker (Phase 3A.1)
//
// Dashboard "⚔ Arena" tile → ARENA_SELECT.init(). Lists the player's arena
// (ARN) worlds plus a Quick Play card (built-in Deathmatch), and launches the
// chosen world as `new Game('arena', { templateData })`. On exit it returns to
// this picker. Phase 3A.2 inserts a game-mode selector ahead of launch.
//
// Worlds render as dashboard-style tiles in a 3-per-row grid, with a game-type
// filter (by the modes a map is designed for) and client-side pagination so any
// number of worlds is browsable.
// ============================================================

const ARENA_SELECT = {
  allWorlds: [],     // every arena world (all server pages)
  items: [],         // Quick-Play sentinel (when unfiltered) + filtered worlds
  page: 0,
  perPage: 9,        // 3 columns × 3 rows
  typeFilter: 'all',
  _backBound: false,
  _QUICK: { __quick: true },

  async init() {
    document.getElementById('dashboard-screen').style.display = 'none';
    document.getElementById('arena-select-screen').style.display = 'block';
    this._bindStatic();
    await this.loadWorlds();
  },

  _bindStatic() {
    if (this._backBound) return;
    this._backBound = true;
    document.getElementById('arena-back-btn')?.addEventListener('click', () => this.goBack());
    document.getElementById('arena-leaderboards-btn')?.addEventListener('click', () => {
      if (typeof LEADERBOARD_SYSTEM !== 'undefined') LEADERBOARD_SYSTEM.showModal();
    });
    document.getElementById('arena-type-filter')?.addEventListener('change', (e) => {
      this.typeFilter = e.target.value || 'all';
      this.page = 0;
      this._applyFilterAndRender();
    });
    document.getElementById('arena-prev-page-btn')?.addEventListener('click', () => {
      if (this.page > 0) { this.page--; this.render(); }
    });
    document.getElementById('arena-next-page-btn')?.addEventListener('click', () => {
      if (this.page < this._totalPages() - 1) { this.page++; this.render(); }
    });
  },

  // Page through ALL of the player's arena worlds (server pages are 50 each),
  // so the filter and pagination operate on the complete set.
  async loadWorlds() {
    this.allWorlds = [];
    try {
      let page = 0, totalPages = 1;
      do {
        const res = await AUTH.authedFetch(`/api/worlds/sandbox?page=${page}&filter=arena&sort=newest`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'request failed');
        this.allWorlds.push(...(data.worlds || []));
        totalPages = data.totalPages || 1;
        page++;
      } while (page < totalPages && page < 50); // safety cap
    } catch (error) {
      console.error('Load arena worlds error:', error);
      this.allWorlds = [];
    }
    this._populateTypeFilter();
    this.page = 0;
    this._applyFilterAndRender();
  },

  // Build the game-type dropdown from ARENA_MODES.DEFS (once).
  _populateTypeFilter() {
    const sel = document.getElementById('arena-type-filter');
    if (!sel || typeof ARENA_MODES === 'undefined' || sel.options.length > 1) return;
    for (const key of Object.keys(ARENA_MODES.DEFS)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = ARENA_MODES.DEFS[key].label;
      sel.appendChild(opt);
    }
  },

  // Does a world's design support a given arena mode? Based on the special
  // elements placed in the map (most modes auto-anchor to spawns, so this
  // reflects what the map was *designed* for). DEATHMATCH/CUSTOM fit any map.
  _supports(wd, key) {
    if (!wd) return key === 'DEATHMATCH' || key === 'CUSTOM';
    const objs   = Array.isArray(wd.arenaObjects) ? wd.arenaObjects : [];
    const bases  = objs.filter(o => o && o.type === 'base').length;
    const towers = objs.filter(o => o && o.type === 'tower').length;
    const hasHill     = !!(wd.placedHill && typeof wd.placedHill.col === 'number');
    const hasEmeralds = Array.isArray(wd.emeralds) && wd.emeralds.length > 0;
    const hasSpawns   = (Array.isArray(wd.spawnEggs) && wd.spawnEggs.length > 0)
                     || (Array.isArray(wd.spawnLines) && wd.spawnLines.length > 0);
    const pSpawns     = Array.isArray(wd.playerSpawns) ? wd.playerSpawns.length : 0;
    switch (key) {
      case 'KING_OF_HILL':     return hasHill;
      case 'COLLECT_EMERALDS': return hasEmeralds;
      case 'CAPTURE_FLAG':     return bases >= 2 || pSpawns >= 2;
      case 'DEFEND_TOWER':     return towers >= 1;
      case 'MOB_HUNTER':
      case 'SURVIVAL_WAVES':   return hasSpawns;
      case 'DEATHMATCH':
      case 'CUSTOM':           return true;
      default:                 return true;
    }
  },

  // Short chips describing the special elements a map contains.
  _badges(wd) {
    if (!wd) return [];
    const objs = Array.isArray(wd.arenaObjects) ? wd.arenaObjects : [];
    const b = [];
    if (wd.placedHill && typeof wd.placedHill.col === 'number') b.push('Hill');
    if (Array.isArray(wd.emeralds) && wd.emeralds.length) b.push('Emeralds');
    if (objs.filter(o => o && o.type === 'base').length >= 2) b.push('CTF');
    if (objs.some(o => o && o.type === 'tower')) b.push('Tower');
    if ((Array.isArray(wd.spawnEggs) && wd.spawnEggs.length) ||
        (Array.isArray(wd.spawnLines) && wd.spawnLines.length)) b.push('Bots');
    if (!b.length) b.push('PvP');
    return b;
  },

  _totalPages() { return Math.max(1, Math.ceil(this.items.length / this.perPage)); },

  _applyFilterAndRender() {
    const type = this.typeFilter || 'all';
    const worlds = (type === 'all')
      ? this.allWorlds.slice()
      : this.allWorlds.filter(w => this._supports(w.world_data, type));
    // Quick Battle (built-in bot arena) shows only when unfiltered.
    this.items = (type === 'all') ? [this._QUICK, ...worlds] : worlds;
    const tp = this._totalPages();
    if (this.page >= tp) this.page = tp - 1;
    if (this.page < 0) this.page = 0;
    this.render();
  },

  render() {
    const list = document.getElementById('arena-world-list');
    if (!list) return;

    const start = this.page * this.perPage;
    const pageItems = this.items.slice(start, start + this.perPage);

    const html = pageItems.map(item => {
      if (item.__quick) {
        return `
          <div class="arena-tile arena-quickplay-card">
            <div class="mode-icon">⚔️</div>
            <h3>Quick Battle</h3>
            <p>Jump straight into the built-in bot arena.</p>
            <button class="btn btn-primary arena-quickplay-btn">Play</button>
          </div>`;
      }
      const w = item;
      const badges = this._badges(w.world_data)
        .map(t => `<span class="arena-badge">${this._esc(t)}</span>`).join('');
      return `
        <div class="arena-tile" data-tile-world-id="${w.id}">
          <div class="mode-icon">🗺️</div>
          <h3>${this._esc(w.world_name)}${w.is_published ? ' <span class="published-badge">Published</span>' : ''}</h3>
          <p>${this._esc(w.description) || '(No description)'}</p>
          <div class="arena-tile-badges">${badges}</div>
          <div class="arena-tile-actions">
            <button class="btn btn-primary arena-play-btn" data-world-id="${w.id}">Play</button>
          </div>
        </div>`;
    }).join('');

    list.innerHTML = html || (this.typeFilter === 'all'
      ? '<p class="world-list-empty">No arena worlds yet. Create one in Sandbox (Arena mode).</p>'
      : '<p class="world-list-empty">No arena worlds designed for this game type. Try “All types”.</p>');

    // Pagination readout + button state
    const tp = this._totalPages();
    const info = document.getElementById('arena-page-info');
    if (info) info.textContent = `Page ${this.page + 1} of ${tp}`;
    const prev = document.getElementById('arena-prev-page-btn');
    const next = document.getElementById('arena-next-page-btn');
    if (prev) prev.disabled = this.page <= 0;
    if (next) next.disabled = this.page >= tp - 1;

    list.querySelector('.arena-quickplay-btn')?.addEventListener('click', () => this.play(null));
    list.querySelectorAll('.arena-play-btn').forEach(btn =>
      btn.addEventListener('click', (e) => this.play(e.currentTarget.dataset.worldId)));

    // Async: add a "View Leaderboard" button to any tile whose world already has
    // a recorded Leader (so tiles nobody has played stay uncluttered).
    this._enhanceLeaderButtons(pageItems.filter(it => !it.__quick).map(w => w.id));
  },

  // Fetch the reigning leaders for the visible worlds (one request) and inject a
  // "View Leaderboard" button into each tile that has at least one.
  async _enhanceLeaderButtons(worldIds) {
    if (typeof LEADERBOARD_SYSTEM === 'undefined' || !LEADERBOARD_SYSTEM.fetchWorldLeaders || !worldIds.length) return;
    const list = document.getElementById('arena-world-list');
    if (!list) return;
    const token = (this._leaderToken = (this._leaderToken || 0) + 1);
    let leaders;
    try { leaders = await LEADERBOARD_SYSTEM.fetchWorldLeaders(worldIds); }
    catch { return; }
    if (token !== this._leaderToken) return; // a newer render superseded this one
    for (const wid of worldIds) {
      const modes = leaders[wid] ? Object.keys(leaders[wid]) : [];
      if (!modes.length) continue;
      const tile = list.querySelector(`.arena-tile[data-tile-world-id="${wid}"]`);
      const actions = tile && tile.querySelector('.arena-tile-actions');
      if (!actions || actions.querySelector('.arena-lb-btn')) continue;
      const worldName = tile.querySelector('h3')?.textContent || 'World';
      const btn = document.createElement('button');
      btn.className = 'btn btn-secondary arena-lb-btn';
      btn.textContent = '🏆 View Leaderboard';
      btn.addEventListener('click', () => LEADERBOARD_SYSTEM.showWorldModal(wid, worldName, modes));
      actions.appendChild(btn);
    }
  },

  // Fetch the chosen world's data (null → Quick Play built-in map), then launch.
  async play(worldId) {
    let templateData = null;
    if (worldId) {
      try {
        const res = await AUTH.authedFetch(`/api/worlds/sandbox/${worldId}`);
        if (!res.ok) { alert('Failed to load world'); return; }
        const world = await res.json();
        templateData = world.world_data || null;
      } catch (error) {
        console.error('Load arena world error:', error);
        alert('Failed to load world');
        return;
      }
    }
    this.chooseMode(mode => {
      // Custom Rules opens the rules builder; other real types go through the
      // pre-launch settings modal; null "Quick Battle" launches straight away.
      // worldId is threaded through so per-world leaderboards record correctly.
      if (mode === 'CUSTOM' && typeof CUSTOM_RULES_UI !== 'undefined' && CUSTOM_RULES_UI.show) {
        CUSTOM_RULES_UI.show((cfg) => this._launch(templateData, { arenaGameMode: 'CUSTOM', arenaConfig: cfg }, worldId));
      } else if (mode && typeof ARENA_PRELAUNCH !== 'undefined' && ARENA_PRELAUNCH.show) {
        ARENA_PRELAUNCH.show(mode, (cfg) => this._launch(templateData, { arenaGameMode: mode, arenaConfig: cfg }, worldId));
      } else {
        this._launch(templateData, mode ? { arenaGameMode: mode } : {}, worldId);
      }
    });
  },

  // Show the game-mode picker, then call onPick(modeKeyOrNull). Reused by the
  // editor's "Test in Arena" too. null → Phase 3A.1 classic Deathmatch.
  chooseMode(onPick) {
    const modal = document.getElementById('arena-mode-select-modal');
    const list  = document.getElementById('arena-mode-list');
    if (!modal || !list || typeof ARENA_MODES === 'undefined') { onPick(null); return; }

    const modes = [
      { key: null, label: 'Quick Battle (vs bots)', desc: 'Defeat the default bots.' },
      // Playable game types, then greyed coming-soon (PvP) types (Phase 3A.3).
      ...Object.keys(ARENA_MODES.DEFS).map(k => ({
        key: k, label: ARENA_MODES.DEFS[k].label, desc: ARENA_MODES.DEFS[k].desc,
        disabled: !!ARENA_MODES.DEFS[k].comingSoon,
      })),
    ];
    list.innerHTML = modes.map(m =>
      `<button class="btn ${m.disabled ? 'btn-secondary' : 'btn-primary'} arena-mode-opt" data-mode="${m.key || ''}"
               ${m.disabled ? 'disabled' : ''}
               style="display:block;width:100%;margin:6px 0;text-align:left;${m.disabled ? 'opacity:0.5;cursor:not-allowed;' : ''}">
         <strong>${this._esc(m.label)}</strong><br>
         <span style="font-size:0.8em;opacity:0.8;">${this._esc(m.desc)}</span>
       </button>`).join('');

    const close = () => { modal.style.display = 'none'; };
    list.querySelectorAll('.arena-mode-opt').forEach(btn =>
      btn.addEventListener('click', () => { if (btn.disabled) return; close(); onPick(btn.dataset.mode || null); }));
    document.getElementById('arena-mode-cancel-btn').onclick = close;
    modal.style.display = 'flex';
  },

  // Single launch path (Phase 3A.2 wraps this with a mode selector).
  _launch(templateData, extraOptions = {}, worldId = null) {
    if (window.menu && typeof window.menu._stop === 'function') window.menu._stop();
    if (window.game && typeof window.game.destroy === 'function') window.game.destroy();
    document.getElementById('arena-select-screen').style.display = 'none';

    const options = Object.assign({}, extraOptions);
    if (templateData) options.templateData = templateData;
    if (worldId) options.worldId = worldId; // per-world leaderboard recording

    window.game = new Game('arena', options, () => {
      window.game = null;
      // Return to the picker after the match ends / Esc.
      document.getElementById('arena-select-screen').style.display = 'block';
      this.loadWorlds();
    });
  },

  goBack() {
    document.getElementById('arena-select-screen').style.display = 'none';
    document.getElementById('dashboard-screen').style.display = 'block';
    if (typeof DASHBOARD !== 'undefined' && DASHBOARD._loadMostRecentWorld) DASHBOARD._loadMostRecentWorld();
  },

  _esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },
};

if (typeof window !== 'undefined') window.ARENA_SELECT = ARENA_SELECT;
