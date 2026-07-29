// ══════════════════════════════════════════════════════════════════════════
// Overhead Engine — Day / Night cycle. PURE + deterministic (headless-testable):
// given an elapsed-seconds counter it yields the time-of-day phase, an ambient
// sky overlay (a SMOOTH cool wash — no warm dusk/dawn tint per Kevin), the sun/
// moon body position + altitude (for a faint tracking disc), the ground shadow
// vector cast by that body (used whether or not the disc is drawn), a human
// label, and a gameplay hook (mobs see farther at night). Nights can go nearly
// black so light sources (glowstone / lava) matter. Enabled per-world via OH
// world settings; the map editor stays in daylight so it is easy to edit.
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

    // 0 = full daylight (noon), 1 = deepest dark (midnight). Raised-cosine so the
    // transition between day and night is smooth rather than snapping.
    darkness(t) {
      const brightness = 0.5 - 0.5 * Math.cos(t * 2 * Math.PI);   // 0 @ midnight → 1 @ noon
      return 1 - brightness;                                      // 1 @ midnight → 0 @ noon
    },

    // Ambient overlay: a single cool blue whose ALPHA tracks darkness (clear at
    // midday, up to maxAlpha at midnight). No warm tint — a clean night↔day fade.
    sky(t, maxAlpha) {
      const maxA = maxAlpha != null ? maxAlpha : 0.6;
      const a = Math.max(0, Math.min(maxA, this.darkness(t) * maxA));
      return { r: 10, g: 16, b: 46, a };
    },

    // The sun (day) / moon (night) body: which one, its progress p across its own
    // half-cycle arc, its altitude (0 at rise/set → 1 at peak), and a screen
    // fraction {fx,fy} for drawing a faint disc (fx left→right, fy near the top).
    body(t) {
      const isDay = t >= 0.25 && t < 0.75;
      const p = isDay ? (t - 0.25) / 0.5 : ((t - 0.75 + 1) % 1) / 0.5;   // 0..1 across the arc
      const altitude = Math.sin(Math.max(0, Math.min(1, p)) * Math.PI);   // 0..1
      return { isDay, p, altitude, fx: p, fy: 0.10 + (1 - altitude) * 0.20 };
    },

    // Ground shadow vector CAST by the body, in "block-lengths per elevation level"
    // (the runtime multiplies by cell × elevation). Long + sideways when the body is
    // low (dawn/dusk/deep night), short + straight-down near peak. Independent of
    // whether the disc is drawn. Returns {x,y,alpha}.
    shadow(t) {
      const b = this.body(t);
      const len = 0.35 + (1 - b.altitude) * 1.5;      // long at low altitude
      const x = (0.5 - b.p) * 2 * len;                // + toward +x early, − late (body sweeps L→R)
      const y = (0.55 + 0.45 * (1 - b.altitude)) * len;   // always some southward drop
      const alpha = 0.18 + 0.22 * b.altitude;         // crisper by day, softer at night
      return { x, y, alpha };
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
