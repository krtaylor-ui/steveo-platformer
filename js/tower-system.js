// ============================================================
// tower-system.js — Defend the Tower (Phase 3 v3 §7)
// ------------------------------------------------------------
// Each player has a Tower (4 blocks high). Attack the enemy Tower (all weapons
// deal equal damage) while defending your own; block incoming hits by crouching
// with a shield. The match ends the moment ANY Tower is destroyed — the
// destroyer wins (sole win condition). Tower HP (3/6/9/12) is a pre-launch
// setting; three visual damage bands (undamaged / lightly / heavily) span thirds
// of the HP range. Heal Tower pickups restore one band up (or to full when
// already in the top band).
//
// Hooked from Game like the other arena systems:
//   _setupArena           → TOWER_SYSTEM.init(game)   (mode === DEFEND_TOWER)
//   _updateArenaCollectibles → TOWER_SYSTEM.update(game)
//   world overlay         → TOWER_SYSTEM.draw(ctx, camera, frameCount)
// arena-modes.js reads isOver()/winner for win/score/HUD/winner.
// ============================================================

const TOWER_SYSTEM = {
  active: false,
  towers: null,     // [{ ownerId, x, y, w, h, maxHp, hp, _hitBy }]
  heals: null,      // [{ x, y, taken, respawn }]
  maxHp: 9,
  _winner: null,
  DMG_COOLDOWN: 20, // frames between melee hits from the same attacker
  HEAL_RESPAWN: 1200, // 20s @60fps before a used heal pickup returns
  HEAL_RADIUS: 26,

  init(game) {
    this.active = false; this.towers = null; this.heals = null; this._winner = null;
    if (!game._arenaMode || game._arenaMode.key !== 'DEFEND_TOWER') return;
    const bs = (typeof BLOCK_SIZE !== 'undefined') ? BLOCK_SIZE : 32;
    const hp = (game.arenaConfig && game.arenaConfig.towerHp) | 0;
    this.maxHp = [3, 6, 9, 12].includes(hp) ? hp : 9;

    const players = game.activePlayers();
    const w = bs, h = bs * 4;
    // One Tower per player, standing on the player's spawn ground.
    this.towers = players.map((p, i) => {
      const cx = p.x + (p.width || 0) / 2;
      const groundY = p.y + (p.height || (bs * 1.6));
      return {
        ownerId: p._ownerId || ('p' + (i + 1)),
        x: cx - w / 2, y: groundY - h, w, h,
        maxHp: this.maxHp, hp: this.maxHp, _hitBy: {},
      };
    });

    // A few Heal Tower pickups spread across the arena (deterministic layout).
    const W = game.level.pixelWidth;
    const floorY = (game.level.spawnY != null) ? game.level.spawnY : game.level.pixelHeight / 2;
    this.heals = [0.35, 0.5, 0.65].map(fx => ({ x: W * fx, y: floorY - bs, taken: false, respawn: 0 }));
    this.active = true;
  },

  // Band: 0 = undamaged (top third), 1 = lightly (middle), 2 = heavily (bottom).
  _band(t) {
    const third = t.maxHp / 3;
    if (t.hp > 2 * third) return 0;
    if (t.hp > third)     return 1;
    return 2;
  },
  bandName(t) { return ['Undamaged', 'Lightly Damaged', 'Heavily Damaged'][this._band(t)]; },

  _damage(game, t, amount, attackerId) {
    if (!t || t.hp <= 0) return;
    const dealt = Math.min(amount, t.hp);
    t.hp = Math.max(0, t.hp - amount);
    // Individual stats: damage dealt, and a destroyed-tower count on the kill.
    const st = attackerId && game.arenaState.stats && game.arenaState.stats[attackerId];
    if (st) st.towerDamage = (st.towerDamage || 0) + dealt;
    if (t.hp <= 0) {
      if (st) st.towersDestroyed = (st.towersDestroyed || 0) + 1;
      this._winner = attackerId || null;   // destroyer (win handled by the rules engine)
      if (game._notify) game._notify(`${(attackerId || '?').toUpperCase()} destroyed a Tower!`, '#ff5a5a', 220);
    }
  },

  // Heal per band (§7): heavily → bottom of lightly; lightly → bottom of
  // undamaged; already-undamaged (even if not full) → straight to full max.
  healTower(t) {
    if (!t) return;
    const third = t.maxHp / 3;
    const band = this._band(t);
    if (band === 2)      t.hp = Math.floor(third) + 1;       // → bottom of lightly
    else if (band === 1) t.hp = Math.floor(2 * third) + 1;   // → bottom of undamaged
    else                 t.hp = t.maxHp;                     // top band → full
    t.hp = Math.min(t.maxHp, Math.max(1, t.hp));
  },

  isOver() { return this.active && this.towers && this.towers.some(t => t.hp <= 0); },
  winner() { return this._winner; },

  update(game) {
    if (!this.active || !this.towers) return;
    const PW = (typeof PLAYER_W !== 'undefined') ? PLAYER_W : 20;
    const PH = (typeof PLAYER_H !== 'undefined') ? PLAYER_H : 52;

    // 1) Player arrows hitting an enemy Tower (all weapons deal equal damage).
    const arrows = (game.mobManager && game.mobManager.playerArrows) || [];
    for (const a of arrows) {
      if (!a.alive) continue;
      for (const t of this.towers) {
        if (t.hp <= 0 || a.owner === t.ownerId) continue;
        if (a.x >= t.x && a.x <= t.x + t.w && a.y >= t.y && a.y <= t.y + t.h) {
          a.alive = false; this._damage(game, t, 1, a.owner); break;
        }
      }
    }

    // 2) Melee: an attacking player adjacent to an enemy Tower (one hit / swing,
    //    debounced per attacker so a single swing lands once).
    for (const p of game.activePlayers()) {
      if (!p || p.hp <= 0 || !(p.swingTimer > 0)) continue;
      const oid = p._ownerId;
      const pcx = p.x + (p.width || PW) / 2, pcy = p.y + (p.height || PH) / 2;
      for (const t of this.towers) {
        if (t.hp <= 0 || oid === t.ownerId) continue;
        const nx = Math.max(t.x, Math.min(pcx, t.x + t.w));
        const ny = Math.max(t.y, Math.min(pcy, t.y + t.h));
        if (Math.hypot(pcx - nx, pcy - ny) <= 42) {
          const last = t._hitBy[oid] || -999;
          if ((game.frameCount - last) >= this.DMG_COOLDOWN) { t._hitBy[oid] = game.frameCount; this._damage(game, t, 1, oid); }
          break;
        }
      }
    }

    // 3) Heal Tower pickups — heal the picking player's OWN tower.
    for (const hpk of this.heals) {
      if (hpk.taken) { if (--hpk.respawn <= 0) hpk.taken = false; continue; }
      for (const p of game.activePlayers()) {
        if (!p || p.hp <= 0) continue;
        const pcx = p.x + (p.width || PW) / 2, pcy = p.y + (p.height || PH) / 2;
        if (Math.hypot(pcx - hpk.x, pcy - hpk.y) > this.HEAL_RADIUS) continue;
        const own = this.towers.find(t => t.ownerId === p._ownerId && t.hp > 0);
        if (own && own.hp < own.maxHp) {
          this.healTower(own);
          hpk.taken = true; hpk.respawn = this.HEAL_RESPAWN;
          if (game._notify) game._notify(`${(p._ownerId || 'P').toUpperCase()} Tower repaired (${this.bandName(own)})`, '#5aff7a', 120);
          break;
        }
      }
    }
  },

  // HUD objective line: each tower's owner + band bars.
  hudText() {
    if (!this.towers) return '';
    return this.towers.map(t => {
      const band = this._band(t);
      const bars = ['▮▮▮', '▮▮', '▮'][band] + (t.hp <= 0 ? ' ✗' : '');
      return `${t.ownerId.toUpperCase()} ${bars}`;
    }).join('   ');
  },

  draw(ctx, camera, frameCount) {
    if (!this.active || !this.towers) return;
    // Heal pickups (green cross).
    if (this.heals) {
      for (const hpk of this.heals) {
        if (hpk.taken) continue;
        const sx = hpk.x - camera.x, sy = hpk.y - camera.y;
        const bob = Math.sin((frameCount || 0) * 0.08) * 2;
        ctx.save();
        ctx.fillStyle = 'rgba(40,220,90,0.9)';
        ctx.fillRect(sx - 3, sy - 9 + bob, 6, 18);
        ctx.fillRect(sx - 9, sy - 3 + bob, 18, 6);
        ctx.strokeStyle = '#0a3'; ctx.lineWidth = 1;
        ctx.strokeRect(sx - 3, sy - 9 + bob, 6, 18);
        ctx.strokeRect(sx - 9, sy - 3 + bob, 18, 6);
        ctx.restore();
      }
    }
    // Towers with damage-state look.
    for (const t of this.towers) {
      _drawTower(ctx, t.x - camera.x, t.y - camera.y, t.w, t.h, t.hp, t.maxHp, this._band(t), t.ownerId);
    }
  },
};

