// ============================================================
// bot-ai.js — Bot players (competitive + cooperative + companion)
// ------------------------------------------------------------
// A bot occupies a real PLAYER SLOT and drives SYNTHETIC INPUT through the same
// input.pXxx(i) pipeline a human's keyboard/gamepad feeds (see input.js
// `botInput`). It is NOT a separate entity type — so CTF carry rules, KOTH
// zone-standing, Tower damage, weapon traits, detection, friendly-fire, scoring,
// etc. all work for a bot automatically, because it is just another input source
// into code that already handles all of it.
//
// Two loops (same reasoning as Wayfinding's recompute cadence — deciding every
// frame is wasteful and looks jittery/indecisive):
//   • BRAIN  (periodic, difficulty.brainTick): read match state → pick a GOAL.
//   • ACT    (every frame): translate the goal into virtual input — path to the
//     goal cell via the Phase-0 pathfinder (js/pathfinding.js) + do the goal's
//     context action (attack nearest valid target, touch the hill, grab/return a
//     flag, damage a tower, collect an emerald…).
//
// STRATEGY is keyed to the Arena Rules Engine's declared ELEMENTS
// (elements.hill / .flags / .tower / .emeralds / waves / pvp), NOT to mode names
// — so Custom Rules get bot support for free (Phase 6). Difficulty is a set of
// REAL WIRED PARAMETERS (constants.js BOT_DIFFICULTY_PRESETS), not hardcoded
// behaviour — Kevin chose per-bot difficulty.
//
// Everything is OPT-IN: no controller is created unless a match is configured
// with bots, so human-only play is byte-identical.
// ============================================================

const BOT_AI = {
  // Build a `nav` adapter over the live Level for the shared pathfinder — SAME
  // model the mobs use (js/mobs.js `_navFor`): (c,r)=(col,row); OOB = wall; lava
  // is a hazard a bot must never route through; jump pads extend the envelope.
  buildNav(level) {
    return {
      W: level.width, H: level.height,
      solid:  (c, r) => level.isSolid(r, c),
      hazard: (c, r) => level.get(r, c) === BLOCK.LAVA,
      pad:    (c, r) => level.get(r, c) === BLOCK.JUMP_PAD,
    };
  },

  // Feet cell of an actor (player or mob): the air cell just above its support.
  cellOf(e) {
    return [Math.floor(e.cx / BLOCK_SIZE), Math.floor((e.y + e.height - 1) / BLOCK_SIZE)];
  },

  // Steer an actor along a cached A* route → { dir:-1|0|1, jump:bool }. Mirrors
  // the mob `_followPath` model, adapted for a ~2-block player: a player can't
  // auto-step reliably in every world (autoStepUp is per-world), so it jumps for
  // ANY rise (>=1) directly ahead as well as for a gap. Over-hopping a 1-block
  // step is harmless; hanging on it is not.
  navFollow(actor, path, nav) {
    if (!path || path.length < 2) return { dir: 0, jump: false };
    let idx = 0, best = Infinity;
    for (let i = 0; i < path.length; i++) {
      const dx = (path[i][0] + 0.5) * BLOCK_SIZE - actor.cx;
      const dy = (path[i][1] + 0.5) * BLOCK_SIZE - actor.cy;
      const d = dx * dx + dy * dy;
      if (d < best) { best = d; idx = i; }
    }
    const tIdx = Math.min(idx + 1, path.length - 1);
    const [tc, tr] = path[tIdx];
    const tx = (tc + 0.5) * BLOCK_SIZE;
    let dir = Math.sign(tx - actor.cx);
    if (dir === 0) {
      const nc2 = path[Math.min(tIdx + 1, path.length - 1)][0];
      dir = Math.sign((nc2 + 0.5) * BLOCK_SIZE - actor.cx) || (actor.facing || 1);
    }
    const cc = Math.floor(actor.cx / BLOCK_SIZE);
    const cr = Math.floor((actor.y + actor.height - 1) / BLOCK_SIZE);
    const rise = cr - tr;                     // >0 = target cell is above us
    const nearCol = Math.abs(tx - actor.cx) < 1.9 * BLOCK_SIZE;
    let jump = false;
    if (rise >= 1 && nearCol) {
      jump = true;                            // climb a step/ledge ahead
    } else if (nav && !nav.solid(cc + dir, cr + 1) && tr <= cr + 1 && nearCol) {
      jump = true;                            // gap directly ahead → hop it
    }
    return { dir, jump };
  },

  // Which arena ELEMENTS are active for this match (the same ruleset a mode is
  // defined by — the roadmap's "the system that defines modes tells a bot how to
  // play them"). Falls back to a permissive default so a bot is never inert.
  elementsFor(game) {
    try {
      if (typeof ARENA_RULES !== 'undefined' && game.arenaConfig && game.arenaConfig.arenaGameMode) {
        const rs = ARENA_RULES.rulesetForMode(game.arenaConfig.arenaGameMode, game.arenaConfig);
        if (rs && rs.elements) return rs.elements;
      }
    } catch (e) { /* fall through to default */ }
    return { pvp: true };
  },
};

