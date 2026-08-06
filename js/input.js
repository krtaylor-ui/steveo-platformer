// ============================================================
// input.js — Keyboard, mouse, and gamepad input manager
// ============================================================
//
// Slot values (p1GpSlot / p2GpSlot):
//   -1  = Keyboard 1  (WASD + Space)
//   -2  = Keyboard 2  (Arrow keys + Insert/Delete)
//   0-3 = Gamepad slot index
//
// Set p1GpSlot and p2GpSlot each frame from ControllerConfig.
// ============================================================

class InputManager {
  constructor(canvas) {
    this.keys         = {};
    this._justPressed = {};  // cleared each flush; use isJustDown for one-shot checks
    this.mouse        = { x: 0, y: 0, down: false, clicked: false, rightClicked: false, rightDown: false, altClicked: false };
    this.scrollDelta  = 0;
    this._canvas      = canvas;

    // Smart Mobs §2 — controller preset (Xbox / Switch out of the box). Remaps
    // ONLY the face buttons (A/B/X/Y = indices 0-3); shoulders/triggers/d-pad are
    // untouched. Default is identity, so unless a Switch preset is chosen behaviour
    // is byte-for-byte unchanged. A Switch Pro's face buttons are physically
    // mirrored vs Xbox, so 'switch' swaps A↔B and X↔Y. (Arbitrary key rebinding is
    // a follow-up — see the controls-config UI spec in FUTURE_ROADMAP.)
    this._faceRemap = [0, 1, 2, 3];
    this._controllerPreset = 'default';
    try {
      const saved = localStorage.getItem('steveo_controls_preset');
      if (saved) this.setControllerPreset(saved, true);
    } catch (e) { /* localStorage unavailable — keep identity */ }

    // Gamepad state — 4 slots
    this.gamepads  = [0, 1, 2, 3].map(i => this._emptyGamepad(i));
    this._gpPrev   = [0, 1, 2, 3].map(i => this._emptyGamepad(i));

    // Controller settings (set by game.js each frame). The single values are a
    // fallback; the per-player arrays (P1-P4, filled from ControllerConfig) are
    // authoritative so each controller user can tune their own.
    this.controllerSensitivity    = 1.0;
    this.controllerAimSensitivity = 1.0;
    this.controllerDeadzone       = GP_DEADZONE_STICK;
    this.playerSensitivity    = [1.0, 1.0, 1.0, 1.0];
    this.playerAimSensitivity = [1.0, 1.0, 1.0, 1.0];
    this.playerDeadzone       = [GP_DEADZONE_STICK, GP_DEADZONE_STICK, GP_DEADZONE_STICK, GP_DEADZONE_STICK];

    // Assigned input slots — set each frame by game.js from ControllerConfig
    // -1 = KB1 (WASD), -2 = KB2 (Arrows), 0-3 = gamepad slot
    this.p1GpSlot = -1;  // P1 default: keyboard 1
    this.p2GpSlot = 1;   // P2 default: gamepad 1
    // Phase 3B — P3/P4 are gamepad-only (one keyboard player max). Slots set
    // each frame from ControllerConfig(3)/(4); defaults 2/3.
    this.p3GpSlot = 2;
    this.p4GpSlot = 3;

    // When true (single-player), P1 actions accept both keyboard AND any connected gamepad.
    // Set each frame by game.js.
    this.dualInput = false;

    // ── Bot AI synthetic input (Bot AI brief) ────────────────
    // A bot-controlled slot writes its desired virtual input here each frame and
    // the pXxx(i) accessors below read from it INSTEAD of hardware — so a bot is
    // just another input source into the exact same movement/combat code a human
    // drives. null = a human slot (default; hardware path, byte-identical). Shape:
    //   { moveX:-1..1, jump, crouch, attack, aimX, aimY, gpSlot,
    //     buttons:{ jump, place, context, prevSlot, dpad0..3, throwBtn } }
    // buttons drive the one-shot pJustDown edge detection (weapon-switch / place /
    // context-action); _botPrev holds last frame's buttons for that edge test.
    this.botInput = [null, null, null, null];
    this._botPrev = [null, null, null, null];

    // Legacy alias kept for compatibility in a few places that still read it
    Object.defineProperty(this, 'p2KeyMode', {
      get: () => this.p2GpSlot === -2 ? 'arrows' : 'ijkl',
      set: () => {},  // no-op, use p2GpSlot instead
    });

    this._bind();
  }

  // ── Gamepad helpers ───────────────────────────────────────

  _emptyGamepad(id) {
    return {
      id, connected: false, rawId: '',
      jump: false, crouch: false, attack: false, place: false,
      prevSlot: false, context: false, menu: false, throwBtn: false,
      rangedBtn: false, grappleBtn: false, grapplePullBtn: false, sprintBtn: false,
      cycleSelBtn: false, nextSlotBtn: false, prevHotbarBtn: false,
      moveLeftBtn: false, moveRightBtn: false, inventoryBtn: false,
      sbUndoBtn: false, sbRedoBtn: false, sbCopyBtn: false, sbPasteBtn: false,
      sbPenUpBtn: false, sbPenDownBtn: false, sbPaletteBtn: false,
      dpad0: false, dpad1: false, dpad2: false, dpad3: false,
      moveX: 0, moveY: 0, aimX: 0, aimY: 0,
      triggerL: 0, triggerR: 0,
    };
  }

