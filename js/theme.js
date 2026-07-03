// ============================================================
// theme.js — UI theme manager (Phase 3)
// ------------------------------------------------------------
// Two built-in presets applied live via <html data-theme>:
//   'modern' (default) — clean dark, indigo accent, sans-serif
//   'retro'            — the original 8-bit neon-monospace look
// The choice is stored per-browser in localStorage ('steveo_theme') and applied
// before first paint by an inline <head> script; this module handles live
// switching + the toggle control. Extensible: add a preset to THEMES + tokens
// in style.css and it appears in the cycle automatically.
//
// Scope: UI chrome only (menus, dashboard, HUD overlay, editor UI, modals).
// In-canvas pixel art / canvas-rendered menus are intentionally NOT themed.
// ============================================================

const THEME = {
  KEY: 'steveo_theme',
  THEMES: ['modern', 'retro'],
  LABELS: { modern: 'Modern', retro: '8-bit Retro' },
  ICONS:  { modern: '🌙', retro: '👾' },

  get() {
    let t = 'modern';
    try { t = localStorage.getItem(this.KEY) || 'modern'; } catch (e) {}
    return this.THEMES.includes(t) ? t : 'modern';
  },

  apply(theme) {
    const t = this.THEMES.includes(theme) ? theme : 'modern';
    // Modern is the default (:root); only set the attribute for non-default themes.
    if (t === 'modern') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(this.KEY, t); } catch (e) {}
    this._refreshButtons(t);
    return t;
  },

  set(theme) { return this.apply(theme); },

  // Advance to the next preset in the cycle (used by the toggle button).
  cycle() {
    const cur = this.get();
    const i = this.THEMES.indexOf(cur);
    return this.apply(this.THEMES[(i + 1) % this.THEMES.length]);
  },

  _refreshButtons(t) {
    const cur = t || this.get();
    document.querySelectorAll('.theme-toggle-btn').forEach((btn) => {
      btn.textContent = this.ICONS[cur] || '🎨';
      btn.title = `Theme: ${this.LABELS[cur] || cur} (click to switch)`;
    });
  },

  // Wire any existing .theme-toggle-btn elements + apply the stored theme.
  init() {
    this.apply(this.get());
    document.querySelectorAll('.theme-toggle-btn').forEach((btn) => {
      if (btn._themeWired) return;
      btn._themeWired = true;
      btn.addEventListener('click', () => this.cycle());
    });
  },
};

if (typeof window !== 'undefined') {
  window.THEME = THEME;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => THEME.init());
  } else {
    THEME.init();
  }
}
