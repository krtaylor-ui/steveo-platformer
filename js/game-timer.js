// ============================================================
// game-timer.js — Session + persistent total play-time tracker
// ============================================================
//
// SESSION timer: time spent playing THIS game in the current session.
//   Starts at 0 every time a game is launched/continued and only counts
//   while the game is actively playing (not paused, not on the start splash).
//
// GAME (total) timer: cumulative play time across every session of this
//   game. Loaded from the save (game.totalGameTime) and continued.
//
// The running total is written back onto game.totalGameTime every tick so
// the 10s auto-save persists it with no extra wiring.
// ============================================================

const GAME_TIMER = {
  game:        null,
  sessionMs:   0,      // accumulated play time this session (paused-aware)
  baseTotalMs: 0,      // total loaded from the save
  _lastTick:   0,
  _interval:   null,

  // Start tracking for a freshly-launched/continued game. Session resets to 0.
  init(game) {
    this.stop();
    this.game        = game;
    this.sessionMs   = 0;
    this.baseTotalMs = (game && game.totalGameTime) || 0;
    this._lastTick   = Date.now();
    this.update();                       // paint immediately
    this._interval = setInterval(() => this.update(), 500);
    console.log('[GameTimer] started — base total', this.baseTotalMs, 'ms');
  },

  // Accumulate elapsed time only while the game is actively playing, then
  // persist the total onto the game object and refresh the HUD.
  update() {
    if (!this.game) return;
    const now = Date.now();
    const dt  = now - this._lastTick;
    this._lastTick = now;

    // Only count time when actually playing (skip pause / splash / dead / won).
    if (this.game.state === 'playing') this.sessionMs += dt;

    const total = this.baseTotalMs + this.sessionMs;
    this.game.totalGameTime = total;     // keep auto-save's value current
    this.updateHUD(this.sessionMs, total);
  },

  updateHUD(sessionMs, totalMs) {
    const hud = document.getElementById('game-timer-hud');
    if (!hud) return;
    hud.textContent = `⏱️ Session ${this.formatTime(sessionMs)}  ·  Game ${this.formatTime(totalMs)}`;
  },

  // ms → "M:SS" or "H:MM:SS"
  formatTime(ms) {
    const totalSeconds = Math.floor((ms || 0) / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  },

  getTotalTime() {
    return this.baseTotalMs + this.sessionMs;
  },

  // Stop tracking and flush the final total onto the game object.
  stop() {
    if (this._interval) { clearInterval(this._interval); this._interval = null; }
    if (this.game) this.game.totalGameTime = this.getTotalTime();
    this.game = null;
  },
};
