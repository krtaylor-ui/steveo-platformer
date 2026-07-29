// ══════════════════════════════════════════════════════════════════════════
// Overhead Engine — Sandbox editor. Authoring loop with a friendly creation
// modal, a LEFT vertical tool rail (Brush / Elevation / Erase on top; hover-slide
// Terrain/Buildings/Mobs/Items tabs below), density baked into a finer grid,
// undo/redo, Shift+click erase (elevation-scoped), keyboard shortcuts, editor
// zoom/pan, Test, and SERVER-BACKED save/load (worlds table, viewMode:overhead).
//
// Density (§ fix): the chosen map SIZE is in base cells; density D subdivides each
// base cell into D×D finer cells (cell px = 32/D) — so a denser world shows MORE,
// SMALLER blocks in the SAME map area. Baked at creation into gridW/gridH + cell.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  const P = () => window.OH_PALETTE;
  const CANVAS_W = 800, CANVAS_H = 500, BASE_CELL = 32;

  const OH_EDITOR = {
    world: null, grid: null, cam: { x: 0, y: 0 },
    worldId: null,                 // server world id (null until first save)
    tab: 'terrain',                // active palette tab
    tool: 'terrain',               // terrain | building | mob | item | spawn
    terrainKey: 'grass', buildingType: 'healer', mobKey: 'zombie', itemKey: 'coin',
    elevLevel: 1, brush: 1,
    shape: 'freehand',             // freehand | line | rect | circle
    shapeFill: false,              // false = outline (brush = width) | true = filled
    view: { mobs: true, items: true, buildings: true, elev: false },   // top-bar view filters
    _running: false, _dragging: false, _shift: false, _shapeAnchor: null, _shapeEnd: null,
    _hist: [], _histPos: -1,

    // Keyboard shortcut defaults (bindable-ready — a future pass can route these
    // through the Controls-Config system as named editor actions).
    KEYS: { elevDown: 'BracketLeft', elevUp: 'BracketRight', zoomOut: 'Minus', zoomIn: 'Equal',
            undo: 'KeyZ', redo: 'KeyY', erase: 'ShiftLeft' },

    // ── Entry ─────────────────────────────────────────────────────────────────
    async open(existing) {
      this._injectStyle();
      if (existing) {
        // existing = a server world row { id, world_name, world_data } OR a raw world object.
        const wd = existing.world_data || existing;
        this.world = JSON.parse(JSON.stringify(wd));
        this.world.name = existing.world_name || this.world.name || 'Overhead World';
        this.worldId = existing.id || null;
      } else {
        const made = await this._newWorldModal();
        if (!made) return;   // cancelled
      }
      this._setupWorld();
      this._pushHistory();
      this._showChrome(true);
      ['dashboard-screen', 'sandbox-screen', 'campaign-select-screen'].forEach((id) => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
      if (document.body) { document.body.classList.remove('pre-game'); document.body.classList.add('in-game'); window.dispatchEvent(new Event('resize')); }
      this._bindCanvas(); this._renderBar();
      this._running = true; this._loop = this._loop.bind(this); requestAnimationFrame(this._loop);
    },

    _setupWorld() {
      const m = this.world.mapSnapshot;
      this.grid = OH_GRID.make({ gridW: m.gridW, gridH: m.gridH, density: m.density,
        objectScaleMode: m.objectScaleMode, cell: m.cell || (BASE_CELL / (m.density || 1)), masterZoom: 1 });
      this.cam = { x: 0, y: 0 };
    },

    close() {
      this._running = false;
      this._showChrome(false);
      this._unbindCanvas();
      if (document.body) document.body.classList.remove('in-game');
      // Return to the Sandbox browser (Overhead view) and refresh.
      if (typeof SANDBOX !== 'undefined' && SANDBOX._showBrowser) {
        SANDBOX.viewFilter = 'overhead';
        const s = document.getElementById('sandbox-screen'); if (s) s.style.display = 'block';
        if (SANDBOX.loadWorlds) SANDBOX.loadWorlds();
        if (SANDBOX._syncViewToggle) SANDBOX._syncViewToggle();
      } else {
        const d = document.getElementById('dashboard-screen'); if (d) d.style.display = 'block';
      }
    },

    // ── Creation modal (§8a — dropdowns, Custom→WxH, no size limits) ───────────
    _newWorldModal() {
      return new Promise((resolve) => {
        let ov = document.getElementById('oh-create-modal');
        if (!ov) { ov = document.createElement('div'); ov.id = 'oh-create-modal'; document.body.appendChild(ov); }
        ov.innerHTML = `
          <div class="ohc-panel">
            <h2>New Overhead World</h2>
            <label>Name <input id="ohc-name" type="text" value="My Overhead World"></label>
            <label>Map size <select id="ohc-size">
              <option value="S">Small (26×18)</option><option value="M" selected>Medium (40×26)</option>
              <option value="L">Large (60×40)</option><option value="XL">Huge (100×70)</option>
              <option value="custom">Custom…</option></select></label>
            <div id="ohc-custom" style="display:none">
              <label>Width <input id="ohc-w" type="number" value="40" min="1"></label>
              <label>Height <input id="ohc-h" type="number" value="26" min="1"></label>
            </div>
            <label>Grid density <select id="ohc-density">
              <option value="1" selected>1× (coarse)</option><option value="2">2×</option>
              <option value="3">3×</option><option value="4">4× (fine)</option></select></label>
            <label>Game mode <select id="ohc-mode">
              <option value="platformer" selected>Platformer</option><option value="campaign">Campaign</option>
              <option value="arena">Arena</option><option value="towerdefense">Tower Defense</option>
              <option value="moba">MOBA</option></select></label>
            <label>Control scheme <select id="ohc-scheme">
              <option value="free-aim" selected>Free-Aim</option><option value="move-to-aim">Move-to-Aim</option>
              <option value="twin-stick">Twin-Stick</option></select></label>
            <div class="ohc-btns"><button id="ohc-cancel">Cancel</button><button id="ohc-create" class="primary">Create</button></div>
          </div>`;
        ov.style.display = 'flex';
        const g = (id) => document.getElementById(id);
        g('ohc-size').onchange = () => { g('ohc-custom').style.display = g('ohc-size').value === 'custom' ? 'block' : 'none'; };
        g('ohc-cancel').onclick = () => { ov.style.display = 'none'; resolve(false); };
        g('ohc-create').onclick = () => {
          const sizeSel = g('ohc-size').value;
          const PRE = { S: [26, 18], M: [40, 26], L: [60, 40], XL: [100, 70] };
          let baseW, baseH;
          if (sizeSel === 'custom') { baseW = Math.max(1, parseInt(g('ohc-w').value, 10) || 40); baseH = Math.max(1, parseInt(g('ohc-h').value, 10) || 26); }
          else { [baseW, baseH] = PRE[sizeSel] || PRE.M; }
          const density = Math.min(4, Math.max(1, parseInt(g('ohc-density').value, 10) || 1));
          this.world = this._buildBlank(g('ohc-name').value || 'Overhead World',
            baseW, baseH, density, g('ohc-mode').value, g('ohc-scheme').value);
          this.worldId = null;
          ov.style.display = 'none'; resolve(true);
        };
      });
    },

    // Bake density into a finer grid: fine dims = base × density, cell = 32/density.
    _buildBlank(name, baseW, baseH, density, mode, scheme) {
      const W = baseW * density, H = baseH * density, cell = BASE_CELL / density;
      const ground = [], elevation = [];
      for (let r = 0; r < H; r++) { ground.push(new Array(W).fill('grass')); elevation.push(new Array(W).fill(0)); }
      return {
        name, mode, viewMode: 'overhead', gameModeDefault: 'NRM',   // NRM keeps server validation happy
        controlScheme: scheme, angleLockDeg: 0, rules: { autoClimb: '1' },
        mapSnapshot: { gridW: W, gridH: H, density, baseW, baseH, cell, objectScaleMode: 'independent', ground, elevation, decorations: [] },
        buildings: [], mobs: [], items: [], spawns: [{ col: 1, row: H - 2 }], ramps: [],
        goal: null,
        settings: (typeof OH_SETTINGS !== 'undefined') ? OH_SETTINGS.defaults() : {},
      };
    },

    // ── History (undo/redo) ─────────────────────────────────────────────────
    _snapshot() { return JSON.stringify({ map: this.world.mapSnapshot, b: this.world.buildings, m: this.world.mobs, i: this.world.items, s: this.world.spawns, g: this.world.goal }); },
    _pushHistory() {
      this._hist = this._hist.slice(0, this._histPos + 1);
      this._hist.push(this._snapshot()); this._histPos = this._hist.length - 1;
      if (this._hist.length > 60) { this._hist.shift(); this._histPos--; }
    },
    _restore(snap) { const d = JSON.parse(snap); this.world.mapSnapshot = d.map; this.world.buildings = d.b; this.world.mobs = d.m; this.world.items = d.i; this.world.spawns = d.s; this.world.goal = d.g; this._setupWorld(); },
    undo() { if (this._histPos > 0) { this._histPos--; this._restore(this._hist[this._histPos]); } },
    redo() { if (this._histPos < this._hist.length - 1) { this._histPos++; this._restore(this._hist[this._histPos]); } },

    // ── Editor chrome: a TOP command bar + a LEFT hover-rail (§ redesign). Both
    // are created here (the earlier bug: the container div was never made, so the
    // menu "vanished"). High z-index so they sit above the canvas.
    _injectStyle() {
      if (!document.getElementById('oh-editor-style')) {
        const s = document.createElement('style'); s.id = 'oh-editor-style'; s.textContent = `
          #oh-top{position:fixed;top:0;left:0;right:0;height:40px;z-index:9000;display:none;align-items:center;gap:6px;
            background:#141a26;border-bottom:1px solid #2c3648;padding:0 10px;font:13px sans-serif;color:#dbe4f3}
          #oh-top button{background:#243049;border:1px solid #3a4a6b;color:#dbe4f3;border-radius:6px;padding:5px 11px;cursor:pointer;font-size:13px}
          #oh-top button:hover{background:#31415f} #oh-top button.primary{background:#2e6f4e;border-color:#3f9a6c}
          #oh-top .oh-status{margin-left:auto;color:#8fa0bd;font-size:12px;font-family:ui-monospace,monospace}
          #oh-top .oh-flash{color:#8fe0a0;font-size:12px;margin-left:10px}
          #oh-rail{position:fixed;top:48px;left:8px;z-index:9000;display:none;flex-direction:column;gap:6px;width:120px;font:12px sans-serif;color:#dbe4f3}
          #oh-rail .grp{position:relative}
          #oh-rail .hd{background:#1c2536;border:1px solid #34425e;border-radius:7px;padding:7px 9px;cursor:default;display:flex;justify-content:space-between;align-items:center}
          #oh-rail .hd b{font-weight:600} #oh-rail .hd .cur{color:#9fb0cc;font-size:11px;max-width:56px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
          #oh-rail .btn{background:#243049;border:1px solid #3a4a6b;border-radius:7px;padding:7px 9px;cursor:pointer;text-align:left}
          #oh-rail .btn.on{background:#3a5a8c;border-color:#5573ad}
          .oh-fly{position:absolute;left:124px;top:0;min-width:168px;max-height:74vh;overflow:auto;background:#1a2233;border:1px solid #3a4a6b;border-radius:8px;padding:6px;display:none;z-index:9100;box-shadow:5px 6px 20px rgba(0,0,0,.55)}
          #oh-rail .grp:hover>.oh-fly{display:block}
          .oh-fly .opt{display:flex;align-items:center;gap:7px;padding:5px 7px;border-radius:5px;cursor:pointer}
          .oh-fly .opt:hover{background:#2a3852} .oh-fly .opt.sel{background:#3a5a8c}
          .oh-fly .opt.small{padding:4px 7px} .oh-sw{width:16px;height:16px;border-radius:3px;border:1px solid rgba(255,255,255,.3);flex:none}
          #oh-create-modal{position:fixed;inset:0;z-index:9500;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.65)}
          .ohc-panel{background:#141a26;border:1px solid #2c3648;border-radius:12px;padding:20px 22px;min-width:320px;color:#e8eef7;font:14px sans-serif}
          .ohc-panel h2{margin:0 0 12px} .ohc-panel label{display:block;margin:8px 0;font-size:13px}
          .ohc-panel select,.ohc-panel input{width:100%;background:#1c2230;border:1px solid #3a465c;color:#e8eef7;border-radius:6px;padding:6px;margin-top:3px}
          .ohc-btns{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}
          .ohc-btns button{background:#2b3548;border:1px solid #46557a;color:#dfe7f5;border-radius:6px;padding:7px 16px;cursor:pointer} .ohc-btns button.primary{background:#2e6f4e;border-color:#3f9a6c}`;
        document.head.appendChild(s);
      }
      if (!document.getElementById('oh-top')) { const t = document.createElement('div'); t.id = 'oh-top'; document.body.appendChild(t); }
      if (!document.getElementById('oh-rail')) { const r = document.createElement('div'); r.id = 'oh-rail'; document.body.appendChild(r); }
    },
    _showChrome(on) { ['oh-top', 'oh-rail'].forEach((id, i) => { const el = document.getElementById(id); if (el) el.style.display = on ? (i ? 'flex' : 'flex') : 'none'; }); },

    _renderBar() {
      const top = document.getElementById('oh-top'), rail = document.getElementById('oh-rail');
      if (!top || !rail) return;
      const m = this.world.mapSnapshot;
      // TOP: commands (save/exit kept at the top, as before).
      top.innerHTML = `
        <button id="oh-undo" title="Undo (Ctrl+Z)">↶ Undo</button>
        <button id="oh-redo" title="Redo (Ctrl+Y)">↷ Redo</button>
        <button id="oh-zout" title="Zoom out (−)">－</button>
        <button id="oh-zin" title="Zoom in (=)">＋</button>
        <button id="oh-settings">⚙ Settings</button>
        <button id="oh-test">▶ Test</button>
        <button id="oh-save" class="primary">💾 Save</button>
        <button id="oh-exit">✕ Exit</button>
        <span style="margin-left:12px;display:flex;gap:10px;align-items:center;font-size:12px">
          <label><input type="checkbox" id="oh-v-buildings" ${this.view.buildings ? 'checked' : ''}> Buildings</label>
          <label><input type="checkbox" id="oh-v-mobs" ${this.view.mobs ? 'checked' : ''}> Mobs</label>
          <label><input type="checkbox" id="oh-v-items" ${this.view.items ? 'checked' : ''}> Items</label>
          <label><input type="checkbox" id="oh-v-elev" ${this.view.elev ? 'checked' : ''}> Elevation map</label>
        </span>
        <span class="oh-status">${this._esc(this.world.name)} · ${m.baseW || m.gridW}×${m.baseH || m.gridH} @ d${m.density} · ${this._shift ? 'erase' : this.tool} @ elev ${this.elevLevel}</span>
        <span class="oh-flash" id="oh-flash"></span>`;
      // LEFT RAIL: Brush / Elevation / Erase, then the four palette tabs (hover to open).
      const swatch = (c) => `<span class="oh-sw" style="background:${c}"></span>`;
      const terrOpts = P().OH_TERRAIN.map((t) => `<div class="opt ${this.tool === 'terrain' && this.terrainKey === t.key ? 'sel' : ''}" data-terr="${t.key}">${swatch(t.color)}${t.name}</div>`).join('');
      const bTypes = (typeof OH_BUILDINGS !== 'undefined') ? OH_BUILDINGS.all().map((d) => d.id) : ['healer'];
      const buildOpts = bTypes.map((b) => `<div class="opt ${this.tool === 'building' && this.buildingType === b ? 'sel' : ''}" data-build="${b}">🏛 ${b}</div>`).join('')
        + `<div class="opt ${this.tool === 'spawn' ? 'sel' : ''}" data-spawn="1">🚩 Player Spawn</div><div class="opt ${this.tool === 'goal' ? 'sel' : ''}" data-goal="1">★ Goal Star</div>`
        + `<div class="opt ${this.tool === 'ramp' ? 'sel' : ''}" data-ramp="ramp">⟋ Ramp</div><div class="opt ${this.tool === 'ladder' ? 'sel' : ''}" data-ramp="ladder">🪜 Ladder</div>`
        + `<div class="opt ${this.tool === 'tree' ? 'sel' : ''}" data-tree="1">🌳 Tree (prefab)</div>`;
      const mobOpts = P().OH_MOBS.map((mm) => `<div class="opt ${this.tool === 'mob' && this.mobKey === mm.key ? 'sel' : ''}" data-mob="${mm.key}">${swatch(mm.color)}${mm.name}</div>`).join('');
      const itemOpts = P().OH_ITEMS.map((i) => `<div class="opt ${this.tool === 'item' && this.itemKey === i.key ? 'sel' : ''}" data-item="${i.key}">${swatch(i.color)}${i.name}</div>`).join('');
      const grp = (label, cur, opts) => `<div class="grp"><div class="hd"><b>${label} ▸</b><span class="cur">${cur}</span></div><div class="oh-fly">${opts}</div></div>`;
      const shapeOpts = [['freehand', 'Freehand'], ['line', 'Line'], ['rect', 'Rectangle'], ['circle', 'Circle / Oval']].map(([k, n]) => `<div class="opt small ${this.shape === k ? 'sel' : ''}" data-shape="${k}">${n}</div>`).join('')
        + `<div class="opt small ${this.shapeFill ? 'sel' : ''}" data-fill="1">${this.shapeFill ? '☑' : '☐'} Fill (else outline = brush width)</div>`;
      rail.innerHTML =
        `<div class="btn ${this.tool === 'hand' ? 'on' : ''}" id="oh-hand">✋ Hand (drag to pan · click to configure)</div>` +
        grp('Brush', this.brush + '×' + this.brush, [1, 2, 3, 5, 8].map((b) => `<div class="opt small ${b === this.brush ? 'sel' : ''}" data-brush="${b}">${b}×${b}</div>`).join('')) +
        grp('Shape', this.shape === 'freehand' ? 'Freehand' : (this.shape + (this.shapeFill ? ' fill' : ' line')), shapeOpts) +
        grp('Elevation', 'Lvl ' + this.elevLevel, [0, 1, 2, 3, 4, 5, 6, 7, 8].map((l) => `<div class="opt small ${l === this.elevLevel ? 'sel' : ''}" data-elev="${l}">Level ${l}</div>`).join('')) +
        `<div class="btn ${this.tool === 'erase' ? 'on' : ''}" id="oh-erase">Erase (or ⇧-click)</div>` +
        grp('Terrain', this.tool === 'terrain' ? P().OH_TERRAIN_BY_KEY[this.terrainKey].name : '', terrOpts) +
        grp('Buildings', (this.tool === 'building' ? this.buildingType : this.tool === 'spawn' ? 'Spawn' : this.tool === 'goal' ? 'Goal' : ''), buildOpts) +
        grp('Mobs', this.tool === 'mob' ? P().OH_MOB_BY_KEY[this.mobKey].name : '', mobOpts) +
        grp('Items', this.tool === 'item' ? P().OH_ITEM_BY_KEY[this.itemKey].name : '', itemOpts);
      const g = (id) => document.getElementById(id);
      g('oh-undo').onclick = () => this.undo(); g('oh-redo').onclick = () => this.redo();
      g('oh-zin').onclick = () => OH_GRID.zoomBy(this.grid, 1.15); g('oh-zout').onclick = () => OH_GRID.zoomBy(this.grid, 0.87);
      g('oh-test').onclick = () => this._test(); g('oh-save').onclick = () => this._save(); g('oh-exit').onclick = () => this.close();
      g('oh-settings').onclick = () => { if (typeof OH_WORLD_SETTINGS !== 'undefined') OH_WORLD_SETTINGS.open(this.world, () => this._renderBar()); };
      ['buildings', 'mobs', 'items', 'elev'].forEach((k) => { const el = g('oh-v-' + k); if (el) el.onchange = () => { this.view[k] = el.checked; }; });
      g('oh-erase').onclick = () => { this.tool = 'erase'; this._renderBar(); };
      g('oh-hand').onclick = () => { this.tool = 'hand'; this._renderBar(); };
      rail.querySelectorAll('[data-brush]').forEach((el) => el.onclick = () => { this.brush = +el.dataset.brush; this._renderBar(); });
      rail.querySelectorAll('[data-shape]').forEach((el) => el.onclick = () => { this.shape = el.dataset.shape; this._renderBar(); });
      rail.querySelectorAll('[data-fill]').forEach((el) => el.onclick = () => { this.shapeFill = !this.shapeFill; this._renderBar(); });
      rail.querySelectorAll('[data-elev]').forEach((el) => el.onclick = () => { this.elevLevel = +el.dataset.elev; this._renderBar(); });
      rail.querySelectorAll('[data-terr]').forEach((el) => el.onclick = () => { this.tool = 'terrain'; this.terrainKey = el.dataset.terr; this._renderBar(); });
      rail.querySelectorAll('[data-build]').forEach((el) => el.onclick = () => { this.tool = 'building'; this.buildingType = el.dataset.build; this._renderBar(); });
      rail.querySelectorAll('[data-spawn]').forEach((el) => el.onclick = () => { this.tool = 'spawn'; this._renderBar(); });
      rail.querySelectorAll('[data-goal]').forEach((el) => el.onclick = () => { this.tool = 'goal'; this._renderBar(); });
      rail.querySelectorAll('[data-ramp]').forEach((el) => el.onclick = () => { this.tool = el.dataset.ramp; this._renderBar(); });
      rail.querySelectorAll('[data-tree]').forEach((el) => el.onclick = () => { this.tool = 'tree'; this._renderBar(); });
      rail.querySelectorAll('[data-mob]').forEach((el) => el.onclick = () => { this.tool = 'mob'; this.mobKey = el.dataset.mob; this._renderBar(); });
      rail.querySelectorAll('[data-item]').forEach((el) => el.onclick = () => { this.tool = 'item'; this.itemKey = el.dataset.item; this._renderBar(); });
    },
    _esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); },

    // ── Canvas interaction ──────────────────────────────────────────────────
    _bindCanvas() {
      const cv = document.getElementById('gameCanvas');
      this._md = (e) => {
        if (this.tool === 'hand') { const cv2 = document.getElementById('gameCanvas'); const rect = cv2.getBoundingClientRect(); this._pan = { cx: e.clientX, cy: e.clientY, camx: this.cam.x, camy: this.cam.y, sx: CANVAS_W / rect.width, sy: CANVAS_H / rect.height, moved: false, e }; if (cv2) cv2.style.cursor = 'grabbing'; return; }
        this._dragging = true; this._shift = e.shiftKey; this._lastCell = null;
        if (this._isShapeMode()) { const cel = this._cellFromEvent(e); this._shapeAnchor = cel; this._shapeEnd = cel; } else this._paintAt(e); };
      this._mm = (e) => {
        if (this._pan) { const dx = (e.clientX - this._pan.cx) * this._pan.sx / this.grid.masterZoom, dy = (e.clientY - this._pan.cy) * this._pan.sy / this.grid.masterZoom; if (Math.abs(e.clientX - this._pan.cx) + Math.abs(e.clientY - this._pan.cy) > 3) this._pan.moved = true; this.cam.x = this._pan.camx - dx; this.cam.y = this._pan.camy - dy; return; }
        if (!this._dragging) return; this._shift = e.shiftKey; if (this._isShapeMode()) this._shapeEnd = this._cellFromEvent(e); else this._paintLine(e); };
      this._mu = (e) => {
        if (this._pan) { const cv2 = document.getElementById('gameCanvas'); if (cv2) cv2.style.cursor = 'grab'; if (!this._pan.moved) { const cel = this._cellFromEvent(this._pan.e); this._handClick(cel.col, cel.row); } this._pan = null; return; }
        if (!this._dragging) return; this._dragging = false; this._lastCell = null; if (this._shapeAnchor) { this._commitShape(); this._shapeAnchor = this._shapeEnd = null; } this._pushHistory(); };
      this._wheel = (e) => { OH_GRID.zoomBy(this.grid, e.deltaY < 0 ? 1.1 : 0.9); e.preventDefault(); };
      this._kd = (e) => {
        const K = this.KEYS, pan = 48 / this.grid.masterZoom;
        if (e.code === 'ArrowLeft') this.cam.x -= pan; else if (e.code === 'ArrowRight') this.cam.x += pan;
        else if (e.code === 'ArrowUp') this.cam.y -= pan; else if (e.code === 'ArrowDown') this.cam.y += pan;
        else if (e.code === K.elevUp) { this.elevLevel = Math.min(8, this.elevLevel + 1); this._renderBar(); }
        else if (e.code === K.elevDown) { this.elevLevel = Math.max(0, this.elevLevel - 1); this._renderBar(); }
        else if (e.code === K.zoomIn) OH_GRID.zoomBy(this.grid, 1.12);
        else if (e.code === K.zoomOut) OH_GRID.zoomBy(this.grid, 0.9);
        else if (e.code === K.undo && (e.ctrlKey || e.metaKey)) { this.undo(); }
        else if (e.code === K.redo && (e.ctrlKey || e.metaKey)) { this.redo(); }
        else if (e.code === 'Escape') this.close();
      };
      cv.addEventListener('mousedown', this._md); cv.addEventListener('mousemove', this._mm);
      cv.addEventListener('wheel', this._wheel, { passive: false });
      window.addEventListener('mouseup', this._mu); window.addEventListener('keydown', this._kd);
    },
    _unbindCanvas() {
      const cv = document.getElementById('gameCanvas');
      if (cv) { cv.removeEventListener('mousedown', this._md); cv.removeEventListener('mousemove', this._mm); cv.removeEventListener('wheel', this._wheel); }
      window.removeEventListener('mouseup', this._mu); window.removeEventListener('keydown', this._kd);
    },

    _cellFromEvent(e) {
      const cv = document.getElementById('gameCanvas'); const rect = cv.getBoundingClientRect();
      const sx = (e.clientX - rect.left) * (CANVAS_W / rect.width), sy = (e.clientY - rect.top) * (CANVAS_H / rect.height);
      const w = OH_GRID.screenToWorld(this.grid, this.cam, sx, sy);
      return OH_GRID.cellAt(this.grid, w.x, w.y);
    },
    _paintAt(e) { const { col, row } = this._cellFromEvent(e); this._paintCell(col, row); this._lastCell = { col, row }; },
    // Paint every cell on the line from the previous painted cell to this one
    // (Bresenham) so a quick drag doesn't leave gaps.
    _paintLine(e) {
      const { col, row } = this._cellFromEvent(e);
      const last = this._lastCell;
      // Only terrain/erase interpolate along a drag; point tools (goal/spawn/
      // building/mob/item) act on the current cell only.
      if (!last || (this.tool !== 'terrain' && this.tool !== 'erase' && !this._shift)) { this._paintCell(col, row); this._lastCell = { col, row }; return; }
      let x0 = last.col, y0 = last.row; const x1 = col, y1 = row;
      const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx - dy, guard = 0;
      while (guard++ < 4000) { this._paintCell(x0, y0); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 > -dy) { err -= dy; x0 += sx; } if (e2 < dx) { err += dx; y0 += sy; } }
      this._lastCell = { col, row };
    },
    _isShapeMode() { return this.shape !== 'freehand' && (this.tool === 'terrain' || this.tool === 'erase' || this._shift); },
    // Single-cell terrain-or-erase op (shared by brush + shapes). Erase only
    // affects the selected elevation + clears entities/ramps at the cell.
    _opCell(c, r) {
      const m = this.world.mapSnapshot;
      if (c < 0 || r < 0 || c >= m.gridW || r >= m.gridH) return;
      if (this.tool === 'erase' || this._shift) {
        if ((m.elevation[r][c] | 0) === this.elevLevel) { m.ground[r][c] = 'grass'; m.elevation[r][c] = 0; }
        this.world.buildings = this.world.buildings.filter((b) => !(b.col === c && b.row === r));
        this.world.mobs = this.world.mobs.filter((x) => !(x.col === c && x.row === r));
        this.world.items = this.world.items.filter((x) => !(x.col === c && x.row === r));
        this.world.ramps = (this.world.ramps || []).filter((x) => !(x.col === c && x.row === r));
        return;
      }
      m.ground[r][c] = this.terrainKey; m.elevation[r][c] = this.elevLevel;
    },
    _paintCell(col, row) {
      if (this.tool === 'configure') { this._openConfigAt(col, row); return; }
      const m = this.world.mapSnapshot, half = Math.floor(this.brush / 2);
      const erasing = this.tool === 'erase' || this._shift;
      const apply = (fn) => { for (let dr = -half; dr <= half; dr++) for (let dc = -half; dc <= half; dc++) fn(col + dc, row + dr); };
      if (erasing || this.tool === 'terrain') { apply((c, r) => this._opCell(c, r)); return; }
      if (this.tool === 'tree') { this._stampTree(col, row); return; }
      if (this.tool === 'goal') { this.world.goal = { col, row }; }
      else if (this.tool === 'spawn') { this.world.spawns = [{ col, row }]; }
      else if (this.tool === 'ramp' || this.tool === 'ladder') { this.world.ramps = this.world.ramps || []; if (!this.world.ramps.some((x) => x.col === col && x.row === row)) this.world.ramps.push({ col, row, kind: this.tool }); }
      else if (this.tool === 'building') { if (!this.world.buildings.some((b) => b.col === col && b.row === row)) this.world.buildings.push(OH_BUILDINGS.place(this.buildingType, col, row, { level: this.elevLevel })); }
      else if (this.tool === 'mob') { const d = P().OH_MOB_BY_KEY[this.mobKey]; this.world.mobs.push({ col, row, type: this.mobKey, hp: d.hp, speed: d.speed, detect: d.detect }); }
      else if (this.tool === 'item') { this.world.items.push({ col, row, kind: P().OH_ITEM_BY_KEY[this.itemKey].kind, weapon: P().OH_ITEM_BY_KEY[this.itemKey].weapon, itemKey: this.itemKey }); }
    },
    _drawRampIcon(ctx, kind, cx, cy, s) { OVERHEAD.drawRampIcon(ctx, kind, cx, cy, s); },

    // Tree prefab: a 2-high log TRUNK (the centre cell, elev base+2 — levels 1&2 are
    // trunk) + a leaf canopy: an outer Ø5 ring at level 3 and an inner top ring at
    // level 4, both AROUND the trunk (never covering it). Placed relative to the
    // current elevation; higher placements just push the levels up (no hard cap).
    _stampTree(col, row) {
      const m = this.world.mapSnapshot, base = (m.elevation[row] ? (m.elevation[row][col] | 0) : 0);   // relative to the GROUND here, not the paint elevation
      const set = (c, r, key, e) => { if (c >= 0 && r >= 0 && c < m.gridW && r < m.gridH) { m.ground[r][c] = key; m.elevation[r][c] = e; } };
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        if (dc === 0 && dr === 0) continue;                 // never cover the trunk
        const d2 = dc * dc + dr * dr;
        if (d2 <= 2) set(col + dc, row + dr, 'leaves', base + 4);   // inner TOP ring (level 4)
        else if (d2 <= 5) set(col + dc, row + dr, 'leaves', base + 3); // outer canopy Ø5 (level 3)
      }
      set(col, row, 'log', base + 2);   // trunk (levels 1&2)
    },

    // ── Shapes (line / rect / circle-oval; fill or brush-width outline) ─────────
    _shapeCells(a, b) {
      const out = [];
      const c0 = Math.min(a.col, b.col), c1 = Math.max(a.col, b.col), r0 = Math.min(a.row, b.row), r1 = Math.max(a.row, b.row);
      if (this.shape === 'line') {
        let x = a.col, y = a.row; const dx = Math.abs(b.col - a.col), dy = Math.abs(b.row - a.row), sx = a.col < b.col ? 1 : -1, sy = a.row < b.row ? 1 : -1;
        let err = dx - dy, g = 0; while (g++ < 8000) { out.push({ c: x, r: y }); if (x === b.col && y === b.row) break; const e2 = 2 * err; if (e2 > -dy) { err -= dy; x += sx; } if (e2 < dx) { err += dx; y += sy; } }
      } else if (this.shape === 'rect') {
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const border = (c === c0 || c === c1 || r === r0 || r === r1); if (this.shapeFill || border) out.push({ c, r }); }
      } else { // circle / oval — ellipse inscribed in the drag box
        const cx = (c0 + c1) / 2, cy = (r0 + r1) / 2, rx = Math.max(0.5, (c1 - c0) / 2), ry = Math.max(0.5, (r1 - r0) / 2);
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const v = ((c - cx) / rx) ** 2 + ((r - cy) / ry) ** 2; if (v <= 1) { if (this.shapeFill) out.push({ c, r }); else { const inner = ((c - cx) / (rx - 1)) ** 2 + ((r - cy) / (ry - 1)) ** 2; if (!(rx > 1.5 && ry > 1.5 && inner <= 1)) out.push({ c, r }); } } }
      }
      return out;
    },
    _commitShape() {
      if (!this._shapeAnchor || !this._shapeEnd) return;
      const cells = this._shapeCells(this._shapeAnchor, this._shapeEnd);
      const half = (this.shape === 'line' || !this.shapeFill) ? Math.floor(this.brush / 2) : 0;   // brush = outline/line width
      for (const p of cells) { if (half > 0) { for (let dr = -half; dr <= half; dr++) for (let dc = -half; dc <= half; dc++) this._opCell(p.c + dc, p.r + dr); } else this._opCell(p.c, p.r); }
    },

    // ── Configuration modals (portal/pipe, goal star, spawn) ───────────────────
    _portalList() { let n = 0; return (this.world.buildings || []).filter((b) => b.typeId === 'portal' || b.typeId === 'pipe').map((b) => ({ key: b.col + ',' + b.row, n: ++n, label: '#' + n + ' ' + (b.typeId === 'pipe' ? 'Pipe' : 'Portal') + ' (' + b.col + ',' + b.row + ')' })); },
    _portalNum(b) { const p = this._portalList().find((x) => x.key === b.col + ',' + b.row); return p ? p.n : '?'; },
    _buildingAt(col, row) { return (this.world.buildings || []).find((b) => { const t = OH_BUILDINGS.get(b.typeId); const w = t ? t.footprint.w : 1, h = t ? t.footprint.h : 1; return col >= b.col && col < b.col + w && row >= b.row && row < b.row + h; }); },
    // Hand click: move a selected mob/item, else select one, else configure a
    // portal/goal/spawn. Selecting highlights; a second click moves + unselects
    // (clicking the same one again just unselects).
    _handClick(col, row) {
      if (this._selEnt) { const s = this._selEnt; if (s.ref.col === col && s.ref.row === row) { this._selEnt = null; } else { s.ref.col = col; s.ref.row = row; this._selEnt = null; this._pushHistory(); } return; }
      const mob = (this.world.mobs || []).find((m) => m.col === col && m.row === row);
      if (mob) { this._selEnt = { kind: 'mob', ref: mob }; return; }
      const item = (this.world.items || []).find((it) => it.col === col && it.row === row);
      if (item) { this._selEnt = { kind: 'item', ref: item }; return; }
      this._openConfigAt(col, row);
    },
    _openConfigAt(col, row) {
      const b = this._buildingAt(col, row);
      if (b && (b.typeId === 'portal' || b.typeId === 'pipe')) return this._portalModal(b);
      if (this.world.goal && this.world.goal.col === col && this.world.goal.row === row) return this._goalModal();
      const sp = (this.world.spawns || []).find((s) => s.col === col && s.row === row);
      if (sp) return this._spawnModal(sp);
      this._flash('Nothing to configure here — click a portal/pipe, goal, or spawn.');
    },
    _cfgModal(title, inner, onSave) {
      let ov = document.getElementById('oh-cfg-modal');
      if (!ov) { ov = document.createElement('div'); ov.id = 'oh-cfg-modal'; ov.style.cssText = 'position:fixed;inset:0;z-index:9550;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6)'; document.body.appendChild(ov); }
      ov.style.display = 'flex';
      ov.innerHTML = `<div class="ohc-panel"><h2>${title}</h2>${inner}<div class="ohc-btns"><button id="cfg-cancel">Cancel</button><button class="primary" id="cfg-save">Save</button></div></div>`;
      document.getElementById('cfg-cancel').onclick = () => { ov.style.display = 'none'; };
      document.getElementById('cfg-save').onclick = () => { try { onSave(); } catch (e) {} ov.style.display = 'none'; };
    },
    _portalModal(b) {
      b.config = b.config || {};
      const others = this._portalList().filter((p) => p.key !== b.col + ',' + b.row);
      const opts = `<option value="">(none)</option>` + others.map((p) => `<option value="${p.key}" ${b.config.dest === p.key ? 'selected' : ''}>${p.label}</option>`).join('');
      this._cfgModal((b.typeId === 'pipe' ? 'Pipe' : 'Portal') + ' @' + b.col + ',' + b.row,
        `<label>Teleport destination <select id="cfg-dest">${opts}</select></label>
         <label style="display:flex;gap:8px;align-items:center;margin-top:8px"><input type="checkbox" id="cfg-two" ${b.config.twoWay ? 'checked' : ''}> Two-way (also link the destination back here)</label>
         <label style="display:flex;gap:8px;align-items:center;margin-top:8px"><input type="checkbox" id="cfg-goal" ${b.config.isGoal ? 'checked' : ''}> Entering this ends the level (acts as a Goal Star)</label>
         <p style="color:#8fa0bd;font-size:12px">Use with the E button near the portal. Two-way links the other end back so it works in both directions. A Player Spawn can be linked to a portal so the player emerges from it (configure the spawn).</p>`,
        () => { const dest = document.getElementById('cfg-dest').value || null; b.config.dest = dest; b.config.isGoal = document.getElementById('cfg-goal').checked; b.config.twoWay = document.getElementById('cfg-two').checked;
          if (b.config.twoWay && dest) { const other = (this.world.buildings || []).find((x) => (x.col + ',' + x.row) === dest); if (other) { other.config = other.config || {}; other.config.dest = b.col + ',' + b.row; } } });
    },
    _goalModal() {
      const colors = (typeof GOAL_COLORS !== 'undefined') ? GOAL_COLORS : [{ name: 'Gold', hex: '#ffd700' }];
      const cur = this.world.goal.color || 0;
      const opts = colors.map((c, i) => `<option value="${i}" ${cur === i ? 'selected' : ''}>Goal Star ${i + 1} — ${c.name}</option>`).join('');
      this._cfgModal('Goal Star', `<label>Colour (campaign routing) <select id="cfg-color">${opts}</select></label>
        <p style="color:#8fa0bd;font-size:12px">Campaign mode routes each coloured Goal Star to a different next level.</p>`,
        () => { this.world.goal.color = parseInt(document.getElementById('cfg-color').value, 10) || 0; });
    },
    _spawnModal(sp) {
      const portals = this._portalList();
      const opts = `<option value="">(start on the ground)</option>` + portals.map((p) => `<option value="${p.key}" ${sp.fromPortal === p.key ? 'selected' : ''}>${p.label}</option>`).join('');
      this._cfgModal('Player Spawn', `<label>Emerge from a portal <select id="cfg-from">${opts}</select></label>
        <p style="color:#8fa0bd;font-size:12px">Link a portal/pipe and the player starts the level coming out of it.</p>`,
        () => { sp.fromPortal = document.getElementById('cfg-from').value || null; });
    },

    // ── Actions ───────────────────────────────────────────────────────────────
    _test() {
      this._running = false; this._unbindCanvas(); this._showChrome(false);
      const draft = JSON.parse(JSON.stringify(this.world));
      OVERHEAD.launchWorld(draft, { testMode: true }, () => { if (window.game && window.game.destroy) window.game.destroy(); window.game = null; this._reopen(); });
    },
    _reopen() {
      this._showChrome(true);
      if (document.body) { document.body.classList.add('in-game'); window.dispatchEvent(new Event('resize')); }
      this._bindCanvas(); this._renderBar(); this._running = true; requestAnimationFrame(this._loop);
    },

    async _save() {
      const worldData = Object.assign({}, this.world, { viewMode: 'overhead', gameModeDefault: 'NRM' });
      const name = this.world.name || 'Overhead World';
      try {
        if (typeof APP_MODE !== 'undefined' && APP_MODE.isLocal()) {
          // Offline fallback — localStorage (server unavailable).
          const all = JSON.parse(localStorage.getItem('steveo_overhead_worlds') || '{}');
          const key = this.worldId || ('oh-' + name); all[key] = worldData; this.worldId = key;
          localStorage.setItem('steveo_overhead_worlds', JSON.stringify(all));
          this._flash('Saved (offline)'); return;
        }
        if (!this.worldId) {
          // Mint a server row (dummy side-view size — overwritten by the PUT below),
          // then store the real overhead world_data. No server change needed.
          const cr = await AUTH.authedFetch('/api/worlds/sandbox/create', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ worldName: name, description: 'Overhead world', worldWidth: 25, worldHeight: 15, gameModeDefault: 'NRM' }) });
          const row = await cr.json(); if (!cr.ok) throw new Error(row.error || 'create failed');
          this.worldId = row.id;
        }
        const res = await AUTH.authedFetch('/api/worlds/sandbox/' + this.worldId, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ worldData, worldName: name }) });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'save failed'); }
        this._flash('Saved ✓');
      } catch (e) { this._flash('Save failed: ' + e.message); }
    },
    _flash(msg) { const f = document.getElementById('oh-flash'); if (f) { f.textContent = msg; setTimeout(() => { if (f) f.textContent = ''; }, 2600); } },

    // ── Render loop ─────────────────────────────────────────────────────────
    _loop() { if (!this._running) return; try { this._render(); } catch (e) { console.error('OH editor', e); } requestAnimationFrame(this._loop); },
    _render() {
      const cv = document.getElementById('gameCanvas'); const ctx = cv.getContext('2d');
      const g = this.grid, m = this.world.mapSnapshot, z = g.masterZoom, cs = g.cell * z;
      this.cam = OH_GRID.clampCamera(g, this.cam, CANVAS_W, CANVAS_H);
      ctx.fillStyle = '#0c0f16'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      const S = (wx, wy) => OH_GRID.worldToScreen(g, this.cam, wx, wy);
      const tl = OH_GRID.screenToWorld(g, this.cam, 0, 0), br = OH_GRID.screenToWorld(g, this.cam, CANVAS_W, CANVAS_H);
      const c0 = Math.max(0, (tl.x / g.cell | 0) - 1), c1 = Math.min(m.gridW - 1, (br.x / g.cell | 0) + 1);
      const r0 = Math.max(0, (tl.y / g.cell | 0) - 1), r1 = Math.min(m.gridH - 1, (br.y / g.cell | 0) + 1);
      const Q = OVERHEAD.elevOffset(cs);
      // Stacked-cube terrain, back-to-front (r+c then elev), matching the runtime.
      const cells = [];
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) cells.push({ c, r, key: m.ground[r][c] || 'grass', e: m.elevation[r][c] | 0 });
      cells.sort((a, b) => (a.r + a.c) - (b.r + b.c) || a.e - b.e);
      // Elevation-map view: flat top-down tiles shaded purple(low)→pink(high).
      let maxE = 1; for (const cl of cells) if (cl.e > maxE) maxE = cl.e;
      for (const cl of cells) {
        const sp = S(cl.c * g.cell, cl.r * g.cell);
        if (this.view.elev) {
          ctx.fillStyle = OVERHEAD.elevMapColor(cl.e, maxE); ctx.fillRect(sp.x, sp.y, cs + 1, cs + 1);
          ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.strokeRect(sp.x + .5, sp.y + .5, cs, cs);
          if (cl.e === this.elevLevel) { ctx.strokeStyle = 'rgba(255,255,150,.9)'; ctx.lineWidth = 2; ctx.strokeRect(sp.x + 1, sp.y + 1, cs - 2, cs - 2); }
          if (cs > 12) { ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = `${Math.max(7, cs * 0.3) | 0}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText(String(cl.e), sp.x + cs / 2, sp.y + cs * 0.62); }
          continue;
        }
        const sN = (cl.r + 1 <= m.gridH - 1) ? (m.elevation[cl.r + 1][cl.c] | 0) : -1, eN = (cl.c + 1 <= m.gridW - 1) ? (m.elevation[cl.r][cl.c + 1] | 0) : -1;
        OVERHEAD.drawTerrainCube(ctx, cl.key, sp.x, sp.y, cs, cl.e, sN < cl.e, eN < cl.e);
        const tx = sp.x - cl.e * Q, ty = sp.y - cl.e * Q;
        if (cl.e === this.elevLevel && cl.e >= 0) { ctx.fillStyle = 'rgba(255,255,150,.22)'; ctx.fillRect(tx, ty, cs, cs); }   // highlight the active elevation
        if (cl.e > 0 && cs > 12) { ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = `${Math.max(7, cs * 0.28) | 0}px sans-serif`; ctx.textAlign = 'left'; ctx.fillText(String(cl.e), tx + 2, ty + Math.max(9, cs * 0.36)); }
      }
      // Entities.
      const unitPx = g.cell * (g.density || 1) * g.masterZoom;   // player-scale in editor px
      if (this.view.buildings) for (const b of this.world.buildings) { const t = OH_BUILDINGS.get(b.typeId); const w = (t ? t.footprint.w : 1) * cs, h = (t ? t.footprint.h : 1) * cs; const lv = (b.level || 0); const sp = S(b.col * g.cell, b.row * g.cell); const bx = sp.x - lv * Q, by = sp.y - lv * Q; OVERHEAD.drawBuilding(ctx, b.typeId, bx, by, w, h, Math.min(1, cs / 28), b.skin || 'default');
        if (b.typeId === 'portal' || b.typeId === 'pipe') { const br = Math.max(11, cs * 0.5), cyN = by + cs * 0.4; ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.beginPath(); ctx.arc(bx + w / 2, cyN, br, 0, 7); ctx.fill(); ctx.strokeStyle = '#b56bde'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.max(12, cs * 0.55) | 0}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('#' + this._portalNum(b), bx + w / 2, cyN); ctx.textBaseline = 'alphabetic'; } }
      if (this.view.mobs) for (const mo of this.world.mobs) { const d = P().OH_MOB_BY_KEY[mo.type] || P().OH_MOBS[0]; const sp = S((mo.col + 0.5) * g.cell, (mo.row + 0.5) * g.cell); ctx.strokeStyle = 'rgba(150,150,160,.9)'; ctx.lineWidth = 2; ctx.fillStyle = d.color; ctx.beginPath(); ctx.arc(sp.x, sp.y, unitPx * 0.34, 0, 7); ctx.fill(); ctx.stroke(); }
      if (this.view.items) for (const it of this.world.items) { const sp = S((it.col + 0.5) * g.cell, (it.row + 0.5) * g.cell); OVERHEAD.drawItemSprite(ctx, it.itemKey, sp.x, sp.y, unitPx * 0.8); }
      for (const spn of (this.world.spawns || [])) { const sp = S((spn.col + 0.5) * g.cell, (spn.row + 0.5) * g.cell); ctx.strokeStyle = '#4aa3ff'; ctx.lineWidth = 2; ctx.strokeRect(sp.x - cs * 0.42, sp.y - cs * 0.42, cs * 0.84, cs * 0.84); if (cs > 14) { ctx.fillStyle = '#4aa3ff'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('P1', sp.x, sp.y + 3); } }
      for (const rp of (this.world.ramps || [])) { const sp = S((rp.col + 0.5) * g.cell, (rp.row + 0.5) * g.cell); const dir = OVERHEAD.rampDir((c, r) => (m.elevation[r] ? (m.elevation[r][c] | 0) : 0), rp.col, rp.row); OVERHEAD.drawRampIcon(ctx, rp.kind, sp.x, sp.y, cs, dir); }
      if (this.world.goal) { const gc = (typeof GOAL_COLORS !== 'undefined' && GOAL_COLORS[this.world.goal.color || 0]) || { hex: '#ffd700' }; const sp = S((this.world.goal.col + 1) * g.cell, (this.world.goal.row + 1) * g.cell); ctx.fillStyle = gc.hex; ctx.font = `${(cs * 1.8) | 0}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('★', sp.x, sp.y + cs * 0.6); }
      // Hand-selected mob/item highlight (moveable — click a new spot to move it).
      if (this._selEnt && this.tool === 'hand') { const s = this._selEnt.ref; const sp = S((s.col + 0.5) * g.cell, (s.row + 0.5) * g.cell); const pulse = 0.5 + 0.3 * Math.sin(Date.now() / 150); ctx.strokeStyle = `rgba(120,220,255,${pulse})`; ctx.lineWidth = 3; ctx.strokeRect(sp.x - cs * 0.5, sp.y - cs * 0.5, cs, cs); ctx.fillStyle = 'rgba(120,220,255,.85)'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('click to move', sp.x, sp.y - cs * 0.6); }
      // Distinct MAP-EDGE indicator (hazard stripes just outside the world bounds)
      // so the creator knows when they're looking at the real edge — deliberately
      // NOT a block look.
      this._drawMapEdge(ctx, S, m.gridW * g.cell, m.gridH * g.cell);
      // Live shape preview while dragging.
      if (this._shapeAnchor && this._shapeEnd) { ctx.fillStyle = 'rgba(120,180,255,.4)'; for (const p of this._shapeCells(this._shapeAnchor, this._shapeEnd)) { const sp = S(p.c * g.cell, p.r * g.cell); ctx.fillRect(sp.x, sp.y, cs, cs); } }
      // Info line.
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.textAlign = 'left'; ctx.font = '12px sans-serif';
      ctx.fillText(`${this.world.name} · ${m.baseW || m.gridW}×${m.baseH || m.gridH} @ density ${m.density} (${m.gridW}×${m.gridH} cells) · ${this.world.mode} · tool: ${this._shift ? 'erase' : this.tool} @ elev ${this.elevLevel}`, 158, CANVAS_H - 10);
    },
    // Yellow/black hazard stripes in a band just OUTSIDE each world edge.
    _drawMapEdge(ctx, S, worldW, worldH) {
      const tl = S(0, 0), brc = S(worldW, worldH); const W = 12;
      const band = (x, y, w, h, horiz) => {
        if (w <= 0 || h <= 0) return;
        ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
        ctx.fillStyle = '#111'; ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 5;
        const len = Math.max(w, h) + h + w; for (let i = -h; i < len; i += 14) { ctx.beginPath(); ctx.moveTo(x + i, y); ctx.lineTo(x + i - h, y + h); ctx.stroke(); }
        ctx.restore();
      };
      band(tl.x - W, tl.y - W, brc.x - tl.x + 2 * W, W);          // top
      band(tl.x - W, brc.y, brc.x - tl.x + 2 * W, W);            // bottom
      band(tl.x - W, tl.y, W, brc.y - tl.y);                     // left
      band(brc.x, tl.y, W, brc.y - tl.y);                       // right
    },
    list() { try { return Object.keys(JSON.parse(localStorage.getItem('steveo_overhead_worlds') || '{}')); } catch (e) { return []; } },
  };

  if (typeof window !== 'undefined') window.OH_EDITOR = OH_EDITOR;
})();
