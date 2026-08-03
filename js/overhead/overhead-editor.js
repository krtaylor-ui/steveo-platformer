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
    // Devices that TRANSMIT a numbered channel (sources + logic gates). Dust is pure
    // wire; sinks (lamp/piston/rx) receive — none of these transmit, so no Tx number.
    _TX_KINDS: { lever: 1, button: 1, plate: 1, weight: 1, lock: 1, and: 1, not: 1, nor: 1, tx: 1 },
    worldId: null,                 // server world id (null until first save)
    tab: 'terrain',                // active palette tab
    tool: 'terrain',               // terrain | building | mob | item | spawn
    terrainKey: 'grass', buildingType: 'healer', mobKey: 'zombie', itemKey: 'coin',
    elevLevel: 1, brush: 1,
    shape: 'freehand',             // freehand | line | rect | circle
    shapeFill: false,              // false = outline (brush = width) | true = filled
    _bridgeDraw: false, _bridgeStart: null,   // bridge tool: two-click SPAN placement (from → to)
    _scatter: 0,          // 0 = solid paint; 0.25/0.5/0.75 = place each cell with that chance
    _sel: null,           // Set of 'c,r' currently selected (+ _selBox bounds)
    _selBox: null, _marquee: null, _selecting: false,   // marquee drag state
    _clip: null, _pasting: false,   // clipboard pattern + paste mode
    view: { mobs: true, items: true, buildings: true, elev: false, hideAbove: false, focusLayer: true, airGhosts: false },   // top-bar view filters
    // Customizable menu bars: which palette groups sit on the LEFT vs RIGHT rail (+ order),
    // each rail's width, and which groups are pinned open. Persisted per-user in localStorage.
    _ALL_GROUPS: ['Elevation', 'Brush', 'Shape', 'Terrain', 'Mobs', 'Items', 'Buildings', 'Templates', 'Redstone'],
    _defaultLayout() { return { left: this._ALL_GROUPS.slice(), right: [], leftWidth: 120, rightWidth: 0, pinned: {} }; },
    _loadLayout() {
      let L = this._defaultLayout();
      try { const s = JSON.parse(localStorage.getItem('steveo_oh_rail_layout') || 'null'); if (s && s.left && s.right) { L = Object.assign(L, s); L.pinned = s.pinned || {}; } } catch (e) {}
      // make sure every known group appears exactly once (add new ones to the left)
      const seen = new Set([...L.left, ...L.right]); for (const gp of this._ALL_GROUPS) if (!seen.has(gp)) L.left.push(gp);
      L.left = L.left.filter((gp) => this._ALL_GROUPS.indexOf(gp) >= 0); L.right = L.right.filter((gp) => this._ALL_GROUPS.indexOf(gp) >= 0);
      this._railLayout = L;
    },
    _saveLayout() { try { localStorage.setItem('steveo_oh_rail_layout', JSON.stringify(this._railLayout)); } catch (e) {} },
    _moveGroup(src, target) {   // drop `src` before `target` (in target's rail)
      if (!src || src === target) return; const L = this._railLayout;
      L.left = L.left.filter((x) => x !== src); L.right = L.right.filter((x) => x !== src);
      const side = L.right.indexOf(target) >= 0 ? 'right' : 'left', arr = L[side], idx = arr.indexOf(target);
      arr.splice(idx >= 0 ? idx : arr.length, 0, src);
      if (side === 'right' && !L.rightWidth) L.rightWidth = 160;
      this._saveLayout(); this._renderBar();
    },
    _moveGroupToRail(src, side) {   // drop onto a rail's pad → append to that rail
      if (!src) return; const L = this._railLayout;
      L.left = L.left.filter((x) => x !== src); L.right = L.right.filter((x) => x !== src);
      (side === 'right' ? L.right : L.left).push(src);
      if (side === 'right' && !L.rightWidth) L.rightWidth = 160;
      this._saveLayout(); this._renderBar();
    },
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
        // Normalise settings on load so the editor menu + Save reflect migrations the
        // runtime already applies (e.g. legacy lavaDeadly → lavaMode) — otherwise the
        // menu shows the raw default and re-saving would silently drop the old value.
        if (typeof OH_SETTINGS !== 'undefined' && OH_SETTINGS.resolve) this.world.settings = OH_SETTINGS.resolve(this.world);
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
        controlScheme: scheme, angleLockDeg: 0, rules: {},
        mapSnapshot: { gridW: W, gridH: H, density, baseW, baseH, cell, objectScaleMode: 'independent', ground, elevation, decorations: [] },
        buildings: [], mobs: [], items: [], spawns: [{ col: 1, row: H - 2 }], ramps: [], bridges: [], redstone: [],
        goal: null,
        settings: (typeof OH_SETTINGS !== 'undefined') ? OH_SETTINGS.defaults() : {},
      };
    },

    // ── History (undo/redo) ─────────────────────────────────────────────────
    _snapshot() { return JSON.stringify({ map: this.world.mapSnapshot, b: this.world.buildings, m: this.world.mobs, i: this.world.items, s: this.world.spawns, g: this.world.goal, r: this.world.ramps, br: this.world.bridges, ga: this.world.gates, rs: this.world.redstone, set: this.world.settings, ts: this.world.templateStamps, tpl: this.world.templates }); },
    // History captures CONTENT + SETTINGS only (never zoom/scroll — those don't
    // snapshot). Each entry carries a description for the undo/redo notification.
    _pushHistory(desc) {
      const s = this._snapshot();
      if (this._hist[this._histPos] && this._hist[this._histPos].s === s) return;   // no real change → no entry
      this._hist = this._hist.slice(0, this._histPos + 1);
      this._hist.push({ s, d: desc || 'edit' }); this._histPos = this._hist.length - 1;
      if (this._hist.length > 60) { this._hist.shift(); this._histPos--; }
      // Keep the terrain cache current WITHOUT a full rebuild: patch just the touched region.
      // (_editBox is the bounding box of cells changed since the last commit.) If there is no
      // cache yet, or the map grew taller than the cache pad allows, fall back to a full rebuild.
      if (this._editBox) { if (!this._patchTerrCache(this._editBox)) this._terrRev = (this._terrRev || 0) + 1; this._editBox = null; }
    },
    _mapMaxElev() { const m = this.world.mapSnapshot; let mx = 1; for (let r = 0; r < m.gridH; r++) { const row = m.elevation[r]; if (row) for (let c = 0; c < m.gridW; c++) if ((row[c] | 0) > mx) mx = row[c] | 0; } return mx; },
    _markDirty(c, r) { const b = this._editBox; if (!b) this._editBox = { c0: c, r0: r, c1: c, r1: r }; else { if (c < b.c0) b.c0 = c; if (c > b.c1) b.c1 = c; if (r < b.r0) b.r0 = r; if (r > b.r1) b.r1 = r; } },
    // Hide-above-elev SLICE: a cell taller than the active level draws CAPPED at that level
    // (so you see the block underneath) instead of vanishing to black.
    _capE(e) { return (this.view.hideAbove && e > this.elevLevel) ? this.elevLevel : e; },
    // Repaint one terrain region in back-to-front order into a target context. `orig(c,r)`
    // gives the footprint top-left pixel of cell (c,r); `unit` is the cell size; `qf` the elev
    // offset. The cube's top + side faces sit UP-LEFT of the footprint by up to maxE*qf, so we
    // clear the WHOLE clip region (footprint + that up-left margin) and redraw every cell whose
    // cube can fall inside it (extending the set up-left to refill the margin). Outer cells are
    // unchanged, so any clip-cut at the boundary lands on identical pixels — no stale tops/sides
    // (the "black shadow" left when lowering a tall block). Shared by the live overlay + cache patch.
    _paintTerrainRegion(cx, orig, unit, qf, maxE, box, opts) {
      const m = this.world.mapSnapshot, reach = Math.ceil(maxE * 0.22) + 3;
      const c0 = Math.max(0, box.c0 - reach), r0 = Math.max(0, box.r0 - reach), c1 = Math.min(m.gridW - 1, box.c1 + reach), r1 = Math.min(m.gridH - 1, box.r1 + reach);
      const up = maxE * qf + unit, cr0 = orig(c0, r0), cr1 = orig(c1 + 1, r1 + 1);
      const rx = cr0.x - up, ry = cr0.y - up, rw = (cr1.x - cr0.x) + up + 2, rh = (cr1.y - cr0.y) + up + 2;
      cx.save();
      cx.beginPath(); cx.rect(rx, ry, rw, rh); cx.clip();
      if (opts.clearStyle) { cx.fillStyle = opts.clearStyle; cx.fillRect(rx, ry, rw, rh); } else cx.clearRect(rx, ry, rw, rh);
      const mUp = Math.ceil(up / unit) + 1, dc0 = Math.max(0, c0 - mUp), dr0 = Math.max(0, r0 - mUp);   // extra up-left rows/cols to refill the cleared margin
      const cells = [];
      for (let r = dr0; r <= r1; r++) for (let c = dc0; c <= c1; c++) cells.push({ c, r, key: m.ground[r][c] || 'grass', e: this._capE(m.elevation[r][c] | 0) });
      cells.sort((a, b) => (a.r + a.c) - (b.r + b.c) || a.e - b.e);
      for (const cl of cells) {
        const sp = orig(cl.c, cl.r);
        if (this.view.elev) { cx.fillStyle = OVERHEAD.elevMapColor(cl.e, maxE); cx.fillRect(sp.x, sp.y, unit + 1, unit + 1); cx.strokeStyle = 'rgba(0,0,0,.18)'; cx.strokeRect(sp.x + .5, sp.y + .5, unit, unit); continue; }
        const sN = (cl.r + 1 <= m.gridH - 1) ? this._capE(m.elevation[cl.r + 1][cl.c] | 0) : -1, eN = (cl.c + 1 <= m.gridW - 1) ? this._capE(m.elevation[cl.r][cl.c + 1] | 0) : -1;
        OVERHEAD.drawTerrainCube(cx, cl.key, sp.x, sp.y, unit, cl.e, sN < cl.e, eN < cl.e);
      }
      cx.restore();
    },
    // Live overlay of the in-progress brush stroke, straight onto the screen over the blit.
    _drawEditRegion(ctx, S, cs, Q, maxE, hiAbove) {
      this._paintTerrainRegion(ctx, (c, r) => S(c * this.grid.cell, r * this.grid.cell), cs, Q, maxE, this._editBox, { clearStyle: '#0c0f16', overlay: true });
    },
    // Bake a committed edit into the world-space cache (no full rebuild).
    _patchTerrCache(box) {
      if (!this._terrCache || this._terrCachePad == null) return false;
      const g = this.grid, cell = g.cell, pad = this._terrCachePad, maxE = this._mapMaxElev();
      if (maxE > (this._terrCacheMaxE || 1)) return false;   // grew taller than the cache pad → need a full rebuild
      this._paintTerrainRegion(this._terrCache.getContext('2d'), (c, r) => ({ x: c * cell + pad, y: r * cell + pad }), cell, OVERHEAD.elevOffset(cell), maxE, box, {});
      return true;
    },
    // Bake the whole terrain to a WORLD-SPACE offscreen canvas (see _render). Honors the
    // Elevation-map view + Hide-above-elev filter; excludes the active-elevation highlight and
    // per-cell numbers (those overlay live). Rebuilt only when _terrCacheKey changes.
    _buildTerrCache(m, g, maxE) {
      const padMax = maxE + 4;   // headroom so raising a few levels still patches (no full rebuild)
      const cell = g.cell, Q = OVERHEAD.elevOffset(cell), pad = Math.ceil(padMax * Q + cell);
      const cv = this._terrCacheCv || (this._terrCacheCv = document.createElement('canvas'));
      cv.width = Math.max(1, m.gridW * cell + pad + cell); cv.height = Math.max(1, m.gridH * cell + pad + cell);
      const cx = cv.getContext('2d'); cx.clearRect(0, 0, cv.width, cv.height);
      const cells = [];
      for (let r = 0; r < m.gridH; r++) for (let c = 0; c < m.gridW; c++) cells.push({ c, r, key: m.ground[r][c] || 'grass', e: this._capE(m.elevation[r][c] | 0) });
      cells.sort((a, b) => (a.r + a.c) - (b.r + b.c) || a.e - b.e);
      for (const cl of cells) {
        const fx = cl.c * cell + pad, fy = cl.r * cell + pad;
        if (this.view.elev) { cx.fillStyle = OVERHEAD.elevMapColor(cl.e, maxE); cx.fillRect(fx, fy, cell + 1, cell + 1); cx.strokeStyle = 'rgba(0,0,0,.18)'; cx.strokeRect(fx + .5, fy + .5, cell, cell); continue; }
        const sN = (cl.r + 1 <= m.gridH - 1) ? this._capE(m.elevation[cl.r + 1][cl.c] | 0) : -1, eN = (cl.c + 1 <= m.gridW - 1) ? this._capE(m.elevation[cl.r][cl.c + 1] | 0) : -1;
        OVERHEAD.drawTerrainCube(cx, cl.key, fx, fy, cell, cl.e, sN < cl.e, eN < cl.e);
      }
      this._terrCache = cv; this._terrCachePad = pad; this._terrCacheMaxE = padMax;
    },
    _restore(snap) { const d = JSON.parse(snap); const cam = this.cam, mz = this.grid && this.grid.masterZoom; this.world.mapSnapshot = d.map; this.world.buildings = d.b; this.world.mobs = d.m; this.world.items = d.i; this.world.spawns = d.s; this.world.goal = d.g; if (d.r !== undefined) this.world.ramps = d.r; if (d.br !== undefined) this.world.bridges = d.br; if (d.ga !== undefined) this.world.gates = d.ga; if (d.rs !== undefined) this.world.redstone = d.rs; if (d.set !== undefined) this.world.settings = d.set; if (d.ts !== undefined) this.world.templateStamps = d.ts; if (d.tpl !== undefined) this.world.templates = d.tpl; this._setupWorld(); this.cam = cam; if (mz) this.grid.masterZoom = mz; this._terrRev = (this._terrRev || 0) + 1; },   // keep the camera + zoom put (undo/redo must not jump the view)
    _paintDesc() { const t = this._shift ? 'erase' : this.tool;
      if (t === 'terrain') return 'paint ' + this.terrainKey; if (t === 'building') return 'place ' + this.buildingType;
      if (t === 'mob') return 'place ' + this.mobKey; if (t === 'item') return 'place ' + this.itemKey;
      if (t === 'erase') return 'erase'; return t; },
    undo() { if (this._histPos > 0) { const leaving = this._hist[this._histPos]; this._histPos--; this._restore(this._hist[this._histPos].s); this._flash('↶ Undid: ' + (leaving.d || 'edit')); } else this._flash('Nothing to undo'); },
    redo() { if (this._histPos < this._hist.length - 1) { this._histPos++; const e = this._hist[this._histPos]; this._restore(e.s); this._flash('↷ Redid: ' + (e.d || 'edit')); } else this._flash('Nothing to redo'); },

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
          #oh-rail-right{position:fixed;top:48px;right:8px;z-index:9000;display:none;flex-direction:column;gap:6px;width:0;font:12px sans-serif;color:#dbe4f3}
          #oh-rail-right .oh-fly{left:auto;right:112px}
          #oh-rail .grp[draggable=true] .hd,#oh-rail-right .grp[draggable=true] .hd{cursor:grab}
          .grp.oh-drag{opacity:.4} .grp.oh-over{outline:2px dashed #6ad0ff;outline-offset:1px}
          .oh-railhdr{display:flex;justify-content:space-between;align-items:center;font-size:10px;color:#8fa0bd;padding:0 2px}
          .oh-railhdr .rw{cursor:pointer;padding:0 4px;opacity:.7} .oh-railhdr .rw:hover{opacity:1}
          .oh-droppad{min-height:22px;border:1px dashed rgba(120,150,190,.28);border-radius:6px;margin-top:5px;font-size:10px;color:#7a879c;text-align:center;padding:5px 3px}
          #oh-rail .grp{position:relative}
          #oh-rail .hd{background:#243049;border:1px solid #3a4a6b;border-radius:7px;padding:7px 9px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:6px}
          #oh-rail .hd.on{background:#3a5a8c;border-color:#5573ad}
          #oh-rail .hd b{font-weight:600} #oh-rail .hd .cur{color:#cfe0ff;font-size:11px;max-width:52px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:flex;align-items:center;gap:4px}
          #oh-rail .btn{background:#243049;border:1px solid #3a4a6b;border-radius:7px;padding:7px 9px;cursor:pointer;text-align:left}
          #oh-rail .btn.on{background:#3a5a8c;border-color:#5573ad}
          #oh-rail .oh-top3{display:flex;gap:6px} #oh-rail .oh-top3 .btn{flex:1;text-align:center;padding:8px 3px}
          #oh-rail .oh-gap{height:8px}
          .oh-fly{position:absolute;left:112px;top:-2px;min-width:172px;max-height:74vh;overflow:auto;background:#1a2233;border:1px solid #3a4a6b;border-radius:8px;padding:22px 6px 6px 12px;display:none;z-index:9100;box-shadow:5px 6px 20px rgba(0,0,0,.55)}
          .oh-fly .pin{position:absolute;top:4px;right:8px;opacity:.6;cursor:pointer;font-size:13px;z-index:2} .oh-fly .pin:hover{opacity:1}
          #oh-rail .grp:hover>.oh-fly,.oh-fly:hover{display:block}
          .oh-fly .opt{display:flex;align-items:center;gap:7px;padding:5px 7px;border-radius:5px;cursor:pointer}
          .oh-fly .opt:hover{background:#2a3852} .oh-fly .opt.sel{background:#3a5a8c}
          .oh-fly .opt.small{padding:4px 7px} .oh-sw{width:16px;height:16px;border-radius:3px;border:1px solid rgba(255,255,255,.3);flex:none}
          .oh-ic{width:20px;height:20px;flex:none;image-rendering:pixelated;filter:drop-shadow(0 1px 1px rgba(0,0,0,.4))}
          #oh-rail .grp.pinned .hd{background:#2e6f4e;border-color:#3f9a6c;display:flex;justify-content:space-between} #oh-rail .pinx{cursor:pointer;color:#dbe4f3;font-weight:700;padding:0 4px}
          .oh-pinned{display:grid;grid-template-columns:1fr 1fr;gap:3px;padding:6px 4px;max-height:56vh;overflow:auto;background:#1a2233;border:1px solid #3a4a6b;border-top:none;border-radius:0 0 8px 8px}
          .oh-pinned .opt{display:flex;align-items:center;gap:5px;padding:5px 6px;border-radius:5px;cursor:pointer;font-size:11px;overflow:hidden}
          .oh-pinned .opt:hover{background:#2a3852} .oh-pinned .opt.sel{background:#3a5a8c}
          #oh-create-modal{position:fixed;inset:0;z-index:9500;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.65)}
          .ohc-panel{background:#141a26;border:1px solid #2c3648;border-radius:12px;padding:20px 22px;min-width:320px;color:#e8eef7;font:14px sans-serif}
          .ohc-panel h2{margin:0 0 12px} .ohc-panel label{display:block;margin:8px 0;font-size:13px}
          .ohc-panel select,.ohc-panel input:not([type=checkbox]):not([type=radio]){width:100%;box-sizing:border-box;background:#1c2230;border:1px solid #3a465c;color:#e8eef7;border-radius:6px;padding:6px;margin-top:3px}
          .ohc-panel input[type=checkbox]{width:16px;height:16px;flex:none;margin:0;accent-color:#3f9a6c;cursor:pointer;vertical-align:middle}
          .ohc-panel label:has(input[type=checkbox]){display:flex;align-items:center;gap:8px}
          .ohc-btns{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}
          .ohc-btns button{background:#2b3548;border:1px solid #46557a;color:#dfe7f5;border-radius:6px;padding:7px 16px;cursor:pointer} .ohc-btns button.primary{background:#2e6f4e;border-color:#3f9a6c}`;
        document.head.appendChild(s);
      }
      if (!document.getElementById('oh-top')) { const t = document.createElement('div'); t.id = 'oh-top'; document.body.appendChild(t); }
      if (!document.getElementById('oh-rail')) { const r = document.createElement('div'); r.id = 'oh-rail'; document.body.appendChild(r); }
      if (!document.getElementById('oh-rail-right')) { const r = document.createElement('div'); r.id = 'oh-rail-right'; document.body.appendChild(r); }
      if (!this._railLayout) this._loadLayout();
    },
    _showChrome(on) { ['oh-top', 'oh-rail', 'oh-rail-right'].forEach((id) => { const el = document.getElementById(id); if (el) el.style.display = on ? 'flex' : 'none'; }); if (on) this._selEnt || this._hideSelBar(); },

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
          <label title="Grey out every block NOT at the active elevation (the layer directly below stays coloured — that's what you build on)"><input type="checkbox" id="oh-v-focusLayer" ${this.view.focusLayer !== false ? 'checked' : ''}> Focus layer</label>
          <label title="Show hollow dashed ghost cubes for each air level below the cursor when placing above the surface"><input type="checkbox" id="oh-v-airGhosts" ${this.view.airGhosts ? 'checked' : ''}> Air ghosts</label>
          <label title="Slice off everything above the active elevation — a cell taller than it shows the block AT that level (no black holes)"><input type="checkbox" id="oh-v-hideAbove" ${this.view.hideAbove ? 'checked' : ''}> Hide above elev ${this.elevLevel}</label>
          <label style="display:flex;align-items:center;gap:5px" title="Zoom (also: mouse wheel, + / − buttons)">🔍<input type="range" id="oh-zoom" min="0.35" max="3" step="0.05" value="${this.grid ? this.grid.masterZoom : 1}" style="width:96px;vertical-align:middle"></label>
          <label title="Performance overlay — FPS, render time, terrain draw mode, cell counts"><input type="checkbox" id="oh-v-perf" ${this.view.perf ? 'checked' : ''}> ⏱ Perf</label>
        </span>
        <span class="oh-status">${this._esc(this.world.name)} · ${m.baseW || m.gridW}×${m.baseH || m.gridH} @ d${m.density} · ${this._shift ? 'erase' : this.tool} @ elev ${this.elevLevel}</span>
        <span class="oh-flash" id="oh-flash"></span>`;
      // LEFT RAIL. Top three (Hand / Draw / Erase) set the mode + cursor; then
      // Elevation / Brush / Shape; a gap; then the palettes (Terrain / Mobs / Items /
      // Buildings); a gap; then Redstone. Active buttons highlight light-blue.
      const mode = this.tool === 'hand' ? 'hand' : (this.tool === 'erase' || this._shift) ? 'erase' : 'draw';
      const blockSw = (key) => { const t = P().OH_TERRAIN_BY_KEY[key]; return `<span class="oh-sw" style="background:${t ? t.color : '#888'};box-shadow:inset -3px -3px 0 rgba(0,0,0,.3),inset 2px 2px 0 rgba(255,255,255,.18)"></span>`; };
      const swatch = (c) => `<span class="oh-sw" style="background:${c}"></span>`;
      const terrOpts = `<input id="oh-terr-filter" placeholder="🔎 filter blocks…" value="${this._esc(this._terrFilter || '')}" style="width:90%;margin:2px auto;display:block;padding:3px 6px;background:#141a26;border:1px solid #2c3648;color:#dbe4f3;border-radius:5px;font-size:12px">`
        + P().OH_TERRAIN.map((t) => `<div class="opt ${this.tool === 'terrain' && this.terrainKey === t.key ? 'sel' : ''}" data-terr="${t.key}">${blockSw(t.key)}${t.name}</div>`).join('');
      const bTypes = (typeof OH_BUILDINGS !== 'undefined') ? OH_BUILDINGS.all().map((d) => d.id) : ['healer'];
      const buildOpts = bTypes.map((b) => `<div class="opt ${this.tool === 'building' && this.buildingType === b ? 'sel' : ''}" data-build="${b}">🏛 ${b}</div>`).join('')
        + `<div class="opt ${this.tool === 'spawn' ? 'sel' : ''}" data-spawn="1">🚩 Player Spawn</div><div class="opt ${this.tool === 'goal' ? 'sel' : ''}" data-goal="1">★ Goal Star</div>`
        + `<div class="opt ${this.tool === 'ramp' ? 'sel' : ''}" data-ramp="ramp">⟋ Ramp</div><div class="opt ${this.tool === 'ladder' ? 'sel' : ''}" data-ramp="ladder">🪜 Ladder</div>`
        + `<div class="opt ${this.tool === 'tree' ? 'sel' : ''}" data-tree="1">🌳 Tree (prefab)</div>`
        + `<div class="opt ${this.tool === 'bridge' ? 'sel' : ''}" data-bspan="0" title="Click two cliffs to span a gap. Make it a drawbridge (raises on a signal) in its config after placing.">🌉 Bridge — click 2 cliffs</div>`
        + `<div class="opt ${this.tool === 'gate' ? 'sel' : ''}" data-gate="1" title="Click the hinge cell, then the tip. A swinging panel that rotates to a configured angle on a redstone signal (stops on obstructions).">🚪 Gate — click hinge, then tip</div>`;
      const tplList = (typeof OH_TEMPLATES !== 'undefined') ? OH_TEMPLATES.forWorld(this.world) : [];
      const tplOpts = tplList.map((t) => `<div class="opt ${this.tool === 'template' && this._templateId === t.id ? 'sel' : ''}" data-template="${t.id}">${t.system ? '🧩' : '📦'} ${this._esc(t.name)}</div>`).join('')
        + `<div class="opt" data-newtemplate="1" style="color:#7fe0a0">＋ New Template…</div>`;
      const mobOpts = P().OH_MOBS.map((mm) => `<div class="opt ${this.tool === 'mob' && this.mobKey === mm.key ? 'sel' : ''}" data-mob="${mm.key}"><img class="oh-ic" src="${this._mobIcon(mm)}">${mm.name}</div>`).join('');
      const itemOpts = P().OH_ITEMS.map((i) => `<div class="opt ${this.tool === 'item' && this.itemKey === i.key ? 'sel' : ''}" data-item="${i.key}"><img class="oh-ic" src="${this._itemIcon(i)}">${i.name}</div>`).join('');
      const rsOpts = `<div class="opt ${this.tool === 'lever' ? 'sel' : ''}" data-rs="lever">🔧 Lever (E to flip)</div>`
        + `<div class="opt ${this.tool === 'dust' ? 'sel' : ''}" data-rs="dust">🟥 Redstone dust</div>`
        + `<div class="opt ${this.tool === 'lamp' ? 'sel' : ''}" data-rs="lamp">💡 Lamp</div>`
        + `<div class="opt ${this.tool === 'plate' ? 'sel' : ''}" data-rs="plate">⬛ Pressure plate</div>`
        + `<div class="opt ${this.tool === 'weight' ? 'sel' : ''}" data-rs="weight">⚖ Weight block</div>`
        + `<div class="opt ${this.tool === 'piston' ? 'sel' : ''}" data-rs="piston">⊐ Piston (barrier)</div>`
        + `<div class="opt ${this.tool === 'and' ? 'sel' : ''}" data-rs="and">🅰 AND gate (1×1)</div>`
        + `<div class="opt ${this.tool === 'not' ? 'sel' : ''}" data-rs="not">🚫 NOT gate (1×1)</div>`
        + `<div class="opt ${this.tool === 'nor' ? 'sel' : ''}" data-rs="nor">⛔ NOR gate (1×1)</div>`
        + `<div class="opt ${this.tool === 'lock' ? 'sel' : ''}" data-rs="lock">🔒 Lock (key → signal)</div>`
        + `<div class="opt small" style="color:#8fa0bd">Hand-click a device to set its transmit / receive channel. Lever/plate + Drawbridge share "gate" by default.</div>`;
      const grp = (label, cur, opts, active, sw) => {
        if (this._railLayout.pinned[label]) return `<div class="grp pinned" draggable="true" data-grp="${label}"><div class="hd on"><b>${label}</b><span class="pinx" data-unpin="${label}" title="Unpin">✕</span></div><div class="oh-pinned">${opts}</div></div>`;
        return `<div class="grp" draggable="true" data-grp="${label}"><div class="hd ${active ? 'on' : ''}"><b>${label} ▸</b><span class="cur">${sw || ''}${cur}</span></div><div class="oh-fly"><span class="pin" data-pin="${label}" title="Pin this palette open">📌</span>${opts}</div></div>`;
      };
      const shapeOpts = [['freehand', 'Freehand (B)'], ['line', 'Line (L)'], ['rect', 'Rectangle (R)'], ['circle', 'Circle / Oval (O)'], ['fill', '🪣 Fill / bucket (G)']].map(([k, n]) => `<div class="opt small ${this.shape === k ? 'sel' : ''}" data-shape="${k}">${n}</div>`).join('')
        + `<div class="opt small ${this.shapeFill ? 'sel' : ''}" data-fill="1">${this.shapeFill ? '☑' : '☐'} Solid (else outline = brush width)</div>`
        + `<div class="opt small" style="color:#8fa0bd">Alt-click = eyedropper · Shift-scroll = brush size</div>`;
      const brushActive = mode === 'erase' || (mode === 'draw' && this.shape === 'freehand');
      const shapeActive = mode === 'draw' && this.shape !== 'freehand';
      const terrActive = mode === 'draw' && this.tool === 'terrain';
      const buildActive = ['building', 'spawn', 'goal', 'ramp', 'ladder', 'tree', 'bridge'].indexOf(this.tool) >= 0;
      const rsActive = ['lever', 'dust', 'lamp', 'plate', 'weight', 'piston', 'and', 'not', 'nor', 'lock'].indexOf(this.tool) >= 0;
      const terrCur = this.tool === 'terrain' ? P().OH_TERRAIN_BY_KEY[this.terrainKey].name : '';
      const terrSw = this.tool === 'terrain' ? blockSw(this.terrainKey) : '';
      // Build each palette group's HTML, then lay them out across the LEFT + RIGHT rails per
      // the (draggable, persisted) layout.
      const groups = {
        Elevation: grp('Elevation', 'Lvl ' + this.elevLevel, [0, 1, 2, 3, 4, 5, 6, 7, 8].map((l) => `<div class="opt small ${l === this.elevLevel ? 'sel' : ''}" data-elev="${l}">Level ${l}</div>`).join('')),
        Brush: grp('Brush', this.brush + '×' + this.brush + (this._scatter ? ' · ' + (this._scatter * 100 | 0) + '%' : ''),
          [1, 2, 3, 5, 8].map((b) => `<div class="opt small ${b === this.brush ? 'sel' : ''}" data-brush="${b}">${b}×${b}</div>`).join('')
          + `<div class="opt small" style="color:#8fa0bd;margin-top:2px">Scatter (natural fill):</div>`
          + [['0', 'Solid'], ['0.25', '25%'], ['0.5', '50%'], ['0.75', '75%']].map(([v, n]) => `<div class="opt small ${+v === this._scatter ? 'sel' : ''}" data-scatter="${v}">${n}</div>`).join(''), brushActive),
        Shape: grp('Shape', this.shape === 'freehand' ? 'Freehand' : (this.shape + (this.shapeFill ? ' fill' : '')), shapeOpts, shapeActive),
        Terrain: grp('Terrain', terrCur, terrOpts, terrActive, terrSw),
        Mobs: grp('Mobs', this.tool === 'mob' ? P().OH_MOB_BY_KEY[this.mobKey].name : '', mobOpts, this.tool === 'mob'),
        Items: grp('Items', this.tool === 'item' ? P().OH_ITEM_BY_KEY[this.itemKey].name : '', itemOpts, this.tool === 'item'),
        Buildings: grp('Buildings', (this.tool === 'building' ? this.buildingType : this.tool === 'spawn' ? 'Spawn' : this.tool === 'goal' ? 'Goal' : this.tool === 'ramp' ? 'Ramp' : this.tool === 'ladder' ? 'Ladder' : this.tool === 'tree' ? 'Tree' : this.tool === 'bridge' ? 'Bridge' : ''), buildOpts, buildActive),
        Templates: grp('Templates', this.tool === 'template' && this._templateId ? (tplList.find((t) => t.id === this._templateId) || {}).name || '' : '', tplOpts, this.tool === 'template'),
        Redstone: grp('Redstone', rsActive ? this.tool : '', rsOpts, rsActive),
      };
      const L = this._railLayout, railRight = document.getElementById('oh-rail-right');
      if (L.right.length && !L.rightWidth) L.rightWidth = 160;
      rail.style.width = (L.leftWidth || 120) + 'px';
      rail.innerHTML =
        `<div class="oh-top3">
           <div class="btn ${mode === 'hand' ? 'on' : ''}" id="oh-hand" title="Pan · click to configure/move">✋ Hand</div>
           <div class="btn ${mode === 'draw' ? 'on' : ''}" id="oh-draw" title="Draw with the last terrain + brush/shape">✏ Draw</div>
           <div class="btn ${mode === 'erase' ? 'on' : ''}" id="oh-erase" title="Erase everything the brush touches (⇧-click too)">⌫ Erase</div>
         </div>
         <div class="oh-railhdr"><span>◧ LEFT</span><span><span class="rw" data-rw="left--" title="Narrower">◀</span><span class="rw" data-rw="left++" title="Wider">▶</span><span class="rw" data-rw="right-toggle" title="${L.rightWidth ? 'Hide the right panel' : 'Show a RIGHT panel — then drag palettes onto it'}">${L.rightWidth ? '▐✕' : '▐▶'}</span></span></div>` +
        L.left.map((t) => groups[t] || '').join('') + `<div class="oh-droppad" data-drop="left"></div>`;
      railRight.style.display = (L.right.length || L.rightWidth) ? 'flex' : 'none';
      railRight.style.width = (L.rightWidth || 0) + 'px';
      railRight.innerHTML = L.right.length || L.rightWidth
        ? `<div class="oh-railhdr"><span><span class="rw" data-rw="right--">◀</span><span class="rw" data-rw="right++">▶</span></span><span>RIGHT ◨</span></div>`
          + L.right.map((t) => groups[t] || '').join('') + `<div class="oh-droppad" data-drop="right">drag palettes here →</div>`
        : '';
      const g = (id) => document.getElementById(id);
      const qAll = (sel) => [].slice.call(rail.querySelectorAll(sel)).concat([].slice.call(railRight.querySelectorAll(sel)));
      g('oh-undo').onclick = () => this.undo(); g('oh-redo').onclick = () => this.redo();
      g('oh-zin').onclick = () => OH_GRID.zoomBy(this.grid, 1.15); g('oh-zout').onclick = () => OH_GRID.zoomBy(this.grid, 0.87);
      g('oh-test').onclick = () => this._test(); g('oh-save').onclick = () => this._save(); g('oh-exit').onclick = () => this.close();
      g('oh-settings').onclick = () => { if (typeof OH_WORLD_SETTINGS !== 'undefined') OH_WORLD_SETTINGS.open(this.world, () => { this._renderBar(); this._pushHistory('settings change'); }); };
      ['buildings', 'mobs', 'items', 'elev', 'hideAbove', 'focusLayer', 'airGhosts', 'perf'].forEach((k) => { const el = g('oh-v-' + k); if (el) el.onchange = () => { this.view[k] = el.checked; }; });
      { const zr = g('oh-zoom'); if (zr) zr.oninput = () => OH_GRID.setZoom(this.grid, +zr.value); }
      g('oh-erase').onclick = () => { this.tool = 'erase'; this._renderBar(); this._updateCursor(); };
      g('oh-hand').onclick = () => { this.tool = 'hand'; this._selEnt = null; this._renderBar(); this._updateCursor(); };
      g('oh-draw').onclick = () => { this.tool = 'terrain'; this._renderBar(); this._updateCursor(); };   // restore drawing with the last terrain + brush/shape (all persist)
      qAll('[data-pin]').forEach((el) => el.onclick = (ev) => { ev.stopPropagation(); this._railLayout.pinned[el.dataset.pin] = 1; this._saveLayout(); this._renderBar(); });
      qAll('[data-unpin]').forEach((el) => el.onclick = (ev) => { ev.stopPropagation(); delete this._railLayout.pinned[el.dataset.unpin]; this._saveLayout(); this._renderBar(); });
      // Rail width steppers (◀▶) + drag-and-drop to move a palette between / within the rails.
      qAll('[data-rw]').forEach((el) => el.onclick = () => { const v = el.dataset.rw, L2 = this._railLayout;
        if (v === 'right-toggle') { if (L2.rightWidth) { L2.left = L2.left.concat(L2.right); L2.right = []; L2.rightWidth = 0; } else { L2.rightWidth = 160; this._flash('Right panel on — drag a palette by its header onto it'); } }
        else { const side = v.indexOf('left') === 0 ? 'left' : 'right', key = side + 'Width', inc = v.indexOf('++') >= 0 ? 28 : -28; L2[key] = Math.max(0, Math.min(400, (L2[key] || (side === 'left' ? 120 : 0)) + inc)); }
        this._saveLayout(); this._renderBar(); });
      qAll('.grp[draggable=true]').forEach((el) => {
        el.addEventListener('dragstart', (ev) => { this._dragGrp = el.dataset.grp; el.classList.add('oh-drag'); if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move'; });
        el.addEventListener('dragend', () => { el.classList.remove('oh-drag'); qAll('.oh-over').forEach((x) => x.classList.remove('oh-over')); });
        el.addEventListener('dragover', (ev) => { ev.preventDefault(); el.classList.add('oh-over'); });
        el.addEventListener('dragleave', () => el.classList.remove('oh-over'));
        el.addEventListener('drop', (ev) => { ev.preventDefault(); el.classList.remove('oh-over'); this._moveGroup(this._dragGrp, el.dataset.grp); });
      });
      qAll('.oh-droppad').forEach((el) => {
        el.addEventListener('dragover', (ev) => { ev.preventDefault(); el.classList.add('oh-over'); });
        el.addEventListener('dragleave', () => el.classList.remove('oh-over'));
        el.addEventListener('drop', (ev) => { ev.preventDefault(); el.classList.remove('oh-over'); this._moveGroupToRail(this._dragGrp, el.dataset.drop); });
      });
      qAll('[data-brush]').forEach((el) => el.onclick = () => { this.brush = +el.dataset.brush; this._renderBar(); });
      qAll('[data-scatter]').forEach((el) => el.onclick = () => { this._scatter = +el.dataset.scatter; this._renderBar(); });
      qAll('[data-shape]').forEach((el) => el.onclick = () => { this.shape = el.dataset.shape; this._renderBar(); });
      qAll('[data-fill]').forEach((el) => el.onclick = () => { this.shapeFill = !this.shapeFill; this._renderBar(); });
      qAll('[data-elev]').forEach((el) => el.onclick = () => { this.elevLevel = +el.dataset.elev; this._renderBar(); });
      qAll('[data-terr]').forEach((el) => el.onclick = () => { this.tool = 'terrain'; this.terrainKey = el.dataset.terr; this._renderBar(); });
      qAll('[data-build]').forEach((el) => el.onclick = () => { this.tool = 'building'; this.buildingType = el.dataset.build; this._renderBar(); });
      qAll('[data-spawn]').forEach((el) => el.onclick = () => { this.tool = 'spawn'; this._renderBar(); });
      qAll('[data-goal]').forEach((el) => el.onclick = () => { this.tool = 'goal'; this._renderBar(); });
      qAll('[data-ramp]').forEach((el) => el.onclick = () => { this.tool = el.dataset.ramp; this._renderBar(); });
      qAll('[data-tree]').forEach((el) => el.onclick = () => { this.tool = 'tree'; this._renderBar(); });
      qAll('[data-template]').forEach((el) => el.onclick = () => { this.tool = 'template'; this._templateId = el.dataset.template; this._renderBar(); this._updateCursor(); });
      qAll('[data-newtemplate]').forEach((el) => el.onclick = () => this._newTemplateModal());
      { const tf = g('oh-terr-filter'); if (tf) { const doFilter = () => { const q = tf.value.toLowerCase(); this._terrFilter = tf.value; qAll('[data-terr]').forEach((el) => { el.style.display = (!q || el.textContent.toLowerCase().indexOf(q) >= 0 || (el.dataset.terr || '').indexOf(q) >= 0) ? '' : 'none'; }); }; tf.oninput = doFilter; tf.onclick = (ev) => ev.stopPropagation(); if (this._terrFilter) doFilter(); } }
      qAll('[data-mob]').forEach((el) => el.onclick = () => { this.tool = 'mob'; this.mobKey = el.dataset.mob; this._renderBar(); });
      qAll('[data-item]').forEach((el) => el.onclick = () => { this.tool = 'item'; this.itemKey = el.dataset.item; this._renderBar(); });
      qAll('[data-bspan]').forEach((el) => el.onclick = () => { this.tool = 'bridge'; this._bridgeStart = null; this._renderBar(); });
      qAll('[data-gate]').forEach((el) => el.onclick = () => { this.tool = 'gate'; this._gateStart = null; this._renderBar(); });
      qAll('[data-rs]').forEach((el) => el.onclick = () => { this.tool = el.dataset.rs; this._renderBar(); });
      this._updateCursor();
    },
    _esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); },

    // ── Canvas interaction ──────────────────────────────────────────────────
    _bindCanvas() {
      const cv = document.getElementById('gameCanvas');
      this._md = (e) => {
        if (this._templateMode) { const cel = this._cellFromEvent(e); this._templateMode.anchor = { col: cel.col, row: cel.row }; this._flash('Region placed · Enter = capture · Esc = cancel'); return; }   // template mode: click anchors the region
        if (this._pasting && this._clip) { const cel = this._cellFromEvent(e); this._paste(cel.col, cel.row); return; }   // click to paste
        if (e.altKey) { const cel = this._cellFromEvent(e); this._eyedrop(cel.col, cel.row); return; }   // Alt-click = eyedropper
        if (e.ctrlKey || e.metaKey) { const cel = this._cellFromEvent(e); this._selecting = true; this._marquee = { a: cel, b: cel }; return; }   // Ctrl-drag = marquee select
        if (this.tool === 'hand') { const cv2 = document.getElementById('gameCanvas'); const rect = cv2.getBoundingClientRect(); this._pan = { cx: e.clientX, cy: e.clientY, camx: this.cam.x, camy: this.cam.y, sx: CANVAS_W / rect.width, sy: CANVAS_H / rect.height, moved: false, e }; if (cv2) cv2.style.cursor = 'grabbing'; return; }
        if (this.tool === 'bridge') {   // two-click SPAN: click one cliff, then the other
          const cel = this._cellFromEvent(e);
          if (!this._bridgeStart) { this._bridgeStart = cel; this._flash('Bridge: click the far cliff — Brush size sets width (Esc to cancel)'); }
          else { const w = Math.max(1, this.brush || 1); const span = { from: this._bridgeStart, to: cel, elev: this.elevLevel, width: w, draw: false, rail: !(this.world.settings && this.world.settings.bridgeGuardrails === false) }; this.world.bridges = this.world.bridges || []; this.world.bridges.push(span); this._bridgeStart = null; this._pushHistory('bridge'); this._flash('Bridge placed' + (w > 1 ? ' (' + w + ' wide)' : '') + ' — click it to make it a drawbridge'); }
          return;
        }
        if (this.tool === 'gate') {   // two-click: hinge, then tip (rest orientation + length)
          const cel = this._cellFromEvent(e);
          if (!this._gateStart) { this._gateStart = cel; this._flash('Gate: click the TIP (rest position) — Esc to cancel'); }
          else { const dc = cel.col - this._gateStart.col, dr = cel.row - this._gateStart.row, len = Math.max(1, Math.max(Math.abs(dc), Math.abs(dr)));
            const rest = Math.round(Math.atan2(dr, dc) * 180 / Math.PI / 45) * 45;   // snap to 45°
            const gt = { col: this._gateStart.col, row: this._gateStart.row, len, rest, angle: 90, height: 2, channel: 'gate' };
            this.world.gates = this.world.gates || []; this.world.gates.push(gt); this._gateStart = null; this._pushHistory('gate'); this._gateModal(gt); }
          return;
        }
        this._shift = e.shiftKey;
        if (!this._shift && this.tool === 'terrain' && this.shape === 'fill') { const cel = this._cellFromEvent(e); const n = this._floodFill(cel.col, cel.row); if (n) { this._pushHistory('fill ' + this.terrainKey); this._flash('🪣 Filled ' + n + ' cells'); } return; }
        this._dragging = true; this._lastCell = null; this._editBox = null;
        if (this._isShapeMode()) { const cel = this._cellFromEvent(e); this._shapeAnchor = cel; this._shapeEnd = cel; } else this._paintAt(e); };
      this._mm = (e) => {
        this._hover = this._cellFromEvent(e);   // for the placement / paste ghost
        if (this._selecting && this._marquee) { this._marquee.b = this._hover; return; }
        if (this._pan) { const dx = (e.clientX - this._pan.cx) * this._pan.sx / this.grid.masterZoom, dy = (e.clientY - this._pan.cy) * this._pan.sy / this.grid.masterZoom; if (Math.abs(e.clientX - this._pan.cx) + Math.abs(e.clientY - this._pan.cy) > 3) this._pan.moved = true; this.cam.x = this._pan.camx - dx; this.cam.y = this._pan.camy - dy; return; }
        if (!this._dragging) return; this._shift = e.shiftKey; if (this._isShapeMode()) this._shapeEnd = this._cellFromEvent(e); else this._paintLine(e); };
      this._ml = () => { this._hover = null; };
      this._mu = (e) => {
        if (this._selecting) { this._commitMarquee(); this._selecting = false; this._marquee = null; return; }
        if (this._pan) { const cv2 = document.getElementById('gameCanvas'); if (cv2) cv2.style.cursor = 'grab'; if (!this._pan.moved) { const cel = this._cellFromEvent(this._pan.e); this._handClick(cel.col, cel.row); } this._pan = null; return; }
        if (!this._dragging) return; this._dragging = false; this._lastCell = null; if (this._shapeAnchor) { this._commitShape(); this._shapeAnchor = this._shapeEnd = null; } this._pushHistory(this._paintDesc()); };
      this._wheel = (e) => { if (e.shiftKey) { this.brush = Math.max(1, Math.min(8, this.brush + (e.deltaY < 0 ? 1 : -1))); this._renderBar(); } else this._zoomAt(e.deltaY < 0 ? 1.1 : 0.9, e); e.preventDefault(); };
      this._kd = (e) => {
        // Don't hijack keys while typing in a modal field (channel names, etc.).
        const ae = document.activeElement; if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
        if (this._templateMode) { if (e.code === 'Enter') { e.preventDefault(); this._captureTemplate(); return; } if (e.code === 'Escape') { e.preventDefault(); this._cancelTemplateMode(); return; } }
        const K = this.KEYS, pan = 48 / this.grid.masterZoom, plain = !e.ctrlKey && !e.metaKey && !e.altKey;
        // NAV: WASD + Left/Right arrows PAN the map; Up/Down arrows change the active ELEVATION
        // (works with Hide-above on); number keys set elevation directly.
        if (plain && (e.code === 'ArrowLeft' || e.code === 'KeyA')) { e.preventDefault(); this.cam.x -= pan; }
        else if (plain && (e.code === 'ArrowRight' || e.code === 'KeyD')) { e.preventDefault(); this.cam.x += pan; }
        else if (plain && e.code === 'KeyW') { e.preventDefault(); this.cam.y -= pan; }
        else if (plain && e.code === 'KeyS') { e.preventDefault(); this.cam.y += pan; }
        else if (plain && (e.code === 'ArrowUp' || e.code === K.elevUp)) { e.preventDefault(); this.elevLevel = Math.min(8, this.elevLevel + 1); this._renderBar(); }
        else if (plain && (e.code === 'ArrowDown' || e.code === K.elevDown)) { e.preventDefault(); this.elevLevel = Math.max(0, this.elevLevel - 1); this._renderBar(); }
        else if (/^(Digit|Numpad)[0-8]$/.test(e.code) && !e.ctrlKey && !e.metaKey) { this.elevLevel = +e.code.slice(-1); this._renderBar(); }   // number keys set the elevation directly
        else if (e.code === K.zoomIn) OH_GRID.zoomBy(this.grid, 1.12);
        else if (e.code === K.zoomOut) OH_GRID.zoomBy(this.grid, 0.9);
        else if (e.code === K.undo && (e.ctrlKey || e.metaKey)) { this.undo(); }
        else if (e.code === K.redo && (e.ctrlKey || e.metaKey)) { this.redo(); }
        // Selection / clipboard.
        else if (e.code === 'KeyC' && (e.ctrlKey || e.metaKey)) { this._copySelection(); }
        else if ((e.code === 'Delete' || e.code === 'Backspace') && (this._sel || this._selEnt)) { e.preventDefault(); if (this._selEnt) this._deleteSel(); else this._deleteSelection(); }
        // Clipboard transforms (X/Y flip · T rotate).
        else if ((e.code === 'KeyX' || e.code === 'KeyY') && this._clip && !e.ctrlKey && !e.metaKey) { this._flipClip(e.code === 'KeyX'); }
        else if (e.code === 'KeyT' && this._clip && !e.ctrlKey && !e.metaKey) { this._rotateClip(); }
        // Tool + shape hotkeys (H hand · D draw · E erase · B freehand · L line · R rect · O oval · G bucket).
        else if (!e.ctrlKey && !e.metaKey && e.code === 'KeyH') { this.tool = 'hand'; this._selEnt = null; this._renderBar(); this._updateCursor(); }
        else if (!e.ctrlKey && !e.metaKey && e.code === 'KeyP') { this.tool = 'terrain'; this._renderBar(); this._updateCursor(); }   // P = paint/draw (D now pans)
        else if (!e.ctrlKey && !e.metaKey && e.code === 'KeyE') { this.tool = 'erase'; this._renderBar(); this._updateCursor(); }
        else if (!e.ctrlKey && !e.metaKey && e.code === 'KeyB') { this.shape = 'freehand'; this._renderBar(); }
        else if (!e.ctrlKey && !e.metaKey && e.code === 'KeyL') { this.shape = 'line'; this._renderBar(); }
        else if (!e.ctrlKey && !e.metaKey && e.code === 'KeyR') { this.shape = 'rect'; this._renderBar(); }
        else if (!e.ctrlKey && !e.metaKey && e.code === 'KeyO') { this.shape = 'circle'; this._renderBar(); }
        else if (!e.ctrlKey && !e.metaKey && e.code === 'KeyG') { this.shape = 'fill'; this.tool = 'terrain'; this._renderBar(); }
        // Escape: clear paste/selection first, then return to Hand, then offer quit.
        else if (e.code === 'Escape' || e.code === 'Enter') { if (this._pickTx) { this._endPickTx(); } else if (e.code !== 'Escape') { /* Enter only finishes pick mode */ } else if (this._bridgeStart) { this._bridgeStart = null; this._flash('Bridge cancelled'); } else if (this._gateStart) { this._gateStart = null; this._flash('Gate cancelled'); } else if (this._selEnt) { this._selEnt = null; this._hideSelBar(); } else if (this._pasting || this._clip) { this._pasting = false; this._clip = null; this._flash('Paste cancelled'); } else if (this._sel) { this._sel = null; this._selBox = null; } else if (this.tool !== 'hand') { this.tool = 'hand'; this._selEnt = null; this._renderBar(); } else this._quitModal(); }
      };
      this._dbl = (e) => { const cel = this._cellFromEvent(e);
        if (this.tool === 'hand') { this._selectObjAt(cel.col, cel.row); if (this._selHasSettings(this._selEnt)) return this._openSettingsFor(this._selEnt); }   // double-click = open its settings
        this._selectConnected(cel.col, cel.row); };
      cv.addEventListener('mousedown', this._md); cv.addEventListener('mousemove', this._mm);
      cv.addEventListener('dblclick', this._dbl);
      cv.addEventListener('mouseleave', this._ml);
      cv.addEventListener('wheel', this._wheel, { passive: false });
      window.addEventListener('mouseup', this._mu); window.addEventListener('keydown', this._kd);
    },
    _unbindCanvas() {
      const cv = document.getElementById('gameCanvas');
      if (cv) { cv.removeEventListener('mousedown', this._md); cv.removeEventListener('mousemove', this._mm); cv.removeEventListener('dblclick', this._dbl); cv.removeEventListener('mouseleave', this._ml); cv.removeEventListener('wheel', this._wheel); }
      window.removeEventListener('mouseup', this._mu); window.removeEventListener('keydown', this._kd);
    },

    _cellFromEvent(e) {
      const cv = document.getElementById('gameCanvas'); const rect = cv.getBoundingClientRect();
      const sx = (e.clientX - rect.left) * (CANVAS_W / rect.width), sy = (e.clientY - rect.top) * (CANVAS_H / rect.height);
      const w = OH_GRID.screenToWorld(this.grid, this.cam, sx - (this._leftInset || 0), sy - (this._topInset || 0));   // account for the top + left-rail insets
      return OH_GRID.cellAt(this.grid, w.x, w.y);
    },
    // Zoom toward the mouse: keep the world point under the cursor fixed on screen.
    _zoomAt(factor, e) {
      const g = this.grid, cv = document.getElementById('gameCanvas'); if (!cv) { OH_GRID.zoomBy(g, factor); return; }
      const rect = cv.getBoundingClientRect(), TOP = this._topInset || 0, LEFT = this._leftInset || 0;
      const sx = (e.clientX - rect.left) * (CANVAS_W / rect.width) - LEFT, sy = (e.clientY - rect.top) * (CANVAS_H / rect.height) - TOP;
      const z0 = g.masterZoom, wx = this.cam.x + sx / z0, wy = this.cam.y + sy / z0;   // world point under the cursor
      const z1 = OH_GRID.setZoom(g, z0 * factor);
      this.cam.x = wx - sx / z1; this.cam.y = wy - sy / z1;                            // re-anchor so it stays put (clamped in _render)
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
    _isShapeMode() { const t = this._shift ? 'erase' : this.tool; return this.shape !== 'freehand' && this.shape !== 'fill' && this._lineableTools.indexOf(t) >= 0; },
    // Single-cell terrain-or-erase op (shared by brush + shapes). Erase only
    // affects the selected elevation + clears entities/ramps at the cell.
    _opCell(c, r) {
      const m = this.world.mapSnapshot;
      if (c < 0 || r < 0 || c >= m.gridW || r >= m.gridH) return;
      this._markDirty(c, r);
      if (this.tool === 'erase' || this._shift) {
        // Remove the block AT the active elevation (and anything above it), KEEPING the blocks
        // below — a heightmap has no gaps, so erasing level L drops the column to L-1.
        const h = m.elevation[r][c] | 0;
        if (h >= this.elevLevel) { const nh = Math.max(0, this.elevLevel - 1); m.elevation[r][c] = nh; if (nh === 0) m.ground[r][c] = 'grass'; }
        this.world.buildings = this.world.buildings.filter((b) => !(b.col === c && b.row === r));
        this.world.mobs = this.world.mobs.filter((x) => !(x.col === c && x.row === r));
        this.world.items = this.world.items.filter((x) => !(x.col === c && x.row === r));
        this.world.ramps = (this.world.ramps || []).filter((x) => !(x.col === c && x.row === r));
        this.world.bridges = (this.world.bridges || []).filter((sp) => !OVERHEAD.bridgeSpanCells(sp).some((cc) => cc.col === c && cc.row === r));   // remove the whole span this cell belongs to
        this.world.redstone = (this.world.redstone || []).filter((x) => !(x.col === c && x.row === r));
        return;
      }
      if (this._scatter > 0 && Math.random() > this._scatter) return;   // scatter: skip some cells for a natural fill
      m.ground[r][c] = this.terrainKey; m.elevation[r][c] = this.elevLevel;
    },
    // Tools that support the LINE/RECT/CIRCLE shape tools (drawn as a run, not 1-by-1).
    _lineableTools: ['terrain', 'erase', 'dust', 'ramp', 'ladder', 'lamp'],
    _paintCell(col, row) {
      if (this.tool === 'configure') { this._openConfigAt(col, row); return; }
      const half = Math.floor(this.brush / 2);
      const erasing = this.tool === 'erase' || this._shift;
      const apply = (fn) => { for (let dr = -half; dr <= half; dr++) for (let dc = -half; dc <= half; dc++) fn(col + dc, row + dr); };
      if (erasing || this.tool === 'terrain') { apply((c, r) => this._opCell(c, r)); return; }
      if (this.tool === 'tree') { this._placeTemplate('sys:tree', col, row); return; }   // the tree is now a SYSTEM template (additive overlay — no black void)
      if (this.tool === 'template') { if (this._templateId) this._placeTemplate(this._templateId, col, row); return; }
      if (this.tool === 'goal') { this.world.goal = { col, row }; return; }
      if (this.tool === 'spawn') { this.world.spawns = [{ col, row }]; return; }
      if (this.tool === 'building') { const fit = this._buildingFits(this.buildingType, col, row); if (fit !== false) this.world.buildings.push(OH_BUILDINGS.place(this.buildingType, col, row, { level: fit })); else this._flash('Cannot place there — needs FLAT ground under the whole footprint (or overlaps another building)'); return; }
      if (this.tool === 'mob') { const d = P().OH_MOB_BY_KEY[this.mobKey]; this.world.mobs.push({ col, row, type: this.mobKey, hp: d.hp, speed: d.speed, detect: d.detect }); return; }
      if (this.tool === 'item') { this.world.items.push({ col, row, kind: P().OH_ITEM_BY_KEY[this.itemKey].kind, weapon: P().OH_ITEM_BY_KEY[this.itemKey].weapon, itemKey: this.itemKey }); return; }
      this._placeAt(this.tool, col, row);   // ramp / ladder / bridge / lever / dust / lamp (line-able)
    },
    // Single-cell placement for the line-able placeable layers (used by freehand AND
    // by the shape tools so they can be drawn as runs).
    _placeAt(tool, col, row) {
      const m = this.world.mapSnapshot; if (col < 0 || row < 0 || col >= m.gridW || row >= m.gridH) return;
      if (tool === 'ramp' || tool === 'ladder') { this.world.ramps = this.world.ramps || []; if (!this.world.ramps.some((x) => x.col === col && x.row === row)) this.world.ramps.push({ col, row, kind: tool }); }
      else if (['lever', 'dust', 'lamp', 'plate', 'weight', 'piston', 'and', 'not', 'nor', 'lock'].indexOf(tool) >= 0) {
        this.world.redstone = this.world.redstone || [];
        if (!this.world.redstone.some((x) => x.col === col && x.row === row)) {
          // Only TRANSMITTERS get a Tx number (sources + gates). Dust is pure WIRE and
          // SINKS (lamp/piston/rx) RECEIVE via rxIds — none of them transmit a channel.
          const dev = this._TX_KINDS[tool] ? { col, row, kind: tool, txId: this._nextTxId() } : { col, row, kind: tool };
          if (tool === 'lever') { dev.on = false; dev.channel = 'gate'; }        // channel == transmit (quick default)
          else if (tool === 'plate') dev.txChannel = 'gate';
          else if (tool === 'weight') { dev.txChannel = 'gate'; dev.threshold = 1; }
          else if (tool === 'piston') { dev.rxChannel = 'gate'; dev.dir = 'up'; dev.reach = 2; dev.sticky = false; }   // extends when "gate" is powered; Up = elevator by default
          else if (tool === 'and' || tool === 'not' || tool === 'nor') { dev.inputs = tool === 'and' ? ['w', 's'] : ['w']; dev.outputs = ['e']; }
          else if (tool === 'lock') { dev.on = false; dev.channel = 'gate'; dev.acceptKeys = []; dev.consume = false; dev.toggle = false; }
          this.world.redstone.push(dev);
        }
      }
    },
    // Flood-fill (bucket): from the clicked cell, replace every 4-connected cell that
    // matches its (terrain key + elevation) with the selected terrain. 4-connectivity
    // means diagonal gaps are treated as CLOSED (a 1-wide diagonal seals the region).
    _floodFill(col, row) {
      const m = this.world.mapSnapshot;
      if (col < 0 || row < 0 || col >= m.gridW || row >= m.gridH) return 0;
      const sk = m.ground[row][col] || 'grass', se = m.elevation[row][col] | 0;
      if (sk === this.terrainKey && se === this.elevLevel) return 0;
      const seen = new Set(), stack = [[col, row]]; let n = 0;
      while (stack.length && n < 40000) {
        const [c, r] = stack.pop(), k = c + ',' + r;
        if (c < 0 || r < 0 || c >= m.gridW || r >= m.gridH || seen.has(k)) continue;
        if ((m.ground[r][c] || 'grass') !== sk || (m.elevation[r][c] | 0) !== se) continue;
        seen.add(k); n++; this._markDirty(c, r); m.ground[r][c] = this.terrainKey; m.elevation[r][c] = this.elevLevel;
        stack.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
      }
      return n;
    },
    _drawRampIcon(ctx, kind, cx, cy, s) { OVERHEAD.drawRampIcon(ctx, kind, cx, cy, s); },
    // Alt-click: pick the terrain + elevation under the cursor into the pen.
    _eyedrop(col, row) {
      const m = this.world.mapSnapshot; if (col < 0 || row < 0 || col >= m.gridW || row >= m.gridH) return;
      this.tool = 'terrain'; this.terrainKey = m.ground[row][col] || 'grass'; this.elevLevel = m.elevation[row][col] | 0; this._renderBar(); this._flash('Picked ' + this.terrainKey + ' @ elev ' + this.elevLevel);
    },
    // Set the canvas cursor to match the mode: hand (pan), pen (draw), arrow (place).
    _updateCursor() {
      const cv = document.getElementById('gameCanvas'); if (!cv) return;
      const t = this._shift ? 'erase' : this.tool;
      if (t === 'hand') cv.style.cursor = 'grab';
      else if (['building', 'mob', 'item', 'goal', 'spawn', 'tree', 'bridge'].indexOf(t) >= 0) cv.style.cursor = 'default';
      else cv.style.cursor = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Cpath d='M4 20l3-1L18 8l-2-2L5 17z' fill='%23ffd23a' stroke='%23222' stroke-width='1.2'/%3E%3C/svg%3E\") 3 21, crosshair";
    },
    _quitModal() {
      let ov = document.getElementById('oh-cfg-modal');
      if (!ov) { ov = document.createElement('div'); ov.id = 'oh-cfg-modal'; ov.style.cssText = 'position:fixed;inset:0;z-index:9550;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6)'; document.body.appendChild(ov); }
      ov.style.display = 'flex';
      ov.innerHTML = `<div class="ohc-panel"><h2>Leave the editor?</h2><p style="color:#8fa0bd;font-size:13px">Save your changes before quitting?</p><div class="ohc-btns"><button id="q-cancel">Cancel</button><button id="q-quit">Quit without saving</button><button class="primary" id="q-save">Save &amp; quit</button></div></div>`;
      document.getElementById('q-cancel').onclick = () => { ov.style.display = 'none'; };
      document.getElementById('q-quit').onclick = () => { ov.style.display = 'none'; this.close(); };
      document.getElementById('q-save').onclick = async () => { ov.style.display = 'none'; try { await this._save(); } catch (e) {} this.close(); };
    },

    // Tree prefab: a 2-high log TRUNK (the centre cell, elev base+2 — levels 1&2 are
    // trunk) + a leaf canopy: an outer Ø5 ring at level 3 and an inner top ring at
    // level 4, both AROUND the trunk (never covering it). Placed relative to the
    // current elevation; higher placements just push the levels up (no hard cap).
    _stampTree(col, row) {
      const m = this.world.mapSnapshot, base = (m.elevation[row] ? (m.elevation[row][col] | 0) : 0);   // relative to the GROUND here, not the paint elevation
      const set = (c, r, key, e) => { if (c >= 0 && r >= 0 && c < m.gridW && r < m.gridH) { this._markDirty(c, r); m.ground[r][c] = key; m.elevation[r][c] = e; } };
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        if (dc === 0 && dr === 0) continue;                 // never cover the trunk
        const d2 = dc * dc + dr * dr;
        if (d2 <= 2) set(col + dc, row + dr, 'leaves', base + 4);   // inner TOP ring (level 4)
        else if (d2 <= 5) set(col + dc, row + dr, 'leaves', base + 3); // outer canopy Ø5 (level 3)
      }
      set(col, row, 'log', base + 2);   // trunk (levels 1&2)
    },
    // Place a TEMPLATE as an ADDITIVE overlay stamp (does NOT overwrite the terrain, so the
    // ground below a canopy is preserved — no black void). `base` = the ground elevation here.
    _placeTemplate(templateId, col, row) {
      const m = this.world.mapSnapshot, base = (m.elevation[row] ? (m.elevation[row][col] | 0) : 0);
      this.world.templateStamps = this.world.templateStamps || [];
      this._stampSeq = (this._stampSeq || 0) + 1;
      this.world.templateStamps.push({ id: 'st' + this._stampSeq, templateId, col, row, base });
    },
    // Absolute overlay voxels for the editor render (mirrors the runtime).
    _templateVoxels() { return (typeof OH_TEMPLATES !== 'undefined') ? OH_TEMPLATES.expandStamps(this.world, this.grid.gridW, this.grid.gridH) : []; },
    // Remove the template stamp whose anchor is at (col,row) — for hand-click delete.
    _stampAt(col, row) { return (this.world.templateStamps || []).find((s) => s.col === col && s.row === row); },
    // ── Template MODE — author a reusable model from a region of the map ─────────
    // Prompt name + dims, then click to anchor the X×Y region (greyed outside), Enter to
    // capture the raised cells into a new template (flagging out-of-bounds / floating).
    _newTemplateModal() {
      const inner = `<label>Name <input id="tpl-name" value="My Template" style="width:160px"></label>
        <div style="display:flex;gap:8px;margin-top:8px">
          <label>X <input id="tpl-x" type="number" min="1" max="16" value="4" style="width:52px"></label>
          <label>Y <input id="tpl-y" type="number" min="1" max="16" value="4" style="width:52px"></label>
          <label>Z <input id="tpl-z" type="number" min="1" max="16" value="6" style="width:52px"></label>
        </div>
        <p style="color:#8fa0bd;font-size:12px;margin-top:8px">Dims are in BLOCKS. After OK: click the map to place the region, then press Enter to capture (Esc cancels). Only RAISED cells (elevation &gt; the ground) are captured; anything above Z or floating is flagged.</p>`;
      this._cfgModal('New Template', inner, () => {
        const clamp = (id, d) => Math.max(1, Math.min(16, parseInt((document.getElementById(id) || {}).value, 10) || d));
        const name = ((document.getElementById('tpl-name') || {}).value || 'Template').trim() || 'Template';
        this._templateMode = { name, x: clamp('tpl-x', 4), y: clamp('tpl-y', 4), z: clamp('tpl-z', 6), anchor: null };
        this.tool = 'hand'; this._selEnt = null; this._renderBar(); this._updateCursor();
        this._flash('Click the map to place the ' + this._templateMode.x + '×' + this._templateMode.y + ' region · Enter = capture · Esc = cancel');
      });
    },
    _cancelTemplateMode() { this._templateMode = null; this._flash('Template cancelled'); },
    _captureTemplate() {
      const tm = this._templateMode; if (!tm || !tm.anchor) { this._flash('Click the map to place the region first'); return; }
      const m = this.world.mapSnapshot;
      // Ground reference = the LOWEST elevation in the region (the floor the structure sits
      // on); cells above it are captured with dz = elev − base. So a tree on grass@0 → dz 1-4.
      let base = Infinity; for (let dy = 0; dy < tm.y; dy++) for (let dx = 0; dx < tm.x; dx++) { const c = tm.anchor.col + dx, r = tm.anchor.row + dy; if (c < 0 || r < 0 || c >= m.gridW || r >= m.gridH) continue; base = Math.min(base, m.elevation[r] ? (m.elevation[r][c] | 0) : 0); }
      if (!isFinite(base)) base = 0;
      const sample = (c, r) => { if (c < 0 || r < 0 || c >= m.gridW || r >= m.gridH) return null; const e = m.elevation[r] ? (m.elevation[r][c] | 0) : 0; return { block: (m.ground[r] ? (m.ground[r][c] || 'grass') : 'grass'), elev: e }; };
      const res = OH_TEMPLATES.capture(tm.name, { ax: tm.anchor.col, ay: tm.anchor.row, x: tm.x, y: tm.y, z: tm.z }, sample, base);
      if (!res.def.cells.length) { this._flash('Nothing raised in the region to capture'); return; }
      res.def.density = m.density || 1; res.def.playerHeight = (this.world.settings && this.world.settings.playerHeight) || 1;
      this.world.templates = this.world.templates || []; this.world.templates.push(res.def);
      this._templateMode = null; this.tool = 'template'; this._templateId = res.def.id;
      this._pushHistory('new template'); this._renderBar();
      let msg = 'Template "' + res.def.name + '" saved (' + res.def.cells.length + ' cells)';
      if (res.outOfBounds) msg += ' · ' + res.outOfBounds + ' clamped to Z';
      if (res.floating) msg += ' · ⚠ floating';
      this._flash(msg);
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
      const tool = this._shift ? 'erase' : this.tool;
      const terrainy = (tool === 'terrain' || tool === 'erase');
      const half = (this.shape === 'line' || !this.shapeFill) ? Math.floor(this.brush / 2) : 0;   // brush = outline/line width
      for (const p of cells) {
        if (terrainy) { if (half > 0) { for (let dr = -half; dr <= half; dr++) for (let dc = -half; dc <= half; dc++) this._opCell(p.c + dc, p.r + dr); } else this._opCell(p.c, p.r); }
        else this._placeAt(tool, p.c, p.r);   // dust / bridge / ramp / ladder / lamp along the shape
      }
    },

    // ── Selection + clipboard ──────────────────────────────────────────────────
    _boxOf(sel) { if (!sel || !sel.size) return null; let c0 = 1e9, r0 = 1e9, c1 = -1e9, r1 = -1e9; for (const k of sel) { const [c, r] = k.split(',').map(Number); if (c < c0) c0 = c; if (c > c1) c1 = c; if (r < r0) r0 = r; if (r > r1) r1 = r; } return { c0, r0, c1, r1 }; },
    // Ctrl-drag marquee: select cells in the rect at the START cell's elevation.
    _commitMarquee() {
      if (!this._marquee) return; const m = this.world.mapSnapshot, a = this._marquee.a, b = this._marquee.b;
      const inB = (a.col >= 0 && a.row >= 0 && a.col < m.gridW && a.row < m.gridH);
      const se = inB ? (m.elevation[a.row][a.col] | 0) : this.elevLevel;
      const c0 = Math.max(0, Math.min(a.col, b.col)), c1 = Math.min(m.gridW - 1, Math.max(a.col, b.col));
      const r0 = Math.max(0, Math.min(a.row, b.row)), r1 = Math.min(m.gridH - 1, Math.max(a.row, b.row));
      const sel = new Set(); for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if ((m.elevation[r][c] | 0) === se) sel.add(c + ',' + r);
      this._sel = sel.size ? sel : null; this._selBox = this._boxOf(sel); this._selKind = 'marquee'; this._selElev = se;
      if (sel.size) this._flash(sel.size + ' cells selected @ elev ' + se + ' (Del · Ctrl+C)');
    },
    // Double-click: flood-select all connected same-type cells (bridges = the whole
    // connected run at any elevation; terrain = same key + the start cell's elevation).
    _selectConnected(col, row) {
      const m = this.world.mapSnapshot; if (col < 0 || row < 0 || col >= m.gridW || row >= m.gridH) return;
      // Double-clicking a device or bridge span opens its config modal (bridges are one
      // span object now — the modal Delete removes the whole run).
      const dev = (this.world.redstone || []).find((d) => d.col === col && d.row === row); if (dev) return this._deviceModal(dev);
      const gt = (this.world.gates || []).find((x) => x.col === col && x.row === row); if (gt) return this._gateModal(gt);   // click the hinge to reconfigure
      const span = (this.world.bridges || []).find((b) => OVERHEAD.bridgeSpanCells(b).some((cc) => cc.col === col && cc.row === row)); if (span) return this._bridgeModal(span);
      // Terrain: flood-select the connected same-type run at the start elevation.
      const sk = m.ground[row][col] || 'grass', se = m.elevation[row][col] | 0, st = [[col, row]], sel = new Set();
      while (st.length) { const [c, r] = st.pop(), k = c + ',' + r; if (c < 0 || r < 0 || c >= m.gridW || r >= m.gridH || sel.has(k)) continue; if ((m.ground[r][c] || 'grass') !== sk || (m.elevation[r][c] | 0) !== se) continue; sel.add(k); st.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]); }
      this._selKind = 'terrain'; this._selElev = se;
      this._sel = sel.size ? sel : null; this._selBox = this._boxOf(sel);
      if (sel.size) this._flash('Selected ' + sel.size + ' connected ' + sk + ' cells — Del to remove');
    },
    _deleteSelection() {
      if (!this._sel) return; const m = this.world.mapSnapshot, byCell = (c, r) => (x) => !(x.col === c && x.row === r);
      for (const k of this._sel) { const [c, r] = k.split(',').map(Number);
        if (this._selKind === 'bridge') { this.world.bridges = (this.world.bridges || []).filter(byCell(c, r)); continue; }   // bridge-only: keep the terrain underneath
        this._markDirty(c, r); m.ground[r][c] = 'grass'; m.elevation[r][c] = 0;
        this.world.buildings = (this.world.buildings || []).filter(byCell(c, r));
        this.world.mobs = (this.world.mobs || []).filter(byCell(c, r));
        this.world.items = (this.world.items || []).filter(byCell(c, r));
        this.world.ramps = (this.world.ramps || []).filter(byCell(c, r));
        this.world.bridges = (this.world.bridges || []).filter(byCell(c, r));
        this.world.redstone = (this.world.redstone || []).filter(byCell(c, r));
      }
      const n = this._sel.size; this._sel = null; this._selBox = null; this._pushHistory('delete ' + n + ' cells'); this._flash('🗑 Deleted ' + n + ' cells');
    },
    _copySelection() {
      if (!this._sel) { this._flash('Nothing selected — Ctrl-drag or double-click first'); return; }
      const box = this._selBox, m = this.world.mapSnapshot, cells = [];
      for (const k of this._sel) { const [c, r] = k.split(',').map(Number), cell = { dc: c - box.c0, dr: r - box.r0, key: m.ground[r][c] || 'grass', elev: m.elevation[r][c] | 0 };
        const b = (this.world.bridges || []).find(byC(c, r)); if (b) cell.bridge = { elev: b.elev, draw: b.draw, channel: b.channel };
        const rp = (this.world.ramps || []).find(byC(c, r)); if (rp) cell.ramp = rp.kind;
        const rs = (this.world.redstone || []).find(byC(c, r)); if (rs) cell.rs = { kind: rs.kind, on: rs.on, channel: rs.channel };
        const mo = (this.world.mobs || []).find(byC(c, r)); if (mo) cell.mob = mo.type;
        const it = (this.world.items || []).find(byC(c, r)); if (it) cell.item = it.itemKey;
        cells.push(cell);
      }
      function byC(c, r) { return (x) => x.col === c && x.row === r; }
      this._clip = { w: box.c1 - box.c0 + 1, h: box.r1 - box.r0 + 1, cells }; this._pasting = true;
      this._flash('📋 Copied ' + cells.length + ' cells — click to paste · H/V flip · T rotate · Esc');
    },
    _paste(col, row) {
      if (!this._clip) return; const m = this.world.mapSnapshot;
      for (const cell of this._clip.cells) { const c = col + cell.dc, r = row + cell.dr; if (c < 0 || r < 0 || c >= m.gridW || r >= m.gridH) continue;
        this._markDirty(c, r); m.ground[r][c] = cell.key; m.elevation[r][c] = cell.elev;
        const clr = (arr) => (arr || []).filter((x) => !(x.col === c && x.row === r));
        if (cell.bridge) { this.world.bridges = clr(this.world.bridges); this.world.bridges.push({ col: c, row: r, elev: cell.bridge.elev, draw: cell.bridge.draw, channel: cell.bridge.channel }); }
        if (cell.ramp) { this.world.ramps = clr(this.world.ramps); this.world.ramps.push({ col: c, row: r, kind: cell.ramp }); }
        if (cell.rs) { this.world.redstone = clr(this.world.redstone); this.world.redstone.push({ col: c, row: r, kind: cell.rs.kind, on: cell.rs.on, channel: cell.rs.channel }); }
        if (cell.mob) { const d = P().OH_MOB_BY_KEY[cell.mob]; if (d) this.world.mobs.push({ col: c, row: r, type: cell.mob, hp: d.hp, speed: d.speed, detect: d.detect }); }
        if (cell.item) { const d = P().OH_ITEM_BY_KEY[cell.item]; if (d) this.world.items.push({ col: c, row: r, kind: d.kind, weapon: d.weapon, itemKey: cell.item }); }
      }
      this._pushHistory('paste'); this._flash('Pasted @ ' + col + ',' + row);
    },
    _flipClip(horizontal) { if (!this._clip) return; const { w, h, cells } = this._clip; for (const c of cells) { if (horizontal) c.dc = w - 1 - c.dc; else c.dr = h - 1 - c.dr; } this._flash('Clipboard ' + (horizontal ? 'flipped ↔' : 'flipped ↕')); },
    _rotateClip() { if (!this._clip) return; const { h, cells } = this._clip; for (const c of cells) { const ndc = h - 1 - c.dr, ndr = c.dc; c.dc = ndc; c.dr = ndr; } const t = this._clip.w; this._clip.w = this._clip.h; this._clip.h = t; this._flash('Clipboard rotated 90°'); },

    // ── Configuration modals (portal/pipe, goal star, spawn) ───────────────────
    _portalList() { let n = 0; return (this.world.buildings || []).filter((b) => b.typeId === 'portal' || b.typeId === 'pipe').map((b) => ({ key: b.col + ',' + b.row, n: ++n, label: '#' + n + ' ' + (b.typeId === 'pipe' ? 'Pipe' : 'Portal') + ' (' + b.col + ',' + b.row + ')' })); },
    _portalNum(b) { const p = this._portalList().find((x) => x.key === b.col + ',' + b.row); return p ? p.n : '?'; },
    // Cached palette icons (data URLs, rendered once per key).
    _icon(key, drawFn) {
      this._iconCache = this._iconCache || {};
      if (this._iconCache[key]) return this._iconCache[key];
      let url = '';
      try { const s = 20, cv = document.createElement('canvas'); cv.width = s; cv.height = s; const cx = cv.getContext('2d'); drawFn(cx, s); url = cv.toDataURL(); } catch (e) {}
      this._iconCache[key] = url; return url;
    },
    _mobIcon(mm) { return this._icon('mob:' + mm.key, (cx, s) => {   // a little side-profile creature head
      cx.fillStyle = mm.color; cx.beginPath(); cx.arc(s * 0.44, s * 0.55, s * 0.34, 0, 7); cx.fill();   // head
      cx.fillRect(s * 0.44, s * 0.46, s * 0.44, s * 0.24);   // snout
      cx.fillStyle = 'rgba(0,0,0,.25)'; cx.fillRect(s * 0.78, s * 0.46, s * 0.1, s * 0.24);   // nose shade
      cx.fillStyle = '#fff'; cx.beginPath(); cx.arc(s * 0.56, s * 0.46, s * 0.09, 0, 7); cx.fill();   // eye
      cx.fillStyle = '#000'; cx.beginPath(); cx.arc(s * 0.585, s * 0.47, s * 0.045, 0, 7); cx.fill();
      cx.fillStyle = mm.color; cx.beginPath(); cx.moveTo(s * 0.2, s * 0.28); cx.lineTo(s * 0.34, s * 0.12); cx.lineTo(s * 0.42, s * 0.34); cx.closePath(); cx.fill();   // ear
    }); },
    _itemIcon(i) { return this._icon('item:' + i.key, (cx, s) => { if (OVERHEAD.drawItemSprite) OVERHEAD.drawItemSprite(cx, i.key, s * 0.5, s * 0.52, s * 0.9); else { cx.fillStyle = i.color; cx.fillRect(2, 2, s - 4, s - 4); } }); },
    // Display name for a selected object (by KIND — not a cell lookup, so bridges/gates
    // don't report the terrain under them).
    _selName(sel) {
      if (!sel) return '';
      if (sel.kind === 'gate') return 'Gate';
      if (sel.kind === 'bridge') return sel.ref.draw ? 'Drawbridge' : 'Bridge';
      if (sel.kind === 'device') { const d = sel.ref; const isTx = d.txId != null && d.kind !== 'dust' && ['lamp', 'piston', 'rx'].indexOf(d.kind) < 0; return d.kind + (isTx ? ' · Tx #' + d.txId : ''); }   // reveal the transmit channel number
      if (sel.kind === 'building') { const t = OH_BUILDINGS.get(sel.ref.typeId); return (t && (t.name || t.label)) || sel.ref.typeId; }
      if (sel.kind === 'mob') { const d = P().OH_MOB_BY_KEY[sel.ref.type]; return (d && d.name) || sel.ref.type; }
      if (sel.kind === 'item') { const d = P().OH_ITEM_BY_KEY[sel.ref.itemKey]; return (d && d.name) || sel.ref.itemKey; }
      if (sel.kind === 'goal') return 'Goal Star';
      if (sel.kind === 'spawn') return 'Player Spawn';
      return this._hoverName(sel.col, sel.row);
    },
    // Name of whatever sits at a cell (top-most entity, else the terrain block) — for the hover tooltip.
    _hoverName(col, row) {
      const m = this.world.mapSnapshot; if (!m.ground[row]) return '';
      const b = this._buildingAt(col, row); if (b) { const t = OH_BUILDINGS.get(b.typeId); return (t && (t.name || t.label)) || b.typeId; }
      const mob = (this.world.mobs || []).find((x) => x.col === col && x.row === row); if (mob) { const d = P().OH_MOB_BY_KEY[mob.type]; return (d && d.name) || mob.type; }
      const it = (this.world.items || []).find((x) => x.col === col && x.row === row); if (it) { const d = P().OH_ITEM_BY_KEY[it.itemKey]; return (d && d.name) || it.itemKey; }
      const dev = (this.world.redstone || []).find((x) => x.col === col && x.row === row); if (dev) return dev.kind;
      if ((this.world.gates || []).some((x) => (x.col === col && x.row === row) || OVERHEAD.gateCells(x, x.rest || 0, m.gridW, m.gridH).some((cc) => cc.col === col && cc.row === row))) return 'gate';
      if ((this.world.bridges || []).some((x) => OVERHEAD.bridgeSpanCells(x).some((cc) => cc.col === col && cc.row === row))) return 'bridge';
      const e = m.elevation[row] ? (m.elevation[row][col] | 0) : 0, key = m.ground[row][col] || 'grass';
      const td = P().OH_TERRAIN_BY_KEY && P().OH_TERRAIN_BY_KEY[key];
      return ((td && (td.name || td.label)) || key) + (e > 0 ? ' · lvl ' + e : '');
    },
    _bFootprint(typeId) { return OH_BUILDINGS.footprintOf(typeId, this.world.mapSnapshot && this.world.mapSnapshot.density); },   // density-scaled (pipes/portals grow with density)
    _buildingAt(col, row) { return (this.world.buildings || []).find((b) => { const fp = this._bFootprint(b.typeId); return col >= b.col && col < b.col + fp.w && row >= b.row && row < b.row + fp.h; }); },
    // A building must be on the map, not overlap another, and (if raised) have blocks under
    // all four footprint corners to rest on. Shared by the placement ghost + actual placement.
    // Returns the ELEVATION a building would rest at (0 = ground) if it fits, or `false`.
    // A building auto-snaps onto whatever FLAT terrain is under its whole footprint — so you
    // don't have to match the active elevation, you just need level ground under it.
    _buildingFits(typeId, col, row) {
      const m = this.world.mapSnapshot, fp = this._bFootprint(typeId), fw = fp.w, fh = fp.h;
      if (col < 0 || row < 0 || col + fw > m.gridW || row + fh > m.gridH) return false;
      for (const b of (this.world.buildings || [])) { const bf = this._bFootprint(b.typeId); if (col < b.col + bf.w && col + fw > b.col && row < b.row + bf.h && row + fh > b.row) return false; }
      const h = m.elevation[row] ? (m.elevation[row][col] | 0) : 0;   // anchor-corner height = the rest level
      for (let r = row; r < row + fh; r++) for (let c = col; c < col + fw; c++) if (!(m.elevation[r] && (m.elevation[r][c] | 0) === h)) return false;   // whole footprint must be FLAT at that height
      return h;
    },
    // Hand click: move a selected mob/item, else select one, else configure a
    // portal/goal/spawn. Selecting highlights; a second click moves + unselects
    // (clicking the same one again just unselects).
    _handClick(col, row) {
      if (this._pickTx) { this._pickTxClick(col, row); return; }   // click-to-connect: toggle a transmitter
      // An object armed to MOVE: this click is its destination.
      if (this._selEnt && this._selEnt.moving) {
        const s = this._selEnt.ref;
        if (this._selEnt.kind === 'terrain') { const m = this.world.mapSnapshot, oc = this._selEnt.col, or0 = this._selEnt.row;
          if (m.ground[row] && m.ground[or0]) { this._markDirty(oc, or0); this._markDirty(col, row); m.ground[row][col] = m.ground[or0][oc]; m.elevation[row][col] = m.elevation[or0][oc] | 0; m.ground[or0][oc] = 'grass'; m.elevation[or0][oc] = 0; } }
        else if (s.from) { const dc = col - s.from.col, dr = row - s.from.row; s.from = { col, row }; s.to = { col: s.to.col + dc, row: s.to.row + dr }; }   // bridge/gate span → translate
        else { s.col = col; s.row = row; }
        this._selEnt = null; this._hideSelBar(); this._pushHistory('move'); return;
      }
      this._selectObjAt(col, row);
    },
    // Select whatever is at a cell (top-most entity, else the terrain block) + show the action bar.
    _selectObjAt(col, row) {
      const b = this._buildingAt(col, row);
      const m0 = this.world.mapSnapshot;
      const gt = (this.world.gates || []).find((x) => (x.col === col && x.row === row) || OVERHEAD.gateCells(x, x.rest || 0, m0.gridW, m0.gridH).some((cc) => cc.col === col && cc.row === row));   // hinge OR any panel cell
      const dev = (this.world.redstone || []).find((d) => d.col === col && d.row === row);
      const span = (this.world.bridges || []).find((x) => OVERHEAD.bridgeSpanCells(x).some((cc) => cc.col === col && cc.row === row));
      const mob = (this.world.mobs || []).find((m) => m.col === col && m.row === row);
      const item = (this.world.items || []).find((it) => it.col === col && it.row === row);
      const goal = (this.world.goal && this.world.goal.col === col && this.world.goal.row === row) ? this.world.goal : null;
      const spawn = (this.world.spawns || []).find((s) => s.col === col && s.row === row);
      let sel = null;
      if (b) sel = { kind: 'building', ref: b, col, row };
      else if (gt) sel = { kind: 'gate', ref: gt, col, row };
      else if (dev) sel = { kind: 'device', ref: dev, col, row };
      else if (span) sel = { kind: 'bridge', ref: span, col, row };
      else if (mob) sel = { kind: 'mob', ref: mob, col, row };
      else if (item) sel = { kind: 'item', ref: item, col, row };
      else if (goal) sel = { kind: 'goal', ref: goal, col, row };
      else if (spawn) sel = { kind: 'spawn', ref: spawn, col, row };
      else { const m = this.world.mapSnapshot; if (m.ground[row]) sel = { kind: 'terrain', col, row }; }
      this._selEnt = sel; this._renderSelBar();
    },
    _selHasSettings(sel) { return !!(sel && (sel.kind === 'device' || sel.kind === 'gate' || sel.kind === 'bridge' || sel.kind === 'goal' || sel.kind === 'spawn' || (sel.kind === 'building' && (sel.ref.typeId === 'portal' || sel.ref.typeId === 'pipe')))); },
    _selMovable(sel) { return !!(sel && (sel.kind === 'building' || sel.kind === 'mob' || sel.kind === 'item' || sel.kind === 'device' || sel.kind === 'bridge' || sel.kind === 'terrain')); },
    _openSettingsFor(sel) {
      if (!sel) return;
      if (sel.kind === 'device') return this._deviceModal(sel.ref);
      if (sel.kind === 'gate') return this._gateModal(sel.ref);
      if (sel.kind === 'bridge') return this._bridgeModal(sel.ref);
      if (sel.kind === 'goal') return this._goalModal();
      if (sel.kind === 'spawn') return this._spawnModal(sel.ref);
      if (sel.kind === 'building' && (sel.ref.typeId === 'portal' || sel.ref.typeId === 'pipe')) return this._portalModal(sel.ref);
      this._flash('No settings for this ' + sel.kind);
    },
    _deleteSel() {
      const sel = this._selEnt; if (!sel) return;
      if (sel.kind === 'terrain') { const m = this.world.mapSnapshot; this._markDirty(sel.col, sel.row); if (m.ground[sel.row]) { m.ground[sel.row][sel.col] = 'grass'; m.elevation[sel.row][sel.col] = 0; } this._selEnt = null; this._hideSelBar(); this._pushHistory('delete block'); this._flash('🗑 Deleted block'); }
      else { this._hideSelBar(); this._deleteObj(sel.ref); }   // _deleteObj clears _selEnt + pushes history + flashes
    },
    _renderSelBar() {
      let bar = document.getElementById('oh-selbar');
      if (!this._selEnt) { if (bar) bar.style.display = 'none'; return; }
      if (!bar) { bar = document.createElement('div'); bar.id = 'oh-selbar'; bar.style.cssText = 'position:fixed;z-index:9200;display:flex;gap:4px;align-items:center;background:#1a2233;border:1px solid #46557a;border-radius:8px;padding:4px 5px;box-shadow:0 4px 14px rgba(0,0,0,.55);font:12px sans-serif'; document.body.appendChild(bar); }
      const sel = this._selEnt, name = this._selName(sel);
      const btn = (id, txt, bg) => `<button data-sb="${id}" style="background:${bg || '#2b3548'};border:1px solid #46557a;color:#dfe7f5;border-radius:6px;padding:5px 9px;cursor:pointer;white-space:nowrap">${txt}</button>`;
      bar.innerHTML = `<span style="color:#9fb0cc;padding:0 6px;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${name}</span>`
        + (this._selMovable(sel) ? btn('move', '✥ Move') : '')
        + (this._selHasSettings(sel) ? btn('settings', '⚙') : '')
        + btn('delete', '🗑', '#7a2b2b');
      bar.style.display = 'flex';
      bar.querySelectorAll('[data-sb]').forEach((b) => b.onclick = () => { const a = b.dataset.sb; if (a === 'move') { this._selEnt.moving = true; this._flash('Click a new cell to move it (Esc to cancel)'); this._hideSelBar(); } else if (a === 'settings') this._openSettingsFor(this._selEnt); else if (a === 'delete') this._deleteSel(); });
      this._positionSelBar();
    },
    _positionSelBar() {
      const bar = document.getElementById('oh-selbar'); if (!bar || !this._selEnt || bar.style.display === 'none') return;
      const cv = document.getElementById('gameCanvas'); if (!cv) return; const rect = cv.getBoundingClientRect();
      const sp = OH_GRID.worldToScreen(this.grid, this.cam, (this._selEnt.col + 0.5) * this.grid.cell, this._selEnt.row * this.grid.cell);
      const e = (this.world.mapSnapshot.elevation[this._selEnt.row] ? (this.world.mapSnapshot.elevation[this._selEnt.row][this._selEnt.col] | 0) : 0) * OVERHEAD.elevOffset(this.grid.cell * this.grid.masterZoom);
      const cx = rect.left + (sp.x + (this._leftInset || 0) - e) * (rect.width / CANVAS_W), cy = rect.top + (sp.y + (this._topInset || 0) - e) * (rect.height / CANVAS_H);
      bar.style.left = Math.max(4, cx - bar.offsetWidth / 2) + 'px'; bar.style.top = Math.max(52, cy - 40) + 'px';
    },
    _hideSelBar() { const bar = document.getElementById('oh-selbar'); if (bar) bar.style.display = 'none'; },
    _nextTxId() { let mx = 0; for (const d of (this.world.redstone || [])) if (typeof d.txId === 'number' && d.txId > mx) mx = d.txId; return mx + 1; },
    // Multi-select checklist of every OTHER device's Tx number (labelled by name) to
    // listen to — the side-scroll Tx/Rx model.
    _txChecklist(cls, listenIds, excludeCol, excludeRow) {
      const others = (this.world.redstone || []).filter((x) => x.txId != null && x.kind !== 'dust' && ['lamp', 'piston', 'rx'].indexOf(x.kind) < 0 && !(x.col === excludeCol && x.row === excludeRow));
      const set = Array.isArray(listenIds) ? listenIds : [];
      const summary = set.length
        ? `<p style="color:#7fe0a0;font-size:12px;margin:2px 0">Listening to: ${set.map((id) => 'Tx #' + id).join(', ')}</p>`
        : `<p style="color:#8fa0bd;font-size:12px;margin:2px 0">Not listening to any transmitter yet.</p>`;
      if (!others.length) return summary + `<p style="color:#8fa0bd;font-size:12px">No transmitters on the map — place a lever / plate / gate first.</p>`;
      // Selected transmitters sort to the TOP (then by number), so it's clear what's wired.
      const sorted = others.slice().sort((a, b) => (set.indexOf(a.txId) >= 0 ? 0 : 1) - (set.indexOf(b.txId) >= 0 ? 0 : 1) || a.txId - b.txId);
      return summary + `<div style="max-height:150px;overflow:auto;margin:4px 0;border:1px solid #2c3648;border-radius:6px;padding:4px">` +
        sorted.map((o) => `<label style="display:flex;gap:8px;align-items:center;padding:3px 4px"><input type="checkbox" class="${cls}" value="${o.txId}" ${set.indexOf(o.txId) >= 0 ? 'checked' : ''}> Tx #${o.txId} — ${o.kind} @${o.col},${o.row}</label>`).join('') + `</div>`;
    },
    // Redstone device config: shows this device's auto Tx number + name, a multi-select
    // of sources to RECEIVE from (rxIds), plus lever start-state / weight threshold.
    // A pure receiver (lamp/piston) must pick at least one source.
    _deviceModal(d) {
      const isGate = (d.kind === 'and' || d.kind === 'not' || d.kind === 'nor');
      const isSink = (d.kind === 'lamp' || d.kind === 'piston' || d.kind === 'rx');
      const isLock = (d.kind === 'lock');
      // Only transmitters carry a Tx number; a SINK receives (rxIds), it never broadcasts.
      if (!isSink && d.txId == null) d.txId = this._nextTxId();
      const sideRow = (cls, sel) => ['n', 's', 'e', 'w'].map((s) => `<label style="display:inline-flex;gap:4px;margin-right:10px"><input type="checkbox" class="${cls}" value="${s}" ${(sel || []).indexOf(s) >= 0 ? 'checked' : ''}> ${s.toUpperCase()}</label>`).join('');
      let inner = isSink
        ? `<p style="color:#cfe0ff;font-size:13px;margin:0 0 8px">Receives a signal — <b>${d.kind}</b> @ ${d.col},${d.row}</p>`
        : `<p style="color:#cfe0ff;font-size:13px;margin:0 0 8px">Broadcasts as <b>Tx #${d.txId}</b> — ${d.kind} @ ${d.col},${d.row}</p>`;
      if (d.kind === 'lever' || d.kind === 'button') inner += `<label style="display:flex;gap:8px;align-items:center;margin-bottom:8px"><input type="checkbox" id="dv-on" ${d.on ? 'checked' : ''}> Starts ON</label>`;
      if (d.kind === 'weight') inner += `<label>Weight threshold (entities) <input type="number" id="dv-thr" min="1" value="${d.threshold || 1}"></label>`;
      if (isGate) { inner += `<div style="font-size:12px;color:#9fb0cc;margin-top:6px">Input sides:</div><div style="margin:4px 0">${sideRow('gt-in', d.inputs)}</div><div style="font-size:12px;color:#9fb0cc">Output sides:</div><div style="margin:4px 0">${sideRow('gt-out', d.outputs)}</div>`; }
      else if (isSink) { inner += `<div style="font-size:12px;color:#9fb0cc;margin-top:6px">Receive from (pick at least one):</div>` + this._txChecklist('dv-rx', d.rxIds, d.col, d.row); }
      if (d.kind === 'piston') {
        const dir = d.dir || 'up', dopt = (v, lbl) => `<option value="${v}" ${dir === v ? 'selected' : ''}>${lbl}</option>`;
        inner += `<div style="font-size:12px;color:#9fb0cc;margin-top:8px">Push direction:</div>
          <select id="dv-dir" style="margin:3px 0;width:100%">${dopt('up', 'Up — raise the block + rider (elevator / gate)')}${dopt('n', 'North ↑')}${dopt('s', 'South ↓')}${dopt('e', 'East →')}${dopt('w', 'West ←')}</select>
          <label style="display:block;margin-top:4px">Reach (levels / cells): <input type="number" id="dv-reach" min="1" max="4" value="${d.reach || 2}" style="width:52px"></label>
          <label style="display:flex;gap:8px;align-items:center;margin-top:4px"><input type="checkbox" id="dv-sticky" ${d.sticky ? 'checked' : ''}> Sticky — pull the block/head back in when it retracts</label>`;
      }
      if (isLock) {
        const keys = this._keysOnMap(), sel = d.acceptKeys || [];
        inner += `<div style="font-size:12px;color:#9fb0cc;margin-top:6px">Accepted keys (leave all unchecked = any key):</div>`;
        inner += keys.length ? `<div style="margin:4px 0">${keys.map((k) => `<label style="display:inline-flex;gap:4px;margin-right:10px"><input type="checkbox" class="lk-key" value="${k}" ${sel.indexOf(k) >= 0 ? 'checked' : ''}> ${k}</label>`).join('')}</div>` : `<p style="color:#8fa0bd;font-size:12px">No keys placed on the map yet — add a key/jewel item first.</p>`;
        inner += `<label style="display:flex;gap:8px;align-items:center;margin-top:4px"><input type="checkbox" id="lk-consume" ${d.consume ? 'checked' : ''}> Consume the key</label>`;
        inner += `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="lk-toggle" ${d.toggle ? 'checked' : ''}> Can be turned off again (else stays unlocked)</label>`;
      }
      this._cfgModal('Redstone: ' + d.kind + (isSink ? ' (Rx)' : ' (Tx #' + d.txId + ')'), inner, () => {
        if (d.kind === 'lever' || d.kind === 'button') d.on = document.getElementById('dv-on').checked;
        if (d.kind === 'weight') { const t = document.getElementById('dv-thr'); if (t) d.threshold = Math.max(1, parseInt(t.value, 10) || 1); }
        if (isGate) { const rd = (c) => [].slice.call(document.querySelectorAll('.' + c + ':checked')).map((el) => el.value); d.inputs = rd('gt-in'); d.outputs = rd('gt-out'); if (!d.outputs.length) d.outputs = ['e']; if (!d.inputs.length) d.inputs = ['w']; }
        else if (isSink) { const ids = [].slice.call(document.querySelectorAll('.dv-rx:checked')).map((el) => +el.value); if (!ids.length) { this._flash('⚠ A receiver needs at least one source — not saved'); throw new Error('rx required'); } d.rxIds = ids; d.rxChannel = undefined; }
        if (d.kind === 'piston') { const ds = document.getElementById('dv-dir'); if (ds) d.dir = ds.value; const rc = document.getElementById('dv-reach'); if (rc) d.reach = Math.max(1, Math.min(4, parseInt(rc.value, 10) || 2)); const st = document.getElementById('dv-sticky'); if (st) d.sticky = st.checked; }
        if (isLock) { d.acceptKeys = [].slice.call(document.querySelectorAll('.lk-key:checked')).map((el) => el.value); d.consume = document.getElementById('lk-consume').checked; d.toggle = document.getElementById('lk-toggle').checked; }
      }, d, isSink ? { target: d } : null);
    },
    // Unique key ids currently placed on the map (for the Lock's accepted-keys list).
    _keysOnMap() {
      // Robust: an item may carry itemKey (editor) or a legacy `key`; and it already
      // stamps its own kind at placement. Trust that kind:'key' AND the palette def, and
      // derive the keyId locally (strip the "<type>_" prefix: key_gold→gold, jewel_emerald
      // →emerald, passcard→passcard) so this works even if the palette lookup misses.
      const s = new Set();
      const byKey = (P() && P().OH_ITEM_BY_KEY) || {};
      for (const it of (this.world.items || [])) {
        const k = it.itemKey || it.key;
        const def = k ? byKey[k] : null;
        if ((def && def.kind === 'key') || it.kind === 'key') {
          s.add((def && def.keyId) || (k ? String(k).replace(/^[^_]*_/, '') : k));
        }
      }
      return Array.from(s);   // NB: [].slice.call(aSet) === [] — a Set is not array-like
    },
    // A bridge span: per-bridge guardrails, whether it's a drawbridge (raises on
    // redstone), and — if so — which transmitters raise it. Move/Delete built in.
    _bridgeModal(b) {
      const cur = Array.isArray(b.rxIds) ? b.rxIds : [], cells = OVERHEAD.bridgeSpanCells(b);
      const railOn = b.rail != null ? b.rail : !(this.world.settings && this.world.settings.bridgeGuardrails === false);
      let inner = `<p style="color:#8fa0bd;font-size:12px;margin:0 0 8px">${cells.length}-cell span @ elev ${b.elev | 0}</p>`;
      inner += `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="br-rail" ${railOn ? 'checked' : ''}> Guardrails (can't fall off the sides)</label>`;
      inner += `<label style="display:flex;gap:8px;align-items:center;margin-top:6px"><input type="checkbox" id="br-draw" ${b.draw ? 'checked' : ''}> Drawbridge (moves on a redstone signal)</label>`;
      inner += `<label style="display:flex;gap:8px;align-items:center;margin-top:2px"><input type="checkbox" id="br-startdown" ${b.startDown ? 'checked' : ''}> Rests DOWN — signal RAISES it to block (else rests raised, signal lowers it to cross)</label>`;
      inner += `<div style="font-size:12px;color:#9fb0cc;margin-top:6px">Signal source (drawbridge only):</div>` + this._txChecklist('br-rx', cur, -1, -1);
      this._cfgModal('Bridge span', inner, () => {
        b.rail = document.getElementById('br-rail').checked;
        b.draw = document.getElementById('br-draw').checked;
        b.startDown = document.getElementById('br-startdown').checked;
        const ids = [].slice.call(document.querySelectorAll('.br-rx:checked')).map((el) => +el.value);
        if (b.draw) { b.rxIds = ids.length ? ids : undefined; b.channel = ids.length ? undefined : 'gate'; } else { b.rxIds = undefined; b.channel = undefined; }
      }, b, { target: b, isBridge: true });
    },
    _gateModal(gt) {
      const cur = Array.isArray(gt.rxIds) ? gt.rxIds : [];
      const aopt = (v) => `<option value="${v}" ${(gt.angle || 90) === v ? 'selected' : ''}>${v > 0 ? '+' : ''}${v}°</option>`;
      let inner = `<p style="color:#8fa0bd;font-size:12px;margin:0 0 8px">Hinge @ ${gt.col},${gt.row} · length ${gt.len} · rest ${gt.rest || 0}°. The panel swings from its rest position by this angle when powered (stops on obstructions).</p>`;
      inner += `<label style="display:block">Powered swing angle: <select id="gt-ang">${[45, 90, 135, 180, -45, -90, -135, -180].map(aopt).join('')}</select></label>`;
      inner += `<label style="display:block;margin-top:4px">Height (levels): <input type="number" id="gt-h" min="1" max="4" value="${gt.height || 2}" style="width:52px"></label>`;
      inner += `<div style="font-size:12px;color:#9fb0cc;margin-top:6px">Signal source (leave empty = channel "gate"):</div>` + this._txChecklist('gt-rx', cur, -1, -1);
      this._cfgModal('Swinging gate', inner, () => {
        gt.angle = parseInt(document.getElementById('gt-ang').value, 10) || 90;
        gt.height = Math.max(1, Math.min(4, parseInt(document.getElementById('gt-h').value, 10) || 2));
        const ids = [].slice.call(document.querySelectorAll('.gt-rx:checked')).map((el) => +el.value);
        gt.rxIds = ids.length ? ids : undefined; gt.channel = ids.length ? undefined : 'gate';
      }, gt, { target: gt });
    },
    // Called from a config modal's "Move" button — closes the modal and arms the
    // click-to-move indicator on the object.
    _startMove(ref) { this._selEnt = { kind: 'obj', ref }; this.tool = 'hand'; this._renderBar(); },
    _openConfigAt(col, row) {
      const b = this._buildingAt(col, row);
      if (b && (b.typeId === 'portal' || b.typeId === 'pipe')) return this._portalModal(b);
      if (this.world.goal && this.world.goal.col === col && this.world.goal.row === row) return this._goalModal();
      const sp = (this.world.spawns || []).find((s) => s.col === col && s.row === row);
      if (sp) return this._spawnModal(sp);
      this._flash('Nothing to configure here — click a portal/pipe, goal, or spawn.');
    },
    _cfgModal(title, inner, onSave, moveRef, pickCfg) {
      let ov = document.getElementById('oh-cfg-modal');
      if (!ov) { ov = document.createElement('div'); ov.id = 'oh-cfg-modal'; ov.style.cssText = 'position:fixed;inset:0;z-index:9550;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6)'; document.body.appendChild(ov); }
      ov.style.display = 'flex';
      const pickBtn = pickCfg ? `<button id="cfg-pick">＋ Pick on map</button>` : '';
      const extra = moveRef ? `<button id="cfg-move">✥ Move</button><button id="cfg-del" style="background:#7a2b2b;border-color:#a85252">🗑 Delete</button>` : '';
      ov.innerHTML = `<div class="ohc-panel"><h2>${title}</h2>${inner}<div class="ohc-btns">${pickBtn}${extra}<button id="cfg-cancel">Cancel</button><button class="primary" id="cfg-save">Save</button></div></div>`;
      document.getElementById('cfg-cancel').onclick = () => { ov.style.display = 'none'; };
      document.getElementById('cfg-save').onclick = () => { try { onSave(); } catch (e) {} ov.style.display = 'none'; };
      if (moveRef) {
        document.getElementById('cfg-move').onclick = () => { try { onSave(); } catch (e) {} ov.style.display = 'none'; this._startMove(moveRef); };
        document.getElementById('cfg-del').onclick = () => { ov.style.display = 'none'; this._deleteObj(moveRef); };
      }
      // "Pick on map": save the current checkboxes, close, then arm click-to-connect so
      // clicking transmitters on the canvas toggles them in this receiver's rxIds.
      if (pickCfg) document.getElementById('cfg-pick').onclick = () => { try { onSave(); } catch (e) {} ov.style.display = 'none'; this._armPickTx(pickCfg); };
    },
    // ── Click-to-connect: pick transmitters on the map instead of hunting the list ──
    _armPickTx(cfg) { this._pickTx = cfg; this.tool = 'hand'; this._renderBar(); this._updateCursor(); this._flash('Click transmitters on the map to toggle · Esc when done'); },
    _endPickTx() { const cfg = this._pickTx; this._pickTx = null; if (!cfg) return; this._pushHistory('wire receiver'); if (cfg.isBridge) this._bridgeModal(cfg.target); else this._deviceModal(cfg.target); },
    _pickTxClick(col, row) {
      const t = (this.world.redstone || []).find((d) => d.col === col && d.row === row);
      const isTx = t && t.txId != null && t.kind !== 'dust' && ['lamp', 'piston', 'rx'].indexOf(t.kind) < 0;
      if (!isTx) { this._flash('Not a transmitter — click a lever / plate / gate / lock'); return; }
      const tgt = this._pickTx.target; tgt.rxIds = Array.isArray(tgt.rxIds) ? tgt.rxIds : [];
      const i = tgt.rxIds.indexOf(t.txId);
      if (i >= 0) { tgt.rxIds.splice(i, 1); this._flash('Removed Tx #' + t.txId); }
      else { tgt.rxIds.push(t.txId); this._flash('Listening to Tx #' + t.txId); }
      if (this._pickTx.isBridge) { tgt.draw = true; tgt.channel = tgt.rxIds.length ? undefined : 'gate'; }
    },
    // Remove an object (device / bridge / building / mob / item / ramp / spawn / goal) by reference.
    _deleteObj(ref) {
      ['redstone', 'bridges', 'gates', 'buildings', 'mobs', 'items', 'ramps', 'spawns'].forEach((k) => { if (Array.isArray(this.world[k])) this.world[k] = this.world[k].filter((x) => x !== ref); });
      if (this.world.goal === ref) this.world.goal = null;
      this._selEnt = null; this._pushHistory('delete'); this._flash('🗑 Deleted');
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
          if (b.config.twoWay && dest) { const other = (this.world.buildings || []).find((x) => (x.col + ',' + x.row) === dest); if (other) { other.config = other.config || {}; other.config.dest = b.col + ',' + b.row; } } }, b);
    },
    _goalModal() {
      const colors = (typeof GOAL_COLORS !== 'undefined') ? GOAL_COLORS : [{ name: 'Gold', hex: '#ffd700' }];
      const cur = this.world.goal.color || 0;
      const opts = colors.map((c, i) => `<option value="${i}" ${cur === i ? 'selected' : ''}>Goal Star ${i + 1} — ${c.name}</option>`).join('');
      this._cfgModal('Goal Star', `<label>Colour (campaign routing) <select id="cfg-color">${opts}</select></label>
        <p style="color:#8fa0bd;font-size:12px">Campaign mode routes each coloured Goal Star to a different next level.</p>`,
        () => { this.world.goal.color = parseInt(document.getElementById('cfg-color').value, 10) || 0; }, this.world.goal);
    },
    _spawnModal(sp) {
      const portals = this._portalList();
      const opts = `<option value="">(start on the ground)</option>` + portals.map((p) => `<option value="${p.key}" ${sp.fromPortal === p.key ? 'selected' : ''}>${p.label}</option>`).join('');
      this._cfgModal('Player Spawn', `<label>Emerge from a portal <select id="cfg-from">${opts}</select></label>
        <p style="color:#8fa0bd;font-size:12px">Link a portal/pipe and the player starts the level coming out of it.</p>`,
        () => { sp.fromPortal = document.getElementById('cfg-from').value || null; }, sp);
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
          const key = this.worldId || ('oh-' + name);
          // Preserve the original creation time (or stamp one now) so the Sandbox card
          // shows a date and Newest-sort has something to order on.
          worldData.created_at = worldData.created_at || (all[key] && all[key].created_at) || new Date().toISOString();
          all[key] = worldData; this.worldId = key;
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
      const _pt0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
      const cv = document.getElementById('gameCanvas'); const ctx = cv.getContext('2d');
      const g = this.grid, m = this.world.mapSnapshot, z = g.masterZoom, cs = g.cell * z;
      { const zr = document.getElementById('oh-zoom'); if (zr && document.activeElement !== zr && +zr.value !== z) zr.value = z; }   // keep the zoom slider in sync with wheel/buttons/keys
      // Match the play-time elevation scale to the world's player height (see elevOffset).
      if (typeof OVERHEAD !== 'undefined') { OVERHEAD._elevScale = 1 / Math.max(1, (this.world.settings && this.world.settings.playerHeight) || 1); OVERHEAD._elevBase = Math.min(0.5, Math.max(0.1, (this.world.settings && this.world.settings.elevOffset) || 0.22)); }
      // Reserve a top strip so the fixed 40px command bar never covers the map (incl.
      // its top edge indicator). Bar is 40px SCREEN → convert to canvas-logical px via
      // the current display scale so the map content starts just below it.
      const rectC = cv.getBoundingClientRect(), rectH = rectC.height || CANVAS_H, rectW = rectC.width || CANVAS_W;
      const TOP = Math.max(0, Math.min(140, Math.round(46 * (CANVAS_H / rectH))));
      // The editable area fills everything NOT covered by the top / left / right fixed rails —
      // insets convert the DOM rail widths to canvas-logical px (like TOP for the command bar).
      const LO = this._railLayout || this._defaultLayout();
      const LEFT = Math.round(((LO.leftWidth || 120) + 16) * (CANVAS_W / rectW));
      const RIGHT = (LO.right && LO.right.length) || LO.rightWidth ? Math.round(((LO.rightWidth || 0) + 16) * (CANVAS_W / rectW)) : 0;
      this._topInset = TOP; this._leftInset = LEFT; this._rightInset = RIGHT;
      const VW = CANVAS_W - LEFT - RIGHT, VH = CANVAS_H - TOP;   // visible content area
      this.cam = OH_GRID.clampCamera(g, this.cam, VW, VH);
      ctx.fillStyle = '#0c0f16'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      const S = (wx, wy) => { const p = OH_GRID.worldToScreen(g, this.cam, wx, wy); return { x: p.x + LEFT, y: p.y + TOP }; };
      const c0 = Math.max(0, (this.cam.x / g.cell | 0) - 1), c1 = Math.min(m.gridW - 1, ((this.cam.x + VW / z) / g.cell | 0) + 1);
      const r0 = Math.max(0, (this.cam.y / g.cell | 0) - 1), r1 = Math.min(m.gridH - 1, ((this.cam.y + VH / z) / g.cell | 0) + 1);
      const Q = OVERHEAD.elevOffset(cs);
      const maxE = this._mapMaxElev();
      const hiAbove = (e) => this.view.hideAbove && (e | 0) > this.elevLevel;   // "see inside mountains" filter
      // PERF: terrain is a WORLD-SPACE CACHE blitted every frame (one drawImage, not thousands
      // of cubes). Committed edits PATCH just the touched region into the cache (no full
      // rebuild); an in-progress brush stroke repaints only its edited region live on top of
      // the blit (_editBox). A full rebuild happens only on view change / undo / redo.
      const key = (this.view.elev ? 1 : 0) + '|' + (this.view.hideAbove ? this.elevLevel : '-') + '|' + ((this.world.settings && this.world.settings.playerHeight) || 1) + '|' + ((this.world.settings && this.world.settings.elevOffset) || 0.22) + '|' + (this._terrRev || 0) + '|' + m.gridW + 'x' + m.gridH;
      if (!this._terrCache || this._terrCacheKey !== key) { this._buildTerrCache(m, g, maxE); this._terrCacheKey = key; }
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this._terrCache, this.cam.x + this._terrCachePad, this.cam.y + this._terrCachePad, VW / z, VH / z, LEFT, TOP, VW, VH);
      if (this._editBox) this._drawEditRegion(ctx, S, cs, Q, maxE, hiAbove);   // in-progress brush stroke, live
      // ELEVATION-CLARITY overlay: the ACTIVE-elevation cells stay bright + outlined; every cell
      // NOT at the active elevation is greyed (a distinct artifact + faint hatch) so the layer
      // you're editing pops. Heights are labelled when zoomed in. Cheap per-visible-cell fills.
      if (!this.view.elev) {
        const focus = this.view.focusLayer !== false, below = this.elevLevel - 1;   // the layer you BUILD ON — kept full colour
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
          const e0 = m.elevation[r][c] | 0, e = this._capE(e0), sp = S(c * g.cell, r * g.cell), tx = sp.x - e * Q, ty = sp.y - e * Q;
          if (e === this.elevLevel) { ctx.fillStyle = 'rgba(255,236,110,.22)'; ctx.fillRect(tx, ty, cs, cs); ctx.strokeStyle = 'rgba(255,226,80,.92)'; ctx.lineWidth = Math.max(1, cs * 0.06); ctx.strokeRect(tx + .5, ty + .5, cs - 1, cs - 1); }
          else if (focus && e0 !== below) { ctx.fillStyle = 'rgba(64,70,86,.36)'; ctx.fillRect(tx, ty, cs, cs);   // grey everything except the active level + the surface directly below it
            if (cs > 10) { ctx.strokeStyle = 'rgba(200,208,224,.28)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(tx, ty + cs); ctx.lineTo(tx + cs, ty); ctx.moveTo(tx + cs * 0.5, ty + cs); ctx.lineTo(tx + cs, ty + cs * 0.5); ctx.stroke(); } }
          if (cs > 16 && e0 > 0) { ctx.fillStyle = e0 > this.elevLevel ? 'rgba(255,206,120,.92)' : 'rgba(255,255,255,.62)'; ctx.font = `${Math.max(7, cs * 0.28) | 0}px sans-serif`; ctx.textAlign = 'left'; ctx.fillText(String(e0), tx + 2, ty + Math.max(9, cs * 0.36)); }
        }
      }
      // Entities.
      const unitPx = g.cell * (g.density || 1) * g.masterZoom;   // player-scale in editor px
      if (this.view.buildings) for (const b of this.world.buildings) { if (hiAbove(b.level || 0)) continue; const fp = this._bFootprint(b.typeId); const w = fp.w * cs, h = fp.h * cs; const lv = (b.level || 0); const sp = S(b.col * g.cell, b.row * g.cell); const bx = sp.x - lv * Q, by = sp.y - lv * Q; OVERHEAD.drawBuilding(ctx, b.typeId, bx, by, w, h, Math.min(1, cs / 28), b.skin || 'default');
        if (b.typeId === 'portal' || b.typeId === 'pipe') { const br = Math.max(11, cs * 0.5), cyN = by + cs * 0.4; ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.beginPath(); ctx.arc(bx + w / 2, cyN, br, 0, 7); ctx.fill(); ctx.strokeStyle = '#b56bde'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.max(12, cs * 0.55) | 0}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('#' + this._portalNum(b), bx + w / 2, cyN); ctx.textBaseline = 'alphabetic'; } }
      if (this.view.mobs) for (const mo of this.world.mobs) { if (hiAbove(m.elevation[mo.row] ? m.elevation[mo.row][mo.col] : 0)) continue; const d = P().OH_MOB_BY_KEY[mo.type] || P().OH_MOBS[0]; const sp = S((mo.col + 0.5) * g.cell, (mo.row + 0.5) * g.cell); ctx.strokeStyle = 'rgba(150,150,160,.9)'; ctx.lineWidth = 2; ctx.fillStyle = d.color; ctx.beginPath(); ctx.arc(sp.x, sp.y, unitPx * 0.34, 0, 7); ctx.fill(); ctx.stroke(); }
      if (this.view.items) for (const it of this.world.items) { if (hiAbove(m.elevation[it.row] ? m.elevation[it.row][it.col] : 0)) continue; const sp = S((it.col + 0.5) * g.cell, (it.row + 0.5) * g.cell); OVERHEAD.drawItemSprite(ctx, it.itemKey, sp.x, sp.y, unitPx * 0.8); }
      // Swinging gates — block-based panels at rest, plus a dashed arc hint for the powered swing.
      if ((this.world.gates || []).length) {
        OVERHEAD.drawGates(ctx, S, cs, g.cell, this.world.gates, (gt) => OVERHEAD.gateCells(gt, gt.rest || 0, m.gridW, m.gridH));
        for (const gt of this.world.gates) {
          const a = (gt.rest || 0) * Math.PI / 180, hy = (gt.height || 2) * Q, hinge = S((gt.col + 0.5) * g.cell, (gt.row + 0.5) * g.cell);
          const R2 = (gt.len || 1) * cs; ctx.save(); ctx.strokeStyle = 'rgba(130,205,255,.55)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.arc(hinge.x - hy, hinge.y - hy, R2, a, a + (gt.angle || 90) * Math.PI / 180, (gt.angle || 90) < 0); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
        }
      }
      // Template overlay voxels (placed models — trees/houses) — additive on top of terrain.
      for (const v of this._templateVoxels()) { if (hiAbove(v.elev)) continue; const sp = S(v.col * g.cell, v.row * g.cell); OVERHEAD.drawTerrainCube(ctx, v.block, sp.x - (v.elev - 1) * Q, sp.y - (v.elev - 1) * Q, cs, 1, true, true); }
      for (const spn of (this.world.spawns || [])) { const sp = S((spn.col + 0.5) * g.cell, (spn.row + 0.5) * g.cell); ctx.strokeStyle = '#4aa3ff'; ctx.lineWidth = 2; ctx.strokeRect(sp.x - cs * 0.42, sp.y - cs * 0.42, cs * 0.84, cs * 0.84); if (cs > 14) { ctx.fillStyle = '#4aa3ff'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('P1', sp.x, sp.y + 3); } }
      for (const rp of (this.world.ramps || [])) { if (hiAbove(m.elevation[rp.row] ? m.elevation[rp.row][rp.col] : 0)) continue; const sp = S((rp.col + 0.5) * g.cell, (rp.row + 0.5) * g.cell); const dir = OVERHEAD.rampDir((c, r) => (m.elevation[r] ? (m.elevation[r][c] | 0) : 0), rp.col, rp.row); OVERHEAD.drawRampIcon(ctx, rp.kind, sp.x, sp.y, cs, dir); }
      // Bridge SPANS (always shown as the deck in the editor; drawbridges get a ⚡ tag).
      const worldRail = !(this.world.settings && this.world.settings.bridgeGuardrails === false);
      for (const b of (this.world.bridges || [])) { if (hiAbove(b.elev | 0)) continue; const cells = OVERHEAD.bridgeSpanCells(b), lv = b.elev | 0, rails = b.rail != null ? b.rail : worldRail;
        const inSpan = (c, r) => cells.some((cc) => cc.col === c && cc.row === r);
        for (const cell of cells) { const sp = S(cell.col * g.cell, cell.row * g.cell), x = sp.x - lv * Q, y = sp.y - lv * Q;
          const edges = { n: !inSpan(cell.col, cell.row - 1), s: !inSpan(cell.col, cell.row + 1), w: !inSpan(cell.col - 1, cell.row), e: !inSpan(cell.col + 1, cell.row) };
          OVERHEAD.drawBridgeCell(ctx, x, y, cs, { rail: rails, closed: true, edges }); }
        if (b.draw && cs > 12) { const f = cells[0], sp = S(f.col * g.cell, f.row * g.cell); ctx.fillStyle = '#ffd23a'; ctx.font = `${Math.max(7, cs * 0.3) | 0}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('⚡', sp.x - lv * Q + cs / 2, sp.y - lv * Q + cs * 0.62); } }
      // Bridge placement preview (from the first-clicked cliff to the cursor).
      if (this.tool === 'bridge' && this._bridgeStart && this._hover) { ctx.save(); ctx.globalAlpha = 0.5; for (const cell of OVERHEAD.spanCells(this._bridgeStart, this._hover)) { const sp = S(cell.col * g.cell, cell.row * g.cell); OVERHEAD.drawBridgeCell(ctx, sp.x, sp.y, cs, { rail: worldRail, closed: true, edges: { n: true, e: true, s: true, w: true } }); } ctx.restore(); }
      // Redstone devices (character-scaled so they stay legible at any density).
      { const u = g.cell * (g.density || 1) * g.masterZoom;
        for (const d of (this.world.redstone || [])) { if (hiAbove(m.elevation[d.row] ? m.elevation[d.row][d.col] : 0)) continue; const sp = S((d.col + 0.5) * g.cell, (d.row + 0.5) * g.cell), tl = S(d.col * g.cell, d.row * g.cell);
          if (d.kind === 'lever' || d.kind === 'button') OVERHEAD.drawLever(ctx, sp.x, sp.y, u * 0.9, !!d.on);
          else if (d.kind === 'lock') OVERHEAD.drawLock(ctx, tl.x, tl.y, cs, false);
          else if (d.kind === 'dust') OVERHEAD.drawDust(ctx, tl.x, tl.y, cs, false);
          else if (d.kind === 'lamp') OVERHEAD.drawLamp(ctx, sp.x, sp.y, u * 0.8, false);
          else if (d.kind === 'plate' || d.kind === 'weight') OVERHEAD.drawPlate(ctx, sp.x, sp.y, u * 0.7, false, d.kind === 'weight');
          else if (d.kind === 'piston') OVERHEAD.drawPiston(ctx, tl.x, tl.y, cs, false);
          else if (d.kind === 'and' || d.kind === 'not' || d.kind === 'nor') OVERHEAD.drawGate(ctx, tl.x, tl.y, cs, d.kind, false, d.inputs, d.outputs); } }
      if (this.world.goal) { const gc = (typeof GOAL_COLORS !== 'undefined' && GOAL_COLORS[this.world.goal.color || 0]) || { hex: '#ffd700' }; const sp = S((this.world.goal.col + 1) * g.cell, (this.world.goal.row + 1) * g.cell); ctx.fillStyle = gc.hex; ctx.font = `${(cs * 1.8) | 0}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('★', sp.x, sp.y + cs * 0.6); }
      // Hand-selected mob/item highlight (moveable — click a new spot to move it).
      if (this._selEnt && this.tool === 'hand') { const s = this._selEnt.ref; const sp = S((s.col + 0.5) * g.cell, (s.row + 0.5) * g.cell); const pulse = 0.5 + 0.3 * Math.sin(Date.now() / 150); ctx.strokeStyle = `rgba(120,220,255,${pulse})`; ctx.lineWidth = 3; ctx.strokeRect(sp.x - cs * 0.5, sp.y - cs * 0.5, cs, cs); ctx.fillStyle = 'rgba(120,220,255,.85)'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('click to move', sp.x, sp.y - cs * 0.6); }
      // Click-to-connect (pick transmitters): ring + #N badge on every transmitter,
      // green if this receiver already listens to it, blue if available.
      if (this._pickTx) {
        const listen = Array.isArray(this._pickTx.target.rxIds) ? this._pickTx.target.rxIds : [];
        const pulse = 0.55 + 0.3 * Math.sin(Date.now() / 140);
        for (const d of (this.world.redstone || [])) {
          if (d.txId == null || d.kind === 'dust' || ['lamp', 'piston', 'rx'].indexOf(d.kind) >= 0) continue;
          const sel = listen.indexOf(d.txId) >= 0, sp = S((d.col + 0.5) * g.cell, (d.row + 0.5) * g.cell);
          ctx.strokeStyle = sel ? `rgba(127,224,160,${pulse})` : `rgba(120,190,255,${pulse})`; ctx.lineWidth = 3;
          ctx.strokeRect(sp.x - cs * 0.5, sp.y - cs * 0.5, cs, cs);
          ctx.fillStyle = sel ? '#7fe0a0' : '#bfe0ff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('#' + d.txId, sp.x, sp.y - cs * 0.55);
        }
        ctx.fillStyle = 'rgba(10,14,22,.82)'; ctx.fillRect(0, 0, ctx.canvas.width, 26);
        ctx.fillStyle = '#dbe4f3'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('Click transmitters to toggle  ·  Esc / Enter when done', ctx.canvas.width / 2, 17);
      }
      // Distinct MAP-EDGE indicator (hazard stripes just outside the world bounds)
      // so the creator knows when they're looking at the real edge — deliberately
      // NOT a block look.
      this._drawMapEdge(ctx, S, m.gridW * g.cell, m.gridH * g.cell);
      // Live shape preview while dragging.
      if (this._shapeAnchor && this._shapeEnd) { const so = this.elevLevel * Q; ctx.fillStyle = 'rgba(120,180,255,.4)'; ctx.strokeStyle = 'rgba(150,210,255,.85)'; ctx.lineWidth = 1; for (const p of this._shapeCells(this._shapeAnchor, this._shapeEnd)) { const sp = S(p.c * g.cell, p.r * g.cell); ctx.fillRect(sp.x - so, sp.y - so, cs, cs); ctx.strokeRect(sp.x - so + .5, sp.y - so + .5, cs - 1, cs - 1); } }
      // Placement GHOST of the selected tool at the hovered cell (red-X if a building
      // won't fit). Not shown in hand mode or while dragging/shaping.
      this._drawGhost(ctx, S, cs, Q);
      if (this._selEnt && !this._selEnt.moving && this.tool === 'hand') { const sc = this._selEnt; const sp2 = S(sc.col * g.cell, sc.row * g.cell), eo2 = (m.elevation[sc.row] ? (m.elevation[sc.row][sc.col] | 0) : 0) * Q;   // selection outline + keep the action bar positioned
        ctx.save(); ctx.strokeStyle = '#6ad0ff'; ctx.lineWidth = 2; ctx.setLineDash([5, 3]); ctx.strokeRect(sp2.x - eo2 + 1, sp2.y - eo2 + 1, cs - 2, cs - 2); ctx.setLineDash([]); ctx.restore(); this._positionSelBar(); }
      else if (document.getElementById('oh-selbar')) this._hideSelBar();
      // Hover tooltip — name of whatever is under the cursor (cheap: one lookup + a text box).
      if (this._hover && !this._pan && !this._dragging) { const nm = this._hoverName(this._hover.col, this._hover.row);
        if (nm) { const e = (m.elevation[this._hover.row] ? (m.elevation[this._hover.row][this._hover.col] | 0) : 0), sp = S((this._hover.col + 0.5) * g.cell, this._hover.row * g.cell), tx = sp.x - e * Q, ty = sp.y - e * Q;
          ctx.save(); ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; const w = ctx.measureText(nm).width + 12;
          ctx.fillStyle = 'rgba(12,16,24,.9)'; ctx.fillRect(tx - w / 2, ty - 22, w, 17); ctx.strokeStyle = 'rgba(120,150,190,.5)'; ctx.strokeRect(tx - w / 2 + .5, ty - 21.5, w, 17);
          ctx.fillStyle = '#dbe4f3'; ctx.fillText(nm, tx, ty - 10); ctx.restore(); } }
      // Selection cells (cyan) + live marquee + paste ghost.
      if (this._sel) { ctx.save(); ctx.fillStyle = 'rgba(90,200,255,.28)'; ctx.strokeStyle = 'rgba(150,230,255,.9)'; ctx.lineWidth = 1;
        for (const k of this._sel) { const [c, r] = k.split(',').map(Number); const sp = S(c * g.cell, r * g.cell); ctx.fillRect(sp.x, sp.y, cs, cs); ctx.strokeRect(sp.x + .5, sp.y + .5, cs - 1, cs - 1); } ctx.restore(); }
      if (this._selecting && this._marquee) { const a = this._marquee.a, b = this._marquee.b; const p0 = S(Math.min(a.col, b.col) * g.cell, Math.min(a.row, b.row) * g.cell); const p1 = S((Math.max(a.col, b.col) + 1) * g.cell, (Math.max(a.row, b.row) + 1) * g.cell); ctx.save(); ctx.strokeStyle = '#6ad0ff'; ctx.setLineDash([5, 4]); ctx.lineWidth = 2; ctx.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y); ctx.setLineDash([]); ctx.restore(); }
      if (this._pasting && this._clip && this._hover) { ctx.save(); ctx.globalAlpha = 0.55; for (const cell of this._clip.cells) { const c = this._hover.col + cell.dc, r = this._hover.row + cell.dr; const sp = S(c * g.cell, r * g.cell); OVERHEAD.drawTerrainCube(ctx, cell.key, sp.x, sp.y, cs, cell.elev | 0, true, true); if (cell.bridge) OVERHEAD.drawBridgeCell(ctx, sp.x, sp.y, cs, { rail: false, closed: true, edges: { n: true, e: true, s: true, w: true } }); } ctx.globalAlpha = 1; ctx.restore(); }
      // Template MODE overlay — grey out everything OUTSIDE the X×Y region so it's clear
      // what will be captured; outline the region; flag out-of-Z / floating cells in red.
      if (this._templateMode) {
        const tm = this._templateMode;
        if (tm.anchor) {
          const p0 = S(tm.anchor.col * g.cell, tm.anchor.row * g.cell), p1 = S((tm.anchor.col + tm.x) * g.cell, (tm.anchor.row + tm.y) * g.cell);
          ctx.save();
          ctx.fillStyle = 'rgba(8,10,16,.6)';   // grey-out outside the region (four bands)
          ctx.fillRect(0, 0, CANVAS_W, Math.max(0, p0.y)); ctx.fillRect(0, p1.y, CANVAS_W, Math.max(0, CANVAS_H - p1.y));
          ctx.fillRect(0, p0.y, Math.max(0, p0.x), p1.y - p0.y); ctx.fillRect(p1.x, p0.y, Math.max(0, CANVAS_W - p1.x), p1.y - p0.y);
          ctx.strokeStyle = '#7fe0a0'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y); ctx.setLineDash([]);
          const base = m.elevation[tm.anchor.row] ? (m.elevation[tm.anchor.row][tm.anchor.col] | 0) : 0;
          for (let dy = 0; dy < tm.y; dy++) for (let dx = 0; dx < tm.x; dx++) { const c = tm.anchor.col + dx, r = tm.anchor.row + dy; const e = (m.elevation[r] ? (m.elevation[r][c] | 0) : 0) - base; if (e > tm.z) { const sp = S(c * g.cell, r * g.cell); ctx.fillStyle = 'rgba(230,80,80,.4)'; ctx.fillRect(sp.x, sp.y, cs, cs); } }   // over-Z cells flagged red
          ctx.restore();
        }
        ctx.save(); ctx.fillStyle = 'rgba(10,14,22,.85)'; ctx.fillRect(0, 0, CANVAS_W, 28);
        ctx.fillStyle = '#dbe4f3'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('Template "' + tm.name + '"  ' + tm.x + '×' + tm.y + '×' + tm.z + '  ·  ' + (tm.anchor ? 'Enter = capture' : 'click the map to place the region') + '  ·  Esc = cancel', CANVAS_W / 2, 18);
        ctx.restore();
      }
      // Info line.
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.textAlign = 'left'; ctx.font = '12px sans-serif';
      ctx.fillText(`${this.world.name} · ${m.baseW || m.gridW}×${m.baseH || m.gridH} @ density ${m.density} (${m.gridW}×${m.gridH} cells) · ${this.world.mode} · tool: ${this._shift ? 'erase' : this.tool} @ elev ${this.elevLevel}`, 158, CANVAS_H - 10);
      // SCROLLBARS — a position indicator so creators know where they are in a big map.
      { const worldW = m.gridW * g.cell, worldH = m.gridH * g.cell, viewW = VW / z, viewH = VH / z;
        ctx.save();
        const hx0 = LEFT + 8, hx1 = CANVAS_W - RIGHT - 14, htrk = hx1 - hx0, hsy = CANVAS_H - 6;
        if (htrk > 20) { ctx.fillStyle = 'rgba(255,255,255,.10)'; ctx.fillRect(hx0, hsy, htrk, 4);
          const tw = Math.max(20, htrk * Math.min(1, viewW / worldW)), fx = hx0 + Math.max(0, Math.min(htrk - tw, (this.cam.x / worldW) * htrk));
          ctx.fillStyle = 'rgba(120,180,255,.65)'; ctx.fillRect(fx, hsy, tw, 4); }
        const vy0 = TOP + 8, vy1 = CANVAS_H - 14, vtrk = vy1 - vy0, vsx = CANVAS_W - RIGHT - 6;
        if (vtrk > 20) { ctx.fillStyle = 'rgba(255,255,255,.10)'; ctx.fillRect(vsx, vy0, 4, vtrk);
          const th = Math.max(20, vtrk * Math.min(1, viewH / worldH)), fy = vy0 + Math.max(0, Math.min(vtrk - th, (this.cam.y / worldH) * vtrk));
          ctx.fillStyle = 'rgba(120,180,255,.65)'; ctx.fillRect(vsx, fy, 4, th); }
        ctx.restore();
      }
      // PERF overlay (⏱ Perf checkbox) — FPS, render time, terrain draw mode, cell counts.
      if (this.view.perf) {
        const ring = this._fpsRing || (this._fpsRing = []); ring.push(_pt0); if (ring.length > 30) ring.shift();
        const fps = ring.length > 1 ? ((ring.length - 1) * 1000 / Math.max(1, _pt0 - ring[0])) : 0;
        const visCells = (c1 - c0 + 1) * (r1 - r0 + 1);
        const ms = (typeof performance !== 'undefined' && performance.now) ? (performance.now() - _pt0) : 0;
        const lines = [`${fps.toFixed(0)} fps · ${ms.toFixed(1)} ms render`,
          `terrain: ${editingLive ? 'LIVE — ' + visCells + ' cells' : 'CACHED — 1 blit'}`,
          `zoom ${z.toFixed(2)}× · cam ${this.cam.x | 0},${this.cam.y | 0}`,
          `map ${m.baseW || m.gridW}×${m.baseH || m.gridH} d${m.density} = ${m.gridW}×${m.gridH} cells`,
          `viewport ${visCells} cells`];
        ctx.save(); ctx.font = '12px monospace'; ctx.textAlign = 'left';
        const w = 250, h = lines.length * 16 + 12, bx = CANVAS_W - w - 12, by = TOP + 8;
        ctx.fillStyle = 'rgba(8,12,20,.85)'; ctx.fillRect(bx, by, w, h);
        ctx.strokeStyle = fps < 40 ? '#e0a04a' : 'rgba(120,180,255,.5)'; ctx.strokeRect(bx + .5, by + .5, w, h);
        ctx.fillStyle = fps < 40 ? '#ffcc80' : '#cfe0ff'; lines.forEach((L, i) => ctx.fillText(L, bx + 8, by + 18 + i * 16));
        ctx.restore();
      }
    },
    // Translucent preview of the selected tool at the hovered cell. Buildings show
    // a red X when they can't fit (off the map / overlapping another building). The
    // ghost is a single placement — it does NOT reflect the brush size.
    _drawGhost(ctx, S, cs, Q) {
      if (this.tool === 'hand' || this._dragging || this._shapeAnchor || this._pasting || this._selecting || !this._hover) return;
      const g = this.grid, m = this.world.mapSnapshot, col = this._hover.col, row = this._hover.row;
      if (col < 0 || row < 0 || col >= m.gridW || row >= m.gridH) return;
      const tool = this._shift ? 'erase' : this.tool;
      // Offset the whole preview UP-LEFT by the active elevation so it sits on TOP of the
      // block below (matching how placed cubes/buildings render), instead of at the ground plane.
      const eLvl = this.elevLevel | 0, hBelow = (m.elevation[row] && m.elevation[row][col] != null) ? (m.elevation[row][col] | 0) : 0, oy = eLvl * Q;
      const sp0 = S(col * g.cell, row * g.cell), ctr0 = S((col + 0.5) * g.cell, (row + 0.5) * g.cell);
      const sp = { x: sp0.x - oy, y: sp0.y - oy }, ctr = { x: ctr0.x - oy, y: ctr0.y - oy };
      const unitPx = g.cell * (g.density || 1) * g.masterZoom;
      ctx.save(); ctx.globalAlpha = 0.5;
      // AIR-LAYER ghosts: one distinct hollow/dashed cyan cube for every empty level between the
      // block below and where you're placing — drawn BEHIND the solid object ghost, low to high,
      // so it's obvious at a glance how much air is under the block. (Nothing when it rests flush.)
      const air = eLvl - hBelow;
      if (air > 0 && tool !== 'erase' && this.view.airGhosts) {
        ctx.save();
        const fwA = tool === 'building' ? this._bFootprint(this.buildingType).w : 1;
        const fhA = tool === 'building' ? this._bFootprint(this.buildingType).h : 1;
        for (let L = hBelow + 1; L < eLvl; L++) {
          const ax = sp0.x - L * Q, ay = sp0.y - L * Q, w = fwA * cs, h = fhA * cs;
          ctx.globalAlpha = 0.9; ctx.fillStyle = 'rgba(120,200,255,.10)'; ctx.fillRect(ax, ay, w, h);
          ctx.strokeStyle = 'rgba(130,205,255,.8)'; ctx.lineWidth = Math.max(1, cs * 0.05); ctx.setLineDash([Math.max(2, cs * 0.16), Math.max(2, cs * 0.12)]);
          ctx.strokeRect(ax + .5, ay + .5, w - 1, h - 1);
        }
        ctx.setLineDash([]); ctx.restore();
      }
      if (tool === 'building') {
        const fp = this._bFootprint(this.buildingType), fw = fp.w, fh = fp.h;
        const fit = this._buildingFits(this.buildingType, col, row);   // rest level (0+) or false
        const lvl = fit === false ? eLvl : fit, bx = sp0.x - lvl * Q, by = sp0.y - lvl * Q;   // preview at the snap level
        if (fit !== false) { OVERHEAD.drawBuilding(ctx, this.buildingType, bx, by, fw * cs, fh * cs, Math.min(1, cs / 28), 'default'); }
        else {
          let reason = 'needs flat ground';
          if (col + fw > m.gridW || row + fh > m.gridH) reason = 'off the map';
          else if ((this.world.buildings || []).some((b) => { const bf = this._bFootprint(b.typeId); return col < b.col + bf.w && col + fw > b.col && row < b.row + bf.h && row + fh > b.row; })) reason = 'overlaps a building';
          ctx.fillStyle = 'rgba(200,48,58,.55)'; ctx.fillRect(bx, by, fw * cs, fh * cs); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + fw * cs, by + fh * cs); ctx.moveTo(bx + fw * cs, by); ctx.lineTo(bx, by + fh * cs); ctx.stroke();
          if (cs > 10) { ctx.globalAlpha = 1; ctx.fillStyle = '#ffd23a'; ctx.font = `${Math.max(9, cs * 0.32) | 0}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText(reason, bx + fw * cs / 2, by - 5); ctx.globalAlpha = 0.5; }
        }
      } else if (tool === 'mob') { const d = P().OH_MOB_BY_KEY[this.mobKey] || P().OH_MOBS[0]; ctx.fillStyle = d.color; ctx.strokeStyle = 'rgba(150,150,160,.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ctr.x, ctr.y, unitPx * 0.34, 0, 7); ctx.fill(); ctx.stroke(); }
      else if (tool === 'item') { OVERHEAD.drawItemSprite(ctx, this.itemKey, ctr.x, ctr.y, unitPx * 0.8); }
      else if (tool === 'ramp' || tool === 'ladder') { OVERHEAD.drawRampIcon(ctx, tool, ctr.x, ctr.y, cs, 0); }
      else if (tool === 'bridge') { /* two-click span placement shows its own preview */ }
      else if (tool === 'lever') { OVERHEAD.drawLever(ctx, ctr.x, ctr.y, unitPx * 0.9, false); }
      else if (tool === 'dust') { OVERHEAD.drawDust(ctx, sp.x, sp.y, cs, false); }
      else if (tool === 'lamp') { OVERHEAD.drawLamp(ctx, ctr.x, ctr.y, unitPx * 0.8, false); }
      else if (tool === 'plate' || tool === 'weight') { OVERHEAD.drawPlate(ctx, ctr.x, ctr.y, unitPx * 0.7, false, tool === 'weight'); }
      else if (tool === 'piston') { OVERHEAD.drawPiston(ctx, sp.x, sp.y, cs, false); }
      else if (tool === 'and' || tool === 'not' || tool === 'nor') { OVERHEAD.drawGate(ctx, sp.x, sp.y, cs, tool, false, tool === 'and' ? ['w', 's'] : ['w'], ['e']); }
      else if (tool === 'lock') { OVERHEAD.drawLock(ctx, sp.x, sp.y, cs, false); }
      else if (tool === 'goal') { ctx.fillStyle = '#ffd700'; ctx.font = `${(cs * 1.8) | 0}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('★', ctr.x, ctr.y + cs * 0.6); }
      else if (tool === 'spawn') { ctx.strokeStyle = '#4aa3ff'; ctx.lineWidth = 2; ctx.strokeRect(ctr.x - cs * 0.42, ctr.y - cs * 0.42, cs * 0.84, cs * 0.84); }
      else if (tool === 'tree') { ctx.fillStyle = '#4f8a44'; ctx.beginPath(); ctx.arc(ctr.x, ctr.y - cs * 0.3, cs * 1.3, 0, 7); ctx.fill(); ctx.fillStyle = '#6e4f2a'; ctx.fillRect(ctr.x - cs * 0.15, ctr.y, cs * 0.3, cs * 0.7); }
      else if (tool === 'erase') { ctx.strokeStyle = '#e05555'; ctx.lineWidth = 2; ctx.strokeRect(sp.x + 1, sp.y + 1, cs - 2, cs - 2); ctx.beginPath(); ctx.moveTo(sp.x + 2, sp.y + 2); ctx.lineTo(sp.x + cs - 2, sp.y + cs - 2); ctx.stroke(); }
      else { OVERHEAD.drawTerrainCube(ctx, this.terrainKey, sp0.x, sp0.y, cs, eLvl, true, true); }   // terrain cube self-offsets by elevation → draw from the un-offset base
      // Count badge for the air layers above (matches the stacked air-ghosts drawn behind).
      if (air > 0 && tool !== 'erase' && cs > 8) {
        ctx.globalAlpha = 1;
        const label = '↑' + air + ' air', fh2 = Math.max(13, cs * 0.42);
        ctx.font = `${Math.max(9, cs * 0.34) | 0}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const tw = ctx.measureText(label).width + 10, bx = ctr.x, by = ctr.y - cs * 0.55 - fh2 / 2;
        ctx.fillStyle = 'rgba(10,14,22,.85)'; ctx.fillRect(bx - tw / 2, by - fh2 / 2, tw, fh2);
        ctx.fillStyle = '#8ecdff'; ctx.fillText(label, bx, by);
        ctx.textBaseline = 'alphabetic';
      }
      ctx.restore();
    },
    // Yellow/black hazard stripes in a band just OUTSIDE each world edge.
    _drawMapEdge(ctx, S, worldW, worldH) {
      const tl = S(0, 0), brc = S(worldW, worldH), W = 7;   // W halved (was 14); sits right on the true edge
      const band = (x, y, w, h) => {
        if (w <= 0 || h <= 0) return;
        ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
        ctx.fillStyle = '#3a2f08'; ctx.fillRect(x, y, w, h);   // amber ground so it reads YELLOW even at 7px
        ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 4;
        for (let i = -h - w; i < w + h; i += 11) { ctx.beginPath(); ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + h, y); ctx.stroke(); }
        ctx.restore();
      };
      band(tl.x - W, tl.y - W, brc.x - tl.x + 2 * W, W);        // top
      band(tl.x - W, brc.y, brc.x - tl.x + 2 * W, W);           // bottom
      band(tl.x - W, tl.y, W, brc.y - tl.y);                    // left
      band(brc.x, tl.y, W, brc.y - tl.y);                       // right
      // Bright dashed boundary line right on the true world edge (inner edge of the band).
      ctx.save(); ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 3; ctx.setLineDash([10, 6]);
      ctx.strokeRect(tl.x, tl.y, brc.x - tl.x, brc.y - tl.y); ctx.setLineDash([]); ctx.restore();
    },
    list() { try { return Object.keys(JSON.parse(localStorage.getItem('steveo_overhead_worlds') || '{}')); } catch (e) { return []; } },
  };

  if (typeof window !== 'undefined') window.OH_EDITOR = OH_EDITOR;
})();
