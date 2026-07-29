// ══════════════════════════════════════════════════════════════════════════
// Overhead Engine — mode RULESETS as data (§10/§11/§12). The "one engine,
// rulesets on top" philosophy, mirroring Arena's data-driven Rules Engine. This
// module is DATA + PURE helpers (headless-testable); the runtime consumes a
// ruleset to know what elements are active. TD/MOBA gameplay wiring in the
// runtime is scaffolded/partial — the DATA + the constraint math are proven here.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // Tower archetypes (§12) — starter set. Stats are illustrative.
  const TOWER_ARCHETYPES = {
    arrow:  { name: 'Arrow',   damage: 3,  range: 140, fireRate: 12, splash: 0,  cost: 50,  color: '#8a8a5a' },
    cannon: { name: 'Cannon',  damage: 9,  range: 120, fireRate: 42, splash: 40, cost: 90,  color: '#6a5a4a' },
    frost:  { name: 'Frost',   damage: 1,  range: 110, fireRate: 20, splash: 30, cost: 70,  color: '#5a8ab0', slow: 0.5 },
    support:{ name: 'Support', damage: 0,  range: 100, fireRate: 0,  splash: 0,  cost: 80,  color: '#5ab07a', buff: 1.25 },
  };

  // Ruleset "elements" bag (extends the Arena Rules-Engine idea to Overhead).
  const RULESETS = {
    platformer: { elements: { goalStars: true, scoring: true, redstone: true, combat: true, jump: true } },
    campaign:   { elements: { goalStars: true, scoring: true, redstone: true, combat: true, jump: true } },
    speedrunner:{ elements: { finish: true, checkpoints: true, ghost: true, hazards: true, jump: true } },
    arena:      { elements: { pvp: false, bots: true, waveSpawns: false, emeralds: false, hill: false, ctf: false, towers: false, combat: true } },
    towerdefense: {
      elements: { towers: true, waveSpawns: true, emeralds: true, core: true, combat: true, mobPaths: 'fixed' },
      towerArchetypes: ['arrow', 'cannon', 'frost', 'support'],
      // Two-tier placement (§12): global defaults, per-type overrides.
      placement: { global: { minSpacing: 1, minDistanceFromPath: 0, allowedElevations: null },
                   perType: { support: { minDistanceFromPath: 0 }, /* a 'floating' type could ignore rules */ } },
      lives: 20,   // core HP
    },
    moba: {
      elements: { teams: 2, lanes: 3, cores: true, minions: true, towers: true, combat: true, mobPaths: 'fixed-then-roam' },
      minion: { spawnEvery: 600, perWave: 4, roams: true, targetPriority: ['minion', 'player', 'tower', 'core'] },
    },
  };

  const get = (mode) => RULESETS[String(mode || '').toLowerCase()] || RULESETS.platformer;
  const hasElement = (mode, el) => !!(get(mode).elements || {})[el];

  // ── Tower placement — two-tier constraint check (§12) ───────────────────────
  // Never per-instance: a tower TYPE may override the world's global defaults
  // (e.g. a 'floating' type ignoring distance-from-path). Returns {ok, reason}.
  //   ctx = { existingTowers:[{col,row,type}], pathCells:Set<"c,r">, elevationAt(c,r) }
  function towerPlacementAllowed(ruleset, towerType, col, row, ctx) {
    ctx = ctx || {};
    const pcfg = (ruleset && ruleset.placement) || { global: {}, perType: {} };
    const rules = Object.assign({}, pcfg.global || {}, (pcfg.perType && pcfg.perType[towerType]) || {});
    // Spacing vs existing towers. minSpacing = minimum EMPTY cells required
    // between towers (Chebyshev): 0 = adjacent allowed, 1 = need a 1-cell gap.
    const minSpace = rules.minSpacing != null ? rules.minSpacing : 0;
    for (const t of (ctx.existingTowers || [])) {
      const cheb = Math.max(Math.abs(t.col - col), Math.abs(t.row - row));
      if (cheb === 0) return { ok: false, reason: 'occupied' };
      if (cheb <= minSpace) return { ok: false, reason: 'too-close' };
    }
    // Distance from the mob path.
    const minPath = rules.minDistanceFromPath != null ? rules.minDistanceFromPath : 0;
    if (minPath > 0 && ctx.pathCells) {
      for (let dr = -minPath; dr <= minPath; dr++) for (let dc = -minPath; dc <= minPath; dc++)
        if (ctx.pathCells.has((col + dc) + ',' + (row + dr))) return { ok: false, reason: 'too-near-path' };
    }
    // Cannot build ON the path.
    if (ctx.pathCells && ctx.pathCells.has(col + ',' + row)) return { ok: false, reason: 'on-path' };
    // Elevation restriction.
    if (rules.allowedElevations && ctx.elevationAt) {
      const e = ctx.elevationAt(col, row);
      if (!rules.allowedElevations.includes(e)) return { ok: false, reason: 'bad-elevation' };
    }
    return { ok: true, reason: 'ok' };
  }

  // MOBA minion target selection by priority (§10/§11).
  function pickMinionTarget(priority, candidatesByKind) {
    for (const kind of (priority || [])) {
      const list = candidatesByKind[kind];
      if (list && list.length) return { kind, target: list[0] };
    }
    return null;
  }

  const OH_MODES = {
    TOWER_ARCHETYPES, RULESETS, get, hasElement,
    towerPlacementAllowed, pickMinionTarget,
  };

  if (typeof window !== 'undefined') window.OH_MODES = OH_MODES;
  if (typeof module !== 'undefined' && module.exports) module.exports = { OH_MODES };
})();
