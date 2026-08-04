// ============================================================
// mobs.js — Enemy types, projectiles, damage numbers, loot, MobManager
// ============================================================

// ── Shared physics helper (mirrors player physics) ──────────

function _mobPhysics(mob, level) {
  // Gravity
  mob.vy = Math.min(mob.vy + GRAVITY, MAX_FALL_SPEED);

  mob.onGround = false;

  // Vertical
  if (mob.vy >= 0) {
    const newY  = mob.y + mob.vy;
    const bL    = Math.floor((mob.x + 2)            / BLOCK_SIZE);
    const bR    = Math.floor((mob.x + mob.width - 2) / BLOCK_SIZE);
    const bRow  = Math.floor((newY + mob.height)    / BLOCK_SIZE);
    if (level.isSolid(bRow, bL) || level.isSolid(bRow, bR)) {
      mob.y        = bRow * BLOCK_SIZE - mob.height;
      mob.vy       = 0;
      mob.onGround = true;
    } else { mob.y = newY; }
  } else {
    const newY  = mob.y + mob.vy;
    const bL    = Math.floor((mob.x + 2)            / BLOCK_SIZE);
    const bR    = Math.floor((mob.x + mob.width - 2) / BLOCK_SIZE);
    const bRow  = Math.floor(newY / BLOCK_SIZE);
    if (level.isSolid(bRow, bL) || level.isSolid(bRow, bR)) {
      mob.y  = (bRow + 1) * BLOCK_SIZE;
      mob.vy = 0;
    } else { mob.y = newY; }
  }

  // Horizontal — with 1-block step-up. speedMult scales movement (arena: ×2, +per
  // survival wave) without changing mob.vx (used for facing/animation). Phase 3A.3.
  // Smart Mobs §7 — _sprintBoost layers the telegraphed sprint burst on top.
  const sm = (mob.speedMult || 1) * (mob._sprintBoost || 1);
  if (mob.vx > 0) {
    const newX    = mob.x + mob.vx * sm;
    const bCol    = Math.floor((newX + mob.width) / BLOCK_SIZE);
    const bRowT   = Math.floor((mob.y + 2)              / BLOCK_SIZE);
    const bRowB   = Math.floor((mob.y + mob.height - 2) / BLOCK_SIZE);
    const blockedT = level.isSolid(bRowT, bCol);
    const blockedB = level.isSolid(bRowB, bCol);
    if (blockedB && !blockedT && mob.onGround) {
      mob.y -= BLOCK_SIZE;   // step up one block
      mob.x  = newX;
    } else if (blockedT || blockedB) {
      mob.x  = bCol * BLOCK_SIZE - mob.width;
      mob.vx = 0;
    } else { mob.x = newX; }
  } else if (mob.vx < 0) {
    const newX    = mob.x + mob.vx * sm;
    const bCol    = Math.floor(newX / BLOCK_SIZE);
    const bRowT   = Math.floor((mob.y + 2)              / BLOCK_SIZE);
    const bRowB   = Math.floor((mob.y + mob.height - 2) / BLOCK_SIZE);
    const blockedT = level.isSolid(bRowT, bCol);
    const blockedB = level.isSolid(bRowB, bCol);
    if (blockedB && !blockedT && mob.onGround) {
      mob.y -= BLOCK_SIZE;   // step up one block
      mob.x  = newX;
    } else if (blockedT || blockedB) {
      mob.x  = (bCol + 1) * BLOCK_SIZE;
      mob.vx = 0;
    } else { mob.x = newX; }
  }
}

// ── Perf instrumentation (triage) — count + time A* calls per frame across all mobs.
// Reset by MobManager.update; surfaced to the game's perf HUD. Cheap; browser-only timing.
const _MOB_PATH_STATS = { calls: 0, ms: 0 };
const _mobNow = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;

// ── Base Mob ─────────────────────────────────────────────────

class Mob {
  constructor(x, y, w, h, hp) {
    this.id      = ++Mob._nextId;
    this.x       = x;  this.y  = y;
    this.vx      = 0;  this.vy = 0;
    this.width   = w;  this.height = h;
    this.hp      = hp; this.maxHp  = hp;
    this.onGround  = false;
    this.facing    = -1;
    this.hitCooldown    = 0;   // i-frames after being hit
    this.knockbackTimer = 0;   // frames where AI is suppressed
    this.walkTimer = 0;
    this.alive = true;
    this.meleeDamage = 2;     // default contact damage — overridden by subclasses (Phase 12)

    // Ambient sound: play once when mob first enters camera view, reset when it leaves
    this.soundPlayed = false;

    // Wander / chase state
    this.state             = 'wander';
    this.wanderDir         = Math.random() < 0.5 ? -1 : 1;
    this.wanderChangeTimer = 180 + Math.floor(Math.random() * 120); // 3-5 s
    this.stuckCheckTimer   = 600;  // 10 s
    this.stuckCheckX       = x + w / 2;
    this.spawnCX           = x + w / 2;
    this.spawnY            = y;

    // Smart Mobs §4 — detection. `_detect` = the shared detection config (set by the
    // MobManager each frame from world settings; null/disabled = legacy behavior).
    // `_alerted` latches true once this mob has detected the player via any enabled
    // axis (sight/sound/action); the instant-per-axis model keeps it sticky (the
    // decaying Suspicion Meter is the separate, deferred §18). §5 pack behavior reads
    // `_alerted` + `_alertSource` to propagate alerts to nearby mobs.
    this._detect      = null;
    this._alerted     = false;
    this._alertSource = null;
  }

  get cx() { return this.x + this.width  / 2; }
  get cy() { return this.y + this.height / 2; }

  serialize() {
    return {
      id:          this.id,
      type:        this.constructor.name,
      x:           this.x,  y: this.y,
      w:           this.width,  h: this.height,
      hp:          this.hp,  maxHp: this.maxHp,
      alive:       this.alive,
      flipped:     this.facing > 0,
      state:       this.state,
      walkTimer:   this.walkTimer,
      hitCooldown: this.hitCooldown,
      // Creeper pre-detonation state (undefined/0 for other mobs) so joiners can
      // render the swell/flash animation before it explodes.
      fusing:      this.fusing || false,
      fuseTimer:   this.fuseTimer || 0,
    };
  }

  // Returns true if damage was applied. kbMult scales knockback (Smart Mobs §2 —
  // e.g. the Axe's heavy knockback trait); defaults to 1 for all existing callers.
  takeDamage(amount, knockDir = 0, kbMult = 1) {
    if (this.hitCooldown > 0) return false;
    this.hp -= amount;
    this.hitCooldown    = IFRAMES;
    this.knockbackTimer = 12;
    if (knockDir !== 0) {
      this.vx = knockDir * KNOCKBACK_FORCE * kbMult;
      this.vy = -3.5 * (kbMult >= 1 ? Math.min(kbMult, 1.6) : 1);
    }
    if (this.hp <= 0) { this.hp = 0; this.alive = false; }
    return true;
  }

  _touchesPlayer(p) {
    return this.x < p.x + p.width  && this.x + this.width  > p.x &&
           this.y < p.y + p.height && this.y + this.height > p.y;
  }

  // ── Jump-attack / stomp (world setting `jumpAttack`) ────────────────────────
  // True when player `p` is DESCENDING (vy>0, Y-down) onto this mob's head.
  _isStomp(p) {
    if (p.vy <= 0 || !this.alive) return false;
    // A stomp requires the player to be genuinely FALLING onto the mob. `vy > 0` alone was
    // too loose: a grounded player can carry a small positive vy from the gravity tick before
    // the ground clamp, so walking into a Goomba or a sliding Shell sometimes resolved as a
    // stomp instead of damage (QA F17 — "stomp only when falling" is the documented rule).
    // Also excludes the exact frame of landing, which must count as contact.
    if (p.onGround || p.vy <= 1) return false;
    if (!this._touchesPlayer(p)) return false;
    return (p.y + p.height) - this.y <= this.height * 0.6 + Math.max(4, p.vy);   // feet in the upper part
  }
  // Bounce the player back up off the mob (higher if the jump key is held — Mario-style).
  _stompBounce(p) { p.vy = (p.jumpHeld || p.holdingJump) ? JUMP_VELOCITY : -11; p.onGround = false; }
  // Default reaction: a stomp knocks a normal enemy out in one hit. Overridden by Goomba/Koopa.
  onStomp(mgr, p) { this._stompBounce(p); this.hitCooldown = 0; this.takeDamage(9999, 0); if (mgr && mgr._onStomp) mgr._onStomp(this); }
  // Flatten-then-die. The manager loop counts `_squishT` down and reaps at 0 (normal death → drops/XP).
  squish(mgr) { if (!this.alive || (this._squishT | 0) > 0) return; this._squishT = 18; this.vx = 0; this.vy = 0; this.state = 'squish'; if (mgr && mgr._onStomp) mgr._onStomp(this); }

  _tickTimers() {
    if (this.hitCooldown    > 0) this.hitCooldown--;
    if (this.knockbackTimer > 0) { this.knockbackTimer--; this.vx *= 0.80; }
  }

  _drawHealthBar(ctx, sx, sy) {
    const bw = 34, bh = 5;
    const bx = sx + (this.width - bw) / 2;
    const by = sy - 12;
    ctx.fillStyle = '#550000';
    ctx.fillRect(bx, by, bw, bh);
    const pct = this.hp / this.maxHp;
    ctx.fillStyle = pct > 0.5 ? '#22CC22' : pct > 0.25 ? '#CCCC00' : '#CC2222';
    ctx.fillRect(bx, by, Math.round(bw * pct), bh);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(bx, by, bw, bh);
  }

  _wanderUpdate(level, speed) {
    const WANDER_RANGE = 100 * BLOCK_SIZE; // leash radius from spawn

    // Countdown to next random direction change
    if (--this.wanderChangeTimer <= 0) {
      this.wanderDir         = Math.random() < 0.5 ? -1 : 1;
      this.wanderChangeTimer = 180 + Math.floor(Math.random() * 120);
    }

    // Spawn leash — redirect toward spawn if too far
    const distFromSpawn = this.cx - this.spawnCX;
    if (distFromSpawn >  WANDER_RANGE) this.wanderDir = -1;
    if (distFromSpawn < -WANDER_RANGE) this.wanderDir =  1;

    // Edge and gap detection (only when on ground to avoid mid-air decisions)
    if (this.onGround) {
      const lookX    = this.wanderDir > 0 ? this.x + this.width + 2 : this.x - 2;
      const frontCol = Math.floor(lookX / BLOCK_SIZE);
      const gndRow   = Math.floor((this.y + this.height + 4) / BLOCK_SIZE);

      if (!level.isSolid(gndRow, frontCol)) {
        // No ground directly ahead — check if it's a 1-block-wide gap
        const farCol = this.wanderDir > 0 ? frontCol + 1 : frontCol - 1;
        if (level.isSolid(gndRow, farCol)) {
          this.vy = JUMP_VELOCITY * 0.8; // jump the 1-block gap
        } else {
          this.wanderDir         = -this.wanderDir; // wider gap — turn around
          this.wanderChangeTimer = 60 + Math.floor(Math.random() * 60);
        }
      }
    }

    // Wall collision detection — proactively reverse before physics zeros vx
    const wallX   = this.wanderDir > 0 ? this.x + this.width + 1 : this.x - 1;
    const wallCol = Math.floor(wallX / BLOCK_SIZE);
    const wallRow = Math.floor((this.y + this.height * 0.55) / BLOCK_SIZE);
    if (level.isSolid(wallRow, wallCol)) {
      this.wanderDir         = -this.wanderDir;
      this.wanderChangeTimer = 60 + Math.floor(Math.random() * 60);
    }

    // Stuck detection: if barely moved over 10 s, teleport to spawn
    if (--this.stuckCheckTimer <= 0) {
      if (Math.abs(this.cx - this.stuckCheckX) < 16) {
        this.x  = this.spawnCX - this.width / 2;
        this.y  = this.spawnY;
        this.vx = 0;
        this.vy = 0;
        this.wanderDir = Math.random() < 0.5 ? -1 : 1;
      }
      this.stuckCheckX     = this.cx;
      this.stuckCheckTimer = 600;
    }

    this.vx     = this.wanderDir * speed;
    this.facing = this.wanderDir;
  }

  // Smart Mobs §4 — detection gate. When smart detection is OFF (or unset) a mob uses
  // its legacy distance aggro (chase whenever the player is in range) — so existing
  // worlds are unchanged. When ON, a mob only chases once it has DETECTED the player
  // (`_alerted`); until then it wanders. Every mob's chase decision routes through this.
  _shouldChase() {
    const d = this._detect;
    return !d || !d.enabled || this._alerted;
  }

  // Smart Mobs §8 — flee at low HP. `_flee` = this mob type's { action, threshold }
  // (set by the manager from world settings). The response is a VARIABLE (`action`)
  // built so new low-HP behaviors can be added later; only 'flee' is implemented now.
  _shouldFlee() {
    const f = this._flee;
    return !!f && f.action === 'flee' && this.maxHp > 0 && (this.hp / this.maxHp) <= f.threshold;
  }
  // If this mob should flee, drive it AWAY from the player (facing the player so it
  // reads as a retreat, hopping obstacles behind it) and return true so the caller
  // skips its normal chase/attack this frame. Additive to Skeleton kiting — a very low
  // Skeleton fully retreats instead of holding its preferred range.
  _fleeIfHurt(player, level) {
    if (!player || !this._shouldFlee()) return false;
    // §6 stretch — path-aware flee: route to a reachable retreat cell AWAY from the
    // player (around walls) instead of backing straight into terrain. Falls through
    // to the legacy straight-away flee if no retreat route exists.
    if (this._pathCfg && this._pathCfg.enabled && level && this._fleePathStep(player, level)) return true;
    const away  = Math.sign(this.cx - player.cx) || (this.facing || 1);
    const speed = (this.speed || 2) * 1.15;
    this.vx     = away * speed;
    this.facing = -away;   // keep eyes on the player while backing away
    if (this.onGround && level && level.isSolid(
        Math.floor(this.y / BLOCK_SIZE),
        Math.floor((this.x + (away > 0 ? this.width + 2 : -2)) / BLOCK_SIZE))) {
      this.vy = JUMP_VELOCITY * 0.85;
    }
    return true;
  }

  // §6 stretch — steer a fleeing mob along an A* route to a retreat cell away from
  // the player. Returns true if a route is being followed, false to let the caller
  // fall back to the straight-away flee. Retreat goal = progressively shorter
  // distances away from the player until a reachable one is found.
  _fleePathStep(player, level) {
    const cfg = this._pathCfg;
    if (typeof findMobPath !== 'function') return false;
    const cc = this._cellCol(), cr = this._cellRow();
    const away = Math.sign(this.cx - player.cx) || (this.facing || 1);
    if (this._fleeTimer == null) this._fleeTimer = 0;
    // Recompute the retreat route on the SAME throttle as chase — and crucially only
    // when the cadence timer has expired, even after a FAILED search (a cornered mob's
    // retreat cell can be unreachable). Without this the null-path case went stale every
    // frame and re-ran the (heavy, ×3-retry) flee search every frame — and once mobs take
    // damage in combat MANY flee at once, which was the real post-engagement slowdown
    // (Kevin). Between recomputes we follow the cached route or fall back to legacy flee.
    if (--this._fleeTimer <= 0) {
      const rb = this._recomputeBudget;
      if (rb && rb.left <= 0) {
        this._fleeTimer = 1;                        // out of this frame's A* budget → retry next frame
      } else {
        const nav = this._navFor(level);
        let res = null;
        // Try progressively shorter retreats until one is reachable. Each try is a full
        // A* call, so it consumes from the shared per-frame cap and stops when spent.
        for (const dist of [cfg.searchRadius, Math.max(6, (cfg.searchRadius / 2) | 0), 4]) {
          const _pt = _mobNow();
          res = findMobPath(nav, [cc, cr], [cc + away * dist, cr],
            { maxRadius: cfg.searchRadius, maxExpansions: cfg.maxExpansions, maxDrop: MOB_PATH_MAX_DROP });
          _MOB_PATH_STATS.calls++; if (_pt) _MOB_PATH_STATS.ms += _mobNow() - _pt;
          if (rb) rb.left--;
          if (res && res.path.length >= 2) break;
          if (rb && rb.left <= 0) break;            // frame budget spent mid-retry
        }
        this._fleeTimer = cfg.recompute;
        this._fleePath  = (res && res.path.length >= 2) ? res.path : null;
      }
    }
    if (!this._fleePath || this._fleePath.length < 2) return false;   // no route → legacy straight-away flee
    const step  = this._followPath(this._fleePath, player, level);
    const speed = (this.speed || 2) * 1.15;
    this.vx     = step.dir * speed;
    this.facing = -away;   // keep eyes on the player while backing away
    if (step.jump && this.onGround) this.vy = JUMP_VELOCITY * step.jumpMult;
    return true;
  }

  // Smart Mobs §5 — surround: the x a melee chaser steers toward. Normally the player,
  // but the MobManager sets `_flankOffset` so clustered mobs approach from opposite
  // sides (a simple left/right heuristic — real pathfinding is the deferred §6). Zero
  // offset (default) = beeline the player, so this is a no-op when pack behavior is off.
  _chaseTargetX(player) { return player.cx + (this._flankOffset || 0); }

  // ── Smart Mobs §6 — WAYFINDING (path-aware pursuit) ─────────────────────────
  // `_pathCfg` = the shared config (set by the MobManager each frame from world
  // settings; null/disabled = legacy straight-line chase, so default behavior is
  // byte-identical). When enabled, a pursuing mob follows a real A* route
  // (js/pathfinding.js) around terrain instead of beelining the player.

  // Build a `nav` adapter over the live Level for the pathfinder. (c,r)=(col,row);
  // Level speaks (row,col). Out-of-bounds is solid (world edge = wall); lava is a
  // hazard a mob must never route through; jump pads extend the reach envelope.
  _navFor(level) {
    return {
      W: level.width, H: level.height,
      // Pathfinding reads BASE block solidity (BLOCK_DATA) directly, NOT level.isSolid.
      // The game monkey-patches level.isSolid with per-call work (trapdoor/piston/portal
      // checks); it's trivial ONCE, but A* calls solid() hundreds of thousands of times
      // per route, so the patch's overhead × that volume caused multi-second frames
      // (Kevin's slowdown). Base solidity is a plain table lookup and is component- and
      // patch-independent. Mob PHYSICS still uses the real isSolid, so mobs never clip a
      // trapdoor/piston — this only trades a little routing nicety around dynamic blocks.
      solid:  (c, r) => { const d = BLOCK_DATA[level.get(r, c)]; return d ? d.solid : true; },
      hazard: (c, r) => level.get(r, c) === BLOCK.LAVA,
      pad:    (c, r) => level.get(r, c) === BLOCK.JUMP_PAD,
    };
  }
  // This mob's current path cell: the feet cell (air just above the support block).
  _cellCol() { return Math.floor(this.cx / BLOCK_SIZE); }
  _cellRow() { return Math.floor((this.y + this.height - 1) / BLOCK_SIZE); }

