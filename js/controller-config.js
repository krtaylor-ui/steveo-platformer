// ============================================================
// controller-config.js — Per-player controller configuration (Phase 16-E)
// Stores which gamepad slot belongs to which player and persists
// it in localStorage so assignments survive page reloads.
// ============================================================

const ControllerConfig = (() => {
  const STORAGE_KEY = 'steveo_ctrl_config_v1';

  // Default: Player 1 → gamepad slot 0, Player 2 → gamepad slot 1
  // Slot -1 means keyboard/mouse only.
  let _assignments = { 1: 0, 2: 1 };

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

  // Returns the gamepad slot (0-3) assigned to the given player number (1-4).
  // Returns -1 if the player uses keyboard/mouse.
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
