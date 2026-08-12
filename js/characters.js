// ══════════════════════════════════════════════════════════════════════════
// CHARACTERS — the system character roster (Custom Sprites, Phase 1).
//
// A character is ENGINE-AGNOSTIC DATA: a set of accessory feature flags + a
// default colour palette + which views it supports. Both renderers consume the
// SAME record — the overhead engine (drawOverheadPlayer) and the side-scroll
// engine (player.js) each interpret `feat` to layer accessories onto the shared
// moving body, so every character inherits every animation (walk, double-jump,
// edge climb, pipe crawl, melee…) for free.
//
// Player colour choice still flows through PLAYER_LOOKS; a character's `pal` is
// only the DEFAULT used until a player recolours. System characters support BOTH
// views; a future player-made character may support side-scroll only, overhead
// only, or both (views flags), and the engine simply won't offer it in a mode it
// wasn't built for.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var BOTH = { side: true, top: true };

  // feat flags (read by both renderers): dome, pack, emblem, helm, plume, shield, cap, vest, cape,
  // mask, wrap, band, bighead, bigeyes, antennae, antenna, visor, bolts, earsTri, earsRound, tail,
  // tailBush, snout, whisk, crest, hat, beard, staff, bandana, patch, sash, fedora, scarf, wings, stripes.
  var LIST = [
    { id: 'classic',  name: 'Classic',   theme: 'Original',  body: 'boy',  views: BOTH, feat: {},
      pal: { skin: '#f4c78a', hair: '#7d4e1a', shirt: '#3f74c4', pants: '#2c5f8a', accent: '#ffd24a' } },
    { id: 'astro',    name: 'Astronaut', theme: 'Space',     body: 'boy',  views: BOTH, feat: { dome: 1, pack: 1, emblem: 1 },
      pal: { skin: '#f4c78a', hair: '#3a2a1a', shirt: '#eef1f8', pants: '#c9d3e6', accent: '#ff8c00' } },
    { id: 'knight',   name: 'Knight',    theme: 'Fantasy',   body: 'boy',  views: BOTH, feat: { helm: 1, plume: 1, shield: 1 },
      pal: { skin: '#e0b083', hair: '#8a8f9c', shirt: '#9aa3b2', pants: '#5b6270', accent: '#d64545' } },
    { id: 'ranger',   name: 'Ranger',    theme: 'Military',  body: 'boy',  views: BOTH, feat: { cap: 1, vest: 1 },
      pal: { skin: '#c68642', hair: '#3a2a1a', shirt: '#5a6b3a', pants: '#3f4a2a', accent: '#c0870f' } },
    { id: 'hero',     name: 'Super',     theme: 'Hero',      body: 'boy',  views: BOTH, feat: { cape: 1, mask: 1, emblem: 1 },
      pal: { skin: '#f4c78a', hair: '#2a2a2a', shirt: '#d64545', pants: '#294a80', accent: '#ffd24a' } },
    { id: 'ninja',    name: 'Ninja',     theme: 'Stealth',   body: 'boy',  views: BOTH, feat: { wrap: 1, band: 1 },
      pal: { skin: '#e0b083', hair: '#1c1c1c', shirt: '#26262e', pants: '#161616', accent: '#d64545' } },
    { id: 'alien',    name: 'Zib',       theme: 'Alien',     body: 'boy',  views: BOTH, feat: { bighead: 1, bigeyes: 1, antennae: 1 },
      pal: { skin: '#7ad0a8', hair: '#4aa07c', shirt: '#b56bde', pants: '#6a3f8a', accent: '#eaff6b' } },
    { id: 'robot',    name: 'Bolt',      theme: 'Robot',     body: 'boy',  views: BOTH, feat: { visor: 1, antenna: 1, bolts: 1 },
      pal: { skin: '#c9d3e6', hair: '#9aa3b2', shirt: '#7f8aa0', pants: '#4a5162', accent: '#37c6bd' } },
    { id: 'cat',      name: 'Whiskers',  theme: 'Animal',    body: 'boy',  views: BOTH, feat: { earsTri: 1, tail: 1, snout: 1, whisk: 1 },
      pal: { skin: '#f0c419', hair: '#e0a800', shirt: '#f0a83a', pants: '#c07a1a', accent: '#ffffff' } },
    { id: 'fox',      name: 'Ember Fox', theme: 'Animal',    body: 'boy',  views: BOTH, feat: { earsTri: 1, tailBush: 1, snout: 1 },
      pal: { skin: '#e07030', hair: '#c85a1e', shirt: '#e07030', pants: '#8a3a12', accent: '#ffffff' } },
    { id: 'dino',     name: 'Rex',       theme: 'Animal',    body: 'boy',  views: BOTH, feat: { crest: 1, tailBush: 1, snout: 1 },
      pal: { skin: '#5aa84a', hair: '#3f8a34', shirt: '#5aa84a', pants: '#3a6e30', accent: '#f0c419' } },
    { id: 'bear',     name: 'Bruin',     theme: 'Animal',    body: 'boy',  views: BOTH, feat: { earsRound: 1, snout: 1 },
      pal: { skin: '#9a6a3a', hair: '#7a5028', shirt: '#8a5a2b', pants: '#5e3c1c', accent: '#f4c78a' } },
    { id: 'wizard',   name: 'Wizard',    theme: 'Fantasy',   body: 'boy',  views: BOTH, feat: { hat: 1, beard: 1, staff: 1 },
      pal: { skin: '#e0b083', hair: '#dddddd', shirt: '#4a2d6b', pants: '#2e1c44', accent: '#ffd24a' } },
    { id: 'pirate',   name: 'Corsair',   theme: 'Adventure', body: 'boy',  views: BOTH, feat: { bandana: 1, patch: 1, sash: 1 },
      pal: { skin: '#c68642', hair: '#2a2a2a', shirt: '#7a2d2d', pants: '#3a2a1a', accent: '#f0c419' } },
    { id: 'scout',    name: 'Scout',     theme: 'Adventure', body: 'boy',  views: BOTH, feat: { fedora: 1, scarf: 1, pack: 1 },
      pal: { skin: '#e0b083', hair: '#5a3d22', shirt: '#8a7a4a', pants: '#5a4a2a', accent: '#d64545' } },
    { id: 'bee',      name: 'Buzz',      theme: 'Bug',       body: 'boy',  views: BOTH, feat: { antennae: 1, wings: 1, stripes: 1 },
      pal: { skin: '#f0c419', hair: '#2a2a2a', shirt: '#f0c419', pants: '#2a2a2a', accent: '#eef1f8' } },
    // §Phase B — line-stick render mode: `stick` swaps the blocky body for thin limbs + a circle head,
    // drawn between the SAME animation joints so it animates through every move. `skirt` adds the classic
    // triangle-dress silhouette. Cosmetic only (same hitbox). The palette's `shirt` is the line colour, so
    // a creator can recolour the whole figure; `accent` is the eye.
    { id: 'stick',    name: 'Stick',     theme: 'Line',      body: 'boy',  views: BOTH, feat: { stick: 1 },
      pal: { skin: '#1c1f26', hair: '#1c1f26', shirt: '#1c1f26', pants: '#1c1f26', accent: '#eef1f8' } },
    { id: 'sketch',   name: 'Stick (Skirt)', theme: 'Line',  body: 'girl', views: BOTH, feat: { stick: 1, skirt: 1 },
      pal: { skin: '#1c1f26', hair: '#1c1f26', shirt: '#1c1f26', pants: '#1c1f26', accent: '#eef1f8' } }
  ];

  var MAP = {}; LIST.forEach(function (c) { MAP[c.id] = c; });

  // ── Phase 2 — parts mixer ────────────────────────────────────────────────
  // The builder lets a creator COMPOSE a character from curated parts. Every option maps to the
  // Phase-1 feat flags above, so a custom character renders in BOTH engines with NO new art. Each
  // category is PICK-ONE; the chosen options' feat objects merge into the final feat. Order matters
  // only for readability — the renderers key off individual flags, not order.
  var PARTS = [
    { key: 'headgear', label: 'Head', options: [
      { id: 'none',    label: 'None',        feat: {} },
      { id: 'helm',    label: 'Knight Helm', feat: { helm: 1, plume: 1 } },
      { id: 'dome',    label: 'Space Dome',  feat: { dome: 1 } },
      { id: 'hat',     label: 'Wizard Hat',  feat: { hat: 1 } },
      { id: 'cap',     label: 'Cap',         feat: { cap: 1 } },
      { id: 'fedora',  label: 'Explorer Hat',feat: { fedora: 1 } },
      { id: 'bandana', label: 'Bandana',     feat: { bandana: 1 } },
      { id: 'mask',    label: 'Hero Mask',   feat: { mask: 1 } },
      { id: 'wrap',    label: 'Ninja Wrap',  feat: { wrap: 1, band: 1 } },
      { id: 'crest',   label: 'Dino Crest',  feat: { crest: 1 } } ] },
    { key: 'ears', label: 'Ears', options: [
      { id: 'none',      label: 'None',          feat: {} },
      { id: 'earsTri',   label: 'Pointed Ears',  feat: { earsTri: 1 } },
      { id: 'earsRound', label: 'Round Ears',    feat: { earsRound: 1 } },
      { id: 'antennae',  label: 'Antennae',      feat: { antennae: 1 } },
      { id: 'antenna',   label: 'Robot Antenna', feat: { antenna: 1, bolts: 1 } } ] },
    { key: 'face', label: 'Face', options: [
      { id: 'none',    label: 'None',      feat: {} },
      { id: 'visor',   label: 'Visor',     feat: { visor: 1 } },
      { id: 'bigeyes', label: 'Big Eyes',  feat: { bighead: 1, bigeyes: 1 } },
      { id: 'snout',   label: 'Snout',     feat: { snout: 1, whisk: 1 } },
      { id: 'patch',   label: 'Eye Patch', feat: { patch: 1 } },
      { id: 'beard',   label: 'Beard',     feat: { beard: 1 } } ] },
    { key: 'back', label: 'Back', options: [
      { id: 'none',  label: 'None',     feat: {} },
      { id: 'cape',  label: 'Cape',     feat: { cape: 1 } },
      { id: 'wings', label: 'Wings',    feat: { wings: 1 } },
      { id: 'pack',  label: 'Backpack', feat: { pack: 1 } },
      { id: 'vest',  label: 'Vest',     feat: { vest: 1 } },
      { id: 'scarf', label: 'Scarf',    feat: { scarf: 1 } },
      { id: 'sash',  label: 'Sash',     feat: { sash: 1 } } ] },
    { key: 'tail', label: 'Tail', options: [
      { id: 'none',     label: 'None',       feat: {} },
      { id: 'tail',     label: 'Cat Tail',   feat: { tail: 1 } },
      { id: 'tailBush', label: 'Bushy Tail', feat: { tailBush: 1 } } ] },
    { key: 'hand', label: 'Hand', options: [
      { id: 'none',   label: 'None',   feat: {} },
      { id: 'shield', label: 'Shield', feat: { shield: 1 } },
      { id: 'staff',  label: 'Staff',  feat: { staff: 1 } } ] },
    { key: 'pattern', label: 'Pattern', options: [
      { id: 'none',    label: 'None',   feat: {} },
      { id: 'stripes', label: 'Stripes',feat: { stripes: 1 } },
      { id: 'emblem',  label: 'Emblem', feat: { emblem: 1 } } ] }
  ];

  var DEFAULT_PAL = { skin: '#f4c78a', hair: '#7d4e1a', shirt: '#3f74c4', pants: '#2c5f8a', accent: '#ffd24a' };

  // Merge a selection {categoryKey: optionId} into a single feat object. Unknown/missing keys fall
  // back to the category's first option ('none'), so a partial selection is always safe.
  function composeFeat(sel) {
    var f = {};
    PARTS.forEach(function (cat) {
      var oid = sel && sel[cat.key];
      var opt = null;
      for (var i = 0; i < cat.options.length; i++) { if (cat.options[i].id === oid) { opt = cat.options[i]; break; } }
      if (!opt) opt = cat.options[0];
      if (opt.feat) Object.assign(f, opt.feat);
    });
    return f;
  }

  // Normalise a stored custom-character record into a full character def (feat DERIVED from sel, so
  // sel is the single source of truth the builder round-trips). Cosmetic only — no hitbox fields.
  function buildCustom(def) {
    def = def || {};
    var sel = def.sel || {};
    return {
      id: 'custom', name: def.name || 'My Character', theme: 'Custom',
      body: def.body === 'girl' ? 'girl' : 'boy', views: BOTH, custom: true, sel: sel,
      feat: composeFeat(sel),
      pal: Object.assign({}, DEFAULT_PAL, def.pal || {})
    };
  }

  var CUSTOM = null;   // the active runtime custom def (set from world_data.customCharacter on load)

  var CHARACTERS = {
    LIST: LIST,
    DEFAULT_ID: 'classic',
    PARTS: PARTS,
    DEFAULT_PALETTE: Object.assign({}, DEFAULT_PAL),
    list: function () { return LIST.slice(); },
    ids: function () { return LIST.map(function (c) { return c.id; }); },
    get: function (id) { return MAP[id] || MAP['classic']; },
    feat: function (id) { return (MAP[id] || MAP.classic).feat || {}; },
    defaultPalette: function (id) { return Object.assign({}, (MAP[id] || MAP.classic).pal); },
    supports: function (id, view) { var c = MAP[id] || MAP.classic; return !!(c.views && c.views[view]); },
    // Phase 2 — mixer API
    composeFeat: composeFeat,
    buildCustom: buildCustom,
    // Install (or clear) the active custom character. Registers it under id 'custom' so the EXISTING
    // get/feat/defaultPalette/supports paths resolve it with no renderer change. Pass null to clear.
    setCustom: function (def) {
      if (!def) { CUSTOM = null; delete MAP['custom']; return null; }
      CUSTOM = buildCustom(def);
      MAP['custom'] = CUSTOM;
      return CUSTOM;
    },
    getCustom: function () { return CUSTOM; },
    // Phase 3 — register a custom mix under an ARBITRARY id so several players can each run a DIFFERENT
    // custom character at once (the single 'custom' slot can only hold one). Per-player _characterId then
    // points at its own slot (e.g. 'custom_p2'). Pass null to remove. Returns the built def.
    registerCustom: function (id, def) {
      if (!id) return null;
      if (!def) { delete MAP[id]; return null; }
      var built = buildCustom(def); MAP[id] = built; return built;
    },
    isCustom: function (id) { return id === 'custom' || (typeof id === 'string' && id.indexOf('custom_') === 0); }
  };

  if (typeof window !== 'undefined') window.CHARACTERS = CHARACTERS;
  if (typeof module !== 'undefined' && module.exports) module.exports = { CHARACTERS };
})();
