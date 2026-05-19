// ============================================================
// controller-input.js — Per-player input routing (Phase 16-E)
// Routes gamepad input to the correct player based on assignments
// stored in ControllerConfig. All methods are safe to call even
// when ControllerConfig is not yet initialized (graceful fallback).
// ============================================================

const ControllerInput = (() => {

  // Returns the raw gamepad snapshot for a given player number (1-based).
  function getGamepad(inputManager, playerNum) {
    const slot = _slot(playerNum);
    if (slot < 0 || slot > 3) return inputManager._emptyGamepad(0);
    return inputManager.gamepads[slot] || inputManager._emptyGamepad(slot);
  }

  // One-shot just-pressed check using the player's assigned gamepad slot.
  function justDown(inputManager, playerNum, btn) {
    const slot = _slot(playerNum);
    if (slot < 0 || slot > 3) return false;
    return inputManager.gpJustDown(slot, btn);
  }

  // Scans all connected gamepads and returns the slot index of the first one
  // that just pressed the attack button, or -1 if none.
  function detectAttackPress(inputManager) {
    for (let i = 0; i < 4; i++) {
      const gp  = inputManager.gamepads[i];
      const prv = inputManager._gpPrev[i];
      if (gp.connected && gp.attack && prv && !prv.attack) return i;
    }
    return -1;
  }

  // ── Internal helper ───────────────────────────────────────
  function _slot(playerNum) {
    if (typeof ControllerConfig !== 'undefined') {
      return ControllerConfig.getAssignment(playerNum);
    }
    return playerNum - 1; // fallback
  }

  return { getGamepad, justDown, detectAttackPress };
})();
