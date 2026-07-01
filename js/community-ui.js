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
    ['community-mode', 'community-genre', 'community-difficulty', 'community-sort'].forEach((id) => {
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
    this._selectTab('browse');
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
    const params = new URLSearchParams();
    const q = this._val('community-search').trim();
    if (q) params.set('q', q);
    for (const [id, key] of [['community-mode', 'mode'], ['community-genre', 'genre'], ['community-difficulty', 'difficulty'], ['community-sort', 'sort']]) {
      const v = this._val(id); if (v) params.set(key, v);
    }
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
    return `<div class="community-card" data-id="${w.id}">
      <div class="cc-title">${this._esc(w.name)}</div>
      <div class="cc-meta">by ${this._esc(w.author || 'Unknown')} · ${w.mode || ''}${w.difficulty ? ' · ' + w.difficulty : ''}${w.genre ? ' · ' + w.genre : ''}</div>
      ${w.description ? `<div class="cc-desc">${this._esc(w.description)}</div>` : ''}
      <div class="cc-stats">${this._stars(w.avgRating || 0, w.ratingCount)} · ⬇ ${w.downloads || 0}</div>
      <div class="cc-rate">Rate: <span class="rate-stars">${rate}</span></div>
      <div class="cc-actions">
        <button class="btn btn-small cc-download">⬇ Download</button>
        <button class="btn btn-small cc-fav ${w.favorited ? 'faved' : ''}">${w.favorited ? '★ Favorited' : '☆ Favorite'}</button>
      </div>
    </div>`;
  },

  _wireCards(root) {
    root.querySelectorAll('.community-card').forEach((card) => {
      const id = card.dataset.id;
      card.querySelector('.cc-fav')?.addEventListener('click', (e) => this._toggleFav(id, e.currentTarget));
      card.querySelector('.cc-download')?.addEventListener('click', (e) => this._download(id, e.currentTarget));
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

  _esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); },
};

if (typeof window !== 'undefined') {
  window.COMMUNITY = COMMUNITY;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => COMMUNITY.init());
  else COMMUNITY.init();
}
