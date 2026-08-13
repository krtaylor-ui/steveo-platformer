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

  init(mode) {
    this._mode = mode || this._mode || 'SPEEDRUNNER';   // NORMAL | PLATFORMER | SPEEDRUNNER
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
    // §Neon — tint the screen + rows to the active key's colour (orange / blue / cyan).
    const hub = document.getElementById('sr-hub');
    if (hub) hub.style.setProperty('--srh-active', 'var(--srh-' + (tab === 'system' ? 'sys' : tab === 'mine' ? 'my' : 'comm') + ')');
    const list = document.getElementById('srh-list');
    const bar = document.getElementById('srh-toolbar');
    list.innerHTML = '<p class="srh-empty">Loading…</p>';
    bar.innerHTML = '';
    const base = { system: '/api/sr/system', mine: '/api/sr/mine', community: '/api/sr/added' }[tab];
    const url = base + '?mode=' + encodeURIComponent(this._mode || 'SPEEDRUNNER');
    let data = {};
    try { const r = await AUTH.authedFetch(url); data = r.ok ? await r.json() : {}; }
    catch (e) { list.innerHTML = '<p class="srh-empty">Could not load levels.</p>'; return; }
    this._rows = data.worlds || [];
    if (data.isAdmin != null) this._isAdmin = !!data.isAdmin;   // system + mine both report it
    this._renderToolbar(tab, bar);
    this._renderRows(tab, list);
  },

  _renderToolbar(tab, bar) {
    let html = '';
    // §Arena — a persistent top bar of the 8 game types (2 rows of 4); the selection decides HOW a map plays.
    if (this._mode === 'ARENA') html += this._arenaTopbarHtml();
    if (tab === 'community') {
      html += '<button class="btn btn-primary" id="srh-browse">➕ Browse community levels to add</button>';
    } else if (tab === 'mine' && this._mode !== 'ARENA') {
      html += '<span class="srh-hint">Only worlds you\'ve set <b>Live</b> in Sandbox appear here.</span>';
    } else if (tab === 'system' && this._isAdmin) {
      html += '<span class="srh-hint srh-admin">Admin: use ▲▼ to reorder; ✕ removes from System.</span>';
    }
    bar.innerHTML = html;
    const browse = bar.querySelector('#srh-browse');
    if (browse) browse.onclick = () => { if (typeof COMMUNITY !== 'undefined') COMMUNITY.init(this._mode || 'SPEEDRUNNER'); };
    bar.querySelectorAll('.srh-gt').forEach(b => b.onclick = () => { this._arenaMode = b.dataset.mode; this._renderToolbar(this._tab, bar); });
  },

  _arenaTopbarHtml() {
    if (typeof ARENA_MODES === 'undefined') return '';
    const keys = Object.keys(ARENA_MODES.DEFS);
    if (!this._arenaMode || !keys.includes(this._arenaMode)) this._arenaMode = keys.includes('DEATHMATCH') ? 'DEATHMATCH' : keys[0];
    const btns = keys.map(k => {
      const d = ARENA_MODES.DEFS[k] || {};
      const dis = d.comingSoon ? ' disabled' : '';
      const cls = (k === this._arenaMode ? ' active' : '') + (d.comingSoon ? ' soon' : '');
      return `<button class="srh-gt gt-${k}${cls}" data-mode="${k}"${dis} title="${String(d.desc || '').replace(/"/g, '')}">${String(d.label || k)}</button>`;
    }).join('');
    return `<div class="srh-gtbar">${btns}</div>`;
  },

  async _playArena(worldId) {
    let d = null;
    try { const r = await AUTH.authedFetch(`/api/sr/world/${worldId}/play`); d = r.ok ? await r.json() : null; } catch (e) {}
    if (!d || !d.worldData) { if (typeof DIALOG !== 'undefined') DIALOG.toast('Could not load that map', { type: 'error' }); return; }
    const wd = d.worldData; wd.id = d.id; wd.worldId = d.id; wd.worldName = d.worldName;
    const mode = this._arenaMode, name = d.worldName;
    const launch = (extra) => this._launchArena(wd, extra, d.id, name);
    // Same dispatch as ARENA_SELECT: Custom → rules builder; other types → pre-launch settings; then launch.
    if (mode === 'CUSTOM' && typeof CUSTOM_RULES_UI !== 'undefined' && CUSTOM_RULES_UI.show) {
      CUSTOM_RULES_UI.show((cfg) => launch({ arenaGameMode: 'CUSTOM', arenaConfig: cfg }));
    } else if (mode && typeof ARENA_PRELAUNCH !== 'undefined' && ARENA_PRELAUNCH.show) {
      ARENA_PRELAUNCH.show(mode, (cfg) => launch({ arenaGameMode: mode, arenaConfig: cfg }));
    } else {
      launch(mode ? { arenaGameMode: mode } : {});
    }
  },

  _launchArena(wd, extra, id, name) {
    const tab = this._tab, mode = this._mode;
    if (typeof window.menu !== 'undefined' && window.menu && window.menu._stop) window.menu._stop();
    if (window.game && window.game.destroy) { try { window.game.destroy(); } catch (_) {} window.game = null; }
    document.getElementById('game-selection-screen').style.display = 'none';
    const options = Object.assign({ templateData: wd, worldId: id, worldName: name }, extra || {});
    window.game = new Game('arena', options, () => {
      window.game = null;
      document.getElementById('game-selection-screen').style.display = 'block';
      this.init(mode); this.loadTab(tab);
    });
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
      const isNP = (this._mode === 'NORMAL' || this._mode === 'PLATFORMER');
      const playLabel = (this._mode === 'ARENA') ? '⚔&nbsp;Battle' : (!isNP ? '▶&nbsp;Race' : (w.inProgress ? 'Continue' : 'Play'));
      let actions = `<button class="srh-play" data-id="${esc(w.id)}">${playLabel}</button>`;
      if (isNP && w.inProgress) actions += `<button class="srh-restart" data-id="${esc(w.id)}" title="Start this level over">Restart</button>`;
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
    list.querySelectorAll('.srh-restart').forEach(b => b.onclick = () => this._restart(b.dataset.id));
    list.querySelectorAll('.srh-remove').forEach(b => b.onclick = () => this._remove(b.dataset.id));
    list.querySelectorAll('.srh-up').forEach(b => b.onclick = () => this._reorder(+b.dataset.i, -1));
    list.querySelectorAll('.srh-down').forEach(b => b.onclick = () => this._reorder(+b.dataset.i, +1));
    list.querySelectorAll('.srh-unsys').forEach(b => b.onclick = () => this._setSystem(b.dataset.id, false));
    list.querySelectorAll('.srh-tosys').forEach(b => b.onclick = () => this._setSystem(b.dataset.id, true));
  },

  async _restart(worldId) {
    try { await AUTH.authedFetch(`/api/sr/world/${worldId}/progress`, { method: 'DELETE' }); } catch (e) {}
    this.play(worldId, { restart: true });
  },

  async play(worldId, opts) {
    opts = opts || {};
    if (!worldId) return;
    if (this._mode === 'ARENA') { this._playArena(worldId); return; }   // arena routes through its own launch
    let d = null;
    try { const r = await AUTH.authedFetch(`/api/sr/world/${worldId}/play`); d = r.ok ? await r.json() : null; }
    catch (e) {}
    if (!d || !d.worldData) { if (typeof DIALOG !== 'undefined') DIALOG.toast('Could not load that level', { type: 'error' }); return; }
    const wd = d.worldData; wd.id = d.id; wd.worldId = d.id; wd.worldName = d.worldName; wd.playerName = 'Player';
    const tab = this._tab;
    const isNP = (this._mode === 'NORMAL' || this._mode === 'PLATFORMER');
    // §Continue — Normal/Platformer resume a saved progress snapshot unless this is a Restart.
    let saved = null;
    if (isNP && !opts.restart) {
      try { const pr = await AUTH.authedFetch(`/api/sr/world/${worldId}/progress`); const pj = pr.ok ? await pr.json() : null; saved = pj && pj.gameData; } catch (e) {}
    }
    if (typeof window.menu !== 'undefined' && window.menu && window.menu._stop) window.menu._stop();
    document.getElementById('game-selection-screen').style.display = 'none';
    const hud = document.getElementById('play-hud'); if (hud) hud.style.display = 'flex';
    if (window.game && window.game.destroy) { try { window.game.destroy(); } catch (_) {} window.game = null; }

    let exited = false, saveTimer = null;
    const back = () => {
      if (exited) return; exited = true;
      if (saveTimer) { clearInterval(saveTimer); saveTimer = null; }
      const g = window.game;
      // §Save-on-exit — Normal/Platformer bank progress (or clear it if the level was won).
      if (isNP && g && typeof GAME_STATE !== 'undefined' && GAME_STATE.serialize) {
        try {
          if (g.state === 'won') { AUTH.authedFetch(`/api/sr/world/${worldId}/progress`, { method: 'DELETE' }).catch(() => {}); }
          else { const gd = GAME_STATE.serialize(g); AUTH.authedFetch(`/api/sr/world/${worldId}/progress`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gameData: gd }) }).catch(() => {}); }
        } catch (_) {}
      }
      try { if (g && g.destroy) g.destroy(); } catch (_) {}
      window.game = null;
      if (hud) hud.style.display = 'none';
      document.getElementById('game-selection-screen').style.display = 'block';
      this.init(); this.loadTab(tab);
    };
    const exitBtn = document.getElementById('play-hud-exit'); if (exitBtn) exitBtn.onclick = back;
    const pauseBtn = document.getElementById('play-hud-pause');
    if (pauseBtn) { pauseBtn.textContent = 'Pause'; pauseBtn.onclick = () => { const g = window.game; if (!g) return; const p = g.state === 'paused'; g.state = p ? 'playing' : 'paused'; pauseBtn.textContent = p ? 'Pause' : 'Resume'; }; }
    const restartBtn = document.getElementById('play-hud-restart');
    if (restartBtn) { restartBtn.style.display = (this._mode === 'SPEEDRUNNER') ? '' : 'none'; restartBtn.onclick = () => { const g = window.game; if (!g) return; if (g.state === 'paused') { g.state = 'playing'; if (pauseBtn) pauseBtn.textContent = 'Pause'; } if (g._srRestartRun) g._srRestartRun(); }; }

    // Launch the right engine for the hub's mode. SR uses its load-key path; Normal/Platformer run the
    // world as a fresh level (world:'adventure' lets their generation run before templateData overrides it).
    const gm = ({ SPEEDRUNNER: 'speedrunner', NORMAL: 'normal', PLATFORMER: 'platformer' })[this._mode] || 'speedrunner';
    const gopts = (gm === 'speedrunner')
      ? { speedrunnerLoadKey: wd, playerName: 'Player', worldId: d.id }
      : { templateData: wd, world: 'adventure', newGame: !saved, worldId: d.id };
    window.game = new Game(gm, gopts, () => back());
    // §Continue — apply the saved snapshot on top of the freshly-built world (like GAME_PLAY does).
    if (isNP && saved && typeof GAME_STATE !== 'undefined' && GAME_STATE.deserialize) {
      try { GAME_STATE.deserialize(window.game, saved, { newGame: false }); } catch (_) {}
    }
    // §Auto-save — Normal/Platformer bank progress every 10s while playing (mirrors the old slots).
    if (isNP) {
      saveTimer = setInterval(() => {
        const g = window.game;
        if (g && (g.state === 'playing' || g.state === 'paused') && typeof GAME_STATE !== 'undefined' && GAME_STATE.serialize) {
          try { AUTH.authedFetch(`/api/sr/world/${worldId}/progress`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gameData: GAME_STATE.serialize(g) }) }).catch(() => {}); } catch (_) {}
        }
      }, 10000);
    }
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
