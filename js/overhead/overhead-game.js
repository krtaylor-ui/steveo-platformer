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
          hp: m.hp || d.hp, speed: m.speed || d.speed, detect: (cfg.mobDetectBlocks != null ? cfg.mobDetectBlocks : 10) * this.unit, ranged: !!d.ranged, state: 'path', wp: 0, dead: false, cool: 0, _wc: 0 }; });
      this.mode = worldData.mode || 'platformer';
      this.climbLevels = Number.isFinite(+cfg.climbLevels) ? +cfg.climbLevels : 0;   // coerce (guards a stringy setting)
      this.playerH = cfg.playerHeight != null ? cfg.playerHeight : 1;
      this.attackBlock = cfg.attackBlockHeight != null ? cfg.attackBlockHeight : 2;
      this.showHidden = !!cfg.showHiddenIndicator;
      // "Always show player" reveal window: a circle of revealRadius blocks around the
      // player that punches through canopy/overhangs so the player + nearby ground stay
      // visible (encourages searching woods). Only shows when actually covered.
      this._revealPlayer = !!cfg.revealPlayer;
      this._revealRadius = (cfg.revealRadius != null ? cfg.revealRadius : 4);
      // Day / night cycle (visual tint + a small mob-detection boost at night).
      this._dayNight = !!cfg.dayNight;
      this._dayLen = cfg.dayLengthSec > 0 ? cfg.dayLengthSec : 120;
      this._dayStart = (cfg.dayStart != null ? cfg.dayStart : 0.25);
      this._nightMax = (cfg.nightDarkness != null ? cfg.nightDarkness : 0.6);
      this._showSunMoon = cfg.showSunMoon !== false;   // faint tracking disc (toggle)
      this._sunMoonShape = cfg.sunMoonShape === 'square' ? 'square' : 'circle';
      this._shadows = cfg.shadows !== false;           // dynamic elevation shadows (toggle)
      // Universal light REACH per unit brightness (blocks) + per-object brightness.
      this._lightRange = (cfg.lightRange != null ? cfg.lightRange : 5);
      const briOf = { lava: (cfg.lavaBrightness != null ? cfg.lavaBrightness : 0.7),
                      glowstone: (cfg.glowstoneBrightness != null ? cfg.glowstoneBrightness : 0.95) };
      this._elapsed = 0; this._tod = this._dayNight ? this._dayStart : 0.5; this._detectMult = 1;
      // Death FX particles (family-friendly: coloured sprite blocks, no gore).
      this._deathFx = null;
      // Cliff-fall guard + pit / lava behaviour (creator safety controls).
      this._blockCliffFall = cfg.blockCliffFall !== false;   // default ON: no accidental walk-offs
      this._maxStepDown = (cfg.maxStepDown != null ? cfg.maxStepDown : 1);   // 0 = can't walk down at all
      // Pits: 'deadly' (fall in → insta-death) | 'block' (impassable, even in GOD mode).
      this._pitMode = cfg.pitMode || (cfg.pitsDeadly === false ? 'block' : 'deadly');
      this._pitsDeadly = this._pitMode !== 'block';
      this._lavaDeadly = !!cfg.lavaDeadly;                   // lava is insta-death instead of damage
      this._bridgeGuardrails = cfg.bridgeGuardrails !== false;   // rails on bridges (can't fall off the sides)
      this._drawbridgeStyle = cfg.drawbridgeStyle || 'vanishing';
      this._dbPhase = {};   // per-drawbridge animation phase (0 = down/closed, 1 = up/open)
      // Jump CLEARANCE: blocks a jump can clear/mount. Additive with double jump —
      // e.g. jump 1 + double 1 = clear 2; jump 0 + double 1 = a double jump clears 1.
      this._jumpClear = (cfg.jumpClear != null ? cfg.jumpClear : 1);
      this._doubleJumpClear = (cfg.doubleJumpClear != null ? cfg.doubleJumpClear : 1);
      // Sprint (Shift by default) — a speed multiplier while held.
      this._sprint = cfg.sprint !== false;
      this._sprintMult = (cfg.sprintMultiplier != null ? cfg.sprintMultiplier : 1.6);
      // Jump-to-dodge: 'none' | 'single' (any jump) | 'double' (only while double-jumping).
      this._dodgeAttacks = cfg.dodgeAttacks || 'none';   // dodge ranged shots
      this._dodgeMobs = cfg.dodgeMobs || 'none';         // dodge mob body-contact
      // Melee arc (total degrees the swing/cone covers).
      this._meleeArcDeg = (cfg.meleeArc != null ? cfg.meleeArc : 50);
      // Precompute light-emitting cells (glowstone / lava) once, with each one's
      // brightness (per-object) and colour. Reach is brightness × the universal range.
      this._lightCells = [];
      for (let r = 0; r < (map.gridH || 0); r++) for (let c = 0; c < (map.gridW || 0); c++) {
        const k = this._key(c, r), col = P().lightColor(k);
        if (col) this._lightCells.push({ c, r, color: col, bri: (briOf[k] != null ? briOf[k] : 0.8) });
      }
      this.goal = worldData.goal || null;
      // Ramps/ladders let a walk cross ANY elevation delta at that cell.
      this._rampList = worldData.ramps || [];
      this.ramps = new Set(this._rampList.map((r) => r.col + ',' + r.row));
      // Bridges: a walk-over-gap deck at a set elevation. A DRAWBRIDGE (draw:true)
      // starts OPEN (a gap) and CLOSES (walkable) while its redstone `channel` is on.
      this._bridges = worldData.bridges || [];
      this._bridgeAt = new Map(); for (const b of this._bridges) this._bridgeAt.set(b.col + ',' + b.row, b);
      // Redstone network (levers/dust/lamps/tx/rx). Evaluated each frame → channels.
      this._redstone = worldData.redstone || [];
      this._rs = (typeof OH_REDSTONE !== 'undefined') ? OH_REDSTONE.evaluate(this._redstone) : { powered: new Set(), channels: {} };
      // Portals/pipes: map every footprint cell → the building, + each portal's
      // world-centre, so stepping onto one teleports (config.dest) or ends the
      // level (config.isGoal).
      this._portalCells = new Map(); this._portalCenter = new Map(); this._portalIndex = new Map(); this._portalByKey = new Map(); this._portalCd = false; this._portalGlow = null; this._portalPrompt = null;
      let pIdx = 0;
      for (const b of this.buildings) if (b.typeId === 'portal' || b.typeId === 'pipe') {
        const t = OH_BUILDINGS.get(b.typeId), fw = t ? t.footprint.w : 1, fh = t ? t.footprint.h : 1;
        const key = b.col + ',' + b.row;
        this._portalCenter.set(key, { x: (b.col + fw / 2) * this.grid.cell, y: (b.row + fh / 2) * this.grid.cell });
        this._portalIndex.set(key, ++pIdx); this._portalByKey.set(key, b);
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
        weapon: opts.playerWeapon || worldData.startWeapon || null, weapons: [], _fireCd: 0, _trident: null, _boom: null };
      if (this.player.weapon) this.player.weapons.push(this.player.weapon);
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
    // All buildings are SOLID — you can't walk through any of them (portals
    // included; you use those by standing NEXT to them + E).
    _buildingSolidAt(col, row) {
      for (const b of this.buildings) { const t = OH_BUILDINGS.get(b.typeId); if (!t) continue;
        if (col >= b.col && col < b.col + t.footprint.w && row >= b.row && row < b.row + t.footprint.h) return true; }
      return false;
    }

    _loop() { if (!this._running) return; try { this._update(); this._render(); } catch (e) { console.error('OverheadGame', e); } this.input.flush(); requestAnimationFrame(this._loop); }

    _update() {
      const inp = this.input; this._frame = (this._frame || 0) + 1;
      // Advance the day/night clock (~60fps). detectMultiplier feeds mob sight.
      if (this._dayNight && typeof OH_DAYNIGHT !== 'undefined') { this._elapsed += 1 / 60; this._tod = OH_DAYNIGHT.phase(this._elapsed, this._dayLen, this._dayStart); this._detectMult = OH_DAYNIGHT.detectMultiplier(this._tod); }
      // Re-evaluate the redstone network (drives drawbridge channels, lamps, doors).
      if (this._redstone.length && typeof OH_REDSTONE !== 'undefined') { this._updatePlates(); this._rs = OH_REDSTONE.evaluate(this._redstone); }
      // In a Sandbox playtest, Esc returns straight to the designer (not a pause menu).
      if (inp.isJustDown && inp.isJustDown('Escape')) { if (this._testMode) { this._exit(); return; } if (this.state === 'playing') this.state = 'paused'; else if (this.state === 'paused') this.state = 'playing'; else { this._exit(); return; } }
      if (inp.scrollDelta) { OH_GRID.zoomBy(this.grid, inp.scrollDelta < 0 ? 1.08 : 0.92); inp.scrollDelta = 0; }
      // Test-mode buttons (top-left): "◀ Designer" (return) + "God" (invincible) toggle.
      if (this._testMode && inp.mouse.clicked) {
        if (inp.mouse.x <= 150 && inp.mouse.y <= 30) { this._exit(); return; }
        if (inp.mouse.x >= 156 && inp.mouse.x <= 236 && inp.mouse.y <= 30) { this._god = !this._god; }
      }
      if (this.state === 'won' || this.state === 'dead') { if (inp.mouse.clicked || (inp.isJustDown && inp.isJustDown('Enter'))) this._exit(); return; }
      if (this.state === 'dying') { this._advanceDeath(); return; }   // play the death burst
      if (this.state === 'paused') return;

      const p = this.player;
      if (p.iFrames > 0) p.iFrames--; if (p._fireCd > 0) p._fireCd--;
      if (inp.isJustDown && (inp.isJustDown('KeyQ') || inp.isJustDown('Tab'))) this._cycleWeapon();   // switch weapon
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

      // Sprint (Shift by default) — a speed multiplier, also carried into a jump.
      const sprinting = this._sprint && inp.isDown && (inp.isDown('ShiftLeft') || inp.isDown('ShiftRight'));
      const spd = p.speed * (sprinting ? this._sprintMult : 1);
      // Jump. maxElevationJump = the jump's clearance (additive with the double jump).
      const airborneBefore = p.jump && p.jump.jumping;
      if (raw.jumpBtn) {
        if (!airborneBefore) { p.jump = OH_MOVE.startJump({ moveX: mv.x * spd, moveY: mv.y * spd, startElev: p.elev, maxElevationJump: this._jumpClear }); p._jumpFrom = { x: p.x, y: p.y }; }
        else if (this.settings.doubleJump !== false && OH_MOVE.canDoubleJump(p.jump)) { OH_MOVE.doubleJump(p.jump); p.jump.maxElevationJump = (p.jump.maxElevationJump | 0) + this._doubleJumpClear; }
      }
      const airborne = p.jump && p.jump.jumping;
      this._moveWithCollision(p, intent.move.x * spd, intent.move.y * spd, airborne);
      if (moving) { p.dist += Math.hypot(intent.move.x, intent.move.y) * p.speed; p.moveAngle = Math.atan2(intent.move.y, intent.move.x); }
      if (p.jump && p.jump.jumping && OH_MOVE.advanceJump(p.jump).landed) this._resolveLanding(p);
      if (!airborne) { const c = this._cellOf(p.x, p.y);
        if (this._bridgeClosedAt(c.col, c.row)) { /* standing on a solid bridge deck — no fall/hazard */ }
        else if (this._pitsDeadly && this._pit(c.col, c.row)) this._die('Fell into a pit', 'pit');
        else if (this._gap(c.col, c.row)) this._fall('Fell');
        else if (this._hazard(c.col, c.row)) { if (this._lavaDeadly) this._die('Fell in lava'); else if (p.iFrames === 0) this._hurt(4, 'Hazard'); } }
      // Hidden if standing under an overhang (a cell ≥ player.elev+2).
      { const c = this._cellOf(p.x, p.y); p.hidden = (this._key(c.col, c.row) === 'leaves' && this._elev(c.col, c.row) > p.elev); }

      // Weapons / melee.
      this._updateWeapons(intent, mouseWorld);
      if (p._swingT > 0) p._swingT--;   // advance the melee swing animation
      // Item pickup.
      this._pickups(p);
      // Mobs + projectiles.
      this._updateMobs(); this._updateProjectiles();

      // Portals / pipes take PRIORITY on the E button over the generic decoration
      // notice (a pipe next to a statue must still teleport). PROXIMITY + E (both
      // types — no accidental walk-through). The nearest in-range one glows; press E.
      if (this._portalGlow && --this._portalGlow.t <= 0) this._portalGlow = null;
      let actionUsed = false;
      { const useR = this.unit * 1.6; let near = null, nk = null, nd = useR;
        // Proximity to the nearest FOOTPRINT CELL (so you can trigger a big portal
        // by standing adjacent — the buildings are solid, you can't stand on it).
        for (const [ck, b] of this._portalCells) { const [cc, rr] = ck.split(',').map(Number); const dx = (cc + 0.5) * this.grid.cell - p.x, dy = (rr + 0.5) * this.grid.cell - p.y; const dd = Math.hypot(dx, dy); if (dd < nd) { nd = dd; near = b; nk = b.col + ',' + b.row; } }
        this._portalPrompt = near ? nk : null;
        if (near && !this._portalCd && intent.action) {
          const cfg = near.config || {}; const label = near.typeId === 'pipe' ? 'pipe' : 'portal';
          if (cfg.isGoal) { actionUsed = true; this._wonExitColor = (this.goal && this.goal.color) || 0; this._win(); }
          else if (cfg.dest && this._portalByKey.has(cfg.dest)) {
            // Land just IN FRONT of (below) the destination portal — it's solid, so
            // don't drop the player inside it. Guard against instant re-trigger.
            actionUsed = true;
            const db = this._portalByKey.get(cfg.dest), dt = OH_BUILDINGS.get(db.typeId), dw = dt ? dt.footprint.w : 1, dh = dt ? dt.footprint.h : 1;
            const px = (db.col + dw / 2) * this.grid.cell, py = (db.row + dh + 0.5) * this.grid.cell;
            const c = this._cellOf(px, py); p.x = px; p.y = py; p.elev = this._elev(c.col, c.row); this._portalCd = true;
            this._portalGlow = { keys: [nk, cfg.dest], t: 42 };
          } else {
            // In range + pressed E, but this end has no destination — tell the player
            // instead of silently doing nothing (and don't fall through to the statue).
            actionUsed = true; this._notify('This ' + label + ' is not linked to a destination yet.', 100);
          }
        }
        if (!near || nd > useR * 0.6) this._portalCd = false;   // release the guard once clear of the destination
      }
      // A nearby LEVER toggles on E (before the decoration notice).
      if (intent.action && !actionUsed && this._toggleNearbyLever(p)) actionUsed = true;
      // Universal action (decoration notice) — only if nothing else consumed E.
      if (intent.action && !actionUsed) this._doAction(p);

      if ((this.mode === 'platformer' || this.mode === 'campaign') && this.goal) {
        const c = this._cellOf(p.x, p.y); // goal is a 2×2 region from its anchor
        if (c.col >= this.goal.col && c.col < this.goal.col + 2 && c.row >= this.goal.row && c.row < this.goal.row + 2) { this._wonExitColor = this.goal.color || 0; this._win(); }
      }
      this.camera = OH_GRID.centerOn(this.grid, p.x, p.y, CANVAS_W, CANVAS_H);
    }

    // Dodging: airborne cancels a hit when the dodge mode allows it. 'single' = any
    // jump; 'double' = only while double-jumping (harder).
    _dodging(mode) { const j = this.player.jump; if (!j || !j.jumping) return false; if (mode === 'single') return true; if (mode === 'double') return !!j.doubleUsed; return false; }
    _meleeHalfAngle() { return Math.max(6, this._meleeArcDeg || 50) * Math.PI / 180 / 2; }
    _ramp(c, r) { return this.ramps.has(c + ',' + r); }
    // A ramp makes climbing forgiving: it counts if it's ON this cell OR an
    // orthogonal neighbour, so a ramp placed a cell off from the true collision
    // edge (easy to do — the 2.5D stacked-cube offset draws raised terrain up/left
    // of its grid cell) still lets the player walk up.
    _rampNear(c, r) { return this._ramp(c, r) || this._ramp(c - 1, r) || this._ramp(c + 1, r) || this._ramp(c, r - 1) || this._ramp(c, r + 1); }
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
      const curRamp = this._ramp(cur.col, cur.row);
      const curBridge = this._bridges.length ? this._bridgeAt.get(cur.col + ',' + cur.row) : null;
      // Resolve ONE sample point → false (blocked) | null (airborne, pass over a
      // gap) | elevation number (walkable, take this elevation).
      const sample = (nx, ny) => {
        const c = this._cellOf(nx, ny);
        // A closed bridge deck spans gaps — it overrides the underlying terrain.
        if (this._bridges.length) {
          const tb = this._bridgeAt.get(c.col + ',' + c.row);
          // Guardrail: while ON a railed bridge, block a sideways step OFF it onto a
          // gap / pit / lower ground (can only leave at the ends — same-level ground
          // or another bridge cell).
          if (curBridge && this._bridgeGuardrails && !tb) { const tk = this._key(c.col, c.row); if (tk == null || tk === 'pit' || this._elev(c.col, c.row) < (curBridge.elev | 0)) return false; }
          if (tb && this._bridgeClosedAt(c.col, c.row)) return tb.elev | 0;   // walkable deck
          // an OPEN drawbridge falls through to normal terrain logic (a gap → fall)
        }
        const key = this._key(c.col, c.row);
        if (key == null) return airborne ? null : false;     // gap
        if (this._buildingSolidAt(c.col, c.row)) return false;
        if (this._pistonSolidAt(c.col, c.row)) return false;   // an extended (powered) piston blocks
        if (key === 'leaves') return ent.elev;               // canopy — always pass under (keep elev)
        if (key === 'pit') return this._pitsDeadly ? ent.elev : false;   // deadly: step in (fatal after); else a hard obstacle
        const tE = this._elev(c.col, c.row), delta = tE - ent.elev;
        if (delta <= 0) {                                    // walk / step down
          // Cliff-fall guard (player only): don't let a WALK drop more than
          // maxStepDown levels — stops accidental falls off high platforms with no
          // way back. Ramps/bridges (nearby) are the intended way down.
          if (ent === this.player && this._blockCliffFall && delta < -this._maxStepDown && !this._rampNear(cur.col, cur.row) && !this._rampNear(c.col, c.row)) return false;
          return tE;
        }
        if (airborne) { const clear = (ent.jump && ent.jump.maxElevationJump) | 0; return delta <= clear ? tE : false; }   // a jump clears/mounts up to its clearance
        if (delta <= C || this._rampNear(cur.col, cur.row) || this._rampNear(c.col, c.row)) return tE;   // climb within limit / via (nearby) ramp
        return false;                                        // raised SOLID terrain → wall (any height)
      };
      const r = ent.r, lat = r * 0.7;
      // Sample the leading edge at the CENTRE + two lateral points (across the
      // player's width) so a single-cell obstacle — a tree trunk, a 1-wide wall —
      // can't be slipped past when the player isn't aligned with it. On/entering a
      // RAMP, fall back to the centre only so a wide player can still climb a narrow
      // ramp (lateral high terrain beside a ramp must not block the climb).
      const step = (cx, cy, ox, oy) => {
        const mid = sample(cx, cy);
        if (mid === false) return false;
        const cc = this._cellOf(cx, cy);
        const onRamp = curRamp || this._ramp(cc.col, cc.row);
        if (!onRamp && (sample(cx + ox, cy + oy) === false || sample(cx - ox, cy - oy) === false)) return false;
        return mid;                                          // null (airborne gap) or elevation
      };
      if (dx) { const res = step(ent.x + dx + Math.sign(dx) * r, ent.y, 0, lat); if (res !== false) { ent.x += dx; if (res != null && !airborne) ent.elev = res; } }
      if (dy) { const res = step(ent.x, ent.y + dy + Math.sign(dy) * r, lat, 0); if (res !== false) { ent.y += dy; if (res != null && !airborne) ent.elev = res; } }
    }
    _resolveLanding(p) {
      const c = this._cellOf(p.x, p.y);
      if (this._pitsDeadly && this._pit(c.col, c.row)) { this._die('Fell into a pit'); return; }
      const res = OH_MOVE.landingValid(p.jump, { landingIsGap: this._gap(c.col, c.row), landingIsHazard: this._hazard(c.col, c.row),
        landingIsSolidGround: this._key(c.col, c.row) != null, elevDelta: this._elev(c.col, c.row) - p.jump.startElev });
      if (!res.valid) {
        if (res.reason === 'hazard') { if (this._lavaDeadly) this._die('Fell in lava'); else this._hurt(4, 'Hazard'); }
        else if (res.reason === 'gap') this._fall('Missed the jump');
        else if (p._jumpFrom) { p.x = p._jumpFrom.x; p.y = p._jumpFrom.y; }   // couldn't clear the wall → bounce back
      } else { p.elev = this._elev(c.col, c.row); }   // landed within the jump's clearance
    }

    // ── Weapons ────────────────────────────────────────────────────────────
    _updateWeapons(intent, mouseWorld) {
      const p = this.player;
      const fire = intent.fire || (this.input.mouse.down && p._fireCd === 0);
      const ang = OH_CONTROLS.angleOf(p.aim);
      if (!p.weapon) { if (intent.melee) this._melee(p, ang, 'pickaxe'); return; }
      // With a weapon held, F does a MELEE SWING using that weapon (click still fires).
      if (this.input.isDown && this.input.isDown('KeyF')) this._melee(p, ang, p.weapon);
      const wc = this._weaponCfg();
      if (p.weapon === 'crossbow') { if (fire && p._fireCd === 0) { this._bolts.push(Object.assign(OH_WEAPONS.startBolt(p.x, p.y, ang, wc), { owner: 'p', elev: p.elev })); p._fireCd = 14; } }
      else if (p.weapon === 'trident') {
        if (intent.recallBtn && p._trident) OH_WEAPONS.recallTrident(p._trident);
        else if (fire && !p._trident) { p._trident = OH_WEAPONS.startTrident(p.x, p.y, ang, wc); p._trident.elev = p.elev; p._fireCd = 10; }
      } else if (p.weapon === 'boomerang') {
        if (fire && !p._boom) { const dist = Math.hypot(mouseWorld.x - p.x, mouseWorld.y - p.y); p._boom = OH_WEAPONS.startBoomerang(p.x, p.y, ang, dist, wc); p._boom._hit = {}; p._boom.elev = p.elev; p._fireCd = 10; }
      }
    }
    _weaponCfg() { const s = this.settings || {}; return { crossbowSpeed: s.crossbowSpeed, tridentSpeed: s.tridentSpeed, tridentReturnSpeed: s.tridentReturnSpeed, boomerangSpeed: s.boomerangSpeed, boomerangMaxRange: s.boomerangRange, boomerangWidth: s.boomerangWidth }; }
    _melee(p, ang, weapon) {
      if (p._fireCd > 0) return; p._fireCd = 18; p._swingT = 14; p._swingDur = 14; p._swingAng = ang; p._swingWeapon = weapon || 'pickaxe';   // trigger the swing anim
      const hits = OH_COMBAT.coneHit({ x: p.x, y: p.y }, ang, this.mobs.filter((m) => !m.dead && this._canAttack(p.elev, m.elev || 0)), { reach: this.unit * (this.settings.meleeReach || 2.4), halfAngle: this._meleeHalfAngle(), maxHits: 3 });
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
      if (p._trident) { OH_WEAPONS.stepTrident(p._trident, p); const t = p._trident;
        if (t.state === 'out' && this._boltWalled(t)) OH_WEAPONS.recallTrident(t);   // hit a too-high wall → return
        if (!t.caught) { for (const m of live) if (this._canAttack(p.elev, m.elev || 0) && Math.hypot(m.x - t.x, m.y - t.y) < m.r + this.unit * 0.3) { m.hp -= 6; if (m.hp <= 0) m.dead = true; if (t.state === 'out') t.state = 'return'; } } if (t.caught) p._trident = null; }
      // Boomerang (arcs, hits along the path, auto-returns; a wall cuts it to the return leg).
      if (p._boom) { OH_WEAPONS.stepBoomerang(p._boom, p); const b = p._boom;
        if (b.t < 0.5 && this._boltWalled(b)) b.t = 1 - b.t;   // wall on the way out → start coming back
        for (const m of live) { const id = m.col + ',' + m.row + ',' + (this.mobs.indexOf(m)); if (!b._hit[id] && this._canAttack(p.elev, m.elev || 0) && Math.hypot(m.x - b.x, m.y - b.y) < m.r + this.unit * 0.3) { m.hp -= 4; b._hit[id] = 1; if (m.hp <= 0) m.dead = true; } } if (b.dead) p._boom = null; }
      // Mob bolts (skeletons).
      for (const mb of this._mobBolts) { OH_WEAPONS.stepBolt(mb); if (this._boltWalled(mb)) { mb.dead = true; continue; } if (!mb._dodged && this._canAttack(mb.elev || 0, p.elev) && Math.hypot(mb.x - p.x, mb.y - p.y) < p.r + this.unit * 0.25 && p.iFrames === 0) { if (this._dodging(this._dodgeAttacks)) { mb._dodged = true; this._notify('Dodged!', 30); } else { this._hurt(3, 'Shot'); mb.dead = true; } } }   // a dodged bolt is flagged (not killed) so it flies on past
      this._mobBolts = this._mobBolts.filter((b) => !b.dead);
    }

    _toggleNearbyLever(p) {
      if (!this._redstone.length || typeof OH_REDSTONE === 'undefined') return false;
      let near = null, nd = this.unit * 1.6;
      for (const d of this._redstone) if (d.kind === 'lever' || d.kind === 'button') { const dx = (d.col + 0.5) * this.grid.cell - p.x, dy = (d.row + 0.5) * this.grid.cell - p.y; const dd = Math.hypot(dx, dy); if (dd < nd) { nd = dd; near = d; } }
      if (!near) return false;
      near.on = !near.on; this._rs = OH_REDSTONE.evaluate(this._redstone); this._notify('Lever ' + (near.on ? 'ON' : 'OFF'), 40); return true;
    }
    _doAction(p) { let near = null, nd = 1e9; for (const b of this.buildings) { if (b.typeId === 'portal' || b.typeId === 'pipe') continue; const bx = (b.col + 0.5) * this.grid.cell, by = (b.row + 0.5) * this.grid.cell; const d = Math.hypot(bx - p.x, by - p.y); if (d < this.unit * 2 && d < nd) { near = b; nd = d; } } if (near) { const t = OH_BUILDINGS.get(near.typeId); this._notify((t ? t.category : 'Building') + ': ' + near.typeId, 90); } }
    _pickups(p) { for (const it of this.items) { if (it.taken) continue; const ix = (it.col + 0.5) * this.grid.cell, iy = (it.row + 0.5) * this.grid.cell; if (Math.hypot(ix - p.x, iy - p.y) < p.r + this.unit * 0.4) { it.taken = true; if (it.kind === 'weapon') { if (!p.weapons.includes(it.weapon)) p.weapons.push(it.weapon); p.weapon = it.weapon; this._notify('Equipped ' + it.weapon + ' (Q to switch)', 120); } else this._notify('Coin!', 60); } } }
    // Cycle the equipped weapon through the collected list (+ pickaxe fallback).
    _cycleWeapon() { const list = this.player.weapons.length ? this.player.weapons.slice() : []; if (!list.includes('pickaxe')) list.push('pickaxe'); if (list.length < 2) return; const i = Math.max(0, list.indexOf(this.player.weapon)); this.player.weapon = list[(i + 1) % list.length]; this._notify(this.player.weapon, 60); }

    _updateMobs() {
      const p = this.player;
      for (const m of this.mobs) { if (m.dead) continue; if (m.cool > 0) m.cool--;
        const d = Math.hypot(p.x - m.x, p.y - m.y);
        const det = m.detect * (this._detectMult || 1);   // mobs see farther at night
        // On first detecting the player, seed a random initial cooldown so mobs
        // don't all fire on the same frame / instantly at max range.
        if (d < det) { if (m.state !== 'chase') m.cool = 25 + (Math.random() * 75 | 0); m.state = 'chase'; }
        else if (m.state === 'chase') m.state = 'path';
        if (m.ranged && m.state === 'chase' && d < det && m.cool === 0) { const ang = Math.atan2(p.y - m.y, p.x - m.x); this._mobBolts.push(Object.assign(OH_WEAPONS.startBolt(m.x, m.y, ang, { crossbowSpeed: 6, crossbowRange: det + 40 }), { owner: 'm', elev: m.elev || 0 })); m.cool = 90; }
        if (m.state === 'chase') {
          const ang = Math.atan2(p.y - m.y, p.x - m.x);
          if (!(m.ranged && d < det * 0.6)) { this._moveWithCollision(m, Math.cos(ang) * m.speed, Math.sin(ang) * m.speed, false); m._dist = (m._dist || 0) + m.speed; m._moveAngle = ang; }
        } else {
          // Idle WANDER — pick a random heading for a while, amble at ~40% speed.
          m._wc = (m._wc || 0) - 1;
          if (m._wc <= 0) { m._wanderAngle = Math.random() * Math.PI * 2; m._wc = 50 + (Math.random() * 90 | 0); if (Math.random() < 0.3) m._wc = 30, m._wanderAngle = null; }
          if (m._wanderAngle != null) { const ws = (m.speed || 1) * 0.4; const bx = m.x, by = m.y; this._moveWithCollision(m, Math.cos(m._wanderAngle) * ws, Math.sin(m._wanderAngle) * ws, false); if (m.x === bx && m.y === by) m._wc = 0; else { m._dist = (m._dist || 0) + ws; m._moveAngle = m._wanderAngle; } }
        }
        if (d < m.r + p.r && p.iFrames === 0 && !this._dodging(this._dodgeMobs)) this._hurt(3, 'Hit by a mob');
      }
    }

    _pit(c, r) { const k = this._key(c, r); return !!k && P().isPitKey(k); }
    // Pressure plates / weight blocks activate when enough entities stand on them.
    _updatePlates() {
      for (const d of this._redstone) if (d.kind === 'plate' || d.kind === 'weight') {
        let n = 0; const pc = this._cellOf(this.player.x, this.player.y); if (pc.col === d.col && pc.row === d.row) n++;
        for (const m of this.mobs) if (!m.dead) { const mc = this._cellOf(m.x, m.y); if (mc.col === d.col && mc.row === d.row) n++; }
        d._active = n >= (d.kind === 'weight' ? (d.threshold || 2) : 1);
      }
    }
    // A powered piston is a solid barrier (blocks movement); unpowered = passable.
    _pistonSolidAt(c, r) { if (!this._redstone.length) return false; for (const d of this._redstone) if (d.kind === 'piston' && d.col === c && d.row === r) return OH_REDSTONE.cellPowered(this._rs, c, r); return false; }
    _bridge(c, r) { return this._bridgeAt.get(c + ',' + r) || null; }
    // A bridge cell is CLOSED (a solid walkable deck) when it's a normal bridge, or a
    // drawbridge whose channel is powered. Open drawbridges are gaps.
    _bridgeClosedAt(c, r) { const b = this._bridgeAt.get(c + ',' + r); return !!b && (!b.draw || (typeof OH_REDSTONE !== 'undefined' && OH_REDSTONE.receives(this._rs, b))); }
    _hurt(amt, why) { const p = this.player; if (this._god || p.iFrames > 0) return; p.hp -= amt; p.iFrames = 45; if (p.hp <= 0) this._die(why || 'Defeated'); }
    _fall(msg) { const p = this.player; if (p.hp <= 0) { this._die(msg || 'You died'); return; } p.x = this._spawn.x; p.y = this._spawn.y; p.jump = null; p.iFrames = 60; const c = this._cellOf(p.x, p.y); p.elev = this._elev(c.col, c.row); }
    // Family-friendly death (no blood/gore). Default: the player bursts into its
    // own coloured sprite blocks. PIT deaths first show a front-facing figure with
    // flailing limbs SHRINKING for ~1s (falling in), THEN the burst.
    _die(msg, cause) {
      if (this._god || this.state === 'dying' || this.state === 'dead') return;
      const p = this.player; p.hp = 0; this.state = 'dying'; this._deathMsg = msg || 'You died';
      if (cause === 'pit') this._deathFx = { phase: 'sink', t: 0, sinkDur: 60, x: p.x, y: p.y, parts: null };
      else this._deathFx = { phase: 'burst', t: 0, x: p.x, y: p.y, parts: this._burstParts(p.x, p.y) };
    }
    _burstParts(x, y) {
      const sp = P().OH_SPRITE, cols = [sp.hair, sp.shirt, sp.shirt, sp.pants, sp.pants, sp.skin], parts = [], n = 16;
      for (let i = 0; i < n; i++) { const ang = (i / n) * Math.PI * 2 + (i % 3) * 0.4, spd = this.unit * (0.06 + (i % 5) * 0.02);
        parts.push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, sz: this.unit * (0.16 + (i % 4) * 0.05), rot: ang, vr: (i % 2 ? 1 : -1) * 0.2, color: cols[i % cols.length], life: 46 + (i % 10) }); }
      return parts;
    }
    _advanceDeath() {
      const fx = this._deathFx; if (!fx) { this.state = 'dead'; return; }
      fx.t++;
      if (fx.phase === 'sink') { if (fx.t >= fx.sinkDur) { fx.phase = 'burst'; fx.t = 0; fx.parts = this._burstParts(fx.x, fx.y); } return; }
      let alive = 0;
      // Top-down: pieces scatter OUTWARD and settle in place (no gravity), then fade.
      for (const q of fx.parts) { if (q.life <= 0) continue; alive++; q.x += q.vx; q.y += q.vy; q.vx *= 0.9; q.vy *= 0.9; q.rot += q.vr; q.life--; }
      if (alive === 0 || fx.t > 90) { this.state = 'dead'; this._notify(this._deathMsg, 240); }
    }
    // Front-facing figure with flailing limbs, used for the pit-death shrink phase.
    _drawDyingSprite(ctx, sx, sy, size, scale, t) {
      const sp = P().OH_SPRITE, u = size * 1.3 * Math.max(0.06, scale);
      const f1 = Math.sin(t * 0.6) * 0.6, f2 = Math.cos(t * 0.7) * 0.6;
      // Sit the figure INSIDE the pit cell and sink it further as it shrinks.
      ctx.save(); ctx.translate(sx, sy + size * 0.2 + size * 0.55 * (1 - scale)); ctx.lineCap = 'round';
      ctx.strokeStyle = sp.pants; ctx.lineWidth = Math.max(2, u * 0.16);
      ctx.beginPath(); ctx.moveTo(-u * 0.15, u * 0.2); ctx.lineTo(-u * 0.15 + f1 * u * 0.4, u * 0.6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(u * 0.15, u * 0.2); ctx.lineTo(u * 0.15 - f2 * u * 0.4, u * 0.6); ctx.stroke();
      ctx.strokeStyle = sp.skin;
      ctx.beginPath(); ctx.moveTo(-u * 0.2, -u * 0.1); ctx.lineTo(-u * 0.5, -u * 0.35 + f2 * u * 0.35); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(u * 0.2, -u * 0.1); ctx.lineTo(u * 0.5, -u * 0.35 - f1 * u * 0.35); ctx.stroke();
      ctx.fillStyle = sp.shirt; ctx.fillRect(-u * 0.22, -u * 0.2, u * 0.44, u * 0.45);
      ctx.fillStyle = sp.skin; ctx.fillRect(-u * 0.2, -u * 0.56, u * 0.4, u * 0.4);
      ctx.fillStyle = sp.hair; ctx.fillRect(-u * 0.22, -u * 0.6, u * 0.44, u * 0.16);
      ctx.fillStyle = '#222'; ctx.fillRect(-u * 0.12, -u * 0.42, u * 0.08, u * 0.08); ctx.fillRect(u * 0.04, -u * 0.42, u * 0.08, u * 0.08);
      ctx.restore();
    }
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
      // Dynamic elevation shadows (cast by the sun/moon; drawn on the ground under
      // entities). Independent of whether the sun/moon disc itself is shown.
      if (this._dayNight && this._shadows && typeof OH_DAYNIGHT !== 'undefined') this._drawShadows(ctx, S, cs, c0, c1, r0, r1);
      for (const rp of this._rampList) { const sp = S((rp.col + 0.5) * g.cell, (rp.row + 0.5) * g.cell); const dir = OVERHEAD.rampDir((c, r) => this._elev(c, r), rp.col, rp.row); OVERHEAD.drawRampIcon(ctx, rp.kind, sp.x, sp.y, cs, dir); }
      if (this._bridges.length) this._drawBridges(ctx, S, cs);
      if (this._redstone.length) this._drawRedstone(ctx, S, cs);
      if (this.goal) { const gc = (typeof GOAL_COLORS !== 'undefined' && GOAL_COLORS[this.goal.color || 0]) || { hex: '#ffd700' }; const sp = S((this.goal.col + 1) * g.cell, (this.goal.row + 1) * g.cell); ctx.fillStyle = gc.hex; ctx.font = `${(cs * 1.8) | 0}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('★', sp.x, sp.y + cs * 0.62); }
      // Entities sorted by (row + elev).
      const ents = [];
      for (const b of this.buildings) ents.push({ kind: 'b', row: b.row, level: b.level || 0, ref: b });
      for (const it of this.items) if (!it.taken) ents.push({ kind: 'i', row: it.row, level: 0, ref: it });
      for (const m of this.mobs) if (!m.dead) ents.push({ kind: 'm', row: (m.y / g.cell) | 0, level: m.elev || 0, ref: m });
      ents.push({ kind: 'p', row: (this.player.y / g.cell) | 0, level: this.player.elev, ref: this.player });
      OH_ELEV.sortForDraw(ents).forEach((e) => this._drawEntity(e, S, z, cs));
      // Melee swing — the ACTUAL held weapon sweeps through the attack cone. The
      // weapon is scaled to fill the arc (a wider arc → a bigger sweep).
      { const pl = this.player; if (pl._swingT > 0) {
          const prog = 1 - pl._swingT / (pl._swingDur || 14), half = this._meleeHalfAngle(), a0 = pl._swingAng - half;
          const s = S(pl.x, pl.y), reach = this.unit * (this.settings.meleeReach || 2.4) * z, sweep = a0 + prog * half * 2;
          const wk = pl._swingWeapon === 'crossbow' ? 'bow' : (pl._swingWeapon || 'pickaxe');
          const arcScale = Math.max(0.7, (half * 2) / (Math.PI / 4));   // fill wider arcs with a bigger weapon
          ctx.save();
          ctx.fillStyle = 'rgba(255,255,255,.09)'; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.arc(s.x, s.y, reach, a0, a0 + prog * half * 2); ctx.closePath(); ctx.fill();
          ctx.translate(s.x, s.y); ctx.rotate(sweep);
          OVERHEAD.drawWeapon(ctx, reach * 0.62 * arcScale, wk);
          ctx.restore();
        } }
      // Portal/pipe # badges + a purple glow on the ends of an active teleport.
      for (const b of this.buildings) if (b.typeId === 'portal' || b.typeId === 'pipe') {
        const t = OH_BUILDINGS.get(b.typeId), fw = (t ? t.footprint.w : 1), fh = (t ? t.footprint.h : 1);
        const key = b.col + ',' + b.row, sp = S((b.col + fw / 2) * g.cell, (b.row + fh / 2) * g.cell);
        if (this._portalGlow && this._portalGlow.keys.indexOf(key) >= 0) { const a = 0.35 + 0.35 * Math.sin(this._portalGlow.t * 0.5); ctx.fillStyle = `rgba(180,90,230,${a})`; ctx.beginPath(); ctx.ellipse(sp.x, sp.y, fw * cs * 0.5, fh * cs * 0.5, 0, 0, 7); ctx.fill(); }
        // "Press E" prompt + glow when the player is in range of this one.
        if (key === this._portalPrompt) { const a = 0.4 + 0.3 * Math.sin((this._frame || 0) * 0.15); ctx.fillStyle = `rgba(180,90,230,${a})`; ctx.beginPath(); ctx.ellipse(sp.x, sp.y, fw * cs * 0.55, fh * cs * 0.55, 0, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,.75)'; const py = sp.y - fh * cs * 0.62; ctx.fillRect(sp.x - cs * 0.9, py - cs * 0.5, cs * 1.8, cs * 0.7); ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.max(11, cs * 0.5) | 0}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Press E', sp.x, py - cs * 0.15); ctx.textBaseline = 'alphabetic'; }
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
      // Overhang pass — redraw canopy above the player so it hides beneath. With the
      // reveal window on, skip canopy within revealRadius of the player (punch a hole).
      const revR = this._revealPlayer ? this._revealRadius * this.unit : 0; let revealed = false;
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const k = this._key(c, r); if (k !== 'leaves') continue; const elev = this._elev(c, r); if (elev <= this.player.elev) continue;
        if (revR > 0 && Math.hypot((c + 0.5) * g.cell - this.player.x, (r + 0.5) * g.cell - this.player.y) <= revR) { revealed = true; continue; }
        const Q = OVERHEAD.elevOffset(cs); const sp = S(c * g.cell, r * g.cell); ctx.globalAlpha = 0.96; OVERHEAD.drawTerrainTile(ctx, k, sp.x - elev * Q, sp.y - elev * Q, cs, elev); ctx.globalAlpha = 1; }
      // The reveal circle only appears when the player is actually under canopy.
      if (this._revealPlayer && revealed) { const s = S(this.player.x, this.player.y); ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.arc(s.x, s.y, revR * z, 0, 7); ctx.stroke(); ctx.setLineDash([]); ctx.restore(); }
      // Hidden indicator (designer opt-in).
      if (this.player.hidden && this.showHidden) { const s = S(this.player.x, this.player.y); ctx.strokeStyle = 'rgba(120,200,255,.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s.x, s.y, cs * 0.4, 0, 7); ctx.stroke(); }
      // Death FX (family-friendly). Pit deaths shrink+flail first, then everyone bursts
      // into their own coloured sprite blocks that fly out, spin, fall and fade.
      if (this._deathFx && (this.state === 'dying' || this.state === 'dead')) {
        const fx = this._deathFx;
        if (fx.phase === 'sink') { const s = S(fx.x, fx.y); this._drawDyingSprite(ctx, s.x, s.y, this.unit * z, 1 - (fx.t / fx.sinkDur) * 0.85, fx.t); }
        else if (fx.parts) {
          for (const q of fx.parts) { if (q.life <= 0) continue; const s = S(q.x, q.y);
            ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(q.rot); ctx.globalAlpha = Math.max(0, Math.min(1, q.life / 22));
            ctx.fillStyle = q.color; ctx.fillRect(-q.sz * z / 2, -q.sz * z / 2, q.sz * z, q.sz * z); ctx.restore(); }
          ctx.globalAlpha = 1;
        }
      }
      // Day/night ambient overlay + light sources + sun/moon disc — drawn before the
      // HUD so the HUD stays crisp.
      if (this._dayNight && typeof OH_DAYNIGHT !== 'undefined') this._drawNight(ctx, S, cs);
      this._drawHUD(ctx);
    }

    _drawEntity(e, S, z, cs) {
      const ctx = this.ctx, g = this.grid;
      if (e.kind === 'b') { const b = e.ref, t = OH_BUILDINGS.get(b.typeId); const sp = S(b.col * g.cell, b.row * g.cell); const w = (t ? t.footprint.w : 1) * cs, h = (t ? t.footprint.h : 1) * cs; const Q = OVERHEAD.elevOffset(cs), lv = (b.level || 0); OVERHEAD.drawBuilding(ctx, b.typeId, sp.x - lv * Q, sp.y - lv * Q, w, h, Math.min(1, cs / 28), b.skin || 'default'); }
      else if (e.kind === 'i') { const it = e.ref; const sp = S((it.col + 0.5) * g.cell, (it.row + 0.5) * g.cell); OVERHEAD.drawItemSprite(ctx, it.itemKey, sp.x, sp.y, this.unit * z * 0.8); }
      else if (e.kind === 'm') { this._drawMob(e.ref, S, z, cs); }
      else if (e.kind === 'p') { if (this.state !== 'dying' && this.state !== 'dead') this._drawPlayer(S, z, cs); }
    }

    _drawMob(m, S, z, cs) {
      const ctx = this.ctx; const eo = -(m.elev || 0) * OVERHEAD.elevOffset(cs); const raw = S(m.x, m.y); const sp = { x: raw.x + eo, y: raw.y + eo }; const rr = m.r * z;
      const ang = Math.atan2(this.player.y - m.y, this.player.x - m.x);   // mobs face the player
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(sp.x, sp.y + rr * 0.55, rr * 0.9, rr * 0.5, 0, 0, 7); ctx.fill();
      // NOTE: the grey ring is a MAP-CREATOR indicator only — the editor draws its
      // own; the live game shows just the drop shadow + sprite (no ring).
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
      const inFlight = p._trident || p._boom || p._swingT > 0;   // also hide the held weapon during a melee swing (the enlarged swinging weapon stands in)
      // Double-jump flourish: 'somersault' (head-over-heels y-foreshorten) or 'spin'.
      let spin = 0, somersault = null;
      if (p.jump && p.jump.jumping && p.jump.doubleUsed) { const prog = Math.min(1, p.jump.t / p.jump.dur); if ((this.settings.doubleJumpStyle || 'somersault') === 'spin') spin = prog * Math.PI * 3; else somersault = prog; }
      OVERHEAD.drawOverheadPlayer(ctx, cx, cy, rr, p.dist, moving, OH_CONTROLS.angleOf(p.aim),
        { rotate: true, weapon: inFlight ? null : (p.weapon || 'pickaxe'), moveAngle: (p.moveAngle != null ? p.moveAngle : OH_CONTROLS.angleOf(p.aim)), spin, somersault, facing: OH_CONTROLS.angleOf(p.aim) });
      ctx.globalAlpha = 1;
      if (p.iFrames > 0 && ((p.iFrames >> 2) & 1)) { ctx.globalAlpha = 0.4; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
      // Aim reticle.
      const rt = S(p.x + p.aim.x * this.unit * 1.8, p.y + p.aim.y * this.unit * 1.8);
      ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(rt.x, rt.y, 5, 0, 7); ctx.stroke();
    }

    _rgba(hex, a) { const h = String(hex).replace('#', ''); const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }

    // Dynamic elevation shadows: cast from cliff edges facing away from the sun/moon,
    // onto an offscreen canvas (so overlapping casts don't stack darker), then blit
    // at the shadow alpha. Length scales with elevation and low-body angle.
    _drawShadows(ctx, S, cs, c0, c1, r0, r1) {
      const sh = OH_DAYNIGHT.shadow(this._tod); if (sh.alpha <= 0.01) return;
      const sc = this._shadowCanvas || (this._shadowCanvas = document.createElement('canvas'));
      if (sc.width !== CANVAS_W || sc.height !== CANVAS_H) { sc.width = CANVAS_W; sc.height = CANVAS_H; }
      const sx = sc.getContext('2d'); sx.clearRect(0, 0, CANVAS_W, CANVAS_H); sx.fillStyle = '#000';
      const sgnx = Math.sign(sh.x) || 1, sgny = Math.sign(sh.y) || 1, cell = this.grid.cell;
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const e = this._elev(c, r); if (e <= 0) continue; if (this._key(c, r) === 'leaves') continue;
        // Only an edge facing away from the light casts (a lower neighbour that way).
        if (this._elev(c + sgnx, r) >= e && this._elev(c, r + sgny) >= e && this._elev(c + sgnx, r + sgny) >= e) continue;
        const base = S(c * cell, r * cell); const ox = sh.x * e * cs, oy = sh.y * e * cs;
        sx.beginPath(); sx.moveTo(base.x, base.y); sx.lineTo(base.x + cs, base.y);
        sx.lineTo(base.x + cs + ox, base.y + cs + oy); sx.lineTo(base.x + ox, base.y + cs + oy);
        sx.closePath(); sx.fill();
      }
      ctx.globalAlpha = sh.alpha; ctx.drawImage(sc, 0, 0); ctx.globalAlpha = 1;
    }

    // Night darkening with light-source cut-outs (glowstone / lava) + a faint sun/moon
    // disc. The darkening is composited offscreen so lamps can "punch through" it.
    _drawNight(ctx, S, cs) {
      const sk = OH_DAYNIGHT.sky(this._tod, this._nightMax), cell = this.grid.cell, maxR = 14 * cs;
      // Collect VISIBLE emitters, each with its own reach (universal range × this
      // object's brightness). Then STRIDE-sample so a big lava lake lights UNIFORMLY
      // (not just its top rows — the old row-major cap made the top glow, bottom dark)
      // within a bounded budget.
      const vis = [];
      for (const lc of this._lightCells) {
        const r = Math.max(cs * 1.1, Math.min(maxR, this._lightRange * lc.bri * cs));
        const sp = S((lc.c + 0.5) * cell, (lc.r + 0.5) * cell);
        if (sp.x < -r || sp.x > CANVAS_W + r || sp.y < -r || sp.y > CANVAS_H + r) continue;
        vis.push({ sp, color: lc.color, bri: lc.bri, r });
      }
      const CAP = 120, stride = Math.max(1, Math.ceil(vis.length / CAP));
      const lit = stride === 1 ? vis : vis.filter((_, i) => i % stride === 0);
      if (sk.a > 0.004) {
        const nc = this._nightCanvas || (this._nightCanvas = document.createElement('canvas'));
        if (nc.width !== CANVAS_W || nc.height !== CANVAS_H) { nc.width = CANVAS_W; nc.height = CANVAS_H; }
        const nx = nc.getContext('2d'); nx.globalCompositeOperation = 'source-over'; nx.clearRect(0, 0, CANVAS_W, CANVAS_H);
        nx.fillStyle = `rgba(${sk.r},${sk.g},${sk.b},1)`; nx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        // Punch light HOLES (union of circles — no additive stacking, so no blowout).
        nx.globalCompositeOperation = 'destination-out';
        for (const l of lit) { const grd = nx.createRadialGradient(l.sp.x, l.sp.y, 0, l.sp.x, l.sp.y, l.r);
          grd.addColorStop(0, `rgba(0,0,0,${Math.min(0.96, l.bri)})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
          nx.fillStyle = grd; nx.beginPath(); nx.arc(l.sp.x, l.sp.y, l.r, 0, 7); nx.fill(); }
        nx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = sk.a; ctx.drawImage(nc, 0, 0); ctx.globalAlpha = 1;
        // Gentle warm wash over each lamp (source-over, low alpha → no white blowout).
        for (const l of lit) { const a = 0.14 * l.bri * (sk.a / (this._nightMax || 1));
          const grd = ctx.createRadialGradient(l.sp.x, l.sp.y, 0, l.sp.x, l.sp.y, l.r);
          grd.addColorStop(0, this._rgba(l.color, a)); grd.addColorStop(1, this._rgba(l.color, 0));
          ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(l.sp.x, l.sp.y, l.r, 0, 7); ctx.fill(); }
      }
      // Faint sun/moon (toggle), circle or square, tracking across the top of the sky.
      if (this._showSunMoon) {
        const b = OH_DAYNIGHT.body(this._tod), dx = b.fx * CANVAS_W, dy = b.fy * CANVAS_H, R = 26;
        const col = b.isDay ? '255,236,150' : '210,220,240';
        if (this._sunMoonShape === 'square') {
          ctx.fillStyle = `rgba(${col},0.12)`; ctx.fillRect(dx - R, dy - R, R * 2, R * 2);
          ctx.fillStyle = `rgba(${col},0.24)`; ctx.fillRect(dx - R * 0.55, dy - R * 0.55, R * 1.1, R * 1.1);
        } else {
          const grd = ctx.createRadialGradient(dx, dy, 0, dx, dy, R);
          grd.addColorStop(0, `rgba(${col},0.30)`); grd.addColorStop(0.6, `rgba(${col},0.14)`); grd.addColorStop(1, `rgba(${col},0)`);
          ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(dx, dy, R, 0, 7); ctx.fill();
          ctx.fillStyle = `rgba(${col},0.22)`; ctx.beginPath(); ctx.arc(dx, dy, R * 0.5, 0, 7); ctx.fill();
        }
      }
    }

    _drawBridges(ctx, S, cs) {
      const g = this.grid, Q = OVERHEAD.elevOffset(cs);
      for (const b of this._bridges) {
        const lv = b.elev | 0, sp = S(b.col * g.cell, b.row * g.cell), x = sp.x - lv * Q, y = sp.y - lv * Q;
        const edges = { n: !this._bridgeAt.has(b.col + ',' + (b.row - 1)), s: !this._bridgeAt.has(b.col + ',' + (b.row + 1)), w: !this._bridgeAt.has((b.col - 1) + ',' + b.row), e: !this._bridgeAt.has((b.col + 1) + ',' + b.row) };
        const closed = this._bridgeClosedAt(b.col, b.row);
        if (b.draw && this._drawbridgeStyle === 'animated') {
          // Ease a per-cell phase toward the target (0 down/closed, 1 up/open) and draw
          // the deck TILTING up toward the viewer (raised part reads bigger — perspective).
          const k = b.col + ',' + b.row, target = closed ? 0 : 1;
          let p = this._dbPhase[k]; if (p == null) p = target; p += (target - p) * 0.16; if (Math.abs(target - p) < 0.01) p = target; this._dbPhase[k] = p;
          if (p < 0.03) { OVERHEAD.drawBridgeCell(ctx, x, y, cs, { rail: this._bridgeGuardrails, closed: true, edges }); }
          else {
            const topW = cs * (1 + p * 0.45), h = cs * (1 - p * 0.82), topX = x + cs / 2 - topW / 2, topY = y - p * cs * 0.18, botY = topY + h;
            ctx.save(); ctx.fillStyle = '#7a5327'; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(topX, topY); ctx.lineTo(topX + topW, topY); ctx.lineTo(x + cs, botY); ctx.lineTo(x, botY); ctx.closePath(); ctx.fill(); ctx.stroke();
            for (let i = 1; i < 4; i++) { const t = i / 4; ctx.beginPath(); ctx.moveTo(topX + topW * t, topY); ctx.lineTo(x + cs * t, botY); ctx.stroke(); }   // plank lines converging (perspective)
            ctx.restore();
          }
        } else { OVERHEAD.drawBridgeCell(ctx, x, y, cs, { rail: this._bridgeGuardrails, closed, edges }); }
      }
    }
    _drawRedstone(ctx, S, cs) {
      const g = this.grid, u = this.unit * (this.grid.masterZoom || 1);   // CHARACTER-relative size (density-independent)
      for (const d of this._redstone) {
        const sp = S((d.col + 0.5) * g.cell, (d.row + 0.5) * g.cell), tl = S(d.col * g.cell, d.row * g.cell);
        const on = OH_REDSTONE.cellPowered(this._rs, d.col, d.row);
        if (d.kind === 'lever' || d.kind === 'button') OVERHEAD.drawLever(ctx, sp.x, sp.y, u * 0.9, !!d.on);   // ~2 character-blocks
        else if (d.kind === 'dust') OVERHEAD.drawDust(ctx, tl.x, tl.y, cs, on);
        else if (d.kind === 'lamp') OVERHEAD.drawLamp(ctx, sp.x, sp.y, u * 0.8, on);
        else if (d.kind === 'plate' || d.kind === 'weight') OVERHEAD.drawPlate(ctx, sp.x, sp.y, u * 0.7, on, d.kind === 'weight');
        else if (d.kind === 'piston') OVERHEAD.drawPiston(ctx, tl.x, tl.y, cs, on);
        else if (d.kind === 'and' || d.kind === 'not' || d.kind === 'nor') OVERHEAD.drawGate(ctx, tl.x, tl.y, cs, d.kind, on, d.inputs, d.outputs);
        else if (d.kind === 'tx' || d.kind === 'rx') { OVERHEAD.drawLamp(ctx, sp.x, sp.y, u * 0.7, on); ctx.fillStyle = '#fff'; ctx.font = `${Math.max(8, u * 0.5) | 0}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(d.kind === 'tx' ? '↑' : '↓', sp.x, sp.y); ctx.textBaseline = 'alphabetic'; }
      }
    }
    _drawHUD(ctx) {
      ctx.textAlign = 'left';
      // Day/night clock (top-right): a sun (day) or moon (night) disc + a label.
      if (this._dayNight && typeof OH_DAYNIGHT !== 'undefined') {
        const t = this._tod, lab = OH_DAYNIGHT.label(t), night = OH_DAYNIGHT.darkness(t) > 0.5, cx = CANVAS_W - 96;
        ctx.fillStyle = 'rgba(10,14,24,.72)'; ctx.fillRect(cx - 10, 8, 90, 24);
        ctx.beginPath(); ctx.arc(cx + 2, 20, 7, 0, 7); ctx.fillStyle = night ? '#cdd6ea' : '#ffd24a'; ctx.fill();
        ctx.fillStyle = '#dbe4f3'; ctx.font = '12px sans-serif'; ctx.fillText(lab, cx + 15, 24);
      }
      // Test-mode "return to designer" button (top-left); hearts drop below it.
      const hy = this._testMode ? 56 : 26;
      if (this._testMode) {
        ctx.fillStyle = 'rgba(20,26,38,.9)'; ctx.strokeStyle = '#4f86d8'; ctx.lineWidth = 1; ctx.fillRect(8, 6, 142, 24); ctx.strokeRect(8, 6, 142, 24); ctx.fillStyle = '#dbe4f3'; ctx.font = '12px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('◀ Designer  (Esc)', 18, 22);
        ctx.fillStyle = this._god ? 'rgba(60,140,80,.95)' : 'rgba(20,26,38,.9)'; ctx.strokeStyle = this._god ? '#6fdf9a' : '#4f86d8'; ctx.fillRect(156, 6, 80, 24); ctx.strokeRect(156, 6, 80, 24); ctx.fillStyle = '#fff'; ctx.fillText(this._god ? '★ God ON' : 'God: off', 164, 22);
      }
      const hearts = Math.ceil(this.player.hp / 2);
      ctx.font = '18px sans-serif'; ctx.fillStyle = '#ff5a5a'; for (let i = 0; i < hearts; i++) ctx.fillText('♥', 12 + i * 18, hy);
      // Compact weapon hotbar (collected weapons; current highlighted; Q to switch).
      { const list = this.player.weapons && this.player.weapons.length ? this.player.weapons.slice() : []; if (!list.includes('pickaxe')) list.push('pickaxe');
        const box = 30, gap = 4, tot = list.length * (box + gap) - gap, bx0 = (CANVAS_W - tot) / 2, by = CANVAS_H - box - 30;
        for (let i = 0; i < list.length; i++) { const bx = bx0 + i * (box + gap); const cur = list[i] === (this.player.weapon || 'pickaxe');
          ctx.fillStyle = cur ? 'rgba(60,90,140,.95)' : 'rgba(20,26,38,.85)'; ctx.strokeStyle = cur ? '#7fb0ff' : '#3a4a6b'; ctx.lineWidth = cur ? 2 : 1; ctx.fillRect(bx, by, box, box); ctx.strokeRect(bx, by, box, box);
          ctx.save(); ctx.translate(bx + box * 0.3, by + box / 2); OVERHEAD.drawWeapon(ctx, box * 0.42, list[i] === 'crossbow' ? 'bow' : list[i]); ctx.restore(); }
        ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Q / Tab: switch', CANVAS_W / 2, by - 4); ctx.textAlign = 'left'; }
      ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = '12px sans-serif';
      ctx.fillText(`Overhead · ${this.mode} · ${this.baseScheme}${this.player.weapon ? ' · ' + this.player.weapon : ''}  (WASD · mouse aim · click fire · F melee · Space jump · E action · RMB recall trident · wheel zoom)`, 12, CANVAS_H - 12);
      if (this._schemeOverlay > 0) { ctx.globalAlpha = Math.min(1, this._schemeOverlay / 30); ctx.fillStyle = '#ffcf4a'; ctx.textAlign = 'center'; ctx.font = 'bold 13px sans-serif'; ctx.fillText('⟳ Twin-Stick auto-fire', CANVAS_W / 2, 24); ctx.globalAlpha = 1; }
      if (this._notif) { this._notif.t--; if (this._notif.t <= 0) this._notif = null; else { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(CANVAS_W / 2 - 130, 34, 260, 26); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '13px sans-serif'; ctx.fillText(this._notif.text, CANVAS_W / 2, 51); } }
      if (this.state === 'won' || this.state === 'dead' || this.state === 'paused') { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 30px sans-serif'; ctx.fillText(this.state === 'won' ? '★ Level Complete!' : this.state === 'dead' ? 'Game Over' : 'Paused', CANVAS_W / 2, CANVAS_H / 2 - 8); ctx.font = '15px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillText(this.state === 'paused' ? 'Esc to resume · click to exit' : 'Click / Enter to exit', CANVAS_W / 2, CANVAS_H / 2 + 24); }
    }
  }

  if (typeof window !== 'undefined') window.OverheadGame = OverheadGame;
})();
