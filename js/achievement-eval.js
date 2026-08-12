// §Epic D — per-level Achievements: the pure, headless-testable evaluator. Creators define up to 3
// per-level achievements from parameterized TEMPLATES (stored in world_data.achievements[], migration-free);
// a client evaluator tracks the trigger stats during play and fires the satisfied ones on level completion.
// Persistence of the unlock ledger is DB-gated (player_achievements.world_id) — the SQL is applied, so the
// server route can record unlocks; the evaluator here is engine-agnostic and needs no DB.
const ACHIEVEMENT_EVAL = {
  // Template catalogue — id, label builder, and the predicate over a `stats` snapshot.
  TEMPLATES: {
    collect:   { label: (d) => `Collect ${d.count} ${d.item || 'items'}`,     test: (d, s) => (s.collected && s.collected[d.item] || 0) >= d.count },
    defeat:    { label: (d) => `Defeat ${d.count} enemies`,                    test: (d, s) => (s.mobKills || 0) >= d.count },
    time:      { label: (d) => `Finish within ${d.seconds}s`,                  test: (d, s) => s.completed && (s.completionMs || Infinity) <= d.seconds * 1000 },
    nojump:    { label: (d) => `Finish with ${d.max} jumps or fewer`,          test: (d, s) => s.completed && (s.jumpCount || 0) <= d.max },
    nodamage:  { label: (d) => `Take no hazard damage`,                        test: (d, s) => s.completed && !s.tookHazardDamage },
  },

  // Human label for a definition (falls back to a stored custom name).
  label(def) {
    if (!def) return '';
    if (def.name) return def.name;
    const t = this.TEMPLATES[def.type];
    return t ? t.label(def) : (def.type || 'Achievement');
  },

  // Is one achievement definition satisfied by the play stats? Unknown types never fire.
  satisfied(def, stats) {
    const t = def && this.TEMPLATES[def.type];
    return t ? !!t.test(def, stats || {}) : false;
  },

  // Given the level's up-to-3 definitions + the final play stats, return the list of satisfied ones
  // (deduped, capped at 3). Called once on level completion.
  evaluate(defs, stats) {
    if (!Array.isArray(defs)) return [];
    return defs.slice(0, 3).filter((d) => this.satisfied(d, stats));
  },

  // Stable identity for a definition — used to dedupe fires and as the persistence ledger key.
  keyOf(def) {
    if (!def) return '';
    if (def.name) return 'name:' + def.name;
    return [def.type, def.item || '', def.count || '', def.seconds || '', def.max || ''].join(':');
  },

  // A fresh per-run stats accumulator the engine updates as the player collects / kills / jumps / gets hurt.
  freshStats() { return { collected: {}, mobKills: 0, jumpCount: 0, tookHazardDamage: false, completed: false, completionMs: 0 }; },
};

if (typeof window !== 'undefined') window.ACHIEVEMENT_EVAL = ACHIEVEMENT_EVAL;
if (typeof module !== 'undefined' && module.exports) module.exports = { ACHIEVEMENT_EVAL };
