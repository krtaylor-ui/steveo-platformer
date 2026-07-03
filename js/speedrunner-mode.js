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
  countdownMs:          3000,   // race-light countdown before GO (3·2·1·GO)
  perfectStartMs:       120,    // press accelerate within this of GO → perfect start
  perfectStartBoost:    0.25,   // +25% (item-style) boost for a perfect start
  perfectStartMsDur:    2500,   // how long the perfect-start boost lasts
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

// ── Account helpers: remembered initials + username ─────────
// Persist the player's initials against their account so a returning player
// doesn't re-type them each run (keyed to the account when logged in, else a
// shared local key). The username is recorded alongside the classic initials.

function _srInitialsKey() {
  try {
    const u = (typeof AUTH !== 'undefined' && AUTH.getUser && AUTH.getUser());
    const id = u && (u.id || u.email);
    return id ? `sr_initials_${id}` : 'sr_initials';
  } catch { return 'sr_initials'; }
}
function srGetSavedInitials() {
  try { return localStorage.getItem(_srInitialsKey()) || ''; } catch { return ''; }
}
function srSaveInitials(initials) {
  try { if (initials) localStorage.setItem(_srInitialsKey(), initials); } catch {}
}
function srUsername() {
  try {
    const u = (typeof AUTH !== 'undefined' && AUTH.getUser && AUTH.getUser());
    return (u && (u.user_metadata?.username || u.username || u.email)) || null;
  } catch { return null; }
}

// ── Local leaderboard (top 5 per level) ─────────────────────
// Source of truth for offline play. Entries now also carry the account
// `user`name (the initials stay the classic arcade display). SPEEDRUN_SYNC
// best-effort mirrors these to the server and merges server rows back in.

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

  _cleanName(name) {
    return (name || 'AAA').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || 'AAA';
  },

  // Merge a set of rows into the top-5 and persist. Dedups by name+ms so a row
  // that arrives from both local and server isn't double-counted.
  _mergeRows(levelId, rows) {
    let lb = this.get(levelId).concat(rows || [])
      .map(r => ({ name: this._cleanName(r.name), ms: r.ms, user: r.user || null }))
      .filter(r => typeof r.ms === 'number' && r.ms > 0);
    const seen = new Set();
    lb = lb.sort((a, b) => a.ms - b.ms).filter(r => {
      const k = `${r.name}|${r.ms}`;
      if (seen.has(k)) return false; seen.add(k); return true;
    }).slice(0, 5);
    try { localStorage.setItem(`sr_lb_${levelId}`, JSON.stringify(lb)); } catch {}
    return lb;
  },

  add(levelId, name, ms) {
    const clean = this._cleanName(name);
    srSaveInitials(clean); // remember for next time
    const lb = this._mergeRows(levelId, [{ name: clean, ms, user: srUsername() }]);
    // Best-effort server mirror (no-op offline / logged out).
    if (typeof SPEEDRUN_SYNC !== 'undefined') SPEEDRUN_SYNC.submit(levelId, clean, ms, srUsername());
    return lb;
  },
};

// ── Hybrid server sync (best-effort; local stays offline-capable) ──
const SPEEDRUN_SYNC = {
  async submit(levelId, name, ms, username) {
    if (typeof AUTH === 'undefined' || !AUTH.authedFetch || !AUTH.isLoggedIn || !AUTH.isLoggedIn()) return;
    try {
      await AUTH.authedFetch('/api/speedrun/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ levelId, name, ms, username }),
      });
    } catch (e) { /* offline / server down → local already has it */ }
  },

  async fetch(levelId) {
    if (typeof AUTH === 'undefined' || !AUTH.authedFetch) return [];
    try {
      const res = await AUTH.authedFetch(`/api/speedrun/results?levelId=${encodeURIComponent(levelId)}`);
      if (!res.ok) return [];
      const d = await res.json();
      return d.results || [];
    } catch (e) { return []; }
  },

  // Pull server rows for a level and merge into the local top-5. Returns the
  // merged list (or the current local list if the server had nothing / failed).
  async merge(levelId) {
    const rows = await this.fetch(levelId);
    return rows.length ? SpeedRunnerLeaderboard._mergeRows(levelId, rows)
                       : SpeedRunnerLeaderboard.get(levelId);
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