// ── A single bot, bound to one player slot ──────────────────
class BotController {
  // role: 'competitive' (arena solo), 'coop' (arena team), 'companion' (friendly
  // follower in Platformer/Normal/Campaign). difficultyKey: EASY|MEDIUM|HARD.
  constructor(game, index, role, difficultyKey) {
    this.game  = game;
    this.index = index;
    this.role  = role || 'competitive';
    this.difficultyKey = (difficultyKey && BOT_DIFFICULTY_PRESETS[difficultyKey]) ? difficultyKey : BOT_DEFAULT_DIFFICULTY;
    this.diff  = BOT_DIFFICULTY_PRESETS[this.difficultyKey];

    // Persistent synthetic-input object handed to InputManager each frame.
    this._input = { moveX: 0, jump: false, crouch: false, attack: false,
                    aimX: 0, aimY: 0, gpSlot: 0, buttons: {} };

    // Brain / actuator state
    this.goal = null;                 // { kind, cell, targetId, action, reason }
    this._brainTimer = 0;
    this._path = null;
    this._pathTimer = 0;
    this._pathGoalCell = null;
    this._acquireFrame = -9999;       // when the current target was first locked (reaction delay)
    this._aimNoise = 0;
    this._aimNoiseTimer = 0;
    this._hpWas = null;
    this._threatenedBy = null;        // ownerId that recently damaged us
    this._threatenedTimer = 0;
    this._noProgress = 0;
    this._lastX = null;

    // Telemetry (Phase 7) — a compact sampled decision trace + running stats.
    // Filled here; the game exports it. Kept lightweight (one push per brain tick).
    this.telemetry = { decisions: [], goalCounts: {} };
  }

  get player() { return this.game.getPlayer(this.index); }
  get ownerId() { return Game.ownerId(this.index); }

  // Called every frame by the game, before player/combat updates consume input.
  tick() {
    const p = this.player;
    const g = this.game;
    // Dead / respawning / match not live → hand a neutral input (no-op).
    if (!p || (g._respawnTimers && g._respawnTimers[this.index] > 0) || p.hp <= 0 || g.state !== 'playing') {
      this._neutral();
      g.input.setBotInput(this.index, this._input);
      return;
    }

    // recentDamage tracking (drives the threat blend): if our hp dropped, credit
    // the nearest opponent as "threatened by" for a window.
    if (this._hpWas != null && p.hp < this._hpWas) {
      const near = this._nearestOpponent();
      if (near) { this._threatenedBy = near._ownerId; this._threatenedTimer = BOT_THREAT_RECENT_FRAMES; }
    }
    this._hpWas = p.hp;
    if (this._threatenedTimer > 0 && --this._threatenedTimer === 0) this._threatenedBy = null;

    // BRAIN — periodic decision.
    if (--this._brainTimer <= 0) {
      this._brainTimer = this.diff.brainTick;
      this._think();
    }
    // ACT — every frame.
    this._act();
    g.input.setBotInput(this.index, this._input);
  }

