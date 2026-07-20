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
