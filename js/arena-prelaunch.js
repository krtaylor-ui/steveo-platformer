// ============================================================
// arena-prelaunch.js — Arena pre-launch settings modal (Phase 3A.3)
// ------------------------------------------------------------
// Shown after a game type is chosen (from the arena picker). Collects common
// settings (match length, player health) + game-type-specific settings
// (emerald rounds, mob difficulty, initial wave size) and calls onStart(config),
// where config maps onto the fields Game reads via arenaConfig:
//   gameDuration (ms), playerHealthHp, emeraldRounds, mobDifficulty, initialMobCount
// Team mode / 2× speed / 3–8 players are reserved (greyed) for later phases.
// ============================================================

const ARENA_PRELAUNCH = {
  _wired: false,
  _onStart: null,
  _mode: null,

  show(modeKey, onStart) {
    const modal = document.getElementById('arena-prelaunch-modal');
    if (!modal) { onStart({}); return; } // graceful fallback if markup missing
    this._mode = modeKey;
    this._onStart = onStart;

    const title = document.getElementById('prelaunch-title');
    const label = (typeof ARENA_MODES !== 'undefined' && ARENA_MODES.label) ? ARENA_MODES.label(modeKey) : 'Arena';
    if (title) title.textContent = `${label} — Settings`;

    // Per-type sections
    this._toggle('pl-emerald-rounds-group', modeKey === 'COLLECT_EMERALDS');
    this._toggle('pl-mob-difficulty-group', modeKey === 'MOB_HUNTER' || modeKey === 'COLLECT_EMERALDS');
    this._toggle('pl-waves-group',          modeKey === 'SURVIVAL_WAVES');
    this._toggle('pl-killtarget-group',     modeKey === 'DEATHMATCH');
    this._toggle('pl-koth-scoring-group',   modeKey === 'KING_OF_HILL');
    this._toggle('pl-capture-target-group', modeKey === 'CAPTURE_FLAG');

    // Friendly Fire — forced on + locked for Deathmatch; optional elsewhere.
    const ff = document.getElementById('pl-friendly-fire');
    const ffNote = document.getElementById('pl-friendly-fire-note');
    if (ff) {
      if (modeKey === 'DEATHMATCH') { ff.checked = true; ff.disabled = true;
        if (ffNote) ffNote.textContent = 'Always on for Deathmatch.'; }
      else if (modeKey === 'CAPTURE_FLAG') { ff.checked = true; ff.disabled = true;
        if (ffNote) ffNote.textContent = 'On for CTF — but teammates never damage each other.'; }
      else if (modeKey === 'KING_OF_HILL') { ff.disabled = false; ff.checked = true;
        if (ffNote) ffNote.textContent = 'On by default — fight for the hill. Uncheck for a no-combat race.'; }
      else { ff.disabled = false; ff.checked = false;
        if (ffNote) ffNote.textContent = 'Players can damage each other.'; }
    }

    this._wire();
    modal.style.display = 'flex';
  },

  _toggle(id, on) { const el = document.getElementById(id); if (el) el.style.display = on ? 'block' : 'none'; },

  _wire() {
    if (this._wired) return;
    this._wired = true;
    const rounds = document.getElementById('pl-emerald-rounds');
    rounds?.addEventListener('input', (e) => { const v = document.getElementById('pl-rounds-val'); if (v) v.textContent = e.target.value; });
    const waves = document.getElementById('pl-waves');
    waves?.addEventListener('input', (e) => { const v = document.getElementById('pl-waves-val'); if (v) v.textContent = e.target.value; });
    const kt = document.getElementById('pl-killtarget');
    kt?.addEventListener('input', (e) => { const v = document.getElementById('pl-killtarget-val'); if (v) v.textContent = e.target.value; });
    const ct = document.getElementById('pl-capture-target');
    ct?.addEventListener('input', (e) => { const v = document.getElementById('pl-capture-target-val'); if (v) v.textContent = e.target.value; });
    document.getElementById('pl-cancel-btn')?.addEventListener('click', () => this.hide());
    document.getElementById('pl-start-btn')?.addEventListener('click', () => this._start());
  },

  _start() {
    const num = (id, dflt) => { const el = document.getElementById(id); const n = el ? parseInt(el.value, 10) : NaN; return Number.isFinite(n) ? n : dflt; };
    const val = (id, dflt) => { const el = document.getElementById(id); return el ? el.value : dflt; };

    const chk = (id) => { const el = document.getElementById(id); return !!(el && el.checked); };
    const cfg = {
      gameDuration:  num('pl-match-length', 300) * 1000,
      playerCount:   Math.max(1, Math.min(4, num('pl-player-count', 1))), // Phase 3B: 1-4 local
      playerHealthHp: num('pl-player-health', 6),
      disableMobDrops: chk('pl-disable-drops'), // all modes; default off
      friendlyFire:  chk('pl-friendly-fire'),   // Phase 3B PvP gate
    };
    if (this._mode === 'COLLECT_EMERALDS') {
      cfg.emeraldRounds = num('pl-emerald-rounds', 3);
      cfg.mobDifficulty = val('pl-mob-difficulty', 'MEDIUM');
    } else if (this._mode === 'MOB_HUNTER') {
      cfg.mobDifficulty = val('pl-mob-difficulty', 'MEDIUM');
    } else if (this._mode === 'SURVIVAL_WAVES') {
      cfg.survivalWaveCount = num('pl-waves', 5);
    } else if (this._mode === 'KING_OF_HILL') {
      cfg.kothScoring = val('pl-koth-scoring', 'STICKY');
    } else if (this._mode === 'DEATHMATCH') {
      cfg.killTarget = num('pl-killtarget', 10);
      cfg.friendlyFire = true; // Deathmatch always PvP
    } else if (this._mode === 'CAPTURE_FLAG') {
      cfg.captureTarget = num('pl-capture-target', 3);
      cfg.friendlyFire = true; // CTF is PvP (team-aware; teammates never damage each other)
    }

    const cb = this._onStart;
    this.hide();
    if (cb) cb(cfg);
  },

  hide() { const m = document.getElementById('arena-prelaunch-modal'); if (m) m.style.display = 'none'; },
};

if (typeof window !== 'undefined') window.ARENA_PRELAUNCH = ARENA_PRELAUNCH;
