// ============================================================
// emerald-system.js — Arena emerald collectibles (Phase 3A.2)
//
// Built at arena start from the designed world's `emeralds` (saved world_data).
// Pickup is AABB overlap with the player hitbox (player.x/y/width/height — there
// is no player.health field). Drawn inside the arena zoom context via the shared
// _drawEmeraldIcon (sandbox.js). Score is awarded by the caller's onCollect hook.
// ============================================================

const EMERALD_SYSTEM = {
  emeralds: [],   // [{ wx, wy, collected }]
  collected: 0,
  total: 0,

  // game._arenaTemplateData.emeralds is the saved layout (arena skips _loadSandboxWorld).
  init(game) {
    const src = (game && game._arenaTemplateData && Array.isArray(game._arenaTemplateData.emeralds))
      ? game._arenaTemplateData.emeralds : [];
    this.emeralds = src
      .filter(e => e && typeof e.col === 'number' && typeof e.row === 'number')
      .map(e => ({ wx: e.col * BLOCK_SIZE + BLOCK_SIZE / 2, wy: e.row * BLOCK_SIZE + BLOCK_SIZE / 2, collected: false }));
    this.collected = 0;
    this.total = this.emeralds.length;
  },

  reset() { this.emeralds = []; this.collected = 0; this.total = 0; },

  // AABB overlap vs the player; calls onCollect() per emerald taken. Returns the
  // count collected this call. Emerald sprite ≈ 18×24 centered at (wx, wy).
  checkPickup(player, onCollect) {
    if (!player) return 0;
    let n = 0;
    const px = player.x, py = player.y, pw = player.width || PLAYER_W, ph = player.height || PLAYER_H;
    for (const e of this.emeralds) {
      if (e.collected) continue;
      if (px < e.wx + 10 && px + pw > e.wx - 10 && py < e.wy + 13 && py + ph > e.wy - 13) {
        e.collected = true;
        this.collected++;
        n++;
        if (onCollect) onCollect(e);
      }
    }
    return n;
  },

  allCollected() { return this.total > 0 && this.collected >= this.total; },
  remaining()    { return this.total - this.collected; },

  draw(ctx, camera, frameCount) {
    for (const e of this.emeralds) {
      if (e.collected) continue;
      const sx = e.wx - camera.x, sy = e.wy - camera.y;
      if (sx < -40 || sx > CANVAS_W + 40 || sy < -40 || sy > CANVAS_H + 40) continue;
      _drawEmeraldIcon(ctx, sx, sy, frameCount, false);
    }
  },
};

if (typeof window !== 'undefined') window.EMERALD_SYSTEM = EMERALD_SYSTEM;
