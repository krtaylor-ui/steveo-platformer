// ============================================================
// camera.js — Viewport camera that follows the player
// ============================================================

class Camera {
  constructor(levelPixelWidth, levelPixelHeight) {
    this.x = 0;
    this.y = 0;
    this._levelW = levelPixelWidth;
    this._levelH = levelPixelHeight;
  }

  follow(player) {
    // Centre on player with a slight vertical bias upward (so you can see above)
    const targetX = player.x + PLAYER_W / 2 - CANVAS_W / 2;
    const targetY = player.y + player.height / 2 - CANVAS_H * 0.55;

    // Smooth lerp (comment out for immediate follow)
    this.x += (targetX - this.x) * 0.12;
    this.y += (targetY - this.y) * 0.10;

    // Clamp to level bounds
    this.x = Math.max(0, Math.min(this._levelW - CANVAS_W,  this.x));
    this.y = Math.max(0, Math.min(this._levelH - CANVAS_H,  this.y));
  }

  // Follow midpoint between two players (Phase 12 — 2-player co-op)
  followMidpoint(p1, p2) {
    const midX   = (p1.x + p2.x) / 2 + PLAYER_W / 2;
    const midY   = (p1.y + p2.y) / 2 + PLAYER_H / 4;
    const targetX = midX - CANVAS_W / 2;
    const targetY = midY - CANVAS_H * 0.55;
    this.x += (targetX - this.x) * 0.10;
    this.y += (targetY - this.y) * 0.10;
    this.x = Math.max(0, Math.min(this._levelW - CANVAS_W,  this.x));
    this.y = Math.max(0, Math.min(this._levelH - CANVAS_H,  this.y));
  }

  // Convert world coords → screen coords
  toScreen(wx, wy) {
    return { x: wx - this.x, y: wy - this.y };
  }

  // Convert screen coords → world coords
  toWorld(sx, sy) {
    return { x: sx + this.x, y: sy + this.y };
  }
}
