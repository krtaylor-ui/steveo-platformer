// ============================================================
// powerup-system.js — Arena power-ups (Phase 3A.2)
//
// HEALTH / SPEED / FIRE_RATE / SHIELD pickups, designed in the editor and built
// at arena start from the saved world_data. Effects act on the real player via
// frame-based timers (not setTimeout), so they pause/stop with the game:
//   HEALTH    → instant hp restore (clamped to maxHp)
//   SPEED     → player._speedBoostMult for EFFECT_FRAMES (moveSpeed getter reads it)
//   FIRE_RATE → player._fireRateMult for EFFECT_FRAMES (bow charge step reads it)
//   SHIELD    → player.shield counter; takeDamage() absorbs the next hit each point
// Drawn inside the arena zoom context via the shared _drawPowerupIcon (sandbox.js).
// ============================================================

const POWERUP_SYSTEM = {
  powerups: [],          // [{ wx, wy, powerType, collected }]

  // Tuning
  HEALTH_AMOUNT: 6,      // +3 hearts
  SPEED_MULT:    1.6,
  FIRE_RATE_MULT: 2.0,
  EFFECT_FRAMES: 480,    // ~8s @ 60fps
  SHIELD_MAX:    3,

  init(game) {
    const src = (game && game._arenaTemplateData && Array.isArray(game._arenaTemplateData.powerups))
      ? game._arenaTemplateData.powerups : [];
    this.powerups = src
      .filter(p => p && typeof p.col === 'number' && typeof p.row === 'number')
      .map(p => ({
        wx: p.col * BLOCK_SIZE + BLOCK_SIZE / 2,
        wy: p.row * BLOCK_SIZE + BLOCK_SIZE / 2,
        powerType: p.powerType || 'HEALTH',
        collected: false,
      }));
    // Reset effect state on both players so a new match starts clean.
    for (const pl of [game.player, game.player2]) {
      if (!pl) continue;
      pl._speedBoostMult = 1; pl._speedBoostFrames = 0;
      pl._fireRateMult   = 1; pl._fireRateFrames   = 0;
      pl.shield = 0;
    }
  },

  reset() { this.powerups = []; },

  _apply(type, player) {
    switch (type) {
      case 'HEALTH':    player.hp = Math.min((player.hp || 0) + this.HEALTH_AMOUNT, player.maxHp); break;
      case 'SPEED':     player._speedBoostMult = this.SPEED_MULT;     player._speedBoostFrames = this.EFFECT_FRAMES; break;
      case 'FIRE_RATE': player._fireRateMult   = this.FIRE_RATE_MULT; player._fireRateFrames   = this.EFFECT_FRAMES; break;
      case 'SHIELD':    player.shield = Math.min((player.shield || 0) + 1, this.SHIELD_MAX); break;
    }
  },

  // AABB overlap vs the player; applies the effect on pickup. Returns count taken.
  checkPickup(player) {
    if (!player) return 0;
    let n = 0;
    const px = player.x, py = player.y, pw = player.width || PLAYER_W, ph = player.height || PLAYER_H;
    for (const p of this.powerups) {
      if (p.collected) continue;
      if (px < p.wx + 11 && px + pw > p.wx - 11 && py < p.wy + 11 && py + ph > p.wy - 11) {
        p.collected = true;
        n++;
        this._apply(p.powerType, player);
      }
    }
    return n;
  },

  // Tick timed effects on both players each running frame; revert at expiry.
  update(game) {
    for (const pl of [game.player, game.player2]) {
      if (!pl) continue;
      if (pl._speedBoostFrames > 0) { pl._speedBoostFrames--; if (pl._speedBoostFrames === 0) pl._speedBoostMult = 1; }
      if (pl._fireRateFrames  > 0) { pl._fireRateFrames--;  if (pl._fireRateFrames  === 0) pl._fireRateMult  = 1; }
    }
  },

  draw(ctx, camera, frameCount) {
    for (const p of this.powerups) {
      if (p.collected) continue;
      const sx = p.wx - camera.x, sy = p.wy - camera.y;
      if (sx < -40 || sx > CANVAS_W + 40 || sy < -40 || sy > CANVAS_H + 40) continue;
      _drawPowerupIcon(ctx, sx, sy, p.powerType, frameCount, false);
    }
  },
};

if (typeof window !== 'undefined') window.POWERUP_SYSTEM = POWERUP_SYSTEM;