  _applyDeadZone(value, dz) {
    if (Math.abs(value) < dz) return 0;
    return (value - Math.sign(value) * dz) / (1 - dz);
  }

  // Per-player controller tuning (player index 0-3), with a global fallback.
  _sens(i)     { return this.playerSensitivity[i]    ?? this.controllerSensitivity    ?? 1.0; }
  _aimSens(i)  { return this.playerAimSensitivity[i] ?? this.controllerAimSensitivity ?? 1.0; }
  _deadzone(i) { return this.playerDeadzone[i]       ?? this.controllerDeadzone       ?? GP_DEADZONE_STICK; }
  // Deadzone for a raw gamepad SLOT (0-3), resolved via which player uses it.
  _deadzoneForSlot(slot) {
    const p = [this.p1GpSlot, this.p2GpSlot, this.p3GpSlot, this.p4GpSlot].indexOf(slot);
    return p >= 0 ? this._deadzone(p) : (this.controllerDeadzone ?? GP_DEADZONE_STICK);
  }

  // ── Bot synthetic-input API (Bot AI brief) ────────────────
  // A BotController calls setBotInput(i, obj) each frame with its virtual input;
  // clearBotInput(i) hands the slot back to hardware (bot removed / match end).
  setBotInput(i, obj) { this.botInput[i] = obj; }
  clearBotInput(i)    { this.botInput[i] = null; this._botPrev[i] = null; }
  isBot(i)            { return !!this.botInput[i]; }
  _botOf(i)           { return this.botInput[i]; }

