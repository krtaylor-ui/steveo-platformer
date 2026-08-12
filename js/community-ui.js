// ============================================================
// community-ui.js — Phase 3 Community Browse screen (DOM overlay)
// ------------------------------------------------------------
// Browse/search published worlds, favorite + rate them, download into your own
// sandbox, and view your stats/achievements. Talks to community-routes.js and
// stats-routes.js via AUTH.authedFetch. Screen markup lives in index.html
// (#community-screen). Extends the existing DOM-screen pattern (online-play).
// ============================================================

const COMMUNITY = {
  _wired: false,
  _searchTimer: null,

  init() {
    if (this._wired) return;
    this._wired = true;
    document.getElementById('community-btn')?.addEventListener('click', () => this.open());
    document.getElementById('community-back-btn')?.addEventListener('click', () => this.close());
    // Tabs
    document.querySelectorAll('.community-tab').forEach((btn) => {
      btn.addEventListener('click', () => this._selectTab(btn.dataset.ctab));
    });
    // Filters
    const reload = () => this.loadBrowse();
    ['community-mode', 'community-genre', 'community-difficulty', 'community-sort', 'community-tag'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', reload);
    });
    const search = document.getElementById('community-search');
    search?.addEventListener('input', () => {
      clearTimeout(this._searchTimer);
      this._searchTimer = setTimeout(reload, 300); // debounce
    });
  },

  open() {
    document.getElementById('dashboard-screen').style.display = 'none';
    document.getElementById('community-screen').style.display = 'block';
    this._creator = null;
    this._loadTags();
    this._selectTab('browse');
  },

  // §B5 — Community Picks: a featured strip of the cycle's top worlds (hidden when browsing a creator).
  async _loadPicks() {
    const el = document.getElementById('community-picks'); if (!el) return;
    if (this._creator) { el.innerHTML = ''; return; }
    try {
      const res = await AUTH.authedFetch('/api/community/picks');
      const d = await res.json();
      const picks = d.picks || [];
      if (!picks.length) { el.innerHTML = ''; return; }
      el.innerHTML = `<div class="picks-head">✨ Community Picks</div><div class="picks-row">` +
        picks.map(p => `<div class="pick-card" data-id="${this._esc(p.id)}">
          ${p.thumbnail ? `<div class="pick-thumb"><img src="${this._esc(p.thumbnail)}" alt="" loading="lazy"></div>` : '<div class="pick-thumb pick-noimg">▶</div>'}
          <div class="pick-name">${this._esc(p.name)}</div>
          <div class="pick-meta">by ${this._esc(p.author || '—')} · ▶ ${p.plays || 0}</div>
        </div>`).join('') + `</div>`;
    } catch (e) { el.innerHTML = ''; }
  },

  // §B3 — populate the tag filter from the curated system tags (once).
  async _loadTags() {
    const sel = document.getElementById('community-tag'); if (!sel || sel._loaded) return;
    try {
      const res = await AUTH.authedFetch('/api/community/tags');
      const d = await res.json();
      for (const t of (d.tags || [])) { const o = document.createElement('option'); o.value = t; o.textContent = '#' + t; sel.appendChild(o); }
      sel._loaded = true;
    } catch (e) {}
  },

  // §B2 — browse a specific creator's published worlds (a lightweight profile bar over the grid).
  async loadCreator(creatorId) {
    this._creator = creatorId;
    const bar = document.getElementById('community-creator-bar');
    if (bar) {
      bar.style.display = 'block';
      bar.innerHTML = 'Loading creator…';
      try {
        const res = await AUTH.authedFetch('/api/community/creator/' + encodeURIComponent(creatorId));
        const p = await res.json();
        bar.innerHTML = `<span class="cc-avatar" style="background:${this._esc(p.color || '#888')}"></span>
          <b>${this._esc(p.name || 'Creator')}</b> · ${p.published || 0} published · ⬇ ${p.totalDownloads || 0} · ▶ ${p.totalPlays || 0}
          <button class="btn btn-small cc-clear-creator">← All creators</button>`;
        bar.querySelector('.cc-clear-creator')?.addEventListener('click', () => { this._creator = null; bar.style.display = 'none'; this.loadBrowse(); });
      } catch (e) { bar.innerHTML = 'Failed to load creator.'; }
    }
    this.loadBrowse();
  },
  close() {
    document.getElementById('community-screen').style.display = 'none';
    document.getElementById('dashboard-screen').style.display = 'block';
  },

  _selectTab(tab) {
    document.querySelectorAll('.community-tab').forEach(b => b.classList.toggle('active', b.dataset.ctab === tab));
    document.querySelectorAll('.community-tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`community-${tab}-tab`)?.classList.add('active');
    if (tab === 'browse') this.loadBrowse();
    else if (tab === 'favorites') this.loadFavorites();
    else if (tab === 'stats') this.loadStats();
  },

  _val(id) { const el = document.getElementById(id); return el ? el.value : ''; },

  async loadBrowse() {
    const grid = document.getElementById('community-grid');
    const status = document.getElementById('community-status');
    if (!grid) return;
    status.textContent = 'Loading…';
    this._loadPicks();   // §B5 featured strip
    const params = new URLSearchParams();
    const q = this._val('community-search').trim();
    if (q) params.set('q', q);
    for (const [id, key] of [['community-mode', 'mode'], ['community-genre', 'genre'], ['community-difficulty', 'difficulty'], ['community-sort', 'sort'], ['community-tag', 'tag']]) {
      const v = this._val(id); if (v) params.set(key, v);
    }
    if (this._creator) params.set('creator', this._creator);
    try {
      const res = await AUTH.authedFetch(`/api/community/worlds?${params.toString()}`);
      const data = await res.json();
      const worlds = data.worlds || [];
      grid.innerHTML = worlds.map(w => this._card(w)).join('');
      status.textContent = worlds.length ? `${data.total} world${data.total === 1 ? '' : 's'} found` : 'No worlds match your filters yet.';
      this._wireCards(grid);
    } catch (e) {
      status.textContent = 'Failed to load community worlds.';
    }
  },

  async loadFavorites() {
    const grid = document.getElementById('community-fav-grid');
    const status = document.getElementById('community-fav-status');
    if (!grid) return;
    status.textContent = 'Loading…';
    try {
      const res = await AUTH.authedFetch('/api/community/favorites');
      const data = await res.json();
      const worlds = (data.worlds || []).map(w => ({ ...w, favorited: true }));
      grid.innerHTML = worlds.map(w => this._card(w)).join('');
      status.textContent = worlds.length ? '' : 'No favorites yet — tap ★ on a world to save it.';
      this._wireCards(grid);
    } catch (e) {
      status.textContent = 'Failed to load favorites.';
    }
  },

  async loadStats() {
    const body = document.getElementById('community-stats-body');
    if (!body) return;
    body.innerHTML = 'Loading…';
    try {
      const res = await AUTH.authedFetch('/api/stats/me');
      const data = await res.json();
      const s = data.stats || {};
      const stat = (label, val) => `<div class="stat-cell"><div class="stat-num">${val}</div><div class="stat-label">${label}</div></div>`;
      const ach = (data.achievements || []).map(a =>
        `<div class="ach-row ${a.unlocked ? 'unlocked' : 'locked'}"><span class="ach-icon">${a.unlocked ? '🏆' : '🔒'}</span>
         <span class="ach-text"><strong>${a.name}</strong><br><small>${a.desc}</small></span></div>`).join('');
      body.innerHTML = `
        <div class="stats-grid">
          ${stat('Matches', s.matches_played || 0)}${stat('Wins', s.wins || 0)}${stat('Win %', (s.winRate || 0) + '%')}
          ${stat('Eliminations', s.kills || 0)}${stat('Flag Captures', s.ctf_captures || 0)}${stat('Published', s.worlds_published || 0)}
        </div>
        <h3 class="ach-head">Achievements</h3>
        <div class="ach-list">${ach || '<p>No achievements defined.</p>'}</div>`;
    } catch (e) {
      body.innerHTML = '<p>Stats unavailable (play a match to start tracking).</p>';
    }
  },

  _stars(avg, count) {
    const full = Math.round(avg);
    let s = '';
    for (let i = 1; i <= 5; i++) s += `<span class="star ${i <= full ? 'on' : ''}">★</span>`;
    return `<span class="rating-display" title="${avg} average">${s} <small>(${count || 0})</small></span>`;
  },

  _card(w) {
    const rate = [1, 2, 3, 4, 5].map(n => `<span class="rate-star ${n <= (w.myRating || 0) ? 'on' : ''}" data-stars="${n}">★</span>`).join('');
    const tags = (w.tags && w.tags.length) ? `<div class="cc-tags">${w.tags.slice(0,4).map(t => `<span class="cc-tag">#${this._esc(t)}</span>`).join('')}</div>` : '';
    const thumb = w.thumbnail ? `<div class="cc-thumb"><img src="${this._esc(w.thumbnail)}" alt="" loading="lazy"></div>` : '';
    const dl = w.downloadable === false
      ? `<button class="btn btn-small cc-download" disabled title="The creator hasn't made this downloadable">⬇ Not downloadable</button>`
      : `<button class="btn btn-small cc-download">⬇ Download</button>`;
    const author = w.creatorId
      ? `<a href="#" class="cc-author" data-creator="${this._esc(w.creatorId)}">${this._esc(w.author || 'Unknown')}</a>`
      : this._esc(w.author || 'Unknown');
    return `<div class="community-card" data-id="${w.id}">
      ${thumb}
      <div class="cc-title">${this._esc(w.name)}</div>
      <div class="cc-meta">by ${author} · ${w.mode || ''}${w.difficulty ? ' · ' + w.difficulty : ''}${w.genre ? ' · ' + w.genre : ''}</div>
      ${w.description ? `<div class="cc-desc">${this._esc(w.description)}</div>` : ''}
      ${tags}
      <div class="cc-stats">${this._stars(w.avgRating || 0, w.ratingCount)} · ⬇ ${w.downloads || 0} · ▶ ${w.plays || 0}</div>
      <div class="cc-rate">Rate: <span class="rate-stars">${rate}</span></div>
      <div class="cc-actions">
        ${w.mode === 'SPEEDRUNNER' ? `<button class="btn btn-small cc-play" title="Race this level now (no download)">▶ Play</button>` : ''}
        ${dl}
        <button class="btn btn-small cc-fav ${w.favorited ? 'faved' : ''}">${w.favorited ? '★ Favorited' : '☆ Favorite'}</button>
      </div>
    </div>`;
  },

  _wireCards(root) {
    root.querySelectorAll('.cc-author[data-creator]').forEach((a) => {
      a.addEventListener('click', (e) => { e.preventDefault(); this.loadCreator(a.dataset.creator); });
    });
    root.querySelectorAll('.community-card').forEach((card) => {
      const id = card.dataset.id;
      card.querySelector('.cc-fav')?.addEventListener('click', (e) => this._toggleFav(id, e.currentTarget));
      card.querySelector('.cc-download')?.addEventListener('click', (e) => this._download(id, e.currentTarget));
      card.querySelector('.cc-play')?.addEventListener('click', (e) => this._playSpeedRun(id, e.currentTarget));
      card.querySelectorAll('.rate-star').forEach((st) => {
        st.addEventListener('click', () => this._rate(id, parseInt(st.dataset.stars, 10), card));
      });
    });
  },

  async _toggleFav(id, btn) {
    const willFav = !btn.classList.contains('faved');
    try {
      await AUTH.authedFetch(`/api/community/worlds/${id}/favorite`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite: willFav }),
      });
      btn.classList.toggle('faved', willFav);
      btn.textContent = willFav ? '★ Favorited' : '☆ Favorite';
    } catch (e) { /* ignore */ }
  },

  async _rate(id, stars, card) {
    try {
      const res = await AUTH.authedFetch(`/api/community/worlds/${id}/rate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stars }),
      });
      const data = await res.json();
      card.querySelectorAll('.rate-star').forEach((st) => st.classList.toggle('on', parseInt(st.dataset.stars, 10) <= stars));
      const disp = card.querySelector('.rating-display');
      if (disp && data.avgRating != null) disp.outerHTML = this._stars(data.avgRating, data.ratingCount);
    } catch (e) { /* ignore */ }
  },

  async _download(id, btn) {
    btn.disabled = true; btn.textContent = 'Downloading…';
    try {
      await AUTH.authedFetch(`/api/community/worlds/${id}/download`, { method: 'POST' });
      btn.textContent = '✓ In your sandbox';
    } catch (e) {
      btn.textContent = 'Failed'; btn.disabled = false;
    }
  },

  // §A3 — race a published Speed Runner level straight from the storefront (no clone into your sandbox).
  // Uses the read-only /play endpoint (which also bumps the play counter) and the SR launch path; on exit
  // it returns to the community browser. worldId is passed so leaderboards/ghosts re-key to worlds.id.
  async _playSpeedRun(id, btn) {
    const orig = btn.textContent; btn.disabled = true; btn.textContent = 'Loading…';
    try {
      const res = await AUTH.authedFetch(`/api/community/worlds/${id}/play`);
      const d = res.ok ? await res.json() : null;
      if (!d || !d.worldData) throw new Error('no data');
      const wd = d.worldData;
      wd.id = d.id; wd.worldId = d.id; wd.worldName = d.worldName; wd.playerName = 'Player';
      if (typeof window.menu !== 'undefined' && window.menu && window.menu._stop) window.menu._stop();
      document.getElementById('community-screen').style.display = 'none';
      const hud = document.getElementById('play-hud'); if (hud) hud.style.display = 'flex';
      if (window.game && window.game.destroy) { try { window.game.destroy(); } catch (_) {} window.game = null; }

      // §T2-4/§T2-5 — community play must OWN its exit: the shared play-hud buttons are bound by
      // GAME_PLAY on its own launches, not here, so the Exit button was inert; and the pause-menu
      // Main Menu returned to the dashboard, not the storefront. Wire an explicit return-to-store used
      // by BOTH the HUD Exit button AND the game's _onReturnToMenu (pause-menu Main Menu / confirmExit).
      let exited = false;
      const backToStore = () => {
        if (exited) return; exited = true;
        try { if (window.game && window.game.destroy) window.game.destroy(); } catch (_) {}
        window.game = null;
        if (hud) hud.style.display = 'none';
        const dash = document.getElementById('dashboard-screen'); if (dash) dash.style.display = 'none';
        const cs = document.getElementById('community-screen'); if (cs) cs.style.display = 'block';
        if (this.loadBrowse) this.loadBrowse();   // refresh so the +1 play shows
      };
      const exitBtn = document.getElementById('play-hud-exit');
      if (exitBtn) exitBtn.onclick = backToStore;
      const pauseBtn = document.getElementById('play-hud-pause');
      if (pauseBtn) { pauseBtn.textContent = 'Pause'; pauseBtn.onclick = () => { const g = window.game; if (!g) return; const p = g.state === 'paused'; g.state = p ? 'playing' : 'paused'; pauseBtn.textContent = p ? 'Pause' : 'Resume'; }; }
      const restartBtn = document.getElementById('play-hud-restart');
      if (restartBtn) { restartBtn.style.display = ''; restartBtn.onclick = () => { const g = window.game; if (!g) return; if (g.state === 'paused') { g.state = 'playing'; if (pauseBtn) pauseBtn.textContent = 'Pause'; } if (g._srRestartRun) g._srRestartRun(); }; }

      window.game = new Game(
        'speedrunner',
        { speedrunnerLoadKey: wd, playerName: 'Player', worldId: d.id },
        () => backToStore()
      );
    } catch (e) {
      btn.textContent = 'Failed'; btn.disabled = false;
      setTimeout(() => { btn.textContent = orig; }, 1500);
    }
  },

  _esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); },
};

if (typeof window !== 'undefined') {
  window.COMMUNITY = COMMUNITY;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => COMMUNITY.init());
  else COMMUNITY.init();
}
