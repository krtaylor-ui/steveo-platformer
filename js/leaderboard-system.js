// ============================================================
// leaderboard-system.js — Arena per-mode leaderboards client (Phase 3A.2)
//
// Submits results on mode end (called from Game._submitArenaResultOnce) and
// renders a top-10 modal reachable from the arena picker. Uses AUTH.authedFetch
// against /api/arena/* (server/arena-leaderboard-routes.js).
// ============================================================

const LEADERBOARD_SYSTEM = {
  MODE_LABELS: {
    FIGHT_MOBS: 'Fight Mobs',
    COLLECT_EMERALDS: 'Collect Emeralds',
    KING_OF_HILL: 'King of the Hill',
    TIME_ATTACK: 'Time Attack',
    SURVIVAL_WAVES: 'Survival Waves',
  },

  async submit(mode, score, duration) {
    if (!mode || typeof AUTH === 'undefined' || !AUTH.authedFetch) return;
    try {
      await AUTH.authedFetch('/api/arena/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, score, duration }),
      });
    } catch (e) {
      console.error('Leaderboard submit failed:', e);
    }
  },

  async fetch(mode, limit = 10) {
    if (typeof AUTH === 'undefined' || !AUTH.authedFetch) return [];
    try {
      const res = await AUTH.authedFetch(`/api/arena/leaderboards/${mode}?limit=${limit}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.results || [];
    } catch (e) {
      console.error('Leaderboard fetch failed:', e);
      return [];
    }
  },

  async showModal(mode = 'FIGHT_MOBS') {
    const modal = document.getElementById('arena-leaderboard-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    const closeBtn = document.getElementById('lb-close-btn');
    if (closeBtn) closeBtn.onclick = () => { modal.style.display = 'none'; };
    this._renderTabs(mode);
    await this._renderList(mode);
  },

  _renderTabs(active) {
    const tabs = document.getElementById('lb-tabs');
    if (!tabs) return;
    tabs.innerHTML = Object.keys(this.MODE_LABELS).map(k =>
      `<button class="btn ${k === active ? 'btn-primary' : 'btn-secondary'} lb-tab" data-mode="${k}">${this.MODE_LABELS[k]}</button>`
    ).join(' ');
    tabs.querySelectorAll('.lb-tab').forEach(b =>
      b.addEventListener('click', () => this.showModal(b.dataset.mode)));
  },

  async _renderList(mode) {
    const list = document.getElementById('lb-list');
    if (!list) return;
    list.innerHTML = '<p>Loading…</p>';
    const rows = await this.fetch(mode, 10);
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
