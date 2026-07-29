// ══════════════════════════════════════════════════════════════════════════
// Overhead Engine — player movement: Jump + simple limb animation (§14). PURE,
// headless-testable.
//
// Overhead movement is on a 2D plane (smooth float world px, 8-directional).
// JUMP is a general, always-on ability (usable in every mode, incl. Speed Run):
//   • a timed up-then-down hop that visually LIFTS the sprite (parabola) while
//     horizontal movement continues — faster movement carries the jump further;
//   • it clears HAZARD/GAP ground at the SAME elevation; it does NOT vault solid
//     structural objects (confirmed with Kevin — hazard/gap only);
//   • elevation-crossing is governed by maxElevationJump (DEFAULT 0 = same level
//     only). NOT hardcoded — a future mode can raise the number without a rework;
//   • landing runs EDGE DETECTION: a gap/hazard/too-high-elevation landing is an
//     invalid landing (the player falls / takes the hazard);
//   • optional double jump adds height + a stylized flip flag.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const DEFAULTS = {
    jumpDur:        26,     // frames airborne for a base jump
    jumpHeight:     26,     // peak visual lift in px
    doubleDurBonus: 12,     // extra airborne frames a double jump adds
    doubleHeightBonus: 16,  // extra peak lift a double jump adds
    maxElevationJump: 0,    // levels a jump may cross (0 = same level only)
  };

  // Begin a jump. speed = the player's current planar move speed (px/frame); its
  // magnitude is baked into the airborne velocity so faster running jumps further.
  function startJump(cfg) {
    cfg = Object.assign({}, DEFAULTS, cfg || {});
    return {
      jumping: true, t: 0,
      dur: cfg.jumpDur, height: cfg.jumpHeight,
      vx: (cfg.moveX || 0), vy: (cfg.moveY || 0),   // planar air velocity carried from movement
      doubleUsed: false, flip: false,
      startElev: cfg.startElev | 0,
      maxElevationJump: cfg.maxElevationJump | 0,
    };
  }

  // Add a double jump mid-air (once). Extends the arc + flags the flip animation.
  function doubleJump(st, cfg) {
    cfg = Object.assign({}, DEFAULTS, cfg || {});
    if (!st.jumping || st.doubleUsed) return st;
    st.doubleUsed = true; st.flip = true;
    st.dur += cfg.doubleDurBonus;
    st.height += cfg.doubleHeightBonus;
    st.t = Math.min(st.t, st.dur * 0.35);   // give the double jump fresh air time
    return st;
  }

  // Advance one frame. Returns { landed:bool } — landed=true on the frame the hop
  // completes (the runtime then runs landingValid at the resting cell).
  function advanceJump(st) {
    if (!st.jumping) return { landed: false };
    st.t += 1;
    if (st.t >= st.dur) { st.jumping = false; return { landed: true }; }
    return { landed: false };
  }

  // Visual lift (px, >=0) at the current jump progress — a parabola peaking mid-hop.
  function jumpLift(st) {
    if (!st || !st.jumping) return 0;
    const p = st.dur > 0 ? st.t / st.dur : 1;         // 0..1
    return Math.max(0, 4 * st.height * p * (1 - p));  // parabola, peak = height at p=0.5
  }

  const canDoubleJump = (st) => !!(st && st.jumping && !st.doubleUsed);

  // Landing edge-detection. opts:
  //   { landingIsGap, landingIsHazard, landingIsSolidGround, elevDelta }
  // Returns { valid, reason }. A valid landing = solid ground, not a gap/hazard,
  // and within the jump's elevation cap.
  function landingValid(st, opts) {
    opts = opts || {};
    if (opts.landingIsGap)    return { valid: false, reason: 'gap' };
    if (opts.landingIsHazard) return { valid: false, reason: 'hazard' };
    const cap = (st && st.maxElevationJump != null) ? st.maxElevationJump : DEFAULTS.maxElevationJump;
    if (Math.abs(opts.elevDelta | 0) > cap) return { valid: false, reason: 'elevation' };
    if (opts.landingIsSolidGround === false) return { valid: false, reason: 'no-ground' };
    return { valid: true, reason: 'ok' };
  }

  // ── Simple overhead limb animation (§14 — best-effort, build-then-eval) ─────
  // Given accumulated travel distance + whether moving, return limb offsets a
  // top-down figure renderer can apply (arms/legs swing out of phase). Pure sines.
  function limbPhase(distanceTravelled, moving) {
    if (!moving) return { legL: 0, legR: 0, armL: 0, armR: 0, bob: 0 };
    const ph = (distanceTravelled / 14) % (Math.PI * 2);   // stride wavelength
    const s = Math.sin(ph), c = Math.sin(ph + Math.PI);
    return { legL: s * 3.2, legR: c * 3.2, armL: c * 2.4, armR: s * 2.4, bob: Math.abs(Math.sin(ph)) * 1.2 };
  }

  const OH_MOVE = {
    DEFAULTS, startJump, doubleJump, advanceJump, jumpLift, canDoubleJump, landingValid, limbPhase,
  };

  if (typeof window !== 'undefined') window.OH_MOVE = OH_MOVE;
  if (typeof module !== 'undefined' && module.exports) module.exports = { OH_MOVE };
})();
