// ============================================================
// arena-select.js — Arena picker (Phase 3A.1)
//
// Dashboard "⚔ Arena" tile → ARENA_SELECT.init(). Lists the player's arena
// (ARN) worlds plus a Quick Play card (built-in Deathmatch), and launches the
// chosen world as `new Game('arena', { templateData })`. On exit it returns to
// this picker. Phase 3A.2 inserts a game-mode selector ahead of launch.
// ============================================================

const ARENA_SELECT = {
  worlds: [],
  _backBound: false,

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
  },

  async loadWorlds() {
    const list = document.getElementById('arena-world-list');
    try {
      const res = await AUTH.authedFetch('/api/worlds/sandbox?page=0&filter=arena&sort=newest');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'request failed');
      this.worlds = data.worlds || [];
    } catch (error) {
      console.error('Load arena worlds error:', error);
      this.worlds = [];
    }
    this.render();
  },

  render() {
    const list = document.getElementById('arena-world-list');
    if (!list) return;

    // Quick Play card (built-in map) is always first.
    const quickCard = `
      <div class="world-card arena-quickplay-card">
        <div class="world-card-header"><h3>⚔️ Quick Play</h3></div>
        <p>Jump straight into the built-in Deathmatch arena.</p>
        <div class="world-card-actions">
          <button class="btn btn-primary arena-quickplay-btn">Play</button>
        </div>
      </div>`;

    const worldCards = this.worlds.map(w => `
      <div class="world-card">
        <div class="world-card-header">
          <h3>${this._esc(w.world_name)}</h3>
          ${w.is_published ? '<span class="published-badge">Published</span>' : ''}
        </div>
        <p>${this._esc(w.description) || '(No description)'}</p>
        <p class="world-card-meta">Created: ${new Date(w.created_at).toLocaleDateString()}</p>
        <div class="world-card-actions">
          <button class="btn btn-primary arena-play-btn" data-world-id="${w.id}">Play</button>
        </div>
      </div>`).join('');

    list.innerHTML = quickCard + (worldCards ||
      '<p class="world-list-empty">No arena worlds yet. Create one in Sandbox (Arena mode).</p>');

    list.querySelector('.arena-quickplay-btn')?.addEventListener('click', () => this.play(null));
    list.querySelectorAll('.arena-play-btn').forEach(btn =>
      btn.addEventListener('click', (e) => this.play(e.currentTarget.dataset.worldId)));
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
    this.chooseMode(mode => this._launch(templateData, mode ? { arenaGameMode: mode } : {}));
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
  _launch(templateData, extraOptions = {}) {
    if (window.menu && typeof window.menu._stop === 'function') window.menu._stop();
    if (window.game && typeof window.game.destroy === 'function') window.game.destroy();
    document.getElementById('arena-select-screen').style.display = 'none';

    const options = Object.assign({}, extraOptions);
    if (templateData) options.templateData = templateData;

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
