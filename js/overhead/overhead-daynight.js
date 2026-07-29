// ══════════════════════════════════════════════════════════════════════════
// Overhead Engine — Day / Night cycle. PURE + deterministic (headless-testable):
// given an elapsed-seconds counter it yields the time-of-day phase, an ambient
// sky overlay (colour + alpha), a human label, and gameplay hooks (mobs see a
// little farther at night). The runtime advances `elapsed`, tints the frame with
// `sky()`, and scales mob detection by `detectMultiplier()`. Enabled per-world via
// OH world settings; the map editor stays in daylight so it is easy to edit.
// Phase t ∈ [0,1): 0 = midnight · 0.25 = sunrise · 0.5 = noon · 0.75 = sunset.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const OH_DAYNIGHT = {
    // Wrap an elapsed-seconds counter into a phase, offset by a start phase.
    phase(elapsedSec, dayLengthSec, startPhase) {
      const len = dayLengthSec > 0 ? dayLengthSec : 120;
      let t = (startPhase || 0) + (elapsedSec / len);
      t -= Math.floor(t);                 // wrap into [0,1)
      return t;
    },

    // 0 = full daylight (noon), 1 = deepest dark (midnight). Raised-cosine so dawn
    // and dusk ramp smoothly rather than snapping.
    darkness(t) {
      const brightness = 0.5 - 0.5 * Math.cos(t * 2 * Math.PI);   // 0 @ midnight → 1 @ noon
      return 1 - brightness;                                      // 1 @ midnight → 0 @ noon
    },

    // Ambient overlay for the current phase: deep blue at night, a warm orange wash
    // through the narrow dawn/dusk windows, and fully clear (a≈0) at midday.
    sky(t, maxAlpha) {
      const maxA = maxAlpha != null ? maxAlpha : 0.6;
      const d = this.darkness(t);                                 // 0 day .. 1 night
      const dawn = Math.max(0, 1 - Math.abs(t - 0.25) / 0.08);
      const dusk = Math.max(0, 1 - Math.abs(t - 0.75) / 0.08);
      const warm = Math.max(dawn, dusk);                          // 0..1 sunrise/sunset glow
      let r = 12, g = 20, b = 54;                                 // night blue
      if (warm > 0) { r = 12 + warm * (235 - 12); g = 20 + warm * (120 - 20); b = 54 + warm * (40 - 54); }
      const a = Math.max(0, Math.min(maxA, d * maxA + warm * 0.18));
      return { r: r | 0, g: g | 0, b: b | 0, a };
    },

    // A short label for the on-screen clock.
    label(t) {
      if (t < 0.22 || t >= 0.80) return 'Night';
      if (t < 0.30) return 'Dawn';
      if (t < 0.70) return 'Day';
      return 'Dusk';
    },

    // Mobs detect a bit farther in the dark (up to +40% at midnight). Day = 1.0.
    detectMultiplier(t) { return 1 + 0.4 * this.darkness(t); },
  };

  if (typeof window !== 'undefined') window.OH_DAYNIGHT = OH_DAYNIGHT;
  if (typeof module !== 'undefined' && module.exports) module.exports = { OH_DAYNIGHT };
})();
