// Headless tests for the §Phase 5 Grappling-Hook invariants (the brief REQUIRES these
// before trusting the swing feel in a browser). Pure module — require directly.
const { GRAPPLE } = require('../js/grapple.js');
const GRAVITY = 0.66;   // matches constants.js

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

// 1 ── Swing never exceeds launch height (py <= launchY at EVERY step), for a range of
//      entry velocities and anchor placements.
console.log('Invariant 1 — swing never drops below launch height (py <= launchY):');
{
  let worst = -Infinity, violations = 0, checked = 0;
  for (const vx of [-12, -6, 0, 6, 12, 20]) {
    for (const anchor of [[300, 100], [360, 60], [260, 40], [340, 120]]) {
      // Player launches at (px=320, py=200); anchor above/beside.
      const s = GRAPPLE.beginSwing(anchor[0], anchor[1], 320, 200, vx, -4);
      for (let f = 0; f < 600; f++) {
        const p = GRAPPLE.stepSwing(s, GRAVITY);
        checked++;
        if (p.y > s.launchY + 1e-6) { violations++; worst = Math.max(worst, p.y - s.launchY); }
      }
    }
  }
  ok(violations === 0, `no step ever went below launchY (violations=${violations}, worstDip=${worst === -Infinity ? 0 : worst.toFixed(3)})`);
  ok(checked > 10000, 'exercised many steps across velocities/anchors');
}

// 2 ── Releasing mid-swing preserves the tangential velocity at release (magnitude +
//      direction), then normal gravity takes over (caller-applied — we check the handoff).
console.log('Invariant 2 — release preserves tangential velocity:');
{
  const s = GRAPPLE.beginSwing(300, 100, 340, 200, 10, -2);
  for (let f = 0; f < 12; f++) GRAPPLE.stepSwing(s, GRAVITY);
  const rel = GRAPPLE.releaseVelocity(s);
  // Expected tangential velocity from the current state.
  const expVx = Math.cos(s.theta) * s.angVel * s.len;
  const expVy = -Math.sin(s.theta) * s.angVel * s.len;
  ok(Math.abs(rel.vx - expVx) < 1e-9 && Math.abs(rel.vy - expVy) < 1e-9, 'release vector equals the tangential velocity');
  const speed = Math.hypot(rel.vx, rel.vy);
  ok(speed > 0, `carries real momentum out of the swing (|v|=${speed.toFixed(2)})`);
  // Direction is perpendicular to the cable (tangent ⟂ radius).
  const radx = Math.sin(s.theta), rady = Math.cos(s.theta);
  const dot = rel.vx * radx + rel.vy * rady;
  ok(Math.abs(dot) < 1e-6, 'release velocity is perpendicular to the cable (a true tangent)');
}

// 3 ── Rising along the cable narrows the swing's angular range.
console.log('Invariant 3 — reeling in narrows the arc:');
{
  const s = GRAPPLE.beginSwing(300, 100, 340, 260, 8, 0);
  const arc0 = GRAPPLE.swingHalfArc(s);
  const len0 = s.len;
  for (let i = 0; i < 30; i++) GRAPPLE.rise(s);   // reel in
  const arc1 = GRAPPLE.swingHalfArc(s);
  ok(s.len < len0, `cable shortened (${len0.toFixed(0)} → ${s.len.toFixed(0)})`);
  ok(arc1 < arc0, `arc narrowed (${arc0.toFixed(3)} → ${arc1.toFixed(3)} rad)`);
  ok(s.len >= GRAPPLE.MIN_LEN, 'cable never reels below the minimum length');
}

// 4 ── Climb-over only for an exactly-1-block obstacle.
console.log('Invariant 4 — climb-over gated to a 1-block obstacle:');
{
  ok(GRAPPLE.climbEligible(1) === true, '1-block obstacle → climb-over');
  ok(GRAPPLE.climbEligible(2) === false, '2-block obstacle → no climb');
  ok(GRAPPLE.climbEligible(3) === false, '3-block obstacle → no climb');
  ok(GRAPPLE.climbEligible(0) === false, '0 → no climb');
}

// 5 ── Auto-retract when nothing solid is hit within range.
console.log('Invariant 5 — cast attaches on a hit, retracts on a miss:');
{
  const B = 32;
  // A wall at column 20 (x in [640,672)). Fire right from x=100 with 8-block range (256px)
  // → tip reaches ~356, no wall → miss.
  const wallAt20 = (row, col) => col >= 20;
  const miss = GRAPPLE.castHook(wallAt20, 100, 100, 1, 0, 8 * B, B);
  ok(miss.attached === false, 'nothing within range → not attached (auto-retract)');
  // Fire right with a wall at column 5 (x≈160) well within range → hit.
  const wallAt5 = (row, col) => col >= 5;
  const hit = GRAPPLE.castHook(wallAt5, 100, 100, 1, 0, 8 * B, B);
  ok(hit.attached === true, 'a solid within range → attached');
  ok(hit.x >= 100 && hit.x < 5 * B, `sticks just before the wall (x=${hit.x.toFixed(0)}, wall at ${5 * B})`);
  // Straight-up cast (aim-up) hits a ceiling at row 1.
  const ceil = (row, col) => row <= 1;
  const up = GRAPPLE.castHook(ceil, 100, 200, 0, -1, 8 * B, B);
  ok(up.attached === true, 'a straight-up cast attaches to a ceiling');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
