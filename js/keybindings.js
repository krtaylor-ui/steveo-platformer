// ============================================================
// keybindings.js — Rebindable keyboard/mouse action map (§Phase 2)
// ------------------------------------------------------------
// The foundation the full Controls-Config UI sits on. It is a thin OVERRIDE layer
// over the historical hardcoded keys: with NO overrides + the Default preset, every
// resolve() returns exactly the key input.js used before, so default behaviour is
// byte-for-byte unchanged (this is what keeps the migration safe + the suite green).
//
// Model:
//   • Per-player overrides (index 0-3). Players 0/1 can be on a keyboard scheme
//     (kb1 = WASD, kb2 = Arrows); 2/3 are gamepad-only. An override is a CODE token.
//   • Code tokens are DOM `e.code` strings ('KeyW', 'ArrowUp', 'Digit1', …) plus a
//     few mouse pseudo-codes: 'Mouse0' (left), 'Mouse2' (right), 'ShiftMouse0'
//     (shift+left — the default "place" chord).
//   • Scheme DEFAULTS reproduce the pre-Phase-2 primary bindings exactly.
//   • Presets: 'default' (no overrides), 'minecraft' (mouse swap: left=attack/mine,
//     right=place), 'legacyJump' (jump on Up/W — the one-click way back once Phase 5
//     repurposes Up/W for look-up). Gamepad face presets ('xbox'/'switch') are kept
//     in input.js (setControllerPreset); the UI drives both through one dropdown.
//
// Everything here is PURE (no DOM), so it is unit-tested headless. The click→press
// capture flow + the panel rendering live in controls-ui.js (browser-only).
// ============================================================

// §Controls Profiles — the five game modes each hold an independent control profile
// (keyboard + gamepad + stick tuning), so a build-anything platform can have wholly
// different (or deliberately restricted) controls per mode. `all` is a hidden shared
// fallback used only for migration seeding.
const CONTROL_MODES = ['platformer', 'normal', 'speedrunner', 'arena', 'sandbox'];
function _normalizeControlMode(m) { return CONTROL_MODES.includes(m) ? m : 'normal'; }

