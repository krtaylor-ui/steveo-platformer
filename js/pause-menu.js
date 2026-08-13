// ============================================================
// pause-menu.js — HTML pause overlay (tabbed, mode-aware).
//
// Owns #pause-overlay and reconciles it against Game.state each frame via
// PAUSE_MENU.sync(game, wantOpen). Tabs: Pause / Settings / Help, with content
// tailored per mode (normal, platformer, speedrunner, arena, sandbox).
//   • Pause tab  — a few quick controls + Resume / Level Select / View
//     Leaderboard / Main Menu, plus the now-playing track and build version.
//   • Settings   — full per-mode settings (Audio, Controls, Physics, Display,
//     Online); Sandbox regroups these + an "Advanced World Settings" button
//     into the existing 9-tab canvas panel for the deep world-creation options.
//   • Help       — the mode's controls, + "Open Full Tutorial".
// Adds body.pause-open so the retro FX apply while it's open (see style.css).
// Gamepad navigation is provided by js/gamepad-nav.js.
// ============================================================

const PAUSE_MENU = {
  _open: false,
  _game: null,
  _tab: 'pause',

  // Cycle option tables (mirror the canvas World Settings panel).
  OPT: {
    gravity:   [0.10, 0.20, 0.33, 0.50, 0.66, 0.80, 1.00, 1.20, 1.50],
    jumpH:     [null, 2, 2.5, 3, 3.5, 4, 4.5, 5],
    jumpPad:   [-6, -9, -12, -15, -18, -21, -24],
    zoom:      [0.5, 0.75, 1.0, 1.25, 1.5, 2.0],
    sens:      [0.5, 0.75, 1.0, 1.25, 1.5, 2.0],
    deadzone:  [0.10, 0.15, 0.20, 0.25, 0.30],
    boss:      [0.5, 1.0, 1.5, 2.0, 3.0],
    slideDur:  [15, 20, 30, 45, 60, 90],
    slideMult: [1.2, 1.4, 1.6, 2.0, 2.5],
  },

  el(id) { return document.getElementById(id); },
  isOpen() { return this._open; },

  sync(game, wantOpen) {
    if (wantOpen && !this._open) { this.open(game); return; }
    if (!wantOpen && this._open) { this.close(); return; }
    if (this._open) this._reflectConfirm(game);
  },

  open(game) {
    const overlay = this.el('pause-overlay');
    if (!overlay) return;
    this._game = game;
    this._open = true;
    this._tab = 'pause';
    document.body.classList.add('pause-open'); // enable retro FX over the menu
    this._bindStatic();
    this._populate(game);
    this._selectTab('pause');
    this._reflectConfirm(game);
    overlay.style.display = 'flex';
  },

  close() {
    const overlay = this.el('pause-overlay');
    if (overlay) overlay.style.display = 'none';
    document.body.classList.remove('pause-open');
    this._open = false;
    this._game = null;
  },

  _reflectConfirm(game) {
    const confirm = this.el('pause-confirm');
    const main    = this.el('pause-main');
    if (!confirm || !main) return;
    const isConfirm = game.state === 'confirmExit';
    confirm.style.display = isConfirm ? 'flex' : 'none';
    // block, NOT flex — flex would lay the tab bar and active panel out in a row
    // (narrow tabs on the left, squished content on the right).
    main.style.display    = isConfirm ? 'none' : 'block';
    if (isConfirm) {
      const isHost = !!(game._onlineGameId && window.multiplayerManager?.isCreator);
      const title = this.el('pause-confirm-title');
      const msg   = this.el('pause-confirm-msg');
      const isCampaign = !!game._campaign;
      if (title) title.textContent = game._testMode ? 'Exit test — back to Sandbox?'
                                   : isCampaign ? 'Leave Campaign?'
                                   : isHost ? 'Leave and End Session?' : 'Return to Main Menu?';
      if (msg)   msg.textContent   = game._testMode ? 'This was a playtest — nothing is saved or scored.'
                                   : isCampaign ? 'Your progress is saved — you can resume from this spot.'
                                   : isHost ? 'You are the host. All players will be kicked.'
                                            : 'Any unsaved progress will be lost.';
    }
  },

  _bindStatic() {
    if (this._bound) return;
    this._bound = true;
    this.el('pause-overlay')?.querySelectorAll('.pause-tab').forEach(b =>
      b.addEventListener('click', () => this._selectTab(b.dataset.tab)));
    this.el('pause-close-btn')?.addEventListener('click', () => this._resume());
    this.el('pause-confirm-yes')?.addEventListener('click', () => this._confirmExit());
    this.el('pause-confirm-no')?.addEventListener('click', () => { if (this._game) this._game.state = 'paused'; });
  },

  _selectTab(tab) {
    this._tab = tab;
    const overlay = this.el('pause-overlay');
    if (!overlay) return;
    overlay.querySelectorAll('.pause-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    ['pause', 'settings', 'help'].forEach(t => {
      const panel = this.el(`pause-tab-${t}`);
      if (panel) panel.style.display = (t === tab) ? 'block' : 'none';
    });
  },

  // ── Actions ────────────────────────────────────────────────────
  _resume() { if (this._game) this._game.state = 'playing'; this.close(); },
  _mainMenu() { if (this._game) { this._game.state = 'confirmExit'; this._reflectConfirm(this._game); } },

  _levelSelect() {
    const g = this._game; if (!g) return;
    if (g.gameMode === 'normal') g._saveNormalProgress();
    this.close();
    g.destroy();
    const rs = g.gameMode === 'platformer' ? 'platformerSelect'
             : g.gameMode === 'speedrunner' ? 'speedrunnerSelect' : 'normalSelect';
    if (g._onReturnToMenu) g._onReturnToMenu(rs); else location.reload();
  },

  _confirmExit() {
    const g = this._game; if (!g) return;
    if (!g._testMode) g._saveNormalProgress();   // playtests never persist
    if (g._onlineGameId) window.multiplayerManager?.disconnect();
    this.close();
    g.destroy();
    if (g._onReturnToMenu) g._onReturnToMenu(_localMenuStateSafe(g)); else location.reload();
  },

  _viewLeaderboard() {
    const g = this._game; if (!g || typeof LEADERBOARD_SYSTEM === 'undefined') return;
    if (g._arenaWorldId) LEADERBOARD_SYSTEM.showWorldModal(g._arenaWorldId, g._arenaWorldName || 'World');
    else LEADERBOARD_SYSTEM.showModal();
  },

  _openCampaignProgress() {
    const g = this._game; if (!g || !g._campaign) return;
    if (typeof CAMPAIGN_PLAY !== 'undefined' && CAMPAIGN_PLAY.showProgress) CAMPAIGN_PLAY.showProgress();
  },

  _openWorldSettings() {
    const g = this._game; if (!g) return;
    g.state = 'playing'; this.close();
    // Unified HTML panel by default; the classic canvas panel stays for Konami mode.
    if (typeof WORLD_SETTINGS !== 'undefined' && !g._useClassicPause) WORLD_SETTINGS.open(g);
    else g._worldSettingsOpen = true;
  },
  _openFullTutorial() { const g = this._game; if (!g) return; g.state = 'playing'; g._tutorialOpen = true; g._tutorialScrollY = 0; this.close(); },

  // ── DOM builders ────────────────────────────────────────────────
  _row(label, controlEl, sub) {
    const row = document.createElement('div');
    row.className = 'pause-row';
    const l = document.createElement('div');
    l.className = 'pause-row-label';
    l.innerHTML = `<span>${label}</span>` + (sub ? `<span class="pause-row-sub">${sub}</span>` : '');
    row.appendChild(l);
    if (controlEl) row.appendChild(controlEl);
    return row;
  },

  _section(title, rows) {
    const sec = document.createElement('div');
    sec.className = 'pause-section';
    if (title) { const h = document.createElement('div'); h.className = 'pause-section-title'; h.textContent = title; sec.appendChild(h); }
    rows.filter(Boolean).forEach(r => sec.appendChild(r));
    return sec;
  },

  _toggle(get, set, locked) {
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.className = 'ts-toggle'; cb.checked = !!get();
    if (locked) { cb.disabled = true; cb.title = 'Locked in World Settings'; }
    else cb.addEventListener('change', () => set(cb.checked));
    return cb;
  },

  _cycle(opts, get, set, fmt, locked) {
    const btn = document.createElement('button');
    btn.className = 'pause-cycle';
    const idxOf = (v) => opts.findIndex(o =>
      (o === null && v == null) || (typeof o === 'number' && typeof v === 'number' ? Math.abs(o - v) < 1e-9 : o === v));
    const render = () => { btn.textContent = fmt(get()); };
    render();
    if (locked) { btn.disabled = true; btn.title = 'Locked in World Settings'; btn.classList.add('pause-locked'); }
    else btn.addEventListener('click', () => { const i = (idxOf(get()) + 1) % opts.length; set(opts[i]); render(); });
    return btn;
  },

  _select(options, get, set) {
    const sel = document.createElement('select');
    sel.className = 'pause-assign-select';
    sel.innerHTML = options.map(o => `<option value="${o.v}" ${String(o.v) === String(get()) ? 'selected' : ''}>${o.label}</option>`).join('');
    sel.addEventListener('change', () => set(sel.value));
    return sel;
  },

  _slider(getPct, set) {
    const wrap = document.createElement('div');
    wrap.className = 'pause-slider';
    const range = document.createElement('input');
    range.type = 'range'; range.min = 0; range.max = 100; range.step = 5; range.value = getPct();
    const lbl = document.createElement('span'); lbl.className = 'pause-vol-label'; lbl.textContent = `${getPct()}%`;
    range.addEventListener('input', () => { set(parseInt(range.value, 10)); lbl.textContent = `${range.value}%`; });
    wrap.appendChild(range); wrap.appendChild(lbl);
    return wrap;
  },

  // ── Content population ──────────────────────────────────────────
  _populate(game) {
    const MODE_NAMES = { normal: 'Normal Mode', sandbox: 'Sandbox Mode', platformer: 'Platformer Mode', arena: 'Arena Mode', speedrunner: 'Speed Runner' };
    const badge = this.el('pause-mode-badge');
    if (badge) badge.textContent = game.isArena ? 'Arena Mode' : (MODE_NAMES[game.gameMode] || game.gameMode);

    const sub = this.el('pause-mode-sub');
    if (sub) {
      if (game.gameMode === 'platformer' && game._platformerLevelName) {
        sub.textContent = `${game._platformerLevelName}  ·  by ${game._platformerCreator || 'unknown'}`;
        sub.style.display = 'block';
      } else sub.style.display = 'none';
    }

    this._buildQuick(game);
    this._buildButtons(game);
    this._buildFooter(game);
    this._buildSettings(game);
    this._buildHelp(game);
  },

  _buildFooter(game) {
    const foot = this.el('pause-footer');
    if (!foot) return;
    const track = game._musicSystem && (game._musicSystem.currentTrack || game._musicSystem.trackName);
    const ver = (typeof GAME_VERSION !== 'undefined') ? GAME_VERSION : '';
    foot.innerHTML = `<span class="pause-track">${track ? '♪ ' + this._esc(track) : ''}</span>` +
                     `<span class="pause-version">${this._esc(ver)}</span>`;
  },

  // Pause-tab quick controls.
  _buildQuick(game) {
    const wrap = this.el('pause-quick');
    if (!wrap) return;
    wrap.innerHTML = '';
    const aws = game._worldAdvSettings || {};

    if (game.gameMode === 'sandbox') {
      // God-mode ability toggles (so a player who forgot the keys can flip them).
      const p = game.player;
      if (p) {
        wrap.appendChild(this._section('God Abilities', [
          this._row('✈ Flight <span class="pause-key">W×2</span>', this._toggle(() => p.flying, v => { p.flying = v; })),
          this._row('👻 Phase-Through <span class="pause-key">X</span>', this._toggle(() => p.canPhaseThrough, v => { p.canPhaseThrough = v; })),
          this._row('⚡ Hyper Speed <span class="pause-key">H</span>',
            this._cycle([0, 1, 2], () => p.hyperLevel || 0, lvl => {
              p.hyperLevel = lvl; p.hyperSpeed = lvl > 0; p.speedMultiplier = lvl === 2 ? 2 : 1;
            }, lvl => ['Off', '3×', '6×'][lvl] || 'Off')),
        ]));
      }
      wrap.appendChild(this._debugSection(game));   // debug overlays available in Sandbox too
      return; // no duplicate audio on the sandbox pause tab
    }

    const rows = [
      this._row('♪ Music', this._slider(() => Math.round((aws.musicVolume ?? 0.5) * 100),
        v => { game._worldAdvSettings.musicVolume = v / 100; game._applyMusicVolume && game._applyMusicVolume(); })),
      this._row('🔊 SFX', this._slider(() => Math.round((aws.sfxVolume ?? 0.5) * 100),
        v => { game._worldAdvSettings.sfxVolume = v / 100; })),
    ];

    if (game.gameMode === 'speedrunner' && game._sr) {
      rows.push(this._row('👻 Ghost <span class="pause-key">K</span>',
        this._toggle(() => game._sr.ghostVisible, v => { game._sr.ghostVisible = v; })));
    } else if (game.isArena) {
      const obj = document.createElement('div');
      obj.className = 'pause-objectives';
      obj.innerHTML = this._arenaObjectiveText(game);
      rows.push(this._row('🎯 Objectives', null));
      const r = document.createElement('div'); r.className = 'pause-row pause-obj-row'; r.appendChild(obj);
      rows.push(r);
    } else if (!game.isArena && game.gameMode !== 'sandbox') {
      // §Phase D — Normal / Platformer: 1 Player / 2 Player (Human) / 2 Player (Bot). The
      // Bot case reuses the companion-bot infrastructure. Disabled in Sandbox for now
      // (2-player editing isn't supported) + online (server owns the roster).
      if (!game._onlineGameId) {
        rows.push(this._row('Players',
          this._select([
            { v: 'off',   label: '1 Player' },
            { v: 'human', label: '2 Player (Human)' },
            { v: 'bot',   label: '2 Player (Bot)' },
          ], () => game._coopMode(),
            v => { game._setCoopMode(v); this._buildSettings(game); })));
      }
    }
    wrap.appendChild(this._section('', rows));
    wrap.appendChild(this._debugSection(game));
  },

  // Debug overlays — mirrors the World Settings "Debug" tab, but available IN-GAME from the
  // pause menu for EVERY mode, so the perf HUD / nav overlays can be flipped on to diagnose
  // a slowdown without leaving the game (Kevin). Writes the same _worldAdvSettings keys the
  // renderer reads (perfHud / showBotPaths / showNavGrid).
  _debugSection(game) {
    const aws = game._worldAdvSettings || (game._worldAdvSettings = {});
    return this._section('Debug', [
      this._row('📊 Performance HUD', this._toggle(() => !!aws.perfHud,      v => { aws.perfHud = v; })),
      this._row('🧭 Bot / Mob Paths',  this._toggle(() => !!aws.showBotPaths, v => { aws.showBotPaths = v; })),
      this._row('🟧 Nav Grid (solid)', this._toggle(() => !!aws.showNavGrid,  v => { aws.showNavGrid = v; })),
    ]);
  },

  _arenaObjectiveText(game) {
    try {
      if (typeof ARENA_RULES !== 'undefined' && typeof ARENA_MODES !== 'undefined' && ARENA_MODES._rulesetFor) {
        const rs = ARENA_MODES._rulesetFor(game);
        const os = rs && ARENA_RULES.objectiveStatus(rs, game, 'p1');
        if (os && os.mode === 'flat' && os.conditions) {
          return os.conditions.map(c => `${c.met ? '✓' : '○'} ${this._esc(c.label || '')}`).join('<br>') || 'Survive & score.';
        }
      }
    } catch (e) {}
    return (typeof ARENA_MODES !== 'undefined') ? this._esc(ARENA_MODES.label(game.arenaConfig?.arenaGameMode) || 'Battle') : 'Battle';
  },

  _buildButtons(game) {
    const wrap = this.el('pause-buttons');
    if (!wrap) return;
    // Level Select removed from every mode — it just returned to the mode's
    // picker, which Main Menu already does (redundant).
    const btns = [{ label: '▶  Resume', cls: 'btn-primary', act: () => this._resume() }];
    if (game.isArena && !game._testMode) btns.push({ label: '🏆  View Leaderboard', cls: 'btn-secondary', act: () => this._viewLeaderboard() });
    // §Campaign — a run inside a campaign can view its progression tracker.
    if (game._campaign) btns.push({ label: '🗺  Campaign Progress', cls: 'btn-secondary', act: () => this._openCampaignProgress() });
    // In a Sandbox playtest, "exit" returns to the editor (not the main menu).
    btns.push({ label: game._testMode ? '⏻  Exit to Sandbox' : '⏻  Main Menu', cls: 'btn-danger', act: () => this._mainMenu() });

    wrap.innerHTML = '';
    for (const b of btns) {
      const el = document.createElement('button');
      el.className = `btn ${b.cls} pause-btn`;
      el.textContent = b.label;
      el.addEventListener('click', b.act);
      wrap.appendChild(el);
    }
  },

  _playerCount(game) {
    if (game._onlineGameId) return 1; // still let the local player pick/tune their controller
    if (game.isArena) return Math.max(1, Math.min(4, game.activePlayers ? game.activePlayers().length : 1));
    if (game.gameMode === 'sandbox') return 1; // single player, but may use a controller
    return game._worldAdvSettings?.twoPlayerMode ? 2 : 1;
  },

  _assignRows(game) {
    const n = this._playerCount(game);
    if (n <= 0 || typeof ControllerConfig === 'undefined') return [];
    const OPTS = [
      { v: -1, label: 'KB1 (WASD)' }, { v: -2, label: 'KB2 (Arrows)' },
      { v: 0, label: 'Gamepad 1' }, { v: 1, label: 'Gamepad 2' }, { v: 2, label: 'Gamepad 3' }, { v: 3, label: 'Gamepad 4' },
    ];
    const P = ['#4FC3F7', '#FF8A65', '#81C784', '#FFD54F'];
    const rows = [];
    // Controller layout preset (Smart Mobs §2) — Switch swaps the mirrored face
    // buttons; Default/Xbox is identity. Applies to all pads.
    if (game.input && game.input.setControllerPreset) {
      rows.push(this._row('Controller Layout', this._select(
        [{ v: 'default', label: 'Xbox / Default' }, { v: 'switch', label: 'Nintendo Switch' }],
        () => game.input.controllerPreset(),
        v => { game.input.setControllerPreset(v); this._buildSettings(game); })));
    }
    for (let p = 1; p <= n; p++) {
      const sel = this._select(OPTS, () => ControllerConfig.getAssignment(p),
        v => { ControllerConfig.setAssignment(p, parseInt(v, 10)); this._buildSettings(game); });
      rows.push(this._row(`<span class="pause-pbadge" style="background:${P[p - 1]}">P${p}</span> Input`, sel));
      // Controller-only tuning appears UNDER a player once they're on a gamepad,
      // so each player sets their own move/aim sensitivity + deadzone.
      if (ControllerConfig.getAssignment(p) >= 0) {
        rows.push(this._subrow('Move Sensitivity', this._cycle(this.OPT.sens, () => ControllerConfig.getSensitivity(p), v => ControllerConfig.setSensitivity(p, v), v => v.toFixed(2) + 'x')));
        if (game.gameMode !== 'speedrunner')
          rows.push(this._subrow('Aim Sensitivity', this._cycle(this.OPT.sens, () => ControllerConfig.getAimSensitivity(p), v => ControllerConfig.setAimSensitivity(p, v), v => v.toFixed(2) + 'x')));
        rows.push(this._subrow('Stick Deadzone', this._cycle(this.OPT.deadzone, () => ControllerConfig.getDeadzone(p), v => ControllerConfig.setDeadzone(p, v), v => Math.round(v * 100) + '%')));
      }
    }
    return rows;
  },

  // Indented sub-row (controller tuning grouped under its player).
  _subrow(label, controlEl) {
    const row = this._row(label, controlEl);
    row.classList.add('pause-subrow');
    return row;
  },

  _buildSettings(game) {
    const body = this.el('pause-settings-body');
    if (!body) return;
    body.innerHTML = '';
    const aws = game._worldAdvSettings || {};
    const pct = (k, d) => Math.round((aws[k] ?? d) * 100);

    // Audio (all modes)
    body.appendChild(this._section('Audio', [
      this._row('Music', this._slider(() => pct('musicVolume', 0.5), v => { game._worldAdvSettings.musicVolume = v / 100; game._applyMusicVolume && game._applyMusicVolume(); })),
      this._row('Sound Effects', this._slider(() => pct('sfxVolume', 0.5), v => { game._worldAdvSettings.sfxVolume = v / 100; })),
    ]));

    // Controls. Each player's assignment row is followed by their own move/aim
    // sensitivity + deadzone (controller-only — shown only when that player is
    // on a gamepad), so tuning is per-player rather than global.
    const ctrlRows = this._assignRows(game);
    // §Phase 2 — a launcher for the full rebind panel (keyboard/mouse per-player +
    // presets + conflict detection). Lives with the other control rows.
    if (typeof CONTROLS_UI !== 'undefined') {
      const rebindBtn = document.createElement('button');
      rebindBtn.className = 'btn btn-secondary pause-btn';
      rebindBtn.textContent = '⌨  Rebind Keys / Controls';
      rebindBtn.style.marginTop = '4px';
      rebindBtn.addEventListener('click', () => CONTROLS_UI.open(game));
      const wrap = document.createElement('div'); wrap.className = 'pause-row'; wrap.appendChild(rebindBtn);
      ctrlRows.push(wrap);
    }
    if (ctrlRows.length) body.appendChild(this._section('Controls', ctrlRows));

    // Player-scoped display / chat (each player's preference, not the world's).
    const prows = [
      this._row('Show Player Health Bars', this._toggle(() => aws.showOnlineHealthBars !== false, v => { game._worldAdvSettings.showOnlineHealthBars = v; })),
      // §follow-up — moved here from World Settings (a display preference, all modes).
      this._row('Compact Hotbar', this._toggle(() => !!aws.compactHotbar, v => { game._worldAdvSettings.compactHotbar = v; })),
    ];
    // §follow-up — character skins moved here from World Settings (Normal/Platformer). P1
    // always; P2 when a 2nd player / companion is present. (A future account-level skin
    // choice will supersede this — see the online-MP skin unification note.)
    if (!game.isArena && game.gameMode !== 'sandbox') {
      const CHAR = [{ v: 'male', label: 'Steve ♂' }, { v: 'female', label: 'Alex ♀' }];
      prows.push(this._row('P1 Character', this._select(CHAR, () => aws.p1Char || 'male', v => { game._worldAdvSettings.p1Char = v; if (game.player) game.player.charType = v; })));
      if (game.player2) prows.push(this._row('P2 Character', this._select(CHAR, () => aws.p2Char || 'male', v => { game._worldAdvSettings.p2Char = v; if (game.player2) game.player2.charType = v; })));
    }
    // (§1b) Touch Controls Auto / Force-On / Force-Off — a per-device preference that
    // makes the build-171 auto-detect explicit + overridable (auto-detect can misfire on
    // hybrid touch+mouse laptops). Stored in localStorage by TOUCH_CONTROLS, not the world.
    if (typeof TOUCH_CONTROLS !== 'undefined' && TOUCH_CONTROLS.getMode) {
      prows.push(this._row('Touch Controls', this._select(
        [{ v: 'auto', label: 'Auto' }, { v: 'on', label: 'Force On' }, { v: 'off', label: 'Force Off' }],
        () => TOUCH_CONTROLS.getMode(),
        v => { TOUCH_CONTROLS.setMode(v); })));
    }
    if (game._onlineGameId) prows.push(this._row('Disable Chat', this._toggle(() => aws.chatDisabled, v => { game._worldAdvSettings.chatDisabled = v; })));
    body.appendChild(this._section('Player', prows));

    // All per-world settings (movement, physics, speed run, arena, combat, day/
    // night, background, …) now live in the unified HTML World Settings panel. The
    // pause menu keeps only quick per-player / device controls (Audio, Controls,
    // Player above) plus this launcher.
    {
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary pause-btn';
      btn.textContent = '⚙  World Settings';
      btn.style.marginTop = '10px';
      btn.addEventListener('click', () => this._openWorldSettings());
      const sec = this._section('World Settings', []);
      const hint = document.createElement('div'); hint.className = 'pause-row-sub'; hint.style.marginBottom = '6px';
      hint.textContent = 'Movement · Physics · Speed Run · Arena · Combat · Day/Night';
      sec.appendChild(hint); sec.appendChild(btn);
      body.appendChild(sec);
    }
  },

  _buildHelp(game) {
    const body = this.el('pause-help-body');
    if (!body) return;
    const is2P = !!game.player2;
    const inp = game.input || {};
    let rows;
    if (game.gameMode === 'sandbox') {
      rows = [
        ['Move / Fly', 'WASD / Arrows · W×2 fly'],
        ['Place / Remove', 'LMB / RMB'],
        ['Eyedropper', 'Alt+Click'],
        ['Auto-paint', 'Shift+Drag'],
        ['Brush size', 'Shift+1 / 2 / 3'],
        ['Region select', 'Ctrl+Drag'],
        ['Copy / Paste', 'Ctrl+C / Ctrl+V'],
        ['Undo / Redo', 'Ctrl+Z / Ctrl+Y'],
        ['Palette', 'I'],
        ['Lever / Chest', 'L / E'],
        ['God: Hyper / Phase', 'H / X'],
        ['Zoom', 'Z (100–400%)'],
        ['World Settings', 'P'],
        ['Save', 'F'],
        ['Pause', 'Esc / Start'],
      ];
    } else if (game.gameMode === 'speedrunner') {
      rows = [
        ['Accelerate (hold)', 'Right / D / D-pad→ / R-stick'],
        ['Release', 'coast — slows down gradually'],
        ['Jump (hold = higher)', 'W / Up / [A]'],
        ['Ghost on/off', 'K / Select'],
        ['Restart run', 'R'],
        ['Pause', 'Esc / Start'],
      ];
    } else {
      rows = [
        ['Movement', 'WASD / Arrows / L-Stick'],
        ['Jump', 'W / Up / [A]'],
        ['Sprint', 'Shift'],
        ['Crouch', 'S / Down / [B]'],
        ['Attack / Mine', 'Space / L-Click / [X]'],
        ['Bow (aim)', 'Hold Space/L-Click → release'],
        ['Use / Place', 'Right-click'],
        ['Hotbar', '1-9 / Scroll / D-Pad'],
        ['Inventory', 'I'],
        ['Checkpoint', 'F (at bed)'],
        ['Pause', 'Esc / Start'],
      ];
      if (is2P) {
        rows.push(['─── P2 ───', '──────────────']);
        rows.push(['P2 Move', inp.p2GpSlot >= 0 ? 'L-Stick' : (inp.p2GpSlot === -2 ? 'Arrows' : 'IJKL')]);
        rows.push(['P2 Jump', inp.p2GpSlot >= 0 ? '[A]' : (inp.p2GpSlot === -2 ? 'Up' : 'I')]);
        rows.push(['P2 Attack', inp.p2GpSlot >= 0 ? '[X]' : (inp.p2GpSlot === -2 ? 'Insert' : 'U')]);
      }
    }
    body.innerHTML = `<div class="pause-help-rows">${rows.map(r =>
      `<div class="pause-help-row"><span class="pause-help-k">${this._esc(r[0])}</span><span class="pause-help-v">${this._esc(r[1])}</span></div>`).join('')}</div>`;
    const tut = document.createElement('button');
    tut.className = 'btn btn-secondary pause-btn';
    tut.style.marginTop = '10px';
    tut.textContent = 'Open Full Tutorial';
    tut.addEventListener('click', () => this._openFullTutorial());
    body.appendChild(tut);
  },

  _esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },
};

function _localMenuStateSafe(game) {
  try { return (typeof _localMenuState === 'function') ? _localMenuState(game) : undefined; } catch { return undefined; }
}

if (typeof window !== 'undefined') window.PAUSE_MENU = PAUSE_MENU;
