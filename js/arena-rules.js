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

  _teamStat(game, teamId, key) { let n = 0; for (const p of game.activePlayers()) if (p && p.teamId === teamId) n += (this._statOf(game, p._ownerId)[key] || 0); return n; },
  _totalStat(game, key) { let n = 0; for (const id of this._ownerIds(game)) n += (this._statOf(game, id)[key] || 0); return n; },
  _topPlayerScore(rs, game) { let m = 0; for (const id of this._ownerIds(game)) m = Math.max(m, this.playerScore(rs, game, id)); return m; },
  _playerById(game, id) { return game.activePlayers().find(p => p && p._ownerId === id) || null; },

  // Win conditions are evaluated PER PLAYER: met for player `id` when their value
  // (conditionCurrent — team-shared for flags) reaches the target.
  conditionMet(rs, game, cond, id) { return this.conditionCurrent(rs, game, cond, id) >= cond.target; },

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
  _groupMet(rs, game, group, id) {
    const conds = (group && group.conditions) || [];
    if (!conds.length) return false;
    if (conds.some(c => c.logic)) {
      let acc;
      for (const c of conds) {
        const t = this.conditionMet(rs, game, c, id);
        const lg = (c.logic || 'and').toLowerCase();
        if (acc === undefined) acc = (lg === 'not') ? !t : t;
        else if (lg === 'or')  acc = acc || t;
        else if (lg === 'not') acc = acc && !t;
        else                   acc = acc && t;
      }
      return !!acc;
    }
    return group.combinator === 'all'
      ? conds.every(c => this.conditionMet(rs, game, c, id))
      : conds.some(c => this.conditionMet(rs, game, c, id));
  },

  // Per-player stage pointer (stored on game._stageProgress[id]); advances through
  // every stage this player has completed (monotonic — stats are cumulative).
  playerStageIndex(rs, game, id) {
    if (!rs.stages || !rs.stages.length) return 0;
    if (!game._stageProgress) game._stageProgress = {};
    let idx = game._stageProgress[id] || 0;
    while (idx < rs.stages.length && this._groupMet(rs, game, rs.stages[idx], id)) idx++;
    game._stageProgress[id] = idx;
    return idx;
  },

  // Has player `id` met the win — all stages complete, or the flat conditions?
  playerWon(rs, game, id) {
    if (rs.stages && rs.stages.length) return this.playerStageIndex(rs, game, id) >= rs.stages.length;
    return this._groupMet(rs, game, rs.win, id);
  },

  // Numeric progress for end-screen standings + no-winner tiebreak: stages done
  // dominate, then FRACTIONAL progress toward the current step (or flat)
  // conditions (so 6/10 kills beats 2/10 even when neither is met), then score.
  winProgress(rs, game, id) {
    const score = Math.min(this.playerScore(rs, game, id), 999);
    const cp = (c) => c.target > 0 ? Math.min(1, this.conditionCurrent(rs, game, c, id) / c.target) : 0;
    if (rs.stages && rs.stages.length) {
      const idx = this.playerStageIndex(rs, game, id);
      const cur = (idx < rs.stages.length) ? (rs.stages[idx].conditions || []) : [];
      const frac = cur.reduce((s, c) => s + cp(c), 0);
      return idx * 1e6 + frac * 1e3 + score;
    }
    const conds = (rs.win && rs.win.conditions) || [];
    return conds.reduce((s, c) => s + cp(c), 0) * 1e3 + score;
  },

  // Per-player stage progress for the HUD/pause readout.
  stageInfo(rs, game, id) {
    if (!rs.stages || !rs.stages.length) return null;
    const idx = Math.min(this.playerStageIndex(rs, game, id), rs.stages.length);
    return { index: idx, total: rs.stages.length, stage: rs.stages[idx] || null };
  },

  // Has the match ended? Any player meeting THEIR win, a structural ender,
  // deathEndsMatch, or the timer (passed by the caller).
  isEnded(rs, game, timeUp) {
    for (const id of this._ownerIds(game)) if (this.playerWon(rs, game, id)) return true;
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
    // Winner = whoever met THEIR win (tiebreak: score). If nobody did (timeout),
    // the player furthest along by winProgress. Ties → null (draw).
    const ids = this._ownerIds(game);
    const won = ids.filter(id => this.playerWon(rs, game, id));
    const pool = won.length ? won : ids;
    let bestId = null, best = -Infinity, tie = false;
    for (const id of pool) {
      const v = won.length ? this.playerScore(rs, game, id) : this.winProgress(rs, game, id);
      if (v > best) { best = v; bestId = id; tie = false; }
      else if (v === best) tie = true;
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
  // Current value of a condition FOR PLAYER `id` (win is per-player). Team
  // objectives (flag captures) are team-shared → a player's progress = their
  // team's total; everything else is the player's own stat.
  conditionCurrent(rs, game, c, id) {
    const st = this._statOf(game, id);
    switch (c.type) {
      case 'playerKills':            return st.kills || 0;
      case 'hillSecondsTotal':       return st.hillSeconds || 0;
      case 'hillSecondsConsecutive': return st.hillStreak || 0;
      case 'emeraldsCollected':      return st.emeralds || 0;
      case 'towersDestroyed':        return st.towersDestroyed || 0;
      case 'flagsCaptured': {
        const p = this._playerById(game, id);
        return (p && p.teamId != null) ? this._teamStat(game, p.teamId, 'flagCaptures') : (st.flagCaptures || 0);
      }
      case 'totalPoints':            return this.playerScore(rs, game, id);
      default: return 0;
    }
  },
  // Structured PER-PLAYER objective progress for the pause / end-screen readout:
  //   { mode:'stages', current, total, won, stages:[{index,done,active,conditions:[…]}] }
  //   { mode:'flat', combinator, won, conditions:[{label,current,target,met,logic}] }
  //   { mode:'timer' }
  objectiveStatus(rs, game, id) {
    if (!rs) return { mode: 'timer' };
    const cs = (c) => { const cur = this.conditionCurrent(rs, game, c, id); return { label: this._condText(c.type), current: cur, target: c.target, met: cur >= c.target, logic: c.logic || null }; };
    if (rs.stages && rs.stages.length) {
      const idx = this.playerStageIndex(rs, game, id);
      return { mode: 'stages', current: idx, total: rs.stages.length, won: idx >= rs.stages.length,
        stages: rs.stages.map((st, i) => ({ index: i, done: i < idx, active: i === idx, conditions: (st.conditions || []).map(cs) })) };
    }
    const conds = (rs.win && rs.win.conditions) || [];
    if (conds.length) return { mode: 'flat', combinator: rs.win.combinator, won: this._groupMet(rs, game, rs.win, id), conditions: conds.map(cs) };
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
