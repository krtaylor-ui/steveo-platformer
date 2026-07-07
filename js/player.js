// ============================================================
// player.js — Steve character: physics, controls, rendering
// ============================================================

const HANG_DROP = 6;   // px the sprite dangles below the ledge top while hanging (~1/5 block)

class Player {
  constructor(startX, startY) {
    this.x         = startX;
    this.y         = startY;
    this.vx        = 0;
    this.vy        = 0;
    this.onGround  = false;
    this.crouching = false;
    this.facing    = 1;       // 1 = right, -1 = left
    this.running   = false;

    // Animation
    this.walkTimer  = 0;
    this.jumpSquish = 0;      // 0–1 scale effect on landing/jump

    // Inventory
    this.totalMined   = 0;
    this.hotbar       = new Array(9).fill(null);
    this.inventory    = new Array(36).fill(null);  // 4×9 main inventory
    this.selectedSlot = 0;

    // XP
    this.xp    = 0;
    this.maxXp = PLAYER_MAX_XP;

    // Combat
    this.hp             = PLAYER_MAX_HP;
    this.maxHp          = PLAYER_MAX_HP;
    // weaponMode is now a getter derived from selectedSlot (no instance variable)
    this.pickaxe        = 'WOODEN_PICKAXE';       // key into TOOL_DATA
    this.sword          = 'WOODEN_SWORD';         // key into TOOL_DATA
    this.bow            = null;                   // set to 'BOW' when crafted
    this.discoveredOres = new Set();              // BLOCK ids of ores ever mined
    this.attackCooldown = 0;
    this.iframes        = 0;           // invincibility frames
    this.swingTimer     = 0;           // weapon swing visual (counts down)
    // Air-roll (double-jump): frames remaining in the tuck-and-spin animation.
    this._rollFrames    = 0;
    this._rollTotal     = 0;
    this._rollDir       = 1;           // spin direction (captured from facing at jump)

    // ── Optional movement moves (all opt-in per world; default off) ──────────
    // Wall slide + wall jump
    this._wallSlideEnabled = false;
    this._wallJumpLockAway = false;
    this._wallSliding      = false;    // sliding down a wall this frame
    this._wallSlideDir     = 0;        // -1 wall on left, +1 wall on right
    this._ctrlLock         = false;    // control locked after a lock-away wall jump
    this._lockVx           = 0;        // forced vx while control-locked
    // Ledge hang
    this._ledgeHangEnabled = false;
    this._hangState        = null;     // null | 'hang' | 'up' (climb up) | 'down' (climb down)
    this._hangX = 0; this._hangY = 0; this._hangSide = 0;
    this._standX = 0; this._standY = 0;   // on-ledge standing pos (climb target)
    this._climbT = 0; this._climbDur = 16; this._climbProg = 0;
    this._hangCooldown = 0;            // frames after a drop before re-grabbing
    this._downWas = false;             // edge-detect the down press for climb-down
    // Ground slide (jump + down)
    this._slideEnabled    = false;
    this._slideInvincible = false;
    this._slideDur        = 30;        // frames
    this._slideMult       = 1.6;       // speed multiplier during slide
    this._slideFrames     = 0;
    this._slideDir        = 1;

    // Bow state
    this.bowDrawing    = false;
    this.drawProgress  = 0;            // 0–1
    this.bowAimAngle   = 0;

    // Shield
    this.hasShield     = false;
    this.hasFlintSteel = false;

    // Armor equipment slots
    this.equippedArmor = { head: null, chest: null, legs: null, feet: null };

    // Platformer: reserved hotbar slots for key items (Map<blockType, slotIndex>)
    // Set by game.js in Platformer mode only — null in Normal/Sandbox.
    this.platformerSlots = null;

    // Sandbox / special modes
    this.lives           = 3;      // 2P co-op lives (decremented on death)
    this.godMode         = false;  // no damage when true (sandbox mode)
    this.flying          = false;  // flight mode toggled by double-jump
    this.hyperSpeed      = false;  // 3× movement speed when toggled (H key)
    this.hyperLevel      = 0;      // 0=normal, 1=hyper(3×), 2=2×hyper(6×) — H key cycles
    this.speedMultiplier = 1;      // extra multiplier stacked on top of hyperSpeed (1 or 2)
    this.canPhaseThrough = false;  // noclip: walk through blocks (X key, god mode only)
    this.xpSpeedDisabled = false;  // set by game.js from worldAdvSettings.disableXpSpeedBoost
    this._autoStepUp     = false;  // set by game.js from worldAdvSettings.autoStepUp — walk up 1-block ledges

    // Jump buffer / coyote time
    this._jumpBuffer  = 0;
    this._coyoteTime  = 0;
    this._jumpPressed = false;

    // Double-jump / double-crouch timing (for flight toggle)
    this._frameNum        = 0;
    this._lastJumpFrame   = -999;
    this._lastCrouchFrame = -999;
    this._crouchWas       = false;
  }

  get isDead()       { return this.hp <= 0; }

  // Derived from selectedSlot: slot 0=sword, 1=bow (if crafted), else 'item'.
  // The pickaxe is NOT a hotbar slot — mining is always-active (contextual) and
  // auto-uses the best owned pickaxe; see Game._miningEnabled / the HUD badge.
  get weaponMode() {
    if (this.selectedSlot === 0) return 'sword';
    if (this.selectedSlot === 1) return this.bow ? 'bow' : 'item';
    return 'item';
  }

  // Backward-compat: 'pickaxe' or 'sword' string for draw code
  get weapon()       { return this.weaponMode; }

  // Currently active tool key and its data
  get _activeTool()  {
    if (this.weaponMode === 'pickaxe') return this.pickaxe;
    if (this.weaponMode === 'bow')     return this.bow || this.pickaxe;
    if (this.weaponMode === 'sword')   return this.sword;
    return this.pickaxe; // 'item' fallback
  }
  get tool()         { return TOOL_DATA[this._activeTool] ? TOOL_DATA[this._activeTool].name : 'Bow'; }
  get weaponDamage() {
    if (this.weaponMode === 'bow')  return PLAYER_ARROW_DAMAGE;
    if (this.weaponMode === 'item') return 0;
    return TOOL_DATA[this._activeTool].damage;
  }
  get pickaxeTier()  { return TOOL_DATA[this.pickaxe].tier; }
  get pickaxeSpeed() { return TOOL_DATA[this.pickaxe].mineSpeed; }
  get iFrames()      { return this.iframes; }

  get xpLevel()      { return Math.floor(this.xp); }

  // Speed scales linearly: ×1.0 at XP 0, ×2.0 at XP max (level 5); disabled by world setting
  get _xpMult()       { return this.xpSpeedDisabled ? 1 : 1 + this.xp / this.maxXp; }
  // _speedBoostMult is the arena SPEED power-up multiplier (Phase 3A.2); 1 when inactive.
  get moveSpeed()     { return MOVE_SPEED   * this._xpMult * (this._speedBoostMult || 1); }
  get crouchSpeed()   { return CROUCH_SPEED * this._xpMult * (this._speedBoostMult || 1); }

  gainXp(amount) {
    if (this.godMode) return; // no XP in sandbox mode
    this.xp = Math.min(this.maxXp, this.xp + amount);
  }

  getArmorReduction() {
    let total = 0;
    const tierCount = {};
    for (const slot of ['head', 'chest', 'legs', 'feet']) {
      const key = this.equippedArmor[slot];
      if (!key || !ARMOR_DATA[key]) continue;
      const d = ARMOR_DATA[key];
      total += d.protection;
      tierCount[d.tier] = (tierCount[d.tier] || 0) + 1;
    }
    for (const cnt of Object.values(tierCount)) {
      if      (cnt >= 4) total += 4;
      else if (cnt >= 3) total += 2;
      else if (cnt >= 2) total += 1;
    }
    return total;
  }

