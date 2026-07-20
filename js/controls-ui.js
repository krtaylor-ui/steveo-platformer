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
    const ov = document.getElementById('controls-overlay');
    if (!ov) return;
    if (this._game) this._game._htmlSettingsOpen = true;   // blocks gameplay input while open
    ov.style.display = 'flex';
    // Auto-suggest a gamepad preset the first time a pad is seen (non-destructive hint).
    this._suggestGamepad();
    if (!this._keyHandler) {
      this._keyHandler = (e) => {
        if (!this.isOpen()) return;
        if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); if (this._capturing) this._cancelCapture(); else this.close(); }
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
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const scheme = this._scheme();
    const conflicts = KEY_BINDINGS.conflicts(this._player, scheme);
    const conflictCodes = new Set(conflicts.map((c) => c.code));

    // Player tabs (P1–P4)
    const pTabs = [0, 1, 2, 3].map((p) =>
      `<button class="ws-tab${p === this._player ? ' active' : ''}" data-p="${p}">P${p + 1}</button>`).join('');

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

    ov.innerHTML = `
      <div class="ws-panel" role="dialog" aria-label="Controls">
        <div class="ws-head">
          <h2>Controls</h2>
          <button class="ws-close" id="cu-close" aria-label="Close">✕</button>
        </div>
        <div class="ws-tabs">${pTabs}</div>
        <div class="ws-body">
          ${presetSel}
          <div class="ws-group" style="margin-top:6px">Bindings ${this._capturing ? '— press a key or click Esc to cancel' : '— click a binding, then press a key/mouse button'}</div>
          ${body}
          ${warn}
          <div class="cu-actions">
            <button class="btn btn-secondary" id="cu-reset">Reset P${this._player + 1} to Default</button>
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
  _cancelCapture() { this._endCapture(); },
};

if (typeof window !== 'undefined') window.CONTROLS_UI = CONTROLS_UI;
