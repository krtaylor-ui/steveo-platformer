// ============================================================
// combo-trainer.js — the "Combo Dojo" test gym (§Combo Trainer)
// ------------------------------------------------------------
// A throwaway practice/balancing arena launched from Sandbox. Flat ground, a dummy mob
// on the right, the player on the left, and an ON-CANVAS control panel so testing is
// fast (no menus). Lets us (and eventually players) dial in combo complexity vs damage,
// and author custom combos to test on the spot.
//
// Layout (drawn in the 800×500 backing space, screen coords = input.mouse.x/y):
//   • RIGHT panel  — mob picker + Immortal / Fights-Back / Reset (above where the mob starts)
//   • TOP-LEFT     — combo picker, the running step feedback, and a live input/button readout
//   • bottom strip — hits / combos / finishers / damage / DPS (the balance metrics)
//   • settings row — Slow-Mo, the combo timing window (min/max), weapon cycle
//   • creator      — "New Combo": build a sequence from the direction buttons and save it
//
// All rendering is defensive (null-guarded) and clicks are hit-tested against rebuilt
// rectangles, so the panel can never throw out of the game loop.
// ============================================================

class ComboTrainer {
  constructor(game) {
    this.game = game;
    this.MOBS = ['Zombie', 'Skeleton', 'Creeper', 'CaveSpider', 'Piglin', 'Blaze', 'WitherSkeleton', 'Enderman'];
    this.MOB_LABEL = { Zombie: 'Zombie', Skeleton: 'Skeleton', Creeper: 'Creeper', CaveSpider: 'Cave Spider', Piglin: 'Piglin', Blaze: 'Blaze', WitherSkeleton: 'Wither Sk.', Enderman: 'Enderman' };
    this.mobType = 'Zombie';       // default per Kevin
    this.immortal = true;
    this.fightsBack = false;       // default: passive dummy
    this.slowmo = false;
    this.allCombos = false;        // false = only the SELECTED combo is live (focused practice)
    this.timingMin = 0;            // frames between hits (min gate; 0 = none)
    this.timingMax = 45;           // frames the chain stays alive (the difficulty knob)
    this.stats = { hits: 0, combos: 0, finishers: 0, damage: 0, frames: 0 };
    this._mob = null;
    this._mobPrevHp = null;
    this._hits = [];               // clickable regions, rebuilt each draw
    this._lamp = {};               // action -> afterglow frames
    this._finishFlash = 0;
    this._creator = null;          // { seq:[], name } while authoring
    this._groundRow = (game && game._comboGroundRow) || 12;
    if (typeof COMBOS !== 'undefined' && COMBOS.loadCustom) COMBOS.loadCustom();
    const defs = this._defs();
    this.comboId = defs[0] ? defs[0].id : null;
    this.spawnMob();
  }

  _defs() { return (typeof COMBOS !== 'undefined' && COMBOS.trainerDefs) ? COMBOS.trainerDefs() : []; }
  _selectedCombo() { return this._defs().find((d) => d.id === this.comboId) || null; }
  // Which combos are LIVE for input: only the selected one (focused practice), or all if the
  // "All Combos" toggle is on (free testing). Used by game.js's combo state machine.
  activeDefs() {
    if (this.allCombos) return this._defs();
    const sel = this._selectedCombo();
    return sel ? [sel] : [];
  }

  // ── Mob ─────────────────────────────────────────────────────
  spawnMob() {
    const g = this.game;
    if (!g || !g.mobManager || !g.level) return;
    // Remove any existing trainer mobs.
    g.mobManager.mobs = (g.mobManager.mobs || []).filter((m) => !m._trainer);
    const gy = this._groundRow * BLOCK_SIZE;             // ground surface
    const mx = (g.level.width - 8) * BLOCK_SIZE;          // right side
    const mob = g.mobManager._createMob ? g.mobManager._createMob(this.mobType, mx, gy) : null;
    if (!mob) return;
    mob._trainer = true;
    mob._trainerSpawnX = mob.x;
    g.mobManager.mobs.push(mob);
    this._mob = mob;
    this._mobPrevHp = mob.hp;
  }
  resetMob() { this.stats.frames = 0; this.stats.damage = 0; this.spawnMob(); }

