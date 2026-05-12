// ============================================================
// menu.js — Main menu, mode selection, world selection screens
// ============================================================

class MenuSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.input  = new InputManager(canvas);

    // States: 'main' | 'normalSelect' | 'sandboxSetup' | 'sandboxNew'
    //         | 'sandboxLoad' | 'sandboxTemplate' | 'platformerSelect'
    this.state    = 'main';
    this._tick    = 0;
    this._frame   = null;
    this._running = false;
    this._mx      = 0;
    this._my      = 0;

    // Sandbox new-world text input
    this._sbFields   = ['', ''];  // [playerName, worldName]
    this._sbActive   = 0;
    this._kbListener = null;

    // Load / delete state (sandbox)
    this._loadWorlds      = [];   // refreshed each time sandboxLoad is entered
    this._deleteConfirmKey = null; // localStorage key pending delete confirmation

    // Normal level select state
    this._normalWorlds      = [];  // refreshed each time normalSelect is entered
    this._normalPreviews    = {};  // key → [colors] mini-preview strip

    // Platformer level select state
    this._platformerWorlds   = [];
    this._platformerPreviews = {};

    canvas.addEventListener('mousemove', e => {
      const r  = canvas.getBoundingClientRect();
      // Correct for CSS responsive scaling: convert screen px → canvas logical px.
      const sx = canvas.width  / r.width;
      const sy = canvas.height / r.height;
      this._mx = (e.clientX - r.left) * sx;
      this._my = (e.clientY - r.top)  * sy;
    });
    // Suppress right-click context menu on canvas
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  // ── Lifecycle ────────────────────────────────────────────────

  start() {
    this._running = true;
    this._frame   = requestAnimationFrame(() => this._loop());
  }

  _stop() {
    this._running = false;
    if (this._frame) { cancelAnimationFrame(this._frame); this._frame = null; }
  }

  _loop() {
    if (!this._running) return;
    this._tick++;
    this._handleClicks();
    if (!this._running) return;   // bail if a click triggered _stop()
    this._draw();
    this.input.flush();
    this._frame = requestAnimationFrame(() => this._loop());
  }

  // ── State transitions ─────────────────────────────────────────

  _setState(next) {
    if (this.state === 'sandboxNew' || this.state === 'sandboxTemplate') this._removeKeyListener();
    this.state = next;

    if (next === 'sandboxNew' || next === 'sandboxTemplate') {
      this._sbFields = ['', ''];
      this._sbActive = 0;
      this._addKeyListener();
    }

    if (next === 'sandboxLoad') {
      this._loadWorlds       = SandboxSaves.list();
      this._deleteConfirmKey = null;
    }

    if (next === 'normalSelect') {
      this._normalWorlds   = SandboxSaves.list();
      this._normalPreviews = {};
      for (const w of this._normalWorlds) {
        const data = SandboxSaves.load(w.key);
        if (data?.grid) this._normalPreviews[w.key] = this._buildMiniPreview(data.grid);
      }
    }

    if (next === 'platformerSelect') {
      this._platformerWorlds   = SandboxSaves.list();
      this._platformerPreviews = {};
      for (const w of this._platformerWorlds) {
        const data = SandboxSaves.load(w.key);
        if (data?.grid) this._platformerPreviews[w.key] = this._buildMiniPreview(data.grid);
      }
    }
  }

  _returnFromGame(menuState = 'main') {
    window.game = null;
    this._setState(menuState);
    this._tick = 0;
    this.start();
  }

  // ── Keyboard capture for sandbox new world ────────────────────

  _addKeyListener() {
    this._kbListener = (e) => {
      if (this.state !== 'sandboxNew' && this.state !== 'sandboxTemplate') return;
      const i      = this._sbActive;
      const maxLen = i === 0 ? 16 : 24;
      if (e.key === 'Backspace') {
        this._sbFields[i] = this._sbFields[i].slice(0, -1);
        e.preventDefault();
      } else if (e.key === 'Tab') {
        this._sbActive = 1 - this._sbActive;
        e.preventDefault();
      } else if (e.key === 'Enter') {
        if (this.state === 'sandboxTemplate') this._submitSandboxTemplate();
        else this._submitSandboxNew();
      } else if (e.key === 'Escape') {
        this._setState('sandboxSetup');
      } else if (e.key.length === 1 && this._sbFields[i].length < maxLen) {
        if (/^[\w\s\-'.!]$/.test(e.key)) {
          this._sbFields[i] += e.key;
          e.preventDefault();
        }
      }
    };
    document.addEventListener('keydown', this._kbListener);
  }

  _removeKeyListener() {
    if (this._kbListener) {
      document.removeEventListener('keydown', this._kbListener);
      this._kbListener = null;
    }
  }

  _submitSandboxNew() {
    const name  = this._sbFields[0].trim();
    const world = this._sbFields[1].trim();
    if (!name || !world) return;
    this._stop();
    this._removeKeyListener();
    window.game = new Game('sandbox',
      { playerName: name, worldName: world },
      () => this._returnFromGame()
    );
  }

  _submitSandboxTemplate() {
    const name  = this._sbFields[0].trim();
    const world = this._sbFields[1].trim();
    if (!name || !world) return;
    const result = buildTemplateWorldSave(name, world);
    if (!result.ok) { alert('Template generation failed: ' + result.error); return; }
    this._stop();
    this._removeKeyListener();
    window.game = new Game('sandbox',
      { playerName: name, worldName: world, loadKey: result.key },
      () => this._returnFromGame()
    );
  }

  _launchSandboxLoad(worldEntry) {
    this._stop();
    window.game = new Game('sandbox',
      { playerName: worldEntry.playerName, worldName: worldEntry.worldName,
        loadKey: worldEntry.key },
      () => this._returnFromGame()
    );
  }

  // ── Hit testing ───────────────────────────────────────────────

  _hit(x, y, w, h) {
    return this._mx >= x && this._mx <= x + w && this._my >= y && this._my <= y + h;
  }

  // ── Click routing ─────────────────────────────────────────────

  _handleClicks() {
    if (!this.input.mouse.clicked) return;
    switch (this.state) {
      case 'main':             this._clickMain();             break;
      case 'normalSelect':     this._clickNormalSelect();     break;
      case 'sandboxSetup':     this._clickSandboxSetup();     break;
      case 'sandboxNew':       this._clickSandboxNew();       break;
      case 'sandboxLoad':      this._clickSandboxLoad();      break;
      case 'sandboxTemplate':  this._clickSandboxTemplate();  break;
      case 'platformerSelect': this._clickPlatformerSelect(); break;
    }
  }

  // Main menu
  _mainButtons() {
    const bw = 268, bh = 58, cx = CANVAS_W / 2, gap = 14;
    const startY = 220;
    return [
      { label: 'Normal Mode',     sub: 'Adventure through a handcrafted world',   color: '#4CAF50', x: cx - bw/2, y: startY,              w: bw, h: bh },
      { label: 'Sandbox Mode',    sub: 'Build and explore freely',                color: '#FF9800', x: cx - bw/2, y: startY + bh + gap,    w: bw, h: bh },
      { label: 'Platformer Mode', sub: 'Race through handcrafted challenge maps', color: '#2196F3', x: cx - bw/2, y: startY + (bh+gap)*2, w: bw, h: bh },
    ];
  }

  _clickMain() {
    const btns = this._mainButtons();
    if      (this._hit(btns[0].x, btns[0].y, btns[0].w, btns[0].h)) this._setState('normalSelect');
    else if (this._hit(btns[1].x, btns[1].y, btns[1].w, btns[1].h)) this._setState('sandboxSetup');
    else if (this._hit(btns[2].x, btns[2].y, btns[2].w, btns[2].h)) this._setState('platformerSelect');
  }

  // Normal select
  _clickNormalSelect() {
    if (this._hit(20, 20, 90, 32)) { this._setState('main'); return; }

    // Adventure World card
    const ac = this._adventureCard();
    if (this._hit(ac.x, ac.y, ac.w, ac.h)) {
      this._stop();
      window.game = new Game('normal', { world: 'adventure' }, (s) => this._returnFromGame(s));
      return;
    }

    // Sandbox world cards (played in Normal mode)
    const worlds = this._normalWorlds;
    const listY = 198, cardH = 64, gap = 6;
    const cw = CANVAS_W - 80, cx = 40;
    for (let i = 0; i < Math.min(worlds.length, 4); i++) {
      const cy = listY + i * (cardH + gap);
      const w  = worlds[i];
      const hasProgress = NormalProgress.exists(w.key);
      // "New Game" button
      const newGameX = cx + cw - 100;
      if (this._hit(newGameX, cy + 14, 88, 36)) {
        this._launchNormalSandboxNew(w);
        return;
      }
      // "Continue Game" button (only clickable if progress exists)
      const continueX = cx + cw - 212;
      if (hasProgress && this._hit(continueX, cy + 14, 104, 36)) {
        this._launchNormalSandboxContinue(w);
        return;
      }
    }
  }

  _launchNormalSandboxNew(worldEntry) {
    this._stop();
    window.game = new Game(
      'normal',
      { sandboxLoadKey: worldEntry.key, newGame: true },
      (s) => this._returnFromGame(s || 'normalSelect')
    );
  }

  _launchNormalSandboxContinue(worldEntry) {
    this._stop();
    window.game = new Game(
      'normal',
      { sandboxLoadKey: worldEntry.key },
      (s) => this._returnFromGame(s || 'normalSelect')
    );
  }

  // Sandbox setup
  _clickSandboxSetup() {
    if (this._hit(20, 20, 90, 32)) { this._setState('main'); return; }
    const cx = CANVAS_W / 2, bw = 240, bh = 52;
    if (this._hit(cx - bw/2, 195, bw, bh)) this._setState('sandboxNew');
    if (this._hit(cx - bw/2, 261, bw, bh)) this._setState('sandboxLoad');
    if (this._hit(cx - bw/2, 327, bw, bh)) this._setState('sandboxTemplate');
  }

  // Sandbox template (same input form as New, different submit)
  _clickSandboxTemplate() {
    if (this._hit(20, 20, 90, 32)) { this._setState('sandboxSetup'); return; }
    const fw = 300, fx = CANVAS_W/2 - fw/2;
    if (this._hit(fx, 218, fw, 44)) { this._sbActive = 0; return; }
    if (this._hit(fx, 288, fw, 44)) { this._sbActive = 1; return; }
    if (this._hit(CANVAS_W/2 - 80, 360, 160, 44)) this._submitSandboxTemplate();
  }

  // Sandbox new
  _clickSandboxNew() {
    if (this._hit(20, 20, 90, 32)) { this._setState('sandboxSetup'); return; }
    const fw = 300, fx = CANVAS_W/2 - fw/2;
    if (this._hit(fx, 218, fw, 44)) { this._sbActive = 0; return; }
    if (this._hit(fx, 288, fw, 44)) { this._sbActive = 1; return; }
    if (this._hit(CANVAS_W/2 - 72, 360, 144, 44)) this._submitSandboxNew();
  }

  // Sandbox load
  _clickSandboxLoad() {
    if (this._hit(20, 20, 90, 32)) { this._setState('sandboxSetup'); return; }

    // Delete confirmation popup
    if (this._deleteConfirmKey !== null) {
      // Confirm delete
      if (this._hit(CANVAS_W/2 - 140, 248, 120, 38)) {
        SandboxSaves.remove(this._deleteConfirmKey);
        this._deleteConfirmKey = null;
        this._loadWorlds = SandboxSaves.list(); // refresh
      }
      // Cancel delete
      if (this._hit(CANVAS_W/2 + 20, 248, 120, 38)) {
        this._deleteConfirmKey = null;
      }
      return;
    }

    // World list entries
    const worlds = this._loadWorlds;
    const listY  = 130;
    const cardH  = 64, gap = 6;
    for (let i = 0; i < Math.min(worlds.length, 6); i++) {
      const cy = listY + i * (cardH + gap);
      const cw = CANVAS_W - 80;
      const cx = 40;

      // Play button (right side)
      const playX = cx + cw - 148;
      if (this._hit(playX, cy + 12, 64, 36)) {
        this._launchSandboxLoad(worlds[i]);
        return;
      }
      // Delete button
      const delX = cx + cw - 76;
      if (this._hit(delX, cy + 12, 64, 36)) {
        this._deleteConfirmKey = worlds[i].key;
        return;
      }
    }
  }

  // Platformer select
  _clickPlatformerSelect() {
    if (this._hit(20, 20, 90, 32)) { this._setState('main'); return; }

    // Adventure World card (compact)
    const ac = this._adventureCard();
    if (this._hit(ac.x, ac.y, ac.w, ac.h)) {
      this._stop();
      window.game = new Game('platformer', { world: 'adventure' }, (s) => this._returnFromGame(s || 'platformerSelect'));
      return;
    }

    // Sandbox world cards
    const worlds = this._platformerWorlds;
    const listY = 198, cardH = 64, gap = 6;
    const cw = CANVAS_W - 80, cx2 = 40;
    for (let i = 0; i < Math.min(worlds.length, 4); i++) {
      const cy = listY + i * (cardH + gap);
      const playX = cx2 + cw - 80;
      if (this._hit(playX, cy + 14, 68, 36)) {
        this._launchPlatformerSandbox(worlds[i]);
        return;
      }
    }
  }

  _launchPlatformerSandbox(worldEntry) {
    this._stop();
    window.game = new Game(
      'platformer',
      { platformerLoadKey: worldEntry.key },
      (s) => this._returnFromGame(s || 'platformerSelect')
    );
  }

  // ── Drawing ───────────────────────────────────────────────────

  _draw() {
    this.ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    this._drawBg();
    switch (this.state) {
      case 'main':             this._drawMain();             break;
      case 'normalSelect':     this._drawNormalSelect();     break;
      case 'sandboxSetup':     this._drawSandboxSetup();     break;
      case 'sandboxNew':       this._drawSandboxNew();       break;
      case 'sandboxLoad':      this._drawSandboxLoad();      break;
      case 'sandboxTemplate':  this._drawSandboxTemplate();  break;
      case 'platformerSelect': this._drawPlatformerSelect(); break;
    }
  }

  _drawBg() {
    const ctx = this.ctx;
    ctx.fillStyle = '#0d0d1a';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.strokeStyle = 'rgba(255,255,255,0.025)';
    ctx.lineWidth   = 1;
    for (let x = 0; x <= CANVAS_W; x += 32) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke();
    }
    for (let y = 0; y <= CANVAS_H; y += 32) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke();
    }
    const groundY = CANVAS_H - 32;
    for (let x = 0; x < CANVAS_W; x += 32) {
      drawBlock(ctx, BLOCK.GRASS, x, groundY,      0);
      drawBlock(ctx, BLOCK.DIRT,  x, groundY - 32, 0);
    }
  }

  _drawLogo() {
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '34px serif';
    ctx.fillText('⛏', CANVAS_W / 2, 56);
    ctx.font      = 'bold 44px Courier New';
    ctx.fillStyle = '#002233'; ctx.fillText('STEVEO', CANVAS_W/2 + 4, 108);
    ctx.fillStyle = '#004466'; ctx.fillText('STEVEO', CANVAS_W/2 + 2, 106);
    ctx.fillStyle = '#7ec8e3'; ctx.fillText('STEVEO', CANVAS_W/2,     104);
    ctx.font      = 'bold 20px Courier New';
    ctx.fillStyle = '#334455'; ctx.fillText('PLATFORMER', CANVAS_W/2 + 2, 136);
    ctx.fillStyle = '#5588aa'; ctx.fillText('PLATFORMER', CANVAS_W/2,     134);
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  _drawModeBtn(btn) {
    const ctx  = this.ctx;
    const hov  = this._hit(btn.x, btn.y, btn.w, btn.h);
    const { x, y, w, h, label, sub, color } = btn;
    ctx.fillStyle = hov ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.68)';
    _roundRect(ctx, x, y, w, h, 7); ctx.fill();
    ctx.strokeStyle = hov ? '#ffffff' : color;
    ctx.lineWidth   = hov ? 2 : 1.5;
    _roundRect(ctx, x, y, w, h, 7); ctx.stroke();
    ctx.fillStyle = color;
    _roundRect(ctx, x, y, 5, h, 3); ctx.fill();
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    const cx = x + w / 2 + 4;
    ctx.fillStyle = hov ? '#fff' : '#ddd';
    ctx.font      = 'bold 15px Courier New';
    ctx.fillText(label, cx, y + h/2 - 9);
    ctx.fillStyle = hov ? 'rgba(230,230,230,0.8)' : 'rgba(160,160,160,0.65)';
    ctx.font      = '10px Courier New';
    ctx.fillText(sub, cx, y + h/2 + 10);
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  _drawBackBtn(label = '← Back') {
    const ctx = this.ctx;
    const hov = this._hit(20, 20, 90, 32);
    ctx.fillStyle   = hov ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.6)';
    _roundRect(ctx, 20, 20, 90, 32, 5); ctx.fill();
    ctx.strokeStyle = hov ? '#888' : '#444'; ctx.lineWidth = 1;
    _roundRect(ctx, 20, 20, 90, 32, 5); ctx.stroke();
    ctx.fillStyle    = hov ? '#fff' : '#999';
    ctx.font         = '11px Courier New';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 65, 36);
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  _drawScreenTitle(text, y = 82) {
    const ctx = this.ctx;
    ctx.fillStyle    = '#7ec8e3';
    ctx.font         = 'bold 20px Courier New';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, CANVAS_W / 2, y);
    const tw = ctx.measureText(text).width;
    ctx.strokeStyle = 'rgba(126,200,227,0.3)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(CANVAS_W/2 - tw/2, y + 14);
    ctx.lineTo(CANVAS_W/2 + tw/2, y + 14);
    ctx.stroke();
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // Two sizes: 'large' (platformer/default) and 'compact' (normal select)
  _adventureCard(size = 'compact') {
    if (size === 'compact') return { x: 40, y: 106, w: CANVAS_W - 80, h: 68 };
    return { x: CANVAS_W/2 - 160, y: 180, w: 320, h: 90 };
  }

  _drawWorldCard(accentColor, playLabel, size = 'large') {
    const ctx = this.ctx;
    const { x, y, w, h } = this._adventureCard(size);
    const hov = this._hit(x, y, w, h);
    ctx.fillStyle   = hov ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.65)';
    _roundRect(ctx, x, y, w, h, 8); ctx.fill();
    ctx.strokeStyle = hov ? '#FFD700' : accentColor; ctx.lineWidth = hov ? 2 : 1.5;
    _roundRect(ctx, x, y, w, h, 8); ctx.stroke();
    ctx.fillStyle = accentColor;
    _roundRect(ctx, x, y, 5, h, 4); ctx.fill();
    ctx.font = '26px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🌲', x + 30, y + h/2);
    ctx.fillStyle = hov ? '#fff' : '#ddd'; ctx.font = 'bold 14px Courier New';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('Adventure World', x + 52, y + h/2 - 14);
    ctx.fillStyle = 'rgba(150,150,150,0.65)'; ctx.font = '9px Courier New';
    ctx.fillText('Plains  →  Cave  →  Nether  |  450 columns', x + 52, y + h/2 + 4);
    ctx.fillStyle = accentColor; ctx.font = '10px Courier New';
    ctx.fillText(playLabel, x + 52, y + h/2 + 22);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  // ── Screen: Main ─────────────────────────────────────────────

  _drawMain() {
    this._drawLogo();
    for (const btn of this._mainButtons()) this._drawModeBtn(btn);
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(80,90,110,0.5)';
    ctx.font      = '9px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('Phase 5C  •  Press Esc in-game to switch modes', CANVAS_W/2, CANVAS_H - 68);
    ctx.textAlign = 'left';
  }

  // ── Screen: Normal select ─────────────────────────────────────

  _drawNormalSelect() {
    this._drawScreenTitle('SELECT WORLD');
    this._drawBackBtn();

    // Adventure World card (compact)
    const ctx = this.ctx;
    const ac  = this._adventureCard();
    const hov = this._hit(ac.x, ac.y, ac.w, ac.h);
    ctx.fillStyle   = hov ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.65)';
    _roundRect(ctx, ac.x, ac.y, ac.w, ac.h, 8); ctx.fill();
    ctx.strokeStyle = hov ? '#FFD700' : '#4CAF50'; ctx.lineWidth = hov ? 2 : 1.5;
    _roundRect(ctx, ac.x, ac.y, ac.w, ac.h, 8); ctx.stroke();
    ctx.fillStyle = '#4CAF50';
    _roundRect(ctx, ac.x, ac.y, 5, ac.h, 4); ctx.fill();
    ctx.font = '22px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🌲', ac.x + 28, ac.y + ac.h / 2);
    ctx.fillStyle = hov ? '#fff' : '#ddd'; ctx.font = 'bold 13px Courier New';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('Default Adventure World', ac.x + 50, ac.y + ac.h / 2 - 10);
    ctx.fillStyle = 'rgba(150,150,150,0.65)'; ctx.font = '9px Courier New';
    ctx.fillText('Plains  →  Cave  →  Nether  |  handcrafted', ac.x + 50, ac.y + ac.h / 2 + 8);
    ctx.fillStyle = '#4CAF50'; ctx.font = '9px Courier New';
    ctx.fillText('► Play Adventure', ac.x + 50, ac.y + ac.h / 2 + 24);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

    // Divider
    const worlds = this._normalWorlds;
    if (worlds.length > 0) {
      ctx.fillStyle = 'rgba(100,110,130,0.55)';
      ctx.font      = '9px Courier New';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('— or play a saved Sandbox world in Normal mode —', CANVAS_W / 2, 188);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }

    // Sandbox world cards
    const listY = 198, cardH = 64, gap = 6;
    const cw = CANVAS_W - 80, cx2 = 40;

    if (worlds.length === 0) {
      ctx.fillStyle = 'rgba(80,90,110,0.5)';
      ctx.font      = '10px Courier New';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No saved Sandbox worlds — create one in Sandbox mode first', CANVAS_W / 2, 240);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }

    for (let i = 0; i < Math.min(worlds.length, 4); i++) {
      const w   = worlds[i];
      const cy  = listY + i * (cardH + gap);
      const hov2 = this._hit(cx2, cy, cw, cardH);
      const hasProgress = NormalProgress.exists(w.key);
      const preview = this._normalPreviews[w.key];

      // Card
      ctx.fillStyle   = hov2 ? 'rgba(76,175,80,0.08)' : 'rgba(0,0,0,0.55)';
      _roundRect(ctx, cx2, cy, cw, cardH, 6); ctx.fill();
      ctx.strokeStyle = hov2 ? '#4CAF50' : '#333'; ctx.lineWidth = 1;
      _roundRect(ctx, cx2, cy, cw, cardH, 6); ctx.stroke();

      // Mini-preview strip (world thumbnail)
      if (preview && preview.length > 0) {
        const stripW = cw - 160, stripH = cardH - 2, stripX = cx2 + 1;
        const pxW = stripW / preview.length;
        ctx.save();
        ctx.beginPath(); _roundRect(ctx, stripX, cy + 1, stripW, stripH - 1, 5); ctx.clip();
        for (let j = 0; j < preview.length; j++) {
          ctx.fillStyle = preview[j];
          ctx.fillRect(Math.floor(stripX + j * pxW), cy + 1, Math.ceil(pxW) + 1, stripH - 1);
        }
        // Overlay gradient for text readability
        const grad = ctx.createLinearGradient(stripX, 0, stripX + stripW, 0);
        grad.addColorStop(0,   'rgba(0,0,0,0)');
        grad.addColorStop(0.5, 'rgba(0,0,0,0.35)');
        grad.addColorStop(1,   'rgba(0,0,0,0.75)');
        ctx.fillStyle = grad; ctx.fillRect(stripX, cy + 1, stripW, stripH - 1);
        ctx.restore();
      } else {
        // Fallback accent bar
        ctx.fillStyle = '#336633';
        _roundRect(ctx, cx2, cy, 4, cardH, 3); ctx.fill();
      }

      // World name + author
      ctx.fillStyle    = '#eee';
      ctx.font         = 'bold 12px Courier New';
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(w.worldName, cx2 + 12, cy + cardH / 2 - 11);
      ctx.fillStyle = '#aaa'; ctx.font = '9px Courier New';
      ctx.fillText(`by ${w.playerName}`, cx2 + 12, cy + cardH / 2 + 5);
      ctx.fillStyle = '#555'; ctx.font = '8px Courier New';
      ctx.fillText(SandboxSaves.formatDate(w.savedAt), cx2 + 12, cy + cardH / 2 + 20);

      // "New Game" button (always active)
      const newGameX = cx2 + cw - 100;
      const newGameHov = this._hit(newGameX, cy + 14, 88, 36);
      ctx.fillStyle   = newGameHov ? 'rgba(76,175,80,0.9)' : 'rgba(76,175,80,0.3)';
      _roundRect(ctx, newGameX, cy + 14, 88, 36, 5); ctx.fill();
      ctx.strokeStyle = newGameHov ? '#8BC34A' : '#4CAF50'; ctx.lineWidth = 1;
      _roundRect(ctx, newGameX, cy + 14, 88, 36, 5); ctx.stroke();
      ctx.fillStyle    = '#fff';
      ctx.font         = 'bold 10px Courier New';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('New Game', newGameX + 44, cy + 32);

      // "Continue Game" button (greyed out if no save exists)
      const continueX = cx2 + cw - 212;
      const continueHov = hasProgress && this._hit(continueX, cy + 14, 104, 36);
      ctx.fillStyle   = continueHov ? 'rgba(33,150,243,0.9)' : hasProgress ? 'rgba(33,150,243,0.3)' : 'rgba(40,40,50,0.4)';
      _roundRect(ctx, continueX, cy + 14, 104, 36, 5); ctx.fill();
      ctx.strokeStyle = continueHov ? '#64B5F6' : hasProgress ? '#2196F3' : '#333344'; ctx.lineWidth = 1;
      _roundRect(ctx, continueX, cy + 14, 104, 36, 5); ctx.stroke();
      ctx.fillStyle    = hasProgress ? '#fff' : '#444466';
      ctx.font         = 'bold 10px Courier New';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Continue', continueX + 52, cy + 26);
      if (hasProgress) {
        const prog = NormalProgress.load(w.key);
        const lvl  = prog?.level ?? 1;
        ctx.fillStyle = 'rgba(100,200,255,0.8)';
        ctx.font      = '8px Courier New';
        ctx.fillText(`Lv ${lvl} saved`, continueX + 52, cy + 38);
      } else {
        ctx.fillStyle = '#333355';
        ctx.font      = '8px Courier New';
        ctx.fillText('no save', continueX + 52, cy + 38);
      }
    }

    if (worlds.length > 4) {
      ctx.fillStyle = 'rgba(100,100,120,0.5)';
      ctx.font      = '9px Courier New';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(`… and ${worlds.length - 4} more (load via Sandbox mode to see all)`,
        CANVAS_W / 2, listY + 4 * (cardH + gap) + 14);
    }

    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  // Build a colour strip preview from a saved grid (20 samples across the full width).
  _buildMiniPreview(grid) {
    const COLS = grid[0]?.length || 1;
    const SAMPLES = 60;
    const colors = [];
    for (let i = 0; i < SAMPLES; i++) {
      const col = Math.floor(i * COLS / SAMPLES);
      // Scan downward from sky to find the first surface block
      let color = '#0d0d1a';
      for (let row = 2; row < Math.min(grid.length, 22); row++) {
        const b = grid[row]?.[col] ?? 0;
        if (b !== 0 /* AIR */) { color = this._blockPreviewColor(b); break; }
      }
      colors.push(color);
    }
    return colors;
  }

  _blockPreviewColor(b) {
    // Maps block type IDs to simple display colours for the mini-preview strip.
    // Uses numeric constants from constants.js (loaded before menu.js).
    const m = {
      [BLOCK.GRASS]:               '#4CAF50',
      [BLOCK.DIRT]:                '#8B6914',
      [BLOCK.STONE]:               '#888888',
      [BLOCK.DEEPSLATE]:           '#555566',
      [BLOCK.BEDROCK]:             '#333333',
      [BLOCK.NETHERRACK]:          '#6E1A1A',
      [BLOCK.LAVA]:                '#FF6600',
      [BLOCK.SOUL_SAND]:           '#44332A',
      [BLOCK.COAL_ORE]:            '#666666',
      [BLOCK.IRON_ORE]:            '#BBAA88',
      [BLOCK.GOLD_ORE]:            '#DDCC44',
      [BLOCK.DIAMOND_ORE]:         '#44CCDD',
      [BLOCK.NETHERITE_ORE]:       '#443344',
      [BLOCK.OBSIDIAN]:            '#220033',
      [BLOCK.OAK_LOG]:             '#8B5E3C',
      [BLOCK.OAK_LEAVES]:          '#2D8B44',
      [BLOCK.OAK_PLANKS]:          '#C8A46E',
      [BLOCK.GRAVEL]:              '#888899',
      [BLOCK.CRIMSON_LOG]:         '#8B1A22',
      [BLOCK.WARPED_LOG]:          '#1A6B6B',
      [BLOCK.NETHER_PORTAL]:       '#8833CC',
      [BLOCK.NETHER_PORTAL_FRAME]: '#553388',
      [BLOCK.BED]:                 '#CC4444',
      [BLOCK.TNT]:                 '#DD2222',
      [BLOCK.LEVER]:               '#998877',
      [BLOCK.PRESSURE_PLATE]:      '#BBBBAA',
      [BLOCK.TRAPDOOR]:            '#AA8855',
      [BLOCK.GOAL]:                '#FFD700',
    };
    return m[b] ?? '#444455';
  }

  // ── Screen: Sandbox setup ─────────────────────────────────────

  _drawSandboxSetup() {
    this._drawScreenTitle('SANDBOX MODE');
    this._drawBackBtn();

    const ctx = this.ctx;
    const cx  = CANVAS_W / 2, bw = 240, bh = 52;

    const btns = [
      { y: 195, color: '#FF9800', label: '+ New World',      sub: 'Create a fresh world to build in'     },
      { y: 261, color: '#2196F3', label: '↓ Load World',     sub: 'Continue an existing saved world'     },
      { y: 327, color: '#4CAF50', label: '⬡ Template World', sub: 'Start from a pre-built starter world' },
    ];

    for (const b of btns) {
      const hov = this._hit(cx - bw/2, b.y, bw, bh);
      ctx.fillStyle   = hov ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.68)';
      _roundRect(ctx, cx - bw/2, b.y, bw, bh, 7); ctx.fill();
      ctx.strokeStyle = hov ? '#fff' : b.color; ctx.lineWidth = hov ? 2 : 1.5;
      _roundRect(ctx, cx - bw/2, b.y, bw, bh, 7); ctx.stroke();
      ctx.fillStyle = b.color;
      _roundRect(ctx, cx - bw/2, b.y, 5, bh, 3); ctx.fill();
      ctx.fillStyle    = hov ? '#fff' : '#ddd';
      ctx.font         = 'bold 14px Courier New';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.label, cx + 4, b.y + bh/2 - 9);
      ctx.fillStyle = hov ? 'rgba(220,220,220,0.8)' : 'rgba(160,160,160,0.65)';
      ctx.font      = '10px Courier New';
      ctx.fillText(b.sub, cx + 4, b.y + bh/2 + 10);
    }

    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // ── Screen: Sandbox new world ─────────────────────────────────

  _drawSandboxNew() {
    this._drawScreenTitle('NEW WORLD');
    this._drawBackBtn('← Cancel');

    const ctx = this.ctx;
    const fw  = 300, fh = 44, fx = CANVAS_W/2 - fw/2;
    const labels = ['Player Name', 'World Name'];
    const hints  = ['Your character name  (max 16 chars)', 'Your world\'s name  (max 24 chars)'];
    const ys     = [218, 288];

    for (let i = 0; i < 2; i++) {
      const y      = ys[i];
      const active = this._sbActive === i;
      ctx.fillStyle    = active ? '#7ec8e3' : '#777';
      ctx.font         = '10px Courier New';
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(labels[i], fx, y - 5);
      ctx.fillStyle   = active ? 'rgba(20,40,60,0.95)' : 'rgba(8,8,18,0.85)';
      _roundRect(ctx, fx, y, fw, fh, 5); ctx.fill();
      ctx.strokeStyle = active ? '#7ec8e3' : '#444'; ctx.lineWidth = active ? 2 : 1;
      _roundRect(ctx, fx, y, fw, fh, 5); ctx.stroke();
      const val    = this._sbFields[i];
      const cursor = active && Math.floor(this._tick / 28) % 2 === 0 ? '|' : '';
      ctx.fillStyle    = val ? '#fff' : '#444';
      ctx.font         = '13px Courier New';
      ctx.textBaseline = 'middle';
      ctx.fillText(val ? val + cursor : hints[i], fx + 12, y + fh/2);
      ctx.textBaseline = 'alphabetic';
    }

    ctx.fillStyle = 'rgba(100,100,120,0.55)';
    ctx.font      = '9px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('[Tab] switch fields  •  [Enter] create  •  [Esc] cancel', CANVAS_W/2, 346);

    const ready = this._sbFields[0].trim() && this._sbFields[1].trim();
    const cHov  = ready && this._hit(CANVAS_W/2 - 72, 360, 144, 44);
    ctx.fillStyle   = cHov ? 'rgba(76,175,80,0.85)' : ready ? 'rgba(76,175,80,0.38)' : 'rgba(40,40,40,0.5)';
    _roundRect(ctx, CANVAS_W/2 - 72, 360, 144, 44, 6); ctx.fill();
    ctx.strokeStyle = cHov ? '#8BC34A' : ready ? '#4CAF50' : '#2a2a2a'; ctx.lineWidth = 1.5;
    _roundRect(ctx, CANVAS_W/2 - 72, 360, 144, 44, 6); ctx.stroke();
    ctx.fillStyle    = ready ? '#fff' : '#444';
    ctx.font         = 'bold 13px Courier New';
    ctx.textBaseline = 'middle';
    ctx.fillText('Create World', CANVAS_W/2, 382);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign    = 'left';
  }

  // ── Screen: Sandbox template world ───────────────────────────

  _drawSandboxTemplate() {
    this._drawScreenTitle('TEMPLATE WORLD');
    this._drawBackBtn('← Cancel');

    const ctx = this.ctx;
    const fw  = 300, fh = 44, fx = CANVAS_W/2 - fw/2;
    const labels = ['Player Name', 'World Name'];
    const hints  = ['Your character name  (max 16 chars)', 'Name for this world  (max 24 chars)'];
    const ys     = [218, 288];

    // Description
    ctx.fillStyle = '#7ec8e3'; ctx.font = '9px Courier New';
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('Generates a starter world: overworld terrain, caves, nether, linked portals, and ores.',
      CANVAS_W / 2, 204);
    ctx.textAlign = 'left';

    for (let i = 0; i < 2; i++) {
      const y = ys[i], active = this._sbActive === i;
      ctx.fillStyle    = active ? '#4CAF50' : '#777';
      ctx.font         = '10px Courier New'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(labels[i], fx, y - 5);
      ctx.fillStyle   = active ? 'rgba(20,40,20,0.95)' : 'rgba(8,8,18,0.85)';
      _roundRect(ctx, fx, y, fw, fh, 5); ctx.fill();
      ctx.strokeStyle = active ? '#4CAF50' : '#444'; ctx.lineWidth = active ? 2 : 1;
      _roundRect(ctx, fx, y, fw, fh, 5); ctx.stroke();
      const val = this._sbFields[i], cursor = active && Math.floor(this._tick / 28) % 2 === 0 ? '|' : '';
      ctx.fillStyle = val ? '#fff' : '#444'; ctx.font = '13px Courier New'; ctx.textBaseline = 'middle';
      ctx.fillText(val ? val + cursor : hints[i], fx + 12, y + fh / 2);
      ctx.textBaseline = 'alphabetic';
    }

    ctx.fillStyle = 'rgba(100,100,120,0.55)'; ctx.font = '9px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('[Tab] switch fields  •  [Enter] generate  •  [Esc] cancel', CANVAS_W / 2, 346);

    const ready = this._sbFields[0].trim() && this._sbFields[1].trim();
    const cHov  = ready && this._hit(CANVAS_W/2 - 80, 360, 160, 44);
    ctx.fillStyle   = cHov ? 'rgba(76,175,80,0.85)' : ready ? 'rgba(76,175,80,0.38)' : 'rgba(40,40,40,0.5)';
    _roundRect(ctx, CANVAS_W/2 - 80, 360, 160, 44, 6); ctx.fill();
    ctx.strokeStyle = cHov ? '#8BC34A' : ready ? '#4CAF50' : '#2a2a2a'; ctx.lineWidth = 1.5;
    _roundRect(ctx, CANVAS_W/2 - 80, 360, 160, 44, 6); ctx.stroke();
    ctx.fillStyle = ready ? '#fff' : '#444'; ctx.font = 'bold 13px Courier New';
    ctx.textBaseline = 'middle';
    ctx.fillText('⬡ Generate Template', CANVAS_W / 2, 382);
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  }

  // ── Screen: Sandbox load world ────────────────────────────────

  _drawSandboxLoad() {
    this._drawScreenTitle('LOAD WORLD');
    this._drawBackBtn();

    const ctx    = this.ctx;
    const worlds = this._loadWorlds;

    if (worlds.length === 0) {
      ctx.fillStyle    = 'rgba(100,110,130,0.7)';
      ctx.font         = '13px Courier New';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No saved worlds found.', CANVAS_W/2, 230);
      ctx.font = '10px Courier New';
      ctx.fillText('Go back and create a new world first.', CANVAS_W/2, 254);
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'alphabetic';
    } else {
      const listY = 120;
      const cardH = 64, gap = 6;
      const cw = CANVAS_W - 80, cx = 40;

      for (let i = 0; i < Math.min(worlds.length, 6); i++) {
        const w  = worlds[i];
        const cy = listY + i * (cardH + gap);

        // Card background
        const hov = this._hit(cx, cy, cw, cardH);
        ctx.fillStyle   = hov ? 'rgba(255,152,0,0.06)' : 'rgba(0,0,0,0.55)';
        _roundRect(ctx, cx, cy, cw, cardH, 6); ctx.fill();
        ctx.strokeStyle = hov ? '#FF9800' : '#333'; ctx.lineWidth = 1;
        _roundRect(ctx, cx, cy, cw, cardH, 6); ctx.stroke();
        ctx.fillStyle = '#FF9800';
        _roundRect(ctx, cx, cy, 4, cardH, 3); ctx.fill();

        // World info text
        ctx.fillStyle    = '#eee';
        ctx.font         = 'bold 13px Courier New';
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${w.playerName}  —  ${w.worldName}`, cx + 16, cy + cardH/2 - 10);
        ctx.fillStyle = '#666';
        ctx.font      = '9px Courier New';
        ctx.fillText('Saved: ' + SandboxSaves.formatDate(w.savedAt), cx + 16, cy + cardH/2 + 10);

        // Play button
        const playX = cx + cw - 148;
        const playHov = this._hit(playX, cy + 14, 64, 36);
        ctx.fillStyle   = playHov ? 'rgba(76,175,80,0.9)' : 'rgba(76,175,80,0.22)';
        _roundRect(ctx, playX, cy + 14, 64, 36, 5); ctx.fill();
        ctx.strokeStyle = playHov ? '#8BC34A' : '#4CAF50'; ctx.lineWidth = 1;
        _roundRect(ctx, playX, cy + 14, 64, 36, 5); ctx.stroke();
        ctx.fillStyle    = '#fff';
        ctx.font         = 'bold 11px Courier New';
        ctx.textAlign    = 'center';
        ctx.fillText('▶ Play', playX + 32, cy + 32);

        // Delete button
        const delX = cx + cw - 76;
        const delHov = this._hit(delX, cy + 14, 64, 36);
        ctx.fillStyle   = delHov ? 'rgba(244,67,54,0.9)' : 'rgba(244,67,54,0.18)';
        _roundRect(ctx, delX, cy + 14, 64, 36, 5); ctx.fill();
        ctx.strokeStyle = delHov ? '#FF5722' : '#CC2222'; ctx.lineWidth = 1;
        _roundRect(ctx, delX, cy + 14, 64, 36, 5); ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.fillText('✕ Del', delX + 32, cy + 32);
      }

      if (worlds.length > 6) {
        ctx.fillStyle = 'rgba(100,100,120,0.5)';
        ctx.font      = '9px Courier New';
        ctx.textAlign = 'center';
        ctx.fillText(`… and ${worlds.length - 6} more  (oldest not shown)`, CANVAS_W/2, listY + 6 * (cardH + gap) + 12);
      }
    }

    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';

    // Delete confirmation overlay
    if (this._deleteConfirmKey !== null) {
      this._drawDeleteConfirm(ctx);
    }
  }

  _drawDeleteConfirm(ctx) {
    const pw = 360, ph = 160;
    const px = (CANVAS_W - pw) / 2, py = (CANVAS_H - ph) / 2;

    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    ctx.fillStyle = '#13131f';
    _roundRect(ctx, px, py, pw, ph, 8); ctx.fill();
    ctx.strokeStyle = '#CC2222'; ctx.lineWidth = 2;
    _roundRect(ctx, px, py, pw, ph, 8); ctx.stroke();

    ctx.fillStyle    = '#FF5566';
    ctx.font         = 'bold 14px Courier New';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Delete this world?', CANVAS_W/2, py + 32);
    ctx.fillStyle = '#888';
    ctx.font      = '10px Courier New';
    ctx.fillText('This action cannot be undone.', CANVAS_W/2, py + 56);

    const confirmHov = this._hit(CANVAS_W/2 - 140, py + 82, 120, 38);
    const cancelHov  = this._hit(CANVAS_W/2 + 20,  py + 82, 120, 38);

    ctx.fillStyle   = confirmHov ? 'rgba(244,67,54,0.9)' : 'rgba(244,67,54,0.28)';
    _roundRect(ctx, CANVAS_W/2 - 140, py + 82, 120, 38, 5); ctx.fill();
    ctx.strokeStyle = confirmHov ? '#FF5722' : '#882222'; ctx.lineWidth = 1.5;
    _roundRect(ctx, CANVAS_W/2 - 140, py + 82, 120, 38, 5); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px Courier New';
    ctx.fillText('Yes, Delete', CANVAS_W/2 - 80, py + 101);

    ctx.fillStyle   = cancelHov ? 'rgba(100,100,120,0.8)' : 'rgba(50,50,70,0.5)';
    _roundRect(ctx, CANVAS_W/2 + 20, py + 82, 120, 38, 5); ctx.fill();
    ctx.strokeStyle = cancelHov ? '#888' : '#444'; ctx.lineWidth = 1.5;
    _roundRect(ctx, CANVAS_W/2 + 20, py + 82, 120, 38, 5); ctx.stroke();
    ctx.fillStyle = '#ccc';
    ctx.fillText('Cancel', CANVAS_W/2 + 80, py + 101);

    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // ── Screen: Platformer select ─────────────────────────────────

  _drawPlatformerSelect() {
    this._drawScreenTitle('SELECT LEVEL');
    this._drawBackBtn();

    // Adventure World card (compact, blue accent)
    const ctx = this.ctx;
    const ac  = this._adventureCard();
    const hov = this._hit(ac.x, ac.y, ac.w, ac.h);
    ctx.fillStyle   = hov ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.65)';
    _roundRect(ctx, ac.x, ac.y, ac.w, ac.h, 8); ctx.fill();
    ctx.strokeStyle = hov ? '#FFD700' : '#2196F3'; ctx.lineWidth = hov ? 2 : 1.5;
    _roundRect(ctx, ac.x, ac.y, ac.w, ac.h, 8); ctx.stroke();
    ctx.fillStyle = '#2196F3';
    _roundRect(ctx, ac.x, ac.y, 5, ac.h, 4); ctx.fill();
    ctx.font = '22px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🌲', ac.x + 28, ac.y + ac.h / 2);
    ctx.fillStyle = hov ? '#fff' : '#ddd'; ctx.font = 'bold 13px Courier New';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('Default Adventure World', ac.x + 50, ac.y + ac.h / 2 - 10);
    ctx.fillStyle = 'rgba(150,150,150,0.65)'; ctx.font = '9px Courier New';
    ctx.fillText('Plains  →  Cave  →  Nether  |  handcrafted', ac.x + 50, ac.y + ac.h / 2 + 8);
    ctx.fillStyle = '#2196F3'; ctx.font = '9px Courier New';
    ctx.fillText('► Play Level', ac.x + 50, ac.y + ac.h / 2 + 24);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

    // Divider
    const worlds = this._platformerWorlds;
    if (worlds.length > 0) {
      ctx.fillStyle    = 'rgba(100,110,130,0.55)';
      ctx.font         = '9px Courier New';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('— or play a saved Sandbox world as a Platformer level —', CANVAS_W / 2, 188);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }

    // Sandbox world cards
    const listY = 198, cardH = 64, gap = 6;
    const cw = CANVAS_W - 80, cx2 = 40;

    if (worlds.length === 0) {
      ctx.fillStyle = 'rgba(80,90,110,0.5)';
      ctx.font      = '10px Courier New';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No saved Sandbox worlds — create one in Sandbox mode first', CANVAS_W / 2, 240);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }

    for (let i = 0; i < Math.min(worlds.length, 4); i++) {
      const w    = worlds[i];
      const cy   = listY + i * (cardH + gap);
      const hov2 = this._hit(cx2, cy, cw, cardH);
      const preview = this._platformerPreviews[w.key];

      // Card
      ctx.fillStyle   = hov2 ? 'rgba(33,150,243,0.08)' : 'rgba(0,0,0,0.55)';
      _roundRect(ctx, cx2, cy, cw, cardH, 6); ctx.fill();
      ctx.strokeStyle = hov2 ? '#2196F3' : '#333'; ctx.lineWidth = 1;
      _roundRect(ctx, cx2, cy, cw, cardH, 6); ctx.stroke();

      // Mini-preview strip
      if (preview && preview.length > 0) {
        const stripW = cw - 160, stripH = cardH - 2, stripX = cx2 + 1;
        const pxW = stripW / preview.length;
        ctx.save();
        ctx.beginPath(); _roundRect(ctx, stripX, cy + 1, stripW, stripH - 1, 5); ctx.clip();
        for (let j = 0; j < preview.length; j++) {
          ctx.fillStyle = preview[j];
          ctx.fillRect(Math.floor(stripX + j * pxW), cy + 1, Math.ceil(pxW) + 1, stripH - 1);
        }
        const grad = ctx.createLinearGradient(stripX, 0, stripX + stripW, 0);
        grad.addColorStop(0,   'rgba(0,0,0,0)');
        grad.addColorStop(0.5, 'rgba(0,0,0,0.35)');
        grad.addColorStop(1,   'rgba(0,0,0,0.75)');
        ctx.fillStyle = grad; ctx.fillRect(stripX, cy + 1, stripW, stripH - 1);
        ctx.restore();
      } else {
        ctx.fillStyle = '#1A4466';
        _roundRect(ctx, cx2, cy, 4, cardH, 3); ctx.fill();
      }

      // World name + author
      ctx.fillStyle    = '#eee';
      ctx.font         = 'bold 12px Courier New';
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(w.worldName, cx2 + 12, cy + cardH / 2 - 11);
      ctx.fillStyle = '#aaa'; ctx.font = '9px Courier New';
      ctx.fillText(`by ${w.playerName}`, cx2 + 12, cy + cardH / 2 + 5);
      ctx.fillStyle = '#555'; ctx.font = '8px Courier New';
      ctx.fillText(SandboxSaves.formatDate(w.savedAt), cx2 + 12, cy + cardH / 2 + 20);

      // Item count badge
      const eggs = SandboxSaves.eggCount(w.key);
      if (eggs > 0) {
        ctx.fillStyle = 'rgba(33,150,243,0.7)';
        _roundRect(ctx, cx2 + cw - 162, cy + 8, 74, 18, 4); ctx.fill();
        ctx.fillStyle    = '#fff';
        ctx.font         = 'bold 8px Courier New';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${eggs} mob spawn${eggs !== 1 ? 's' : ''}`, cx2 + cw - 162 + 37, cy + 17);
      }

      // Play button
      const playX   = cx2 + cw - 80;
      const playHov = this._hit(playX, cy + 14, 68, 36);
      ctx.fillStyle   = playHov ? 'rgba(33,150,243,0.9)' : 'rgba(33,150,243,0.3)';
      _roundRect(ctx, playX, cy + 14, 68, 36, 5); ctx.fill();
      ctx.strokeStyle = playHov ? '#64B5F6' : '#2196F3'; ctx.lineWidth = 1;
      _roundRect(ctx, playX, cy + 14, 68, 36, 5); ctx.stroke();
      ctx.fillStyle    = '#fff';
      ctx.font         = 'bold 11px Courier New';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('▶ Play', playX + 34, cy + 32);
    }

    if (worlds.length > 4) {
      ctx.fillStyle = 'rgba(100,100,120,0.5)';
      ctx.font      = '9px Courier New';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(`… and ${worlds.length - 4} more (load via Sandbox mode to see all)`,
        CANVAS_W / 2, listY + 4 * (cardH + gap) + 14);
    }

    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }
}

// ── Boot ─────────────────────────────────────────────────────────

window.addEventListener('load', () => {
  const canvas   = document.getElementById('gameCanvas');
  window.menu    = new MenuSystem(canvas);
  window.menu.start();
});
