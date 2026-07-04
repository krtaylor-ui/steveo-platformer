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
      if (title) title.textContent = isHost ? 'Leave and End Session?' : 'Return to Main Menu?';
      if (msg)   msg.textContent   = isHost ? 'You are the host. All players will be kicked.'
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
    g._saveNormalProgress();
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

  _openWorldSettings() { const g = this._game; if (!g) return; g.state = 'playing'; g._worldSettingsOpen = true; this.close(); },
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
    } else if (!game.isArena) {
      // Normal / Platformer: 1–2 player co-op (4-player is arena-only).
      if (!game._onlineGameId) {
        rows.push(this._row('Players',
          this._select([{ v: 1, label: '1 Player' }, { v: 2, label: '2 Players' }],
            () => (aws.twoPlayerMode ? 2 : 1),
            v => { game._applyTwoPlayerMode(parseInt(v, 10) === 2); this._buildSettings(game); })));
      }
    }
    wrap.appendChild(this._section('', rows));
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
    if (game.isArena) btns.push({ label: '🏆  View Leaderboard', cls: 'btn-secondary', act: () => this._viewLeaderboard() });
    btns.push({ label: '⏻  Main Menu', cls: 'btn-danger', act: () => this._mainMenu() });

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
    if (ctrlRows.length) body.appendChild(this._section('Controls', ctrlRows));

    // Speed Run: live-tunable deceleration (× the accelerate rate). Temporary
    // knob for dialing in the coast feel.
    if (game.gameMode === 'speedrunner') {
      body.appendChild(this._section('Speed Run', [
        this._row('Acceleration',
          this._cycle([0.2, 0.35, 0.5, 0.7, 1.0, 1.5], () => aws.srAccel ?? 0.5, v => { game._worldAdvSettings.srAccel = v; }, v => v.toFixed(2) + '/f'),
          'how quickly you build up to max speed'),
        this._row('Deceleration',
          this._cycle([1, 1.5, 2, 3, 4, 5], () => aws.srDecel ?? 2, v => { game._worldAdvSettings.srDecel = v; }, v => v + '× accel'),
          'how fast you slow when not accelerating'),
      ]));
    }

    // Physics / World & Physics (normal, platformer, sandbox). Greyed if locked.
    if (game.gameMode === 'normal' || game.gameMode === 'platformer' || game.gameMode === 'sandbox') {
      const locked = !!aws.physicsLocked;
      const rows = [
        this._row('Gravity', this._cycle(this.OPT.gravity, () => aws.physicsGravity ?? 0.66, v => { game._worldAdvSettings.physicsGravity = v; }, v => v.toFixed(2), locked)),
        this._row('Jump Height', this._cycle(this.OPT.jumpH, () => aws.jumpHeightBlocks ?? null, v => { game._worldAdvSettings.jumpHeightBlocks = v; }, v => v == null ? 'Default' : v + ' bl', locked)),
        this._row('Air Jump', this._toggle(() => aws.airJumpEnabled, v => { game._worldAdvSettings.airJumpEnabled = v; }, locked)),
        this._row('Sprint', this._toggle(() => aws.sprintEnabled !== false, v => { game._worldAdvSettings.sprintEnabled = v; }, locked)),
        this._row('Auto-Climb', this._toggle(() => !!aws.autoStepUp, v => { game._worldAdvSettings.autoStepUp = v; }, locked)),
      ];
      if (game.gameMode === 'sandbox') {
        rows.push(this._row('Disable XP Speed Boost', this._toggle(() => aws.disableXpSpeedBoost, v => { game._worldAdvSettings.disableXpSpeedBoost = v; }, locked)));
        rows.push(this._row('Jump Pad Force', this._cycle(this.OPT.jumpPad, () => aws.jumpPadVForce ?? -18, v => { game._worldAdvSettings.jumpPadVForce = v; }, v => String(v), locked)));
        rows.push(this._row('Default Zoom', this._cycle(this.OPT.zoom, () => aws.worldZoom ?? 1.0, v => { game._worldAdvSettings.worldZoom = v; }, v => v.toFixed(2) + 'x', locked)));
        rows.push(this._row('Redstone Speed', this._cycle([0.5, 1, 2, 3, 4, 6, 8], () => aws.redstoneSpeed ?? 1.0, v => { game._worldAdvSettings.redstoneSpeed = v; }, v => v + 'x', locked), 'higher = faster pistons/traps'));
      }
      const sec = this._section(game.gameMode === 'sandbox' ? 'World & Physics' : 'Physics', rows);
      if (locked) { const note = document.createElement('div'); note.className = 'pause-lock-note'; note.textContent = '🔒 Locked in World Settings'; sec.insertBefore(note, sec.children[1]); }
      body.appendChild(sec);
    }

    // Display (normal / platformer)
    if (game.gameMode === 'normal' || game.gameMode === 'platformer') {
      body.appendChild(this._section('Display', [
        this._row('Compact Hotbar', this._toggle(() => aws.compactHotbar, v => { game._worldAdvSettings.compactHotbar = v; })),
        this._row('Show Player Health Bars', this._toggle(() => aws.showOnlineHealthBars !== false, v => { game._worldAdvSettings.showOnlineHealthBars = v; })),
      ]));
    }

    // Online (only in an online game). Boss scaling greyed if locked.
    if (game._onlineGameId) {
      const bl = !!aws.bossScalingLocked;
      const rows = [ this._row('Disable Chat', this._toggle(() => aws.chatDisabled, v => { game._worldAdvSettings.chatDisabled = v; })) ];
      rows.push(this._row('Boss Health', this._cycle(this.OPT.boss, () => aws.bossHealthMultiplier ?? 1.0, v => { game._worldAdvSettings.bossHealthMultiplier = v; }, v => v.toFixed(1) + 'x', bl)));
      rows.push(this._row('Boss Damage', this._cycle(this.OPT.boss, () => aws.bossDamageMultiplier ?? 1.0, v => { game._worldAdvSettings.bossDamageMultiplier = v; }, v => v.toFixed(1) + 'x', bl)));
      rows.push(this._row('Boss Attack Rate', this._cycle(this.OPT.boss, () => aws.bossAttackRateMultiplier ?? 1.0, v => { game._worldAdvSettings.bossAttackRateMultiplier = v; }, v => v.toFixed(1) + 'x', bl)));
      const sec = this._section('Online', rows);
      if (bl) { const note = document.createElement('div'); note.className = 'pause-lock-note'; note.textContent = '🔒 Boss scaling locked in World Settings'; sec.appendChild(note); }
      body.appendChild(sec);
    }

    // Sandbox: the deep world-creation settings live in the existing 9-tab panel.
    if (game.gameMode === 'sandbox') {
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary pause-btn';
      btn.textContent = '⚙  Advanced World Settings';
      btn.style.marginTop = '10px';
      btn.addEventListener('click', () => this._openWorldSettings());
      const sec = this._section('World Creation', []);
      const hint = document.createElement('div'); hint.className = 'pause-row-sub'; hint.style.marginBottom = '6px';
      hint.textContent = 'Mob drops · Day/Night · Boss scaling · Arena · Import/Export';
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