  // Returns { dir, jump, jumpMult } steering this mob along a cached A* route to
  // `player` (offset to a flank side when §5 surround is active), or null to fall
  // back to legacy straight-line steering — path-aware OFF, player beyond the
  // bounded search radius (not actionable yet), or NO route found (degrade
  // gracefully to today's beeline; never hang). Caches the route + recomputes on
  // a cadence (not every frame) to bound cost and avoid path flip-flop jitter.
  _pathStep(player, level) {
    this._wayfinding = false;   // set true below iff this mob actively pathfinds (crowd count)
    const cfg = this._pathCfg;
    if (!cfg || !cfg.enabled || !player || !level || typeof findMobPath !== 'function') return null;
    const cc = this._cellCol(), cr = this._cellRow();
    // Flank bias (§5 surround) — aim the GOAL past the player toward this mob's
    // assigned side so flankers route AROUND to the far side (real pathing, not
    // the old overlap-the-player left/right nudge).
    const goalX = player.cx + (this._pathFlankBias || 0);
    const gc = Math.floor(goalX / BLOCK_SIZE);
    const gr = Math.floor((player.y + player.height - 1) / BLOCK_SIZE);
    if (Math.abs(gc - cc) > cfg.searchRadius || Math.abs(gr - cr) > cfg.searchRadius) {
      this._path = null; return null;          // out of range → legacy fallback
    }
    if (this._pathTimer == null) this._pathTimer = 0;
    const goalMoved = !this._pathGoal ||
      Math.abs(this._pathGoal[0] - gc) > 1 || Math.abs(this._pathGoal[1] - gr) > 1;
    const stale = !this._path || this._path.length < 2 || --this._pathTimer <= 0 ||
      goalMoved || this._pathStale(level, this._path);
    if (stale) {
      // Per-frame global A* cap: if this frame's recompute budget is already spent, DEFER
      // running A* entirely — so the cost can't spike when several mobs go stale together,
      // INCLUDING mobs whose last search failed (null path, e.g. an unreachable player):
      // those would otherwise re-run the full (expensive) doomed search every frame. Follow
      // a still-valid cached route if we have one; otherwise beeline this frame.
      const rb = this._recomputeBudget;
      if (rb && rb.left <= 0) {
        if (this._path && this._path.length >= 2 && !this._pathStale(level, this._path)) {
          this._wayfinding = true;
          return this._followPath(this._path, player, level);
        }
        return null;                              // no budget + no usable route → cheap beeline
      }
      const _pt = _mobNow();
      const res = findMobPath(this._navFor(level), [cc, cr], [gc, gr],
        { maxRadius: cfg.searchRadius, maxExpansions: cfg.maxExpansions, maxDrop: MOB_PATH_MAX_DROP });
      _MOB_PATH_STATS.calls++; if (_pt) _MOB_PATH_STATS.ms += _mobNow() - _pt;
      if (rb) rb.left--;
      // Reset the recompute timer; on a mob's FIRST route, add a random offset so a
      // crowd that all start chasing the same frame don't then recompute in lockstep
      // (spreads the A* cost across frames — cheap insurance on top of the crowd throttle).
      this._pathTimer = cfg.recompute + (this._pathInit ? 0 : Math.floor(Math.random() * cfg.recompute));
      this._pathInit  = true;
      this._pathGoal  = [gc, gr];
      this._path      = res ? res.path : null;
      if (!this._path) return null;            // unreachable within budget → legacy
    }
    this._wayfinding = true;                    // actively following a route this frame
    return this._followPath(this._path, player, level);
  }

  // The cached route is stale if any of the next few cells is no longer standable
  // (a block was placed/mined or a piston moved terrain under the mob) — forces a
  // recompute rather than walking into now-solid terrain or a vanished ledge.
  _pathStale(level, path) {
    if (!path || typeof navStandable !== 'function') return !path;
    const nav = this._navFor(level);
    for (let i = 0; i < path.length && i < 4; i++) {
      if (!navStandable(nav, path[i][0], path[i][1])) return true;
    }
    return false;
  }

  // Steer toward the next unreached cell on `path`; trigger a jump when that cell
  // is above the mob (a rise auto-climb can't handle) or a gap lies directly ahead.
  _followPath(path, player, level) {
    // nearest cell on the path, then look one ahead
    let idx = 0, best = Infinity;
    for (let i = 0; i < path.length; i++) {
      const dx = (path[i][0] + 0.5) * BLOCK_SIZE - this.cx;
      const dy = (path[i][1] + 0.5) * BLOCK_SIZE - this.cy;
      const d = dx * dx + dy * dy;
      if (d < best) { best = d; idx = i; }
    }
    const tIdx = Math.min(idx + 1, path.length - 1);
    const [tc, tr] = path[tIdx];
    const tx = (tc + 0.5) * BLOCK_SIZE;
    let dir = Math.sign(tx - this.cx);
    if (dir === 0) {                              // aligned with this cell — aim further
      const nc2 = path[Math.min(tIdx + 1, path.length - 1)][0];
      dir = Math.sign((nc2 + 0.5) * BLOCK_SIZE - this.cx) || Math.sign(player.cx - this.cx);
    }
    dir = dir || (this.facing || 1);
    const cr = this._cellRow(), cc = this._cellCol();
    const rise = cr - tr;                         // >0 = target cell is above us
    const nearCol = Math.abs(tx - this.cx) < 1.8 * BLOCK_SIZE;
    const nav = this._navFor(level);
    let jump = false, jumpMult = 0.85;
    if (rise >= 2 && nearCol) {
      jump = true; jumpMult = rise >= 3 ? 1.0 : 0.9;       // multi-block rise → jump
    } else if (nav.solid(cc + dir, cr) && !nav.solid(cc + dir, cr - 1)) {
      // A step/obstacle directly ahead at foot level (with headroom above it). A body
      // taller than 1 block auto-steps it in _mobPhysics; a SHORT body (<= 1 block —
      // the Cave Spider) can't, so it must hop or it hangs on the ledge (Kevin's bug).
      if (this.height <= BLOCK_SIZE) jump = true;
    } else if (!nav.solid(cc + dir, cr + 1) && tr <= cr + 1 && nearCol) {
      jump = true;                                         // gap directly ahead → hop it
    }
    return { dir, jump, jumpMult };
  }

  _flashAlpha(ctx) {
    // Flash white-ish when recently hit
    if (this.hitCooldown > 0 && Math.floor(this.hitCooldown / 4) % 2 === 0) {
      ctx.globalAlpha = 0.35;
    }
  }
}

Mob._nextId = 0;

// Smart Mobs §8 — map a mob's class name to the lowercase key used by spawn eggs /
// mob-drops / the per-type flee settings (so `_worldAdvSettings.lowHpAction_<key>` etc.
// line up across all the per-mob-type config surfaces).
const MOB_CLASS_KEY = {
  Zombie: 'zombie', Skeleton: 'skeleton', Creeper: 'creeper', CaveSpider: 'cave_spider',
  Piglin: 'piglin', Blaze: 'blaze', WitherSkeleton: 'wither_skeleton', Enderman: 'enderman', Goomba: 'goomba', Koopa: 'koopa', Shell: 'shell',
};

// ── Zombie ───────────────────────────────────────────────────

class Zombie extends Mob {
  constructor(x, y) {
    super(x, y, 22, 48, 10);
    this.attackTimer  = 0;
    this.meleeDamage  = 1;
  }

  update(player, level) {
    if (!this.alive) return;
    this._tickTimers();
    if (this.attackTimer > 0) this.attackTimer--;

    // Smart Mobs §8 — flee at low HP takes priority (skips chase + contact damage).
    if (this.knockbackTimer <= 0 && this._fleeIfHurt(player, level)) {
      this.walkTimer += Math.abs(this.vx) > 0.4 ? 0.09 : 0;
      _mobPhysics(this, level); return;
    }

    const dx   = player.cx - this.cx;
    const dist = Math.abs(dx);

    this.state = (this._shouldChase() && dist < CANVAS_W / 3) ? 'chase' : 'wander';

    if (this.knockbackTimer > 0) {
      // knockback — let physics handle it
    } else if (this.state === 'chase') {
      const step = this._pathStep(player, level);   // §6 path-aware pursuit (null = legacy)
      if (step) {
        this.vx = step.dir * 1.8;
        if (step.jump && this.onGround) this.vy = JUMP_VELOCITY * step.jumpMult;
      } else {
        this.vx = (Math.sign(this._chaseTargetX(player) - this.cx) || Math.sign(dx)) * 1.8;  // §5 surround
      }
      this.facing = Math.sign(dx) || this.facing;
    } else {
      this._wanderUpdate(level, 0.8);
    }

    this.walkTimer += Math.abs(this.vx) > 0.4 ? 0.09 : 0;
    _mobPhysics(this, level);

    // Melee on contact
    if (this.attackTimer === 0 && this._touchesPlayer(player)) {
      const dir = Math.sign(player.cx - this.cx);
      player.takeDamage(1, dir);
      this.attackTimer = MOB_ATTACK_RATE;
    }
  }

  draw(ctx, camera) {
    if (!this.alive) return;
    const sx = Math.floor(this.x - camera.x);
    const sy = Math.floor(this.y - camera.y);
    if (sx > camera.viewMaxX() + 40 || sx + this.width < camera.viewMinX() - 40) return;

    ctx.save();
    this._flashAlpha(ctx);
    this._drawBody(ctx, sx, sy);
    ctx.restore();
    this._drawHealthBar(ctx, sx, sy);
  }

  _drawBody(ctx, sx, sy) {
    const sw     = Math.sin(this.walkTimer);
    const SKIN   = '#5A9E5A';
    const SHIRT  = '#3A6A3A';
    const PANTS  = '#254525';
    const SHOE   = '#1A2A1A';
    const SHADOW = 'rgba(0,0,0,0.35)';

    // Shadow
    ctx.fillStyle = SHADOW;
    ctx.beginPath();
    ctx.ellipse(sx + this.width/2, sy + this.height + 2, 10, 3, 0, 0, Math.PI*2);
    ctx.fill();

    // Legs
    ctx.save(); ctx.translate(sx + 5, sy + 30); ctx.rotate(sw * 0.4);
    ctx.fillStyle = PANTS; ctx.fillRect(-3, 0, 7, 14);
    ctx.fillStyle = SHOE;  ctx.fillRect(-3,14, 7,  4);
    ctx.restore();
    ctx.save(); ctx.translate(sx + 15, sy + 30); ctx.rotate(-sw * 0.4);
    ctx.fillStyle = PANTS; ctx.fillRect(-3, 0, 7, 14);
    ctx.fillStyle = SHOE;  ctx.fillRect(-3,14, 7,  4);
    ctx.restore();

    // Arms (outstretched zombie-style)
    const armAng = -0.55 + sw * 0.15;
    ctx.save(); ctx.translate(sx + 1, sy + 17); ctx.rotate(-armAng);
    ctx.fillStyle = SKIN; ctx.fillRect(-3, 0, 6, 14);
    ctx.restore();
    ctx.save(); ctx.translate(sx + 21, sy + 17); ctx.rotate(armAng);
    ctx.fillStyle = SKIN; ctx.fillRect(-3, 0, 6, 14);
    ctx.restore();

    // Body
    ctx.fillStyle = SHIRT;
    ctx.fillRect(sx + 3, sy + 16, 16, 16);
    ctx.fillStyle = PANTS;
    ctx.fillRect(sx + 3, sy + 29, 16,  3);

    // Head
    ctx.fillStyle = SKIN;
    ctx.fillRect(sx + 2, sy, 18, 18);
    // Decay patch
    ctx.fillStyle = '#2A5A2A';
    ctx.fillRect(sx + 4, sy + 2,  4, 4);
    ctx.fillRect(sx + 9, sy + 10, 5, 3);
    // Eyes — glowing orange
    ctx.fillStyle = '#FF6600';
    ctx.fillRect(sx + 5, sy + 6,  4, 4);
    ctx.fillRect(sx +13, sy + 6,  4, 4);
    ctx.fillStyle = '#FF9900';
    ctx.fillRect(sx + 6, sy + 7,  2, 2);
    ctx.fillRect(sx +14, sy + 7,  2, 2);
  }
}

// ── Skeleton ─────────────────────────────────────────────────

class Skeleton extends Mob {
  constructor(x, y) {
    super(x, y, 18, 44, 8);
    this.shootTimer = Math.floor(Math.random() * SKELETON_SHOOT_RATE); // stagger first shot
  }

  update(player, level, arrows) {
    if (!this.alive) return;
    this._tickTimers();
    if (this.shootTimer > 0) this.shootTimer--;

    // Smart Mobs §8 — at low HP, fully retreat (additive to the normal kiting below).
    if (this.knockbackTimer <= 0 && this._fleeIfHurt(player, level)) {
      this.walkTimer += Math.abs(this.vx) > 0.4 ? 0.09 : 0;
      _mobPhysics(this, level); return;
    }

    const dx   = player.cx - this.cx;
    const dist = Math.abs(dx);

    this.state = (this._shouldChase() && dist < CANVAS_W / 3) ? 'chase' : 'wander';

    if (this.knockbackTimer > 0) {
      // knockback — let physics handle it
    } else if (this.state === 'wander') {
      this._wanderUpdate(level, 0.7);
    } else {
      if (dist > 180 && dist < 350) {
        // Approach to shoot range — §6 path-aware when terrain is in the way (else legacy).
        const step = this._pathStep(player, level);
        if (step) {
          this.vx = step.dir * 1.5;
          if (step.jump && this.onGround) this.vy = JUMP_VELOCITY * step.jumpMult;
        } else {
          this.vx = Math.sign(dx) * 1.5;
        }
        this.facing = Math.sign(dx) || this.facing;
      } else if (dist <= 110) {
        // Too close — back away
        this.vx     = -Math.sign(dx) * 1.5;
        this.facing = Math.sign(dx);
      } else {
        // In sweet spot — slow to a stop
        this.vx *= 0.75;
        this.facing = Math.sign(dx);
      }
    }

    this.walkTimer += Math.abs(this.vx) > 0.4 ? 0.09 : 0;
    _mobPhysics(this, level);

    // Shoot only when chasing
    if (this.state === 'chase' && this.shootTimer === 0 && dist < 380 && this.onGround) {
      this._shoot(player, arrows);
      this.shootTimer = SKELETON_SHOOT_RATE;
    }
  }

  _shoot(player, arrows) {
    const dx  = player.cx - this.cx;
    const dy  = player.cy - this.cy;
    const len = Math.hypot(dx, dy) || 1;
    arrows.push(new Arrow(this.cx, this.cy, (dx/len)*ARROW_SPEED, (dy/len)*ARROW_SPEED, 2));
    if (this._mobManager?.soundCallback) this._mobManager.soundCallback('sounds/bow-fire.mp3', 0.5);
  }

  draw(ctx, camera) {
    if (!this.alive) return;
    const sx = Math.floor(this.x - camera.x);
    const sy = Math.floor(this.y - camera.y);
    if (sx > camera.viewMaxX() + 40 || sx + this.width < camera.viewMinX() - 40) return;

    ctx.save();
    this._flashAlpha(ctx);
    this._drawBody(ctx, sx, sy);
    ctx.restore();
    this._drawHealthBar(ctx, sx, sy);
  }

  _drawBody(ctx, sx, sy) {
    const sw   = Math.sin(this.walkTimer);
    const BONE = '#DDD8C8';
    const DARK = '#B0A898';

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(sx+9, sy+this.height+2, 8, 2.5, 0, 0, Math.PI*2);
    ctx.fill();

    // Legs
    ctx.fillStyle = BONE;
    ctx.save(); ctx.translate(sx+4, sy+28); ctx.rotate(sw*0.35);
    ctx.fillRect(-3,0,5,14); ctx.restore();
    ctx.save(); ctx.translate(sx+13,sy+28); ctx.rotate(-sw*0.35);
    ctx.fillRect(-2,0,5,14); ctx.restore();

    // Body / ribcage
    ctx.fillStyle = BONE;
    ctx.fillRect(sx+3, sy+14, 12, 15);
    ctx.fillStyle = DARK;
    for (let i = 0; i < 3; i++) ctx.fillRect(sx+3, sy+16+i*5, 12, 1);

    // Arms
    ctx.fillStyle = BONE;
    ctx.save(); ctx.translate(sx+1, sy+14); ctx.rotate(sw*0.3-0.3);
    ctx.fillRect(-2,0,4,14); ctx.restore();
    // Right arm raised (holding bow)
    ctx.save(); ctx.translate(sx+17,sy+14); ctx.rotate(-0.6+sw*0.1);
    ctx.fillRect(-2,0,4,14); ctx.restore();

    // Bow
    ctx.save();
    ctx.strokeStyle = '#7A4A10';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx+20, sy+18, 9, -Math.PI*0.65, Math.PI*0.65);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(220,220,220,0.8)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(sx+20, sy+10); ctx.lineTo(sx+20, sy+26);
    ctx.stroke();
    ctx.restore();

    // Skull head
    ctx.fillStyle = BONE;
    ctx.fillRect(sx+2, sy, 14, 14);
    // Eye sockets
    ctx.fillStyle = '#111';
    ctx.fillRect(sx+4, sy+4, 3, 3);
    ctx.fillRect(sx+10,sy+4, 3, 3);
    // Nasal cavity
    ctx.fillStyle = DARK;
    ctx.fillRect(sx+8, sy+8, 2, 2);
    // Teeth
    ctx.fillStyle = BONE;
    ctx.fillRect(sx+5, sy+11, 2, 3);
    ctx.fillRect(sx+9, sy+11, 2, 3);
    ctx.fillStyle = DARK;
    ctx.fillRect(sx+7, sy+11, 2, 3);
    ctx.fillRect(sx+11,sy+11, 2, 3);
  }
}

// ── Creeper ──────────────────────────────────────────────────

class Creeper extends Mob {
  constructor(x, y) {
    super(x, y, 20, 44, 12);
    this.fusing    = false;
    this.fuseTimer = 0;
    this.explosionPending = null; // set by _explode, consumed by MobManager
    this.meleeDamage = 6;
  }

  takeDamage(amount, knockDir = 0) {
    const hit = super.takeDamage(amount, knockDir);
    if (hit && this.alive) this._triggerFuse();
    return hit;
  }

  _triggerFuse() {
    if (this.fusing) return;
    this.fusing    = true;
    this.fuseTimer = CREEPER_FUSE_FRAMES;
    this.vx        = 0;
  }

  update(player, level) {
    if (!this.alive) return;
    this._tickTimers();

    if (this.fusing) {
      this.fuseTimer--;
      // frozen — just apply gravity so it stays on ground
      this.vx = 0;
      _mobPhysics(this, level);
      if (this.fuseTimer <= 0) this._explode(player);
      return;
    }

    const dx   = player.cx - this.cx;
    const dist = Math.abs(dx);

    this.state = (this._shouldChase() && dist < CANVAS_W / 3) ? 'chase' : 'wander';

    if (this.knockbackTimer > 0) {
      // knockback — let physics handle it
    } else if (this.state === 'wander') {
      this._wanderUpdate(level, 0.7);
    } else {
      const step = this._pathStep(player, level);   // §6 path-aware pursuit (null = legacy)
      if (step) {
        this.vx = step.dir * 1.5;
        if (step.jump && this.onGround) this.vy = JUMP_VELOCITY * step.jumpMult;
      } else {
        this.vx = Math.sign(dx) * 1.5;
      }
      this.facing = Math.sign(dx) || this.facing;
    }

    this.walkTimer += Math.abs(this.vx) > 0.4 ? 0.09 : 0;
    _mobPhysics(this, level);

    // Touch → fuse (only when chasing)
    if (this.state === 'chase' && this._touchesPlayer(player)) this._triggerFuse();
  }

