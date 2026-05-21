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
    this.mouse        = { x: 0, y: 0, down: false, clicked: false, rightClicked: false, altClicked: false };
    this.scrollDelta  = 0;
    this._canvas      = canvas;

    // Gamepad state — 4 slots
    this.gamepads  = [0, 1, 2, 3].map(i => this._emptyGamepad(i));
    this._gpPrev   = [0, 1, 2, 3].map(i => this._emptyGamepad(i));

    // Controller settings (set by game.js each frame)
    this.controllerSensitivity    = 1.0;
    this.controllerAimSensitivity = 1.0;
    this.controllerDeadzone       = GP_DEADZONE_STICK;

    // Assigned input slots — set each frame by game.js from ControllerConfig
    // -1 = KB1 (WASD), -2 = KB2 (Arrows), 0-3 = gamepad slot
    this.p1GpSlot = 0;   // P1 default: gamepad 0
    this.p2GpSlot = 1;   // P2 default: gamepad 1

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

  // Poll Gamepad API — call once per frame at the START of _update()
  updateGamepad() {
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
      const btn = (idx) => (b[idx] ? b[idx].pressed : false);
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
        triggerL:  val(6) > GP_DEADZONE_TRIGGER ? val(6) : 0,
        triggerR:  val(7) > GP_DEADZONE_TRIGGER ? val(7) : 0,
        menu:      btn(9),   // Start
        dpad0:     btn(12),  // Up
        dpad1:     btn(15),  // Right
        dpad2:     btn(13),  // Down
        dpad3:     btn(14),  // Left
        moveX: this._applyDeadZone(a[0] ?? 0, this.controllerDeadzone),
        moveY: this._applyDeadZone(a[1] ?? 0, this.controllerDeadzone),
        aimX:  this._applyDeadZone(a[2] ?? 0, this.controllerDeadzone),
        aimY:  this._applyDeadZone(a[3] ?? 0, this.controllerDeadzone),
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

  // Slot-aware just-pressed helpers — use these instead of gpJustDown(0,…)
  p1JustDown(btn) { return this.p1GpSlot >= 0 ? this.gpJustDown(this.p1GpSlot, btn) : false; }
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
      this.mouse.x = (e.clientX - rect.left) * scaleX;
      this.mouse.y = (e.clientY - rect.top)  * scaleY;
    });
    this._canvas.addEventListener('mousedown', e => {
      if (e.button === 0) {
        this.mouse.down       = true;
        this.mouse.clicked    = true;
        this.mouse.altClicked = e.altKey;
      }
      if (e.button === 2) { this.mouse.rightClicked = true; }
    });
    this._canvas.addEventListener('mouseup', e => {
      if (e.button === 0) this.mouse.down = false;
    });
    this._canvas.addEventListener('contextmenu', e => e.preventDefault());
    this._canvas.addEventListener('mouseleave', () => { this.mouse.down = false; });
    this._canvas.addEventListener('wheel', e => {
      e.preventDefault();
      this.scrollDelta += e.deltaY > 0 ? 1 : -1;
    }, { passive: false });
  }

  // Right-stick cursor movement — uses P1's assigned gamepad if it's a controller
  applyStickCursor(speedPx, canvasW, canvasH) {
    const slot = this.p1GpSlot >= 0 ? this.p1GpSlot : 0;
    const gp   = this.gamepads[slot];
    if (!gp || !gp.connected) return;
    const sens = this.controllerAimSensitivity ?? 1.0;
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
    const s = this.p1GpSlot;
    if (s >= 0)  return this._p1gp().moveX < 0;
    if (s === -2) return this.isDown('ArrowLeft');
    return this.isDown('KeyA');  // KB1
  }
  isRight()  {
    const s = this.p1GpSlot;
    if (s >= 0)  return this._p1gp().moveX > 0;
    if (s === -2) return this.isDown('ArrowRight');
    return this.isDown('KeyD');
  }
  isJump()   {
    const s = this.p1GpSlot;
    if (s >= 0)  return this._p1gp().jump;
    if (s === -2) return this.isDown('ArrowUp');
    return this.isDown('KeyW');
  }
  isCrouch() {
    const s = this.p1GpSlot;
    if (s >= 0)  return this._p1gp().crouch;
    if (s === -2) return this.isDown('ArrowDown');
    return this.isDown('KeyS');
  }
  isRun() {
    if (this.p1GpSlot >= 0) return false;  // gamepad: full-stick deflection auto-runs
    return this.isDown('ShiftLeft') || this.isDown('ShiftRight');
  }
  isAttack() {
    const s = this.p1GpSlot;
    if (s >= 0) return this._p1gp().attack || this._p1gp().triggerR > 0.5;
    if (s === -2) return this.isDown('Insert');
    return this.isDown('Space');  // KB1 — mouse button handled separately in game.js
  }
  moveX() {
    const s = this.p1GpSlot;
    if (s >= 0) return this._p1gp().moveX * (this.controllerSensitivity ?? 1.0);
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
    if (s >= 0) return this._p2gp().moveX * (this.controllerSensitivity ?? 1.0);
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

  // Returns 0–8 if a number key 1–9 was just held, else -1
  hotbarKey() {
    for (let i = 1; i <= 9; i++) {
      if (this.isDown(`Digit${i}`)) return i - 1;
    }
    return -1;
  }
}
