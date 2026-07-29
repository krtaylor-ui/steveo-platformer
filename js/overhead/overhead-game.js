// ══════════════════════════════════════════════════════════════════════════
// Overhead Engine — runtime (OverheadGame). Renders string-keyed terrain with
// elevation (staircase + shading + a hide/overhang pass), scrolling zoomable
// camera, 3-scheme movement + jump + the spec'd overhead player sprite, cone
// melee + crossbow/trident/boomerang projectiles, mobs (3-state), Goal-Star win.
//
// COLLISION is ELEVATION-RELATIVE (§ Kevin's model): a cell one level above the
// player is a wall; two+ levels above is an overhang the player passes UNDER and
// is HIDDEN beneath (default obscured; optional designer indicator). The block
// TYPE is visual — only `lava` (hazard) damages regardless of elevation.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  const P = () => window.OH_PALETTE;
  const CANVAS_W = 800, CANVAS_H = 500;

  class OverheadGame {
    constructor(worldData, opts, onExit) {
      opts = opts || {};
      this.canvas = document.getElementById('gameCanvas');
      this.ctx = this.canvas.getContext('2d');
      this.input = new InputManager(this.canvas);
      this._onExit = onExit || null;
      this.state = 'playing';
      this._wonExitColor = 0; this._onWin = opts.onWin || null;

      const map = worldData.mapSnapshot || worldData;
      this.map = map;
      // §Overhead world settings — the runtime's tunables (separate from side-view).
      this.settings = (typeof OH_SETTINGS !== 'undefined') ? OH_SETTINGS.resolve(worldData) : {};
      const cfg = this.settings;
      this.grid = OH_GRID.make({ gridW: map.gridW, gridH: map.gridH, density: map.density,
        objectScaleMode: map.objectScaleMode, cell: map.cell || (32 / (map.density || 1)), masterZoom: cfg.masterZoom || 1 });
      // UNIT = base-cell world px (cell × density). Gameplay sizing/speed is in
      // UNITS so it's DENSITY-INDEPENDENT — a denser grid has smaller cells but the
      // player/mobs/weapons keep the same real size + speed (the density bug fix).
      this.unit = this.grid.cell * (map.density || 1);
      this._testMode = !!opts.testMode;
      this.ground = map.ground || []; this.elevation = map.elevation || [];
      this.buildings = (worldData.buildings || []).slice();
      this.items = (worldData.items || []).map((it) => ({ ...it, taken: false }));
      this.mobs = (worldData.mobs || []).map((m) => { const d = P().OH_MOB_BY_KEY[m.type] || P().OH_MOBS[0];
        return { ...m, x: (m.col + 0.5) * this.grid.cell, y: (m.row + 0.5) * this.grid.cell, r: this.unit * 0.34,
          elev: this._elev(m.col, m.row),   // FIX: mobs need an elevation or collision NaN-blocks them (they sat still)
          hp: m.hp || d.hp, speed: m.speed || d.speed, detect: (m.detect || d.detect || 8) * this.unit * (cfg.mobDetectMult || 1), ranged: !!d.ranged, state: 'path', wp: 0, dead: false, cool: 0, _wc: 0 }; });
      this.mode = worldData.mode || 'platformer';
      this.climbLevels = cfg.climbLevels != null ? cfg.climbLevels : 0;
      this.playerH = cfg.playerHeight != null ? cfg.playerHeight : 1;
      this.attackBlock = cfg.attackBlockHeight != null ? cfg.attackBlockHeight : 2;
      this.showHidden = !!cfg.showHiddenIndicator;
      this.goal = worldData.goal || null;
      // Ramps/ladders let a walk cross ANY elevation delta at that cell.
      this._rampList = worldData.ramps || [];
      this.ramps = new Set(this._rampList.map((r) => r.col + ',' + r.row));
      // Portals/pipes: map every footprint cell → the building, + each portal's
      // world-centre, so stepping onto one teleports (config.dest) or ends the
      // level (config.isGoal).
      this._portalCells = new Map(); this._portalCenter = new Map(); this._portalIndex = new Map(); this._portalCd = false; this._portalGlow = null;
      let pIdx = 0;
      for (const b of this.buildings) if (b.typeId === 'portal' || b.typeId === 'pipe') {
        const t = OH_BUILDINGS.get(b.typeId), fw = t ? t.footprint.w : 1, fh = t ? t.footprint.h : 1;
        this._portalCenter.set(b.col + ',' + b.row, { x: (b.col + fw / 2) * this.grid.cell, y: (b.row + fh / 2) * this.grid.cell });
        this._portalIndex.set(b.col + ',' + b.row, ++pIdx);
        for (let dr = 0; dr < fh; dr++) for (let dc = 0; dc < fw; dc++) this._portalCells.set((b.col + dc) + ',' + (b.row + dr), b);
      }

      this.baseScheme = OH_CONTROLS.pickScheme(cfg.controlScheme, opts.playerScheme);
      this.angleLockDeg = cfg.angleLockDeg || 0;
      this._schemeOverlay = 0;

      const sp = (worldData.spawns && worldData.spawns[0]) || { col: (map.gridW / 2) | 0, row: (map.gridH / 2) | 0 };
      const cell = this.grid.cell;
      this.player = { x: (sp.col + 0.5) * cell, y: (sp.row + 0.5) * cell, r: Math.max(9, this.unit * 0.4),
        hp: 20, maxHp: 20, speed: this.unit * (cfg.moveSpeed || 0.11), elev: this._elev(sp.col, sp.row), aim: { x: 1, y: 0 }, lastAim: { x: 1, y: 0 },
        dist: 0, jump: null, iFrames: 0, hidden: false,
        // §Campaign pulls the weapon the player finished the prior level with
        // (opts.playerWeapon); otherwise the world's start weapon, else unarmed
        // (displayed as a pickaxe). A real ranged weapon changes fire behaviour;
        // pickaxe/none = cone melee.
        weapon: opts.playerWeapon || worldData.startWeapon || null, _fireCd: 0, _trident: null, _boom: null };
      // A Player Spawn linked to a portal → emerge from that portal.
      if (sp.fromPortal && this._portalCenter.has(sp.fromPortal)) { const d = this._portalCenter.get(sp.fromPortal); this.player.x = d.x; this.player.y = d.y; const c = this._cellOf(d.x, d.y); this.player.elev = this._elev(c.col, c.row); this._portalCd = true; this.camera = OH_GRID.centerOn(this.grid, d.x, d.y, CANVAS_W, CANVAS_H); }
      this._spawn = { x: this.player.x, y: this.player.y };
      this._bolts = []; this._mobBolts = [];
      this.camera = OH_GRID.centerOn(this.grid, this.player.x, this.player.y, CANVAS_W, CANVAS_H);
      this._notif = null; this._running = true;
      if (document.body) { document.body.classList.remove('pre-game'); document.body.classList.add('in-game'); window.dispatchEvent(new Event('resize')); }
      this._loop = this._loop.bind(this); requestAnimationFrame(this._loop);
    }

    _key(c, r) { if (c < 0 || r < 0 || c >= this.grid.gridW || r >= this.grid.gridH) return null; const row = this.ground[r]; return row ? (row[c] || 'grass') : null; }
    _elev(c, r) { const row = this.elevation[r]; return row ? (row[c] | 0) : 0; }
    _hazard(c, r) { const k = this._key(c, r); return !!k && P().isHazardKey(k); }
    _gap(c, r) { return this._key(c, r) == null; }
    _cellOf(x, y) { return OH_GRID.cellAt(this.grid, x, y); }
    // All buildings are SOLID except 'enter'-type ones (portal/pipe/shop) which you
    // walk into — otherwise you couldn't step onto a portal to use it.
    _buildingSolidAt(col, row) {
      for (const b of this.buildings) { const t = OH_BUILDINGS.get(b.typeId); if (!t || t.interactionType === 'enter') continue;
        for (const cl of OH_BUILDINGS.footprintCells(b)) if (cl.col === col && cl.row === row) return true; }
      return false;
    }

    _loop() { if (!this._running) return; try { this._update(); this._render(); } catch (e) { console.error('OverheadGame', e); } this.input.flush(); requestAnimationFrame(this._loop); }

    _update() {
      const inp = this.input;
      // In a Sandbox playtest, Esc returns straight to the designer (not a pause menu).
      if (inp.isJustDown && inp.isJustDown('Escape')) { if (this._testMode) { this._exit(); return; } if (this.state === 'playing') this.state = 'paused'; else if (this.state === 'paused') this.state = 'playing'; else { this._exit(); return; } }
      if (inp.scrollDelta) { OH_GRID.zoomBy(this.grid, inp.scrollDelta < 0 ? 1.08 : 0.92); inp.scrollDelta = 0; }
      // Test-mode "◀ Designer" button (top-left) — click to return to the editor.
      if (this._testMode && inp.mouse.clicked && inp.mouse.x <= 150 && inp.mouse.y <= 30) { this._exit(); return; }
      if (this.state === 'won' || this.state === 'dead') { if (inp.mouse.clicked || (inp.isJustDown && inp.isJustDown('Enter'))) this._exit(); return; }
      if (this.state === 'paused') return;

      const p = this.player;
      if (p.iFrames > 0) p.iFrames--; if (p._fireCd > 0) p._fireCd--;
      const K = (c) => inp.isDown(c);
      const gp = inp.gamepads && inp.gamepads[0];
      let mv = { x: 0, y: 0 };
      if (K('KeyA') || K('ArrowLeft')) mv.x -= 1; if (K('KeyD') || K('ArrowRight')) mv.x += 1;
      if (K('KeyW') || K('ArrowUp')) mv.y -= 1; if (K('KeyS') || K('ArrowDown')) mv.y += 1;
      if (gp && gp.connected) { if (Math.abs(gp.axes0) > 0.2) mv.x += gp.axes0; if (Math.abs(gp.axes1) > 0.2) mv.y += gp.axes1; }
      const moving = mv.x !== 0 || mv.y !== 0;
      const pscr = OH_GRID.worldToScreen(this.grid, this.camera, p.x, p.y);
      const mouseWorld = OH_GRID.screenToWorld(this.grid, this.camera, inp.mouse.x, inp.mouse.y);
      let aimVec = { x: inp.mouse.x - pscr.x, y: inp.mouse.y - pscr.y }, aimStickMag = 0;
      if (gp && gp.connected && (Math.abs(gp.axes2) > 0.2 || Math.abs(gp.axes3) > 0.2)) { aimVec = { x: gp.axes2, y: gp.axes3 }; aimStickMag = Math.hypot(gp.axes2, gp.axes3); }
      const raw = { moveVec: mv, aimVec, aimStickMag, fireBtn: inp.mouse.clicked, fireHeld: inp.mouse.down || (gp && gp.rt > 0.5),
        meleeBtn: inp.mouse.clicked || K('KeyF'), jumpBtn: inp.isJustDown && inp.isJustDown('Space'),
        actionBtn: inp.isJustDown && inp.isJustDown('KeyE'), recallBtn: inp.mouse.rightClicked, lastAim: p.lastAim };
      const eff = OH_CONTROLS.effectiveScheme(this.baseScheme, p.weapon ? { forceTwinStick: false, autoFire: false } : {});
      if (eff.overridden) this._schemeOverlay = Math.min(60, this._schemeOverlay + 2); else this._schemeOverlay = Math.max(0, this._schemeOverlay - 2);
      const intent = OH_CONTROLS.resolve(eff.scheme, raw, { angleLockDeg: this.angleLockDeg });
      if (OH_CONTROLS.norm(intent.aim).x || OH_CONTROLS.norm(intent.aim).y) { p.aim = intent.aim; p.lastAim = intent.aim; }

      // Jump.
      const airborneBefore = p.jump && p.jump.jumping;
      if (raw.jumpBtn) { if (!airborneBefore) p.jump = OH_MOVE.startJump({ moveX: mv.x * p.speed, moveY: mv.y * p.speed, startElev: p.elev }); else if (OH_MOVE.canDoubleJump(p.jump)) OH_MOVE.doubleJump(p.jump); }
      const airborne = p.jump && p.jump.jumping;
      this._moveWithCollision(p, intent.move.x * p.speed, intent.move.y * p.speed, airborne);
      if (moving) { p.dist += Math.hypot(intent.move.x, intent.move.y) * p.speed; p.moveAngle = Math.atan2(intent.move.y, intent.move.x); }
      if (p.jump && p.jump.jumping && OH_MOVE.advanceJump(p.jump).landed) this._resolveLanding(p);
      if (!airborne) { const c = this._cellOf(p.x, p.y);
        if (this._gap(c.col, c.row)) this._fall('Fell'); else if (this._hazard(c.col, c.row) && p.iFrames === 0) this._hurt(4, 'Hazard'); }
      // Hidden if standing under an overhang (a cell ≥ player.elev+2).
      { const c = this._cellOf(p.x, p.y); p.hidden = (this._key(c.col, c.row) === 'leaves' && this._elev(c.col, c.row) > p.elev); }

      // Weapons / melee.
      this._updateWeapons(intent, mouseWorld);
      // Universal action.
      if (intent.action) this._doAction(p);
      // Item pickup.
      this._pickups(p);
      // Mobs + projectiles.
      this._updateMobs(); this._updateProjectiles();

      // Portals / pipes. A PIPE needs the Action button (E); a PORTAL triggers on
      // walk. Teleporting glows both ends purple briefly.
      { const pc = this._cellOf(p.x, p.y); const port = this._portalCells.get(pc.col + ',' + pc.row);
        if (this._portalGlow && --this._portalGlow.t <= 0) this._portalGlow = null;
        if (port && !this._portalCd) {
          const cfg = port.config || {}, isPipe = port.typeId === 'pipe';
          const trigger = isPipe ? !!intent.action : true;
          if (trigger) {
            if (cfg.isGoal) { this._wonExitColor = (this.goal && this.goal.color) || 0; this._win(); }
            else if (cfg.dest && this._portalCenter.has(cfg.dest)) {
              const d = this._portalCenter.get(cfg.dest); const srcKey = port.col + ',' + port.row;
              p.x = d.x; p.y = d.y; const c = this._cellOf(d.x, d.y); p.elev = this._elev(c.col, c.row); this._portalCd = true;
              this._portalGlow = { keys: [srcKey, cfg.dest], t: 42 };
            }
          }
        } else if (!port) this._portalCd = false; }

      if ((this.mode === 'platformer' || this.mode === 'campaign') && this.goal) {
        const c = this._cellOf(p.x, p.y); // goal is a 2×2 region from its anchor
        if (c.col >= this.goal.col && c.col < this.goal.col + 2 && c.row >= this.goal.row && c.row < this.goal.row + 2) { this._wonExitColor = this.goal.color || 0; this._win(); }
      }
      this.camera = OH_GRID.centerOn(this.grid, p.x, p.y, CANVAS_W, CANVAS_H);
    }

    _ramp(c, r) { return this.ramps.has(c + ',' + r); }
    // Attacks reach a target only if it's < attackBlock levels above the attacker
    // (down is always fine). Also used to kill a projectile at a too-high wall.
    _canAttack(fromElev, toElev) { return (toElev - fromElev) < this.attackBlock; }
    // Elevation-relative movement (climbLevels C, playerHeight H):
    //   delta<=0 walk · delta<=C climb-up · delta<=H WALL · delta>H overhang (pass
    //   under, hidden). A ramp/ladder cell lets a walk cross ANY delta. Gaps/solids
    //   block on foot; airborne carries over gap/hazard but not raised terrain.
    _moveWithCollision(ent, dx, dy, airborne) {
      const C = this.climbLevels;
      const cur = this._cellOf(ent.x, ent.y);
      const tryAxis = (nx, ny) => {
        const c = this._cellOf(nx, ny);
        const key = this._key(c.col, c.row);
        if (key == null) return airborne ? null : false;     // gap
        if (this._buildingSolidAt(c.col, c.row)) return false;
        if (key === 'leaves') return ent.elev;               // canopy — always pass under (keep elev)
        const tE = this._elev(c.col, c.row), delta = tE - ent.elev;
        if (delta <= 0) return tE;                           // walk / step down
        if (airborne) return null;                           // flying over raised terrain
        if (delta <= C || this._ramp(c.col, c.row) || this._ramp(cur.col, cur.row)) return tE;   // climb within limit / ramp
        return false;                                        // raised SOLID terrain → wall (any height)
      };
      if (dx) { const res = tryAxis(ent.x + dx + Math.sign(dx) * ent.r, ent.y); if (res !== false) { ent.x += dx; if (res != null && !airborne) ent.elev = res; } }
      if (dy) { const res = tryAxis(ent.x, ent.y + dy + Math.sign(dy) * ent.r); if (res !== false) { ent.y += dy; if (res != null && !airborne) ent.elev = res; } }
    }
    _resolveLanding(p) {
      const c = this._cellOf(p.x, p.y);
      const res = OH_MOVE.landingValid(p.jump, { landingIsGap: this._gap(c.col, c.row), landingIsHazard: this._hazard(c.col, c.row),
        landingIsSolidGround: this._key(c.col, c.row) != null, elevDelta: this._elev(c.col, c.row) - p.jump.startElev });
      if (!res.valid) { if (res.reason === 'hazard') this._hurt(4, 'Hazard'); else if (res.reason === 'gap') this._fall('Missed the jump'); }
      else { const d = this._elev(c.col, c.row) - p.elev; if (d <= this.playerH) p.elev = this._elev(c.col, c.row); }
    }

    // ── Weapons ────────────────────────────────────────────────────────────
    _updateWeapons(intent, mouseWorld) {
      const p = this.player;
      const fire = intent.fire || (this.input.mouse.down && p._fireCd === 0);
      const ang = OH_CONTROLS.angleOf(p.aim);
      if (!p.weapon) { if (intent.melee) this._melee(p, ang); return; }
      const wc = this._weaponCfg();
      if (p.weapon === 'crossbow') { if (fire && p._fireCd === 0) { this._bolts.push(Object.assign(OH_WEAPONS.startBolt(p.x, p.y, ang, wc), { owner: 'p', elev: p.elev })); p._fireCd = 14; } }
      else if (p.weapon === 'trident') {
        if (intent.recallBtn && p._trident) OH_WEAPONS.recallTrident(p._trident);
        else if (fire && !p._trident) { p._trident = OH_WEAPONS.startTrident(p.x, p.y, ang, wc); p._fireCd = 10; }
      } else if (p.weapon === 'boomerang') {
        if (fire && !p._boom) { const dist = Math.hypot(mouseWorld.x - p.x, mouseWorld.y - p.y); p._boom = OH_WEAPONS.startBoomerang(p.x, p.y, ang, dist, wc); p._boom._hit = {}; p._fireCd = 10; }
      }
    }
    _weaponCfg() { const s = this.settings || {}; return { crossbowSpeed: s.crossbowSpeed, tridentSpeed: s.tridentSpeed, tridentReturnSpeed: s.tridentReturnSpeed, boomerangSpeed: s.boomerangSpeed, boomerangMaxRange: s.boomerangRange, boomerangWidth: s.boomerangWidth }; }
    _melee(p, ang) {
      if (p._fireCd > 0) return; p._fireCd = 18;
      const hits = OH_COMBAT.coneHit({ x: p.x, y: p.y }, ang, this.mobs.filter((m) => !m.dead && this._canAttack(p.elev, m.elev || 0)), { reach: this.unit * (this.settings.meleeReach || 2.4), halfAngle: Math.PI / 4, maxHits: 3 });
      for (const m of hits) { m.hp -= 4; if (m.hp <= 0) m.dead = true; }
    }
    // A projectile dies if it crosses terrain ≥ attackBlock levels above its origin.
    _boltWalled(b) { const c = this._cellOf(b.x, b.y); if (this._key(c.col, c.row) === 'leaves') return false; return (this._elev(c.col, c.row) - (b.elev || 0)) >= this.attackBlock; }
    _updateProjectiles() {
      const p = this.player, live = this.mobs.filter((m) => !m.dead);
      // Crossbow bolts.
      for (const b of this._bolts) { OH_WEAPONS.stepBolt(b); if (this._boltWalled(b)) { b.dead = true; continue; } const hit = OH_COMBAT.lineHit({ x: b.x - b.vx, y: b.y - b.vy }, { x: b.x, y: b.y }, live, this.unit * 0.3); if (hit && this._canAttack(b.elev || 0, hit.elev || 0)) { hit.hp -= 5; if (hit.hp <= 0) hit.dead = true; b.dead = true; } }
      this._bolts = this._bolts.filter((b) => !b.dead);
      // Trident.
      if (p._trident) { OH_WEAPONS.stepTrident(p._trident, p); const t = p._trident; if (!t.caught) { for (const m of live) if (this._canAttack(p.elev, m.elev || 0) && Math.hypot(m.x - t.x, m.y - t.y) < m.r + this.unit * 0.3) { m.hp -= 6; if (m.hp <= 0) m.dead = true; if (t.state === 'out') t.state = 'return'; } } if (t.caught) p._trident = null; }
      // Boomerang (arcs, hits along the path, auto-returns).
      if (p._boom) { OH_WEAPONS.stepBoomerang(p._boom, p); const b = p._boom; for (const m of live) { const id = m.col + ',' + m.row + ',' + (this.mobs.indexOf(m)); if (!b._hit[id] && this._canAttack(p.elev, m.elev || 0) && Math.hypot(m.x - b.x, m.y - b.y) < m.r + this.unit * 0.3) { m.hp -= 4; b._hit[id] = 1; if (m.hp <= 0) m.dead = true; } } if (b.dead) p._boom = null; }
      // Mob bolts (skeletons).
      for (const mb of this._mobBolts) { OH_WEAPONS.stepBolt(mb); if (this._boltWalled(mb)) { mb.dead = true; continue; } if (this._canAttack(mb.elev || 0, p.elev) && Math.hypot(mb.x - p.x, mb.y - p.y) < p.r + this.unit * 0.25 && p.iFrames === 0) { this._hurt(3, 'Shot'); mb.dead = true; } }
      this._mobBolts = this._mobBolts.filter((b) => !b.dead);
    }

    _doAction(p) { let near = null, nd = 1e9; for (const b of this.buildings) { if (b.typeId === 'portal' || b.typeId === 'pipe') continue; const bx = (b.col + 0.5) * this.grid.cell, by = (b.row + 0.5) * this.grid.cell; const d = Math.hypot(bx - p.x, by - p.y); if (d < this.unit * 2 && d < nd) { near = b; nd = d; } } if (near) { const t = OH_BUILDINGS.get(near.typeId); this._notify((t ? t.category : 'Building') + ': ' + near.typeId, 90); } }
    _pickups(p) { for (const it of this.items) { if (it.taken) continue; const ix = (it.col + 0.5) * this.grid.cell, iy = (it.row + 0.5) * this.grid.cell; if (Math.hypot(ix - p.x, iy - p.y) < p.r + this.unit * 0.4) { it.taken = true; if (it.kind === 'weapon') { p.weapon = it.weapon; this._notify('Equipped ' + it.weapon, 120); } else this._notify('Coin!', 60); } } }

    _updateMobs() {
      const p = this.player;
      for (const m of this.mobs) { if (m.dead) continue; if (m.cool > 0) m.cool--;
        const d = Math.hypot(p.x - m.x, p.y - m.y);
        // On first detecting the player, seed a random initial cooldown so mobs
        // don't all fire on the same frame / instantly at max range.
        if (d < m.detect) { if (m.state !== 'chase') m.cool = 25 + (Math.random() * 75 | 0); m.state = 'chase'; }
        else if (m.state === 'chase') m.state = 'path';
        if (m.ranged && m.state === 'chase' && d < m.detect && m.cool === 0) { const ang = Math.atan2(p.y - m.y, p.x - m.x); this._mobBolts.push(Object.assign(OH_WEAPONS.startBolt(m.x, m.y, ang, { crossbowSpeed: 6, crossbowRange: m.detect + 40 }), { owner: 'm', elev: m.elev || 0 })); m.cool = 90; }
        if (m.state === 'chase') {
          const ang = Math.atan2(p.y - m.y, p.x - m.x);
          if (!(m.ranged && d < m.detect * 0.6)) { this._moveWithCollision(m, Math.cos(ang) * m.speed, Math.sin(ang) * m.speed, false); m._dist = (m._dist || 0) + m.speed; m._moveAngle = ang; }
        } else {
          // Idle WANDER — pick a random heading for a while, amble at ~40% speed.
          m._wc = (m._wc || 0) - 1;
          if (m._wc <= 0) { m._wanderAngle = Math.random() * Math.PI * 2; m._wc = 50 + (Math.random() * 90 | 0); if (Math.random() < 0.3) m._wc = 30, m._wanderAngle = null; }
          if (m._wanderAngle != null) { const ws = (m.speed || 1) * 0.4; const bx = m.x, by = m.y; this._moveWithCollision(m, Math.cos(m._wanderAngle) * ws, Math.sin(m._wanderAngle) * ws, false); if (m.x === bx && m.y === by) m._wc = 0; else { m._dist = (m._dist || 0) + ws; m._moveAngle = m._wanderAngle; } }
        }
        if (d < m.r + p.r && p.iFrames === 0) this._hurt(3, 'Hit by a mob');
      }
    }

    _hurt(amt, why) { const p = this.player; if (p.iFrames > 0) return; p.hp -= amt; p.iFrames = 45; if (p.hp <= 0) this._fall(why || 'Defeated'); }
    _fall(msg) { const p = this.player; if (p.hp <= 0) { this.state = 'dead'; this._notify(msg || 'You died', 240); return; } p.x = this._spawn.x; p.y = this._spawn.y; p.jump = null; p.iFrames = 60; const c = this._cellOf(p.x, p.y); p.elev = this._elev(c.col, c.row); }
    _win() { if (this.state === 'won') return; this.state = 'won'; if (this._onWin) { try { this._onWin(this, this._wonExitColor || 0); } catch (e) {} } }
    _notify(text, frames) { this._notif = { text, t: frames || 120 }; }
    _exit() { this._running = false; if (document.body) document.body.classList.remove('in-game'); if (this._onExit) this._onExit(this.state); }
    destroy() { this._running = false; if (document.body) document.body.classList.remove('in-game'); }

    // Pre-render the whole static terrain (tops + 3D sides, elevation baked in) to
    // an offscreen canvas at 1:1 world px. `pad` is a top margin so raised tiles
    // (drawn UP) aren't clipped. Blitted each frame in _render.
    _buildTerrainCache() {
      const g = this.grid, cell = g.cell;
      const worldW = g.gridW * cell, worldH = g.gridH * cell;
      const Q = OVERHEAD.elevOffset(cell);
      let maxE = 0; for (let r = 0; r < g.gridH; r++) { const row = this.elevation[r]; if (row) for (let c = 0; c < g.gridW; c++) if ((row[c] | 0) > maxE) maxE = row[c] | 0; }
      const pad = Math.ceil(maxE * Q + cell);   // up-left offset needs pad on BOTH axes
      this._cachePad = pad;
      const cv = document.createElement('canvas'); cv.width = Math.max(1, worldW + pad); cv.height = Math.max(1, worldH + pad);
      const cx = cv.getContext('2d');
      // Back-to-front: up-left = farther (drawn first), bottom-right = closer. Sort
      // by (r+c) then elevation so cubes overlap correctly.
      const cells = [];
      for (let r = 0; r < g.gridH; r++) for (let c = 0; c < g.gridW; c++) { const k = this._key(c, r); if (k == null) continue; cells.push({ c, r, k, e: this._elev(c, r) }); }
      cells.sort((a, b) => (a.r + a.c) - (b.r + b.c) || a.e - b.e);
      for (const cl of cells) {
        const fx = cl.c * cell + pad, fy = cl.r * cell + pad;
        const sN = (cl.r + 1 <= g.gridH - 1) ? this._elev(cl.c, cl.r + 1) : -1, eN = (cl.c + 1 <= g.gridW - 1) ? this._elev(cl.c + 1, cl.r) : -1;
        OVERHEAD.drawTerrainCube(cx, cl.k, fx, fy, cell, cl.e, sN < cl.e, eN < cl.e);
      }
      this._terrainCache = cv;
    }

    // ── Render ────────────────────────────────────────────────────────────
    _render() {
      const ctx = this.ctx, g = this.grid, z = g.masterZoom, cs = g.cell * z;
      ctx.fillStyle = '#0c1119'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      const S = (wx, wy) => OH_GRID.worldToScreen(g, this.camera, wx, wy);
      const tl = OH_GRID.screenToWorld(g, this.camera, 0, 0), br = OH_GRID.screenToWorld(g, this.camera, CANVAS_W, CANVAS_H);
      const c0 = Math.max(0, (tl.x / g.cell | 0) - 1), c1 = Math.min(g.gridW - 1, (br.x / g.cell | 0) + 1);
      const r0 = Math.max(0, (tl.y / g.cell | 0) - 1), r1 = Math.min(g.gridH - 1, (br.y / g.cell | 0) + 1);
      const LIFT = cs * 0.25;   // one elevation level = 1/4 of a block (§)
      // PERF: terrain is STATIC during play — it's pre-rendered ONCE to an offscreen
      // canvas (world-px, elevation baked in) and blitted here, so runtime terrain
      // cost is one drawImage/frame regardless of grid density (the density-4
      // slowdown fix). Live per-cell drawing only happens in the editor.
      if (!this._terrainCache) this._buildTerrainCache();
      const tc = this._terrainCache, pad = this._cachePad;
      // World region visible → source rect in the cache (which has a `pad` top margin).
      const sx = this.camera.x + pad, sy = this.camera.y + pad, sw = CANVAS_W / z, sh = CANVAS_H / z;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tc, sx, sy, sw, sh, 0, 0, CANVAS_W, CANVAS_H);
      for (const rp of this._rampList) { const sp = S((rp.col + 0.5) * g.cell, (rp.row + 0.5) * g.cell); const dir = OVERHEAD.rampDir((c, r) => this._elev(c, r), rp.col, rp.row); OVERHEAD.drawRampIcon(ctx, rp.kind, sp.x, sp.y, cs, dir); }
      if (this.goal) { const gc = (typeof GOAL_COLORS !== 'undefined' && GOAL_COLORS[this.goal.color || 0]) || { hex: '#ffd700' }; const sp = S((this.goal.col + 1) * g.cell, (this.goal.row + 1) * g.cell); ctx.fillStyle = gc.hex; ctx.font = `${(cs * 1.8) | 0}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('★', sp.x, sp.y + cs * 0.62); }
      // Entities sorted by (row + elev).
      const ents = [];
      for (const b of this.buildings) ents.push({ kind: 'b', row: b.row, level: b.level || 0, ref: b });
      for (const it of this.items) if (!it.taken) ents.push({ kind: 'i', row: it.row, level: 0, ref: it });
      for (const m of this.mobs) if (!m.dead) ents.push({ kind: 'm', row: (m.y / g.cell) | 0, level: m.elev || 0, ref: m });
      ents.push({ kind: 'p', row: (this.player.y / g.cell) | 0, level: this.player.elev, ref: this.player });
      OH_ELEV.sortForDraw(ents).forEach((e) => this._drawEntity(e, S, z, cs));
      // Portal/pipe # badges + a purple glow on the ends of an active teleport.
      for (const b of this.buildings) if (b.typeId === 'portal' || b.typeId === 'pipe') {
        const t = OH_BUILDINGS.get(b.typeId), fw = (t ? t.footprint.w : 1), fh = (t ? t.footprint.h : 1);
        const key = b.col + ',' + b.row, sp = S((b.col + fw / 2) * g.cell, (b.row + fh / 2) * g.cell);
        if (this._portalGlow && this._portalGlow.keys.indexOf(key) >= 0) { const a = 0.35 + 0.35 * Math.sin(this._portalGlow.t * 0.5); ctx.fillStyle = `rgba(180,90,230,${a})`; ctx.beginPath(); ctx.ellipse(sp.x, sp.y, fw * cs * 0.5, fh * cs * 0.5, 0, 0, 7); ctx.fill(); }
        { const n = this._portalIndex.get(key); const br = Math.max(11, cs * 0.55), by = sp.y - fh * cs * 0.45; ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.beginPath(); ctx.arc(sp.x, by, br, 0, 7); ctx.fill(); ctx.strokeStyle = '#b56bde'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.max(12, cs * 0.6) | 0}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('#' + n, sp.x, by); ctx.textBaseline = 'alphabetic'; }
      }
      // Projectiles.
      ctx.fillStyle = '#eee'; for (const b of this._bolts) { const s = S(b.x, b.y); ctx.fillRect(s.x - 2, s.y - 2, 4, 4); }
      ctx.fillStyle = '#f88'; for (const b of this._mobBolts) { const s = S(b.x, b.y); ctx.fillRect(s.x - 2, s.y - 2, 4, 4); }
      const p = this.player;
      // Thrown weapons render AS the weapon (they left the hand). Trident points
      // along travel; boomerang spins.
      if (p._trident) { const t = p._trident; const s = S(t.x, t.y); ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(Math.atan2(t.vy, t.vx) + (t.state === 'return' ? Math.PI : 0)); OVERHEAD.drawWeapon(ctx, this.player.r * z, 'trident'); ctx.restore(); }
      if (p._boom) { const b = p._boom; const s = S(b.x, b.y); ctx.save(); ctx.translate(s.x, s.y); ctx.rotate((b.t || 0) * Math.PI * 8); OVERHEAD.drawWeapon(ctx, this.player.r * z, 'boomerang'); ctx.restore(); }
      // Overhang pass — redraw cells ≥ player.elev+2 so the player is hidden beneath.
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const k = this._key(c, r); if (k !== 'leaves') continue; const elev = this._elev(c, r); if (elev <= this.player.elev) continue;
        const Q = OVERHEAD.elevOffset(cs); const sp = S(c * g.cell, r * g.cell); ctx.globalAlpha = 0.96; OVERHEAD.drawTerrainTile(ctx, k, sp.x - elev * Q, sp.y - elev * Q, cs, elev); ctx.globalAlpha = 1; }
      // Hidden indicator (designer opt-in).
      if (this.player.hidden && this.showHidden) { const s = S(this.player.x, this.player.y); ctx.strokeStyle = 'rgba(120,200,255,.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s.x, s.y, cs * 0.4, 0, 7); ctx.stroke(); }
      this._drawHUD(ctx);
    }

    _drawEntity(e, S, z, cs) {
      const ctx = this.ctx, g = this.grid;
      if (e.kind === 'b') { const b = e.ref, t = OH_BUILDINGS.get(b.typeId); const sp = S(b.col * g.cell, b.row * g.cell); const w = (t ? t.footprint.w : 1) * cs, h = (t ? t.footprint.h : 1) * cs; const Q = OVERHEAD.elevOffset(cs), lv = (b.level || 0); OVERHEAD.drawBuilding(ctx, b.typeId, sp.x - lv * Q, sp.y - h + cs - lv * Q, w, h, Math.min(1, cs / 28), b.skin || 'default'); }
      else if (e.kind === 'i') { const it = e.ref; const sp = S((it.col + 0.5) * g.cell, (it.row + 0.5) * g.cell); OVERHEAD.drawItemSprite(ctx, it.itemKey, sp.x, sp.y, this.unit * z * 0.8); }
      else if (e.kind === 'm') { this._drawMob(e.ref, S, z, cs); }
      else if (e.kind === 'p') { this._drawPlayer(S, z, cs); }
    }

    _drawMob(m, S, z, cs) {
      const ctx = this.ctx; const eo = -(m.elev || 0) * OVERHEAD.elevOffset(cs); const raw = S(m.x, m.y); const sp = { x: raw.x + eo, y: raw.y + eo }; const rr = m.r * z;
      const ang = Math.atan2(this.player.y - m.y, this.player.x - m.x);   // mobs face the player
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(sp.x, sp.y + rr * 0.55, rr * 0.9, rr * 0.5, 0, 0, 7); ctx.fill();
      OVERHEAD.drawOverheadMob(ctx, sp.x, sp.y, rr, m._dist || 0, m.state === 'chase', ang, m.type, (m._moveAngle != null ? m._moveAngle : ang));
      if (m.state === 'chase') { ctx.fillStyle = '#ffd24a'; ctx.font = `bold ${(rr) | 0}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('!', sp.x, sp.y - rr * 1.6); }
      const maxHp = (P().OH_MOB_BY_KEY[m.type] || {}).hp || 8;
      if (m.hp < maxHp) { ctx.fillStyle = '#000'; ctx.fillRect(sp.x - rr, sp.y - rr * 1.9, rr * 2, 3); ctx.fillStyle = '#4f4'; ctx.fillRect(sp.x - rr, sp.y - rr * 1.9, rr * 2 * Math.max(0, m.hp / maxHp), 3); }
    }

    _drawPlayer(S, z, cs) {
      const ctx = this.ctx, p = this.player;
      const eo = -p.elev * OVERHEAD.elevOffset(cs);              // elevation offset (up AND left)
      // Jump = a small UP float + a slight SCALE-UP ("getting closer"), not a dip.
      const jp = OH_MOVE.jumpLift(p.jump), maxH = (p.jump && p.jump.height) || 1;
      const jf = maxH > 0 ? Math.min(1, jp / maxH) : 0;
      const floatUp = jp * (this.settings.jumpFloat != null ? this.settings.jumpFloat : 0.4) * z;
      const scaleF = 1 + jf * (this.settings.jumpScale != null ? this.settings.jumpScale : 0.22);
      const sp = S(p.x, p.y); const cx = sp.x + eo, cy = sp.y + eo - floatUp; const rr = p.r * z * scaleF;
      // Ground shadow stays at the surface and shrinks as the sprite "rises".
      const ss = 1 - jf * 0.35;
      ctx.fillStyle = `rgba(0,0,0,${0.32 * ss})`; ctx.beginPath(); ctx.ellipse(sp.x + eo, sp.y + eo, rr * 0.85 * ss, rr * 0.5 * ss, 0, 0, 7); ctx.fill();
      const moving = (this.input.isDown('KeyW') || this.input.isDown('KeyA') || this.input.isDown('KeyS') || this.input.isDown('KeyD') || this.input.isDown('ArrowUp') || this.input.isDown('ArrowLeft') || this.input.isDown('ArrowRight') || this.input.isDown('ArrowDown'));
      const alpha = (p.hidden && !this.showHidden) ? 0.9 : 1;
      ctx.globalAlpha = alpha;
      // Legs face movement; upper body + weapon face aim. Weapon hidden while a
      // trident/boomerang is in flight (it's the thing flying).
      const inFlight = p._trident || p._boom;
      OVERHEAD.drawOverheadPlayer(ctx, cx, cy, rr, p.dist, moving, OH_CONTROLS.angleOf(p.aim),
        { rotate: true, weapon: inFlight ? null : (p.weapon || 'pickaxe'), moveAngle: (p.moveAngle != null ? p.moveAngle : OH_CONTROLS.angleOf(p.aim)) });
      ctx.globalAlpha = 1;
      if (p.iFrames > 0 && ((p.iFrames >> 2) & 1)) { ctx.globalAlpha = 0.4; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
      // Aim reticle.
      const rt = S(p.x + p.aim.x * this.unit * 1.8, p.y + p.aim.y * this.unit * 1.8);
      ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(rt.x, rt.y, 5, 0, 7); ctx.stroke();
    }

    _drawHUD(ctx) {
      ctx.textAlign = 'left';
      // Test-mode "return to designer" button (top-left); hearts drop below it.
      const hy = this._testMode ? 56 : 26;
      if (this._testMode) { ctx.fillStyle = 'rgba(20,26,38,.9)'; ctx.strokeStyle = '#4f86d8'; ctx.lineWidth = 1; ctx.fillRect(8, 6, 142, 24); ctx.strokeRect(8, 6, 142, 24); ctx.fillStyle = '#dbe4f3'; ctx.font = '12px sans-serif'; ctx.fillText('◀ Designer  (Esc)', 18, 22); }
      const hearts = Math.ceil(this.player.hp / 2);
      ctx.font = '18px sans-serif'; ctx.fillStyle = '#ff5a5a'; for (let i = 0; i < hearts; i++) ctx.fillText('♥', 12 + i * 18, hy);
      ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = '12px sans-serif';
      ctx.fillText(`Overhead · ${this.mode} · ${this.baseScheme}${this.player.weapon ? ' · ' + this.player.weapon : ''}  (WASD · mouse aim · click fire · F melee · Space jump · E action · RMB recall trident · wheel zoom)`, 12, CANVAS_H - 12);
      if (this._schemeOverlay > 0) { ctx.globalAlpha = Math.min(1, this._schemeOverlay / 30); ctx.fillStyle = '#ffcf4a'; ctx.textAlign = 'center'; ctx.font = 'bold 13px sans-serif'; ctx.fillText('⟳ Twin-Stick auto-fire', CANVAS_W / 2, 24); ctx.globalAlpha = 1; }
      if (this._notif) { this._notif.t--; if (this._notif.t <= 0) this._notif = null; else { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(CANVAS_W / 2 - 130, 34, 260, 26); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '13px sans-serif'; ctx.fillText(this._notif.text, CANVAS_W / 2, 51); } }
      if (this.state === 'won' || this.state === 'dead' || this.state === 'paused') { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 30px sans-serif'; ctx.fillText(this.state === 'won' ? '★ Level Complete!' : this.state === 'dead' ? 'Game Over' : 'Paused', CANVAS_W / 2, CANVAS_H / 2 - 8); ctx.font = '15px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillText(this.state === 'paused' ? 'Esc to resume · click to exit' : 'Click / Enter to exit', CANVAS_W / 2, CANVAS_H / 2 + 24); }
    }
  }

  if (typeof window !== 'undefined') window.OverheadGame = OverheadGame;
})();
