// ============================================================
// arena-modes.js — Arena game modes (Phase 3A.2)
//
// Layered on the existing arenaState machine (phase: countdown|running|ended).
// Game._setupArena calls initMode(); the arena running branch calls update()
// each frame (its win condition flips arenaState.phase to 'ended'); _drawArenaHUD
// shows getHUDText(); _drawArenaEnd shows label() + score().
//
//   MOB_HUNTER       hunt mobs before time runs out; score = kills; timer-bound
//   COLLECT_EMERALDS collect every emerald (cycled across groups/rounds); score = emeralds
//   KING_OF_HILL     hold the designed hill (or arena center); win at the hold target
//   SURVIVAL_WAVES   escalating waves until death; score = kills
//   DEATHMATCH       (Phase 3B — PvP) reserved/greyed
//   CAPTURE_FLAG     (Phase 3C — teams + PvP) reserved/greyed
// ============================================================

const ARENA_MODES = {
  DEFS: {
    MOB_HUNTER:       { label: 'Mob Hunter',      desc: 'Hunt down the mobs before time runs out.' },
    COLLECT_EMERALDS: { label: 'Collect Emeralds', desc: 'Grab every emerald in the arena.' },
    KING_OF_HILL:     { label: 'King of the Hill', desc: 'Hold the hill to win.' },
    SURVIVAL_WAVES:   { label: 'Survival Waves',  desc: 'Escalating waves — survive as long as you can.' },
    // Phase 3B — PvP deathmatch (local 1-4 players; friendly fire forced on).
    DEATHMATCH:       { label: 'Deathmatch',       desc: 'Most player eliminations wins.' },
    // Phase 3C — teams + PvP. Grab the enemy flag, carry it to your base to score.
    CAPTURE_FLAG:     { label: 'Capture the Flag', desc: 'Grab the enemy flag and bring it home.' },
    // Phase 3 v3 — destroy the enemy Tower while defending your own (PvP).
    DEFEND_TOWER:     { label: 'Defend the Tower', desc: 'Destroy the enemy Tower — defend your own.' },
    // Phase 3 v3 — author your own rules (elements + scoring + win conditions).
    CUSTOM:           { label: 'Custom Rules', desc: 'Build your own mode: pick elements, scoring & win conditions.' },
  },

  // Game types playable right now (excludes coming-soon/PvP types).
  activeKeys() { return Object.keys(this.DEFS).filter(k => !this.DEFS[k].comingSoon); },
  isComingSoon(key) { return !!(this.DEFS[key] && this.DEFS[key].comingSoon); },

  HOLD_TARGET_FRAMES: 1200,         // 20s @60fps to win King of the Hill
  HILL_RADIUS_BLOCKS: 4,

  // Default Survival wave sequence (z=zombies, s=skeletons, hp=health multiplier).
  // Designers can override per-world via worldAdvSettings.survivalWaves; the
  // pre-launch "Waves" count (1–15) selects how many to play. Waves beyond the
  // table escalate by formula (see _survivalWaveDef).
  SURVIVAL_DEFAULT: [
    { z: 4,  s: 0,  hp: 1 },
    { z: 6,  s: 2,  hp: 1 },
    { z: 8,  s: 6,  hp: 1 },
    { z: 6,  s: 6,  hp: 2 },
    { z: 10, s: 10, hp: 2 },
  ],

  // Wave i (1-based) → { z, s, hp }. Uses the per-world custom table if present,
  // else the default; beyond the table it keeps escalating up to wave 15.
  _survivalWaveDef(game, i) {
    const custom = game._worldAdvSettings && game._worldAdvSettings.survivalWaves;
    const table  = (Array.isArray(custom) && custom.length) ? custom : this.SURVIVAL_DEFAULT;
    if (i <= table.length) {
      const d = table[i - 1] || {};
      return { z: Math.max(0, d.z | 0), s: Math.max(0, d.s | 0), hp: Math.max(1, d.hp || 1) };
    }
    const over = i - table.length; // escalate past the table
    return { z: 10 + over * 2, s: 10 + over * 2, hp: 2 + Math.floor(over / 2) };
  },

  initMode(modeKey, game) {
    const ms = { key: modeKey, holdFrames: 0 };
    // Build + cache the live ruleset; state below is gated by its ELEMENTS (not
    // just the mode key) so Custom Rules can compose hill + waves + objectives.
    const rs = (typeof ARENA_RULES !== 'undefined') ? ARENA_RULES.rulesetForMode(modeKey, game.arenaConfig || {}) : null;
    const el = (rs && rs.elements) || {};
    game._ruleset = rs; game._rulesetKey = modeKey || 'QUICK_BATTLE';
    game._stageProgress = { p1: 0, p2: 0, p3: 0, p4: 0 }; // per-player sequenced-win progress
    if (el.hill || modeKey === 'KING_OF_HILL') {
      ms.ownerId = null;  // null | 'p1'..'p4' — current hill owner (display + accrual)
      ms.hold = { p1: 0, p2: 0, p3: 0, p4: 0 }; // frames each player has accrued
      ms.contested = false; // 2+ players standing on the hill this frame
      // Hill scoring rule (STICKY default / SOLE / ALL) — pre-launch selectable.
      ms.scoring = ((game.arenaConfig && game.arenaConfig.kothScoring) || 'STICKY').toUpperCase();
    }
    if (el.waveSpawns || modeKey === 'SURVIVAL_WAVES') {
      ms.wave = 0;
      ms.totalWaves = Math.max(1, Math.min(15, (game.arenaConfig && game.arenaConfig.survivalWaveCount) || this.SURVIVAL_DEFAULT.length));
      ms.betweenTimer = 90; // short delay before wave 1 (lets the countdown clear)
      ms.cleared = false;    // true once all waves are survived (win)
      ms.wavesCleared = 0;   // waves fully defeated (= Survival score, shared)
      ms.waveActive = false; // a wave is currently spawned + not yet cleared
    }
    if (modeKey === 'DEATHMATCH') {
      // First to killTarget eliminations wins (or most kills when the timer ends).
      ms.killTarget = Math.max(1, Math.min(50, (game.arenaConfig && game.arenaConfig.killTarget) || 10));
    }
    if (modeKey === 'CAPTURE_FLAG') {
      // First team to captureTarget flag captures wins (or most when the timer ends).
      ms.captureTarget = Math.max(1, Math.min(10, (game.arenaConfig && game.arenaConfig.captureTarget) || 3));
    }
    game._arenaMode = ms;
  },

  // True while player `p` is touching the hill. Uses the designed W×H control zone
  // (game._arenaHill) if placed — the player's horizontal centre must be over the
  // zone and their feet within it (allows standing on top of a thin platform OR
  // inside a tall zone) — else the arena-centre radius (hill-less worlds).
  _onHill(game, p) {
    if (!p) return false;
    const hill = game._arenaHill;
    const pcx = p.x + (p.width || PLAYER_W) / 2;
    if (hill) {
      const feetY = p.y + (p.height || PLAYER_H);
      return pcx >= hill.x && pcx <= hill.x + hill.w && feetY >= hill.y - 10 && feetY <= hill.y + hill.h + 14;
    }
    const cx = game.level.pixelWidth / 2, cy = game.level.pixelHeight / 2;
    const pcy = p.y + (p.height || PLAYER_H) / 2;
    return Math.hypot(pcx - cx, pcy - cy) <= this.HILL_RADIUS_BLOCKS * BLOCK_SIZE;
  },

  // Current owner of the hill ('p1'..'p4' | null) — used for the hill colour.
  hillOwner(game) { return (game._arenaMode && game._arenaMode.ownerId) || null; },
  // True when 2+ players are contesting the hill right now (for HUD/colour).
  hillContested(game) { return !!(game._arenaMode && game._arenaMode.contested); },
  // Max hold frames across all players (KotH progress toward the target).
  _kothMax(game) {
    const h = (game._arenaMode && game._arenaMode.hold) || {};
    return Math.max(h.p1 || 0, h.p2 || 0, h.p3 || 0, h.p4 || 0);
  },
  // Leading holder ('p1'..'p4') by accrued frames (KotH winner).
  _kothLeader(game) {
    const h = (game._arenaMode && game._arenaMode.hold) || {};
    let id = 'p1', best = -1;
    for (const k of this._ownerIds(game)) { if ((h[k] || 0) > best) { best = h[k] || 0; id = k; } }
    return id;
  },

  // Spawn one survival wave from its config def (zombies + skeletons, HP ×hp),
  // distributed across the designed spawn-lines (or spread across the top if none).
  _spawnSurvivalWave(game, ms) {
    ms.wave++;
    ms.waveActive = true; // marks this wave live until it's fully defeated
    const def = this._survivalWaveDef(game, ms.wave);
    const queue = [];
    for (let i = 0; i < def.z; i++) queue.push('Zombie');
    for (let i = 0; i < def.s; i++) queue.push('Skeleton');
    const markers = (game._arenaSpawnLines && game._arenaSpawnLines.length) ? game._arenaSpawnLines : null;
    // Mobs speed up a little each wave, on top of the arena ×2 base.
    const speed = (game.mobManager.arenaMobSpeedMult || 1) * (1 + Math.min(0.9, (ms.wave - 1) * 0.1));
    for (let i = 0; i < queue.length; i++) {
      let x, y;
      if (markers) { const m = markers[i % markers.length]; x = m.x; y = m.y; }
      else { x = ((i + 1) / (queue.length + 1)) * game.level.pixelWidth; y = BLOCK_SIZE * 2; }
      const pos = this._clearSpawn(game, x, y);   // avoid spawning inside walls
      const mob = game.mobManager._createMob(queue[i], pos.x, pos.y);
      if (mob) {
        if (def.hp > 1) { mob.maxHp = Math.round(mob.maxHp * def.hp); mob.hp = mob.maxHp; }
        mob.speedMult = speed;
        game.mobManager.mobs.push(mob);
      }
    }
  },

  // Nudge a spawn position to a clear (non-solid) 2-tall cell near (x,y) so wave
  // mobs don't appear stuck inside walls. Scans up first, then down, in that column.
  _clearSpawn(game, x, y) {
    const L = game.level;
    const col = Math.max(1, Math.min(L.width - 2, Math.floor(x / BLOCK_SIZE)));
    const clear = (r) => r >= 1 && r < L.height && !L.isSolid(r, col) && !L.isSolid(r - 1, col);
    let r = Math.max(1, Math.min(L.height - 2, Math.floor(y / BLOCK_SIZE)));
    if (!clear(r)) {
      let found = -1;
      for (let rr = r; rr >= 1; rr--)        { if (clear(rr)) { found = rr; break; } }
      if (found < 0) for (let rr = r + 1; rr < L.height; rr++) { if (clear(rr)) { found = rr; break; } }
      if (found >= 0) r = found;
    }
    return { x: col * BLOCK_SIZE + BLOCK_SIZE / 2, y: r * BLOCK_SIZE + BLOCK_SIZE };
  },

  // Owner ids ('p1'..'p4') for the players present this match (Phase 3B/3).
  // Prefer the live players[] roster (accurate for 1-4 players); fall back to legacy.
  _ownerIds(game) {
    const live = (typeof game.activePlayers === 'function') ? game.activePlayers() : null;
    if (live && live.length) return live.map((p, i) => p._ownerId || ('p' + (i + 1)));
    const n = (typeof game._numPlayers === 'function') ? game._numPlayers() : (game.player2 ? 2 : 1);
    return Array.from({ length: n }, (_, i) => 'p' + (i + 1));
  },
  // Individual stats for a player id (always tracked; see game.js arenaState.stats):
  //   { kills, mobKills, emeralds, flagCaptures, towerDamage }
  statOf(game, id) { return (game.arenaState.stats && game.arenaState.stats[id]) || {}; },

  // Number of survival waves fully defeated so far (shared objective).
  _wavesDefeated(game) { const ms = game._arenaMode; return (ms && ms.wavesCleared) || 0; },

  // A team's CTF captures = sum of its members' flagCaptures (the team objective).
  _teamCaptures(game, teamId) {
    let n = 0;
    for (const p of game.activePlayers()) if (p && p.teamId === teamId) n += (this.statOf(game, p._ownerId).flagCaptures || 0);
    return n;
  },

  // The live ruleset for this match (from arena-rules.js), cached per mode. This
  // is what makes the modes run through the declarative rules engine: scoring and
  // (Deathmatch/CTF/Tower) win-detection delegate to it. Element side-effects
  // (hill accrual, wave spawning) still live in this file's update() for now.
  _rulesetFor(game) {
    if (typeof ARENA_RULES === 'undefined') return null;
    const key = game._arenaMode ? game._arenaMode.key : null;
    const cacheKey = key || 'QUICK_BATTLE';
    if (!game._ruleset || game._rulesetKey !== cacheKey) {
      game._ruleset = ARENA_RULES.rulesetForMode(key, game.arenaConfig || {});
      game._rulesetKey = cacheKey;
    }
    return game._ruleset;
  },

  // Per-player SCORE — delegates to the rules engine (weighted stats + shared
  // match counters). Per-player individual points sum for a team; match-level
  // counters (waves) are shared. Quick Battle = kills+mobKills+emeralds, etc.
  playerScore(game, id) {
    const rs = this._rulesetFor(game);
    if (rs) return ARENA_RULES.playerScore(rs, game, id);
    const st = this.statOf(game, id); // fallback if the engine isn't loaded
    return (st.kills || 0) + (st.mobKills || 0) + (st.emeralds || 0);
  },

  // Team score — delegates to the rules engine (sum of members' individual
  // points + the shared component once).
  teamScore(game, teamId) {
    const rs = this._rulesetFor(game);
    if (rs) return ARENA_RULES.teamScore(rs, game, teamId);
    const members = game.activePlayers().filter(p => p && p.teamId === teamId);
    return members.reduce((s, p) => s + this.playerScore(game, p._ownerId), 0);
  },

  // Highest / who-leads among per-player scores (Deathmatch win + end screen).
  _leader(game) {
    let bestId = 'p1', best = -1;
    for (const id of this._ownerIds(game)) {
      const sc = this.playerScore(game, id);
      if (sc > best) { best = sc; bestId = id; }
    }
    return { id: bestId, score: best };
  },

  // Per-frame win-condition check; sets arenaState.phase='ended' when met.
  update(game) {
    const ms = game._arenaMode;
    if (!ms) return;
    const a = game.arenaState;
    const rs = this._rulesetFor(game);
    const el = (rs && rs.elements) || {};
    // Element side-effects run by ACTIVE ELEMENT (not the mode key) so Custom
    // Rules composing hill + waves + objectives all tick. Win-detection is unified
    // through the rules engine for every mode (KOTH has no win conditions → it
    // simply runs the full timer; Survival/Emeralds/Quick end via structural).
    if (el.hill || ms.hold) this._updateHill(game, ms);
    if (el.waveSpawns || ms.wave !== undefined) this._updateWaves(game, ms);
    if (this._engineEnd(game)) a.phase = 'ended';
  },

  // King-of-the-Hill accrual + live hill stats. Runs whenever the hill element is
  // active (KOTH preset, or a Custom ruleset with hill enabled).
  _updateHill(game, ms) {
    if (!ms.hold) return;
    const live = game.activePlayers();
    const onIds = [];
    for (const p of live) { if (this._onHill(game, p)) onIds.push(p._ownerId || 'p1'); }
    ms.contested = onIds.length >= 2;
    const solo = live.length <= 1;
    if (solo) {
      if (onIds.length === 1) { ms.ownerId = onIds[0]; ms.hold[ms.ownerId]++; }
    } else if (ms.scoring === 'ALL') {
      for (const id of onIds) ms.hold[id]++;
      if (onIds.length === 1) ms.ownerId = onIds[0];
    } else if (ms.scoring === 'SOLE') {
      if (onIds.length === 1) { ms.ownerId = onIds[0]; ms.hold[ms.ownerId]++; }
      else if (onIds.length >= 2) ms.ownerId = null;
    } else { // STICKY (default): sole toucher takes/keeps ownership + accrues.
      if (onIds.length === 1) ms.ownerId = onIds[0];
      if (ms.ownerId) ms.hold[ms.ownerId]++;
    }
    // Live stats: total seconds held + longest consecutive streak (per player).
    const stats = game.arenaState.stats;
    for (const id of this._ownerIds(game)) if (stats[id]) stats[id].hillSeconds = Math.floor((ms.hold[id] || 0) / 60);
    if (ms.ownerId) {
      ms._streakFrames = (ms._streakOwner === ms.ownerId) ? (ms._streakFrames || 0) + 1 : 1;
      ms._streakOwner = ms.ownerId;
      const s = stats[ms.ownerId];
      if (s) s.hillStreak = Math.max(s.hillStreak || 0, Math.floor(ms._streakFrames / 60));
    } else { ms._streakOwner = null; ms._streakFrames = 0; }
  },

  // Survival wave spawning + wavesCleared count. The WIN (all waves survived) and
  // LOSS (all players dead) are decided by the engine (structural conditions).
  _updateWaves(game, ms) {
    if (ms.wave === undefined) return;
    const aliveMobs = game.mobManager.mobs.filter(mb => mb.alive).length;
    if (aliveMobs === 0) {
      if (ms.waveActive) { ms.wavesCleared = (ms.wavesCleared || 0) + 1; ms.waveActive = false; }
      if (ms.wave >= ms.totalWaves) { ms.cleared = true; return; } // win handled by engine (survivedAllWaves)
      if (ms.betweenTimer > 0) ms.betweenTimer--;
      else { this._spawnSurvivalWave(game, ms); ms.betweenTimer = 120; }
    }
  },

  // Rules-engine end check (excludes the arena timer, which game.js applies).
  _engineEnd(game) {
    const rs = this._rulesetFor(game);
    return rs ? ARENA_RULES.isEnded(rs, game, false) : false;
  },

  // Final score for the end screen + leaderboard. Higher = better for all modes
  // (Time Attack scores by seconds remaining so faster clears rank higher).
  score(game) {
    const ms = game._arenaMode;
    switch (ms && ms.key) {
      case 'COLLECT_EMERALDS':
        return (typeof EMERALD_SYSTEM !== 'undefined') ? EMERALD_SYSTEM.collected : this._leader(game).score;
      case 'KING_OF_HILL':
        return Math.round(this._kothMax(game) / 60);           // best seconds held
      case 'SURVIVAL_WAVES':
        return this._wavesDefeated(game);                       // waves fully defeated
      case 'DEATHMATCH':
        return this._leader(game).score;                        // top eliminations
      case 'CAPTURE_FLAG':
        return Math.max(this._teamCaptures(game, 0), this._teamCaptures(game, 1));
      case 'DEFEND_TOWER':
        return (typeof TOWER_SYSTEM !== 'undefined' && TOWER_SYSTEM.towers)
          ? TOWER_SYSTEM.towers.reduce((m, t) => Math.max(m, t.hp), 0) : 0; // most tower HP left
      default:
        return this._leader(game).score; // Quick Battle (k+m+e) / Mob Hunter (mobKills)
    }
  },

  // HUD line under the timer/kills.
  getHUDText(game) {
    const ms = game._arenaMode; if (!ms) return '';
    switch (ms.key) {
      case 'COLLECT_EMERALDS':
        return (typeof EMERALD_SYSTEM !== 'undefined') ? EMERALD_SYSTEM.hudText() : '';
      case 'KING_OF_HILL': {
        // Sticky keeps the owner even while contested; Sole/ALL show CONTESTED.
        const showContested = ms.contested && ms.scoring !== 'STICKY';
        const owner = showContested ? 'CONTESTED' : (ms.ownerId ? ms.ownerId.toUpperCase() : '—');
        const live = game.activePlayers();
        if (live.length >= 2) {
          const parts = live.map(p => { const id = p._ownerId || 'p1'; return `${id.toUpperCase()}:${Math.round((ms.hold[id] || 0) / 60)}s`; });
          return `Hill: ${owner}   ${parts.join('  ')}`;
        }
        return `Hill: ${owner}   ${Math.round(this._kothMax(game) / 60)}s held`;
      }
      case 'SURVIVAL_WAVES':
        return `Wave ${Math.max(1, ms.wave)}/${ms.totalWaves || '?'}   Defeated: ${this._wavesDefeated(game)}`;
      case 'DEATHMATCH': {
        const parts = this._ownerIds(game).map(id => `${id.toUpperCase()}:${this.playerScore(game, id)}`);
        return `${parts.join('  ')}   (to ${ms.killTarget})`;
      }
      case 'CAPTURE_FLAG': {
        const names = (typeof CTF_TEAM_NAMES !== 'undefined') ? CTF_TEAM_NAMES : ['Red', 'Blue'];
        return `${names[0]} ${this._teamCaptures(game, 0)} — ${this._teamCaptures(game, 1)} ${names[1]}   (to ${ms.captureTarget})`;
      }
      case 'DEFEND_TOWER':
        return (typeof TOWER_SYSTEM !== 'undefined') ? TOWER_SYSTEM.hudText() : '';
      default: {
        // Quick Battle / Mob Hunter / Custom — per-player score, plus each
        // player's stage progress for a sequenced Custom ruleset (per-player win).
        const rs = (ms.key === 'CUSTOM' && typeof ARENA_RULES !== 'undefined') ? this._rulesetFor(game) : null;
        const hasStages = !!(rs && rs.stages && rs.stages.length);
        const parts = this._ownerIds(game).map(id => {
          let s = `${id.toUpperCase()}:${this.playerScore(game, id)}`;
          if (hasStages) { const si = ARENA_RULES.stageInfo(rs, game, id); if (si) s += ` [S${Math.min(si.index + 1, si.total)}/${si.total}]`; }
          return s;
        });
        return (parts.length > 1 || hasStages) ? parts.join('  ') : `Score: ${this.playerScore(game, 'p1')}`;
      }
    }
  },

  // Winner label for the end screen (Deathmatch → which player). Others: generic.
  winnerText(game) {
    const ms = game._arenaMode;
    if (ms && ms.key === 'DEATHMATCH') return this._leader(game).id.toUpperCase() + ' wins!';
    // KotH is a contest between 2+ players → name the top holder.
    if (ms && ms.key === 'KING_OF_HILL' && game.activePlayers().length >= 2) return this._kothLeader(game).toUpperCase() + ' wins the hill!';
    // Defend the Tower → destroyer wins; on timeout, most tower HP left wins.
    if (ms && ms.key === 'DEFEND_TOWER') {
      if (typeof TOWER_SYSTEM === 'undefined') return null;
      const w = TOWER_SYSTEM.winner();
      if (w) return `${w.toUpperCase()} wins — Tower destroyed!`;
      const ts = TOWER_SYSTEM.towers || [];
      if (!ts.length) return null;
      const top = ts.reduce((a, b) => (b.hp > a.hp ? b : a));
      const tie = ts.filter(t => t.hp === top.hp).length > 1;
      return tie ? "It's a tie!" : `${top.ownerId.toUpperCase()} wins — Tower stood tallest!`;
    }
    // CTF → name the winning team by capture count.
    if (ms && ms.key === 'CAPTURE_FLAG') {
      const t0 = this._teamCaptures(game, 0), t1 = this._teamCaptures(game, 1);
      const names = (typeof CTF_TEAM_NAMES !== 'undefined') ? CTF_TEAM_NAMES : ['Red', 'Blue'];
      if (t0 === t1) return "It's a tie!";
      return `${t1 > t0 ? names[1] : names[0]} team wins!`;
    }
    // Custom Rules → use the ruleset's winnerBy (rules engine).
    if (ms && ms.key === 'CUSTOM' && typeof ARENA_RULES !== 'undefined') {
      const rs = this._rulesetFor(game);
      const w = rs ? ARENA_RULES.winner(rs, game) : null;
      return w ? `${w.toUpperCase()} wins!` : "It's a tie!";
    }
    return null;
  },

  label(key) { return this.DEFS[key] ? this.DEFS[key].label : (key || 'Deathmatch'); },
};

if (typeof window !== 'undefined') window.ARENA_MODES = ARENA_MODES;
