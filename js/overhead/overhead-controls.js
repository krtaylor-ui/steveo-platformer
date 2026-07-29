// ══════════════════════════════════════════════════════════════════════════
// Overhead Engine — three control schemes (§15). PURE resolution logic (no DOM);
// the runtime feeds a raw input snapshot and gets back a normalized intent. The
// actual key/button bindings integrate into the existing Controls-Config system
// as new named actions (ohMove*, ohAim*, ohFire, ohMelee, ohJump, ohAction) —
// this module is only the scheme MATH.
//
// Schemes:
//   1. move-to-aim — move + aim share one vector; dedicated fire/melee/jump/action
//      buttons. Smooth (default) vs angle-locked aim is a setting.
//   2. twin-stick  — separate move + aim vectors; aim-tilt AUTO-fires (per-weapon
//      flag). Melee still works (swings toward aim). Not the default; used by a
//      possible Bullet-Storm mode and by weapons that FORCE it while equipped.
//   3. free-aim    — DEFAULT. Move independent of aim; mouse/right-stick aim +
//      explicit fire (click / trigger).
//
// A universal ACTION button behaves identically in every scheme (chests, levers,
// enter buildings; NPCs later).
// ══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const SCHEMES = ['move-to-aim', 'twin-stick', 'free-aim'];
  const DEFAULT_SCHEME = 'free-aim';
  const AIM_STICK_DEADZONE = 0.35;   // twin-stick aim tilt that counts as "aiming/firing"

  const len = (v) => Math.hypot(v.x || 0, v.y || 0);
  function norm(v) { const l = len(v); return l > 1e-6 ? { x: v.x / l, y: v.y / l } : { x: 0, y: 0 }; }

  // Snap an angle (radians) to the nearest lockDeg increment (e.g. 45).
  function snapAngle(angle, lockDeg) {
    if (!lockDeg) return angle;
    const step = (lockDeg * Math.PI) / 180;
    return Math.round(angle / step) * step;
  }
  const angleOf = (v) => Math.atan2(v.y || 0, v.x || 0);
  const vecOf = (a) => ({ x: Math.cos(a), y: Math.sin(a) });

  // World-designer enforce vs player preference (mirrors the Theme override
  // pattern): a forced world scheme wins, else the player's preference, else default.
  function pickScheme(worldForced, playerPref) {
    if (SCHEMES.includes(worldForced)) return worldForced;
    if (SCHEMES.includes(playerPref)) return playerPref;
    return DEFAULT_SCHEME;
  }

  // A weapon may FORCE twin-stick while equipped (auto-fire weapons). Returns the
  // effective scheme + whether the override is active (runtime shows an indicator
  // + brief transition, per Kevin).
  function effectiveScheme(baseScheme, equippedWeapon) {
    if (equippedWeapon && equippedWeapon.forceTwinStick)
      return { scheme: 'twin-stick', overridden: true };
    return { scheme: SCHEMES.includes(baseScheme) ? baseScheme : DEFAULT_SCHEME, overridden: false };
  }

  // Resolve raw input → normalized intent for the active scheme.
  //   raw = { moveVec:{x,y}, aimVec:{x,y}, aimStickMag, fireBtn, fireHeld,
  //           meleeBtn, jumpBtn, actionBtn, lastAim:{x,y} }
  //   opts = { angleLockDeg (0=smooth), weaponAutoFire (bool) }
  // Returns { move:{x,y}, aim:{x,y}, aimAngle, fire, melee, jump, action }.
  function resolve(scheme, raw, opts) {
    raw = raw || {}; opts = opts || {};
    const move = norm(raw.moveVec || { x: 0, y: 0 });
    const jump = !!raw.jumpBtn;
    const action = !!raw.actionBtn;   // universal, scheme-independent
    let aim, fire, melee;

    if (scheme === 'move-to-aim') {
      // Aim follows movement (or the last non-zero move direction).
      let a = len(move) > 0 ? move : norm(raw.lastAim || { x: 1, y: 0 });
      if (opts.angleLockDeg) a = vecOf(snapAngle(angleOf(a), opts.angleLockDeg));
      aim = a;
      fire = !!(raw.fireBtn || raw.fireHeld);
      melee = !!raw.meleeBtn;
    } else if (scheme === 'twin-stick') {
      const mag = raw.aimStickMag != null ? raw.aimStickMag : len(raw.aimVec || { x: 0, y: 0 });
      let a = mag > AIM_STICK_DEADZONE ? norm(raw.aimVec) : norm(raw.lastAim || move);
      if (opts.angleLockDeg) a = vecOf(snapAngle(angleOf(a), opts.angleLockDeg));
      aim = a;
      // Auto-fire on aim tilt ONLY when the weapon opts in; otherwise explicit fire.
      const autoFire = opts.weaponAutoFire !== false;   // default auto for twin-stick
      fire = autoFire ? (mag > AIM_STICK_DEADZONE) : !!(raw.fireBtn || raw.fireHeld);
      melee = !!raw.meleeBtn;   // melee swings toward aim (strafing melee)
    } else {   // free-aim (default)
      let a = norm(raw.aimVec && len(raw.aimVec) > 0 ? raw.aimVec : (raw.lastAim || move));
      if (opts.angleLockDeg) a = vecOf(snapAngle(angleOf(a), opts.angleLockDeg));
      aim = a;
      fire = !!(raw.fireBtn || raw.fireHeld);   // explicit click / trigger
      melee = !!raw.meleeBtn;
    }
    return { move, aim, aimAngle: angleOf(aim), fire, melee, jump, action };
  }

  const OH_CONTROLS = {
    SCHEMES, DEFAULT_SCHEME, AIM_STICK_DEADZONE,
    snapAngle, angleOf, vecOf, norm,
    pickScheme, effectiveScheme, resolve,
  };

  if (typeof window !== 'undefined') window.OH_CONTROLS = OH_CONTROLS;
  if (typeof module !== 'undefined' && module.exports) module.exports = { OH_CONTROLS };
})();
