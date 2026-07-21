// ============================================================
// combos.js — Directional-attack combo strings (§Phase 7), PURE + testable
// ------------------------------------------------------------
// A DATA-DRIVEN list of combo definitions (input sequence + enable flag), not a pair of
// hardcoded special-cases — this is also the foundation for the planned player/designer-
// authored combos (FUTURE_ROADMAP §8A). Each combo has its OWN enable toggle (Kevin wants
// per-combo granularity), keyed off _worldAdvSettings[enableKey].
//
// A combo advances when successive DIRECTIONAL melee hits LAND (any valid target keeps it
// alive — Q4). Landing a hit in-sequence removes the between-swing cooldown so the player
// chains faster (they are NOT invulnerable). Completing the full sequence fires a finisher
// (knock the target onto its back — reuses the slide-launch spin). Depends on Phase 6.
//
// Directions match Game._meleeDirection: 'forward' | 'back' | 'up' | 'down' | 'neutral'.
// The matcher is pure so the state machine is unit-tested headless (test-combos.js).
// ============================================================

function _arrEq(a, b) { return a.length === b.length && a.every((v, i) => v === b[i]); }
function _isPrefix(seq, full) { return seq.length <= full.length && seq.every((v, i) => v === full[i]); }

const COMBOS = {
  // The two built-in combos for this session (both finishers reuse the slide-launch toss).
  DEFS: [
    { id: 'risingStrike', name: 'Rising Strike', seq: ['forward', 'forward', 'up'],  enableKey: 'comboRisingStrike' },
    { id: 'sweepSlam',    name: 'Sweep Slam',    seq: ['back', 'back', 'down'],       enableKey: 'comboSweepSlam' },
  ],

  // Enabled combos for a world (each toggled independently).
  enabled(aws) { return this.DEFS.filter((d) => aws && aws[d.enableKey]); },

  // ── Custom (player/designer-authored) combos — §Combo Creator ──────────────
  // Stored in localStorage so authored combos persist and are testable in the Combo
  // Trainer. Each: { id, name, seq:[dirs], effect } (effect is future-facing; the
  // finisher currently reuses the slide-launch toss). The matcher is unchanged — it
  // takes whatever `defs` list it's given, so custom combos "just work".
  STORAGE_KEY: 'steveo_custom_combos',
  customList: [],
  _loaded: false,
  loadCustom() {
    if (this._loaded) return this.customList;
    this._loaded = true;
    try {
      const raw = (typeof localStorage !== 'undefined') && localStorage.getItem(this.STORAGE_KEY);
      if (raw) { const a = JSON.parse(raw); if (Array.isArray(a)) this.customList = a.filter((d) => d && Array.isArray(d.seq) && d.seq.length); }
    } catch (e) { this.customList = []; }
    return this.customList;
  },
  saveCustom() { try { if (typeof localStorage !== 'undefined') localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.customList)); } catch (e) {} },
  addCustom(def) {
    this.loadCustom();
    const id = 'custom_' + (this.customList.reduce((m, d) => Math.max(m, +(String(d.id).replace(/\D/g, '')) || 0), 0) + 1);
    const entry = { id, name: def.name || 'Custom Combo', seq: def.seq.slice(), effect: def.effect || 'launch', custom: true };
    this.customList.push(entry); this.saveCustom();
    return entry;
  },
  removeCustom(id) { this.loadCustom(); this.customList = this.customList.filter((d) => d.id !== id); this.saveCustom(); },

  // Every combo available in the Combo Trainer: built-ins + custom (all playable there,
  // regardless of per-world enable toggles).
  trainerDefs() { this.loadCustom(); return [...this.DEFS, ...this.customList]; },

  // Classify a NEW landed hit `dir` given the running sequence `prevSeq` and the enabled
  // defs. Returns { seq, status, def }:
  //   'finish'   — this hit completes `def` (seq resets to []); fire the finisher.
  //   'progress' — the running sequence is a live prefix of `def`; keep chaining.
  //   'none'     — the hit doesn't extend or start any combo (seq resets to []).
  advance(prevSeq, dir, defs) {
    const seq = [...(prevSeq || []), dir];
    for (const d of defs) if (_arrEq(seq.slice(-d.seq.length), d.seq)) return { seq: [], status: 'finish', def: d };
    for (const d of defs) if (_isPrefix(seq, d.seq)) return { seq, status: 'progress', def: d };
    // The hit broke the chain — but it might START a (possibly different) combo.
    for (const d of defs) if (d.seq[0] === dir) return { seq: [dir], status: 'progress', def: d };
    return { seq: [], status: 'none', def: null };
  },
};

if (typeof window !== 'undefined') window.COMBOS = COMBOS;
if (typeof module !== 'undefined' && module.exports) module.exports = { COMBOS };