  // ── Per-frame (called every frame from _loop, even when slow-mo skips the sim) ──
  tickUI() {
    const g = this.game;
    if (!g || !g.input) return;
    // Don't run while a menu / overlay owns input.
    if (g.inventoryOpen || g._htmlSettingsOpen || g._worldSettingsOpen) return;
    this._readLamps();
    // Handle a click against the rebuilt hit regions; consume it so gameplay doesn't also react.
    if (g.input.mouse.clicked) {
      const mx = g.input.mouse.x, my = g.input.mouse.y;
      for (const h of this._hits) {
        if (mx >= h.x && mx <= h.x + h.w && my >= h.y && my <= h.y + h.h) {
          try { h.action(); } catch (e) { /* ignore */ }
          g.input.mouse.clicked = false;
          break;
        }
      }
    }
  }

  _readLamps() {
    const inp = this.game.input;
    const up = inp.isAimUp() || inp.isStickUp() || inp.isDown('KeyW') || inp.isDown('ArrowUp');
    const map = {
      jump: inp.isJump(), up, down: inp.isCrouch(), left: inp.isLeft(), right: inp.isRight(),
      // Melee also counts the LEFT-CLICK held state (keyboard/mouse players attack with the mouse).
      melee: inp.isMeleeAttack() || inp.mouse.down, ranged: inp.isRangedAttackDown(), sprint: inp.isRun(),
    };
    for (const k in map) { if (map[k]) this._lamp[k] = 10; else if (this._lamp[k] > 0) this._lamp[k]--; }
  }

  // ── Sim-side update (called from _update; skipped 2/3 frames while slow-mo) ──
  update() {
    const g = this.game, mob = this._mob;
    this.stats.frames++;
    if (!mob) return;
    if (!mob.alive) { this._mob = this._mobPrevHp = null; return; }
    // Measure damage dealt (hp drop) for the DPS/balance readout.
    if (this._mobPrevHp != null && mob.hp < this._mobPrevHp) this.stats.damage += (this._mobPrevHp - mob.hp);
    // Immortal: never let it die — restore to full after reading the damage delta.
    if (this.immortal) { mob.hp = mob.maxHp; }
    this._mobPrevHp = mob.hp;
    // Passive: pin the dummy in place and keep it from hitting the player.
    if (!this.fightsBack) {
      mob.vx = 0;
      mob.hitCooldown = Math.max(mob.hitCooldown || 0, 30);
      if (mob._trainerSpawnX != null) mob.x = mob._trainerSpawnX;
    }
    if (this._finishFlash > 0) this._finishFlash--;
  }

  // Combo events — game.js calls these from the hold-melee combo state machine.
  onComboStep(pre) { if (pre && (pre.status === 'progress' || pre.status === 'finish')) this.stats.hits++; }  // "hits" = directions keyed
  onComboFire(def, hit) { this.stats.combos++; if (hit) this.stats.finishers++; if (def && def.id === this.comboId) this._finishFlash = 44; }

  // ── Creator ─────────────────────────────────────────────────
  startCreator() { this._creator = { seq: [], name: 'Combo ' + ((COMBOS.customList ? COMBOS.customList.length : 0) + 1) }; }
  cancelCreator() { this._creator = null; }
  addStep(dir) { if (this._creator) this._creator.seq.push(dir); }
  undoStep() { if (this._creator && this._creator.seq.length) this._creator.seq.pop(); }
  saveCreator() {
    if (!this._creator || !this._creator.seq.length || typeof COMBOS === 'undefined') { this._creator = null; return; }
    const entry = COMBOS.addCustom({ name: this._creator.name, seq: this._creator.seq });
    this.comboId = entry.id;
    this._creator = null;
  }

