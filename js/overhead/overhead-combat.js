// ══════════════════════════════════════════════════════════════════════════
// Overhead Engine — combat (§13). PURE hit-detection, headless-testable. A
// genuinely SEPARATE system from side-view: cone / radius / line hit tests
// against an aim ANGLE, not the side-view arc-swing physics. Reuses weapon
// trait CONCEPTS (damage, multi-hit caps) without forcing mechanical unity.
//
// Targets are { x, y, r } (world px + collision radius). The attacker is a point
// { x, y } aiming along aimAngle (radians).
// ══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  function angDiff(a, b) {
    let d = (a - b) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return Math.abs(d);
  }

  // Cone melee/attack: targets within `reach` px and within `halfAngle` of the
  // aim direction. Sorted nearest-first. maxHits caps multi-hit (0/undefined = all).
  function coneHit(origin, aimAngle, targets, opts) {
    opts = opts || {};
    const reach = opts.reach || 80;
    const half = opts.halfAngle != null ? opts.halfAngle : Math.PI / 4;   // 45° default
    const out = [];
    for (const t of targets || []) {
      const dx = t.x - origin.x, dy = t.y - origin.y;
      const dist = Math.hypot(dx, dy);
      if (dist > reach + (t.r || 0)) continue;
      if (dist > 1e-6 && angDiff(Math.atan2(dy, dx), aimAngle) > half) continue;
      out.push({ target: t, dist });
    }
    out.sort((a, b) => a.dist - b.dist);
    const cap = opts.maxHits | 0;
    return (cap > 0 ? out.slice(0, cap) : out).map((h) => h.target);
  }

  // Radius blast (explosions / support auras / point-blank): all targets whose
  // center is within `radius` (+ their own r) of the center point.
  function radiusHit(center, targets, radius) {
    const out = [];
    for (const t of targets || []) {
      if (Math.hypot(t.x - center.x, t.y - center.y) <= radius + (t.r || 0)) out.push(t);
    }
    return out;
  }

  // Straight-line projectile step test (for towers/guns): does the segment from
  // p0 to p1 pass within `width` of a target? Returns the FIRST target hit along
  // the segment (nearest to p0), or null.
  function lineHit(p0, p1, targets, width) {
    width = width || 8;
    const vx = p1.x - p0.x, vy = p1.y - p0.y;
    const segLen2 = vx * vx + vy * vy || 1e-6;
    let best = null, bestT = Infinity;
    for (const t of targets || []) {
      const wx = t.x - p0.x, wy = t.y - p0.y;
      let u = (wx * vx + wy * vy) / segLen2;
      u = Math.max(0, Math.min(1, u));
      const cx = p0.x + u * vx, cy = p0.y + u * vy;
      const d = Math.hypot(t.x - cx, t.y - cy);
      if (d <= width + (t.r || 0) && u < bestT) { best = t; bestT = u; }
    }
    return best;
  }

  // Resolve damage for one hit, reusing trait concepts (flat + optional falloff).
  function resolveDamage(weapon, target, dist) {
    weapon = weapon || {};
    let dmg = weapon.damage || 1;
    if (weapon.falloff && weapon.reach) dmg *= Math.max(0.25, 1 - (dist || 0) / weapon.reach * weapon.falloff);
    return Math.max(0, Math.round(dmg));
  }

  // Nearest target of a given team (towers/minions). teamOf(t) -> team tag.
  function nearestEnemy(origin, targets, myTeam, teamOf) {
    let best = null, bestD = Infinity;
    for (const t of targets || []) {
      if (teamOf(t) === myTeam) continue;
      const d = Math.hypot(t.x - origin.x, t.y - origin.y);
      if (d < bestD) { best = t; bestD = d; }
    }
    return best;
  }

  const OH_COMBAT = { angDiff, coneHit, radiusHit, lineHit, resolveDamage, nearestEnemy };

  if (typeof window !== 'undefined') window.OH_COMBAT = OH_COMBAT;
  if (typeof module !== 'undefined' && module.exports) module.exports = { OH_COMBAT };
})();
