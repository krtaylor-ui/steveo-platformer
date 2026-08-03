// ══════════════════════════════════════════════════════════════════════════
// Overhead Engine — building taxonomy (§6). PURE data + a registry, headless
// testable. Every building TYPE is a schema entry, not bespoke code — the fix
// for the historical ad-hoc-portal pattern. New types = new registry entries.
//
//   Building type = {
//     id, category, footprint:{w,h}, blocksMovement,
//     interactionType: 'enter' | 'interact-on-approach' | 'passive-visual',
//     skinVariants: [name,...]   (click-to-cycle, like decorations/Goal Stars),
//     elevationOffset,
//     onInteract: (ctx) => void   (a hook name resolved at runtime, kept as a
//                                  string id here so the data stays serialisable)
//   }
// ══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const CATEGORIES = [
    'Portal', 'Healer', 'Shop', 'SavePoint', 'SpawnerBuilding',
    'Core', 'Nexus', 'Tower', 'Decoration',
  ];

  const INTERACTIONS = ['enter', 'interact-on-approach', 'passive-visual'];

  function def(id, category, opts) {
    opts = opts || {};
    return {
      id, category,
      footprint:       opts.footprint || { w: 1, h: 1 },
      blocksMovement:  opts.blocksMovement !== false,   // default true
      interactionType: INTERACTIONS.includes(opts.interactionType) ? opts.interactionType : 'passive-visual',
      skinVariants:    Array.isArray(opts.skinVariants) && opts.skinVariants.length ? opts.skinVariants : ['default'],
      elevationOffset: opts.elevationOffset || 0,
      scaleWithDensity: !!opts.scaleWithDensity,   // footprint grows with map density (pipes/portals)
      onInteract:      opts.onInteract || null,   // string hook id, resolved by the runtime
      color:           opts.color || '#8a7fb0',
    };
  }

  // ── Registry — the starter set (Campaign/Adventure + TD/MOBA cores) ─────────
  const REGISTRY = {};
  const register = (d) => { REGISTRY[d.id] = d; return d; };

  // Footprints (w × h in grid cells) per Kevin's dimensions.
  register(def('portal',      'Portal',   { footprint: { w: 4, h: 1 }, scaleWithDensity: true, interactionType: 'enter', skinVariants: ['default', 'nether', 'end'], onInteract: 'teleport', color: '#7b3fb0' }));
  register(def('pipe',        'Portal',   { footprint: { w: 2, h: 2 }, scaleWithDensity: true, interactionType: 'enter', skinVariants: ['default'], onInteract: 'teleport', color: '#3fae66' }));
  register(def('healer',      'Healer',   { footprint: { w: 4, h: 4 }, interactionType: 'interact-on-approach', onInteract: 'heal', color: '#3fb07b' }));
  register(def('shop',        'Shop',     { footprint: { w: 4, h: 4 }, interactionType: 'enter', onInteract: 'shop', color: '#b0923f' }));
  register(def('savepoint',   'SavePoint',{ footprint: { w: 2, h: 2 }, blocksMovement: false, interactionType: 'interact-on-approach', onInteract: 'save', color: '#3f8cb0' }));
  register(def('spawner',     'SpawnerBuilding', { footprint: { w: 3, h: 3 }, onInteract: 'spawn', color: '#8a3f3f' }));
  register(def('core',        'Core',     { footprint: { w: 6, h: 6 }, interactionType: 'passive-visual', onInteract: 'core', color: '#c0503f' }));
  register(def('nexus',       'Nexus',    { footprint: { w: 5, h: 5 }, interactionType: 'passive-visual', onInteract: 'core', color: '#3f6dc0' }));
  register(def('tower',       'Tower',    { footprint: { w: 3, h: 3 }, interactionType: 'interact-on-approach', onInteract: 'towerUpgrade', color: '#6a6a80' }));
  register(def('statue',      'Decoration',{ footprint: { w: 2, h: 2 }, interactionType: 'passive-visual', color: '#9a9a9a' }));

  const get = (id) => REGISTRY[id] || null;
  const all = () => Object.values(REGISTRY);
  const byCategory = (cat) => all().filter((d) => d.category === cat);

  // Instance factory — a placed building on the map.
  function place(typeId, col, row, opts) {
    const t = get(typeId);
    if (!t) return null;
    opts = opts || {};
    return {
      typeId, col: col | 0, row: row | 0,
      level:   opts.level | 0 || 0,
      skin:    opts.skin || t.skinVariants[0],
      config:  opts.config || {},   // per-instance data (teleport dest, tower type, etc.)
    };
  }
  // Cycle a placed building's skin (click-to-cycle, mirrors decorations).
  function cycleSkin(inst) {
    const t = get(inst.typeId); if (!t) return inst;
    const i = t.skinVariants.indexOf(inst.skin);
    inst.skin = t.skinVariants[(i + 1) % t.skinVariants.length];
    return inst;
  }
  // Cells a placed building occupies (for collision / overlap checks).
  // Effective footprint. Portals/pipes (scaleWithDensity) grow with the map DENSITY so they
  // stay proportional to the player at any density (a 2×2 pipe becomes 4×4 at density 4).
  function footprintOf(typeId, density) {
    const t = get(typeId); if (!t) return { w: 1, h: 1 };
    const fp = t.footprint;
    if (t.scaleWithDensity) { const d = Math.max(1, Math.round(density || 1)); return { w: Math.max(fp.w, d), h: Math.max(fp.h, d) }; }
    return { w: fp.w, h: fp.h };
  }
  function footprintCells(inst, density) {
    const fp = footprintOf(inst.typeId, density), out = [];
    for (let dy = 0; dy < fp.h; dy++)
      for (let dx = 0; dx < fp.w; dx++) out.push({ col: inst.col + dx, row: inst.row + dy });
    return out;
  }

  const OH_BUILDINGS = {
    CATEGORIES, INTERACTIONS, REGISTRY,
    def, register, get, all, byCategory,
    place, cycleSkin, footprintCells, footprintOf,
  };

  if (typeof window !== 'undefined') window.OH_BUILDINGS = OH_BUILDINGS;
  if (typeof module !== 'undefined' && module.exports) module.exports = { OH_BUILDINGS };
})();
