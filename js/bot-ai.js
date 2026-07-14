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
    // Can't rise with a ceiling on the head (a 2-tall body's head is at cr-1; it
    // rises into cr-2). Don't jump into an overhang — keep walking so the route can
    // carry us out from under it. (The pathfinder already avoids routing UP from
    // here; this stops a wasted bonk if we're momentarily under the canopy.)
    const canRise = !nav || !nav.solid(cc, cr - 2);
    let jump = false;
    if (rise >= 1 && nearCol && canRise) {
      jump = true;                            // climb a step/ledge ahead
    } else if (nav && !nav.solid(cc + dir, cr + 1) && tr <= cr + 1 && nearCol && canRise) {
      jump = true;                            // gap directly ahead → hop it
    }
    return { dir, jump };
  },

  // Companion loot priority (Q3): the PLAYER always gets first pick. A placed item
  // is companion-eligible only after it has been AVAILABLE (uncollected, with the
  // companion nearby) for BOT_COMPANION_LOOT_DELAY frames AND the player is not the
  // closer one (i.e. the player passed it / isn't heading for it). This guarantees
  // "the player never loses an item to the bot that they wanted." (The second half
  // of Q3 — auto-handing a REDUNDANT pickup to the companion — lives in game.js's
  // _collectPlatformerItem, where the player's would-be pickup is evaluated.)
  companionShouldGrab(game, companion, item, framesExposed) {
    if (!companion || !item || item.collected) return false;
    if ((framesExposed || 0) < BOT_COMPANION_LOOT_DELAY) return false;
    const leader = game.getPlayer(0);
    if (leader) {
      const dL = Math.hypot(leader.cx - item.wx, (leader.y + leader.height / 2) - item.wy);
      const dC = Math.hypot(companion.cx - item.wx, (companion.y + companion.height / 2) - item.wy);
      if (dL <= dC) return false;            // player is closer / heading for it → theirs
    }
    return true;
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
    let goal;
    if (this.role === 'companion') {
      // Phase 4 — friendly follower (Platformer/Normal/Campaign). Fights MOBS,
      // never the player; follows within a proximity band.
      goal = this._thinkCompanion();
    } else {
      const el = BOT_AI.elementsFor(this.game);
      // Element-priority dispatch — bots read the SAME ruleset that DEFINES the
      // mode (Custom Rules → free support). Element KEYS are the Arena Rules Engine's
      // own: ctf / hill / towers / emeralds / waveSpawns|bots|spawnEggs (mobs) / pvp.
      // "Position" objectives first, then collectibles, then mobs, then kills; each
      // is skipped when there's nothing to act on (so a mixed ruleset falls through).
      goal = null;
      if (el.ctf)                      goal = this._goalFlags(el);
      if (!goal && el.hill)            goal = this._goalHill(el);
      if (!goal && el.towers)          goal = this._goalTower(el);
      if (!goal && el.emeralds && this._liveEmeralds().length) goal = this._goalEmeralds(el);
      if (!goal && (el.waveSpawns || el.bots || el.spawnEggs) && this._hasLiveMobs()) goal = this._goalWaves(el);
      if (!goal && el.pvp && this._opponents().length) goal = this._goalKills(el);
      if (!goal) goal = this._goalIdle();
      // Phase 3 — co-op coordination: complementary roles (simple heuristics).
      goal = this._coopAdjust(goal, el);
    }

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
      return { kind: 'engage', cell, approach: 'range', targetId: target._ownerId,
               targetRef: target, action: 'combat', reason: 'highest-threat opponent' };
    }
    const hunt = this._nearestOpponent();
    if (hunt) {
      return { kind: 'hunt', cell: BOT_AI.cellOf(hunt), approach: 'range', targetId: hunt._ownerId,
               targetRef: hunt, action: 'combat', reason: 'closing on nearest opponent' };
    }
    return this._goalIdle();
  }

  // ── Phase 2: HILL (King of the Hill — 3 scoring sub-modes) ──
  // The three sub-modes want DIFFERENT tactics (brief §2):
  //   ALL     — everyone present scores → just BE on the hill (presence).
  //   STICKY  — hold ground once captured, even contested → stay ON + fight off.
  //   SOLE    — only the sole occupant scores → DISPLACE the current occupant.
  _goalHill(el) {
    const h = this._hillInfo();
    if (!h) return this._goalKills(el);
    const me = this.player;
    const onHill = this._onHill(h, me);
    const submode = ((this.game.arenaConfig && this.game.arenaConfig.kothScoring) || 'STICKY').toUpperCase();
    const occupants = this._hillOccupants(h);
    const enemiesOnHill = occupants.filter(p => p !== me && !(me.teamId != null && p.teamId === me.teamId));

    if (!onHill) {
      // Approach the hill; shoot opportunistically at whoever's in the way.
      return { kind: 'hill-approach', cell: h.cell, approach: 'reach',
               targetRef: this._nearestOpponentInRange(), action: 'combat',
               targetId: 'hill', reason: 'moving to the hill' };
    }
    // On the hill. SOLE must drive off any contester; STICKY holds + fights;
    // ALL just stays present (still defends if shot at).
    let tref = null, why = 'holding the hill';
    if (submode === 'SOLE' && enemiesOnHill.length) { tref = this._nearest(enemiesOnHill); why = 'displacing the hill occupant'; }
    else { tref = this._nearestOpponentInRange(); why = submode === 'ALL' ? 'present on the hill' : 'holding the hill'; }
    return { kind: 'hill-hold', cell: h.cell, approach: 'reach', targetRef: tref,
             action: tref ? 'combat' : null, targetId: 'hill', reason: why };
  }

  // ── Phase 2: FLAGS (Capture the Flag) ──
  // Carrying → run it home; else grab a free enemy flag; else (teammate has it,
  // or our flag is out) defend/recover. Grab + capture are proximity-automatic in
  // CTF_SYSTEM, so the bot just needs to REACH the right cell. Co-op refinement of
  // "who does what" is Phase 3 — this is the solo-correct baseline.
  _goalFlags(el) {
    if (typeof CTF_SYSTEM === 'undefined' || !CTF_SYSTEM.flags) return this._goalKills(el);
    const me = this.player;
    if (me.teamId == null) return this._goalKills(el);
    const myFlag    = CTF_SYSTEM.flags.find(f => f.team === me.teamId);
    const enemyFlag = CTF_SYSTEM.flags.find(f => f.team !== me.teamId);

    // 1) I'm carrying the enemy flag → capture at my base.
    if (CTF_SYSTEM.isCarrying(me) && CTF_SYSTEM.bases && CTF_SYSTEM.bases[me.teamId]) {
      const b = CTF_SYSTEM.bases[me.teamId];
      return { kind: 'flag-capture', cell: this._cellAtPx(b.x, b.y), approach: 'reach',
               targetRef: null, action: null, targetId: 'base', reason: 'carrying flag home' };
    }
    // 2) Enemy flag free (home/dropped, not carried by anyone) → go grab it.
    if (enemyFlag && !enemyFlag.carriedBy) {
      return { kind: 'flag-grab', cell: this._cellAtPx(enemyFlag.x, enemyFlag.y), approach: 'reach',
               targetRef: this._nearestOpponentInRange(), action: 'combat', targetId: 'enemyFlag',
               reason: 'going for the enemy flag' };
    }
    // 3) A teammate has the enemy flag, or our flag is out. If an ENEMY is carrying
    //    our flag → hunt that carrier to drop it; else defend near our base.
    if (myFlag && myFlag.carriedBy && !(me.teamId != null && myFlag.carriedBy.teamId === me.teamId)) {
      const carrier = myFlag.carriedBy;
      return { kind: 'flag-defend', cell: BOT_AI.cellOf(carrier), approach: 'range',
               targetRef: carrier, action: 'combat', targetId: carrier._ownerId, reason: 'chasing our flag carrier' };
    }
    if (CTF_SYSTEM.bases && CTF_SYSTEM.bases[me.teamId]) {
      const b = CTF_SYSTEM.bases[me.teamId];
      return { kind: 'flag-escort', cell: this._cellAtPx(b.x, b.y), approach: 'reach',
               targetRef: this._nearestOpponentInRange(), action: 'combat', targetId: 'defend', reason: 'defending base (teammate has the flag)' };
    }
    return this._goalKills(el);
  }

  // ── Phase 2: TOWER (Defend the Tower) ──
  // Balance attacking the nearest enemy tower against defending our own. Baseline
  // solo: attack the nearest live enemy tower; but if our tower is badly hurt AND
  // an enemy is near it, switch to defend. Co-op splits attack/defend in Phase 3.
  _goalTower(el) {
    if (typeof TOWER_SYSTEM === 'undefined' || !TOWER_SYSTEM.towers) return this._goalKills(el);
    const me = this.player;
    const mine  = TOWER_SYSTEM.towers.filter(t => this._ownsTower(t) && t.hp > 0);
    const enemy = TOWER_SYSTEM.towers.filter(t => !this._ownsTower(t) && t.hp > 0);

    // Defend trigger: our tower is <=1/3 and an enemy stands near it.
    for (const t of mine) {
      if (t.hp <= Math.max(1, t.maxHp / 3)) {
        const threat = this._nearestOpponentNearPx(t.x + t.w / 2, t.y + t.h / 2, 8);
        if (threat) return { kind: 'tower-defend', cell: BOT_AI.cellOf(threat), approach: 'range',
                             targetRef: threat, action: 'combat', targetId: threat._ownerId, reason: 'defending our tower' };
      }
    }
    // Attack: nearest enemy tower (aim + fire arrows at it).
    if (enemy.length) {
      const t = this._nearestPx(enemy.map(t => ({ ref: t, x: t.x + t.w / 2, y: t.y + t.h / 2 })));
      const tower = t.ref;
      return { kind: 'tower-attack', cell: this._cellAtPx(tower.x + tower.w / 2, tower.y + tower.h / 2),
               approach: 'range', targetRef: { cx: tower.x + tower.w / 2, cy: tower.y + tower.h / 2, hp: tower.hp },
               action: 'combat', targetId: 'tower:' + tower.ownerId, reason: 'attacking enemy tower' };
    }
    return this._goalKills(el);
  }

  // ── Phase 2: EMERALDS (Collect Emeralds) ──
  // Navigate to the nearest uncollected emerald (pickup is proximity-automatic).
  // Difficulty scaling (imprecise nav / smaller detect on Easy) is Phase 5.
  _goalEmeralds(el) {
    const live = this._liveEmeralds();
    if (!live.length) return this._goalKills(el);
    const me = this.player;
    let best = null, bd = Infinity;
    for (const e of live) { const d = Math.hypot(e.wx - me.cx, e.wy - me.cy); if (d < bd) { bd = d; best = e; } }
    if (!best) return this._goalIdle();
    return { kind: 'emerald', cell: this._cellAtPx(best.wx, best.wy), approach: 'reach',
             targetRef: null, action: null, targetId: 'emerald', reason: 'nearest emerald' };
  }

  // ── Phase 2: WAVES / MOBS (Survival Waves, Mob Hunter) ──
  // Engage the nearest live mob. Mob Hunter (Q4): higher aggression makes the bot
  // COMPETE for kills — bias toward mobs an opponent is also close to (race to the
  // kill), NOT toward attacking players (Mob Hunter is not PvP).
  _goalWaves(el) {
    const mob = this._pickMob();
    if (!mob) return this._goalIdle();
    return { kind: 'mob', cell: BOT_AI.cellOf(mob), approach: 'range', targetRef: mob,
             action: 'combat', targetId: 'mob' + mob.id, reason: 'engaging nearest mob' };
  }

  // ── Phase 4: COMPANION (friendly follower) ──────────────────
  // Fights hostile MOBS (never the player), and follows the human within a
  // proximity band. Hazard-safety is inherent — the pathfinder never routes
  // through lava/void (same reachability model as the Speed-Run validator).
  _thinkCompanion() {
    const leader = this.game.getPlayer(0);            // the human is always P1
    // 1) Threat: nearest hostile mob in detect range → engage it.
    const mob = this._nearestMobInRange();
    if (mob) return { kind: 'companion-fight', cell: BOT_AI.cellOf(mob), approach: 'range',
                      targetRef: mob, action: 'combat', targetId: 'mob' + mob.id, reason: 'defending against a mob' };
    // 2) Follow the leader within a band (hysteresis so it doesn't jitter at the edge).
    if (!leader) return this._goalIdle();
    const dist = Math.hypot(leader.cx - this.player.cx, leader.cy - this.player.cy) / BLOCK_SIZE;
    if (dist > BOT_FOLLOW_FAR) this._catchingUp = true;
    else if (dist < BOT_FOLLOW_NEAR) this._catchingUp = false;
    if (this._catchingUp) {
      return { kind: 'companion-follow', cell: BOT_AI.cellOf(leader), approach: 'range',
               reachBlocks: BOT_FOLLOW_NEAR, targetRef: null, action: null, targetId: 'leader',
               reason: 'catching up to the player' };
    }
    return { kind: 'companion-idle', cell: null, targetRef: null, action: null, targetId: null, reason: 'staying near the player' };
  }
  _nearestMobInRange() {
    const mm = this.game.mobManager; if (!mm || !mm.mobs) return null;
    const me = this.player, r = this.diff.detectRange;
    let best = null, bd = Infinity;
    for (const m of mm.mobs) { if (!m.alive || m.hp <= 0) continue; const d = Math.hypot(m.cx - me.cx, m.cy - me.cy) / BLOCK_SIZE; if (d <= r && d < bd) { bd = d; best = m; } }
    return best;
  }

  _goalIdle() {
    // Drift toward the arena centre so idle bots don't clump at a wall.
    const W = this.game.level.width;
    const p = this.player;
    const midCol = Math.floor(W / 2);
    const myCol = Math.floor(p.cx / BLOCK_SIZE);
    const cell = [myCol + Math.sign(midCol - myCol) * 4, Math.floor((p.y + p.height - 1) / BLOCK_SIZE)];
    return { kind: 'idle', cell, targetId: null, targetRef: null, action: null, reason: 'no target — recentre' };
  }

  // ── Phase 3: co-op coordination (simple heuristics; NOT deep planning) ──
  // Reads teammate state the same way for bots (their live goal) and humans
  // (inferred from CTF/tower/position state). Only avoids DUPLICATE effort and
  // nudges toward a complementary role — no comms protocol, no counter-strategy.
  _coopAdjust(goal, el) {
    const me = this.player;
    if (me.teamId == null) return goal;             // FFA — every bot for itself
    const mates = this._teammates();
    if (!mates.length) return goal;

    // CTF: don't both chase the same free enemy flag — the farther bot defends.
    if (goal.kind === 'flag-grab') {
      const ef = (typeof CTF_SYSTEM !== 'undefined' && CTF_SYSTEM.flags) ? CTF_SYSTEM.flags.find(f => f.team !== me.teamId) : null;
      if (ef) {
        const myD = Math.hypot(ef.x - me.cx, ef.y - me.cy);
        const someoneBetter = mates.some(t => {
          const c = this._peerController(t);
          const committed = c ? (c.goal && (c.goal.kind === 'flag-grab' || c.goal.kind === 'flag-capture'))
                              : (typeof CTF_SYSTEM !== 'undefined' && CTF_SYSTEM.isCarrying && CTF_SYSTEM.isCarrying(t)); // human carrying
          return committed && Math.hypot(ef.x - t.cx, ef.y - t.cy) <= myD;
        });
        if (someoneBetter && CTF_SYSTEM.bases && CTF_SYSTEM.bases[me.teamId]) {
          const b = CTF_SYSTEM.bases[me.teamId];
          return { kind: 'flag-escort', cell: this._cellAtPx(b.x, b.y), approach: 'reach',
                   targetRef: this._nearestOpponentInRange(), action: 'combat', targetId: 'defend',
                   reason: 'teammate on the flag — defending base' };
        }
      }
    }

    // Tower: split attack/defend. If a teammate is already attacking the enemy
    // tower (bot goal, or human standing near it) and we own a tower → defend it.
    if (goal.kind === 'tower-attack' && typeof TOWER_SYSTEM !== 'undefined' && TOWER_SYSTEM.towers) {
      const enemyTower = TOWER_SYSTEM.towers.find(t => !this._ownsTower(t) && t.hp > 0);
      const mine = TOWER_SYSTEM.towers.find(t => this._ownsTower(t) && t.hp > 0);
      const someoneAttacking = mates.some(t => {
        const c = this._peerController(t);
        if (c) return c.goal && c.goal.kind === 'tower-attack';
        return enemyTower && Math.hypot(enemyTower.x + enemyTower.w / 2 - t.cx, enemyTower.y + enemyTower.h / 2 - t.cy) < 6 * BLOCK_SIZE;
      });
      if (someoneAttacking && mine) {
        const threat = this._nearestOpponentNearPx(mine.x + mine.w / 2, mine.y + mine.h / 2, 14);
        return { kind: 'tower-defend', cell: threat ? BOT_AI.cellOf(threat) : this._cellAtPx(mine.x + mine.w / 2, mine.y + mine.h),
                 approach: threat ? 'range' : 'reach', targetRef: threat, action: threat ? 'combat' : null,
                 targetId: 'defend', reason: 'teammate attacking — defending our tower' };
      }
    }

    // Hill: if a teammate already holds it (and the sub-mode doesn't reward extra
    // bodies), intercept approaching enemies instead of crowding the zone.
    if (goal.kind === 'hill-approach') {
      const submode = ((this.game.arenaConfig && this.game.arenaConfig.kothScoring) || 'STICKY').toUpperCase();
      const h = this._hillInfo();
      const mateHolding = h && mates.some(t => this._onHill(h, t));
      if (submode !== 'ALL' && mateHolding) {
        const threat = this._nearestOpponentInRange();
        if (threat) return { kind: 'hill-intercept', cell: BOT_AI.cellOf(threat), approach: 'range',
                             targetRef: threat, action: 'combat', targetId: threat._ownerId,
                             reason: 'teammate holds the hill — intercepting' };
      }
    }

    // Emeralds: don't both beeline the same gem — take one a closer teammate isn't.
    if (goal.kind === 'emerald') {
      const claimed = this._claimedCells(['emerald']);          // peer bots' emerald targets
      const alt = this._nearestLiveEmeraldExcluding(claimed);
      if (alt) return { kind: 'emerald', cell: this._cellAtPx(alt.wx, alt.wy), approach: 'reach',
                        targetRef: null, action: null, targetId: 'emerald', reason: 'splitting emeralds with teammate' };
    }

    // Mobs: don't both dogpile one mob — pick one a teammate isn't already on.
    if (goal.kind === 'mob') {
      const claimedMobs = new Set();
      for (const t of mates) { const c = this._peerController(t); if (c && c.goal && c.goal.kind === 'mob' && c.goal.targetRef) claimedMobs.add(c.goal.targetRef); }
      if (goal.targetRef && claimedMobs.has(goal.targetRef)) {
        const alt = this._nearestMobExcluding(claimedMobs);
        if (alt) return { kind: 'mob', cell: BOT_AI.cellOf(alt), approach: 'range', targetRef: alt,
                          action: 'combat', targetId: 'mob' + alt.id, reason: 'splitting mobs with teammate' };
      }
    }
    return goal;
  }

  _teammates() {
    const me = this.player;
    return this.game.activePlayers().filter(p => p !== me && p.hp > 0 && p.teamId != null && p.teamId === me.teamId);
  }
  _peerController(p) {
    const cs = this.game._botControllers || [];
    return cs.find(c => c !== this && c.player === p) || null;
  }
  _claimedCells(kinds) {
    const out = [];
    for (const t of this._teammates()) { const c = this._peerController(t); if (c && c.goal && kinds.includes(c.goal.kind) && c.goal.cell) out.push(c.goal.cell); }
    return out;
  }
  _nearestLiveEmeraldExcluding(cells) {
    const me = this.player; let best = null, bd = Infinity;
    for (const e of this._liveEmeralds()) {
      const ec = this._cellAtPx(e.wx, e.wy);
      if (cells.some(c => c[0] === ec[0] && c[1] === ec[1])) continue;
      const d = Math.hypot(e.wx - me.cx, e.wy - me.cy);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  _nearestMobExcluding(set) {
    const mm = this.game.mobManager; if (!mm || !mm.mobs) return null;
    const me = this.player; let best = null, bd = Infinity;
    for (const m of mm.mobs) { if (!m.alive || m.hp <= 0 || set.has(m)) continue; const d = Math.hypot(m.cx - me.cx, m.cy - me.cy); if (d < bd) { bd = d; best = m; } }
    return best;
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
      // 'range' goals (combat-primary: kills / tower / mob) stop at firing range;
      // 'reach' goals (occupy: hill / flag / emerald) go all the way to the cell.
      // goal.reachBlocks overrides (companion follow-band).
      const reach = (goal.reachBlocks != null) ? goal.reachBlocks
                  : (goal.approach === 'range') ? this._preferredRange(tgt) : BOT_OBJECTIVE_REACH_BLOCKS;
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
    const p = this.player;
    // Stuck-escape: while ACTIVELY escaping, back away from the target and jump for
    // a few frames to break a local trap (wedged against a wall / under an overhang
    // the route couldn't express — "back up and jump over it"), then force a re-path.
    if (this._escapeTimer > 0) {
      this._escapeTimer--;
      i.moveX = this._escapeDir * (this.diff.alwaysRun ? 1 : 0.85);
      i.jump = true;
      if (this._escapeTimer === 0) { this._path = null; this._pathTimer = 0; this._noProgress = 0; this._brainTimer = 0; }
      this._lastX = p.cx;
      return;
    }
    let dir = step.dir || 0;
    // navPrecision: Easy bots occasionally drop an input frame / ease off full
    // speed, so movement looks less robotic and is a touch less effective.
    let mag = this.diff.alwaysRun ? 1 : (0.55 + 0.45 * this.diff.navPrecision);
    if (!this.diff.alwaysRun && this._frac() > this.diff.navPrecision) mag *= 0.4;
    i.moveX = dir * mag;
    if (step.jump) i.jump = true;
    // Stuck detection: intending to move but no horizontal progress → wedged.
    // After a short window (scaled by skill so Easy dithers a touch longer), kick
    // off a reverse-and-jump escape. Far cheaper than waiting out loseInterest, and
    // it actually gets the bot out instead of re-deciding into the same wall.
    if (dir !== 0 && this._lastX != null && Math.abs(p.cx - this._lastX) < 0.4) {
      const limit = Math.round(18 / Math.max(0.4, this.diff.navPrecision));  // HARD 18 → EASY ~33
      if (++this._noProgress > limit) {
        this._escapeDir = -Math.sign(dir || (p.facing || 1));   // away from the target
        this._escapeTimer = 16;
        this._noProgress = 0;
      }
    } else this._noProgress = 0;
    this._lastX = p.cx;
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

  _nearestOpponent() { return this._nearest(this._opponents()); }
  _nearest(list) {
    const me = this.player; let best = null, bd = Infinity;
    for (const o of list) { const d = Math.hypot(o.cx - me.cx, o.cy - me.cy); if (d < bd) { bd = d; best = o; } }
    return best;
  }
  // Nearest opponent within detect range (opportunistic combat while pursuing an
  // objective) — null when none, so objective goals stop firing when nobody's near.
  _nearestOpponentInRange() {
    const me = this.player, r = this.diff.detectRange * BLOCK_SIZE;
    let best = null, bd = Infinity;
    for (const o of this._opponents()) { const d = Math.hypot(o.cx - me.cx, o.cy - me.cy); if (d <= r && d < bd) { bd = d; best = o; } }
    return best;
  }
  _nearestOpponentNearPx(px, py, blocks) {
    const r = blocks * BLOCK_SIZE; let best = null, bd = Infinity;
    for (const o of this._opponents()) { const d = Math.hypot(o.cx - px, o.cy - py); if (d <= r && d < bd) { bd = d; best = o; } }
    return best;
  }
  // Nearest of a list of {ref,x,y} points to the bot; returns the chosen entry.
  _nearestPx(pts) {
    const me = this.player; let best = null, bd = Infinity;
    for (const p of pts) { const d = Math.hypot(p.x - me.cx, p.y - me.cy); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  _cellAtPx(px, py) { return [Math.floor(px / BLOCK_SIZE), Math.floor(py / BLOCK_SIZE)]; }

  // ── Hill helpers (KOTH) ──────────────────────────────────
  _hillInfo() {
    const h = this.game._arenaHill;
    if (h && typeof h.x === 'number') {
      const cx = h.x + h.w / 2, cy = h.y + h.h / 2;
      return { x: h.x, y: h.y, w: h.w, h: h.h, cx, cy, cell: this._cellAtPx(cx, h.y) };
    }
    // Hill-less world: KOTH uses an arena-centre radius — path to the centre.
    const L = this.game.level;
    const pw = L.pixelWidth || (L.width * BLOCK_SIZE), ph = L.pixelHeight || (L.height * BLOCK_SIZE);
    return { x: pw / 2, y: ph / 2, w: 0, h: 0, cx: pw / 2, cy: ph / 2, cell: this._cellAtPx(pw / 2, ph / 2) };
  }
  _onHill(h, p) { return (typeof ARENA_MODES !== 'undefined' && ARENA_MODES._onHill) ? ARENA_MODES._onHill(this.game, p) : false; }
  _hillOccupants(h) { return this.game.activePlayers().filter(p => p.hp > 0 && this._onHill(h, p)); }

  // ── Tower helpers ────────────────────────────────────────
  // A bot "owns" a tower if it's tagged with its ownerId or (in a team match) a
  // teammate's ownerId. Defending a teammate's tower is correct in team modes.
  _ownsTower(t) {
    if (t.ownerId === this.ownerId) return true;
    const me = this.player;
    if (me && me.teamId != null) {
      const owner = this.game.activePlayers().find(p => p._ownerId === t.ownerId);
      if (owner && owner.teamId === me.teamId) return true;
    }
    return false;
  }

  // ── Emerald helpers ──────────────────────────────────────
  _liveEmeralds() {
    if (typeof EMERALD_SYSTEM === 'undefined') return [];
    const live = EMERALD_SYSTEM._activeEmeralds ? EMERALD_SYSTEM._activeEmeralds() : [];
    return live.filter(e => e && !e.collected);
  }

  // ── Mob helpers (waves / Mob Hunter) ─────────────────────
  // Nearest live mob, but Mob Hunter competition (Q4): higher aggression biases
  // toward mobs an opponent is ALSO close to (race to steal the kill) — NOT PvP.
  _pickMob() {
    const mm = this.game.mobManager;
    if (!mm || !mm.mobs) return null;
    const me = this.player;
    let best = null, bestScore = Infinity;
    for (const m of mm.mobs) {
      if (!m.alive || m.hp <= 0) continue;
      const d = Math.hypot(m.cx - me.cx, m.cy - me.cy) / BLOCK_SIZE;
      if (d > this.diff.detectRange * 1.5) continue;    // ignore far mobs
      // contest bonus: subtract when an opponent is near this mob (want it first).
      let contest = 0;
      for (const o of this._opponents()) {
        const od = Math.hypot(m.cx - o.cx, m.cy - o.cy) / BLOCK_SIZE;
        if (od < 8) contest = Math.max(contest, (8 - od));
      }
      const score = d - this.diff.aggression * contest;  // lower = more attractive
      if (score < bestScore) { bestScore = score; best = m; }
    }
    return best || this._nearestMobAny();
  }
  _hasLiveMobs() {
    const mm = this.game.mobManager; if (!mm || !mm.mobs) return false;
    return mm.mobs.some(m => m.alive && m.hp > 0);
  }
  _nearestMobAny() {
    const mm = this.game.mobManager; if (!mm || !mm.mobs) return null;
    const me = this.player; let best = null, bd = Infinity;
    for (const m of mm.mobs) { if (!m.alive || m.hp <= 0) continue; const d = Math.hypot(m.cx - me.cx, m.cy - me.cy); if (d < bd) { bd = d; best = m; } }
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
