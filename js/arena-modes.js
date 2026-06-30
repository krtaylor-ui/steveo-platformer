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
    // Reserved — implemented in later phases (need PvP / teams). Shown greyed in pickers.
    DEATHMATCH:       { label: 'Deathmatch',       desc: 'Most player eliminations wins. (Coming soon)', comingSoon: true },
    CAPTURE_FLAG:     { label: 'Capture the Flag', desc: 'Capture the enemy flag. (Coming soon)',        comingSoon: true },
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
    if (modeKey === 'SURVIVAL_WAVES') {
      ms.wave = 0;
      ms.totalWaves = Math.max(1, Math.min(15, (game.arenaConfig && game.arenaConfig.survivalWaveCount) || this.SURVIVAL_DEFAULT.length));
      ms.betweenTimer = 90; // short delay before wave 1 (lets the countdown clear)
      ms.cleared = false;    // true once all waves are survived (win)
    }
    game._arenaMode = ms;
  },

  // True while any player controls the hill. Uses the designed W×H control zone
  // (game._arenaHill) if placed — the player's horizontal centre must be over the
  // zone and their feet within it (allows standing on top of a thin platform OR
  // inside a tall zone) — else the arena-centre radius (hill-less worlds).
  _holding(game) {
    const hill = game._arenaHill;
    const within = (p) => {
      if (!p) return false;
      const pcx = p.x + (p.width || PLAYER_W) / 2;
      if (hill) {
        const feetY = p.y + (p.height || PLAYER_H);
        return pcx >= hill.x && pcx <= hill.x + hill.w && feetY >= hill.y - 10 && feetY <= hill.y + hill.h + 14;
      }
      const cx = game.level.pixelWidth / 2, cy = game.level.pixelHeight / 2;
      const pcy = p.y + (p.height || PLAYER_H) / 2;
      return Math.hypot(pcx - cx, pcy - cy) <= this.HILL_RADIUS_BLOCKS * BLOCK_SIZE;
    };
    return within(game.player) || within(game.player2);
  },

  // Spawn one survival wave from its config def (zombies + skeletons, HP ×hp),
  // distributed across the designed spawn-lines (or spread across the top if none).
  _spawnSurvivalWave(game, ms) {
    ms.wave++;
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

  // Per-frame win-condition check; sets arenaState.phase='ended' when met.
  update(game) {
    const ms = game._arenaMode;
    if (!ms) return;
    const a = game.arenaState;
    switch (ms.key) {
      case 'COLLECT_EMERALDS':
        if (typeof EMERALD_SYSTEM !== 'undefined' && EMERALD_SYSTEM.allRoundsComplete()) a.phase = 'ended';
        break;
      case 'KING_OF_HILL':
        if (this._holding(game)) ms.holdFrames++;
        if (ms.holdFrames >= this.HOLD_TARGET_FRAMES) a.phase = 'ended';
        break;
      case 'SURVIVAL_WAVES': {
        // Lose: no player alive (solo: P1 dead; co-op: both dead).
        const p1Dead = !game.player || game.player.hp <= 0;
        const p2Dead = !game.player2 || game.player2.hp <= 0;
        if (p1Dead && p2Dead) { a.phase = 'ended'; break; }
        // Once the arena is clear: win if all waves done, else spawn the next.
        const aliveMobs = game.mobManager.mobs.filter(mb => mb.alive).length;
        if (aliveMobs === 0) {
          if (ms.wave >= ms.totalWaves) { ms.cleared = true; a.phase = 'ended'; break; }
          if (ms.betweenTimer > 0) ms.betweenTimer--;
          else { this._spawnSurvivalWave(game, ms); ms.betweenTimer = 120; }
        }
        break;
      }
      case 'MOB_HUNTER':
      default:
        break; // timer-bound; the caller ends on timeUp
    }
  },

  // Final score for the end screen + leaderboard. Higher = better for all modes
  // (Time Attack scores by seconds remaining so faster clears rank higher).
  score(game) {
    const ms = game._arenaMode; if (!ms) return 0;
    const kills = (game.arenaState.scores.p1 || 0) + (game.arenaState.scores.p2 || 0);
    switch (ms.key) {
      case 'COLLECT_EMERALDS':
        return (typeof EMERALD_SYSTEM !== 'undefined') ? EMERALD_SYSTEM.collected : 0;
      case 'KING_OF_HILL':
        return Math.round(ms.holdFrames / 60);
      case 'SURVIVAL_WAVES':
        return kills + (ms.wave || 0) * 50 + (ms.cleared ? 100 : 0); // +50/wave, +1/kill, +100 clear-all
      default:
        return kills; // MOB_HUNTER
    }
  },

  // HUD line under the timer/kills.
  getHUDText(game) {
    const ms = game._arenaMode; if (!ms) return '';
    switch (ms.key) {
      case 'COLLECT_EMERALDS':
        return (typeof EMERALD_SYSTEM !== 'undefined') ? EMERALD_SYSTEM.hudText() : '';
      case 'KING_OF_HILL':
        return `Hold: ${Math.round(ms.holdFrames / 60)}s / ${Math.round(this.HOLD_TARGET_FRAMES / 60)}s`;
      case 'SURVIVAL_WAVES':
        return `Wave ${Math.max(1, ms.wave)}/${ms.totalWaves || '?'}   Kills: ${game.arenaState.scores.p1 || 0}`;
      default:
        return `Kills: ${game.arenaState.scores.p1 || 0}`;
    }
  },

  label(key) { return this.DEFS[key] ? this.DEFS[key].label : (key || 'Deathmatch'); },
};

if (typeof window !== 'undefined') window.ARENA_MODES = ARENA_MODES;
