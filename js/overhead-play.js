// ══════════════════════════════════════════════════════════════════════════
// OVERHEAD_PLAY — real (non-test) play path for OVERHEAD worlds.
//
// GAME_PLAY.init() dispatches here when a game's world is viewMode:'overhead'
// (the side-scroll Game engine can't run overhead worlds). This module owns the
// overhead play session end-to-end: resolve the world from the game record,
// a pre-launch controller-assign screen, launch OverheadGame in real (non-test)
// mode, an in-game (Esc) pause panel where controllers can be (re)configured,
// and a clean exit back to game selection.
//
// Controller config is the whole motivation (Kevin, 2026-08-07): before this,
// overhead was only reachable via the editor's Test button, so there was no real
// play session in which to assign/tune controllers. Both the pre-launch screen
// and the pause panel drive the SAME global ControllerConfig the runtime already
// reads each frame (`_syncControllerSlots`).
// ══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const PLAYER_COLORS = ['#ffd24a', '#7fd0ff', '#9cff7f', '#ff9c9c'];   // P1-P4 accents (match the in-canvas HUD)
  const cfg = () => (typeof ControllerConfig !== 'undefined') ? ControllerConfig : null;

  // Keyboard + detected-gamepad options for a per-player <select>. -1 = keyboard/none.
  function padOptions() {
    let pads = [];
    try { pads = (typeof navigator !== 'undefined' && navigator.getGamepads) ? (navigator.getGamepads() || []) : []; } catch (_) {}
    const opts = [{ v: -1, label: 'Keyboard / None' }];
    for (let i = 0; i < 4; i++) {
      const p = pads[i];
      opts.push({ v: i, label: 'Gamepad ' + (i + 1) + (p ? ' — ' + String(p.id || '').slice(0, 22) : ' (not detected)') });
    }
    return opts;
  }
  const optionHtml = (opts, sel) => opts.map((o) => `<option value="${o.v}"${o.v === sel ? ' selected' : ''}>${o.label}</option>`).join('');

  function padConnected(slot) {
    if (slot == null || slot < 0) return false;
    try { const pads = (typeof navigator !== 'undefined' && navigator.getGamepads) ? (navigator.getGamepads() || []) : []; return !!pads[slot]; } catch (_) { return false; }
  }
  // The dropdown default for a player: their saved assignment, UNLESS it's a gamepad slot with no
  // pad currently connected — then fall back to keyboard (-1) so a stale saved assignment doesn't
  // leave P1 pointing at "Gamepad 1 (not detected)" and effectively unassigned (412 tester note).
  function effectiveAssign(i) {
    const c = cfg(); const raw = c ? c.getAssignment(i) : (i === 1 ? -1 : i - 1);
    return (raw >= 0 && !padConnected(raw)) ? -1 : raw;
  }

  const OVERHEAD_PLAY = {
    _ctx: null, _world: null, _watch: null, _pauseEl: null,

    // Entry — called by GAME_PLAY.init for viewMode:'overhead' games.
    // ctx = { gameId, gameName, gameMode, record, gameData, onExit }
    init(ctx) {
      const world = this._resolveWorld(ctx.gameData || (ctx.record && ctx.record.game_data));
      if (!world) { try { alert('This overhead game has no world data.'); } catch (_) {} if (ctx.onExit) ctx.onExit(); return; }
      this._ctx = ctx; this._world = world;
      this._hideScreens();
      const c = cfg(); if (c && c.setMode) c.setMode(ctx.gameMode || 'platformer');   // per-mode stick tuning shared with side-scroll
      this._openSetup(world, ctx.gameMode, (choice) => {
        if (!choice) { this._return(); return; }   // cancelled → back to selection
        this._launch(world, choice.numPlayers);
      });
    },

    _launch(world, numPlayers) {
      if (typeof OVERHEAD === 'undefined' || !OVERHEAD.launchWorld) { this._return(); return; }
      const w = JSON.parse(JSON.stringify(world));
      window.game = OVERHEAD.launchWorld(w, { testMode: false, numPlayers }, () => this._return());
      this._startPauseWatch();
    },

    _return() {
      this._stopPauseWatch(); this._hidePause();
      try { if (window.game && window.game.destroy) window.game.destroy(); } catch (_) {}
      window.game = null;
      if (this._ctx && this._ctx.onExit) { const cb = this._ctx.onExit; this._ctx = null; cb(); }
      else { this._ctx = null; const d = document.getElementById('game-selection-screen'); if (d) d.style.display = 'block'; }
    },

    _hideScreens() {
      ['dashboard-screen', 'game-selection-screen', 'arena-select-screen', 'campaign-select-screen', 'sandbox-screen', 'play-hud']
        .forEach((id) => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    },

    // The game record's game_data is either the raw overhead world object or a
    // { world_data: {...} } wrapper. Return the actual overhead world.
    _resolveWorld(gd) {
      if (!gd) return null;
      if (gd.world_data && (gd.world_data.viewMode === 'overhead' || gd.world_data.mapSnapshot)) return gd.world_data;
      if (gd.viewMode === 'overhead' || gd.mapSnapshot) return gd;
      return gd;
    },
    _playerCount(world) { return Math.max(1, Math.min(4, ((world && world.spawns || []).length) || 1)); },

    // Is a game record's game_data an OVERHEAD world? viewMode is the primary signal, but an
    // overhead world ALWAYS carries a mapSnapshot that side-scroll worlds never have — so we also
    // accept that (and a nested world_data wrapper) as a fallback for records whose viewMode was
    // dropped by an older save/copy path. Kept pure + here so GAME_PLAY dispatch stays testable.
    isOverheadGameData(gd) {
      if (!gd) return false;
      const wd = gd.world_data ? gd.world_data : gd;
      return !!(wd && (wd.viewMode === 'overhead' || wd.mapSnapshot)) || gd.viewMode === 'overhead' || !!gd.mapSnapshot;
    },

    // ── Pre-launch controller setup ─────────────────────────────────────────
    _openSetup(world, gameMode, done) {
      const maxByWorld = this._playerCount(world);
      const ov = this._overlay('oh-setup-overlay');
      const opts = padOptions(), c = cfg();
      let rows = '';
      for (let i = 1; i <= 4; i++) {
        rows += `<div class="ohs-row" data-p="${i}" style="display:flex;align-items:center;gap:10px;margin:6px 0">
          <span class="oh-pchip" style="background:${PLAYER_COLORS[i - 1]}">P${i}</span>
          <select class="ohs-pad" style="flex:1;padding:6px">${optionHtml(opts, effectiveAssign(i))}</select></div>`;
      }
      ov.innerHTML = `<div class="ohs-card">
        <h2 style="margin:0 0 4px">Set up controllers</h2>
        <p class="oh-sub">Assign a keyboard or gamepad to each player, then start. P1 defaults to keyboard/mouse. You can change these any time from the in-game pause menu (Esc).</p>
        <label style="display:block;margin-bottom:10px">Players: <select id="ohs-count">${[1, 2, 3, 4].map((n) => `<option value="${n}"${n === maxByWorld ? ' selected' : ''}>${n}</option>`).join('')}</select>
          <span class="oh-note">(this world has ${maxByWorld} spawn${maxByWorld > 1 ? 's' : ''})</span></label>
        <div id="ohs-rows">${rows}</div>
        <div class="oh-btnrow"><button id="ohs-cancel">Cancel</button><button id="ohs-start" class="primary">▶ Start</button></div>
      </div>`;
      const g = (id) => document.getElementById(id);
      const rowEls = () => [].slice.call(ov.querySelectorAll('.ohs-row'));
      const applyCount = () => { const n = +g('ohs-count').value; rowEls().forEach((r) => { r.style.display = (+r.dataset.p <= n) ? 'flex' : 'none'; }); };
      applyCount(); g('ohs-count').onchange = applyCount;
      g('ohs-cancel').onclick = () => { this._closeOverlay(ov); done(null); };
      g('ohs-start').onclick = () => {
        const n = +g('ohs-count').value;
        if (c) rowEls().forEach((r) => { const sel = r.querySelector('.ohs-pad'); c.setAssignment(+r.dataset.p, +sel.value); });
        this._closeOverlay(ov); done({ numPlayers: n });
      };
    },

    // ── In-game pause menu (Esc) — polls window.game.state so the runtime needs no hook ──
    _startPauseWatch() {
      this._stopPauseWatch();
      const tick = () => {
        if (!window.game) { this._watch = null; return; }
        const paused = window.game.state === 'paused';
        if (paused && !this._pauseEl) this._showPause();
        else if (!paused && this._pauseEl) this._hidePause();
        this._watch = requestAnimationFrame(tick);
      };
      this._watch = requestAnimationFrame(tick);
    },
    _stopPauseWatch() { if (this._watch) { try { cancelAnimationFrame(this._watch); } catch (_) {} } this._watch = null; },

    _showPause() {
      const ov = this._overlay('oh-pause-overlay'); this._pauseEl = ov;
      const c = cfg();
      const n = (window.game && window.game.players) ? window.game.players.length : 1;
      const opts = padOptions();
      let rows = '';
      for (let i = 1; i <= n; i++) {
        const a = effectiveAssign(i);
        const aim = c ? c.getAimSensitivity(i) : 1, dz = c ? c.getDeadzone(i) : 0.2;
        rows += `<div class="ohp-row" data-p="${i}">
          <div style="display:flex;align-items:center;gap:10px"><span class="oh-pchip" style="background:${PLAYER_COLORS[i - 1]}">P${i}</span>
            <select class="ohp-pad" style="flex:1;padding:6px">${optionHtml(opts, a)}</select></div>
          <div style="display:flex;gap:14px;margin-top:6px;font-size:12px;opacity:.85">
            <label style="flex:1">Aim sensitivity<input class="ohp-aim" type="range" min="0.3" max="2" step="0.05" value="${aim}" style="width:100%"></label>
            <label style="flex:1">Deadzone<input class="ohp-dz" type="range" min="0" max="0.6" step="0.02" value="${dz}" style="width:100%"></label></div></div>`;
      }
      ov.innerHTML = `<div class="ohp-card">
        <h2 style="margin:0 0 6px">Paused</h2>
        <p class="oh-sub">Assign or tune controllers below — changes apply live.</p>
        <div>${rows}</div>
        <div class="oh-btnrow" style="margin-top:12px">
          ${(typeof CONTROLS_UI !== 'undefined') ? '<button id="ohp-rebind">⌨ Rebind keys / buttons</button>' : ''}
          <span style="flex:1"></span>
          <button id="ohp-exit">✕ Exit to menu</button>
          <button id="ohp-resume" class="primary">▶ Resume</button></div></div>`;
      [].slice.call(ov.querySelectorAll('.ohp-row')).forEach((r) => {
        const p = +r.dataset.p;
        r.querySelector('.ohp-pad').onchange = (e) => { if (c) c.setAssignment(p, +e.target.value); };
        r.querySelector('.ohp-aim').oninput = (e) => { if (c) c.setAimSensitivity(p, +e.target.value); };
        r.querySelector('.ohp-dz').oninput = (e) => { if (c) c.setDeadzone(p, +e.target.value); };
      });
      const g = (id) => document.getElementById(id);
      g('ohp-resume').onclick = () => { if (window.game) window.game.state = 'playing'; this._hidePause(); };
      g('ohp-exit').onclick = () => { if (window.game && window.game._exit) window.game._exit(); else this._return(); };
      const rb = g('ohp-rebind'); if (rb) rb.onclick = () => { try { CONTROLS_UI.open(window.game); } catch (_) {} };
    },
    _hidePause() { if (this._pauseEl) { this._closeOverlay(this._pauseEl); this._pauseEl = null; } },

    // ── overlay helpers ─────────────────────────────────────────────────────
    _overlay(id) {
      let ov = document.getElementById(id);
      if (!ov) { ov = document.createElement('div'); ov.id = id; (document.body || document.documentElement).appendChild(ov); }
      ov.className = 'oh-play-overlay';
      ov.style.cssText = 'position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;background:rgba(6,10,18,.72)';
      if (!document.getElementById('oh-play-overlay-css')) {
        const st = document.createElement('style'); st.id = 'oh-play-overlay-css';
        st.textContent = '.oh-play-overlay .ohs-card,.oh-play-overlay .ohp-card{background:#141a26;color:#e7edf7;border:1px solid #33507e;border-radius:12px;padding:22px;width:92%;max-width:520px;box-shadow:0 12px 40px rgba(0,0,0,.5);font-family:sans-serif}.oh-play-overlay h2{font-size:20px}.oh-play-overlay .oh-sub{opacity:.72;margin:.2em 0 1em;font-size:13px}.oh-play-overlay .oh-note{opacity:.6;font-size:12px}.oh-play-overlay .oh-pchip{width:26px;height:26px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;font-weight:700;color:#111;flex:none}.oh-play-overlay .ohp-row{border-top:1px solid rgba(255,255,255,.12);padding:8px 0}.oh-play-overlay .oh-btnrow{display:flex;gap:10px;justify-content:flex-end;align-items:center;margin-top:16px;flex-wrap:wrap}.oh-play-overlay button{background:#22304a;color:#dbe4f3;border:1px solid #3c5a8c;border-radius:7px;padding:8px 14px;cursor:pointer;font-size:14px}.oh-play-overlay button.primary{background:#2f7d4f;border-color:#49b578;color:#fff}.oh-play-overlay select,.oh-play-overlay input{background:#0e1420;color:#e7edf7;border:1px solid #33507e;border-radius:5px}';
        document.head.appendChild(st);
      }
      ov.style.display = 'flex';
      return ov;
    },
    _closeOverlay(ov) { if (ov && ov.parentNode) ov.parentNode.removeChild(ov); },
  };

  if (typeof window !== 'undefined') window.OVERHEAD_PLAY = OVERHEAD_PLAY;
  if (typeof module !== 'undefined' && module.exports) module.exports = { OVERHEAD_PLAY };
})();
