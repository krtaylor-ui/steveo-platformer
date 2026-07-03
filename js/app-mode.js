// ============================================================
// app-mode.js — Session mode: 'online' (cloud, Supabase) vs 'local' (offline,
// localStorage / guest). Chosen on the start screen ("Play Online / Play
// Offline") and remembered. Data-access code branches on APP_MODE.isLocal():
// online → AUTH.authedFetch; local → the localStorage world provider.
//
// (Phase 1a: the flag + entry routing + dashboard greying. The local data
// provider that makes offline worlds fully functional lands in Phase 1b.)
// ============================================================

const APP_MODE = {
  KEY: 'steveo_session_mode',
  _mode: null,

  get() {
    if (this._mode) return this._mode;
    try { return localStorage.getItem(this.KEY); } catch (e) { return null; }
  },
  set(m) {
    this._mode = m;
    try { localStorage.setItem(this.KEY, m); } catch (e) {}
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.toggle('offline-mode', m === 'local');
    }
  },
  isLocal()  { return this.get() === 'local'; },
  isOnline() { return this.get() === 'online'; },
  // The last remembered choice (for defaulting the start-screen focus).
  last() { try { return localStorage.getItem(this.KEY); } catch (e) { return null; } },
};

if (typeof window !== 'undefined') window.APP_MODE = APP_MODE;
