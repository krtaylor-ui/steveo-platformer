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
      // Player launches at top-left (320,200), size 20×52; anchor above/beside.
      const s = GRAPPLE.beginSwing(anchor[0], anchor[1], 320, 200, 20, 52, vx, -4);
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
  const s = GRAPPLE.beginSwing(300, 100, 340, 200, 20, 52, 10, -2);
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
  const s = GRAPPLE.beginSwing(300, 100, 340, 260, 20, 52, 8, 0);
  const arc0 = GRAPPLE.swingRadius(s);
  const len0 = s.len;
  for (let i = 0; i < 30; i++) GRAPPLE.rise(s);   // reel in
  const arc1 = GRAPPLE.swingRadius(s);
  ok(s.len < len0, `cable shortened (${len0.toFixed(0)} → ${s.len.toFixed(0)})`);
  ok(arc1 < arc0, `swing radius narrowed (${arc0.toFixed(0)} → ${arc1.toFixed(0)} px)`);
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

// 6 ── Swing Assist adds angular energy (§follow-up). 'lean' pushes toward the held
//      dir; 'pump' only boosts WITH the motion and scaled by cos(θ); 'none'/0 = no-op.
console.log('Invariant 6 — swing assist (lean/pump):');
{
  // lean adds toward the held direction regardless of current motion sign.
  const s1 = GRAPPLE.beginSwing(300, 100, 340, 260, 20, 52, 0, 0);   // theta>0 (right of anchor), angVel≈0
  const before = s1.angVel;
  GRAPPLE.accelerate(s1, 1, 'lean');
  ok(s1.angVel > before, `lean right increases angVel (${before.toFixed(4)} → ${s1.angVel.toFixed(4)})`);
  const s1b = GRAPPLE.beginSwing(300, 100, 340, 260, 20, 52, 0, 0);
  GRAPPLE.accelerate(s1b, -1, 'lean');
  ok(s1b.angVel < 0, 'lean left drives angVel negative');

  // pump boosts only WHEN pressing with the current motion.
  const sWith = GRAPPLE.beginSwing(300, 100, 340, 260, 20, 52, 8, 0);  // moving right (angVel>0)
  const wBefore = sWith.angVel;
  GRAPPLE.accelerate(sWith, 1, 'pump');
  ok(sWith.angVel > wBefore, 'pump WITH the motion adds energy');
  const sAgainst = GRAPPLE.beginSwing(300, 100, 340, 260, 20, 52, 8, 0); // moving right
  const aBefore = sAgainst.angVel;
  GRAPPLE.accelerate(sAgainst, -1, 'pump');
  ok(sAgainst.angVel === aBefore, 'pump AGAINST the motion is a no-op (must time it right)');

  // no-ops: dir 0, or an unknown mode.
  const s0 = GRAPPLE.beginSwing(300, 100, 340, 260, 20, 52, 8, 0);
  const z = s0.angVel;
  GRAPPLE.accelerate(s0, 0, 'lean');
  ok(s0.angVel === z, 'dir 0 → no change');
  GRAPPLE.accelerate(s0, 1, 'none');
  ok(s0.angVel === z, "mode 'none' → no change");

  // never exceeds the cap.
  const sCap = GRAPPLE.beginSwing(300, 100, 340, 260, 20, 52, 0, 0);
  for (let i = 0; i < 500; i++) GRAPPLE.accelerate(sCap, 1, 'lean');
  ok(sCap.angVel <= GRAPPLE.MAX_ANGVEL + 1e-9, `lean stays clamped to MAX_ANGVEL (${sCap.angVel.toFixed(4)})`);
}

// 7 ── Swing Assist STRENGTH scales the push (World Setting), and the ARC LIMIT stops the
//      swing looping over the top no matter how hard it's driven (§cleanup — lean was too strong).
console.log('Invariant 7 — assist strength + arc limit (no loop):');
{
  // strength scales the lean push linearly.
  const sA = GRAPPLE.beginSwing(300, 100, 340, 260, 20, 52, 0, 0);
  const sB = GRAPPLE.beginSwing(300, 100, 340, 260, 20, 52, 0, 0);
  const base0 = sA.angVel;
  GRAPPLE.accelerate(sA, 1, 'lean', 0.5);
  GRAPPLE.accelerate(sB, 1, 'lean', 1.0);
  const dA = sA.angVel - base0, dB = sB.angVel - base0;
  ok(Math.abs(dB - 2 * dA) < 1e-9, `strength 1.0 pushes 2× a 0.5 push (${dA.toFixed(4)} vs ${dB.toFixed(4)})`);

  // hammer the swing at full strength for a long time; |theta| must never pass the arc limit.
  const s = GRAPPLE.beginSwing(300, 100, 340, 260, 20, 52, 0, 0);
  let maxAbs = 0;
  for (let i = 0; i < 4000; i++) {
    GRAPPLE.accelerate(s, 1, 'lean', 2);        // drive hard, always to the right
    GRAPPLE.stepSwing(s, 0.66);
    maxAbs = Math.max(maxAbs, Math.abs(s.theta));
  }
  ok(maxAbs <= GRAPPLE.MAX_SWING_ANGLE + 1e-6, `theta never exceeds the arc limit (max |θ|=${maxAbs.toFixed(3)} ≤ ${GRAPPLE.MAX_SWING_ANGLE})`);
  ok(maxAbs < Math.PI, 'never swings over the top (|θ| < π) — no merry-go-round');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