  addArmorItem(armorKey) {
    if (!ARMOR_DATA[armorKey]) return;
    const d    = ARMOR_DATA[armorKey];
    const slot = d.piece;
    const cur  = this.equippedArmor[slot];
    if (!cur || ARMOR_DATA[cur].tier < d.tier) {
      if (cur) this._addArmorToInventory(cur);
      this.equippedArmor[slot] = armorKey;
    } else {
      this._addArmorToInventory(armorKey);
    }
  }

  _addArmorToInventory(armorKey) {
    for (let i = 0; i < 36; i++) {
      if (!this.inventory[i]) { this.inventory[i] = { type: 'armor', armorKey, count: 1 }; return true; }
    }
    return false;
  }

  takeDamage(amount, knockDir = 0) {
    if (this.godMode)   return false;
    if (this.iframes > 0) return false;
    // Phase 3A.2 — arena SHIELD power-up absorbs the next hit entirely.
    if (this.shield > 0) {
      this.shield--;
      this.iframes = IFRAMES;
      return false;
    }
    const actual = Math.max(1, amount - this.getArmorReduction());
    this.hp     = Math.max(0, this.hp - actual);
    this.iframes = IFRAMES;
    if (knockDir !== 0) {
      this.vx = knockDir * KNOCKBACK_FORCE;
      this.vy = -4;
    }
    return true;
  }

  respawnAt(x, y) {
    this.x    = x; this.y = y;
    this.vx   = 0; this.vy = 0;
    this.hp   = this.maxHp;
    this.iframes = IFRAMES * 3;
    this.bowDrawing   = false;
    this.drawProgress = 0;
  }

  get width()  { return PLAYER_W; }
  get height() { return this.crouching ? CROUCH_H : PLAYER_H; }

  // Axis-aligned bounding box (world coords)
  get bounds() {
    return { x: this.x, y: this.y, w: this.width, h: this.height };
  }

  // Centre of player in world coords
  get cx() { return this.x + this.width / 2; }
  get cy() { return this.y + this.height / 2; }

  update(input, level) {
    this._frameNum++;
    // Countdown timers
    if (this.attackCooldown > 0) this.attackCooldown--;
    if (this.iframes        > 0) this.iframes--;
    if (this.swingTimer     > 0) this.swingTimer--;
    if (this._rollFrames    > 0) this._rollFrames--;
    if (this._hangCooldown  > 0) this._hangCooldown--;

    // Ledge hang owns the whole frame while active (no gravity/collision).
    if (this._hangState) { this._updateHang(input, level); this._animate(input); return; }

    this._detectWallSlide(input, level);   // sets _wallSliding (used by jump + physics)
    this._handleInput(input);
    this._applyPhysics(level);
    this._tryLedgeGrab(input, level);      // grab from air / climb down from a ledge
    this._animate(input);
  }

  _handleInput(input) {
    // Existing hyper speed stays 3×; speedMultiplier (1 or 2) stacks on top → 6× at level 2.
    const hsMult = (this.hyperSpeed ? 3 : 1) * (this.speedMultiplier || 1);
    // Sprint (Shift / isRun) doubles ground speed when enabled per-world.
    const sprinting = this._sprintEnabled && !this.crouching &&
                      typeof input.isRun === 'function' && input.isRun();
    const sprintMult = sprinting ? 2 : 1;
    const speed  = (this.crouching ? this.crouchSpeed : this.moveSpeed) * hsMult * sprintMult;
    this.running = !this.crouching;

    // Horizontal movement — analog-aware (uses left stick magnitude when available)
    const mx = typeof input.moveX === 'function' ? input.moveX()
             : (input.isLeft() ? -1 : input.isRight() ? 1 : 0);
    if (this._ctrlLock) {
      // Lock-away wall jump: steering disabled, vx forced away from the wall until
      // landing / hitting a wall / grabbing a ledge (those clear _ctrlLock).
      this.vx = this._lockVx;
      this.facing = this._lockVx < 0 ? -1 : 1;
    } else if (this.srControlled) {
      // Speed Runner owns horizontal velocity (game._updateSpeedRunner ramps /
      // coasts sr.vx). Don't let key input or the 0.72 friction here fight it —
      // otherwise vx snaps to a fixed speed and ignores the boost multiplier.
      if (this.vx > 0.01) this.facing = 1;
    } else if (mx < 0) {
      this.vx    = speed * mx;   // mx is negative → vx moves left
      this.facing = -1;
    } else if (mx > 0) {
      this.vx    = speed * mx;
      this.facing = 1;
    } else {
      this.vx *= 0.72;
      if (Math.abs(this.vx) < 0.2) this.vx = 0;
    }

    // ── Phase-through (noclip) ────────────────────────────────
    // Free vertical movement, no gravity, no collisions (handled in _applyPhysics).
    if (this.canPhaseThrough) {
      this.crouching = false;
      if (input.isJump())        this.vy = -this.moveSpeed * hsMult;
      else if (input.isCrouch()) this.vy =  this.moveSpeed * hsMult;
      else                       this.vy =  0;
      if (this._jumpBuffer > 0) this._jumpBuffer--;
      if (this._coyoteTime > 0) this._coyoteTime--;
      return;
    }

    // ── Flying mode ──────────────────────────────────────────
    if (this.flying) {
      this.crouching = false;
      // W/up = fly up, S/down = fly down
      if (input.isJump())        this.vy = -this.moveSpeed * hsMult;
      else if (input.isCrouch()) this.vy =  this.moveSpeed * hsMult;
      else                       this.vy =  0;

      // Double-crouch → stop flying
      const crouchNow = input.isCrouch();
      if (crouchNow && !this._crouchWas) {
        if (this._frameNum - this._lastCrouchFrame < 16) {
          this.flying = false;
          this.vy     = 0;
        }
        this._lastCrouchFrame = this._frameNum;
      }
      this._crouchWas = crouchNow;

      if (this._jumpBuffer > 0) this._jumpBuffer--;
      if (this._coyoteTime > 0) this._coyoteTime--;
      return; // skip normal jump/crouch
    }

    // ── Normal (non-flying) ───────────────────────────────────

    // Crouching — only on ground
    const wantCrouch = input.isCrouch() && this.onGround;
    if (wantCrouch && !this.crouching) {
      this.y += PLAYER_H - CROUCH_H;
      this.crouching = true;
    } else if (!wantCrouch && this.crouching) {
      this.y -= PLAYER_H - CROUCH_H;
      this.crouching = false;
    }

    // Jump (with coyote time + jump buffer)
    const jumpNow  = input.isJump();
    const jumpEdge = jumpNow && !this._jumpPressed;
    const jumpVel  = this._jumpVelocityOverride ?? JUMP_VELOCITY;

    // ── Ground slide in progress (opt-in): jump+down started it. ──
    if (this._slideFrames > 0) {
      // Keep the low (crouch) hitbox so the slide fits through 1-block gaps.
      if (!this.crouching) { this.y += PLAYER_H - CROUCH_H; this.crouching = true; }
      this.vx = this._slideDir * this.moveSpeed * (this._slideMult || 1.6);
      this.facing = this._slideDir;
      if (this._slideInvincible) this.iframes = Math.max(this.iframes, 3);
      if (jumpEdge) {                       // cancel early → hop out of the slide
        this._slideFrames = 0;
        this.vy = jumpVel;
        this.jumpSquish = 1;
        this.onGround = false;
      } else {
        this._slideFrames--;
      }
      this._jumpPressed = jumpNow;
      if (this._jumpBuffer > 0) this._jumpBuffer--;
      if (this._coyoteTime > 0) this._coyoteTime--;
      return;   // slide owns movement this frame
    }

    if (jumpEdge) {
      // Start a ground slide: on the ground, holding down, slide enabled.
      if (this.onGround && this._slideEnabled && input.isCrouch()) {
        this._slideDir    = this.facing || 1;
        this._slideFrames = this._slideDur || 30;
        this.vx           = this._slideDir * this.moveSpeed * (this._slideMult || 1.6);
        this._jumpBuffer  = 0;
        this._jumpPressed = jumpNow;
        return;
      }
      // Double-jump while airborne → enable flight (only in god mode)
      if (!this.onGround && this._frameNum - this._lastJumpFrame < 14 && this.godMode) {
        this.flying      = true;
        this.vy          = -2;    // small upward boost on flight start
        this._jumpBuffer = 0;
      } else {
        this._jumpBuffer = 10;
      }
      this._lastJumpFrame = this._frameNum;
    }
    this._jumpPressed = jumpNow;

    if (this._coyoteTime > 0 && this._jumpBuffer > 0 && !this.crouching) {
      this.vy          = jumpVel;
      this._jumpBuffer = 0;
      this._coyoteTime = 0;
      this.onGround    = false;
      this.jumpSquish  = 1;
    } else if (jumpEdge && this._wallSliding) {
      // Wall jump — a normal jump off the wall. Optional lock-away forces the arc
      // away from the wall and disables steering until you land / hit a wall / hang.
      this.vy          = jumpVel;
      this._jumpBuffer = 0;
      this.jumpSquish  = 1;
      if (this._wallJumpLockAway) {
        this._ctrlLock = true;
        this._lockVx   = -this._wallSlideDir * this.moveSpeed;
        this.vx        = this._lockVx;
        this.facing    = this._lockVx < 0 ? -1 : 1;
      }
      this._wallSliding = false;
    } else if (jumpEdge && this._airJumpEnabled && !this.flying && !this.onGround &&
               this._coyoteTime === 0 && !this.crouching && (this._airJumpsUsed || 0) < 1) {
      // Air jump (double jump): one mid-air boost when enabled per-world.
      this.vy            = jumpVel;
      this._airJumpsUsed = (this._airJumpsUsed || 0) + 1;
      this._jumpBuffer   = 0;
      this.jumpSquish    = 1;
      // Kick off the mid-air roll (tuck + one full spin). Single jump is untouched.
      this._rollFrames   = 24;
      this._rollTotal    = 24;
      this._rollDir      = this.facing || 1;
    }

    if (this._jumpBuffer > 0) this._jumpBuffer--;
    if (this._coyoteTime > 0) this._coyoteTime--;

    // Track crouch presses for when flight is activated later
    const crouchNow = input.isCrouch();
    if (crouchNow && !this._crouchWas) this._lastCrouchFrame = this._frameNum;
    this._crouchWas = crouchNow;
  }

