// ============================================================
// theme.js — UI theme manager (Phase 3)
// ------------------------------------------------------------
// Two built-in presets applied live via <html data-theme>:
//   'modern' (default) — clean dark, indigo accent, sans-serif
//   'retro'            — the original 8-bit neon-monospace look
// The choice is stored per-browser in localStorage ('steveo_theme') and applied
// before first paint by an inline <head> script; this module handles live
// switching + the toggle control.
//
// Retro FX (Phase 3 v3): when the retro theme is active, a set of independent
// 8-bit effects can be dialed in — pixel frame (9-slice border-image), pixel
// sprites, posterize (palette cut), chromatic aberration, scanlines, dither, and
// CRT vignette. Each is a data-fx-* attribute on <html>; CSS keys off them and
// they only apply to menu screens (gated by body:not(.in-game)). Stored as JSON
// in localStorage ('steveo_retro_fx'). Assets (frame + dither tile) are generated
// on a canvas at runtime → CSS vars, so nothing binary ships in the repo.
//
// Scope: UI chrome only (menus, dashboard, HUD overlay, editor UI, modals).
// In-canvas pixel art / canvas-rendered menus are intentionally NOT themed.
// ============================================================

const THEME = {
  KEY: 'steveo_theme',
  FX_KEY: 'steveo_retro_fx',
  THEMES: ['modern', 'retro'],
  LABELS: { modern: 'Modern', retro: '8-bit Retro' },
  ICONS:  { modern: '🌙', retro: '👾' },

  // Independent retro effects. Defaults = a tasteful "medium retro".
  FX_KEYS: ['frame', 'pixspr', 'post', 'aberr', 'scan', 'dither', 'crt'],
  FX_DEFAULTS: { frame: true, pixspr: true, post: true, aberr: false, scan: true, dither: false, crt: true, levels: 5 },
  _assetsBuilt: false,

  get() {
    let t = 'modern';
    try { t = localStorage.getItem(this.KEY) || 'modern'; } catch (e) {}
    return this.THEMES.includes(t) ? t : 'modern';
  },

  getFx() {
    let fx = {};
    try { fx = JSON.parse(localStorage.getItem(this.FX_KEY) || '{}') || {}; } catch (e) {}
    const out = Object.assign({}, this.FX_DEFAULTS, fx);
    out.levels = Math.max(2, Math.min(8, parseInt(out.levels, 10) || this.FX_DEFAULTS.levels));
    for (const k of this.FX_KEYS) out[k] = !!out[k];
    return out;
  },

  setFx(patch) {
    const fx = Object.assign(this.getFx(), patch || {});
    try { localStorage.setItem(this.FX_KEY, JSON.stringify(fx)); } catch (e) {}
    this._applyFx();
    return fx;
  },

  apply(theme) {
    const t = this.THEMES.includes(theme) ? theme : 'modern';
    // Modern is the default (:root); only set the attribute for non-default themes.
    if (t === 'modern') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(this.KEY, t); } catch (e) {}
    this._applyFx();
    this._refreshButtons(t);
    return t;
  },

  set(theme) { return this.apply(theme); },

  cycle() {
    const cur = this.get();
    const i = this.THEMES.indexOf(cur);
    return this.apply(this.THEMES[(i + 1) % this.THEMES.length]);
  },

  // Reflect the current FX state onto <html> as data-fx-* attributes (only in
  // retro; cleared otherwise). Also (lazily) builds the frame + dither assets
  // and sets the posterize level.
  _applyFx() {
    const root = document.documentElement;
    const retro = this.get() === 'retro';
    const fx = this.getFx();
    for (const k of this.FX_KEYS) {
      if (retro && fx[k]) root.setAttribute('data-fx-' + k, '');
      else root.removeAttribute('data-fx-' + k);
    }
    if (retro) { this._buildAssets(); this._setPosterizeLevels(fx.levels); }
  },

  // Generate the pixel frame (9-slice) + Bayer dither tile once, expose as CSS
  // custom properties --frame / --dither.
  _buildAssets() {
    if (this._assetsBuilt || typeof document === 'undefined') return;
    this._assetsBuilt = true;
    try {
      const root = document.documentElement.style;
      root.setProperty('--frame', 'url("' + this._makeFrame() + '")');
      root.setProperty('--dither', 'url("' + this._makeDither() + '")');
    } catch (e) { this._assetsBuilt = false; }
  },

  _makeFrame() {
    const s = 18, c = document.createElement('canvas'); c.width = c.height = s;
    const x = c.getContext('2d');
    const DARK = '#0e1122', LITE = '#7ec8e3';
    for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) {
      const edge = Math.min(i, j, s - 1 - i, s - 1 - j);
      if (edge >= 6) continue;                 // center → transparent
      let col;
      if (edge < 2) col = DARK;                // outer ring
      else if (edge < 4) col = (i < 9 || j < 9) ? LITE : '#255a75';  // bevel
      else col = '#153447';
      x.fillStyle = col; x.fillRect(j, i, 1, 1);
    }
    return c.toDataURL();
  },

  _makeDither() {
    const bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
    const c = document.createElement('canvas'); c.width = c.height = 8;
    const x = c.getContext('2d');
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const v = Math.round((bayer[i][j] / 16) * 255);
      x.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; x.fillRect(j * 2, i * 2, 2, 2);
    }
    return c.toDataURL();
  },

  _setPosterizeLevels(n) {
    const t = [];
    for (let i = 0; i < n; i++) t.push(+(i / (n - 1)).toFixed(3));
    const tv = t.join(' ');
    ['pfR', 'pfG', 'pfB'].forEach((id) => {
      const f = document.getElementById(id);
      if (f) f.setAttribute('tableValues', tv);
    });
  },

  _refreshButtons(t) {
    const cur = t || this.get();
    document.querySelectorAll('.theme-toggle-btn').forEach((btn) => {
      btn.textContent = this.ICONS[cur] || '🎨';
      btn.title = `Theme: ${this.LABELS[cur] || cur} (click to switch)`;
    });
  },

  // ── Retro settings modal ─────────────────────────────────────
  openSettings() {
    const m = document.getElementById('theme-settings-modal');
    if (!m) return;
    this._syncSettings();
    m.style.display = 'flex';
  },
  closeSettings() {
    const m = document.getElementById('theme-settings-modal');
    if (m) m.style.display = 'none';
  },
  // Push current state into the modal controls.
  _syncSettings() {
    const isRetro = this.get() === 'retro';
    const rt = document.getElementById('ts-retro'); if (rt) rt.checked = isRetro;
    const fx = this.getFx();
    this.FX_KEYS.forEach((k) => { const el = document.getElementById('ts-' + k); if (el) el.checked = fx[k]; });
    const lv = document.getElementById('ts-levels'); if (lv) lv.value = fx.levels;
    const lvv = document.getElementById('ts-levels-val'); if (lvv) lvv.textContent = fx.levels;
    const body = document.getElementById('theme-settings-body');
    if (body) body.classList.toggle('ts-disabled', !isRetro);
  },
  _wireSettings() {
    const m = document.getElementById('theme-settings-modal');
    if (!m || m._wired) return;
    m._wired = true;
    document.querySelectorAll('.theme-settings-open').forEach((b) => {
      b.addEventListener('click', () => this.openSettings());
    });
    document.getElementById('ts-close')?.addEventListener('click', () => this.closeSettings());
    m.addEventListener('click', (e) => { if (e.target === m) this.closeSettings(); });

    document.getElementById('ts-retro')?.addEventListener('change', (e) => {
      this.apply(e.target.checked ? 'retro' : 'modern');
      this._syncSettings();
    });
    this.FX_KEYS.forEach((k) => {
      document.getElementById('ts-' + k)?.addEventListener('change', (e) => {
        this.setFx({ [k]: e.target.checked });
      });
    });
    const lv = document.getElementById('ts-levels');
    lv?.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      const lvv = document.getElementById('ts-levels-val'); if (lvv) lvv.textContent = val;
      this.setFx({ levels: val });
    });
  },

  init() {
    this.apply(this.get());
    document.querySelectorAll('.theme-toggle-btn').forEach((btn) => {
      if (btn._themeWired) return;
      btn._themeWired = true;
      btn.addEventListener('click', () => this.cycle());
    });
    this._wireSettings();
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
