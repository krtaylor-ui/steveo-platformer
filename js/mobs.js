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

  // Horizontal — with 1-block step-up
  if (mob.vx > 0) {
    const newX    = mob.x + mob.vx;
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
    const newX    = mob.x + mob.vx;
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

// ── Base Mob ─────────────────────────────────────────────────

class Mob {
  constructor(x, y, w, h, hp) {
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

    // Wander / chase state
    this.state             = 'wander';
    this.wanderDir         = Math.random() < 0.5 ? -1 : 1;
    this.wanderChangeTimer = 180 + Math.floor(Math.random() * 120); // 3-5 s
    this.stuckCheckTimer   = 600;  // 10 s
    this.stuckCheckX       = x + w / 2;
    this.spawnCX           = x + w / 2;
    this.spawnY            = y;
  }

  get cx() { return this.x + this.width  / 2; }
  get cy() { return this.y + this.height / 2; }

  // Returns true if damage was applied
  takeDamage(amount, knockDir = 0) {
    if (this.hitCooldown > 0) return false;
    this.hp -= amount;
    this.hitCooldown    = IFRAMES;
    this.knockbackTimer = 12;
    if (knockDir !== 0) {
      this.vx = knockDir * KNOCKBACK_FORCE;
      this.vy = -3.5;
    }
    if (this.hp <= 0) { this.hp = 0; this.alive = false; }
    return true;
  }

  _touchesPlayer(p) {
    return this.x < p.x + p.width  && this.x + this.width  > p.x &&
           this.y < p.y + p.height && this.y + this.height > p.y;
  }

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

  _flashAlpha(ctx) {
    // Flash white-ish when recently hit
    if (this.hitCooldown > 0 && Math.floor(this.hitCooldown / 4) % 2 === 0) {
      ctx.globalAlpha = 0.35;
    }
  }
}

// ── Zombie ───────────────────────────────────────────────────

class Zombie extends Mob {
  constructor(x, y) {
    super(x, y, 22, 48, 10);
    this.attackTimer = 0;
  }

  update(player, level) {
    if (!this.alive) return;
    this._tickTimers();
    if (this.attackTimer > 0) this.attackTimer--;

    const dx   = player.cx - this.cx;
    const dist = Math.abs(dx);

    this.state = dist < CANVAS_W / 3 ? 'chase' : 'wander';

    if (this.knockbackTimer > 0) {
      // knockback — let physics handle it
    } else if (this.state === 'chase') {
      this.vx     = Math.sign(dx) * 1.8;
      this.facing = Math.sign(dx);
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
    if (sx > CANVAS_W + 40 || sx + this.width < -40) return;

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

    const dx   = player.cx - this.cx;
    const dist = Math.abs(dx);

    this.state = dist < CANVAS_W / 3 ? 'chase' : 'wander';

    if (this.knockbackTimer > 0) {
      // knockback — let physics handle it
    } else if (this.state === 'wander') {
      this._wanderUpdate(level, 0.7);
    } else {
      if (dist > 180 && dist < 350) {
        // Approach to shoot range
        this.vx     = Math.sign(dx) * 1.5;
        this.facing = Math.sign(dx);
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
  }

  draw(ctx, camera) {
    if (!this.alive) return;
    const sx = Math.floor(this.x - camera.x);
    const sy = Math.floor(this.y - camera.y);
    if (sx > CANVAS_W + 40 || sx + this.width < -40) return;

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

    this.state = dist < CANVAS_W / 3 ? 'chase' : 'wander';

    if (this.knockbackTimer > 0) {
      // knockback — let physics handle it
    } else if (this.state === 'wander') {
      this._wanderUpdate(level, 0.7);
    } else {
      this.vx     = Math.sign(dx) * 1.5;
      this.facing = Math.sign(dx);
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
    if (sx > CANVAS_W + 40 || sx + this.width < -40) return;

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

  update(player, level) {
    if (!this.alive) return;
    this.age++;
    if (this.age > 280) { this.alive = false; return; }

    this.vy += this.gravity;
    this.x  += this.vx;
    this.y  += this.vy;

    // Block collision
    const col = Math.floor(this.x / BLOCK_SIZE);
    const row = Math.floor(this.y / BLOCK_SIZE);
    if (level.isSolid(row, col)) { this.alive = false; return; }

    if (this.isPlayerArrow) return; // deflected/player arrows don't hurt player

    // Player collision
    if (this.x > player.x && this.x < player.x + player.width &&
        this.y > player.y && this.y < player.y + player.height) {
      if (player.crouching && player.hasShield) {
        // Shield deflects — reverse direction, now acts as player arrow
        this.vx = -this.vx;
        this.isPlayerArrow = true;
      } else {
        player.takeDamage(this.damage, Math.sign(this.vx));
        this.alive = false;
      }
    }
  }

  draw(ctx, camera) {
    if (!this.alive) return;
    const sx    = this.x - camera.x;
    const sy    = this.y - camera.y;
    if (sx < -20 || sx > CANVAS_W + 20) return;
    const angle = Math.atan2(this.vy, this.vx);

    ctx.save();
    ctx.translate(Math.floor(sx), Math.floor(sy));
    ctx.rotate(angle);
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
    ctx.restore();
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
    if (sx < -40 || sx > CANVAS_W + 40 || sy < -40 || sy > CANVAS_H + 40) return;

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
    if (sx < -20 || sx > CANVAS_W + 20 || sy < -20 || sy > CANVAS_H + 20) return;

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
    this.speed = 3.6;
  }

  update(player, level) {
    this._tickTimers();
    if (this.knockbackTimer > 0) { _mobPhysics(this, level); return; }

    // Chase player horizontally, jump to reach
    const dir = Math.sign(player.cx - this.cx);
    this.vx   = dir * this.speed;
    this.facing = dir;

    // Jump if blocked or can jump up to player
    if (this.onGround) {
      const dRow = Math.floor(this.y / BLOCK_SIZE);
      const dCol = Math.floor((this.x + (dir > 0 ? this.width + 2 : -2)) / BLOCK_SIZE);
      if (level.isSolid(dRow, dCol) || player.y < this.y - 8) {
        this.vy = JUMP_VELOCITY * 0.85;
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
    if (sx < -40 || sx > CANVAS_W + 40) return;

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
    this.speed     = 2.7;
    this.attackTimer = 0;
  }

  update(player, level) {
    this._tickTimers();
    if (this.attackTimer > 0) this.attackTimer--;
    if (this.knockbackTimer > 0) { _mobPhysics(this, level); return; }

    const dir = Math.sign(player.cx - this.cx);
    this.vx = dir * this.speed;
    this.facing = dir;

    if (this.onGround && level.isSolid(
        Math.floor(this.y / BLOCK_SIZE),
        Math.floor((this.x + (dir > 0 ? this.width + 2 : -2)) / BLOCK_SIZE))) {
      this.vy = JUMP_VELOCITY * 0.9;
    }

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
    if (sx < -40 || sx > CANVAS_W + 40) return;

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
      if (player.crouching && player.hasShield) {
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
    if (sx < -20 || sx > CANVAS_W + 20) return;

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

    // Float toward player vertically, drift horizontally
    const targetY = player.y - 40;
    this.vy = Math.max(-3, Math.min(3, (targetY - this.y) * 0.05));
    this.vx = dir * this.speed;

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

    // Shoot fireball
    const dist = Math.hypot(player.cx - this.cx, player.cy - this.cy);
    if (this.shootTimer === 0 && dist < 400) {
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
    if (sx < -40 || sx > CANVAS_W + 40) return;

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
  }

  update(player, level) {
    this._tickTimers();
    if (this.attackTimer > 0) this.attackTimer--;
    if (this.knockbackTimer > 0) { _mobPhysics(this, level); return; }

    const dir = Math.sign(player.cx - this.cx);
    this.vx = dir * this.speed;
    this.facing = dir;

    if (this.onGround && level.isSolid(
        Math.floor(this.y / BLOCK_SIZE),
        Math.floor((this.x + (dir > 0 ? this.width + 2 : -2)) / BLOCK_SIZE))) {
      this.vy = JUMP_VELOCITY * 0.95;
    }

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
    if (sx < -40 || sx > CANVAS_W + 40) return;

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
  }

  update(player, level) {
    this._tickTimers();
    if (this.attackTimer      > 0) this.attackTimer--;
    if (this.teleportCooldown > 0) this.teleportCooldown--;
    if (this.knockbackTimer   > 0) { _mobPhysics(this, level); return; }

    const dist = Math.hypot(player.cx - this.cx, player.cy - this.cy);
    const aggro = dist < this.aggroRange;

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
      return;
    }
    // No valid spot found — despawn
    this.alive = false;
  }

  draw(ctx, camera) {
    if (!this.alive) return;
    const sx = Math.floor(this.x - camera.x);
    const sy = Math.floor(this.y - camera.y);
    if (sx < -40 || sx > CANVAS_W + 40) return;

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
  constructor(x, y, itemKey, amount = 1) {
    this.x       = x; this.y = y;
    this.vx      = (Math.random() - 0.5) * 4;
    this.vy      = -5;
    this.itemKey = itemKey;
    this.amount  = amount;
    this.life    = ITEM_DROP_LIFETIME;
    this.alive   = true;
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
    if (sx < -20 || sx > CANVAS_W + 20) return;

    // Glowing item block
    const alpha = this.life < 300 ? (this.life / 300) : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = '#FFD700';
    ctx.fillRect(sx - 6, sy - 6, 12, 12);
    ctx.fillStyle = '#FFF';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.amount > 1 ? this.amount : '✦', sx, sy);
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
    this.explosions   = [];
    this.spawnPoints  = [];
    this.playerArrows = [];
    this.blazeShots   = [];
    this.droppedItems = [];
    this.dropConfig   = null;  // set by game.js to _mobDropSettings
    this.nightSpawnMultiplier = 1.0;   // set by game.js; 0.5 at night with boost on
    this.fullMoonActive       = false; // set by game.js; true on full moon with boost on
  }

  // Set up spawn points from world data
  setupSpawnPoints(spawnPoints) {
    this.spawnPoints = spawnPoints.map(sp => ({ ...sp }));
  }

  // Spawn initial mobs from spawn points within activation range
  _updateSpawnPoints(player, level) {
    const pcx = player.x + player.width / 2;
    for (const sp of this.spawnPoints) {
      const spx = sp.col * BLOCK_SIZE;
      const distToPlayer = Math.abs(spx - pcx);

      // Only activate within range, but never spawn too close
      if (distToPlayer > MOB_ACTIVATION_RANGE) continue;
      if (distToPlayer < MOB_MIN_SPAWN_DIST)   continue;

      // Don't respawn if spawn point is currently on screen
      const camLeft  = pcx - CANVAS_W / 2;
      const camRight = pcx + CANVAS_W / 2;
      if (spx >= camLeft && spx <= camRight) continue;

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
      default: return null;
    }
    if (mob && this.fullMoonActive) {
      mob.hp    = Math.ceil(mob.hp    * 1.5);
      mob.maxHp = Math.ceil(mob.maxHp * 1.5);
    }
    return mob;
  }

  addPlayerArrow(x, y, vx, vy, damage) {
    this.playerArrows.push(new Arrow(x, y, vx, vy, damage, BOW_GRAVITY, true));
  }

  // Called from game._update; returns amount of damage dealt to player this frame
  update(player, level) {
    const hpBefore = player.hp;

    // Spawn point respawn
    this._updateSpawnPoints(player, level);

    // Mob AI — deaths are collected and processed after all updates
    for (const mob of this.mobs) {
      if (!mob.alive) continue;
      if (mob instanceof Skeleton) {
        mob.update(player, level, this.arrows);
      } else if (mob instanceof Blaze) {
        mob.update(player, level, this.blazeShots);
      } else {
        mob.update(player, level);
      }
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

    // Skeleton/enemy arrows
    this.arrows = this.arrows.filter(a => { a.update(player, level); return a.alive; });

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

    // Player arrows — check mob collisions
    for (const pa of this.playerArrows) {
      pa.update(player, level);
      if (!pa.alive) continue;
      for (const mob of this.mobs) {
        if (!mob.alive) continue;
        if (pa.x > mob.x && pa.x < mob.x + mob.width &&
            pa.y > mob.y && pa.y < mob.y + mob.height) {
          const dir = Math.sign(pa.vx);
          if (mob.takeDamage(pa.damage, dir)) {
            this.damageNums.push(new DamageNumber(mob.cx, mob.y - 8, pa.damage, '#00EEFF'));
          }
          pa.alive = false;
          break;
        }
      }
    }
    this.playerArrows = this.playerArrows.filter(a => a.alive);

    // Process all deaths in one place — guaranteed exactly once per mob
    this.mobs = this.mobs.filter(m => {
      if (!m.alive) { this._onMobDeath(m); return false; }
      return true;
    });

    // Blaze shots
    this.blazeShots = this.blazeShots.filter(bs => { bs.update(player, level); return bs.alive; });

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

    // XP orbs — animate and collect
    this.xpOrbs = this.xpOrbs.filter(orb => {
      orb.tick();
      if (orb.life <= 0) return false;
      const dist = Math.hypot(orb.worldX - player.cx, orb.worldY - player.cy);
      if (dist < 28) { player.gainXp(XP_PER_ORB); return false; }
      return true;
    });

    return hpBefore - player.hp; // damage taken this frame
  }

  // Player swings weapon — hit all mobs within reach
  playerAttack(player) {
    const damage = player.weaponDamage;
    let anyHit   = false;

    for (const mob of this.mobs) {
      if (!mob.alive) continue;
      const dist = Math.hypot(mob.cx - player.cx, mob.cy - player.cy);
      if (dist > ATTACK_REACH) continue;

      const dir = Math.sign(mob.cx - player.cx);
      if (mob.takeDamage(damage, dir)) {
        this.damageNums.push(
          new DamageNumber(mob.cx, mob.y - 8, damage, '#FFE040')
        );
        anyHit = true;
        // Death handled in update() loop
      }
    }
    return anyHit;
  }

  // Collect dropped items near player; returns array of {itemKey, amount}
  collectDropsNear(player) {
    const pcx = player.x + player.width / 2;
    const pcy = player.y + player.height / 2;
    const collected = [];
    for (const item of this.droppedItems) {
      if (!item.alive) continue;
      if (Math.hypot(item.x - pcx, item.y - pcy) < 32) {
        collected.push({ itemKey: item.itemKey, amount: item.amount });
        item.alive = false;
      }
    }
    return collected;
  }

  dropItems(items) {
    for (const { x, y, itemKey, amount } of items) {
      this.droppedItems.push(new ItemDrop(x, y, itemKey, amount));
    }
  }

  addPlayerDamageNum(player, amount) {
    this.damageNums.push(
      new DamageNumber(player.cx, player.y - 8, amount, '#FF3333')
    );
  }

  _onMobDeath(mob) {
    // XP orbs
    for (let i = 0; i < 2; i++) {
      const ox = mob.cx + (Math.random() - 0.5) * 22;
      const oy = mob.y  + mob.height * 0.4;
      this.xpOrbs.push(new XpOrb(ox, oy));
    }

    // Item drops — use configurable dropConfig if set, else hardcoded defaults
    const drops = [];
    const MOB_CLASS_TO_KEY = {
      Zombie: 'zombie', Skeleton: 'skeleton', Creeper: 'creeper',
      CaveSpider: 'cave_spider', Piglin: 'piglin', Blaze: 'blaze',
      WitherSkeleton: 'wither_skeleton', Enderman: 'enderman',
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
    // Mobs
    for (const mob of this.mobs)       mob.draw(ctx, camera);
    // Floating numbers on top
    for (const d of this.damageNums)   d.draw(ctx, camera);
  }
}