  // ── Draw (screen space) ─────────────────────────────────────
  draw(ctx) {
    if (!ctx) return;
    this._hits = [];
    ctx.save();
    ctx.textBaseline = 'top';
    this._drawMobPanel(ctx);
    this._drawComboPanel(ctx);
    this._drawStats(ctx);
    if (this._creator) this._drawCreator(ctx);
    ctx.restore();
  }

  _panel(ctx, x, y, w, h, title) {
    ctx.fillStyle = 'rgba(12,14,22,0.82)';
    ctx.strokeStyle = 'rgba(140,150,200,0.5)';
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, w, h); ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    if (title) { ctx.fillStyle = '#8ea0ff'; ctx.font = 'bold 12px system-ui, sans-serif'; ctx.fillText(title, x + 8, y + 6); }
  }
  // A clickable button; registers its rect in _hits.
  _btn(ctx, x, y, w, h, label, active, action, col) {
    ctx.fillStyle = active ? (col || 'rgba(124,140,255,0.9)') : 'rgba(42,47,66,0.95)';
    ctx.strokeStyle = active ? '#cdd6ff' : '#3a4055';
    ctx.fillRect(x, y, w, h); ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    ctx.fillStyle = active ? '#fff' : '#d5d9e6';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + h / 2 - 6);
    ctx.textAlign = 'left';
    if (action) this._hits.push({ x, y, w, h, action });
  }

  _drawMobPanel(ctx) {
    const x = 596, y = 8, w = 196;
    this._panel(ctx, x, y, w, 258, 'MOB — pick & configure');
    let cy = y + 26;
    // Mob grid (2 cols × 4)
    for (let i = 0; i < this.MOBS.length; i++) {
      const t = this.MOBS[i];
      const bx = x + 8 + (i % 2) * 92, by = cy + Math.floor(i / 2) * 26;
      this._btn(ctx, bx, by, 88, 22, this.MOB_LABEL[t], this.mobType === t, () => { this.mobType = t; this.spawnMob(); });
    }
    cy += 4 * 26 + 6;
    this._btn(ctx, x + 8, cy, 88, 22, this.immortal ? 'Immortal ✓' : 'Immortal', this.immortal, () => { this.immortal = !this.immortal; }, 'rgba(90,180,120,0.9)');
    this._btn(ctx, x + 100, cy, 88, 22, this.fightsBack ? 'Fights Back' : 'Passive', this.fightsBack, () => { this.fightsBack = !this.fightsBack; }, 'rgba(200,110,90,0.9)');
    cy += 28;
    this._btn(ctx, x + 8, cy, 180, 22, '↺ Reset Mob', false, () => this.resetMob());
    cy += 28;
    // Mob HP bar
    const mob = this._mob;
    ctx.fillStyle = '#aab'; ctx.font = '10px system-ui, sans-serif';
    if (mob && mob.alive) {
      const frac = Math.max(0, Math.min(1, mob.hp / (mob.maxHp || 1)));
      ctx.fillText(`HP ${Math.ceil(mob.hp)}/${mob.maxHp}`, x + 8, cy);
      ctx.fillStyle = '#333'; ctx.fillRect(x + 8, cy + 12, 180, 8);
      ctx.fillStyle = '#5ac878'; ctx.fillRect(x + 8, cy + 12, 180 * frac, 8);
    } else {
      ctx.fillText('Defeated — Reset to respawn', x + 8, cy);
    }
  }

  _drawComboPanel(ctx) {
    const x = 8, y = 8, w = 380;
    this._panel(ctx, x, y, w, 208, 'COMBO — pick, then HOLD melee + key the directions');
    // Combo picker (rows)
    const defs = this._defs();
    let cy = y + 26;
    for (let i = 0; i < defs.length && i < 5; i++) {
      const d = defs[i];
      this._btn(ctx, x + 8, cy, 240, 22, d.name + (d.custom ? ' ✎' : ''), this.comboId === d.id, () => { this.comboId = d.id; });
      if (d.custom) this._btn(ctx, x + 252, cy, 24, 22, '✕', false, () => { COMBOS.removeCustom(d.id); if (this.comboId === d.id) this.comboId = (this._defs()[0] || {}).id; }, 'rgba(200,90,90,0.9)');
      cy += 26;
    }
    this._btn(ctx, x + 284, y + 26, 88, 22, '＋ New Combo', !!this._creator, () => this.startCreator(), 'rgba(120,160,220,0.9)');
    // Only the selected combo is live by default (focused practice); toggle to test them all.
    this._btn(ctx, x + 284, y + 52, 88, 22, this.allCombos ? 'All Combos ✓' : 'Selected Only', this.allCombos, () => { this.allCombos = !this.allCombos; }, 'rgba(150,120,200,0.9)');

    // Step feedback for the selected combo.
    const combo = this._selectedCombo();
    cy = y + 26 + 5 * 26 + 2;
    ctx.fillStyle = '#8ea0ff'; ctx.font = 'bold 11px system-ui, sans-serif'; ctx.fillText('Sequence', x + 8, cy);
    if (combo) {
      const seq = combo.seq;
      const prog = this._progressLen(combo);
      const gly = { forward: '→', back: '←', up: '↑', down: '↓', neutral: '·' };
      for (let i = 0; i < seq.length; i++) {
        const sx = x + 8 + i * 34, sy = cy + 16;
        const done = this._finishFlash > 0 ? true : (i < prog);   // stay lit through the finish flash
        ctx.fillStyle = this._finishFlash > 0 ? '#ffd24a' : (done ? 'rgba(124,220,140,0.95)' : 'rgba(42,47,66,0.95)');
        ctx.strokeStyle = done ? '#cdffcf' : '#3a4055';
        ctx.fillRect(sx, sy, 28, 28); ctx.strokeRect(sx + 0.5, sy + 0.5, 28, 28);
        ctx.fillStyle = done ? '#0a2a12' : '#d5d9e6'; ctx.font = 'bold 18px system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(gly[seq[i]] || '?', sx + 14, sy + 5); ctx.textAlign = 'left';
      }
    }

    // Live input readout (what's registering) — the coaching row.
    this._drawInputLamps(ctx, x + 8, cy + 54);

    // Settings row: slow-mo, timing window, weapon cycle.
    const sy2 = cy + 108;
    this._btn(ctx, x + 8, sy2, 78, 22, this.slowmo ? 'Slow-Mo ✓' : 'Slow-Mo', this.slowmo, () => { this.slowmo = !this.slowmo; });
    ctx.fillStyle = '#aab'; ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(`Window ${this.timingMin}-${this.timingMax}f`, x + 92, sy2 + 6);
    this._btn(ctx, x + 176, sy2, 20, 22, '−', false, () => { this.timingMax = Math.max(this.timingMin + 5, this.timingMax - 5); this._applyTiming(); });
    this._btn(ctx, x + 198, sy2, 20, 22, '+', false, () => { this.timingMax = Math.min(120, this.timingMax + 5); this._applyTiming(); });
    this._btn(ctx, x + 226, sy2, 66, 22, 'Melee ⟳', false, () => this.game._cycleSelectedWeaponMelee && this.game._cycleSelectedWeaponMelee());
    this._btn(ctx, x + 296, sy2, 74, 22, 'Ranged ⟳', false, () => this.game._cycleSelectedWeaponRanged && this.game._cycleSelectedWeaponRanged());
  }

  _applyTiming() { /* timingMax feeds the continue-window in game.js via _comboWindow() */ }

  // How many leading steps of `combo` the running landed sequence currently matches.
  _progressLen(combo) {
    const seq = (this.game.player && this.game.player._comboSeq) || [];
    let n = 0;
    for (let i = 0; i < seq.length && i < combo.seq.length; i++) { if (seq[i] === combo.seq[i]) n++; else break; }
    return n;
  }

  _drawInputLamps(ctx, x, y) {
    const lamps = [
      ['left', '←'], ['right', '→'], ['up', '↑'], ['down', '↓'],
      ['jump', 'JMP'], ['melee', 'ATK'], ['ranged', 'RNG'], ['sprint', 'SPR'],
    ];
    ctx.fillStyle = '#8ea0ff'; ctx.font = 'bold 11px system-ui, sans-serif'; ctx.fillText('Inputs registering', x, y - 14);
    for (let i = 0; i < lamps.length; i++) {
      const [k, lbl] = lamps[i];
      const bx = x + i * 44, on = (this._lamp[k] || 0) > 0;
      ctx.fillStyle = on ? 'rgba(124,220,140,0.95)' : 'rgba(42,47,66,0.9)';
      ctx.strokeStyle = on ? '#cdffcf' : '#3a4055';
      ctx.fillRect(bx, y, 40, 26); ctx.strokeRect(bx + 0.5, y + 0.5, 40, 26);
      ctx.fillStyle = on ? '#0a2a12' : '#aab'; ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(lbl, bx + 20, y + 7); ctx.textAlign = 'left';
    }
  }

  _drawStats(ctx) {
    const x = 8, y = 452, w = 500, h = 40;
    this._panel(ctx, x, y, w, h, null);
    const s = this.stats, secs = Math.max(0.001, s.frames / 60);
    const dps = (s.damage / secs).toFixed(1);
    ctx.fillStyle = '#d5d9e6'; ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText(`Steps ${s.hits}    Combos ${s.combos}    Landed ${s.finishers}    Damage ${Math.round(s.damage)}    DPS ${dps}`, x + 10, y + 8);
    ctx.fillStyle = '#8a90a6'; ctx.font = '10px system-ui, sans-serif';
    ctx.fillText('HOLD melee (facing locks), then key the direction sequence (e.g. ↓ ↑). Green steps = matched; the special fires automatically.', x + 10, y + 24);
  }

  _drawCreator(ctx) {
    const w = 360, h = 190, x = (800 - w) / 2, y = (500 - h) / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, 800, 500);
    this._panel(ctx, x, y, w, h, 'NEW COMBO — build a sequence, then Save');
    const seq = this._creator.seq;
    const gly = { forward: '→', back: '←', up: '↑', down: '↓' };
    ctx.fillStyle = '#d5d9e6'; ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillText(seq.length ? seq.map((d) => gly[d]).join('  ') : '(empty — add steps below)', x + 12, y + 30);
    // Direction adders
    const dirs = [['forward', '→ Forward'], ['back', '← Back'], ['up', '↑ Up'], ['down', '↓ Down']];
    for (let i = 0; i < dirs.length; i++) this._btn(ctx, x + 12 + i * 84, y + 62, 80, 26, dirs[i][1], false, () => this.addStep(dirs[i][0]));
    this._btn(ctx, x + 12, y + 100, 100, 26, '⌫ Undo Step', false, () => this.undoStep());
    this._btn(ctx, x + 120, y + 100, 100, 26, 'Clear', false, () => { this._creator.seq = []; });
    this._btn(ctx, x + 12, y + 140, 160, 30, '✓ Save Combo', seq.length > 0, () => this.saveCreator(), 'rgba(90,180,120,0.95)');
    this._btn(ctx, x + 188, y + 140, 160, 30, '✕ Cancel', false, () => this.cancelCreator(), 'rgba(200,90,90,0.9)');
  }
}

if (typeof window !== 'undefined') window.ComboTrainer = ComboTrainer;
if (typeof module !== 'undefined' && module.exports) module.exports = { ComboTrainer };