  _explode(player) {
    this.alive = false;
    const col  = Math.floor(this.cx / BLOCK_SIZE);
    const row  = Math.floor(this.cy / BLOCK_SIZE);
    this.explosionPending = { col, row, radius: CREEPER_EXPLODE_RADIUS };

    // Damage player if close enough
    const dist = Math.hypot(player.cx - this.cx, player.cy - this.cy);
    if (dist < (CREEPER_EXPLODE_RADIUS + 1) * BLOCK_SIZE * 2) {
      player.takeDamage(6, Math.sign(player.cx - this.cx));
    }
  }

  draw(ctx, camera) {
    if (!this.alive) return;
    const sx = Math.floor(this.x - camera.x);
    const sy = Math.floor(this.y - camera.y);
    if (sx > camera.viewMaxX() + 40 || sx + this.width < camera.viewMinX() - 40) return;

    // Fuse flash: speeds up as timer runs out
    const flashInterval = this.fuseTimer > 120 ? 20 : this.fuseTimer > 60 ? 10 : 5;
    const flashing      = this.fusing && Math.floor(this.fuseTimer / flashInterval) % 2 === 0;

    ctx.save();
    if (flashing) ctx.globalAlpha = 0.5;
    else this._flashAlpha(ctx);
    this._drawBody(ctx, sx, sy, flashing);
    ctx.restore();

    this._drawHealthBar(ctx, sx, sy);

    // Fuse countdown number
    if (this.fusing) {
      const secs    = Math.ceil(this.fuseTimer / 60);
      const labelY  = sy - 16;
      ctx.save();
      ctx.font         = 'bold 13px Courier New';
      ctx.textAlign    = 'center';
      ctx.fillStyle    = flashing ? '#FF2222' : '#FFAA00';
      ctx.fillText(secs + 's', sx + this.width / 2, labelY);
      ctx.textAlign    = 'left';
      ctx.restore();
    }
  }

  _drawBody(ctx, sx, sy, flashing) {
    const GREEN = flashing ? '#FF5555' : '#4A9A4A';
    const DARK  = flashing ? '#CC1111' : '#2A5A2A';
    const sw    = Math.sin(this.walkTimer);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(sx+10,sy+this.height+2,9,2.5,0,0,Math.PI*2);
    ctx.fill();

    // Legs (four stumpy legs, two visible)
    ctx.fillStyle = GREEN;
    ctx.save(); ctx.translate(sx+3, sy+28); ctx.rotate(sw*0.3);
    ctx.fillRect(-2,0,7,14); ctx.restore();
    ctx.save(); ctx.translate(sx+13,sy+28); ctx.rotate(-sw*0.3);
    ctx.fillRect(-2,0,7,14); ctx.restore();

    // Body
    ctx.fillStyle = GREEN;
    ctx.fillRect(sx+2, sy+14, 16, 16);

    // Head
    ctx.fillStyle = GREEN;
    ctx.fillRect(sx+1, sy, 18, 16);
    // Iconic face
    ctx.fillStyle = DARK;
    // Eyes
    ctx.fillRect(sx+3,  sy+3,  5, 5);
    ctx.fillRect(sx+12, sy+3,  5, 5);
    // Nose + mouth
    ctx.fillRect(sx+7,  sy+8,  2, 2);
    ctx.fillRect(sx+11, sy+8,  2, 2);
    ctx.fillRect(sx+5,  sy+10, 4, 5);
    ctx.fillRect(sx+11, sy+10, 4, 5);
    ctx.fillRect(sx+5,  sy+13, 10, 2);
  }
}

// ── Arrow ────────────────────────────────────────────────────

class Arrow {
  constructor(x, y, vx, vy, damage, gravity = 0, isPlayerArrow = false) {
    this.x            = x; this.y  = y;
    this.vx           = vx; this.vy = vy;
    this.damage       = damage;
    this.gravity      = gravity;
    this.isPlayerArrow= isPlayerArrow;
    this.alive        = true;
    this.age          = 0;
  }

  // Smart Mobs §2 #6 — a stuck projectile rests in place (in ground / where it
  // hit) until the player walks over it and picks it up.
  _stick() { this._angle = Math.atan2(this.vy, this.vx); this.stuck = true; this.vx = 0; this.vy = 0; }

  // §Phase 3 — Boomerang flight: a FAST outbound that decelerates near the arc end,
  // then auto-returns to the player. steerGuided() (called each frame by game.js while
  // `guided`) curves the heading toward the cursor on BOTH legs; here we own the SPEED
  // (deceleration), the outbound→return phase switch, and the return-pull toward the
  // player. No terrain collision (it flies over gaps/walls); mob hits ride the normal
  // playerArrows loop — it `pierce`s so one pass grazes several mobs, and _hitMobs
  // clears on the turn so it can graze them again on the way home.
  _updateBoomerang(players, level) {
    this.age++;
    this._spin = (this._spin || 0) + (this._spinRate || BOOM_SPIN_RATE);
    if (this.age > BOOM_MAX_LIFE) { this.alive = false; return; }
    if (this.stuck) { this._stuckAge = (this._stuckAge || 0) + 1; return; }   // §F embedded in a wall (Stick)
    if (this._boomWaiting) return;   // §F Click-to-Return: hover at the far point until recalled
    const tgt   = Array.isArray(players) ? players[0] : players;
    const range = this._boomRange, base = this._boomSpeed;
    const minSpd = base * (this._boomMinMult ?? BOOM_MIN_SPEED_MULT);
    const clickReturn = this._boomReturnMode === 'click';
    if (!this._boomReturning) {
      const dist    = Math.hypot(this.x - this._boomOX, this.y - this._boomOY);
      const decelAt = range * (this._boomDecelPct ?? BOOM_DECEL_PCT);
      let spd = base;
      if (dist >= decelAt) {                              // ease speed base→min toward the range end
        const t = Math.min(1, (dist - decelAt) / Math.max(1, range - decelAt));
        spd = base * (1 - t) + minSpd * t;
      }
      const h = Math.hypot(this.vx, this.vy) || 1;        // keep the steer-set heading, set the speed
      this.vx = this.vx / h * spd; this.vy = this.vy / h * spd;
      if (dist >= range) {
        if (this._hitMobs) this._hitMobs.clear();
        if (clickReturn) { this._boomWaiting = true; this.vx = 0; this.vy = 0; return; }  // wait for recall
        this._boomReturning = true;
      }
    } else {
      const retSpd = base * (this._boomReturnMult ?? BOOM_RETURN_MULT);
      if (tgt) {                                          // pull toward player; steer still curves to cursor
        const pcx = tgt.x + tgt.width / 2, pcy = tgt.y + tgt.height / 2;
        const dx = pcx - this.x, dy = pcy - this.y, d = Math.hypot(dx, dy) || 1;
        const pull = 0.35;                                // convergence-on-player vs. keep the cursor curve
        const nvx = this.vx * (1 - pull) + (dx / d * retSpd) * pull;
        const nvy = this.vy * (1 - pull) + (dy / d * retSpd) * pull;
        const nh = Math.hypot(nvx, nvy) || 1;
        this.vx = nvx / nh * retSpd; this.vy = nvy / nh * retSpd;
      }
    }
    // §Phase F — wall interaction (only when Wall mode = 'stop'; default 'pass' flies over).
    const nx = this.x + this.vx, ny = this.y + this.vy;
    if (this._boomWall === 'stop' && level && level.isSolid && level.isSolid(Math.floor(ny / BLOCK_SIZE), Math.floor(nx / BLOCK_SIZE))) {
      this._angle = Math.atan2(this.vy, this.vx);
      if (this._boomOnBlock === 'stick') { this.vx = 0; this.vy = 0; this.stuck = true; return; }  // embed → game drops it
      // Early Return (default): turn back at the wall (don't step into it).
      if (!this._boomReturning) { this._boomReturning = true; if (this._hitMobs) this._hitMobs.clear(); }
      return;
    }
    this.x = nx; this.y = ny;
    this._angle = Math.atan2(this.vy, this.vx);
    if (this._boomReturning && tgt) {                     // caught → game re-arms the slot
      const pcx = tgt.x + tgt.width / 2, pcy = tgt.y + tgt.height / 2;
      if (Math.hypot(this.x - pcx, this.y - pcy) < 22) { this._boomCaught = true; this.alive = false; }
    }
  }

  // players: array of live players (P1-P4) or a single player (normalized).
  update(players, level) {
    if (!this.alive) return;
    if (this.boomerang) return this._updateBoomerang(players, level);
    // Smart Mobs §6 — a recalled/auto-returning Trident homes back to the owner,
    // ignoring gravity/terrain (checked BEFORE `stuck` so a recalled stuck trident
    // un-sticks and flies back). The pickup check consumes it at the player.
    if (this.returning) {
      this.stuck = false;
      const tgt = Array.isArray(players) ? players[0] : players;
      if (tgt) {
        const dx = (tgt.x + tgt.width / 2) - this.x, dy = (tgt.y + tgt.height / 2) - this.y;
        const d = Math.hypot(dx, dy) || 1;
        this.vx = dx / d * 17; this.vy = dy / d * 17;
        this._angle = Math.atan2(this.vy, this.vx);
        this.x += this.vx; this.y += this.vy;
      }
      return;
    }
    if (this.stuck) { this._stuckAge = (this._stuckAge || 0) + 1; return; }  // rests until picked up
    this.age++;
    // Tridents get a longer life so they can arc and land; normal arrows expire.
    if (this.age > (this.isTrident ? 600 : 280)) { this.alive = false; return; }

    this.vy += this.gravity;
    // SWEPT block collision (bugfix): at 9-26 px/frame a projectile could jump a
    // 32px wall in one step and sample a cell PAST the first solid block — sticking
    // the (unrecoverable) trident behind the wall. Step along the path in ≤16px
    // increments and stop at the FIRST solid cell entered.
    const px = this.x, py = this.y;
    const nx = this.x + this.vx, ny = this.y + this.vy;
    const steps = Math.max(1, Math.ceil(Math.hypot(nx - px, ny - py) / (BLOCK_SIZE * 0.5)));
    let hit = false;
    for (let s = 1; s <= steps; s++) {
      const t  = s / steps;
      const cx = px + (nx - px) * t, cy = py + (ny - py) * t;
      if (level.isSolid(Math.floor(cy / BLOCK_SIZE), Math.floor(cx / BLOCK_SIZE))) {
        const pt = (s - 1) / steps;            // back up to the last free sub-step
        this.x = px + (nx - px) * pt;
        this.y = py + (ny - py) * pt;
        this._blockHit = { row: Math.floor(cy / BLOCK_SIZE), col: Math.floor(cx / BLOCK_SIZE) };  // §Phase R — for Target Blocks
        hit = true;
        break;
      }
    }
    if (!hit) { this.x = nx; this.y = ny; }
    // A Trident, or a recoverable player arrow that hasn't hit any mob, STICKS in
    // the block (collectable); otherwise it dies.
    if (hit) {
      if (this.isTrident || (this.isPlayerArrow && this.recoverable && !this._hitAnyMob)) { this._stick(); return; }
      this.alive = false; return;
    }

    if (this.isPlayerArrow) return; // deflected/player arrows don't hurt player

    // Player collision — damage the first live player the arrow overlaps (any of
    // P1-P4). The arrow stops (or deflects) on either hit.
    const arr = Array.isArray(players) ? players : (players ? [players] : []);
    for (const p of arr) {
      if (!p || p.hp <= 0) continue;
      if (this.x > p.x && this.x < p.x + p.width &&
          this.y > p.y && this.y < p.y + p.height) {
        if (p.crouching && p.hasShield && !(typeof CTF_SYSTEM !== 'undefined' && CTF_SYSTEM.isCarrying(p))) {
          // Shield deflects — reverse direction, now acts as player arrow
          this.vx = -this.vx;
          this.isPlayerArrow = true;
          this._justDeflected = true;   // MobManager plays the block SFX this frame
        } else {
          p.takeDamage(this.damage, Math.sign(this.vx));
          this.alive = false;
        }
        return;
      }
    }
  }

  draw(ctx, camera) {
    if (!this.alive) return;
    const sx    = this.x - camera.x;
    const sy    = this.y - camera.y;
    if (sx < camera.viewMinX() - 20 || sx > camera.viewMaxX() + 20) return;
    if (this.boomerang) return this._drawBoomerang(ctx, sx, sy);
    // Fly (and stick) pointing along travel — straight like an arrow, no spin (§6).
    const angle = this.stuck ? (this._angle || 0) : Math.atan2(this.vy, this.vx);

    ctx.save();
    ctx.translate(Math.floor(sx), Math.floor(sy));
    ctx.rotate(angle);
    // §Follow-up — a charged shot keeps a glow in flight (same yellow→red hue ramp).
    if (this._chargeGlow > 0.2 && !this.stuck) {
      ctx.shadowColor = `hsl(${55 * (1 - Math.min(1, this._chargeGlow))}, 100%, 55%)`;
      ctx.shadowBlur  = 4 + 10 * Math.min(1, this._chargeGlow);
    }
    if (this.isTrident) {
      // Trident — cyan shaft + 3-prong head, oriented along flight (sticks straight).
      ctx.fillStyle = '#3FB8C0';
      ctx.fillRect(-13, -1.5, 22, 3);
      ctx.beginPath();
      ctx.moveTo(9, -5); ctx.lineTo(15, -5); ctx.lineTo(15, 5); ctx.lineTo(9, 5);
      ctx.moveTo(15, -5); ctx.lineTo(18, -5); ctx.moveTo(15, 0); ctx.lineTo(19, 0); ctx.moveTo(15, 5); ctx.lineTo(18, 5);
      ctx.lineWidth = 2; ctx.strokeStyle = '#8FE8EE'; ctx.stroke();
    } else {
      // Shaft
      ctx.fillStyle = '#8B5A18';
      ctx.fillRect(-9, -1, 18, 2);
      // Head
      ctx.fillStyle = '#BBBBBB';
      ctx.beginPath();
      ctx.moveTo(9, 0); ctx.lineTo(5, -3); ctx.lineTo(5, 3);
      ctx.closePath(); ctx.fill();
      // Fletching
      ctx.fillStyle = '#EEEEEE';
      ctx.fillRect(-9, -3, 5, 2);
      ctx.fillRect(-9,  1, 5, 2);
    }
    ctx.restore();
  }

  // §Phase 3 — Boomerang looks. Two selectable renders (World Settings → "Look"):
  //   '2d'  — a flat bent bar spinning IN-PLANE (top-down view, even though the camera
  //           is side-on): rotate the whole shape by the accumulated spin.
  //   'iso' — a pseudo-3D tumble: foreshorten the width by |cos(spin)| so the blade
  //           reads as turning THROUGH depth (thin edge when seen side-on) + a wobble.
  // Both spin continuously; it can't be verified headlessly — build-then-judge by eye.
  _drawBoomerang(ctx, sx, sy) {
    const spin = this._spin || 0;
    ctx.save();
    ctx.translate(Math.floor(sx), Math.floor(sy));
    if (this._boomLook === 'iso') {
      // §Phase F — pseudo-3D tumble: foreshorten WIDTH by |cos(spin)| AND squash the whole
      // sprite vertically (~0.8) so it reads as lying in a side-view plane, not face-on.
      const sc = Math.max(0.12, Math.abs(Math.cos(spin)));
      ctx.scale(sc, 0.8);
      ctx.rotate(Math.sin(spin) * 0.35);
    } else {
      ctx.rotate(spin);
    }
    this._boomShape(ctx);
    ctx.restore();
  }
  // A bent V-bar boomerang silhouette centred at the origin (~16px wide).
  _boomShape(ctx) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#C98A3A'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(-8, 6); ctx.lineTo(0, -7); ctx.lineTo(8, 6); ctx.stroke();
    ctx.strokeStyle = '#7A5320'; ctx.lineWidth = 1.5;   // edge
    ctx.beginPath(); ctx.moveTo(-8, 6); ctx.lineTo(0, -7); ctx.lineTo(8, 6); ctx.stroke();
  }
}

// ── Damage Number ─────────────────────────────────────────────

class DamageNumber {
  constructor(worldX, worldY, amount, color) {
    this.worldX  = worldX;
    this.worldY  = worldY;
    this.amount  = amount;
    this.color   = color || '#FF4444';
    this.vy      = -1.4;
    this.life    = 52;
    this.maxLife = 52;
  }

  update() {
    this.worldY += this.vy;
    this.vy     *= 0.95;
    this.life--;
    return this.life > 0;
  }

  draw(ctx, camera) {
    const sx = this.worldX - camera.x;
    const sy = this.worldY - camera.y;
    if (sx < camera.viewMinX() - 40 || sx > camera.viewMaxX() + 40 || sy < camera.viewMinY() - 40 || sy > camera.viewMaxY() + 40) return;

    const alpha = Math.min(1, this.life / this.maxLife * 2.5);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font        = 'bold 13px Courier New';
    ctx.textAlign   = 'center';
    ctx.fillStyle   = 'rgba(0,0,0,0.55)';
    ctx.fillText(`-${this.amount}`, sx + 1, sy + 1);
    ctx.fillStyle   = this.color;
    ctx.fillText(`-${this.amount}`, sx, sy);
    ctx.textAlign   = 'left';
    ctx.restore();
  }
}

// ── XP Orb ────────────────────────────────────────────────────

class XpOrb {
  constructor(worldX, worldY) {
    this.worldX   = worldX;
    this.worldY   = worldY;
    this.vx       = (Math.random() - 0.5) * 2.5;
    this.vy       = -2.5 - Math.random() * 1.5;  // initial pop upward
    this.age      = 0;
    this.life     = 480;  // 8 seconds at 60 fps
    this.bobPhase = Math.random() * Math.PI * 2;
  }

  // Called every frame; returns display Y (bobbing after settling)
  get displayY() {
    if (this.age < 35) return this.worldY;
    return this.worldY + Math.sin(this.age * 0.055 + this.bobPhase) * 4;
  }

  tick() {
    this.age++;
    if (this.age < 35) {
      // Pop phase: arc up then settle
      this.worldX += this.vx;
      this.worldY += this.vy;
      this.vx     *= 0.88;
      this.vy      = Math.min(this.vy + 0.22, 0);  // slow to a hover
    }
    this.life--;
  }

