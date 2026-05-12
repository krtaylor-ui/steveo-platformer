// ============================================================
// input.js — Keyboard, mouse, and gamepad input manager
// ============================================================

class InputManager {
  constructor(canvas) {
    this.keys         = {};
    this._justPressed = {};  // cleared each flush; use isJustDown for one-shot checks
    this.mouse        = { x: 0, y: 0, down: false, clicked: false, rightClicked: false, altClicked: false };
    this.scrollDelta  = 0;
    this._canvas      = canvas;

    // Gamepad state — 4 slots (Phase 11K-1)
    this.gamepads  = [0, 1, 2, 3].map(i => this._emptyGamepad(i));
    this._gpPrev   = [0, 1, 2, 3].map(i => this._emptyGamepad(i));

    // Set by game.js before player.update() each frame
    this.controllerSensitivity    = 1.0;
    this.controllerAimSensitivity = 1.0;

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
      this._gpPrev[i]  = this.gamepads[i];   // snapshot for just-pressed detection
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
        // Face buttons
        jump:      btn(0),   // A / Cross
        crouch:    btn(1),   // B / Circle
        attack:    btn(2),   // X / Square
        place:     btn(3),   // Y / Triangle
        // Shoulder
        prevSlot:  btn(4),   // LB / L1
        context:   btn(5),   // RB / R1 — context action or next slot
        // Triggers (analog, 0–1)
        triggerL:  val(6) > GP_DEADZONE_TRIGGER ? val(6) : 0,
        triggerR:  val(7) > GP_DEADZONE_TRIGGER ? val(7) : 0,
        // Menu
        menu:      btn(9),   // Start
        // D-Pad
        dpad0:     btn(12),  // Up
        dpad1:     btn(15),  // Right
        dpad2:     btn(13),  // Down
        dpad3:     btn(14),  // Left
        // Left stick (movement) with dead zone
        moveX: this._applyDeadZone(a[0] ?? 0, GP_DEADZONE_STICK),
        moveY: this._applyDeadZone(a[1] ?? 0, GP_DEADZONE_STICK),
        // Right stick (aim) with dead zone
        aimX:  this._applyDeadZone(a[2] ?? 0, GP_DEADZONE_STICK),
        aimY:  this._applyDeadZone(a[3] ?? 0, GP_DEADZONE_STICK),
      };
    }
  }

  // One-shot detection: true only on the frame a button transitions false→true
  gpJustDown(slotIdx, btn) {
    const gp  = this.gamepads[slotIdx];
    const prv = this._gpPrev[slotIdx];
    if (!gp || !prv) return false;
    return !!gp[btn] && !prv[btn];
  }

  // ── Keyboard / mouse binding ──────────────────────────────

  _bind() {
    window.addEventListener('keydown', e => {
      this.keys[e.code]         = true;
      this._justPressed[e.code] = true;
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab','KeyU','KeyF','Escape',
           'AltLeft','AltRight'].includes(e.code)) {
        e.preventDefault();
      }
      if (e.ctrlKey && (e.code === 'KeyZ' || e.code === 'KeyY' || e.code === 'KeyC' || e.code === 'KeyV')) e.preventDefault();
    });
    window.addEventListener('keyup', e => {
      this.keys[e.code] = false;
    });

    this._canvas.addEventListener('mousemove', e => {
      const rect   = this._canvas.getBoundingClientRect();
      // rect.width/height reflect the CSS display size (after responsive scaling).
      // Divide by the scale factor to convert screen pixels → canvas logical pixels.
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
    this._canvas.addEventListener('mouseleave', () => {
      this.mouse.down = false;
    });
    // Scroll wheel for hotbar slot cycling / brush size
    this._canvas.addEventListener('wheel', e => {
      e.preventDefault();
      this.scrollDelta += e.deltaY > 0 ? 1 : -1;
    }, { passive: false });
  }

  // Call at end of each frame to clear one-shot events
  flush() {
    this.mouse.clicked      = false;
    this.mouse.rightClicked = false;
    this.mouse.altClicked   = false;
    this.scrollDelta        = 0;
    this._justPressed       = {};
  }

  isDown(code)     { return !!this.keys[code]; }
  isJustDown(code) { return !!this._justPressed[code]; }

  // ── Action checks — merge keyboard + gamepad[0] ───────────

  isLeft()   { return this.isDown('ArrowLeft')  || this.isDown('KeyA') || this.gamepads[0].moveX < 0; }
  isRight()  { return this.isDown('ArrowRight') || this.isDown('KeyD') || this.gamepads[0].moveX > 0; }
  isJump()   { return this.isDown('ArrowUp')    || this.isDown('KeyW') || this.gamepads[0].jump; }
  isCrouch() { return this.isDown('ArrowDown')  || this.isDown('KeyS') || this.gamepads[0].crouch; }
  isRun()    { return this.isDown('ShiftLeft')  || this.isDown('ShiftRight'); }
  isAttack() { return this.isDown('Space') || this.gamepads[0].attack || this.gamepads[0].triggerR > 0.5; }

  // Merged analog X movement axis: keyboard (±1) + left stick (scaled by sensitivity), clamped [-1,1]
  moveX() {
    const kb = (this.isDown('ArrowRight') || this.isDown('KeyD') ? 1 : 0)
             - (this.isDown('ArrowLeft')  || this.isDown('KeyA') ? 1 : 0);
    const gp = this.gamepads[0].moveX * (this.controllerSensitivity ?? 1.0);
    return Math.max(-1, Math.min(1, kb + gp));
  }

  // ── Player 2 action checks — IJKL keyboard or gamepad[1] (Phase 12) ──────
  isP2Left()   { return this.isDown(P2_KEY_LEFT)   || this.gamepads[1].moveX < 0; }
  isP2Right()  { return this.isDown(P2_KEY_RIGHT)  || this.gamepads[1].moveX > 0; }
  isP2Jump()   { return this.isDown(P2_KEY_JUMP)   || this.gamepads[1].jump; }
  isP2Crouch() { return this.isDown(P2_KEY_CROUCH) || this.gamepads[1].crouch; }
  isP2Attack() { return this.isDown(P2_KEY_ATTACK) || this.gamepads[1].attack || this.gamepads[1].triggerR > 0.5; }

  // Merged analog X for P2: IJKL keyboard (±1) or gamepad[1] left stick
  moveX2() {
    const kb = (this.isDown(P2_KEY_RIGHT) ? 1 : 0) - (this.isDown(P2_KEY_LEFT) ? 1 : 0);
    const gp = this.gamepads[1].moveX * (this.controllerSensitivity ?? 1.0);
    return Math.max(-1, Math.min(1, kb + gp));
  }

  // Returns 0–8 if a number key 1–9 was just held, else -1
  hotbarKey() {
    for (let i = 1; i <= 9; i++) {
      if (this.isDown(`Digit${i}`)) return i - 1;
    }
    return -1;
  }
}