  _applyPhysics(level) {
    // ── Phase-through (noclip): move freely, ignore all block collisions ──
    if (this.canPhaseThrough) {
      this.x = Math.max(0, this.x + this.vx);
      this.y += this.vy;
      this.onGround = false;
      return;
    }

    // Gravity — disabled while flying
    if (!this.flying) {
      this.vy = Math.min(this.vy + (this._gravityOverride ?? GRAVITY), MAX_FALL_SPEED);
    }
    // Wall slide: while pressing into a wall in the air, fall slowly (opt-in).
    if (this._wallSliding && this.vy > 0) this.vy = Math.min(this.vy, 2.6);

    const wasOnGround = this.onGround;
    this.onGround = false;

    const bLeft  = Math.floor((this.x + 2)              / BLOCK_SIZE);
    const bRight = Math.floor((this.x + this.width - 2) / BLOCK_SIZE);
    const newY   = this.y + this.vy;

    if (this.vy >= 0) {
      // Falling / standing — sweep downward through every block row crossed
      const rowStart = Math.floor((this.y   + this.height) / BLOCK_SIZE);
      const rowEnd   = Math.floor((newY     + this.height) / BLOCK_SIZE);
      let stopped = false;
      for (let r = rowStart; r <= rowEnd; r++) {
        if (level.isSolid(r, bLeft) || level.isSolid(r, bRight)) {
          this.y        = r * BLOCK_SIZE - this.height;
          this.vy       = 0;
          this.onGround = true;
          this._airJumpsUsed = 0;                // landing refreshes the air jump
          this._rollFrames   = 0;                // landing snaps the roll back to normal
          this._ctrlLock     = false;            // landing returns control (lock-away wall jump)
          if (!wasOnGround) this.jumpSquish = 0.85;
          if (this.flying) this.flying = false;  // auto-land when touching ground
          stopped = true;
          break;
        }
      }
      if (!stopped) this.y = newY;
    } else {
      // Rising — sweep upward: start one row above current top, go to new top row
      const rowStart = Math.floor(this.y / BLOCK_SIZE) - 1;
      const rowEnd   = Math.floor(newY   / BLOCK_SIZE);
      let stopped = false;
      for (let r = rowStart; r >= rowEnd; r--) {
        if (level.isSolid(r, bLeft) || level.isSolid(r, bRight)) {
          this.y  = (r + 1) * BLOCK_SIZE;
          this.vy = 0;
          stopped = true;
          break;
        }
      }
      if (!stopped) this.y = newY;
    }

    // Coyote time: stay jump-eligible for a few frames after walking off edge
    if (this.onGround) this._coyoteTime = 8;

    // Resolve X movement — sweep horizontally through every block column crossed
    const bRowT = Math.floor((this.y + 2)               / BLOCK_SIZE);
    const bRowB = Math.floor((this.y + this.height - 2) / BLOCK_SIZE);

    if (this.vx > 0) {
      const newX    = this.x + this.vx;
      const colStart= Math.floor((this.x   + this.width) / BLOCK_SIZE);
      const colEnd  = Math.floor((newX     + this.width) / BLOCK_SIZE);
      let stopped = false;
      for (let c = colStart; c <= colEnd; c++) {
        if (level.isSolid(bRowT, c) || level.isSolid(bRowB, c)) {
          // Auto-climb: if the obstacle is a single block with clear headroom,
          // step up onto it and keep moving instead of stopping (opt-in per world).
          if (this._tryAutoStep(level, c, bRowT, bRowB)) { this.x = newX; stopped = true; break; }
          this.x  = c * BLOCK_SIZE - this.width;
          this.vx = 0;
          this._ctrlLock = false;   // hit a wall → control returns
          stopped = true;
          break;
        }
      }
      if (!stopped) this.x = newX;
    } else if (this.vx < 0) {
      const newX    = this.x + this.vx;
      const colStart= Math.floor(this.x  / BLOCK_SIZE);
      const colEnd  = Math.floor(newX    / BLOCK_SIZE);
      let stopped = false;
      for (let c = colStart; c >= colEnd; c--) {
        if (level.isSolid(bRowT, c) || level.isSolid(bRowB, c)) {
          if (this._tryAutoStep(level, c, bRowT, bRowB)) { this.x = newX; stopped = true; break; }
          this.x  = (c + 1) * BLOCK_SIZE;
          this.vx = 0;
          this._ctrlLock = false;   // hit a wall → control returns
          stopped = true;
          break;
        }
      }
      if (!stopped) this.x = newX;
    }

    // Crawl edge-guard: while crouching on the ground, don't walk off a ledge —
    // clamp to the lip so you can reach the exact edge (and drop into a ledge hang).
    if (this.crouching && wasOnGround && this.vx !== 0) {
      const footRow = Math.floor((this.y + this.height + 1) / BLOCK_SIZE);
      const leadCol = this.vx > 0 ? Math.floor((this.x + this.width - 1) / BLOCK_SIZE)
                                  : Math.floor(this.x / BLOCK_SIZE);
      if (!level.isSolid(footRow, leadCol)) {
        this.x = this.vx > 0 ? leadCol * BLOCK_SIZE - this.width : (leadCol + 1) * BLOCK_SIZE;
        this.vx = 0;
      }
    }

    // World bounds
    this.x = Math.max(0, this.x);
  }