const KEY_BINDINGS = {
  STORAGE_KEY: 'steveo_keybinds_v2',
  OLD_KEY: 'steveo_keybinds_v1',
  _mode: 'normal',
  setMode(m) { this._mode = _normalizeControlMode(m); return this._mode; },

  // Rebindable actions (id, label, group, kind). `kind:'key'` = keyboard-first;
  // `kind:'mouseOrKey'` = defaults to a mouse button but can be bound to a key too.
  ACTIONS: [
    { id: 'left',    label: 'Move Left',      group: 'Movement', kind: 'key' },
    { id: 'right',   label: 'Move Right',     group: 'Movement', kind: 'key' },
    { id: 'jump',    label: 'Jump',           group: 'Movement', kind: 'key' },
    { id: 'crouch',  label: 'Crouch / Down',  group: 'Movement', kind: 'key' },
    { id: 'run',     label: 'Sprint (hold)',  group: 'Movement', kind: 'key' },
    { id: 'aimUp',   label: 'Look / Aim Up',  group: 'Movement', kind: 'key' },   // Phase 5b
    { id: 'melee',   label: 'Melee Attack',   group: 'Combat',   kind: 'mouseOrKey' },
    { id: 'ranged',  label: 'Ranged Attack',  group: 'Combat',   kind: 'mouseOrKey' },
    { id: 'place',   label: 'Place Block',    group: 'Combat',   kind: 'mouseOrKey' },
    { id: 'throw',   label: 'Throw / Recall', group: 'Combat',   kind: 'key' },
    { id: 'grapple', label: 'Grappling Hook', group: 'Combat',   kind: 'key' },   // Phase 5
    { id: 'inventory', label: 'Inventory',    group: 'Actions',  kind: 'key' },
    ...Array.from({ length: 9 }, (_, i) => ({ id: 'hotbar' + (i + 1), label: 'Hotbar ' + (i + 1), group: 'Hotbar', kind: 'key' })),
  ],

  // Per-scheme default primary codes. These MUST match the historical input.js keys.
  DEFAULTS: {
    // NB: aimUp shares the scheme's natural UP key with jump (W / ArrowUp). That's a
    // deliberate MODE SWAP, not a clash — when Aim-Up is enabled (§5b) jump moves to J
    // and Up/W become look-up; the two are never live at once. conflicts() ignores the
    // {jump, aimUp} pair for exactly this reason.
    kb1: {
      left: 'KeyA', right: 'KeyD', jump: 'KeyW', crouch: 'KeyS', run: 'ShiftLeft',
      aimUp: 'KeyW', melee: 'Space', ranged: 'Mouse2', place: 'ShiftMouse0',
      throw: 'KeyQ', grapple: 'KeyG', inventory: 'KeyE',
    },
    kb2: {
      left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', crouch: 'ArrowDown', run: 'ShiftLeft',
      aimUp: 'ArrowUp', melee: 'Insert', ranged: 'Mouse2', place: 'ShiftMouse0',
      throw: 'KeyQ', grapple: 'KeyG', inventory: 'KeyI',
    },
  },

  // Loaded state: { version:2, byMode: { <mode>: { preset, mouseScheme, players:{0-3} } } }.
  _state: null,

  _blankSlice() { return { preset: 'default', mouseScheme: 'default', players: { 0: {}, 1: {}, 2: {}, 3: {} }, opts: {} }; },
  _blank() { return { version: 2, byMode: {} }; },

  load() {
    if (this._state) return this._state;
    let s = this._blank();
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && p.byMode) { s.byMode = p.byMode; }
      } else {
        // Migrate the pre-per-mode flat config: seed EVERY mode with it, so nothing is lost.
        const old = localStorage.getItem(this.OLD_KEY);
        if (old) {
          const p = JSON.parse(old);
          if (p && typeof p === 'object') {
            for (const m of CONTROL_MODES) {
              const slice = this._blankSlice();
              slice.preset = p.preset || 'default';
              slice.mouseScheme = p.mouseScheme || 'default';
              for (const i of [0, 1, 2, 3]) if (p.players && p.players[i]) slice.players[i] = { ...p.players[i] };
              s.byMode[m] = slice;
            }
          }
        }
      }
    } catch (e) { /* corrupt / unavailable → blank */ }
    this._state = s;
    return s;
  },
  // The active mode's slice (lazily created from defaults).
  _ms() {
    const st = this.load();
    if (!st.byMode[this._mode]) st.byMode[this._mode] = this._blankSlice();
    return st.byMode[this._mode];
  },
  save() {
    try { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.load())); } catch (e) { /* ignore */ }
  },

  // Fill the hotbar defaults programmatically (Digit1..Digit9) into a scheme map.
  _schemeDefaults(scheme) {
    const base = this.DEFAULTS[scheme] || this.DEFAULTS.kb1;
    const out = { ...base };
    for (let i = 1; i <= 9; i++) out['hotbar' + i] = 'Digit' + i;
    return out;
  },

  // The resolved CODE for (player, scheme, action): the player's override else the
  // scheme default. Always returns a token (never null) for a known action.
  resolve(player, scheme, action) {
    const st = this._ms();
    const ov = st.players[player] && st.players[player][action];
    if (ov) return ov;
    return this._schemeDefaults(scheme)[action] || null;
  },

  // A per-player override was explicitly set for this action? (Used so input.js can
  // keep its legacy multi-key convenience keys ONLY while the action is un-rebound.)
  hasOverride(player, action) {
    const st = this._ms();
    return !!(st.players[player] && st.players[player][action]);
  },

  setBinding(player, action, code) {
    const st = this._ms();
    if (!st.players[player]) st.players[player] = {};
    st.players[player][action] = code;
    st.preset = 'custom';
    this.save();
  },
  clearBinding(player, action) {
    const st = this._ms();
    if (st.players[player]) delete st.players[player][action];
    this.save();
  },

  // Mouse scheme (Minecraft preset swaps place/attack): which mouse button places
  // vs attacks. Read by game.js's place/mine/attack decision.
  mouseScheme() { return this._ms().mouseScheme; },
  isMinecraftMouse() { return this._ms().mouseScheme === 'minecraft'; },

  // §Controls Profiles — per-mode gameplay options (not key bindings), e.g. Directional Aim.
  // Stored in the mode slice so they travel with export/import + copy-from.
  getOpt(key, dflt) { const o = this._ms().opts || {}; return (o[key] === undefined ? dflt : o[key]); },
  setOpt(key, val) { const st = this._ms(); if (!st.opts) st.opts = {}; st.opts[key] = val; this.save(); },

  // ── Presets ─────────────────────────────────────────────────
  // A preset is applied by CLEARING per-player key overrides it owns and setting the
  // scheme knobs. 'default' = vanilla; 'minecraft' = mouse swap; 'legacyJump' = force
  // jump onto Up/W + clear any aim-up rebind (the escape hatch once Phase 5 moves jump
  // to J). Xbox/Switch are gamepad face presets handled by input.setControllerPreset.
  applyPreset(preset, player = 0) {
    const st = this._ms();
    if (preset === 'default') {
      st.players[player] = {};
      st.mouseScheme = 'default';
      st.preset = 'default';
    } else if (preset === 'minecraft') {
      st.mouseScheme = 'minecraft';
      st.preset = 'minecraft';
    } else if (preset === 'legacyJump') {
      if (!st.players[player]) st.players[player] = {};
      // Force the classic jump-on-Up/W scheme regardless of the current default.
      st.players[player].jump = 'KeyW';
      delete st.players[player].aimUp;   // give Up/W back to jumping
      st.preset = 'legacyJump';
    }
    this.save();
    return st.preset;
  },
  currentPreset() { return this._ms().preset; },

  // Suggest a gamepad face preset from a gamepad id string (Nintendo → switch).
  suggestGamepadPreset(gamepadId) {
    const id = (gamepadId || '').toLowerCase();
    if (/nintendo|switch|joy-?con|joycon|pro controller/.test(id)) return 'switch';
    return 'default';
  },

  // ── Conflict detection ──────────────────────────────────────
  // Two actions bound to the SAME code (for a player+scheme) conflict. Returns a list
  // of { code, actions:[ids] } for every code used by 2+ actions. Hotbar digits are
  // included; mouse tokens are compared as-is (Mouse2 for ranged vs place is a real
  // conflict worth warning about).
  conflicts(player, scheme) {
    const byCode = {};
    for (const a of this.ACTIONS) {
      const code = this.resolve(player, scheme, a.id);
      if (!code) continue;
      (byCode[code] = byCode[code] || []).push(a.id);
    }
    const out = [];
    for (const code in byCode) {
      let acts = byCode[code];
      // {jump, aimUp} on the same key is a deliberate mode swap (§5b), not a conflict.
      if (acts.length === 2 && acts.includes('jump') && acts.includes('aimUp')) continue;
      if (acts.length > 1) out.push({ code, actions: acts });
    }
    return out;
  },

  // Human label for a code token (for the UI + a headless sanity check).
  labelFor(code) {
    if (!code) return '—';
    const M = { Mouse0: 'Left-Click', Mouse2: 'Right-Click', ShiftMouse0: 'Shift + Left-Click' };
    if (M[code]) return M[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Arrow')) return code.slice(5) + ' Arrow';
    const S = { Space: 'Space', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', Insert: 'Insert', Delete: 'Delete', Enter: 'Enter', Tab: 'Tab', Backquote: '`' };
    return S[code] || code;
  },
};

// ============================================================
// GP_BINDINGS — rebindable GAMEPAD buttons (§Phase C). Parallel to KEY_BINDINGS but for
// gamepad button INDICES. Only the button-type actions are rebindable (triggers, d-pad
// and sticks stay fixed — analog / navigation). The controller PRESET (Xbox/Switch)
// selects the default button set (Switch swaps the 4 face buttons); a per-player override
// then wins. This SUBSUMES the old input.js `_faceRemap` for these actions: resolve()
// returns the final physical button index for (player, preset, action). Pure + testable.
// ============================================================
const GP_BINDINGS = {
  STORAGE_KEY: 'steveo_gp_binds_v2',
  OLD_KEY: 'steveo_gp_binds_v1',
  _mode: 'normal',
  setMode(m) { this._mode = _normalizeControlMode(m); return this._mode; },
  // Rebindable button actions with their BASE (Xbox/default) button index. base:null =
  // unassigned by default (still shown as an option; the player can bind it). §Controller
  // pass: RT + the 4 D-pad directions are now editable (were FIXED), and new actions were
  // added (Sprint, Grapple, Grapple-Pull, the weapon-switch family). A binding value may be
  // a single index OR a chord [modIdx, btnIdx] (all must be held) — see resolve()/abtn().
  ACTIONS: [
    { id: 'jump',       label: 'Jump',                  group: 'Movement', base: 0,  face: true },
    { id: 'crouch',     label: 'Crouch / Shield',       group: 'Movement', base: 1,  face: true },
    { id: 'moveLeft',   label: 'Move Left',             group: 'Movement', base: null },   // e.g. D-Pad Left
    { id: 'moveRight',  label: 'Move Right',            group: 'Movement', base: null },   // e.g. D-Pad Right
    { id: 'sprint',     label: 'Sprint (hold)',         group: 'Movement', base: null },
    { id: 'grapple',    label: 'Grappling Hook',        group: 'Movement', base: null },
    { id: 'grapplePull',label: 'Grapple — Pull In',     group: 'Movement', base: null },
    { id: 'melee',      label: 'Melee Attack',          group: 'Combat',   base: 2,  face: true },
    { id: 'ranged',     label: 'Ranged Attack',         group: 'Combat',   base: 7 },   // RT (was fixed)
    { id: 'place',      label: 'Use Item / Place',      group: 'Combat',   base: 3,  face: true },
    { id: 'throw',      label: 'Throw / Recall',        group: 'Combat',   base: 11 },
    { id: 'prevSlot',   label: 'Change Melee Weapon',   group: 'Weapons',  base: 4 },   // LB
    { id: 'context',    label: 'Change Ranged Weapon',  group: 'Weapons',  base: 5 },   // RB
    { id: 'cycleSel',   label: 'Change Selected Weapon',group: 'Weapons',  base: null },
    { id: 'nextSlot',   label: 'Next Hotbar Slot',      group: 'Weapons',  base: null },
    { id: 'prevHotbar', label: 'Previous Hotbar Slot',  group: 'Weapons',  base: null },
    { id: 'inventory',  label: 'Palette / Inventory',   group: 'System',   base: 8 },   // View
    { id: 'menu',       label: 'Pause',                 group: 'System',   base: 9 },
    // Sandbox-only tools (shown/bindable only while editing the Sandbox profile).
    { id: 'sbUndo',     label: 'Undo',                  group: 'Sandbox',  base: null, modes: ['sandbox'] },
    { id: 'sbRedo',     label: 'Redo',                  group: 'Sandbox',  base: null, modes: ['sandbox'] },
    { id: 'sbCopy',     label: 'Copy Region',           group: 'Sandbox',  base: null, modes: ['sandbox'] },
    { id: 'sbPaste',    label: 'Paste',                 group: 'Sandbox',  base: null, modes: ['sandbox'] },
    { id: 'sbPenUp',    label: 'Pen Size +',            group: 'Sandbox',  base: null, modes: ['sandbox'] },
    { id: 'sbPenDown',  label: 'Pen Size −',            group: 'Sandbox',  base: null, modes: ['sandbox'] },
    { id: 'sbPalette',  label: 'Toggle Palette',        group: 'Sandbox',  base: null, modes: ['sandbox'] },
  ],
  // Fixed (non-rebindable) reference — the two analog sticks. Swap them with swapSticks().
  FIXED: [
    { label: 'Aim / Camera',  base: -1, note: 'Right Stick' },
    { label: 'Move',          base: -1, note: 'Left Stick' },
  ],
  // Face-button swap per preset (base index 0-3 → physical index). 'switch' mirrors A↔B, X↔Y.
  PRESET_FACE: { default: [0, 1, 2, 3], xbox: [0, 1, 2, 3], switch: [1, 0, 3, 2] },
  // Button-index → human label, per preset naming (Xbox vs Switch face letters).
  NAMES: {
    default: { 0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT', 8: 'View', 9: 'Menu', 10: 'LS', 11: 'RS', 12: 'D-Up', 13: 'D-Down', 14: 'D-Left', 15: 'D-Right' },
    switch:  { 0: 'B', 1: 'A', 2: 'Y', 3: 'X', 4: 'L', 5: 'R', 6: 'ZL', 7: 'ZR', 8: '-', 9: '+', 10: 'LS', 11: 'RS', 12: 'D-Up', 13: 'D-Down', 14: 'D-Left', 15: 'D-Right' },
  },

  _state: null,
  _blankSlice() { return { players: { 0: {}, 1: {}, 2: {}, 3: {} }, swapSticks: false }; },
  _blank() { return { version: 2, byMode: {} }; },
  load() {
    if (this._state) return this._state;
    let s = this._blank();
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) { const p = JSON.parse(raw); if (p && p.byMode) s.byMode = p.byMode; }
      else {
        const old = localStorage.getItem(this.OLD_KEY);
        if (old) {
          const p = JSON.parse(old);
          if (p) for (const m of CONTROL_MODES) {
            const slice = this._blankSlice();
            if (p.players) for (const i of [0, 1, 2, 3]) if (p.players[i]) slice.players[i] = { ...p.players[i] };
            slice.swapSticks = !!p.swapSticks;
            s.byMode[m] = slice;
          }
        }
      }
    } catch (e) {}
    this._state = s; return s;
  },
  _ms() { const st = this.load(); if (!st.byMode[this._mode]) st.byMode[this._mode] = this._blankSlice(); return st.byMode[this._mode]; },

  // Left/Right stick swap (move ↔ aim). Per-mode, like the rest of the profile.
  swapSticks() { return !!this._ms().swapSticks; },
  setSwapSticks(v) { this._ms().swapSticks = !!v; this.save(); },
  save() { try { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.load())); } catch (e) {} },

  _base(action) { const a = this.ACTIONS.find((x) => x.id === action); return a ? a.base : null; },
  _isFace(action) { const a = this.ACTIONS.find((x) => x.id === action); return !!(a && a.face); },
  override(player, action) { const st = this._ms(); const p = st.players[player]; const v = p && p[action]; return (v == null ? null : v); },

  // Final physical button index for (player, preset, action): the player's override, else
  // the preset-adjusted default (face swap for the 4 face buttons).
  resolve(player, preset, action) {
    const ov = this.override(player, action);
    if (ov != null) return ov;
    const base = this._base(action);
    if (base == null) return null;
    if (this._isFace(action)) { const map = this.PRESET_FACE[preset] || this.PRESET_FACE.default; return map[base]; }
    return base;
  },
  setBinding(player, action, index) { const st = this._ms(); if (!st.players[player]) st.players[player] = {}; st.players[player][action] = index; this.save(); },
  clearBinding(player, action) { const st = this._ms(); if (st.players[player]) delete st.players[player][action]; this.save(); },
  resetPlayer(player) { const st = this._ms(); st.players[player] = {}; this.save(); },

  label(index, preset) {
    if (Array.isArray(index)) return index.map((i) => this.label(i, preset)).join(' + ');   // chord
    if (index == null || index < 0) return '—';
    const n = this.NAMES[preset] || this.NAMES.default; return n[index] || ('Btn ' + index);
  },
  isChord(v) { return Array.isArray(v) && v.length > 1; },

  // Conflicts: two rebindable actions resolving to the SAME binding (button or chord).
  // Unassigned (null) actions never conflict; a chord is keyed by its sorted button set,
  // so a chord and a lone button only clash when identical.
  conflicts(player, preset) {
    const byKey = {};
    for (const a of this.ACTIONS) {
      if (a.modes && !a.modes.includes(this._mode)) continue;        // mode-specific action not in this mode
      const r = this.resolve(player, preset, a.id);
      if (r == null || (typeof r === 'number' && r < 0)) continue;   // unassigned (null or -1) → never conflicts
      const key = Array.isArray(r) ? 'chord:' + [...r].sort((x, y) => x - y).join(',') : String(r);
      (byKey[key] = byKey[key] || { r, actions: [] }).actions.push(a.id);
    }
    const out = [];
    for (const k in byKey) if (byKey[k].actions.length > 1) out.push({ index: byKey[k].r, actions: byKey[k].actions });
    return out;
  },
};

// ============================================================
// CONTROL_PROFILES — coordinator over the three per-mode stores (keyboard, gamepad,
// stick tuning). Switches all three to the active game mode at once, copies a whole
// profile between modes ("start from"), and serializes a mode's profile for export/import.
// A game mode's config is fully independent; export/import files carry kb + gp + sticks.
// ============================================================
const CONTROL_PROFILES = {
  MODES: CONTROL_MODES,
  normalize: _normalizeControlMode,
  setMode(m) {
    const mm = _normalizeControlMode(m);
    KEY_BINDINGS.setMode(mm); GP_BINDINGS.setMode(mm);
    if (typeof ControllerConfig !== 'undefined' && ControllerConfig.setMode) ControllerConfig.setMode(mm);
    return mm;
  },
  // Copy an entire profile (kb + gp + sticks) from one mode to another ("start from").
  copyFrom(src, dest) {
    src = _normalizeControlMode(src); dest = _normalizeControlMode(dest);
    if (src === dest) return;
    const ks = KEY_BINDINGS.load(); if (ks.byMode[src]) { ks.byMode[dest] = JSON.parse(JSON.stringify(ks.byMode[src])); KEY_BINDINGS.save(); }
    const gs = GP_BINDINGS.load(); if (gs.byMode[src]) { gs.byMode[dest] = JSON.parse(JSON.stringify(gs.byMode[src])); GP_BINDINGS.save(); }
    if (typeof ControllerConfig !== 'undefined' && ControllerConfig.copyMode) ControllerConfig.copyMode(src, dest);
  },
  // Serialize a mode's full profile for export (download as JSON).
  exportConfig(mode) {
    mode = _normalizeControlMode(mode);
    const ks = KEY_BINDINGS.load(), gs = GP_BINDINGS.load();
    return {
      steveoControlProfile: 1, mode,
      kb: ks.byMode[mode] ? JSON.parse(JSON.stringify(ks.byMode[mode])) : KEY_BINDINGS._blankSlice(),
      gp: gs.byMode[mode] ? JSON.parse(JSON.stringify(gs.byMode[mode])) : GP_BINDINGS._blankSlice(),
      sticks: (typeof ControllerConfig !== 'undefined' && ControllerConfig.exportSticks) ? ControllerConfig.exportSticks(mode) : null,
    };
  },
  // Apply an imported profile object into a mode (its new default; still fully editable).
  importConfig(obj, mode) {
    if (!obj || obj.steveoControlProfile == null) return false;
    mode = _normalizeControlMode(mode || obj.mode);
    const ks = KEY_BINDINGS.load(); if (obj.kb) { ks.byMode[mode] = JSON.parse(JSON.stringify(obj.kb)); KEY_BINDINGS.save(); }
    const gs = GP_BINDINGS.load(); if (obj.gp) { gs.byMode[mode] = JSON.parse(JSON.stringify(obj.gp)); GP_BINDINGS.save(); }
    if (obj.sticks && typeof ControllerConfig !== 'undefined' && ControllerConfig.importSticks) ControllerConfig.importSticks(obj.sticks, mode);
    return true;
  },
};

if (typeof window !== 'undefined') { window.KEY_BINDINGS = KEY_BINDINGS; window.GP_BINDINGS = GP_BINDINGS; window.CONTROL_PROFILES = CONTROL_PROFILES; window.CONTROL_MODES = CONTROL_MODES; }
if (typeof module !== 'undefined' && module.exports) module.exports = { KEY_BINDINGS, GP_BINDINGS, CONTROL_PROFILES, CONTROL_MODES };
