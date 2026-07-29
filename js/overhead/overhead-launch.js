// ══════════════════════════════════════════════════════════════════════════
// Overhead Engine — launcher + demo world + SHARED top-down renderers
// (drawTerrainTile + drawOverheadPlayer) used by BOTH the editor and the runtime
// so the look never drifts. Terrain uses string keys from OH_PALETTE.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  const P = () => window.OH_PALETTE;

  function buildDemoWorld() {
    const density = 1, baseW = 40, baseH = 26;
    const W = baseW * density, H = baseH * density, cell = 32 / density;
    const ground = [], elevation = [];
    for (let r = 0; r < H; r++) { ground.push(new Array(W).fill('grass')); elevation.push(new Array(W).fill(0)); }
    // Border stone at elevation 1 (walls via the elevation-relative rule).
    for (let c = 0; c < W; c++) { ground[0][c] = 'stone'; elevation[0][c] = 1; ground[H - 1][c] = 'stone'; elevation[H - 1][c] = 1; }
    for (let r = 0; r < H; r++) { ground[r][0] = 'stone'; elevation[r][0] = 1; ground[r][W - 1] = 'stone'; elevation[r][W - 1] = 1; }
    // A raised stone plateau (elev 1) with a higher core (elev 2 → overhang you pass under).
    for (let r = 6; r <= 12; r++) for (let c = 12; c <= 20; c++) { ground[r][c] = 'stone'; elevation[r][c] = 1; }
    for (let r = 8; r <= 10; r++) for (let c = 15; c <= 18; c++) elevation[r][c] = 2;
    // Bushes at elev 1 (walls at body height) forming a little maze.
    for (let r = 15; r <= 18; r++) { ground[r][24] = 'bush'; elevation[r][24] = 1; }
    // Stone path row (visual).
    for (let c = 2; c < W - 2; c++) ground[20][c] = 'planks';
    // Lava hazard strip to jump across.
    for (let r = 3; r <= 5; r++) { ground[r][28] = 'lava'; ground[r][29] = 'lava'; }
    // Leaves overhang (elev 2) hiding a coin beneath.
    for (let r = 21; r <= 22; r++) for (let c = 8; c <= 10; c++) { ground[r][c] = 'leaves'; elevation[r][c] = 2; }

    const buildings = [
      OH_BUILDINGS.place('healer', 3, 3), OH_BUILDINGS.place('shop', 3, 7),
      OH_BUILDINGS.place('portal', 34, 20),
    ].filter(Boolean);
    const mobs = [
      { col: 20, row: 18, type: 'zombie', hp: 8, speed: 1.4, detect: 180 },
      { col: 26, row: 8, type: 'spider', hp: 6, speed: 2.0, detect: 220 },
      { col: 32, row: 6, type: 'skeleton', hp: 6, speed: 1.6, detect: 210, ranged: true },
    ];
    const items = [
      { col: 9, row: 21, kind: 'coin', itemKey: 'coin' },
      { col: 6, row: 12, kind: 'weapon', weapon: 'boomerang', itemKey: 'boomerang' },
      { col: 12, row: 22, kind: 'weapon', weapon: 'trident', itemKey: 'trident' },
      { col: 30, row: 14, kind: 'weapon', weapon: 'crossbow', itemKey: 'crossbow' },
    ];
    return {
      name: 'Overhead Demo', mode: 'platformer', viewMode: 'overhead',
      controlScheme: 'free-aim', angleLockDeg: 0, rules: { autoClimb: '1' }, showHiddenIndicator: false,
      mapSnapshot: { gridW: W, gridH: H, density, baseW, baseH, cell, objectScaleMode: 'independent', ground, elevation, decorations: [] },
      buildings, mobs, items, spawns: [{ col: 2, row: H - 3 }], goal: { col: W - 3, row: 3 },
    };
  }

  const OVERHEAD = {
    launchDemo() {
      if (typeof OverheadGame === 'undefined') { alert('Overhead Engine not loaded.'); return; }
      if (window.menu && typeof window.menu._stop === 'function') window.menu._stop();
      if (window.game && typeof window.game.destroy === 'function') window.game.destroy();
      ['dashboard-screen', 'sandbox-screen', 'campaign-select-screen', 'game-selection-screen', 'arena-select-screen'].forEach((id) => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
      window.game = new OverheadGame(buildDemoWorld(), {}, () => this._return());
    },
    launchWorld(world, opts, onExit) {
      if (window.game && typeof window.game.destroy === 'function') window.game.destroy();
      window.game = new OverheadGame(world, opts || {}, onExit || (() => this._return()));
      return window.game;
    },
    _return() {
      try { if (window.game && window.game.destroy) window.game.destroy(); } catch (e) {}
      window.game = null;
      const d = document.getElementById('dashboard-screen'); if (d) d.style.display = 'block';
    },
    buildDemoWorld,

    // ── Shared top-down tile renderer (subtle shading, no art assets) ──────────
    drawTerrainTile(ctx, key, x, y, cs, elev) {
      const base = P().terrainColor(key);
      let col = base;
      if (elev > 0) col = _lighten(base, Math.min(0.34, elev * 0.11));   // higher = lighter (reads as "up")
      ctx.fillStyle = col; ctx.fillRect(x, y, cs + 1, cs + 1);
      // Cheap top-down texture per family.
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, cs, cs); ctx.clip();
      if (key === 'grass' || key === 'leaves' || key === 'bush') { ctx.fillStyle = 'rgba(0,0,0,.10)'; for (let i = 0; i < 3; i++) ctx.fillRect(x + (i * 11 % cs), y + (i * 7 % cs), cs * 0.12, cs * 0.12); }
      else if (key === 'lava') { ctx.fillStyle = 'rgba(255,220,80,.5)'; ctx.fillRect(x + cs * 0.2, y + cs * 0.3, cs * 0.25, cs * 0.18); ctx.fillRect(x + cs * 0.55, y + cs * 0.6, cs * 0.2, cs * 0.14); }
      else if (key === 'stone' || key === 'deepslate' || key === 'gravel' || key === 'bedrock') { ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1; ctx.strokeRect(x + cs * 0.15, y + cs * 0.15, cs * 0.5, cs * 0.5); }
      else if (key === 'ice') { ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.moveTo(x, y + cs * 0.3); ctx.lineTo(x + cs * 0.4, y); ctx.stroke(); }
      else if (key === 'coal' || key === 'iron' || key === 'gold' || key === 'diamond') { ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.beginPath(); ctx.arc(x + cs * 0.5, y + cs * 0.5, cs * 0.16, 0, 7); ctx.fill(); }
      else if (key === 'log' || key === 'planks') { ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.moveTo(x, y + cs * 0.5); ctx.lineTo(x + cs, y + cs * 0.5); ctx.stroke(); }
      ctx.restore();
      // Cliff face on the south drop is drawn by the runtime (needs neighbour elev).
      ctx.strokeStyle = 'rgba(0,0,0,.16)'; ctx.strokeRect(x, y, cs, cs);
    },

    // ── Shared overhead player sprite (Kevin's spec; colours via OH_SPRITE) ─────
    // Square head (hair colour). Body slightly narrower with shoulders flanking the
    // head (shirt). Feet poke out. When moving: offset angled-rectangle arms (right
    // forward / left back) + legs in front and behind, stride GROUNDED to travel
    // distance (no moonwalk). Slight shading on hands/feet.
    // NOTE: 2D (side-view) rendering should eventually consume this same OH_SPRITE.
    drawOverheadPlayer(ctx, cx, cy, r, dist, moving, aimAngle, opts) {
      opts = opts || {};
      const S = window.OH_SPRITE;
      const ph = (dist / (r * 1.15)) % (Math.PI * 2);       // stride tied to distance
      const swing = moving ? Math.sin(ph) : 0;              // right-arm phase
      const legF = moving ? Math.sin(ph) * r * 0.55 : 0;    // leg swing (grounded to distance)
      const legB = moving ? Math.sin(ph + Math.PI) * r * 0.55 : 0;
      ctx.save(); ctx.translate(cx, cy);
      // Face the aim (subtle whole-body rotation so limbs read directionally).
      if (opts.rotate !== false && aimAngle != null) ctx.rotate(aimAngle + Math.PI / 2);
      const headR = r * 0.7, shoulderW = r * 1.15, shoulderH = r * 0.5;
      // LEGS — one in front, one behind the head (drawn first = behind torso).
      ctx.fillStyle = S.pants;
      ctx.fillRect(-r * 0.28, -r * 0.1 + legB, r * 0.24, r * 0.5);   // back leg
      ctx.fillRect(r * 0.04, -r * 0.1 + legF, r * 0.24, r * 0.5);    // front leg
      // FEET (skin-shaded tips).
      ctx.fillStyle = _shade(S.pants, 0.25);
      ctx.fillRect(-r * 0.28, -r * 0.1 + legB + r * 0.5, r * 0.24, r * 0.14);
      ctx.fillRect(r * 0.04, -r * 0.1 + legF + r * 0.5, r * 0.24, r * 0.14);
      // ARMS — angled rectangles, offset (right forward, left back) for depth.
      const armLen = r * 0.7, armW = r * 0.22;
      const drawArm = (sideX, fwd) => {
        ctx.save(); ctx.translate(sideX, 0); ctx.rotate(fwd * 0.5);
        ctx.fillStyle = S.shirt; ctx.fillRect(-armW / 2, -armLen * 0.15, armW, armLen);
        ctx.fillStyle = _shade(S.skin, 0); ctx.fillRect(-armW / 2, armLen * 0.72, armW, armW);   // hand
        ctx.restore();
      };
      drawArm(-shoulderW / 2, moving ? -swing : 0.2);   // left arm (back on swing)
      drawArm(shoulderW / 2, moving ? swing : 0.2);     // right arm (forward on swing)
      // SHOULDERS / body (shirt) — narrower than the head, flanking it.
      ctx.fillStyle = S.shirt; ctx.fillRect(-shoulderW / 2, -shoulderH / 2, shoulderW, shoulderH);
      // HEAD — square, hair colour, on top.
      ctx.fillStyle = S.hair; ctx.fillRect(-headR, -headR, headR * 2, headR * 2);
      ctx.fillStyle = 'rgba(255,255,255,.10)'; ctx.fillRect(-headR, -headR, headR * 2, headR * 0.4);  // slight top sheen
      ctx.restore();
    },
  };

  function _lighten(hex, amt) {
    const h = String(hex).replace('#', ''); if (h.length !== 6) return hex; const n = parseInt(h, 16);
    const r = Math.min(255, ((n >> 16) & 255) + amt * 255), gg = Math.min(255, ((n >> 8) & 255) + amt * 255), b = Math.min(255, (n & 255) + amt * 255);
    return `rgb(${r | 0},${gg | 0},${b | 0})`;
  }
  function _shade(hex, amt) {
    const h = String(hex).replace('#', ''); if (h.length !== 6) return hex; const n = parseInt(h, 16);
    const f = 1 - amt;
    return `rgb(${(((n >> 16) & 255) * f) | 0},${(((n >> 8) & 255) * f) | 0},${((n & 255) * f) | 0})`;
  }

  if (typeof window !== 'undefined') window.OVERHEAD = OVERHEAD;
})();
