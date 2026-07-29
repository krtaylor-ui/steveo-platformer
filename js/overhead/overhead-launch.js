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

    // Elevation offset per level, in px (up AND left) — the diagonal "stacked cube"
    // shift. Kept here so terrain + entities agree.
    elevOffset(cs) { return cs * 0.22; },
    // A stacked-cube tile: top shifted up-left by elev×Q, with darker SOUTH + EAST
    // faces exposed toward lower/absent neighbours (east darkest). fx,fy = the
    // FOOTPRINT (elev-0) top-left. Draw cells back→front (by r+c then elev).
    drawTerrainCube(ctx, key, fx, fy, cs, elev, exposeS, exposeE) {
      const Q = this.elevOffset(cs), base = P().terrainColor(key);
      const tx = fx - elev * Q, ty = fy - elev * Q;   // shifted top
      // LEAVES are a floating canopy — draw only the top (no tall side faces down to
      // the ground, which looked like leaf-sides through the lower elevations).
      if (key === 'leaves') { this.drawTerrainTile(ctx, key, tx, ty, cs, elev); return; }
      if (elev > 0) {
        if (exposeS) { ctx.fillStyle = _shade(base, 0.4); ctx.beginPath(); ctx.moveTo(tx, ty + cs); ctx.lineTo(tx + cs, ty + cs); ctx.lineTo(fx + cs, fy + cs); ctx.lineTo(fx, fy + cs); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 1; for (let i = 1; i <= elev; i++) { const yy = ty + cs + (fy + cs - (ty + cs)) * (i / elev); const xx = tx + (fx - tx) * (i / elev); ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + cs, yy); ctx.stroke(); } }
        if (exposeE) { ctx.fillStyle = _shade(base, 0.55); ctx.beginPath(); ctx.moveTo(tx + cs, ty); ctx.lineTo(tx + cs, ty + cs); ctx.lineTo(fx + cs, fy + cs); ctx.lineTo(fx + cs, fy); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,.3)'; for (let i = 1; i <= elev; i++) { const xx = tx + cs + (fx + cs - (tx + cs)) * (i / elev); const yy = ty + (fy - ty) * (i / elev); ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx, yy + cs); ctx.stroke(); } }
      }
      this.drawTerrainTile(ctx, key, tx, ty, cs, elev);
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
          const cols = 4, rows = 5, bw = w / cols, bh = Math.max(6, cs * 0.72), lean = cs * 0.14;
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
          ctx.fillStyle = '#2f8f52'; ctx.fillRect(x, y, w, h);
          ctx.fillStyle = '#1e6b3a'; ctx.fillRect(x, y, w, h * 0.28);
          ctx.fillStyle = '#0c2415'; ctx.beginPath(); ctx.ellipse(cx, cy + h * 0.05, w * 0.3, h * 0.3, 0, 0, 7); ctx.fill();
          break; }
        case 'healer': {
          rr('#e9efe9'); ctx.fillStyle = '#3fb07b'; ctx.fillRect(x, y, w, h * 0.26);                 // roof band
          ctx.fillStyle = '#c0392b'; const t = min * 0.13; ctx.fillRect(cx - t / 2, cy - t * 1.6, t, t * 3.2); ctx.fillRect(cx - t * 1.6, cy - t / 2, t * 3.2, t);   // red cross
          if (detail > 0.4) { ctx.fillStyle = '#7a5a3a'; ctx.fillRect(cx - w * 0.09, y + h - h * 0.22, w * 0.18, h * 0.22); }   // door
          break; }
        case 'shop': {
          rr('#caa25a'); ctx.fillStyle = '#8a5a2a'; ctx.fillRect(x, y, w, h * 0.24);
          // striped awning
          const n = 5; for (let i = 0; i < n; i++) { ctx.fillStyle = i % 2 ? '#d9534f' : '#f5f0e6'; ctx.fillRect(x + (w / n) * i, y + h * 0.24, w / n, h * 0.14); }
          ctx.fillStyle = '#5a3a1a'; ctx.fillRect(cx - w * 0.12, y + h - h * 0.3, w * 0.24, h * 0.3);
          if (detail > 0.4) { ctx.fillStyle = 'rgba(120,200,255,.6)'; ctx.fillRect(x + w * 0.12, y + h * 0.5, w * 0.16, h * 0.18); ctx.fillRect(x + w - w * 0.28, y + h * 0.5, w * 0.16, h * 0.18); }   // windows
          break; }
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
          ctx.fillStyle = '#8a8a92'; ctx.fillRect(x + w * 0.2, y + h * 0.7, w * 0.6, h * 0.3);   // pedestal
          ctx.fillStyle = '#b5b5bd'; ctx.fillRect(cx - w * 0.1, y + h * 0.2, w * 0.2, h * 0.5);   // body
          ctx.beginPath(); ctx.arc(cx, y + h * 0.22, min * 0.12, 0, 7); ctx.fill();               // head
          break; }
        case 'core': case 'nexus': {
          const teal = typeId === 'nexus'; rr(teal ? '#16233a' : '#2a1620');
          const g = ctx.createRadialGradient(cx, cy, min * 0.1, cx, cy, min * 0.5); g.addColorStop(0, teal ? '#8fd0ff' : '#ffb08f'); g.addColorStop(1, teal ? '#3f6dc0' : '#c0503f');
          ctx.fillStyle = g; ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 - Math.PI / 2; const px = cx + Math.cos(a) * min * 0.42, py = cy + Math.sin(a) * min * 0.42; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); ctx.fill();   // crystal hexagon
          ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = Math.max(1, min * 0.03); ctx.stroke();
          break; }
        default: rr('#8a7fb0'); outline();
      }
      if (typeId !== 'core' && typeId !== 'nexus' && typeId !== 'tower' && typeId !== 'portal' && typeId !== 'pipe') outline();
      ctx.restore();
    },

    // Placed items rendered as the actual item (weapon shape / coin), sized to the
    // player (pass a player-scaled size, not a map-cell size).
    drawItemSprite(ctx, itemKey, cx, cy, size) {
      if (itemKey === 'coin' || !itemKey) { ctx.fillStyle = '#ffd94a'; ctx.beginPath(); ctx.arc(cx, cy, size * 0.32, 0, 7); ctx.fill(); ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(cx - size * 0.1, cy - size * 0.1, size * 0.08, 0, 7); ctx.fill(); return; }
      const wk = itemKey === 'crossbow' ? 'bow' : itemKey;   // reuse the held-weapon shapes
      ctx.save(); ctx.translate(cx - size * 0.45, cy); ctx.rotate(-0.35); this.drawWeapon(ctx, size * 0.62, wk); ctx.restore();
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
        const ramp = '#b98a4a', L = s * 0.55;
        const lb = [-s * 0.45, -s * 0.4], lf = [-s * 0.45, s * 0.4], hf = [s * 0.45 - L, s * 0.4 - L], hb = [s * 0.45 - L, -s * 0.4 - L];
        ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(-s * 0.45, -s * 0.4, s * 0.9, s * 0.8);   // ground shadow
        ctx.fillStyle = _shade(ramp, 0.5); ctx.beginPath(); ctx.moveTo(hb[0], hb[1]); ctx.lineTo(hf[0], hf[1]); ctx.lineTo(s * 0.45, s * 0.4); ctx.lineTo(s * 0.45, -s * 0.4); ctx.closePath(); ctx.fill();   // high-end face
        ctx.fillStyle = ramp; ctx.beginPath(); ctx.moveTo(lb[0], lb[1]); ctx.lineTo(lf[0], lf[1]); ctx.lineTo(hf[0], hf[1]); ctx.lineTo(hb[0], hb[1]); ctx.closePath(); ctx.fill();   // sloped top
        ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 1; for (let i = 1; i <= 3; i++) { const t = i / 4; ctx.beginPath(); ctx.moveTo(lb[0] + (hb[0] - lb[0]) * t, lb[1] + (hb[1] - lb[1]) * t); ctx.lineTo(lf[0] + (hf[0] - lf[0]) * t, lf[1] + (hf[1] - lf[1]) * t); ctx.stroke(); }
      }
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
      // Somersault: foreshorten Y through cos() so the sprite flips head-over-heels
      // (1 → edge-on → upside-down → back), read from above.
      if (opts.somersault != null) { const cv = Math.cos(opts.somersault * Math.PI * 2); ctx.scale(1, Math.abs(cv) < 0.06 ? 0.06 : cv); }

      // ── LOWER BODY — faces movement ──
      ctx.save(); if (opts.rotate !== false && moveAngle != null) ctx.rotate(moveAngle);
      ctx.lineCap = 'round';
      for (const sy of [-1, 1]) {
        const yB = sy * (span / 2) * 0.7;                      // hip
        const footX = restFwd + (moving ? -swing * sy * legAmp : -r * 0.05);   // legs drive the walk
        ctx.strokeStyle = S.pants; ctx.lineWidth = limbW;
        ctx.beginPath(); ctx.moveTo(0, yB); ctx.lineTo(footX, yB); ctx.stroke();   // leg (connected)
        ctx.fillStyle = _shade(S.pants, 0.2);                   // foot — forward-pointing, in line with hip
        ctx.fillRect(footX - limbW * 0.2, yB - limbW * 0.5, limbW * 1.1, limbW);
      }
      ctx.restore();

      // ── UPPER BODY — faces aim ──
      ctx.save(); if (opts.rotate !== false && aimAngle != null) ctx.rotate(aimAngle);
      ctx.lineCap = 'round';
      // Arms (drawn first in the upper group so they cover the legs/feet below).
      for (const sy of [-1, 1]) {
        const yB = sy * (span / 2);
        const handX = restFwd + (moving ? swing * sy * armAmp : r * 0.1);
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
