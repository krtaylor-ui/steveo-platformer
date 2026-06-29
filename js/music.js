// ============================================================
// music.js — Global music mute toggle (persists in localStorage)
// ============================================================
//
// The actual music is produced inside the game (Game._musicSystem.bgAudio)
// and the legacy menu (window._menuAudio). This control stores a single
// "muted" preference and applies it to whatever audio is currently live.
// Game._initAudio also reads MUSIC_CONTROL.isMuted() so music launched
// later starts muted when the preference is set.
// ============================================================

const MUSIC_CONTROL = {
  _muted: localStorage.getItem('musicMuted') === 'true',

  isMuted() { return this._muted; },

  init() {
    document.querySelectorAll('.btn-mute').forEach(btn => {
      btn.addEventListener('click', () => this.toggle());
    });
    this.apply();
    this.updateUI();
  },

  toggle() {
    this._muted = !this._muted;
    localStorage.setItem('musicMuted', String(this._muted));
    this.apply();
    this.updateUI();
  },

  // Mute/unmute every live audio source we know about.
  apply() {
    const bg = window.game && window.game._musicSystem && window.game._musicSystem.bgAudio;
    if (bg) bg.muted = this._muted;
    if (window._menuAudio) window._menuAudio.muted = this._muted;
  },

  updateUI() {
    document.querySelectorAll('.btn-mute').forEach(btn => {
      btn.textContent = this._muted ? '🔇' : '🔊';
      btn.classList.toggle('muted', this._muted);
      btn.title = this._muted ? 'Unmute music' : 'Mute music';
    });
  },
};

document.addEventListener('DOMContentLoaded', () => MUSIC_CONTROL.init());
