// ============================================================
// arena-rules.js — Declarative arena rules engine (Phase 3 v3, first pass)
// ------------------------------------------------------------
// A game "mode" is expressed as a RULESET (pure data): which world ELEMENTS are
// active, how points are SCORED (weights on tracked stats), and the WIN/END
// conditions. This module is the evaluator over that data; it does NOT yet drive
// the live match loop — it is validated by headless parity tests that reproduce
// the current hardcoded modes (see test-rules.js). Wiring the live game to it,
// and the "Custom Rules" authoring UI, are the next steps.
//
// Design decisions (agreed with Kevin):
//  • TRACK EVERYTHING scoreable as a stat, even if a mode doesn't score it.
//  • Three DISCRETE mob-spawn sources — bots (ambient; future AI players),
//    waveSpawns (structural difficulty ramp), spawnEggs (designer-placed).
//  • Teams are a PRE-LAUNCH setting, not a rule; the engine only aggregates.
//  • Per-player stats SUM for a team; match-level counters (wavesDefeated) are
//    SHARED (added once). This single split covers every summed/shared case.
//  • Win logic (this pass): a flat list of conditions combined by ANY/ALL. The
//    data model reserves room for ordered "stages" (sequencing) added later.
// ============================================================

// Comprehensive per-player stat keys — always tracked; scoring uses a subset.
const ARENA_STAT_KEYS = [
  'kills', 'deaths', 'mobKills', 'emeralds',
  'hillSeconds', 'hillStreak',        // total held; longest unbroken streak
  'flagCaptures', 'towerDamage', 'towersDestroyed',
];
// Match-level (shared) counters — added once to a team, not per player.
const ARENA_SHARED_KEYS = ['wavesDefeated'];

function _blankStat() { const s = {}; for (const k of ARENA_STAT_KEYS) s[k] = 0; return s; }

