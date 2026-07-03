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
    return (navigator.maxTouchPoints || 0) > 0 ||
           (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  },

  setEnabled(on) {
    try { localStorage.setItem('steveo_touch', on ? '1' : '0'); } catch (e) {}
    this._enabled = !!on;
    if (!on) this._teardown();
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

    // Movement / jump / action buttons → hold the mapped key.
    root.querySelectorAll('.tc-btn').forEach(btn => {
      const key = btn.dataset.key;
      const down = (e) => { e.preventDefault(); this._press(key, true); this._haptic(); btn.classList.add('tc-active'); };
      const up   = (e) => { e.preventDefault(); this._press(key, false); btn.classList.remove('tc-active'); };
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
      e.preventDefault(); const inp = this._input(); if (!inp) return;
      aim(e); inp.mouse.down = true; inp.mouse.clicked = true; this._haptic();
    });
    pad.addEventListener('pointermove', (e) => { e.preventDefault(); if (this._input()?.mouse.down) aim(e); });
    const end = (e) => { e.preventDefault(); const inp = this._input(); if (inp) inp.mouse.down = false; };
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

    this._root.style.display = 'block';
    if (mode === 'speedrunner') {
      // Auto-run forward; single big JUMP. No move buttons, no aim pad.
      this._autorun = true;
      show(left, false); show(action, false); show(pad, false); show(jump, true);
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
