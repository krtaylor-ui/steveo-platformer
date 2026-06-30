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

  // Convert world coords → screen coords.
  // NOTE: this is the RAW (un-zoomed) projection. The renderer applies zoom via a
  // ctx scale-about-center transform, so anything drawn inside that transform must
  // use these raw coords (the ctx scale supplies the zoom). Only mouse→world
  // (toWorld) operates on raw, untransformed screen coords and so is zoom-aware.
  toScreen(wx, wy) {
    return { x: wx - this.x, y: wy - this.y };
  }

  // Convert screen coords → world coords. Mouse events are in raw screen space
  // (unaffected by the ctx zoom transform), so undo the scale-about-canvas-center
  // before applying the camera offset: world = (screen - center)/z + center + cam.
  // _srZoom is set by Game._render each frame (1.0 when no zoom is active).
  toWorld(sx, sy) {
    const z = this._srZoom || 1.0;
    const wx = (sx - CANVAS_W / 2) / z + CANVAS_W / 2 + this.x;
    const wy = (sy - CANVAS_H / 2) / z + CANVAS_H / 2 + this.y;
    return { x: wx, y: wy };
  }

  // Visible raw-screen bounds under the current zoom (scale-about-canvas-centre).
  // At z=1 these are 0..CANVAS_W / 0..CANVAS_H; when zoomed OUT (z<1) they widen,
  // so entity draw-culling must use these instead of the raw CANVAS_W/H constants
  // (otherwise mobs/arrows past the un-zoomed edge get wrongly hidden).
  viewMinX() { const z = this._srZoom || 1.0; return CANVAS_W / 2 - (CANVAS_W / 2) / z; }
  viewMaxX() { const z = this._srZoom || 1.0; return CANVAS_W / 2 + (CANVAS_W / 2) / z; }
  viewMinY() { const z = this._srZoom || 1.0; return CANVAS_H / 2 - (CANVAS_H / 2) / z; }
  viewMaxY() { const z = this._srZoom || 1.0; return CANVAS_H / 2 + (CANVAS_H / 2) / z; }
}