  _neutral() {
    const i = this._input;
    i.moveX = 0; i.jump = false; i.crouch = false; i.attack = false;
    i.aimX = 0; i.aimY = 0; i.buttons = {};
  }

  // ── BRAIN: pick a goal keyed on the active ruleset elements ──
  _think() {
    const el = BOT_AI.elementsFor(this.game);
    let goal = null;

    // Element-priority dispatch. Phase 1 implements the pvp/kills strategy + a
    // hunt fallback; Phase 2 fills in hill/flags/tower/emeralds/waves. Ordering
    // is by "what wins the match": objective elements first, then kills.
    if (el.flags)         goal = this._goalFlags(el);
    else if (el.hill)     goal = this._goalHill(el);
    else if (el.tower)    goal = this._goalTower(el);
    else if (el.emeralds) goal = this._goalEmeralds(el);
    else if (el.waves)    goal = this._goalWaves(el);
    if (!goal && (el.pvp || el.kills !== false)) goal = this._goalKills(el);
    if (!goal) goal = this._goalIdle();

    // Record a compact decision-trace sample (Phase 7).
    this.goal = goal;
    this.telemetry.goalCounts[goal.kind] = (this.telemetry.goalCounts[goal.kind] || 0) + 1;
    this.telemetry.decisions.push({
      frame: this.game.frameCount | 0,
      kind: goal.kind, reason: goal.reason || '',
      target: goal.targetId || null,
      cell: goal.cell ? [goal.cell[0], goal.cell[1]] : null,
    });
    // Cap the in-memory trace (the exporter flushes; this is a safety bound).
    if (this.telemetry.decisions.length > 4000) this.telemetry.decisions.splice(0, 2000);
  }

  // ── Phase 1: kills / PvP ─────────────────────────────────
  // Highest-threat BLEND (Kevin's choice) among valid opponents in detect range;
  // if none in range, HUNT the nearest opponent (close the distance) so a bot is
  // never passive while enemies live.
  _goalKills(el) {
    const target = this._pickThreatTarget();
    if (target) {
      const cell = BOT_AI.cellOf(target);
      return { kind: 'engage', cell, targetId: target._ownerId || ('mob' + target.id),
               targetRef: target, action: 'combat', reason: 'highest-threat opponent' };
    }
    const hunt = this._nearestOpponent();
    if (hunt) {
      return { kind: 'hunt', cell: BOT_AI.cellOf(hunt), targetId: hunt._ownerId,
               targetRef: hunt, action: 'combat', reason: 'closing on nearest opponent' };
    }
    // No living opponents (all respawning) → also hunt mobs if this mode scores them.
    return this._goalIdle();
  }

  // ── Phase 2 element strategies (stubs filled in Phase 2) ──
  _goalHill(el)     { return null; }
  _goalFlags(el)    { return null; }
  _goalTower(el)    { return null; }
  _goalEmeralds(el) { return null; }
  _goalWaves(el)    { return null; }

  _goalIdle() {
    // Drift toward the arena centre so idle bots don't clump at a wall.
    const W = this.game.level.width;
    const p = this.player;
    const midCol = Math.floor(W / 2);
    const myCol = Math.floor(p.cx / BLOCK_SIZE);
    const cell = [myCol + Math.sign(midCol - myCol) * 4, Math.floor((p.y + p.height - 1) / BLOCK_SIZE)];
    return { kind: 'idle', cell, targetId: null, targetRef: null, action: null, reason: 'no target — recentre' };
  }

