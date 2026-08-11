// §Speed Boost Zone (E6) — pure per-frame effect model for the SPEED_BOOSTER block OUTSIDE Speed Runner.
//
// The SPEED_BOOSTER block used to do nothing outside Speed Runner mode (only the `_sr` state machine read
// it), which is the "boost zone does nothing" report. This module is the shared, headless-testable core of
// the fix: a movement-speed MULTIPLIER the player carries while walking through a booster in Normal /
// Platformer / Arena play. Per-block config (right-click) chooses the mode + strength + duration.
//
// Two modes:
//   • temporary — while overlapping, the boost is held at full strength and its timer is refreshed; after
//     the player LEAVES the block it lingers `durSec` seconds, then snaps back to 1.
//   • permanent — once triggered it stays at full strength for the rest of the run (until reset()).
//
// state = { permMult, tempMult, tempFrames }; step() returns the EFFECTIVE multiplier (max of the two, so
// stacking a temp on top of a permanent never multiplies out of control).
const SPEED_BOOSTER_FX = {
  DEFAULTS: { mode: 'temp', amount: 0.5, durSec: 3 },

  // One frame for one player. `overlapping` = the booster's config (or the DEFAULTS) when the player is on
  // a SPEED_BOOSTER this frame, else null. `fps` lets tests use a small frame count.
  step(state, overlapping, fps = 60) {
    if (state.permMult == null) state.permMult = 1;
    if (state.tempMult == null) state.tempMult = 1;
    if (state.tempFrames == null) state.tempFrames = 0;
    if (overlapping) {
      const amt = overlapping.amount != null ? overlapping.amount : this.DEFAULTS.amount;
      if (overlapping.mode === 'perm') {
        state.permMult = Math.max(state.permMult, 1 + amt);
      } else {
        state.tempMult = 1 + amt;
        const durSec = overlapping.durSec != null ? overlapping.durSec : this.DEFAULTS.durSec;
        state.tempFrames = Math.max(1, Math.round(durSec * fps));
      }
    }
    // Countdown for the temporary boost (also runs on the frame it was just refreshed, which keeps it at
    // full strength while overlapping and starts the clock the moment the player steps off).
    if (state.tempFrames > 0) { state.tempFrames--; if (state.tempFrames === 0) state.tempMult = 1; }
    else state.tempMult = 1;
    return Math.max(state.permMult, state.tempMult);
  },

  // Fresh run / respawn — drop every accumulated boost.
  reset(state) { state.permMult = 1; state.tempMult = 1; state.tempFrames = 0; return 1; },
};

if (typeof window !== 'undefined') window.SPEED_BOOSTER_FX = SPEED_BOOSTER_FX;
if (typeof module !== 'undefined' && module.exports) module.exports = { SPEED_BOOSTER_FX };
