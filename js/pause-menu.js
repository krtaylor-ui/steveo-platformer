// ============================================================
// pause-menu.js — HTML pause overlay (replaces the canvas pause menu)
//
// Owns #pause-overlay and reconciles it against Game.state each frame via
// PAUSE_MENU.sync(game, wantOpen). Shown while game.state === 'paused' (or
// 'confirmExit', which surfaces the inner confirm panel). All button actions
// call the same Game methods the old canvas menu did — the state machine,
// arena-timer freeze, save dialog and F quick-save are unchanged in game.js.
//
// Tabs: Pause / Settings / Help. Buttons: Resume, [Level Select],
// [View Leaderboard] (arena), Main Menu. Settings: volume sliders (live) +
// up-to-4 controller-assignment <select>s (Normal/Platformer/Arena) or the
// World Settings shortcut (Sandbox). Inherits theme tokens + the retro skin
// via the shared .modal-content / .btn classes, so it looks right in clean
// AND retro. Gamepad navigation is provided by js/gamepad-nav.js, which treats
// this overlay as its active surface even though the match is in-game.
// ============================================================

const PAUSE_MENU = {
  _open: false,
  _game: null,
  _tab: 'pause',

  el(id) { return document.getElementById(id); },

  isOpen() { return this._open; },

  // Called every frame from Game.update(). Opens/closes the overlay to match
  // the game state and keeps the confirm sub-panel in sync with 'confirmExit'.
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
    this._bindStatic();
    this._populate(game);
    this._selectTab('pause');
    this._reflectConfirm(game);
    overlay.style.display = 'flex';
  },

  close() {
    const overlay = this.el('pause-overlay');
    if (overlay) overlay.style.display = 'none';
    this._open = false;
    this._game = null;
  },

  // Show the confirm-exit sub-panel iff the game is in that state.
  _reflectConfirm(game) {
    const confirm = this.el('pause-confirm');
    const main    = this.el('pause-main');
    if (!confirm || !main) return;
    const isConfirm = game.state === 'confirmExit';
    confirm.style.display = isConfirm ? 'flex' : 'none';
    main.style.display    = isConfirm ? 'none' : 'flex';
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

    // Tab headers
    this.el('pause-overlay')?.querySelectorAll('.pause-tab').forEach(b =>
      b.addEventListener('click', () => this._selectTab(b.dataset.tab)));

    // Close X + confirm buttons
    this.el('pause-close-btn')?.addEventListener('click', () => this._resume());
    this.el('pause-confirm-yes')?.addEventListener('click', () => this._confirmExit());
    this.el('pause-confirm-no')?.addEventListener('click', () => { if (this._game) this._game.state = 'paused'; });
  },

  _selectTab(tab) {
    this._tab = tab;
    const overlay = this.el('pause-overlay');
    if (!overlay) return;
    overlay.querySelectorAll('.pause-tab').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === tab));
    ['pause', 'settings', 'help'].forEach(t => {
      const panel = this.el(`pause-tab-${t}`);
      if (panel) panel.style.display = (t === tab) ? 'block' : 'none';
    });
  },

  // ── Actions (mirror the old canvas button callbacks) ──────────
  _resume() {
    if (this._game) { this._game.state = 'playing'; }
    this.close();
  },

  _mainMenu() { if (this._game) this._game.state = 'confirmExit'; this._reflectConfirm(this._game); },

  _levelSelect() {
    const g = this._game; if (!g) return;
    if (g.gameMode === 'normal') g._saveNormalProgress();
    this.close();
    g.destroy();
    const rs = g.gameMode === 'platformer' ? 'platformerSelect' : 'normalSelect';
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

  _openWorldSettings() {
    const g = this._game; if (!g) return;
    g.state = 'playing'; g._worldSettingsOpen = true;
    this.close();
  },

  _openFullTutorial() {
    const g = this._game; if (!g) return;
    g.state = 'playing'; g._tutorialOpen = true; g._tutorialScrollY = 0;
    this.close();
  },

  // ── Content population ────────────────────────────────────────
  _populate(game) {
    this._buildButtons(game);
    this._buildSettings(game);
    this._buildHelp(game);
    const ver = this.el('pause-version');
    if (ver) ver.textContent = (typeof GAME_VERSION !== 'undefined') ? GAME_VERSION : '';
  },

  _buildButtons(game) {
    const wrap = this.el('pause-buttons');
    if (!wrap) return;
    const MODE_NAMES = { normal: 'Normal Mode', sandbox: 'Sandbox Mode', platformer: 'Platformer Mode', arena: 'Arena Mode' };
    const badge = this.el('pause-mode-badge');
    if (badge) badge.textContent = MODE_NAMES[game.gameMode] || game.gameMode;

    // Platformer level attribution line
    const sub = this.el('pause-mode-sub');
    if (sub) {
      if (game.gameMode === 'platformer' && game._platformerLevelName) {
        sub.textContent = `${game._platformerLevelName}  ·  by ${game._platformerCreator || 'unknown'}`;
        sub.style.display = 'block';
      } else { sub.style.display = 'none'; }
    }

    const btns = [];
    btns.push({ label: '▶  Resume', cls: 'btn-primary', act: () => this._resume() });
    if (game.gameMode === 'platformer' && game._platformerLoadKey) {
      btns.push({ label: '≡  Level Select', cls: 'btn-secondary', act: () => this._levelSelect() });
    } else if (game.gameMode === 'normal') {
      btns.push({ label: '≡  Level Select', cls: 'btn-secondary', act: () => this._levelSelect() });
    }
    if (game.isArena) {
      btns.push({ label: '🏆  View Leaderboard', cls: 'btn-secondary', act: () => this._viewLeaderboard() });
    }
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

  // How many controller-assignment rows to show, by mode.
  _playerCount(game) {
    if (game.gameMode === 'sandbox' || game._onlineGameId) return 0;
    if (game.isArena) {
      const n = game.activePlayers ? game.activePlayers().length : 1;
      return Math.max(1, Math.min(4, n));
    }
    return game._worldAdvSettings?.twoPlayerMode ? 2 : 1;
  },

  _buildSettings(game) {
    // Sandbox → World Settings shortcut; others → co-op + controller rows.
    const sandboxBox = this.el('pause-sandbox-settings');
    const coopBox    = this.el('pause-coop-settings');
    const isSandbox  = game.gameMode === 'sandbox';
    if (sandboxBox) sandboxBox.style.display = isSandbox ? 'block' : 'none';
    if (coopBox)    coopBox.style.display    = isSandbox ? 'none' : 'block';

    // Volume sliders (shared) — reflect live values, drive live audio.
    const aws = game._worldAdvSettings || {};
    const music = this.el('pause-music-vol');
    const sfx   = this.el('pause-sfx-vol');
    if (music) {
      music.value = Math.round((aws.musicVolume ?? 0.5) * 100);
      this._updateVolLabel('music', music.value);
      music.oninput = () => {
        game._worldAdvSettings.musicVolume = Math.round(music.value / 5) * 5 / 100;
        game._applyMusicVolume && game._applyMusicVolume();
        this._updateVolLabel('music', music.value);
      };
    }
    if (sfx) {
      sfx.value = Math.round((aws.sfxVolume ?? 0.5) * 100);
      this._updateVolLabel('sfx', sfx.value);
      sfx.oninput = () => {
        game._worldAdvSettings.sfxVolume = Math.round(sfx.value / 5) * 5 / 100;
        this._updateVolLabel('sfx', sfx.value);
      };
    }

    if (isSandbox) {
      const btn = this.el('pause-worldsettings-btn');
      if (btn) btn.onclick = () => this._openWorldSettings();
      return;
    }

    // 2-Player toggle (Normal/Platformer only; arena's player count is fixed).
    const toggleRow = this.el('pause-2p-row');
    if (toggleRow) {
      const showToggle = !game.isArena && !game._onlineGameId;
      toggleRow.style.display = showToggle ? 'flex' : 'none';
      if (showToggle) {
        const cb = this.el('pause-2p-toggle');
        if (cb) {
          cb.checked = !!game._worldAdvSettings.twoPlayerMode;
          cb.onchange = () => {
            game._applyTwoPlayerMode(cb.checked);
            this._buildAssignRows(game); // player count changed
          };
        }
      }
    }

    this._buildAssignRows(game);
  },

  _updateVolLabel(kind, pct) {
    const lbl = this.el(`pause-${kind}-vol-label`);
    if (lbl) lbl.textContent = `${pct}%`;
  },

  // Controller assignment <select> per player (ported from _drawCtrlAssignRows).
  _buildAssignRows(game) {
    const wrap = this.el('pause-assign-rows');
    if (!wrap) return;
    const n = this._playerCount(game);
    if (n <= 0 || typeof ControllerConfig === 'undefined') { wrap.innerHTML = ''; return; }

    const OPTS = [
      { v: -1, label: 'KB1 (WASD)' },
      { v: -2, label: 'KB2 (Arrows)' },
      { v: 0,  label: 'Gamepad 1' },
      { v: 1,  label: 'Gamepad 2' },
      { v: 2,  label: 'Gamepad 3' },
      { v: 3,  label: 'Gamepad 4' },
    ];
    const P_COLORS = ['#4FC3F7', '#FF8A65', '#81C784', '#FFD54F'];

    wrap.innerHTML = '<div class="pause-assign-head">INPUT ASSIGNMENT</div>';
    for (let p = 1; p <= n; p++) {
      const cur = ControllerConfig.getAssignment(p);
      const connected = (cur >= 0) && game.input?.gamepads?.[cur]?.connected;
      const row = document.createElement('div');
      row.className = 'pause-assign-row';
      const badge = `<span class="pause-pbadge" style="background:${P_COLORS[p - 1]}">P${p}</span>`;
      const dot   = `<span class="pause-conn-dot" style="background:${connected ? '#66CC44' : '#444'}"></span>`;
      const opts  = OPTS.map(o => `<option value="${o.v}" ${o.v === cur ? 'selected' : ''}>${o.label}</option>`).join('');
      row.innerHTML = `${badge}${dot}<select class="pause-assign-select" data-player="${p}">${opts}</select>`;
      const sel = row.querySelector('select');
      sel.addEventListener('change', () => {
        ControllerConfig.setAssignment(p, parseInt(sel.value, 10));
        this._buildAssignRows(game); // refresh connection dots
      });
      wrap.appendChild(row);
    }
  },

  _buildHelp(game) {
    const wrap = this.el('pause-help-rows');
    if (!wrap) return;
    const is2P = !!game.player2;
    const inp = game.input || {};
    const rows = [
      ['Movement',    'WASD / Arrows / L-Stick'],
      ['Jump',        'W / Up / [A button]'],
      ['Sprint',      'Shift (full stick auto)'],
      ['Crouch',      'S / Down / [B button]'],
      ['Attack/Mine', 'Space / L-Click / [X]'],
      ['Bow (aim)',   is2P ? 'Hold Space → aim W/S → release' : 'Hold Space or L-Click → release'],
      ['Use/Place',   'Right-click'],
      ['Hotbar',      '1-9 / Scroll / D-Pad'],
      ['Inventory',   'I (Normal mode)'],
      ['Palette',     'I / [Y] (Sandbox)'],
      ['Undo/Redo',   'Ctrl+Z/Y / LT/RT (Sandbox)'],
      ['Crafting',    'C key'],
      ['Checkpoint',  'F key (at bed)'],
      ['Settings',    'P key / SETTINGS tab'],
      ['Pause',       'Esc / Start button'],
    ];
    if (is2P) {
      rows.push(['─── P2 ───', '──────────────']);
      rows.push(['P2 Move',   inp.p2GpSlot >= 0 ? 'L-Stick' : (inp.p2GpSlot === -2 ? 'Arrows' : 'WASD')]);
      rows.push(['P2 Jump',   inp.p2GpSlot >= 0 ? '[A]'     : (inp.p2GpSlot === -2 ? 'Up' : 'W')]);
      rows.push(['P2 Attack', inp.p2GpSlot >= 0 ? '[X]'     : (inp.p2GpSlot === -2 ? 'Insert' : 'Space')]);
    }
    wrap.innerHTML = rows.map(r =>
      `<div class="pause-help-row"><span class="pause-help-k">${r[0]}</span><span class="pause-help-v">${r[1]}</span></div>`
    ).join('');

    const tut = this.el('pause-tutorial-btn');
    if (tut) tut.onclick = () => this._openFullTutorial();
  },
};

// Guarded access to game.js's module-scope _localMenuState (not on window).
function _localMenuStateSafe(game) {
  try { return (typeof _localMenuState === 'function') ? _localMenuState(game) : undefined; }
  catch { return undefined; }
}

if (typeof window !== 'undefined') window.PAUSE_MENU = PAUSE_MENU;
