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
      if (this.input.clearHeld) this.input.clearHeld();   // a session starts with NO carried-over held key (stale-key flush)
      this._onExit = onExit || null;
      this.state = 'playing';
      this._wonExitColor = 0; this._onWin = opts.onWin || null;

      const map = worldData.mapSnapshot || worldData;
      this.map = map;
      // §Overhead world settings — the runtime's tunables (separate from side-view). migrate()
      // upgrades old saves to the current schema (defaults structure arrays + resolves settings).
      if (typeof OH_SETTINGS !== 'undefined' && OH_SETTINGS.migrate) OH_SETTINGS.migrate(worldData);
      // Resolve against the defaults, don't trust what was stored: a world saved before a
      // setting existed has no key for it, so reading it raw silently yields undefined and
      // every call site falls back to its own literal. That is why a Frame-rate cap of 30 had
      // no effect and never appeared in the HUD. (Kevin, build 360.)
      this.settings = (typeof OH_SETTINGS !== 'undefined' && OH_SETTINGS.resolve)
        ? OH_SETTINGS.resolve(worldData || {})
        : ((worldData && worldData.settings) || {});
      const cfg = this.settings;
      this.grid = OH_GRID.make({ gridW: map.gridW, gridH: map.gridH, density: map.density,
        objectScaleMode: map.objectScaleMode, cell: map.cell || (32 / (map.density || 1)), masterZoom: cfg.masterZoom || 1 });
      // UNIT = base-cell world px (cell × density). Gameplay sizing/speed is in
      // UNITS so it's DENSITY-INDEPENDENT — a denser grid has smaller cells but the
      // player/mobs/weapons keep the same real size + speed (the density bug fix).
      this.unit = this.grid.cell * (map.density || 1); this._density = map.density || 1;
      this._testMode = !!opts.testMode;
      this._debug = !!opts.testMode;   // test-critical state HUD (top-right); ` toggles
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
      // A taller player makes each elevation LEVEL render smaller (height 2 → ½ a level),
      // so structures scale to the sprite. Set before the terrain cache bakes so it agrees.
      if (typeof OVERHEAD !== 'undefined') { OVERHEAD._elevScale = 1 / Math.max(1, this.playerH || 1); OVERHEAD._elevBase = Math.min(0.5, Math.max(0.1, (worldData.settings && worldData.settings.elevOffset) || 0.22)); }
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
      this._shadows = cfg.shadows !== false;           // master shadow toggle
      this._shadowStyle = cfg.shadowStyle || 'live';   // 'live' (follow sun/moon) | 'fixed' (baked once)
      this._shadowDir = cfg.shadowDir || 'dr';         // fixed-shadow direction (dr/d/dl/r/l)
      this._shadowDarkness = (cfg.shadowDarkness != null ? cfg.shadowDarkness : 0.32);   // fixed-shadow alpha
      this._moonShadowScale = (cfg.moonShadowScale != null ? cfg.moonShadowScale : 0.45);   // moonlit shadows are weaker than sunlit ones
      // Universal light REACH per unit brightness (blocks) + per-object brightness.
      this._lightRange = (cfg.lightRange != null ? cfg.lightRange : 5);
      const briOf = { lava: (cfg.lavaBrightness != null ? cfg.lavaBrightness : 0.7),
                      glowstone: (cfg.glowstoneBrightness != null ? cfg.glowstoneBrightness : 0.95) };
      // A POWERED redstone lamp is a light source too (warm yellow), like glowstone/lava.
      this._lampBrightness = (cfg.lampBrightness != null ? cfg.lampBrightness : 0.85);
      this._lampLightColor = cfg.lampLightColor || '#ffd24a';
      this._elapsed = 0; this._tod = this._dayNight ? this._dayStart : 0.5; this._detectMult = 1;
      // Death FX particles (family-friendly: coloured sprite blocks, no gore).
      this._deathFx = null;
      // Cliff-fall guard + pit / lava behaviour (creator safety controls).
      this._blockCliffFall = cfg.blockCliffFall !== false;   // default ON: no accidental walk-offs
      this._maxStepDown = (cfg.maxStepDown != null ? cfg.maxStepDown : 1);   // 0 = can't walk down at all
      // Pits: 'deadly' (fall in → insta-death) | 'block' (impassable, even in GOD mode).
      this._pitMode = cfg.pitMode || (cfg.pitsDeadly === false ? 'block' : 'deadly');
      this._pitsDeadly = this._pitMode !== 'block';
      // Lava: 'damage' (hurts continuously while touching, gated by i-frames) or 'death'
      // (insta-kill). Legacy worlds used a lavaDeadly boolean — migrate it here.
      this._lavaMode = cfg.lavaMode || (cfg.lavaDeadly ? 'death' : 'damage');
      this._lavaDamage = (cfg.lavaDamage != null ? cfg.lavaDamage : 4);
      this._glassShatter = cfg.glassShatter !== false;      // glass breaks on melee/ranged (into shards)
      this._shards = [];                                    // live glass-shard particles
      this._redstoneVis = cfg.redstoneVisibility || 'always';   // 'always' | 'active' | 'hidden' (play-time wiring visibility)
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
      // Bridges are SPAN entities ({from,to,elev,draw,rail,rxIds,channel}) — a walk-
      // over-gap deck connecting two cliffs. A DRAWBRIDGE (draw) raises as ONE unit and
      // is a gap until its redstone source powers it. Expand each span → a cell map
      // for collision; keep the span list for the single-unit render.
      this._bridges = worldData.bridges || [];
      this._bridgeAt = new Map();
      for (const b of this._bridges) { b._cells = OVERHEAD.bridgeSpanCells(b); if (b.elev == null) b.elev = 0; for (const cell of b._cells) this._bridgeAt.set(cell.col + ',' + cell.row, b); }
      // Swinging GATES — a hinged panel that rotates from its placed (rest) angle to a
      // configured powered angle on a redstone signal, stopping if it hits an obstruction.
      this._gates = worldData.gates || [];
      for (const gt of this._gates) { gt._phase = 0; gt._curDeg = gt.rest || 0; gt._cells = this._gateCells(gt, gt._curDeg); }
      // TEMPLATE overlay — placed models (trees/houses) rendered ADDITIVELY on top of the
      // terrain (the grid is never overwritten, so the ground below a canopy is preserved).
      this._buildTemplateOverlay(worldData);
      // Redstone network (levers/dust/lamps/tx/rx). Evaluated each frame → channels.
      this._redstone = worldData.redstone || [];
      this._rs = (typeof OH_REDSTONE !== 'undefined') ? OH_REDSTONE.evaluate(this._redstone) : { powered: new Set(), channels: {} };
      // Portals/pipes: map every footprint cell → the building, + each portal's
      // world-centre, so stepping onto one teleports (config.dest) or ends the
      // level (config.isGoal).
      this._portalCells = new Map(); this._portalCenter = new Map(); this._portalIndex = new Map(); this._portalByKey = new Map(); this._portalCd = false; this._portalGlow = null; this._portalPrompt = null;
      let pIdx = 0;
      for (const b of this.buildings) if (b.typeId === 'portal' || b.typeId === 'pipe') {
        const fpB = OH_BUILDINGS.footprintOf(b.typeId, this._density), fw = fpB.w, fh = fpB.h;
        const key = b.col + ',' + b.row;
        this._portalCenter.set(key, { x: (b.col + fw / 2) * this.grid.cell, y: (b.row + fh / 2) * this.grid.cell });
        this._portalIndex.set(key, ++pIdx); this._portalByKey.set(key, b);
        for (let dr = 0; dr < fh; dr++) for (let dc = 0; dc < fw; dc++) this._portalCells.set((b.col + dc) + ',' + (b.row + dr), b);
      }

      this.baseScheme = OH_CONTROLS.pickScheme(cfg.controlScheme, opts.playerScheme);
      this.angleLockDeg = cfg.angleLockDeg || 0;
      this._schemeOverlay = 0;

      // §Overhead multiplayer (Phase 0a) — build 1-4 local players. `opts.numPlayers` defaults to
      // 1, so single-player is byte-for-byte unchanged. Each player spawns at world.spawns[i];
      // when there are fewer spawn points than players the extras fan out one cell apart from the
      // last one (the creator's multi-spawn tool, Phase 0g, gives real per-player spawns). The
      // legacy `this.player` is a getter over players[0] (below), so the ~45 single-player
      // call-sites keep working while the loop/camera/HUD migrate to iterate activePlayers().
      const _spawns = (worldData.spawns && worldData.spawns.length) ? worldData.spawns
        : [{ col: (map.gridW / 2) | 0, row: (map.gridH / 2) | 0 }];
      const _nPlayers = Math.max(1, Math.min(4, opts.numPlayers || 1));
      this._mpCfg = cfg; this._mpOpts = opts; this._mpWorld = worldData;   // kept for respawn/late-join
      this.players = [];
      for (let i = 0; i < _nPlayers; i++) {
        const base = _spawns[i] || _spawns[_spawns.length - 1] || { col: 1, row: 1 };
        const sp = _spawns[i] ? base : { col: base.col + i, row: base.row, fromPortal: base.fromPortal };
        const p = this._makePlayer(sp, i, cfg, opts, worldData);
        if (p._cameFromPortal) p._portalCd = true;   // §0c per-player portal-spawn cooldown
        this.players.push(p);
      }
      this._spawn = { x: this.players[0]._spawn.x, y: this.players[0]._spawn.y };
      this._bolts = []; this._mobBolts = [];
      this._baseZoom = this.grid.masterZoom;   // §0d shared camera zooms out from here to frame the group, back toward it when they regroup
      this.camera = OH_GRID.centerOn(this.grid, this.players[0].x, this.players[0].y, CANVAS_W, CANVAS_H);
      this._notif = null; this._running = true;
      if (document.body) { document.body.classList.remove('pre-game'); document.body.classList.add('in-game'); window.dispatchEvent(new Event('resize')); }
      // Adaptive quality + a designer-facing estimate of what this world costs to draw.
      if (typeof OH_PERF !== 'undefined') {
        this._gov = OH_PERF.makeGovernor({ enabled: this.settings.adaptiveQuality !== false, cap: this.settings.fpsCap || 60,
          flags: { shadows: this.settings.qualityShadows, night: this.settings.qualityNight, glare: this.settings.qualityGlare } });   // P3.9 per-pass policy
        this._perfEstimate = OH_PERF.estimate(this.map ? { mapSnapshot: this.map, settings: this.settings, mobs: this.mobs, redstone: this._redstone } : {},
          { viewW: CANVAS_W, viewH: CANVAS_H, zoom: this.grid.masterZoom });
        if (this._perfEstimate.band === 'heavy') console.info('[overhead] ' + this._perfEstimate.verdict, this._perfEstimate.warnings.join(' '));
        // Soak log: a rolling timeline, dumpable from the console at any point with
        // OH_SOAK.dump() (or OH_SOAK.csv()). Costs one clock compare per frame.
        this._soak = OH_PERF.makeSoakLog();
        if (typeof window !== 'undefined') { window.OH_SOAK = this._soak; console.info('[overhead] soak log armed — OH_SOAK.dump() for a summary, OH_SOAK.csv() for raw'); }
      }
      this._loop = this._loop.bind(this); requestAnimationFrame(this._loop);
    }

    // §Overhead multiplayer (Phase 0a) — factory for one local player from a spawn cell.
    // index 0 = P1 (may carry a campaign-carried weapon); 1-3 = P2-P4 (world start weapon).
    _makePlayer(sp, index, cfg, opts, worldData) {
      const cell = this.grid.cell;
      const p = { x: (sp.col + 0.5) * cell, y: (sp.row + 0.5) * cell, r: Math.max(9, this.unit * 0.4),
        hp: 20, maxHp: 20, speed: this.unit * (cfg.moveSpeed || 0.11), elev: this._elev(sp.col, sp.row),
        aim: { x: 1, y: 0 }, lastAim: { x: 1, y: 0 }, dist: 0, jump: null, iFrames: 0, hidden: false,
        // §Campaign pulls the weapon P1 finished the prior level with (opts.playerWeapon); otherwise
        // the world's start weapon, else unarmed (drawn as a pickaxe). A real ranged weapon changes
        // fire behaviour; pickaxe/none = cone melee.
        weapon: ((index === 0 ? opts.playerWeapon : null) || worldData.startWeapon || null),
        weapons: [], keys: [], _fireCd: 0, _trident: null, _boom: null,
        _ownerId: 'p' + (index + 1), _index: index };
      if (p.weapon) p.weapons.push(p.weapon);
      // A Player Spawn linked to a portal → emerge from that portal.
      if (sp.fromPortal && this._portalCenter.has(sp.fromPortal)) {
        const d = this._portalCenter.get(sp.fromPortal); p.x = d.x; p.y = d.y;
        const c = this._cellOf(d.x, d.y); p.elev = this._elev(c.col, c.row); p._cameFromPortal = true;
      }
      p._spawn = { x: p.x, y: p.y };
      p._lives = ((this.settings && this.settings.coopLivesCount) | 0) || 3;   // §modes co-op per-player lives
      p._team = (this.settings && this.settings.versusTeams) ? (index % 2) : index;   // §modes versus team (or its own)
      p._score = 0;   // §modes versus kills
      p._out = false;   // §modes — explicit so `=== false` checks read right for living players
      return p;
    }
    // §modes — is a PvP versus mode active? (co-op / single-player = false)
    _versusOn() { return !!(this.settings && this.settings.versusMode && this.settings.versusMode !== 'off' && this.players && this.players.length > 1); }
    // Legacy single-player call-sites read `this.player`; keep it pointing at P1 (players[0])
    // through the players[] migration. activePlayers() skips downed/absent slots.
    get player() { return this.players ? this.players[0] : null; }
    set player(v) { if (!this.players) this.players = []; this.players[0] = v; }
    activePlayers() { return (this.players || []).filter((p) => p && !p._dead); }
    _isPlayer(ent) { return !!(this.players && this.players.indexOf(ent) >= 0); }   // §0e — any of the 1-4 players (for fall/cliff rules, vs mobs)
    // §0f — the nearest ALIVE player to a world point (mobs chase/attack whoever is closest).
    _nearestPlayer(x, y) {
      const live = this.activePlayers(); let best = live[0] || this.player, bd = Infinity;
      for (const pl of live) { const dx = pl.x - x, dy = pl.y - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = pl; } }
      return best;
    }
    // §modes versus — the players `attacker` may damage: everyone alive except itself and (when
    // versusTeams) its own team. Empty in co-op/single-player (no friendly fire — PvP is gated).
    _enemyPlayers(attacker) {
      if (!this._versusOn()) return [];
      const teams = !!(this.settings && this.settings.versusTeams);
      return this.activePlayers().filter((o) => o !== attacker && !(teams && o._team === attacker._team));
    }
    // §0e — advance each downed player's death burst + respawn timer; respawn at its OWN spawn.
    // Multiplayer only (single-player uses the global dying->dead flow). Runs every frame.
    _advancePlayerDeaths() {
      const grav = this.unit * 0.012;
      for (const p of (this.players || [])) {
        if (!p || !p._dead) continue;
        const fx = p._deathFx;
        if (fx && fx.parts) { fx.t++; for (const q of fx.parts) { if (q.life <= 0) continue; q.x += q.vx; q.y += q.vy; q.vx *= 0.9; q.vy *= 0.9; q.rot += q.vr; q.vh -= grav; q.h += q.vh; if (q.h < 0) { q.h = 0; q.vh = 0; } q.life--; } }
        if (p._out) continue;   // §modes — out of lives: stays down, no respawn
        if (p._respawnT > 0 && --p._respawnT <= 0) {
          p._dead = false; p._deathFx = null; p.hp = p.maxHp; p.x = p._spawn.x; p.y = p._spawn.y; p.jump = null; p.iFrames = 90;
          const c = this._cellOf(p.x, p.y); p.elev = this._elev(c.col, c.row);
          this._notify('P' + ((p._index | 0) + 1) + ' respawned', 60);
        }
      }
      // §modes versus — check for a winner (deathmatch score target / last-standing elimination).
      this._checkVersusWin();
      // §modes — co-op game over: with 2+ CO-OP players, once EVERY player is out, end the match.
      if (!this._versusOn() && this.players.length > 1 && this.state === 'playing' && this.players.every((pl) => pl && pl._out)) {
        this.state = 'dead'; this._deathMsg = 'All players are out'; this._notify('Game over — all players out', 240);
      }
    }
    // §modes versus — declare a winner: deathmatch (first to the kill target, or team sum) /
    // last-standing (last player/team with a member still in). Runs each frame during versus.
    _checkVersusWin() {
      if (!this._versusOn() || this.state !== 'playing') return;
      const teams = !!(this.settings && this.settings.versusTeams);
      const win = (label) => { this.state = 'won'; this._wonExitColor = 0; this._winnerMsg = label; this._notify(label, 300); };
      if (this.settings.versusMode === 'deathmatch') {
        const target = ((this.settings && this.settings.versusKillTarget) | 0) || 10;
        if (teams) { const sum = {}; for (const p of this.players) if (p) sum[p._team] = (sum[p._team] | 0) + (p._score | 0);
          for (const t in sum) if (sum[t] >= target) return win('Team ' + (+t + 1) + ' wins!'); }
        else { for (const p of this.players) if (p && (p._score | 0) >= target) return win('P' + ((p._index | 0) + 1) + ' wins!'); }
      } else if (this.settings.versusMode === 'lastStanding') {
        const inPlay = this.players.filter((p) => p && !p._out);
        if (teams) { const t = new Set(inPlay.map((p) => p._team)); if (t.size === 1) return win('Team ' + ([...t][0] + 1) + ' wins!'); }
        else if (inPlay.length === 1) return win('P' + ((inPlay[0]._index | 0) + 1) + ' wins!');
      }
    }

    // §Overhead multiplayer (Phase 0b) — mirror the side-scroll slot assignment so pGp(i)/pJustDown(i,..)
    // resolve each player's controller. No-op headless / when ControllerConfig isn't present.
    _syncControllerSlots() {
      if (typeof ControllerConfig === 'undefined' || !ControllerConfig.getAssignment) return;
      const inp = this.input;
      inp.p1GpSlot = ControllerConfig.getAssignment(1); inp.p2GpSlot = ControllerConfig.getAssignment(2);
      inp.p3GpSlot = ControllerConfig.getAssignment(3); inp.p4GpSlot = ControllerConfig.getAssignment(4);
    }

    // §Overhead multiplayer (Phase 0b) — build one control snapshot for player `idx`. P1 (idx 0) keeps
    // the exact keyboard+mouse+first-pad path (single-player unchanged); P2-P4 read their assigned pad
    // (left stick = move, right stick = aim; A = jump, X = melee, RT = fire, RB = action). Every
    // per-player accessor is called defensively so a partial InputManager (headless) yields idle input
    // instead of throwing — the "adapter must be complete or it freezes" lesson from the side-scroll port.
    _rawFor(p, idx) {
      const inp = this.input;
      if (idx === 0) {
        const K = (c) => inp.isDown(c);
        const gp = inp.gamepads && inp.gamepads[0];
        const mv = { x: 0, y: 0 };
        if (K('KeyA') || K('ArrowLeft')) mv.x -= 1; if (K('KeyD') || K('ArrowRight')) mv.x += 1;
        if (K('KeyW') || K('ArrowUp')) mv.y -= 1; if (K('KeyS') || K('ArrowDown')) mv.y += 1;
        if (gp && gp.connected) { if (Math.abs(gp.axes0) > 0.2) mv.x += gp.axes0; if (Math.abs(gp.axes1) > 0.2) mv.y += gp.axes1; }
        const pscr = OH_GRID.worldToScreen(this.grid, this.camera, p.x, p.y);
        let aimVec = { x: inp.mouse.x - pscr.x, y: inp.mouse.y - pscr.y }, aimStickMag = 0;
        if (gp && gp.connected && (Math.abs(gp.axes2) > 0.2 || Math.abs(gp.axes3) > 0.2)) { aimVec = { x: gp.axes2, y: gp.axes3 }; aimStickMag = Math.hypot(gp.axes2, gp.axes3); }
        return { moveVec: mv, aimVec, aimStickMag, fireBtn: inp.mouse.clicked, fireHeld: inp.mouse.down || (gp && gp.rt > 0.5),
          meleeBtn: inp.mouse.clicked || K('KeyF'), jumpBtn: inp.isJustDown && inp.isJustDown('Space'),
          actionBtn: inp.isJustDown && inp.isJustDown('KeyE'), recallBtn: inp.mouse.rightClicked,
          meleeWeaponBtn: !!(inp.isDown && inp.isDown('KeyF')), lastAim: p.lastAim };   // §combat P1: F swings the held weapon (click still fires)
      }
      const g = (inp.pGp ? inp.pGp(idx) : null) || {};
      const jd = (btn) => (inp.pJustDown ? inp.pJustDown(idx, btn) : false);
      const mv = { x: g.moveX || 0, y: g.moveY || 0 };
      const aMag = Math.hypot(g.aimX || 0, g.aimY || 0);
      const aimVec = aMag > 0.2 ? { x: g.aimX, y: g.aimY } : { x: 0, y: 0 };
      return { moveVec: mv, aimVec, aimStickMag: aMag, fireBtn: jd('rangedBtn'), fireHeld: (inp.pAttack ? inp.pAttack(idx) : false),
        meleeBtn: jd('attack'), jumpBtn: jd('jump'), actionBtn: jd('context'), recallBtn: jd('throwBtn'),
        meleeWeaponBtn: jd('attack'), lastAim: p.lastAim };   // §combat P2-P4: X swings the held weapon; RT fires ranged
    }

    // §Overhead multiplayer (Phase 0b) — advance one player's locomotion for the frame; returns its
    // resolved intent (P1's is reused for combat + the E-action until those go per-player).
    _controlPlayer(p, idx) {
      // §0c — per-player pipe/portal timers advance regardless of control.
      if (p._portalGlow && --p._portalGlow.t <= 0) p._portalGlow = null;
      if (p._reachT > 0) p._reachT--;                                   // lever/lock reach pose
      if (p._emerge) { p._emerge.t++; if (p._emerge.t >= p._emerge.dur) p._emerge = null; }   // pipe emerge (QA F14)
      // §0c — a player in pipe/portal transit is driven by its own animation; skip its control this
      // frame but DO NOT freeze the others (the old global this._climb early-return did exactly that).
      if (p._climb) { this._updatePipeClimb(p); p._moving = false; p._intent = null; return null; }
      if (p.iFrames > 0) p.iFrames--; if (p._fireCd > 0) p._fireCd--;
      if (p._swingT > 0) p._swingT--;   // advance the melee-swing animation
      const raw = this._rawFor(p, idx);
      const eff = OH_CONTROLS.effectiveScheme(this.baseScheme, p.weapon ? { forceTwinStick: false, autoFire: false } : {});
      if (idx === 0) { if (eff.overridden) this._schemeOverlay = Math.min(60, this._schemeOverlay + 2); else this._schemeOverlay = Math.max(0, this._schemeOverlay - 2); }
      const intent = OH_CONTROLS.resolve(eff.scheme, raw, { angleLockDeg: this.angleLockDeg });
      if (OH_CONTROLS.norm(intent.aim).x || OH_CONTROLS.norm(intent.aim).y) { p.aim = intent.aim; p.lastAim = intent.aim; }
      const mv = raw.moveVec, moving = mv.x !== 0 || mv.y !== 0;
      p._moving = moving;   // §0c — per-player, drives the walk-cycle limbs in _drawPlayer (was P1 keyboard-only)
      const sprinting = idx === 0 && this._sprint && this.input.isDown && (this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight'));
      if (idx === 0) this._sprinting = !!sprinting;
      const spd = p.speed * (sprinting ? this._sprintMult : 1);
      const airborneBefore = p.jump && p.jump.jumping;
      if (raw.jumpBtn) {
        if (!airborneBefore) { p.jump = OH_MOVE.startJump({ moveX: mv.x * spd, moveY: mv.y * spd, startElev: p.elev, maxElevationJump: this._jumpClear }); p._jumpFrom = { x: p.x, y: p.y }; }
        else if (this.settings.doubleJump !== false && OH_MOVE.canDoubleJump(p.jump)) { OH_MOVE.doubleJump(p.jump); p.jump.maxElevationJump = (p.jump.maxElevationJump | 0) + this._doubleJumpClear; }
      }
      const airborne = p.jump && p.jump.jumping;
      this._moveWithCollision(p, intent.move.x * spd, intent.move.y * spd, airborne);
      if (moving) { p.dist += Math.hypot(intent.move.x, intent.move.y) * p.speed; p.moveAngle = Math.atan2(intent.move.y, intent.move.x); }
      if (p.jump && p.jump.jumping && OH_MOVE.advanceJump(p.jump).landed) this._resolveLanding(p);   // §0e all players resolve landings (bad landing -> per-player death/respawn)
      // §0e Hazards / pits / gaps kill EVERY player now (each downs + respawns independently).
      if (!airborne) { const c = this._cellOf(p.x, p.y);
        if (this._bridgeClosedAt(c.col, c.row)) { /* solid bridge deck — no fall/hazard */ }
        else if (this._pitsDeadly && this._pit(c.col, c.row)) this._die(p, 'Fell into a pit', 'pit');
        else if (this._gap(c.col, c.row)) this._fall(p, 'Fell');
        else if (this._hazard(c.col, c.row)) { if (this._lavaMode === 'death') this._die(p, 'Fell in lava'); else if (p.iFrames === 0) this._hurt(p, this._lavaDamage, 'Lava'); } }
      { const c = this._cellOf(p.x, p.y); p.hidden = (this._key(c.col, c.row) === 'leaves' && this._elev(c.col, c.row) > p.elev); }
      this._pickups(p);
      p._intent = intent;   // §0c — stored so the per-player interaction pass (pipes/levers/goal) can use each player's E
      p._raw = raw;         // §combat — stored so per-player _updateWeapons sees each player's fire/melee/recall
      return intent;
    }

    _key(c, r) { if (c < 0 || r < 0 || c >= this.grid.gridW || r >= this.grid.gridH) return null; const row = this.ground[r]; return row ? (row[c] || 'grass') : null; }
    _elev(c, r) { const row = this.elevation[r]; let e = row ? (row[c] | 0) : 0; if (this._pistonBoostMap) { const b = this._pistonBoostMap[c + ',' + r]; if (b) e += b; } return e; }   // + live vertical-piston lift
    // Directional pistons: ease each piston's extension on its redstone signal. UP = raise the
    // block + any rider on the cell (elevator / rising gate). N/S/E/W = push a solid head out
    // that many cells (a barrier / closing gate). Sticky pulls back on retract; UP always comes
    // back down (gravity). Recomputes a boost map (vertical lift) + a head set (solid barrier).
    _updatePistons() {
      const list = this._pistonList || (this._pistonList = this._redstone.filter((d) => d.kind === 'piston' && d.dir));
      if (!list.length) { this._pistonBoostMap = null; this._pistonHeadSet = null; return; }
      const boost = {}, heads = new Map();
      for (const d of list) {
        const powered = OH_REDSTONE.cellPowered(this._rs, d.col, d.row), target = powered ? 1 : 0;
        d._phase = (d._phase == null) ? target : d._phase + (target - d._phase) * 0.22;
        if (d._phase < 0.002) d._phase = 0; else if (d._phase > 0.998) d._phase = 1;
        const reach = Math.max(1, d.reach || 2), ext = d._phase * reach, dir = d.dir;
        if (dir === 'up') { if (ext > 0.001) boost[d.col + ',' + d.row] = ext; }
        else { const dc = dir === 'e' ? 1 : dir === 'w' ? -1 : 0, dr = dir === 's' ? 1 : dir === 'n' ? -1 : 0, n = Math.round(ext), cell = this.grid.cell;
          for (let i = 1; i <= n; i++) { const hc = d.col + dc * i, hr = d.row + dr * i; if (hc >= 0 && hr >= 0 && hc < this.grid.gridW && hr < this.grid.gridH) heads.set(hc + ',' + hr, d); }
          // The moving head SHOVES entities ahead of it (so nothing is trapped in the solid head);
          // a STICKY piston DRAGS the entity at the tip back with it when it retracts.
          const prev = d._extCells || 0, ents = [this.player].concat(this.mobs || []);
          if (n > prev) { for (const e of ents) { if (!e || e.dead) continue; const c = this._cellOf(e.x, e.y); for (let i = prev + 1; i <= n; i++) if (c.col === d.col + dc * i && c.row === d.row + dr * i) { e.x += dc * (n - i + 1) * cell; e.y += dr * (n - i + 1) * cell; break; } } }
          else if (n < prev && d.sticky) { for (const e of ents) { if (!e || e.dead) continue; const c = this._cellOf(e.x, e.y); if (c.col === d.col + dc * (prev + 1) && c.row === d.row + dr * (prev + 1)) { e.x -= dc * (prev - n) * cell; e.y -= dr * (prev - n) * cell; } } }
          d._extCells = n; }
      }
      this._pistonBoostMap = Object.keys(boost).length ? boost : null;
      this._pistonHeadSet = heads.size ? heads : null;
      // Carry riders on a vertical piston: match their elevation to the rising/falling floor.
      const carry = (ent) => { if (!ent) return; const c = this._cellOf(ent.x, ent.y), b = boost[c.col + ',' + c.row]; if (b != null) ent.elev = (this.elevation[c.row] ? (this.elevation[c.row][c.col] | 0) : 0) + b; };
      carry(this.player); if (this.mobs) for (const m of this.mobs) carry(m);
    }
    _hazard(c, r) { const k = this._key(c, r); return !!k && P().isHazardKey(k); }
    _gap(c, r) { return this._key(c, r) == null; }
    _cellOf(x, y) { return OH_GRID.cellAt(this.grid, x, y); }
    // All buildings are SOLID — you can't walk through any of them (portals
    // included; you use those by standing NEXT to them + E).
    _buildingSolidAt(col, row) {
      for (const b of this.buildings) { const fp = OH_BUILDINGS.footprintOf(b.typeId, this._density);
        if (col >= b.col && col < b.col + fp.w && row >= b.row && row < b.row + fp.h) return true; }
      return false;
    }

    // Frame pacing. A steady 30 reads far better than swinging 8-to-60, so the governor
    // settles on a quality tier and a cap it can actually hold, and we skip frames to keep
    // that cap even. (Kevin, build 359.)
    _loop(ts) {
      if (!this._running) return;
      const now = (ts != null) ? ts : ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());
      const gov = this._gov;
      // Track the live setting, so changing the cap or turning adaptive quality off takes
      // effect immediately instead of only on the next launch.
      if (gov) {
        const wantCap = +(this.settings.fpsCap || 60) || 60;
        if (gov.userCap !== wantCap) { gov.userCap = wantCap; gov.cap = wantCap; gov.reason = wantCap < 60 ? 'capped to ' + wantCap + 'fps by the world setting' : ''; }
        gov.enabled = this.settings.adaptiveQuality !== false;
      }
      const render = !gov || gov.shouldRender(now);
      try {
        this._update();
        if (render) {
          const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : now;
          this._render();
          const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : t0;
          // Feed the governor the FRAME INTERVAL, not the JS render duration.
          //
          // QA F-A7.1: at full zoom-out the HUD read fps 27 with a 207ms worst frame while the
          // governor sat at Full and never once dropped. The reason is that our render call can
          // return quickly while the browser is still rasterising and compositing a very large
          // canvas — that cost lands OUTSIDE this timer. Measuring our own execution therefore
          // said "16ms, all is well" while the player was seeing 27fps. The interval between
          // rendered frames is what the player actually experiences, so that is what the
          // governor must react to. Intentional pacing is already accounted for, since the
          // target is derived from the cap.
          const interval = (this._govLast != null) ? (t1 - this._govLast) : null;
          this._govLast = t1;
          if (gov && interval != null) gov.sample(Math.max(interval, t1 - t0));
          // Frame stats feed both the HUD and the soak log, so sample them regardless of
          // whether the HUD is up — a soak should not require the debug overlay to be open.
          this._sampleFrame();
          if (this._soak) this._soak.tick(now, this._frameStats(), gov);
        }
      } catch (e) { console.error('OverheadGame', e); }
      this.input.flush();
      requestAnimationFrame(this._loop);
    }

    _update() {
      const inp = this.input; this._frame = (this._frame || 0) + 1;
      if (inp.isJustDown && inp.isJustDown('Backquote')) this._debug = !this._debug;   // toggle the debug HUD
      // Advance the day/night clock (~60fps). detectMultiplier feeds mob sight.
      if (this._dayNight && typeof OH_DAYNIGHT !== 'undefined') { this._elapsed += 1 / 60; this._tod = OH_DAYNIGHT.phase(this._elapsed, this._dayLen, this._dayStart); this._detectMult = OH_DAYNIGHT.detectMultiplier(this._tod); }
      // Re-evaluate the redstone network (drives drawbridge channels, lamps, doors).
      if (this._redstone.length && typeof OH_REDSTONE !== 'undefined') { this._updatePlates(); this._rs = OH_REDSTONE.evaluate(this._redstone); this._updatePistons(); }
      if (this._gates.length) this._updateGates();
      // In a Sandbox playtest, Esc returns straight to the designer (not a pause menu).
      if (inp.isJustDown && inp.isJustDown('Escape')) { if (this._testMode) { this._exit(); return; } if (this.state === 'playing') this.state = 'paused'; else if (this.state === 'paused') this.state = 'playing'; else { this._exit(); return; } }
      if (inp.scrollDelta) { if (!(this.settings && this.settings.lockZoom)) OH_GRID.zoomBy(this.grid, inp.scrollDelta < 0 ? 1.08 : 0.92); inp.scrollDelta = 0; }   // creator can LOCK the zoom in play
      // Test-mode buttons (top-left): "◀ Designer" (return) + "God" (invincible) toggle.
      if (this._testMode && inp.mouse.clicked) {
        if (inp.mouse.x <= 150 && inp.mouse.y <= 30) { this._exit(); return; }
        if (inp.mouse.x >= 156 && inp.mouse.x <= 236 && inp.mouse.y <= 30) { this._god = !this._god; }
      }
      if (this.state === 'won' || this.state === 'dead') { if (inp.mouse.clicked || (inp.isJustDown && inp.isJustDown('Enter'))) this._exit(); return; }
      if (this.state === 'dying') { this._advanceDeath(); return; }   // play the death burst
      if (this.state === 'paused') return;

      // §Overhead multiplayer (Phase 0b) — per-player LOCOMOTION. Each active player reads its own
      // input (P1 = keyboard/mouse + first pad; P2-P4 = their assigned pad) and moves/jumps/aims
      // independently in the shared world. COMBAT, the E-action (pipes/portals/levers/locks) and the
      // goal stay P1-only for now — they go per-player in the combat + Phase 0c passes. Secondary
      // players can't die yet (0e): _moveWithCollision blocks them at pits/walls like a mob.
      this._syncControllerSlots();
      if (inp.isJustDown && (inp.isJustDown('KeyQ') || inp.isJustDown('Tab'))) this._cycleWeapon();   // P1 weapon switch (keyboard)
      const mouseWorld = OH_GRID.screenToWorld(this.grid, this.camera, inp.mouse.x, inp.mouse.y);
      for (const pl of this.activePlayers()) this._controlPlayer(pl, pl._index);
      this._advancePlayerDeaths();   // §0e — downed players (MP) burst + respawn at their own spawn, independently
      // §combat — every player fires/melees with its own weapon + inputs.
      for (const pl of this.activePlayers()) this._updateWeapons(pl, mouseWorld);
      // Mobs + projectiles (once).
      this._updateMobs(); this._updateProjectiles(); this._updateShards();

      // §0c — per-player INTERACTIONS: each active player triggers its OWN pipes/portals/levers/
      // locks/goal from its own E-press (p._intent), so P2-P4 use them too, not just P1.
      for (const pl of this.activePlayers()) this._playerInteract(pl);
      this._updateCamera();
    }

    // §0c — one player's E-action for the frame: pipe/portal transit (priority), else lock, else
    // lever, else the decoration notice; plus the walk-on goal. State is per-player. A player in
    // transit has p._intent === null and is skipped.
    _playerInteract(p) {
      const intent = p._intent; if (!intent) return;
      if (p._portalGlow) { /* glow ticked in _controlPlayer */ }
      let actionUsed = false;
      const useR = this.unit * 1.6; let near = null, nk = null, nd = useR;
      for (const [ck, b] of this._portalCells) { const [cc, rr] = ck.split(',').map(Number); const dx = (cc + 0.5) * this.grid.cell - p.x, dy = (rr + 0.5) * this.grid.cell - p.y; const dd = Math.hypot(dx, dy); if (dd < nd) { nd = dd; near = b; nk = b.col + ',' + b.row; } }
      p._portalPrompt = near ? nk : null;
      if (near && !p._portalCd && intent.action) {
        const cfg = near.config || {}; const label = near.typeId === 'pipe' ? 'pipe' : 'portal';
        if (cfg.isGoal) { actionUsed = true; this._wonExitColor = (this.goal && this.goal.color) || 0; this._win(); }
        else if (cfg.dest && (this._portalByKey.get(cfg.dest) || this._portalCells.get(cfg.dest))) {
          actionUsed = true;
          const db = this._portalByKey.get(cfg.dest) || this._portalCells.get(cfg.dest), dfp = OH_BUILDINGS.footprintOf(db.typeId, this._density), dw = dfp.w, dh = dfp.h;
          const px = (db.col + dw / 2) * this.grid.cell, py = (db.row + dh + 0.5) * this.grid.cell;
          this._triggerTransit(p, near, { px, py, key: db.col + ',' + db.row });
        } else { actionUsed = true; this._notify('This ' + label + ' is not linked to a destination yet.', 100); }
      }
      if (!near || nd > useR * 0.6) p._portalCd = false;   // release the guard once clear of the destination
      if (intent.action && !actionUsed && this._useNearbyLock(p)) actionUsed = true;
      if (intent.action && !actionUsed && this._toggleNearbyLever(p)) actionUsed = true;
      if (intent.action && !actionUsed) this._doAction(p);
      // Goal — ANY player reaching it wins (co-op any-one-reaches; the modes phase refines this).
      if ((this.mode === 'platformer' || this.mode === 'campaign') && this.goal) {
        const c = this._cellOf(p.x, p.y);
        if (c.col >= this.goal.col && c.col < this.goal.col + 2 && c.row >= this.goal.row && c.row < this.goal.row + 2) { this._wonExitColor = this.goal.color || 0; this._win(); }
      }
    }

    // §0c — send a player into a pipe/portal (climb / step / instant). The per-pipe travel toggle
    // `config.groupTravel` = "pull everyone through" (Mario-3D-World): every OTHER active player
    // standing near this mouth is pulled along; otherwise only the triggering player travels.
    _triggerTransit(p, b, dest) {
      const cfg = b.config || {};
      const send = (pl) => {
        if (b.typeId === 'pipe' && this.settings.pipeClimbAnim !== false) this._startPipeClimb(pl, b, dest);
        else if (b.typeId === 'portal' && this.settings.portalStepAnim !== false) this._startPortalStep(pl, b, dest);
        else { const c = this._cellOf(dest.px, dest.py); pl.x = dest.px; pl.y = dest.py; pl.elev = this._elev(c.col, c.row); pl._portalCd = true; pl._portalGlow = { keys: [b.col + ',' + b.row, dest.key], t: 42 }; }
      };
      send(p);
      if (cfg.groupTravel === true || cfg.groupTravel === 'all') {
        const useR = this.unit * 2.0;
        for (const other of this.activePlayers()) {
          if (other === p || other._climb || other._portalCd) continue;
          let nearMouth = false;
          for (const [ck, bb] of this._portalCells) { if (bb !== b) continue; const [cc, rr] = ck.split(',').map(Number); if (Math.hypot((cc + 0.5) * this.grid.cell - other.x, (rr + 0.5) * this.grid.cell - other.y) < useR) { nearMouth = true; break; } }
          if (nearMouth) send(other);
        }
      }
    }

    // §Overhead multiplayer (Phase 0d) — shared auto-fit camera. Single-player: centre on the one
    // player at the current zoom (unchanged). 2+ players: centre on the group's bounding-box midpoint
    // and zoom OUT (toward the fit) so everyone stays framed, down to the grid's MIN_ZOOM; a player
    // who would push past the fit is naturally held at the screen edge by clampCamera. When the group
    // regroups the zoom eases back toward the world's base zoom (never zooms IN past it). Not
    // split-screen — one shared view, per Kevin's decision.
    _updateCamera() {
      // §modes versus — a FIXED whole-arena camera (adversaries roam apart; show the whole map,
      // no co-op tether/edge-hold). Fit the world into the view and centre on it.
      if (this._versusOn()) {
        const ww = OH_GRID.pixelWidth(this.grid), wh = OH_GRID.pixelHeight(this.grid);
        OH_GRID.setZoom(this.grid, Math.min(CANVAS_W / ww, CANVAS_H / wh));   // clamps to MIN/MAX
        this.camera = OH_GRID.centerOn(this.grid, ww / 2, wh / 2, CANVAS_W, CANVAS_H);
        return;
      }
      const live = this.activePlayers();
      if (live.length <= 1) { const p = this.player; if (p) this.camera = OH_GRID.centerOn(this.grid, p.x, p.y, CANVAS_W, CANVAS_H); return; }
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, sx = 0, sy = 0;
      for (const p of live) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; sx += p.x; sy += p.y; }
      const cx = sx / live.length, cy = sy / live.length;
      const pad = this.unit * 3;   // keep players off the very edge of the screen
      const spanX = (maxX - minX) + pad * 2, spanY = (maxY - minY) + pad * 2;
      const fitZ = Math.min(CANVAS_W / Math.max(1, spanX), CANVAS_H / Math.max(1, spanY));
      const base = this._baseZoom || 1;
      // §0d/0e — don't zoom out UNBOUNDED: cap at half the world's base zoom (or MIN_ZOOM if that's
      // higher). Zooming to the raw MIN made a heavy world unreadable (~6fps, players tiny) AND the
      // trailing player still fell off the edge. The edge-hold below then keeps everyone on-screen.
      const floor = Math.max((OH_GRID.MIN_ZOOM || 0.35), base * 0.5);
      const target = Math.max(floor, Math.min(base, fitZ));   // fit the group; never zoom IN past base, never OUT past the floor
      const cur = this.grid.masterZoom;
      OH_GRID.setZoom(this.grid, cur + (target - cur) * 0.12);   // smooth toward the fit (setZoom clamps to MIN/MAX)
      this.camera = OH_GRID.centerOn(this.grid, cx, cy, CANVAS_W, CANVAS_H);
      // §0e EDGE-HOLD (the "tethered" rule Kevin asked for): once zoomed out as far as allowed, a
      // player who would leave the shared view is HELD at the screen edge instead of walking off
      // (New-Super-Mario-Bros co-op). Clamp each player to the visible world rect at the current
      // zoom. When everyone already fits this is a no-op; only a straggler past the floor gets held.
      const z = this.grid.masterZoom, m = this.unit * 0.6;
      const vMinX = this.camera.x + m, vMaxX = this.camera.x + CANVAS_W / z - m;
      const vMinY = this.camera.y + m, vMaxY = this.camera.y + CANVAS_H / z - m;
      for (const p of live) {
        const nx = Math.max(vMinX, Math.min(vMaxX, p.x)), ny = Math.max(vMinY, Math.min(vMaxY, p.y));
        if (nx !== p.x || ny !== p.y) { p.x = nx; p.y = ny; }   // held at the edge
      }
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
          const rails = curBridge && (curBridge.rail != null ? curBridge.rail : this._bridgeGuardrails);
          if (curBridge && rails && !tb) {
            // Guardrails are only on the LONG SIDES: block a step off the bridge that is
            // PERPENDICULAR to its run (falling off the side), but allow stepping off the
            // ENDS onto land (entering/exiting). Along-axis steps fall through to normal logic.
            const fc = curBridge.from ? curBridge.from.col : curBridge.col, fr = curBridge.from ? curBridge.from.row : curBridge.row;
            const tc = curBridge.to ? curBridge.to.col : fc, tr = curBridge.to ? curBridge.to.row : fr;
            const horiz = Math.abs(tc - fc) >= Math.abs(tr - fr), perp = horiz ? ((c.row - cur.row) !== 0) : ((c.col - cur.col) !== 0);
            if (perp) { const tk = this._key(c.col, c.row); if (tk == null || tk === 'pit' || this._elev(c.col, c.row) < (curBridge.elev | 0)) return false; }
          }
          if (tb && this._bridgeClosedAt(c.col, c.row)) return tb.elev | 0;   // walkable deck
          // an OPEN drawbridge falls through to normal terrain logic (a gap → fall)
        }
        const key = this._key(c.col, c.row);
        if (key == null) return airborne ? null : false;     // gap
        if (this._buildingSolidAt(c.col, c.row)) return false;
        if (this._pistonSolidAt(c.col, c.row)) return false;   // an extended (powered) piston blocks
        if (this._gateSolid && this._gateSolidAt(c.col, c.row)) return false;   // a closed/swinging gate panel blocks
        if (this._templateSolid && this._templateSolid.has(c.col + ',' + c.row)) return false;   // a template trunk/wall blocks (canopy is pass-under)
        if (key === 'leaves') return ent.elev;               // canopy — always pass under (keep elev)
        if (key === 'pit') return (this._pitsDeadly && this._isPlayer(ent)) ? ent.elev : false;   // §0e ANY player steps into a deadly pit (fatal); mobs/others are always BLOCKED (cross only at bridges)
        const tE = this._elev(c.col, c.row), delta = tE - ent.elev;
        if (delta <= 0) {                                    // walk / step down
          // Cliff-fall guard (player only): don't let a WALK drop more than
          // maxStepDown levels — stops accidental falls off high platforms with no
          // way back. Ramps/bridges (nearby) are the intended way down.
          if (this._isPlayer(ent) && this._blockCliffFall && delta < -this._maxStepDown && !this._rampNear(cur.col, cur.row) && !this._rampNear(c.col, c.row)) return false;
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
      if (this._pitsDeadly && this._pit(c.col, c.row)) { this._die(p, 'Fell into a pit'); return; }
      const res = OH_MOVE.landingValid(p.jump, { landingIsGap: this._gap(c.col, c.row), landingIsHazard: this._hazard(c.col, c.row),
        landingIsSolidGround: this._key(c.col, c.row) != null, elevDelta: this._elev(c.col, c.row) - p.jump.startElev });
      if (!res.valid) {
        if (res.reason === 'hazard') { if (this._lavaMode === 'death') this._die(p, 'Fell in lava'); else this._hurt(p, this._lavaDamage, 'Lava'); }
        else if (res.reason === 'gap') this._fall(p, 'Missed the jump');
        else if (p._jumpFrom) { p.x = p._jumpFrom.x; p.y = p._jumpFrom.y; }   // couldn't clear the wall → bounce back
      } else { p.elev = this._elev(c.col, c.row); }   // landed within the jump's clearance
    }

    // ── Weapons ────────────────────────────────────────────────────────────
    // §combat — PER-PLAYER now. `p` fires/melees from its own resolved intent (p._intent, which
    // already folds fireBtn||fireHeld) + raw buttons (p._raw): meleeWeaponBtn swings the held
    // weapon (P1 = F, P2-P4 = X) separately from the fire button, recallBtn recalls a trident.
    // mouseWorld is P1-only (boomerang throw distance); P2-P4 use the world's boomerang range.
    _updateWeapons(p, mouseWorld) {
      const intent = p._intent, raw = p._raw || {};
      if (!intent) return;   // in transit / down
      const fire = intent.fire && p._fireCd === 0;
      const ang = OH_CONTROLS.angleOf(p.aim);
      if (!p.weapon) { if (intent.melee) this._melee(p, ang, 'pickaxe'); return; }
      if (raw.meleeWeaponBtn) this._melee(p, ang, p.weapon);   // dedicated weapon-swing button (not the fire click)
      const wc = this._weaponCfg();
      if (p.weapon === 'crossbow') { if (fire) { this._bolts.push(Object.assign(OH_WEAPONS.startBolt(p.x, p.y, ang, wc), { owner: 'p', elev: p.elev, _by: p })); p._fireCd = 14; } }
      else if (p.weapon === 'trident') {
        if (raw.recallBtn && p._trident) OH_WEAPONS.recallTrident(p._trident);
        else if (fire && !p._trident) { p._trident = OH_WEAPONS.startTrident(p.x, p.y, ang, wc); p._trident.elev = p.elev; p._fireCd = 10; }
      } else if (p.weapon === 'boomerang') {
        if (fire && !p._boom) { const dist = (mouseWorld && p === this.player) ? Math.hypot(mouseWorld.x - p.x, mouseWorld.y - p.y) : this._boomThrowDist(p, ang); p._boom = OH_WEAPONS.startBoomerang(p.x, p.y, ang, dist, wc); p._boom._hit = {}; p._boom.elev = p.elev; p._fireCd = 10; }
      }
    }
    // Boomerang without a mouse (P2-P4 sticks, or P1 on a gamepad): the boomerang only sweeps back
    // through the aim axis at its FAR apex, so a fixed range arcs AROUND a nearer foe (P2-P4 could
    // never land a boomerang PvP hit — 409 tester finding). Auto-range the throw to the nearest
    // target roughly in the aim direction (mobs, and enemy players in versus); else a sane default.
    _boomThrowDist(p, ang) {
      const maxR = (this.settings && this.settings.boomerangRange) || 340;
      const def = (this.settings && this.settings.boomerangRange) || this.unit * 6;
      const ax = Math.cos(ang), ay = Math.sin(ang); let best = Infinity;
      const consider = (t) => { const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy); if (d < 1) return; if ((dx * ax + dy * ay) / d > 0.6 && d < best) best = d; };   // within ~53° of aim
      for (const m of (this.mobs || [])) if (m && !m.dead) consider(m);
      if (this._versusOn()) for (const foe of this._enemyPlayers(p)) consider(foe);
      return best === Infinity ? def : Math.max(this.unit * 1.5, Math.min(maxR, best));
    }
    _weaponCfg() { const s = this.settings || {}; return { crossbowSpeed: s.crossbowSpeed, tridentSpeed: s.tridentSpeed, tridentReturnSpeed: s.tridentReturnSpeed, boomerangSpeed: s.boomerangSpeed, boomerangMaxRange: s.boomerangRange, boomerangWidth: s.boomerangWidth }; }
    _melee(p, ang, weapon) {
      if (p._fireCd > 0) return; p._fireCd = 18; p._swingT = 14; p._swingDur = 14; p._swingAng = ang; p._swingWeapon = weapon || 'pickaxe';   // trigger the swing anim
      const reachU = this.unit * (this.settings.meleeReach || 2.4), half = this._meleeHalfAngle();
      const hits = OH_COMBAT.coneHit({ x: p.x, y: p.y }, ang, this.mobs.filter((m) => !m.dead && this._canAttack(p.elev, m.elev || 0)), { reach: reachU, halfAngle: half, maxHits: 3 });
      for (const m of hits) { m.hp -= 4; if (m.hp <= 0) m.dead = true; }
      // §modes versus — melee also hits enemy players in the cone (teams-aware; kill credit to p).
      if (this._versusOn()) { const foes = this._enemyPlayers(p).filter((o) => this._canAttack(p.elev, o.elev || 0)); for (const t of OH_COMBAT.coneHit({ x: p.x, y: p.y }, ang, foes, { reach: reachU, halfAngle: half, maxHits: 4 })) this._hurt(t, 4, 'Melee', p); }
      // Shatter the first glass pane in the swing arc (within reach).
      if (this._glassShatter) {
        const reach = this.unit * (this.settings.meleeReach || 2.4), step = this.grid.cell * 0.5;
        for (let d = step; d <= reach; d += step) { const gc = this._cellOf(p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d); if (this._shatterGlass(gc.col, gc.row)) break; }
      }
    }
    // A projectile dies if it crosses terrain ≥ attackBlock levels above its origin.
    _boltWalled(b) { const c = this._cellOf(b.x, b.y); if (this._key(c.col, c.row) === 'leaves') return false; return (this._elev(c.col, c.row) - (b.elev || 0)) >= this.attackBlock; }
    _updateProjectiles() {
      const live = this.mobs.filter((m) => !m.dead);
      // Crossbow bolts (shared array; owner-tagged - any player's bolts hit mobs).
      for (const b of this._bolts) { OH_WEAPONS.stepBolt(b); const bc = this._cellOf(b.x, b.y); const brokeGlass = this._shatterGlass(bc.col, bc.row); if (!brokeGlass && this._boltWalled(b)) { b.dead = true; continue; } const hit = OH_COMBAT.lineHit({ x: b.x - b.vx, y: b.y - b.vy }, { x: b.x, y: b.y }, live, this.unit * 0.3); if (hit && this._canAttack(b.elev || 0, hit.elev || 0)) { hit.hp -= 5; if (hit.hp <= 0) hit.dead = true; b.dead = true; }
        // §modes versus — a bolt also hits enemy PLAYERS (credit the shooter b._by).
        if (!b.dead && this._versusOn() && b._by) { for (const t of this._enemyPlayers(b._by)) { if (this._canAttack(b.elev || 0, t.elev) && Math.hypot(b.x - t.x, b.y - t.y) < t.r + this.unit * 0.3) { this._hurt(t, 5, 'Shot', b._by); b.dead = true; break; } } } }
      this._bolts = this._bolts.filter((b) => !b.dead);
      // §combat — Trident + Boomerang are PER-PLAYER (each on p._trident / p._boom).
      for (const p of this.activePlayers()) {
        if (p._trident) { OH_WEAPONS.stepTrident(p._trident, p); const t = p._trident;
          if (t.state === 'out') { const tc = this._cellOf(t.x, t.y); if (!this._shatterGlass(tc.col, tc.row) && this._boltWalled(t)) OH_WEAPONS.recallTrident(t); }   // shatter glass and fly on, else a too-high wall returns it
          if (!t.caught) { for (const m of live) if (this._canAttack(p.elev, m.elev || 0) && Math.hypot(m.x - t.x, m.y - t.y) < m.r + this.unit * 0.3) { m.hp -= 6; if (m.hp <= 0) m.dead = true; if (t.state === 'out') t.state = 'return'; }
            if (this._versusOn()) for (const foe of this._enemyPlayers(p)) if (this._canAttack(p.elev, foe.elev || 0) && Math.hypot(foe.x - t.x, foe.y - t.y) < foe.r + this.unit * 0.3) { this._hurt(foe, 6, 'Trident', p); if (t.state === 'out') t.state = 'return'; } }   // §modes versus PvP
          if (t.caught) p._trident = null; }
        if (p._boom) { OH_WEAPONS.stepBoomerang(p._boom, p); const b = p._boom;
          if (b.t < 0.5 && this._boltWalled(b)) b.t = 1 - b.t;   // wall on the way out → start coming back
          for (const m of live) { const id = m.col + ',' + m.row + ',' + (this.mobs.indexOf(m)); if (!b._hit[id] && this._canAttack(p.elev, m.elev || 0) && Math.hypot(m.x - b.x, m.y - b.y) < m.r + this.unit * 0.3) { m.hp -= 4; b._hit[id] = 1; if (m.hp <= 0) m.dead = true; } }
          if (this._versusOn()) for (const foe of this._enemyPlayers(p)) { const id = 'pl' + foe._index; if (!b._hit[id] && this._canAttack(p.elev, foe.elev || 0) && Math.hypot(foe.x - b.x, foe.y - b.y) < foe.r + this.unit * 0.3) { this._hurt(foe, 4, 'Boomerang', p); b._hit[id] = 1; } }   // §modes versus PvP
          if (b.dead) p._boom = null; }
      }
      // Mob bolts (skeletons).
      for (const mb of this._mobBolts) { OH_WEAPONS.stepBolt(mb); if (this._boltWalled(mb)) { mb.dead = true; continue; }
        if (mb._dodged) continue;
        // §0f — a mob bolt can hit ANY active player it overlaps (was P1 only).
        for (const tp of this.activePlayers()) {
          if (!this._canAttack(mb.elev || 0, tp.elev) || tp.iFrames !== 0) continue;
          if (Math.hypot(mb.x - tp.x, mb.y - tp.y) >= tp.r + this.unit * 0.25) continue;
          if (this._dodging(this._dodgeAttacks)) { mb._dodged = true; this._notify('Dodged!', 30); } else { this._hurt(tp, 3, 'Shot'); mb.dead = true; }
          break;
        } }   // a dodged bolt is flagged (not killed) so it flies on past
      this._mobBolts = this._mobBolts.filter((b) => !b.dead);
    }

    _toggleNearbyLever(p) {
      if (!this._redstone.length || typeof OH_REDSTONE === 'undefined') return false;
      let near = null, nd = this.unit * 1.6;
      for (const d of this._redstone) if (d.kind === 'lever' || d.kind === 'button') { const dx = (d.col + 0.5) * this.grid.cell - p.x, dy = (d.row + 0.5) * this.grid.cell - p.y; const dd = Math.hypot(dx, dy); if (dd < nd) { nd = dd; near = d; } }
      if (!near) return false;
      near.on = !near.on; this._rs = OH_REDSTONE.evaluate(this._redstone); this._notify('Lever ' + (near.on ? 'ON' : 'OFF'), 40); if (this.settings.leverReachAnim !== false) p._reachT = 16; return true;
    }
    // A LOCK block: insert a matching key (E nearby) to power it. Consumes the key /
    // stays locked-in / can toggle off, per config.
    _useNearbyLock(p) {
      if (!this._redstone.length || typeof OH_REDSTONE === 'undefined') return false;
      let near = null, nd = this.unit * 1.6;
      for (const d of this._redstone) if (d.kind === 'lock') { const dx = (d.col + 0.5) * this.grid.cell - p.x, dy = (d.row + 0.5) * this.grid.cell - p.y; const dd = Math.hypot(dx, dy); if (dd < nd) { nd = dd; near = d; } }
      if (!near) return false;
      const reEval = () => { this._rs = OH_REDSTONE.evaluate(this._redstone); };
      if (near.on) { if (near.toggle) { near.on = false; reEval(); this._notify('Lock reset', 40); } return true; }   // already unlocked
      const accept = (near.acceptKeys && near.acceptKeys.length) ? near.acceptKeys : null;
      const have = (p.keys || []).find((k) => !accept || accept.indexOf(k) >= 0);
      if (have) { near.on = true; if (near.consume) { p.keys.splice(p.keys.indexOf(have), 1); } reEval(); this._notify('Unlocked' + (near.consume ? ' (used ' + have + ')' : ''), 70); }
      else this._notify('Locked — need ' + (accept ? accept.join('/') + ' ' : 'a ') + 'key', 90);
      return true;
    }
    _doAction(p) { let near = null, nd = 1e9; for (const b of this.buildings) { if (b.typeId === 'portal' || b.typeId === 'pipe') continue; const bx = (b.col + 0.5) * this.grid.cell, by = (b.row + 0.5) * this.grid.cell; const d = Math.hypot(bx - p.x, by - p.y); if (d < this.unit * 2 && d < nd) { near = b; nd = d; } } if (near) { const t = OH_BUILDINGS.get(near.typeId); this._notify((t ? t.category : 'Building') + ': ' + near.typeId, 90); } }

    // ── PIPE CLIMB-IN animation — the "pull-up (foreshortened leg)" from the mockup ──
    // Grab the rim → pull the body up to the hands → a leg lifts (foot on the pipe) → the
    // body rises to the foot → move to the opening → shrink into the tube → teleport.
    // §Overhead multiplayer (Phase 0c) — pipe/portal transit is PER-PLAYER: the animation state
    // lives on `p._climb` (not a shared this._climb), so 2-4 players can be in transit at once and
    // one player using a pipe no longer freezes the others (the old global _climb early-return).
    _startPipeClimb(p, pipe, dest) {
      const fpp = OH_BUILDINGS.footprintOf(pipe.typeId, this._density), fw = fpp.w, fh = fpp.h, cell = this.grid.cell;
      const cx = (pipe.col + fw / 2) * cell, cy = (pipe.row + fh / 2) * cell;
      // P1.7 audit: rim/approach offsets are relative to the PIPE, which is block-scale
      // (its footprint grows with density), so they must be in `unit` (= cell*density), not a
      // fixed cell. A fixed 0.45 cell is 45% of the pipe at density 1 but only ~11% at density
      // 4, so the "grab the rim" pose ended up buried at the pipe's centre on a dense map.
      // unit == cell at density 1, so this is byte-identical there. (Lesson 1.)
      const cl = { pipe, dest, t: 0, sx: p.x, sy: p.y, cx, cy, edgeY: cy + this.unit * 0.45,
        face: -Math.PI / 2, scale: 1, alpha: 1, grab: 0, mantleLeg: 0, crouch: 0, zoomFrom: this.grid.masterZoom };
      cl.timeline = this._pipeClimbTimeline(p, cl);
      cl.total = cl.timeline.reduce((a, ph) => a + ph.dur, 0);
      p._climb = cl;
      p.dist = 0;   // freeze this player's walk cycle
    }
    // PORTAL step-through — the same _climb driver as the pipe, with a shorter step-in + spin-warp
    // timeline (walk into the portal, shrink + spin + fade, then teleport).
    _startPortalStep(p, portal, dest) {
      const fpp = OH_BUILDINGS.footprintOf(portal.typeId, this._density), fw = fpp.w, fh = fpp.h, cell = this.grid.cell;
      const cx = (portal.col + fw / 2) * cell, cy = (portal.row + fh / 2) * cell;
      const eo = (t) => 1 - Math.pow(1 - t, 3), ei = (t) => t * t * t, L = (a, b, t) => a + (b - a) * t, P = p;
      const cl = { pipe: portal, dest, t: 0, sx: P.x, sy: P.y, cx, cy, face: -Math.PI / 2, scale: 1, alpha: 1, grab: 0, mantleLeg: 0, crouch: 0, spin: 0, zoomFrom: this.grid.masterZoom };
      cl.timeline = [
        { name: 'step', dur: 0.3, fn: (t) => { P.x = L(cl.sx, cx, eo(t)); P.y = L(cl.sy, cy, eo(t)); cl.scale = L(1, 0.55, eo(t)); cl.alpha = L(1, 0.65, t); } },
        { name: 'warp', dur: 0.26, fn: (t) => { P.x = cx; P.y = cy; cl.spin = t * Math.PI * 3; cl.scale = L(0.55, 0.08, ei(t)); cl.alpha = L(0.65, 0.05, t); } },
      ];
      cl.total = cl.timeline.reduce((a, ph) => a + ph.dur, 0);
      p._climb = cl; P.dist = 0;
    }
    _pipeClimbTimeline(p, cl) {
      const eo = (t) => 1 - Math.pow(1 - t, 3), ei = (t) => t * t * t, eio = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2, L = (a, b, t) => a + (b - a) * t;
      const P = p, cell = this.grid.cell, cx = cl.cx, cy = cl.cy, edgeY = cl.edgeY, below = edgeY + this.unit * 0.5;   // P1.7: pipe-relative → unit (see _startPipeClimb)
      return [
        { name: '1·grab', dur: 0.5, fn: (t) => { P.x = L(cl.sx, cx, eo(t)); P.y = L(cl.sy, below, eo(t)); cl.grab = eo(t); } },          // reach + grab the rim
        { name: '2·pull', dur: 0.45, fn: (t) => { P.x = cx; P.y = L(below, edgeY, eio(t)); cl.grab = 1 - eio(t); cl.scale = L(1, 1.03, eio(t)); } },   // body pulled to the hands
        { name: '3·leg', dur: 0.5, fn: (t) => { cl.mantleLeg = eio(t); cl.crouch = eio(t) * 0.5; } },                                    // a leg lifts, foot on the pipe
        { name: '4·rise', dur: 0.5, fn: (t) => { P.y = L(edgeY, cy, eio(t)); cl.mantleLeg = 1 - eio(t); cl.crouch = L(0.5, 0, t); cl.scale = L(1.03, 1.02, t); } },   // body rises to the foot
        { name: '5·open', dur: 0.3, fn: (t) => { P.x = cx; P.y = L(cy, cy - this.unit * 0.14, eio(t)); } },                              // move to the opening (P1.7: pipe-relative → unit)
        { name: '6·sink', dur: 0.55, fn: (t) => { cl.scale = L(1.02, 0.16, ei(t)); cl.alpha = L(1, 0.08, t); } }                          // shrink into the tube
      ];
    }
    _updatePipeClimb(p) {
      const cl = p._climb; if (!cl) return;
      cl.t += (1 / 60) * (this.settings.interactionSpeed || 1);
      // Solo play zooms the camera in to appreciate the climb + holds on the pipe. In multiplayer
      // that would yank the shared view onto one player, so leave the shared auto-fit camera alone.
      const solo = this.activePlayers().length <= 1;
      if (solo) { const iz = this.settings.interactionZoom || 1.25; this.grid.masterZoom += (iz - this.grid.masterZoom) * 0.15; }
      let acc = 0, cur = null, ct = 0;
      for (const ph of cl.timeline) { if (cl.t <= acc + ph.dur) { cur = ph; ct = (cl.t - acc) / ph.dur; break; } acc += ph.dur; }
      if (!cur) { cl.timeline[cl.timeline.length - 1].fn(1); this._finishPipeClimb(p); return; }
      cur.fn(Math.max(0, Math.min(1, ct)));
      if (solo) this.camera = OH_GRID.centerOn(this.grid, cl.cx, cl.cy, CANVAS_W, CANVAS_H);   // hold on the pipe (solo only)
    }
    _finishPipeClimb(p) {
      const cl = p._climb; p._climb = null;
      const d = cl.dest, c = this._cellOf(d.px, d.py);
      p.x = d.px; p.y = d.py; p.elev = this._elev(c.col, c.row);
      p._portalCd = true; p._portalGlow = { keys: [cl.pipe.col + ',' + cl.pipe.row, d.key], t: 42 };
      // EMERGE: the mirror of the shrink-into-the-tube entry. Without it the player simply
      // appeared at full size, which made a working teleport feel broken — and it is the most
      // visible moment of the whole pipe feature. The player sits on the pipe until they move
      // (the arrival cooldown already holds them). (QA F14.)
      if (this.settings.pipeClimbAnim !== false) p._emerge = { t: 0, dur: 18 };
      if (this.activePlayers().length <= 1) this.grid.masterZoom = cl.zoomFrom;   // restore the game zoom (solo)
      this.camera = OH_GRID.centerOn(this.grid, p.x, p.y, CANVAS_W, CANVAS_H);
    }
    _pickups(p) { for (const it of this.items) { if (it.taken) continue; const ix = (it.col + 0.5) * this.grid.cell, iy = (it.row + 0.5) * this.grid.cell; if (Math.hypot(ix - p.x, iy - p.y) < p.r + this.unit * 0.4) { it.taken = true; if (it.kind === 'weapon') { if (!p.weapons.includes(it.weapon)) p.weapons.push(it.weapon); p.weapon = it.weapon; this._notify('Equipped ' + it.weapon + ' (Q to switch)', 120); } else if (it.kind === 'key') { p.keys.push(it.keyId || it.itemKey); this._notify('Picked up ' + (it.keyId || 'key') + ' key', 90); } else this._notify('Coin!', 60); } } }
    // Cycle the equipped weapon through the collected list (+ pickaxe fallback).
    _cycleWeapon() { const list = this.player.weapons.length ? this.player.weapons.slice() : []; if (!list.includes('pickaxe')) list.push('pickaxe'); if (list.length < 2) return; const i = Math.max(0, list.indexOf(this.player.weapon)); this.player.weapon = list[(i + 1) % list.length]; this._notify(this.player.weapon, 60); }

    // Supported runtime mob spawn (build 377). Builds a mob with the SAME shape the
    // constructor's worldData.mobs map produces (js/overhead/overhead-game.js:52-55) and adds
    // it to the live this.mobs, so it draws + updates like any placed mob. Used for the §42
    // occlusion visual (opts.stationary = speed 0 + detect 0, so it holds its cell instead of
    // chasing the player), and it's the reusable primitive the overhead Survival-Waves work
    // will spawn waves through. Returns the mob.
    _spawnMob(type, col, row, opts) {
      opts = opts || {};
      const d = (P().OH_MOB_BY_KEY[type]) || P().OH_MOBS[0];
      const cell = this.grid.cell, stationary = !!opts.stationary;
      const detBlocks = (opts.detect != null) ? opts.detect
        : (this.settings.mobDetectBlocks != null ? this.settings.mobDetectBlocks : 10);
      const m = {
        type: (P().OH_MOB_BY_KEY[type]) ? type : d.key, col, row,
        x: (col + 0.5) * cell, y: (row + 0.5) * cell, r: this.unit * 0.34,
        elev: this._elev(col, row),
        hp: opts.hp || d.hp, maxHp: opts.hp || d.hp,
        speed: stationary ? 0 : (opts.speed != null ? opts.speed : d.speed),
        detect: stationary ? 0 : detBlocks * this.unit,
        ranged: !!d.ranged, state: 'path', wp: 0, dead: false, cool: 0, _wc: stationary ? 1e9 : 0,
      };
      (this.mobs || (this.mobs = [])).push(m);
      return m;
    }
    _updateMobs() {
      for (const m of this.mobs) { if (m.dead) continue; if (m.cool > 0) m.cool--;
        const p = this._nearestPlayer(m.x, m.y);   // §0f — each mob chases/attacks the closest player
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
        if (d < m.r + p.r && p.iFrames === 0 && !this._dodging(this._dodgeMobs)) this._hurt(p, 3, 'Hit by a mob');   // §0f — hits the nearest player
      }
    }

    _pit(c, r) { const k = this._key(c, r); return !!k && P().isPitKey(k); }
    // Pressure plates / weight blocks activate when enough entities stand on them.
    _updatePlates() {
      for (const d of this._redstone) if (d.kind === 'plate' || d.kind === 'weight') {
        let n = 0; for (const pl of this.activePlayers()) { const pc = this._cellOf(pl.x, pl.y); if (pc.col === d.col && pc.row === d.row) n++; }   // §0f any player weighs a plate
        for (const m of this.mobs) if (!m.dead) { const mc = this._cellOf(m.x, m.y); if (mc.col === d.col && mc.row === d.row) n++; }
        d._active = n >= (d.kind === 'weight' ? (d.threshold || 1) : 1);
      }
    }
    // A powered piston is a solid barrier (blocks movement); unpowered = passable.
    _pistonSolidAt(c, r) { if (!this._redstone.length) return false; if (this._pistonHeadSet && this._pistonHeadSet.has(c + ',' + r)) return true;   // an extended horizontal piston head = barrier
      for (const d of this._redstone) if (d.kind === 'piston' && !d.dir && d.col === c && d.row === r) return OH_REDSTONE.cellPowered(this._rs, c, r); return false; }   // legacy piston (no dir) = solid on its own cell when powered
    // ── Swinging gates ──────────────────────────────────────────────────────────
    _gateCells(gt, deg) { return OVERHEAD.gateCells(gt, deg, this.grid.gridW, this.grid.gridH); }
    _gateOccupied(cc, rr) { for (const pl of this.activePlayers()) { const pc = this._cellOf(pl.x, pl.y); if (pc.col === cc && pc.row === rr) return true; }
      if (this.mobs) for (const m of this.mobs) { if (!m.dead) { const mc = this._cellOf(m.x, m.y); if (mc.col === cc && mc.row === rr) return true; } } return false; }
    _updateGates() {
      if (!this._gates.length) { this._gateSolid = null; return; }
      const solid = new Set();
      for (const gt of this._gates) {
        const powered = OH_REDSTONE.receives(this._rs, gt), target = powered ? 1 : 0, swing = gt.angle || 90;
        let np = gt._phase + (target - gt._phase) * 0.14; if (np < 0.002) np = 0; else if (np > 0.998) np = 1;
        // Obstruction-stop: don't advance the swing into a cell an entity is standing in.
        const oldSet = new Set((gt._cells || []).map((c) => c.col + ',' + c.row));
        const nextCells = this._gateCells(gt, (gt.rest || 0) + swing * np);
        let blocked = false; for (const c of nextCells) if (!oldSet.has(c.col + ',' + c.row) && this._gateOccupied(c.col, c.row)) { blocked = true; break; }
        if (!blocked) gt._phase = np;
        gt._curDeg = (gt.rest || 0) + swing * gt._phase; gt._cells = this._gateCells(gt, gt._curDeg);
        for (const c of gt._cells) solid.add(c.col + ',' + c.row);
        // The HINGE post too. gateCells() starts at i=1 so it returns only the panel, while
        // drawGates() adds the post explicitly — so the hinge was drawn as a solid log but
        // stayed walkable, leaving a one-cell gap at the anchor of every gate. (QA F13.)
        solid.add(gt.col + ',' + gt.row);
      }
      this._gateSolid = solid.size ? solid : null;
    }
    _gateSolidAt(c, r) { return !!(this._gateSolid && this._gateSolid.has(c + ',' + r)); }
    _drawGates(ctx, S, cs) { OVERHEAD.drawGates(ctx, S, cs, this.grid.cell, this._gates, (gt) => gt._cells || this._gateCells(gt, gt.rest || 0)); }
    _bridge(c, r) { return this._bridgeAt.get(c + ',' + r) || null; }
    // A bridge cell is CLOSED (a solid walkable deck) when it's a normal bridge, or a
    // drawbridge whose channel is powered. Open drawbridges are gaps.
    _bridgeClosedAt(c, r) {
      const b = this._bridgeAt.get(c + ',' + r);
      if (!b) return false;
      if (!b.draw) return true;                              // a plain bridge is always a solid deck
      const powered = (typeof OH_REDSTONE !== 'undefined') && OH_REDSTONE.receives(this._rs, b);
      // startDown = deck rests DOWN (crossable), a signal RAISES it (classic castle drawbridge).
      // default = deck rests RAISED (open gap), a signal LOWERS it to cross (puzzle gate).
      return b.startDown ? !powered : powered;
    }
    // §0e — per-player. `p` is the player being hurt / soft-respawned (was always this.player).
    _hurt(p, amt, why, attacker) { if (this._god || p.iFrames > 0 || p._dead) return; p.hp -= amt; p.iFrames = 45; if (p.hp <= 0) { if (attacker && attacker !== p) attacker._score = (attacker._score | 0) + 1; this._die(p, why || 'Defeated'); } }   // §modes versus: the killer gets kill credit
    _fall(p, msg) { if (p.hp <= 0) { this._die(p, msg || 'You died'); return; } p.x = p._spawn.x; p.y = p._spawn.y; p.jump = null; p.iFrames = 60; const c = this._cellOf(p.x, p.y); p.elev = this._elev(c.col, c.row); }
    // Family-friendly death (no blood/gore). Default: the player bursts into its
    // own coloured sprite blocks. PIT deaths first show a front-facing figure with
    // flailing limbs SHRINKING for ~1s (falling in), THEN the burst.
    _die(p, msg, cause) {
      if (this._god || p._dead) return;
      // §0e Multiplayer: DOWN this player (burst) then respawn at its OWN spawn; the others keep
      // playing (no global freeze). Single-player keeps the original dying->dead->exit flow below.
      if (this.players.length > 1) {
        p._dead = true; p.hp = 0; p._deathMsg = msg || 'Down'; p._climb = null; p.jump = null;
        p._deathFx = { phase: 'burst', t: 0, x: p.x, y: p.y, parts: this._burstParts(p.x, p.y) };
        // §modes — co-op lives: infinite = always respawn; per-player = each has coopLivesCount;
        // shared = one pool. When lives run out the player stays OUT; match ends when ALL are out.
        let mode = (this.settings && this.settings.coopLives) || 'infinite';
        // §modes versus — Last-standing IS elimination, so it forces finite per-player lives even
        // if the co-op lives setting is Infinite (else the match could never end).
        if (this._versusOn() && this.settings.versusMode === 'lastStanding' && mode === 'infinite') mode = 'perPlayer';
        const N = ((this.settings && this.settings.coopLivesCount) | 0) || 3;
        let canRespawn = true;
        if (mode === 'perPlayer') { p._lives = (p._lives | 0) - 1; canRespawn = p._lives > 0; }
        else if (mode === 'shared') { if (this._coopLives == null) this._coopLives = N; this._coopLives -= 1; canRespawn = this._coopLives > 0; }
        const n = 'P' + ((p._index | 0) + 1);
        if (canRespawn) { p._respawnT = 70; p._out = false; this._notify(n + ' down' + (mode === 'perPlayer' ? ' (' + p._lives + ' left)' : mode === 'shared' ? ' (' + this._coopLives + ' shared)' : ''), 90); }
        else { p._out = true; p._respawnT = 0; this._notify(n + ' is OUT', 120); }
        return;
      }
      if (this.state === 'dying' || this.state === 'dead') return;
      p.hp = 0; this.state = 'dying'; this._deathMsg = msg || 'You died';
      if (cause === 'pit') {
        // Animate from the middle of the PIT. The player's own position at the moment of
        // death can be over adjacent ground or a bridge, which made the sinking figure look
        // like it was falling through solid floor. (QA F16.)
        const at = this._pitCentreNear(p.x, p.y);
        // STEP-OFF, then sink. The trigger fires correctly on entering the pit cell, but the
        // player sprite is drawn LIFTED by the elevation it was standing on (2.5D up-left), so
        // at that instant it still visually overlaps the land — it looked like dying on solid
        // ground, and delaying the trigger instead just meant walking to the middle of the pit
        // first. So keep the trigger where it is and move the SPRITE: slide from where the
        // player actually appears to the pit centre while the lift drops to 0, which reads as
        // stepping off the ledge into the hole. Then the existing shrink/flail takes over.
        // (Kevin, build 350.)
        const c0 = this._cellOf(p.x, p.y);
        // DIRECTIONAL SHIFT — nudge the body AWAY from the edge it fell in through, so it
        // lands in the part of the hole you can actually see. Terrain cubes are drawn
        // shifted up-left, so it is the SOUTH and EAST neighbours whose cubes overlap the
        // pit: coming from below you must move up, from the right you must move left, and
        // from the bottom-right both. Clipping alone was correct but tucked the whole
        // animation under the ledge. (Kevin, build 352.)
        // Shift deeper into the hole than 0.55 — the body still hugged the entry edge — but
        // clamp it to the pit that is actually THERE, so a one-cell pit does not fling the
        // body out the far side. (Kevin, build 356.)
        const cellPx = this.grid.cell, eps = cellPx * 0.05;
        const sgn = (d) => (Math.abs(d) > eps ? Math.sign(d) : 0);
        const pc = Math.floor(at.x / cellPx), pr = Math.floor(at.y / cellPx);
        const dirX = sgn(at.x - p.x), dirY = sgn(at.y - p.y);
        let runX = 0; while (runX < 2 && dirX && this._pit(pc + dirX * (runX + 1), pr)) runX++;
        let runY = 0; while (runY < 2 && dirY && this._pit(pc, pr + dirY * (runY + 1))) runY++;
        const shiftX = dirX * cellPx * Math.min(0.85, 0.35 + runX * 0.5);
        const shiftY = dirY * cellPx * Math.min(0.85, 0.35 + runY * 0.5);
        this._deathFx = { phase: 'step', pit: true, t: 0, stepDur: 14, sinkDur: 60, parts: null,
          fromX: p.x, fromY: p.y, fromLift: Math.max(0, (p.elev | 0)),
          x: at.x + shiftX, y: at.y + shiftY, pitX: at.x, pitY: at.y, shiftX, shiftY,
          toLift: this._elev(c0.col, c0.row) | 0 };
      }
      else this._deathFx = { phase: 'burst', t: 0, x: p.x, y: p.y, parts: this._burstParts(p.x, p.y) };
    }
    // The centre of the pit the player just fell into: their own cell if it is a pit, else
    // the nearest neighbouring pit cell. Falls back to the given point if neither.
    // Paint the blocks that should be IN FRONT of the dying body back over it.
    //
    // Terrain is one flat cached layer, so a sprite drawn after it always paints over every
    // block (builds 348-350 chased this as a positioning bug). Build 351 clipped the sprite
    // to the pit cell instead, which occluded correctly but CROPPED it — the dying figure is
    // ~1.3 cells tall, so a one-cell clip cut most of it off from every direction.
    //
    // So: draw the body full size, then re-draw the raised neighbours that are nearer to the
    // camera (greater row+col) on top of it, back-to-front, exactly as the terrain cache
    // builds them. The body genuinely falls BEHIND the ground instead of being trimmed to fit
    // it, and stays whole wherever nothing covers it. (Kevin's suggestion, build 353.)
    _redrawOccluders(ctx, S, cs, pitCol, pitRow) {
      const g = this.grid, cell = g.cell, depth = pitCol + pitRow, out = [];
      // Reach far enough south/east to cover the whole body. The dying figure is about
      // 1.3 * unit tall and unit = cell * DENSITY, so on a dense map its feet hang two or
      // three cells below the anchor — a fixed 2-cell window left them sticking out over
      // the blocks underneath. (Kevin, build 356.)
      const reach = Math.max(2, Math.ceil(1.3 * (this._density || 1)) + 1);
      for (let dr = -1; dr <= reach; dr++) for (let dc = -1; dc <= reach; dc++) {
        const c = pitCol + dc, r = pitRow + dr;
        if (c < 0 || r < 0 || c >= g.gridW || r >= g.gridH) continue;
        if (c + r <= depth) continue;                       // behind the body — leave it
        const k = this._key(c, r);
        if (k == null || k === 'pit') continue;             // no floor there to hide behind
        // NOT gated on elevation. Build 353 skipped anything at elevation 0, which is the
        // usual case — a pit in FLAT ground has no raised neighbours at all, so nothing was
        // ever painted over the body and it kept floating on top. A body that has fallen
        // below the floor is behind ANY ground nearer the camera, flat included.
        out.push({ c, r, e: this._elev(c, r) | 0, k });
      }
      out.sort((a, b) => (a.r + a.c) - (b.r + b.c) || a.e - b.e);   // back-to-front
      for (const o of out) {
        const sp = S(o.c * cell, o.r * cell);
        const sN = (o.r + 1 < g.gridH) ? this._elev(o.c, o.r + 1) : -1;
        const eN = (o.c + 1 < g.gridW) ? this._elev(o.c + 1, o.r) : -1;
        OVERHEAD.drawTerrainCube(ctx, o.k, sp.x, sp.y, cs, o.e, sN < o.e, eN < o.e);
      }
    }
    // §42 — which raised terrain cells occlude an entity standing at (col,row,level)? A cell
    // occludes iff it is NEARER the camera (c+r greater than the entity's c+r) AND its terrain
    // is TALLER than the entity's footing (elev > level) — so a wall hides a mob behind it, but
    // a shorter wall one row south does NOT hide a mob standing high on a taller wall (the
    // subtlety the design called out). Bounded to a small south/east window, back-to-front.
    // Pure (no drawing) so the depth rule can be unit-tested.
    _occluderCells(col, row, level) {
      const g = this.grid, depth = col + row, out = [];
      const reach = Math.max(2, Math.ceil(1.3 * (this._density || 1)) + 1);
      for (let dr = -1; dr <= reach; dr++) for (let dc = -1; dc <= reach; dc++) {
        const c = col + dc, r = row + dr;
        if (c < 0 || r < 0 || c >= g.gridW || r >= g.gridH) continue;
        if (c + r <= depth) continue;                       // behind (or level with) the entity — leave it
        const e = this._elev(c, r) | 0;
        if (e <= (level | 0)) continue;                     // only terrain TALLER than the entity's footing can hide it
        const k = this._key(c, r);
        if (k == null || k === 'pit') continue;
        out.push({ c, r, e, k });
      }
      out.sort((a, b) => (a.r + a.c) - (b.r + b.c) || a.e - b.e);   // back-to-front, like the cache bake
      return out;
    }
    _occludeEntity(ctx, S, cs, e) {
      const col = (e.col != null) ? e.col : (e.ref && e.ref.col != null ? e.ref.col : 0);
      const cells = this._occluderCells(col, e.row, e.level || 0);
      if (!cells.length) return;
      const g = this.grid, cell = g.cell;
      for (const o of cells) {
        const sp = S(o.c * cell, o.r * cell);
        const sN = (o.r + 1 < g.gridH) ? this._elev(o.c, o.r + 1) : -1;
        const eN = (o.c + 1 < g.gridW) ? this._elev(o.c + 1, o.r) : -1;
        OVERHEAD.drawTerrainCube(ctx, o.k, sp.x, sp.y, cs, o.e, sN < o.e, eN < o.e);
      }
    }
    _pitCentreNear(x, y) {
      const cell = this.grid.cell, c = this._cellOf(x, y);
      const centre = (col, row) => ({ x: (col + 0.5) * cell, y: (row + 0.5) * cell });
      if (this._pit(c.col, c.row)) return centre(c.col, c.row);
      const around = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
      for (const [dc, dr] of around) if (this._pit(c.col + dc, c.row + dr)) return centre(c.col + dc, c.row + dr);
      return { x, y };
    }
    _burstParts(x, y) {
      const sp = P().OH_SPRITE, cols = [sp.hair, sp.shirt, sp.shirt, sp.pants, sp.pants, sp.skin], parts = [], n = 16;
      for (let i = 0; i < n; i++) { const ang = (i / n) * Math.PI * 2 + (i % 3) * 0.4, spd = this.unit * (0.06 + (i % 5) * 0.02);
        parts.push({ x, y, h: 0, vh: this.unit * (0.05 + (i % 3) * 0.015), vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, sz: this.unit * (0.16 + (i % 4) * 0.05), rot: ang, vr: (i % 2 ? 1 : -1) * 0.2, color: cols[i % cols.length], life: 46 + (i % 10) }); }
      // Each piece gets a small DECAYING height (h, world px; vh integrates a light gravity in
      // _update). This removes the A1.4 pit-rim ambiguity permanently: while a piece is airborne
      // (h > a rim sliver) it legitimately flies OVER a pit rim and draws on top; once it settles
      // (h -> 0) it draws behind the rim like any ground-plane piece. Before this, a burst piece
      // had no height at all, so "should it be over the rim?" had no answer in the data.
      return parts;
    }
    // GLASS shatter: a raised glass wall struck by melee/ranged collapses to a walkable
    // gap and throws jagged shards (family-friendly, no gore). Returns true if it broke.
    _shatterGlass(c, r) {
      if (!this._glassShatter) return false;
      if (this._key(c, r) !== 'glass' || this._elev(c, r) <= 0) return false;   // only a raised pane shatters
      this._spawnShards((c + 0.5) * this.grid.cell, (r + 0.5) * this.grid.cell);
      if (this.ground[r]) this.ground[r][c] = 'grass';       // clear gap where the pane was
      if (this.elevation[r]) this.elevation[r][c] = 0;
      this._terrainCache = null;                             // force the static terrain re-bake
      this._staticShadowCanvas = null;                       // …and the baked static shadow
      return true;
    }
    _spawnShards(x, y) {
      const cell = this.grid.cell, cols = ['#cfeef5', '#eaf7fb', '#a9d6ea', '#ffffff'];
      for (let i = 0; i < 11; i++) { const ang = (i / 11) * Math.PI * 2 + 0.35, spd = cell * (0.02 + (i % 3) * 0.015);
        this._shards.push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, sz: cell * (0.09 + (i % 3) * 0.04), rot: ang, vr: (i % 2 ? 1 : -1) * 0.28, color: cols[i % cols.length], life: 32 + (i % 8) }); }
    }
    _updateShards() {
      if (!this._shards.length) return;
      for (const s of this._shards) { s.x += s.vx; s.y += s.vy; s.vx *= 0.86; s.vy *= 0.86; s.rot += s.vr; s.vr *= 0.94; s.life--; }
      this._shards = this._shards.filter((s) => s.life > 0);
    }
    _drawShards(ctx, S, cs) {
      if (!this._shards.length) return;
      const z = this.grid.masterZoom || 1;
      for (const s of this._shards) { const p = S(s.x, s.y), a = Math.min(1, s.life / 16), r = s.sz * z;
        ctx.save(); ctx.globalAlpha = a; ctx.translate(p.x, p.y); ctx.rotate(s.rot); ctx.fillStyle = s.color;
        ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.7, r * 0.6); ctx.lineTo(-r * 0.6, r * 0.55); ctx.closePath(); ctx.fill(); ctx.restore(); }
      ctx.globalAlpha = 1;
    }
    _advanceDeath() {
      const fx = this._deathFx; if (!fx) { this.state = 'dead'; return; }
      // With the debug HUD up (` key), play the death at QUARTER speed. A screen-capture
      // tool that waits for motion to settle never catches a 1.2s animation otherwise.
      if (this._debug) { this._deathSlow = (this._deathSlow || 0) + 1; if (this._deathSlow % 4) return; }
      fx.t++;
      if (fx.phase === 'step') { if (fx.t >= fx.stepDur) { fx.phase = 'sink'; fx.t = 0; } return; }
      if (fx.phase === 'sink') {
        if (fx.t >= fx.sinkDur) {
          fx.phase = 'burst'; fx.t = 0;
          // Spawn the pieces at the body's VISUAL resting point — its drift included —
          // rather than its logical cell, which is what made the explosion appear offset
          // from the falling sprite. (Kevin, build 355.)
          fx.parts = this._burstParts(fx.x, fx.y + (fx.driftCells || 0) * this.grid.cell);
        }
        return;
      }
      let alive = 0;
      // Top-down: pieces scatter OUTWARD and settle in place, then fade. The scatter (x/y) has
      // no gravity; the small HEIGHT (h) does — it rises then falls back to the ground plane, so
      // early frames read as flying up over a rim and later frames as settled. (A1.4.)
      const grav = this.unit * 0.012;
      for (const q of fx.parts) { if (q.life <= 0) continue; alive++; q.x += q.vx; q.y += q.vy; q.vx *= 0.9; q.vy *= 0.9; q.rot += q.vr;
        q.vh -= grav; q.h += q.vh; if (q.h < 0) { q.h = 0; q.vh = 0; }
        q.life--; }
      if (alive === 0 || fx.t > 90) { this.state = 'dead'; this._notify(this._deathMsg, 240); }
    }
    // Front-facing figure with flailing limbs, used for the pit-death shrink phase.
    // `drift` is the downward sink offset in SCREEN px, supplied by the caller.
    //
    // It used to be computed here as size * (0.2 + 0.55 * (1 - scale)) — and `size` is
    // this.unit * zoom, where unit = cell x DENSITY. On a dense map that is two or three
    // whole CELLS of downward drift, so the dying body was drawn well south of the pit,
    // out on the grass. That is why it looked like it was floating on top of the ground
    // (it was over ground), why the occluder pass around the pit never covered it, why a
    // half-cell shift was imperceptible, and why the burst appeared offset from the body.
    // Seven builds chased the consequences of this one line. (Kevin's screenshots, build 355.)
    _drawDyingSprite(ctx, sx, sy, size, scale, t, drift) {
      const sp = P().OH_SPRITE, u = size * 1.3 * Math.max(0.06, scale);
      const f1 = Math.sin(t * 0.6) * 0.6, f2 = Math.cos(t * 0.7) * 0.6;
      ctx.save(); ctx.translate(sx, sy + (drift || 0)); ctx.lineCap = 'round';
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

    // Expand template STAMPS into absolute overlay voxels + a solidity set (a NON-leaves
    // voxel — a trunk/wall — blocks movement; leaf canopies stay pass-under).
    _buildTemplateOverlay(worldData) {
      const g = this.grid;
      this._templateVoxels = (typeof OH_TEMPLATES !== 'undefined') ? OH_TEMPLATES.expandStamps(worldData, g.gridW, g.gridH) : [];
      this._templateSolid = new Set();
      for (const v of this._templateVoxels) if (!v.isLeaves) this._templateSolid.add(v.col + ',' + v.row);
    }
    // Pre-render the whole static terrain (tops + 3D sides, elevation baked in) to
    // an offscreen canvas at 1:1 world px. `pad` is a top margin so raised tiles
    // (drawn UP) aren't clipped. Blitted each frame in _render.
    // Set up an INCREMENTAL terrain bake (build 373). The opening ~8fps was one synchronous
    // 112,000-cell bake blocking the main thread — which is also why a zoom animation couldn't
    // play during it. This just prepares the canvas + the sorted cell list; _stepTerrainBake
    // draws a chunk per frame so the thread yields and a Loading banner can animate.
    _beginTerrainBake() {
      const g = this.grid, cell = g.cell;
      const worldW = g.gridW * cell, worldH = g.gridH * cell;
      const Q = OVERHEAD.elevOffset(cell);
      let maxE = 0; for (let r = 0; r < g.gridH; r++) { const row = this.elevation[r]; if (row) for (let c = 0; c < g.gridW; c++) if ((row[c] | 0) > maxE) maxE = row[c] | 0; }
      const pad = Math.ceil(maxE * Q + cell);   // up-left offset needs pad on BOTH axes
      this._cachePad = pad;
      const cv = document.createElement('canvas'); cv.width = Math.max(1, worldW + pad); cv.height = Math.max(1, worldH + pad);
      // Back-to-front: up-left = farther (drawn first), bottom-right = closer. Sort by (r+c)
      // then elevation so cubes overlap correctly — done ONCE, up front.
      const cells = [];
      for (let r = 0; r < g.gridH; r++) for (let c = 0; c < g.gridW; c++) { const k = this._key(c, r); if (k == null) continue; cells.push({ c, r, k, e: this._elev(c, r) }); }
      cells.sort((a, b) => (a.r + a.c) - (b.r + b.c) || a.e - b.e);
      this._bake = { cv, cx: cv.getContext('2d'), cells, i: 0, pad, cell, total: cells.length };
    }
    // Draw up to `budget` cells; on completion publish the cache and clear the bake state.
    _stepTerrainBake(budget) {
      const b = this._bake; if (!b) return;
      const g = this.grid, cell = b.cell, end = Math.min(b.cells.length, b.i + budget);
      for (; b.i < end; b.i++) {
        const cl = b.cells[b.i];
        const fx = cl.c * cell + b.pad, fy = cl.r * cell + b.pad;
        const sN = (cl.r + 1 <= g.gridH - 1) ? this._elev(cl.c, cl.r + 1) : -1, eN = (cl.c + 1 <= g.gridW - 1) ? this._elev(cl.c + 1, cl.r) : -1;
        OVERHEAD.drawTerrainCube(b.cx, cl.k, fx, fy, cell, cl.e, sN < cl.e, eN < cl.e);
      }
      if (b.i >= b.cells.length) { this._terrainCache = b.cv; this._bake = null; }
    }
    bakeProgress() { return this._bake ? (this._bake.i / Math.max(1, this._bake.total)) : (this._terrainCache ? 1 : 0); }
    // Synchronous full bake — for re-bakes mid-play and for the perf-measure path, which need
    // the cache ready immediately (no Loading animation).
    _bakeTerrainNow() { this._beginTerrainBake(); this._stepTerrainBake(Infinity); }
    // Kept as the historical name; now a synchronous alias.
    _buildTerrainCache() { this._bakeTerrainNow(); }

    // Ease the opening zoom-OUT once the bake finishes: hold zoomed in on the player, then
    // animate to the creator's default zoom (build 373). Reuses masterZoom; the per-frame
    // camera-follow keeps the player centred. Skipped if Lock-zoom worlds still want the
    // intro (the animation is the creator's, not player input, so it always plays).
    _startLoadZoom() {
      const def = +this.settings.masterZoom || this.grid.masterZoom || 1;
      const maxZ = (OH_GRID && OH_GRID.MAX_ZOOM) || 3;
      const start = Math.min(maxZ, Math.max(def * 2.2, 1.8));
      if (start <= def + 0.01) { this._loadZoom = null; return; }   // already zoomed-in enough; nothing to animate
      this._loadZoom = { from: start, to: def, t: 0, dur: 36 };
      this.grid.masterZoom = start;
      if (this.player) this.camera = OH_GRID.centerOn(this.grid, this.player.x, this.player.y, CANVAS_W, CANVAS_H);
    }
    _tickLoadZoom() {
      const lz = this._loadZoom; if (!lz) return;
      lz.t++;
      const k = Math.min(1, lz.t / lz.dur), e = 1 - Math.pow(1 - k, 3);   // ease-out
      this.grid.masterZoom = lz.from + (lz.to - lz.from) * e;
      if (this.player) this.camera = OH_GRID.centerOn(this.grid, this.player.x, this.player.y, CANVAS_W, CANVAS_H);
      if (k >= 1) { this.grid.masterZoom = lz.to; this._loadZoom = null; }
    }
    // The "Loading World" screen shown WHILE the bake runs — a plain backdrop, a banner, and a
    // progress bar. Terrain isn't ready yet, so there is nothing else to draw; the point is
    // that the thread is free and the user sees honest progress instead of an 8fps freeze.
    _drawLoading(ctx) {
      ctx.fillStyle = '#0c1119'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      const p = this.bakeProgress();
      ctx.fillStyle = '#dfe7f5'; ctx.textAlign = 'center'; ctx.font = 'bold 22px sans-serif';
      ctx.fillText('Loading World…', CANVAS_W / 2, CANVAS_H / 2 - 14);
      const bw = Math.min(360, CANVAS_W * 0.5), bx = (CANVAS_W - bw) / 2, by = CANVAS_H / 2 + 8, bh = 10;
      ctx.strokeStyle = '#46557a'; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, bh);
      ctx.fillStyle = '#4f86d8'; ctx.fillRect(bx + 1, by + 1, Math.max(0, (bw - 2) * p), bh - 2);
      ctx.fillStyle = '#8fa0bd'; ctx.font = '12px sans-serif';
      ctx.fillText(Math.round(p * 100) + '%', CANVAS_W / 2, by + bh + 18);
      ctx.textAlign = 'left';
    }

    // ── Render ────────────────────────────────────────────────────────────
    _render() {
      const ctx = this.ctx, g = this.grid;
      // Chunked terrain bake (build 373): the FIRST bake runs a chunk per frame behind a
      // "Loading World" banner, then animates the zoom OUT to the creator's default. Mid-play
      // re-bakes (e.g. a settings change nulled the cache) just bake synchronously — the world
      // is already loaded, so no banner. The perf-measure path bakes synchronously up front.
      if (!this._terrainCache && !this._measureCfg) {
        if (this._didInitialLoad) { this._bakeTerrainNow(); }
        else {
          if (!this._bake) this._beginTerrainBake();
          this._stepTerrainBake(this._bakeBudget || 4000);       // ~4k cells/frame → ~0.5s on a 112k map
          if (!this._terrainCache) { this._drawLoading(ctx); return; }
          this._didInitialLoad = true; this._startLoadZoom();
        }
      }
      this._tickLoadZoom();
      const z = g.masterZoom, cs = g.cell * z;
      ctx.fillStyle = '#0c1119'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      const S = (wx, wy) => OH_GRID.worldToScreen(g, this.camera, wx, wy);
      const tl = OH_GRID.screenToWorld(g, this.camera, 0, 0), br = OH_GRID.screenToWorld(g, this.camera, CANVAS_W, CANVAS_H);
      const c0 = Math.max(0, (tl.x / g.cell | 0) - 1), c1 = Math.min(g.gridW - 1, (br.x / g.cell | 0) + 1);
      const r0 = Math.max(0, (tl.y / g.cell | 0) - 1), r1 = Math.min(g.gridH - 1, (br.y / g.cell | 0) + 1);
      // Cells on screen — the number that explains zoom-dependent slowdown, since it grows
      // as zoom^-2 and most per-frame work is per visible cell. Shown in the debug HUD.
      this._visibleCells = (c1 - c0 + 1) * (r1 - r0 + 1);
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
      // Quality tier can only DOWNGRADE what the world settings asked for — a designer's
      // choice is the ceiling, the governor just protects the frame rate under it.
      // _measureCfg forces a specific quality tier for the performance-assessment button
      // (build 371) so assess() can time each tier on the real render. null in normal play.
      const q = this._measureCfg || ((this._gov && this._gov.enabled) ? this._gov.cfg() : null);
      const wantShadows = q ? (this._shadowStyle === 'fixed' ? (q.shadows !== 'off' ? 'fixed' : 'off')
                                                            : (q.shadows === 'live' ? 'live' : q.shadows))
                            : (this._shadowStyle === 'fixed' ? 'fixed' : 'live');
      if (this._shadows && wantShadows !== 'off') {
        if (wantShadows === 'fixed') this._drawStaticShadows(ctx, cs);                                          // baked once, cheap
        else if (this._dayNight && typeof OH_DAYNIGHT !== 'undefined') this._drawShadows(ctx, S, cs, c0, c1, r0, r1);   // live, follows sun/moon
      }
      for (const rp of this._rampList) { const sp = S((rp.col + 0.5) * g.cell, (rp.row + 0.5) * g.cell); const dir = OVERHEAD.rampDir((c, r) => this._elev(c, r), rp.col, rp.row); OVERHEAD.drawRampIcon(ctx, rp.kind, sp.x, sp.y, cs, dir); }
      if (this._bridges.length) this._drawBridges(ctx, S, cs);
      if (this._gates.length) this._drawGates(ctx, S, cs);
      if (this._redstone.length) this._drawRedstone(ctx, S, cs);
      if (this.goal) { const gc = (typeof GOAL_COLORS !== 'undefined' && GOAL_COLORS[this.goal.color || 0]) || { hex: '#ffd700' }; const sp = S((this.goal.col + 1) * g.cell, (this.goal.row + 1) * g.cell); ctx.fillStyle = gc.hex; ctx.font = `${(cs * 1.8) | 0}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('★', sp.x, sp.y + cs * 0.62); }
      // Entities sorted by (row + elev).
      const ents = [];
      for (const b of this.buildings) ents.push({ kind: 'b', row: b.row, col: b.col, level: b.level || 0, ref: b });
      for (const it of this.items) if (!it.taken) ents.push({ kind: 'i', row: it.row, col: it.col, level: 0, ref: it });
      for (const m of this.mobs) if (!m.dead) ents.push({ kind: 'm', row: (m.y / g.cell) | 0, col: (m.x / g.cell) | 0, level: m.elev || 0, ref: m });
      for (const v of this._templateVoxels) ents.push({ kind: 'tv', row: v.row, col: v.col, level: v.elev, ref: v });   // template overlay voxels (interleave with terrain/entities)
      // §Overhead multiplayer (Phase 0c) — draw EVERY active player (was P1 only). Each is a
      // depth-sorted entity, so a player higher on the map draws behind one lower down.
      for (const pl of this.activePlayers()) ents.push({ kind: 'p', row: (pl.y / g.cell) | 0, col: (pl.x / g.cell) | 0, level: pl.elev, ref: pl });
      // §42 depth occlusion (build 374, default OFF): after each entity, repaint the raised
      // terrain NEARER the camera and TALLER than the entity's footing back over it, so a wall
      // hides a mob standing behind it. Gated so the deployed layering is unchanged until a
      // browser pass turns it on; skipped during a perf measure.
      const occl = this.settings.depthOcclusion === true && !this._measureCfg;
      OH_ELEV.sortForDraw(ents).forEach((e) => { this._drawEntity(e, S, z, cs); if (occl) this._occludeEntity(ctx, S, cs, e); });
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
        const fpr = OH_BUILDINGS.footprintOf(b.typeId, this._density), fw = fpr.w, fh = fpr.h;
        const key = b.col + ',' + b.row, sp = S((b.col + fw / 2) * g.cell, (b.row + fh / 2) * g.cell);
        // §0c — glow/prompt are per-player; light a cell that ANY player just used / is near.
        const _glow = this.activePlayers().map((pl) => pl._portalGlow).find((gm) => gm && gm.keys.indexOf(key) >= 0);
        if (_glow) { const a = 0.35 + 0.35 * Math.sin(_glow.t * 0.5); ctx.fillStyle = `rgba(180,90,230,${a})`; ctx.beginPath(); ctx.ellipse(sp.x, sp.y, fw * cs * 0.5, fh * cs * 0.5, 0, 0, 7); ctx.fill(); }
        // "Press E" prompt + glow when a player is in range of this one.
        if (this.activePlayers().some((pl) => pl._portalPrompt === key)) { const a = 0.4 + 0.3 * Math.sin((this._frame || 0) * 0.15); ctx.fillStyle = `rgba(180,90,230,${a})`; ctx.beginPath(); ctx.ellipse(sp.x, sp.y, fw * cs * 0.55, fh * cs * 0.55, 0, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,.75)'; const py = sp.y - fh * cs * 0.62; ctx.fillRect(sp.x - cs * 0.9, py - cs * 0.5, cs * 1.8, cs * 0.7); ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.max(11, cs * 0.5) | 0}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Press E', sp.x, py - cs * 0.15); ctx.textBaseline = 'alphabetic'; }
        if (this._testMode) { const n = this._portalIndex.get(key); const br = Math.max(11, cs * 0.55), by = sp.y - fh * cs * 0.45; ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.beginPath(); ctx.arc(sp.x, by, br, 0, 7); ctx.fill(); ctx.strokeStyle = '#b56bde'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.max(12, cs * 0.6) | 0}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('#' + n, sp.x, by); ctx.textBaseline = 'alphabetic'; }   // designer aid — Test mode only, hidden in normal play
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
        // OCCLUSION — the reason three position fixes did nothing. The whole terrain is
        // baked into ONE cached canvas and blitted as a single flat layer, so every sprite
        // drawn afterwards paints over ALL of it, raised cliffs included. A body falling
        // into a hole therefore rendered on top of the ground blocks around it no matter
        // where we put it. Clipping the dying sprite to the PIT's own cell means it can
        // never paint onto neighbouring ground — it disappears into the hole instead.
        // During the step-off it is also allowed over the cell it is leaving, so it does
        // not pop. (Kevin, build 351.)
        const Q = OVERHEAD.elevOffset(cs);
        const cellQuad = (wx, wy, lift) => { const q = S(wx, wy); return { x: q.x - lift, y: q.y - lift }; };
        const cellW = this.grid.cell;
        const pitCol = Math.floor((fx.pitX != null ? fx.pitX : fx.x) / cellW);
        const pitRow = Math.floor((fx.pitY != null ? fx.pitY : fx.y) / cellW);
        if (fx.phase === 'step') {
          const k = Math.min(1, fx.t / fx.stepDur), e = k * k * (3 - 2 * k);   // ease-in-out
          const wx = fx.fromX + (fx.x - fx.fromX) * e, wy = fx.fromY + (fx.y - fx.fromY) * e;
          const lift = (fx.fromLift + ((fx.toLift || 0) - fx.fromLift) * e) * Q;
          const s = S(wx, wy);
          this._drawDyingSprite(ctx, s.x - lift, s.y - lift, this.unit * z, 1, fx.t, cs * 0.15);
          this._redrawOccluders(ctx, S, cs, pitCol, pitRow);
        }
        else if (fx.phase === 'sink') {
          const s = S(fx.x, fx.y);
          const scale = 1 - (fx.t / fx.sinkDur) * 0.85;
          const drift = cs * (0.15 + 0.30 * (1 - scale));         // at most ~0.4 of a CELL
          fx.driftCells = drift / cs;                             // remembered for the burst
          this._drawDyingSprite(ctx, s.x, s.y, this.unit * z, scale, fx.t, drift);
          this._redrawOccluders(ctx, S, cs, pitCol, pitRow);
        }
        else if (fx.parts) {
          // Lift each piece on screen by its height (world px -> screen px via z).
          const drawPart = (q) => { if (q.life <= 0) return; const s = S(q.x, q.y);
            ctx.save(); ctx.translate(s.x, s.y - (q.h || 0) * z); ctx.rotate(q.rot); ctx.globalAlpha = Math.max(0, Math.min(1, q.life / 22));
            ctx.fillStyle = q.color; ctx.fillRect(-q.sz * z / 2, -q.sz * z / 2, q.sz * z, q.sz * z); ctx.restore(); };
          if (fx.pit) {
            // A body that burst INSIDE a pit: settled pieces sit on the pit floor and are hidden
            // by the ground/rim; airborne pieces (still have height) legitimately fly OVER the
            // rim, so they draw AFTER the occluder re-draw. A1.4: height decides, not draw order.
            // (Extends Kevin's build-356 occluder pass with the decaying-height rule.)
            const AIR = this.grid.cell * 0.05;   // world px — a rim sliver a piece must clear to be "over" it
            for (const q of fx.parts) if ((q.h || 0) <= AIR) drawPart(q);
            ctx.globalAlpha = 1;
            this._redrawOccluders(ctx, S, cs, pitCol, pitRow);
            for (const q of fx.parts) if ((q.h || 0) > AIR) drawPart(q);
          } else {
            for (const q of fx.parts) drawPart(q);
          }
          ctx.globalAlpha = 1;
        }
      }
      // §0e — per-player death bursts (multiplayer): draw each downed player's burst where it fell.
      for (const dp of (this.players || [])) {
        const dfx = dp._deathFx; if (!dfx || !dfx.parts || dp === this.player && (this.state === 'dying' || this.state === 'dead')) continue;
        for (const q of dfx.parts) { if (q.life <= 0) continue; const s = S(q.x, q.y); ctx.save(); ctx.translate(s.x, s.y - (q.h || 0) * z); ctx.rotate(q.rot); ctx.globalAlpha = Math.max(0, Math.min(1, q.life / 22)); ctx.fillStyle = q.color; ctx.fillRect(-q.sz * z / 2, -q.sz * z / 2, q.sz * z, q.sz * z); ctx.restore(); }
      }
      ctx.globalAlpha = 1;
      // Day/night ambient overlay + light sources + sun/moon disc — drawn before the
      // HUD so the HUD stays crisp.
      if (this._dayNight && typeof OH_DAYNIGHT !== 'undefined' && (!q || q.night)) this._drawNight(ctx, S, cs);
      if (this._dayNight && typeof OH_DAYNIGHT !== 'undefined' && (!q || q.glare)) this._drawGlassGlare(ctx, S, cs, c0, c1, r0, r1);
      this._drawShards(ctx, S, cs);
      this._drawHUD(ctx);
    }
    // §Glass glare — a bright glint sweeps across each glass pane as the sun / moon crosses
    // the sky (its position tracks the disc's x); stronger by DAY + when the disc is high.
    _drawGlassGlare(ctx, S, cs, c0, c1, r0, r1) {
      const body = OH_DAYNIGHT.body(this._tod);
      const intensity = (body.isDay ? 0.6 : 0.22) * Math.max(0, 1 - (body.fy || 0) * 0.85);
      if (intensity <= 0.02) return;
      const g = this.grid, cell = g.cell, Q = OVERHEAD.elevOffset(cs), phase = body.fx || 0;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        if (this._key(c, r) !== 'glass') continue;
        const e = this._elev(c, r), base = S(c * cell, r * cell), x = base.x - e * Q, y = base.y - e * Q;
        const gx = x + cs * (0.1 + phase * 0.8);   // the glint band sweeps with the disc
        const grd = ctx.createLinearGradient(gx - cs * 0.35, y, gx + cs * 0.35, y + cs);
        grd.addColorStop(0, 'rgba(255,255,255,0)');
        grd.addColorStop(0.5, `rgba(255,255,255,${intensity})`);
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grd; ctx.fillRect(x, y, cs, cs);
      }
      ctx.restore();
    }

    _drawEntity(e, S, z, cs) {
      const ctx = this.ctx, g = this.grid;
      if (e.kind === 'b') { const b = e.ref; const fpe = OH_BUILDINGS.footprintOf(b.typeId, this._density); const sp = S(b.col * g.cell, b.row * g.cell); const w = fpe.w * cs, h = fpe.h * cs; const Q = OVERHEAD.elevOffset(cs), lv = (b.level || 0); OVERHEAD.drawBuilding(ctx, b.typeId, sp.x - lv * Q, sp.y - lv * Q, w, h, Math.min(1, cs / 28), b.skin || 'default'); }
      else if (e.kind === 'i') { const it = e.ref; const sp = S((it.col + 0.5) * g.cell, (it.row + 0.5) * g.cell); OVERHEAD.drawItemSprite(ctx, it.itemKey, sp.x, sp.y, this.unit * z * 0.8); }
      else if (e.kind === 'm') { this._drawMob(e.ref, S, z, cs); }
      else if (e.kind === 'tv') {   // template overlay voxel: a 1-level cube floating at its elevation
        const v = e.ref, Q = OVERHEAD.elevOffset(cs), base = S(v.col * g.cell, v.row * g.cell);
        OVERHEAD.drawTerrainCube(ctx, v.block, base.x - (v.elev - 1) * Q, base.y - (v.elev - 1) * Q, cs, 1, true, true);
      }
      else if (e.kind === 'p') { if (this.state !== 'dying' && this.state !== 'dead') this._drawPlayer(e.ref, S, z, cs); }
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

    _drawPlayer(p, S, z, cs) {
      const ctx = this.ctx;
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
      const moving = !!p._moving;   // §0c — per-player walk state (was P1 keyboard-only)
      const cl = p._climb;
      const alpha = ((p.hidden && !this.showHidden) ? 0.9 : 1) * (cl ? cl.alpha : 1);
      ctx.globalAlpha = alpha;
      // Legs face movement; upper body + weapon face aim. Weapon hidden while a
      // trident/boomerang is in flight (it's the thing flying).
      const inFlight = p._trident || p._boom || p._swingT > 0;   // also hide the held weapon during a melee swing (the enlarged swinging weapon stands in)
      // Double-jump flourish: 'somersault' (head-over-heels y-foreshorten) or 'spin'.
      let spin = 0, somersault = null;
      if (p.jump && p.jump.jumping && p.jump.doubleUsed) { const prog = Math.min(1, p.jump.t / p.jump.dur); if ((this.settings.doubleJumpStyle || 'somersault') === 'spin') spin = prog * Math.PI * 3; else somersault = prog; }
      if (cl && cl.spin) spin = cl.spin;   // portal step-through spin
      const reach = (!cl && (p._reachT | 0) > 0) ? Math.sin((1 - p._reachT / 16) * Math.PI) * 0.9 : 0;   // brief arm-reach when flipping a lever / using a lock
      const aimA = cl ? cl.face : OH_CONTROLS.angleOf(p.aim);
      // Pipe EMERGE: grow from small back to full as the player climbs out (QA F14).
      const em = p._emerge ? Math.max(0.25, Math.min(1, p._emerge.t / p._emerge.dur)) : 1;
      OVERHEAD.drawOverheadPlayer(ctx, cx, cy, (cl ? rr * cl.scale : rr) * em, p.dist, cl ? false : moving, aimA,
        { rotate: true, weapon: inFlight ? null : (p.weapon || 'pickaxe'), moveAngle: (cl ? cl.face : (p.moveAngle != null ? p.moveAngle : OH_CONTROLS.angleOf(p.aim))), spin, somersault, facing: aimA,
          grab: cl ? cl.grab : reach, mantleLeg: cl ? cl.mantleLeg : 0, crouch: cl ? cl.crouch : 0 });
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
    // Cast ONE cell's shadow into offscreen ctx `sx`. (x,y) = the cell's top-left in that
    // ctx's space; (ox,oy) = the ground displacement for this cell's elevation.
    //  • SOLID terrain (incl. the tree TRUNK) sweeps its full CUBE (the vertical stack of
    //    squares, footprint → up-left top) so a run reads as one solid, side-inclusive shape.
    //  • LEAVES are a FLOATING canopy — they cast a single silhouette OFFSET by their height
    //    (a drop shadow), NOT a solid ground column, so the canopy shadow is a discrete blob
    //    that separates from the trunk shadow when the sun is low.
    _castShadowCell(sx, x, y, e, isLeaves, ox, oy, cs, Q) {
      if (isLeaves) { sx.fillRect(x + ox, y + oy, cs, cs); return; }
      const steps = Math.max(1, Math.ceil(Math.hypot(ox, oy) / (cs * 0.5)));
      for (let s = 0; s <= steps; s++) { const t = s / steps, dx = ox * t, dy = oy * t;
        for (let i = 0; i <= e; i++) sx.fillRect(x - i * Q + dx, y - i * Q + dy, cs, cs); }
    }
    // Erase a cell's DRAWN shape from the shadow layer so a shadow never covers the block.
    _eraseShadowCell(sx, x, y, e, isLeaves, cs, Q) {
      const tx = x - e * Q, ty = y - e * Q;
      if (isLeaves) { sx.fillRect(tx - 0.5, ty - 0.5, cs + 1, cs + 1); return; }   // floating canopy footprint
      sx.fillRect(tx - 0.5, ty - 0.5, (x + cs) - tx + 1, (y + cs) - ty + 1);        // full cube column
    }
    _fixedSh() { const D = { dr: [0.7, 0.7], d: [0, 1], dl: [-0.7, 0.7], r: [1, 0.25], l: [-1, 0.25] }; const v = D[this._shadowDir] || D.dr; return { x: v[0] * 0.9, y: v[1] * 0.9 }; }
    // LIVE shadows — recomputed each frame from the moving sun/moon (day/night worlds).
    _drawShadows(ctx, S, cs, c0, c1, r0, r1) {
      const sh = OH_DAYNIGHT.shadow(this._tod, this._moonShadowScale); if (sh.alpha <= 0.01) return;
      const sc = this._shadowCanvas || (this._shadowCanvas = document.createElement('canvas'));
      if (sc.width !== CANVAS_W || sc.height !== CANVAS_H) { sc.width = CANVAS_W; sc.height = CANVAS_H; }
      const sx = sc.getContext('2d'); sx.clearRect(0, 0, CANVAS_W, CANVAS_H); sx.fillStyle = '#000';
      const cell = this.grid.cell, Q = OVERHEAD.elevOffset(cs);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const e = this._elev(c, r); if (e <= 0) continue;
        const base = S(c * cell, r * cell); this._castShadowCell(sx, base.x, base.y, e, this._key(c, r) === 'leaves', sh.x * e * cs, sh.y * e * cs, cs, Q); }
      for (const v of this._templateVoxels) { const base = S(v.col * cell, v.row * cell); this._castShadowCell(sx, base.x, base.y, v.elev, v.isLeaves, sh.x * v.elev * cs, sh.y * v.elev * cs, cs, Q); }   // template overlay voxels cast too
      if (this._gates) for (const gt of this._gates) { const h = Math.max(1, gt.height || 2); for (const c of [{ col: gt.col, row: gt.row }].concat(gt._cells || [])) { const base = S(c.col * cell, c.row * cell); this._castShadowCell(sx, base.x, base.y, h, false, sh.x * h * cs, sh.y * h * cs, cs, Q); } }   // swinging gates cast too
      sx.globalCompositeOperation = 'destination-out'; sx.fillStyle = '#000';
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const e = this._elev(c, r); if (e <= 0) continue;
        const base = S(c * cell, r * cell); this._eraseShadowCell(sx, base.x, base.y, e, this._key(c, r) === 'leaves', cs, Q); }
      for (const v of this._templateVoxels) { const base = S(v.col * cell, v.row * cell); this._eraseShadowCell(sx, base.x, base.y, v.elev, v.isLeaves, cs, Q); }
      if (this._gates) for (const gt of this._gates) { const h = Math.max(1, gt.height || 2); for (const c of [{ col: gt.col, row: gt.row }].concat(gt._cells || [])) { const base = S(c.col * cell, c.row * cell); this._eraseShadowCell(sx, base.x, base.y, h, false, cs, Q); } }
      sx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = sh.alpha;
      if ('filter' in ctx) ctx.filter = `blur(${Math.max(0.6, cs * 0.05)}px)`;
      ctx.drawImage(sc, 0, 0);
      if ('filter' in ctx) ctx.filter = 'none';
      ctx.globalAlpha = 1;
    }
    // STATIC shadows — baked ONCE in world space from a FIXED direction + darkness, then
    // blitted with the camera offset each frame (cheap: one drawImage). No day/night needed.
    _drawStaticShadows(ctx, cs) {
      const g = this.grid, cell = g.cell, z = g.masterZoom;
      if (!this._staticShadowCanvas) {
        const Q = OVERHEAD.elevOffset(cell), sh = this._fixedSh();
        let maxE = 0; for (let r = 0; r < g.gridH; r++) { const row = this.elevation[r]; if (row) for (let c = 0; c < g.gridW; c++) if ((row[c] | 0) > maxE) maxE = row[c] | 0; }
        for (const v of this._templateVoxels) if (v.elev > maxE) maxE = v.elev;   // template canopies can be the tallest thing
        const pad = Math.ceil(maxE * (Q + Math.max(Math.abs(sh.x), Math.abs(sh.y)) * cell) + cell);
        const worldW = g.gridW * cell, worldH = g.gridH * cell;
        const cv = document.createElement('canvas'); cv.width = Math.max(1, worldW + 2 * pad); cv.height = Math.max(1, worldH + 2 * pad);
        const sx = cv.getContext('2d'); sx.fillStyle = '#000';
        for (let r = 0; r < g.gridH; r++) for (let c = 0; c < g.gridW; c++) { const e = this._elev(c, r); if (e <= 0) continue;
          this._castShadowCell(sx, c * cell + pad, r * cell + pad, e, this._key(c, r) === 'leaves', sh.x * e * cell, sh.y * e * cell, cell, Q); }
        for (const v of this._templateVoxels) this._castShadowCell(sx, v.col * cell + pad, v.row * cell + pad, v.elev, v.isLeaves, sh.x * v.elev * cell, sh.y * v.elev * cell, cell, Q);
        sx.globalCompositeOperation = 'destination-out'; sx.fillStyle = '#000';
        for (let r = 0; r < g.gridH; r++) for (let c = 0; c < g.gridW; c++) { const e = this._elev(c, r); if (e <= 0) continue;
          this._eraseShadowCell(sx, c * cell + pad, r * cell + pad, e, this._key(c, r) === 'leaves', cell, Q); }
        for (const v of this._templateVoxels) this._eraseShadowCell(sx, v.col * cell + pad, v.row * cell + pad, v.elev, v.isLeaves, cell, Q);
        sx.globalCompositeOperation = 'source-over';
        this._staticShadowCanvas = cv; this._staticShadowPad = pad;
      }
      const cv = this._staticShadowCanvas, pad = this._staticShadowPad;
      // With a day/night cycle running, a baked shadow fades out at dusk and is GONE at
      // night (nothing is casting it) — see OH_DAYNIGHT.staticShadowFactor. With the
      // cycle off there is no time of day, so it stays at full strength as before.
      const lit = (this._dayNight && typeof OH_DAYNIGHT !== 'undefined') ? OH_DAYNIGHT.staticShadowFactor(this._tod) : 1;
      if (lit <= 0.01) return;
      ctx.globalAlpha = this._shadowDarkness * lit;
      if ('filter' in ctx) ctx.filter = `blur(${Math.max(0.6, cs * 0.05)}px)`;
      ctx.drawImage(cv, this.camera.x + pad, this.camera.y + pad, CANVAS_W / z, CANVAS_H / z, 0, 0, CANVAS_W, CANVAS_H);
      if ('filter' in ctx) ctx.filter = 'none';
      ctx.globalAlpha = 1;
    }

    // Night darkening with light-source cut-outs (glowstone / lava) + a faint sun/moon
    // disc. The darkening is composited offscreen so lamps can "punch through" it.
    _drawNight(ctx, S, cs) {
      const sk = OH_DAYNIGHT.sky(this._tod, this._nightMax), cell = this.grid.cell, maxR = 14 * cs;
      // Collect VISIBLE emitters, each with its own reach (universal range × this
      // object's brightness). Then STRIDE-sample so a big lava lake lights UNIFORMLY
      // (not just its top rows — the old row-major cap made the top glow, bottom dark)
      // within a bounded budget.
      // Static terrain emitters (glowstone/lava) + DYNAMIC powered redstone lamps.
      let emitters = this._lightCells;
      if (this._redstone.length && typeof OH_REDSTONE !== 'undefined') {
        const dyn = [];
        for (const d of this._redstone) {
          if ((d.kind === 'lamp' || d.kind === 'tx' || d.kind === 'rx') && OH_REDSTONE.cellPowered(this._rs, d.col, d.row))
            dyn.push({ c: d.col, r: d.row, color: this._lampLightColor, bri: this._lampBrightness });
        }
        if (dyn.length) emitters = emitters.concat(dyn);
      }
      const vis = [];
      for (const lc of emitters) {
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
      const Q = OVERHEAD.elevOffset(cs);
      for (const b of this._bridges) {
        const lv = b.elev | 0, closed = this._bridgeClosedAt(b._cells[0].col, b._cells[0].row);
        const rails = b.rail != null ? b.rail : this._bridgeGuardrails;
        if (b.draw && this._drawbridgeStyle === 'animated') {
          // Ease ONE phase for the whole span (0 down/closed .. 1 up/open) and raise
          // the entire deck as a single unit about its `from` hinge.
          const from = b.from || b._cells[0], key = from.col + ',' + from.row, target = closed ? 0 : 1;
          let p = this._dbPhase[key]; if (p == null) p = target; p += (target - p) * 0.16; if (Math.abs(target - p) < 0.01) p = target; this._dbPhase[key] = p;
          if (p < 0.03) this._drawFlatSpan(ctx, S, cs, b, lv, Q, rails);
          else this._drawRaisedSpan(ctx, S, cs, b, lv, Q, p);
        } else if (closed) { this._drawFlatSpan(ctx, S, cs, b, lv, Q, rails); }   // vanishing/static: deck only when closed
      }
    }
    _drawFlatSpan(ctx, S, cs, b, lv, Q, rails) {
      const g = this.grid, inSpan = (c, r) => this._bridgeAt.get(c + ',' + r) === b;
      // Rails belong on the LONG SIDES only — the ends are where you walk on and off, and
      // collision already allows that (G4 passes). Drawing an edge on every side with no
      // bridge neighbour put rails across the open ends too, so the deck looked sealed.
      // Zero the faces that lie ALONG the run. (QA F15.)
      const fc = b.from ? b.from.col : b.col, fr = b.from ? b.from.row : b.row;
      const tc = b.to ? b.to.col : fc, tr = b.to ? b.to.row : fr;
      const horizontal = Math.abs(tc - fc) >= Math.abs(tr - fr);
      for (const cell of b._cells) { const sp = S(cell.col * g.cell, cell.row * g.cell), x = sp.x - lv * Q, y = sp.y - lv * Q;
        const edges = { n: !inSpan(cell.col, cell.row - 1), s: !inSpan(cell.col, cell.row + 1), w: !inSpan(cell.col - 1, cell.row), e: !inSpan(cell.col + 1, cell.row) };
        if (horizontal) { edges.w = false; edges.e = false; } else { edges.n = false; edges.s = false; }
        OVERHEAD.drawBridgeCell(ctx, x, y, cs, { rail: rails, closed: true, edges });
      }
    }
    _drawRaisedSpan(ctx, S, cs, b, lv, Q, p) {
      const g = this.grid, from = b.from || b._cells[0], to = b.to || b._cells[b._cells.length - 1];
      const H0 = S((from.col + 0.5) * g.cell, (from.row + 0.5) * g.cell), F0 = S((to.col + 0.5) * g.cell, (to.row + 0.5) * g.cell);
      const H = { x: H0.x - lv * Q, y: H0.y - lv * Q }, F = { x: F0.x - lv * Q, y: F0.y - lv * Q };
      const dx = F.x - H.x, dy = F.y - H.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, px = -uy, py = ux;
      const fr = { x: H.x + ux * len * (1 - p * 0.85), y: H.y + uy * len * (1 - p * 0.85) - p * len * 0.7 };   // far end swings up toward the hinge
      const w0 = cs * 0.5, w1 = cs * 0.5 * (1 + p * 0.5);   // widen at the raised end (perspective)
      ctx.save(); ctx.fillStyle = '#7a5327'; ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(H.x + px * w0, H.y + py * w0); ctx.lineTo(H.x - px * w0, H.y - py * w0); ctx.lineTo(fr.x - px * w1, fr.y - py * w1); ctx.lineTo(fr.x + px * w1, fr.y + py * w1); ctx.closePath(); ctx.fill(); ctx.stroke();
      const N = Math.max(2, b._cells.length);
      for (let i = 1; i < N; i++) { const t = i / N, ax = H.x + (fr.x - H.x) * t, ay = H.y + (fr.y - H.y) * t, ww = w0 + (w1 - w0) * t; ctx.beginPath(); ctx.moveTo(ax + px * ww, ay + py * ww); ctx.lineTo(ax - px * ww, ay - py * ww); ctx.stroke(); }
      ctx.restore();
    }
    _drawRedstone(ctx, S, cs) {
      const g = this.grid, u = this.unit * (this.grid.masterZoom || 1);   // CHARACTER-relative size (density-independent)
      // Redstone visibility (play): 'always' shows everything; 'hidden' + 'active' hide
      // the WIRING / logic / passive sinks (dust, gates, lamp, piston, tx/rx) — operable
      // SOURCES (lever/button/plate/weight/lock) always stay visible so the player can
      // find + use them. 'active' reveals a wire once it is (or has ever been) powered.
      const HIDEABLE = { dust: 1, and: 1, not: 1, nor: 1, lamp: 1, piston: 1, tx: 1, rx: 1 };
      for (const d of this._redstone) {
        const sp = S((d.col + 0.5) * g.cell, (d.row + 0.5) * g.cell), tl = S(d.col * g.cell, d.row * g.cell);
        const on = OH_REDSTONE.cellPowered(this._rs, d.col, d.row);
        if (on) d._everOn = true;
        let alpha = 1;
        if (HIDEABLE[d.kind] && this._redstoneVis && this._redstoneVis !== 'always') {
          const revealed = this._redstoneVis === 'active' && (on || d._everOn);
          if (!revealed) { if (this._testMode) alpha = 0.28; else continue; }   // ghost in Test, gone in play
        }
        ctx.globalAlpha = alpha;
        if (d.kind === 'lever' || d.kind === 'button') OVERHEAD.drawLever(ctx, sp.x, sp.y, u * 0.9, !!d.on);   // ~2 character-blocks
        else if (d.kind === 'lock') OVERHEAD.drawLock(ctx, tl.x, tl.y, cs, on);
        else if (d.kind === 'dust') OVERHEAD.drawDust(ctx, tl.x, tl.y, cs, on);
        else if (d.kind === 'lamp') OVERHEAD.drawLamp(ctx, sp.x, sp.y, u * 0.8, on);
        else if (d.kind === 'plate' || d.kind === 'weight') OVERHEAD.drawPlate(ctx, sp.x, sp.y, u * 0.7, on, d.kind === 'weight');
        else if (d.kind === 'piston') OVERHEAD.drawPiston(ctx, tl.x, tl.y, cs, on, d.dir ? { dir: d.dir, ext: (d._phase || 0) * Math.max(1, d.reach || 2), Q: OVERHEAD.elevOffset(cs) } : null);
        else if (d.kind === 'and' || d.kind === 'not' || d.kind === 'nor') OVERHEAD.drawGate(ctx, tl.x, tl.y, cs, d.kind, on, d.inputs, d.outputs);
        else if (d.kind === 'tx' || d.kind === 'rx') { OVERHEAD.drawLamp(ctx, sp.x, sp.y, u * 0.7, on); ctx.fillStyle = '#fff'; ctx.font = `${Math.max(8, u * 0.5) | 0}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(d.kind === 'tx' ? '↑' : '↓', sp.x, sp.y); ctx.textBaseline = 'alphabetic'; }
      }
      ctx.globalAlpha = 1;
    }
    // Test-critical state readout (top-right) — mirrors the side-view perf HUD style.
    // Prioritises what a browser tester needs to VERIFY from a screenshot: player
    // elevation, keys held, live redstone channels, time-of-day, mode. ` toggles it.
    // Rolling frame-time window for the HUD. Only sampled while the HUD is up, so it
    // costs nothing in normal play. Reports the WORST recent frame as well as the average,
    // because a stutter that shows as "58 fps average" is still a stutter. (Kevin, build 347.)
    _sampleFrame() {
      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      if (this._fpsLast != null) {
        const dt = now - this._fpsLast;
        if (!this._fpsBuf) this._fpsBuf = [];
        this._fpsBuf.push(dt);
        if (this._fpsBuf.length > 60) this._fpsBuf.shift();
      }
      this._fpsLast = now;
    }
    _frameStats() {
      const b = this._fpsBuf;
      if (!b || b.length < 2) return null;
      let sum = 0, worst = 0;
      for (const d of b) { sum += d; if (d > worst) worst = d; }
      const avg = sum / b.length;
      return { fps: 1000 / avg, ms: avg, worstMs: worst, cells: this._visibleCells || 0 };
    }
    _drawDebugHUD(ctx) {
      const p = this.player, c = this._cellOf(p.x, p.y);
      const chans = (this._rs && this._rs.channels) ? Object.keys(this._rs.channels) : [];
      const tod = (this._dayNight && typeof OH_DAYNIGHT !== 'undefined') ? OH_DAYNIGHT.label(this._tod) + ' ' + this._tod.toFixed(2) : 'off';
      // Show ONLY "v3 build NNN" — never the whole GAME_VERSION string. The old split(' (')
      // assumed a "build N (note)" format; when the format changed AND the note grew to ~80k
      // chars this drew the entire changelog and buried the fps/frame/cells readout. Robust to
      // any format now. (QA, build 376.)
      const ver = (typeof GAME_VERSION === 'string') ? ((GAME_VERSION.match(/^v3 build \d+/) || [GAME_VERSION.slice(0, 40)])[0]) : 'overhead';
      const lines = [
        ver + '  · ' + this.mode + '  · ' + this.state,
        'map ' + this.grid.gridW + '×' + this.grid.gridH + ' d' + (this.map.density || 1) + '  zoom ' + (this.grid.masterZoom || 1).toFixed(2),
        'plr c' + c.col + ',r' + c.row + ' elev' + p.elev + ' hp' + p.hp + '/' + p.maxHp + ' wpn:' + (p.weapon || '-'),
        'keys: ' + ((p.keys && p.keys.length) ? p.keys.join(',') : '—') + '  sprint:' + (this._sprinting ? 'ON' : (this._sprint ? 'ready' : 'off')),
        'jumpClear ' + this._jumpClear + '+' + this._doubleJumpClear + '  day/night: ' + tod,
        'channels ON: ' + (chans.length ? chans.join(' ') : '—'),
      ];
      // Frame timing. Worst-frame matters as much as the average here: the reported
      // symptom was intermittent, and cells-on-screen is the number that explains it
      // (it grows as zoom^-2, so zooming out multiplies per-cell work).
      const fs = this._frameStats();
      // LIVE mob count (not the pre-launch estimate below): reflects runtime spawns, so a
      // debug/console-spawned mob actually shows up here. The estimate line's "mobs" is a
      // construction-time snapshot and does NOT update. (QA, build 377.)
      const liveMobs = (this.mobs || []).reduce((n, m) => n + (m.dead ? 0 : 1), 0);
      if (fs) lines.push('fps ' + fs.fps.toFixed(0) + '  frame ' + fs.ms.toFixed(1) + 'ms  worst ' + fs.worstMs.toFixed(1) + 'ms'
        + (fs.cells ? '  cells ' + fs.cells : '') + '  mobs ' + liveMobs);
      if (this._gov) lines.push('cap ' + this._gov.cap + 'fps  quality ' + this._gov.tierLabel()
        + (this._gov.enabled ? '' : ' (adaptive OFF)')
        + (this._gov.reason ? '  · ' + this._gov.reason : ''));
      if (this._perfEstimate) lines.push('estimate ' + this._perfEstimate.band + ' ~' + this._perfEstimate.fps + 'fps'
        + '  mobs ' + this._perfEstimate.mobs + '  dev ' + this._perfEstimate.devices);
      ctx.save(); ctx.font = '11px ui-monospace,monospace'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      let w = 0; for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
      const x = CANVAS_W - w - 12, y = 40;
      ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fillRect(x - 6, y - 4, w + 12, lines.length * 14 + 20);
      ctx.fillStyle = '#9fddff'; lines.forEach((l, i) => ctx.fillText(l, x, y + i * 14));
      ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillText('` toggles HUD', x, y + lines.length * 14 + 3);
      ctx.restore();
    }
    _drawHUD(ctx) {
      ctx.textAlign = 'left';
      if (this._debug) this._drawDebugHUD(ctx);   // frame sampling now happens in _loop, for the soak log
      // §modes versus — per-player readout (top-left): kills (deathmatch) or lives/out (last-standing).
      if (this._versusOn()) {
        const dm = this.settings.versusMode === 'deathmatch';
        const cols = ['#ffd24a', '#7fd0ff', '#9cff7f', '#ff9c9c'];   // P1-P4 accents
        const top = this._testMode ? 36 : 8;   // clear the Designer/God button row in Test mode
        ctx.save(); ctx.font = 'bold 12px sans-serif'; ctx.textBaseline = 'top';
        (this.players || []).forEach((p, i) => {
          const y = top + i * 18;
          ctx.fillStyle = 'rgba(10,14,24,.72)'; ctx.fillRect(8, y, 150, 16);
          ctx.fillStyle = cols[i] || '#fff';
          const tag = this.settings.versusTeams ? ('P' + (i + 1) + ' (T' + (p._team + 1) + ')') : ('P' + (i + 1));
          const k = p._score | 0, lv = p._lives | 0;
          const val = dm ? (k + (k === 1 ? ' kill' : ' kills')) : (p._out ? 'OUT' : (lv + (lv === 1 ? ' life' : ' lives')));
          ctx.fillText(tag + '  ' + val, 12, y + 2);
        });
        if (dm) { ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillText('first to ' + (((this.settings.versusKillTarget) | 0) || 10), 12, top + (this.players.length) * 18 + 2); }
        ctx.restore();
      }
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
      if (this.state === 'won' || this.state === 'dead' || this.state === 'paused') { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 30px sans-serif'; ctx.fillText(this.state === 'won' ? ((this._versusOn() && this._winnerMsg) ? this._winnerMsg : '★ Level Complete!') : this.state === 'dead' ? 'Game Over' : 'Paused', CANVAS_W / 2, CANVAS_H / 2 - 8); ctx.font = '15px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillText(this.state === 'paused' ? 'Esc to resume · click to exit' : 'Click / Enter to exit', CANVAS_W / 2, CANVAS_H / 2 + 24); }
    }

    // MEASURED performance for THIS world on THIS machine (build 371). Renders the real frame
    // ~N times per quality tier with the tier forced, timing each with performance.now, and
    // isolates the per-pass cost. Draw-only (_render mutates no game state), so re-drawing the
    // current frame many times is safe; the World Settings overlay covers the canvas so the
    // measurement flicker is not seen. Returns OH_PERF.assess()'s result plus the pure
    // estimate() for side-by-side. Restores state and paints one clean frame on the way out.
    measurePerformance(opts) {
      opts = opts || {};
      if (!this._terrainCache) this._bakeTerrainNow();   // measure the STEADY render, not the one-time chunked load
      this._didInitialLoad = true; this._loadZoom = null;
      const saved = this._measureCfg || null;
      const renderOnce = (cfg) => { this._measureCfg = cfg; this._render(); };
      let result;
      try { result = OH_PERF.assess(renderOnce, { frames: opts.frames || 45, warmup: opts.warmup || 6 }); }
      finally { this._measureCfg = saved; this._render(); }
      try {
        result.estimate = OH_PERF.estimate(
          { mapSnapshot: this.map, settings: this.settings, mobs: this.mobs, redstone: this._redstone },
          { zoom: this.grid.masterZoom, viewW: CANVAS_W, viewH: CANVAS_H });
      } catch (e) { /* estimate is a bonus; never let it break the measurement */ }
      return result;
    }
  }

  // Build a hidden, throwaway game just to measure a world's cost from the EDITOR (where no
  // game is running). Constructs in testMode, measures, and tears down. Any failure returns
  // null so the caller can fall back to the pure estimate — a measurement button must never
  // break the editor. (build 371)
  OverheadGame.measureWorld = function (world, opts) {
    let g = null;
    try {
      g = new OverheadGame(JSON.parse(JSON.stringify(world)), { testMode: true }, () => {});
      if (g._gov) g._gov.enabled = false;                        // don't let the governor move under us
      return g.measurePerformance(opts);
    } catch (e) { if (typeof console !== 'undefined') console.warn('measureWorld failed:', e); return null; }
    finally { try { if (g && g.destroy) g.destroy(); } catch (e) {} }
  };

  if (typeof window !== 'undefined') window.OverheadGame = OverheadGame;
})();
