// ============================================================
// ctf-system.js — Capture the Flag runtime (Phase 3C)
// ------------------------------------------------------------
// Two teams, two flags. Grab the enemy flag and carry it to your own flag base
// (while your flag is home) to score a capture (CAPTURE_POINTS). Dropped flags
// auto-return after FLAG_AUTO_RETURN_FRAMES, or instantly when a teammate touches
// them. Team assignment + PvP friendly-fire are handled in game.js / mobs.js.
//
// Hooked from Game like the other arena systems:
//   _setupArena  → CTF_SYSTEM.init(game)      (only when mode === CAPTURE_FLAG)
//   arena update → CTF_SYSTEM.update(game)
//   world overlay→ CTF_SYSTEM.draw(ctx, camera, frameCount)
// Team scores live on game.arenaState.teamScores = [t0, t1]; arena-modes.js reads
// them for win/score/HUD/winner.
// ============================================================

const CTF_TEAM_COLORS = ['#e74c3c', '#3498db']; // Team 1 red, Team 2 blue
const CTF_TEAM_NAMES  = ['Red', 'Blue'];

const CTF_SYSTEM = {
  FLAG_AUTO_RETURN_FRAMES: 900, // 15s @60fps (brief: FLAG_AUTO_RETURN = 15s)
  CAPTURE_POINTS: 50,           // brief: 50 pts / flag cap
  TOUCH_RADIUS: 30,             // px — how close to interact with a flag

  active: false,
  flags: null,     // [{ team, x, y, homeX, homeY, carriedBy, dropped, returnTimer }]
  captures: null,  // [t0, t1]

  // Assign a team (0/1) + colour to each player, alternating so 2P = 1v1 and
  // 4P = P1&P3 vs P2&P4 (balanced). Returns nothing; mutates players.
  assignTeams(game) {
    const players = game.activePlayers();
    players.forEach((p, i) => { p.teamId = i % 2; p.teamColor = CTF_TEAM_COLORS[i % 2]; });
  },

  init(game) {
    this.active = false; this.flags = null; this.captures = [0, 0];
    if (!game._arenaMode || game._arenaMode.key !== 'CAPTURE_FLAG') return;
    this.assignTeams(game);
    game.arenaState.teamScores = [0, 0];

    // Flag home = first spawning player's start on each team, else map quarters.
    const bs = (typeof BLOCK_SIZE !== 'undefined') ? BLOCK_SIZE : 32;
    const W = game.level.pixelWidth, H = game.level.pixelHeight;
    const bases = [null, null];
    game.activePlayers().forEach((p, i) => { const t = i % 2; if (!bases[t]) bases[t] = { x: p.x, y: p.y }; });
    const floorY = (game.level.spawnY != null) ? game.level.spawnY : H / 2;
    if (!bases[0]) bases[0] = { x: bs * 3, y: floorY };
    if (!bases[1]) bases[1] = { x: W - bs * 3, y: floorY };

    this.flags = bases.map((b, t) => ({
      team: t, x: b.x, y: b.y, homeX: b.x, homeY: b.y,
      carriedBy: null, dropped: false, returnTimer: 0,
    }));
    this.active = true;
  },

  _home(f) { return !f.carriedBy && !f.dropped; },
  _returnFlag(f) { f.x = f.homeX; f.y = f.homeY; f.carriedBy = null; f.dropped = false; f.returnTimer = 0; },

  _score(game, team) {
    this.captures[team]++;
    game.arenaState.teamScores = this.captures.slice();
    if (game._notify) game._notify(`${CTF_TEAM_NAMES[team]} team captures the flag! (${this.captures[team]})`, CTF_TEAM_COLORS[team], 150);
  },

  update(game) {
    if (!this.active || !this.flags) return;
    const PW = (typeof PLAYER_W !== 'undefined') ? PLAYER_W : 20;
    const PH = (typeof PLAYER_H !== 'undefined') ? PLAYER_H : 52;

    // 1) Carried flags follow their carrier; drop on carrier death.
    for (const f of this.flags) {
      if (f.carriedBy) {
        const c = f.carriedBy;
        if (!c || c.hp <= 0) {
          if (c) { f.x = c.x + (c.width || PW) / 2; f.y = c.y + (c.height || PH) / 2; }
          f.carriedBy = null; f.dropped = true; f.returnTimer = this.FLAG_AUTO_RETURN_FRAMES;
        } else {
          f.x = c.x + (c.width || PW) / 2; f.y = c.y - 6;
        }
      } else if (f.dropped) {
        if (--f.returnTimer <= 0) this._returnFlag(f);
      }
    }

    // 2) Player ↔ flag interactions.
    for (const p of game.activePlayers()) {
      if (!p || p.hp <= 0 || p.teamId == null) continue;
      const pcx = p.x + (p.width || PW) / 2, pcy = p.y + (p.height || PH) / 2;
      for (const f of this.flags) {
        if (Math.hypot(pcx - f.x, pcy - f.y) > this.TOUCH_RADIUS) continue;
        if (f.team === p.teamId) {
          // Own flag: recover it if dropped; if it's home, complete a capture.
          if (f.dropped) { this._returnFlag(f); if (game._notify) game._notify(`${CTF_TEAM_NAMES[p.teamId]} flag returned`, f === this.flags[p.teamId] ? CTF_TEAM_COLORS[p.teamId] : '#fff', 90); }
          else if (this._home(f)) {
            const enemyFlag = this.flags.find(ff => ff.team !== p.teamId && ff.carriedBy === p);
            if (enemyFlag) { this._score(game, p.teamId); this._returnFlag(enemyFlag); }
          }
        } else {
          // Enemy flag: grab it if it's available (at home or dropped) and unheld.
          if (!f.carriedBy && (this._home(f) || f.dropped)) {
            f.carriedBy = p; f.dropped = false; f.returnTimer = 0;
            if (game._notify) game._notify(`P${game.activePlayers().indexOf(p) + 1} grabbed the ${CTF_TEAM_NAMES[f.team]} flag!`, CTF_TEAM_COLORS[p.teamId], 120);
          }
        }
      }
    }
  },

  // True once either team reaches the capture target (arena-modes reads this).
  maxCaptures() { return this.captures ? Math.max(this.captures[0], this.captures[1]) : 0; },
  leadingTeam() { if (!this.captures) return 0; return this.captures[1] > this.captures[0] ? 1 : 0; },

  draw(ctx, camera, frameCount) {
    if (!this.active || !this.flags) return;
    for (const f of this.flags) {
      const sx = f.x - camera.x, sy = f.y - camera.y;
      _drawCtfFlag(ctx, sx, sy, CTF_TEAM_COLORS[f.team], !!f.carriedBy, f.dropped, frameCount);
      // Home-base ring (faint) so players see where to return/capture.
      if (!this._home(f)) {
        const hx = f.homeX - camera.x, hy = f.homeY - camera.y;
        ctx.save();
        ctx.strokeStyle = CTF_TEAM_COLORS[f.team] + '66'; ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.arc(hx, hy, 16, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }
  },
};

// A little pennant on a pole. Waves while at base, greyed dashes while dropped.
function _drawCtfFlag(ctx, sx, sy, color, carried, dropped, frameCount) {
  ctx.save();
  ctx.translate(sx, sy);
  const wave = Math.sin((frameCount || 0) * 0.12) * 2;
  // Pole
  ctx.strokeStyle = '#2b2b3a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 16); ctx.lineTo(0, -18); ctx.stroke();
  // Pennant
  ctx.fillStyle = dropped ? '#888' : color;
  ctx.globalAlpha = dropped ? 0.6 : 1;
  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.lineTo(16 + wave, -13);
  ctx.lineTo(2, -6);
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
  if (carried) { // little glow when being carried
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, -4, 13, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

if (typeof window !== 'undefined') { window.CTF_SYSTEM = CTF_SYSTEM; window.CTF_TEAM_COLORS = CTF_TEAM_COLORS; window.CTF_TEAM_NAMES = CTF_TEAM_NAMES; }
