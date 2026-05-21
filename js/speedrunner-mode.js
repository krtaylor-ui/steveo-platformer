// ============================================================
// speedrunner-mode.js — Speed Runner mode helpers
// Ghost recording/playback, leaderboard, boost system
// ============================================================

const SR_CONFIG = {
  maxMultiplier:        2.0,    // hard cap on combined speed multipliers
  timeBoostIntervalSec: 5,      // +5% every N seconds of continuous running
  timeBoostPct:         0.05,   // boost amount per time interval
  timeBoostCap:         2.0,
  distBoostIntervalPx:  5 * 32, // +5% every 5 blocks of continuous running
  distBoostPct:         0.05,   // boost amount per distance interval
  distBoostCap:         2.0,
  boosterBlockBoost:    0.5,    // +50% while inside SPEED_BOOSTER block
  jumpPadVY:            -18,    // strong upward launch velocity
  itemBoost:            0.15,   // +15% per stack level
  itemStackMax:         3,
  itemDurationMs:       3000,   // 3 s per item collect
  itemExtensionMs:      3000,   // each extra item extends by 3 s
  respawnFadeMs:        1000,   // 1 s death fade-in
  respawnWaitMs:        1500,   // then 1.5 s before "press space" prompt
};

// ── Ghost recording & playback ───────────────────────────────

class SpeedRunnerGhost {
  constructor(levelId) {
    this.levelId  = levelId;
    this.frames   = [];
    this.finishMs = 0;
    this._t0      = Date.now();
  }

  record(player) {
    this.frames.push({
      x: Math.round(player.x),
      y: Math.round(player.y),
      t: Date.now() - this._t0,
    });
  }

  finish(ms) { this.finishMs = ms; }

  toSaveData(playerName, playerColor) {
    return {
      levelId:     this.levelId,
      frames:      this.frames,
      finishMs:    this.finishMs,
      playerName:  playerName  || 'Ghost',
      playerColor: playerColor || '#AAAAAA',
    };
  }

  // Save only if this run is faster than the stored best.
  static saveIfBest(data, levelId) {
    const key = `sr_ghost_${levelId}`;
    const old = SpeedRunnerGhost.loadData(levelId);
    if (!old || data.finishMs < old.finishMs) {
      try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
    }
  }

  static loadData(levelId) {
    try {
      const raw = localStorage.getItem(`sr_ghost_${levelId}`);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
}

// ── Local leaderboard (top 5 per level) ─────────────────────

const SpeedRunnerLeaderboard = {
  get(levelId) {
    try {
      return JSON.parse(localStorage.getItem(`sr_lb_${levelId}`) || '[]');
    } catch { return []; }
  },

  qualifies(levelId, ms) {
    const lb = this.get(levelId);
    return lb.length < 5 || ms < lb[lb.length - 1].ms;
  },

  add(levelId, name, ms) {
    let lb = this.get(levelId);
    const clean = (name || 'AAA').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || 'AAA';
    lb.push({ name: clean, ms });
    lb.sort((a, b) => a.ms - b.ms);
    lb = lb.slice(0, 5);
    try { localStorage.setItem(`sr_lb_${levelId}`, JSON.stringify(lb)); } catch {}
    return lb;
  },
};

// ── Time formatter  ──────────────────────────────────────────

function srFormatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m  = Math.floor(totalSec / 60);
  const s  = String(totalSec % 60).padStart(2, '0');
  const cs = String(Math.floor((ms % 1000) / 10)).padStart(2, '0');
  return `${m}:${s}.${cs}`;
}
