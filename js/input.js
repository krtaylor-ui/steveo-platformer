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
      prevSlot: false, context: false, menu: false,
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
      this.gamepads[i] = {
        id:        i,
        connected: true,
        rawId:     gp.id,
        jump:      btn(0),   // A
        crouch:    btn(1),   // B
        attack:    btn(2),   // X
        place:     btn(3),   // Y
        prevSlot:  btn(4),   // LB
        context:   btn(5),   // RB
        throwBtn:  btn(11),  // R3 (right-stick click) — Trident throw (Smart Mobs §2)
        triggerL:  val(6) > GP_DEADZONE_TRIGGER ? val(6) : 0,
        triggerR:  val(7) > GP_DEADZONE_TRIGGER ? val(7) : 0,
        menu:      btn(9),   // Start
        dpad0:     btn(12),  // Up
        dpad1:     btn(15),  // Right
        dpad2:     btn(13),  // Down
        dpad3:     btn(14),  // Left
        moveX: this._applyDeadZone(a[0] ?? 0, this._deadzoneForSlot(i)),
        moveY: this._applyDeadZone(a[1] ?? 0, this._deadzoneForSlot(i)),
        aimX:  this._applyDeadZone(a[2] ?? 0, this._deadzoneForSlot(i)),
        aimY:  this._applyDeadZone(a[3] ?? 0, this._deadzoneForSlot(i)),
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

    this._canvas.addEventListener('mousemove', e => {
      const rect   = this._canvas.getBoundingClientRect();
      const scaleX = this._canvas.width  / rect.width;
      const scaleY = this._canvas.height / rect.height;
      // Clamp to the 800×500 backing so a transient display/size mismatch can't map the
      // cursor to a wild off-canvas world point (belt-and-suspenders for the resize fix).
      this.mouse.x = Math.max(0, Math.min(this._canvas.width,  (e.clientX - rect.left) * scaleX));
      this.mouse.y = Math.max(0, Math.min(this._canvas.height, (e.clientY - rect.top)  * scaleY));
    });
    this._canvas.addEventListener('mousedown', e => {
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
    // Cursor left the canvas: stop LEFT-click actions (mining/placing), but DON'T clear
    // rightDown — you routinely aim the bow past the canvas edge, and clearing it here
    // was cancelling the charge/fire mid-aim (Kevin: "right-click to fire randomly turns
    // off"). The window mouseup above still catches the real release.
    this._canvas.addEventListener('mouseleave', () => { this.mouse.down = false; });
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

  isDown(code)     { return !!this.keys[code]; }
  isJustDown(code) { return !!this._justPressed[code]; }

  // ── P1 action checks (slot-aware) ────────────────────────

  _p1gp() { return this.p1GpSlot >= 0 ? (this.gamepads[this.p1GpSlot] ?? this._emptyGamepad(0)) : this._emptyGamepad(0); }

  isLeft()   {
    if (this.dualInput) return this.isDown('KeyA') || this._anyGp().moveX < 0;
    const s = this.p1GpSlot;
    if (s >= 0)   return this._p1gp().moveX < 0;
    if (s === -2) return this.isDown('ArrowLeft');
    return this.isDown('KeyA');  // KB1
  }
  isRight()  {
    if (this.dualInput) return this.isDown('KeyD') || this._anyGp().moveX > 0;
    const s = this.p1GpSlot;
    if (s >= 0)   return this._p1gp().moveX > 0;
    if (s === -2) return this.isDown('ArrowRight');
    return this.isDown('KeyD');
  }
  isJump()   {
    // Secondary keyboard jumps (Up Arrow + J) are safe unless a 2nd local player
    // is sharing the keyboard (P2 on the arrow scheme) — then skip them.
    const kbExtra = this.p2GpSlot >= 0;
    const extra = kbExtra && (this.isDown('ArrowUp') || this.isDown('KeyJ'));
    if (this.dualInput) return this.isDown('KeyW') || this.isDown('ArrowUp') || this.isDown('KeyJ') || this._anyGp().jump;
    const s = this.p1GpSlot;
    if (s >= 0)   return this._p1gp().jump;
    if (s === -2) return this.isDown('ArrowUp') || (kbExtra && this.isDown('KeyJ'));
    return this.isDown('KeyW') || extra;
  }
  isCrouch() {
    if (this.dualInput) return this.isDown('KeyS') || this._anyGp().crouch;
    const s = this.p1GpSlot;
    if (s >= 0)   return this._p1gp().crouch;
    if (s === -2) return this.isDown('ArrowDown');
    return this.isDown('KeyS');
  }
  isRun() {
    if (this.dualInput) return this.isDown('ShiftLeft') || this.isDown('ShiftRight');
    if (this.p1GpSlot >= 0) return false;  // gamepad: full-stick deflection auto-runs
    return this.isDown('ShiftLeft') || this.isDown('ShiftRight');
  }
  isAttack() {
    if (this.dualInput) return this.isDown('Space') || this._anyGp().attack || this._anyGp().triggerR > 0.5;
    const s = this.p1GpSlot;
    if (s >= 0)   return this._p1gp().attack || this._p1gp().triggerR > 0.5;
    if (s === -2) return this.isDown('Insert');
    return this.isDown('Space');  // KB1 — mouse button handled separately in game.js
  }
  // Smart Mobs §2 — Trident throw (P1): one-shot. Keyboard 'Q' or gamepad R3.
  // (Right-click is now the ranged attack, so it's no longer a throw trigger.)
  isThrow() {
    return this.isJustDown('KeyQ') || this.p1JustDown('throwBtn');
  }

  // ── Dedicated combat inputs (Smart Mobs §2) ─────────────────
  // Melee and ranged are separate actions so they can be mapped independently
  // (build 78 adds a rebinding UI over these). Defaults: melee = Space / gamepad X
  // (+ left-click, guarded in game.js against mining/placing); ranged = right-mouse
  // held / gamepad RT. Left/right-click keep working for mouse players; keyboard-
  // only players get Space (melee) and can bind a ranged key in the config later.
  isMeleeAttack() {
    if (this.dualInput) return this.isDown('Space') || this._anyGp().attack;
    const s = this.p1GpSlot;
    if (s >= 0)   return this._p1gp().attack;
    if (s === -2) return this.isDown('Insert');
    return this.isDown('Space');
  }
  // Held state (for charging a bow). Right-mouse or gamepad right trigger.
  isRangedAttackDown() {
    const rt = this.dualInput ? (this._anyGp().triggerR > 0.5)
             : (this.p1GpSlot >= 0 ? this._p1gp().triggerR > 0.5 : false);
    return this.mouse.rightDown || rt;
  }
  moveX() {
    if (this.dualInput) {
      const kb = (this.isDown('KeyD') ? 1 : 0) - (this.isDown('KeyA') ? 1 : 0);
      const gp = this._anyGp().moveX * (this._sens(0));
      return Math.abs(kb) >= Math.abs(gp) ? kb : gp;
    }
    const s = this.p1GpSlot;
    if (s >= 0)   return this._p1gp().moveX * (this._sens(0));
    if (s === -2) return (this.isDown('ArrowRight') ? 1 : 0) - (this.isDown('ArrowLeft') ? 1 : 0);
    return (this.isDown('KeyD') ? 1 : 0) - (this.isDown('KeyA') ? 1 : 0);
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

  // Returns 0–8 if a number key 1–9 was just held, else -1
  hotbarKey() {
    for (let i = 1; i <= 9; i++) {
      if (this.isDown(`Digit${i}`)) return i - 1;
    }
    return -1;
  }
}
