// ============================================================
// online-ui.js — Multiplayer lobby UI overlay (Phase 16-A)
// Self-contained: injects CSS, creates DOM, no dependencies.
// ============================================================

const OnlineUI = (() => {
  // ── Server URL ─────────────────────────────────────────────
// Commented out to get online to work - replaced the ' ' based on Claude feedback (KRT)
//  const SERVER =
//    (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
//      ? `${location.protocol}//${location.hostname}:3000`
//      : location.origin;

const SERVER = '';

  // ── Browser identity (stable per-browser creator token) ────
  function getBrowserId() {
    let id = localStorage.getItem('mp_browser_id');
    if (!id) {
      id = 'b-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8);
      localStorage.setItem('mp_browser_id', id);
    }
    return id;
  }

  // ── DOGS admin unlock (works even when menu is shown) ──────
  let _dogsSeq = [];
  document.addEventListener('keydown', e => {
    const ch = e.key.toLowerCase();
    if ('dogs'.indexOf(ch) >= 0) {
      _dogsSeq.push(ch);
      if (_dogsSeq.length > 4) _dogsSeq.shift();
      if (_dogsSeq.join('') === 'dogs') {
        localStorage.setItem('mp_admin_mode', '1');
        _dogsSeq = [];
        // Refresh home panel if open to show admin button
        if (overlay && overlay.style.display !== 'none') showHome();
      }
    } else {
      _dogsSeq = [];
    }
  });

  // ── Password word lists ────────────────────────────────────
  const ADJ  = ['swift','brave','bold','cool','dark','wild','gold','iron','blue','jade',
                 'red','oak','sky','sun','ice','stone','deep','high','free','true'];
  const NOUN = ['wolf','hawk','rock','fire','tide','storm','blade','forge','peak','vale',
                'fang','moon','star','river','bridge','tower','flame','shadow','crest','pine'];

  function genPassword() {
    const a = ADJ[Math.floor(Math.random() * ADJ.length)];
    const n = NOUN[Math.floor(Math.random() * NOUN.length)];
    const d = Math.floor(Math.random() * 90) + 10;
    return `${a}${n}${d}`;
  }

  // ── Player settings persistence ────────────────────────────
  const PS_KEY = 'mp_player_settings';

  function loadPS() {
    try { return JSON.parse(localStorage.getItem(PS_KEY)) || defaultPS(); }
    catch { return defaultPS(); }
  }
  function savePS(s) { localStorage.setItem(PS_KEY, JSON.stringify(s)); }
  function defaultPS() {
    return { name: 'Player', shirtColor: '#FF6B6B', pantsColor: '#1E1E1E', skinColor: '#F4C090' };
  }

  // ── Sandbox worlds from localStorage ──────────────────────
  function getSBWorlds() {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith('sbworld|')) continue;
      try {
        const data = JSON.parse(localStorage.getItem(key));
        out.push({ key, name: data?.name || key.replace('sbworld|', 'Untitled') });
      } catch { /* skip */ }
    }
    return out;
  }

  // ── CSS injection ──────────────────────────────────────────
  function injectCSS() {
    if (document.getElementById('oui-styles')) return;
    const s = document.createElement('style');
    s.id = 'oui-styles';
    s.textContent = `
      #oui-overlay {
        position: fixed; inset: 0; z-index: 9000;
        background: rgba(0,0,0,0.84);
        display: flex; align-items: center; justify-content: center;
        font-family: 'Segoe UI', system-ui, sans-serif;
      }
      .oui-panel {
        background: #13132a; border: 2px solid #9C27B0;
        border-radius: 10px; padding: 24px;
        min-width: 370px; max-width: 500px; width: 92vw;
        color: #e0e0e0; position: relative;
        box-shadow: 0 8px 40px rgba(156,39,176,.45);
        max-height: 92vh; overflow-y: auto;
      }
      .oui-title {
        font-size: 20px; font-weight: 700; color: #CE93D8;
        margin-bottom: 16px; text-align: center;
        text-transform: uppercase; letter-spacing: 2px;
      }
      .oui-subtitle {
        font-size: 12px; color: #777; text-align: center;
        margin-top: -10px; margin-bottom: 16px;
      }
      .oui-btn {
        display: block; width: 100%; padding: 11px 16px;
        margin-bottom: 10px; border: none; border-radius: 6px;
        font-size: 14px; font-weight: 600; cursor: pointer;
        transition: opacity .15s, transform .1s; text-align: left;
      }
      .oui-btn:last-child { margin-bottom: 0; }
      .oui-btn:hover:not(:disabled) { opacity: .85; transform: translateX(2px); }
      .oui-btn:disabled { opacity: .4; cursor: not-allowed; transform: none; }
      .oui-btn-primary   { background: #9C27B0; color: #fff; }
      .oui-btn-secondary { background: #222240; color: #CE93D8; border: 1px solid #9C27B0; }
      .oui-btn-green     { background: #1b5e20; color: #a5d6a7; border: 1px solid #388e3c; }
      .oui-btn-red       { background: #7f0000; color: #ef9a9a; border: 1px solid #c62828; }
      .oui-btn-sm {
        display: inline-block; padding: 7px 14px;
        font-size: 13px; font-weight: 600; cursor: pointer;
        border: none; border-radius: 4px; transition: opacity .15s;
      }
      .oui-btn-sm:hover { opacity: .8; }
      .oui-back, .oui-close {
        position: absolute; top: 14px; background: none;
        border: none; font-size: 18px; cursor: pointer;
        padding: 4px 8px; border-radius: 4px;
      }
      .oui-back  { left: 14px; color: #9C27B0; }
      .oui-close { right: 14px; color: #555; }
      .oui-back:hover  { background: rgba(156,39,176,.2); color: #CE93D8; }
      .oui-close:hover { color: #fff; }
      .oui-label {
        display: block; font-size: 11px; color: #999;
        margin-bottom: 4px; text-transform: uppercase; letter-spacing: 1px;
      }
      .oui-input {
        width: 100%; padding: 9px 12px; background: #0c0c1e;
        border: 1px solid #444; border-radius: 5px; color: #e0e0e0;
        font-size: 14px; box-sizing: border-box; margin-bottom: 14px;
      }
      .oui-input:focus { outline: none; border-color: #9C27B0; }
      .oui-color-row { display: flex; gap: 10px; margin-bottom: 14px; }
      .oui-color-item { flex: 1; text-align: center; }
      .oui-color-swatch {
        -webkit-appearance: none; appearance: none;
        width: 100%; height: 36px; border-radius: 5px;
        border: 2px solid #444; cursor: pointer; background: none;
        padding: 2px;
      }
      .oui-color-swatch::-webkit-color-swatch-wrapper { padding: 0; }
      .oui-color-swatch::-webkit-color-swatch { border: none; border-radius: 3px; }
      .oui-color-swatch:hover { border-color: #9C27B0; }
      .oui-color-label { font-size: 11px; color: #888; margin-top: 3px; }
      .oui-preview-canvas {
        display: block; margin: 0 auto 16px;
        border: 1px solid #2a2a4a; border-radius: 4px; background: #070714;
      }
      .oui-step-bar {
        display: flex; gap: 6px; margin-bottom: 18px; justify-content: center;
      }
      .oui-step-dot {
        width: 9px; height: 9px; border-radius: 50%;
        background: #2a2a4a; transition: background .2s;
      }
      .oui-step-dot.active { background: #9C27B0; }
      .oui-step-dot.done   { background: #6a0f8a; }
      .oui-row { display: flex; gap: 8px; margin-bottom: 10px; }
      .oui-opt {
        flex: 1; padding: 10px 6px; background: #1e1e3a;
        border: 2px solid #2a2a4a; border-radius: 6px;
        color: #aaa; cursor: pointer; text-align: center;
        font-size: 13px; transition: all .15s; user-select: none;
      }
      .oui-opt:hover  { border-color: #9C27B0; color: #fff; }
      .oui-opt.sel    { border-color: #CE93D8; background: #3a0a50; color: #fff; }
      .oui-world-list {
        max-height: 150px; overflow-y: auto;
        border: 1px solid #2a2a4a; border-radius: 5px; margin-bottom: 12px;
      }
      .oui-world-item {
        padding: 8px 12px; cursor: pointer; font-size: 13px;
        border-bottom: 1px solid #1a1a30; transition: background .1s;
      }
      .oui-world-item:last-child { border-bottom: none; }
      .oui-world-item:hover { background: #1e1e3a; }
      .oui-world-item.sel   { background: #3a0a50; color: #CE93D8; }
      .oui-pw-row { display: flex; gap: 8px; margin-bottom: 8px; align-items: flex-start; }
      .oui-pw-row .oui-input { margin-bottom: 0; flex: 1; }
      .oui-divider { border: none; border-top: 1px solid #222; margin: 14px 0; }
      .oui-hint  { font-size: 11px; color: #555; text-align: center; margin-top: 4px; }
      .oui-status {
        font-size: 12px; color: #777; text-align: center;
        margin-bottom: 10px; min-height: 16px;
      }
      .oui-status.err { color: #ef9a9a; }
      .oui-status.ok  { color: #a5d6a7; }
      .oui-filter-tabs {
        display: flex; border: 1px solid #2a2a4a;
        border-radius: 6px; overflow: hidden; margin-bottom: 12px;
      }
      .oui-ftab {
        flex: 1; padding: 8px; background: #1e1e3a;
        border: none; color: #777; cursor: pointer;
        font-size: 12px; transition: all .15s;
      }
      .oui-ftab.active  { background: #9C27B0; color: #fff; font-weight: 700; }
      .oui-ftab:hover:not(.active) { background: #28284a; color: #ccc; }
      .oui-game-list {
        max-height: 240px; overflow-y: auto;
        border: 1px solid #2a2a4a; border-radius: 5px; margin-bottom: 12px;
      }
      .oui-game-row {
        display: flex; align-items: center; gap: 8px;
        padding: 9px 10px; border-bottom: 1px solid #191928;
        transition: background .1s;
      }
      .oui-game-row:last-child { border-bottom: none; }
      .oui-game-row:hover { background: #181830; }
      .oui-game-info { flex: 1; min-width: 0; }
      .oui-game-name {
        font-size: 13px; font-weight: 600; color: #e0e0e0;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .oui-game-meta { font-size: 11px; color: #666; margin-top: 1px; }
      .oui-tag {
        font-size: 10px; padding: 2px 7px;
        border-radius: 10px; font-weight: 700; white-space: nowrap;
      }
      .oui-tag-sandbox    { background: #0d3016; color: #81c784; }
      .oui-tag-normal     { background: #0d1830; color: #90caf9; }
      .oui-tag-platformer { background: #1a0d30; color: #ce93d8; }
      .oui-empty {
        text-align: center; color: #444; padding: 30px 16px; font-size: 13px;
      }
    `;
    document.head.appendChild(s);
  }

  // ── Safe fetch wrapper ─────────────────────────────────────
  async function fetchJSON(url, options = {}) {
    let resp;
    try {
      resp = await fetch(url, options);
    } catch (e) {
      throw new Error('Cannot reach server — is node server-multiplayer.js running?');
    }
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      throw new Error(
        `Server returned ${resp.status} (not JSON) — check that node server-multiplayer.js is running on port 3000`
      );
    }
    return resp.json();
  }

  // ── DOM helpers ────────────────────────────────────────────
  let overlay     = null;
  let _onStart    = null;
  let _bFilter    = 'all';

  // ── Game browser state ─────────────────────────────────────
  let _allGames    = [];
  let _searchQuery = '';
  let _sortMode    = 'newest';
  let _favGameIds  = (() => {
    try { return new Set(JSON.parse(localStorage.getItem('mp_favorites') || '[]')); }
    catch { return new Set(); }
  })();

  function _saveFavs() {
    localStorage.setItem('mp_favorites', JSON.stringify([..._favGameIds]));
  }

  function _applyFilters(games) {
    const el = q('#oui-glist');
    if (!el) return;

    let list = games.slice();

    // Mode / favorites filter
    if (_bFilter === 'favorites') {
      list = list.filter(g => _favGameIds.has(g.gameId));
    } else if (_bFilter !== 'all') {
      list = list.filter(g => g.mode === _bFilter);
    }

    // Search
    if (_searchQuery) {
      const sq = _searchQuery.toLowerCase();
      list = list.filter(g =>
        (g.worldName || '').toLowerCase().includes(sq) ||
        (g.creatorName || '').toLowerCase().includes(sq)
      );
    }

    // Sort
    if (_sortMode === 'players') {
      list.sort((a, b) => b.currentPlayers - a.currentPlayers);
    } else if (_sortMode === 'active') {
      list.sort((a, b) => (b.lastAccessedAt || 0) - (a.lastAccessedAt || 0));
    } else if (_sortMode === 'expiring') {
      list.sort((a, b) => a.daysRemaining - b.daysRemaining);
    } else {
      list.sort((a, b) => b.createdAt - a.createdAt); // newest default
    }

    _renderGames(list, el);
  }

  function _renderGames(list, el) {
    list.forEach(g => { g.isMyGame = localStorage.getItem(`mp_my_game_${g.gameId}`) === '1'; });

    if (!list.length) {
      el.innerHTML = '<div class="oui-empty">No games found.<br>Be the first to create one!</div>';
      return;
    }

    const isFav = (gid) => _favGameIds.has(gid);
    el.innerHTML = list.map(g => `
      <div class="oui-game-row">
        <button class="oui-fav-btn" data-favid="${esc(g.gameId)}" title="Favorite"
                style="background:none;border:none;cursor:pointer;font-size:16px;padding:0 4px;color:${isFav(g.gameId)?'#FFD700':'#555'}">★</button>
        <div class="oui-game-info">
          <div class="oui-game-name">${esc(g.worldName)}</div>
          <div class="oui-game-meta">By ${esc(g.creatorName)} · ${g.currentPlayers}/${g.maxPlayers} · <span style="color:${g.daysRemaining < 1 ? '#ef9a9a' : g.daysRemaining < 2 ? '#ffcc80' : '#777'}">${g.daysRemaining}d left</span></div>
        </div>
        <span class="oui-tag oui-tag-${g.mode}">${g.mode}</span>
        ${g.hasPassword ? '<span title="Password required">🔒</span>' : ''}
        <button class="oui-btn-sm ${g.isFull?'oui-btn-secondary':'oui-btn-green'}"
                data-gid="${esc(g.gameId)}" data-mode="${esc(g.mode)}"
                data-hpw="${g.hasPassword}" ${g.isFull?'disabled title="Full"':''}>
          ${g.isFull ? 'Full' : 'Join'}
        </button>
        ${(g.isMyGame || localStorage.getItem('mp_admin_mode')==='1') ?
          `<button class="oui-btn-sm oui-btn-red" data-del="${esc(g.gameId)}" title="Delete game" style="padding:6px 8px">🗑</button>` : ''}
      </div>
    `).join('');

    qa('[data-favid]').forEach(btn => {
      btn.onclick = () => {
        const gid = btn.dataset.favid;
        if (_favGameIds.has(gid)) { _favGameIds.delete(gid); btn.style.color = '#555'; }
        else                      { _favGameIds.add(gid);    btn.style.color = '#FFD700'; }
        _saveFavs();
        // If in favorites view, re-filter
        if (_bFilter === 'favorites') _applyFilters(_allGames);
      };
    });

    qa('[data-gid]').forEach(btn => {
      if (btn.disabled) return;
      btn.onclick = () => {
        if (btn.dataset.hpw === 'true') showPwPrompt(btn.dataset.gid, btn.dataset.mode);
        else doJoin(btn.dataset.gid, btn.dataset.mode, '');
      };
    });

    qa('[data-del]').forEach(btn => {
      btn.onclick = async () => {
        const gid = btn.dataset.del;
        if (!confirm('Delete this game? This cannot be undone.')) return;
        const adminCode = localStorage.getItem('mp_admin_mode') === '1' ? 'DOGS' : undefined;
        const json = await fetchJSON(`${SERVER}/api/deleteGame`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId: gid, browserId: getBrowserId(), adminCode }),
        }).catch(() => ({ success: false }));
        if (json.success) {
          localStorage.removeItem(`mp_my_game_${gid}`);
          _allGames = _allGames.filter(g => g.gameId !== gid);
          _applyFilters(_allGames);
        }
      };
    });
  }

  function mount(html) {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'oui-overlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = html;
    overlay.style.display = 'flex';
  }

  function hide() { if (overlay) overlay.style.display = 'none'; }
  function q(sel)  { return overlay.querySelector(sel); }
  function qa(sel) { return overlay.querySelectorAll(sel); }
  function esc(v)  {
    return String(v)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Player preview ─────────────────────────────────────────
  function drawPreview(canvas, ps) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const S  = 2.5;
    const cx = canvas.width / 2;

    // measure total height and center vertically
    const totalH = (10 + 16 + 8 + 18) * S;
    let   py     = (canvas.height - totalH) / 2;

    const { shirtColor, pantsColor, skinColor } = ps;

    // Head (16×10)
    const hW = Math.round(16 * S), hH = Math.round(10 * S);
    ctx.fillStyle = skinColor;
    ctx.fillRect(cx - hW / 2, py, hW, hH);
    ctx.fillStyle = '#1a1a1a';
    const eS = Math.max(2, Math.round(S * 1.4));
    ctx.fillRect(cx - hW / 2 + Math.round(hW * 0.20), py + Math.round(hH * 0.40), eS, eS);
    ctx.fillRect(cx - hW / 2 + Math.round(hW * 0.65), py + Math.round(hH * 0.40), eS, eS);
    py += hH;

    // Body/shirt (20×16)
    const bW = Math.round(20 * S), bH = Math.round(16 * S);
    ctx.fillStyle = shirtColor;
    ctx.fillRect(cx - bW / 2, py, bW, bH);
    py += bH;

    // Hips/pants (20×8)
    const hiW = Math.round(20 * S), hiH = Math.round(8 * S);
    ctx.fillStyle = pantsColor;
    ctx.fillRect(cx - hiW / 2, py, hiW, hiH);
    py += hiH;

    // Legs (8×18 each, 4px gap at 1x → 10px at 2.5x)
    const lW = Math.round(8 * S), lH = Math.round(18 * S);
    ctx.fillStyle = pantsColor;
    ctx.fillRect(cx - hiW / 2,          py, lW, lH);
    ctx.fillRect(cx - hiW / 2 + hiW - lW, py, lW, lH);
  }

  // ── Step bar ───────────────────────────────────────────────
  function stepBar(cur, total) {
    return `<div class="oui-step-bar">${
      Array.from({length: total}, (_, i) =>
        `<div class="oui-step-dot ${i < cur ? 'done' : i === cur ? 'active' : ''}"></div>`
      ).join('')
    }</div>`;
  }

  // ── Home panel ─────────────────────────────────────────────
  function showHome() {
    const isAdmin = localStorage.getItem('mp_admin_mode') === '1';
    mount(`
      <div class="oui-panel">
        <button class="oui-close" id="oui-x">✕</button>
        <div class="oui-title">Play Online</div>
        <div class="oui-subtitle">4-player co-op • real-time sync</div>
        <button class="oui-btn oui-btn-secondary" id="oui-ps">⚙ Player Settings</button>
        <button class="oui-btn oui-btn-primary"   id="oui-cr">+ Create Game</button>
        <button class="oui-btn oui-btn-secondary" id="oui-br">⊞ Browse Games</button>
        ${isAdmin ? '<button class="oui-btn oui-btn-red" id="oui-adm">🔧 Admin Panel</button>' : ''}
      </div>
    `);
    q('#oui-x').onclick  = hide;
    q('#oui-ps').onclick = () => showPlayerSettings(true);
    q('#oui-cr').onclick = () => showCreate(0, {});
    q('#oui-br').onclick = showBrowser;
    if (isAdmin) q('#oui-adm').onclick = showAdminPanel;
  }

  // ── Preset outfits ─────────────────────────────────────────
  const PRESETS = [
    { name: 'Classic', shirt: '#FF6B6B', pants: '#1E1E1E', skin: '#F4A460' },
    { name: 'Forest',  shirt: '#2D5016', pants: '#1A3A0A', skin: '#8D5524' },
    { name: 'Ocean',   shirt: '#0066CC', pants: '#003366', skin: '#F4A460' },
    { name: 'Sunset',  shirt: '#FF8C00', pants: '#4B0082', skin: '#F4A460' },
    { name: 'Night',   shirt: '#0A0E27', pants: '#1A1A2E', skin: '#FDBCB4' },
    { name: 'Neon',    shirt: '#00FF00', pants: '#FF00FF', skin: '#F4A460' },
    { name: 'Lava',    shirt: '#FF4500', pants: '#8B0000', skin: '#F4A460' },
    { name: 'Ice',     shirt: '#ADD8E6', pants: '#4F94D4', skin: '#F4A460' },
  ];

  function presetGrid() {
    const btns = PRESETS.map((p, i) => `
      <button data-preset="${i}" title="${esc(p.name)}" style="
        background:${esc(p.shirt)};border:2px solid #333;border-radius:4px;
        width:36px;height:28px;cursor:pointer;position:relative;overflow:hidden;padding:0;
      ">
        <div style="position:absolute;bottom:0;left:0;right:0;height:12px;background:${esc(p.pants)}"></div>
      </button>
    `).join('');
    return `
      <label class="oui-label">Preset Outfits</label>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:14px">
        ${btns}
      </div>
    `;
  }

  // ── Player settings ────────────────────────────────────────
  function showPlayerSettings(fromHome = false) {
    const ps = loadPS();
    mount(`
      <div class="oui-panel">
        ${fromHome ? '<button class="oui-back" id="oui-back">←</button>' : ''}
        <button class="oui-close" id="oui-x">✕</button>
        <div class="oui-title" style="margin-top:8px">Player Settings</div>
        <label class="oui-label">Player Name</label>
        <input class="oui-input" id="oui-name" maxlength="20" value="${esc(ps.name)}" />
        <label class="oui-label">Appearance</label>
        ${presetGrid()}
        <div class="oui-color-row">
          <div class="oui-color-item">
            <input type="color" class="oui-color-swatch" id="oui-shirt" value="${ps.shirtColor}">
            <div class="oui-color-label">Shirt</div>
          </div>
          <div class="oui-color-item">
            <input type="color" class="oui-color-swatch" id="oui-pants" value="${ps.pantsColor}">
            <div class="oui-color-label">Pants</div>
          </div>
          <div class="oui-color-item">
            <input type="color" class="oui-color-swatch" id="oui-skin" value="${ps.skinColor}">
            <div class="oui-color-label">Skin</div>
          </div>
        </div>
        <canvas class="oui-preview-canvas" id="oui-prev" width="80" height="130"></canvas>
        <button class="oui-btn oui-btn-primary" id="oui-save">${fromHome ? 'Save Settings' : 'Save &amp; Continue →'}</button>
      </div>
    `);

    const canvas = q('#oui-prev');
    const getPS  = () => ({
      name:       q('#oui-name').value.trim() || 'Player',
      shirtColor: q('#oui-shirt').value,
      pantsColor: q('#oui-pants').value,
      skinColor:  q('#oui-skin').value,
    });

    drawPreview(canvas, ps);
    ['#oui-shirt','#oui-pants','#oui-skin'].forEach(id => {
      q(id).oninput = () => drawPreview(canvas, getPS());
    });

    // Preset outfit buttons
    qa('[data-preset]').forEach(btn => {
      btn.onclick = () => {
        const p = PRESETS[parseInt(btn.dataset.preset)];
        if (!p) return;
        q('#oui-shirt').value = p.shirt;
        q('#oui-pants').value = p.pants;
        q('#oui-skin').value  = p.skin;
        drawPreview(canvas, { shirtColor: p.shirt, pantsColor: p.pants, skinColor: p.skin });
      };
    });

    if (fromHome) q('#oui-back').onclick = showHome;
    q('#oui-x').onclick    = hide;
    q('#oui-save').onclick = () => { savePS(getPS()); showHome(); };
  }

  // ── Create game flow ───────────────────────────────────────
  function showCreate(step, data) {
    if      (step === 0) showCreateMode(data);
    else if (step === 1) showCreateWorld(data);
    else if (step === 2) showCreatePlayers(data);
    else                 showCreatePassword(data);
  }

  function showCreateMode(data) {
    const m = data.mode || null;
    mount(`
      <div class="oui-panel">
        <button class="oui-back"  id="oui-back">←</button>
        <button class="oui-close" id="oui-x">✕</button>
        <div class="oui-title" style="margin-top:8px">Create Game</div>
        ${stepBar(0, 4)}
        <label class="oui-label" style="text-align:center;display:block;margin-bottom:12px">Choose Mode</label>
        <div class="oui-row">
          <div class="oui-opt ${m==='normal'?'sel':''}"  id="oui-m-normal">
            <div style="font-size:18px;margin-bottom:3px">⚔️</div>
            <div style="font-weight:700">Normal</div>
            <div style="font-size:10px;color:#888;margin-top:2px">Survival</div>
          </div>
          <div class="oui-opt ${m==='sandbox'?'sel':''}" id="oui-m-sandbox">
            <div style="font-size:18px;margin-bottom:3px">🏗️</div>
            <div style="font-weight:700">Sandbox</div>
            <div style="font-size:10px;color:#888;margin-top:2px">Creative</div>
          </div>
          <div class="oui-opt ${m==='platformer'?'sel':''}" id="oui-m-platformer">
            <div style="font-size:18px;margin-bottom:3px">🏃</div>
            <div style="font-weight:700">Platformer</div>
            <div style="font-size:10px;color:#888;margin-top:2px">Race</div>
          </div>
        </div>
        <button class="oui-btn oui-btn-primary" id="oui-next" ${!m?'disabled':''}>Next →</button>
      </div>
    `);

    let mode = m;
    const next = q('#oui-next');

    ['normal','sandbox','platformer'].forEach(v => {
      q(`#oui-m-${v}`).onclick = () => {
        mode = v;
        qa('.oui-opt').forEach(e => e.classList.remove('sel'));
        q(`#oui-m-${v}`).classList.add('sel');
        next.disabled = false;
      };
    });

    q('#oui-back').onclick = showHome;
    q('#oui-x').onclick    = hide;
    q('#oui-next').onclick = () => showCreate(1, { ...data, mode });
  }

  function showCreateWorld(data) {
    const sbWorlds   = getSBWorlds();
    const hasSaved = sbWorlds.length > 0;
    let   choice     = data.worldChoice || 'new';
    let   selKey     = data.worldKey    || '';

    mount(`
      <div class="oui-panel">
        <button class="oui-back"  id="oui-back">←</button>
        <button class="oui-close" id="oui-x">✕</button>
        <div class="oui-title" style="margin-top:8px">Create Game</div>
        ${stepBar(1, 4)}
        <label class="oui-label">World Name</label>
        <input class="oui-input" id="oui-wname" maxlength="32"
               placeholder="My World" value="${esc(data.worldName||'')}" />
        ${hasSaved ? `
          <label class="oui-label">Start From</label>
          <div class="oui-row" style="margin-bottom:10px">
            <div class="oui-opt ${choice==='new'?'sel':''}"   id="oui-w-new">New World</div>
            <div class="oui-opt ${choice==='local'?'sel':''}" id="oui-w-local">Saved World</div>
          </div>
          <div id="oui-local" style="${choice==='local'?'':'display:none'}">
            <div class="oui-world-list" id="oui-wlist">
              ${sbWorlds.map(w =>
                `<div class="oui-world-item ${w.key===selKey?'sel':''}"
                      data-key="${esc(w.key)}">${esc(w.name)}</div>`
              ).join('')}
            </div>
          </div>
        ` : ''}
        <button class="oui-btn oui-btn-primary" id="oui-next">Next →</button>
      </div>
    `);

    if (hasSaved) {
      q('#oui-w-new').onclick = () => {
        choice = 'new'; selKey = '';
        qa('.oui-opt').forEach(e => e.classList.remove('sel'));
        q('#oui-w-new').classList.add('sel');
        q('#oui-local').style.display = 'none';
      };
      q('#oui-w-local').onclick = () => {
        choice = 'local';
        qa('.oui-opt').forEach(e => e.classList.remove('sel'));
        q('#oui-w-local').classList.add('sel');
        q('#oui-local').style.display = '';
      };
      qa('.oui-world-item').forEach(el => {
        el.onclick = () => {
          selKey = el.dataset.key;
          qa('.oui-world-item').forEach(e => e.classList.remove('sel'));
          el.classList.add('sel');
        };
      });
    }

    q('#oui-back').onclick = () => showCreate(0, data);
    q('#oui-x').onclick    = hide;
    q('#oui-next').onclick = () => {
      const worldName = q('#oui-wname').value.trim() || 'My World';
      showCreate(2, { ...data, worldName, worldChoice: choice, worldKey: selKey });
    };
  }

  function showCreatePlayers(data) {
    let max = data.maxPlayers || 4;
    mount(`
      <div class="oui-panel">
        <button class="oui-back"  id="oui-back">←</button>
        <button class="oui-close" id="oui-x">✕</button>
        <div class="oui-title" style="margin-top:8px">Create Game</div>
        ${stepBar(2, 4)}
        <label class="oui-label" style="text-align:center;display:block;margin-bottom:12px">Max Players</label>
        <div class="oui-row">
          ${[2,3,4].map(n=>`
            <div class="oui-opt ${max===n?'sel':''}" id="oui-max-${n}">
              <div style="font-size:24px;font-weight:700">${n}</div>
              <div style="font-size:10px;color:#888">${n===2?'Duo':n===3?'Trio':'Squad'}</div>
            </div>
          `).join('')}
        </div>
        <button class="oui-btn oui-btn-primary" id="oui-next" style="margin-top:8px">Next →</button>
      </div>
    `);

    [2,3,4].forEach(n => {
      q(`#oui-max-${n}`).onclick = () => {
        max = n;
        qa('.oui-opt').forEach(e => e.classList.remove('sel'));
        q(`#oui-max-${n}`).classList.add('sel');
      };
    });

    q('#oui-back').onclick = () => showCreate(1, data);
    q('#oui-x').onclick    = hide;
    q('#oui-next').onclick = () => showCreate(3, { ...data, maxPlayers: max });
  }

  function showCreatePassword(data) {
    let usePW = data.usePassword !== false;
    let pwVal = data.password   || genPassword();

    mount(`
      <div class="oui-panel">
        <button class="oui-back"  id="oui-back">←</button>
        <button class="oui-close" id="oui-x">✕</button>
        <div class="oui-title" style="margin-top:8px">Create Game</div>
        ${stepBar(3, 4)}
        <label class="oui-label">Access</label>
        <div class="oui-row" style="margin-bottom:14px">
          <div class="oui-opt ${usePW?'sel':''}"  id="oui-pw-yes">🔒 Password</div>
          <div class="oui-opt ${!usePW?'sel':''}" id="oui-pw-no">🌐 Public</div>
        </div>
        <div id="oui-pw-sec" style="${usePW?'':'display:none'}">
          <div class="oui-pw-row">
            <input class="oui-input" id="oui-pw" maxlength="32" value="${esc(pwVal)}" />
            <button class="oui-btn-sm oui-btn-secondary" id="oui-regen">↺</button>
          </div>
          <div class="oui-hint" style="margin-bottom:12px">Share this with your friends</div>
        </div>
        <div class="oui-status" id="oui-st"></div>
        <button class="oui-btn oui-btn-green" id="oui-launch">🚀 Create &amp; Launch</button>
      </div>
    `);

    q('#oui-pw-yes').onclick = () => {
      usePW = true;
      qa('.oui-opt').forEach(e => e.classList.remove('sel'));
      q('#oui-pw-yes').classList.add('sel');
      q('#oui-pw-sec').style.display = '';
    };
    q('#oui-pw-no').onclick = () => {
      usePW = false;
      qa('.oui-opt').forEach(e => e.classList.remove('sel'));
      q('#oui-pw-no').classList.add('sel');
      q('#oui-pw-sec').style.display = 'none';
    };
    q('#oui-regen').onclick = () => { q('#oui-pw').value = genPassword(); };

    q('#oui-back').onclick = () => showCreate(2, data);
    q('#oui-x').onclick    = hide;

    q('#oui-launch').onclick = async () => {
      const st    = q('#oui-st');
      const pw    = usePW ? (q('#oui-pw')?.value?.trim() || '') : '';
      const ps    = loadPS();
      const laBtn = q('#oui-launch');
      laBtn.disabled = true;
      st.textContent = 'Creating…'; st.className = 'oui-status';

      // Load saved world data if selected
      let worldData = null;
      if (data.worldChoice === 'local' && data.worldKey) {
        try { worldData = JSON.parse(localStorage.getItem(data.worldKey)); }
        catch { /* ignore */ }
      }

      try {
        const json = await fetchJSON(`${SERVER}/api/createGame`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            creatorName:      ps.name,
            creatorBrowserId: getBrowserId(),
            mode:             data.mode,
            worldName:        data.worldName || 'My World',
            maxPlayers:       data.maxPlayers || 4,
            password:         pw || undefined,
          }),
        });
        if (!json.success) throw new Error(json.error || 'Server error');

        localStorage.setItem(`mp_my_game_${json.gameId}`, '1');
        hide();
        _onStart?.(data.mode, json.gameId, {
          playerName: ps.name,
          shirtColor: ps.shirtColor,
          pantsColor: ps.pantsColor,
          skinColor:  ps.skinColor,
          worldData:  worldData || undefined,
          worldName:  data.worldName,
          worldKey:   (data.worldChoice === 'local' ? data.worldKey : null) || null,
          browserId:  getBrowserId(),
        });
      } catch (err) {
        st.textContent = `Error: ${err.message}`;
        st.className   = 'oui-status err';
        laBtn.disabled = false;
      }
    };
  }

  // ── Game browser ───────────────────────────────────────────
  function showBrowser() {
    _searchQuery = '';
    mount(`
      <div class="oui-panel">
        <button class="oui-back"  id="oui-back">←</button>
        <button class="oui-close" id="oui-x">✕</button>
        <div class="oui-title" style="margin-top:8px">Browse Games</div>
        <div class="oui-filter-tabs">
          <button class="oui-ftab ${_bFilter==='all'?'active':''}"         data-f="all">All</button>
          <button class="oui-ftab ${_bFilter==='normal'?'active':''}"      data-f="normal">Normal</button>
          <button class="oui-ftab ${_bFilter==='sandbox'?'active':''}"     data-f="sandbox">Sandbox</button>
          <button class="oui-ftab ${_bFilter==='platformer'?'active':''}"  data-f="platformer">Platformer</button>
          <button class="oui-ftab ${_bFilter==='favorites'?'active':''}"   data-f="favorites">★</button>
        </div>
        <div style="display:flex;gap:6px;margin-bottom:10px">
          <input id="oui-search" class="oui-input" placeholder="Search by name or creator…"
                 style="margin-bottom:0;flex:1" value="${esc(_searchQuery)}">
          <select id="oui-sort" style="background:#0c0c1e;color:#e0e0e0;border:1px solid #444;border-radius:5px;padding:4px 8px;font-size:12px">
            <option value="newest"   ${_sortMode==='newest'  ?'selected':''}>Newest</option>
            <option value="players"  ${_sortMode==='players' ?'selected':''}>Players</option>
            <option value="active"   ${_sortMode==='active'  ?'selected':''}>Active</option>
            <option value="expiring" ${_sortMode==='expiring'?'selected':''}>Expiring</option>
          </select>
        </div>
        <div id="oui-glist" class="oui-game-list"><div class="oui-empty">Loading…</div></div>
        <div class="oui-status" id="oui-st"></div>
        <button class="oui-btn oui-btn-secondary" id="oui-ref" style="margin-bottom:0">↺ Refresh</button>
      </div>
    `);

    qa('.oui-ftab').forEach(tab => {
      tab.onclick = () => {
        _bFilter = tab.dataset.f;
        qa('.oui-ftab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        if (_allGames.length > 0) _applyFilters(_allGames);
        else fetchGames();
      };
    });

    q('#oui-search').oninput = (e) => {
      _searchQuery = e.target.value;
      _applyFilters(_allGames);
    };
    q('#oui-sort').onchange = (e) => {
      _sortMode = e.target.value;
      _applyFilters(_allGames);
    };

    q('#oui-back').onclick = showHome;
    q('#oui-x').onclick    = hide;
    q('#oui-ref').onclick  = fetchGames;

    fetchGames();
  }

  async function fetchGames() {
    const el = q('#oui-glist');
    if (!el) return;
    el.innerHTML = '<div class="oui-empty">Loading…</div>';

    try {
      // Always fetch all games; client-side filtering handles mode/search/sort
      const list = await fetchJSON(`${SERVER}/api/listGames`);
      _allGames = list;
      _applyFilters(_allGames);
    } catch (err) {
      el.innerHTML = `<div class="oui-empty">Failed to load.<br>${esc(err.message)}</div>`;
    }
  }

  async function showAdminPanel() {
    mount(`
      <div class="oui-panel">
        <button class="oui-back"  id="oui-back">←</button>
        <button class="oui-close" id="oui-x">✕</button>
        <div class="oui-title" style="margin-top:8px">Admin Panel</div>
        <div id="oui-adm-content"><div class="oui-empty">Loading…</div></div>
        <button class="oui-btn oui-btn-secondary" id="oui-ref" style="margin-bottom:0">↺ Refresh</button>
      </div>
    `);
    q('#oui-back').onclick = showHome;
    q('#oui-x').onclick    = hide;
    q('#oui-ref').onclick  = loadAdminData;
    loadAdminData();
  }

  async function loadAdminData() {
    const el = q('#oui-adm-content');
    if (!el) return;
    el.innerHTML = '<div class="oui-empty">Loading…</div>';
    try {
      const data = await fetchJSON(`${SERVER}/api/admin/games?adminCode=DOGS`);

      let html = '<label class="oui-label" style="margin-bottom:6px">Active Games</label>';
      if (!data.active.length) {
        html += '<div class="oui-empty" style="padding:12px">No active games</div>';
      } else {
        html += '<div class="oui-game-list" style="max-height:180px">';
        html += data.active.map(g => `
          <div class="oui-game-row">
            <div class="oui-game-info">
              <div class="oui-game-name">${esc(g.worldName)}</div>
              <div class="oui-game-meta">${g.mode} · ${g.currentPlayers}P · ${g.daysSince}d idle · ${g.deletesInDays}d left</div>
            </div>
            <span class="oui-tag oui-tag-${g.mode}">${g.mode}</span>
            <button class="oui-btn-sm oui-btn-red" data-adel="${esc(g.gameId)}" style="padding:5px 8px">🗑</button>
          </div>
        `).join('');
        html += '</div>';
      }

      if (data.deleted.length) {
        html += '<hr class="oui-divider"><label class="oui-label" style="margin-bottom:6px">Recently Deleted</label>';
        html += '<div class="oui-game-list" style="max-height:120px">';
        html += data.deleted.slice(0,20).map(d => `
          <div class="oui-game-row">
            <div class="oui-game-info">
              <div class="oui-game-name" style="color:#888">${esc(d.worldName || d.gameId)}</div>
              <div class="oui-game-meta">${d.mode} · by ${esc(d.creatorName||'?')} · ${d.deletedBy}</div>
            </div>
          </div>
        `).join('');
        html += '</div>';
      }

      el.innerHTML = html;

      qa('[data-adel]').forEach(btn => {
        btn.onclick = async () => {
          if (!confirm('Admin delete this game?')) return;
          const json = await fetchJSON(`${SERVER}/api/deleteGame`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId: btn.dataset.adel, adminCode: 'DOGS' }),
          }).catch(() => ({ success: false }));
          if (json.success) loadAdminData();
        };
      });
    } catch (err) {
      el.innerHTML = `<div class="oui-empty">Error: ${esc(err.message)}</div>`;
    }
  }

  function showPwPrompt(gameId, mode) {
    const modal = document.createElement('div');
    modal.id    = 'oui-pwmodal';
    modal.style.cssText = `
      position:fixed;inset:0;z-index:9001;
      background:rgba(0,0,0,.6);
      display:flex;align-items:center;justify-content:center;
    `;
    modal.innerHTML = `
      <div class="oui-panel" style="min-width:280px;max-width:340px">
        <div class="oui-title" style="font-size:17px">Password Required</div>
        <label class="oui-label">Enter Password</label>
        <input class="oui-input" id="oui-jpw" placeholder="password…" autocomplete="off" />
        <div class="oui-status err" id="oui-jerr" style="display:none"></div>
        <div class="oui-row" style="margin-bottom:0">
          <button class="oui-btn-sm oui-btn-secondary" id="oui-jcancel" style="flex:1;text-align:center">Cancel</button>
          <button class="oui-btn-sm oui-btn-green"     id="oui-jok"     style="flex:1;text-align:center">Join</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const inp    = modal.querySelector('#oui-jpw');
    const errEl  = modal.querySelector('#oui-jerr');
    const okBtn  = modal.querySelector('#oui-jok');
    inp.focus();
    inp.onkeydown = e => { if (e.key === 'Enter') okBtn.click(); };

    modal.querySelector('#oui-jcancel').onclick = () => modal.remove();
    okBtn.onclick = async () => {
      const pw = inp.value.trim();
      if (!pw) { errEl.textContent = 'Enter the password'; errEl.style.display = ''; return; }
      okBtn.disabled = true;
      const ok = await doJoin(gameId, mode, pw, errEl);
      if (ok) modal.remove();
      else    okBtn.disabled = false;
    };
  }

  async function doJoin(gameId, mode, password, errEl = null) {
    const stEl = q('#oui-st');
    if (stEl) { stEl.textContent = 'Joining…'; stEl.className = 'oui-status'; }

    try {
      const json = await fetchJSON(`${SERVER}/api/joinGame`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ gameId, password }),
      });

      if (!json.success) {
        const msg = json.error || 'Failed to join';
        if (errEl) { errEl.textContent = msg; errEl.style.display = ''; }
        else if (stEl) { stEl.textContent = msg; stEl.className = 'oui-status err'; }
        return false;
      }

      const ps = loadPS();
      hide();
      _onStart?.(json.mode || mode, gameId, {
        playerName:  ps.name,
        shirtColor:  ps.shirtColor,
        pantsColor:  ps.pantsColor,
        skinColor:   ps.skinColor,
        worldState:  json.worldState || undefined,
        worldName:   json.worldName,
        browserId:   getBrowserId(),
      });
      return true;
    } catch (err) {
      const msg = `Error: ${err.message}`;
      if (errEl) { errEl.textContent = msg; errEl.style.display = ''; }
      else if (stEl) { stEl.textContent = msg; stEl.className = 'oui-status err'; }
      return false;
    }
  }

  // ── Public API ─────────────────────────────────────────────
  return {
    show(onStartGame) {
      injectCSS();
      _onStart = onStartGame;
      showPlayerSettings(false);
    },
  };
})();