// A 4-tall stone tower, cracked more as its band worsens; a small owner banner
// and an HP pip row on top. band: 0 undamaged, 1 lightly, 2 heavily.
function _drawTower(ctx, x, y, w, h, hp, maxHp, band, ownerId) {
  ctx.save();
  const ownerCols = { p1: '#42a0ff', p2: '#ff5a5a', p3: '#5aff7a', p4: '#f5d142' };
  const oc = ownerCols[ownerId] || '#cccccc';
  if (hp <= 0) {
    // Rubble
    ctx.fillStyle = '#5a5148';
    ctx.fillRect(x - 2, y + h - 10, w + 4, 10);
    ctx.fillStyle = '#3d372f';
    ctx.fillRect(x + 2, y + h - 6, w - 6, 6);
    ctx.restore();
    return;
  }
  // Body — tint darker as damage worsens.
  const bodyCols = ['#9a9488', '#8a8175', '#756c60'];
  ctx.fillStyle = bodyCols[band] || bodyCols[0];
  ctx.fillRect(x, y, w, h);
  // Brick lines
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
  for (let r = 0; r <= 4; r++) { const ly = y + (h / 4) * r; ctx.beginPath(); ctx.moveTo(x, ly); ctx.lineTo(x + w, ly); ctx.stroke(); }
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  // Battlement top
  ctx.fillStyle = bodyCols[band] || bodyCols[0];
  ctx.fillRect(x - 2, y - 4, 4, 6); ctx.fillRect(x + w / 2 - 2, y - 4, 4, 6); ctx.fillRect(x + w - 2, y - 4, 4, 6);
  // Cracks for lightly / heavily
  if (band >= 1) {
    ctx.strokeStyle = 'rgba(20,15,10,0.7)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x + w * 0.3, y + h * 0.2); ctx.lineTo(x + w * 0.6, y + h * 0.5); ctx.stroke();
  }
  if (band >= 2) {
    ctx.strokeStyle = 'rgba(20,15,10,0.85)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + w * 0.7, y + h * 0.15); ctx.lineTo(x + w * 0.35, y + h * 0.6); ctx.lineTo(x + w * 0.55, y + h * 0.85); ctx.stroke();
  }
  // Owner banner
  ctx.fillStyle = oc;
  ctx.fillRect(x + w / 2 - 5, y + 4, 10, 12);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(x + w / 2 - 5, y + 4, 10, 12);
  // HP pips above the tower
  const pipY = y - 10;
  for (let i = 0; i < maxHp; i++) {
    ctx.fillStyle = i < hp ? '#33dd55' : 'rgba(60,20,20,0.7)';
    ctx.fillRect(x - (maxHp * 3) / 2 + w / 2 + i * 3, pipY, 2, 4);
  }
  ctx.restore();
}

if (typeof window !== 'undefined') window.TOWER_SYSTEM = TOWER_SYSTEM;
