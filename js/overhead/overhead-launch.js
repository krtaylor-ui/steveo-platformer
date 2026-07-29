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

    // ── Shared top-down tile TOP face (shading + bevel + per-family texture) ────
    drawTerrainTile(ctx, key, x, y, cs, elev) {
      const base = P().terrainColor(key);
      let col = base;
      if (elev > 0) col = _lighten(base, Math.min(0.34, elev * 0.11));   // higher = lighter (reads as "up")
      ctx.fillStyle = col; ctx.fillRect(x, y, cs + 1, cs + 1);
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, cs, cs); ctx.clip();
      if (key === 'grass' || key === 'leaves' || key === 'bush') { ctx.fillStyle = 'rgba(0,0,0,.10)'; for (let i = 0; i < 3; i++) ctx.fillRect(x + (i * 11 % cs), y + (i * 7 % cs), cs * 0.12, cs * 0.12); }
      else if (key === 'lava') { ctx.fillStyle = 'rgba(255,220,80,.5)'; ctx.fillRect(x + cs * 0.2, y + cs * 0.3, cs * 0.25, cs * 0.18); ctx.fillRect(x + cs * 0.55, y + cs * 0.6, cs * 0.2, cs * 0.14); }
      else if (key === 'stone' || key === 'deepslate' || key === 'gravel' || key === 'bedrock') { ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1; ctx.strokeRect(x + cs * 0.15, y + cs * 0.15, cs * 0.5, cs * 0.5); }
      else if (key === 'ice') { ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.moveTo(x, y + cs * 0.3); ctx.lineTo(x + cs * 0.4, y); ctx.stroke(); }
      else if (key === 'coal' || key === 'iron' || key === 'gold' || key === 'diamond') { ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.beginPath(); ctx.arc(x + cs * 0.5, y + cs * 0.5, cs * 0.16, 0, 7); ctx.fill(); }
      else if (key === 'log' || key === 'planks') { ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.moveTo(x, y + cs * 0.5); ctx.lineTo(x + cs, y + cs * 0.5); ctx.stroke(); }
      // Bevel (top-light / bottom-shadow) — the depth cue Kevin liked.
      const bev = ctx.createLinearGradient(x, y, x, y + cs);
      bev.addColorStop(0, 'rgba(255,255,255,.14)'); bev.addColorStop(0.5, 'rgba(255,255,255,0)'); bev.addColorStop(1, 'rgba(0,0,0,.16)');
      ctx.fillStyle = bev; ctx.fillRect(x, y, cs, cs);
      ctx.restore();
      ctx.strokeStyle = 'rgba(0,0,0,.16)'; ctx.strokeRect(x, y, cs, cs);
    },

    // ── 3D-extruded SIDE (front) face — a darker shade of the top colour (§).
    // Drawn BELOW the top; whatever block sits in FRONT (next row, drawn later)
    // covers it, so only front/edge blocks — and the exposed drop of a raised
    // block down to the block in front — show a side. `depth` px tall.
    drawTerrainSide(ctx, key, x, topBottomY, cs, depth, elev) {
      if (depth <= 0) return;
      const base = P().terrainColor(key);
      const top = elev > 0 ? _lighten(base, Math.min(0.34, elev * 0.11)) : base;
      ctx.fillStyle = _shade(top, 0.34);
      ctx.fillRect(x, topBottomY, cs + 1, depth + 1);
      ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.strokeRect(x, topBottomY, cs, depth);
    },

    // ── A small held weapon, drawn in LOCAL space pointing +x (forward). ────────
    drawWeapon(ctx, r, kind) {
      const S = window.OH_SPRITE; ctx.save();
      if (kind === 'sword') { ctx.strokeStyle = '#c9ccd6'; ctx.lineWidth = r * 0.16; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r * 1.5, 0); ctx.stroke(); ctx.strokeStyle = '#7a5a2a'; ctx.lineWidth = r * 0.14; ctx.beginPath(); ctx.moveTo(0, -r * 0.22); ctx.lineTo(0, r * 0.22); ctx.stroke(); }
      else if (kind === 'bow') { ctx.strokeStyle = '#8a5a2a'; ctx.lineWidth = r * 0.14; ctx.beginPath(); ctx.arc(r * 0.5, 0, r * 0.7, -1.4, 1.4); ctx.stroke(); ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(r * 0.5 + Math.cos(-1.4) * r * 0.7, Math.sin(-1.4) * r * 0.7); ctx.lineTo(r * 0.5 + Math.cos(1.4) * r * 0.7, Math.sin(1.4) * r * 0.7); ctx.stroke(); }
      else if (kind === 'trident') { ctx.strokeStyle = '#5fb6c6'; ctx.lineWidth = r * 0.14; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r * 1.5, 0); ctx.stroke(); for (const dy of [-0.28, 0, 0.28]) { ctx.beginPath(); ctx.moveTo(r * 1.2, dy * r); ctx.lineTo(r * 1.7, dy * r); ctx.stroke(); } }
      else if (kind === 'boomerang') { ctx.strokeStyle = '#c9924a'; ctx.lineWidth = r * 0.2; ctx.beginPath(); ctx.moveTo(r * 0.6, -r * 0.5); ctx.lineTo(r * 1.1, 0); ctx.lineTo(r * 0.6, r * 0.5); ctx.stroke(); }
      else { /* pickaxe (default) */ ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = r * 0.16; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r * 1.3, 0); ctx.stroke(); ctx.strokeStyle = '#9aa0aa'; ctx.lineWidth = r * 0.15; ctx.beginPath(); ctx.moveTo(r * 1.0, -r * 0.42); ctx.quadraticCurveTo(r * 1.3, 0, r * 1.0, r * 0.42); ctx.stroke(); }
      ctx.restore();
    },

    // ── Overhead player/humanoid sprite (Kevin's revised spec). Local +x = forward
    // (aim). Smaller head; shoulders flank it along ±y; ARMS and LEGS swing FORE/AFT
    // (±x) in opposite phase (natural gait); a weapon is always held, pointing +x
    // (default pickaxe). Colours from a palette (default OH_SPRITE) so they stay
    // user-configurable — the 2D renderer should eventually share OH_SPRITE too.
    drawOverheadPlayer(ctx, cx, cy, r, dist, moving, aimAngle, opts) {
      opts = opts || {};
      const S = opts.palette || window.OH_SPRITE;
      const weapon = opts.weapon === undefined ? 'pickaxe' : opts.weapon;
      const ph = (dist / (r * 1.15)) % (Math.PI * 2);
      const swing = moving ? Math.sin(ph) : 0;              // +1 = this side forward
      ctx.save(); ctx.translate(cx, cy);
      if (opts.rotate !== false && aimAngle != null) ctx.rotate(aimAngle);   // local +x = forward
      const headR = r * 0.5;                                 // SMALLER head (was 0.7)
      const shoulderSpan = r * 1.5, shoulderW = r * 0.34;    // shoulders flank ±y
      const armAmp = r * 0.6, legAmp = r * 0.5, limbW = opts.bony ? r * 0.14 : r * 0.22;
      // For each side (±y): arm swings +/- along x, leg swings OPPOSITE.
      for (const sy of [-1, 1]) {
        const armX = moving ? swing * sy * armAmp : r * 0.15;
        const legX = moving ? -swing * sy * legAmp : -r * 0.15;
        const yBase = sy * (shoulderSpan / 2);
        // LEG (pants) behind the torso.
        ctx.fillStyle = S.pants; ctx.fillRect(legX - limbW / 2, sy > 0 ? yBase - limbW : yBase, limbW, limbW * (opts.bony ? 1.4 : 1.2) + Math.abs(legX) * 0.2);
        ctx.fillStyle = _shade(S.pants, 0.25); ctx.fillRect(legX - limbW / 2, yBase - (sy < 0 ? limbW * 0.5 : 0), limbW, limbW * 0.5);   // foot
        // ARM (shirt) + hand.
        ctx.fillStyle = S.shirt; ctx.fillRect(armX - limbW / 2, yBase - limbW * 0.5, limbW, limbW + Math.abs(armX) * 0.2);
        ctx.fillStyle = S.skin; ctx.fillRect(armX - limbW / 2, yBase + (sy > 0 ? limbW * 0.5 : -limbW), limbW, limbW * 0.7);   // hand
      }
      // SHOULDERS (shirt) — a bar across ±y flanking the head. Bony = a thin neck
      // to a parallel bone (skeleton).
      if (opts.bony) {
        ctx.fillStyle = S.shirt; ctx.fillRect(-r * 0.08, -shoulderSpan / 2, r * 0.16, shoulderSpan);           // parallel bone
        ctx.fillRect(-r * 0.28, -r * 0.06, r * 0.5, r * 0.12);                                                 // spine/neck connector
      } else {
        ctx.fillStyle = S.shirt; ctx.fillRect(-shoulderW / 2, -shoulderSpan / 2, shoulderW, shoulderSpan);
      }
      // HEAD — square, smaller, on top.
      ctx.fillStyle = S.hair; ctx.fillRect(-headR, -headR, headR * 2, headR * 2);
      if (opts.eyeSockets) { ctx.fillStyle = '#222'; ctx.fillRect(headR - headR * 0.5, -headR * 0.55, headR * 0.34, headR * 0.34); ctx.fillRect(headR - headR * 0.5, headR * 0.2, headR * 0.34, headR * 0.34); }
      else { ctx.fillStyle = 'rgba(255,255,255,.10)'; ctx.fillRect(-headR, -headR, headR * 2, headR * 0.4); }
      // WEAPON — held forward (skip for e.g. bare-handed zombies via weapon:null).
      if (weapon) { ctx.save(); ctx.translate(headR * 0.6, r * 0.5); this.drawWeapon(ctx, r, weapon); ctx.restore(); }
      ctx.restore();
    },

    // ── Mob dispatch (zombie = green humanoid; skeleton = bony; spider = custom).
    drawOverheadMob(ctx, cx, cy, r, dist, moving, aimAngle, type) {
      if (type === 'spider') return this._drawSpider(ctx, cx, cy, r, aimAngle);
      if (type === 'skeleton') {
        return this.drawOverheadPlayer(ctx, cx, cy, r, dist, moving, aimAngle,
          { palette: { hair: '#e8e6dc', shirt: '#d8d4c6', pants: '#cfcabc', skin: '#efeee6' }, weapon: 'bow', bony: true, eyeSockets: true });
      }
      // zombie — the player body, green skin (§ "same as player but green skin").
      return this.drawOverheadPlayer(ctx, cx, cy, r, dist, moving, aimAngle,
        { palette: { hair: '#4a7a34', shirt: '#3f5a34', pants: '#33472a', skin: '#5c9a44' }, weapon: null });
    },
    _drawSpider(ctx, cx, cy, r, aimAngle) {
      ctx.save(); ctx.translate(cx, cy); if (aimAngle != null) ctx.rotate(aimAngle);
      const body = r * 0.9, legLen = r * 0.85, legW = Math.max(1.5, r * 0.12);
      ctx.strokeStyle = '#241f2a'; ctx.lineWidth = legW;
      for (let i = 0; i < 4; i++) { const ly = (-1.1 + i * 0.7) * body * 0.5;   // 4 legs per side
        ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(legLen, ly - body * 0.15); ctx.stroke();     // right
        ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(-legLen, ly - body * 0.15); ctx.stroke(); }  // left
      ctx.fillStyle = window.OH_PALETTE ? window.OH_PALETTE.OH_MOB_BY_KEY.spider.color : '#3a3340';
      ctx.fillRect(-body / 2, -body / 2, body, body);                        // square body
      ctx.fillStyle = _shade('#3a3340', -0.2); ctx.fillRect(-body / 2, -body / 2, body, body * 0.3);
      ctx.fillStyle = '#e33'; const d = body * 0.16;                         // red dots on the FRONT edge (+x)
      ctx.fillRect(body / 2 - d * 1.4, -body * 0.28, d, d); ctx.fillRect(body / 2 - d * 1.4, body * 0.12, d, d);
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
