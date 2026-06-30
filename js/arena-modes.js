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

  initMode(modeKey, game) {
    const ms = { key: modeKey, holdFrames: 0 };
    if (modeKey === 'SURVIVAL_WAVES') {
      ms.wave = 0;
      ms.waveBaseCount = Math.max(3, Math.min(10, (game.arenaConfig && game.arenaConfig.initialMobCount) || 5));
      ms.betweenTimer = 90; // short delay before wave 1 (lets the countdown clear)
    }
    game._arenaMode = ms;
  },

  // True while any player controls the hill. Uses the designed 4-wide platform
  // (game._arenaHill) if placed — player must stand on top of it — else the
  // arena-centre radius (back-compat for hill-less worlds).
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

  // Spawn one escalating survival wave from the designed spawn-lines (or, if none,
  // spread across the arena top). Wave N has waveBaseCount + 2·(N-1) mobs, each with
  // +(N-1) bonus HP on top of the difficulty preset.
  _spawnSurvivalWave(game, ms) {
    ms.wave++;
    const count   = ms.waveBaseCount + (ms.wave - 1) * 2;
    const markers = (game._arenaSpawnLines && game._arenaSpawnLines.length) ? game._arenaSpawnLines : null;
    const types   = ['Zombie', 'Skeleton'];
    for (let i = 0; i < count; i++) {
      let x, y;
      if (markers) { const m = markers[i % markers.length]; x = m.x + ((i % 3) - 1) * 16; y = m.y; }
      else { x = ((i + 1) / (count + 1)) * game.level.pixelWidth; y = BLOCK_SIZE * 2; }
      const mob = game.mobManager._createMob(types[i % types.length], x, y);
      if (mob) {
        const bonus = ms.wave - 1;
        if (bonus > 0) { mob.maxHp += bonus; mob.hp = mob.maxHp; }
        game.mobManager.mobs.push(mob);
      }
    }
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
        // End once no player is alive (solo: P1 dead; co-op: both dead).
        const p1Dead = !game.player || game.player.hp <= 0;
        const p2Dead = !game.player2 || game.player2.hp <= 0;
        if (p1Dead && p2Dead) { a.phase = 'ended'; break; }
        // Wave management: spawn the next escalating wave once the arena is clear.
        const aliveMobs = game.mobManager.mobs.filter(mb => mb.alive).length;
        if (aliveMobs === 0) {
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
        return kills + (ms.wave || 0) * 5; // +5 per wave reached, +1 per kill
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
        return `Wave ${ms.wave || 1}   Kills: ${game.arenaState.scores.p1 || 0}`;
      default:
        return `Kills: ${game.arenaState.scores.p1 || 0}`;
    }
  },

  label(key) { return this.DEFS[key] ? this.DEFS[key].label : (key || 'Deathmatch'); },
};

if (typeof window !== 'undefined') window.ARENA_MODES = ARENA_MODES;
