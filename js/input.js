// ============================================================
// input.js — Keyboard and mouse input manager
// ============================================================

class InputManager {
  constructor(canvas) {
    this.keys         = {};
    this._justPressed = {};  // cleared each flush; use isJustDown for one-shot checks
    this.mouse        = { x: 0, y: 0, down: false, clicked: false, rightClicked: false, altClicked: false };
    this.scrollDelta  = 0;
    this._canvas      = canvas;
    this._bind();
  }

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
  isLeft()   { return this.isDown('ArrowLeft')  || this.isDown('KeyA'); }
  isRight()  { return this.isDown('ArrowRight') || this.isDown('KeyD'); }
  isJump()   { return this.isDown('ArrowUp')    || this.isDown('KeyW'); }
  isCrouch() { return this.isDown('ArrowDown')  || this.isDown('KeyS'); }
  isRun()    { return this.isDown('ShiftLeft')  || this.isDown('ShiftRight'); }
  isAttack() { return this.isDown('Space'); }

  // Returns 0–8 if a number key 1–9 was just held, else -1
  hotbarKey() {
    for (let i = 1; i <= 9; i++) {
      if (this.isDown(`Digit${i}`)) return i - 1;
    }
    return -1;
  }
}
