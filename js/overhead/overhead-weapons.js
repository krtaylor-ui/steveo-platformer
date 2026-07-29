// ══════════════════════════════════════════════════════════════════════════
// Overhead Engine — weapon projectile MATH (§13/§ items). PURE + headless-
// testable steppers. The runtime owns hit detection (via OH_COMBAT) and drawing;
// this owns the trajectories, so the boomerang's oval arc and the trident's
// throw-and-recall are provable, not eyeballed.
//
//   • Crossbow — a straight bolt: constant-velocity along the aim, capped range.
//   • Trident  — thrown straight; can be RECALLED (or auto-returns) and always
//     comes back to the player's CURRENT position (they may have moved).
//   • Boomerang — an OVAL arc: leaves the player, passes the aim/target point at
//     the far vertex of the ellipse (target clamped to maxRange), and curves back
//     to the player along the other side — one continuous loop, per the spec.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const DEFAULTS = {
    crossbowSpeed: 13,  crossbowRange: 460,
    tridentSpeed:  12,  tridentRange:  420,  tridentReturnSpeed: 15,
    boomerangSpeed: 12, boomerangMaxRange: 340, boomerangWidth: 0.42,
  };

  // ── Crossbow bolt ───────────────────────────────────────────────────────
  function startBolt(px, py, angle, cfg) {
    cfg = Object.assign({}, DEFAULTS, cfg || {});
    return { kind: 'bolt', x: px, y: py, ox: px, oy: py,
      vx: Math.cos(angle) * cfg.crossbowSpeed, vy: Math.sin(angle) * cfg.crossbowSpeed,
      range: cfg.crossbowRange, dead: false };
  }
  function stepBolt(s) {
    if (s.dead) return s;
    s.x += s.vx; s.y += s.vy;
    if (Math.hypot(s.x - s.ox, s.y - s.oy) >= s.range) s.dead = true;
    return s;
  }

  // ── Trident (throw + recall to the player's current position) ─────────────
  function startTrident(px, py, angle, cfg) {
    cfg = Object.assign({}, DEFAULTS, cfg || {});
    return { kind: 'trident', x: px, y: py, ox: px, oy: py, angle,
      vx: Math.cos(angle) * cfg.tridentSpeed, vy: Math.sin(angle) * cfg.tridentSpeed,
      range: cfg.tridentRange, returnSpeed: cfg.tridentReturnSpeed,
      state: 'out', caught: false };
  }
  function recallTrident(s) { if (s.state === 'out' || s.state === 'stuck') s.state = 'return'; return s; }
  // playerPos = live {x,y}. The trident auto-flips to return at max range; while
  // returning it homes on the player and is CAUGHT when it arrives.
  function stepTrident(s, playerPos) {
    if (s.caught) return s;
    if (s.state === 'out') {
      s.x += s.vx; s.y += s.vy;
      if (Math.hypot(s.x - s.ox, s.y - s.oy) >= s.range) s.state = 'return';
    } else if (s.state === 'stuck') {
      // waits for recall (embedded)
    } else { // return
      const dx = playerPos.x - s.x, dy = playerPos.y - s.y, d = Math.hypot(dx, dy) || 1;
      if (d <= s.returnSpeed) { s.x = playerPos.x; s.y = playerPos.y; s.caught = true; }
      else { s.x += (dx / d) * s.returnSpeed; s.y += (dy / d) * s.returnSpeed; }
    }
    return s;
  }

  // ── Boomerang (oval arc out to the aim point and back) ─────────────────────
  // Ellipse: major axis along the aim; near vertex = player, far vertex = target
  // (aim point, clamped to maxRange). Parameter φ runs -π → +π so the path starts
  // at the player, reaches the target at the midpoint (φ=0), and returns.
  function startBoomerang(px, py, angle, aimDist, cfg) {
    cfg = Object.assign({}, DEFAULTS, cfg || {});
    const L = Math.max(40, Math.min(cfg.boomerangMaxRange, aimDist || cfg.boomerangMaxRange));
    const a = L / 2;                          // semi-major
    const b = L * cfg.boomerangWidth;         // semi-minor (sideways bulge)
    const dx = Math.cos(angle), dy = Math.sin(angle);   // aim axis
    const px2 = -dy, py2 = dx;                          // perpendicular
    const cx = px + dx * a, cy = py + dy * a;           // ellipse center
    // Arc length ≈ Ramanujan; step by speed → dt per frame.
    const perim = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + b + 3 * b)));
    const dt = (cfg.boomerangSpeed) / (perim || 1);
    return { kind: 'boomerang', ox: px, oy: py, cx, cy, a, b, dx, dy, px2, py2,
      t: 0, dt, x: px, y: py, target: { x: px + dx * L, y: py + dy * L }, dead: false, side: 1 };
  }
  function boomerangPos(s, t) {
    const phi = -Math.PI + 2 * Math.PI * t;
    const ax = Math.cos(phi) * s.a, off = Math.sin(phi) * s.b * s.side;
    return { x: s.cx + s.dx * ax + s.px2 * off, y: s.cy + s.dy * ax + s.py2 * off };
  }
  // playerPos (optional): on the RETURN half (t>0.5) the path bends toward the
  // player's CURRENT position so the boomerang always comes home even if the
  // player moved — still circular early, correcting to home by t=1.
  function stepBoomerang(s, playerPos) {
    if (s.dead) return s;
    s.t += s.dt;
    if (s.t >= 1) { s.t = 1; s.dead = true; }   // returned to player
    const p = boomerangPos(s, s.t);
    let x = p.x, y = p.y;
    if (playerPos) {
      // The bare ellipse ends at the ORIGIN; blend that endpoint toward the live
      // player over the return half so it lands on them.
      const k = Math.max(0, Math.min(1, (s.t - 0.5) / 0.5));
      x += (playerPos.x - s.ox) * k; y += (playerPos.y - s.oy) * k;
    }
    s.x = x; s.y = y;
    return s;
  }

  const OH_WEAPONS = {
    DEFAULTS,
    startBolt, stepBolt,
    startTrident, recallTrident, stepTrident,
    startBoomerang, boomerangPos, stepBoomerang,
  };

  if (typeof window !== 'undefined') window.OH_WEAPONS = OH_WEAPONS;
  if (typeof module !== 'undefined' && module.exports) module.exports = { OH_WEAPONS };
})();