  // Auto-climb: when horizontal movement is blocked at column `c`, lift the player
  // onto the obstacle IFF it's exactly one block high with clear headroom — so
  // walking/running up a single-block ledge is seamless (no jump). Only from the
  // ground, and only when the per-world setting enables it. Returns true if it
  // stepped up (the caller then completes the horizontal move).
  //   bRowB = feet row, bRowT = head row (bRowB-1 when standing).
  _tryAutoStep(level, c, bRowT, bRowB) {
    if (!this._autoStepUp || !this.onGround) return false;
    if (!level.isSolid(bRowB, c)) return false;   // must be blocked at the feet row
    if (level.isSolid(bRowT, c)) return false;    // obstacle ≥ 2 blocks → not a step
    const headRow = bRowT - 1;                    // the row the player rises into
    if (level.isSolid(headRow, c)) return false;  // no room above the step
    // Don't clip into a low ceiling above the player's current span.
    const cl = Math.floor((this.x + 2) / BLOCK_SIZE);
    const cr = Math.floor((this.x + this.width - 2) / BLOCK_SIZE);
    for (let cc = cl; cc <= cr; cc++) if (level.isSolid(headRow, cc)) return false;
    this.y = bRowB * BLOCK_SIZE - this.height;    // sit the player's feet on the step top
    return true;
  }

  // ── Wall slide ──────────────────────────────────────────────
  // Sets _wallSliding when airborne, falling, and pressing into an adjacent wall.
  _detectWallSlide(input, level) {
    this._wallSliding = false;
    if (!this._wallSlideEnabled || this.onGround || this.flying ||
        this.canPhaseThrough || this.srControlled || this._slideFrames > 0) return;
    if (this.vy <= 0) return;                       // only while falling
    const mx = typeof input.moveX === 'function' ? input.moveX()
             : (input.isLeft() ? -1 : input.isRight() ? 1 : 0);
    if (Math.abs(mx) < 0.3) return;                 // must be pressing sideways
    const r1 = Math.floor((this.y + 8) / BLOCK_SIZE);
    const r2 = Math.floor((this.y + this.height - 10) / BLOCK_SIZE);
    const solidCol = (c) => { for (let r = r1; r <= r2; r++) if (level.isSolid(r, c)) return true; return false; };
    if (mx < 0 && solidCol(Math.floor((this.x - 1) / BLOCK_SIZE))) {
      this._wallSliding = true; this._wallSlideDir = -1;
    } else if (mx > 0 && solidCol(Math.floor((this.x + this.width + 1) / BLOCK_SIZE))) {
      this._wallSliding = true; this._wallSlideDir = 1;
    }
    if (this._wallSliding) { this.facing = this._wallSlideDir; this._ctrlLock = false; }
  }

  // ── Ledge hang ──────────────────────────────────────────────
  // (a) grab an edge from the air while holding jump; (b) climb down from a ledge
  // when standing and pressing down. Called after physics each frame.
  _tryLedgeGrab(input, level) {
    if (this._hangState || this._hangCooldown > 0) return;
    if (!this._ledgeHangEnabled || this.flying || this.canPhaseThrough || this.srControlled) return;
    const dir = this.facing || 1;
    const BS = BLOCK_SIZE;

    // (a) In the air, holding jump, moving toward a wall whose top edge is at hand
    // height (solid block with air directly above it = a grabbable ledge).
    if (!this.onGround && input.isJump() && this.vy > -3) {
      const sideCol = dir > 0 ? Math.floor((this.x + this.width + 1) / BS)
                              : Math.floor((this.x - 1) / BS);
      const handRow = Math.floor((this.y + 12) / BS);
      if (level.isSolid(handRow, sideCol) && !level.isSolid(handRow - 1, sideCol)) {
        this._hangSide = dir;
        this._hangX = dir > 0 ? sideCol * BS - this.width : (sideCol + 1) * BS;
        this._hangY = handRow * BS - 14 + HANG_DROP;   // dangle ~1/5 block lower
        this._standX = sideCol * BS + Math.floor((BS - this.width) / 2);
        this._standY = handRow * BS - this.height;
        this._hangState = 'hang';
        this.x = this._hangX; this.y = this._hangY;
        this.vx = 0; this.vy = 0; this.onGround = false; this.crouching = false; this._ctrlLock = false;
      }
      return;
    }

    // (b) Crawl to the edge (the crouch edge-guard lets you reach the lip), then
    // keep pressing toward the drop → climb down to hang off the forward edge.
    if (this.onGround && this.crouching) {
      const mx = typeof input.moveX === 'function' ? input.moveX()
               : (input.isLeft() ? -1 : input.isRight() ? 1 : 0);
      const pressingIntoDrop = dir > 0 ? mx > 0.3 : mx < -0.3;
      if (!pressingIntoDrop) return;
      const footRow  = Math.floor((this.y + this.height) / BS);        // block row under the feet
      const standCol = dir > 0 ? Math.floor((this.x + this.width - 2) / BS)
                               : Math.floor((this.x + 2) / BS);
      const fwdCol   = dir > 0 ? standCol + 1 : standCol - 1;
      // Solid under the feet, but the forward column is open (a drop to hang off).
      if (level.isSolid(footRow, standCol) && !level.isSolid(footRow, fwdCol) && !level.isSolid(footRow - 1, fwdCol)) {
        this._hangSide = dir;
        this._standX = this.x; this._standY = this.y;
        this._hangX = dir > 0 ? (standCol + 1) * BS : standCol * BS - this.width;
        this._hangY = footRow * BS - 14 + HANG_DROP;
        this._hangState = 'down'; this._climbT = 0; this._climbDur = 16;
      }
    }
  }

  // Runs the hang / climb states; fully owns the player's position while active.
  _updateHang(input, level) {
    this.vx = 0; this.vy = 0; this.onGround = false; this.crouching = false;
    const s = this._hangState;
    if (s === 'hang') {
      this.x = this._hangX; this.y = this._hangY;
      const jumpEdge = input.isJump() && !this._jumpPressed;
      this._jumpPressed = input.isJump();
      if (input.isCrouch()) {                  // down → drop off
        this._hangState = null; this._hangCooldown = 12; this.vy = 2; this._downWas = true;
      } else if (jumpEdge) {                    // up/jump → climb up
        this._hangState = 'up'; this._climbT = 0; this._climbDur = 22;
      }
    } else if (s === 'up') {
      // Muscle-up: rise to the ledge (arms pivot from grip to perpendicular, legs
      // dangle) over phase A, then step onto the ledge (legs stand) over phase B.
      this._climbT++;
      const t = Math.min(1, this._climbT / this._climbDur);
      this._climbProg = t;
      const tA = Math.min(1, t / 0.65);
      const tB = Math.max(0, (t - 0.65) / 0.35);
      this.y = this._hangY + (this._standY - this._hangY) * tA;
      this.x = this._hangX + (this._standX - this._hangX) * tB;
      this._jumpPressed = input.isJump();
      if (t >= 1) { this._hangState = null; this._hangCooldown = 8; this._climbProg = 0; }
    } else if (s === 'down') {
      this._climbT++;
      const t = Math.min(1, this._climbT / this._climbDur);
      this._climbProg = t;
      this.x = this._standX + (this._hangX - this._standX) * t;
      this.y = this._standY + (this._hangY - this._standY) * t;
      this._jumpPressed = input.isJump();
      if (t >= 1) { this._hangState = 'hang'; this._climbProg = 0; }
    }
  }

