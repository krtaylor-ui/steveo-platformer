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

  _label(k) { return this.ALL_MODE_LABELS[k] || this.MODE_LABELS[k] || k; },

  // The browse feed: top entries across all worlds/modes, with world name + date.
  async fetchFeed(world, mode, limit = 200) {
    if (typeof AUTH === 'undefined' || !AUTH.authedFetch) return [];
    try {
      const qs = [];
      if (world) qs.push(`world=${encodeURIComponent(world)}`);
      if (mode)  qs.push(`mode=${encodeURIComponent(mode)}`);
      qs.push(`limit=${limit}`);
      const res = await AUTH.authedFetch(`/api/arena/leaderboard-feed?${qs.join('&')}`);
      if (!res.ok) return [];
      const d = await res.json();
      return d.results || [];
    } catch (e) { console.error('Leaderboard feed failed:', e); return []; }
  },

  // Global browse — the arena picker's "🏆 Leaderboards" button. A single
  // scrollable feed (Date / World / Game Type / Score / Player) with a World
  // filter and a Game-Type filter.
  async showModal() { await this._openFeed(null); },

  // Per-tile / pause "View Leaderboard" → same feed, pre-filtered to one world.
  async showWorldModal(worldId /*, worldName, modes */) { await this._openFeed(worldId || null); },

  async _openFeed(presetWorld) {
    const modal = document.getElementById('arena-leaderboard-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    const titleEl = modal.querySelector('h3');
    if (titleEl) titleEl.textContent = '🏆 Arena Leaderboards';
    const closeBtn = document.getElementById('lb-close-btn');
    if (closeBtn) closeBtn.onclick = () => { modal.style.display = 'none'; };

    this._filter = { world: presetWorld || '', mode: '' };
    // Build the World dropdown from an unfiltered fetch (so every world that has
    // a score is listed), then render + wire the filters.
    const universe = await this.fetchFeed('', '', 300);
    this._worldOpts = [];
    const seen = new Set();
    for (const r of universe) {
      const key = r.world_id || '__quick';
      if (seen.has(key)) continue;
      seen.add(key);
      this._worldOpts.push({ id: r.world_id || '', name: r.world_name });
    }
    this._worldOpts.sort((a, b) => a.name.localeCompare(b.name));
    this._renderFilters();
    await this._renderFeed();
  },

  _renderFilters() {
    const bar = document.getElementById('lb-tabs');
    if (!bar) return;
    const f = this._filter || { world: '', mode: '' };
    const worldOpts = ['<option value="">All Worlds</option>'].concat(
      (this._worldOpts || []).map(w =>
        `<option value="${this._esc(w.id)}" ${w.id === f.world ? 'selected' : ''}>${this._esc(w.name)}</option>`)
    ).join('');
    const modeOpts = ['<option value="">All Game Types</option>'].concat(
      Object.keys(this.ALL_MODE_LABELS).map(k =>
        `<option value="${k}" ${k === f.mode ? 'selected' : ''}>${this._esc(this.ALL_MODE_LABELS[k])}</option>`)
    ).join('');
    bar.innerHTML =
      `<label class="lb-filter">World <select id="lb-filter-world">${worldOpts}</select></label>` +
      `<label class="lb-filter">Game Type <select id="lb-filter-mode">${modeOpts}</select></label>`;
    const wsel = document.getElementById('lb-filter-world');
    const msel = document.getElementById('lb-filter-mode');
    if (wsel) wsel.onchange = () => { this._filter.world = wsel.value; this._renderFeed(); };
    if (msel) msel.onchange = () => { this._filter.mode = msel.value; this._renderFeed(); };
  },

  _fmtDate(iso) {
    try {
      const d = new Date(iso);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    } catch (e) { return ''; }
  },

  async _renderFeed() {
    const list = document.getElementById('lb-list');
    if (!list) return;
    list.innerHTML = '<p class="world-list-empty">Loading…</p>';
    const f = this._filter || { world: '', mode: '' };
    const rows = await this.fetchFeed(f.world, f.mode, 200);
    if (!rows.length) {
      list.innerHTML = '<p class="world-list-empty">No scores recorded yet.</p>';
      return;
    }
    const body = rows.map((r, i) =>
      `<tr>` +
      `<td class="lb-rank">${i + 1}</td>` +
      `<td class="lb-date">${this._esc(this._fmtDate(r.created_at))}</td>` +
      `<td class="lb-world">${this._esc(r.world_name)}</td>` +
      `<td class="lb-type">${this._esc(this._label(r.mode))}</td>` +
      `<td class="lb-score">${r.score}</td>` +
      `<td class="lb-player">${this._esc(r.player_name)}</td>` +
      `</tr>`).join('');
    list.innerHTML =
      `<table class="lb-table"><thead><tr>` +
      `<th>#</th><th>Date</th><th>World</th><th>Game Type</th><th>Score</th><th>Player</th>` +
      `</tr></thead><tbody>${body}</tbody></table>`;
  },

  _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },
};

if (typeof window !== 'undefined') window.LEADERBOARD_SYSTEM = LEADERBOARD_SYSTEM;
