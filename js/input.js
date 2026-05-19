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
    this.controllerDeadzone       = 0.20; // overridden by worldAdvSettings.controllerDeadzone

    // 'ijkl'  → P2 uses IJKL+U keys (default; P1 may also use arrow keys)
    // 'arrows' → P2 uses Arrow keys+Insert/End/PageDown/Home; P1 is WASD-only
    // Set each frame by game.js based on ControllerConfig assignments.
    this.p2KeyMode = 'ijkl';

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
        // Left stick (movement) with configurable dead zone
        moveX: this._applyDeadZone(a[0] ?? 0, this.controllerDeadzone),
        moveY: this._applyDeadZone(a[1] ?? 0, this.controllerDeadzone),
        // Right stick (aim) with configurable dead zone
        aimX:  this._applyDeadZone(a[2] ?? 0, this.controllerDeadzone),
        aimY:  this._applyDeadZone(a[3] ?? 0, this.controllerDeadzone),
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
      // Don't intercept keyboard events when a text input/textarea is focused (e.g. chat)
      const ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
      this.keys[e.code]         = true;
      this._justPressed[e.code] = true;
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab','KeyU','KeyF','Escape',
           'AltLeft','AltRight','Insert','End','PageDown','Home'].includes(e.code)) {
        e.preventDefault();
      }
      if (e.ctrlKey && (e.code === 'KeyZ' || e.code === 'KeyY' || e.code === 'KeyC' || e.code === 'KeyV')) e.preventDefault();
    });
    window.addEventListener('keyup', e => {
      // Clear keys regardless of focus so keys don't get stuck when losing focus mid-press
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

  // Move the virtual cursor using the right stick. Called every frame before any early returns
  // so it works in all screens: gameplay, inventory, menus, popups, pause, etc.
  // speedPx = pixels/frame at full deflection (scaled by controllerAimSensitivity).
  applyStickCursor(speedPx, canvasW, canvasH) {
    const gp = this.gamepads[0];
    if (!gp || !gp.connected) return;
    const sens = this.controllerAimSensitivity ?? 1.0;
    this.mouse.x = Math.max(0, Math.min(canvasW, this.mouse.x + gp.aimX * speedPx * sens));
    this.mouse.y = Math.max(0, Math.min(canvasH, this.mouse.y + gp.aimY * speedPx * sens));
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

  // When p2KeyMode === 'arrows', P2 owns the arrow keys so P1 uses WASD only.
  isLeft()   {
    const arr = this.p2KeyMode !== 'arrows' && this.isDown('ArrowLeft');
    return arr || this.isDown('KeyA') || this.gamepads[0].moveX < 0;
  }
  isRight()  {
    const arr = this.p2KeyMode !== 'arrows' && this.isDown('ArrowRight');
    return arr || this.isDown('KeyD') || this.gamepads[0].moveX > 0;
  }
  isJump()   {
    const arr = this.p2KeyMode !== 'arrows' && this.isDown('ArrowUp');
    return arr || this.isDown('KeyW') || this.gamepads[0].jump;
  }
  isCrouch() {
    const arr = this.p2KeyMode !== 'arrows' && this.isDown('ArrowDown');
    return arr || this.isDown('KeyS') || this.gamepads[0].crouch;
  }
  isRun()    { return this.isDown('ShiftLeft') || this.isDown('ShiftRight'); }
  isAttack() { return this.isDown('Space') || this.gamepads[0].attack || this.gamepads[0].triggerR > 0.5; }

  // Merged analog X — P1 drops arrows when P2 owns them
  moveX() {
    const useArr = this.p2KeyMode !== 'arrows';
    const kb = ((useArr && this.isDown('ArrowRight')) || this.isDown('KeyD') ? 1 : 0)
             - ((useArr && this.isDown('ArrowLeft'))  || this.isDown('KeyA') ? 1 : 0);
    const gp = this.gamepads[0].moveX * (this.controllerSensitivity ?? 1.0);
    return Math.max(-1, Math.min(1, kb + gp));
  }

  // ── Player 2 action checks ────────────────────────────────────────────────
  // 'ijkl'  mode: IJKL + U  (P1 is on gamepad or not sharing keyboard)
  // 'arrows' mode: Arrow keys + Insert/End/PageDown/Home  (both players on keyboard)
  isP2Left()   {
    const kb = this.p2KeyMode === 'arrows' ? this.isDown('ArrowLeft')  : this.isDown(P2_KEY_LEFT);
    return kb || this.gamepads[1].moveX < 0;
  }
  isP2Right()  {
    const kb = this.p2KeyMode === 'arrows' ? this.isDown('ArrowRight') : this.isDown(P2_KEY_RIGHT);
    return kb || this.gamepads[1].moveX > 0;
  }
  isP2Jump()   {
    const kb = this.p2KeyMode === 'arrows' ? this.isDown('ArrowUp')    : this.isDown(P2_KEY_JUMP);
    return kb || this.gamepads[1].jump;
  }
  isP2Crouch() {
    const kb = this.p2KeyMode === 'arrows' ? this.isDown('ArrowDown')  : this.isDown(P2_KEY_CROUCH);
    return kb || this.gamepads[1].crouch;
  }
  isP2Attack() {
    const kb = this.p2KeyMode === 'arrows' ? this.isDown('Insert')     : this.isDown(P2_KEY_ATTACK);
    return kb || this.gamepads[1].attack || this.gamepads[1].triggerR > 0.5;
  }

  // Merged analog X for P2
  moveX2() {
    const kb = this.p2KeyMode === 'arrows'
      ? (this.isDown('ArrowRight') ? 1 : 0) - (this.isDown('ArrowLeft') ? 1 : 0)
      : (this.isDown(P2_KEY_RIGHT) ? 1 : 0) - (this.isDown(P2_KEY_LEFT) ? 1 : 0);
    const gp = this.gamepads[1].moveX * (this.controllerSensitivity ?? 1.0);
    return Math.max(-1, Math.min(1, kb + gp));
  }

  // One-shot checks for P2 arrows-mode action keys (End / PageDown / Home)
  isP2UseItem()  { return this.p2KeyMode === 'arrows' && this.isJustDown('End'); }
  isP2UseLever() { return this.p2KeyMode === 'arrows' && this.isJustDown('PageDown'); }
  isP2Inventory(){ return this.p2KeyMode === 'arrows' && this.isJustDown('Home'); }

  // Returns 0–8 if a number key 1–9 was just held, else -1
  hotbarKey() {
    for (let i = 1; i <= 9; i++) {
      if (this.isDown(`Digit${i}`)) return i - 1;
    }
    return -1;
  }
}