const ARENA_RULES = {
  STAT_KEYS: ARENA_STAT_KEYS,
  SHARED_KEYS: ARENA_SHARED_KEYS,
  blankStat: _blankStat,

  // Default ruleset skeleton — the "Custom Rules" starting point.
  DEFAULT: {
    label: 'Custom Rules',
    elements: { pvp: false, bots: false, waveSpawns: false, spawnEggs: false,
                emeralds: false, hill: false, ctf: false, towers: false },
    scoring: { perKill: 0, perMobKill: 0, perEmerald: 0, perHill10s: 0,
               perFlag: 0, perTowerDestroyed: 0, perWaveDefeated: 0 },
    win: { combinator: 'any', conditions: [] },   // flat conditions (ANY/ALL)
    endStructural: [],                              // structural enders (OR-ed)
    winnerBy: 'topScore',                           // topScore | destroyer | topTowerHp
    deathEndsMatch: false,                          // Survival: a death ends it
    stages: null,                                   // reserved for sequencing
  },

  // ── The 7 current modes expressed as rule presets (parity targets) ──
  PRESETS: {
    QUICK_BATTLE: {
      label: 'Quick Battle',
      elements: { pvp: true, bots: true, spawnEggs: true, waveSpawns: false, emeralds: true, hill: false, ctf: false, towers: false },
      scoring: { perKill: 1, perMobKill: 1, perEmerald: 1, perHill10s: 0, perFlag: 0, perTowerDestroyed: 0, perWaveDefeated: 0 },
      win: { combinator: 'any', conditions: [] },
      endStructural: ['allBotsDead'], winnerBy: 'topScore', deathEndsMatch: false,
    },
    MOB_HUNTER: {
      label: 'Mob Hunter',
      elements: { pvp: false, bots: true, spawnEggs: true, waveSpawns: false, emeralds: false, hill: false, ctf: false, towers: false },
      scoring: { perKill: 0, perMobKill: 1, perEmerald: 0, perHill10s: 0, perFlag: 0, perTowerDestroyed: 0, perWaveDefeated: 0 },
      win: { combinator: 'any', conditions: [] },
      endStructural: [], winnerBy: 'topScore', deathEndsMatch: false, // timer-bound
    },
    COLLECT_EMERALDS: {
      label: 'Collect Emeralds',
      elements: { pvp: false, bots: true, spawnEggs: true, waveSpawns: false, emeralds: true, hill: false, ctf: false, towers: false },
      scoring: { perKill: 0, perMobKill: 0, perEmerald: 1, perHill10s: 0, perFlag: 0, perTowerDestroyed: 0, perWaveDefeated: 0 },
      win: { combinator: 'any', conditions: [] },
      endStructural: ['allEmeralds'], winnerBy: 'topScore', deathEndsMatch: false,
    },
    KING_OF_HILL: {
      label: 'King of the Hill',
      elements: { pvp: true, bots: false, spawnEggs: false, waveSpawns: false, emeralds: false, hill: true, ctf: false, towers: false },
      scoring: { perKill: 0, perMobKill: 0, perEmerald: 0, perHill10s: 1, perFlag: 0, perTowerDestroyed: 0, perWaveDefeated: 0 },
      win: { combinator: 'any', conditions: [] },
      endStructural: [], winnerBy: 'topScore', deathEndsMatch: false, // full-timer (v3)
    },
    SURVIVAL_WAVES: {
      label: 'Survival Waves',
      elements: { pvp: false, bots: false, spawnEggs: false, waveSpawns: true, emeralds: false, hill: false, ctf: false, towers: false },
      scoring: { perKill: 0, perMobKill: 0, perEmerald: 0, perHill10s: 0, perFlag: 0, perTowerDestroyed: 0, perWaveDefeated: 1 },
      win: { combinator: 'any', conditions: [] },
      endStructural: ['survivedAllWaves', 'allPlayersDead'], winnerBy: 'topScore', deathEndsMatch: true,
    },
    DEATHMATCH: {
      label: 'Deathmatch',
      elements: { pvp: true, bots: false, spawnEggs: false, waveSpawns: false, emeralds: false, hill: false, ctf: false, towers: false },
      scoring: { perKill: 1, perMobKill: 0, perEmerald: 0, perHill10s: 0, perFlag: 0, perTowerDestroyed: 0, perWaveDefeated: 0 },
      win: { combinator: 'any', conditions: [{ type: 'playerKills', target: 10 }] },
      endStructural: [], winnerBy: 'topScore', deathEndsMatch: false,
    },
    CAPTURE_FLAG: {
      label: 'Capture the Flag',
      elements: { pvp: true, bots: false, spawnEggs: false, waveSpawns: false, emeralds: false, hill: false, ctf: true, towers: false },
      scoring: { perKill: 0, perMobKill: 0, perEmerald: 0, perHill10s: 0, perFlag: 1, perTowerDestroyed: 0, perWaveDefeated: 0 },
      win: { combinator: 'any', conditions: [{ type: 'flagsCaptured', target: 3 }] },
      endStructural: [], winnerBy: 'topScore', deathEndsMatch: false,
    },
    DEFEND_TOWER: {
      label: 'Defend the Tower',
      elements: { pvp: true, bots: false, spawnEggs: false, waveSpawns: false, emeralds: false, hill: false, ctf: false, towers: true },
      scoring: { perKill: 0, perMobKill: 0, perEmerald: 0, perHill10s: 0, perFlag: 0, perTowerDestroyed: 0, perWaveDefeated: 0 }, // health-based
      win: { combinator: 'any', conditions: [{ type: 'towersDestroyed', target: 1 }] },
      endStructural: [], winnerBy: 'destroyer', deathEndsMatch: false, // timeout tiebreak = topTowerHp (see winner())
    },
  },

  // Merge a partial ruleset over DEFAULT (deep-ish for the known sub-objects).
  normalize(rs) {
    const d = this.DEFAULT;
    return {
      label: rs.label || d.label,
      elements: Object.assign({}, d.elements, rs.elements),
      scoring: Object.assign({}, d.scoring, rs.scoring),
      win: { combinator: (rs.win && rs.win.combinator) || 'any', conditions: (rs.win && rs.win.conditions) || [] },
      endStructural: rs.endStructural || [],
      winnerBy: rs.winnerBy || d.winnerBy,
      deathEndsMatch: !!rs.deathEndsMatch,
      stages: rs.stages || null,
    };
  },

  // ── Scoring ────────────────────────────────────────────────
  _statOf(game, id) { return (game.arenaState.stats && game.arenaState.stats[id]) || {}; },
  _wavesDefeated(game) { return (game._arenaMode && game._arenaMode.wavesCleared) || 0; },

  // Per-player individual points (summed for a team).
  individualScore(rs, game, id) {
    const s = rs.scoring, st = this._statOf(game, id);
    return (st.kills || 0) * s.perKill
         + (st.mobKills || 0) * s.perMobKill
         + (st.emeralds || 0) * s.perEmerald
         + Math.floor((st.hillSeconds || 0) / 10) * s.perHill10s
         + (st.flagCaptures || 0) * s.perFlag
         + (st.towersDestroyed || 0) * s.perTowerDestroyed;
  },
  // Match-level (shared) points, added once — not multiplied by team size.
  sharedScore(rs, game) { return this._wavesDefeated(game) * rs.scoring.perWaveDefeated; },

  // A player's displayed score = own individual points + the shared component.
  playerScore(rs, game, id) { return this.individualScore(rs, game, id) + this.sharedScore(rs, game); },

  // Team score = sum of members' individual points + the shared component once.
  teamScore(rs, game, teamId) {
    let sum = 0;
    for (const p of game.activePlayers()) if (p && p.teamId === teamId) sum += this.individualScore(rs, game, p._ownerId);
    return sum + this.sharedScore(rs, game);
  },

  // ── Win / end evaluation ───────────────────────────────────
  _ownerIds(game) { return game.activePlayers().map((p, i) => (p && p._ownerId) || ('p' + (i + 1))); },
  _maxStat(game, key) { let m = 0; for (const id of this._ownerIds(game)) m = Math.max(m, this._statOf(game, id)[key] || 0); return m; },

  // Is a single threshold condition currently satisfied?
  conditionMet(rs, game, cond) {
    switch (cond.type) {
      case 'playerKills':            return this._maxStat(game, 'kills') >= cond.target;
      case 'hillSecondsTotal':       return this._maxStat(game, 'hillSeconds') >= cond.target;
      case 'hillSecondsConsecutive': return this._maxStat(game, 'hillStreak') >= cond.target;
      case 'emeraldsCollected':      return this._maxStat(game, 'emeralds') >= cond.target;
      case 'flagsCaptured': {
        const t0 = this._teamStat(game, 0, 'flagCaptures'), t1 = this._teamStat(game, 1, 'flagCaptures');
        return Math.max(t0, t1, this._maxStat(game, 'flagCaptures')) >= cond.target;
      }
      case 'towersDestroyed':        return this._totalStat(game, 'towersDestroyed') >= cond.target;
      case 'totalPoints':            return this._topPlayerScore(rs, game) >= cond.target;
      default: return false;
    }
  },
  _teamStat(game, teamId, key) { let n = 0; for (const p of game.activePlayers()) if (p && p.teamId === teamId) n += (this._statOf(game, p._ownerId)[key] || 0); return n; },
  _totalStat(game, key) { let n = 0; for (const id of this._ownerIds(game)) n += (this._statOf(game, id)[key] || 0); return n; },
  _topPlayerScore(rs, game) { let m = 0; for (const id of this._ownerIds(game)) m = Math.max(m, this.playerScore(rs, game, id)); return m; },

  // Structural enders that depend on the world/systems (guarded).
  _structuralMet(rs, game, kind) {
    switch (kind) {
      case 'allBotsDead':      return !!(game.mobManager && game.mobManager.mobs && game.mobManager.mobs.filter(m => m.alive).length === 0);
      case 'allEmeralds':      return (typeof EMERALD_SYSTEM !== 'undefined') ? EMERALD_SYSTEM.allRoundsComplete() : false;
      case 'survivedAllWaves': return this._wavesDefeated(game) >= ((game._arenaMode && game._arenaMode.totalWaves) || Infinity);
      case 'allPlayersDead':   return game.activePlayers().length > 0 && game.activePlayers().every(p => p.hp <= 0);
      default: return false;
    }
  },

  // Is a condition group currently satisfied? Two forms:
  //  • Per-condition logic: each condition carries logic 'and'|'or'|'not',
  //    evaluated left-to-right (acc AND c / acc OR c / acc AND NOT c; the first
  //    condition seeds acc, negated when its logic is 'not'). Used by the Custom
  //    Rules step builder.
  //  • Combinator: group.combinator 'all'|'any' over the conditions (used by the
  //    built-in presets, which carry no per-condition logic).
  _groupMet(rs, game, group) {
    const conds = (group && group.conditions) || [];
    if (!conds.length) return false;
    if (conds.some(c => c.logic)) {
      let acc;
      for (const c of conds) {
        const t = this.conditionMet(rs, game, c);
        const lg = (c.logic || 'and').toLowerCase();
        if (acc === undefined) acc = (lg === 'not') ? !t : t;
        else if (lg === 'or')  acc = acc || t;
        else if (lg === 'not') acc = acc && !t;
        else                   acc = acc && t;
      }
      return !!acc;
    }
    return group.combinator === 'all'
      ? conds.every(c => this.conditionMet(rs, game, c))
      : conds.some(c => this.conditionMet(rs, game, c));
  },

  // Sequenced win (stages): current stage progress for the HUD. Global (match-wide)
  // progression — the match advances through stages as each group is met.
  stageInfo(rs, game) {
    if (!rs.stages || !rs.stages.length) return null;
    const idx = Math.min(game._stageIndex || 0, rs.stages.length);
    return { index: idx, total: rs.stages.length, stage: rs.stages[idx] || null };
  },

  // Has the match ended? `timeUp` is passed by the caller (arena timer). Supports
  // either flat win conditions (rs.win, ANY/ALL) OR sequenced stages (rs.stages,
  // an ordered list of groups completed in turn), plus structural enders,
  // deathEndsMatch, and the timer.
  isEnded(rs, game, timeUp) {
    if (rs.stages && rs.stages.length) {
      let idx = game._stageIndex || 0;
      // Advance through every stage whose group is currently met (monotonic —
      // all condition types are cumulative, so a completed stage stays complete).
      while (idx < rs.stages.length && this._groupMet(rs, game, rs.stages[idx])) idx++;
      game._stageIndex = idx;
      if (idx >= rs.stages.length) return true;
    } else if (this._groupMet(rs, game, rs.win)) {
      return true;
    }
    for (const s of (rs.endStructural || [])) if (this._structuralMet(rs, game, s)) return true;
    if (rs.deathEndsMatch && this._structuralMet(rs, game, 'allPlayersDead')) return true;
    return !!timeUp;
  },

  // Resolve the winning player id (or null/tie). winnerBy: topScore | destroyer
  // | topTowerHp. Falls back to topScore for ties on the primary metric.
  winner(rs, game) {
    if (rs.winnerBy === 'destroyer' || rs.winnerBy === 'topTowerHp') {
      const w = (typeof TOWER_SYSTEM !== 'undefined') ? TOWER_SYSTEM.winner() : null;
      if (w) return w; // a tower was actually destroyed → destroyer wins
      if (typeof TOWER_SYSTEM !== 'undefined' && TOWER_SYSTEM.towers && TOWER_SYSTEM.towers.length) {
        const top = TOWER_SYSTEM.towers.reduce((a, b) => (b.hp > a.hp ? b : a));
        const tie = TOWER_SYSTEM.towers.filter(t => t.hp === top.hp).length > 1;
        return tie ? null : top.ownerId; // timeout → most tower HP left
      }
      return null;
    }
    // topScore
    let bestId = null, best = -1, tie = false;
    for (const id of this._ownerIds(game)) {
      const sc = this.playerScore(rs, game, id);
      if (sc > best) { best = sc; bestId = id; tie = false; }
      else if (sc === best) tie = true;
    }
    return tie ? null : bestId;
  },

  // Which element systems should be active for this ruleset (drives setup).
  activeElements(rs) { return Object.keys(rs.elements).filter(k => rs.elements[k]); },

  // Human label + current numeric value for a condition (for the pause readout).
  _condText(type) {
    return ({
      playerKills: 'Player kills', hillSecondsTotal: 'Hill seconds (total)',
      hillSecondsConsecutive: 'Hill seconds (streak)', emeraldsCollected: 'Emeralds',
      flagsCaptured: 'Team flags', towersDestroyed: 'Towers destroyed', totalPoints: 'Total points',
    })[type] || type;
  },
  conditionCurrent(rs, game, c) {
    switch (c.type) {
      case 'playerKills':            return this._maxStat(game, 'kills');
      case 'hillSecondsTotal':       return this._maxStat(game, 'hillSeconds');
      case 'hillSecondsConsecutive': return this._maxStat(game, 'hillStreak');
      case 'emeraldsCollected':      return this._maxStat(game, 'emeralds');
      case 'flagsCaptured':          return Math.max(this._teamStat(game, 0, 'flagCaptures'), this._teamStat(game, 1, 'flagCaptures'), this._maxStat(game, 'flagCaptures'));
      case 'towersDestroyed':        return this._totalStat(game, 'towersDestroyed');
      case 'totalPoints':            return this._topPlayerScore(rs, game);
      default: return 0;
    }
  },
  // Structured objective progress for the pause "Objectives" panel:
  //   { mode:'stages', current, total, stages:[{index,done,active,conditions:[…]}] }
  //   { mode:'flat', combinator, conditions:[{label,current,target,met,logic}] }
  //   { mode:'timer' }
  objectiveStatus(rs, game) {
    if (!rs) return { mode: 'timer' };
    const cs = (c) => { const cur = this.conditionCurrent(rs, game, c); return { label: this._condText(c.type), current: cur, target: c.target, met: cur >= c.target, logic: c.logic || null }; };
    if (rs.stages && rs.stages.length) {
      const idx = game._stageIndex || 0;
      return { mode: 'stages', current: idx, total: rs.stages.length,
        stages: rs.stages.map((st, i) => ({ index: i, done: i < idx, active: i === idx, conditions: (st.conditions || []).map(cs) })) };
    }
    const conds = (rs.win && rs.win.conditions) || [];
    if (conds.length) return { mode: 'flat', combinator: rs.win.combinator, conditions: conds.map(cs) };
    return { mode: 'timer' };
  },

  // Build the live ruleset for a mode key + pre-launch config: start from the
  // matching preset (null/unknown → Quick Battle) and inject config-driven win
  // targets (killTarget, captureTarget). Other pre-launch values (towerHp,
  // survivalWaveCount, kothScoring) live on the element systems / _arenaMode.
  rulesetForMode(modeKey, cfg) {
    cfg = cfg || {};
    // Custom Rules: the whole ruleset comes from the authoring UI (cfg.customRuleset).
    if (modeKey === 'CUSTOM' && cfg.customRuleset) return this.normalize(cfg.customRuleset);
    const rs = this.normalize(this.PRESETS[modeKey] || this.PRESETS.QUICK_BATTLE);
    if (modeKey === 'DEATHMATCH' && cfg.killTarget) rs.win.conditions = [{ type: 'playerKills', target: cfg.killTarget }];
    if (modeKey === 'CAPTURE_FLAG' && cfg.captureTarget) rs.win.conditions = [{ type: 'flagsCaptured', target: cfg.captureTarget }];
    return rs;
  },
};

if (typeof window !== 'undefined') { window.ARENA_RULES = ARENA_RULES; window.ARENA_STAT_KEYS = ARENA_STAT_KEYS; }
if (typeof module !== 'undefined' && module.exports) module.exports = { ARENA_RULES, ARENA_STAT_KEYS, ARENA_SHARED_KEYS };
