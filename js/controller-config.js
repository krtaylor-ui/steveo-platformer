// ============================================================
// controller-config.js — Per-player controller configuration (Phase 16-E)
// Stores which gamepad slot belongs to which player and persists
// it in localStorage so assignments survive page reloads.
// ============================================================

const ControllerConfig = (() => {
  const STORAGE_KEY = 'steveo_ctrl_config_v1';

  // Default: Player 1 → KB1 (WASD+Space), Player 2 → gamepad slot 1
  // Slot -1 = KB1 (WASD+Space), -2 = KB2 (Arrows+Ins/Del), 0-3 = gamepad slot.
  let _assignments = { 1: -1, 2: 1 };

  function _load() {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (!s) return;
      const d = JSON.parse(s);
      if (d && typeof d.assignments === 'object') {
        _assignments = { ..._assignments, ...d.assignments };
      }
    } catch (_) {}
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ assignments: _assignments }));
    } catch (_) {}
  }

  // Returns the slot assigned to the given player: -1=KB1, -2=KB2, 0-3=gamepad.
  function getAssignment(playerNum) {
    const v = _assignments[playerNum];
    return (v !== undefined) ? v : (playerNum - 1);
  }

  function setAssignment(playerNum, gpSlot) {
    _assignments[playerNum] = gpSlot;
    save();
  }

  function getAll() { return { ..._assignments }; }

  _load();
  return { getAssignment, setAssignment, getAll, save };
})();
