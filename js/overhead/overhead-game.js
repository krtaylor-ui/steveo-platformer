// ══════════════════════════════════════════════════════════════════════════
// Overhead Engine — runtime (OverheadGame). The playable slice of the depth-first
// foundation: loads an overhead world, renders ground + elevation (staircase +
// cliffs + autotile edge highlights) + buildings + cover + items + mobs + player
// with a scrolling, zoomable camera, drives the player through the §15 control
// schemes with §14 jump + limb animation, does §13 cone combat, and wins on a
// Goal Star (Platformer/Campaign). Its own rAF loop; reuses InputManager.
//
// No art assets — everything is drawn with 2D vector/colour tricks (elevation =
// brightness + Y-offset + cliff shading), per the brief's "no 3D engine" rule.
//
// This is inherently BROWSER-tested territory; the maths it leans on
// (grid/elevation/movement/controls/combat) are the headless-proven modules.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // Demo terrain ids (a real world uses the same small set on its ground layer).
  const T = { VOID: 0, GRASS: 1, PATH: 2, HAZARD: 3, WALL: 4, GOAL: 5 };
  const TERRAIN_COLOR = { 1: '#3f7a43', 2: '#9a8b63', 3: '#3b6bd6', 4: '#5a5a66', 5: '#ffd700' };
  const solidGround  = (id) => id === T.WALL;
  const gapGround    = (id) => id === T.VOID;
  const hazardGround = (id) => id === T.HAZARD;

  const CANVAS_W = 800, CANVAS_H = 500;

  class OverheadGame {
    constructor(worldData, opts, onExit) {
      opts = opts || {};
      this.canvas = document.getElementById('gameCanvas');
      this.ctx = this.canvas.getContext('2d');
      this.input = new InputManager(this.canvas);
      this._onExit = onExit || null;
      this.state = 'playing';         // playing | won | dead | paused
      this._wonExitColor = 0;         // Campaign routing hook (matches side-view Game)
      this._onWin = opts.onWin || null;

      const map = worldData.mapSnapshot || worldData;
      this.map = map;
      this.grid = OH_GRID.make({ gridW: map.gridW, gridH: map.gridH, density: map.density,
        objectScaleMode: map.objectScaleMode, masterZoom: 1.0 });
      this.ground    = map.ground || [];
      this.elevation = map.elevation || [];
      this.decorations = (map.decorations || []).slice();
      this.buildings = (worldData.buildings || []).slice();
      this.items     = (worldData.items || []).map((it) => ({ ...it, taken: false }));
      this.mobs      = (worldData.mobs || []).map((m) => ({ ...m,
        x: (m.col + 0.5) * this.grid.cell, y: (m.row + 0.5) * this.grid.cell, r: 11, hp: m.hp || 6,
        state: 'path', wp: 0, dead: false }));
      this.mode = worldData.mode || 'platformer';
      this.rules = worldData.rules || {};

      // Control scheme (world-forced vs player-pref) + optional weapon override.
      this.baseScheme = OH_CONTROLS.pickScheme(worldData.controlScheme, opts.playerScheme);
      this.angleLockDeg = worldData.angleLockDeg || 0;
      this._weapon = { damage: 4, reach: 78, halfAngle: Math.PI / 4, autoFire: false, forceTwinStick: false };
      this._schemeOverlay = 0;   // transition timer for the twin-stick override indicator

      // Spawn the player at the first spawn point (co-op shares it) or map center.
      const sp = (worldData.spawns && worldData.spawns[0]) || null;
      const scol = sp ? sp.col : Math.floor(map.gridW / 2);
      const srow = sp ? sp.row : Math.floor(map.gridH / 2);
      this.player = {
        x: (scol + 0.5) * this.grid.cell, y: (srow + 0.5) * this.grid.cell, r: 12,
        hp: 20, maxHp: 20, speed: 3.4, elev: this._elevAt(scol, srow),
        aim: { x: 1, y: 0 }, lastAim: { x: 1, y: 0 }, dist: 0, jump: null, iFrames: 0,
      };
      this._spawn = { x: this.player.x, y: this.player.y };
      this._goalCells = this._findGoals();

      this.camera = OH_GRID.centerOn(this.grid, this.player.x, this.player.y, CANVAS_W, CANVAS_H);
      this._running = true;
      this._notif = null;

      if (document.body) { document.body.classList.remove('pre-game'); document.body.classList.add('in-game'); window.dispatchEvent(new Event('resize')); }
      this._loop = this._loop.bind(this);
      requestAnimationFrame(this._loop);
    }

    // ── Grid/terrain helpers ────────────────────────────────────────────────
    _terrainAt(col, row) {
      if (!OH_GRID.inBounds(this.grid, col, row)) return T.WALL;   // OOB = wall
      const r = this.ground[row]; return r ? (r[col] | 0) : T.VOID;
    }
    _elevAt(col, row) { const r = this.elevation[row]; return r ? (r[col] | 0) : 0; }
    _cellOf(x, y) { return OH_GRID.cellAt(this.grid, x, y); }

    _findGoals() {
      const out = [];
      for (let r = 0; r < this.grid.gridH; r++)
        for (let c = 0; c < this.grid.gridW; c++)
          if (this._terrainAt(c, r) === T.GOAL) out.push({ col: c, row: r });
      return out;
    }
    // Building footprint occupancy (solid buildings block movement).
    _buildingSolidAt(col, row) {
      for (const b of this.buildings) {
        const t = (typeof OH_BUILDINGS !== 'undefined') ? OH_BUILDINGS.get(b.typeId) : null;
        if (!t || t.blocksMovement === false) continue;
        for (const cell of OH_BUILDINGS.footprintCells(b)) if (cell.col === col && cell.row === row) return true;
      }
      return false;
    }

    // ── Main loop ─────────────────────────────────────────────────────────────
    _loop() {
      if (!this._running) return;
      try { this._update(); this._render(); } catch (e) { console.error('OverheadGame frame', e); }
      this.input.flush();
      requestAnimationFrame(this._loop);
    }

    _update() {
      const inp = this.input;
      // Pause / exit.
      if (inp.isJustDown && inp.isJustDown('Escape')) {
        if (this.state === 'playing') { this.state = 'paused'; }
        else if (this.state === 'paused') { this.state = 'playing'; }
        else { this._exit(); return; }
      }
      // Zoom (wheel).
      if (inp.scrollDelta) { OH_GRID.zoomBy(this.grid, inp.scrollDelta < 0 ? 1.08 : 0.92); inp.scrollDelta = 0; }

      if (this.state === 'won' || this.state === 'dead') {
        if (inp.mouse.clicked || (inp.isJustDown && inp.isJustDown('Enter'))) this._exit();
        return;
      }
      if (this.state === 'paused') return;

      const p = this.player;
      if (p.iFrames > 0) p.iFrames--;

      // Raw input snapshot.
      const K = (c) => inp.isDown(c);
      const gp = inp.gamepads && inp.gamepads[0];
      let mv = { x: 0, y: 0 };
      if (K('KeyA') || K('ArrowLeft')) mv.x -= 1;
      if (K('KeyD') || K('ArrowRight')) mv.x += 1;
      if (K('KeyW') || K('ArrowUp')) mv.y -= 1;
      if (K('KeyS') || K('ArrowDown')) mv.y += 1;
      if (gp && gp.connected) { if (Math.abs(gp.axes0) > 0.2) mv.x += gp.axes0; if (Math.abs(gp.axes1) > 0.2) mv.y += gp.axes1; }
      // Aim vector: mouse (free-aim) relative to player screen pos, or right stick.
      const pscr = OH_GRID.worldToScreen(this.grid, this.camera, p.x, p.y);
      let aimVec = { x: inp.mouse.x - pscr.x, y: inp.mouse.y - pscr.y };
      let aimStickMag = 0;
      if (gp && gp.connected && (Math.abs(gp.axes2) > 0.2 || Math.abs(gp.axes3) > 0.2)) {
        aimVec = { x: gp.axes2, y: gp.axes3 }; aimStickMag = Math.hypot(gp.axes2, gp.axes3);
      }
      const raw = {
        moveVec: mv, aimVec, aimStickMag,
        fireBtn: inp.mouse.clicked, fireHeld: inp.mouse.down || (gp && gp.rt > 0.5),
        meleeBtn: inp.mouse.clicked || K('Space'), jumpBtn: inp.isJustDown && inp.isJustDown('Space'),
        actionBtn: inp.isJustDown && inp.isJustDown('KeyE'), lastAim: p.lastAim,
      };
      const eff = OH_CONTROLS.effectiveScheme(this.baseScheme, this._weapon);
      if (eff.overridden) this._schemeOverlay = Math.min(60, this._schemeOverlay + 2); else this._schemeOverlay = Math.max(0, this._schemeOverlay - 2);
      const intent = OH_CONTROLS.resolve(eff.scheme, raw,
        { angleLockDeg: this.angleLockDeg, weaponAutoFire: this._weapon.autoFire });
      if (OH_CONTROLS.norm(intent.aim).x || OH_CONTROLS.norm(intent.aim).y) { p.aim = intent.aim; p.lastAim = intent.aim; }

      // Jump.
      const grounded = !(p.jump && p.jump.jumping);
      if (raw.jumpBtn) {
        if (grounded) p.jump = OH_MOVE.startJump({ moveX: intent.move.x * p.speed, moveY: intent.move.y * p.speed, startElev: p.elev });
        else if (OH_MOVE.canDoubleJump(p.jump)) OH_MOVE.doubleJump(p.jump);
      }
      const airborne = p.jump && p.jump.jumping;

      // Planar movement with collision (blocked by solids; gap/hazard blocked
      // only while grounded — airborne carries over them).
      const step = intent.move;
      this._moveWithCollision(p, step.x * p.speed, step.y * p.speed, airborne);
      if (step.x || step.y) p.dist += Math.hypot(step.x, step.y) * p.speed;

      // Advance jump; on land, edge-detect.
      if (p.jump && p.jump.jumping) {
        if (OH_MOVE.advanceJump(p.jump).landed) this._resolveLanding(p);
      }
      // Grounded on gap/hazard → fall / take hazard.
      if (!airborne) {
        const c = this._cellOf(p.x, p.y); const g = this._terrainAt(c.col, c.row);
        if (gapGround(g)) this._fall('Fell into the void');
        else if (hazardGround(g) && p.iFrames === 0) this._hurt(4, 'Hazard');
        else p.elev = this._elevAt(c.col, c.row);
      }

      // Combat — cone melee on fire.
      if (intent.fire || intent.melee) this._attack(p);
      // Universal action.
      if (intent.action) this._doAction(p);

      // Mobs.
      this._updateMobs();

      // Goal (Platformer / Campaign).
      if ((this.mode === 'platformer' || this.mode === 'campaign')) {
        const c = this._cellOf(p.x, p.y);
        if (this._goalCells.some((gc) => gc.col === c.col && gc.row === c.row)) this._win();
      }

      // Camera follow.
      this.camera = OH_GRID.centerOn(this.grid, p.x, p.y, CANVAS_W, CANVAS_H);
    }

    _moveWithCollision(ent, dx, dy, airborne) {
      const tryAxis = (nx, ny) => {
        const c = this._cellOf(nx, ny);
        if (!OH_GRID.inBounds(this.grid, c.col, c.row)) return false;
        const g = this._terrainAt(c.col, c.row);
        if (solidGround(g) || this._buildingSolidAt(c.col, c.row)) return false;   // solids always block
        if (!airborne && gapGround(g)) return false;                                // can't walk into void
        // Same-elevation walking + auto-climb gate.
        if (!airborne) {
          const tier = this.rules.autoClimb || 'disabled';
          if (!OH_ELEV.autoClimbAllows(ent.elev, this._elevAt(c.col, c.row), tier)
              && !this._rampBetween(ent, c)) return false;
        }
        return true;
      };
      if (dx && tryAxis(ent.x + dx + Math.sign(dx) * ent.r, ent.y)) ent.x += dx;
      if (dy && tryAxis(ent.x, ent.y + dy + Math.sign(dy) * ent.r)) ent.y += dy;
    }
    _rampBetween() { return false; }   // ramps: placeholder (auto-climb covers MVP transitions)

    _resolveLanding(p) {
      const c = this._cellOf(p.x, p.y);
      const g = this._terrainAt(c.col, c.row);
      const res = OH_MOVE.landingValid(p.jump, {
        landingIsGap: gapGround(g), landingIsHazard: hazardGround(g),
        landingIsSolidGround: !solidGround(g),
        elevDelta: this._elevAt(c.col, c.row) - p.jump.startElev,
      });
      if (!res.valid) {
        if (res.reason === 'hazard') this._hurt(4, 'Hazard');
        else if (res.reason === 'gap') this._fall('Missed the jump');
        // elevation/no-ground: nudge back toward spawn cell edge (blocked landing)
      } else p.elev = this._elevAt(c.col, c.row);
    }

    _attack(p) {
      const targets = this.mobs.filter((m) => !m.dead);
      const hits = OH_COMBAT.coneHit({ x: p.x, y: p.y }, OH_CONTROLS.angleOf(p.aim), targets,
        { reach: this._weapon.reach, halfAngle: this._weapon.halfAngle, maxHits: 3 });
      for (const m of hits) {
        m.hp -= OH_COMBAT.resolveDamage(this._weapon, m);
        if (m.hp <= 0) { m.dead = true; }
      }
    }
    _doAction(p) {
      // Universal Action: interact with the nearest interact-on-approach/enter building.
      let near = null, nd = 9999;
      for (const b of this.buildings) {
        const bx = (b.col + 0.5) * this.grid.cell, by = (b.row + 0.5) * this.grid.cell;
        const d = Math.hypot(bx - p.x, by - p.y);
        if (d < 60 && d < nd) { near = b; nd = d; }
      }
      if (near) { const t = OH_BUILDINGS.get(near.typeId); this._notify((t ? t.category : 'Building') + ': ' + (near.typeId), 90); }
    }

    _updateMobs() {
      const p = this.player;
      for (const m of this.mobs) {
        if (m.dead) continue;
        const d = Math.hypot(p.x - m.x, p.y - m.y);
        // Three-state cycle: path → chase-on-detect → resume path.
        const detect = m.detect || 180;
        if (d < detect) m.state = 'chase'; else if (m.state === 'chase') m.state = 'path';
        let tx, ty;
        if (m.state === 'chase') { tx = p.x; ty = p.y; }
        else { const path = this._mobPath(m); if (path && path.length) { const w = path[m.wp % path.length]; tx = (w.col + 0.5) * this.grid.cell; ty = (w.row + 0.5) * this.grid.cell; if (Math.hypot(tx - m.x, ty - m.y) < 8) m.wp++; } else { tx = m.x; ty = m.y; } }
        const ang = Math.atan2(ty - m.y, tx - m.x);
        const sp = m.speed || 1.6;
        this._moveWithCollision(m, Math.cos(ang) * sp, Math.sin(ang) * sp, false);
        // Contact damage.
        if (d < m.r + p.r && p.iFrames === 0) this._hurt(3, 'Hit by a mob');
      }
    }
    _mobPath(m) {
      if (m.pathId != null && this.mode) { /* authored path lookup would go here */ }
      return m.path || null;
    }

    _hurt(amt, why) {
      const p = this.player; if (p.iFrames > 0) return;
      p.hp -= amt; p.iFrames = 45;
      if (p.hp <= 0) this._fall(why || 'Defeated');
    }
    _fall(msg) {
      const p = this.player;
      p.hp = Math.max(0, p.hp);
      if (p.hp <= 0) { this.state = 'dead'; this._notify(msg || 'You died', 240); return; }
      // Respawn at spawn (health keeps; a gap/hazard just resets position for MVP).
      p.x = this._spawn.x; p.y = this._spawn.y; p.jump = null; p.iFrames = 60;
      const c = this._cellOf(p.x, p.y); p.elev = this._elevAt(c.col, c.row);
    }
    _win() {
      if (this.state === 'won') return;
      this.state = 'won'; this._wonExitColor = 0;
      if (this._onWin) { try { this._onWin(this, this._wonExitColor); } catch (e) {} }
    }
    _notify(text, frames) { this._notif = { text, t: frames || 120 }; }

    _exit() {
      this._running = false;
      if (document.body) document.body.classList.remove('in-game');
      if (this._onExit) this._onExit(this.state);
    }
    destroy() { this._running = false; if (document.body) document.body.classList.remove('in-game'); }

    // ── Rendering ───────────────────────────────────────────────────────────
    _render() {
      const ctx = this.ctx, g = this.grid, cam = this.camera, z = g.masterZoom;
      ctx.fillStyle = '#10141c'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      const S = (wx, wy) => OH_GRID.worldToScreen(g, cam, wx, wy);
      const cs = g.cell * z;

      // Visible cell range.
      const tl = OH_GRID.screenToWorld(g, cam, 0, 0), br = OH_GRID.screenToWorld(g, cam, CANVAS_W, CANVAS_H);
      const c0 = Math.max(0, Math.floor(tl.x / g.cell) - 1), c1 = Math.min(g.gridW - 1, Math.ceil(br.x / g.cell) + 1);
      const r0 = Math.max(0, Math.floor(tl.y / g.cell) - 1), r1 = Math.min(g.gridH - 1, Math.ceil(br.y / g.cell) + 1);

      // Terrain pass (rows top→bottom so higher rows overlap correctly).
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const id = this._terrainAt(c, r); if (id === T.VOID) continue;
          const elev = this._elevAt(c, r);
          const lift = OH_ELEV.yOffset(elev) * z;
          const sp = S(c * g.cell, r * g.cell);
          const x = sp.x, y = sp.y + lift;
          // Cliff face (south drop).
          const drop = OH_ELEV.cliffHeight(elev, this._elevAt(c, r + 1)) * z;
          if (drop > 0) { ctx.fillStyle = '#20242e'; ctx.fillRect(x, y + cs, cs + 1, drop + 1); }
          // Top tile — shade by elevation (higher = lighter).
          let col = TERRAIN_COLOR[id] || '#666';
          if (elev > 0 && id !== T.GOAL) col = _lighten(col, Math.min(0.4, elev * 0.12));
          ctx.fillStyle = col; ctx.fillRect(x, y, cs + 1, cs + 1);
          // Autotile edge highlight (lighter lip on exposed edges).
          const bm = OH_ELEV.edgeBitmask(c, r, elev, (cc, rr) => (OH_GRID.inBounds(g, cc, rr) ? this._elevAt(cc, rr) : null));
          if (elev > 0 && bm) {
            ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 2;
            if (bm & OH_ELEV.N) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + cs, y); ctx.stroke(); }
            if (bm & OH_ELEV.W) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + cs); ctx.stroke(); }
          }
          if (id === T.GOAL) { ctx.fillStyle = '#fff6b0'; ctx.font = `${Math.round(cs * 0.7)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('★', x + cs / 2, y + cs * 0.78); }
        }
      }

      // Entity pass — buildings, items, mobs, player, sorted by (row + elev).
      const ents = [];
      for (const b of this.buildings) ents.push({ kind: 'building', row: b.row, elev: b.level || 0, ref: b });
      for (const it of this.items) if (!it.taken) ents.push({ kind: 'item', row: it.row, elev: 0, ref: it });
      for (const m of this.mobs) if (!m.dead) ents.push({ kind: 'mob', row: Math.floor(m.y / g.cell), elev: 0, ref: m });
      ents.push({ kind: 'player', row: Math.floor(this.player.y / g.cell), elev: this.player.elev, ref: this.player });
      OH_ELEV.sortForDraw(ents).forEach((e) => this._drawEntity(e, S, z, cs));

      // Cover decorations (drawn OVER entities — the Leaves/Bushes trick).
      for (const d of this.decorations) if (d.cover) {
        const sp = S(d.col * g.cell, d.row * g.cell);
        ctx.globalAlpha = 0.62; ctx.fillStyle = '#2f5a34'; ctx.fillRect(sp.x, sp.y, cs, cs); ctx.globalAlpha = 1;
      }

      this._drawHUD(ctx);
    }

    _drawEntity(e, S, z, cs) {
      const ctx = this.ctx, g = this.grid;
      if (e.kind === 'building') {
        const b = e.ref, t = OH_BUILDINGS.get(b.typeId);
        const sp = S(b.col * g.cell, b.row * g.cell);
        const w = (t ? t.footprint.w : 1) * cs, h = (t ? t.footprint.h : 1) * cs;
        const lift = OH_ELEV.yOffset(b.level || 0) * z;
        ctx.fillStyle = (t && t.color) || '#8a7fb0'; ctx.fillRect(sp.x, sp.y - h + cs + lift, w, h);
        ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.strokeRect(sp.x, sp.y - h + cs + lift, w, h);
        ctx.fillStyle = '#fff'; ctx.font = `${Math.round(cs * 0.32)}px sans-serif`; ctx.textAlign = 'center';
        ctx.fillText((t ? t.category : b.typeId), sp.x + w / 2, sp.y - h + cs + lift + h / 2);
      } else if (e.kind === 'item') {
        const it = e.ref, sp = S((it.col + 0.5) * g.cell, (it.row + 0.5) * g.cell);
        ctx.fillStyle = '#ffd94a'; ctx.beginPath(); ctx.arc(sp.x, sp.y, cs * 0.22, 0, 7); ctx.fill();
      } else if (e.kind === 'mob') {
        const m = e.ref, sp = S(m.x, m.y);
        ctx.fillStyle = m.state === 'chase' ? '#d05050' : '#a05a5a';
        ctx.beginPath(); ctx.arc(sp.x, sp.y, m.r * z, 0, 7); ctx.fill();
      } else if (e.kind === 'player') {
        this._drawPlayer(S, z);
      }
    }

    _drawPlayer(S, z) {
      const ctx = this.ctx, p = this.player;
      const lift = OH_MOVE.jumpLift(p.jump) * z + OH_ELEV.yOffset(p.elev) * z;
      const sp = S(p.x, p.y);
      const cx = sp.x, cy = sp.y + lift;
      // Shadow (stays on the ground when jumping).
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(sp.x, sp.y + OH_ELEV.yOffset(p.elev) * z, p.r * z * 0.9, p.r * z * 0.5, 0, 0, 7); ctx.fill();
      // Limb animation.
      const moving = Math.hypot(p.aim.x, p.aim.y) >= 0 && (this.input.isDown('KeyW') || this.input.isDown('KeyA') || this.input.isDown('KeyS') || this.input.isDown('KeyD') || this.input.isDown('ArrowUp') || this.input.isDown('ArrowLeft') || this.input.isDown('ArrowRight') || this.input.isDown('ArrowDown'));
      const lp = OH_MOVE.limbPhase(p.dist, moving);
      const rr = p.r * z;
      // Legs.
      ctx.strokeStyle = '#334'; ctx.lineWidth = 3 * z;
      ctx.beginPath(); ctx.moveTo(cx - rr * 0.3, cy); ctx.lineTo(cx - rr * 0.3, cy + rr * 0.7 + lp.legL * z); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + rr * 0.3, cy); ctx.lineTo(cx + rr * 0.3, cy + rr * 0.7 + lp.legR * z); ctx.stroke();
      // Body.
      ctx.fillStyle = '#4b83c7'; ctx.beginPath(); ctx.arc(cx, cy - lp.bob * z, rr, 0, 7); ctx.fill();
      if (p.iFrames > 0 && (p.iFrames >> 2) & 1) { ctx.globalAlpha = 0.5; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
      // Aim indicator (arms reach toward aim).
      const a = OH_CONTROLS.angleOf(p.aim);
      ctx.strokeStyle = '#dfe8f6'; ctx.lineWidth = 3 * z;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * rr * 1.4, cy + Math.sin(a) * rr * 1.4); ctx.stroke();
      // Free-aim reticle.
      const rt = S(p.x + p.aim.x * 60, p.y + p.aim.y * 60);
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(rt.x, rt.y, 5, 0, 7); ctx.stroke();
    }

    _drawHUD(ctx) {
      // Health hearts.
      ctx.textAlign = 'left';
      const hearts = Math.ceil(this.player.hp / 2);
      ctx.font = '18px sans-serif'; ctx.fillStyle = '#ff5a5a';
      for (let i = 0; i < hearts; i++) ctx.fillText('♥', 12 + i * 18, 26);
      // Mode + scheme badge.
      ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = '12px sans-serif';
      ctx.fillText(`Overhead · ${this.mode} · ${OH_CONTROLS.effectiveScheme(this.baseScheme, this._weapon).scheme}  (WASD move · mouse aim · click attack · Space jump · E action · wheel zoom · Esc pause)`, 12, CANVAS_H - 12);
      // Twin-stick override indicator (§15).
      if (this._schemeOverlay > 0) {
        ctx.globalAlpha = Math.min(1, this._schemeOverlay / 30);
        ctx.fillStyle = '#ffcf4a'; ctx.textAlign = 'center'; ctx.font = 'bold 13px sans-serif';
        ctx.fillText('⟳ Twin-Stick auto-fire', CANVAS_W / 2, 24); ctx.globalAlpha = 1;
      }
      if (this._notif) { this._notif.t--; if (this._notif.t <= 0) this._notif = null;
        else { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(CANVAS_W / 2 - 130, 34, 260, 26); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '13px sans-serif'; ctx.fillText(this._notif.text, CANVAS_W / 2, 51); } }
      // End screens.
      if (this.state === 'won' || this.state === 'dead' || this.state === 'paused') {
        ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 30px sans-serif';
        ctx.fillText(this.state === 'won' ? '★ Level Complete!' : this.state === 'dead' ? 'Game Over' : 'Paused', CANVAS_W / 2, CANVAS_H / 2 - 8);
        ctx.font = '15px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.8)';
        ctx.fillText(this.state === 'paused' ? 'Esc to resume · click to exit' : 'Click / Enter to exit', CANVAS_W / 2, CANVAS_H / 2 + 24);
      }
    }
  }

  function _lighten(hex, amt) {
    const h = hex.replace('#', ''); if (h.length !== 6) return hex;
    const n = parseInt(h, 16);
    const r = Math.min(255, ((n >> 16) & 255) + amt * 255), gg = Math.min(255, ((n >> 8) & 255) + amt * 255), b = Math.min(255, (n & 255) + amt * 255);
    return `rgb(${r | 0},${gg | 0},${b | 0})`;
  }

  if (typeof window !== 'undefined') { window.OverheadGame = OverheadGame; window.OH_TERRAIN = T; }
})();
