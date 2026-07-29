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
      onInteract:      opts.onInteract || null,   // string hook id, resolved by the runtime
      color:           opts.color || '#8a7fb0',
    };
  }

  // ── Registry — the starter set (Campaign/Adventure + TD/MOBA cores) ─────────
  const REGISTRY = {};
  const register = (d) => { REGISTRY[d.id] = d; return d; };

  register(def('portal',      'Portal',   { footprint: { w: 2, h: 2 }, interactionType: 'enter', skinVariants: ['nether', 'end', 'plain'], onInteract: 'teleport', color: '#7b3fb0' }));
  register(def('healer',      'Healer',   { footprint: { w: 2, h: 2 }, interactionType: 'interact-on-approach', onInteract: 'heal', color: '#3fb07b' }));
  register(def('shop',        'Shop',     { footprint: { w: 2, h: 2 }, interactionType: 'enter', onInteract: 'shop', color: '#b0923f' }));
  register(def('savepoint',   'SavePoint',{ footprint: { w: 1, h: 1 }, blocksMovement: false, interactionType: 'interact-on-approach', onInteract: 'save', color: '#3f8cb0' }));
  register(def('spawner',     'SpawnerBuilding', { footprint: { w: 2, h: 2 }, onInteract: 'spawn', color: '#8a3f3f' }));
  register(def('core',        'Core',     { footprint: { w: 3, h: 3 }, interactionType: 'passive-visual', onInteract: 'core', color: '#c0503f' }));
  register(def('nexus',       'Nexus',    { footprint: { w: 3, h: 3 }, interactionType: 'passive-visual', onInteract: 'core', color: '#3f6dc0' }));
  register(def('tower',       'Tower',    { footprint: { w: 1, h: 1 }, interactionType: 'interact-on-approach', onInteract: 'towerUpgrade', color: '#6a6a80' }));
  register(def('statue',      'Decoration',{ footprint: { w: 1, h: 1 }, interactionType: 'passive-visual', color: '#9a9a9a' }));

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
  function footprintCells(inst) {
    const t = get(inst.typeId); if (!t) return [];
    const out = [];
    for (let dy = 0; dy < t.footprint.h; dy++)
      for (let dx = 0; dx < t.footprint.w; dx++) out.push({ col: inst.col + dx, row: inst.row + dy });
    return out;
  }

  const OH_BUILDINGS = {
    CATEGORIES, INTERACTIONS, REGISTRY,
    def, register, get, all, byCategory,
    place, cycleSkin, footprintCells,
  };

  if (typeof window !== 'undefined') window.OH_BUILDINGS = OH_BUILDINGS;
  if (typeof module !== 'undefined' && module.exports) module.exports = { OH_BUILDINGS };
})();
