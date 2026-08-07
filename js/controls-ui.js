// ============================================================
// controls-ui.js — Controls-Config rebind panel (§Phase 2)
// ------------------------------------------------------------
// The browser UI over KEY_BINDINGS (keybindings.js). A tabbed overlay listing every
// rebindable action per player, with a click→press-a-key/button capture flow, a
// preset picker (Default / Minecraft / Legacy Jump + gamepad Xbox / Switch), live
// conflict warnings, and reset-to-default. Pure DOM; the binding math is all in
// KEY_BINDINGS (unit-tested headless).
//
// Opened from pause → Settings → "Controls / Rebind Keys". Overlay id
// #controls-overlay (in index.html). Reuses the .ws-* / .modal styling for the
// clean + retro themes for free.
// ============================================================

// Aim Style button labels (the 3-level kid-friendly scheme; see Game._aimStyle).
const CONTROLS_UI_AIM_LABEL = {
  dual:      'Dual Stick (Advanced)',
  single360: 'Single Stick (360°)',
  single8:   'Single Stick (8-way)',
};

const CONTROLS_UI = {
  _game: null,
  _player: 0,          // which player's bindings are shown (0-3)
  _capturing: null,    // action id currently awaiting a keypress, or null
  _keyHandler: null,
  _capHandler: null,

  isOpen() { return !!document.getElementById('controls-overlay') && document.getElementById('controls-overlay').style.display === 'flex'; },

  open(game) {
    this._game = game || window.game || null;
    this._player = 0;
    // §Controls Profiles — edit the profile for the CURRENT game mode by default; the panel
    // owns the active mode while open (game.js pauses its per-frame mode switch meanwhile).
    if (typeof CONTROL_PROFILES !== 'undefined') {
      const gm = this._game ? (this._game.isArena ? 'arena' : this._game.gameMode) : 'normal';
      this._mode = CONTROL_PROFILES.normalize(gm);
      CONTROL_PROFILES.setMode(this._mode);
    }
    const ov = document.getElementById('controls-overlay');
    if (!ov) return;
    if (this._game) this._game._htmlSettingsOpen = true;   // blocks gameplay input while open
    ov.style.display = 'flex';
    // Auto-suggest a gamepad preset the first time a pad is seen (non-destructive hint).
    this._suggestGamepad();
    if (!this._keyHandler) {
      this._keyHandler = (e) => {
        if (!this.isOpen()) return;
        if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); if (this._capturing || this._gpCapturing) this._cancelCapture(); else this.close(); }
      };
      window.addEventListener('keydown', this._keyHandler, true);
    }
    this._render();
  },

  close() {
    this._cancelCapture();
    const ov = document.getElementById('controls-overlay');
    if (ov) ov.style.display = 'none';
    if (this._game) this._game._htmlSettingsOpen = false;
    this._game = null;
  },

  _scheme() {
    // Which keyboard scheme this player uses (so defaults + labels match). P1 default
    // WASD (kb1); a keyboard player on the arrow scheme = kb2. Gamepad players still
    // show kb1 defaults for reference (their live input is the pad).
    const g = this._game;
    if (!g || !g.input) return 'kb1';
    const slot = [g.input.p1GpSlot, g.input.p2GpSlot, g.input.p3GpSlot, g.input.p4GpSlot][this._player];
    return slot === -2 ? 'kb2' : 'kb1';
  },

  _suggestGamepad() {
    const g = this._game;
    if (!g || !g.input || !g.input.gamepads) return;
    const pad = g.input.gamepads.find((p) => p && p.connected);
    if (!pad) return;
    // Only a soft one-time hint stored on the instance — never overrides a user choice.
    if (this._suggested) return;
    this._suggested = KEY_BINDINGS.suggestGamepadPreset(pad.rawId);
  },

  _render() {
    const ov = document.getElementById('controls-overlay');
    if (!ov) return;
    // Preserve the scroll position across a full re-render (clicking a row to rebind used to
    // snap the list back to the top — jarring when the row was far down).
    const _prevScroll = (ov.querySelector('.ws-body') || {}).scrollTop || 0;
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const scheme = this._scheme();
    const conflicts = KEY_BINDINGS.conflicts(this._player, scheme);
    const conflictCodes = new Set(conflicts.map((c) => c.code));

    // Player tabs (P1–P4)
    const pTabs = [0, 1, 2, 3].map((p) =>
      `<button class="ws-tab${p === this._player ? ' active' : ''}" data-p="${p}">P${p + 1}</button>`).join('');

    // §Controls Profiles — game-mode profile bar: pick which mode's controls to edit, seed a
    // mode from another ("start from"), and export/import the profile as a file.
    const MODE_LABELS = { platformer: 'Platformer', normal: 'Normal', speedrunner: 'Speed Run', arena: 'Arena', sandbox: 'Sandbox' };
    let profileBar = '';
    if (typeof CONTROL_PROFILES !== 'undefined') {
      const modeOpts = CONTROL_PROFILES.MODES.map((m) => `<option value="${m}"${m === this._mode ? ' selected' : ''}>${MODE_LABELS[m] || m}</option>`).join('');
      const copyOpts = CONTROL_PROFILES.MODES.filter((m) => m !== this._mode).map((m) => `<option value="${m}">${MODE_LABELS[m] || m}</option>`).join('');
      profileBar = `
        <div class="ws-group" style="margin-top:2px">Control Profile — each game mode has its own</div>
        <div class="ws-row"><div class="ws-label"><span class="ws-lbl">Game Mode</span></div>
          <select id="cu-mode" class="startup-sel">${modeOpts}</select></div>
        <div class="ws-row"><div class="ws-label"><span class="ws-lbl">Start From (copy another mode)</span></div>
          <select id="cu-copyfrom" class="startup-sel"><option value="">— choose —</option>${copyOpts}</select></div>
        <div class="ws-row"><div class="ws-label"><span class="ws-lbl">Config File</span></div>
          <span class="cu-bindwrap"><button class="cu-gpbind" id="cu-export">Export ⭳</button><button class="cu-gpbind" id="cu-import">Import ⭱</button></span></div>
        <div class="ws-row"><div class="ws-label"><span class="ws-lbl">Directional Aim</span><span class="ws-hint-inline"> — aim ranged by movement, no cursor</span></div>
          <button class="cu-gpbind" id="cu-diraim">${(typeof KEY_BINDINGS !== 'undefined' && KEY_BINDINGS.getOpt('directionalAim', false)) ? 'On' : 'Off'}</button></div>
        <div class="ws-row"><div class="ws-label"><span class="ws-lbl">Stick Aim (P1)</span><span class="ws-hint-inline"> — P1 aims in the right-stick direction, like players 2-4 (no cursor)</span></div>
          <button class="cu-gpbind" id="cu-stickaim">${(typeof KEY_BINDINGS !== 'undefined' && KEY_BINDINGS.getOpt('p1StickAim', false)) ? 'On' : 'Off'}</button></div>
        <div class="ws-row"><div class="ws-label"><span class="ws-lbl">Aim Style</span><span class="ws-hint-inline"> — how controllers aim (all players)</span></div>
          <button class="cu-gpbind" id="cu-aimstyle">${CONTROLS_UI_AIM_LABEL[(typeof KEY_BINDINGS !== 'undefined' && KEY_BINDINGS.getOpt('aimStyle', 'dual')) || 'dual']}</button></div>`;
    }

    // Preset row
    const kbPreset = KEY_BINDINGS.currentPreset();
    const gpPreset = (this._game && this._game.input && this._game.input.controllerPreset) ? this._game.input.controllerPreset() : 'default';
    const presetSel = `
      <div class="ws-row"><div class="ws-label"><span class="ws-lbl">Keyboard / Mouse Preset</span></div>
        <select id="cu-preset" class="startup-sel">
          <option value="default"${kbPreset === 'default' ? ' selected' : ''}>Default</option>
          <option value="minecraft"${kbPreset === 'minecraft' ? ' selected' : ''}>Minecraft (RMB place)</option>
          <option value="legacyJump"${kbPreset === 'legacyJump' ? ' selected' : ''}>Legacy Jump (Up/W = jump)</option>
          ${kbPreset === 'custom' ? '<option value="custom" selected>Custom</option>' : ''}
        </select></div>
      <div class="ws-row"><div class="ws-label"><span class="ws-lbl">Gamepad Layout</span>${this._suggested && this._suggested !== gpPreset ? ` <span class="ws-info" title="Detected controller suggests: ${esc(this._suggested)}">ⓘ</span>` : ''}</div>
        <select id="cu-gp-preset" class="startup-sel">
          <option value="default"${gpPreset === 'default' ? ' selected' : ''}>Xbox / Default</option>
          <option value="switch"${gpPreset === 'switch' ? ' selected' : ''}>Nintendo Switch</option>
        </select></div>`;

    // Action rows grouped
    let body = '', lastGroup = null;
    for (const a of KEY_BINDINGS.ACTIONS) {
      if (a.group !== lastGroup) { body += `<div class="ws-group">${esc(a.group)}</div>`; lastGroup = a.group; }
      const code = KEY_BINDINGS.resolve(this._player, scheme, a.id);
      const capturing = this._capturing === a.id;
      const conflict = conflictCodes.has(code);
      const btnLabel = capturing ? 'press a key…' : KEY_BINDINGS.labelFor(code);
      body += `<div class="ws-row${conflict ? ' cu-conflict' : ''}">
        <div class="ws-label"><span class="ws-lbl">${esc(a.label)}</span>${conflict ? ' <span class="cu-warn" title="Shared with another action">⚠</span>' : ''}</div>
        <button class="cu-bind${capturing ? ' cu-capturing' : ''}" data-action="${a.id}">${esc(btnLabel)}</button></div>`;
    }

    let warn = '';
    if (conflicts.length) {
      const list = conflicts.map((c) => `${KEY_BINDINGS.labelFor(c.code)} → ${c.actions.join(', ')}`).join('; ');
      warn = `<div class="cu-conflict-note">⚠ Conflicting bindings: ${esc(list)}</div>`;
    }

    // §Phase C — Gamepad buttons: the current mapping per action (read-only display), and
    // click→press-a-button rebind. Face defaults follow the Gamepad Layout preset; triggers/
    // sticks/d-pad are shown but fixed. Button names use the preset's letters (Xbox vs Switch).
    let gpBody = '';
    if (typeof GP_BINDINGS !== 'undefined') {
      const gpConf = GP_BINDINGS.conflicts(this._player, gpPreset);
      const gpConfSet = new Set(gpConf.map((c) => Array.isArray(c.index) ? 'chord:' + [...c.index].sort((x, y) => x - y).join(',') : String(c.index)));
      gpBody = `<div class="ws-group" style="margin-top:10px">Gamepad Buttons ${this._gpCapturing ? '— press a button, or hold TWO for a chord (Esc cancels)' : '— click a binding, then press a button (hold two = chord). “—” = unassigned'}</div>`;
      let gpLastGroup = null;
      const _curMode = (typeof CONTROL_PROFILES !== 'undefined') ? this._mode : null;
      for (const a of GP_BINDINGS.ACTIONS) {
        if (a.modes && _curMode && !a.modes.includes(_curMode)) continue;   // mode-specific (e.g. Sandbox) — hide elsewhere
        if (a.group && a.group !== gpLastGroup) { gpBody += `<div class="ws-group ws-sub-group">${esc(a.group)}</div>`; gpLastGroup = a.group; }
        const idx = GP_BINDINGS.resolve(this._player, gpPreset, a.id);
        const cap = this._gpCapturing === a.id;
        // Conflict flag: chords key by their set; single buttons by index (matches GP_BINDINGS.conflicts).
        const confKey = Array.isArray(idx) ? 'chord:' + [...idx].sort((x, y) => x - y).join(',') : String(idx);
        const conf = gpConfSet.has(confKey);
        const lbl = cap ? 'press a button…' : GP_BINDINGS.label(idx, gpPreset);
        const assigned = idx != null && !(typeof idx === 'number' && idx < 0);   // real button/chord bound?
        gpBody += `<div class="ws-row${conf ? ' cu-conflict' : ''}"><div class="ws-label"><span class="ws-lbl">${esc(a.label)}</span>${conf ? ' <span class="cu-warn" title="Shared with another action">⚠</span>' : ''}</div>
          <span class="cu-bindwrap"><button class="cu-gpbind${cap ? ' cu-capturing' : ''}" data-gpaction="${a.id}">${esc(lbl)}</button>${assigned ? `<button class="cu-gpclear" data-gpclear="${a.id}" title="Unassign">✕</button>` : ''}</span></div>`;
      }
      gpBody += `<div class="ws-group ws-sub-group">Sticks</div>`;
      const swapped = GP_BINDINGS.swapSticks && GP_BINDINGS.swapSticks();
      gpBody += `<div class="ws-row"><div class="ws-label"><span class="ws-lbl">Swap Sticks (Move ↔ Aim)</span></div>
        <button class="cu-gpbind" id="cu-gpswap">${swapped ? 'Swapped' : 'Normal'}</button></div>`;
      for (const f of GP_BINDINGS.FIXED) {   // read-only reference rows (the two sticks)
        const baseLbl = f.note || GP_BINDINGS.label(f.base, gpPreset);
        const lbl = swapped ? (f.label.startsWith('Move') ? 'Right Stick' : 'Left Stick') : baseLbl;
        gpBody += `<div class="ws-row"><div class="ws-label ws-sub"><span class="ws-lbl">${esc(f.label)}</span></div><span class="ws-cyc-val" style="opacity:.65">${esc(lbl)}</span></div>`;
      }
      gpBody += `<div class="cu-actions"><button class="btn btn-secondary" id="cu-gpreset">Reset P${this._player + 1} Gamepad</button></div>`;
    }

    ov.innerHTML = `
      <div class="ws-panel" role="dialog" aria-label="Controls">
        <div class="ws-head">
          <h2>Controls</h2>
          <button class="ws-close" id="cu-close" aria-label="Close">✕</button>
        </div>
        <div class="ws-tabs">${pTabs}</div>
        <div class="ws-body">
          ${profileBar}
          ${presetSel}
          <div class="ws-group" style="margin-top:6px">Keyboard / Mouse ${this._capturing ? '— press a key or click Esc to cancel' : '— click a binding, then press a key/mouse button'}</div>
          ${body}
          ${warn}
          ${gpBody}
          <div class="cu-actions">
            <button class="btn btn-secondary" id="cu-reset">Reset P${this._player + 1} Keyboard/Mouse</button>
          </div>
        </div>
      </div>`;

    ov.querySelectorAll('.ws-tab').forEach((b) => b.onclick = () => { this._cancelCapture(); this._player = +b.dataset.p; this._render(); });
    const closeBtn = document.getElementById('cu-close'); if (closeBtn) closeBtn.onclick = () => this.close();
    const resetBtn = document.getElementById('cu-reset'); if (resetBtn) resetBtn.onclick = () => { KEY_BINDINGS.applyPreset('default', this._player); this._render(); };
    const kp = document.getElementById('cu-preset'); if (kp) kp.onchange = () => { KEY_BINDINGS.applyPreset(kp.value, this._player); this._render(); };
    const gp = document.getElementById('cu-gp-preset');
    if (gp) gp.onchange = () => { if (this._game && this._game.input && this._game.input.setControllerPreset) this._game.input.setControllerPreset(gp.value); this._render(); };
    ov.querySelectorAll('.cu-bind').forEach((b) => b.onclick = () => this._beginCapture(b.dataset.action));
    ov.querySelectorAll('.cu-gpbind[data-gpaction]').forEach((b) => b.onclick = () => this._beginGpCapture(b.dataset.gpaction));
    // ✕ truly UNASSIGNS (stores the -1 sentinel), rather than resetting to the button's
    // default — so a face/base action can be turned off, not just reverted. "Reset Gamepad"
    // clears everything back to defaults.
    ov.querySelectorAll('.cu-gpclear').forEach((b) => b.onclick = (e) => { e.stopPropagation(); if (typeof GP_BINDINGS !== 'undefined') GP_BINDINGS.setBinding(this._player, b.dataset.gpclear, -1); this._render(); });
    const gpsw = document.getElementById('cu-gpswap');
    if (gpsw) gpsw.onclick = () => { if (GP_BINDINGS.setSwapSticks) GP_BINDINGS.setSwapSticks(!GP_BINDINGS.swapSticks()); this._render(); };
    const gpr = document.getElementById('cu-gpreset');
    if (gpr) gpr.onclick = () => { if (typeof GP_BINDINGS !== 'undefined') GP_BINDINGS.resetPlayer(this._player); this._render(); };
    // §Controls Profiles — mode switch / copy-from / export / import.
    const cuMode = document.getElementById('cu-mode');
    if (cuMode) cuMode.onchange = () => { this._cancelCapture(); this._mode = cuMode.value; CONTROL_PROFILES.setMode(this._mode); this._render(); };
    const cuCopy = document.getElementById('cu-copyfrom');
    if (cuCopy) cuCopy.onchange = () => { if (cuCopy.value) { CONTROL_PROFILES.copyFrom(cuCopy.value, this._mode); CONTROL_PROFILES.setMode(this._mode); this._render(); } };
    const cuExp = document.getElementById('cu-export');
    if (cuExp) cuExp.onclick = () => this._exportProfile();
    const cuImp = document.getElementById('cu-import');
    if (cuImp) cuImp.onclick = () => this._importProfile();
    const cuDir = document.getElementById('cu-diraim');
    if (cuDir) cuDir.onclick = () => { if (typeof KEY_BINDINGS !== 'undefined') KEY_BINDINGS.setOpt('directionalAim', !KEY_BINDINGS.getOpt('directionalAim', false)); this._render(); };
    const cuStick = document.getElementById('cu-stickaim');
    if (cuStick) cuStick.onclick = () => { if (typeof KEY_BINDINGS !== 'undefined') KEY_BINDINGS.setOpt('p1StickAim', !KEY_BINDINGS.getOpt('p1StickAim', false)); this._render(); };
    // Aim Style — cycle Dual → Single 360° → Single 8-way (the 3-level kid-friendly scheme).
    const cuAim = document.getElementById('cu-aimstyle');
    if (cuAim) cuAim.onclick = () => {
      if (typeof KEY_BINDINGS === 'undefined') return;
      const order = ['dual', 'single360', 'single8'];
      const cur = KEY_BINDINGS.getOpt('aimStyle', 'dual');
      KEY_BINDINGS.setOpt('aimStyle', order[(order.indexOf(cur) + 1) % order.length]);
      this._render();
    };
    // Restore the scroll position captured at the top of this render.
    const _nb = ov.querySelector('.ws-body'); if (_nb) _nb.scrollTop = _prevScroll;
  },

  _beginCapture(action) {
    this._cancelCapture();
    this._capturing = action;
    this._render();
    // Capture the NEXT key or mouse button. Capture phase + stopPropagation so the
    // press doesn't leak to the game or other handlers.
    this._capHandler = (e) => {
      e.preventDefault(); e.stopPropagation();
      let code = null;
      if (e.type === 'keydown') {
        if (e.code === 'Escape') { this._cancelCapture(); this._render(); return; }
        code = e.code;
      } else if (e.type === 'mousedown') {
        code = e.button === 2 ? 'Mouse2' : e.button === 0 ? (e.shiftKey ? 'ShiftMouse0' : 'Mouse0') : null;
      }
      if (code) {
        KEY_BINDINGS.setBinding(this._player, action, code);
        this._endCapture();
        this._render();
      }
    };
    window.addEventListener('keydown', this._capHandler, true);
    window.addEventListener('mousedown', this._capHandler, true);
    window.addEventListener('contextmenu', this._preventCtx, true);
  },
  _preventCtx(e) { e.preventDefault(); },
  _endCapture() {
    if (this._capHandler) {
      window.removeEventListener('keydown', this._capHandler, true);
      window.removeEventListener('mousedown', this._capHandler, true);
      window.removeEventListener('contextmenu', this._preventCtx, true);
      this._capHandler = null;
    }
    this._capturing = null;
  },
  // §Phase C — gamepad rebind capture: the Gamepad API fires no events, so poll
  // navigator.getGamepads() each frame and resolve on the first NEWLY-pressed button
  // (buttons already held at capture-start are ignored). Esc cancels via _cancelCapture.
  _beginGpCapture(action) {
    this._cancelCapture();
    if (typeof GP_BINDINGS === 'undefined' || typeof navigator === 'undefined' || !navigator.getGamepads) return;
    this._gpCapturing = action;
    this._render();
    const readPad = () => { const pads = navigator.getGamepads() || []; for (const p of pads) if (p && p.connected) return p; return null; };
    const pad0 = readPad();
    const initial = pad0 ? pad0.buttons.map((b) => !!b.pressed) : [];
    // Chord capture (Kevin's release-based model): track the LARGEST set of freshly-pressed
    // buttons held at once (the "peak"); commit when everything is released. Peak size 1 =
    // a single button; 2+ = a chord [sorted indices] that must all be held to fire in-game.
    let peak = [];
    const poll = () => {
      if (this._gpCapturing !== action) return;   // cancelled / superseded
      const pad = readPad();
      if (pad) {
        const fresh = [];
        for (let i = 0; i < pad.buttons.length; i++) if (pad.buttons[i].pressed && !initial[i]) fresh.push(i);
        if (fresh.length > peak.length) peak = fresh.slice();
        if (peak.length && fresh.length === 0) {     // all released → commit the peak set
          const val = peak.length === 1 ? peak[0] : peak.slice().sort((a, b) => a - b);
          GP_BINDINGS.setBinding(this._player, action, val);
          this._endGpCapture();
          this._render();
          return;
        }
      }
      this._gpPoll = requestAnimationFrame(poll);
    };
    this._gpPoll = requestAnimationFrame(poll);
  },
  _endGpCapture() {
    if (this._gpPoll != null && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this._gpPoll);
    this._gpPoll = null;
    this._gpCapturing = null;
  },
  _cancelCapture() { this._endCapture(); this._endGpCapture(); },

  // §Controls Profiles — download the active mode's profile as a JSON file.
  _exportProfile() {
    if (typeof CONTROL_PROFILES === 'undefined') return;
    try {
      const data = CONTROL_PROFILES.exportConfig(this._mode);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `steveo-controls-${this._mode}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { /* ignore */ }
  },
  // Pick a JSON file and apply it to the active mode (becomes the new default; still editable).
  _importProfile() {
    if (typeof CONTROL_PROFILES === 'undefined') return;
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/json,.json';
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const obj = JSON.parse(reader.result);
          if (CONTROL_PROFILES.importConfig(obj, this._mode)) { CONTROL_PROFILES.setMode(this._mode); this._render(); }
          else if (this._game && this._game._notify) this._game._notify('Not a Steveo control profile', '#ffb454', 120);
        } catch (e) { if (this._game && this._game._notify) this._game._notify('Could not read that file', '#ffb454', 120); }
      };
      reader.readAsText(f);
    };
    inp.click();
  },
};

if (typeof window !== 'undefined') window.CONTROLS_UI = CONTROLS_UI;
