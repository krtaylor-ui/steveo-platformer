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
      if (typeof PLAYER_LOOKS !== 'undefined' && PLAYER_LOOKS.load) PLAYER_LOOKS.load();
      // Speed Run (and anything that isn't Platform/Arena) = single player, NO setup window — it just
      // plays; controls are tuned via the Esc pause menu. Platform (co-op 1-4) and Arena (2-4 + versus)
      // get the pre-game settings window (Kevin: Speed Run wrongly showed the window + 4 players).
      const mode = ctx.gameMode;
      if (mode !== 'platformer' && mode !== 'arena') { this._launch(world, { numPlayers: 1 }); return; }
      this._openSetup(world, mode, (choice) => {
        if (!choice) { this._return(); return; }   // cancelled → back to selection
        this._launch(world, choice);
      });
    },

    _launch(world, opts) {
      opts = opts || {};
      const numPlayers = Math.max(1, Math.min(4, opts.numPlayers || 1));
      if (typeof OVERHEAD === 'undefined' || !OVERHEAD.launchWorld) { this._return(); return; }
      const w = JSON.parse(JSON.stringify(world));
      if (opts.characterId) w.characterId = opts.characterId;   // §Custom Sprites — chosen character (overhead reads worldData.characterId)
      // Arena = local PvP versus. Apply the settings window's versus choice (mode/teams/kill target);
      // default to Deathmatch so "Arena" means versus (engages with 2+ players).
      if (this._ctx && this._ctx.gameMode === 'arena') {
        w.settings = w.settings || {};
        const v = opts.versus || {};
        w.settings.versusMode = v.mode || ((w.settings.versusMode && w.settings.versusMode !== 'off') ? w.settings.versusMode : 'deathmatch');
        w.settings.versusTeams = !!v.teams;
        if (v.killTarget) w.settings.versusKillTarget = v.killTarget;
      }
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

    // ── Pre-game settings window ─────────────────────────────────────────────
    // Per-player PANELS navigated with the D-pad (each pad edits ONLY its own player's panel; P1 also
    // owns the match options + Start). Mouse works too. Fields "cycle" on A / left-right so young
    // players never need a free cursor (Kevin). Platform => co-op 1-4; Arena => 2-4 + versus config.
    _openSetup(world, gameMode, done) {
      const isArena = gameMode === 'arena';
      const minP = isArena ? 2 : 1, maxP = 4;
      const c = cfg(), L = (typeof PLAYER_LOOKS !== 'undefined') ? PLAYER_LOOKS : null;
      const st = {
        count: Math.max(minP, Math.min(maxP, this._playerCount(world) || (isArena ? 2 : 1))),
        characterId: world.characterId || (typeof CHARACTERS !== 'undefined' ? CHARACTERS.DEFAULT_ID : 'classic') || 'classic',
        versusMode: (world.settings && world.settings.versusMode && world.settings.versusMode !== 'off') ? world.settings.versusMode : 'deathmatch',
        teams: !!(world.settings && world.settings.versusTeams),
        killTarget: (world.settings && world.settings.versusKillTarget) || 10,
      };
      const ctrlOrder = [-1, 0, 1, 2, 3];
      const ctrlLabel = (a) => a < 0 ? 'Keyboard' : ('Pad ' + (a + 1) + (padConnected(a) ? '' : ' (none)'));
      const cyc = (arr, cur, dir) => { let i = arr.indexOf(cur); i = (i < 0) ? 0 : (i + dir + arr.length) % arr.length; return arr[i]; };

      const fieldsFor = (pnum) => {
        const sw = (field) => ({ key: field, label: field[0].toUpperCase() + field.slice(1), kind: 'swatch',
          color: () => L ? L.get(pnum)[field] : '#888', step: (d) => { if (L) L.set(pnum, field, cyc(L.SWATCHES[field], L.get(pnum)[field], d)); } });
        return [
          { key: 'ctrl', label: 'Controller', kind: 'text', text: () => ctrlLabel(c ? c.getAssignment(pnum) : (pnum === 1 ? -1 : pnum - 1)),
            step: (d) => { if (c) c.setAssignment(pnum, cyc(ctrlOrder, c.getAssignment(pnum), d)); } },
          { key: 'body', label: 'Body', kind: 'text', text: () => (L && L.get(pnum).sprite === 'girl') ? 'Girl' : 'Boy',
            step: () => { if (L) L.set(pnum, 'sprite', L.get(pnum).sprite === 'girl' ? 'boy' : 'girl'); } },
          sw('skin'), sw('hair'), sw('shirt'), sw('pants'),
        ];
      };
      const globalFields = () => {
        const g = [{ key: 'count', label: 'Players', kind: 'text', global: true, text: () => String(st.count),
          step: (d) => { st.count = Math.max(minP, Math.min(maxP, st.count + (d >= 0 ? 1 : -1))); } }];
        if (typeof CHARACTERS !== 'undefined') g.push({ key: 'character', label: 'Character', kind: 'text', global: true,
          text: () => (CHARACTERS.get(st.characterId).name || 'Classic'),
          step: (d) => { const ids = CHARACTERS.ids(); let i = ids.indexOf(st.characterId); i = (i < 0) ? 0 : (i + (d >= 0 ? 1 : -1) + ids.length) % ids.length; st.characterId = ids[i]; } });
        if (isArena) {
          g.push({ key: 'mode', label: 'Match', kind: 'text', global: true, text: () => st.versusMode === 'lastStanding' ? 'Last-Standing' : 'Deathmatch',
            step: () => { st.versusMode = st.versusMode === 'lastStanding' ? 'deathmatch' : 'lastStanding'; } });
          g.push({ key: 'teams', label: 'Teams', kind: 'text', global: true, text: () => st.teams ? 'On (P1+P3 v P2+P4)' : 'Off',
            step: () => { st.teams = !st.teams; } });
          g.push({ key: 'kt', label: 'Kill target', kind: 'text', global: true, text: () => String(st.killTarget),
            step: (d) => { st.killTarget = Math.max(1, st.killTarget + (d >= 0 ? 1 : -1)); } });
        }
        g.push({ key: 'start', label: '▶ START', kind: 'action', global: true, action: () => finish() });
        return g;
      };
      const listFor = (p) => p === 1 ? fieldsFor(1).concat(globalFields()) : fieldsFor(p);

      const focus = { 1: 0, 2: 0, 3: 0, 4: 0 };
      const ov = this._overlay('oh-setup-overlay');
      let open = true, raf = 0; const navPrev = [{}, {}, {}, {}];

      const finish = () => { open = false; if (raf) cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey, true);
        this._closeOverlay(ov); done({ numPlayers: st.count, characterId: st.characterId, versus: { mode: st.versusMode, teams: st.teams, killTarget: st.killTarget } }); };
      const cancel = () => { open = false; if (raf) cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey, true);
        this._closeOverlay(ov); done(null); };

      const render = () => {
        st.count = Math.max(minP, Math.min(maxP, st.count));
        let panels = '';
        for (let p = 1; p <= st.count; p++) {
          const list = listFor(p); focus[p] = Math.min(focus[p], list.length - 1);
          let rows = '';
          list.forEach((f, i) => {
            const hot = i === focus[p];
            const val = f.kind === 'swatch' ? `<span class="ohsw" style="background:${f.color()}"></span>`
              : f.kind === 'action' ? '' : `<span class="ohv">${f.text()}</span>`;
            rows += `<div class="ohf${hot ? ' hot' : ''}${f.global ? ' glob' : ''}${f.kind === 'action' ? ' act' : ''}" data-p="${p}" data-i="${i}"><span class="ohl">${f.label}</span>${val}</div>`;
          });
          panels += `<div class="ohpanel"><div class="ohph" style="background:${PLAYER_COLORS[p - 1]}">P${p}</div>${rows}</div>`;
        }
        ov.innerHTML = `<div class="ohsetup"><h2>${isArena ? 'Arena setup' : 'Co-op setup'}</h2>
          <p class="oh-sub">Each player uses their OWN controller to set their panel — D-pad to move, A or left/right to change. P1 sets the match options and starts. (Mouse works too.)</p>
          <div class="ohpanels">${panels}</div>
          <div class="oh-btnrow"><button id="ohs-cancel" class="btn">Cancel</button></div></div>`;
        [].slice.call(ov.querySelectorAll('.ohf')).forEach((el) => {
          const p = +el.dataset.p, i = +el.dataset.i;
          el.onclick = () => { focus[p] = i; const f = listFor(p)[i]; if (f.kind === 'action') f.action(); else if (f.step) { f.step(1); render(); } };
          el.oncontextmenu = (e) => { e.preventDefault(); focus[p] = i; const f = listFor(p)[i]; if (f.step) { f.step(-1); render(); } };
        });
        const cxb = document.getElementById('ohs-cancel'); if (cxb) cxb.onclick = cancel;
      };

      const nav = (pnum, act) => {
        if (pnum > st.count) return;
        const list = listFor(pnum); let fi = Math.min(focus[pnum], list.length - 1);
        if (act === 'up') fi = (fi - 1 + list.length) % list.length;
        else if (act === 'down') fi = (fi + 1) % list.length;
        else { const f = list[fi];
          if (act === 'act') { if (f.kind === 'action') { f.action(); return; } if (f.step) f.step(1); }
          else if (act === 'left' && f.step) f.step(-1);
          else if (act === 'right' && f.step) f.step(1); }
        focus[pnum] = fi; render();
      };

      const onKey = (e) => {
        if (!open) return; const k = e.key; let h = true;
        if (k === 'Escape') { cancel(); }
        else if (k === 'ArrowUp') nav(1, 'up');
        else if (k === 'ArrowDown') nav(1, 'down');
        else if (k === 'ArrowLeft') nav(1, 'left');
        else if (k === 'ArrowRight') nav(1, 'right');
        else if (k === 'Enter' || k === ' ') nav(1, 'act');
        else h = false;
        if (h) e.preventDefault();
      };
      document.addEventListener('keydown', onKey, true);

      const poll = () => {
        if (!open) return;
        let pads = []; try { pads = (navigator.getGamepads && navigator.getGamepads()) || []; } catch (_) {}
        for (let s = 0; s < 4; s++) {
          const gp = pads[s]; if (!gp) continue; const pnum = s + 1; if (pnum > st.count) continue;
          const b = gp.buttons || [], ax = gp.axes || [];
          const dn = (i) => !!(b[i] && b[i].pressed), av = (i) => ax.length > i ? ax[i] : 0;
          const cur = { up: dn(12) || av(1) < -0.5, down: dn(13) || av(1) > 0.5, left: dn(14) || av(0) < -0.5, right: dn(15) || av(0) > 0.5, a: dn(0), start: dn(9) };
          const pv = navPrev[s];
          if (cur.up && !pv.up) nav(pnum, 'up');
          if (cur.down && !pv.down) nav(pnum, 'down');
          if (cur.left && !pv.left) nav(pnum, 'left');
          if (cur.right && !pv.right) nav(pnum, 'right');
          if (cur.a && !pv.a) nav(pnum, 'act');
          if (cur.start && !pv.start && pnum === 1) { finish(); return; }
          navPrev[s] = cur;
        }
        raf = requestAnimationFrame(poll);
      };

      render();
      raf = requestAnimationFrame(poll);
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
        st.textContent = '.oh-play-overlay .ohs-card,.oh-play-overlay .ohp-card{background:#141a26;color:#e7edf7;border:1px solid #33507e;border-radius:12px;padding:22px;width:92%;max-width:520px;box-shadow:0 12px 40px rgba(0,0,0,.5);font-family:sans-serif}.oh-play-overlay h2{font-size:20px}.oh-play-overlay .oh-sub{opacity:.72;margin:.2em 0 1em;font-size:13px}.oh-play-overlay .oh-note{opacity:.6;font-size:12px}.oh-play-overlay .oh-pchip{width:26px;height:26px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;font-weight:700;color:#111;flex:none}.oh-play-overlay .ohp-row{border-top:1px solid rgba(255,255,255,.12);padding:8px 0}.oh-play-overlay .oh-btnrow{display:flex;gap:10px;justify-content:flex-end;align-items:center;margin-top:16px;flex-wrap:wrap}.oh-play-overlay button{background:#22304a;color:#dbe4f3;border:1px solid #3c5a8c;border-radius:7px;padding:8px 14px;cursor:pointer;font-size:14px}.oh-play-overlay button.primary{background:#2f7d4f;border-color:#49b578;color:#fff}.oh-play-overlay select,.oh-play-overlay input{background:#0e1420;color:#e7edf7;border:1px solid #33507e;border-radius:5px}.oh-play-overlay .ohsetup{background:#141a26;color:#e7edf7;border:1px solid #33507e;border-radius:12px;padding:20px;width:94%;max-width:880px;box-shadow:0 12px 40px rgba(0,0,0,.5);font-family:sans-serif}.oh-play-overlay .ohpanels{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}.oh-play-overlay .ohpanel{flex:1 1 180px;max-width:205px;background:#0e1420;border:1px solid #33507e;border-radius:10px;overflow:hidden}.oh-play-overlay .ohph{font-weight:800;color:#111;text-align:center;padding:6px 0}.oh-play-overlay .ohf{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;border-top:1px solid rgba(255,255,255,.08);cursor:pointer;font-size:13px}.oh-play-overlay .ohf.hot{background:#1d2d4a;box-shadow:inset 3px 0 0 #6fb0ff}.oh-play-overlay .ohf.glob{background:rgba(80,120,200,.10)}.oh-play-overlay .ohf.act{justify-content:center;font-weight:800;color:#8fe0a8}.oh-play-overlay .ohf.act.hot{background:#2f7d4f;color:#fff}.oh-play-overlay .ohl{opacity:.8}.oh-play-overlay .ohv{font-weight:600}.oh-play-overlay .ohsw{width:28px;height:16px;border-radius:4px;border:1px solid rgba(255,255,255,.5);display:inline-block}';
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