  // Poll Gamepad API — call once per frame at the START of _update()
  updateGamepad() {
    // Snapshot each bot slot's CURRENT (i.e. last-frame's) button state for the
    // pJustDown edge test — the BotController overwrites botInput later this frame
    // (after gameplay input is polled), so this captures the "previous" frame.
    for (let i = 0; i < 4; i++) {
      const b = this.botInput[i];
      this._botPrev[i] = (b && b.buttons) ? { ...b.buttons } : null;
    }
    const raw = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < 4; i++) {
      this._gpPrev[i]  = this.gamepads[i];
      const gp = raw[i];
      if (!gp || !gp.connected) {
        this.gamepads[i] = this._emptyGamepad(i);
        continue;
      }
      const b   = gp.buttons;
      const a   = gp.axes;
      // Face buttons (0-3) go through the controller-preset remap; everything
      // else is read directly. Identity map by default = no behaviour change.
      const btn = (idx) => { const m = (idx >= 0 && idx <= 3) ? this._faceRemap[idx] : idx; return b[m] ? b[m].pressed : false; };
      const val = (idx) => (b[idx] ? b[idx].value   : 0);
      // §Phase C — rebindable button-actions resolve their physical index through
      // GP_BINDINGS (per-player override else the preset default, which subsumes the face
      // swap). `abtn(action, fallbackIdx)` is byte-identical to `btn(fallbackIdx)` when no
      // override exists and GP_BINDINGS is loaded; falls back to `btn()` (with _faceRemap)
      // headless. Downstream still reads by name (gp.jump…), so nothing else changes.
      const player = [this.p1GpSlot, this.p2GpSlot, this.p3GpSlot, this.p4GpSlot].indexOf(i);
      // Resolve a named action to its physical button state. A binding may be a single
      // index, a CHORD [modIdx, btnIdx] (all must be held), or null (unassigned → false).
      const abtn = (action, fallbackIdx) => {
        if (typeof GP_BINDINGS !== 'undefined') {
          const m = GP_BINDINGS.resolve(player, this._controllerPreset, action);
          if (Array.isArray(m)) return m.every((x) => b[x] && b[x].pressed);   // chord
          if (m != null) return b[m] ? b[m].pressed : false;
          // resolved to null (unassigned) → only the historical fallback (if any) applies
          if (GP_BINDINGS.ACTIONS.some((x) => x.id === action)) return fallbackIdx != null ? btn(fallbackIdx) : false;
        }
        return btn(fallbackIdx);
      };
      // Stick swap: move ↔ aim axes exchange (left/right stick). Read once per pad.
      const swap = (typeof GP_BINDINGS !== 'undefined' && GP_BINDINGS.swapSticks && GP_BINDINGS.swapSticks());
      const dz = this._deadzoneForSlot(i);
      const axMove = swap ? [a[2], a[3]] : [a[0], a[1]];
      const axAim  = swap ? [a[0], a[1]] : [a[2], a[3]];
      this.gamepads[i] = {
        id:        i,
        connected: true,
        rawId:     gp.id,
        jump:      abtn('jump', 0),      // A
        crouch:    abtn('crouch', 1),    // B
        attack:    abtn('melee', 2),     // X
        place:     abtn('place', 3),     // Y
        prevSlot:  abtn('prevSlot', 4),  // LB — Change Melee Weapon
        context:   abtn('context', 5),   // RB — Change Ranged Weapon
        throwBtn:  abtn('throw', 11),    // R3 (right-stick click) — Trident throw (Smart Mobs §2)
        // §Controller pass — new named button-actions (all default-unassigned except ranged /
        // inventory). The D-pad itself is NOT an action — its 4 directions are plain buttons
        // (indices 12-15) available as bind TARGETS and read directly below for their built-in uses.
        rangedBtn: abtn('ranged', 7),    // RT-as-button (also read as an analog trigger below)
        grappleBtn:    abtn('grapple', null),
        grapplePullBtn:abtn('grapplePull', null),
        sprintBtn:     abtn('sprint', null),
        cycleSelBtn:   abtn('cycleSel', null),
        nextSlotBtn:   abtn('nextSlot', null),
        prevHotbarBtn: abtn('prevHotbar', null),
        moveLeftBtn:   abtn('moveLeft', null),   // e.g. a player who binds Move Left to D-Pad Left
        moveRightBtn:  abtn('moveRight', null),
        inventoryBtn:  abtn('inventory', 8),     // View
        // Sandbox tools (only bound within the sandbox profile).
        sbUndoBtn:     abtn('sbUndo', null),    sbRedoBtn:  abtn('sbRedo', null),
        sbCopyBtn:     abtn('sbCopy', null),    sbPasteBtn: abtn('sbPaste', null),
        sbPenUpBtn:    abtn('sbPenUp', null),   sbPenDownBtn: abtn('sbPenDown', null),
        sbPaletteBtn:  abtn('sbPalette', null),
        triggerL:  val(6) > GP_DEADZONE_TRIGGER ? val(6) : 0,
        triggerR:  val(7) > GP_DEADZONE_TRIGGER ? val(7) : 0,
        menu:      abtn('menu', 9),      // Start
        dpad0:     btn(12),  // Up
        dpad1:     btn(15),  // Right
        dpad2:     btn(13),  // Down
        dpad3:     btn(14),  // Left
        moveX: this._applyDeadZone(axMove[0] ?? 0, dz),
        moveY: this._applyDeadZone(axMove[1] ?? 0, dz),
        aimX:  this._applyDeadZone(axAim[0] ?? 0, dz),
        aimY:  this._applyDeadZone(axAim[1] ?? 0, dz),
      };
    }
  }

  // One-shot just-pressed for a specific gamepad slot
  gpJustDown(slotIdx, btn) {
    const gp  = this.gamepads[slotIdx];
    const prv = this._gpPrev[slotIdx];
    if (!gp || !prv) return false;
    return !!gp[btn] && !prv[btn];
  }

  // Returns first connected gamepad (used in dual-input single-player mode).
  _anyGp() {
    for (const gp of this.gamepads) { if (gp.connected) return gp; }
    return this._emptyGamepad(0);
  }

  // Just-pressed across all connected gamepads (used in dual-input mode).
  _anyGpJustDown(btn) {
    for (let i = 0; i < 4; i++) {
      const gp = this.gamepads[i], prv = this._gpPrev[i];
      if (gp.connected && !!gp[btn] && !prv[btn]) return true;
    }
    return false;
  }

  // Controller presets (Smart Mobs §2). 'switch' mirrors the face buttons so a
  // Switch Pro/Joy-Con feels right; 'default'/'xbox' are identity. `quiet` skips
  // persisting (used on load). Returns the applied preset name.
  setControllerPreset(name, quiet) {
    const FACE = { default: [0, 1, 2, 3], xbox: [0, 1, 2, 3], switch: [1, 0, 3, 2] };
    this._controllerPreset = FACE[name] ? name : 'default';
    this._faceRemap = FACE[this._controllerPreset].slice();
    if (!quiet) { try { localStorage.setItem('steveo_controls_preset', this._controllerPreset); } catch (e) { /* ignore */ } }
    return this._controllerPreset;
  }
  controllerPreset() { return this._controllerPreset; }

  // Slot-aware just-pressed helpers — use these instead of gpJustDown(0,…)
  p1JustDown(btn) {
    if (this.dualInput) return this._anyGpJustDown(btn);
    return this.p1GpSlot >= 0 ? this.gpJustDown(this.p1GpSlot, btn) : false;
  }
  p2JustDown(btn) { return this.p2GpSlot >= 0 ? this.gpJustDown(this.p2GpSlot, btn) : false; }

  // ── Keyboard / mouse binding ──────────────────────────────

  _bind() {
    window.addEventListener('keydown', e => {
      const ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
      this.keys[e.code]         = true;
      this._justPressed[e.code] = true;
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab','KeyU','KeyF','Escape',
           'AltLeft','AltRight','Insert','Delete','End','PageDown','Home'].includes(e.code)) {
        e.preventDefault();
      }
      if (e.ctrlKey && (e.code === 'KeyZ' || e.code === 'KeyY' || e.code === 'KeyC' || e.code === 'KeyV')) e.preventDefault();
    });
    window.addEventListener('keyup', e => {
      this.keys[e.code] = false;
    });

    // Track the cursor on the WINDOW, not the canvas. Aiming works everywhere on
    // screen even when the cursor is over a letterbox bar, an overflow-clipped canvas
    // edge, or a HUD overlay — regions a canvas-only listener never sees, which made
    // mouse.x "freeze" at the visual center in zoomed-out / single-screen play
    // (Kevin: aim locked to wherever the cursor crossed left→right). We still map
    // through the canvas rect and clamp to the 800×500 backing, so positions past the
    // visible edge just pin to that edge instead of sticking mid-screen.
    window.addEventListener('mousemove', e => {
      const rect   = this._canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;   // canvas hidden (menus) — nothing to map
      const scaleX = this._canvas.width  / rect.width;
      const scaleY = this._canvas.height / rect.height;
      this.mouse.x = Math.max(0, Math.min(this._canvas.width,  (e.clientX - rect.left) * scaleX));
      this.mouse.y = Math.max(0, Math.min(this._canvas.height, (e.clientY - rect.top)  * scaleY));
      // Self-correct the HELD-button state from the event's live buttons bitmask (bit0=left,
      // bit1=right). A mousedown or mouseup that got missed — right-click at a clipped canvas
      // edge, a context menu swallowing the mouseup, a release off-window — would otherwise
      // leave mouse.down / rightDown latched wrong, so the bow charge never starts or never
      // releases (Kevin: coords update on right-click but no arrow fires). Since aiming always
      // moves the cursor, this keeps the button state honest every frame.
      this.mouse.down      = (e.buttons & 1) !== 0;
      this.mouse.rightDown = (e.buttons & 2) !== 0;
    });
    // Register presses anywhere inside the GAME AREA (the canvas or its wrap), not just
    // the canvas element. In zoomed-out / single-screen play the cursor sits over
    // letterbox bars / overflow-clipped edges that are part of #canvas-wrap but NOT the
    // canvas — a canvas-only listener never sees a click there, so a right-click on that
    // side never set rightDown and the bow "became a left-click / melee" (Kevin: right→
    // left ONLY in zoom mode). We still ignore clicks on the HTML HUD / menus (outside
    // the wrap) so those keep their own behaviour. Diagnostic: record the raw button +
    // which element was actually hit, surfaced on the Debug HUD.
    const _inGameArea = (t) => t === this._canvas ||
      (t && typeof t.closest === 'function' && t.closest('#canvas-wrap'));
    window.addEventListener('mousedown', e => {
      if (!_inGameArea(e.target)) return;   // HTML UI outside the game area handles itself
      // Map the click position NOW — mouse.x/y otherwise only refresh on mousemove, so a
      // click with no preceding move (a synthetic/programmatic click, or a trackpad tap
      // from rest) would fire at STALE coords (0,0) and hit whatever sits top-left — e.g.
      // the overhead Test-mode "◀ Designer" button, exiting the session on any click.
      const rect = this._canvas.getBoundingClientRect();
      if (rect.width && rect.height) {
        this.mouse.x = Math.max(0, Math.min(this._canvas.width,  (e.clientX - rect.left) * (this._canvas.width  / rect.width)));
        this.mouse.y = Math.max(0, Math.min(this._canvas.height, (e.clientY - rect.top)  * (this._canvas.height / rect.height)));
      }
      if (e.button === 0) {
        this.mouse.down       = true;
        this.mouse.clicked    = true;
        this.mouse.altClicked = e.altKey;
      }
      if (e.button === 2) { this.mouse.rightClicked = true; this.mouse.rightDown = true; }
    });
    this._canvas.addEventListener('mouseup', e => {
      if (e.button === 0) this.mouse.down = false;
      if (e.button === 2) this.mouse.rightDown = false;   // held-state for ranged attack
    });
    // Also release on a WINDOW mouseup: a right-hold to charge the bow is often released
    // with the cursor off the canvas (aiming at the screen edge) or while the context
    // menu briefly grabbed the event — the canvas-only handler above would miss it and
    // leave rightDown stuck. Catching it on the window makes bow-fire reliable.
    window.addEventListener('mouseup', e => {
      if (e.button === 0) this.mouse.down = false;
      if (e.button === 2) this.mouse.rightDown = false;
    });
    this._canvas.addEventListener('contextmenu', e => e.preventDefault());
    // Right-click is the ranged attack (hold to charge a bow). Suppress the browser
    // context menu during GAMEPLAY no matter which element the event targets — a
    // long right-hold can fire `contextmenu` on a HUD overlay or the canvas wrap
    // (not just the canvas), which the canvas-only handler above misses. Capture
    // phase + gated on `body.in-game`, so menu screens keep their native menu.
    window.addEventListener('contextmenu', (e) => {
      if (document.body && document.body.classList.contains('in-game')) e.preventDefault();
    }, true);
    // (No canvas 'mouseleave' reset: the window mousemove above re-syncs down/rightDown
    // from e.buttons everywhere on screen, and window mouseup/blur catch the real
    // release — clearing on leave only risked cancelling a bow charge mid-aim.)
    this._canvas.addEventListener('wheel', e => {
      e.preventDefault();
      this.scrollDelta += e.deltaY > 0 ? 1 : -1;
    }, { passive: false });
    // Lose focus (clicked off-screen / another window / alt-tab): a mouse button released
    // OUTSIDE the browser never fires a mouseup here, so mouse.rightDown / down would stick
    // TRUE — which persistently blocks bow-fire (the charge can only release when rightDown
    // goes false) and can spam melee. Clear all held input on blur so nothing stays latched
    // (Kevin: "the first time you click off screen it breaks, then it's constant").
    window.addEventListener('blur', () => {
      this.mouse.down = false; this.mouse.rightDown = false;
      this.mouse.clicked = false; this.mouse.rightClicked = false;
      for (const k in this.keys) this.keys[k] = false;
    });
  }

  // Right-stick cursor movement — uses P1's assigned gamepad if it's a controller
  applyStickCursor(speedPx, canvasW, canvasH) {
    const gp = this.dualInput ? this._anyGp()
                              : (this.p1GpSlot >= 0 ? this.gamepads[this.p1GpSlot] : this.gamepads[0]);
    if (!gp || !gp.connected) return;
    const sens = this._aimSens(0);
    this.mouse.x = Math.max(0, Math.min(canvasW, this.mouse.x + gp.aimX * speedPx * sens));
    this.mouse.y = Math.max(0, Math.min(canvasH, this.mouse.y + gp.aimY * speedPx * sens));
  }

  // Clear one-shot events at end of frame
  flush() {
    this.mouse.clicked      = false;
    this.mouse.rightClicked = false;
    this.mouse.altClicked   = false;
    this.scrollDelta        = 0;
    this._justPressed       = {};
  }

  // Drop every HELD key + button. flush() (per frame) deliberately keeps this.keys so a
  // held movement key repeats; this is the opposite — a one-shot reset for the START of a
  // session. A keydown with no matching keyup (a synthesised test input, or focus lost
  // mid-press) otherwise persists into the next run and walks the player unprompted.
  // (open-items-after-348: stale held keys across sessions.)
  clearHeld() {
    this.keys         = {};
    this._justPressed = {};
    this.mouse.down = false; this.mouse.rightDown = false;
    this.mouse.clicked = false; this.mouse.rightClicked = false; this.mouse.altClicked = false;
    this.scrollDelta  = 0;
  }

  isDown(code)     { return !!this.keys[code]; }
  isJustDown(code) { return !!this._justPressed[code]; }

  // ── P1 action checks (slot-aware) ────────────────────────

  _p1gp() { return this.p1GpSlot >= 0 ? (this.gamepads[this.p1GpSlot] ?? this._emptyGamepad(0)) : this._emptyGamepad(0); }

  // ── Rebindable-key resolver (§Phase 2) ──────────────────────
  // Resolve P1's active-scheme code for an action through KEY_BINDINGS (override else
  // scheme default). Returns null if KEY_BINDINGS isn't loaded (headless tests) so the
  // callers fall back to the historical literal — keeping default behaviour identical.
  _kbCode(action) {
    if (typeof KEY_BINDINGS === 'undefined') return null;
    const scheme = (this.p1GpSlot === -2) ? 'kb2' : 'kb1';
    return KEY_BINDINGS.resolve(0, scheme, action);
  }
  _kbDown(action, fallback) { return this.isDown(this._kbCode(action) || fallback); }
  _kbJust(action, fallback) { return this.isJustDown(this._kbCode(action) || fallback); }

  isLeft()   {
    if (this.dualInput) return this._kbDown('left', 'KeyA') || this._anyGp().moveX < 0 || this._anyGp().moveLeftBtn;
    const s = this.p1GpSlot;
    if (s >= 0)   return this._p1gp().moveX < 0 || this._p1gp().moveLeftBtn;   // stick OR a bound Move-Left button
    if (s === -2) return this._kbDown('left', 'ArrowLeft');
    return this._kbDown('left', 'KeyA');  // KB1
  }
  isRight()  {
    if (this.dualInput) return this._kbDown('right', 'KeyD') || this._anyGp().moveX > 0 || this._anyGp().moveRightBtn;
    const s = this.p1GpSlot;
    if (s >= 0)   return this._p1gp().moveX > 0 || this._p1gp().moveRightBtn;
    if (s === -2) return this._kbDown('right', 'ArrowRight');
    return this._kbDown('right', 'KeyD');
  }
  isJump()   {
    // Secondary keyboard jumps (Up Arrow + J) are safe unless a 2nd local player
    // is sharing the keyboard (P2 on the arrow scheme) — then skip them. They apply
    // only while `jump` is NOT explicitly rebound (a rebind fully takes over).
    const kbExtra = this.p2GpSlot >= 0;
    const jumpBound = (typeof KEY_BINDINGS !== 'undefined') && KEY_BINDINGS.hasOverride(0, 'jump');
    // §5b — when Aim-Up is enabled, Up/W become look-up so keyboard jump is J-only
    // (unless jump was explicitly rebound). Gamepad A is unaffected.
    if (this._aimUpEnabled && !jumpBound) {
      if (this.dualInput) return this.isDown('KeyJ') || this._anyGp().jump;
      return this.p1GpSlot >= 0 ? this._p1gp().jump : this.isDown('KeyJ');
    }
    const extra = kbExtra && !jumpBound && (this.isDown('ArrowUp') || this.isDown('KeyJ'));
    if (this.dualInput) return this._kbDown('jump', 'KeyW') || (!jumpBound && (this.isDown('ArrowUp') || this.isDown('KeyJ'))) || this._anyGp().jump;
    const s = this.p1GpSlot;
    if (s >= 0)   return this._p1gp().jump;
    if (s === -2) return this._kbDown('jump', 'ArrowUp') || (kbExtra && !jumpBound && this.isDown('KeyJ'));
    return this._kbDown('jump', 'KeyW') || extra;
  }
  isCrouch() {
    // §Controller pass — the LEFT STICK also ducks: pushing down past a firm threshold =
    // crouch, so all four directional-melee inputs (and duck) live on one stick for combos.
    // The crouch/shield BUTTON still works too.
    if (this.dualInput) return this._kbDown('crouch', 'KeyS') || this._anyGp().crouch || this._anyGp().moveY > InputManager.STICK_DIR;
    const s = this.p1GpSlot;
    if (s >= 0)   return this._p1gp().crouch || this._p1gp().moveY > InputManager.STICK_DIR;
    if (s === -2) return this._kbDown('crouch', 'ArrowDown');
    return this._kbDown('crouch', 'KeyS');
  }
  // §Controller pass — LEFT-STICK UP held past the threshold (P1 gamepad). Feeds the "up"
  // directional-melee / look-up intent so the stick covers up as well as down.
  isStickUp() {
    const gp = this.dualInput ? this._anyGp() : (this.p1GpSlot >= 0 ? this._p1gp() : null);
    return !!(gp && gp.moveY < -InputManager.STICK_DIR);
  }
  // Aim-up / look-up override (§Phase 5b): while held, ranged aiming forces straight up.
  // Keyboard only (gamepad aims with the right stick). Gated on the Aim-Up world toggle
  // (`_aimUpEnabled`, set by game.js). Default up-key = the scheme's natural up (W for
  // WASD, ArrowUp for arrows) or the player's aimUp rebind.
  isAimUp() {
    if (!this._aimUpEnabled || this.p1GpSlot >= 0) return false;
    return this._kbDown('aimUp', this.p1GpSlot === -2 ? 'ArrowUp' : 'KeyW');
  }
  // Is the LOOK-UP / aim-up KEY physically held? Unlike isAimUp() this ignores the aim-up
  // MODE gate, so features like the ledge grab fire off the up key in ANY scheme (default:
  // it's also the jump key; aim-up-on: it's the dedicated look-up key). Keyboard only.
  isLookUpHeld() {
    if (this.p1GpSlot >= 0) return false;
    return this._kbDown('aimUp', this.p1GpSlot === -2 ? 'ArrowUp' : 'KeyW');
  }
  isRun() {
    // §Controller pass — Sprint is now a bindable gamepad button (default-unassigned); when
    // bound, holding it sprints. Unbound → false, preserving the old "auto-run on full stick".
    if (this.dualInput) return this.isDown('ShiftLeft') || this.isDown('ShiftRight') || this._anyGp().sprintBtn;
    if (this.p1GpSlot >= 0) return this._p1gp().sprintBtn;
    return this._kbDown('run', 'ShiftLeft') || this.isDown('ShiftRight');
  }
  isAttack() {
    if (this.dualInput) return this._kbDown('melee', 'Space') || this._anyGp().attack || this._anyGp().triggerR > 0.5;
    const s = this.p1GpSlot;
    if (s >= 0)   return this._p1gp().attack || this._p1gp().triggerR > 0.5;
    if (s === -2) return this._kbDown('melee', 'Insert');
    return this._kbDown('melee', 'Space');  // KB1 — mouse button handled separately in game.js
  }
  // Smart Mobs §2 — Trident throw (P1): one-shot. Keyboard 'Q' or gamepad R3.
  // (Right-click is now the ranged attack, so it's no longer a throw trigger.)
  isThrow() {
    return this._kbJust('throw', 'KeyQ') || this.p1JustDown('throwBtn');
  }

  // ── Dedicated combat inputs (Smart Mobs §2) ─────────────────
  // Melee and ranged are separate actions so they can be mapped independently
  // (build 78 adds a rebinding UI over these). Defaults: melee = Space / gamepad X
  // (+ left-click, guarded in game.js against mining/placing); ranged = right-mouse
  // held / gamepad RT. Left/right-click keep working for mouse players; keyboard-
  // only players get Space (melee) and can bind a ranged key in the config later.
  isMeleeAttack() {
    if (this.dualInput) return this._kbDown('melee', 'Space') || this._anyGp().attack;
    const s = this.p1GpSlot;
    if (s >= 0)   return this._p1gp().attack;
    if (s === -2) return this._kbDown('melee', 'Insert');
    return this._kbDown('melee', 'Space');
  }
  // Held state (for charging a bow). The `ranged` binding defaults to Right-Click
  // (Mouse2) but can be rebound to a key or Left-Click; gamepad right trigger also fires.
  isRangedAttackDown() {
    // RT (analog) OR the `ranged` button-binding (RT-as-button by default, but the player
    // may rebind Ranged Attack to any button — §Controller pass).
    const rt = this.dualInput ? (this._anyGp().triggerR > 0.5 || this._anyGp().rangedBtn)
             : (this.p1GpSlot >= 0 ? (this._p1gp().triggerR > 0.5 || this._p1gp().rangedBtn) : false);
    const c = this._kbCode('ranged') || 'Mouse2';
    const codeDown = c === 'Mouse2' ? this.mouse.rightDown : c === 'Mouse0' ? this.mouse.down : this.isDown(c);
    return codeDown || rt;
  }
  moveX() {
    // A bound Move-Left/Right button contributes full deflection (so the D-pad can drive movement).
    const gpBtn = (g) => (g.moveRightBtn ? 1 : 0) - (g.moveLeftBtn ? 1 : 0);
    if (this.dualInput) {
      const kb = (this._kbDown('right', 'KeyD') ? 1 : 0) - (this._kbDown('left', 'KeyA') ? 1 : 0);
      const g = this._anyGp();
      const gp = gpBtn(g) || g.moveX * (this._sens(0));
      return Math.abs(kb) >= Math.abs(gp) ? kb : gp;
    }
    const s = this.p1GpSlot;
    if (s >= 0)   { const g = this._p1gp(); return gpBtn(g) || g.moveX * (this._sens(0)); }
    if (s === -2) return (this._kbDown('right', 'ArrowRight') ? 1 : 0) - (this._kbDown('left', 'ArrowLeft') ? 1 : 0);
    return (this._kbDown('right', 'KeyD') ? 1 : 0) - (this._kbDown('left', 'KeyA') ? 1 : 0);
  }

  // ── P2 action checks (slot-aware) ────────────────────────

  _p2gp() { return this.p2GpSlot >= 0 ? (this.gamepads[this.p2GpSlot] ?? this._emptyGamepad(1)) : this._emptyGamepad(1); }

  isP2Left()   {
    const s = this.p2GpSlot;
    if (s >= 0)  return this._p2gp().moveX < 0;
    if (s === -2) return this.isDown('ArrowLeft');
    return this.isDown('KeyA');  // KB1 (P2 on KB1 when P1 is on gamepad)
  }
  isP2Right()  {
    const s = this.p2GpSlot;
    if (s >= 0)  return this._p2gp().moveX > 0;
    if (s === -2) return this.isDown('ArrowRight');
    return this.isDown('KeyD');
  }
  isP2Jump()   {
    const s = this.p2GpSlot;
    if (s >= 0)  return this._p2gp().jump;
    if (s === -2) return this.isDown('ArrowUp');
    return this.isDown('KeyW');
  }
  isP2Crouch() {
    const s = this.p2GpSlot;
    if (s >= 0)  return this._p2gp().crouch;
    if (s === -2) return this.isDown('ArrowDown');
    return this.isDown('KeyS');
  }
  isP2Attack() {
    const s = this.p2GpSlot;
    if (s >= 0)  return this._p2gp().attack || this._p2gp().triggerR > 0.5;
    if (s === -2) return this.isDown('Insert');
    return this.isDown('Space');
  }
  moveX2() {
    const s = this.p2GpSlot;
    if (s >= 0) return this._p2gp().moveX * (this._sens(1));
    if (s === -2) return (this.isDown('ArrowRight') ? 1 : 0) - (this.isDown('ArrowLeft') ? 1 : 0);
    return (this.isDown('KeyD') ? 1 : 0) - (this.isDown('KeyA') ? 1 : 0);
  }

  // Use Item / Lever / Inventory for keyboard players
  isP2UseItem()  {
    if (this.p2GpSlot === -2) return this.isJustDown('Delete');
    if (this.p2GpSlot === -1) return this.isJustDown('KeyU');
    return false;
  }
  isP2UseLever() { return this.p2GpSlot < 0 && this.isJustDown('Delete'); }
  isP2Inventory(){ return this.p2GpSlot < 0 && this.isJustDown('KeyI'); }

  // ── Generic per-player input (Phase 3B) ──────────────────
  // Player index i: 0=P1, 1=P2, 2=P3, 3=P4. P1/P2 delegate to the existing
  // (tested) slot-aware methods; P3/P4 are gamepad-only (one keyboard max).
  _pSlot(i) { return [this.p1GpSlot, this.p2GpSlot, this.p3GpSlot, this.p4GpSlot][i]; }
  _slotGp(slot) { return slot >= 0 ? (this.gamepads[slot] ?? this._emptyGamepad(0)) : this._emptyGamepad(0); }

  // Each accessor checks a bot override FIRST — a bot-controlled slot reads its
  // synthetic input; a human slot falls through to the existing hardware path.
  pLeft(i)   { const b = this.botInput[i]; if (b) return b.moveX < -0.15; return i === 0 ? this.isLeft()   : i === 1 ? this.isP2Left()   : this._slotGp(this._pSlot(i)).moveX < 0; }
  pRight(i)  { const b = this.botInput[i]; if (b) return b.moveX >  0.15; return i === 0 ? this.isRight()  : i === 1 ? this.isP2Right()  : this._slotGp(this._pSlot(i)).moveX > 0; }
  pJump(i)   { const b = this.botInput[i]; if (b) return !!b.jump;        return i === 0 ? this.isJump()   : i === 1 ? this.isP2Jump()   : this._slotGp(this._pSlot(i)).jump; }
  // Per-player UP (left-stick up / d-pad up / P1 keyboard up). Needed by the monkey-bar grab,
  // which read P1-only keyboard keys + isStickUp() and so was dead for P2-P4 (they get the
  // limited per-player adapter, not the full InputManager). (QA — controller mapping fix.)
  pUp(i)     { const b = this.botInput[i]; if (b) return (b.moveY || 0) < -0.15;
               if (i === 0) return this.isStickUp() || this.isDown('KeyW') || this.isDown('ArrowUp');
               const gp = this._slotGp(this._pSlot(i)); return !!(gp && (gp.moveY < -InputManager.STICK_DIR || gp.dpad0)); }
  pCrouch(i) { const b = this.botInput[i]; if (b) return !!b.crouch;      return i === 0 ? this.isCrouch() : i === 1 ? this.isP2Crouch() : this._slotGp(this._pSlot(i)).crouch; }
  pAttack(i) {
    const b = this.botInput[i]; if (b) return !!b.attack;
    if (i === 0) return this.isAttack();
    if (i === 1) return this.isP2Attack();
    const gp = this._slotGp(this._pSlot(i));
    return gp.attack || gp.triggerR > 0.5;
  }
  pMoveX(i)  {
    const b = this.botInput[i]; if (b) return b.moveX;
    if (i === 0) return this.moveX();
    if (i === 1) return this.moveX2();
    return this._slotGp(this._pSlot(i)).moveX * (this._sens(i));
  }
  // Right-stick gamepad object for a player (aim). P1/P2 keep their helpers.
  // A bot returns a synthetic stick vector so the free-aim combat branch is used.
  pGp(i)     { const b = this.botInput[i]; if (b) return { aimX: b.aimX || 0, aimY: b.aimY || 0, moveX: b.moveX || 0, moveY: 0 }; return i === 0 ? this._p1gp() : i === 1 ? this._p2gp() : this._slotGp(this._pSlot(i)); }
  // A bot reports a gamepad-like slot (>=0) so aim uses the free-aim atan2 path.
  pGpSlot(i) { const b = this.botInput[i]; if (b) return b.gpSlot != null ? b.gpSlot : 0; return this._pSlot(i); }
  // One-shot just-pressed for a player. P1 honors dual-input; others slot-based.
  // Bot slots edge-detect against last frame's snapshot (_botPrev).
  pJustDown(i, btn) {
    const b = this.botInput[i];
    if (b) { const prev = this._botPrev[i]; return !!(b.buttons && b.buttons[btn]) && !(prev && prev[btn]); }
    if (i === 0) return this.p1JustDown(btn);
    if (i === 1) return this.p2JustDown(btn);
    const s = this._pSlot(i);
    return s >= 0 ? this.gpJustDown(s, btn) : false;
  }

  // Returns 0–8 if a number key 1–9 was just held, else -1. Each slot is rebindable
  // (defaults Digit1..Digit9).
  hotbarKey() {
    for (let i = 1; i <= 9; i++) {
      if (this._kbDown('hotbar' + i, `Digit${i}`)) return i - 1;
    }
    return -1;
  }
}

// §Controller pass — left-stick deflection past this magnitude counts as a directional
// press (up = look-up / up-attack, down = crouch / down-attack). Firm enough that ordinary
// horizontal running (small vertical drift) never triggers a duck.
InputManager.STICK_DIR = 0.6;
