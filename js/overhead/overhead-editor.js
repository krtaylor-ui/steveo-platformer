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
    _running: false, _dragging: false, _shift: false,
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
      const bar = document.getElementById('oh-editor-bar'); if (bar) bar.style.display = 'block';
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
      const bar = document.getElementById('oh-editor-bar'); if (bar) bar.style.display = 'none';
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
        buildings: [], mobs: [], items: [], spawns: [{ col: 1, row: H - 2 }],
        goal: null,
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

    // ── Left tool rail (§ palette redesign) ─────────────────────────────────
    _injectStyle() {
      if (document.getElementById('oh-editor-style')) return;
      const s = document.createElement('style'); s.id = 'oh-editor-style'; s.textContent = `
        #oh-editor-bar{position:fixed;top:0;left:0;bottom:0;width:150px;z-index:5500;display:none;overflow:visible;
          background:#141a26;border-right:1px solid #2c3648;padding:8px 6px;font:12px sans-serif;color:#dbe4f3}
        #oh-editor-bar h4{margin:8px 2px 3px;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#7f8fa8}
        #oh-editor-bar button,#oh-editor-bar select{width:100%;background:#243049;border:1px solid #3a4a6b;color:#dbe4f3;border-radius:5px;padding:5px 6px;cursor:pointer;margin:2px 0;font-size:12px}
        #oh-editor-bar button.on{background:#3a5a8c;border-color:#5573ad}
        .oh-tab{position:relative}
        .oh-tab>.oh-tabbtn{width:100%}
        .oh-flyout{position:absolute;left:148px;top:0;min-width:150px;max-height:70vh;overflow:auto;background:#1a2233;border:1px solid #3a4a6b;border-radius:6px;padding:6px;display:none;z-index:5600;box-shadow:4px 4px 16px rgba(0,0,0,.5)}
        .oh-tab:hover>.oh-flyout{display:block}
        .oh-flyout .opt{display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:4px;cursor:pointer}
        .oh-flyout .opt:hover{background:#2a3852}
        .oh-flyout .opt.sel{background:#3a5a8c}
        .oh-sw{width:16px;height:16px;border-radius:3px;border:1px solid rgba(255,255,255,.3);flex:none}
        #oh-editor-bar .row{display:flex;gap:4px}#oh-editor-bar .row button{margin:2px 0}
        #oh-create-modal{position:fixed;inset:0;z-index:6000;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.65)}
        .ohc-panel{background:#141a26;border:1px solid #2c3648;border-radius:12px;padding:20px 22px;min-width:320px;color:#e8eef7;font:14px sans-serif}
        .ohc-panel h2{margin:0 0 12px}
        .ohc-panel label{display:block;margin:8px 0;font-size:13px}
        .ohc-panel select,.ohc-panel input{width:100%;background:#1c2230;border:1px solid #3a465c;color:#e8eef7;border-radius:6px;padding:6px;margin-top:3px}
        .ohc-btns{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}
        .ohc-btns button{width:auto;background:#2b3548;border:1px solid #46557a;color:#dfe7f5;border-radius:6px;padding:7px 16px;cursor:pointer}
        .ohc-btns button.primary{background:#2e6f4e;border-color:#3f9a6c}`;
      document.head.appendChild(s);
    },

    _renderBar() {
      const bar = document.getElementById('oh-editor-bar'); if (!bar) return;
      const swatch = (c) => `<span class="oh-sw" style="background:${c}"></span>`;
      const terrOpts = P().OH_TERRAIN.map((t) => `<div class="opt ${this.tool === 'terrain' && this.terrainKey === t.key ? 'sel' : ''}" data-terr="${t.key}">${swatch(t.color)}${t.name}</div>`).join('');
      const bTypes = (typeof OH_BUILDINGS !== 'undefined') ? OH_BUILDINGS.all().map((d) => d.id) : ['healer'];
      const buildOpts = bTypes.map((b) => `<div class="opt ${this.tool === 'building' && this.buildingType === b ? 'sel' : ''}" data-build="${b}">🏛 ${b}</div>`).join('')
        + `<div class="opt ${this.tool === 'spawn' ? 'sel' : ''}" data-spawn="1">🚩 Player Spawn</div>`
        + `<div class="opt ${this.tool === 'goal' ? 'sel' : ''}" data-goal="1">★ Goal Star</div>`;
      const mobOpts = P().OH_MOBS.map((m) => `<div class="opt ${this.tool === 'mob' && this.mobKey === m.key ? 'sel' : ''}" data-mob="${m.key}">${swatch(m.color)}${m.name}</div>`).join('');
      const itemOpts = P().OH_ITEMS.map((i) => `<div class="opt ${this.tool === 'item' && this.itemKey === i.key ? 'sel' : ''}" data-item="${i.key}">${swatch(i.color)}${i.name}</div>`).join('');
      const active = this.tool === 'terrain' ? P().OH_TERRAIN_BY_KEY[this.terrainKey].name
        : this.tool === 'building' ? this.buildingType : this.tool === 'mob' ? P().OH_MOB_BY_KEY[this.mobKey].name
        : this.tool === 'item' ? P().OH_ITEM_BY_KEY[this.itemKey].name : this.tool;
      bar.innerHTML = `
        <div class="row"><button id="oh-undo" title="Undo (Z)">↶</button><button id="oh-redo" title="Redo (Y)">↷</button></div>
        <h4>Brush</h4>
        <select id="oh-brush">${[1, 2, 3, 5, 8].map((b) => `<option value="${b}" ${b === this.brush ? 'selected' : ''}>${b}×${b}</option>`).join('')}</select>
        <h4>Elevation ([ ])</h4>
        <select id="oh-elev">${[0, 1, 2, 3, 4, 5].map((l) => `<option value="${l}" ${l === this.elevLevel ? 'selected' : ''}>Level ${l}</option>`).join('')}</select>
        <button id="oh-erase" class="${this.tool === 'erase' ? 'on' : ''}" title="Erase (or hold Shift)">Erase</button>
        <h4>Palette</h4>
        <div class="oh-tab"><button class="oh-tabbtn ${this.tab === 'terrain' ? 'on' : ''}" data-tab="terrain">Terrain ▸</button><div class="oh-flyout">${terrOpts}</div></div>
        <div class="oh-tab"><button class="oh-tabbtn ${this.tab === 'buildings' ? 'on' : ''}" data-tab="buildings">Buildings ▸</button><div class="oh-flyout">${buildOpts}</div></div>
        <div class="oh-tab"><button class="oh-tabbtn ${this.tab === 'mobs' ? 'on' : ''}" data-tab="mobs">Mobs ▸</button><div class="oh-flyout">${mobOpts}</div></div>
        <div class="oh-tab"><button class="oh-tabbtn ${this.tab === 'items' ? 'on' : ''}" data-tab="items">Items ▸</button><div class="oh-flyout">${itemOpts}</div></div>
        <div style="font-size:11px;color:#8fa0bd;margin:6px 2px">Active: <b>${active}</b></div>
        <h4>Zoom (− =)</h4>
        <div class="row"><button id="oh-zout">−</button><button id="oh-zin">+</button></div>
        <div style="position:absolute;bottom:8px;left:6px;right:6px">
          <button id="oh-test">▶ Test</button><button id="oh-save">💾 Save</button><button id="oh-exit">✕ Exit</button></div>`;
      const g = (id) => document.getElementById(id);
      g('oh-undo').onclick = () => this.undo(); g('oh-redo').onclick = () => this.redo();
      g('oh-brush').onchange = (e) => this.brush = +e.target.value;
      g('oh-elev').onchange = (e) => this.elevLevel = +e.target.value;
      g('oh-erase').onclick = () => { this.tool = 'erase'; this._renderBar(); };
      g('oh-zin').onclick = () => OH_GRID.zoomBy(this.grid, 1.15); g('oh-zout').onclick = () => OH_GRID.zoomBy(this.grid, 0.87);
      g('oh-test').onclick = () => this._test(); g('oh-save').onclick = () => this._save(); g('oh-exit').onclick = () => this.close();
      bar.querySelectorAll('[data-terr]').forEach((el) => el.onclick = () => { this.tab = 'terrain'; this.tool = 'terrain'; this.terrainKey = el.dataset.terr; this._renderBar(); });
      bar.querySelectorAll('[data-build]').forEach((el) => el.onclick = () => { this.tab = 'buildings'; this.tool = 'building'; this.buildingType = el.dataset.build; this._renderBar(); });
      bar.querySelectorAll('[data-spawn]').forEach((el) => el.onclick = () => { this.tab = 'buildings'; this.tool = 'spawn'; this._renderBar(); });
      bar.querySelectorAll('[data-goal]').forEach((el) => el.onclick = () => { this.tab = 'buildings'; this.tool = 'goal'; this._renderBar(); });
      bar.querySelectorAll('[data-mob]').forEach((el) => el.onclick = () => { this.tab = 'mobs'; this.tool = 'mob'; this.mobKey = el.dataset.mob; this._renderBar(); });
      bar.querySelectorAll('[data-item]').forEach((el) => el.onclick = () => { this.tab = 'items'; this.tool = 'item'; this.itemKey = el.dataset.item; this._renderBar(); });
      bar.querySelectorAll('[data-tab]').forEach((el) => el.onclick = () => { this.tab = el.dataset.tab; this._renderBar(); });
    },

    // ── Canvas interaction ──────────────────────────────────────────────────
    _bindCanvas() {
      const cv = document.getElementById('gameCanvas');
      this._md = (e) => { this._dragging = true; this._shift = e.shiftKey; this._paintAt(e); };
      this._mm = (e) => { if (this._dragging) { this._shift = e.shiftKey; this._paintAt(e); } };
      this._mu = () => { if (this._dragging) { this._dragging = false; this._pushHistory(); } };
      this._wheel = (e) => { OH_GRID.zoomBy(this.grid, e.deltaY < 0 ? 1.1 : 0.9); e.preventDefault(); };
      this._kd = (e) => {
        const K = this.KEYS, pan = 48 / this.grid.masterZoom;
        if (e.code === 'ArrowLeft') this.cam.x -= pan; else if (e.code === 'ArrowRight') this.cam.x += pan;
        else if (e.code === 'ArrowUp') this.cam.y -= pan; else if (e.code === 'ArrowDown') this.cam.y += pan;
        else if (e.code === K.elevUp) { this.elevLevel = Math.min(5, this.elevLevel + 1); this._renderBar(); }
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
    _paintAt(e) {
      const { col, row } = this._cellFromEvent(e);
      const m = this.world.mapSnapshot, half = Math.floor(this.brush / 2);
      const erasing = this.tool === 'erase' || this._shift;
      const apply = (fn) => { for (let dr = -half; dr <= half; dr++) for (let dc = -half; dc <= half; dc++) {
        const c = col + dc, r = row + dr; if (c < 0 || r < 0 || c >= m.gridW || r >= m.gridH) continue; fn(c, r);
      } };
      if (erasing) {
        // Erase ONLY affects the currently-selected elevation level (§ requirement):
        // clears entities at that cell and resets a cell whose elevation == selected.
        apply((c, r) => {
          if ((m.elevation[r][c] | 0) === this.elevLevel) { m.ground[r][c] = 'grass'; m.elevation[r][c] = 0; }
          this.world.buildings = this.world.buildings.filter((b) => !(b.col === c && b.row === r));
          this.world.mobs = this.world.mobs.filter((x) => !(x.col === c && x.row === r));
          this.world.items = this.world.items.filter((x) => !(x.col === c && x.row === r));
        });
        return;
      }
      if (this.tool === 'terrain') apply((c, r) => { m.ground[r][c] = this.terrainKey; m.elevation[r][c] = this.elevLevel; });
      else if (this.tool === 'goal') { this.world.goal = { col, row }; }
      else if (this.tool === 'spawn') { this.world.spawns = [{ col, row }]; }
      else if (this.tool === 'building') { if (!this.world.buildings.some((b) => b.col === col && b.row === row)) this.world.buildings.push(OH_BUILDINGS.place(this.buildingType, col, row, { level: this.elevLevel })); }
      else if (this.tool === 'mob') { const d = P().OH_MOB_BY_KEY[this.mobKey]; this.world.mobs.push({ col, row, type: this.mobKey, hp: d.hp, speed: d.speed, detect: d.detect }); }
      else if (this.tool === 'item') { this.world.items.push({ col, row, kind: P().OH_ITEM_BY_KEY[this.itemKey].kind, weapon: P().OH_ITEM_BY_KEY[this.itemKey].weapon, itemKey: this.itemKey }); }
    },

    // ── Actions ───────────────────────────────────────────────────────────────
    _test() {
      this._running = false; this._unbindCanvas();
      const bar = document.getElementById('oh-editor-bar'); if (bar) bar.style.display = 'none';
      const draft = JSON.parse(JSON.stringify(this.world));
      OVERHEAD.launchWorld(draft, {}, () => { if (window.game && window.game.destroy) window.game.destroy(); window.game = null; this._reopen(); });
    },
    _reopen() {
      const bar = document.getElementById('oh-editor-bar'); if (bar) bar.style.display = 'block';
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
    _flash(msg) { const bar = document.getElementById('oh-editor-bar'); if (!bar) return; let f = document.getElementById('oh-flash'); if (!f) { f = document.createElement('div'); f.id = 'oh-flash'; f.style.cssText = 'position:absolute;bottom:96px;left:6px;right:6px;color:#8fe0a0;font-size:12px'; bar.appendChild(f); } f.textContent = msg; setTimeout(() => { if (f) f.textContent = ''; }, 2600); },

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
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const key = m.ground[r][c] || 'grass', elev = m.elevation[r][c] | 0;
        const sp = S(c * g.cell, r * g.cell); const y = sp.y + OH_ELEV.yOffset(elev) * z * (g.cell / 32);
        OVERHEAD.drawTerrainTile(ctx, key, sp.x, y, cs, elev);
        if (elev > 0 && cs > 12) { ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = `${Math.max(7, cs * 0.28) | 0}px sans-serif`; ctx.textAlign = 'left'; ctx.fillText(String(elev), sp.x + 2, y + Math.max(9, cs * 0.36)); }
      }
      // Entities.
      for (const b of this.world.buildings) { const sp = S((b.col + 0.5) * g.cell, (b.row + 0.5) * g.cell); const t = OH_BUILDINGS.get(b.typeId); ctx.fillStyle = (t && t.color) || '#8a7fb0'; ctx.fillRect(sp.x - cs * 0.42, sp.y - cs * 0.42, cs * 0.84, cs * 0.84); if (cs > 16) { ctx.fillStyle = '#fff'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(b.typeId).slice(0, 4), sp.x, sp.y + cs * 0.55); } }
      for (const mo of this.world.mobs) { const d = P().OH_MOB_BY_KEY[mo.type] || P().OH_MOBS[0]; const sp = S((mo.col + 0.5) * g.cell, (mo.row + 0.5) * g.cell); ctx.fillStyle = d.color; ctx.beginPath(); ctx.arc(sp.x, sp.y, cs * 0.34, 0, 7); ctx.fill(); }
      for (const it of this.world.items) { const d = P().OH_ITEM_BY_KEY[it.itemKey] || P().OH_ITEMS[0]; const sp = S((it.col + 0.5) * g.cell, (it.row + 0.5) * g.cell); ctx.fillStyle = d.color; ctx.beginPath(); ctx.arc(sp.x, sp.y, cs * 0.24, 0, 7); ctx.fill(); }
      for (const spn of (this.world.spawns || [])) { const sp = S((spn.col + 0.5) * g.cell, (spn.row + 0.5) * g.cell); ctx.strokeStyle = '#4aa3ff'; ctx.lineWidth = 2; ctx.strokeRect(sp.x - cs * 0.42, sp.y - cs * 0.42, cs * 0.84, cs * 0.84); if (cs > 14) { ctx.fillStyle = '#4aa3ff'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('P1', sp.x, sp.y + 3); } }
      if (this.world.goal) { const sp = S((this.world.goal.col + 0.5) * g.cell, (this.world.goal.row + 0.5) * g.cell); ctx.fillStyle = '#ffd700'; ctx.font = `${cs | 0}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('★', sp.x, sp.y + cs * 0.35); }
      // Info line.
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.textAlign = 'left'; ctx.font = '12px sans-serif';
      ctx.fillText(`${this.world.name} · ${m.baseW || m.gridW}×${m.baseH || m.gridH} @ density ${m.density} (${m.gridW}×${m.gridH} cells) · ${this.world.mode} · tool: ${this._shift ? 'erase' : this.tool} @ elev ${this.elevLevel}`, 158, CANVAS_H - 10);
    },
    list() { try { return Object.keys(JSON.parse(localStorage.getItem('steveo_overhead_worlds') || '{}')); } catch (e) { return []; } },
  };

  if (typeof window !== 'undefined') window.OH_EDITOR = OH_EDITOR;
})();
