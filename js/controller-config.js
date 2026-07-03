// ============================================================
// controller-config.js — Per-player controller configuration (Phase 16-E)
// Stores which gamepad slot belongs to which player, plus per-player stick
// sensitivity / aim sensitivity / deadzone, persisted in localStorage so the
// setup survives reloads. Sensitivity/deadzone are per-PLAYER (each controller
// user can tune their own) rather than a single global value.
// ============================================================

const ControllerConfig = (() => {
  const STORAGE_KEY = 'steveo_ctrl_config_v1';
  const DEF_DEADZONE = (typeof GP_DEADZONE_STICK !== 'undefined') ? GP_DEADZONE_STICK : 0.20;

  // Default: Player 1 → KB1 (WASD+Space), Player 2 → gamepad slot 1
  // Slot -1 = KB1 (WASD+Space), -2 = KB2 (Arrows+Ins/Del), 0-3 = gamepad slot.
  let _assignments = { 1: -1, 2: 1 };
  // Per-player controller tuning (player 1-4). Empty → defaults on read.
  let _sens = {};   // move sensitivity
  let _aim  = {};   // aim (right-stick) sensitivity
  let _dead = {};   // stick deadzone

  function _load() {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (!s) return;
      const d = JSON.parse(s);
      if (d && typeof d.assignments === 'object') _assignments = { ..._assignments, ...d.assignments };
      if (d && typeof d.sensitivities === 'object')    _sens = { ...d.sensitivities };
      if (d && typeof d.aimSensitivities === 'object') _aim  = { ...d.aimSensitivities };
      if (d && typeof d.deadzones === 'object')         _dead = { ...d.deadzones };
    } catch (_) {}
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        assignments: _assignments, sensitivities: _sens, aimSensitivities: _aim, deadzones: _dead,
      }));
    } catch (_) {}
  }

  // Returns the slot assigned to the given player: -1=KB1, -2=KB2, 0-3=gamepad.
  function getAssignment(playerNum) {
    const v = _assignments[playerNum];
    return (v !== undefined) ? v : (playerNum - 1);
  }
  function setAssignment(playerNum, gpSlot) { _assignments[playerNum] = gpSlot; save(); }

  function getSensitivity(p)     { return _sens[p] ?? 1.0; }
  function setSensitivity(p, v)  { _sens[p] = v; save(); }
  function getAimSensitivity(p)  { return _aim[p] ?? 1.0; }
  function setAimSensitivity(p, v){ _aim[p] = v; save(); }
  function getDeadzone(p)        { return _dead[p] ?? DEF_DEADZONE; }
  function setDeadzone(p, v)     { _dead[p] = v; save(); }

  function getAll() { return { ..._assignments }; }

  _load();
  return {
    getAssignment, setAssignment, getAll, save,
    getSensitivity, setSensitivity, getAimSensitivity, setAimSensitivity, getDeadzone, setDeadzone,
  };
})();
