// ══════════════════════════════════════════════════════════════════════════
// Overhead Engine — Sandbox editor (§8). A functional core authoring loop:
// create a blank map (size/density/mode), paint terrain + elevation, place
// goal/spawn/buildings/mobs/items, adjustable brush, elevation level selector,
// editor zoom + pan, Test (launch the runtime on the draft), and Save/Load
// (localStorage). Reuses #gameCanvas for the map view + a DOM toolbar.
//
// PARTIAL by design (documented): hover-expand palette tabs, MRU hotlist,
// line-interpolated drag brush, path/redstone placement, and server publish are
// deferred refinements — the essential build→test→save loop is here.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  const T = { VOID: 0, GRASS: 1, PATH: 2, HAZARD: 3, WALL: 4, GOAL: 5 };
  const TERRAIN = [
    { id: T.GRASS, name: 'Grass', color: '#3f7a43' }, { id: T.PATH, name: 'Path', color: '#9a8b63' },
    { id: T.HAZARD, name: 'Hazard', color: '#3b6bd6' }, { id: T.WALL, name: 'Wall', color: '#5a5a66' },
    { id: T.VOID, name: 'Void', color: '#10141c' },
  ];
  const ELEV_COLORS = ['#2a2f3a', '#3a4a5a', '#4a6a7a', '#5a8a9a'];
  const STORE_KEY = 'steveo_overhead_worlds';
  const CANVAS_W = 800, CANVAS_H = 500;

  const OH_EDITOR = {
    world: null, grid: null, cam: { x: 0, y: 0 },
    tool: 'terrain', terrainId: T.GRASS, elevLevel: 1, brush: 1, buildingType: 'healer', mobType: 'zombie',
    _running: false, _dragging: false,

    // ── Entry ─────────────────────────────────────────────────────────────────
    open(existing) {
      this._injectBar();
      if (existing) { this.world = existing; }
      else { this._newWorldFlow(); if (!this.world) return; }
      this._setupWorld();
      const bar = document.getElementById('oh-editor-bar'); if (bar) bar.style.display = 'flex';
      ['dashboard-screen', 'sandbox-screen'].forEach((id) => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
      if (document.body) { document.body.classList.remove('pre-game'); document.body.classList.add('in-game'); window.dispatchEvent(new Event('resize')); }
      this._bindCanvas();
      this._running = true;
      this._loop = this._loop.bind(this);
      requestAnimationFrame(this._loop);
    },

    _newWorldFlow() {
      // §8a creation flow (compact prompt-based MVP).
      const sizePreset = (prompt('Map size — S / M / L (or "WxH", e.g. 40x30):', 'M') || 'M').trim().toUpperCase();
      let W = 40, H = 26;
      if (sizePreset === 'S') { W = 26; H = 18; }
      else if (sizePreset === 'L') { W = 60; H = 40; }
      else if (/^\d+X\d+$/.test(sizePreset)) { const p = sizePreset.split('X'); W = Math.min(120, +p[0] | 0); H = Math.min(120, +p[1] | 0); }
      const density = Math.min(4, Math.max(1, parseInt(prompt('Grid density (1–4 background sub-blocks per cell):', '1'), 10) || 1));
      const mode = (prompt('Game mode (platformer / campaign / arena / towerdefense / moba):', 'platformer') || 'platformer').trim().toLowerCase();
      const ground = [], elevation = [];
      for (let r = 0; r < H; r++) { ground.push(new Array(W).fill(T.GRASS)); elevation.push(new Array(W).fill(0)); }
      for (let c = 0; c < W; c++) { ground[0][c] = T.WALL; ground[H - 1][c] = T.WALL; }
      for (let r = 0; r < H; r++) { ground[r][0] = T.WALL; ground[r][W - 1] = T.WALL; }
      this.world = {
        mode, viewMode: 'overhead', controlScheme: 'free-aim', angleLockDeg: 0, rules: { autoClimb: '1' },
        name: 'Overhead ' + mode + ' ' + W + 'x' + H,
        mapSnapshot: { gridW: W, gridH: H, density, objectScaleMode: 'independent', ground, elevation, decorations: [] },
        buildings: [], mobs: [], items: [], spawns: [{ col: 2, row: H - 3 }],
      };
    },

    _setupWorld() {
      const m = this.world.mapSnapshot;
      this.grid = OH_GRID.make({ gridW: m.gridW, gridH: m.gridH, density: m.density, objectScaleMode: m.objectScaleMode, masterZoom: 1 });
      this.cam = { x: 0, y: 0 };
    },

    close() {
      this._running = false;
      const bar = document.getElementById('oh-editor-bar'); if (bar) bar.style.display = 'none';
      this._unbindCanvas();
      if (document.body) document.body.classList.remove('in-game');
      const s = document.getElementById('sandbox-screen'); if (s) s.style.display = 'block';
      else { const d = document.getElementById('dashboard-screen'); if (d) d.style.display = 'block'; }
    },

    // ── Toolbar (DOM) ───────────────────────────────────────────────────────
    _injectBar() {
      if (document.getElementById('oh-editor-bar')) return;
      const s = document.createElement('style'); s.textContent = `
        #oh-editor-bar{position:fixed;top:0;left:0;right:0;z-index:5500;display:none;gap:6px;flex-wrap:wrap;align-items:center;
          background:#141a26;border-bottom:1px solid #2c3648;padding:6px 8px;font:12px sans-serif;color:#dbe4f3}
        #oh-editor-bar button,#oh-editor-bar select{background:#243049;border:1px solid #3a4a6b;color:#dbe4f3;border-radius:5px;padding:4px 8px;cursor:pointer}
        #oh-editor-bar button.on{background:#3a5a8c;border-color:#5573ad}
        #oh-editor-bar .sw{width:16px;height:16px;border-radius:3px;display:inline-block;vertical-align:middle;margin-right:3px;border:1px solid rgba(255,255,255,.3)}`;
      document.head.appendChild(s);
      const bar = document.createElement('div'); bar.id = 'oh-editor-bar'; document.body.appendChild(bar);
    },

    _renderBar() {
      const bar = document.getElementById('oh-editor-bar'); if (!bar) return;
      const tools = ['terrain', 'elevation', 'goal', 'spawn', 'building', 'mob', 'item', 'erase'];
      const terrOpts = TERRAIN.map((t) => `<option value="${t.id}" ${t.id === this.terrainId ? 'selected' : ''}>${t.name}</option>`).join('');
      const bTypes = (typeof OH_BUILDINGS !== 'undefined') ? OH_BUILDINGS.all().map((d) => d.id) : ['healer'];
      const bOpts = bTypes.map((b) => `<option ${b === this.buildingType ? 'selected' : ''}>${b}</option>`).join('');
      bar.innerHTML =
        tools.map((t) => `<button data-tool="${t}" class="${this.tool === t ? 'on' : ''}">${t}</button>`).join('') +
        `<span>Terrain <select id="oh-terr">${terrOpts}</select></span>` +
        `<span>Elev <select id="oh-elev">${[0, 1, 2, 3].map((l) => `<option value="${l}" ${l === this.elevLevel ? 'selected' : ''}>${l}</option>`).join('')}</select></span>` +
        `<span>Brush <select id="oh-brush">${[1, 2, 3, 5].map((b) => `<option value="${b}" ${b === this.brush ? 'selected' : ''}>${b}</option>`).join('')}</select></span>` +
        `<span>Building <select id="oh-btype">${bOpts}</select></span>` +
        `<button id="oh-zin">Zoom +</button><button id="oh-zout">Zoom −</button>` +
        `<button id="oh-test">▶ Test</button><button id="oh-save">💾 Save</button><button id="oh-exit">✕ Exit</button>` +
        `<span style="opacity:.7">arrows/drag-edge pan · click/drag paint</span>`;
      bar.querySelectorAll('[data-tool]').forEach((b) => b.onclick = () => { this.tool = b.dataset.tool; this._renderBar(); });
      const g = (id) => document.getElementById(id);
      g('oh-terr').onchange = (e) => this.terrainId = +e.target.value;
      g('oh-elev').onchange = (e) => this.elevLevel = +e.target.value;
      g('oh-brush').onchange = (e) => this.brush = +e.target.value;
      g('oh-btype').onchange = (e) => this.buildingType = e.target.value;
      g('oh-zin').onclick = () => OH_GRID.zoomBy(this.grid, 1.15);
      g('oh-zout').onclick = () => OH_GRID.zoomBy(this.grid, 0.87);
      g('oh-test').onclick = () => this._test();
      g('oh-save').onclick = () => this._save();
      g('oh-exit').onclick = () => this.close();
    },

    // ── Canvas interaction ──────────────────────────────────────────────────
    _bindCanvas() {
      const cv = document.getElementById('gameCanvas');
      this._md = (e) => { this._dragging = true; this._paintAt(e); };
      this._mm = (e) => { if (this._dragging) this._paintAt(e); this._mx = e; };
      this._mu = () => { this._dragging = false; };
      this._kd = (e) => {
        const pan = 40 / this.grid.masterZoom;
        if (e.key === 'ArrowLeft') this.cam.x -= pan; else if (e.key === 'ArrowRight') this.cam.x += pan;
        else if (e.key === 'ArrowUp') this.cam.y -= pan; else if (e.key === 'ArrowDown') this.cam.y += pan;
        else if (e.key === 'Escape') this.close();
      };
      cv.addEventListener('mousedown', this._md); cv.addEventListener('mousemove', this._mm);
      window.addEventListener('mouseup', this._mu); window.addEventListener('keydown', this._kd);
      this._renderBar();
    },
    _unbindCanvas() {
      const cv = document.getElementById('gameCanvas');
      if (cv) { cv.removeEventListener('mousedown', this._md); cv.removeEventListener('mousemove', this._mm); }
      window.removeEventListener('mouseup', this._mu); window.removeEventListener('keydown', this._kd);
    },

    _cellFromEvent(e) {
      const cv = document.getElementById('gameCanvas'); const rect = cv.getBoundingClientRect();
      const sx = (e.clientX - rect.left) * (CANVAS_W / rect.width), sy = (e.clientY - rect.top) * (CANVAS_H / rect.height);
      const w = OH_GRID.screenToWorld(this.grid, this.cam, sx, sy);
      return OH_GRID.cellAt(this.grid, w.x, w.y);
    },
    _paintAt(e) {
      const { col, row } = this._cellFromEvent(e);
      const m = this.world.mapSnapshot;
      const half = Math.floor(this.brush / 2);
      const apply = (fn) => { for (let dr = -half; dr <= half; dr++) for (let dc = -half; dc <= half; dc++) {
        const c = col + dc, r = row + dr; if (c < 0 || r < 0 || c >= m.gridW || r >= m.gridH) continue; fn(c, r);
      } };
      if (this.tool === 'terrain') apply((c, r) => { m.ground[r][c] = this.terrainId; });
      else if (this.tool === 'elevation') apply((c, r) => { m.elevation[r][c] = this.elevLevel; });
      else if (this.tool === 'goal') { this._clearGoals(); m.ground[row][col] = T.GOAL; }
      else if (this.tool === 'spawn') { this.world.spawns = [{ col, row }]; }
      else if (this.tool === 'building') { if (!this.world.buildings.some((b) => b.col === col && b.row === row)) this.world.buildings.push(OH_BUILDINGS.place(this.buildingType, col, row, { level: this.elevLevel })); }
      else if (this.tool === 'mob') { this.world.mobs.push({ col, row, type: this.mobType, hp: 8, speed: 1.5, detect: 180 }); }
      else if (this.tool === 'item') { this.world.items.push({ col, row, kind: 'coin' }); }
      else if (this.tool === 'erase') {
        m.ground[row][col] = T.GRASS; m.elevation[row][col] = 0;
        this.world.buildings = this.world.buildings.filter((b) => !(b.col === col && b.row === row));
        this.world.mobs = this.world.mobs.filter((b) => !(b.col === col && b.row === row));
        this.world.items = this.world.items.filter((b) => !(b.col === col && b.row === row));
      }
    },
    _clearGoals() { const m = this.world.mapSnapshot; for (let r = 0; r < m.gridH; r++) for (let c = 0; c < m.gridW; c++) if (m.ground[r][c] === T.GOAL) m.ground[r][c] = T.GRASS; },

    // ── Actions ───────────────────────────────────────────────────────────────
    _test() {
      this._running = false; this._unbindCanvas();
      const bar = document.getElementById('oh-editor-bar'); if (bar) bar.style.display = 'none';
      const draft = JSON.parse(JSON.stringify(this.world));
      OVERHEAD.launchWorld(draft, {}, () => { if (window.game && window.game.destroy) window.game.destroy(); window.game = null; this.open(this.world); });
    },
    _save() {
      try {
        const all = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
        const key = this.world.name || ('overhead-' + Date.now());
        this.world.name = key;
        all[key] = this.world;
        localStorage.setItem(STORE_KEY, JSON.stringify(all));
        this._flash('Saved "' + key + '"');
      } catch (e) { this._flash('Save failed: ' + e.message); }
    },
    list() { try { return Object.keys(JSON.parse(localStorage.getItem(STORE_KEY) || '{}')); } catch (e) { return []; } },
    load(name) { try { const all = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); return all[name] || null; } catch (e) { return null; } },
    _flash(msg) { const bar = document.getElementById('oh-editor-bar'); if (!bar) return; const s = document.createElement('span'); s.textContent = '  ' + msg; s.style.color = '#8fe0a0'; bar.appendChild(s); setTimeout(() => s.remove(), 2500); },

    // ── Render loop ─────────────────────────────────────────────────────────
    _loop() {
      if (!this._running) return;
      try { this._render(); } catch (e) { console.error('OH editor', e); }
      requestAnimationFrame(this._loop);
    },
    _render() {
      const cv = document.getElementById('gameCanvas'); const ctx = cv.getContext('2d');
      const g = this.grid, cam = this.cam, m = this.world.mapSnapshot, z = g.masterZoom, cs = g.cell * z;
      this.cam = OH_GRID.clampCamera(g, cam, CANVAS_W, CANVAS_H);
      ctx.fillStyle = '#0c0f16'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      const S = (wx, wy) => OH_GRID.worldToScreen(g, this.cam, wx, wy);
      const tl = OH_GRID.screenToWorld(g, this.cam, 0, 0), br = OH_GRID.screenToWorld(g, this.cam, CANVAS_W, CANVAS_H);
      const c0 = Math.max(0, (tl.x / g.cell | 0) - 1), c1 = Math.min(m.gridW - 1, (br.x / g.cell | 0) + 1);
      const r0 = Math.max(0, (tl.y / g.cell | 0) - 1), r1 = Math.min(m.gridH - 1, (br.y / g.cell | 0) + 1);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const id = m.ground[r][c] | 0, elev = m.elevation[r][c] | 0;
        const sp = S(c * g.cell, r * g.cell); const y = sp.y + OH_ELEV.yOffset(elev) * z;
        const t = TERRAIN.find((x) => x.id === id) || TERRAIN[0];
        ctx.fillStyle = id === T.GOAL ? '#ffd700' : t.color; ctx.fillRect(sp.x, y, cs + 1, cs + 1);
        if (elev > 0) { ctx.strokeStyle = ELEV_COLORS[Math.min(3, elev)]; ctx.lineWidth = 2; ctx.strokeRect(sp.x + 1, y + 1, cs - 2, cs - 2);
          ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.font = `${Math.max(8, cs * 0.3)}px sans-serif`; ctx.textAlign = 'left'; ctx.fillText(String(elev), sp.x + 2, y + cs * 0.4); }
        ctx.strokeStyle = 'rgba(0,0,0,.15)'; ctx.strokeRect(sp.x, y, cs, cs);
      }
      // Entities.
      for (const b of this.world.buildings) { const sp = S((b.col + 0.5) * g.cell, (b.row + 0.5) * g.cell); const t = OH_BUILDINGS.get(b.typeId); ctx.fillStyle = (t && t.color) || '#8a7fb0'; ctx.fillRect(sp.x - cs * 0.4, sp.y - cs * 0.4, cs * 0.8, cs * 0.8); ctx.fillStyle = '#fff'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(b.typeId.slice(0, 4), sp.x, sp.y + cs * 0.5); }
      for (const mo of this.world.mobs) { const sp = S((mo.col + 0.5) * g.cell, (mo.row + 0.5) * g.cell); ctx.fillStyle = '#c05050'; ctx.beginPath(); ctx.arc(sp.x, sp.y, cs * 0.3, 0, 7); ctx.fill(); }
      for (const it of this.world.items) { const sp = S((it.col + 0.5) * g.cell, (it.row + 0.5) * g.cell); ctx.fillStyle = '#ffd94a'; ctx.beginPath(); ctx.arc(sp.x, sp.y, cs * 0.2, 0, 7); ctx.fill(); }
      for (const spn of (this.world.spawns || [])) { const sp = S((spn.col + 0.5) * g.cell, (spn.row + 0.5) * g.cell); ctx.strokeStyle = '#4aa3ff'; ctx.lineWidth = 2; ctx.strokeRect(sp.x - cs * 0.4, sp.y - cs * 0.4, cs * 0.8, cs * 0.8); ctx.fillStyle = '#4aa3ff'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('P1', sp.x, sp.y + 3); }
      // Info.
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.textAlign = 'left'; ctx.font = '12px sans-serif';
      ctx.fillText(`${this.world.name} · ${m.gridW}×${m.gridH} d${m.density} · tool: ${this.tool}`, 10, CANVAS_H - 10);
    },
  };

  if (typeof window !== 'undefined') window.OH_EDITOR = OH_EDITOR;
})();
