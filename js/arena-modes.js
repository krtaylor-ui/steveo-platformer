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
        if (p1Dead && p2Dead) a.phase = 'ended';
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
      default:
        return kills; // MOB_HUNTER, SURVIVAL_WAVES
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
        return `Survive!  Kills: ${game.arenaState.scores.p1 || 0}`;
      default:
        return `Kills: ${game.arenaState.scores.p1 || 0}`;
    }
  },

  label(key) { return this.DEFS[key] ? this.DEFS[key].label : (key || 'Deathmatch'); },
};

if (typeof window !== 'undefined') window.ARENA_MODES = ARENA_MODES;
