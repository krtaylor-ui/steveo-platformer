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
  FLAG_AUTO_RETURN_FRAMES: 900, // 15s @60fps default (pre-launch configurable, §6)
  CAPTURE_POINTS: 50,           // brief: 50 pts / flag cap
  TOUCH_RADIUS: 30,             // px — how close to interact with a flag
  BASE_W_BLOCKS: 3,             // base zone: 3 wide × 2 high (non-solid glow)
  BASE_H_BLOCKS: 2,

  active: false,
  flags: null,     // [{ team, x, y, homeX, homeY, carriedBy, dropped, returnTimer }]
  bases: null,     // [{ team, x, y, w, h }] — centre (x,y) + zone size in px
  captures: null,  // [t0, t1] — aggregate = sum of each team's per-player captures
  _returnFrames: 900,

  // Assign a team (0/1) + colour to each player, alternating so 2P = 1v1 and
  // 4P = P1&P3 vs P2&P4 (balanced). Teammates share a shirt colour (§6).
  assignTeams(game) {
    const players = game.activePlayers();
    players.forEach((p, i) => {
      p.teamId = i % 2;
      p.teamColor = CTF_TEAM_COLORS[i % 2];
      p.ctfCaptures = 0;
      // Team shirt colour — all players on a team wear the same shirt (§6).
      p.shirtColor = p.teamColor;
    });
  },

  init(game) {
    this.active = false; this.flags = null; this.bases = null; this.captures = [0, 0];
    if (!game._arenaMode || game._arenaMode.key !== 'CAPTURE_FLAG') return;
    this.assignTeams(game);
    game.arenaState.teamScores = [0, 0];

    const bs = (typeof BLOCK_SIZE !== 'undefined') ? BLOCK_SIZE : 32;
    const W = game.level.pixelWidth, H = game.level.pixelHeight;
    const bw = this.BASE_W_BLOCKS * bs, bh = this.BASE_H_BLOCKS * bs;

    // Base centre per team: prefer designer-placed CTF Bases (game._ctfBases),
    // then the first team spawn, then map quarters. Flag home = base centre.
    const centres = [null, null];
    const placed = Array.isArray(game._ctfBases) ? game._ctfBases : [];
    for (const b of placed) { const t = b.team | 0; if (t === 0 || t === 1) if (!centres[t]) centres[t] = { x: b.x, y: b.y }; }
    game.activePlayers().forEach((p, i) => { const t = i % 2; if (!centres[t]) centres[t] = { x: p.x + (p.width || 0) / 2, y: p.y + (p.height || 0) / 2 }; });
    const floorY = (game.level.spawnY != null) ? game.level.spawnY : H / 2;
    if (!centres[0]) centres[0] = { x: bs * 3, y: floorY };
    if (!centres[1]) centres[1] = { x: W - bs * 3, y: floorY };

    this.bases = centres.map((c, t) => ({ team: t, x: c.x, y: c.y, w: bw, h: bh }));
    this.flags = centres.map((c, t) => ({
      team: t, x: c.x, y: c.y, homeX: c.x, homeY: c.y,
      carriedBy: null, dropped: false, returnTimer: 0,
    }));
    this._returnFrames = Math.max(60, Math.round(((game.arenaConfig && game.arenaConfig.flagReturnSeconds) || 15) * 60));
    this.active = true;
  },

  _home(f) { return !f.carriedBy && !f.dropped; },
  _returnFlag(f) { f.x = f.homeX; f.y = f.homeY; f.carriedBy = null; f.dropped = false; f.returnTimer = 0; },

  // Is player p standing within its own team's base zone (3×2, non-solid)?
  _inOwnBase(p) {
    if (!this.bases || p.teamId == null) return false;
    const b = this.bases[p.teamId]; if (!b) return false;
    const PW = (typeof PLAYER_W !== 'undefined') ? PLAYER_W : 20;
    const PH = (typeof PLAYER_H !== 'undefined') ? PLAYER_H : 52;
    const pcx = p.x + (p.width || PW) / 2, pcy = p.y + (p.height || PH) / 2;
    return pcx >= b.x - b.w / 2 && pcx <= b.x + b.w / 2 && pcy >= b.y - b.h / 2 && pcy <= b.y + b.h / 2;
  },

  // The flag currently carried by p (or null) — enforces one-flag-at-a-time (§6).
  carriedFlagOf(p) { return this.flags ? this.flags.find(f => f.carriedBy === p) || null : null; },
  isCarrying(p) { return !!this.carriedFlagOf(p); },

  // Downed = dead OR mid-respawn. In arena, death restores hp to maxHp instantly
  // (respawn model), so an hp>0 check alone lets a respawning player re-grab the
  // flag they just dropped and score on teleport — the reported bug. A downed
  // player cannot carry, grab, or capture; any flag they hold is dropped.
  _downed(game, p) {
    if (!p || p.hp <= 0) return true;
    const rt = game && game._respawnTimers;
    if (!rt || !game.players) return false;
    const slot = game.players.indexOf(p);
    return slot >= 0 && rt[slot] > 0;
  },

  // Drop any flag carried by p at p's position + start the return timer. Called
  // from the death handlers so a defeated carrier never respawns holding it (§6).
  onPlayerDefeated(game, p) {
    if (!this.active || !this.flags || !p) return;
    const PW = (typeof PLAYER_W !== 'undefined') ? PLAYER_W : 20;
    const PH = (typeof PLAYER_H !== 'undefined') ? PLAYER_H : 52;
    for (const f of this.flags) {
      if (f.carriedBy === p) {
        f.x = p.x + (p.width || PW) / 2; f.y = p.y + (p.height || PH) / 2;
        f.carriedBy = null; f.dropped = true; f.returnTimer = this._returnFrames;
      }
    }
  },

  // Per-player capture → team total = sum of members' captures (§2.8 / §6).
  // flagCaptures in arenaState.stats is the source of truth; team totals derive
  // from it (arena-modes.playerScore/teamScore read it for the shared team score).
  _score(game, carrier) {
    const team = carrier.teamId;
    const st = game.arenaState.stats && game.arenaState.stats[carrier._ownerId];
    if (st) st.flagCaptures = (st.flagCaptures || 0) + 1;
    carrier.ctfCaptures = (carrier.ctfCaptures || 0) + 1;
    const totals = [0, 0];
    for (const p of game.activePlayers()) {
      const ps = game.arenaState.stats && game.arenaState.stats[p && p._ownerId];
      if (p && p.teamId != null && ps) totals[p.teamId] += (ps.flagCaptures || 0);
    }
    this.captures = totals;
    game.arenaState.teamScores = totals.slice();
    if (game._notify) game._notify(`${CTF_TEAM_NAMES[team]} team captures the flag! (${totals[team]})`, CTF_TEAM_COLORS[team], 150);
  },

  update(game) {
    if (!this.active || !this.flags) return;
    const PW = (typeof PLAYER_W !== 'undefined') ? PLAYER_W : 20;
    const PH = (typeof PLAYER_H !== 'undefined') ? PLAYER_H : 52;

    // 1) Carried flags follow their carrier; drop on carrier death (backup to the
    //    death-handler hook). Dropped flags auto-return after the configured time.
    for (const f of this.flags) {
      if (f.carriedBy) {
        const c = f.carriedBy;
        if (this._downed(game, c)) {
          if (c) { f.x = c.x + (c.width || PW) / 2; f.y = c.y + (c.height || PH) / 2; }
          f.carriedBy = null; f.dropped = true; f.returnTimer = this._returnFrames;
        } else {
          f.x = c.x + (c.width || PW) / 2; f.y = c.y - 6;
        }
      } else if (f.dropped) {
        if (--f.returnTimer <= 0) this._returnFlag(f);
      }
    }

    // 2) Carrier reached their own base zone → score (enemy flag) or return
    //    (own recovered flag). No "own flag must be home" requirement (§6 fix:
    //    both flags can be out and a team can still score).
    for (const f of this.flags) {
      const c = f.carriedBy;
      if (!c || this._downed(game, c) || c.teamId == null) continue;
      if (this._inOwnBase(c)) {
        if (f.team !== c.teamId) { this._score(game, c); this._returnFlag(f); }   // enemy flag captured
        else { this._returnFlag(f); if (game._notify) game._notify(`${CTF_TEAM_NAMES[c.teamId]} flag returned`, CTF_TEAM_COLORS[c.teamId], 90); }
      }
    }

    // 3) Pickups. A player carries at most one flag (§6): skip if already carrying.
    for (const p of game.activePlayers()) {
      if (this._downed(game, p) || p.teamId == null) continue;
      if (this.isCarrying(p)) continue;
      const pcx = p.x + (p.width || PW) / 2, pcy = p.y + (p.height || PH) / 2;
      for (const f of this.flags) {
        if (f.carriedBy) continue;
        if (Math.hypot(pcx - f.x, pcy - f.y) > this.TOUCH_RADIUS) continue;
        if (f.team === p.teamId) {
          // Own flag: only grabbable when DROPPED — carry it home to return it.
          if (f.dropped) {
            f.carriedBy = p; f.dropped = false; f.returnTimer = 0;
            if (game._notify) game._notify(`P${game.activePlayers().indexOf(p) + 1} is recovering the ${CTF_TEAM_NAMES[f.team]} flag`, CTF_TEAM_COLORS[p.teamId], 100);
            break;
          }
        } else if (this._home(f) || f.dropped) {
          // Enemy flag: grab from home or where it was dropped.
          f.carriedBy = p; f.dropped = false; f.returnTimer = 0;
          if (game._notify) game._notify(`P${game.activePlayers().indexOf(p) + 1} grabbed the ${CTF_TEAM_NAMES[f.team]} flag!`, CTF_TEAM_COLORS[p.teamId], 120);
          break;
        }
      }
    }
  },

  // True once either team reaches the capture target (arena-modes reads this).
  maxCaptures() { return this.captures ? Math.max(this.captures[0], this.captures[1]) : 0; },
  leadingTeam() { if (!this.captures) return 0; return this.captures[1] > this.captures[0] ? 1 : 0; },

  draw(ctx, camera, frameCount) {
    if (!this.active || !this.flags) return;
    // Base zones (light glow, non-solid) — where a team captures / its flag rests.
    if (this.bases) {
      for (const b of this.bases) {
        const bx = b.x - b.w / 2 - camera.x, by = b.y - b.h / 2 - camera.y;
        ctx.save();
        const col = CTF_TEAM_COLORS[b.team];
        ctx.fillStyle = col + '22';
        ctx.fillRect(bx, by, b.w, b.h);
        ctx.strokeStyle = col + '99'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
        ctx.strokeRect(bx, by, b.w, b.h);
        ctx.restore();
      }
    }
    for (const f of this.flags) {
      const sx = f.x - camera.x, sy = f.y - camera.y;
      _drawCtfFlag(ctx, sx, sy, CTF_TEAM_COLORS[f.team], !!f.carriedBy, f.dropped, frameCount);
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
