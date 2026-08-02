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
      { col: 20, row: 18, type: 'zombie' },
      { col: 26, row: 8, type: 'spider' },
      { col: 32, row: 6, type: 'skeleton' },
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
      settings: (typeof OH_SETTINGS !== 'undefined') ? OH_SETTINGS.defaults() : {},
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

    // ── Shared top-down tile TOP face (bevel + per-family texture) ──────────────
    // Tops are the SAME colour at every elevation (§ Kevin) — depth reads only from
    // the darker extruded SIDE. `elev` kept in the signature for callers.
    drawTerrainTile(ctx, key, x, y, cs, elev) {
      const col = P().terrainColor(key);
      ctx.fillStyle = col; ctx.fillRect(x, y, cs + 1, cs + 1);
      // PERF: below ~13px (dense grids / zoomed out) skip the clip + per-family
      // texture + bevel gradient — they're invisible at that size and 16× the work
      // at density 4. Just the flat fill + a hairline edge.
      if (cs < 13) { ctx.strokeStyle = 'rgba(0,0,0,.14)'; ctx.strokeRect(x, y, cs, cs); return; }
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

    // Elevation heat-map colour: dark purple (low) → light pink (high).
    elevMapColor(level, maxLevel) {
      const t = maxLevel > 0 ? Math.min(1, Math.max(0, level / maxLevel)) : 0;
      const lo = [42, 20, 58], hi = [245, 196, 224];   // #2a143a → #f5c4e0
      return `rgb(${(lo[0] + (hi[0] - lo[0]) * t) | 0},${(lo[1] + (hi[1] - lo[1]) * t) | 0},${(lo[2] + (hi[2] - lo[2]) * t) | 0})`;
    },
    // Elevation offset per level, in px (up AND left) — the diagonal "stacked cube"
    // shift. Kept here so terrain + entities agree. `_elevScale` (set by the game/editor
    // from the world's PLAYER HEIGHT) shrinks each level so a taller player spans more
    // levels: player height 2 → a level renders at 1/2 the height, etc. Default 1.
    _elevScale: 1,
    elevOffset(cs) { return cs * 0.22 * (this._elevScale || 1); },
    // A stacked-cube tile: top shifted up-left by elev×Q, with darker SOUTH + EAST
    // faces exposed toward lower/absent neighbours (east darkest). fx,fy = the
    // FOOTPRINT (elev-0) top-left. Draw cells back→front (by r+c then elev).
    drawTerrainCube(ctx, key, fx, fy, cs, elev, exposeS, exposeE) {
      const Q = this.elevOffset(cs), base = P().terrainColor(key);
      const tx = fx - elev * Q, ty = fy - elev * Q;   // shifted top
      // LEAVES are a FLOATING canopy: a 1-level-tall cube at their elevation (so
      // they have height + a visible gap below), NOT a full column to the ground.
      if (key === 'leaves') {
        if (elev > 0) {
          ctx.fillStyle = _shade(base, 0.4); ctx.beginPath(); ctx.moveTo(tx, ty + cs); ctx.lineTo(tx + cs, ty + cs); ctx.lineTo(tx + cs + Q, ty + cs + Q); ctx.lineTo(tx + Q, ty + cs + Q); ctx.closePath(); ctx.fill();   // south face (1 level)
          ctx.fillStyle = _shade(base, 0.55); ctx.beginPath(); ctx.moveTo(tx + cs, ty); ctx.lineTo(tx + cs, ty + cs); ctx.lineTo(tx + cs + Q, ty + cs + Q); ctx.lineTo(tx + cs + Q, ty + Q); ctx.closePath(); ctx.fill();   // east face (1 level)
        }
        this.drawTerrainTile(ctx, key, tx, ty, cs, elev);
        return;
      }
      if (elev > 0) {
        if (exposeS) { ctx.fillStyle = _shade(base, 0.4); ctx.beginPath(); ctx.moveTo(tx, ty + cs); ctx.lineTo(tx + cs, ty + cs); ctx.lineTo(fx + cs, fy + cs); ctx.lineTo(fx, fy + cs); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 1; for (let i = 1; i <= elev; i++) { const yy = ty + cs + (fy + cs - (ty + cs)) * (i / elev); const xx = tx + (fx - tx) * (i / elev); ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + cs, yy); ctx.stroke(); } }
        if (exposeE) { ctx.fillStyle = _shade(base, 0.55); ctx.beginPath(); ctx.moveTo(tx + cs, ty); ctx.lineTo(tx + cs, ty + cs); ctx.lineTo(fx + cs, fy + cs); ctx.lineTo(fx + cs, fy); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,.3)'; for (let i = 1; i <= elev; i++) { const xx = tx + cs + (fx + cs - (tx + cs)) * (i / elev); const yy = ty + (fy - ty) * (i / elev); ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx, yy + cs); ctx.stroke(); } }
      }
      this.drawTerrainTile(ctx, key, tx, ty, cs, elev);
      // GLASS reads as a bright, glossy pane: a translucent white wash + a diagonal
      // highlight streak + a light rim on the top face.
      if (key === 'glass') {
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(tx, ty, cs, cs);
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = Math.max(1, cs * 0.05); ctx.strokeRect(tx + cs * 0.08, ty + cs * 0.08, cs * 0.84, cs * 0.84);
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = Math.max(1, cs * 0.06);
        ctx.beginPath(); ctx.moveTo(tx + cs * 0.18, ty + cs * 0.62); ctx.lineTo(tx + cs * 0.6, ty + cs * 0.2); ctx.stroke();
        ctx.restore();
      }
    },

    // ── 3D-extruded SIDE (front) face — noticeably darker than the top (§).
    // Drawn BELOW the top; the block in FRONT (next row, drawn later) covers it,
    // so only front/edge blocks and the drop of a raised block show a side. Each
    // elevation LEVEL is one `levels` segment tall; a divider line separates them
    // so a 2-level cliff reads as two steps.
    drawTerrainSide(ctx, key, x, topBottomY, cs, depth, levels) {
      if (depth <= 0) return;
      // The side is a DIAGONAL parallelogram (slants right as it drops), so cliffs
      // read as diagonal shadows — an easier elevation cue than a flat front (§).
      const skew = depth * 0.5;
      ctx.fillStyle = _shade(P().terrainColor(key), 0.45);   // noticeably darker
      ctx.beginPath();
      ctx.moveTo(x, topBottomY); ctx.lineTo(x + cs, topBottomY);
      ctx.lineTo(x + cs + skew, topBottomY + depth); ctx.lineTo(x + skew, topBottomY + depth);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1; ctx.stroke();
      // Divider lines between stacked elevation levels (also slanted).
      const n = Math.max(1, levels | 0);
      if (n > 1) { const seg = depth / n, sseg = skew / n; for (let i = 1; i < n; i++) { const ly = topBottomY + seg * i, lx = x + sseg * i; ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + cs, ly); ctx.stroke(); } }
    },

    // ── Shared building models (default skins). x,y = top-left screen px of the
    // footprint; w,h = its px size; detail 0..1 (from density/zoom) adds trim; skin
    // selects a variant (only 'default' shipped — the skin builder is roadmapped).
    // Distinct silhouette per type so they read at a glance.
    drawBuilding(ctx, typeId, x, y, w, h, detail, skin) {
      const cx = x + w / 2, cy = y + h / 2, min = Math.min(w, h);
      const rr = (c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
      const outline = () => { ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1); };
      ctx.save();
      switch (typeId) {
        case 'portal': {
          // A STANDING 4-wide × 5-tall obsidian frame, rising UP from the footprint
          // base (footprint is 4×1) so it reads as a vertical portal covering ~5
          // elevation levels, purple glowing centre. Each block is a little cube.
          const cols = 4, rows = 5, bw = w / cols, bh = Math.max(6, bw * 0.72), lean = bw * 0.14;
          const baseY = y + h;   // bottom edge of the footprint
          const blk = (bx, by, top, glow) => {
            ctx.fillStyle = _shade(top, 0.5); ctx.fillRect(bx, by, bw + 1, bh + 1);                 // block body (slightly dark)
            ctx.fillStyle = top; ctx.fillRect(bx, by, bw + 1, bh * 0.66);                            // lit top portion
            if (glow) { ctx.fillStyle = 'rgba(210,150,255,.55)'; ctx.fillRect(bx + bw * 0.15, by + bh * 0.1, bw * 0.7, bh * 0.8); }
            ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.strokeRect(bx + 0.5, by + 0.5, bw, bh);
          };
          for (let L = 0; L < rows; L++) {                 // L=0 bottom row, rises upward
            const ry = baseY - (L + 1) * bh, lx = -L * lean;
            for (let c = 0; c < cols; c++) {
              const frame = (L === 0 || L === rows - 1 || c === 0 || c === cols - 1);
              blk(x + c * bw + lx, ry, frame ? '#2a2036' : '#7b3fce', !frame);
            }
          }
          break; }
        case 'pipe': {
          // Green pipe seen from above with visible cube edges (darker S+E faces).
          const q = min * 0.16;
          ctx.fillStyle = _shade('#2f8f52', 0.4); ctx.fillRect(x, y + h - q, w, q); ctx.fillRect(x + w - q, y, q, h);   // S + E edges
          ctx.fillStyle = '#2f8f52'; ctx.fillRect(x, y, w - q, h - q);
          ctx.fillStyle = '#57c07d'; ctx.fillRect(x, y, w - q, (h - q) * 0.3);                                          // rim highlight
          ctx.fillStyle = '#0c2415'; ctx.beginPath(); ctx.arc(x + (w - q) / 2, y + (h - q) / 2, Math.min(w, h) * 0.24, 0, 7); ctx.fill();   // opening
          ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
          break; }
        case 'healer': {
          // White hospital block: roof, red cross, entrance — reads as a hospital.
          rr('#eef2f5'); ctx.fillStyle = '#d3dbe1'; ctx.fillRect(x, y, w, h * 0.16);                  // roof trim
          ctx.strokeStyle = '#b9c4cc'; ctx.lineWidth = 1; ctx.strokeRect(x + w * 0.12, y + h * 0.12, w * 0.76, h * 0.76);   // inner ledge
          ctx.fillStyle = '#c0392b'; const t = min * 0.14; ctx.fillRect(cx - t / 2, cy - t * 1.7, t, t * 3.4); ctx.fillRect(cx - t * 1.7, cy - t / 2, t * 3.4, t);   // red cross
          ctx.fillStyle = '#9fb0bd'; ctx.fillRect(cx - w * 0.1, y + h - h * 0.16, w * 0.2, h * 0.16);  // entrance
          outline(); break; }
        case 'shop': {
          // Tan building + a sign board with a $ insignia + an awning.
          rr('#c9a25a');
          const n = 5; for (let i = 0; i < n; i++) { ctx.fillStyle = i % 2 ? '#d9534f' : '#f5f0e6'; ctx.fillRect(x + (w / n) * i, y + h * 0.72, w / n, h * 0.12); }   // awning (bottom)
          ctx.fillStyle = '#5a3a1a'; ctx.fillRect(cx - w * 0.22, y + h * 0.2, w * 0.44, h * 0.28);     // sign board
          ctx.fillStyle = '#ffd24a'; ctx.font = `bold ${(min * 0.3) | 0}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('$', cx, y + h * 0.34); ctx.textBaseline = 'alphabetic';
          outline(); break; }
        case 'savepoint': {
          ctx.fillStyle = '#274a5a'; ctx.fillRect(cx - min * 0.06, y + h * 0.15, min * 0.12, h * 0.8);   // pole
          ctx.fillStyle = '#4fc3f7'; ctx.beginPath(); ctx.moveTo(cx + min * 0.06, y + h * 0.18); ctx.lineTo(cx + w * 0.42, y + h * 0.3); ctx.lineTo(cx + min * 0.06, y + h * 0.44); ctx.closePath(); ctx.fill();   // flag
          break; }
        case 'spawner': {
          rr('#3a2430'); ctx.strokeStyle = '#8a3f3f'; ctx.lineWidth = Math.max(1, min * 0.05);
          for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x + (w / 4) * i, y); ctx.lineTo(x + (w / 4) * i, y + h); ctx.stroke(); }   // cage bars
          ctx.fillStyle = 'rgba(255,120,80,.6)'; ctx.beginPath(); ctx.arc(cx, cy, min * 0.22, 0, 7); ctx.fill();   // glow
          outline(); break; }
        case 'tower': {
          ctx.fillStyle = '#6a6a80'; ctx.beginPath(); ctx.arc(cx, cy, min * 0.42, 0, 7); ctx.fill();
          ctx.fillStyle = '#4a4a5c'; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; ctx.fillRect(cx + Math.cos(a) * min * 0.4 - min * 0.06, cy + Math.sin(a) * min * 0.4 - min * 0.06, min * 0.12, min * 0.12); }   // crenellations
          ctx.fillStyle = '#2a2a38'; ctx.beginPath(); ctx.arc(cx, cy, min * 0.16, 0, 7); ctx.fill();
          break; }
        case 'statue': {
          // A grey, unmoving top-down version of the character sprite (action pose),
          // scaled down, on a stone pedestal.
          ctx.fillStyle = '#7d7d85'; ctx.beginPath(); ctx.ellipse(cx, cy + h * 0.02, w * 0.34, h * 0.3, 0, 0, 7); ctx.fill();   // pedestal
          ctx.strokeStyle = '#5f5f66'; ctx.lineWidth = 1; ctx.stroke();
          this.drawOverheadPlayer(ctx, cx, cy - h * 0.04, min * 0.3, 0, false, -Math.PI / 4,
            { palette: { hair: '#9a9aa2', shirt: '#8f8f97', pants: '#7a7a82', skin: '#a6a6ae' }, weapon: 'sword', rotate: true });
          break; }
        case 'core': {
          // Tower-Defense CORE = a castle from above: stone wall + courtyard + 4
          // corner turrets + a central keep with a banner.
          rr('#8a8f99');
          ctx.fillStyle = '#6f747d'; ctx.fillRect(x + w * 0.14, y + h * 0.14, w * 0.72, h * 0.72);      // courtyard
          ctx.fillStyle = '#7a7f88'; ctx.fillRect(cx - w * 0.17, cy - h * 0.17, w * 0.34, h * 0.34);    // keep
          const tr = min * 0.15; ctx.fillStyle = '#9aa0aa'; ctx.strokeStyle = '#565b63'; ctx.lineWidth = 2;
          for (const [px, py] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) { ctx.beginPath(); ctx.arc(px, py, tr, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#4a4e56'; ctx.beginPath(); ctx.arc(px, py, tr * 0.45, 0, 7); ctx.fill(); ctx.fillStyle = '#9aa0aa'; }   // turrets w/ tops
          ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.moveTo(cx, cy - h * 0.1); ctx.lineTo(cx + w * 0.08, cy - h * 0.04); ctx.lineTo(cx, cy + h * 0.02); ctx.closePath(); ctx.fill();   // banner
          outline(); break; }
        case 'nexus': {
          // MOBA NEXUS = a floating crystal cluster.
          rr('#16233a');
          const g = ctx.createRadialGradient(cx, cy, min * 0.08, cx, cy, min * 0.46); g.addColorStop(0, '#bfe6ff'); g.addColorStop(1, '#3f6dc0');
          ctx.fillStyle = g; ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 - Math.PI / 2; const px = cx + Math.cos(a) * min * 0.4, py = cy + Math.sin(a) * min * 0.4; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = Math.max(1, min * 0.03); ctx.stroke();
          ctx.fillStyle = '#8fd0ff'; for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; const px = cx + Math.cos(a) * min * 0.42, py = cy + Math.sin(a) * min * 0.42; ctx.beginPath(); ctx.moveTo(px, py - min * 0.1); ctx.lineTo(px + min * 0.07, py); ctx.lineTo(px, py + min * 0.1); ctx.lineTo(px - min * 0.07, py); ctx.closePath(); ctx.fill(); }   // orbiting shards
          break; }
        default: rr('#8a7fb0'); outline();
      }
      if (typeId !== 'core' && typeId !== 'nexus' && typeId !== 'tower' && typeId !== 'portal' && typeId !== 'pipe' && typeId !== 'statue') outline();
      ctx.restore();
    },

    // Placed items rendered as the actual item (weapon shape / coin), sized to the
    // player (pass a player-scaled size, not a map-cell size).
    drawItemSprite(ctx, itemKey, cx, cy, size) {
      if (itemKey === 'coin' || !itemKey) { ctx.fillStyle = '#ffd94a'; ctx.beginPath(); ctx.arc(cx, cy, size * 0.32, 0, 7); ctx.fill(); ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(cx - size * 0.1, cy - size * 0.1, size * 0.08, 0, 7); ctx.fill(); return; }
      const it = window.OH_PALETTE && window.OH_PALETTE.OH_ITEM_BY_KEY[itemKey];
      if (it && it.kind === 'key') { const col = it.color; ctx.save(); ctx.translate(cx, cy);
        if (itemKey.indexOf('jewel') === 0) { ctx.fillStyle = col; ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1; const s = size * 0.28; ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s, -s * 0.2); ctx.lineTo(s * 0.5, s); ctx.lineTo(-s * 0.5, s); ctx.lineTo(-s, -s * 0.2); ctx.closePath(); ctx.fill(); ctx.stroke(); }
        else if (itemKey === 'passcard') { ctx.fillStyle = col; ctx.fillRect(-size * 0.28, -size * 0.18, size * 0.56, size * 0.36); ctx.fillStyle = '#3a4050'; ctx.fillRect(-size * 0.22, -size * 0.1, size * 0.28, size * 0.08); }
        else { ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, size * 0.12); ctx.beginPath(); ctx.arc(-size * 0.12, 0, size * 0.16, 0, 7); ctx.moveTo(size * 0.02, 0); ctx.lineTo(size * 0.32, 0); ctx.moveTo(size * 0.32, 0); ctx.lineTo(size * 0.32, size * 0.14); ctx.moveTo(size * 0.22, 0); ctx.lineTo(size * 0.22, size * 0.12); ctx.stroke(); }
        ctx.restore(); return;
      }
      const wk = itemKey === 'crossbow' ? 'bow' : itemKey;   // reuse the held-weapon shapes
      ctx.save(); ctx.translate(cx - size * 0.45, cy); ctx.rotate(-0.35); this.drawWeapon(ctx, size * 0.62, wk); ctx.restore();
    },
    // Lock block: a padlock; open (green) when powered, closed (grey) otherwise.
    drawLock(ctx, x, y, cs, on) {
      ctx.fillStyle = on ? '#2f5a3a' : '#3a3f4a'; ctx.fillRect(x + cs * 0.12, y + cs * 0.12, cs * 0.76, cs * 0.76);
      ctx.strokeStyle = '#20242c'; ctx.lineWidth = 1.5; ctx.strokeRect(x + cs * 0.12, y + cs * 0.12, cs * 0.76, cs * 0.76);
      const cx = x + cs / 2, cy = y + cs * 0.52;
      ctx.strokeStyle = on ? '#7fe0a0' : '#c9ccd6'; ctx.lineWidth = Math.max(2, cs * 0.1);
      ctx.beginPath(); ctx.arc(cx, cy - cs * 0.14, cs * 0.16, on ? -2.6 : Math.PI, on ? 0.4 : 0); ctx.stroke();   // shackle (swung open when on)
      ctx.fillStyle = on ? '#ffe27a' : '#e6c14a'; ctx.fillRect(cx - cs * 0.16, cy - cs * 0.02, cs * 0.32, cs * 0.26);   // body
      ctx.fillStyle = '#20242c'; ctx.fillRect(cx - cs * 0.03, cy + cs * 0.06, cs * 0.06, cs * 0.1);   // keyhole
    },

    // Shared ramp/ladder icon, oriented up-slope toward `dir` ('E' default). A
    // directional wedge (peak = high side) with step lines so the slope reads.
    drawRampIcon(ctx, kind, cx, cy, s, dir) {
      const ang = { E: 0, S: Math.PI / 2, W: Math.PI, N: -Math.PI / 2 }[dir || 'E'];
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
      if (kind === 'ladder') { ctx.strokeStyle = '#c8a05a'; ctx.lineWidth = Math.max(1.5, s * 0.09); ctx.beginPath(); ctx.moveTo(-s * 0.4, -s * 0.22); ctx.lineTo(s * 0.4, -s * 0.22); ctx.moveTo(-s * 0.4, s * 0.22); ctx.lineTo(s * 0.4, s * 0.22); for (let i = -1; i <= 1; i++) { ctx.moveTo(i * s * 0.28, -s * 0.22); ctx.lineTo(i * s * 0.28, s * 0.22); } ctx.stroke(); }
      else {
        // 3D ramp: a sloped top surface rising toward +x (the high side), lifted
        // up-left (matching the cube offset), with a dark high-end face + step lines.
        // Right-triangle ramp: the 90° corner (vertical face) sits at the HIGH edge
        // (+x boundary), rising straight up by L; the hypotenuse slopes down to the
        // low edge (−x, ground). Fills the whole cell edge-to-edge.
        const ramp = '#b98a4a', L = s * 0.6, hc = s * 0.5;
        const lb = [-hc, -hc], lf = [-hc, hc], hf = [hc, hc - L], hb = [hc, -hc - L];
        ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(-hc, -hc, s, s);                                 // ground shadow (footprint)
        ctx.fillStyle = _shade(ramp, 0.5); ctx.beginPath(); ctx.moveTo(hb[0], hb[1]); ctx.lineTo(hf[0], hf[1]); ctx.lineTo(hc, hc); ctx.lineTo(hc, -hc); ctx.closePath(); ctx.fill();   // vertical high-end face (90° corner)
        ctx.fillStyle = ramp; ctx.beginPath(); ctx.moveTo(lb[0], lb[1]); ctx.lineTo(lf[0], lf[1]); ctx.lineTo(hf[0], hf[1]); ctx.lineTo(hb[0], hb[1]); ctx.closePath(); ctx.fill();   // sloped top (hypotenuse)
        ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 1; for (let i = 1; i <= 3; i++) { const t = i / 4; ctx.beginPath(); ctx.moveTo(lb[0] + (hb[0] - lb[0]) * t, lb[1] + (hb[1] - lb[1]) * t); ctx.lineTo(lf[0] + (hf[0] - lf[0]) * t, lf[1] + (hf[1] - lf[1]) * t); ctx.stroke(); }
      }
      ctx.restore();
    },
    // ── Bridge deck (§ Kevin). x,y = cell top-left screen px; cs = cell px. `edges`
    // = {n,e,s,w} true where there is NO adjacent bridge cell (draw a rail there when
    // railed). closed=false (open drawbridge) → a retracted/gap look. ─────────────
    drawBridgeCell(ctx, x, y, cs, opts) {
      opts = opts || {}; const rail = opts.rail, closed = opts.closed !== false, e = opts.edges || {};
      if (!closed) {   // open drawbridge: dashed void + retracted plank stubs
        ctx.save(); ctx.strokeStyle = 'rgba(150,110,60,.7)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 1, y + 1, cs - 2, cs - 2); ctx.setLineDash([]);
        ctx.fillStyle = '#7a5a2e'; if (e.w) ctx.fillRect(x, y + 2, cs * 0.18, cs - 4); if (e.e) ctx.fillRect(x + cs - cs * 0.18, y + 2, cs * 0.18, cs - 4);
        ctx.restore(); return;
      }
      // Plank deck.
      ctx.fillStyle = '#8a5f30'; ctx.fillRect(x, y, cs, cs);
      ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) { const px = x + (cs * i) / 4; ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y + cs); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.strokeRect(x + 0.5, y + 0.5, cs - 1, cs - 1);
      if (rail) {   // guardrails on the open (perimeter) edges
        ctx.strokeStyle = '#c9a45a'; ctx.lineWidth = Math.max(2, cs * 0.12);
        if (e.n) { ctx.beginPath(); ctx.moveTo(x, y + 1); ctx.lineTo(x + cs, y + 1); ctx.stroke(); }
        if (e.s) { ctx.beginPath(); ctx.moveTo(x, y + cs - 1); ctx.lineTo(x + cs, y + cs - 1); ctx.stroke(); }
        if (e.w) { ctx.beginPath(); ctx.moveTo(x + 1, y); ctx.lineTo(x + 1, y + cs); ctx.stroke(); }
        if (e.e) { ctx.beginPath(); ctx.moveTo(x + cs - 1, y); ctx.lineTo(x + cs - 1, y + cs); ctx.stroke(); }
      }
    },
    // Cells of a bridge SPAN from `a` to `b` (axis-aligned; snaps to the dominant
    // axis). Shared by runtime + editor. Back-compat: a per-cell bridge {col,row}
    // with no from/to is a 1-cell span.
    spanCells(a, b) {
      if (!a) return []; if (!b) b = a;
      const cells = [], dc = b.col - a.col, dr = b.row - a.row;
      if (Math.abs(dc) >= Math.abs(dr)) { const st = dc >= 0 ? 1 : -1; for (let c = a.col; c !== b.col + st; c += st) cells.push({ col: c, row: a.row }); }
      else { const st = dr >= 0 ? 1 : -1; for (let r = a.row; r !== b.row + st; r += st) cells.push({ col: a.col, row: r }); }
      if (!cells.length) cells.push({ col: a.col, row: a.row });
      return cells;
    },
    bridgeSpanCells(span) { return this.spanCells(span.from || { col: span.col, row: span.row }, span.to || span.from || { col: span.col, row: span.row }); },
    // Redstone bits (shared by runtime + editor).
    drawLever(ctx, cx, cy, r, on) {
      ctx.save(); ctx.translate(cx, cy);
      ctx.fillStyle = '#5a4a3a'; ctx.fillRect(-r * 0.5, r * 0.2, r, r * 0.5);   // base
      ctx.strokeStyle = on ? '#e8483a' : '#9aa0aa'; ctx.lineWidth = Math.max(2, r * 0.28); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, r * 0.35); ctx.lineTo(on ? r * 0.5 : -r * 0.5, -r * 0.5); ctx.stroke();
      ctx.restore();
    },
    drawDust(ctx, x, y, cs, powered) {
      ctx.strokeStyle = powered ? '#ff5540' : '#7a2a22'; ctx.lineWidth = Math.max(2, cs * 0.16); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x + cs * 0.2, y + cs * 0.5); ctx.lineTo(x + cs * 0.8, y + cs * 0.5);
      ctx.moveTo(x + cs * 0.5, y + cs * 0.2); ctx.lineTo(x + cs * 0.5, y + cs * 0.8); ctx.stroke();
    },
    drawLamp(ctx, cx, cy, r, on) {
      ctx.fillStyle = on ? '#ffe27a' : '#4a4636'; ctx.strokeStyle = '#2a2620'; ctx.lineWidth = 1.5;
      ctx.fillRect(cx - r * 0.6, cy - r * 0.6, r * 1.2, r * 1.2); ctx.strokeRect(cx - r * 0.6, cy - r * 0.6, r * 1.2, r * 1.2);
      if (on) { ctx.fillStyle = 'rgba(255,226,122,.35)'; ctx.beginPath(); ctx.arc(cx, cy, r * 1.3, 0, 7); ctx.fill(); }
    },
    // Pressure plate: a flat pad that presses (smaller/darker) when stepped on.
    drawPlate(ctx, cx, cy, r, on, weight) {
      const s = on ? r * 0.72 : r * 0.82;
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(cx - r * 0.85, cy - r * 0.85, r * 1.7, r * 1.7);
      ctx.fillStyle = on ? '#8a8f9a' : (weight ? '#7a6a4a' : '#b6bcc8'); ctx.strokeStyle = '#2a2f38'; ctx.lineWidth = 1.5;
      ctx.fillRect(cx - s, cy - s, s * 2, s * 2); ctx.strokeRect(cx - s, cy - s, s * 2, s * 2);
      if (weight) { ctx.fillStyle = '#2a2f38'; ctx.font = `${Math.max(7, r * 0.7) | 0}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('⚖', cx, cy); ctx.textBaseline = 'alphabetic'; }
    },
    // Piston: a wood/stone base with a head that extends (a solid barrier) when powered.
    drawPiston(ctx, x, y, cs, extended) {
      ctx.fillStyle = '#6b5836'; ctx.fillRect(x + cs * 0.1, y + cs * 0.1, cs * 0.8, cs * 0.8);   // base
      ctx.strokeStyle = '#2a2620'; ctx.lineWidth = 1.5; ctx.strokeRect(x + cs * 0.1, y + cs * 0.1, cs * 0.8, cs * 0.8);
      ctx.fillStyle = extended ? '#c9ccd6' : '#8a8f9a'; ctx.fillRect(x + cs * 0.22, y + (extended ? cs * 0.02 : cs * 0.28), cs * 0.56, extended ? cs * 0.34 : cs * 0.2);   // head
    },
    // Logic gate — a DISCRETE 1×1 block filling its cell (x,y = cell top-left, cs =
    // cell px). Bright when its output is on; blue dots = input sides, green = outputs.
    drawGate(ctx, x, y, cs, type, on, inputs, outputs) {
      // A gate is an OVERLAY on the terrain (like dust), NOT an opaque block — so it can
      // be hidden / blend in. A translucent inset panel lets the ground read through it.
      ctx.save();
      const m = cs * 0.14;
      ctx.globalAlpha = on ? 0.58 : 0.42;
      ctx.fillStyle = on ? '#c85454' : '#5a4a4c';
      ctx.fillRect(x + m, y + m, cs - 2 * m, cs - 2 * m);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = on ? 'rgba(255,190,190,0.9)' : 'rgba(220,170,170,0.55)'; ctx.lineWidth = 1;
      ctx.strokeRect(x + m + 0.5, y + m + 0.5, cs - 2 * m - 1, cs - 2 * m - 1);
      ctx.fillStyle = on ? '#fff' : 'rgba(255,255,255,0.72)'; ctx.font = `bold ${Math.max(5, cs * 0.26) | 0}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(type === 'nor' ? 'NOR' : type === 'not' ? 'NOT' : 'AND', x + cs / 2, y + cs / 2); ctx.textBaseline = 'alphabetic';
      const mid = { n: [x + cs / 2, y + cs * 0.14], s: [x + cs / 2, y + cs * 0.86], e: [x + cs * 0.86, y + cs / 2], w: [x + cs * 0.14, y + cs / 2] };
      const dot = (s, col) => { if (!mid[s]) return; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(mid[s][0], mid[s][1], Math.max(2, cs * 0.09), 0, 7); ctx.fill(); };
      (inputs || []).forEach((s) => dot(s, '#6ad0ff')); (outputs || []).forEach((s) => dot(s, '#7fe0a0'));
      ctx.restore();
    },

    // Direction toward the higher neighbour ('E'|'W'|'N'|'S'); horizontal default on
    // a tie/conflict (§). elevAt(c,r) → elevation.
    rampDir(elevAt, col, row) {
      const e = elevAt(col, row);
      const nb = { E: elevAt(col + 1, row) - e, W: elevAt(col - 1, row) - e, N: elevAt(col, row - 1) - e, S: elevAt(col, row + 1) - e };
      let best = 'E', bd = 0; for (const d of ['E', 'W', 'N', 'S']) if (nb[d] > bd) { bd = nb[d]; best = d; }
      return bd > 0 ? best : 'E';
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
    // Local +x = forward. LOWER body (feet+legs+waist) faces MOVEMENT; UPPER body
    // (arms+shoulders+head+weapon) faces AIM (opts.moveAngle vs aimAngle). Limbs
    // are CONNECTED segments (arms = shirt, legs = pants) from the body to a small
    // hand/foot — no floating parts. Feet point forward, in line with the hips.
    // Layer order: feet → legs → arms → waist → shoulders → head (arms cover legs;
    // waist+shoulders cover the limb roots). Colours from a palette (default OH_SPRITE).
    drawOverheadPlayer(ctx, cx, cy, r, dist, moving, aimAngle, opts) {
      opts = opts || {};
      const S = opts.palette || window.OH_SPRITE;
      const weapon = opts.weapon === undefined ? 'pickaxe' : opts.weapon;
      const moveAngle = opts.moveAngle != null ? opts.moveAngle : aimAngle;
      const ph = (dist / (r * 1.15)) % (Math.PI * 2), swing = moving ? Math.sin(ph) : 0;
      const span = r * 1.4, limbW = opts.bony ? r * 0.16 : r * 0.26;
      const armAmp = r * 0.55, legAmp = r * 0.5, restFwd = r * 0.18;
      ctx.save(); ctx.translate(cx, cy);
      if (opts.spin) ctx.rotate(opts.spin);   // double-jump flat spin
      // Somersault: foreshorten ALONG the facing direction (cos 1 → edge-on → flipped
      // → back) so the sprite rolls head-over-heels the way it's FACING, not always down.
      if (opts.somersault != null) { const f = opts.facing != null ? opts.facing : (aimAngle || 0); const cv = Math.cos(opts.somersault * Math.PI * 2); ctx.rotate(f); ctx.scale(Math.abs(cv) < 0.06 ? 0.06 : cv, 1); ctx.rotate(-f); }

      // ── LOWER BODY — faces movement ──
      const crouch = opts.crouch || 0, mantle = opts.mantleLeg || 0;   // pipe-climb pose
      ctx.save(); if (opts.rotate !== false && moveAngle != null) ctx.rotate(moveAngle);
      ctx.lineCap = 'round';
      for (const sy of [-1, 1]) {
        if (mantle > 0.3 && sy === 1) continue;               // the raised leg is the trapezoid below
        const yB = sy * (span / 2) * 0.7;                      // hip
        const footX = (restFwd + (moving ? -swing * sy * legAmp : -r * 0.05)) * (1 - crouch * 0.6);   // legs drive the walk
        ctx.strokeStyle = S.pants; ctx.lineWidth = limbW * (1 - crouch * 0.25);
        ctx.beginPath(); ctx.moveTo(0, yB); ctx.lineTo(footX, yB); ctx.stroke();   // leg (connected)
        ctx.fillStyle = _shade(S.pants, 0.2);                   // foot — forward-pointing, in line with hip
        ctx.fillRect(footX - limbW * 0.2, yB - limbW * 0.5, limbW * 1.1, limbW);
      }
      // FORESHORTENED raised leg — a bent knee rising toward the camera (a growing trapezoid
      // waist→knee + a foot beyond it) — the climb-in "pull-up" leg.
      if (mantle > 0.01) {
        const t = mantle * mantle * (3 - 2 * mantle), bw = r * 0.95, waistW = bw * 0.5, kneeW = waistW * 1.05 * (0.53 + 0.47 * t), thigh = r * (0.18 + 0.67 * t), oy = r * 0.1;
        ctx.fillStyle = S.pants; ctx.beginPath(); ctx.moveTo(0, oy - waistW / 2); ctx.lineTo(thigh, oy - kneeW / 2); ctx.lineTo(thigh, oy + kneeW / 2); ctx.lineTo(0, oy + waistW / 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(thigh - 2, oy - kneeW / 2, 4, kneeW);   // knee edge (nearer = lighter)
        const footL = kneeW * 0.85, footW = kneeW * 1.05; ctx.fillStyle = _shade(S.pants, 0.65); ctx.fillRect(thigh, oy - footW / 2, footL, footW);   // foot on the pipe
      }
      ctx.restore();

      // ── UPPER BODY — faces aim ──
      ctx.save(); if (opts.rotate !== false && aimAngle != null) ctx.rotate(aimAngle);
      ctx.lineCap = 'round';
      // Arms (drawn first in the upper group so they cover the legs/feet below).
      for (const sy of [-1, 1]) {
        const yB = sy * (span / 2);
        const handX = restFwd + (moving ? swing * sy * armAmp : r * 0.1) + (opts.grab || 0) * r * 1.6;   // grab = BOTH hands reach UP to the rim
        ctx.strokeStyle = S.shirt; ctx.lineWidth = limbW;
        ctx.beginPath(); ctx.moveTo(0, yB); ctx.lineTo(handX, yB); ctx.stroke();   // arm (connected, shirt)
        ctx.fillStyle = S.skin; ctx.beginPath(); ctx.arc(handX, yB, limbW * 0.42, 0, 7); ctx.fill();   // hand
      }
      // Waist (pants) then shoulders (shirt) — cover the limb roots.
      ctx.fillStyle = S.pants; ctx.fillRect(-r * 0.28, -span * 0.42, r * 0.56, span * 0.84);
      if (opts.bony) { ctx.fillStyle = S.shirt; ctx.fillRect(-r * 0.09, -span / 2, r * 0.18, span);   // parallel shoulder-bone
        ctx.fillRect(-r * 0.28, -r * 0.06, r * 0.5, r * 0.12); }                                       // thin neck
      else { ctx.fillStyle = S.shirt; ctx.fillRect(-r * 0.36, -span / 2, r * 0.72, span); }
      // Head (smaller, on top).
      const headR = r * 0.5;
      ctx.fillStyle = S.hair; ctx.fillRect(-headR, -headR, headR * 2, headR * 2);
      if (opts.eyeSockets) { ctx.fillStyle = '#222'; ctx.fillRect(headR - headR * 0.5, -headR * 0.55, headR * 0.34, headR * 0.34); ctx.fillRect(headR - headR * 0.5, headR * 0.2, headR * 0.34, headR * 0.34); }
      else { ctx.fillStyle = 'rgba(255,255,255,.10)'; ctx.fillRect(-headR, -headR, headR * 2, headR * 0.4); }
      // Weapon in the forward hand (suppressed when thrown via weapon:null).
      if (weapon) { ctx.save(); ctx.translate(headR * 0.5, span / 2); this.drawWeapon(ctx, r, weapon); ctx.restore(); }
      ctx.restore();
      ctx.restore();
    },

    // ── Mob dispatch (zombie = green humanoid; skeleton = bony; spider = custom).
    drawOverheadMob(ctx, cx, cy, r, dist, moving, aimAngle, type, moveAngle) {
      if (type === 'spider') return this._drawSpider(ctx, cx, cy, r, aimAngle);
      if (type === 'skeleton') return this.drawOverheadPlayer(ctx, cx, cy, r, dist, moving, aimAngle,
        { palette: { hair: '#e8e6dc', shirt: '#d8d4c6', pants: '#cfcabc', skin: '#efeee6' }, weapon: 'bow', bony: true, eyeSockets: true, moveAngle });
      // zombie — the player body, green skin.
      return this.drawOverheadPlayer(ctx, cx, cy, r, dist, moving, aimAngle,
        { palette: { hair: '#4a7a34', shirt: '#3f5a34', pants: '#33472a', skin: '#5c9a44' }, weapon: null, moveAngle });
    },
    // Square body, 8 legs on the two SIDES (±y, 4 each), red eyes on the FRONT edge
    // (+x) which has NO legs. Faces the player (aimAngle).
    _drawSpider(ctx, cx, cy, r, aimAngle) {
      ctx.save(); ctx.translate(cx, cy); if (aimAngle != null) ctx.rotate(aimAngle);
      const body = r * 0.95, legLen = r * 0.7, legW = Math.max(1.5, r * 0.11);
      ctx.strokeStyle = '#241f2a'; ctx.lineWidth = legW; ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const lx = (-1.05 + i * 0.7) * body * 0.5;             // 4 legs spread along the body's x
        const kick = Math.sin(i) * body * 0.18;
        ctx.beginPath(); ctx.moveTo(lx, -body / 2); ctx.lineTo(lx + kick, -body / 2 - legLen); ctx.stroke();  // top side (−y)
        ctx.beginPath(); ctx.moveTo(lx, body / 2); ctx.lineTo(lx + kick, body / 2 + legLen); ctx.stroke();    // bottom side (+y)
      }
      ctx.fillStyle = window.OH_PALETTE ? window.OH_PALETTE.OH_MOB_BY_KEY.spider.color : '#3a3340';
      ctx.fillRect(-body / 2, -body / 2, body, body);          // square body
      ctx.fillStyle = _shade('#3a3340', -0.25); ctx.fillRect(body / 2 - body * 0.22, -body / 2, body * 0.22, body);  // front band
      ctx.fillStyle = '#e33'; const d = body * 0.17;           // two red eyes on the FRONT edge (+x)
      ctx.fillRect(body / 2 - d * 1.5, -body * 0.28, d, d); ctx.fillRect(body / 2 - d * 1.5, body * 0.12, d, d);
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
