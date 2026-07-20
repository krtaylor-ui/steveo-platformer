// ============================================================
// grapple.js — Grappling Hook physics (§Phase 5), PURE + headless-testable
// ------------------------------------------------------------
// The MATH for the grapple lives here as pure functions so its invariants can be
// verified headless (the brief requires this BEFORE trusting the feel in a browser):
//   1. The swing never rises above the launch height  (player.y <= launchY, always).
//   2. Releasing mid-swing preserves the tangential velocity at release.
//   3. Rising along the cable narrows the swing's angular range.
//   4. Climb-over triggers ONLY for an exactly-1-block obstacle.
//   5. Casting auto-retracts when nothing solid is hit within range.
//
// Convention: the tracked reference point is the player's TOP-LEFT (px,py), so the
// height invariant compares directly to `player.y` — larger Y = lower on screen, so
// "never below launch height" == py <= launchY at every step. Angle θ is measured
// from straight-DOWN (θ=0 → hanging directly under the anchor): P = A + L·(sinθ, cosθ).
//
// game.js owns input, rendering, the level raycast predicate, and moving the real
// Player; it calls these helpers for the numbers. Everything here is deterministic.
// ============================================================

const GRAPPLE = {
  DEFAULT_RANGE_BLOCKS: 8,   // hook reach if nothing configured
  FIRE_SPEED: 22,            // hook tip travel (px/frame)
  FIRE_STEP: 6,              // raycast sub-step (px) — fine enough to catch a 1-cell wall
  SWING_DAMP: 0.992,         // per-frame angular damping
  BOUNCE: 0.86,              // energy kept when the swing clamps at launchY
  RISE_SPEED: 2.4,           // cable shorten per frame while pressing up (px)
  MIN_LEN: 40,               // shortest cable (≈1.25 blocks) — can't reel to zero
  MAX_ANGVEL: 0.22,          // cap angular velocity so a fast entry can't fling over the top

  // ── Cast (5a / 5e-5) ────────────────────────────────────────
  // March a straight ray from (sx,sy) along the UNIT dir (dx,dy) up to rangePx,
  // stopping at the first cell `isSolid(row,col)` reports true. Pure — `isSolid` is
  // injected. Returns { attached:true, x, y } at the stick point, or { attached:false }
  // (→ the caller auto-retracts). `blockSize` defaults to 32.
  castHook(isSolid, sx, sy, dx, dy, rangePx, blockSize = 32, step = GRAPPLE.FIRE_STEP) {
    const n = Math.max(1, Math.ceil(rangePx / step));
    let lastX = sx, lastY = sy;
    for (let i = 1; i <= n; i++) {
      const t = (i / n) * rangePx;
      const x = sx + dx * t, y = sy + dy * t;
      if (isSolid(Math.floor(y / blockSize), Math.floor(x / blockSize))) {
        return { attached: true, x: lastX, y: lastY };  // stop just BEFORE the solid cell
      }
      lastX = x; lastY = y;
    }
    return { attached: false };
  },

  // ── Swing (5c) ──────────────────────────────────────────────
  // Begin a pendulum from the player's entry state (top-left px,py + velocity vx,vy).
  beginSwing(ax, ay, px, py, vx, vy) {
    const dx = px - ax, dy = py - ay;
    const len = Math.max(GRAPPLE.MIN_LEN, Math.hypot(dx, dy));
    const theta = Math.atan2(dx, dy);            // from straight-down
    // Tangent (dP/dθ) = (cosθ, -sinθ); angular velocity = (v · tangent) / L.
    let angVel = (vx * Math.cos(theta) - vy * Math.sin(theta)) / len;
    angVel = Math.max(-GRAPPLE.MAX_ANGVEL, Math.min(GRAPPLE.MAX_ANGVEL, angVel));
    return { ax, ay, len, theta, angVel, launchY: py };
  },

  // Advance one frame under gravity; ENFORCE py <= launchY (invariant 1) by clamping
  // to the launch line and reflecting the angular velocity (a bounce). Returns the new
  // player top-left {x,y}. Mutates `s`.
  stepSwing(s, gravity) {
    s.angVel += -(gravity / s.len) * Math.sin(s.theta);
    s.angVel *= GRAPPLE.SWING_DAMP;
    s.angVel = Math.max(-GRAPPLE.MAX_ANGVEL, Math.min(GRAPPLE.MAX_ANGVEL, s.angVel));
    s.theta += s.angVel;
    let py = s.ay + s.len * Math.cos(s.theta);
    if (py > s.launchY) {                        // would dip BELOW launch height → clamp + bounce
      let k = (s.launchY - s.ay) / s.len;
      k = Math.max(-1, Math.min(1, k));
      s.theta = (s.theta < 0 ? -1 : 1) * Math.acos(k);
      s.angVel = -s.angVel * GRAPPLE.BOUNCE;
      py = s.launchY;
    }
    const px = s.ax + s.len * Math.sin(s.theta);
    return { x: px, y: py };
  },

  // ── Release (5c) ────────────────────────────────────────────
  // Velocity-preserved release: the body keeps the tangential velocity it had at the
  // moment of release; the caller then applies normal gravity. Returns {vx,vy}.
  releaseVelocity(s) {
    const spd = s.angVel * s.len;                // signed tangential speed
    return { vx: Math.cos(s.theta) * spd, vy: -Math.sin(s.theta) * spd };
  },

  // ── Rise along the cable (5d) ───────────────────────────────
  // Shorten the cable toward the anchor; the reachable arc NARROWS as L shrinks (the
  // clamp angle θmax = acos((launchY-ay)/L) shrinks with L). Returns the new length.
  rise(s, amount = GRAPPLE.RISE_SPEED) {
    s.len = Math.max(GRAPPLE.MIN_LEN, s.len - amount);
    return s.len;
  },
  // The half-arc angle (radians) the swing can reach before clamping at launchY, at the
  // current length. Smaller = narrower swing. (Used by tests + an optional debug viz.)
  swingHalfArc(s) {
    let k = (s.launchY - s.ay) / s.len;
    k = Math.max(-1, Math.min(1, k));
    return Math.acos(k);                          // θ at which py === launchY
  },

  // ── Climb-over (5d) ─────────────────────────────────────────
  // The scripted climb-over onto the platform triggers ONLY when the grabbed obstacle
  // is exactly 1 block tall; a taller obstacle means "no climb — disengage + drop".
  climbEligible(obstacleHeightBlocks) { return obstacleHeightBlocks === 1; },
};

if (typeof window !== 'undefined') window.GRAPPLE = GRAPPLE;
if (typeof module !== 'undefined' && module.exports) module.exports = { GRAPPLE };