  // ── ACT: translate goal → virtual input every frame ─────────
  _act() {
    const i = this._input;
    i.moveX = 0; i.jump = false; i.crouch = false; i.attack = false; i.buttons = {};
    const g = this.game, p = this.player, goal = this.goal;
    if (!goal) return;

    // 1) Combat — aim + fire if we have a live combat target in range.
    const tgt = goal.targetRef;
    let engaging = false;
    if (goal.action === 'combat' && tgt && (tgt.hp === undefined || tgt.hp > 0)) {
      engaging = this._combat(tgt);
    }

    // 2) Movement — path toward the goal cell (unless we're at melee range and
    //    kiting is not needed). Recompute the route on the difficulty cadence.
    if (goal.cell) {
      const [gc, gr] = goal.cell;
      const myCol = Math.floor(p.cx / BLOCK_SIZE);
      const myRow = Math.floor((p.y + p.height - 1) / BLOCK_SIZE);
      const distBlocks = Math.abs(gc - myCol) + Math.abs(gr - myRow);
      const reach = goal.action === 'combat' ? this._preferredRange(tgt) : BOT_OBJECTIVE_REACH_BLOCKS;
      if (distBlocks > reach) {
        this._pathToward(gc, gr);
        const nav = this._nav();
        const step = BOT_AI.navFollow(p, this._path, nav);
        this._applyMove(step);
      } else {
        // Arrived: hold position (or strafe a touch during combat — kept simple).
        this._noProgress = 0;
      }
    }
    // Face the combat target even while stationary (for melee + reticle).
    if (engaging && tgt) i.moveX = i.moveX; // no-op; aim already set facing via attack block
  }

  _applyMove(step) {
    const i = this._input;
    let dir = step.dir || 0;
    // navPrecision: Easy bots occasionally drop an input frame / ease off full
    // speed, so movement looks less robotic and is a touch less effective.
    let mag = this.diff.alwaysRun ? 1 : (0.55 + 0.45 * this.diff.navPrecision);
    if (!this.diff.alwaysRun && this._frac() > this.diff.navPrecision) mag *= 0.4;
    i.moveX = dir * mag;
    if (step.jump) i.jump = true;
    // Track progress to detect being stuck (drives loseInterest re-decide).
    if (this._lastX != null && Math.abs(this.player.cx - this._lastX) < 0.4) {
      if (++this._noProgress > this.diff.loseInterest) { this._path = null; this._pathTimer = 0; this._noProgress = 0; this._brainTimer = 0; }
    } else this._noProgress = 0;
    this._lastX = this.player.cx;
  }

  // Path to (gc,gr), cached + recomputed on the difficulty cadence, invalidated
  // when the goal cell moves. Graceful null → no move (bot holds) rather than a
  // beeline into a wall.
  _pathToward(gc, gr) {
    const p = this.player;
    const [cc, cr] = BOT_AI.cellOf(p);
    const goalMoved = !this._pathGoalCell || Math.abs(this._pathGoalCell[0] - gc) > 1 || Math.abs(this._pathGoalCell[1] - gr) > 1;
    const stale = !this._path || this._path.length < 2 || --this._pathTimer <= 0 || goalMoved;
    if (stale) {
      const radius = Math.min(BOT_PATH_MAX_RADIUS, Math.max(16, this.diff.detectRange + 8));
      const res = (typeof findMobPath === 'function')
        ? findMobPath(this._nav(), [cc, cr], [gc, gr], { maxRadius: radius, maxExpansions: BOT_PATH_MAX_EXPANSIONS })
        : null;
      this._pathTimer = this.diff.navRecompute;
      this._pathGoalCell = [gc, gr];
      this._path = res ? res.path : null;
    }
  }

