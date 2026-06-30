// ============================================================
// arena-modes.js — Arena game modes (Phase 3A.2)
//
// Layered on the existing arenaState machine (phase: countdown|running|ended).
// Game._setupArena calls initMode(); the arena running branch calls update()
// each frame (its win condition flips arenaState.phase to 'ended'); _drawArenaHUD
// shows getHUDText(); _drawArenaEnd shows label() + score().
//
//   FIGHT_MOBS       waves of bots; score = kills; timer-bound
//   COLLECT_EMERALDS collect every emerald to win; score = emeralds
//   KING_OF_HILL     hold the arena-center radius; win at the hold target
//   TIME_ATTACK      collect every emerald; scored by time remaining
//   SURVIVAL_WAVES   endless until death; score = kills
// ============================================================

const ARENA_MODES = {
  DEFS: {
    FIGHT_MOBS:       { label: 'Fight Mobs',      desc: 'Defeat the bots before time runs out.' },
    COLLECT_EMERALDS: { label: 'Collect Emeralds', desc: 'Grab every emerald in the arena.' },
    KING_OF_HILL:     { label: 'King of the Hill', desc: 'Hold the center to win.' },
    TIME_ATTACK:      { label: 'Time Attack',     desc: 'Collect all emeralds as fast as you can.' },
    SURVIVAL_WAVES:   { label: 'Survival Waves',  desc: 'Endless waves — survive as long as you can.' },
  },

  HOLD_TARGET_FRAMES: 1200,         // 20s @60fps to win King of the Hill
  HILL_RADIUS_BLOCKS: 4,

  initMode(modeKey, game) {
    game._arenaMode = { key: modeKey, holdFrames: 0 };
  },

  // True while any player stands within the hill radius of the arena center.
  _holding(game) {
    const cx = game.level.pixelWidth / 2, cy = game.level.pixelHeight / 2;
    const r  = this.HILL_RADIUS_BLOCKS * BLOCK_SIZE;
    const within = (p) => {
      if (!p) return false;
      const pcx = p.x + (p.width || PLAYER_W) / 2, pcy = p.y + (p.height || PLAYER_H) / 2;
      return Math.hypot(pcx - cx, pcy - cy) <= r;
    };
    return within(game.player) || within(game.player2);
  },

  // Per-frame win-condition check; sets arenaState.phase='ended' when met.
  update(game) {
    const ms = game._arenaMode;
    if (!ms) return;
    const a = game.arenaState;
    switch (ms.key) {
      case 'COLLECT_EMERALDS':
      case 'TIME_ATTACK':
        if (typeof EMERALD_SYSTEM !== 'undefined' && EMERALD_SYSTEM.allCollected()) a.phase = 'ended';
        break;
      case 'KING_OF_HILL':
        if (this._holding(game)) ms.holdFrames++;
        if (ms.holdFrames >= this.HOLD_TARGET_FRAMES) a.phase = 'ended';
        break;
      case 'SURVIVAL_WAVES': {
        // End once no player is alive (solo: P1 dead; co-op: both dead).
        const p1Dead = !game.player || game.player.hp <= 0;
        const p2Dead = !game.player2 || game.player2.hp <= 0;
        if (p1Dead && p2Dead) a.phase = 'ended';
        break;
      }
      case 'FIGHT_MOBS':
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
      case 'TIME_ATTACK': {
        const dur = game.arenaConfig.gameDuration || 0;
        const elapsed = game.arenaState.gameStartTime
          ? (game.arenaState.endTime || Date.now()) - game.arenaState.gameStartTime : 0;
        return Math.max(0, Math.round((dur - elapsed) / 1000));
      }
      case 'KING_OF_HILL':
        return Math.round(ms.holdFrames / 60);
      default:
        return kills; // FIGHT_MOBS, SURVIVAL_WAVES
    }
  },

  // HUD line under the timer/kills.
  getHUDText(game) {
    const ms = game._arenaMode; if (!ms) return '';
    switch (ms.key) {
      case 'COLLECT_EMERALDS':
      case 'TIME_ATTACK':
        return (typeof EMERALD_SYSTEM !== 'undefined') ? `Emeralds: ${EMERALD_SYSTEM.collected}/${EMERALD_SYSTEM.total}` : '';
      case 'KING_OF_HILL':
        return `Hold: ${Math.round(ms.holdFrames / 60)}s / ${Math.round(this.HOLD_TARGET_FRAMES / 60)}s`;
      case 'SURVIVAL_WAVES':
        return `Survive!  Kills: ${game.arenaState.scores.p1 || 0}`;
      default:
        return `Kills: ${game.arenaState.scores.p1 || 0}`;
    }
  },

  label(key) { return this.DEFS[key] ? this.DEFS[key].label : (key || 'Deathmatch'); },
};

if (typeof window !== 'undefined') window.ARENA_MODES = ARENA_MODES;