  _animate(input) {
    const moving = Math.abs(this.vx) > 0.5;
    if (moving && this.onGround) {
      this.walkTimer += this.crouching ? 0.10 : 0.18;
    } else if (!this.onGround) {
      this.walkTimer += 0.05;
    }
    // Decay squish
    if (this.jumpSquish > 0) this.jumpSquish = Math.max(0, this.jumpSquish - 0.06);
  }

  // Add one block/item. Returns blockType if it's a newly discovered ore, else null.
  addBlock(blockType) {
    this.totalMined++;

    // Track ore discovery (IRON, DIAMOND, GOLD, NETHERITE unlock recipes)
    const isDiscoverableOre = (blockType === BLOCK.IRON_ORE ||
                               blockType === BLOCK.DIAMOND_ORE ||
                               blockType === BLOCK.GOLD_ORE ||
                               blockType === BLOCK.NETHERITE_ORE);
    const newOre = (isDiscoverableOre && !this.discoveredOres.has(blockType))
      ? blockType : null;
    if (newOre !== null) this.discoveredOres.add(blockType);

    // Hotbar layout after the pickaxe removal: slot 0 = sword, 1 = bow, 2 = apple
    // (reserved food), 3-8 = free inventory. (Was: 0-2 tools, 3 apple, 4-8 free.)

    // Platformer mode: route priority items to their dedicated hotbar slot first.
    if (this.platformerSlots) {
      const reserved = this.platformerSlots.get(blockType);
      if (reserved !== undefined) {
        const s = this.hotbar[reserved];
        if (s?.type === blockType) { s.count++; return newOre; }
        if (!s) { this.hotbar[reserved] = { type: blockType, count: 1 }; return newOre; }
        // Reserved slot occupied by something else — fall through to normal placement
      }
    }

    // Apples: prefer slot 2 (the reserved food slot after sword+bow).
    if (blockType === BLOCK.APPLE) {
      if (this.hotbar[2]?.type === BLOCK.APPLE) { this.hotbar[2].count++; return newOre; }
      if (!this.hotbar[2]) { this.hotbar[2] = { type: blockType, count: 1 }; return newOre; }
      // Slot 2 occupied by something else — fall through to free slots
    }

    // 1. Merge into existing stack in free hotbar slots (3-8)
    for (let i = 3; i < 9; i++) {
      if (this.hotbar[i]?.type === blockType) { this.hotbar[i].count++; return newOre; }
    }
    // 2. Merge into existing inventory stack
    for (let i = 0; i < 36; i++) {
      if (this.inventory[i]?.type === blockType) { this.inventory[i].count++; return newOre; }
    }
    // 3. First empty free hotbar slot (3-8)
    for (let i = 3; i < 9; i++) {
      if (!this.hotbar[i]) { this.hotbar[i] = { type: blockType, count: 1 }; return newOre; }
    }
    // 4. First empty inventory slot
    for (let i = 0; i < 36; i++) {
      if (!this.inventory[i]) { this.inventory[i] = { type: blockType, count: 1 }; return newOre; }
    }
    // Fully full — ignore
    return newOre;
  }

  // Heal the player by amount, capped at maxHp. Returns amount actually healed.
  heal(amount) {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    return this.hp - before;
  }

  // Total count of a block type across hotbar + inventory
  countItem(blockType) {
    let total = 0;
    for (const slot of this.hotbar)    { if (slot && slot.type === blockType) total += slot.count; }
    for (const slot of this.inventory) { if (slot && slot.type === blockType) total += slot.count; }
    return total;
  }

  // True if every material in a recipe is available in sufficient quantity
  hasMaterials(recipe) {
    return recipe.materials.every(mat => this.countItem(mat.block) >= mat.count);
  }

  // Consume materials from hotbar+inventory and upgrade the crafted tool
  craftTool(recipe) {
    for (const mat of recipe.materials) {
      let remaining = mat.count;
      for (let i = 0; i < 9 && remaining > 0; i++) {
        const slot = this.hotbar[i];
        if (slot && slot.type === mat.block) {
          const take  = Math.min(slot.count, remaining);
          slot.count -= take; remaining -= take;
          if (slot.count <= 0) this.hotbar[i] = null;
        }
      }
      for (let i = 0; i < 36 && remaining > 0; i++) {
        const slot = this.inventory[i];
        if (slot && slot.type === mat.block) {
          const take  = Math.min(slot.count, remaining);
          slot.count -= take; remaining -= take;
          if (slot.count <= 0) this.inventory[i] = null;
        }
      }
    }
    // Block items (e.g. Arrow ×4, Eye of Ender): add directly to inventory
    if (recipe.isBlockItem) {
      const count = recipe.resultCount || 1;
      for (let i = 0; i < count; i++) this.addBlock(recipe.resultBlock);
      return;
    }
    // Armor: add to inventory (auto-equips if better)
    if (ARMOR_DATA[recipe.result]) {
      this.addArmorItem(recipe.result);
      return;
    }
    // Update the tool property; weaponMode is derived from selectedSlot automatically
    const data = TOOL_DATA[recipe.result];
    if (data.type === 'pickaxe') {
      this.pickaxe = recipe.result;
    } else if (data.type === 'bow') {
      this.bow = recipe.result;
    } else if (data.type === 'shield') {
      this.hasShield = true;  // no inventory slot — appears on player
    } else if (data.type === 'flint_steel') {
      this.hasFlintSteel = true; // no inventory slot — used via U near portal
    } else {
      this.sword = recipe.result;
    }
  }

  // Remove one block from the given slot. Returns the block type, or null if empty.
  takeFromSlot(slot) {
    const entry = this.hotbar[slot];
    if (!entry) return null;
    const type = entry.type;
    entry.count--;
    if (entry.count <= 0) this.hotbar[slot] = null;
    return type;
  }

  // Convenience: take from currently selected slot
  takeSelected() {
    return this.takeFromSlot(this.selectedSlot);
  }

  get selectedItem() {
    return this.hotbar[this.selectedSlot]; // { type, count } or null
  }

