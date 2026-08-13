// ============================================================
// sr-hub.js — Speed Runner Level Hub (replaces the 4 save-slots)
// ------------------------------------------------------------
// Three tabs on the SR game-selection screen:
//   • System   — admin-curated levels (GET /api/sr/system), ordered; the interim "campaign".
//   • My Levels — the player's own Live worlds (GET /api/sr/mine).
//   • Community — worlds the player has Added (GET /api/sr/added); browse the store to add more.
// Plays via GET /api/sr/world/:id/play (returns world_data, bumps play_count). Needs sr-hub-routes.js.
// GAME_SELECTION shows this instead of the slots when mode === 'SPEEDRUNNER'.
// ============================================================
const SR_HUB = {
  _tab: 'system',
  _bound: false,
  _isAdmin: false,
  _rows: [],

  init() {
    this._bind();
    document.getElementById('sr-hub').style.display = 'flex';   // flex row: rail beside the list (not block/stacked)
    document.querySelector('.game-slots-container').style.display = 'none';
    document.querySelector('.game-selection-container')?.classList.add('srh-mode');   // full-bleed "device" backdrop
    this.loadTab(this._tab || 'system');
  },
  hide() {
    const h = document.getElementById('sr-hub'); if (h) h.style.display = 'none';
    const g = document.querySelector('.game-slots-container'); if (g) g.style.display = '';
    document.querySelector('.game-selection-container')?.classList.remove('srh-mode');
  },

  _bind() {
    if (this._bound) return; this._bound = true;
    document.querySelectorAll('.srh-tab').forEach(btn =>
      btn.addEventListener('click', () => {
        document.querySelectorAll('.srh-tab').forEach(b => b.classList.toggle('active', b === btn));
        this.loadTab(btn.dataset.tab);
      }));
  },

  async loadTab(tab) {
    this._tab = tab;
    const list = document.getElementById('srh-list');
    const bar = document.getElementById('srh-toolbar');
    list.innerHTML = '<p class="srh-empty">Loading…</p>';
    bar.innerHTML = '';
    const url = { system: '/api/sr/system', mine: '/api/sr/mine', community: '/api/sr/added' }[tab];
    let data = {};
    try { const r = await AUTH.authedFetch(url); data = r.ok ? await r.json() : {}; }
    catch (e) { list.innerHTML = '<p class="srh-empty">Could not load levels.</p>'; return; }
    this._rows = data.worlds || [];
    if (data.isAdmin != null) this._isAdmin = !!data.isAdmin;   // system + mine both report it
    this._renderToolbar(tab, bar);
    this._renderRows(tab, list);
  },

  _renderToolbar(tab, bar) {
    if (tab === 'community') {
      bar.innerHTML = '<button class="btn btn-primary" id="srh-browse">➕ Browse community levels to add</button>';
      bar.querySelector('#srh-browse').onclick = () => { if (typeof COMMUNITY !== 'undefined') COMMUNITY.init('SPEEDRUNNER'); };
    } else if (tab === 'mine') {
      bar.innerHTML = '<span class="srh-hint">Only worlds you\'ve set <b>Live</b> in Sandbox appear here.</span>';
    } else if (tab === 'system' && this._isAdmin) {
      bar.innerHTML = '<span class="srh-hint srh-admin">Admin: use ▲▼ to reorder; ✕ removes from System.</span>';
    }
  },

  _best(worldId) {
    try {
      if (typeof SpeedRunnerLeaderboard !== 'undefined') {
        const lb = SpeedRunnerLeaderboard.get(worldId) || [];
        if (lb.length && typeof srFormatTime !== 'undefined') return srFormatTime(lb[0].ms);
      }
    } catch (_) {}
    return null;
  },

  _renderRows(tab, list) {
    if (!this._rows.length) {
      const msg = { system: 'No system levels published yet.',
        mine: 'No Live levels yet — build a Speed Runner world in Sandbox and set it Live.',
        community: 'Nothing added yet — tap “Browse community levels to add”.' }[tab];
      list.innerHTML = `<p class="srh-empty">${msg}</p>`;
      return;
    }
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    list.innerHTML = this._rows.map((w, i) => {
      const best = this._best(w.id);
      const thumb = w.thumbnail ? `<div class="srh-thumb"><img src="${esc(w.thumbnail)}" alt="" loading="lazy"></div>` : '<div class="srh-thumb srh-thumb-none">🏁</div>';
      let actions = `<button class="btn btn-primary srh-play" data-id="${esc(w.id)}">▶ Race</button>`;
      if (tab === 'community') actions += `<button class="btn btn-secondary srh-remove" data-id="${esc(w.id)}" title="Remove from your list">Remove</button>`;
      if (tab === 'system' && this._isAdmin) {
        actions = `<button class="btn btn-icon srh-up" data-i="${i}" title="Move up">▲</button>`
                + `<button class="btn btn-icon srh-down" data-i="${i}" title="Move down">▼</button>` + actions
                + `<button class="btn btn-danger srh-unsys" data-id="${esc(w.id)}" title="Remove from System">✕</button>`;
      }
      if (tab === 'mine' && this._isAdmin) actions += `<button class="btn btn-secondary srh-tosys" data-id="${esc(w.id)}" title="Add to the System list">★ System</button>`;
      return `<div class="srh-row" data-id="${esc(w.id)}">
        ${thumb}
        <div class="srh-meta">
          <div class="srh-name">${tab === 'system' ? (i + 1) + '. ' : ''}${esc(w.name || 'Speed Run')}</div>
          <div class="srh-sub">by ${esc(w.author || 'Unknown')} · ▶ ${w.plays || 0}${best ? ' · best ' + best : ''}</div>
        </div>
        <div class="srh-actions">${actions}</div>
      </div>`;
    }).join('');
    // wire
    list.querySelectorAll('.srh-play').forEach(b => b.onclick = () => this.play(b.dataset.id));
    list.querySelectorAll('.srh-remove').forEach(b => b.onclick = () => this._remove(b.dataset.id));
    list.querySelectorAll('.srh-up').forEach(b => b.onclick = () => this._reorder(+b.dataset.i, -1));
    list.querySelectorAll('.srh-down').forEach(b => b.onclick = () => this._reorder(+b.dataset.i, +1));
    list.querySelectorAll('.srh-unsys').forEach(b => b.onclick = () => this._setSystem(b.dataset.id, false));
    list.querySelectorAll('.srh-tosys').forEach(b => b.onclick = () => this._setSystem(b.dataset.id, true));
  },

  async play(worldId) {
    if (!worldId) return;
    let d = null;
    try { const r = await AUTH.authedFetch(`/api/sr/world/${worldId}/play`); d = r.ok ? await r.json() : null; }
    catch (e) {}
    if (!d || !d.worldData) { if (typeof DIALOG !== 'undefined') DIALOG.toast('Could not load that level', { type: 'error' }); return; }
    const wd = d.worldData; wd.id = d.id; wd.worldId = d.id; wd.worldName = d.worldName; wd.playerName = 'Player';
    const tab = this._tab;
    if (typeof window.menu !== 'undefined' && window.menu && window.menu._stop) window.menu._stop();
    document.getElementById('game-selection-screen').style.display = 'none';
    const hud = document.getElementById('play-hud'); if (hud) hud.style.display = 'flex';
    if (window.game && window.game.destroy) { try { window.game.destroy(); } catch (_) {} window.game = null; }

    let exited = false;
    const back = () => {
      if (exited) return; exited = true;
      try { if (window.game && window.game.destroy) window.game.destroy(); } catch (_) {}
      window.game = null;
      if (hud) hud.style.display = 'none';
      document.getElementById('game-selection-screen').style.display = 'block';
      this.init(); this.loadTab(tab);
    };
    const exitBtn = document.getElementById('play-hud-exit'); if (exitBtn) exitBtn.onclick = back;
    const pauseBtn = document.getElementById('play-hud-pause');
    if (pauseBtn) { pauseBtn.textContent = 'Pause'; pauseBtn.onclick = () => { const g = window.game; if (!g) return; const p = g.state === 'paused'; g.state = p ? 'playing' : 'paused'; pauseBtn.textContent = p ? 'Pause' : 'Resume'; }; }
    const restartBtn = document.getElementById('play-hud-restart');
    if (restartBtn) { restartBtn.style.display = ''; restartBtn.onclick = () => { const g = window.game; if (!g) return; if (g.state === 'paused') { g.state = 'playing'; if (pauseBtn) pauseBtn.textContent = 'Pause'; } if (g._srRestartRun) g._srRestartRun(); }; }

    window.game = new Game('speedrunner', { speedrunnerLoadKey: wd, playerName: 'Player', worldId: d.id }, () => back());
  },

  async _remove(worldId) {
    try { await AUTH.authedFetch(`/api/sr/added/${worldId}`, { method: 'DELETE' }); } catch (e) {}
    this.loadTab('community');
  },
  async _setSystem(worldId, isSystem) {
    try { await AUTH.authedFetch(`/api/sr/system/${worldId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isSystem }) }); } catch (e) {}
    this.loadTab(this._tab);
  },
  async _reorder(i, dir) {
    const j = i + dir; if (j < 0 || j >= this._rows.length) return;
    const arr = this._rows.slice();
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;   // swap
    this._rows = arr; this._renderRows('system', document.getElementById('srh-list'));   // optimistic
    try { await AUTH.authedFetch('/api/sr/system/reorder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: arr.map(w => w.id) }) }); } catch (e) {}
  },
};
if (typeof window !== 'undefined') window.SR_HUB = SR_HUB;
if (typeof module !== 'undefined' && module.exports) module.exports = { SR_HUB };