  draw(ctx, camera) {
    const sx = this.worldX - camera.x;
    const sy = this.displayY - camera.y;
    if (sx < camera.viewMinX() - 20 || sx > camera.viewMaxX() + 20 || sy < camera.viewMinY() - 20 || sy > camera.viewMaxY() + 20) return;

    const fadeAlpha = Math.min(1, this.life / 60);   // fade in last 1 s
    const pulse     = 1 + Math.sin(this.age * 0.12 + this.bobPhase) * 0.18;
    const r         = 6 * pulse;

    ctx.save();
    ctx.globalAlpha = fadeAlpha;

    // Soft glow
    const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 3);
    glow.addColorStop(0,   'rgba(60,255,100,0.55)');
    glow.addColorStop(0.5, 'rgba(0,200,60,0.2)');
    glow.addColorStop(1,   'rgba(0,150,40,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sx, sy, r * 3, 0, Math.PI * 2);
    ctx.fill();

    // Core orb
    const core = ctx.createRadialGradient(sx - r*0.25, sy - r*0.25, 0, sx, sy, r);
    core.addColorStop(0,   '#AAFFC0');
    core.addColorStop(0.5, '#22DD55');
    core.addColorStop(1,   '#0A8830');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();

    // Specular highlight
    ctx.fillStyle = 'rgba(200,255,220,0.75)';
    ctx.beginPath();
    ctx.arc(sx - r * 0.3, sy - r * 0.3, r * 0.35, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

// ── Explosion Effect (visual only) ───────────────────────────

class ExplosionEffect {
  constructor(worldX, worldY, radius) {
    this.worldX  = worldX;
    this.worldY  = worldY;
    this.radius  = radius;
    this.life    = 35;
    this.maxLife = 35;
  }

  draw(ctx, camera) {
    const sx      = this.worldX - camera.x;
    const sy      = this.worldY - camera.y;
    const t       = 1 - this.life / this.maxLife;  // 0 → 1
    const r       = this.radius * (0.4 + t * 0.6);
    const alpha   = (1 - t) * 0.9;

    ctx.save();
    ctx.globalAlpha = alpha;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    g.addColorStop(0,    '#FFFFFF');
    g.addColorStop(0.15, '#FFF060');
    g.addColorStop(0.4,  '#FF8800');
    g.addColorStop(0.75, '#CC3300');
    g.addColorStop(1,    'rgba(80,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();

    // Smoke ring
    ctx.globalAlpha = alpha * 0.4;
    ctx.strokeStyle = '#888';
    ctx.lineWidth   = 4;
    ctx.beginPath();
    ctx.arc(sx, sy, r * 1.1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// ── Cave Spider ───────────────────────────────────────────────

class CaveSpider extends Mob {
  constructor(x, y) {
    super(x, y, 16, 16, 6);
    this.speed       = 3.6;
    this.meleeDamage = 2;
    this.webShootTimer = 90 + Math.floor(Math.random() * 90);  // §9 stagger first web
  }

  // Smart Mobs §9 — spit a web at the player. `webs` = the manager's web list; `_webCfg`
  // (set by the manager from world settings) gates it + carries the slow parameters.
  update(player, level, webs) {
    this._tickTimers();
    if (this.webShootTimer > 0) this.webShootTimer--;
    if (this.knockbackTimer > 0) { _mobPhysics(this, level); return; }
    // Smart Mobs §8 — low-HP flee takes priority over chasing.
    if (this._fleeIfHurt(player, level)) { _mobPhysics(this, level); return; }
    // Smart Mobs §4 — undetected mobs wander instead of beelining the player.
    if (!this._shouldChase()) { this._wanderUpdate(level, 0.8); _mobPhysics(this, level); return; }

    // Chase player horizontally, jump to reach
    const dir = Math.sign(player.cx - this.cx);
    const step = this._pathStep(player, level);   // §6 path-aware pursuit (null = legacy)
    if (step) {
      this.vx = step.dir * this.speed;
      if (step.jump && this.onGround) this.vy = JUMP_VELOCITY * step.jumpMult;
    } else {
      this.vx = (Math.sign(this._chaseTargetX(player) - this.cx) || dir) * this.speed;  // §5 surround
      // Legacy jump: if blocked ahead, or the player is above.
      if (this.onGround) {
        const dRow = Math.floor(this.y / BLOCK_SIZE);
        const dCol = Math.floor((this.x + (dir > 0 ? this.width + 2 : -2)) / BLOCK_SIZE);
        if (level.isSolid(dRow, dCol) || player.y < this.y - 8) this.vy = JUMP_VELOCITY * 0.85;
      }
    }
    this.facing = dir;

    // Web shot (§9): opt-in; from a distance, on a cooldown, when it has a clear-ish line.
    const wc = this._webCfg;
    if (wc && wc.enabled && webs && this.webShootTimer === 0) {
      const dist = Math.hypot(player.cx - this.cx, player.cy - this.cy);
      if (dist > 2 * BLOCK_SIZE && dist < (wc.range || 10 * BLOCK_SIZE)) {
        const ang   = Math.atan2(player.cy - this.cy, player.cx - this.cx);
        const speed = 6;
        webs.push(new Web(this.cx, this.cy, Math.cos(ang) * speed, Math.sin(ang) * speed - 1.2, wc));
        this.webShootTimer = wc.cooldown || 150;
      }
    }

    // Melee attack
    if (this._touchesPlayer(player) && player.iFrames === 0) {
      player.takeDamage(2, dir);
    }

    _mobPhysics(this, level);
  }

  draw(ctx, camera) {
    if (!this.alive) return;
    const sx = Math.floor(this.x - camera.x);
    const sy = Math.floor(this.y - camera.y);
    if (sx < camera.viewMinX() - 40 || sx > camera.viewMaxX() + 40) return;

    ctx.save();
    this._flashAlpha(ctx);

    // Body
    ctx.fillStyle = '#4A2060';
    ctx.fillRect(sx, sy + 2, 16, 10);
    // Eyes
    ctx.fillStyle = '#FF2020';
    ctx.fillRect(sx + 2, sy + 3, 3, 3);
    ctx.fillRect(sx + 11, sy + 3, 3, 3);
    // Legs
    ctx.fillStyle = '#3A1050';
    ctx.fillRect(sx - 2, sy + 6, 3, 2);
    ctx.fillRect(sx + 15, sy + 6, 3, 2);
    ctx.fillRect(sx - 4, sy + 9, 3, 6);
    ctx.fillRect(sx + 17, sy + 9, 3, 6);

    this._drawHealthBar(ctx, sx, sy);
    ctx.restore();
  }
}

// ── Piglin ─────────────────────────────────────────────────────

class Piglin extends Mob {
  constructor(x, y) {
    super(x, y, 20, 44, 14);
    this.speed       = 2.7;
    this.attackTimer = 0;
    this.meleeDamage = 3;
  }

  update(player, level) {
    this._tickTimers();
    if (this.attackTimer > 0) this.attackTimer--;
    if (this.knockbackTimer > 0) { _mobPhysics(this, level); return; }
    // Smart Mobs §8 — low-HP flee takes priority over chasing.
    if (this._fleeIfHurt(player, level)) { _mobPhysics(this, level); return; }
    // Smart Mobs §4 — undetected mobs wander instead of beelining the player.
    if (!this._shouldChase()) { this._wanderUpdate(level, 0.8); _mobPhysics(this, level); return; }

    const dir = Math.sign(player.cx - this.cx);
    const step = this._pathStep(player, level);   // §6 path-aware pursuit (null = legacy)
    if (step) {
      this.vx = step.dir * this.speed;
      if (step.jump && this.onGround) this.vy = JUMP_VELOCITY * step.jumpMult;
    } else {
      this.vx = (Math.sign(this._chaseTargetX(player) - this.cx) || dir) * this.speed;  // §5 surround
      if (this.onGround && level.isSolid(
          Math.floor(this.y / BLOCK_SIZE),
          Math.floor((this.x + (dir > 0 ? this.width + 2 : -2)) / BLOCK_SIZE))) {
        this.vy = JUMP_VELOCITY * 0.9;
      }
    }
    this.facing = dir;

    if (this._touchesPlayer(player) && this.attackTimer === 0 && player.iFrames === 0) {
      player.takeDamage(3, dir);
      this.attackTimer = MOB_ATTACK_RATE;
    }

    _mobPhysics(this, level);
  }

  draw(ctx, camera) {
    if (!this.alive) return;
    const sx = Math.floor(this.x - camera.x);
    const sy = Math.floor(this.y - camera.y);
    if (sx < camera.viewMinX() - 40 || sx > camera.viewMaxX() + 40) return;

    ctx.save();
    this._flashAlpha(ctx);

    // Body
    ctx.fillStyle = '#D4967A';
    ctx.fillRect(sx + 4, sy + 16, 12, 18);
    // Head
    ctx.fillStyle = '#E8B090';
    ctx.fillRect(sx + 2, sy + 2, 16, 14);
    // Snout
    ctx.fillStyle = '#D4967A';
    ctx.fillRect(sx + 5, sy + 10, 10, 6);
    ctx.fillStyle = '#AA6060';
    ctx.fillRect(sx + 6, sy + 11, 3, 3);
    ctx.fillRect(sx + 11, sy + 11, 3, 3);
    // Eyes
    ctx.fillStyle = '#662222';
    ctx.fillRect(sx + (this.facing > 0 ? 13 : 3), sy + 5, 3, 3);
    // Legs
    ctx.fillStyle = '#B07060';
    ctx.fillRect(sx + 4,  sy + 34, 5, 10);
    ctx.fillRect(sx + 11, sy + 34, 5, 10);
    // Gold sword
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(sx + (this.facing > 0 ? 17 : -4), sy + 20, 3, 14);

    this._drawHealthBar(ctx, sx, sy);
    ctx.restore();
  }
}

// ── Blaze Shot ────────────────────────────────────────────────

class BlazeShot {
  constructor(x, y, vx, vy) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.alive     = true;
    this.age       = 0;
    this.damage    = 3;
    this.deflected = false;
  }

  update(player, level) {
    if (!this.alive) return;
    this.age++;
    if (this.age > 200) { this.alive = false; return; }

    this.x += this.vx;
    this.y += this.vy;

    const col = Math.floor(this.x / BLOCK_SIZE);
    const row = Math.floor(this.y / BLOCK_SIZE);
    if (level.isSolid(row, col)) { this.alive = false; return; }

    if (!this.deflected &&
        this.x > player.x && this.x < player.x + player.width &&
        this.y > player.y && this.y < player.y + player.height) {
      if (player.crouching && player.hasShield && !(typeof CTF_SYSTEM !== 'undefined' && CTF_SYSTEM.isCarrying(player))) {
        // Shield deflects — bounce back
        this.vx       = -this.vx;
        this.vy       = -this.vy * 0.5;
        this.deflected = true;
      } else {
        player.takeDamage(this.damage, Math.sign(this.vx));
        this.alive = false;
      }
    }
  }

  draw(ctx, camera) {
    if (!this.alive) return;
    const sx = Math.floor(this.x - camera.x);
    const sy = Math.floor(this.y - camera.y);
    if (sx < camera.viewMinX() - 20 || sx > camera.viewMaxX() + 20) return;

    const t   = Date.now() / 100;
    const glo = 0.7 + Math.sin(t) * 0.3;
    ctx.save();
    ctx.globalAlpha = glo;
    ctx.fillStyle   = '#FF8800';
    ctx.fillRect(sx - 5, sy - 5, 10, 10);
    ctx.fillStyle = '#FFDD00';
    ctx.fillRect(sx - 3, sy - 3, 6, 6);
    ctx.restore();
  }
}

// ── Spider Web (Smart Mobs §9) ────────────────────────────────
// A slow-moving sticky glob a Cave Spider spits. On contact it slows the player
// (no damage) via player.applyWeb(); expires on a wall or after its lifetime.
class Web {
  constructor(x, y, vx, vy, cfg) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.alive = true;
    this.age   = 0;
    this.spin  = 0;
    // Snapshot the slow config at spawn: { reduction, durationFrames, stacking }.
    this.cfg = cfg || { reduction: 0.33, durationFrames: 180, stacking: false };
  }

  update(player, level) {
    if (!this.alive) return;
    this.age++;
    this.spin += 0.25;
    if (this.age > 150) { this.alive = false; return; }
    this.vy += 0.10;   // gentle arc
    this.x  += this.vx;
    this.y  += this.vy;
    if (level.isSolid(Math.floor(this.y / BLOCK_SIZE), Math.floor(this.x / BLOCK_SIZE))) { this.alive = false; return; }
    if (this.x > player.x && this.x < player.x + player.width &&
        this.y > player.y && this.y < player.y + player.height) {
      if (typeof player.applyWeb === 'function') {
        player.applyWeb(this.cfg.reduction, this.cfg.durationFrames, this.cfg.stacking);
      }
      this.alive = false;
    }
  }

  draw(ctx, camera) {
    if (!this.alive) return;
    const sx = Math.floor(this.x - camera.x);
    const sy = Math.floor(this.y - camera.y);
    if (sx < camera.viewMinX() - 20 || sx > camera.viewMaxX() + 20) return;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(this.spin);
    ctx.strokeStyle = 'rgba(240,240,255,0.85)';
    ctx.lineWidth = 1.5;
    // A little asterisk/web glob.
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(-6 * Math.cos(a), -6 * Math.sin(a));
      ctx.lineTo( 6 * Math.cos(a),  6 * Math.sin(a));
      ctx.stroke();
    }
    ctx.strokeRect(-3, -3, 6, 6);
    ctx.restore();
  }
}

// ── Blaze ─────────────────────────────────────────────────────

class Blaze extends Mob {
  constructor(x, y) {
    super(x, y, 20, 32, 16);
    this.shootTimer  = 90;
    this.floatOffset = Math.random() * Math.PI * 2;
    this.speed       = 1.8;
  }

  update(player, level, blazeShots) {
    this._tickTimers();
    if (this.shootTimer > 0) this.shootTimer--;

    const dir = Math.sign(player.cx - this.cx);
    this.facing = dir;

    // Smart Mobs §4 — only home in on the player once detected; otherwise hover/drift.
    const _chasing = this._shouldChase();
    if (_chasing) {
      // Float toward player vertically, drift horizontally
      const targetY = player.y - 40;
      this.vy = Math.max(-3, Math.min(3, (targetY - this.y) * 0.05));
      this.vx = dir * this.speed;
    } else {
      this.vy = Math.max(-3, Math.min(3, this.vy * 0.9));
      this.vx = this.vx * 0.9;
    }

    // X movement with block collision (bounce off walls)
    const newX  = this.x + this.vx;
    const bRowT = Math.floor((this.y + 2)              / BLOCK_SIZE);
    const bRowB = Math.floor((this.y + this.height - 2) / BLOCK_SIZE);
    const xCol  = this.vx > 0
      ? Math.floor((newX + this.width - 2) / BLOCK_SIZE)
      : Math.floor((newX + 2)             / BLOCK_SIZE);
    if (level.isSolid(bRowT, xCol) || level.isSolid(bRowB, xCol)) {
      this.vx = -this.vx; // bounce
    } else {
      this.x = newX;
    }

    // Y movement with block collision (bounce off ceiling/floor)
    const newY  = this.y + this.vy;
    const bLeft = Math.floor((this.x + 2)              / BLOCK_SIZE);
    const bRight= Math.floor((this.x + this.width - 2) / BLOCK_SIZE);
    const yRow  = this.vy > 0
      ? Math.floor((newY + this.height - 2) / BLOCK_SIZE)
      : Math.floor((newY + 2)              / BLOCK_SIZE);
    if (level.isSolid(yRow, bLeft) || level.isSolid(yRow, bRight)) {
      this.vy = -this.vy; // bounce
    } else {
      this.y = newY;
    }

    // Clamp to world bounds
    if (this.y < 0) { this.y = 0; this.vy = Math.abs(this.vy); }

    // Shoot fireball (only once the player is detected)
    const dist = Math.hypot(player.cx - this.cx, player.cy - this.cy);
    if (_chasing && this.shootTimer === 0 && dist < 400) {
      const angle = Math.atan2(player.cy - this.cy, player.cx - this.cx);
      blazeShots.push(new BlazeShot(
        this.cx, this.cy,
        Math.cos(angle) * 4,
        Math.sin(angle) * 4
      ));
      this.shootTimer = SKELETON_SHOOT_RATE;
    }
  }

  draw(ctx, camera) {
    if (!this.alive) return;
    const osc = Math.sin(Date.now() / 300 + this.floatOffset) * 4;
    const sx  = Math.floor(this.x - camera.x);
    const sy  = Math.floor(this.y + osc - camera.y);
    if (sx < camera.viewMinX() - 40 || sx > camera.viewMaxX() + 40) return;

    ctx.save();
    this._flashAlpha(ctx);

    // Rod body
    ctx.fillStyle = '#FFAA00';
    ctx.fillRect(sx + 7, sy + 10, 6, 18);
    // Head
    ctx.fillStyle = '#FFCC44';
    ctx.fillRect(sx + 4, sy, 12, 12);
    // Eyes
    ctx.fillStyle = '#FF4400';
    ctx.fillRect(sx + 6, sy + 3, 3, 3);
    ctx.fillRect(sx + 11, sy + 3, 3, 3);
    // Flame rods
    ctx.fillStyle = '#FF6600';
    ctx.fillRect(sx + 1,  sy + 8, 3, 12);
    ctx.fillRect(sx + 16, sy + 8, 3, 12);
    ctx.fillRect(sx + 4,  sy + 22, 3, 8);
    ctx.fillRect(sx + 13, sy + 22, 3, 8);

    this._drawHealthBar(ctx, sx, sy);
    ctx.restore();
  }
}

// ── Wither Skeleton ────────────────────────────────────────────

class WitherSkeleton extends Mob {
  constructor(x, y) {
    super(x, y, 22, 50, 20);
    this.speed       = 3.0;
    this.attackTimer = 0;
    this.meleeDamage = 4;
  }

  update(player, level) {
    this._tickTimers();
    if (this.attackTimer > 0) this.attackTimer--;
    if (this.knockbackTimer > 0) { _mobPhysics(this, level); return; }
    // Smart Mobs §8 — low-HP flee takes priority over chasing.
    if (this._fleeIfHurt(player, level)) { _mobPhysics(this, level); return; }
    // Smart Mobs §4 — undetected mobs wander instead of beelining the player.
    if (!this._shouldChase()) { this._wanderUpdate(level, 0.8); _mobPhysics(this, level); return; }

    const dir = Math.sign(player.cx - this.cx);
    const step = this._pathStep(player, level);   // §6 path-aware pursuit (null = legacy)
    if (step) {
      this.vx = step.dir * this.speed;
      if (step.jump && this.onGround) this.vy = JUMP_VELOCITY * step.jumpMult;
    } else {
      this.vx = (Math.sign(this._chaseTargetX(player) - this.cx) || dir) * this.speed;  // §5 surround
      if (this.onGround && level.isSolid(
          Math.floor(this.y / BLOCK_SIZE),
          Math.floor((this.x + (dir > 0 ? this.width + 2 : -2)) / BLOCK_SIZE))) {
        this.vy = JUMP_VELOCITY * 0.95;
      }
    }
    this.facing = dir;

    if (this._touchesPlayer(player) && this.attackTimer === 0 && player.iFrames === 0) {
      player.takeDamage(4, dir);
      this.attackTimer = MOB_ATTACK_RATE;
    }

    _mobPhysics(this, level);
  }

  draw(ctx, camera) {
    if (!this.alive) return;
    const sx = Math.floor(this.x - camera.x);
    const sy = Math.floor(this.y - camera.y);
    if (sx < camera.viewMinX() - 40 || sx > camera.viewMaxX() + 40) return;

    ctx.save();
    this._flashAlpha(ctx);

    // Legs
    ctx.fillStyle = '#1A1A1A';
    ctx.fillRect(sx + 3,  sy + 36, 6, 14);
    ctx.fillRect(sx + 13, sy + 36, 6, 14);
    // Body
    ctx.fillStyle = '#222222';
    ctx.fillRect(sx + 2, sy + 18, 18, 18);
    // Head
    ctx.fillStyle = '#1A1A1A';
    ctx.fillRect(sx + 3, sy + 2, 16, 16);
    // Eyes — glowing white
    ctx.fillStyle = '#DDDDDD';
    ctx.fillRect(sx + (this.facing > 0 ? 14 : 4), sy + 6, 3, 3);
    ctx.fillRect(sx + (this.facing > 0 ? 9  : 9), sy + 6, 3, 3);
    // Stone sword
    ctx.fillStyle = '#888880';
    ctx.fillRect(sx + (this.facing > 0 ? 20 : -3), sy + 22, 3, 16);
    // Arms
    ctx.fillStyle = '#1A1A1A';
    ctx.fillRect(sx - 1,  sy + 20, 5, 12);
    ctx.fillRect(sx + 18, sy + 20, 5, 12);

    this._drawHealthBar(ctx, sx, sy);
    ctx.restore();
  }
}

// ── Enderman ──────────────────────────────────────────────────

class Enderman extends Mob {
  constructor(x, y) {
    super(x, y, 32, 96, 10);
    this.speed            = 2.5;
    this.attackTimer      = 0;
    this.teleportCooldown = 0;   // frames until next teleport allowed
    this.aggroRange       = 10 * BLOCK_SIZE;
    this.meleeDamage      = 5;
  }

  update(player, level) {
    this._tickTimers();
    if (this.attackTimer      > 0) this.attackTimer--;
    if (this.teleportCooldown > 0) this.teleportCooldown--;
    if (this.knockbackTimer   > 0) { _mobPhysics(this, level); return; }

    const dist = Math.hypot(player.cx - this.cx, player.cy - this.cy);
    const aggro = this._shouldChase() && dist < this.aggroRange;  // Smart Mobs §4 gate

    if (aggro) {
      const dir = Math.sign(player.cx - this.cx);
      this.vx     = dir * this.speed;
      this.facing = dir;

      // Jump over obstacles
      if (this.onGround && level.isSolid(
          Math.floor(this.y / BLOCK_SIZE),
          Math.floor((this.x + (dir > 0 ? this.width + 2 : -2)) / BLOCK_SIZE))) {
        this.vy = JUMP_VELOCITY * 0.9;
      }

      // Melee attack
      if (this._touchesPlayer(player) && this.attackTimer === 0 && player.iFrames === 0) {
        player.takeDamage(5, dir);
        this.attackTimer = MOB_ATTACK_RATE;
      }
    } else {
      // Wander slowly
      if (this.onGround) {
        this.vx = (Math.sin(Date.now() / 2000 + this.x / 300) > 0 ? 1 : -1) * 0.8;
        this.facing = Math.sign(this.vx);
      }
    }

    _mobPhysics(this, level);

    // Teleport-on-hit: handled in takeDamage override via teleportCooldown flag
  }

  // Override takeDamage to trigger teleport
  takeDamage(amount, dir) {
    const died = super.takeDamage(amount, dir);
    if (!died && this.teleportCooldown <= 0) {
      this.teleportCooldown = 300;  // 5 seconds
      this._pendingTeleport = true;
    }
    return died;
  }

  // Called from MobManager.update after _mobPhysics to perform teleport
  tryTeleport(level) {
    if (!this._pendingTeleport) return;
    this._pendingTeleport = false;

    const range    = 10 * BLOCK_SIZE;
    const attempts = 8;
    for (let i = 0; i < attempts; i++) {
      const angle  = Math.random() * Math.PI * 2;
      const dist   = (5 + Math.random() * 5) * BLOCK_SIZE;  // 5-10 blocks
      const newX   = this.x + Math.cos(angle) * dist;
      const newY   = this.y + Math.sin(angle) * dist;
      const newCol = Math.floor((newX + this.width / 2) / BLOCK_SIZE);
      const newRow = Math.floor((newY + this.height)    / BLOCK_SIZE);

      // Need solid ground below and 3 free blocks above
      if (!level.isSolid(newRow, newCol))           continue;
      if (level.isSolid(newRow - 1, newCol))        continue;
      if (level.isSolid(newRow - 2, newCol))        continue;
      if (level.isSolid(newRow - 3, newCol))        continue;

      this.x = newCol * BLOCK_SIZE;
      this.y = (newRow - 3) * BLOCK_SIZE - this.height + BLOCK_SIZE;
      this.vx = 0; this.vy = 0;
      if (this._mobManager?.soundCallback) this._mobManager.soundCallback('sounds/enderman-teleport.mp3', 0.7);
      return;
    }
    // No valid spot found — despawn
    this.alive = false;
  }

  draw(ctx, camera) {
    if (!this.alive) return;
    const sx = Math.floor(this.x - camera.x);
    const sy = Math.floor(this.y - camera.y);
    if (sx < camera.viewMinX() - 40 || sx > camera.viewMaxX() + 40) return;

    ctx.save();
    this._flashAlpha(ctx);

    // Legs (long — bottom 48px of 96)
    ctx.fillStyle = '#111111';
    ctx.fillRect(sx + 8,  sy + 64, 6, 32);
    ctx.fillRect(sx + 18, sy + 64, 6, 32);
    // Body (middle 32px)
    ctx.fillStyle = '#1A0A2E';
    ctx.fillRect(sx + 7, sy + 28, 18, 36);
    // Arms (thin, long)
    ctx.fillStyle = '#0E0718';
    ctx.fillRect(sx + 1,  sy + 30, 6, 40);
    ctx.fillRect(sx + 25, sy + 30, 6, 40);
    // Head (top 28px)
    ctx.fillStyle = '#111111';
    ctx.fillRect(sx + 5, sy + 2, 22, 26);
    // Eyes — bright purple
    ctx.fillStyle = '#DD44FF';
    ctx.fillRect(sx + (this.facing > 0 ? 20 : 7),  sy + 8, 4, 4);
    ctx.fillRect(sx + (this.facing > 0 ? 14 : 13), sy + 8, 4, 4);

    this._drawHealthBar(ctx, sx, sy);
    ctx.restore();
  }
}

// ── Item Drop ─────────────────────────────────────────────────

class ItemDrop {
  constructor(x, y, itemKey, amount = 1, pickupDelay = 0) {
    this.x       = x; this.y = y;
    this.vx      = (Math.random() - 0.5) * 4;
    this.vy      = -5;
    this.itemKey = itemKey;
    this.amount  = amount;
    this.life    = ITEM_DROP_LIFETIME;
    this.alive   = true;
    this.pickupDelay = pickupDelay;
    this.bobOffset = Math.random() * Math.PI * 2;
  }

  update(level) {
    if (!this.alive) return;
    this.life--;
    if (this.life <= 0) { this.alive = false; return; }

    // Simple gravity + bounce
    this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
    this.y += this.vy;
    this.x += this.vx;
    this.vx *= 0.96;

    const col = Math.floor(this.x / BLOCK_SIZE);
    const row = Math.floor((this.y + 12) / BLOCK_SIZE);
    if (level.isSolid(row, col)) {
      this.y  = row * BLOCK_SIZE - 12;
      this.vy = this.vy < -1 ? this.vy * -0.4 : 0;
    }
    const rowT = Math.floor(this.y / BLOCK_SIZE);
    if (level.isSolid(rowT, col)) {
      this.y  = (rowT + 1) * BLOCK_SIZE;
      this.vy = 0;
    }
  }

  draw(ctx, camera) {
    if (!this.alive) return;
    const bob = Math.sin(Date.now() / 400 + this.bobOffset) * 2;
    const sx  = Math.floor(this.x - camera.x);
    const sy  = Math.floor(this.y - camera.y + bob);
    if (sx < camera.viewMinX() - 20 || sx > camera.viewMaxX() + 20) return;

    const alpha = this.life < 300 ? (this.life / 300) : 1;
    const SZ = 20, key = this.itemKey;
    ctx.save();
    ctx.globalAlpha = alpha;
    // Render the ACTUAL item so a drop reads like the placed item: block ids via drawBlock
    // (scaled/centred), tools/other as a coloured token with an initial.
    if (typeof key === 'number' && key !== 0 && typeof drawBlock === 'function') {
      ctx.save();
      ctx.translate(sx - SZ / 2, sy - SZ / 2); ctx.scale(SZ / BLOCK_SIZE, SZ / BLOCK_SIZE);
      try { drawBlock(ctx, key, 0, 0, 0, {}); } catch (e) { /* ignore */ }
      ctx.restore();
    } else {
      const td = (typeof TOOL_DATA !== 'undefined') ? TOOL_DATA[key] : null;
      ctx.fillStyle = (td && td.color) || '#FFD700';
      ctx.fillRect(sx - 8, sy - 8, 16, 16);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.strokeRect(sx - 8.5, sy - 8.5, 16, 16);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText((((td && td.name) || String(key)) + '?').charAt(0), sx, sy);
    }
    if (this.amount > 1) { ctx.fillStyle = '#fff'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(this.amount, sx + 10, sy + 11); }
    ctx.restore();
  }
}

// ── Mario-style stomp enemies (jump-attack) ──────────────────────────────────
// GOOMBA: a little mushroom that just patrols; one stomp squishes it flat.
class Goomba extends Mob {
  constructor(x, y) { super(x, y, 24, 22, 1); this.meleeDamage = 1; this.attackTimer = 0; this.speed = 0.9; }
  update(player, level) {
    if (!this.alive) return;
    this._tickTimers();
    if (this.attackTimer > 0) this.attackTimer--;
    if (this.knockbackTimer <= 0) this._wanderUpdate(level, this.speed);   // patrol: reverse at walls/edges
    this.walkTimer += Math.abs(this.vx) > 0.3 ? 0.18 : 0;
    _mobPhysics(this, level);
    if (this.attackTimer === 0 && this._touchesPlayer(player)) { player.takeDamage(this.meleeDamage, Math.sign(player.cx - this.cx) || 1); this.attackTimer = MOB_ATTACK_RATE; }
  }
  onStomp(mgr, p) { this._stompBounce(p); this.squish(mgr); }   // one stomp = squish
  draw(ctx, camera) {
    const sx = Math.floor(this.x - camera.x), sy = Math.floor(this.y - camera.y);
    if (sx > camera.viewMaxX() + 40 || sx + this.width < camera.viewMinX() - 40) return;
    ctx.save(); this._flashAlpha(ctx); this._drawBody(ctx, sx, sy); ctx.restore();
  }
  _drawBody(ctx, sx, sy) {
    const w = this.width, h = this.height;
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(sx + w / 2, sy + h + 1, w * 0.45, 3, 0, 0, 7); ctx.fill();
    if ((this._squishT | 0) > 0) { ctx.fillStyle = '#8B5A2B'; ctx.beginPath(); ctx.ellipse(sx + w / 2, sy + h - 2, w * 0.6, 4, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#000'; ctx.fillRect(sx + w * 0.32, sy + h - 4, 3, 2); ctx.fillRect(sx + w * 0.6, sy + h - 4, 3, 2); return; }
    const sw = Math.sin(this.walkTimer) > 0 ? 1 : 0;
    ctx.fillStyle = '#4A2A14'; ctx.fillRect(sx + 2 + sw, sy + h - 5, 8, 5); ctx.fillRect(sx + w - 10 - sw, sy + h - 5, 8, 5);   // feet
    ctx.fillStyle = '#9B5A2B'; ctx.beginPath(); ctx.moveTo(sx + 1, sy + h * 0.55); ctx.quadraticCurveTo(sx + w / 2, sy - 3, sx + w - 1, sy + h * 0.55); ctx.closePath(); ctx.fill();   // cap dome
    ctx.fillStyle = '#F2DBB3'; ctx.fillRect(sx + 4, sy + h * 0.5, w - 8, h * 0.3);   // face
    ctx.fillStyle = '#000'; ctx.fillRect(sx + 6, sy + h * 0.52, 3, 5); ctx.fillRect(sx + w - 9, sy + h * 0.52, 3, 5);   // eyes
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx + 5, sy + h * 0.48); ctx.lineTo(sx + 10, sy + h * 0.54); ctx.moveTo(sx + w - 5, sy + h * 0.48); ctx.lineTo(sx + w - 10, sy + h * 0.54); ctx.stroke();   // angry brows
  }
}

// KOOPA: a turtle. First stomp knocks its shell off (a kickable Shell spawns + it scurries
// shell-less); a second stomp squishes it.
class Koopa extends Mob {
  constructor(x, y) { super(x, y, 26, 34, 2); this.meleeDamage = 1; this.attackTimer = 0; this.speed = 0.8; this.hasShell = true; }
  update(player, level) {
    if (!this.alive) return;
    this._tickTimers();
    if (this.attackTimer > 0) this.attackTimer--;
    if (this.knockbackTimer <= 0) this._wanderUpdate(level, this.hasShell ? this.speed : this.speed * 2.1);
    this.walkTimer += Math.abs(this.vx) > 0.3 ? 0.15 : 0;
    _mobPhysics(this, level);
    if (this.attackTimer === 0 && this._touchesPlayer(player)) { player.takeDamage(this.meleeDamage, Math.sign(player.cx - this.cx) || 1); this.attackTimer = MOB_ATTACK_RATE; }
  }
  onStomp(mgr, p) {
    this._stompBounce(p);
    if (this.hasShell) { this.hasShell = false; this.height = 24; this.y += 10; if (mgr) mgr.spawnShell(this.cx, this.y + this.height, p.cx < this.cx ? 1 : -1); if (mgr && mgr._onStomp) mgr._onStomp(this); }
    else this.squish(mgr);
  }
  draw(ctx, camera) {
    const sx = Math.floor(this.x - camera.x), sy = Math.floor(this.y - camera.y);
    if (sx > camera.viewMaxX() + 40 || sx + this.width < camera.viewMinX() - 40) return;
    ctx.save(); this._flashAlpha(ctx); this._drawBody(ctx, sx, sy); ctx.restore(); this._drawHealthBar(ctx, sx, sy);
  }
  _drawBody(ctx, sx, sy) {
    const w = this.width, h = this.height, f = this.facing;
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(sx + w / 2, sy + h + 1, w * 0.45, 3, 0, 0, 7); ctx.fill();
    if ((this._squishT | 0) > 0) { ctx.fillStyle = '#2E8B57'; ctx.beginPath(); ctx.ellipse(sx + w / 2, sy + h - 2, w * 0.6, 4, 0, 0, 7); ctx.fill(); return; }
    const sw = Math.sin(this.walkTimer) > 0 ? 1 : 0;
    ctx.fillStyle = '#E8B84B'; ctx.fillRect(sx + 3 + sw, sy + h - 6, 7, 6); ctx.fillRect(sx + w - 10 - sw, sy + h - 6, 7, 6);   // feet
    // head (leans toward facing)
    const hx = sx + (f > 0 ? w - 8 : 2);
    ctx.fillStyle = '#8FD46A'; ctx.fillRect(hx, sy + 2, 8, 9);
    ctx.fillStyle = '#000'; ctx.fillRect(hx + (f > 0 ? 4 : 1), sy + 4, 2, 3);   // eye
    // body / shell
    if (this.hasShell) { ctx.fillStyle = '#2E8B57'; ctx.beginPath(); ctx.ellipse(sx + w / 2, sy + h * 0.6, w * 0.42, h * 0.34, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#F2C14E'; ctx.beginPath(); ctx.ellipse(sx + w / 2, sy + h * 0.6, w * 0.42, h * 0.34, 0, 0, 7); ctx.strokeStyle = '#1C5E3A'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#3AA34A'; ctx.beginPath(); ctx.ellipse(sx + w / 2, sy + h * 0.6, w * 0.28, h * 0.22, 0, 0, 7); ctx.fill(); }
    else { ctx.fillStyle = '#9FE07A'; ctx.fillRect(sx + w * 0.28, sy + h * 0.4, w * 0.44, h * 0.5); }   // shell-less body
  }
}

// SHELL: knocked-off koopa shell. Sits still until touched, then SLIDES fast, KOing any mob
// it hits and hurting the player. Stomping a sliding shell stops it; stomping a still one kicks it.
class Shell extends Mob {
  constructor(x, y, facing) { super(x - 12, y - 18, 24, 18, 9999); this.stompable = true; this.slideState = 'idle'; this.facing = facing || 1; this.meleeDamage = 0; this.slideSpeed = 7; this._kickCd = 10; this.knockbackTimer = 0; }
  update(player, level) {
    if (!this.alive) return;
    this._tickTimers();
    if (this._kickCd > 0) this._kickCd--;
    const px = this.x;
    if (this.slideState === 'idle') {
      this.vx = 0;
      // Kick AWAY from the player, and set vx now: the wall-reverse test at the end of
      // update() compares this frame's x against px, and on the transition frame vx was
      // still 0 — so it read "didn't move" as "hit a wall" and flipped facing before the
      // shell ever travelled. That is why a shell kicked from the left came back leftward.
      // _slideStart suppresses the reverse test for that one frame. (QA F18.)
      if (this._kickCd === 0 && this._touchesPlayer(player)) { this.slideState = 'sliding'; this.facing = (player.cx <= this.cx) ? 1 : -1; this.vx = this.facing * this.slideSpeed; this._slideStart = true; this._kickCd = 12; }
    } else {
      this.vx = this.facing * this.slideSpeed;
      if (this._mobManager) for (const mob of this._mobManager.mobs) {
        if (mob === this || !mob.alive || mob instanceof Shell || (mob._squishT | 0) > 0) continue;
        if (this.x < mob.x + mob.width && this.x + this.width > mob.x && this.y < mob.y + mob.height && this.y + this.height > mob.y) {
          mob.hitCooldown = 0; mob._launched = true; mob._tossDeath = 12; mob._launchFrames = 12; mob._launchSpin = 0.4; mob.vx = this.facing * 5; mob.vy = -7; mob.takeDamage(9999, this.facing);   // KO with a spin toss
        }
      }
      if (this._kickCd === 0 && this._touchesPlayer(player)) { player.takeDamage(2, this.facing); this._kickCd = 22; }
    }
    _mobPhysics(this, level);
    // Wall bounce — but never on the frame the kick started (see above).
    if (this.slideState === 'sliding' && !this._slideStart && Math.abs(this.x - px) < 0.8 && this.onGround) { this.facing *= -1; }
    this._slideStart = false;
  }
  onStomp(mgr, p) {
    this._stompBounce(p);
    if (this.slideState === 'sliding') { this.slideState = 'idle'; this.vx = 0; this._kickCd = 12; }
    else { this.slideState = 'sliding'; this.facing = (p.cx <= this.cx) ? 1 : -1; this.vx = this.facing * this.slideSpeed; this._slideStart = true; this._kickCd = 12; }
  }
  draw(ctx, camera) {
    const sx = Math.floor(this.x - camera.x), sy = Math.floor(this.y - camera.y);
    if (sx > camera.viewMaxX() + 40 || sx + this.width < camera.viewMinX() - 40) return;
    const w = this.width, h = this.height;
    ctx.save(); this._flashAlpha(ctx);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(sx + w / 2, sy + h + 1, w * 0.45, 3, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#2E8B57'; ctx.beginPath(); ctx.ellipse(sx + w / 2, sy + h * 0.55, w * 0.5, h * 0.55, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#F2C14E'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(sx + w / 2, sy + h * 0.55, w * 0.5, h * 0.55, 0, 0, 7); ctx.stroke();
    ctx.strokeStyle = '#1C5E3A'; ctx.lineWidth = 1.5; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(sx + w / 2 + i * 6, sy + 2); ctx.lineTo(sx + w / 2 + i * 8, sy + h - 2); ctx.stroke(); }
    ctx.restore();
  }
}

// ── Mob Manager ───────────────────────────────────────────────

class MobManager {
  constructor() {
    this.mobs         = [];
    this.arrows       = [];
    this.damageNums   = [];
    this.xpOrbs       = [];
    this.explosions      = [];
    this.explosionEvents = []; // consumed by game.js for particles/shake
    this.spawnPoints     = [];
    this.playerArrows = [];
    this.blazeShots   = [];
    this.webs         = [];   // Smart Mobs §9 — spider web projectiles
    this.droppedItems = [];
    this.dropConfig   = null;  // set by game.js to _mobDropSettings
    this.nightSpawnMultiplier = 1.0;
    this.fullMoonActive       = false;
    this.fullMoonHpMult       = 1.5;
    this.onlinePlayers = []; // online player stubs for multi-target aggro (host only)
    this.soundCallback        = null;  // set by game.js: fn(file, volMult?)
    this.dropCallback         = null;  // set by game.js: fn(items) — called when mob drops items (used for online relay)
    this.onKill               = null;  // set by game.js (arena): fn(ownerId, mob) — a player arrow killed a mob
    this._camera              = null;  // set by game.js after Camera is created
    this.arenaMode            = false; // Phase 3A.2: arena spawners (on-screen, per-spawner freq/cap)
    // Smart Mobs §4 — detection config (set by game.js each frame from world settings;
    // null/disabled = legacy behavior). Shape: { enabled, sight, sound, action,
    // sightRange, sightArcDeg, packAlert, packRadius }. Noise radii are computed on the
    // player side (game._emitMovementNoise / action noise) and fed via emitNoise().
    this.detectCfg            = null;
    // Smart Mobs §8 — per-mob-type low-HP behavior config: { <key>: {action, threshold} }.
    this.fleeCfg              = null;
    // Smart Mobs §9 — spider-web slow config (null/disabled = spiders don't spit webs).
    this.webCfg               = null;
    // Smart Mobs §6 — wayfinding config: { enabled, searchRadius, recompute, maxExpansions }.
    // null/disabled = legacy straight-line chase (own opt-in toggle, independent of detection).
    this.pathCfg              = null;
    this._activePathCount     = 0;     // §6 — mobs actively wayfinding last frame (crowd throttle)
  }

  // Set up spawn points from world data
  setupSpawnPoints(spawnPoints) {
    this.spawnPoints = spawnPoints.map(sp => ({ ...sp }));
  }

  // Spawn initial mobs from spawn points within activation range
  _updateSpawnPoints(player, level) {
    // Arena spawners are the OPPOSITE of ambient spawning: they intentionally
    // spawn on-screen, ignore min-distance, and cap per-spawner rather than by a
    // global proximity rule. Phase 3A.2.
    if (this.arenaMode) { this._updateArenaSpawnPoints(level); return; }

    // Smart Mobs — one-time initial burst: on the first update of a freshly
    // started (not resumed) level, populate every egg within range of the START
    // position at once, regardless of the player's position.
    if (!this._initialBurstDone) this.spawnInitialBurst(level, player.x + player.width / 2);

    // Collect all player centers: host + online joiners
    const playerCenters = [player.x + player.width / 2];
    for (const op of this.onlinePlayers || []) {
      playerCenters.push(op.x + PLAYER_W / 2);
    }

    for (const sp of this.spawnPoints) {
      const spx = sp.col * BLOCK_SIZE;

      // Find nearest player center for distance/screen checks
      let minDist = Infinity, nearestCx = playerCenters[0];
      for (const cx of playerCenters) {
        const d = Math.abs(spx - cx);
        if (d < minDist) { minDist = d; nearestCx = cx; }
      }

      // Only activate within range, but never spawn too close to any player
      if (minDist > MOB_ACTIVATION_RANGE) continue;
      if (minDist < MOB_MIN_SPAWN_DIST)   continue;

      // Don't respawn if spawn point is on any player's screen
      let onScreen = false;
      for (const cx of playerCenters) {
        if (spx >= cx - CANVAS_W / 2 && spx <= cx + CANVAS_W / 2) { onScreen = true; break; }
      }
      if (onScreen) continue;

      // Count alive mobs near this spawn
      const nearbyAlive = this.mobs.filter(m => {
        return m.alive && Math.abs(m.cx - spx) < 200;
      }).length;
      if (nearbyAlive > 0) continue;

      // Respawn timer
      if (sp.timer > 0) { sp.timer--; continue; }

      // Spawn a mob
      let gr = sp.row;
      while (gr < level.height - 1 && !level.isSolid(gr, sp.col)) gr++;
      const mx = sp.col * BLOCK_SIZE;
      const my = gr * BLOCK_SIZE;
      const mob = this._createMob(sp.mobTypeName, mx, my);
      if (mob) this.mobs.push(mob);
      const isSurfaceMob = sp.mobTypeName === 'Zombie' || sp.mobTypeName === 'Skeleton' || sp.mobTypeName === 'Creeper';
      const timerMult = isSurfaceMob ? this.nightSpawnMultiplier : 1.0;
      sp.timer = Math.round(MOB_RESPAWN_FRAMES * timerMult);
    }
  }

  // Smart Mobs — spawn every non-arena spawn point within activation range of the
  // START position ONCE, bypassing the min-distance / on-screen / clustering gates
  // that normally suppress ambient spawning (so a dense cluster of eggs by the
  // start all populate on load). Far-away eggs still wait for ambient spawning.
  // Fires once per fresh level load (suppressed on resume via adoptSerializedMobs).
  spawnInitialBurst(level, startCx) {
    this._initialBurstDone = true;
    if (this.arenaMode) return;
    for (const sp of this.spawnPoints) {
      if (sp.active === false) continue;
      if (Math.abs(sp.col * BLOCK_SIZE - startCx) > MOB_ACTIVATION_RANGE) continue;  // far eggs still gated
      if (sp.timer > 0) continue;
      let gr = sp.row;
      while (gr < level.height - 1 && !level.isSolid(gr, sp.col)) gr++;
      const mob = this._createMob(sp.mobTypeName, sp.col * BLOCK_SIZE, gr * BLOCK_SIZE);
      if (mob) this.mobs.push(mob);
      const isSurfaceMob = sp.mobTypeName === 'Zombie' || sp.mobTypeName === 'Skeleton' || sp.mobTypeName === 'Creeper';
      sp.timer = Math.round(MOB_RESPAWN_FRAMES * (isSurfaceMob ? this.nightSpawnMultiplier : 1.0));
    }
  }

  // Arena spawner update (Phase 3A.2): per-spawner cadence + active cap, no
  // screen/min-distance suppression. Each spawned mob is tagged with its spawn
  // point index so the cap is counted per-spawner.
  _updateArenaSpawnPoints(level) {
    for (let i = 0; i < this.spawnPoints.length; i++) {
      const sp = this.spawnPoints[i];
      if (sp.active === false) continue;

      // Per-spawner active cap.
      const cap = Math.max(1, sp.maxActiveMobs ?? 3);
      const aliveHere = this.mobs.filter(m => m.alive && m.spawnPointIdx === i).length;
      if (aliveHere >= cap) continue;

      // Per-spawner cadence (spawnFrequency = mobs per 10s; 600 frames ≈ 10s @60fps).
      if (sp.timer > 0) { sp.timer--; continue; }

      let gr = sp.row;
      while (gr < level.height - 1 && !level.isSolid(gr, sp.col)) gr++;
      const mob = this._createMob(sp.mobTypeName, sp.col * BLOCK_SIZE, gr * BLOCK_SIZE);
      if (mob) { mob.spawnPointIdx = i; this.mobs.push(mob); }

      const freq = Math.max(1, sp.spawnFrequency ?? 2);
      sp.timer = Math.max(1, Math.round(600 / freq));
    }
  }

  _createMob(typeName, mx, my) {
    let mob;
    switch (typeName) {
      case 'Zombie':         mob = new Zombie(mx - 11, my - 48);         break;
      case 'Skeleton':       mob = new Skeleton(mx - 9, my - 44);        break;
      case 'Creeper':        mob = new Creeper(mx - 10, my - 44);        break;
      case 'CaveSpider':     mob = new CaveSpider(mx - 8, my - 16);      break;
      case 'Piglin':         mob = new Piglin(mx - 10, my - 44);         break;
      case 'Blaze':          mob = new Blaze(mx - 10, my - 52);          break;
      case 'WitherSkeleton': mob = new WitherSkeleton(mx - 11, my - 50); break;
      case 'Enderman':       mob = new Enderman(mx - 16, my - 96);       break;
      case 'Goomba':         mob = new Goomba(mx - 12, my - 22);         break;
      case 'Koopa':          mob = new Koopa(mx - 13, my - 34);         break;
      default: return null;
    }
    if (mob) {
      mob._mobManager = this;  // back-ref so mobs can trigger sounds
      if (this.fullMoonActive) {
        const fm = this.fullMoonHpMult || 1.5;
        mob.hp    = Math.ceil(mob.hp    * fm);
        mob.maxHp = Math.ceil(mob.maxHp * fm);
      }
      // Arena mob-difficulty preset (Phase 3A.3): scale HP for every arena-created mob.
      if (this.arenaMobHpMult && this.arenaMobHpMult !== 1) {
        mob.maxHp = Math.max(1, Math.round(mob.maxHp * this.arenaMobHpMult));
        mob.hp    = mob.maxHp;
      }
      // Arena mob speed (Phase 3A.3): ×2 in arena; survival waves bump it further.
      if (this.arenaMobSpeedMult) mob.speedMult = this.arenaMobSpeedMult;
    }
    return mob;
  }

  // Rebuild real mobs from serialized snapshots — used when a joiner is promoted
  // to host so the SAME mobs (type/position/hp/id) persist and keep simulating,
  // rather than despawning and respawning fresh under the new host.
  adoptSerializedMobs(snapshots) {
    this._initialBurstDone = true;   // resuming a save restores mobs → skip the fresh-load spawn burst
    let maxId = 0;
    for (const m of snapshots || []) {
      if (!m || m.alive === false) continue;
      const mob = this._createMob(m.type, m.x, m.y);
      if (!mob) continue;
      mob.x = m.x; mob.y = m.y;
      if (m.hp    != null)        mob.hp    = m.hp;
      if (m.maxHp != null)        mob.maxHp = m.maxHp;
      if (m.id    != null)        { mob.id = m.id; maxId = Math.max(maxId, m.id); }
      if (m.flipped !== undefined) mob.facing = m.flipped ? 1 : -1;
      if (m.state)                 mob.state = m.state;
      if (m.walkTimer   != null)   mob.walkTimer   = m.walkTimer;
      if (m.hitCooldown != null)   mob.hitCooldown = m.hitCooldown;
      if (m.fusing  !== undefined) mob.fusing = m.fusing;
      if (m.fuseTimer != null)     mob.fuseTimer = m.fuseTimer;
      this.mobs.push(mob);
    }
    // Keep the id counter ahead of any restored ids so later spawns stay unique.
    if (maxId > Mob._nextId) Mob._nextId = maxId;
  }

  // Drop a kickable Koopa shell into the mob list (behaves like a mob: updates/draws/stomps).
  spawnShell(x, y, facing) { const s = new Shell(x, y, facing); s._mobManager = this; this.mobs.push(s); return s; }

  addPlayerArrow(x, y, vx, vy, damage, owner = 'p1', opts = null) {
    const a = new Arrow(x, y, vx, vy, damage, BOW_GRAVITY, true);
    a.owner = owner; // arena kill attribution ('p1' | 'p2')
    if (opts && opts.chargeGlow != null) a._chargeGlow = opts.chargeGlow; // §Follow-up — charged arrow glows in flight
    if (opts && opts.pierce)      a.pierce      = true; // Smart Mobs §2 — Crossbow trait
    if (opts && opts.trident)     a.isTrident   = true; // Smart Mobs §2 — thrown Trident
    if (opts && opts.recoverable) a.recoverable = true; // Smart Mobs §6 — sticks + collectable on a clean miss
    if (opts && opts.guided)      a.guided      = true; // Smart Mobs §6 — steerable in flight (trident, boomerang)
    if (opts && opts.gravity != null) a.gravity = opts.gravity; // Trident throw = straight (low gravity)
    if (opts && opts.boomerang) {                       // §Phase 3 — auto-returning boomerang
      a.boomerang = true; a.pierce = true; a.gravity = 0; a.guided = true;
      a._boomOX = x; a._boomOY = y;
      a._boomRange     = opts.range   != null ? opts.range   : BOOM_RANGE_BLOCKS * BLOCK_SIZE;
      a._boomSpeed     = opts.speed   != null ? opts.speed   : BOOM_SPEED;
      a._boomDecelPct  = opts.decelPct!= null ? opts.decelPct: BOOM_DECEL_PCT;
      a._boomMinMult   = BOOM_MIN_SPEED_MULT;
      a._boomReturnMult= opts.returnMult != null ? opts.returnMult : BOOM_RETURN_MULT;
      a._boomLook      = opts.look || '2d';
      a._boomWall      = opts.wall || 'pass';        // §F 'pass' | 'stop'
      a._boomOnBlock   = opts.onBlock || 'earlyReturn'; // §F 'earlyReturn' | 'stick'
      a._boomReturnMode= opts.returnMode || 'auto';  // §F 'auto' | 'click'
      a._spinRate      = BOOM_SPIN_RATE;
    }
    this.playerArrows.push(a);
    return a; // caller may hold the ref (Trident recovery / stick tracking)
  }

  // Owner-tagged list of live local players for PvP hit detection (Phase 3B).
  // Each player carries `_ownerId` ('p1'..'p4', set by the game when arming);
  // fall back to positional ids for safety. Online PvP is deferred (3D).
  _pvpPlayerList(allPlayers) {
    return (allPlayers || []).map((p, k) => [p._ownerId || ('p' + (k + 1)), p]);
  }

  // ── Smart Mobs §4 — detection ─────────────────────────────────────────────
  // Hand the shared config to the mob (drives its `_shouldChase()` gate) and run the
  // SIGHT axis: a mob sees the player only within range, inside its FRONTAL arc (so you
  // can sneak up from behind), and with an unobstructed line (solid blocks + bushes
  // occlude — game._blocksSight / foliageOccludesSight). Sound + action axes alert via
  // emitNoise() from the player side. Alerting is sticky (instant per-axis model, §4).
  _updateDetection(mob, target, level) {
    const cfg = this.detectCfg;
    mob._detect = cfg;
    if (!cfg || !cfg.enabled || mob._alerted || !cfg.sight || !target || !level) return;
    const ex = mob.cx,       ey = mob.y + mob.height * 0.3;
    const tx = target.cx,    ty = target.y + target.height * 0.3;
    const dist = Math.hypot(tx - ex, ty - ey);
    if (dist > (cfg.sightRange || 0)) return;
    // Frontal arc around the mob's facing (±half the configured cone).
    const ang     = Math.atan2(ty - ey, tx - ex);
    const faceAng = mob.facing >= 0 ? 0 : Math.PI;
    let diff = Math.abs(ang - faceAng);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    if (diff > ((cfg.sightArcDeg || 360) * Math.PI / 180) / 2) return;
    if (this._lineBlocked(level, ex, ey, tx, ty)) return;
    this._alert(mob, 'sight');
  }

  // Sample the segment (mob→player) every half-block; any solid block OR bush occludes.
  _lineBlocked(level, x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const dist  = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / (BLOCK_SIZE * 0.5)));
    for (let i = 1; i < steps; i++) {      // skip the endpoints (mob + player cells)
      const t   = i / steps;
      const col = Math.floor((x0 + dx * t) / BLOCK_SIZE);
      const row = Math.floor((y0 + dy * t) / BLOCK_SIZE);
      if (level.isSolid(row, col)) return true;
      const b = level.grid && level.grid[row] ? level.grid[row][col] : undefined;
      if (b !== undefined && typeof foliageOccludesSight === 'function' && foliageOccludesSight(b)) return true;
    }
    return false;
  }

  // Latch a mob to alerted. `_alertSource` records the origin for §5 pack propagation.
  _alert(mob, source) {
    if (!mob || mob._alerted) return;
    mob._alerted     = true;
    mob._alertSource = source || 'unknown';
  }

  // A noise at (x,y) reaches every un-alerted mob within `radius`. `axis` = 'sound'
  // (footsteps/landings/loud blocks) or 'action' (attacks/jumps) — each gated by its
  // own toggle. Sound is NOT line-of-sight limited (you hear through walls). Called
  // from the player side (game._emitMovementNoise / action noise).
  emitNoise(x, y, radius, axis) {
    const cfg = this.detectCfg;
    if (!cfg || !cfg.enabled || !(radius > 0)) return;
    if (axis === 'action' ? !cfg.action : !cfg.sound) return;
    const r2 = radius * radius;
    for (const mob of this.mobs) {
      if (!mob.alive || mob._alerted) continue;
      const dx = mob.cx - x, dy = mob.cy - y;
      if (dx * dx + dy * dy <= r2) this._alert(mob, axis || 'sound');
    }
  }

  // Smart Mobs §5 — PACK alert propagation. Any alerted mob rouses un-alerted mobs
  // within packRadius (one hop per frame — we snapshot the alerted set first, so a
  // freshly-roused mob only spreads it further next frame; the alert ripples outward
  // rather than flooding the level in a single frame).
  _propagatePackAlerts() {
    const cfg = this.detectCfg;
    if (!cfg || !cfg.enabled || !cfg.packAlert) return;
    const r2 = cfg.packRadius * cfg.packRadius;
    const sources = this.mobs.filter(m => m.alive && m._alerted);
    if (!sources.length) return;
    for (const src of sources) {
      for (const m of this.mobs) {
        if (!m.alive || m._alerted) continue;
        const dx = m.cx - src.cx, dy = m.cy - src.cy;
        if (dx * dx + dy * dy <= r2) this._alert(m, 'pack');
      }
    }
  }

  // Smart Mobs §5 — SURROUND. When several melee mobs converge on the player they
  // otherwise stack on the near side; assign them alternating sides so some flank to
  // the far side. `_flankOffset` shifts each mob's LEGACY chase target past the player
  // toward its side; when §6 path-aware is ON, `_pathFlankBias` instead pushes each
  // mob's path GOAL past the player so flankers route AROUND to the far side properly
  // (the real-pathfinding surround upgrade the §6 brief asked for).
  _assignSurround(player) {
    for (const m of this.mobs) { m._flankOffset = 0; m._pathFlankBias = 0; }  // reset (also disabled case)
    const cfg = this.detectCfg;
    if (!cfg || !cfg.enabled || !cfg.packAlert || !player) return;
    const pathOn = !!(this.pathCfg && this.pathCfg.enabled);
    const near = this.mobs.filter(m => m.alive && m._alerted &&
      (m instanceof Zombie || m instanceof CaveSpider || m instanceof Piglin || m instanceof WitherSkeleton) &&
      Math.abs(m.cx - player.cx) < 8 * BLOCK_SIZE);
    if (near.length < 2) return;
    // Closest first, then alternate the assigned side so the group splits around the
    // player instead of piling onto whichever side they approached from.
    near.sort((a, b) => Math.abs(a.cx - player.cx) - Math.abs(b.cx - player.cx));
    near.forEach((m, i) => {
      const side = (i % 2 === 0 ? 1 : -1);
      m._flankOffset = side * 1.5 * BLOCK_SIZE;
      // Path mode: bias the GOAL further past the player so the pathfinder routes the
      // flanker to a cell clearly on the far side (not overlapping the near-side stack).
      if (pathOn) m._pathFlankBias = side * PATH_FLANK_BIAS_BLOCKS * BLOCK_SIZE;
    });
  }

  // Smart Mobs §6 — return the path config to hand mobs THIS frame, degraded when a
  // crowd is already wayfinding (per last frame's `_activePathCount`). Above
  // PATH_CROWD_THRESHOLD active pathers, routes recompute less often + over a smaller
  // radius (fewer + cheaper A* runs). Returns the base cfg unchanged when uncrowded or
  // path-aware is off. The threshold/multipliers are tunable perf levers (constants.js).
  // Bounded pathfinding — pick which mobs get to be "smart" (run A*) this frame: the
  // nearest MOB_PATH_BUDGET actively-chasing, in-range mobs. Returns a Set of those mobs,
  // or null when there are few enough in range that no restriction is needed. Everyone
  // NOT in the set falls back to the cheap legacy beeline+hop. This is the core of the
  // "simple nav for most mobs, smart nav for a few" design (Kevin's suggestion) and is
  // what actually holds the framerate with a big group — A* is far too costly per call
  // to run on every mob every recompute.
  _selectPathfinders(player, player2, cfg) {
    if (!cfg || !cfg.enabled) return null;
    const R = cfg.searchRadius;
    const inRange = [];
    for (const m of this.mobs) {
      if (!m.alive) continue;
      const t = this._nearestPlayer(m.cx, m.cy, player, player2);
      if (!t) continue;
      const dc = Math.abs(m.cx - t.cx) / BLOCK_SIZE, dr = Math.abs(m.cy - t.cy) / BLOCK_SIZE;
      if (dc > R || dr > R) continue;                 // out of pathfind range → beelines anyway
      inRange.push({ m, d: dc + dr });
    }
    if (inRange.length <= MOB_PATH_BUDGET) return null;   // few enough → no restriction
    inRange.sort((a, b) => a.d - b.d);
    return new Set(inRange.slice(0, MOB_PATH_BUDGET).map(x => x.m));
  }

  _crowdAdjustedPathCfg() {
    const cfg = this.pathCfg;
    if (!cfg || !cfg.enabled) return cfg;
    if ((this._activePathCount || 0) <= PATH_CROWD_THRESHOLD) return cfg;
    return {
      enabled:       true,
      recompute:     Math.round(cfg.recompute * PATH_CROWD_RECOMPUTE_MULT),
      searchRadius:  Math.max(8, Math.round(cfg.searchRadius * PATH_CROWD_RADIUS_MULT)),
      maxExpansions: Math.round(cfg.maxExpansions * PATH_CROWD_RADIUS_MULT),
      _degraded:     true,   // (diagnostic marker; harmless if read elsewhere)
    };
  }

  // Smart Mobs §7 — which mobs can sprint: ground melee chasers only (ranged kiters +
  // Enderman + Blaze excluded).
  _isSprinter(mob) {
    return mob instanceof Zombie || mob instanceof Piglin ||
           mob instanceof WitherSkeleton || mob instanceof CaveSpider;
  }

  // Telegraphed sprint state machine (per mob). Phases via timers:
  //   idle → (chance) telegraph (slow wind-up + pulsing cue) → burst (speed×) → cooldown.
  // `_sprintBoost` (read by _mobPhysics) is the only movement effect; `_sprintTele` also
  // drives the visual cue drawn in draw(). Gated by its OWN toggle (independent of the
  // master detection toggle) so a designer can add sprinting mobs without full stealth.
  _updateSprint(mob, target) {
    mob._sprintBoost = 1;
    const cfg = this.detectCfg;
    if (!cfg || !cfg.sprintMobs || !this._isSprinter(mob) || !target || mob.knockbackTimer > 0) {
      mob._sprintTele = 0; mob._sprintRun = 0; return;
    }
    if (mob._sprintTele > 0) {                       // winding up (telegraph)
      mob._sprintBoost = SPRINT_WINDUP_MULT;
      if (--mob._sprintTele <= 0) mob._sprintRun = SPRINT_RUN_FRAMES;
    } else if (mob._sprintRun > 0) {                 // bursting
      mob._sprintBoost = SPRINT_SPEED_MULT;
      if (--mob._sprintRun <= 0) mob._sprintCd = SPRINT_COOLDOWN;
    } else if (mob._sprintCd > 0) {                  // recovering
      mob._sprintCd--;
    } else if (mob.onGround && mob._shouldChase()) {  // eligible to start
      const dist = Math.abs(target.cx - mob.cx);
      if (dist > SPRINT_MIN_BLOCKS * BLOCK_SIZE && dist < SPRINT_MAX_BLOCKS * BLOCK_SIZE &&
          Math.random() < SPRINT_TRIGGER_CHANCE) {
        mob._sprintTele = SPRINT_TELE_FRAMES;
        // Audible cue = the mob's own voice (existing assets, so it works out of the box).
        if (this.soundCallback) {
          const snd = mob instanceof Piglin ? 'sounds/mob-piglin.mp3'
                    : mob instanceof WitherSkeleton ? 'sounds/mob-skeleton.mp3'
                    : 'sounds/mob-zombie.mp3';
          this.soundCallback(snd, 0.55);
        }
      }
    }
  }

  // Returns the closest live player to (cx, cy) among all local players (P1-P4)
  // + online players. Falls back to the passed p1/p2 if the target list isn't
  // set yet. Dead players (hp <= 0) are skipped unless none are alive.
  _nearestPlayer(cx, cy, p1, p2) {
    const locals = (this._targetPlayers && this._targetPlayers.length)
      ? this._targetPlayers
      : [p1, p2].filter(p => p);
    let best = p1 || locals[0], bestD = Infinity;
    for (const p of [...locals, ...this.onlinePlayers]) {
      if (!p || p.hp <= 0) continue;
      const d = Math.hypot(p.cx - cx, p.cy - cy);
      if (d < bestD) { best = p; bestD = d; }
    }
    return best;
  }

  // Called from game._update; returns amount of damage dealt to player this frame.
  // Phase 3B — extraPlayers carries P3/P4 so targeting/arrows/PvP see all players.
  update(player, level, player2 = null, extraPlayers = null) {
    _MOB_PATH_STATS.calls = 0; _MOB_PATH_STATS.ms = 0;   // perf triage: A* calls this frame
    const hpBefore = player.hp;
    // All live local players this frame (used for targeting + enemy arrows + PvP).
    const allPlayers = [player, player2, ...(extraPlayers || [])].filter(p => p);
    this._targetPlayers = allPlayers;

    // Spawn point respawn
    this._updateSpawnPoints(player, level);

    // Smart Mobs §5 — pack behavior: propagate alerts to nearby mobs + assign surround
    // sides (both no-ops unless packAlert is on). Runs before the AI loop so this
    // frame's chase uses the updated alert flags + flank offsets.
    this._propagatePackAlerts();
    this._assignSurround(player);

    // Smart Mobs §6 — crowd-adaptive pathfinding. When MANY mobs are actively
    // wayfinding at once the per-frame A* cost adds up (Kevin saw slowdown ~10 on
    // screen), so above a threshold we hand every mob a DEGRADED config — routes
    // recompute less often + search a smaller radius — trading pursuit snappiness
    // for framerate. Uses LAST frame's active count (1-frame lag is imperceptible).
    const pathCfgEff = this._crowdAdjustedPathCfg();
    // Bounded pathfinding (perf): pick the NEAREST few in-range chasers to be the "smart"
    // (pathfinding) mobs this frame; everyone else beelines. Plus a shared per-FRAME cap
    // on actual A* runs so the cost can't spike no matter the crowd size (see constants).
    const budgetSet = this._selectPathfinders(player, player2, pathCfgEff);
    this._frameRecomputes = { left: MOB_PATH_RECOMPUTES_PER_FRAME };   // shared per-frame A* token

    // Mob AI — each mob targets the nearest active player
    let _pathingNow = 0;
    const _loopT = _mobNow();
    for (const mob of this.mobs) {
      if (!mob.alive) continue;
      // Smart Mobs §2 — slide-attack launch: spin in the air (AI already suppressed
      // via knockbackTimer, which we keep topped up), then resume AI, or vanish if
      // this was a killing toss. Physics (gravity) still runs via the mob's update.
      if (mob._launched) {
        mob._spinAngle = (mob._spinAngle || 0) + (mob._launchSpin || 0.3);
        if (mob._tossDeath > 0) { mob.knockbackTimer = 3; if (--mob._tossDeath <= 0) mob.alive = false; }
        else if (--mob._launchFrames <= 0) { mob._launched = false; mob._spinAngle = 0; }
        else { mob.knockbackTimer = Math.max(mob.knockbackTimer, 3); }
        if (!mob.alive) continue;   // toss-death expired this frame → let the filter reap it
      }
      // Jump-attack / STOMP (world setting, default on): a player FALLING onto a mob's head
      // hits it from above (squish / lose shell / bounce) instead of taking contact damage.
      // Checked before the mob's own update so its contact hit never lands on the same frame.
      if (this._jumpAttack !== false && mob.alive && mob.stompable !== false && (mob._squishT | 0) === 0) {
        let stomped = false;
        for (const pl of allPlayers) { if (pl && !pl.dead && mob._isStomp(pl)) { mob.onStomp(this, pl); stomped = true; break; } }
        if (stomped) continue;   // skip AI + contact damage this frame
      }
      if ((mob._squishT | 0) > 0) { if (--mob._squishT <= 0) mob.alive = false; mob.vx = 0; continue; }   // being squished — hold, flatten, then reap
      const target = this._nearestPlayer(mob.cx, mob.cy, player, player2);
      this._updateDetection(mob, target, level);   // Smart Mobs §4 — sight axis + gate
      this._updateSprint(mob, target);             // Smart Mobs §7 — telegraphed sprint
      mob._flee = this.fleeCfg ? this.fleeCfg[MOB_CLASS_KEY[mob.constructor.name]] : null;  // §8
      mob._pathCfg = (pathCfgEff && (!budgetSet || budgetSet.has(mob))) ? pathCfgEff : null;  // §6 — budgeted: only the nearest few are "smart"
      mob._recomputeBudget = this._frameRecomputes;   // shared per-frame A* cap (all mobs reference the one token)
      mob._wayfinding = false;                     // reset each frame; _pathStep sets it true if pathing
      if (mob instanceof Skeleton) {
        mob.update(target, level, this.arrows);
      } else if (mob instanceof Blaze) {
        mob.update(target, level, this.blazeShots);
      } else if (mob instanceof CaveSpider) {
        mob._webCfg = this.webCfg;                 // Smart Mobs §9
        mob.update(target, level, this.webs);
      } else {
        mob.update(target, level);
      }
      if (mob._wayfinding) _pathingNow++;          // §6 crowd count (set by Mob._pathStep)
      if (mob instanceof Enderman) mob.tryTeleport(level);
      // Kill mobs that are standing in lava
      if (mob.alive) {
        const mobMidCol = Math.floor(mob.cx / BLOCK_SIZE);
        const mobMidRow = Math.floor((mob.y + mob.height * 0.7) / BLOCK_SIZE);
        if (level.get(mobMidRow, mobMidCol) === BLOCK.LAVA) {
          mob.alive = false;
        }
      }
      // Consume pending explosion from Creeper
      if (mob instanceof Creeper && mob.explosionPending) {
        const ep = mob.explosionPending;
        mob.explosionPending = null;
        this._doExplosion(ep, level);
      }
    }
    this._activePathCount = _pathingNow;           // §6 — feeds next frame's crowd throttle
    const _loopMs = _loopT ? _mobNow() - _loopT : 0;   // whole AI loop (incl. A*, physics, per-mob)
    this._pathStats = { calls: _MOB_PATH_STATS.calls, ms: _MOB_PATH_STATS.ms, loop: _loopMs, count: this.mobs.length };  // perf HUD

    // Skeleton/enemy arrows
    this.arrows = this.arrows.filter(a => { a.update(allPlayers, level); if (a._justDeflected) { a._justDeflected = false; this.soundCallback?.('sounds/blocked-shot.mp3', 0.7); } return a.alive; });

    // Deflected enemy arrows — check mob collisions
    for (const a of this.arrows) {
      if (!a.alive || !a.isPlayerArrow) continue;
      for (const mob of this.mobs) {
        if (!mob.alive) continue;
        if (a.x > mob.x && a.x < mob.x + mob.width &&
            a.y > mob.y && a.y < mob.y + mob.height) {
          const dir = Math.sign(a.vx);
          if (mob.takeDamage(a.damage, dir)) {
            this.damageNums.push(new DamageNumber(mob.cx, mob.y - 8, a.damage, '#FF6600'));
          }
          a.alive = false;
          break;
        }
      }
    }

    // Player arrows — check mob collisions, then (PvP only) player collisions.
    // Phase 3B: when this.pvpEnabled, a player arrow that misses every mob can
    // damage any OTHER player (owner-tagged 'p1'/'p2'/...). OFF by default so
    // co-op is unaffected. Tagged list built once; carries forward to N players.
    const pvpTargets = this.pvpEnabled ? this._pvpPlayerList(allPlayers) : null;
    // Team play (CTF, Phase 3C): map ownerId → teamId so arrows never hit a teammate.
    // teamId is null outside team modes, so this is a no-op for FFA Deathmatch/KotH.
    const teamOf = {};
    if (pvpTargets) for (const [id, p] of pvpTargets) teamOf[id] = p ? p.teamId : null;
    for (const pa of this.playerArrows) {
      pa.update(player, level);
      // §Phase R — fire a Target Block at the moment of collision (before dead/pierce arrows are
      // filtered below, so a crossbow bolt that doesn't stick still triggers it).
      if (pa._blockHit && !pa._blockHitDone) { pa._blockHitDone = true; if (this.onTargetHit) this.onTargetHit(pa._blockHit.col, pa._blockHit.row); }
      if (!pa.alive || pa.stuck) continue;   // stuck projectiles rest until picked up
      for (const mob of this.mobs) {
        if (!mob.alive) continue;
        // Piercing arrows (Crossbow) pass through, hitting each mob at most once.
        if (pa.pierce && pa._hitMobs && pa._hitMobs.has(mob)) continue;
        if (pa.x > mob.x && pa.x < mob.x + mob.width &&
            pa.y > mob.y && pa.y < mob.y + mob.height) {
          const dir = Math.sign(pa.vx);
          if (mob.takeDamage(pa.damage, dir)) {
            this.damageNums.push(new DamageNumber(mob.cx, mob.y - 8, pa.damage, '#00EEFF'));
          }
          if (!mob.alive) this.onKill?.(pa.owner || 'p1', mob); // arena scoring
          pa._hitAnyMob = true;   // an arrow that hit a mob is NOT recoverable (§6)
          if (pa.isTrident) {
            pa._stick();          // a Trident sticks into whatever it hits
            break;
          } else if (pa.pierce) {
            (pa._hitMobs || (pa._hitMobs = new Set())).add(mob);
            // keep flying — no break, so it can strike mobs behind this one
          } else {
            pa.alive = false;
            break;
          }
        }
      }
      if (pa.stuck) continue;   // trident stuck into a mob — skip PvP + keep it around
      // PvP: an un-consumed player arrow can strike a player other than its owner.
      if (pa.alive && pvpTargets) {
        for (const [id, p] of pvpTargets) {
          if (!p || p.hp <= 0 || id === pa.owner) continue;
          // Friendly fire is always off between teammates in team modes (CTF).
          if (p.teamId != null && teamOf[pa.owner] != null && p.teamId === teamOf[pa.owner]) continue;
          if (pa.x > p.x && pa.x < p.x + p.width &&
              pa.y > p.y && pa.y < p.y + p.height) {
            if (p.crouching && p.hasShield && !(typeof CTF_SYSTEM !== 'undefined' && CTF_SYSTEM.isCarrying(p))) {
              pa.vx = -pa.vx;   // shield deflect — arrow now belongs to nobody
              pa.owner = null;  // so it can even strike the original shooter
            } else {
              const before = p.hp;
              p.takeDamage(pa.damage, Math.sign(pa.vx));
              this.damageNums.push(new DamageNumber(p.cx, p.y - 8, pa.damage, '#FF3333'));
              if (before > 0 && p.hp <= 0 && pa.owner) this.onPlayerKill?.(pa.owner, id);
              pa.alive = false;
            }
            break;
          }
        }
      }
    }
    this.playerArrows = this.playerArrows.filter(a => a.alive);

    // Process all deaths in one place — guaranteed exactly once per mob
    this.mobs = this.mobs.filter(m => {
      if (!m.alive) { this._onMobDeath(m); return false; }
      return true;
    });

    // Ambient sounds (screen-visibility based)
    if (this._camera) this.updateAmbientSounds(this._camera);

    // Blaze shots
    this.blazeShots = this.blazeShots.filter(bs => {
      const bsTarget = this._nearestPlayer(bs.x, bs.y, player, player2);
      bs.update(bsTarget, level);
      return bs.alive;
    });

    // Smart Mobs §9 — spider webs travel + apply the slow on contact.
    this.webs = this.webs.filter(w => {
      w.update(this._nearestPlayer(w.x, w.y, player, player2), level);
      return w.alive;
    });

    // Deflected blaze shots — check mob collisions
    for (const bs of this.blazeShots) {
      if (!bs.alive || !bs.deflected) continue;
      for (const mob of this.mobs) {
        if (!mob.alive) continue;
        if (bs.x > mob.x && bs.x < mob.x + mob.width &&
            bs.y > mob.y && bs.y < mob.y + mob.height) {
          const dir = Math.sign(bs.vx);
          if (mob.takeDamage(bs.damage, dir)) {
            this.damageNums.push(new DamageNumber(mob.cx, mob.y - 8, bs.damage, '#FF8800'));
          }
          bs.alive = false;
          break;
        }
      }
    }

    // Item drops
    this.droppedItems = this.droppedItems.filter(item => {
      item.update(level);
      return item.alive;
    });

    // Particles
    this.damageNums = this.damageNums.filter(d => d.update());
    this.explosions = this.explosions.filter(e => { e.life--; return e.life > 0; });

    // XP orbs — animate and collect (nearest player picks up)
    this.xpOrbs = this.xpOrbs.filter(orb => {
      orb.tick();
      if (orb.life <= 0) return false;
      const collector = this._nearestPlayer(orb.worldX, orb.worldY, player, player2);
      const dist = Math.hypot(orb.worldX - collector.cx, orb.worldY - collector.cy);
      if (dist < 28) { collector.gainXp(XP_PER_ORB); return false; }
      return true;
    });

    return hpBefore - player.hp; // damage taken this frame
  }

  // Player swings weapon — hit all mobs within reach
  // Returns array of serialized mob snapshots for multiplayer sync
  serializeMobs() {
    return this.mobs.filter(m => m.alive).map(m => m.serialize());
  }

  // Joiner-side: find remote mobs in attack range and return damage events to send
  playerAttackRemoteCheck(player, remoteMobs) {
    const damage = player.meleeDamage != null ? player.meleeDamage : player.weaponDamage;
    const hits = [];
    for (const m of remoteMobs.values()) {
      if (!m.alive) continue;
      const cx = m.x + m.w / 2, cy = m.y + m.h / 2;
      if (Math.hypot(cx - player.cx, cy - player.cy) <= ATTACK_REACH)
        hits.push({ mobId: m.id, damage, knockDir: Math.sign(cx - player.cx) || 1 });
    }
    return hits;
  }

  // Smart Mobs §2 — trait-driven melee. `traits` (from WEAPON_TRAITS merged with
  // per-world overrides; resolved by the Game) shapes reach, hit-cone, cleave
  // cap, knockback and damage. Called with no traits → legacy behaviour (hit
  // every mob in ATTACK_REACH), so P2-P4 / remote paths stay working unchanged.
  playerAttack(player, owner = 'p1', traits = null) {
    const t       = traits || {};
    const reach   = ATTACK_REACH * (t.reachMult || 1);
    const arcRad  = (((t.arcDeg == null ? 360 : t.arcDeg)) * Math.PI / 180) / 2;
    const kbMult  = t.knockback == null ? 1 : t.knockback;
    const dmgMult = t.dmgMult == null ? 1 : t.dmgMult;
    const damage  = Math.max(1, Math.round((player.meleeDamage != null ? player.meleeDamage : player.weaponDamage) * dmgMult));
    // cleave: 0/null/Infinity = unlimited; otherwise the max mobs one swing hits.
    const cleave  = (t.cleave == null || t.cleave <= 0) ? Infinity : t.cleave;
    // §Phase 6 — directional melee. `t.dir` = up|down|forward|back|neutral. Up/Down
    // aim the hit-cone vertically; the height interaction (an overhead swing sails OVER
    // a crouching/short target, a low attack connects with it) applies to PvE + PvP.
    const dir = t.dir || 'neutral';
    const faceAng = dir === 'up' ? -Math.PI / 2 : dir === 'down' ? Math.PI / 2 : (player.facing > 0 ? 0 : Math.PI);

    // Gather candidates within reach (and the hit-cone, if narrower than 360°),
    // nearest first, so a capped cleave hits the closest mobs.
    const cand = [];
    for (const mob of this.mobs) {
      if (!mob.alive) continue;
      const dx = mob.cx - player.cx, dy = mob.cy - player.cy;
      const dist = Math.hypot(dx, dy);
      if (dist > reach) continue;
      if (arcRad < Math.PI - 1e-3) {
        let ad = Math.abs(Math.atan2(dy, dx) - faceAng);
        if (ad > Math.PI) ad = 2 * Math.PI - ad;
        if (ad > arcRad) continue;
      }
      // Height interaction: an UP (overhead) attack misses a short/crouching target;
      // a DOWN (low) attack is the way to connect with one.
      if (dir === 'up') {
        const low = (mob.height != null && mob.height <= BLOCK_SIZE) || mob.crouching === true || mob.isSneaking === true;
        if (low) continue;
      }
      cand.push({ mob, dist, dir: Math.sign(dx) || player.facing });
    }
    cand.sort((a, b) => a.dist - b.dist);

    let anyHit = false, hits = 0;
    for (const c of cand) {
      if (hits >= cleave) break;
      hits++;
      if (c.mob.takeDamage(damage, c.dir, kbMult)) {
        this.damageNums.push(new DamageNumber(c.mob.cx, c.mob.y - 8, damage, '#FFE040'));
        anyHit = true;
        // §Phase 7 — combo FINISHER: knock the target onto its back (knockback + rotate),
        // reusing the slide-launch spin fields + the render wrapper (no new animation).
        if (t.finisher && c.mob.alive) {
          const m = c.mob;
          m.vy = -11; m.vx = (c.dir || 1) * 7; m.knockbackTimer = 44;
          m._launched = true; m._launchFrames = 40; m._launchSpin = (c.dir || 1) * 0.28; m._spinAngle = 0;
        }
        // §Phase 7 v2 — Rising Strike LAUNCHES the target up (little horizontal), like the slide attack.
        if (t.launchUp && c.mob.alive) {
          const m = c.mob;
          m.vy = -14; m.vx = (c.dir || 1) * 2; m.knockbackTimer = 46;
          m._launched = true; m._launchFrames = 44; m._launchSpin = (c.dir || 1) * 0.2; m._spinAngle = 0;
        }
        // Arena kill attribution for melee blows (arrows credited in update()).
        if (!c.mob.alive) this.onKill?.(owner, c.mob);
      }
    }
    return anyHit;
  }

  // Smart Mobs §2 — spear slide-attack. Launch every mob overlapping the sliding
  // player up into the air (spinning), dealing `dmg`. `alreadyHit` (a Set) stops a
  // mob being hit twice in one slide. Killed mobs are tossed, then vanish (their
  // death — drops/score — resolves when _tossDeath flips alive=false). Generic
  // enough that other weapons can trigger their own launch specials later.
  slideLaunch(player, dmg, alreadyHit, owner = 'p1') {
    let any = false;
    for (const mob of this.mobs) {
      if (!mob.alive || (alreadyHit && alreadyHit.has(mob))) continue;
      const overlap = player.x < mob.x + mob.width && player.x + player.width > mob.x &&
                      player.y < mob.y + mob.height && player.y + player.height > mob.y;
      if (!overlap) continue;
      if (alreadyHit) alreadyHit.add(mob);
      any = true;
      const lethal = (mob.hp - dmg) <= 0;
      mob.hp -= dmg;
      this.damageNums.push(new DamageNumber(mob.cx, mob.y - 8, dmg, '#FFEE55'));
      mob.vy = -13;                                   // launch upward
      mob.vx = Math.random() * 8 - 4;                 // random horizontal scatter
      mob.knockbackTimer = 46;                        // suppress AI while airborne
      mob._launched     = true;
      mob._launchFrames = 42;
      mob._launchSpin   = (Math.random() < 0.5 ? -1 : 1) * (0.18 + Math.random() * 0.22);
      mob._spinAngle    = 0;
      if (lethal) { mob.hp = 0; mob._tossDeath = 46; this.onKill?.(owner, mob); } // fly + spin, then disappear
    }
    return any;
  }

  // Smart Mobs §6 — steer every in-flight GUIDED player projectile toward a target
  // (the cursor), turning at most `turnRate` rad/frame while keeping its speed
  // (momentum). Generic: any projectile flagged `guided` uses it — the Trident now,
  // a boomerang later. No-op on stuck/returning projectiles.
  steerGuided(tx, ty, turnRate) {
    for (const pa of this.playerArrows) {
      if (!pa.alive || !pa.guided || pa.stuck || pa.returning || pa._boomWaiting) continue;
      const desired = Math.atan2(ty - pa.y, tx - pa.x);
      const cur     = Math.atan2(pa.vy, pa.vx);
      let d = desired - cur;
      while (d >  Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      const na  = cur + Math.max(-turnRate, Math.min(turnRate, d));
      const spd = Math.hypot(pa.vx, pa.vy) || 1;
      pa.vx = Math.cos(na) * spd;
      pa.vy = Math.sin(na) * spd;
      pa._angle = na;
    }
  }

  // Smart Mobs §6 — the player walking over a stuck (or a recalled, returning)
  // projectile picks it up. Returns { trident, arrows } for the game to apply
  // (re-equip the Trident / add recovered arrows to the quiver).
  collectStuckArrows(player) {
    let trident = false, arrows = 0, boomerang = false;
    for (const pa of this.playerArrows) {
      if (!pa.alive || (!pa.stuck && !pa.returning)) continue;
      if (pa.x > player.x - 5 && pa.x < player.x + player.width + 5 &&
          pa.y > player.y - 5 && pa.y < player.y + player.height + 5) {
        if (pa.isTrident) trident = true;
        else if (pa.boomerang) boomerang = true;   // §F a stuck (wall-embedded) boomerang
        else arrows++;
        pa.alive = false;   // consumed → filtered out next update
      }
    }
    if (trident || arrows || boomerang) this.playerArrows = this.playerArrows.filter((a) => a.alive);
    return { trident, arrows, boomerang };
  }

  // Collect dropped items near player; returns array of {itemKey, amount}
  collectDropsNear(player) {
    const pcx = player.x + player.width / 2;
    const pcy = player.y + player.height / 2;
    const collected = [];
    for (const item of this.droppedItems) {
      if (!item.alive) continue;
      if (item.pickupDelay > 0) { item.pickupDelay--; continue; }
      if (Math.hypot(item.x - pcx, item.y - pcy) < 32) {
        collected.push({ itemKey: item.itemKey, amount: item.amount });
        item.alive = false;
      }
    }
    return collected;
  }

  dropItems(items) {
    for (const { x, y, itemKey, amount, pickupDelay = 0 } of items) {
      this.droppedItems.push(new ItemDrop(x, y, itemKey, amount, pickupDelay));
    }
    if (items.length > 0 && this.dropCallback) this.dropCallback(items);
  }

  // Restore previously-saved ground drops without the pickup/sound side-effects
  // of dropItems() — used when re-entering a Normal-mode world.
  restoreDroppedItems(items) {
    if (!Array.isArray(items)) return;
    for (const it of items) {
      if (!it || typeof it.x !== 'number' || typeof it.y !== 'number' || !it.itemKey) continue;
      const drop = new ItemDrop(it.x, it.y, it.itemKey, it.amount || 1, 0);
      drop.vx = 0; drop.vy = 0;
      if (typeof it.life === 'number' && it.life > 0) drop.life = it.life;
      this.droppedItems.push(drop);
    }
  }

  addPlayerDamageNum(player, amount) {
    this.damageNums.push(
      new DamageNumber(player.cx, player.y - 8, amount, '#FF3333')
    );
  }

  updateAmbientSounds(camera) {
    if (!this.soundCallback) return;
    const AMBIENT_SOUNDS = {
      Zombie:         'sounds/mob-zombie.mp3',
      WitherSkeleton: 'sounds/mob-skeleton.mp3',
      Skeleton:       'sounds/mob-skeleton.mp3',
      Creeper:        'sounds/mob-creeper.mp3',
      Blaze:          'sounds/mob-blaze.mp3',
      Enderman:       'sounds/mob-enderman.mp3',
      Piglin:         'sounds/mob-piglin.mp3',
      CaveSpider:     'sounds/mob-spider.mp3',
    };
    // Play ambient sound once when a mob first enters the camera view; reset when it leaves
    for (const mob of this.mobs) {
      if (!mob.alive) continue;
      const sx = mob.x - camera.x;
      const sy = mob.y - camera.y;
      const onScreen = sx > camera.viewMinX() - 48 && sx < camera.viewMaxX() + 48 && sy > camera.viewMinY() - 48 && sy < camera.viewMaxY() + 48;
      if (onScreen && !mob.soundPlayed) {
        const snd = AMBIENT_SOUNDS[mob.constructor.name];
        if (snd) this.soundCallback(snd, 0.6);
        mob.soundPlayed = true;
      } else if (!onScreen) {
        mob.soundPlayed = false;
      }
    }
  }

  _onMobDeath(mob) {
    // Death sound
    if (this.soundCallback) {
      const DEATH_SOUNDS = {
        Zombie:         'sounds/zombie-defeated.mp3',
        WitherSkeleton: 'sounds/skeleton-defeated.mp3',
        Skeleton:       'sounds/skeleton-defeated.mp3',
        Blaze:          'sounds/blaze-defeated.mp3',
        Piglin:         'sounds/piglin-defeated.mp3',
        Creeper:        'sounds/creeper-defeated.mp3',
        Enderman:       'sounds/enderman-defeated.mp3',
        CaveSpider:     'sounds/spider-defeated.mp3',
      };
      const snd = DEATH_SOUNDS[mob.constructor.name];
      if (snd) this.soundCallback(snd, 1.0);
    }

    // XP orbs
    for (let i = 0; i < 2; i++) {
      const ox = mob.cx + (Math.random() - 0.5) * 22;
      const oy = mob.y  + mob.height * 0.4;
      this.xpOrbs.push(new XpOrb(ox, oy));
    }

    // Item drops — suppressed entirely when drops are disabled (arena toggle).
    if (this.dropsDisabled) return;
    // use configurable dropConfig if set, else hardcoded defaults
    const drops = [];
    const MOB_CLASS_TO_KEY = {
      Zombie: 'zombie', Skeleton: 'skeleton', Creeper: 'creeper',
      CaveSpider: 'cave_spider', Piglin: 'piglin', Blaze: 'blaze',
      WitherSkeleton: 'wither_skeleton', Enderman: 'enderman', Goomba: 'goomba', Koopa: 'koopa', Shell: 'shell',
    };
    const mobKey = MOB_CLASS_TO_KEY[mob.constructor.name];

    if (this.dropConfig && mobKey && this.dropConfig[mobKey]) {
      for (const slot of this.dropConfig[mobKey]) {
        if (slot.item && slot.chance > 0 && Math.random() * 100 < slot.chance) {
          drops.push({ x: mob.cx, y: mob.cy, itemKey: slot.item, amount: 1 });
        }
      }
    } else {
      // Hardcoded defaults (fallback when no dropConfig)
      if (mob instanceof CaveSpider) {
        drops.push({ x: mob.cx, y: mob.cy, itemKey: BLOCK.STRING, amount: 1 });
      } else if (mob instanceof Blaze) {
        drops.push({ x: mob.cx, y: mob.cy, itemKey: BLOCK.BLAZE_ROD, amount: 1 });
      } else if (mob instanceof Enderman) {
        drops.push({ x: mob.cx, y: mob.cy, itemKey: BLOCK.ENDER_PEARL, amount: 1 });
      }
      drops.push({ x: mob.cx, y: mob.cy, itemKey: BLOCK.APPLE, amount: 1 });
    }
    if (drops.length > 0) this.dropItems(drops);
  }

  _doExplosion({ col, row, radius }, level) {
    const centerX  = col * BLOCK_SIZE + BLOCK_SIZE / 2;
    const centerY  = row * BLOCK_SIZE + BLOCK_SIZE / 2;
    const dmgPx    = (radius + 1) * BLOCK_SIZE * 2;  // same threshold as player damage

    // Destroy blocks in circular area
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (dr * dr + dc * dc > radius * radius) continue;
        const b = level.get(row + dr, col + dc);
        if (b !== BLOCK.BEDROCK && b !== BLOCK.AIR && b !== BLOCK.GOAL) {
          level.set(row + dr, col + dc, BLOCK.AIR);
        }
      }
    }

    // Damage nearby mobs (same radius + damage as player)
    for (const mob of this.mobs) {
      if (!mob.alive) continue;
      const dist = Math.hypot(mob.cx - centerX, mob.cy - centerY);
      if (dist < dmgPx) {
        const dir = Math.sign(mob.cx - centerX) || 1;
        if (mob.takeDamage(6, dir)) {
          this.damageNums.push(new DamageNumber(mob.cx, mob.y - 8, 6, '#FF8800'));
        }
      }
    }

    // Visual effect
    this.explosions.push(new ExplosionEffect(centerX, centerY, (radius + 0.5) * BLOCK_SIZE));
    // Signal game.js to spawn particles + screen shake
    this.explosionEvents.push({ col, row, radius });
  }

  draw(ctx, camera) {
    // Explosions behind everything else
    for (const e of this.explosions)   e.draw(ctx, camera);
    // Item drops
    for (const item of this.droppedItems) item.draw(ctx, camera);
    // XP orbs (behind mobs so they're clearly separate)
    for (const o of this.xpOrbs)       o.draw(ctx, camera);
    // Arrows (enemy + player)
    for (const a of this.arrows)       a.draw(ctx, camera);
    for (const a of this.playerArrows) a.draw(ctx, camera);
    // Blaze shots
    for (const bs of this.blazeShots)  bs.draw(ctx, camera);
    // Spider webs (§9)
    for (const w of this.webs)         w.draw(ctx, camera);
    // Mobs — slide-launched mobs spin about their centre (and fade while being
    // tossed to death). Wrapping here avoids touching all 8 per-mob draw methods.
    for (const mob of this.mobs) {
      if (mob._launched && mob._spinAngle) {
        const sx = mob.cx - camera.x, sy = mob.cy - camera.y;
        ctx.save();
        if (mob._tossDeath > 0) ctx.globalAlpha = Math.max(0, mob._tossDeath / 46);
        ctx.translate(sx, sy); ctx.rotate(mob._spinAngle); ctx.translate(-sx, -sy);
        mob.draw(ctx, camera);
        ctx.restore();
      } else {
        mob.draw(ctx, camera);
      }
      // Smart Mobs §7 — sprint TELEGRAPH: a pulsing red ring + "!" above a winding-up
      // mob, and speed streaks during the burst. Drawn here so no per-mob draw changes.
      if (mob.alive && (mob._sprintTele > 0 || mob._sprintRun > 0)) {
        this._drawSprintCue(ctx, camera, mob);
      }
    }
    // Floating numbers on top
    for (const d of this.damageNums)   d.draw(ctx, camera);
  }

  _drawSprintCue(ctx, camera, mob) {
    const sx = mob.cx - camera.x, sy = mob.y - camera.y;
    ctx.save();
    if (mob._sprintTele > 0) {
      // Wind-up: pulsing ring around the mob + a bobbing "!" warning above it.
      const t     = 1 - mob._sprintTele / SPRINT_TELE_FRAMES;   // 0→1 over the telegraph
      const pulse = 0.45 + 0.35 * Math.sin(mob._sprintTele * 0.5);
      const cx = mob.cx - camera.x, cy = mob.cy - camera.y;
      ctx.strokeStyle = `rgba(255,60,40,${pulse.toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, mob.width * (0.7 + t * 0.5), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,80,60,${(0.6 + 0.4 * pulse).toFixed(3)})`;
      ctx.font = 'bold 16px Courier New';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText('!', cx, sy - 4 - (mob._sprintTele % 8 < 4 ? 2 : 0));
    } else if (mob._sprintRun > 0) {
      // Burst: motion streaks trailing behind the charge direction.
      const dir = mob.facing >= 0 ? -1 : 1;   // streaks trail opposite to travel
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const y = sy + 8 + i * 12;
        ctx.beginPath();
        ctx.moveTo(sx + mob.width / 2, y);
        ctx.lineTo(sx + mob.width / 2 + dir * (10 + i * 4), y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}