  draw(ctx, camera) {
    const sx = Math.floor(this.x - camera.x);
    const sy = Math.floor(this.y - camera.y);

    // Flying glow aura
    if (this.flying) {
      ctx.save();
      const pulse = 0.3 + 0.15 * Math.sin(this._frameNum * 0.12);
      ctx.shadowColor = `rgba(80,180,255,${pulse + 0.2})`;
      ctx.shadowBlur  = 14;
      ctx.fillStyle   = `rgba(80,180,255,${pulse})`;
      ctx.beginPath();
      ctx.ellipse(sx + this.width / 2, sy + this.height + 4, 12, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Flash during invincibility frames
    if (this.iframes > 0 && Math.floor(this.iframes / 4) % 2 === 0) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      this._drawSteve(ctx, sx, sy);
      ctx.restore();
    } else {
      this._drawSteve(ctx, sx, sy);
    }
  }

  _drawSteve(ctx, sx, sy) {
    const crouch    = this.crouching;
    // Special animated poses (opt-in moves). Priority: hang > slide > wall-slide > roll.
    const hanging   = !!this._hangState;
    const sliding   = this._slideFrames > 0;
    const wallSlide = this._wallSliding && !this.onGround && !hanging && !sliding;
    const rolling   = this._rollFrames > 0 && !this.onGround && !crouch && !hanging && !sliding;
    const special   = hanging || sliding || wallSlide || rolling;

    const rprog     = rolling ? 1 - (this._rollFrames / (this._rollTotal || 1)) : 0;
    const rollAngle = rolling ? (this._rollDir || 1) * rprog * Math.PI * 2 : 0;
    const tuck      = rolling ? Math.sin(rprog * Math.PI) : 0;   // ease in → peak → out
    const swing     = special ? 0 : Math.sin(this.walkTimer) * (this.onGround ? 0.5 : 0.2);
    const flipX     = this.facing === -1;
    const squishY   = special ? 1 : 1 - this.jumpSquish * 0.12;
    const squishX   = special ? 1 : 1 + this.jumpSquish * 0.08;

    // ── Per-pose arm angles (local space; flipX mirrors toward facing). ──
    // null = default swing. Forward (toward facing) ≈ -1.6; straight down = 0.
    let armL = null, armR = null;
    if (hanging) {
      if (this._hangState === 'up') {
        // Muscle-up: arms pivot from the forward grip down to perpendicular.
        const tA = Math.min(1, (this._climbProg || 0) / 0.65);
        armL = armR = -1.6 + 1.6 * tA;
      } else {
        armL = armR = -1.6;                 // both arms forward, gripping the ledge
      }
    } else if (wallSlide) {
      armR = -1.5;                            // leading hand presses the wall
    } else if (sliding) {
      armL = 2.3;                             // trailing arm raised behind
    }

    // Whole-sprite lean for the ground slide / wall slide (roll has its own spin).
    let leanAngle = 0, leanCX = sx + this.width / 2, leanCY = sy + this.height / 2;
    if (sliding)        { leanAngle = this._slideDir * -0.85; leanCY = sy + this.height; } // lean back, pivot at feet
    else if (wallSlide) { leanAngle = -this._wallSlideDir * 0.22; }                        // lean away from the wall

    ctx.save();
    if (rolling) {
      const rcx = sx + this.width / 2, rcy = sy + this.height / 2;
      ctx.translate(rcx, rcy); ctx.rotate(rollAngle); ctx.translate(-rcx, -rcy);
    } else if (leanAngle) {
      ctx.translate(leanCX, leanCY); ctx.rotate(leanAngle); ctx.translate(-leanCX, -leanCY);
    }
    // Squish transform centred on bottom of player
    const pivotX = sx + this.width / 2;
    const pivotY = sy + this.height;
    ctx.translate(pivotX, pivotY);
    ctx.scale(squishX, squishY);
    ctx.translate(-pivotX, -pivotY);

    if (flipX) {
      // Mirror around player centre
      ctx.translate(sx + this.width / 2, 0);
      ctx.scale(-1, 1);
      ctx.translate(-(sx + this.width / 2), 0);
    }

    const useCrouch = crouch && !sliding && !hanging;
    if (useCrouch) {
      this._drawCrouch(ctx, sx, sy);
    } else {
      this._drawStanding(ctx, sx, sy, swing, tuck, armL, armR);
    }

    this._drawArmorOverlay(ctx, sx, sy, useCrouch);

    if (this.hasShield) {
      this._drawShield(ctx, sx, sy, useCrouch);
    }

    ctx.restore();

    // Weapon hidden during any special pose (arms are busy).
    if (!special) this._drawWeapon(ctx, sx, sy, swing, flipX, crouch);
  }

  _drawStanding(ctx, sx, sy, swing, tuck = 0, armAngleL = null, armAngleR = null) {
    // ── Colors ──────────────────────────────────────────────
    const SKIN    = '#F4C78A';
    const HAIR    = '#7D4E1A';
    const SHIRT   = this.shirtColor || '#4A8FD4'; // CTF team shirt colour (§6)
    const PANTS   = '#2C5F8A';
    const SHOE    = '#3D1C02';
    const SHADOW  = 'rgba(0,0,0,0.4)';

    // Shadow on ground
    ctx.fillStyle = SHADOW;
    ctx.beginPath();
    ctx.ellipse(sx + this.width/2, sy + this.height + 2, 10, 3, 0, 0, Math.PI*2);
    ctx.fill();

    // ── Legs (animated) ─────────────────────────────────────
    const legSwing = swing * 10; // degrees effectively

    // Left leg (tuck pulls it up + inward toward the torso during the air-roll)
    ctx.save();
    ctx.translate(sx + 4 + tuck * 4, sy + 34 - tuck * 14);
    ctx.rotate(legSwing);
    ctx.fillStyle = PANTS;
    ctx.fillRect(-2, 0, 8, 14);
    ctx.fillStyle = SHOE;
    ctx.fillRect(-2, 14, 8, 4);
    if (this.equippedArmor.legs) {
      const c = this._armorColors(this.equippedArmor.legs);
      ctx.fillStyle = c.dark;  ctx.fillRect(-3, -1, 9, 15);
      ctx.fillStyle = c.base;  ctx.fillRect(-2,  0, 7, 13);
      ctx.fillStyle = c.hi;    ctx.fillRect(-1,  1, 5,  3);
    }
    if (this.equippedArmor.feet) {
      const c = this._armorColors(this.equippedArmor.feet);
      ctx.fillStyle = c.dark;  ctx.fillRect(-3, 13, 10, 6);
      ctx.fillStyle = c.base;  ctx.fillRect(-2, 14,  7, 4);
      ctx.fillStyle = c.hi;    ctx.fillRect(-1, 14,  4, 2);
    }
    ctx.restore();

    // Right leg
    ctx.save();
    ctx.translate(sx + 12 - tuck * 4, sy + 34 - tuck * 14);
    ctx.rotate(-legSwing);
    ctx.fillStyle = PANTS;
    ctx.fillRect(-2, 0, 8, 14);
    ctx.fillStyle = SHOE;
    ctx.fillRect(-2, 14, 8, 4);
    if (this.equippedArmor.legs) {
      const c = this._armorColors(this.equippedArmor.legs);
      ctx.fillStyle = c.dark;  ctx.fillRect(-3, -1, 9, 15);
      ctx.fillStyle = c.base;  ctx.fillRect(-2,  0, 7, 13);
      ctx.fillStyle = c.hi;    ctx.fillRect(-1,  1, 5,  3);
    }
    if (this.equippedArmor.feet) {
      const c = this._armorColors(this.equippedArmor.feet);
      ctx.fillStyle = c.dark;  ctx.fillRect(-3, 13, 10, 6);
      ctx.fillStyle = c.base;  ctx.fillRect(-2, 14,  7, 4);
      ctx.fillStyle = c.hi;    ctx.fillRect(-1, 14,  4, 2);
    }
    ctx.restore();

    // ── Left arm ────────────────────────────────────────────
    ctx.save();
    ctx.translate(sx + 2 + tuck * 5, sy + 18 - tuck * 2);
    ctx.rotate(armAngleL != null ? armAngleL : -legSwing);   // per-pose arm angle (hang/slide/wall)
    ctx.fillStyle = SHIRT;
    ctx.fillRect(-2, 0, 6, 12);
    ctx.fillStyle = SKIN;
    ctx.fillRect(-2, 12, 6, 4);
    ctx.restore();

    // ── Body ────────────────────────────────────────────────
    ctx.fillStyle = SHIRT;
    ctx.fillRect(sx + 4, sy + 18, 12, 16);
    // Belt line
    ctx.fillStyle = PANTS;
    ctx.fillRect(sx + 4, sy + 31, 12, 3);

    // ── Right arm (holds pickaxe side) ───────────────────────
    ctx.save();
    ctx.translate(sx + 16 - tuck * 5, sy + 18 - tuck * 2);
    ctx.rotate(armAngleR != null ? armAngleR : legSwing);   // per-pose arm angle (hang/slide/wall)
    ctx.fillStyle = SHIRT;
    ctx.fillRect(-2, 0, 6, 12);
    ctx.fillStyle = SKIN;
    ctx.fillRect(-2, 12, 6, 4);
    ctx.restore();

    // ── Head ────────────────────────────────────────────────
    ctx.fillStyle = SKIN;
    ctx.fillRect(sx + 2, sy, 16, 16);
    // Hair top
    ctx.fillStyle = HAIR;
    ctx.fillRect(sx + 2, sy, 16, 5);
    ctx.fillRect(sx + 2, sy+5, 3, 3);   // sideburn
    // Eyes
    ctx.fillStyle = '#fff';
    ctx.fillRect(sx + 8, sy + 6, 4, 4);
    ctx.fillStyle = '#1A50C0';
    ctx.fillRect(sx + 9, sy + 7, 2, 2);
    // Mouth
    ctx.fillStyle = '#9A4020';
    ctx.fillRect(sx + 8,  sy + 12, 2, 1);
    ctx.fillRect(sx + 11, sy + 12, 2, 1);
  }

  _drawCrouch(ctx, sx, sy) {
    const SKIN  = '#F4C78A';
    const HAIR  = '#7D4E1A';
    const SHIRT = this.shirtColor || '#4A8FD4'; // CTF team shirt colour (§6)
    const PANTS = '#2C5F8A';
    const SHOE  = '#3D1C02';

    // Legs bent
    ctx.fillStyle = PANTS;
    ctx.fillRect(sx+3,  sy+18, 7, 10);
    ctx.fillRect(sx+10, sy+18, 7, 10);
    ctx.fillStyle = SHOE;
    ctx.fillRect(sx+3,  sy+26, 8, 4);
    ctx.fillRect(sx+10, sy+26, 8, 4);
    if (this.equippedArmor.legs) {
      const c = this._armorColors(this.equippedArmor.legs);
      ctx.fillStyle = c.dark;  ctx.fillRect(sx+2,  sy+17, 9, 12);
      ctx.fillStyle = c.base;  ctx.fillRect(sx+3,  sy+18, 7, 10);
      ctx.fillStyle = c.hi;    ctx.fillRect(sx+4,  sy+19, 4,  3);
      ctx.fillStyle = c.dark;  ctx.fillRect(sx+9,  sy+17, 9, 12);
      ctx.fillStyle = c.base;  ctx.fillRect(sx+10, sy+18, 7, 10);
      ctx.fillStyle = c.hi;    ctx.fillRect(sx+11, sy+19, 4,  3);
    }
    if (this.equippedArmor.feet) {
      const c = this._armorColors(this.equippedArmor.feet);
      ctx.fillStyle = c.dark;  ctx.fillRect(sx+2,  sy+25, 10, 6);
      ctx.fillStyle = c.base;  ctx.fillRect(sx+3,  sy+26,  8, 4);
      ctx.fillStyle = c.hi;    ctx.fillRect(sx+4,  sy+26,  4, 2);
      ctx.fillStyle = c.dark;  ctx.fillRect(sx+9,  sy+25, 10, 6);
      ctx.fillStyle = c.base;  ctx.fillRect(sx+10, sy+26,  8, 4);
      ctx.fillStyle = c.hi;    ctx.fillRect(sx+11, sy+26,  4, 2);
    }

    // Body shorter
    ctx.fillStyle = SHIRT;
    ctx.fillRect(sx+4, sy+8, 12, 12);

    // Arms out
    ctx.fillStyle = SHIRT;
    ctx.fillRect(sx,   sy+10, 5, 10);
    ctx.fillRect(sx+15,sy+10, 5, 10);
    ctx.fillStyle = SKIN;
    ctx.fillRect(sx,   sy+18, 5, 4);
    ctx.fillRect(sx+15,sy+18, 5, 4);

    // Head
    ctx.fillStyle = SKIN;
    ctx.fillRect(sx+2, sy, 16, 16);
    ctx.fillStyle = HAIR;
    ctx.fillRect(sx+2, sy, 16, 5);
    ctx.fillRect(sx+2, sy+5, 3, 3);
    ctx.fillStyle = '#fff';
    ctx.fillRect(sx+8, sy+6, 4, 4);
    ctx.fillStyle = '#1A50C0';
    ctx.fillRect(sx+9, sy+7, 2, 2);
    ctx.fillStyle = '#9A4020';
    ctx.fillRect(sx+8,  sy+12, 2, 1);
    ctx.fillRect(sx+11, sy+12, 2, 1);
  }

  _drawWeapon(ctx, sx, sy, swing, flipX, crouch) {
    ctx.save();

    const hx = flipX ? (sx + 2) : (sx + 18);
    const hy = crouch ? (sy + 22) : (sy + 26 + Math.sin(this.walkTimer) * 4);
    ctx.translate(hx, hy);

    // Swing arc: weapon lunges forward when swingTimer is high, returns to rest
    let angle;
    if (this.swingTimer > 0) {
      const t          = this.swingTimer / 15;  // 1 → 0
      const attackAngle = flipX ? 0.9 : -0.9;
      const restAngle   = flipX ? (-0.4 + swing * 0.3) : (0.4 - swing * 0.3);
      angle = attackAngle + (restAngle - attackAngle) * (1 - t);
    } else {
      angle = flipX ? (-0.4 + swing * 0.3) : (0.4 - swing * 0.3);
    }
    ctx.rotate(angle);

    if (this._mining) {
      this._drawPickaxeHead(ctx); // always-active mining shows the pickaxe in-hand
    } else if (this.weapon === 'item') {
      ctx.restore();
      return; // nothing to draw for plain item slots
    } else if (this.weapon === 'sword') {
      this._drawSwordHead(ctx);
    } else if (this.weapon === 'bow') {
      ctx.rotate(0); // override angle for bow
      ctx.restore();
      this._drawBow(ctx, sx, sy, flipX);
      return;
    } else {
      this._drawPickaxeHead(ctx);
    }

    ctx.restore();
  }

  _drawBow(ctx, sx, sy, flipX) {
    const charge  = this.drawProgress;
    const bowX    = flipX ? sx - 4 : sx + 16;
    const bowY    = sy + 14;
    const pullX   = flipX ? 6 * charge : -6 * charge;

    ctx.save();
    ctx.translate(bowX, bowY);
    if (flipX) ctx.scale(-1, 1);

    // Bow limbs
    ctx.strokeStyle = '#8B5C1A';
    ctx.lineWidth   = 3;
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.quadraticCurveTo(-8, 0, 0, 14);
    ctx.stroke();

    // Bowstring (pulled back when drawing)
    ctx.strokeStyle = '#DDD';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(-6 * charge - 1, 0);
    ctx.lineTo(0, 14);
    ctx.stroke();

    // Arrow on string when drawing
    if (charge > 0.1) {
      ctx.save();
      ctx.translate(-6 * charge, 0);
      ctx.fillStyle = '#8B5C1A';
      ctx.fillRect(-8, -1, 16, 2);
      ctx.fillStyle = '#AAA';
      ctx.beginPath();
      ctx.moveTo(8, 0); ctx.lineTo(4, -3); ctx.lineTo(4, 3);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  _drawPickaxeHead(ctx) {
    // Handle
    ctx.fillStyle = '#8B5C1A';
    ctx.fillRect(-1, -12, 2, 18);
    // Head
    ctx.fillStyle = '#C8A55A';
    ctx.fillRect(-8, -15, 16, 5);
    ctx.fillStyle = '#A07830';
    ctx.fillRect(-8, -15, 3, 8);
    ctx.fillRect( 5, -15, 3, 8);
    ctx.fillStyle = '#5A3A10';
    ctx.fillRect(-2, -11, 4, 4);
  }

  _drawSwordHead(ctx) {
    // Handle wrap
    ctx.fillStyle = '#5A3A10';
    ctx.fillRect(-2, 0, 4, 8);
    ctx.fillStyle = '#8B5C1A';
    ctx.fillRect(-1, 2, 2, 6);
    // Guard
    ctx.fillStyle = '#C8A55A';
    ctx.fillRect(-6, -2, 12, 4);
    ctx.fillStyle = '#A07830';
    ctx.fillRect(-6, -2, 3, 4);
    ctx.fillRect( 3, -2, 3, 4);
    // Blade
    ctx.fillStyle = '#CCCCCC';
    ctx.fillRect(-2, -18, 4, 17);
    // Blade highlight
    ctx.fillStyle = '#EEEEEE';
    ctx.fillRect(-1, -18, 2, 17);
    // Tip
    ctx.fillStyle = '#AAAAAA';
    ctx.fillRect(-1, -21, 2, 4);
  }

  _armorColors(key) {
    const TIER_C = [
      { base: '#C8A55A', dark: '#7A5A18', hi: '#E8C875' },
      { base: '#C0C0C0', dark: '#606060', hi: '#E8E8E8' },
      { base: '#33BBEE', dark: '#115577', hi: '#88EEFF' },
      { base: '#6A5A50', dark: '#302520', hi: '#9A8A80' },
    ];
    return TIER_C[ARMOR_DATA[key]?.tier ?? 0];
  }

  _drawArmorOverlay(ctx, sx, sy, crouch) {
    const eq = this.equippedArmor;
    if (!eq.head && !eq.chest && !eq.legs && !eq.feet) return;

    const tc = (key) => this._armorColors(key);

    ctx.save();
    if (!crouch) {
      // ── Standing armor ─────────────────────────���────────────
      if (eq.head) {
        const c = tc(eq.head);
        ctx.fillStyle = c.dark;
        ctx.fillRect(sx + 2, sy, 16, 16);
        ctx.fillStyle = c.base;
        ctx.fillRect(sx + 3, sy + 1, 14, 13);      // main plate
        ctx.fillStyle = c.hi;
        ctx.fillRect(sx + 4, sy + 2, 12, 3);       // top highlight
        ctx.fillStyle = c.dark;
        ctx.fillRect(sx + 3, sy + 14, 14, 2);      // chin bar
        // Eye visor slot — re-expose skin
        ctx.fillStyle = '#F4C78A';
        ctx.fillRect(sx + 6, sy + 6, 8, 5);
        ctx.fillStyle = c.base;
        ctx.fillRect(sx + 6, sy + 6, 2, 5);        // left eye guard
        ctx.fillRect(sx + 12, sy + 6, 2, 5);       // right eye guard
      }
      if (eq.chest) {
        const c = tc(eq.chest);
        ctx.fillStyle = c.dark;
        ctx.fillRect(sx + 3, sy + 16, 14, 18);
        ctx.fillStyle = c.base;
        ctx.fillRect(sx + 4, sy + 17, 12, 16);
        ctx.fillStyle = c.hi;
        ctx.fillRect(sx + 5, sy + 18, 8, 3);
        // Shoulder guards over arms
        ctx.fillStyle = c.base;
        ctx.fillRect(sx, sy + 17, 5, 10);
        ctx.fillRect(sx + 15, sy + 17, 5, 10);
        ctx.fillStyle = c.dark;
        ctx.fillRect(sx + 3, sy + 31, 14, 3);
      }
    } else {
      // ── Crouching armor (CROUCH_H=32) ───────────────────────
      if (eq.head) {
        const c = tc(eq.head);
        ctx.fillStyle = c.dark;
        ctx.fillRect(sx + 2, sy, 16, 16);
        ctx.fillStyle = c.base;
        ctx.fillRect(sx + 3, sy + 1, 14, 13);
        ctx.fillStyle = c.hi;
        ctx.fillRect(sx + 4, sy + 2, 12, 3);
        ctx.fillStyle = '#F4C78A';
        ctx.fillRect(sx + 6, sy + 6, 8, 5);
        ctx.fillStyle = c.base;
        ctx.fillRect(sx + 6, sy + 6, 2, 5);
        ctx.fillRect(sx + 12, sy + 6, 2, 5);
      }
      if (eq.chest) {
        const c = tc(eq.chest);
        ctx.fillStyle = c.dark;
        ctx.fillRect(sx + 3, sy + 7, 14, 13);
        ctx.fillStyle = c.base;
        ctx.fillRect(sx + 4, sy + 8, 12, 11);
        ctx.fillStyle = c.hi;
        ctx.fillRect(sx + 5, sy + 9, 8, 3);
        ctx.fillStyle = c.base;
        ctx.fillRect(sx - 1, sy + 8, 5, 9);
        ctx.fillRect(sx + 15, sy + 8, 5, 9);
      }
    }
    ctx.restore();
  }

  // Shield drawn on left arm (flips correctly with player facing)
  _drawShield(ctx, sx, sy, crouch) {
    if (crouch) {
      // Raised blocking position — large shield covers front of crouched player
      ctx.fillStyle = '#4A6B7A';
      ctx.fillRect(sx - 4, sy + 2, 8, 26);   // main shield body
      ctx.fillStyle = '#6B9DB8';
      ctx.fillRect(sx - 3, sy + 4, 6, 20);   // face plate
      ctx.fillStyle = '#3A5060';
      ctx.fillRect(sx - 4, sy + 2, 8, 3);    // top band
      ctx.fillRect(sx - 4, sy + 25, 8, 3);   // bottom band
      ctx.fillStyle = '#9CCCE0';
      ctx.fillRect(sx - 2, sy + 10, 4, 4);   // centre emblem
      ctx.fillStyle = '#7AAABF';
      ctx.fillRect(sx - 2, sy + 8, 4, 1);
      ctx.fillRect(sx - 2, sy + 15, 4, 1);
    } else {
      // Carried on left arm while standing — small shield strapped to arm
      ctx.fillStyle = '#4A6B7A';
      ctx.fillRect(sx - 5, sy + 18, 5, 16);  // shield body on left arm
      ctx.fillStyle = '#6B9DB8';
      ctx.fillRect(sx - 4, sy + 19, 3, 13);  // face plate
      ctx.fillStyle = '#3A5060';
      ctx.fillRect(sx - 5, sy + 18, 5, 2);   // top band
      ctx.fillStyle = '#9CCCE0';
      ctx.fillRect(sx - 4, sy + 22, 2, 2);   // emblem
    }
  }
}
