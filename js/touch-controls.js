// ============================================================
// touch-controls.js — On-screen touch controls for mobile (§3).
//
// Feeds the SAME virtual inputs the keyboard player (P1 = slot -1, WASD+Space+
// mouse) already uses, by writing directly to the live InputManager
// (window.game.input): keys[...] for movement/jump/action and mouse.{x,y,down,
// clicked} for arena aim/fire. So game logic is untouched — the roadmap's core
// insight (input.js abstracts input into virtual actions) makes this cheap.
//
// Per-mode layouts (Speed Run / Platformer / Arena only — Normal & Sandbox are
// out of scope for this pass):
//   • Speed Run  — auto-run (forward held) + one big JUMP (hold = higher jump).
//   • Platformer — LEFT / RIGHT / JUMP + ACTION.
//   • Arena      — LEFT / RIGHT / JUMP (left thumb) + an AIM/FIRE pad (right
//                  thumb → mouse aim + tap/hold to fire the bow) = twin-stick.
//
// Auto-detects touch capability with a manual override (localStorage
// 'steveo_touch' = '1'|'0', or ?touch=1|0). Optional haptics on press.
// ============================================================

const TOUCH_CONTROLS = {
  _enabled: false,
  _root: null,
  _mode: null,        // last configured game mode (+ 'arena')
  _raf: null,
  _autorun: false,    // Speed Run holds forward
  _aimPadActive: false,

  detect() {
    try {
      const q = new URLSearchParams(location.search).get('touch');
      if (q === '1') return true;
      if (q === '0') return false;
      const ls = localStorage.getItem('steveo_touch');
      if (ls === '1') return true;
      if (ls === '0') return false;
    } catch (e) {}
    // Auto-enable ONLY on touch-primary devices that have NO fine pointer. A hybrid
    // touchscreen laptop reports touch points AND a mouse/trackpad (a "fine" pointer) —
    // those users get the desktop mouse scheme, because otherwise the arena aim pad
    // (.tc-aimpad) overlays the right half of the canvas and swallows mouse right-clicks,
    // turning them into a left-click/melee (Kevin: right-click dead on the right half in
    // arena only). Manual override (?touch= / localStorage) above still forces it either way.
    const mm = (qq) => !!(window.matchMedia && window.matchMedia(qq).matches);
    const hasTouch = (navigator.maxTouchPoints || 0) > 0;
    const coarse   = mm('(pointer: coarse)');   // PRIMARY pointer is coarse (finger)
    const fine     = mm('(any-pointer: fine)'); // a mouse/trackpad exists too
    return hasTouch && coarse && !fine;
  },

  setEnabled(on) {
    try { localStorage.setItem('steveo_touch', on ? '1' : '0'); } catch (e) {}
    this._enabled = !!on;
    if (!on) this._teardown();
  },

  // (§1b) Explicit user-facing mode: 'auto' (detect + default to mouse on hybrid
  // laptops), 'on' (force the touch overlay — tablets), 'off' (force the desktop
  // mouse scheme). 'auto' = no localStorage override; on/off write it. A ?touch=
  // URL param still overrides everything (dev/testing).
  getMode() {
    try {
      const ls = localStorage.getItem('steveo_touch');
      if (ls === '1') return 'on';
      if (ls === '0') return 'off';
    } catch (e) {}
    return 'auto';
  },
  setMode(mode) {
    try {
      if (mode === 'on') localStorage.setItem('steveo_touch', '1');
      else if (mode === 'off') localStorage.setItem('steveo_touch', '0');
      else localStorage.removeItem('steveo_touch');     // 'auto'
    } catch (e) {}
    this._enabled = this.detect();
    if (!this._enabled) this._teardown();
    // When (re-)enabling, the rAF _loop re-configures the layout next frame.
  },

  init() {
    this._enabled = this.detect();
    this._build();
    this._loop = this._loop.bind(this);
    this._raf = requestAnimationFrame(this._loop);
  },

  _input() { return (window.game && window.game.input) || null; },

  // Which layout to show, or null to hide (menus / Normal / Sandbox / no match).
  _wantMode() {
    if (!this._enabled) return null;
    const g = window.game;
    if (!g || !document.body.classList.contains('in-game')) return null;
    if (g.isArena) return 'arena';
    if (g.gameMode === 'speedrunner') return 'speedrunner';
    if (g.gameMode === 'platformer') return 'platformer';
    return null; // normal / sandbox — out of scope
  },

  _loop() {
    this._raf = requestAnimationFrame(this._loop);
    const want = this._wantMode();
    if (want !== this._mode) this._configure(want);
    // Speed Run auto-run: hold "forward" every frame while active.
    if (this._autorun) {
      const inp = this._input();
      if (inp) inp.keys['KeyD'] = true;
    }
  },

  // ── DOM ────────────────────────────────────────────────────────
  _build() {
    if (this._root) return;
    const root = document.createElement('div');
    root.id = 'touch-controls';
    root.style.display = 'none';
    root.innerHTML = `
      <div class="tc-cluster tc-left">
        <button class="tc-btn tc-left-btn"  data-key="KeyA" aria-label="Left">◀</button>
        <button class="tc-btn tc-right-btn" data-key="KeyD" aria-label="Right">▶</button>
      </div>
      <div class="tc-cluster tc-right">
        <button class="tc-btn tc-action-btn" data-key="Space" aria-label="Action">✦</button>
        <button class="tc-btn tc-jump-btn"   data-key="KeyW" aria-label="Jump">⤒</button>
      </div>
      <div class="tc-aimpad" aria-label="Aim and fire"></div>`;
    document.body.appendChild(root);
    this._root = root;

    // Belt-and-suspenders: never let this overlay block a MOUSE. When the live pointer is
    // a mouse, drop the overlay's pointer-events so clicks pass through to the canvas (so
    // aim/fire on the right half works); restore it for touch so the pads stay tappable.
    // CSS alone can't distinguish mouse from touch, so flip it from the active pointer type.
    // This guarantees the arena aim pad can't eat mouse right-clicks even if touch is on.
    const setPE = (type) => { if (this._root) this._root.style.pointerEvents = (type === 'mouse') ? 'none' : 'auto'; };
    window.addEventListener('pointermove', (e) => setPE(e.pointerType), true);
    window.addEventListener('pointerdown', (e) => setPE(e.pointerType), true);

    // Movement / jump / action buttons → hold the mapped key.
    root.querySelectorAll('.tc-btn').forEach(btn => {
      const key = btn.dataset.key;
      const down = (e) => { if (e.pointerType === 'mouse') return; e.preventDefault(); this._press(key, true); this._haptic(); btn.classList.add('tc-active'); };
      const up   = (e) => { if (e.pointerType === 'mouse') return; e.preventDefault(); this._press(key, false); btn.classList.remove('tc-active'); };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', up);
    });

    // Arena aim/fire pad → drive mouse aim + fire.
    const pad = root.querySelector('.tc-aimpad');
    const aim = (e) => {
      const inp = this._input(); const cv = window.game && window.game.canvas;
      if (!inp || !cv) return;
      const r = cv.getBoundingClientRect();
      inp.mouse.x = (e.clientX - r.left) * (cv.width / r.width);
      inp.mouse.y = (e.clientY - r.top) * (cv.height / r.height);
    };
    pad.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;   // mouse aims/fires via the canvas directly
      e.preventDefault(); const inp = this._input(); if (!inp) return;
      aim(e); inp.mouse.down = true; inp.mouse.clicked = true; this._haptic();
    });
    pad.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') return; e.preventDefault(); if (this._input()?.mouse.down) aim(e); });
    const end = (e) => { if (e.pointerType === 'mouse') return; e.preventDefault(); const inp = this._input(); if (inp) inp.mouse.down = false; };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
    pad.addEventListener('pointerleave', end);
  },

  _configure(mode) {
    this._mode = mode;
    this._autorun = false;
    // Release any held keys when switching layouts/hiding.
    this._releaseAll();
    if (!this._root) return;
    if (!mode) { this._root.style.display = 'none'; return; }

    const left   = this._root.querySelector('.tc-left');
    const leftBtn  = this._root.querySelector('.tc-left-btn');
    const rightBtn = this._root.querySelector('.tc-right-btn');
    const action = this._root.querySelector('.tc-action-btn');
    const jump   = this._root.querySelector('.tc-jump-btn');
    const pad    = this._root.querySelector('.tc-aimpad');
    const show = (el, on) => { if (el) el.style.display = on ? '' : 'none'; };
    // Reset labels (a prior mode may have relabelled them).
    if (leftBtn) leftBtn.textContent = '◀';
    if (rightBtn) rightBtn.textContent = '▶';
    if (action) action.textContent = '✦';

    this._root.style.display = 'block';
    if (mode === 'speedrunner') {
      // Accelerate button (holds the accelerate input) + JUMP; release coasts.
      // Reuse the right-move button (KeyD) as accelerate — SR reads KeyD as accel.
      show(left, true); show(leftBtn, false); show(rightBtn, true);
      show(action, false); show(pad, false); show(jump, true);
      if (rightBtn) rightBtn.textContent = '▶▶';
    } else if (mode === 'platformer') {
      show(left, true); show(leftBtn, true); show(rightBtn, true);
      show(action, true); show(jump, true); show(pad, false);
      if (action) action.textContent = '⚔';
    } else if (mode === 'arena') {
      // Twin-stick: left thumb moves + jumps; right pad aims + fires.
      show(left, true); show(leftBtn, true); show(rightBtn, true);
      show(jump, true); show(action, false); show(pad, true);
    }
  },

  _press(key, down) {
    const inp = this._input();
    if (!inp) return;
    inp.keys[key] = down;
    if (down) inp._justPressed[key] = true; // one-shot for isJustDown() consumers
  },

  _releaseAll() {
    const inp = this._input();
    if (!inp) return;
    ['KeyA', 'KeyD', 'KeyW', 'Space'].forEach(k => { inp.keys[k] = false; });
    if (this._root) this._root.querySelectorAll('.tc-btn.tc-active').forEach(b => b.classList.remove('tc-active'));
  },

  _haptic() {
    try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) {}
  },

  _teardown() {
    this._releaseAll();
    this._mode = null; this._autorun = false;
    if (this._root) this._root.style.display = 'none';
  },
};

if (typeof window !== 'undefined') {
  window.TOUCH_CONTROLS = TOUCH_CONTROLS;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => TOUCH_CONTROLS.init());
  } else {
    TOUCH_CONTROLS.init();
  }
}
