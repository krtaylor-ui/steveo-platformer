// ============================================================
// gamepad-nav.js — Universal controller navigation for HTML screens/modals.
//
// Drives EVERY DOM screen/modal (dashboard, game/arena select, sandbox browser,
// community, online lobby, all modals, and the HTML pause overlay) with a
// gamepad. Two modes run together:
//   • D-pad / right-of-stick = SPATIAL FOCUS — highlight jumps to the nearest
//     focusable element in the pressed direction, by bounding-rect geometry
//     (gpNearestInDirection, unit-tested headless), NOT DOM order.
//   • Left stick = VIRTUAL CURSOR — a free DOM pointer; A clicks whatever is
//     under it via document.elementFromPoint. Universal fallback.
// A = activate focused element (or cursor target if the stick moved last).
// B = back (drive the surface's back/close/cancel control).
//
// Runs its OWN requestAnimationFrame poll, active only when NOT in a live match
// (body:not(.in-game)) OR when the HTML pause overlay is open — so it never
// fights the in-game controller handling in game.js. Uses player-1's assignment
// (controller-config.js) to pick which pad to read.
// ============================================================

// ── Pure geometry: pick the nearest focusable in a direction ──────────
// rects: [{x,y,width,height}], currentIndex: int (-1 = none yet),
// dir: 'up'|'down'|'left'|'right'. Returns the chosen index, or -1 if none.
// Exported for headless unit testing (test/test-gamepad-nav.js).
function gpNearestInDirection(rects, currentIndex, dir) {
  if (!rects || !rects.length) return -1;
  const center = (r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

  // No current focus → seed with the top-most, then left-most element.
  if (currentIndex < 0 || currentIndex >= rects.length) {
    let best = -1, by = Infinity, bx = Infinity;
    for (let i = 0; i < rects.length; i++) {
      const c = center(rects[i]);
      if (c.y < by - 1 || (Math.abs(c.y - by) <= 1 && c.x < bx)) { by = c.y; bx = c.x; best = i; }
    }
    return best;
  }

  const cur = center(rects[currentIndex]);
  let best = -1, bestScore = Infinity;
  for (let i = 0; i < rects.length; i++) {
    if (i === currentIndex) continue;
    const c = center(rects[i]);
    const dx = c.x - cur.x, dy = c.y - cur.y;
    let primary, cross;
    if (dir === 'up')         { if (dy >= -1) continue; primary = -dy; cross = Math.abs(dx); }
    else if (dir === 'down')  { if (dy <= 1)  continue; primary = dy;  cross = Math.abs(dx); }
    else if (dir === 'left')  { if (dx >= -1) continue; primary = -dx; cross = Math.abs(dy); }
    else /* right */          { if (dx <= 1)  continue; primary = dx;  cross = Math.abs(dy); }
    // Distance in the pressed direction, plus a heavy penalty for drifting off
    // the axis — so "the element straight ahead" wins over one far to the side.
    const score = primary + cross * 3;
    if (score < bestScore) { bestScore = score; best = i; }
  }
  return best;
}

const GAMEPAD_NAV = {
  _raf: null,
  _prev: {},          // previous pressed state per logical button
  _repeatAt: {},      // next allowed time per direction (ms)
  _focusEl: null,
  _cursor: null,      // the virtual-cursor DOM element
  _cx: 0, _cy: 0,
  _cursorMode: false, // true when the left stick moved more recently than the d-pad
  DEADZONE: 0.45,
  REPEAT_MS: 180,
  CURSOR_SPEED: 12,

  FOCUS_SEL: 'button, a, input, select, .btn, .toggle, [role="button"]',

  start() {
    if (this._raf || typeof requestAnimationFrame === 'undefined') return;
    this._tick = this._tick.bind(this);
    this._raf = requestAnimationFrame(this._tick);
  },

  // Active in menus, and while the HTML pause overlay is open (which happens
  // in-game); never during normal gameplay.
  _active() {
    const pauseOpen = (typeof PAUSE_MENU !== 'undefined' && PAUSE_MENU.isOpen && PAUSE_MENU.isOpen());
    const inGame = document.body.classList.contains('in-game');
    return pauseOpen || !inGame;
  },

  // Player-1's assigned gamepad (falls back to the first connected pad).
  _pad() {
    const pads = (navigator.getGamepads && navigator.getGamepads()) || [];
    let slot = 0;
    if (typeof ControllerConfig !== 'undefined') {
      const a = ControllerConfig.getAssignment(1);
      if (a >= 0) slot = a;
    }
    if (pads[slot] && pads[slot].connected) return pads[slot];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  },

  _tick() {
    this._raf = requestAnimationFrame(this._tick);
    try {
      if (!this._active()) { this._hideCursor(); this._clearFocus(); this._prev = {}; return; }
      const pad = this._pad();
      if (!pad) return;
      this._process(pad);
    } catch (e) { /* never let a nav error kill the loop */ }
  },

  _btn(pad, i) { return !!(pad.buttons[i] && pad.buttons[i].pressed); },
  _axis(pad, i) { return pad.axes[i] || 0; },

  _edge(name, pressed) {
    const was = !!this._prev[name];
    this._prev[name] = pressed;
    return pressed && !was;
  },

  _process(pad) {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());

    // Directions from d-pad (12-15) OR left stick, with hold-to-repeat.
    const lx = this._axis(pad, 0), ly = this._axis(pad, 1);
    const dirs = {
      up:    this._btn(pad, 12) || ly < -this.DEADZONE,
      down:  this._btn(pad, 13) || ly >  this.DEADZONE,
      left:  this._btn(pad, 14) || lx < -this.DEADZONE,
      right: this._btn(pad, 15) || lx >  this.DEADZONE,
    };
    // A stick push beyond deadzone also drives the free cursor.
    const stickMag = Math.hypot(lx, ly);
    if (stickMag > this.DEADZONE) {
      this._cursorMode = true;
      this._moveCursor(lx, ly);
    }
    // A d-pad press switches back to spatial-focus mode.
    if (this._btn(pad, 12) || this._btn(pad, 13) || this._btn(pad, 14) || this._btn(pad, 15)) {
      this._cursorMode = false; this._hideCursor();
    }

    for (const dir of ['up', 'down', 'left', 'right']) {
      if (!dirs[dir]) { this._repeatAt[dir] = 0; continue; }
      if (now < (this._repeatAt[dir] || 0)) continue;
      this._repeatAt[dir] = now + this.REPEAT_MS;
      // On a d-pad press (not stick), it's spatial focus, so leave cursor mode.
      if (this._btn(pad, 12) || this._btn(pad, 13) || this._btn(pad, 14) || this._btn(pad, 15))
        this._cursorMode = false;
      this._handleDirection(dir);
    }

    // A (0) = activate; B (1) = back.
    if (this._edge('A', this._btn(pad, 0))) this._activate();
    if (this._edge('B', this._btn(pad, 1))) this._back();
  },

  // ── Surface + focusables ───────────────────────────────────────
  _isVisible(el) {
    if (!el) return false;
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  },

  // The top-most interactive surface to scope navigation to.
  _surface() {
    if (typeof PAUSE_MENU !== 'undefined' && PAUSE_MENU.isOpen && PAUSE_MENU.isOpen()) {
      const p = document.getElementById('pause-overlay');
      if (this._isVisible(p)) return p;
    }
    // Visible modals/overlays win over the base screen; pick the highest z-index.
    const overlays = [...document.querySelectorAll('[id$="-modal"], [id$="-overlay"]')]
      .filter(el => this._isVisible(el));
    if (overlays.length) {
      overlays.sort((a, b) => (parseInt(getComputedStyle(a).zIndex, 10) || 0) - (parseInt(getComputedStyle(b).zIndex, 10) || 0));
      return overlays[overlays.length - 1];
    }
    const screens = [...document.querySelectorAll('[id$="-screen"]')].filter(el => this._isVisible(el));
    if (screens.length) return screens[screens.length - 1];
    return document.body;
  },

  _focusables() {
    const surface = this._surface();
    if (!surface) return [];
    return [...surface.querySelectorAll(this.FOCUS_SEL)].filter(el =>
      !el.disabled && this._isVisible(el));
  },

  _handleDirection(dir) {
    const els = this._focusables();
    if (!els.length) return;

    // If a <select> is focused, up/down cycles its value directly (can't drive
    // the native dropdown via gamepad). A range input nudges on left/right.
    const f = this._focusEl;
    if (f && this._focusables().includes(f)) {
      if (f.tagName === 'SELECT' && (dir === 'up' || dir === 'down')) {
        const n = f.options.length;
        if (n) {
          f.selectedIndex = (f.selectedIndex + (dir === 'down' ? 1 : -1) + n) % n;
          f.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return;
      }
      if (f.type === 'range' && (dir === 'left' || dir === 'right')) {
        const step = parseFloat(f.step) || 1;
        const min = f.min !== '' ? parseFloat(f.min) : 0;
        const max = f.max !== '' ? parseFloat(f.max) : 100;
        let v = parseFloat(f.value) + (dir === 'right' ? step : -step);
        f.value = Math.max(min, Math.min(max, v));
        f.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
    }

    const rects = els.map(el => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    });
    const curIdx = f ? els.indexOf(f) : -1;
    const next = gpNearestInDirection(rects, curIdx, dir);
    if (next >= 0) this._setFocus(els[next]);
  },

  _setFocus(el) {
    this._clearFocus();
    this._focusEl = el;
    el.classList.add('gp-focus');
    try { el.focus({ preventScroll: false }); } catch (e) {}
  },

  _clearFocus() {
    if (this._focusEl) { this._focusEl.classList.remove('gp-focus'); }
    this._focusEl = null;
  },

  _activate() {
    if (this._cursorMode && this._cursor) {
      const target = document.elementFromPoint(this._cx, this._cy);
      if (target) target.click();
      return;
    }
    const f = this._focusEl;
    if (!f) { // nothing focused yet → focus the first element
      const els = this._focusables();
      if (els.length) this._setFocus(els[0]);
      return;
    }
    if (f.tagName === 'SELECT') return;       // cycled via d-pad; A is a no-op
    if (f.type === 'range')    return;         // nudged via d-pad
    f.click();
  },

  _back() {
    const surface = this._surface();
    if (!surface) return;
    const sel = '[data-gp-back], .btn-back, .ts-close, .pause-close, ' +
                '[id$="-cancel-btn"], [id$="-close-btn"], #lb-close-btn';
    // First VISIBLE match wins (a matching but hidden control — e.g. the pause
    // ✕ while the confirm sub-panel is up — must be skipped, not stop the search).
    for (const el of surface.querySelectorAll(sel)) {
      if (this._isVisible(el) && !el.disabled) { el.click(); return; }
    }
  },

  // ── Virtual cursor ──────────────────────────────────────────────
  _ensureCursor() {
    if (this._cursor) return;
    const c = document.createElement('div');
    c.id = 'gp-cursor';
    c.style.cssText = 'position:fixed;width:18px;height:18px;border-radius:50%;' +
      'border:2px solid #fff;background:rgba(106,92,255,0.5);box-shadow:0 0 6px rgba(0,0,0,0.6);' +
      'pointer-events:none;z-index:99999;transform:translate(-50%,-50%);display:none;';
    document.body.appendChild(c);
    this._cursor = c;
    this._cx = window.innerWidth / 2;
    this._cy = window.innerHeight / 2;
  },

  _moveCursor(dx, dy) {
    this._ensureCursor();
    this._clearFocus(); // cursor mode supersedes spatial focus
    this._cx = Math.max(0, Math.min(window.innerWidth,  this._cx + dx * this.CURSOR_SPEED));
    this._cy = Math.max(0, Math.min(window.innerHeight, this._cy + dy * this.CURSOR_SPEED));
    this._cursor.style.left = this._cx + 'px';
    this._cursor.style.top  = this._cy + 'px';
    this._cursor.style.display = 'block';
  },

  _hideCursor() {
    if (this._cursor) this._cursor.style.display = 'none';
  },
};

if (typeof window !== 'undefined') {
  window.GAMEPAD_NAV = GAMEPAD_NAV;
  window.gpNearestInDirection = gpNearestInDirection;
  // Auto-start once the DOM is ready.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => GAMEPAD_NAV.start());
  } else {
    GAMEPAD_NAV.start();
  }
}

// Headless export for the unit test.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { gpNearestInDirection };
}
