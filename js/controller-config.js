// ============================================================
// controller-config.js — Per-player controller configuration (Phase 16-E)
// Stores which gamepad slot belongs to which player, plus per-player stick
// sensitivity / aim sensitivity / deadzone, persisted in localStorage so the
// setup survives reloads. Sensitivity/deadzone are per-PLAYER (each controller
// user can tune their own) rather than a single global value.
// ============================================================

const ControllerConfig = (() => {
  const STORAGE_KEY = 'steveo_ctrl_config_v2';
  const OLD_KEY = 'steveo_ctrl_config_v1';
  const DEF_DEADZONE = (typeof GP_DEADZONE_STICK !== 'undefined') ? GP_DEADZONE_STICK : 0.20;
  const MODES = (typeof CONTROL_MODES !== 'undefined') ? CONTROL_MODES : ['platformer', 'normal', 'speedrunner', 'arena', 'sandbox'];

  // Assignments (which gamepad slot = which player) are HARDWARE setup → global, not per-mode.
  // Slot -1 = KB1 (WASD+Space), -2 = KB2 (Arrows+Ins/Del), 0-3 = gamepad slot.
  let _assignments = { 1: -1, 2: 1 };
  // §Controls Profiles — stick tuning is now PER-MODE: byMode[mode] = { sens, aim, dead } (each
  // a per-player map). The active mode is set each frame via setMode().
  let _byMode = {};
  let _mode = 'normal';

  function _slice(m) {
    if (!_byMode[m]) _byMode[m] = { sens: {}, aim: {}, dead: {} };
    return _byMode[m];
  }
  function setMode(m) { _mode = MODES.includes(m) ? m : 'normal'; return _mode; }

  function _load() {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s) {
        const d = JSON.parse(s);
        if (d && typeof d.assignments === 'object') _assignments = { ..._assignments, ...d.assignments };
        if (d && typeof d.byMode === 'object') _byMode = d.byMode;
        return;
      }
      // Migrate the flat v1 tuning into every mode.
      const old = localStorage.getItem(OLD_KEY);
      if (old) {
        const d = JSON.parse(old);
        if (d && typeof d.assignments === 'object') _assignments = { ..._assignments, ...d.assignments };
        for (const m of MODES) _byMode[m] = {
          sens: (d && d.sensitivities) ? { ...d.sensitivities } : {},
          aim:  (d && d.aimSensitivities) ? { ...d.aimSensitivities } : {},
          dead: (d && d.deadzones) ? { ...d.deadzones } : {},
        };
      }
    } catch (_) {}
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ assignments: _assignments, byMode: _byMode })); } catch (_) {}
  }

  // Returns the slot assigned to the given player: -1=KB1, -2=KB2, 0-3=gamepad.
  function getAssignment(playerNum) {
    const v = _assignments[playerNum];
    return (v !== undefined) ? v : (playerNum - 1);
  }
  function setAssignment(playerNum, gpSlot) { _assignments[playerNum] = gpSlot; save(); }

  function getSensitivity(p)     { return _slice(_mode).sens[p] ?? 1.0; }
  function setSensitivity(p, v)  { _slice(_mode).sens[p] = v; save(); }
  function getAimSensitivity(p)  { return _slice(_mode).aim[p] ?? 1.0; }
  function setAimSensitivity(p, v){ _slice(_mode).aim[p] = v; save(); }
  function getDeadzone(p)        { return _slice(_mode).dead[p] ?? DEF_DEADZONE; }
  function setDeadzone(p, v)     { _slice(_mode).dead[p] = v; save(); }

  function getAll() { return { ..._assignments }; }

  // §Controls Profiles — export/import a mode's stick tuning (used by CONTROL_PROFILES).
  function exportSticks(m) { const s = _slice(m || _mode); return { sens: { ...s.sens }, aim: { ...s.aim }, dead: { ...s.dead } }; }
  function importSticks(obj, m) {
    const t = _slice(m || _mode);
    t.sens = (obj && obj.sens) ? { ...obj.sens } : {};
    t.aim  = (obj && obj.aim)  ? { ...obj.aim }  : {};
    t.dead = (obj && obj.dead) ? { ...obj.dead } : {};
    save();
  }
  function copyMode(src, dest) { _byMode[dest] = JSON.parse(JSON.stringify(_slice(src))); save(); }

  _load();
  return {
    getAssignment, setAssignment, getAll, save, setMode,
    getSensitivity, setSensitivity, getAimSensitivity, setAimSensitivity, getDeadzone, setDeadzone,
    exportSticks, importSticks, copyMode,
  };
})();
