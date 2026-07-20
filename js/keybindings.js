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

const KEY_BINDINGS = {
  STORAGE_KEY: 'steveo_keybinds_v1',

  // Rebindable actions (id, label, group, kind). `kind:'key'` = keyboard-first;
  // `kind:'mouseOrKey'` = defaults to a mouse button but can be bound to a key too.
  ACTIONS: [
    { id: 'left',    label: 'Move Left',      group: 'Movement', kind: 'key' },
    { id: 'right',   label: 'Move Right',     group: 'Movement', kind: 'key' },
    { id: 'jump',    label: 'Jump',           group: 'Movement', kind: 'key' },
    { id: 'crouch',  label: 'Crouch / Down',  group: 'Movement', kind: 'key' },
    { id: 'run',     label: 'Run (hold)',     group: 'Movement', kind: 'key' },
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

  // Loaded state: { preset, mouseScheme, players: { 0:{action:code}, … } }.
  _state: null,

  _blank() { return { preset: 'default', mouseScheme: 'default', players: { 0: {}, 1: {}, 2: {}, 3: {} } }; },

  load() {
    if (this._state) return this._state;
    let s = this._blank();
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && typeof p === 'object') {
          s.preset = p.preset || 'default';
          s.mouseScheme = p.mouseScheme || 'default';
          for (const i of [0, 1, 2, 3]) if (p.players && p.players[i]) s.players[i] = { ...p.players[i] };
        }
      }
    } catch (e) { /* corrupt / unavailable → blank */ }
    this._state = s;
    return s;
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
    const st = this.load();
    const ov = st.players[player] && st.players[player][action];
    if (ov) return ov;
    return this._schemeDefaults(scheme)[action] || null;
  },

  // A per-player override was explicitly set for this action? (Used so input.js can
  // keep its legacy multi-key convenience keys ONLY while the action is un-rebound.)
  hasOverride(player, action) {
    const st = this.load();
    return !!(st.players[player] && st.players[player][action]);
  },

  setBinding(player, action, code) {
    const st = this.load();
    if (!st.players[player]) st.players[player] = {};
    st.players[player][action] = code;
    st.preset = 'custom';
    this.save();
  },
  clearBinding(player, action) {
    const st = this.load();
    if (st.players[player]) delete st.players[player][action];
    this.save();
  },

  // Mouse scheme (Minecraft preset swaps place/attack): which mouse button places
  // vs attacks. Read by game.js's place/mine/attack decision.
  mouseScheme() { return this.load().mouseScheme; },
  isMinecraftMouse() { return this.load().mouseScheme === 'minecraft'; },

  // ── Presets ─────────────────────────────────────────────────
  // A preset is applied by CLEARING per-player key overrides it owns and setting the
  // scheme knobs. 'default' = vanilla; 'minecraft' = mouse swap; 'legacyJump' = force
  // jump onto Up/W + clear any aim-up rebind (the escape hatch once Phase 5 moves jump
  // to J). Xbox/Switch are gamepad face presets handled by input.setControllerPreset.
  applyPreset(preset, player = 0) {
    const st = this.load();
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
  currentPreset() { return this.load().preset; },

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
  STORAGE_KEY: 'steveo_gp_binds_v1',
  // Rebindable button actions with their BASE (Xbox/default) button index.
  ACTIONS: [
    { id: 'jump',     label: 'Jump',                 base: 0,  face: true },
    { id: 'crouch',   label: 'Crouch / Shield',      base: 1,  face: true },
    { id: 'melee',    label: 'Melee Attack',         base: 2,  face: true },
    { id: 'place',    label: 'Place Block',          base: 3,  face: true },
    { id: 'prevSlot', label: 'Previous Weapon',      base: 4 },
    { id: 'context',  label: 'Context / Next Weapon', base: 5 },
    { id: 'throw',    label: 'Throw / Recall',       base: 11 },
    { id: 'menu',     label: 'Pause',                base: 9 },
  ],
  // Fixed (non-rebindable) button reference — shown read-only so players see the full map.
  FIXED: [
    { label: 'Ranged Attack', base: 7 },   // RT (analog trigger)
    { label: 'Aim / Camera',  base: -1, note: 'Right Stick' },
    { label: 'Move',          base: -1, note: 'Left Stick' },
    { label: 'Weapon Select', base: 12, note: 'D-Pad' },
  ],
  // Face-button swap per preset (base index 0-3 → physical index). 'switch' mirrors A↔B, X↔Y.
  PRESET_FACE: { default: [0, 1, 2, 3], xbox: [0, 1, 2, 3], switch: [1, 0, 3, 2] },
  // Button-index → human label, per preset naming (Xbox vs Switch face letters).
  NAMES: {
    default: { 0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT', 8: 'View', 9: 'Menu', 10: 'LS', 11: 'RS', 12: 'D-Up', 13: 'D-Down', 14: 'D-Left', 15: 'D-Right' },
    switch:  { 0: 'B', 1: 'A', 2: 'Y', 3: 'X', 4: 'L', 5: 'R', 6: 'ZL', 7: 'ZR', 8: '-', 9: '+', 10: 'LS', 11: 'RS', 12: 'D-Up', 13: 'D-Down', 14: 'D-Left', 15: 'D-Right' },
  },

  _state: null,
  _blank() { return { players: { 0: {}, 1: {}, 2: {}, 3: {} } }; },
  load() {
    if (this._state) return this._state;
    let s = this._blank();
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) { const p = JSON.parse(raw); if (p && p.players) for (const i of [0, 1, 2, 3]) if (p.players[i]) s.players[i] = { ...p.players[i] }; }
    } catch (e) {}
    this._state = s; return s;
  },
  save() { try { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.load())); } catch (e) {} },

  _base(action) { const a = this.ACTIONS.find((x) => x.id === action); return a ? a.base : null; },
  _isFace(action) { const a = this.ACTIONS.find((x) => x.id === action); return !!(a && a.face); },
  override(player, action) { const st = this.load(); const p = st.players[player]; const v = p && p[action]; return (v == null ? null : v); },

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
  setBinding(player, action, index) { const st = this.load(); if (!st.players[player]) st.players[player] = {}; st.players[player][action] = index; this.save(); },
  clearBinding(player, action) { const st = this.load(); if (st.players[player]) delete st.players[player][action]; this.save(); },
  resetPlayer(player) { const st = this.load(); st.players[player] = {}; this.save(); },

  label(index, preset) { if (index == null || index < 0) return '—'; const n = this.NAMES[preset] || this.NAMES.default; return n[index] || ('Btn ' + index); },

  // Conflicts: two rebindable actions resolving to the same physical button.
  conflicts(player, preset) {
    const byIdx = {};
    for (const a of this.ACTIONS) { const i = this.resolve(player, preset, a.id); (byIdx[i] = byIdx[i] || []).push(a.id); }
    const out = []; for (const i in byIdx) if (byIdx[i].length > 1) out.push({ index: +i, actions: byIdx[i] });
    return out;
  },
};

if (typeof window !== 'undefined') { window.KEY_BINDINGS = KEY_BINDINGS; window.GP_BINDINGS = GP_BINDINGS; }
if (typeof module !== 'undefined' && module.exports) module.exports = { KEY_BINDINGS, GP_BINDINGS };