  // Combat: aim at target (+ difficulty aim error) and fire the bow (charge to
  // fireChargeMin then release). Returns true if actively engaging. Honors a
  // per-target reaction delay so a bot doesn't snap-fire the instant it decides.
  _combat(tgt) {
    const g = this.game, p = this.player, i = this._input;
    const dx = tgt.cx - p.cx, dy = tgt.cy - p.cy;
    const distBlocks = Math.hypot(dx, dy) / BLOCK_SIZE;
    if (distBlocks > this.diff.detectRange) return false;

    // Reaction delay after (re)acquiring this target.
    if (this.goal.targetId !== this._lockedId) { this._lockedId = this.goal.targetId; this._acquireFrame = g.frameCount | 0; }
    if (((g.frameCount | 0) - this._acquireFrame) < this.diff.reactionFrames) return true; // "seeing" it, not yet acting

    // Aim vector with resampled error.
    if (--this._aimNoiseTimer <= 0) { this._aimNoiseTimer = this.diff.aimJitter; this._aimNoise = (this._frac() * 2 - 1) * this.diff.aimError; }
    const ang = Math.atan2(dy, dx) + this._aimNoise;
    i.aimX = Math.cos(ang); i.aimY = Math.sin(ang);
    p.facing = Math.cos(ang) >= 0 ? 1 : -1;

    if (p.bow) {
      // Charge to the difficulty's min, then release ONE frame to fire. (We read
      // last frame's drawProgress; the combat block runs after us — one-frame lag.)
      if ((p.drawProgress || 0) >= this.diff.fireChargeMin) { i.attack = false; }
      else { i.attack = true; }
    } else {
      // Melee: hold attack when in reach.
      i.attack = distBlocks <= BOT_MELEE_RANGE_BLOCKS;
    }
    return true;
  }

  _preferredRange(tgt) {
    // Archer bot approaches to a comfortable firing distance (~9 blocks) then
    // holds/fires; a melee bot closes all the way. Capped by detectRange so a
    // short-sighted Easy bot still approaches rather than freezing far out.
    if (this.player && this.player.bow) return Math.min(this.diff.detectRange, BOT_ARCHER_RANGE_BLOCKS);
    return BOT_MELEE_RANGE_BLOCKS;
  }

  // ── Target queries ───────────────────────────────────────
  _opponents() {
    const g = this.game, me = this.player;
    const out = [];
    for (const p of g.activePlayers()) {
      if (p === me) continue;
      if (p.hp <= 0) continue;
      // Team check (Phase 3): skip teammates.
      if (me.teamId != null && p.teamId === me.teamId) continue;
      out.push(p);
    }
    return out;
  }

  _nearestOpponent() {
    const me = this.player; let best = null, bd = Infinity;
    for (const o of this._opponents()) {
      const d = Math.hypot(o.cx - me.cx, o.cy - me.cy);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  // Highest-threat opponent within detect range (configurable blend).
  _pickThreatTarget() {
    const me = this.player;
    const range = this.diff.detectRange * BLOCK_SIZE;
    const W = BOT_THREAT_WEIGHTS;
    let best = null, bestScore = -Infinity;
    for (const o of this._opponents()) {
      const dist = Math.hypot(o.cx - me.cx, o.cy - me.cy);
      if (dist > range) continue;
      const nearness = 1 - dist / range;                        // 1 point-blank → 0 at range
      const hpFrac = o.maxHp ? Math.max(0, Math.min(1, o.hp / o.maxHp)) : 1;
      const hitMe = (this._threatenedBy && o._ownerId === this._threatenedBy) ? 1 : 0;
      const score = W.proximity * nearness + W.lowHp * (1 - hpFrac) + W.recentDamage * hitMe;
      if (score > bestScore) { bestScore = score; best = o; }
    }
    return best;
  }

  // Deterministic-ish pseudo-random in [0,1) that varies per bot + frame without
  // Math.random (kept cheap; used for aim noise + move jitter).
  _frac() {
    this._rngS = (this._rngS || (this.index * 2654435761 + 12345)) >>> 0;
    this._rngS = (this._rngS * 1664525 + 1013904223 + (this.game.frameCount | 0)) >>> 0;
    return (this._rngS & 0xffff) / 0x10000;
  }

  _nav() {
    if (!this._navCache || this._navFrame !== (this.game.frameCount | 0)) {
      this._navCache = BOT_AI.buildNav(this.game.level);
      this._navFrame = this.game.frameCount | 0;
    }
    return this._navCache;
  }
}

// Node export for headless tests (browser uses the script-scope globals).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BOT_AI, BotController };
}
