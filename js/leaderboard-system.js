// ============================================================
// leaderboard-system.js — Arena per-mode leaderboards client (Phase 3A.2)
//
// Submits results on mode end (called from Game._submitArenaResultOnce) and
// renders a top-10 modal reachable from the arena picker. Uses AUTH.authedFetch
// against /api/arena/* (server/arena-leaderboard-routes.js).
// ============================================================

const LEADERBOARD_SYSTEM = {
  MODE_LABELS: {
    MOB_HUNTER: 'Mob Hunter',
    COLLECT_EMERALDS: 'Collect Emeralds',
    KING_OF_HILL: 'King of the Hill',
    SURVIVAL_WAVES: 'Survival Waves',
  },

  async submit(mode, score, duration, worldId) {
    if (!mode || typeof AUTH === 'undefined' || !AUTH.authedFetch) return;
    try {
      await AUTH.authedFetch('/api/arena/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, score, duration, worldId: worldId || undefined }),
      });
    } catch (e) {
      console.error('Leaderboard submit failed:', e);
    }
  },

  async fetch(mode, limit = 10, worldId) {
    if (typeof AUTH === 'undefined' || !AUTH.authedFetch) return [];
    try {
      const q = worldId ? `&worldId=${encodeURIComponent(worldId)}` : '';
      const res = await AUTH.authedFetch(`/api/arena/leaderboards/${mode}?limit=${limit}${q}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.results || [];
    } catch (e) {
      console.error('Leaderboard fetch failed:', e);
      return [];
    }
  },

  // The single current Leader (top scorer) for a (mode, world). worldId omitted
  // → the global leader for that mode (used by Quick Battle). Returns null if
  // nobody has scored yet. Shown on the match-end screen + pause menu.
  async fetchLeader(mode, worldId) {
    const rows = await this.fetch(mode, 1, worldId);
    return rows.length ? rows[0] : null;
  },

  // Batch: the reigning leader per (world, mode) for a list of worlds, in one
  // request. Powers the arena tiles' "View Leaderboard" button (which only
  // appears once a world has at least one recorded Leader). Returns a map
  // { [worldId]: { [mode]: { player_name, score, created_at } } }.
  async fetchWorldLeaders(worldIds) {
    if (typeof AUTH === 'undefined' || !AUTH.authedFetch) return {};
    const ids = (worldIds || []).filter(Boolean);
    if (!ids.length) return {};
    try {
      const res = await AUTH.authedFetch(`/api/arena/world-leaders?worldIds=${encodeURIComponent(ids.join(','))}`);
      if (!res.ok) return {};
      const data = await res.json();
      return data.leaders || {};
    } catch (e) {
      console.error('World leaders fetch failed:', e);
      return {};
    }
  },

  // All modes that can appear as a leaderboard tab (matches server VALID_MODES).
  ALL_MODE_LABELS: {
    MOB_HUNTER: 'Mob Hunter',
    COLLECT_EMERALDS: 'Collect Emeralds',
    KING_OF_HILL: 'King of the Hill',
    SURVIVAL_WAVES: 'Survival Waves',
    DEATHMATCH: 'Deathmatch',
    CAPTURE_FLAG: 'Capture the Flag',
  },

  // Global (all-worlds) leaderboards — the top-of-arena "🏆 Leaderboards" button.
  async showModal(mode = 'MOB_HUNTER') {
    this._ctx = { worldId: null, modes: Object.keys(this.MODE_LABELS), title: '🏆 Arena Leaderboards' };
    await this._openModal(mode);
  },

  // World-specific leaderboards — the per-tile / pause-menu "View Leaderboard"
  // button. `modes` limits the tabs to the game types that have a recorded
  // Leader for this world (falls back to all modes with records for the world).
  async showWorldModal(worldId, worldName, modes) {
    if (!worldId) return this.showModal();
    const avail = (modes && modes.length) ? modes : Object.keys(this.ALL_MODE_LABELS);
    this._ctx = { worldId, modes: avail, title: `🏆 ${worldName || 'World'} — Leaders` };
    await this._openModal(avail[0]);
  },

  async _openModal(mode) {
    const modal = document.getElementById('arena-leaderboard-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    const titleEl = modal.querySelector('h3');
    if (titleEl && this._ctx) titleEl.textContent = this._ctx.title;
    const closeBtn = document.getElementById('lb-close-btn');
    if (closeBtn) closeBtn.onclick = () => { modal.style.display = 'none'; };
    this._renderTabs(mode);
    await this._renderList(mode);
  },

  _label(k) { return this.ALL_MODE_LABELS[k] || this.MODE_LABELS[k] || k; },

  _renderTabs(active) {
    const tabs = document.getElementById('lb-tabs');
    if (!tabs) return;
    const keys = (this._ctx && this._ctx.modes) || Object.keys(this.MODE_LABELS);
    tabs.innerHTML = keys.map(k =>
      `<button class="btn ${k === active ? 'btn-primary' : 'btn-secondary'} lb-tab" data-mode="${k}">${this._esc(this._label(k))}</button>`
    ).join(' ');
    tabs.querySelectorAll('.lb-tab').forEach(b =>
      b.addEventListener('click', () => this._openModal(b.dataset.mode)));
  },

  async _renderList(mode) {
    const list = document.getElementById('lb-list');
    if (!list) return;
    list.innerHTML = '<p>Loading…</p>';
    const worldId = this._ctx ? this._ctx.worldId : null;
    const rows = await this.fetch(mode, 10, worldId);
    if (!rows.length) {
      list.innerHTML = '<p class="world-list-empty">No scores yet. Be the first!</p>';
      return;
    }
    list.innerHTML = `<ol class="lb-ol">${rows.map(r =>
      `<li><span class="lb-name">${this._esc(r.player_name || 'Player')}</span>` +
      `<span class="lb-score">${r.score}</span></li>`).join('')}</ol>`;
  },

  _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },
};

if (typeof window !== 'undefined') window.LEADERBOARD_SYSTEM = LEADERBOARD_SYSTEM;
